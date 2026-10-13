import { fireEvent, render, screen, within } from '@testing-library/react'
import fixture from '@/shared/api/__fixtures__/verify_01.json'
import { toVerificationData } from '@/shared/api/domains/verify'
import type { ApiData } from '@/shared/api/schema'
import i18n from '@/shared/i18n'
import { buildVerificationInvariantRows } from './invariants'
import { SettlementVerification } from './SettlementVerification'

function response(): ApiData<'verify_01'> {
  return structuredClone(fixture.data) as ApiData<'verify_01'>
}

beforeEach(async () => {
  await i18n.changeLanguage('ko')
})

it('keeps an unperformed release unassessed, without fabricated zero amounts', () => {
  const raw = response()
  raw.settlementStatus = 'LOCKED'
  raw.releaseReconciliation = { recalculatedTotal: 60000, releasedEvents: [] }
  raw.releaseTx = undefined
  const data = toVerificationData(raw)
  expect(data.releaseReconciliation).toMatchObject({
    releasedEventTotal: null,
    difference: null,
    matched: null,
  })
  expect(buildVerificationInvariantRows(data)[2]).toMatchObject({
    state: 'unknown',
    expected: 60000,
    actual: undefined,
    diff: undefined,
  })
  render(<SettlementVerification data={data} />)
  const panel = screen.getByRole('region', { name: 'release tx·Released 이벤트' })
  expect(panel).not.toHaveTextContent('불일치')
  expect(panel).not.toHaveTextContent(/(^|[^\d,])0 YoYo/)
})

it('does not turn unread agreements or counters into false and zero', () => {
  const raw = response()
  raw.agreements = [{ teamId: 730 }]
  raw.onchainCounters = raw.onchainCounters?.map((counter) => ({
    ...counter,
    choiceCount: undefined,
  }))
  const data = toVerificationData(raw)
  expect(data.agreements[0].onchainAgreed).toBeNull()
  expect(data.onchainCounters[0].choiceCount).toBeNull()
  render(<SettlementVerification data={data} />)
  expect(screen.getByRole('region', { name: '온체인 선택 카운터' })).toHaveTextContent('—')
  expect(
    within(screen.getByRole('region', { name: '재계산' })).getByRole('button', { name: '계산' }),
  ).toBeDisabled()
})

it('keeps a genuine released zero-value reconciliation assessable', () => {
  const raw = response()
  raw.releaseReconciliation = {
    releasedEventTotal: 0,
    recalculatedTotal: 0,
    difference: 0,
    matched: true,
  }
  expect(buildVerificationInvariantRows(toVerificationData(raw))[2]).toMatchObject({
    state: 'matched',
    expected: 0,
    actual: 0,
    diff: 0,
  })
})

it('does not fabricate a released sum when escrow reconciliation cannot read payouts', () => {
  const raw = response()
  raw.escrowReconciliation = { purchasedTotal: 60000, refundedTotal: 0, escrowBalanceOnchain: 0 }
  const data = toVerificationData(raw)
  expect(data.escrowReconciliation.releasedTotal).toBeNull()
  expect(buildVerificationInvariantRows(data)[1]).toMatchObject({
    state: 'unknown',
    diff: undefined,
  })
})

it('drops old calculation inputs when refreshed counters become unknown', () => {
  const raw = response()
  const { rerender } = render(<SettlementVerification data={toVerificationData(raw)} />)
  const calculate = () =>
    within(screen.getByRole('region', { name: '재계산' })).getByRole('button', { name: '계산' })
  expect(calculate()).toBeEnabled()
  raw.onchainCounters = raw.onchainCounters?.map((counter) => ({
    ...counter,
    choiceCount: undefined,
  }))
  rerender(<SettlementVerification data={toVerificationData(raw)} />)
  expect(calculate()).toBeDisabled()
})

it('recalculates the server distributable amount even when ledger net revenue differs', () => {
  const raw = response()
  raw.recalculationInput = {
    ...raw.recalculationInput,
    grossRevenueAmount: 80000,
    refundedAmount: 10000,
    netRevenueAmount: 70000,
    distributableAmount: 60000,
  }
  render(<SettlementVerification data={toVerificationData(raw)} />)
  const calculator = within(screen.getByRole('region', { name: '재계산' }))
  fireEvent.click(calculator.getByRole('button', { name: '계산' }))
  expect(calculator.getByRole('status')).toHaveTextContent('재계산 결과가 서버 표시값과 일치합니다')
  expect(calculator.getByRole('status')).toHaveTextContent('분배 대상 60,000 YoYo')
})

it('keeps a missing distributable amount unknown and disables calculation', () => {
  const raw = response()
  raw.recalculationInput = { ...raw.recalculationInput, distributableAmount: undefined }
  const data = toVerificationData(raw)
  expect(data.recalculationInput.distributableAmount).toBeNull()
  render(<SettlementVerification data={data} />)
  const calculator = within(screen.getByRole('region', { name: '재계산' }))
  expect(calculator.getByRole('button', { name: '계산' })).toBeDisabled()
  expect(calculator.queryByRole('status')).not.toBeInTheDocument()
})

it('uses an explicit zero distributable amount without reverting to positive revenue', () => {
  const raw = response()
  raw.recalculationInput = { ...raw.recalculationInput, distributableAmount: 0 }
  raw.shares = raw.shares?.map((share) => ({
    ...share,
    fixedAmount: 0,
    choiceAmount: 0,
    dustAmount: 0,
    totalAmount: 0,
  }))
  render(<SettlementVerification data={toVerificationData(raw)} />)
  const calculator = within(screen.getByRole('region', { name: '재계산' }))
  fireEvent.click(calculator.getByRole('button', { name: '계산' }))
  expect(calculator.getByRole('status')).toHaveTextContent('재계산 결과가 서버 표시값과 일치합니다')
  expect(calculator.getByRole('status')).toHaveTextContent('분배 대상 0 YoYo')
})

it('renders the verification calculator in English without bilingual chrome', async () => {
  await i18n.changeLanguage('en')
  render(<SettlementVerification data={toVerificationData(response())} />)

  const calculator = within(screen.getByRole('region', { name: 'Recalculation' }))
  expect(calculator.getAllByText('Recalculate in this browser')).toHaveLength(2)
  expect(calculator.getByRole('button', { name: 'Calculate' })).toBeEnabled()
  expect(calculator.queryByText(/브라우저에서|원래 값으로|계산$/)).not.toBeInTheDocument()

  fireEvent.click(calculator.getByRole('button', { name: 'Calculate' }))
  expect(calculator.getByRole('status')).toHaveTextContent(
    'The recalculated values match the server totals',
  )
})
