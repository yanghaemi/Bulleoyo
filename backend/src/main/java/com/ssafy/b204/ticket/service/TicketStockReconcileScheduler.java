package com.ssafy.b204.ticket.service;

import java.time.Duration;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 재고 대사 주기 — 기동 30초 뒤 한 번, 이후 5분마다. 로직은 {@link TicketStockReconciler}에 있다.
 *
 * <p>기동 직후 한 번 도는 것이 요점이다 — 배포만으로 이미 굳은 재고가 풀린다. 5분은 크래시로
 * 반납을 놓친 재고가 묶여 있는 시간의 상한이다.
 *
 * <p>{@code @Profile("!test")}는 {@link OrderExpiryScheduler}와 같은 이유다(테스트 간 간섭).
 * 동작은 {@link TicketStockReconciler#reconcile}을 직접 불러 검증한다.
 */
@Slf4j
@Component
@Profile("!test")
@RequiredArgsConstructor
public class TicketStockReconcileScheduler {

    private final TicketStockReconciler reconciler;

    /** 두 번 관측 사이 간격 — 주문 생성 트랜잭션 하나가 끝나기에 충분히 길다. */
    @Value("${b204.ticket.stock-reconcile-confirm-delay:3s}")
    private Duration confirmDelay;

    @Scheduled(initialDelayString = "PT30S", fixedDelayString = "PT5M")
    public void reconcile() {
        try {
            int fixed = reconciler.reconcile(confirmDelay);
            if (fixed > 0) {
                log.warn("재고 대사 — {}건 보정", fixed);
            }
        } catch (RuntimeException e) {
            log.error("재고 대사 주기 실행 실패: {}", e.toString());
        }
    }
}
