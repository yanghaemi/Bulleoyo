import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { ShowCarousel } from './ShowCarousel'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
})
afterAll(() => vi.unstubAllGlobals())

describe('ShowCarousel', () => {
  const shows = [
    {
      performanceId: '7',
      title: '서울 인디 나이트',
      dateLabel: '2026-09-26',
      venue: 'Rolling Hall',
    },
    { performanceId: '8', title: 'Blue Hour', dateLabel: '2026-09-27', venue: 'Live Hall' },
  ]

  it('운영 기본 옵션은 첫 공연의 캡션과 기존 화살표를 유지하며 선택 변경을 알린다', () => {
    const onCenterChange = vi.fn()
    render(
      <MemoryRouter>
        <ShowCarousel items={shows} onCenterChange={onCenterChange} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('region', { name: 'Featured shows' })).toHaveAttribute(
      'data-presentation',
      'standard',
    )
    expect(screen.getByRole('link')).toHaveTextContent('서울 인디 나이트')
    expect(screen.getByRole('link')).toHaveTextContent('2026-09-26 · Rolling Hall')
    expect(screen.getByRole('button', { name: 'Next show' })).toHaveTextContent('›')
    expect(onCenterChange).toHaveBeenLastCalledWith(shows[0])

    fireEvent.click(screen.getByRole('button', { name: 'Next show' }))
    expect(screen.getByRole('link')).toHaveAttribute('href', '/performances/8')
    expect(onCenterChange).toHaveBeenLastCalledWith(shows[1])
    fireEvent.keyDown(screen.getByRole('region', { name: 'Featured shows' }), { key: 'ArrowLeft' })
    expect(onCenterChange).toHaveBeenLastCalledWith(shows[0])
  })

  it('랩 전용 artwork 옵션만 SVG 화살표와 초기 선택을 사용하고 중복 캡션을 숨긴다', () => {
    const onCenterChange = vi.fn()
    render(
      <MemoryRouter>
        <ShowCarousel
          items={shows}
          presentation="artwork"
          initialPerformanceId="8"
          onCenterChange={onCenterChange}
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole('region', { name: 'Featured shows' })).toHaveAttribute(
      'data-presentation',
      'artwork',
    )
    expect(screen.getByRole('link', { name: 'View Blue Hour' })).toHaveAttribute(
      'href',
      '/performances/8',
    )
    expect(screen.getByRole('link')).toBeEmptyDOMElement()
    expect(screen.getByRole('button', { name: 'Next show' }).querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Show 2: Blue Hour' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(onCenterChange).toHaveBeenLastCalledWith(shows[1])

    fireEvent.click(screen.getByRole('button', { name: 'Show 1: 서울 인디 나이트' }))
    expect(screen.getByRole('link', { name: 'View 서울 인디 나이트' })).toHaveAttribute(
      'href',
      '/performances/7',
    )
    expect(onCenterChange).toHaveBeenLastCalledWith(shows[0])
  })

  it('artwork 공연이 하나면 다른 공연처럼 복제하거나 이동 버튼을 표시하지 않는다', () => {
    const { container } = render(
      <MemoryRouter>
        <ShowCarousel items={[shows[0]]} presentation="artwork" />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: 'Next show' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Previous show' })).not.toBeInTheDocument()
    expect(container.querySelectorAll('[data-fx-variant="poster"]')).toHaveLength(1)
  })

  it('초기 공연이 목록에 없으면 첫 공연을 사용한다', () => {
    render(
      <MemoryRouter>
        <ShowCarousel items={shows} presentation="artwork" initialPerformanceId="missing" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'View 서울 인디 나이트' })).toHaveAttribute(
      'href',
      '/performances/7',
    )
  })

  it('작은 화면에서 옆 카드가 페이지 폭을 늘리지 않도록 캐러셀 경계에서 자른다', () => {
    render(
      <MemoryRouter>
        <ShowCarousel
          items={[
            {
              performanceId: '7',
              title: 'Seoul Indie Night vol.12',
              dateLabel: '2026-09-26',
              venue: 'Rolling Hall',
            },
          ]}
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole('region', { name: 'Featured shows' })).toHaveClass('overflow-x-clip')
  })
})
