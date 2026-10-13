package com.ssafy.b204.settlement.service;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.payment.entity.Payment;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.entity.PerformanceParticipant;
import com.ssafy.b204.refund.entity.Refund;
import com.ssafy.b204.rule.entity.SettlementRule;
import com.ssafy.b204.settlement.entity.Dispute;
import com.ssafy.b204.settlement.entity.Settlement;
import com.ssafy.b204.settlement.entity.SettlementShare;
import com.ssafy.b204.settlement.repository.DisputeRepository;
import com.ssafy.b204.settlement.repository.SettlementChainJobRepository;
import com.ssafy.b204.settlement.repository.SettlementPaymentRepository;
import com.ssafy.b204.settlement.repository.SettlementRefundRepository;
import com.ssafy.b204.ticket.entity.TicketOrder;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 단계별 게이트의 <b>단일 정의</b>.
 *
 * <h2>왜 예외를 던지지 않고 "막힌 이유"를 돌려주는가</h2>
 *
 * <p>같은 규칙을 두 곳이 필요로 한다 — ① 실행 API가 4xx로 거절할 때 ② 조회 API가
 * {@code actions.{aggregate,lock,dispute,release}.{available, blockedReason}}을 채울 때
 * (API v6 §11 -01: "버튼 활성 조건을 서버가 정한다"). 규칙을 두 번 적으면 <b>서버는 409를 내는데
 * 버튼은 활성</b>인 상태가 생긴다. 그래서 판정은 여기 한 번만 적고, 실행 경로는
 * {@link Blocked#toException()}으로 같은 결론을 예외로 바꾼다.
 *
 * <p>여기 없는 것은 <b>체인을 읽어야 하는 검사</b>다 — 집계 대사({@code choiceCountsOf}·
 * {@code escrowOf})와 release 직전 에스크로 확인. 조회 한 번에 체인 호출이 여러 번 붙으면
 * {@code actions}가 화면을 느리게 만들고, 그 두 검사는 실행 시점에만 의미가 있다
 * ({@link SettlementReconciler}·{@link SettlementService}가 각각 맡는다).
 *
 * <p>{@link ReleaseHaltGuard#isReleaseHalted()}는 예외가 아니다 — 이름과 달리 체인을 읽지 않는다.
 * 구현({@code coin}의 {@code SupplyReconciler})이 <b>마지막 대사 스냅샷을 읽기만 하도록</b>
 * 고정돼 있고, 갱신은 그쪽 스케줄러와 정산 확정 이벤트가 맡는다(MR !73 리뷰). 그래서 여기서
 * 불러도 조회 경로가 체인 스캔을 유발하지 않는다.
 */
@Component
@RequiredArgsConstructor
public class SettlementGates {

    /**
     * 집계를 막는 결제 상태 중 <b>주문이 죽어도 세는</b> 것 — 대납 tx 가 이미 체인으로 나갔다.
     *
     * <p>주문이 만료된 뒤에도 뒤늦게 채굴돼 카운터를 올릴 수 있고, 그 job 이 유실 판정으로
     * 닫히면({@code CHAIN_TX_TIMEOUT}) {@code chain_job} in-flight 검사에서도 빠진다.
     */
    private static final List<Payment.Status> PAYMENT_SENT = List.of(Payment.Status.PAYING);
    /**
     * 집계를 막는 결제 상태 중 <b>살아 있는 주문의 것만 세는</b> 것 — 체인에 아무것도 나가지 않았다.
     *
     * <p>만료·취소된 주문의 미서명 결제는 카운터를 바꿀 수 없는데도 집계를 영구히 막았다(D-83).
     */
    private static final List<Payment.Status> PAYMENT_UNSIGNED =
            List.of(Payment.Status.REQUESTED, Payment.Status.AWAITING_SIGNATURE);
    private static final List<Refund.Status> REFUND_IN_FLIGHT =
            List.of(Refund.Status.PENDING, Refund.Status.PROCESSING);
    private static final List<ChainJob.Status> JOB_IN_FLIGHT =
            List.of(ChainJob.Status.PENDING, ChainJob.Status.SUBMITTED);
    private static final List<ChainJob.TxType> COIN_MOVING_TX =
            List.of(ChainJob.TxType.PURCHASE, ChainJob.TxType.APPROVE, ChainJob.TxType.REFUND,
                    ChainJob.TxType.MINT);

    private final SettlementChainJobRepository chainJobRepository;
    private final SettlementPaymentRepository paymentRepository;
    private final SettlementRefundRepository refundRepository;
    private final DisputeRepository disputeRepository;
    private final ReleaseHaltGuard releaseHaltGuard;

    /**
     * 막힌 이유.
     *
     * @param msg {@code null}이면 {@link ErrorCode#getDefaultMsg()}. 금액·시각이 들어가야 할 때만 채운다(규격 §2)
     */
    public record Blocked(ErrorCode code, String msg) {

        public static Optional<Blocked> of(ErrorCode code) {
            return Optional.of(new Blocked(code, null));
        }

        public static Optional<Blocked> of(ErrorCode code, String msg) {
            return Optional.of(new Blocked(code, msg));
        }

        public BusinessException toException() {
            return msg == null ? code.toException() : code.toException(msg);
        }
    }

    // ================================================================ API-settlement-02

    /**
     * @param settlement {@code null}이면 아직 정산 행이 없다 = 상태 {@code NONE}과 같다
     * @param rule       {@code null}이면 정산 규칙이 저장되지 않았다
     */
    public Optional<Blocked> aggregate(MemberPrincipal me, Performance performance,
                                       Settlement settlement, SettlementRule rule,
                                       List<PerformanceParticipant> participants) {
        Optional<Blocked> permission = ownerOrAdmin(me, performance);
        if (permission.isPresent()) {
            return permission;
        }
        if (performance.getStatus() != Performance.Status.ENDED) {
            return Blocked.of(ErrorCode.PERFORMANCE_INVALID_STATUS,
                    "공연이 종료된 뒤에 집계를 확정할 수 있습니다.");
        }
        if (settlement != null) {
            switch (settlement.getStatus()) {
                case NONE -> { }
                case HALTED -> {
                    return Blocked.of(ErrorCode.PERFORMANCE_INVALID_STATUS,
                            "중단된 정산은 집계를 확정할 수 없습니다.");
                }
                case RELEASED -> {
                    return Blocked.of(ErrorCode.SETTLEMENT_ALREADY_RELEASED);
                }
                default -> {
                    return Blocked.of(ErrorCode.COMMON_CONFLICT, "이미 집계가 확정된 공연입니다.");
                }
            }
        }
        Long performanceId = performance.getPerformanceId();
        if (chainJobRepository.existsByTargetPerformanceIdAndTxTypeAndStatusIn(
                performanceId, ChainJob.TxType.AGGREGATE, JOB_IN_FLIGHT)) {
            return Blocked.of(ErrorCode.COMMON_CONFLICT, "집계 확정 작업이 진행 중입니다.");
        }
        if (coinMovementInFlight(performanceId)) {
            return Blocked.of(ErrorCode.COIN_MINT_PENDING);
        }
        if (participants.isEmpty()) {
            return Blocked.of(ErrorCode.TEAM_MIN_COUNT_NOT_MET);
        }
        return ruleShape(rule, participants);
    }

    /**
     * 잠긴 규칙의 bp 형태 — <b>tx를 보내기 전에 확인한다.</b>
     *
     * <p>여기서 걸러지지 않으면 온체인 {@code aggregate}가 먼저 확정되고, 그 뒤 서버 확정 반영에서
     * {@link SettlementCalculator}가 {@code IllegalArgumentException}을 던진다. 그 순간
     * <b>체인은 AGGREGATED, 서버는 NONE</b>으로 고착되고 주기 반영이 영구히 같은 예외를 반복한다.
     * 되돌릴 방법은 컨트랙트에 없다({@code AGGREGATED} 이후 refund·재집계 경로가 없다).
     */
    private Optional<Blocked> ruleShape(SettlementRule rule,
                                        List<PerformanceParticipant> participants) {
        if (rule == null) {
            return Blocked.of(ErrorCode.COMMON_NOT_FOUND, "정산 규칙이 저장되지 않았습니다.");
        }
        if (!rule.isRatioSumValid()) {
            return Blocked.of(ErrorCode.RULE_RATIO_SUM_INVALID);
        }
        if (participants.size() > SettlementCalculator.MAX_TEAMS) {
            return Blocked.of(ErrorCode.COMMON_VALIDATION_FAILED,
                    "참여팀은 " + SettlementCalculator.MAX_TEAMS + "팀까지 정산할 수 있습니다.");
        }
        long shareSum = 0;
        for (PerformanceParticipant participant : participants) {
            Integer bp = participant.getTeamShareBp();
            if (bp == null || bp < 0) {
                return Blocked.of(ErrorCode.RULE_RATIO_SUM_INVALID);
            }
            shareSum += bp;
        }
        if (shareSum != SettlementCalculator.BP) {
            return Blocked.of(ErrorCode.RULE_RATIO_SUM_INVALID);
        }
        return Optional.empty();
    }

    // ================================================================ API-settlement-03

    public Optional<Blocked> lock(MemberPrincipal me, Performance performance,
                                  Settlement settlement) {
        Optional<Blocked> permission = ownerOrAdmin(me, performance);
        if (permission.isPresent()) {
            return permission;
        }
        // 취소된 공연의 정산은 실행될 일이 없다(release 게이트가 막는다) — 잠가서 48시간
        // 이의제기 기간을 여는 것은 관객 환불만 기다리게 한다. 아직 AGGREGATED 인 채로 취소가
        // 접수된 구간이 여기다. aggregate 는 status != ENDED 로 이미 걸러 따로 넣지 않는다.
        if (performance.getStatus() == Performance.Status.CANCELLED) {
            return Blocked.of(ErrorCode.PERFORMANCE_INVALID_STATUS,
                    "취소된 공연은 정산을 잠글 수 없습니다.");
        }
        if (settlement == null) {
            return Blocked.of(ErrorCode.SETTLEMENT_NOT_LOCKED, "아직 집계가 시작되지 않았습니다.");
        }
        switch (settlement.getStatus()) {
            case AGGREGATED -> { }
            case NONE -> {
                return Blocked.of(ErrorCode.SETTLEMENT_NOT_LOCKED);
            }
            case HALTED -> {
                return Blocked.of(ErrorCode.PERFORMANCE_INVALID_STATUS, "중단된 정산은 잠글 수 없습니다.");
            }
            case RELEASED -> {
                return Blocked.of(ErrorCode.SETTLEMENT_ALREADY_RELEASED);
            }
            default -> {
                return Blocked.of(ErrorCode.COMMON_CONFLICT, "이미 잠긴 정산입니다.");
            }
        }
        if (!Boolean.TRUE.equals(settlement.getCounterMatch())) {
            return Blocked.of(ErrorCode.SETTLEMENT_AGGREGATE_MISMATCH);
        }
        if (chainJobRepository.existsByTargetPerformanceIdAndTxTypeAndStatusIn(
                performance.getPerformanceId(), ChainJob.TxType.LOCK, JOB_IN_FLIGHT)) {
            return Blocked.of(ErrorCode.COMMON_CONFLICT, "정산 잠금 작업이 진행 중입니다.");
        }
        return Optional.empty();
    }

    // ================================================================ API-settlement-04

    /**
     * 이의제기 게이트.
     *
     * <p><b>진행 중인 {@code RELEASE} job 을 {@link #release}와 같은 검사로 본다.</b> 조기 동의
     * (API-settlement-08)가 들어오기 전에는 dispute 와 release 가 시간으로 배타적이었다 — 이의는
     * 마감 전, 실행은 마감 뒤. 전원 동의가 마감을 건너뛰면서 둘이 같은 시간대에 겹친다. 실행이
     * 공연 행 락을 먼저 잡은 순서에서는 {@link SettlementService#dispute}의 락이 상대를 기다렸다
     * 풀려나는데, 그때 정산은 아직 {@code LOCKED}/{@code DISPUTE_OPEN} 이고 마감도 남아 있어
     * 나머지 조건만으로는 그 이의를 받아 버린다 — <b>돈은 이미 나가는 중인데</b>. 그래서 "지급이
     * 시작됐는가"를 여기서 한 번 더 본다.
     *
     * @param performanceId 진행 중인 {@code RELEASE} job 을 찾는 축
     * @param teamId        {@code null}이면 "요청자가 리더인 참여팀이 없다"는 뜻으로 다룬다
     *                      ({@code actions.dispute} 계산에서 그런 조회자가 있다)
     */
    public Optional<Blocked> dispute(MemberPrincipal me, Long performanceId, Settlement settlement,
                                     PerformanceParticipant participant, Long teamId,
                                     LocalDateTime now) {
        if (me == null) {
            return Blocked.of(ErrorCode.COMMON_UNAUTHORIZED);
        }
        if (settlement == null) {
            return Blocked.of(ErrorCode.SETTLEMENT_NOT_LOCKED,
                    "정산이 잠긴 뒤에 이의를 제기할 수 있습니다.");
        }
        switch (settlement.getStatus()) {
            case LOCKED, DISPUTE_OPEN -> { }
            case NONE, AGGREGATED -> {
                return Blocked.of(ErrorCode.SETTLEMENT_NOT_LOCKED,
                        "정산이 잠긴 뒤에 이의를 제기할 수 있습니다.");
            }
            case RELEASED -> {
                return Blocked.of(ErrorCode.SETTLEMENT_ALREADY_RELEASED);
            }
            default -> {
                return Blocked.of(ErrorCode.PERFORMANCE_INVALID_STATUS,
                        "중단된 정산에는 이의를 제기할 수 없습니다.");
            }
        }
        if (participant == null) {
            return Blocked.of(ErrorCode.SETTLEMENT_NOT_PARTICIPANT);
        }
        if (!me.admin() && !participant.getTeam().isLedBy(me.memberId())) {
            return Blocked.of(ErrorCode.COMMON_FORBIDDEN, "팀 리더만 이의를 제기할 수 있습니다.");
        }
        if (chainJobRepository.existsByTargetPerformanceIdAndTxTypeAndStatusIn(
                performanceId, ChainJob.TxType.RELEASE, JOB_IN_FLIGHT)) {
            return Blocked.of(ErrorCode.COMMON_CONFLICT, "정산 실행이 시작되어 이의를 접수할 수 없습니다.");
        }
        // 마감이 비어 있으면 여기는 통과한다(D-26) — 마감이 정해지기 전에 접수를 막을 이유가 없고,
        // 이의는 되돌릴 수 있는 기록이라 열어두는 쪽이 안전한 방향이다. release 는 반대로 막힌다.
        if (!settlement.isInDisputePeriod(now)) {
            return Blocked.of(ErrorCode.COMMON_CONFLICT, "이의제기 기간이 종료되었습니다.");
        }
        if (teamId != null && disputeRepository
                .existsBySettlement_SettlementIdAndTeam_TeamIdAndStatus(
                        settlement.getSettlementId(), teamId, Dispute.Status.OPEN)) {
            return Blocked.of(ErrorCode.COMMON_CONFLICT, "이미 접수된 이의가 처리 중입니다.");
        }
        return Optional.empty();
    }

    // ================================================================ API-settlement-05

    /**
     * release 게이트 — <b>이 규칙의 유일한 정의</b>다.
     *
     * <p>수동 API·자동 스케줄·{@code actions.release}가 전부 이 메서드를 본다. 예전에
     * {@code Settlement.isReleasable()}에 비슷한 규칙이 한 번 더 적혀 있었는데(호출자 0건) 삭제했다 —
     * 같은 규칙의 두 번째 정의는 언젠가 갈라진다.
     *
     * @param requirePermission 자동 스케줄에는 요청자가 없다
     */
    public Optional<Blocked> release(MemberPrincipal me, Performance performance,
                                     Settlement settlement, List<SettlementShare> shares,
                                     boolean requirePermission, LocalDateTime now) {
        if (requirePermission) {
            Optional<Blocked> permission = ownerOrAdmin(me, performance);
            if (permission.isPresent()) {
                return permission;
            }
        }
        // 취소된 공연의 에스크로는 전 건 환불로 관객에게 돌아갈 돈이다 — 팀 지갑으로 내보낼 수 없다.
        // 취소 접수(CANCELLED)와 halt 확정(HALTED) 사이에서 정산은 아직 LOCKED/DISPUTE_OPEN 이라,
        // 여기서 막지 않으면 스케줄러가 그 구간에 release 를 접수한다. 온체인 stage 가 revert 시켜
        // 돈은 지켜지지만 FAILED job 이 남고 actions.release 는 활성으로 보인다.
        if (performance.getStatus() == Performance.Status.CANCELLED) {
            return Blocked.of(ErrorCode.PERFORMANCE_INVALID_STATUS,
                    "취소된 공연은 정산을 실행할 수 없습니다.");
        }
        if (settlement == null) {
            return Blocked.of(ErrorCode.SETTLEMENT_NOT_LOCKED, "아직 집계가 시작되지 않았습니다.");
        }
        switch (settlement.getStatus()) {
            case LOCKED, DISPUTE_OPEN -> { }
            case NONE, AGGREGATED -> {
                return Blocked.of(ErrorCode.SETTLEMENT_NOT_LOCKED);
            }
            case RELEASED -> {
                return Blocked.of(ErrorCode.SETTLEMENT_ALREADY_RELEASED);
            }
            default -> {
                return Blocked.of(ErrorCode.PERFORMANCE_INVALID_STATUS,
                        "중단된 정산은 실행할 수 없습니다.");
            }
        }
        if (!Boolean.TRUE.equals(settlement.getCounterMatch())) {
            return Blocked.of(ErrorCode.SETTLEMENT_AGGREGATE_MISMATCH);
        }
        // 전원 동의(API-settlement-08)면 48시간을 기다릴 이유가 없다 — 기간의 목적이 "이의를 낼
        // 팀에게 시간을 준다" 인데 낼 사람이 전부 동의했다. disputeDeadlineAt 이 비어 있어도
        // (D-26) 여기서 통과한다: isInDisputePeriod 는 fail-closed 로 true 를 주지만 전원 동의가
        // 그것을 뒤집는다. 마감을 모르는 상태와 "전원이 됐다고 말한 상태"는 다른 근거다.
        if (settlement.isInDisputePeriod(now) && !allApproved(shares)) {
            // 마감이 비어 있는데 잠긴 상태라면 48h 이 언제 끝나는지 아무도 모른다 — 시각을 넣을 수 없고,
            // 넣으면 "-" 가 박힌 문구가 나간다. 실행을 막는 이유가 다르므로 문구도 가른다(D-26).
            // 코드는 그대로 SETTLEMENT_DISPUTE_PERIOD 다 — 프론트가 code 로 분기하므로 바꾸면 화면이 갈라진다.
            if (settlement.getDisputeDeadlineAt() == null) {
                return Blocked.of(ErrorCode.SETTLEMENT_DISPUTE_PERIOD,
                        "이의제기 마감이 설정되지 않아 정산을 실행할 수 없습니다.");
            }
            // 규격 §2 — 시각이 들어가야 하므로 기본 문구를 덮는다.
            return Blocked.of(ErrorCode.SETTLEMENT_DISPUTE_PERIOD,
                    "이의제기 기간이 끝난 뒤(" + SettlementTime.format(settlement.getDisputeDeadlineAt())
                            + ") 정산할 수 있습니다.");
        }
        boolean hasOpenDispute = disputeRepository
                .findBySettlement_SettlementId(settlement.getSettlementId()).stream()
                .anyMatch(Dispute::isOpen);
        if (hasOpenDispute) {
            return Blocked.of(ErrorCode.SETTLEMENT_DISPUTE_PERIOD,
                    "처리되지 않은 이의제기가 있어 정산을 실행할 수 없습니다.");
        }
        if (releaseHaltGuard.isReleaseHalted()) {
            return Blocked.of(ErrorCode.COIN_RESERVE_MISMATCH);
        }
        if (shares.isEmpty()) {
            return Blocked.of(ErrorCode.SETTLEMENT_NOT_LOCKED,
                    "분배 내역이 없어 정산을 실행할 수 없습니다.");
        }
        for (SettlementShare share : shares) {
            if (share.getWalletAddress() == null || share.getWalletAddress().isBlank()) {
                // 지갑이 비면 컨트랙트가 zero 주소로 transfer 를 시도한다. 서버에서 먼저 막는다.
                return Blocked.of(ErrorCode.COMMON_CONFLICT,
                        "수령 지갑이 등록되지 않은 팀이 있어 정산을 실행할 수 없습니다.");
            }
        }
        if (chainJobRepository.existsByTargetPerformanceIdAndTxTypeAndStatusIn(
                performance.getPerformanceId(), ChainJob.TxType.RELEASE, JOB_IN_FLIGHT)) {
            return Blocked.of(ErrorCode.COMMON_CONFLICT, "정산 실행 작업이 진행 중입니다.");
        }
        return Optional.empty();
    }

    /**
     * 참여팀 <b>전원</b>이 조기 동의했는가 — 주최팀도 한 팀으로 센다.
     *
     * <p>{@code shares} 가 비어 있으면 {@code false} 다. 분배 내역이 없는 정산은 "전원이 동의했다"
     * 가 성립하지 않는다 — 여기서 {@code allMatch} 의 공집합 {@code true} 를 그대로 흘리면
     * 집계 직후 빈 상태가 이의제기 기간을 통째로 건너뛴다.
     */
    private static boolean allApproved(List<SettlementShare> shares) {
        return !shares.isEmpty() && shares.stream().allMatch(SettlementShare::isApproved);
    }

    // ================================================================ API-settlement-08

    /**
     * 정산 조기 동의 게이트 — 참여팀 리더가 "이 분배안에 동의한다"를 누를 수 있는가.
     *
     * <p>전원이 동의하면 {@link #release}가 48시간을 건너뛴다. 동의는 되돌릴 수 없다
     * ({@link SettlementShare#approve} javadoc).
     *
     * <h2>{@link #dispute}와 다른 두 가지</h2>
     *
     * <p><b>① ADMIN 우회가 없다.</b> {@code dispute}는 {@code me.admin()}이면 팀 리더가 아니어도
     * 통과시키는데(운영자가 대리 접수해 정산을 <b>막는</b> 쪽이라 안전하다), 동의는 반대 방향이다 —
     * 관리자가 남의 팀 대신 눌러 주면 그 팀이 보지도 않은 분배안으로 이의제기 기간이 사라진다.
     * 조기 동의는 팀 자신만 할 수 있다.
     *
     * <p><b>② 이의제기 마감이 지나도 막지 않는다.</b> 마감 뒤의 동의는 release 가 이미 열려 있어
     * 무의미하지만 해로울 것도 없고, 거절하면 "마감 직전에 눌렀는데 409" 같은 경계 실패가 생긴다.
     * 열어 두는 쪽이 싸다.
     *
     * @param share 요청자 팀의 분배 행. {@code null}이면 동의할 대상이 없다
     */
    public Optional<Blocked> approve(MemberPrincipal me, Settlement settlement,
                                     PerformanceParticipant participant, SettlementShare share) {
        if (me == null) {
            return Blocked.of(ErrorCode.COMMON_UNAUTHORIZED);
        }
        if (settlement == null) {
            return Blocked.of(ErrorCode.SETTLEMENT_NOT_LOCKED,
                    "정산이 잠긴 뒤에 동의할 수 있습니다.");
        }
        switch (settlement.getStatus()) {
            case LOCKED, DISPUTE_OPEN -> { }
            case NONE, AGGREGATED -> {
                return Blocked.of(ErrorCode.SETTLEMENT_NOT_LOCKED,
                        "정산이 잠긴 뒤에 동의할 수 있습니다.");
            }
            case RELEASED -> {
                return Blocked.of(ErrorCode.SETTLEMENT_ALREADY_RELEASED);
            }
            default -> {
                return Blocked.of(ErrorCode.PERFORMANCE_INVALID_STATUS,
                        "중단된 정산에는 동의할 수 없습니다.");
            }
        }
        if (participant == null) {
            return Blocked.of(ErrorCode.SETTLEMENT_NOT_PARTICIPANT);
        }
        if (!participant.getTeam().isLedBy(me.memberId())) {
            return Blocked.of(ErrorCode.COMMON_FORBIDDEN, "팀 리더만 정산에 동의할 수 있습니다.");
        }
        if (share == null) {
            // 집계 확정 뒤에 참여팀이 추가되면 상태는 LOCKED 인데 그 팀의 분배 행이 없다.
            // 동의할 대상 자체가 없으므로 release 게이트의 같은 상황과 같은 코드를 쓴다.
            return Blocked.of(ErrorCode.SETTLEMENT_NOT_LOCKED,
                    "분배 내역이 없어 동의할 수 없습니다.");
        }
        if (share.isApproved()) {
            return Blocked.of(ErrorCode.COMMON_CONFLICT, "이미 동의한 팀입니다.");
        }
        // 이의와 동의를 동시에 들고 있는 상태를 만들지 않는다 — release 게이트가 열린 이의를
        // 따로 보므로 그런 팀의 동의는 어차피 아무것도 열지 못하고 화면만 어긋난다.
        if (disputeRepository.existsBySettlement_SettlementIdAndTeam_TeamIdAndStatus(
                settlement.getSettlementId(), participant.getTeam().getTeamId(),
                Dispute.Status.OPEN)) {
            return Blocked.of(ErrorCode.COMMON_CONFLICT, "이의를 취소한 뒤 동의할 수 있습니다.");
        }
        return Optional.empty();
    }

    // ================================================================ 공통

    public Optional<Blocked> ownerOrAdmin(MemberPrincipal me, Performance performance) {
        if (me == null) {
            return Blocked.of(ErrorCode.COMMON_UNAUTHORIZED);
        }
        if (me.admin()) {
            return Optional.empty();
        }
        if (!performance.getCreatorTeam().isLedBy(me.memberId())) {
            return Blocked.of(ErrorCode.PERFORMANCE_NOT_OWNER);
        }
        return Optional.empty();
    }

    /**
     * 코인이 움직이는 중인 작업이 남아 있는가.
     *
     * <p>서명 대기 중인 결제·처리 중인 환불은 <b>온체인 카운터와 에스크로를 아직 바꾸는 중</b>이라,
     * 그 상태로 카운터를 얼리면 관객이 산 표나 돌려받을 돈이 정산에서 사라진다.
     *
     * <p>결제는 두 묶음으로 센다. <b>{@code PAYING}은 주문이 죽어도 센다</b> — 대납 tx 가 이미
     * 나가 뒤늦게 채굴될 수 있다. <b>미서명({@code REQUESTED}·{@code AWAITING_SIGNATURE})은
     * 살아 있는 주문({@code PENDING_PAYMENT})의 것만</b> 센다 — 만료·취소된 주문의 미서명 결제는
     * 카운터를 바꿀 수 없는데도 집계를 영구히 막았다(D-83). 판정은 조회 시점이므로 이미 갈린
     * 행도 이 조건만으로 풀린다. 환불은 주문 만료와 무관해 그대로 둔다.
     */
    private boolean coinMovementInFlight(Long performanceId) {
        return paymentRepository.countInFlight(performanceId, PAYMENT_SENT, PAYMENT_UNSIGNED,
                        TicketOrder.Status.PENDING_PAYMENT) > 0
                || refundRepository.countInFlight(performanceId, REFUND_IN_FLIGHT) > 0
                || chainJobRepository.existsByTargetPerformanceIdAndTxTypeInAndStatusIn(
                        performanceId, COIN_MOVING_TX, JOB_IN_FLIGHT);
    }
}
