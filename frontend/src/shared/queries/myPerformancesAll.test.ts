import { QueryClient } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'

import { fetchMyPerformanceList } from '@/shared/api/domains/performance'
import { qk } from './keys'
import { fetchAllMyPerformances, MY_PERFORMANCES_ALL_KEY_PARAMS } from './performance'

vi.mock('@/shared/api/domains/performance', async (original) => ({
  ...(await original<typeof import('@/shared/api/domains/performance')>()),
  fetchMyPerformanceList: vi.fn(),
}))

it('hasNext가 끝날 때까지 size 100으로 모든 페이지를 읽고 totalElements를 넘긴다', async () => {
  vi.mocked(fetchMyPerformanceList).mockImplementation(async (query) => ({
    items: [{ performanceId: (query.page ?? 0) + 1, host: true }],
    pageInfo: { page: query.page ?? 0, size: 100, totalElements: 3, hasNext: query.page !== 2 },
  }))

  const all = await fetchAllMyPerformances()

  expect(all.items.map((r) => r.performanceId)).toEqual([1, 2, 3])
  expect(all.totalElements).toBe(3)
  expect(
    vi.mocked(fetchMyPerformanceList).mock.calls.map(([q]) => [q.page, q.size, q.status]),
  ).toEqual([
    [0, 100, undefined],
    [1, 100, undefined],
    [2, 100, undefined],
  ])
})

it('키는 mine(...) 아래라 mines() 무효화에 걸린다', async () => {
  const client = new QueryClient()
  const key = qk.performance.mine(MY_PERFORMANCES_ALL_KEY_PARAMS)
  client.setQueryData(key, { items: [] })
  await client.invalidateQueries({ queryKey: qk.performance.mines() })
  expect(client.getQueryState(key)?.isInvalidated).toBe(true)
})
