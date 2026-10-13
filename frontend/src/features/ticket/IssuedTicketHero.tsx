import type { BookingCompleteView } from './BookingComplete'
import { ConcertCollectorTicket } from './ConcertCollectorTicket'
import { TicketRevealStage } from './TicketRevealStage'

/**
 * A-06 public ticket entry point.
 *
 * The booking response renders one semantic ConcertCollectorTicket. That same
 * live DOM ticket is the animated object, so the reveal and the settled result
 * can never drift apart or expose placeholder performance data.
 */
export function IssuedTicketHero({ data }: { data: BookingCompleteView }) {
  return (
    <section
      data-testid="issued-ticket-hero"
      className="mx-auto mb-6 w-full max-w-[1180px] md:mb-8"
    >
      <TicketRevealStage>
        <ConcertCollectorTicket data={data} />
      </TicketRevealStage>
    </section>
  )
}
