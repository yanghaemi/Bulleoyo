import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import i18n from '@/shared/i18n'

beforeEach(async () => {
  await i18n.changeLanguage('ko')
})

import { SettlementRules, type RuleScreenData } from './SettlementRules'

const data: RuleScreenData = {
  performanceId: 12,
  performanceStatus: 'PENDING_AGREEMENT',
  depositStatus: 'PAID',
  jointPerformance: true,
  locked: false,
  participants: [
    { teamId: 7, teamName: '블루노트', host: true },
    { teamId: 9, teamName: '새벽세시', host: false },
  ],
  rule: {
    fixedRatioBp: 6000,
    selectionRatioBp: 4000,
    teamShares: [
      { teamId: 7, shareBp: 6000 },
      { teamId: 9, shareBp: 4000 },
    ],
  },
  agreedCount: 0,
  assumedRevenueAmount: 1_000_000,
}

describe('SettlementRules mobile simulation', () => {
  it('connects the toggle to the simulation disclosure', async () => {
    const user = userEvent.setup()
    render(<SettlementRules title="합동공연" data={data} />)

    const trigger = screen.getByRole('button', { name: /시뮬레이션 결과 보기/ })
    expect(trigger).toHaveAttribute('aria-controls', 'settlement-simulation')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(document.querySelector('#settlement-simulation')).toBeInTheDocument()
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('preserves reciprocal bp autofill, exact payouts, and the save payload', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true })
    render(
      <MemoryRouter>
        <SettlementRules title="합동공연" data={data} onSave={onSave} />
      </MemoryRouter>,
    )
    const fixed = screen.getByLabelText('고정 분배')
    const selection = screen.getByLabelText('관객 선택')
    fireEvent.change(fixed, { target: { value: '35' } })
    expect(selection).toHaveValue('65')
    expect(screen.getByTestId('fixed-light')).toHaveStyle({ '--light-ratio': '0.35' })
    const blueRow = screen.getByRole('row', { name: /블루노트/ })
    expect(
      within(blueRow)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['210,000 YoYo', '325,000 YoYo', '—', '535,000 YoYo'])
    fireEvent.change(selection, { target: { value: '50' } })
    expect(fixed).toHaveValue('50')
    await userEvent.click(screen.getAllByRole('button', { name: /규칙 저장/ })[0])
    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      fixedRatioBp: 5000,
      selectionRatioBp: 5000,
      teamShares: [
        { teamId: 7, shareBp: 6000 },
        { teamId: 9, shareBp: 4000 },
      ],
    })
    expect(await screen.findByText('정산 규칙을 저장했습니다')).toBeInTheDocument()
  })

  it('preserves team remainder autofill and prevents invalid draft saves while holding the lights', () => {
    render(<SettlementRules title="합동공연" data={data} />)
    fireEvent.change(screen.getByRole('textbox', { name: /블루노트/ }), { target: { value: '70' } })
    fireEvent.click(screen.getByRole('button', { name: '잔여 자동 배분' }))
    expect(screen.getByLabelText('새벽세시')).toHaveValue('30')
    fireEvent.change(screen.getByLabelText('고정 분배'), { target: { value: '' } })
    expect(screen.getByTestId('fixed-light')).toHaveStyle({ '--light-ratio': '0.6' })
    expect(
      screen
        .getAllByRole('button', { name: /규칙 저장/ })
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true)
    fireEvent.change(screen.getByLabelText('고정 분배'), { target: { value: '10001' } })
    expect(screen.getByTestId('fixed-light')).toHaveStyle({ '--light-ratio': '0.6' })
    expect(screen.getByText(/마지막 유효 비율/)).toBeInTheDocument()
  })

  it('marks blank and overflowing drafts as stale even when the other input is 10000', () => {
    render(<SettlementRules title="합동공연" data={data} />)
    const fixed = screen.getByLabelText('고정 분배')
    fireEvent.change(fixed, { target: { value: '0' } })
    for (const value of ['', '10001']) {
      fireEvent.change(fixed, { target: { value } })
      expect(screen.getByText(/마지막 유효 비율/)).toBeInTheDocument()
      expect(screen.getByTestId('selection-light')).toHaveStyle({ '--light-ratio': '1' })
    }
  })

  it('keeps server sum errors and resets their stale-light indication on valid editing', async () => {
    const onSave = vi
      .fn()
      .mockResolvedValue({ ok: false, code: 'RULE_RATIO_SUM_INVALID', msg: '서버 합계 확인' })
    render(<SettlementRules title="합동공연" data={data} onSave={onSave} />)
    await userEvent.click(screen.getAllByRole('button', { name: /규칙 저장/ })[0])
    expect(await screen.findByText(/서버 합계 확인/)).toBeInTheDocument()
    expect(screen.getByLabelText('고정 분배')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/마지막 유효 비율/)).toBeInTheDocument()
    expect(screen.getByTestId('fixed-light')).toHaveStyle({ '--light-ratio': '0.6' })
    fireEvent.change(screen.getByLabelText('고정 분배'), { target: { value: '35' } })
    expect(screen.queryByText(/마지막 유효 비율/)).not.toBeInTheDocument()
    expect(screen.getByTestId('selection-light')).toHaveStyle({ '--light-ratio': '0.65' })
  })

  it('retains the existing confirmation requirement before resetting team agreements', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue({ ok: true })
    render(
      <MemoryRouter>
        <SettlementRules title="합동공연" data={{ ...data, agreedCount: 1 }} onSave={onSave} />
      </MemoryRouter>,
    )
    await user.click(screen.getAllByRole('button', { name: /규칙 저장/ })[0])
    expect(screen.getByRole('alertdialog')).toHaveTextContent('이미 받은 팀 동의 1건이 모두 초기화')
    expect(onSave).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(onSave).not.toHaveBeenCalled()
    await user.click(screen.getAllByRole('button', { name: /규칙 저장/ })[0])
    await user.click(screen.getByRole('button', { name: '저장하고 동의 초기화' }))
    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      fixedRatioBp: 6000,
      selectionRatioBp: 4000,
      teamShares: [
        { teamId: 7, shareBp: 6000 },
        { teamId: 9, shareBp: 4000 },
      ],
    })
  })
})

