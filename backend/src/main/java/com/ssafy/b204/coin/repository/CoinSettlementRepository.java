package com.ssafy.b204.coin.repository;

import com.ssafy.b204.settlement.entity.Settlement;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * 불변식 3(공연별 {@code Σ Released = 잠긴 규칙 × 카운터})이 읽을 정산 데이터 — <b>조회 전용</b>.
 *
 * <p>{@code settlement} 도메인(같은 소유자, {@code feat/be/settlement})의 리포지토리를 그대로
 * 주입하지 않고 coin에 조회 전용 인터페이스를 하나 더 두는 이유는
 * {@link CoinPerformanceRepository}·{@link CoinChainJobRepository}와 같다 — <b>남의 도메인
 * 리포지토리에 공시용 쿼리를 얹지 않는다.</b> {@code Repository} 마커 인터페이스를 상속하므로
 * 저장·삭제 메서드가 아예 노출되지 않는다(공시가 정산을 고칠 수 없음이 타입으로 보장된다).
 *
 * <p>엔티티가 아니라 <b>스칼라 projection</b>으로 받는다. 공시는 트랜잭션 밖에서 1분마다 도는
 * 계산이라 지연 로딩 프록시를 들고 나오면 {@code LazyInitializationException}이 나기 쉽고,
 * 정산 하나당 팀 수만큼 추가 쿼리가 붙는다.
 */
public interface CoinSettlementRepository extends Repository<Settlement, Long> {

    /**
     * 재계산 대상 정산 — 상태로 고른다.
     *
     * <p>{@code total_revenue}는 집계 확정 시점에 온체인 {@code escrowOf}로 채워진 <b>R</b>이다.
     * {@code on_chain_id}는 컨트랙트의 {@code showId}로, 온체인 카운터를 읽을 때 쓴다.
     *
     * @return {@code [settlementId, performanceId, onChainId, totalRevenue, creatorTeamId]} 행
     */
    @Query("""
            select s.settlementId, p.performanceId, p.onChainId, s.totalRevenue, ct.teamId
              from Settlement s
              join s.performance p
              join p.creatorTeam ct
             where s.status = :status
             order by s.settlementId asc
            """)
    List<Object[]> findByStatus(@Param("status") Settlement.Status status);

    /**
     * 저장된 팀별 분배 내역 — <b>실제로 release된 금액</b>이자, 체인을 못 읽을 때의 카운터 출처.
     *
     * @return {@code [teamId, totalAmount, choiceCount]} 행
     */
    @Query("""
            select sh.team.teamId, sh.totalAmount, sh.choiceCount
              from SettlementShare sh
             where sh.settlement.settlementId = :settlementId
            """)
    List<Object[]> findShares(@Param("settlementId") Long settlementId);
}
