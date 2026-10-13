/**
 * calcSpec — 정산 계산(요구사항 v6 §7.2 · 문서 13 §4.7)의 **참조 구현**.
 *
 * ---------------------------------------------------------------------------
 * 이 파일이 존재하는 이유
 * ---------------------------------------------------------------------------
 * 이 프로젝트가 "블록체인이 정산에 쓸모 있다"고 말할 수 있는 근거는 단 하나다 —
 * **같은 입력이면 누가 계산해도 같은 결과가 나온다.** 그 "누구"가 셋이다:
 *
 *   ① 컨트랙트 `RevenueSplitter.aggregate` (Solidity `uint256`)  — 온체인 확정값
 *   ② 서버 `SettlementCalculator`          (Java `long`/`BigInteger`) — 정산 화면·대사
 *   ③ 검증 페이지                           (브라우저 TS `bigint`)      — 관객·팀의 독립 검증
 *
 * 셋이 1원이라도 어긋나면 불변식 3(project-truth §7)이 깨지고, 그 순간 이 프로젝트의
 * 발표 서사가 통째로 무너진다. 그래서 이 파일은 **테스트 헬퍼가 아니라 사양(spec)** 이다.
 *
 * ---------------------------------------------------------------------------
 * 옮겨 쓰는 사람에게 (오민근 → 이강륜·강병구·서버 Java)
 * ---------------------------------------------------------------------------
 * - **`VECTORS`를 복사해 가서 그대로 통과시켜라.** 값을 다시 계산하지 마라 —
 *   기대값은 손으로 검산한 것이고, 온체인 값과 `Settlement.calc.test.ts`가 대조한다.
 * - `computeSettlement`의 **나눗셈 순서와 floor 지점**을 바꾸지 마라. 수학적으로 같아 보이는
 *   변형(예: `R * bp / BP`를 `R / BP * bp`로)이 몇 원씩 어긋난다.
 * - **JS `number`를 쓰지 마라.** 금액은 전부 `bigint`다. `number`는 2^53에서 정밀도가 깨지고
 *   `/`가 실수 나눗셈이라 floor가 아니다. Java는 `long`(또는 `BigInteger`), Solidity는 `uint256`.
 * - Solidity만 `Math.mulDiv`(512비트 중간값)를 쓴다. `bigint`·`BigInteger`는 자리수 제한이
 *   없어 `(a * b) / c`가 이미 같은 뜻이다. **결과는 같다** — mulDiv는 overflow 방지 장치이지
 *   반올림 방식이 아니다.
 *
 * 실행: cd blockchain && npx hardhat test test/Settlement.calc.test.ts
 */

/** 만분율 분모. 컨트랙트 `RevenueSplitter.BP`와 같은 값이어야 한다. */
export const BP = 10_000n;

/** 한 공연의 최대 참여팀 수. 컨트랙트 `MAX_TEAMS`와 같은 값. */
export const MAX_TEAMS = 8;

/** 잠긴 규칙 — `startSale` 이후 누구도 바꿀 수 없는 부분. */
export interface SettlementRules {
  /** 고정 분배 풀 비율(bp). `selectionRatioBp`와 합이 10000이어야 한다. */
  fixedRatioBp: bigint;
  /** 관객 선택 풀 비율(bp). */
  selectionRatioBp: bigint;
  /** 고정 풀 내 팀별 비율(bp). 합이 10000이어야 한다. 길이 = 팀 수 N. */
  teamShareBp: bigint[];
  /** 공연 생성 팀. dust가 이 팀에 귀속된다. */
  hostTeamIndex: number;
}

/** 규칙 + 집계 시점의 상태. */
export interface SettlementInput extends SettlementRules {
  /** R = 분배 대상 총액 = 온체인 `escrowOf(showId)`. **보증금은 포함되지 않는다.** */
  distributable: bigint;
  /** 팀별 관객 선택 카운터. 길이 = 팀 수 N. 티켓 1매 = 1표. */
  choiceCount: bigint[];
}

/** 계산 결과. 이벤트 `PayoutAssigned`·`Aggregated`의 필드와 1:1로 대응한다. */
export interface SettlementResult {
  /** F = floor(R × fixedRatioBp / 10000). */
  fixedPool: bigint;
  /** S = floor(R × selectionRatioBp / 10000). */
  choicePool: bigint;
  /** T = Σ choiceCount. `Aggregated.totalChoices`. */
  totalChoices: bigint;
  /** f_i. `PayoutAssigned.fixedPart`. */
  fixedPart: bigint[];
  /** s_i. `PayoutAssigned.choicePart`. */
  choicePart: bigint[];
  /** base_i = f_i + s_i. dust 반영 전. */
  base: bigint[];
  /** dust = R − Σ base. `Aggregated.dust`이자 host의 `PayoutAssigned.dustPart`. */
  dust: bigint;
  /** pay_i. `PayoutAssigned.total` = `payoutsOf(showId)` = `Released.amount`. */
  payout: bigint[];
}

