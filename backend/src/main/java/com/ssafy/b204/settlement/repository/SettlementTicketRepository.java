package com.ssafy.b204.settlement.repository;

import com.ssafy.b204.refund.entity.Refund;
import com.ssafy.b204.ticket.entity.Ticket;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 정산 대사용 티켓 집계 — <b>settlement 소유의 읽기 전용 리포지토리</b>.
 *
 * <p>{@code ticket.repository.TicketRepository}(양해미 소유)에 메서드를 더하지 않고 여기에 둔다.
 * 같은 엔티티를 다른 인터페이스로 읽는 것은 JPA에서 정상이고, 도메인 경계를 넘어 남의 리포지토리를
 * 고치는 것보다 낫다(coin 브랜치 {@code CoinChainJobRepository}와 같은 패턴).
 *
 * <h2>"유효 티켓"의 정의 — 컨트랙트와 같은 규칙이어야 한다</h2>
 *
 * <p>project-truth §2(A-2 확정 9/7): <b>환불 이력이 있는 주문의 티켓은 전부 제외한다.</b> "전액
 * 환불"이 아니라 "환불 이력"이 기준인 이유는 컨트랙트가 부분 환불에서도 표를 전량 차감하기
 * 때문이다({@code counterDelta = refundedAmount == 0 ? quantity : 0}). 반쪽 표는 없다. 서버가 다른
 * 규칙을 쓰면 {@code aggregate}가 {@code SETTLEMENT_AGGREGATE_MISMATCH}로 막힌다.
 *
 * <p>취소 수수료 잔액(50% 환불의 나머지)은 에스크로에 남아 R에 포함되지만 <b>표는 남지 않는다</b> —
 * 금액과 표가 갈라지는 유일한 지점이고, calcSpec 벡터 V3(T=0, R&gt;0)이 그 상태다.
 *
 * <h2>환불 status 를 반드시 함께 본다</h2>
 *
 * <p>제외 조건은 {@code refundAmount > 0}만으로는 부족하고 <b>{@code status = COMPLETED}</b>여야
 * 한다. {@link SettlementRefundRepository#sumCompletedRefund}가 금액을 그 조건으로 세기 때문이다.
 * 두 쿼리의 조건이 어긋나면 {@code FAILED} 환불 한 건이 <b>집계를 영구히 막는다</b> — 온체인은
 * 실패한 refund tx라 카운터가 그대로인데 서버만 그 주문의 표를 빼서, 대사가 사람이 DB를 손대기
 * 전까지 계속 "선택 수 불일치"를 낸다({@code PENDING}·{@code PROCESSING}은 집계 게이트가 미리
 * 막지만 {@code FAILED}는 통과시킨다).
 */
public interface SettlementTicketRepository extends JpaRepository<Ticket, Long> {

    /**
     * 팀별 유효 티켓 수 — 온체인 {@code choiceCountsOf}와 대조할 서버 측 값.
     *
     * @return {@code [teamId(Long), count(Long)]} 행 목록. 선택 팀이 없는 티켓은 빠진다
     */
    @Query("""
            select o.selectedTeam.teamId, count(t)
            from Ticket t
              join t.ticketOrder o
            where t.performance.performanceId = :performanceId
              and t.status in :ticketStatuses
              and o.selectedTeam is not null
              and not exists (
                  select 1 from Refund r
                  where r.ticketOrder = o
                    and r.refundAmount > 0
                    and r.status = :completed
              )
            group by o.selectedTeam.teamId
            """)
    List<Object[]> countValidTicketsByTeam(@Param("performanceId") Long performanceId,
                                           @Param("ticketStatuses") Collection<Ticket.Status> ticketStatuses,
                                           @Param("completed") Refund.Status completed);

    /** 총 매출 — 환불 여부와 무관하게 <b>팔린 금액 전부</b>. 응답의 {@code grossRevenueAmount}. */
    @Query("""
            select coalesce(sum(t.purchasePrice), 0)
            from Ticket t
            where t.performance.performanceId = :performanceId
            """)
    long sumGrossRevenue(@Param("performanceId") Long performanceId);
}
