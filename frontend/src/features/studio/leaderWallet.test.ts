import { describe, expect, it } from 'vitest'

import { pickDepositShortfall } from './leaderWallet'
import type { MyPerformanceListItem } from '@/shared/api/domains/performance'

const DEPOSIT = 50_000

function row(overrides: Partial<MyPerformanceListItem>): MyPerformanceListItem {
  return { performanceId: 12, title: '합정 3밴드 합동공연', host: true, ...overrides }
}

describe('pickDepositShortfall (§5.16)', () => {
  it('보증금 미납 주최 공연이 있고 잔액이 모자라면 부족액을 낸다', () => {
    const shortfall = pickDepositShortfall([row({ depositStatus: 'UNPAID' })], 38_000, DEPOSIT)

    expect(shortfall).toEqual({
      depositAmount: DEPOSIT,
      balanceAmount: 38_000,
      shortAmount: 12_000,
      performanceTitle: '합정 3밴드 합동공연',
      performanceId: 12,
    })
  })

  it('잔액을 모르면 안내하지 않는다 — 모름은 0원이 아니다', () => {
    expect(
      pickDepositShortfall([row({ depositStatus: 'UNPAID' })], undefined, DEPOSIT),
    ).toBeUndefined()
  })

  it('잔액이 충분하면 안내하지 않는다', () => {
    expect(
      pickDepositShortfall([row({ depositStatus: 'UNPAID' })], DEPOSIT, DEPOSIT),
    ).toBeUndefined()
  })

  it('미납이어도 주최 팀이 아니면 세지 않는다 — 보증금은 생성팀 리더가 낸다', () => {
    expect(
      pickDepositShortfall([row({ depositStatus: 'UNPAID', host: false })], 0, DEPOSIT),
    ).toBeUndefined()
  })

  it('이미 납부했으면 안내하지 않는다', () => {
    expect(pickDepositShortfall([row({ depositStatus: 'PAID' })], 0, DEPOSIT)).toBeUndefined()
  })

  it('식별자가 없는 행은 건너뛰고 다음 미납 공연을 고른다', () => {
    const shortfall = pickDepositShortfall(
      [
        row({ performanceId: undefined, depositStatus: 'UNPAID' }),
        row({ performanceId: 31, title: '한남 어쿠스틱', depositStatus: 'UNPAID' }),
      ],
      10_000,
      DEPOSIT,
    )

    expect(shortfall?.performanceId).toBe(31)
    expect(shortfall?.shortAmount).toBe(40_000)
  })
})
