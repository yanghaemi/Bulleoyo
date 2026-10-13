package com.ssafy.b204.verify.service;

import com.ssafy.b204.refund.entity.Refund;
import com.ssafy.b204.ticket.entity.TicketOrder;
import com.ssafy.b204.verify.repository.VerifyOrderRepository;
import com.ssafy.b204.verify.repository.VerifyRefundRepository;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 팀별 결제·환불 장부 집계 — API-verify-01 {@code onchainCounters[]}의
 * {@code purchaseCount}·{@code refundCount}·{@code refundedAmount}(FE 명세 결정요청 B-5).
 *
 * <p><b>온체인 카운터만으로는 감사 M-10을 볼 수 없다.</b> {@code choiceCount}는 이미 차감된 뒤의
 * 순 카운터라 "공격이 성공한 뒤의 모습"만 보여준다. 결제 건수·환불 건수·환불 금액을 나란히 놓아야
 * <b>환불 건수는 많은데 금액이 작다</b>는 신호가 화면에 드러난다
 * (컨트랙트 인터페이스 v1 §4.1 — "이 표시가 없으면 이 발견의 심각도는 높음이다").
 *
 * <p>출처는 서버 장부다({@code ticket_order}·{@code refund}).
 * {@code eth_getLogs}로 {@code Purchased}·{@code Refunded}를 훑지 않는다 — Kairos 공용 RPC가 블록
 * 범위를 제한해 공연 전 기간을 조회할 수 없고, 프론트가 직접 RPC를 부르는 대안은 "서버 집계" 구조와
 * 어긋난다(B-5 결론).
 */
@Component
@RequiredArgsConstructor
public class VerifyLedger {

    /**
     * 결제가 실제로 일어난 주문 상태. {@code REFUNDED}도 <b>결제 자체는 있었으므로</b> 포함한다 —
     * 결제 건수에서 빠지면 "결제 대비 환불" 비율이 왜곡돼 이 표시의 목적을 잃는다.
     */
    private static final List<TicketOrder.Status> PAID_ORDER_STATUSES =
            List.of(TicketOrder.Status.PAID, TicketOrder.Status.REFUNDED);

    private final VerifyOrderRepository orderRepository;
    private final VerifyRefundRepository refundRepository;

    /**
     * 팀 하나의 장부 수치.
     *
     * @param purchaseCount  결제 완료 주문 수
     * @param refundCount    <b>환불 이력이 있는 주문 수</b>. 같은 주문을 두 번 환불해도 1이다(A-2)
     * @param refundedAmount 환불 금액 합(YoYo). 건수와 달리 환불 행 전부를 더한다
     */
    public record TeamLedger(long purchaseCount, long refundCount, long refundedAmount) {

        static final TeamLedger EMPTY = new TeamLedger(0, 0, 0);
    }

    /**
     * 팀 id → 장부. <b>이력이 없는 팀은 키가 없다</b> — 참여팀 목록은 이 클래스가 아니라 조립부가
     * 들고 있으므로, 빠진 팀을 채우는 것도 조립부가 {@link #emptyLedger()}로 한다.
     */
    @Transactional(readOnly = true)
    public Map<Long, TeamLedger> byTeam(Long performanceId) {
        Map<Long, Long> purchases = new HashMap<>();
        for (Object[] row : orderRepository.countPaidOrdersByTeam(performanceId,
                PAID_ORDER_STATUSES)) {
            purchases.put((Long) row[0], ((Number) row[1]).longValue());
        }

        Map<Long, long[]> refunds = new HashMap<>();
        for (Object[] row : refundRepository.countRefundsByTeam(performanceId,
                Refund.Status.COMPLETED)) {
            refunds.put((Long) row[0],
                    new long[]{((Number) row[1]).longValue(), ((Number) row[2]).longValue()});
        }

        Map<Long, TeamLedger> result = new HashMap<>();
        for (Map.Entry<Long, Long> entry : purchases.entrySet()) {
            long[] refund = refunds.getOrDefault(entry.getKey(), new long[]{0, 0});
            result.put(entry.getKey(), new TeamLedger(entry.getValue(), refund[0], refund[1]));
        }
        // 결제 없이 환불만 있는 팀은 없어야 하지만, 있다면 그것 자체가 봐야 할 신호다. 숨기지 않는다.
        for (Map.Entry<Long, long[]> entry : refunds.entrySet()) {
            result.computeIfAbsent(entry.getKey(),
                    key -> new TeamLedger(0, entry.getValue()[0], entry.getValue()[1]));
        }
        return Map.copyOf(result);
    }

    /** 조회에 없는 팀의 기본값. */
    public static TeamLedger emptyLedger() {
        return TeamLedger.EMPTY;
    }
}
