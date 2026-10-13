/**
 * P-08 정산금 지급 완료 모달(9/24).
 *
 *   ① 수동 지급 job CONFIRMED → 1회. FAILED → 없음(기존 실패 문구).
 *   ② 보는 동안 폴링으로 LOCKED/DISPUTE_OPEN → RELEASED 관측 → 1회. 첫 로드부터 RELEASED → 없음.
 *   ③ ①·② 연달아 → 1회.
 *   ④ 팀별 금액·우리 팀 강조·보증금 문구 조건.
 */

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import i18n from '@/shared/i18n'
import {
  SettlementDashboard,
  type SettlementActionResult,
  type SettlementData,
} from './SettlementDashboard'

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

function share(teamId: number, teamName: string, total: number): SettlementData['shares'][number] {
  return {
    teamId,
    teamName,
    walletAddress: `0x${String(teamId).padStart(40, '0')}`,
    fixedAmount: total,
    choiceAmount: 0,
    dustAmount: 0,
    totalAmount: total,
    choiceCount: 3,
    released: false,
    releasedAt: null,
    approved: true,
    approvedAt: '2026-09-20T19:00:00+09:00',
  }
}

/** 전원 동의로 지급이 열린 `LOCKED` 정산 */
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
    aggregatedAt: '2026-09-20T10:00:00+09:00',
    lockedAt: '2026-09-20T18:00:00+09:00',
    disputeClosesAt: null,
    releasedAt: null,
    releaseTxHash: null,
    counterMatched: true,
    deposit: { status: 'PAID', amount: 50_000, returnTxHash: null, returnedAt: null },
    shares: [share(1, '블루노트', 450_001), share(2, '사운드홀릭', 449_999)],
    myTeam: {
      teamId: 2,
      totalAmount: 449_999,
      released: false,
      releasedAt: null,
      walletAddress: '0x9e0d',
      nextAction: 'WAIT_RELEASE',
      approved: true,
    },
    disputes: [],
    transactions: [],
    actions: {
      aggregate: blocked('PERFORMANCE_INVALID_STATUS'),
      lock: blocked('PERFORMANCE_INVALID_STATUS'),
      dispute: blocked('COMMON_CONFLICT'),
      release: open,
      approve: blocked('COMMON_CONFLICT'),
    },
    ...over,
  }
}

function released(over: Partial<SettlementData> = {}): SettlementData {
  const base = settlement()
  return settlement({
    status: 'RELEASED',
    releasedAt: '2026-09-21T10:00:00+09:00',
    shares: base.shares.map((s) => ({ ...s, released: true })),
    actions: { ...base.actions, release: blocked('SETTLEMENT_ALREADY_RELEASED') },
    ...over,
  })
}

function view(
  data: SettlementData,
  onAction?: (a: 'aggregate' | 'lock' | 'release') => Promise<SettlementActionResult>,
) {
  return (
    <MemoryRouter>
      <SettlementDashboard title="인디의 밤" data={data} onAction={onAction} />
    </MemoryRouter>
  )
}

const TITLE = '정산금 지급이 완료되었습니다'

async function clickRelease() {
  const user = userEvent.setup()
  await user.click(screen.getAllByRole('button', { name: '정산금 지급' })[0])
  const confirm = await screen.findByRole('alertdialog')
  await user.click(within(confirm).getByRole('button', { name: '정산금 지급' }))
  return user
}

beforeEach(async () => {
  await i18n.changeLanguage('ko')
})

