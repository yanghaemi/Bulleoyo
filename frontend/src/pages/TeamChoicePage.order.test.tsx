/**
 * A-03 → A-04 → A-05 — 화면만 보고는 드러나지 않는 세 가지를 못 박는다.
 *
 *   ① A-03이 고른 옵션·수량이 A-04로 건너간다. 화면설계 v6 §4 A-04에 이 파라미터가 없어
 *      `navigate(state)`로 정했고, 그 약속이 깨지면 다음 조항이 조용히 발동한다.
 *   ② **선택이 없으면 A-03으로 되돌린다.** 수량 1·첫 옵션 같은 기본값을 만들면 관객이
 *      고르지 않은 티켓을 사게 된다 — 새로고침 한 번으로 그렇게 된다.
 *   ③ 멱등키(§0.8)는 **같은 본문 재시도에서 같은 값**이어야 한다. 매번 새로 만들면
 *      주문이 두 번 생기고 재고를 두 번 선점한다. 본문이 바뀌면(팀 변경) 새 키여야 한다 —
 *      같은 키 + 다른 본문은 서버가 409로 거절한다.
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'

import { ApiError } from '@/shared/api/client'

import { TeamChoicePage } from './TeamChoicePage'
import { TicketOptionsPage } from './TicketOptionsPage'

const order = vi.hoisted(() => ({
  mutate: vi.fn(),
  /** 마지막 mutate에 딸려 온 콜백 — 성공·실패를 테스트가 직접 일으킨다 */
  callbacks: undefined as
    { onSuccess?: (data: unknown) => void; onError?: (error: unknown) => void } | undefined,
}))
const performance = vi.hoisted(() => ({
  status: 'ON_SALE' as string | undefined,
  error: null as Error | null,
}))

vi.mock('@/shared/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/config')>()),
  isDemo: false,
  isDev: false,
}))
vi.mock('@/shared/queries/performance', () => ({
  usePerformanceDetail: () => ({
    data: {
      performanceId: 12,
      title: '합정 3밴드 합동공연',
      status: performance.status,
      startAt: '2026-09-20T09:30:00Z',
      venueName: 'Rolling Hall',
      jointPerformance: true,
      participants: [
        { teamId: 7, teamName: '블루노트', host: true },
        { teamId: 11, teamName: '노이즈캔슬', host: false },
      ],
      ticketTypes: [
        {
          ticketTypeId: 101,
          name: 'General admission',
          price: { amount: 20_000, currency: 'KRW' },
          remainingQuantity: 80,
        },
        {
          ticketTypeId: 102,
          name: 'Supporter ticket',
          price: { amount: 25_000, currency: 'KRW' },
          remainingQuantity: 24,
        },
      ],
    },
    isPending: false,
    error: performance.error,
    refetch: vi.fn(),
  }),
}))
vi.mock('@/shared/queries/order', () => ({
  useCreateOrder: () => ({
    mutate: (variables: unknown, callbacks: typeof order.callbacks) => {
      order.callbacks = callbacks
      order.mutate(variables)
    },
    isPending: false,
  }),
}))

/** 지금 어디에 있고 무엇을 들고 왔는가 */
function Probe() {
  const location = useLocation()
  return (
    <div data-testid="probe">{`${location.pathname}${location.search} ${JSON.stringify(location.state)}`}</div>
  )
}

function probe(): string {
  return screen.getByTestId('probe').textContent ?? ''
}

