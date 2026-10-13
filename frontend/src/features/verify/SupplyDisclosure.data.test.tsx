import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toCoinSupply } from '@/shared/api/domains/coin'
import { SupplyDisclosure } from './SupplyDisclosure'

const locale = vi.hoisted(() => ({ language: 'en' }))
vi.mock('@/shared/i18n/useLocale', () => ({
  useLocale: () => ({
    language: locale.language,
    text: (ko: string, en: string) => (locale.language === 'ko' ? ko : en),
  }),
}))

function supply() {
  return toCoinSupply({
    totalSupply: 950000,
    escrowTotal: 225000,
    walletTotal: 625000,
    supplyMatched: true,
    mintHalted: false,
    releaseHalted: false,
    stale: false,
    tokenSymbol: 'YoYo',
    chainId: 1001,
    tokenDecimals: 0,
    asOf: '2026-09-18T10:00:00+09:00',
    nextRefreshAt: '2026-09-18T10:01:00+09:00',
    invariants: [
      { no: 1, expected: 950000, actual: 950000, matched: true },
      { no: 2, checkedShows: 6, mismatchedShows: 0, matched: true },
      { no: 3, checkedShows: 3, maxDiff: 0, matched: true },
      { no: 4, expected: 850000, actual: 950000, matched: true },
    ],
    perPerformanceEscrow: [{ performanceId: 16, escrowAmount: 175000, depositAmount: 50000 }],
  })
}

beforeEach(() => {
  locale.language = 'en'
})

it('describes the registered-wallet scope and the 100000 outside that scope', () => {
  render(<SupplyDisclosure data={supply()} />)
  expect(screen.getByText('Registered wallets')).toBeInTheDocument()
  expect(screen.getByText(/100,000 YoYo/)).toBeInTheDocument()
  expect(document.body).not.toHaveTextContent('950,000 YoYo = 225,000 YoYo + 625,000 YoYo')
})

it('localizes the successful public disclosure including expanded panels', async () => {
  const user = userEvent.setup()
  render(<SupplyDisclosure data={supply()} />)
  await user.click(screen.getByRole('button', { name: /On-chain details/ }))
  await user.click(screen.getByRole('button', { name: /Invariants/ }))
  expect(document.body.textContent).not.toMatch(/[가-힣]/)
})

it('uses Korean labels when Korean is selected', () => {
  locale.language = 'ko'
  render(<SupplyDisclosure data={supply()} />)
  expect(screen.getByText('등록 지갑 보유량')).toBeInTheDocument()
  expect(screen.queryByText('Total supply')).not.toBeInTheDocument()
})

it('does not invent outside holdings when reconciliation was not measured', () => {
  const data = supply()
  data.invariants[3].expected = null
  data.invariants[3].actual = null
  render(<SupplyDisclosure data={data} />)
  expect(screen.queryByText(/100,000 YoYo/)).not.toBeInTheDocument()
})
