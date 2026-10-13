package com.ssafy.b204.ticket.service;

import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 결제 만료 주문 스윕 — 재고를 되돌리는 <b>안전망</b>.
 *
 * <p><b>왜 배치가 필요한가.</b> 만료 정리는 {@link OrderService#expireIfNeeded}가 조회 시점에
 * lazy로 한다. 즉시성은 좋지만 <b>아무도 그 주문을 열지 않으면 재고가 영영 돌아오지 않는다</b> —
 * 결제를 포기한 관객은 목록을 다시 보지 않는다. 주문 생성의 롤백 구독도 커밋 직후의 크래시는
 * 막지 못한다. 그 둘을 뒤에서 받는다.
 *
 * <p><b>lazy 경로를 대체하지 않는다.</b> 화면에서 만료를 즉시 보여 주는 것은 여전히 조회 경로다.
 *
 * <p><b>여러 인스턴스가 같은 주문을 두 번 처리하지 않는다.</b> 잠금 서버(ShedLock 등)를 들이지
 * 않고 DB가 직렬화한다 — {@code TicketOrderRepository.cancelIfPending}의 조건부 UPDATE가 1을
 * 돌려준 인스턴스만 재고를 반납한다. 목록 조회가 겹치는 것은 무해하고, 실제 부작용은 그 한 줄이
 * 가른다.
 *
 * <p><b>{@code @Profile("!test")}</b>: 테스트에서 스케줄러가 돌면 테스트끼리 간섭한다
 * ({@code SettlementScheduler}·체인 워커도 같은 이유로 꺼 둔다). 동작 자체는
 * {@link OrderService#findExpiredOrderIds}·{@link OrderService#expireOrder}를 직접 불러 검증한다
 * — 스케줄러는 <b>부르는 시점만</b> 정하고 로직을 갖지 않는다.
 */
@Slf4j
@Component
@Profile("!test")
@RequiredArgsConstructor
public class OrderExpiryScheduler {

    /**
     * 한 주기에 보는 주문 수. 결제 만료는 15분이고 주기가 60초라 정상 부하에서는 한 자릿수다.
     * 상한을 두는 이유는 장애 후 밀린 물량이 한 트랜잭션을 길게 잡지 않게 하기 위해서다.
     */
    private static final int BATCH_SIZE = 200;

    private final OrderService orderService;

    /**
     * 결제 시한이 지난 주문을 취소하고 재고를 되돌린다.
     *
     * <p>주기 60초 — 만료 시각과 재고 반납 사이의 지연 상한이다. 결제 만료 15분에 비해 충분히
     * 짧고, 매초 도는 체인 워커와 달리 DB만 훑으므로 이 간격이면 족하다.
     */
    @Scheduled(fixedDelayString = "PT60S")
    public void expireDueOrders() {
        try {
            List<Long> due = orderService.findExpiredOrderIds(BATCH_SIZE);
            int expired = 0;
            for (Long orderId : due) {
                try {
                    if (orderService.expireOrder(orderId)) {
                        expired++;
                    }
                } catch (RuntimeException e) {
                    // 한 건이 실패해도 나머지는 계속 처리한다 — 재고가 묶여 있는 시간이 길어진다.
                    log.error("주문 만료 처리 실패 — orderId={}: {}", orderId, e.toString());
                }
            }
            if (expired > 0) {
                log.info("만료 주문 정리 — {}건(대상 {}건)", expired, due.size());
            }
        } catch (RuntimeException e) {
            log.error("만료 주문 스윕 주기 실행 실패: {}", e.toString());
        }
    }
}
