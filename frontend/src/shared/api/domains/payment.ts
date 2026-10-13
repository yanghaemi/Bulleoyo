/**
 * payment — 결제 시작·상태 조회·서명 tx 보고 (API-payment-01 · 02 · 03).
 *
 * 정본: `docs/design/06_API_명세서_v6.md` §7 payment · §0.4 사용자 서명 tx 규약
 *       `docs/design/api/openapi.yaml` operationId `payment_01`·`payment_02`·`payment_03`
 *
 * ───────────────────────── 결제는 3단계다(§0.4) ─────────────────────────
 *   ① `POST /orders/{id}/payment`            → prepare. `signRequests` 배열을 받는다
 *   ② 지갑이 배열 순서대로 **발신자 서명**      → 이 계층 밖(shared/blockchain/WalletAdapter)
 *   ③ `POST /orders/{id}/payment/signed-tx`  → 서명 RLP 보고. **202 + jobId**
 *
 * 이 파일은 ①과 ③만 한다. ②는 지갑 SDK의 몫이라 **서명된 RLP를 인자로 받는다.**
 * `signRequests[].required === false`인 항목(allowance가 이미 충분한 APPROVE)은 **건너뛴다.**
 *
 * ⚠ `senderSignedRlp`는 보고 직후 버린다. localStorage·sessionStorage·로그·훅 상태 어디에도
 *   남기지 않는다(기술 스택 v3 §3.2). 같은 RLP 재보고는 서버가 최초 jobId를 재생하므로
 *   재시도용으로 들고 있을 이유도 없다 — RLP 해시 자체가 자연 멱등키다(§0.8).
 *   그래서 `signed-tx`에는 `Idempotency-Key`를 붙이지 않는다.
 *
 * ⚠ `POST /orders/{id}/payment`(prepare)는 `Idempotency-Key` **필수**다(§0.8). 재시도 시 같은 키.
 */

import { api } from '@/shared/api/client'
import type { ApiBody, ApiData, operations } from '@/shared/api/schema'

/* ------------------------------ 타입 ------------------------------ */

/**
 * 200 응답 = `PrepareResponse`(signRequests·expiresAt) + 결제 요약.
 * 잔액 부족이면 이 200이 아니라 **409 `COMMON_CONFLICT`** 로 온다 — 부족액은 `msg`에만 담긴다.
 * (실패 응답의 `data`는 예외 없이 null이라는 §0.1 규약 때문. 숫자가 필요하면 ticket_01의 `shortfall`을 쓴다.)
 */
export type PaymentStartResult = ApiData<'payment_01'>

/**
 * 결제 상태. `paymentStatus`는 6값(`REQUESTED`/`AWAITING_SIGNATURE`/`PAYING`/`PAID`/`FAILED`/`REFUNDED`).
 * `AWAITING_SIGNATURE`면 `signRequests`가 함께 온다(별도 prepare 없이 바로 서명 — A-05 원스텝).
 * 잔액이 그 사이 줄면 `signRequests: null` + `blockedReason: 'INSUFFICIENT_BALANCE'` + `shortfall`.
 * `pollAfterMs`가 null이면 **폴링을 멈추라는 뜻**이다.
 */
export type PaymentStatusResult = ApiData<'payment_02'>

/** 결제에서 쓰는 서명 종류는 둘뿐이다(§7). `DEPOSIT`·`AGREE`는 다른 도메인 것이다. */
export type PaymentSignKind = Extract<ApiBody<'payment_03'>['kind'], 'APPROVE' | 'PURCHASE'>

/**
 * `signed-tx` 202 본문. **공통 3필드가 아니라 13필드다**(S15P21B204-92로 명세를 실제 응답에
 * 맞췄다). `txHash`는 서버가 대납 서명 후 전송해 얻은 값이며 클라이언트가 보고한 것이 아니다.
 * 상태는 `GET /chain/jobs/{jobId}` 하나로 폴링한다(§0.3) — 202는 확정이 아니다.
 */
export type PaymentSignedTxAccepted = NonNullable<
  operations['payment_03']['responses'][202]['content']['application/json']['data']
>

/**
 * `signed-tx`에 `abandoned: true`를 보냈을 때의 200 본문.
 * payment는 `AWAITING_SIGNATURE`로 남고 **잔액은 그대로다**(`balanceKept`). 주문은 만료 스케줄대로 간다.
 */
export type PaymentSignatureAbandoned = ApiData<'payment_03'>

