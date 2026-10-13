package com.ssafy.b204.coin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.coin.dto.CoinDtos.Invariant;
import com.ssafy.b204.coin.repository.CoinChainJobRepository;
import com.ssafy.b204.coin.repository.CoinPerformanceRepository;
import com.ssafy.b204.coin.repository.CoinWalletRepository;
import com.ssafy.b204.coin.service.CoinChainReader;
import com.ssafy.b204.coin.service.ReleasedSettlementAuditor;
import com.ssafy.b204.coin.service.SupplyReconciler;
import com.ssafy.b204.wallet.entity.Wallet;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Pageable;

/**
 * 발행량 대사(API-coin-01)의 판정 경계 — 체인 없이 돈다.
 *
 * <p>여기서 지키려는 것은 둘이다. ① 체인을 못 읽어도 공시가 답한다 ② 불변식 1·4가 깨질 때만
 * mint가 멈춘다. 후자를 느슨하게 두면 시연 도중 정상 상태에서 지급이 막히고, 빡빡하게 두면
 * 코인이 새는 상태에서 계속 찍는다.
 */
class SupplyReconcilerTest {

    private CoinChainReader chainReader;
    private CoinChainJobRepository chainJobRepository;
    private CoinPerformanceRepository performanceRepository;
    private CoinWalletRepository walletRepository;
    private ReleasedSettlementAuditor releasedSettlementAuditor;
    private SupplyReconciler reconciler;
    private com.ssafy.b204.common.alert.OpsAlert opsAlert;

    @BeforeEach
    void setUp() {
        opsAlert = mock(com.ssafy.b204.common.alert.OpsAlert.class);
        chainReader = mock(CoinChainReader.class);
        chainJobRepository = mock(CoinChainJobRepository.class);
        performanceRepository = mock(CoinPerformanceRepository.class);
        walletRepository = mock(CoinWalletRepository.class);
        releasedSettlementAuditor = mock(ReleasedSettlementAuditor.class);
        reconciler = new SupplyReconciler(chainReader, chainJobRepository, performanceRepository,
                walletRepository, releasedSettlementAuditor, opsAlert);

        when(releasedSettlementAuditor.scan()).thenReturn(ReleasedSettlementAuditor.Scan.empty());

        when(chainJobRepository.countByTxTypeAndStatusAndRequesterIsNull(any(), any())).thenReturn(1L);
        when(chainJobRepository.countByTxTypeAndStatusAndRequesterIsNotNull(any(), any())).thenReturn(0L);
        when(chainJobRepository.sumAmountBySignup(any(), any())).thenReturn(100_000L);
        when(chainJobRepository.sumAmountByAdmin(any(), any())).thenReturn(0L);
        when(chainJobRepository.sumAmountByPerformanceAndTxType(any(), any())).thenReturn(List.of());
        when(performanceRepository.findOnChainShows()).thenReturn(List.of());
        registerWallets();
    }

    /**
     * 등록 지갑 {@code walletId = 1..n}, 주소 {@code 0xw{id}}, 잔액 = 인자 순서. DB 는 실제
     * 키셋 페이지처럼 {@code afterId} 뒤에서 청크 크기만큼만 돌려준다.
     */
    private void registerWallets(long... balances) {
        List<Object[]> rows = new ArrayList<>();
        for (int i = 0; i < balances.length; i++) {
            long id = i + 1;
            rows.add(new Object[] {id, "0xw" + id});
            when(chainReader.balanceOf("0xw" + id)).thenReturn(balances[i]);
        }
        when(walletRepository.findChunkAfter(eq(Wallet.Status.LINKED), anyLong(), any()))
                .thenAnswer(inv -> {
                    long afterId = inv.getArgument(1);
                    Pageable chunk = inv.getArgument(2);
                    return rows.stream().filter(r -> (Long) r[0] > afterId)
                            .limit(chunk.getPageSize()).toList();
                });
    }

    @Test
    @DisplayName("체인 조회가 불가능해도 공시는 DB 집계로 응답하고 stale로 표시한다")
    void fallsBackToDatabaseWhenChainUnavailable() {
        when(chainReader.isAvailable()).thenReturn(false);
        registerWallets(100_000L);

        SupplyReconciler.Snapshot snapshot = reconciler.snapshot();

        assertThat(snapshot.totalSupply()).isEqualTo(100_000L);
        assertThat(snapshot.grantCount()).isEqualTo(1);
        assertThat(snapshot.stale()).isTrue();
        assertThat(snapshot.invariants()).hasSize(4);
        // 미평가는 "불일치"가 아니다 — 노드가 없다고 지급을 막지 않는다.
        assertThat(snapshot.supplyMatched()).isTrue();
        // 못 본 값은 비운다(D-46) — 4번과 같은 규칙. 채워 두면 화면이 "일치"로 그린다.
        Invariant first = snapshot.invariants().get(0);
        assertThat(first.expected()).as("체인 조회 불가면 expected 를 비운다").isNull();
        assertThat(first.actual()).as("체인 조회 불가면 actual 을 비운다").isNull();
        assertThat(first.matched()).isTrue();
        assertThat(first.note()).contains("미평가");
        Invariant fourth = snapshot.invariants().get(3);
        assertThat(fourth.expected()).isNull();
        assertThat(fourth.matched()).isTrue();
        // 체인 리더가 없으면 지갑 잔액 조회도 시도하지 않는다.
        verify(chainReader, never()).balanceOf(anyString());
    }

