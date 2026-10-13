import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'

import { ApiError } from '@/shared/api/client'
import { WalletError } from '@/shared/blockchain/WalletAdapter'
import i18n from '@/shared/i18n'

import { PaymentPage } from './PaymentPage'

const adapter = vi.hoisted(() => ({ signTransaction: vi.fn() }))
/** `useWalletReady`(D-77)의 판정. 기본은 준비 완료 — 게이트를 보는 테스트만 바꾼다 */
const walletGate = vi.hoisted(() => ({ ready: true, addressUnavailable: false }))
const payment = vi.hoisted(() => ({
  start: vi.fn(),
  report: vi.fn(),
  abandon: vi.fn(),
  refetchStatus: vi.fn(),
}))
const invalidatePayment = vi.hoisted(() => vi.fn())
const chain = vi.hoisted(() => ({
  timedOut: false,
  jobId: null as string | null,
  options: undefined as
    | {
        onConfirmed?: (job: Record<string, unknown>) => void
        onFailed?: (job: Record<string, unknown>) => void
      }
    | undefined,
}))
const orderQuery = vi.hoisted(() => ({
  result: {} as Record<string, unknown>,
}))
const paymentStatusQuery = vi.hoisted(() => ({
  result: {} as Record<string, unknown>,
}))
const walletQuery = vi.hoisted(() => ({
  result: {} as Record<string, unknown>,
}))

vi.mock('@/shared/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/config')>()),
  isDemo: false,
  isDev: false,
}))
vi.mock('@/shared/blockchain/useWeb3Auth', () => ({
  useWeb3Auth: () => ({ adapter }),
}))
vi.mock('@/shared/blockchain/useWalletReady', () => ({
  useWalletReady: () => walletGate,
}))
vi.mock('@/shared/queries/payment', () => ({
  usePaymentStatus: () => paymentStatusQuery.result,
  useStartPayment: () => ({ mutateAsync: payment.start }),
  useReportPaymentSignedTx: () => ({ mutateAsync: payment.report }),
  useAbandonPaymentSignature: () => ({ mutateAsync: payment.abandon }),
  useInvalidateOnPaymentConfirmed: () => invalidatePayment,
}))
vi.mock('@/shared/queries/order', () => ({
  useOrderDetail: () => orderQuery.result,
}))
vi.mock('@/shared/queries/performance', () => ({ usePerformanceDetail: () => ({ data: undefined }) }))
vi.mock('@/shared/queries/wallet', () => ({
  useMyWallet: () => walletQuery.result,
  // 페이지가 지갑 미등록(404) 분기에 이 상수를 쓴다. 실제 코드 문자열과 같아야
  // `/onboarding/wallet` 이동 테스트가 진짜 분기를 지나간다
  WalletCode: { NOT_FOUND: 'WALLET_NOT_FOUND' },
}))
vi.mock('@/shared/queries/chain', () => ({
  useChainJob: (_jobId: string | null, options: typeof chain.options) => {
    chain.jobId = _jobId
    chain.options = options
    return { isPolling: Boolean(_jobId), timedOut: chain.timedOut }
  },
}))

const PURCHASE = {
  kind: 'PURCHASE' as const,
  required: true,
  txType: 'FEE_DELEGATED_SMART_CONTRACT_EXECUTION' as const,
  to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  data: '0x1234',
  value: '0x0' as const,
  chainId: '0x3e9' as const,
  gas: '0x11170',
  feePayer: '0x1234567890abcdef1234567890abcdef12345678',
  summary: { orderId: 5501 },
}

const APPROVE = {
  ...PURCHASE,
  kind: 'APPROVE' as const,
  data: '0xapprove',
}

function groupedStatus(payments: Record<string, unknown>[], extra: Record<string, unknown> = {}) {
  return {
    orderGroupId: 5501,
    groupStatus: 'PENDING_PAYMENT',
    payments,
    paidCount: 0,
    totalCount: payments.length,
    amount: 88_000,
    walletBalance: 100_000,
    signRequests: null,
    ...extra,
  }
}

function childPayment(paymentStatus: string, purchaseJobId?: string) {
  return [{ orderId: 5501, paymentStatus, purchaseJobId, amount: 88_000 }]
}

function groupedOrder() {
  orderQuery.result.data = {
    orderGroupId: 5501,
    groupStatus: 'PENDING_PAYMENT',
    performanceId: 12,
    performanceTitle: 'Live show',
    venueName: 'Stage Hall',
    totalAmount: 88_000,
    orders: [5501, 5502].map((orderId, index) => ({
      orderId,
      status: 'PENDING_PAYMENT',
      chosenTeamName: index ? 'Team Moon' : 'Team Orbit',
      amount: 44_000,
      items: [{ ticketTypeId: 1, name: 'Standing A', quantity: 1, amount: 44_000 }],
    })),
  }
}

it('그룹 결제는 각 PURCHASE를 직렬 확정하고 마지막에도 그룹 PAID를 확인한다', async () => {
  groupedOrder()
  const first = { ...PURCHASE, summary: { orderId: 5501 } }
  const second = { ...PURCHASE, summary: { orderId: 5502 } }
  const payments = [5501, 5502].map((orderId) => ({
    orderId,
    paymentStatus: 'AWAITING_SIGNATURE',
    amount: 44_000,
  }))
  paymentStatusQuery.result.data = groupedStatus(payments, {
    signRequests: [APPROVE, first, second],
  })
  mount()
  fireEvent.click(screen.getAllByRole('button', { name: /결제하기/ })[0])
  await waitFor(() => expect(adapter.signTransaction).toHaveBeenCalledTimes(1))
  act(() => chain.options?.onConfirmed?.({ jobId: 'job-purchase', status: 'CONFIRMED' }))
  await waitFor(() => expect(adapter.signTransaction).toHaveBeenCalledTimes(2))
  expect(payment.report.mock.calls[1][0]).toMatchObject({
    orderId: 5501,
    childOrderId: 5501,
    kind: 'PURCHASE',
  })
  expect(screen.getByLabelText('current route')).toHaveTextContent('/payment')
  act(() => chain.options?.onConfirmed?.({ jobId: 'job-purchase', status: 'CONFIRMED' }))
  await waitFor(() => expect(adapter.signTransaction).toHaveBeenCalledTimes(3))
  expect(payment.report.mock.calls[2][0]).toMatchObject({
    orderId: 5501,
    childOrderId: 5502,
    kind: 'PURCHASE',
  })
  act(() => chain.options?.onConfirmed?.({ jobId: 'job-purchase', status: 'CONFIRMED' }))
  await waitFor(() => expect(payment.refetchStatus).toHaveBeenCalled())
  expect(screen.getByLabelText('current route')).toHaveTextContent('/payment')
})

