/**
 * refund 쿼리 훅 — API-refund-01 · 02.
 *
 * ────────────────────────── 환불은 표 단위라 파장이 넓다 ──────────────────────────
 * 1원만 돌려받아도 그 표는 통째로 빠진다. 그래서 확정 후에는 티켓·주문만이 아니라
 * **지갑 잔액·판매현황·정산 집계·검증 화면**까지 같이 틀어진다. 그 목록은 화면이 아니라
 * `invalidatedBy('REFUND')`가 갖고 있다 — `useInvalidateOnRefundConfirmed()`가 그걸 쓴다.
 * 목록을 손으로 나열하면 반드시 하나를 빠뜨리고, 화면은 멀쩡한데 숫자만 틀린다.
 *
 * ⚠ `POST /tickets/{id}/cancel`은 `Idempotency-Key` 필수(§0.8)다. 여기서 만들지 않는다 —
 *   재시도에 새 키가 나가면 같은 표의 환불이 두 번 접수될 수 있다.
 *   화면이 확인 다이얼로그를 열 때 하나 만들어 두고 재시도에도 같은 값을 넘긴다.
 */

import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  cancelTicket,
  fetchRefundQuote,
  type RefundAccepted,
  type RefundCancelRequest,
} from '@/shared/api/domains/refund'
import { invalidatedBy, qk } from '@/shared/queries/keys'

/* ------------------------------ 미리보기 ------------------------------ */

/**
 * API-refund-01 환불액 미리보기(A-11).
 *
 * 수수료 구간이 **시각 경계**(D-7·D-3 00:00)로 갈리고 `walletBalanceAfter`도 잔액을 보므로
 * 오래 캐시하면 확인 버튼을 누르는 순간 400(금액 불일치)이 난다. 서버 잔액 캐시(10초)에 맞춘다.
 *
 * 마감·정산 잠금은 **409 에러**로 온다(`REFUND_DEADLINE_PASSED`·`REFUND_AFTER_SETTLEMENT_LOCK`).
 * 이미 쓴 표·취소된 표도 409다(`TICKET_ALREADY_USED`·`TICKET_CANCELED`). 화면이 `code`로 분기한다.
 */
export function useRefundQuote(ticketId: number | undefined, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.ticket.refundQuote(ticketId ?? 0),
    queryFn: ({ signal }) => fetchRefundQuote(ticketId as number, { signal }),
    enabled: (options.enabled ?? true) && typeof ticketId === 'number',
    staleTime: 10_000,
  })
}

/* ------------------------------ 취소 접수 ------------------------------ */

export interface CancelTicketVariables extends RefundCancelRequest {
  ticketId: number
  /** §0.8 필수. 재시도 시 **같은 값**(같은 키 재호출 = 최초 jobId 재생). */
  idempotencyKey: string
}

/**
 * API-refund-02 티켓 개별 취소 → 202 + `jobId`.
 *
 * 202는 **접수**일 뿐 환불 완료가 아니다. 코인 이동은 `jobId` 확정 시점이고,
 * tx가 실패하면 아무것도 이동하지 않은 채 티켓 상태만 원복된다(중간 상태 없음).
 * 그래서 여기서는 이 티켓 주변만 깨우고, **전면 무효화는 확정 후**
 * `useInvalidateOnRefundConfirmed()`가 한다.
 *
 * `expectedRefundAmount`가 서버 재계산과 다르면 400이다 — 그때는 미리보기를 다시 받아
 * 새 금액을 보여준 뒤 사용자 확인을 다시 받는다(같은 키로 재시도하면 본문이 달라져 409다. 새 키를 만든다).
 */
export function useCancelTicket() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (variables: CancelTicketVariables): Promise<RefundAccepted> =>
      cancelTicket(
        {
          ticketId: variables.ticketId,
          expectedRefundAmount: variables.expectedRefundAmount,
          reason: variables.reason,
        },
        { idempotencyKey: variables.idempotencyKey },
      ),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        // 접수된 표는 재요청이 막힌다(REFUND_ALREADY_REQUESTED). 미리보기·상세를 다시 받는다.
        queryClient.invalidateQueries({ queryKey: qk.ticket.refundQuote(variables.ticketId) }),
        queryClient.invalidateQueries({ queryKey: qk.ticket.detail(variables.ticketId) }),
      ])
    },
  })
}

/* ------------------------------ 확정 후 무효화 ------------------------------ */

/**
 * 환불 `chain_job`이 `CONFIRMED`된 뒤 호출한다.
 *
 * 티켓이 빠지면 판매 집계·정산 예상액·검증 화면의 환불 건수까지 함께 움직인다.
 * 목록은 `invalidatedBy('REFUND')`가 갖는다 — 여기에 키를 덧붙여 나열하지 않는다.
 * chain 도메인의 `invalidateForChainJob(queryClient, job)`이 같은 일을 한다. job 객체를 들고 있으면 그쪽을 쓴다.
 */
export function useInvalidateOnRefundConfirmed() {
  const queryClient = useQueryClient()

  return useCallback(
    async (params: { ticketId?: number } = {}) => {
      const keys = [...invalidatedBy('REFUND')]
      if (typeof params.ticketId === 'number') {
        keys.push(qk.ticket.refundQuote(params.ticketId))
      }
      await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
    },
    [queryClient],
  )
}
