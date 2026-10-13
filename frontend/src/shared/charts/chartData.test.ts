import { describe, expect, it } from 'vitest'

import { toSupplyComposition, toTeamPayoutSeries } from './chartData'

describe('toTeamPayoutSeries', () => {
  it('preserves raw amounts and derives the distributable share', () => {
    const shares = [{ teamId: 1, teamName: '블루노트', totalAmount: 600 }]

    expect(toTeamPayoutSeries(shares, 1_000)).toEqual([
      { name: '블루노트', amount: 600, percent: 60 },
    ])
    expect(shares).toEqual([{ teamId: 1, teamName: '블루노트', totalAmount: 600 }])
  })

  it('does not divide by zero or hide over-allocation', () => {
    expect(
      toTeamPayoutSeries([{ teamId: 2, teamName: '긴 이름의 팀', totalAmount: 120 }], 0),
    ).toEqual([{ name: '긴 이름의 팀', amount: 120, percent: 0 }])

    expect(
      toTeamPayoutSeries([{ teamId: 3, teamName: '오버', totalAmount: 1_200 }], 1_000),
    ).toEqual([{ name: '오버', amount: 1_200, percent: 120 }])
  })
})

describe('toSupplyComposition', () => {
  it('reports a signed mismatch without normalizing raw amounts', () => {
    expect(
      toSupplyComposition({ totalSupply: 1_000, escrowTotal: 400, walletTotal: 500 }),
    ).toEqual({
      totalSupply: 1_000,
      accountedTotal: 900,
      difference: 100,
      matched: false,
      segments: [
        { name: '에스크로', amount: 400, percent: 40 },
        { name: '지갑', amount: 500, percent: 50 },
      ],
    })
  })

  it('handles a zero supply without NaN', () => {
    expect(toSupplyComposition({ totalSupply: 0, escrowTotal: 0, walletTotal: 0 })).toEqual({
      totalSupply: 0,
      accountedTotal: 0,
      difference: 0,
      matched: true,
      segments: [
        { name: '에스크로', amount: 0, percent: 0 },
        { name: '지갑', amount: 0, percent: 0 },
      ],
    })
  })
})
