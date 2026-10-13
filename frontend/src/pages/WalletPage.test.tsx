import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { useQuery } from '@tanstack/react-query'

import { WalletPage } from '@/pages/WalletPage'
import { useMyMember } from '@/shared/queries/member'
import { toastApiError } from '@/shared/ui'

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: vi.fn(),
}))
vi.mock('@/shared/queries/member', () => ({ useMyMember: vi.fn() }))
vi.mock('@/shared/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/ui')>()),
  toastApiError: vi.fn(),
}))

const useQueryMock = vi.mocked(useQuery)

it('노드 장애의 캐시 잔액은 경고와 재시도를 표시하고 최신 응답에서 해제한다', () => {
  const retry = vi.fn()
  let stale = true
  vi.mocked(useMyMember).mockReturnValue({ data: { timezone: 'Asia/Seoul', teams: [] } } as never)
  useQueryMock.mockImplementation(
    (options) =>
      ({
        data:
          options.queryKey[1] === 'transactions'
            ? { items: [] }
            : {
                balance: { amount: 12000, currency: 'KRW' },
                stale,
                cachedAt: '2026-09-18T01:00:00Z',
              },
        error: null,
        refetch: retry,
      }) as never,
  )
  const view = render(
    <MemoryRouter>
      <WalletPage />
    </MemoryRouter>,
  )
  expect(screen.getByRole('alert')).toHaveTextContent(/마지막.*잔액|last confirmed balance/)
  fireEvent.click(screen.getByRole('button', { name: /다시 시도|Retry/ }))
  expect(retry).toHaveBeenCalledTimes(1)
  stale = false
  view.rerender(
    <MemoryRouter>
      <WalletPage />
    </MemoryRouter>,
  )
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('거래내역 조회 실패를 빈 내역으로 숨기지 않고 사용자에게 알린다', async () => {
  let transactionError: Error | null = new Error('transactions unavailable')
  let queryCall = 0
  vi.mocked(useMyMember).mockReturnValue({ data: { timezone: 'Asia/Seoul', teams: [] } } as never)
  useQueryMock.mockImplementation(() => {
    const isTransactions = queryCall++ % 2 === 0
    return {
      data: undefined,
      error: isTransactions ? transactionError : null,
      refetch: vi.fn(),
    } as never
  })

  const view = render(
    <MemoryRouter>
      <WalletPage />
    </MemoryRouter>,
  )

  await waitFor(() => expect(toastApiError).toHaveBeenCalledWith(transactionError))

  transactionError = new Error('transactions unavailable')
  view.rerender(
    <MemoryRouter>
      <WalletPage />
    </MemoryRouter>,
  )
  await waitFor(() => expect(toastApiError).toHaveBeenCalledTimes(1))
})
