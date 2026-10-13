package com.ssafy.b204.wallet.repository;

import com.ssafy.b204.performance.entity.Performance;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * 지갑 이력이 공연 테이블에서 읽는 <b>단 한 가지</b> — 보증금 반환 수령.
 *
 * <p>{@code RELEASE}와 같은 이유로 {@code chain_job}에 걸리지 않는다. {@code DEPOSIT_RETURN}
 * job은 {@code SettlementJobEnqueuer}가 {@code walletId = null}로 넣는 운영자 tx다
 * ({@code SettlementConfirmationService#applyRelease} ·
 * {@code ChainJobConfirmationService}의 취소 공연 스윕 — 둘 다 5-인자 오버로드를 쓴다).
 * 수령자는 온체인 {@code returnDeposit}이 보내는 <b>공연 생성 팀 리더 지갑</b> 하나뿐이고,
 * 서버가 그 주소를 아는 곳이 {@code performance_participant.wallet_address} 스냅숏이다.
 *
 * <p>공연 엔티티를 바꾸지 않고 <b>좁은 조회 하나</b>만 여는 것은 settlement 도메인의
 * {@code SettlementPerformanceRepository}와 같은 선례다 — {@code Performance}는 performance
 * 도메인(양해미) 소유라 남의 엔티티·리포지토리에 메서드를 더하지 않는다.
 */
public interface WalletDepositReturnRepository extends Repository<Performance, Long> {

    /**
     * 이 주소가 <b>주최팀 리더 지갑</b>으로 등록된 공연 중 보증금 반환이 확정된 것.
     *
     * <p>{@code deposit_return_tx_hash}가 채워진 행만 본다 — 반환 tx가 확정될 때
     * {@code markDepositReturned}가 상태·해시·시각을 함께 쓰므로, 해시가 없으면 아직 이력으로
     * 보여줄 사실이 없다.
     *
     * @param status 언제나 {@code RETURNED}. enum 리터럴을 JPQL에 박지 않는다
     */
    @Query("""
            select p from PerformanceParticipant pp
              join pp.performance p
             where pp.team = p.creatorTeam
               and pp.walletAddress is not null
               and lower(pp.walletAddress) = lower(:address)
               and p.depositStatus = :status
               and p.depositReturnTxHash is not null
            """)
    List<Performance> findReturnedDepositsByHostWallet(
            @Param("address") String address,
            @Param("status") Performance.DepositStatus status);
}
