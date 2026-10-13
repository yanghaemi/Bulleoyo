import clsx from 'clsx'
import { useLocale } from '@/shared/i18n/useLocale'
import type { BookingCompleteView } from './bookingCompleteModel'
import { ConcertTicket } from './ConcertTicket'
import { performanceMediaUrl } from '@/shared/api/domains/performanceMedia'
import './ConcertCollectorTicket.css'

interface Props {
  data: BookingCompleteView
  className?: string
  decorative?: boolean
}
export function ConcertCollectorTicket({ data, className, decorative = false }: Props) {
  const { text } = useLocale()
  return (
    <article
      data-testid="concert-collector-ticket"
      data-ticket-layout="concert-blue"
      aria-label={
        decorative
          ? undefined
          : text(`발행된 티켓 ${data.orderNumber}`, `Issued ticket ${data.orderNumber}`)
      }
      aria-hidden={decorative || undefined}
      role={decorative ? 'presentation' : undefined}
      className={clsx('collector-ticket', className)}
    >
      <ConcertTicket
        title={data.showTitle}
        dateLabel={data.dateLabel}
        venue={data.venue}
        ticketTypeName={data.ticketTypeName}
        teamName={data.teamName}
        status="issued"
        serialLabel={text('예매번호', 'Order')}
        serial={data.orderNumber}
        posterImageUrl={data.posterImageUrl}
        ticketArtworkImageUrl={
          data.performanceId
            ? performanceMediaUrl(data.performanceId, 'ticket-artwork')
            : undefined
        }
        density="full"
      />
      <dl className="collector-ticket__receipt">
        <div>
          <dt>{text('수량', 'Quantity')}</dt>
          <dd>
            {text(`${data.quantity}매`, `${data.quantity} ticket${data.quantity === 1 ? '' : 's'}`)}
          </dd>
        </div>
        <div>
          <dt>{text('결제 금액', 'Total paid')}</dt>
          <dd>{data.totalPaidLabel}</dd>
        </div>
        <div>
          <dt>{text('결제 시각', 'Paid')}</dt>
          <dd>{data.paidAtLabel}</dd>
        </div>
      </dl>
    </article>
  )
}
