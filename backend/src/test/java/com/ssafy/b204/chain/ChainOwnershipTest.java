package com.ssafy.b204.chain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.chain.worker.ChainOwnership;
import java.time.Duration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

/**
 * 체인 작업 소유권 — <b>같은 tx 를 두 번 보내지 않는 것</b>이 전부다.
 *
 * <p>가장 중요한 케이스는 "식별자가 비면 지금과 똑같다" 다. 이 클래스가 들어왔다고 단일 인스턴스
 * 운영이 달라지면 안 된다.
 */
class ChainOwnershipTest {

    private final ChainJobRepository jobs = mock(ChainJobRepository.class);

    @SuppressWarnings("unchecked")
    private ValueOperations<String, String> valueOps(StringRedisTemplate redis) {
        ValueOperations<String, String> ops = mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(ops);
        return ops;
    }

    @Test
    @DisplayName("식별자가 비면 언제나 맡는다 — 단일 인스턴스 배포는 달라지지 않는다")
    void disabledAlwaysWorks() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);

        ChainOwnership ownership = new ChainOwnership(redis, jobs, "");

        assertThat(ownership.disabled()).isTrue();
        assertThat(ownership.isOwner()).isTrue();
        // Redis 를 아예 건드리지 않는다 — 단일 인스턴스에 왕복 비용을 지우지 않는다.
        verify(redis, never()).opsForValue();
    }

    @Test
    @DisplayName("키가 비어 있으면 먼저 본 인스턴스가 가져간다 — 아무도 일하지 않는 상태로 두지 않는다")
    void claimsWhenAbsent() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        ValueOperations<String, String> ops = valueOps(redis);
        when(ops.setIfAbsent(anyString(), eq("blue"), any(Duration.class))).thenReturn(true);

        assertThat(new ChainOwnership(redis, jobs, "blue").isOwner()).isTrue();
    }

    /**
     * 호스트 재부팅이면 두 색과 Redis 가 함께 서고, AOF 가 복원한 {@code chain:owner} 임대는
     * JVM 기동(60~90초) 중에 만료된다. 그 빈 키를 쉬는 옛 색이 가져가면 트래픽은 새 색인데
     * 체인 tx 는 옛 이미지가 보낸다 — 조용해서 더 나쁘다(리뷰 !93 🔴).
     */
    @Test
    @DisplayName("활성 색이 아니면 빈 키도 가져가지 않는다 — 재부팅 뒤 쉬는 색이 체인을 맡는 길")
    void standbyDoesNotClaimEmptyKey() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        ValueOperations<String, String> ops = valueOps(redis);
        when(ops.get(ChainOwnership.KEY_ACTIVE)).thenReturn("green");

        assertThat(new ChainOwnership(redis, jobs, "blue").isOwner()).isFalse();
        // 비어 있는지 확인조차 하지 않는다 — 확인하면 가져가게 된다.
        verify(ops, never()).setIfAbsent(anyString(), anyString(), any(Duration.class));
    }

    @Test
    @DisplayName("활성 색이면 빈 키를 가져간다 — 배포가 넘긴 색이 일해야 한다")
    void activeColorClaimsEmptyKey() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        ValueOperations<String, String> ops = valueOps(redis);
        when(ops.get(ChainOwnership.KEY_ACTIVE)).thenReturn("blue");
        when(ops.setIfAbsent(anyString(), eq("blue"), any(Duration.class))).thenReturn(true);

        assertThat(new ChainOwnership(redis, jobs, "blue").isOwner()).isTrue();
    }

    @Test
    @DisplayName("내가 소유자면 맡고, 임대를 연장한다 — 죽으면 넘어가야 한다")
    void ownerRenewsLease() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        ValueOperations<String, String> ops = valueOps(redis);
        when(ops.setIfAbsent(anyString(), anyString(), any(Duration.class))).thenReturn(false);
        when(ops.get(ChainOwnership.KEY_OWNER)).thenReturn("blue");

        assertThat(new ChainOwnership(redis, jobs, "blue").isOwner()).isTrue();
        verify(redis).expire(eq(ChainOwnership.KEY_OWNER), any(Duration.class));
    }

    @Test
    @DisplayName("소유자가 다른 색이면 쉰다 — 여기가 두 번 보내는 것을 막는 자리다")
    void standbyDoesNotWork() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        ValueOperations<String, String> ops = valueOps(redis);
        when(ops.setIfAbsent(anyString(), anyString(), any(Duration.class))).thenReturn(false);
        when(ops.get(ChainOwnership.KEY_OWNER)).thenReturn("green");

        assertThat(new ChainOwnership(redis, jobs, "blue").isOwner()).isFalse();
    }

    /**
     * 모르면 하지 않는다. 두 번 보낸 대납 tx 는 실제 가스가 나가고 nonce 가 깨져 되돌릴 수
     * 없지만, 멈춘 큐는 Redis 가 돌아오면 그대로 이어진다.
     */
    @Test
    @DisplayName("비활성이면 claim 이 DB 도 건드리지 않는다 — 단일 인스턴스에 비용을 지우지 않는다")
    void disabledClaimSkipsDatabase() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);

        assertThat(new ChainOwnership(redis, jobs, "").claim(7L)).isTrue();

        verify(jobs, never()).claim(any(), anyString(), any(), any());
    }

    @Test
    @DisplayName("claim 은 UPDATE 가 1행을 바꿨을 때만 참이다 — 0 이면 다른 인스턴스가 집었다")
    void claimFollowsUpdateResult() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        ChainOwnership ownership = new ChainOwnership(redis, jobs, "blue");

        when(jobs.claim(eq(7L), eq("blue"), any(), any())).thenReturn(1);
        assertThat(ownership.claim(7L)).isTrue();

        when(jobs.claim(eq(7L), eq("blue"), any(), any())).thenReturn(0);
        assertThat(ownership.claim(7L)).isFalse();
    }

    @Test
    @DisplayName("Redis 를 못 읽으면 쉰다 — 멈추는 쪽이 두 번 보내는 것보다 싸다")
    void stopsWhenRedisUnreadable() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.opsForValue()).thenThrow(new IllegalStateException("Redis down"));

        assertThat(new ChainOwnership(redis, jobs, "blue").isOwner()).isFalse();
    }
}
