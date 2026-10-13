/**
 * P-10 공연 취소 — 버튼 → 확인 모달 → `POST …/cancel` 호출까지 이어지는지 본다.
 *
 * 리허설에서 훅(`useCancelPerformance`)은 있는데 부르는 화면이 없었다. 화면에서 보면
 * "버튼이 없다"로만 보이고, 타입 검사·빌드는 통과한다 — 그래서 호출 자체를 테스트로 못 박는다.
 * 409 `PERFORMANCE_INVALID_STATUS`는 **모달을 닫지 않는다**(사용자가 상태를 확인해야 한다).
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'

import { ApiError } from '@/shared/api/client'

import { PerformanceEditPage } from './PerformanceEditPage'

const cancel = vi.hoisted(() => ({ mutate: vi.fn() }))

vi.mock('@/shared/blockchain/useWeb3Auth', () => ({ useWeb3Auth: () => ({ adapter: null }) }))
vi.mock('@/shared/queries/chain', () => ({
  useChainJob: () => ({ job: undefined, timedOut: false, isConfirmed: false, isFailed: false }),
}))
vi.mock('@/shared/queries/team', () => ({
  useMyTeams: () => ({ data: { items: [{ teamId: 7, teamName: '블루노트', leader: true }] } }),
}))
vi.mock('@/shared/queries/wallet', () => ({
  useMyWallet: () => ({ data: { status: 'LINKED', balance: { amount: 120_000 } } }),
}))
vi.mock('@/shared/queries/rule', () => ({
  // 이 화면은 rule_02 를 **규칙 동의 단계 판정에만** 쓴다. 이 테스트의 관심사가 아니므로
  // 규칙 미저장(404 → data 없음)으로 둔다 — 그래도 여는 단계는 요청한 그대로다
  useRuleStatus: () => ({ data: undefined, isPending: false, refetch: vi.fn() }),
}))
vi.mock('@/shared/queries/performance', () => ({
  // 판매 중(ON_SALE)이라 폼은 읽기 전용이고 남은 액션은 취소뿐이다
  usePerformanceDetail: () => ({
    data: {
      performanceId: 12,
      title: '합정 3밴드 합동공연',
      venueName: '합정 언플러그드',
      venueAddress: '서울 마포구 양화로 000',
      startAt: '2030-09-19T19:00:00+09:00',
      endAt: '2030-09-19T22:00:00+09:00',
      status: 'ON_SALE',
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
          priceAmount: 25_000,
          currency: 'KRW',
          totalQuantity: 80,
          remainingQuantity: 41,
        },
      ],
    },
    isPending: false,
    refetch: vi.fn(),
  }),
  useMyPerformanceRows: () => ({
    data: { items: [{ performanceId: 12, host: true, depositStatus: 'PAID' }] },
  }),
  useUpdatePerformance: () => ({ mutateAsync: vi.fn() }),
  useSetTicketTypes: () => ({ mutateAsync: vi.fn() }),
  usePrepareDeposit: () => ({ mutateAsync: vi.fn() }),
  useReportDepositSignedTx: () => ({ mutateAsync: vi.fn() }),
  useCancelPerformance: () => ({ mutate: cancel.mutate, isPending: false }),
}))

function openCancelDialog() {
  render(
    <MemoryRouter initialEntries={['/studio/performances/12/edit']}>
      <Routes>
        <Route path="/studio/performances/:id/edit" element={<PerformanceEditPage />} />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: /Cancel show/ }))
  return screen.getByRole('alertdialog', { name: '공연을 취소하시겠어요?' })
}

beforeEach(() => {
  vi.clearAllMocks()
  cancel.mutate.mockImplementation(() => undefined)
})

it('취소 버튼 → 모달 → 확정이 performance_12 를 멱등키와 함께 부른다', () => {
  openCancelDialog()

  // 사유는 관객 안내 문구로 그대로 노출된다 — 화면이 지어내지 않고 물어본다(performance_12 Body)
  const confirm = screen.getByRole('button', { name: '취소 확정' })
  expect(confirm).toBeDisabled()
  // 사유가 비었다는 것은 "처리 중"이 아니다 — 확정만 잠기고 닫기는 열려 있어야 한다
  // (`busy` 로 넘기면 닫기·Escape·배경까지 같이 잠긴다)
  for (const close of screen.getAllByRole('button', { name: '닫기' })) {
    expect(close).toBeEnabled()
  }
  // 확정이 잠겨 있으면 포커스는 다이얼로그가 받는다 — disabled 버튼은 focus() 가 듣지 않아
  // 그대로 두면 포커스가 모달 밖(여는 버튼)에 남는다
  const dialog = screen.getByRole('alertdialog')
  expect(dialog).toContainElement(document.activeElement as HTMLElement)

  fireEvent.change(screen.getByLabelText(/취소 사유/), {
    target: { value: '공연장 사정으로 부득이하게 취소되었습니다.' },
  })
  fireEvent.click(screen.getByRole('button', { name: '취소 확정' }))

  expect(cancel.mutate).toHaveBeenCalledTimes(1)
  expect(cancel.mutate.mock.calls[0][0]).toEqual({
    performanceId: 12,
    body: { reason: '공연장 사정으로 부득이하게 취소되었습니다.' },
    idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
  })
})

it('409 PERFORMANCE_INVALID_STATUS 는 한국어로 안내하고 모달을 닫지 않는다', () => {
  cancel.mutate.mockImplementation(
    (_vars: unknown, options?: { onError?: (error: unknown) => void }) => {
      options?.onError?.(
        new ApiError({
          code: 'PERFORMANCE_INVALID_STATUS',
          status: 409,
          msg: '이미 취소된 공연입니다.',
        }),
      )
    },
  )

  openCancelDialog()
  fireEvent.change(screen.getByLabelText(/취소 사유/), { target: { value: '취소 사유' } })
  fireEvent.click(screen.getByRole('button', { name: '취소 확정' }))

  // 보증금 문구("보증금 납부를 먼저 끝내 주세요")를 쓰지 않는다 — 이 맥락의 409는 상태 문제다
  expect(screen.getByRole('alert')).toHaveTextContent(
    '지금 상태에서는 취소할 수 없습니다. 판매 전이거나 이미 종료·취소된 공연입니다. 이미 취소된 공연입니다.',
  )
  expect(screen.getByRole('alertdialog', { name: '공연을 취소하시겠어요?' })).toBeInTheDocument()
})
