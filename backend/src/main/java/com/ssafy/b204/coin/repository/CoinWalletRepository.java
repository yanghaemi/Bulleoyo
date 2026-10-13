package com.ssafy.b204.coin.repository;

import com.ssafy.b204.wallet.entity.Wallet;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * 발행량 대사(불변식 4)가 노드에서 잔액을 읽을 등록 지갑 목록.
 *
 * <p>{@code wallet} 패키지를 건드리지 않으려고 조회 전용 리포지토리를 coin에 둔다 —
 * {@link CoinPerformanceRepository}와 같은 이유다.
 */
public interface CoinWalletRepository extends Repository<Wallet, Long> {

    /**
     * {@code walletId > afterId}인 지갑을 PK 순으로 한 청크 — 키셋 페이지라 스캔 중 새 지갑이
     * 등록돼도 건너뛰거나 두 번 세지 않는다.
     *
     * @return {@code [walletId, address]} 행
     */
    @Query("""
            select w.walletId, w.address from Wallet w
            where w.status = :status and w.walletId > :afterId
            order by w.walletId asc
            """)
    List<Object[]> findChunkAfter(@Param("status") Wallet.Status status,
                                  @Param("afterId") long afterId, Pageable chunk);
}
