import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import i18n from '@/shared/i18n'

beforeEach(async () => {
  await i18n.changeLanguage('ko')
})

import { PerformanceForm, type PerformanceEditData } from './PerformanceForm'
import {
  SETUP_STEP_AGREEMENTS,
  SETUP_STEP_DEPOSIT,
  SETUP_STEP_PARTICIPANTS,
  SETUP_STEP_RULES,
} from './setupSteps'

const data: PerformanceEditData = {
  performanceId: 12,
  title: '로컬 테스트 공연',
  venueName: '롤링홀',
  venueAddress: '서울시 마포구 어울마당로 35',
  startAt: '2030-09-22T19:00:00+09:00',
  endAt: '2030-09-22T21:00:00+09:00',
  status: 'DRAFT',
  ticketTypes: [{ key: 't1', ticketTypeId: 1, name: '일반', price: '25000', totalQuantity: '50' }],
}

/** §5.19로 액션이 데스크톱·모바일 두 곳에 그려진다 — 같은 버튼이 둘이다 */
function saveButtons() {
  return screen.getAllByRole('button', { name: '저장하고 다음' })
}

function renderForm(props: Partial<Parameters<typeof PerformanceForm>[0]>) {
  return render(
    <MemoryRouter>
      <PerformanceForm mode="edit" data={data} teams={[{ teamId: 1, teamName: '팀' }]} {...props} />
    </MemoryRouter>,
  )
}

