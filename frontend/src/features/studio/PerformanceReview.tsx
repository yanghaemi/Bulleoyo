import { useId, useState } from 'react'

import { useLocale } from '@/shared/i18n/useLocale'
import { Button } from '@/shared/ui'

export interface PerformanceReviewInfo {
  title: string
  startAtLabel: string
  endAtLabel?: string
  venueName: string
  venueAddress?: string
}

export interface PerformanceReviewTicketType {
  key: string
  name: string
  priceLabel: string
  totalQuantityLabel: string
}

export interface PerformanceReviewProps {
  info: PerformanceReviewInfo
  posterImageUrl?: string
  ticketArtworkImageUrl?: string
  ticketTypes: PerformanceReviewTicketType[]
  onEditInfo: () => void
  onEditPoster: () => void
  onEditTicketArtwork: () => void
  onEditTicketTypes: () => void
  /** 실제 생성 흐름에서 다음 준비 단계로 이동한다. 랩 미리보기는 넘기지 않아 비활성 안내를 유지한다. */
  onContinue?: () => void
}

function ReviewImage({ src, alt, className, empty }: { src?: string; alt: string; className: string; empty: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className={`${className} flex items-center justify-center border-dashed bg-ground px-5 text-center text-sm leading-relaxed text-muted`}>
        {empty}
      </div>
    )
  }
  return <img key={src} src={src} alt={alt} className={className} onError={() => setFailed(true)} />
}

function ReviewSection({
  title,
  editLabel,
  onEdit,
  children,
  labelledBy,
}: {
  title: string
  editLabel: string
  onEdit: () => void
  children: React.ReactNode
  labelledBy: string
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className="min-w-0 rounded-card border border-line bg-surface p-5 md:p-6"
    >
      <div className="flex items-center justify-between gap-4 border-b border-line pb-4">
        <h3 id={labelledBy} className="m-0 text-lg font-semibold leading-snug text-ink">
          {title}
        </h3>
        <Button variant="ghost" sm aria-label={editLabel} onClick={onEdit}>
          {editLabel}
        </Button>
      </div>
      <div className="pt-5">{children}</div>
    </section>
  )
}

