import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import i18n from '@/shared/i18n'

import { ConcertCollectorTicket } from './ConcertCollectorTicket'
import type { BookingCompleteView } from './bookingCompleteModel'

const data: BookingCompleteView = {
  orderNumber: 'ORD-0012',
  showTitle: 'aespa — Synk: Parallel Line',
  dateLabel: '9월 20일 오후 6:30 KST',
  venue: 'KSPO Dome, Seoul',
  ticketTypeName: 'GA Standing',
  teamName: 'aespa',
  quantity: 2,
  totalPaidLabel: '176,000 YoYo',
  paidAtLabel: '9월 11일 오후 2:30 KST',
  posterImageUrl: '/posters/12.webp',
}

describe('ConcertCollectorTicket', () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('en')
    })
  })

  it('switches presentation labels without changing the actual booking data', async () => {
    render(<ConcertCollectorTicket data={data} />)
    expect(screen.getByText('2 tickets')).toBeInTheDocument()

    await act(async () => {
      await i18n.changeLanguage('ko')
    })

    const ticket = screen.getByRole('article', { name: /발행된 티켓/ })
    expect(within(ticket).getByText('2매')).toBeInTheDocument()
    expect(within(ticket).getByText('발행 완료')).toBeInTheDocument()
    expect(within(ticket).queryByText('Valid')).not.toBeInTheDocument()
    expect(within(ticket).queryByText('2 tickets')).not.toBeInTheDocument()
    expect(within(ticket).getByText(data.showTitle)).toBeInTheDocument()
    expect(within(ticket).getByText(data.totalPaidLabel)).toBeInTheDocument()
  })

  it('renders one accessible collector ticket with every real booking value', () => {
    render(<ConcertCollectorTicket data={data} />)
    const ticket = screen.getByRole('article', { name: /Issued ticket/ })
    for (const value of [
      data.orderNumber,
      data.showTitle,
      data.dateLabel,
      data.venue,
      data.ticketTypeName,
      data.teamName,
      data.totalPaidLabel,
      data.paidAtLabel,
    ]) {
      expect(within(ticket).getByText(String(value), { exact: true })).toBeInTheDocument()
    }
    expect(within(ticket).getByText('2 tickets')).toBeInTheDocument()
    expect(within(ticket).getByText(/^Issued$/)).toBeInTheDocument()
    expect(within(ticket).getByRole('img', { name: /show poster/ })).toHaveAttribute(
      'src',
      '/posters/12.webp',
    )
    expect(ticket).toHaveAttribute('data-ticket-layout', 'concert-blue')
    expect(ticket.querySelector('.concert-ticket')).toHaveAttribute(
      'data-mobile-layout',
      'slim-landscape',
    )
  })

  it('uses a stable fallback poster and never fabricates seat, gate, or QR data', () => {
    render(<ConcertCollectorTicket data={{ ...data, posterImageUrl: null }} />)
    expect(screen.getByTestId('ticket-poster-fallback')).toBeVisible()
    expect(screen.queryByText(/seat|좌석|gate|게이트/i)).not.toBeInTheDocument()
    expect(screen.queryByTestId('ticket-qr')).not.toBeInTheDocument()
  })

  it('keeps decorative copies out of the accessibility tree', () => {
    render(<ConcertCollectorTicket data={data} decorative />)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.getByTestId('concert-collector-ticket')).toHaveAttribute('aria-hidden', 'true')
  })

  it('replaces a poster that fails to load or decode with the stable fallback', () => {
    render(<ConcertCollectorTicket data={data} />)

    fireEvent.error(screen.getByRole('img', { name: /show poster/ }))

    expect(screen.getByTestId('ticket-poster-fallback')).toBeVisible()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('article', { name: /Issued ticket/ })).toHaveTextContent(
      data.orderNumber,
    )
  })

  it('retries the poster when its URL changes, including a return to a previously failed URL', () => {
    const { rerender } = render(<ConcertCollectorTicket data={data} />)
    fireEvent.error(screen.getByRole('img', { name: /show poster/ }))
    expect(screen.getByTestId('ticket-poster-fallback')).toBeVisible()

    rerender(<ConcertCollectorTicket data={{ ...data }} />)
    expect(screen.getByTestId('ticket-poster-fallback')).toBeVisible()

    rerender(<ConcertCollectorTicket data={{ ...data, posterImageUrl: '/posters/8.webp' }} />)
    expect(screen.getByRole('img', { name: /show poster/ })).toHaveAttribute(
      'src',
      '/posters/8.webp',
    )
    expect(screen.queryByTestId('ticket-poster-fallback')).not.toBeInTheDocument()

    rerender(<ConcertCollectorTicket data={data} />)
    expect(screen.getByRole('img', { name: /show poster/ })).toHaveAttribute(
      'src',
      '/posters/12.webp',
    )
    expect(screen.queryByTestId('ticket-poster-fallback')).not.toBeInTheDocument()
  })
})
