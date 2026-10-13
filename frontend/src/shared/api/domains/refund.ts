/**
 * refund — 환불액 미리보기·개별 취소 (API-refund-01 · 02).
 *
 * 정본: `docs/design/06_API_명세서_v6.md` §9 refund · `docs/design/api/openapi.yaml`
 *       operationId `refund_01`(GET /tickets/{ticketId}/refund-quote)
 *       · `refund_02`(POST /tickets/{ticketId}/cancel)
 *
 * ────────────────────────── 환불은 금액이 아니라 표 단위다 ──────────────────────────
 * 1원만 돌려받아도 **그 표는 통째로 빠진다.** 수수료 구간(D-7 이전 전액 / D-3 이전 50% /
 * D-3 00:00 이후 취소 불가)은 금액만 정하고, 취소 여부를 나누지 않는다.
 * 그래서 확정되면 티켓·주문뿐 아니라 판매현황·정산 집계·검증 화면까지 함께 무효화해야 한다
 * (`invalidatedBy('REFUND')` — shared/queries/refund.ts가 그 목록을 쓴다).
 *
 * 환불 수신처는 **관객 지갑 잔액 하나뿐**이다(`refundTarget: 'WALLET_BALANCE'`). 지정하는 필드가 없다.
 *
 * ⚠ `POST /tickets/{id}/cancel`은 `Idempotency-Key` **필수**(§0.8)다. 같은 키 재호출은 최초 jobId를 재생한다.
 *   재시도에 새 키를 쓰면 같은 표를 두 번 환불 접수하게 된다.
 */

import { api } from '@/shared/api/client'
import type { ApiBody, ApiData } from '@/shared/api/schema'

/* ------------------------------ 타입 ------------------------------ */

/**
 * 환불 미리보기. 상태를 바꾸지 않는 조회다.
 * `refundAmount`를 그대로 `cancelTicket`의 `expectedRefundAmount`로 넘겨 재확인시킨다.
 * `walletBalanceAfter`는 노드 조회 실패 시 null이다 — 없다고 실패로 다루지 않는다.
 */
export type RefundPreview = ApiData<'refund_01'>

/** `POST /tickets/{id}/cancel` 요청 본문. */
export type RefundCancelRequest = ApiBody<'refund_02'>

/**
 * 202 본문. **공통 3필드가 아니라 12필드다**(S15P21B204-92로 명세를 실제 응답에 맞췄다).
 * `signerType=OPERATOR`이고 `display`는 값이 없으면 키가 아예 오지 않는다(전역 `non_null`).
 * 확정 여부는 `GET /chain/jobs/{jobId}`로 본다(§0.3). 실패해도 코인은 이동하지 않는다.
 */
export type RefundAccepted = ApiData<'refund_02'>

/* ------------------------------ 호출 ------------------------------ */

/** API-refund-01 환불액 미리보기. 마감 이후 409 `REFUND_DEADLINE_PASSED`, 정산 잠금 이후 409 `REFUND_AFTER_SETTLEMENT_LOCK`. */
export function fetchRefundQuote(
  ticketId: number,
  options: { signal?: AbortSignal } = {},
): Promise<RefundPreview> {
  return api.get<RefundPreview>('/tickets/' + ticketId + '/refund-quote', {
    signal: options.signal,
  })
}

/**
 * API-refund-02 티켓 개별 취소·환불 → 202 + jobId.
 *
 * `expectedRefundAmount`는 **직전 미리보기의 `refundAmount`** 다. 서버 재계산과 다르면
 * 400 `COMMON_VALIDATION_FAILED`이며, 그때는 미리보기를 다시 받아 사용자에게 새 금액을 보여준다.
 */
export function cancelTicket(
  params: { ticketId: number } & RefundCancelRequest,
  options: { idempotencyKey: string; signal?: AbortSignal },
): Promise<RefundAccepted> {
  const body: RefundCancelRequest = {
    expectedRefundAmount: params.expectedRefundAmount,
    reason: params.reason,
  }
  return api.post<RefundAccepted>('/tickets/' + params.ticketId + '/cancel', body, {
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  })
}
