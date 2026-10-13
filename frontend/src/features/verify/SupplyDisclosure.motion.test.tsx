import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SupplyDisclosure } from './SupplyDisclosure'
import type { CoinSupply } from './verifyTypes'

const supply: CoinSupply = {
  totalSupply: 1_000,
  escrowTotal: 400,
  walletTotal: 600,
  grantCount: 1,
  supplyMatched: true,
  currency: 'KRW',
  issuer: { type: 'MOCK', label: 'Platform', replaceable: true },
  mintHalted: false,
  releaseHalted: false,
  network: 'kaia-kairos',
  chainId: 1001,
  tokenAddress: '0x1111111111111111111111111111111111111111',
  tokenSymbol: 'YoYo',
  tokenDecimals: 0,
  explorerUrl: 'https://kairos.kaiascan.io/address/0x1111111111111111111111111111111111111111',
  invariants: [],
  perPerformanceEscrow: [],
  asOf: '2026-09-10T10:00:00+09:00',
  nextRefreshAt: '2026-09-10T10:01:00+09:00',
  stale: false,
  disclosure: '테스트넷 시연입니다.',
  grantNotice: '테스트 지급입니다.',
}

describe('SupplyDisclosure technical details', () => {
  it('connects the trigger to the animated technical panel', async () => {
    const user = userEvent.setup()
    render(<SupplyDisclosure data={supply} />)

    const trigger = screen.getByRole('button', { name: /On-chain details/i })
    expect(trigger).toHaveAttribute('aria-controls', 'supply-technical-details')

    await user.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(document.querySelector('#supply-technical-details')).toBeInTheDocument()
  })
})
