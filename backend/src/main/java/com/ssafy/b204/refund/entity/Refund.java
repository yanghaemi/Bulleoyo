package com.ssafy.b204.refund.entity;

import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.payment.entity.Payment;
import com.ssafy.b204.ticket.entity.Ticket;
import com.ssafy.b204.ticket.entity.TicketOrder;
import com.ssafy.b204.wallet.entity.Wallet;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

/**
 * 환불 — ERD v5 {@code refund}. 에스크로 → 관객 지갑으로 YoYo를 되돌린다.
 *
 * <p>환불 tx는 <b>운영자(OPERATOR) 서명</b>이다({@code chain_job.signer_type = OPERATOR}) —
 * 에스크로에서 나가는 이체라 사용자 서명이 필요 없다. 그래서 §0.3의 202 + 폴링 규약을 탄다.
 *
 * <p>수수료 구간({@code fee_tier})은 D-7 이전 전액 / D-3 이전 50%다. 취소 마감 이후는
 * {@code REFUND_DEADLINE_PASSED}(409)이고, 정산이 잠긴 뒤는 온체인 회수가 불가하므로
 * {@code REFUND_AFTER_SETTLEMENT_LOCK}(409)로 오프체인 정책으로 넘긴다.
 *
 * <p>환불액은 {@code ticket.purchase_price} 스냅샷을 기준으로 산정한다 — 옵션 가격이 그 사이
 * 바뀌었더라도 실제로 낸 금액을 돌려줘야 한다.
 */
@Entity
@Table(name = "refund")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Refund {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "refund_id")
    private Long refundId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ticket_id", nullable = false)
    private Ticket ticket;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ticket_order_id", nullable = false)
    private TicketOrder ticketOrder;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "payment_id", nullable = false)
    private Payment payment;

    /** 환불 수령 지갑 = 티켓 소유자 지갑. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "receiver_wallet_id", nullable = false)
    private Wallet receiverWallet;

    @Enumerated(EnumType.STRING)
    @Column(name = "reason", nullable = false)
    private Reason reason;

    @Column(name = "original_amount", nullable = false)
    private Long originalAmount;

    @Column(name = "fee", nullable = false)
    private Long fee;

    @Column(name = "refund_amount", nullable = false)
    private Long refundAmount;

    @Enumerated(EnumType.STRING)
    @Column(name = "fee_tier")
    private FeeTier feeTier;

    /** {@code REFUND}, {@code OPERATOR} 서명 작업. */
    @Column(name = "chain_job_id")
    private Long chainJobId;

    @Column(name = "refund_tx_hash", length = 66, columnDefinition = "CHAR(66)")
    private String refundTxHash;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status;

    @Column(name = "retry_count", nullable = false)
    private Integer retryCount;

    @Column(name = "idempotency_key", nullable = false, length = 255, unique = true)
    private String idempotencyKey;

    @CreationTimestamp
    @Column(name = "requested_at", nullable = false, updatable = false)
    private LocalDateTime requestedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Builder
    private Refund(Ticket ticket, TicketOrder ticketOrder, Payment payment, Wallet receiverWallet,
                   Reason reason, Long originalAmount, Long fee, Long refundAmount,
                   FeeTier feeTier, String idempotencyKey) {
        this.ticket = ticket;
        this.ticketOrder = ticketOrder;
        this.payment = payment;
        this.receiverWallet = receiverWallet;
        this.reason = reason;
        this.originalAmount = originalAmount;
        this.fee = fee != null ? fee : 0L;
        this.refundAmount = refundAmount;
        this.feeTier = feeTier;
        this.idempotencyKey = idempotencyKey;
        this.status = Status.PENDING;
        this.retryCount = 0;
    }

    public void markProcessing(Long chainJobId) {
        this.status = Status.PROCESSING;
        this.chainJobId = chainJobId;
    }

    public void markCompleted(String refundTxHash) {
        this.status = Status.COMPLETED;
        this.refundTxHash = refundTxHash;
        this.completedAt = TimeSupport.nowStored();
    }

    /** 실패는 재시도 대기로 남긴다. OPERATOR job은 큐에서 최대 3회 자동 재시도(REL-09). */
    public void markFailed() {
        this.status = Status.FAILED;
        this.retryCount += 1;
    }

    public enum Reason {
        CUSTOMER_CANCEL, PERFORMANCE_CANCEL
    }

    /** D-7 이전 전액 / D-3 이전 50%. */
    public enum FeeTier {
        BEFORE_D7, BEFORE_D3
    }

    public enum Status {
        PENDING, PROCESSING, COMPLETED, FAILED
    }
}
