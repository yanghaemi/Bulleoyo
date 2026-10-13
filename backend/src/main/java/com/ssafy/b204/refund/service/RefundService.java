package com.ssafy.b204.refund.service;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.response.Money;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.coin.service.DisplayRateService;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.payment.entity.Payment;
import com.ssafy.b204.payment.repository.PaymentRepository;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.service.PerformanceService;
import com.ssafy.b204.refund.dto.RefundDtos.CancelTicketRequest;
import com.ssafy.b204.refund.dto.RefundDtos.CancelTicketResponse;
import com.ssafy.b204.refund.dto.RefundDtos.RefundQuoteResponse;
import com.ssafy.b204.refund.entity.Refund;
import com.ssafy.b204.refund.repository.RefundRepository;
import com.ssafy.b204.settlement.entity.Settlement;
import com.ssafy.b204.settlement.repository.SettlementRepository;
import com.ssafy.b204.settlement.service.SettlementJobEnqueuer;
import com.ssafy.b204.ticket.entity.Ticket;
import com.ssafy.b204.ticket.entity.TicketOrder;
import com.ssafy.b204.ticket.repository.TicketOrderRepository;
import com.ssafy.b204.ticket.repository.TicketRepository;
import com.ssafy.b204.wallet.entity.Wallet;
import com.ssafy.b204.wallet.service.WalletBalanceService;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * refund 도메인 서비스 — API v6 §9(API-refund-01·02) + API-performance-12의 환불 실행부.
 *
 * <h2>환불 실행 경로는 하나다</h2>
 *
 * <p>개별 취소(-02)와 공연 취소(-12)가 <b>같은 자리를 지나간다</b> — {@code refund} 행을 만들고
 * {@link SettlementJobEnqueuer}로 {@code REFUND} job을 넣고 {@link Refund#markProcessing}으로
 * 둘을 잇는다. 워커({@code ContractOperatorTxBuilder.refundCall})가 {@code chain_job_id}로
 * {@code refund} 행을 되찾아 인자를 읽으므로 <b>이 연결이 없으면 tx를 만들 수 없다.</b>
 * 두 벌로 만들면 한쪽만 고쳐진 채 "화면에서는 가능인데 실행은 막히는" 상태가 된다.
 *
 * <p>다른 것은 금액뿐이다 — 개별 취소는 수수료 구간(P-8)을 적용하고, 공연 취소는 무수수료로
 * <b>주문에 남은 전액</b>({@code order.totalAmount − 이미 잡힌 환불})을 되돌린다.
 *
 * <h2>온체인 refund의 단위는 주문이다</h2>
 *
 * <p>컨트랙트는 {@code refund(showId, orderRef, refundAmount)} 3인자이고 수신자를
 * {@code p.buyer}로 고정한다(서버가 주소를 넘기지 않는다). 누적 환불이 주문 결제액을 넘으면
 * {@code RefundExceedsPurchase}로 revert하고, <b>첫 환불에서 그 주문의 표를 전량 차감</b>한다
 * (문서 13 §4.1). 그래서 서버 대사도 주문 단위로 표를 빼며, 그 판정은
 * {@code SettlementTicketRepository.countValidTicketsByTeam}의 {@code not exists (... r.ticketOrder = o ...)}
 * 하나뿐이다 — 여기서 다시 세지 않는다.
 *
 * <h2>정산이 잠기면 앱에서 되돌릴 수 없다</h2>
 *
 * <p>{@code AGGREGATED} 이후에는 <b>컨트랙트가 refund를 막는다</b>(stage ∈ {LOCKED_RULES, HALTED}).
 * 그래서 판정 문턱을 명세의 "LOCKED 이상"이 아니라 {@code AGGREGATED} 이상으로 둔다 —
 * 그러지 않으면 미리보기는 금액을 보여주고 실행만 revert한다. 코드는 명세대로
 * {@code REFUND_AFTER_SETTLEMENT_LOCK}이다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RefundService {

    /** §0.3 폴링 간격 힌트 — openapi refund_02 예시값. */
    private static final int POLL_AFTER_MS = 1_500;

    /** 환불 수신 수단은 하나뿐이다(원화 출구가 없다). */
    private static final String REFUND_TARGET = "WALLET_BALANCE";

    private static final String REFUND_NOTICE =
            "Refunded to your balance in Korean won. You can use it for another show.";

    /** D-7 이전 전액 / D-3 이전 50%(P-8). {@code feeStage}는 그 구간의 식별자다. */
    private static final int FULL_REFUND_RATE_PERCENT = 0;
    private static final int HALF_REFUND_RATE_PERCENT = 50;

    /**
     * 같은 표의 재요청을 막는 환불 상태 — <b>{@code FAILED} 는 없다.</b>
     *
     * <p>전송 전에 실패한 환불은 돈을 움직이지 않았고 온체인 흔적도 없다. 그 표를 영구히 잠그면
     * 사용자가 환불을 다시 시도할 방법이 사라진다(2026-09-17 리허설, S15P21B204-147).
     */
    private static final List<Refund.Status> BLOCKS_NEW_REQUEST = List.of(
            Refund.Status.PENDING, Refund.Status.PROCESSING, Refund.Status.COMPLETED);

    /** 환불이 불가능해지는 정산 상태 — {@code AGGREGATED} 이후는 온체인도 막는다. */
    private static final List<Settlement.Status> SETTLEMENT_LOCKED = List.of(
            Settlement.Status.AGGREGATED, Settlement.Status.LOCKED,
            Settlement.Status.DISPUTE_OPEN, Settlement.Status.RELEASED);

    private final RefundRepository refundRepository;
    private final ChainJobRepository chainJobRepository;
    private final TicketRepository ticketRepository;
    private final TicketOrderRepository ticketOrderRepository;
    private final PaymentRepository paymentRepository;
    private final MemberRepository memberRepository;
    private final SettlementRepository settlementRepository;
    private final SettlementJobEnqueuer jobEnqueuer;
    private final WalletBalanceService walletBalanceService;
    private final DisplayRateService displayRateService;

    // ================================================================ API-refund-01

    /** API-refund-01 환불액 미리보기. 조회만 — 상태를 바꾸지 않는다. */
    public RefundQuoteResponse refundQuote(MemberPrincipal me, Long ticketId) {
        Member member = requireMember(me);
        Quote quote = quote(member, ticketId);
        Long balanceAfter = walletBalanceService.find(quote.receiver())
                .map(balance -> balance.amount() + quote.refundAmount())
                .orElse(null);
        return new RefundQuoteResponse(
                ticketId,
                quote.paidAmount(),
                quote.feeRatePercent(),
                quote.feeAmount(),
                quote.refundAmount(),
                Money.BASE_CURRENCY,
                display(quote.refundAmount(), member),
                quote.feeStage(),
                offset(quote.fullRefundUntil(), member),
                offset(quote.cancelDeadlineAt(), member),
                REFUND_TARGET,
                quote.receiver().getAddress(),
                balanceAfter,
                REFUND_NOTICE);
    }

    // ================================================================ API-refund-02

    /**
     * API-refund-02 개별 취소·환불. 202 + 폴링, OPERATOR 서명.
     *
     * <p>{@code Idempotency-Key}가 필수다(§0.8) — 새로고침으로 두 번 환불되면 에스크로가
     * 마이너스가 된다. 같은 키 재호출은 최초 {@code jobId}를 재생한다.
     */
    @Transactional
    public CancelTicketResponse cancelTicket(MemberPrincipal me, Long ticketId,
                                              String idempotencyKey,
                                              CancelTicketRequest request) {
        Member member = requireMember(me);
        String key = requireIdempotencyKey(idempotencyKey);

        Optional<Refund> replay = refundRepository.findByIdempotencyKey(key);
        if (replay.isPresent()) {
            Refund refund = replay.get();
            if (!Objects.equals(refund.getTicket().getTicketId(), ticketId)) {
                throw ErrorCode.COMMON_CONFLICT.toException(
                        "같은 요청 키가 다른 티켓의 취소에 이미 사용되었습니다.");
            }
            return response(refund, member);
        }

        Quote quote = quote(member, ticketId);
        // openapi 는 불일치를 400 COMMON_VALIDATION_FAILED 로 명시한다(스켈레톤 javadoc 의
        // PAYMENT_AMOUNT_MISMATCH 는 낡은 기술이었다). 그 사이 수수료 구간이 바뀐 경우가 여기다.
        if (request == null || request.expectedRefundAmount() == null
                || request.expectedRefundAmount() != quote.refundAmount()) {
            throw ErrorCode.COMMON_VALIDATION_FAILED.toException(
                    "환불 예정액이 바뀌었습니다. 금액을 다시 확인해 주세요.");
        }
        // refund.ticket_id 에 UNIQUE 제약이 없다(ERD v5) — 중복은 코드로 막는다. FAILED 만 남은
        // 표는 통과시킨다(BLOCKS_NEW_REQUEST) — 새 refund 행과 새 job 이 만들어진다.
        if (refundRepository.existsByTicket_TicketIdAndStatusIn(ticketId, BLOCKS_NEW_REQUEST)) {
            throw ErrorCode.REFUND_ALREADY_REQUESTED.toException();
        }

        Refund refund = enqueue(quote.ticket(), quote.order(), quote.payment(), quote.receiver(),
                Refund.Reason.CUSTOMER_CANCEL, quote.paidAmount(), quote.feeAmount(),
                quote.refundAmount(), quote.feeTier(), key, member.getMemberId());
        log.info("취소·환불 접수 — ticketId={} refundId={} refundAmount={} feeTier={}",
                ticketId, refund.getRefundId(), refund.getRefundAmount(), refund.getFeeTier());
        return response(refund, member);
    }

    // ================================================================ API-performance-12 환불부

    /**
     * 공연 취소 시 되돌릴 대상 — <b>조회만 한다.</b> 에스크로 확인이 이 총액을 입력으로 쓰므로
     * 계획과 실행을 나눈다.
     *
     * @param totalRefundAmount 주문별 남은 금액의 합. 이 값이 곧 에스크로에서 빠져나갈 총액이다
     * @param targetTicketCount 취소될 티켓 수(이미 취소된 티켓은 세지 않는다)
     */
    public record BulkRefundPlan(long totalRefundAmount, int targetTicketCount,
                                 List<Target> targets) {

        /** @param remaining {@code order.totalAmount − 이미 잡힌 환불}. 온체인 한도와 같은 값이다 */
        public record Target(TicketOrder order, Ticket representative, long remaining,
                             int liveTicketCount) {}
    }

    /**
     * 이 공연에서 <b>아직 에스크로에 남아 있는 관객 몫</b>. 0 이면 관객에게 돌려줄 것이 없다는
     * 뜻이라 {@code returnDeposit}이 통과한다.
     *
     * <p>티켓 수로 대신 셀 수 없다 — {@code cancelTickets}는 {@code ISSUED}만 {@code CANCELLED}로
     * 바꾸므로 입장 스캔이 있었던 {@code USED} 표는 환불이 끝난 뒤에도 남고, 반대로 개별 취소로
     * 표가 {@code CANCELLED}가 돼도 50% 수수료가 에스크로에 남는다(MR !141 자동 리뷰).
     */
    public long outstandingRefundAmount(Long performanceId) {
        // 주문마다 합계 쿼리가 한 번씩 나간다. 공연 하나의 주문 수만큼이라 리허설·MVP 규모에서는
        // 무시할 수 있다 — 취소 규모가 커지면 주문별 합계를 한 번에 가져오는 쿼리로 좁힌다.
        long outstanding = 0;
        for (TicketOrder order : refundableOrders(performanceId)) {
            outstanding += Math.max(0, remainingOf(order));
        }
        return outstanding;
    }

    private List<TicketOrder> refundableOrders(Long performanceId) {
        return ticketOrderRepository.findByPerformance_PerformanceIdAndStatusIn(
                performanceId, List.of(TicketOrder.Status.PAID, TicketOrder.Status.REFUNDED));
    }

    /** {@code order.totalAmount − 이미 잡힌 환불}. {@code FAILED} 환불은 돈이 나가지 않았다. */
    private long remainingOf(TicketOrder order) {
        return order.getTotalAmount()
                - refundRepository.sumRefundedByOrder(order.getTicketOrderId(),
                        Refund.Status.FAILED);
    }

    /**
     * 환불 대상 주문을 고른다 — 결제가 성립했고({@code PAID}·{@code REFUNDED}) <b>남은 금액이
     * 있는</b> 주문 전부.
     *
     * <p>이미 전량 취소된 주문({@code REFUNDED})도 포함한다. 50% 환불로 <b>에스크로에 남은
     * 수수료</b>가 있으면 그것까지 빼야 {@code escrow == 0}이 되고, 그래야 보증금 반환
     * ({@code returnDeposit})이 revert하지 않는다(2026-09-07 M-04).
     *
     * <p>금액 계산은 {@link #remainingOf}가 정본이다 — 보증금 반환 훅도 같은 식을 쓴다
     * ({@link #outstandingRefundAmount}). 두 자리가 다른 식을 쓰면 "환불이 끝났다"는 판정이
     * 갈려 {@code returnDeposit}이 {@code InsufficientEscrow}로 revert한다.
     */
    public BulkRefundPlan planPerformanceCancel(Long performanceId) {
        List<TicketOrder> orders = refundableOrders(performanceId);
        List<BulkRefundPlan.Target> targets = new ArrayList<>();
        long total = 0;
        int ticketCount = 0;
        for (TicketOrder order : orders) {
            long remaining = remainingOf(order);
            if (remaining <= 0) {
                continue;
            }
            List<Ticket> tickets = ticketRepository
                    .findByTicketOrder_TicketOrderId(order.getTicketOrderId());
            List<Ticket> live = tickets.stream()
                    .filter(ticket -> ticket.getStatus() != Ticket.Status.CANCELLED)
                    .toList();
            // refund.ticket_id 가 NOT NULL 이라 대표 티켓이 반드시 필요하다. 살아 있는 표가 없으면
            // (수수료만 남은 주문) 이미 취소된 티켓을 대표로 쓴다 — 상태 전이는 일어나지 않는다.
            Ticket representative = live.isEmpty()
                    ? tickets.stream().findFirst().orElse(null) : live.get(0);
            if (representative == null) {
                log.warn("티켓이 없는 결제 완료 주문이라 환불 행을 만들 수 없다 — orderId={}",
                        order.getTicketOrderId());
                continue;
            }
            targets.add(new BulkRefundPlan.Target(order, representative, remaining, live.size()));
            total += remaining;
            ticketCount += live.size();
        }
        return new BulkRefundPlan(total, ticketCount, List.copyOf(targets));
    }

    /**
     * 계획대로 {@code refund} 행과 {@code REFUND} job을 만든다 — 개별 취소와 <b>같은 경로</b>다.
     *
     * <p>멱등키는 {@code {요청 키}:refund:{orderId}}로 파생시킨다. 접수 응답의 {@code jobId}는
     * {@code halt} job의 것이고(openapi는 전체를 하나로 폴링한다) 여기서 만드는 job들은 그
     * 뒤에 붙는다 — 워커가 {@code chain_job_id} 오름차순으로 집으므로 <b>halt → refund 순서</b>가
     * 유지된다. {@code refund}는 stage {@code HALTED}에서 허용되므로 이 순서가 요구사항이다.
     */
    @Transactional
    public void enqueuePerformanceCancel(BulkRefundPlan plan, String idempotencyKey,
                                          Long requesterMemberId) {
        for (BulkRefundPlan.Target target : plan.targets()) {
            TicketOrder order = target.order();
            String key = idempotencyKey + ":refund:" + order.getTicketOrderId();
            if (refundRepository.findByIdempotencyKey(key).isPresent()) {
                continue;
            }
            Payment payment = paymentRepository
                    .findByTicketOrder_TicketOrderId(order.getTicketOrderId())
                    .orElse(null);
            if (payment == null) {
                // 결제 행이 없으면 refund.payment_id(NOT NULL)를 채울 수 없다. 건별 부분 성공을
                // 허용하는 API 이므로(openapi) 그 주문만 건너뛰고 나머지를 접수한다.
                log.error("결제 행이 없어 공연 취소 환불을 만들 수 없다 — orderId={}",
                        order.getTicketOrderId());
                continue;
            }
            Refund refund = enqueue(target.representative(), order, payment,
                    payment.getPayerWallet(), Refund.Reason.PERFORMANCE_CANCEL,
                    order.getTotalAmount(), 0L, target.remaining(), null, key, requesterMemberId);
            log.info("공연 취소 환불 접수 — orderId={} refundId={} refundAmount={}",
                    order.getTicketOrderId(), refund.getRefundId(), refund.getRefundAmount());
        }
    }

    // ================================================================ 공통

    /**
     * {@code refund} 행 + {@code REFUND} job + 둘의 연결.
     *
     * <p><b>{@code markProcessing}이 워커의 입력이다.</b> {@code ContractOperatorTxBuilder}는
     * {@code refundRepository.findByChainJobId}로 인자(orderRef·refundAmount)를 읽으므로,
     * 이 연결이 없으면 job은 build 단계에서 실패하고 3회 재시도 뒤 {@code FAILED}가 된다.
     */
    private Refund enqueue(Ticket ticket, TicketOrder order, Payment payment, Wallet receiver,
                           Refund.Reason reason, long originalAmount, long fee, long refundAmount,
                           Refund.FeeTier feeTier, String idempotencyKey, Long requesterMemberId) {
        Refund refund = refundRepository.save(Refund.builder()
                .ticket(ticket)
                .ticketOrder(order)
                .payment(payment)
                .receiverWallet(receiver)
                .reason(reason)
                .originalAmount(originalAmount)
                .fee(fee)
                .refundAmount(refundAmount)
                .feeTier(feeTier)
                .idempotencyKey(idempotencyKey)
                .build());
        // 수신 지갑을 job 에 남긴다 — 그러지 않으면 API-wallet-02 거래 목록(wallet_id 로 조회)에
        // 환불이 나타나지 않고 확정 시 잔액 갱신 대상도 잃는다.
        SettlementJobEnqueuer.Enqueued enqueued = jobEnqueuer.enqueue(ChainJob.TxType.REFUND,
                order.getPerformance().getPerformanceId(), refundAmount, idempotencyKey,
                requesterMemberId, receiver.getWalletId());
        refund.markProcessing(enqueued.job().getChainJobId());
        return refund;
    }

    /** 미리보기와 실행이 <b>같은 계산·같은 판정</b>을 쓰게 하는 자리. */
    private record Quote(Ticket ticket, TicketOrder order, Payment payment, Wallet receiver,
                         long paidAmount, int feeRatePercent, long feeAmount, long refundAmount,
                         Refund.FeeTier feeTier, String feeStage,
                         LocalDateTime fullRefundUntil, LocalDateTime cancelDeadlineAt) {}

    private Quote quote(Member member, Long ticketId) {
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(ErrorCode.COMMON_NOT_FOUND::toException);
        // 존재를 알려 주지 않는 쪽이 아니라 명세대로 403 이다(§9 -01·-02 4xx 표).
        if (!ticket.isOwnedBy(member.getMemberId())) {
            throw ErrorCode.TICKET_NOT_OWNED.toException();
        }
        switch (ticket.getStatus()) {
            case ISSUED -> { }
            case USED -> throw ErrorCode.TICKET_ALREADY_USED.toException();
            default -> throw ErrorCode.TICKET_CANCELED.toException();
        }

        Performance performance = ticket.getPerformance();
        LocalDateTime cancelDeadlineAt = performance.getCancelDeadlineAt() != null
                ? performance.getCancelDeadlineAt()
                : PerformanceService.cancelDeadlineOf(performance.getPerformanceAt());
        LocalDateTime fullRefundUntil =
                PerformanceService.fullRefundUntilOf(performance.getPerformanceAt());
        LocalDateTime now = TimeSupport.nowStored();
        if (!now.isBefore(cancelDeadlineAt)) {
            throw ErrorCode.REFUND_DEADLINE_PASSED.toException();
        }
        requireSettlementUnlocked(performance.getPerformanceId());

        boolean fullRefund = now.isBefore(fullRefundUntil);
        int feeRatePercent = fullRefund ? FULL_REFUND_RATE_PERCENT : HALF_REFUND_RATE_PERCENT;
        // 기준은 ticket.purchase_price 스냅샷이다 — 현재 옵션 가격을 쓰면 가격을 올린 뒤 취소한
        // 사용자에게 더 많이 돌려준다.
        long paidAmount = ticket.getPurchasePrice();
        long feeAmount = paidAmount * feeRatePercent / 100;

        TicketOrder order = ticket.getTicketOrder();
        Payment payment = paymentRepository
                .findByTicketOrder_TicketOrderId(order.getTicketOrderId())
                .orElseThrow(ErrorCode.COMMON_NOT_FOUND::toException);
        // 수신자는 컨트랙트가 p.buyer 로 고정한다 — 결제한 지갑이지 "지금 등록된 지갑"이 아니다.
        Wallet receiver = payment.getPayerWallet();
        if (receiver == null || receiver.getAddress() == null) {
            throw ErrorCode.WALLET_NOT_FOUND.toException();
        }
        return new Quote(ticket, order, payment, receiver, paidAmount, feeRatePercent, feeAmount,
                paidAmount - feeAmount,
                fullRefund ? Refund.FeeTier.BEFORE_D7 : Refund.FeeTier.BEFORE_D3,
                fullRefund ? "D-7_BEFORE" : "D-3_BEFORE",
                fullRefundUntil, cancelDeadlineAt);
    }

    /**
     * 정산이 굳은 뒤에는 온체인 회수가 불가하다 — 오프체인 정책으로 넘긴다.
     *
     * <p>문턱이 {@code AGGREGATED}인 것이 명세("LOCKED 이상")보다 이르다. 컨트랙트가
     * {@code aggregate} 이후 refund를 막기 때문이다(문서 13 §3.2) — 여기서 통과시키면 미리보기가
     * 금액을 보여주고 실행만 revert한다.
     */
    private void requireSettlementUnlocked(Long performanceId) {
        settlementRepository.findByPerformance_PerformanceId(performanceId)
                .filter(settlement -> SETTLEMENT_LOCKED.contains(settlement.getStatus()))
                .ifPresent(settlement -> {
                    throw ErrorCode.REFUND_AFTER_SETTLEMENT_LOCK.toException();
                });
    }

    private CancelTicketResponse response(Refund refund, Member member) {
        return new CancelTicketResponse(
                SettlementJobEnqueuer.jobId(refund.getChainJobId()),
                ChainJob.Status.PENDING.name(),
                ChainJob.SignerType.OPERATOR.name(),
                POLL_AFTER_MS,
                refund.getTicket().getTicketId(),
                refund.getRefundId(),
                refund.getRefundAmount(),
                refund.getFee(),
                Money.BASE_CURRENCY,
                display(refund.getRefundAmount(), member),
                REFUND_TARGET,
                refund.getReceiverWallet().getAddress());
    }

    /** 갈라 던지는 이유는 {@code PerformanceService#requireMember} 주석과 같다. */
    private Member requireMember(MemberPrincipal me) {
        if (me == null) {
            throw ErrorCode.COMMON_UNAUTHORIZED.toException();
        }
        return memberRepository.findById(me.memberId())
                .orElseThrow(ErrorCode.AUTH_TOKEN_INVALID::toException);
    }

    private static String requireIdempotencyKey(String idempotencyKey) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw ErrorCode.COMMON_VALIDATION_FAILED.toException("Idempotency-Key 헤더가 필요합니다.");
        }
        return idempotencyKey.trim();
    }

    /**
     * {@code chain_job} 은 {@code FAILED} 인데 {@code refund} 가 {@code PROCESSING} 으로 남은 행을 닫는다
     * — {@code RefundScheduler} 가 1분마다 부른다.
     *
     * <p>전이의 제1 경로는 {@code ChainJobStateWriter} 가 job 을 닫을 때 같은 트랜잭션에서 하는
     * 것이다. 이 스윕은 <b>그 뒤를 받치는 두 번째 그물</b>이다: 이 코드가 배포되기 전에 갈라진
     * 행(2026-09-17 리허설의 환불 1건)과, 전이 코드가 도는 도중 프로세스가 죽어 생긴 갈림을
     * 사람 손 없이 닫는다(S15P21B204-147).
     *
     * <p>{@code PROCESSING} 은 늘 몇 건이라 두 번에 나눠 읽는다 — {@code refund.chain_job_id} 는
     * 연관이 아니라 값 컬럼이어서 JPQL 조인이 안 된다(ERD v5). 건수가 적어 문제가 되지 않는다.
     *
     * @return 닫은 건수
     */
    @Transactional
    public int failRefundsWithClosedJobs() {
        List<Refund> processing = refundRepository.findByStatus(Refund.Status.PROCESSING);
        int closed = 0;
        for (Refund refund : processing) {
            if (refund.getChainJobId() == null) {
                continue;
            }
            ChainJob job = chainJobRepository.findById(refund.getChainJobId()).orElse(null);
            if (job == null || job.getStatus() != ChainJob.Status.FAILED) {
                continue;
            }
            refund.markFailed();
            closed++;
            log.warn("환불 {} FAILED — chain_job {} 이 이미 닫혀 있었다(스윕)",
                    refund.getRefundId(), job.getChainJobId());
        }
        return closed;
    }

    private Money.Display display(long amount, Member member) {
        return displayRateService.money(amount, member.getDisplayCurrency(), member.getTimezone())
                .display();
    }

    private static java.time.OffsetDateTime offset(LocalDateTime value, Member member) {
        return TimeSupport.toOffset(value, member.getTimezone());
    }
}
