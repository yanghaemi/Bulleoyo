/**
 * V-01 브라우저 재계산 — "서버 표시값을 믿지 않고 독립 재계산한다"(verify_01 description).
 *
 * 정본 — 화면설계 v6 V-01 "재계산 위젯"(입력: 잠긴 비율 bp_f·bp_s, 팀별 고정 비율 w_i,
 *        온체인 카운터, 분배 대상 R(자동 입력·수정 가능) / 동작: 2단계 공식 실행 → 서버 표시값과 대조)
 *        · V-01 **입력 검증**(정수·bp만, 합이 10,000bp를 넘으면 계산 전에 막는다)
 *        · API 정본 verify_01 `recalculationInput`(roundingRule `FLOOR_TO_INTEGER_KRW`,
 *          remainderRule `ASSIGN_DUST_TO_HOST_TEAM`)
 *
 * 2단계 공식 — **정본은 컨트랙트다**(`RevenueSplitter.aggregate` · 요구사항 v6 §7.2 ·
 * 문서 13 §4.7). 그 주석이 이 파일을 이름으로 지목한다: "서버(Java)·검증 페이지(TS)가
 * 같은 순서로 재현해야 1원도 어긋나지 않는다."
 *   고정 풀   = ⌊분배 대상 × bp_f / 10000⌋
 *   선택 풀   = ⌊분배 대상 × bp_s / 10000⌋       ← **각자 floor**. 뺄셈이 아니다
 *   팀 고정분 = ⌊고정 풀 × w_i / 10000⌋
 *   팀 선택분 = T > 0 ? ⌊선택 풀 × 카운터_i / T⌋ : ⌊선택 풀 / N⌋
 *   dust     = 분배 대상 − Σ(고정분 + 선택분)     → host 팀에 귀속
 *
 * 두 풀의 합은 분배 대상보다 **1원 작을 수 있다**(둘 다 floor 라서). 그 1원은 dust 로
 * 흘러 host 에 간다 — 온체인도 같다.
 *
 * ⚠ **같은 식을 두 벌 두는 이유** — `settlementRuleCalc`는 `features/studio` 안에 있고
 * features끼리는 import하지 않는다(기술 스택 v3 §3.2). 게다가 이 화면의 존재 이유가
 * "다른 데서 계산한 값을 그대로 가져다 쓰지 않고 스스로 다시 센다"는 것이라, 공유하지 않는 편이
 * 검증 화면의 성격에 맞는다. 두 벌이 갈라지면 그 자체가 대사에서 드러난다.
 *
 * ⚠ **선택 카운터 합이 0일 때는 선택 풀을 팀 수로 균등 분배한다.** 종전 주석은 "명세에
 * 없어 해석했다" 며 전부 0 으로 뒀는데, 답은 세 곳에 있었다 — `RevenueSplitter.aggregate`
 * (`totalChoices == 0 ? choicePool / n : ...`) · `SettlementCalculator.java` · 요구사항 v6 §7.2.
 * 0 으로 두면 그 금액이 전부 dust 로 host 에 가서, **정상 정산을 불일치로 선언한다**
 * (2026-09-11 발견).
 *
 * 컴포넌트가 아니라 순수 함수 모듈이다(Fast Refresh 규칙).
 */

import type { VerificationShare } from '@/features/verify/verifyTypes'

/** 비율 합계. 1단계(bp_f + bp_s)·2단계(Σw_i) 모두 이 값이어야 한다 */
export const BP_TOTAL = 10_000

/* ── 입력 ─────────────────────────────────────────────────────────────── */

/** 팀 한 줄의 입력값. 입력 중에는 빈 문자열이 될 수 있어 전부 문자열로 들고 있는다 */
export interface RecalcTeamDraft {
  teamId: number
  teamName: string
  /** 팀별 고정 비율 w_i (basis point) */
  shareBp: string
  /** 온체인 선택 카운터 */
  choiceCount: string
}

