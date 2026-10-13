package com.ssafy.b204.ticket.repository;

import com.ssafy.b204.ticket.entity.TicketOrder;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TicketOrderRepository extends JpaRepository<TicketOrder, Long> {

    /** API-ticket-02 내 주문 목록. 그룹으로 묶어 내보내므로 하위 주문을 전부 읽는다. */
    List<TicketOrder> findByMember_MemberId(Long memberId, Sort sort);

    /** 추천 피처 {@code past_orders} — 회원의 과거 PAID 주문 수(설계 §4.3). */
    long countByMember_MemberIdAndStatus(Long memberId, TicketOrder.Status status);

    /**
     * API-ticket-02·03 — 주문 그룹의 하위 주문 전부(대표 포함). 오름차순이 곧 생성 순서이고
     * {@code APPROVE} job 귀속·서명 순서도 이 순서를 쓴다.
     */
    List<TicketOrder> findByOrderGroupIdOrderByTicketOrderIdAsc(Long orderGroupId);

    /**
     * {@code TICKET_PURCHASE_LIMIT_EXCEEDED} 판정 — 1인 1공연 누적 매수(P-6, 4매).
     *
     * <p>취소·환불된 주문은 세지 않는다("취소분 제외"). 결제 대기 중인 주문은 <b>센다</b> —
     * 15분 안에 결제되면 실제 보유가 되므로, 세지 않으면 대기 주문을 여러 개 만들어 한도를 넘길 수
     * 있다.
     *
     * <p><b>단, 결제 시한이 지난 대기 주문은 세지 않는다(2026-09-26).</b> 만료 스윕(60초 주기)이
     * 아직 줍지 않았을 뿐 결제될 수 없는 주문이다 — 세면 사용자가 스윕을 기다려야 다시 산다.
     * {@code now}는 {@code TimeSupport.nowStored()}(저장 기준 KST)여야 한다. 경계({@code >=})는
     * {@code TicketOrder.isPaymentExpired}(시한 &lt; now 가 만료)와 맞춘다.
     */
    @Query("""
            select coalesce(sum(o.totalQuantity), 0) from TicketOrder o
            where o.member.memberId = :memberId
              and o.performance.performanceId = :performanceId
              and (o.status = :paid
                   or (o.status = :pending and o.paymentExpiresAt >= :now))
            """)
    long sumQuantity(@Param("memberId") Long memberId,
                     @Param("performanceId") Long performanceId,
                     @Param("paid") TicketOrder.Status paid,
                     @Param("pending") TicketOrder.Status pending,
                     @Param("now") LocalDateTime now);

    Optional<TicketOrder> findByOrderRef(String orderRef);

    /** 결제 만료 스윕 — 재고를 원복할 대상. */
    List<TicketOrder> findByStatusAndPaymentExpiresAtBefore(TicketOrder.Status status,
                                                            LocalDateTime before);

    /**
     * 만료 스윕 배치가 집을 주문 id. 오래된 것부터, 한 주기에 {@code pageable}만큼만 본다 —
     * 밀린 주문이 수만 건이어도 한 번에 다 들지 않는다.
     */
    @Query("""
            select o.ticketOrderId from TicketOrder o
            where o.status = :status and o.paymentExpiresAt < :before
            order by o.paymentExpiresAt asc
            """)
    List<Long> findExpiredIds(@Param("status") TicketOrder.Status status,
                              @Param("before") LocalDateTime before,
                              Pageable pageable);

    /**
     * 만료 취소를 <b>조건부</b>로 건다 — {@code PENDING_PAYMENT}일 때만 바뀐다.
     *
     * <p>조회 시점 lazy 만료와 스윕 배치가, 또 여러 인스턴스의 배치가 같은 주문을 동시에 만료시킬
     * 수 있다. 각자 재고를 되돌리면 <b>없던 표가 생긴다</b>(초과 판매 — REL-01). 전이를 DB 행
     * 잠금 하나로 직렬화하고, {@code 1}을 받은 쪽만 재고를 반납한다. 이미 {@code PAID}가 된 주문을
     * 취소로 덮는 사고도 같은 조건이 막는다.
     *
     * @return 이 호출이 전이시킨 행 수(0 또는 1)
     */
    @Modifying(flushAutomatically = true)
    @Query("""
            update TicketOrder o set o.status = :to
            where o.ticketOrderId = :orderId and o.status = :from
            """)
    int cancelIfPending(@Param("orderId") Long orderId,
                        @Param("from") TicketOrder.Status from,
                        @Param("to") TicketOrder.Status to);

    /**
     * 정산 집계 입력 — 공연별 결제 완료 주문. 관람 목적 팀 선택 집계의 원천이며
     * 온체인 카운터와 대조한다.
     */
    List<TicketOrder> findByPerformance_PerformanceIdAndStatus(Long performanceId,
                                                               TicketOrder.Status status);

    /**
     * 공연 취소 일괄 환불 대상 — API-performance-12.
     *
     * <p>{@code REFUNDED}까지 함께 본다. 50% 환불로 <b>에스크로에 남은 수수료</b>가 있는 주문이
     * 그 상태이고, 그것까지 되돌려야 {@code escrow == 0}이 되어 보증금 반환이 가능해진다.
     */
    List<TicketOrder> findByPerformance_PerformanceIdAndStatusIn(Long performanceId,
                                                                  List<TicketOrder.Status> statuses);
}
