import type { SocialProvider } from '@/shared/ui'
import type { SupportedLanguage } from '@/shared/i18n'
import './SocialLoginButton.css'

const providers = {
  GOOGLE: { en: 'Continue with Google', ko: 'Google로 계속하기', image: '/brands/google-g.png' },
  FACEBOOK: {
    en: 'Continue with Facebook',
    ko: 'Facebook으로 계속하기',
    image: '/brands/facebook-logo.png',
  },
  KAKAO: { en: 'Login with Kakao', ko: '카카오 로그인', image: '/brands/kakao-symbol.png' },
} satisfies Record<SocialProvider, { en: string; ko: string; image: string }>

interface Props {
  provider: SocialProvider
  language: SupportedLanguage
  disabled: boolean
  onSignIn: (provider: SocialProvider) => void
}

export function SocialLoginButton({ provider, language, disabled, onSignIn }: Props) {
  const brand = providers[provider]
  const label = language === 'ko' ? brand.ko : brand.en

  return (
    <button
      type="button"
      className={`social-login-button social-login-button--${provider.toLowerCase()}`}
      disabled={disabled}
      onClick={() => onSignIn(provider)}
    >
      <img
        className="social-login-button__icon"
        src={brand.image}
        alt=""
        width={20}
        height={20}
        draggable={false}
      />
      <span className="social-login-button__label">{label}</span>
    </button>
  )
}
