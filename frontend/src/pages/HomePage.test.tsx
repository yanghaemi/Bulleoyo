/**
 * A-01 홈이 performance_02 응답을 섹션으로 나누고, 로딩·오류를 빈 목록으로 둔갑시키지 않는지.
 *
 * `useQuery`를 모킹한다(A-15 `PerformanceListPage.test.tsx`와 같은 패턴) — 화면이 응답을
 * 어떻게 나누는지가 이 파일의 관심사지 네트워크가 아니다.
 * 시각은 `vi.setSystemTime`으로 고정한다. "곧 마감"이 상대 시간 판정이라 고정하지 않으면
 * 날짜가 지나는 순간 깨진다.
 */

import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { useQuery } from '@tanstack/react-query'

import { HomePage } from './HomePage'

const apiGet = vi.hoisted(() => vi.fn())
const isApiErrorMock = vi.hoisted(() => vi.fn(() => false))

vi.mock('@tanstack/react-query', () => ({ useQuery: vi.fn() }))
vi.mock('@/shared/api/client', () => ({
  api: { get: apiGet },
  isApiError: isApiErrorMock,
  tokenStore: { hasSession: () => false },
}))

const useQueryMock = vi.mocked(useQuery)

/** now. 아래 `startAt`들이 이 값과의 거리로 섹션이 갈린다 */
const NOW = new Date('2026-09-16T00:00:00.000Z')

const item = (over: Record<string, unknown> = {}) => ({
  performanceId: 5,
  title: 'IU Concert',
  venueName: 'Olympic Main Stadium',
  // now + 39일 — 49시간 밖이라 "판매 중"
  startAt: '2026-10-25T10:00:00.000Z',
  status: 'ON_SALE' as const,
  minPriceAmount: 132000,
  currency: 'KRW',
  soldOut: false,
  teamNames: ['IU'],
  ...over,
})

const SOLD_OUT = item({ performanceId: 4, title: 'Busan Wave Festival', soldOut: true })
// now + 34시간 — 판매 마감(시작 1시간 전)까지 48시간이 안 남았다
const IMMINENT = item({
  performanceId: 7,
  title: 'Seoul Indie Night',
  startAt: '2026-09-17T10:00:00.000Z',
})

function queryResult(overrides = {}) {
  return {
    data: {
      items: [SOLD_OUT, IMMINENT, item()],
      pageInfo: { page: 0, size: 16, totalElements: 3, hasNext: false },
    },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  }
}

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})

afterAll(() => vi.unstubAllGlobals())

beforeEach(() => {
  // Date만 고정한다 — setTimeout·RAF까지 가짜로 바꾸면 캐러셀·전환이 멈춘다
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.clearAllMocks()
  isApiErrorMock.mockReturnValue(false)
  useQueryMock.mockReturnValue(queryResult() as never)
})

afterEach(() => vi.useRealTimers())

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )
}

function section(name: RegExp) {
  return screen.getByRole('heading', { name }).closest('section')!
}

it('홈에서는 날짜로 추천 공연을 숨기지 않고 전체 공연에서 필터링한다', () => {
  renderHome()
  expect(screen.queryByRole('group', { name: 'Date filter' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'All shows' })).toHaveAttribute('href', '/performances')
  expect(JSON.stringify(useQueryMock.mock.calls.at(-1)?.[0].queryKey)).not.toContain('fromDate')
})

it('매진·마감 임박은 곧 마감으로, 나머지는 판매 중으로 간다', () => {
  renderHome()

  const closing = within(section(/Closing soon/))
  const onSale = within(section(/On sale/))

  const busan = closing.getByRole('link', { name: /Busan Wave Festival/ })
  expect(within(busan).getAllByText('Sold out').length).toBeGreaterThan(0)
  expect(closing.getByRole('link', { name: /Seoul Indie Night/ })).toBeInTheDocument()
  expect(onSale.getByRole('link', { name: /IU Concert/ })).toBeInTheDocument()
  expect(onSale.queryByText('Sold out')).not.toBeInTheDocument()

  // 오픈 예정은 performance_02로 만들 수 없어 섹션 자체가 없다
  expect(screen.queryByRole('heading', { name: /Opening soon/ })).not.toBeInTheDocument()
})

it('운영 홈에서 실제 공연을 포스터와 목록으로 전환해도 선택과 상세 경로가 유지된다', () => {
  renderHome()
  expect(screen.getByRole('button', { name: 'Poster view' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Next show' }))
  expect(screen.getByRole('link', { name: 'View show' })).toHaveAttribute('href', '/performances/7')
  fireEvent.click(screen.getByRole('button', { name: 'List view' }))
  expect(screen.getByRole('link', { name: 'View selected show' })).toHaveAttribute(
    'href',
    '/performances/7',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Poster view' }))
  expect(screen.getByRole('link', { name: 'View show' })).toHaveAttribute('href', '/performances/7')
  expect(screen.queryByText('Preview member')).not.toBeInTheDocument()
})

it('검색 결과에 없는 추천 공연과 잘못된 가격을 남기지 않는다', () => {
  renderHome()
  fireEvent.change(screen.getAllByRole('searchbox', { name: 'Search shows' })[0], {
    target: { value: 'IU' },
  })
  expect(screen.getByRole('heading', { name: 'IU Concert', level: 1 })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Show \d: Busan/ })).not.toBeInTheDocument()
  expect(screen.queryByText('Price TBD')).not.toBeInTheDocument()
})

it('첫 조회 중에는 빈 상태 문구를 띄우지 않는다', () => {
  useQueryMock.mockReturnValue(queryResult({ data: undefined, isPending: true }) as never)
  renderHome()

  expect(screen.queryByText('No shows match your filters.')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toBeInTheDocument()
})

it('목록 조회가 실패하면 목록 오류 문구와 다시 시도를 띄운다', () => {
  isApiErrorMock.mockReturnValue(true)
  useQueryMock.mockReturnValue(
    queryResult({
      data: undefined,
      isError: true,
      error: { code: 'COMMON_INTERNAL_ERROR', msg: 'failed' },
    }) as never,
  )
  renderHome()

  expect(screen.getByText("We couldn't load the shows.")).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument()
  expect(screen.queryByText('No shows match your filters.')).not.toBeInTheDocument()
})

it('공개 공연 목록 요청은 남아 있는 인증 토큰의 영향을 받지 않는다', async () => {
  apiGet.mockResolvedValue(queryResult().data)
  renderHome()

  // 홈은 목록 말고 맞춤 추천(섹션 ④)도 부른다. `.at(-1)`로 집으면 요청이 하나 늘 때마다
  // 엉뚱한 쿼리를 검사하게 되므로 **키로** 목록 쿼리를 고른다
  const options = useQueryMock.mock.calls
    .map((call) => call[0])
    .filter((o) => (o.queryKey as unknown[] | undefined)?.[0] === 'performance')
    .at(-1)
  if (typeof options?.queryFn !== 'function') throw new Error('queryFn is required')
  await options.queryFn({ signal: new AbortController().signal } as never)

  expect(apiGet).toHaveBeenCalledWith(
    '/performances',
    expect.objectContaining({
      public: true,
      // A-15의 PAGE_SIZE(20)와 달라야 쿼리 키가 겹치지 않는다
      query: expect.objectContaining({ status: 'ON_SALE', size: 16, page: 0 }),
    }),
  )
})
