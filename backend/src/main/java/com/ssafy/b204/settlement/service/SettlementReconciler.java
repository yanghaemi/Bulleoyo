package com.ssafy.b204.settlement.service;

import com.ssafy.b204.refund.entity.Refund;
import com.ssafy.b204.settlement.repository.SettlementRefundRepository;
import com.ssafy.b204.settlement.repository.SettlementTicketRepository;
import com.ssafy.b204.ticket.entity.Ticket;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 서버 집계 ↔ 온체인 카운터 <b>대사</b> — API-settlement-02가 존재하는 이유.
 *
 * <p>이 프로젝트가 블록체인을 쓰는 이유는 "관객이 고른 팀"이라는 <b>입력의 진실성</b>을 서버 혼자
 * 주장하지 않기 위해서다. 관객은 결제 tx 안에서 직접 팀을 골랐고(온체인 카운터), 서버는 티켓
 * 테이블로 같은 것을 센다. 두 값이 같을 때만 집계를 확정한다.
 *
 * <p><b>불일치를 덮지 않는다.</b> 어긋나면 409 {@code SETTLEMENT_AGGREGATE_MISMATCH}로 멈추고
 * 정산 상태는 {@code NONE} 그대로 둔다 — 되돌릴 수 있는 정지이지 {@code HALTED}가 아니다
 * (project-truth §6). {@code HALTED}는 사람이 판정한다.
 *
 * <p>체인을 못 읽으면 "통과"가 아니라 <b>대사 불가</b>다. 조회 실패를 통과로 처리하면 노드가 죽은
 * 날 아무 검증 없이 정산이 확정된다.
 */
@Component
@RequiredArgsConstructor
public class SettlementReconciler {

    /** 유효 티켓으로 세는 상태. {@code CANCELLED}는 환불된 표라 빠진다. */
    private static final List<Ticket.Status> VALID_TICKET_STATUSES =
            List.of(Ticket.Status.ISSUED, Ticket.Status.USED);

    private final SettlementTicketRepository ticketRepository;
    private final SettlementRefundRepository refundRepository;
    private final SettlementChainReader chainReader;

    /**
     * DB만으로 구한 매출·환불·팀별 표.
     *
     * @param netRevenue {@code gross − refunded}. 온체인 {@code escrowOf}와 대조할 값
     */
    public record ServerAggregate(
            long grossRevenue,
            long refundedAmount,
            long netRevenue,
            int validTicketCount,
            Map<Long, Long> countsByTeamId
    ) {}

    /**
     * 대사 결과.
     *
     * @param matched    {@code true}일 때만 집계를 확정할 수 있다
     * @param reasons    사람이 읽을 불일치 목록. {@code msg}에 넣지 않고 <b>로그·감사용</b>이다
     */
    public record Reconciliation(
            boolean matched,
            boolean chainRead,
            long serverNetRevenue,
            Long onChainEscrow,
            long[] serverCounts,
            long[] onChainCounts,
            List<String> reasons
    ) {}

    @Transactional(readOnly = true)
    public ServerAggregate serverAggregate(Long performanceId) {
        long gross = ticketRepository.sumGrossRevenue(performanceId);
        long refunded = refundRepository.sumCompletedRefund(performanceId, Refund.Status.COMPLETED);

        Map<Long, Long> counts = new HashMap<>();
        long total = 0;
        // 두 쿼리가 같은 status 를 본다 — 어긋나면 FAILED 환불 한 건이 집계를 영구히 막는다.
        for (Object[] row : ticketRepository.countValidTicketsByTeam(performanceId,
                VALID_TICKET_STATUSES, Refund.Status.COMPLETED)) {
            Long teamId = (Long) row[0];
            long count = ((Number) row[1]).longValue();
            counts.put(teamId, count);
            total += count;
        }
        return new ServerAggregate(gross, refunded, gross - refunded, Math.toIntExact(total),
                Map.copyOf(counts));
    }

    /**
     * 서버 집계를 온체인 값과 맞춰 본다.
     *
     * @param showId {@code performance.on_chain_id}. {@code null}이면 온체인에 공연이 없다는 뜻이라
     *               대사 불가
     */
    public Reconciliation reconcile(Long showId, SettlementTeams teams, ServerAggregate aggregate) {
        long[] serverCounts = teams.counts(aggregate.countsByTeamId());
        List<String> reasons = new ArrayList<>();

        if (showId == null) {
            reasons.add("공연이 온체인에 등록되지 않았다(on_chain_id 없음)");
            return new Reconciliation(false, false, aggregate.netRevenue(), null,
                    serverCounts, null, List.copyOf(reasons));
        }
        if (!chainReader.isAvailable()) {
            reasons.add("체인 설정이 없어 온체인 카운터를 읽을 수 없다");
            return new Reconciliation(false, false, aggregate.netRevenue(), null,
                    serverCounts, null, List.copyOf(reasons));
        }

        Optional<long[]> onChainCounts = chainReader.choiceCountsOf(showId);
        Optional<Long> escrow = chainReader.escrowOf(showId);
        if (onChainCounts.isEmpty() || escrow.isEmpty()) {
            reasons.add("온체인 조회 실패 — 대사할 수 없다");
            return new Reconciliation(false, false, aggregate.netRevenue(), escrow.orElse(null),
                    serverCounts, onChainCounts.orElse(null), List.copyOf(reasons));
        }

        long[] chainCounts = onChainCounts.get();
        if (chainCounts.length != serverCounts.length) {
            reasons.add("팀 수가 다르다 — 서버 " + serverCounts.length + " / 온체인 "
                    + chainCounts.length);
        } else {
            for (int i = 0; i < serverCounts.length; i++) {
                if (serverCounts[i] != chainCounts[i]) {
                    reasons.add("teamIndex=" + i + " 선택 수 불일치 — 서버 " + serverCounts[i]
                            + " / 온체인 " + chainCounts[i]);
                }
            }
        }
        if (aggregate.netRevenue() != escrow.get()) {
            reasons.add("정산 재원 불일치 — 서버 순매출 " + aggregate.netRevenue()
                    + " / 온체인 escrow " + escrow.get());
        }

        return new Reconciliation(reasons.isEmpty(), true, aggregate.netRevenue(), escrow.get(),
                serverCounts, chainCounts, List.copyOf(reasons));
    }

    /** 로그 한 줄로 만든다. 응답 {@code msg}에는 넣지 않는다(내부 수치 노출 금지). */
    public static String describe(Reconciliation reconciliation) {
        return "matched=" + reconciliation.matched()
                + " serverCounts=" + Arrays.toString(reconciliation.serverCounts())
                + " onChainCounts=" + Arrays.toString(reconciliation.onChainCounts())
                + " reasons=" + reconciliation.reasons();
    }
}
