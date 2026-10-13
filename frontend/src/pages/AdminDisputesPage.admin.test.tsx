/**
 * M-02 이의제기 처리 — 실제 API 로 이은 뒤에도 지켜야 할 세 가지.
 *
 *   ① **상세 403이 목록을 죽이면 안 된다.** `settlement_01`의 `x-role`이 `[PERFORMER]`뿐이라
 *      관리자 계정은 정산 상세에서 403을 받을 수 있다. 그때 화면 전체를 권한 안내로 덮으면
 *      **이의를 하나도 처리할 수 없다** — 정산 정보는 처리의 참고 자료일 뿐이다.
 *   ② **409 두 종류를 구분해야 한다.** `COMMON_CONFLICT`(이미 처리됨)와
 *      `SETTLEMENT_ALREADY_RELEASED`(release가 끝나 결과가 바뀌지 않음)는 관리자가 할 행동이
 *      다르다. 같은 문구로 뭉개면 이미 끝난 건을 목록에서 계속 찾게 된다.
 *   ③ **낙관적 UI 금지.** 확인을 눌러도 응답 전에는 상태가 움직이지 않는다.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'

import { ApiError } from '@/shared/api/client'
import i18n from '@/shared/i18n'

import { AdminDisputesPage } from './AdminDisputesPage'

const q = vi.hoisted(() => ({
  resolve: vi.fn(),
  refetchList: vi.fn(),
  settlement: { data: undefined, error: null, isPending: false, refetch: vi.fn() } as {
    data: unknown
    error: unknown
    isPending: boolean
    refetch: () => void
  },
}))

const ITEM = {
  disputeId: 41,
  performanceId: 12,
  performanceTitle: '합정 3밴드 합동공연',
  teamId: 11,
  teamName: '노이즈캔슬',
  status: 'OPEN' as const,
  reason: '관객 선택 집계가 현장 카운트와 다릅니다.',
  expectedAmount: 320_000,
  currency: 'KRW',
  settlementStatus: 'DISPUTE_OPEN' as const,
  // 잠금 전에는 null 로 온다 — 화면이 그 줄을 그리지 않는지도 함께 본다
  disputeClosesAt: null,
  releaseHeld: true,
  createdAt: '2026-09-21T09:12:00+09:00',
  resolvedAt: null,
}

vi.mock('@/shared/queries/admin', () => ({
  useAdminDisputes: () => ({
    data: {
      summary: { openCount: 1, releaseHeldCount: 2 },
      items: [ITEM],
      pageInfo: { page: 0, size: 20, totalElements: 1, hasNext: false },
    },
    error: null,
    isPending: false,
    refetch: q.refetchList,
  }),
  useResolveDispute: () => ({ mutateAsync: q.resolve }),
}))

vi.mock('@/shared/queries/settlement', () => ({
  useSettlement: () => q.settlement,
}))

beforeEach(async () => {
  await i18n.changeLanguage('ko')
  q.resolve.mockReset()
  q.refetchList.mockReset()
  q.settlement = {
    data: undefined,
    error: new ApiError({
      code: 'SETTLEMENT_NOT_PARTICIPANT',
      status: 403,
      msg: '참여팀만 조회할 수 있습니다.',
    }),
    isPending: false,
    refetch: vi.fn(),
  }
})

function open() {
  render(
    <MemoryRouter>
      <AdminDisputesPage />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: /합정 3밴드 합동공연/ }))
}

/** 처리 의견은 10자 이상이어야 서버에 나간다(admin_06 minLength) */
function fillCommentAndSubmit(action: '승인(처리 완료)' | '반려') {
  fireEvent.change(screen.getByLabelText(/처리 의견/), {
    target: { value: '온체인 카운터와 서버 집계를 다시 대조했습니다.' },
  })
  fireEvent.click(screen.getByRole('button', { name: action }))
}

it('정산 상세가 403이어도 목록과 처리 버튼은 살아 있다', () => {
  open()

  expect(screen.getByText('정산 상세를 볼 수 없습니다')).toBeInTheDocument()
  // 목록 행도, 처리 버튼도 그대로다 — 상세는 참고 자료일 뿐이다
  expect(screen.getByRole('button', { name: /합정 3밴드 합동공연/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '승인(처리 완료)' })).toBeEnabled()
  // 마감 시각이 null 이면 그 줄을 그리지 않는다(현재 시각으로 채우지 않는다)
  expect(screen.queryByText('이의제기 마감')).not.toBeInTheDocument()
})

it('409 COMMON_CONFLICT는 이미 처리됨으로 안내하고 목록을 다시 불러온다', async () => {
  q.resolve.mockRejectedValue(
    new ApiError({ code: 'COMMON_CONFLICT', status: 409, msg: 'already resolved' }),
  )
  open()
  fillCommentAndSubmit('승인(처리 완료)')
  fireEvent.click(await screen.findByRole('button', { name: '승인' }))

  expect(await screen.findByText(/이미 처리된 이의입니다/)).toBeInTheDocument()
  expect(q.refetchList).toHaveBeenCalled()
})

it('409 SETTLEMENT_ALREADY_RELEASED는 다른 문구를 내고 버튼을 막는다', async () => {
  q.resolve.mockRejectedValue(
    new ApiError({ code: 'SETTLEMENT_ALREADY_RELEASED', status: 409, msg: '' }),
  )
  open()
  fillCommentAndSubmit('승인(처리 완료)')
  fireEvent.click(await screen.findByRole('button', { name: '승인' }))

  expect(await screen.findByText(/이미 release가 끝났습니다/)).toBeInTheDocument()
  expect(screen.queryByText(/이미 처리된 이의입니다/)).not.toBeInTheDocument()
  // 같은 요청은 또 409가 된다 — 다시 누를 수 있게 두지 않는다
  await waitFor(() => expect(screen.getByRole('button', { name: '승인(처리 완료)' })).toBeDisabled())
  // 목록을 다시 부르지 않는다 — 이 건은 아직 OPEN 이고 목록이 틀린 게 아니다
  expect(q.refetchList).not.toHaveBeenCalled()
})
