/**
 * 관리자 화면(M-02·M-03)의 ErrorCode → 안내 문구 표.
 *
 * 정본 — 화면설계 v6 §4 M-02·M-03 **상태** 항목의 "에러:" 줄 · API 명세 v6
 *        `13_admin.yaml`(admin_06·09) · `08_coin.yaml`(coin_01·02·03·07·08 · chain_01)의
 *        4xx/5xx 설명 · 응답 규격 §1
 *
 * P-08의 `settlementMessages.ts`와 같은 방식이다 — **문구를 컴포넌트 밖 표 하나에 모은다.**
 * 이유도 같다: 같은 코드가 "왜 버튼이 안 눌리는가"와 "왜 실패했는가" 두 자리에 나오는데
 * 표를 두 벌로 나누면 한 코드에 다른 설명이 붙는다.
 *
 * **분기는 `code`로만 한다.** `msg`는 문구가 언제든 바뀌므로 분기 키가 아니다(규격 §1).
 * 서버 `msg`가 함께 오면 이 문구 **뒤에 덧붙여** 보여준다(§5.5) — 대체하지 않는다.
 *
 * ⚠ §8.2 신설 제안 코드(`COIN_SUPPLY_MISMATCH`·`COIN_GRANT_LIMIT_EXCEEDED`·`WALLET_NOT_LINKED`)는
 * 아직 잠정 코드로 내려온다. 그래서 **신설 코드와 잠정 코드를 둘 다** 담는다.
 * 서버가 어느 쪽을 보내도 화면은 같은 말을 해야 한다.
 *   · `COIN_SUPPLY_MISMATCH`   잠정 `COIN_RESERVE_MISMATCH`(409)
 *   · `COIN_GRANT_LIMIT_EXCEEDED` 잠정 `COMMON_VALIDATION_FAILED`(400)
 *   · `WALLET_NOT_LINKED`      화면설계는 잠정 `COMMON_FORBIDDEN`(403)이라 적었고,
 *                              coin_07 명세는 실제로 `WALLET_NOT_FOUND`(404)를 쓴다 → 셋 다 담는다
 *
 * **409 문구의 정본은 여기가 아니라 `shared/api/errorMessages.ts`다**(-121 항목 3).
 * 아래 표에서 409 줄 2개를 지우고 `conflictMessage`에 위임했다 — 지운 문장과 공통층 문장이
 * 글자 단위로 같았으므로 화면에 보이는 말은 그대로다. 관리자 화면 전용 409 override는
 * `ADMIN_CONFLICT_OVERRIDES`에 적고 `errorMessages.test.ts`가 그 목록을 고정한다.
 *
 * 이 파일은 **컴포넌트를 export하지 않는다**(Fast Refresh).
 */

import type { AdminError, CoinSupplyInvariant } from '@/features/admin/adminTypes'
import { isApiError } from '@/shared/api/client'
import type { ConflictCode } from '@/shared/api/errorMessages'
import { conflictMessage } from '@/shared/api/errorMessages'
import { formatYoyo } from '@/shared/ui'

