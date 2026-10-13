package com.ssafy.b204.refund.repository;

import com.ssafy.b204.refund.entity.Refund;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RefundRepository extends JpaRepository<Refund, Long> {

    /**
     * {@code REFUND_ALREADY_REQUESTED} 검사 — <b>상태를 본다.</b>
     *
     * <p>{@code exists}(상태 무관)로 막던 동안은 전송 전에 실패한 환불이 그 표를 영구히 잠갔다
     * (2026-09-17 리허설, S15P21B204-147). {@code FAILED} 만 남은 표는 다시 요청할 수 있어야 한다 —
     * 돈은 움직이지 않았고 온체인 흔적도 없다.
     */
    boolean existsByTicket_TicketIdAndStatusIn(Long ticketId,
                                               Collection<Refund.Status> statuses);

    Optional<Refund> findByIdempotencyKey(String idempotencyKey);

    /**
     * 워커가 {@code REFUND} chain_job의 인자(orderRef·refundAmount)를 되찾는 경로.
     *
     * <p><b>{@code ticketOrder}를 함께 읽는다.</b> 워커 스레드에는 영속성 세션이 없어 LAZY 프록시로
     * 두면 {@code getOrderRef()}가 {@code LazyInitializationException}으로 터진다(2026-09-17 dev).
     */
    @EntityGraph(attributePaths = "ticketOrder")
    Optional<Refund> findByChainJobId(Long chainJobId);

    /**
     * 재시도 대기 스윕 — OPERATOR job은 최대 3회 자동 재시도(REL-09).
     *
     * <p>{@code RefundScheduler} 의 자가 치유 스윕도 이 finder 로 {@code PROCESSING} 을 훑는다.
     */
    List<Refund> findByStatus(Refund.Status status);

    /**
     * 그 주문에 이미 잡힌 환불 합 — 온체인 {@code p.refundedAmount}의 서버 측 대응값.
     *
     * <p>{@code FAILED}만 뺀다. {@code PENDING}·{@code PROCESSING}은 아직 확정되지 않았지만
     * <b>곧 나갈 돈</b>이라 빼고 세면 공연 취소가 남은 금액을 과다 계산해
     * {@code RefundExceedsPurchase}로 revert한다. 적게 잡으면 에스크로에 잔액이 남을 뿐이다 —
     * 안전한 방향이다.
     */
    @Query("""
            select coalesce(sum(r.refundAmount), 0)
            from Refund r
            where r.ticketOrder.ticketOrderId = :orderId
              and r.status <> :excluded
            """)
    long sumRefundedByOrder(@Param("orderId") Long orderId,
                            @Param("excluded") Refund.Status excluded);

    /**
     * 아직 온체인에 나가지 않은 환불 건수 — 공연 취소의 <b>보증금 반환 시점</b> 판정.
     *
     * <p>{@code returnDeposit}은 {@code escrow == 0}을 요구하므로(2026-09-07 M-04) 이 값이
     * 0이 된 순간이 유일한 기회다.
     */
    @Query("""
            select count(r)
            from Refund r
            where r.ticketOrder.performance.performanceId = :performanceId
              and r.status in :statuses
            """)
    long countByPerformanceAndStatusIn(@Param("performanceId") Long performanceId,
                                       @Param("statuses") Collection<Refund.Status> statuses);
}
