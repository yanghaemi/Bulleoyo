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
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.context.request.RequestContextHolder;

/**
 * 공연자 동작 4개 — <b>스위치 꺼짐(기본값)</b>. 헤더 없이도(엉뚱한 값이어도) 가드에 막히지 않고,
 * 정산 조회 응답에 {@code stepUpRequired} 키가 없다(null → non_null 이 지운다).
 */
class PerformerStepUpOffTest extends IntegrationTestBase {

    @Autowired PerformanceService performanceService;
    @Autowired RuleService ruleService;
    @Autowired SettlementService settlementService;
    @Autowired SettlementConfirmationService confirmationService;
    @Autowired SettlementChainJobRepository chainJobRepository;
    @Autowired SettlementTestFixture fixture;
    @Autowired FakeSettlementChainReader chain;

    private SettlementTestFixture.World world;
    private MemberPrincipal host;
    private long performanceId;

    @BeforeEach
    void setUp() {
        chain.reset();
        world = fixture.createWorld(5000, 5000, new int[]{3334, 3333, 3333});
        host = principal(world.hostLeader());
        performanceId = world.performance().getPerformanceId();
    }

    @AfterEach
    void clearRequest() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    @DisplayName("꺼짐 — 정산 조회 응답의 stepUpRequired 는 null(키 없음)")
    void noFlag() {
        assertThat(settlementService.detail(host, performanceId).stepUpRequired()).isNull();
    }

    @Test
    @DisplayName("꺼짐 — 보증금·규칙 동의 보고는 토큰 없이도 가드에 막히지 않는다")
    void signedTxIgnoreToken() {
        assertThat(codeOf(() -> performanceService.depositSignedTx(host, performanceId,
                new SignedTxRequest("DEPOSIT", "0x01"), null)))
                .isNotEqualTo(ErrorCode.WEBAUTHN_STEP_UP_REQUIRED);
        assertThat(codeOf(() -> ruleService.agreeSignedTx(host, performanceId,
                new AgreeSignedTxRequest("AGREE", world.host().getTeamId(), "0x01"), "junk")))
                .isNotEqualTo(ErrorCode.WEBAUTHN_STEP_UP_REQUIRED);
    }

    @Test
    @DisplayName("꺼짐 — 정산 조기 동의·지급은 토큰 없이 그대로 성공한다")
    void settlementIgnoresToken() {
        PerformerStepUpSupport.locked(fixture, world, chain, settlementService, confirmationService,
                chainJobRepository);

        assertThat(codeOf(() -> settlementService.approve(host, performanceId, null))).isNull();

        fixture.expireDisputeDeadline(settlementService.detail(host, performanceId).settlementId());
        withIdempotencyKey();
        assertThat(codeOf(() -> settlementService.release(host, performanceId, null, "junk"))).isNull();
    }
}
