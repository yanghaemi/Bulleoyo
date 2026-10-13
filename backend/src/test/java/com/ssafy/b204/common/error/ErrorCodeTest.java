package com.ssafy.b204.common.error;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

/**
 * {@link ErrorCode}가 규격 v3 §3과 어긋나지 않는지 지킨다.
 *
 * <p>스프링 컨텍스트를 띄우지 않는 순수 단위 테스트다 — Testcontainers 없이 돌아야 하고,
 * 그래야 CI에서 이 검사가 가장 먼저 깨진다.
 */
class ErrorCodeTest {

    /**
     * 규격 v3 §3.1~§3.16의 코드 개수. 코드를 추가·삭제하면 규격 문서도 함께 고쳐야 한다.
     *
     * <p>84 → 85: {@code RULE_SYNC_IN_PROGRESS}(S15P21B204-70 · 리뷰 !80 🟡 4). 규격 v2 §3.6에
     * 같이 넣었다. 85 → 86: {@code AUTH_SIGNUP_REQUIRED}(로그인·가입 2단계 흐름).
     * 86 → 88: {@code WALLET_BALANCE_INSUFFICIENT} · {@code PERFORMANCE_RULES_REQUIRED}
     * (S15P21B204-151). API-performance-13 의 {@code COMMON_CONFLICT} 세 원인을 갈랐다.
     * 88 → 89: {@code TEAM_HAS_ACTIVE_PERFORMANCE}(API-team-05 팀 해산 차단 — 진행 중 공연·
     * 미반환 보증금·미정산). 규격 §3.5에 함께 올릴 것.
     * 89 → 95: {@code FILE_*} 6개(이미지 업로드 신설 — 2026-09-22). 크기·형식·해상도·미존재·
     * 용도 불일치·중복 바인딩이 각각 화면에서 다른 행동을 낳아 하나로 묶을 수 없다.
     * 규격 §3.17 + API v7 파일 절에 함께 올릴 것.
     * 95 → 97: {@code WEBAUTHN_STEP_UP_REQUIRED} · {@code WEBAUTHN_VERIFICATION_FAILED}
     * (규격 §3.18) — 결제 전 패스키 본인 확인(API v7 §7.W, 2026-09-24).
     */
    private static final int SPEC_CODE_COUNT = 97;

    /**
     * 규격 §1이 정한 HTTP status 목록. 여기 없는 status를 쓰면 클라이언트의 성공/실패 판정과
     * 어긋날 수 있다.
     */
    private static final Set<HttpStatus> ALLOWED_STATUSES = Set.of(
            HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN,
            HttpStatus.NOT_FOUND, HttpStatus.CONFLICT, HttpStatus.GONE,
            // 413 — FILE_TOO_LARGE(2026-09-22). 규격 §1 목록에 없던 status 다. 업로드는 400 으로
            // 뭉개면 안 된다: 브라우저·Nginx 가 이미 본문 상한 초과를 413 으로 말하고 있어
            // (Nginx 10MB) 앱만 400 이면 같은 사건에 두 코드가 나간다.
            HttpStatus.PAYLOAD_TOO_LARGE,
            HttpStatus.TOO_MANY_REQUESTS, HttpStatus.INTERNAL_SERVER_ERROR,
            HttpStatus.BAD_GATEWAY, HttpStatus.GATEWAY_TIMEOUT);

    @Test
    @DisplayName("enum 에 CONFLICT 계열까지 코드 97개가 정의돼 있다 — 규격 문서는 아직 87개다")
    void hasAllSpecCodes() {
        assertThat(ErrorCode.values()).hasSize(SPEC_CODE_COUNT);
    }

    @Test
    @DisplayName("code 문자열은 상수명과 같다 — 배포된 문자열은 변경 금지 대상이다")
    void codeEqualsName() {
        for (ErrorCode code : ErrorCode.values()) {
            assertThat(code.getCode()).isEqualTo(code.name());
        }
    }

    @Test
    @DisplayName("code 는 SUCCESS 와 겹치지 않는다 — 성공 판정이 code === \"SUCCESS\" 다")
    void noCodeCollidesWithSuccess() {
        assertThat(Arrays.stream(ErrorCode.values()).map(ErrorCode::getCode))
                .doesNotContain("SUCCESS");
    }

