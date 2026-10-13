package com.ssafy.b204.settlement.service;

import com.ssafy.b204.webauthn.service.StepUpAction;
import com.ssafy.b204.webauthn.service.StepUpTokenService;
import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.service.ChainJobService;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.response.Money;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.common.support.EntityLocks;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.entity.PerformanceParticipant;
import com.ssafy.b204.performance.repository.PerformanceParticipantRepository;
import com.ssafy.b204.performance.repository.PerformanceRepository;
import com.ssafy.b204.rule.entity.SettlementRule;
import com.ssafy.b204.rule.repository.SettlementRuleRepository;
import com.ssafy.b204.settlement.config.SettlementProperties;
import com.ssafy.b204.settlement.dto.SettlementDtos.ActionState;
import com.ssafy.b204.settlement.dto.SettlementDtos.Actions;
import com.ssafy.b204.settlement.dto.SettlementDtos.AggregateResponse;
import com.ssafy.b204.settlement.dto.SettlementDtos.ApprovalResponse;
import com.ssafy.b204.settlement.dto.SettlementDtos.DepositBlock;
import com.ssafy.b204.settlement.dto.SettlementDtos.DisputeRequest;
import com.ssafy.b204.settlement.dto.SettlementDtos.DisputeResponse;
import com.ssafy.b204.settlement.dto.SettlementDtos.LockResponse;
import com.ssafy.b204.settlement.dto.SettlementDtos.MyTeam;
import com.ssafy.b204.settlement.dto.SettlementDtos.PublicSettlementResponse;
import com.ssafy.b204.settlement.dto.SettlementDtos.PublicShareItem;
import com.ssafy.b204.settlement.dto.SettlementDtos.ReleaseRequest;
import com.ssafy.b204.settlement.dto.SettlementDtos.ReleaseResponse;
import com.ssafy.b204.settlement.dto.SettlementDtos.SettlementDetailResponse;
import com.ssafy.b204.settlement.dto.SettlementDtos.ShareItem;
import com.ssafy.b204.settlement.dto.SettlementDtos.ShareLinkResponse;
import com.ssafy.b204.settlement.dto.SettlementDtos.TransactionItem;
import com.ssafy.b204.settlement.entity.Dispute;
import com.ssafy.b204.settlement.entity.Settlement;
import com.ssafy.b204.settlement.entity.SettlementShare;
import com.ssafy.b204.settlement.repository.DisputeRepository;
import com.ssafy.b204.settlement.repository.SettlementChainJobRepository;
import com.ssafy.b204.settlement.repository.SettlementRepository;
import com.ssafy.b204.settlement.repository.SettlementShareRepository;
import com.ssafy.b204.settlement.service.SettlementGates.Blocked;
import com.ssafy.b204.team.entity.Team;
import com.ssafy.b204.common.support.TimeSupport;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * settlement 도메인 서비스 — API v6 §11(API-settlement-01~07).
 *
 * <p><b>이 서비스가 프로젝트의 결론이다.</b> 잠긴 규칙과 온체인 집계로 분배액을 산출하고, 누구나 같은
 * 계산을 재현할 수 있어야 한다. 그래서 역할을 넷으로 갈라 두었다.
 *
 * <ul>
 *   <li>{@link SettlementCalculator} — §7.2 계산(컨트랙트와 같은 식)
 *   <li>{@link SettlementReconciler} — 입력의 진실성(서버 집계 ↔ 온체인 카운터 대사)
 *   <li>{@link SettlementGates} — 단계별 게이트의 <b>단일 정의</b>. 실행 API와 조회의
 *       {@code actions}가 같은 판정을 본다
 *   <li>{@link SettlementConfirmationService} — 상태 전이(receipt 확정 후)
 * </ul>
 *
 * <h2>상태 기계 — 역행·건너뛰기를 코드가 막는다</h2>
 *
 * <pre>
 *   NONE → AGGREGATED → LOCKED → DISPUTE_OPEN → RELEASED(종단)
 *    └──────┴──────────┴────────────┴──→ HALTED(종단)
 * </pre>
 *
 * <ul>
 *   <li>각 API는 <b>진입 상태 하나만</b> 허용하고 나머지는 4xx로 거절한다. "이미 지난 상태"와
 *       "아직 이른 상태"를 다른 코드로 구분해 화면이 다른 문구를 낼 수 있게 한다.
 *   <li>{@code HALTED}로 <b>전이시키는 코드가 여기에 없다.</b> 그 판정은 사람이 한다(공연 취소
 *       API-performance-12 · 관리자 API-admin-06). 이 클래스는 {@code HALTED}를 읽어 거절만 한다.
 *   <li>집계 대사 불일치는 상태를 바꾸지 않는다 — 409 {@code SETTLEMENT_AGGREGATE_MISMATCH} +
 *       {@code NONE} 유지. <b>되돌릴 수 있는 정지</b>다(project-truth §6).
 * </ul>
 *
 * <h2>권한</h2>
 *
 * <p>조회는 참여팀({@code SETTLEMENT_NOT_PARTICIPANT}), 집계·잠금·release는 생성자 또는 ADMIN,
 * 이의제기는 참여팀 리더. <b>공개 조회만 인증이 없다.</b> 팀 소속 개념이 DB에 없어(팀 = 리더)
 * "참여팀 소속"은 <b>참여팀의 리더</b>로 판정한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SettlementService {

    /** §0.3 폴링 간격 힌트. openapi 예시값과 같다. */
    private static final int POLL_AFTER_MS = 2_000;
    private static final int RELEASE_POLL_AFTER_MS = 2_500;

    private static final String CURRENCY = Money.BASE_CURRENCY;
    private static final String PAYOUT_NOTICE =
            "release가 확정되면 각 팀 리더 지갑에 코인이 도착하고, 그것으로 수령이 끝납니다.";
    /** 결정 v2 §2.1 — 가정 기반 시연임을 공개 페이지에 반드시 명시한다. */
    private static final String SIMULATION_NOTICE = "테스트넷 시연 정산입니다. 실제 자금이 아닙니다.";
    private static final String IDEMPOTENCY_HEADER = "Idempotency-Key";

    /** API-settlement-01 {@code transactions[]}에 실을 정산 관련 tx. */
    private static final List<ChainJob.TxType> SETTLEMENT_TX =
            List.of(ChainJob.TxType.AGGREGATE, ChainJob.TxType.LOCK, ChainJob.TxType.RELEASE,
                    ChainJob.TxType.DEPOSIT_RETURN, ChainJob.TxType.HALT);

    private static final SecureRandom SHARE_TOKEN_RANDOM = new SecureRandom();

    private final SettlementRepository settlementRepository;
    private final SettlementShareRepository settlementShareRepository;
    private final DisputeRepository disputeRepository;
    private final SettlementRuleRepository settlementRuleRepository;
    private final PerformanceRepository performanceRepository;
    private final PerformanceParticipantRepository participantRepository;
    private final SettlementChainJobRepository chainJobRepository;
    private final SettlementReconciler reconciler;
    private final SettlementChainReader chainReader;
    private final SettlementJobEnqueuer jobEnqueuer;
    private final SettlementStateWriter stateWriter;
    private final SettlementGates gates;
    private final SettlementProperties properties;
    private final ChainJobService chainJobService;
    /** [2026-09-24] 정산 조기 동의·정산금 지급 본인 확인(API v7 §7.W). */
    private final StepUpTokenService stepUpTokens;

    /** release 직전 공연 상태를 락과 함께 다시 읽는 자리 — {@code releaseInternal} 참조. */
    @PersistenceContext
    private EntityManager em;

    // ================================================================ API-settlement-01

    /**
     * API-settlement-01 정산 상태·집계·분배액·tx. 권한 PERFORMER(참여팀).
     *
     * <p>정산 행이 없으면 <b>여기서 만든다.</b> openapi가 {@code settlementId}를 필수로 두었는데
     * 공연 생성 흐름에 정산 행을 만드는 코드가 없어서다(open-questions D-23). 공연 1:1이라 언젠가
     * 반드시 생기는 행이고, 상태는 {@code NONE}이라 아무 의미도 앞당기지 않는다. 조회에서 쓰기가
     * 일어나는 것이 마음에 걸리지만, {@code settlementId: null}을 계약 위반으로 내려보내는 것보다
     * 낫다 — 공연 생성 쪽에 행 생성이 붙으면 이 호출은 그냥 기존 행을 찾게 된다.
     */
    public SettlementDetailResponse detail(MemberPrincipal me, Long performanceId) {
        Performance performance = loadPerformance(performanceId);
        List<PerformanceParticipant> participants = registeredParticipants(performanceId);
        PerformanceParticipant myParticipant = participantOf(me, participants);
        requireParticipant(me, myParticipant);

        Settlement settlement = settlementRepository
                .findByPerformance_PerformanceId(performanceId).orElse(null);
        Long settlementId = settlement != null
                ? settlement.getSettlementId() : stateWriter.ensureSettlement(performance);

        SettlementRule rule = settlementRuleRepository
                .findByPerformance_PerformanceId(performanceId).orElse(null);
        SettlementReconciler.ServerAggregate aggregate = reconciler.serverAggregate(performanceId);
        List<SettlementShare> shares = settlementShareRepository
                .findBySettlement_SettlementId(settlementId);

        long dust = 0;
        Long dustTeamId = null;
        List<ShareItem> shareItems = new ArrayList<>(shares.size());
        for (SettlementShare share : shares) {
            Team team = share.getTeam();
            if (share.getDustAmount() != null && share.getDustAmount() > 0) {
                dust = share.getDustAmount();
                dustTeamId = team.getTeamId();
            }
            shareItems.add(new ShareItem(team.getTeamId(), team.getName(), share.getWalletAddress(),
                    share.getEqualAmount(), share.getSelectionAmount(), share.getDustAmount(),
                    share.getTotalAmount(), share.getChoiceCount(), share.isReleased(),
                    SettlementTime.toOffset(share.getReleasedAt()), share.isApproved(),
                    SettlementTime.toOffset(share.getApprovedAt())));
        }
        if (dustTeamId == null) {
            // dust 가 0이어도 귀속처는 정해져 있다 — 공연 생성 팀. 화면이 "어디로 가는가"를 보여줘야 한다.
            dustTeamId = performance.getCreatorTeam().getTeamId();
        }

        Long showId = performance.getOnChainId();
        Long escrowBalance = showId == null ? null : chainReader.escrowOf(showId).orElse(null);
        long distributable = settlement != null && settlement.getTotalRevenue() != null
                ? settlement.getTotalRevenue()
                : (escrowBalance != null ? escrowBalance : aggregate.netRevenue());

        return new SettlementDetailResponse(
                performanceId,
                settlementId,
                statusOf(settlement),
                null, // display 환율은 coin 도메인 ExchangeRateService 소관 — 합류 시 채운다
                CURRENCY,
                aggregate.grossRevenue(),
                aggregate.refundedAmount(),
                aggregate.netRevenue(),
                distributable,
                escrowBalance,
                rule == null ? null : rule.getFixedRatioBp(),
                rule == null ? null : rule.getSelectionRatioBp(),
                dust,
                dustTeamId,
                rule == null ? null : rule.getRulesHash(),
                settlement == null ? null : SettlementTime.toOffset(settlement.getAggregatedAt()),
                settlement == null ? null : SettlementTime.toOffset(settlement.getLockedAt()),
                settlement == null ? null : SettlementTime.toOffset(settlement.getDisputeDeadlineAt()),
                settlement == null ? null : SettlementTime.toOffset(settlement.getReleasedAt()),
                settlement == null ? null : settlement.getReleaseTxHash(),
                settlement == null ? null : settlement.getCounterMatch(),
                depositBlock(performance),
                List.copyOf(shareItems),
                myTeam(myParticipant, shares, settlement),
                disputes(performanceId, settlement),
                transactions(performanceId),
                actions(me, performance, settlement, rule, participants, myParticipant, shares),
                stepUpTokens.requiredFlag());
    }

    /** 요청자 팀의 몫. 참여팀이 아닌 ADMIN이 보면 {@code null}이다. */
    private MyTeam myTeam(PerformanceParticipant participant, List<SettlementShare> shares,
                          Settlement settlement) {
        if (participant == null) {
            return null;
        }
        Long teamId = participant.getTeam().getTeamId();
        SettlementShare mine = myShare(shares, participant);
        boolean released = mine != null && mine.isReleased();
        // release 가 정산의 종단이라 팀이 할 일은 "기다린다" 아니면 "없다" 둘뿐이다.
        String nextAction = released || (settlement != null
                && settlement.getStatus() == Settlement.Status.RELEASED)
                ? MyTeam.ACTION_NONE : MyTeam.ACTION_WAIT_RELEASE;
        return new MyTeam(teamId,
                mine == null ? null : mine.getTotalAmount(),
                released,
                mine == null ? null : SettlementTime.toOffset(mine.getReleasedAt()),
                mine == null ? participant.getWalletAddress() : mine.getWalletAddress(),
                nextAction,
                mine != null && mine.isApproved());
    }

    /** 요청자 팀의 분배 행. 집계 확정 전이거나 확정 뒤 합류한 팀이면 {@code null}이다. */
    private static SettlementShare myShare(List<SettlementShare> shares,
                                           PerformanceParticipant participant) {
        if (participant == null) {
            return null;
        }
        Long teamId = participant.getTeam().getTeamId();
        return shares.stream()
                .filter(share -> share.getTeam().getTeamId().equals(teamId))
                .findFirst().orElse(null);
    }

    private List<DisputeResponse> disputes(Long performanceId, Settlement settlement) {
        if (settlement == null) {
            return List.of();
        }
        // releaseHeld = "이 이의 때문에 release가 보류 중인가". 판정은 Settlement.isReleasePossible()
        // 한 곳에 있다 — 관리자 목록(API-admin-09)이 같은 메서드를 본다.
        boolean releasePossible = settlement.isReleasePossible();
        return disputeRepository.findBySettlement_SettlementId(settlement.getSettlementId()).stream()
                .map(dispute -> disputeResponse(performanceId, dispute, releasePossible))
                .toList();
    }

    private static DisputeResponse disputeResponse(Long performanceId, Dispute dispute,
                                                   boolean releasePossible) {
        return new DisputeResponse(dispute.getDisputeId(), performanceId,
                dispute.getTeam().getTeamId(), dispute.getStatus().name(),
                SettlementTime.toOffset(dispute.getSubmittedAt()),
                dispute.isOpen() && releasePossible);
    }

    private List<TransactionItem> transactions(Long performanceId) {
        return settlementTransactions(performanceId).stream()
                .map(job -> new TransactionItem(job.getTxType().name(), job.getTxHash(),
                        chainJobService.txExplorerUrl(job.getTxHash())))
                .toList();
    }

    /**
     * 버튼 활성 조건. <b>실행 API와 같은 {@link SettlementGates}를 본다</b> — 규칙을 여기서 다시
     * 적으면 "서버는 409를 내는데 버튼은 활성"이 된다.
     */
    private Actions actions(MemberPrincipal me, Performance performance, Settlement settlement,
                            SettlementRule rule, List<PerformanceParticipant> participants,
                            PerformanceParticipant myParticipant, List<SettlementShare> shares) {
        LocalDateTime now = TimeSupport.nowStored();
        return new Actions(
                actionState(gates.aggregate(me, performance, settlement, rule, participants)),
                actionState(gates.lock(me, performance, settlement)),
                actionState(gates.dispute(me, performance.getPerformanceId(), settlement,
                        myParticipant,
                        myParticipant == null ? null : myParticipant.getTeam().getTeamId(), now)),
                actionState(gates.release(me, performance, settlement, shares, true, now)),
                actionState(gates.approve(me, settlement, myParticipant,
                        myShare(shares, myParticipant))));
    }

    private static ActionState actionState(Optional<Blocked> blocked) {
        return blocked.map(b -> ActionState.block(b.code().getCode()))
                .orElseGet(ActionState::allow);
    }

    // ================================================================ API-settlement-02

    /**
     * API-settlement-02 집계 확정. 202 + 폴링.
     *
     * <p>게이트 순서가 곧 의미다 — 권한·상태·진행 중 작업·규칙 형태({@link SettlementGates}) →
     * <b>대사</b>({@link SettlementReconciler}). 대사를 맨 뒤에 두는 이유는 그 전 단계에서 걸릴
     * 요청에까지 체인 조회를 쏘지 않기 위해서다.
     *
     * <p><b>enqueue 전에 {@code valid_ticket_count}를 쓴다.</b> 이것을 빠뜨리면 tx가 영원히 나가지
     * 못한다 — {@code ContractOperatorTxBuilder}가 <b>전송 시점에</b>
     * {@code settlement.valid_ticket_count}를 읽어 {@code aggregate(showId, validTicketCount)}의
     * 인자를 만드는데(이강륜과 합의된 규약: chain_job에 payload 컬럼을 두지 않는다), 그 값을 확정
     * 반영에서 처음 쓰면 <b>값이 있어야 tx를 만들고 tx가 확정돼야 값을 쓰는</b> 순환이 된다.
     */
    @Transactional
    public AggregateResponse aggregate(MemberPrincipal me, Long performanceId) {
        Performance performance = loadPerformance(performanceId);
        Settlement settlement = settlementRepository
                .findByPerformance_PerformanceId(performanceId).orElse(null);
        SettlementRule rule = settlementRuleRepository
                .findByPerformance_PerformanceId(performanceId).orElse(null);
        List<PerformanceParticipant> participants = registeredParticipants(performanceId);

        gates.aggregate(me, performance, settlement, rule, participants)
                .ifPresent(blocked -> {
                    throw blocked.toException();
                });

        SettlementTeams teams = SettlementTeams.of(participants,
                performance.getCreatorTeam().getTeamId());
        SettlementReconciler.ServerAggregate aggregate = reconciler.serverAggregate(performanceId);
        SettlementReconciler.Reconciliation reconciliation =
                reconciler.reconcile(performance.getOnChainId(), teams, aggregate);

        // 서버 집계값과 대사 결과를 별도 트랜잭션으로 먼저 커밋한다.
        //  ① valid_ticket_count 는 빌더가 전송 시점에 읽는 tx 인자다(위 javadoc).
        //  ② counter_match 는 아래 409 로 롤백되면 사라져 "왜 막혔는지"가 화면에서 없어진다.
        int totalChoiceCount = Math.toIntExact(
                java.util.Arrays.stream(reconciliation.serverCounts()).sum());
        Long settlementId = stateWriter.ensureSettlement(performance);
        stateWriter.recordServerAggregate(settlementId, reconciliation.matched(),
                aggregate.validTicketCount(), totalChoiceCount);

        if (!reconciliation.matched()) {
            log.warn("집계 대사 실패 — performanceId={} {}", performanceId,
                    SettlementReconciler.describe(reconciliation));
            throw ErrorCode.SETTLEMENT_AGGREGATE_MISMATCH.toException();
        }

        SettlementJobEnqueuer.Enqueued enqueued = jobEnqueuer.enqueue(
                ChainJob.TxType.AGGREGATE, performanceId, reconciliation.serverNetRevenue(),
                "settlement:aggregate:" + settlementId,
                me == null ? null : me.memberId());

        return new AggregateResponse(enqueued.jobId(), ChainJob.Status.PENDING.name(),
                ChainJob.SignerType.OPERATOR.name(), POLL_AFTER_MS, performanceId,
                Settlement.Status.AGGREGATED.name(), aggregate.validTicketCount());
    }

    // ================================================================ API-settlement-03

    /** API-settlement-03 정산 잠금(이의제기 시작). 202 + 폴링. */
    @Transactional
    public LockResponse lock(MemberPrincipal me, Long performanceId) {
        Performance performance = loadPerformance(performanceId);
        Settlement settlement = settlementRepository
                .findByPerformance_PerformanceId(performanceId).orElse(null);

        gates.lock(me, performance, settlement).ifPresent(blocked -> {
            throw blocked.toException();
        });

        SettlementJobEnqueuer.Enqueued enqueued = jobEnqueuer.enqueue(
                ChainJob.TxType.LOCK, performanceId, settlement.getTotalRevenue(),
                "settlement:lock:" + settlement.getSettlementId(),
                me == null ? null : me.memberId());

        // 응답의 마감 시각은 예상값이다. 확정값은 receipt 확정 시각 + 48h 로 다시 계산된다.
        return new LockResponse(enqueued.jobId(), ChainJob.Status.PENDING.name(),
                ChainJob.SignerType.OPERATOR.name(), POLL_AFTER_MS, performanceId,
                Settlement.Status.LOCKED.name(),
                SettlementTime.now().plus(properties.disputePeriod()));
    }

    // ================================================================ API-settlement-04

    /**
     * API-settlement-04 이의제기. 권한 참여팀 리더. 온체인 작업이 아니라 동기 201이다.
     *
     * <p><b>{@link #releaseInternal}과 같은 공연 행 쓰기 락을 잡는다.</b> 조기 동의
     * (API-settlement-08)가 들어오기 전에는 두 동작이 시간으로 배타적이었다 — 이의는 마감 전,
     * 실행은 마감 뒤. 전원 동의가 마감을 건너뛰면서 둘이 같은 시간대에 겹치고, 락이 없으면
     * release 게이트가 "열린 이의 0건"을 읽은 직후 이 메서드가 이의를 커밋해 <b>열린 이의가 있는데
     * 되돌릴 수 없는 지급 tx 가 나간다</b>. 반대 순서(release 가 먼저 락을 잡는 경우)는 락만으로는
     * 남으므로 {@link SettlementGates#dispute}가 진행 중인 {@code RELEASE} job 을 보고 거절한다 —
     * 두 방향을 각각 막는다.
     *
     * <p>락 수단이 {@code em.refresh} 인 이유는 {@link #releaseInternal}에 적어 두었다(락 파인더로
     * 다시 조회해도 영속성 컨텍스트의 낡은 필드가 덮이지 않는다).
     *
     * <p><b>격리 수준을 {@code READ_COMMITTED}로 내린다.</b> 기본 REPEATABLE READ에서는 read view가
     * 이 트랜잭션의 첫 읽기 시점에 고정돼, 락을 기다리는 동안 상대가 커밋한 {@code RELEASE} job이
     * 게이트의 일반 조회에 보이지 않는다 — 위 ②가 무력해진다. 같은 이유·같은 수단을
     * {@code PerformanceService.cancel}이 이미 쓴다.
     */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public DisputeResponse dispute(MemberPrincipal me, Long performanceId, DisputeRequest request) {
        Performance performance = loadPerformance(performanceId);
        lockPerformanceRow(performance);
        Settlement settlement = settlementRepository
                .findByPerformance_PerformanceId(performanceId).orElse(null);
        PerformanceParticipant participant = request.teamId() == null ? null
                : participantRepository
                        .findByPerformance_PerformanceIdAndTeam_TeamId(performanceId, request.teamId())
                        .filter(p -> p.getStatus() == PerformanceParticipant.Status.REGISTERED)
                        .orElse(null);

        gates.dispute(me, performanceId, settlement, participant, request.teamId(),
                        TimeSupport.nowStored())
                .ifPresent(blocked -> {
                    throw blocked.toException();
                });

        String reason = request.reason() == null ? "" : request.reason().trim();
        if (reason.length() < 10 || reason.length() > 1_000) {
            throw ErrorCode.COMMON_VALIDATION_FAILED.toException(
                    "이의 사유는 10자 이상 1000자 이하로 입력해 주세요.");
        }

        Dispute dispute = disputeRepository.save(Dispute.builder()
                .settlement(settlement)
                .team(participant.getTeam())
                .reason(reason)
                .build());
        // request.expectedAmount() 는 저장할 컬럼이 ERD 에 없다(open-questions D-15). 로그로만 남긴다.
        log.info("이의제기 접수 — settlementId={} teamId={} expectedAmount={}",
                settlement.getSettlementId(), request.teamId(), request.expectedAmount());

        // releaseHeld 의 정의는 Settlement.isReleasePossible() 하나다 — 여기서 false 로 박으면
        // 방금 접수한 OPEN 이의가 API-settlement-01·API-admin-09 와 다른 답을 낸다.
        return disputeResponse(performanceId, dispute, settlement.isReleasePossible());
    }

    // ================================================================ API-settlement-08

    /**
     * API-settlement-08 정산 조기 동의. 권한 참여팀 리더. 온체인 작업이 아니라 동기 201이다.
     *
     * <p>동의할 팀을 <b>요청 본문으로 받지 않는다</b>(API-settlement-04와 다른 점이다) — 조기 동의는
     * 남이 대신 눌러 줄 수 없고, 요청자가 리더인 참여팀이 곧 대상이다. 게이트에 ADMIN 우회가 없는
     * 것과 같은 이유다({@link SettlementGates#approve}).
     */
    @Transactional
    public ApprovalResponse approve(MemberPrincipal me, Long performanceId) {
        return approve(me, performanceId, null);
    }

    /**
     * {@code stepUpToken} — [2026-09-24] 본인 확인 토큰(API v7 §7.W, 범위 = SETTLEMENT_APPROVE·공연).
     * 스위치가 꺼져 있으면 읽지 않는다. 켜져 있으면 게이트(참여팀 리더·상태)를 통과한 <b>뒤</b>에
     * 검사한다 — 막힐 요청이 토큰을 태우지 않게.
     */
    @Transactional
    public ApprovalResponse approve(MemberPrincipal me, Long performanceId, String stepUpToken) {
        loadPerformance(performanceId);
        Settlement settlement = settlementRepository
                .findByPerformance_PerformanceId(performanceId).orElse(null);
        PerformanceParticipant participant =
                participantOf(me, registeredParticipants(performanceId));
        List<SettlementShare> shares = settlement == null ? List.of()
                : settlementShareRepository
                        .findBySettlement_SettlementId(settlement.getSettlementId());
        SettlementShare mine = myShare(shares, participant);

        gates.approve(me, settlement, participant, mine)
                .ifPresent(blocked -> {
                    throw blocked.toException();
                });
        stepUpTokens.guard(me == null ? 0L : me.memberId(), StepUpAction.SETTLEMENT_APPROVE, performanceId, stepUpToken);

        mine.approve(TimeSupport.nowStored());
        settlementShareRepository.saveAndFlush(mine);

        // 손에 든 shares 는 게이트 앞에서 읽은 스냅샷이다 — 그대로 세면 마지막 두 팀이 나란히
        // 누를 때 둘 다 "2/3 · releaseUnlocked=false" 를 받아 어느 화면도 "이제 지급할 수 있습니다"
        // 를 못 띄운다. 저장을 flush 한 뒤 DB 에서 다시 센다.
        //
        // 공연 행 락(lockPerformanceRow)까지 잡으면 동시 동의도 완전히 직렬화되지만 걸지 않았다 —
        // 동의는 돈을 움직이지 않고, 남는 것은 "두 트랜잭션이 정말 동시에 열려 서로의 미커밋 동의를
        // 못 보는" 창뿐이다. 그 경우에도 다음 조회(API-settlement-01)와 60초 자동 스케줄이 곧바로
        // 같은 결론에 닿는다. 되돌릴 수 없는 tx 를 만드는 release 와 달리 여기서 잃는 것은 숫자
        // 한 번이다.
        int approvedCount = (int) settlementShareRepository
                .countBySettlement_SettlementIdAndApprovedAtNotNull(settlement.getSettlementId());
        int requiredCount = shares.size();
        log.info("정산 조기 동의 — settlementId={} teamId={} {}/{}", settlement.getSettlementId(),
                mine.getTeam().getTeamId(), approvedCount, requiredCount);
        // 전원이 찼다고 release 를 여기서 접수하지 않는다. 남은 게이트(열린 이의·대사·에스크로)를
        // 이 트랜잭션에서 다시 판정하면 규칙이 두 벌이 되고, 자동 스케줄이 60초 안에 같은 일을 한다.
        return new ApprovalResponse(mine.getTeam().getTeamId(),
                SettlementTime.toOffset(mine.getApprovedAt()),
                approvedCount, requiredCount, approvedCount == requiredCount);
    }

    // ================================================================ API-settlement-05

    /**
     * API-settlement-05 release 실행(수동). 202 + 폴링. {@code Idempotency-Key} 필수.
     *
     * <p><b>격리 수준을 {@code READ_COMMITTED}로 내린다.</b> 이 경로는
     * {@link #lockPerformanceRow}로 공연 행을 잡아 취소·{@link #dispute}와 직렬화되는데, 기본
     * REPEATABLE READ에서는 read view가 이 트랜잭션의 첫 읽기 시점에 고정돼 <b>락을 기다리는 동안
     * 상대가 커밋한 이의</b>가 게이트의 일반 조회에 보이지 않는다 — 락이 순서만 세우고 판정은
     * 낡은 스냅샷으로 한다. 잠금 읽기 대신 격리 수준을 쓰는 이유는 {@code PerformanceService.cancel}
     * javadoc에 적혀 있다(잠금 범위를 늘리지 않는다).
     */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ReleaseResponse release(MemberPrincipal me, Long performanceId, ReleaseRequest request) {
        return release(me, performanceId, request, null);
    }

    /**
     * {@code stepUpToken} — [2026-09-24] 본인 확인 토큰(API v7 §7.W, 범위 = SETTLEMENT_RELEASE·공연).
     * 스위치가 꺼져 있으면 읽지 않는다. 켜져 있으면 생성자·ADMIN 확인 <b>뒤</b>에 검사한다. 자동
     * 스케줄({@link #releaseAutomatically})은 사람이 없으므로 가드하지 않는다.
     */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ReleaseResponse release(MemberPrincipal me, Long performanceId, ReleaseRequest request,
                                   String stepUpToken) {
        Performance performance = loadPerformance(performanceId);
        gates.ownerOrAdmin(me, performance).ifPresent(blocked -> {
            throw blocked.toException();
        });
        stepUpTokens.guard(me == null ? 0L : me.memberId(), StepUpAction.SETTLEMENT_RELEASE, performanceId, stepUpToken);

        String idempotencyKey = idempotencyKeyFromRequest();
        if (idempotencyKey == null) {
            throw ErrorCode.COMMON_VALIDATION_FAILED.toException(
                    "Idempotency-Key 헤더가 필요합니다.");
        }
        if (request != null && request.note() != null && request.note().length() > 200) {
            throw ErrorCode.COMMON_VALIDATION_FAILED.toException("실행 사유는 200자 이하로 입력해 주세요.");
        }
        return releaseInternal(me, performance, idempotencyKey,
                me == null ? null : me.memberId(), false);
    }

    /**
     * 자동 스케줄용 진입점 — <b>수동 API와 같은 메서드를 탄다.</b>
     *
     * <p>두 경로가 갈라지면 한쪽만 게이트를 빠뜨린다. 다른 것은 멱등키(자동은
     * {@code release:auto:{settlementId}})와 요청자(자동은 없음)뿐이다.
     *
     * <p>격리 수준을 내리는 이유도 {@link #release}와 같다 — 같은 락, 같은 게이트를 지난다.
     */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ReleaseResponse releaseAutomatically(Long settlementId) {
        Settlement settlement = settlementRepository.findById(settlementId)
                .orElseThrow(ErrorCode.COMMON_NOT_FOUND::toException);
        return releaseInternal(null, settlement.getPerformance(),
                autoReleaseKey(settlementId), null, true);
    }

    /** 자동 release 의 고정 멱등키. 밀려난 실패 이력은 이 값 + {@code #failed:{jobId}} 다. */
    private static String autoReleaseKey(Long settlementId) {
        return "release:auto:" + settlementId;
    }

    /**
     * 공연 행에 쓰기 락 — 이 도메인에서 <b>같은 공연을 동시에 건드리는 경로들의 단일 직렬화 지점</b>이다.
     *
     * <p>세 경로가 이 락으로 줄을 선다.
     * <ul>
     *   <li>공연 취소({@code PerformanceService.cancel}) ↔ {@link #releaseInternal} — 락이 없으면
     *       게이트가 "CANCELLED 아님"을 본 직후 취소가 {@code markCancelled}를 커밋해
     *       {@code RELEASE}·{@code HALT}가 함께 큐에 선다
     *   <li>{@link #dispute} ↔ {@link #releaseInternal} — 조기 동의로 이의제기 기간과 지급이 같은
     *       시간대에 겹친다. 락이 없으면 release 가 "열린 이의 0건"을 읽은 직후 이의가 커밋된다
     * </ul>
     *
     * <p><b>락 파인더로 다시 조회하는 것으로는 부족하다.</b> 호출자가 이미 로드한 인스턴스는 영속성
     * 컨텍스트에 있어 Hibernate 가 락 모드만 올리고 필드를 덮어쓰지 않는다. 그러면 게이트가 읽는
     * {@code status}는 락을 기다리기 전의 값이라 상대가 커밋한 {@code CANCELLED}를 못 본다.
     * {@code refresh}는 같은 락을 잡으면서 DB 상태로 인스턴스를 덮어쓴다(미저장 변경은 없다).
     *
     * <p>조회 경로({@code actions()})에는 걸지 않는다 — 판정만 하고 아무것도 바꾸지 않는다.
     */
    private void lockPerformanceRow(Performance performance) {
        EntityLocks.lockForUpdate(em, performance);
    }

    /**
     * @param automatic 스케줄러가 부른 경로인가 — {@code true}면 FAILED 재시도에 상한이 걸린다
     */
    private ReleaseResponse releaseInternal(MemberPrincipal me, Performance performance,
                                            String idempotencyKey, Long requesterMemberId,
                                            boolean automatic) {
        Long performanceId = performance.getPerformanceId();
        Settlement settlement = requireSettlement(performanceId);

        // 같은 키의 재요청이면 게이트를 다시 태우지 않고 최초 응답을 재생한다(§0.8).
        Optional<ChainJob> replay = chainJobRepository.findByIdempotencyKey(idempotencyKey);
        if (replay.isPresent()) {
            ChainJob job = replay.get();
            if (job.getTxType() != ChainJob.TxType.RELEASE
                    || !performanceId.equals(job.getTargetPerformanceId())) {
                throw ErrorCode.COMMON_CONFLICT.toException(
                        "같은 요청 키가 다른 작업에 이미 사용되었습니다.");
            }
            if (job.getStatus() != ChainJob.Status.FAILED) {
                return releaseResponse(SettlementJobEnqueuer.jobId(job.getChainJobId()),
                        job.getStatus(), performance, settlement);
            }
            // FAILED 는 재생하지 않는다 — 자동 경로는 스케줄러가 60초마다 같은 죽은 job 을 돌려받아
            // 영영 새 job 을 만들지 못했고(교착), 수동 경로는 프론트가 마운트당 키 하나를 쓰므로
            // "다시 시도"가 같은 FAILED 를 그대로 받았다. CREATE_SHOW·START_SALE 이 같은 이유로
            // 이미 같은 예외를 둔다({@code ShowCreationService}·{@code RuleService}).
            //
            // 안전한 이유: release(showId) 는 단일 원자 tx 라 FAILED 면 온체인에서 아무것도 움직이지
            // 않았고, 혹시 사실은 성공했는데 서버가 FAILED 로 적었다면 두 번째 tx 는 컨트랙트
            // stage 가 RELEASED 라 InvalidStage 로 revert 한다(RevenueSplitter.sol:830). 서버 쪽도
            // settlement.status == RELEASED 를 게이트가 SETTLEMENT_ALREADY_RELEASED 로 막는다.
            // MINT 와 달리 RELEASE 의 calldata 는 showId 하나뿐이라 멱등키가 온체인 인자에 섞이지
            // 않는다(ContractOperatorTxBuilder.showIdCall) — 키를 바꿔도 이중 지급이 되지 않는다.
            if (automatic) {
                guardAutoReleaseAttempts(settlement.getSettlementId(), job);
            }
            job.retireIdempotencyKey();
            chainJobRepository.saveAndFlush(job);
            log.warn("RELEASE job {} 이 FAILED 라 새 job 을 만든다 — performanceId={} automatic={} reason={}",
                    job.getChainJobId(), performanceId, automatic, job.getFailureReason());
        }

        List<SettlementShare> shares =
                settlementShareRepository.findBySettlement_SettlementId(settlement.getSettlementId());
        // 게이트를 락 앞에서 한 번 먼저 태운다 — 막힐 요청(이의제기 기간 등, 스케줄러가 매 분 부른다)이
        // 아래 에스크로 RPC 를 치지 않게 하고, 에러 우선순위(게이트 코드가 COIN_ESCROW_INSUFFICIENT
        // 보다 먼저)를 지킨다. 아무것도 쓰지 않으므로 락 없이 거절해도 같고, 판정은 락 뒤에서 다시 한다.
        requireReleaseGates(me, performance, settlement, shares);

        long totalAmount = shares.stream().mapToLong(SettlementShare::getTotalAmount).sum();
        // 에스크로 조회(온체인 RPC)는 락 앞에 둔다 — 락 구간에 있으면 노드가 느린 만큼 공연 행을
        // 붙잡고 같은 공연의 취소·이의제기가 전부 대기한다(PerformanceService.cancel 의 requireEscrow 와
        // 같은 구조). 락을 기다리는 사이 값이 낡아도 된다: 이 검사는 사전 거절일 뿐이고, 락 안에서
        // 읽어도 tx 는 큐에서 나중에 나가므로 어차피 시점 값이다 — 실제로 모자라면 컨트랙트 release 가
        // InsufficientEscrow 로 revert 해 돈은 움직이지 않는다(RevenueSplitter.sol release).
        Long showId = performance.getOnChainId();
        if (showId != null) {
            Optional<Long> escrow = chainReader.escrowOf(showId);
            if (escrow.isPresent() && escrow.get() < totalAmount) {
                throw ErrorCode.COIN_ESCROW_INSUFFICIENT.toException();
            }
        }

        // lockPerformanceRow 는 refresh 라 performance 는 락 뒤 최신이다(대기 중 커밋된 CANCELLED 를 본다).
        lockPerformanceRow(performance);
        requireReleaseGates(me, performance, settlement, shares);

        SettlementJobEnqueuer.Enqueued enqueued = jobEnqueuer.enqueue(
                ChainJob.TxType.RELEASE, performanceId, totalAmount, idempotencyKey,
                requesterMemberId);
        return releaseResponse(enqueued.jobId(), enqueued.job().getStatus(), performance, settlement);
    }

    /** 자동 경로에는 요청자가 없다({@code me == null}) — 권한 검사는 수동 경로만 한다. */
    private void requireReleaseGates(MemberPrincipal me, Performance performance, Settlement settlement,
                                     List<SettlementShare> shares) {
        gates.release(me, performance, settlement, shares, me != null, TimeSupport.nowStored())
                .ifPresent(blocked -> {
                    throw blocked.toException();
                });
    }

    /**
     * 자동 release 가 새 job 을 몇 번까지 만들 수 있는가.
     *
     * <p><b>{@code ChainWorkerProperties.maxRetry}(3)와 뜻이 다르다.</b> 그것은 <b>한 job 안에서</b>
     * 같은 tx 를 다시 보내는 횟수고, 이 값은 <b>job 자체를 새로 만드는</b> 횟수다. 값이 같은 것은
     * 우연이 아니라 "3번 해서 안 되면 사람이 본다"는 같은 기준을 쓴 것이고, 설정으로 빼지 않은
     * 이유는 운영 중에 이 숫자를 돌릴 일이 없기 때문이다(늘려야 할 상황이면 원인이 다르다).
     *
     * <p>상한이 필요한 이유: 선례 둘(CREATE_SHOW·START_SALE)은 <b>사람이 API 를 다시 부르는</b>
     * 경로라 재시도가 저절로 제한된다. 자동 release 는 스케줄러가 60초마다 부르므로 상한이 없으면
     * 교착이 "60초마다 새 tx 를 보내며 가스를 태우는 무한 루프"로 바뀐다. 특히 <b>결말을 모르는
     * FAILED</b>(온체인은 성공했는데 서버가 실패로 적은 경우)에서는 새 tx 가 매번 InvalidStage 로
     * revert 하므로 상한이 곧 낭비되는 가스의 상한이다.
     */
    private static final long AUTO_RELEASE_MAX_ATTEMPTS = 3;

    /**
     * 상한에 닿았으면 자동 재시도를 멈춘다. 수동 API(새 {@code Idempotency-Key})는 그대로 열려 있어
     * 사람이 개입할 수 있다 — 그래서 이 상한은 수동 경로에 걸지 않는다.
     *
     * <p>조용히 멈추면 지금 교착과 다를 게 없으므로 <b>매 주기 ERROR 로 남긴다.</b> 사람이 수동
     * release 를 성공시키면 정산이 {@code RELEASED}가 되고 스케줄러의 선별 쿼리
     * ({@code findReleaseCandidates} — 상태가 LOCKED·DISPUTE_OPEN 인 것만 본다)에서 빠져 로그도
     * 함께 멈춘다.
     */
    private void guardAutoReleaseAttempts(Long settlementId, ChainJob failed) {
        long retired = chainJobRepository
                .countByIdempotencyKeyStartingWith(autoReleaseKey(settlementId) + "#failed:");
        long attempts = retired + 1; // 지금 손에 든 FAILED job 까지 센다
        if (attempts < AUTO_RELEASE_MAX_ATTEMPTS) {
            return;
        }
        log.error("자동 release 재시도 상한 도달 — settlementId={} attempts={}/{} lastJobId={} reason={}."
                        + " 자동 재시도를 멈춘다. 수동 API 에 새 Idempotency-Key 를 주어 재시도해야 한다.",
                settlementId, attempts, AUTO_RELEASE_MAX_ATTEMPTS, failed.getChainJobId(),
                failed.getFailureReason());
        throw ErrorCode.COMMON_CONFLICT.toException(
                "자동 정산 실행이 " + attempts + "회 실패해 자동 재시도를 멈췄습니다. 관리자 확인이 필요합니다.");
    }

    private ReleaseResponse releaseResponse(String jobId, ChainJob.Status status,
                                            Performance performance, Settlement settlement) {
        List<SettlementShare> shares =
                settlementShareRepository.findBySettlement_SettlementId(settlement.getSettlementId());
        long totalAmount = shares.stream().mapToLong(SettlementShare::getTotalAmount).sum();
        boolean depositReturnPlanned =
                performance.getDepositStatus() == Performance.DepositStatus.PAID
                        && performance.getDepositAmount() != null
                        && performance.getDepositAmount() > 0;
        return new ReleaseResponse(jobId, status.name(), ChainJob.SignerType.OPERATOR.name(),
                RELEASE_POLL_AFTER_MS, performance.getPerformanceId(), settlement.getSettlementId(),
                Settlement.Status.RELEASED.name(), shares.size(), totalAmount, CURRENCY,
                depositReturnPlanned, performance.getDepositAmount(), PAYOUT_NOTICE);
    }

    // ================================================================ API-settlement-06

    /** API-settlement-06 정산 공유 링크 생성. 권한 생성자(리더). 재발급하면 기존 토큰이 죽는다. */
    @Transactional
    public ShareLinkResponse shareLink(MemberPrincipal me, Long performanceId) {
        Performance performance = loadPerformance(performanceId);
        if (me == null) {
            throw ErrorCode.COMMON_UNAUTHORIZED.toException();
        }
        if (!me.admin() && !performance.getCreatorTeam().isLedBy(me.memberId())) {
            throw ErrorCode.PERFORMANCE_NOT_OWNER.toException(
                    "공연 생성 팀의 리더만 공유 링크를 만들 수 있습니다.");
        }

        Settlement settlement = requireSettlement(performanceId);
        if (settlement.getStatus() == Settlement.Status.NONE) {
            throw ErrorCode.PERFORMANCE_INVALID_STATUS.toException(
                    "집계가 확정된 뒤에 공유 링크를 만들 수 있습니다.");
        }

        String token = newShareToken();
        settlement.issueShareToken(token);
        return new ShareLinkResponse(performanceId, properties.shareBaseUrl() + "/" + token, token,
                SettlementTime.now());
    }

    /**
     * 추측 불가능한 토큰 — 인증 없이 열리는 링크의 유일한 방어선이다.
     *
     * <p>{@link SecureRandom} 12바이트(96비트)를 hex로 편다. 정산 id·공연 id를 섞지 않는다 —
     * 섞으면 다른 공연의 링크를 만들어 볼 수 있다.
     */
    private static String newShareToken() {
        byte[] bytes = new byte[12];
        SHARE_TOKEN_RANDOM.nextBytes(bytes);
        return "stl_" + HexFormat.of().formatHex(bytes).toLowerCase(Locale.ROOT);
    }

    // ================================================================ API-settlement-07

    /**
     * API-settlement-07 공개 조회. 권한 <b>GUEST</b>.
     *
     * <p>{@code teamId}·{@code walletAddress}·회원 정보를 담지 않는다 — 링크만 아는 사람에게 팀 지갑
     * 주소까지 노출할 이유가 없다. 담는 것은 <b>팀 이름과 금액</b>뿐이고, 그것이 이 링크의 목적
     * (밴드 멤버가 분배 결과를 확인)에 필요한 전부다.
     */
    public PublicSettlementResponse publicSettlement(String shareToken) {
        Settlement settlement = settlementRepository.findByShareToken(shareToken)
                .orElseThrow(ErrorCode.COMMON_NOT_FOUND::toException);
        Performance performance = settlement.getPerformance();
        SettlementRule rule = settlementRuleRepository
                .findByPerformance_PerformanceId(performance.getPerformanceId()).orElse(null);
        SettlementReconciler.ServerAggregate aggregate =
                reconciler.serverAggregate(performance.getPerformanceId());

        List<PublicShareItem> shares = settlementShareRepository
                .findBySettlement_SettlementId(settlement.getSettlementId()).stream()
                .map(share -> new PublicShareItem(share.getTeam().getName(),
                        share.getEqualAmount(), share.getSelectionAmount(), share.getDustAmount(),
                        share.getTotalAmount(), share.getChoiceCount(), share.isReleased()))
                .toList();

        return new PublicSettlementResponse(
                performance.getPerformanceId(),
                performance.getTitle(),
                SettlementTime.toOffset(performance.getPerformanceAt()),
                settlement.getStatus().name(),
                null, // display 환율은 coin 도메인 소관 — 합류 시 채운다
                CURRENCY,
                aggregate.grossRevenue(),
                aggregate.refundedAmount(),
                aggregate.netRevenue(),
                rule == null ? null : rule.getFixedRatioBp(),
                rule == null ? null : rule.getSelectionRatioBp(),
                shares,
                settlement.getReleaseTxHash(),
                chainJobService.txExplorerUrl(settlement.getReleaseTxHash()),
                SIMULATION_NOTICE);
    }

    // ================================================================ 공통

    /** 정산 관련 확정 tx 목록. 조회 응답 {@code transactions[]}의 원천이다. */
    public List<ChainJob> settlementTransactions(Long performanceId) {
        return chainJobRepository.findByTargetPerformanceIdAndTxTypeInAndStatusOrderByChainJobIdAsc(
                performanceId, SETTLEMENT_TX, ChainJob.Status.CONFIRMED);
    }

    private Performance loadPerformance(Long performanceId) {
        return performanceRepository.findById(performanceId)
                .orElseThrow(ErrorCode.PERFORMANCE_NOT_FOUND::toException);
    }

    private Settlement requireSettlement(Long performanceId) {
        return settlementRepository.findByPerformance_PerformanceId(performanceId)
                .orElseThrow(() -> ErrorCode.SETTLEMENT_NOT_LOCKED.toException(
                        "아직 집계가 시작되지 않았습니다."));
    }

    private List<PerformanceParticipant> registeredParticipants(Long performanceId) {
        return participantRepository.findByPerformance_PerformanceIdAndStatus(
                performanceId, PerformanceParticipant.Status.REGISTERED);
    }

    /** 요청자가 리더인 참여팀. 없으면 {@code null}(ADMIN도 팀이 없으면 {@code null}이다). */
    private static PerformanceParticipant participantOf(MemberPrincipal me,
                                                        List<PerformanceParticipant> participants) {
        if (me == null) {
            return null;
        }
        return participants.stream()
                .filter(p -> p.getTeam().isLedBy(me.memberId()))
                .findFirst().orElse(null);
    }

    /**
     * 참여팀 소속 판정. 팀 소속 테이블이 없으므로 <b>참여팀의 리더</b>가 곧 소속이다.
     * 공연 생성 팀의 리더도 참여팀 리더다(생성 팀은 참여팀 목록에 들어간다).
     */
    private static void requireParticipant(MemberPrincipal me, PerformanceParticipant participant) {
        if (me == null) {
            throw ErrorCode.COMMON_UNAUTHORIZED.toException();
        }
        if (!me.admin() && participant == null) {
            throw ErrorCode.SETTLEMENT_NOT_PARTICIPANT.toException();
        }
    }

    private DepositBlock depositBlock(Performance performance) {
        return new DepositBlock(performance.getDepositStatus().name(),
                performance.getDepositAmount(), performance.getDepositReturnTxHash(),
                SettlementTime.toOffset(performance.getDepositReturnedAt()));
    }

    private static String statusOf(Settlement settlement) {
        return settlement == null ? Settlement.Status.NONE.name() : settlement.getStatus().name();
    }

    /**
     * {@code Idempotency-Key} 헤더를 요청 컨텍스트에서 직접 읽는다.
     *
     * <p>컨트롤러 시그니처에 {@code @RequestHeader} 파라미터가 없다(open-questions D-14 — coin의
     * D-1과 같은 자리). 컨트롤러는 API v6 계약이라 임의로 고치지 않고, 파라미터가 추가되면 이 메서드
     * 대신 인자를 받는 오버로드를 쓰면 된다.
     */
    private static String idempotencyKeyFromRequest() {
        if (!(RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs)) {
            return null;
        }
        String key = attrs.getRequest().getHeader(IDEMPOTENCY_HEADER);
        return key == null || key.isBlank() ? null : key.trim();
    }
}
