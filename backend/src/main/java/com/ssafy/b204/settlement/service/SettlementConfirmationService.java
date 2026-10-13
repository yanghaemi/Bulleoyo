package com.ssafy.b204.settlement.service;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.entity.PerformanceParticipant;
import com.ssafy.b204.performance.repository.PerformanceParticipantRepository;
import com.ssafy.b204.rule.entity.SettlementRule;
import com.ssafy.b204.rule.repository.SettlementRuleRepository;
import com.ssafy.b204.settlement.config.SettlementProperties;
import com.ssafy.b204.settlement.entity.Settlement;
import com.ssafy.b204.settlement.entity.SettlementShare;
import com.ssafy.b204.settlement.event.SettlementPayoutConfirmedEvent;
import com.ssafy.b204.settlement.event.SettlementStateChangedEvent;
import com.ssafy.b204.settlement.repository.SettlementChainJobRepository;
import com.ssafy.b204.settlement.repository.SettlementPerformanceRepository;
import com.ssafy.b204.settlement.repository.SettlementRepository;
import com.ssafy.b204.settlement.repository.SettlementShareRepository;
import com.ssafy.b204.common.support.TimeSupport;
import jakarta.annotation.PostConstruct;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityNotFoundException;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 확정된 {@code chain_job}을 정산 상태에 반영한다 — <b>상태 전이가 일어나는 유일한 곳</b>.
 *
 * <h2>왜 202 응답 시점이 아닌가</h2>
 *
 * <p>{@code aggregate}·{@code lock}·{@code release}는 전부 운영자 tx다. 202를 돌려준 시점에는 tx가
 * 아직 전송조차 되지 않았다(워커가 나중에 집어간다). 그때 {@code AGGREGATED}로 바꿔 두면 tx가
 * revert됐을 때 되돌려야 하고, 되돌리는 코드는 <b>반드시 언젠가 빠뜨린다.</b> 그래서 서버 상태는
 * receipt가 확정된 뒤에만 움직인다(settlement-api §4).
 *
 * <h2>왜 이벤트가 아니라 훑기인가</h2>
 *
 * <p>원래 계약은 워커가 {@code ChainJobConfirmedEvent}를 발행하고 도메인이 리스너로 받는 것이다.
 * 그 이벤트가 아직 없어서(open-questions D-5) {@code CONFIRMED} job을 주기적으로 훑는다.
 * <b>반영 여부를 따로 표시하지 않고 정산 상태 자체로 판정</b>하므로 몇 번을 훑어도 결과가 같다 —
 * 이벤트가 생기면 리스너가 {@link #apply(ChainJob)}를 부르면 되고 이 클래스의 로직은 그대로다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SettlementConfirmationService {

    private static final List<ChainJob.TxType> SETTLEMENT_TX_TYPES = List.of(
            ChainJob.TxType.AGGREGATE, ChainJob.TxType.LOCK,
            ChainJob.TxType.RELEASE, ChainJob.TxType.DEPOSIT_RETURN);

    private final SettlementRepository settlementRepository;
    private final SettlementShareRepository settlementShareRepository;
    private final SettlementChainJobRepository chainJobRepository;
    private final SettlementPerformanceRepository performanceRepository;
    private final SettlementRuleRepository settlementRuleRepository;
    private final PerformanceParticipantRepository participantRepository;
    private final SettlementReconciler reconciler;
    private final SettlementCalculator calculator;
    private final SettlementChainReader chainReader;
    private final SettlementJobEnqueuer jobEnqueuer;
    private final SettlementProperties properties;
    private final ApplicationEventPublisher eventPublisher;
    private final PlatformTransactionManager transactionManager;

    /** job 하나당 트랜잭션 하나 — 이유는 {@link #applyConfirmedJobs()} javadoc. */
    private TransactionTemplate jobTransaction;

    /** 정산 행을 잠그면서 <b>최신 커밋</b>으로 덮어쓰는 자리 — {@link #lockLatest(Settlement)} 참조. */
    @PersistenceContext
    private EntityManager em;

    @PostConstruct
    void initJobTransaction() {
        jobTransaction = new TransactionTemplate(transactionManager);
        jobTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /**
     * 확정된 정산 job을 전부 반영한다. @return 실제로 상태가 바뀐 건수
     *
     * <p><b>이 메서드에 {@code @Transactional}을 붙이지 않는다.</b> 붙어 있던 동안은 자기 호출
     * ({@code this.apply(job)})이 프록시를 타지 않아 <b>한 tick의 모든 job이 한 트랜잭션</b>이었다.
     * 그래서 아래 {@code catch}가 삼킨 예외가 JPA 예외일 때(예: {@code settlement_share}의
     * {@code uk_settlement_team} 위반) 트랜잭션은 이미 rollback-only가 되어, 로그만 남기고 계속
     * 돈 <b>나머지 공연의 반영까지 통째로 롤백</b>됐다 — 주석이 약속한 격리와 정반대다.
     *
     * <p>이제 job 하나가 트랜잭션 하나다({@code REQUIRES_NEW}). {@code catch}는 그대로
     * 두되 이제 실제로 다른 공연을 막지 않는다. 경계를 {@link TransactionTemplate}으로 여는 이유도
     * 자기 호출이다 — 애노테이션으로는 이 프록시를 우회할 수 없으므로 경계를 코드로 연다.
     */
    public int applyConfirmedJobs() {
        int applied = 0;
        for (ChainJob job : chainJobRepository.findByStatusAndTxTypeInOrderByChainJobIdAsc(
                ChainJob.Status.CONFIRMED, SETTLEMENT_TX_TYPES)) {
            try {
                if (Boolean.TRUE.equals(jobTransaction.execute(status -> apply(job)))) {
                    applied++;
                }
            } catch (RuntimeException e) {
                // 한 공연의 실패가 다른 공연의 반영을 막지 않는다 — job 마다 트랜잭션이 따로다.
                // 실패는 다음 주기에 다시 시도된다.
                log.error("확정 job 반영 실패 — jobId={} type={}: {}",
                        SettlementJobEnqueuer.jobId(job.getChainJobId()), job.getTxType(),
                        e.toString());
            }
        }
        return applied;
    }

    /**
     * job 하나를 반영한다. 이미 반영된 상태면 아무것도 하지 않고 {@code false}를 돌려준다.
     *
     * <p>{@code @Transactional}을 남겨 둔 것은 <b>바깥에서 부르는 경로</b>(이벤트 리스너·테스트)를
     * 위해서다. {@link #applyConfirmedJobs()}가 부를 때는 자기 호출이라 이 애노테이션이 아니라
     * {@code jobTransaction}이 연 트랜잭션에 그대로 얹힌다.
     *
     * <p>정산 행을 <b>잠금 읽기</b>로 가져온다(S15P21B204-119). 두 인스턴스가 같은 {@code CONFIRMED}
     * job을 보면 잠금 없는 읽기로는 둘 다 REPEATABLE READ 스냅숏의 같은 상태를 보고 아래 상태
     * 가드를 나란히 통과한다 — 집계면 {@code settlement_share}가 팀 수의 두 배로 들어가려다
     * {@code uk_settlement_team}에 걸리고, 잠금·release면 이벤트가 두 번 나간다. 잠금 읽기는 앞
     * 트랜잭션의 커밋을 기다렸다가 <b>최신 커밋</b>을 읽으므로, 뒤에 온 쪽은 이미 전이된 상태를 보고
     * 가드에 걸려 {@code false}로 끝난다. 가드 자체는 그대로다 — 바뀐 것은 가드가 보는 값이
     * 최신이라는 점뿐이다.
     *
     * <h2>두 단계로 나눈 이유 — 잠금 아래에서 노드를 부르지 않는다 (MR !125 리뷰)</h2>
     *
     * <p>이 메서드는 ① <b>잠금 없는 예비 판정 + 온체인 조회</b> ② <b>잠금 + 최신 커밋 재판정 + 쓰기</b>
     * 로 나뉜다. 한 단계로 두면 집계 반영이 {@code escrowOf}·{@code choiceCountsOf}·{@code payoutsOf}
     * <b>{@code eth_call} 3회를 행 쓰기 잠금을 쥔 채</b> 돌았다. 그러면 노드가 느린 만큼 같은 행을
     * 건드리는 다른 트랜잭션이 통째로 밀린다 — 같은 job의 중복 반영만이 아니라
     * {@link SettlementStateWriter#recordServerAggregate}({@code REQUIRES_NEW})도 함께 막히고,
     * {@link SettlementGates}의 진행 중 job 검사는 {@code PENDING}·{@code SUBMITTED}만 보므로
     * <b>CONFIRMED-미반영 창</b>에 들어온 재집계 API가 게이트를 통과한 뒤 그 잠금 앞에 줄을 선다.
     * 노드 지연이 그대로 lock wait timeout(500)으로 바뀐다. 저장소 선례가 이미 같은 결론을
     * 적어 두었다 — {@code PerformanceService#cancel}의 "비싼 검사는 락 앞에서 끝낸다".
     *
     * <p><b>체인 값이 잠금 앞 스냅숏이어도 결과가 달라지지 않는다.</b> 이 경로는 온체인
     * {@code aggregate}가 이미 <b>확정</b>된 뒤다(job이 {@code CONFIRMED}). 그 tx가 팀별
     * {@code payout[]}을 확정하고 선택 카운터와 에스크로를 <b>동결</b>하므로(project-truth §9 C-1,
     * 문서 13 §4.1) 세 값은 그 시점 이후로 움직이지 않는다. 잠금을 먼저 잡고 읽든 나중에 읽든 같은
     * 값이고, 시점 차이가 만들 수 있는 유일한 위험은 "읽는 사이에 값이 바뀐다"인데 동결된 값에는
     * 그 위험이 없다. 반대로 잠금 <b>뒤</b>에 읽으면 얻는 것 없이 대기 시간만 남의 트랜잭션에
     * 떠넘긴다.
     *
     * <p><b>상태는 반드시 잠금 뒤에 다시 본다.</b> ①에서 본 상태는 REPEATABLE READ 스냅숏 값이라
     * 낡을 수 있다 — ①의 판정은 "체인을 읽을 가치가 있는가"를 고르는 예비 판정일 뿐이고, 전이를
     * 허락하는 가드는 {@link #applyAggregate}·{@link #applyLock}·{@link #applyRelease} 안에 그대로
     * 있다.
     */
    @Transactional
    public boolean apply(ChainJob job) {
        if (job.getStatus() != ChainJob.Status.CONFIRMED || job.getTargetPerformanceId() == null) {
            return false;
        }
        // ① 잠금 없는 예비 판정 — 여기서는 아무것도 쓰지 않는다.
        Settlement preview = settlementRepository
                .findByPerformance_PerformanceId(job.getTargetPerformanceId()).orElse(null);
        if (preview == null) {
            return false;
        }
        // HALTED는 종단이다. 뒤늦게 확정된 tx가 있어도 되살리지 않는다(project-truth §6).
        // 보증금 반환만 예외다 — 컨트랙트가 returnDeposit 을 stage {RELEASED, HALTED} 에서
        // 허용하고(문서 13 §4.1 11행) 공연 취소의 반환은 반드시 HALTED 를 거쳐 온다. 여기서
        // 물러나면 온체인 tx 가 확정됐는데 deposit_status 가 영구히 PAID 로 남는다
        // (S15P21B204-154). "되살리지 않는다"가 막으려는 것은 집계·잠금·release 세 전이이고,
        // 보증금 반환은 정산 상태를 건드리지 않는다(바꾸는 것은 performance 행 하나다).
        boolean depositReturn = job.getTxType() == ChainJob.TxType.DEPOSIT_RETURN;
        if (!depositReturn && preview.getStatus() == Settlement.Status.HALTED) {
            return false;
        }
        // 체인 조회가 필요한 것은 집계 반영뿐이다(lock·release·보증금 반환은 DB만 본다).
        OnchainAggregate onchain = null;
        if (job.getTxType() == ChainJob.TxType.AGGREGATE) {
            if (preview.getStatus() != Settlement.Status.NONE) {
                return false;
            }
            onchain = readOnchainAggregate(preview);
            if (onchain == null) {
                return false;
            }
        }

        // ② 잠금 + 최신 커밋으로 재판정. 여기부터 쓰기다.
        Settlement settlement = lockLatest(preview);
        if (settlement == null
                || (!depositReturn && settlement.getStatus() == Settlement.Status.HALTED)) {
            return false;
        }

        return switch (job.getTxType()) {
            case AGGREGATE -> applyAggregate(settlement, job, onchain);
            case LOCK -> applyLock(settlement, job);
            case RELEASE -> applyRelease(settlement, job);
            case DEPOSIT_RETURN -> applyDepositReturn(settlement, job);
            default -> false;
        };
    }

    /**
     * 정산 행에 쓰기 잠금을 걸면서 인스턴스를 <b>DB 최신 커밋</b>으로 덮어쓴다.
     *
     * <p><b>{@code @Lock(PESSIMISTIC_WRITE)} 파인더로는 부족하다</b>(그래서 저장소에 두지 않았다 — 한때
     * 있던 {@code findByPerformanceIdForUpdate}는 이 함정 때문에 지웠다). 위 ①에서 같은
     * 트랜잭션이 이 정산을 이미 로드했으므로, 잠금 파인더를 불러도 Hibernate는 {@code FOR UPDATE}
     * SQL을 보내 잠금은 잡지만 결과 행을 1차 캐시의 기존 인스턴스에 <b>덮어쓰지 않는다</b> — 가드가
     * 읽는 {@code status}는 잠금을 기다리기 전의 값 그대로다. 그러면 잠금을 잡고도 앞 트랜잭션이
     * 커밋한 {@code AGGREGATED}를 못 보고 분배 내역을 한 벌 더 넣는다. {@code refresh}는 같은 잠금을
     * 잡으면서 DB 상태로 인스턴스를 덮어쓴다. 저장소에 같은 함정·같은 해법이 둘 더 있다 —
     * {@code PerformanceService#cancel} · {@code SettlementService#releaseInternal}의
     * {@code em.refresh(performance, PESSIMISTIC_WRITE)}.
     *
     * <p>PK 조회라 <b>잠기는 행은 {@code settlement} 하나</b>다. 공연 행을 먼저 잡는 경로와 잠금
     * 순서가 엇갈리지 않는다.
     *
     * @return 잠근 정산. 그 사이 행이 사라졌으면 {@code null}
     */
    private Settlement lockLatest(Settlement settlement) {
        try {
            em.refresh(settlement, LockModeType.PESSIMISTIC_WRITE);
            return settlement;
        } catch (EntityNotFoundException e) {
            log.warn("확정 반영 보류 — 정산 행이 사라졌다(settlementId={})",
                    settlement.getSettlementId());
            return null;
        }
    }

    /**
     * 집계 반영에 필요한 온체인 값 — <b>행 잠금을 잡기 전에</b> 읽은 스냅숏.
     *
     * <p>{@code aggregate}가 확정된 뒤라 셋 다 동결된 값이다({@link #apply(ChainJob)} javadoc).
     */
    private record OnchainAggregate(long showId, long escrow, long[] counts, long[] payouts) {}

    /**
     * 온체인 3값을 읽는다. 하나라도 못 읽으면 {@code null} — <b>전이하지 않는다.</b>
     *
     * <p>읽지 못한 것을 통과시키지 않는 이유는 {@link #applyAggregate} javadoc에 있다. 다음 주기에
     * 다시 훑히므로 보류는 손실이 아니다.
     */
    private OnchainAggregate readOnchainAggregate(Settlement settlement) {
        Performance performance = settlement.getPerformance();
        Long showId = performance.getOnChainId();
        if (showId == null) {
            log.warn("집계 반영 보류 — 공연 {}에 on_chain_id가 없다", performance.getPerformanceId());
            return null;
        }
        Optional<Long> escrow = chainReader.escrowOf(showId);
        Optional<long[]> counts = chainReader.choiceCountsOf(showId);
        if (escrow.isEmpty() || counts.isEmpty()) {
            log.warn("집계 반영 보류 — 온체인 값을 읽지 못했다(showId={})", showId);
            return null;
        }
        Optional<long[]> payouts = chainReader.payoutsOf(showId);
        if (payouts.isEmpty()) {
            // 못 읽었다 = 대사 불가. escrow·counts 와 같은 취급이다.
            // 이 대조가 서버 규칙(settlement_rule)과 온체인 잠긴 규칙이 갈라졌을 때 잡아내는
            // 유일한 장치라, 건너뛰면 서버가 자기 계산으로 share 를 확정하고 release 가 그 금액을
            // 나른다. eth_call 한 번 실패했다고 그 문을 열어 줄 수는 없다.
            log.warn("집계 반영 보류 — payoutsOf 를 읽지 못했다(showId={})", showId);
            return null;
        }
        return new OnchainAggregate(showId, escrow.get(), counts.get(), payouts.get());
    }

    // ------------------------------------------------------------------ AGGREGATE

    /**
     * {@code NONE → AGGREGATED} + {@code settlement_share} 확정 저장.
     *
     * <p>여기서 분배액이 <b>처음 저장</b>된다. 입력은 온체인 값이다 — R은 {@code escrowOf},
     * 카운터는 {@code choiceCountsOf}. 서버 티켓 집계는 {@code validTicketCount}(신고값)로만 남고
     * 계산에는 들어가지 않는다(settlement-api §6).
     *
     * <p>계산이 끝나면 온체인 {@code payoutsOf}와 대조한다 — 불변식 3의 서버 측 사전 검사다.
     * 어긋나거나 <b>읽지 못하면</b> 전이하지 않는다. 여기서 통과시키면 release가 잘못된 금액을
     * 실어 나른다. 서버는 온체인 잠긴 규칙({@code rulesOf})이 아니라 DB {@code settlement_rule}로
     * 계산하므로, 두 규칙이 갈라졌을 때 잡아내는 장치가 이 대조 하나뿐이다.
     *
     * @param onchain <b>행 잠금을 잡기 전에</b> 읽은 온체인 스냅숏. 왜 잠금 앞에서 읽어도 되는지는
     *                {@link #apply(ChainJob)} javadoc("체인 값이 잠금 앞 스냅숏이어도…")
     */
    private boolean applyAggregate(Settlement settlement, ChainJob job, OnchainAggregate onchain) {
        // 잠금 뒤 재판정 — ①의 예비 판정은 낡았을 수 있다.
        if (settlement.getStatus() != Settlement.Status.NONE) {
            return false;
        }
        Performance performance = settlement.getPerformance();
        long showId = onchain.showId();

        SettlementRule rule = settlementRuleRepository
                .findByPerformance_PerformanceId(performance.getPerformanceId())
                .orElse(null);
        if (rule == null) {
            log.warn("집계 반영 보류 — 정산 규칙이 없다(performanceId={})",
                    performance.getPerformanceId());
            return false;
        }

        List<PerformanceParticipant> participants = participantRepository
                .findByPerformance_PerformanceIdAndStatus(performance.getPerformanceId(),
                        PerformanceParticipant.Status.REGISTERED);
        SettlementTeams teams = SettlementTeams.of(participants,
                performance.getCreatorTeam().getTeamId());

        SettlementCalculator.Result result = calculator.calculate(
                onchain.escrow(), rule.getFixedRatioBp(), rule.getSelectionRatioBp(),
                teams.teamShareBp(), onchain.counts(), teams.hostIndex());

        if (!matches(result, onchain.payouts())) {
            log.error("불변식 3 위반 — 서버 재계산 != 온체인 payout (showId={}) server={} chain={}",
                    showId, result.shares().stream().map(SettlementCalculator.Share::totalAmount)
                            .toList(), Arrays.toString(onchain.payouts()));
            return false;
        }

        SettlementReconciler.ServerAggregate aggregate =
                reconciler.serverAggregate(performance.getPerformanceId());

        // 상태가 NONE 이라는 것은 아직 한 번도 확정되지 않았다는 뜻이라 기존 share 가 없다.
        // (uk_settlement_team 이 있어 재삽입은 어차피 막힌다 — 조용히 지우고 다시 만들지 않는다.)
        for (SettlementCalculator.Share share : result.shares()) {
            PerformanceParticipant participant = teams.at(share.teamIndex());
            settlement.addShare(SettlementShare.builder()
                    .team(participant.getTeam())
                    .walletAddress(participant.getWalletAddress())
                    .equalAmount(share.fixedAmount())
                    .selectionAmount(share.choiceAmount())
                    .dustAmount(share.dustAmount())
                    .choiceCount(Math.toIntExact(share.choiceCount()))
                    .build());
        }

        settlement.markAggregated(result.distributable(), aggregate.validTicketCount(),
                Math.toIntExact(result.totalChoices()), true, job.getTxHash());
        log.info("집계 확정 반영 — performanceId={} R={} dust={}",
                performance.getPerformanceId(), result.distributable(), result.dust());
        // 분배 내역이 방금 생겼다 — 불변식 3의 입력이 바뀌었으므로 대사를 다시 돌게 한다.
        publishStateChanged(performance.getPerformanceId(), Settlement.Status.AGGREGATED);
        return true;
    }

    private boolean matches(SettlementCalculator.Result result, long[] onChainPayouts) {
        List<SettlementCalculator.Share> shares = result.shares();
        if (onChainPayouts.length != shares.size()) {
            return false;
        }
        for (int i = 0; i < shares.size(); i++) {
            if (shares.get(i).totalAmount() != onChainPayouts[i]) {
                return false;
            }
        }
        return true;
    }

    // ------------------------------------------------------------------ LOCK

    /**
     * {@code AGGREGATED → LOCKED → DISPUTE_OPEN}.
     *
     * <p>잠금과 동시에 이의제기 창이 열리므로 두 전이를 한 번에 한다. {@code LOCKED}는 이 순간
     * 지나가는 상태이고 조회 응답에는 {@code DISPUTE_OPEN}으로 보인다(API v6 §11 -03 설명).
     * {@code lockedAt}과 {@code disputeDeadlineAt}은 그대로 남아 근거가 된다.
     */
    private boolean applyLock(Settlement settlement, ChainJob job) {
        if (settlement.getStatus() != Settlement.Status.AGGREGATED) {
            return false;
        }
        LocalDateTime confirmedAt = job.getConfirmedAt() == null
                ? TimeSupport.nowStored() : job.getConfirmedAt();
        settlement.markLocked(job.getTxHash(), confirmedAt.plus(properties.disputePeriod()));
        settlement.markDisputeOpen();
        log.info("정산 잠금 반영 — settlementId={} disputeDeadlineAt={}",
                settlement.getSettlementId(), settlement.getDisputeDeadlineAt());
        return true;
    }

    // ------------------------------------------------------------------ RELEASE

    /**
     * {@code LOCKED|DISPUTE_OPEN → RELEASED}(종단) + 팀별 수령 표시 + 보증금 반환 job 연쇄.
     *
     * <p>보증금은 정산 재원이 아니라 별도 계정이라 <b>release와 다른 tx</b>다
     * ({@code returnDeposit}). 여기서 {@code DEPOSIT_RETURN} job을 하나 더 넣는 것이 API v6 §11
     * -05가 말하는 "운영자 tx 2건"이다.
     */
    private boolean applyRelease(Settlement settlement, ChainJob job) {
        if (settlement.getStatus() != Settlement.Status.LOCKED
                && settlement.getStatus() != Settlement.Status.DISPUTE_OPEN) {
            return false;
        }
        List<String> recipients = new ArrayList<>();
        for (SettlementShare share : settlementShareRepository
                .findBySettlement_SettlementId(settlement.getSettlementId())) {
            share.markReleased();
            // settlement_share.wallet_address 는 NULL 허용이다(V1__init.sql:373). 그대로 담으면
            // SettlementPayoutConfirmedEvent 의 List.copyOf 가 NPE 를 던져 release 반영 전체가
            // 롤백되고 매 주기 재시도한다 — 갱신 하나 때문에 확정을 잃는다(리뷰 !81 🔴).
            String address = share.getWalletAddress();
            if (address != null && !address.isBlank()) {
                recipients.add(address);
            }
        }
        settlement.markReleased(job.getTxHash());

        Performance performance = settlement.getPerformance();
        if (performance.getDepositStatus() == Performance.DepositStatus.PAID
                && performance.getDepositAmount() != null && performance.getDepositAmount() > 0) {
            jobEnqueuer.enqueue(ChainJob.TxType.DEPOSIT_RETURN, performance.getPerformanceId(),
                    performance.getDepositAmount(),
                    "settlement:deposit-return:" + settlement.getSettlementId(), null);
        }
        log.info("release 반영 — settlementId={} txHash={}",
                settlement.getSettlementId(), job.getTxHash());
        // 팀 리더 지갑 N개가 방금 코인을 받았다 — 그 캐시를 갱신하지 않으면 지갑 화면(A-13)이
        // 낡은 잔액을 보여준다(2026-09-10 리허설 실측, SettlementPayoutConfirmedEvent javadoc).
        //
        // 대사보다 **먼저** 발행하는 순서는 유지한다(리뷰 !81 🔴). 다만 S15P21B204-88 이후 대사는
        // 이 캐시를 읽지 않고 노드에서 직접 합산하므로, 순서는 이제 공시 정확도가 아니라
        // "확정 직후 화면 캐시가 먼저 맞는다"는 사용자 경험을 위한 것이다.
        publishPayoutConfirmed(performance.getPerformanceId(), ChainJob.TxType.RELEASE, recipients);
        // 이 정산이 방금 불변식 3의 검사 대상이 됐다. 다음 정산의 release 게이트가 30초짜리
        // 옛 판정을 쓰지 않도록 커밋 직후 대사를 다시 돌린다.
        publishStateChanged(performance.getPerformanceId(), Settlement.Status.RELEASED);
        return true;
    }

    /**
     * 대사 재실행 신호. 실패해도 상태 반영을 되돌리지 않는다 — 구독자가 없거나 대사가 실패해도
     * 정산 상태는 이미 옳고, 스냅샷은 30초 뒤 스케줄러가 다시 만든다.
     */
    private void publishStateChanged(Long performanceId, Settlement.Status status) {
        eventPublisher.publishEvent(new SettlementStateChangedEvent(performanceId, status));
    }

    /**
     * 수령 지갑 잔액 캐시 갱신 신호. {@code AFTER_COMMIT}에서 처리되므로 여기서는 네트워크를
     * 타지 않는다 — 이유는 {@link SettlementBalanceRefreshListener} javadoc.
     */
    private void publishPayoutConfirmed(Long performanceId, ChainJob.TxType txType,
                                        List<String> recipientAddresses) {
        if (recipientAddresses.isEmpty()) {
            return;
        }
        eventPublisher.publishEvent(
                new SettlementPayoutConfirmedEvent(performanceId, txType, recipientAddresses));
    }

    // ------------------------------------------------------------------ DEPOSIT_RETURN

    /**
     * 보증금 반환 확정 반영 + 수령 지갑 캐시 갱신.
     *
     * <p>온체인 {@code returnDeposit}은 {@code transfer(this → host)}다(문서 13 §4.1 11행) —
     * 수령자는 {@code teamWallets[hostTeamIndex]}, 즉 <b>공연 생성 팀 리더 지갑</b> 하나뿐이다.
     * 서버가 같은 주소를 갖고 있는 곳이 {@code settlement_share}(host 팀 행)의 스냅샷이라 그것을
     * 먼저 쓰고, 없으면 {@code performance_participant}에서 읽는다.
     *
     * <h2>이 분기의 펜싱은 정산 잠금이 아니라 <b>조건부 UPDATE</b>다</h2>
     *
     * <p>{@link #apply(ChainJob)}이 잡는 잠금은 {@code settlement} 행 하나고, 여기서 바꾸는 것은
     * {@code performance} 행이다. 두 인스턴스가 같은 {@code DEPOSIT_RETURN} job 을 보면 뒤에 온
     * 쪽은 정산 잠금을 기다린 뒤 {@code em.refresh} 로 <b>정산만</b> 최신이 되고,
     * {@code settlement.getPerformance()} 는 refresh 대상이 아니라 1차 캐시에 남은 스냅숏
     * ({@code PAID})이다. 그래서 아래 {@code PAID} 가드는 <b>빠른 탈출</b>일 뿐 판정이 아니다.
     * 진짜 판정은 {@code markDepositReturned} 가 돌려주는 <b>갱신 행 수</b>고, 0이면 이미 다른
     * 인스턴스가 {@code RETURNED} 로 바꿨다는 뜻이라 <b>이벤트를 발행하기 전에</b> 물러난다
     * (리뷰 !125 🟡, S15P21B204-119). 물러나지 않으면 같은 보증금 반환으로
     * {@code SettlementPayoutConfirmedEvent} 가 두 번 나간다.
     */
    private boolean applyDepositReturn(Settlement settlement, ChainJob job) {
        Performance performance = settlement.getPerformance();
        if (performance.getDepositStatus() != Performance.DepositStatus.PAID) {
            return false;
        }
        LocalDateTime confirmedAt = job.getConfirmedAt() == null
                ? TimeSupport.nowStored() : job.getConfirmedAt();
        int updated = performanceRepository.markDepositReturned(performance.getPerformanceId(),
                Performance.DepositStatus.PAID, Performance.DepositStatus.RETURNED,
                job.getTxHash(), confirmedAt);
        if (updated == 0) {
            // 스냅숏은 PAID 였지만 최신 커밋은 RETURNED 였다 = 다른 인스턴스가 먼저 반영했다.
            log.info("보증금 반환 반영 생략 — 이미 반환 확정됨(performanceId={})",
                    performance.getPerformanceId());
            return false;
        }
        log.info("보증금 반환 반영 — performanceId={}", performance.getPerformanceId());
        publishPayoutConfirmed(performance.getPerformanceId(), ChainJob.TxType.DEPOSIT_RETURN,
                hostWalletAddress(settlement, performance).map(List::of).orElseGet(List::of));
        return true;
    }

    /** 공연 생성 팀 리더 지갑 — 보증금 수령 주소. */
    private Optional<String> hostWalletAddress(Settlement settlement, Performance performance) {
        Long hostTeamId = performance.getCreatorTeam().getTeamId();
        Optional<String> fromShare = settlementShareRepository
                .findBySettlement_SettlementIdAndTeam_TeamId(settlement.getSettlementId(),
                        hostTeamId)
                .map(SettlementShare::getWalletAddress);
        if (fromShare.isPresent()) {
            return fromShare;
        }
        // 집계 전에 보증금이 반환되는 경로(공연 취소)에서는 share 가 없다.
        return participantRepository
                .findByPerformance_PerformanceIdAndTeam_TeamId(performance.getPerformanceId(),
                        hostTeamId)
                .map(PerformanceParticipant::getWalletAddress);
    }
}