    @Test
    @DisplayName("code 는 도메인_사유 대문자 스네이크 형식이다")
    void codeFormatIsUpperSnake() {
        for (ErrorCode code : ErrorCode.values()) {
            assertThat(code.getCode()).matches("^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$");
        }
    }

    @Test
    @DisplayName("status 는 규격 §1이 정한 목록 안에 있다")
    void statusIsWithinSpec() {
        for (ErrorCode code : ErrorCode.values()) {
            assertThat(ALLOWED_STATUSES)
                    .as("%s 의 status %s", code.name(), code.getStatus())
                    .contains(code.getStatus());
        }
    }

    @Test
    @DisplayName("defaultMsg 는 비어 있지 않고 사용자에게 보여줄 수 있는 문장이다")
    void defaultMsgIsPresent() {
        for (ErrorCode code : ErrorCode.values()) {
            assertThat(code.getDefaultMsg()).as("%s 의 defaultMsg", code.name()).isNotBlank();
        }
    }

    @Test
    @DisplayName("defaultMsg 에 예시 값이 박혀 있지 않다 — 값이 필요한 문구는 호출부에서 덮는다")
    void defaultMsgHasNoHardcodedExampleValues() {
        // 규격 §3 예시에 있던 "45,000원" · "2장" · "19:12" · "2026-09-20 18:00" 같은 값이
        // 기본 문구에 남으면 모든 사용자에게 그 값이 그대로 보인다.
        for (ErrorCode code : ErrorCode.values()) {
            assertThat(code.getDefaultMsg())
                    .as("%s 의 defaultMsg 에 구체적 숫자 값이 박혀 있다", code.name())
                    .doesNotMatch(".*\\d{1,3},\\d{3}.*")   // 45,000
                    .doesNotMatch(".*\\d{1,2}:\\d{2}.*")   // 19:12
                    .doesNotMatch(".*\\d{4}-\\d{2}-\\d{2}.*"); // 2026-09-20
        }
    }

    @Test
    @DisplayName("도메인 접두가 API v6 §0.11의 목록과 일치한다")
    void prefixesMatchDomainList() {
        Set<String> prefixes = Arrays.stream(ErrorCode.values())
                .map(c -> c.name().substring(0, c.name().indexOf('_')))
                .collect(Collectors.toSet());

        assertThat(prefixes).containsExactlyInAnyOrder(
                // §0.11 도메인 접두
                "COMMON", "AUTH", "WALLET", "PERFORMANCE", "TEAM", "RULE", "TICKET",
                "PAYMENT", "COIN", "CHAIN", "REFUND", "ENTRY", "SETTLEMENT",
                // §3.17 신설 — 이미지 업로드(API v7). §0.11 도메인 목록에도 함께 올릴 것
                "FILE",
                // §3.18 신설 — 결제 전 패스키 본인 확인(API v7 §7.W, 2026-09-24)
                "WEBAUTHN",
                // v6에서 발생 경로가 0이 된 계열(계약 보존용)
                "TRANSFER", "REDEEM",
                // §3.16 확장 기능(P1/P2)
                "EXCHANGE", "RESALE", "NFT");
    }

    @Test
    @DisplayName("toException 은 코드와 기본 문구를 그대로 옮긴다")
    void toExceptionCarriesCodeAndMsg() {
        BusinessException e = ErrorCode.TICKET_SOLD_OUT.toException();

        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.TICKET_SOLD_OUT);
        assertThat(e.getMsg()).isEqualTo(ErrorCode.TICKET_SOLD_OUT.getDefaultMsg());
    }

    @Test
    @DisplayName("toException(msg) 는 기본 문구를 덮는다 — 금액·시각을 넣는 경로다")
    void toExceptionOverridesMsg() {
        BusinessException e = ErrorCode.TICKET_PURCHASE_LIMIT_EXCEEDED
                .toException("1인당 최대 2장까지 구매할 수 있습니다.");

        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.TICKET_PURCHASE_LIMIT_EXCEEDED);
        assertThat(e.getMsg()).isEqualTo("1인당 최대 2장까지 구매할 수 있습니다.");
    }
}