    /**
     * 게이트는 요청 스레드에서 스캔하지 않는다(D-38). {@code snapshot()}을 부르기 전에는 캐시가
     * 없고, 그 상태의 {@code mintHalted()}는 체인을 읽지 않고 {@code false}다 — release 게이트와
     * 같은 규칙.
     */
    @Test
    @DisplayName("mint 게이트는 스냅샷이 없으면 스캔하지 않고 막지 않는다 — release 게이트와 같은 규칙")
    void mintGateDoesNotScanWithoutSnapshot() {
        assertThat(reconciler.mintHalted()).isFalse();
        verify(chainReader, never()).totalSupply();
        verify(chainReader, never()).balanceOf(anyString());
    }

    @Test
    @DisplayName("불변식 1: totalSupply != Σ Minted 면 mint·release가 중단된다")
    void haltsWhenTotalSupplyDivergesFromMintedSum() {
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(500_000L);

        SupplyReconciler.Snapshot snapshot = reconciler.snapshot();

        Invariant first = snapshot.invariants().get(0);
        assertThat(first.name()).isEqualTo("SUPPLY_EQUALS_MINTED");
        assertThat(first.expected()).isEqualTo(100_000L);
        assertThat(first.actual()).isEqualTo(500_000L);
        assertThat(first.matched()).isFalse();
        assertThat(snapshot.supplyMatched()).isFalse();
        assertThat(reconciler.mintHalted()).isTrue();
        assertThat(reconciler.isReleaseHalted()).isTrue();
    }

    @Test
    @DisplayName("불변식 3: 정산 재계산이 어긋나면 release만 막고 mint는 계속 된다")
    void invariantThreeHaltsOnlyRelease() {
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(100_000L);
        when(releasedSettlementAuditor.scan())
                .thenReturn(new ReleasedSettlementAuditor.Scan(3, 1, 7L, 0, 0, 3, 0));

        SupplyReconciler.Snapshot snapshot = reconciler.snapshot();

        Invariant third = snapshot.invariants().get(2);
        assertThat(third.name()).isEqualTo("RELEASED_EQUALS_RULE_RECALC");
        assertThat(third.checkedShows()).isEqualTo(3);
        assertThat(third.mismatchedShows()).isEqualTo(1);
        assertThat(third.maxDiff()).isEqualTo(7L);
        assertThat(third.matched()).isFalse();
        // 발행량 대사(1·4)는 통과 — 지급은 막지 않는다.
        assertThat(snapshot.supplyMatched()).isTrue();
        assertThat(reconciler.mintHalted()).isFalse();
        assertThat(snapshot.releaseHalted()).isTrue();
        assertThat(reconciler.isReleaseHalted()).isTrue();
    }

    @Test
    @DisplayName("불변식 3: 평가하지 못한 정산은 checkedShows에서 빼고 note에만 적는다(막지 않는다)")
    void invariantThreeReportsUnevaluatedWithoutHalting() {
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(100_000L);
        when(releasedSettlementAuditor.scan())
                .thenReturn(new ReleasedSettlementAuditor.Scan(1, 0, 0L, 2, 0, 0, 1));

        SupplyReconciler.Snapshot snapshot = reconciler.snapshot();

        Invariant third = snapshot.invariants().get(2);
        assertThat(third.checkedShows()).isEqualTo(1);
        assertThat(third.matched()).isTrue();
        assertThat(third.note())
                .contains("저장 카운터(settlement_share.choice_count)로 평가 1건")
                .contains("평가 불가 2건(규칙·매출·카운터 없음)");
        assertThat(snapshot.releaseHalted()).isFalse();
    }

    @Test
    @DisplayName("불변식 3: 한 건도 평가하지 못했으면 maxDiff를 null로 내린다(화면이 '차액 0'으로 그리지 않게)")
    void invariantThreeReportsUnknownMaxDiffWhenNothingWasEvaluated() {
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(100_000L);
        // 평가 0건 · 미평가 2건 — "일치 · 최대 차액 0"으로 보이면 안 되는 상태다.
        when(releasedSettlementAuditor.scan())
                .thenReturn(new ReleasedSettlementAuditor.Scan(0, 0, 0L, 2, 0, 0, 0));

        Invariant third = reconciler.snapshot().invariants().get(2);

        assertThat(third.checkedShows()).isZero();
        assertThat(third.maxDiff()).isNull();
        assertThat(third.matched()).isTrue();
        assertThat(third.note()).isEqualTo("평가한 정산 없음(미평가 2건); 평가 불가 2건(규칙·매출·카운터 없음)");
    }

