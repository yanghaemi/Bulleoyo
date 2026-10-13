import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import i18n from '@/shared/i18n'

import { SettlementRules, type RuleScreenData } from './SettlementRules'

/**
 * 9/26 P-05 UX(화면설계 v8.10 / v7.15) — 도움말 `?` 모달 · 드래그 막대 · 보조 % 입력.
 * 서버에 보내는 값은 이전과 같은 bp 정수여야 한다(API rule_01 무변경).
 */

beforeEach(async () => {
  await i18n.changeLanguage('ko')
})

// jsdom 에 PointerEvent 가 없으면 fireEvent.pointer* 가 clientX 없는 Event 를 만든다.
// MouseEvent 위에 pointerId 만 얹은 최소 polyfill — 이 파일 안에서만 쓴다.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number
    pointerType: string
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
      this.pointerType = init.pointerType ?? 'mouse'
    }
  }
  Object.defineProperty(window, 'PointerEvent', {
    configurable: true,
    value: PointerEventPolyfill,
  })
}

const base: RuleScreenData = {
  performanceId: 12,
  performanceStatus: 'PENDING_AGREEMENT',
  depositStatus: 'PAID',
  jointPerformance: true,
  locked: false,
  participants: [
    { teamId: 7, teamName: '블루노트', host: true },
    { teamId: 9, teamName: '새벽세시', host: false },
    { teamId: 11, teamName: '한밤', host: false },
  ],
  rule: {
    fixedRatioBp: 6000,
    selectionRatioBp: 4000,
    teamShares: [
      { teamId: 7, shareBp: 3334 },
      { teamId: 9, shareBp: 3333 },
      { teamId: 11, shareBp: 3333 },
    ],
  },
  agreedCount: 0,
  assumedRevenueAmount: 1_000_000,
}

function renderRules(
  data: RuleScreenData = base,
  onSave = vi.fn().mockResolvedValue({ ok: true }),
) {
  render(
    <MemoryRouter>
      <SettlementRules title="합동공연" data={data} onSave={onSave} />
    </MemoryRouter>,
  )
  return onSave
}

async function save() {
  await userEvent.click(screen.getAllByRole('button', { name: /규칙 저장/ })[0])
}

/** jsdom 은 레이아웃이 없다 — 막대 폭을 1000px 로 가정한다 */
function mockTrackWidth(testId: string) {
  const track = screen.getByTestId(`${testId}-track`)
  vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 1000,
    bottom: 44,
    width: 1000,
    height: 44,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  return track
}

