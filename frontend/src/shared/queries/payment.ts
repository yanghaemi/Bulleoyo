/**
 * payment 쿼리 훅 — API-payment-01 · 02 · 03.
 *
 * ─────────────────────────── 결제 3단계와 이 파일의 경계 ───────────────────────────
 *   ① `useStartPayment()`          prepare — `signRequests` 수령
 *   ② 지갑 서명                      **범위 밖**(shared/blockchain/WalletAdapter)
 *   ③ `useReportPaymentSignedTx()` 서명 RLP 보고 → 202 + jobId
 *   ④ `GET /chain/jobs/{jobId}` 폴링으로 확정 확인 → `useInvalidateOnPaymentConfirmed()`
 *
 * ④의 폴링 자체는 chain 도메인 훅의 몫이다. 여기서는 확정됐을 때 **무엇을 무효화할지**만 준다.
 *
 * ⚠ `senderSignedRlp`를 mutation variables에 담지 않는다. TanStack Query는 variables를
 *   mutation state에 보관하고 devtools에도 노출하므로, 값이 보고 후에도 훅 상태에 남는다.
 *   그래서 ③은 **값이 아니라 "값을 만드는 함수"** 를 받고, RLP는 `mutationFn` 안에서만 산다
 *   (기술 스택 v3 §3.2 — localStorage·sessionStorage·로그·훅 상태 어디에도 남기지 않는다).
 *
 * ⚠ `POST /orders/{id}/payment`(prepare)는 `Idempotency-Key` 필수(§0.8)다. 여기서 만들지 않는다 —
 *   응답 유실처럼 결과를 모르는 재전송은 같은 키를 유지하고, 체인 job이 FAILED로 끝나 새 서명·전송을
 *   시작할 때만 새 키를 만든다. 화면이 이 시도 단위 수명을 관리해 넘긴다.
 */

import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  abandonPaymentSignature,
  fetchPaymentStatus,
  reportPaymentSignedTx,
  startPayment,
  type PaymentSignKind,
  type PaymentSignedTxAccepted,
  type PaymentStartResult,
} from '@/shared/api/domains/payment'
import { invalidatedBy, qk } from '@/shared/queries/keys'

/**
 * 결제 상태 쿼리 키.
 *
 * `keys.ts`에 payment 스코프가 없어(도메인 13개 중 payment만 빠져 있다) **주문 상세 아래**에 단다.
 * 접두가 `qk.order.detail(orderId)`라 `qk.order.all` 무효화가 이 키까지 함께 잡는다 —
 * 결제 확정 시 주문만 갱신하고 결제 상태는 옛 값이 남는 사고를 막는다.
 * keys.ts에 `qk.payment.*`가 생기면 이 함수를 지우고 그쪽으로 옮긴다.
 */
export function paymentStatusKey(orderId: number) {
  return [...qk.order.detail(orderId), 'payment'] as const
}

/* ------------------------------ 상태 조회(폴링) ------------------------------ */

/**
 * API-payment-02 결제 상태(A-05).
 *
 * 폴링 주기는 **서버가 정한다** — 응답의 `pollAfterMs`가 null이면 더 볼 것이 없다는 뜻이라 멈춘다.
 * 임의 주기로 계속 돌리면 결제 완료 후에도 요청이 남는다.
 *
 * `paymentStatus=AWAITING_SIGNATURE`면 응답에 `signRequests`가 함께 오므로, 새로고침·복귀 후에도
 * prepare를 다시 부르지 않고 이 응답만으로 서명을 이어갈 수 있다(A-05 원스텝 UX).
 * 잔액이 그 사이 줄면 `signRequests: null` + `blockedReason: 'INSUFFICIENT_BALANCE'`다 —
 * **성공 응답**이니 에러로 다루지 않는다.
 */
export function usePaymentStatus(orderId: number | undefined, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: paymentStatusKey(orderId ?? 0),
    queryFn: ({ signal }) => fetchPaymentStatus(orderId as number, { signal }),
    enabled: (options.enabled ?? true) && typeof orderId === 'number',
    // 진행 중인 결제라 캐시가 오래 신선할 수 없다.
    staleTime: 0,
    refetchInterval: (query) => query.state.data?.pollAfterMs ?? false,
    refetchIntervalInBackground: false,
  })
}

/* ------------------------------ ① prepare ------------------------------ */

export interface StartPaymentVariables {
  orderId: number
  /** §0.8 필수. 결과 미확인 재전송은 같은 값, 종단 FAILED 이후 새 시도는 새 값. */
  idempotencyKey: string
}

/**
 * API-payment-01 결제 시작.
 *
 * 잔액 부족은 409 `COMMON_CONFLICT`로 **실패**해서 온다(200 아님). 부족액은 `msg`에만 있으니
 * 숫자가 필요하면 주문 생성 응답의 `shortfall`이나 지갑 잔액을 쓴다. 주문은 그대로 살아 있다.
 */
export function useStartPayment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (variables: StartPaymentVariables): Promise<PaymentStartResult> =>
      startPayment(variables.orderId, { idempotencyKey: variables.idempotencyKey }),
    onSuccess: (_data, variables) => {
      // prepare가 payment를 AWAITING_SIGNATURE로 만든다. 폴링 쿼리가 옛 상태를 들고 있지 않게 깨운다.
      queryClient.invalidateQueries({ queryKey: paymentStatusKey(variables.orderId) })
      // 내 주문 목록(ticket_02)의 `resumable`(서명 대기 배지)이 이 전이로 켜진다. 목록만 깨운다 —
      // 결제 화면이 보고 있는 주문 상세까지 서명 도중에 다시 읽힐 이유는 없다.
      queryClient.invalidateQueries({ queryKey: qk.order.mines() })
    },
  })
}

