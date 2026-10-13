/**
 * B204 REST 클라이언트.
 *
 * 정본: docs/design/06_API_명세서_v6.md §0.1·§0.3·§0.4·§0.6·§0.8·§0.10
 *      docs/design/01_API_공통_응답_규격.md §1
 *
 * ─────────────────────────── 이 파일이 지키는 규약 ───────────────────────────
 * 1. 응답 래퍼는 `{ code, data, msg }` 고정이고 **성공 판별은 `code === "SUCCESS"`** 다.
 *    `status === 200` 하드코딩 금지 — 201(생성)·202(비동기 접수)가 정상 응답으로 존재한다.
 * 2. **분기는 `code`만.** `msg`는 문구가 언제든 바뀌므로 토스트에만 쓴다.
 * 3. **401을 HTTP status로 가로채지 않는다.** 아래 "401 처리" 참고.
 * 4. refresh는 single-flight.
 * 5. `Accept-Language`는 모든 요청에 붙인다.
 *
 * ─────────────────────────────── 401 처리 ────────────────────────────────
 * 같은 401 안에 클라이언트가 정반대로 동작해야 하는 코드가 섞여 있다(규격 §1).
 *
 *   AUTH_TOKEN_EXPIRED        -> refresh 후 원요청 1회 재시도
 *   AUTH_TOKEN_INVALID        -> 재발급 없이 즉시 로그아웃
 *   ENTRY_QR_EXPIRED          ┐
 *   ENTRY_QR_SIGNATURE_INVALID├ 세션과 무관 -> **그대로 호출부에 넘긴다**
 *   AUTH_INVALID_CREDENTIALS  │
 *   COMMON_UNAUTHORIZED       ┘
 *
 * status 401을 통째로 "세션 만료"로 처리하면 ① 검표 담당자가 QR 만료로 로그인 화면에 튕기고
 * ② 로그인 실패가 로그아웃 루프를 만든다. 그래서 인증 판단은 오직 `code`로 한다.
 *
 * ────────────────────── refresh single-flight가 필요한 이유 ──────────────────────
 * 서버는 refresh token을 **회전**시키고, 회전·폐기된 토큰의 재사용을 탈취 신호로 보아
 * 그 회원의 refresh token을 **전량 폐기**한다(API-member-03). 화면 하나가 동시에 여러 쿼리를
 * 던지다 access가 만료되면 401이 여러 개 동시에 오는데, 그때 refresh가 두 번 나가면
 * 두 번째가 "이미 회전된 토큰"이 되어 **전 세션이 날아간다.** 그래서 `refreshPromise`를
 * 공유해 실제 호출은 한 번만 나가고 나머지는 그 약속을 기다린다.
 *
 * ─────────────────────────── 토큰 저장 위치와 근거 ───────────────────────────
 * 명세에 규정이 없어 프론트가 정했다.
 *
 *   access  -> **메모리(모듈 변수)**. 새로고침하면 사라지지만 refresh로 즉시 복구된다.
 *              XSS가 나도 스크립트가 실행되는 순간에만 노출되고 디스크에 남지 않는다.
 *   refresh -> **localStorage**.
 *
 * 트레이드오프를 알고 고른 값이다. localStorage는 XSS에 읽힌다. 그럼에도 고른 이유는
 * ① 관객이 QR·결제 도중 앱을 나갔다 돌아와도 다시 로그인하지 않아야 하고(시연 동선),
 * ② httpOnly 쿠키로 옮기려면 백엔드가 Set-Cookie·CSRF 방어를 추가해야 하는데 API v6는
 *    본문으로 refreshToken을 주고받는 규격이라(API-member-03 Body `refreshToken`)
 *    명세 변경 없이는 쿠키로 옮길 수 없기 때문이다.
 * 완화책은 서버 쪽 refresh 회전 + 재사용 시 전량 폐기다. 쿠키 전환이 필요하면
 * **명세 수정 요청**으로 올린다. 여기서 임의로 바꾸지 않는다.
 *
 * 저장 금지 - 개인키·니모닉·MPC 샤드·`senderSignedRlp`는 localStorage·sessionStorage·
 * 로그·에러 리포트 어디에도 남기지 않는다(기술 스택 v3 §3.2).
 */

