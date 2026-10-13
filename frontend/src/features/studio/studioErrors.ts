import { studioText } from './studioLocale'
/**
 * 팀·공연·규칙 화면(P-02·P-03·P-04·P-05·P-06)의 ErrorCode → 안내 문구 표.
 *
 * 정본 — API 명세 v6 `docs/design/api/parts/02_team.yaml`·`04_performance.yaml`·`05_rule.yaml`의
 *        각 응답 4xx/5xx 설명 · 화면설계 v7 §4 P-02·P-03·P-04·P-05·P-06 **상태** 항목 · 응답 규격 §1
 *
 * **분기는 `code`로만 한다.** `msg`는 문구가 언제든 바뀌므로 분기 키가 아니다(규격 §1).
 * 서버가 `msg`를 주면 이 문구 **뒤에 덧붙여** 함께 보여준다(§5.5) — 대체하지 않는다.
 *
 * P-08은 같은 역할을 `settlementMessages.ts`가 한다. 두 표를 합치지 않은 이유 —
 * 정산 표는 `blockedReason`(사전 차단)까지 겸하고 `SETTLEMENT_*` 코드가 그쪽에만 있다.
 * 여기는 폼·서명 화면의 실행 실패만 다룬다. 겹치는 코드(`PERFORMANCE_NOT_OWNER` 등)는
 * 화면 맥락이 달라 문구도 다르다 — 정산은 "실행", 여기는 "저장·수정"이다.
 *
 * ⚠ §8.2 신설 제안 코드(`WALLET_NOT_LINKED`·`PERFORMANCE_DEPOSIT_REQUIRED`·
 * `PAYMENT_INSUFFICIENT_BALANCE`·`PAYMENT_SIGNATURE_REJECTED`)는 **아직 잠정 코드로 내려온다.**
 * 그래서 잠정 코드(`COMMON_FORBIDDEN`·`PERFORMANCE_INVALID_STATUS`·`COMMON_CONFLICT`)와
 * 신설 코드를 **둘 다** 표에 담는다. 서버가 어느 쪽을 보내도 같은 말을 해야 한다.
 *
 * ⚠ **performance_13(보증금 prepare)의 409는 셋으로 갈렸다**(-151). 잔액 부족은
 * `WALLET_BALANCE_INSUFFICIENT`, 규칙 미저장은 `PERFORMANCE_RULES_REQUIRED`, `COMMON_CONFLICT`는
 * **이미 `PAID`·`RETURNED`** 하나만 뜻한다. 화면이 `COMMON_CONFLICT`를 받고 자기 캐시 잔액으로
 * 원인을 추측하던 자리가 이것으로 사라졌다. 두 신설 코드의 문구는 공통층에 있다.
 *
 * **409 문구의 정본은 여기가 아니라 `shared/api/errorMessages.ts`다**(-121 항목 3).
 * 아래 표에서 409 줄 10개를 지우고 `conflictMessage`에 위임했다 — 지운 문장과 공통층 문장이
 * 글자 단위로 같았으므로 화면에 보이는 말은 그대로다. 남긴 409 override는
 * `STUDIO_CONFLICT_OVERRIDES`에 적고 `errorMessages.test.ts`가 그 목록을 고정한다.
 */

import type { ConflictCode } from '@/shared/api/errorMessages'
import { conflictMessage } from '@/shared/api/errorMessages'
import type { WalletError } from '@/shared/blockchain/WalletAdapter'