    @Test
    @DisplayName("불변식 3: 온체인 팀 수 불일치는 사유를 따로 적는다")
    void invariantThreeSeparatesTeamCountMismatchReason() {
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(100_000L);
        // 미평가 3건 중 2건이 팀 수 불일치 = 서버·체인의 팀 집합이 갈라졌다는 신호다.
        when(releasedSettlementAuditor.scan())
                .thenReturn(new ReleasedSettlementAuditor.Scan(1, 0, 0L, 3, 2, 1, 0));

        Invariant third = reconciler.snapshot().invariants().get(2);

        assertThat(third.note())
                .contains("온체인 choiceCountsOf 카운터로 평가 1건")
                .contains("평가 불가 1건(규칙·매출·카운터 없음)")
                .contains("온체인 팀 수 불일치 2건");
        assertThat(third.maxDiff()).isZero();
    }

    @Test
    @DisplayName("게이트는 스캔을 부르지 않는다 — 스냅샷이 없으면 막지 않고 체인·정산도 읽지 않는다")
    void releaseGateNeverTriggersAScan() {
        assertThat(reconciler.isReleaseHalted()).isFalse();

        verify(chainReader, never()).totalSupply();
        verify(releasedSettlementAuditor, never()).scan();
    }

    @Test
    @DisplayName("게이트는 스냅샷을 읽기만 한다 — 몇 번을 불러도 대사가 다시 돌지 않는다")
    void releaseGateOnlyReadsTheSnapshot() {
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(100_000L);
        when(releasedSettlementAuditor.scan())
                .thenReturn(new ReleasedSettlementAuditor.Scan(1, 1, 5L, 0, 0, 1, 0));

        reconciler.refresh();
        assertThat(reconciler.isReleaseHalted()).isTrue();

        // 게이트를 몇 번을 더 불러도 대사 호출 횟수가 늘지 않는다 — 갱신은 스케줄러·확정 이벤트의 몫이다.
        reconciler.isReleaseHalted();
        reconciler.isReleaseHalted();
        verify(releasedSettlementAuditor, times(1)).scan();
        verify(chainReader, times(1)).totalSupply();
    }

    @Test
    @DisplayName("refresh()는 TTL과 무관하게 다시 대사한다 — 확정 이벤트가 부르는 경로")
    void refreshRecomputesRegardlessOfTtl() {
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(100_000L);

        reconciler.snapshot();
        reconciler.refresh();

        verify(chainReader, times(2)).totalSupply();
    }

    @Test
    @DisplayName("불변식 4: 좌변−우변 > 0(미등록 주소 보유분)은 정상이다")
    void positiveUnregisteredRemainderIsNotAMismatch() {
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(100_000L);
        registerWallets(30_000L, 30_000L);

        SupplyReconciler.Snapshot snapshot = reconciler.snapshot();

        Invariant fourth = snapshot.invariants().get(3);
        assertThat(fourth.name()).isEqualTo("SUPPLY_EQUALS_WALLETS_PLUS_ESCROW");
        assertThat(fourth.matched()).isTrue();
        assertThat(snapshot.supplyMatched()).isTrue();
    }

    /**
     * D-44 · D-49 — 화면용 캐시는 조회된 지갑만 담아 합계가 작게 나왔다(9/10: 20만, 실제 30만).
     * 대사는 캐시를 보지 않고 등록 지갑 전부를 노드에서 읽는다. 값은 9/14 운영 공시 그대로다 —
     * 발행 40만, 등록 지갑 3개 각 10만, 차액 10만은 운영 회원이 아닌 주소 보유분.
     */
    @Test
    @DisplayName("불변식 4: 캐시가 비어도 등록 지갑의 노드 잔액 합이 walletTotal 이 된다")
    void walletTotalIsTheNodeBalanceSumOfRegisteredWallets() {
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(400_000L);
        when(chainJobRepository.sumAmountBySignup(any(), any())).thenReturn(400_000L);
        registerWallets(100_000L, 100_000L, 100_000L);

        SupplyReconciler.Snapshot snapshot = reconciler.snapshot();

        assertThat(snapshot.walletTotal()).isEqualTo(300_000L);
        Invariant fourth = snapshot.invariants().get(3);
        assertThat(fourth.matched()).isTrue();
        assertThat(snapshot.supplyMatched()).isTrue();
        // 화면은 expected 를 "Σ지갑 + Σ에스크로", actual 을 totalSupply 로 찍고
        // diff = actual - expected 를 그린다. 뒤집어 넘기면 정상 잔여분이 음수로 보인다.
        assertThat(fourth.expected()).isEqualTo(300_000L);
        assertThat(fourth.actual()).isEqualTo(400_000L);
        // 전부 노드에서 읽었으니 차액의 뜻을 단정한다 — 캐시 이야기는 더 없다.
        assertThat(fourth.note())
                .contains("차액 100000: 등록(LINKED) 지갑 밖 주소")
                .contains("SUSPENDED")
                .contains("등록 지갑 3개 노드 조회")
                .doesNotContain("캐시");
    }

