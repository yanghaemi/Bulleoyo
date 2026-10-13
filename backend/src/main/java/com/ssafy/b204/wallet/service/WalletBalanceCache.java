package com.ssafy.b204.wallet.service;

import com.ssafy.b204.common.config.RedisConfig;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * 지갑 YoYo 잔액 캐시 — Redis 해시 {@code wallet:balance} (API v6 §0.12 · §B′).
 *
 * <table border="1">
 *   <caption>규약</caption>
 *   <tr><th>항목<th>값
 *   <tr><td>키<td>{@code wallet:balance} (해시 <b>하나</b>. 지갑마다 키를 만들지 않는다)
 *   <tr><td>field<td>{@code walletId}
 *   <tr><td>value<td>{@code "{balance}|{checkedAtEpochMs}"}
 *   <tr><td>TTL<td><b>없음</b>
 * </table>
 *
 * <p><b>TTL이 없는 것이 의도다.</b> 노드 장애 시에도 마지막 값을 보여줘야 한다(AVAIL-02). 대신
 * {@code checkedAt}이 {@link #FRESHNESS}(10초)보다 낡으면 조회 시 노드를 다시 읽고 갱신한다.
 *
 * <p><b>DB에 잔액 사본을 만들지 않는다.</b> ERD v5에서 {@code wallet.cached_krws_balance}·
 * {@code last_balance_check_at} 2컬럼이 삭제됐고 {@code FlywayMigrationTest}가 그 부재를 고정한다.
 * 원장은 언제나 체인이고, Redis가 비면 다음 조회에서 재구축된다 — 데이터 손실이 아니다.
 *
 * <p>갱신 시점은 둘이다(§0.12) — ① API-wallet-01이 노드를 읽었을 때 ② <b>지갑이 관여한
 * {@code chain_job}이 {@code CONFIRMED}될 때</b>(체인 워커 몫. 이 카드 범위 밖이라 아직 호출부가
 * 없고, 그 워커가 쓸 진입점으로 {@link #put}을 열어 둔다).
 */
@Component
public class WalletBalanceCache {

    /** 이보다 낡으면 노드를 다시 읽는다(§0.12 "10초"). */
    public static final Duration FRESHNESS = Duration.ofSeconds(10);

    private static final Logger log = LoggerFactory.getLogger(WalletBalanceCache.class);

    private final StringRedisTemplate redis;

    public WalletBalanceCache(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public Optional<CachedBalance> get(Long walletId) {
        String raw = (String) redis.opsForHash().get(RedisConfig.KEY_WALLET_BALANCE,
                String.valueOf(walletId));
        return parse(raw);
    }

    /** 노드를 읽었거나 {@code chain_job}이 확정됐을 때 갱신한다. */
    public CachedBalance put(Long walletId, long balance) {
        Instant checkedAt = Instant.now();
        redis.opsForHash().put(RedisConfig.KEY_WALLET_BALANCE, String.valueOf(walletId),
                balance + RedisConfig.BALANCE_VALUE_DELIMITER + checkedAt.toEpochMilli());
        return new CachedBalance(balance, checkedAt);
    }

    private static Optional<CachedBalance> parse(String raw) {
        if (raw == null || raw.isBlank()) {
            return Optional.empty();
        }
        int sep = raw.lastIndexOf(RedisConfig.BALANCE_VALUE_DELIMITER);
        if (sep <= 0) {
            log.warn("wallet:balance 값 형식이 규약과 다르다 — 무시하고 재조회한다");
            return Optional.empty();
        }
        try {
            long balance = Long.parseLong(raw.substring(0, sep));
            long checkedAtMillis = Long.parseLong(raw.substring(sep + 1));
            return Optional.of(new CachedBalance(balance, Instant.ofEpochMilli(checkedAtMillis)));
        } catch (NumberFormatException e) {
            log.warn("wallet:balance 값을 읽을 수 없다 — 무시하고 재조회한다");
            return Optional.empty();
        }
    }

    /** 캐시 한 칸. {@code fresh}가 아니면 노드를 다시 읽어야 한다. */
    public record CachedBalance(long balance, Instant checkedAt) {

        public boolean isFresh() {
            return checkedAt.isAfter(Instant.now().minus(FRESHNESS));
        }
    }
}