/** 화면이 특별 취급하는 코드. 문구만 바꾸는 것이 아니라 UI 자체가 달라지는 것들이다 */
export const StudioCode = {
  /** 403 — 팀 리더가 아님(team_03·team_04). 화면 전체를 권한 없음으로 덮는다 */
  FORBIDDEN: 'COMMON_FORBIDDEN',
  /** 404 — 존재하지 않는 teamId */
  TEAM_NOT_FOUND: 'TEAM_NOT_FOUND',
  /** 404 — 리더 지갑 미연결. §8.2가 `WALLET_NOT_LINKED`로 승격 제안한 자리 */
  WALLET_NOT_FOUND: 'WALLET_NOT_FOUND',
  WALLET_NOT_LINKED: 'WALLET_NOT_LINKED',
  /** 409 — 판매 시작 후 수정 시도. 폼을 읽기 전용으로 전환한다 */
  ALREADY_ON_SALE: 'PERFORMANCE_ALREADY_ON_SALE',
  /** 403 — 생성자 팀 리더가 아님 */
  NOT_OWNER: 'PERFORMANCE_NOT_OWNER',
  /** 409 — 보증금 미납 상태에서 다음 단계 진입. 보증금 패널로 스크롤 + 강조 */
  INVALID_STATUS: 'PERFORMANCE_INVALID_STATUS',
  DEPOSIT_REQUIRED: 'PERFORMANCE_DEPOSIT_REQUIRED',
  /** 400 — 과거 일시·일시 역전. 필드 에러로 붙인다 */
  DATE_INVALID: 'PERFORMANCE_DATE_INVALID',
  /** 400 — 1단계 또는 2단계 합이 10000이 아님. 합계 필드를 강조한다 */
  RATIO_SUM_INVALID: 'RULE_RATIO_SUM_INVALID',
  /** 409 — 판매 시작 이후 규칙 수정. 읽기 전용 */
  RULE_LOCKED: 'RULE_ALREADY_LOCKED',
  /** 409 — 잔액 부족. 에러가 아니라 §5.16 안내로 처리한다 */
  INSUFFICIENT_BALANCE: 'PAYMENT_INSUFFICIENT_BALANCE',
  /** 409 — 리더 지갑 잔액 < 보증금(performance_13 전용 코드, §16.1 · -151). §5.16 안내 */
  WALLET_BALANCE_INSUFFICIENT: 'WALLET_BALANCE_INSUFFICIENT',
  /** 409 — 정산 규칙 미저장(performance_13 전용 코드, §16.1 · -151). P-05로 보낸다 */
  RULES_REQUIRED: 'PERFORMANCE_RULES_REQUIRED',
  CONFLICT: 'COMMON_CONFLICT',
  /** 409 — 서명 거부. **에러 UI로 처리하지 않는다**(§5.14 ④') */
  SIGNATURE_REJECTED: 'PAYMENT_SIGNATURE_REJECTED',
  /**
   * 폴링 상한까지 job이 확정되지 않음(화면이 만드는 코드다 — 서버 응답이 아니다).
   * 실패가 아니라 **모르는 상태**라, 같은 서명을 다시 내보낼 수 없게 잠근다.
   */
  CHAIN_TIMEOUT: 'CHAIN_TX_TIMEOUT',
  /**
   * 지갑이 아직 계정을 돌려주지 않았다 — **화면이 만드는 코드다**(`CHAIN_TX_TIMEOUT`과 같다).
   *
   * 어댑터의 `WalletError('NOT_CONNECTED')`를 이 코드로 옮긴다. 예전에는
   * `COMMON_INTERNAL_ERROR` + 영어 SDK 문장("Web3Auth wallet did not provide an account")이
   * 그대로 떠서, 사용자가 할 수 있는 일("잠시 뒤 다시")이 문구에 없었다(D-77).
   */
  WALLET_NOT_READY: 'WALLET_NOT_READY',

  /* ── P-04 참여팀 관리 ─────────────────────────────────────────────── */
  /** 409 — 이미 참여·초대 중인 팀(performance_07·08) */
  ALREADY_JOINED: 'TEAM_ALREADY_JOINED',

  /* ── P-06 규칙 동의·판매 시작 ─────────────────────────────────────── */
  /** 409 — `PENDING`·`SIGNING` 팀이 남아 있음(rule_04). 미동의 팀을 강조한다 */
  NOT_AGREED_BY_ALL: 'RULE_NOT_AGREED_BY_ALL',
  /** 409 — 공동 공연인데 참여팀 2팀 미만(rule_04) */
  MIN_COUNT_NOT_MET: 'TEAM_MIN_COUNT_NOT_MET',
  /** 409 — 요청 해시 ≠ 서버 현재 해시(rule_03·04·05). 새로고침 안내 */
  HASH_MISMATCH: 'RULE_HASH_MISMATCH',
  /**
   * 409 — 보고된 tx가 규칙 해시·이벤트와 다름. §8.2가 `PAYMENT_TX_MISMATCH`로 승격 제안했고
   * 지금은 `PAYMENT_AMOUNT_MISMATCH`로 내려온다(rule_05 4xx 표). **둘 다** 표에 담는다
   */
  TX_MISMATCH: 'PAYMENT_TX_MISMATCH',
  AMOUNT_MISMATCH: 'PAYMENT_AMOUNT_MISMATCH',
  /** 403 — 참여팀 소속이 아님(rule_02·rule_03) */
  NOT_PARTICIPANT: 'SETTLEMENT_NOT_PARTICIPANT',
} as const

