/**
 * P-01 공연 삭제 버튼(API-performance-18) — **규칙 동의 전만** 지울 수 있다.
 *
 * 화면 조건이 서버 조건(`PerformanceService#delete`)과 같은지 지킨다. 여기가 느슨해지면
 * 사용자는 누를 수 있는 버튼을 누르고 409를 받는다 — 규칙을 두 곳에 적은 값이라 어긋나기 쉽다.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

import { StudioHome } from './StudioHome'
import type { StudioPerformance } from './StudioHome'
import i18n from '@/shared/i18n'

beforeEach(async () => {
  await i18n.changeLanguage('ko')
})

const leaderTeam = {
  teamId: 2,
  teamName: '햄둥이',
  leader: true,
  walletAddress: '0x1dC59a570C658fa9225E627f3C80921dD19307de',
}

/** 기본 세계는 삭제 가능한 공연이다. 각 테스트가 필요한 칸만 덮어쓴다 */
const draftShow: StudioPerformance = {
  performanceId: 7,
  title: '합정 3밴드 합동공연',
  status: 'DRAFT' as const,
  depositStatus: 'UNPAID' as const,
  teamId: 2,
  host: true,
  participationStatus: 'ACCEPTED' as const,
  myTeamAgreementStatus: 'PENDING' as const,
  pendingSignature: null,
}

function renderHome(show: StudioPerformance, onDeletePerformance = vi.fn()) {
  render(
    <MemoryRouter>
      <StudioHome
        teams={[leaderTeam]}
        performances={[show]}
        wallet={{ address: leaderTeam.walletAddress, provider: 'EXTERNAL', status: 'LINKED' }}
        onDeletePerformance={onDeletePerformance}
      />
    </MemoryRouter>,
  )
  return onDeletePerformance
}

it('규칙 동의 전 공연은 확인 모달을 거쳐 삭제한다', async () => {
  const onDelete = renderHome(draftShow, vi.fn().mockResolvedValue({ ok: true }))

  // PC 표와 모바일 패널 두 벌이 그려진다 — 어느 쪽을 눌러도 같은 모달이다
  fireEvent.click(screen.getAllByRole('button', { name: '공연 삭제' })[0])
  expect(screen.getByText(/되돌릴 수 없습니다/)).toBeInTheDocument()
  expect(onDelete).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: '삭제하기' }))
  await waitFor(() => expect(onDelete).toHaveBeenCalledWith(7))
})

it.each<[string, Partial<StudioPerformance>]>([
  ['판매가 열린 공연', { status: 'ON_SALE' }],
  ['보증금을 낸 공연', { depositStatus: 'PAID' }],
  ['내가 만들지 않은 공연', { host: false }],
])('%s에는 삭제 버튼을 그리지 않는다', (_label, patch) => {
  renderHome({ ...draftShow, ...patch })

  expect(screen.queryByRole('button', { name: '공연 삭제' })).not.toBeInTheDocument()
})

it('삭제 실패는 목록 위에 그대로 남겨 다시 시도할 수 있게 한다', async () => {
  renderHome(
    draftShow,
    vi.fn().mockResolvedValue({ ok: false, code: 'PERFORMANCE_ALREADY_ON_SALE' }),
  )

  fireEvent.click(screen.getAllByRole('button', { name: '공연 삭제' })[0])
  fireEvent.click(screen.getByRole('button', { name: '삭제하기' }))

  expect(await screen.findByRole('alert')).toBeInTheDocument()
})
