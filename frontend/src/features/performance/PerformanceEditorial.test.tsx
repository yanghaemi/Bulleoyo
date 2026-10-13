import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import i18n from '@/shared/i18n'
import { HomeScreen } from './HomeScreen'
import { PerformanceDetail, type PerformanceDetailView } from './PerformanceDetail'
import { ShowCard } from './ShowCard'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }))
})
beforeEach(async () => {
  await i18n.changeLanguage('en')
})
afterAll(() => vi.unstubAllGlobals())

const shows = [
  {
    performanceId: '7',
    title: 'Seoul Indie Night',
    dateLabel: '26 September · 19:00 KST',
    venue: 'Rolling Hall',
  },
  {
    performanceId: '12',
    title: 'Blue Hour',
    dateLabel: '3 October · 20:00 KST',
    venue: 'Live Hall',
  },
]

it('keeps unrelated carousel results out of an empty filtered home and lets the user reset', () => {
  const reset = vi.fn()
  render(
    <MemoryRouter>
      <HomeScreen
        data={{ carousel: shows, sections: { opening: [], onSale: [], closing: [] } }}
        query="No matching show"
        onQueryChange={vi.fn()}
        onSearchSubmit={vi.fn()}
        onResetFilters={reset}
      />
    </MemoryRouter>,
  )
  expect(
    screen.queryAllByRole('link', { name: /Seoul Indie Night|Explore this show/ }),
  ).toHaveLength(0)
  expect(screen.getByText('No shows match your filters.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
  expect(reset).toHaveBeenCalledTimes(1)
})

it('uses the approved Identity B on the production home without lab controls', () => {
  render(
    <MemoryRouter>
      <HomeScreen
        data={{
          carousel: shows,
          sections: {
            opening: [],
            closing: [],
            onSale: [{ ...shows[0], bandCount: 2, fromPriceKrw: 25_000 }],
          },
        }}
        query=""
        onQueryChange={vi.fn()}
        onSearchSubmit={vi.fn()}
        onResetFilters={vi.fn()}
      />
    </MemoryRouter>,
  )

  expect(screen.getByRole('heading', { level: 1, name: 'Seoul Indie Night' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'View show' })).toHaveAttribute('href', '/performances/7')
  expect(screen.queryByRole('navigation', { name: 'Prototype variants' })).not.toBeInTheDocument()
  expect(
    screen.queryByText(/S15P21B204-163|One editorial stage|Light Stage|Stage Window/i),
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Next show' }))
  expect(screen.getByRole('heading', { level: 1, name: 'Blue Hour' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'List view' }))
  expect(screen.getByRole('list', { name: 'Featured show list' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'View selected show' })).toHaveAttribute(
    'href',
    '/performances/12',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Poster view' }))
  expect(screen.getByRole('link', { name: 'View show' })).toHaveAttribute(
    'href',
    '/performances/12',
  )
})

it('구성된 대표 무대와 개인화 추천을 서로 다른 한국어 제목으로 구분한다', async () => {
  await i18n.changeLanguage('ko')
  render(
    <MemoryRouter>
      <HomeScreen
        data={{
          carousel: shows,
          recommended: [
            { ...shows[0], bandCount: 2, fromPriceKrw: 25_000, reason: undefined },
          ],
          recommendationBasis: 'GENRE',
          sections: { opening: [], onSale: [], closing: [] },
          signedIn: true,
        }}
        // [v8.14] 추천은 "AI 추천" 탭 안에 있다
        tab="ai"
        query=""
        onQueryChange={vi.fn()}
        onSearchSubmit={vi.fn()}
        onResetFilters={vi.fn()}
      />
    </MemoryRouter>,
  )

  expect(screen.getByRole('heading', { name: '대표 공연' })).toBeVisible()
  expect(screen.getByRole('heading', { name: '맞춤 추천' })).toBeVisible()
  expect(screen.queryByRole('heading', { name: '추천 공연' })).not.toBeInTheDocument()
})

it('exposes one copy of each show datum in the card link across responsive layouts', () => {
  render(
    <MemoryRouter>
      <ShowCard data={{ ...shows[0], bandCount: 2, fromPriceKrw: 25000, fromPriceUsd: '$18.50' }} />
    </MemoryRouter>,
  )
  const card = screen.getByRole('link')
  expect(card).toHaveAttribute('href', '/performances/7')
  for (const value of [
    'Seoul Indie Night',
    'Rolling Hall',
    '26 September · 19:00 KST',
    '25,000 YoYo',
  ]) {
    expect(within(card).getAllByText(value)).toHaveLength(1)
  }
  expect(within(card).getByText(/18.50/)).toBeInTheDocument()
})

const detail: PerformanceDetailView = {
  performanceId: 7,
  title: 'Seoul Indie Night',
  status: 'on-sale',
  dateLabel: '26 September · 19:00 KST',
  venue: 'Rolling Hall',
  teamNames: ['First Band', 'Second Band'],
  minPriceLabel: '25,000 YoYo',
  minPriceApprox: '$18.50',
  description: 'Two bands share one stage.',
  posterImageUrl: '/show-poster.jpg',
}

it('presents one show title and an integrated ticket region with the real price and booking action', () => {
  const onBook = vi.fn()
  render(
    <MemoryRouter>
      <PerformanceDetail data={detail} onBook={onBook} />
    </MemoryRouter>,
  )
  expect(screen.getAllByRole('heading', { level: 1, name: 'Seoul Indie Night' })).toHaveLength(1)
  const tickets = screen.getByRole('region', { name: 'Tickets' })
  expect(within(tickets).getByText('25,000 YoYo')).toBeInTheDocument()
  expect(within(tickets).getByText(/18.50/)).toBeInTheDocument()
  fireEvent.click(within(tickets).getByRole('button', { name: 'Book now' }))
  expect(onBook).toHaveBeenCalledTimes(1)
})

it('places decision facts and booking before poster artwork and long description in reading order', () => {
  render(
    <MemoryRouter>
      <PerformanceDetail data={detail} onBook={vi.fn()} />
    </MemoryRouter>,
  )
  const poster = screen.getByRole('presentation')
  for (const value of [
    'Seoul Indie Night',
    'Rolling Hall',
    '26 September · 19:00 KST',
    '25,000 YoYo',
  ]) {
    expect(
      screen.getByText(value).compareDocumentPosition(poster) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  }
  const tickets = screen.getByRole('region', { name: 'Tickets' })
  expect(
    tickets.compareDocumentPosition(screen.getByText(detail.description)) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
})

it('keeps unavailable booking disabled and associates the actual reason with its action', () => {
  const onBook = vi.fn()
  render(
    <MemoryRouter>
      <PerformanceDetail
        data={{
          ...detail,
          status: 'sold-out',
          bookingDisabled: true,
          bookingDisabledReason: 'All tickets have sold out.',
        }}
        onBook={onBook}
      />
    </MemoryRouter>,
  )
  for (const button of screen.getAllByRole('button', { name: 'Book now' })) {
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription('All tickets have sold out.')
    fireEvent.click(button)
  }
  expect(onBook).not.toHaveBeenCalled()
})

it('offers the full on-sale list even for a short home section without advertising other filters', () => {
  const card = { ...shows[0], bandCount: 1 }
  render(
    <MemoryRouter>
      <HomeScreen
        data={{ sections: { opening: [], onSale: [card], closing: [card] } }}
        query=""
        onQueryChange={vi.fn()}
        onSearchSubmit={vi.fn()}
        onResetFilters={vi.fn()}
      />
    </MemoryRouter>,
  )
  const more = screen.getAllByRole('link', { name: /View all/ })
  expect(more).toHaveLength(1)
  expect(more[0]).toHaveAttribute('href', '/performances?status=ON_SALE')
})

it('keeps the show grid clear of decorative stage lighting', () => {
  const { container } = render(
    <MemoryRouter>
      <HomeScreen
        data={{ sections: { opening: [], onSale: [{ ...shows[0], bandCount: 1 }], closing: [] } }}
        query=""
        onQueryChange={vi.fn()}
        onSearchSubmit={vi.fn()}
        onResetFilters={vi.fn()}
      />
    </MemoryRouter>,
  )
  expect(container.querySelector('[data-stage-light]')).not.toBeInTheDocument()
})