    /** 부분 합계를 사실처럼 내보내지 않는다 — 불변식 1·2·3 과 같은 규칙(!101). */
    @Test
    @DisplayName("불변식 4: 지갑 하나라도 노드에서 못 읽으면 미평가 — 값은 null, matched 는 true")
    void oneWalletReadFailureLeavesInvariantFourUnevaluated() {
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(400_000L);
        when(chainJobRepository.sumAmountBySignup(any(), any())).thenReturn(400_000L);
        registerWallets(100_000L, 100_000L, 100_000L);
        when(chainReader.balanceOf("0xw2")).thenThrow(new IllegalStateException("node down"));

        SupplyReconciler.Snapshot snapshot = reconciler.snapshot();

        Invariant fourth = snapshot.invariants().get(3);
        assertThat(fourth.expected()).isNull();
        assertThat(fourth.actual()).isNull();
        // false 로 두면 supplyMatched 를 타고 mint·release 가 멈춘다 — 노드가 깜빡였다고 세우지 않는다.
        assertThat(fourth.matched()).isTrue();
        assertThat(snapshot.supplyMatched()).isTrue();
        assertThat(reconciler.mintHalted()).isFalse();
        assertThat(fourth.note()).contains("조회 불가").contains("(미평가)")
                .contains("등록 지갑 잔액 노드 미조회");
        // 부분 합계(10만)를 walletTotal 로 내보내지 않는다.
        assertThat(snapshot.walletTotal()).isZero();
        // 첫 실패에서 멈춘다 — 장애 중에 나머지 지갑마다 타임아웃을 기다리지 않는다.
        verify(chainReader, never()).balanceOf("0xw3");
    }

    /**
     * 지갑을 못 읽으면 walletTotal 은 0 이다. stale 이 false 면 공시 타일이 "지갑 보유 합계 0원"·
     * 등식 {@code 400,000 = 0 + 0} 을 표시 없이 그린다(리뷰 !106 🔴).
     */
    @Test
    @DisplayName("지갑 스캔이 끝나지 않으면 불변식 4 미평가 — stale 은 켜지 않고 walletTotal 0 을 표시 없이 내보내지 않는다")
    void walletScanFailureLeavesInvariant4Unevaluated() {
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(400_000L);
        when(chainJobRepository.sumAmountBySignup(any(), any())).thenReturn(400_000L);
        registerWallets(100_000L);
        when(chainReader.balanceOf("0xw1")).thenThrow(new IllegalStateException("node down"));

        SupplyReconciler.Snapshot snapshot = reconciler.snapshot();

        assertThat(snapshot.walletTotal()).isZero();
        // 화면이 0원 대신 '—' 를 그리는 근거다(리뷰 !106 🔴).
        assertThat(snapshot.invariants().get(3).expected()).isNull();
        assertThat(snapshot.invariants().get(3).actual()).isNull();
        // stale 은 켜지 않는다 — 켜면 불변식 1·2·3 까지 판정 불가로 덮인다(리뷰 !87 4차 🔴).
        assertThat(snapshot.stale()).isFalse();
        assertThat(snapshot.supplyMatched()).isTrue();
    }

    /**
     * 읽기 순서 totalSupply → 에스크로 → 지갑 사이에 확정된 tx 가 지갑 쪽에서만 세어진 경우.
     * 환불 5만: 에스크로는 환불 전(5만), 지갑은 환불 후(+5만)로 읽혀 counted 가 발행량을 넘는다.
     * 에스크로를 다시 읽으면(0) 정확히 맞는다(리뷰 !106 🔴).
     */
    @Test
    @DisplayName("불변식 4: 음수면 totalSupply·에스크로를 다시 읽고, 맞으면 불일치로 세우지 않는다")
    void negativeDifferenceIsRecheckedBeforeHalting() {
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(100_000L);
        when(performanceRepository.findOnChainShows())
                .thenReturn(List.<Object[]>of(new Object[] {1L, 7L}));
        when(chainReader.escrowOf(7L)).thenReturn(50_000L, 0L);
        when(chainReader.depositOf(7L)).thenReturn(0L);
        registerWallets(100_000L);

        SupplyReconciler.Snapshot snapshot = reconciler.snapshot();

        Invariant fourth = snapshot.invariants().get(3);
        assertThat(fourth.matched()).isTrue();
        assertThat(fourth.note()).contains("정확히 일치");
        assertThat(snapshot.supplyMatched()).isTrue();
        assertThat(snapshot.escrowTotal()).as("재읽은 에스크로를 쓴다").isZero();
        verify(chainReader, times(2)).totalSupply();
        verify(chainReader, times(2)).escrowOf(7L);
        // 지갑은 다시 읽지 않는다 — 비싼 쪽이고, 앞선 두 값만 늦게 읽으면 겹침이 사라진다.
        verify(chainReader, times(1)).balanceOf("0xw1");
    }

