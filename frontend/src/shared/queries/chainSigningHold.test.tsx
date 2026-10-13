/**
 * `useChainJob` ↔ 서명 처리 오버레이(signingActivity) — 보고가 맡긴 job의 확정 대기를 훅이 이어받고,
 * 종단 상태에서 놓는다. 확정 콜백이 다음 서명을 시작하면(APPROVE → PURCHASE) 닫히지 않고 이어진다.
 */

import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import {
  beginWalletPrompt,
  getSigningActivity,
  holdSigningJob,
  resetSigningActivity,
} from '@/shared/blockchain/signingActivity'

import { useChainJob } from './chain'

const chain = vi.hoisted(() => ({ getChainJob: vi.fn() }))

vi.mock('@/shared/api/domains/chain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/domains/chain')>()
  return { ...actual, getChainJob: chain.getChainJob }
})

function job(status: 'CONFIRMED' | 'FAILED') {
  return {
    jobId: 'chain_01J9APPROVE',
    txType: 'APPROVE',
    status,
    isTerminal: true,
    isConfirmed: status === 'CONFIRMED',
    isFailed: status === 'FAILED',
    isPolling: false,
    knownTxType: false,
    failureReason: null,
    txHash: null,
    explorerUrl: null,
    results: [],
  }
}

function wrap(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

beforeEach(() => {
  resetSigningActivity()
  chain.getChainJob.mockReset()
})

afterEach(() => {
  resetSigningActivity()
})

it('확정되면 놓고, 콜백이 다음 서명을 시작하면 비차단 모드로 이어진다', async () => {
  chain.getChainJob.mockResolvedValue(job('CONFIRMED'))
  holdSigningJob('chain_01J9APPROVE')
  expect(getSigningActivity().visible).toBe(true)

  let endNext: (() => void) | undefined
  renderHook(
    () =>
      useChainJob('chain_01J9APPROVE', {
        onConfirmed: () => {
          endNext = beginWalletPrompt()
        },
      }),
    { wrapper: wrap(client()) },
  )

  await waitFor(() => expect(getSigningActivity()).toEqual({ visible: true, walletPrompt: true }))
  endNext?.()
  await waitFor(() => expect(getSigningActivity().visible).toBe(false))
})

it('실패하면 놓고 유예 뒤 닫힌다 — 실패 화면을 가리지 않는다', async () => {
  chain.getChainJob.mockResolvedValue(job('FAILED'))
  holdSigningJob('chain_01J9APPROVE')
  const onFailed = vi.fn()
  renderHook(() => useChainJob('chain_01J9APPROVE', { onFailed }), { wrapper: wrap(client()) })

  await waitFor(() => expect(onFailed).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(getSigningActivity().visible).toBe(false))
})

it('맡겨지지 않은 job(운영자 tx)은 오버레이를 켜지 않는다', async () => {
  chain.getChainJob.mockResolvedValue(job('CONFIRMED'))
  const onConfirmed = vi.fn()
  renderHook(() => useChainJob('chain_01J9OTHER', { onConfirmed }), { wrapper: wrap(client()) })
  await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1))
  expect(getSigningActivity().visible).toBe(false)
})
