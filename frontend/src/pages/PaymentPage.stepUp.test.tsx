/**
 * A-05 결제 전 본인 확인(패스키 step-up, API v7 §7.W · 화면 v8 A-05).
 *
 * - `stepUpRequired`가 없으면 본인 확인 단계가 **존재하지 않는다**(스위치 off = 기존 화면 그대로).
 * - true면 서명 직전에 등록/본인 확인 → 받은 토큰을 signed-tx 보고에 싣는다.
 * - 인증 창을 닫으면(NotAllowedError) 에러가 아니라 결제 전 화면으로 되돌린다.
 * - 내장 인증기가 없는 기기는 안내 문구와 함께 진행하지 않는다.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'

import { ApiError } from '@/shared/api/client'
import i18n from '@/shared/i18n'

import { PaymentPage } from './PaymentPage'

const adapter = vi.hoisted(() => ({ signTransaction: vi.fn() }))
const payment = vi.hoisted(() => ({
  start: vi.fn(),
  report: vi.fn(),
  abandon: vi.fn(),
  refetchStatus: vi.fn(),
}))
const chain = vi.hoisted(() => ({ options: undefined as unknown }))
const queries = vi.hoisted(() => ({
  order: {} as Record<string, unknown>,
  status: {} as Record<string, unknown>,
  wallet: {} as Record<string, unknown>,
}))
const passkey = vi.hoisted(() => ({
  supported: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
}))
const webauthnApi = vi.hoisted(() => ({
  registrationOptions: vi.fn(),
  register: vi.fn(),
  authenticationOptions: vi.fn(),
  authenticate: vi.fn(),
}))

vi.mock('@/shared/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/config')>()),
  isDemo: false,
  isDev: false,
}))
vi.mock('@/shared/blockchain/useWeb3Auth', () => ({ useWeb3Auth: () => ({ adapter }) }))
vi.mock('@/shared/blockchain/useWalletReady', () => ({
  useWalletReady: () => ({ ready: true, addressUnavailable: false }),
}))
vi.mock('@/shared/queries/payment', () => ({
  usePaymentStatus: () => queries.status,
  useStartPayment: () => ({ mutateAsync: payment.start }),
  useReportPaymentSignedTx: () => ({ mutateAsync: payment.report }),
  useAbandonPaymentSignature: () => ({ mutateAsync: payment.abandon }),
  useInvalidateOnPaymentConfirmed: () => vi.fn(),
}))
vi.mock('@/shared/queries/order', () => ({ useOrderDetail: () => queries.order }))
vi.mock('@/shared/queries/performance', () => ({ usePerformanceDetail: () => ({ data: undefined }) }))
vi.mock('@/shared/queries/wallet', () => ({
  useMyWallet: () => queries.wallet,
  WalletCode: { NOT_FOUND: 'WALLET_NOT_FOUND' },
}))
vi.mock('@/shared/queries/chain', () => ({
  useChainJob: (_jobId: string | null, options: unknown) => {
    chain.options = options
    return { isPolling: Boolean(_jobId), timedOut: false }
  },
}))
// 브라우저 WebAuthn 호출만 가짜로 둔다. 취소 판정(isPasskeyCancelled)은 실제 코드를 쓴다.
vi.mock('@/shared/auth/passkey', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/auth/passkey')>()),
  isPasskeySupported: passkey.supported,
  createPasskey: passkey.create,
  getPasskeyAssertion: passkey.get,
}))
vi.mock('@/shared/api/domains/webauthn', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api/domains/webauthn')>()),
  fetchRegistrationOptions: webauthnApi.registrationOptions,
  registerPasskey: webauthnApi.register,
  fetchAuthenticationOptions: webauthnApi.authenticationOptions,
  authenticatePasskey: webauthnApi.authenticate,
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

const AUTH_OPTIONS = {
  registered: true,
  challenge: 'Y2hhbGxlbmdl',
  rpId: 'localhost',
  allowCredentials: [{ type: 'public-key' as const, id: 'Y3JlZA' }],
  timeout: 60000,
  userVerification: 'required' as const,
}

function startResult(extra: Record<string, unknown> = {}) {
  return {
    orderGroupId: 5501,
    payments: [{ orderId: 5501, paymentStatus: 'AWAITING_SIGNATURE', amount: 88_000 }],
    signRequests: [PURCHASE],
    ...extra,
  }
}

function mount() {
  return render(
    <MemoryRouter initialEntries={['/orders/5501/payment?from=12']}>
      <Routes>
        <Route path="/orders/:orderId/payment" element={<PaymentPage />} />
        <Route path="/performances/:performanceId" element={<div>performance detail</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

function clickPay() {
  fireEvent.click(screen.getAllByRole('button', { name: /결제하기/ })[0])
}

beforeEach(async () => {
  await i18n.changeLanguage('ko')
  vi.clearAllMocks()
  adapter.signTransaction.mockResolvedValue('0x31signed')
  payment.start.mockResolvedValue(startResult())
  payment.report.mockImplementation(async ({ getSenderSignedRlp }) => {
    await getSenderSignedRlp()
    return { jobId: 'job-purchase', status: 'PENDING', pollAfterMs: 1000 }
  })
  payment.refetchStatus.mockImplementation(async () => ({ data: queries.status.data }))
  passkey.supported.mockResolvedValue(true)
  passkey.create.mockResolvedValue({
    credentialId: 'Y3JlZA',
    clientDataJSON: 'Y2Q',
    attestationObject: 'YW8',
  })
  passkey.get.mockResolvedValue({
    credentialId: 'Y3JlZA',
    clientDataJSON: 'Y2Q',
    authenticatorData: 'YWQ',
    signature: 'c2ln',
  })
  webauthnApi.authenticationOptions.mockResolvedValue(AUTH_OPTIONS)
  webauthnApi.registrationOptions.mockResolvedValue({ challenge: 'cmVn' })
  webauthnApi.register.mockResolvedValue({ credentialId: 'Y3JlZA', registered: true })
  webauthnApi.authenticate.mockResolvedValue({
    stepUpToken: 'tok-1',
    expiresAt: '2026-09-24T14:02:00+09:00',
  })
  queries.status = {
    data: {
      payments: [{ orderId: 5501, paymentStatus: 'REQUESTED', amount: 88_000 }],
      groupStatus: 'PENDING_PAYMENT',
      amount: 88_000,
      walletBalance: 100_000,
      signRequests: null,
    },
    isLoading: false,
    isError: false,
    refetch: payment.refetchStatus,
  }
  queries.order = {
    data: {
      orderGroupId: 5501,
      groupStatus: 'PENDING_PAYMENT',
      performanceId: 12,
      performanceTitle: 'Live show',
      venueName: 'Stage Hall',
      startAt: '2026-09-18T10:00:00Z',
      totalAmount: 88_000,
      orders: [
        {
          orderId: 5501,
          status: 'PENDING_PAYMENT',
          chosenTeamName: 'Team Orbit',
          amount: 88_000,
          items: [{ ticketTypeId: 1, name: 'Standing A', quantity: 2, amount: 88_000 }],
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }
  queries.wallet = {
    data: { balance: { amount: 100_000, currency: 'KRW', display: null } },
    isLoading: false,
    isError: false,
  }
})

it('stepUpRequired 가 없으면 본인 확인 단계 없이 곧바로 서명한다 — 헤더도 싣지 않는다', async () => {
  mount()
  clickPay()

  await waitFor(() => expect(adapter.signTransaction).toHaveBeenCalledTimes(1))
  expect(passkey.supported).not.toHaveBeenCalled()
  expect(webauthnApi.authenticationOptions).not.toHaveBeenCalled()
  expect(screen.queryByRole('region', { name: '본인 확인' })).not.toBeInTheDocument()
  expect(payment.report.mock.calls[0][0]).not.toHaveProperty('stepUpToken')
})

it('stepUpRequired: false 도 기존 흐름 그대로다', async () => {
  payment.start.mockResolvedValue(startResult({ stepUpRequired: false }))
  mount()
  clickPay()

  await waitFor(() => expect(adapter.signTransaction).toHaveBeenCalledTimes(1))
  expect(webauthnApi.authenticationOptions).not.toHaveBeenCalled()
})

it('등록된 기기가 없으면 등록 → 본인 확인 → 토큰을 결제 보고에 싣는다', async () => {
  payment.start.mockResolvedValue(startResult({ stepUpRequired: true }))
  webauthnApi.authenticationOptions
    .mockResolvedValueOnce({ registered: false })
    .mockResolvedValueOnce(AUTH_OPTIONS)
  mount()
  clickPay()

  // 서명 전에 멈추고 기기 등록 버튼을 보인다.
  const registerButton = (await screen.findAllByRole('button', { name: '이 기기 등록' }))[0]
  expect(adapter.signTransaction).not.toHaveBeenCalled()
  expect(screen.getByRole('region', { name: '본인 확인' })).toHaveTextContent(
    '처음 한 번 이 기기를 등록한 뒤 지문 또는 얼굴로 확인해 주세요.',
  )

  fireEvent.click(registerButton)
  // 클릭 핸들러 안에서 곧바로(동기) 기기 인증 창을 연다 — 사용자 활성화.
  expect(passkey.create).toHaveBeenCalledWith({ challenge: 'cmVn' })
  await waitFor(() => expect(webauthnApi.register).toHaveBeenCalledTimes(1))

  const verifyButton = (await screen.findAllByRole('button', { name: '본인 확인' }))[0]
  fireEvent.click(verifyButton)
  expect(passkey.get).toHaveBeenCalledWith(AUTH_OPTIONS)

  await waitFor(() => expect(adapter.signTransaction).toHaveBeenCalledTimes(1))
  // 토큰 범위 = 결제 · 주문 그룹
  expect(webauthnApi.authenticationOptions).toHaveBeenCalledWith({ action: 'PAYMENT', targetId: 5501 })
  expect(payment.report.mock.calls[0][0]).toMatchObject({
    orderId: 5501,
    childOrderId: 5501,
    kind: 'PURCHASE',
    stepUpToken: 'tok-1',
  })
})

it('인증 창을 닫으면(NotAllowedError) 에러가 아니라 결제 전 화면으로 되돌린다', async () => {
  payment.start.mockResolvedValue(startResult({ stepUpRequired: true }))
  passkey.get.mockRejectedValue(new DOMException('cancelled', 'NotAllowedError'))
  mount()
  clickPay()

  fireEvent.click((await screen.findAllByRole('button', { name: '본인 확인' }))[0])

  expect(await screen.findAllByRole('button', { name: /결제하기/ })).not.toHaveLength(0)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(adapter.signTransaction).not.toHaveBeenCalled()
  expect(payment.report).not.toHaveBeenCalled()
})

it('내장 인증기가 없는 기기는 안내 문구를 보이고 진행하지 않는다', async () => {
  payment.start.mockResolvedValue(startResult({ stepUpRequired: true }))
  passkey.supported.mockResolvedValue(false)
  mount()
  clickPay()

  expect(await screen.findByText('이 기기는 본인 확인을 지원하지 않습니다.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '본인 확인' })).not.toBeInTheDocument()
  expect(webauthnApi.authenticationOptions).not.toHaveBeenCalled()
  expect(adapter.signTransaction).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: '공연으로 돌아가기' })).toBeInTheDocument()
})

it('서버가 WEBAUTHN_STEP_UP_REQUIRED 로 거절하면 본인 확인 단계로 되돌아간다', async () => {
  payment.start.mockResolvedValue(startResult({ stepUpRequired: true }))
  payment.report.mockImplementationOnce(async ({ getSenderSignedRlp }) => {
    await getSenderSignedRlp()
    throw new ApiError({ code: 'WEBAUTHN_STEP_UP_REQUIRED', status: 403, msg: '' })
  })
  mount()
  clickPay()
  fireEvent.click((await screen.findAllByRole('button', { name: '본인 확인' }))[0])

  await waitFor(() => expect(payment.report).toHaveBeenCalledTimes(1))
  expect(await screen.findAllByRole('button', { name: '본인 확인' })).not.toHaveLength(0)
  expect(webauthnApi.authenticationOptions).toHaveBeenCalledTimes(2)
})
