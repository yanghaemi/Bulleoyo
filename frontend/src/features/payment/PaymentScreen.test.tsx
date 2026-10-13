import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { PaymentScreen, type PaymentState } from './PaymentScreen'

const props = {
  data: {
    showTitle: 'Live',
    dateLabel: '2026-09-26',
    venue: 'Hall',
    ticketTypeName: 'Standing',
    quantity: 1,
    teamName: 'Band',
    totalAmount: 25000,
    walletBalance: 50000,
  },
  onPay: vi.fn(),
  onRetry: vi.fn(),
  onViewBalance: vi.fn(),
  onBackToShow: vi.fn(),
}
function view(state: PaymentState) {
  return (
    <MemoryRouter>
      <PaymentScreen {...props} state={state} />
    </MemoryRouter>
  )
}

describe('payment operation presentation', () => {
  it('keeps the selected wallet and ticket information behind the pending operation', () => {
    const page = render(view({ kind: 'review' }))
    expect(screen.getByText('My wallet')).toBeInTheDocument()
    page.rerender(view({ kind: 'confirming' }))
    expect(screen.getByText('My wallet')).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(screen.getByText('Standing × 1')).toBeInTheDocument()
  })
  it('locks the pay button until the wallet is ready', () => {
    // 진입 직후 눌린 결제가 계정 없는 지갑으로 나가면 NOT_CONNECTED 로 떨어졌다 —
    // P-03·P-06과 같은 마운트 게이트를 A-05에도 둔다(D-77).
    const page = render(
      <MemoryRouter>
        <PaymentScreen {...props} state={{ kind: 'review' }} walletReady={false} />
      </MemoryRouter>,
    )
    for (const button of screen.getAllByRole('button', { name: /Pay / })) {
      expect(button).toBeDisabled()
    }
    // 데스크톱 액션과 모바일 고정 하단은 서로 CSS로 숨겨진다 — 한쪽에만 달면 반대쪽
    // 사용자는 버튼이 왜 잠겼는지 못 듣는다. 결제는 모바일 비중이 높아 그쪽이 더 아프다.
    expect(screen.getAllByText('Preparing your wallet…')).toHaveLength(2)

    page.rerender(view({ kind: 'review' }))
    expect(screen.getAllByRole('button', { name: /Pay / })[0]).toBeEnabled()
    expect(screen.queryByText('Preparing your wallet…')).not.toBeInTheDocument()
  })
  it('does not present an impossible negative wallet balance as an after-payment amount', () => {
    render(
      <MemoryRouter>
        <PaymentScreen
          {...props}
          data={{ ...props.data, walletBalance: 20000 }}
          state={{ kind: 'review' }}
        />
      </MemoryRouter>,
    )
    expect(screen.queryByText('-5,000 YoYo')).not.toBeInTheDocument()
    expect(screen.getByText('Shortfall')).toBeInTheDocument()
    expect(screen.getByText('5,000 YoYo')).toBeInTheDocument()
  })
  it('does not mark payment confirmed during the approval wait between signatures', () => {
    const page = render(view({ kind: 'signing', index: 1, total: 2 }))
    expect(screen.getByRole('status')).toHaveTextContent('1/2')
    page.rerender(view({ kind: 'confirming' }))
    expect(
      within(screen.getByRole('status')).queryByText('Payment confirmation'),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Confirming your request')
    page.rerender(view({ kind: 'signing', index: 2, total: 2 }))
    expect(screen.getByRole('status')).toHaveTextContent('2/2')
  })
  it('does not offer another pay action during a live operation', () => {
    render(view({ kind: 'confirming' }))
    expect(screen.queryByRole('button', { name: /Pay .* YoYo/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Try again/ })).not.toBeInTheDocument()
  })
})
