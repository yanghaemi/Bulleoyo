/**
 * `request()`가 **401을 받았을 때의 동작**을 고정한다(S15P21B204-121 항목 5).
 *
 * 같은 401 안에 클라이언트가 정반대로 동작해야 하는 코드가 섞여 있다(응답 규격 §1 · `client.ts` 상단).
 *
 *   ENTRY_QR_*·AUTH_INVALID_CREDENTIALS·COMMON_UNAUTHORIZED  그대로 호출부로 (passthrough)
 *   AUTH_TOKEN_INVALID                                       즉시 로그아웃
 *   AUTH_TOKEN_EXPIRED                                       refresh 1회 후 원요청 1회 재시도
 *
 * 가장 비싼 회귀는 **status 401을 통째로 세션 만료로 처리하는 것**이다. 그러면 검표 담당자가
 * QR 만료 한 번에 로그인 화면으로 튕기고 스캔이 멈춘다. 그 규약을 `errorCodes.ts`의 목록이 아니라
 * **실제 동작**으로 못박는 것이 이 파일이다.
 *
 * 분기 조건은 `client.ts`의 `request()`를 그대로 따랐다 — `isRefreshEndpoint` →
 * `isPassthroughUnauthorized` → `AuthCode.TOKEN_INVALID && !options.public` →
 * `AuthCode.TOKEN_EXPIRED && !options.skipAuth && !options.public`.
 *
 * ⚠ 모듈 변수(accessToken·refreshPromise·onUnauthenticated)를 쓰므로 테스트 간 상태가 샌다.
 * `beforeEach`에서 매번 되돌린다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ApiError,
  ensureAccessToken,
  ensureOptionalAccessToken,
  request,
  setUnauthenticatedHandler,
  tokenStore,
  uploadFormData,
} from './client'

/** 회원 세션 요청 하나. 경로 자체에는 의미가 없다 */
const DATA_PATH = '/members/me'
const REFRESH_URL = '/api/v1/auth/refresh'

interface Envelope {
  code: string
  data: unknown
  msg: string
}

/**
 * `sendOnce`가 실제로 쓰는 것만 가진 최소 응답.
 * `Response`를 그대로 만들면 jsdom·undici 구현 차이에 테스트가 끌려다닌다.
 */
function envelopeResponse(status: number, envelope: Envelope): Response {
  return {
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(envelope),
  } as unknown as Response
}

function unauthorized(code: string, msg = ''): Response {
  return envelopeResponse(401, { code, data: null, msg })
}

function ok(data: unknown): Response {
  return envelopeResponse(200, { code: 'SUCCESS', data, msg: '' })
}

/** member_03 재발급 성공 응답. refresh는 **회전**되므로 매번 새 값이 온다 */
function refreshOk(): Response {
  return ok({
    accessToken: 'access-2',
    accessTokenExpiresAt: '2026-09-16T00:15:00Z',
    refreshToken: 'refresh-2',
    refreshTokenExpiresAt: '2026-09-23T00:00:00Z',
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let logout: ReturnType<typeof vi.fn>

function calledUrls(): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]))
}

function refreshCallCount(): number {
  return calledUrls().filter((url) => url.includes(REFRESH_URL)).length
}

function dataCallCount(): number {
  return calledUrls().filter((url) => !url.includes(REFRESH_URL)).length
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    (value) => value,
    (error: unknown) => error,
  )
}

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)

  // 모듈 변수라 앞 테스트의 값이 남는다. access는 메모리, refresh는 localStorage다.
  tokenStore.clear()
  tokenStore.setTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' })

  logout = vi.fn()
  setUnauthenticatedHandler(logout)
})

afterEach(() => {
  tokenStore.clear()
  setUnauthenticatedHandler(() => {})
  vi.unstubAllGlobals()
})

describe('401 passthrough — 검표 QR', () => {
  it.each(['ENTRY_QR_EXPIRED', 'ENTRY_QR_SIGNATURE_INVALID'])(
    '%s 는 그대로 throw되고 로그아웃도 refresh도 일어나지 않는다 — 스캔 도중 로그인 화면으로 튕기면 검표가 멈춘다',
    async (code) => {
      fetchMock.mockImplementation(async () => unauthorized(code, '다시 스캔해 주세요.'))

      const error = await caught(request(DATA_PATH))

      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).code).toBe(code)
      expect((error as ApiError).status).toBe(401)
      // msg는 토스트용으로 그대로 실려 온다(분기 키가 아니다)
      expect((error as ApiError).msg).toBe('다시 스캔해 주세요.')

      expect(logout).not.toHaveBeenCalled()
      expect(refreshCallCount()).toBe(0)
      expect(dataCallCount()).toBe(1)
      // 세션은 살아 있어야 한다
      expect(tokenStore.getAccessToken()).toBe('access-1')
    },
  )
})