    @Test
    @DisplayName("불변식 4: 다시 읽어도 음수면 그때 불일치로 중단한다")
    void negativeDifferenceThatPersistsAfterRecheckHalts() {
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(100_000L);
        registerWallets(100_000L, 50_000L);

        SupplyReconciler.Snapshot snapshot = reconciler.snapshot();

        assertThat(snapshot.invariants().get(3).matched()).isFalse();
        assertThat(reconciler.mintHalted()).isTrue();
        verify(chainReader, times(2)).totalSupply();
    }

    /**
     * 음수를 만든 것이 스캔 중 확정된 mint 인 경우. totalSupply 는 mint 전(10만), 지갑은 mint 후(20만)로
     * 읽혔고, compute 첫머리에 집계한 mintedSum(10만)도 그 mint 를 못 봤다. totalSupply 만 다시 읽으면
     * 불변식 4 는 맞지만 불변식 1 이 mintedSum≠totalSupply 로 깨져 같은 halt 가 난다(자동 리뷰 !106 🔴).
     */
    @Test
    @DisplayName("불변식 4 재읽기: mint 가 스캔 중 확정됐으면 mintedSum 도 다시 집계해 불변식 1 이 깨지지 않는다")
    void recheckAlsoRecountsMintedSum() {
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(100_000L, 200_000L);
        when(chainJobRepository.sumAmountBySignup(any(), any())).thenReturn(100_000L, 200_000L);
        registerWallets(200_000L);

        SupplyReconciler.Snapshot snapshot = reconciler.snapshot();

        assertThat(snapshot.invariants().get(0).matched()).as("불변식 1").isTrue();
        assertThat(snapshot.invariants().get(3).matched()).as("불변식 4").isTrue();
        assertThat(snapshot.supplyMatched()).isTrue();
        assertThat(snapshot.totalSupply()).isEqualTo(200_000L);
        verify(chainJobRepository, times(2)).sumAmountBySignup(any(), any());
    }

    @Test
    @DisplayName("불변식 4 재읽기: 에스크로 재스캔이 실패하면 첫 스캔을 유지해 escrowTotal 0 을 내보내지 않는다")
    void recheckKeepsFirstEscrowScanWhenRescanFails() {
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(100_000L);
        when(performanceRepository.findOnChainShows())
                .thenReturn(List.<Object[]>of(new Object[] {1L, 7L}));
        when(chainReader.escrowOf(7L)).thenReturn(50_000L).thenThrow(new IllegalStateException("node down"));
        when(chainReader.depositOf(7L)).thenReturn(0L);
        registerWallets(100_000L);

        SupplyReconciler.Snapshot snapshot = reconciler.snapshot();

        assertThat(snapshot.escrowTotal()).as("첫 스캔 값").isEqualTo(50_000L);
        assertThat(snapshot.perPerformanceEscrow()).hasSize(1);
        assertThat(snapshot.stale()).isFalse();
        // 첫 값끼리는 여전히 음수라 불일치다 — 읽기 실패를 일치로 꾸미지 않는다.
        assertThat(snapshot.invariants().get(3).matched()).isFalse();
    }

    @Test
    @DisplayName("불변식 4: 지갑이 청크 경계를 넘어도(N = 청크×2+1) 전부 한 번씩 읽는다")
    void readsEveryWalletAcrossChunkBoundaries() {
        int n = SupplyReconciler.WALLET_CHUNK * 2 + 1;
        long[] balances = new long[n];
        Arrays.fill(balances, 1_000L);
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(n * 1_000L);
        registerWallets(balances);

        SupplyReconciler.Snapshot snapshot = reconciler.snapshot();

        assertThat(snapshot.walletTotal()).isEqualTo(n * 1_000L);
        assertThat(snapshot.invariants().get(3).note()).contains("정확히 일치")
                .contains("등록 지갑 " + n + "개 노드 조회");
        verify(chainReader, times(n)).balanceOf(anyString());
        verify(chainReader, times(1)).balanceOf("0xw" + n);
        // 꽉 찬 청크 2번 + 마지막 1개짜리 청크 1번.
        verify(walletRepository, times(3)).findChunkAfter(eq(Wallet.Status.LINKED), anyLong(), any());
    }

    /** 정확히 맞은 자리에 원인 이야기가 붙으면 이상이 있는 것으로 읽힌다(리뷰 !87 컨설턴트). */
    @Test
    @DisplayName("불변식 4: 차액이 0 이면 미등록 보유 이야기를 꺼내지 않는다")
    void exactMatchNoteSaysNothingAboutUnregistered() {
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(100_000L);
        registerWallets(50_000L, 50_000L);

        String note = reconciler.snapshot().invariants().get(3).note();

        assertThat(note).contains("정확히 일치");
        assertThat(note).doesNotContain("캐시").doesNotContain("미등록");
    }

