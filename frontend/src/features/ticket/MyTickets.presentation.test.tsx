import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import i18n from '@/shared/i18n'
import { MyTickets, type TicketListItem } from './MyTickets'

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

it('provides a real show-discovery destination when the selected ticket category is empty', () => {
  render(
    <MemoryRouter>
      <MyTickets tickets={[]} active="upcoming" onTabChange={vi.fn()} onSelect={vi.fn()} />
    </MemoryRouter>,
  )
  expect(screen.getByRole('link', { name: 'Browse shows' })).toHaveAttribute(
    'href',
    '/performances',
  )
})

it('keeps ticket categories separate and selects the real ticket without an animation lock', () => {
  const active: TicketListItem = {
    ticketId: '41',
    showTitle: 'Live night',
    dateLabel: 'Sep 26',
    venue: 'Hall',
    ticketTypeName: 'Standing',
    tab: 'upcoming',
  }
  const used: TicketListItem = { ...active, ticketId: '42', showTitle: 'Past night', tab: 'used' }
  const onSelect = vi.fn()
  const onTabChange = vi.fn()
  render(
    <MemoryRouter>
      <MyTickets
        tickets={[active, used]}
        active="upcoming"
        onTabChange={onTabChange}
        onSelect={onSelect}
      />
    </MemoryRouter>,
  )
  expect(screen.queryByText('Past night')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Live night/ }))
  expect(onSelect).toHaveBeenCalledWith(active)
  fireEvent.click(screen.getByRole('tab', { name: 'Used' }))
  expect(onTabChange).toHaveBeenCalledWith('used')
})

it('shows one performance card with its owned ticket count', () => {
  render(
    <MemoryRouter>
      <MyTickets
        tickets={[
          {
            ticketId: '41',
            ticketIds: ['41', '42'],
            ticketCount: 2,
            performanceId: '12',
            showTitle: 'Live night',
            dateLabel: 'Sep 26',
            venue: 'Hall',
            ticketTypeName: 'Standing',
            tab: 'upcoming',
          },
        ]}
        active="upcoming"
        onTabChange={vi.fn()}
        onSelect={vi.fn()}
      />
    </MemoryRouter>,
  )

  expect(screen.getByText('2 tickets')).toBeVisible()
  expect(screen.getAllByText('Live night')).toHaveLength(1)
})