import { config } from '@/shared/config'
import { AuthCode, CommonCode, SUCCESS, isPassthroughUnauthorized } from '@/shared/api/errorCodes'
import type { ApiEnvelope } from '@/shared/api/types'

/* ============================== 에러 ============================== */

/**
 * 실패 응답. 화면은 `error.code`로만 분기하고 `error.msg`는 토스트에 그대로 띄운다.
 * `data`는 실패 시 예외 없이 null이므로 담지 않는다(규격 §1).
 */
export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly msg: string
  /** 429일 때 서버가 주는 Retry-After(초). 그 외에는 undefined (§0.9) */
  readonly retryAfterSeconds?: number

  constructor(params: { code: string; status: number; msg: string; retryAfterSeconds?: number }) {
    super(params.code + ' (' + params.status + ')')
    this.name = 'ApiError'
    this.code = params.code
    this.status = params.status
    this.msg = params.msg
    this.retryAfterSeconds = params.retryAfterSeconds
  }
}

/** 네트워크 단절·JSON 파싱 실패처럼 래퍼를 받지 못한 경우. `code`가 없다. */
export class NetworkError extends Error {
  readonly reason?: unknown
  constructor(message: string, reason?: unknown) {
    super(message)
    this.name = 'NetworkError'
    this.reason = reason
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/* ============================ 토큰 저장소 ============================ */

const REFRESH_TOKEN_STORAGE_KEY = 'b204.refreshToken'

/** access는 메모리에만 둔다. 새로고침으로 사라지는 것이 의도다. */
let accessToken: string | null = null

function readRefreshToken(): string | null {
  try {
    return window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)
  } catch {
    // 사파리 프라이빗 모드 등에서 localStorage 접근이 던질 수 있다.
    return null
  }
}

function writeRefreshToken(token: string | null): void {
  try {
    if (token === null) window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
    else window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token)
  } catch {
    /* 저장 실패는 무시한다 - 세션이 이 탭에서만 유지될 뿐 동작은 이어진다. */
  }
}

export const tokenStore = {
  getAccessToken: (): string | null => accessToken,
  hasSession: (): boolean => accessToken !== null || readRefreshToken() !== null,
  /** 로그인·재발급 응답을 그대로 넣는다. refresh는 회전되므로 매번 새 값으로 덮어쓴다. */
  setTokens(next: { accessToken: string; refreshToken: string }): void {
    accessToken = next.accessToken
    writeRefreshToken(next.refreshToken)
  },
  clear(): void {
    accessToken = null
    writeRefreshToken(null)
  },
}

/* ===================== 세션 종료 알림 (라우터 분리) ===================== */

export type UnauthenticatedReason = 'TOKEN_INVALID' | 'REFRESH_FAILED' | 'NO_REFRESH_TOKEN'
type UnauthenticatedHandler = (reason: UnauthenticatedReason) => void

let onUnauthenticated: UnauthenticatedHandler = () => {}

/**
 * 강제 로그아웃 시 호출될 콜백을 등록한다. app/providers가 라우터 navigate를 물려 준다.
 * shared는 상위를 import하지 않으므로(기술 스택 v3 §3.2) 클라이언트가 직접 화면을 이동시키지 않는다.
 */
export function setUnauthenticatedHandler(handler: UnauthenticatedHandler): void {
  onUnauthenticated = handler
}

function forceLogout(reason: UnauthenticatedReason): void {
  tokenStore.clear()
  onUnauthenticated(reason)
}

/* ============================ Accept-Language ============================ */

/**
 * §0.6 - `en`(기본) / `ko`. 그 밖의 값은 서버가 en으로 폴백한다.
 *
 * 명세의 절별 헤더 표기가 불완전해(어떤 절은 Accept-Language를 적고 어떤 절은 빠뜨렸다)
 * **모든 요청에 항상** 붙인다. 로그인 회원이면 서버가 프로필 locale을 우선하므로
 * 헤더가 더 붙어도 부작용이 없다.
 */