/**
 * 잠긴 규칙의 형태 검증. 컨트랙트 `_validateRuleShape`가 `createShow`·`updateRules`에서
 * 강제하는 것과 같은 조건이라, 여기까지 온 입력은 온체인에서도 반드시 성립한다.
 *
 * @dev 이걸 참조 구현 안에 두는 이유 — 서버·프론트가 옮겨 쓸 때 "합이 10000"이라는
 *      전제가 조용히 깨지면 `dust = R − Σ base`가 음수가 되어 `bigint`에서는 조용히
 *      음수로, Solidity에서는 언더플로 revert로 갈린다. **갈리는 지점을 앞으로 당긴다.**
 */
export function validateRules(input: SettlementInput): void {
  const n = input.teamShareBp.length;
  if (n < 1 || n > MAX_TEAMS) throw new Error(`팀 수가 1~${MAX_TEAMS} 범위 밖이다: ${n}`);
  if (input.choiceCount.length !== n) throw new Error("teamShareBp 와 choiceCount 의 길이가 다르다");
  if (input.hostTeamIndex < 0 || input.hostTeamIndex >= n) throw new Error("hostTeamIndex 가 범위 밖이다");
  if (input.fixedRatioBp + input.selectionRatioBp !== BP) {
    throw new Error(`fixedRatioBp + selectionRatioBp != ${BP}`);
  }
  const shareSum = input.teamShareBp.reduce((a, b) => a + b, 0n);
  if (shareSum !== BP) throw new Error(`Σ teamShareBp != ${BP} (실제 ${shareSum})`);
}

/**
 * **요구사항 v6 §7.2 · 문서 13 §4.7 그대로.** 이 함수의 줄 순서가 곧 사양이다.
 *
 * ```
 *   F   = floor(R × fixedRatioBp     / 10000)
 *   S   = floor(R × selectionRatioBp / 10000)
 *   f_i = floor(F × teamShareBp[i] / 10000)
 *   s_i = T > 0 ? floor(S × choiceCount[i] / T) : floor(S / N)
 *   dust = R − Σ(f_i + s_i)          →  host 에 귀속
 *   검산  Σ pay_i = R                 1원 오차 0
 * ```
 */
export function computeSettlement(input: SettlementInput): SettlementResult {
  validateRules(input);

  const R = input.distributable;
  const n = BigInt(input.teamShareBp.length);

  // 곱셈이 먼저. `R * (bp / BP)`로 쓰면 정수 나눗셈이라 언제나 0이다.
  const fixedPool = (R * input.fixedRatioBp) / BP;
  const choicePool = (R * input.selectionRatioBp) / BP;

  const totalChoices = input.choiceCount.reduce((a, b) => a + b, 0n);

  const fixedPart: bigint[] = [];
  const choicePart: bigint[] = [];
  const base: bigint[] = [];
  let assigned = 0n;

  for (let i = 0; i < input.teamShareBp.length; i++) {
    const f = (fixedPool * input.teamShareBp[i]) / BP;
    // T == 0(아무도 고르지 않음)에서만 균등 분배로 갈라진다. 이 분기를 빠뜨리면 0으로 나눈다.
    const c = totalChoices === 0n ? choicePool / n : (choicePool * input.choiceCount[i]) / totalChoices;
    fixedPart.push(f);
    choicePart.push(c);
    base.push(f + c);
    assigned += f + c;
  }

  // 모든 나눗셈이 floor이고 bp 합이 10000이라 assigned <= R 이 항상 성립한다.
  const dust = R - assigned;
  if (dust < 0n) throw new Error(`dust 가 음수다 (${dust}) — floor 전제나 bp 합 전제가 깨졌다`);

  const payout = base.slice();
  payout[input.hostTeamIndex] += dust; // dust 는 공연 생성 팀에 통째로 귀속된다.

  const paySum = payout.reduce((a, b) => a + b, 0n);
  if (paySum !== R) throw new Error(`불변식 위반: Σ pay(${paySum}) != R(${R})`);

  return { fixedPool, choicePool, totalChoices, fixedPart, choicePart, base, dust, payout };
}

// ===========================================================================
// 테스트 벡터 — 세 구현이 **이 값 그대로** 나와야 한다
// ===========================================================================

/**
 * 벡터 하나. `expectedPayout`·`expectedDust`는 **손으로 검산한 값**이며,
 * `Settlement.calc.test.ts`가 ① 이 참조 구현 ② 온체인 `payoutsOf` ③ `Aggregated`·
 * `PayoutAssigned` 이벤트 넷을 전부 이 값과 대조한다.
 */
export interface SettlementVector {
  id: string;
  why: string;
  input: SettlementInput;
  expectedPayout: bigint[];
  expectedDust: bigint;
}

