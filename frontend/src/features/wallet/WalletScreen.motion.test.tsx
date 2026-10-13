import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

import { WalletScreen, type WalletTx } from './WalletScreen'

const grant: WalletTx = {
  walletTxId: 'grant-1',
  type: 'GRANT',
  title: '가입 기본 지급',
  amount: 100_000,
  direction: 'IN',
  status: 'CONFIRMED',
  occurredAt: '2026-09-10T10:00:00+09:00',
  occurredAtLabel: '2026. 9. 10. 10:00',
  grantMemo: '테스트 월드 가입 보너스입니다.',
}

describe('WalletScreen grant disclosure', () => {
  it('connects the grant row to an expandable description', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <WalletScreen balanceKrw={100_000} transactions={[grant]} onRetryBalance={() => undefined} />
      </MemoryRouter>,
    )

    const trigger = screen.getAllByRole('button', { name: /가입 기본 지급/ })[0]
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveAttribute('aria-controls')

    await user.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const memo = (await screen.findAllByText('테스트 월드 가입 보너스입니다.'))[0]
    await waitFor(() => expect(memo).toBeVisible())
  })
})
