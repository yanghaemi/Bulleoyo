/**
 * C-01·C-02·C-04가 다루는 에러 코드와 안내 문구.
 *
 * 정본 — 화면설계 v6 §4 C-01·C-02·C-04의 **상태** 절 · API v6 `docs/design/api/parts/01_member.yaml`
 *
 * 규칙(응답 규격 §1) — **분기는 `code`로만 한다.** `msg`는 문구가 언제든 바뀌므로
 * 토스트에 그대로 띄우는 용도이지 분기 키가 아니다. 그래서 여기 문구는 서버 `msg`를
 * 못 받았을 때의 **폴백**이고, `msg`가 오면 그것을 우선한다.
 *
 * 컴포넌트 파일이 아니라 여기 둔 이유 — 화면 파일은 컴포넌트만 export한다(Fast Refresh).
 *
 * **409 문구의 정본은 `shared/api/errorMessages.ts`다**(-121 항목 3). 로그인 표에 없는 409는
 * 이제 공통층 `{ en, ko }`를 그대로 쓴다 — 구조가 같아 감싸기만 하면 된다. 로그인 맥락
 * override는 `MEMBER_CONFLICT_OVERRIDES`에 적고 `errorMessages.test.ts`가 그 목록을 고정한다.
 */

import { AuthCode, CommonCode } from '@/shared/api/errorCodes'
import type { ConflictCode } from '@/shared/api/errorMessages'
import { CONFLICT_MESSAGES, isConflictCode } from '@/shared/api/errorMessages'

/* ─────────────────────────── C-01 로그인 ─────────────────────────── */

/**
 * ⚠ **코드 이름이 문서 둘에서 다르다.**
 * 화면설계 C-01은 `AUTH_WEB3AUTH_TOKEN_INVALID`(§8.2, 잠정 `AUTH_INVALID_CREDENTIALS` 401)라고
 * 적었고, API 정본(member_01)의 401은 `AUTH_TOKEN_INVALID`다. 어느 쪽이 배포될 문자열인지
 * 정해지기 전이라 **셋 다 같은 안내로 처리**한다 — 분기 결과가 같으므로 안전한 쪽으로 넓혔다.
 * (명세 확인 요청 대상)
 *
 * 앞의 셋은 화면설계 C-01 "에러:" 줄에 있는 것이고, 뒤의 둘은 **API 정본에만 있는 것**이다
 * (`COMMON_VALIDATION_FAILED` 400 — 주소 형식·약관 누락 / `COMMON_CONFLICT` 409 —
 * 이미 등록된 지갑 주소와 불일치). 화면설계에 없다고 화면에서 빠뜨리면 사용자는
 * 아무 설명 없는 정지 화면을 본다.
 */
export const LOGIN_ERROR_TEXT: Record<string, { en: string; ko: string }> = {
  AUTH_WEB3AUTH_TOKEN_INVALID: {
    en: "Couldn't verify your sign-in. Please try again.",
    ko: '로그인을 확인하지 못했어요. 다시 시도해 주세요.',
  },
  [AuthCode.TOKEN_INVALID]: {
    en: "Couldn't verify your sign-in. Please try again.",
    ko: '로그인을 확인하지 못했어요. 다시 시도해 주세요.',
  },
  [AuthCode.INVALID_CREDENTIALS]: {
    en: "Couldn't verify your sign-in. Please try again.",
    ko: '로그인을 확인하지 못했어요. 다시 시도해 주세요.',
  },
  // 502 — 제공자 응답 없음. 화면설계가 "다른 제공자 사용 권유"까지 지정했다
  [CommonCode.EXTERNAL_SERVICE_ERROR]: {
    en: "That provider isn't responding. Try another one.",
    ko: '이 제공자가 응답하지 않아요. 다른 방법으로 로그인해 보세요.',
  },
  // 429 — IP당 60회/분 초과
  [CommonCode.TOO_MANY_REQUESTS]: {
    en: 'Too many attempts. Please wait a moment.',
    ko: '시도가 너무 많아요. 잠시 후 다시 해 주세요.',
  },
  [CommonCode.VALIDATION_FAILED]: {
    en: "Couldn't start sign-in. Please try again.",
    ko: '로그인을 시작하지 못했어요. 다시 시도해 주세요.',
  },
  // 409 override — member_01의 409는 "이미 등록된 지갑 주소와 불일치" 하나뿐이다.
  // 공통층 문장("이미 처리됐거나 같은 이름의 팀이 있습니다")은 팀 이름 중복까지 덮는 말이라
  // 로그인 화면에서는 사용자가 무엇을 잘못했는지 알 수 없다
  [CommonCode.CONFLICT]: {
    en: 'This account is already linked to a different wallet.',
    ko: '이 계정은 다른 지갑에 연결돼 있어요.',
  },
}