export function PerformanceReview({
  info,
  posterImageUrl,
  ticketArtworkImageUrl,
  ticketTypes,
  onEditInfo,
  onEditPoster,
  onEditTicketArtwork,
  onEditTicketTypes,
  onContinue,
}: PerformanceReviewProps) {
  const { text } = useLocale()
  const id = useId()

  return (
    <section aria-labelledby={`${id}-title`} className="min-w-0">
      <header className="mb-6 border-b border-line pb-5">
        <p className="m-0 text-sm font-semibold text-primary">
          {text('공연 등록', 'Publish show')}
        </p>
        <h2 id={`${id}-title`} className="mb-0 mt-2 text-2xl font-semibold leading-tight text-ink">
          {text('등록 전 확인', 'Review before publishing')}
        </h2>
        <p className="mb-0 mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          {text(
            '입력한 공연 정보와 이미지를 확인해 주세요. 수정이 필요하면 각 항목에서 이전 단계로 돌아갈 수 있습니다.',
            'Check the show information and images. Use the edit action in each section to return to that step.',
          )}
        </p>
      </header>

      <div className="grid min-w-0 gap-4">
        <ReviewSection
          title={text('공연 정보', 'Show information')}
          editLabel={text('공연 정보 수정', 'Edit show information')}
          onEdit={onEditInfo}
          labelledBy={`${id}-info`}
        >
          <dl className="m-0 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-muted">{text('공연명', 'Title')}</dt>
              <dd className="mb-0 ml-0 mt-1 text-lg font-semibold leading-snug text-ink">
                {info.title}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted">{text('시작', 'Starts')}</dt>
              <dd className="mb-0 ml-0 mt-1 text-sm leading-relaxed text-ink">
                {info.startAtLabel}
              </dd>
            </div>
            {info.endAtLabel && (
              <div>
                <dt className="text-xs font-medium text-muted">{text('종료', 'Ends')}</dt>
                <dd className="mb-0 ml-0 mt-1 text-sm leading-relaxed text-ink">
                  {info.endAtLabel}
                </dd>
              </div>
            )}
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-muted">{text('장소', 'Venue')}</dt>
              <dd className="mb-0 ml-0 mt-1 text-sm font-medium leading-relaxed text-ink">
                {info.venueName}
              </dd>
              {info.venueAddress && (
                <dd className="mb-0 ml-0 mt-1 text-sm leading-relaxed text-muted">
                  {info.venueAddress}
                </dd>
              )}
            </div>
          </dl>
        </ReviewSection>

        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <ReviewSection
            title={text('포스터', 'Poster')}
            editLabel={text('포스터 수정', 'Edit poster')}
            onEdit={onEditPoster}
            labelledBy={`${id}-poster`}
          >
            <ReviewImage
              src={posterImageUrl}
              alt={text('공연 포스터 미리보기', 'Show poster preview')}
              className="mx-auto aspect-[3/4] w-full max-w-64 rounded-control border border-line object-cover"
              empty={text('포스터가 아직 저장되지 않았습니다.', 'The poster has not been saved yet.')}
            />
          </ReviewSection>

          <ReviewSection
            title={text('티켓 이미지', 'Ticket artwork')}
            editLabel={text('티켓 꾸미기', 'Decorate ticket')}
            onEdit={onEditTicketArtwork}
            labelledBy={`${id}-artwork`}
          >
            <ReviewImage
              src={ticketArtworkImageUrl}
              alt={text('티켓 이미지 미리보기', 'Ticket artwork preview')}
              className="aspect-[5/2] w-full rounded-control border border-line object-cover"
              empty={text('티켓 이미지가 아직 저장되지 않았습니다.', 'The ticket artwork has not been saved yet.')}
            />
          </ReviewSection>
        </div>

        <ReviewSection
          title={text('티켓 옵션', 'Ticket options')}
          editLabel={text('티켓 옵션 수정', 'Edit ticket options')}
          onEdit={onEditTicketTypes}
          labelledBy={`${id}-tickets`}
        >
          <div>
            {ticketTypes.length ? (
              <ul className="m-0 grid list-none gap-3 p-0">
                {ticketTypes.map((ticket) => (
                  <li
                    key={ticket.key}
                    className="grid gap-2 rounded-control border border-line bg-ground px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-6"
                  >
                    <span className="min-w-0 break-words text-sm font-semibold text-ink">
                      {ticket.name}
                    </span>
                    <span className="text-sm text-ink">{ticket.priceLabel}</span>
                    <span className="text-sm text-muted">{ticket.totalQuantityLabel}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-sm leading-relaxed text-muted">
                {text('등록한 티켓 옵션이 없습니다.', 'No ticket options have been added.')}
              </p>
            )}
          </div>
        </ReviewSection>
      </div>

      <footer className="mt-6 rounded-card border border-line bg-surface p-5 md:p-6">
        <p
          id={`${id}-blocked`}
          role="status"
          className="m-0 text-sm font-medium leading-relaxed text-ink"
        >
          {onContinue
            ? text('내용을 확인했다면 공연 준비를 계속해 주세요.', 'Continue show setup after reviewing these details.')
            : text(
                '실제 이미지 저장 API 연결 전에는 최종 등록할 수 없습니다.',
                'Final publishing is unavailable until the real image storage API is connected.',
              )}
        </p>
        {!onContinue && (
          <p className="mb-4 mt-2 text-xs leading-relaxed text-muted">
            {text(
              '입력 내용은 이 미리보기 안에서만 확인할 수 있으며 서버에 저장되지 않습니다.',
              'The information is only shown in this preview and is not saved to the server.',
            )}
          </p>
        )}
        <Button full disabled={!onContinue} aria-describedby={`${id}-blocked`} onClick={onContinue}>
          {onContinue ? text('공연 준비 계속하기', 'Continue show setup') : text('공연 등록 준비 중', 'Publishing unavailable')}
        </Button>
      </footer>
    </section>
  )
}
