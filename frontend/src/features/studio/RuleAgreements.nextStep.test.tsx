import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'

import i18n from '@/shared/i18n'

import { RuleAgreements, type AgreementScreenData } from './RuleAgreements'
import { SETUP_STEP_DEPOSIT } from './setupSteps'

beforeEach(async () => {
  await i18n.changeLanguage('ko')
})

const base: AgreementScreenData = {
  performanceId: 12,
  performanceStatus: 'PENDING_AGREEMENT',
  depositStatus: 'UNPAID',
  locked: false,
  rulesHash: '0x' + 'ab'.repeat(32),
  rule: {
    fixedRatioBp: 7000,
    selectionRatioBp: 3000,
    teamShares: [
      { teamId: 1, shareBp: 5000 },
      { teamId: 2, shareBp: 5000 },
    ],
  },
  agreements: [
    { teamId: 1, teamName: '블루노트', status: 'PENDING' },
    { teamId: 2, teamName: '새벽세시', status: 'PENDING' },
  ],
  myAgreement: { teamId: 1, status: 'PENDING', nextAction: 'SIGN' },
  startSaleAvailable: false,
  isOwner: true,
}

function Landed() {
  const location = useLocation()
  const step = (location.state as { step?: number } | null)?.step
  return (
    <p>
      도착 {location.pathname} / 단계 {String(step)}
    </p>
  )
}

function renderScreen(data: AgreementScreenData) {
  const onAgree = vi.fn(() => Promise.resolve({ ok: true }))
  render(
    <MemoryRouter initialEntries={['/studio/performances/12/agreements']}>
      <Routes>
        <Route
          path="/studio/performances/12/agreements"
          element={<RuleAgreements title="공연" data={data} onAgree={onAgree} />}
        />
        <Route path="/studio/performances/12/edit" element={<Landed />} />
        <Route path="/studio/performances/12/participants" element={<Landed />} />
      </Routes>
    </MemoryRouter>,
  )
  return onAgree
}

async function agree() {
  const user = userEvent.setup()
  await user.click(screen.getAllByRole('button', { name: '우리 팀 동의하기' })[0])
  return { user, dialog: await screen.findByRole('dialog', { name: '우리 팀 동의를 마쳤어요' }) }
}

/**
 * 9/24 — "보증금 화면으로"와 "우리 팀 동의하기"가 같이 있어 순서가 헷갈렸다.
 * 동의 전에는 보증금 안내를 숨기고, 동의가 확정되면 다음 할 일을 모달로 알린다.
 */
