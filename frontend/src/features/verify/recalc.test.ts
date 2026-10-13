/**
 * 검증 페이지 재계산이 **온체인과 1원까지 같은가**.
 *
 * `RevenueSplitter.aggregate` 주석이 이 파일을 이름으로 지목한다 — "서버(Java)·검증
 * 페이지(TS)가 같은 순서로 재현해야 1원도 어긋나지 않는다". 그런데 이 모듈에는 테스트가
 * 하나도 없었고, 실제로 두 군데가 갈라져 있었다(2026-09-11).
 *
 * 기대값은 상수로 적는다. 여기서 공식을 다시 짜면 같은 실수를 두 번 하게 된다 —
 * 손으로 계산해 컨트랙트·`SettlementCalculator` 와 대조한 값이다.
 */
import { describe, expect, it } from 'vitest'

import { recalculate, type RecalcDraft } from '@/features/verify/recalc'

function draftOf(
  fixedBp: number,
  selectionBp: number,
  revenue: number,
  teams: Array<{ shareBp: number; choiceCount: number }>,
): RecalcDraft {
  return {
    fixedRatioBp: String(fixedBp),
    selectionRatioBp: String(selectionBp),
    distributableAmount: String(revenue),
    teams: teams.map((t, i) => ({
      teamId: i + 1,
      teamName: `팀${i + 1}`,
      shareBp: String(t.shareBp),
      choiceCount: String(t.choiceCount),
    })),
  }
}

function totalsOf(draft: RecalcDraft) {
  return recalculate({ draft, hostTeamId: 1, serverShares: [] }).rows.map((r) => r.totalAmount)
}

