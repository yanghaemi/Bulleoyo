import { useLocale } from '@/shared/i18n/useLocale'
import { Button, MobileHeader } from '@/shared/ui'
import { NoticeSection } from './NoticeSection'
import { TicketQr } from './TicketQr'
import { ConcertTicket } from './ConcertTicket'
import './ticket-pages.css'

export type TicketDetailStatus = 'valid' | 'used' | 'cancelled'
export interface TicketDetailView {
  ticketId: string
  ticketNumber: string
  orderNumber: string
  showTitle: string
  dateLabel: string
  venue: string
  ticketTypeName: string
  teamName: string
  status: TicketDetailStatus
  performanceId?: string
  usedAtLabel?: string
  posterImageUrl?: string | null
  ticketArtworkImageUrl?: string | null
  qrToken?: string
  qrLoadFailed?: boolean
  issuedAt?: string
  expiresAt?: string
  rotateAfterMs?: number
  cancellable?: boolean
}
interface Props {
  data: TicketDetailView
  transitioning?: boolean
  ticketSequence?: { ticketIds: string[]; activeIndex: number }
  onSelectTicket?: (ticketId: string) => void
  onRotateQr: () => void
  onCancel: () => void
  onBack?: () => void
}
function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d={direction === 'left' ? 'm11 4-5 5 5 5' : 'm7 4 5 5-5 5'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function TicketDetail({
  data,
  transitioning = false,
  ticketSequence,
  onSelectTicket,
  onRotateQr,
  onCancel,
}: Props) {
  const { text } = useLocale()
  const isValid = data.status === 'valid'
  const hasSequence =
    !!onSelectTicket && !!ticketSequence && ticketSequence.ticketIds.length > 1
  const previousIndex = ticketSequence
    ? (ticketSequence.activeIndex - 1 + ticketSequence.ticketIds.length) %
      ticketSequence.ticketIds.length
    : 0
  const nextIndex = ticketSequence
    ? (ticketSequence.activeIndex + 1) % ticketSequence.ticketIds.length
    : 0
  return (
    <div className="ticket-detail-page min-h-dvh">
      <MobileHeader title={text('티켓 상세', 'Your ticket')} backTo="/tickets" />
      <main className="ticket-detail-page__shell">
        <h1 className="ticket-page-title hidden md:block">{text('티켓 상세', 'Your ticket')}</h1>
        <div className="ticket-detail-page__ticket-stage" aria-busy={transitioning}>
          <ConcertTicket
            title={data.showTitle}
            dateLabel={data.dateLabel}
            venue={data.venue}
            ticketTypeName={data.ticketTypeName}
            teamName={data.teamName}
            status={data.status}
            serialLabel={text('티켓번호', 'Ticket number')}
            serial={data.ticketNumber}
            posterImageUrl={data.posterImageUrl}
            ticketArtworkImageUrl={data.ticketArtworkImageUrl}
            density="full"
          >
            {isValid && !transitioning && (
              <TicketQr
                qrToken={data.qrToken}
                loadFailed={data.qrLoadFailed}
                issuedAt={data.issuedAt}
                expiresAt={data.expiresAt}
                rotateAfterMs={data.rotateAfterMs}
                onRotate={onRotateQr}
              />
            )}
          </ConcertTicket>
          {transitioning && (
            <span className="ticket-detail-page__transition-status" role="status">
              {text('다음 티켓을 불러오는 중', 'Loading next ticket')}
            </span>
          )}
        </div>
        {hasSequence && ticketSequence && (
          <nav
            className="ticket-detail-page__sequence"
            aria-label={text('같은 공연의 티켓 QR', 'Ticket QR codes for this show')}
          >
            <button
              type="button"
              aria-label={text('이전 티켓 QR', 'Previous ticket QR')}
              disabled={transitioning}
              onClick={() => onSelectTicket(ticketSequence.ticketIds[previousIndex])}
            >
              <Chevron direction="left" />
            </button>
            <span aria-live="polite">
              {ticketSequence.activeIndex + 1} / {ticketSequence.ticketIds.length}
            </span>
            <button
              type="button"
              aria-label={text('다음 티켓 QR', 'Next ticket QR')}
              disabled={transitioning}
              onClick={() => onSelectTicket(ticketSequence.ticketIds[nextIndex])}
            >
              <Chevron direction="right" />
            </button>
          </nav>
        )}
        <dl className="ticket-detail-page__metadata">
          <div className="min-w-0">
            <dt className="text-xs text-muted">{text('예매번호', 'Order number')}</dt>
            <dd className="mt-2 break-all font-mono text-sm text-ink">{data.orderNumber}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted">{text('티켓번호', 'Ticket number')}</dt>
            <dd className="mt-2 break-all font-mono text-sm text-ink">{data.ticketNumber}</dd>
          </div>
          {data.status === 'used' && data.usedAtLabel && (
            <div className="min-w-0 md:col-span-2">
              <dt className="text-xs text-muted">{text('사용된 시간', 'Used at')}</dt>
              <dd className="mt-2 break-words font-mono text-sm text-ink">{data.usedAtLabel}</dd>
            </div>
          )}
        </dl>
        <NoticeSection />
        {isValid && (
          <div className="pb-6 pt-4">
            <Button
              variant="danger"
              full
              disabled={transitioning || data.cancellable === false}
              onClick={onCancel}
            >
              {text('티켓 취소', 'Cancel ticket')}
            </Button>
            {data.cancellable === false && (
              <p className="mt-2 text-center text-xs text-muted">
                {text(
                  '취소 마감(공연 D-3)이 지나 취소할 수 없어요.',
                  'The cancellation deadline (3 days before the show) has passed.',
                )}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
