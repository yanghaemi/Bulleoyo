/**
 * A-07 내 티켓 목록 페이지 — 라우트 `/tickets`. 모바일 하단 탭 2번째.
 *
 * ── API (S15P21B204-100) ────────────────────────────────────────────────
 *   목록: `GET /api/v1/tickets/me` (API-ticket-04) — `useMyTickets`
 *
 * 탭은 **서버 필터**로 넘긴다. openapi `ticket_04`에 `status`(ISSUED·USED·CANCELLED) 쿼리가
 * 있어 클라이언트에서 나눌 이유가 없다(이전 TODO가 "명세에 적혀 있지 않다"고 한 것은 낡은 서술).
 * 탭 3개는 그 3값에 1:1이다 — Upcoming = `ISSUED`.
 *
 * ⚠ **명세 공백 — 목록 응답(`TicketSummary`)에 주문번호·관람 팀이 없다.** 카드가 그 둘을
 * 보여 주게 설계돼 있지만(화면설계 v6 A-07) ticket_04는 티켓 상태·공연 정보까지만 준다.
 * 지어내지 않고 그 줄을 비운 채 그린다 — 두 값은 티켓 상세(A-08)에서 볼 수 있다.
 *
 * 한계 — 첫 페이지(20장)만 읽는다. 더 있으면 안내 한 줄을 남긴다. 무한 스크롤·더 보기는
 * 페이지 누적 상태가 필요해 0층 범위 밖으로 미뤘다.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router'

import { MyTickets } from '@/features/ticket/MyTickets'
import type { TicketListItem, TicketTab } from '@/features/ticket/MyTickets'
import { groupTicketsByPerformance } from '@/features/ticket/ticketGrouping'
import type { MyTicketListQuery } from '@/shared/api/domains/ticket'
import { isDemo } from '@/shared/config'
import { useLocale } from '@/shared/i18n/useLocale'
import { useAllMyTickets } from '@/shared/queries/ticket'
import { formatKst, PageSkeleton } from '@/shared/ui'

/** 탭 → ticket_04 `status` 필터. 요구사항 v6 §5-1의 3값과 1:1 */
const TAB_STATUS: Record<TicketTab, NonNullable<MyTicketListQuery['status']>> = {
  upcoming: 'ISSUED',
  used: 'USED',
  cancelled: 'CANCELLED',
}

/** 데모 모드(`pnpm dev:demo`) 표본. 실제 API를 부르지 않는 별도 모드다 */
const DEMO_SAMPLE: TicketListItem[] = [
  {
    ticketId: '41',
    orderNumber: '91',
    performanceId: '12',
    showTitle: 'aespa — Synk: Parallel Line',
    dateLabel: '9월 20일 오후 6:30 KST',
    venue: 'KSPO Dome, Seoul',
    ticketTypeName: 'GA Standing',
    teamName: 'aespa',
    tab: 'upcoming',
  },
  {
    ticketId: '22',
    orderNumber: '82',
    performanceId: '8',
    showTitle: 'BTS World Tour: Yet to Come',
    dateLabel: '9월 15일 오후 7:00 KST',
    venue: 'Olympic Gymnastics Arena',
    ticketTypeName: 'GA Standing',
    teamName: 'BTS',
    tab: 'upcoming',
  },
  {
    ticketId: '11',
    orderNumber: '44',
    performanceId: '5',
    showTitle: 'IU Concert — The Golden Hour',
    dateLabel: '8월 10일 오후 7:00 KST',
    venue: 'Olympic Main Stadium',
    ticketTypeName: 'Reserved A',
    teamName: 'IU',
    tab: 'used',
  },
]

export function MyTicketsPage() {
  const { text, language } = useLocale()
  const navigate = useNavigate()
  const [tab, setTab] = useState<TicketTab>('upcoming')
  const query = useAllMyTickets({ status: TAB_STATUS[tab] })

  const open = (ticket: TicketListItem) =>
    // viewTransition — 앞으로 커진 티켓이 상세의 공연 정보 패널로 **모핑**된다(View Transitions API,
    // Chrome/Edge/Safari 18+). 미지원 브라우저는 그냥 이동한다. 이름 짝은 `ticket-morph`
    navigate(`/tickets/${ticket.ticketId}`, { viewTransition: true })

  if (isDemo) {
    const startTimes = ['2026-09-20T09:30:00Z', '2026-09-15T10:00:00Z', '2026-08-10T10:00:00Z']
    return (
      <MyTickets
        tickets={groupTicketsByPerformance(DEMO_SAMPLE.map((ticket, index) => ({
          ...ticket,
          dateLabel: formatKst(startTimes[index], 'Asia/Seoul', language),
        })))}
        active={tab}
        onTabChange={setTab}
        onSelect={open}
      />
    )
  }

  if (query.isPending) {
    return (
      <main className="mx-auto min-h-dvh max-w-[1200px] px-4 py-12">
        <PageSkeleton variant="tickets" />
      </main>
    )
  }

  if (query.isError) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <div className="max-w-sm text-center" role="alert">
          <p className="font-semibold text-ink">
            {text('티켓을 불러오지 못했습니다.', 'Could not load your tickets.')}
          </p>
          <button
            type="button"
            className="mt-4 rounded-button border border-line px-4 py-2 text-sm font-semibold text-ink"
            onClick={() => void query.refetch()}
          >
            {text('다시 시도', 'Retry')}
          </button>
        </div>
      </main>
    )
  }

  const items = query.data?.items ?? []
  // ticketId가 없는 줄은 열 수 없다. 나머지는 모르는 값이 있어도 버리지 않는다
  const tickets = groupTicketsByPerformance<TicketListItem>(items
    .filter((t) => t.ticketId != null)
    .map((t) => ({
      ticketId: String(t.ticketId),
      performanceId: t.performanceId != null ? String(t.performanceId) : undefined,
      showTitle: t.performanceTitle ?? text('공연', 'Show'),
      dateLabel: t.startAt ? formatKst(t.startAt, undefined, language) : '—',
      venue: t.venueName ?? '—',
      ticketTypeName: t.ticketTypeName ?? text('티켓', 'Ticket'),
      teamName: t.chosenTeamName,
      // 서버가 status로 걸러 준 목록이라 탭은 현재 탭이다. 응답 status가 어긋나면 그 값을 따른다
      tab: t.status ? STATUS_TAB[t.status] : tab,
    })))

  return <MyTickets tickets={tickets} active={tab} onTabChange={setTab} onSelect={open} />
}

/** ticket_04 `status` → 탭. 서버 필터와 반대 방향 매핑이다 */
const STATUS_TAB: Record<'ISSUED' | 'USED' | 'CANCELLED', TicketTab> = {
  ISSUED: 'upcoming',
  USED: 'used',
  CANCELLED: 'cancelled',
}

export default MyTicketsPage
