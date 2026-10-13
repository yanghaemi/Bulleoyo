import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import i18n from '@/shared/i18n'
import { BookingCompletePage } from './BookingCompletePage'
import { MyTicketsPage } from './MyTicketsPage'
import { TicketDetailPage } from './TicketDetailPage'

vi.mock('@/shared/config', async (original) => ({
  ...(await original<typeof import('@/shared/config')>()),
  isDemo: true,
}))
vi.mock('@/shared/queries/ticket', () => ({
  useMyTickets: () => ({}),
  useAllMyTickets: () => ({}),
  useTicketDetail: () => ({}),
  useTicketQr: () => ({}),
}))
vi.mock('@/shared/queries/order', () => ({ useOrderDetail: () => ({}) }))
vi.mock('@/shared/queries/payment', () => ({ usePaymentStatus: () => ({}) }))
vi.mock('@/shared/queries/chain', () => ({ useChainJob: () => ({}) }))
vi.mock('react-router', async (original) => ({
  ...(await original<typeof import('react-router')>()),
  useViewTransitionState: () => false,
}))
beforeEach(async () => {
  await i18n.changeLanguage('en')
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})
afterEach(() => vi.unstubAllGlobals())

it.each([
  ['/orders/91/complete?from=12', '/orders/:orderId/complete', <BookingCompletePage />],
  ['/tickets', '/tickets', <MyTicketsPage />],
  ['/tickets/41', '/tickets/:ticketId', <TicketDetailPage />],
] as const)('uses English dates in the demo route %s', (entry, path, page) => {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path={path} element={page} />
      </Routes>
    </MemoryRouter>,
  )
  expect(screen.getAllByText(/September 20/).length).toBeGreaterThan(0)
  expect(screen.queryByText(/9월 20일/)).not.toBeInTheDocument()
})
