import { useState } from 'react'
import { Link } from 'react-router'

import type { CarouselItem } from './ShowCarousel'
import { useLocale } from '@/shared/i18n/useLocale'
import { Poster } from '@/shared/ui'

import './editorial-lineup-stage.css'

export interface EditorialLineupShow extends CarouselItem {
  priceLabel: string
}

interface Props {
  shows: EditorialLineupShow[]
  headingLevel?: 1 | 2
  allowDemoArtwork?: boolean
}

/**
 * The approved v2 discovery composition.
 *
 * This component is shared by the isolated design lab and the real home route,
 * so the preview cannot drift away from production again.
 */
export function EditorialLineupStage({
  shows,
  headingLevel = 2,
  allowDemoArtwork = false,
}: Props) {
  const { text } = useLocale()
  const [activeId, setActiveId] = useState(shows[0]?.performanceId)
  const active = shows.find((show) => show.performanceId === activeId) ?? shows[0]
  if (!active) return null

  const Heading = headingLevel === 1 ? 'h1' : 'h2'

  return (
    <section className="editorial-lineup" role="region" aria-label="Editorial Lineup">
      <div className="editorial-lineup__feature">
        <div className="editorial-lineup__poster">
          <Poster
            src={active.posterImageUrl}
            seed={active.performanceId}
            label={active.title}
            alt=""
            ratio="2/3"
            allowDemoArtwork={allowDemoArtwork}
          />
        </div>
        <div className="editorial-lineup__copy">
          <p className="editorial-lineup__kicker">{text('선택한 공연', 'Selected show')}</p>
          <Heading>{active.title}</Heading>
          <p>{active.dateLabel}</p>
          <p>{active.venue}</p>
          <strong>{active.priceLabel}</strong>
          <Link to={`/performances/${active.performanceId}`}>
            {text('예매 정보 보기', 'View booking details')} <span aria-hidden>→</span>
          </Link>
        </div>
      </div>

      <div className="editorial-lineup__list" aria-label={text('다른 공연', 'Other shows')}>
        {shows.map((show, index) => (
          <button
            key={show.performanceId}
            type="button"
            aria-pressed={show.performanceId === active.performanceId}
            onClick={() => setActiveId(show.performanceId)}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            <span>
              <strong>{show.title}</strong>
              <small>{show.dateLabel} · {show.venue}</small>
            </span>
            <span>{show.priceLabel}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
