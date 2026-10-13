import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

import i18n from '@/shared/i18n'

import { RuleAgreements, type AgreeSignStage, type AgreementScreenData } from './RuleAgreements'

/**
 * 즉시 실패는 연타가 된다.
 *
 * 동의 버튼에는 `disabled={!canAgree || busy}`가 있지만 `busy`는 서명이 **진행 중**일 때만 선다.
 * 지갑이 시작도 못 하고 바로 던지면(리허설 2 D-64 — `getAddress()`가 즉시 null) `stage`가 그
 * 자리에서 `idle`로 돌아와 버튼이 다시 살아난다. 리허설에서 5초에 21번 눌려 prepare가 그만큼
 * 서버로 나갔다. 잠금은 **잠깐**이어야 한다 — 영구 비활성이면 다시 시도할 길이 막힌다.
 */
const data: AgreementScreenData = {
  performanceId: 12,
  performanceStatus: 'DRAFT',
  depositStatus: 'PAID',
  locked: false,
  rulesHash: '0x' + 'ab'.repeat(32),
  rule: { fixedRatioBp: 7000, selectionRatioBp: 3000, teamShares: [{ teamId: 1, shareBp: 10000 }] },
  agreements: [{ teamId: 1, teamName: '팀', status: 'PENDING' }],
  myAgreement: { teamId: 1, status: 'PENDING', nextAction: 'SIGN' },
  startSaleAvailable: false,
  isOwner: false,
}

/** §5.19로 액션이 데스크톱·모바일 두 곳에 그려진다 — 같은 버튼이 둘이다 */
function agreeButtons() {
  return screen.getAllByRole('button', { name: '우리 팀 동의하기' })
}

describe('RuleAgreements 동의 버튼 연타', () => {
  // 버튼 문구를 이름으로 찾는다 — 화면이 `useLocale`을 쓰므로 언어를 먼저 정해 둔다
  beforeEach(async () => {
    await i18n.changeLanguage('ko')
  })

  it('즉시 실패한 뒤 잠깐은 다시 눌리지 않고, 곧 다시 눌린다', async () => {
    const user = userEvent.setup()
    // 지갑이 서명을 시작하지도 못한 경우 — `report`가 한 번도 불리지 않아 `busy`가 설 틈이 없다
    const onAgree = vi.fn(() => Promise.resolve({ ok: false, code: 'RULE_HASH_MISMATCH' }))
    render(
      <MemoryRouter>
        <RuleAgreements title="공연" data={data} onAgree={onAgree} />
      </MemoryRouter>,
    )

    await user.click(agreeButtons()[0])

    await screen.findByRole('alert')
    for (const button of agreeButtons()) expect(button).toBeDisabled()

    // 잠긴 동안의 클릭은 요청을 만들지 않는다
    await user.click(agreeButtons()[0])
    expect(onAgree).toHaveBeenCalledTimes(1)

    await waitFor(() => expect(agreeButtons()[0]).toBeEnabled(), { timeout: 3_000 })
  })

  it('첫 응답 전에도 연타가 요청을 늘리지 않는다', async () => {
    // 잠금은 **실패한 뒤**에 선다. prepare 왕복과 지갑 응답을 기다리는 첫 구간은 아직
    // 실패하지 않아 `retryLocked`가 false다 — 그 사이가 비어 있으면 5초에 21번이 그대로 난다.
    const user = userEvent.setup()
    let settle = (_: { ok: boolean }) => {}
    const onAgree = vi.fn(
      () =>
        new Promise<{ ok: boolean }>((resolve) => {
          settle = resolve
        }),
    )
    render(
      <MemoryRouter>
        <RuleAgreements title="공연" data={data} onAgree={onAgree} />
      </MemoryRouter>,
    )

    await user.click(agreeButtons()[0])
    // 응답 전이라 버튼 자리는 진행 표시가 차지한다 — 누를 것이 없다
    expect(screen.queryAllByRole('button', { name: '우리 팀 동의하기' })).toHaveLength(0)

    settle({ ok: true })
    await waitFor(() => expect(onAgree).toHaveBeenCalledTimes(1))
  })

  it('서명을 거부하면 잠그지 않고 바로 다시 누를 수 있다', async () => {
    // 스스로 닫은 팝업이다. 서버로 나간 요청도 이미 끝났으니 기다리게 할 이유가 없다.
    const user = userEvent.setup()
    const onAgree = vi.fn(() => Promise.resolve({ ok: false, code: 'PAYMENT_SIGNATURE_REJECTED' }))
    render(
      <MemoryRouter>
        <RuleAgreements title="공연" data={data} onAgree={onAgree} />
      </MemoryRouter>,
    )

    await user.click(agreeButtons()[0])

    await waitFor(() => expect(agreeButtons()[0]).toBeEnabled())
    await user.click(agreeButtons()[0])
    expect(onAgree).toHaveBeenCalledTimes(2)
  })

  it('잠긴 채 다시 실패하면 잠금은 마지막 실패부터 다시 센다', async () => {
    // 앞 타이머를 끊지 않으면 첫 실패의 타이머가 먼저 깨어나 두 번째 잠금을 일찍 푼다(6ff9629).
    // 버튼은 잠긴 동안 눌리지 않으므로, 핸들러가 `report`로 idle을 알려 요청 둘을 겹쳐 띄운다
    vi.useFakeTimers()
    try {
      const pending: ((result: { ok: boolean; code?: string }) => void)[] = []
      const onAgree = vi.fn(
        (report: (next: AgreeSignStage) => void) =>
          new Promise<{ ok: boolean; code?: string }>((resolve) => {
            report({ kind: 'idle' })
            pending.push(resolve)
          }),
      )
      render(
        <MemoryRouter>
          <RuleAgreements title="공연" data={data} onAgree={onAgree} />
        </MemoryRouter>,
      )
      const settle = async (index: number) => {
        pending[index]({ ok: false, code: 'RULE_HASH_MISMATCH' })
        await act(() => vi.advanceTimersByTimeAsync(0))
      }
      const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

      fireEvent.click(agreeButtons()[0])
      fireEvent.click(agreeButtons()[0])
      expect(onAgree).toHaveBeenCalledTimes(2)

      await settle(0) // 첫 실패 — 잠금, 해제 예정 1200
      for (const button of agreeButtons()) expect(button).toBeDisabled()
      await advance(600)
      await settle(1) // 두 번째 실패 — 해제 예정이 1800으로 밀린다

      await advance(600) // 첫 타이머의 시각
      for (const button of agreeButtons()) expect(button).toBeDisabled()
      await advance(599)
      for (const button of agreeButtons()) expect(button).toBeDisabled()
      await advance(1)
      for (const button of agreeButtons()) expect(button).toBeEnabled()
    } finally {
      vi.useRealTimers()
    }
  })
})