it('부분 결제 복원은 payments[]의 PAYING job만 폴링하고 PAID 티켓을 다시 서명하지 않는다', async () => {
  groupedOrder()
  paymentStatusQuery.result.data = groupedStatus(
    [
      { orderId: 5501, paymentStatus: 'PAID', amount: 44_000, purchaseJobId: 'paid-child' },
      { orderId: 5502, paymentStatus: 'PAYING', amount: 44_000, purchaseJobId: 'pending-child' },
    ],
    { groupStatus: 'PARTIALLY_PAID', paidCount: 1, pollAfterMs: 1500 },
  )
  mount()
  await waitFor(() => expect(chain.jobId).toBe('pending-child'))
  expect(adapter.signTransaction).not.toHaveBeenCalled()
  expect(payment.start).not.toHaveBeenCalled()
  expect(screen.getByLabelText('current route')).toHaveTextContent('/payment')
})

it('부분 결제 화면은 결제된 팀을 표시하고 남은 결제 금액과 구분한다', () => {
  groupedOrder()
  orderQuery.result.data = {
    ...(orderQuery.result.data as Record<string, unknown>),
    groupStatus: 'PARTIALLY_PAID',
    orders: [
      {
        orderId: 5501,
        // 결제 API가 먼저 확정되고 주문 상세 반영이 늦는 실제 폴링 구간을 재현한다.
        status: 'PENDING_PAYMENT',
        chosenTeamName: 'Team Orbit',
        amount: 44_000,
        items: [{ ticketTypeId: 1, name: 'Standing A', quantity: 1, amount: 44_000 }],
      },
      {
        orderId: 5502,
        status: 'PENDING_PAYMENT',
        chosenTeamName: 'Team Moon',
        amount: 44_000,
        items: [{ ticketTypeId: 1, name: 'Standing A', quantity: 1, amount: 44_000 }],
      },
    ],
  }
  paymentStatusQuery.result.data = groupedStatus(
    [
      { orderId: 5501, paymentStatus: 'PAID', amount: 44_000 },
      { orderId: 5502, paymentStatus: 'FAILED', amount: 44_000 },
    ],
    { groupStatus: 'PARTIALLY_PAID', paidCount: 1 },
  )

  mount()

  const breakdown = screen.getByRole('list', { name: '팀별 결제 금액' })
  expect(within(breakdown).getByText(/Team Orbit.*결제 완료/)).toBeVisible()
  expect(within(breakdown).getByText(/Team Moon/)).not.toHaveTextContent('결제 완료')
  expect(screen.getByText('남은 결제 금액')).toBeVisible()
  expect(screen.getByText(/2장 중 1장 결제됨/)).toBeVisible()
  expect(screen.getAllByText('44,000 YoYo').length).toBeGreaterThan(0)
})

it('취소된 하위 주문은 결제 화면의 티켓 수와 남은 금액에서 제외한다', () => {
  groupedOrder()
  orderQuery.result.data = {
    ...(orderQuery.result.data as Record<string, unknown>),
    groupStatus: 'PARTIALLY_PAID',
    orders: [
      {
        orderId: 5501,
        status: 'PAID',
        chosenTeamName: 'Team Orbit',
        amount: 44_000,
        items: [{ ticketTypeId: 1, name: 'Standing A', quantity: 1, amount: 44_000 }],
      },
      {
        orderId: 5502,
        status: 'CANCELLED',
        chosenTeamName: 'Team Moon',
        amount: 44_000,
        items: [{ ticketTypeId: 1, name: 'Standing A', quantity: 2, amount: 44_000 }],
      },
    ],
  }
  paymentStatusQuery.result.data = groupedStatus(
    [
      { orderId: 5501, paymentStatus: 'PAID', amount: 44_000 },
      { orderId: 5502, paymentStatus: 'FAILED', amount: 44_000 },
    ],
    { groupStatus: 'PARTIALLY_PAID', paidCount: 1, expiresAt: null },
  )

  mount()

  expect(screen.getByText('Standing A × 1')).toBeVisible()
  expect(screen.getByText('Team Orbit')).toBeVisible()
  expect(screen.queryByText(/Team Moon/)).not.toBeInTheDocument()
  expect(screen.queryByText(/3장 중 1장 결제됨/)).not.toBeInTheDocument()
  expect(screen.getByText('남은 결제 금액').nextElementSibling).toHaveTextContent(/(^|[^\d,])0 YoYo/)
})

it('PURCHASE에 하위 주문 식별자가 없으면 지갑 서명을 요청하지 않는다', async () => {
  groupedOrder()
  paymentStatusQuery.result.data = groupedStatus(
    [{ orderId: 5501, paymentStatus: 'AWAITING_SIGNATURE', amount: 44_000 }],
    { signRequests: [{ ...PURCHASE, summary: {} }] },
  )
  mount()
  fireEvent.click(screen.getAllByRole('button', { name: /결제하기/ })[0])
  await screen.findAllByText(/서명할 결제 요청|필요한 결제 서명/)
  expect(adapter.signTransaction).not.toHaveBeenCalled()
})

it('부분 실패 재시도는 새 prepare의 미결제 하위 주문만 서명한다', async () => {
  groupedOrder()
  const status = groupedStatus(
    [
      { orderId: 5501, paymentStatus: 'PAID', amount: 44_000, purchaseJobId: 'paid-child' },
      { orderId: 5502, paymentStatus: 'FAILED', amount: 44_000, purchaseJobId: 'failed-child' },
    ],
    { groupStatus: 'PARTIALLY_PAID', paidCount: 1 },
  )
  paymentStatusQuery.result.data = status
  orderQuery.result.refetch = vi.fn().mockResolvedValue({ data: orderQuery.result.data })
  const unpaid = { ...PURCHASE, summary: { orderId: 5502 } }
  payment.start.mockResolvedValue({
    payments: [{ orderId: 5502, paymentStatus: 'AWAITING_SIGNATURE' }],
    signRequests: [{ ...APPROVE, required: false }, unpaid],
  })
  mount()
  fireEvent.click(screen.getByRole('button', { name: /다시 시도/ }))
  await waitFor(() => expect(adapter.signTransaction).toHaveBeenCalledWith(unpaid))
  expect(adapter.signTransaction).toHaveBeenCalledTimes(1)
  expect(payment.report.mock.calls[0][0]).toMatchObject({ orderId: 5501, childOrderId: 5502 })
})

