import { useId } from 'react'
import './performance-editorial.css'
import { useLocale } from '@/shared/i18n/useLocale'
import { Button, FixedBottom, MobileHeader, Poster, StatusBadge } from '@/shared/ui'
import type { ShowStatus } from '@/shared/ui'

/** 화면이 그리는 데 필요한 값만 추린 모양. API 연결 시 `ApiData<'performance_03'>`로 교체한다. */
export interface PerformanceDetailView {
  performanceId: number
  title: string
  status: ShowStatus
  /** 회원 시간대 기준 표시 문자열 + KST 병기 (화면설계 v6 §5.13) */
  dateLabel: string
  venue: string
  teamNames: string[]
  /** 원 값(YoYo 정수)을 천 단위로 포맷한 문자열 */
  minPriceLabel: string
  /** 표시 통화 환산. `display_currency`가 KRW면 없다 */
  minPriceApprox?: string
  description: string
  posterImageUrl?: string | null
  /** 판매 마감·매진 등으로 예매가 막힌 경우 */
  bookingDisabled?: boolean
  bookingDisabledReason?: string
}

interface Props {
  data: PerformanceDetailView
  onBook: () => void
}

export function PerformanceDetail({ data, onBook }: Props) {
  const { text } = useLocale()
  const ticketId = useId()
  const reasonId = useId()
  const bookLabel = text('예매하기', 'Book now')
  const describedBy = data.bookingDisabled && data.bookingDisabledReason ? reasonId : undefined

  return (
    <div className="show-detail-editorial min-h-dvh">
      <MobileHeader title={text('공연 상세', 'Show details')} />
      <main className="show-detail-editorial__shell">
        <div className="show-detail-editorial__grid">
          <div className="show-detail-editorial__summary">
            <header>
              <StatusBadge status={data.status} />
              <h1>{data.title}</h1>
              <dl className="show-detail-editorial__facts">
                <div>
                  <dt>{text('공연 일시', 'Date & time')}</dt>
                  <dd>{data.dateLabel}</dd>
                </div>
                <div>
                  <dt>{text('장소', 'Venue')}</dt>
                  <dd>{data.venue}</dd>
                </div>
              </dl>
            </header>
            <section className="show-detail-editorial__booking" aria-labelledby={ticketId}>
              <div>
                <h2 id={ticketId}>{text('티켓', 'Tickets')}</h2>
                <span>{text('최저가', 'From')}</span>
                <strong>{data.minPriceLabel}</strong>
                {data.minPriceApprox && <small>≈ {data.minPriceApprox}</small>}
              </div>
              <div className="show-detail-editorial__book-button">
                <Button full onClick={onBook} disabled={data.bookingDisabled} aria-describedby={describedBy}>
                  {bookLabel}
                </Button>
              </div>
              {describedBy && <p id={reasonId}>{data.bookingDisabledReason}</p>}
            </section>
          </div>
          <div className="show-detail-editorial__art">
            <div className="show-detail-editorial__poster" style={{ viewTransitionName: 'show-poster' }}>
              <Poster src={data.posterImageUrl} seed={String(data.performanceId)} label={data.title} alt="" ratio="2/3" />
            </div>
          </div>
          <div className="show-detail-editorial__content">
            <section className="show-detail-editorial__section">
              <h2>{text('참여팀', 'Artists')}</h2>
              <ul className="show-detail-editorial__artists">
                {data.teamNames.map((name, index) => <li key={index}>{name}</li>)}
              </ul>
            </section>
            <section className="show-detail-editorial__section">
              <h2>{text('공연 소개', 'About the show')}</h2>
              <p className="show-detail-editorial__description">{data.description}</p>
            </section>
          </div>
        </div>
      </main>
      <FixedBottom>
        <Button full onClick={onBook} disabled={data.bookingDisabled} aria-describedby={describedBy}>
          {bookLabel}
        </Button>
      </FixedBottom>
    </div>
  )
}
