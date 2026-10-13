/**
 * 응답 `code` 상수.
 *
 * 규격 §1 — `code`는 **클라이언트 분기의 유일한 키**이고, 배포된 코드 문자열은 변경 금지다.
 * `msg`는 문구가 언제든 바뀌므로 분기에 쓰지 않는다(토스트 표시 전용).
 *
 * 여기에는 **모든 엔드포인트에 공통인 코드(API v6 §0.10)** 와 클라이언트 자신이 분기하는
 * 인증·입장 코드만 둔다. 도메인 전용 코드(`TICKET_*`·`SETTLEMENT_*` …)는 해당 feature에서
 * 각 API 절의 에러 표를 보고 좁혀 정의한다. 여기에 전부 모으면 정본이 두 곳이 된다.
 */

/** 성공 판별은 오직 이 값이다. `status === 200` 하드코딩 금지 — 201·202가 정상이다. */
export const SUCCESS = 'SUCCESS' as const

/** API v6 §0.10 공통 에러. */
export const CommonCode = {
  /** 400 — Bean Validation 위반. 멱등키 필수 대상에서 헤더 누락도 이 코드다(§0.8) */
  VALIDATION_FAILED: 'COMMON_VALIDATION_FAILED',
  /** 401 — 인증이 필요한 API에 Authorization 헤더가 없음 */
  UNAUTHORIZED: 'COMMON_UNAUTHORIZED',
  /** 403 */
  FORBIDDEN: 'COMMON_FORBIDDEN',
  /** 404 */
  NOT_FOUND: 'COMMON_NOT_FOUND',
  /** 409 — 상태 충돌, 멱등키 본문 불일치, 지갑 YoYo 잔액 부족 */
  CONFLICT: 'COMMON_CONFLICT',
  /** 429 — Retry-After 헤더(초)가 함께 온다 */
  TOO_MANY_REQUESTS: 'COMMON_TOO_MANY_REQUESTS',
  /** 500 */
  INTERNAL_ERROR: 'COMMON_INTERNAL_ERROR',
  /** 502 — 체인 노드·Web3Auth JWKS 오류 */
  EXTERNAL_SERVICE_ERROR: 'COMMON_EXTERNAL_SERVICE_ERROR',
} as const

/** 인증 코드. 401 안에서 클라이언트가 정반대로 동작하는 두 코드가 핵심이다(규격 §1). */
export const AuthCode = {
  /** 401 — access token 만료. **이 코드에서만** refresh 후 원요청 1회 재시도 */
  TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  /** 401 — 서명 불일치·위조·회전된 refresh 재사용. 재발급 시도 없이 즉시 로그아웃 */
  TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  /** 401 — 이메일 로그인 자격 실패(P1). 로그아웃도 refresh도 아니다. 화면이 처리한다 */
  INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  /** 409 — 처음 확인된 소셜 신원이라 국가·약관을 추가로 받아야 한다 */
  SIGNUP_REQUIRED: 'AUTH_SIGNUP_REQUIRED',
} as const

/**
 * 입장(검표) 코드 — **401이지만 회원 세션과 무관하다.**
 * S-02·S-03은 비로그인 화면이고 `X-Entry-Token`으로 인증한다. 이 401을 세션 만료로 오인해
 * 가로채면 검표 담당자가 스캔 도중 로그인 화면으로 튕긴다.
 */
export const EntryCode = {
  /** 401 — QR 유효 구간(60초) 경과 */
  QR_EXPIRED: 'ENTRY_QR_EXPIRED',
  /** 401 — QR 서명 검증 실패 */
  QR_SIGNATURE_INVALID: 'ENTRY_QR_SIGNATURE_INVALID',
} as const

/**
 * 401 중 **클라이언트가 가로채지 않고 호출부로 그대로 넘기는** 코드.
 *
 * 401을 HTTP status로 잡으면 이 셋이 전부 "세션 만료"로 뭉뚱그려진다.
 * 그래서 클라이언트는 status가 아니라 `code`로만 인증을 판단한다.
 */
export const PASSTHROUGH_UNAUTHORIZED_CODES: readonly string[] = [
  EntryCode.QR_EXPIRED,
  EntryCode.QR_SIGNATURE_INVALID,
  AuthCode.INVALID_CREDENTIALS,
  // Authorization 헤더 자체가 없는 경우. 토큰이 있는데 만료·위조된 것과 원인이 다르므로
  // refresh·강제 로그아웃 대상이 아니고, 화면 가드가 로그인으로 유도한다.
  CommonCode.UNAUTHORIZED,
]

export function isPassthroughUnauthorized(code: string): boolean {
  return PASSTHROUGH_UNAUTHORIZED_CODES.includes(code)
}
