package com.ssafy.b204.coin.repository;

import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.entity.PerformanceParticipant;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * 발행량 공시(API-coin-01)가 에스크로를 걷어올 공연 목록.
 *
 * <p>온체인에 등록된 공연({@code on_chain_id}가 곧 컨트랙트의 {@code showId})만 대상이다.
 * {@code on_chain_id}는 {@code CREATE_SHOW} 확정에서 채워지므로 이 값이 곧 "컨트랙트에 장부가
 * 있다"는 뜻이고, <b>공연 상태는 조건이 아니다</b> — 보증금은 공연이 {@code DRAFT}·
 * {@code PENDING_AGREEMENT}일 때 이미 온체인에 있다(D-71).
 *
 * <p>{@code performance} 패키지(양해미 소유)를 건드리지 않으려고 조회 전용 리포지토리를 coin에
 * 둔다 — {@code CoinChainJobRepository}와 같은 이유다.
 */
public interface CoinPerformanceRepository extends Repository<Performance, Long> {

    /** @return {@code [performanceId, onChainId]} 행 */
    @Query("""
            select p.performanceId, p.onChainId from Performance p
            where p.onChainId is not null
            order by p.performanceId asc
            """)
    List<Object[]> findOnChainShows();

    /**
     * 불변식 3 재계산이 쓸 참여팀 — 팀을 <b>함께 가져온다</b>.
     *
     * <p>{@code join fetch pp.team}이 필요한 이유: 공시 계산은 트랜잭션 밖에서 돌 수 있고
     * {@code SettlementTeams}가 {@code participant.getTeam().getTeamId()}를 읽는다. 지연 로딩에
     * 맡기면 세션이 없을 때 터지고, 있을 때는 팀 수만큼 쿼리가 더 나간다.
     *
     * <p>정렬은 PK로만 한다 — 온체인 배열 순서({@code on_chain_index})의 재현은
     * {@code SettlementTeams}가 맡는 일이고, 그 규칙이 두 곳에 있으면 갈라진다.
     */
    @Query("""
            select pp from PerformanceParticipant pp
              join fetch pp.team
             where pp.performance.performanceId = :performanceId and pp.status = :status
             order by pp.performanceParticipantId asc
            """)
    List<PerformanceParticipant> findParticipantsWithTeam(
            @Param("performanceId") Long performanceId,
            @Param("status") PerformanceParticipant.Status status);
}
