package com.ssafy.b204.common.security;

import com.ssafy.b204.common.config.RedisConfig;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Set;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * 리프레시 토큰 저장소 — <b>Redis 전용</b>(API v6 §0.12).
 *
 * <table border="1">
 *   <caption>키</caption>
 *   <tr><th>키<th>자료형<th>값<th>TTL
 *   <tr><td>{@code auth:refresh:{jti}}<td>string<td>리프레시 토큰 <b>해시</b><td>14일
 *   <tr><td>{@code auth:refresh:member:{memberId}}<td>set<td>그 회원의 유효 {@code jti} 집합<td>—
 * </table>
 *
 * <p><b>ERD에 {@code refresh_token} 테이블이 없는 것이 의도다</b>({@code FlywayMigrationTest}가
 * 그 부재를 고정한다). 세션은 만료되면 사라져야 하는 상태라 TTL이 있는 저장소가 맞고, DB에 두면
 * 만료 행 청소를 우리가 떠안는다.
 *
 * <p>토큰 원문을 넣지 않고 <b>SHA-256 해시</b>를 넣는다 — Redis 덤프가 유출돼도 그것만으로
 * 세션을 재생할 수 없게 한다(SEC-02). 검증은 "같은 해시인가"로 한다.
 *
 * <p>{@code auth:refresh:member:*} 집합에는 TTL이 없다(§0.12 "회원 삭제·전체 로그아웃 시 정리").
 * 개별 jti 키가 먼저 만료돼 집합에 죽은 원소가 남을 수 있으므로, 전량 폐기 시 존재 여부를 묻지
 * 않고 {@code DEL} 후 집합을 비운다.
 */
@Component
public class RefreshTokenStore {

    private final StringRedisTemplate redis;

    public RefreshTokenStore(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /** 발급·회전 시 저장. 기존 jti가 있으면 덮어쓴다. */
    public void save(Long memberId, String jti, String refreshToken, Duration ttl) {
        redis.opsForValue().set(tokenKey(jti), hash(refreshToken), ttl);
        redis.opsForSet().add(memberKey(memberId), jti);
    }

    /** 키가 존재하고 해시가 같은지. 둘 중 하나라도 아니면 재사용·위조다. */
    public boolean matches(String jti, String refreshToken) {
        String stored = redis.opsForValue().get(tokenKey(jti));
        return stored != null && stored.equals(hash(refreshToken));
    }

    public boolean exists(String jti) {
        return Boolean.TRUE.equals(redis.hasKey(tokenKey(jti)));
    }

    /** 한 건 폐기. 이미 없으면 {@code false}. */
    public boolean revoke(Long memberId, String jti) {
        boolean deleted = Boolean.TRUE.equals(redis.delete(tokenKey(jti)));
        redis.opsForSet().remove(memberKey(memberId), jti);
        return deleted;
    }

    /**
     * 그 회원의 refresh token 전량 폐기.
     *
     * <p>쓰는 곳 — ① {@code allDevices} 로그아웃 ② <b>재사용 감지</b>(폐기된 jti 재요청은 탈취
     * 신호다, API-member-03 요구사항) ③ LOCAL 회원 비밀번호 변경(SEC-02).
     *
     * @return 실제로 지워진 키 수
     */
    public int revokeAll(Long memberId) {
        Set<String> jtis = redis.opsForSet().members(memberKey(memberId));
        int revoked = 0;
        if (jtis != null) {
            for (String jti : jtis) {
                if (Boolean.TRUE.equals(redis.delete(tokenKey(jti)))) {
                    revoked++;
                }
            }
        }
        redis.delete(memberKey(memberId));
        return revoked;
    }

    private static String tokenKey(String jti) {
        return RedisConfig.KEY_AUTH_REFRESH + jti;
    }

    private static String memberKey(Long memberId) {
        return RedisConfig.KEY_AUTH_REFRESH_MEMBER + memberId;
    }

    private static String hash(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 은 모든 JRE에 있어야 한다", e);
        }
    }
}
