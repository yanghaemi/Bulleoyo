/**
 * 검표(S-02·S-03)의 ErrorCode → 안내 문구·판정 분류표.
 *
 * 정본 — API 명세 v6 `docs/design/api/parts/10_entry.yaml`의 4xx 설명
 *        · 화면설계 v6 §4 S-02(1382~1384행)·S-03(1422행) **상태** 항목 · 응답 규격 §1
 *
 * **분기는 `code`로만 한다.** `msg`는 문구가 언제든 바뀌므로 분기 키가 아니다(규격 §1).
 * 서버가 `msg`를 주면 이 문구 **뒤에 덧붙여** 함께 보여준다(§5.5) — 대체하지 않는다.
 *
 * `studioErrors.ts`와 합치지 않은 이유 — 저쪽은 로그인한 공연자의 "저장·수정" 실패를 다루고,
 * 여기는 **로그인하지 않은 스태프의 현장 판정**을 다룬다. 같은 코드라도 할 말이 다르다
 * (`COMMON_NOT_FOUND`가 저쪽은 "찾을 수 없습니다", 여기는 "다른 공연의 티켓입니다"다).
 * features끼리 import하지 않는다는 구조 규칙(기술 스택 v3 §3.2)도 있다.
 *
 * **409 문구의 정본은 여기가 아니라 `shared/api/errorMessages.ts`다**(-121 항목 3).
 * 아래 표에서 409 줄 2개를 지우고 `conflictMessage`에 위임했다 — 지운 문장과 공통층 문장이
 * 글자 단위로 같았으므로 스태프가 읽는 말은 그대로다. 현장 전용 409 override는
 * `ENTRY_CONFLICT_OVERRIDES`에 적고 `errorMessages.test.ts`가 그 목록을 고정한다.
 */

import type { ConflictCode } from '@/shared/api/errorMessages'
import { conflictMessage, isConflictCode } from '@/shared/api/errorMessages'

/** 화면이 특별 취급하는 코드. 문구만이 아니라 UI 동작 자체가 달라지는 것들이다 */
export const EntryCode = {
  /** 401 — 토큰 유효기간(60초) 경과. TOTP는 30초마다 회전한다 → **재스캔 안내** */
  QR_EXPIRED: 'ENTRY_QR_EXPIRED',
  /** 401 — 서명 검증 실패(캡처·복제 QR). 실패 판정 */
  QR_SIGNATURE_INVALID: 'ENTRY_QR_SIGNATURE_INVALID',
  /** 409 — Redis 원타임 중복 감지. 최초 입장 시각을 함께 보여야 하지만 응답에 없다(주석 참조) */
  ALREADY_ENTERED: 'ENTRY_ALREADY_ENTERED',
  /** 409 — 입장 허용 시간대 밖 */
  NOT_IN_TIME_WINDOW: 'ENTRY_NOT_IN_TIME_WINDOW',
  /** 409 — 취소된 티켓 */
  TICKET_CANCELED: 'TICKET_CANCELED',
  /** 404 — 토큰이 가리키는 티켓 없음. S-02는 "다른 공연의 티켓"으로 읽는다 */
  NOT_FOUND: 'COMMON_NOT_FOUND',
  /** 403 — 검표 토큰이 무효·만료·다른 공연의 것. **카메라를 열지 않는다** */
  SCANNER_NOT_AUTHORIZED: 'ENTRY_SCANNER_NOT_AUTHORIZED',
  /** 401 — 검표 토큰도 로그인도 없음. 링크 무효와 같은 안내로 처리한다 */
  UNAUTHORIZED: 'COMMON_UNAUTHORIZED',
  /** 403 — 참여팀 소속이 아님(S-03 공연자 경로) */
  FORBIDDEN: 'COMMON_FORBIDDEN',
  /** 404 — 존재하지 않는 performanceId(entry-02) */
  PERFORMANCE_NOT_FOUND: 'PERFORMANCE_NOT_FOUND',
  /** 400 — qrToken 누락·형식 위반 / 허용되지 않는 result·size */
  VALIDATION_FAILED: 'COMMON_VALIDATION_FAILED',
  /** 429 — IP당 60회/분 초과(SEC-10). 연속 스캔이라 현장에서 실제로 닿을 수 있다 */
  TOO_MANY_REQUESTS: 'COMMON_TOO_MANY_REQUESTS',
} as const

/**
 * 코드 → 스태프가 현장에서 읽을 한 문장.
 *
 * 관객을 앞에 세워 두고 읽는 문장이라 **짧고, 다음 행동이 바로 나오게** 썼다.
 * 색으로만 알리지 않기 위해(§1.2) 배지 옆에 언제나 이 문구가 함께 붙는다.
 *
 * **409는 여기 적지 않는다.** `conflictMessage`(공통층)가 낸다 — 아래 `entryMessage` 참고.
 * 현장에서만 다르게 말해야 하는 409만 남기고 `ENTRY_CONFLICT_OVERRIDES`에도 넣는다.
 */