describe('SettlementDashboard 지급 완료 모달', () => {
  it('수동 지급 job이 CONFIRMED면 한 번 띄운다', async () => {
    const onAction = vi.fn().mockResolvedValue({ ok: true })
    render(view(settlement(), onAction))

    await clickRelease()

    expect(onAction).toHaveBeenCalledWith('release')
    const dialog = await screen.findByRole('dialog', { name: TITLE })
    expect(within(dialog).getByText(/각 팀 리더 지갑으로 분배되었습니다/)).toBeInTheDocument()
  })

  it('job이 FAILED면 띄우지 않는다', async () => {
    const onAction = vi.fn().mockResolvedValue({ ok: false, code: 'CHAIN_TX_REVERTED' })
    render(view(settlement(), onAction))

    await clickRelease()

    expect(onAction).toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: TITLE })).not.toBeInTheDocument()
  })

  it.each(['LOCKED', 'DISPUTE_OPEN'] as const)(
    '폴링으로 %s → RELEASED를 관측하면 한 번 띄운다',
    (from) => {
      const { rerender } = render(view(settlement({ status: from })))
      expect(screen.queryByRole('dialog', { name: TITLE })).not.toBeInTheDocument()

      rerender(view(released()))
      expect(screen.getByRole('dialog', { name: TITLE })).toBeInTheDocument()
    },
  )

  it('처음부터 RELEASED면 띄우지 않는다', () => {
    const { rerender } = render(view(released()))
    rerender(view(released()))
    expect(screen.queryByRole('dialog', { name: TITLE })).not.toBeInTheDocument()
  })

  it('수동 확정 뒤 재조회가 RELEASED를 가져와도 한 번만 뜬다 — 닫은 뒤 다시 열리지 않는다', async () => {
    const onAction = vi.fn().mockResolvedValue({ ok: true })
    const { rerender } = render(view(settlement(), onAction))

    const user = await clickRelease()
    const dialog = await screen.findByRole('dialog', { name: TITLE })
    await user.click(within(dialog).getByRole('button', { name: '확인' }))
    expect(screen.queryByRole('dialog', { name: TITLE })).not.toBeInTheDocument()

    act(() => rerender(view(released())))
    expect(screen.queryByRole('dialog', { name: TITLE })).not.toBeInTheDocument()
  })

  it('폴링 전이로 먼저 뜬 뒤 다시 RELEASED가 와도 한 번이다', async () => {
    const user = userEvent.setup()
    const { rerender } = render(view(settlement()))
    rerender(view(released()))
    await user.click(
      within(screen.getByRole('dialog', { name: TITLE })).getByRole('button', { name: '확인' }),
    )
    rerender(view(released({ releaseTxHash: '0x' + 'ab'.repeat(32) })))
    expect(screen.queryByRole('dialog', { name: TITLE })).not.toBeInTheDocument()
  })

  it('팀별 지급액을 formatYoyo로 보이고 우리 팀 행을 강조한다', () => {
    const { rerender } = render(view(settlement()))
    rerender(view(released()))
    const dialog = screen.getByRole('dialog', { name: TITLE })
    const rows = within(dialog).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('블루노트')
    expect(rows[0]).toHaveTextContent('450,001 YoYo')
    expect(rows[0]).not.toHaveAttribute('aria-current')
    expect(rows[1]).toHaveTextContent('사운드홀릭(우리 팀)')
    expect(rows[1]).toHaveTextContent('449,999 YoYo')
    expect(rows[1]).toHaveAttribute('aria-current', 'true')
  })

  it('보증금이 PAID면 곧 반환된다는 문구를, RETURNED면 두지 않는다', () => {
    const { rerender, unmount } = render(view(settlement()))
    rerender(view(released()))
    expect(
      within(screen.getByRole('dialog', { name: TITLE })).getByText('보증금은 곧 반환됩니다.'),
    ).toBeInTheDocument()
    unmount()

    const second = render(view(settlement()))
    second.rerender(
      view(
        released({
          deposit: {
            status: 'RETURNED',
            amount: 50_000,
            returnTxHash: '0x' + 'cd'.repeat(32),
            returnedAt: '2026-09-21T10:01:00+09:00',
          },
        }),
      ),
    )
    expect(
      within(screen.getByRole('dialog', { name: TITLE })).queryByText('보증금은 곧 반환됩니다.'),
    ).not.toBeInTheDocument()
  })
})
