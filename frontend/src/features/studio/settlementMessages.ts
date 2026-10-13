import { studioText } from './studioLocale'
/**
 * 정산 액션이 **막힌 이유**와 **실패한 이유**를 안내 문구로 옮기는 표 — P-08 전용.
 *
 * 정본 — 화면설계 v6 §4 P-08 **상태** 항목 · API 명세 v6 `settlement_02~06`의 4xx 설명 ·
 *        응답 규격 §1(분기는 `code`로만)
 *
 * **한 표를 두 자리에서 쓴다.**
 *   ① 사전 차단 — `settlement_01` 응답의 `actions.{aggregate,lock,dispute,release}.blockedReason`
 *   ② 사후 실패 — 같은 액션을 실행했을 때 돌아온 4xx 응답의 `code`
 * 두 값은 **같은 ErrorCode 문자열 공간**이므로, 문구를 한 곳에 모아야 "왜 눌리지 않는가"와
 * "왜 실패했는가"가 같은 말을 한다. 두 벌로 나누면 같은 코드에 다른 설명이 붙는다.
 *
 * **`available: true`여도 실행은 409로 실패할 수 있다.** 집계 대사(`SETTLEMENT_AGGREGATE_MISMATCH`)와
 * release 직전 에스크로 잔액(`COIN_ESCROW_INSUFFICIENT`)은 체인을 읽어야 알 수 있어 조회 시점에
 * 미리 판단하지 않는다(BE 확인). 그래서 화면은 낙관적 UI를 쓰지 않고 실행 결과로만 상태를 갱신한다.
 *
 * 문구는 `msg`를 대체하지 않는다 — 서버가 `msg`를 주면 그것도 함께 보여줄 수 있다(§5.5).
 * 여기 문구는 **코드만 있고 문구가 없을 때**(= `blockedReason`)를 위한 것이다.
 *
 * **409 문구의 정본은 `shared/api/errorMessages.ts`지만, 이 표의 409 아홉 줄은 남긴다**(-121 항목 3).
 * 위 ①(사전 차단) 때문이다 — 이 화면의 문장은 "실패했다"가 아니라 "왜 안 눌리는가"까지
 * 설명해야 하고, 다음에 무엇을 해야 풀리는지(집계 확정 → 정산 잠금 같은 순서)를 담는다.
 * 공통층 문장은 관객·공연자 화면용이라 그만큼 짧다. 통일하지 않은 것은 결정이며
 * 남긴 목록은 `SETTLEMENT_CONFLICT_OVERRIDES`가, 그 목록이 실제로 공통층과 다른 문장인지는
 * `errorMessages.test.ts`가 고정한다. 표에 **없는** 409는 이제 공통층 문장으로 떨어진다.
 */

import type { ConflictCode } from '@/shared/api/errorMessages'
import { conflictMessage } from '@/shared/api/errorMessages'

/**
 * 정산 액션 5종. `SettlementActions`의 키와 같다(settlement_01).
 *
 * `approve`(조기 동의, API-settlement-08)는 **참여팀 리더**가 누르는 액션이라
 * 운영자 3종(aggregate·lock·release)과 부류가 다르다 — 이의제기와 같은 쪽이다.
 */
export type SettlementActionKey = 'aggregate' | 'lock' | 'dispute' | 'release' | 'approve'

/** 액션별 사람이 읽는 이름. 확인 모달 제목·실패 안내에서 같은 단어를 쓴다 */
export const SETTLEMENT_ACTION_LABEL: Record<SettlementActionKey, [string, string]> = {
  aggregate: ['집계 확정', 'Confirm aggregation'],
  lock: ['정산 잠금', 'Lock settlement'],
  dispute: ['이의제기', 'Submit dispute'],
  release: ['정산금 지급', 'Release payouts'],
  approve: ['정산 동의', 'Approve settlement'],
}

/** 문구 표에 넘길 부가 정보. 지금은 이의제기 마감뿐이다 */
export interface SettlementMessageContext {
  /** `Settlement.disputeClosesAt`(ISO). `SETTLEMENT_DISPUTE_PERIOD`의 남은 시간 계산에 쓴다 */
  disputeClosesAt?: string | null
}

/**
 * 마감까지 남은 시간 문구. 48시간 이의제기 기간이 얼마나 남았는지 사람이 읽는 단위로 만든다.
 *
 * P-08 **상태** 항목이 `SETTLEMENT_DISPUTE_PERIOD`에 "남은 시간 표시(48h)"를 못박았다.
 * 서버는 남은 시간을 초로 주지 않고 마감 시각(`disputeClosesAt`)만 주므로 여기서 뺀다 —
 * 시각 자체는 표시에 그대로 쓰이고(§5.13), 여기서는 **차이**만 만든다.
 *
 * 이미 지났거나 값이 없으면 `undefined`다. "0분 남음"이라고 말하면 아직 남은 것처럼 읽힌다.
 */
