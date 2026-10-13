/**
 * ticket — 내 티켓·티켓 상세·동적 QR (API-ticket-04 · 05 · 06).
 *
 * 정본: `docs/design/06_API_명세서_v6.md` §6 ticket · `docs/design/api/openapi.yaml`
 *       operationId `ticket_04`(GET /tickets/me) · `ticket_05`(GET /tickets/{ticketId})
 *       · `ticket_06`(GET /tickets/{ticketId}/qr)
 *
 * ─────────────────────────────── QR 주의 ───────────────────────────────
 * `ticket_06`은 **TOTP 방식 동적 QR**이다. 서버가 30초 윈도우로 HMAC을 계산해 주고 토큰 유효는 60초다.
 * 캐시를 오래 붙들면 **만료된 QR을 보여주게 되고 현장에서 `ENTRY_QR_EXPIRED`로 튕긴다.**
 * 회전 주기는 응답의 `rotateAfterMs`(고정 30000)가 정본이며, 캐시 정책은 `shared/queries/ticket.ts`에 있다.
 *
 * QR·입장은 온체인과 무관하다(v4 — 티켓 유효성은 DB 소유권 + 서명 QR이 정한다).
 */

import { api, type QueryParams } from '@/shared/api/client'
import type { ApiData, ApiQuery } from '@/shared/api/schema'

/* ------------------------------ 타입 ------------------------------ */

/** `GET /tickets/me` 쿼리. 기본값은 openapi default와 같다(page 0 · size 20 · startAt,asc). */
export type MyTicketListQuery = NonNullable<ApiQuery<'ticket_04'>>
/** 목록 응답. `cancellable`이 true면 환불 수신처는 항상 지갑 잔액(`refundTarget: WALLET_BALANCE`)이다. */
export type MyTicketListResult = ApiData<'ticket_04'>

/** `GET /tickets/{ticketId}` 응답. **QR 토큰은 여기 없다** — 회전 토큰은 API-ticket-06이 발급한다. */
export type TicketDetail = ApiData<'ticket_05'>

/** `GET /tickets/{ticketId}/qr` 응답. `rotateAfterMs` 주기로 재발급한다. */
export type TicketQr = ApiData<'ticket_06'>

/* ------------------------------ 호출 ------------------------------ */

/** API-ticket-04 내 티켓 목록. */
export function fetchMyTickets(
  params: MyTicketListQuery = {},
  options: { signal?: AbortSignal } = {},
): Promise<MyTicketListResult> {
  const query: QueryParams = {
    status: params.status,
    page: params.page,
    size: params.size,
    sort: params.sort,
  }
  return api.get<MyTicketListResult>('/tickets/me', { query, signal: options.signal })
}

/** API-ticket-05 티켓 상세. 소유자가 아니면 403 `TICKET_NOT_OWNED`. */
export function fetchTicketDetail(
  ticketId: number,
  options: { signal?: AbortSignal } = {},
): Promise<TicketDetail> {
  return api.get<TicketDetail>('/tickets/' + ticketId, { signal: options.signal })
}

/**
 * API-ticket-06 동적 QR 토큰 발급.
 *
 * `USED`·`CANCELLED` 티켓에는 발급하지 않는다(409 `TICKET_ALREADY_USED` / `TICKET_CANCELED`).
 * 회전 주기보다 잦게 부르면 429 `COMMON_TOO_MANY_REQUESTS`가 온다 — 폴링 주기를 임의로 줄이지 않는다.
 */
export function fetchTicketQr(
  ticketId: number,
  options: { signal?: AbortSignal } = {},
): Promise<TicketQr> {
  return api.get<TicketQr>('/tickets/' + ticketId + '/qr', { signal: options.signal })
}
