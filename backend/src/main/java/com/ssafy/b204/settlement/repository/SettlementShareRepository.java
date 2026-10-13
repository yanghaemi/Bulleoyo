package com.ssafy.b204.settlement.repository;

import com.ssafy.b204.settlement.entity.SettlementShare;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SettlementShareRepository extends JpaRepository<SettlementShare, Long> {

    List<SettlementShare> findBySettlement_SettlementId(Long settlementId);

    /**
     * 이 지갑이 <b>수령한</b> 분배 — API-wallet-02의 {@code RELEASE} 행 원본.
     *
     * <p>{@code chain_job}으로는 찾을 수 없다. {@code RELEASE} job은 정산 하나에 1건인
     * <b>운영자 tx</b>이고 컨트랙트가 그 안에서 팀 리더 지갑 N곳으로 {@code transfer}하므로
     * {@code chain_job.wallet_id}에 특정 수령 지갑이 들어가지 않는다(={@code null}). 수령자를
     * 아는 유일한 서버 기록이 {@code settlement_share.wallet_address} 스냅숏이다 —
     * 명세가 이 API의 원본에 {@code settlement_share}를 함께 적어 둔 이유다.
     *
     * <p><b>주소는 대소문자를 무시하고 비교한다.</b> 스냅숏은 참여 등록 시점의 표기(EIP-55
     * 체크섬일 수도, 소문자일 수도)이고 {@code wallet.address}는 등록 때 정규화된 값이라 두 값의
     * 표기가 다를 수 있다. 같은 주소를 다른 문자열로 읽으면 수령 이력이 통째로 사라진다.
     *
     * <p>{@code settlement}·{@code performance}를 fetch join 하는 이유는 행마다 공연 제목과
     * {@code release_tx_hash}를 읽기 때문이다 — 지연 로딩으로 두면 N+1이 된다.
     */
    @Query("""
            select s from SettlementShare s
              join fetch s.settlement st
              join fetch st.performance p
             where s.released = true
               and s.walletAddress is not null
               and lower(s.walletAddress) = lower(:address)
            """)
    List<SettlementShare> findReleasedByWalletAddress(@Param("address") String address);

    /**
     * 조기 동의한 팀 수 — API-settlement-08 응답의 {@code approvedCount}.
     *
     * <p>손에 든 목록을 세지 않는 이유는 {@code SettlementService.approve} 에 적었다(게이트 앞에서
     * 읽은 스냅샷을 세면 마지막 두 팀이 나란히 누를 때 둘 다 진행도를 낮게 본다).
     */
    long countBySettlement_SettlementIdAndApprovedAtNotNull(Long settlementId);

    /** {@code SETTLEMENT_NOT_PARTICIPANT} 검사 — 참여팀만 자기 몫을 조회한다. */
    Optional<SettlementShare> findBySettlement_SettlementIdAndTeam_TeamId(Long settlementId,
                                                                          Long teamId);

    /**
     * 공연 여러 개 × 팀 여러 개의 조기 동의 시각 — API-performance-06 {@code myTeamSettlementApproved}.
     *
     * <p>내 공연 목록 한 페이지(size ≤ 100)를 <b>쿼리 1번</b>으로 채우려고 둔다. 공연마다
     * {@link #findBySettlement_SettlementIdAndTeam_TeamId}를 부르면 행 수만큼 왕복한다.
     * 엔티티가 아니라 세 값만 꺼내는 이유는 목록이 동의 여부 말고는 몫의 어떤 값도 쓰지 않아서다.
     */
    @Query("""
            select p.performanceId as performanceId,
                   s.team.teamId as teamId,
                   s.approvedAt as approvedAt
              from SettlementShare s
              join s.settlement st
              join st.performance p
             where p.performanceId in :performanceIds
               and s.team.teamId in :teamIds
            """)
    List<ShareApproval> findApprovals(@Param("performanceIds") Collection<Long> performanceIds,
                                      @Param("teamIds") Collection<Long> teamIds);

    /** {@link #findApprovals}의 행. {@code approvedAt}이 {@code null}이면 미동의다. */
    interface ShareApproval {
        Long getPerformanceId();

        Long getTeamId();

        LocalDateTime getApprovedAt();
    }
}
