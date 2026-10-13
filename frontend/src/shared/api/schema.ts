/**
 * OpenAPI 생성 타입의 사용 진입점.
 *
 * 정본은 `docs/design/api/openapi.yaml`이고, 그 파일은 API 명세서 v6의 기계 판독용 표현이다.
 * 생성물은 `generated/openapi.ts`이며 **손으로 고치지 않는다** — 명세가 바뀌면
 * `pnpm gen:api`로 다시 만든다.
 *
 * 왜 생성으로 가는가 — 금액 응답이 절마다 형태가 다르다(중첩 객체 `{amount, currency, display}` /
 * 루트 평면 `xxxAmount` / 루트 `rate` 축약형 등). 손으로 공통 타입을 만들면 반드시 어느 절과
 * 어긋나고, 그 어긋남은 런타임에야 드러난다. 생성물은 절마다 실제 shape를 그대로 갖는다.
 *
 * 사용례
 * ```ts
 * type PaymentStart = ApiData<'payment_01'>   // 결제 시작 200 응답의 data
 * type Verification = ApiData<'verify_01'>
 * const path: ApiPath<'payment_01'> = { orderId: 5501 }
 * ```
 * operationId는 `openapi.yaml`의 `operationId`와 같고 API 명세 번호를 그대로 쓴다
 * (`payment_01` = API-payment-01).
 */

import type { components, operations, paths } from '@/shared/api/generated/openapi'

export type { components, operations, paths }

/** `components.schemas` 전체. 개별 스키마는 `Schemas['PaymentStartResult']`처럼 꺼낸다. */
export type Schemas = components['schemas']

/* ---------- 자주 쓰는 공통 스키마 (§0) ---------- */

/** YoYo 정수. decimals 0이라 소수가 없다. */
export type Money = Schemas['Money']
/** 표시 통화 환산. 표시 전용이며 요청으로 되돌리지 않는다(§0.5). */
export type Display = Schemas['Display']
export type PageMeta = Schemas['PageMeta']
export type Address = Schemas['Address']
export type TxHash = Schemas['TxHash']
/** 온체인 작업. 폴링은 `GET /chain/jobs/{jobId}` 하나다(§0.3). */
export type ChainJob = Schemas['ChainJob']
/** 사용자가 발신자 서명할 tx 하나. 배열 순서대로 서명·보고한다(§0.4). */
export type SignRequest = Schemas['SignRequest']
export type PrepareResponse = Schemas['PrepareResponse']
export type SignedTxRequest = Schemas['SignedTxRequest']

/* ---------- 응답에서 data를 꺼내는 헬퍼 ---------- */

/**
 * 성공 응답 본문. 규격상 201·202도 정상이므로 셋을 모두 본다(§0.1).
 * 응답은 `Envelope & { data?: T }` 교차 타입으로 생성된다.
 */
type SuccessBody<O extends keyof operations> = operations[O]['responses'] extends {
  200: { content: { 'application/json': infer B } }
}
  ? B
  : operations[O]['responses'] extends { 201: { content: { 'application/json': infer B } } }
    ? B
    : operations[O]['responses'] extends { 202: { content: { 'application/json': infer B } } }
      ? B
      : never

/**
 * 오퍼레이션의 성공 `data` 타입.
 *
 * `api.get<ApiData<'verify_01'>>(...)`처럼 쓴다. 클라이언트가 이미 래퍼를 벗겨
 * `data`만 돌려주므로(shared/api/client) 화면은 이 타입만 보면 된다.
 */
export type ApiData<O extends keyof operations> =
  SuccessBody<O> extends { data?: infer D } ? NonNullable<D> : never

/** path 파라미터. 경로를 문자열로 조립할 때 오타를 막는다. */
export type ApiPath<O extends keyof operations> = operations[O]['parameters'] extends {
  path: infer P
}
  ? P
  : never

/** 쿼리 파라미터. */
export type ApiQuery<O extends keyof operations> = operations[O]['parameters'] extends {
  query?: infer Q
}
  ? Q
  : never

/** 요청 본문. 본문 없는 POST는 `Record<string, never>`로 생성된다(§0.1 — `{}`를 보낸다). */
export type ApiBody<O extends keyof operations> = operations[O] extends {
  requestBody?: { content: { 'application/json': infer B } }
}
  ? B
  : never