let resolveLanguage: () => string = () => 'en'

export function setLanguageResolver(resolver: () => string): void {
  resolveLanguage = resolver
}

function currentLanguage(): string {
  const raw = resolveLanguage()
  return raw && raw.toLowerCase().startsWith('ko') ? 'ko' : 'en'
}

/* ============================== 멱등키 (§0.8) ============================== */

/** UUIDv4 생성. crypto.randomUUID는 보안 컨텍스트(https·localhost)에서만 있다. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
}

/**
 * `Idempotency-Key` **필수** 6개 (§0.8).
 * 헤더가 없으면 서버가 400 `COMMON_VALIDATION_FAILED`로 거절한다.
 *
 * 호출부는 재시도할 때 **같은 키를 다시 써야 한다.** 서버가 키 + 요청 해시를 24시간 보관하고
 * 같은 키·같은 본문이면 최초 응답을 재생하므로, 매번 새 키를 만들면 중복 주문·중복 지급이 난다.
 * 그래서 클라이언트가 키를 자동 생성하지 않는다 - 생성·보관 책임은 호출하는 feature에 있다.
 *
 * `signed-tx` 계열은 헤더를 요구하지 않는다. `senderSignedRlp` 자체가 자연 멱등키다.
 */
export const IDEMPOTENCY_REQUIRED: readonly { method: string; pattern: RegExp; api: string }[] = [
  { method: 'POST', pattern: /^\/orders$/, api: 'API-ticket-01 주문 생성' },
  { method: 'POST', pattern: /^\/orders\/[^/]+\/payment$/, api: 'API-payment-01 결제 시작' },
  { method: 'POST', pattern: /^\/tickets\/[^/]+\/cancel$/, api: 'API-refund-02 개별 취소·환불' },
  {
    method: 'POST',
    pattern: /^\/performances\/[^/]+\/cancel$/,
    api: 'API-performance-12 공연 취소',
  },
  {
    method: 'POST',
    pattern: /^\/performances\/[^/]+\/settlement\/release$/,
    api: 'API-settlement-05 release 실행',
  },
  { method: 'PUT', pattern: /^\/admin\/coin\/grants$/, api: 'API-coin-07 시연용 코인 지급' },
]

function idempotencyRequirement(method: string, path: string) {
  return IDEMPOTENCY_REQUIRED.find((r) => r.method === method && r.pattern.test(path))
}

/* ============================== 요청 조립 ============================== */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type QueryValue = string | number | boolean | null | undefined
export type QueryParams = Record<string, QueryValue | QueryValue[]>

export interface RequestOptions {
  method?: HttpMethod
  /** 직렬화할 본문. 본문 없는 POST에는 `{}`가 자동으로 들어간다 */
  body?: unknown
  query?: QueryParams
  /** 추가 헤더. Accept-Language·Authorization은 여기서 덮어쓰지 않는다 */
  headers?: Record<string, string>
  /** §0.8 필수 6개에 붙인다. 재시도 시 같은 값을 다시 넘겨야 한다 */
  idempotencyKey?: string
  signal?: AbortSignal
  /** 공개 API·refresh 호출처럼 Authorization을 붙이지 않을 때 */
  skipAuth?: boolean
  /**
   * **세션이 아예 없는 공개 경로**(비로그인 정산 공유 조회 등).
   *
   * `skipAuth`와 다르다. `skipAuth`는 "이번 요청에 Authorization을 붙이지 않는다"일 뿐이라
   * refresh 호출에도 쓰이고, 그쪽은 `AUTH_TOKEN_INVALID`를 받으면 **로그아웃해야 맞다**.
   * 반면 공개 경로에서 그 코드가 오면 그것은 이 사용자의 세션과 무관한 서버 사정이다 —
   * 거기서 로그아웃시키면 **공유 링크를 열어 본 것만으로 로그인 세션이 날아간다.**
   *
   * 그래서 강제 로그아웃을 타지 않을 것까지 포함해 별도 플래그로 둔다. `skipAuth`를 함의한다.
   */
  public?: boolean
  /**
   * 공개 화면의 선택적 회원 데이터처럼 인증 실패가 페이지 이동을 유발하면 안 되는 요청.
   * 토큰은 정상 요청과 똑같이 붙이고 무효 세션도 비우지만, 전역 비인증 콜백만 호출하지 않는다.
   */
  silentAuthFailure?: boolean
}