describe('PerformanceForm 5단계 준비 흐름', () => {
  it('생성 모드는 공연 일시를 비워 두고 연다 — 현재 시각을 미리 채우지 않는다', () => {
    // S15P21B204-144(리허설 2 D-71). 공연 13·15 의 공연일이 생성 몇 분 뒤로 저장됐는데,
    // 초기값이 현재 시각으로 채워져 있었다면 사용자가 건드리지 않아도 그 증상이 된다.
    // `performanceFields.date.test.ts` 는 `isoToKstInput(undefined) === ''` 만 보므로
    // 누가 `|| nowKstInput()` 같은 프리필을 **폼 쪽에** 붙이면 그 테스트는 그대로 통과한다.
    // 그래서 실제로 렌더한 입력의 값을 여기서 못 박는다
    render(
      <MemoryRouter>
        <PerformanceForm mode="create" teams={[{ teamId: 1, teamName: '팀' }]} />
      </MemoryRouter>,
    )

    expect(screen.getByLabelText(/공연 날짜/)).toHaveValue('')
    expect(screen.getByLabelText(/시작 시각/)).toHaveValue('')
    expect(screen.getByLabelText(/종료 시각/)).toHaveValue('')
  })

  it('수정 모드는 저장된 일시를 공연 날짜 하나와 시작·종료 시각으로 나눠 보여준다', () => {
    // 9/26 — 두 칸의 `datetime-local`("공연 일시 ~ 공연 종료")을 여러 날 기간으로 읽었다
    renderForm({})

    expect(screen.getByLabelText(/공연 날짜/)).toHaveValue('2030-09-22')
    expect(screen.getByLabelText(/시작 시각/)).toHaveValue('19:00')
    expect(screen.getByLabelText(/종료 시각/)).toHaveValue('21:00')
    expect(screen.getByText(/하루 공연 기준이에요/)).toBeInTheDocument()
  })

  it('첫 단계에 공연 정보와 티켓 옵션을 함께 보여준다', () => {
    renderForm({ onSaveSetup: () => Promise.resolve({ ok: true as const }) })

    expect(screen.getByLabelText(/공연 제목/)).toBeInTheDocument()
    expect(screen.getAllByLabelText(/수량/).length).toBeGreaterThan(0)
  })

  it('수정 모드는 공연 형태를 읽기 전용 한 줄로만 보여준다', () => {
    // `PerformanceUpdateRequest` 에 `jointPerformance` 가 없다. 켤 수 있어 보이는 컨트롤을
    // 두면 눌러도 저장되지 않는 자리가 된다
    renderForm({ data: { ...data, jointPerformance: true } })

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getAllByText('합동 공연').length).toBeGreaterThan(0)
    expect(
      screen.getByText(/공연 형태는 생성할 때 정하며 나중에 바꿀 수 없습니다/),
    ).toBeInTheDocument()
  })

  it('생성 모드는 페이지 모달이 고른 공연 형태를 문구로 보이고 저장에 그 값을 넘긴다', async () => {
    // 9/26 — 작은 체크박스를 지나쳤다. 생성 페이지가 모달로 먼저 묻고 폼은 결과만 보여 준다
    const user = userEvent.setup()
    const onSaveSetup = vi.fn(() => Promise.resolve({ ok: true as const }))
    const onChangeJointPerformance = vi.fn()
    render(
      <MemoryRouter>
        <PerformanceForm
          mode="create"
          teams={[{ teamId: 1, teamName: '팀' }]}
          onSaveSetup={onSaveSetup}
          jointPerformance
          onChangeJointPerformance={onChangeJointPerformance}
        />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByTestId('joint-choice')).toHaveTextContent('합동 공연')
    await user.click(screen.getByRole('button', { name: '공연 형태 변경' }))
    expect(onChangeJointPerformance).toHaveBeenCalledTimes(1)

    // 필수 입력을 채워야 저장이 핸들러까지 간다. 한 글자씩 치면(`user.type`) 이 테스트만
    // 2초를 넘겨 전체 스위트가 붐빌 때 5초 상한에 걸린다 — 값만 필요하므로 한 번에 넣는다
    const fill = (field: HTMLElement, value: string) =>
      fireEvent.change(field, { target: { value } })
    fill(screen.getByLabelText(/공연 제목/), '합정 3밴드 합동공연')
    fill(screen.getByLabelText(/^장소/), '합정 언플러그드')
    fill(screen.getByLabelText(/^주소/), '서울 마포구 양화로 000')
    fill(screen.getByLabelText(/공연 날짜/), '2030-09-19')
    fill(screen.getByLabelText(/시작 시각/), '19:00')
    fill(screen.getByLabelText(/종료 시각/), '22:00')
    fill(screen.getAllByLabelText(/타입명/)[0], '일반')
    fill(screen.getAllByLabelText(/가격/)[0], '25000')
    fill(screen.getAllByLabelText(/수량/)[0], '50')

    await user.click(screen.getAllByRole('button', { name: '저장하고 다음' })[0])

    expect(onSaveSetup).toHaveBeenCalledWith(
      expect.objectContaining({ jointPerformance: true }),
      expect.anything(),
    )
  })

  it('모달에서 합동 공연으로 바꾸면 단계 표시가 그 자리에서 4개 → 5개가 된다', () => {
    // 공연을 저장하기 전이라 `data` 가 없다 — 고른 공연 형태가 단계 표시의 정본이어야 한다
    const form = (joint: boolean) => (
      <MemoryRouter>
        <PerformanceForm
          mode="create"
          teams={[{ teamId: 1, teamName: '팀' }]}
          jointPerformance={joint}
        />
      </MemoryRouter>
    )
    const { rerender } = render(form(false))

    expect(screen.getByRole('list', { name: /단계/ })).not.toHaveTextContent('참여팀')

    rerender(form(true))

    expect(screen.getByRole('list', { name: /단계/ })).toHaveTextContent('참여팀')
  })

  it('저장 핸들러가 없으면 첫 단계 저장 버튼을 누를 수 없다', () => {
    renderForm({})

    for (const button of saveButtons()) expect(button).toBeDisabled()
  })

  it('한 번의 저장으로 공연 정보와 티켓 옵션을 넘기고 정산 규칙 단계로 이동한다', async () => {
    const user = userEvent.setup()
    const onSaveSetup = vi.fn(() => Promise.resolve({ ok: true as const }))
    renderForm({
      onSaveSetup,
      deposit: { status: 'UNPAID', amount: 50_000 },
      wallet: {
        provider: 'WEB3AUTH' as const,
        address: '0x' + '1'.repeat(40),
        status: 'LINKED' as const,
        balanceAmount: 100_000,
      },
    })

    await user.click(saveButtons()[0])

    expect(onSaveSetup).toHaveBeenCalledTimes(1)
    expect(onSaveSetup).toHaveBeenCalledWith(
      expect.objectContaining({ title: '로컬 테스트 공연' }),
      [expect.objectContaining({ name: '일반', price: '25000', totalQuantity: '50' })],
    )
    // 저장 다음은 규칙이다 — 보증금은 규칙을 저장한 뒤다(서버 순서 `규칙 → createShow → 보증금`)
    expect(await screen.findByRole('region', { name: '정산 규칙' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '보증금 납부하기' })).not.toBeInTheDocument()
  })

  it('initialStep 이 보증금이면 보증금 단계부터 연다', () => {
    renderForm({ initialStep: SETUP_STEP_DEPOSIT })

    expect(screen.getByRole('region', { name: '보증금' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/공연 제목/)).not.toBeInTheDocument()
  })
})

