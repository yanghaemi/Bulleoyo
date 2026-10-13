/**
 * P-05 드래그 막대·% 입력칸의 순수 계산.
 *
 * 화면은 %로 보여 주고 서버에는 지금과 같은 **bp 정수**를 보낸다(API rule_01 무변경).
 * 부동소수 곱셈(`35.1 * 100 = 3509.9999…`)을 피하려고 % 문자열을 자릿수로 잘라 bp로 바꾼다.
 *
 * 컴포넌트 파일에서 헬퍼를 내보내면 Fast Refresh가 끊겨 여기로 뺐다(`settlementRuleCalc.ts`와 같은 이유).
 */

import { BP_TOTAL } from '@/features/studio/settlementRuleCalc'

/** 드래그 스냅·화살표 한 칸 = 1% = 100bp */
export const DRAG_STEP_BP = 100
/** Shift + 화살표 · PageUp/PageDown 한 칸 = 10% = 1000bp */
export const BIG_STEP_BP = 1_000

/**
 * % 입력 문자열 → bp 정수. 소수 둘째 자리(= 1bp)까지 받는다.
 * 균등 분할이 만드는 3334bp(33.34%) 같은 값을 칸에서 그대로 다시 적을 수 있어야 해서다.
 * 형식이 아니면 `undefined`. 100%를 넘는 값은 **그대로 bp로** 돌려주고 판정은 `parseBp`에 맡긴다.
 */
export function percentTextToBp(text: string): number | undefined {
  const trimmed = text.trim().replace(/%$/, '').trim()
  const m = /^(\d{1,3})(?:\.(\d{0,2}))?$/.exec(trimmed)
  if (!m) return undefined
  const whole = Number(m[1])
  const frac = Number((m[2] ?? '').padEnd(2, '0'))
  return whole * 100 + frac
}

/** bp 정수 → % 입력칸 문자열. 6000 → "60", 3350 → "33.5", 3334 → "33.34" */
export function bpToPercentText(bp: number): string {
  const whole = Math.floor(bp / 100)
  const frac = bp % 100
  if (frac === 0) return String(whole)
  return `${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}`
}

/**
 * 폼 상태(bp 문자열)로 넘길 값. % 형식이 아니면 원문 앞에 `!`를 붙여 **`parseBp`가 반드시 거절**하게 한다 —
 * 기존 검증(`validateRules`)이 "값이 아님"을 그대로 잡는다.
 */
export function percentTextToBpString(text: string): string {
  const bp = percentTextToBp(text)
  return bp == null ? `!${text}` : String(bp)
}

/** bp 문자열 → % 입력칸에 보일 문자열. 값이 아니면(`!원문`) 원문을 돌려준다 */
export function bpStringToPercentText(bpString: string): string {
  if (bpString.startsWith('!')) return bpString.slice(1)
  if (!/^\d+$/.test(bpString.trim())) return bpString
  return bpToPercentText(Number(bpString.trim()))
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * 팀별 비율 → 경계 손잡이 위치(누적 bp) N-1개. 값이 아닌 칸은 0으로 센다.
 * 누적이 10000을 넘으면 10000에서 멈춰 손잡이가 막대 밖으로 나가지 않는다.
 */
export function sharesToPositions(shares: number[]): number[] {
  const positions: number[] = []
  let acc = 0
  for (let i = 0; i < shares.length - 1; i++) {
    acc = clamp(acc + Math.max(0, shares[i]), 0, BP_TOTAL)
    positions.push(acc)
  }
  return positions
}

/**
 * 경계 위치 → 팀별 비율. 마지막 팀은 **나머지**(10000 − 마지막 경계)라 합이 언제나 10000이다.
 */
export function positionsToShares(positions: number[]): number[] {
  const edges = [0, ...positions, BP_TOTAL]
  return edges.slice(1).map((edge, i) => edge - edges[i])
}

/** 손잡이 i가 갈 수 있는 범위 — 이웃 손잡이를 넘지 않는다 */
export function handleRange(positions: number[], index: number): { min: number; max: number } {
  return {
    min: index > 0 ? positions[index - 1] : 0,
    max: index < positions.length - 1 ? positions[index + 1] : BP_TOTAL,
  }
}

/** 손잡이 i를 bp로 옮긴 새 위치 배열. 범위 밖이면 경계에서 멈춘다 */
export function moveHandle(positions: number[], index: number, bp: number): number[] {
  const { min, max } = handleRange(positions, index)
  const next = clamp(Math.round(bp), min, max)
  return positions.map((p, i) => (i === index ? next : p))
}

/** 막대 안 비율(0~1) → 1% 단위로 스냅한 bp */
export function ratioToSnappedBp(ratio: number): number {
  const r = clamp(ratio, 0, 1)
  return Math.round((r * BP_TOTAL) / DRAG_STEP_BP) * DRAG_STEP_BP
}

/**
 * 키보드 조작 → 새 bp. 처리하지 않는 키면 `undefined`.
 * 좌·하 −1%, 우·상 +1%, Shift를 누르면 ±10%, PageUp/PageDown ±10%, Home/End = 이웃 경계까지.
 */
export function keyToBp(
  key: string,
  shiftKey: boolean,
  current: number,
  range: { min: number; max: number },
): number | undefined {
  const step = shiftKey ? BIG_STEP_BP : DRAG_STEP_BP
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      return clamp(current - step, range.min, range.max)
    case 'ArrowRight':
    case 'ArrowUp':
      return clamp(current + step, range.min, range.max)
    case 'PageDown':
      return clamp(current - BIG_STEP_BP, range.min, range.max)
    case 'PageUp':
      return clamp(current + BIG_STEP_BP, range.min, range.max)
    case 'Home':
      return range.min
    case 'End':
      return range.max
    default:
      return undefined
  }
}
