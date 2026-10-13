package com.ssafy.b204.verify.service;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.entity.PerformanceParticipant;
import com.ssafy.b204.performance.repository.PerformanceParticipantRepository;
import com.ssafy.b204.performance.repository.PerformanceRepository;
import com.ssafy.b204.rule.entity.RuleAgreement;
import com.ssafy.b204.rule.entity.SettlementRule;
import com.ssafy.b204.rule.repository.RuleAgreementRepository;
import com.ssafy.b204.rule.repository.SettlementRuleRepository;
import com.ssafy.b204.settlement.entity.Settlement;
import com.ssafy.b204.settlement.entity.SettlementShare;
import com.ssafy.b204.settlement.repository.SettlementRepository;
import com.ssafy.b204.settlement.repository.SettlementShareRepository;
import com.ssafy.b204.settlement.service.SettlementReconciler;
import com.ssafy.b204.settlement.service.SettlementTeams;
import com.ssafy.b204.verify.repository.VerifyChainJobRepository;
import com.ssafy.b204.verify.service.VerifyLedger.TeamLedger;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * API-verify-01이 필요로 하는 <b>DB 값 전부를 한 트랜잭션에서 뜬다</b>.
 *
 * <h2>왜 별도 빈인가</h2>
 *
 * <p>검증 조회는 DB를 읽고 <b>체인 view를 여러 번 부른다</b>. 이 둘을 한 메서드에서 하면서
 * {@code @Transactional}을 걸면 공용 RPC 응답을 기다리는 내내 <b>커넥션 하나가 잡혀 있다</b> —
 * 노드가 느린 날 검증 화면 몇 장이 커넥션 풀을 말린다({@code coin}의 {@code SupplyReconciler}가
 * DB 집계와 체인 조회를 나눠 둔 것과 같은 이유다).
 *
 * <p>그래서 트랜잭션 경계를 여기로 옮겼다. 같은 클래스 안에서 {@code @Transactional} 메서드를
 * 부르면 프록시를 타지 않아 <b>애너테이션이 조용히 무시된다</b>(self-invocation) — 그래서 메서드
 * 분리가 아니라 <b>빈 분리</b>여야 한다.
 *
 * <h2>지연 로딩을 여기서 끝낸다</h2>
 *
 * <p>{@code spring.jpa.open-in-view: false}라 트랜잭션 밖에서 프록시를 건드리면
 * {@code LazyInitializationException}이다. 조립은 트랜잭션 밖에서 일어나므로, 응답에 쓰는 연관
 * ({@code team.name}·{@code team.teamId})을 <b>여기서 미리 만져 초기화</b>한다.
 */
@Component
@RequiredArgsConstructor
public class VerifySnapshotLoader {

    /** 검증 대상 상태 — {@code ON_SALE} 이상. {@code DRAFT}·{@code PENDING_AGREEMENT}는 404다. */
    private static final List<Performance.Status> VERIFIABLE = List.of(
            Performance.Status.ON_SALE, Performance.Status.SALE_CLOSED,
            Performance.Status.ENDED, Performance.Status.CANCELLED);

    /** 검증 응답이 읽는 확정 tx. */
    private static final List<ChainJob.TxType> VERIFY_TX = List.of(
            ChainJob.TxType.AGREE, ChainJob.TxType.RELEASE,
            ChainJob.TxType.DEPOSIT, ChainJob.TxType.DEPOSIT_RETURN);

    private final PerformanceRepository performanceRepository;
    private final PerformanceParticipantRepository participantRepository;
    private final SettlementRepository settlementRepository;
    private final SettlementShareRepository settlementShareRepository;
    private final SettlementRuleRepository settlementRuleRepository;
    private final RuleAgreementRepository ruleAgreementRepository;
    private final VerifyChainJobRepository chainJobRepository;
    private final SettlementReconciler reconciler;
    private final VerifyLedger ledger;

    /**
     * 한 공연의 DB 스냅샷. <b>여기 담긴 값은 트랜잭션 밖에서도 안전하다</b>(초기화 완료).
     *
     * @param teamLedgers 팀별 결제·환불 관측값. <b>이력이 없는 팀은 키가 없다</b> —
     *                    조립부가 {@link VerifyLedger#emptyLedger()}로 채운다
     */
    public record Snapshot(
            Performance performance,
            SettlementTeams teams,
            Settlement settlement,
            SettlementRule rule,
            Map<Long, RuleAgreement> agreementsByTeam,
            Map<Long, SettlementShare> sharesByTeam,
            Map<ChainJob.TxType, List<ChainJob>> confirmedTx,
            SettlementReconciler.ServerAggregate aggregate,
            Map<Long, TeamLedger> teamLedgers
    ) {

        public Long performanceId() {
            return performance.getPerformanceId();
        }

        /** 가장 최근 확정 tx. 없으면 {@code null}. */
        public ChainJob lastTx(ChainJob.TxType txType) {
            List<ChainJob> jobs = confirmedTx.get(txType);
            return jobs == null || jobs.isEmpty() ? null : jobs.get(jobs.size() - 1);
        }
    }

