package com.ssafy.b204.settlement;

import com.ssafy.b204.settlement.event.SettlementPayoutConfirmedEvent;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.context.event.EventListener;

/**
 * {@link SettlementPayoutConfirmedEvent} 를 <b>발행 시점에</b> 센다 — 중복 반영이 곧 중복 발행이다
 * ({@code SettlementConfirmFencingTest}).
 *
 * <p><b>{@code @RecordApplicationEvents} 를 쓰지 않은 이유</b>: 그쪽은 기록이 스레드에 묶여 있어
 * 풀 스레드에서 발행한 이벤트를 놓친다. 그리고 발행을 {@code AFTER_COMMIT} 구독
 * ({@code SettlementBalanceRefreshListener}) 쪽에서 세면 롤백된 중복 발행을 못 본다 — 세야 하는
 * 것은 "몇 번 발행됐는가"다.
 *
 * <p>공용 컨텍스트({@code SharedTestBeans})의 빈이라 모든 테스트의 발행을 센다. 쓰는 쪽이
 * {@link #reset()} 후 센다.
 */
public class PayoutEventCounter {

    private final AtomicInteger published = new AtomicInteger();

    /** {@code @TransactionalEventListener} 가 아니다 — 커밋 여부와 무관하게 발행을 센다. */
    @EventListener
    public void onPayoutConfirmed(SettlementPayoutConfirmedEvent event) {
        published.incrementAndGet();
    }

    public int countSince() {
        return published.get();
    }

    public void reset() {
        published.set(0);
    }
}
