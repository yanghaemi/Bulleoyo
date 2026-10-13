package com.ssafy.b204.settlement;

import static org.assertj.core.api.Assertions.assertThat;

import com.ssafy.b204.chain.service.ChainJobConfirmationService;
import com.ssafy.b204.support.IntegrationTestBase;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 취소 공연 보증금 반환 스윕의 <b>에스크로 게이트</b>(S15P21B204-140 · MR !141 자동 리뷰).
 *
 * <p>가짜 체인 리더({@code FakeSettlementChainReader})는 모든 통합 테스트가 공용으로 쓰지만
 * ({@code SharedTestBeans}), {@code IntegrationTestBase} 가 매 테스트 앞에서 "체인 미설정"
 * ({@code isAvailable() == false})으로 되돌린다. 그 상태에서는 이 게이트가 통째로 건너뛰어져 회귀해도
 * 초록이다 — <b>Fake 를 {@code reset()} 으로 켜는 곳이 여기</b>이고, 게이트 회귀는 이 테스트가 잡는다.
 *
 * <p>스윕은 취소된 공연 <b>전부</b>를 훑으므로 반환값(건수)이 아니라 이 테스트가 만든 공연의
 * {@code chain_job} 으로 단언한다.
 */
class DepositReturnSweepTest extends IntegrationTestBase {

    private static final int[] TEAM_SHARE_BP = {10_000};
    private static final long DEPOSIT = 50_000L;

    @Autowired FakeSettlementChainReader chain;
    @Autowired SettlementTestFixture fixture;
    @Autowired ChainJobConfirmationService confirmations;
    @Autowired JdbcTemplate jdbc;

    private final List<Long> performanceIds = new ArrayList<>();

    @BeforeEach
    void resetChain() {
        chain.reset();
    }

    @AfterEach
    void cleanUp() {
        for (Long performanceId : performanceIds) {
            jdbc.update("DELETE FROM chain_job WHERE target_performance_id = ?", performanceId);
            jdbc.update("UPDATE performance SET status = 'DRAFT', deposit_status = 'UNPAID' "
                    + "WHERE performance_id = ?", performanceId);
        }
        performanceIds.clear();
    }

    @Test
    @DisplayName("halt 가 확정되기 전에는 반환 job 을 걸지 않는다")
    void holdsUntilHaltConfirmed() {
        long performanceId = cancelledWithoutHalt();
        haltJob(performanceId, "PENDING");
        chain.escrow = 0L;

        confirmations.sweepCancelledDepositReturns();

        assertThat(depositReturnJobs(performanceId))
                .as("온체인 stage 가 CREATED 인데 반환을 걸면 InvalidStage 로 revert 한다").isZero();
    }

    @Test
    @DisplayName("halt 가 FAILED 로 닫혀도 반환 job 을 걸지 않는다")
    void holdsWhenHaltFailed() {
        long performanceId = cancelledWithoutHalt();
        haltJob(performanceId, "FAILED");
        chain.escrow = 0L;

        confirmations.sweepCancelledDepositReturns();

        assertThat(depositReturnJobs(performanceId))
                .as("halt 실패는 온체인이 그대로라는 뜻이다").isZero();
    }

    @Test
    @DisplayName("에스크로가 남아 있으면 반환 job 을 걸지 않는다")
    void holdsWhileEscrowRemains() {
        long performanceId = cancelledWithDeposit();
        chain.escrow = 25_000L;

        confirmations.sweepCancelledDepositReturns();

        assertThat(depositReturnJobs(performanceId))
                .as("에스크로가 남았는데 반환을 걸면 InsufficientEscrow 로 revert 한다").isZero();
    }

    @Test
    @DisplayName("에스크로를 읽지 못하면 걸지 않고 다음 주기를 기다린다")
    void holdsWhenEscrowUnreadable() {
        long performanceId = cancelledWithDeposit();
        chain.escrow = null; // 조회 실패(노드 타임아웃)와 같은 모양이다.

        confirmations.sweepCancelledDepositReturns();

        assertThat(depositReturnJobs(performanceId))
                .as("읽지 못한 것을 '비었다'로 읽으면 죽은 job 이 고정 멱등키로 굳는다").isZero();
    }