it('일부 결제 후 만료된 그룹의 ALREADY_PAID를 전체 완료로 오인하지 않는다', async () => {
  groupedOrder()
  payment.start.mockRejectedValue(
    new ApiError({ code: 'PAYMENT_ALREADY_PAID', status: 409, msg: '' }),
  )
  payment.refetchStatus.mockResolvedValue({
    data: groupedStatus(
      [
        { orderId: 5501, paymentStatus: 'PAID', amount: 44_000 },
        { orderId: 5502, paymentStatus: 'FAILED', amount: 44_000 },
      ],
      { groupStatus: 'PARTIALLY_PAID', paidCount: 1, expiresAt: null },
    ),
  })
  mount()
  fireEvent.click(screen.getAllByRole('button', { name: /결제하기/ })[0])
  await waitFor(() => expect(payment.refetchStatus).toHaveBeenCalled())
  expect(screen.getByLabelText('current route')).toHaveTextContent('/payment')
  expect(invalidatePayment).not.toHaveBeenCalled()
})

it('만료된 서명 파라미터는 지갑에 넘기지 않는다', async () => {
  groupedOrder()
  paymentStatusQuery.result.data = groupedStatus(childPayment('AWAITING_SIGNATURE'), {
    signRequests: [PURCHASE],
    expiresAt: '2000-01-01T00:00:00Z',
  })
  mount()
  fireEvent.click(screen.getAllByRole('button', { name: /결제하기/ })[0])
  await screen.findByText(/결제 시간이 만료/)
  expect(adapter.signTransaction).not.toHaveBeenCalled()
})

it('확정 조회 제한에 닿으면 재조회 동작을 제공하고 서명을 재전송하지 않는다', async () => {
  paymentStatusQuery.result.data = groupedStatus(childPayment('PAYING', 'pending-child'))
  const view = mount()
  await waitFor(() => expect(chain.jobId).toBe('pending-child'))
  chain.timedOut = true
  view.rerender(
    <MemoryRouter initialEntries={['/orders/5501/payment']}>
      <Routes>
        <Route path="/orders/:orderId/payment" element={<PaymentPage />} />
      </Routes>
    </MemoryRouter>,
  )
  expect(await screen.findByRole('button', { name: /다시 시도/ })).toBeEnabled()
  expect(adapter.signTransaction).not.toHaveBeenCalled()
})

function LocationProbe() {
  const location = useLocation()
  return (
    <output aria-label="current route">
      {location.pathname}
      {location.search}
    </output>
  )
}

function mount(initialEntry = '/orders/5501/payment?from=12') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/" element={<div>home</div>} />
        <Route path="/orders/:orderId/payment" element={<PaymentPage />} />
        <Route path="/orders/:orderId/complete" element={<div>confirmed completion</div>} />
        <Route path="/performances/:performanceId" element={<div>performance detail</div>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('ko')
  vi.clearAllMocks()
  chain.jobId = null
  chain.timedOut = false
  chain.options = undefined
  walletGate.ready = true
  walletGate.addressUnavailable = false
  adapter.signTransaction.mockResolvedValue('0x31signed')
  payment.start.mockResolvedValue({
    payments: childPayment('AWAITING_SIGNATURE'),
    signRequests: [PURCHASE],
  })
  payment.report.mockImplementation(async ({ getSenderSignedRlp }) => {
    await getSenderSignedRlp()
    return { jobId: 'job-purchase', status: 'PENDING', pollAfterMs: 1000 }
  })
  payment.abandon.mockResolvedValue({ balanceKept: true })
  invalidatePayment.mockResolvedValue(undefined)
  payment.refetchStatus.mockImplementation(async () => ({ data: paymentStatusQuery.result.data }))
  paymentStatusQuery.result = {
    data: {
      payments: childPayment('REQUESTED'),
      groupStatus: 'PENDING_PAYMENT',
      amount: 88_000,
      walletBalance: 100_000,
      blockedReason: null,
      signRequests: null,
    },
    isLoading: false,
    isError: false,
    refetch: payment.refetchStatus,
  }
  orderQuery.result = {
    data: {
      orderGroupId: 5501,
      groupStatus: 'PENDING_PAYMENT',
      performanceId: 12,
      performanceTitle: 'Live show',
      venueName: 'Stage Hall',
      startAt: '2026-09-18T10:00:00Z',
      orders: [
        {
          orderId: 5501,
          status: 'PENDING_PAYMENT',
          chosenTeamName: 'Team Orbit',
          items: [{ ticketTypeId: 1, name: 'Standing A', quantity: 2, amount: 88_000 }],
          amount: 88_000,
        },
      ],
      totalAmount: 88_000,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }
  walletQuery.result = {
    data: { balance: { amount: 100_000, currency: 'KRW', display: null } },
    isLoading: false,
    isError: false,
  }
})

it('주문 상세 로딩 중에는 데모 금액과 결제 버튼을 노출하지 않는다', () => {
  orderQuery.result = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() }

  mount()

  expect(screen.getByText(/결제 정보를 불러오는 중입니다/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Pay/ })).not.toBeInTheDocument()
  expect(screen.queryByText('aespa')).not.toBeInTheDocument()
})

it('영어 선택 시 결제 로딩 문구에 한국어를 함께 표시하지 않는다', async () => {
  await i18n.changeLanguage('en')
  orderQuery.result = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() }

  mount()

  const loading = screen.getByText(/Loading payment/)
  expect(loading).toHaveTextContent('Loading payment')
  expect(loading).not.toHaveTextContent('결제 정보를 불러오는 중입니다')
})

it('PAYING 복원 중 주문 상세이 늦어져도 오류 대신 진행 상태를 유지한다', async () => {
  orderQuery.result = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() }
  paymentStatusQuery.result = {
    ...paymentStatusQuery.result,
    data: {
      ...(paymentStatusQuery.result.data as Record<string, unknown>),
      payments: childPayment('PAYING', 'job-restored-purchase'),
    },
  }

  mount()

  expect(screen.getByText(/결제 처리 중/)).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  await waitFor(() => expect(chain.jobId).toBe('job-restored-purchase'))
})

it('APPROVE 확정 대기 중 재진입하면 기존 job을 복원하고 다시 서명하지 않는다', async () => {
  paymentStatusQuery.result = {
    ...paymentStatusQuery.result,
    data: {
      ...(paymentStatusQuery.result.data as Record<string, unknown>),
      payments: childPayment('AWAITING_SIGNATURE'),
      approveJobId: 'job-restored-approve',
      signRequests: [APPROVE, PURCHASE],
    },
  }

  mount()

  await waitFor(() => expect(chain.jobId).toBe('job-restored-approve'))
  expect(adapter.signTransaction).not.toHaveBeenCalled()
  expect(payment.start).not.toHaveBeenCalled()

  act(() => {
    chain.options?.onConfirmed?.({ jobId: 'job-restored-approve', status: 'CONFIRMED' })
  })

  await waitFor(() => expect(adapter.signTransaction).toHaveBeenCalledWith(PURCHASE))
  expect(adapter.signTransaction).not.toHaveBeenCalledWith(APPROVE)
})