    /**
     * {@code chainSupply} 는 읽혔는데 에스크로 스캔만 실패하면 {@code escrowTotal} 이 0 이라
     * 차액이 에스크로 전액이 된다. 그때 지갑 이야기를 하면 공용 RPC 가 깜빡일 때마다 D-44 와
     * 같은 헛수고를 부른다(리뷰 !87 2차 🔴).
     */
    @Test
    @DisplayName("불변식 4: 에스크로를 못 읽었으면 그것을 말한다 — 지갑 탓으로 돌리지 않는다")
    void escrowNotReadIsNamedBeforeWallets() {
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(300_000L);
        registerWallets(100_000L, 100_000L);
        when(performanceRepository.findOnChainShows())
                .thenReturn(List.<Object[]>of(new Object[] {1L, 7L}));
        when(chainReader.escrowOf(7L)).thenThrow(new IllegalStateException("node down"));

        SupplyReconciler.Snapshot snapshot = reconciler.snapshot();

        // 에스크로는 체인 쪽이라 stale 이 맞다.
        assertThat(snapshot.stale()).isTrue();
        assertThat(snapshot.invariants().get(3).note())
                .contains("조회 불가").contains("(미평가)")
                .contains("에스크로·보증금 미조회")
                .doesNotContain("등록 지갑 잔액 노드 미조회");
    }

    /**
     * 아무것도 못 읽어 양쪽이 0 으로 맞아떨어진 자리다. 여기에 {@code 정확히 일치} 가 찍히면
     * "못 읽었다"가 "정확히 대사됐다"로 읽힌다(리뷰 !87 3차 🔴 ②).
     */
    @Test
    @DisplayName("불변식 4: 차액 0 이어도 못 읽은 것이 있으면 '정확히 일치' 라 하지 않는다")
    void zeroDifferenceIsNotAMatchWhenNothingWasRead() {
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(0L);
        registerWallets(0L);
        when(chainReader.balanceOf("0xw1")).thenThrow(new IllegalStateException("node down"));

        String note = reconciler.snapshot().invariants().get(3).note();

        assertThat(note).contains("조회 불가").contains("(미평가)");
        assertThat(note).doesNotContain("정확히 일치");
    }

    @Test
    @DisplayName("불변식 4: 지갑+에스크로가 발행량을 넘으면(음수) 중단한다")
    void haltsWhenCountedBalanceExceedsSupply() {
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(100_000L);
        registerWallets(100_000L, 50_000L);

        SupplyReconciler.Snapshot snapshot = reconciler.snapshot();

        assertThat(snapshot.invariants().get(3).matched()).isFalse();
        assertThat(snapshot.supplyMatched()).isFalse();
        assertThat(reconciler.mintHalted()).isTrue();
        // 음수 = 우리 장부 과대계상이지 미등록 보유가 아니다(자동 리뷰 !87 6차).
        // 달려온 사람이 먼저 묻는 "기다리면 풀리나"에 note 가 답해야 한다(!113 리뷰).
        assertThat(snapshot.invariants().get(3).note())
                .contains("있을 수 없는 코인")
                .contains("다음 주기에 풀리면 후자")
                .doesNotContain("미등록");
        // 인자 순서도 고정한다(리뷰 !88 🟡). expected=counted, actual=totalSupply.
        assertThat(snapshot.invariants().get(3).expected()).isEqualTo(150_000L);
        assertThat(snapshot.invariants().get(3).actual()).isEqualTo(100_000L);
    }

    @Test
    @DisplayName("불변식 2: 공연별 escrowOf가 purchase−refund−release와 다르면 불일치로 센다")
    void countsPerShowEscrowMismatch() {
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(100_000L);
        when(performanceRepository.findOnChainShows())
                .thenReturn(List.<Object[]>of(new Object[]{1L, 7L}));
        when(chainReader.escrowOf(7L)).thenReturn(50_000L);
        when(chainReader.depositOf(7L)).thenReturn(50_000L);
        when(chainJobRepository.sumAmountByPerformanceAndTxType(any(), any()))
                .thenReturn(List.<Object[]>of(new Object[]{1L, ChainJob.TxType.PURCHASE, 60_000L}));

        SupplyReconciler.Snapshot snapshot = reconciler.snapshot();

        Invariant second = snapshot.invariants().get(1);
        assertThat(second.name()).isEqualTo("ESCROW_PER_SHOW");
        assertThat(second.checkedShows()).isEqualTo(1);
        assertThat(second.mismatchedShows()).isEqualTo(1);
        assertThat(second.matched()).isFalse();
        // 보증금은 R이 아니지만 escrowTotal(=지갑 밖에 잠긴 코인)에는 들어간다.
        assertThat(snapshot.escrowTotal()).isEqualTo(100_000L);
        assertThat(snapshot.perPerformanceEscrow()).hasSize(1);
        // 불변식 2는 supplyMatched 판정에 들어가지 않는다(1·4만 본다).
        assertThat(snapshot.supplyMatched()).isTrue();
    }

