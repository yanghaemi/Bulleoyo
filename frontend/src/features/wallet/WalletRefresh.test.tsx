import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import i18n from '@/shared/i18n'
import { WalletScreen, type WalletTx } from './WalletScreen'
import { WalletOnboarding, type OnboardingPhase } from './WalletOnboarding'

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

const transactions: WalletTx[] = Array.from({ length: 9 }, (_, index) => ({
  walletTxId: String(index),
  type: index === 0 ? 'DEPOSIT_RETURN' : 'PURCHASE',
  direction: index === 0 ? 'IN' : 'OUT',
  amount: 15000,
  status: index === 0 ? 'PENDING' : index === 1 ? 'FAILED' : 'CONFIRMED',
  title: `Show ${index}`,
  occurredAt: '2026-09-08T16:00:00Z',
  occurredAtLabel: 'Sep 9, 01:00 KST',
}))

it('exposes one ledger with one filter band, signed statuses and working pagination', () => {
  render(
    <MemoryRouter>
      <WalletScreen transactions={transactions} isTeamLeader onRetryBalance={vi.fn()} />
    </MemoryRouter>,
  )
  const ledger = screen.getByRole('region', { name: 'Activity' })
  const filters = within(ledger).getByRole('group', { name: 'Activity filters' })
  expect(filters).toHaveAttribute('data-scroll-region', 'horizontal')
  expect(within(ledger).getAllByText('Show 0')).toHaveLength(1)
  expect(within(ledger).getByText('Processing')).toBeInTheDocument()
  expect(within(ledger).getByText('Failed')).toBeInTheDocument()
  expect(within(ledger).getByText('+15,000 YoYo')).toBeInTheDocument()
  expect(within(ledger).getAllByText('−15,000 YoYo')).toHaveLength(7)
  expect(within(ledger).queryByText('Show 8')).not.toBeInTheDocument()
  fireEvent.click(within(ledger).getByRole('button', { name: 'More' }))
  expect(within(ledger).getByText('Show 8')).toBeInTheDocument()
  fireEvent.click(within(filters).getByRole('button', { name: 'Deposit' }))
  expect(within(ledger).getByText('Show 0')).toBeInTheDocument()
  expect(within(ledger).queryByText('Show 1')).not.toBeInTheDocument()
})

