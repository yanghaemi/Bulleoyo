package com.ssafy.b204.ticket.entity;

import com.ssafy.b204.common.entity.BaseTimeEntity;
import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.team.entity.Team;
import jakarta.persistence.CascadeType;
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
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 주문 — ERD v5 {@code ticket_order}.
 *
 * <p>테이블명이 {@code order}가 아닌 이유는 {@code order}가 MySQL 예약어이기 때문이다(컨벤션 §4).
 * 다만 API 경로는 {@code /api/v1/orders}다.
 *
 * <p><b>{@code selected_team_id}가 정산의 입력값이다.</b> 공동 공연이면 예매 시 관람 목적 팀
 * 선택이 필수이고(미선택은 {@code TICKET_TEAM_CHOICE_REQUIRED}), 이 값이 온체인
 * {@code purchase} tx에 실려 컨트랙트 카운터에 기록된다. 서버 집계와 온체인 카운터가 어긋나면
 * {@code SETTLEMENT_AGGREGATE_MISMATCH}로 자동 정산을 멈춘다 — "위조하면 발각되는 구조"의 근거다.
 *
 * <p>{@code order_ref}는 온체인 주문 참조(0x + 64 hex)이며 UNIQUE다. receipt 검증에서
 * 이벤트의 {@code orderRef}와 대조한다.
 */
@Entity
@Table(name = "ticket_order")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TicketOrder extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "ticket_order_id")
    private Long ticketOrderId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "performance_id", nullable = false)
    private Performance performance;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    /**
     * 주문 그룹 대표(= 첫 하위 주문)의 {@code ticket_order_id}. <b>자기 자신을 가리킬 수 있다.</b>
     *
     * <p>PK 가 AUTO_INCREMENT 라 대표 주문은 INSERT 시점에 자기 id 를 모른다 — 그래서 컬럼이
     * NULL 허용이고, 대표 행은 저장 직후 {@link #assignOrderGroup}으로 자기 id 를 채운다.
     * "커밋된 행에 NULL 이 없다"는 DB 제약이 아니라 앱 불변식이다(ERD v5 §ticket_order).
     */
    @Column(name = "order_group_id")
    private Long orderGroupId;

    @Column(name = "order_ref", nullable = false, length = 66, unique = true,
            columnDefinition = "CHAR(66)")
    private String orderRef;

    @Column(name = "total_amount", nullable = false)
    private Long totalAmount;

    @Column(name = "total_quantity", nullable = false)
    private Integer totalQuantity;

    /**
     * 관람 목적 팀. 공동 공연에서는 필수, 단독 공연에서는 {@code null}이다.
     * <b>절대 사후에 바꾸지 않는다</b> — 정산 집계 결과가 달라진다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "selected_team_id")
    private Team selectedTeam;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status;

    /** 결제 만료 시각. 지나면 재고를 원복한다. */
    @Column(name = "payment_expires_at", nullable = false)
    private LocalDateTime paymentExpiresAt;

    @Column(name = "confirmed_at")
    private LocalDateTime confirmedAt;

    @OneToMany(mappedBy = "ticketOrder", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<OrderItem> items = new ArrayList<>();

    @Builder
    private TicketOrder(Performance performance, Member member, Long orderGroupId, String orderRef,
                        Long totalAmount, Integer totalQuantity, Team selectedTeam,
                        LocalDateTime paymentExpiresAt) {
        this.performance = performance;
        this.member = member;
        this.orderGroupId = orderGroupId;
        this.orderRef = orderRef;
        this.totalAmount = totalAmount;
        this.totalQuantity = totalQuantity;
        this.selectedTeam = selectedTeam;
        this.paymentExpiresAt = paymentExpiresAt;
        this.status = Status.PENDING_PAYMENT;
    }

    /**
     * {@code order_ref = keccak256(orderId)} — PK가 나온 뒤에야 계산할 수 있어 별도 setter 를 둔다.
     * {@code order_ref}가 NOT NULL 이라 저장 시점에는 임시 유일값이 들어가고 곧바로 덮인다.
     */
    public void assignOrderRef(String orderRef) {
        this.orderRef = orderRef;
    }

    /** 그룹의 첫 하위 주문(대표)이 저장된 뒤 자기 id 를 채운다. */
    public void assignOrderGroup(Long orderGroupId) {
        this.orderGroupId = orderGroupId;
    }

    /** 옛 주문(V10 이전)에 대비한 안전한 읽기 — 그룹이 없으면 자기 자신이 그룹이다. */
    public Long groupId() {
        return orderGroupId != null ? orderGroupId : ticketOrderId;
    }

    public void addItem(OrderItem item) {
        items.add(item);
        item.assignOrder(this);
    }

    public List<OrderItem> getItems() {
        return Collections.unmodifiableList(items);
    }

    /**
     * 결제 확정. 이 시점에 티켓을 발급한다.
     *
     * <p><b>{@code PENDING_PAYMENT}에서만 전이한다.</b> 가드가 없으면 15분 만료로
     * {@code CANCELLED}되고 <b>재고까지 회수된</b> 주문에 뒤늦게 도착한 receipt가 상태를
     * {@code PAID}로 덮어 티켓이 초과 발급된다 — 체인 지연에는 상한이 없어 이 창은 만료 시간을
     * 늘려도 사라지지 않는다. 온체인 사실(결제는 실제로 일어났다)은
     * {@code payment}·{@code chain_job}에 남기고, 티켓 발급은 하지 않는다
     * ({@code ChainJobConfirmationService.confirmPurchase} 참고).
     *
     * @throws IllegalStateException 결제 대기 상태가 아닐 때. 호출자가 먼저
     *                               {@link #isPendingPayment()}로 갈라야 한다
     */
    public void markPaid() {
        if (status != Status.PENDING_PAYMENT) {
            throw new IllegalStateException(
                    "결제 확정은 PENDING_PAYMENT 에서만 가능하다 — 현재 " + status);
        }
        this.status = Status.PAID;
        this.confirmedAt = TimeSupport.nowStored();
    }

    public boolean isPendingPayment() {
        return status == Status.PENDING_PAYMENT;
    }

    /** 결제 만료·사용자 이탈. */
    public void cancel() {
        this.status = Status.CANCELLED;
    }

    public void markRefunded() {
        this.status = Status.REFUNDED;
    }

    public boolean isPaymentExpired(LocalDateTime now) {
        return status == Status.PENDING_PAYMENT && paymentExpiresAt.isBefore(now);
    }

    public boolean isOwnedBy(Long memberId) {
        return member != null && member.getMemberId().equals(memberId);
    }

    public enum Status {
        PENDING_PAYMENT, PAID, CANCELLED, REFUNDED
    }
}
