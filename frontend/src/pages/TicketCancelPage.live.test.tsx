import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ApiError } from '@/shared/api/client'
import i18n from '@/shared/i18n'
import { TicketCancelPage } from './TicketCancelPage'

const state = vi.hoisted(() => ({
  quote: {} as Record<string, unknown>,
  chain: {} as Record<string, unknown>,
  cancel: vi.fn(),
  jobId: null as string | null | undefined,
}))
vi.mock('@/shared/queries/refund', () => ({
  useRefundQuote: () => state.quote,
  useCancelTicket: () => ({ mutateAsync: state.cancel, isPending: false }),
}))
vi.mock('@/shared/queries/ticket', () => ({
  useTicketDetail: () => ({
    data: { ticketId: 90211, performanceTitle: 'Actual show', startAt: '2026-09-26T10:00:00Z' },
    isLoading: false,
  }),
}))
vi.mock('@/shared/queries/chain', () => ({
  useChainJob: (id: string | null | undefined) => {
    state.jobId = id
    return state.chain
  },
}))

function mount(path = '/tickets/90211/cancel') {
  const element = (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/tickets/:ticketId/cancel" element={<TicketCancelPage />} />
      </Routes>
    </MemoryRouter>
  )
  const view = render(element)
  return {
    ...view,
    refresh: () =>
      view.rerender(
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/tickets/:ticketId/cancel" element={<TicketCancelPage />} />
          </Routes>
        </MemoryRouter>,
      ),
  }
}
async function confirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Review cancellation' }))
  fireEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel ticket' }),
  )
  await waitFor(() => expect(state.cancel).toHaveBeenCalled())
}
beforeEach(async () => {
  await i18n.changeLanguage('en')
  state.quote = {
    data: {
      ticketId: 90211,
      paidAmount: 25000,
      feeRatePercent: 50,
      feeAmount: 12500,
      refundAmount: 12500,
      currency: 'KRW',
      feeStage: 'D-3_BEFORE',
      fullRefundUntil: '2026-09-19T00:00:00+09:00',
      cancelDeadlineAt: '2026-09-23T00:00:00+09:00',
      refundTarget: 'WALLET_BALANCE',
      refundWalletAddress: '0x123',
      walletBalanceAfter: null,
      refundNotice: 'Refunded to your wallet',
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn().mockResolvedValue({}),
  }
  state.chain = {
    isConfirmed: false,
    isFailed: false,
    timedOut: false,
    isError: false,
    refetch: vi.fn(),
  }
  state.cancel.mockReset().mockResolvedValue({
    jobId: 'refund-job',
    status: 'PENDING',
    signerType: 'OPERATOR',
    pollAfterMs: 1500,
    ticketId: 90211,
    refundId: 6101,
    refundAmount: 12500,
    feeAmount: 12500,
    currency: 'KRW',
    refundTarget: 'WALLET_BALANCE',
    refundWalletAddress: '0x123',
  })
})

it('submits the displayed quote once and waits for chain confirmation before success', async () => {
  const view = mount()
  expect(screen.getByText('Actual show')).toBeInTheDocument()
  expect(screen.getByText('Fee (50%)')).toBeInTheDocument()
  expect(screen.queryByText(/Sample ticket/)).not.toBeInTheDocument()
  await confirm()
  expect(state.cancel).toHaveBeenCalledWith({
    ticketId: 90211,
    expectedRefundAmount: 12500,
    idempotencyKey: expect.any(String),
  })
  await waitFor(() => expect(state.jobId).toBe('refund-job'))
  expect(screen.getByRole('status')).toHaveTextContent('Processing refund')
  expect(screen.queryByText('Refunded to your wallet.')).not.toBeInTheDocument()
  state.chain = { ...state.chain, isConfirmed: true }
  view.refresh()
  expect(screen.getByRole('status')).toHaveTextContent('Refunded to your wallet.')
  expect(state.cancel).toHaveBeenCalledOnce()
})

it.each([
  ['timedOut', 'taking longer'],
  ['isFailed', 'Refund failed'],
  ['isError', 'Could not check'],
])('does not claim completion when chain %s', async (flag, message) => {
  const view = mount()
  await confirm()
  state.chain = { ...state.chain, [flag]: true }
  view.refresh()
  expect(screen.getByRole('alert')).toHaveTextContent(message)
  expect(screen.queryByText('Processing refund…')).not.toBeInTheDocument()
  expect(screen.queryByText('Refunded to your wallet.')).not.toBeInTheDocument()
  if (flag !== 'isFailed') {
    fireEvent.click(screen.getByRole('button', { name: 'Check status' }))
    expect(state.chain.refetch).toHaveBeenCalledOnce()
    expect(state.cancel).toHaveBeenCalledOnce()
  }
})

it('keeps the same idempotency key after an uncertain request failure', async () => {
  state.cancel.mockRejectedValueOnce(new Error('network'))
  mount()
  await confirm()
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  await confirm()
  expect(state.cancel.mock.calls[1][0].idempotencyKey).toBe(
    state.cancel.mock.calls[0][0].idempotencyKey,
  )
})

it('refreshes a changed quote and requires a new confirmation and key', async () => {
  state.cancel.mockRejectedValueOnce(
    new ApiError({ code: 'COMMON_VALIDATION_FAILED', status: 400, msg: '' }),
  )
  const view = mount()
  await confirm()
  await waitFor(() => expect(state.quote.refetch).toHaveBeenCalledOnce())
  state.quote = { ...state.quote, data: { ...(state.quote.data as object), refundAmount: 10000 } }
  view.refresh()
  await confirm()
  expect(state.cancel.mock.calls[1][0].expectedRefundAmount).toBe(10000)
  expect(state.cancel.mock.calls[1][0].idempotencyKey).not.toBe(
    state.cancel.mock.calls[0][0].idempotencyKey,
  )
})

it('handles a deadline response by code before a quote exists', () => {
  state.quote = {
    isError: true,
    error: new ApiError({ code: 'REFUND_DEADLINE_PASSED', status: 409, msg: 'unrelated message' }),
  }
  mount()
  expect(screen.getByRole('alert')).toHaveTextContent('Cancellation closed')
  expect(screen.queryByRole('button', { name: 'Review cancellation' })).not.toBeInTheDocument()
})
