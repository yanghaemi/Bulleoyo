package com.ssafy.b204.common.support;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.support.IntegrationTestBase;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 멱등 선점의 원자성 — <b>진짜 Redis에 진짜 스레드 두 개</b>를 붙여 경합을 일으킨다.
 *
 * <p>이전 구현({@code GET} → 처리 → {@code SET})은 이 시험에서 두 스레드가 모두 "처음"을 받아
 * 부작용을 두 번 실행했다. {@code SET NX} 선점으로 바꾼 뒤에는 한 쪽만 자리를 잡는다.
 */
class IdempotencyGuardTest extends IntegrationTestBase {

    @Autowired
    private IdempotencyGuard guard;

    @Test
    @DisplayName("두 스레드가 같은 키로 동시에 들어와도 한 쪽만 자리를 잡고, 다른 쪽은 409 다")
    void onlyOneThreadWinsTheSlot() throws Exception {
        String key = "test:idem:" + UUID.randomUUID();
        String body = "{\"performanceId\":1,\"quantity\":1}";
        int threads = 2;
        CyclicBarrier barrier = new CyclicBarrier(threads);
        AtomicInteger won = new AtomicInteger();
        AtomicInteger conflicted = new AtomicInteger();

        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            List<Callable<Void>> tasks = List.of(attempt(barrier, key, body, won, conflicted),
                    attempt(barrier, key, body, won, conflicted));
            for (Future<Void> future : pool.invokeAll(tasks, 20, TimeUnit.SECONDS)) {
                future.get();
            }
        } finally {
            pool.shutdownNow();
        }

        assertThat(won.get()).isEqualTo(1);
        assertThat(conflicted.get()).isEqualTo(1);
    }

    @Test
    @DisplayName("완료 값은 같은 본문에만 재생되고, 다른 본문은 409 COMMON_CONFLICT 다(§0.8)")
    void replaysSameBodyAndRejectsOthers() {
        String key = "test:idem:" + UUID.randomUUID();
        IdempotencyGuard.Reservation first = guard.begin(key, "body-A");
        assertThat(first.firstAttempt()).isTrue();
        assertThat(first.replayed()).isEmpty();

        guard.complete(first, 4242L);

        assertThat(guard.begin(key, "body-A").replayed()).contains(4242L);
        assertThatThrownBy(() -> guard.begin(key, "body-B"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining(ErrorCode.COMMON_CONFLICT.getCode());
    }

    @Test
    @DisplayName("처리 실패로 자리를 돌려주면 같은 키로 다시 시도할 수 있다")
    void releaseFreesTheSlot() {
        String key = "test:idem:" + UUID.randomUUID();
        IdempotencyGuard.Reservation first = guard.begin(key, "body");
        assertThatThrownBy(() -> guard.begin(key, "body"))
                .isInstanceOf(BusinessException.class);

        guard.release(first);

        assertThat(guard.begin(key, "body").firstAttempt()).isTrue();
    }

    @Test
    @DisplayName("완료된 값은 release 로 지워지지 않는다 — 늦게 온 실패가 최초 결과를 날리면 안 된다")
    void releaseDoesNotEraseCompletedValue() {
        String key = "test:idem:" + UUID.randomUUID();
        IdempotencyGuard.Reservation first = guard.begin(key, "body");
        guard.complete(first, 7L);

        guard.release(first);

        assertThat(guard.begin(key, "body").replayed()).contains(7L);
    }

    private Callable<Void> attempt(CyclicBarrier barrier, String key, String body,
                                   AtomicInteger won, AtomicInteger conflicted) {
        return () -> {
            barrier.await(10, TimeUnit.SECONDS);
            try {
                if (guard.begin(key, body).firstAttempt()) {
                    won.incrementAndGet();
                }
            } catch (BusinessException e) {
                assertThat(e.getErrorCode()).isEqualTo(ErrorCode.COMMON_CONFLICT);
                conflicted.incrementAndGet();
            }
            return null;
        };
    }
}
