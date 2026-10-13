import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { DevUiPage } from '@/pages/DevUiPage'
import { SignatureProgress, Toast } from '@/shared/ui'

describe('UX foundation components', () => {
  it('renders all six components on the development page and closes the modal with Escape', async () => {
    const user = userEvent.setup()
    render(<DevUiPage />)

    for (const name of [
      '1. Button',
      '2. Modal',
      '3. Toast',
      '4. Money',
      '5. StatusBadge',
      '6. SignatureProgress',
    ]) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    }

    await user.click(screen.getByRole('button', { name: '모달 열기' }))
    expect(screen.getByRole('dialog', { name: '공연 정보를 확인해 주세요' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('exposes status semantics for toast and signature progress', () => {
    render(
      <>
        <Toast tone="error" title="처리하지 못했어요" />
        <SignatureProgress current={1} total={2} phase="signing" />
      </>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('처리하지 못했어요')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '2')
  })
})
