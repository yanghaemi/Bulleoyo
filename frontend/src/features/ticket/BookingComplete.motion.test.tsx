import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BookingComplete, type BookingCompleteView } from './BookingComplete'

const data: BookingCompleteView = {
  orderNumber: 'B-204',
  showTitle: '인디의 밤',
  dateLabel: '2026. 9. 10.',
  venue: 'SSAFY Hall',
  ticketTypeName: 'Standing',
  teamName: '불러요',
  quantity: 2,
  totalPaidLabel: '40,000 YoYo',
  paidAtLabel: '2026. 9. 10. 14:00 KST',
}

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function mount() {
  const onViewTickets = vi.fn()
  const onBackHome = vi.fn()
  return {
    ...render(
      <BookingComplete data={data} onViewTickets={onViewTickets} onBackHome={onBackHome} />,
    ),
    onViewTickets,
    onBackHome,
  }
}

describe('BookingComplete ticket cinematic', () => {
  it('renders one semantic Collector Foil A+ ticket inside the cinematic stage', () => {
    mount()

    expect(screen.getByTestId('ticket-reveal-stage')).toBeInTheDocument()
    const ticket = screen.getByTestId('concert-collector-ticket')
    expect(ticket).toHaveAttribute('data-ticket-layout', 'concert-blue')
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Replay ticket' })).toBeEnabled()

    const content = within(ticket)
    for (const value of [
      data.showTitle,
      data.dateLabel,
      data.venue,
      data.ticketTypeName,
      data.teamName,
      '2 tickets',
      data.totalPaidLabel,
      data.orderNumber,
      data.paidAtLabel,
    ]) {
      expect(content.getByText(value)).toBeInTheDocument()
    }
  })

  it('keeps completion actions usable while the ticket reveal runs', () => {
    const { onViewTickets, onBackHome } = mount()

    fireEvent.click(screen.getByRole('button', { name: /View my tickets/ }))
    fireEvent.click(screen.getByRole('button', { name: /Back to home/ }))

    expect(onViewTickets).toHaveBeenCalledOnce()
    expect(onBackHome).toHaveBeenCalledOnce()
  })
})
