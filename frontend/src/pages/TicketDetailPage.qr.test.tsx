/**
 * A-08 동적 QR — 401 하나를 두 가지로 갈라 읽는다.
 *
 * `ENTRY_QR_EXPIRED`는 HTTP 401이지만 **회원 세션과 무관하다**(규격 §1 ·
 * `PASSTHROUGH_UNAUTHORIZED_CODES`). status로 뭉뚱그려 "세션 만료"로 처리하면 관객이
 * 입장 줄에서 로그인 화면으로 튕긴다. 화면은 `code`로 갈라 **재발급**한다.
 *
 * 함께 못 박는 것 — `USED`·`CANCELLED`에는 서버가 QR을 발급하지 않으므로(409) 아예 부르지 않는다.
 */

import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'

import { ApiError } from '@/shared/api/client'
import { EntryCode } from '@/shared/api/errorCodes'

import { TicketDetailPage } from './TicketDetailPage'

const ticket = vi.hoisted(() => ({
  status: 'ISSUED' as 'ISSUED' | 'USED' | 'CANCELLED' | 'UNKNOWN_STATUS',
  qrError: null as unknown,
  qrRefetch: vi.fn(),
  /** useTicketQr에 넘어간 `enabled` — 호출 자체를 막았는지 본다 */
  qrEnabled: [] as (boolean | undefined)[],
  detailPlaceholder: false,
}))

vi.mock('@/shared/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/config')>()),
  isDemo: false,
  isDev: false,
}))
/**
 * `TicketDetail`이 목록에서 모핑돼 왔는지 묻는 훅은 **데이터 라우터에서만** 산다.
 * `createMemoryRouter`는 이 저장소에서 쓰지 않는다 — react-router 7이 내부에서 만드는 `Request`를
 * jsdom+undici가 거부한다(`RequireAuth.test.tsx` 주석). 연출 여부는 이 테스트의 관심사가 아니라
 * 그 훅만 끈다.
 */
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useViewTransitionState: () => false,
}))
vi.mock('@/shared/queries/ticket', () => ({
  useAllMyTickets: () => ({
    data: { items: [{ ticketId: 41, performanceId: 12, status: ticket.status }] },
  }),
  useTicketDetail: () => ({
    data: {
      ticketId: 41,
      orderId: 91,
      performanceId: 12,
      performanceTitle: 'aespa — Synk: Parallel Line',
      venueName: 'KSPO Dome',
      startAt: '2026-09-20T09:30:00Z',
      ticketTypeName: 'GA Standing',
      status: ticket.status,
      chosenTeamName: 'aespa',
      cancellable: true,
      usedAt: ticket.status === 'USED' ? '2026-09-20T09:42:00Z' : null,
    },
    isPending: false,
    isPlaceholderData: ticket.detailPlaceholder,
    error: null,
    refetch: vi.fn(),
  }),
  useTicketQr: (_id: number | undefined, options: { enabled?: boolean } = {}) => {
    ticket.qrEnabled.push(options.enabled)
    return {
      data: { qrToken: 'token-1', rotateAfterMs: 30_000, expiresAt: '2099-01-01T00:00:00Z' },
      error: ticket.qrError,
      isSuccess: ticket.qrError === null,
      refetch: ticket.qrRefetch,
    }
  },
}))

/** 로그인으로 튕겼는지 확인할 자리 */
function Probe() {
  const location = useLocation()
  return <div data-testid="probe">{location.pathname}</div>
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/tickets/41']}>
      <Probe />
      <Routes>
        <Route path="/tickets/:ticketId" element={<TicketDetailPage />} />
        <Route path="/tickets" element={<p>my tickets</p>} />
        <Route path="/login" element={<p>login screen</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  ticket.status = 'ISSUED'
  ticket.qrError = null
  ticket.qrEnabled = []
  ticket.detailPlaceholder = false
})

