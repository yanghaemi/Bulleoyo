/**
 * ticket 쿼리 훅 — API-ticket-04 · 05 · 06.
 *
 * 키는 `qk.ticket.*`만 쓴다(shared/queries/keys.ts).
 *
 * ─────────────────────────────── QR 캐시 정책 ───────────────────────────────
 * 동적 QR은 30초마다 회전하고 토큰 유효는 60초다. 전역 기본값 `staleTime: 30초`를 그대로 쓰면
 * **만료 직전 토큰을 계속 보여주다 현장에서 `ENTRY_QR_EXPIRED`(401)로 튕긴다.**
 * 그래서 이 쿼리만 `staleTime: 0` + `rotateAfterMs` 주기 자동 갱신 + 포커스 복귀 시 갱신으로 덮는다.
 * `gcTime: 0`은 화면을 벗어났다 돌아왔을 때 **옛 토큰이 먼저 그려지는 것**을 막는다.
 */

import { useQuery } from '@tanstack/react-query'

import {
  fetchMyTickets,
  fetchTicketDetail,
  fetchTicketQr,
  type MyTicketListQuery,
  type MyTicketListResult,
} from '@/shared/api/domains/ticket'
import { qk } from '@/shared/queries/keys'

/** 서버가 주는 `rotateAfterMs`가 정본이고, 응답 전이나 누락 시 쓰는 폴백이다(명세 고정값 30000). */
const QR_ROTATE_FALLBACK_MS = 30_000
const ALL_TICKETS_PAGE_SIZE = 100

type AllMyTicketQuery = Omit<MyTicketListQuery, 'page' | 'size'>

/* ------------------------------ 목록 파라미터 정규화 ------------------------------ */

/** 기본값은 openapi `ticket_04`의 default와 같다. 키와 요청이 같은 객체를 쓴다. */
function normalizeTicketListParams(params: MyTicketListQuery): MyTicketListQuery {
  return {
    status: params.status,
    page: params.page ?? 0,
    size: params.size ?? 20,
    sort: params.sort ?? 'startAt,asc',
  }
}

/* ------------------------------ 조회 ------------------------------ */

/** API-ticket-04 내 티켓 목록(A-07). */
export function useMyTickets(
  params: MyTicketListQuery = {},
  options: { enabled?: boolean } = {},
) {
  const normalized = normalizeTicketListParams(params)
  return useQuery({
    queryKey: qk.ticket.mine(normalized),
    queryFn: ({ signal }) => fetchMyTickets(normalized, { signal }),
    enabled: options.enabled ?? true,
  })
}

/** 목록 카드 묶기와 동일 공연 QR 순서에 필요한 상태별 티켓을 끝 페이지까지 읽는다. */
export async function fetchAllMyTicketPages(
  params: AllMyTicketQuery = {},
  options: { signal?: AbortSignal } = {},
) {
  const items: NonNullable<MyTicketListResult['items']> = []
  let page = 0
  let last: MyTicketListResult | undefined

  while (true) {
    last = await fetchMyTickets(
      {
        status: params.status,
        sort: params.sort ?? 'startAt,asc',
        page,
        size: ALL_TICKETS_PAGE_SIZE,
      },
      options,
    )
    const pageItems = last.items ?? []
    items.push(...pageItems)
    if (!last.pageInfo?.hasNext || pageItems.length === 0) break
    page = (last.pageInfo.page ?? page) + 1
  }

  return {
    ...last,
    items,
    pageInfo: last?.pageInfo ? { ...last.pageInfo, hasNext: false } : undefined,
  } satisfies MyTicketListResult
}

export function useAllMyTickets(
  params: AllMyTicketQuery = {},
  options: { enabled?: boolean } = {},
) {
  const normalized: AllMyTicketQuery = {
    status: params.status,
    sort: params.sort ?? 'startAt,asc',
  }
  return useQuery({
    queryKey: qk.ticket.allMine(normalized),
    queryFn: ({ signal }) => fetchAllMyTicketPages(normalized, { signal }),
    enabled: options.enabled ?? true,
  })
}

/** API-ticket-05 티켓 상세(A-08). 소유자가 아니면 403 `TICKET_NOT_OWNED`. */
export function useTicketDetail(
  ticketId: number | undefined,
  options: { enabled?: boolean; keepPrevious?: boolean } = {},
) {
  return useQuery({
    queryKey: qk.ticket.detail(ticketId ?? 0),
    queryFn: ({ signal }) => fetchTicketDetail(ticketId as number, { signal }),
    enabled: (options.enabled ?? true) && typeof ticketId === 'number',
    placeholderData: options.keepPrevious ? (previous) => previous : undefined,
  })
}

/**
 * API-ticket-06 동적 QR(A-08).
 *
 * `USED`·`CANCELLED` 티켓에는 서버가 발급하지 않으므로(409) 화면이 `enabled`로 막아 준다 —
 * 상태를 아는 쪽은 티켓 상세다. 회전 주기보다 잦게 부르면 429가 오니 주기를 임의로 줄이지 않는다.
 */
export function useTicketQr(ticketId: number | undefined, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.ticket.qr(ticketId ?? 0),
    queryFn: ({ signal }) => fetchTicketQr(ticketId as number, { signal }),
    enabled: (options.enabled ?? true) && typeof ticketId === 'number',
    // 회전 토큰이라 "신선함"이 없다. 받은 순간부터 낡는다.
    staleTime: 0,
    gcTime: 0,
    refetchInterval: (query) => query.state.data?.rotateAfterMs ?? QR_ROTATE_FALLBACK_MS,
    // 탭을 떠났다 돌아오면 토큰이 이미 죽어 있다. 전역 false를 여기서만 뒤집는다.
    refetchOnWindowFocus: true,
    // 화면에 없을 때까지 돌릴 이유가 없다(429 방지).
    refetchIntervalInBackground: false,
  })
}
