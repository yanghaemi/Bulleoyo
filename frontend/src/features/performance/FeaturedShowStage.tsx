import { useState } from 'react'
import { Link } from 'react-router'
import type { CarouselItem } from './ShowCarousel'
import { StageFlare } from '@/shared/fx/StageFlare'
import { useLocale } from '@/shared/i18n/useLocale'
import { useTheme } from '@/shared/theme'

type StageSurface = 'light-stage' | 'stage-window'

interface Props {
  items: CarouselItem[]
}

export function FeaturedShowStage({ items }: Props) {
  const { text } = useLocale()
  const theme = useTheme()
  const surface: StageSurface = theme === 'dark' ? 'stage-window' : 'light-stage'
  const [activeIndex, setActiveIndex] = useState(0)
  const [gpuActive, setGpuActive] = useState(false)
  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (items.length === 0) return null

  const normalizedIndex = activeIndex % items.length
  const active = items[normalizedIndex]
  const move = (step: number) => {
    setActiveIndex((current) => (current + step + items.length) % items.length)
  }

  return (
    <section
      className="visual-revival"
      data-direction={surface}
      data-motion={reducedMotion ? 'static' : 'short'}
      data-renderer={gpuActive ? 'webgpu' : 'css'}
      aria-label={text('대표 공연', 'Featured show')}
    >
      <div className="visual-revival__stage">
        {surface === 'stage-window' && <StageFlare onActiveChange={setGpuActive} />}
        <div className="visual-revival__copy">
          <h2>{active.title}</h2>
          <p className="visual-revival__meta">{active.dateLabel}</p>
          <p className="visual-revival__meta">{active.venue}</p>
          <Link to={`/performances/${active.performanceId}`}>
            {text('공연 상세 보기', 'View show details')} <span aria-hidden>→</span>
          </Link>
        </div>

        <div className="visual-revival__poster" data-fx="frame">
          {active.posterImageUrl ? (
            <img src={active.posterImageUrl} alt={`${active.title} poster`} decoding="async" />
          ) : (
            <div
              className="visual-revival__poster-composition"
              data-testid="visual-revival-poster-composition"
              aria-hidden="true"
            >
              <div className="visual-revival__poster-mark">
                <span>B</span>
                <span>LIVE</span>
              </div>
              <p>{active.title}</p>
              <div className="visual-revival__poster-rule" />
              <div className="visual-revival__poster-details">
                <span>{active.dateLabel}</span>
                <span>{active.venue}</span>
              </div>
            </div>
          )}
        </div>

        <div className="visual-revival__navigation">
          <button type="button" onClick={() => move(-1)} aria-label={text('이전 대표 공연', 'Previous featured show')}>
            <span aria-hidden>←</span>
          </button>
          <span aria-live="polite">{normalizedIndex + 1} / {items.length}</span>
          <button type="button" onClick={() => move(1)} aria-label={text('다음 대표 공연', 'Next featured show')}>
            <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    </section>
  )
}