/**
 * 코드 → 한 문장 + 다음 행동.
 *
 * 상태를 색으로만 알리지 않기 위해(§1.2) 배지·비활성 버튼 옆에 이 문구가 함께 붙는다.
 *
 * **409는 여기 적지 않는다.** `conflictMessage`(공통층)가 낸다 — 아래 `studioMessage` 참고.
 * 이 화면에서만 다르게 말해야 하는 409가 생기면 여기에 적고 `STUDIO_CONFLICT_OVERRIDES`에도 넣는다.
 */
const messages = (): Record<string, string> => ({
  /* ── 팀(team_01·03·04) ─────────────────────────────────────────── */
  TEAM_NOT_FOUND: studioText(
    '존재하지 않는 팀입니다. 대시보드에서 팀을 다시 골라 주세요.',
    'This team does not exist. Choose another team from the dashboard.',
  ),
  WALLET_NOT_FOUND: studioText(
    '리더 지갑이 아직 등록되지 않았습니다. 지갑을 먼저 등록해 주세요.',
    'The team leader has not connected a wallet yet. Connect it first.',
  ),
  WALLET_NOT_LINKED: studioText(
    '리더 지갑이 아직 등록되지 않았습니다. 지갑을 먼저 등록해 주세요.',
    'The team leader has not connected a wallet yet. Connect it first.',
  ),
  // team_01 403은 "지갑이 관리자 정지(SUSPENDED)", team_03·04 403은 "리더가 아님"이다.
  // 한 코드에 두 원인이 묶여 있어 문구가 둘을 모두 덮게 썼다(§8.2 분리 제안 대상)
  COMMON_FORBIDDEN: studioText(
    '이 팀의 리더만 할 수 있습니다. 지갑이 이용 정지된 경우에도 막힙니다.',
    'Only the team leader can perform this action. Suspended wallets are also blocked.',
  ),

  /* ── 공연(performance_01·04·05·13·14) ──────────────────────────── */
  PERFORMANCE_NOT_FOUND: studioText('존재하지 않는 공연입니다.', 'This show does not exist.'),
  PERFORMANCE_NOT_OWNER: studioText(
    '공연을 만든 팀의 리더만 수정할 수 있습니다.',
    'Only the host team leader can edit this show.',
  ),
  PERFORMANCE_DATE_INVALID: studioText(
    '공연 일시를 확인해 주세요. 과거 일시이거나 종료가 시작보다 빠릅니다.',
    'Check the show times. The start must be in the future and the end must follow the start.',
  ),
  PERFORMANCE_DEPOSIT_REQUIRED: studioText(
    '보증금을 먼저 납부해야 다음 단계로 갈 수 있습니다.',
    'Pay the deposit before continuing.',
  ),
  TICKET_OPTION_NOT_FOUND: studioText(
    '이 공연에 없는 티켓 옵션입니다. 목록을 새로 불러와 주세요.',
    'This ticket type does not belong to this show. Reload the list.',
  ),
  PAYMENT_AMOUNT_MISMATCH: studioText(
    '서명한 내용이 요청과 달라 처리하지 못했습니다. 다시 시도해 주세요.',
    'The signature does not match the request. Please try again.',
  ),

  /* ── 참여팀(performance_07·08·09·10) ───────────────────────────── */
  // performance_09 400은 "주최 팀 제외 시도", performance_07 400은 "상한 8팀 초과"다.
  // 한 코드에 두 원인이 묶여 있어 화면 맥락별 문구는 아래 `inviteFailureText`가 덮는다
  SETTLEMENT_NOT_PARTICIPANT: studioText(
    '이 공연의 참여팀만 볼 수 있습니다.',
    'Only participating teams can view this page.',
  ),

  /* ── 규칙(rule_01·02·03·04·05) ─────────────────────────────────── */
  RULE_RATIO_SUM_INVALID: studioText(
    '비율 합계가 10000bp(100%)가 아닙니다. 합계를 맞춰 주세요.',
    'The shares must add up to 10,000bp (100%).',
  ),
  PAYMENT_TX_MISMATCH: studioText(
    '서명한 내용이 요청과 달라 처리하지 못했습니다. 처음부터 다시 시도해 주세요.',
    'The signed details do not match the request. Start again.',
  ),

  /* ── 공통 ──────────────────────────────────────────────────────── */
  COMMON_VALIDATION_FAILED: studioText('입력값을 확인해 주세요.', 'Check the entered values.'),
  COMMON_NOT_FOUND: studioText(
    '요청한 정보를 찾을 수 없습니다.',
    'The requested information was not found.',
  ),
  COMMON_INTERNAL_ERROR: studioText('잠시 후 다시 시도해 주세요.', 'Please try again in a moment.'),
  COMMON_EXTERNAL_SERVICE_ERROR: studioText(
    '체인 조회가 실패했습니다. 잠시 후 다시 시도해 주세요.',
    'The blockchain lookup failed. Please try again shortly.',
  ),
  CHAIN_GAS_INSUFFICIENT: studioText(
    '운영 지갑 가스가 부족합니다. 관리자 확인 중입니다.',
    'The operating wallet has insufficient gas. An administrator is checking.',
  ),
  /*
   * ⚠ "계속 확인합니다"라고 말하지 않는다 — 이 문구가 나오는 순간이 **확인을 그만둔 순간**이다.
   * `useChainJob`은 상한(`CHAIN_JOB_POLL_TIMEOUT_MS` 120초)에 닿으면 폴링을 끄고, 이 표를 쓰는
   * 화면(P-03 보증금·공연 취소 · P-05 · P-06)에는 뒤이어 다시 보는 조회가 없다. 기다리라고 하면
   * 바뀌지 않을 화면을 보게 되므로 실제로 되는 다음 행동을 적는다.
   *
   * P-08은 다르다 — 정산 조회가 10초마다 갱신되므로(`useSettlement`) `settlementMessages`의
   * 같은 코드는 "계속 확인합니다"가 사실이다. 두 문구를 합치지 않는 이유다.
   */
  CHAIN_TX_TIMEOUT: studioText(
    '온체인 확정이 늦어지고 있습니다. 잠시 뒤 새로고침해 상태를 확인해 주세요.',
    'On-chain confirmation is taking longer than expected. Refresh in a moment to check the status.',
  ),
  /*
   * 지갑 준비 지연(D-77). **블록체인 용어를 쓰지 않는다** — 공연자 화면이라 지갑은 말할 수
   * 있지만(§1.2 원칙 11) 원인이 SDK 내부라 사용자가 할 수 있는 일만 적는다.
   * 마운트 게이트(`useWalletReady`)가 대부분을 먹어 이 문구는 상한(3.2초)을 넘긴 경우에만 뜬다.
   */
  WALLET_NOT_READY: studioText(
    '지갑이 아직 준비되지 않았습니다. 잠시 뒤 다시 눌러 주세요.',
    'Your wallet is not ready yet. Try again in a moment.',
  ),
})

