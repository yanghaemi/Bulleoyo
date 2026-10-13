package com.ssafy.b204.verify.repository;

import com.ssafy.b204.refund.entity.Refund;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 검증 화면 V-01의 <b>팀별 환불 건수·환불 금액</b> 집계 — verify 소유의 읽기 전용 리포지토리.
 *
 * <h2>이 두 수치가 감사 M-10을 막는다</h2>
 *
 * <p>컨트랙트의 {@code refund}는 <b>금액과 무관하게</b> 첫 환불에서 그 주문의 표를 전량 뺀다
 * (A-2 확정 · {@code counterDelta = refundedAmount == 0 ? quantity : 0}). OPERATOR 키를 쥔 쪽이
 * 특정 팀 주문에만 1원씩 환불하면 그 팀 카운터가 통째로 0이 되고, 서버 대사도 같은 규칙을 쓰므로
 * {@code aggregate}는 <b>일치한 채로 통과한다.</b> 막는 것은 관측뿐이다 —
 * <b>환불 건수는 많은데 환불 금액이 작으면 그 자체가 신호다.</b>
 *
 * <h2>세는 단위가 티켓이 아니라 주문인 이유</h2>
 *
 * <p>표가 빠지는 단위가 주문이기 때문이다. 한 주문에 티켓이 여러 장이어도 카운터는 한 번에 빠지고,
 * 같은 주문을 두 번 환불해도({@code refund} 2회 — 개별 취소 50% → 공연 취소 잔액) 표는 첫 번째에서
 * 이미 빠져 있다. 그래서 {@code refundCount}는 <b>환불 이력이 있는 주문 수</b>다.
 * {@code refundedAmount}는 그와 달리 <b>돈의 합</b>이라 환불 행 전부를 더한다.
 */
public interface VerifyRefundRepository extends JpaRepository<Refund, Long> {

    /**
     * 팀별 환불 이력 주문 수·환불 금액 합.
     *
     * <p><b>{@code COMPLETED}만 센다.</b> {@code PENDING}·{@code PROCESSING}은 아직 온체인에 나가지
     * 않았고 {@code FAILED}는 나갔다가 실패해, 어느 쪽도 표와 돈을 움직이지 않았다. 확정되지 않은
     * 환불을 세면 화면이 "환불 건수 많음"이라는 <b>거짓 신호</b>를 낸다. settlement의 {@code sumCompletedRefund}·
     * {@code countValidTicketsByTeam}과 같은 조건이어야 세 수치가 같은 세계를 말한다.
     *
     * @return {@code [teamId(Long), 주문 수(Long), 환불 금액 합(Long)]} 행 목록
     */
    @Query("""
            select o.selectedTeam.teamId,
                   count(distinct o.ticketOrderId),
                   coalesce(sum(r.refundAmount), 0)
            from Refund r
              join r.ticketOrder o
            where o.performance.performanceId = :performanceId
              and r.status = :completed
              and r.refundAmount > 0
              and o.selectedTeam is not null
            group by o.selectedTeam.teamId
            """)
    List<Object[]> countRefundsByTeam(@Param("performanceId") Long performanceId,
                                      @Param("completed") Refund.Status completed);
}
