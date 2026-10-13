package com.ssafy.b204.ticket.service;

import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.repository.PerformanceRepository;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Component;

/**
 * 재고 대사 — 판매 중 공연의 Redis 재고를 DB 기대값({@link TicketStockBaseline})과 맞춘다.
 *
 * <p><b>왜 필요한가(2026-09-26).</b> 예전 선점 코드가 필드 부재 시 {@code "0"}을 남겨 영구 매진이
 * 된 공연이 있고, 커밋 직후 프로세스가 죽어 반납 구독이 돌지 못한 경우도 Redis 가 틀어진 채
 * 남는다. 판매가 시작되면 옵션 재설정(유일한 재초기화)이 막혀 복구 경로가 없었다.
 *
 * <p><b>경합을 오판하지 않는 장치 두 개.</b>
 * <ol>
 *   <li><b>두 번 관측</b> — 주문 생성은 Redis 를 먼저 빼고 DB 는 커밋 때 늘고, 만료·환불은 반대
 *       순서라 정상 흐름에도 잠깐 어긋난다. 차이가 보이면 {@code confirmDelay} 뒤 다시 재고
 *       <b>같은 차이</b>가 남은 것만 고친다. 진행 중이던 요청은 그 사이 끝나 차이가 사라진다.</li>
 *   <li><b>비교 후 교체</b>({@link TicketStock#compareAndSet}) — 두 번째 관측 값 그대로일 때만
 *       바꾼다. 그 사이 들어온 선점·반납을 덮지 않고, 인스턴스가 둘이어도 두 번 고치지 않는다.</li>
 * </ol>
 *
 * <p>필드가 아예 없는 종류는 건드리지 않는다 — 다음 선점이 같은 기준값으로 깐다
 * ({@link TicketStock#reserve}). 새 API 는 두지 않는다(계약 변경 없음). 스케줄은
 * {@link TicketStockReconcileScheduler}가 정한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TicketStockReconciler {

    private final PerformanceRepository performanceRepository;
    private final TicketStockBaseline baseline;
    private final TicketStock ticketStock;

    /** 관측 한 번의 어긋남. {@code delta = expected - redis}. */
    record Drift(int redis, int expected) {
        int delta() {
            return expected - redis;
        }
    }

    /**
     * 판매 중 공연 전부를 대사한다.
     *
     * @return 보정한 (공연, 티켓 종류) 수
     */
    public int reconcile(Duration confirmDelay) {
        List<Long> onSale = performanceRepository
                .findByStatusIn(List.of(Performance.Status.ON_SALE), Pageable.unpaged())
                .map(Performance::getPerformanceId)
                .toList();
        Map<Long, Map<Long, Drift>> suspected = new LinkedHashMap<>();
        for (Long performanceId : onSale) {
            Map<Long, Drift> drifts = drifts(performanceId);
            if (!drifts.isEmpty()) {
                suspected.put(performanceId, drifts);
            }
        }
        if (suspected.isEmpty()) {
            return 0;
        }
        sleep(confirmDelay);

        int fixed = 0;
        for (Map.Entry<Long, Map<Long, Drift>> entry : suspected.entrySet()) {
            Long performanceId = entry.getKey();
            Map<Long, Drift> again = drifts(performanceId);
            for (Map.Entry<Long, Drift> first : entry.getValue().entrySet()) {
                Long ticketTypeId = first.getKey();
                Drift now = again.get(ticketTypeId);
                if (now == null || now.delta() != first.getValue().delta()) {
                    continue; // 진행 중인 요청 때문이었거나 값이 움직였다 — 다음 주기에 다시 본다.
                }
                if (ticketStock.compareAndSet(performanceId, ticketTypeId, now.redis(),
                        now.expected())) {
                    fixed++;
                    log.warn("재고 대사 보정 — performanceId={} ticketTypeId={} redis={} -> expected={}",
                            performanceId, ticketTypeId, now.redis(), now.expected());
                }
            }
        }
        return fixed;
    }

    private Map<Long, Drift> drifts(Long performanceId) {
        Map<Long, Integer> redis = ticketStock.snapshot(performanceId);
        Map<Long, Drift> drifts = new LinkedHashMap<>();
        baseline.expectedAvailable(performanceId).forEach((ticketTypeId, expected) -> {
            Integer actual = redis.get(ticketTypeId);
            if (actual != null && actual.intValue() != expected.intValue()) {
                drifts.put(ticketTypeId, new Drift(actual, expected));
            }
        });
        return drifts;
    }

    private static void sleep(Duration delay) {
        if (delay.isZero() || delay.isNegative()) {
            return;
        }
        try {
            Thread.sleep(delay.toMillis());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
