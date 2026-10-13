package com.ssafy.b204.coin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.coin.dto.CoinDtos.Invariant;
import com.ssafy.b204.coin.dto.CoinDtos.SupplyResponse;
import com.ssafy.b204.coin.service.CoinService;
import com.ssafy.b204.coin.service.SupplyReconciler;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.settlement.FakeSettlementChainReader;
import com.ssafy.b204.settlement.SettlementTestFixture;
import com.ssafy.b204.settlement.SettlementTestFixture.World;
import com.ssafy.b204.settlement.entity.Settlement;
import com.ssafy.b204.settlement.repository.SettlementChainJobRepository;
import com.ssafy.b204.settlement.repository.SettlementRepository;
import com.ssafy.b204.settlement.repository.SettlementShareRepository;
import com.ssafy.b204.settlement.service.ReleaseHaltGuard;
import com.ssafy.b204.settlement.service.SettlementCalculator;
import com.ssafy.b204.settlement.service.SettlementConfirmationService;
import com.ssafy.b204.settlement.service.SettlementService;
import com.ssafy.b204.support.IntegrationTestBase;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * 불변식 3(공연별 {@code Σ Released = 잠긴 규칙 × 카운터})과 release 게이트의 <b>실제 배선</b>.
 *
 * <p>두 도메인이 따로 살던 동안 미뤄 둔 연결 두 개를 여기서 고정한다(open-questions D-9·D-20).
 *
 * <ol>
 *   <li>{@code SupplyReconciler}가 {@code RELEASED} 정산을 재계산해 팀별로 비교한다.
 *   <li>그 판정이 {@code ReleaseHaltGuard}로 나가 release를 409
 *       {@code COIN_RESERVE_MISMATCH}로 막는다. 이 테스트는 {@code ReleaseHaltGuard}를
 *       <b>대체하지 않는다</b> — 게이트가 진짜 대사 결과를 쓰는지가 검증 대상이다
 *       ({@code SettlementApiIntegrationTest}는 반대로 게이트만 보려고 스위치로 갈아 끼운다).
 * </ol>
 *
 * <p>정산 데이터는 {@code settlement} 도메인의 정상 경로로 만든다 — aggregate → lock → release를
 * 실제로 태우고 {@code chain_job}을 확정 처리한다. SQL로 {@code settlement_share}를 손으로 넣으면
 * "서버가 저장한 값"과 "서버가 재계산한 값"이 같은 코드에서 나오지 않아 검사가 자기 자신을
 * 확인하는 꼴이 된다.
 *
 * <p><b>정산 행을 매 테스트에서 지운다.</b> 컨테이너 하나를 전 테스트 클래스가 공유하므로
 * ({@code IntegrationTestBase}) 다른 클래스가 남긴 {@code RELEASED} 정산이 {@code checkedShows}에
 * 섞인다. 이 클래스가 남긴 불일치 정산이 다른 클래스의 {@code releaseHalted == false} 단정을
 * 깨뜨리는 것도 같은 이유로 막아야 한다 — 그래서 {@code @AfterEach}에서도 지운다.
 */
class Invariant3IntegrationTest extends IntegrationTestBase {

