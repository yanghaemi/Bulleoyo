/**
 * P-08 헤더 이의제기 마감 카운트다운(9/24 사용자 요청).
 *
 * 일부 동의면 보이고, **전원 동의 && 열린 이의 없음**이면 숨기고 "모든 팀이 동의했습니다" 한 줄로
 * 바꾼다. 열린 이의가 있으면 release 가 전원 동의여도 막히므로(API-settlement-05 409 표)
 * 카운트다운을 남긴다. 끝난 정산(RELEASED·HALTED)에는 둘 다 없다.
 */

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import i18n from '@/shared/i18n'
import { SettlementDashboard, type SettlementData } from './SettlementDashboard'

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

const blocked = (reason: string) => ({ available: false, blockedReason: reason })
const open = { available: true, blockedReason: null }

function share(teamId: number, approved: boolean): SettlementData['shares'][number] {
  return {
    teamId,
    teamName: `팀${teamId}`,
    walletAddress: `0x${String(teamId).padStart(40, '0')}`,
    fixedAmount: 300_000,
    choiceAmount: 0,
    dustAmount: 0,
    totalAmount: 300_000,
    choiceCount: 3,
    released: false,
    releasedAt: null,
    approved,
    approvedAt: approved ? '2026-09-24T10:00:00+09:00' : null,
  }
}

/** 마감이 넉넉히 남은 LOCKED 정산. 3팀 중 1팀만 동의했다 */
function settlement(over: Partial<SettlementData> = {}): SettlementData {
  return {
    performanceId: 12,
    settlementId: 91,
    status: 'LOCKED',
    currency: 'KRW',
    grossRevenueAmount: 900_000,
    refundedAmount: 0,
    netRevenueAmount: 900_000,
    distributableAmount: 900_000,
    escrowBalanceAmount: 900_000,
    fixedRatioBp: 10_000,
    selectionRatioBp: 0,
    dustAmount: 0,
    dustTeamId: null,
    rulesHash: '0x4d1c',
    aggregatedAt: '2026-09-24T09:00:00+09:00',
    lockedAt: '2026-09-24T09:30:00+09:00',
    disputeClosesAt: new Date(Date.now() + 5 * 3_600_000).toISOString(),
    releasedAt: null,
    releaseTxHash: null,
    counterMatched: true,
    deposit: { status: 'PAID', amount: 50_000, returnTxHash: null, returnedAt: null },
    shares: [share(1, true), share(2, false), share(3, false)],
    myTeam: {
      teamId: 2,
      totalAmount: 300_000,
      released: false,
      releasedAt: null,
      walletAddress: '0x9e0d',
      nextAction: 'WAIT_RELEASE',
      approved: false,
    },
    disputes: [],
    transactions: [],
    actions: {
      aggregate: blocked('PERFORMANCE_INVALID_STATUS'),
      lock: blocked('PERFORMANCE_INVALID_STATUS'),
      dispute: open,
      release: blocked('SETTLEMENT_DISPUTE_PERIOD'),
      approve: open,
    },
    ...over,
  }
}

const allApproved = () => [share(1, true), share(2, true), share(3, true)]

function renderDashboard(data: SettlementData) {
  const view = render(
    <MemoryRouter>
      <SettlementDashboard title="인디의 밤" data={data} />
    </MemoryRouter>,
  )
  const rerender = (next: SettlementData) =>
    view.rerender(
      <MemoryRouter>
        <SettlementDashboard title="인디의 밤" data={next} />
      </MemoryRouter>,
    )
  return { rerender }
}

/**
 * 헤더 카운트다운 줄. 지급 버튼 옆 차단 문구(`SETTLEMENT_DISPUTE_PERIOD`)에도 "이의제기 마감까지"가
 * 들어가므로 헤더의 `<span>`만 고른다.
 */
const COUNTDOWN = (_: string, el: Element | null) =>
  el?.tagName === 'SPAN' && (el.textContent ?? '').startsWith('이의제기 마감까지')
