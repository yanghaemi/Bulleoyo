import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'

import { BookingCompletePage } from './BookingCompletePage'
import { PaymentPage } from './PaymentPage'

const demoMode = vi.hoisted(() => ({ value: true }))
const orderDetailQuery = vi.hoisted(() => ({
  value: {
    data: undefined as Record<string, unknown> | undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
}))
const paymentStatusQuery = vi.hoisted(() => ({
  value: {
    data: undefined as Record<string, unknown> | undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
}))
vi.mock('@/shared/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/config')>()),
  get isDemo() {
    return demoMode.value
  },
}))
vi.mock('@/shared/queries/order', () => ({
  useOrderDetail: () => orderDetailQuery.value,
}))
vi.mock('@/shared/queries/payment', () => ({
  usePaymentStatus: () => paymentStatusQuery.value,
}))
// `LivePaymentPage`가 지갑 잔액도 읽는다(316f92e). 이 파일은 Provider 없이 훅을 mock하는
// 관례라, 안 막으면 진짜 useQuery가 "No QueryClient set"으로 터진다. 데모·라우팅 검증에는
// 잔액이 필요 없어 비운다
vi.mock('@/shared/queries/wallet', () => ({
  useMyWallet: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  WalletCode: { NOT_FOUND: 'WALLET_NOT_FOUND' },
}))
// 세 테스트가 모두 `BookingCompletePage`를 거치고, 그 화면이 PAYING 판정을 수동 타이머 대신
// `useChainJob`으로 바꿨다(미커밋). 실제 훅은 `useQueryClient`를 부르므로 Provider 없는
// 이 파일에서는 반드시 막아야 한다. 화면이 읽는 두 필드만 돌려준다 — 여기서는 job 이 없다
vi.mock('@/shared/queries/chain', () => ({
  useChainJob: () => ({ timedOut: false, isFailed: false }),
}))

function LocationProbe() {
  const location = useLocation()
  return (
    <output aria-label="current route">
      {location.pathname}
      {location.search}
    </output>
  )
}

beforeEach(() => {
  demoMode.value = true
  orderDetailQuery.value = {
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }
  paymentStatusQuery.value = {
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }
  vi.useFakeTimers()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('advances the demo wallet states and preserves from when entering A-06', async () => {
  render(
    <MemoryRouter initialEntries={['/orders/5501/payment?from=12']}>
      <Routes>
        <Route path="/orders/:orderId/payment" element={<PaymentPage />} />
        <Route path="/orders/:orderId/complete" element={<BookingCompletePage />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )

  fireEvent.click(screen.getAllByRole('button', { name: /Pay 88,000 YoYo/ })[0])
  expect(screen.getByText('Confirm in your wallet (1/2)')).toBeVisible()

  await act(async () => vi.advanceTimersByTime(650))
  expect(screen.getByText('Confirm in your wallet (2/2)')).toBeVisible()

  await act(async () => vi.advanceTimersByTime(650))
  expect(screen.getByText('Confirming your request')).toBeVisible()

  await act(async () => vi.advanceTimersByTime(900))
  expect(screen.getByLabelText('current route')).toHaveTextContent('/orders/5501/complete?from=12')
  expect(screen.getByRole('heading', { name: /You’re going to the show/ })).toBeVisible()
})

it('renders the confirmed server order outside demo mode', () => {
  demoMode.value = false
  orderDetailQuery.value.data = {
    orderGroupId: 5501,
    groupStatus: 'PAID',
    performanceTitle: 'Seoul Indie Night',
    venueName: 'Rolling Hall',
    startAt: '2026-09-20T10:00:00Z',
    totalAmount: 88_000,
    orders: [{ orderId: 5501, status: 'PAID', chosenTeamName: '불러요', amount: 88_000,
      items: [{ name: 'GA Standing', quantity: 2, amount: 88_000 }],
      payment: { status: 'PAID', paidAt: '2026-09-14T08:30:00Z' },
      tickets: [
        { ticketId: 1, ticketTypeName: 'GA Standing', status: 'ISSUED' },
        { ticketId: 2, ticketTypeName: 'GA Standing', status: 'ISSUED' },
      ],
    }],
  }
  render(
    <MemoryRouter initialEntries={['/orders/5501/complete?from=12']}>
      <Routes>
        <Route path="/orders/:orderId/payment" element={<div>real payment boundary</div>} />
        <Route path="/orders/:orderId/complete" element={<BookingCompletePage />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )

  expect(screen.getByLabelText('current route')).toHaveTextContent('/orders/5501/complete?from=12')
  expect(screen.getByRole('heading', { name: /You’re going to the show/ })).toBeVisible()
  expect(screen.getByText(/Booking ORD-5501 is complete/)).toBeVisible()
  expect(screen.getByText('Seoul Indie Night')).toBeVisible()
  expect(screen.queryByText('real payment boundary')).not.toBeInTheDocument()
})

it('returns an unconfirmed server order to its payment route', () => {
  demoMode.value = false
  orderDetailQuery.value.data = {
    orderGroupId: 5501,
    groupStatus: 'PENDING_PAYMENT',
  }
  paymentStatusQuery.value.data = {
    payments: [{ orderId: 5501, paymentStatus: 'REQUESTED' }],
    groupStatus: 'PENDING_PAYMENT',
  }

  render(
    <MemoryRouter initialEntries={['/orders/5501/complete?from=12']}>
      <Routes>
        <Route path="/orders/:orderId/payment" element={<div>real payment boundary</div>} />
        <Route path="/orders/:orderId/complete" element={<BookingCompletePage />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )

  expect(screen.getByLabelText('current route')).toHaveTextContent('/orders/5501/payment?from=12')
  expect(screen.getByText('real payment boundary')).toBeVisible()
})
