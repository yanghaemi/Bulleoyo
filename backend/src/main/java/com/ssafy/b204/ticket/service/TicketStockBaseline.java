package com.ssafy.b204.ticket.service;

import com.ssafy.b204.performance.entity.TicketType;
import com.ssafy.b204.performance.repository.TicketTypeRepository;
import com.ssafy.b204.ticket.entity.TicketOrder;
import com.ssafy.b204.ticket.repository.OrderItemRepository;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Redis 재고가 <b>있어야 할 값</b>을 DB에서 계산한다 — {@code total - sold - 결제 대기 수량}.
 *
 * <p><b>결제 대기는 만료 시각과 무관하게 전부 뺀다.</b> 만료됐지만 아직 스윕되지 않은 주문도
 * 곧 스윕이 {@link TicketStock#release}로 수량을 되돌린다. 여기서 빼지 않으면 그 반납이 한 번 더
 * 더해져 없는 표가 생긴다. {@code PENDING_PAYMENT}는 결국 {@code PAID}(sold 로 옮겨 감)나
 * {@code CANCELLED}(Redis 로 반납)로 끝나므로 이 식은 두 전이 모두에서 보존된다.
 */
@Component
@RequiredArgsConstructor
public class TicketStockBaseline {

    private final TicketTypeRepository ticketTypeRepository;
    private final OrderItemRepository orderItemRepository;

    /**
     * 공연의 티켓 종류별 기대 잔량. 음수일 수 있다(이미 초과 판매된 상태를 숨기지 않는다).
     *
     * <p>읽기 트랜잭션으로 두 조회를 한 스냅숏에 묶는다 — 사이에 결제 확정이 끼면 결제 대기에서
     * 빠진 수량이 sold 에는 아직 없어 기대값이 잠깐 틀린다. 주문 생성 안에서 불리면 그 트랜잭션에 합류한다.
     */
    @Transactional(readOnly = true)
    public Map<Long, Integer> expectedAvailable(Long performanceId) {
        Map<Long, Integer> pending = new HashMap<>();
        for (Object[] row : orderItemRepository.sumQuantityByTicketType(performanceId,
                TicketOrder.Status.PENDING_PAYMENT)) {
            pending.put(((Number) row[0]).longValue(), ((Number) row[1]).intValue());
        }
        Map<Long, Integer> expected = new LinkedHashMap<>();
        for (TicketType type : ticketTypeRepository.findByPerformance_PerformanceId(performanceId)) {
            expected.put(type.getTicketTypeId(), type.remainingQuantity()
                    - pending.getOrDefault(type.getTicketTypeId(), 0));
        }
        return expected;
    }
}
