import { describe, expect, it } from 'vitest'

import {
  loginPathFrom,
  readLoginContinuationState,
  safeLoginReturnPath,
} from './loginNavigation'

/** `/login?from=…`을 LoginPage가 읽는 방식 그대로 되읽는다(`useSearchParams().get('from')`). */
function readFromQuery(loginPath: string): string {
  return new URLSearchParams(loginPath.slice(loginPath.indexOf('?'))).get('from') ?? ''
}

describe('login return path round trip', () => {
  /*
   * 지갑 세션이 끊긴 결제 화면은 **자기 쿼리를 가진 채** 로그인으로 간다 —
   * `/orders/5501/payment?from=12`의 `from`은 공연 ID이고, 잃어버리면 결제 완료 후
   * "공연으로 돌아가기"와 완료 화면 복귀가 홈으로 떨어진다. `loginPathFrom`이 만든
   * `?from=`은 한 겹 인코딩이라 LoginPage가 한 번 읽으면 원래 문자열이 그대로 나와야 한다.
   */
  it.each([
    '/orders/5501/payment?from=12',
    '/studio/performances/12/agreements',
    '/studio/performances/12/edit?step=deposit&from=12',
    '/tickets/9?tab=qr#top',
  ])('keeps %s intact through /login?from= and back', (original) => {
    const restored = safeLoginReturnPath(readFromQuery(loginPathFrom(original)))
    expect(restored).toBe(original)
  })

  it('survives the wallet onboarding detour that carries `from` in router state', () => {
    // C-05 → C-02를 거치는 동안 `?from=`은 URL에서 사라지고 state로만 남는다(loginPath 주석).
    const original = '/orders/5501/payment?from=12'
    const afterLogin = safeLoginReturnPath(readFromQuery(loginPathFrom(original)))
    expect(readLoginContinuationState({ isNewMember: false, from: afterLogin }).from).toBe(original)
  })

  it('does not send the user back into the login screen', () => {
    expect(loginPathFrom('/login')).toBe('/login')
    expect(safeLoginReturnPath('/login?from=%2Fwallet')).toBe('/')
  })

  it('never lets the query steer the browser off this origin', () => {
    /*
     * 주소창에 담겨 오는 사용자 입력이다. 검증 없이 navigate하면 열린 리다이렉트가 된다
     * (`//host`·`https://host`는 브라우저가 절대 URL로 읽는다).
     *
     * 전부 `/`로 접히지는 **않는다** — `/\host`는 URL 파서가 같은 오리진의 경로로 정규화해
     * 그대로 통과한다. 그건 앱 안의 없는 경로일 뿐이라 열린 리다이렉트가 아니다. 그래서
     * 고정하는 것은 "홈으로 접힌다"가 아니라 **"절대 URL로 읽히는 값은 나오지 않는다"**이다.
     */
    for (const hostile of ['//evil.example', String.raw`/\evil.example`, 'https://evil.example/x']) {
      const restored = safeLoginReturnPath(hostile)
      expect(restored.startsWith('/')).toBe(true)
      expect(restored.startsWith('//')).toBe(false)
      expect(new URL(restored, 'https://tickr.invalid').origin).toBe('https://tickr.invalid')
    }
  })
})