describe('P-06 우리 팀 동의 뒤 다음 단계', () => {
  it('우리 팀 동의 전에는 보증금 안내를 숨긴다', () => {
    renderScreen(base)

    expect(screen.queryByText(/보증금이 아직 납부되지 않아/)).toBeNull()
    expect(screen.queryByRole('link', { name: '보증금 화면으로' })).toBeNull()
  })

  it('주최팀·미납·다른 팀 동의 대기: 보증금은 미리 낼 수 있다고 알리고 보증금 단계로 보낸다', async () => {
    renderScreen({ ...base, jointPerformance: true })

    const { user, dialog } = await agree()
    expect(dialog).toHaveAccessibleDescription(
      '보증금은 지금 미리 낼 수 있어요. 다른 팀이 모두 동의하면 판매를 시작할 수 있어요.',
    )
    await user.click(within(dialog).getByRole('link', { name: '보증금 납부하러 가기' }))
    expect(
      screen.getByText(`도착 /studio/performances/12/edit / 단계 ${SETUP_STEP_DEPOSIT}`),
    ).toBeInTheDocument()
  })

  it('주최팀·미납·공동 공연 여부를 모르면: 수락 팀 수로 막혔다고 단정하지 않는다', async () => {
    renderScreen({
      ...base,
      agreements: [{ teamId: 1, teamName: '블루노트', status: 'PENDING' }],
      rule: { ...base.rule, teamShares: [{ teamId: 1, shareBp: 10000 }] },
    })

    const { dialog } = await agree()
    expect(dialog).toHaveAccessibleDescription('이제 보증금을 납부하면 판매를 시작할 수 있어요.')
    expect(within(dialog).getByRole('link', { name: '보증금 납부하러 가기' })).toBeInTheDocument()
  })

  it('주최팀·미납·공동 공연인데 수락 팀이 최소 미만: 초대 수락이 먼저라고 알리고 참여팀 관리로 보낸다', async () => {
    renderScreen({
      ...base,
      jointPerformance: true,
      agreements: [{ teamId: 1, teamName: '블루노트', status: 'PENDING' }],
      rule: { ...base.rule, teamShares: [{ teamId: 1, shareBp: 10000 }] },
    })

    const { user, dialog } = await agree()
    expect(dialog).toHaveAccessibleDescription('다른 팀이 초대를 수락해야 보증금을 낼 수 있어요.')
    expect(within(dialog).queryByRole('link', { name: '보증금 납부하러 가기' })).toBeNull()

    await user.click(within(dialog).getByRole('link', { name: '참여팀 초대' }))
    expect(
      screen.getByText('도착 /studio/performances/12/participants / 단계 undefined'),
    ).toBeInTheDocument()
  })

  it('주최팀·미납·다른 팀 전원 동의: 동의 확정 모달이 보증금 단계로 보낸다', async () => {
    renderScreen({
      ...base,
      jointPerformance: true,
      agreements: [
        { teamId: 1, teamName: '블루노트', status: 'PENDING' },
        { teamId: 2, teamName: '새벽세시', status: 'AGREED' },
      ],
    })

    const { user, dialog } = await agree()
    expect(dialog).toHaveAccessibleDescription('이제 보증금을 납부하면 판매를 시작할 수 있어요.')
    // 동의가 끝났으니 보증금 안내가 돌아온다
    expect(screen.getByText(/보증금이 아직 납부되지 않아/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('link', { name: '보증금 납부하러 가기' }))
    expect(
      screen.getByText(`도착 /studio/performances/12/edit / 단계 ${SETUP_STEP_DEPOSIT}`),
    ).toBeInTheDocument()
  })

  it('주최팀·납부 완료: 다른 팀 동의를 기다린다고 알리고 닫기만 둔다', async () => {
    renderScreen({ ...base, depositStatus: 'PAID' })

    const { dialog } = await agree()
    expect(dialog).toHaveAccessibleDescription('다른 팀 동의가 끝나면 판매를 시작할 수 있어요.')
    expect(within(dialog).queryByRole('link')).toBeNull()
    expect(within(dialog).queryByRole('button', { name: '판매 시작' })).toBeNull()
  })

  it('주최팀·납부 완료·전원 동의: "판매 시작"이 판매 시작 확인 모달로 잇는다', async () => {
    renderScreen({ ...base, depositStatus: 'PAID', startSaleAvailable: true })

    const { user, dialog } = await agree()
    expect(dialog).toHaveAccessibleDescription(
      '모든 팀이 동의했어요. 판매 시작을 눌러 예매를 여세요.',
    )
    await user.click(within(dialog).getByRole('button', { name: '판매 시작' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await screen.findByRole('alertdialog', { name: '판매를 시작할까요?' })).toBeInTheDocument()
  })

  it('참여팀: 주최팀이 보증금·판매를 맡는다고 알리고 닫기만 둔다', async () => {
    const user = userEvent.setup()
    renderScreen({ ...base, isOwner: false })

    const { dialog } = await agree()
    expect(dialog).toHaveAccessibleDescription(
      '공연을 만든 팀이 보증금을 내고 판매를 시작합니다.',
    )
    expect(within(dialog).queryByRole('link')).toBeNull()

    const closers = within(dialog).getAllByRole('button', { name: '닫기' })
    await user.click(closers[closers.length - 1])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('이미 동의를 마친 상태로 들어오면 모달 없이 보증금 안내를 그대로 보여준다', () => {
    renderScreen({
      ...base,
      agreements: [
        { teamId: 1, teamName: '블루노트', status: 'AGREED' },
        { teamId: 2, teamName: '새벽세시', status: 'PENDING' },
      ],
      myAgreement: { teamId: 1, status: 'AGREED', nextAction: 'NONE' },
    })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('link', { name: '보증금 화면으로' })).toBeInTheDocument()
  })

  it('참여팀에게는 보증금 화면 링크 없이 안내만 보여준다 — 보증금 화면은 주최팀 전용이다', () => {
    renderScreen({
      ...base,
      isOwner: false,
      agreements: [
        { teamId: 1, teamName: '블루노트', status: 'PENDING' },
        { teamId: 2, teamName: '새벽세시', status: 'AGREED' },
      ],
      myAgreement: { teamId: 2, status: 'AGREED', nextAction: 'NONE' },
    })

    expect(screen.queryByRole('link', { name: '보증금 화면으로' })).toBeNull()
    expect(
      screen.getByText('공연을 만든 팀이 보증금을 내면 판매를 시작할 수 있어요.'),
    ).toBeInTheDocument()
  })
})
