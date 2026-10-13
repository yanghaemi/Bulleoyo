package com.ssafy.b204.performance.repository;

import com.ssafy.b204.performance.entity.PerformanceParticipant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PerformanceParticipantRepository
        extends JpaRepository<PerformanceParticipant, Long> {

    List<PerformanceParticipant> findByPerformance_PerformanceId(Long performanceId);

    /** 정산·규칙 동의 대상은 {@code REGISTERED}만이다. 제외된 팀은 세지 않는다. */
    List<PerformanceParticipant> findByPerformance_PerformanceIdAndStatus(
            Long performanceId, PerformanceParticipant.Status status);

    Optional<PerformanceParticipant> findByPerformance_PerformanceIdAndTeam_TeamId(
            Long performanceId, Long teamId);

    boolean existsByPerformance_PerformanceIdAndTeam_TeamId(Long performanceId, Long teamId);

    /**
     * 여러 공연의 참여팀을 한 번에. 추천(API-recommendation-01)이 후보 수십 건의 장르 합집합을
     * 만들 때 쓴다 — 공연마다 따로 부르면 쿼리가 후보 수만큼 늘어난다.
     */
    @Query("""
            select pp from PerformanceParticipant pp
            join fetch pp.team
            where pp.performance.performanceId in :performanceIds
              and pp.status = :status
            """)
    List<PerformanceParticipant> findWithTeamByPerformanceIdsAndStatus(
            @Param("performanceIds") List<Long> performanceIds,
            @Param("status") PerformanceParticipant.Status status);

    /** 공연 삭제(API-performance-18) — FK가 RESTRICT라 부모보다 먼저 지운다. */
    void deleteByPerformance_PerformanceId(Long performanceId);

    /** {@code TEAM_MIN_COUNT_NOT_MET} 검사 — 공동 공연은 2팀 이상이어야 판매를 시작할 수 있다. */
    long countByPerformance_PerformanceIdAndStatus(Long performanceId,
                                                   PerformanceParticipant.Status status);
}