/** 화면이 문구만 바꾸는 것이 아니라 **UI 자체를 바꾸는** 코드 */
export const AdminCode = {
  /** 401 — 관리자 세션 없음. 화면 전체를 권한 안내로 덮는다 */
  UNAUTHORIZED: 'COMMON_UNAUTHORIZED',
  /** 403 — ADMIN이 아님. 화면 전체를 권한 없음으로 덮는다 */
  FORBIDDEN: 'COMMON_FORBIDDEN',
  /** 404 — 존재하지 않는 disputeId·memberId */
  NOT_FOUND: 'COMMON_NOT_FOUND',
  /** 409 — 이미 처리된 이의. 목록을 다시 불러오고 상세를 읽기 전용으로 바꾼다 */
  CONFLICT: 'COMMON_CONFLICT',
  /** 400 — 입력 검증 실패. 필드 아래 오류로 붙인다 */
  VALIDATION_FAILED: 'COMMON_VALIDATION_FAILED',
  /** 409 — 이미 release가 끝난 정산의 이의(admin_06) */
  ALREADY_RELEASED: 'SETTLEMENT_ALREADY_RELEASED',
  /** 403 — settlement_01의 참여팀 제한. M-02 상세 패널이 이걸로 막힐 수 있다 */
  NOT_PARTICIPANT: 'SETTLEMENT_NOT_PARTICIPANT',
  /** 409 — 발행량 대사 불일치로 mint 중단. 지급 버튼을 비활성으로 유지한다 */
  SUPPLY_MISMATCH: 'COIN_SUPPLY_MISMATCH',
  RESERVE_MISMATCH: 'COIN_RESERVE_MISMATCH',
  /** 400 — 1회 지급 한도(1,000,000 YoYo) 초과. 금액 필드에 붙인다 */
  GRANT_LIMIT_EXCEEDED: 'COIN_GRANT_LIMIT_EXCEEDED',
  /** 지갑 미연결 — 대상 필드에 붙인다. 세 코드가 같은 뜻이다(위 ⚠ 참고) */
  WALLET_NOT_LINKED: 'WALLET_NOT_LINKED',
  WALLET_NOT_FOUND: 'WALLET_NOT_FOUND',
  /** 429 — 관리자당 30회/분 초과 */
  TOO_MANY_REQUESTS: 'COMMON_TOO_MANY_REQUESTS',
  /** 500 — mint tx 최종 실패 */
  MINT_FAILED: 'COIN_MINT_FAILED',
  INTERNAL_ERROR: 'COMMON_INTERNAL_ERROR',
} as const

/**
 * 코드 → 한 문장 + 다음 행동.
 *
 * 색으로만 알리지 않기 위해(§1.2) 비활성 버튼·경고 배지 옆에 이 문구가 함께 붙는다.
 *
 * **409는 여기 적지 않는다.** `conflictMessage`(공통층)가 낸다 — 아래 `adminMessage` 참고.
 * 이 화면에서만 다르게 말해야 하는 409만 남기고 `ADMIN_CONFLICT_OVERRIDES`에도 넣는다.
 */
const MESSAGES: Record<string, string> = {
  /* ── M-02 이의제기(admin_06·09) ─────────────────────────────────── */
  // 409 override — 공통층은 팀 이름 중복까지 덮는 문장을 쓰지만 admin_06의 409는
  // "이미 처리된 이의" 하나뿐이다. 관리자에게 "같은 이름의 팀"이라고 말하면 안 된다
  COMMON_CONFLICT: '이미 처리된 이의입니다. 목록을 다시 불러왔습니다.',
  SETTLEMENT_NOT_PARTICIPANT:
    '정산 상세를 볼 권한이 없습니다. 이 조회는 참여팀 소속만 허용됩니다(명세 확인 필요).',

  /* ── M-03 지급(coin_07) ────────────────────────────────────────── */
  COIN_GRANT_LIMIT_EXCEEDED: '1회 지급 한도(1,000,000 YoYo)를 초과했습니다. 금액을 줄여 주세요.',
  WALLET_NOT_LINKED:
    '대상 회원의 지갑이 연결되어 있지 않습니다. 지갑 등록 후에 지급할 수 있습니다.',
  WALLET_NOT_FOUND:
    '등록되지 않은 지갑입니다. 회원 검색으로 대상을 고르거나 주소를 다시 확인해 주세요.',
  // 잠정 코드 `COIN_RESERVE_MISMATCH`(409)는 공통층이 **같은 문장**으로 낸다.
  // §8.2 신설 코드인 이쪽은 409 표에 없어 여기 남는다 — 서버가 어느 쪽을 보내도 같은 말이다
  COIN_SUPPLY_MISMATCH:
    '발행량 대사가 맞지 않아 코인 지급(mint)이 중단된 상태입니다. 원인 확인 후에 지급할 수 있습니다.',
  COIN_MINT_FAILED: 'mint 트랜잭션이 최종 실패했습니다. 새 멱등키로 다시 요청해 주세요.',

  /* ── M-03 표시 환율(coin_03) ───────────────────────────────────── */
  // 400은 지급·환율 양쪽에서 온다. 어느 폼에서 났는지는 화면이 알고 있으므로
  // 여기서는 두 원인을 함께 덮는 문구를 쓴다
  COMMON_VALIDATION_FAILED:
    '입력값을 확인해 주세요. 통화쌍·환율 범위 또는 지급 대상·금액이 규칙에 맞지 않습니다.',

  /* ── 체인 작업(chain_01) ───────────────────────────────────────── */
  CHAIN_NONCE_CONFLICT: '운영 지갑 nonce가 충돌했습니다. 순차 재처리 대상입니다.',
  CHAIN_GAS_INSUFFICIENT: '운영 지갑 가스가 부족합니다. 가스를 채운 뒤 다시 시도해 주세요.',
  CHAIN_TX_TIMEOUT: '온체인 확정이 늦어지고 있습니다. 상태를 계속 확인합니다.',

  /* ── 공통 ──────────────────────────────────────────────────────── */
  COMMON_UNAUTHORIZED: '관리자 로그인이 필요합니다.',
  COMMON_FORBIDDEN: '관리자만 볼 수 있는 화면입니다.',
  COMMON_NOT_FOUND: '요청한 정보를 찾을 수 없습니다.',
  COMMON_TOO_MANY_REQUESTS: '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.',
  COMMON_INTERNAL_ERROR: '잠시 후 다시 시도해 주세요.',
  COMMON_EXTERNAL_SERVICE_ERROR:
    '체인 조회가 실패했습니다. 마지막으로 성공한 조회 시각을 함께 확인해 주세요.',
}

