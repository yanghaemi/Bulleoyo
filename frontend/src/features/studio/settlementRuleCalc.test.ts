/**
 * P-05 정산 규칙 계산 테스트.
 *
 * 여기가 조용히 틀리기 쉬운 자리다 — bp 나눗셈은 거의 언제나 나머지를 남기고, 그 1원이
 * 어디로 갔는지는 화면을 봐서는 알 수 없다. 명세가 못박은 두 성질을 못 박는다.
 *   ① 팀별 분배액의 합은 **정확히** 분배 대상 금액과 같다(1원도 새지 않는다)
 *   ② 남는 1원 단위 잔액(dust)은 **공연을 만든 팀**에 귀속된다(P-05 dust 귀속 안내)
 *
 * 값은 rule_01의 200 응답 예시를 기준으로 잡았다 — 매출 1,600,000 · 고정 6000bp ·
 * 팀 3(5000/3000/2000). 다만 **관객 선택분은 서버 예시와 일부러 다르다** —
 * 서버는 실제 팀별 선택 수로 나누고, 규칙을 정하는 시점에는 그 값이 없어 균등 가정이다
 * (`settlementRuleCalc.ts`의 ⚠ ② 참조).
 */

import { describe, expect, it } from 'vitest'

import {
  BP_TOTAL,
  autoFillRemainder,
  evenShareBp,
  parseBp,
  simulate,
  sumShareBp,
  validateRules,
} from './settlementRuleCalc'
import type { TeamShareDraft } from './settlementRuleCalc'

function rows(...bps: string[]): TeamShareDraft[] {
  const names = ['블루노트', '새벽세시', '노이즈캔슬', '네번째팀']
  return bps.map((shareBp, i) => ({ teamId: 7 + i * 2, teamName: names[i] ?? `팀${i}`, shareBp }))
}

describe('parseBp', () => {
  it('정수만 통과시킨다', () => {
    expect(parseBp('5000')).toBe(5000)
    expect(parseBp(' 0 ')).toBe(0)
    expect(parseBp('50.5')).toBeUndefined()
    expect(parseBp('-1')).toBeUndefined()
    expect(parseBp('')).toBeUndefined()
  })

  it('10000을 넘는 값은 받지 않는다 — 한 항목이 100%를 넘을 수 없다', () => {
    expect(parseBp('10000')).toBe(BP_TOTAL)
    expect(parseBp('10001')).toBeUndefined()
  })
})

describe('evenShareBp', () => {
  it('나머지를 첫 팀에 얹어 합을 정확히 10000으로 맞춘다', () => {
    // 3팀이면 3333×3 = 9999라 1bp가 남는다. 그 1bp는 첫 팀(= host)이 갖는다
    expect(evenShareBp(3)).toEqual([3334, 3333, 3333])
    expect(evenShareBp(3).reduce((a, b) => a + b, 0)).toBe(BP_TOTAL)
    expect(evenShareBp(4)).toEqual([2500, 2500, 2500, 2500])
    expect(evenShareBp(7).reduce((a, b) => a + b, 0)).toBe(BP_TOTAL)
  })

  it('팀이 없으면 빈 배열', () => {
    expect(evenShareBp(0)).toEqual([])
  })
})

describe('autoFillRemainder', () => {
  it('모자란 만큼을 마지막 팀에 몰아 준다', () => {
    const filled = autoFillRemainder(rows('5000', '3000', '1000'))
    expect(filled.map((r) => r.shareBp)).toEqual(['5000', '3000', '2000'])
    expect(sumShareBp(filled)).toBe(BP_TOTAL)
  })

  it('초과하면 마지막 팀에서 뺀다', () => {
    const filled = autoFillRemainder(rows('5000', '3000', '4000'))
    expect(filled.map((r) => r.shareBp)).toEqual(['5000', '3000', '2000'])
  })

  it('빼서 음수가 되면 0에서 멈춘다 — 다른 팀 값을 건드리지 않는다', () => {
    const filled = autoFillRemainder(rows('9000', '9000', '500'))
    expect(filled.map((r) => r.shareBp)).toEqual(['9000', '9000', '0'])
    // 여전히 합이 맞지 않는다 — 사용자가 직접 고쳐야 한다는 뜻이고, 화면은 합계로 그것을 알린다
    expect(sumShareBp(filled)).not.toBe(BP_TOTAL)
  })
})

describe('validateRules', () => {
  it('두 단계 합이 모두 10000이면 저장할 수 있다', () => {
    const v = validateRules(6000, 4000, rows('5000', '3000', '2000'))
    expect(v.stageOneValid).toBe(true)
    expect(v.stageTwoValid).toBe(true)
    expect(v.canSave).toBe(true)
  })

  it('1단계 합이 어긋나면 막는다 — 서버 RULE_RATIO_SUM_INVALID와 같은 규칙이다', () => {
    const v = validateRules(6000, 3000, rows('5000', '3000', '2000'))
    expect(v.stageOneValid).toBe(false)
    expect(v.stageOneSum).toBe(9000)
    expect(v.canSave).toBe(false)
  })

  it('값이 아닌 칸이 있으면 그 팀을 짚어 준다', () => {
    const v = validateRules(5000, 5000, rows('5000', '', '5000'))
    expect(v.invalidTeamIds).toEqual([9])
    expect(v.canSave).toBe(false)
  })

  it('참여팀이 없으면 저장할 수 없다', () => {
    expect(validateRules(5000, 5000, []).canSave).toBe(false)
  })
})