export const VECTORS: SettlementVector[] = [
  {
    id: "V1-요구사항-§7.3-예시",
    why: "요구사항 v6 §7.3 · 문서 13 §4.7이 직접 적어 둔 예시. 문서와 코드가 갈라지면 여기서 먼저 빨개진다.",
    input: {
      distributable: 2_000_000n,
      fixedRatioBp: 5000n,
      selectionRatioBp: 5000n,
      teamShareBp: [3334n, 3333n, 3333n],
      choiceCount: [50n, 30n, 20n],
      hostTeamIndex: 0,
    },
    expectedPayout: [833_400n, 633_300n, 533_300n],
    expectedDust: 0n,
  },
  {
    id: "V2-나누어떨어지지-않음",
    why:
      "R = 1,000,001 · 카운트 7/13/3(T=23) · bp 3334/3333/3333 — contract-dev §5(c)가 요구하는 " +
      "'나누어떨어지지 않는 벡터'. floor가 6번 일어나고 dust 3이 host로 간다.",
    input: {
      distributable: 1_000_001n,
      fixedRatioBp: 5000n,
      selectionRatioBp: 5000n,
      teamShareBp: [3334n, 3333n, 3333n],
      choiceCount: [7n, 13n, 3n],
      hostTeamIndex: 0,
    },
    // f = [166700, 166650, 166650] · s = [152173, 282608, 65217] · Σbase = 999,998
    expectedPayout: [318_876n, 449_258n, 231_867n],
    expectedDust: 3n,
  },
  {
    id: "V3-T=0-부분환불-후",
    why:
      "T == 0 인데 R > 0 인 유일한 실제 경로 — 모든 주문이 **부분** 환불된 상태다(A-2: 표는 첫 " +
      "환불에서 전량 빠지고 취소 수수료 잔액은 escrow 에 남는다). 0으로 나누는 분기와 " +
      "'환불 뒤 R' 이 한 벡터에서 같이 검증된다.",
    input: {
      distributable: 150_001n,
      fixedRatioBp: 5000n,
      selectionRatioBp: 5000n,
      teamShareBp: [3334n, 3333n, 3333n],
      choiceCount: [0n, 0n, 0n],
      hostTeamIndex: 0,
    },
    // F = S = 75,000 · f = [25005, 24997, 24997] · s = floor(75000/3) = 25000 균등 · Σbase = 149,999
    expectedPayout: [50_007n, 49_997n, 49_997n],
    expectedDust: 2n,
  },
  {
    id: "V4-1팀-경계",
    why:
      "팀 수 하한 N = 1. 이 팀이 곧 host라 dust까지 자기 것이고, Σpay = R 이 단 한 줄로 성립해야 " +
      "한다. bp도 5000/5000이 아닌 7000/3000으로 둬 비율 자리를 흔든다.",
    input: {
      distributable: 100_001n,
      fixedRatioBp: 7000n,
      selectionRatioBp: 3000n,
      teamShareBp: [10_000n],
      choiceCount: [2n],
      hostTeamIndex: 0,
    },
    // F = 70,000 · S = 30,000 · f = 70,000 · s = 30,000 · base = 100,000 · dust = 1
    expectedPayout: [100_001n],
    expectedDust: 1n,
  },
  {
    id: "V5-8팀-극단bp",
    why:
      "팀 수 상한 N = 8(release 루프 최악). fixedRatioBp = 1 로 고정 풀을 100원까지 줄여 " +
      "f_i = floor(12.5) = 12 이 8번 버려지게 만든다. 표는 두 팀에만 있어 나머지 6팀은 s_i = 0 이다.",
    input: {
      distributable: 1_000_001n,
      fixedRatioBp: 1n,
      selectionRatioBp: 9999n,
      teamShareBp: [1250n, 1250n, 1250n, 1250n, 1250n, 1250n, 1250n, 1250n],
      choiceCount: [3n, 0n, 0n, 0n, 0n, 0n, 0n, 1n],
      hostTeamIndex: 0,
    },
    // F = 100 · S = 999,900 · f_i = 12 (×8) · s = [749925, 0…0, 249975] · Σbase = 999,996
    expectedPayout: [749_942n, 12n, 12n, 12n, 12n, 12n, 12n, 249_987n],
    expectedDust: 5n,
  },
  {
    id: "V6-R=0-무매출",
    why:
      "판매가 0매인 공연도 정산 경로를 끝까지 통과해야 한다(공연은 열렸는데 표가 안 팔린 경우). " +
      "R = 0 · T = 0 이면 모든 payout 이 0이고 release 는 transfer 를 한 번도 하지 않는다.",
    input: {
      distributable: 0n,
      fixedRatioBp: 5000n,
      selectionRatioBp: 5000n,
      teamShareBp: [3334n, 3333n, 3333n],
      choiceCount: [0n, 0n, 0n],
      hostTeamIndex: 0,
    },
    expectedPayout: [0n, 0n, 0n],
    expectedDust: 0n,
  },
];
