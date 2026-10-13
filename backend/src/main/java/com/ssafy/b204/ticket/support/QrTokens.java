package com.ssafy.b204.ticket.support;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * 동적 QR 토큰 — API v6 §6 API-ticket-06 (TOTP 방식, SEC-06 · P-14).
 *
 * <blockquote>서버가 {@code ticket.qr_secret}과 <b>현재 30초 윈도우</b>로 HMAC-SHA256을 계산해
 * 반환한다. 클라이언트는 {@code rotateAfterMs}(30초) 주기로 재호출한다.
 * 고정 티켓번호 QR은 만들지 않는다.</blockquote>
 *
 * <p><b>DB 쓰기가 없다.</b> 토큰은 저장하지 않고 매번 계산하므로 새로고침·재발급이 자유롭고,
 * 캡처한 QR은 최대 60초 뒤 죽는다.
 *
 * <p>토큰 형식 — {@code {ticketId}.{window}.{base64url(HMAC)}}. 검표기(API-entry-01)는 앞 두 칸으로
 * 티켓을 찾고, 그 티켓의 {@code qr_secret}으로 HMAC을 다시 계산해 대조한다. 서명이 없는 값은
 * {@code ENTRY_QR_SIGNATURE_INVALID}, 윈도우가 지난 값은 {@code ENTRY_QR_EXPIRED}다.
 *
 * <p>유효 구간이 <b>60초</b>인데 윈도우가 30초인 이유 — 사용자가 화면을 띄운 순간 윈도우가 넘어갈
 * 수 있어 검표기는 <b>현재와 직전 윈도우 2개</b>를 받아야 한다. 그래서 만료 표기는 발급 시각이
 * 아니라 <b>윈도우 시작 + 60초</b>다.
 */
public final class QrTokens {

    /** TOTP 윈도우(초). {@code rotateAfterMs}와 같은 값이다. */
    public static final long WINDOW_SECONDS = 30L;

    /** 토큰 유효 구간(초) = 윈도우 2개. Redis 입장 마커 TTL({@code b204.entry.qr-ttl})과 같다. */
    public static final long VALID_SECONDS = 60L;

    public static final int ROTATE_AFTER_MS = (int) (WINDOW_SECONDS * 1000);

    /** API-entry-01 {@code qrToken} 제약(명세 Body 표) — 초과는 형식 위반이다. */
    public static final int MAX_TOKEN_LENGTH = 1024;

    private static final String ALGORITHM = "HmacSHA256";
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();

    private QrTokens() {
    }

    /** 지금 시각이 속한 윈도우 번호. */
    public static long windowOf(Instant at) {
        return at.getEpochSecond() / WINDOW_SECONDS;
    }

    /** 윈도우 시작 시각 — 응답의 {@code issuedAt} 기준이다(발급 시각이 아니다). */
    public static Instant windowStart(long window) {
        return Instant.ofEpochSecond(window * WINDOW_SECONDS);
    }

    /** {@code {ticketId}.{window}.{base64url(HMAC)}} */
    public static String issue(Long ticketId, String qrSecret, long window) {
        String payload = ticketId + "." + window;
        return payload + "." + ENCODER.encodeToString(hmac(qrSecret, payload));
    }

    /** 검표기용 — 현재/직전 윈도우 중 하나와 맞으면 참이다. */
    public static boolean matches(Long ticketId, String qrSecret, String token, Instant now) {
        return verify(parse(token).orElse(null), qrSecret, now) == Verdict.VALID;
    }

