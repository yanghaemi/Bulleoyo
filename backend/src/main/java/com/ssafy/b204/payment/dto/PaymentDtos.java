package com.ssafy.b204.payment.dto;

import com.ssafy.b204.chain.dto.ChainDtos.SignRequest;
import com.ssafy.b204.common.response.Money;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * payment 도메인 DTO — API v6 §7 (API-payment-01~03). 접두 {@code PAYMENT_*}.
 *
 * <p><b>결제는 지갑 YoYo 잔액 결제 하나뿐이다</b>(v5 변경). {@code mode} 필드가 사라졌고
 * 자동 충전 분기·{@code CHARGING} 상태가 없다 — 법정화폐 입구가 없는 세계라 코인을 사들일
 * 방법이 없다. 잔액이 모자라면 {@code COMMON_CONFLICT}(409) 안내로 끝난다.
 *
 * <p>흐름은 §0.4 3단계다 — {@code POST /payment}(01)가 {@code signRequests}를 내려주고,
 * 프론트가 발신자 서명을 만들고, {@code POST /payment/signed-tx}(03)로 보고하면 서버가
 * fee payer 서명을 붙여 전송한다.
 */
public final class PaymentDtos {

    private PaymentDtos() {
    }

    /**
     * 그룹 뷰에 담기는 <b>하위 주문별 결제 요약</b>(v6.2).
     *
     * <p>{@code purchaseJobId}가 여기 있는 이유는 하위 주문마다 {@code purchase} tx가 하나씩
     * 따로 나가기 때문이다. {@code approveJobId}는 그룹당 1건이라 최상위에 남는다.
     */
    public record PaymentBrief(
            Long orderId,
            Long paymentId,
            String paymentStatus,
            Long amount,
            String teamName,
            String purchaseJobId
    ) {}

    /**
     * {@code POST /api/v1/orders/{orderId}/payment} — 결제 시작(API-payment-01).
     * <b>요청 본문이 없다</b>(v5).
     *
     * <p><b>(v6.2) 주문 그룹 결제다.</b> {@code signRequests}는 {@code APPROVE} 1건(미결제 하위
     * 주문 합계) + 미결제 하위 주문마다 {@code PURCHASE} 1건이다 — 2팀이면 3회 서명한다. 기존
     * allowance가 충분하면 {@code APPROVE}의 {@code required}가 {@code false}로 온다.
     */
    public record StartPaymentResponse(
            Long orderGroupId,
            String approveJobId,
            List<PaymentBrief> payments,
            /** 미결제 하위 주문 합계. 이미 {@code PAID}인 하위 주문은 빠진다. */
            Long amount,
            String currency,
            Money.Display display,
            Long walletBalance,
            List<SignRequest> signRequests,
            /** 서명 파라미터 유효 시각 = 주문 만료(15분). 지나면 결제를 다시 시작해야 한다. */
            OffsetDateTime expiresAt,
            /**
             * [2026-09-24] 결제 전 본인 확인 스위치가 켜졌을 때만 {@code true}. 꺼져 있으면 null 이라
             * 키가 없다(전역 non_null) — 스위치 off 응답은 이 필드 이전과 같다.
             */
            Boolean stepUpRequired
    ) {}

