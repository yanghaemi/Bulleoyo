import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import i18n from '@/shared/i18n'

beforeEach(async () => {
  await i18n.changeLanguage('ko')
})
import { vi } from 'vitest'

import { SettlementDashboard, type SettlementData } from './SettlementDashboard'

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

function settlement(shares: SettlementData['shares']): SettlementData {
  const blocked = { available: false, blockedReason: 'SETTLEMENT_NOT_LOCKED' }
  return {
    performanceId: 12,
    settlementId: 91,
    status: 'AGGREGATED',
    currency: 'KRW',
    grossRevenueAmount: 1_000,
    refundedAmount: 0,
    netRevenueAmount: 1_000,
    distributableAmount: 1_000,
    escrowBalanceAmount: 1_000,
    fixedRatioBp: 6_000,
    selectionRatioBp: 4_000,
    dustAmount: 0,
    dustTeamId: 1,
    rulesHash: '0x1234',
    aggregatedAt: null,
    lockedAt: null,
    disputeClosesAt: null,
    releasedAt: null,
    releaseTxHash: null,
    counterMatched: true,
    deposit: { status: 'PAID', amount: 50_000, returnTxHash: null, returnedAt: null },
    shares,
    disputes: [],
    transactions: [],
    actions: {
      aggregate: blocked,
      lock: blocked,
      dispute: blocked,
      release: blocked,
      approve: blocked,
    },
  }
}

const share: SettlementData['shares'][number] = {
  teamId: 1,
  teamName: '블루노트',
  walletAddress: '0x1234567890123456789012345678901234567890',
  fixedAmount: 600,
  choiceAmount: 0,
  dustAmount: 0,
  totalAmount: 600,
  choiceCount: 3,
  released: false,
  releasedAt: null,
  approved: false,
  approvedAt: null,
}

describe('SettlementDashboard payout chart', () => {
  it('adds a named comparison chart without removing the amount table', () => {
    render(
      <MemoryRouter>
        <SettlementDashboard title="인디의 밤" data={settlement([share])} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('region', { name: '팀별 분배액 비교 차트' })).toHaveClass('xl:block')
    expect(screen.getAllByText('600 YoYo').length).toBeGreaterThan(0)
    expect(screen.getAllByText('블루노트').length).toBeGreaterThan(0)
  })

  it('does not invent a chart before shares are aggregated', () => {
    render(
      <MemoryRouter>
        <SettlementDashboard title="인디의 밤" data={settlement([])} />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('region', { name: '팀별 분배액 비교 차트' })).not.toBeInTheDocument()
    expect(screen.getByText('집계가 확정되면 팀별 분배액이 나옵니다')).toBeInTheDocument()
  })
})
