package com.ssafy.b204.webauthn;

import static com.ssafy.b204.webauthn.PerformerStepUpSupport.codeOf;
import static com.ssafy.b204.webauthn.PerformerStepUpSupport.principal;
import static com.ssafy.b204.webauthn.PerformerStepUpSupport.withIdempotencyKey;
import static org.assertj.core.api.Assertions.assertThat;

import com.ssafy.b204.chain.dto.ChainDtos.SignedTxRequest;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.performance.service.PerformanceService;
import com.ssafy.b204.rule.dto.RuleDtos.AgreeSignedTxRequest;
import com.ssafy.b204.rule.service.RuleService;
import com.ssafy.b204.settlement.FakeSettlementChainReader;
import com.ssafy.b204.settlement.SettlementTestFixture;
import com.ssafy.b204.settlement.repository.SettlementChainJobRepository;
import com.ssafy.b204.settlement.service.SettlementConfirmationService;
import com.ssafy.b204.settlement.service.SettlementService;
import com.ssafy.b204.support.IntegrationTestBase;
import com.ssafy.b204.webauthn.service.StepUpAction;
import com.ssafy.b204.webauthn.service.StepUpTokenService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.context.request.RequestContextHolder;

/**
 * 공연자 동작 4개의 본인 확인 가드 — <b>스위치 켜짐</b>(API v7 §7.W, 결정 v2 §14-41).
 *
 * <p>고정하는 것은 셋이다.
 * <ol>
 *   <li>동작마다 — 토큰 없음 403 · 맞는 범위 토큰은 통과(가드 다음의 기존 검사 결과가 나온다).
 *   <li>교차 동작 — 다른 동작에 발급된 토큰은 403. 범위는 회원 + 동작 + 대상이다.
 *   <li>소유·권한 선행 — 남의 공연에 들어온 요청은 가드보다 먼저 막히고 <b>토큰을 태우지 않는다.</b>
 * </ol>
 *
 * <p>가드 통과는 "403 이 아니고 토큰이 범위 키에 묶였다"로 판정한다. 체인 전송 이후는 스위치 꺼짐의
 * 기존 흐름 테스트가 지킨다(가드는 그 앞 한 줄이다).
 */
@TestPropertySource(properties = {
        "b204.webauthn.enabled=true",
        "b204.chain.contract.yoyo-address=0xA5d7031D70DAab33EACDfC912baC0668D5776e5b",
        "b204.chain.contract.splitter-address=0xa1ca24ECD6adCd29a8998031fd52Cf17F9541738",
        "b204.chain.operator-address=0xfbB324CC674dD2FF21Dff670404391e78F4a199f"
})
class PerformerStepUpGuardTest extends IntegrationTestBase {

    @Autowired PerformanceService performanceService;
    @Autowired RuleService ruleService;
    @Autowired SettlementService settlementService;
    @Autowired SettlementConfirmationService confirmationService;
    @Autowired SettlementChainJobRepository chainJobRepository;
    @Autowired SettlementTestFixture fixture;
    @Autowired FakeSettlementChainReader chain;
    @Autowired StepUpTokenService stepUpTokens;
    @Autowired StringRedisTemplate redis;

    private SettlementTestFixture.World world;
    private MemberPrincipal host;
    private MemberPrincipal outsider;
    private long performanceId;

    @BeforeEach
    void setUp() {
        chain.reset();
        world = fixture.createWorld(5000, 5000, new int[]{3334, 3333, 3333});
        host = principal(world.hostLeader());
        outsider = principal(world.outsider());
        performanceId = world.performance().getPerformanceId();
    }

    @AfterEach
    void clearRequest() {
        RequestContextHolder.resetRequestAttributes();
    }

    private String token(MemberPrincipal who, StepUpAction action) {
        return stepUpTokens.issue(who.memberId(), action, performanceId).token();
    }

    private boolean bound(MemberPrincipal who, StepUpAction action, String token) {
        return token.equals(redis.opsForValue().get(
                StepUpTokenService.scopeKey(who.memberId(), action, performanceId)));
    }

