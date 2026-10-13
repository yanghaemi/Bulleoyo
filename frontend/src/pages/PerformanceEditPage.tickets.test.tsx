import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { PerformanceEditPage } from './PerformanceEditPage'

const save = vi.hoisted(() => ({ tickets: vi.fn(), update: vi.fn() }))
vi.mock('@/shared/blockchain/useWeb3Auth', () => ({ useWeb3Auth: () => ({ adapter: null }) }))
vi.mock('@/shared/queries/chain', () => ({
  useChainJob: () => ({ job: undefined, timedOut: false, isConfirmed: false, isFailed: false }),
}))
vi.mock('@/shared/queries/team', () => ({
  useMyTeams: () => ({ data: { items: [{ teamId: 7, teamName: '블루노트', leader: true }] } }),
}))
vi.mock('@/shared/queries/wallet', () => ({
  useMyWallet: () => ({ data: { status: 'LINKED', balance: { amount: 120000 } } }),
}))
vi.mock('@/shared/queries/rule', () => ({
  // 이 화면은 rule_02 를 **규칙 동의 단계 판정에만** 쓴다. 이 테스트의 관심사가 아니므로
  // 규칙 미저장(404 → data 없음)으로 둔다 — 그래도 여는 단계는 요청한 그대로다
  useRuleStatus: () => ({ data: undefined, isPending: false, refetch: vi.fn() }),
}))
vi.mock('@/shared/queries/performance', () => ({
  usePerformanceDetail: () => ({
    data: {
      performanceId: 12,
      title: '합동 공연',
      description: '',
      venueName: '공연장',
      venueAddress: '서울 마포구 공연장',
      startAt: '2030-09-19T19:00:00+09:00',
      endAt: '2030-09-19T22:00:00+09:00',
      status: 'DRAFT',
      jointPerformance: true,
    },
    isPending: false,
    refetch: vi.fn(),
  }),
  useTicketTypes: () => ({
    data: {
      performanceId: 12,
      ticketTypes: [
        {
          ticketTypeId: 31,
          name: '일반',
          priceAmount: 25000,
          totalQuantity: 80,
          remainingQuantity: 80,
        },
      ],
    },
    isPending: false,
    refetch: vi.fn(),
  }),
  useMyPerformanceRows: () => ({
    data: { items: [{ performanceId: 12, host: true, depositStatus: 'UNPAID' }] },
  }),
  useUpdatePerformance: () => ({ mutateAsync: save.update }),
  useSetTicketTypes: () => ({ mutateAsync: save.tickets }),
  usePrepareDeposit: () => ({ mutateAsync: vi.fn() }),
  useReportDepositSignedTx: () => ({ mutateAsync: vi.fn() }),
  useCancelPerformance: () => ({ mutate: vi.fn(), isPending: false }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  save.update.mockResolvedValue({ performanceId: 12 })
  save.tickets.mockResolvedValue({
    performanceId: 12,
    ticketTypes: [
      {
        ticketTypeId: 31,
        name: '일반',
        priceAmount: 25000,
        totalQuantity: 80,
        remainingQuantity: 80,
      },
      {
        ticketTypeId: 99,
        name: '후원',
        priceAmount: 30000,
        totalQuantity: 20,
        remainingQuantity: 20,
      },
    ],
  })
})

it('신규 옵션 저장 후 다시 저장할 때 서버가 부여한 ticketTypeId를 유지한다', async () => {
  render(
    <MemoryRouter initialEntries={['/studio/performances/12/edit']}>
      <Routes>
        <Route path="/studio/performances/:id/edit" element={<PerformanceEditPage />} />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: /옵션 추가|Add ticket type/ }))
  fireEvent.change(screen.getAllByLabelText(/타입명|Ticket type/).at(-1)!, {
    target: { value: '후원' },
  })
  fireEvent.change(screen.getAllByLabelText(/가격\(YoYo\)|Price \(YoYo\)/).at(-1)!, {
    target: { value: '30000' },
  })
  fireEvent.change(screen.getAllByLabelText(/^수량$|^Quantity$/).at(-1)!, {
    target: { value: '20' },
  })
  fireEvent.click(screen.getAllByRole('button', { name: /저장하고 다음|Save and continue/ })[0])
  await screen.findByRole('button', { name: /이전 단계|Previous step/ })
  expect(save.tickets.mock.calls[0][0].body.ticketTypes[1]).not.toHaveProperty('ticketTypeId')
  fireEvent.click(screen.getByRole('button', { name: /이전 단계|Previous step/ }))
  fireEvent.click(screen.getAllByRole('button', { name: /저장하고 다음|Save and continue/ })[0])
  await waitFor(() => expect(save.tickets).toHaveBeenCalledTimes(2))
  expect(save.tickets.mock.calls[1][0].body.ticketTypes).toEqual([
    { ticketTypeId: 31, name: '일반', price: 25000, totalQuantity: 80 },
    { ticketTypeId: 99, name: '후원', price: 30000, totalQuantity: 20 },
  ])
})
