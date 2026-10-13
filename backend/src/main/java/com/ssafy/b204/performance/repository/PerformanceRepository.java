package com.ssafy.b204.performance.repository;

import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.entity.PerformanceParticipant;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PerformanceRepository extends JpaRepository<Performance, Long> {

    /** API-performance-02 공개 목록 — 판매 중·마감만 노출한다. {@code DRAFT}는 공개하지 않는다. */
    Page<Performance> findByStatusIn(List<Performance.Status> statuses, Pageable pageable);

    /**
     * API-performance-02 검색 — 제목·<b>참여팀명</b> 부분 일치 + 공연일 범위.
     *
     * <p>참여팀명까지 훑는 것이 명세다("제목·참여팀명 부분 일치"). 팀명 조건을 빼면 관객이
     * 밴드 이름으로 공연을 찾지 못한다.
     *
     * <p>{@code null} 파라미터는 조건을 끄는 뜻이다 — 동적 쿼리를 만들지 않고 하나로 유지한다.
     */
    @Query("""
            select distinct p from Performance p
            where p.status in :statuses
              and (:from is null or p.performanceAt >= :from)
              and (:to is null or p.performanceAt <= :to)
              and (:keyword is null
                   or lower(p.title) like lower(concat('%', :keyword, '%'))
                   or exists (
                        select 1 from PerformanceParticipant pp
                        where pp.performance = p
                          and pp.status = :registered
                          and lower(pp.team.name) like lower(concat('%', :keyword, '%'))
                   ))
            """)
    Page<Performance> search(@Param("statuses") List<Performance.Status> statuses,
                             @Param("keyword") String keyword,
                             @Param("from") java.time.LocalDateTime from,
                             @Param("to") java.time.LocalDateTime to,
                             @Param("registered") PerformanceParticipant.Status registered,
                             Pageable pageable);

    /**
     * API-performance-06 내 팀 참여 공연 목록 — 생성 팀이거나 참여팀으로 등록된 공연.
     *
     * <p>중첩 enum은 JPQL 리터럴로 쓰지 않고 파라미터로 넘긴다 — 정규화된 이름을 문자열로 박으면
     * 클래스를 옮기는 순간 런타임에만 깨진다.
     *
     * <p>{@code status}가 {@code null}이면 조건을 끈다({@code DRAFT}~{@code CANCELLED} 전부).
     * {@link #search}와 같은 방식이다 — 동적 쿼리를 만들지 않는다.
     */
    @Query("""
            select distinct p from Performance p
            where (:status is null or p.status = :status)
              and (p.creatorTeam.teamId in :teamIds
                   or exists (
                        select 1 from PerformanceParticipant pp
                        where pp.performance = p
                          and pp.team.teamId in :teamIds
                          and pp.status = :registered
                   ))
            """)
    Page<Performance> findByParticipatingTeamIds(@Param("teamIds") List<Long> teamIds,
                                                 @Param("registered") PerformanceParticipant.Status registered,
                                                 @Param("status") Performance.Status status,
                                                 Pageable pageable);

    // ============================================================ 상태 자동 전이 스윕

    /**
     * 판매 마감 시각이 지난 {@code ON_SALE} 공연 — {@code SALE_CLOSED} 전이 대상.
     *
     * <p>{@code sale_close_at}이 {@code NULL}인 행은 SQL 비교에서 빠진다(마감 시각이 없으면
     * 마감을 판정할 근거가 없다). 전체 스캔을 하지 않도록 상태와 시각으로 함께 좁힌다.
     */
    /** 취소됐는데 보증금이 아직 남아 있는 공연 — 보증금 반환 스윕 대상(S15P21B204-140). */
    List<Performance> findByStatusAndDepositStatus(Performance.Status status,
                                                    Performance.DepositStatus depositStatus);

    List<Performance> findByStatusAndSaleCloseAtLessThanEqual(Performance.Status status,
                                                              LocalDateTime at);

    /**
     * 공연 시작 시각이 지난 {@code SALE_CLOSED} 공연 — {@code ENDED} 전이 <b>후보</b>.
     *
     * <p>전이 기준은 {@code entry_end_at} 또는
     * {@code performance_at + b204.entry.default-duration}에서 파생한다
     * ({@code EntryWindows.closesAt}). V6이 {@code performance.end_at}을 더했지만 그 컬럼은
     * V6 이전 행이 비어 있어 전이 기준을 아직 옮기지 않았다(백필 후 별도 작업). 파생값은 SQL로 비교할 수 없어
     * 여기서는 <b>아직 시작조차 하지 않은 공연</b>({@code performance_at > now})만 걸러 내고
     * 최종 판정은 서비스가 한다 — 종료 시각은 항상 시작 시각 이후다.
     */
    List<Performance> findByStatusAndPerformanceAtLessThanEqual(Performance.Status status,
                                                                LocalDateTime at);

    /**
     * 상태 전이를 <b>DB가 직렬화</b>한다 — {@code TicketOrderRepository.cancelIfPending}과 같은 방식.
     *
     * <p>스윕이 여러 인스턴스에서 동시에 돌 수 있고, 그 사이 공연 취소(API-performance-12)가
     * {@code CANCELLED}를 커밋할 수 있다. 엔티티에 값을 넣고 저장하면 읽은 뒤 바뀐 상태를
     * <b>덮어써</b> 취소·환불이 끝난 공연이 판매 흐름으로 되살아난다. 조건부 UPDATE는 쓰는
     * 순간 행 잠금으로 상태를 다시 확인하므로 그 사고가 나지 않는다 — 전이 가능 상태인지에 대한
     * 검사는 이 {@code where} 한 곳뿐이다.
     *
     * @return 이 호출이 전이시킨 행 수(0 또는 1)
     */
    @Modifying(flushAutomatically = true)
    @Query("""
            update Performance p set p.status = :to
            where p.performanceId = :performanceId and p.status = :from
            """)
    int transitionStatus(@Param("performanceId") Long performanceId,
                         @Param("from") Performance.Status from,
                         @Param("to") Performance.Status to);
}
