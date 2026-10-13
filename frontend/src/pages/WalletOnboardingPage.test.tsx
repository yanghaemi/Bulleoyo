import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/api/client'

import { WalletOnboardingPage } from './WalletOnboardingPage'

const navigate = vi.hoisted(() => vi.fn())
const route = vi.hoisted(() => ({ state: null as unknown }))
const getAddress = vi.hoisted(() => vi.fn())
const linkWallet = vi.hoisted(() => ({ mutateAsync: vi.fn() }))
const walletQuery = vi.hoisted(() => ({
  refetch: vi.fn(),
  data: undefined as unknown,
  isFetching: false,
}))
const LINKED_WALLET = {
  walletId: 7,
  provider: 'WEB3AUTH',
  address: '0x1234567890abcdef1234567890abcdef12345678',
  status: 'ACTIVE',
  verifiedAt: '2026-09-14T05:20:00Z',
  balance: null,
}
const chain = vi.hoisted(() => ({
  jobId: null as string | null,
  options: null as null | {
    onConfirmed?: () => void
    onFailed?: () => void
  },
  isError: false,
  timedOut: false,
}))

vi.mock('react-router', () => ({
  useLocation: () => route,
  useNavigate: () => navigate,
}))

vi.mock('@/shared/config', () => ({ isDev: false }))

vi.mock('@/shared/blockchain/useWeb3Auth', () => ({
  useWeb3Auth: () => ({ adapter: { getAddress } }),
}))

vi.mock('@/shared/queries/wallet', () => ({
  useLinkWallet: () => linkWallet,
  useMyWallet: () => walletQuery,
}))

vi.mock('@/shared/queries/chain', () => ({
  useChainJob: (
    jobId: string | null,
    options: { onConfirmed?: () => void; onFailed?: () => void },
  ) => {
    chain.jobId = jobId
    chain.options = options
    return { isError: chain.isError, timedOut: chain.timedOut }
  },
}))

vi.mock('@/features/wallet/WalletOnboarding', () => ({
  WalletOnboarding: ({
    phase,
    error,
    onSelect,
    onConfirm,
    onFinish,
    returnsToMyPage,
  }: {
    phase: { kind: string; balanceKrw?: number; approxLabel?: string; shortAddress?: string }
    error?: string
    onSelect: (provider: 'WEB3AUTH') => void
    onConfirm: () => void
    onFinish: () => void
    returnsToMyPage?: boolean
  }) => (
    <div>
      <output aria-label="phase">{phase.kind}</output>
      <output aria-label="returns to my page">{String(returnsToMyPage ?? false)}</output>
      <output aria-label="balance">{phase.balanceKrw ?? 'none'}</output>
      <output aria-label="approx">{phase.approxLabel ?? 'none'}</output>
      <output aria-label="address">{phase.shortAddress ?? 'none'}</output>
      <output aria-label="error">{error ?? 'none'}</output>
      <button onClick={() => onSelect('WEB3AUTH')}>Select Web3Auth</button>
      <button onClick={onConfirm}>Confirm wallet</button>
      <button onClick={onFinish}>Finish wallet setup</button>
    </div>
  ),
}))