describe('401 AUTH_TOKEN_INVALID — 즉시 로그아웃', () => {
  it('재발급을 시도하지 않고 로그아웃 콜백을 TOKEN_INVALID로 1회 부른다', async () => {
    fetchMock.mockImplementation(async () => unauthorized('AUTH_TOKEN_INVALID'))

    const error = await caught(request(DATA_PATH))

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('AUTH_TOKEN_INVALID')
    expect(logout).toHaveBeenCalledTimes(1)
    expect(logout).toHaveBeenCalledWith('TOKEN_INVALID')
    expect(refreshCallCount()).toBe(0)
    expect(tokenStore.getAccessToken()).toBeNull()
  })
})

describe('401 AUTH_TOKEN_EXPIRED — refresh 후 1회 재시도', () => {
  /** 재발급이 끝나기 전 요청은 만료, 끝난 뒤 요청은 성공 */
  function mockExpiredUntilRefreshed() {
    let refreshed = false
    fetchMock.mockImplementation(async (input: unknown) => {
      if (String(input).includes(REFRESH_URL)) {
        refreshed = true
        return refreshOk()
      }
      return refreshed ? ok({ memberId: 7 }) : unauthorized('AUTH_TOKEN_EXPIRED')
    })
  }

  it('refresh가 1회 나가고 원요청이 1회 재시도된다', async () => {
    mockExpiredUntilRefreshed()

    await expect(request(DATA_PATH)).resolves.toEqual({ memberId: 7 })

    expect(refreshCallCount()).toBe(1)
    expect(dataCallCount()).toBe(2) // 최초 + 재시도
    expect(logout).not.toHaveBeenCalled()
    // 회전된 새 토큰으로 덮어썼는가 — 옛 값을 남기면 다음 재발급이 재사용으로 걸린다
    expect(tokenStore.getAccessToken()).toBe('access-2')
  })

  it('두 요청이 동시에 만료를 받아도 refresh는 1회다 — 두 번 나가면 서버가 탈취로 보고 전 세션을 폐기한다', async () => {
    mockExpiredUntilRefreshed()

    const [first, second] = await Promise.all([
      request(DATA_PATH),
      request('/performances/1/tickets'),
    ])

    expect(first).toEqual({ memberId: 7 })
    expect(second).toEqual({ memberId: 7 })
    expect(refreshCallCount()).toBe(1)
    expect(dataCallCount()).toBe(4) // 최초 2 + 재시도 2
    expect(logout).not.toHaveBeenCalled()
  })

  it('refresh 자체가 AUTH_TOKEN_EXPIRED면 재로그인이다 — REFRESH_FAILED로 로그아웃하고 원요청을 재시도하지 않는다', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      if (String(input).includes(REFRESH_URL)) return unauthorized('AUTH_TOKEN_EXPIRED')
      return unauthorized('AUTH_TOKEN_EXPIRED')
    })

    const error = await caught(request(DATA_PATH))

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('AUTH_TOKEN_EXPIRED')
    expect(logout).toHaveBeenCalledTimes(1)
    expect(logout).toHaveBeenCalledWith('REFRESH_FAILED')
    expect(refreshCallCount()).toBe(1) // 무한 루프가 아니다
    expect(dataCallCount()).toBe(1) // 재시도 없음
    expect(tokenStore.getAccessToken()).toBeNull()
  })

  it('skipAuth 요청은 refresh를 돌리지 않고 그대로 던진다 — Authorization을 붙이지 않은 요청이다', async () => {
    fetchMock.mockImplementation(async () => unauthorized('AUTH_TOKEN_EXPIRED'))

    const error = await caught(request(DATA_PATH, { skipAuth: true }))

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('AUTH_TOKEN_EXPIRED')
    expect(refreshCallCount()).toBe(0)
    expect(logout).not.toHaveBeenCalled()
  })

  it('이미지 업로드 중 refresh가 실패해도 일반 요청과 같이 로그아웃 콜백을 부른다', async () => {
    fetchMock.mockImplementation(async (input: unknown) =>
      String(input).includes(REFRESH_URL)
        ? unauthorized('AUTH_TOKEN_EXPIRED')
        : unauthorized('AUTH_TOKEN_EXPIRED'),
    )

    const error = await caught(uploadFormData('/performances/7/media/poster', new FormData()))

    expect(error).toBeInstanceOf(ApiError)
    expect(logout).toHaveBeenCalledTimes(1)
    expect(logout).toHaveBeenCalledWith('REFRESH_FAILED')
    expect(refreshCallCount()).toBe(1)
    expect(dataCallCount()).toBe(1)
  })

  it('일반 요청의 refresh가 네트워크 오류면 세션을 보존한다', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      if (String(input).includes(REFRESH_URL)) throw new TypeError('offline')
      return unauthorized('AUTH_TOKEN_EXPIRED')
    })

    const error = await caught(request(DATA_PATH))

    expect(error).toMatchObject({ name: 'NetworkError' })
    expect(logout).not.toHaveBeenCalled()
    expect(tokenStore.hasSession()).toBe(true)
  })

  it('이미지 업로드의 refresh가 네트워크 오류여도 세션을 보존한다', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      if (String(input).includes(REFRESH_URL)) throw new TypeError('offline')
      return unauthorized('AUTH_TOKEN_EXPIRED')
    })

    const error = await caught(uploadFormData('/performances/7/media/poster', new FormData()))

    expect(error).toMatchObject({ name: 'NetworkError' })
    expect(logout).not.toHaveBeenCalled()
    expect(tokenStore.hasSession()).toBe(true)
  })
})