it('주문 상세 조회 실패 시 재시도 경계를 제공한다', async () => {
  const refetch = vi.fn().mockResolvedValue({ data: undefined })
  orderQuery.result = { data: undefined, isLoading: false, isError: true, refetch }

  mount()
  fireEvent.click(screen.getByRole('button', { name: /다시 시도/ }))

  await waitFor(() => expect(refetch).toHaveBeenCalledOnce())
  expect(screen.queryByRole('button', { name: /Pay/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /홈으로/ }))
  expect(screen.getByLabelText('current route')).toHaveTextContent('/')
})

it('영어 선택 시 결제 조회 오류 동작을 영어로만 표시한다', async () => {
  await i18n.changeLanguage('en')
  orderQuery.result = { data: undefined, isLoading: false, isError: true, refetch: vi.fn() }

  mount()

  const alert = screen.getByRole('alert')
  expect(alert).toHaveTextContent('Could not load payment details.')
  expect(alert).not.toHaveTextContent('결제 정보를 불러오지 못했습니다')
  expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Back to home' })).toBeVisible()
})

it('영어 선택 시 누락 데이터와 지갑 오류도 한국어 fallback을 노출하지 않는다', async () => {
  await i18n.changeLanguage('en')
  orderQuery.result = {
    ...orderQuery.result,
    data: {
      ...(orderQuery.result.data as Record<string, unknown>),
      performanceTitle: null,
      orders: [
        {
          orderId: 5501,
          chosenTeamName: null,
          items: [{ ticketTypeId: 1, name: null, quantity: 1, amount: 88_000 }],
        },
      ],
    },
  }
  adapter.signTransaction.mockRejectedValueOnce(new WalletError('UNKNOWN', '지갑 서명 실패'))

  mount()

  expect(screen.getAllByText('Show').length).toBeGreaterThan(0)
  expect(screen.getAllByText('Ticket').length).toBeGreaterThan(0)
  expect(screen.getAllByText('No team selected').length).toBeGreaterThan(0)
  fireEvent.click(screen.getAllByRole('button', { name: /Pay 88,000 YoYo/ })[0]!)
  expect(
    await screen.findByText(
      'The wallet could not complete the payment signature. Please try again.',
    ),
  ).toBeVisible()
  expect(screen.queryByText('지갑 서명 실패')).not.toBeInTheDocument()
})

it('지갑 세션이 없으면 결제 화면으로 돌아오는 로그인으로 보낸다', async () => {
  // 마운트 게이트가 상한까지 기다리고도 주소를 못 받았다 = 복원할 세션이 아예 없다.
  // 기다려도 오지 않으므로 "잠시 뒤 다시" 문구는 사용자를 그 자리에 가둔다 —
  // 할 수 있는 일은 재로그인뿐이다.
  walletGate.addressUnavailable = true
  adapter.signTransaction.mockRejectedValueOnce(
    new WalletError('NOT_CONNECTED', 'Web3Auth wallet is not connected.'),
  )

  mount()

  fireEvent.click(screen.getAllByRole('button', { name: /88,000 YoYo 결제하기/ })[0]!)

  await waitFor(() =>
    expect(screen.getByLabelText('current route')).toHaveTextContent(
      '/login?from=%2Forders%2F5501%2Fpayment%3Ffrom%3D12',
    ),
  )
})

it('복원 중인 지갑의 서명 실패는 로그인으로 쫓아내지 않고 문구만 남긴다', async () => {
  // 게이트가 아직 포기하지 않았다 = 세션이 붙는 중일 수 있다(D-77). 그 창의 실패까지
  // 로그인으로 보내면 멀쩡히 로그인된 사용자를 화면 밖으로 밀어낸다.
  adapter.signTransaction.mockRejectedValueOnce(
    new WalletError('NOT_CONNECTED', 'Web3Auth wallet is not connected.'),
  )

  mount()

  fireEvent.click(screen.getAllByRole('button', { name: /88,000 YoYo 결제하기/ })[0]!)

  expect(await screen.findByText(/소셜 지갑을 다시 연결해 주세요/)).toBeVisible()
  expect(screen.getByLabelText('current route')).toHaveTextContent('/orders/5501/payment')
})

it('prepare 전 결제 상태가 404여도 지갑 조회 잔액으로 결제를 시작할 수 있다', () => {
  paymentStatusQuery.result = {
    data: undefined,
    isLoading: false,
    isError: true,
    refetch: payment.refetchStatus,
  }

  mount()

  expect(screen.getAllByRole('button', { name: /88,000 YoYo 결제하기/ })[0]).toBeEnabled()
  expect(screen.getAllByText('100,000 YoYo').length).toBeGreaterThan(0)
  expect(screen.getAllByText('12,000 YoYo').length).toBeGreaterThan(0)
  expect(screen.queryByText('결제 정보를 불러오지 못했습니다.')).not.toBeInTheDocument()
})

it('결제 상태 잔액이 null이면 지갑 조회 잔액을 사용한다', () => {
  paymentStatusQuery.result = {
    ...(paymentStatusQuery.result as { data: Record<string, unknown> }),
    data: { ...(paymentStatusQuery.result.data as Record<string, unknown>), walletBalance: null },
  }

  mount()

  expect(screen.getAllByRole('button', { name: /88,000 YoYo 결제하기/ })[0]).toBeEnabled()
  expect(screen.getAllByText('100,000 YoYo').length).toBeGreaterThan(0)
  expect(screen.getAllByText('12,000 YoYo').length).toBeGreaterThan(0)
  expect(screen.queryByText('0 YoYo')).not.toBeInTheDocument()
})

it('결제 상태와 지갑 조회 잔액이 모두 없으면 0원으로 오인하지 않는다', () => {
  paymentStatusQuery.result = {
    ...(paymentStatusQuery.result as { data: Record<string, unknown> }),
    data: { ...(paymentStatusQuery.result.data as Record<string, unknown>), walletBalance: null },
  }
  walletQuery.result = { ...walletQuery.result, data: { balance: null } }

  mount()

  expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  expect(screen.queryByText('0 YoYo')).not.toBeInTheDocument()
})

it('캐시 데이터가 남은 refetch 실패는 결제 화면을 가리지 않는다', () => {
  paymentStatusQuery.result = { ...paymentStatusQuery.result, isError: true }

  mount()

  expect(screen.getAllByRole('button', { name: /88,000 YoYo 결제하기/ })[0]).toBeEnabled()
  expect(screen.queryByText('결제 정보를 불러오지 못했습니다.')).not.toBeInTheDocument()
})