const ALL_APPROVED = /모든 팀이 동의했습니다/

beforeEach(async () => {
  await i18n.changeLanguage('ko')
})

describe('헤더 이의제기 마감 카운트다운', () => {
  it('일부 팀만 동의했으면 카운트다운을 보인다', () => {
    renderDashboard(settlement())
    expect(screen.getByText(COUNTDOWN)).toBeInTheDocument()
    expect(screen.queryByText(ALL_APPROVED)).not.toBeInTheDocument()
  })

  it('전원이 동의하면 카운트다운을 숨기고 곧 지급된다는 한 줄로 바꾼다', () => {
    renderDashboard(settlement({ shares: allApproved() }))
    expect(screen.queryByText(COUNTDOWN)).not.toBeInTheDocument()
    expect(screen.getByText(ALL_APPROVED)).toBeInTheDocument()
  })

  it('폴링으로 마지막 팀의 동의가 들어오면 새로고침 없이 카운트다운이 사라진다', () => {
    const { rerender } = renderDashboard(settlement())
    expect(screen.getByText(COUNTDOWN)).toBeInTheDocument()
    rerender(settlement({ shares: allApproved() }))
    expect(screen.queryByText(COUNTDOWN)).not.toBeInTheDocument()
    expect(screen.getByText(ALL_APPROVED)).toBeInTheDocument()
  })

  it('전원 동의여도 열린 이의가 있으면 카운트다운을 남긴다 — 그때 release 는 막혀 있다', () => {
    renderDashboard(
      settlement({
        status: 'DISPUTE_OPEN',
        shares: allApproved(),
        disputes: [
          {
            disputeId: 5,
            performanceId: 12,
            teamId: 3,
            status: 'OPEN',
            createdAt: '2026-09-24T11:00:00+09:00',
            releaseHeld: true,
          },
        ],
      }),
    )
    expect(screen.getByText(COUNTDOWN)).toBeInTheDocument()
    expect(screen.queryByText(ALL_APPROVED)).not.toBeInTheDocument()
  })

  it('처리가 끝난 이의만 있으면 전원 동의 안내로 바뀐다', () => {
    renderDashboard(
      settlement({
        shares: allApproved(),
        disputes: [
          {
            disputeId: 5,
            performanceId: 12,
            teamId: 3,
            status: 'REJECTED',
            createdAt: '2026-09-24T11:00:00+09:00',
            releaseHeld: false,
          },
        ],
      }),
    )
    expect(screen.queryByText(COUNTDOWN)).not.toBeInTheDocument()
    expect(screen.getByText(ALL_APPROVED)).toBeInTheDocument()
  })

  it('지급이 끝나면 마감이 아직 미래여도 둘 다 없다 — 전원 동의로 일찍 지급된 경우', () => {
    renderDashboard(
      settlement({
        status: 'RELEASED',
        shares: allApproved(),
        releasedAt: '2026-09-24T12:00:00+09:00',
        actions: {
          aggregate: blocked('SETTLEMENT_ALREADY_RELEASED'),
          lock: blocked('SETTLEMENT_ALREADY_RELEASED'),
          dispute: blocked('SETTLEMENT_ALREADY_RELEASED'),
          release: blocked('SETTLEMENT_ALREADY_RELEASED'),
          approve: blocked('SETTLEMENT_ALREADY_RELEASED'),
        },
      }),
    )
    expect(screen.queryByText(COUNTDOWN)).not.toBeInTheDocument()
    expect(screen.queryByText(ALL_APPROVED)).not.toBeInTheDocument()
  })

  it('동의 여부를 서버가 안 알려주면 전원 동의로 단정하지 않는다', () => {
    const unknown = settlement().shares.map((s) => ({ ...s, approved: undefined }))
    renderDashboard(settlement({ shares: unknown }))
    expect(screen.getByText(COUNTDOWN)).toBeInTheDocument()
    expect(screen.queryByText(ALL_APPROVED)).not.toBeInTheDocument()
  })
})
