export const STAGE_SPRING = { type: 'spring', bounce: 0, duration: 0.4 } as const

export const TICKET_TIMING = {
  printMs: 1200,
  settleMs: 160,
  totalMs: 1360,
} as const

export const BRAND_TIMING = {
  splitMs: 400,
  moveMs: 700,
  morphMs: 900,
  koreanCompleteMs: 1400,
  crossfadeMs: 1700,
  englishCompleteMs: 2200,
  totalMs: 2400,
  returnMs: 3000,
} as const

export function clampRatio(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
}
