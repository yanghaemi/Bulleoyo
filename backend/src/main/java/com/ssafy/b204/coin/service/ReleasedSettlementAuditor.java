package com.ssafy.b204.coin.service;

import com.ssafy.b204.coin.service.ReleasedSettlementLoader.Batch;
import com.ssafy.b204.coin.service.ReleasedSettlementLoader.Candidate;
import com.ssafy.b204.settlement.service.SettlementCalculator;
import com.ssafy.b204.settlement.service.SettlementChainReader;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 불변식 3 — <b>공연별 {@code Σ Released = 잠긴 규칙 × 카운터}</b>(dust 포함, 0원 차)를 실제로 센다.
 *
 * <p>project-truth §7의 4개 불변식 중 <b>발표 성패가 걸린 것</b>이다. 나머지 셋은 "코인이 새지
 * 않았다"를 말하고, 이것은 "우리가 약속한 규칙대로 나눴다"를 말한다. 그래서 여기서 어긋나면
 * release를 막는다({@code COIN_RESERVE_MISMATCH}).
 *
 * <h2>무엇과 무엇을 비교하나</h2>
 *
 * <ul>
 *   <li><b>실제 Released</b> = {@code settlement_share.total_amount} 합. 온체인 {@code release}가
 *       실어 나른 금액의 서버 측 기록이다(팀별 {@code Released} 이벤트로 {@code released}가 선다).
 *   <li><b>재계산</b> = {@link SettlementCalculator}에 잠긴 규칙({@code settlement_rule})·
 *       팀별 {@code team_share_bp}·hostIndex·카운터·R({@code settlement.total_revenue})을 넣은 결과.
 * </ul>
 *
 * <p>팀별로 뺀 차이의 <b>최대 절대값</b>이 {@code maxDiff}다. 합계만 보면 두 팀의 금액이 서로
 * 바뀌어도(+1/−1) 0으로 상쇄돼 통과한다 — 그 사고가 정확히 이 프로젝트가 막아야 하는 사고다.
 *
 * <h2>DB를 먼저 닫고 체인을 부른다</h2>
 *
 * <p>이 클래스에는 <b>트랜잭션이 없다.</b> DB 조회는 {@link ReleasedSettlementLoader}가 자기
 * 트랜잭션 안에서 끝내고 값 객체로 넘겨주며, 여기서는 그 값을 들고 {@code eth_call}만 한다.
 * 트랜잭션 안에서 네트워크 I/O를 돌리면 노드가 느려질 때 DB 커넥션이 함께 묶인다
 * (MR !73 리뷰, 정용기). 두 자원의 대기 시간을 곱하지 않는 것이 목적이다.
 *
 * <h2>카운터 출처 — 온체인 우선, 저장값 대체, 팀 수가 다르면 평가 불가</h2>
 *
 * <p>계산 입력은 원래 <b>온체인 카운터</b>({@code choiceCountsOf})다(settlement-api §6). 노드를
 * <b>못 읽으면</b> {@code settlement_share.choice_count}(집계 확정 시 온체인 값을 그대로 스냅샷한
 * 것)로 대체하고 어느 쪽을 썼는지 note에 적는다.
 *
 * <p>다만 노드는 읽었는데 <b>배열 길이가 참여팀 수와 다른</b> 경우는 대체하지 않는다. 그것은 노드
 * 장애가 아니라 <b>서버와 체인의 팀 집합이 갈라졌다</b>는 사건이고, 저장 카운터로 갈아타면 갈라진
 * 사실이 note에서 "저장 카운터로 평가"라는 평범한 문장 뒤에 숨는다(MR !73 자동 리뷰). 그래서
 * 평가 불가로 세고 <b>사유를 따로</b> 적는다.
 *
 * <h2>평가하지 못한 정산을 통과로 세지 않는다</h2>
 *
 * <p>규칙이 없거나·R이 비었거나·카운터를 구할 수 없으면 <b>{@code checkedShows}에서 뺀다</b>
 * ({@code unevaluatedShows}로 세어 note에 적는다). "못 봤으니 통과"로 세면 대사가 늘 초록이고,
 * 그건 대사를 하지 않는 것과 같다(fail-open — 09-08 QA M-04·M-05와 같은 형태).
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ReleasedSettlementAuditor {

    /** 카운터를 어디서 읽었나. note에 그대로 나간다. */
    public enum CounterSource {
        /** 온체인 {@code choiceCountsOf} — 사양이 정한 계산 입력. */
        CHAIN,
        /** {@code settlement_share.choice_count} 스냅샷 — 체인을 못 읽을 때. */
        STORED
    }

    /**
     * 대사 결과 한 벌.
     *
     * @param checkedShows      실제로 재계산까지 마친 정산 수
     * @param mismatchedShows   팀별 금액이 하나라도 어긋난 정산 수
     * @param maxDiff           팀별 차이의 최대 절대값(YoYo). 0이면 전 팀이 1원까지 같다.
     *                          {@code checkedShows == 0}이면 의미가 없다 — 응답에서는 {@code null}이 된다
     * @param unevaluatedShows  평가하지 못한 정산 수(아래 두 사유의 <b>합</b>) — {@code checkedShows}에
     *                          들어가지 않는다
     * @param teamCountMismatchShows 그중 온체인 카운터 길이 ≠ 참여팀 수여서 평가하지 못한 정산 수
     * @param chainSourced      온체인 카운터로 평가한 정산 수
     * @param storedSourced     저장 카운터로 평가한 정산 수
     */
    public record Scan(
            int checkedShows,
            int mismatchedShows,
            long maxDiff,
            int unevaluatedShows,
            int teamCountMismatchShows,
            int chainSourced,
            int storedSourced
    ) {

        public static Scan empty() {
            return new Scan(0, 0, 0L, 0, 0, 0, 0);
        }

        /** 평가한 것 중 어긋난 것이 없으면 통과. 평가하지 못한 것은 <b>주장하지 않는다</b>. */
        public boolean matched() {
            return mismatchedShows == 0;
        }

        /** 검사도 못 하고 평가 대상도 없었다 = 아직 release된 정산이 없다. */
        public boolean nothingToCheck() {
            return checkedShows == 0 && unevaluatedShows == 0;
        }

        /** 규칙·매출·카운터가 없어 평가하지 못한 수 — 팀 수 불일치와 사유가 다르다. */
        public int inputMissingShows() {
            return unevaluatedShows - teamCountMismatchShows;
        }
    }

    private final ReleasedSettlementLoader loader;
    private final SettlementChainReader chainReader;
    private final SettlementCalculator calculator;

    /**
     * {@code RELEASED} 정산 전부를 재계산해 비교한다.
     *
     * <p><b>트랜잭션 밖에서 돈다.</b> DB는 {@link ReleasedSettlementLoader#load()}가 자기
     * 트랜잭션에서 이미 닫았고, 이 루프는 정산 하나당 {@code eth_call} 한 번과 순수 계산뿐이다.
     *
     * <p>정산 수만큼 {@code eth_call}이 나가므로 공연이 수백 개가 되면 30초 주기로도 무겁다.
     * MVP 시연 규모(공연 한 자리 수)에서는 문제가 없고, 커지면 마지막 대사 시각을
     * {@code settlement}에 적어 두고 증분만 도는 것이 다음 수다.
     */
    public Scan scan() {
        Batch batch = loader.load();
        if (batch.nothingToLoad()) {
            return Scan.empty();
        }

        int checked = 0;
        int mismatched = 0;
        long maxDiff = 0;
        int unevaluated = batch.inputMissingShows();
        int teamCountMismatch = 0;
        int chainSourced = 0;
        int storedSourced = 0;

        for (Candidate candidate : batch.candidates()) {
            Counters counters = counters(candidate);
            if (counters == null) {
                unevaluated++;
                continue;
            }
            if (counters.teamCountMismatch()) {
                unevaluated++;
                teamCountMismatch++;
                continue;
            }

            Long showMaxDiff = evaluate(candidate, counters.counts());
            if (showMaxDiff == null) {
                unevaluated++;
                continue;
            }

            checked++;
            if (counters.source() == CounterSource.CHAIN) {
                chainSourced++;
            } else {
                storedSourced++;
            }
            if (showMaxDiff != 0) {
                mismatched++;
                maxDiff = Math.max(maxDiff, showMaxDiff);
                log.error("불변식 3 위반 — settlementId={} performanceId={} 최대 차이={} (카운터 출처 {})",
                        candidate.settlementId(), candidate.performanceId(), showMaxDiff,
                        counters.source());
            }
        }

        if (unevaluated > 0) {
            log.warn("불변식 3 — 평가하지 못한 RELEASED 정산 {}건(그중 온체인 팀 수 불일치 {}건)",
                    unevaluated, teamCountMismatch);
        }
        return new Scan(checked, mismatched, maxDiff, unevaluated, teamCountMismatch, chainSourced,
                storedSourced);
    }

    // ------------------------------------------------------------------ 정산 하나

    /** @return 팀별 차이의 최대 절대값. {@code null}이면 재계산 자체가 실패해 평가 불가 */
    private Long evaluate(Candidate candidate, long[] counts) {
        SettlementCalculator.Result result;
        try {
            result = calculator.calculate(candidate.distributable(), candidate.fixedRatioBp(),
                    candidate.selectionRatioBp(), candidate.teamShareBp(), counts,
                    candidate.hostIndex());
        } catch (RuntimeException e) {
            // 규칙 형태가 깨졌다(bp 합·길이·음수). RELEASED까지 온 정산에서 이러면 심각하지만,
            // "금액이 어긋났다"는 주장과는 다른 사건이라 mismatch가 아니라 평가 불가로 센다.
            log.error("불변식 3 평가 불가 — settlementId={} 재계산이 실패했다",
                    candidate.settlementId(), e);
            return null;
        }

        long showMaxDiff = 0;
        long recalcSum = 0;
        for (SettlementCalculator.Share share : result.shares()) {
            long actual = candidate.storedTotals()[share.teamIndex()];
            showMaxDiff = Math.max(showMaxDiff, Math.abs(actual - share.totalAmount()));
            recalcSum += share.totalAmount();
        }
        // 참여팀이 아닌 팀의 share 행이 섞여 있으면 팀별 차이가 0인데 합계가 어긋난다.
        // 그 경우에도 maxDiff가 0이면 "불일치인데 차이 0"이 되어 읽는 사람을 속인다.
        return Math.max(showMaxDiff, Math.abs(candidate.storedSum() - recalcSum));
    }

    /**
     * @param teamCountMismatch 온체인 카운터를 읽었으나 길이가 참여팀 수와 달랐다 — 평가 불가의
     *                          <b>별도 사유</b>다. 이때 {@code counts}는 비어 있다
     */
    private record Counters(long[] counts, CounterSource source, boolean teamCountMismatch) {

        static Counters ofTeamCountMismatch() {
            return new Counters(new long[0], null, true);
        }
    }

    /**
     * 카운터를 고른다 — <b>온체인 우선, 저장값 대체, 팀 수가 다르면 평가 불가.</b>
     *
     * <p>온체인 배열의 길이가 참여팀 수와 다르면 저장값으로 갈아타지 <b>않는다</b>. 길이가 다르면
     * 인덱스 대응이 깨져 <b>금액은 맞는데 팀이 바뀌는</b> 비교가 되고, 더 중요하게는 서버와 체인의
     * 팀 집합이 갈라졌다는 신호다. 저장 카운터로 조용히 평가하면 그 신호가 사라진다.
     *
     * @return {@code null}이면 카운터를 어디에서도 구하지 못했다
     */
    private Counters counters(Candidate candidate) {
        if (candidate.showId() != null && chainReader.isAvailable()) {
            Optional<long[]> onChain = chainReader.choiceCountsOf(candidate.showId());
            if (onChain.isPresent()) {
                if (onChain.get().length == candidate.teamCount()) {
                    return new Counters(onChain.get(), CounterSource.CHAIN, false);
                }
                log.error("불변식 3 평가 불가 — 온체인 카운터 길이가 참여팀 수와 다르다"
                                + "(settlementId={} 온체인 {} / 서버 {}). 서버·체인의 팀 집합이 갈라졌다",
                        candidate.settlementId(), onChain.get().length, candidate.teamCount());
                return Counters.ofTeamCountMismatch();
            }
        }

        if (candidate.storedCountsComplete()) {
            return new Counters(candidate.storedCounts(), CounterSource.STORED, false);
        }

        log.warn("불변식 3 평가 불가 — settlementId={} 카운터를 온체인·저장값 어디에서도 구할 수 없다",
                candidate.settlementId());
        return null;
    }
}
