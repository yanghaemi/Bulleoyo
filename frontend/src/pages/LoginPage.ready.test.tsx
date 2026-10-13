import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Web3AuthWalletAdapter } from '@/shared/blockchain/WalletAdapter'

import { LoginPage } from './LoginPage'

/**
 * D-73 — 소셜 버튼은 지갑 SDK 예열(`warmUp`)이 끝난 뒤에만 눌린다.
 *
 * v10 은 `init()` 뒤에도 커넥터가 몇 초 준비 중이라 그 창의 클릭이
 * `Wallet connector is not ready yet` 로 떨어졌다(9/18·9/21 dev). 기다림은 클릭이 아니라
 * 마운트에서 하고, 그동안 버튼을 잠근다.
 */
const connectSocial = vi.hoisted(() => vi.fn())
const warmUp = vi.hoisted(() => vi.fn())
const web3AuthState = vi.hoisted(() => ({ adapter: null as unknown, error: null as Error | null }))

vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams()],
}))
vi.mock('@/shared/queries/member', () => ({ useWeb3AuthLogin: () => vi.fn() }))
vi.mock('@/shared/blockchain/useWeb3Auth', () => ({ useWeb3Auth: () => web3AuthState }))
vi.mock('@/shared/config', () => ({ isDev: false, isWalletAuthConfigured: true }))
vi.mock('@/features/member/localeOptions', () => ({ browserTimezone: () => 'Asia/Seoul' }))
vi.mock('@/shared/api/client', () => ({ isApiError: () => false }))
vi.mock('@/features/member/LoginScreen', () => ({
  LoginScreen: ({
    walletReady,
    onSignIn,
  }: {
    walletReady?: boolean
    onSignIn: (provider: 'GOOGLE') => void
  }) => (
    <>
      <span data-testid="wallet-ready">{String(walletReady)}</span>
      <button type="button" disabled={walletReady === false} onClick={() => onSignIn('GOOGLE')}>
        GOOGLE
      </button>
    </>
  ),
}))

function deferred() {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('LoginPage wallet warm-up gate (D-73)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    web3AuthState.error = null
  })

  it('locks the social buttons until warmUp settles, then lets the click through', async () => {
    const gate = deferred()
    warmUp.mockReturnValue(gate.promise)
    web3AuthState.adapter = { connectSocial, warmUp } as unknown as Web3AuthWalletAdapter

    render(<LoginPage />)

    expect(warmUp).toHaveBeenCalledOnce()
    expect(screen.getByTestId('wallet-ready')).toHaveTextContent('false')
    expect(screen.getByRole('button', { name: 'GOOGLE' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'GOOGLE' }))
    expect(connectSocial).not.toHaveBeenCalled()

    gate.resolve()
    await waitFor(() => expect(screen.getByRole('button', { name: 'GOOGLE' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'GOOGLE' }))
    expect(connectSocial).toHaveBeenCalledWith('GOOGLE')
  })

  it('unlocks even when warmUp rejects — the click path reports the real cause', async () => {
    warmUp.mockRejectedValue(new Error('init failed'))
    web3AuthState.adapter = { connectSocial, warmUp } as unknown as Web3AuthWalletAdapter

    render(<LoginPage />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'GOOGLE' })).toBeEnabled())
  })

  it('treats an adapter without warmUp as ready immediately', () => {
    web3AuthState.adapter = { connectSocial } as unknown as Web3AuthWalletAdapter

    render(<LoginPage />)

    expect(screen.getByTestId('wallet-ready')).toHaveTextContent('true')
    expect(screen.getByRole('button', { name: 'GOOGLE' })).toBeEnabled()
  })
})