it('공연으로 돌아갈 때 데모 파라미터보다 실제 주문의 공연 ID를 우선한다', async () => {
  orderQuery.result = {
    ...(orderQuery.result as { data: Record<string, unknown> }),
    data: { ...(orderQuery.result.data as Record<string, unknown>), performanceId: 7 },
  }

  mount()
  fireEvent.click(screen.getAllByRole('button', { name: /88,000 YoYo 결제하기/ })[0]!)

  await waitFor(() => expect(payment.start).toHaveBeenCalledOnce())
  act(() => {
    chain.options?.onFailed?.({ jobId: 'job-purchase', status: 'FAILED' })
  })
  fireEvent.click(await screen.findByRole('button', { name: '공연으로 돌아가기' }))

  expect(screen.getByLabelText('current route')).toHaveTextContent('/performances/7')
})

it('실제 공연 ID가 없으면 URL의 from을 신뢰하지 않고 홈 탈출구를 제공한다', async () => {
  orderQuery.result = {
    ...orderQuery.result,
    data: { ...(orderQuery.result.data as Record<string, unknown>), performanceId: undefined },
  }

  mount('/orders/5501/payment?from=99')
  fireEvent.click(screen.getAllByRole('button', { name: /88,000 YoYo 결제하기/ })[0]!)

  await waitFor(() => expect(payment.start).toHaveBeenCalledOnce())
  act(() => {
    chain.options?.onFailed?.({ jobId: 'job-purchase', status: 'FAILED' })
  })

  expect(screen.queryByRole('button', { name: '공연으로 돌아가기' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '홈으로 돌아가기' }))
  expect(screen.getByLabelText('current route')).toHaveTextContent('/')
})

it('실패한 결제를 다시 시도하면 같은 FAILED 조회 결과에 막히지 않고 새 결제를 시작한다', async () => {
  const pendingOrder = {
    ...(orderQuery.result.data as Record<string, unknown>),
    status: 'PENDING_PAYMENT',
  }
  orderQuery.result = {
    ...orderQuery.result,
    data: pendingOrder,
    refetch: vi.fn().mockResolvedValue({ data: pendingOrder }),
  }
  paymentStatusQuery.result = {
    ...paymentStatusQuery.result,
    data: {
      ...(paymentStatusQuery.result.data as Record<string, unknown>),
      payments: childPayment('FAILED', 'job-failed-purchase'),
    },
  }
  payment.refetchStatus.mockResolvedValue({ data: paymentStatusQuery.result.data })

  mount()
  fireEvent.click(await screen.findByRole('button', { name: /다시 시도/ }))

  await waitFor(() => expect(payment.start).toHaveBeenCalledOnce())
  expect(adapter.signTransaction).toHaveBeenCalledOnce()
  expect(payment.report).toHaveBeenCalledOnce()
})

it('재시도 재조회에서 PAYING이면 기존 purchase job을 복원하고 새 결제를 시작하지 않는다', async () => {
  const pendingOrder = {
    ...(orderQuery.result.data as Record<string, unknown>),
    status: 'PENDING_PAYMENT',
  }
  orderQuery.result = {
    ...orderQuery.result,
    data: pendingOrder,
    refetch: vi.fn().mockResolvedValue({ data: pendingOrder }),
  }
  paymentStatusQuery.result = {
    ...paymentStatusQuery.result,
    data: {
      ...(paymentStatusQuery.result.data as Record<string, unknown>),
      payments: childPayment('FAILED'),
    },
  }
  payment.refetchStatus.mockResolvedValue({
    data: {
      ...(paymentStatusQuery.result.data as Record<string, unknown>),
      payments: childPayment('PAYING', 'job-in-flight-purchase'),
    },
  })

  mount()
  fireEvent.click(await screen.findByRole('button', { name: /다시 시도/ }))

  await waitFor(() => expect(chain.jobId).toBe('job-in-flight-purchase'))
  expect(payment.start).not.toHaveBeenCalled()
  expect(adapter.signTransaction).not.toHaveBeenCalled()
})

it('재시도 refetch가 캐시 데이터와 오류를 함께 반환해도 새 결제를 시작하지 않는다', async () => {
  const pendingOrder = {
    ...(orderQuery.result.data as Record<string, unknown>),
    status: 'PENDING_PAYMENT',
  }
  orderQuery.result = {
    ...orderQuery.result,
    data: pendingOrder,
    refetch: vi.fn().mockResolvedValue({ data: pendingOrder }),
  }
  paymentStatusQuery.result = {
    ...paymentStatusQuery.result,
    data: {
      ...(paymentStatusQuery.result.data as Record<string, unknown>),
      payments: childPayment('FAILED'),
    },
  }
  payment.refetchStatus.mockResolvedValue({
    data: paymentStatusQuery.result.data,
    isError: true,
    error: new Error('network unavailable'),
  })

  mount()
  fireEvent.click(await screen.findByRole('button', { name: /다시 시도/ }))

  expect(
    await screen.findByText('결제를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.'),
  ).toBeVisible()
  expect(screen.queryByRole('button', { name: /결제하기/ })).not.toBeInTheDocument()
  expect(payment.start).not.toHaveBeenCalled()
})

it('실패한 APPROVE 작업을 재시도하면 같은 job을 복원하지 않고 다시 서명한다', async () => {
  const pendingOrder = {
    ...(orderQuery.result.data as Record<string, unknown>),
    status: 'PENDING_PAYMENT',
  }
  const awaitingApprove = {
    ...(paymentStatusQuery.result.data as Record<string, unknown>),
    payments: childPayment('AWAITING_SIGNATURE'),
    approveJobId: 'job-failed-approve',
    signRequests: [APPROVE, PURCHASE],
  }
  orderQuery.result = {
    ...orderQuery.result,
    data: pendingOrder,
    refetch: vi.fn().mockResolvedValue({ data: pendingOrder }),
  }
  paymentStatusQuery.result = { ...paymentStatusQuery.result, data: awaitingApprove }
  payment.refetchStatus.mockResolvedValue({ data: awaitingApprove })
  payment.start.mockResolvedValue({
    payments: childPayment('AWAITING_SIGNATURE'),
    signRequests: [APPROVE, PURCHASE],
  })
  payment.report.mockImplementationOnce(async ({ getSenderSignedRlp }) => {
    await getSenderSignedRlp()
    return { jobId: 'job-retried-approve', status: 'PENDING', pollAfterMs: 1000 }
  })

  mount()
  await waitFor(() => expect(chain.jobId).toBe('job-failed-approve'))

  act(() => {
    chain.options?.onFailed?.({
      jobId: 'job-failed-approve',
      status: 'FAILED',
      failureReason: 'approve reverted',
    })
  })
  fireEvent.click(await screen.findByRole('button', { name: /다시 시도/ }))

  await waitFor(() => expect(adapter.signTransaction).toHaveBeenCalledWith(APPROVE))
  expect(payment.report).toHaveBeenCalledOnce()
  await waitFor(() => expect(chain.jobId).toBe('job-retried-approve'))
})

