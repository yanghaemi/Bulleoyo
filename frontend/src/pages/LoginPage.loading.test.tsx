import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'

import { WalletError } from '@/shared/blockchain/WalletAdapter'
import { LoginPage } from './LoginPage'

const { connectSocial, login } = vi.hoisted(() => ({ connectSocial: vi.fn(), login: vi.fn() }))
vi.mock('@/shared/blockchain/useWeb3Auth', () => ({
  useWeb3Auth: () => ({
    adapter: { connectSocial },
    ready: true,
    error: null,
    retryInitialization: vi.fn(),
  }),
}))
vi.mock('@/shared/queries/member', () => ({ useWeb3AuthLogin: () => login }))
vi.mock('@/shared/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/config')>()),
  isWalletAuthConfigured: true,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

const connection = {
  provider: 'WEB3AUTH',
  socialProvider: 'GOOGLE',
  chainId: 1001,
  address: '0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a',
  idToken: 'identity-token',
}

function startSignIn() {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/onboarding/wallet" element={<h1>Wallet setup</h1>} />
      </Routes>
    </MemoryRouter>,
  )
  const providerButton = screen.getByRole('button', { name: /Continue with Google/ })
  providerButton.focus()
  fireEvent.click(providerButton)
}

beforeEach(() => vi.resetAllMocks())

it('지갑 준비와 서버 세션 확인을 실제 완료 시점에 맞춰 구분하고 성공하면 로딩을 즉시 없앤다', async () => {
  const social = deferred<typeof connection>()
  const session = deferred<unknown>()
  connectSocial.mockReturnValue(social.promise)
  login.mockReturnValue(session.promise)
  startSignIn()

  expect(screen.getByRole('status')).toHaveTextContent('Preparing your social wallet')
  expect(screen.getByText(/Your wallet will be created or restored/)).toBeInTheDocument()
  expect(
    within(screen.getByRole('status')).getByRole('img', { name: '불러요' }),
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Continue with Google/ })).toBeDisabled()
  expect(screen.getByRole('link', { name: '불러요 홈' }).closest('[inert]')).not.toBeNull()
  expect(login).not.toHaveBeenCalled()

  await act(async () => social.resolve(connection))
  expect(screen.getByRole('status')).toHaveTextContent('Confirming your sign-in')
  expect(screen.queryByText(/소셜 로그인으로 지갑을 생성하거나 복구/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Continue with Google/ })).toBeDisabled()

  await act(async () =>
    session.resolve({
      memberId: 1,
      name: 'member',
      email: 'member@example.com',
      roles: ['AUDIENCE'],
      authProvider: 'GOOGLE',
      countryCode: 'KR',
      locale: 'ko',
      displayCurrency: 'USD',
      timezone: 'Asia/Seoul',
      isNewMember: false,
      profileCompletionRequired: false,
      wallet: null,
      walletLinkRequired: true,
      tokens: {
        accessToken: 'access',
        refreshToken: 'refresh',
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
      },
    }),
  )
  expect(screen.getByRole('heading', { name: 'Wallet setup' })).toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it.each(['popup-close', 'sdk-error', 'server-error'] as const)(
  '%s 이후 overlay가 사라지고 같은 제공자로 다시 로그인할 수 있다',
  async (failure) => {
    const social = deferred<typeof connection>()
    connectSocial.mockReturnValue(social.promise)
    login.mockRejectedValue({ code: 'COMMON_EXTERNAL_SERVICE_ERROR', msg: 'Sign-in unavailable' })
    startSignIn()
    expect(screen.getByRole('status')).toHaveTextContent('Preparing your social wallet')
    await act(async () => {
      if (failure === 'server-error') social.resolve(connection)
      else
        social.reject(
          new WalletError(
            failure === 'popup-close' ? 'USER_REJECTED' : 'AUTH_FAILED',
            'Sign-in stopped',
          ),
        )
    })
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Continue with Google/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Continue with Google/ })).toHaveFocus()
    expect(screen.queryByRole('combobox', { name: /Country/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '불러요 홈' }).closest('[inert]')).toBeNull()
    if (failure === 'popup-close') expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    else expect(screen.getByRole('alert')).toBeInTheDocument()

    const retry = deferred<typeof connection>()
    connectSocial.mockReturnValueOnce(retry.promise)
    fireEvent.click(screen.getByRole('button', { name: /Continue with Google/ }))
    expect(connectSocial).toHaveBeenCalledTimes(2)
    expect(connectSocial).toHaveBeenLastCalledWith('GOOGLE')
    expect(screen.getByRole('status')).toHaveTextContent('Preparing your social wallet')
  },
)
