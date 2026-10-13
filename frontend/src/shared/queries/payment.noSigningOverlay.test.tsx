import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { getSigningActivity, resetSigningActivity } from '@/shared/blockchain/signingActivity'
import { useReportPaymentSignedTx } from '@/shared/queries/payment'

vi.mock('@/shared/api/domains/payment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/domains/payment')>()
  return {
    ...actual,
    reportPaymentSignedTx: vi.fn(async () => ({ jobId: 'job-1', status: 'PENDING', pollAfterMs: 1000 })),
  }
})

afterEach(() => {
  resetSigningActivity()
})

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

// 9/26 — 관객 결제는 자체 진행 표시가 있어 공용 서명 오버레이를 켜지 않는다
it.each(['APPROVE', 'PURCHASE'] as const)('결제 %s 보고는 서명 오버레이를 켜지 않는다', async (kind) => {
  const { result } = renderHook(() => useReportPaymentSignedTx(), { wrapper })

  await act(async () => {
    await result.current.mutateAsync({
      orderId: 1,
      childOrderId: 2,
      kind,
      getSenderSignedRlp: async () => '0xsigned',
    } as Parameters<typeof result.current.mutateAsync>[0])
  })

  expect(getSigningActivity().visible).toBe(false)
})
