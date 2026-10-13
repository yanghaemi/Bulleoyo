package com.ssafy.b204.recommendation.repository;

import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.ticket.entity.TicketOrder;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 추천 후보 조회 — API-recommendation-01 전용.
 *
 * <p>{@code Performance}를 다루지만 {@code PerformanceRepository}에 두지 않았다. 이 쿼리는
 * "이 회원에게 아직 팔리지 않은 판매 중 공연"이라는 추천 도메인의 질문이고, 조건에
 * {@code ticket_order}가 섞여 있어 공연 도메인의 어휘가 아니다.
 */
public interface RecommendationCandidateRepository extends JpaRepository<Performance, Long> {

    /**
     * 후보 = {@code ON_SALE} 공연 − 이 회원이 {@code PAID}로 산 공연(설계 §7.1).
     *
     * <p>이미 표를 산 공연을 다시 권하지 않는다. 정렬은 공연일 오름차순 — 폴백이 그대로 쓰는
     * 순서이고, 겹침 정렬도 이 순서를 안정적으로 유지한 채 위로 끌어올리기만 하면 된다.
     *
     * <p>시작 시각이 지난 공연은 {@code ON_SALE}로 남아 있어도 뺀다. 상태 전이는 스케줄러가
     * 하므로 그 사이 틈에 끝난 공연이 폴백 1순위로 뜰 수 있고, 로그 피처 {@code days_until}이
     * 음수로 쌓인다(!192 리뷰).
     *
     * <p>{@code creatorTeam}을 함께 가져온다. 공연 장르의 한 축이라 후보마다 lazy 로딩이 걸리면
     * 후보 수만큼 쿼리가 늘어난다.
     */
    @Query("""
            select p from Performance p
            join fetch p.creatorTeam
            where p.status = :onSale
              and p.performanceAt > :now
              and not exists (
                   select 1 from TicketOrder o
                    where o.performance = p
                      and o.member.memberId = :memberId
                      and o.status = :paid
              )
            order by p.performanceAt asc
            """)
    List<Performance> findCandidates(@Param("onSale") Performance.Status onSale,
                                     @Param("memberId") Long memberId,
                                     @Param("paid") TicketOrder.Status paid,
                                     @Param("now") LocalDateTime now);
}
