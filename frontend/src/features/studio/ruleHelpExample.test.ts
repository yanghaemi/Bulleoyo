import { HELP_EXAMPLE, computeHelpExample } from './ruleHelpExample'

/**
 * 도움말 예시 숫자를 손 계산으로 못 박는다(요구사항 v7 §7.2).
 *
 *   매출 R = 1,000,000 · bp_f 6000 · bp_s 4000 · 팀 A:B 5000:5000 · 선택 A 70 · B 30
 *   고정 풀  F = ⌊R × 6000 / 10000⌋ = 600,000
 *   선택 풀  S = ⌊R × 4000 / 10000⌋ = 400,000
 *   A 고정 = ⌊600,000 × 5000 / 10000⌋ = 300,000 · B 고정 = 300,000
 *   A 선택 = ⌊400,000 × 70 / 100⌋ = 280,000     · B 선택 = ⌊400,000 × 30 / 100⌋ = 120,000
 *   dust = R − Σ = 0 → A 580,000 · B 420,000
 *
 *   R = 1,000,001 이면 F = ⌊600,000.6⌋ = 600,000 · S = ⌊400,000.4⌋ = 400,000
 *   팀 몫은 위와 같고 dust = 1 → 공연 생성 팀 A 580,001 · B 420,000
 */
describe('P-05 도움말 예시 계산', () => {
  it('기본 예시 — 고정 몫 → 선택 몫 → 합계', () => {
    const ex = computeHelpExample()
    expect(ex.assumedRevenueAmount).toBe(1_000_000)
    expect(ex.fixedPoolAmount).toBe(600_000)
    expect(ex.selectionPoolAmount).toBe(400_000)
    expect(ex.choiceAssumed).toBe(false)
    expect(
      ex.rows.map((r) => [r.fixedAmount, r.choiceAmount, r.dustAmount, r.totalAmount]),
    ).toEqual([
      [300_000, 280_000, 0, 580_000],
      [300_000, 120_000, 0, 420_000],
    ])
    expect(ex.rows.reduce((s, r) => s + r.totalAmount, 0)).toBe(1_000_000)
  })

  it('버림으로 남는 1 YoYo 는 공연 생성 팀(A)이 받는다 — Σ = R', () => {
    const ex = computeHelpExample(HELP_EXAMPLE.dustRevenue)
    expect(ex.fixedPoolAmount).toBe(600_000)
    expect(ex.selectionPoolAmount).toBe(400_000)
    expect(ex.rows[0]).toMatchObject({ teamName: 'A', dustAmount: 1, totalAmount: 580_001 })
    expect(ex.rows[1]).toMatchObject({ teamName: 'B', dustAmount: 0, totalAmount: 420_000 })
    expect(ex.rows.reduce((s, r) => s + r.totalAmount, 0)).toBe(1_000_001)
  })

  it('예시 조건은 두 단계 모두 합 10000 이다', () => {
    expect(HELP_EXAMPLE.fixedRatioBp + HELP_EXAMPLE.selectionRatioBp).toBe(10_000)
    expect(HELP_EXAMPLE.teams.reduce((s, t) => s + t.shareBp, 0)).toBe(10_000)
  })
})
