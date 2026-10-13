package com.ssafy.b204.webauthn;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.settlement.FakeSettlementChainReader;
import com.ssafy.b204.settlement.SettlementTestFixture;
import com.ssafy.b204.settlement.repository.SettlementChainJobRepository;
import com.ssafy.b204.settlement.service.SettlementCalculator;
import com.ssafy.b204.settlement.service.SettlementConfirmationService;
import com.ssafy.b204.settlement.service.SettlementService;
import java.util.UUID;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * 공연자 동작 4개(규칙 동의 · 보증금 · 정산 조기 동의 · 정산금 지급) 가드 테스트 공용.
 *
 * <p>정산을 LOCKED 까지 올리는 방법은 {@code AdminDisputeApiTest}·{@code SettlementApiIntegrationTest}와
 * 같다 — 워커가 할 일(전송 → receipt → CONFIRMED)을 대신 적용한다.
 */
final class PerformerStepUpSupport {

    private PerformerStepUpSupport() {
    }

    static MemberPrincipal principal(Member member) {
        return MemberPrincipal.of(member.getMemberId(), member.getEmail(), member.isAdmin());
    }

    static ErrorCode codeOf(Runnable call) {
        try {
            call.run();
            return null;
        } catch (BusinessException e) {
            return e.getErrorCode();
        }
    }

    /** 정산을 LOCKED 까지 밀어 올린다. */
    static void locked(SettlementTestFixture fixture, SettlementTestFixture.World world,
                       FakeSettlementChainReader chain, SettlementService settlementService,
                       SettlementConfirmationService confirmationService,
                       SettlementChainJobRepository chainJobRepository) {
        fixture.placeOrder(world, fixture.createAudience(), world.teams().get(0), 3, 10_000L, 0);
        fixture.placeOrder(world, fixture.createAudience(), world.teams().get(1), 2, 10_000L, 0);
        fixture.placeOrder(world, fixture.createAudience(), world.teams().get(2), 1, 10_000L, 0);
        chain.escrow = 60_000L;
        chain.counts = new long[]{3, 2, 1};
        chain.payouts = new SettlementCalculator()
                .calculate(60_000L, 5000, 5000, new int[]{3334, 3333, 3333}, chain.counts, 0)
                .shares().stream().mapToLong(share -> share.totalAmount()).toArray();

        MemberPrincipal host = principal(world.hostLeader());
        Long performanceId = world.performance().getPerformanceId();
        settlementService.aggregate(host, performanceId);
        confirm(chainJobRepository, performanceId, ChainJob.TxType.AGGREGATE);
        confirmationService.applyConfirmedJobs();
        settlementService.lock(host, performanceId);
        confirm(chainJobRepository, performanceId, ChainJob.TxType.LOCK);
        confirmationService.applyConfirmedJobs();
    }

    private static void confirm(SettlementChainJobRepository repository, Long performanceId,
                                ChainJob.TxType txType) {
        ChainJob job = repository.findAll().stream()
                .filter(j -> j.getTxType() == txType
                        && performanceId.equals(j.getTargetPerformanceId())
                        && j.getStatus() == ChainJob.Status.PENDING)
                .reduce((a, b) -> b)
                .orElseThrow(() -> new IllegalStateException(txType + " job 이 없다"));
        job.markConfirmed("0x" + UUID.randomUUID().toString().replace("-", "")
                + UUID.randomUUID().toString().replace("-", ""), 1);
        repository.save(job);
    }

    /** release 는 {@code Idempotency-Key}를 요청 헤더에서 읽는다 — 서비스 호출에 요청 문맥을 심는다. */
    static void withIdempotencyKey() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Idempotency-Key", "idem-" + UUID.randomUUID());
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
    }
}
