package com.ssafy.b204.settlement;

import com.ssafy.b204.settlement.service.SettlementChainReader;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * 테스트용 온체인 값 — Kairos를 부르지 않는다.
 *
 * <p>정산 게이트의 판정은 "체인이 뭐라고 하는가"에 달려 있으므로, 그 답을 <b>테스트가 정할 수 있어야</b>
 * 대사 불일치·에스크로 부족 같은 경로를 재현할 수 있다. 실체인을 부르는 통합 테스트는
 * {@code @Tag("kairos")}로 따로 둔다(settlement-api §9).
 *
 * <p>호출을 <b>기록도 한다</b>({@link #choiceCountsCalls}·{@link #choiceCountsInTransaction}).
 * 불변식 3 대사가 ① DB 트랜잭션을 닫은 뒤 체인을 부르는지 ② release 게이트가 체인 스캔을
 * 유발하지 않는지를 단정하려면 "몇 번, 어떤 상태에서 불렸나"가 관측 가능해야 한다(MR !73 리뷰).
 */
public class FakeSettlementChainReader implements SettlementChainReader {

    public boolean available = true;
    public Long escrow;
    public Long deposit = 0L;
    public long[] counts;
    public long[] payouts;

    /** {@link #choiceCountsOf} 호출 횟수 — 대사 스캔이 돌았는지의 지표. */
    public int choiceCountsCalls;

    /** {@link #escrowOf} 호출 횟수 — 게이트에 막힌 release 가 RPC 를 치지 않는지의 지표. */
    public int escrowOfCalls;

    /**
     * {@link #choiceCountsOf} 호출 시점에 <b>실제 DB 트랜잭션이 열려 있었는가</b>(호출 순서대로).
     *
     * <p>{@code SettlementConfirmationService}처럼 쓰기 트랜잭션 안에서 부르는 정상 경로가 따로
     * 있으므로, 검사할 구간 앞에서 {@link #clearCallLog()}로 비우고 확인한다.
     */
    public final List<Boolean> choiceCountsInTransaction = new CopyOnWriteArrayList<>();

    public void reset() {
        available = true;
        escrow = null;
        deposit = 0L;
        counts = null;
        payouts = null;
        clearCallLog();
    }

    public void clearCallLog() {
        choiceCountsCalls = 0;
        escrowOfCalls = 0;
        choiceCountsInTransaction.clear();
    }

    @Override
    public boolean isAvailable() {
        return available;
    }

    @Override
    public Optional<Long> escrowOf(long showId) {
        escrowOfCalls++;
        return available ? Optional.ofNullable(escrow) : Optional.empty();
    }

    @Override
    public Optional<Long> depositOf(long showId) {
        return available ? Optional.ofNullable(deposit) : Optional.empty();
    }

    @Override
    public Optional<long[]> choiceCountsOf(long showId) {
        choiceCountsCalls++;
        choiceCountsInTransaction.add(TransactionSynchronizationManager.isActualTransactionActive());
        return available ? Optional.ofNullable(counts) : Optional.empty();
    }

    @Override
    public Optional<long[]> payoutsOf(long showId) {
        return available ? Optional.ofNullable(payouts) : Optional.empty();
    }

    @Override
    public Optional<Integer> stageOf(long showId) {
        return available ? Optional.of(2) : Optional.empty();
    }
}
