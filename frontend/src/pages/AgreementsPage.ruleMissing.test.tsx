/**
 * P-06 진입 시 규칙이 아직 없을 때(rule_02 404 `COMMON_NOT_FOUND`) — **오류가 아니라 빈 상태**다.
 * 안내는 **생성자와 참여팀이 달라야 한다.**
 *
 * 규칙을 저장할 수 있는 사람은 생성자뿐이다(rule_01). 참여팀 리더에게 P-05 링크를 주면 눌러도
 * 403 이라 막다른 길이 된다 — MR !142 자동 리뷰 🔴.
 */

import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/api/client'

import { AgreementsPage } from './AgreementsPage'

const state = vi.hoisted(() => ({ host: true }))

vi.mock('@/shared/blockchain/useWeb3Auth', () => ({ useWeb3Auth: () => ({ adapter: null }) }))
vi.mock('@/shared/queries/chain', () => ({
  useChainJob: () => ({ timedOut: false }),
}))
vi.mock('@/shared/queries/team', () => ({
  useMyTeams: () => ({ data: { items: [{ teamId: 11, teamName: '노이즈캔슬', leader: true }] } }),
}))
vi.mock('@/shared/queries/performance', () => ({
  usePerformanceDetail: () => ({
    data: { performanceId: 12, title: '합정 3밴드 합동공연', status: 'DRAFT' },
    isPending: false,
    refetch: vi.fn(),
  }),
  useMyPerformanceRows: () => ({
    data: {
      items: [{ performanceId: 12, teamId: 11, host: state.host, depositStatus: 'UNPAID' }],
    },
    isPending: false,
  }),
}))
vi.mock('@/shared/queries/rule', () => ({
  // 규칙 미설정 = 404. 오류가 아니다
  useRuleStatus: () => ({
    data: undefined,
    isPending: false,
    error: new ApiError({ code: 'COMMON_NOT_FOUND', status: 404, msg: '없음' }),
    refetch: vi.fn(),
  }),
  usePrepareAgreement: () => ({ mutateAsync: vi.fn() }),
  useReportAgreementSignedTx: () => ({ mutateAsync: vi.fn() }),
  useStartSale: () => ({ mutateAsync: vi.fn() }),
}))

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/studio/performances/12/agreements']}>
      <Routes>
        <Route path="/studio/performances/:id/agreements" element={<AgreementsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  state.host = true
})

it('생성자에게는 규칙 화면으로 가는 링크를 준다', () => {
  renderPage()

  // 404 를 오류 패널로 덮지 않는다 — "다시 시도" 만 남으면 되돌아갈 길이 안 보인다
  expect(screen.queryByText(/불러오지 못했습니다/)).not.toBeInTheDocument()
  expect(screen.getByText('정산 규칙을 먼저 저장해 주세요')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '정산 규칙 화면으로' })).toHaveAttribute(
    'href',
    '/studio/performances/12/rules',
  )
})

it('참여팀 리더에게는 규칙 화면 링크를 주지 않는다 — 눌러도 403 이다', () => {
  state.host = false
  renderPage()

  expect(screen.queryByText(/불러오지 못했습니다/)).not.toBeInTheDocument()
  expect(screen.getByText('생성자가 정산 규칙을 저장하면 동의할 수 있습니다')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '정산 규칙 화면으로' })).not.toBeInTheDocument()
})