it('체인 작업 실패 뒤 재시도는 이전 prepare와 다른 멱등키를 사용한다', async () => {
  const pendingOrder = {
    ...(orderQuery.result.data as Record<string, unknown>),
    status: 'PENDING_PAYMENT',
  }
  orderQuery.result = {
    ...orderQuery.result,
    data: pendingOrder,
    refetch: vi.fn().mockResolvedValue({ data: pendingOrder }),
  }

  mount()
  fireEvent.click(screen.getAllByRole('button', { name: /88,000 YoYo 결제하기/ })[0]!)
  await waitFor(() => expect(payment.start).toHaveBeenCalledOnce())
  const firstKey = payment.start.mock.calls[0]?.[0].idempotencyKey

  act(() => {
    chain.options?.onFailed?.({
      jobId: 'job-purchase',
      status: 'FAILED',
      failureReason: 'receipt reverted',
    })
  })
  const failedStatus = {
    ...(paymentStatusQuery.result.data as Record<string, unknown>),
    payments: childPayment('FAILED', 'job-purchase'),
  }
  paymentStatusQuery.result = { ...paymentStatusQuery.result, data: failedStatus }
  payment.refetchStatus.mockResolvedValue({ data: failedStatus })

  fireEvent.click(await screen.findByRole('button', { name: /다시 시도/ }))

  await waitFor(() => expect(payment.start).toHaveBeenCalledTimes(2))
  expect(payment.start.mock.calls[1]?.[0].idempotencyKey).not.toBe(firstKey)
})

it('잔액 부족 응답은 데모 fixture가 아니라 실제 결제 상태 금액으로 계산한다', async () => {
  payment.start.mockRejectedValue(
    new ApiError({ code: 'PAYMENT_INSUFFICIENT_BALANCE', status: 409, msg: 'insufficient' }),
  )
  payment.refetchStatus.mockResolvedValueOnce({
    data: {
      ...(paymentStatusQuery.result.data as Record<string, unknown>),
      amount: 95_000,
      walletBalance: 1_000,
      shortfall: 94_000,
      blockedReason: 'INSUFFICIENT_BALANCE',
    },
  })

  mount()
  fireEvent.click(screen.getAllByRole('button', { name: /88,000 YoYo 결제하기/ })[0]!)

  const insufficient = await screen.findByRole('alert')
  expect(insufficient).toHaveTextContent('추가로 필요한 금액: 94,000 YoYo')
  expect(insufficient).not.toHaveTextContent(/(^|[^\d,])0 YoYo/)
})

it('전용 잔액 부족 코드는 재조회 shortfall이 0이어도 부족 상태를 유지한다', async () => {
  payment.start.mockRejectedValue(
    new ApiError({ code: 'PAYMENT_INSUFFICIENT_BALANCE', status: 409, msg: 'conflict' }),
  )
  payment.refetchStatus.mockResolvedValueOnce({
    data: {
      ...(paymentStatusQuery.result.data as Record<string, unknown>),
      shortfall: 0,
      blockedReason: null,
    },
  })

  mount()
  fireEvent.click(screen.getAllByRole('button', { name: /88,000 YoYo 결제하기/ })[0]!)

  await waitFor(() => expect(payment.refetchStatus).toHaveBeenCalledOnce())
  expect(screen.getByText(/잔액이 부족해요/)).toBeVisible()
  expect(screen.getByText(/부족한 금액을 확인할 수 없습니다/)).toBeVisible()
})

it('COMMON_CONFLICT 뒤 결제 상태 재조회가 네트워크 실패면 잔액 부족으로 단정하지 않는다', async () => {
  payment.start.mockRejectedValue(
    new ApiError({ code: 'COMMON_CONFLICT', status: 409, msg: 'insufficient' }),
  )
  payment.refetchStatus.mockResolvedValueOnce({
    data: undefined,
    isError: true,
    error: new Error('network unavailable'),
  })
  const pendingOrder = {
    ...(orderQuery.result.data as Record<string, unknown>),
    status: 'PENDING_PAYMENT',
  }
  orderQuery.result = {
    ...orderQuery.result,
    data: pendingOrder,
    refetch: vi.fn().mockResolvedValue({ data: pendingOrder }),
  }

  mount()
  fireEvent.click(screen.getAllByRole('button', { name: /88,000 YoYo 결제하기/ })[0]!)

  expect(await screen.findByText(/결제 상태가 바뀌었습니다/)).toBeVisible()
  expect(screen.queryByText(/잔액 부족/)).not.toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /잔액 보기/ })[0]).toBeEnabled()
})

it('전용 잔액 부족 코드 뒤 결제 상태가 404여도 잔액 보기 경로를 유지한다', async () => {
  payment.start.mockRejectedValue(
    new ApiError({ code: 'PAYMENT_INSUFFICIENT_BALANCE', status: 409, msg: 'insufficient' }),
  )
  payment.refetchStatus.mockResolvedValueOnce({
    data: undefined,
    isError: true,
    error: new ApiError({ code: 'COMMON_NOT_FOUND', status: 404, msg: 'not found' }),
  })

  mount()
  fireEvent.click(screen.getAllByRole('button', { name: /88,000 YoYo 결제하기/ })[0]!)

  expect(await screen.findByText(/부족한 금액을 확인할 수 없습니다/)).toBeVisible()
  expect(screen.getAllByRole('button', { name: /잔액 보기/ })[0]).toBeEnabled()
})

it('이미 결제된 응답이면 실패 화면 대신 완료 화면으로 이동한다', async () => {
  payment.start.mockRejectedValue(
    new ApiError({ code: 'PAYMENT_ALREADY_PAID', status: 409, msg: 'already paid' }),
  )
  payment.refetchStatus.mockResolvedValue({
    data: { groupStatus: 'PAID', payments: childPayment('PAID') },
  })

  mount()
  fireEvent.click(screen.getAllByRole('button', { name: /88,000 YoYo 결제하기/ })[0]!)

  expect(await screen.findByText('confirmed completion')).toBeVisible()
  expect(invalidatePayment).toHaveBeenCalledWith({ orderId: 5501, kind: 'PURCHASE' })
  expect(screen.queryByText('already paid')).not.toBeInTheDocument()
})