/** 모르는 코드에도 화면은 멈추지 않는다 — 마지막 안내 한 줄은 항상 있다 */
export const LOGIN_ERROR_FALLBACK = {
  en: 'Something went wrong. Please try again.',
  ko: '문제가 생겼어요. 다시 시도해 주세요.',
}

/**
 * 로그인 맥락에서만 다른 문장을 쓰는 409 코드.
 *
 * 여기 없는 409 코드는 공통층(`CONFLICT_MESSAGES`) 문장을 쓴다. `errorMessages.test.ts`가
 * "override는 실제로 공통층과 다른 문장이어야 한다"로 이 목록을 고정한다.
 */
export const MEMBER_CONFLICT_OVERRIDES: readonly ConflictCode[] = ['COMMON_CONFLICT'] as const

/**
 * 코드를 로그인 화면 문구로 옮긴다.
 *
 * 409는 위 override가 없으면 공통층 표를 그대로 쓴다 — `{ en, ko }` 구조가 같아 옮겨 담을
 * 것이 없다. 그 밖의 모르는 코드는 종전대로 마지막 안내 한 줄(`LOGIN_ERROR_FALLBACK`)이다.
 */
export function loginErrorText(code: string): { en: string; ko: string } {
  const own = LOGIN_ERROR_TEXT[code]
  if (own) return own
  return isConflictCode(code) ? CONFLICT_MESSAGES[code] : LOGIN_ERROR_FALLBACK
}

/* ───────────────────── C-02·C-04 설정 저장 ───────────────────── */

/**
 * 저장(`PATCH /api/v1/members/me`) 실패.
 *
 * · `COMMON_VALIDATION_FAILED`(400) — C-02는 "필드별 안내", C-04는 "지원하지 않는 통화·시간대".
 *   필드별 안내가 필요하므로 화면은 이 코드일 때 `errors.fieldErrors`(§0.10)를 함께 읽는다
 * · `COMMON_UNAUTHORIZED`(401) → **C-01로 보낸다.** 화면에 문구를 띄우고 머무르지 않는다
 * · `AUTH_EMAIL_DUPLICATED`(409)는 **P1**이다 — MVP C-02에는 이메일 폼이 없어 발생하지 않는다
 */
export const SAVE_ERROR_TEXT: Record<string, { en: string; ko: string }> = {
  [CommonCode.VALIDATION_FAILED]: {
    en: "Some of these aren't supported yet. Check the highlighted fields.",
    ko: '아직 지원하지 않는 값이 있어요. 표시된 항목을 확인해 주세요.',
  },
  [CommonCode.TOO_MANY_REQUESTS]: {
    en: 'Too many attempts. Please wait a moment.',
    ko: '시도가 너무 많아요. 잠시 후 다시 해 주세요.',
  },
}

export const SAVE_ERROR_FALLBACK = {
  en: "Couldn't save. Please try again.",
  ko: '저장하지 못했어요. 다시 시도해 주세요.',
}

export function saveErrorText(code: string): { en: string; ko: string } {
  return SAVE_ERROR_TEXT[code] ?? SAVE_ERROR_FALLBACK
}

/** 401은 문구를 띄우는 대신 로그인 화면으로 보낸다 — 호출부가 이 판정을 쓴다 */
export function isSessionExpired(code: string): boolean {
  return code === CommonCode.UNAUTHORIZED || code === AuthCode.TOKEN_INVALID
}
