/**
 * A-07 내 티켓 목록.
 *
 * 정본 — 와이어프레임 A-07R(모바일 360) · A-07DR(1440) · 화면설계 v6 §4 A-07
 *        · API 명세 v6 API-ticket-04 (`GET /api/v1/tickets/me`)
 *
 * - 모바일: 탭 3개 → 1열 카드 목록 → **하단 탭바**(§5.18). 하단 고정 액션이 없다
 * - PC: 제목 → 탭 → 3열 그리드
 *
 * 탭은 티켓 상태 3값(`ISSUED`/`USED`/`CANCELLED`)에 1:1로 대응한다(요구사항 v6 §5-1).
 * 화면 라벨은 Upcoming/Used/Cancelled이고, `ISSUED` → "Upcoming"으로 읽는다.
 *
 * ⚠ 화면설계 v6 §5.1의 Ticket 상태 라벨은 `ISSUED` = "사용 가능"/"Valid"인데
 * 와이어프레임 탭은 "Upcoming"이다. 탭은 시간 기준(다가오는 공연), 배지는 상태 기준이라
 * 서로 다른 축이다. 배지에는 §5.1 라벨을 쓰고 탭 이름만 와이어프레임을 따랐다.
 *
 * 2026-09-08 티켓 모양 — 카드 한 장의 생김새는 `TicketStub`으로 나갔다. 여기 남은 것은
 * **목록의 일**뿐이다: 필터·빈 상태·등장 연출의 지휘. 한 화면 안에서 "무엇을 보여줄지"와
 * "어떻게 생겼는지"를 나눠 둬야 카드 모양을 바꿀 때 목록 로직을 건드리지 않는다.
 *
 * 2026-09-21: 목록과 탭 변경 결과는 즉시 표시하고 상세 진입을 장식 연출로 지연하지 않는다.
 * 예매 완료의 티켓 인쇄 연출과 이 목록의 탐색 동작은 별개다.
 */

import { Link } from 'react-router'
import { useLocale } from '@/shared/i18n/useLocale'
import './ticket-pages.css'

import { TicketStub } from '@/features/ticket/TicketStub'
import { AppHeader, BottomNav, Tabs } from '@/shared/ui'

export type TicketTab = 'upcoming' | 'used' | 'cancelled'

export interface TicketListItem {
  ticketId: string
  /** 같은 공연에서 소유한 실제 티켓. 목록은 한 장으로 보이고 상세에서 QR을 넘긴다. */
  ticketIds?: string[]
  ticketCount?: number
  /**
   * ⚠ **목록 응답(`TicketSummary`)에 없다.** 주문번호·관람 팀은 티켓 상세(ticket_05)에만 있어
   * 목록에서는 모르는 값이다. 지어내지 않고 선택으로 두며, 없으면 카드에서 그 줄이 빠진다.
   */
  orderNumber?: string
  showTitle: string
  dateLabel: string
  venue: string
  ticketTypeName: string
  /** ⚠ 목록 응답에 없다(위 `orderNumber`와 같은 이유). */
  teamName?: string
  tab: TicketTab
  posterImageUrl?: string | null
  /**
   * 이 티켓이 속한 공연 ID. 포스터 더미의 seed다 — **ticketId가 아니다.**
   * 카드에 보이는 그림은 티켓이 아니라 공연을 가리키므로, 같은 공연의 티켓 두 장은
   * 같은 그림이어야 한다. 없으면 `showTitle`로 떨어진다.
   */
  performanceId?: string
}

interface Props {
  tickets: TicketListItem[]
  active: TicketTab
  onTabChange: (tab: TicketTab) => void
  onSelect: (ticket: TicketListItem) => void
}

export function MyTickets({ tickets, active, onTabChange, onSelect }: Props) {
  const { text } = useLocale()
  const tabs: { id: TicketTab; label: string }[] = [
    { id: 'upcoming', label: text('사용 가능', 'Upcoming') },
    { id: 'used', label: text('사용 완료', 'Used') },
    { id: 'cancelled', label: text('취소됨', 'Cancelled') },
  ]
  const filtered = tickets.filter((t) => t.tab === active)
  const handleTab = (tab: TicketTab) => {
    if (tab === active) return
    onTabChange(tab)
  }

  return (
    <div className="ticket-library min-h-dvh pb-16 md:pb-0">
      <AppHeader signedIn />
      <main className="ticket-library__shell">
        <h1 className="ticket-page-title">{text('내 티켓', 'My Tickets')}</h1>

        <div className="ticket-library__tabs">
          <Tabs tabs={tabs} active={active} onChange={handleTab} />
        </div>

        {filtered.length === 0 ? (
          <div className="ticket-library__empty">
            <p className="m-0 font-sans text-[13px] text-muted md:text-sm">
              {text('이 분류에 해당하는 티켓이 없어요.', 'No tickets in this category')}
            </p>
            <Link
              to="/performances"
              className="inline-flex min-h-11 items-center font-semibold text-primary"
            >
              {text('공연 찾아보기', 'Browse shows')}
            </Link>
          </div>
        ) : (
          <div
            // 2열 — 티켓은 포스터·절취선·스텁이 폭을 먹어 3열(≈220px)에서는 공연명이 두 글자만 남는다
            className="ticket-library__grid"
          >
            {filtered.map((ticket, i) => (
              <TicketStub
                key={ticket.ticketId}
                ticket={ticket}
                index={i}
                locked={false}
                onLockChange={() => undefined}
                onSelect={() => onSelect(ticket)}
              />
            ))}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
