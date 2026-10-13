import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'

import i18n from '@/shared/i18n'

import { OrdersPage } from './OrdersPage'
import { TicketCancelPage } from './TicketCancelPage'

vi.mock('@/shared/queries/order', () => ({
  useMyOrders: () => ({
    data: {
      items: [
        {
          orderGroupId: 91,
          groupStatus: 'PAID',
          performanceTitle: 'Live concert',
          startAt: '2026-09-26T10:00:00Z',
          totalAmount: 25000,
        },
      ],
      pageInfo: { page: 0, hasNext: false },
    },
  }),
  useOrderDetail: () => ({
    data: {
      orderGroupId: 91,
      groupStatus: 'PAID',
      performanceTitle: 'Live concert',
      startAt: '2026-09-26T10:00:00Z',
      totalAmount: 25000,
      orders: [{ orderId: 91, status: 'PAID', tickets: [] }],
    },
  }),
}))
vi.mock('@/shared/queries/refund', () => ({
  useRefundQuote: () => ({
    data: {
      ticketId: 90211,
      paidAmount: 25000,
      feeRatePercent: 50,
      feeAmount: 12500,
      refundAmount: 12500,
      feeStage: 'D-3_BEFORE',
    },
  }),
  useCancelTicket: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/shared/queries/ticket', () => ({
  useTicketDetail: () => ({
    data: { performanceTitle: 'Live concert', startAt: '2026-09-26T10:00:00Z' },
  }),
}))
vi.mock('@/shared/queries/chain', () => ({ useChainJob: () => ({}) }))

beforeAll(async () => {
  await act(() => i18n.changeLanguage('en'))
})

afterAll(async () => {
  await act(() => i18n.changeLanguage('ko'))
})

it('renders server order dates in English', async () => {
  render(
    <MemoryRouter initialEntries={['/orders']}>
      <Routes>
        <Route path="/orders" element={<OrdersPage />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(screen.getAllByText(/September 26.*KST/)).not.toHaveLength(0)
  expect(screen.queryByText(/9월 26일/)).not.toBeInTheDocument()
  expect(screen.queryByText('주문 있음')).not.toBeInTheDocument()
})

it('renders the server refund bracket explanation in English', async () => {
  render(
    <MemoryRouter initialEntries={['/tickets/90211/cancel']}>
      <Routes>
        <Route path="/tickets/:ticketId/cancel" element={<TicketCancelPage />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(screen.getByText('A 50% refund applies 7 to 3 days before the show.')).toBeInTheDocument()
  expect(screen.queryByText(/공연 7일 전/)).not.toBeInTheDocument()
  expect(screen.queryByText('기한 지남')).not.toBeInTheDocument()
})
