package com.ssafy.b204.ticket.repository;

import com.ssafy.b204.ticket.entity.OrderItem;
import com.ssafy.b204.ticket.entity.TicketOrder;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OrderItemRepository extends JpaRepository<OrderItem, Long> {

    List<OrderItem> findByTicketOrder_TicketOrderId(Long ticketOrderId);

    /**
     * 재고 기준값 — 공연의 티켓 종류별로 주어진 상태 주문이 잡고 있는 수량 합.
     * 행 = {@code [ticketTypeId(Long), quantity(Long)]}. 주문이 없는 종류는 행이 없다.
     */
    @Query("""
            select i.ticketType.ticketTypeId, sum(i.quantity) from OrderItem i
            where i.ticketOrder.performance.performanceId = :performanceId
              and i.ticketOrder.status = :status
            group by i.ticketType.ticketTypeId
            """)
    List<Object[]> sumQuantityByTicketType(@Param("performanceId") Long performanceId,
                                           @Param("status") TicketOrder.Status status);
}