    @Autowired CoinService coinService;
    @Autowired ReleaseHaltGuard injectedGuard;
    @Autowired ApplicationContext context;
    @Autowired SettlementService settlementService;
    @Autowired SettlementConfirmationService confirmationService;
    @Autowired SettlementRepository settlementRepository;
    @Autowired SettlementShareRepository settlementShareRepository;
    @Autowired SettlementChainJobRepository chainJobRepository;
    @Autowired FakeSettlementChainReader chain;
    @Autowired SettlementTestFixture fixture;
    @Autowired JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        clearSettlements();
        chain.reset();
        supplyReconciler.invalidate();
    }

    @AfterEach
    void tearDown() {
        clearSettlements();
        supplyReconciler.invalidate();
        RequestContextHolder.resetRequestAttributes();
    }

    // ================================================================ 배선

    @Test
    @DisplayName("D-20 — release 게이트의 ReleaseHaltGuard가 SupplyReconciler다(기본 허용 구현이 아니다)")
    void supplyReconcilerIsTheReleaseHaltGuard() {
        assertThat(injectedGuard).isSameAs(supplyReconciler);
        // AllowReleaseHaltGuard(@ConditionalOnMissingBean)가 함께 등록되면 주입이 모호해진다.
        assertThat(context.getBeansOfType(ReleaseHaltGuard.class)).hasSize(1);
    }

    // ================================================================ 불변식 3

    @Test
    @DisplayName("① 저장된 분배 합계가 재계산과 같으면 checkedShows 1 · mismatched 0 · matched true")
    void matchesWhenSharesEqualRecalculation() {
        World world = fixture.createWorld(5000, 5000, new int[]{3334, 3333, 3333});
        release(world);
        supplyReconciler.invalidate();

        Invariant third = invariant3();

        assertThat(third.name()).isEqualTo("RELEASED_EQUALS_RULE_RECALC");
        assertThat(third.checkedShows()).isEqualTo(1);
        assertThat(third.mismatchedShows()).isZero();
        assertThat(third.maxDiff()).isZero();
        assertThat(third.matched()).isTrue();
        // 카운터는 온체인에서 읽었다는 사실이 note에 남아야 한다.
        assertThat(third.note()).contains("온체인 choiceCountsOf 카운터로 평가 1건");
        assertThat(supplyReconciler.isReleaseHalted()).isFalse();
        // 불변식 3은 mint 판정에 들어가지 않는다.
        assertThat(supplyReconciler.snapshot().supplyMatched()).isTrue();
    }

    @Test
    @DisplayName("② 1원이라도 어긋나면 mismatched 1 · maxDiff 1 · matched false → 다른 정산의 release가 409")
    void oneCoinDifferenceHaltsRelease() {
        World released = fixture.createWorld(5000, 5000, new int[]{3334, 3333, 3333});
        release(released);

        Long tamperedShareId = jdbcTemplate.queryForObject(
                "SELECT MIN(settlement_share_id) FROM settlement_share WHERE settlement_id = ?",
                Long.class, settlementOf(released).getSettlementId());
        jdbcTemplate.update("UPDATE settlement_share SET total_amount = total_amount + 1 "
                + "WHERE settlement_share_id = ?", tamperedShareId);
        supplyReconciler.invalidate();

        Invariant third = invariant3();
        assertThat(third.checkedShows()).isEqualTo(1);
        assertThat(third.mismatchedShows()).isEqualTo(1);
        assertThat(third.maxDiff()).isEqualTo(1L);
        assertThat(third.matched()).isFalse();

        // 발행량(불변식 1·4)은 멀쩡하다 — 그래서 지급은 계속 되고 release만 막힌다.
        assertThat(supplyReconciler.snapshot().supplyMatched()).isTrue();
        assertThat(supplyReconciler.mintHalted()).isFalse();
        assertThat(supplyReconciler.isReleaseHalted()).isTrue();

        SupplyResponse supply = coinService.supply();
        assertThat(supply.mintHalted()).isFalse();
        assertThat(supply.releaseHalted()).isTrue();

        // 게이트가 실제로 이 판정을 쓰는지 — 아직 release되지 않은 다른 공연으로 확인한다.
        World pending = fixture.createWorld(5000, 5000, new int[]{3334, 3333, 3333});
        lock(pending);
        Long pendingId = pending.performance().getPerformanceId();
        fixture.expireDisputeDeadline(settlementOf(pending).getSettlementId());
        withIdempotencyKey();

        assertThatThrownBy(() -> settlementService.release(principal(pending.hostLeader()),
                pendingId, null))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COIN_RESERVE_MISMATCH);
        assertThat(settlementOf(pending).getStatus()).isEqualTo(Settlement.Status.DISPUTE_OPEN);
    }

    @Test
    @DisplayName("③ 카운터를 어디에서도 못 구한 정산은 checkedShows에서 빼고 note에 건수를 적는다")
    void unevaluatedShowsAreExcludedNotPassed() {
        World evaluable = fixture.createWorld(5000, 5000, new int[]{3334, 3333, 3333});
        release(evaluable);
        World blind = fixture.createWorld(5000, 5000, new int[]{3334, 3333, 3333});
        release(blind);

        // 카운터 출처를 둘 다 없앤다 — 저장 카운터(share)를 지우고 체인을 닫는다.
        jdbcTemplate.update("DELETE FROM settlement_share WHERE settlement_id = ?",
                settlementOf(blind).getSettlementId());
        chain.available = false;
        supplyReconciler.invalidate();

        Invariant third = invariant3();

        // 평가한 것은 하나뿐이고, 평가하지 못한 하나를 "통과"로 세지 않는다.
        assertThat(third.checkedShows()).isEqualTo(1);
        assertThat(third.mismatchedShows()).isZero();
        assertThat(third.matched()).isTrue();
        assertThat(third.note()).contains("평가 불가 1건(규칙·매출·카운터 없음)");
        // 체인이 닫혔으므로 남은 하나는 저장 카운터로 평가됐다.
        assertThat(third.note()).contains("저장 카운터(settlement_share.choice_count)로 평가 1건");
        assertThat(third.note()).doesNotContain("온체인 choiceCountsOf");
    }

    @Test
    @DisplayName("④ 노드 장애로는 release를 막지 않는다 — 조회 불가는 불일치가 아니다")
    void nodeOutageDoesNotHaltRelease() {
        World world = fixture.createWorld(5000, 5000, new int[]{3334, 3333, 3333});
        release(world);
        chain.available = false;
        supplyReconciler.invalidate();

        SupplyReconciler.Snapshot snapshot = supplyReconciler.snapshot();

        assertThat(snapshot.stale()).isTrue();
        assertThat(snapshot.supplyMatched()).isTrue();
        assertThat(snapshot.releaseHalted()).isFalse();
        assertThat(supplyReconciler.isReleaseHalted()).isFalse();
        // 불변식 1·2·4는 미평가로 내려가고, 3은 저장 카운터로 평가된다.
        assertThat(invariant3().checkedShows()).isEqualTo(1);
        assertThat(invariant3().matched()).isTrue();
    }

    @Test
    @DisplayName("release된 정산이 없으면 검사 대상 0건으로 정직하게 내린다")
    void nothingToCheck() {
        Invariant third = invariant3();

        assertThat(third.checkedShows()).isZero();
        assertThat(third.mismatchedShows()).isZero();
        assertThat(third.matched()).isTrue();
        assertThat(third.note()).contains("검사 대상 0건");
        assertThat(supplyReconciler.isReleaseHalted()).isFalse();
    }

    @Test
    @DisplayName("⑥ 한 건도 평가하지 못하면 maxDiff를 null로 내린다 — 화면이 '일치 · 차액 0'으로 그리지 않게")
    void maxDiffIsNullWhenNothingWasEvaluated() {
        World blind = fixture.createWorld(5000, 5000, new int[]{3334, 3333, 3333});
        release(blind);
        // 카운터 출처를 둘 다 없앤다 → 평가 0건 · 미평가 1건.
        jdbcTemplate.update("DELETE FROM settlement_share WHERE settlement_id = ?",
                settlementOf(blind).getSettlementId());
        chain.available = false;
        supplyReconciler.invalidate();

        Invariant third = invariant3();

        assertThat(third.checkedShows()).isZero();
        assertThat(third.mismatchedShows()).isZero();
        // 불일치 증거가 없으므로 matched 는 true 지만, maxDiff 는 "모른다"여야 한다.
        assertThat(third.matched()).isTrue();
        assertThat(third.maxDiff()).isNull();
        assertThat(third.note()).startsWith("평가한 정산 없음(미평가 1건)");
        assertThat(supplyReconciler.isReleaseHalted()).isFalse();
    }

    @Test
    @DisplayName("⑦ 온체인 카운터 길이가 참여팀 수와 다르면 저장 카운터로 갈아타지 않고 평가 불가로 센다")
    void onChainTeamCountMismatchIsUnevaluatedNotStoredFallback() {
        World world = fixture.createWorld(5000, 5000, new int[]{3334, 3333, 3333});
        release(world);
        // 서버는 3팀인데 체인이 2팀을 말한다 = 팀 집합이 갈라졌다(노드 장애가 아니다).
        chain.counts = new long[]{3, 3};
        supplyReconciler.invalidate();

        Invariant third = invariant3();

        assertThat(third.checkedShows()).isZero();
        assertThat(third.mismatchedShows()).isZero();
        assertThat(third.maxDiff()).isNull();
        assertThat(third.note()).contains("평가한 정산 없음(미평가 1건)")
                .contains("온체인 팀 수 불일치 1건");
        // 저장 카운터로 조용히 평가하면 갈라진 사실이 note 에서 사라진다 — 그러지 않는다.
        assertThat(third.note()).doesNotContain("저장 카운터");
    }

    // ================================================================ 트랜잭션·게이트 경계

    @Test
    @DisplayName("⑧ 체인 조회는 DB 트랜잭션 밖에서 한다 — 노드 지연이 커넥션을 붙잡지 않게")
    void chainIsReadOutsideAnyDatabaseTransaction() {
        World world = fixture.createWorld(5000, 5000, new int[]{3334, 3333, 3333});
        release(world);

        chain.clearCallLog();
        supplyReconciler.refresh();

        // 대사가 실제로 체인을 읽었고(0건이면 단정이 공허하다),
        assertThat(chain.choiceCountsCalls).isPositive();
        // 그 호출 어느 것도 트랜잭션 안에서 일어나지 않았다.
        assertThat(chain.choiceCountsInTransaction).isNotEmpty().containsOnly(false);
    }

    @Test
    @DisplayName("⑨ 게이트는 스캔을 유발하지 않고, 정산 확정 이벤트가 스냅샷을 즉시 갱신한다")
    void gateNeverScansAndConfirmationEventRefreshesImmediately() {
        World released = fixture.createWorld(5000, 5000, new int[]{3334, 3333, 3333});
        release(released);
        Long tamperedShareId = jdbcTemplate.queryForObject(
                "SELECT MIN(settlement_share_id) FROM settlement_share WHERE settlement_id = ?",
                Long.class, settlementOf(released).getSettlementId());
        jdbcTemplate.update("UPDATE settlement_share SET total_amount = total_amount + 1 "
                + "WHERE settlement_share_id = ?", tamperedShareId);

        // 스냅샷을 비운다. 이 상태에서 게이트를 불러도 대사를 돌리지 않는다(요청 스레드 보호).
        supplyReconciler.invalidate();
        chain.clearCallLog();
        assertThat(supplyReconciler.isReleaseHalted()).isFalse();
        assertThat(chain.choiceCountsCalls).isZero();

        // 다른 공연의 집계가 확정되면 그 커밋 직후 대사가 다시 돌아 판정이 즉시 최신이 된다.
        World next = fixture.createWorld(5000, 5000, new int[]{3334, 3333, 3333});
        lock(next);

        assertThat(chain.choiceCountsCalls).isPositive();
        // snapshot() 을 부르지 않았는데도 게이트가 막힌 상태를 알고 있다 = 이벤트가 채웠다.
        assertThat(supplyReconciler.isReleaseHalted()).isTrue();
    }

    // ================================================================ 도우미

    private Invariant invariant3() {
        return supplyReconciler.snapshot().invariants().get(2);
    }

    /** 6매 판매 · 팀0 3표 · 팀1 2표 · 팀2 1표. 체인도 같은 값을 말한다. */
    private void seedSales(World world) {
        fixture.placeOrder(world, fixture.createAudience(), world.teams().get(0), 3, 10_000L, 0);
        fixture.placeOrder(world, fixture.createAudience(), world.teams().get(1), 2, 10_000L, 0);
        fixture.placeOrder(world, fixture.createAudience(), world.teams().get(2), 1, 10_000L, 0);
        chain.available = true;
        chain.escrow = 60_000L;
        chain.counts = new long[]{3, 2, 1};
        chain.payouts = new SettlementCalculator()
                .calculate(60_000L, 5000, 5000, new int[]{3334, 3333, 3333}, chain.counts, 0)
                .shares().stream().mapToLong(SettlementCalculator.Share::totalAmount).toArray();
    }

    private void lock(World world) {
        Long performanceId = world.performance().getPerformanceId();
        MemberPrincipal leader = principal(world.hostLeader());
        seedSales(world);
        settlementService.aggregate(leader, performanceId);
        confirmJob(performanceId, ChainJob.TxType.AGGREGATE);
        confirmationService.applyConfirmedJobs();
        settlementService.lock(leader, performanceId);
        confirmJob(performanceId, ChainJob.TxType.LOCK);
        confirmationService.applyConfirmedJobs();
    }

    private void release(World world) {
        lock(world);
        Long performanceId = world.performance().getPerformanceId();
        fixture.expireDisputeDeadline(settlementOf(world).getSettlementId());
        withIdempotencyKey();
        settlementService.release(principal(world.hostLeader()), performanceId, null);
        confirmJob(performanceId, ChainJob.TxType.RELEASE);
        confirmationService.applyConfirmedJobs();
        assertThat(settlementOf(world).getStatus()).isEqualTo(Settlement.Status.RELEASED);
    }

    /** 워커가 하는 일(전송 → receipt 검증 → CONFIRMED)을 대신한다. */
    private void confirmJob(Long performanceId, ChainJob.TxType txType) {
        ChainJob job = chainJobRepository.findAll().stream()
                .filter(j -> j.getTxType() == txType
                        && performanceId.equals(j.getTargetPerformanceId())
                        && j.getStatus() == ChainJob.Status.PENDING)
                .reduce((a, b) -> b)
                .orElseThrow(() -> new IllegalStateException(txType + " job 이 없다"));
        job.markConfirmed("0x" + UUID.randomUUID().toString().replace("-", "")
                + UUID.randomUUID().toString().replace("-", ""), 1);
        chainJobRepository.save(job);
    }

    private Settlement settlementOf(World world) {
        return settlementRepository
                .findByPerformance_PerformanceId(world.performance().getPerformanceId())
                .orElseThrow();
    }

    private MemberPrincipal principal(Member member) {
        return MemberPrincipal.of(member.getMemberId(), member.getEmail(), member.isAdmin());
    }

    private void withIdempotencyKey() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Idempotency-Key", "idem-" + UUID.randomUUID());
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
    }

    /**
     * 정산 흔적을 지운다 — 자식(이의·분배)부터.
     *
     * <p>{@code settlement_share}는 FK가 {@code ON DELETE CASCADE}지만 {@code dispute}는 아니다.
     * 순서를 뒤집으면 FK 위반으로 테스트가 준비 단계에서 죽는다.
     */
    private void clearSettlements() {
        jdbcTemplate.update("DELETE FROM dispute");
        jdbcTemplate.update("DELETE FROM settlement_share");
        jdbcTemplate.update("DELETE FROM settlement");
    }
}
