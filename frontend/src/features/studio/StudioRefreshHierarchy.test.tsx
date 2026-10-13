import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

import i18n from '@/shared/i18n'
import { PerformanceForm, type PerformanceEditData } from './PerformanceForm'
import { RuleAgreements, type AgreementScreenData } from './RuleAgreements'
import { SETUP_STEP_RULES } from './setupSteps'
import { StudioHome, type StudioPerformance } from './StudioHome'
import { TeamCreate } from './TeamCreate'

beforeEach(async () => {
  await i18n.changeLanguage('ko')
})

const performance: StudioPerformance = {
  performanceId: 12,
  title: '합정 라이브 나이트',
  startAtLabel: '2026. 09. 22. 19:00 KST',
  status: 'DRAFT',
  settlementStatus: 'NONE',
  depositStatus: 'UNPAID',
  teamId: 7,
  host: true,
  participationStatus: 'ACCEPTED',
  myTeamAgreementStatus: 'PENDING',
  pendingSignature: 'DEPOSIT',
}

it('할 일이 없으면 대시보드는 실행할 공연 목록을 먼저(기본 탭) 보여주고 팀 정보는 탭 뒤에 둔다', () => {
  render(
    <MemoryRouter>
      <StudioHome
        teams={[
          {
            teamId: 7,
            teamName: '블루노트',
            leader: true,
            walletAddress: '0x1234567890123456789012345678901234567890',
          },
        ]}
        performances={[performance]}
      />
    </MemoryRouter>,
  )

  // 요약 타일이 탭이 된 뒤(화면설계 v8.7 P-01)에는 세로 순서가 아니라 기본 탭으로 우선순위를 준다
  expect(screen.getByRole('heading', { name: '참여 공연' })).toBeVisible()
  expect(screen.queryByRole('heading', { name: '내 팀' })).not.toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /내 팀/ })).toHaveAttribute('aria-selected', 'false')
})

it('스튜디오 홈은 홍보 문구 대신 기능 이름으로 시작한다', async () => {
  await i18n.changeLanguage('en')
  render(
    <MemoryRouter>
      <StudioHome teams={[]} performances={[]} />
    </MemoryRouter>,
  )

  expect(screen.getByRole('heading', { name: 'Show management', level: 2 })).toBeVisible()
  expect(screen.queryByText('YOUR WORKSPACE')).not.toBeInTheDocument()
  expect(
    screen.queryByText('Keep your teams, shows and next steps in one place.'),
  ).not.toBeInTheDocument()
})

it('팀 이름과 소개를 입력하는 동안 실제 값만으로 팀 미리보기를 갱신한다', async () => {
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <TeamCreate
        wallet={{
          provider: 'WEB3AUTH',
          address: '0x1234567890123456789012345678901234567890',
          status: 'LINKED',
        }}
        onSubmit={() => undefined}
      />
    </MemoryRouter>,
  )

  await user.type(screen.getByLabelText(/팀 이름/), 'Blue Note')
  await user.type(screen.getByLabelText(/팀 소개/), '새로운 무대를 만드는 팀입니다.')

  const preview = screen.getByRole('region', { name: '팀 미리보기' })
  expect(within(preview).getByText('BN')).toBeInTheDocument()
  expect(within(preview).getByText('Blue Note')).toBeInTheDocument()
  expect(within(preview).getByText('새로운 무대를 만드는 팀입니다.')).toBeInTheDocument()
})

it('팀 생성은 장식 문구 없이 실제 입력 목적을 설명한다', async () => {
  await i18n.changeLanguage('en')
  render(
    <MemoryRouter>
      <TeamCreate
        wallet={{
          provider: 'WEB3AUTH',
          address: '0x1234567890123456789012345678901234567890',
          status: 'LINKED',
        }}
        onSubmit={() => undefined}
      />
    </MemoryRouter>,
  )

  expect(screen.getByRole('heading', { name: 'Create team', level: 2 })).toBeVisible()
  expect(screen.getByText('Enter the team information used to manage shows.')).toBeVisible()
  expect(screen.queryByText('A NEW BEGINNING')).not.toBeInTheDocument()
})