describe('simulate', () => {
  const shares = rows('5000', '3000', '2000')

  it('두 풀을 각자 floor 한다 — 합이 매출과 같은 것은 나누어떨어질 때뿐이다', () => {
    const r = simulate({ assumedRevenueAmount: 1_600_000, fixedRatioBp: 6000, rows: shares })
    expect(r.fixedPoolAmount).toBe(960_000)
    expect(r.selectionPoolAmount).toBe(640_000)
    expect(r.fixedPoolAmount + r.selectionPoolAmount).toBe(1_600_000)
  })

  /**
   * 종전 단정은 "두 풀의 합이 **언제나** 매출과 같다" 였는데, 그것을 지키려고 선택 풀을
   * 뺄셈으로 만들고 있었다. 온체인은 각자 floor 라 합이 1원 작을 수 있다 — 그 1원은 dust 로
   * host 에 간다. 호스트가 보는 예상 분배액이 실제 정산과 어긋나던 자리다(리뷰 !96 🟡).
   *
   * 기대값은 verify/recalc.test.ts 와 **같은 케이스**다. 두 벌이 갈라지면 여기가 깨진다.
   */
  it('bp 가 나누어떨어지지 않으면 두 풀의 합이 매출보다 작다 — verify 와 같은 값이다', () => {
    const r = simulate({
      assumedRevenueAmount: 1_000_001,
      fixedRatioBp: 3333,
      selectionRatioBp: 6667,
      rows: rows('5000', '5000'),
      // rows() 가 매기는 teamId 는 7·9 다. 키를 틀리면 카운터가 0 으로 읽혀
      // **균등 분배 경로로 조용히 새고** 이 테스트가 의도한 것을 재지 않는다.
      choiceCounts: { 7: 1, 9: 2 },
    })

    expect(r.fixedPoolAmount).toBe(333_300)
    expect(r.selectionPoolAmount).toBe(666_700)
    expect(r.fixedPoolAmount + r.selectionPoolAmount).toBe(1_000_000)
    //   f_i = floor(333300 × 5000/10000) = 166,650 씩
    //   s_1 = floor(666700 × 1/3) = 222,233 · s_2 = floor(666700 × 2/3) = 444,466
    //   dust = 1,000,001 − 388,883 − 611,116 = 2 → host(첫 줄)
    // verify/recalc.test.ts 의 같은 케이스와 **숫자까지 같다**.
    expect(r.rows.map((x) => x.totalAmount)).toEqual([166_650 + 222_233 + 2, 166_650 + 444_466])
    expect(r.rows.reduce((a, x) => a + x.totalAmount, 0)).toBe(1_000_001)
  })

  it('선택 카운터 합이 0이면 선택 풀을 팀 수로 균등 분배한다 — verify 와 같은 값이다', () => {
    const r = simulate({
      assumedRevenueAmount: 1_000_000,
      fixedRatioBp: 5000,
      selectionRatioBp: 5000,
      rows: rows('5000', '5000'),
    })

    expect(r.rows.map((x) => x.totalAmount)).toEqual([500_000, 500_000])
  })

  it('고정분은 팀별 비율대로 나뉜다', () => {
    const r = simulate({ assumedRevenueAmount: 1_600_000, fixedRatioBp: 6000, rows: shares })
    expect(r.rows.map((x) => x.fixedAmount)).toEqual([480_000, 288_000, 192_000])
  })

  it('선택 수가 없으면 균등 가정이고, 그 사실을 알린다', () => {
    const r = simulate({ assumedRevenueAmount: 1_600_000, fixedRatioBp: 6000, rows: shares })
    expect(r.choiceAssumed).toBe(true)
    // 640,000 ÷ 3 = 213,333 …1 (남는 1원은 dust로 넘어간다)
    expect(r.rows.map((x) => x.choiceAmount)).toEqual([213_333, 213_333, 213_333])
  })

  it('합계가 매출과 1원도 어긋나지 않는다', () => {
    const r = simulate({ assumedRevenueAmount: 1_600_000, fixedRatioBp: 6000, rows: shares })
    const total = r.rows.reduce((sum, x) => sum + x.totalAmount, 0)
    expect(total).toBe(1_600_000)
  })

  it('남는 1원 단위 잔액은 공연을 만든 팀에 귀속된다', () => {
    const r = simulate({
      assumedRevenueAmount: 1_600_000,
      fixedRatioBp: 6000,
      rows: shares,
      hostTeamId: 11,
    })
    expect(r.dustTeamId).toBe(11)
    const host = r.rows.find((x) => x.teamId === 11)
    expect(host?.dustAmount).toBe(1)
    // 나머지 팀은 dust를 갖지 않는다
    expect(r.rows.filter((x) => x.teamId !== 11).every((x) => x.dustAmount === 0)).toBe(true)
  })

  it('선택 수를 주면 그 비율로 선택분을 나눈다', () => {
    const r = simulate({
      assumedRevenueAmount: 1_600_000,
      fixedRatioBp: 6000,
      rows: shares,
      choiceCounts: { 7: 30, 9: 21, 11: 13 },
    })
    expect(r.choiceAssumed).toBe(false)
    // 640,000 × 30/64 = 300,000
    expect(r.rows[0].choiceAmount).toBe(300_000)
    expect(r.rows.reduce((sum, x) => sum + x.totalAmount, 0)).toBe(1_600_000)
  })

  it('매출이 0이면 전부 0이다 — 판매 전에 억지 숫자를 만들지 않는다', () => {
    const r = simulate({ assumedRevenueAmount: 0, fixedRatioBp: 6000, rows: shares })
    expect(r.rows.every((x) => x.totalAmount === 0)).toBe(true)
  })
})