/**
 * 이 화면에서만 다른 문장을 쓰는 409 코드 — **지금은 없다.**
 *
 * 여기 없는 409 코드는 공통층(`CONFLICT_MESSAGES`) 문장을 쓴다. 이 목록은
 * `errorMessages.test.ts`가 "override는 실제로 공통층과 다른 문장이어야 한다"로 고정한다 —
 * 같은 문장이 되면 테스트가 깨지고, 그때 override를 지우면 된다.
 */
export const STUDIO_CONFLICT_OVERRIDES: readonly ConflictCode[] = []

/**
 * 코드를 안내 문구로 옮긴다. 코드가 없으면 `undefined`.
 *
 * 409는 공통층이 낸다(`conflictMessage`) — 같은 코드가 어느 화면에서나 같은 말을 하게 한다.
 * 위 표는 409가 아닌 코드와 이 화면 전용 override만 갖는다.
 *
 * ⚠ 어느 표에도 없는 코드는 **문구를 지어내지 않고** 코드 문자열을 괄호에 담아 그대로 보여준다.
 * 운영자가 그 코드로 신고할 수 있어야 하고, 화면이 모르는 상황을 아는 척하면 안 된다.
 * 공통층 폴백이 이 파일이 쓰던 것과 **같은 문장**이라 폴백 분기를 따로 두지 않는다.
 */