/**
 * 준비 흐름은 `공연 정보·티켓 옵션 → 참여팀 → 정산 규칙 → 보증금` 네 단계다. 가운데 두
 * 단계는 편집기가 따로 있어 P-04·P-05 가 맡지만, **진행 표시에는 반드시 보여야 한다** —
 * 화면이 갈린다고 단계가 사라지면 사용자는 보증금 앞에 무엇이 있는지 알 길이 없다.
 */
describe('준비 단계 표시', () => {
  it('합동 공연은 정보·티켓 옵션 → 참여팀 → 정산 규칙 → 규칙 동의 → 보증금 순으로 그린다', () => {
    renderForm({ data: { ...data, jointPerformance: true } })

    const steps = screen.getByRole('list', { name: /단계/ })
    const label = steps.textContent ?? ''
    expect(steps).toHaveTextContent('공연 정보·티켓 옵션')
    expect(steps).toHaveTextContent('참여팀')
    expect(steps).toHaveTextContent('정산 규칙')
    expect(steps).toHaveTextContent('규칙 동의')
    expect(steps).toHaveTextContent('보증금')
    // 순서가 뒤집히면 규칙을 먼저 정하고 참여팀을 뒤에 부르는 옛 흐름으로 돌아간다
    expect(label.indexOf('참여팀')).toBeLessThan(label.indexOf('정산 규칙'))
    // 보증금이 동의 앞으로 가면 "보증금부터 내라"는 옛 안내로 되돌아간다(팀 결정 2026-09-21)
    expect(label.indexOf('규칙 동의')).toBeLessThan(label.lastIndexOf('보증금'))
  })

  it('단독 공연은 참여팀 단계를 숨기고 규칙 동의는 남긴다', () => {
    // 컨트랙트가 `agreedCount == teamWallets.length` 를 요구해 생성 팀 리더도 서명해야 한다
    renderForm({})

    const steps = screen.getByRole('list', { name: /단계/ })
    expect(steps).not.toHaveTextContent('참여팀')
    expect(steps).toHaveTextContent('규칙 동의')
    // `Stepper` 는 `<ol>` 이라 표시 배열과 active 가 같은 좌표계여야 한다 — 4단계다
    expect(steps).toHaveAccessibleName('단계 1 / 4')
  })

  it('규칙 단계는 편집기를 복제하지 않고 P-05 로 보낸다', async () => {
    renderForm({ initialStep: SETUP_STEP_RULES })

    const link = screen.getByRole('link', { name: '정산 규칙 정하러 가기' })
    expect(link).toHaveAttribute('href', '/studio/performances/12/rules')
    // 아직 저장 전(DRAFT)이라 보증금으로 건너뛸 길을 주지 않는다
    expect(screen.queryByRole('button', { name: '보증금 단계로' })).not.toBeInTheDocument()
  })

  it('규칙 단계에서는 보증금 액션을 어디에도 두지 않는다', () => {
    // 하단 고정(모바일)이 `step === 0` 의 반대를 보증금으로 읽으면 규칙 단계에서 납부가 눌린다
    renderForm({
      initialStep: SETUP_STEP_RULES,
      data: { ...data, status: 'PENDING_AGREEMENT' },
      onPayDeposit: () => Promise.resolve({ ok: true as const }),
      deposit: { status: 'UNPAID', amount: 50_000 },
    })

    expect(screen.queryByRole('button', { name: '보증금 납부하기' })).not.toBeInTheDocument()
  })

  it('규칙 단계에서 공연 정보로 돌아갈 수 있다', async () => {
    // 하단 고정도 PC 액션 행도 이 단계는 그리지 않고 Stepper 는 눌리지 않는다 —
    // 카드 안 '이전 단계'가 화면 안 유일한 되돌아가는 길이다
    renderForm({ initialStep: SETUP_STEP_RULES })

    await userEvent.click(screen.getByRole('button', { name: '이전 단계' }))

    expect(screen.getByLabelText(/공연 제목/)).toBeInTheDocument()
  })

  it('규칙이 저장된 뒤에는(DRAFT 를 벗어나면) 규칙 동의 단계로 넘어갈 수 있다', async () => {
    renderForm({ initialStep: SETUP_STEP_RULES, data: { ...data, status: 'PENDING_AGREEMENT' } })

    await userEvent.click(screen.getByRole('button', { name: '규칙 동의 단계로' }))

    expect(screen.getByRole('region', { name: '규칙 동의' })).toBeInTheDocument()
  })
})

