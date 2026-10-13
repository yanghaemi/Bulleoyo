package com.ssafy.b204.wallet.service;

import com.ssafy.b204.wallet.entity.Wallet;
import com.ssafy.b204.wallet.repository.WalletRepository;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * {@code wallet:balance} <b>갱신 시점 ②</b> — API v6 §0.12.
 *
 * <blockquote>갱신 시점은 둘이다. ① API-wallet-01이 노드를 읽었을 때 <b>② 지갑이 관여한
 * {@code chain_job}이 {@code CONFIRMED}될 때</b> — 발신 지갑(결제 {@code PURCHASE}·보증금
 * {@code DEPOSIT})과 수신 지갑(환불 {@code REFUND}·정산 {@code RELEASE}·보증금 반환
 * {@code DEPOSIT_RETURN}·지급 {@code MINT}) 모두를 갱신한다.</blockquote>
 *
 * <p>①은 {@link WalletBalanceService}가, ②는 <b>이 클래스</b>가 한다. 부르는 곳은 체인 워커
 * ({@code ChainJobWorker})다.
 *
 * <p><b>노드에서 다시 읽는다 — 델타를 더하지 않는다.</b>
 * {@link com.ssafy.b204.chain.service.ChainJobConfirmationService}도 확정 트랜잭션 안에서 캐시를
 * ±금액만큼 손보지만, 그것은 <b>캐시가 이미 있을 때만</b> 도는 보정이고 tx 유형 3종
 * ({@code PURCHASE}·{@code DEPOSIT}·{@code MINT})만 다룬다. 나머지 유형과 "캐시가 비어 있는
 * 지갑"은 여기서만 채워진다. 순서상 이쪽이 나중이라 <b>노드 값이 델타 보정을 덮는다</b> — 원장은
 * 언제나 체인이므로 그게 맞다.
 *
 * <p><b>실패는 조용하다.</b> 노드가 없거나 못 읽으면 캐시를 건드리지 않는다. 캐시는 원장이
 * 아니라서 낡은 채로 있어도 다음 조회가 재구축한다(§0.12) — 확정을 되돌릴 이유가 되지 않는다.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class WalletBalanceRefresher {

    private final WalletRepository walletRepository;
    private final YoYoBalanceReader balanceReader;
    private final WalletBalanceCache balanceCache;

    /**
     * 지갑 하나의 캐시를 노드 값으로 맞춘다.
     *
     * @param walletId {@code chain_job.wallet_id}. {@code null}이면 아무것도 하지 않는다
     *                 (지갑이 관여하지 않은 job — 예: 규칙 잠금)
     * @return 갱신한 잔액. 노드를 못 읽었으면 비어 있다
     */
    public Optional<Long> refresh(Long walletId) {
        if (walletId == null || !balanceReader.isAvailable()) {
            return Optional.empty();
        }
        Optional<String> address = walletRepository.findById(walletId).map(Wallet::getAddress);
        if (address.isEmpty()) {
            log.debug("wallet:balance 갱신 대상 지갑이 없다 walletId={}", walletId);
            return Optional.empty();
        }
        Optional<Long> balance = balanceReader.balanceOf(address.get());
        balance.ifPresent(value -> balanceCache.put(walletId, value));
        return balance;
    }
}
