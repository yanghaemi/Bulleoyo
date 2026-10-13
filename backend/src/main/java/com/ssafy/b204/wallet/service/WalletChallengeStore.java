package com.ssafy.b204.wallet.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.b204.common.config.RedisConfig;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * 외부 지갑 등록 챌린지 저장소 — Redis {@code wallet:challenge:{memberId}} (API v6 §0.12).
 *
 * <p><b>테이블로 만들지 않는다</b>(API-wallet-03 요구사항 · {@code FlywayMigrationTest}가
 * {@code wallet_challenge} 테이블의 부재를 고정한다). 5분 뒤 사라져야 하는 상태이고, 남으면
 * 재사용 공격의 재료가 된다.
 *
 * <p><b>TTL 300초 · 1회용.</b> 같은 회원이 다시 발급하면 덮어써 이전 것을 무효화하고, 검증
 * 성공·실패와 무관하게 {@link #consume}이 <b>읽는 즉시 삭제</b>한다.
 *
 * <p>값은 {@code {nonce, address, message, issuedAt}} JSON이다. {@code message}는 사용자가 서명한
 * <b>원문 그대로</b>여야 한다 — 한 글자라도 다르면 {@code ecrecover} 결과가 달라진다.
 */
@Component
public class WalletChallengeStore {

    /** §0.12 · API-wallet-03 "5분 유효". */
    public static final Duration TTL = Duration.ofSeconds(300);

    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;

    public WalletChallengeStore(StringRedisTemplate redis, ObjectMapper objectMapper) {
        this.redis = redis;
        this.objectMapper = objectMapper;
    }

    public void save(Long memberId, Challenge challenge) {
        try {
            redis.opsForValue().set(key(memberId), objectMapper.writeValueAsString(challenge), TTL);
        } catch (JsonProcessingException e) {
            throw BusinessException.of(ErrorCode.COMMON_INTERNAL_ERROR, e);
        }
    }

    /**
     * 읽고 <b>즉시 지운다</b>(1회용). 없으면 만료·미발급·이미 사용이며 전부 같은 취급이다 —
     * 어느 쪽인지 알려주면 공격자에게 정보를 준다.
     */
    public Optional<Challenge> consume(Long memberId) {
        String raw = redis.opsForValue().get(key(memberId));
        redis.delete(key(memberId));
        if (raw == null) {
            return Optional.empty();
        }
        try {
            return Optional.of(objectMapper.readValue(raw, Challenge.class));
        } catch (JsonProcessingException e) {
            return Optional.empty();
        }
    }

    private static String key(Long memberId) {
        return RedisConfig.KEY_WALLET_CHALLENGE + memberId;
    }

    /** {@code {nonce, address, message, issuedAt}} — §0.12가 정한 값 그대로. */
    public record Challenge(String nonce, String address, String message, Instant issuedAt) {
    }
}