/** `abandoned` 보고 본문 — 서명이 없으므로 `senderSignedRlp`를 담지 않는다(명세 §API-payment-03 Body 조건부 필수). */
type PaymentAbandonBody = Omit<ApiBody<'payment_03'>, 'senderSignedRlp'>

/* ------------------------------ 호출 ------------------------------ */

/**
 * API-payment-01 결제 시작(prepare). 본문 없음 — 클라이언트가 `{}`를 보낸다.
 * 알 수 없는 필드(구 버전의 `mode` 등)를 넣으면 400 `COMMON_VALIDATION_FAILED`다.
 */
export function startPayment(
  orderId: number,
  options: { idempotencyKey: string; signal?: AbortSignal },
): Promise<PaymentStartResult> {
  return api.post<PaymentStartResult>('/orders/' + orderId + '/payment', undefined, {
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  })
}

/** API-payment-02 결제 상태 조회. A-05 처리 중 폴링용. */
export function fetchPaymentStatus(
  orderId: number,
  options: { signal?: AbortSignal } = {},
): Promise<PaymentStatusResult> {
  return api.get<PaymentStatusResult>('/orders/' + orderId + '/payment', {
    signal: options.signal,
  })
}

/**
 * API-payment-03 결제 서명 tx 보고 → 202 + jobId.
 *
 * `senderSignedRlp`는 **이 함수 안에서만 산다.** 호출부는 값을 보관하지 말고 넘긴 뒤 버린다.
 * 로그에 찍지 않는다 — 실패 시에도 서버가 준 `code`만 본다.
 */
export type PaymentSignedTxParams = {
  orderId: number
  senderSignedRlp: string
  /**
   * [2026-09-24] 결제 전 본인 확인 토큰(API-webauthn-04). payment-01·02가 `stepUpRequired: true`일 때만
   * 싣는다 — 없으면 헤더를 붙이지 않아 스위치가 꺼진 서버와의 요청은 이전과 같다.
   */
  stepUpToken?: string
} & (
  | { kind: 'PURCHASE'; childOrderId: number }
  | { kind: 'APPROVE'; childOrderId?: never }
)

export function reportPaymentSignedTx(
  params: PaymentSignedTxParams,
  options: { signal?: AbortSignal } = {},
): Promise<PaymentSignedTxAccepted> {
  if (
    params.kind === 'PURCHASE' &&
    (!Number.isSafeInteger(params.childOrderId) || (params.childOrderId ?? 0) <= 0)
  ) {
    throw new Error('PURCHASE requires a child order ID')
  }
  const body: ApiBody<'payment_03'> = {
    kind: params.kind,
    ...(params.kind === 'PURCHASE' ? { orderId: params.childOrderId } : {}),
    senderSignedRlp: params.senderSignedRlp,
    abandoned: false,
  }
  return api.post<PaymentSignedTxAccepted>(
    '/orders/' + params.orderId + '/payment/signed-tx',
    body,
    params.stepUpToken
      ? { signal: options.signal, headers: { 'X-Step-Up-Token': params.stepUpToken } }
      : { signal: options.signal },
  )
}

/**
 * 서명 취소(지갑 팝업에서 사용자가 거절) 보고 → 200.
 *
 * 보고하지 않아도 주문은 15분 뒤 만료되지만, 명시적으로 알리면 화면이 "잔액은 그대로입니다"를
 * 곧바로 띄울 수 있다(결정 v2 §3.3 실패 보상).
 */
export type PaymentAbandonParams = { orderId: number } & (
  | { kind: 'PURCHASE'; childOrderId: number }
  | { kind: 'APPROVE'; childOrderId?: never }
)

export function abandonPaymentSignature(
  params: PaymentAbandonParams,
  options: { signal?: AbortSignal } = {},
): Promise<PaymentSignatureAbandoned> {
  if (
    params.kind === 'PURCHASE' &&
    (!Number.isSafeInteger(params.childOrderId) || (params.childOrderId ?? 0) <= 0)
  ) {
    throw new Error('PURCHASE requires a child order ID')
  }
  const body: PaymentAbandonBody = {
    kind: params.kind,
    abandoned: true,
    ...(params.kind === 'PURCHASE' ? { orderId: params.childOrderId } : {}),
  }
  return api.post<PaymentSignatureAbandoned>(
    '/orders/' + params.orderId + '/payment/signed-tx',
    body,
    { signal: options.signal },
  )
}
