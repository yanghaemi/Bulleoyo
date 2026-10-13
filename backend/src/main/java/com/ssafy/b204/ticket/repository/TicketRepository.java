package com.ssafy.b204.ticket.repository;

import com.ssafy.b204.ticket.entity.Ticket;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TicketRepository extends JpaRepository<Ticket, Long> {

    /** API-ticket-04 내 티켓 목록. */
    Page<Ticket> findByMember_MemberId(Long memberId, Pageable pageable);

    Page<Ticket> findByMember_MemberIdAndStatus(Long memberId, Ticket.Status status,
                                                 Pageable pageable);

    List<Ticket> findByTicketOrder_TicketOrderId(Long ticketOrderId);

    /** API-entry-02 입장 현황·이력. */
    Page<Ticket> findByPerformance_PerformanceId(Long performanceId, Pageable pageable);

    /** 정산 집계 — 유효 티켓 수({@code ISSUED} + {@code USED}, 취소 제외). */
    long countByPerformance_PerformanceIdAndStatusIn(Long performanceId,
                                                      List<Ticket.Status> statuses);

    /** 입장 현황 — 입장 완료 수. */
    long countByPerformance_PerformanceIdAndStatus(Long performanceId, Ticket.Status status);

    /** 공연 취소 일괄 환불 대상 — API-performance-12. */
    List<Ticket> findByPerformance_PerformanceIdAndStatusIn(Long performanceId,
                                                             List<Ticket.Status> statuses);
}
