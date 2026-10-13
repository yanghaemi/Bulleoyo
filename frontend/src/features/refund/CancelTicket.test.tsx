import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import i18n from '@/shared/i18n'
import { CancelTicket, type RefundPhase, type RefundQuote } from './CancelTicket'

const quote: RefundQuote = {
  ticketId: '41',
  showTitle: 'Night concert',
  dateLabel: 'Sep 20, 18:30 KST',
  paidAmount: 88000,
  feeRate: 0.5,
  feeAmount: 44000,
  refundAmount: 44000,
  bracketLabel: '50% refund applies.',
  refundApproxLabel: '$32.59',
}
const callbacks = () => ({
  onAskConfirm: vi.fn(),
  onCloseConfirm: vi.fn(),
  onConfirm: vi.fn(),
  onGoBalance: vi.fn(),
  onBack: vi.fn(),
})

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

it('shows a three-row calculation and separate policy with an explicit sample boundary', () => {
  const actions = callbacks()
  render(
    <MemoryRouter>
      <CancelTicket quote={quote} phase="quote" confirmOpen={false} {...actions} />
    </MemoryRouter>,
  )
  const receipt = screen.getByRole('region', { name: 'Refund calculation' })
  expect(within(receipt).getByText('Paid')).toBeInTheDocument()
  expect(within(receipt).getByText('Fee (50%)')).toBeInTheDocument()
  expect(within(receipt).getByText('Refund estimate')).toBeInTheDocument()
  expect(within(receipt).getByText('−44,000 YoYo')).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Cancellation policy' })).toBeInTheDocument()
  expect(screen.getByText(/Sample ticket.*No ticket or balance will change/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Review cancellation' }))
  expect(actions.onAskConfirm).toHaveBeenCalledOnce()
  expect(actions.onConfirm).not.toHaveBeenCalled()
  expect(receipt.textContent).not.toMatch(/[가-힣]/)
})

it.each<RefundPhase>(['quote', 'processing', 'done', 'blocked'])(
  'keeps one stable action group in %s',
  (phase) => {
    const actions = callbacks()
    render(
      <MemoryRouter>
        <CancelTicket
          quote={quote}
          phase={phase}
          blockedReason="REFUND_DEADLINE_PASSED"
          confirmOpen={false}
          {...actions}
        />
      </MemoryRouter>,
    )
    const footer = screen.getByRole('group', { name: 'Cancellation actions' })
    if (phase === 'processing') {
      expect(within(footer).getByRole('button', { name: 'Preview in progress…' })).toBeDisabled()
    } else if (phase === 'done') {
      expect(screen.getByRole('status')).toHaveTextContent('Preview complete')
      expect(screen.queryByText('Refunded to your wallet.')).not.toBeInTheDocument()
      fireEvent.click(within(footer).getByRole('button', { name: 'View balance' }))
      expect(actions.onGoBalance).toHaveBeenCalledOnce()
    } else if (phase === 'blocked') {
      expect(screen.getByRole('alert')).toHaveTextContent('Cancellation closed')
      fireEvent.click(within(footer).getByRole('button', { name: 'Back to ticket' }))
      expect(actions.onBack).toHaveBeenCalledOnce()
    }
  },
)

it('keeps confirmation localized and separate from the review action', async () => {
  await i18n.changeLanguage('ko')
  const actions = callbacks()
  render(
    <MemoryRouter>
      <CancelTicket quote={quote} phase="quote" confirmOpen {...actions} />
    </MemoryRouter>,
  )
  const dialog = screen.getByRole('alertdialog')
  expect(dialog).toHaveAccessibleName('취소 미리보기를 진행할까요?')
  expect(dialog.textContent).not.toMatch(/Cancel|Keep ticket|back to your wallet/)
  fireEvent.click(within(dialog).getByRole('button', { name: '취소 미리보기' }))
  expect(actions.onConfirm).toHaveBeenCalledOnce()
  fireEvent.click(within(dialog).getByRole('button', { name: '유지하기' }))
  expect(actions.onCloseConfirm).toHaveBeenCalledOnce()
})