/**
 * 규칙 동의 단계 — **보증금 앞이다**(팀 결정 2026-09-21).
 *
 * 동의(rule_03)의 선행 조건은 `참여팀 리더 · ACCEPTED · PENDING_AGREEMENT · 지갑 LINKED` 뿐이고
 * 보증금을 보지 않는다. 판매 시작만이 `DepositRequired`·`NotAllAgreed` 둘 다로 막으므로
 * 보증금은 판매 직전 마지막 잠금이다. 그 순서를 여기서 못 박는다.
 */
describe('규칙 동의 단계', () => {
  const ruled: PerformanceEditData = { ...data, status: 'PENDING_AGREEMENT' }

  it('규칙 미저장이면 동의 대신 규칙 단계로 돌려보낸다', async () => {
    // rule_02 가 404 인 상태다 — 동의할 `rulesHash` 자체가 없다
    renderForm({ initialStep: SETUP_STEP_AGREEMENTS })

    expect(screen.getByText(/정산 규칙을 먼저 저장하세요/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '규칙 동의 받으러 가기' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '정산 규칙 단계로' }))

    expect(screen.getByRole('region', { name: '정산 규칙' })).toBeInTheDocument()
  })

  it('동의가 덜 끝났으면 P-06 으로 보내고 보증금으로 넘기지 않는다', () => {
    renderForm({ initialStep: SETUP_STEP_AGREEMENTS, data: ruled, allAgreed: false })

    const link = screen.getByRole('link', { name: '규칙 동의 받으러 가기' })
    expect(link).toHaveAttribute('href', '/studio/performances/12/agreements')
    expect(link.className).toContain('bg-primary')
    expect(screen.queryByRole('button', { name: '보증금 단계로' })).not.toBeInTheDocument()
  })

  it('전원 동의하면 보증금 단계로 넘어간다', async () => {
    renderForm({ initialStep: SETUP_STEP_AGREEMENTS, data: ruled, allAgreed: true })

    expect(screen.getByRole('link', { name: '동의 현황 다시 보기' }).className).toContain(
      'bg-surface',
    )

    await userEvent.click(screen.getByRole('button', { name: '보증금 단계로' }))

    expect(screen.getByRole('region', { name: '보증금' })).toBeInTheDocument()
  })

  it('동의 단계에서는 보증금 액션을 어디에도 두지 않는다', () => {
    renderForm({
      initialStep: SETUP_STEP_AGREEMENTS,
      data: ruled,
      onPayDeposit: () => Promise.resolve({ ok: true as const }),
      deposit: { status: 'UNPAID', amount: 50_000 },
    })

    expect(screen.queryByRole('button', { name: '보증금 납부하기' })).not.toBeInTheDocument()
  })

  it('보증금 단계로 직접 와도 납부를 막지 않는다 — 순서 안내만 한다', () => {
    // 서버는 동의 전 보증금도 받는다. 화면이 잠그면 동의를 기다리는 동안 리더가 자기
    // 보증금을 낼 길이 사라진다
    renderForm({
      initialStep: SETUP_STEP_DEPOSIT,
      data: ruled,
      allAgreed: false,
      deposit: { status: 'UNPAID', amount: 50_000 },
      wallet: {
        provider: 'WEB3AUTH' as const,
        address: '0x' + '1'.repeat(40),
        status: 'LINKED' as const,
        balanceAmount: 100_000,
      },
      onPayDeposit: () => Promise.resolve({ ok: true as const }),
    })

    expect(screen.getByText(/규칙 동의가 아직 끝나지 않았습니다/)).toBeInTheDocument()
    for (const button of screen.getAllByRole('button', { name: '보증금 납부하기' })) {
      expect(button).toBeEnabled()
    }
  })
})

