package com.ssafy.b204.common.support;

import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * DB 트랜잭션 종료에 Redis 보상·확정을 매단다.
 *
 * <p><b>왜 필요한가.</b> 재고({@code stock:performance:*})와 멱등키({@code idem:*})는 Redis에 있고
 * <b>DB 트랜잭션 밖</b>이다. 재고를 뺀 뒤 주문 저장이 실패하면 DB는 되돌아가지만 Redis는 그대로
 * 남아 표가 영구히 잠긴다. 반대로 멱등키 완료 값을 커밋 전에 적으면, 아직 보이지 않는
 * {@code orderId}를 다른 요청이 재생해 404를 받는다.
 *
 * <p><b>트랜잭션이 없으면 조용히 무시되지 않게 한다.</b> Spring의
 * {@link TransactionSynchronizationManager#registerSynchronization}은 동기화가 활성이 아니면
 * {@code IllegalStateException}을 던지거나(등록 시점) 아무 일도 하지 않는다. 그 경로에서 보상이
 * 사라지면 원인을 찾을 수 없는 재고 누수가 된다. 그래서
 *
 * <ul>
 *   <li>{@link #afterCommit}은 트랜잭션이 없으면 <b>즉시 실행</b>한다 — 트랜잭션이 없다는 것은
 *       이미 확정됐다는 뜻이다
 *   <li>{@link #afterRollback}은 트랜잭션이 없으면 <b>등록하지 않는다</b> — 롤백될 것이 없다.
 *       이 경우 호출자가 {@code try/catch}로 직접 보상해야 하며, 두 경로가 겹쳐도 안전하도록
 *       보상 작업은 {@link #once}로 감싼다
 * </ul>
 *
 * <p>콜백에서 난 예외는 삼키고 로그만 남긴다. 보상이 실패했다고 이미 커밋된 트랜잭션을 되돌릴 수
 * 없고, 여기서 예외를 올리면 성공한 요청이 500으로 뒤집힌다. 재고 누수는 만료 스윕이 다시 줍는다.
 */
public final class TxCallbacks {

    private static final Logger log = LoggerFactory.getLogger(TxCallbacks.class);

    private TxCallbacks() {
    }

    /** 커밋 확정 후 실행. 트랜잭션이 없으면 즉시 실행한다. */
    public static void afterCommit(Runnable action) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            run(action);
            return;
        }
        register(TransactionSynchronization.STATUS_COMMITTED, action);
    }

    /** 롤백 확정 후 실행. 트랜잭션이 없으면 등록하지 않는다(호출자가 직접 보상한다). */
    public static void afterRollback(Runnable action) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            return;
        }
        register(TransactionSynchronization.STATUS_ROLLED_BACK, action);
    }

    /**
     * 여러 번 불려도 한 번만 도는 작업으로 감싼다.
     *
     * <p>보상은 {@code catch} 블록(트랜잭션이 없거나 예외가 메서드 안에서 잡힌 경우)과
     * {@link #afterRollback}(커밋 시점 실패) 두 곳에서 불릴 수 있다. 재고 원복이 두 번 돌면
     * <b>없던 표가 생긴다</b> — 초과 판매(REL-01 위반)다.
     */
    public static Runnable once(Runnable action) {
        AtomicBoolean done = new AtomicBoolean(false);
        return () -> {
            if (done.compareAndSet(false, true)) {
                run(action);
            }
        };
    }

    private static void register(int expectedStatus, Runnable action) {
        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCompletion(int status) {
                        if (status == expectedStatus) {
                            run(action);
                        }
                    }
                });
    }

    private static void run(Runnable action) {
        try {
            action.run();
        } catch (RuntimeException e) {
            // 응답을 뒤집지 않는다. 재고는 만료 스윕이, 멱등키는 TTL이 뒤를 받는다.
            log.error("트랜잭션 종료 콜백 실패 — 보상이 적용되지 않았다: {}", e.toString());
        }
    }
}
