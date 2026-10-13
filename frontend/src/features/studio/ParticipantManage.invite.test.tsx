import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import i18n from '@/shared/i18n'

import { ParticipantManage, type ParticipantScreenData, type TeamCandidate } from './ParticipantManage'

beforeEach(async () => {
  await i18n.changeLanguage('ko')
})

/**
 * v8.12 — 팀 이름 콤보박스 초대 · 초대 현황(대기 중·수락함·초대 취소).
 */
const data: ParticipantScreenData = {
  performanceId: 12,
  performanceStatus: 'DRAFT',
  isOwner: true,
  ownTeamIds: [7],
  participants: [
    {
      teamId: 7,
      teamName: '블루노트',
      host: true,
      participationStatus: 'ACCEPTED',
      leaderWalletLinked: true,
      acceptedAt: '2026-09-26T01:00:00Z',
      myTeam: true,
    },
    {
      teamId: 9,
      teamName: '새벽세시',
      host: false,
      participationStatus: 'INVITED',
      invitedAt: '2026-09-26T02:00:00Z',
    },
  ],
}

const candidates: TeamCandidate[] = [
  { teamId: 7, teamName: '블루노트', genre: 'INDIE' },
  { teamId: 9, teamName: '새벽세시', genre: 'ROCK' },
  { teamId: 12, teamName: '블루스 브라더스', genre: 'ROCK' },
]

function renderWith(
  props: Partial<Parameters<typeof ParticipantManage>[0]> = {},
  screenData: ParticipantScreenData = data,
) {
  return render(
    <MemoryRouter>
      <ParticipantManage title="합동공연" data={screenData} {...props} />
    </MemoryRouter>,
  )
}

describe('참여팀 초대 콤보박스', () => {
  it('300ms 디바운스 뒤 한 번만 검색하고, 후보를 "팀 이름 · #ID"로 보인다', async () => {
    vi.useFakeTimers()
    try {
      const search = vi.fn().mockResolvedValue(candidates)
      renderWith({ onSearchTeams: search })
      const input = screen.getByRole('combobox', { name: /팀 이름 또는 팀 ID/ })

      fireEvent.change(input, { target: { value: '블' } })
      fireEvent.change(input, { target: { value: '블루' } })
      await act(async () => {
        vi.advanceTimersByTime(299)
      })
      expect(search).not.toHaveBeenCalled()
      await act(async () => {
        vi.advanceTimersByTime(1)
      })
      expect(search).toHaveBeenCalledTimes(1)
      expect(search.mock.calls[0][0]).toBe('블루')

      expect(input).toHaveAttribute('aria-expanded', 'true')
      expect(input).toHaveAttribute('aria-controls', 'invite-team-listbox')
      const listbox = screen.getByRole('listbox')
      expect(within(listbox).getAllByRole('option')).toHaveLength(3)
      expect(within(listbox).getByText('· #12')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('자기 팀·이미 초대한 팀은 비활성+사유로 남고, 키보드로 고른 팀을 초대한다', async () => {
    const search = vi.fn().mockResolvedValue(candidates)
    const invite = vi.fn().mockResolvedValue({ ok: true })
    renderWith({ onSearchTeams: search, onInvite: invite })
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: '블루' } })

    const options = await screen.findAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-disabled', 'true')
    expect(within(options[0]).getByText('내 팀')).toBeInTheDocument()
    expect(options[1]).toHaveAttribute('aria-disabled', 'true')
    expect(within(options[1]).getByText('이미 초대함')).toBeInTheDocument()
    expect(options[2]).not.toHaveAttribute('aria-disabled')

    // 비활성 후보에서 Enter 는 아무것도 하지 않는다(폼 제출도 막는다)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveAttribute('aria-activedescendant', 'invite-team-option-7')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(invite).not.toHaveBeenCalled()

    // ↑ 는 처음에서 끝으로 감긴다(0 → 2), ↓ 는 끝에서 처음으로(2 → 0)
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input).toHaveAttribute('aria-activedescendant', 'invite-team-option-12')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveAttribute('aria-activedescendant', 'invite-team-option-7')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input).toHaveAttribute('aria-activedescendant', 'invite-team-option-12')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input).toHaveValue('블루스 브라더스')
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('선택한 팀: 블루스 브라더스 · #12')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '초대 보내기' }))
    expect(invite).toHaveBeenCalledExactlyOnceWith(12)
  })

  it('Esc 로 목록을 닫는다', async () => {
    renderWith({ onSearchTeams: vi.fn().mockResolvedValue(candidates) })
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: '블루' } })
    await screen.findAllByRole('option')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('결과가 없으면 문구를 보이고, 검색이 실패해도 숫자 ID 로 초대할 수 있다', async () => {
    const invite = vi.fn().mockResolvedValue({ ok: true })
    const search = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('network'))
    renderWith({ onSearchTeams: search, onInvite: invite })
    const input = screen.getByRole('combobox')

    fireEvent.change(input, { target: { value: '없는팀' } })
    expect(await screen.findByText("'없는팀'와 일치하는 팀이 없습니다.")).toBeInTheDocument()

    fireEvent.change(input, { target: { value: '15' } })
    expect(await screen.findByText(/팀 검색에 실패했습니다/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '초대 보내기' }))
    expect(invite).toHaveBeenCalledExactlyOnceWith(15)
  })

  it('이름만 치고 고르지 않으면 초대하지 않고 안내한다', async () => {
    const invite = vi.fn().mockResolvedValue({ ok: true })
    renderWith({ onSearchTeams: vi.fn().mockResolvedValue(candidates), onInvite: invite })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '블루' } })
    fireEvent.click(screen.getByRole('button', { name: '초대 보내기' }))
    expect(invite).not.toHaveBeenCalled()
    expect(screen.getByText('목록에서 팀을 고르거나 팀 ID(숫자)를 입력해 주세요.')).toBeInTheDocument()
  })
})

describe('초대 현황', () => {
  it('대기 중·수락함 배지와 초대 시각을 보이고, 대기 중인 초대는 취소 버튼을 준다', () => {
    const remove = vi.fn().mockResolvedValue({ ok: true })
    renderWith({ onRemove: remove })

    expect(screen.getAllByText('초대 보냄(대기 중)').length).toBeGreaterThan(0)
    expect(screen.getAllByText('수락함').length).toBeGreaterThan(0)
    expect(screen.getByText('수락 대기 1팀')).toBeInTheDocument()
    // 2026-09-26T02:00Z = KST 11:00
    expect(screen.getAllByText(/초대 .*11:00/).length).toBeGreaterThan(0)
    // 주최 팀은 초대·취소 대상이 아니다
    expect(screen.getAllByRole('button', { name: '초대 취소' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: '제외' })).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: '초대 취소' })[0])
    expect(screen.getByText('보낸 초대를 취소할까요?')).toBeInTheDocument()
  })

  it('전체 목록이면 "수락한 팀만 보인다" 안내를 띄우지 않고, 예전 경로면 띄운다', () => {
    const { unmount } = renderWith()
    expect(screen.queryByText('보낸 초대 확인 안내')).not.toBeInTheDocument()
    unmount()
    renderWith({}, { ...data, participantsComplete: false })
    expect(screen.getByText('보낸 초대 확인 안내')).toBeInTheDocument()
  })
})
