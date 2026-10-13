/**
 * 409 CONFLICT `code` → 사용자 문구. **한 곳**에 모은 공통층(S15P21B204-121 항목 3).
 *
 * 정본 — 백엔드 `backend/.../common/error/ErrorCode.java`의 `HttpStatus.CONFLICT` 항목 ·
 *        `docs/design/api/openapi.yaml` · 응답 규격 §1(분기는 `code`로만)
 *
 * ── 왜 "추가만" 하는가 ─────────────────────────────────────────────────────
 * 지금 도메인별 code→문구 맵이 7개 있다(`features/studio/studioErrors.ts`·
 * `features/admin/adminMessages.ts`·`features/studio/settlementMessages.ts`·
 * `features/entry/entryErrors.ts`·`features/member/memberErrors.ts`·
 * `features/payment/errors.ts`·`features/verify/verifyErrors.ts`).
 * -121의 완료 기준은 "같은 코드는 어느 화면에서나 같은 문구"다. 그러려면 결국 그 7개가
 * 이 층에 위임해야 하지만, **지금은 고치지 않는다** — MR !109(`feat/fe/api-integration-2`)가
 * 미머지 상태로 `adminMessages.ts`를 수정 중이라 여기서 같은 파일을 건드리면 충돌한다.
 *
 * 그래서 이번엔 이 파일을 **추가만** 하고, 어긋남은 `errorMessages.test.ts`의 교차 검증이
 * 막는다(studio·admin 맵과 같은 코드면 같은 ko 문장인지 단언 — 도메인 맵을 수정하지 않고
 * 규약을 고정하는 유일한 방법이다).
 *
 * 위임 시점 — **!109 머지 직후.** 순서는 studio → admin → settlement → entry → 나머지.
 * 각 맵의 `MESSAGES`에서 409 코드 줄을 지우고 `conflictMessage(code, lang)` 폴백으로 넘긴다.
 * 409가 아닌 코드(400·401·403·404·429·5xx)와 화면 맥락 override(`inviteFailureText` 등)는
 * 도메인에 남는다 — 같은 코드가 화면에 따라 다른 뜻인 자리가 있다.
 *
 * ── 44개 중 35개만 담는 이유 ────────────────────────────────────────────────
 * `ErrorCode.java`의 CONFLICT 44개 가운데 9개는 **ERD v5에서 삭제된 도메인의 잔재**라
 * 프론트가 받을 경로가 없다. 담으면 있지도 않은 화면의 문구를 관리하게 되므로 뺀다 —
 * 혹시 내려오더라도 코드가 보이는 폴백으로 떨어져 운영자가 그 코드로 신고할 수 있다.
 *
 *   REDEEM_NOTHING_TO_REDEEM · REDEEM_ACCOUNT_NOT_REGISTERED · REDEEM_ALREADY_REQUESTED
 *   EXCHANGE_NOT_ALLOWED · EXCHANGE_OPTION_UNAVAILABLE
 *   NFT_MINT_PENDING · NFT_TRANSFER_NOT_ALLOWED
 *   TRANSFER_LINK_ALREADY_USED · TRANSFER_NOT_ALLOWED
 *
 * 백엔드가 409를 추가·삭제하면 `errorMessages.test.ts`(실제 enum과 Set 비교)가 깨진다.
 *
 * ── 문구의 출처 ────────────────────────────────────────────────────────────
 * ko — ① `studioErrors.MESSAGES` ② `adminMessages.MESSAGES`에 있으면 **그 문장 그대로**,
 *      ③ 없으면 `ErrorCode.java`의 한글 `msg`(백엔드가 사용자에게 내리는, 이미 검토된 문장).
 *      ①과 ②가 같은 코드에 다른 문장을 쓰면 studio를 택한다(`COMMON_CONFLICT` 한 건).
 * en — 출처가 없어 프론트가 썼다. **관객 화면 표시 규칙(-108) 확정 전이라 전부 검토 대상**이다.
 *      규칙: 한 문장 + 다음에 할 일, 코드 이름·기술 용어 금지.
 */

/**
 * 프론트가 문구를 책임지는 409 코드 35개.
 *
 * 값 목록과 타입을 **한 곳에서** 낸다(`types.ts`의 `CHAIN_TX_TYPES`와 같은 방식) —
 * 배열이 정본이고 타입은 파생이라 둘이 어긋나는 일이 구조적으로 불가능하다.
 * 런타임에서 모르는 코드를 걸러야 하는 곳은 이 배열(`isConflictCode`)을 쓴다.
 */