it('결제 충돌 분류를 재조회하는 동안 Pay를 다시 눌러도 prepare를 병렬 실행하지 않는다', async () => {
  let resolveStatus!: (value: { data: undefined; isError: true; error: Error }) => void
  const pendingStatus = new Promise<{
    data: undefined
    isError: true
    error: Error
  }>((resolve) => {
    resolveStatus = resolve
  })
  payment.start.mockRejectedValue(
    new ApiError({ code: 'COMMON_CONFLICT', status: 409, msg: 'conflict' }),
  )
  payment.refetchStatus.mockReturnValueOnce(pendingStatus)

  mount()
  const pay = screen.getAllByRole('button', { name: /88,000 YoYo 결제하기/ })[0]!
  fireEvent.click(pay)
  await waitFor(() => expect(payment.refetchStatus).toHaveBeenCalledOnce())
  fireEvent.click(pay)

  expect(payment.start).toHaveBeenCalledOnce()
  resolveStatus({ data: undefined, isError: true, error: new Error('network unavailable') })
  expect(await screen.findByText(/결제 상태가 바뀌었습니다/)).toBeVisible()
})

it('실패 재조회 중 Try again을 연속 클릭해도 복구 흐름을 한 번만 실행한다', async () => {
  mount()
  fireEvent.click(screen.getAllByRole('button', { name: /88,000 YoYo 결제하기/ })[0]!)
  await waitFor(() => expect(payment.start).toHaveBeenCalledOnce())
  act(() => {
    chain.options?.onFailed?.({ jobId: 'job-purchase', status: 'FAILED' })
  })

  let resolveOrder!: (value: { data: Record<string, unknown> }) => void
  const pendingOrder = new Promise<{ data: Record<string, unknown> }>((resolve) => {
    resolveOrder = resolve
  })
  const refetchOrder = vi.fn().mockReturnValue(pendingOrder)
  // 객체를 새로 만들면 안 된다 — `retry`는 useCallback 이라 마지막 렌더의 `orderDetail`을 들고 있고,
  // 위 act(onFailed) 뒤로는 리렌더가 없어 교체한 객체를 보지 못한다(→ 옛 refetch 가 불려 0회).
  // 같은 객체의 속성을 바꿔야 클로저가 잡은 참조로 spy 가 들어간다. `payment.refetchStatus`가
  // 통과하는 이유와 같다 — 그쪽은 hoisted spy 하나를 변형한다
  orderQuery.result.refetch = refetchOrder
  let resolveStatus!: (value: { data: Record<string, unknown> }) => void
  const pendingStatus = new Promise<{ data: Record<string, unknown> }>((resolve) => {
    resolveStatus = resolve
  })
  payment.refetchStatus.mockReturnValueOnce(pendingStatus)

  const retryButtons = screen.getAllByRole('button', { name: /다시 시도/ })
  fireEvent.click(retryButtons[0]!)
  fireEvent.click(retryButtons[0]!)

  expect(refetchOrder).toHaveBeenCalledOnce()
  expect(payment.refetchStatus).toHaveBeenCalledOnce()
  resolveOrder({
    data: { ...(orderQuery.result.data as Record<string, unknown>), groupStatus: 'CANCELLED' },
  })
  resolveStatus({ data: paymentStatusQuery.result.data as Record<string, unknown> })
  expect(await screen.findByText('결제 시간이 만료됐습니다. 잔액은 그대로예요.')).toBeVisible()
})

it('지갑 미등록 응답이면 잔액 화면이 아니라 지갑 온보딩으로 이동한다', async () => {
  payment.start.mockRejectedValue(
    new ApiError({ code: 'WALLET_NOT_FOUND', status: 404, msg: 'wallet not found' }),
  )

  mount()
  fireEvent.click(screen.getAllByRole('button', { name: /88,000 YoYo 결제하기/ })[0]!)

  await waitFor(() =>
    expect(screen.getByLabelText('current route')).toHaveTextContent('/onboarding/wallet'),
  )
  expect(screen.queryByText(/Payment failed/)).not.toBeInTheDocument()
})

it('판매 종료 응답이면 결제 실패 화면 대신 공연 목록으로 이동한다', async () => {
  payment.start.mockRejectedValue(
    new ApiError({ code: 'TICKET_SALE_CLOSED', status: 409, msg: 'sale closed' }),
  )

  mount()
  fireEvent.click(screen.getAllByRole('button', { name: /88,000 YoYo 결제하기/ })[0]!)

  expect(await screen.findByText('home')).toBeVisible()
  expect(screen.getByLabelText('current route')).toHaveTextContent('/')
})

it('실제 백엔드의 COMMON_CONFLICT + payment 404 조합을 잔액 부족으로 안내한다', async () => {
  paymentStatusQuery.result = {
    data: undefined,
    isLoading: false,
    isError: true,
    refetch: payment.refetchStatus,
  }
  payment.start.mockRejectedValue(
    new ApiError({
      code: 'COMMON_CONFLICT',
      status: 409,
      msg: 'Insufficient balance · 3,000 YoYo short.',
    }),
  )
  payment.refetchStatus.mockResolvedValueOnce({
    data: undefined,
    isError: true,
    error: new ApiError({ code: 'COMMON_NOT_FOUND', status: 404, msg: 'not found' }),
  })
  const pendingOrder = {
    ...(orderQuery.result.data as Record<string, unknown>),
    status: 'PENDING_PAYMENT',
  }
  orderQuery.result = {
    ...orderQuery.result,
    data: pendingOrder,
    refetch: vi.fn().mockResolvedValue({ data: pendingOrder }),
  }

  mount()
  fireEvent.click(screen.getAllByRole('button', { name: /88,000 YoYo 결제하기/ })[0]!)

  expect(await screen.findByText(/결제 상태가 바뀌었습니다/)).toBeVisible()
  expect(screen.queryByText(/Insufficient balance/)).not.toBeInTheDocument()
  expect(screen.queryByText(/부족한 금액을 확인할 수 없습니다/)).not.toBeInTheDocument()
  expect(screen.queryByText(/결제를 완료하지 못했어요/)).not.toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /잔액 보기/ })[0]).toBeEnabled()
})

it('재조회가 실패해도 캐시에 부족액이 있으면 그 값을 유지한다', async () => {
  payment.start.mockRejectedValue(
    new ApiError({ code: 'COMMON_CONFLICT', status: 409, msg: 'insufficient' }),
  )
  payment.refetchStatus.mockResolvedValueOnce({
    data: {
      ...(paymentStatusQuery.result.data as Record<string, unknown>),
      shortfall: 15_000,
      blockedReason: 'INSUFFICIENT_BALANCE',
    },
    isError: true,
  })

  mount()
  fireEvent.click(screen.getAllByRole('button', { name: /88,000 YoYo 결제하기/ })[0]!)

  expect(await screen.findByRole('alert')).toHaveTextContent('추가로 필요한 금액: 15,000 YoYo')
})

