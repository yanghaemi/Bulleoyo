import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, it, vi } from 'vitest'
import { TicketDetail, type TicketDetailView } from './TicketDetail'
vi.mock('react-router', async (original) => ({
  ...(await original<typeof import('react-router')>()),
  useViewTransitionState: () => false,
}))
const data: TicketDetailView = {
  ticketId: '41',
  ticketNumber: 'T-41',
  orderNumber: 'ORDER-99',
  showTitle: 'Live night',
  dateLabel: 'Show at 19:00',
  venue: 'Rolling Hall',
  ticketTypeName: 'Standing',
  teamName: 'Band',
  status: 'valid',
  qrToken: 'sample',
}
it('places the valid QR in the common full ticket and preserves order details', async () => {
  const onCancel = vi.fn()
  const { container } = render(
    <MemoryRouter>
      <TicketDetail data={data} onCancel={onCancel} onRotateQr={vi.fn()} />
    </MemoryRouter>,
  )
  await screen.findByRole('button', { name: 'Enlarge QR code' })
  expect(
    container.querySelector('.concert-ticket--full .concert-ticket__stub .ticket-qr'),
  ).not.toBeNull()
  expect(screen.getByText('ORDER-99')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel ticket' }))
  expect(onCancel).toHaveBeenCalledTimes(1)
})
it.each(['used', 'cancelled'] as const)('never shows QR for %s even with token props', (status) => {
  render(
    <MemoryRouter>
      <TicketDetail
        data={{ ...data, status, usedAtLabel: 'Used at 19:32' }}
        onCancel={vi.fn()}
        onRotateQr={vi.fn()}
      />
    </MemoryRouter>,
  )
  expect(screen.queryByRole('button', { name: 'Enlarge QR code' })).not.toBeInTheDocument()
  expect(screen.queryByAltText('Entry QR code')).not.toBeInTheDocument()
  if (status === 'used') expect(screen.getByText('Used at 19:32')).toBeVisible()
})
it('preserves the cancellation deadline', () => {
  const onCancel = vi.fn()
  render(
    <MemoryRouter>
      <TicketDetail
        data={{ ...data, cancellable: false }}
        onCancel={onCancel}
        onRotateQr={vi.fn()}
      />
    </MemoryRouter>,
  )
  const button = screen.getByRole('button', { name: 'Cancel ticket' })
  expect(button).toBeDisabled()
  fireEvent.click(button)
  expect(onCancel).not.toHaveBeenCalled()
})

it('같은 공연의 여러 티켓 QR을 앞뒤로 순환한다', () => {
  const onSelectTicket = vi.fn()
  render(
    <MemoryRouter>
      <TicketDetail
        data={data}
        ticketSequence={{ ticketIds: ['40', '41', '42'], activeIndex: 1 }}
        onSelectTicket={onSelectTicket}
        onCancel={vi.fn()}
        onRotateQr={vi.fn()}
      />
    </MemoryRouter>,
  )

  expect(screen.getByText('2 / 3')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Previous ticket QR' }))
  expect(onSelectTicket).toHaveBeenLastCalledWith('40')
  fireEvent.click(screen.getByRole('button', { name: 'Next ticket QR' }))
  expect(onSelectTicket).toHaveBeenLastCalledWith('42')
})

it('첫 티켓의 이전과 마지막 티켓의 다음은 원형으로 이어진다', () => {
  const onSelectTicket = vi.fn()
  const { rerender } = render(
    <MemoryRouter>
      <TicketDetail
        data={{ ...data, ticketId: '40' }}
        ticketSequence={{ ticketIds: ['40', '41', '42'], activeIndex: 0 }}
        onSelectTicket={onSelectTicket}
        onCancel={vi.fn()}
        onRotateQr={vi.fn()}
      />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Previous ticket QR' }))
  expect(onSelectTicket).toHaveBeenLastCalledWith('42')

  rerender(
    <MemoryRouter>
      <TicketDetail
        data={{ ...data, ticketId: '42' }}
        ticketSequence={{ ticketIds: ['40', '41', '42'], activeIndex: 2 }}
        onSelectTicket={onSelectTicket}
        onCancel={vi.fn()}
        onRotateQr={vi.fn()}
      />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Next ticket QR' }))
  expect(onSelectTicket).toHaveBeenLastCalledWith('40')
})

it('QR을 넘겨도 최초 상세 진입용 분리 무대 DOM은 다시 만들지 않는다', () => {
  const sequence = { ticketIds: ['41', '42'], activeIndex: 0 }
  const { container, rerender } = render(
    <MemoryRouter>
      <TicketDetail
        data={data}
        ticketSequence={sequence}
        onSelectTicket={vi.fn()}
        onCancel={vi.fn()}
        onRotateQr={vi.fn()}
      />
    </MemoryRouter>,
  )
  const stage = container.querySelector('.ticket-detail-page__ticket-stage')

  rerender(
    <MemoryRouter>
      <TicketDetail
        data={{ ...data, ticketId: '42', ticketNumber: 'T-42' }}
        ticketSequence={{ ...sequence, activeIndex: 1 }}
        onSelectTicket={vi.fn()}
        onCancel={vi.fn()}
        onRotateQr={vi.fn()}
      />
    </MemoryRouter>,
  )

  expect(container.querySelector('.ticket-detail-page__ticket-stage')).toBe(stage)
})

it('removes the open QR dialog when the ticket becomes used', async () => {
  const { rerender } = render(
    <MemoryRouter>
      <TicketDetail data={data} onCancel={vi.fn()} onRotateQr={vi.fn()} />
    </MemoryRouter>,
  )
  await screen.findByAltText('Entry QR code')
  fireEvent.click(screen.getByRole('button', { name: 'Enlarge QR code' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  rerender(
    <MemoryRouter>
      <TicketDetail data={{ ...data, status: 'used' }} onCancel={vi.fn()} onRotateQr={vi.fn()} />
    </MemoryRouter>,
  )
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryAllByAltText('Entry QR code')).toHaveLength(0)
})
