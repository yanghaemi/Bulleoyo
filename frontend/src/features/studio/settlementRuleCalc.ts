/**
 * P-05 정산 규칙의 bp 계산·검증·시뮬레이션.
 *
 * 정본 — 화면설계 v6 §4 P-05(컴포넌트 표·입력 검증·dust 귀속 안내)
 *        · API 명세 v6 rule_01 `RuleSetRequest`(fixedRatioBp + selectionRatioBp = 10000,
 *          teamShares 합 10000) · `RuleSimulation`
 *
 * 컴포넌트 파일에서 상수·헬퍼를 내보내면 Fast Refresh가 끊긴다. 그래서 여기로 뺐고,
 * 반올림·잔여(dust) 처리가 조용히 틀리기 쉬운 자리라 테스트로 못 박았다
 * (`settlementRuleCalc.test.ts`).
 *
 * ── 시뮬레이션에 대한 ⚠ 두 가지 (전부 보고 목록에 있다) ──────────────────
 * ① **입력값이 바뀔 때마다 서버에 물어볼 방법이 없다.** `RuleSimulation`을 돌려주는 것은
 *    `PUT …/rules`(rule_01) 하나뿐인데 그것은 **저장**이고, 저장하면 팀 동의가 전부 초기화된다.
 *    `GET …/rules`(rule_02) 응답에는 `simulation`이 없다. 그런데 P-05 컴포넌트 표는
 *    "입력값 변경 시 재계산"을 요구한다. 그래서 **화면이 직접 계산한다**.
 * ② **관객 선택분은 팀별 선택 수가 있어야 나온다.** 규칙을 정하는 시점(판매 시작 전)에는
 *    선택이 하나도 없다. 서버 예시(rule_01)의 분배액도 실제 선택 수를 반영한 값이라
 *    클라이언트가 재현할 수 없다. 그래서 **선택 수를 균등 가정**으로 두고, 화면이 그 가정을
 *    문장으로 밝힌다. 판매가 시작된 뒤에는 실제 선택 수를 넘겨 같은 함수로 계산한다.
 *
 * 금액은 전부 원 정수(= YoYo, decimals 0)다. 나눗셈은 **내림**하고 남는 1원 단위 잔액은
 * 공연을 만든 팀(host)에 귀속한다 — P-05 "dust 귀속 안내" 그대로다.
 */

/** 비율 합계. 1단계·2단계 모두 이 값이어야 한다 */
export const BP_TOTAL = 10_000

/** 1단계 기본값 — P-05 컴포넌트 표 "기본값 5000 / 5000" */
export const DEFAULT_FIXED_BP = 5_000

/** 팀별 비율 한 줄. 입력 중에는 빈 문자열이 될 수 있어 문자열로 들고 있는다 */
export interface TeamShareDraft {
  teamId: number
  teamName: string
  /** basis point 문자열. `parseBp`가 정수만 통과시킨다 */
  shareBp: string
}

/** bp 문자열 → 정수. 소수·음수·빈 문자열은 `undefined`(= 아직 값이 아님) */
export function parseBp(value: string): number | undefined {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return undefined
  const n = Number(trimmed)
  return n > BP_TOTAL ? undefined : n
}