describe('검증 페이지 재계산 = 온체인', () => {
  it('분배 대상이 미상인 입력을 0원으로 계산하지 않는다', () => {
    const draft = draftOf(10000, 0, 0, [{ shareBp: 10000, choiceCount: 0 }])
    draft.distributableAmount = ''
    expect(() => recalculate({ draft, hostTeamId: 1, serverShares: [] })).toThrow()
  })
  it('아무도 선택하지 않으면 선택 풀을 팀 수로 균등 분배한다 — 전부 host 로 보내지 않는다', () => {
    // 온체인: F=500,000 → 각 250,000 · T==0 이라 S=500,000 을 2 로 균등 → 각 250,000
    // 전에는 선택분을 0 으로 두어 남은 500,000 이 dust 로 host 에 갔다 → [750000, 250000]
    const draft = draftOf(5000, 5000, 1_000_000, [
      { shareBp: 5000, choiceCount: 0 },
      { shareBp: 5000, choiceCount: 0 },
    ])

    expect(totalsOf(draft)).toEqual([500_000, 500_000])
  })

  it('두 풀을 각자 floor 한다 — 뺄셈으로 만들면 1원이 어긋난다', () => {
    // R=1,000,001 · bp 3333/6667
    //   F = floor(1000001 × 3333 / 10000) = 333,300  (뺄셈이면 선택 풀이 666,701 이 된다)
    //   S = floor(1000001 × 6667 / 10000) = 666,700  ← 합이 R 보다 1 작다. 그 1 은 dust 다
    const draft = draftOf(3333, 6667, 1_000_001, [
      { shareBp: 5000, choiceCount: 1 },
      { shareBp: 5000, choiceCount: 2 },
    ])
    const result = recalculate({
      draft,
      hostTeamId: 1,
      serverShares: [],
    })

    expect(result.fixedPoolAmount).toBe(333_300)
    expect(result.selectionPoolAmount).toBe(666_700)
    //   f_i = floor(333300 × 5000/10000) = 166,650 씩
    //   s_1 = floor(666700 × 1/3) = 222,233 · s_2 = floor(666700 × 2/3) = 444,466
    //   dust = 1,000,001 − (166650+222233) − (166650+444466) = 2 → host(팀1)
    expect(result.rows.map((r) => r.totalAmount)).toEqual([
      166_650 + 222_233 + 2,
      166_650 + 444_466,
    ])
  })

  /**
   * ⚠ `Σrows === distributable` 은 **단정으로 쓸 수 없다.** `dust = distributable − Σbase`
   * 를 한 줄 뒤에서 더하는 구조라 구현이 무엇이든 항상 참인 항등식이다(리뷰 !96 🔴).
   * 깨질 수 있는 것을 본다 — dust 가 음수가 아닌가. 음수면 Σ(f_i + s_i) 가 분배 대상을
   * 넘었다는 뜻이고, 온체인이라면 `R - assigned` 가 언더플로로 revert 하는 자리다.
   */
  it('어떤 입력에서도 dust 가 음수가 되지 않는다 — 온체인이라면 revert 할 자리다', () => {
    for (const revenue of [1_000_000, 1_000_001, 999_999, 7, 0]) {
      for (const counts of [
        [0, 0, 0],
        [1, 0, 0],
        [3, 2, 1],
      ]) {
        // shareBp 합은 10,000 이어야 한다. 종전 픽스처는 `c === counts[0]` 로 골라
        // [0,0,0] 에서 셋 다 3334 가 되어 10,002bp 로 굴렀다 — 그래서 dust 가 -65 인데도
        // 위 항등식이 통과했다. 인덱스로 고른다.
        const draft = draftOf(
          3333,
          6667,
          revenue,
          counts.map((c, i) => ({ shareBp: i === 0 ? 3334 : 3333, choiceCount: c })),
        )
        const result = recalculate({
          draft,
          hostTeamId: 1,
          serverShares: [],
        })
        const label = `revenue=${revenue} counts=${counts}`
        expect(
          result.rows.every((r) => r.dustAmount >= 0),
          label,
        ).toBe(true)
        expect(
          result.rows.reduce((a, r) => a + r.totalAmount, 0),
          label,
        ).toBe(result.distributableAmount)
      }
    }
  })

  it('서버 분배 대상은 환불을 다시 차감하지 않고 사용한다', () => {
    const draft = draftOf(10000, 0, 600_000, [{ shareBp: 10000, choiceCount: 0 }])
    const result = recalculate({
      draft,
      hostTeamId: 1,
      serverShares: [],
    })

    expect(result.distributableAmount).toBe(600_000)
    expect(result.rows[0].totalAmount).toBe(600_000)
  })

  it('서버 값과 같으면 matched 다 — 이 모듈의 존재 이유는 재계산이 아니라 대조다', () => {
    const draft = draftOf(5000, 5000, 1_000_000, [
      { shareBp: 5000, choiceCount: 1 },
      { shareBp: 5000, choiceCount: 1 },
    ])
    const result = recalculate({
      draft,
      hostTeamId: 1,
      serverShares: [
        { teamId: 1, teamName: '팀1', totalAmount: 500_000 },
        { teamId: 2, teamName: '팀2', totalAmount: 500_000 },
      ] as never,
    })

    expect(result.matched).toBe(true)
    expect(result.rows.map((r) => r.diff)).toEqual([0, 0])
    expect(result.hasUnknownRow).toBe(false)
  })

  it('서버 값이 1원이라도 다르면 불일치다', () => {
    const draft = draftOf(5000, 5000, 1_000_000, [
      { shareBp: 5000, choiceCount: 1 },
      { shareBp: 5000, choiceCount: 1 },
    ])
    const result = recalculate({
      draft,
      hostTeamId: 1,
      serverShares: [
        { teamId: 1, teamName: '팀1', totalAmount: 500_001 },
        { teamId: 2, teamName: '팀2', totalAmount: 499_999 },
      ] as never,
    })

    expect(result.matched).toBe(false)
    expect(result.rows.map((r) => r.diff)).toEqual([-1, 1])
  })

  it('서버에 없는 팀이 입력에 있으면 판정하지 않는다 — 불일치가 아니라 판정 불가다', () => {
    const draft = draftOf(5000, 5000, 1_000_000, [
      { shareBp: 5000, choiceCount: 1 },
      { shareBp: 5000, choiceCount: 1 },
    ])
    const result = recalculate({
      draft,
      hostTeamId: 1,
      serverShares: [{ teamId: 1, teamName: '팀1', totalAmount: 500_000 }] as never,
    })

    expect(result.hasUnknownRow).toBe(true)
    expect(result.matched).toBe(false)
  })

  it('팀이 없으면 0 으로 나누지 않는다', () => {
    const draft = draftOf(5000, 5000, 1_000_000, [])

    expect(() => recalculate({ draft, hostTeamId: 1, serverShares: [] })).not.toThrow()
  })
})
