/**
 * P-08 보증금 패널 "새로고침해야 반영" (9/24 dev).
 *
 * RELEASED 뒤에도 보증금 반환(`DEPOSIT_RETURN`) job 이 따라온다 → 보증금이 PAID 인 동안 폴링 유지.
 */

import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { api } from '@/shared/api/client'
import { POLL_MS } from './freshness'
import { settlementPollInterval, useSettlement } from './settlement'

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

it('종단이어도 보증금이 PAID 면 주기 갱신을 이어 간다 — 반환 job 이 뒤따라온다', () => {
  for (const status of ['RELEASED', 'HALTED'] as const) {
    expect(
      settlementPollInterval({ status: 'success', data: { status, deposit: { status: 'PAID' } } }),
    ).toBe(POLL_MS.settlement)
    expect(
      settlementPollInterval({
        status: 'success',
        data: { status, deposit: { status: 'RETURNED' } },
      }),
    ).toBe(false)
    expect(
      settlementPollInterval({
        status: 'success',
        data: { status, deposit: { status: 'UNPAID' } },
      }),
    ).toBe(false)
  }
})

it('RELEASED 뒤 보증금이 RETURNED 로 바뀌는 것을 폴링으로 읽고, 그 뒤에 멈춘다', async () => {
  vi.mocked(api.get).mockResolvedValue({
    performanceId: 12,
    status: 'RELEASED',
    deposit: { status: 'PAID', amount: 50_000 },
  })
  const { result } = renderHook(() => useSettlement(12), { wrapper })
  await advance(1)
  expect(result.current.data?.deposit.status).toBe('PAID')

  vi.mocked(api.get).mockResolvedValue({
    performanceId: 12,
    status: 'RELEASED',
    deposit: { status: 'RETURNED', amount: 50_000 },
  })
  await advance(POLL_MS.settlement + 1)
  expect(result.current.data?.deposit.status).toBe('RETURNED')
  expect(api.get).toHaveBeenCalledTimes(2)

  await advance(120_000)
  expect(api.get).toHaveBeenCalledTimes(2)
})
