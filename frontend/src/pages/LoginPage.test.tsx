import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MemberSessionView } from '@/shared/api/domains/member'
import type { Web3AuthWalletAdapter } from '@/shared/blockchain/WalletAdapter'
import { WalletError } from '@/shared/blockchain/WalletAdapter'

import { LoginPage } from './LoginPage'

const navigate = vi.hoisted(() => vi.fn())
const loginWithWeb3Auth = vi.hoisted(() => vi.fn())
const connectSocial = vi.hoisted(() => vi.fn())
const configState = vi.hoisted(() => ({ isWalletAuthConfigured: true }))
const web3AuthState = vi.hoisted(() => ({
  adapter: null as unknown,
  error: null as Error | null,
}))

vi.mock('react-router', () => ({
  useNavigate: () => navigate,
  useSearchParams: () => [new URLSearchParams('from=%2Ftickets%3Ftab%3Dmine')],
}))

vi.mock('@/shared/queries/member', () => ({
  useWeb3AuthLogin: () => loginWithWeb3Auth,
}))

vi.mock('@/shared/blockchain/useWeb3Auth', () => ({
  useWeb3Auth: () => web3AuthState,
}))

vi.mock('@/shared/config', () => ({
  isDev: false,
  get isWalletAuthConfigured() {
    return configState.isWalletAuthConfigured
  },
}))
vi.mock('@/features/member/localeOptions', () => ({ browserTimezone: () => 'Asia/Seoul' }))
vi.mock('@/shared/api/client', () => ({
  isApiError: (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error && 'msg' in error,
}))

vi.mock('@/features/member/LoginScreen', () => ({
  LoginScreen: ({
    pending,
    errorCode,
    errorMsg,
    configured,
    countryCode,
    termsAgreed,
    privacyAgreed,
    registrationRequired,
    onCountryCodeChange,
    onTermsAgreedChange,
    onPrivacyAgreedChange,
    onSignIn,
    onCompleteRegistration,
  }: {
    pending?: boolean
    errorCode?: string
    errorMsg?: string
    configured?: boolean
    countryCode: string
    termsAgreed: boolean
    privacyAgreed: boolean
    registrationRequired?: boolean
    onCountryCodeChange: (value: string) => void
    onTermsAgreedChange: (value: boolean) => void
    onPrivacyAgreedChange: (value: boolean) => void
    onSignIn: (provider: 'GOOGLE' | 'FACEBOOK' | 'KAKAO') => void
    onCompleteRegistration?: () => void
  }) => (
    <div>
      <div data-testid="pending">{String(Boolean(pending))}</div>
      <div data-testid="configured">{String(Boolean(configured))}</div>
      <div data-testid="error-code">{errorCode}</div>
      <div data-testid="error-msg">{errorMsg}</div>
      {registrationRequired ? (
        <>
          <select
            aria-label="Country"
            value={countryCode}
            onChange={(event) => onCountryCodeChange(event.target.value)}
          >
            <option value="">Select</option>
            <option value="KR">Korea</option>
            <option value="US">United States</option>
          </select>
          <label>
            <input
              type="checkbox"
              checked={termsAgreed}
              onChange={(event) => onTermsAgreedChange(event.target.checked)}
            />
            Terms
          </label>
          <label>
            <input
              type="checkbox"
              checked={privacyAgreed}
              onChange={(event) => onPrivacyAgreedChange(event.target.checked)}
            />
            Privacy
          </label>
          <button
            disabled={pending || countryCode.length !== 2 || !termsAgreed || !privacyAgreed}
            onClick={onCompleteRegistration}
          >
            COMPLETE SIGNUP
          </button>
        </>
      ) : (
        <>
          <button disabled={pending || !configured} onClick={() => onSignIn('GOOGLE')}>
            GOOGLE
          </button>
          <button disabled={pending || !configured} onClick={() => onSignIn('FACEBOOK')}>
            FACEBOOK
          </button>
          <button disabled={pending || !configured} onClick={() => onSignIn('KAKAO')}>
            KAKAO
          </button>
        </>
      )}
    </div>
  ),
}))

const TOKENS = {
  accessToken: 'access',
  accessTokenExpiresAt: null,
  refreshToken: 'refresh',
  refreshTokenExpiresAt: null,
}

function session(overrides: Partial<MemberSessionView> = {}): MemberSessionView {
  return {
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
    wallet: {
      provider: 'WEB3AUTH',
      address: '0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a',
      status: 'LINKED',
      explorerUrl: 'https://kairos.kaiascan.io',
    },
    walletLinkRequired: false,
    tokens: TOKENS,
    ...overrides,
  }
}

function completeRegistrationDetails(countryCode = 'KR') {
  fireEvent.change(screen.getByRole('combobox', { name: 'Country' }), {
    target: { value: countryCode },
  })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Terms' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Privacy' }))
}

