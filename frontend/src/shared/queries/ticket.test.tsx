import { act, fireEvent, render, screen, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TicketQr } from '@/features/ticket/TicketQr'
import { fetchTicketQr } from '@/shared/api/domains/ticket'
import i18n from '@/shared/i18n'
import { useTicketQr } from './ticket'

vi.mock('@/shared/api/domains/ticket', async (original) => ({
  ...(await original<typeof import('@/shared/api/domains/ticket')>()),
  fetchTicketQr: vi.fn(),
}))

// The real encoder is covered by TicketQr tests. A deterministic SVG avoids
// dynamic import scheduling here, where the assertion is API ownership/timing.
vi.mock('qrcode', () => ({ toString: async () => '<svg xmlns="http://www.w3.org/2000/svg"/>' }))

let client: QueryClient

function Harness({ enabled = true }: { enabled?: boolean }) {
  const query = useTicketQr(41, { enabled })
  return (
    <TicketQr
      qrToken={query.data?.qrToken}
      rotateAfterMs={query.data?.rotateAfterMs}
      issuedAt={query.data?.issuedAt}
      expiresAt={query.data?.expiresAt}
      onRotate={() => {
        void query.refetch()
      }}
    />
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-18T01:00:00Z'))
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.mocked(fetchTicketQr)
    .mockReset()
    .mockImplementation(async () => ({
      ticketId: 41,
      qrToken: `sample-only-${Date.now()}`,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      rotateAfterMs: 30_000,
    }))
})

afterEach(() => {
  cleanup()
  client.clear()
  vi.useRealTimers()
})

it('keeps automatic QR requests in the query hook, not the display countdown', async () => {
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(fetchTicketQr).toHaveBeenCalledTimes(1)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(29_999)
  })
  expect(fetchTicketQr).toHaveBeenCalledTimes(1)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(fetchTicketQr).toHaveBeenCalledTimes(2)
})

it('opening and closing the enlarged QR causes no additional request', async () => {
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  fireEvent.click(screen.getByRole('button', { name: /enlarge/i }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(fetchTicketQr).toHaveBeenCalledTimes(1)
})

it('does not call the endpoint when disabled', async () => {
  render(
    <QueryClientProvider client={client}>
      <Harness enabled={false} />
    </QueryClientProvider>,
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000)
  })
  expect(fetchTicketQr).not.toHaveBeenCalled()
})
