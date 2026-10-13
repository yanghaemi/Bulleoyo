/**
 * P-08 정산 조기 동의(settlement_08) — 틀리면 돈이 일찍 나가거나 영영 안 나가는 네 가지.
 *
 *   ① **전원 동의 전에는 지급이 막혀 있다.** 그리고 왜 막혔는지가 문장으로 옆에 있어야 한다 —
 *      회색 버튼만으로는 "48시간을 기다리는 중"인지 "동의가 덜 찼는지" 알 수 없다.
 *   ② **동의는 확인 모달을 거친다.** 철회할 수 없는 액션이라 한 번의 오클릭으로 나가면 안 된다(§5.6).
 *   ③ **이미 동의한 팀은 다시 누르지 못한다.** 판단은 오직 서버 `actions.approve.available`이다.
 *   ④ **`n/m`은 `shares[]`에서 나온다.** 조회 응답에 합계 필드가 없으므로 지어내지 않는다.
 *   ⑤ **이의를 낸 팀에게는 다음 할 일을 말해준다.** 서버는 이미-동의와 같은 `COMMON_CONFLICT`를
 *      코드만 실어 내려주어, 기본 문구만 띄우면 "이의를 취소해야 한다"를 알 길이 없다.
 */

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

function share(
  teamId: number,
  teamName: string,
  approved: boolean,
): SettlementData['shares'][number] {
  return {
    teamId,
    teamName,
    walletAddress: `0x${String(teamId).padStart(40, '0')}`,
    fixedAmount: 300_000,
    choiceAmount: 0,
    dustAmount: 0,
    totalAmount: 300_000,
    choiceCount: 3,
    released: false,
    releasedAt: null,
    approved,
    approvedAt: approved ? '2026-09-20T19:00:00+09:00' : null,
  }
}

/** `LOCKED` 정산. 동의가 아직 덜 찬 상태가 기본이다 */
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
    shares: [share(1, '블루노트', true), share(2, '사운드홀릭', false), share(3, '리버브', false)],
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
      // 전원이 동의하지 않았고 48시간도 안 지났다 — 서버가 지급을 막는다
      release: blocked('SETTLEMENT_DISPUTE_PERIOD'),
      approve: open,
    },
    ...over,
  }
}

function renderDashboard(data: SettlementData, onApprove = vi.fn()) {
  render(
    <MemoryRouter>
      <SettlementDashboard title="인디의 밤" data={data} onApprove={onApprove} />
    </MemoryRouter>,
  )
  return onApprove
}

beforeEach(async () => {
  await i18n.changeLanguage('ko')
})

