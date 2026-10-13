import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { useLocale } from '@/shared/i18n/useLocale'
import './ConcertTicket.css'

export interface ConcertTicketProps {
  title: string
  dateLabel: string
  venue: string
  ticketTypeName: string
  teamName?: string
  status: 'valid' | 'used' | 'cancelled' | 'issued'
  serialLabel: string
  serial: string
  posterImageUrl?: string | null
  ticketArtworkImageUrl?: string | null
  density: 'compact' | 'full'
  children?: ReactNode
  className?: string
}
function TicketArt({ artworkUrl, posterUrl, title }: { artworkUrl?: string | null; posterUrl?: string | null; title: string }) {
  const { text } = useLocale()
  const [source, setSource] = useState<'artwork' | 'poster' | 'fallback'>(artworkUrl ? 'artwork' : posterUrl ? 'poster' : 'fallback')
  const url = source === 'artwork' ? artworkUrl : source === 'poster' ? posterUrl : undefined
  const colorTreatment =
    source === 'artwork' ? 'preserve' : source === 'poster' ? 'neutral-contrast' : 'brand'
  return (
    <span
      className="concert-ticket__art"
      data-source={source}
      data-color-treatment={colorTreatment}
    >
      {url ? (
        <img
          src={url}
          alt={text(`${title} 공연 포스터`, `${title} show poster`)}
          onError={() => setSource(source === 'artwork' && posterUrl ? 'poster' : 'fallback')}
        />
      ) : (
        <span
          data-testid="ticket-poster-fallback"
          data-title={title}
          aria-hidden="true"
          className="concert-ticket__typography"
        />
      )}
      <span className="concert-ticket__overlay" aria-hidden="true" />
      <span className="concert-ticket__ellipse" aria-hidden="true" />
    </span>
  )
}
export function ConcertTicket({
  title,
  dateLabel,
  venue,
  ticketTypeName,
  teamName,
  status,
  serialLabel,
  serial,
  posterImageUrl,
  ticketArtworkImageUrl,
  density,
  children,
  className,
}: ConcertTicketProps) {
  const { text } = useLocale()
  const statusLabel = {
    valid: text('사용 가능', 'Valid'),
    used: text('사용 완료', 'Used'),
    cancelled: text('취소됨', 'Cancelled'),
    issued: text('발행 완료', 'Issued'),
  }[status]
  return (
    <span
      className={clsx(
        'concert-ticket',
        `concert-ticket--${density}`,
        {
          'concert-ticket--entry': !!children,
        },
        className,
      )}
      data-status={status}
      data-mobile-layout="slim-landscape"
    >
      <TicketArt
        key={`${ticketArtworkImageUrl ?? ''}:${posterImageUrl ?? ''}`}
        artworkUrl={ticketArtworkImageUrl}
        posterUrl={posterImageUrl}
        title={title}
      />
      <span className="concert-ticket__content">
        <span className="concert-ticket__eyebrow">{text('공연 입장권', 'CONCERT PASS')}</span>
        <span className="concert-ticket__details">
          <span className="concert-ticket__title">{title}</span>
          <span className="concert-ticket__date">{dateLabel}</span>
          <span className="concert-ticket__venue">{venue}</span>
          <span className="concert-ticket__admission">
            <span className="concert-ticket__type">{ticketTypeName}</span>
            {teamName && <span className="concert-ticket__team">{teamName}</span>}
          </span>
          <span className="concert-ticket__status">{statusLabel}</span>
        </span>
      </span>
      <span className="concert-ticket__perforation" aria-hidden="true" />
      <span className="concert-ticket__stub">
        {children || <span className="concert-ticket__barcode" aria-hidden="true" />}
        <span className="concert-ticket__serial-block">
          <span className="concert-ticket__serial-label">{serialLabel}</span>
          <span className="concert-ticket__serial">{serial}</span>
        </span>
      </span>
    </span>
  )
}