describe('WalletOnboardingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    route.state = null
    getAddress.mockResolvedValue('0x1234567890abcdef1234567890abcdef12345678')
    linkWallet.mutateAsync.mockResolvedValue({
      wallet: null,
      grantJobId: 'grant-1',
      signupGrant: {
        amount: 100_000,
        currency: 'KRW',
        display: { currency: 'USD', approx: 74.07, rate: 1350, asOf: '2026-09-14T00:00:00Z' },
      },
      pollAfterMs: 1500,
    })
    walletQuery.refetch.mockResolvedValue({ data: null })
    walletQuery.data = undefined
    walletQuery.isFetching = false
    chain.jobId = null
    chain.options = null
    chain.isError = false
    chain.timedOut = false
  })

  async function startWeb3AuthLink() {
    fireEvent.click(screen.getByRole('button', { name: 'Select Web3Auth' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm wallet' }))
    await waitFor(() => expect(linkWallet.mutateAsync).toHaveBeenCalled())
  }

  it('links the active Web3Auth address and polls the returned grant job', async () => {
    render(<WalletOnboardingPage />)

    await startWeb3AuthLink()

    expect(getAddress).toHaveBeenCalledWith()
    expect(linkWallet.mutateAsync).toHaveBeenCalledWith({
      provider: 'WEB3AUTH',
      address: '0x1234567890abcdef1234567890abcdef12345678',
    })
    expect(chain.jobId).toBe('grant-1')
    expect(screen.getByLabelText('phase')).toHaveTextContent('linking')

    act(() => chain.options?.onConfirmed?.())

    expect(screen.getByLabelText('phase')).toHaveTextContent('welcome')
    expect(screen.getByLabelText('balance')).toHaveTextContent('100000')
    expect(screen.getByLabelText('approx')).toHaveTextContent('$74.07')
  })

  it('keeps wallet registration successful when the signup grant fails', async () => {
    render(<WalletOnboardingPage />)
    await startWeb3AuthLink()

    act(() => chain.options?.onFailed?.())

    expect(screen.getByLabelText('phase')).toHaveTextContent('welcome')
    expect(screen.getByLabelText('balance')).toHaveTextContent('none')
  })

  it('continues without a balance when grant polling errors', async () => {
    const view = render(<WalletOnboardingPage />)
    await startWeb3AuthLink()

    chain.isError = true
    view.rerender(<WalletOnboardingPage />)

    await waitFor(() => expect(screen.getByLabelText('phase')).toHaveTextContent('welcome'))
    expect(screen.getByLabelText('balance')).toHaveTextContent('none')
  })

  it('refetches and shows the linked wallet after COMMON_CONFLICT', async () => {
    linkWallet.mutateAsync.mockRejectedValueOnce(
      new ApiError({ code: 'COMMON_CONFLICT', status: 409, msg: 'already linked' }),
    )
    walletQuery.refetch.mockResolvedValueOnce({
      data: {
        provider: 'WEB3AUTH',
        address: '0x1234567890abcdef1234567890abcdef12345678',
        verifiedAt: '2026-09-14T05:20:00Z',
      },
    })
    render(<WalletOnboardingPage />)

    await startWeb3AuthLink()

    await waitFor(() => expect(screen.getByLabelText('phase')).toHaveTextContent('linked'))
    expect(walletQuery.refetch).toHaveBeenCalledWith()
    expect(screen.getByLabelText('address')).toHaveTextContent('0x1234…5678')
    expect(screen.getByLabelText('error')).toHaveTextContent('none')
  })

  it('leaves grant polling on timeout without inventing a balance or linking twice', async () => {
    const view = render(<WalletOnboardingPage />)
    await startWeb3AuthLink()
    chain.timedOut = true
    view.rerender(<WalletOnboardingPage />)
    await waitFor(() => expect(screen.getByLabelText('phase')).toHaveTextContent('welcome'))
    expect(screen.getByLabelText('balance')).toHaveTextContent('none')
    expect(chain.jobId).toBeNull()
    expect(linkWallet.mutateAsync).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Finish wallet setup' }))
    expect(navigate).toHaveBeenCalled()
  })

  it('links without an explicit choice — 외부 지갑 갈래를 컷해 선택지가 하나다', async () => {
    render(<WalletOnboardingPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Confirm wallet' }))

    await waitFor(() => expect(linkWallet.mutateAsync).toHaveBeenCalledTimes(1))
    expect(linkWallet.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'WEB3AUTH' }),
    )
  })

  it('returns an existing member to the validated pre-login route', () => {
    route.state = { isNewMember: false, from: '/tickets?tab=mine' }
    render(<WalletOnboardingPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Finish wallet setup' }))

    expect(navigate).toHaveBeenCalledWith('/tickets?tab=mine', { replace: true })
  })

  it('preserves the validated route while a new member continues to signup', () => {
    route.state = { isNewMember: true, from: '/tickets?tab=mine' }
    render(<WalletOnboardingPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Finish wallet setup' }))

    expect(navigate).toHaveBeenCalledWith('/signup', {
      replace: true,
      state: { isNewMember: true, from: '/tickets?tab=mine' },
    })
  })

  it('rejects an external return target from router state', () => {
    route.state = { isNewMember: false, from: '//evil.example' }
    render(<WalletOnboardingPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Finish wallet setup' }))

    expect(navigate).toHaveBeenCalledWith('/', { replace: true })
  })

  describe('진입 조회(9/24 dev — 등록된 회원에게 선택 단계가 먼저 떠 409 두 번)', () => {
    it('shows the linked wallet right away for a registered member and never POSTs', () => {
      walletQuery.data = LINKED_WALLET
      render(<WalletOnboardingPage />)

      expect(screen.getByLabelText('phase')).toHaveTextContent('linked')
      expect(screen.getByLabelText('address')).toHaveTextContent('0x1234…5678')

      fireEvent.click(screen.getByRole('button', { name: 'Confirm wallet' }))

      expect(getAddress).not.toHaveBeenCalled()
      expect(linkWallet.mutateAsync).not.toHaveBeenCalled()
    })

    it('holds a checking state and ignores confirm while the lookup is in flight', () => {
      walletQuery.isFetching = true
      render(<WalletOnboardingPage />)

      expect(screen.getByLabelText('phase')).toHaveTextContent('checking')
      fireEvent.click(screen.getByRole('button', { name: 'Confirm wallet' }))

      expect(linkWallet.mutateAsync).not.toHaveBeenCalled()
    })

    it('falls back to the choose step when the lookup fails (404·network)', () => {
      // useQuery가 error로 끝나면 data 없음 + isFetching false다
      render(<WalletOnboardingPage />)
      expect(screen.getByLabelText('phase')).toHaveTextContent('choose')
    })

    it('sends one POST even when confirm is pressed repeatedly', async () => {
      let resolveLink: (value: unknown) => void = () => {}
      linkWallet.mutateAsync.mockImplementationOnce(
        () => new Promise((resolve) => (resolveLink = resolve)),
      )
      render(<WalletOnboardingPage />)
      const confirmButton = screen.getByRole('button', { name: 'Confirm wallet' })

      fireEvent.click(confirmButton)
      fireEvent.click(confirmButton)
      fireEvent.click(confirmButton)

      await waitFor(() => expect(linkWallet.mutateAsync).toHaveBeenCalled())
      await act(async () => {
        resolveLink({ wallet: null, grantJobId: 'grant-1', signupGrant: null, pollAfterMs: 1500 })
      })
      expect(linkWallet.mutateAsync).toHaveBeenCalledTimes(1)
      expect(getAddress).toHaveBeenCalledTimes(1)
    })

    it('does not jump to linked when the wallet cache refills right after registering', async () => {
      const view = render(<WalletOnboardingPage />)
      await startWeb3AuthLink()
      expect(screen.getByLabelText('phase')).toHaveTextContent('linking')

      // useLinkWallet.onSuccess가 qk.wallet.all을 무효화해 조회가 방금 만든 지갑을 돌려준 상황
      walletQuery.data = LINKED_WALLET
      view.rerender(<WalletOnboardingPage />)
      expect(screen.getByLabelText('phase')).toHaveTextContent('linking')

      act(() => chain.options?.onConfirmed?.())
      expect(screen.getByLabelText('phase')).toHaveTextContent('welcome')
    })

    it('labels the linked exit as a return to My page only when C-03 sent the member here', () => {
      walletQuery.data = LINKED_WALLET
      route.state = { from: '/me' }
      const view = render(<WalletOnboardingPage />)
      expect(screen.getByLabelText('returns to my page')).toHaveTextContent('true')

      fireEvent.click(screen.getByRole('button', { name: 'Finish wallet setup' }))
      expect(navigate).toHaveBeenCalledWith('/me', { replace: true })

      route.state = null
      view.rerender(<WalletOnboardingPage />)
      expect(screen.getByLabelText('returns to my page')).toHaveTextContent('false')
    })
  })
})
