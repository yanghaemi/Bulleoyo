import { useState } from 'react'
import { Link } from 'react-router'

import type { EditorialLineupShow } from './EditorialLineupStage'
import { ShowCarousel } from './ShowCarousel'
import { useLocale } from '@/shared/i18n/useLocale'

import './stage-gallery-stage.css'

interface Props {
  shows: EditorialLineupShow[]
  headingLevel?: 1 | 2
}

/** The approved v1 carousel composition, shared by preview and production. */
export function StageGalleryStage({ shows, headingLevel = 2 }: Props) {
  const { text } = useLocale()
  const [active, setActive] = useState(shows[0])
  if (!active) return null
  const Heading = headingLevel === 1 ? 'h1' : 'h2'

  return (
    <section className="stage-gallery" role="region" aria-label="Stage Gallery">
      <div className="stage-gallery__copy">
        <p className="stage-gallery__kicker">{text('이번 주의 무대', 'This week on stage')}</p>
        <Heading>{active.title}</Heading>
        <p>{active.dateLabel}</p>
        <p>{active.venue}</p>
        <strong>{active.priceLabel}</strong>
        <Link to={`/performances/${active.performanceId}`}>
          {text('공연 상세 보기', 'View show details')} <span aria-hidden>→</span>
        </Link>
      </div>
      <div className="stage-gallery__carousel">
        <ShowCarousel
          items={shows}
          onCenterChange={(item) => {
            setActive(shows.find((show) => show.performanceId === item.performanceId) ?? shows[0])
          }}
        />
      </div>
    </section>
  )
}
