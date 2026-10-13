import { Link } from 'react-router'
import { AuthHeader, Button, OperationOverlay } from '@/shared/ui'
import type { SocialProvider } from '@/shared/ui'
import type { SupportedLanguage } from '@/shared/i18n'
import { countryOptions } from './localeOptions'
import { loginErrorText } from './memberErrors'
import { SocialLoginButton } from './SocialLoginButton'
import './login.css'

const PROVIDERS: SocialProvider[] = ['GOOGLE', 'FACEBOOK', 'KAKAO']

export type LoginPhase = 'social-wallet' | 'server-session'
interface Props {
  pending?: boolean
  pendingPhase?: LoginPhase
  errorCode?: string
  errorMsg?: string
  configured?: boolean
  /** 신규 회원 생성에 필요한 ISO 3166-1 alpha-2 자기 선언. 기본값을 만들지 않는다. */
  countryCode?: string
  termsAgreed?: boolean
  privacyAgreed?: boolean
  registrationRequired?: boolean
  /** 지갑 SDK 준비 여부. `false` 면 소셜 버튼을 잠그고 준비 중 문구를 보인다(D-73). 기본 준비됨. */
  walletReady?: boolean
  language: SupportedLanguage
  onLanguageChange: (lang: SupportedLanguage) => void
  onCountryCodeChange?: (countryCode: string) => void
  onTermsAgreedChange?: (agreed: boolean) => void
  onPrivacyAgreedChange?: (agreed: boolean) => void
  onSignIn: (provider: SocialProvider) => void
  onCompleteRegistration?: () => void
}

export function LoginScreen({
  pending,
  pendingPhase = 'server-session',
  errorCode,
  errorMsg,
  configured = true,
  countryCode = '',
  termsAgreed = false,
  privacyAgreed = false,
  registrationRequired = false,
  walletReady = true,
  language,
  onLanguageChange,
  onCountryCodeChange = () => undefined,
  onTermsAgreedChange = () => undefined,
  onPrivacyAgreedChange = () => undefined,
  onSignIn,
  onCompleteRegistration,
}: Props) {
  const text = (ko: string, en: string) => (language === 'ko' ? ko : en)
  const error = errorCode ? loginErrorText(errorCode) : undefined
  const countries = countryOptions(language)
  const registrationReady =
    countries.some((country) => country.value === countryCode) && termsAgreed && privacyAgreed
  const disabled = Boolean(pending) || !configured || !walletReady

  return (
    <>
      <div
        className="auth-page min-h-dvh bg-ground"
        inert={Boolean(pending)}
        aria-busy={Boolean(pending)}
      >
        <AuthHeader language={language} onLanguageChange={onLanguageChange} />
        <main className="member-login-layout">
          <section className="auth-form" aria-labelledby="login-title">
            <h1 id="login-title">{text('로그인', 'Log in')}</h1>
            <p className="auth-intro">
              {text('소셜 계정으로 로그인해 주세요.', 'Continue with your social account.')}
            </p>
            {registrationRequired ? (
              <fieldset className="auth-registration">
                <legend>{text('가입 정보', 'Account setup')}</legend>
                <p className="auth-note">
                  {text(
                    '처음 로그인한 계정이에요. 가입에 필요한 정보를 확인해 주세요.',
                    'This is your first sign-in. Complete the details required to create your account.',
                  )}
                </p>
                <label htmlFor="login-country">{text('국가', 'Country')}</label>
                <select
                  id="login-country"
                  required
                  value={countryCode}
                  disabled={Boolean(pending)}
                  onChange={(event) => onCountryCodeChange(event.target.value)}
                >
                  <option value="">{text('국가를 선택해 주세요', 'Select your country')}</option>
                  {countries.map((country) => (
                    <option key={country.value} value={country.value}>
                      {country.label} — {country.sub}
                    </option>
                  ))}
                </select>
                <label className="auth-consent">
                  <input
                    type="checkbox"
                    required
                    checked={termsAgreed}
                    disabled={Boolean(pending)}
                    onChange={(event) => onTermsAgreedChange(event.target.checked)}
                  />
                  <span>{text('이용약관에 동의합니다', 'I agree to the Terms of Use')}</span>
                </label>
                <label className="auth-consent">
                  <input
                    type="checkbox"
                    required
                    checked={privacyAgreed}
                    disabled={Boolean(pending)}
                    onChange={(event) => onPrivacyAgreedChange(event.target.checked)}
                  />
                  <span>
                    {text('개인정보 처리방침에 동의합니다', 'I agree to the Privacy Policy')}
                  </span>
                </label>
                <Button
                  variant="primary"
                  full
                  disabled={Boolean(pending) || !registrationReady}
                  onClick={onCompleteRegistration}
                >
                  {text('가입 완료', 'Complete signup')}
                </Button>
              </fieldset>
            ) : (
              <div className="auth-providers">
                {PROVIDERS.map((provider) => (
                  <SocialLoginButton
                    key={provider}
                    provider={provider}
                    language={language}
                    disabled={disabled}
                    onSignIn={onSignIn}
                  />
                ))}
                {configured && !walletReady && (
                  <p className="auth-wallet-preparing" role="status" aria-live="polite">
                    {text('로그인을 준비하고 있어요…', 'Preparing sign-in…')}
                  </p>
                )}
              </div>
            )}
            {error && (
              <div className="auth-feedback" role="alert">
                <p>{errorMsg || text(error.ko, error.en)}</p>
              </div>
            )}
            {!configured && (
              <p className="auth-note">
                {text(
                  '지금은 로그인을 이용할 수 없어요.',
                  "Sign-in isn't available in this build yet.",
                )}
              </p>
            )}
            <p className="auth-note">
              {text(
                '처음이라면 계정과 결제 지갑을 함께 준비해 드려요.',
                'New here? We’ll help you set up your account and payment wallet.',
              )}
            </p>
          </section>
          <Link className="member-login-explore" to="/performances">
            {text('공연 먼저 둘러보기', 'Explore the shows')}
          </Link>
        </main>
        <footer className="design-footer">
          <span>© 2026 BULLEOYO</span>
        </footer>
      </div>
      {pending && (
        <OperationOverlay
          steps={[
            text('소셜 인증 및 지갑 준비', 'Social sign-in and wallet'),
            text('계정 연결', 'Connect your account'),
          ]}
          currentStep={pendingPhase === 'social-wallet' ? 0 : 1}
          label={
            pendingPhase === 'social-wallet'
              ? text('소셜 지갑을 준비하고 있어요', 'Preparing your social wallet')
              : text('로그인을 확인하고 있어요', 'Confirming your sign-in')
          }
          description={
            pendingPhase === 'social-wallet'
              ? text(
                  '소셜 로그인 창에서 인증을 완료해 주세요. 지갑을 생성하거나 기존 지갑을 복구합니다.',
                  'Complete authentication in the sign-in window. Your wallet will be created or restored.',
                )
              : text(
                  '계정 정보를 확인하고 안전하게 연결하고 있어요.',
                  'Checking your account and securely connecting your session.',
                )
          }
        />
      )}
    </>
  )
}
