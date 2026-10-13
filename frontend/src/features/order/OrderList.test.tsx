import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import i18n from '@/shared/i18n'
import { OrderList, type OrderListItem } from './OrderList'

const orders: OrderListItem[] = [
  {
    orderId: '82',
    orderNumber: 'ORD-82',
    showTitle: 'Night concert',
    dateLabel: 'Sep 20, 18:30 KST',
    venue: 'Seoul',
    status: 'PAID',
    totalAmount: 88000,
    history: [{ status: 'PAID', atLabel: 'Sep 3, 20:06 KST' }],
    tickets: [
      {
        ticketId: '41',
        ticketNumber: 'TKT-41',
        ticketTypeName: 'Standing',
        teamName: 'Band',
        cancelled: true,
      },
    ],
  },
  {
    orderId: '91',
    orderNumber: 'ORD-91',
    showTitle: 'Next concert',
    dateLabel: 'Sep 26, 19:00 KST',
    venue: 'Seoul',
    status: 'PENDING_PAYMENT',
    totalAmount: 30000,
    history: [{ status: 'REQUESTED', atLabel: 'Sep 8, 14:11 KST' }],
    tickets: [],
  },
]

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

it('presents the selected receipt, payment timeline and cancelled ticket in one language', () => {
  render(
    <MemoryRouter>
      <OrderList orders={orders} onSelect={vi.fn()} onCollapse={vi.fn()} />
    </MemoryRouter>,
  )
  expect(screen.getByRole('heading', { name: 'Order history', level: 1 })).toBeInTheDocument()
  expect(screen.getByText(/Sample orders/)).toBeInTheDocument()
  const receipt = screen.getByRole('region', { name: 'Receipt ORD-82' })
  expect(within(receipt).getByRole('list', { name: 'Payment history' })).toHaveTextContent('Paid')
  expect(within(receipt).getByRole('link', { name: /TKT-41.*Cancelled/ })).toHaveAttribute(
    'href',
    '/tickets/41',
  )
  expect(within(receipt).queryByRole('button', { name: 'Resume payment' })).not.toBeInTheDocument()
  expect(receipt.textContent).not.toMatch(/[가-힣]/)
})

it('retains mobile URL selection and collapse callbacks with full-width disclosures', () => {
  const select = vi.fn()
  const collapse = vi.fn()
  render(
    <MemoryRouter>
      <OrderList orders={orders} selectedId="91" onSelect={select} onCollapse={collapse} />
    </MemoryRouter>,
  )
  const mobile = screen.getByRole('list', { name: 'Order disclosures' })
  const selected = within(mobile).getByRole('button', { expanded: true })
  expect(selected).toHaveAttribute('aria-controls', 'order-panel-91')
  expect(within(mobile).getByRole('button', { name: 'Resume payment' })).toBeInTheDocument()
  fireEvent.click(selected)
  expect(collapse).toHaveBeenCalledOnce()
  fireEvent.click(within(mobile).getByRole('button', { expanded: false }))
  expect(select).toHaveBeenCalledWith('82')
  const links = screen.getByRole('navigation', { name: 'Order list' })
  expect(within(links).getByRole('link', { current: true })).toHaveAttribute('href', '/orders/91')
})

it('localizes loading, empty and receipt labels when Korean is selected', async () => {
  await i18n.changeLanguage('ko')
  const view = render(
    <MemoryRouter>
      <OrderList orders={[]} loading onSelect={vi.fn()} onCollapse={vi.fn()} />
    </MemoryRouter>,
  )
  expect(screen.getByLabelText('주문 내역을 불러오는 중')).toHaveAttribute('aria-busy', 'true')
  view.rerender(
    <MemoryRouter>
      <OrderList orders={[]} onSelect={vi.fn()} onCollapse={vi.fn()} />
    </MemoryRouter>,
  )
  expect(screen.getByRole('heading', { name: '주문 내역', level: 1 })).toBeInTheDocument()
  expect(screen.getByText('주문 내역이 없습니다')).toBeInTheDocument()
  expect(screen.queryByText('No orders yet.')).not.toBeInTheDocument()
})

it('renders multiple unknown team allocations without duplicate React keys', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    render(
      <MemoryRouter>
        <OrderList
          orders={[
            {
              ...orders[0],
              teamBreakdown: [
                { teamName: 'Unknown A', quantity: 1 },
                { teamName: 'Unknown B', quantity: 2 },
              ],
            },
          ]}
          onSelect={vi.fn()}
          onCollapse={vi.fn()}
        />
      </MemoryRouter>,
    )

    const errors = consoleError.mock.calls.flat().join(' ')
    expect(errors).not.toContain('Encountered two children with the same key')
    expect(errors).not.toContain('Each child in a list should have a unique "key" prop')
  } finally {
    consoleError.mockRestore()
  }
})