/** 재계산 위젯의 입력 상태 전체 */
export interface RecalcDraft {
  /** bp_f — 고정 */
  fixedRatioBp: string
  /** bp_s — 관객 선택 */
  selectionRatioBp: string
  /** 서버가 확정한 분배 대상 R(원 정수). 총 매출에서 추정하지 않는다. */
  distributableAmount: string
  teams: RecalcTeamDraft[]
}

/** 정수 문자열 → 숫자. 소수·음수·빈 문자열·기호는 `undefined`(= 아직 값이 아님) */
export function parseInteger(value: string): number | undefined {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return undefined
  const n = Number(trimmed)
  return Number.isSafeInteger(n) ? n : undefined
}

/* ── 검증 ─────────────────────────────────────────────────────────────── */

export interface RecalcValidation {
  /** 값이 아닌 칸이 하나라도 있는가(빈칸·소수·음수·기호) */
  hasInvalidField: boolean
  /** bp_f + bp_s */
  stageOneSum: number
  /** Σ w_i */
  stageTwoSum: number
  /** 1단계 합이 10,000bp를 넘는가 — 넘으면 계산을 막는다(V-01 입력 검증) */
  stageOneOver: boolean
  stageTwoOver: boolean
  /** 계산 버튼을 누를 수 있는가 */
  canCalculate: boolean
  /** 사람이 읽을 차단 사유. 비어 있으면 막힌 데가 없다 */
  reasons: string[]
}

export function validateRecalc(draft: RecalcDraft): RecalcValidation {
  const fixedBp = parseInteger(draft.fixedRatioBp)
  const selectionBp = parseInteger(draft.selectionRatioBp)
  const distributable = parseInteger(draft.distributableAmount)
  const shareBps = draft.teams.map((t) => parseInteger(t.shareBp))
  const counts = draft.teams.map((t) => parseInteger(t.choiceCount))

  const hasInvalidField =
    fixedBp == null ||
    selectionBp == null ||
    distributable == null ||
    shareBps.some((v) => v == null) ||
    counts.some((v) => v == null)

  const stageOneSum = (fixedBp ?? 0) + (selectionBp ?? 0)
  const stageTwoSum = shareBps.reduce<number>((sum, v) => sum + (v ?? 0), 0)
  /*
   * ⚠ **넘치는 것만 막으면 안 된다. 모자란 것도 막아야 한다**(MR !65 자동 리뷰 지적).
   *
   * 예전에는 `> BP_TOTAL`만 봤다. 그래서 `고정 6000 / 선택 3000`처럼 **합이 모자란 오타**가
   * 계산 버튼을 통과했다.
   *
   * **[2026-09-11] 왜 지금도 막아야 하는가** — `recalculate`가 `selectionRatioBp`를 읽지
   * 않던 것은 고쳤다(이제 그 값으로 각자 floor 한다). 그래도 합이 10,000bp가 아니면 계산하면
   * 안 된다: 컨트랙트가 `_validateRuleShape`에서 `fixedRatioBp + selectionRatioBp == BP`를
   * 강제하므로, 그 합이 아닌 입력은 **온체인에 존재할 수 없는 규칙**이다. 재현할 대상이 없는
   * 것을 재현하면 나오는 숫자는 아무것과도 대조되지 않는다.
   *
   * 이 화면의 원칙은 "모르면 모른다고 한다"다. 입력이 성립하지 않으면 **계산을 하지 않는다.**
   */
  const stageOneOver = stageOneSum !== BP_TOTAL
  const stageTwoOver = stageTwoSum !== BP_TOTAL

  const reasons: string[] = []
  if (hasInvalidField) reasons.push('비율(bp)과 금액·카운터는 0 이상의 정수만 넣을 수 있습니다')
  if (stageOneOver)
    reasons.push(
      `1단계 비율 합이 ${stageOneSum.toLocaleString('ko-KR')}bp입니다. 10,000bp가 되어야 계산할 수 있습니다`,
    )
  if (stageTwoOver)
    reasons.push(
      `팀별 비율 합이 ${stageTwoSum.toLocaleString('ko-KR')}bp입니다. 10,000bp가 되어야 계산할 수 있습니다`,
    )
  if (draft.teams.length === 0) reasons.push('참여팀이 없어 2단계를 계산할 수 없습니다')

  return {
    hasInvalidField,
    stageOneSum,
    stageTwoSum,
    stageOneOver,
    stageTwoOver,
    canCalculate: reasons.length === 0,
    reasons,
  }
}

