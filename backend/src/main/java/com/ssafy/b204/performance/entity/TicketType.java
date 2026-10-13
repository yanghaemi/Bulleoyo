package com.ssafy.b204.performance.entity;

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
 * 티켓 옵션 — ERD v5 {@code ticket_type}. API-performance-05가 잠금 전에 통째로 설정한다(PUT).
 *
 * <p>{@code sold_quantity}는 <b>결과 기록</b>이다. 동시 예매 경합의 실제 재고 차감은 Redis에서
 * 하고(밀리면 {@code TICKET_SOLD_OUT}), 이 컬럼은 결제 확정 시 반영한다. DB 카운터만으로 막으면
 * 행 락 경합이 예매 응답 시간을 지배한다.
 *
 * <p>가격은 YoYo 정수({@code BIGINT})다. 주문 시점 단가는 {@code order_item.unit_price}에,
 * 환불 기준가는 {@code ticket.purchase_price}에 스냅샷으로 남으므로 이 값을 나중에 바꿔도
 * 기존 주문·환불액이 흔들리지 않는다.
 */
@Entity
@Table(name = "ticket_type")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TicketType {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "ticket_type_id")
    private Long ticketTypeId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "performance_id", nullable = false)
    private Performance performance;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "price", nullable = false)
    private Long price;

    @Column(name = "total_quantity", nullable = false)
    private Integer totalQuantity;

    @Column(name = "sold_quantity", nullable = false)
    private Integer soldQuantity;

    @Builder
    private TicketType(Performance performance, String name, Long price, Integer totalQuantity) {
        this.performance = performance;
        this.name = name;
        this.price = price;
        this.totalQuantity = totalQuantity;
        this.soldQuantity = 0;
    }

    /**
     * API-performance-05는 {@code PUT}이라 통째로 교체한다. 이미 팔린 수량보다 적게 줄이는 것은
     * 호출부가 막는다 — 줄이면 발급된 티켓이 정원을 넘는다.
     */
    public void replace(String name, Long price, Integer totalQuantity) {
        this.name = name;
        this.price = price;
        this.totalQuantity = totalQuantity;
    }

    public int remainingQuantity() {
        return totalQuantity - soldQuantity;
    }

    /** 결제 확정 시 반영. 실제 경합 차단은 Redis 재고가 담당한다. */
    public void addSold(int quantity) {
        this.soldQuantity += quantity;
    }

    /** 취소·환불 시 원복. */
    public void restore(int quantity) {
        this.soldQuantity = Math.max(0, this.soldQuantity - quantity);
    }
}