/* ------------------------------ ③ signed-tx 보고 ------------------------------ */

type ReportSignedTxBase = {
  orderId: number
  /**
   * 발신자 서명 RLP를 **그 자리에서 만들어** 돌려주는 함수.
   *
   * 값 대신 함수를 받는 이유는 RLP가 mutation state에 남지 않게 하기 위해서다.
   * 권장 사용법은 서명 자체를 여기서 하는 것이다:
   * `getSenderSignedRlp: () => wallet.signTransaction(signRequest)`
   */
  getSenderSignedRlp: () => string | Promise<string>
  /** [2026-09-24] 결제 전 본인 확인 토큰. 없으면 헤더를 붙이지 않는다(스위치 off 경로 무변경). */
  stepUpToken?: string
}

export type ReportSignedTxVariables = ReportSignedTxBase & (
  | { kind: 'PURCHASE'; childOrderId: number }
  | { kind: 'APPROVE'; childOrderId?: never }
)

/**
 * API-payment-03 서명 tx 보고 → 202 + `jobId`.
 *
 * 반환값에 RLP는 없다(jobId·status·pollAfterMs). 확정 여부는 `jobId`로 폴링한다(§0.3).
 * `PURCHASE` 보고 즉시 payment가 `PAYING`이 되고, receipt 확정에서 `PAID` + 티켓 발급이다.
 * tx가 revert되면 payment만 `FAILED`가 되고 주문은 `PENDING_PAYMENT`로 남아 재시도할 수 있다.
 *
 * 재시도에 별도 멱등키가 필요 없다 — 같은 RLP의 진행 중·확정 job은 최초 jobId를 재생하고,
 * 종단 FAILED job은 서버가 실패 이력을 보존한 채 새 job으로 다시 제출한다.
 */
export function useReportPaymentSignedTx() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (variables: ReportSignedTxVariables): Promise<PaymentSignedTxAccepted> => {
      // 이 지역 변수 밖으로 내보내지 않는다. 로그·에러 리포트에도 싣지 않는다.
      const senderSignedRlp = await variables.getSenderSignedRlp()
      // 관객 결제(A-05)는 공용 서명 오버레이(signingActivity)를 켜지 않는다(9/26 사용자 요청) —
      // 결제 화면에는 이미 자체 진행 표시(OperationOverlay)가 있어 두 문구가 겹쳐 보였다.
      // 공연자 동작(보증금·규칙 동의)만 오버레이를 쓴다.
      return variables.kind === 'PURCHASE'
        ? reportPaymentSignedTx({
            orderId: variables.orderId,
            childOrderId: variables.childOrderId,
            kind: 'PURCHASE',
            senderSignedRlp,
            ...(variables.stepUpToken ? { stepUpToken: variables.stepUpToken } : {}),
          })
        : reportPaymentSignedTx({
            orderId: variables.orderId,
            kind: 'APPROVE',
            senderSignedRlp,
            ...(variables.stepUpToken ? { stepUpToken: variables.stepUpToken } : {}),
          })
    },
    retry: false,
    onSuccess: (_data, variables) => {
      // PAYING으로 넘어갔다. 폴링을 즉시 한 번 돌려 화면 문구를 "확인 중"으로 바꾼다.
      queryClient.invalidateQueries({ queryKey: paymentStatusKey(variables.orderId) })
      // 목록의 `resumable`이 꺼진다(더는 서명 대기가 아니다).
      queryClient.invalidateQueries({ queryKey: qk.order.mines() })
    },
  })
}

/* ------------------------------ 서명 취소 보고 ------------------------------ */

export type AbandonSignatureVariables = { orderId: number } & (
  | { kind: 'PURCHASE'; childOrderId: number }
  | { kind: 'APPROVE'; childOrderId?: never }
)

/**
 * 지갑 팝업에서 사용자가 서명을 거절했을 때의 보고(선택).
 * payment는 `AWAITING_SIGNATURE`로 남고 **잔액은 그대로다.** 주문은 15분 만료 스케줄대로 간다.
 */
export function useAbandonPaymentSignature() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (variables: AbandonSignatureVariables) =>
      abandonPaymentSignature(variables),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: paymentStatusKey(variables.orderId) })
    },
  })
}

/* ------------------------------ ④ 확정 후 무효화 ------------------------------ */

/**
 * `chain_job`이 `CONFIRMED`된 뒤 호출한다. 어떤 쿼리를 깨울지는 `invalidatedBy(txType)`가 안다 —
 * 화면마다 목록을 나열하면 반드시 하나(대개 지갑 잔액)를 빠뜨린다.
 *
 * chain 도메인의 `invalidateForChainJob(queryClient, job)`이 같은 일을 한다 — job 객체를 들고 있으면
 * 그쪽을 쓰고, 이 훅은 job 없이 kind만 아는 호출부(서명 흐름 안쪽)용이다. 두 경로 모두 목록은 keys.ts가 갖는다.
 *
 * `PURCHASE` 확정은 티켓·주문·지갑·판매현황·정산 집계·검증까지 한꺼번에 바꾼다.
 * `APPROVE` 확정은 allowance만 바꾸지만, 다음 prepare가 `required`를 다시 계산하므로 결제 상태도 깨운다.
 */
export function useInvalidateOnPaymentConfirmed() {
  const queryClient = useQueryClient()

  return useCallback(
    async (params: { orderId: number; kind: PaymentSignKind }) => {
      const keys = [...invalidatedBy(params.kind), paymentStatusKey(params.orderId)]
      await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
    },
    [queryClient],
  )
}
