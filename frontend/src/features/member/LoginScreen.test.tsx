import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, vi } from 'vitest'

import { LoginScreen } from './LoginScreen'

const baseProps = {
  language: 'en' as const,
  countryCode: 'KR',
  termsAgreed: true,
  privacyAgreed: true,
  onLanguageChange: () => undefined,
  onCountryCodeChange: () => undefined,
  onTermsAgreedChange: () => undefined,
  onPrivacyAgreedChange: () => undefined,
  onSignIn: () => undefined,
}

afterEach(() => vi.useRealTimers())

describe('LoginScreen', () => {
  it.each([
    ['Continue with Google', 'Google로 계속하기', '/brands/google-g.png', '/brands/google-g.png'],
    [
      'Continue with Facebook',
      'Facebook으로 계속하기',
      '/brands/facebook-logo.png',
      '/brands/facebook-logo.png',
    ],
    ['Login with Kakao', '카카오 로그인', '/brands/kakao-symbol.png', '/brands/kakao-symbol.png'],
  ])(
    'shows a standalone official symbol and visible localized text for %s',
    (en, ko, enImage, koImage) => {
      const view = render(
        <MemoryRouter>
          <LoginScreen {...baseProps} />
        </MemoryRouter>,
      )
      const button = screen.getByRole('button', { name: en })
      expect(within(button).getByText(en)).toBeVisible()
      expect(within(button).getByRole('presentation')).toHaveAttribute('src', enImage)

      view.rerender(
        <MemoryRouter>
          <LoginScreen {...baseProps} language="ko" />
        </MemoryRouter>,
      )
      expect(screen.getByRole('button', { name: ko })).toBe(button)
      expect(within(button).getByText(ko)).toBeVisible()
      expect(within(button).getByRole('presentation')).toHaveAttribute('src', koImage)
    },
  )

  it('locks provider buttons and shows a preparing notice while the wallet is not ready (D-73)', () => {
    const onSignIn = vi.fn()

    render(
      <MemoryRouter>
        <LoginScreen {...baseProps} walletReady={false} onSignIn={onSignIn} />
      </MemoryRouter>,
    )

    const google = screen.getByRole('button', { name: 'Continue with Google' })
    expect(google).toBeDisabled()
    fireEvent.click(google)
    expect(onSignIn).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Preparing sign-in')
  })

  it('lets returning members start social login without filling signup fields', () => {
    const onSignIn = vi.fn()

    render(
      <MemoryRouter>
        <LoginScreen
          {...baseProps}
          countryCode=""
          termsAgreed={false}
          privacyAgreed={false}
          onSignIn={onSignIn}
        />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('group', { name: /Account setup/i })).not.toBeInTheDocument()
    const google = screen.getByRole('button', { name: /Continue with Google/ })
    expect(google).toBeEnabled()
    fireEvent.click(google)
    expect(onSignIn).toHaveBeenCalledWith('GOOGLE')
  })

  it('requires a country and both explicit consents only after signup is required', () => {
    const onSignIn = vi.fn()
    const onCompleteRegistration = vi.fn()
    function Harness() {
      const [countryCode, setCountryCode] = useState('')
      const [termsAgreed, setTermsAgreed] = useState(false)
      const [privacyAgreed, setPrivacyAgreed] = useState(false)
      return (
        <LoginScreen
          {...baseProps}
          countryCode={countryCode}
          termsAgreed={termsAgreed}
          privacyAgreed={privacyAgreed}
          onCountryCodeChange={setCountryCode}
          onTermsAgreedChange={setTermsAgreed}
          onPrivacyAgreedChange={setPrivacyAgreed}
          onSignIn={onSignIn}
          registrationRequired
          onCompleteRegistration={onCompleteRegistration}
        />
      )
    }

    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('button', { name: /Continue with Google/ })).not.toBeInTheDocument()
    const complete = screen.getByRole('button', { name: /Complete signup/i })
    expect(complete).toBeDisabled()

    fireEvent.change(screen.getByRole('combobox', { name: /country/i }), {
      target: { value: 'KR' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /terms of use/i }))
    expect(complete).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /privacy policy/i }))

    expect(complete).toBeEnabled()
    fireEvent.click(complete)
    expect(onCompleteRegistration).toHaveBeenCalledOnce()
    expect(onSignIn).not.toHaveBeenCalled()
  })

  it('uses the brand home header with language controls', () => {
    render(
      <MemoryRouter>
        <LoginScreen {...baseProps} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: '불러요 홈' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('img', { name: '불러요' })).toBeInTheDocument()
    expect(screen.queryByText('TICKR')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument()
  })

  it('keeps login content mounted and providers disabled while the brand announces pending auth', () => {
    const onSignIn = vi.fn()
    render(
      <MemoryRouter>
        <LoginScreen {...baseProps} onSignIn={onSignIn} pending />
      </MemoryRouter>,
    )

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Confirming your sign-in')
    expect(within(status).getByRole('img', { name: '불러요' })).toBeInTheDocument()
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    const providers = screen.getAllByRole('button', { name: /Continue with|Login with/ })
    expect(providers).toHaveLength(3)
    for (const button of providers) {
      expect(button).toBeDisabled()
      fireEvent.click(button)
    }
    expect(onSignIn).not.toHaveBeenCalled()
  })

  it('removes pending immediately without waiting for animation and preserves retry controls', () => {
    vi.useFakeTimers()
    const onSignIn = vi.fn()
    const view = render(
      <MemoryRouter>
        <LoginScreen {...baseProps} onSignIn={onSignIn} pending />
      </MemoryRouter>,
    )
    const heading = screen.getByRole('heading', { level: 1 })
    const google = screen.getByRole('button', { name: /Continue with Google/ })

    view.rerender(
      <MemoryRouter>
        <LoginScreen
          {...baseProps}
          onSignIn={onSignIn}
          pending={false}
          errorCode="AUTH_TOKEN_INVALID"
          errorMsg="Please retry sign-in."
        />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toBe(heading)
    expect(screen.getByRole('button', { name: /Continue with Google/ })).toBe(google)
    expect(screen.getByRole('alert')).toHaveTextContent('Please retry sign-in.')
    for (const button of screen.getAllByRole('button', { name: /Continue with|Login with/ })) {
      expect(button).toBeEnabled()
      fireEvent.click(button)
    }
    expect(onSignIn.mock.calls).toEqual([['GOOGLE'], ['FACEBOOK'], ['KAKAO']])
  })

  it('keeps unconfigured providers disabled after pending ends', () => {
    const view = render(
      <MemoryRouter>
        <LoginScreen {...baseProps} configured={false} pending />
      </MemoryRouter>,
    )
    view.rerender(
      <MemoryRouter>
        <LoginScreen {...baseProps} configured={false} pending={false} />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    for (const button of screen.getAllByRole('button', { name: /Continue with|Login with/ }))
      expect(button).toBeDisabled()
    expect(screen.getByText(/Sign-in isn't available in this build yet/)).toBeInTheDocument()
  })

  // client id 하나가 "쓸 수 있는 빌드인가"를 정한다. 지연 초기화로 바뀐 뒤에는 중간 상태
  // ("준비 중")가 없다 — 어댑터는 client id 만으로 만들어지고 SDK 는 첫 동작에서 붙는다
  it('reserves the unavailable message for a missing client id', () => {
    render(
      <MemoryRouter>
        <LoginScreen {...baseProps} configured={false} />
      </MemoryRouter>,
    )

    expect(screen.getByText(/isn't available in this build yet/i)).toBeInTheDocument()
    for (const button of screen.getAllByRole('button', { name: /Continue with/ })) {
      expect(button).toBeDisabled()
    }
  })

  it('does not call a configured build unavailable', () => {
    render(
      <MemoryRouter>
        <LoginScreen {...baseProps} configured />
      </MemoryRouter>,
    )

    expect(screen.queryByText(/isn't available in this build yet/i)).not.toBeInTheDocument()
  })
})
