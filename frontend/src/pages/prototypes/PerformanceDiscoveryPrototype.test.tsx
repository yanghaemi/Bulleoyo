import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'

import i18n from '@/shared/i18n'
import { applyTheme } from '@/shared/theme'
import {
  PerformanceDiscoveryPrototype,
  type DiscoveryPrototypeShow,
} from './PerformanceDiscoveryPrototype'

const shows: DiscoveryPrototypeShow[] = [
  {
    performanceId: '12',
    title: '서울 인디 나이트',
    dateLabel: '2026. 09. 26 · 19:00 KST',
    venue: '롤링홀 · 서울',
    priceLabel: '25,000 YoYo',
    posterImageUrl: '/posters/12.webp',
  },
  {
    performanceId: '8',
    title: '블루 아워',
    dateLabel: '2026. 10. 03 · 18:00 KST',
    venue: '무신사 개러지 · 서울',
    priceLabel: '32,000 YoYo',
    posterImageUrl: '/posters/8.webp',
  },
  {
    performanceId: '5',
    title: '사운드 오브 투모로우',
    dateLabel: '2026. 10. 11 · 17:00 KST',
    venue: '노들섬 · 서울',
    priceLabel: '28,000 YoYo',
    posterImageUrl: '/posters/5.webp',
  },
]

beforeEach(async () => {
  document.head.querySelectorAll('[data-editorial-lab-font]').forEach((element) => element.remove())
  applyTheme('dark')
  await i18n.changeLanguage('ko')
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
})

function renderPrototype(entry = '/__lab/design-refresh?view=home&concept=editorial-a') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <PerformanceDiscoveryPrototype shows={shows} />
      <LocationProbe />
    </MemoryRouter>,
  )
}

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="현재 시안 주소">{location.pathname}{location.search}</output>
}

it('opens only Editorial Stage A as a full-size concept and keeps legacy v=1 compatible', () => {
  renderPrototype('/__lab/design-refresh?view=home&v=1')

  expect(screen.getByRole('region', { name: 'Editorial Stage A 시안' })).toBeVisible()
  expect(screen.queryByRole('region', { name: 'Stronger Identity B 시안' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '서울 인디 나이트' })).toBeVisible()
  expect(screen.getByText('2026. 09. 26 · 19:00 KST')).toBeVisible()
  expect(screen.getAllByText('롤링홀 · 서울')[0]).toBeVisible()
  expect(screen.getAllByText('25,000 YoYo')[0]).toBeVisible()
})

it('opens Stronger Identity B from concept query and keeps legacy v=2 compatible', () => {
  const first = renderPrototype('/__lab/design-refresh?view=home&concept=identity-b')
  expect(screen.getByRole('region', { name: 'Stronger Identity B 시안' })).toBeVisible()
  first.unmount()

  renderPrototype('/__lab/design-refresh?view=home&v=2')
  expect(screen.getByRole('region', { name: 'Stronger Identity B 시안' })).toBeVisible()
  expect(screen.getByRole('heading', { name: '서울 인디 나이트' })).toBeVisible()
  expect(screen.getByText('25,000 YoYo')).toBeVisible()
})

it('finishes Identity B with Pretendard and a localized sequence label', () => {
  renderPrototype('/__lab/design-refresh?view=home&concept=identity-b')

  expect(document.head.querySelector('link[data-editorial-lab-font="pretendard"]')).toHaveAttribute(
    'href',
    expect.stringContaining('pretendard'),
  )
  expect(screen.getByText('대표 공연 · 01 / 03')).toBeVisible()
  expect(screen.queryByText(/LIVE CURATION/i)).not.toBeInTheDocument()
})

it('keeps the Identity B light as progressive enhancement with a CSS fallback', () => {
  renderPrototype('/__lab/design-refresh?view=home&concept=identity-b')

  const stage = screen.getByRole('region', { name: 'Stronger Identity B 시안' })
  const visual = stage.querySelector('.identity-b-stage__visual')

  expect(visual).toHaveAttribute('data-renderer', 'css')
  expect(visual).toHaveClass('identity-b-stage__gpu-light')
  expect(visual?.querySelector('.identity-b-stage__beam')).toBeInTheDocument()
})

