import { useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router'

import type { CarouselItem } from '@/features/performance/ShowCarousel'

import { EditorialStageLab, type LabConcept, type ViewMode } from './EditorialStageLab'
import { NavigationSpecimen, TypeSpecimen } from './EditorialLabSpecimens'
import './performance-discovery-prototype.css'

export interface DiscoveryPrototypeShow extends CarouselItem {
  priceLabel: string
}

interface Props {
  shows: DiscoveryPrototypeShow[]
}

type LabSurface = LabConcept | 'type' | 'navigation'

const surfaces: Array<{ id: LabSurface; label: string }> = [
  { id: 'editorial-a', label: 'A Editorial Stage' },
  { id: 'identity-b', label: 'B Stronger Identity' },
  { id: 'type', label: 'Type Specimen' },
  { id: 'navigation', label: 'Navigation Specimen' },
]

export function PerformanceDiscoveryPrototype({ shows }: Props) {
  const [searchParams, setSearchParams] = useSearchParams()
  const surface = parseSurface(searchParams)
  const viewMode: ViewMode = searchParams.get('mode') === 'list' ? 'list' : 'poster'
  const presentation = searchParams.get('presentation') === '1'

  const setSurface = useCallback(
    (next: LabSurface) => {
      const params = new URLSearchParams(searchParams)
      if (next === 'type' || next === 'navigation') {
        params.set('specimen', next)
        params.delete('concept')
        params.delete('v')
      } else {
        params.set('concept', next)
        params.set('v', next === 'editorial-a' ? '1' : '2')
        params.delete('specimen')
      }
      setSearchParams(params, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const setViewMode = useCallback(
    (next: ViewMode) => {
      const params = new URLSearchParams(searchParams)
      params.set('mode', next)
      setSearchParams(params, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? '')) return
      const index = Number.parseInt(event.key, 10) - 1
      if (index >= 0 && index < surfaces.length) setSurface(surfaces[index].id)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [setSurface])

  return (
    <div className="discovery-prototype">
      {surface === 'type' ? (
        <TypeSpecimen />
      ) : surface === 'navigation' ? (
        <NavigationSpecimen />
      ) : (
        <EditorialStageLab
          concept={surface}
          shows={shows}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      )}

      {!presentation && (
        <nav className="proto-picker" aria-label="디자인 랩 시안">
          {surfaces.map((item) => (
            <button
              key={item.id}
              type="button"
              className="proto-picker-item"
              aria-current={surface === item.id ? 'true' : undefined}
              data-active={surface === item.id ? '' : undefined}
              onClick={() => setSurface(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}

function parseSurface(params: URLSearchParams): LabSurface {
  const specimen = params.get('specimen')
  if (specimen === 'type' || specimen === 'navigation') return specimen
  if (params.get('concept') === 'identity-b' || params.get('v') === '2') return 'identity-b'
  return 'editorial-a'
}