const MESSAGES: Record<string, string> = {
  /* ── 판정 실패(스캔 계속) ────────────────────────────────────────── */
  // 둘 다 401이라 409 공통층 대상이 아니다
  ENTRY_QR_EXPIRED: 'QR이 만료됐습니다. 화면을 새로 고친 뒤 다시 보여 달라고 해주세요.',
  ENTRY_QR_SIGNATURE_INVALID: '유효하지 않은 QR입니다. 캡처 이미지가 아닌지 확인해 주세요.',
  // 409 override — 공통층은 '이미 입장 처리된 티켓입니다.'로 더 길다. 관객을 앞에 세워 두고
  // 소리 내 읽는 문장이라 짧은 쪽을 유지한다. 뜻은 같다
  ENTRY_ALREADY_ENTERED: '이미 입장한 티켓입니다.',
  COMMON_NOT_FOUND: '이 공연의 티켓이 아닙니다.',
  COMMON_VALIDATION_FAILED: 'QR을 읽지 못했습니다. 다시 비춰 주세요.',
  COMMON_TOO_MANY_REQUESTS: '요청이 너무 빠릅니다. 잠시 뒤 다시 스캔해 주세요.',

  /* ── 링크·권한(화면 전체를 덮는다) ───────────────────────────────── */
  // S-02 컴포넌트 표 "링크 무효 안내"의 문구를 그대로 쓴다(1377행)
  ENTRY_SCANNER_NOT_AUTHORIZED:
    '검표 링크가 유효하지 않아요. 공연 담당자에게 링크를 다시 받아주세요',
  COMMON_UNAUTHORIZED: '검표 링크가 유효하지 않아요. 공연 담당자에게 링크를 다시 받아주세요',
  COMMON_FORBIDDEN: '이 공연의 참여팀만 입장 현황을 볼 수 있습니다.',
  PERFORMANCE_NOT_FOUND: '존재하지 않는 공연입니다.',

  /* ── 공통 ─────────────────────────────────────────────────────── */
  COMMON_INTERNAL_ERROR: '잠시 후 다시 시도해 주세요.',
  COMMON_EXTERNAL_SERVICE_ERROR: '서버 응답이 늦습니다. 잠시 후 다시 시도해 주세요.',
}

/**
 * 검표 현장에서만 다른 문장을 쓰는 409 코드.
 *
 * 여기 없는 409 코드는 공통층(`CONFLICT_MESSAGES`) 문장을 쓴다. `errorMessages.test.ts`가
 * "override는 실제로 공통층과 다른 문장이어야 한다"로 이 목록을 고정한다.
 */
export const ENTRY_CONFLICT_OVERRIDES: readonly ConflictCode[] = ['ENTRY_ALREADY_ENTERED'] as const

/**
 * 코드를 안내 문구로 옮긴다. 코드가 없으면 `undefined`.
 *
 * 409는 공통층이 낸다(`conflictMessage`) — 같은 코드가 어느 화면에서나 같은 말을 하게 한다.
 * 위 표는 409가 아닌 코드와 현장 전용 override만 갖는다.
 *
 * ⚠ 어느 표에도 없는 코드는 **문구를 지어내지 않고** 코드 문자열을 괄호에 담아 그대로 보여준다
 * (`studioErrors.studioMessage`와 같은 태도). 스태프가 그 코드로 담당자에게 알릴 수 있어야 한다.
 * 이 화면의 폴백만 "입장을 처리하지 못했습니다"로 **다른 문장**이라 공통층 폴백에 넘기지 않고
 * 409일 때만 공통층을 부른다 — 스캔 실패 화면이 갑자기 다른 말을 하면 안 된다.
 */
export function entryMessage(code: string | null | undefined): string | undefined {
  if (!code) return undefined
  if (MESSAGES[code]) return MESSAGES[code]
  return isConflictCode(code)
    ? conflictMessage(code, 'ko')
    : `입장을 처리하지 못했습니다. (코드 ${code})`
}

/** 서버 `msg`가 함께 왔으면 뒤에 붙인다(§5.5). 둘 다 없으면 `undefined` */
export function entryFailureText(
  code: string | null | undefined,
  msg?: string | null,
): string | undefined {
  const text = [entryMessage(code), msg].filter(Boolean).join(' ')
  return text || undefined
}

/**
 * 화면 전체를 덮어야 하는 코드인가 — 카메라를 열지 않고 "링크 무효 안내"만 표시한다.
 *
 * S-02 1383행: "토큰 무효: `ENTRY_SCANNER_NOT_AUTHORIZED`(403) — 카메라를 열지 않고
 * 링크 무효 안내만 표시". `COMMON_UNAUTHORIZED`(401, 토큰·로그인 둘 다 없음)도 같은 처지다.
 */
export function isLinkInvalidCode(code: string | null | undefined): boolean {
  return code === EntryCode.SCANNER_NOT_AUTHORIZED || code === EntryCode.UNAUTHORIZED
}

/**
 * 다시 스캔하면 통과할 수 있는 실패인가 — S-02가 "재스캔 안내"로 정한 것들이다.
 *
 * `ENTRY_QR_EXPIRED`는 관객 화면의 QR이 30초마다 회전하므로(A-08) 잠깐 기다렸다 다시 대면 된다.
 * ⚠ `COMMON_VALIDATION_FAILED`·`COMMON_TOO_MANY_REQUESTS`는 명세의 "재스캔" 목록에 없지만
 *    성격이 같아(QR을 다시 대면 해결) 같은 안내를 붙였다 — 임의 판단이다.
 */
export function isRescannableCode(code: string | null | undefined): boolean {
  return (
    code === EntryCode.QR_EXPIRED ||
    code === EntryCode.VALIDATION_FAILED ||
    code === EntryCode.TOO_MANY_REQUESTS
  )
}

/** 중복 입장 시도인가 — S-02 배지와 S-03 이력 배지가 이 코드를 따로 표시한다 */
export function isDuplicateCode(code: string | null | undefined): boolean {
  return code === EntryCode.ALREADY_ENTERED
}
