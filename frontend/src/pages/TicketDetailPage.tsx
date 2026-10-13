/**
 * A-08 티켓 상세·QR 페이지 — 라우트 `/tickets/:ticketId`.
 *
 * ── API (S15P21B204-100) ────────────────────────────────────────────────
 *   상세: `GET /api/v1/tickets/{ticketId}` (API-ticket-05) — `useTicketDetail`
 *   QR  : `GET /api/v1/tickets/{ticketId}/qr` (API-ticket-06) — `useTicketQr`
 *
 * QR은 `rotateAfterMs`(30초)마다 서버에서 다시 받는다. 회전·캐시 정책은 `shared/queries/ticket.ts`에
 * 있고 화면은 **언제 켜고 끄는지**만 정한다 — `USED`·`CANCELLED`에는 서버가 발급하지 않으므로
 * (409) `enabled`로 막는다. 상태를 아는 쪽이 여기다.
 *
 * ── `ENTRY_QR_EXPIRED`는 세션 만료가 아니다 ───────────────────────────────
 * HTTP는 401이지만 회원 세션과 무관하다. 공용 클라이언트가 `PASSTHROUGH_UNAUTHORIZED_CODES`로
 * 가로채지 않고 그대로 넘겨주므로(shared/api/errorCodes) 여기서 **재발급**으로 처리한다.
 * 401을 status로 뭉뚱그리면 관객이 입장 줄에서 로그인 화면으로 튕긴다.
 *
 * ⚠ **명세 공백 — `TicketDetail`에 티켓번호·주문번호 필드가 없다.** 식별자는 `ticketId`·`orderId`
 * 정수뿐이라 그 값을 그대로 보여 준다(A-06이 `orderRef ?? String(orderId)`로 떨어지는 것과 같은
 * 규칙). `TKT-0041` 같은 표기는 서버가 주지 않는 형식이므로 만들지 않는다.
 */

