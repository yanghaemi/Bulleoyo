import { useLocale } from '@/shared/i18n/useLocale'
import type { TicketListItem, TicketTab } from './MyTickets'
import { ConcertTicket } from './ConcertTicket'
import { performanceMediaUrl } from '@/shared/api/domains/performanceMedia'

const BADGE = { upcoming: 'valid', used: 'used', cancelled: 'cancelled' } as const satisfies Record<
  TicketTab,
  string
>
interface Props {
  ticket: TicketListItem
  index: number
  locked: boolean
  onLockChange: () => void
  onSelect: () => void
}
export function TicketStub({ ticket, locked, onSelect }: Props) {
  const { text } = useLocale()
  const handleClick = () => {
    if (locked) return
    onSelect()
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-disabled={locked}
      className="ticket-list-item relative block w-full min-w-0 cursor-pointer overflow-hidden rounded-card text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
    >
      <ConcertTicket
        title={ticket.showTitle}
        dateLabel={ticket.dateLabel}
        venue={ticket.venue}
        ticketTypeName={ticket.ticketTypeName}
        teamName={ticket.teamName}
        status={BADGE[ticket.tab]}
        serialLabel={text('티켓번호', 'Ticket number')}
        serial={ticket.ticketId}
        posterImageUrl={ticket.posterImageUrl}
        ticketArtworkImageUrl={
          ticket.performanceId
            ? performanceMediaUrl(ticket.performanceId, 'ticket-artwork')
            : undefined
        }
        density="compact"
      >
        {ticket.orderNumber && (
          <span className="text-[10px]">
            {text('예매번호', 'Order')} {ticket.orderNumber}
          </span>
        )}
      </ConcertTicket>
      {(ticket.ticketCount ?? 1) > 1 && (
        <span className="ticket-list-item__count">
          {text(`${ticket.ticketCount}장`, `${ticket.ticketCount} tickets`)}
        </span>
      )}
    </button>
  )
}
