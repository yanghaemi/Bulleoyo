import { describe, expect, it } from 'vitest'
import { BRAND_TIMING, STAGE_SPRING, TICKET_TIMING, clampRatio } from './motionTokens'

describe('motion tokens', () => {
  it('keeps approved stage and ticket timing stable', () => {
    expect(STAGE_SPRING).toEqual({ type: 'spring', bounce: 0, duration: 0.4 })
    expect(TICKET_TIMING).toEqual({
      printMs: 1200,
      settleMs: 160,
      totalMs: 1360,
    })
    expect(BRAND_TIMING.totalMs).toBe(2400)
  })

  it('clamps visualization ratios without changing source data', () => {
    expect(clampRatio(-0.2)).toBe(0)
    expect(clampRatio(0)).toBe(0)
    expect(clampRatio(0.42)).toBe(0.42)
    expect(clampRatio(1)).toBe(1)
    expect(clampRatio(1.4)).toBe(1)
  })

  it('falls back to zero for non-finite visualization ratios', () => {
    expect(clampRatio(Number.NaN)).toBe(0)
    expect(clampRatio(Number.POSITIVE_INFINITY)).toBe(0)
    expect(clampRatio(Number.NEGATIVE_INFINITY)).toBe(0)
  })
})
