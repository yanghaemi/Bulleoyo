package com.ssafy.b204.verify.repository;

import com.ssafy.b204.chain.entity.ChainJob;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 검증 응답이 읽는 확정 tx — verify 소유의 읽기 전용 리포지토리.
 *
 * <p>{@code chain.repository.ChainJobRepository}(이강륜 소유)에는 이 조회가 없고, settlement의
 * {@code SettlementChainJobRepository}에는 <b>쓰기 경로(멱등키·진행 중 판정)가 섞여 있어</b>
 * 조회만 하는 이쪽이 남의 도메인 규칙에 묶인다. 엔티티는 공유하고 인터페이스만 나눈다.
 *
 * <p>{@code CONFIRMED}만 읽는다 — 검증 데이터에 아직 확정되지 않은 tx 해시를 실으면 "체인에 있다"고
 * 말하는 셈이 된다.
 */
public interface VerifyChainJobRepository extends JpaRepository<ChainJob, Long> {

    /** 공연의 확정 tx 목록. 동의(AGREE)·release·보증금 tx를 한 번에 읽어 메모리에서 나눈다. */
    List<ChainJob> findByTargetPerformanceIdAndTxTypeInAndStatusOrderByChainJobIdAsc(
            Long targetPerformanceId, Collection<ChainJob.TxType> txTypes, ChainJob.Status status);
}