    /**
     * 검표(API-entry-01)가 <b>티켓을 찾기 전에</b> 하는 앞 두 칸 해석.
     *
     * <p>서명 대조는 {@code qr_secret}이 필요해 티켓을 읽은 뒤에만 가능하다. 그래서 파싱과 검증이
     * 두 단계로 나뉜다 — 형식이 깨진 값은 {@code COMMON_VALIDATION_FAILED}(400)이고, 형식은
     * 맞지만 서명이 틀린 값은 {@code ENTRY_QR_SIGNATURE_INVALID}(401)로 <b>다른 코드</b>다.
     */
    public static java.util.Optional<Scanned> parse(String token) {
        if (token == null || token.isBlank() || token.length() > MAX_TOKEN_LENGTH) {
            return java.util.Optional.empty();
        }
        // 정규식을 쓰지 않는다 — 토큰이 초당 30건 들어오는 경로다(PERF-03).
        int first = token.indexOf('.');
        int second = first < 0 ? -1 : token.indexOf('.', first + 1);
        if (first <= 0 || second <= first + 1 || second == token.length() - 1
                || token.indexOf('.', second + 1) >= 0) {
            return java.util.Optional.empty();
        }
        try {
            long ticketId = Long.parseLong(token.substring(0, first));
            long window = Long.parseLong(token.substring(first + 1, second));
            if (ticketId <= 0 || window <= 0) {
                return java.util.Optional.empty();
            }
            return java.util.Optional.of(new Scanned(ticketId, window, token));
        } catch (NumberFormatException e) {
            return java.util.Optional.empty();
        }
    }

    /**
     * <b>발급({@link #issue})과 완전히 대칭</b>인 검증. 토큰이 주장하는 윈도우로 HMAC을 다시
     * 계산해 <b>먼저 서명</b>을 보고, 그다음에 그 윈도우가 아직 살아 있는지를 본다.
     *
     * <p>순서가 중요하다 — 위조 토큰(서명 불일치)과 시간이 지난 토큰(서명 일치, 윈도우 경과)은
     * 현장 대응이 다르다. 서명부터 보지 않으면 위조를 전부 "만료"로 읽는다.
     *
     * <p>{@code window == current - 1}을 받아주는 이유는 관객 화면이 30초 경계에서 토큰을
     * 갱신하는 순간에도 스캔이 살아 있어야 하기 때문이다(유효 구간 60초).
     */
    public static Verdict verify(Scanned scanned, String qrSecret, Instant now) {
        if (scanned == null) {
            return Verdict.MALFORMED;
        }
        String expected = issue(scanned.ticketId(), qrSecret, scanned.window());
        if (!constantTimeEquals(expected, scanned.token())) {
            return Verdict.SIGNATURE_INVALID;
        }
        long current = windowOf(now);
        return scanned.window() == current || scanned.window() == current - 1
                ? Verdict.VALID : Verdict.EXPIRED;
    }

    /** 스캔한 토큰의 앞 두 칸. 서명 대조 전이라 <b>아직 신뢰할 수 없는 값</b>이다. */
    public record Scanned(long ticketId, long window, String token) {}

    /** 검증 판정 — 각 값이 규격 §3의 에러 코드 하나에 대응한다. */
    public enum Verdict {
        /** 서명 일치 + 현재·직전 윈도우 → 입장 처리로 넘어간다. */
        VALID,
        /** 형식 위반 → {@code COMMON_VALIDATION_FAILED}(400). */
        MALFORMED,
        /** 서명 불일치 → {@code ENTRY_QR_SIGNATURE_INVALID}(401). 캡처·복제 시도로 기록한다. */
        SIGNATURE_INVALID,
        /** 서명은 맞지만 윈도우 경과 → {@code ENTRY_QR_EXPIRED}(401). */
        EXPIRED
    }

    /** 서명 비교는 길이·내용 모두 상수 시간으로 본다(SEC — 타이밍으로 서명을 좁히지 못하게). */
    private static boolean constantTimeEquals(String expected, String actual) {
        return java.security.MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                actual.getBytes(StandardCharsets.UTF_8));
    }

    private static byte[] hmac(String qrSecret, String payload) {
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(new SecretKeySpec(qrSecret.getBytes(StandardCharsets.UTF_8), ALGORITHM));
            return mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
        } catch (java.security.GeneralSecurityException e) {
            // qr_secret 은 발급 시 서버가 만든 32바이트 hex 다. 여기 오면 JVM 구성 문제다.
            throw new IllegalStateException("QR 토큰 서명에 실패했다", e);
        }
    }
}
