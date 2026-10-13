import { useState } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Modal } from '@/shared/ui/Modal'
import i18n from '@/shared/i18n'

function ModalHarness() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open modal
      </button>
      <button type="button">Background action</button>
      <Modal
        open={open}
        title="Accessible modal"
        footer={<button type="button">Save</button>}
        onClose={() => setOpen(false)}
      >
        <input aria-label="Name" />
      </Modal>
    </>
  )
}

describe('Modal', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(() => {
    document.body.style.overflow = ''
  })

  it('traps focus inside the dialog in both directions', async () => {
    const user = userEvent.setup()
    render(<ModalHarness />)

    await user.click(screen.getByRole('button', { name: 'Open modal' }))

    const dialog = screen.getByRole('dialog')
    const closeButton = screen.getByRole('button', { name: 'Close' })
    const saveButton = screen.getByRole('button', { name: 'Save' })

    expect(dialog).toHaveFocus()

    await user.tab({ shift: true })
    expect(saveButton).toHaveFocus()

    await user.tab()
    expect(closeButton).toHaveFocus()
  })

  it('locks background scrolling and restores focus after closing', async () => {
    const user = userEvent.setup()
    render(<ModalHarness />)

    const trigger = screen.getByRole('button', { name: 'Open modal' })
    await user.click(trigger)

    expect(document.body).toHaveStyle({ overflow: 'hidden' })

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
    expect(trigger).toHaveFocus()
  })

  it('uses the selected language for both closing controls', async () => {
    const user = userEvent.setup()
    render(<ModalHarness />)
    await user.click(screen.getByRole('button', { name: 'Open modal' }))
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    await act(async () => {
      await i18n.changeLanguage('ko')
    })
    expect(screen.getByRole('button', { name: '모달 닫기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument()
  })

  it('returns focus to the opener after clicking the backdrop', async () => {
    const user = userEvent.setup()
    render(<ModalHarness />)
    const trigger = screen.getByRole('button', { name: 'Open modal' })
    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
