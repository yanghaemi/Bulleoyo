import { describe, expect, it } from 'vitest'

import {
  MATCH_LABEL,
  buildSupplyInvariantRows,
  signedAmount,
  verdictOf,
} from '@/features/verify/invariants'
import type { CoinSupply } from '@/features/verify/verifyTypes'

/**
 * `CoinSupplyInvariant`의 다섯 측정값은 **불변식마다 채워지는 것이 다르고** 못 읽으면 null이다.
 * 생성 타입에서는 다섯이 모두 필수(`number | null`)라 빠진 값을 `null`로 명시한다 —
 * 그래야 "안 쓰는 칸"과 "못 읽은 칸"이 테스트에서도 같은 모양이 된다.
 */
const UNMEASURED = {
  expected: null,
  actual: null,
  checkedShows: null,
  mismatchedShows: null,
  maxDiff: null,
} as const

function supply(patch: Partial<CoinSupply> = {}): CoinSupply {
  return {
    totalSupply: 100,
    escrowTotal: 30,
    walletTotal: 70,
    grantCount: 1,
    supplyMatched: true,
    currency: 'KRW',
    issuer: { type: 'MOCK', label: 'Platform', replaceable: true },
    mintHalted: false,
    releaseHalted: false,
    network: 'kaia-kairos',
    chainId: 1001,
    tokenAddress: '0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736',
    tokenSymbol: 'YoYo',
    tokenDecimals: 0,
    explorerUrl: '',
    invariants: [
      {
        ...UNMEASURED,
        no: 1,
        name: 'SUPPLY_EQUALS_MINTED',
        expected: 100,
        actual: 100,
        matched: true,
        note: '',
      },
      {
        ...UNMEASURED,
        no: 2,
        name: 'ESCROW_PER_SHOW',
        checkedShows: 2,
        mismatchedShows: 0,
        matched: true,
        note: '',
      },
      {
        ...UNMEASURED,
        no: 3,
        name: 'RELEASED_EQUALS_RULE_RECALC',
        checkedShows: 1,
        maxDiff: 0,
        matched: true,
        note: '',
      },
      {
        ...UNMEASURED,
        no: 4,
        name: 'SUPPLY_EQUALS_WALLETS_PLUS_ESCROW',
        expected: 100,
        actual: 100,
        matched: true,
        note: '',
      },
    ],
    perPerformanceEscrow: [],
    asOf: '2026-09-22T18:12:00+09:00',
    nextRefreshAt: '2026-09-22T18:13:00+09:00',
    stale: false,
    disclosure: '',
    grantNotice: '',
    ...patch,
  }
}

describe('verify invariants', () => {
  it('shows missing values as checking instead of a false match', () => {
    const rows = buildSupplyInvariantRows(
      supply({
        invariants: supply().invariants.map((inv) =>
          inv.no === 2 ? { ...inv, checkedShows: null, mismatchedShows: null } : inv,
        ),
      }),
    )

    expect(MATCH_LABEL.unknown).toBe('확인 중')
    expect(rows[1]).toMatchObject({
      state: 'unknown',
      expected: undefined,
      actual: undefined,
    })
    expect(verdictOf(rows, true)).toBe('checking')
  })

  it('marks invariant 4 negative difference as a danger-level mismatch', () => {
    const rows = buildSupplyInvariantRows(
      supply({
        supplyMatched: false,
        invariants: supply().invariants.map((inv) =>
          inv.no === 4 ? { ...inv, expected: 130, actual: 100, matched: false } : inv,
        ),
      }),
    )

    expect(rows[3]).toMatchObject({
      state: 'mismatched',
      diff: -30,
      severity: 'danger',
    })
    expect(signedAmount(rows[3].diff ?? 0)).toBe('−30 YoYo')
    expect(verdictOf(rows, false)).toBe('mismatch')
  })
})
