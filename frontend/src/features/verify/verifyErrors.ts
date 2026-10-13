/**
 * V-01·V-02가 다루는 응답 `code`와 화면 처리 — 화면설계 v6 V-01·V-02 **상태** 항목.
 *
 * **분기는 `code`로만 한다.** `msg`는 그대로 노출만 하고 문자열로 분기하지 않는다(응답 규격 §1).
 * 도메인 코드는 공통 표(`shared/api/errorCodes`)에 모으지 않고 여기서 좁힌다 —
 * 정본이 두 곳이 되면 어긋난다(그 파일의 주석 규칙).
 *
 * ⚠ **화면설계와 API 정본의 에러 목록이 어긋난다**(보고 목록에 올렸다) —
 *   · V-01: 화면설계는 `CHAIN_TX_TIMEOUT`(504)을 적었지만 `12_verify.yaml`의 verify_01 응답에는
 *     504가 없고 대신 502 `COMMON_EXTERNAL_SERVICE_ERROR`가 있다. **둘 다 처리한다.**
 *   · V-02: 화면설계는 502·504·500을 적었지만 `08_coin.yaml`의 coin_01 응답에는 429·502뿐이다.
 *     **넷 다 처리한다.** 화면이 모르는 코드를 받으면 일반 에러로 떨어뜨린다.
 *
 * 컴포넌트가 아니라 상수·함수 모듈이다(Fast Refresh 규칙).
 */

/** V-01·V-02가 분기하는 코드 */
export const VerifyCode = {
  /** 404 — 존재하지 않거나 아직 검증 대상이 아닌 공연(DRAFT·PENDING_AGREEMENT) */
  PERFORMANCE_NOT_FOUND: 'PERFORMANCE_NOT_FOUND',
  /** 401 — C-01로 보내고 복귀 경로를 저장한다 */
  UNAUTHORIZED: 'COMMON_UNAUTHORIZED',
  /** 403 — 참여팀 소속이 아님 */
  FORBIDDEN: 'COMMON_FORBIDDEN',
  /** 403 — 이 공연의 참여팀이 아님 */
  NOT_PARTICIPANT: 'SETTLEMENT_NOT_PARTICIPANT',
  /** 429 — Retry-After(초) 헤더가 함께 온다 */
  TOO_MANY_REQUESTS: 'COMMON_TOO_MANY_REQUESTS',
  /** 504 — 체인 조회 지연(화면설계 V-01·V-02) */
  CHAIN_TX_TIMEOUT: 'CHAIN_TX_TIMEOUT',
  /** 502 — 체인 인덱스·노드 모두 사용 불가(verify_01·coin_01 응답) */
  EXTERNAL_SERVICE_ERROR: 'COMMON_EXTERNAL_SERVICE_ERROR',
  /** 500 */
  INTERNAL_ERROR: 'COMMON_INTERNAL_ERROR',
} as const

/**
 * 화면이 취할 행동.
 *   · `denied`  — 안내만 띄우고 **데이터를 일절 노출하지 않는다**(V-01 상태 항목의 명시 요구)
 *   · `signin`  — C-01로 보내고 복귀 경로 저장
 *   · `missing` — 대상이 없다
 *   · `retry`   — 다시 시도 버튼을 준다(체인 조회 지연·한도 초과·서버 오류)
 */
export type VerifyErrorKind = 'denied' | 'signin' | 'missing' | 'retry'

export interface VerifyErrorView {
  kind: VerifyErrorKind
  /** 제목. 서버 `msg`는 이 아래에 그대로 덧붙인다(§5.5) */
  title: string
  /** 보조 설명. 화면설계에 문구가 지정된 것은 그 문구를 그대로 썼다 */
  hint?: string
}

const TABLE: Record<string, VerifyErrorView> = {
  [VerifyCode.PERFORMANCE_NOT_FOUND]: {
    kind: 'missing',
    title: '공연을 찾을 수 없습니다',
    hint: '아직 검증할 수 있는 단계가 아닌 공연일 수 있습니다.',
  },
  [VerifyCode.UNAUTHORIZED]: {
    kind: 'signin',
    title: '로그인이 필요합니다',
    hint: '로그인하면 보던 화면으로 돌아옵니다.',
  },
  // V-01 상태 항목의 문구 그대로
  [VerifyCode.FORBIDDEN]: {
    kind: 'denied',
    title: '이 공연의 참여팀 리더만 볼 수 있어요',
  },
  [VerifyCode.NOT_PARTICIPANT]: {
    kind: 'denied',
    title: '이 공연의 참여팀 리더만 볼 수 있어요',
  },
  [VerifyCode.TOO_MANY_REQUESTS]: {
    kind: 'retry',
    title: '요청이 많아 잠시 막혔습니다',
    hint: '잠시 후 다시 시도해 주세요.',
  },
  [VerifyCode.CHAIN_TX_TIMEOUT]: {
    kind: 'retry',
    title: '체인 조회가 지연되고 있습니다',
    hint: '온체인 값을 아직 읽지 못했습니다. 다시 시도해 주세요.',
  },
  [VerifyCode.EXTERNAL_SERVICE_ERROR]: {
    kind: 'retry',
    title: '체인 조회가 지연되고 있습니다',
    hint: '체인 인덱스·노드를 읽지 못했습니다. 다시 시도해 주세요.',
  },
  [VerifyCode.INTERNAL_ERROR]: {
    kind: 'retry',
    title: '데이터를 불러오지 못했습니다',
    hint: '잠시 후 다시 시도해 주세요.',
  },
}

/** 모르는 코드는 일반 에러로 떨어뜨린다 — 화면이 조용히 성공한 척하지 않는다 */
const FALLBACK: VerifyErrorView = {
  kind: 'retry',
  title: '데이터를 불러오지 못했습니다',
  hint: '잠시 후 다시 시도해 주세요.',
}

export function verifyErrorView(code: string): VerifyErrorView {
  return TABLE[code] ?? FALLBACK
}

/** 체인 조회 지연 계열인가 — V-02는 이때 "마지막 성공 조회 시각"을 함께 안내한다 */
export function isChainDelay(code: string): boolean {
  return code === VerifyCode.CHAIN_TX_TIMEOUT || code === VerifyCode.EXTERNAL_SERVICE_ERROR
}