it('switches A/B through lab-only controls without exposing experimental names in product controls', () => {
  renderPrototype()

  fireEvent.click(screen.getByRole('button', { name: 'B Stronger Identity' }))

  expect(screen.getByRole('region', { name: 'Stronger Identity B 시안' })).toBeVisible()
  expect(screen.getByRole('status', { name: '현재 시안 주소' })).toHaveTextContent(
    'concept=identity-b',
  )
  expect(screen.getByRole('group', { name: '보기 방식' })).toBeVisible()
  expect(screen.getByRole('button', { name: '포스터 보기' })).toBeVisible()
  expect(screen.getByRole('button', { name: '목록 보기' })).toBeVisible()
  expect(screen.queryByText('Stage Gallery')).not.toBeInTheDocument()
  expect(screen.queryByText('Editorial Lineup')).not.toBeInTheDocument()
})

it('keeps H1 header and M1 mobile navigation fixed across both integrated concepts', () => {
  renderPrototype('/__lab/design-refresh?view=home&concept=editorial-a')

  expect(screen.getByRole('banner', { name: 'H1 검색 중심 헤더' })).toBeVisible()
  expect(screen.getByRole('link', { name: '공연 찾기' })).toBeVisible()
  expect(screen.getByRole('button', { name: '프로필 메뉴 열기' })).toBeVisible()
  const mobileNav = screen.getByRole('navigation', { name: '모바일 주요 메뉴' })
  expect(mobileNav).toHaveTextContent('공연')
  expect(mobileNav).toHaveTextContent('내 티켓')
  expect(mobileNav).toHaveTextContent('지갑')
  expect(mobileNav).toHaveTextContent('MY')
})

it('changes only the presentation mode and preserves the active show facts', () => {
  renderPrototype('/__lab/design-refresh?view=home&concept=editorial-a')

  fireEvent.click(screen.getByRole('button', { name: '목록 보기' }))

  expect(screen.getByRole('button', { name: '목록 보기' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('heading', { name: '서울 인디 나이트' })).toBeVisible()
  expect(screen.getAllByText('25,000 YoYo')[0]).toBeVisible()
  expect(screen.getByRole('list', { name: '대표 공연 목록' })).toBeVisible()
})

it('renders the isolated type specimen with identical copy in all four font candidates', () => {
  renderPrototype('/__lab/design-refresh?view=home&specimen=type')

  expect(screen.getByRole('region', { name: '폰트 비교 시안' })).toBeVisible()
  for (const name of ['현재 폰트', 'Wanted Sans', 'Paperlogy + Pretendard', 'SUIT']) {
    const sample = screen.getByRole('group', { name })
    expect(sample).toHaveTextContent('공연 둘러보기')
    expect(sample).toHaveTextContent('9월 28일 · 오후 7:00 · 서울')
    expect(sample).toHaveTextContent('15,000 YoYo / 100,000 YoYo / 01 / 10 / 100')
  }
  expect(screen.queryByRole('region', { name: 'Editorial Stage A 시안' })).not.toBeInTheDocument()
})

it('preserves a selected show when switching from list back to the Identity B carousel', () => {
  renderPrototype('/__lab/design-refresh?view=home&concept=identity-b')
  fireEvent.click(screen.getByRole('button', { name: '목록 보기' }))
  fireEvent.click(screen.getByRole('button', { name: /02 블루 아워/ }))
  expect(screen.getByRole('link', { name: '선택한 공연 자세히 보기' })).toHaveAttribute('href', '/performances/8')
  fireEvent.click(screen.getByRole('button', { name: '포스터 보기' }))
  expect(screen.getByRole('heading', { name: '블루 아워' })).toBeVisible()
  expect(screen.getByRole('link', { name: '블루 아워 공연 자세히 보기' })).toHaveAttribute('href', '/performances/8')
  expect(screen.getByRole('link', { name: '공연 자세히 보기' })).toHaveAttribute('href', '/performances/8')
})

it('closes the profile on Escape and restores focus to its trigger', () => {
  renderPrototype('/__lab/design-refresh?view=home&concept=identity-b')
  const trigger = screen.getByRole('button', { name: '프로필 메뉴 열기' })
  fireEvent.click(trigger)
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(trigger).toHaveFocus()
  expect(screen.queryByText('미리보기 회원')).not.toBeInTheDocument()
})

it('renders H1 and H2 only inside the isolated navigation specimen', () => {
  renderPrototype('/__lab/design-refresh?view=home&specimen=navigation')

  expect(screen.getByRole('region', { name: '내비게이션 비교 시안' })).toBeVisible()
  expect(screen.getByRole('group', { name: 'H1 검색 중심' })).toBeVisible()
  expect(screen.getByRole('group', { name: 'H2 운영 진입 강조' })).toBeVisible()
  expect(screen.queryByRole('region', { name: 'Stronger Identity B 시안' })).not.toBeInTheDocument()
})
