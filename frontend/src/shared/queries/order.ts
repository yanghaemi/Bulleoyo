/**
 * order 쿼리 훅 — API-ticket-01 · 02 · 03.
 *
 * 키는 `shared/queries/keys.ts`의 `qk.order.*`만 쓴다. 인라인 배열로 만들면 무효화가 조용히 빗나간다.
 *
 * ─────────────────────────── 멱등키는 호출부가 만든다 ───────────────────────────
 * `POST /orders`는 `Idempotency-Key` 필수(§0.8)다. **여기서 자동 생성하지 않는다.**
 * 자동 생성하면 mutate를 다시 부를 때마다 새 키가 되어 중복 주문 = 중복 재고 선점이 난다.
 * 화면이 "결제 확인" 시트를 열 때 `newIdempotencyKey()`(shared/api/client)로 한 번 만들어
 * 두고, 실패 후 재시도에도 **같은 값**을 넘긴다. 본문이 바뀌면(수량·팀 변경) 새 키를 만든다.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createOrder,
  fetchMyOrders,
  fetchOrderDetail,
  type MyOrderListQuery,
  type OrderCreateRequest,
  type OrderCreateResult,
} from '@/shared/api/domains/order'
import { qk } from '@/shared/queries/keys'

/* ------------------------------ 목록 파라미터 정규화 ------------------------------ */

/**
 * 키와 요청에 **같은 객체**를 쓰기 위해 기본값을 여기서 채운다(keys.ts 주석 참고).
 * 호출부가 `{}`와 `{page:0}`을 섞어 넘겨도 같은 캐시를 본다.
 * 기본값은 openapi `ticket_02`의 default와 같다.
 */
function normalizeOrderListParams(params: MyOrderListQuery): MyOrderListQuery {
  return {
    status: params.status,
    page: params.page ?? 0,
    size: params.size ?? 20,
    sort: params.sort ?? 'createdAt,desc',
  }
}

/* ------------------------------ 조회 ------------------------------ */

/** API-ticket-02 내 주문 목록(A-12). */
export function useMyOrders(params: MyOrderListQuery = {}) {
  const normalized = normalizeOrderListParams(params)
  return useQuery({
    queryKey: qk.order.mine(normalized),
    queryFn: ({ signal }) => fetchMyOrders(normalized, { signal }),
  })
}

/**
 * API-ticket-03 주문 상세(A-06·A-12).
 * 타인 주문·없는 주문은 404 `COMMON_NOT_FOUND` 하나로 온다 — 존재를 숨기는 규약이다.
 */
export function useOrderDetail(orderId: number | undefined, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.order.detail(orderId ?? 0),
    queryFn: ({ signal }) => fetchOrderDetail(orderId as number, { signal }),
    enabled: (options.enabled ?? true) && typeof orderId === 'number',
  })
}

/* ------------------------------ 생성 ------------------------------ */

export interface CreateOrderVariables {
  body: OrderCreateRequest
  /** §0.8 필수. 재시도 시 **같은 값**을 다시 넘긴다. */
  idempotencyKey: string
}

/**
 * API-ticket-01 주문 생성(A-03·A-04 → A-05).
 *
 * 성공해도 결제는 아직이다 — `PENDING_PAYMENT`가 15분 유지된다.
 * `shortfall > 0`(잔액 부족)도 **성공 응답**이다. 화면이 안내만 띄우고 주문은 살려 둔다(v5 §7).
 *
 * 재고를 Redis에서 선점하므로 공연 상세(잔여 수량)도 함께 무효화한다.
 */
export function useCreateOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (variables: CreateOrderVariables): Promise<OrderCreateResult> =>
      createOrder(variables.body, { idempotencyKey: variables.idempotencyKey }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.order.all }),
        // 재고 선점으로 잔여 수량이 줄었다.
        queryClient.invalidateQueries({ queryKey: qk.performance.details() }),
      ])
    },
  })
}