describe('LoginPage Web3Auth wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    web3AuthState.adapter = { connectSocial } as unknown as Web3AuthWalletAdapter
    web3AuthState.error = null
    configState.isWalletAuthConfigured = true
    connectSocial.mockImplementation(async (provider: 'GOOGLE' | 'FACEBOOK' | 'KAKAO') => ({
      provider: 'WEB3AUTH',
      socialProvider: provider,
      address: '0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a',
      chainId: 1001,
      idToken: `${provider.toLowerCase()}-identity-token`,
    }))
    loginWithWeb3Auth.mockResolvedValue(session())
  })

  it.each(['GOOGLE', 'FACEBOOK', 'KAKAO'] as const)(
    'maps the %s button to connectSocial and API-member-01',
    async (provider) => {
      render(<LoginPage />)
      fireEvent.click(screen.getByRole('button', { name: provider }))

      await waitFor(() => expect(loginWithWeb3Auth).toHaveBeenCalledTimes(1))
      expect(connectSocial).toHaveBeenCalledWith(provider)
      expect(loginWithWeb3Auth).toHaveBeenCalledWith({
        idToken: `${provider.toLowerCase()}-identity-token`,
        address: '0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a',
        provider,
        locale: 'en',
        displayCurrency: 'USD',
        timezone: 'Asia/Seoul',
      })
    },
  )

  it('lets a returning member sign in before registration details are known', async () => {
    render(<LoginPage />)

    fireEvent.click(screen.getByRole('button', { name: 'GOOGLE' }))

    await waitFor(() => expect(loginWithWeb3Auth).toHaveBeenCalledOnce())
    expect(connectSocial).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith('/tickets?tab=mine', expect.any(Object))
  })

  it('asks a new member for signup details after 409 and reuses the social connection', async () => {
    loginWithWeb3Auth
      .mockRejectedValueOnce({ code: 'AUTH_SIGNUP_REQUIRED', msg: 'signup required' })
      .mockResolvedValueOnce(session({ isNewMember: true, wallet: null, walletLinkRequired: true }))
    render(<LoginPage />)

    fireEvent.click(screen.getByRole('button', { name: 'GOOGLE' }))
    await screen.findByRole('button', { name: 'COMPLETE SIGNUP' })

    completeRegistrationDetails('US')
    fireEvent.click(screen.getByRole('button', { name: 'COMPLETE SIGNUP' }))

    await waitFor(() => expect(loginWithWeb3Auth).toHaveBeenCalledTimes(2))
    expect(connectSocial).toHaveBeenCalledOnce()
    expect(loginWithWeb3Auth).toHaveBeenLastCalledWith({
      idToken: 'google-identity-token',
      address: '0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a',
      provider: 'GOOGLE',
      countryCode: 'US',
      locale: 'en',
      displayCurrency: 'USD',
      timezone: 'Asia/Seoul',
      termsAgreed: true,
      privacyAgreed: true,
    })
    expect(navigate).toHaveBeenCalledWith('/onboarding/wallet', expect.any(Object))
  })

  it.each([
    ['wallet missing', session({ wallet: null, walletLinkRequired: true }), '/onboarding/wallet'],
    ['new member with wallet', session({ isNewMember: true }), '/signup'],
    ['returning member', session(), '/tickets?tab=mine'],
  ] as const)('routes %s from the actual response', async (_label, response, path) => {
    loginWithWeb3Auth.mockResolvedValue(response)
    render(<LoginPage />)
    fireEvent.click(screen.getByRole('button', { name: 'GOOGLE' }))

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(path, {
        replace: true,
        state: { isNewMember: response.isNewMember, from: '/tickets?tab=mine' },
      }),
    )
  })

  /*
   * 지연 초기화 뒤에는 **"초기화 중" 중간 상태가 없다.** 어댑터는 client id 만으로 만들어지고
   * SDK 는 첫 동작에서 붙는다. 그래서 갈래는 둘뿐이다 — client id 가 있거나 없거나.
   */
  it('surfaces a Web3Auth context error without calling a configured build unconfigured', () => {
    web3AuthState.error = new WalletError('AUTH_FAILED', 'Web3Auth initialization failed.')
    render(<LoginPage />)

    expect(screen.getByTestId('configured')).toHaveTextContent('true')
    expect(screen.getByTestId('error-code')).toHaveTextContent('COMMON_INTERNAL_ERROR')
  })

  it('shows only the unavailable state when the client id is not configured', () => {
    configState.isWalletAuthConfigured = false
    web3AuthState.error = new WalletError('NOT_CONFIGURED', 'Web3Auth client id is missing.')
    render(<LoginPage />)

    // 미구성은 오류가 아니다 — 안내만 하고 에러 코드를 띄우지 않는다
    expect(screen.getByTestId('configured')).toHaveTextContent('false')
    expect(screen.getByTestId('error-code')).toBeEmptyDOMElement()
  })

  it('returns to the idle login screen when the user closes the provider popup', async () => {
    connectSocial.mockRejectedValue(new WalletError('USER_REJECTED', 'User closed the popup.'))
    render(<LoginPage />)
    fireEvent.click(screen.getByRole('button', { name: 'GOOGLE' }))

    await waitFor(() => expect(screen.getByTestId('pending')).toHaveTextContent('false'))
    expect(screen.getByTestId('error-code')).toBeEmptyDOMElement()
    expect(loginWithWeb3Auth).not.toHaveBeenCalled()
  })

  it('shows the API error code and server message without branching on the message', async () => {
    loginWithWeb3Auth.mockRejectedValue({
      code: 'COMMON_EXTERNAL_SERVICE_ERROR',
      msg: 'provider unavailable',
    })
    render(<LoginPage />)
    fireEvent.click(screen.getByRole('button', { name: 'GOOGLE' }))

    await waitFor(() =>
      expect(screen.getByTestId('error-code')).toHaveTextContent('COMMON_EXTERNAL_SERVICE_ERROR'),
    )
    expect(screen.getByTestId('error-msg')).toHaveTextContent('provider unavailable')
    expect(screen.getByTestId('pending')).toHaveTextContent('false')
  })
})
