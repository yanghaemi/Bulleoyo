/**
 * `useChainJob` — **같은 jobId 가 같은 종단 상태로 다시 와도 새 감시에는 다시 알린다.**
 *
 * ─────────────────────────── 왜 이걸 못 박는가 ───────────────────────────
 * 멱등키를 지켜 재시도하면(§0.8) 서버는 **같은 jobId 를 재생한다** — FAILED 로 끝난 job 도
 * 마찬가지다(`SettlementService`·`CoinGrantService`). 즉 "release 실패 → 다시 시도"의
 * 정상 경로에서 훅은 **이미 한 번 알린 것과 똑같은 (jobId, status)** 를 다시 받는다.
 *
 * 훅에는 리렌더·포커스 refetch 로 같은 데이터가 다시 올 때 콜백을 두 번 부르지 않으려는
 * 표식(`handledRef`)이 있다. 그 표식이 감시 사이에 남아 있으면 **재시도에서 `onFailed` 가
 * 영영 안 불린다.** 호출부(`SettlementPage`)의 약속이 매달리고, 120초 뒤 상한 타이머가
 * `CHAIN_TX_TIMEOUT` 으로 떨어뜨린다 — 실패가 "확정이 늦어지고 있습니다"로 둔갑하고,
 * 재시도할수록 진짜 이유를 늦게 알게 된다.
 *
 * 화면 테스트는 이걸 못 잡는다(재시도 jobId 를 다른 값으로 목하기 때문). 훅에서 잡는다.
 */

import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'

import { useChainJob } from './chain'

const chain = vi.hoisted(() => ({ getChainJob: vi.fn() }))

vi.mock('@/shared/api/domains/chain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/domains/chain')>()
  return { ...actual, getChainJob: chain.getChainJob }
})

/** RELEASE 가 실패로 끝난 job. 재시도해도 서버는 이 값을 그대로 재생한다 */
const FAILED_JOB = {
  jobId: 'chain_01J9RELEASE',
  txType: 'RELEASE',
  status: 'FAILED',
  isTerminal: true,
  isConfirmed: false,
  isFailed: true,
  isPolling: false,
  knownTxType: false, // 무효화 경로를 타지 않게 해 이 테스트를 콜백에만 집중시킨다
  failureReason: 'COIN_ESCROW_INSUFFICIENT',
  txHash: null,
  explorerUrl: null,
  results: [],
}

function wrap(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  chain.getChainJob.mockReset()
  chain.getChainJob.mockResolvedValue(FAILED_JOB)
})

it('같은 jobId 를 다시 지켜보면 같은 FAILED 라도 onFailed 를 다시 부른다', async () => {
  const onFailed = vi.fn()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  const { rerender } = renderHook(
    ({ jobId }: { jobId: string | null }) => useChainJob(jobId, { onFailed }),
    {
      wrapper: wrap(queryClient),
      initialProps: { jobId: FAILED_JOB.jobId } as { jobId: string | null },
    },
  )

  // 첫 감시 — 실패를 한 번 알린다
  await waitFor(() => expect(onFailed).toHaveBeenCalledTimes(1))

  // 호출부가 약속을 정리하며 감시를 내려놓는다(`settle` → `setWatchedJobId(null)`)
  rerender({ jobId: null })

  // 같은 멱등키로 재시도 → 서버가 **같은 jobId** 를 FAILED 그대로 재생한다
  rerender({ jobId: FAILED_JOB.jobId })

  // 여기서 안 불리면 호출부의 약속이 매달려 120초 뒤 CHAIN_TX_TIMEOUT 이 된다
  await waitFor(() => expect(onFailed).toHaveBeenCalledTimes(2))
  expect(onFailed.mock.calls[1][0].failureReason).toBe('COIN_ESCROW_INSUFFICIENT')
})

it('한 번의 감시 안에서는 같은 종단 상태로 두 번 알리지 않는다', async () => {
  const onFailed = vi.fn()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  const { rerender } = renderHook(() => useChainJob(FAILED_JOB.jobId, { onFailed }), {
    wrapper: wrap(queryClient),
  })

  await waitFor(() => expect(onFailed).toHaveBeenCalledTimes(1))

  // 리렌더는 감시를 새로 시작한 것이 아니다 — 표식이 그대로 살아 있어야 한다
  rerender()
  rerender()

  await waitFor(() => expect(onFailed).toHaveBeenCalledTimes(1))
})

it('enabled 만 끄고 다시 켜는 것은 새 감시가 아니다 — 같은 종단 상태를 다시 알리지 않는다', async () => {
  const onFailed = vi.fn()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  // 다시 켤 때의 재조회는 같은 FAILED 지만 receipt 해시가 붙어 **새 객체**로 온다.
  // (캐시가 비워졌거나 부수 필드가 달라지면 실제로도 새 객체다. 같은 객체면 효과가 돌지 않아
  //  이 결함이 숨는다 — 그래서 일부러 다르게 준다)
  chain.getChainJob
    .mockResolvedValueOnce(FAILED_JOB)
    .mockResolvedValue({ ...FAILED_JOB, txHash: '0xdeadbeef' })

  const { result, rerender } = renderHook(
    ({ enabled }: { enabled: boolean }) => useChainJob(FAILED_JOB.jobId, { enabled, onFailed }),
    { wrapper: wrap(queryClient), initialProps: { enabled: true } },
  )

  await waitFor(() => expect(onFailed).toHaveBeenCalledTimes(1))

  // 화면을 숨기며 폴링을 내려놓고(`enabled: false`) 다시 연다 — jobId 는 그대로다
  rerender({ enabled: false })
  rerender({ enabled: true })

  // staleTime 0 이라 다시 켜면 한 번 더 조회한다. **그 응답이 화면에 도착한 뒤** 세어야 한다 —
  // 도착 전에 세면 결함이 있어도 1회로 보여 통과한다(부정 단언은 waitFor 로 기다리면 안 된다)
  await waitFor(() => expect(result.current.job?.txHash).toBe('0xdeadbeef'))
  expect(chain.getChainJob).toHaveBeenCalledTimes(2)
  expect(onFailed).toHaveBeenCalledTimes(1)
})
