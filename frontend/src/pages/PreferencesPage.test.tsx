import { fireEvent, render, screen } from '@testing-library/react'
import { useMyMember, useUpdateMyMember } from '@/shared/queries/member'
import { useExchangeRates } from '@/shared/queries/coin'

import { PreferencesPage } from './PreferencesPage'

const navigate = vi.hoisted(() => vi.fn())
const changeLanguage = vi.hoisted(() => vi.fn())

vi.mock('react-router', () => ({ useNavigate: () => navigate }))
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ i18n: { language: 'ko', changeLanguage } }),
}))
vi.mock('@/shared/queries/member', () => ({
  useMyMember: vi.fn(),
  useUpdateMyMember: vi.fn(),
}))
vi.mock('@/shared/queries/coin', () => ({ useExchangeRates: vi.fn() }))
vi.mock('@/features/member/PreferencesScreen', () => ({
  PreferencesScreen: ({
    onChange,
    onSave,
    saveDisabled,
    rates,
    ratesLoading,
    ratesFailed,
    usageNotice,
    onRetryRates,
  }: {
    onChange: (patch: { locale: 'en' }) => void
    onSave: () => void
    saveDisabled?: boolean
    rates?: { base: string; rate: number }[]
    ratesLoading?: boolean
    ratesFailed?: boolean
    usageNotice?: string
    onRetryRates: () => void
  }) => (
    <>
      <output aria-label="rates">
        {JSON.stringify({ rates, ratesLoading, ratesFailed, usageNotice })}
      </output>
      <button onClick={onRetryRates}>Retry rates</button>
      <button onClick={() => onChange({ locale: 'en' })}>Change locale</button>
      <button disabled={saveDisabled} onClick={onSave}>
        Save
      </button>
    </>
  ),
}))

const update = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useExchangeRates).mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  } as never)
  vi.mocked(useMyMember).mockReturnValue({
    data: undefined,
    isPending: true,
    isError: false,
    refetch: vi.fn(),
  } as never)
  vi.mocked(useUpdateMyMember).mockReturnValue({
    mutate: update,
    isPending: false,
    error: null,
  } as never)
})

it('passes registered rates and the server notice to the preferences screen', () => {
  vi.mocked(useExchangeRates).mockReturnValue({
    data: { rates: [{ base: 'USD', rate: 1350 }], usageNotice: 'Reference only' },
    isPending: false,
    isError: false,
  } as never)
  render(<PreferencesPage />)
  expect(screen.getByLabelText('rates')).toHaveTextContent('1350')
  expect(screen.getByLabelText('rates')).toHaveTextContent('Reference only')
})

it('retries the rate query instead of the member query after a rate failure', () => {
  const retryRates = vi.fn()
  const retryMember = vi.fn()
  vi.mocked(useExchangeRates).mockReturnValue({
    isPending: false,
    isError: true,
    refetch: retryRates,
  } as never)
  vi.mocked(useMyMember).mockReturnValue({
    isPending: false,
    isError: false,
    refetch: retryMember,
  } as never)
  render(<PreferencesPage />)
  expect(screen.getByLabelText('rates')).toHaveTextContent('"ratesFailed":true')
  fireEvent.click(screen.getByRole('button', { name: 'Retry rates' }))
  expect(retryRates).toHaveBeenCalledTimes(1)
  expect(retryMember).not.toHaveBeenCalled()
})

it.each([
  ['loading', { data: undefined, isPending: true, isError: false }],
  ['error', { data: undefined, isPending: false, isError: true }],
])('회원 설정 조회가 %s 상태면 저장을 막는다', (_state, result) => {
  vi.mocked(useMyMember).mockReturnValue({ ...result, refetch: vi.fn() } as never)

  render(<PreferencesPage />)

  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
})

it('사용자가 바꾼 설정만 PATCH한다', () => {
  vi.mocked(useMyMember).mockReturnValue({
    data: { locale: 'ko', displayCurrency: 'KRW', timezone: 'Asia/Seoul' },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  } as never)

  render(<PreferencesPage />)
  fireEvent.click(screen.getByRole('button', { name: 'Change locale' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  expect(update).toHaveBeenCalledWith({ locale: 'en' }, expect.any(Object))
})
