/** 복귀 경로의 비자명한 곳 — `?from=`은 주소창에서 오는 사용자 입력이다. */

import { loginPathFrom, safeReturnPath } from '@/app/loginPath'

describe('safeReturnPath — 열린 리다이렉트 차단', () => {
  it('내부 경로는 그대로 통과한다', () => {
    expect(safeReturnPath('/tickets')).toBe('/tickets')
    expect(safeReturnPath('/tickets?page=2#top')).toBe('/tickets?page=2#top')
  })

  it('없거나 비면 홈', () => {
    expect(safeReturnPath(null)).toBe('/')
    expect(safeReturnPath(undefined)).toBe('/')
    expect(safeReturnPath('')).toBe('/')
  })

  it('바깥으로 나가는 값은 전부 홈으로 접는다', () => {
    // `//host`와 `/\host`는 브라우저가 절대 URL로 읽어 로그인 직후 외부 사이트로 나간다
    expect(safeReturnPath('//evil.com')).toBe('/')
    expect(safeReturnPath('/\\evil.com')).toBe('/')
    expect(safeReturnPath('https://evil.com')).toBe('/')
    expect(safeReturnPath('javascript:alert(1)')).toBe('/')
  })

  it('가드가 만든 값은 왕복해도 그대로 돌아온다', () => {
    const url = loginPathFrom('/tickets?page=2')
    const from = new URLSearchParams(url.split('?')[1]).get('from')
    expect(safeReturnPath(from)).toBe('/tickets?page=2')
  })

  it('로그인 화면으로 되돌아가는 값은 홈으로 접어 로그인 루프를 막는다', () => {
    expect(safeReturnPath('/login')).toBe('/')
    expect(safeReturnPath('/login?from=%2Ftickets')).toBe('/')
    expect(safeReturnPath('/login#retry')).toBe('/')
  })

  it('브라우저가 URL 파싱 중 제거하는 제어문자가 있으면 홈으로 접는다', () => {
    expect(safeReturnPath('/\t/evil.example')).toBe('/')
    expect(safeReturnPath('/\n/evil.example')).toBe('/')
    expect(safeReturnPath('/\r/evil.example')).toBe('/')
  })
})