describe('SettlementDashboard 정산 조기 동의', () => {
  it('전원이 동의하기 전에는 정산금 지급이 막히고, 막힌 이유가 문장으로 보인다', () => {
    renderDashboard(settlement())

    for (const button of screen.getAllByRole('button', { name: '정산금 지급' }))
      expect(button).toBeDisabled()
    expect(
      screen.getByText(/이의제기 기간이 끝나지 않았거나 열린 이의가 남아 있습니다/),
    ).toBeInTheDocument()
  })

  it('동의는 확인 모달을 거쳐야 호출된다 — 철회할 수 없다는 것을 먼저 알린다', async () => {
    const user = userEvent.setup()
    const onApprove = renderDashboard(settlement())

    await user.click(screen.getAllByRole('button', { name: '정산 동의' })[0])
    // 버튼만 눌러서는 아직 아무것도 나가지 않는다
    expect(onApprove).not.toHaveBeenCalled()

    const confirm = await screen.findByRole('alertdialog')
    expect(within(confirm).getByText(/한 번 동의하면 철회할 수 없습니다/)).toBeInTheDocument()
    expect(within(confirm).getByText(/48시간 이의제기 기간을 기다리지 않고/)).toBeInTheDocument()

    await user.click(within(confirm).getByRole('button', { name: '정산 동의' }))
    expect(onApprove).toHaveBeenCalledTimes(1)
  })

  it('우리 팀이 이미 동의했으면 다시 누를 수 없다 — 판단은 서버 available 하나다', () => {
    renderDashboard(
      settlement({
        shares: [
          share(1, '블루노트', true),
          share(2, '사운드홀릭', true),
          share(3, '리버브', false),
        ],
        myTeam: {
          teamId: 2,
          totalAmount: 300_000,
          released: false,
          releasedAt: null,
          walletAddress: '0x9e0d',
          nextAction: 'WAIT_RELEASE',
          approved: true,
        },
        actions: {
          aggregate: blocked('PERFORMANCE_INVALID_STATUS'),
          lock: blocked('PERFORMANCE_INVALID_STATUS'),
          dispute: open,
          release: blocked('SETTLEMENT_DISPUTE_PERIOD'),
          approve: blocked('COMMON_CONFLICT'),
        },
      }),
    )

    expect(screen.getByRole('button', { name: '동의 완료' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '정산 동의' })).not.toBeInTheDocument()
  })

  it('동의 현황 n/m 은 shares[] 에서 그대로 센다', () => {
    const { rerender } = render(
      <MemoryRouter>
        <SettlementDashboard title="인디의 밤" data={settlement()} />
      </MemoryRouter>,
    )
    const section = screen.getByRole('region', { name: '정산 동의' })
    expect(within(section).getByText('1/3')).toBeInTheDocument()
    expect(within(section).getByText(/2개 팀이 남았습니다/)).toBeInTheDocument()
    // 팀별 배지도 같은 근거를 쓴다 — PC 표와 모바일 패널 두 벌이라 개수가 2배다
    expect(screen.getAllByText('동의함')).toHaveLength(2)
    expect(screen.getAllByText('동의 전')).toHaveLength(4)

    rerender(
      <MemoryRouter>
        <SettlementDashboard
          title="인디의 밤"
          data={settlement({
            shares: [
              share(1, '블루노트', true),
              share(2, '사운드홀릭', true),
              share(3, '리버브', true),
            ],
          })}
        />
      </MemoryRouter>,
    )
    expect(
      within(screen.getByRole('region', { name: '정산 동의' })).getByText('3/3'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/개 팀이 남았습니다/)).not.toBeInTheDocument()
  })

  it('이의를 낸 팀에게는 이의 취소가 먼저라고 말한다 — 기본 충돌 문구를 그대로 두지 않는다', () => {
    renderDashboard(
      settlement({
        disputes: [
          {
            disputeId: 5,
            performanceId: 12,
            teamId: 2, // myTeam.teamId — 내 팀이 낸 이의다
            status: 'OPEN',
            createdAt: '2026-09-20T19:30:00+09:00',
            releaseHeld: true,
          },
        ],
        actions: {
          ...settlement().actions,
          approve: blocked('COMMON_CONFLICT'),
        },
      }),
    )

    expect(screen.getByText(/이의를 취소한 뒤 동의할 수 있습니다/)).toBeInTheDocument()
  })

  it('이의 문구가 다른 차단 사유까지 덮지 않는다 — 취소해도 소용없는 상황이 있다', () => {
    // 열린 이의가 있지만 막힌 이유는 중단된 정산이다. 이의를 취소해도 동의할 수 없다
    renderDashboard(
      settlement({
        disputes: [
          {
            disputeId: 5,
            performanceId: 12,
            teamId: 2,
            status: 'OPEN',
            createdAt: '2026-09-20T19:30:00+09:00',
            releaseHeld: true,
          },
        ],
        actions: { ...settlement().actions, approve: blocked('PERFORMANCE_INVALID_STATUS') },
      }),
    )
    expect(screen.queryByText(/이의를 취소한 뒤 동의할 수 있습니다/)).not.toBeInTheDocument()
  })

  it('지급이 끝난 정산에는 동의 현황을 남기지 않는다', () => {
    // 48시간 경로로 끝난 정산 — 아무도 동의하지 않았고(0/3) 돈은 이미 나갔다
    renderDashboard(
      settlement({
        status: 'RELEASED',
        releasedAt: '2026-09-22T18:00:00+09:00',
        shares: [share(1, '블루노트', false), share(2, '사운드홀릭', false), share(3, '리버브', false)],
        actions: { ...settlement().actions, approve: blocked('SETTLEMENT_ALREADY_RELEASED') },
      }),
    )
    expect(screen.queryByText(/개 팀이 남았습니다/)).not.toBeInTheDocument()
    expect(screen.queryByText(/전원이 동의하면 48시간/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '정산 동의' })).not.toBeInTheDocument()
  })

  it('서버가 동의 여부를 안 알려주면 전 팀을 "동의 전"으로 단정하지 않는다', () => {
    const base = settlement()
    renderDashboard({
      ...base,
      shares: base.shares.map((s) => ({ ...s, approved: undefined, approvedAt: null })),
    })
    expect(screen.queryByText('동의 전')).not.toBeInTheDocument()
    expect(screen.queryByText(/개 팀이 남았습니다/)).not.toBeInTheDocument()
  })
})
