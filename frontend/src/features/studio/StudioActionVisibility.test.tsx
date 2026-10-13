import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import i18n from '@/shared/i18n'
import { TeamManage } from './TeamManage'
import { ParticipantManage, type ParticipantScreenData } from './ParticipantManage'

beforeEach(async () => {
  await i18n.changeLanguage('ko')
})

const participants: ParticipantScreenData = {
  performanceId: 12,
  performanceStatus: 'DRAFT',
  isOwner: true,
  participants: [{ teamId: 7, teamName: '블루노트', host: true, participationStatus: 'ACCEPTED' }],
}

it('팀 ID와 리더 역할을 명시하고 미지원 탈퇴는 이유와 함께 비활성화한다', () => {
  render(
    <MemoryRouter>
      <TeamManage data={{ teamId: 7, teamName: '블루노트' }} />
    </MemoryRouter>,
  )
  const details = screen.getByRole('region', { name: '팀 정보' })
  expect(within(details).getByText('팀 ID')).toBeVisible()
  expect(within(details).getByText('7')).toBeVisible()
  expect(within(details).getByRole('button', { name: '팀 ID 복사' })).toBeEnabled()
  expect(within(details).getByText('팀 리더')).toBeVisible()
  expect(screen.getByRole('button', { name: '팀 나가기' })).toBeDisabled()
  expect(screen.getByText(/팀 탈퇴 기능은 아직 지원되지 않습니다/)).toBeVisible()
})

it('초대 성공은 일회성 토스트가 아닌 이 화면의 처리 결과로 남긴다', async () => {
  const invite = vi.fn().mockResolvedValue({ ok: true })
  render(
    <MemoryRouter>
      <ParticipantManage title="합동공연" data={participants} onInvite={invite} />
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText(/팀 ID/), { target: { value: '9' } })
  fireEvent.click(screen.getByRole('button', { name: '초대 보내기' }))
  expect(await screen.findByText('팀 #9에 초대를 보냈습니다.')).toBeVisible()
  expect(screen.getByText(/전체 이력이나 현재 수락 상태를 뜻하지 않습니다/)).toBeVisible()
  expect(invite).toHaveBeenCalledExactlyOnceWith(9)
})

it('실패한 초대를 성공 이력으로 만들지 않는다', async () => {
  const invite = vi.fn().mockResolvedValue({ ok: false, code: 'TEAM_NOT_FOUND' })
  render(
    <MemoryRouter>
      <ParticipantManage title="합동공연" data={participants} onInvite={invite} />
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText(/팀 ID/), { target: { value: '9' } })
  fireEvent.click(screen.getByRole('button', { name: '초대 보내기' }))
  expect(await screen.findByRole('alert')).toBeVisible()
  expect(screen.queryByText('팀 #9에 초대를 보냈습니다.')).not.toBeInTheDocument()
})

it('응답 대기 중에는 초대를 중복 제출하지 않고 완료 뒤 결과를 표시한다', async () => {
  let finish!: (result: { ok: boolean }) => void
  const invite = vi.fn(
    () =>
      new Promise<{ ok: boolean }>((resolve) => {
        finish = resolve
      }),
  )
  render(
    <MemoryRouter>
      <ParticipantManage title="합동공연" data={participants} onInvite={invite} />
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText(/팀 ID/), { target: { value: '9' } })
  const submit = screen.getByRole('button', { name: '초대 보내기' })
  fireEvent.click(submit)
  fireEvent.click(submit)
  expect(submit).toBeDisabled()
  expect(invite).toHaveBeenCalledTimes(1)
  expect(screen.queryByText('팀 #9에 초대를 보냈습니다.')).not.toBeInTheDocument()
  await act(async () => finish({ ok: true }))
  expect(await screen.findByText('팀 #9에 초대를 보냈습니다.')).toBeVisible()
})
