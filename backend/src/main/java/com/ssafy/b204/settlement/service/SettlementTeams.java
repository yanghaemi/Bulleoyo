package com.ssafy.b204.settlement.service;

import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.performance.entity.PerformanceParticipant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * 팀 순서 — <b>온체인 {@code teamWallets} 배열 순서를 서버에서 재현한 것</b>.
 *
 * <p>정산 계산의 모든 배열({@code teamShareBp}·{@code choiceCounts}·{@code payouts})이 이 순서를
 * 공유한다. 순서가 한 칸이라도 어긋나면 <b>금액은 맞는데 팀이 바뀐다</b> — 합계 검산(Σpay = R)이
 * 통과하므로 계산기는 잡아내지 못하고, 잘못된 팀 지갑으로 코인이 간 뒤에야 드러난다.
 *
 * <p>그래서 순서의 정본은 {@code performance_participant.on_chain_index}다({@code createShow}가
 * 그 순서로 지갑 배열을 잠근다). 아직 배정되지 않았으면({@code null}) 등록 순서(PK)로 잇는다 —
 * {@code createShow} 전 단계에서도 조회 화면이 그려져야 하기 때문이고, 이 경우 온체인 배열과의
 * 일치는 보장되지 않으므로 <b>대사가 통과하지 못한다</b>(그것이 옳은 결과다).
 */
public record SettlementTeams(List<PerformanceParticipant> ordered, int hostIndex) {

    /**
     * @param participants {@code REGISTERED} 참여팀
     * @param creatorTeamId 공연 생성 팀 — dust 귀속처(host)
     */
    public static SettlementTeams of(List<PerformanceParticipant> participants, Long creatorTeamId) {
        List<PerformanceParticipant> sorted = new ArrayList<>(participants);
        sorted.sort(Comparator
                .comparing((PerformanceParticipant p) -> p.getOnChainIndex() == null
                        ? Integer.MAX_VALUE : p.getOnChainIndex())
                .thenComparing(PerformanceParticipant::getPerformanceParticipantId));

        int host = -1;
        for (int i = 0; i < sorted.size(); i++) {
            if (sorted.get(i).getTeam().getTeamId().equals(creatorTeamId)) {
                host = i;
                break;
            }
        }
        if (host < 0) {
            // 생성 팀이 참여팀 목록에 없다 = dust를 줄 곳이 없다. 계산을 시작하면 안 된다.
            throw ErrorCode.COMMON_CONFLICT.toException(
                    "공연 생성 팀이 참여팀 목록에 없어 정산을 계산할 수 없습니다.");
        }
        return new SettlementTeams(List.copyOf(sorted), host);
    }

    public int size() {
        return ordered.size();
    }

    /** 고정 풀 내 팀별 비율. 합이 10000이어야 하고, 아니면 계산기가 거부한다. */
    public int[] teamShareBp() {
        int[] bp = new int[ordered.size()];
        for (int i = 0; i < bp.length; i++) {
            Integer value = ordered.get(i).getTeamShareBp();
            bp[i] = value == null ? 0 : value;
        }
        return bp;
    }

    /** 팀별 서버 집계 카운트를 이 순서의 배열로 편다. 값이 없는 팀은 0. */
    public long[] counts(Map<Long, Long> countsByTeamId) {
        long[] counts = new long[ordered.size()];
        for (int i = 0; i < counts.length; i++) {
            counts[i] = countsByTeamId.getOrDefault(ordered.get(i).getTeam().getTeamId(), 0L);
        }
        return counts;
    }

    /** 참여팀이면 인덱스, 아니면 {@code -1}. */
    public int indexOfTeam(Long teamId) {
        for (int i = 0; i < ordered.size(); i++) {
            if (ordered.get(i).getTeam().getTeamId().equals(teamId)) {
                return i;
            }
        }
        return -1;
    }

    public PerformanceParticipant at(int index) {
        return ordered.get(index);
    }
}