it('COMMON_CONFLICT의 부족액만으로는 잔액 부족을 확정하지 않는다', async () => {
  payment.start.mockRejectedValue(
    new ApiError({ code: 'COMMON_CONFLICT', status: 409, msg: 'order expired' }),
  )
  payment.refetchStatus.mockResolvedValueOnce({
    data: {
      ...(paymentStatusQuery.result.data as Record<string, unknown>),
      shortfall: 15_000,
      blockedReason: null,
    },
  })

  mount()
  fireEvent.click(screen.getAllByRole('button', { name: /88,000 YoYo 결제하기/ })[0]!)

  expect(await screen.findByText(/결제 상태가 바뀌었습니다/)).toBeVisible()
  expect(screen.queryByText(/잔액 부족/)).not.toBeInTheDocument()
})

it('COMMON_CONFLICT 재조회가 서명 대기 상태면 기존 서명 요청을 이어간다', async () => {
  payment.start.mockRejectedValue(
    new ApiError({ code: 'COMMON_CONFLICT', status: 409, msg: 'payment already awaits signature' }),
  )
  payment.refetchStatus.mockResolvedValueOnce({
    data: {
      ...(paymentStatusQuery.result.data as Record<string, unknown>),
      payments: childPayment('AWAITING_SIGNATURE'),
      signRequests: [PURCHASE],
    },
  })

  mount()
  fireEvent.click(screen.getAllByRole('button', { name: /88,000 YoYo 결제하기/ })[0]!)

  await waitFor(() => expect(adapter.signTransaction).toHaveBeenCalledWith(PURCHASE))
  expect(payment.report).toHaveBeenCalledOnce()
  expect(screen.queryByText('payment already awaits signature')).not.toBeInTheDocument()
})

it('취소된 주문은 Pay 요청을 보내지 않고 차단한다', async () => {
  orderQuery.result = {
    ...orderQuery.result,
    data: { ...(orderQuery.result.data as Record<string, unknown>), groupStatus: 'CANCELLED' },
  }

  mount()

  expect(await screen.findByText('결제 시간이 만료됐습니다. 잔액은 그대로예요.')).toBeVisible()
  expect(payment.start).not.toHaveBeenCalled()
})

it('취소된 주문에서 다시 시도해도 결제 버튼을 되살리지 않는다', async () => {
  const cancelledOrder = {
    ...(orderQuery.result.data as Record<string, unknown>),
    groupStatus: 'CANCELLED',
  }
  const refetch = vi.fn().mockResolvedValue({ data: cancelledOrder })
  orderQuery.result = { ...orderQuery.result, data: cancelledOrder, refetch }

  mount()
  fireEvent.click(await screen.findByRole('button', { name: /다시 시도/ }))

  await waitFor(() => expect(refetch).toHaveBeenCalledOnce())
  expect(screen.getByText('결제 시간이 만료됐습니다. 잔액은 그대로예요.')).toBeVisible()
  expect(screen.queryByRole('button', { name: /88,000 YoYo 결제하기/ })).not.toBeInTheDocument()
  expect(payment.start).not.toHaveBeenCalled()
})

it('주문 재조회 중에는 이전 오류 대신 로딩 피드백을 보여준다', () => {
  orderQuery.result = {
    data: undefined,
    isLoading: false,
    isFetching: true,
    isError: true,
    refetch: vi.fn(),
  }

  mount()

  expect(screen.getByText(/결제 정보를 불러오는 중입니다/)).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('잔액 부족 상태인데 부족액이 없으면 잔액 보기 경로를 유지한다', () => {
  paymentStatusQuery.result = {
    ...paymentStatusQuery.result,
    data: {
      ...(paymentStatusQuery.result.data as Record<string, unknown>),
      blockedReason: 'INSUFFICIENT_BALANCE',
      shortfall: null,
    },
  }

  mount()

  expect(screen.getByText(/부족한 금액을 확인할 수 없습니다/)).toBeVisible()
  expect(screen.getAllByRole('button', { name: /잔액 보기/ })[0]).toBeEnabled()
})

it('prepares, signs, reports, and waits for the purchase job before completing', async () => {
  mount()

  fireEvent.click(screen.getAllByRole('button', { name: /88,000 YoYo 결제하기/ })[0])

  await waitFor(() => expect(payment.start).toHaveBeenCalledOnce())
  expect(adapter.signTransaction).toHaveBeenCalledWith(PURCHASE)
  expect(payment.report).toHaveBeenCalledWith(
    expect.objectContaining({ orderId: 5501, kind: 'PURCHASE' }),
  )
  expect(screen.getByText('요청을 확인하고 있어요')).toBeVisible()
  expect(screen.getByLabelText('current route')).toHaveTextContent('/orders/5501/payment?from=12')

  payment.refetchStatus.mockResolvedValue({
    data: { groupStatus: 'PAID', payments: childPayment('PAID') },
  })
  await act(async () => {
    chain.options?.onConfirmed?.({ jobId: 'job-purchase', status: 'CONFIRMED' })
  })

  expect(invalidatePayment).toHaveBeenCalledWith({ orderId: 5501, kind: 'PURCHASE' })
  expect(await screen.findByText('confirmed completion')).toBeVisible()
  expect(screen.getByLabelText('current route')).toHaveTextContent('/orders/5501/complete?from=12')
})

it('reports a rejected wallet signature and returns to the review state', async () => {
  adapter.signTransaction.mockRejectedValue(new WalletError('USER_REJECTED', 'rejected'))
  mount()

  fireEvent.click(screen.getAllByRole('button', { name: /88,000 YoYo 결제하기/ })[0])

  await waitFor(() =>
    expect(payment.abandon).toHaveBeenCalledWith({
      orderId: 5501,
      childOrderId: 5501,
      kind: 'PURCHASE',
    }),
  )
  expect(screen.getAllByRole('button', { name: /88,000 YoYo 결제하기/ })[0]).toBeEnabled()
  expect(screen.queryByText('Payment failed')).not.toBeInTheDocument()
})

it('복원한 결제 job 실패 사유를 주문 상세 지연 중에도 보존한다', async () => {
  orderQuery.result = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() }
  paymentStatusQuery.result = {
    ...paymentStatusQuery.result,
    data: {
      ...(paymentStatusQuery.result.data as Record<string, unknown>),
      payments: childPayment('PAYING', 'job-restored-purchase'),
    },
  }

  mount()
  await waitFor(() => expect(chain.jobId).toBe('job-restored-purchase'))
  act(() => {
    paymentStatusQuery.result = {
      ...paymentStatusQuery.result,
      data: {
        ...(paymentStatusQuery.result.data as Record<string, unknown>),
        payments: childPayment('FAILED'),
      },
    }
    chain.options?.onFailed?.({
      jobId: 'job-restored-purchase',
      status: 'FAILED',
      failureReason: 'receipt reverted',
    })
  })

  expect(screen.getByText('receipt reverted')).toBeVisible()
})
