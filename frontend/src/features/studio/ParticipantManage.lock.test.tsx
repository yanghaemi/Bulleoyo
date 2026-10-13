import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import i18n from '@/shared/i18n'

beforeEach(async () => {
  await i18n.changeLanguage('ko')
})

import { ParticipantManage, type ParticipantScreenData } from './ParticipantManage'

/**
 * 잠금 판정과 "모르는 지갑 상태"만 본다 — 눌렀다가 409를 받는 일이 없어야 하고,
 * 모르는 값이 빨간 "미등록"으로 새 나가면 안 된다.
 */
const base: ParticipantScreenData = {
  performanceId: 12,
  performanceStatus: 'PENDING_AGREEMENT',
  isOwner: true,
  participants: [
    {
      teamId: 7,
      teamName: '블루노트',
      host: true,
      participationStatus: 'ACCEPTED',
      leaderWalletLinked: true,
    },
    {
      teamId: 9,
      teamName: '새벽세시',
      host: false,
      participationStatus: 'ACCEPTED',
      leaderWalletLinked: true,
    },
  ],
}

function renderWith(data: ParticipantScreenData) {
  return render(
    <MemoryRouter>
      <ParticipantManage title="합동공연" data={data} />
    </MemoryRouter>,
  )
}

describe('ParticipantManage 참여팀 잠금', () => {
  it('보증금 미납 · PENDING_AGREEMENT 에서는 초대·제외를 연다', () => {
    renderWith({ ...base, depositStatus: 'UNPAID' })

    // 라벨에 sr-only "필수"가 붙어 정확 일치가 아니다
    expect(screen.getByLabelText(/팀 ID/)).toBeEnabled()
    // 주최 팀(7)에는 제외가 없다 — 남는 것은 새벽세시(9) 한 팀분이다(PC 표 + 모바일 패널)
    expect(screen.getAllByRole('button', { name: '제외' }).length).toBeGreaterThan(0)
  })

  it('보증금이 PAID 면 상태가 PENDING_AGREEMENT 여도 닫는다 — 온체인 공연이 이미 등록됐다', () => {
    renderWith({ ...base, depositStatus: 'PAID' })

    expect(screen.queryByLabelText(/팀 ID/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '제외' })).not.toBeInTheDocument()
    expect(screen.getByText(/온체인에 공연이 등록돼 참여팀 구성이 잠겼습니다/)).toBeInTheDocument()
  })

  it('판매 시작 뒤에는 판매를 사유로 말한다', () => {
    renderWith({ ...base, performanceStatus: 'ON_SALE', depositStatus: 'PAID' })

    expect(screen.getByText(/판매가 시작돼 참여팀 구성이 잠겼습니다/)).toBeInTheDocument()
  })

  it('지갑 등록 여부를 모르는 행은 미등록으로 그리지 않고 다음 단계도 막지 않는다', () => {
    renderWith({
      ...base,
      participants: [
        base.participants[0],
        {
          teamId: 11,
          teamName: '노이즈캔슬',
          host: false,
          participationStatus: 'INVITED',
          myTeam: true,
        },
      ],
    })

    expect(screen.queryByText('미등록')).not.toBeInTheDocument()
    expect(screen.queryByText(/지갑을 등록하지 않은 팀이 있어/)).not.toBeInTheDocument()
  })

  it('지갑 미등록이 확인된 행은 배지와 경고를 함께 띄운다', () => {
    renderWith({
      ...base,
      participants: [
        base.participants[0],
        {
          teamId: 11,
          teamName: '노이즈캔슬',
          host: false,
          participationStatus: 'ACCEPTED',
          leaderWalletLinked: false,
        },
      ],
    })

    expect(screen.getAllByText('미등록').length).toBeGreaterThan(0)
    expect(screen.getByText(/지갑을 등록하지 않은 팀이 있어/)).toBeInTheDocument()
  })
})
