/**
 * 헤더 알림 수 === 스튜디오 홈 "확인할 일" 수 === 두 목록의 id 집합.
 *
 * 9/24 dev에서 같은 회원에게 헤더 10 · 홈 7이 떴다. 두 화면이 각자 다른 범위(전체 vs 현재 페이지)와
 * 다른 규칙(팀별 전개·정산 포함 여부)으로 계산했기 때문이다. 이 테스트는 **실제 두 화면을 한 번에
 * 렌더**해(StudioShell 안에 AppHeader가 있다) 결과가 같은지 본다. 네트워크 경계
 * (`fetchMyPerformanceList`)만 가짜로 두고 쿼리·규칙은 운영 코드 그대로다.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

import type { MyPerformanceListItem } from '@/shared/api/domains/performance'
import { fetchMyPerformanceList } from '@/shared/api/domains/performance'
import i18n from '@/shared/i18n'

import { StudioHomePage } from './StudioHomePage'

const { useMyPerformancesAll, useMyTeams } = vi.hoisted(() => ({
  useMyPerformancesAll: vi.fn(),
  useMyTeams: vi.fn(),
}))

vi.mock('@/shared/api/client', async (original) => {
  const actual = await original<typeof import('@/shared/api/client')>()
  return {
    ...actual,
    ensureOptionalAccessToken: vi.fn(async () => true),
    tokenStore: { ...actual.tokenStore, hasSession: () => true },
  }
})
vi.mock('@/shared/api/domains/member', async (original) => ({
  ...(await original<typeof import('@/shared/api/domains/member')>()),
  getMyMember: vi.fn(async () => ({ memberId: 1, roles: ['AUDIENCE', 'PERFORMER'] })),
}))
vi.mock('@/shared/api/domains/performance', async (original) => ({
  ...(await original<typeof import('@/shared/api/domains/performance')>()),
  fetchMyPerformanceList: vi.fn(),
}))
// 참여 공연 표는 할 일과 다른 조회다 — 일부러 첫 공연 하나만 준다
vi.mock('@/shared/queries/performance', () => ({
  useMyPerformancesAll,
  useDeletePerformance: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/shared/queries/team', () => ({ useMyTeams }))
vi.mock('@/shared/queries/wallet', () => ({
  useMyWallet: () => ({ data: undefined, error: null, isError: false }),
}))

const base = {
  depositStatus: 'UNPAID',
  host: true,
  participationStatus: 'ACCEPTED',
  myTeamAgreementStatus: 'PENDING',
  pendingSignature: null,
} as const

const ROWS: MyPerformanceListItem[] = [
  // 주최 DRAFT → 규칙
  { ...base, performanceId: 1, title: '규칙 공연', status: 'DRAFT', teamId: 7 },
  // 두 팀 리더 → 동의 2개(예전 홈은 첫 팀 1개만 셌다)
  {
    ...base,
    performanceId: 2,
    title: '합동 공연',
    status: 'PENDING_AGREEMENT',
    teamId: 7,
    host: false,
    pendingSignature: 'AGREE',
    myParticipatingTeams: [
      {
        teamId: 7,
        host: false,
        participationStatus: 'ACCEPTED',
        agreementStatus: 'PENDING',
        pendingSignature: 'AGREE',
      },
      {
        teamId: 8,
        host: false,
        participationStatus: 'ACCEPTED',
        agreementStatus: 'PENDING',
        pendingSignature: 'AGREE',
      },
    ],
  },
  // 초대
  {
    ...base,
    performanceId: 3,
    title: '초대 공연',
    status: 'DRAFT',
    teamId: 8,
    host: false,
    participationStatus: 'INVITED',
  },
  // 정산 — 예전 헤더는 세지 않았다
  {
    ...base,
    performanceId: 4,
    title: '집계 공연',
    status: 'ENDED',
    settlementStatus: 'NONE',
    depositStatus: 'RETURNED',
    teamId: 7,
  },
  {
    ...base,
    performanceId: 5,
    title: '정산 동의 공연',
    status: 'ENDED',
    settlementStatus: 'LOCKED',
    depositStatus: 'RETURNED',
    teamId: 7,
    host: false,
    myTeamSettlementApproved: false,
  },
  // 지급 완료 — 할 일 없음
  {
    ...base,
    performanceId: 6,
    title: '판매 공연',
    status: 'ENDED',
    settlementStatus: 'RELEASED',
    depositStatus: 'RETURNED',
    teamId: 7,
  },
]

beforeEach(async () => {
  await i18n.changeLanguage('ko')
  vi.mocked(fetchMyPerformanceList).mockImplementation(async (query) => ({
    items: ROWS.filter((r) => r.status === query.status),
    pageInfo: { page: 0, size: 100, totalElements: 0, hasNext: false },
  }))
  useMyTeams.mockReturnValue({
    data: { items: [{ teamId: 7, teamName: '블루노트', leader: true }] },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  })
  useMyPerformancesAll.mockReturnValue({
    data: { items: [ROWS[0]], totalElements: 6 },
    isPending: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  })
})

it('헤더 알림과 스튜디오 홈 할 일이 같은 수·같은 id 집합이다', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <StudioHomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )

  const expected = [
    'invite-3-8',
    'rules-1-7',
    'agree-2-7',
    'agree-2-8',
    'aggregate-4-7',
    'settle-approve-5-7',
  ]

  // 스튜디오 홈 배너
  const banner = await screen.findByRole('region', { name: '할 일' })
  await waitFor(() => expect(within(banner).getAllByRole('listitem')).toHaveLength(expected.length))
  const homeIds = within(banner)
    .getAllByRole('listitem')
    .map((li) => li.getAttribute('data-todo-id'))
  expect(screen.getByRole('tab', { name: /확인할 일/ })).toHaveTextContent(String(expected.length))

  // 헤더 알림
  const bell = await screen.findByRole('button', { name: `확인할 알림 ${expected.length}개` })
  fireEvent.click(bell)
  const panel = screen.getByRole('region', { name: '확인할 일' })
  const headerIds = within(panel)
    .getAllByRole('listitem')
    .map((li) => li.getAttribute('data-todo-id'))

  expect(homeIds).toEqual(expected)
  expect(headerIds).toEqual(homeIds)
  // 두 화면이 한 쿼리 키를 공유한다 — 상태 3개 × 1페이지 = 요청 3번뿐이다
  expect(fetchMyPerformanceList).toHaveBeenCalledTimes(3)
  // 표는 자기 조회(공연 1개)만 그린다 — 할 일은 그와 무관하다(참여 공연 탭)
  fireEvent.click(screen.getByRole('tab', { name: /참여 공연/ }))
  expect(screen.getAllByRole('link', { name: '규칙 공연' }).length).toBeGreaterThan(0)
  client.clear()
})
