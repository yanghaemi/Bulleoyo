package com.ssafy.b204.chain.repository;

import com.ssafy.b204.chain.entity.ChainJob;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

public interface ChainJobRepository extends JpaRepository<ChainJob, Long> {

    /** 멱등키 재요청 — {@code MINT} job은 {@code grantRef}가 이 값이다(§0.8). */
    Optional<ChainJob> findByIdempotencyKey(String idempotencyKey);

    /**
     * 상태 전이용 — 행 쓰기 잠금({@code SELECT ... FOR UPDATE})으로 읽는다(S15P21B204-119).
     *
     * <p>두 인스턴스가 같은 receipt 를 보면 둘 다 잠금 없는 읽기로 {@code SUBMITTED} 를 보고 도메인
     * 전이(티켓 발급·결제 PAID·잔액 조정)를 두 번 돈다. 잠금 읽기는 REPEATABLE READ 에서도
     * <b>최신 커밋</b>을 읽으므로, 뒤에 온 쪽은 앞 트랜잭션 커밋까지 기다렸다가 {@code CONFIRMED}
     * 를 보고 끝난다. 호출부 트랜잭션이 끝날 때까지 잠금이 유지되니 트랜잭션 안에서만 부른다.
     *
     * <p>같은 트랜잭션에서 {@code ChainJob} 을 먼저 로드한 뒤 부르면 잠금만 잡고 필드를 갱신하지
     * 않는다(1차 캐시) — 그때는 {@code EntityManager.refresh(job, PESSIMISTIC_WRITE)} 를 쓴다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select j from ChainJob j where j.chainJobId = :id")
    Optional<ChainJob> findByIdForUpdate(@Param("id") Long id);

    /**
     * OPERATOR 워커가 집어갈 대기 작업. {@code @Scheduled} 단일 스레드로 돌려
     * 지갑별 nonce를 직렬화한다 — 병렬로 보내면 nonce가 충돌한다.
     */
    List<ChainJob> findByStatusAndSignerTypeOrderByChainJobIdAsc(ChainJob.Status status,
                                                                  ChainJob.SignerType signerType);

    /** receipt 재조회 대상 — 전송했으나 아직 확정되지 않은 작업. */
    List<ChainJob> findByStatus(ChainJob.Status status);

    /** API-coin-08 시연용 코인 지급 이력 — {@code WHERE tx_type='MINT'}가 곧 지급 이력이다. */
    Page<ChainJob> findByTxType(ChainJob.TxType txType, Pageable pageable);

    /**
     * API-wallet-02 내 지갑 거래 이력 — 별도 {@code wallet_tx} 테이블을 두지 않고
     * 이 조회로 만든다(ERD v5 미생성 목록).
     */
    Page<ChainJob> findByWalletId(Long walletId, Pageable pageable);

    /**
     * API-wallet-02 내 지갑 거래 이력 — {@code WalletTx.type} 6종에 대응하는 {@code tx_type}만.
     *
     * <p>{@code APPROVE}·{@code AGREE}·{@code LOCK}·{@code AGGREGATE}·{@code HALT}는 지갑 화면의
     * 거래가 아니라 절차 tx라 이력에 넣지 않는다(§3 API-wallet-02 "6종").
     */
    Page<ChainJob> findByWalletIdAndTxTypeIn(Long walletId, Collection<ChainJob.TxType> txTypes,
                                              Pageable pageable);

    /** 같은 조회 + {@code status} 필터. */
    Page<ChainJob> findByWalletIdAndTxTypeInAndStatus(Long walletId,
                                                      Collection<ChainJob.TxType> txTypes,
                                                      ChainJob.Status status, Pageable pageable);

    /**
     * API-wallet-01 {@code pendingGrantJobId} — 아직 확정되지 않은 기본 지급 {@code MINT} job.
     * 확정({@code CONFIRMED}) 후에는 {@code null}이어야 하므로 종료 상태를 제외하고 찾는다.
     */
    Optional<ChainJob> findFirstByWalletIdAndTxTypeAndStatusInOrderByChainJobIdDesc(
            Long walletId, ChainJob.TxType txType, Collection<ChainJob.Status> statuses);

