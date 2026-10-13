import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { api } from '@/shared/api/client'
import { LIVE_STALE_MS, POLL_MS } from './freshness'
import { qk } from './keys'
import {
  salesPollInterval,
  useMyPerformanceList,
  useMyPerformanceRows,
  usePerformanceDetail,
  usePerformanceList,
  useSalesStatus,
} from './performance'
import { useRuleStatus } from './rule'
import { settlementPollInterval, useApproveSettlement, useSettlement } from './settlement'
import { useMyWallet, useMyWalletTransactions } from './wallet'

vi.mock('@/shared/api/client', async (original) => {
  const actual = await original<typeof import('@/shared/api/client')>()
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn() } }
})

let client: QueryClient
beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(api.get).mockReset()
  vi.mocked(api.post).mockReset()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})
afterEach(() => {
  cleanup()
  client.clear()
  vi.useRealTimers()
})
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

it('판매 현황은 15초 간격으로 다른 관객의 구매 결과를 읽는다', async () => {
  vi.mocked(api.get).mockResolvedValue({
    status: 'ON_SALE',
    paidTicketCount: 1,
    onchainAvailable: true,
  })
  const { result } = renderHook(() => useSalesStatus(12), { wrapper })
  await advance(1)
  expect(result.current.data?.paidTicketCount).toBe(1)
  vi.mocked(api.get).mockResolvedValue({
    status: 'ON_SALE',
    paidTicketCount: 2,
    onchainAvailable: true,
  })
  await advance(14_998)
  expect(api.get).toHaveBeenCalledTimes(1)
  await advance(3)
  expect(result.current.data?.paidTicketCount).toBe(2)
  expect(api.get).toHaveBeenCalledTimes(2)
})

it.each(['ENDED', 'CANCELLED'])('판매 현황은 공연이 %s면 주기 갱신을 멈춘다', async (status) => {
  vi.mocked(api.get).mockResolvedValue({ status, paidTicketCount: 3, onchainAvailable: true })
  renderHook(() => useSalesStatus(12), { wrapper })
  await advance(1)
  await advance(120_000)
  expect(api.get).toHaveBeenCalledTimes(1)
})

it('판매 현황 간격 함수 — 성공·진행 중만 15초, 종단·오류는 끔', () => {
  expect(salesPollInterval({ status: 'success', data: { status: 'ON_SALE' } })).toBe(POLL_MS.sales)
  expect(salesPollInterval({ status: 'success', data: { status: 'SALE_CLOSED' } })).toBe(
    POLL_MS.sales,
  )
  expect(salesPollInterval({ status: 'success', data: { status: 'ENDED' } })).toBe(false)
  expect(salesPollInterval({ status: 'success', data: { status: 'CANCELLED' } })).toBe(false)
  expect(salesPollInterval({ status: 'error' })).toBe(false)
})

it('스튜디오 홈 내 공연은 요청한 화면에서만 15초마다 다시 읽는다', async () => {
  vi.mocked(api.get).mockResolvedValue({ items: [], pageInfo: { hasNext: false } })
  renderHook(() => useMyPerformanceList({}, { refetchIntervalMs: POLL_MS.studioHome }), {
    wrapper,
  })
  await advance(1)
  expect(api.get).toHaveBeenCalledTimes(1)
  await advance(15_001)
  expect(api.get).toHaveBeenCalledTimes(2)
})

it('간격을 주지 않은 내 공연 조회(진입 가드 등)는 주기 갱신하지 않는다', async () => {
  vi.mocked(api.get).mockResolvedValue({ items: [], pageInfo: { hasNext: false } })
  renderHook(() => useMyPerformanceList(), { wrapper })
  await advance(1)
  await advance(120_000)
  expect(api.get).toHaveBeenCalledTimes(1)
})

it('스튜디오 홈 내 공연은 오류 뒤 주기 갱신을 반복하지 않는다', async () => {
  vi.mocked(api.get).mockRejectedValue(new Error('forbidden'))
  renderHook(() => useMyPerformanceList({}, { refetchIntervalMs: POLL_MS.studioHome }), {
    wrapper,
  })
  await advance(1)
  await advance(120_000)
  expect(api.get).toHaveBeenCalledTimes(1)
})

it('내 공연 단건 판정은 100건 뒤의 페이지까지 순회한다', async () => {
  vi.mocked(api.get)
    .mockResolvedValueOnce({
      items: [{ performanceId: 1, teamId: 7, host: true }],
      pageInfo: { page: 0, size: 100, totalElements: 101, hasNext: true },
    })
    .mockResolvedValueOnce({
      items: [{ performanceId: 901, teamId: 9, host: false }],
      pageInfo: { page: 1, size: 100, totalElements: 101, hasNext: false },
    })

  const { result } = renderHook(() => useMyPerformanceRows(901), { wrapper })
  await advance(1)
  await advance(1)

  expect(api.get).toHaveBeenCalledTimes(2)
  expect(api.get).toHaveBeenNthCalledWith(
    1,
    '/performances/me',
    expect.objectContaining({ query: expect.objectContaining({ page: 0, size: 100 }) }),
  )
  expect(api.get).toHaveBeenNthCalledWith(
    2,
    '/performances/me',
    expect.objectContaining({ query: expect.objectContaining({ page: 1, size: 100 }) }),
  )
  expect(result.current.data?.items).toEqual([
    expect.objectContaining({ performanceId: 901, teamId: 9 }),
  ])
})