export const CONFLICT_CODES = [
  'COMMON_CONFLICT',
  'AUTH_SIGNUP_REQUIRED',
  'AUTH_EMAIL_DUPLICATED',
  'WALLET_GAS_INSUFFICIENT',
  'WALLET_BALANCE_INSUFFICIENT',
  'PERFORMANCE_INVALID_STATUS',
  'PERFORMANCE_ALREADY_ON_SALE',
  'PERFORMANCE_RULES_REQUIRED',
  'TEAM_ALREADY_JOINED',
  'TEAM_MIN_COUNT_NOT_MET',
  'TEAM_HAS_ACTIVE_PERFORMANCE',
  'RULE_NOT_AGREED_BY_ALL',
  'RULE_ALREADY_LOCKED',
  'RULE_HASH_MISMATCH',
  'RULE_SYNC_IN_PROGRESS',
  'RULE_COMMON_COST_EXCEEDS_REVENUE',
  'TICKET_SALE_NOT_STARTED',
  'TICKET_SALE_CLOSED',
  'TICKET_SOLD_OUT',
  'TICKET_PURCHASE_LIMIT_EXCEEDED',
  'TICKET_ALREADY_USED',
  'TICKET_CANCELED',
  'PAYMENT_ALREADY_PAID',
  'PAYMENT_AMOUNT_MISMATCH',
  'PAYMENT_INSUFFICIENT_BALANCE',
  'COIN_MINT_PENDING',
  'COIN_ESCROW_INSUFFICIENT',
  'COIN_RESERVE_MISMATCH',
  'REFUND_DEADLINE_PASSED',
  'REFUND_ALREADY_REQUESTED',
  'REFUND_AFTER_SETTLEMENT_LOCK',
  'ENTRY_ALREADY_ENTERED',
  'ENTRY_NOT_IN_TIME_WINDOW',
  'SETTLEMENT_NOT_LOCKED',
  'SETTLEMENT_DISPUTE_PERIOD',
  'SETTLEMENT_RELEASE_NOT_ACTIVE',
  'SETTLEMENT_ALREADY_RELEASED',
  'SETTLEMENT_AGGREGATE_MISMATCH',
  'FILE_ALREADY_BOUND',
] as const

export type ConflictCode = (typeof CONFLICT_CODES)[number]

/** §0.6 `Accept-Language`가 보내는 두 값. 그 밖의 값은 서버도 en으로 폴백한다 */
export type ErrorLang = 'en' | 'ko'

/** `memberErrors.ts`의 `{ en, ko }` 선례를 따른다 — 화면이 i18n 키 없이 바로 고를 수 있다 */
export interface ConflictText {
  en: string
  ko: string
}

/**
 * 코드 → 한 문장 + 다음 행동.
 *
 * ko 앞 괄호는 출처다: (studio) (admin) = 도메인 맵에서 **글자 그대로** 옮김,
 * (msg) = `ErrorCode.java`의 한글 `msg`. 여기 문장을 고치려면 출처를 함께 고쳐야 한다 —
 * 교차 검증 테스트가 studio·admin과의 어긋남을 잡는다.
 */
