import { render, screen } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'

import type { CoinSupply } from '@/features/admin/adminTypes'
import i18n from '@/shared/i18n'

import { CoinSupplyPanel } from './CoinSupplyPanel'

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

beforeEach(async () => {
  await i18n.changeLanguage('ko')
})

function supply(): CoinSupply {
  return {
    totalSupply: 1_000,
    escrowTotal: 400,
    walletTotal: 500,
    grantCount: 2,
    supplyMatched: false,
    currency: 'KRW',
    issuer: { type: 'MOCK', label: 'Demo', replaceable: true },
    mintHalted: true,
    releaseHalted: true,
    network: 'kaia-kairos',
    chainId: 1001,
    tokenAddress: '0x1234567890123456789012345678901234567890',
    tokenSymbol: 'YoYo',
    tokenDecimals: 0,
    explorerUrl: 'https://kairos.kaiascan.io/address/0x1234',
    invariants: [
      {
        no: 4,
        name: 'SUPPLY_EQUALS_WALLETS_PLUS_ESCROW',
        expected: 1_000,
        actual: 900,
        checkedShows: null,
        mismatchedShows: null,
        maxDiff: null,
        matched: false,
        note: '100원이 아직 분류되지 않았습니다.',
      },
    ],
    perPerformanceEscrow: [],
    asOf: '2026-09-10T14:00:00+09:00',
    nextRefreshAt: '2026-09-10T14:01:00+09:00',
    stale: false,
    disclosure: '테스트넷 시연',
    grantNotice: '데모 지급',
  }
}

describe('CoinSupplyPanel composition chart', () => {
  it('shows raw composition, signed mismatch, and keeps all amount cards', () => {
    render(
      <CoinSupplyPanel loading={false} supply={supply()} onRefresh={vi.fn()} />,
    )

    expect(screen.getByRole('region', { name: '발행량 구성 차트' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('차이 +100 YoYo')
    expect(screen.getAllByText('1,000 YoYo').length).toBeGreaterThan(0)
    expect(screen.getAllByText('400 YoYo').length).toBeGreaterThan(0)
    expect(screen.getAllByText('500 YoYo').length).toBeGreaterThan(0)
  })
})
