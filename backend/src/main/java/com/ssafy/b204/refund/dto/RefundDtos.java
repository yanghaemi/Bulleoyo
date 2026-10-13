package com.ssafy.b204.refund.dto;

import com.ssafy.b204.common.response.Money;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.time.OffsetDateTime;

/**
 * refund 도메인 DTO — API v6 §9 (API-refund-01·02). 접두 {@code REFUND_*}.
 *
 * <p>환불은 <b>에스크로 → 관객 지갑</b>으로 YoYo를 되돌리는 온체인 tx 1건이다(v4 변경).
 * {@code refundTarget}은 항상 {@code WALLET_BALANCE}다 — 원화 출구가 없는 세계라 계좌로
 * 돌려줄 방법이 없다.
 */
public final class RefundDtos {

    private RefundDtos() {
    }

    /**
     * {@code GET /api/v1/tickets/{ticketId}/refund-quote} — 환불액 미리보기(API-refund-01).
     * 권한 소유자.
     *
     * <p>수수료 구간은 D-7 이전 전액 / D-3 이전 50%다({@code feeStage}). 기준은
     * {@code ticket.purchase_price} 스냅샷이지 현재 옵션 가격이 아니다.
     *
     * <p>{@code refundNotice}가 "잔액으로 환불되며 다른 공연에 쓸 수 있다"를 안내한다 —
     * 현금으로 돌려받을 수 없다는 사실을 취소 전에 알려야 한다.
     */
    public record RefundQuoteResponse(
            Long ticketId,
            Long paidAmount,
            Integer feeRatePercent,
            Long feeAmount,
            Long refundAmount,
            String currency,
            Money.Display display,
            String feeStage,
            OffsetDateTime fullRefundUntil,
            OffsetDateTime cancelDeadlineAt,
            String refundTarget,
            String refundWalletAddress,
            Long walletBalanceAfter,
            String refundNotice
    ) {}

    /**
     * {@code POST /api/v1/tickets/{ticketId}/cancel} — 개별 취소·환불(API-refund-02).
     * 권한 소유자. 202 + 폴링.
     *
     * <p>{@code expectedRefundAmount}는 <b>미리보기에서 본 금액</b>이다. 서버 재계산과 다르면
     * <b>{@code COMMON_VALIDATION_FAILED}(400)</b>으로 막는다(openapi refund_02 400) — 사용자가
     * 본 금액과 다른 금액이 환불되면 안 되고, 그 사이 수수료 구간이 바뀌었을 수 있다.
     * 종전 주석의 {@code PAYMENT_AMOUNT_MISMATCH}(409)는 낡은 기술이었다.
     */
    public record CancelTicketRequest(
            @NotNull @Min(0) Long expectedRefundAmount,
            String reason
    ) {}

    public record CancelTicketResponse(
            String jobId,
            String status,
            String signerType,
            Integer pollAfterMs,
            Long ticketId,
            Long refundId,
            Long refundAmount,
            Long feeAmount,
            String currency,
            Money.Display display,
            String refundTarget,
            String refundWalletAddress
    ) {}
}