    /**
     * 리허설 2(D-71)의 공연 11 재현. 보증금은 {@code createShow} 직후 온체인에 들어가는데 공연 상태는
     * 아직 {@code PENDING_AGREEMENT}였다. 상태로 거르던 스캔이 그 공연을 빠뜨려 불변식 4 차액이
     * 보증금만큼(기대 100,000 → 실측 150,000) 커졌다. 이제 {@code on_chain_id}만 보므로 다시 0이다.
     *
     * <p>판매 전이라 {@code purchase}·{@code refund}·{@code release}가 0건이고 {@code escrowOf}도 0 —
     * 불변식 2 는 0 = 0 으로 맞는다. 보증금은 {@code ESCROW_FLOW}에 없어 기대값에 섞이지 않는다.
     */
    @Test
    @DisplayName("불변식 4: 판매 전 공연(PENDING_AGREEMENT)의 온체인 보증금도 escrowTotal에 들어간다")
    void countsDepositOfShowBeforeSaleStarts() {
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(150_000L);
        // 불변식 1 은 이 테스트의 관심이 아니다 — Σ Minted 를 발행량에 맞춰 두지 않으면
        // supplyMatched 가 1번 때문에 false 가 되어 4번의 판정을 가린다.
        when(chainJobRepository.sumAmountBySignup(any(), any())).thenReturn(150_000L);
        // 공연 11 — 상태는 PENDING_AGREEMENT 지만 on_chain_id 가 있어 스캔 대상이다(쿼리에 상태 조건 없음).
        when(performanceRepository.findOnChainShows())
                .thenReturn(List.<Object[]>of(new Object[]{11L, 11L}));
        when(chainReader.escrowOf(11L)).thenReturn(0L);
        when(chainReader.depositOf(11L)).thenReturn(50_000L);
        registerWallets(100_000L);

        SupplyReconciler.Snapshot snapshot = reconciler.snapshot();

        assertThat(snapshot.escrowTotal()).as("보증금 50,000이 합산된다").isEqualTo(50_000L);
        assertThat(snapshot.perPerformanceEscrow()).hasSize(1);
        assertThat(snapshot.perPerformanceEscrow().get(0).depositAmount()).isEqualTo(50_000L);

        Invariant fourth = snapshot.invariants().get(3);
        assertThat(fourth.matched()).as("150,000 = 지갑 100,000 + 보증금 50,000").isTrue();
        assertThat(fourth.expected()).isEqualTo(150_000L);
        assertThat(fourth.actual()).isEqualTo(150_000L);
        assertThat(fourth.note()).contains("정확히 일치");
        // 판매 전 공연이 불변식 2를 오탐하지 않는다 — 기대 0, escrowOf 0.
        Invariant second = snapshot.invariants().get(1);
        assertThat(second.checkedShows()).isEqualTo(1);
        assertThat(second.mismatchedShows()).isZero();
        assertThat(second.matched()).isTrue();
        assertThat(snapshot.invariants().get(0).matched()).as("불변식 1").isTrue();
        assertThat(snapshot.supplyMatched()).isTrue();
        assertThat(reconciler.mintHalted()).isFalse();
    }

    @Test
    @DisplayName("공연 하나라도 못 읽으면 부분 합계를 내보내지 않고 stale로 답한다")
    void doesNotPublishPartialEscrowTotal() {
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(100_000L);
        when(performanceRepository.findOnChainShows())
                .thenReturn(List.<Object[]>of(new Object[]{1L, 7L}, new Object[]{2L, 8L}));
        when(chainReader.escrowOf(7L)).thenReturn(50_000L);
        when(chainReader.depositOf(7L)).thenReturn(0L);
        when(chainReader.escrowOf(8L)).thenThrow(new IllegalStateException("node down"));

        SupplyReconciler.Snapshot snapshot = reconciler.snapshot();

        assertThat(snapshot.escrowTotal()).isZero();
        assertThat(snapshot.perPerformanceEscrow()).isEmpty();
        assertThat(snapshot.stale()).isTrue();
    }

    @Test
    @DisplayName("1분 캐시 — 연속 조회는 노드를 다시 때리지 않는다")
    void cachesSnapshotForOneMinute() {
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(100_000L);

        reconciler.snapshot();
        reconciler.snapshot();
        verify(chainReader, times(1)).totalSupply();

        reconciler.invalidate();
        reconciler.snapshot();
        verify(chainReader, times(2)).totalSupply();
    }

    // ------------------------------------------------------------------ 운영자 알림 (S15P21B204-78)

    @Test
    @DisplayName("halt 알림은 전환 때만 — 정상→정상 0, 정상→halt 1, halt→halt 0, halt→복구 1")
    void alertsOnlyOnHaltTransition() {
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(100_000L);
        reconciler.refresh();
        reconciler.refresh();
        verify(opsAlert, never()).send(anyString());

        when(chainReader.totalSupply()).thenReturn(500_000L); // 불변식 1 깨짐
        reconciler.refresh();
        verify(opsAlert, times(1)).send(anyString());

        reconciler.refresh();
        reconciler.invalidate(); // 캐시를 비워도 같은 halt 를 다시 알리지 않는다
        reconciler.refresh();
        verify(opsAlert, times(1)).send(anyString());

        when(chainReader.totalSupply()).thenReturn(100_000L);
        reconciler.refresh();
        org.mockito.ArgumentCaptor<String> sent = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(opsAlert, times(2)).send(sent.capture());
        assertThat(sent.getAllValues().get(0))
                .contains("mintHalted=true", "releaseHalted=true", "#1 SUPPLY_EQUALS_MINTED",
                        "expected 100000, actual 500000");
        assertThat(sent.getAllValues().get(1)).contains("복구");
    }