describe('P-05 도움말 모달', () => {
  it.each([
    ['고정 분배 설명', '고정 분배란?'],
    ['관객 선택 설명', '관객 선택이란?'],
    ['팀별 고정 분배 비율 설명', '팀별 고정 분배 비율이란?'],
  ])(
    '%s 버튼이 예시 모달을 열고 Esc 로 닫으면 버튼으로 포커스가 돌아온다',
    async (label, title) => {
      const user = userEvent.setup()
      renderRules()
      const button = screen.getByRole('button', { name: label })
      await user.click(button)

      const dialog = screen.getByRole('dialog', { name: title })
      // 단계별 계산 — 고정 몫 → 선택 몫 → 합계(원 단위 버림·dust 는 공연 만든 팀)
      expect(within(dialog).getByTestId('rule-help-step-1')).toHaveTextContent('600,000 YoYo')
      expect(within(dialog).getByTestId('rule-help-step-1')).toHaveTextContent('400,000 YoYo')
      expect(within(dialog).getByTestId('rule-help-step-2')).toHaveTextContent('300,000 YoYo')
      expect(within(dialog).getByTestId('rule-help-step-3')).toHaveTextContent('280,000 YoYo')
      expect(within(dialog).getByTestId('rule-help-step-3')).toHaveTextContent('120,000 YoYo')
      expect(within(dialog).getByTestId('rule-help-step-4')).toHaveTextContent(
        'A 580,000 YoYo · B 420,000 YoYo',
      )
      expect(within(dialog).getByTestId('rule-help-dust')).toHaveTextContent('580,001 YoYo')
      expect(within(dialog).getByTestId('rule-help-animation')).toHaveAttribute('aria-hidden')

      await user.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(button).toHaveFocus()
    },
  )

  it('바깥(배경)을 누르면 닫힌다', async () => {
    const user = userEvent.setup()
    renderRules()
    await user.click(screen.getByRole('button', { name: '고정 분배 설명' }))
    await user.click(screen.getByRole('button', { name: '모달 닫기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('P-05 1단계 드래그 막대', () => {
  it('손잡이가 slider 속성을 갖고 화살표·Shift·Home/End 가 bp 로 저장된다', async () => {
    const onSave = renderRules()
    const slider = screen.getByRole('slider', { name: '고정 분배 · 관객 선택 비율' })
    expect(slider).toHaveAttribute('aria-valuemin', '0')
    expect(slider).toHaveAttribute('aria-valuemax', '100')
    expect(slider).toHaveAttribute('aria-valuenow', '60')
    expect(slider).toHaveAttribute('aria-valuetext', '고정 분배 60%, 관객 선택 40%')

    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(screen.getByLabelText('고정 분배')).toHaveValue('61')
    expect(screen.getByLabelText('관객 선택')).toHaveValue('39')
    fireEvent.keyDown(slider, { key: 'ArrowLeft', shiftKey: true })
    expect(screen.getByLabelText('고정 분배')).toHaveValue('51')
    fireEvent.keyDown(slider, { key: 'End' })
    expect(slider).toHaveAttribute('aria-valuenow', '100')
    fireEvent.keyDown(slider, { key: 'Home' })
    expect(screen.getByLabelText('관객 선택')).toHaveValue('100')
    fireEvent.keyDown(slider, { key: 'ArrowRight', shiftKey: true })
    fireEvent.keyDown(slider, { key: 'ArrowRight', shiftKey: true })
    fireEvent.keyDown(slider, { key: 'ArrowRight', shiftKey: true })
    fireEvent.keyDown(slider, { key: 'ArrowRight' })

    await save()
    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      fixedRatioBp: 3100,
      selectionRatioBp: 6900,
      teamShares: [
        { teamId: 7, shareBp: 3334 },
        { teamId: 9, shareBp: 3333 },
        { teamId: 11, shareBp: 3333 },
      ],
    })
  })

  it('포인터 드래그가 1% 단위로 스냅해 bp 로 저장된다', async () => {
    const onSave = renderRules()
    const track = mockTrackWidth('rule-stage1-bar')
    const handle = screen.getByRole('slider', { name: '고정 분배 · 관객 선택 비율' })

    fireEvent.pointerDown(handle, { clientX: 600, pointerId: 1, button: 0 })
    fireEvent.pointerMove(track, { clientX: 734, pointerId: 1 })
    fireEvent.pointerUp(track, { clientX: 734, pointerId: 1 })
    // 드래그가 끝난 뒤 움직임은 무시한다
    fireEvent.pointerMove(track, { clientX: 100, pointerId: 1 })

    expect(screen.getByLabelText('고정 분배')).toHaveValue('73')
    await save()
    expect(onSave.mock.calls[0][0]).toMatchObject({ fixedRatioBp: 7300, selectionRatioBp: 2700 })
  })

  it('보조 % 입력은 1bp 까지 정밀 입력을 받는다', async () => {
    const onSave = renderRules()
    fireEvent.change(screen.getByLabelText('고정 분배'), { target: { value: '33.35' } })
    expect(screen.getByLabelText('관객 선택')).toHaveValue('66.65')
    expect(screen.getByRole('slider', { name: '고정 분배 · 관객 선택 비율' })).toHaveAttribute(
      'aria-valuenow',
      '33.35',
    )
    await save()
    expect(onSave.mock.calls[0][0]).toMatchObject({ fixedRatioBp: 3335, selectionRatioBp: 6665 })
  })
})

describe('P-05 2단계 팀 경계 막대', () => {
  it('팀 수 − 1 개의 경계 손잡이를 그린다', () => {
    renderRules()
    const handles = screen.getAllByRole('slider', { name: /경계/ })
    expect(handles).toHaveLength(2)
    expect(handles[0]).toHaveAccessibleName('블루노트 · 새벽세시 경계')
    expect(handles[0]).toHaveAttribute('aria-valuetext', '블루노트 33.34%, 새벽세시 33.33%')
    // 이웃 손잡이를 넘지 못한다
    expect(handles[1]).toHaveAttribute('aria-valuemin', '33.34')
  })

  it('경계를 끌면 양옆 두 팀만 바뀌고 합 10000 bp 로 저장된다', async () => {
    const onSave = renderRules()
    const track = mockTrackWidth('rule-stage2-bar')
    const [first] = screen.getAllByRole('slider', { name: /경계/ })

    fireEvent.pointerDown(first, { clientX: 333, pointerId: 2, button: 0 })
    fireEvent.pointerMove(track, { clientX: 502, pointerId: 2 })
    fireEvent.pointerUp(track, { pointerId: 2 })

    expect(screen.getByRole('textbox', { name: /블루노트/ })).toHaveValue('50')
    expect(screen.getByRole('textbox', { name: '새벽세시' })).toHaveValue('16.67')
    expect(screen.getByRole('textbox', { name: '한밤' })).toHaveValue('33.33')
    await save()
    expect(onSave.mock.calls[0][0].teamShares).toEqual([
      { teamId: 7, shareBp: 5000 },
      { teamId: 9, shareBp: 1667 },
      { teamId: 11, shareBp: 3333 },
    ])
  })

  it('막대 빈 곳을 누르면 가까운 손잡이가 온다 · 키보드도 같은 규칙', async () => {
    const onSave = renderRules()
    const track = mockTrackWidth('rule-stage2-bar')
    fireEvent.pointerDown(track, { clientX: 900, pointerId: 3, button: 0 })
    fireEvent.pointerUp(track, { pointerId: 3 })
    expect(screen.getByRole('textbox', { name: '한밤' })).toHaveValue('10')

    const [, second] = screen.getAllByRole('slider', { name: /경계/ })
    fireEvent.keyDown(second, { key: 'ArrowLeft' })
    expect(screen.getByRole('textbox', { name: '한밤' })).toHaveValue('11')
    await save()
    expect(onSave.mock.calls[0][0].teamShares).toEqual([
      { teamId: 7, shareBp: 3334 },
      { teamId: 9, shareBp: 5566 },
      { teamId: 11, shareBp: 1100 },
    ])
  })

  it('합이 틀린 초안도 드래그하면 마지막 팀이 나머지를 가져 저장 가능해진다', () => {
    renderRules()
    fireEvent.change(screen.getByRole('textbox', { name: '한밤' }), { target: { value: '10' } })
    const saveButtons = () => screen.getAllByRole('button', { name: /규칙 저장/ })
    expect(saveButtons().every((b) => (b as HTMLButtonElement).disabled)).toBe(true)

    const [first] = screen.getAllByRole('slider', { name: /경계/ })
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(screen.getByRole('textbox', { name: '한밤' })).toHaveValue('33.33')
    expect(saveButtons().some((b) => !(b as HTMLButtonElement).disabled)).toBe(true)
  })
})

describe('P-05 잠긴 규칙', () => {
  it('손잡이 없이 읽기 전용 막대만 그리고 도움말은 열 수 있다', async () => {
    renderRules({ ...base, locked: true })
    expect(screen.queryAllByRole('slider')).toHaveLength(0)
    expect(screen.getByRole('img', { name: '고정 분배 60% · 관객 선택 40%' })).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: '블루노트 33.34% · 새벽세시 33.33% · 한밤 33.33%' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('고정 분배')).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '고정 분배 설명' }))
    expect(screen.getByRole('dialog', { name: '고정 분배란?' })).toBeInTheDocument()
  })
})