describe('public 경로 예외', () => {
  it('AUTH_TOKEN_INVALID를 받아도 로그아웃하지 않는다 — 공유 링크를 열어 본 것만으로 세션이 날아가면 안 된다', async () => {
    fetchMock.mockImplementation(async () => unauthorized('AUTH_TOKEN_INVALID'))

    const error = await caught(request('/settlements/share/abc', { public: true }))

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('AUTH_TOKEN_INVALID')
    expect(logout).not.toHaveBeenCalled()
    expect(refreshCallCount()).toBe(0)
    // 회원 세션은 그대로 살아 있다
    expect(tokenStore.getAccessToken()).toBe('access-1')
  })

  it('AUTH_TOKEN_EXPIRED를 받아도 refresh를 돌리지 않는다 — 공개 조회에 회원 토큰을 쓰지 않기 때문이다', async () => {
    fetchMock.mockImplementation(async () => unauthorized('AUTH_TOKEN_EXPIRED'))

    const error = await caught(request('/settlements/share/abc', { public: true }))

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('AUTH_TOKEN_EXPIRED')
    expect(refreshCallCount()).toBe(0)
    expect(logout).not.toHaveBeenCalled()
    expect(tokenStore.getAccessToken()).toBe('access-1')
  })
})

describe('공개 화면의 선택적 회원 데이터', () => {
  it('refresh token만 남은 세션을 복구하되 실패해도 로그인 화면으로 보내지 않는다', async () => {
    tokenStore.clear()
    window.localStorage.setItem('b204.refreshToken', 'refresh-1')
    fetchMock.mockImplementation(async (input: unknown) =>
      String(input).includes(REFRESH_URL)
        ? unauthorized('AUTH_TOKEN_EXPIRED')
        : ok({}),
    )

    await expect(ensureOptionalAccessToken()).resolves.toBe(false)

    expect(refreshCallCount()).toBe(1)
    expect(tokenStore.hasSession()).toBe(false)
    expect(logout).not.toHaveBeenCalled()
  })

  it('선택적 요청의 토큰이 무효여도 세션만 비우고 강제 이동 콜백은 부르지 않는다', async () => {
    fetchMock.mockImplementation(async () => unauthorized('AUTH_TOKEN_INVALID'))

    const error = await caught(request(DATA_PATH, { silentAuthFailure: true }))

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('AUTH_TOKEN_INVALID')
    expect(tokenStore.hasSession()).toBe(false)
    expect(logout).not.toHaveBeenCalled()
  })

  it('일시적인 네트워크 오류에는 refresh token을 보존한다', async () => {
    tokenStore.clear()
    window.localStorage.setItem('b204.refreshToken', 'refresh-1')
    fetchMock.mockRejectedValue(new TypeError('offline'))

    await expect(ensureOptionalAccessToken()).resolves.toBe(false)

    expect(refreshCallCount()).toBe(1)
    expect(tokenStore.hasSession()).toBe(true)
    expect(logout).not.toHaveBeenCalled()
  })
})

describe('보호 화면 진입 전 세션 복구', () => {
  it('refresh 요청이 오프라인으로 실패하면 유효한 refresh token을 지우지 않는다', async () => {
    tokenStore.clear()
    window.localStorage.setItem('b204.refreshToken', 'refresh-1')
    fetchMock.mockRejectedValue(new TypeError('offline'))

    await expect(ensureAccessToken()).resolves.toBe(false)

    expect(refreshCallCount()).toBe(1)
    expect(tokenStore.hasSession()).toBe(true)
    expect(logout).not.toHaveBeenCalled()
  })
})
