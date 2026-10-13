package com.ssafy.b204.payment.service;

import com.ssafy.b204.chain.dto.ChainDtos.SignRequest;
import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.service.SignRequestFactory;
import com.ssafy.b204.chain.service.UserSignedTxService;
import com.ssafy.b204.chain.support.ChainJobIds;
import com.ssafy.b204.chain.support.ContractCalls;
import com.ssafy.b204.coin.service.DisplayRateService;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.response.Money;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.common.support.IdempotencyGuard;
import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.common.support.TxCallbacks;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.payment.dto.PaymentDtos.PaymentAbandonedResponse;
import com.ssafy.b204.payment.dto.PaymentDtos.PaymentBrief;
import com.ssafy.b204.payment.dto.PaymentDtos.PaymentSignedTxRequest;
import com.ssafy.b204.payment.dto.PaymentDtos.PaymentSignedTxResponse;
import com.ssafy.b204.payment.dto.PaymentDtos.PaymentStatusResponse;
import com.ssafy.b204.payment.dto.PaymentDtos.StartPaymentResponse;
import com.ssafy.b204.payment.entity.Payment;
import com.ssafy.b204.payment.repository.PaymentRepository;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.service.PerformanceService;
import com.ssafy.b204.ticket.entity.Ticket;
import com.ssafy.b204.ticket.entity.TicketOrder;
import com.ssafy.b204.ticket.repository.TicketRepository;
import com.ssafy.b204.ticket.service.OrderService;
import com.ssafy.b204.wallet.entity.Wallet;
import com.ssafy.b204.wallet.service.WalletBalanceService;
import com.ssafy.b204.webauthn.service.StepUpTokenService;
import com.ssafy.b204.webauthn.service.StepUpAction;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * payment 도메인 서비스 — API v6 §7(API-payment-01·02·03).
 *
 * <p><b>결제는 관객 지갑이 서명하는 {@code RevenueSplitter.purchase} tx 하나다.</b> 컨트랙트가
 * {@code transferFrom(관객 → 에스크로)}로 YoYo를 옮기고 <b>선택 카운터를 함께</b> 올린다
 * (결정 v2 §2.4). 모든 티켓 대금이 이 경로로만 에스크로에 들어온다(P-24 원장 단일화).
 *
 * <p><b>결제 수단은 잔액 하나뿐이다</b>(v5). 요청 본문이 없고, 잔액이 모자라면
 * {@code COMMON_CONFLICT}(409) 안내로 끝난다 — 전용 코드
 * {@code PAYMENT_INSUFFICIENT_BALANCE} 재정의는 §16.1 신설 제안이라 쓰지 않는다.
 *
 * <p><b>실패 보상 원칙</b> — 서명 거부든 {@code purchase} revert든 <b>잔액은 그대로 남고</b>
 * 주문만 15분 뒤 만료된다. 돈이 사라지는 경로도, 되돌려야 할 외부 승인도 없다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PaymentService {

    private static final int POLL_AFTER_MS = 1200;
    private static final int BLOCKED_POLL_AFTER_MS = 3000;

    /** v5 — {@code blockedReason}은 이 값 하나만 쓴다. */
    private static final String BLOCKED_INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE";

    /**
     * {@code idem:payment:{memberId}:{Idempotency-Key}} — §0.8 필수 대상 중 결제 시작.
     *
     * <p>⚠️ {@code stock:performance:*}·{@code idem:order:*}와 마찬가지로 §0.12 규약 표에 없는
     * 서버 내부 키다. 표에 추가가 필요하다.
     */
    public static final String IDEMPOTENCY_KEY_PREFIX = "idem:payment:";

    private static final String EXPECTED_EVENT_PURCHASE = "Purchased";
    private static final String EXPECTED_EVENT_APPROVE = "Approval";

    private final PaymentRepository paymentRepository;
    private final TicketRepository ticketRepository;
    private final OrderService orderService;
    private final PerformanceService performanceService;
    private final WalletBalanceService walletBalanceService;
    private final DisplayRateService displayRateService;
    private final IdempotencyGuard idempotencyGuard;
    private final SignRequestFactory signRequestFactory;
    private final UserSignedTxService userSignedTxService;
    /** 결제 전 패스키 본인 확인(API v7 §7.W). 스위치가 꺼져 있으면 {@link #stepUpRequired()}가 null 이고 가드도 돌지 않는다. */
    private final StepUpTokenService stepUpTokens;

    // ================================================================ API-payment-01

    /**
     * API-payment-01 결제 시작 — <b>200 OK</b> + 서명 파라미터. 요청 본문이 없다(v5).
     *
     * <p><b>(v6.2) 경로의 {@code orderId}는 그룹의 어느 하위 주문이든 된다.</b> 서버가
     * {@code order_group_id}로 그룹 전체를 찾고, 서명·잔액 검사는 <b>아직 결제되지 않은 하위
     * 주문의 합계</b>를 기준으로 한다. 서명은 {@code APPROVE} 1 + 미결제 하위 주문마다
     * {@code PURCHASE} 1이다.
     *
     * <p>{@code Idempotency-Key}가 필수다(§0.8). 그룹 단위 키 하나를 받아 하위 주문마다
     * {@code {Idempotency-Key}#{orderId}}로 파생해 저장한다 — {@code payment.idempotency_key}가
     * {@code NOT NULL UNIQUE}라 그대로 쓰면 두 번째 하위 주문에서 UNIQUE 위반이다.
     *
     * <p>allowance 조회 경로가 아직 없어 {@code APPROVE.required}는 보수적으로 항상 {@code true}다
     * — 모르면 건너뛰지 않는다. 이미 승인돼 있으면 그 tx는 무해하게 성공한다.
     */
    @Transactional
    public StartPaymentResponse startPayment(MemberPrincipal me, Long orderId,
                                             String idempotencyKey) {
        Member member = performanceService.requireMember(me);
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
        }
        TicketOrder entry = requireOwnedOrder(member, orderId);
        // 주문 생성과 같은 결함이 여기에도 있었다 — 두 요청이 겹치면 둘 다 "payment 없음"을 보고
        // 각자 insert 를 시도해 UNIQUE 위반(500)으로 끝났다. §0.8이 요구하는 것은 409이거나 최초
        // 결과의 재생이다. 처리 전에 자리를 잡는다. 키는 그룹 단위이므로 같은 그룹의 다른 하위
        // 주문으로 들어와도 같은 자리를 잡는다.
        IdempotencyGuard.Reservation reservation = idempotencyGuard.begin(
                IdempotencyGuard.key(IDEMPOTENCY_KEY_PREFIX, member.getMemberId(), idempotencyKey),
                "orderGroupId=" + entry.groupId());
        try {
            return startReservedPayment(member, entry, idempotencyKey, reservation);
        } catch (RuntimeException e) {
            // 잔액 부족·만료로 막힌 요청은 같은 키로 다시 시도할 수 있어야 한다.
            idempotencyGuard.release(reservation);
            throw e;
        }
    }

    /**
     * 자리를 잡은 뒤의 본 처리.
     *
     * <p>재호출(같은 키·같은 그룹)도 이 경로를 그대로 탄다 — §0.8의 "최초 응답 재생"은 아래
     * {@code existing} 조회가 만족하고, {@code signRequests}는 명세대로 <b>현재 잔액·allowance
     * 기준으로 다시</b> 만들어야 하기 때문이다. 저장한 응답을 그대로 돌려주면 안 된다.
     */
    private StartPaymentResponse startReservedPayment(Member member, TicketOrder entry,
                                                      String idempotencyKey,
                                                      IdempotencyGuard.Reservation reservation) {
        Wallet wallet = performanceService.requireWallet(member.getMemberId());
        List<TicketOrder> group = orderService.groupOf(entry);

        // 만료된 하위 주문은 <b>새 트랜잭션</b>에서 정리한다. 같은 트랜잭션에서 처리하면 바로
        // 아래 unpaid.isEmpty() 가 409 로 끝날 때 롤백과 함께 주문 CANCELLED·결제 FAILED·
        // 재고 반납이 전부 사라진다(develop ca5b394 가 단건 경로에서 고친 그 버그다. 그룹
        // 경로에서는 하위 주문이 전부 만료된 경우가 정확히 그 자리다).
        //
        // 이 경로는 findById·파생 쿼리로만 읽고 여기까지 ticket_order 에 쓰지 않는다 —
        // FOR UPDATE 를 잡지 않으므로 expireOrderNow 의 전제(자기 락에 막히지 않는다)를
        // 만족한다.
        LocalDateTime now = TimeSupport.nowStored();
        group.stream()
                .filter(order -> order.isPaymentExpired(now))
                .forEach(order -> orderService.expireOrderNow(order.getTicketOrderId()));

        Map<Long, Payment> payments = paymentsOf(group);
        // expireOrderNow 는 별도 영속성 문맥에서 커밋해 group 의 엔티티는 낡은 상태로 남는다.
        // 그래서 "결제할 수 있는가" 를 DB 상태가 아니라 <b>만료 시각</b>으로 한 번 더 거른다 —
        // 낡은 PENDING_PAYMENT 를 믿으면 방금 취소·반납한 표를 다시 결제하게 된다.
        List<TicketOrder> unpaid = unpaidOf(group, payments).stream()
                .filter(order -> !order.isPaymentExpired(now))
                .toList();
        if (unpaid.isEmpty()) {
            // 더 결제할 하위 주문이 없다. 전부 결제됐으면 ALREADY_PAID, 전부 만료·취소면 충돌이다.
            throw BusinessException.of(group.stream().anyMatch(o -> isSettled(o, payments))
                    ? ErrorCode.PAYMENT_ALREADY_PAID : ErrorCode.COMMON_CONFLICT);
        }
        requireSaleOpen(entry.getPerformance());

        long amount = totalOf(unpaid);
        WalletBalanceService.Balance balance = walletBalanceService.require(wallet);
        if (balance.amount() < amount) {
            // payment 레코드를 만들지 않고 주문은 그대로 둔다 — 잔액을 확보하면 다시 시도한다.
            throw BusinessException.of(ErrorCode.COMMON_CONFLICT,
                    PerformanceService.shortfallMessage(amount, balance.amount()));
        }

        for (TicketOrder order : unpaid) {
            Payment payment = payments.computeIfAbsent(order.getTicketOrderId(),
                    id -> paymentRepository.save(Payment.builder()
                            .ticketOrder(order)
                            .payerWallet(wallet)
                            .amount(order.getTotalAmount())
                            // payment.idempotency_key 는 NOT NULL UNIQUE 다. 그룹 단위 헤더값을
                            // 하위 주문마다 파생해 넣는다(API-payment-01 "멱등키 파생 규칙").
                            .idempotencyKey(derivedIdempotencyKey(idempotencyKey, id))
                            .build()));
            // 이 응답의 paymentStatus enum 은 AWAITING_SIGNATURE 하나뿐이다(openapi
            // PaymentBrief 는 6값이지만 결제 시작 직후는 서명 대기다). 그래서 나가기 전에
            // 반드시 그 상태로 맞춘다 — 예전에는 PAYING 이면 전이 조건에 걸리지 않아 "PAYING" 이
            // 그대로 나갔고, 생성 타입이 못 받는 값이었다(QA 2026-09-09 A-7-1).
            switch (payment.getStatus()) {
                case AWAITING_SIGNATURE -> { /* 이미 서명 대기 — signRequests 만 다시 만든다 */ }
                case REQUESTED, FAILED, PAYING -> payment.markAwaitingSignature(
                        payment.getApproveChainJobId(), payment.getPurchaseChainJobId());
                // PAID 는 위 unpaid 산출에서 빠졌고, REFUNDED 는 주문이 PENDING_PAYMENT 가
                // 아니라 여기까지 오지 못한다. 그래도 열어 두지 않는다 — 열어 두면 새 상태가
                // 생겼을 때 enum 밖 값이 조용히 응답에 실린다.
                default -> throw BusinessException.of(ErrorCode.COMMON_CONFLICT);
            }
        }

        // 멱등 완료는 커밋 이후다 — 커밋 전에 적으면 아직 보이지 않는 paymentId 가 재생된다.
        Payment representative = payments.get(unpaid.get(0).getTicketOrderId());
        TxCallbacks.afterCommit(() -> idempotencyGuard.complete(reservation,
                representative.getPaymentId()));
        TxCallbacks.afterRollback(() -> idempotencyGuard.release(reservation));

        Money money = displayRateService.money(amount, member.getDisplayCurrency(),
                member.getTimezone());
        return new StartPaymentResponse(
                entry.groupId(),
                // APPROVE job 은 그룹당 1건이고 미결제 첫 하위 주문에 귀속한다.
                ChainJobIds.toJobId(representative.getApproveChainJobId()),
                briefsOf(unpaid, payments),
                amount,
                Money.BASE_CURRENCY,
                money.display(),
                balance.amount(),
                buildSignRequests(unpaid),
                TimeSupport.toOffset(unpaid.get(0).getPaymentExpiresAt(), member.getTimezone()),
                stepUpRequired());
    }

    // ================================================================ API-payment-02

    /**
     * API-payment-02 결제 상태 조회 — <b>그룹 뷰</b>. A-05의 폴링 대상이다.
     *
     * <p>조회인데 {@code signRequests}를 담는다 — 새로고침·이탈 후 복귀에서 별도 prepare 호출
     * 없이 서명을 이어가게 하기 위해서다(A-05 원스텝 UX). 잔액이 그 사이 줄었으면
     * {@code signRequests}를 {@code null}로 주고 {@code blockedReason}을 채운다.
     *
     * <p>하위 주문 일부만 {@code PAID}면 {@code groupStatus = PARTIALLY_PAID}이고, 만료 전이면
     * 남은 하위 주문의 {@code signRequests}를 그대로 담아 재시도할 수 있게 한다.
     */
    public PaymentStatusResponse paymentStatus(MemberPrincipal me, Long orderId) {
        Member member = performanceService.requireMember(me);
        TicketOrder entry = requireOwnedOrder(member, orderId);
        List<TicketOrder> group = orderService.groupOf(entry);
        Map<Long, Payment> payments = paymentsOf(group);
        if (payments.isEmpty()) {
            // 결제 시작 이력이 없다(§7 4xx 표의 404).
            throw BusinessException.of(ErrorCode.COMMON_NOT_FOUND);
        }

        List<TicketOrder> unpaid = unpaidOf(group, payments);
        long groupAmount = totalOf(group);
        long unpaidAmount = totalOf(unpaid);
        Wallet wallet = payments.values().iterator().next().getPayerWallet();
        Long walletBalance = walletBalanceService.find(wallet)
                .map(WalletBalanceService.Balance::amount).orElse(null);
        long shortfall = walletBalance == null ? 0L : Math.max(0L, unpaidAmount - walletBalance);

        boolean awaiting = payments.values().stream()
                .anyMatch(p -> p.getStatus() == Payment.Status.AWAITING_SIGNATURE);
        boolean blocked = awaiting && walletBalance != null && shortfall > 0;
        List<SignRequest> signRequests = awaiting && !blocked && !unpaid.isEmpty()
                ? buildSignRequests(unpaid) : null;

        List<Long> ticketIds = group.stream()
                .filter(order -> isSettled(order, payments))
                .flatMap(order -> ticketRepository
                        .findByTicketOrder_TicketOrderId(order.getTicketOrderId()).stream())
                .map(Ticket::getTicketId)
                .toList();
        // 그룹의 마지막 확정 시각. 하위 주문마다 다른 tx 라 "이 그룹이 언제 끝났는가" 는 최댓값이다.
        LocalDateTime paidAt = payments.values().stream()
                .map(Payment::getPaidAt).filter(Objects::nonNull)
                .max(LocalDateTime::compareTo).orElse(null);
        // 남은 시간은 아직 결제할 수 있는 하위 주문에만 뜻이 있다.
        LocalDateTime expiresAt = unpaid.stream().map(TicketOrder::getPaymentExpiresAt)
                .findFirst().orElse(null);

        Money money = displayRateService.money(groupAmount, member.getDisplayCurrency(),
                member.getTimezone());
        return new PaymentStatusResponse(
                entry.groupId(),
                OrderService.groupStatus(group),
                ChainJobIds.toJobId(approveChainJobId(payments)),
                briefsOf(group, payments),
                (int) group.stream().filter(order -> isSettled(order, payments)).count(),
                group.size(),
                groupAmount,
                Money.BASE_CURRENCY,
                money.display(),
                walletBalance,
                shortfall,
                signRequests,
                blocked ? BLOCKED_INSUFFICIENT_BALANCE : null,
                payments.values().stream().anyMatch(p -> p.getPurchaseChainJobId() != null)
                        ? Boolean.TRUE : null,
                ticketIds,
                TimeSupport.toOffset(paidAt, member.getTimezone()),
                pollAfterMs(payments.values(), blocked),
                TimeSupport.toOffset(expiresAt, member.getTimezone()),
                stepUpRequired());
    }

    /**
     * [2026-09-24] 결제 전 본인 확인 스위치 — 켜짐이면 {@code TRUE}, 꺼짐이면 <b>{@code null}</b>.
     *
     * <p>{@code false}가 아니라 null 인 이유: 전역 {@code non_null} 직렬화가 키를 지워 <b>스위치가 꺼진
     * 응답이 이 기능 이전과 같아진다.</b> 프론트는 "없거나 false면 기존 화면"으로 읽는다.
     */
    private Boolean stepUpRequired() {
        return stepUpTokens.requiredFlag();
    }

    // ================================================================ API-payment-03

    /**
     * API-payment-03 결제 tx 보고(§0.4 {@code signed-tx}). <b>202</b> + 폴링.
     *
     * <p>{@code kind=PURCHASE}의 receipt가 확정될 때 <b>그 하위 주문의</b> 결제가 성립한다. 보고
     * 시점에는 {@code PAYING}까지만 올린다 — RLP를 받았을 뿐 체인에 들어갔다는 보장이 없다.
     * {@code PAID}·주문 {@code PAID}·티켓 {@code ISSUED} 전이는
     * {@link com.ssafy.b204.chain.service.ChainJobConfirmationService}가 한다.
     *
     * <p><b>(v6.2) 대상은 본문 {@code orderId}의 하위 주문이다.</b> 경로 {@code orderId}는 그룹을
     * 찾는 데만 쓴다. {@code kind=APPROVE}면 본문 {@code orderId}를 무시하고 <b>미결제 하위 주문
     * 중 id 오름차순 첫 행</b>에 귀속한다 — 대표 주문에 고정하면 대표가 이미 {@code PAID}인
     * 재시도에서 {@code PAYMENT_ALREADY_PAID} 가드에 막힌다.
     *
     * <p><b>같은 {@code senderSignedRlp} 재보고는 진행 중·확정 job이면 최초 {@code jobId}를
     * 재생</b>한다. 종단 FAILED job은 실패 이력을 남기고 새 job으로 다시 제출한다
     * (RLP 해시가 자연 멱등키지만 실패 복구가 영구히 막히지 않아야 한다).
     */
    @Transactional
    public PaymentSignedTxResponse signedTx(MemberPrincipal me, Long orderId,
                                            PaymentSignedTxRequest request, String stepUpToken) {
        Member member = performanceService.requireMember(me);
        TicketOrder entry = requireOwnedOrder(member, orderId);
        // [2026-09-24] 결제 전 본인 확인 가드(API v7 §7.W). 스위치가 꺼져 있으면 헤더를 읽지도 않는다 —
        // 이 한 줄 말고는 결제 흐름이 바뀌지 않는다. 소유 확인 뒤에 두는 이유: 남의 주문 id 로 들어온
        // 요청이 토큰을 태우지 못하게(404 가 먼저) 하기 위해서다.
        stepUpTokens.guard(member.getMemberId(), StepUpAction.PAYMENT, entry.groupId(), stepUpToken);
        List<TicketOrder> group = orderService.groupOf(entry);
        Map<Long, Payment> payments = paymentsOf(group);
        String kind = kindOf(request.kind());
        boolean purchase = "PURCHASE".equals(kind);

        TicketOrder target = purchase
                ? requireSubOrder(group, request.orderId())
                : requireFirstUnpaid(group, payments);
        Payment payment = Optional.ofNullable(payments.get(target.getTicketOrderId()))
                .orElseThrow(() -> BusinessException.of(ErrorCode.COMMON_NOT_FOUND));
        if (payment.isPaid()) {
            throw BusinessException.of(ErrorCode.PAYMENT_ALREADY_PAID);
        }
        if (target.isPaymentExpired(TimeSupport.nowStored())) {
            throw BusinessException.of(ErrorCode.COMMON_CONFLICT);
        }
        if (payment.getStatus() != Payment.Status.AWAITING_SIGNATURE
                && payment.getStatus() != Payment.Status.PAYING) {
            throw BusinessException.of(ErrorCode.COMMON_CONFLICT);
        }
        if (request.senderSignedRlp() == null || request.senderSignedRlp().isBlank()) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
        }

        Wallet wallet = payment.getPayerWallet();
        ChainJob.TxType txType;
        String expectedTo;
        String expectedData;
        long amount;
        if (purchase) {
            txType = ChainJob.TxType.PURCHASE;
            expectedTo = signRequestFactory.splitterAddress();
            amount = payment.getAmount();
            // calldata 의 orderRef 는 이 하위 주문의 order_ref 다 — 다른 하위 주문의 서명을
            // 여기 보고하면 data 대조에서 걸린다(API-payment-03 "orderRef 대조").
            expectedData = purchaseCalldata(target);
        } else {
            txType = ChainJob.TxType.APPROVE;
            expectedTo = signRequestFactory.yoyoAddress();
            // APPROVE 는 그룹당 1건이고 승인액은 미결제 하위 주문 합계다.
            amount = totalOf(unpaidOf(group, payments));
            expectedData = ContractCalls.approve(signRequestFactory.splitterAddress(), amount);
        }

        // 재보고 판정 - 같은 회원이라도 "주문 A 의 RLP 를 주문 B 에 보고"는 409 다.
        // chain_job 에 주문 컬럼이 없어 payment 쪽 링크로 되짚는다(API-payment-03 409 행).
        Long linkedJobId = purchase
                ? payment.getPurchaseChainJobId() : payment.getApproveChainJobId();
        UserSignedTxService.Accepted accepted = userSignedTxService.accept(
                request.senderSignedRlp(),
                new UserSignedTxService.Expectation(txType, expectedTo, expectedData,
                        wallet.getAddress(), member, wallet.getWalletId(),
                        target.getPerformance().getPerformanceId(), null, amount,
                        existing -> existing.getChainJobId().equals(linkedJobId)));
        ChainJob job = accepted.job();

        if (!accepted.replayed()) {
            if (purchase) {
                payment.markAwaitingSignature(payment.getApproveChainJobId(), job.getChainJobId());
                payment.markPaying();
            } else {
                payment.markAwaitingSignature(job.getChainJobId(), payment.getPurchaseChainJobId());
            }
        }

        return new PaymentSignedTxResponse(
                ChainJobIds.toJobId(job.getChainJobId()),
                job.getStatus().name(),
                job.getSignerType().name(),
                job.isFeeDelegated(),
                POLL_AFTER_MS,
                target.getTicketOrderId(),
                entry.groupId(),
                payment.getPaymentId(),
                kind,
                payment.getStatus().name(),
                job.getTxHash(),
                performanceService.explorerTxUrl(job.getTxHash()),
                purchase ? EXPECTED_EVENT_PURCHASE : EXPECTED_EVENT_APPROVE,
                pendingOrderIds(group, payments, purchase ? target : null));
    }

    /**
     * API-payment-03 {@code abandoned: true} — <b>200 OK</b>. 사용자가 지갑 팝업을 닫았다.
     *
     * <p>실패가 아니다. tx를 만들지 않고 {@code AWAITING_SIGNATURE}로 두며 <b>잔액은 그대로
     * 남는다.</b> 주문은 만료 스케줄대로 처리된다. <b>(v6.2)</b> 대상은 본문 {@code orderId}의
     * 하위 주문이고, 생략하면 경로의 하위 주문이다.
     *
     * <p><b>상태 가드가 있다.</b> 200 응답의 {@code paymentStatus}는 {@code AWAITING_SIGNATURE},
     * {@code orderStatus}는 {@code PENDING_PAYMENT} 단일 enum이고(openapi
     * {@code PaymentAbandonedResult} · md API-payment-03 200 예시) {@code balanceKept: true}는
     * "코인이 아직 나가지 않았다"는 사실 주장이다. 가드가 없으면 이미 결제된 주문에
     * {@code abandoned:true}를 보내도 {@code PAID}/{@code balanceKept:true}가 나가 <b>돈이
     * 나갔는데 안 나갔다고 답한다</b>(QA 2026-09-09 A-7-3). 그래서 "서명을 기다리는 중"이
     * 아니면 받지 않는다 — API-payment-03의 4xx 표 그대로 {@code PAID}는
     * {@code PAYMENT_ALREADY_PAID}, 만료·그 밖의 상태는 {@code COMMON_CONFLICT}다.
     */
    @Transactional
    public PaymentAbandonedResponse abandon(MemberPrincipal me, Long orderId,
                                            PaymentSignedTxRequest request) {
        Member member = performanceService.requireMember(me);
        TicketOrder entry = requireOwnedOrder(member, orderId);
        List<TicketOrder> group = orderService.groupOf(entry);
        TicketOrder target = request.orderId() == null ? entry
                : requireSubOrder(group, request.orderId());
        Payment payment = paymentRepository
                .findByTicketOrder_TicketOrderId(target.getTicketOrderId())
                .orElseThrow(() -> BusinessException.of(ErrorCode.COMMON_NOT_FOUND));
        if (payment.isPaid() || target.getStatus() == TicketOrder.Status.PAID) {
            throw BusinessException.of(ErrorCode.PAYMENT_ALREADY_PAID);
        }
        if (target.getStatus() != TicketOrder.Status.PENDING_PAYMENT
                || target.isPaymentExpired(TimeSupport.nowStored())) {
            throw BusinessException.of(ErrorCode.COMMON_CONFLICT);
        }
        // PAYING = 이미 대납 전송까지 끝난 tx 가 receipt 를 기다리는 중이다. "잔액은 그대로"가
        // 참이 아닐 수 있으므로 포기 보고를 받지 않는다. FAILED·REFUNDED 도 마찬가지다.
        if (payment.getStatus() != Payment.Status.AWAITING_SIGNATURE) {
            throw BusinessException.of(ErrorCode.COMMON_CONFLICT);
        }
        return new PaymentAbandonedResponse(target.getTicketOrderId(), entry.groupId(),
                payment.getPaymentId(), payment.getStatus().name(), target.getStatus().name(), true,
                TimeSupport.toOffset(target.getPaymentExpiresAt(), member.getTimezone()));
    }

    // ================================================================ 주문 그룹

    /** 하위 주문 id → 결제. 그룹 안에서 결제가 시작되지 않은 하위 주문은 키가 없다. */
    private Map<Long, Payment> paymentsOf(List<TicketOrder> group) {
        return paymentRepository.findByTicketOrder_TicketOrderIdIn(
                        group.stream().map(TicketOrder::getTicketOrderId).toList()).stream()
                .collect(Collectors.toMap(p -> p.getTicketOrder().getTicketOrderId(),
                        Function.identity(), (a, b) -> a, LinkedHashMap::new));
    }

    /** 아직 결제할 수 있는 하위 주문 — {@code PENDING_PAYMENT}이고 결제가 확정되지 않은 것. */
    private static List<TicketOrder> unpaidOf(List<TicketOrder> group, Map<Long, Payment> payments) {
        return group.stream()
                .filter(TicketOrder::isPendingPayment)
                .filter(order -> !isSettled(order, payments))
                .toList();
    }

    /** 결제가 확정된 하위 주문. 늦게 온 receipt 대비로 주문·결제 어느 쪽이든 {@code PAID}면 참이다. */
    private static boolean isSettled(TicketOrder order, Map<Long, Payment> payments) {
        Payment payment = payments.get(order.getTicketOrderId());
        return order.getStatus() == TicketOrder.Status.PAID
                || (payment != null && payment.isPaid());
    }

    private static long totalOf(List<TicketOrder> orders) {
        return orders.stream().mapToLong(TicketOrder::getTotalAmount).sum();
    }

    private static List<PaymentBrief> briefsOf(List<TicketOrder> orders,
                                                Map<Long, Payment> payments) {
        List<PaymentBrief> briefs = new ArrayList<>();
        for (TicketOrder order : orders) {
            Payment payment = payments.get(order.getTicketOrderId());
            if (payment == null) {
                continue; // 아직 결제를 시작하지 않은 하위 주문은 payments[] 에 실리지 않는다.
            }
            briefs.add(new PaymentBrief(order.getTicketOrderId(), payment.getPaymentId(),
                    payment.getStatus().name(), payment.getAmount(),
                    order.getSelectedTeam() == null ? null : order.getSelectedTeam().getName(),
                    ChainJobIds.toJobId(payment.getPurchaseChainJobId())));
        }
        return briefs;
    }

    /** {@code APPROVE} job 은 그룹당 1건이다 — 어느 하위 주문에 귀속됐든 그 값을 최상위로 올린다. */
    private static Long approveChainJobId(Map<Long, Payment> payments) {
        return payments.values().stream().map(Payment::getApproveChainJobId)
                .filter(Objects::nonNull).findFirst().orElse(null);
    }

    /** 아직 확정되지 않은 <b>다른</b> 하위 주문. 빈 배열이면 이번 보고로 그룹이 완결된다. */
    private static List<Long> pendingOrderIds(List<TicketOrder> group, Map<Long, Payment> payments,
                                               TicketOrder reported) {
        return group.stream()
                .filter(order -> !isSettled(order, payments))
                .filter(order -> reported == null
                        || !order.getTicketOrderId().equals(reported.getTicketOrderId()))
                .map(TicketOrder::getTicketOrderId)
                .toList();
    }

    private static TicketOrder requireSubOrder(List<TicketOrder> group, Long orderId) {
        if (orderId == null) {
            // kind=PURCHASE 인데 orderId 가 없다 — 어느 하위 주문의 서명인지 알 수 없다.
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
        }
        return group.stream().filter(order -> order.getTicketOrderId().equals(orderId))
                .findFirst()
                // 이 그룹의 하위 주문이 아니다(§7 4xx 표의 404).
                .orElseThrow(() -> BusinessException.of(ErrorCode.COMMON_NOT_FOUND));
    }

    private static TicketOrder requireFirstUnpaid(List<TicketOrder> group,
                                                   Map<Long, Payment> payments) {
        return unpaidOf(group, payments).stream().findFirst()
                .orElseThrow(() -> BusinessException.of(ErrorCode.PAYMENT_ALREADY_PAID));
    }

    // ================================================================ 내부

    /**
     * {@code signRequests} = {@code APPROVE}(미결제 합계 1건) + 미결제 하위 주문마다
     * {@code PURCHASE}. 매 호출마다 다시 만든다 — {@code prepare} 값을 저장해 두면 저장소가
     * 비었을 때 검증이 조용히 통과한다.
     */
    private List<SignRequest> buildSignRequests(List<TicketOrder> unpaid) {
        long amount = totalOf(unpaid);

        Map<String, Object> approveSummary = new LinkedHashMap<>();
        approveSummary.put("title", "Allow ticket payment");
        approveSummary.put("amount", amount);
        approveSummary.put("currency", Money.BASE_CURRENCY);
        approveSummary.put("spender", "RevenueSplitter");
        approveSummary.put("spenderAddress", signRequestFactory.splitterAddress());

        List<SignRequest> requests = new ArrayList<>();
        requests.add(signRequestFactory.approve(amount, true, approveSummary));
        for (TicketOrder order : unpaid) {
            Integer teamIndex = orderService.teamIndexOf(order);
            Map<String, Object> purchaseSummary = new LinkedHashMap<>();
            // 프론트는 이 값으로 "어느 하위 주문의 서명인가"를 구분해 signed-tx 본문에 싣는다.
            purchaseSummary.put("orderId", order.getTicketOrderId());
            purchaseSummary.put("title", "Confirm payment");
            purchaseSummary.put("amount", order.getTotalAmount());
            purchaseSummary.put("currency", Money.BASE_CURRENCY);
            purchaseSummary.put("performanceId", order.getPerformance().getPerformanceId());
            purchaseSummary.put("orderRef", order.getOrderRef());
            if (teamIndex != null) {
                purchaseSummary.put("teamIndex", teamIndex);
            }
            if (order.getSelectedTeam() != null) {
                purchaseSummary.put("teamName", order.getSelectedTeam().getName());
            }
            // 워커와 같은 파생(on_chain_id ?? performance_id)을 쓴다.
            requests.add(signRequestFactory.purchase(order.getPerformance().onChainShowId(),
                    order.getOrderRef(), teamIndex == null ? 0 : teamIndex,
                    order.getTotalAmount(), order.getTotalQuantity(), purchaseSummary));
        }
        return requests;
    }

    private String purchaseCalldata(TicketOrder order) {
        Integer teamIndex = orderService.teamIndexOf(order);
        return ContractCalls.purchase(order.getPerformance().onChainShowId(),
                order.getOrderRef(), teamIndex == null ? 0 : teamIndex, order.getTotalAmount(),
                order.getTotalQuantity());
    }

    /**
     * {@code payment.idempotency_key} 파생 — {@code {Idempotency-Key}#{orderId}}.
     *
     * <p>컬럼이 {@code NOT NULL UNIQUE}(V1)라 그룹 단위 헤더값을 하위 주문마다 그대로 넣으면
     * 두 번째 행에서 UNIQUE 위반이 난다. 스키마를 늘리지 않고 값 규칙만 바꾼다
     * (API-payment-01 "멱등키 파생 규칙(v6.2)").
     */
    private static String derivedIdempotencyKey(String idempotencyKey, Long orderId) {
        return idempotencyKey + "#" + orderId;
    }

    private TicketOrder requireOwnedOrder(Member member, Long orderId) {
        TicketOrder order = orderService.requireOrder(orderId);
        if (!order.isOwnedBy(member.getMemberId())) {
            // 남의 주문은 존재 자체를 알리지 않는다(§7 4xx 표의 404 COMMON_NOT_FOUND).
            throw BusinessException.of(ErrorCode.COMMON_NOT_FOUND);
        }
        return order;
    }

    private static void requireSaleOpen(Performance performance) {
        if (performance.getStatus() != Performance.Status.ON_SALE
                || (performance.getSaleCloseAt() != null
                && performance.getSaleCloseAt().isBefore(TimeSupport.nowStored()))) {
            throw BusinessException.of(ErrorCode.TICKET_SALE_CLOSED);
        }
    }

    private static Integer pollAfterMs(Collection<Payment> payments, boolean blocked) {
        if (blocked) {
            return BLOCKED_POLL_AFTER_MS;
        }
        return payments.stream().anyMatch(p -> p.getStatus() == Payment.Status.PAYING)
                ? POLL_AFTER_MS : null;
    }

    private static String kindOf(String kind) {
        if (kind == null) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
        }
        String normalized = kind.trim().toUpperCase(Locale.ROOT);
        if (!"APPROVE".equals(normalized) && !"PURCHASE".equals(normalized)) {
            throw BusinessException.of(ErrorCode.COMMON_VALIDATION_FAILED);
        }
        return normalized;
    }
}