export function studioMessage(code: string | null | undefined): string | undefined {
  if (!code) return undefined
  return (
    messages()[code] ??
    studioText(conflictMessage(code, 'ko') ?? '', conflictMessage(code, 'en') ?? '')
  )
}

/** 서버 `msg`가 함께 왔으면 뒤에 붙인다(§5.5). 둘 다 없으면 `undefined` */
export function studioFailureText(
  code: string | null | undefined,
  msg?: string | null,
): string | undefined {
  const text = [studioMessage(code), msg].filter(Boolean).join(' ')
  return text || undefined
}

/**
 * 지금 화면을 **읽기 전용**으로 바꿔야 하는 코드인가.
 *
 * P-03 `PERFORMANCE_ALREADY_ON_SALE`(판매 시작 후 수정 시도 시 읽기 전용 전환),
 * P-05 `RULE_ALREADY_LOCKED`(판매 시작 후 읽기 전용) — 두 화면의 **상태** 항목이 정한 동작이다.
 */
export function isLockedCode(code: string | null | undefined): boolean {
  return code === StudioCode.ALREADY_ON_SALE || code === StudioCode.RULE_LOCKED
}

/**
 * 보증금 미납 때문에 막힌 코드인가 — P-03이 보증금 패널로 스크롤·강조한다.
 *
 * **P-05는 이 판정을 쓰지 않는다.** 2026-09-18 부터 규칙 저장이 보증금보다 앞이라
 * (서버 순서 `규칙 → createShow → 보증금`) 규칙 화면에서 보증금 미납으로 막을 일이 없다.
 *
 * ⚠ `PERFORMANCE_INVALID_STATUS`는 **보증금 미납 말고 다른 원인**(CANCELLED·ENDED)에도 쓰인다.
 * 코드만으로는 구분되지 않아, 화면은 자기가 아는 `depositStatus`와 함께 판단한다.
 * §8.2가 `PERFORMANCE_DEPOSIT_REQUIRED`를 전용 코드로 승격하면 이 애매함이 사라진다.
 */
export function isDepositRequiredCode(code: string | null | undefined): boolean {
  return code === StudioCode.DEPOSIT_REQUIRED || code === StudioCode.INVALID_STATUS
}

/**
 * 잔액 부족인가 — 에러 패널이 아니라 §5.16 안내로 처리한다.
 *
 * **`COMMON_CONFLICT`는 더 이상 여기 없다**(-151). performance_13이 잔액 부족·규칙 미저장·
 * 이미 납부를 한 코드로 묶어 두던 동안에는 화면이 `depositStatus`와 자기가 아는 잔액으로
 * 원인을 **추측**했다. 서버가 코드를 갈랐으므로 추측을 지운다 — 그 추측은 캐시 잔액이 서버가
 * 방금 읽은 값보다 낮을 때 규칙 409를 충전 안내로 바꿔 놓았다.
 *
 * 두 코드를 함께 보는 이유는 이 파일 다른 자리와 같다 — 잠정 코드(`PAYMENT_INSUFFICIENT_BALANCE`)와
 * 신설 코드(`WALLET_BALANCE_INSUFFICIENT`) 중 어느 쪽이 와도 같은 말을 해야 한다.
 */
export function isInsufficientBalanceCode(code: string | null | undefined): boolean {
  return code === StudioCode.INSUFFICIENT_BALANCE || code === StudioCode.WALLET_BALANCE_INSUFFICIENT
}

/**
 * 정산 규칙을 아직 저장하지 않아 막혔는가(performance_13 409 · -151).
 *
 * 화면은 규칙 저장 여부를 조회하지 않으므로 **서버가 말해 줄 때만** 안다. 보증금 단계에 이미
 * 있는 P-05 링크를 실패 문구와 함께 강조하는 것이 이 판정의 전부다.
 */
