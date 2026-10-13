/**
 * C-01 로그인 페이지 — 라우트 `/login`.
 *
 * Web3Auth SDK는 `Web3AuthWalletAdapter` 뒤에서만 호출하고, API-member-01 성공 세션은
 * `useWeb3AuthLogin`이 저장한다. 화면은 응답의 `wallet`·`isNewMember`로 다음 경로만 결정한다.
 *
 * 먼저 가입정보 없이 소셜 신원을 확인한다. 기존 회원은 바로 세션을 받고, 신규 신원만
 * `AUTH_SIGNUP_REQUIRED`(409)를 받은 뒤 같은 Web3Auth 연결로 국가·약관을 보완한다.
 */

import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { LoginScreen } from '@/features/member/LoginScreen'
import type { LoginPhase } from '@/features/member/LoginScreen'
import { safeLoginReturnPath } from '@/features/member/loginNavigation'
import { browserTimezone } from '@/features/member/localeOptions'
import { isApiError } from '@/shared/api/client'
import type { MemberSessionView } from '@/shared/api/domains/member'
import { AuthCode, CommonCode } from '@/shared/api/errorCodes'
import type { Web3AuthConnection } from '@/shared/blockchain/WalletAdapter'
import { WalletError } from '@/shared/blockchain/WalletAdapter'
import { useWalletReady } from '@/shared/blockchain/useWalletReady'
import { useWeb3Auth } from '@/shared/blockchain/useWeb3Auth'
import { isWalletAuthConfigured } from '@/shared/config'
import { useWeb3AuthLogin } from '@/shared/queries/member'
import type { SocialProvider } from '@/shared/ui'
import { setAppLanguage } from '@/shared/i18n'
import { useLocale } from '@/shared/i18n/useLocale'

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { adapter, error: web3AuthError } = useWeb3Auth()
  const login = useWeb3AuthLogin()
  const { language } = useLocale()
  const [countryCode, setCountryCode] = useState('')
  const [termsAgreed, setTermsAgreed] = useState(false)
  const [privacyAgreed, setPrivacyAgreed] = useState(false)
  const [signupConnection, setSignupConnection] = useState<Web3AuthConnection | null>(null)
  const [pendingPhase, setPendingPhase] = useState<LoginPhase | null>(null)
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined)
  const [errorMsg, setErrorMsg] = useState<string | undefined>(undefined)
  /**
   * 마운트에서 SDK 초기화 + 캐시 세션 복원 대기를 미리 끝낸다(D-73).
   * 클릭에서 기다리지 않는 이유는 어댑터 `connectSocial` 주석 — 사용자 활성화가 만료돼 로그인 창이
   * 안 뜬다. 여기서 기다리고 버튼을 잠그면 같은 효과를 활성화 밖에서 얻는다.
   *
   * ⚠ **`requireAddress`를 켜지 않는다.** 서명 화면(P-03·P-06)은 주소가 나올 때까지 더 기다리지만
   * (D-77) 여기는 **로그인 전**이라 주소가 영영 안 나온다 — 켜면 상한만큼 버튼이 잠긴다.
   */
  const { ready: walletReady } = useWalletReady(adapter)
  const from = safeLoginReturnPath(searchParams.get('from'))

  const displayedErrorCode =
    errorCode ?? (isWalletAuthConfigured && web3AuthError ? CommonCode.INTERNAL_ERROR : undefined)

  const completeLogin = (session: MemberSessionView) => {
    const destination = !session.wallet
      ? '/onboarding/wallet'
      : session.isNewMember
        ? '/signup'
        : from
    navigate(destination, {
      replace: true,
      state: { isNewMember: session.isNewMember, from },
    })
  }

  const requestSession = (
    connection: Web3AuthConnection,
    registration?: {
      countryCode: string
      termsAgreed: true
      privacyAgreed: true
    },
  ) =>
    login({
      idToken: connection.idToken,
      address: connection.address,
      provider: connection.socialProvider,
      locale: language,
      displayCurrency: 'USD',
      timezone: browserTimezone(),
      ...registration,
    })

  const signIn = async (provider: SocialProvider) => {
    if (pendingPhase || !walletReady) return
    setErrorCode(undefined)
    setErrorMsg(undefined)
    setPendingPhase('social-wallet')
    let connection: Web3AuthConnection | null = null
    try {
      if (!adapter) {
        throw new Error('WEB3AUTH_NOT_CONFIGURED')
      }
      connection = await adapter.connectSocial(provider)
      setPendingPhase('server-session')
      completeLogin(await requestSession(connection))
    } catch (error) {
      if (error instanceof WalletError && error.kind === 'USER_REJECTED') {
        return
      } else if (connection && isApiError(error) && error.code === AuthCode.SIGNUP_REQUIRED) {
        // 가입 요청을 보낼 때까지 idToken은 React 메모리에만 유지한다.
        setSignupConnection(connection)
      } else if (isApiError(error)) {
        setErrorCode(error.code)
        setErrorMsg(error.msg)
      } else {
        setErrorCode(CommonCode.INTERNAL_ERROR)
      }
    } finally {
      setPendingPhase(null)
    }
  }

  const completeRegistration = async () => {
    if (
      pendingPhase ||
      !signupConnection ||
      countryCode.length !== 2 ||
      !termsAgreed ||
      !privacyAgreed
    )
      return
    setErrorCode(undefined)
    setErrorMsg(undefined)
    setPendingPhase('server-session')
    try {
      const session = await requestSession(signupConnection, {
        countryCode,
        termsAgreed: true,
        privacyAgreed: true,
      })
      setSignupConnection(null)
      completeLogin(session)
    } catch (error) {
      if (isApiError(error)) {
        setErrorCode(error.code)
        setErrorMsg(error.msg)
      } else {
        setErrorCode(CommonCode.INTERNAL_ERROR)
      }
    } finally {
      setPendingPhase(null)
    }
  }

  return (
    <LoginScreen
      pending={pendingPhase !== null}
      pendingPhase={pendingPhase ?? undefined}
      errorCode={displayedErrorCode}
      errorMsg={errorMsg}
      configured={isWalletAuthConfigured}
      countryCode={countryCode}
      termsAgreed={termsAgreed}
      privacyAgreed={privacyAgreed}
      registrationRequired={signupConnection !== null}
      walletReady={walletReady}
      language={language}
      onLanguageChange={setAppLanguage}
      onCountryCodeChange={setCountryCode}
      onTermsAgreedChange={setTermsAgreed}
      onPrivacyAgreedChange={setPrivacyAgreed}
      onSignIn={(provider) => void signIn(provider)}
      onCompleteRegistration={() => void completeRegistration()}
    />
  )
}

export default LoginPage
