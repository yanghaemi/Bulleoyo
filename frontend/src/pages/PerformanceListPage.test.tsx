import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { useInfiniteQuery } from '@tanstack/react-query'

import { PerformanceListPage } from '@/pages/PerformanceListPage'

const apiGet = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-query', () => ({ useInfiniteQuery: vi.fn() }))
vi.mock('@/shared/api/client', () => ({
  api: { get: apiGet },
  isApiError: () => false,
  tokenStore: { hasSession: () => false },
}))

const useInfiniteQueryMock = vi.mocked(useInfiniteQuery)

const page = (hasNext = false) => ({
  items: hasNext
    ? [
        {
          performanceId: 5,
          title: 'IU Concert',
          venueName: 'Arena',
          startAt: '2026-09-20T10:00:00Z',
          status: 'ON_SALE' as const,
          currency: 'KRW',
          soldOut: false,
          teamNames: ['IU'],
        },
      ]
    : [],
  pageInfo: { page: 0, size: 20, totalElements: hasNext ? 2 : 0, hasNext },
})

function queryResult(overrides = {}) {
  return {
    data: { pages: [page()] },
    isPending: false,
    isError: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    error: null,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useInfiniteQueryMock.mockReturnValue(queryResult() as never)
})

it('검색어 입력은 확정 전까지 공연 API 쿼리 키를 바꾸지 않는다', () => {
  render(
    <MemoryRouter>
      <PerformanceListPage />
    </MemoryRouter>,
  )

  const input = screen.getByRole('searchbox', { name: 'Search shows' })
  fireEvent.change(input, { target: { value: 'IU' } })

  let options = useInfiniteQueryMock.mock.calls.at(-1)?.[0]
  expect(JSON.stringify(options?.queryKey)).not.toContain('IU')

  fireEvent.keyDown(input, { key: 'Enter' })
  options = useInfiniteQueryMock.mock.calls.at(-1)?.[0]
  expect(JSON.stringify(options?.queryKey)).toContain('IU')
})

it('더 보기 요청이 실패해도 이미 받은 공연과 다시 시도 동작을 유지한다', () => {
  useInfiniteQueryMock.mockReturnValue(
    queryResult({
      data: { pages: [page(true)] },
      isError: true,
      isFetchNextPageError: true,
      error: { code: 'COMMON_INTERNAL_ERROR', msg: 'failed' },
    }) as never,
  )

  render(
    <MemoryRouter>
      <PerformanceListPage />
    </MemoryRouter>,
  )

  expect(screen.getAllByText('IU Concert')).not.toHaveLength(0)
  expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument()
})

it('공개 공연 목록 요청은 남아 있는 인증 토큰의 영향을 받지 않는다', async () => {
  apiGet.mockResolvedValue(page())
  render(
    <MemoryRouter>
      <PerformanceListPage />
    </MemoryRouter>,
  )

  const options = useInfiniteQueryMock.mock.calls.at(-1)?.[0]
  if (typeof options?.queryFn !== 'function') throw new Error('queryFn is required')
  await options.queryFn({ pageParam: 0, signal: new AbortController().signal } as never)

  expect(apiGet).toHaveBeenCalledWith('/performances', expect.objectContaining({ public: true }))
})

it.each(['ON_SALE', 'SALE_CLOSED'])('URL의 판매 상태 %s를 최초 API 필터에 반영한다', (status) => {
  render(
    <MemoryRouter initialEntries={[`/performances?status=${status}`]}>
      <PerformanceListPage />
    </MemoryRouter>,
  )
  expect(JSON.stringify(useInfiniteQueryMock.mock.calls.at(-1)?.[0].queryKey)).toContain(status)
})
