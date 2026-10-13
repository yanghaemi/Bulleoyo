import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import i18n from '@/shared/i18n'
import { OrdersPage } from './OrdersPage'
import { BookingCompletePage } from './BookingCompletePage'

const state = vi.hoisted(() => ({
  detail: {} as Record<string, unknown>,
  list: {} as Record<string, unknown>,
  payment: {} as Record<string, unknown>,
}))
vi.mock('@/shared/config', async (original) => ({
  ...(await original<typeof import('@/shared/config')>()),
  isDemo: false,
}))
vi.mock('@/shared/queries/order', () => ({
  useMyOrders: () => ({ data: state.list }),
  useOrderDetail: () => ({ data: state.detail, refetch: vi.fn() }),
}))
vi.mock('@/shared/queries/payment', () => ({
  usePaymentStatus: () => ({ data: state.payment, refetch: vi.fn() }),
}))
vi.mock('@/shared/queries/chain', () => ({
  useChainJob: () => ({ timedOut: false, isFailed: false }),
}))

function mount(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/orders/:orderId/complete" element={<BookingCompletePage />} />
        <Route path="/orders/:orderId/payment" element={<p>Resume group payment</p>} />
        <Route path="/orders/:orderId?" element={<OrdersPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  state.detail = {
    orderGroupId: 5501,
    groupStatus: 'PARTIALLY_PAID',
    performanceId: 12,
    performanceTitle: 'Group concert',
    venueName: 'Group hall',
    startAt: '2026-10-01T10:00:00Z',
    totalAmount: 75000,
    currency: 'KRW',
    display: null,
    orders: [
      {
        orderId: 5501,
        orderRef: '0xprivate1',
        status: 'PAID',
        chosenTeamId: 9,
        chosenTeamName: 'Team Dawn',
        amount: 25000,
        items: [
          { ticketTypeId: 31, name: 'General', priceAmount: 25000, quantity: 1, amount: 25000 },
        ],
        payment: {
          paymentId: 8801,
          status: 'PAID',
          paidAt: '2026-09-23T10:00:00Z',
          approveTxHash: '0xapprove',
          purchaseTxHash: '0xpurchase',
        },
        tickets: [{ ticketId: 90211, ticketTypeName: 'General', status: 'ISSUED' }],
      },
      {
        orderId: 5502,
        orderRef: '0xprivate2',
        status: 'PENDING_PAYMENT',
        chosenTeamId: 11,
        chosenTeamName: 'Team Sunset',
        amount: 50000,
        items: [
          { ticketTypeId: 31, name: 'General', priceAmount: 25000, quantity: 2, amount: 50000 },
        ],
        payment: null,
        tickets: [],
      },
    ],
  }
  state.list = {
    items: [
      {
        orderGroupId: 5501,
        groupStatus: 'PARTIALLY_PAID',
        performanceId: 12,
        performanceTitle: 'Group concert',
        startAt: '2026-10-01T10:00:00Z',
        teamBreakdown: [
          { teamId: 9, teamName: 'Team Dawn', quantity: 1, amount: 25000 },
          { teamId: 11, teamName: 'Team Sunset', quantity: 2, amount: 50000 },
        ],
        totalAmount: 75000,
        currency: 'KRW',
        ticketCount: 3,
        resumable: true,
        orderedAt: '2026-09-23T10:00:00Z',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      },
    ],
  }
  state.payment = {
    orderGroupId: 5501,
    groupStatus: 'PARTIALLY_PAID',
    payments: [
      {
        orderId: 5501,
        paymentId: 8801,
        paymentStatus: 'PAID',
        amount: 25000,
        teamName: 'Team Dawn',
        purchaseJobId: null,
      },
    ],
    paidCount: 1,
    totalCount: 2,
    amount: 75000,
    ticketIds: [90211],
    pollAfterMs: null,
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  }
})

it('renders a grouped receipt through any child URL and resumes the canonical group', () => {
  mount('/orders/5502')
  const receipt = screen.getByRole('region', { name: 'Receipt 5501' })
  expect(receipt).toHaveTextContent('Partially paid')
  expect(receipt).toHaveTextContent('Team Dawn')
  expect(receipt).not.toHaveTextContent('0x')
  expect(within(receipt).getByRole('link', { name: /90211/ })).toHaveAttribute(
    'href',
    '/tickets/90211',
  )
  const list = screen.getByRole('navigation', { name: 'Order list' })
  expect(list).toHaveTextContent('Team Sunset')
  fireEvent.click(within(receipt).getByRole('button', { name: 'Resume payment' }))
  expect(screen.getByText('Resume group payment')).toBeInTheDocument()
})