    /**
     * 스냅샷을 뜨면서 <b>404·401·403 판정까지 끝낸다</b> — 명세 "시스템 처리 1"의 순서 그대로다
     * (공연 존재 → 검증 대상 상태 → 참여팀 소속). 권한이 없으면 여기서 끝나므로 체인 호출도,
     * 캐시 조회도 일어나지 않는다.
     */
    @Transactional(readOnly = true)
    public Snapshot load(MemberPrincipal me, Long performanceId) {
        Performance performance = performanceRepository.findById(performanceId)
                .orElseThrow(ErrorCode.PERFORMANCE_NOT_FOUND::toException);
        if (!VERIFIABLE.contains(performance.getStatus())) {
            // 아직 검증 대상이 아닌 공연은 "없는 것"으로 답한다(명세 404 조건).
            throw ErrorCode.PERFORMANCE_NOT_FOUND.toException();
        }
        List<PerformanceParticipant> participants = participantRepository
                .findByPerformance_PerformanceIdAndStatus(performanceId,
                        PerformanceParticipant.Status.REGISTERED);
        requireParticipant(me, participants);

        SettlementTeams teams = SettlementTeams.of(participants,
                performance.getCreatorTeam().getTeamId());
        for (PerformanceParticipant participant : teams.ordered()) {
            // 조립부가 트랜잭션 밖에서 쓴다 — 여기서 프록시를 깨워 둔다.
            participant.getTeam().getName();
        }

        Settlement settlement = settlementRepository
                .findByPerformance_PerformanceId(performanceId).orElse(null);
        SettlementRule rule = settlementRuleRepository
                .findByPerformance_PerformanceId(performanceId).orElse(null);

        Map<Long, RuleAgreement> agreements = new HashMap<>();
        for (RuleAgreement agreement : ruleAgreementRepository
                .findByPerformance_PerformanceId(performanceId)) {
            agreements.put(agreement.getTeam().getTeamId(), agreement);
        }

        Map<Long, SettlementShare> shares = new HashMap<>();
        if (settlement != null) {
            for (SettlementShare share : settlementShareRepository
                    .findBySettlement_SettlementId(settlement.getSettlementId())) {
                shares.put(share.getTeam().getTeamId(), share);
            }
        }

        Map<ChainJob.TxType, List<ChainJob>> txByType = new HashMap<>();
        for (ChainJob job : chainJobRepository
                .findByTargetPerformanceIdAndTxTypeInAndStatusOrderByChainJobIdAsc(
                        performanceId, VERIFY_TX, ChainJob.Status.CONFIRMED)) {
            txByType.computeIfAbsent(job.getTxType(), key -> new ArrayList<>()).add(job);
        }

        return new Snapshot(performance, teams, settlement, rule, Map.copyOf(agreements),
                Map.copyOf(shares), Map.copyOf(txByType),
                reconciler.serverAggregate(performanceId), ledger.byTeam(performanceId));
    }

    /**
     * 참여팀 소속 판정. 팀 소속 테이블이 없으므로 <b>참여팀의 리더</b>가 곧 소속이다(settlement와
     * 같은 판정). 공연 생성 팀의 리더도 참여팀 리더다.
     *
     * <p>코드는 API v6 §12 에러 표를 따른다 — 미로그인 401 {@code COMMON_UNAUTHORIZED},
     * 비참여팀 403 {@code COMMON_FORBIDDEN}. settlement의 {@code SETTLEMENT_NOT_PARTICIPANT}가
     * 아니다(같은 403이지만 명세가 다른 코드를 적었다).
     */
    private static void requireParticipant(MemberPrincipal me,
                                           List<PerformanceParticipant> participants) {
        if (me == null) {
            throw ErrorCode.COMMON_UNAUTHORIZED.toException();
        }
        if (me.admin()) {
            return;
        }
        boolean member = participants.stream()
                .anyMatch(participant -> participant.getTeam().isLedBy(me.memberId()));
        if (!member) {
            throw ErrorCode.COMMON_FORBIDDEN.toException(
                    "참여팀만 정산 검증 데이터를 조회할 수 있습니다.");
        }
    }
}