    @Test
    @DisplayName("에스크로가 비면 반환 job 을 걸고, 다시 돌아도 하나뿐이다")
    void enqueuesOnceWhenEscrowEmpty() {
        long performanceId = cancelledWithDeposit();
        chain.escrow = 0L;

        confirmations.sweepCancelledDepositReturns();
        assertThat(depositReturnJobs(performanceId)).isEqualTo(1);

        // 반환이 확정되기 전까지 공연은 CANCELLED + PAID 라 다음 주기에도 대상이다.
        // 멱등키가 공연당 하나라 job 은 늘어나지 않는다.
        confirmations.sweepCancelledDepositReturns();
        assertThat(depositReturnJobs(performanceId)).isEqualTo(1);
    }

    @Test
    @DisplayName("반환 job 이 FAILED 면 멱등키를 밀고 새 job 을 건다")
    void retriesFailedReturnJob() {
        long performanceId = cancelledWithDeposit();
        chain.escrow = 0L;

        confirmations.sweepCancelledDepositReturns();
        assertThat(depositReturnJobs(performanceId)).isEqualTo(1);
        // 나간 tx 가 revert 하거나 타임아웃으로 닫힌 상태.
        jdbc.update("UPDATE chain_job SET status = 'FAILED', failure_reason = 'CHAIN_TX_TIMEOUT' "
                + "WHERE target_performance_id = ? AND tx_type = 'DEPOSIT_RETURN'", performanceId);

        confirmations.sweepCancelledDepositReturns();

        // 워커는 PENDING 만 집는다 — 죽은 job 을 재생하면 보증금이 영구히 PAID 로 굳는다.
        assertThat(depositReturnJobs(performanceId))
                .as("FAILED job 을 재생만 하고 새 job 을 만들지 않았다").isEqualTo(2);
        assertThat(pendingDepositReturnJobs(performanceId))
                .as("새 job 이 PENDING 이어야 워커가 집는다").isEqualTo(1);
    }

    @Test
    @DisplayName("반환이 3회 실패하면 자동 재시도를 멈춘다")
    void stopsAfterAttemptCap() {
        long performanceId = cancelledWithDeposit();
        chain.escrow = 0L;

        // 걸고 실패시키기를 반복한다 — 상한(3)에 닿으면 더 만들지 않아야 한다.
        for (int i = 0; i < 5; i++) {
            confirmations.sweepCancelledDepositReturns();
            jdbc.update("UPDATE chain_job SET status = 'FAILED', failure_reason = 'CHAIN_TX_TIMEOUT' "
                    + "WHERE target_performance_id = ? AND tx_type = 'DEPOSIT_RETURN'", performanceId);
        }

        assertThat(depositReturnJobs(performanceId))
                .as("상한을 넘겨 계속 tx 를 내보내면 대납 가스만 태운다").isEqualTo(3);
    }

    /** 판매 전 취소와 같은 상태 — 환불 대상이 없고 보증금만 온체인에 남아 있다. */
    private long cancelledWithDeposit() {
        long performanceId = cancelledWithoutHalt();
        haltJob(performanceId, "CONFIRMED");
        return performanceId;
    }

    /** halt 를 아직 접수만 한 상태(온체인 stage 는 CREATED 다). */
    private long cancelledWithoutHalt() {
        SettlementTestFixture.World world = fixture.createWorld(10_000, 0, TEAM_SHARE_BP);
        long performanceId = world.performance().getPerformanceId();
        performanceIds.add(performanceId);
        jdbc.update("UPDATE performance SET status = 'CANCELLED', deposit_status = 'PAID', "
                        + "deposit_amount = ?, on_chain_id = ? WHERE performance_id = ?",
                DEPOSIT, performanceId, performanceId);
        return performanceId;
    }

    private void haltJob(long performanceId, String status) {
        jdbc.update("INSERT INTO chain_job (tx_type, status, target_performance_id, "
                        + "idempotency_key) VALUES ('HALT', ?, ?, ?)",
                status, performanceId, "test:halt:" + performanceId + ":" + status);
    }

    private int pendingDepositReturnJobs(long performanceId) {
        Integer count = jdbc.queryForObject("SELECT count(*) FROM chain_job "
                        + "WHERE target_performance_id = ? AND tx_type = 'DEPOSIT_RETURN' "
                        + "AND status = 'PENDING'",
                Integer.class, performanceId);
        return count == null ? 0 : count;
    }

    private int depositReturnJobs(long performanceId) {
        Integer count = jdbc.queryForObject("SELECT count(*) FROM chain_job "
                        + "WHERE target_performance_id = ? AND tx_type = 'DEPOSIT_RETURN'",
                Integer.class, performanceId);
        return count == null ? 0 : count;
    }
}