/**
 * 관리자 화면에서만 다른 문장을 쓰는 409 코드.
 *
 * 여기 없는 409 코드는 공통층(`CONFLICT_MESSAGES`) 문장을 쓴다. `errorMessages.test.ts`가
 * "override는 실제로 공통층과 다른 문장이어야 한다"로 이 목록을 고정한다 —
 * 같은 문장이 되면 테스트가 깨지고, 그때 override를 지우면 된다.
 */
export const ADMIN_CONFLICT_OVERRIDES: readonly ConflictCode[] = ['COMMON_CONFLICT'] as const

/**
 * 코드를 안내 문구로 옮긴다. 코드가 없으면 `undefined`.
 *
 * 409는 공통층이 낸다(`conflictMessage`) — 같은 코드가 어느 화면에서나 같은 말을 하게 한다.
 * 위 표는 409가 아닌 코드와 이 화면 전용 override만 갖는다.
 *
 * ⚠ 어느 표에도 없는 코드는 **문구를 지어내지 않고** 코드 문자열을 괄호에 담아 그대로 보여준다.
 * 관리자가 그 코드로 신고할 수 있어야 하고, 화면이 모르는 상황을 아는 척하면 안 된다.
 * 공통층 폴백이 이 파일이 쓰던 것과 **같은 문장**이라 폴백 분기를 따로 두지 않는다.
 */
export function adminMessage(code: string | null | undefined): string | undefined {
  if (!code) return undefined
  return MESSAGES[code] ?? conflictMessage(code, 'ko')
}

/**
 * 조회·실행 실패를 화면이 쓰는 `{ code, msg }`로 옮긴다. M-02·M-03 두 페이지가 같이 쓴다.
 *
 * 래퍼를 받지 못한 실패(네트워크 단절·JSON 파싱)는 서버 코드가 없다. 그때 쓰는
 * `COMMON_INTERNAL_ERROR`는 **서버가 준 코드가 아니라 이 화면이 고른 표시용**이다 —
 * 응답 분기 키로 쓰지 않는다.
 */
export function toAdminError(error: unknown): AdminError | null {
  if (!error) return null
  if (isApiError(error)) return { code: error.code, msg: error.msg }
  return { code: AdminCode.INTERNAL_ERROR }
}

/** 서버 `msg`가 함께 왔으면 뒤에 붙인다(§5.5). 둘 다 없으면 `undefined` */
export function adminFailureText(
  code: string | null | undefined,
  msg?: string | null,
): string | undefined {
  const text = [adminMessage(code), msg].filter(Boolean).join(' ')
  return text || undefined
}