/* ── 계산 ─────────────────────────────────────────────────────────────── */

/** 재계산 결과 한 줄 + 서버 표시값과의 대조 */
export interface RecalcRow {
  teamId: number
  teamName: string
  fixedAmount: number
  choiceAmount: number
  dustAmount: number
  totalAmount: number
  /** 서버 표시값(verify_01 `shares[]`). 그 팀이 응답에 없으면 `undefined` */
  serverTotalAmount?: number
  /** 재계산 − 서버. `serverTotalAmount`가 없으면 `undefined` */
  diff?: number
}

export interface RecalcResult {
  /** 입력의 분배 대상 R */
  distributableAmount: number
  fixedPoolAmount: number
  selectionPoolAmount: number
  /** dust가 귀속된 팀 */
  hostTeamId: number
  rows: RecalcRow[]
  recalculatedTotal: number
  serverTotal: number
  /** 전 팀의 총액이 서버 표시값과 1원도 다르지 않은가 */
  matched: boolean
  /**
   * 대조를 못 한 팀이 있는가 — 서버 `shares[]`에 없는 팀이 입력에 있으면 판정할 수 없다.
   * 이때는 `matched`를 쓰지 않고 "판정 불가"로 표시한다.
   */
  hasUnknownRow: boolean
  /** 선택 카운터 합이 0이라 선택 풀을 팀 수로 균등 분배했는가(컨트랙트와 같은 식) */
  choiceCountZero: boolean
  /** 계산에 걸린 시간(ms). V-01 동작 항목이 "2초 이내"를 요구해 화면이 실측을 보여준다 */
  elapsedMs: number
}

/**
 * 재계산 실행.
 *
 * API의 distributableAmount는 집계 확정 시점에 잠근 R이다. 장부의 총 매출·환불액이나
 * release 후 0이 된 현재 에스크로에서 재생성하지 않는다. 환불을 한 번 더 차감하지 않는다.
 */