    /**
     * 그 공연의 <b>마지막</b> 유형별 job — {@code UPDATE_RULES} 동기화 판정(S15P21B204-70).
     *
     * <p>멱등키로 못 찾는다: {@code updateRules:{performanceId}:{해시}:{회차}}라 전송마다 키가
     * 다르다. "존재하는가"로도 안 된다 — 전송 <b>이력</b>과 <b>현재 상태</b>가 갈리기 때문이다
     * (규칙을 A → B → A 로 되돌리면 옛 job 이 그대로 남아 있다). 마지막 하나만 본다.
     */
    Optional<ChainJob> findFirstByTargetPerformanceIdAndTxTypeOrderByChainJobIdDesc(
            Long targetPerformanceId, ChainJob.TxType txType);

    /**
     * 그 공연에 그 유형의 job 이 <b>하나라도 걸린 적이 있는가</b> — 상태를 가리지 않는다.
     *
     * <p>{@code prepare} 를 부른 적이 있는가({@code CREATE_SHOW} 발의 기록)를 묻는 자리다
     * (API-performance-14 404 · S15P21B204-151). 멱등키로는 못 묻는다 —
     * {@link com.ssafy.b204.chain.entity.ChainJob#retireIdempotencyKey()} 가 {@code FAILED} 재시도
     * 때 키에 접미사를 붙여 {@code createShow:{id}} 조회에서 사라지기 때문이다. 행은 남으므로
     * {@code target_performance_id} + {@code tx_type} 으로는 그대로 찾힌다.
     */
    boolean existsByTargetPerformanceIdAndTxType(
            Long targetPerformanceId, ChainJob.TxType txType);

    /**
     * 폐기된 멱등키 개수 — {@code retireIdempotencyKey()} 가 붙이는 {@code #failed:} 접미를 센다.
     * 자동 재시도 상한의 근거다(정산 쪽 {@code SettlementChainJobRepository} 에 같은 파생 쿼리가 있다).
     */
    long countByIdempotencyKeyStartingWith(String idempotencyKeyPrefix);

    /** 진행 중 작업 존재 여부 — 같은 공연의 다른 동작을 {@code COMMON_CONFLICT}로 막는 근거. */
    boolean existsByTargetPerformanceIdAndTxTypeAndStatusIn(
            Long targetPerformanceId, ChainJob.TxType txType, Collection<ChainJob.Status> statuses);

    /**
     * 그 공연에 <b>종결되지 않은</b> job 이 하나라도 있는가 — tx 타입을 가리지 않는다.
     *
     * <p>공연 삭제(API-performance-18)가 쓴다. 타입을 열거하면 새 tx 타입이 생길 때마다 게이트가
     * 새고, 진행 중인 job 의 {@code target_performance_id} 는 삭제로 {@code SET NULL} 이 되어
     * 확정 콜백이 공연을 못 찾는다({@code ChainJobConfirmationService}). 상태 하나로 판정한다.
     */
    boolean existsByTargetPerformanceIdAndStatusIn(
            Long targetPerformanceId, Collection<ChainJob.Status> statuses);

    /**
     * selector 가 붙지 않은 {@code FAILED} job 존재 여부 — revert 가 확정되지 않은 실패를 찾는다.
     *
     * <p>{@code failure_reason}은 {@link com.ssafy.b204.chain.service.ChainFailure}의 규약
     * ({@code CODE} 또는 {@code CODE#selector})이고, {@code #}가 붙는 것은 워커가 receipt 를 받은 뒤
     * 재생으로 revert selector 를 뽑은 경우뿐이다. 사유가 비어 있어도 모르는 쪽으로 센다.
     */
    @Query("""
            select count(j) > 0 from ChainJob j
             where j.targetPerformanceId = :performanceId
               and j.txType = :txType
               and j.status = com.ssafy.b204.chain.entity.ChainJob$Status.FAILED
               and (j.failureReason is null or j.failureReason not like '%#%')
            """)
    boolean existsFailedWithoutRevertSelector(@Param("performanceId") Long performanceId,
                                              @Param("txType") ChainJob.TxType txType);