it('내 공연 판정은 마지막 페이지까지 읽기 전에 중간 결과를 노출하지 않는다', async () => {
  let resolveLastPage: ((value: unknown) => void) | undefined
  vi.mocked(api.get)
    .mockResolvedValueOnce({
      items: [{ performanceId: 1, teamId: 7, host: true }],
      pageInfo: { page: 0, size: 100, totalElements: 101, hasNext: true },
    })
    .mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveLastPage = resolve
      }),
    )

  const { result } = renderHook(() => useMyPerformanceRows(901), { wrapper })
  await advance(1)

  expect(api.get).toHaveBeenCalledTimes(2)
  expect(result.current.isPending).toBe(true)
  expect(result.current.data).toBeUndefined()

  resolveLastPage?.({
    items: [{ performanceId: 901, teamId: 9, host: false }],
    pageInfo: { page: 1, size: 100, totalElements: 101, hasNext: false },
  })
  await advance(1)

  expect(result.current.isPending).toBe(false)
  expect(result.current.data?.items).toEqual([
    expect.objectContaining({ performanceId: 901, teamId: 9 }),
  ])
})

it('다른 공연을 판정해도 전체 내 공연 순회 결과를 공유한다', async () => {
  vi.mocked(api.get).mockResolvedValue({
    items: [
      { performanceId: 101, teamId: 7, host: true },
      { performanceId: 202, teamId: 8, host: false },
    ],
    pageInfo: { page: 0, size: 100, totalElements: 2, hasNext: false },
  })

  const { result } = renderHook(
    () => ({ first: useMyPerformanceRows(101), second: useMyPerformanceRows(202) }),
    { wrapper },
  )
  await advance(1)

  expect(api.get).toHaveBeenCalledTimes(1)
  expect(result.current.first.data?.items).toEqual([
    expect.objectContaining({ performanceId: 101 }),
  ])
  expect(result.current.second.data?.items).toEqual([
    expect.objectContaining({ performanceId: 202 }),
  ])
})

it('정산은 다른 사용자의 처리 또는 자동 지급으로 바뀐 서버 상태를 읽는다', async () => {
  vi.mocked(api.get).mockResolvedValue({ performanceId: 12, status: 'LOCKED' })
  const { result } = renderHook(() => useSettlement(12), { wrapper })
  await advance(1)
  expect(result.current.data?.status).toBe('LOCKED')
  vi.mocked(api.get).mockResolvedValue({ performanceId: 12, status: 'RELEASED' })
  await advance(9_998)
  expect(api.get).toHaveBeenCalledTimes(1)
  await advance(3)
  expect(result.current.data?.status).toBe('RELEASED')
  expect(api.get).toHaveBeenCalledTimes(2)
  // RELEASED는 종단이다 — 더 바뀔 것이 없으니 멈춘다
  await advance(120_000)
  expect(api.get).toHaveBeenCalledTimes(2)
})

it('정산이 HALTED면 주기 갱신을 멈춘다', async () => {
  vi.mocked(api.get).mockResolvedValue({ performanceId: 12, status: 'HALTED' })
  renderHook(() => useSettlement(12), { wrapper })
  await advance(1)
  await advance(120_000)
  expect(api.get).toHaveBeenCalledTimes(1)
})

it('정산 간격 함수 — 진행 중 상태만 10초, 종단·오류는 끔', () => {
  for (const status of ['NONE', 'AGGREGATED', 'LOCKED', 'DISPUTE_OPEN'] as const) {
    expect(settlementPollInterval({ status: 'success', data: { status } })).toBe(
      POLL_MS.settlement,
    )
  }
  expect(settlementPollInterval({ status: 'success', data: { status: 'RELEASED' } })).toBe(false)
  expect(settlementPollInterval({ status: 'success', data: { status: 'HALTED' } })).toBe(false)
  expect(settlementPollInterval({ status: 'error' })).toBe(false)
  expect(settlementPollInterval({ status: 'pending' })).toBe(false)
})

it('권한 오류가 발생하면 주기 조회를 반복하지 않는다', async () => {
  vi.mocked(api.get).mockRejectedValue(new Error('forbidden'))
  renderHook(() => useSettlement(12), { wrapper })
  await advance(1)
  await advance(120_000)
  expect(api.get).toHaveBeenCalledTimes(1)
})

