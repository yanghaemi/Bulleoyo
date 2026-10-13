/**
 * P-02 팀 수정 페이로드 — **바뀐 필드만, 그리고 비우기가 실제로 실려야 한다.**
 *
 * `undefined`를 담으면 `JSON.stringify`가 키째 지워 PATCH 본문이 `{}`가 된다. 화면은
 * "저장됨"을 보여 주는데 소개는 그대로 남는다 — 화면만 봐서는 드러나지 않아 여기서 잡는다.
 * `null`도 안 된다: `Team.update`가 `if (description != null)`이라 null은 건너뛴다.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import i18n from '@/shared/i18n'
import { beforeEach, expect, it, vi } from 'vitest'

import { TeamManagePage } from './TeamManagePage'

const team = vi.hoisted(() => ({
  update: vi.fn(),
  introduction: '재즈 4인조' as string | null,
  genre: 'JAZZ' as string | null,
}))

vi.mock('@/shared/queries/team', () => ({
  useMyTeams: () => ({ data: { items: [{ teamId: 7, teamName: '블루노트' }] } }),
  useTeamDetail: () => ({
    data: {
      teamId: 7,
      teamName: '블루노트',
      introduction: team.introduction,
      genre: team.genre,
    },
    isPending: false,
  }),
  useUpdateTeam: () => ({ mutate: team.update }),
}))
vi.mock('@/shared/queries/wallet', () => ({
  useMyWallet: () => ({ data: undefined }),
  useMyWalletTransactions: () => ({ data: undefined }),
}))
vi.mock('@/shared/queries/performance', () => ({
  useMyPerformanceList: () => ({ data: { items: [] } }),
}))

function openEditForm() {
  render(
    <MemoryRouter initialEntries={['/studio/teams/7']}>
      <Routes>
        <Route path="/studio/teams/:teamId" element={<TeamManagePage />} />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: /수정/ }))
  return {
    intro: screen.getByLabelText(/소개/),
    save: screen.getByRole('button', { name: /저장/ }),
  }
}

beforeEach(async () => {
  await i18n.changeLanguage('ko')
  vi.clearAllMocks()
  team.introduction = '재즈 4인조'
  team.genre = 'JAZZ'
})

it('소개를 비우면 빈 문자열이 실린다 — undefined 면 키가 사라져 지워지지 않는다', () => {
  const { intro, save } = openEditForm()

  fireEvent.change(intro, { target: { value: '' } })
  fireEvent.click(save)

  expect(team.update).toHaveBeenCalledWith({ teamId: 7, body: { introduction: '' } })
  // 직렬화까지 살아남아야 서버에 닿는다
  const body = team.update.mock.calls[0][0].body
  expect(JSON.parse(JSON.stringify(body))).toEqual({ introduction: '' })
})

it('소개가 그대로면 아무것도 보내지 않는다', () => {
  const { save } = openEditForm()

  fireEvent.click(save)

  expect(team.update).not.toHaveBeenCalled()
})

it('소개가 원래 없던 팀에서 빈 채로 저장해도 요청하지 않는다', () => {
  team.introduction = null
  const { save } = openEditForm()

  fireEvent.click(save)

  expect(team.update).not.toHaveBeenCalled()
})

it('바뀐 필드만 보낸다 — 이름만 고치면 소개는 빠진다', () => {
  const { save } = openEditForm()

  fireEvent.change(screen.getByLabelText(/팀 이름/), { target: { value: '블루노트 트리오' } })
  fireEvent.click(save)

  expect(team.update).toHaveBeenCalledWith({ teamId: 7, body: { teamName: '블루노트 트리오' } })
})

/* ── [v8] 장르 — 폼에서는 필수, PATCH에는 바뀌었을 때만 실린다 ─────────────── */

it('장르를 바꾸면 그 값만 실린다', () => {
  const { save } = openEditForm()

  fireEvent.change(screen.getByLabelText(/장르/), { target: { value: 'ROCK' } })
  fireEvent.click(save)

  expect(team.update).toHaveBeenCalledWith({ teamId: 7, body: { genre: 'ROCK' } })
})

it('장르가 그대로면 보내지 않는다', () => {
  const { save } = openEditForm()

  fireEvent.change(screen.getByLabelText(/팀 이름/), { target: { value: '블루노트 트리오' } })
  fireEvent.click(save)

  expect(team.update).toHaveBeenCalledWith({ teamId: 7, body: { teamName: '블루노트 트리오' } })
})

it('장르가 10종 밖이던 팀은 유효한 장르를 고르기 전까지 수정 저장을 막는다', () => {
  // 마이그레이션은 기존 팀을 ETC로 바꾸지만, 오래된 응답도 유효하지 않은 코드를 재전송하지 않는다.
  team.genre = '재즈/퓨전'
  const { save } = openEditForm()

  expect(screen.getByLabelText(/장르/)).toHaveValue('')
  fireEvent.change(screen.getByLabelText(/팀 이름/), { target: { value: '블루노트 트리오' } })
  expect(save).toBeDisabled()

  fireEvent.change(screen.getByLabelText(/장르/), { target: { value: 'JAZZ' } })
  fireEvent.click(save)

  expect(team.update).toHaveBeenCalledWith({
    teamId: 7,
    body: { teamName: '블루노트 트리오', genre: 'JAZZ' },
  })
})
