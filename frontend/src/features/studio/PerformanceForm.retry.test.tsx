import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import i18n from '@/shared/i18n'

import {
  PerformanceForm,
  type DepositPayResult,
  type DepositSignStage,
  type PerformanceEditData,
} from './PerformanceForm'
import { SETUP_STEP_DEPOSIT } from './setupSteps'

/**
 * P-03 보증금 납부 버튼의 연타 잠금 — `RuleAgreements.retry.test.tsx`와 같은 판정이다.
 *
 * 잠긴 채 다시 실패하면 앞 해제 타이머를 끊고 새로 건다(6ff9629). 끊지 않으면 첫 실패의
 * 타이머가 먼저 깨어나 두 번째 잠금을 일찍 푼다.
 */
const data: PerformanceEditData = {
  performanceId: 12,
  title: '로컬 테스트 공연',
  venueName: '롤링홀',
  venueAddress: '서울시 마포구 어울마당로 35',
  startAt: '2030-09-22T19:00:00+09:00',
  endAt: '2030-09-22T21:00:00+09:00',
  status: 'PENDING_AGREEMENT',
  ticketTypes: [{ key: 't1', ticketTypeId: 1, name: '일반', price: '25000', totalQuantity: '50' }],
}

const wallet = {
  provider: 'WEB3AUTH' as const,
  address: '0x' + '1'.repeat(40),
  status: 'LINKED' as const,
  balanceAmount: 100_000,
}

function payButtons() {
  return screen.getAllByRole('button', { name: '보증금 납부하기' })
}

beforeEach(async () => {
  await i18n.changeLanguage('ko')
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

it('잠긴 채 다시 실패하면 잠금은 마지막 실패부터 다시 센다', async () => {
  // 버튼은 잠긴 동안 눌리지 않으므로, 핸들러가 `report`로 idle을 알려 요청 둘을 겹쳐 띄운다
  const pending: ((result: DepositPayResult) => void)[] = []
  const onPayDeposit = vi.fn(
    (report: (stage: DepositSignStage) => void) =>
      new Promise<DepositPayResult>((resolve) => {
        report({ kind: 'idle' })
        pending.push(resolve)
      }),
  )
  render(
    <MemoryRouter>
      <PerformanceForm
        mode="edit"
        data={data}
        teams={[{ teamId: 1, teamName: '팀' }]}
        initialStep={SETUP_STEP_DEPOSIT}
        wallet={wallet}
        deposit={{ status: 'UNPAID', amount: 50_000, leaderBalance: 100_000, sufficient: true }}
        onPayDeposit={onPayDeposit}
      />
    </MemoryRouter>,
  )
  const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
  const fail = async (index: number) => {
    pending[index]({ ok: false, code: 'COMMON_CONFLICT' })
    await advance(0)
  }

  fireEvent.click(payButtons()[0])
  await advance(0)
  fireEvent.click(payButtons()[0])
  await advance(0)
  expect(onPayDeposit).toHaveBeenCalledTimes(2)

  await fail(0) // 첫 실패 — 잠금, 해제 예정 1200
  for (const button of payButtons()) expect(button).toBeDisabled()
  await advance(600)
  await fail(1) // 두 번째 실패 — 해제 예정이 1800으로 밀린다

  await advance(600) // 첫 타이머의 시각
  for (const button of payButtons()) expect(button).toBeDisabled()
  await advance(599)
  for (const button of payButtons()) expect(button).toBeDisabled()
  await advance(1)
  for (const button of payButtons()) expect(button).toBeEnabled()
})
