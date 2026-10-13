package com.ssafy.b204.entry.service;

import com.ssafy.b204.common.config.JwtProperties;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * 검표 링크 토큰 — 발급 API-performance-10, 검증 API-entry-01·02({@code X-Entry-Token}).
 *
 * <p><b>이 토큰은 회원 세션이 아니다.</b> 검표 담당자를 회원으로 등록하지 않는다는 결정(SEC-03 ·
 * P-15)의 결과물이라, 담을 권한이 "이 공연의 검표" 하나뿐이다. 그래서 세션 JWT
 * ({@link com.ssafy.b204.common.security.JwtTokenProvider})와 <b>키 용도를 분리</b>했다 —
 * 같은 {@code b204.jwt.secret}에서 도메인 구분 문자열을 섞어 파생한 키로 서명하므로, 검표 토큰을
 * 세션 자리에 넣거나 그 반대로 넣어도 서명이 맞지 않는다.
 *
 * <p>형식 — {@code e1.{performanceId}.{version}.{expEpochSec}.{base64url(HMAC-SHA256)}}.
 * JWT를 쓰지 않은 이유는 클레임이 3개뿐이고 클라이언트가 <b>내용을 읽을 필요가 없기 때문</b>이다
 * (프론트는 받은 문자열을 헤더에 그대로 싣는다). 형식은 서버 내부 규약이며 명세는 "서명 토큰"만
 * 요구한다.
 *
 * <p><b>{@code version}이 회전 수단이다.</b> API-performance-10의 {@code rotate=true}는 Redis
 * {@code entry:link:{performanceId}}를 {@code INCR}하고, 검증은 토큰의 {@code version}이 현재
 * 값과 같은지를 본다. 링크가 새면 이전 링크를 즉시 죽여야 하는데, 토큰을 저장하지 않는 구조에서는
 * 버전 하나만 올리는 것이 가장 싸다(토큰 블랙리스트를 만들면 발급 이력을 보관해야 한다).
 *
 * <p>실패는 원인을 가리지 않고 모두 {@code ENTRY_SCANNER_NOT_AUTHORIZED}(403)다 — 만료를
 * 구분하는 {@code ENTRY_LINK_EXPIRED}는 §16.1 신설 제안이라 본문에서 쓰지 않는다.
 */
@Component
@RequiredArgsConstructor
public class EntryLinkTokens {

    /** {@code entry:link:{performanceId}} — 현재 토큰 버전. §0.12에 없는 신설 키(보강 제안 대상). */
    public static final String KEY_PREFIX = "entry:link:";

    /** 형식 버전. 토큰 구조가 바뀌면 올린다 — 옛 토큰이 조용히 통과하지 않게 한다. */
    private static final String FORMAT = "e1";

    /** 세션 JWT와 키 용도를 가르는 도메인 구분자. */
    private static final String KEY_DOMAIN = "b204/entry-link";

    private static final String ALGORITHM = "HmacSHA256";
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();

    private final JwtProperties jwtProperties;
    private final StringRedisTemplate redis;

    /**
     * 현재 버전 <b>읽기 전용</b>. 값이 없으면 1로 본다.
     *
     * <p>검증 경로(초당 30건)가 Redis에 쓰지 않게 하려고 발급과 갈랐다 — 존재하지 않는
     * {@code performanceId}로 검증을 시도해도 키가 생기지 않는다.
     */
    public long currentVersion(Long performanceId) {
        try {
            String stored = redis.opsForValue().get(KEY_PREFIX + performanceId);
            return stored == null ? 1L : Long.parseLong(stored);
        } catch (RuntimeException e) {
            // 값이 깨졌거나 Redis 장애 — 1로 본다. 회전했던 링크는 무효가 되고(fail closed) 다시 받는다.
            return 1L;
        }
    }

    /**
     * 발급용 버전. {@code rotate}면 올리고, 아니면 현재 값을 쓰되 <b>없으면 1로 만든다</b> —
     * 첫 발급이 곧 버전 생성이며 그때만 감사 로그 대상이다(SEC-11).
     */
    public Version issueVersion(Long performanceId, boolean rotate) {
        String key = KEY_PREFIX + performanceId;
        if (rotate) {
            Long next = redis.opsForValue().increment(key);
            return new Version(next == null ? 1L : next, true);
        }
        Boolean created = redis.opsForValue().setIfAbsent(key, "1");
        return new Version(currentVersion(performanceId), Boolean.TRUE.equals(created));
    }

    /** {@code e1.{performanceId}.{version}.{exp}.{sig}} */
    public String issue(Long performanceId, long version, Instant expiresAt) {
        String payload = FORMAT + "." + performanceId + "." + version + "."
                + expiresAt.getEpochSecond();
        return payload + "." + ENCODER.encodeToString(hmac(payload));
    }

    /**
     * 헤더·쿼리로 받은 토큰이 <b>이 공연의 유효한 검표 토큰</b>인지 본다.
     *
     * <p>순서 — 형식 → 서명 → 만료 → 공연 일치 → 버전. 서명을 먼저 보는 이유는 서명이 틀린
     * 토큰의 다른 필드는 공격자가 적은 값이라 신뢰할 수 없기 때문이다.
     */
    public boolean isValidFor(String token, Long performanceId) {
        if (token == null || token.isBlank() || performanceId == null) {
            return false;
        }
        int lastDot = token.lastIndexOf('.');
        if (lastDot <= 0) {
            return false;
        }
        String payload = token.substring(0, lastDot);
        if (!MessageDigest.isEqual(issuePayloadSignature(payload).getBytes(StandardCharsets.UTF_8),
                token.substring(lastDot + 1).getBytes(StandardCharsets.UTF_8))) {
            return false;
        }
        String[] parts = payload.split("\\.");
        if (parts.length != 4 || !FORMAT.equals(parts[0])) {
            return false;
        }
        try {
            long tokenPerformanceId = Long.parseLong(parts[1]);
            long version = Long.parseLong(parts[2]);
            long expiresAt = Long.parseLong(parts[3]);
            if (Instant.now().getEpochSecond() > expiresAt) {
                return false;
            }
            if (tokenPerformanceId != performanceId) {
                return false;
            }
            return version == currentVersion(performanceId);
        } catch (NumberFormatException e) {
            return false;
        }
    }

    /** 한도(SEC-10)를 토큰 단위로 세기 위한 식별자. 토큰 원문을 키에 넣지 않는다. */
    public String fingerprint(String token) {
        return token == null ? null : ENCODER.encodeToString(hmac("fp." + token)).substring(0, 16);
    }

    private String issuePayloadSignature(String payload) {
        return ENCODER.encodeToString(hmac(payload));
    }

    private byte[] hmac(String payload) {
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(new SecretKeySpec(
                    (jwtProperties.secret() + KEY_DOMAIN).getBytes(StandardCharsets.UTF_8),
                    ALGORITHM));
            return mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
        } catch (java.security.GeneralSecurityException e) {
            throw new IllegalStateException("검표 토큰 서명에 실패했다", e);
        }
    }

    /** @param created 이번 호출이 버전을 새로 만들거나 올렸는가(감사 로그 대상 판단) */
    public record Version(long value, boolean created) {}
}
