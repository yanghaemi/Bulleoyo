package com.ssafy.b204.coin.service;

import com.ssafy.b204.coin.repository.CoinPerformanceRepository;
import com.ssafy.b204.coin.repository.CoinSettlementRepository;
import com.ssafy.b204.performance.entity.PerformanceParticipant;
import com.ssafy.b204.rule.entity.SettlementRule;
import com.ssafy.b204.rule.repository.SettlementRuleRepository;
import com.ssafy.b204.settlement.entity.Settlement;
import com.ssafy.b204.settlement.service.SettlementTeams;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 불변식 3 재계산의 <b>DB 단계</b> — 필요한 값을 전부 읽어 평범한 값 객체로 굳혀 돌려준다.
 *
 * <h2>왜 별도 빈인가 — 트랜잭션을 닫고 체인을 부르기 위해</h2>
 *
 * <p>{@link ReleasedSettlementAuditor}가 예전에는 {@code @Transactional(readOnly = true)} 하나로
 * DB 조회와 {@code eth_call}을 함께 감쌌다. 공용 RPC가 느려지면 <b>DB 커넥션이 그 시간만큼
 * 붙잡힌다</b> — 커넥션 풀은 노드 응답 시간을 기다리라고 있는 자원이 아니다(MR !73 리뷰, 정용기).
 *
 * <p>그래서 단계를 둘로 가른다. ① 여기서 트랜잭션 하나로 정산·규칙·참여팀·분배 내역을 모두 읽고
 * <b>엔티티가 아닌 원시 배열</b>로 굳힌다 → 트랜잭션 종료 ② 감사자가 트랜잭션 밖에서 체인을 읽고
 * 재계산한다. 자기 호출(self-invocation)은 프록시를 타지 않아 {@code @Transactional}이 무시되므로
 * 같은 클래스의 private 메서드로 나누는 것으로는 경계가 생기지 않는다 — 빈을 분리한 이유다.
 *
 * <p>굳혀서 내보내는 또 하나의 이유는 {@code open-in-view: false}다. 트랜잭션을 닫은 뒤 지연 로딩
 * 프록시를 건드리면 {@code LazyInitializationException}이 난다. 참여팀은
 * {@code findParticipantsWithTeam}이 {@code join fetch}로 팀까지 채워 오지만, 그래도 여기서
 * {@code teamId}·{@code teamShareBp}만 뽑아 배열로 내보낸다 — 다음 단계가 엔티티를 아예 못 만지게
 * 하는 편이 규칙을 지키기 쉽다.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ReleasedSettlementLoader {

    /**
     * 재계산에 필요한 한 정산의 입력 전부. <b>DB에 다시 묻지 않아도 되는 형태</b>여야 한다.
     *
     * @param teamIds        {@code teamIndex} 순서의 팀 PK — 온체인 배열 순서를 재현한 것
     * @param storedTotals   {@code teamIndex} 순서의 {@code settlement_share.total_amount}
     * @param storedCounts   {@code teamIndex} 순서의 {@code settlement_share.choice_count}
     * @param storedCountsComplete 참여팀 전원의 카운터가 저장돼 있는가 — 아니면 대체 카운터로 못 쓴다
     * @param storedSum      분배 내역 <b>전체</b> 합계(참여팀이 아닌 팀의 행까지 포함)
     */
    public record Candidate(
            long settlementId,
            long performanceId,
            Long showId,
            long distributable,
            int fixedRatioBp,
            int selectionRatioBp,
            long[] teamIds,
            int[] teamShareBp,
            int hostIndex,
            long[] storedTotals,
            long[] storedCounts,
            boolean storedCountsComplete,
            long storedSum
    ) {

        public int teamCount() {
            return teamIds.length;
        }
    }

    /**
     * 한 번의 적재 결과.
     *
     * @param inputMissingShows 규칙·매출·참여팀 구성이 없어 <b>DB 단계에서 이미</b> 평가할 수 없는 정산 수
     */
    public record Batch(List<Candidate> candidates, int inputMissingShows) {

        public static Batch empty() {
            return new Batch(List.of(), 0);
        }

        public boolean nothingToLoad() {
            return candidates.isEmpty() && inputMissingShows == 0;
        }
    }

    private final CoinSettlementRepository settlementRepository;
    private final CoinPerformanceRepository performanceRepository;
    private final SettlementRuleRepository settlementRuleRepository;

    /**
     * {@code RELEASED} 정산의 재계산 입력을 한 트랜잭션에서 전부 읽는다. 체인은 부르지 않는다.
     *
     * <p><b>{@code REQUIRES_NEW}인 이유</b>: 이 적재는 정산 확정 반영의
     * {@code @TransactionalEventListener(AFTER_COMMIT)}에서도 불린다. 그 시점에는 방금 커밋된
     * 트랜잭션의 커넥션·{@code EntityManager}가 아직 스레드에 묶여 있어서, {@code REQUIRED}로 두면
     * <b>이미 끝난 트랜잭션에 얹혀</b> 읽게 된다. 자기 트랜잭션을 열어 짧게 닫는 편이 호출 맥락과
     * 무관하게 같은 의미를 갖는다.
     */
    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    public Batch load() {
        List<Object[]> rows = settlementRepository.findByStatus(Settlement.Status.RELEASED);
        if (rows.isEmpty()) {
            return Batch.empty();
        }

        List<Candidate> candidates = new ArrayList<>(rows.size());
        int inputMissing = 0;
        for (Object[] row : rows) {
            Candidate candidate = toCandidate(toLong(row[0]), toLong(row[1]), toLong(row[2]),
                    toLong(row[3]), toLong(row[4]));
            if (candidate == null) {
                inputMissing++;
                continue;
            }
            candidates.add(candidate);
        }
        return new Batch(List.copyOf(candidates), inputMissing);
    }

    /** @return {@code null}이면 입력이 없어 평가 불가 */
    private Candidate toCandidate(Long settlementId, Long performanceId, Long showId,
                                  Long distributable, Long creatorTeamId) {
        if (distributable == null) {
            log.warn("불변식 3 평가 불가 — settlementId={} total_revenue가 비어 있다", settlementId);
            return null;
        }
        SettlementRule rule = settlementRuleRepository
                .findByPerformance_PerformanceId(performanceId)
                .orElse(null);
        if (rule == null) {
            log.warn("불변식 3 평가 불가 — settlementId={} 정산 규칙이 없다", settlementId);
            return null;
        }

        List<PerformanceParticipant> participants = performanceRepository.findParticipantsWithTeam(
                performanceId, PerformanceParticipant.Status.REGISTERED);
        SettlementTeams teams;
        try {
            teams = SettlementTeams.of(participants, creatorTeamId);
        } catch (RuntimeException e) {
            // 참여팀이 없거나 생성 팀이 목록에 없다 = dust를 줄 곳이 없다(SettlementTeams가 거부).
            log.warn("불변식 3 평가 불가 — settlementId={} 참여팀 구성을 재현할 수 없다: {}",
                    settlementId, e.getMessage());
            return null;
        }

        long[] teamIds = new long[teams.size()];
        for (int i = 0; i < teamIds.length; i++) {
            teamIds[i] = teams.at(i).getTeam().getTeamId();
        }

        Map<Long, Long> totals = new HashMap<>();
        Map<Long, Long> counts = new HashMap<>();
        long storedSum = 0;
        for (Object[] shareRow : settlementRepository.findShares(settlementId)) {
            Long teamId = toLong(shareRow[0]);
            long total = shareRow[1] == null ? 0L : toLong(shareRow[1]);
            Long count = shareRow[2] == null ? null : toLong(shareRow[2]);
            totals.put(teamId, total);
            if (count != null) {
                counts.put(teamId, count);
            }
            storedSum += total;
        }

        long[] storedTotals = new long[teamIds.length];
        long[] storedCounts = new long[teamIds.length];
        boolean countsComplete = teamIds.length > 0;
        for (int i = 0; i < teamIds.length; i++) {
            storedTotals[i] = totals.getOrDefault(teamIds[i], 0L);
            Long count = counts.get(teamIds[i]);
            countsComplete &= count != null;
            storedCounts[i] = count == null ? 0L : count;
        }

        return new Candidate(settlementId, performanceId, showId, distributable,
                rule.getFixedRatioBp(), rule.getSelectionRatioBp(), teamIds, teams.teamShareBp(),
                teams.hostIndex(), storedTotals, storedCounts, countsComplete, storedSum);
    }

    private static Long toLong(Object value) {
        return value == null ? null : ((Number) value).longValue();
    }
}
