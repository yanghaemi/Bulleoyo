package com.ssafy.b204.verify.repository;

import com.ssafy.b204.ticket.entity.TicketOrder;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 검증 화면 V-01의 <b>팀별 결제 건수</b> 집계 — verify 소유의 읽기 전용 리포지토리.
 *
 * <p>{@code ticket.repository.TicketOrderRepository}(양해미 소유)에 메서드를 더하지 않고 여기에
 * 둔다. 같은 엔티티를 다른 인터페이스로 읽는 것은 JPA에서 정상이고, 도메인 경계를 넘어 남의
 * 리포지토리를 고치는 것보다 낫다(settlement의 {@code SettlementTicketRepository}와 같은 패턴).
 *
 * <p><b>왜 서버 장부에서 세는가.</b> 이 수치는 컨트랙트 인터페이스 v1 §4.1(감사 M-10)이 요구한
 * 관측값이다. 온체인 원천은 {@code Purchased}·{@code Refunded} 이벤트지만, Kairos 공용 RPC는
 * {@code eth_getLogs}의 블록 범위를 제한해 공연 전 기간을 훑을 수 없다. 그래서 서버 장부
 * ({@code ticket_order}·{@code refund})로 세고, 같은 장부가 {@code aggregate} 대사를 통과했다는
 * 사실(= 온체인 카운터와 일치)이 이 수치의 신뢰 근거다.
 */
public interface VerifyOrderRepository extends JpaRepository<TicketOrder, Long> {

    /**
     * 팀별 결제 완료 주문 수.
     *
     * <p>{@code REFUNDED} 주문도 <b>결제는 일어났으므로</b> 포함한다 — "결제 건수 대비 환불 건수"를
     * 나란히 보는 것이 이 표시의 목적이라, 환불된 주문이 결제 쪽에서 사라지면 비율이 왜곡된다.
     *
     * @return {@code [teamId(Long), count(Long)]} 행 목록. 선택 팀이 없는 주문은 빠진다
     */
    @Query("""
            select o.selectedTeam.teamId, count(o)
            from TicketOrder o
            where o.performance.performanceId = :performanceId
              and o.status in :statuses
              and o.selectedTeam is not null
            group by o.selectedTeam.teamId
            """)
    List<Object[]> countPaidOrdersByTeam(@Param("performanceId") Long performanceId,
                                         @Param("statuses") Collection<TicketOrder.Status> statuses);
}
