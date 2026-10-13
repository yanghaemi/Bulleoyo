import { QueryClient } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'

import { fetchMyPerformanceList } from '@/shared/api/domains/performance'
import { invalidatedBy, qk } from './keys'
import { fetchStudioTodoRows, STUDIO_TODO_KEY_PARAMS } from './studioTodos'

vi.mock('@/shared/api/domains/performance', async (original) => ({
  ...(await original<typeof import('@/shared/api/domains/performance')>()),
  fetchMyPerformanceList: vi.fn(),
}))

const page = (n: number, hasNext: boolean) => ({ page: n, size: 100, totalElements: 0, hasNext })

it('할 일 대상 상태(DRAFT·PENDING_AGREEMENT·ENDED)의 모든 페이지를 읽고 공연 ID로 합친다', async () => {
  vi.mocked(fetchMyPerformanceList).mockImplementation(async (query) => {
    if (query.status === 'DRAFT' && query.page === 0) {
      return { items: [{ performanceId: 1, host: true }], pageInfo: page(0, true) }
    }
    if (query.status === 'DRAFT' && query.page === 1) {
      return { items: [{ performanceId: 2, host: true }], pageInfo: page(1, false) }
    }
    if (query.status === 'PENDING_AGREEMENT') {
      // 순회 도중 DRAFT → PENDING_AGREEMENT 로 넘어간 공연
      return {
        items: [{ performanceId: 2, host: true, status: 'PENDING_AGREEMENT' }],
        pageInfo: page(0, false),
      }
    }
    return { items: [{ performanceId: 3, host: false }], pageInfo: page(0, false) }
  })

  const rows = await fetchStudioTodoRows()

  expect(rows.map((r) => r.performanceId)).toEqual([1, 2, 3])
  expect(rows.find((r) => r.performanceId === 2)?.status).toBe('PENDING_AGREEMENT')
  const statuses = vi
    .mocked(fetchMyPerformanceList)
    .mock.calls.map(([q]) => `${q.status}:${q.page}`)
  expect(statuses.sort()).toEqual(['DRAFT:0', 'DRAFT:1', 'ENDED:0', 'PENDING_AGREEMENT:0'])
  for (const [query, options] of vi.mocked(fetchMyPerformanceList).mock.calls) {
    expect(query).toMatchObject({ size: 100, sort: 'startAt,asc' })
    expect(options).toMatchObject({ silentAuthFailure: true })
  }
})

it.each([
  'DEPOSIT',
  'AGREE',
  'AGGREGATE',
  'LOCK',
  'RELEASE',
  'HALT',
  'CREATE_SHOW',
  'START_SALE',
] as const)('%s 확정이 할 일 캐시를 무효화한다(qk.performance.mines 접두 안)', async (type) => {
  const client = new QueryClient()
  const key = qk.performance.mine(STUDIO_TODO_KEY_PARAMS)
  client.setQueryData(key, [])
  for (const prefix of invalidatedBy(type)) await client.invalidateQueries({ queryKey: prefix })
  expect(client.getQueryState(key)?.isInvalidated).toBe(true)
  client.clear()
})

it('할 일 키는 mines() 접두로 무효화된다 — 초대·규칙·삭제·이의제기·조기 동의 뮤테이션 공통', async () => {
  const client = new QueryClient()
  const key = qk.performance.mine(STUDIO_TODO_KEY_PARAMS)
  client.setQueryData(key, [])
  await client.invalidateQueries({ queryKey: qk.performance.mines() })
  expect(client.getQueryState(key)?.isInvalidated).toBe(true)
  client.clear()
})