export const CONFLICT_MESSAGES: Record<ConflictCode, ConflictText> = {
  /* ── 공통 ──────────────────────────────────────────────────────── */
  // (studio) ⚠ admin은 같은 코드에 '이미 처리된 이의입니다. 목록을 다시 불러왔습니다.'를 쓴다.
  // admin_06의 409는 "이미 처리된 이의" 하나뿐이라 화면 맥락 override로 남겨야 할 자리다(위임 시 판단).
  COMMON_CONFLICT: {
    en: 'This was already handled, or that name is taken. Reload and check before trying again.',
    ko: '이미 처리됐거나 같은 이름의 팀이 있습니다.',
  },

  /* ── 회원·지갑 ─────────────────────────────────────────────────── */
  // (msg) LoginPage는 이 코드를 먼저 받아 가입 정보 입력으로 전환한다.
  AUTH_SIGNUP_REQUIRED: {
    en: 'Enter your details to finish signing up.',
    ko: '가입 정보를 입력해 주세요.',
  },
  // (msg) P1 — MVP C-02에는 이메일 폼이 없어 아직 발생하지 않는다
  AUTH_EMAIL_DUPLICATED: {
    en: 'That email is already signed up. Sign in with it instead.',
    ko: '이미 가입된 이메일입니다.',
  },
  // (msg) 사용자가 고칠 수 없다 — 다음 행동은 "요청"이다
  WALLET_GAS_INSUFFICIENT: {
    en: 'Your team wallet is out of network fees. Ask an administrator to top it up.',
    ko: '팀 지갑의 네트워크 수수료가 부족합니다. 관리자에게 충전을 요청해 주세요.',
  },
  // (msg) performance_13 — 보증금이 리더 지갑 잔액을 넘었다. P-03은 이 코드를 에러 패널이 아니라
  // §5.16 충전 안내로 바꿔 쓴다(studioErrors.isInsufficientBalanceCode). 여기 문구는 그 밖의 자리용이다.
  //
  // ⚠ **채우는 방법을 지시하지 않는다.** YoYo를 늘리는 버튼은 어디에도 없고(§1.2 원칙 12)
  // 유일한 유입은 관리자 지급(`MINT`)이다 — "충전한 뒤"라고 적으면 리더가 갈 곳이 없다.
  // 위 `WALLET_GAS_INSUFFICIENT`와 다른 점이다(그쪽은 "요청"이라는 갈 곳이 실제로 있다).
  // 서버 `ErrorCode.WALLET_BALANCE_INSUFFICIENT` 기본 msg와 같은 문장으로 맞춘다.
  WALLET_BALANCE_INSUFFICIENT: {
    en: 'The leader wallet balance is below the deposit.',
    ko: '리더 지갑의 YoYo 잔액이 부족합니다.',
  },

  /* ── 공연 ─────────────────────────────────────────────────────── */
  // (studio) ⚠ 한 코드가 보증금 미납·취소·종료를 함께 덮는다. 화면은 자기가 아는
  // depositStatus와 함께 판단한다(studioErrors.isDepositRequiredCode 주석)
  PERFORMANCE_INVALID_STATUS: {
    en: 'This show is not in a state that allows it. Finish the deposit first.',
    ko: '지금 공연 상태에서는 할 수 없습니다. 보증금 납부를 먼저 끝내 주세요.',
  },
  // (studio)
  PERFORMANCE_ALREADY_ON_SALE: {
    en: 'Sales have started, so this can no longer be edited. It is read-only now.',
    ko: '판매가 시작돼 더 이상 수정할 수 없습니다. 지금은 읽기 전용입니다.',
  },
  // (msg) performance_13 — 온체인 createShow가 rulesHash를 요구해 규칙이 보증금보다 앞이다.
  // P-03은 이 코드를 받으면 보증금 단계에 이미 있는 P-05 링크를 강조한다
  PERFORMANCE_RULES_REQUIRED: {
    en: 'Save the settlement rules before paying the deposit.',
    ko: '정산 규칙을 먼저 저장해야 보증금을 낼 수 있습니다.',
  },

  /* ── 팀 ───────────────────────────────────────────────────────── */
  // (studio)
  TEAM_ALREADY_JOINED: {
    en: 'That team has already joined or been invited. Pick another team.',
    ko: '이미 참여 중이거나 초대를 보낸 팀입니다.',
  },
  // (studio)
  TEAM_MIN_COUNT_NOT_MET: {
    en: 'A joint show needs at least two teams before sales start. Invite one more team.',
    ko: '공동 공연은 참여팀이 2팀 이상이어야 판매를 시작할 수 있습니다.',
  },
  // (studio) 팀 해산 차단. 서버는 세 가지 사유(진행 중 공연·미반환 보증금·미정산)를 같은 코드에
  // 다른 msg 로 내린다. 프론트는 code 로만 분기하므로(§0 공통 규약) 셋을 모두 덮는 문구를 쓴다.
  TEAM_HAS_ACTIVE_PERFORMANCE: {
    en: 'This team still has an open show, an unreturned deposit, or an unfinished settlement. Wrap those up before disbanding.',
    ko: '진행 중인 공연·반환되지 않은 보증금·끝나지 않은 정산이 남아 있어 팀을 해산할 수 없습니다.',
  },

  /* ── 정산 규칙 ─────────────────────────────────────────────────── */
  // (studio)
  RULE_NOT_AGREED_BY_ALL: {
    en: 'Every participating team has to agree before sales start. Check who has not agreed yet.',
    ko: '모든 참여팀이 동의해야 판매를 시작할 수 있습니다. 아직 동의하지 않은 팀을 확인해 주세요.',
  },
  // (studio)
  RULE_ALREADY_LOCKED: {
    en: 'Sales have started and the rules are locked. They are read-only now.',
    ko: '판매가 시작돼 규칙이 잠겼습니다. 지금은 읽기 전용입니다.',
  },
  // (studio)
  RULE_HASH_MISMATCH: {
    en: 'The rules changed in the meantime. Reload them and try again.',
    ko: '규칙이 그사이 바뀌었습니다. 새로 불러온 뒤 다시 시도해 주세요.',
  },
  // (studio) 사용자가 고칠 것이 없다 — 기다리면 풀린다
  RULE_SYNC_IN_PROGRESS: {
    en: 'The rules are still being recorded on the blockchain. Try again in a moment.',
    ko: '규칙을 블록체인에 반영하는 중입니다. 잠시 후 다시 시도해 주세요.',
  },
  // (msg)
  RULE_COMMON_COST_EXCEEDS_REVENUE: {
    en: 'Shared costs are larger than total sales. Lower the shared costs.',
    ko: '공통 비용이 총 판매 금액을 초과했습니다.',
  },

  /* ── 티켓 ─────────────────────────────────────────────────────── */
  // (msg)
  TICKET_SALE_NOT_STARTED: {
    en: 'Booking has not opened yet. Come back when it opens.',
    ko: '아직 예매가 시작되지 않았습니다.',
  },
  // (msg)
  TICKET_SALE_CLOSED: {
    en: 'Booking has closed. Browse other shows.',
    ko: '예매가 마감되었습니다.',
  },
  // (msg)
  TICKET_SOLD_OUT: {
    en: 'These tickets are sold out. Try another ticket type.',
    ko: '선택한 티켓이 모두 판매되었습니다.',
  },
  // (msg)
  TICKET_PURCHASE_LIMIT_EXCEEDED: {
    en: 'You have reached the limit for one person. Lower the quantity.',
    ko: '1인당 구매 가능 수량을 초과했습니다.',
  },
  // (msg) 검표 화면이 읽는다 — 다음 행동은 "다음 사람"이다
  TICKET_ALREADY_USED: {
    en: 'This ticket has already been used to enter. Check another ticket.',
    ko: '이미 입장 처리된 티켓입니다.',
  },
  // (msg)
  TICKET_CANCELED: {
    en: 'This ticket was canceled. Check your ticket list.',
    ko: '취소된 티켓입니다.',
  },

  /* ── 결제 ─────────────────────────────────────────────────────── */
  // (msg)
  PAYMENT_ALREADY_PAID: {
    en: 'This order is already paid. Open your tickets to see it.',
    ko: '이미 결제가 완료된 주문입니다.',
  },
  // (studio)
  PAYMENT_AMOUNT_MISMATCH: {
    en: 'What you signed does not match the request. Try again.',
    ko: '서명한 내용이 요청과 달라 처리하지 못했습니다. 다시 시도해 주세요.',
  },
  // (msg) 에러 패널이 아니라 §5.16 잔액 안내로 쓰인다(studioErrors.isInsufficientBalanceCode)
  PAYMENT_INSUFFICIENT_BALANCE: {
    en: 'Your balance is not enough. Top up and try again.',
    ko: '계좌 잔액이 부족합니다.',
  },

  /* ── 코인·에스크로 ─────────────────────────────────────────────── */
  // (msg)
  COIN_MINT_PENDING: {
    en: 'The payment is still being settled. Check again in a moment.',
    ko: '결제 예치 처리가 진행 중입니다. 잠시 후 다시 확인해 주세요.',
  },
  // (msg)
  COIN_ESCROW_INSUFFICIENT: {
    en: 'The amount held for this show is short of the payout total. An administrator is checking it.',
    ko: '정산 가능한 예치 금액이 부족합니다. 관리자 확인이 필요합니다.',
  },
  // (admin)
  COIN_RESERVE_MISMATCH: {
    en: 'The balances do not add up, so payouts are on hold. An administrator is checking it.',
    ko: '발행량 대사가 맞지 않아 코인 지급(mint)이 중단된 상태입니다. 원인 확인 후에 지급할 수 있습니다.',
  },

  /* ── 환불 ─────────────────────────────────────────────────────── */
  // (msg)
  REFUND_DEADLINE_PASSED: {
    en: 'The cancellation window has passed. Contact support if you still need help.',
    ko: '취소 가능 기간이 지났습니다.',
  },
  // (msg)
  REFUND_ALREADY_REQUESTED: {
    en: 'A cancellation is already in progress for this ticket. Check its status.',
    ko: '이미 취소 요청이 접수된 티켓입니다.',
  },
  // (msg)
  REFUND_AFTER_SETTLEMENT_LOCK: {
    en: 'Payouts are done for this show, so it cannot be canceled here. Contact support.',
    ko: '정산이 완료된 공연은 앱에서 취소할 수 없습니다. 고객센터로 문의해 주세요.',
  },

  /* ── 입장(검표) ───────────────────────────────────────────────── */
  // (msg) ⚠ entryErrors는 '이미 입장한 티켓입니다.'로 더 짧게 쓴다 — 위임 때 한 문장으로 맞춘다
  ENTRY_ALREADY_ENTERED: {
    en: 'This ticket has already been checked in. Check another ticket.',
    ko: '이미 입장 처리된 티켓입니다.',
  },
  // (msg)
  ENTRY_NOT_IN_TIME_WINDOW: {
    en: 'It is not entry time yet. Come back during the entry window.',
    ko: '입장 가능 시간이 아닙니다.',
  },

  /* ── 정산 ─────────────────────────────────────────────────────── */
  // (msg)
  SETTLEMENT_NOT_LOCKED: {
    en: 'The totals are not confirmed yet. Confirm and lock them first.',
    ko: '집계가 확정되지 않아 정산을 실행할 수 없습니다.',
  },
  // (msg) P-08은 남은 시간을 뒤에 붙인다(settlementMessages.formatRemaining)
  SETTLEMENT_DISPUTE_PERIOD: {
    en: 'The dispute window is still open. Wait until it closes, then try again.',
    ko: '이의제기 기간이 끝난 뒤 정산할 수 있습니다.',
  },
  // (msg)
  SETTLEMENT_RELEASE_NOT_ACTIVE: {
    en: 'Payouts have not run for this show yet. Check back after they do.',
    ko: '아직 정산이 실행되지 않았습니다.',
  },
  // (admin)
  SETTLEMENT_ALREADY_RELEASED: {
    en: 'Payouts are already finished for this show. Nothing here will change them.',
    ko: '이 공연의 정산은 이미 release가 끝났습니다. 이의를 처리해도 분배 결과는 바뀌지 않습니다.',
  },
  // (msg)
  SETTLEMENT_AGGREGATE_MISMATCH: {
    en: 'The totals did not match on review. An administrator is checking before payouts continue.',
    ko: '집계 검증에 실패했습니다. 관리자 확인 후 정산이 진행됩니다.',
  },

  /* ── 이미지 업로드 ─────────────────────────────────────────────── */
  // (studio) 같은 uploadId 를 다른 공연에 다시 쓴 경우. 같은 공연에 다시 저장하는 것은 허용된다.
  // 저장 파일명이 uuid 라 재사용이 아니라 다시 올리는 것이 정상 경로다.
  FILE_ALREADY_BOUND: {
    en: 'That image is already used by another show. Upload it again for this one.',
    ko: '이미 다른 공연에 사용된 이미지입니다. 새로 올려 주세요.',
  },
}

