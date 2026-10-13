package com.ssafy.b204.payment.repository;

import com.ssafy.b204.payment.entity.Payment;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentRepository extends JpaRepository<Payment, Long> {

    /** 주문 1:1(UNIQUE). API-payment-02 결제 상태 조회. */
    Optional<Payment> findByTicketOrder_TicketOrderId(Long ticketOrderId);

    /** 주문 그룹의 하위 주문 결제를 한 번에 읽는다(API-ticket-02·03 · API-payment-02). */
    List<Payment> findByTicketOrder_TicketOrderIdIn(Collection<Long> ticketOrderIds);

    /** 멱등키 재요청 — 같은 키로 다시 들어오면 기존 결과를 그대로 돌려준다(§0.8). */
    Optional<Payment> findByIdempotencyKey(String idempotencyKey);

    boolean existsByTicketOrder_TicketOrderId(Long ticketOrderId);

    /**
     * receipt 확정 시 역참조 — {@code chain_job} 하나가 어느 결제의 {@code purchase}인지 찾는다.
     * {@code payment}가 {@code chain_job}을 2번 참조하므로 역방향 조회도 역할별로 나뉜다.
     */
    Optional<Payment> findByPurchaseChainJobId(Long purchaseChainJobId);

    Optional<Payment> findByApproveChainJobId(Long approveChainJobId);
}