export function recalculate(params: {
  draft: RecalcDraft
  hostTeamId: number
  serverShares: VerificationShare[]
}): RecalcResult {
  const startedAt = performance.now()
  const { draft, hostTeamId, serverShares } = params

  const fixedBp = parseInteger(draft.fixedRatioBp) ?? 0
  const distributable = parseInteger(draft.distributableAmount)
  if (distributable == null) throw new Error('분배 대상 금액을 확인할 수 없습니다')

  // 두 풀은 **각자 floor** 한다. 뺄셈(`distributable - fixedPool`)으로 만들면 bp 가 나누어
  // 떨어지지 않을 때 온체인과 1원이 어긋난다 — `RevenueSplitter.aggregate` 가
  // `S = mulDiv(R, selectionRatioBp, BP)` 로 독립 계산하기 때문이다.
  //
  // 입력값 `selectionRatioBp` 를 **그대로 읽는다**(파생하지 않는다). MR !65 리뷰가 이미
  // "recalculate 가 selectionRatioBp 를 읽지 않는다" 를 지적했는데, 그때는 검증을 조여
  // (합 != 10000 이면 계산을 막는다) 증상만 덮었다. 컨트랙트가 그 필드를 쓰므로 여기도 쓴다.
  const selectionBp = parseInteger(draft.selectionRatioBp) ?? BP_TOTAL - fixedBp
  const fixedPool = Math.floor((distributable * fixedBp) / BP_TOTAL)
  const selectionPool = Math.floor((distributable * selectionBp) / BP_TOTAL)

  const counts = draft.teams.map((t) => parseInteger(t.choiceCount) ?? 0)
  const countTotal = counts.reduce((a, b) => a + b, 0)
  const choiceCountZero = countTotal === 0
  const teamCount = draft.teams.length

  const base = draft.teams.map((t, i) => {
    const shareBp = parseInteger(t.shareBp) ?? 0
    const fixedAmount = Math.floor((fixedPool * shareBp) / BP_TOTAL)
    // T == 0 이면 선택 풀을 **팀 수로 균등 분배**한다. 0 으로 두면 그 금액이 전부 dust 로
    // host 에 흘러가 온체인과 갈라진다(2팀·50/50·100만 → 온체인 [50만,50만] / 0 으로 두면
    // [75만,25만]). `RevenueSplitter.aggregate` 의 `choicePool / n` 과 같은 식이다.
    const choiceAmount = choiceCountZero
      ? teamCount > 0
        ? Math.floor(selectionPool / teamCount)
        : 0
      : Math.floor((selectionPool * counts[i]) / countTotal)
    return {
      teamId: t.teamId,
      teamName: t.teamName,
      fixedAmount,
      choiceAmount,
      dustAmount: 0,
      totalAmount: fixedAmount + choiceAmount,
    }
  })

  const distributed = base.reduce((sum, r) => sum + r.totalAmount, 0)
  const dust = distributable - distributed

  // dust 귀속 — `ASSIGN_DUST_TO_HOST_TEAM`. host가 목록에 없으면 첫 줄에 둔다(P-05와 같은 규칙)
  const hostIndex = (() => {
    if (base.length === 0) return -1
    const i = base.findIndex((r) => r.teamId === hostTeamId)
    return i >= 0 ? i : 0
  })()

  const rows: RecalcRow[] = base.map((r, i) => {
    const withDust =
      i === hostIndex ? { ...r, dustAmount: dust, totalAmount: r.totalAmount + dust } : r
    const server = serverShares.find((s) => s.teamId === r.teamId)
    return {
      ...withDust,
      serverTotalAmount: server?.totalAmount,
      diff: server ? withDust.totalAmount - server.totalAmount : undefined,
    }
  })

  const recalculatedTotal = rows.reduce((sum, r) => sum + r.totalAmount, 0)
  const serverTotal = serverShares.reduce((sum, s) => sum + s.totalAmount, 0)
  const hasUnknownRow = rows.some((r) => r.serverTotalAmount == null)

  return {
    distributableAmount: distributable,
    fixedPoolAmount: fixedPool,
    selectionPoolAmount: selectionPool,
    hostTeamId: hostIndex >= 0 ? rows[hostIndex].teamId : hostTeamId,
    rows,
    recalculatedTotal,
    serverTotal,
    // 1원 오차 0 — 총액과 팀별 값이 모두 같아야 일치다
    matched: !hasUnknownRow && recalculatedTotal === serverTotal && rows.every((r) => r.diff === 0),
    hasUnknownRow,
    choiceCountZero,
    elapsedMs: Math.round(performance.now() - startedAt),
  }
}

/** 응답의 `recalculationInput`·`onchainCounters`·`shares`로 입력 초기값을 만든다(자동 입력) */
export function draftFrom(params: {
  fixedRatioBp: number
  selectionRatioBp: number
  distributableAmount: number | null
  teams: { teamId: number; teamName: string; shareBp: number; choiceCount: number | null }[]
}): RecalcDraft {
  return {
    fixedRatioBp: String(params.fixedRatioBp),
    selectionRatioBp: String(params.selectionRatioBp),
    distributableAmount:
      params.distributableAmount == null ? '' : String(params.distributableAmount),
    teams: params.teams.map((t) => ({
      teamId: t.teamId,
      teamName: t.teamName,
      shareBp: String(t.shareBp),
      choiceCount: t.choiceCount == null ? '' : String(t.choiceCount),
    })),
  }
}

/** 표시용 — bp를 %로. 10000bp = 100% */
export function bpToPercentLabel(bp: number): string {
  const pct = (bp / BP_TOTAL) * 100
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(2)}%`
}