/** API v6 base URL은 `/api/v1`. config가 `/api`를 들고 있고 여기서 버전을 붙인다. */
const API_VERSION_PREFIX = '/v1'

/** 재발급 엔드포인트. 무한 루프 방지 가드가 이 값을 본다. */
const REFRESH_PATH = '/auth/refresh'

function buildUrl(path: string, query?: QueryParams): string {
  const base = config.apiBaseUrl + API_VERSION_PREFIX + path
  if (!query) return base
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null) continue
        search.append(key, String(item))
      }
    } else {
      search.append(key, String(value))
    }
  }
  const qs = search.toString()
  return qs ? base + '?' + qs : base
}

interface RawResponse {
  status: number
  envelope: ApiEnvelope<unknown>
  retryAfterSeconds?: number
}

/**
 * 실제 fetch 1회. 여기서는 인증·재시도 판단을 하지 않는다.
 * 래퍼를 파싱해 status와 함께 돌려주기만 한다.
 */
async function sendOnce(path: string, options: RequestOptions): Promise<RawResponse> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = {
    Accept: 'application/json',
    // §0.6 - 모든 요청에 항상 붙인다.
    'Accept-Language': currentLanguage(),
    ...options.headers,
  }

  let body: string | undefined
  if (method !== 'GET' && method !== 'DELETE') {
    // 본문 없는 POST에도 `{}`를 명시 전송한다. 빈 본문은 서버 @RequestBody 바인딩에서
    // 400으로 떨어질 수 있고, API v6에는 "Body 없음"인 POST가 여럿 있다
    // (예: API-payment-01 결제 시작 - v5에서 본문이 사라졌다).
    body = JSON.stringify(options.body ?? {})
    headers['Content-Type'] = 'application/json;charset=UTF-8'
  }

  // `public`은 `skipAuth`를 함의한다 — 공개 경로에 회원 토큰을 보낼 이유가 없고,
  // 보내면 만료된 토큰 하나로 공개 조회까지 401이 된다.
  if (!options.skipAuth && !options.public) {
    const token = tokenStore.getAccessToken()
    if (token) headers.Authorization = 'Bearer ' + token
  }

  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey
  } else if (import.meta.env.DEV) {
    const requirement = idempotencyRequirement(method, path)
    if (requirement) {
      console.warn(
        '[api] Idempotency-Key 누락: ' +
          method +
          ' ' +
          path +
          ' (' +
          requirement.api +
          '). §0.8 필수 대상이라 서버가 400 COMMON_VALIDATION_FAILED로 거절한다. ' +
          '호출부에서 키를 만들어 재시도 때도 같은 값을 넘겨라.',
      )
    }
  }

  let response: Response
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body,
      signal: options.signal,
      credentials: 'omit',
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new NetworkError('요청을 보내지 못했습니다.', cause)
  }

  const retryAfterHeader = response.headers.get('Retry-After')
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined

  // 204는 규격에 없지만(래퍼가 항상 온다) 방어적으로 둔다.
  const text = await response.text()
  if (!text) {
    return {
      status: response.status,
      envelope: { code: SUCCESS, data: null, msg: '' },
      retryAfterSeconds,
    }
  }

  let envelope: ApiEnvelope<unknown>
  try {
    envelope = JSON.parse(text) as ApiEnvelope<unknown>
  } catch (cause) {
    // 래퍼가 아닌 응답 = 프록시·게이트웨이 오류. 본문을 로그에 남기지 않는다(SEC-09).
    throw new NetworkError('응답을 해석하지 못했습니다. (status ' + response.status + ')', cause)
  }

  return { status: response.status, envelope, retryAfterSeconds }
}