/**
 * P-05 다음은 **언제나 규칙 동의(P-06)** 다 — 보증금 여부로 갈리지 않는다(팀 결정 2026-09-21).
 *
 * 동의(rule_03)는 보증금을 선행 조건으로 보지 않고, 판매 시작만이 `DepositRequired` ·
 * `NotAllAgreed` 둘 다를 요구한다. 그래서 보증금은 준비의 마지막 단계다. 예전에는 미납이면
 * P-03 보증금 단계로 보냈는데, 그러면 리더가 동의도 받기 전에 보증금부터 내러 간다.
 */
describe('규칙 저장 뒤 돌아가는 길', () => {
  function Landed({ where }: { where: string }) {
    const step = (useLocation().state as { step?: number } | null)?.step
    return (
      <p>
        도착 {where} / 단계 {String(step)}
      </p>
    )
  }

  function renderSaved(depositStatus: 'UNPAID' | 'PAID') {
    return render(
      <MemoryRouter initialEntries={['/studio/performances/12/rules']}>
        <Routes>
          <Route
            path="/studio/performances/12/rules"
            element={
              <SettlementRules
                title="합동공연"
                data={{ ...data, depositStatus }}
                onSave={vi.fn().mockResolvedValue({ ok: true })}
              />
            }
          />
          <Route path="/studio/performances/12/agreements" element={<Landed where="동의" />} />
          <Route path="/studio/performances/12/edit" element={<Landed where="편집" />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('보증금이 미납이어도 저장 성공 링크는 규칙 동의(P-06)로 보낸다', async () => {
    const user = userEvent.setup()
    renderSaved('UNPAID')

    await user.click(screen.getAllByRole('button', { name: /규칙 저장/ })[0])
    const dialog = await screen.findByRole('dialog', { name: '정산 규칙을 저장했어요' })
    await user.click(within(dialog).getByRole('link', { name: '규칙 동의 받으러 가기' }))

    expect(screen.getByText(/도착 동의/)).toBeInTheDocument()
  })

  it('보증금을 이미 냈어도 같은 곳으로 보낸다 — 다음 행동이 갈리지 않는다', async () => {
    const user = userEvent.setup()
    renderSaved('PAID')

    await user.click(screen.getAllByRole('button', { name: /규칙 저장/ })[0])
    const dialog = await screen.findByRole('dialog', { name: '정산 규칙을 저장했어요' })
    await user.click(within(dialog).getByRole('link', { name: '규칙 동의 받으러 가기' }))

    expect(screen.getByText(/도착 동의/)).toBeInTheDocument()
  })
})

/**
 * 9/24 — 저장 성공은 확인 모달로 알린다. 인라인 안내만으로는 무엇이 됐는지 헷갈렸다.
 */
describe('규칙 저장 성공 모달', () => {
  it('저장 성공 시 제목·본문·주 버튼 링크를 가진 모달이 뜬다', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <SettlementRules
          title="합동공연"
          data={data}
          onSave={vi.fn().mockResolvedValue({ ok: true })}
        />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(screen.getAllByRole('button', { name: /규칙 저장/ })[0])

    const dialog = await screen.findByRole('dialog', { name: '정산 규칙을 저장했어요' })
    expect(dialog).toHaveAccessibleDescription(
      '참여팀 모두 규칙에 동의해야 판매를 시작할 수 있어요.',
    )
    expect(within(dialog).getByRole('link', { name: '규칙 동의 받으러 가기' })).toHaveAttribute(
      'href',
      '/studio/performances/12/agreements',
    )
  })

  it('닫기는 화면에 머물고 인라인 안내는 남는다 · Esc로도 닫힌다', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <SettlementRules
          title="합동공연"
          data={data}
          onSave={vi.fn().mockResolvedValue({ ok: true })}
        />
      </MemoryRouter>,
    )

    await user.click(screen.getAllByRole('button', { name: /규칙 저장/ })[0])
    const dialog = await screen.findByRole('dialog')
    // × 아이콘과 보조 버튼이 둘 다 "닫기"다 — 보조 버튼(본문 안 마지막 줄)을 누른다
    const closers = within(dialog).getAllByRole('button', { name: '닫기' })
    await user.click(closers[closers.length - 1])

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('정산 규칙을 저장했습니다')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: /규칙 저장/ })[0])
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('저장 실패면 모달을 띄우지 않고 기존 실패 안내를 쓴다', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <SettlementRules
          title="합동공연"
          data={data}
          onSave={vi.fn().mockResolvedValue({ ok: false, code: 'RULE_RATIO_SUM_INVALID' })}
        />
      </MemoryRouter>,
    )

    await user.click(screen.getAllByRole('button', { name: /규칙 저장/ })[0])

    expect(await screen.findByText('규칙을 저장하지 못했습니다')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