export function isRulesRequiredCode(code: string | null | undefined): boolean {
  return code === StudioCode.RULES_REQUIRED
}

/**
 * 온체인 확정을 기다리다 폴링 상한에 닿았는가.
 *
 * **실패가 아니다.** 우리가 보기를 멈췄을 뿐 tx는 여전히 확정될 수 있다. 그래서 화면은
 * 초기 상태로 돌아가지 않는다 — 돌아가면 같은 서명을 또 내보내고, 먼저 보낸 tx가 뒤늦게
 * 확정되면 **보증금을 두 번 내게 된다**(서버 `deposit_status`가 아직 UNPAID라 prepare가 통과한다).
 */
export function isChainTimeoutCode(code: string | null | undefined): boolean {
  return code === StudioCode.CHAIN_TIMEOUT
}

/** 서명 거부인가 — §5.14 ④' "에러가 아니다". 초기 상태로 되돌리기만 한다 */
export function isSignatureRejectedCode(code: string | null | undefined): boolean {
  return code === StudioCode.SIGNATURE_REJECTED
}

/**
 * 지갑 실패(`WalletError`)를 화면이 쓰는 `{ ok:false, code, msg }`로 옮긴다 — P-03·P-06 공용.
 *
 * `NOT_CONNECTED`를 따로 가르는 것이 이 함수의 존재 이유다(D-77). 두 화면이 그것을
 * `COMMON_INTERNAL_ERROR` + 어댑터의 영어 문장으로 넘겨, "지갑이 아직 준비되지 않았다"는
 * 실제 원인이 "잠시 후 다시 시도해 주세요 Web3Auth wallet did not provide an account."로 보였다.
 *
 * `msg`에 SDK 문장을 그대로 실어 보내지 않는다 — 우리가 아는 원인이면 우리 문구로 말한다.
 */
export function walletErrorFailure(error: WalletError): {
  ok: false
  code: string
  msg?: string
} {
  if (error.kind === 'USER_REJECTED') return { ok: false, code: StudioCode.SIGNATURE_REJECTED }
  // 세션 복원·계정 조회가 아직인 상태. 재시도가 유일한 다음 행동이고 문구가 그것을 담는다
  if (error.kind === 'NOT_CONNECTED') return { ok: false, code: StudioCode.WALLET_NOT_READY }
  return { ok: false, code: 'COMMON_INTERNAL_ERROR', msg: error.message }
}

/**
 * 보고된 tx가 요청과 다른가 — P-06 rule_05의 receipt·이벤트 검증 실패.
 * 잠정 코드(`PAYMENT_AMOUNT_MISMATCH`)와 §8.2 신설 코드(`PAYMENT_TX_MISMATCH`)를 함께 본다.
 */
export function isTxMismatchCode(code: string | null | undefined): boolean {
  return code === StudioCode.TX_MISMATCH || code === StudioCode.AMOUNT_MISMATCH
}

/**
 * P-04 **참여팀 초대**(performance_07) 실패 문구.
 *
 * 같은 코드가 화면 맥락에 따라 다른 뜻이 된다 — 초대에서 `WALLET_NOT_FOUND`는 **내** 지갑이
 * 아니라 **초대 대상 팀 리더**의 지갑이고, `TEAM_NOT_FOUND`도 내 팀이 아니라 상대 팀이다.
 * 공통 표 문구("지갑을 먼저 등록해 주세요")를 그대로 쓰면 자기 지갑을 확인하러 가게 된다.
 * 그래서 이 맥락에서만 문구를 덮고, 나머지는 공통 표로 넘긴다.
 */