function toApiError(raw: RawResponse): ApiError {
  return new ApiError({
    code: raw.envelope.code ?? CommonCode.INTERNAL_ERROR,
    status: raw.status,
    msg: raw.envelope.msg ?? '',
    retryAfterSeconds: raw.retryAfterSeconds,
  })
}

/* ======================= refresh (single-flight) ======================= */

interface RefreshTokenResponse {
  accessToken: string
  accessTokenExpiresAt: string
  refreshToken: string
  refreshTokenExpiresAt: string
}

/**
 * 진행 중인 refresh 하나를 모두가 공유한다. 동시 401이 N개 와도 실제 호출은 1회다.
 * 두 번 나가면 서버가 "회전된 토큰 재사용 = 탈취"로 보고 전 세션을 폐기한다(API-member-03).
 */
let refreshPromise: Promise<void> | null = null

async function performRefresh(): Promise<void> {
  const refreshToken = readRefreshToken()
  if (!refreshToken) {
    tokenStore.clear()
    throw new ApiError({ code: AuthCode.TOKEN_INVALID, status: 401, msg: '' })
  }

  // skipAuth로 만료된 access를 붙이지 않는다. sendOnce를 직접 부르므로
  // 아래 request()의 401 처리 경로를 타지 않는다 = 재귀 불가.
  const raw = await sendOnce(REFRESH_PATH, {
    method: 'POST',
    body: { refreshToken },
    skipAuth: true,
  })

  if (raw.envelope.code !== SUCCESS) {
    // 재발급 엔드포인트가 AUTH_TOKEN_EXPIRED를 주면 **재발급이 아니라 재로그인**이다.
    // refresh token 자체가 만료된 것이라 다시 refresh해도 영원히 만료다(무한 루프).
    // AUTH_TOKEN_INVALID(회전 토큰 재사용 -> 전량 폐기)도 마찬가지로 로그아웃이다.
    tokenStore.clear()
    throw toApiError(raw)
  }

  const data = raw.envelope.data as RefreshTokenResponse | null
  if (!data || !data.accessToken || !data.refreshToken) {
    tokenStore.clear()
    throw new NetworkError('토큰 재발급 응답이 규격과 다릅니다.')
  }

  // 회전 - 새 refresh로 반드시 덮어쓴다. 옛 값을 남기면 다음 재발급이 재사용으로 걸린다.
  tokenStore.setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken })
}