it('다음 티켓 상세을 기다릴 때 기존 무대를 유지하고 새 QR 요청은 막는다', async () => {
  ticket.detailPlaceholder = true

  renderPage()

  const loadingStatus = screen.getByRole('status')
  expect(loadingStatus).toHaveTextContent('Loading next ticket')
  expect(loadingStatus).toBeVisible()
  await waitFor(() => expect(ticket.qrEnabled.length).toBeGreaterThan(0))
  expect(ticket.qrEnabled.every((enabled) => enabled === false)).toBe(true)
  expect(screen.getByText('aespa — Synk: Parallel Line')).toBeVisible()
  expect(screen.queryByAltText('Entry QR code')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Cancel ticket' })).toBeDisabled()
})

it('QR 만료(401)는 로그아웃이 아니라 재발급이다', async () => {
  ticket.qrError = new ApiError({
    code: EntryCode.QR_EXPIRED,
    status: 401,
    msg: 'QR이 만료되었습니다',
  })

  renderPage()

  // 만료된 토큰은 30초 회전을 기다리지 않고 즉시 다시 받는다
  await waitFor(() => expect(ticket.qrRefetch).toHaveBeenCalled())
  // **로그인 화면으로 튕기지 않는다.** 이 401은 세션과 무관하다
  expect(screen.getByTestId('probe').textContent).toBe('/tickets/41')
  expect(screen.queryByText('login screen')).toBeNull()
  // 티켓 자체도 가려지지 않는다 — 실패는 QR 자리에만 갇힌다
  expect(screen.getByText('aespa — Synk: Parallel Line')).toBeTruthy()
})

it('같은 만료 오류로 재발급을 반복해 부르지 않는다', async () => {
  ticket.qrError = new ApiError({ code: EntryCode.QR_EXPIRED, status: 401, msg: '만료' })

  const { rerender } = renderPage()
  await waitFor(() => expect(ticket.qrRefetch).toHaveBeenCalledTimes(1))

  rerender(
    <MemoryRouter initialEntries={['/tickets/41']}>
      <Probe />
      <Routes>
        <Route path="/tickets/:ticketId" element={<TicketDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
  // 오류 객체가 그대로면 한 번만 반응한다(무한 재요청 방지)
  expect(ticket.qrRefetch).toHaveBeenCalledTimes(1)
})

it('사용 완료 티켓에는 QR을 요청하지 않는다', async () => {
  ticket.status = 'USED'

  renderPage()

  // 서버가 409로 거절할 호출을 애초에 걸지 않는다
  await waitFor(() => expect(ticket.qrEnabled.length).toBeGreaterThan(0))
  expect(ticket.qrEnabled.every((enabled) => enabled === false)).toBe(true)
})

it('사용 가능한 티켓에는 QR을 요청한다', async () => {
  renderPage()

  await waitFor(() => expect(ticket.qrEnabled.some((enabled) => enabled === true)).toBe(true))
})

it('hides cached QR after a refresh error without hiding the ticket', async () => {
  const { rerender } = renderPage()
  await screen.findByAltText('Entry QR code')
  ticket.qrError = new ApiError({ code: 'NETWORK_ERROR', status: 503, msg: 'offline' })
  rerender(
    <MemoryRouter initialEntries={['/tickets/41']}>
      <Probe />
      <Routes>
        <Route path="/tickets/:ticketId" element={<TicketDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
  expect(screen.queryByAltText('Entry QR code')).not.toBeInTheDocument()
  expect(screen.getByText('aespa — Synk: Parallel Line')).toBeVisible()
  expect(screen.getByText('Could not refresh QR. Try again.')).toBeVisible()
})

it('does not request QR for cancelled tickets', () => {
  ticket.status = 'CANCELLED'
  renderPage()
  expect(ticket.qrEnabled.length).toBeGreaterThan(0)
  expect(ticket.qrEnabled.every((enabled) => enabled === false)).toBe(true)
})

it('bounds immediate expiry recovery even if each failure is a new error object', async () => {
  ticket.qrError = new ApiError({ code: EntryCode.QR_EXPIRED, status: 401, msg: 'expired' })
  const { rerender } = renderPage()
  await waitFor(() => expect(ticket.qrRefetch).toHaveBeenCalledTimes(1))
  ticket.qrError = new ApiError({ code: EntryCode.QR_EXPIRED, status: 401, msg: 'expired again' })
  rerender(
    <MemoryRouter initialEntries={['/tickets/41']}>
      <Probe />
      <Routes>
        <Route path="/tickets/:ticketId" element={<TicketDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
  expect(ticket.qrRefetch).toHaveBeenCalledTimes(1)
})

it('allows one new recovery after a successful QR response', async () => {
  ticket.qrError = new ApiError({ code: EntryCode.QR_EXPIRED, status: 401, msg: 'expired' })
  const { rerender } = renderPage()
  await waitFor(() => expect(ticket.qrRefetch).toHaveBeenCalledTimes(1))
  const page = () => (
    <MemoryRouter initialEntries={['/tickets/41']}>
      <Probe />
      <Routes>
        <Route path="/tickets/:ticketId" element={<TicketDetailPage />} />
      </Routes>
    </MemoryRouter>
  )
  ticket.qrError = null
  rerender(page())
  ticket.qrError = new ApiError({ code: EntryCode.QR_EXPIRED, status: 401, msg: 'next expiry' })
  rerender(page())
  expect(ticket.qrRefetch).toHaveBeenCalledTimes(2)
})

it('does not render a ticket or request QR for an unknown server status', () => {
  ticket.status = 'UNKNOWN_STATUS'
  renderPage()
  expect(screen.getByText('Could not load your ticket.')).toBeVisible()
  expect(ticket.qrEnabled.every((enabled) => enabled === false)).toBe(true)
  expect(screen.queryByText('aespa — Synk: Parallel Line')).not.toBeInTheDocument()
})
