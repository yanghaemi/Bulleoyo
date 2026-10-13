import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import i18n from '@/shared/i18n'
import { ConcertTicket, type ConcertTicketProps } from './ConcertTicket'
import { readFileSync } from 'node:fs'

const props: ConcertTicketProps = {
  title: 'Live night',
  dateLabel: '2026.09.26',
  venue: 'Rolling Hall',
  ticketTypeName: 'Standing',
  status: 'used',
  serialLabel: 'Ticket number',
  serial: '41',
  density: 'compact',
}
afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('en')
  })
})
it('keeps actual values after poster failure and retries changed URLs', () => {
  const { rerender } = render(<ConcertTicket {...props} posterImageUrl="/a.webp" />)
  fireEvent.error(screen.getByRole('img'))
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  for (const value of ['Live night', '41', 'Rolling Hall', 'Standing', 'Used'])
    expect(screen.getByText(value)).toBeVisible()
  rerender(<ConcertTicket {...props} posterImageUrl="/b.webp" />)
  expect(screen.getByRole('img')).toHaveAttribute('src', '/b.webp')
  rerender(<ConcertTicket {...props} posterImageUrl="/a.webp" />)
  expect(screen.getByRole('img')).toHaveAttribute('src', '/a.webp')
})
it('preserves custom artwork colors and reports the active fallback source', () => {
  const { container } = render(
    <ConcertTicket
      {...props}
      ticketArtworkImageUrl="/custom-ticket.webp"
      posterImageUrl="/poster.webp"
    />,
  )
  const art = container.querySelector('.concert-ticket__art')
  const image = screen.getByRole('img')

  expect(art).toHaveAttribute('data-source', 'artwork')
  expect(art).toHaveAttribute('data-color-treatment', 'preserve')

  fireEvent.error(image)
  expect(art).toHaveAttribute('data-source', 'poster')
  expect(art).toHaveAttribute('data-color-treatment', 'neutral-contrast')
  expect(screen.getByRole('img')).toHaveAttribute('src', '/poster.webp')

  fireEvent.error(screen.getByRole('img'))
  expect(art).toHaveAttribute('data-source', 'fallback')
  expect(art).toHaveAttribute('data-color-treatment', 'brand')
})
it.each(['used', 'cancelled'] as const)(
  'keeps uploaded artwork colors unfiltered when the ticket is %s',
  (status) => {
    const sheet = document.createElement('style')
    sheet.textContent = readFileSync('src/features/ticket/ConcertTicket.css', 'utf8')
    document.head.append(sheet)
    try {
      render(
        <ConcertTicket
          {...props}
          status={status}
          ticketArtworkImageUrl="/custom-ticket.webp"
        />,
      )
      expect(getComputedStyle(screen.getByRole('img')).filter).toBe('none')
    } finally {
      sheet.remove()
    }
  },
)
it('uses non-interactive markup and translates actual status', async () => {
  const { container, rerender } = render(<ConcertTicket {...props} />)
  expect(container.querySelector('button, article, a')).toBeNull()
  expect(screen.getByTestId('ticket-poster-fallback')).toBeInTheDocument()
  await act(async () => {
    await i18n.changeLanguage('ko')
  })
  expect(screen.getByText('사용 완료')).toBeVisible()
  rerender(<ConcertTicket {...props} status="cancelled" />)
  expect(screen.getByText('취소됨')).toBeVisible()
})
it('uses a decorative barcode only when no entry content is supplied', () => {
  const { container, rerender } = render(<ConcertTicket {...props} />)
  expect(container.querySelector('.concert-ticket__barcode')).toHaveAttribute('aria-hidden', 'true')
  expect(container.querySelector('svg, canvas, img')).toBeNull()
  rerender(<ConcertTicket {...props}>{false}</ConcertTicket>)
  expect(container.querySelector('.concert-ticket__barcode')).toBeInTheDocument()
  rerender(
    <ConcertTicket {...props}>
      <button>Entry code</button>
    </ConcertTicket>,
  )
  expect(container.querySelector('.concert-ticket__barcode')).toBeNull()
  expect(screen.getByRole('button', { name: 'Entry code' })).toBeVisible()
})
it('keeps the reference status rectangular and ticket number vertical', () => {
  const sheet = document.createElement('style')
  sheet.textContent = readFileSync('src/features/ticket/ConcertTicket.css', 'utf8')
  document.head.append(sheet)
  try {
    const { container } = render(<ConcertTicket {...props} density="full" />)
    const status = container.querySelector('.concert-ticket__status')!
    const serial = screen.getByText('41')
    expect(getComputedStyle(status).borderRadius).toBe('0px')
    expect(getComputedStyle(serial).writingMode).toBe('vertical-rl')
  } finally {
    sheet.remove()
  }
})
it('derives the decorative single-line headline from the actual performance title', () => {
  const { rerender } = render(<ConcertTicket {...props} />)
  const art = screen.getByTestId('ticket-poster-fallback')
  expect(art).toHaveAttribute('data-title', 'Live night')
  expect(art).toHaveAttribute('aria-hidden', 'true')
  expect(art.querySelector('br')).toBeNull()
  rerender(<ConcertTicket {...props} title="합정의 밤" />)
  expect(screen.getByTestId('ticket-poster-fallback')).toHaveAttribute('data-title', '합정의 밤')
  expect(screen.getAllByText('합정의 밤')).toHaveLength(1)
})
it('anchors performance details beneath the eyebrow with status at the bottom right', () => {
  const sheet = document.createElement('style')
  sheet.textContent = readFileSync('src/features/ticket/ConcertTicket.css', 'utf8')
  document.head.append(sheet)
  try {
    const { container } = render(<ConcertTicket {...props} />)
    const details = container.querySelector('.concert-ticket__details')
    expect(details).toContainElement(screen.getByText('Live night'))
    expect(details).toContainElement(screen.getByText('Rolling Hall'))
    expect(details).toContainElement(screen.getByText('Used'))
    expect(getComputedStyle(details!).marginTop).toBe('auto')
    expect(getComputedStyle(screen.getByText('Used')).justifySelf).toBe('end')
    expect(getComputedStyle(screen.getByText('Used')).alignSelf).toBe('end')
  } finally {
    sheet.remove()
  }
})
