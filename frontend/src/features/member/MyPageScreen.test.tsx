import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { MyPageScreen, type MyPageView } from './MyPageScreen'

const data: MyPageView = {
  name: 'Audience member',
  email: 'audience@example.com',
  languageLabel: 'English · USD',
  walletProvider: 'WEB3AUTH',
  balanceKrw: 15000,
}

it('keeps account settings independently discoverable with their existing destinations', () => {
  render(
    <MemoryRouter>
      <MyPageScreen data={data} onEditName={vi.fn()} onRetryBalance={vi.fn()} onSignOut={vi.fn()} />
    </MemoryRouter>,
  )

  const settings = screen.getByRole('region', { name: 'Account settings' })
  expect(within(settings).getByRole('link', { name: 'Language & currency' })).toHaveAttribute(
    'href',
    '/me/preferences',
  )
  expect(within(settings).getByRole('link', { name: 'Wallet ready' })).toHaveAttribute(
    'href',
    '/onboarding/wallet',
  )
  // 등록됨 행은 보기 전용 화면으로 가는 길임을 요약 줄로 밝힌다(주소 자체는 싣지 않는다)
  expect(within(settings).getByRole('link', { name: 'Wallet ready' })).toHaveTextContent(
    'View address and details',
  )
  expect(within(settings).queryByRole('link', { name: 'Orders' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Studio' })).toHaveAttribute('href', '/studio')
})

it('keeps balance retry separate from navigation when its amount is unavailable', () => {
  const retry = vi.fn()
  render(
    <MemoryRouter>
      <MyPageScreen
        data={{ ...data, balanceKrw: undefined }}
        onEditName={vi.fn()}
        onRetryBalance={retry}
        onSignOut={vi.fn()}
      />
    </MemoryRouter>,
  )
  const button = screen.getByRole('button', { name: 'Retry' })
  expect(button.closest('a')).toBeNull()
  fireEvent.click(button)
  expect(retry).toHaveBeenCalledOnce()
  expect(screen.getByLabelText('Could not load your balance')).toHaveTextContent('—')
})
