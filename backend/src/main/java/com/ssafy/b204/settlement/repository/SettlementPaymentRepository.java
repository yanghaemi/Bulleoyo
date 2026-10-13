package com.ssafy.b204.settlement.repository;

import com.ssafy.b204.payment.entity.Payment;
import com.ssafy.b204.ticket.entity.TicketOrder;
import java.util.Collection;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** 정산 게이트용 결제 조회 — settlement 소유의 읽기 전용 리포지토리. */
public interface SettlementPaymentRepository extends JpaRepository<Payment, Long> {

    /**
     * 집계를 막아야 하는 결제 건수. 0이 아니면 {@code COIN_MINT_PENDING}이다.
     *
     * <p>서명이 끝나지 않은 결제는 <b>온체인 카운터에 아직 반영되지 않았거나 곧 반영될</b>
     * 상태라, 그 상태로 카운터를 얼리면 관객이 산 표가 정산에서 사라진다. 다만 "곧 반영될"의
     * 조건이 상태마다 달라 <b>두 묶음</b>으로 센다.
     *
     * <h2>① {@code sentStatuses} — 주문이 죽어도 센다</h2>
     *
     * <p>{@code PAYING}은 대납 서명까지 붙여 <b>tx가 이미 체인으로 나간</b> 상태다. 그 tx는
     * 주문이 만료된 뒤에도 뒤늦게 채굴돼 카운터를 올릴 수 있다. {@code chain_job}의 진행 중
     * {@code PURCHASE} 검사가 보통 함께 막아 주지만 그것으로 충분하지 않다 —
     * {@code ChainJobWorker}가 유실로 판정해 job을 {@code CHAIN_TX_TIMEOUT}({@code FAILED})으로
     * 닫으면 in-flight 검사에서 빠지고, {@code ChainJobStateWriter.markFailed}는
     * {@code REFUND}·{@code AGREE}만 짝으로 닫아 {@code payment}는 {@code PAYING}으로 남는다.
     * 그러므로 {@code PAYING}이 있는 한 주문 상태와 무관하게 집계를 얼리지 않는다.
     *
     * <h2>② {@code unsignedStatuses} — 살아 있는 주문의 것만 센다</h2>
     *
     * <p>{@code REQUESTED}·{@code AWAITING_SIGNATURE}는 <b>체인에 아무것도 나가지 않은</b>
     * 상태다. 주문이 {@code CANCELLED}/{@code PAID}로 끝났으면 그 결제는 더는 카운터를 바꿀 수
     * 없다. 관객이 결제를 시작만 하고 서명하지 않으면 주문은 15분 뒤 만료되는데, 예전에는
     * {@code payment} 행이 {@code AWAITING_SIGNATURE}로 남아 <b>그 공연의 집계를 영구히
     * 막았다</b>(D-83 — 9/22 dev 공연 46). 그래서 아직 결제될 수 있는 주문
     * ({@code PENDING_PAYMENT})의 것만 남긴다.
     *
     * @param sentStatuses     주문 상태를 보지 않고 세는 결제 상태 = {@code PAYING}
     * @param unsignedStatuses {@code liveOrderStatus}인 주문에만 걸리는 결제 상태
     * @param liveOrderStatus  살아 있는 주문 상태 = {@link TicketOrder.Status#PENDING_PAYMENT}
     */
    @Query("""
            select count(p)
            from Payment p
            where p.ticketOrder.performance.performanceId = :performanceId
              and (p.status in :sentStatuses
                   or (p.status in :unsignedStatuses
                       and p.ticketOrder.status = :liveOrderStatus))
            """)
    long countInFlight(@Param("performanceId") Long performanceId,
                       @Param("sentStatuses") Collection<Payment.Status> sentStatuses,
                       @Param("unsignedStatuses") Collection<Payment.Status> unsignedStatuses,
                       @Param("liveOrderStatus") TicketOrder.Status liveOrderStatus);
}