    @Test
    @DisplayName("기동 직후 첫 스냅샷이 halt 면 1회 알린다 — 스냅샷 전 게이트는 열려 있으므로 직전은 정상이다")
    void alertsWhenFirstSnapshotIsHalted() {
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(500_000L);

        reconciler.snapshot();
        reconciler.snapshot(); // 캐시 적중 — 다시 계산하지 않는다
        reconciler.refresh();

        verify(opsAlert, times(1)).send(anyString());
    }

    @Test
    @DisplayName("체인을 못 읽은 스냅샷(stale·불변식 1·4 미평가)은 전환으로 보지 않는다 — halt 중 RPC 깜빡임에 복구 알림 0")
    void ignoresUnevaluatedSnapshotForAlerts() {
        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(500_000L);
        reconciler.refresh(); // halt 1
        verify(opsAlert, times(1)).send(anyString());

        when(chainReader.isAvailable()).thenReturn(false); // stale, 불변식 1·4 미평가 = matched
        reconciler.refresh();
        verify(opsAlert, times(1)).send(anyString());

        when(chainReader.isAvailable()).thenReturn(true); // 노드 복귀, 여전히 halt — 이미 알렸다
        reconciler.refresh();
        verify(opsAlert, times(1)).send(anyString());

        when(chainReader.totalSupply()).thenReturn(100_000L); // 진짜 정상
        reconciler.refresh();
        org.mockito.ArgumentCaptor<String> sent = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(opsAlert, times(2)).send(sent.capture());
        assertThat(sent.getAllValues().get(1)).contains("복구");
    }

    /**
     * 깜빡임은 넘기지만 <b>지속</b>은 침묵하지 않는다(!110 후속). 지갑 하나의 {@code balanceOf}가 계속
     * 실패하면 불변식 4 가 매 주기 미평가라, 그 사이 난 halt 가 아무에게도 안 보이는 창이 다시 생긴다.
     */
    @Test
    @DisplayName("미평가가 N주기 연속이면 1회만 알리고, 다시 평가되면 재개를 1회 알린다")
    void alertsWhenUnevaluatedPersists() {
        when(chainReader.isAvailable()).thenReturn(false); // stale · 불변식 1·4 미평가
        for (int i = 0; i < SupplyReconciler.UNEVALUATED_ALERT_CYCLES - 1; i++) {
            reconciler.refresh();
        }
        verify(opsAlert, never()).send(anyString()); // N 주기 미만은 조용하다

        reconciler.refresh(); // N 주기째 — 1회
        org.mockito.ArgumentCaptor<String> first = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(opsAlert, times(1)).send(first.capture());
        assertThat(first.getValue()).contains("대사 미평가 지속", "판정 중단", "사유:", "미평가");

        for (int i = 0; i < 5; i++) {
            reconciler.refresh(); // 계속 미평가여도 추가 0건
        }
        verify(opsAlert, times(1)).send(anyString());

        when(chainReader.isAvailable()).thenReturn(true); // 재평가 — 정상이라 halt 알림은 없다
        when(chainReader.totalSupply()).thenReturn(100_000L);
        reconciler.refresh();
        org.mockito.ArgumentCaptor<String> resumed = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(opsAlert, times(2)).send(resumed.capture());
        assertThat(resumed.getAllValues().get(1)).contains("재개");

        reconciler.refresh(); // 재개 알림도 1회뿐이다
        verify(opsAlert, times(2)).send(anyString());
    }

    /**
     * 미평가 중에 난 halt 는 재평가 시점에 알린다 — 지속 알림이 그 자리를 대신하지 않는다.
     */
    @Test
    @DisplayName("미평가 지속 알림 뒤 재평가에서 halt 면 재개 1회 + halt 1회")
    void alertsHaltFoundAfterUnevaluatedPeriod() {
        when(chainReader.isAvailable()).thenReturn(false);
        for (int i = 0; i < SupplyReconciler.UNEVALUATED_ALERT_CYCLES; i++) {
            reconciler.refresh();
        }
        verify(opsAlert, times(1)).send(anyString());

        when(chainReader.isAvailable()).thenReturn(true);
        when(chainReader.totalSupply()).thenReturn(500_000L); // 미평가 사이에 불변식 1 이 깨져 있었다
        reconciler.refresh();

        org.mockito.ArgumentCaptor<String> sent = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(opsAlert, times(3)).send(sent.capture());
        assertThat(sent.getAllValues().get(1)).contains("재개");
        assertThat(sent.getAllValues().get(2)).contains("halt", "mintHalted=true");
    }
}