    private boolean unused(String token) {
        return Boolean.TRUE.equals(redis.hasKey(StepUpTokenService.TOKEN_PREFIX + token));
    }

    @Test
    @DisplayName("켜짐 — 정산 조회 응답에 stepUpRequired: true")
    void responsesCarryFlag() {
        assertThat(settlementService.detail(host, performanceId).stepUpRequired()).isTrue();
    }

    // ================================================================ 보증금

    @Nested
    @DisplayName("보증금 보고(API-performance-14)")
    class Deposit {

        private ErrorCode report(MemberPrincipal who, String token) {
            return codeOf(() -> performanceService.depositSignedTx(who, performanceId,
                    new SignedTxRequest("DEPOSIT", "0x01"), token));
        }

        @Test
        @DisplayName("토큰 없음 → 403")
        void missing() {
            assertThat(report(host, null)).isEqualTo(ErrorCode.WEBAUTHN_STEP_UP_REQUIRED);
        }

        @Test
        @DisplayName("DEPOSIT 범위 토큰 → 통과, APPROVE → DEPOSIT 두 번째 보고도 같은 토큰으로 통과")
        void validAndSequence() {
            String token = token(host, StepUpAction.DEPOSIT);

            ErrorCode first = codeOf(() -> performanceService.depositSignedTx(host, performanceId,
                    new SignedTxRequest("APPROVE", "0x01"), token));
            ErrorCode second = report(host, token);

            assertThat(first).isNotEqualTo(ErrorCode.WEBAUTHN_STEP_UP_REQUIRED);
            assertThat(second).isNotEqualTo(ErrorCode.WEBAUTHN_STEP_UP_REQUIRED);
            assertThat(bound(host, StepUpAction.DEPOSIT, token)).isTrue();
        }

        @Test
        @DisplayName("다른 동작(정산금 지급) 토큰 → 403")
        void crossAction() {
            assertThat(report(host, token(host, StepUpAction.SETTLEMENT_RELEASE)))
                    .isEqualTo(ErrorCode.WEBAUTHN_STEP_UP_REQUIRED);
        }

        @Test
        @DisplayName("남의 공연 — 소유 검사가 먼저라 PERFORMANCE_NOT_OWNER, 토큰은 그대로 남는다")
        void ownershipFirst() {
            String token = token(outsider, StepUpAction.DEPOSIT);

            assertThat(report(outsider, token)).isEqualTo(ErrorCode.PERFORMANCE_NOT_OWNER);
            assertThat(unused(token)).isTrue();
        }
    }

    // ================================================================ 규칙 동의

    @Nested
    @DisplayName("규칙 동의 보고(API-rule-05)")
    class RuleAgree {

        private ErrorCode report(MemberPrincipal who, String token) {
            return codeOf(() -> ruleService.agreeSignedTx(who, performanceId,
                    new AgreeSignedTxRequest("AGREE", world.host().getTeamId(), "0x01"), token));
        }

        @Test
        @DisplayName("토큰 없음 → 403")
        void missing() {
            assertThat(report(host, null)).isEqualTo(ErrorCode.WEBAUTHN_STEP_UP_REQUIRED);
        }

        @Test
        @DisplayName("RULE_AGREE 범위 토큰 → 통과(가드 다음 검사 결과)")
        void valid() {
            String token = token(host, StepUpAction.RULE_AGREE);

            assertThat(report(host, token)).isNotEqualTo(ErrorCode.WEBAUTHN_STEP_UP_REQUIRED);
            assertThat(bound(host, StepUpAction.RULE_AGREE, token)).isTrue();
        }

        @Test
        @DisplayName("다른 동작(보증금) 토큰 → 403")
        void crossAction() {
            assertThat(report(host, token(host, StepUpAction.DEPOSIT)))
                    .isEqualTo(ErrorCode.WEBAUTHN_STEP_UP_REQUIRED);
        }

        @Test
        @DisplayName("리더가 아닌 팀으로 보고 — 권한 검사가 먼저, 토큰은 그대로 남는다")
        void leaderCheckFirst() {
            String token = token(outsider, StepUpAction.RULE_AGREE);

            assertThat(report(outsider, token)).isNotEqualTo(ErrorCode.WEBAUTHN_STEP_UP_REQUIRED);
            assertThat(unused(token)).isTrue();
        }
    }

