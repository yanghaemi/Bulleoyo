package com.ssafy.b204.ticket.entity;

import com.ssafy.b204.performance.entity.TicketType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 주문 항목 — ERD v5 {@code order_item}.
 *
 * <p>{@code unit_price}는 <b>구매 시점 단가 스냅샷</b>이다. v4 → v5 사이 ERD Cloud에서 유실됐다가
 * 2026-09-03에 복구된 컬럼이다. 티켓 옵션 가격({@code ticket_type.price})이 나중에 바뀌어도
 * 이미 들어온 주문 금액이 흔들리지 않게 하려고 둔다.
 *
 * <p>부모가 사라지면 의미가 없는 구성요소라 V1 FK가 유일하게 {@code ON DELETE CASCADE}인
 * 두 곳 중 하나다.
 */
@Entity
@Table(name = "order_item")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OrderItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "order_item_id")
    private Long orderItemId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ticket_order_id", nullable = false)
    private TicketOrder ticketOrder;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ticket_type_id", nullable = false)
    private TicketType ticketType;

    @Column(name = "quantity", nullable = false)
    private Integer quantity;

    /** 주문 시점 단가(YoYo). 옵션 가격 변경과 무관하게 보존된다. */
    @Column(name = "unit_price", nullable = false)
    private Long unitPrice;

    @Column(name = "subtotal", nullable = false)
    private Long subtotal;

    @Builder
    private OrderItem(TicketType ticketType, Integer quantity, Long unitPrice) {
        this.ticketType = ticketType;
        this.quantity = quantity;
        this.unitPrice = unitPrice;
        // 소계는 받지 않고 계산한다 — 클라이언트가 보낸 값을 신뢰하면
        // PAYMENT_AMOUNT_MISMATCH 검증이 무의미해진다.
        this.subtotal = unitPrice * quantity;
    }

    /** {@link TicketOrder#addItem} 에서만 호출한다(양방향 연결). */
    void assignOrder(TicketOrder ticketOrder) {
        this.ticketOrder = ticketOrder;
    }
}
