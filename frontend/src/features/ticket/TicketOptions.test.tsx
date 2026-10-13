import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import i18n from '@/shared/i18n'
import { TicketOptions, type TicketOptionsView } from './TicketOptions'

beforeEach(async () => {
  await i18n.changeLanguage('en')
})
const data: TicketOptionsView = {
  showTitle: 'Actual Show',
  dateLabel: 'September 20',
  venue: 'Local Hall',
  ticketTypes: [
    { ticketTypeId: '1', name: 'Standing', price: 10000, remaining: 5 },
    { ticketTypeId: '2', name: 'Reserved', price: 20000, remaining: 1 },
  ],
}

it('caps the selected quantity to inventory when switching ticket types', () => {
  const onNext = vi.fn()
  render(
    <MemoryRouter>
      <TicketOptions data={data} onNext={onNext} />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: '수량 늘리기' }))
  fireEvent.click(screen.getByRole('button', { name: '수량 늘리기' }))
  fireEvent.click(screen.getByRole('radio', { name: /Reserved/ }))
  expect(screen.getByRole('button', { name: '수량 늘리기' })).toBeDisabled()
  fireEvent.click(screen.getAllByRole('button', { name: /Next: Select team/ })[0])
  expect(onNext).toHaveBeenCalledWith({ ticketTypeId: '2', quantity: 1 })
  fireEvent.click(screen.getByRole('radio', { name: /Standing/ }))
  fireEvent.click(screen.getAllByRole('button', { name: /Next: Select team/ })[0])
  expect(onNext).toHaveBeenLastCalledWith({ ticketTypeId: '1', quantity: 1 })
})

it('reconciles a live inventory decrease before continuing', () => {
  const onNext = vi.fn()
  const ui = (remaining: number) => (
    <MemoryRouter>
      <TicketOptions
        data={{ ...data, ticketTypes: [{ ...data.ticketTypes[0], remaining }] }}
        onNext={onNext}
      />
    </MemoryRouter>
  )
  const { rerender } = render(ui(5))
  fireEvent.click(screen.getByRole('button', { name: '수량 늘리기' }))
  fireEvent.click(screen.getByRole('button', { name: '수량 늘리기' }))
  rerender(ui(2))
  fireEvent.click(screen.getAllByRole('button', { name: /Next: Select team/ })[0])
  expect(onNext).toHaveBeenCalledWith({ ticketTypeId: '1', quantity: 2 })
  rerender(ui(5))
  fireEvent.click(screen.getAllByRole('button', { name: /Next: Select team/ })[0])
  expect(onNext).toHaveBeenLastCalledWith({ ticketTypeId: '1', quantity: 2 })
  rerender(ui(0))
  expect(screen.getAllByRole('button', { name: /Next: Select team/ })[0]).toBeDisabled()
})

it('uses a concise next-step label without a decorative arrow', () => {
  render(
    <MemoryRouter>
      <TicketOptions data={data} onNext={vi.fn()} />
    </MemoryRouter>,
  )

  expect(screen.getAllByRole('button', { name: 'Next: Select team' })).toHaveLength(2)
})