/**
 * 화면 전체를 권한 안내로 덮어야 하는가 — 401·403.
 *
 * 401(`COMMON_UNAUTHORIZED`)은 클라이언트가 조용히 재발급을 시도하지만(§1.2 원칙 10),
 * 그마저 실패해 화면까지 올라온 경우에는 관리자에게 로그인을 요구해야 한다.
 */
export function isAccessDeniedCode(code: string | null | undefined): boolean {
  return code === AdminCode.UNAUTHORIZED || code === AdminCode.FORBIDDEN
}

/**
 * M-02 상세 패널(`settlement_01`)이 **권한으로** 막혔는가.
 *
 * 세 코드가 같은 원인을 가리킨다 — 그 조회는 참여팀(`x-role: [PERFORMER]`)만 허용이라
 * 관리자 계정은 `SETTLEMENT_NOT_PARTICIPANT`(403)나 `COMMON_FORBIDDEN`(403)을 받는다.
 * 재시도로 낫지 않으므로 화면은 재시도 대신 안내를 띄운다.
 */
export function isSettlementDeniedCode(code: string | null | undefined): boolean {
  return isAccessDeniedCode(code) || code === AdminCode.NOT_PARTICIPANT
}

/**
 * 발행량 대사 불일치로 mint가 멈춘 상태인가.
 *
 * 전용 코드와 잠정 코드가 함께 쓰인다(§8.2 승격 전). 둘 다 같은 뜻이다.
 */
export function isSupplyMismatchCode(code: string | null | undefined): boolean {
  return code === AdminCode.SUPPLY_MISMATCH || code === AdminCode.RESERVE_MISMATCH
}

/**
 * 이미 처리된 이의인가 — 화면은 상세를 읽기 전용으로 바꾸고 목록을 다시 불러온다.
 *
 * ⚠ `COMMON_CONFLICT`(409)는 admin_06에서 "이미 처리된 이의" 하나만 뜻하지만,
 * `SETTLEMENT_ALREADY_RELEASED`도 같은 409로 온다. 후자는 처리 자체가 막힌 것이 아니라
 * 결과가 무의미하다는 뜻이라 문구가 다르다.
 */
export function isAlreadyResolvedCode(code: string | null | undefined): boolean {
  return code === AdminCode.CONFLICT
}

/**
 * release가 끝나 **되돌릴 수 없는** 정산의 이의인가 — 같은 409의 다른 사유다.
 *
 * `COMMON_CONFLICT`와 뭉개면 "이미 처리된 이의입니다"가 뜬다. 이의는 아직 열려 있고
 * 처리도 가능한데 결과가 무의미할 뿐이라, 그 문구는 관리자가 목록에서 건을 찾다 지치게 만든다.
 */
export function isAlreadyReleasedCode(code: string | null | undefined): boolean {
  return code === AdminCode.ALREADY_RELEASED
}

/**
 * 지급 대상(회원·주소) 필드에 붙일 오류인가.
 *
 * 세 코드가 같은 원인을 가리킨다(위 ⚠). 어느 것이 오든 대상 필드 아래에 붙인다.
 */
export function isGrantTargetCode(code: string | null | undefined): boolean {
  return (
    code === AdminCode.WALLET_NOT_LINKED ||
    code === AdminCode.WALLET_NOT_FOUND ||
    code === AdminCode.NOT_FOUND
  )
}

/** 지급 금액 필드에 붙일 오류인가 — 1회 한도 초과(전용 코드 · 잠정 코드) */
export function isGrantAmountCode(code: string | null | undefined): boolean {
  return code === AdminCode.GRANT_LIMIT_EXCEEDED || code === AdminCode.VALIDATION_FAILED
}

/** §5.1 `ChainJob.status` → 화면 라벨. `PENDING`·`SUBMITTED`가 같은 "처리 중"이다 */
export const CHAIN_JOB_LABEL: Record<string, string> = {
  PENDING: '처리 중',
  SUBMITTED: '처리 중',
  CONFIRMED: '처리 완료',
  FAILED: '처리 실패',
}

