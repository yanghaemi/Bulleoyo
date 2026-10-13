package com.ssafy.b204.settlement.repository;

import com.ssafy.b204.settlement.entity.Dispute;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DisputeRepository extends JpaRepository<Dispute, Long> {

    List<Dispute> findBySettlement_SettlementId(Long settlementId);

    /** 팀당 열린 이의 1건 규칙 검사(§16.1 {@code SETTLEMENT_DISPUTE_ALREADY_OPEN} 제안 자리). */
    boolean existsBySettlement_SettlementIdAndTeam_TeamIdAndStatus(Long settlementId, Long teamId,
                                                                    Dispute.Status status);

    /** API-admin-09 이의제기 목록. */
    Page<Dispute> findByStatus(Dispute.Status status, Pageable pageable);

    /**
     * API-admin-09 이의제기 목록 — {@code status}·{@code performanceId} 조합 필터.
     * 두 파라미터 모두 {@code null}이면 전체다(명세: status 미지정 시 전체).
     *
     * <p>정렬 파라미터는 {@code submittedAt}(명세 {@code createdAt})과
     * {@code settlement.disputeDeadlineAt}(명세 {@code disputeClosesAt})만 허용한다
     * ({@link com.ssafy.b204.common.support.Paging}).
     */
    @Query("""
            select d from Dispute d
            where (:status is null or d.status = :status)
              and (:performanceId is null
                   or d.settlement.performance.performanceId = :performanceId)
            """)
    Page<Dispute> search(@Param("status") Dispute.Status status,
                         @Param("performanceId") Long performanceId, Pageable pageable);
}