/** 표시용 — bp를 %로. 10000bp = 100%. 소수 둘째 자리까지만 쓰고 정수면 정수로 */
export function bpToPercentLabel(bp: number): string {
  const pct = (bp / BP_TOTAL) * 100
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(2)}%`
}

/** 합계. 값이 아닌 칸은 0으로 센다 — "아직 안 적음"과 "0"을 합계에서는 같게 본다 */
export function sumShareBp(rows: TeamShareDraft[]): number {
  return rows.reduce((sum, r) => sum + (parseBp(r.shareBp) ?? 0), 0)
}

/**
 * 균등 분할 — P-05 "기본값 = 참여팀 수 균등 분할".
 *
 * 10000을 팀 수로 나누면 대개 나머지가 남는다(3팀이면 3333×3 = 9999).
 * 남는 bp는 **첫 팀**(= 공연을 만든 팀. 목록의 첫 줄이 host다)에 얹어 합을 정확히 10000으로 맞춘다.
 * 합이 10000이 아니면 서버가 `RULE_RATIO_SUM_INVALID`로 막는다.
 */
export function evenShareBp(count: number): number[] {
  if (count <= 0) return []
  const base = Math.floor(BP_TOTAL / count)
  const rest = BP_TOTAL - base * count
  return Array.from({ length: count }, (_, i) => (i === 0 ? base + rest : base))
}

/**
 * 잔여 자동 배분 — P-05 "잔여 자동 배분 옵션".
 *
 * 지금 합계와 10000의 차이를 **마지막 팀**에 몰아 준다. 여러 팀에 흩뿌리면 사용자가 방금 적은
 * 값이 조용히 바뀌어 "내가 넣은 값이 왜 달라졌지"가 된다. 한 칸만 바뀌면 어디가 바뀌었는지 보인다.
 *
 * 차이가 음수(초과)면 마지막 팀에서 뺀다. 빼서 음수가 되면 0에서 멈추고 나머지는 그대로 둔다 —
 * 화면이 임의로 다른 팀 값을 건드리지 않는다.
 */
export function autoFillRemainder(rows: TeamShareDraft[]): TeamShareDraft[] {
  if (rows.length === 0) return rows
  const current = sumShareBp(rows)
  const diff = BP_TOTAL - current
  if (diff === 0) return rows
  const lastIndex = rows.length - 1
  const lastValue = parseBp(rows[lastIndex].shareBp) ?? 0
  const next = Math.max(0, lastValue + diff)
  return rows.map((r, i) => (i === lastIndex ? { ...r, shareBp: String(next) } : r))
}

/* ── 검증 ─────────────────────────────────────────────────────────────── */

export interface RuleValidation {
  /** 1단계 합계가 10000인가 */
  stageOneValid: boolean
  stageOneSum: number
  /** 2단계 합계가 10000인가 */
  stageTwoValid: boolean
  stageTwoSum: number
  /** 값이 아닌 칸(빈칸·소수·음수)이 있는 팀의 teamId */
  invalidTeamIds: number[]
  /** 저장할 수 있는가 */
  canSave: boolean
}

export function validateRules(
  fixedBp: number,
  selectionBp: number,
  rows: TeamShareDraft[],
): RuleValidation {
  const stageOneSum = fixedBp + selectionBp
  const stageTwoSum = sumShareBp(rows)
  const invalidTeamIds = rows.filter((r) => parseBp(r.shareBp) == null).map((r) => r.teamId)

  const stageOneValid = stageOneSum === BP_TOTAL
  const stageTwoValid = stageTwoSum === BP_TOTAL && invalidTeamIds.length === 0

  return {
    stageOneValid,
    stageOneSum,
    stageTwoValid,
    stageTwoSum,
    invalidTeamIds,
    // 참여팀이 없으면 2단계를 만들 수 없다 — 저장도 막는다
    canSave: stageOneValid && stageTwoValid && rows.length > 0,
  }
}

/* ── 시뮬레이션 ───────────────────────────────────────────────────────── */

export interface SimulationRow {
  teamId: number
  teamName: string
  /** 고정 풀에서 이 팀 몫 */
  fixedAmount: number
  /** 관객 선택 풀에서 이 팀 몫 */
  choiceAmount: number
  /** 나눗셈에서 남은 1원 단위 잔액. host 팀에만 붙는다 */
  dustAmount: number
  totalAmount: number
}

export interface SimulationResult {
  /** 가정 매출(= 분배 대상). **보증금은 여기 들어가지 않는다** */
  assumedRevenueAmount: number
  fixedPoolAmount: number
  selectionPoolAmount: number
  rows: SimulationRow[]
  /** 잔여가 귀속된 팀 */
  dustTeamId?: number
  /** 관객 선택 수를 균등 가정으로 계산했는가 — 화면이 이 사실을 문장으로 밝힌다 */
  choiceAssumed: boolean
}

/**
 * 팀별 예상 분배액.
 *
 * 공식 —
 *   고정 풀   = ⌊매출 × fixedRatioBp / 10000⌋
 *   선택 풀   = 매출 − 고정 풀            (두 풀의 합이 언제나 매출이다)
 *   팀 고정분 = ⌊고정 풀 × shareBp / 10000⌋
 *   팀 선택분 = ⌊선택 풀 × 그 팀 선택 수 / 전체 선택 수⌋
 *   dust     = 매출 − Σ(고정분) − Σ(선택분)   → 공연을 만든 팀에 귀속
 *
 * `choiceCounts`가 없으면(= 판매 전) 선택 수를 균등으로 가정하고 `choiceAssumed: true`를 세운다.
 */
export function simulate(params: {
  assumedRevenueAmount: number
  fixedRatioBp: number
  /**
   * bp_s — 관객 선택. 생략하면 `10000 − bp_f`(컨트랙트가 합을 강제한다).
   *
   * **두 풀을 각자 floor 하기 위해 필요하다.** 뺄셈(`매출 − 고정 풀`)으로 만들면 bp 가
   * 나누어떨어지지 않을 때 온체인과 1원이 어긋나고, 호스트가 보는 예상 분배액이 실제
   * 정산과 달라진다(`RevenueSplitter.aggregate` 는 `S = mulDiv(R, bp_s, BP)` 다).
   */
  selectionRatioBp?: number
  rows: TeamShareDraft[]
  /** teamId → 선택 수. 없거나 합이 0이면 균등 가정 */
  choiceCounts?: Record<number, number>
  /** dust가 귀속될 팀. 없으면 첫 줄(= 공연을 만든 팀) */
  hostTeamId?: number
}): SimulationResult {
  const { assumedRevenueAmount, fixedRatioBp, selectionRatioBp, rows, choiceCounts, hostTeamId } =
    params
  const revenue = Math.max(0, Math.floor(assumedRevenueAmount))

  // 각자 floor 한다. 두 풀의 합은 매출보다 1원 작을 수 있고, 그 1원은 dust 로 host 에 간다 —
  // 온체인도 같다(리뷰 !96 🟡 · verify/recalc.ts 와 같은 식이다).
  const selectionBp = selectionRatioBp ?? BP_TOTAL - fixedRatioBp
  const fixedPool = Math.floor((revenue * fixedRatioBp) / BP_TOTAL)
  const selectionPool = Math.floor((revenue * selectionBp) / BP_TOTAL)

  const counts = rows.map((r) => choiceCounts?.[r.teamId] ?? 0)
  const countTotal = counts.reduce((a, b) => a + b, 0)
  const choiceAssumed = countTotal === 0

  const base: SimulationRow[] = rows.map((r, i) => {
    const shareBp = parseBp(r.shareBp) ?? 0
    const fixedAmount = Math.floor((fixedPool * shareBp) / BP_TOTAL)
    const choiceAmount = choiceAssumed
      ? // 균등 가정 — 팀 수로 나눈다. 팀이 없으면 0
        rows.length === 0
        ? 0
        : Math.floor(selectionPool / rows.length)
      : Math.floor((selectionPool * counts[i]) / countTotal)
    return {
      teamId: r.teamId,
      teamName: r.teamName,
      fixedAmount,
      choiceAmount,
      dustAmount: 0,
      totalAmount: fixedAmount + choiceAmount,
    }
  })

  const distributed = base.reduce((sum, r) => sum + r.totalAmount, 0)
  const dust = revenue - distributed

  const dustIndex = (() => {
    if (rows.length === 0) return -1
    if (hostTeamId == null) return 0
    const i = rows.findIndex((r) => r.teamId === hostTeamId)
    return i >= 0 ? i : 0
  })()

  const withDust = base.map((r, i) =>
    i === dustIndex ? { ...r, dustAmount: dust, totalAmount: r.totalAmount + dust } : r,
  )

  return {
    assumedRevenueAmount: revenue,
    fixedPoolAmount: fixedPool,
    selectionPoolAmount: selectionPool,
    rows: withDust,
    dustTeamId: dustIndex >= 0 ? rows[dustIndex].teamId : undefined,
    choiceAssumed,
  }
}
