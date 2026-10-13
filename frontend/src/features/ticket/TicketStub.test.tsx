import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { TicketStub } from './TicketStub'
vi.mock('./chime', () => ({ playTicketChime: vi.fn() }))
const ticket = {
  ticketId: '41',
  showTitle: 'Live night',
  dateLabel: '2026.09.26',
  venue: 'Hall',
  ticketTypeName: 'Standing',
  tab: 'upcoming' as const,
}
it('selects once with effects disabled', () => {
  const onSelect = vi.fn(),
    onLockChange = vi.fn()
  render(
    <TicketStub
      ticket={ticket}
      index={0}
      locked={false}
      onSelect={onSelect}
      onLockChange={onLockChange}
    />,
  )
  fireEvent.click(screen.getByRole('button'))
  expect(onSelect).toHaveBeenCalledTimes(1)
  expect(onLockChange).not.toHaveBeenCalled()
  expect(screen.queryByAltText('Entry QR code')).not.toBeInTheDocument()
})
it('does not select a locked ticket', () => {
  const onSelect = vi.fn(),
    onLockChange = vi.fn()
  render(
    <TicketStub ticket={ticket} index={0} locked onSelect={onSelect} onLockChange={onLockChange} />,
  )
  fireEvent.click(screen.getByRole('button'))
  expect(onSelect).not.toHaveBeenCalled()
  expect(onLockChange).not.toHaveBeenCalled()
})

it('opens the selected ticket immediately even when old ticket effects are enabled', () => {
  const onSelect = vi.fn()
  render(
    <TicketStub
      ticket={ticket}
      index={0}
      locked={false}
      onSelect={onSelect}
      onLockChange={vi.fn()}
    />,
  )
  const button = screen.getByRole('button')
  button.style.setProperty('--fx-ticket-on', '1')
  fireEvent.click(button)
  expect(onSelect).toHaveBeenCalledTimes(1)
})