export function formatRemaining(iso?: string | null, now: number = Date.now()): string | undefined {
  if (!iso) return undefined
  const target = new Date(iso).getTime()
  if (Number.isNaN(target)) return undefined
  const ms = target - now
  if (ms <= 0) return undefined

  const totalMinutes = Math.floor(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  // 1시간 미만이면 분만 — "0시간 7분"보다 "7분"이 읽기 쉽다
  return hours === 0
    ? studioText(`${minutes}분 남음`, `${minutes}m remaining`)
    : studioText(`${hours}시간 ${minutes}분 남음`, `${hours}h ${minutes}m remaining`)
}

/**
 * ErrorCode → 안내 문구.
 *
 * 값은 **한 문장 + 다음 행동**으로 맞췄다. 상태를 색으로만 알리지 않기 위해(§1.2) 화면 곳곳에서
 * 이 문구가 배지·비활성 버튼 옆에 함께 붙는다.
 *
 * 코드 출처 —
 *   · `SETTLEMENT_*` 6종: settlement_02·03·04·05의 403·409 설명 + §16.1 전용 코드
 *   · `COIN_MINT_PENDING`: settlement_02 409
 *   · `COIN_ESCROW_INSUFFICIENT`: settlement_05 409
 *   · `COIN_SUPPLY_MISMATCH`: §8.2(잠정 코드 `COIN_RESERVE_MISMATCH`가 settlement_05 409에 있다)
 *   · 아래 `PERFORMANCE_*`·`COMMON_*`·`CHAIN_*`도 같은 네 엔드포인트의 에러 표에 있는 값이라
 *     `blockedReason`으로 내려올 수 있다. 표에 없으면 화면이 코드를 그대로 노출하게 되므로 함께 담는다
 */
const messages = (): Record<string, string> => ({
  /* ── 정산 상태 머신 ─────────────────────────────────────────────── */
  SETTLEMENT_NOT_LOCKED: studioText(
    '정산이 아직 잠기지 않았습니다. 집계 확정 → 정산 잠금을 먼저 끝내야 합니다.',
    'Settlement is not locked. Confirm aggregation and lock settlement first.',
  ),
  SETTLEMENT_DISPUTE_PERIOD: studioText(
    '이의제기 기간이 끝나지 않았거나 열린 이의가 남아 있습니다. 기간이 끝나고 이의가 정리되면 release할 수 있습니다.',
    'The dispute window is still open or a dispute is unresolved. Release is available after both are closed.',
  ),
  SETTLEMENT_ALREADY_RELEASED: studioText(
    'release가 이미 끝났습니다. 정산은 여기서 끝이며 더 할 일이 없습니다.',
    'Release is complete. No further settlement action is needed.',
  ),
  SETTLEMENT_AGGREGATE_MISMATCH: studioText(
    '서버 집계와 온체인 선택 카운터가 일치하지 않습니다. 관리자 확인 중입니다.',
    'Server totals do not match on-chain audience choices. An administrator is checking.',
  ),
  SETTLEMENT_NOT_PARTICIPANT: studioText(
    '이 공연의 참여팀만 정산을 볼 수 있습니다.',
    'Only participating teams can view this settlement.',
  ),
  SETTLEMENT_DISPUTE_CLOSED: studioText(
    '이의제기 기간이 끝나 더 이상 접수할 수 없습니다.',
    'The dispute window has closed. New disputes cannot be submitted.',
  ),

  /* ── 코인·에스크로 대사 ─────────────────────────────────────────── */
  COIN_MINT_PENDING: studioText(
    '확정되지 않은 결제·발행 건이 남아 있습니다. 모두 확정된 뒤에 집계할 수 있습니다.',
    'Payments or issuance are still pending. Aggregation is available after all are confirmed.',
  ),
  COIN_ESCROW_INSUFFICIENT: studioText(
    '에스크로 잔액이 분배 합계보다 적습니다. 관리자 확인 중입니다.',
    'The escrow balance is lower than the total payout. An administrator is checking.',
  ),
  // §8.2 — 발행량 대사 불일치. release가 중단된 상태이며 처리는 M-03에서 한다
  COIN_SUPPLY_MISMATCH: studioText(
    '발행량 대사가 맞지 않아 정산금 지급이 중단됐습니다. 관리자 확인 중입니다.',
    'Payouts are paused due to an issuance reconciliation mismatch. An administrator is checking.',
  ),

  /* ── 그 밖에 `blockedReason`으로 올 수 있는 코드 ─────────────────── */
  // settlement_05 409의 잠정 코드. 뜻이 같으므로 같은 문구를 쓴다(§16.1이 전용 코드로 승격 예정)
  COIN_RESERVE_MISMATCH: studioText(
    '발행량 대사가 맞지 않아 정산금 지급이 중단됐습니다. 관리자 확인 중입니다.',
    'Payouts are paused due to an issuance reconciliation mismatch. An administrator is checking.',
  ),
  COIN_ISSUANCE_PAUSED: studioText(
    '대사 불일치로 코인 지급이 멈춰 있습니다. 관리자 확인 중입니다.',
    'Coin issuance is paused due to a reconciliation mismatch. An administrator is checking.',
  ),
  PERFORMANCE_INVALID_STATUS: studioText(
    '지금 공연·정산 상태에서는 실행할 수 없습니다.',
    'This action is unavailable in the current show or settlement state.',
  ),
  PERFORMANCE_NOT_OWNER: studioText(
    '공연을 만든 팀의 리더만 실행할 수 있습니다.',
    'Only the host team leader can perform this action.',
  ),
  COMMON_FORBIDDEN: studioText(
    '이 팀의 리더만 실행할 수 있습니다.',
    'Only this team’s leader can perform this action.',
  ),
  COMMON_CONFLICT: studioText(
    '이미 처리됐거나 같은 작업이 진행 중입니다.',
    'This action was already processed or is currently running.',
  ),
  COMMON_VALIDATION_FAILED: studioText('입력값을 확인해 주세요.', 'Check the entered values.'),
  CHAIN_GAS_INSUFFICIENT: studioText(
    '운영 지갑 가스가 부족합니다. 관리자 확인 중입니다.',
    'The operating wallet has insufficient gas. An administrator is checking.',
  ),
  CHAIN_TX_TIMEOUT: studioText(
    '온체인 확정이 늦어지고 있습니다. 처리 상태를 계속 확인합니다.',
    'On-chain confirmation is taking longer. We will keep checking its status.',
  ),
  COMMON_INTERNAL_ERROR: studioText('잠시 후 다시 시도해 주세요.', 'Please try again in a moment.'),
})

/**
 * P-08에서만 다른 문장을 쓰는 409 코드 아홉.
 *
 * 이 화면은 같은 표를 `blockedReason`(사전 차단)에도 쓰는 **운영자 화면**이라
 * "왜 안 눌리나"와 다음 순서까지 설명하는 긴 문장을 유지한다. 공통층(-121이 정한 ko 출처
 * 우선순위 msg > admin > studio)과 통일하지 않은 것은 결정이다.
 *
 * 여기 없는 409 코드는 공통층(`CONFLICT_MESSAGES`) 문장을 쓴다. `errorMessages.test.ts`가
 * "override는 실제로 공통층과 다른 문장이어야 한다"로 이 목록을 고정한다.
 */
export const SETTLEMENT_CONFLICT_OVERRIDES: readonly ConflictCode[] = [
  'COMMON_CONFLICT',
  'PERFORMANCE_INVALID_STATUS',
  'COIN_MINT_PENDING',
  'COIN_ESCROW_INSUFFICIENT',
  'COIN_RESERVE_MISMATCH',
  'SETTLEMENT_NOT_LOCKED',
  'SETTLEMENT_DISPUTE_PERIOD',
  'SETTLEMENT_ALREADY_RELEASED',
  'SETTLEMENT_AGGREGATE_MISMATCH',
] as const

/**
 * 코드를 안내 문구로 옮긴다. 코드가 없으면(= 막힌 이유가 없거나 성공) `undefined`.
 *
 * `SETTLEMENT_DISPUTE_PERIOD`만 문맥을 쓴다 — 마감까지 남은 시간을 뒤에 붙인다(P-08 상태 항목).
 *
 * 표에 없는 409는 공통층이 낸다(`conflictMessage`) — 새 409 코드가 생겨도 이 화면이
 * 코드를 그대로 노출하지 않는다.
 *
 * ⚠ 어느 표에도 없는 코드는 **문구를 지어내지 않고** 코드 문자열을 그대로 괄호에 담아 보여준다.
 * 운영자가 그 코드로 신고할 수 있어야 하고, 화면이 모르는 상황을 아는 척하면 안 된다.
 * 공통층 폴백이 이 파일이 쓰던 것과 **같은 문장**이라 폴백 분기를 따로 두지 않는다.
 */
export function settlementMessage(
  code: string | null | undefined,
  ctx?: SettlementMessageContext,
): string | undefined {
  if (!code) return undefined

  const base = messages()[code]
  if (!base) return studioText(conflictMessage(code, 'ko') ?? '', conflictMessage(code, 'en') ?? '')

  if (code === 'SETTLEMENT_DISPUTE_PERIOD') {
    const remaining = formatRemaining(ctx?.disputeClosesAt)
    if (remaining)
      return studioText(
        `${base} 이의제기 마감까지 ${remaining}.`,
        `${base} Dispute window: ${remaining}.`,
      )
  }
  return base
}
