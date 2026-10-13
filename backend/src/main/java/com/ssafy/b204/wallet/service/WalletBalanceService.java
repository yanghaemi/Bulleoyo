package com.ssafy.b204.wallet.service;

import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.wallet.entity.Wallet;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 결제 흐름이 읽는 YoYo 잔액 — API-ticket-01 시스템 처리 3 · API-payment-01·02.
 *
 * <p>명세는 <b>"캐시 미사용 — 결제 화면 진입 값이다"</b>라고 못박고, 노드 실패 시에만
 * {@code balanceStale: true}로 캐시를 쓰라고 한다(API-ticket-01). 그래서 순서가
 * <b>노드 → (실패 시) 캐시 → 502</b>다. 캐시를 먼저 보면 결제 직전 잔액이 낡을 수 있다.
 *
 * <p>⚠️ <b>지금은 노드가 없다.</b> {@link YoYoBalanceReader}가 체인 모듈(S15P21B204-41)이 붙기
 * 전까지 언제나 빈 값이라, 실제로는 캐시 경로만 동작한다. 즉 현재 시연에서 잔액의 원천은 Redis
 * {@code wallet:balance}이며 그 값은 지급({@code MINT})·결제({@code PURCHASE}) 확정이 갱신한다
 * (§0.12 갱신 시점 ②). 체인 모듈이 붙으면 이 클래스는 그대로 두고 {@code YoYoBalanceReader}만
 * 바뀐다.
 */
@Service
@RequiredArgsConstructor
public class WalletBalanceService {

    private final YoYoBalanceReader balanceReader;
    private final WalletBalanceCache balanceCache;

    /** 잔액 한 칸. {@code stale}이면 노드가 아니라 캐시에서 읽었다는 뜻이다. */
    public record Balance(long amount, boolean stale) {}

    /**
     * 노드 → 캐시 순으로 읽는다.
     *
     * @return 둘 다 실패하면 {@link Optional#empty()}
     */
    public Optional<Balance> find(Wallet wallet) {
        Optional<Long> fromNode = balanceReader.balanceOf(wallet.getAddress());
        if (fromNode.isPresent()) {
            balanceCache.put(wallet.getWalletId(), fromNode.get());
            return Optional.of(new Balance(fromNode.get(), false));
        }
        return balanceCache.get(wallet.getWalletId())
                .map(cached -> new Balance(cached.balance(), true));
    }

    /**
     * 잔액을 반드시 알아야 하는 자리(API-payment-01).
     *
     * @throws BusinessException {@code COMMON_EXTERNAL_SERVICE_ERROR}(502) — 0을 지어내면
     *         "잔액 부족"으로 확정 표시돼 사용자가 결제를 포기한다
     */
    public Balance require(Wallet wallet) {
        return find(wallet).orElseThrow(
                () -> BusinessException.of(ErrorCode.COMMON_EXTERNAL_SERVICE_ERROR));
    }
}
