package com.ssafy.b204.payment.entity;

import com.ssafy.b204.common.support.TimeSupport;
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
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

/**
 * 코인 결제 — ERD v5 {@code payment}. 주문 1:1(UNIQUE).
 *
 * <p><b>결제는 지갑 YoYo 잔액 결제 하나뿐이다</b>(v5 변경). 법정화폐 입출구가 없는 세계라
 * 충전({@code charge}) 도메인이 삭제됐고, 잔액이 모자라면 자동 충전 분기 없이 409 안내로 끝난다
 * ({@code COMMON_CONFLICT} — 전용 코드 {@code PAYMENT_INSUFFICIENT_BALANCE} 재정의는 §16.1 제안).
 *
 * <p><b>사용자 지갑이 서명한다.</b> 서버는 사용자 키가 없으므로 §0.4 3단계를 탄다 —
 * {@code POST /payment}(API-payment-01)가 {@code signRequests}를 내려주고, 프론트가 발신자 서명을
 * 만들고, {@code POST /payment/signed-tx}(API-payment-03)로 보고하면 서버(fee payer)가 대납 서명해
 * 전송한다. tx는 {@code approve} + {@code purchase} 2건이고 {@code approve}는 생략될 수 있다
 * (기존 allowance가 충분한 경우) — 그래서 {@code approve_chain_job_id}가 nullable이다.
 *
 * <p>{@code chain_job}을 2번 참조하므로 FK 물리명에 역할을 접두했다({@code _approve}/{@code _purchase}).
 *
 * <p>확정은 <b>receipt의 이벤트 파싱</b>으로 판정한다. {@code status}만 보면 revert되지 않았을 뿐
 * 우리가 기대한 이벤트가 아닌 tx도 성공으로 읽힌다.
 */
@Entity
@Table(name = "payment")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Payment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "payment_id")
    private Long paymentId;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ticket_order_id", nullable = false, unique = true)
    private TicketOrder ticketOrder;

    /** 결제 서명 지갑 = 구매자 지갑. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "payer_wallet_id", nullable = false)
    private Wallet payerWallet;

    @Column(name = "amount", nullable = false)
    private Long amount;

    /** {@code APPROVE}, {@code USER} 서명. allowance가 충분하면 생략된다. */
    @Column(name = "approve_chain_job_id")
    private Long approveChainJobId;

    /** {@code PURCHASE}, {@code USER} 서명. 이것이 실제 결제다. */
    @Column(name = "purchase_chain_job_id")
    private Long purchaseChainJobId;

    @Column(name = "purchase_tx_hash", length = 66, columnDefinition = "CHAR(66)")
    private String purchaseTxHash;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status;

    /** 실패 코드. 규격 §3의 code 문자열을 그대로 넣는다. */
    @Column(name = "failure_code", length = 100)
    private String failureCode;

    /** 멱등키(§0.8). 같은 키·다른 본문은 {@code COMMON_CONFLICT}. */
    @Column(name = "idempotency_key", nullable = false, length = 255, unique = true)
    private String idempotencyKey;

    @CreationTimestamp
    @Column(name = "requested_at", nullable = false, updatable = false)
    private LocalDateTime requestedAt;

    @Column(name = "paid_at")
    private LocalDateTime paidAt;

    @Builder
    private Payment(TicketOrder ticketOrder, Wallet payerWallet, Long amount,
                    String idempotencyKey) {
        this.ticketOrder = ticketOrder;
        this.payerWallet = payerWallet;
        this.amount = amount;
        this.idempotencyKey = idempotencyKey;
        this.status = Status.REQUESTED;
    }

    /** {@code signRequests}를 내려준 뒤 — 사용자 서명 대기. */
    public void markAwaitingSignature(Long approveChainJobId, Long purchaseChainJobId) {
        this.status = Status.AWAITING_SIGNATURE;
        this.approveChainJobId = approveChainJobId;
        this.purchaseChainJobId = purchaseChainJobId;
    }

    /** 발신자 서명 RLP를 받아 대납 전송한 뒤 — receipt 대기. */
    public void markPaying() {
        this.status = Status.PAYING;
    }

    /**
     * receipt 이벤트 검증까지 끝난 뒤에만 호출한다.
     *
     * <p><b>결제 전 상태에서만 전이한다.</b> {@code REFUNDED}를 {@code PAID}로 되돌리면 이미
     * 돌려준 돈이 장부에서 다시 받은 돈이 되고, 이미 {@code PAID}인 건에 다시 쓰면
     * {@code paid_at}·{@code purchase_tx_hash}가 나중 tx로 덮여 최초 결제 tx를 잃는다. 늦게 온
     * receipt는 호출자가 {@link #isPaid()}로 갈라야 한다.
     *
     * @throws IllegalStateException {@code PAID}·{@code REFUNDED}에서 호출했을 때
     */
    public void markPaid(String purchaseTxHash) {
        if (status == Status.PAID || status == Status.REFUNDED) {
            throw new IllegalStateException(
                    "결제 확정은 결제 전 상태에서만 가능하다 — 현재 " + status);
        }
        this.status = Status.PAID;
        this.purchaseTxHash = purchaseTxHash;
        this.paidAt = TimeSupport.nowStored();
    }

    public void markFailed(String failureCode) {
        this.status = Status.FAILED;
        this.failureCode = failureCode;
    }

    public void markRefunded() {
        this.status = Status.REFUNDED;
    }

    public boolean isPaid() {
        return status == Status.PAID;
    }

    /** 결제 상태 6값. */
    public enum Status {
        REQUESTED, AWAITING_SIGNATURE, PAYING, PAID, FAILED, REFUNDED
    }
}
