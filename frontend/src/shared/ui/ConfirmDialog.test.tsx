import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { ConfirmDialog } from './ConfirmDialog'

const locale = vi.hoisted(() => ({ language: 'ko' }))
vi.mock('@/shared/i18n/useLocale', () => ({
  useLocale: () => ({
    language: locale.language,
    text: (ko: string, en: string) => (locale.language === 'ko' ? ko : en),
  }),
}))

describe('ConfirmDialog actions', () => {
  beforeEach(() => {
    locale.language = 'ko'
  })

  it('retains focus and ignores Escape while the action is busy', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <ConfirmDialog
        open
        busy
        title="Busy confirmation"
        confirmLabel="Confirm"
        onConfirm={() => undefined}
        onClose={onClose}
      />,
    )
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveFocus()
    await user.tab()
    expect(dialog).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('contains keyboard focus, restores the trigger, and makes the exit frame inert', async () => {
    const user = userEvent.setup()
    function Fixture() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>Open confirmation</button>
          <ConfirmDialog
            open={open}
            title="Confirmation"
            confirmLabel="Confirm"
            cancelLabel="Keep"
            onConfirm={() => setOpen(false)}
            onClose={() => setOpen(false)}
          />
          <button>Background action</button>
        </>
      )
    }
    render(<Fixture />)
    const trigger = screen.getByRole('button', { name: 'Open confirmation' })
    await user.click(trigger)
    const confirm = screen.getByRole('button', { name: 'Confirm' })
    const keep = screen.getByRole('button', { name: 'Keep' })
    expect(confirm).toHaveFocus()
    await user.tab()
    expect(keep).toHaveFocus()
    await user.tab()
    expect(confirm).toHaveFocus()
    await user.tab({ shift: true })
    expect(keep).toHaveFocus()
    const dialog = screen.getByRole('alertdialog')
    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
    expect(dialog.closest('[inert]')).not.toBeNull()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('keeps focus in the body input while typing unlocks the confirm button', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [reason, setReason] = useState('')
      return (
        <ConfirmDialog
          open
          title="Cancel show"
          confirmLabel="Confirm cancel"
          confirmDisabled={reason.length === 0}
          onConfirm={() => undefined}
          onClose={() => undefined}
          body={<input aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />}
        />
      )
    }
    render(<Harness />)

    const input = await screen.findByRole('textbox', { name: 'Reason' })
    expect(input).toHaveFocus()
    await user.type(input, 'abc')

    expect(input).toHaveValue('abc')
    expect(input).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Confirm cancel' })).toBeEnabled()
  })

  it('keeps long bilingual actions stacked inside the fixed-width desktop dialog', () => {
    render(
      <ConfirmDialog
        open
        title="환불 예정액을 지갑으로 돌려받고 취소할까요?"
        confirmLabel="Cancel ticket / 취소 확정"
        cancelLabel="Keep ticket / 유지하기"
        confirmVariant="danger"
        onConfirm={() => undefined}
        onClose={() => undefined}
      />,
    )

    const actions = screen.getByRole('group', { name: '확인 작업' })
    expect(actions).toHaveClass('flex-col')
    expect(actions).not.toHaveClass('md:flex-row-reverse')
  })

  it('uses English-only accessibility labels when English is selected', () => {
    locale.language = 'en'
    render(
      <ConfirmDialog
        open
        title="Confirmation"
        confirmLabel="Confirm"
        onConfirm={() => undefined}
        onClose={() => undefined}
      />,
    )

    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Confirmation actions' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeInTheDocument()
    expect(screen.queryByText(/유지하기|닫기|확인 작업/)).not.toBeInTheDocument()
  })
})