function ensureRefreshed(): Promise<void> {
  if (refreshPromise === null) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

/**
 * access token이 없으면 refresh로 **먼저 복구**한다. 있으면 아무 일도 하지 않는다.
 *
 * access는 메모리라 새로고침하면 사라진다. 그 상태로 보호 화면을 그리면
 *  ① 진입 가드가 세션이 살아 있는데도 로그인으로 튕기고,
 *  ② 요청에 `Authorization`이 아예 붙지 않아 서버가 `COMMON_UNAUTHORIZED`를 주는데
 *    이 코드는 passthrough라 refresh가 돌지 않는다 — 새로고침마다 로그아웃처럼 보인다.
 * `AUTH_TOKEN_EXPIRED` 경로(만료된 토큰을 들고 간 경우)만으로는 이 창을 못 메운다.
 *
 * 진행 중인 refresh가 있으면 그것을 기다린다(single-flight 그대로 — 두 번 나가면 서버가
 * 회전 토큰 재사용으로 보고 전 세션을 폐기한다). 실패는 `performRefresh`가 이미
 * 로그아웃 처리했으므로 여기서는 false만 돌려준다.
 */
export async function ensureAccessToken(): Promise<boolean> {
  if (accessToken !== null) return true
  if (readRefreshToken() === null) return false
  try {
    await ensureRefreshed()
    return accessToken !== null
  } catch (error) {
    if (error instanceof NetworkError) return false
    forceLogout('REFRESH_FAILED')
    return false
  }
}

/**
 * 공개 화면에서 로그인 회원에게만 보이는 보조 데이터를 위한 세션 복구.
 * 실패한 세션은 비우되 홈 전체를 로그인 화면으로 보내지는 않는다.
 */
export async function ensureOptionalAccessToken(): Promise<boolean> {
  if (accessToken !== null) return true
  if (readRefreshToken() === null) return false
  try {
    await ensureRefreshed()
    return accessToken !== null
  } catch (error) {
    // 네트워크 단절은 인증 무효가 아니다. 오프라인에서 홈을 열었다는 이유만으로
    // 디스크의 refresh token까지 지우면 연결 복구 뒤에도 다시 로그인해야 한다.
    if (error instanceof NetworkError) return false
    tokenStore.clear()
    return false
  }
}

/* ============================== 본 요청 ============================== */

function isRefreshEndpoint(path: string): boolean {
  return path === REFRESH_PATH
}

/**
 * 회원 세션 요청. 성공하면 `data`를 반환하고, 실패하면 `ApiError`를 던진다.
 *
 * 인증 처리는 **`code`로만** 한다. status는 ApiError에 실어 보내기만 하고 분기에 쓰지 않는다.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const raw = await sendOnce(path, options)

  if (raw.envelope.code === SUCCESS) {
    return raw.envelope.data as T
  }

  const code = raw.envelope.code

  // -- 재발급 엔드포인트 자체의 실패는 여기서 끝낸다. 다시 refresh하지 않는다(무한 루프 방지).
  if (isRefreshEndpoint(path)) {
    forceLogout('REFRESH_FAILED')
    throw toApiError(raw)
  }

  // -- 세션과 무관한 401은 손대지 않고 그대로 넘긴다(검표 QR 만료·로그인 자격 실패 등).
  if (isPassthroughUnauthorized(code)) {
    throw toApiError(raw)
  }

  // -- 위조·회전 재사용: 재발급 시도 없이 즉시 로그아웃.
  //    공개 경로는 제외한다 — 거기서 이 코드가 오면 이 사용자의 세션과 무관한 서버 사정이고,
  //    로그아웃시키면 공유 링크를 열어 본 것만으로 로그인이 풀린다.
  if (code === AuthCode.TOKEN_INVALID && !options.public) {
    if (options.silentAuthFailure) tokenStore.clear()
    else forceLogout('TOKEN_INVALID')
    throw toApiError(raw)
  }

  // -- 만료: refresh 후 원요청 **1회만** 재시도.
  if (code === AuthCode.TOKEN_EXPIRED && !options.skipAuth && !options.public) {
    try {
      await ensureRefreshed()
    } catch (error) {
      // 연결 단절은 refresh token 무효가 아니다. 인증 서버가 실제 거절한 경우에만
      // 세션을 끝내고, 네트워크 오류는 토큰을 보존한 채 호출부가 재시도하게 한다.
      if (!(error instanceof NetworkError) && !options.silentAuthFailure) {
        forceLogout('REFRESH_FAILED')
      }
      throw error
    }

    const retried = await sendOnce(path, options)
    if (retried.envelope.code === SUCCESS) {
      return retried.envelope.data as T
    }
    // 두 번째도 만료면 서버·클럭 문제다. 무한 재시도 대신 로그아웃한다.
    if (retried.envelope.code === AuthCode.TOKEN_EXPIRED) {
      if (options.silentAuthFailure) tokenStore.clear()
      else forceLogout('REFRESH_FAILED')
    }
    throw toApiError(retried)
  }

  throw toApiError(raw)
}

/**
 * 이미지처럼 JSON으로 바꾸면 안 되는 multipart 요청.
 * 인증·refresh 규칙은 `request`와 같고, 브라우저가 boundary를 넣도록 Content-Type은 직접 쓰지 않는다.
 */
export async function uploadFormData<T>(path: string, form: FormData): Promise<T> {
  const send = async (): Promise<RawResponse> => {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Accept-Language': currentLanguage(),
    }
    const token = tokenStore.getAccessToken()
    if (token) headers.Authorization = 'Bearer ' + token

    let response: Response
    try {
      response = await fetch(buildUrl(path), {
        method: 'POST',
        headers,
        body: form,
        credentials: 'omit',
      })
    } catch (cause) {
      throw new NetworkError('이미지를 보내지 못했습니다.', cause)
    }

    const responseText = await response.text()
    let envelope: ApiEnvelope<unknown>
    try {
      envelope = responseText
        ? (JSON.parse(responseText) as ApiEnvelope<unknown>)
        : { code: SUCCESS, data: null, msg: '' }
    } catch (cause) {
      throw new NetworkError('이미지 저장 응답을 해석하지 못했습니다.', cause)
    }
    return { status: response.status, envelope }
  }

  let raw = await send()
  if (raw.envelope.code === SUCCESS) return raw.envelope.data as T
  if (raw.envelope.code === AuthCode.TOKEN_INVALID) {
    forceLogout('TOKEN_INVALID')
    throw toApiError(raw)
  }
  if (raw.envelope.code === AuthCode.TOKEN_EXPIRED) {
    try {
      await ensureRefreshed()
    } catch (error) {
      if (!(error instanceof NetworkError)) forceLogout('REFRESH_FAILED')
      throw error
    }
    raw = await send()
    if (raw.envelope.code === SUCCESS) return raw.envelope.data as T
    if (raw.envelope.code === AuthCode.TOKEN_EXPIRED) forceLogout('REFRESH_FAILED')
  }
  throw toApiError(raw)
}

