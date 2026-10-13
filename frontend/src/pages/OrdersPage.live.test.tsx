import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import i18n from '@/shared/i18n'
import { OrdersPage } from './OrdersPage'

const queries = vi.hoisted(() => ({
  list: {} as Record<string, unknown>,
  detail: {} as Record<string, unknown>,
  pages: {} as Record<number, Record<string, unknown>>,
  page: 0,
  id: undefined as number | undefined,
}))
vi.mock('@/shared/queries/order', () => ({
  useMyOrders: (params: { page: number }) => {
    queries.page = params.page
    return queries.pages[params.page] ?? queries.list
  },
  useOrderDetail: (id: number | undefined) => {
    queries.id = id
    return queries.detail
  },
}))

function mount(path = '/orders/5501') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/orders/:orderId?" element={<OrdersPage />} />
        <Route path="/orders/:orderId/payment" element={<p>Actual payment route</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  queries.pages = {}
  queries.list = {
    data: {
      items: [
        {
          orderGroupId: 5501,
          performanceId: 12,
          performanceTitle: 'Server concert',
          startAt: '2026-09-26T10:00:00Z',
          groupStatus: 'PENDING_PAYMENT',
          teamBreakdown: [{ teamId: 7, teamName: 'Actual band', quantity: 1, amount: 32000 }],
          totalAmount: 32000,
          currency: 'KRW',
          ticketCount: 1,
          resumable: true,
          orderedAt: '2026-09-18T10:00:00Z',
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
      ],
      pageInfo: { page: 0, size: 20, totalElements: 21, hasNext: true },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }
  queries.detail = {
    data: {
      orderGroupId: 5501,
      groupStatus: 'PENDING_PAYMENT',
      performanceId: 12,
      performanceTitle: 'Server concert',
      startAt: '2026-09-26T10:00:00Z',
      venueName: 'Actual hall',
      totalAmount: 32000,
      currency: 'KRW',
      orders: [
        {
          orderId: 5501,
          orderRef: '0xsecret',
          status: 'PENDING_PAYMENT',
          chosenTeamId: 7,
          chosenTeamName: 'Actual band',
          items: [],
          amount: 32000,
          payment: { paymentId: 8, status: 'AWAITING_SIGNATURE', paidAt: null },
          tickets: [],
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }
})

it('uses server orders and separate detail with a numeric payment route', () => {
  mount()
  expect(screen.getAllByText('Server concert').length).toBeGreaterThan(0)
  expect(queries.id).toBe(5501)
  const receipt = screen.getByRole('region', { name: /Receipt/ })
  expect(receipt).toHaveTextContent('Actual hall')
  expect(receipt).not.toHaveTextContent('0xsecret')
  expect(screen.queryByText(/Sample orders/)).not.toBeInTheDocument()
  fireEvent.click(within(receipt).getByRole('button', { name: 'Resume payment' }))
  expect(screen.getByText('Actual payment route')).toBeInTheDocument()
})

it('requests subsequent pages using pageInfo and retains the selected deep link', () => {
  queries.pages[1] = {
    ...queries.list,
    data: {
      items: Array.from({ length: 20 }, (_, index) => ({
        orderGroupId: 5502 + index,
        performanceTitle: `Next concert ${index + 1}`,
        groupStatus: 'PAID',
        resumable: false,
      })),
      pageInfo: { page: 1, size: 20, totalElements: 40, hasNext: false },
    },
  }
  mount()
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  expect(queries.page).toBe(1)
  expect(queries.id).toBe(5501)
  expect(screen.getByText('20 orders')).toBeInTheDocument()
  const pageRows = screen.getByRole('navigation', { name: 'Order list' })
  expect(within(pageRows).getAllByRole('link')).toHaveLength(20)
  expect(within(pageRows).queryByRole('link', { name: /Server concert/ })).not.toBeInTheDocument()
  const mobileRows = screen.getByRole('list', { name: 'Order disclosures' })
  expect(within(mobileRows).getAllByRole('listitem')).toHaveLength(20)
  const mobileReceipt = screen.getByRole('region', { name: 'Selected order 5501' })
  expect(mobileReceipt).toHaveTextContent('Actual hall')
  expect(within(mobileReceipt).getByRole('button', { name: 'Resume payment' })).toBeInTheDocument()
  const receipt = screen.getByRole('region', { name: /Receipt/ })
  fireEvent.click(within(receipt).getByRole('button', { name: 'Resume payment' }))
  expect(screen.getByText('Actual payment route')).toBeInTheDocument()
})

it('keeps the list resumable while selected order details are still loading', () => {
  queries.detail = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() }

  mount('/orders')

  expect(screen.getAllByRole('button', { name: 'Resume payment' }).length).toBeGreaterThan(0)
})

it('does not expose an expired resume action while selected order details are loading', () => {
  queries.list = {
    ...queries.list,
    data: {
      ...(queries.list.data as Record<string, unknown>),
      items: [
        {
          orderGroupId: 5501,
          groupStatus: 'PENDING_PAYMENT',
          resumable: true,
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        },
      ],
    },
  }
  queries.detail = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() }

  mount('/orders')

  expect(screen.queryByRole('button', { name: 'Resume payment' })).not.toBeInTheDocument()
})

it('honors a server revocation when returning to the list and retains it on the next page', () => {
  queries.pages[1] = {
    ...queries.list,
    data: { items: [], pageInfo: { page: 1, size: 20, totalElements: 21, hasNext: false } },
  }
  mount()
  expect(
    within(screen.getByRole('region', { name: /Receipt/ })).getByRole('button', {
      name: 'Resume payment',
    }),
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  queries.list = {
    ...queries.list,
    data: {
      items: [{ orderGroupId: 5501, groupStatus: 'PENDING_PAYMENT', resumable: false }],
      pageInfo: { page: 0, size: 20, totalElements: 21, hasNext: true },
    },
  }
  fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
  expect(screen.queryByRole('button', { name: 'Resume payment' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  expect(screen.queryAllByRole('button', { name: 'Resume payment' })).toHaveLength(0)
})

it('does not resume a previously observed order after its payment window expires', () => {
  queries.pages[1] = {
    ...queries.list,
    data: { items: [], pageInfo: { page: 1, size: 20, totalElements: 21, hasNext: false } },
  }
  const startedAt = Date.now()
  const now = vi.spyOn(Date, 'now').mockReturnValue(startedAt)
  try {
    mount()
    expect(
      within(screen.getByRole('region', { name: /Receipt/ })).getByRole('button', {
        name: 'Resume payment',
      }),
    ).toBeInTheDocument()
    now.mockReturnValue(startedAt + 16 * 60 * 1000)
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.queryAllByRole('button', { name: 'Resume payment' })).toHaveLength(0)
  } finally {
    now.mockRestore()
  }
})

it.each([
  ['PAID', 'PAID'],
  ['PENDING_PAYMENT', 'PAYING'],
])('does not resume an order with updated detail status %s / %s', (status, paymentStatus) => {
  mount()
  queries.detail = {
    ...queries.detail,
    data: {
      ...(queries.detail.data as Record<string, unknown>),
      groupStatus: status,
      orders: [
        {
          orderId: 5501,
          status,
          payment: { paymentId: 8, status: paymentStatus, paidAt: null },
          tickets: [],
        },
      ],
    },
  }
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  expect(screen.queryAllByRole('button', { name: 'Resume payment' })).toHaveLength(0)
})

it('shows list errors with retry instead of fabricated sample orders', () => {
  queries.list = { isError: true, isLoading: false, refetch: vi.fn() }
  mount('/orders')
  expect(screen.getByRole('alert')).toHaveTextContent('Could not load orders')
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(queries.list.refetch).toHaveBeenCalledOnce()
})

it('keeps failed details distinct from an empty issued-ticket list', () => {
  queries.detail = { isError: true, isLoading: false, refetch: vi.fn() }
  mount()
  expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Could not load order details')
  expect(screen.queryByText(/No tickets have been issued/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Resume payment' })).not.toBeInTheDocument()
})

it('supports deep links to an order outside the current list page', () => {
  queries.list = {
    ...queries.list,
    data: { items: [], pageInfo: { page: 0, totalElements: 0, hasNext: false } },
  }
  mount()
  expect(screen.getByRole('region', { name: /Receipt/ })).toHaveTextContent('Actual hall')
  // Detail omits resumable and expiry; an unseen list row cannot grant payment resumption.
  expect(screen.getByRole('region', { name: 'Selected order 5501' })).toHaveTextContent(
    'Actual hall',
  )
  expect(screen.getByText('0 orders')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Resume payment' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Close order details' }))
  expect(screen.queryByRole('region', { name: 'Selected order 5501' })).not.toBeInTheDocument()
})

it.each(['loading', 'error'])('keeps a deep-linked receipt available during list %s', (state) => {
  queries.list = {
    isLoading: state === 'loading',
    isError: state === 'error',
    refetch: vi.fn(),
  }
  mount()
  expect(screen.getByRole('region', { name: /Receipt/ })).toHaveTextContent('Actual hall')
  expect(screen.getByRole('region', { name: 'Selected order 5501' })).toHaveTextContent(
    'Actual hall',
  )
})

it('shows independent detail loading for a deep link outside the current page', () => {
  queries.detail = { isLoading: true, isError: false, refetch: vi.fn() }
  mount('/orders/9999')
  expect(screen.getByRole('status')).toHaveTextContent('Loading order details')
  expect(screen.getByText('1 orders')).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: /Receipt/ })).not.toBeInTheDocument()
})

it('normalizes a zero-prefixed route ID for receipt selection', () => {
  mount('/orders/05501')
  expect(queries.id).toBe(5501)
  expect(screen.getByRole('region', { name: /Receipt/ })).toHaveTextContent('Actual hall')
})

it.each(['ORD-5501', '5501abc', '9007199254740993'])(
  'does not query malformed order route %s',
  (id) => {
    mount('/orders/' + id)
    expect(queries.id).toBeUndefined()
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid order')
  },
)

it.each([true, false])(
  'shows a missing deep-linked detail without substituting another order (empty list %s)',
  (empty) => {
    queries.detail = { isError: true, isLoading: false, refetch: vi.fn() }
    if (empty)
      queries.list = {
        ...queries.list,
        data: { items: [], pageInfo: { page: 0, totalElements: 0, hasNext: false } },
      }
    mount('/orders/9999')
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load order details')
    expect(screen.queryByRole('region', { name: /Receipt/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resume payment' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(queries.detail.refetch).toHaveBeenCalledOnce()
  },
)

it('treats malformed successful detail as unavailable instead of an infinite loader', () => {
  queries.detail = { ...queries.detail, data: { orderGroupId: 5501 } }
  mount()
  expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Could not load order details')
  expect(screen.queryByText('Loading order details')).not.toBeInTheDocument()
})
