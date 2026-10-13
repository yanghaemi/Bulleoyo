import { expect, it, vi } from 'vitest'

import { fetchMyTickets } from '@/shared/api/domains/ticket'
import { fetchAllMyTicketPages } from './ticket'

vi.mock('@/shared/api/domains/ticket', async (original) => ({
  ...(await original<typeof import('@/shared/api/domains/ticket')>()),
  fetchMyTickets: vi.fn(),
}))

it('100장 뒤의 다음 페이지까지 읽어 같은 공연 QR 순서를 누락하지 않는다', async () => {
  const first = Array.from({ length: 100 }, (_, index) => ({
    ticketId: index + 1,
    performanceId: index === 99 ? 12 : index + 100,
    status: 'ISSUED' as const,
    cancellable: true,
  }))
  vi.mocked(fetchMyTickets)
    .mockResolvedValueOnce({
      items: first,
      pageInfo: { page: 0, size: 100, totalElements: 102, hasNext: true },
    })
    .mockResolvedValueOnce({
      items: [
        { ticketId: 101, performanceId: 12, status: 'ISSUED', cancellable: true },
        { ticketId: 102, performanceId: 12, status: 'ISSUED', cancellable: true },
      ],
      pageInfo: { page: 1, size: 100, totalElements: 102, hasNext: false },
    })

  const result = await fetchAllMyTicketPages({ status: 'ISSUED' })

  expect(result.items).toHaveLength(102)
  expect(result.items?.filter((ticket) => ticket.performanceId === 12)).toHaveLength(3)
  expect(fetchMyTickets).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ page: 0, size: 100, status: 'ISSUED' }),
    expect.any(Object),
  )
  expect(fetchMyTickets).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ page: 1, size: 100, status: 'ISSUED' }),
    expect.any(Object),
  )
})