/** §5.1 `Dispute` → 화면 라벨 */
export const DISPUTE_STATUS_LABEL: Record<string, string> = {
  OPEN: '검토 중',
  RESOLVED: '처리 완료',
  REJECTED: '반려',
}

/** coin_08 `source` → 화면 라벨. 명세 설명("가입 자동 지급" / "관리자 수동 지급")을 옮겼다 */
export const GRANT_SOURCE_LABEL: Record<string, string> = {
  SIGNUP: '가입 기본 지급',
  ADMIN: '관리자 지급',
}

/**
 * 불변식 번호 → 짧은 이름. 화면설계 V-02·M-03이 "불변식 4행"이라 부르는 그 4개다.
 *
 * 본문 설명은 응답의 `note`(영문)를 그대로 쓰고, 여기서는 **한 줄 제목**만 만든다 —
 * 서버 문구를 우리가 번역해 덮으면 두 화면(V-02·M-03)이 다른 말을 하게 된다.
 */
export const INVARIANT_TITLE: Record<string, string> = {
  SUPPLY_EQUALS_MINTED: '① 총 발행량 = 지급(Minted) 합계',
  ESCROW_PER_SHOW: '② 공연별 에스크로 = 결제 − 환불 − 지급',
  RELEASED_EQUALS_RULE_RECALC: '③ 공연별 정산금 지급 합 = 재계산 분배액 합',
  SUPPLY_EQUALS_WALLETS_PLUS_ESCROW: '④ 총 발행량 = 지갑 잔액 합 + (에스크로 + 보증금)',
}

/**
 * 불변식 1건의 차액 문구. 응답에 `diff` 필드가 없어 여기서 만든다.
 *
 * · 불변식 1·4 — `expected`·`actual`의 차
 * · 불변식 3   — `maxDiff`(재계산 분배액과의 최대 오차, 1원 오차 0이 규칙)
 * · 불변식 2   — 금액 차가 아니라 **불일치 공연 수**(`mismatchedShows`)로 온다
 *
 * ⚠ **어느 지표를 읽을지는 `inv.no`로 정한다. 필드 유무로 추론하지 않는다**(MR !65 리뷰 지적).
 *   예전에는 `expected`·`actual`이 있으면 무조건 총액 차로 찍었다. 서버가 ②·③에도 총액
 *   비교용 `expected`/`actual`을 함께 실어 보내면 — 스키마상 못 할 이유가 없다 — ②는
 *   불일치 공연 수 대신, ③은 최대 오차 대신 엉뚱한 차액이 표시된다. 같은 응답을 읽는
 *   `features/verify/invariants.ts`의 `rowFromCoinInvariant`는 이미 `no`로 나눠 놓았다.
 *   두 화면이 같은 값을 다르게 읽으면 안 된다.
 *
 * 그 불변식의 지표가 없으면 `undefined` — 없는 숫자를 0으로 채우지 않는다.
 * (M-03 패널 안에 있던 것을 리뷰 반영과 함께 이 표로 옮겼다. 컴포넌트 파일은 컴포넌트만
 *  export해야 해서 그 자리에서는 테스트할 수 없었다.)
 */
export function invariantDiffText(inv: CoinSupplyInvariant): string | undefined {
  // ② 공연별 에스크로 — 단위가 원이 아니라 건수다
  if (inv.no === 2) {
    if (inv.mismatchedShows == null) return undefined
    const scope = inv.checkedShows != null ? ` / 검사 ${inv.checkedShows}건` : ''
    return `불일치 공연 ${inv.mismatchedShows}건${scope}`
  }

  // ③ 지급액과 재계산 분배액 — 개별 차가 아니라 최대 오차 하나로 온다
  if (inv.no === 3) {
    return inv.maxDiff != null ? `최대 오차 ${formatYoyo(inv.maxDiff)}` : undefined
  }

  // ①·④ 총액 대조
  if (inv.expected != null && inv.actual != null) {
    const diff = inv.actual - inv.expected
    return diff === 0 ? '차액 없음' : `차액 ${formatYoyo(Math.abs(diff))}`
  }
  return undefined
}