function renderFlow(entry: { pathname: string; state?: unknown }) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Probe />
      <Routes>
        <Route path="/performances/:id/order" element={<TicketOptionsPage />} />
        <Route path="/performances/:id/order/choice" element={<TeamChoicePage />} />
        <Route path="/performances/:id" element={<p>performance detail</p>} />
        <Route path="/orders/:orderId/payment" element={<p>payment screen</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

/** 본문이 같은 두 호출이 같은 키를 썼는가 — 호출 인자에서 키만 꺼낸다 */
function keyOfCall(index: number): string {
  return (order.mutate.mock.calls[index][0] as { idempotencyKey: string }).idempotencyKey
}

function bodyOfCall(index: number): Record<string, unknown> {
  return (order.mutate.mock.calls[index][0] as { body: Record<string, unknown> }).body
}

function assign(teamName: string, quantity: number) {
  const row = screen.getByRole('group', { name: `${teamName} ticket allocation` })
  for (let i = 0; i < quantity; i += 1) {
    fireEvent.click(within(row).getByRole('button', { name: '수량 늘리기' }))
  }
}

function unassign(teamName: string, quantity: number) {
  const row = screen.getByRole('group', { name: `${teamName} ticket allocation` })
  for (let i = 0; i < quantity; i += 1) {
    fireEvent.click(within(row).getByRole('button', { name: '수량 줄이기' }))
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  order.callbacks = undefined
  performance.status = 'ON_SALE'
  performance.error = null
})

it.each(['DRAFT', 'PENDING_AGREEMENT', 'SALE_CLOSED', 'ENDED', 'CANCELLED', undefined])(
  '판매 불가 상태 %s에서 옵션·팀 선택 직링크를 상세로 돌려보낸다',
  async (status) => {
    performance.status = status
    const options = renderFlow({ pathname: '/performances/12/order' })
    await screen.findByText('performance detail')
    expect(screen.queryByRole('button', { name: 'Next: Select team' })).not.toBeInTheDocument()
    options.unmount()
    renderFlow({
      pathname: '/performances/12/order/choice',
      state: { ticketTypeId: 101, quantity: 1 },
    })
    await screen.findByText('performance detail')
    expect(order.mutate).not.toHaveBeenCalled()
  },
)

it('이전 판매중 데이터가 있어도 재조회 오류이면 팀 선택과 주문을 막고 재시도한다', () => {
  performance.error = new Error('offline')
  renderFlow({
    pathname: '/performances/12/order/choice',
    state: { ticketTypeId: 101, quantity: 1 },
  })
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /다시 시도/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Continue to review' })).not.toBeInTheDocument()
})

it('A-03이 고른 옵션·수량을 A-04로 넘긴다', async () => {
  renderFlow({ pathname: '/performances/12/order' })

  // 두 번째 옵션으로 바꾸고 수량을 2로 올린다
  fireEvent.click(screen.getByText('Supporter ticket'))
  fireEvent.click(screen.getAllByLabelText('수량 늘리기')[0])

  fireEvent.click(screen.getAllByRole('button', { name: 'Next: Select team' })[0])

  await waitFor(() => expect(probe()).toContain('/performances/12/order/choice'))
  // 넘어가는 것은 **식별자와 수량뿐**이다. 금액을 state로 나르면 뒤로가기로 되살아난
  // 옛 가격으로 주문하게 된다 — 단가는 A-04가 공연 상세를 다시 읽어 맞춘다
  expect(probe()).toContain('{"ticketTypeId":102,"quantity":2}')
  // 선택을 들고 왔으므로 A-04가 그려진다(A-03으로 되돌지 않는다)
  expect(screen.getByText('노이즈캔슬')).toBeTruthy()
})

it('선택 없이 A-04에 들어오면 기본값을 만들지 않고 A-03으로 되돌린다', async () => {
  // 새로고침·주소 직접 입력·뒤로가기로 history state가 날아간 경우
  renderFlow({ pathname: '/performances/12/order/choice' })

  await waitFor(() => expect(probe()).toContain('/performances/12/order'))
  expect(probe()).not.toContain('/order/choice')
  // 수량 1·첫 옵션으로 조용히 주문을 만들지 않는다
  expect(order.mutate).not.toHaveBeenCalled()
})

it('망가진 선택(수량 상한 초과)도 선택 없음으로 보고 A-03으로 되돌린다', async () => {
  renderFlow({
    pathname: '/performances/12/order/choice',
    state: { ticketTypeId: 101, quantity: 9 },
  })

  await waitFor(() => expect(probe()).toContain('/performances/12/order'))
  // `/order/choice`도 `/order`를 포함한다 — 되돌아왔는지는 이 줄이 판정한다
  expect(probe()).not.toContain('/order/choice')
  expect(order.mutate).not.toHaveBeenCalled()
})

it('주문 생성 재시도는 같은 멱등키를 다시 쓰고, 본문이 바뀌면 새 키를 만든다', async () => {
  renderFlow({
    pathname: '/performances/12/order/choice',
    state: { ticketTypeId: 101, quantity: 2 },
  })

  assign('블루노트', 2)
  fireEvent.click(screen.getAllByRole('button', { name: 'Continue to review' })[0])
  await waitFor(() => expect(order.mutate).toHaveBeenCalledTimes(1))

  // 본문은 A-03의 items + A-04의 팀이 한 요청에 모인 것이다(ticket_01)
  expect(bodyOfCall(0)).toEqual({
    performanceId: 12,
    items: [{ ticketTypeId: 101, quantity: 2, chosenTeamId: 7 }],
    // 클라이언트 계산 금액 — 단가 20,000 × 2
    totalAmount: 40_000,
  })

  // 실패 → 같은 팀으로 재시도: 본문이 같으니 **같은 키**여야 한다
  act(() =>
    order.callbacks?.onError?.(
      new ApiError({ code: 'COMMON_INTERNAL_ERROR', status: 500, msg: '오류' }),
    ),
  )
  await screen.findByRole('alert')
  fireEvent.click(screen.getAllByRole('button', { name: 'Continue to review' })[0])
  await waitFor(() => expect(order.mutate).toHaveBeenCalledTimes(2))
  expect(keyOfCall(1)).toBe(keyOfCall(0))

  // 팀을 바꾸면 본문이 달라진다 — 같은 키를 그대로 쓰면 서버가 409로 거절한다
  unassign('블루노트', 2)
  assign('노이즈캔슬', 2)
  fireEvent.click(screen.getAllByRole('button', { name: 'Continue to review' })[0])
  await waitFor(() => expect(order.mutate).toHaveBeenCalledTimes(3))
  expect(bodyOfCall(2).items).toEqual([{ ticketTypeId: 101, quantity: 2, chosenTeamId: 11 }])
  expect(keyOfCall(2)).not.toBe(keyOfCall(0))
})

it('여러 팀에 나눈 주문을 items[].chosenTeamId와 한 멱등키로 생성한다', async () => {
  renderFlow({
    pathname: '/performances/12/order/choice',
    state: { ticketTypeId: 101, quantity: 2 },
  })

  assign('블루노트', 1)
  assign('노이즈캔슬', 1)
  fireEvent.click(screen.getAllByRole('button', { name: 'Continue to review' })[0])

  expect(order.mutate).toHaveBeenCalledOnce()
  expect(bodyOfCall(0)).toEqual({
    performanceId: 12,
    totalAmount: 40_000,
    items: [
      { ticketTypeId: 101, quantity: 1, chosenTeamId: 7 },
      { ticketTypeId: 101, quantity: 1, chosenTeamId: 11 },
    ],
  })
})

it('주문이 생기면 A-05가 기대하는 주소로 넘긴다', async () => {
  renderFlow({
    pathname: '/performances/12/order/choice',
    state: { ticketTypeId: 101, quantity: 1 },
  })

  assign('블루노트', 1)
  fireEvent.click(screen.getAllByRole('button', { name: 'Continue to review' })[0])
  await waitFor(() => expect(order.mutate).toHaveBeenCalledTimes(1))

  // A-05(LivePaymentPage)는 `:orderId` 경로와 `from` 쿼리를 읽는다
  act(() =>
    order.callbacks?.onSuccess?.({ orderId: 7788, status: 'PENDING_PAYMENT', shortfall: 0 }),
  )
  await waitFor(() => expect(probe()).toContain('/orders/7788/payment?from=12'))
  expect(screen.getByText('payment screen')).toBeTruthy()
})

it('주문 번호가 없는 201은 결제로 넘기지 않는다', async () => {
  renderFlow({
    pathname: '/performances/12/order/choice',
    state: { ticketTypeId: 101, quantity: 1 },
  })

  assign('블루노트', 1)
  fireEvent.click(screen.getAllByRole('button', { name: 'Continue to review' })[0])
  await waitFor(() => expect(order.mutate).toHaveBeenCalledTimes(1))

  act(() => order.callbacks?.onSuccess?.({ status: 'PENDING_PAYMENT' }))
  await screen.findByRole('alert')
  expect(probe()).toContain('/performances/12/order/choice')
})
