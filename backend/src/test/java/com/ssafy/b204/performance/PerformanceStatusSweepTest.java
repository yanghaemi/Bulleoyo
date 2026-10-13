package com.ssafy.b204.performance;

import static org.assertj.core.api.Assertions.assertThat;

import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.entity.PerformanceParticipant;
import com.ssafy.b204.performance.repository.PerformanceParticipantRepository;
import com.ssafy.b204.performance.service.PerformanceService;
import com.ssafy.b204.rule.entity.SettlementRule;
import com.ssafy.b204.rule.repository.SettlementRuleRepository;
import com.ssafy.b204.settlement.SettlementTestFixture;
import com.ssafy.b204.settlement.service.SettlementGates;
import com.ssafy.b204.support.IntegrationTestBase;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 공연 상태 자동 전이 — {@code ON_SALE} → {@code SALE_CLOSED} → {@code ENDED}
 * (요구사항 명세서 v5 §공연 상태).
 *
 * <p>이 전이가 없어 {@code SettlementGates#aggregate}의 {@code ENDED} 조건이 영구히 막혀 있었다.
 * 그래서 {@link #settlementAggregateGateBecomesReachable()}이 이 카드의 <b>완료 기준</b>이다 —
 * 나머지 테스트는 전이 자체를, 그 하나는 전이의 <b>목적</b>을 고정한다.
 *
 * <p>스케줄러({@code PerformanceStatusScheduler})는 {@code @Profile("!test")}라 여기서 뜨지 않는다.
 * 로직을 가진 {@link PerformanceService#sweepStatusTransitions()}를 직접 부른다 — 기존
 * {@code OrderExpiryScheduler}·{@code SettlementScheduler} 테스트와 같은 방식이다.
 *
 * <p>시각·상태는 {@link SettlementTestFixture}가 세운 세계 위에서 SQL로 옮긴다. 상태를 임의로
 * 세팅하는 엔티티 메서드는 없다(있으면 프로덕션 코드가 전이 규칙을 우회할 수 있다).
 */
class PerformanceStatusSweepTest extends IntegrationTestBase {

    @Autowired PerformanceService performanceService;
    @Autowired PerformanceParticipantRepository participantRepository;
    @Autowired SettlementRuleRepository settlementRuleRepository;
    @Autowired SettlementGates gates;
    @Autowired SettlementTestFixture fixture;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactionManager;

    private SettlementTestFixture.World world;
    private Long performanceId;

    @BeforeEach
    void setUp() {
        world = fixture.createWorld(5000, 5000, new int[]{3334, 3333, 3333});
        performanceId = world.performance().getPerformanceId();
    }

    @Test
    @DisplayName("판매 마감 시각이 지난 ON_SALE 공연은 SALE_CLOSED 가 된다")
    void closesSaleWhenDue() {
        LocalDateTime now = TimeSupport.nowStored();
        // 공연 시작은 아직 오지 않았다 — 마감만 지났다.
        move(Performance.Status.ON_SALE, now.plusMinutes(59), now.minusMinutes(1), null);

        performanceService.sweepStatusTransitions();

        assertThat(status()).isEqualTo(Performance.Status.SALE_CLOSED);
    }

    @Test
    @DisplayName("종료 시각이 지난 SALE_CLOSED 공연은 ENDED 가 된다")
    void endsWhenDue() {
        LocalDateTime now = TimeSupport.nowStored();
        move(Performance.Status.SALE_CLOSED, now.minusHours(4), now.minusHours(5),
                now.minusMinutes(1));

        performanceService.sweepStatusTransitions();

        assertThat(status()).isEqualTo(Performance.Status.ENDED);
    }

    @Test
    @DisplayName("두 시각이 모두 지났으면 한 tick 에서 ON_SALE → ENDED 까지 간다(다운타임 복구)")
    void recoversTwoStepsInOneTick() {
        LocalDateTime now = TimeSupport.nowStored();
        move(Performance.Status.ON_SALE, now.minusHours(4), now.minusHours(5), now.minusHours(1));

        // 스윕 한 번 = 한 tick. 두 단을 연속 처리하지 않으면 여기서 SALE_CLOSED 로 멈춘다.
        performanceService.sweepStatusTransitions();

        assertThat(status()).isEqualTo(Performance.Status.ENDED);
    }

    @Test
    @DisplayName("entry_end_at 이 비면 performance_at + 기본 공연 길이(3h)로 종료를 판정한다")
    void derivesEndFromDefaultDuration() {
        LocalDateTime now = TimeSupport.nowStored();
        // 시작은 지났지만 기본 3시간이 남았다 — 아직 끝나지 않았다.
        move(Performance.Status.SALE_CLOSED, now.minusHours(1), now.minusHours(2), null);
        performanceService.sweepStatusTransitions();
        assertThat(status()).isEqualTo(Performance.Status.SALE_CLOSED);

        move(Performance.Status.SALE_CLOSED, now.minusHours(4), now.minusHours(5), null);
        performanceService.sweepStatusTransitions();
        assertThat(status()).isEqualTo(Performance.Status.ENDED);
    }

    @Test
    @DisplayName("저장된 공연 종료(end_at)가 지나면 기본 3시간을 기다리지 않고 ENDED 가 된다 (D-79)")
    void endsAtStoredEndAt() {
        LocalDateTime now = TimeSupport.nowStored();
        // 시작 10분 뒤 종료로 적은 공연 — 시작 + 3h 는 아직 멀었지만 end_at 은 지났다.
        move(Performance.Status.SALE_CLOSED, now.minusMinutes(20), now.minusMinutes(80), null);
        jdbc.update("UPDATE performance SET end_at = ? WHERE performance_id = ?",
                now.minusMinutes(10), performanceId);

        performanceService.sweepStatusTransitions();

        assertThat(status()).isEqualTo(Performance.Status.ENDED);
    }

    @Test
    @DisplayName("end_at 이 아직 오지 않았으면 시작 + 3시간이 지나도 종료하지 않는다 — 저장값이 정본이다")
    void storedEndAtWinsOverEstimate() {
        LocalDateTime now = TimeSupport.nowStored();
        move(Performance.Status.SALE_CLOSED, now.minusHours(4), now.minusHours(5), null);
        jdbc.update("UPDATE performance SET end_at = ? WHERE performance_id = ?",
                now.plusMinutes(30), performanceId);

        performanceService.sweepStatusTransitions();

        assertThat(status()).isEqualTo(Performance.Status.SALE_CLOSED);
    }

    @Test
    @DisplayName("CANCELLED 는 시각이 모두 지나도 그대로다 — 종단이다")
    void cancelledIsNeverRevived() {
        LocalDateTime now = TimeSupport.nowStored();
        move(Performance.Status.CANCELLED, now.minusHours(4), now.minusHours(5), now.minusHours(1));

        performanceService.sweepStatusTransitions();

        assertThat(status()).isEqualTo(Performance.Status.CANCELLED);
    }

    @Test
    @DisplayName("판매가 열린 적 없는 DRAFT·PENDING_AGREEMENT 도 대상이 아니다")
    void beforeSaleIsNotSwept() {
        LocalDateTime now = TimeSupport.nowStored();
        for (Performance.Status before
                : List.of(Performance.Status.DRAFT, Performance.Status.PENDING_AGREEMENT)) {
            move(before, now.minusHours(4), now.minusHours(5), now.minusHours(1));
            performanceService.sweepStatusTransitions();
            assertThat(status()).isEqualTo(before);
        }
    }

    @Test
    @DisplayName("시각이 오지 않았으면 전이하지 않는다 — 경계는 포함(<=)이다")
    void notDueStays() {
        LocalDateTime now = TimeSupport.nowStored();
        move(Performance.Status.ON_SALE, now.plusHours(2), now.plusHours(1), null);
        performanceService.sweepStatusTransitions();
        assertThat(status()).isEqualTo(Performance.Status.ON_SALE);

        // 마감 시각에 도달하면(스윕의 now >= saleCloseAt) 전이한다.
        move(Performance.Status.ON_SALE, now.plusHours(2), TimeSupport.nowStored(), null);
        performanceService.sweepStatusTransitions();
        assertThat(status()).isEqualTo(Performance.Status.SALE_CLOSED);
    }

    @Test
    @DisplayName("sale_close_at 이 NULL 이면 마감 전이 대상이 아니다")
    void nullSaleCloseAtIsSkipped() {
        LocalDateTime now = TimeSupport.nowStored();
        move(Performance.Status.ON_SALE, now.minusHours(4), null, now.minusHours(1));

        performanceService.sweepStatusTransitions();

        assertThat(status()).isEqualTo(Performance.Status.ON_SALE);
    }

    @Test
    @DisplayName("완료 기준 — ENDED 전이 뒤에는 집계 게이트가 상태 때문에 막지 않는다")
    void settlementAggregateGateBecomesReachable() {
        LocalDateTime now = TimeSupport.nowStored();
        move(Performance.Status.ON_SALE, now.minusHours(4), now.minusHours(5), now.minusHours(1));

        // 전이 전 — 게이트가 상태로 막는다(= 정산이 통째로 도달 불가였던 상태).
        assertThat(aggregateBlocked()).isPresent()
                .get()
                .extracting(SettlementGates.Blocked::code)
                .isEqualTo(ErrorCode.PERFORMANCE_INVALID_STATUS);

        performanceService.sweepStatusTransitions();
        assertThat(status()).isEqualTo(Performance.Status.ENDED);

        // 전이 후 — 막힌 이유가 없다. 게이트가 열렸다.
        assertThat(aggregateBlocked()).isEmpty();
    }

    // ------------------------------------------------------------ helpers

    /**
     * 집계 게이트가 무엇 때문에 막히는지. 실행 API({@code SettlementService#aggregate})가 보는
     * 것과 <b>같은 게이트</b>다.
     *
     * <p>트랜잭션 안에서 부른다 — {@code performance.creatorTeam} 이 LAZY 라 세션 밖에서는
     * 소유자 판정을 할 수 없다(실제 호출부는 항상 트랜잭션 안이다).
     */
    private Optional<SettlementGates.Blocked> aggregateBlocked() {
        return new TransactionTemplate(transactionManager).execute(tx -> {
            Performance performance = performanceRepository.findById(performanceId).orElseThrow();
            SettlementRule rule = settlementRuleRepository
                    .findByPerformance_PerformanceId(performanceId).orElseThrow();
            List<PerformanceParticipant> participants = participantRepository
                    .findByPerformance_PerformanceIdAndStatus(performanceId,
                            PerformanceParticipant.Status.REGISTERED);
            return gates.aggregate(principal(world.hostLeader()), performance, null, rule,
                    participants);
        });
    }

    /** 상태·시각을 SQL로 옮긴다 — {@code Performance} 에 임의 세팅 메서드가 없다. */
    private void move(Performance.Status status, LocalDateTime performanceAt,
                      LocalDateTime saleCloseAt, LocalDateTime entryEndAt) {
        jdbc.update("UPDATE performance SET status = ?, performance_at = ?, sale_close_at = ?, "
                        + "entry_end_at = ? WHERE performance_id = ?",
                status.name(), performanceAt, saleCloseAt, entryEndAt, performanceId);
    }

    private Performance.Status status() {
        return performanceRepository.findById(performanceId).orElseThrow().getStatus();
    }

    private static MemberPrincipal principal(Member member) {
        return MemberPrincipal.of(member.getMemberId(), member.getEmail(), member.isAdmin());
    }
}
