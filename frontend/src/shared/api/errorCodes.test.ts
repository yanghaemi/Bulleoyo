/**
 * 401 passthrough 목록의 규약 고정(S15P21B204-121 항목 5의 절반).
 *
 * 401 안에 클라이언트가 **정반대로 동작해야 하는** 코드가 섞여 있다(응답 규격 §1).
 * 이 목록이 한 줄 늘거나 줄면 검표·로그인 화면의 동작이 통째로 바뀌므로 값 자체를 고정한다.
 * 실제 `request()` 동작은 `client.unauthorized.test.ts`가 본다.
 */

import { describe, expect, it } from 'vitest'

import {
  AuthCode,
  CommonCode,
  EntryCode,
  PASSTHROUGH_UNAUTHORIZED_CODES,
  isPassthroughUnauthorized,
} from './errorCodes'

describe('PASSTHROUGH_UNAUTHORIZED_CODES', () => {
  it('QR 만료로 검표 담당자가 로그인 화면에 튕기면 안 된다 — 넷이 정확히 그대로다', () => {
    expect(new Set(PASSTHROUGH_UNAUTHORIZED_CODES)).toEqual(
      new Set([
        'ENTRY_QR_EXPIRED',
        'ENTRY_QR_SIGNATURE_INVALID',
        'AUTH_INVALID_CREDENTIALS',
        'COMMON_UNAUTHORIZED',
      ]),
    )
    expect(PASSTHROUGH_UNAUTHORIZED_CODES).toHaveLength(4)
  })

  it('상수 이름과 문자열이 어긋나지 않는다 — 배포된 code 문자열은 변경 금지다(규격 §1)', () => {
    expect(EntryCode.QR_EXPIRED).toBe('ENTRY_QR_EXPIRED')
    expect(EntryCode.QR_SIGNATURE_INVALID).toBe('ENTRY_QR_SIGNATURE_INVALID')
    expect(AuthCode.INVALID_CREDENTIALS).toBe('AUTH_INVALID_CREDENTIALS')
    expect(CommonCode.UNAUTHORIZED).toBe('COMMON_UNAUTHORIZED')
    expect(AuthCode.TOKEN_EXPIRED).toBe('AUTH_TOKEN_EXPIRED')
    expect(AuthCode.TOKEN_INVALID).toBe('AUTH_TOKEN_INVALID')
  })
})

describe('isPassthroughUnauthorized', () => {
  it('검표 QR 401 둘은 회원 세션과 무관해 그대로 호출부로 넘어간다', () => {
    expect(isPassthroughUnauthorized(EntryCode.QR_EXPIRED)).toBe(true)
    expect(isPassthroughUnauthorized(EntryCode.QR_SIGNATURE_INVALID)).toBe(true)
  })

  it('로그인 자격 실패는 로그아웃 루프를 만들면 안 되므로 화면이 처리한다', () => {
    expect(isPassthroughUnauthorized(AuthCode.INVALID_CREDENTIALS)).toBe(true)
  })

  it('Authorization 헤더 자체가 없는 401은 refresh·강제 로그아웃 대상이 아니다', () => {
    expect(isPassthroughUnauthorized(CommonCode.UNAUTHORIZED)).toBe(true)
  })

  it('AUTH_TOKEN_EXPIRED는 passthrough가 아니다 — refresh 후 재시도해야 한다', () => {
    expect(isPassthroughUnauthorized(AuthCode.TOKEN_EXPIRED)).toBe(false)
  })

  it('AUTH_TOKEN_INVALID는 passthrough가 아니다 — 즉시 로그아웃해야 한다', () => {
    expect(isPassthroughUnauthorized(AuthCode.TOKEN_INVALID)).toBe(false)
  })

  it('모르는 코드는 가로채지 않는다', () => {
    expect(isPassthroughUnauthorized('NOT_A_REAL_CODE')).toBe(false)
    expect(isPassthroughUnauthorized('')).toBe(false)
  })
})