    /**
     * {@code GET /api/v1/orders/{orderId}/payment} — 결제 상태 조회(API-payment-02).
     *
     * <p>결제 단계가 하나로 합쳐졌다(v5). 새로고침·이탈 후 복귀 시 이 API로 {@code signRequests}를
     * 다시 받아 이어서 서명한다 — 그래서 조회인데도 서명 파라미터를 담는다.
     *
     * <p><b>(v6.2) 그룹 뷰다.</b> {@code groupStatus}는 하위 주문 상태에서 파생한 5값이고
     * {@code AWAITING_SIGNATURE}·{@code FAILED}는 {@code payments[].paymentStatus}로만 나간다.
     */
    public record PaymentStatusResponse(
            Long orderGroupId,
            String groupStatus,
            String approveJobId,
            List<PaymentBrief> payments,
            Integer paidCount,
            Integer totalCount,
            /** 그룹 합계. 부족액 판정은 미결제분 기준이다. */
            Long amount,
            String currency,
            Money.Display display,
            Long walletBalance,
            Long shortfall,
            /** 미결제 하위 주문이 서명 대기일 때만 채운다. 잔액이 모자라면 {@code null}이다. */
            List<SignRequest> signRequests,
            /** {@code INSUFFICIENT_BALANCE} 하나만 쓴다(v5). 화면이 안내 컴포넌트를 띄우는 근거. */
            String blockedReason,
            Boolean feeDelegated,
            /** 확정 후 발급된 티켓. A-06으로 곧바로 넘어가는 근거다. */
            List<Long> ticketIds,
            OffsetDateTime paidAt,
            /** 폴링이 필요한 상태에서만 값이 있다. 확정·실패면 {@code null}. */
            Integer pollAfterMs,
            OffsetDateTime expiresAt,
            /** [2026-09-24] {@link StartPaymentResponse#stepUpRequired()}와 같은 규칙. 새로고침 복원 경로용. */
            Boolean stepUpRequired
    ) {}

    /**
     * {@code abandoned: true} 응답(200) — 사용자가 지갑 팝업을 닫았다.
     *
     * <p>실패가 아니다. tx를 만들지 않고 결제를 {@code AWAITING_SIGNATURE}로 둔 채
     * <b>잔액이 그대로 남아 있음</b>을 알린다(결정 v2 §3.3 실패 보상).
     */
    public record PaymentAbandonedResponse(
            Long orderId,
            Long orderGroupId,
            Long paymentId,
            String paymentStatus,
            String orderStatus,
            boolean balanceKept,
            OffsetDateTime expiresAt
    ) {}

    /**
     * {@code POST /api/v1/orders/{orderId}/payment/signed-tx} — 결제 tx 보고(API-payment-03).
     * 202 + 폴링.
     *
     * <p>본문은 {@code {kind, senderSignedRlp, orderId, abandoned}}다. {@code abandoned: true}는
     * 사용자가 지갑 팝업을 닫은 경우이고 그때 {@code senderSignedRlp}는 없다 — 그래서 명세에서
     * 조건부 필수다({@link com.ssafy.b204.chain.dto.ChainDtos.SignedTxRequest}에 이 필드가 없으므로
     * payment 전용 요청 레코드를 따로 둔다).
     *
     * <p><b>(v6.2) {@code orderId}가 어느 하위 주문의 서명인지 가리킨다.</b> {@code kind=PURCHASE}면
     * 필수이고, {@code kind=APPROVE}면 생략할 수 있으며 값이 와도 서버가 무시한다 —
     * {@code APPROVE} job은 미결제 하위 주문 중 {@code orderId} 오름차순 첫 행에 귀속한다.
     */
    public record PaymentSignedTxRequest(String kind, String senderSignedRlp, Long orderId,
                                          Boolean abandoned) {}

    /**
     * {@code expectedEvent}가 receipt 검증의 기준이다 — {@code Purchased} 이벤트가 나오지 않으면
     * {@code status}가 성공이어도 확정하지 않는다.
     *
     * <p>{@code pendingOrderIds}는 그룹에서 아직 결제가 확정되지 않은 <b>다른</b> 하위 주문이다.
     * 빈 배열이면 이 보고로 그룹이 완결된다.
     */
    public record PaymentSignedTxResponse(
            String jobId,
            String status,
            String signerType,
            boolean feeDelegated,
            Integer pollAfterMs,
            Long orderId,
            Long orderGroupId,
            Long paymentId,
            String kind,
            String paymentStatus,
            String txHash,
            String explorerUrl,
            String expectedEvent,
            List<Long> pendingOrderIds
    ) {}
}