const editData: PerformanceEditData = {
  performanceId: 12,
  title: '합정 라이브 나이트',
  venueName: '롤링홀',
  venueAddress: '서울시 마포구 어울마당로 35',
  startAt: '2026-09-22T19:00:00+09:00',
  endAt: '2026-09-22T21:00:00+09:00',
  status: 'DRAFT',
  ticketTypes: [{ key: 't1', name: '일반', price: '25000', totalQuantity: '50' }],
}

it('공연 편집 단계 옆에 현재 입력값으로 만든 읽기 전용 공연 요약을 유지한다', () => {
  render(
    <MemoryRouter>
      <PerformanceForm mode="edit" data={editData} teams={[{ teamId: 7, teamName: '블루노트' }]} />
    </MemoryRouter>,
  )

  const summary = screen.getByRole('region', { name: '공연 요약' })
  expect(within(summary).getByText('합정 라이브 나이트')).toBeInTheDocument()
  expect(within(summary).getByText('롤링홀')).toBeInTheDocument()
})

it('공연 요약과 규칙 단계는 선택한 언어 하나로만 표시한다', async () => {
  await i18n.changeLanguage('en')
  render(
    <MemoryRouter>
      <PerformanceForm
        mode="edit"
        initialStep={SETUP_STEP_RULES}
        data={{ ...editData, status: 'PENDING_AGREEMENT' }}
        teams={[{ teamId: 7, teamName: 'Blue Note' }]}
      />
    </MemoryRouter>,
  )

  expect(screen.getByRole('heading', { name: 'Settlement rules', level: 3 })).toBeVisible()
  expect(screen.getByText('Show summary')).toBeVisible()
  expect(screen.queryByText('정산 규칙')).not.toBeInTheDocument()
  expect(screen.queryByText('SHOW SUMMARY')).not.toBeInTheDocument()
})

const agreementData: AgreementScreenData = {
  performanceId: 12,
  performanceStatus: 'PENDING_AGREEMENT',
  depositStatus: 'PAID',
  locked: false,
  rulesHash: `0x${'1'.repeat(64)}`,
  rule: {
    fixedRatioBp: 6000,
    selectionRatioBp: 4000,
    teamShares: [
      { teamId: 7, shareBp: 5000 },
      { teamId: 9, shareBp: 5000 },
    ],
  },
  agreements: [
    { teamId: 7, teamName: '블루노트', status: 'AGREED' },
    { teamId: 9, teamName: '새벽세시', status: 'PENDING' },
  ],
  myAgreement: { teamId: 7, status: 'AGREED', nextAction: 'NONE' },
  startSaleAvailable: false,
  startSaleBlockedReason: 'RULE_NOT_AGREED_BY_ALL',
  isOwner: true,
}

it('규칙 동의 화면 상단에서 실제 팀 수에 기반한 완료 현황을 한 문장으로 보여준다', () => {
  render(
    <MemoryRouter>
      <RuleAgreements title="합정 라이브 나이트" data={agreementData} />
    </MemoryRouter>,
  )

  expect(screen.getByRole('status', { name: '동의 진행률' })).toHaveTextContent(
    '2개 팀 중 1개 팀 동의 완료',
  )
})

it('영어 선택 시 동의 완료 현황에 한국어를 섞지 않는다', async () => {
  await i18n.changeLanguage('en')
  render(
    <MemoryRouter>
      <RuleAgreements title="Live night" data={agreementData} />
    </MemoryRouter>,
  )

  const progress = screen.getByRole('status', { name: 'Agreement progress' })
  expect(progress).toHaveTextContent('1 of 2 teams agreed')
  expect(progress).toHaveTextContent('Agreement progress')
  expect(progress).not.toHaveTextContent('AGREEMENT PROGRESS')
  expect(progress).not.toHaveTextContent('팀')
})
