package com.ssafy.b204.settlement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ssafy.b204.settlement.service.SettlementCalculator;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * {@link SettlementCalculator} — <b>{@code blockchain/test/calcSpec.ts}의 벡터를 그대로 옮긴 것</b>.
 *
 * <p>기대값을 여기서 다시 계산하지 않는다. calcSpec의 {@code VECTORS}에 손으로 검산해 적힌 값이고,
 * 온체인 {@code payoutsOf}·{@code Aggregated}·{@code PayoutAssigned}가 같은 값과 대조된다
 * ({@code Settlement.calc.test.ts}). 이 테스트가 빨개진다는 것은 <b>서버만 다른 답을 낸다</b>는
 * 뜻이고, 그 순간 불변식 3(project-truth §7)이 깨져 release를 막아야 한다.
 *
 * <p>벡터를 고칠 일이 생기면 calcSpec을 먼저 고치고 여기로 옮긴다. 반대 방향으로 맞추지 않는다.
 */
class SettlementCalculatorTest {

    private final SettlementCalculator calculator = new SettlementCalculator();

    /** calcSpec {@code SettlementVector}와 같은 모양. */
    private record Vector(String id, long r, int fixedBp, int selBp, int[] teamShareBp,
                          long[] counts, int hostIndex, long[] expectedPayout, long expectedDust) {}