/**
 * 참여팀 단계 — S15P21B204-136(장부 D-76).
 *
 * 규칙 화면은 `participants[]` 로 팀 몫을 나누고, 서버는 공동 공연의 보증금 prepare 에서
 * 수락 참여팀 2 이상을 요구한다(`TEAM_MIN_COUNT_NOT_MET`). 초대가 규칙 뒤에 있으면 공동
 * 공연은 규칙이 1팀으로 굳고 보증금에서 409 가 난다. 그 순서를 여기서 못 박는다.
 */
describe('참여팀 단계', () => {
  const joint: PerformanceEditData = { ...data, jointPerformance: true }

  it('공동 공연에 수락한 팀이 하나뿐이면 P-04 로 보내고 규칙으로 넘기지 않는다', () => {
    renderForm({
      initialStep: SETUP_STEP_PARTICIPANTS,
      data: { ...joint, acceptedParticipantCount: 1 },
    })

    expect(screen.getByRole('region', { name: '참여팀' })).toBeInTheDocument()
    const link = screen.getByRole('link', { name: '참여팀 초대' })
    expect(link).toHaveAttribute('href', '/studio/performances/12/participants')
    // 아직 할 일이 남은 단계라 링크가 주 액션이다
    expect(link.className).toContain('bg-primary')
    expect(screen.queryByRole('button', { name: '정산 규칙으로' })).not.toBeInTheDocument()
    // 편집 UI(초대 폼)를 여기 복제하지 않는다 — P-04 의 몫이다
    expect(screen.queryByLabelText(/팀 ID/)).not.toBeInTheDocument()
  })

  it('수락한 팀이 둘이면 완료로 보고 정산 규칙으로 넘어간다', async () => {
    renderForm({
      initialStep: SETUP_STEP_PARTICIPANTS,
      data: { ...joint, acceptedParticipantCount: 2 },
    })

    // 끝난 단계의 링크는 보조 액션으로 내려간다(`RulesStep` 의 `saved` 분기와 같은 조합)
    expect(screen.getByRole('link', { name: '참여팀 초대' }).className).toContain('bg-surface')

    await userEvent.click(screen.getByRole('button', { name: '정산 규칙으로' }))

    expect(screen.getByRole('region', { name: '정산 규칙' })).toBeInTheDocument()
  })

  it('단독 공연은 저장 뒤 참여팀 단계를 건너뛰고 규칙으로 간다', async () => {
    // `data` 는 `jointPerformance` 가 없다 — 모르면 단독으로 본다
    renderForm({ onSaveSetup: () => Promise.resolve({ ok: true as const }) })

    await userEvent.click(saveButtons()[0])

    expect(await screen.findByRole('region', { name: '정산 규칙' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '참여팀' })).not.toBeInTheDocument()
  })

  it('공동 공연은 저장 뒤 참여팀 단계로 간다', async () => {
    renderForm({
      data: { ...joint, acceptedParticipantCount: 1 },
      onSaveSetup: () => Promise.resolve({ ok: true as const }),
    })

    await userEvent.click(saveButtons()[0])

    expect(await screen.findByRole('region', { name: '참여팀' })).toBeInTheDocument()
  })

  it('단독 공연이 이 단계에 들어와도 막다른 화면이 아니다', () => {
    // `state.step` 으로 들어올 수 있다. 건너뛴다고 말하고 규칙으로 가는 길을 준다
    renderForm({ initialStep: SETUP_STEP_PARTICIPANTS })

    expect(screen.getByText(/혼자 무대에 오르는 공연이라 이 단계는 건너뜁니다/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '정산 규칙으로' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '참여팀 초대' })).not.toBeInTheDocument()
  })
})

/**
 * 보증금 액션 자리의 **되살아남**을 막는다.
 *
 * 확정을 못 본 두 경우(폴링 상한 · 핸들러 예외)가 서로 반대 방향이다. 상한은 tx 가 아직
 * 살아 있어 다시 서명하면 두 번 내고, 예외는 아무것도 안 나갔는데 진행 표시에 갇힌다.
 */