it('정상 조회 이후 오류가 나도 오래된 성공값으로 자동 조회를 계속하지 않는다', async () => {
  vi.mocked(api.get).mockResolvedValue({ performanceId: 12, status: 'LOCKED' })
  renderHook(() => useSettlement(12), { wrapper })
  await advance(1)
  vi.mocked(api.get).mockRejectedValue(new Error('forbidden'))
  await advance(30_001)
  expect(api.get).toHaveBeenCalledTimes(2)
  await advance(120_000)
  expect(api.get).toHaveBeenCalledTimes(2)
})

/**
 * 동의가 성공해도 정산 조회를 무효화하지 않으면 화면은 옛 `actions.release`를 그대로
 * 들고 있다 — "전원 동의했는데 지급이 안 열린다"가 된다. 새 화면 테스트는 전부 표현 계층이라
 * 이 경로를 덮지 못한다. 30초 주기가 결국 같은 결론에 닿긴 하지만, 누른 직후에 수자가
 * 그대로인 화면은 고장으로 읽힌다.
 */
it('조기 동의가 성공하면 정산 조회를 곧바로 다시 읽는다', async () => {
  vi.mocked(api.get).mockResolvedValue({ performanceId: 12, status: 'LOCKED' })
  const settlement = renderHook(() => useSettlement(12), { wrapper })
  const approve = renderHook(() => useApproveSettlement(12), { wrapper })
  await advance(1)
  expect(api.get).toHaveBeenCalledTimes(1)

  vi.mocked(api.post).mockResolvedValue({
    teamId: 2,
    approvedAt: '2026-09-21T19:00:00+09:00',
    approvedCount: 3,
    requiredCount: 3,
    releaseUnlocked: true,
  })
  await act(async () => {
    await approve.result.current.mutateAsync()
  })
  await advance(1)

  // 주기(10초)가 오기 전인데도 다시 읽었다 = 무효화가 돈 것이다
  expect(api.get).toHaveBeenCalledTimes(2)
  expect(settlement.result.current.isError).toBe(false)
})

/* ─────────────── 창 복귀 갱신이 효과를 내려면 staleTime이 짧아야 한다 ─────────────── */

/** 캐시에 등록된 쿼리의 staleTime. 접두로 찾는다(파라미터가 붙은 키까지) */
function staleTimeOf(prefix: readonly unknown[]): unknown {
  const [query] = client.getQueryCache().findAll({ queryKey: prefix })
  return (query?.options as { staleTime?: unknown } | undefined)?.staleTime
}

const liveQueries: ReadonlyArray<[string, () => unknown, readonly unknown[]]> = [
  ['rule_02', () => useRuleStatus(12), qk.rule.byPerformance(12)],
  ['performance_03', () => usePerformanceDetail(12), qk.performance.detail(12)],
  ['performance_06', () => useMyPerformanceList(), qk.performance.mines()],
  ['performance_06 전 페이지', () => useMyPerformanceRows(12), qk.performance.mineAllPages()],
  ['performance_11', () => useSalesStatus(12), qk.performance.sales(12)],
  ['settlement_01', () => useSettlement(12), qk.settlement.byPerformance(12)],
  ['wallet_01', () => useMyWallet({ enabled: true }), qk.wallet.me()],
  ['wallet_02', () => useMyWalletTransactions({}, { enabled: true }), qk.wallet.transactionsAll()],
]

it.each(liveQueries)('%s는 창 복귀 때 다시 받도록 staleTime이 짧다', async (_label, hook, prefix) => {
  vi.mocked(api.get).mockResolvedValue({ items: [], pageInfo: { hasNext: false } })
  renderHook(hook, { wrapper })
  await advance(1)
  expect(staleTimeOf(prefix)).toBe(LIVE_STALE_MS)
})

it('관객 공연 목록은 전역 기본 staleTime을 그대로 쓴다', async () => {
  vi.mocked(api.get).mockResolvedValue({ items: [] })
  renderHook(() => usePerformanceList(), { wrapper })
  await advance(1)
  expect(staleTimeOf(qk.performance.lists())).toBeUndefined()
})

it('규칙 동의 조회는 선택한 팀을 API와 캐시 키에 함께 유지한다', async () => {
  vi.mocked(api.get).mockResolvedValue({ performanceId: 12 })

  renderHook(() => useRuleStatus(12, { teamId: 32 }), { wrapper })
  await advance(1)

  expect(api.get).toHaveBeenCalledWith('/performances/12/rules', { query: { teamId: 32 } })
  expect(client.getQueryState(qk.rule.byPerformance(12, 32))).toBeDefined()
})

it('지갑 조회는 호출부가 준 staleTime을 우선한다', async () => {
  vi.mocked(api.get).mockResolvedValue({ address: '0x0' })
  renderHook(() => useMyWallet({ enabled: true, staleTime: 0 }), { wrapper })
  await advance(1)
  expect(staleTimeOf(qk.wallet.me())).toBe(0)
})
