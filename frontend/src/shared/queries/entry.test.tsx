/**
 * 검표 훅(API-entry-01 · 02) — 화면에서는 안 보이는 두 계약을 못 박는다.
 *
 *   ① **인증 경로가 둘이고 섞이면 안 된다.** `entryToken`이 있으면 `X-Entry-Token` 클라이언트로,
 *      없으면 회원 `Authorization` 클라이언트로 나간다. 검표 링크가 회원 세션 인터셉터를 타면
 *      QR 만료(401)에서 refresh·강제 로그아웃이 돌아 스캔이 멈춘다.
 *   ② **판정이 실패해도 입장 현황을 다시 받는다.** 실패(중복 시도·만료 QR)도 서버가 검표 이력에
 *      남기므로, 성공에서만 무효화하면 S-03의 중복 시도 수가 현장과 어긋난다.
 */

import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/api/client'
import { qk } from '@/shared/queries/keys'

import { useEntries, useVerifyEntry } from './entry'

const client = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  entryGet: vi.fn(),
  entryPost: vi.fn(),
  /** `createEntryClient`가 받은 토큰 — 헤더 경로로 갔다는 증거다 */
  entryTokens: [] as string[],
}))

vi.mock('@/shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/client')>()
  return {
    ...actual,
    api: { ...actual.api, get: client.apiGet, post: client.apiPost },
    createEntryClient: (token: string) => {
      client.entryTokens.push(token)
      return { get: client.entryGet, post: client.entryPost, request: vi.fn() }
    },
  }
})

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function wrap(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  client.apiGet.mockReset()
  client.apiPost.mockReset()
  client.entryGet.mockReset()
  client.entryPost.mockReset()
  client.entryTokens = []
})

it('검표 링크 토큰이 있으면 X-Entry-Token 클라이언트로만 나간다', async () => {
  client.entryPost.mockResolvedValue({ ticketId: 90211, status: 'USED' })
  const queryClient = makeClient()
  const { result } = renderHook(() => useVerifyEntry({ entryToken: 'LINK-TOKEN' }), {
    wrapper: wrap(queryClient),
  })

  await act(async () => {
    await result.current.mutateAsync({ performanceId: 12, qrToken: 'QR-1' })
  })

  expect(client.entryTokens).toContain('LINK-TOKEN')
  expect(client.entryPost).toHaveBeenCalledWith(
    '/entries/verify',
    { performanceId: 12, qrToken: 'QR-1' },
    expect.anything(),
  )
  // 회원 세션 경로로 새면 비로그인 스태프의 검표가 401로 죽는다
  expect(client.apiPost).not.toHaveBeenCalled()
})

it('토큰이 없으면 회원 Authorization 경로로 나간다', async () => {
  client.apiGet.mockResolvedValue({ performanceId: 12, items: [] })
  const queryClient = makeClient()
  renderHook(() => useEntries({ performanceId: 12 }, {}), { wrapper: wrap(queryClient) })

  await waitFor(() => expect(client.apiGet).toHaveBeenCalled())
  expect(client.entryGet).not.toHaveBeenCalled()
  expect(client.entryTokens).toHaveLength(0)
  expect(client.apiGet).toHaveBeenCalledWith(
    '/performances/12/entries',
    expect.objectContaining({ query: { result: undefined, page: 0, size: 20 } }),
  )
})

it('토큰은 쿼리 키에 남기지 않는다', async () => {
  client.entryGet.mockResolvedValue({ performanceId: 12, items: [] })
  const queryClient = makeClient()
  renderHook(() => useEntries({ performanceId: 12 }, { entryToken: 'LINK-TOKEN' }), {
    wrapper: wrap(queryClient),
  })

  await waitFor(() => expect(client.entryGet).toHaveBeenCalled())
  const keys = JSON.stringify(
    queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey),
  )
  expect(keys).not.toContain('LINK-TOKEN')
})

it('판정이 실패해도 입장 현황을 다시 받는다', async () => {
  client.entryPost.mockRejectedValue(
    new ApiError({ code: 'ENTRY_ALREADY_ENTERED', status: 409, msg: '' }),
  )
  const queryClient = makeClient()
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  const { result } = renderHook(() => useVerifyEntry({ entryToken: 'LINK-TOKEN' }), {
    wrapper: wrap(queryClient),
  })

  await act(async () => {
    await expect(
      result.current.mutateAsync({ performanceId: 12, qrToken: 'QR-1' }),
    ).rejects.toBeInstanceOf(ApiError)
  })

  // 실패 건도 검표 이력에 남는다 — 성공에서만 깨우면 중복 시도 수가 현장과 어긋난다
  expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.entry.all })
})
