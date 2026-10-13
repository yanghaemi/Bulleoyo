package com.ssafy.b204.coin.service;

import com.ssafy.b204.common.config.RedisConfig;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * Redis {@code wallet:balance} 해시를 <b>읽기만</b> 한다 — API v6 §0.12.
 *
 * <p>필드는 {@code walletId}, 값은 {@code "{balance}|{checkedAtEpochMs}"}. TTL이 없다(노드 장애
 * 때도 마지막 값을 보여줘야 한다).
 *
 * <p><b>쓰지 않는 이유:</b> 갱신 주체는 wallet 도메인(조회 시)과 chain 워커({@code chain_job}
 * 확정 시) 둘이다(§0.12). coin이 여기에 값을 써 넣으면 "누가 마지막에 썼나"가 흐려진다.
 *
 * <p><b>발행량 대사(불변식 4)는 이 캐시를 쓰지 않는다</b>(S15P21B204-88 · D-49). 캐시는 화면용이라
 * 아무도 조회하지 않은 지갑이 없어 합계가 작게 나온다 — 대사는 {@link SupplyReconciler}가 등록
 * 지갑 잔액을 노드에서 직접 읽는다.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class WalletBalanceReader {

    private static final char DELIMITER = RedisConfig.BALANCE_VALUE_DELIMITER.charAt(0);

    private final StringRedisTemplate redisTemplate;

    /** 지갑 하나의 캐시 잔액. 없으면 {@code null}(0이 아니다 — "모른다"와 "0"은 다르다). */
    public Long cachedBalance(Long walletId) {
        if (walletId == null) {
            return null;
        }
        try {
            Object value = redisTemplate.opsForHash()
                    .get(RedisConfig.KEY_WALLET_BALANCE, String.valueOf(walletId));
            return value == null ? null : parseBalance(String.valueOf(value));
        } catch (RuntimeException e) {
            log.warn("wallet:balance 단건 조회 실패 walletId={}", walletId, e);
            return null;
        }
    }

    /** {@code "{balance}|{checkedAtEpochMs}"} → balance. 못 읽으면 {@code null} — 0 이 아니다. */
    private static Long parseBalance(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        int at = value.indexOf(DELIMITER);
        String balance = at < 0 ? value : value.substring(0, at);
        try {
            return Long.parseLong(balance.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
