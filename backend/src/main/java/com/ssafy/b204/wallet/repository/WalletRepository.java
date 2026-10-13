package com.ssafy.b204.wallet.repository;

import com.ssafy.b204.wallet.entity.Wallet;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WalletRepository extends JpaRepository<Wallet, Long> {

    /** 회원당 1개(UNIQUE). API-wallet-01 내 지갑 조회. */
    Optional<Wallet> findByMember_MemberId(Long memberId);

    boolean existsByMember_MemberId(Long memberId);

    /**
     * 주소 중복 검사 — 같은 주소를 다른 회원이 이미 등록했는지. 후자는 보안 로깅 대상이다
     * (§16.1 {@code WALLET_ALREADY_LINKED} 제안, 현재는 {@code COMMON_CONFLICT}로 대체).
     */
    Optional<Wallet> findByAddress(String address);

    boolean existsByAddress(String address);
}
