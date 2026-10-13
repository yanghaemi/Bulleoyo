/**
 * order — 주문 생성·조회 (API-ticket-01 · 02 · 03).
 *
 * 정본: `docs/design/06_API_명세서_v6.md` §6 ticket · `docs/design/api/openapi.yaml`
 *       operationId `ticket_01`(POST /orders) · `ticket_02`(GET /orders/me) · `ticket_03`(GET /orders/{orderId})
 *
 * 응답 타입은 손으로 쓰지 않는다 — `ApiData<'ticket_0N'>`이 openapi 생성물에서 그대로 꺼내 온다.
 * 클라이언트가 래퍼(`{code,data,msg}`)를 이미 벗겨 `data`만 돌려주므로 여기 반환형이 곧 `data`다.
 *
 * ⚠ `POST /orders`는 `Idempotency-Key` **필수**(§0.8 6개 중 하나)다.
 *   재시도할 때 **같은 키**를 다시 넘겨야 한다. 매번 새 키를 만들면 중복 주문 = 중복 재고 선점이다.
 *   그래서 이 계층은 키를 만들지 않고 **호출부에서 받는다**(shared/api/client의 §0.8 주석과 같은 규약).
 */

import { api, type QueryParams } from '@/shared/api/client'
import type { TeamAllocationView } from '@/shared/ui/format'
import type { ApiBody, ApiData, ApiQuery } from '@/shared/api/schema'

/* ------------------------------ 타입 ------------------------------ */

/** `POST /orders` 요청 본문. `totalAmount`는 YoYo 정수다 — 소수 없음. */
export type OrderCreateRequest = ApiBody<'ticket_01'>
/** 201 응답. `orderRef`·`teamIndex`는 온체인 인자, `shortfall`은 **안내용**이다(v5 — 대체 결제 경로 없음). */
export type OrderCreateResult = ApiData<'ticket_01'>

/** `GET /orders/me` 쿼리. 기본값은 openapi의 default와 같다(page 0 · size 20 · createdAt,desc). */
export type MyOrderListQuery = NonNullable<ApiQuery<'ticket_02'>>
/** 목록 응답. 금액은 §0.5 축약형이라 항목이 아니라 루트에 `rate` 하나가 온다. */
export type MyOrderListResult = ApiData<'ticket_02'>

/** `GET /orders/{orderId}` 응답. 본인 주문이 아니면 서버가 `COMMON_NOT_FOUND`로 존재를 숨긴다. */
export type OrderDetail = ApiData<'ticket_03'>

/**
 * 응답의 `teamAllocations` → 화면이 쓰는 표시용 목록.
 *
 * 생성물의 필드는 전부 선택이라(non-null 전역 직렬화) 이름·수량이 없는 항목은 **버린다** —
 * '—'를 채워 넣으면 있지도 않은 팀이 배분 목록에 끼어든다. 단독 공연이면 빈 배열이다.
 */
export function teamAllocationsOf(
  allocations: readonly { teamName?: string; quantity?: number }[] | undefined,
): TeamAllocationView[] {
  return (allocations ?? []).flatMap((a) =>
    a.teamName && a.quantity != null ? [{ teamName: a.teamName, quantity: a.quantity }] : [],
  )
}

/* ------------------------------ 호출 ------------------------------ */

/**
 * API-ticket-01 주문 생성. `PENDING_PAYMENT`로 15분 유효하다.
 *
 * `shortfall > 0`(잔액 부족)이어도 **201로 성공**하고 주문은 15분 유지된다. 잔액 부족을 실패로
 * 다루면 안 된다 — 관객이 그 사이 잔액을 확보하면 같은 주문으로 결제할 수 있다(v5 §7).
 */
export function createOrder(
  body: OrderCreateRequest,
  options: { idempotencyKey: string; signal?: AbortSignal },
): Promise<OrderCreateResult> {
  return api.post<OrderCreateResult>('/orders', body, {
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  })
}

/** API-ticket-02 내 주문 목록. */
export function fetchMyOrders(
  params: MyOrderListQuery = {},
  options: { signal?: AbortSignal } = {},
): Promise<MyOrderListResult> {
  const query: QueryParams = {
    status: params.status,
    page: params.page,
    size: params.size,
    sort: params.sort,
  }
  return api.get<MyOrderListResult>('/orders/me', { query, signal: options.signal })
}

/** API-ticket-03 주문 상세. 결제 정보·발급 티켓 목록을 함께 준다. */
export function fetchOrderDetail(
  orderId: number,
  options: { signal?: AbortSignal } = {},
): Promise<OrderDetail> {
  return api.get<OrderDetail>('/orders/' + orderId, { signal: options.signal })
}
