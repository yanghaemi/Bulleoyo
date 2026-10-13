import { useState } from 'react'
import { Link } from 'react-router'
import { ShowCarousel, type CarouselItem } from './ShowCarousel'
import { StageFlare } from '@/shared/fx/StageFlare'
import { useLocale } from '@/shared/i18n/useLocale'
import { useTheme } from '@/shared/theme'
import { Poster } from '@/shared/ui/Poster'
import { ArrowRightIcon } from '@/shared/ui/EditorialIcons'
import './identity-stage.css'

export interface FeaturedShow extends CarouselItem {
  priceLabel: string
}
export function IdentityStage({
  shows,
  active,
  onCenterChange,
}: {
  shows: FeaturedShow[]
  active: FeaturedShow
  onCenterChange: (id: string) => void
}) {
  const { text } = useLocale()
  const [gpuActive, setGpuActive] = useState(false)
  const theme = useTheme()
  return (
    <div className="identity-b-stage">
      <div className="identity-b-stage__copy">
        <span className="editorial-lab__edition">
          {text('대표 공연', 'Featured show')} ·{' '}
          {String(shows.indexOf(active) + 1).padStart(2, '0')} /{' '}
          {String(shows.length).padStart(2, '0')}
        </span>
        <h1>{active.title}</h1>
        <p className="identity-b-stage__when">{active.dateLabel}</p>
        <p className="identity-b-stage__where">{active.venue}</p>
      </div>
      <div
        className="identity-b-stage__visual identity-b-stage__gpu-light"
        data-renderer={gpuActive && theme === 'dark' ? 'webgpu' : 'css'}
        data-gpu={gpuActive && theme === 'dark' ? 'on' : undefined}
      >
        {theme === 'dark' && <StageFlare onActiveChange={setGpuActive} />}
        <div className="identity-b-stage__beam" aria-hidden />
        <div className="identity-b-stage__floor" aria-hidden />
        <div className="identity-b-stage__carousel">
          <ShowCarousel
            items={shows}
            presentation="artwork"
            initialPerformanceId={active.performanceId}
            onCenterChange={(show) => onCenterChange(show.performanceId)}
          />
        </div>
        <span className="identity-b-stage__stub" aria-hidden>
          BULLEOYO · LIVE · 2026
        </span>
      </div>
      <div className="identity-b-stage__footer">
        <div className="identity-b-stage__booking">
          <strong>{active.priceLabel}</strong>
          <Link
            to={`/performances/${active.performanceId}`}
            className="editorial-lab__primary-link"
          >
            <span>{text('공연 자세히 보기', 'View show')}</span>
            <ArrowRightIcon />
          </Link>
        </div>
        {shows.length > 1 && (
          <p className="identity-b-stage__hint">
            {text(
              '포스터를 밀거나 양옆을 눌러 다음 공연을 확인하세요.',
              'Drag the posters or use the controls to browse.',
            )}
          </p>
        )}
      </div>
    </div>
  )
}

export function FeaturedShowList({
  shows,
  active,
  onSelect,
  concept,
}: {
  shows: FeaturedShow[]
  active: FeaturedShow
  onSelect: (id: string) => void
  concept: 'editorial-a' | 'identity-b'
}) {
  const { text } = useLocale()
  return (
    <div className="editorial-lab__list-stage" data-concept={concept}>
      <div className="editorial-lab__list-intro">
        <span>{text('선택한 공연', 'Selected show')}</span>
        <h1>{active.title}</h1>
        <p>
          {active.dateLabel} · {active.venue}
        </p>
        <strong>{active.priceLabel}</strong>
      </div>
      <ul
        className="editorial-lab__show-list"
        aria-label={text('대표 공연 목록', 'Featured show list')}
      >
        {shows.map((show, index) => (
          <li key={show.performanceId}>
            <button
              type="button"
              aria-pressed={show.performanceId === active.performanceId}
              onClick={() => onSelect(show.performanceId)}
            >
              <span className="editorial-lab__list-index">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="editorial-lab__list-poster">
                <Poster
                  src={show.posterImageUrl}
                  seed={show.performanceId}
                  label=""
                  ratio="2/3"
                  allowDemoArtwork={false}
                />
              </span>
              <span className="editorial-lab__list-copy">
                <strong>{show.title}</strong>
                <small>{show.dateLabel}</small>
                <small>{show.venue}</small>
              </span>
              <b>{show.priceLabel}</b>
              <span className="editorial-lab__list-arrow">
                <ArrowRightIcon />
              </span>
            </button>
            {show.performanceId === active.performanceId && (
              <Link
                className="editorial-lab__list-detail"
                to={`/performances/${show.performanceId}`}
              >
                {text('선택한 공연 자세히 보기', 'View selected show')}
                <ArrowRightIcon />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