    // ================================================================ 정산 조기 동의·지급

    @Nested
    @DisplayName("정산 조기 동의(API-settlement-08)·정산금 지급(API-settlement-05)")
    class Settlement {

        @BeforeEach
        void lock() {
            PerformerStepUpSupport.locked(fixture, world, chain, settlementService,
                    confirmationService, chainJobRepository);
        }

        @Test
        @DisplayName("동의 — 토큰 없음 403, 맞는 토큰 통과")
        void approve() {
            assertThat(codeOf(() -> settlementService.approve(host, performanceId, null)))
                    .isEqualTo(ErrorCode.WEBAUTHN_STEP_UP_REQUIRED);

            String token = token(host, StepUpAction.SETTLEMENT_APPROVE);
            assertThat(codeOf(() -> settlementService.approve(host, performanceId, token))).isNull();
        }

        @Test
        @DisplayName("동의 — 지급(release) 토큰으로는 403")
        void approveCrossAction() {
            String releaseToken = token(host, StepUpAction.SETTLEMENT_RELEASE);

            assertThat(codeOf(() -> settlementService.approve(host, performanceId, releaseToken)))
                    .isEqualTo(ErrorCode.WEBAUTHN_STEP_UP_REQUIRED);
        }

        @Test
        @DisplayName("동의 — 참여팀이 아니면 게이트가 먼저 막고 토큰은 그대로 남는다")
        void approveGateFirst() {
            String token = token(outsider, StepUpAction.SETTLEMENT_APPROVE);

            assertThat(codeOf(() -> settlementService.approve(outsider, performanceId, token)))
                    .isNotEqualTo(ErrorCode.WEBAUTHN_STEP_UP_REQUIRED)
                    .isNotNull();
            assertThat(unused(token)).isTrue();
        }

        @Test
        @DisplayName("지급 — 토큰 없음 403, 맞는 토큰 통과, 다른 회원의 토큰 403")
        void release() {
            fixture.expireDisputeDeadline(settlementId());
            withIdempotencyKey();

            assertThat(codeOf(() -> settlementService.release(host, performanceId, null, null)))
                    .isEqualTo(ErrorCode.WEBAUTHN_STEP_UP_REQUIRED);

            MemberPrincipal otherLeader = principal(world.leaders().get(1));
            String othersToken = token(otherLeader, StepUpAction.SETTLEMENT_RELEASE);
            assertThat(codeOf(() -> settlementService.release(host, performanceId, null, othersToken)))
                    .isEqualTo(ErrorCode.WEBAUTHN_STEP_UP_REQUIRED);

            String token = token(host, StepUpAction.SETTLEMENT_RELEASE);
            assertThat(codeOf(() -> settlementService.release(host, performanceId, null, token))).isNull();
        }

        @Test
        @DisplayName("지급 — 동의 토큰으로는 403")
        void releaseCrossAction() {
            fixture.expireDisputeDeadline(settlementId());
            withIdempotencyKey();
            String approveToken = token(host, StepUpAction.SETTLEMENT_APPROVE);

            assertThat(codeOf(() -> settlementService.release(host, performanceId, null, approveToken)))
                    .isEqualTo(ErrorCode.WEBAUTHN_STEP_UP_REQUIRED);
        }

        @Test
        @DisplayName("지급 — 생성자·ADMIN 이 아니면 권한 검사가 먼저, 토큰은 그대로 남는다")
        void releaseOwnerFirst() {
            withIdempotencyKey();
            MemberPrincipal otherLeader = principal(world.leaders().get(1));
            String token = token(otherLeader, StepUpAction.SETTLEMENT_RELEASE);

            assertThat(codeOf(() -> settlementService.release(otherLeader, performanceId, null, token)))
                    .isNotEqualTo(ErrorCode.WEBAUTHN_STEP_UP_REQUIRED)
                    .isNotNull();
            assertThat(unused(token)).isTrue();
        }

        private Long settlementId() {
            return settlementService.detail(host, performanceId).settlementId();
        }
    }
}