import { useEffect, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { TicketDetail } from '@/features/ticket/TicketDetail'
import type { TicketDetailStatus, TicketDetailView } from '@/features/ticket/TicketDetail'
import { isApiError } from '@/shared/api/client'
import { performanceMediaUrl } from '@/shared/api/domains/performanceMedia'
import type { TicketDetail as TicketDetailData } from '@/shared/api/domains/ticket'
import type { MyTicketListQuery } from '@/shared/api/domains/ticket'
import { EntryCode } from '@/shared/api/errorCodes'
import { isDemo } from '@/shared/config'
import { useLocale } from '@/shared/i18n/useLocale'
import { useAllMyTickets, useTicketDetail, useTicketQr } from '@/shared/queries/ticket'
import { formatKst, PageSkeleton } from '@/shared/ui'

/** 403 — 남의 티켓. 목록으로 돌려보낸다(화면설계 v6 §2 AUDIENCE) */
const TICKET_NOT_OWNED = 'TICKET_NOT_OWNED'

/** 요구사항 v6 §5-1 `ticket.status` 3값 → 화면 상태 */
const STATUS_VIEW: Record<'ISSUED' | 'USED' | 'CANCELLED', TicketDetailStatus> = {
  ISSUED: 'valid',
  USED: 'used',
  CANCELLED: 'cancelled',
}

const VIEW_STATUS: Record<TicketDetailStatus, NonNullable<MyTicketListQuery['status']>> = {
  valid: 'ISSUED',
  used: 'USED',
  cancelled: 'CANCELLED',
}

/** 데모 모드(`pnpm dev:demo`) 표본 */
const DEMO_SAMPLE: TicketDetailView = {
  ticketId: '41',
  ticketNumber: '41',
  orderNumber: '91',
  performanceId: '12',
  showTitle: 'aespa — Synk: Parallel Line',
  dateLabel: '9월 20일 오후 6:30 KST',
  venue: 'KSPO Dome, Seoul',
  ticketTypeName: 'GA Standing',
  teamName: 'aespa',
  status: 'valid',
  qrToken: 'sample',
  rotateAfterMs: 30_000,
  cancellable: true,
}

function toTicketId(raw: string | undefined): number | undefined {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

/** ticket_05 → A-08 뷰. 상태를 모르면 그리지 않는다 — QR을 보여줄지 말지가 거기 걸려 있다 */
function toDetailView(
  data: TicketDetailData,
  text: (ko: string, en: string) => string,
  language: 'ko' | 'en',
): TicketDetailView | undefined {
  if (data.ticketId == null || !data.status || !Object.hasOwn(STATUS_VIEW, data.status))
    return undefined

  return {
    ticketId: String(data.ticketId),
    ticketNumber: String(data.ticketId),
    orderNumber: data.orderId != null ? String(data.orderId) : '—',
    performanceId: data.performanceId != null ? String(data.performanceId) : undefined,
    ticketArtworkImageUrl:
      data.performanceId != null
        ? performanceMediaUrl(data.performanceId, 'ticket-artwork')
        : undefined,
    showTitle: data.performanceTitle ?? text('공연', 'Show'),
    dateLabel: data.startAt ? formatKst(data.startAt, undefined, language) : '—',
    venue: data.venueName ?? '—',
    ticketTypeName: data.ticketTypeName ?? text('티켓', 'Ticket'),
    // 관람 팀을 모르면 그 자리를 비운다(`—`). 팀은 정산 가중치라 짐작해 채우면 안 된다
    teamName: data.chosenTeamName ?? '—',
    status: STATUS_VIEW[data.status],
    usedAtLabel: data.usedAt ? formatKst(data.usedAt, undefined, language) : undefined,
    cancellable: data.cancellable,
  }
}

export function TicketDetailPage() {
  const { text, language } = useLocale()
  const { ticketId: ticketIdParam } = useParams()
  const navigate = useNavigate()
  const ticketId = toTicketId(ticketIdParam)

  const detail = useTicketDetail(ticketId, { enabled: !isDemo, keepPrevious: true })
  const view = detail.data ? toDetailView(detail.data, text, language) : undefined
  const related = useAllMyTickets(
    { status: view ? VIEW_STATUS[view.status] : undefined },
    { enabled: !isDemo && view?.performanceId !== undefined },
  )
  // `USED`·`CANCELLED`에는 서버가 QR을 발급하지 않는다(409). 부르지 않는다
  const detailMatchesRoute =
    detail.data?.ticketId === ticketId && detail.isPlaceholderData !== true
  const qr = useTicketQr(ticketId, {
    enabled: !isDemo && detailMatchesRoute && view?.status === 'valid',
  })

  const relatedTicketIds = (related.data?.items ?? [])
    .filter(
      (item) =>
        item.ticketId != null &&
        item.performanceId != null &&
        String(item.performanceId) === view?.performanceId,
    )
    .map((item) => String(item.ticketId))
  const ticketIds = view
    ? relatedTicketIds.includes(view.ticketId)
      ? relatedTicketIds
      : [view.ticketId, ...relatedTicketIds]
    : []
  const activeTicketIndex = view ? Math.max(0, ticketIds.indexOf(view.ticketId)) : 0

  // 만료된 토큰은 **즉시** 다시 받는다. 30초 회전을 기다리면 그동안 입장할 수 없다.
  // 오류 객체가 매 요청마다 바뀌어도 같은 실패 구간에는 즉시 복구를 한 번만 한다.
  // 정상 응답 또는 다른 티켓으로 이동한 뒤에만 다음 복구를 허용한다.
  const handledExpiry = useRef<{ ticketId: number | undefined; attempted: boolean }>({
    ticketId,
    attempted: false,
  })
  useEffect(() => {
    if (handledExpiry.current.ticketId !== ticketId || qr.isSuccess) {
      handledExpiry.current = { ticketId, attempted: false }
    }
    const error = qr.error
    if (!detailMatchesRoute) return
    if (!isApiError(error) || error.code !== EntryCode.QR_EXPIRED) return
    if (handledExpiry.current.attempted) return
    handledExpiry.current.attempted = true
    void qr.refetch()
  }, [detailMatchesRoute, qr, ticketId])

  if (isDemo) {
    return (
      <TicketDetail
        data={{
          ...DEMO_SAMPLE,
          dateLabel: formatKst('2026-09-20T09:30:00Z', 'Asia/Seoul', language),
        }}
        onRotateQr={() => {}}
        onCancel={() => navigate(`/tickets/${ticketIdParam ?? DEMO_SAMPLE.ticketId}/cancel`)}
      />
    )
  }

  // 주소가 티켓 번호가 아니거나(재조회해도 같다) 남의 티켓·없는 티켓이면 목록으로 보낸다
  const notOwned = isApiError(detail.error) && detail.error.code === TICKET_NOT_OWNED
  const notFound = isApiError(detail.error) && detail.error.status === 404
  if (ticketId === undefined || notOwned || notFound) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <div className="max-w-sm text-center" role="alert">
          <p className="font-semibold text-ink">
            {notOwned
              ? text(
                  '이 티켓을 볼 수 있는 권한이 없습니다.',
                  'You do not have access to this ticket.',
                )
              : text('티켓을 찾을 수 없습니다.', 'Ticket not found.')}
          </p>
          <Link
            to="/tickets"
            className="mt-4 inline-flex min-h-11 items-center rounded-button border border-line px-4 text-sm font-semibold text-ink"
          >
            {text('내 티켓으로', 'My tickets')}
          </Link>
        </div>
      </main>
    )
  }

  if (detail.isPending) {
    return (
      <main className="mx-auto min-h-dvh max-w-[1200px] px-4 py-12">
        <PageSkeleton variant="detail" />
      </main>
    )
  }

  if (!view) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <div className="max-w-sm text-center" role="alert">
          <p className="font-semibold text-ink">
            {text('티켓을 불러오지 못했습니다.', 'Could not load your ticket.')}
          </p>
          <button
            type="button"
            className="mt-4 rounded-button border border-line px-4 py-2 text-sm font-semibold text-ink"
            onClick={() => void detail.refetch()}
          >
            {text('다시 시도', 'Retry')}
          </button>
        </div>
      </main>
    )
  }

  return (
    <TicketDetail
      // QR 실패는 티켓 자체를 가리지 않는다 — 토큰 자리만 비고 회전이 계속 다시 받는다(§5.10 패널 단위)
      data={{
        ...view,
        qrToken: detailMatchesRoute && !qr.error ? qr.data?.qrToken : undefined,
        qrLoadFailed: detailMatchesRoute && Boolean(qr.error),
        issuedAt: detailMatchesRoute ? qr.data?.issuedAt : undefined,
        expiresAt: detailMatchesRoute ? qr.data?.expiresAt : undefined,
        rotateAfterMs: detailMatchesRoute ? qr.data?.rotateAfterMs : undefined,
      }}
      transitioning={detail.isPlaceholderData === true}
      ticketSequence={{ ticketIds, activeIndex: activeTicketIndex }}
      onSelectTicket={(nextTicketId) =>
        navigate(`/tickets/${nextTicketId}`, { replace: true, viewTransition: true })
      }
      onRotateQr={() => {
        if (detailMatchesRoute) void qr.refetch()
      }}
      onCancel={() => {
        if (detailMatchesRoute) navigate(`/tickets/${view.ticketId}/cancel`)
      }}
    />
  )
}

export default TicketDetailPage
