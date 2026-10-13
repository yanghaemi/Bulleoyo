package com.ssafy.b204.coin.repository;

import com.ssafy.b204.chain.entity.ChainJob;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * coin 도메인이 {@code chain_job}에서 읽는 것 — <b>지급 이력(API-coin-08)과 발행량 대사(API-coin-01)</b>.
 *
 * <p>전용 지급 이력 테이블이 없다. {@code chain_job WHERE tx_type='MINT'}가 곧 지급 이력이고
 * ({@code coin_grant}는 ERD v5에 존재하지 않는다) 그 조회를 여기 모았다.
 *
 * <p><b>왜 {@code chain.repository.ChainJobRepository}에 메서드를 더하지 않았나.</b>
 * {@code chain} 패키지는 서버 체인 모듈(이강륜) 소유라 이번 브랜치에서 건드리지 않는다. 같은
 * 엔티티에 조회 전용 리포지토리를 하나 더 두는 것은 Spring Data에서 정상이고, 소유 합의가 끝나면
 * 이 인터페이스를 지우고 그쪽으로 옮기면 된다(호출부는 서비스 하나뿐이다).
 *
 * <p>{@link Repository}(마커)를 상속해 <b>읽기 메서드만</b> 노출한다 — {@code JpaRepository}를
 * 상속하면 {@code save}·{@code delete}가 딸려와 coin 쪽에서 chain_job을 임의로 지울 수 있게 된다.
 * 유일한 쓰기(MINT job 생성)는 {@code chain.repository.ChainJobRepository}로 한다.
 */
public interface CoinChainJobRepository extends Repository<ChainJob, Long>,
        JpaSpecificationExecutor<ChainJob> {

    Optional<ChainJob> findByIdempotencyKey(String idempotencyKey);

    /** 가입 자동 지급({@code requester_member_id IS NULL} → {@code SIGNUP}) 건수. */
    long countByTxTypeAndStatusAndRequesterIsNull(ChainJob.TxType txType, ChainJob.Status status);

    /** 관리자 수동 지급({@code ADMIN}) 건수. */
    long countByTxTypeAndStatusAndRequesterIsNotNull(ChainJob.TxType txType, ChainJob.Status status);

    @Query("""
            select coalesce(sum(j.amount), 0) from ChainJob j
            where j.txType = :txType and j.status = :status and j.requester is null
            """)
    long sumAmountBySignup(@Param("txType") ChainJob.TxType txType,
                           @Param("status") ChainJob.Status status);

    @Query("""
            select coalesce(sum(j.amount), 0) from ChainJob j
            where j.txType = :txType and j.status = :status and j.requester is not null
            """)
    long sumAmountByAdmin(@Param("txType") ChainJob.TxType txType,
                          @Param("status") ChainJob.Status status);

    /**
     * 불변식 2 대사 재료 — 공연·유형별 확정 금액 합.
     *
     * <p>{@code escrowOf(showId) == Σpurchase − Σrefund − Σrelease}를 서버 쪽에서 계산할 때 쓴다.
     * 보증금({@code DEPOSIT}·{@code DEPOSIT_RETURN})은 <b>합에 넣지 않는다</b> — 에스크로와 다른
     * 계정이다(요구사항 v6 §7.5). 호출부가 넘기는 {@code txTypes}가 그 경계다.
     *
     * @return {@code [targetPerformanceId, txType, sum(amount)]} 행
     */
    @Query("""
            select j.targetPerformanceId, j.txType, coalesce(sum(j.amount), 0) from ChainJob j
            where j.status = :status and j.targetPerformanceId is not null and j.txType in :txTypes
            group by j.targetPerformanceId, j.txType
            """)
    List<Object[]> sumAmountByPerformanceAndTxType(
            @Param("status") ChainJob.Status status,
            @Param("txTypes") Collection<ChainJob.TxType> txTypes);
}
