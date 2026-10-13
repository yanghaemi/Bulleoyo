package com.ssafy.b204.coin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.ssafy.b204.coin.service.WalletBalanceReader;
import com.ssafy.b204.common.config.RedisConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;

/** {@code wallet:balance} 단건 파싱 — <b>0 과 "모른다"를 가르는지</b>가 전부다. */
class WalletBalanceReaderTest {

    @SuppressWarnings("unchecked")
    private Long cached(String value) {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        HashOperations<String, Object, Object> hash = mock(HashOperations.class);
        when(redis.opsForHash()).thenReturn(hash);
        when(hash.get(RedisConfig.KEY_WALLET_BALANCE, "7")).thenReturn(value);
        return new WalletBalanceReader(redis).cachedBalance(7L);
    }

    @Test
    @DisplayName("잔액|확인 시각 형식에서 잔액을 읽는다 — 확인 시각이 깨져도 잔액은 읽힌다")
    void readsBalancePart() {
        assertThat(cached("100|3000")).isEqualTo(100L);
        assertThat(cached("5000|abc")).isEqualTo(5000L);
        assertThat(cached("900")).isEqualTo(900L);
    }

    @Test
    @DisplayName("없거나 깨진 값은 null — 0 이 아니다")
    void missingOrBrokenIsNull() {
        assertThat(cached(null)).isNull();
        assertThat(cached("abc|123")).isNull();
    }

    @Test
    @DisplayName("조회가 터지면 null — 0 이 아니다")
    void lookupFailureIsNull() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.opsForHash()).thenThrow(new IllegalStateException("Redis down"));

        assertThat(new WalletBalanceReader(redis).cachedBalance(7L)).isNull();
    }
}
