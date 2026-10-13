import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'

import { formatOrderNumber } from '@/features/ticket/bookingCompleteModel'
import i18n from '@/shared/i18n'

import { BookingCompletePage } from './BookingCompletePage'

const orderQuery = vi.hoisted(() => ({ result: {} as Record<string, unknown> }))
const paymentQuery = vi.hoisted(() => ({ result: {} as Record<string, unknown> }))
const chainQuery = vi.hoisted(() => ({ result: {} as Record<string, unknown> }))

vi.mock('@/shared/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/config')>()),
  isDemo: false,
}))
vi.mock('@/shared/queries/order', () => ({
  useOrderDetail: () => orderQuery.result,
}))
vi.mock('@/shared/queries/payment', () => ({
  usePaymentStatus: () => paymentQuery.result,
}))
vi.mock('@/shared/queries/chain', () => ({
  useChainJob: () => chainQuery.result,
}))

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="current route">{location.pathname}</output>
}

function mount(path = '/orders/5501/complete') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>home</div>} />
        <Route path="/orders/:orderId/complete" element={<BookingCompletePage />} />
        <Route path="/orders/:orderId/payment" element={<div>payment</div>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('ko')
  orderQuery.result = {
    data: {
      orderGroupId: 5501,
      groupStatus: 'PAID',
      performanceTitle: 'Live show',
      venueName: 'Stage Hall',
      startAt: '2026-09-18T10:00:00Z',
      totalAmount: 88_000,
      orders: [
        {
          orderId: 5501,
          orderRef: `0x${'9a'.repeat(32)}`,
          status: 'PAID',
          chosenTeamName: 'Team Orbit',
          items: [{ name: 'Standing A', quantity: 2 }],
          amount: 88_000,
          payment: { status: 'PAID', paidAt: '2026-09-15T10:00:00Z' },
          tickets: [
            { ticketId: 91, status: 'ISSUED', ticketTypeName: 'Standing A' },
            { ticketId: 92, status: 'ISSUED', ticketTypeName: 'Standing A' },
          ],
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }
  paymentQuery.result = {
    data: { groupStatus: 'PAID', payments: [{ orderId: 5501, paymentStatus: 'PAID' }] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }
  chainQuery.result = { timedOut: false, isFailed: false }
})

it('온체인 orderRef 대신 사람이 읽을 수 있는 orderId를 예매번호로 표시한다', () => {
  mount()

  const ticket = screen.getByRole('article', { name: /발행된 티켓/ })
  expect(ticket).toHaveTextContent('ORD-5501')
  expect(ticket).not.toHaveTextContent('0x')
})

it('안전한 정수 범위를 벗어난 주문 번호는 홈으로 돌려보낸다', () => {
  mount('/orders/999999999999999999999999/complete')

  expect(screen.getByLabelText('current route')).toHaveTextContent('/')
  expect(screen.getByText('home')).toBeInTheDocument()
  expect(screen.queryByRole('article', { name: /발행된 티켓/ })).not.toBeInTheDocument()
})

it('짧은 주문 번호는 다른 티켓 화면과 같은 네 자리 형식으로 맞춘다', () => {
  expect(formatOrderNumber(91)).toBe('ORD-0091')
})

it('결제 완료 전 주문이면 결제 화면으로 돌려보낸다', () => {
  orderQuery.result = {
    ...orderQuery.result,
    data: {
      ...(orderQuery.result.data as Record<string, unknown>),
      groupStatus: 'PENDING_PAYMENT',
    },
  }
  paymentQuery.result = {
    ...paymentQuery.result,
    data: {
      groupStatus: 'PENDING_PAYMENT',
      payments: [{ orderId: 5501, paymentStatus: 'REQUESTED' }],
    },
  }

  mount()

  expect(screen.getByLabelText('current route')).toHaveTextContent('/orders/5501/payment')
  expect(screen.queryByRole('article', { name: /발행된 티켓/ })).not.toBeInTheDocument()
})

it('미결제 주문의 결제 상태가 404여도 결제 화면으로 돌려보낸다', () => {
  orderQuery.result = {
    ...orderQuery.result,
    data: {
      ...(orderQuery.result.data as Record<string, unknown>),
      groupStatus: 'PENDING_PAYMENT',
    },
  }
  paymentQuery.result = {
    data: undefined,
    isLoading: false,
    isError: true,
    refetch: vi.fn(),
  }

  mount()

  expect(screen.getByLabelText('current route')).toHaveTextContent('/orders/5501/payment')
  expect(screen.queryByText('예매 정보를 불러오지 못했습니다.')).not.toBeInTheDocument()
})

it('주문이 PAID면 결제 상태 조회 오류와 무관하게 완료 화면을 그린다', () => {
  paymentQuery.result = {
    data: undefined,
    isLoading: false,
    isError: true,
    refetch: vi.fn(),
  }

  mount()

  expect(screen.getByRole('article', { name: /발행된 티켓/ })).toHaveTextContent('ORD-5501')
})

it('결제는 완료됐지만 주문 상태 반영이 늦어도 완료 화면을 유지한다', () => {
  orderQuery.result = {
    ...orderQuery.result,
    data: {
      ...(orderQuery.result.data as Record<string, unknown>),
      groupStatus: 'PENDING_PAYMENT',
    },
  }

  mount()

  expect(screen.getByLabelText('current route')).toHaveTextContent('/orders/5501/complete')
  expect(screen.getByRole('article', { name: /발행된 티켓/ })).toHaveTextContent('ORD-5501')
})

it('완료 상태 재조회 중에는 결제 화면으로 되돌리지 않는다', () => {
  orderQuery.result = {
    ...orderQuery.result,
    data: {
      ...(orderQuery.result.data as Record<string, unknown>),
      groupStatus: 'PENDING_PAYMENT',
    },
    isFetching: true,
  }
  paymentQuery.result = {
    data: {
      groupStatus: 'PENDING_PAYMENT',
      payments: [{ orderId: 5501, paymentStatus: 'REQUESTED' }],
    },
    isLoading: false,
    isFetching: true,
    isError: false,
    refetch: vi.fn(),
  }

  mount()

  expect(screen.getByText(/화면을 불러오고 있어요/)).toBeInTheDocument()
  expect(screen.getByLabelText('current route')).toHaveTextContent('/orders/5501/complete')
})

it('결제가 PAYING이면 PAID 반영 전까지 완료 화면에서 기다린다', () => {
  orderQuery.result = {
    ...orderQuery.result,
    data: {
      ...(orderQuery.result.data as Record<string, unknown>),
      groupStatus: 'PENDING_PAYMENT',
    },
  }
  paymentQuery.result = {
    data: {
      groupStatus: 'PENDING_PAYMENT',
      payments: [{ orderId: 5501, paymentStatus: 'PAYING', purchaseJobId: 'job-purchase' }],
      pollAfterMs: 1000,
    },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }

  mount()

  expect(screen.getByText(/화면을 불러오고 있어요/)).toBeInTheDocument()
  expect(screen.getByLabelText('current route')).toHaveTextContent('/orders/5501/complete')
})

it('결제 PAYING 상태가 폴링 상한을 넘으면 결제 화면으로 복귀한다', () => {
  orderQuery.result = {
    ...orderQuery.result,
    data: {
      ...(orderQuery.result.data as Record<string, unknown>),
      groupStatus: 'PENDING_PAYMENT',
    },
  }
  paymentQuery.result = {
    data: {
      groupStatus: 'PENDING_PAYMENT',
      payments: [{ orderId: 5501, paymentStatus: 'PAYING', purchaseJobId: 'job-purchase' }],
      pollAfterMs: 1000,
    },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }
  chainQuery.result = { timedOut: true, isFailed: false }

  mount()

  expect(screen.getByLabelText('current route')).toHaveTextContent('/orders/5501/payment')
})

it('PAYING인데 서버가 폴링을 중단하면 결제 화면으로 복귀한다', () => {
  orderQuery.result = {
    ...orderQuery.result,
    data: {
      ...(orderQuery.result.data as Record<string, unknown>),
      groupStatus: 'PENDING_PAYMENT',
    },
  }
  paymentQuery.result = {
    data: {
      groupStatus: 'PENDING_PAYMENT',
      payments: [{ orderId: 5501, paymentStatus: 'PAYING', purchaseJobId: 'job-purchase' }],
      pollAfterMs: null,
    },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }

  mount()

  expect(screen.getByLabelText('current route')).toHaveTextContent('/orders/5501/payment')
  expect(screen.queryByText(/예매 정보를 불러오는 중입니다/)).not.toBeInTheDocument()
})

it('실패한 결제에 purchaseJobId가 남아도 완료 화면에 갇히지 않는다', () => {
  orderQuery.result = {
    ...orderQuery.result,
    data: {
      ...(orderQuery.result.data as Record<string, unknown>),
      groupStatus: 'PENDING_PAYMENT',
    },
  }
  paymentQuery.result = {
    data: {
      groupStatus: 'PENDING_PAYMENT',
      payments: [{ orderId: 5501, paymentStatus: 'FAILED', purchaseJobId: 'job-failed-purchase' }],
      pollAfterMs: null,
    },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }

  mount()

  expect(screen.getByLabelText('current route')).toHaveTextContent('/orders/5501/payment')
  expect(screen.queryByText(/예매 정보를 불러오는 중입니다/)).not.toBeInTheDocument()
})

it('주문 결제 시각 반영이 늦으면 결제 상태의 paidAt을 사용한다', () => {
  orderQuery.result = {
    ...orderQuery.result,
    data: {
      ...(orderQuery.result.data as Record<string, unknown>),
      groupStatus: 'PENDING_PAYMENT',
      orders: [
        {
          orderId: 5501,
          status: 'PENDING_PAYMENT',
          chosenTeamName: 'Team Orbit',
          items: [{ name: 'Standing A', quantity: 2 }],
          amount: 88_000,
          payment: { status: 'PAYING', paidAt: null },
          tickets: [],
        },
      ],
    },
  }
  paymentQuery.result = {
    ...paymentQuery.result,
    data: {
      groupStatus: 'PAID',
      payments: [{ orderId: 5501, paymentStatus: 'PAID' }],
      paidAt: '2026-09-15T12:34:00Z',
    },
  }

  mount()

  expect(screen.getByRole('article', { name: /발행된 티켓/ })).not.toHaveTextContent('Paid at—')
})

it('완료 주문의 결제액이 누락되면 0원 대신 미상으로 표시한다', () => {
  orderQuery.result = {
    ...orderQuery.result,
    data: { ...(orderQuery.result.data as Record<string, unknown>), totalAmount: null },
  }

  mount()

  const ticket = screen.getByRole('article', { name: /발행된 티켓/ })
  expect(ticket).toHaveTextContent('결제 금액—')
  expect(ticket).not.toHaveTextContent(/(^|[^\d,])0 YoYo/)
})

it('부분 결제 뒤 취소된 하위 주문은 완료된 티켓 매수에 포함하지 않는다', () => {
  orderQuery.result = {
    ...orderQuery.result,
    data: {
      ...(orderQuery.result.data as Record<string, unknown>),
      groupStatus: 'PARTIALLY_PAID',
      totalAmount: 88_000,
      orders: [
        {
          orderId: 5501,
          status: 'PAID',
          chosenTeamName: 'Team Orbit',
          items: [{ name: 'Standing A', quantity: 1 }],
          amount: 44_000,
          payment: { status: 'PAID', paidAt: '2026-09-15T10:00:00Z' },
          tickets: [{ ticketId: 91, status: 'ISSUED', ticketTypeName: 'Standing A' }],
        },
        {
          orderId: 5502,
          status: 'CANCELLED',
          chosenTeamName: 'Team Moon',
          items: [{ name: 'Standing A', quantity: 2 }],
          amount: 44_000,
          tickets: [],
        },
      ],
    },
  }
  paymentQuery.result = {
    ...paymentQuery.result,
    data: {
      groupStatus: 'PARTIALLY_PAID',
      payments: [
        { orderId: 5501, paymentStatus: 'PAID' },
        { orderId: 5502, paymentStatus: 'FAILED' },
      ],
      expiresAt: null,
    },
  }

  mount()

  expect(screen.getByRole('heading', { name: '일부 티켓의 예매가 완료되었습니다' })).toBeVisible()
  expect(screen.getByText('1장 결제 완료 · 2장 주문 만료·취소')).toBeVisible()
  expect(screen.queryByText(/3장 중 1장 결제됨/)).not.toBeInTheDocument()
  expect(screen.getByRole('article', { name: /발행된 티켓/ })).toHaveTextContent('수량1매')
})

it('결제 대기와 취소 주문이 함께 남아도 취소 매수를 숨기지 않는다', () => {
  const current = orderQuery.result.data as Record<string, unknown>
  const paid = (current.orders as Record<string, unknown>[])[0]
  const children = [
    {
      ...paid,
      items: [{ name: 'Standing A', quantity: 1 }],
      amount: 22_000,
      tickets: [{ ticketId: 91, status: 'ISSUED', ticketTypeName: 'Standing A' }],
    },
    {
      orderId: 5502,
      status: 'PENDING_PAYMENT',
      chosenTeamName: 'Team Sun',
      items: [{ name: 'Standing A', quantity: 1 }],
      amount: 22_000,
      tickets: [],
    },
    {
      orderId: 5503,
      status: 'CANCELLED',
      chosenTeamName: 'Team Moon',
      items: [{ name: 'Standing A', quantity: 2 }],
      amount: 44_000,
      tickets: [],
    },
  ]
  orderQuery.result = {
    ...orderQuery.result,
    data: { ...current, groupStatus: 'PARTIALLY_PAID', orders: children },
  }
  paymentQuery.result = {
    ...paymentQuery.result,
    data: {
      ...(paymentQuery.result.data as Record<string, unknown>),
      groupStatus: 'PARTIALLY_PAID',
      payments: [
        { orderId: 5501, paymentStatus: 'PAID' },
        { orderId: 5502, paymentStatus: 'REQUESTED' },
      ],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  }

  mount()

  expect(screen.getByText(/2장 주문 만료·취소/)).toBeVisible()
  expect(screen.getByRole('button', { name: '결제 이어하기' })).toBeVisible()
})