    static Stream<Arguments> vectors() {
        return Stream.of(
                Arguments.of(new Vector("V1-요구사항-§7.3-예시",
                        2_000_000L, 5000, 5000, new int[]{3334, 3333, 3333},
                        new long[]{50, 30, 20}, 0,
                        new long[]{833_400L, 633_300L, 533_300L}, 0L)),
                Arguments.of(new Vector("V2-나누어떨어지지-않음",
                        1_000_001L, 5000, 5000, new int[]{3334, 3333, 3333},
                        new long[]{7, 13, 3}, 0,
                        new long[]{318_876L, 449_258L, 231_867L}, 3L)),
                Arguments.of(new Vector("V3-T=0-부분환불-후",
                        150_001L, 5000, 5000, new int[]{3334, 3333, 3333},
                        new long[]{0, 0, 0}, 0,
                        new long[]{50_007L, 49_997L, 49_997L}, 2L)),
                Arguments.of(new Vector("V4-1팀-경계",
                        100_001L, 7000, 3000, new int[]{10_000},
                        new long[]{2}, 0,
                        new long[]{100_001L}, 1L)),
                Arguments.of(new Vector("V5-8팀-극단bp",
                        1_000_001L, 1, 9999,
                        new int[]{1250, 1250, 1250, 1250, 1250, 1250, 1250, 1250},
                        new long[]{3, 0, 0, 0, 0, 0, 0, 1}, 0,
                        new long[]{749_942L, 12L, 12L, 12L, 12L, 12L, 12L, 249_987L}, 5L)),
                Arguments.of(new Vector("V6-R=0-무매출",
                        0L, 5000, 5000, new int[]{3334, 3333, 3333},
                        new long[]{0, 0, 0}, 0,
                        new long[]{0L, 0L, 0L}, 0L)));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("vectors")
    @DisplayName("calcSpec.ts VECTORS 와 같은 값을 낸다")
    void matchesCalcSpecVectors(Vector v) {
        SettlementCalculator.Result result = calculator.calculate(
                v.r(), v.fixedBp(), v.selBp(), v.teamShareBp(), v.counts(), v.hostIndex());

        List<SettlementCalculator.Share> shares = result.shares();
        assertThat(shares).hasSize(v.expectedPayout().length);
        for (int i = 0; i < v.expectedPayout().length; i++) {
            assertThat(shares.get(i).totalAmount())
                    .as("%s teamIndex=%d", v.id(), i)
                    .isEqualTo(v.expectedPayout()[i]);
        }
        assertThat(result.dust()).as("%s dust", v.id()).isEqualTo(v.expectedDust());
        // 1원 오차 0 — 이 한 줄이 불변식 3의 서버 측 표현이다.
        assertThat(result.payoutSum()).as("%s Σpay = R", v.id()).isEqualTo(v.r());
    }

    @Test
    @DisplayName("dust 는 언제나 공연 생성 팀(host)에만 붙는다")
    void dustGoesToHostOnly() {
        SettlementCalculator.Result result = calculator.calculate(
                1_000_001L, 5000, 5000, new int[]{3334, 3333, 3333},
                new long[]{7, 13, 3}, 1); // host 를 1번 팀으로 옮긴다

        assertThat(result.dust()).isEqualTo(3L);
        assertThat(result.shares().get(0).dustAmount()).isZero();
        assertThat(result.shares().get(1).dustAmount()).isEqualTo(3L);
        assertThat(result.shares().get(2).dustAmount()).isZero();
        assertThat(result.payoutSum()).isEqualTo(1_000_001L);
    }

    @Nested
    @DisplayName("오버플로 경계 — long 곱셈이 조용히 넘치면 안 된다")
    class OverflowBoundary {

        /**
         * {@code R × 10000}이 {@code long}을 넘는 구간. 빠른 경로(순수 long)로 계산하면 곱이 음수로
         * 돌아 <b>예외 없이 틀린 금액</b>이 나온다. mulDiv의 BigInteger 갈래가 이 자리를 막는다.
         */
        @Test
        @DisplayName("R × bp 가 long 을 넘어도 Σpay = R 이 성립한다")
        void hugeRevenue() {
            long r = 9_000_000_000_000_000L; // 9e15 — R × 10000 = 9e19 > Long.MAX

            SettlementCalculator.Result result = calculator.calculate(
                    r, 5000, 5000, new int[]{5000, 5000}, new long[]{1, 1}, 0);

            assertThat(result.payoutSum()).isEqualTo(r);
            assertThat(result.shares().get(0).totalAmount()).isEqualTo(r / 2);
            assertThat(result.shares().get(1).totalAmount()).isEqualTo(r / 2);
        }

        @Test
        @DisplayName("R = Long.MAX_VALUE 에서도 1원이 사라지지 않는다")
        void maxRevenue() {
            SettlementCalculator.Result result = calculator.calculate(
                    Long.MAX_VALUE, 5000, 5000, new int[]{10_000}, new long[]{0}, 0);

            assertThat(result.payoutSum()).isEqualTo(Long.MAX_VALUE);
            assertThat(result.dust()).isEqualTo(1L); // floor 두 번에서 남는 1원이 host 로 간다
        }

        @Test
        @DisplayName("선택 카운터가 커도 배분이 어긋나지 않는다")
        void hugeChoiceCounts() {
            long r = 1_000_000_000_000L;
            long[] counts = {3_000_000_000L, 1_000_000_000L};

            SettlementCalculator.Result result = calculator.calculate(
                    r, 0, 10_000, new int[]{5000, 5000}, counts, 0);

            assertThat(result.payoutSum()).isEqualTo(r);
            assertThat(result.shares().get(0).totalAmount()).isEqualTo(750_000_000_000L);
            assertThat(result.shares().get(1).totalAmount()).isEqualTo(250_000_000_000L);
        }
    }

    @Nested
    @DisplayName("규칙 형태가 깨지면 계산을 시작하지 않는다")
    class RuleShape {

        @Test
        @DisplayName("fixedRatioBp + selectionRatioBp != 10000")
        void ratioSum() {
            assertThatThrownBy(() -> calculator.calculate(
                    1000L, 5000, 4000, new int[]{10_000}, new long[]{1}, 0))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("10000");
        }

        @Test
        @DisplayName("Σ teamShareBp != 10000")
        void shareSum() {
            assertThatThrownBy(() -> calculator.calculate(
                    1000L, 5000, 5000, new int[]{5000, 4000}, new long[]{1, 1}, 0))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("teamShareBp");
        }

        @Test
        @DisplayName("팀 수 상한 8 초과")
        void tooManyTeams() {
            int[] bp = new int[9];
            java.util.Arrays.fill(bp, 1111);
            bp[8] = 1112;
            assertThatThrownBy(() -> calculator.calculate(
                    1000L, 5000, 5000, bp, new long[9], 0))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("hostTeamIndex 가 범위 밖")
        void hostOutOfRange() {
            assertThatThrownBy(() -> calculator.calculate(
                    1000L, 5000, 5000, new int[]{10_000}, new long[]{1}, 1))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("hostTeamIndex");
        }

        @Test
        @DisplayName("카운터 길이가 팀 수와 다르다")
        void lengthMismatch() {
            assertThatThrownBy(() -> calculator.calculate(
                    1000L, 5000, 5000, new int[]{5000, 5000}, new long[]{1}, 0))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }
}
