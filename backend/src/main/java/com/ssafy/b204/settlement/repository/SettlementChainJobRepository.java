package com.ssafy.b204.settlement.repository;

import com.ssafy.b204.chain.entity.ChainJob;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 정산이 만들고 읽는 {@code chain_job} — settlement 소유의 보조 리포지토리.
 *
 * <p>{@code chain.repository.ChainJobRepository}(이강륜 소유)에는 정산이 필요한 조회가 없다.
 * {@code ChainJobService.enqueue}가 열리기 전까지 도메인이 직접 INSERT하므로(open-questions D-5),
 * 조회도 여기서 한다. 엔티티는 공유하고 인터페이스만 나눈다.
 */
public interface SettlementChainJobRepository extends JpaRepository<ChainJob, Long> {

    /** 멱등키 재요청 — 같은 키면 새 job을 만들지 않고 최초 {@code jobId}를 재생한다(§0.8). */
    Optional<ChainJob> findByIdempotencyKey(String idempotencyKey);

    /**
     * 밀려난 멱등키 개수 — 자동 release 가 지금까지 몇 번 실패했는지 세는 유일한 근거다.
     *
     * <p>{@link ChainJob#retireIdempotencyKey()}가 실패한 job 의 키를 {@code {key}#failed:{id}}로
     * 밀어내므로, {@code "release:auto:{settlementId}#failed:"} 접두를 세면 시도 횟수가 나온다.
     * 새 컬럼을 두지 않은 이유는 이 값이 <b>이미 행에 남아 있는 사실</b>이기 때문이다 — 컬럼을
     * 더하면 같은 사실이 두 곳에 생기고 둘이 갈릴 수 있다.
     */
    long countByIdempotencyKeyStartingWith(String idempotencyKeyPrefix);

    /** 진행 중 작업 존재 여부 — 같은 동작 재요청을 {@code COMMON_CONFLICT}로 막는 근거. */
    boolean existsByTargetPerformanceIdAndTxTypeAndStatusIn(
            Long targetPerformanceId, ChainJob.TxType txType, Collection<ChainJob.Status> statuses);

    /** 결제·환불·지급 계열이 아직 떠 있는지 — 집계 확정 게이트({@code COIN_MINT_PENDING}). */
    boolean existsByTargetPerformanceIdAndTxTypeInAndStatusIn(
            Long targetPerformanceId, Collection<ChainJob.TxType> txTypes,
            Collection<ChainJob.Status> statuses);

    /** 가장 최근 job 하나 — tx 해시를 응답에 싣기 위해. */
    Optional<ChainJob> findFirstByTargetPerformanceIdAndTxTypeAndStatusOrderByChainJobIdDesc(
            Long targetPerformanceId, ChainJob.TxType txType, ChainJob.Status status);

    /** 공연의 정산 관련 tx 목록 — API-settlement-01 {@code transactions[]}. */
    List<ChainJob> findByTargetPerformanceIdAndTxTypeInAndStatusOrderByChainJobIdAsc(
            Long targetPerformanceId, Collection<ChainJob.TxType> txTypes, ChainJob.Status status);

    /**
     * 확정됐지만 아직 도메인 상태에 반영되지 않았을 수 있는 job.
     *
     * <p>{@code ChainJobConfirmedEvent}가 없어서(open-questions D-5) 이벤트 대신 훑는다.
     * 반영 여부는 별도 플래그가 아니라 <b>정산 상태 자체</b>로 판정하므로 몇 번 훑어도 결과가 같다.
     */
    List<ChainJob> findByStatusAndTxTypeInOrderByChainJobIdAsc(
            ChainJob.Status status, Collection<ChainJob.TxType> txTypes);
}