describe('보증금 확정 실패 경로', () => {
  const wallet = {
    provider: 'WEB3AUTH' as const,
    address: '0x' + '1'.repeat(40),
    status: 'LINKED' as const,
    balanceAmount: 100_000,
  }

  function renderDepositStep(onPayDeposit: Parameters<typeof PerformanceForm>[0]['onPayDeposit']) {
    return renderForm({
      initialStep: SETUP_STEP_DEPOSIT,
      data: { ...data, status: 'PENDING_AGREEMENT' },
      deposit: { status: 'UNPAID', amount: 50_000 },
      wallet,
      onPayDeposit,
    })
  }

  it('폴링 상한에 닿으면 다시 납부할 수 없게 잠근다', async () => {
    // 상한은 실패가 아니다 — 먼저 보낸 tx 가 뒤늦게 확정되면 보증금을 두 번 낸다
    const onPayDeposit = vi.fn(() =>
      Promise.resolve({ ok: false as const, code: 'CHAIN_TX_TIMEOUT' }),
    )
    renderDepositStep(onPayDeposit)

    await userEvent.click(screen.getAllByRole('button', { name: '보증금 납부하기' })[0])

    await screen.findByText(/다시 서명하면 보증금을 두 번 낼 수 있어/)
    for (const button of screen.getAllByRole('button', { name: '보증금 납부하기' })) {
      expect(button).toBeDisabled()
    }
    expect(onPayDeposit).toHaveBeenCalledTimes(1)
  })

  /**
   * performance_13 의 409 셋이 **코드로 갈렸다**(-151) — 규칙 미저장 `PERFORMANCE_RULES_REQUIRED`,
   * 잔액 부족 `WALLET_BALANCE_INSUFFICIENT`, 이미 납부 `COMMON_CONFLICT`.
   * 예전에는 셋이 한 코드라 화면이 자기 캐시 잔액으로 원인을 **추측**했고, 캐시가 서버 값보다
   * 낮으면 규칙 409 에도 충전 안내를 띄웠다. 아래가 그 추측이 사라졌음을 단언한다.
   */
  describe('prepare 409 는 code 로 갈린다', () => {
    function failWith(code: string, msg?: string) {
      return () => Promise.resolve({ ok: false as const, code, msg })
    }

    it('규칙 미저장이면 규칙 화면으로 보내고 충전 안내는 띄우지 않는다', async () => {
      renderForm({
        initialStep: SETUP_STEP_DEPOSIT,
        data: { ...data, status: 'PENDING_AGREEMENT' },
        wallet,
        // 잔액은 보증금보다 **적다**. 코드로 가르지 않으면 여기서 충전 안내가 뜬다
        deposit: { status: 'UNPAID', amount: 50_000, leaderBalance: 10_000 },
        onPayDeposit: failWith('PERFORMANCE_RULES_REQUIRED'),
      })

      await userEvent.click(screen.getAllByRole('button', { name: '보증금 납부하기' })[0])

      // 링크는 새로 만들지 않고 보증금 단계에 있던 것을 단언으로 바꾼다
      expect(await screen.findByText(/정산 규칙을 아직 저장하지 않아/)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '정산 규칙 화면으로' })).toHaveAttribute(
        'href',
        '/studio/performances/12/rules',
      )
      // 상단 실패 패널에 서버 `msg` 를 또 띄우지 않는다 — 잔액 부족과 같은 모양이다.
      // 같은 말이 두 자리에서 나면 사용자가 무엇을 고쳐야 하는지 흐려진다
      expect(screen.queryByText(/정산 규칙을 먼저 저장해야/)).toBeNull()
      expect(screen.queryByText(/모자라요/)).toBeNull()
      expect(screen.queryByText(/잔액이 부족해요/)).toBeNull()
    })

    it('잔액 부족이면 부족액을 담아 §5.16 안내를 띄운다', async () => {
      renderForm({
        initialStep: SETUP_STEP_DEPOSIT,
        data: { ...data, status: 'PENDING_AGREEMENT' },
        wallet,
        deposit: { status: 'UNPAID', amount: 50_000, leaderBalance: 38_000 },
        onPayDeposit: failWith('WALLET_BALANCE_INSUFFICIENT'),
      })

      await userEvent.click(screen.getAllByRole('button', { name: '보증금 납부하기' })[0])

      await screen.findByText('보증금 50,000 YoYo 중 12,000 YoYo가 모자라요')
      expect(screen.queryByText(/정산 규칙을 아직 저장하지 않아/)).toBeNull()
    })

    it('잔액을 몰라도 서버가 부족하다고 하면 안내는 띄우되 금액은 말하지 않는다', async () => {
      // wallet_01 미도착(§5.10 의 `—`). 부족액은 화면 계산이라 만들 수 없지만,
      // 계산이 안 된다고 서버가 확정한 판정을 삼키면 사용자는 이유 없이 막힌다
      renderForm({
        initialStep: SETUP_STEP_DEPOSIT,
        data: { ...data, status: 'PENDING_AGREEMENT' },
        wallet,
        deposit: { status: 'UNPAID', amount: 50_000 },
        onPayDeposit: failWith('WALLET_BALANCE_INSUFFICIENT'),
      })

      await userEvent.click(screen.getAllByRole('button', { name: '보증금 납부하기' })[0])

      await screen.findByText('보증금 50,000 YoYo를 내기에 잔액이 부족해요')
      expect(screen.queryByText(/모자라요/)).toBeNull()
    })

    it('캐시 잔액이 보증금보다 많아도 서버 판정을 뒤집지 않는다', async () => {
      // 화면 계산은 음수다. 예전 코드는 `short > 0` 이 아니라며 잔액 안내를 통째로 건너뛰었다
      renderForm({
        initialStep: SETUP_STEP_DEPOSIT,
        data: { ...data, status: 'PENDING_AGREEMENT' },
        wallet,
        deposit: { status: 'UNPAID', amount: 50_000, leaderBalance: 80_000 },
        onPayDeposit: failWith('WALLET_BALANCE_INSUFFICIENT'),
      })

      await userEvent.click(screen.getAllByRole('button', { name: '보증금 납부하기' })[0])

      await screen.findByText('보증금 50,000 YoYo를 내기에 잔액이 부족해요')
      // 금액을 못 믿는 판정이라 잔액도 말하지 않는다 — 같은 패널에서
      // "잔액이 부족해요" 와 "현재 잔액 80,000 YoYo" 이 서로를 부정하면 안 된다
      expect(screen.queryByText(/현재 잔액/)).toBeNull()
    })

    it('COMMON_CONFLICT 문구가 performance_14 의 다른 원인과 모순되지 않는다', async () => {
      // 한 번의 납부가 performance_13·14 를 함께 거치고 두 API 가 이 코드를 같이 쓴다.
      // 14 는 createShow 미확정·RLP 대상 불일치도 이 코드로 답하므로, 문구를 "이미 납부됨"
      // 으로 못박으면 아직 내지도 않은 보증금에 그 문장이 뜨거나 서버 msg 와 정면으로 어긋난다
      renderForm({
        initialStep: SETUP_STEP_DEPOSIT,
        data: { ...data, status: 'PENDING_AGREEMENT' },
        wallet,
        deposit: { status: 'UNPAID', amount: 50_000, leaderBalance: 80_000 },
        onPayDeposit: failWith(
          'COMMON_CONFLICT',
          '온체인 공연 등록이 끝나지 않았습니다. 보증금 납부를 다시 시작해 주세요',
        ),
      })

      await userEvent.click(screen.getAllByRole('button', { name: '보증금 납부하기' })[0])

      await screen.findByText(/온체인 공연 등록이 끝나지 않았습니다/)
      expect(screen.queryByText(/이미 납부/)).toBeNull()
    })

    it('prepare 를 건너뛴 404 는 공연이 없다고 말하지 않는다', async () => {
      // performance_14 가 발의 기록 없음을 404 로 막는다. 공통 표 문구
      // "요청한 정보를 찾을 수 없습니다."를 그대로 쓰면 공연 자체가 사라진 것처럼 읽힌다
      renderForm({
        initialStep: SETUP_STEP_DEPOSIT,
        data: { ...data, status: 'PENDING_AGREEMENT' },
        wallet,
        deposit: { status: 'UNPAID', amount: 50_000, leaderBalance: 80_000 },
        onPayDeposit: failWith(
          'COMMON_NOT_FOUND',
          '보증금 납부를 시작한 기록이 없습니다. 처음부터 다시 진행해 주세요',
        ),
      })

      await userEvent.click(screen.getAllByRole('button', { name: '보증금 납부하기' })[0])

      await screen.findByText(/보증금 납부를 처음부터 다시 시작해 주세요/)
      expect(screen.queryByText(/요청한 정보를 찾을 수 없습니다/)).toBeNull()
    })

    it('COMMON_CONFLICT 는 사유를 서버 msg 에 맡긴다', async () => {
      renderForm({
        initialStep: SETUP_STEP_DEPOSIT,
        data: { ...data, status: 'PENDING_AGREEMENT' },
        wallet,
        deposit: { status: 'UNPAID', amount: 50_000, leaderBalance: 10_000 },
        // 옛 서버가 규칙 미저장에도 이 코드를 보낸다. 그때도 막다른 곳이 아니다 —
        // 서버 `msg` 가 뒤에 붙고 규칙 링크는 이 단계에 그대로 있다
        onPayDeposit: failWith('COMMON_CONFLICT', '정산 규칙을 먼저 저장해야 합니다'),
      })

      await userEvent.click(screen.getAllByRole('button', { name: '보증금 납부하기' })[0])

      await screen.findByText(/지금은 보증금을 낼 수 없는 상태입니다.*정산 규칙을 먼저 저장해야/)
      // 잔액이 모자라도 이 코드로는 충전 안내를 띄우지 않는다 — 추측하던 자리다
      expect(screen.queryByText(/모자라요/)).toBeNull()
      expect(screen.queryByText(/잔액이 부족해요/)).toBeNull()
      expect(screen.getByRole('link', { name: '정산 규칙 화면으로' })).toBeInTheDocument()
    })
  })

  it('잔액을 모르면 409 를 잔액 부족으로 읽지 않는다', async () => {
    // performance_13 은 잔액 부족·규칙 미저장·이미 PAID 를 모두 `COMMON_CONFLICT` 로 쓴다.
    // `leaderBalance` 가 없는 순간(wallet_01 미도착) 예전 코드는 `?? 0` 으로 부족액을 보증금
    // 전액이라 계산해 충전 안내를 띄우고 서버 `msg` 를 묻었다. 서버는 잔액을 통과시킨 뒤에만
    // 다른 409 를 던지므로, 모를 때는 잔액 탓으로 돌리지 않는다.
    renderForm({
      initialStep: SETUP_STEP_DEPOSIT,
      data: { ...data, status: 'PENDING_AGREEMENT' },
      // 지갑은 연결됐지만 잔액은 아직이다 — `leaderBalance` 없음이 §5.10 의 `—` 상태다.
      // 납부 버튼은 잔액을 보지 않고 지갑 유무만 보므로(`payable`) 이 조합에서 눌린다
      wallet: { provider: 'WEB3AUTH', address: '0x' + '1'.repeat(40), status: 'LINKED' },
      deposit: { status: 'UNPAID', amount: 50_000 },
      onPayDeposit: () =>
        Promise.resolve({
          ok: false as const,
          code: 'COMMON_CONFLICT',
          msg: '정산 규칙을 먼저 저장해야 보증금을 낼 수 있습니다',
        }),
    })

    await userEvent.click(screen.getAllByRole('button', { name: '보증금 납부하기' })[0])

    // 서버 문구가 그대로 보이고, 충전 안내(§5.16)는 뜨지 않는다
    await screen.findByText(/정산 규칙을 먼저 저장해야/)
    expect(screen.queryByText(/이 모자라요/)).toBeNull()
  })

  it('핸들러가 던져도 진행 표시에 갇히지 않는다', async () => {
    const onPayDeposit = vi.fn(() => Promise.reject(new Error('boom')))
    renderDepositStep(onPayDeposit)

    await userEvent.click(screen.getAllByRole('button', { name: '보증금 납부하기' })[0])

    // 초기 상태로 돌아온다 — 아무 tx 도 나가지 않았다
    await screen.findAllByRole('button', { name: '보증금 납부하기' })
    expect(screen.queryByText(/준비 중/)).toBeNull()

    // 즉시 실패는 연타가 되므로 잠깐 잠긴다(D-64). 잠금은 **잠깐**이어야 한다 —
    // 영구 비활성이면 진행 표시에 갇힌 것과 다를 바 없이 다시 시도할 길이 막힌다
    await waitFor(
      () => expect(screen.getAllByRole('button', { name: '보증금 납부하기' })[0]).toBeEnabled(),
      { timeout: 3_000 },
    )
  })
})
