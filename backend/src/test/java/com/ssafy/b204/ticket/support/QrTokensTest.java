package com.ssafy.b204.ticket.support;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Nested;

/**
 * 동적 QR 토큰의 발급(API-ticket-06)과 검증(API-entry-01)이 <b>대칭</b>인지 고정한다.
 *
 * <p>컨테이너가 필요 없다 — HMAC 계산과 윈도우 산술만 본다. 검표 판정이 1초 예산 안에서 돌아야
 * 하는 순수 계산 구간이라 통합 테스트로 감싸면 회귀를 늦게 발견한다.
 */
class QrTokensTest {

    private static final String SECRET = "0123456789abcdef0123456789abcdef";

    /** 30초 윈도우의 한가운데. 경계 산술이 초 단위로 흔들리지 않게 고정 시각을 쓴다. */
    private static final Instant NOW = Instant.ofEpochSecond(1_789_000_015L);

    @Test
    @DisplayName("토큰 형식은 {ticketId}.{window}.{서명} 이고 같은 윈도우면 같은 값이다")
    void issueIsDeterministic() {
        long window = QrTokens.windowOf(NOW);
        String token = QrTokens.issue(90211L, SECRET, window);

        assertThat(token).startsWith("90211." + window + ".");
        assertThat(QrTokens.issue(90211L, SECRET, window)).isEqualTo(token);
        // 윈도우 시작 시각이 issuedAt 기준이다(발급 시각이 아니다).
        assertThat(QrTokens.windowStart(window).getEpochSecond() % QrTokens.WINDOW_SECONDS)
                .isZero();
        assertThat(NOW.getEpochSecond() - QrTokens.windowStart(window).getEpochSecond())
                .isLessThan(QrTokens.WINDOW_SECONDS);
    }

    @Test
    @DisplayName("현재·직전 윈도우는 VALID, 그 이전은 EXPIRED 다 — 유효 구간 60초")
    void acceptsTwoWindows() {
        long window = QrTokens.windowOf(NOW);

        assertThat(verdict(window, NOW)).isEqualTo(QrTokens.Verdict.VALID);
        assertThat(verdict(window - 1, NOW)).isEqualTo(QrTokens.Verdict.VALID);
        assertThat(verdict(window - 2, NOW)).isEqualTo(QrTokens.Verdict.EXPIRED);
        assertThat(verdict(window - 100, NOW)).isEqualTo(QrTokens.Verdict.EXPIRED);
        // 미래 윈도우는 서버만 만들 수 있어 정상 경로가 없다. 받아주지 않는다.
        assertThat(verdict(window + 1, NOW)).isEqualTo(QrTokens.Verdict.EXPIRED);
    }

    @Test
    @DisplayName("윈도우 경계 직전에 발급한 토큰이 경계를 넘어도 30초는 더 산다")
    void survivesWindowBoundary() {
        // 윈도우 시작이 …020 이므로 …049 는 창의 마지막 초다(다음 창이 …050 에 열린다).
        Instant justBeforeBoundary = Instant.ofEpochSecond(1_789_000_049L);
        long window = QrTokens.windowOf(justBeforeBoundary);
        assertThat(QrTokens.windowStart(window).getEpochSecond()).isEqualTo(1_789_000_020L);

        assertThat(verdict(window, justBeforeBoundary.plusSeconds(1)))
                .isEqualTo(QrTokens.Verdict.VALID);
        assertThat(verdict(window, justBeforeBoundary.plusSeconds(30)))
                .isEqualTo(QrTokens.Verdict.VALID);
        assertThat(verdict(window, justBeforeBoundary.plusSeconds(31)))
                .isEqualTo(QrTokens.Verdict.EXPIRED);
    }

    @Nested
    @DisplayName("서명 위조·형식 위반은 만료와 다른 코드다")
    class Rejections {

        @Test
        @DisplayName("서명을 한 글자 바꾸면 SIGNATURE_INVALID 다(만료가 아니다)")
        void detectsForgedSignature() {
            long window = QrTokens.windowOf(NOW);
            String token = QrTokens.issue(90211L, SECRET, window);
            String forged = token.substring(0, token.length() - 1)
                    + (token.endsWith("A") ? "B" : "A");

            assertThat(QrTokens.verify(QrTokens.parse(forged).orElseThrow(), SECRET, NOW))
                    .isEqualTo(QrTokens.Verdict.SIGNATURE_INVALID);
        }

        @Test
        @DisplayName("다른 티켓의 secret 으로는 통과하지 못한다 — 티켓별 키가 실제로 쓰인다")
        void secretIsPerTicket() {
            long window = QrTokens.windowOf(NOW);
            String token = QrTokens.issue(90211L, SECRET, window);

            assertThat(QrTokens.verify(QrTokens.parse(token).orElseThrow(),
                    "ffffffffffffffffffffffffffffffff", NOW))
                    .isEqualTo(QrTokens.Verdict.SIGNATURE_INVALID);
        }

        @Test
        @DisplayName("ticketId 를 바꿔 끼우면 서명이 깨진다 — 서명이 티켓을 묶는다")
        void ticketIdIsBoundBySignature() {
            long window = QrTokens.windowOf(NOW);
            String token = QrTokens.issue(90211L, SECRET, window);
            String swapped = "90212" + token.substring(token.indexOf('.'));

            QrTokens.Scanned scanned = QrTokens.parse(swapped).orElseThrow();
            assertThat(scanned.ticketId()).isEqualTo(90212L);
            assertThat(QrTokens.verify(scanned, SECRET, NOW))
                    .isEqualTo(QrTokens.Verdict.SIGNATURE_INVALID);
        }

        @Test
        @DisplayName("형식 위반은 파싱 단계에서 걸러진다 — 400 이고 401 이 아니다")
        void rejectsMalformed() {
            assertThat(QrTokens.parse(null)).isEmpty();
            assertThat(QrTokens.parse("")).isEmpty();
            assertThat(QrTokens.parse("90211")).isEmpty();
            assertThat(QrTokens.parse("90211.59633334")).isEmpty();
            assertThat(QrTokens.parse("90211.59633334.")).isEmpty();
            assertThat(QrTokens.parse("90211..sig")).isEmpty();
            assertThat(QrTokens.parse("abc.59633334.sig")).isEmpty();
            assertThat(QrTokens.parse("90211.abc.sig")).isEmpty();
            assertThat(QrTokens.parse("90211.59633334.sig.extra")).isEmpty();
            assertThat(QrTokens.parse("0.59633334.sig")).isEmpty();
            // 명세 Body 표의 최대 1024자를 넘기면 형식 위반이다.
            assertThat(QrTokens.parse("90211.59633334." + "A".repeat(1024))).isEmpty();
            assertThat(QrTokens.verify(null, SECRET, NOW)).isEqualTo(QrTokens.Verdict.MALFORMED);
        }
    }

    private static QrTokens.Verdict verdict(long window, Instant at) {
        String token = QrTokens.issue(90211L, SECRET, window);
        return QrTokens.verify(QrTokens.parse(token).orElseThrow(), SECRET, at);
    }
}
