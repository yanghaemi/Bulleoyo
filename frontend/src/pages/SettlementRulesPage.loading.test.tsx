/**
 * P-05 조회 3건의 도착 순서 — **정상 상황에서 오류 패널이 뜨면 안 된다.**
 *
 * 규칙 미설정(rule_02 404) 공연은 보증금 상태를 performance_06 에서만 받는다. 그 조회가
 * 아직인 순간 `depositStatus`가 undefined 라 넘길 `data`가 없고, 본문은 data 없음을 곧장
 * "불러오지 못했습니다"로 그린다. 세 조회가 다 끝나면 멀쩡해지는, 화면만 보면
 * "가끔 오류가 스쳤다" 정도로 지나가는 경로라 테스트로 잡는다.
 */

import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import i18n from '@/shared/i18n'
import { beforeEach, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/api/client'

import { SettlementRulesPage } from './SettlementRulesPage'

const state = vi.hoisted(() => ({
  minePending: true,
  mineItems: [] as unknown[],
}))

vi.mock('@/shared/queries/rule', () => ({
  // 규칙 미설정 = 404 COMMON_NOT_FOUND. 오류가 아니라 빈 폼이다
  useRuleStatus: () => ({
    data: undefined,
    error: new ApiError({ code: 'COMMON_NOT_FOUND', status: 404, msg: '없음' }),
    isPending: false,
    refetch: vi.fn(),
  }),
  useSetRules: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/shared/queries/performance', () => ({
  usePerformanceDetail: () => ({
    data: {
      performanceId: 12,
      title: '합정 3밴드 합동공연',
      status: 'DRAFT',
      participants: [
        { teamId: 7, teamName: '블루노트', host: true },
        { teamId: 9, teamName: '새벽세시', host: false },
      ],
    },
    isPending: false,
    refetch: vi.fn(),
  }),
  useMyPerformanceRows: () => ({
    data: state.minePending ? undefined : { items: state.mineItems },
    isPending: state.minePending,
  }),
  useSalesStatus: () => ({ data: undefined }),
}))
vi.mock('@/shared/queries/team', () => ({
  useMyTeams: () => ({ data: { items: [{ teamId: 7, teamName: '블루노트' }] } }),
}))

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/studio/performances/12/rules']}>
      <Routes>
        <Route path="/studio/performances/:id/rules" element={<SettlementRulesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('ko')
  vi.clearAllMocks()
  state.minePending = true
  state.mineItems = [{ performanceId: 12, host: true, depositStatus: 'PAID' }]
})

it('performance_06 이 아직이면 오류가 아니라 로딩이다', () => {
  renderPage()

  expect(screen.queryByText(/정산 규칙을 불러오지 못했습니다/)).not.toBeInTheDocument()
  // 스켈레톤은 텍스트가 아니라 aria-label 로 상태를 말한다(StudioSkeleton)
  expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
})

it('세 조회가 끝나면 규칙 미설정 공연도 빈 폼으로 연다', () => {
  state.minePending = false
  renderPage()

  expect(screen.queryByText(/정산 규칙을 불러오지 못했습니다/)).not.toBeInTheDocument()
  // 2단계 팀별 비율 입력이 참여팀 수만큼 열린다 = 폼이 열렸다
  expect(screen.getByText('블루노트')).toBeInTheDocument()
})

it('내 행이 끝내 없으면 보증금 상태를 지어내지 않는다 — 폼을 열지 않는다', () => {
  state.minePending = false
  state.mineItems = []
  renderPage()

  expect(screen.getByText(/정산 규칙을 불러오지 못했습니다/)).toBeInTheDocument()
})

/**
 * 리허설2 D-60 — 보증금 미납을 규칙 저장의 선행 조건으로 걸면 교착이 된다.
 * 서버는 `규칙 → createShow → 보증금` 순서라 규칙이 먼저다.
 */
it('보증금 미납이어도 규칙을 저장할 수 있다', () => {
  state.minePending = false
  state.mineItems = [{ performanceId: 12, host: true, depositStatus: 'UNPAID' }]
  renderPage()

  expect(screen.queryByText(/보증금을 먼저 납부해야/)).not.toBeInTheDocument()
  // 두 자리(PC·모바일 고정)가 같은 판정을 쓴다 — 어느 쪽도 잠겨 있으면 안 된다
  for (const button of screen.getAllByRole('button', { name: '규칙 저장' })) {
    expect(button).toBeEnabled()
  }
})