it('keeps an unavailable balance truthful and dates in the chosen language', async () => {
  const retry = vi.fn()
  const view = render(
    <MemoryRouter>
      <WalletScreen transactions={transactions.slice(0, 1)} onRetryBalance={retry} />
    </MemoryRouter>,
  )
  expect(screen.getByLabelText('Could not load your balance')).toHaveTextContent('—')
  expect(screen.queryByText('0 YoYo')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Sep 9' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(retry).toHaveBeenCalledOnce()
  view.unmount()
  await i18n.changeLanguage('ko')
  render(
    <MemoryRouter>
      <WalletScreen transactions={transactions.slice(0, 1)} onRetryBalance={retry} />
    </MemoryRouter>,
  )
  expect(screen.getByRole('heading', { name: '9월 9일' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Sep 9' })).not.toBeInTheDocument()
})

// 등록 절차 단계만. linked·checking은 등록된 지갑을 보는 화면이라 아래 별도 테스트가 본다
const phases: OnboardingPhase[] = [
  { kind: 'choose' },
  { kind: 'sign', shortAddress: '0x123…456' },
  { kind: 'linking' },
  { kind: 'welcome', provider: 'WEB3AUTH' },
]

const linkedPhase: OnboardingPhase = {
  kind: 'linked',
  provider: 'EXTERNAL',
  shortAddress: '0x123…456',
  linkedAtLabel: 'Sep 9, 01:00 KST',
}

it.each([linkedPhase, { kind: 'checking' } as const])(
  'shows $kind as “My wallet” without the setup headline or steps',
  (phase) => {
    render(
      <WalletOnboarding
        phase={phase}
        onSelect={vi.fn()}
        onConfirm={vi.fn()}
        onRetry={vi.fn()}
        onFinish={vi.fn()}
      />,
    )
    const frame = screen.getByRole('main', { name: 'My wallet' })
    expect(screen.queryByText('Let’s set up your wallet')).not.toBeInTheDocument()
    expect(within(frame).queryByRole('list', { name: /Step \d of 3/ })).not.toBeInTheDocument()
    expect(within(frame).queryByRole('radio')).not.toBeInTheDocument()
    const action = within(frame).getByRole('group', { name: 'Next step' })
    expect(within(action).getAllByRole('button')).toHaveLength(1)
    if (phase.kind === 'checking') {
      expect(within(frame).getByRole('status')).toBeInTheDocument()
      expect(within(action).getByRole('button')).toBeDisabled()
    }
  },
)

it('names the linked exit after where it goes', () => {
  const finish = vi.fn()
  const props = { onSelect: vi.fn(), onConfirm: vi.fn(), onRetry: vi.fn(), onFinish: finish }
  const view = render(<WalletOnboarding {...props} phase={linkedPhase} returnsToMyPage />)
  fireEvent.click(screen.getByRole('button', { name: 'Back to My page' }))
  expect(finish).toHaveBeenCalledOnce()
  view.rerender(<WalletOnboarding {...props} phase={linkedPhase} />)
  expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
})

it.each(phases)('keeps $kind in the same accessible setup frame with one action slot', (phase) => {
  render(
    <WalletOnboarding
      phase={phase}
      onSelect={vi.fn()}
      onConfirm={vi.fn()}
      onRetry={vi.fn()}
      onFinish={vi.fn()}
    />,
  )
  const frame = screen.getByRole('main', { name: 'Let’s set up your wallet' })
  expect(within(frame).getByRole('list', { name: /Step \d of 3/ })).toBeInTheDocument()
  expect(within(frame).getByRole('heading', { level: 2 })).toBeInTheDocument()
  const action = within(frame).getByRole('group', { name: 'Next step' })
  expect(within(action).getAllByRole('button')).toHaveLength(1)
  if (phase.kind === 'linking' || phase.kind === 'choose')
    expect(within(action).getByRole('button')).toBeDisabled()
  if (phase.kind === 'welcome') {
    expect(within(frame).getByText('—')).toBeInTheDocument()
    expect(within(frame).queryByText('0 YoYo')).not.toBeInTheDocument()
  }
})

it('routes signing errors through one retry action at every width', () => {
  const retry = vi.fn()
  const confirm = vi.fn()
  render(
    <WalletOnboarding
      phase={{ kind: 'sign' }}
      error="WALLET_SIGNATURE_INVALID"
      onSelect={vi.fn()}
      onConfirm={confirm}
      onRetry={retry}
      onFinish={vi.fn()}
    />,
  )
  expect(screen.getByRole('alert')).toHaveTextContent('The signature did not match')
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(retry).toHaveBeenCalledOnce()
  expect(confirm).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Sign in your wallet' })).not.toBeInTheDocument()
})

it('keeps provider selection and the existing confirm and finish callbacks', () => {
  const select = vi.fn()
  const confirm = vi.fn()
  const finish = vi.fn()
  const props = { onSelect: select, onConfirm: confirm, onRetry: vi.fn(), onFinish: finish }
  const view = render(<WalletOnboarding {...props} phase={{ kind: 'choose' }} />)
  // 외부 지갑 갈래는 컷했다(-128) — 죽은 선택지를 다시 붙이면 여기서 깨진다.
  expect(screen.getAllByRole('radio')).toHaveLength(1)
  expect(screen.queryByRole('radio', { name: /Kaia Wallet/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('radio', { name: /Create one for me/ }))
  expect(select).toHaveBeenCalledWith('WEB3AUTH')
  view.rerender(<WalletOnboarding {...props} phase={{ kind: 'choose' }} selected="WEB3AUTH" />)
  expect(screen.getByRole('radio', { name: /Create one for me/ })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(confirm).toHaveBeenCalledOnce()
  view.rerender(
    <WalletOnboarding
      {...props}
      phase={{ kind: 'welcome', provider: 'WEB3AUTH', balanceKrw: 12345 }}
    />,
  )
  expect(screen.getByText('12,345 YoYo')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Start' }))
  expect(finish).toHaveBeenCalledOnce()
})