/** 회원 세션 클라이언트. 화면·feature는 이 객체만 쓴다. */
export const api = {
  get: <T,>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T,>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T,>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  patch: <T,>(
    path: string,
    body?: unknown,
    options: Omit<RequestOptions, 'method' | 'body'> = {},
  ) => request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T,>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...options, method: 'DELETE' }),
  request,
}

/* ======================= 검표 클라이언트 (S-02·S-03) ======================= */

/**
 * 검표 전용 클라이언트.
 *
 * S-02·S-03은 **비로그인 화면**이다. 공연 생성자가 공유한 링크 토큰만 들고 들어오며,
 * 인증은 `Authorization`이 아니라 **`X-Entry-Token`** 으로 한다(§0.1 "검표 링크 토큰").
 *
 * 회원 세션 인터셉터를 타지 않는 것이 핵심이다.
 *  - access token을 붙이지 않는다(붙일 것도 없다).
 *  - `ENTRY_QR_EXPIRED`·`ENTRY_QR_SIGNATURE_INVALID`(둘 다 401)에서 refresh·로그아웃을 돌리지 않는다.
 *    스캔 도중 로그인 화면으로 튕기면 검표가 멈춘다.
 *  - 링크 토큰이 죽으면(`ENTRY_LINK_EXPIRED`) 화면이 "링크를 다시 받아 주세요"를 띄운다.
 */
export function createEntryClient(entryToken: string) {
  async function entryRequest<T>(
    path: string,
    options: Omit<RequestOptions, 'skipAuth'> = {},
  ): Promise<T> {
    const raw = await sendOnce(path, {
      ...options,
      skipAuth: true, // 회원 access token을 절대 붙이지 않는다.
      headers: { ...options.headers, 'X-Entry-Token': entryToken },
    })

    if (raw.envelope.code === SUCCESS) return raw.envelope.data as T
    // refresh·강제 로그아웃 없음. 전부 호출부(검표 화면)가 code로 처리한다.
    throw toApiError(raw)
  }

  return {
    get: <T,>(path: string, options: Omit<RequestOptions, 'method' | 'body' | 'skipAuth'> = {}) =>
      entryRequest<T>(path, { ...options, method: 'GET' }),
    post: <T,>(
      path: string,
      body?: unknown,
      options: Omit<RequestOptions, 'method' | 'body' | 'skipAuth'> = {},
    ) => entryRequest<T>(path, { ...options, method: 'POST', body }),
    request: entryRequest,
  }
}

export type EntryClient = ReturnType<typeof createEntryClient>
