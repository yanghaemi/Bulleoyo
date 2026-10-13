package com.ssafy.b204.settlement.repository;

import com.ssafy.b204.refund.entity.Refund;
import java.util.Collection;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** 정산 대사용 환불 집계 — settlement 소유의 읽기 전용 리포지토리. */
public interface SettlementRefundRepository extends JpaRepository<Refund, Long> {

    /**
     * 환불 확정 합계. 응답의 {@code refundedAmount}이자 {@code netRevenue = gross − refunded}의 우변.
     *
     * <p>{@code COMPLETED}만 센다 — 진행 중 환불은 온체인 에스크로에서 아직 빠지지 않았고, 그 상태로
     * 집계를 확정하면 서버와 체인이 갈라진다. 그래서 {@link #countInFlight}가 집계를 먼저 막는다.
     */
    @Query("""
            select coalesce(sum(r.refundAmount), 0)
            from Refund r
            where r.ticket.performance.performanceId = :performanceId
              and r.status = :completed
            """)
    long sumCompletedRefund(@Param("performanceId") Long performanceId,
                            @Param("completed") Refund.Status completed);

    /** 진행 중 환불 건수. 0이 아니면 집계 확정을 막는다({@code COIN_MINT_PENDING}). */
    @Query("""
            select count(r)
            from Refund r
            where r.ticket.performance.performanceId = :performanceId
              and r.status in :statuses
            """)
    long countInFlight(@Param("performanceId") Long performanceId,
                       @Param("statuses") Collection<Refund.Status> statuses);
}