export function inviteFailureText(
  code: string | null | undefined,
  msg?: string | null,
): string | undefined {
  const override: Record<string, string> = {
    // performance_07 404 — 대상 팀 리더 지갑 미연결. 초대한 사람이 할 수 있는 일은 요청뿐이다
    WALLET_NOT_FOUND: studioText(
      '초대할 팀의 리더가 아직 지갑을 등록하지 않았습니다. 등록을 요청해 주세요.',
      'Ask the invited team leader to connect a wallet first.',
    ),
    WALLET_NOT_LINKED: studioText(
      '초대할 팀의 리더가 아직 지갑을 등록하지 않았습니다. 등록을 요청해 주세요.',
      'Ask the invited team leader to connect a wallet first.',
    ),
    TEAM_NOT_FOUND: studioText(
      '존재하지 않는 팀 ID입니다. 번호를 다시 확인해 주세요.',
      'This team ID does not exist. Check the number.',
    ),
    // 400의 두 원인(teamId 누락 / 상한 8팀 초과) 중 화면이 미리 막지 못하는 쪽을 함께 적는다
    COMMON_VALIDATION_FAILED: studioText(
      '팀 ID를 확인해 주세요. 참여팀은 최대 8팀입니다.',
      'Check the team ID. A show can have up to eight teams.',
    ),
  }
  const base = code ? override[code] : undefined
  if (!base) return studioFailureText(code, msg)
  return [base, msg].filter(Boolean).join(' ')
}

/**
 * P-03 **보증금 납부** 실패 문구. **한 번의 납부가 performance_13·14 두 API 를 거치므로
 * 이 함수는 둘의 실패를 모두 받는다**(`PerformanceEditPage.onPayDeposit`).
 *
 * -151부터 세 원인이 **코드로 갈렸다.** 규칙 미저장은 `PERFORMANCE_RULES_REQUIRED`,
 * 잔액 부족은 `WALLET_BALANCE_INSUFFICIENT`, 앞 둘은 공통층 문구가 그대로 맞아 덮지 않는다.
 * `COMMON_CONFLICT`만 남는다 — 공통 표 문구는 팀 이름 중복을 말해 이 화면에서 읽으면 엉뚱해진다.
 *
 * ⚠ **그 `COMMON_CONFLICT`를 "이미 납부됨"으로 못박지 않는다.** 13에서는 그 뜻이지만 14에서는
 * createShow 미확정(`PerformanceService.depositSignedTx`)과 RLP 대상 불일치
 * (`UserSignedTxService`)도 같은 코드로 온다. 못박으면 **아직 내지도 않은 보증금에 "이미
 * 납부되었다"**가 뜨거나, 서버 `msg`("…등록이 끝나지 않았습니다")와 정면으로 모순된 두 문장이
 * 이어진다. 그래서 두 API 의 원인을 함께 덮는 문장만 쓰고 **구체적인 사유는 서버 `msg`에 맡긴다**
 * (§5.5). 13의 "이미 납부"는 화면이 `depositStatus`로 이미 안다.
 *
 * ⚠ 서버가 아직 안 바뀐 동안에는 옛 `COMMON_CONFLICT`가 규칙 미저장·잔액 부족에도 온다.
 * 그래도 막다른 곳은 아니다 — 서버 `msg`가 사유를 담아 이 문구 뒤에 붙고, 보증금 단계에는
 * P-05 링크가 상시 떠 있다.
 */
export function depositFailureText(
  code: string | null | undefined,
  msg?: string | null,
): string | undefined {
  const override: Record<string, string> = {
    COMMON_CONFLICT: studioText(
      '지금은 보증금을 낼 수 없는 상태입니다. 새로고침해 상태를 다시 확인해 주세요.',
      'The deposit cannot be paid right now. Refresh to check its status.',
    ),
    // performance_14 는 `prepare` 를 건너뛴 보고를 404 로 막는다(명세 2466행). 공통 표 문구
    // "요청한 정보를 찾을 수 없습니다."를 그대로 쓰면 **공연이 없다는 오해**를 산다 — 공연은
    // 멀쩡하고 납부를 시작한 기록만 없다. 서버 `msg` 가 뒤에 붙어 할 행동을 말한다(§5.5)
    COMMON_NOT_FOUND: studioText(
      '보증금 납부를 처음부터 다시 시작해 주세요.',
      'Start the deposit payment over.',
    ),
  }
  const base = code ? override[code] : undefined
  if (!base) return studioFailureText(code, msg)
  return [base, msg].filter(Boolean).join(' ')
}

