package com.ssafy.b204.settlement.service;

import java.math.BigInteger;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * 정산 분배 계산 — 요구사항 v6 §7.2 · 문서 13 §4.7의 <b>서버 측 재현 구현</b>.
 *
 * <p><b>이 클래스는 정산액을 "정하지" 않는다.</b> 확정값은 컨트랙트
 * {@code RevenueSplitter.aggregate}가 온체인에서 계산한 {@code payoutsOf(showId)}이고, 이 클래스는
 * 같은 입력으로 같은 값이 나오는지 확인하는 <b>세 재현자 중 하나</b>다(컨트랙트 · 서버 · 브라우저).
 * 셋이 1원이라도 어긋나면 불변식 3(project-truth §7)이 깨지고 release를 막아야 한다.
 *
 * <pre>
 *   F   = floor(R × fixedRatioBp     / 10000)
 *   S   = floor(R × selectionRatioBp / 10000)
 *   f_i = floor(F × teamShareBp[i] / 10000)
 *   s_i = T &gt; 0 ? floor(S × choiceCount[i] / T) : floor(S / N)
 *   dust = R − Σ(f_i + s_i)          →  공연 생성 팀(host)에 전액 귀속
 *   검산  Σ pay_i = R                 1원 오차 0
 * </pre>
 *
 * <h2>왜 {@code long}이고 중간 계산은 왜 이렇게 하나</h2>
 *
 * <p>금액은 YoYo 정수(= 원)라 소수가 없다. {@code BigDecimal}·{@code double}을 쓰면 스케일·반올림
 * 모드가 끼어들 자리가 생기고, 그 자리가 곧 컨트랙트와 갈라지는 지점이다. 그래서 결과 타입은
 * {@code long}이다.
 *
 * <p>문제는 <b>중간값</b>이다. {@code R × bp}는 R이 9.2×10<sup>14</sup>을 넘으면 {@code long}에서
 * 넘치고, Java의 {@code long} 곱셈은 <b>넘쳐도 예외를 던지지 않는다</b> — 조용히 틀린 금액이 나온다.
 * Solidity는 {@code Math.mulDiv}로 512비트 중간값을 써서 이 자리에서 넘치지 않는다.
 *
 * <p>그래서 {@link #mulDiv(long, long, long)}는 두 갈래다.
 *
 * <ol>
 *   <li>{@code a × b}가 {@code long}에 들어가면(= {@link Math#multiplyHigh}의 상위 64비트가 0이고
 *       곱이 음수가 아니면) 그냥 {@code long}으로 계산한다. 시연 규모(R ≤ 수천만)는 전부 이 경로다.
 *   <li>넘치면 {@link BigInteger}로 정확히 계산하고 {@code longValueExact()}로 되돌린다.
 *       <b>이것이 Solidity {@code mulDiv}의 512비트 중간값과 같은 뜻이다</b> — mulDiv는 반올림 방식이
 *       아니라 오버플로 방지 장치이고, 임의 정밀도 정수에서는 {@code (a*b)/c}가 이미 같은 계산이다
 *       ({@code blockchain/test/calcSpec.ts} 머리말 참조).
 * </ol>
 *
 * <p>피연산자가 전부 0 이상이라 {@code /}(0 방향 절사)와 floor가 같지만, 사양이 floor라고 적혀
 * 있으므로 코드에도 {@link Math#floorDiv}로 남긴다. 음수가 들어오면 그 전에 거부한다.
 *
 * <p><b>계산 입력의 출처</b> — {@code distributable}은 온체인 {@code escrowOf(showId)}(보증금 제외),
 * {@code choiceCounts}는 온체인 {@code choiceCountsOf(showId)}다. 서버 티켓 집계는
 * <b>대사용</b>이지 계산 입력이 아니다(settlement-api §6).
 *
 * @see <a href="file:../../../../../../../blockchain/test/calcSpec.ts">blockchain/test/calcSpec.ts</a>
 */
@Component
public class SettlementCalculator {

    /** 만분율 분모. 컨트랙트 {@code RevenueSplitter.BP} · calcSpec {@code BP}와 같은 값. */
    public static final long BP = 10_000L;

    /** 한 공연의 최대 참여팀 수. 컨트랙트 {@code MAX_TEAMS} · calcSpec {@code MAX_TEAMS}와 같은 값. */
    public static final int MAX_TEAMS = 8;

    /**
     * 팀 하나의 몫. 인덱스는 온체인 {@code teamWallets} 배열 인덱스({@code teamIndex})다.
     *
     * @param fixedAmount  f_i — 고정 풀 분배액. ERD {@code settlement_share.equal_amount}
     * @param choiceAmount s_i — 관객 선택 풀 분배액. ERD {@code settlement_share.selection_amount}
     * @param dustAmount   host만 0이 아니다
     * @param totalAmount  pay_i = f_i + s_i + dust_i. 온체인 {@code payoutOf(showId, i)}와 같아야 한다
     */
    public record Share(
            int teamIndex,
            long fixedAmount,
            long choiceAmount,
            long dustAmount,
            long totalAmount,
            long choiceCount
    ) {}

    /**
     * 계산 결과 전체. {@code Aggregated}·{@code PayoutAssigned} 이벤트 필드와 1:1로 대응한다.
     *
     * @param totalChoices T = Σ choiceCount. {@code Aggregated.totalChoices}
     * @param dust         {@code Aggregated.dust}이자 host의 {@code PayoutAssigned.dustPart}
     */
    public record Result(
            long distributable,
            long fixedPool,
            long choicePool,
            long totalChoices,
            long dust,
            List<Share> shares
    ) {
        /** 팀별 몫 합계. 언제나 {@link #distributable}과 같다(생성 시 검산). */
        public long payoutSum() {
            long sum = 0;
            for (Share s : shares) {
                sum += s.totalAmount();
            }
            return sum;
        }
    }

    /**
     * 잠긴 규칙 × 온체인 카운터로 팀별 몫을 계산한다.
     *
     * @param distributable R — 온체인 {@code escrowOf(showId)}. <b>보증금은 포함되지 않는다.</b>
     * @param fixedRatioBp  {@code selectionRatioBp}와 합이 10000이어야 한다
     * @param teamShareBp   고정 풀 내 팀별 비율. 합 10000, 길이 = 팀 수 N
     * @param choiceCounts  팀별 관객 선택 카운터(티켓 1매 = 1표). 길이 = N
     * @param hostTeamIndex 공연 생성 팀. dust가 이 팀에 귀속된다
     * @throws IllegalArgumentException 규칙 형태가 깨졌을 때(합·길이·범위·음수). 호출부가 먼저 걸러야 한다
     * @throws IllegalStateException    검산 실패 — 우리 버그다. 조용히 넘어가지 않는다
     */
    public Result calculate(long distributable, int fixedRatioBp, int selectionRatioBp,
                            int[] teamShareBp, long[] choiceCounts, int hostTeamIndex) {
        validate(distributable, fixedRatioBp, selectionRatioBp, teamShareBp, choiceCounts,
                hostTeamIndex);

        int n = teamShareBp.length;
        long r = distributable;

        // 곱셈이 먼저. R * (bp / BP) 로 쓰면 정수 나눗셈이라 언제나 0이다.
        long fixedPool = mulDiv(r, fixedRatioBp, BP);
        long choicePool = mulDiv(r, selectionRatioBp, BP);

        long totalChoices = 0;
        for (long c : choiceCounts) {
            totalChoices = Math.addExact(totalChoices, c);
        }

        long[] fixedPart = new long[n];
        long[] choicePart = new long[n];
        long assigned = 0;
        for (int i = 0; i < n; i++) {
            fixedPart[i] = mulDiv(fixedPool, teamShareBp[i], BP);
            // T == 0(아무도 고르지 않음)에서만 균등 분배로 갈라진다. 이 분기를 빠뜨리면 0으로 나눈다.
            choicePart[i] = totalChoices == 0
                    ? Math.floorDiv(choicePool, n)
                    : mulDiv(choicePool, choiceCounts[i], totalChoices);
            assigned = Math.addExact(assigned, Math.addExact(fixedPart[i], choicePart[i]));
        }

        // 모든 나눗셈이 floor이고 bp 합이 10000이라 assigned <= R 이 항상 성립한다.
        long dust = r - assigned;
        if (dust < 0) {
            throw new IllegalStateException(
                    "dust가 음수다(" + dust + ") — floor 전제나 bp 합 전제가 깨졌다");
        }

        List<Share> shares = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            long dustPart = i == hostTeamIndex ? dust : 0L;
            shares.add(new Share(i, fixedPart[i], choicePart[i], dustPart,
                    fixedPart[i] + choicePart[i] + dustPart, choiceCounts[i]));
        }

        Result result = new Result(r, fixedPool, choicePool, totalChoices, dust, List.copyOf(shares));
        if (result.payoutSum() != r) {
            throw new IllegalStateException(
                    "불변식 3 위반: Σpay(" + result.payoutSum() + ") != R(" + r + ")");
        }
        return result;
    }

    /**
     * 규칙 형태 검증 — 컨트랙트 {@code _validateRuleShape}·calcSpec {@code validateRules}와 같은 조건.
     *
     * <p>여기서 갈라지는 지점을 앞으로 당긴다. "합이 10000"이라는 전제가 조용히 깨지면
     * {@code dust = R − Σbase}가 음수가 되고, 그때 Java는 조용한 음수, Solidity는 언더플로 revert로
     * 갈린다.
     */
    private void validate(long distributable, int fixedRatioBp, int selectionRatioBp,
                          int[] teamShareBp, long[] choiceCounts, int hostTeamIndex) {
        if (distributable < 0) {
            throw new IllegalArgumentException("R이 음수다: " + distributable);
        }
        int n = teamShareBp == null ? 0 : teamShareBp.length;
        if (n < 1 || n > MAX_TEAMS) {
            throw new IllegalArgumentException("팀 수가 1~" + MAX_TEAMS + " 범위 밖이다: " + n);
        }
        if (choiceCounts == null || choiceCounts.length != n) {
            throw new IllegalArgumentException("teamShareBp와 choiceCounts의 길이가 다르다");
        }
        if (hostTeamIndex < 0 || hostTeamIndex >= n) {
            throw new IllegalArgumentException("hostTeamIndex가 범위 밖이다: " + hostTeamIndex);
        }
        if ((long) fixedRatioBp + selectionRatioBp != BP) {
            throw new IllegalArgumentException(
                    "fixedRatioBp + selectionRatioBp != " + BP
                            + " (실제 " + ((long) fixedRatioBp + selectionRatioBp) + ")");
        }
        if (fixedRatioBp < 0 || selectionRatioBp < 0) {
            throw new IllegalArgumentException("비율이 음수다");
        }
        long shareSum = 0;
        for (int bp : teamShareBp) {
            if (bp < 0) {
                throw new IllegalArgumentException("teamShareBp가 음수다");
            }
            shareSum += bp;
        }
        if (shareSum != BP) {
            throw new IllegalArgumentException("Σ teamShareBp != " + BP + " (실제 " + shareSum + ")");
        }
        for (long c : choiceCounts) {
            if (c < 0) {
                throw new IllegalArgumentException("choiceCount가 음수다: " + c);
            }
        }
    }

    /**
     * {@code floor(a × b / d)}를 오버플로 없이 계산한다 — Solidity {@code Math.mulDiv}의 대응물.
     *
     * <p><b>a·b는 0 이상, d는 양수여야 한다.</b> 이 전제가 깨지면 두 경로가 갈린다 — 빠른 경로는
     * {@link Math#floorDiv}(내림)이고 느린 경로 {@link BigInteger#divide}는 0 방향 절사라, 음수
     * 피연산자에서만 1 차이가 난다. 그래서 전제를 주석으로 두지 않고 <b>진입부에서 거부</b>한다.
     * 호출부({@link #calculate})가 이미 음수를 걸러내므로 여기 걸리면 계산기 내부 버그다.
     *
     * <p>상위 64비트가 0이고 곱이 음수가 아니면 {@code long} 곱셈이 정확하므로 그대로 쓰고,
     * 넘칠 때만 {@link BigInteger}로 넘어간다. <b>두 경로의 결과는 언제나 같다</b> — 빠른 경로는
     * 느린 경로가 정확한 구간에서만 쓰인다.
     */
    private static long mulDiv(long a, long b, long d) {
        if (d <= 0) {
            throw new IllegalArgumentException("0 이하로 나눌 수 없다: " + d);
        }
        if (a < 0 || b < 0) {
            throw new IllegalArgumentException("mulDiv 는 음수를 받지 않는다: a=" + a + " b=" + b);
        }
        long product = a * b;
        if (Math.multiplyHigh(a, b) == 0 && product >= 0) {
            return Math.floorDiv(product, d);
        }
        return BigInteger.valueOf(a)
                .multiply(BigInteger.valueOf(b))
                .divide(BigInteger.valueOf(d))
                .longValueExact();
    }
}