const CONFLICT_CODE_SET: ReadonlySet<string> = new Set(CONFLICT_CODES)

/** 이 층이 문구를 책임지는 코드인가. 폴백 9개와 409가 아닌 코드는 false다 */
export function isConflictCode(code: string | null | undefined): code is ConflictCode {
  return typeof code === 'string' && CONFLICT_CODE_SET.has(code)
}

/**
 * 표에 없는 코드의 폴백.
 *
 * **문구를 지어내지 않는다.** 코드 문자열을 괄호에 담아 그대로 보여준다 —
 * 사용자가 그 코드로 신고할 수 있어야 하고, 화면이 모르는 상황을 아는 척하면 안 된다.
 * ko 문장은 `studioErrors.studioMessage`·`settlementMessage`의 폴백과 **같은 문장**이다.
 */
function fallbackText(code: string, lang: ErrorLang): string {
  return lang === 'ko'
    ? `요청을 처리할 수 없습니다. (코드 ${code})`
    : `We couldn't process this request. (code ${code})`
}

/** 코드를 안내 문구로 옮긴다. 코드가 없으면(= 실패가 아니면) `undefined` */
export function conflictMessage(
  code: string | null | undefined,
  lang: ErrorLang,
): string | undefined {
  if (!code) return undefined
  return isConflictCode(code) ? CONFLICT_MESSAGES[code][lang] : fallbackText(code, lang)
}

/**
 * 서버 `msg`가 함께 왔으면 뒤에 붙인다(§5.5) — 대체하지 않는다. 둘 다 없으면 `undefined`.
 * `studioFailureText`·`adminFailureText`와 같은 규약이라 화면 코드를 그대로 옮길 수 있다.
 */
export function conflictFailureText(
  code: string | null | undefined,
  msg: string | null | undefined,
  lang: ErrorLang,
): string | undefined {
  const text = [conflictMessage(code, lang), msg].filter(Boolean).join(' ')
  return text || undefined
}