/**
 * P-06 **규칙 동의**(rule_03·rule_05) 실패 문구.
 *
 * `COMMON_CONFLICT`가 여기서는 **"이미 진행 중"**이다(rule_03 — 내 팀이 이미 `SIGNING`·`AGREED`).
 * 공통층 문장("이미 처리됐거나 같은 이름의 팀이 있습니다")은 팀 이름 중복까지 덮는 말이라
 * 이 화면에서 읽으면 엉뚱해진다 — `depositFailureText`가 같은 이유로 같은 코드를 덮는다.
 *
 * ⚠ **이 문구가 없던 것이 D-77의 세 번째 원인이었다.** 화면은 CONFLICT를 서명 거부와 한 묶음으로
 * 보고 **문구 없이** 초기 상태로 되돌렸다. 사용자에게는 "안 눌렸다"로 보여 다시 누르게 됐고,
 * 그 클릭이 또 CONFLICT를 만들었다. 실패는 언제나 한 줄을 남긴다(§1.2 원칙 6은 **취소**에만 쓴다).
 */
export function agreeFailureText(
  code: string | null | undefined,
  msg?: string | null,
): string | undefined {
  const override: Record<string, string> = {
    COMMON_CONFLICT: studioText(
      '이미 처리 중입니다. 잠시 뒤 현황이 갱신됩니다.',
      'This is already being processed. The status will refresh shortly.',
    ),
  }
  const base = code ? override[code] : undefined
  if (!base) return studioFailureText(code, msg)
  return [base, msg].filter(Boolean).join(' ')
}

/**
 * P-10 **공연 취소**(performance_12) 실패 문구.
 *
 * `PERFORMANCE_INVALID_STATUS`가 여기서는 보증금이 아니라 **취소할 수 없는 상태**다
 * (performance_12 409 — 판매 전 `DRAFT`·`PENDING_AGREEMENT` 또는 이미 `CANCELLED`).
 * 공통 표 문구는 보증금 납부를 안내하므로 이 맥락에서만 덮는다.
 */
export function cancelShowFailureText(
  code: string | null | undefined,
  msg?: string | null,
): string | undefined {
  const override: Record<string, string> = {
    PERFORMANCE_INVALID_STATUS:
      '지금 상태에서는 취소할 수 없습니다. 판매 전이거나 이미 종료·취소된 공연입니다.',
    PERFORMANCE_NOT_OWNER: '공연 취소는 공연을 만든 팀의 리더만 할 수 있습니다.',
    // performance_12 — release 뒤에는 에스크로가 팀 지갑으로 나가 온체인에서 되돌릴 수 없다
    SETTLEMENT_ALREADY_RELEASED: '이미 정산이 완료된 공연은 취소할 수 없습니다.',
    // 409의 두 원인(같은 키에 다른 사유 / 이미 취소 처리 중)을 함께 덮는다
    COMMON_CONFLICT: '취소 처리가 이미 진행 중입니다. 잠시 후 상태를 다시 확인해 주세요.',
    COMMON_VALIDATION_FAILED: '취소 사유를 1자 이상 200자 이내로 적어 주세요.',
  }
  const base = code ? override[code] : undefined
  if (!base) return studioFailureText(code, msg)
  return [base, msg].filter(Boolean).join(' ')
}

/**
 * P-04 **검표 페이지 링크**(performance_10) 실패 문구.
 *
 * `PERFORMANCE_INVALID_STATUS`가 여기서는 보증금이 아니라 **공연 취소**를 뜻한다(performance_10 409).
 * 공통 표 문구는 보증금 이야기를 하므로 이 맥락에서만 덮는다.
 */
export function entryLinkFailureText(
  code: string | null | undefined,
  msg?: string | null,
): string | undefined {
  const override: Record<string, string> = {
    PERFORMANCE_INVALID_STATUS: studioText(
      '취소된 공연이라 검표 링크를 쓸 수 없습니다.',
      'Check-in is unavailable for cancelled shows.',
    ),
    COMMON_FORBIDDEN: studioText(
      '이 공연의 참여팀만 검표 링크를 볼 수 있습니다.',
      'Only participating teams can view the check-in link.',
    ),
    PERFORMANCE_NOT_OWNER: studioText(
      '검표 링크 재발급은 공연을 만든 팀의 리더만 할 수 있습니다.',
      'Only the host team leader can regenerate the check-in link.',
    ),
  }
  const base = code ? override[code] : undefined
  if (!base) return studioFailureText(code, msg)
  return [base, msg].filter(Boolean).join(' ')
}