    /**
     * {@code b204_chain_job_count} 지표 — 상태·서명 주체별 건수를 쿼리 한 번으로. 건수 0 인 조합은
     * 행이 없다(호출부가 0 으로 채운다).
     */
    @Query("""
            select j.status as status, j.signerType as signerType, count(j) as count
              from ChainJob j
             group by j.status, j.signerType
            """)
    List<JobCount> countGroupByStatusAndSignerType();

    interface JobCount {
        ChainJob.Status getStatus();

        ChainJob.SignerType getSignerType();

        long getCount();
    }

    /**
     * 이 job 을 <b>내가 집는다</b> — 인스턴스가 둘 이상일 때 같은 tx 를 두 번 보내지 않게 하는
     * 마지막 방어선이다(S15P21B204-96).
     *
     * <p><b>왜 소유권(ChainOwnership)만으로 부족한가.</b> 그쪽은 Redis 임대라 <b>펜싱이 없다</b> —
     * 소유자가 임대보다 오래 멈췄다(GC·DB 대기) 깨어나면 다른 인스턴스가 이미 키를 가져간
     * 상태에서도 <b>다음 확인 주기까지 자신을 소유자로 믿는다.</b> 그 창을 닫는 것이 이 UPDATE 다.
     * 판정이 DB 한 번의 원자적 연산이라 창이 없다.
     *
     * <p><b>낡은 claim 은 다시 집는다.</b> 집어 놓고 죽은 인스턴스의 job 이 영영 안 돌아가는 것은
     * 반대 방향의 같은 사고다(S15P21B204-76 과 같은 함정) — 그래서 회수 경로를 따로 만들지 않고
     * 조건에 넣는다. {@code staleBefore} 보다 오래된 claim 은 없는 것으로 본다.
     *
     * <p><b>내가 이미 집은 job 은 다시 집는다</b>({@code claimedBy = :instanceId}). 전송이 실패하면
     * {@code retryOrFail} 이 status 를 PENDING 으로 둔 채 카운트만 올리는데, 이 조건이 없으면 내
     * 신선한 claim 에 내가 막혀 REL-09 "다음 주기(1초) 재시도" 가 5분 간격이 된다. 다른 인스턴스는
     * 여전히 내 신선한 claim 을 못 뺏으므로 펜싱은 그대로다.
     *
     * <p><b>트랜잭션을 여기에 둔다 — {@code REQUIRES_NEW}.</b> {@code @Modifying} 쿼리는 쓰기
     * 트랜잭션 없이는 {@code TransactionRequiredException} 이고, 워커 디스패치에는 트랜잭션이 없다.
     * 새 트랜잭션인 이유: claim 은 바깥 트랜잭션 커밋을 기다리지 않고 <b>즉시 커밋돼</b> 다른
     * 인스턴스에 보여야 펜싱이 된다. {@code ChainOwnership.claim()} 에 달지 않은 이유: 그 메서드는
     * 비활성(단일 인스턴스 = 현재 운영)이면 DB 를 안 건드리고 바로 참을 돌려주는데, 거기에 달면
     * 본문에 들어가기 전에 트랜잭션이 열려 매 주기 빈 트랜잭션·커넥션 획득이 생긴다. 여기에 달면
     * 뜻은 같고 비활성 경로는 트랜잭션을 열지 않는다.
     *
     * @return 1 이면 내가 집었다. 0 이면 다른 인스턴스가 집었거나 상태가 이미 바뀌었다
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update ChainJob j
               set j.claimedBy = :instanceId, j.claimedAt = :now
             where j.chainJobId = :chainJobId
               and j.status = com.ssafy.b204.chain.entity.ChainJob$Status.PENDING
               and (j.claimedAt is null or j.claimedAt < :staleBefore or j.claimedBy = :instanceId)
            """)
    int claim(@Param("chainJobId") Long chainJobId,
              @Param("instanceId") String instanceId,
              @Param("now") LocalDateTime now,
              @Param("staleBefore") LocalDateTime staleBefore);
}
