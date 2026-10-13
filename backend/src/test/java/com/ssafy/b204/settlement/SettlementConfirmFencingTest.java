package com.ssafy.b204.settlement;

import static org.assertj.core.api.Assertions.assertThat;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.service.ChainJobConfirmationService;
import com.ssafy.b204.chain.service.TxReceipt;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.settlement.entity.Settlement;
import com.ssafy.b204.settlement.event.SettlementPayoutConfirmedEvent;
import com.ssafy.b204.settlement.repository.SettlementChainJobRepository;
import com.ssafy.b204.settlement.repository.SettlementRepository;
import com.ssafy.b204.settlement.service.SettlementCalculator;
import com.ssafy.b204.settlement.service.SettlementConfirmationService;
import com.ssafy.b204.settlement.service.SettlementService;
import com.ssafy.b204.support.IntegrationTestBase;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 정산 확정 반영의 펜싱 — 두 인스턴스가 같은 {@code CONFIRMED} job 을 동시에 반영해도 <b>상태 전이는
 * 한 번</b>이고, 한 공연의 실패가 다른 공연의 반영을 되돌리지 않는다(S15P21B204-119).
 *
 * <p><b>클래스에 {@code @Transactional} 을 두지 않는다.</b> 테스트 트랜잭션 하나에 두 스레드를 넣으면
 * 잠금 경합 자체가 사라져 운영 결함을 가린다 — {@code ChainJobConfirmFencingTest}(!115)가 선례다.
 * 실제 빈 · 실제 트랜잭션 경계로 돌고, 커밋된 행은 {@link #cleanUp()} 이 지운다.
 *
 * <p><b>기본 tx_type 은 AGGREGATE 다.</b> 중복 반영의 피해가 가장 또렷하다 —
 * {@code settlement_share} 가 팀 수의 두 배로 들어가려다 {@code uk_settlement_team} 에 걸린다.
 * 즉 "행 수 = 팀 수" 하나로 중복 여부를 단정할 수 있다.
 *
 * <p><b>{@code DEPOSIT_RETURN} 만 따로 본다.</b> 그 분기는 잠그는 행({@code settlement})과 바꾸는 행
 * ({@code performance})이 달라 정산 행 잠금이 덮지 못한다 — 펜싱이
 * {@code performance.deposit_status} 조건부 UPDATE 로 따로 서 있다(MR !125 리뷰 🟡).
 *
 * <p><b>{@code HALT} 확정도 같은 정산 행을 건드린다</b>({@code ChainJobConfirmationService.confirmHalt}
 * — 정산 도메인이 API-performance-12 에 위임해 둔 전이다). 그쪽은 피해가 status 가 아니라 <b>덮인
 * 집계 근거</b>로 드러나 단언이 다르다({@link #concurrentHaltConfirmKeepsAggregate}, S15P21B204-148).
 */
class SettlementConfirmFencingTest extends IntegrationTestBase {

    /** 요구사항 §7.3 예시와 같은 모양 — 3팀 · 5000/5000 · 3334/3333/3333. */
    private static final int[] TEAM_SHARE_BP = {3334, 3333, 3333};
    private static final long ESCROW = 60_000L;
    private static final long[] COUNTS = {3, 2, 1};

    @Autowired SettlementService settlementService;
    @Autowired SettlementConfirmationService confirmationService;
    /** HALT 확정은 체인 쪽 확정 서비스가 한다 — 정산 도메인이 -12에 위임해 둔 전이다. */
    @Autowired ChainJobConfirmationService chainConfirmations;
    @Autowired SettlementRepository settlementRepository;
    @Autowired SettlementChainJobRepository chainJobRepository;
    @Autowired SettlementTestFixture fixture;
    @Autowired FakeSettlementChainReader chain;
    @Autowired PayoutEventCounter payoutEvents;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactionManager;

    /** 이 클래스가 만든 공연 — 남긴 확정 job 이 다른 테스트 클래스의 훑기에 섞이지 않게 지운다. */
    private final List<Long> performanceIds = new ArrayList<>();

    /** Fake 는 공용 컨텍스트의 빈이다 — 기본값(available=true)에서 시작한다. */
    @BeforeEach
    void resetChain() {
        chain.reset();
    }

    @AfterEach
    void cleanUp() {
        for (Long performanceId : performanceIds) {
            jdbc.update("DELETE FROM chain_job WHERE target_performance_id = ?", performanceId);
            jdbc.update("DELETE FROM settlement_share WHERE settlement_id IN "
                    + "(SELECT settlement_id FROM settlement WHERE performance_id = ?)",
                    performanceId);
            jdbc.update("DELETE FROM settlement WHERE performance_id = ?", performanceId);
        }
        performanceIds.clear();
    }

    /**
     * A 가 집계를 반영하고 <b>커밋하지 않은 채</b> 멈춘 사이 B 가 같은 job 을 반영하려 한다.
     *
     * <p>B 는 A 커밋 <b>전에</b> 같은 정산 행을 일반 읽기로 한 번 본다 — REPEATABLE READ 의 읽기
     * 스냅숏이 그때 만들어져, 이후 일반 읽기는 계속 {@code NONE} 을 본다. 그래도 확정 반영의 잠금
     * 읽기는 A 커밋까지 기다렸다가 <b>최신 커밋({@code AGGREGATED})</b>을 읽어야 한다. 잠금 없는
     * {@code findByPerformance_PerformanceId} 로 되돌리면 B 는 기다리지 않고 스냅숏의 {@code NONE}
     * 을 보고 분배 내역을 한 벌 더 넣는다.
     *
     * <p><b>MR !125 이후 이 테스트가 잡는 것이 하나 더 늘었다.</b> 확정 반영은 이제 잠금을 잡기
     * <b>전에</b> 정산을 일반 읽기로 한 번 로드한다(체인 {@code eth_call} 3회를 잠금 밖에서
     * 끝내려고). 그래서 잠금을 {@code em.refresh(settlement, PESSIMISTIC_WRITE)} 가 아니라 잠금
     * 파인더({@code @Lock(PESSIMISTIC_WRITE)} 쿼리 메서드 — 역검증 때 임시로 만들어 씀)로 잡으면, 잠금은 잡히지만 Hibernate 1차 캐시의
     * {@code NONE} 인스턴스가 갱신되지 않아 B 가 <b>기다린 뒤에도</b> 분배 내역을 한 벌 더 넣는다
     * ({@code uk_settlement_team} 위반). 즉 이 테스트는 "잠금을 잡는가"와 "잠금 뒤 가드가 최신
     * 커밋을 보는가"를 둘 다 본다 — 역검증 완료(그 치환으로 실제 실패를 확인했다).
     */
    @Test
    @DisplayName("두 인스턴스가 같은 CONFIRMED AGGREGATE job 을 동시에 반영해도 전이는 한 번뿐이다")
    void concurrentApplyTransitionsOnce() throws Exception {
        SettlementTestFixture.World world = aggregatableWorld();
        ChainJob job = confirmedAggregateJob(world);
        Long settlementId = settlementOf(world).getSettlementId();

        CountDownLatch aApplied = new CountDownLatch(1);
        CountDownLatch releaseA = new CountDownLatch(1);
        CountDownLatch bSnapshotTaken = new CountDownLatch(1);
        AtomicReference<String> bSnapshotStatus = new AtomicReference<>();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Boolean> a = pool.submit(() ->
                    new TransactionTemplate(transactionManager).execute(status -> {
                        boolean result = confirmationService.apply(job);
                        aApplied.countDown();
                        awaitQuietly(releaseA);
                        return result;
                    }));
            assertThat(aApplied.await(30, TimeUnit.SECONDS)).as("A 가 반영까지 가지 못했다").isTrue();

            Future<Boolean> b = pool.submit(() ->
                    new TransactionTemplate(transactionManager).execute(status -> {
                        bSnapshotStatus.set(jdbc.queryForObject(
                                "SELECT status FROM settlement WHERE settlement_id = ?",
                                String.class, settlementId));
                        bSnapshotTaken.countDown();
                        return confirmationService.apply(job);
                    }));
            assertThat(bSnapshotTaken.await(30, TimeUnit.SECONDS)).isTrue();
            // B 가 잠금 앞에 설 시간을 준다. 잠금이 없으면 B 는 이 사이에 끝난다.
            Thread.sleep(500);
            boolean bFinishedBeforeACommit = b.isDone();
            releaseA.countDown();

            assertThat(a.get(30, TimeUnit.SECONDS)).as("A 가 전이시켰어야 한다").isTrue();
            assertThat(b.get(30, TimeUnit.SECONDS)).as("B 는 이미 전이된 상태를 보고 물러나야 한다")
                    .isFalse();

            assertThat(jdbc.queryForObject("SELECT status FROM settlement WHERE settlement_id = ?",
                    String.class, settlementId)).isEqualTo("AGGREGATED");
            assertThat(jdbc.queryForObject(
                    "SELECT COUNT(*) FROM settlement_share WHERE settlement_id = ?",
                    Integer.class, settlementId))
                    .as("분배 내역이 팀 수만큼만 있어야 한다 — 두 배면 중복 반영이다")
                    .isEqualTo(TEAM_SHARE_BP.length);
            // B 의 스냅숏은 A 커밋 전에 만들어졌다 — 그런데도 중복 반영을 안 했다 = 잠금 읽기가 최신을 봤다.
            assertThat(bSnapshotStatus.get()).isEqualTo("NONE");
            assertThat(bFinishedBeforeACommit).as("B 가 A 커밋 전에 끝났다 — 행 잠금을 기다리지 않았다")
                    .isFalse();
        } finally {
            releaseA.countDown();
            pool.shutdownNow();
            pool.awaitTermination(30, TimeUnit.SECONDS);
        }
    }

    /**
     * 한 공연의 반영이 터져도 다른 공연은 커밋된다.
     *
     * <p>{@code applyConfirmedJobs()} 가 {@code @Transactional} 이고 안에서 {@code apply} 를
     * <b>자기 호출</b>하던 동안은 한 tick 전체가 한 트랜잭션이었다. 그래서 첫 공연이 남긴 JPA 예외가
     * 트랜잭션을 rollback-only 로 만들어, {@code catch} 로 삼키고 계속 돈 두 번째 공연의 반영까지
     * 통째로 사라졌다 — 그 {@code catch} 의 주석("한 공연의 실패가 다른 공연의 반영을 막지 않게")과
     * 정반대다.
     *
     * <p>터뜨리는 방법은 실제 운영 결함과 같은 것으로 고른다 — 분배 내역 한 줄을 미리 넣어
     * {@code uk_settlement_team} 을 밟게 한다. 커밋 시점 flush 에서 터지므로 <b>그 공연의
     * 트랜잭션만</b> 되돌아가야 한다.
     */
    @Test
    @DisplayName("한 공연의 반영이 실패해도 다른 공연의 반영은 커밋된다")
    void failureOfOneShowDoesNotRollBackAnother() {
        SettlementTestFixture.World poisoned = aggregatableWorld();
        ChainJob poisonedJob = confirmedAggregateJob(poisoned);
        SettlementTestFixture.World healthy = aggregatableWorld();
        ChainJob healthyJob = confirmedAggregateJob(healthy);
        // 먼저 훑히는 쪽이 터져야 "그 뒤가 살아남는가" 를 본다.
        assertThat(poisonedJob.getChainJobId()).isLessThan(healthyJob.getChainJobId());

        Long poisonedSettlementId = settlementOf(poisoned).getSettlementId();
        jdbc.update("INSERT INTO settlement_share (settlement_id, team_id, equal_amount, "
                        + "selection_amount, dust_amount, total_amount, choice_count) "
                        + "VALUES (?, ?, 0, 0, 0, 0, 0)",
                poisonedSettlementId, poisoned.teams().get(0).getTeamId());

        confirmationService.applyConfirmedJobs();

        assertThat(settlementOf(poisoned).getStatus())
                .as("중복 INSERT 로 터진 공연은 되돌아가야 한다").isEqualTo(Settlement.Status.NONE);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM settlement_share WHERE settlement_id = ?",
                Integer.class, poisonedSettlementId))
                .as("미리 넣은 한 줄만 남아야 한다").isEqualTo(1);

        Long healthySettlementId = settlementOf(healthy).getSettlementId();
        assertThat(settlementOf(healthy).getStatus())
                .as("남의 실패에 휩쓸리지 않고 커밋돼야 한다")
                .isEqualTo(Settlement.Status.AGGREGATED);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM settlement_share WHERE settlement_id = ?",
                Integer.class, healthySettlementId)).isEqualTo(TEAM_SHARE_BP.length);
    }

    /**
     * 같은 {@code DEPOSIT_RETURN} job 을 둘이 봐도 보증금 반환은 한 번이다.
     *
     * <p><b>이 분기만 펜싱이 다르다.</b> {@code apply} 가 잠그는 행은 {@code settlement} 인데 보증금
     * 반환이 바꾸는 행은 {@code performance} 다. 그래서 B 는 정산 잠금을 기다린 뒤
     * {@code em.refresh} 로 <b>정산만</b> 최신이 되고, {@code settlement.getPerformance()} 는 B 의
     * REPEATABLE READ 스냅숏({@code PAID})을 그대로 들고 있다 — 상태 가드만으로는 B 도 통과한다.
     * 막는 것은 {@code markDepositReturned} 의 조건부 UPDATE({@code and p.depositStatus = :expected})
     * 뿐이고, UPDATE 는 스냅숏이 아니라 최신 커밋을 읽으므로 0행이 된다.
     *
     * <p><b>역검증 완료.</b> 그 {@code and} 한 줄을 지우고 돌리면 B 도 {@code true} 를 돌려주고
     * {@link SettlementPayoutConfirmedEvent} 가 두 번 발행돼 이 테스트가 실제로 깨진다.
     *
     * <p>피해가 드러나는 자리가 {@code settlement_share} 행 수가 아니라 <b>이벤트 발행 횟수</b>라
     * (같은 값으로 두 번 UPDATE 하는 것은 표에 흔적을 남기지 않는다) 세는 쪽을
     * {@link PayoutEventCounter} 로 둔다.
     */
    @Test
    @DisplayName("두 인스턴스가 같은 CONFIRMED DEPOSIT_RETURN job 을 동시에 반영해도 반환은 한 번뿐이다")
    void concurrentDepositReturnAppliesOnce() throws Exception {
        SettlementTestFixture.World world = aggregatableWorld();
        Long performanceId = world.performance().getPerformanceId();
        // 집계를 한 번 태워 settlement 행을 만든다 — 확정 반영은 그 행이 있어야 시작한다.
        confirmedAggregateJob(world);
        Long settlementId = settlementOf(world).getSettlementId();
        // release 까지 끝난 자리를 SQL 로 세운다. 이 테스트가 보는 것은 그 뒤의 보증금 반환뿐이다.
        jdbc.update("UPDATE settlement SET status = 'RELEASED' WHERE settlement_id = ?",
                settlementId);
        ChainJob job = confirmedDepositReturnJob(performanceId, settlementId);
        payoutEvents.reset();

        CountDownLatch aApplied = new CountDownLatch(1);
        CountDownLatch releaseA = new CountDownLatch(1);
        CountDownLatch bSnapshotTaken = new CountDownLatch(1);
        AtomicReference<String> bSnapshotDepositStatus = new AtomicReference<>();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Boolean> a = pool.submit(() ->
                    new TransactionTemplate(transactionManager).execute(status -> {
                        boolean result = confirmationService.apply(job);
                        aApplied.countDown();
                        awaitQuietly(releaseA);
                        return result;
                    }));
            assertThat(aApplied.await(30, TimeUnit.SECONDS)).as("A 가 반영까지 가지 못했다").isTrue();

            Future<Boolean> b = pool.submit(() ->
                    new TransactionTemplate(transactionManager).execute(status -> {
                        // 이 읽기가 B 의 스냅숏을 A 커밋 전으로 고정한다 — 이후 공연 행은 계속 PAID 다.
                        bSnapshotDepositStatus.set(jdbc.queryForObject(
                                "SELECT deposit_status FROM performance WHERE performance_id = ?",
                                String.class, performanceId));
                        bSnapshotTaken.countDown();
                        return confirmationService.apply(job);
                    }));
            assertThat(bSnapshotTaken.await(30, TimeUnit.SECONDS)).isTrue();
            // B 가 정산 행 잠금 앞에 설 시간을 준다.
            Thread.sleep(500);
            boolean bFinishedBeforeACommit = b.isDone();
            releaseA.countDown();

            assertThat(a.get(30, TimeUnit.SECONDS)).as("A 가 반환을 확정시켰어야 한다").isTrue();
            assertThat(b.get(30, TimeUnit.SECONDS))
                    .as("B 는 조건부 UPDATE 가 0행이라 물러나야 한다").isFalse();

            assertThat(jdbc.queryForObject(
                    "SELECT deposit_status FROM performance WHERE performance_id = ?",
                    String.class, performanceId)).isEqualTo("RETURNED");
            assertThat(payoutEvents.countSince())
                    .as("수령 지갑 갱신 이벤트가 두 번 나가면 중복 반영이다").isEqualTo(1);
            // B 의 스냅숏은 PAID 였다 = 상태 가드만으로는 못 막는 자리라는 증거.
            assertThat(bSnapshotDepositStatus.get()).isEqualTo("PAID");
            assertThat(bFinishedBeforeACommit).as("B 가 A 커밋 전에 끝났다 — 잠금을 기다리지 않았다")
                    .isFalse();
        } finally {
            releaseA.countDown();
            pool.shutdownNow();
            pool.awaitTermination(30, TimeUnit.SECONDS);
        }
    }

    /**
     * A 가 집계를 반영하고 <b>커밋하지 않은 채</b> 멈춘 사이 halt 확정이 같은 정산 행에 들어온다.
     *
     * <p><b>도달 경로</b>: 취소 접수({@code PerformanceService#cancel})는 {@code RELEASE} job 만
     * 막으므로 {@code CONFIRMED}-미반영 {@code AGGREGATE} job 이 남은 채로 {@code HALT} 가 큐에
     * 선다. 확정 워커의 receipt 폴링(1.5초)과 정산 반영 훑기(2초)는 스케줄러 스레드가 달라
     * (pool 4) 단일 인스턴스에서도 나란히 돈다.
     *
     * <p><b>보는 것은 status 가 아니다.</b> halt 는 두 순서 어느 쪽에서도 이기므로(가드가
     * "{@code HALTED} 가 아니면 쓴다" 하나다) 최종 status 는 늘 {@code HALTED} 다. 지키는 것은
     * <b>그 앞의 집계 근거</b>다 — halt 확정이 낡은 스냅숏을 들고 {@code markHalted()} 만 했을 때
     * Hibernate 가 전 컬럼 UPDATE 를 보내면 A 가 커밋한 {@code total_revenue}·
     * {@code aggregated_at} 이 {@code NULL} 로 덮인다. {@code settlement_share} 는 다른 표라 그대로
     * 남아 금액과 근거가 어긋난다.
     *
     * <p><b>역검증 — 네 조합을 다 돌려 봤다</b>(MR !137 자동 리뷰). 방어선이 둘이고 각각 단독으로
     * 충분해서, 이 테스트는 <b>둘이 함께 빠졌을 때만</b> {@code total_revenue} 단언에서 깨진다.
     *
     * <table>
     *   <caption>{@code confirmHalt} 잠금 × {@code Settlement} {@code @DynamicUpdate}</caption>
     *   <tr><td>둘 다</td><td>통과</td></tr>
     *   <tr><td>잠금만</td><td>통과 — {@code em.refresh} 가 스냅숏까지 A 의 커밋으로 덮어서 전
     *       컬럼 UPDATE 라도 같은 값을 다시 쓴다</td></tr>
     *   <tr><td>{@code @DynamicUpdate} 만</td><td>통과 — 낡은 스냅숏이어도 {@code status} 컬럼만
     *       UPDATE 한다</td></tr>
     *   <tr><td>둘 다 없음</td><td><b>실패</b></td></tr>
     * </table>
     *
     * <p>그래서 둘 중 하나를 "지금 통과하니까" 빼면 안 된다. 역할이 다르다 —
     * {@code @DynamicUpdate} 는 이 표를 <b>잠금 없이</b> 쓰는 다른 자리까지 덮고
     * ({@code SettlementService.issueShareToken}), 잠금은 <b>가드가 최신 커밋 status 로 판정</b>
     * 하게 한다(지금은 {@code markHalted()} 가 status 한 컬럼만 써서 바깥에서 구분되지 않는다).
     */
    @Test
    @DisplayName("HALT 확정이 동시에 와도 전이는 한 번이고 집계 근거를 지우지 않는다")
    void concurrentHaltConfirmKeepsAggregate() throws Exception {
        SettlementTestFixture.World world = aggregatableWorld();
        ChainJob aggregateJob = confirmedAggregateJob(world);
        Long performanceId = world.performance().getPerformanceId();
        Long settlementId = settlementOf(world).getSettlementId();
        ChainJob haltJob = pendingHaltJob(performanceId);

        CountDownLatch aApplied = new CountDownLatch(1);
        CountDownLatch releaseA = new CountDownLatch(1);
        CountDownLatch bSnapshotTaken = new CountDownLatch(1);
        AtomicReference<String> bSnapshotStatus = new AtomicReference<>();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Boolean> a = pool.submit(() ->
                    new TransactionTemplate(transactionManager).execute(status -> {
                        boolean result = confirmationService.apply(aggregateJob);
                        aApplied.countDown();
                        awaitQuietly(releaseA);
                        return result;
                    }));
            assertThat(aApplied.await(30, TimeUnit.SECONDS)).as("A 가 집계 반영까지 가지 못했다")
                    .isTrue();

            Future<Boolean> b = pool.submit(() ->
                    new TransactionTemplate(transactionManager).execute(status -> {
                        // 이 읽기가 B 의 스냅숏을 A 커밋 전으로 고정한다 — 이후 일반 읽기는 NONE 이다.
                        bSnapshotStatus.set(jdbc.queryForObject(
                                "SELECT status FROM settlement WHERE settlement_id = ?",
                                String.class, settlementId));
                        bSnapshotTaken.countDown();
                        return chainConfirmations.confirm(haltJob.getChainJobId(),
                                successReceipt(haltJob)).confirmed();
                    }));
            assertThat(bSnapshotTaken.await(30, TimeUnit.SECONDS)).isTrue();
            // B 가 정산 행 잠금 앞에 설 시간을 준다.
            Thread.sleep(500);
            boolean bFinishedBeforeACommit = b.isDone();
            releaseA.countDown();

            assertThat(a.get(30, TimeUnit.SECONDS)).as("A 가 집계를 전이시켰어야 한다").isTrue();
            assertThat(b.get(30, TimeUnit.SECONDS)).as("halt 는 확정돼야 한다 — 종단은 늘 이긴다")
                    .isTrue();

            assertThat(jdbc.queryForObject("SELECT status FROM settlement WHERE settlement_id = ?",
                    String.class, settlementId)).isEqualTo("HALTED");
            assertThat(jdbc.queryForObject(
                    "SELECT total_revenue FROM settlement WHERE settlement_id = ?",
                    Long.class, settlementId))
                    .as("halt 확정이 낡은 스냅숏으로 집계 금액을 덮었다").isNotNull();
            assertThat(jdbc.queryForObject(
                    "SELECT aggregated_at FROM settlement WHERE settlement_id = ?",
                    String.class, settlementId))
                    .as("halt 확정이 낡은 스냅숏으로 집계 시각을 덮었다").isNotNull();
            assertThat(jdbc.queryForObject(
                    "SELECT COUNT(*) FROM settlement_share WHERE settlement_id = ?",
                    Integer.class, settlementId))
                    .as("분배 내역이 팀 수만큼만 있어야 한다").isEqualTo(TEAM_SHARE_BP.length);
            // B 의 스냅숏은 A 커밋 전이었다 = 상태 가드만으로는 못 막는 자리라는 증거.
            assertThat(bSnapshotStatus.get()).isEqualTo("NONE");
            assertThat(bFinishedBeforeACommit)
                    .as("B 가 A 커밋 전에 끝났다 — 행 잠금을 기다리지 않았다").isFalse();
        } finally {
            releaseA.countDown();
            pool.shutdownNow();
            pool.awaitTermination(30, TimeUnit.SECONDS);
        }
    }

    @Test
    @DisplayName("정산 행이 없는 공연의 HALT 확정은 행을 만들고 HALTED 로 닫는다")
    void haltConfirmCreatesMissingSettlement() {
        Long performanceId = aggregatableWorld().performance().getPerformanceId();
        ChainJob haltJob = pendingHaltJob(performanceId);

        assertThat(chainConfirmations.confirm(haltJob.getChainJobId(), successReceipt(haltJob))
                .confirmed()).isTrue();

        assertThat(jdbc.queryForObject("SELECT status FROM settlement WHERE performance_id = ?",
                String.class, performanceId)).isEqualTo("HALTED");
    }

    /**
     * 정산 행 생성 경쟁(S15P21B204-155) — 조회·집계의 {@code ensureSettlement} 가 같은 공연 행을
     * <b>커밋하지 않은 채</b> 들고 있는 사이 halt 확정이 "없음"을 보고 만들러 들어온다.
     *
     * <p>A 는 그 행을 JPA 로 넣고 멈춘 트랜잭션이다(REQUIRES_NEW 커밋 직전의 {@code ensureSettlement}
     * 와 같은 자리). B 의 INSERT 는 A 의 UNIQUE 키를 기다리다 A 커밋 뒤 중복으로 끝난다. 예전
     * 코드는 그 INSERT 를 확정 트랜잭션 안에서 해 확정이 통째로 롤백됐다(재시도 한 칸 소모).
     *
     * <p><b>타이밍에 기대지 않는다.</b> A 를 풀기 전에 B 의 INSERT 가 실제로 잠금 대기 중인 것을
     * {@code PROCESSLIST} 로 확인한다 — 같은 DB 사용자라 권한 없이 보인다. B 는 먼저 일반 읽기로
     * 스냅숏을 A 커밋 전에 고정해, 새 행을 잠금 읽기로 가져오는지까지 본다.
     */
    @Test
    @DisplayName("HALT 확정이 정산 행 동시 생성과 부딪혀도 롤백 없이 HALTED 로 닫힌다")
    void haltConfirmSurvivesConcurrentSettlementInsert() throws Exception {
        SettlementTestFixture.World world = aggregatableWorld();
        Long performanceId = world.performance().getPerformanceId();
        ChainJob haltJob = pendingHaltJob(performanceId);

        CountDownLatch aInserted = new CountDownLatch(1);
        CountDownLatch releaseA = new CountDownLatch(1);
        AtomicReference<Integer> bSnapshotCount = new AtomicReference<>();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Long> a = pool.submit(() ->
                    new TransactionTemplate(transactionManager).execute(status -> {
                        Long id = settlementRepository.save(Settlement.builder()
                                .performance(world.performance()).build()).getSettlementId();
                        aInserted.countDown();
                        awaitQuietly(releaseA);
                        return id;
                    }));
            assertThat(aInserted.await(30, TimeUnit.SECONDS)).isTrue();

            Future<Boolean> b = pool.submit(() ->
                    new TransactionTemplate(transactionManager).execute(status -> {
                        bSnapshotCount.set(jdbc.queryForObject(
                                "SELECT COUNT(*) FROM settlement WHERE performance_id = ?",
                                Integer.class, performanceId));
                        return chainConfirmations.confirm(haltJob.getChainJobId(),
                                successReceipt(haltJob)).confirmed();
                    }));
            awaitSettlementInsertBlocked();
            releaseA.countDown();

            Long aId = a.get(30, TimeUnit.SECONDS);
            assertThat(b.get(30, TimeUnit.SECONDS)).as("halt 확정이 롤백됐다").isTrue();
            assertThat(bSnapshotCount.get()).as("B 의 스냅숏은 A 커밋 전이어야 한다").isZero();
            assertThat(jdbc.queryForList(
                    "SELECT settlement_id FROM settlement WHERE performance_id = ?",
                    Long.class, performanceId)).containsExactly(aId);
            assertThat(jdbc.queryForObject("SELECT status FROM settlement WHERE settlement_id = ?",
                    String.class, aId)).isEqualTo("HALTED");
            assertThat(jdbc.queryForObject("SELECT status FROM chain_job WHERE chain_job_id = ?",
                    String.class, haltJob.getChainJobId())).isEqualTo("CONFIRMED");
        } finally {
            releaseA.countDown();
            pool.shutdownNow();
            pool.awaitTermination(30, TimeUnit.SECONDS);
        }
    }

    // ================================================================ 도우미

    /** 집계 확정까지 갈 수 있는 공연 하나 — 6매 판매 · 팀0에 3표 · 팀1에 2표 · 팀2에 1표. */
    private SettlementTestFixture.World aggregatableWorld() {
        chain.reset();
        SettlementTestFixture.World world = fixture.createWorld(5000, 5000, TEAM_SHARE_BP);
        performanceIds.add(world.performance().getPerformanceId());
        fixture.placeOrder(world, fixture.createAudience(), world.teams().get(0), 3, 10_000L, 0);
        fixture.placeOrder(world, fixture.createAudience(), world.teams().get(1), 2, 10_000L, 0);
        fixture.placeOrder(world, fixture.createAudience(), world.teams().get(2), 1, 10_000L, 0);
        chain.escrow = ESCROW;
        chain.counts = COUNTS;
        chain.payouts = new SettlementCalculator()
                .calculate(ESCROW, 5000, 5000, TEAM_SHARE_BP, COUNTS, 0)
                .shares().stream().mapToLong(SettlementCalculator.Share::totalAmount).toArray();
        return world;
    }

    /** 집계 요청 → 워커가 하는 일(전송 → receipt 검증 → {@code CONFIRMED})을 대신한다. */
    private ChainJob confirmedAggregateJob(SettlementTestFixture.World world) {
        Long performanceId = world.performance().getPerformanceId();
        settlementService.aggregate(
                MemberPrincipal.of(world.hostLeader().getMemberId(),
                        world.hostLeader().getEmail(), world.hostLeader().isAdmin()),
                performanceId);
        ChainJob job = chainJobRepository.findAll().stream()
                .filter(j -> j.getTxType() == ChainJob.TxType.AGGREGATE
                        && performanceId.equals(j.getTargetPerformanceId())
                        && j.getStatus() == ChainJob.Status.PENDING)
                .reduce((a, b) -> b)
                .orElseThrow(() -> new IllegalStateException("AGGREGATE job 이 없다"));
        job.markConfirmed("0x" + UUID.randomUUID().toString().replace("-", "")
                + UUID.randomUUID().toString().replace("-", ""), 1);
        return chainJobRepository.save(job);
    }

    /**
     * release 확정이 연쇄로 넣는 {@code DEPOSIT_RETURN} job 을 <b>확정된 상태로</b> 만든다.
     *
     * <p>{@code applyRelease} 를 실제로 태우면 그 안의 {@code enqueue} 를 거쳐야 하는데, 이 테스트가
     * 보는 것은 release 가 아니라 그 다음 job 의 확정 반영이라 멱등키까지 같은 모양으로 직접 넣는다.
     */
    private ChainJob confirmedDepositReturnJob(Long performanceId, Long settlementId) {
        ChainJob job = chainJobRepository.save(ChainJob.builder()
                .txType(ChainJob.TxType.DEPOSIT_RETURN)
                .signerType(ChainJob.SignerType.OPERATOR)
                .issuerType(ChainJob.IssuerType.MOCK)
                .targetPerformanceId(performanceId)
                .amount(50_000L)
                .idempotencyKey("settlement:deposit-return:" + settlementId)
                .build());
        job.markConfirmed("0x" + UUID.randomUUID().toString().replace("-", "")
                + UUID.randomUUID().toString().replace("-", ""), 1);
        return chainJobRepository.save(job);
    }

    /** 공연 취소 접수가 넣는 {@code HALT} job — 확정 전({@code PENDING})이다. */
    private ChainJob pendingHaltJob(Long performanceId) {
        return chainJobRepository.save(ChainJob.builder()
                .txType(ChainJob.TxType.HALT)
                .signerType(ChainJob.SignerType.OPERATOR)
                .issuerType(ChainJob.IssuerType.MOCK)
                .targetPerformanceId(performanceId)
                .amount(10_000L)
                .idempotencyKey("performance:cancel:" + UUID.randomUUID())
                .build());
    }

    /**
     * halt 의 성공 receipt. {@code to}·{@code from} 을 비워 둔다 — 운영자 job 이라 {@code from} 대조가
     * 없고, {@code to} 는 {@code null} 이면 건너뛴다({@code ChainJobConfirmationService}).
     * {@code confirmHalt} 는 이벤트를 읽지 않는다.
     */
    private static TxReceipt successReceipt(ChainJob job) {
        return new TxReceipt("0x" + UUID.randomUUID().toString().replace("-", "")
                + UUID.randomUUID().toString().replace("-", ""), true, null, null,
                job.getChainJobId(), List.of());
    }

    private Settlement settlementOf(SettlementTestFixture.World world) {
        return settlementRepository
                .findByPerformance_PerformanceId(world.performance().getPerformanceId())
                .orElseThrow();
    }

    /** 다른 연결의 정산 INSERT 가 잠금 대기에 들어갈 때까지 기다린다 — 30초 넘으면 실패. */
    private void awaitSettlementInsertBlocked() throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
        while (jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.PROCESSLIST "
                + "WHERE INFO LIKE 'insert into settlement %'", Integer.class) == 0) {
            assertThat(System.nanoTime()).as("B 의 정산 INSERT 가 대기에 들어가지 않았다")
                    .isLessThan(deadline);
            Thread.sleep(20);
        }
    }

    private static void awaitQuietly(CountDownLatch latch) {
        try {
            if (!latch.await(30, TimeUnit.SECONDS)) {
                throw new IllegalStateException("A 해제 신호가 오지 않았다");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }
}