it('renders one payment-history row for each child order with payment state', () => {
  const children = state.detail.orders as Record<string, unknown>[]
  children[1] = {
    ...children[1],
    payment: { paymentId: 8802, status: 'FAILED', paidAt: null },
  }

  mount('/orders/5501')

  const histories = screen.getAllByRole('list', { name: 'Payment history' })
  for (const history of histories) {
    expect(within(history).getAllByRole('listitem')).toHaveLength(2)
    expect(history).toHaveTextContent('Team Dawn · Paid')
    expect(history).toHaveTextContent('Team Sunset · Payment failed')
  }
})

it('shows paid ticket quantity and amount without claiming the whole group is complete', () => {
  mount('/orders/5501/complete')
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'Part of your booking is confirmed',
  )
  expect(screen.getByText(/1 of 3 tickets paid/)).toBeInTheDocument()
  const ticket = screen.getByRole('article', { name: /Issued ticket/ })
  expect(ticket).toHaveTextContent('25,000 YoYo')
  expect(ticket).not.toHaveTextContent('75,000 YoYo')
  expect(ticket).toHaveTextContent('Team Dawn')
  expect(ticket).not.toHaveTextContent('Team Sunset')
  fireEvent.click(screen.getByRole('button', { name: 'Resume payment' }))
  expect(screen.getByText('Resume group payment')).toBeInTheDocument()
})

it('keeps paid tickets visible after the unpaid remainder expires, without a resume action', () => {
  state.payment.expiresAt = new Date(Date.now() - 1000).toISOString()
  mount('/orders/5501/complete')
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'Part of your booking is confirmed',
  )
  expect(screen.queryByRole('button', { name: 'Resume payment' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'View my tickets' })).toBeInTheDocument()
})

it('does not mistake one paid child for a fully paid group when payment status is unavailable', () => {
  state.payment = {}
  mount('/orders/5501/complete')
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'Part of your booking is confirmed',
  )
  expect(screen.queryByText(/Booking .* is complete/)).not.toBeInTheDocument()
})

it('shows all teams and tickets for a fully paid group', () => {
  state.detail.groupStatus = 'PAID'
  const children = state.detail.orders as Record<string, unknown>[]
  children[1] = {
    ...children[1],
    status: 'PAID',
    payment: { paymentId: 8802, status: 'PAID', paidAt: '2026-09-23T10:01:00Z' },
    tickets: [
      { ticketId: 90212, ticketTypeName: 'General', status: 'ISSUED' },
      { ticketId: 90213, ticketTypeName: 'General', status: 'ISSUED' },
    ],
  }
  mount('/orders/5502/complete')
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('You’re going to the show')
  const ticket = screen.getByRole('article', { name: /Issued ticket ORD-5501/ })
  expect(ticket).toHaveTextContent('Team Dawn · 1 tickets / Team Sunset · 2 tickets')
  expect(ticket).toHaveTextContent('75,000 YoYo')
  expect(ticket).toHaveTextContent('3 tickets')
  expect(screen.queryByRole('button', { name: 'Resume payment' })).not.toBeInTheDocument()
})

it('does not resume a partial receipt with an expired payment window', () => {
  const items = state.list.items as Record<string, unknown>[]
  items[0].expiresAt = new Date(Date.now() - 1000).toISOString()
  mount('/orders/5501')
  const receipt = screen.getByRole('region', { name: 'Receipt 5501' })
  expect(receipt).toHaveTextContent('Partially paid')
  expect(within(receipt).queryByRole('button', { name: 'Resume payment' })).not.toBeInTheDocument()
})

it.each([1000, null])(
  'keeps issued tickets accessible while another child payment is processing (poll %s)',
  (pollAfterMs) => {
    state.payment.payments = [
      { orderId: 5501, paymentStatus: 'PAID', amount: 25000 },
      { orderId: 5502, paymentStatus: 'PAYING', amount: 50000, purchaseJobId: 'processing-job' },
    ]
    state.payment.pollAfterMs = pollAfterMs
    mount('/orders/5501/complete')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Part of your booking is confirmed',
    )
    expect(screen.getByRole('button', { name: 'View my tickets' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resume payment' })).not.toBeInTheDocument()
  },
)
