package com.ssafy.b204.performance.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 공연 상태 자동 전이 — {@code ON_SALE} → {@code SALE_CLOSED} → {@code ENDED}.
 *
 * <p>요구사항 명세서 v5 §공연 상태가 두 전이를 <b>시각 도달 자동</b>으로 정했고 API v6 §4·§13에
 * 대응 엔드포인트가 없다. 이 주기 실행이 유일한 주체다.
 *
 * <p><b>로직을 갖지 않는다.</b> {@link PerformanceService#sweepStatusTransitions()}를 부르는
 * 시점만 정한다 — {@code OrderExpiryScheduler}·{@code SettlementScheduler}와 같은 모양이다.
 * {@code @Profile("!test")}로 테스트에서는 뜨지 않고(스케줄러가 돌면 테스트끼리 간섭한다) 동작은
 * 서비스 메서드를 직접 불러 검증한다.
 *
 * <p><b>여러 인스턴스가 같은 공연을 두 번 전이시키지 않는다.</b> 잠금 서버를 들이지 않고 DB가
 * 직렬화한다 — {@link com.ssafy.b204.performance.repository.PerformanceRepository#transitionStatus}의
 * 조건부 UPDATE가 {@code 1}을 돌려준 인스턴스만 전이시킨 것이다
 * ({@code TicketOrderRepository.cancelIfPending}과 같은 방식). 목록 조회가 겹치는 것은 무해하다.
 */
@Slf4j
@Component
@Profile("!test")
@RequiredArgsConstructor
public class PerformanceStatusScheduler {

    private final PerformanceService performanceService;

    /**
     * 주기 60초 — 마감·종료 시각과 상태 전이 사이의 지연 상한이다.
     *
     * <p>판매 마감은 공연 시작 1시간 전이고 종료는 공연이 끝난 시점이라 분 단위 정밀도로 족하다.
     * 이 지연이 티켓을 더 팔지는 않는다 — 주문 경로는 {@code saleCloseAt}을 직접 보므로
     * ({@code OrderService}) 상태가 늦게 바뀌어도 마감 후 예매는 거절된다. 상태는 <b>정산 진입</b>
     * ({@code SettlementGates}의 {@code ENDED} 조건)에 쓰인다.
     */
    @Scheduled(fixedDelayString = "PT60S")
    public void sweepDueTransitions() {
        try {
            performanceService.sweepStatusTransitions();
        } catch (RuntimeException e) {
            log.error("공연 상태 자동 전이 주기 실행 실패: {}", e.toString());
        }
    }
}
