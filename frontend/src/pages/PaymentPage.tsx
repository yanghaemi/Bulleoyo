/**
 * A-05 결제 페이지 — 라우트 `/orders/:orderId/payment`.
 *
 * 실서비스 연결
 *   시작: `POST /api/v1/orders/{orderId}/payment` (API-payment-01) — **본문 없음**(`{}` 전송),
 *         Idempotency-Key 필수. 200이면 `signRequests`, 잔액 부족이면 409.
 *   서명: `signRequests`를 순서대로 지갑에 넘겨 발신자 서명 RLP를 받는다(§0.4 ②).
 *   보고: `POST …/payment/signed-tx {kind, senderSignedRlp}` → 202 + jobId.
 *         거부는 `{kind, abandoned: true}`로 보고한다(백엔드 PaymentSignedTxRequest 확인).
 *   폴링: `GET /api/v1/chain/jobs/{jobId}` — PENDING·SUBMITTED일 때만. CONFIRMED면 A-06.
 *   복원: 화면 이탈 후 재진입은 `GET /orders/{orderId}/payment`로 현재 단계를 되살린다.
 *   본인 확인(2026-09-24, API v7 §7.W): payment-01·02의 `stepUpRequired`가 true일 때만 서명 직전에
 *         지문·Face ID 단계를 넣고, 받은 토큰을 signed-tx 헤더 `X-Step-Up-Token`에 싣는다.
 *         값이 없거나 false면 이 단계는 존재하지 않는다(스위치 off = 기존 화면 그대로).
 *
 * `signRequests` 배열 순서를 지키되, APPROVE job이 확정된 뒤 PURCHASE를 서명한다.
 * nonce·gasPrice는 Web3AuthWalletAdapter가 연결된 Kaia RPC에서 서명 직전에 읽는다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'

import { useGoToLogin } from '@/features/member/loginNavigation'
import {
  isInsufficientBalance,
  PAYMENT_ALREADY_PAID,
  PAYMENT_INSUFFICIENT_BALANCE,
  TICKET_SALE_CLOSED,
} from '@/features/payment/errors'
import { PaymentScreen } from '@/features/payment/PaymentScreen'
import type { PaymentState, PaymentView } from '@/features/payment/PaymentScreen'
import { isApiError, newIdempotencyKey } from '@/shared/api/client'
import type { PaymentSignKind, PaymentStatusResult } from '@/shared/api/domains/payment'
import { WEBAUTHN_STEP_UP_REQUIRED, type StepUpScope } from '@/shared/api/domains/webauthn'
import { useStepUp } from '@/shared/auth/useStepUp'
import { CommonCode } from '@/shared/api/errorCodes'
import { conflictMessage, type ErrorLang } from '@/shared/api/errorMessages'
import type { SignRequest } from '@/shared/api/schema'
import { isWalletDisconnected, WalletError } from '@/shared/blockchain/WalletAdapter'
import { useWalletReady } from '@/shared/blockchain/useWalletReady'
import { useWeb3Auth } from '@/shared/blockchain/useWeb3Auth'
import { isDemo, isDev } from '@/shared/config'
import { useChainJob } from '@/shared/queries/chain'
import {
  useAbandonPaymentSignature,
  useInvalidateOnPaymentConfirmed,
  usePaymentStatus,
  useReportPaymentSignedTx,
  useStartPayment,
} from '@/shared/queries/payment'
import { useOrderDetail } from '@/shared/queries/order'
import { usePerformanceDetail } from '@/shared/queries/performance'
import { useMyWallet, WalletCode } from '@/shared/queries/wallet'
import { useLocale } from '@/shared/i18n/useLocale'
import { formatKst } from '@/shared/ui'

import { demoBookingFlowFor } from './demoBookingFlow'

/** 와이어프레임의 상태 전환기(VP)를 대신한다. 개발 모드에서만 보인다. */
const DEV_STATES: { label: string; state: PaymentState }[] = [
  { label: 'Review', state: { kind: 'review' } },
  { label: 'Insufficient', state: { kind: 'insufficient', shortfall: 14000 } },
  { label: 'Signing 1/2', state: { kind: 'signing', index: 1, total: 2 } },
  { label: 'Signing 2/2', state: { kind: 'signing', index: 2, total: 2 } },
  { label: 'Confirming', state: { kind: 'confirming' } },
  { label: 'Failed', state: { kind: 'failed' } },
]

const DEMO_SIGNING_STEP_MS = 650
const DEMO_CONFIRMING_MS = 900

type Localize = (ko: string, en: string) => string

function nonPayableOrderMessage(status: string | undefined, text: Localize): string {
  return status === 'CANCELLED'
    ? text(
        '결제 시간이 만료됐습니다. 잔액은 그대로예요.',
        'The payment window expired. Your balance was not charged.',
      )
    : text(
        '현재 상태에서는 이 주문을 결제할 수 없습니다.',
        'This order cannot be paid in its current state.',
      )
}

export function PaymentPage() {
  return isDemo ? <DemoPaymentPage /> : <LivePaymentPage />
}

function DemoPaymentPage() {
  const navigate = useNavigate()
  const { orderId } = useParams()
  const [searchParams] = useSearchParams()
  const [state, setState] = useState<PaymentState>({ kind: 'review' })
  const fromPerformanceId = searchParams.get('from')
  const flow = demoBookingFlowFor(fromPerformanceId ?? undefined)

  useEffect(() => {
    if (!isDemo) return

    let next: (() => void) | undefined
    let delay = DEMO_SIGNING_STEP_MS
    if (state.kind === 'signing' && state.index < state.total) {
      next = () => setState({ ...state, index: state.index + 1 })
    } else if (state.kind === 'signing') {
      next = () => setState({ kind: 'confirming' })
    } else if (state.kind === 'confirming' && orderId) {
      delay = DEMO_CONFIRMING_MS
      next = () => {
        const search = new URLSearchParams()
        if (fromPerformanceId) search.set('from', fromPerformanceId)
        navigate({
          pathname: `/orders/${encodeURIComponent(orderId)}/complete`,
          search: search.toString(),
        })
      }
    }

    if (!next) return
    const timer = window.setTimeout(next, delay)
    return () => window.clearTimeout(timer)
  }, [fromPerformanceId, navigate, orderId, state])

  return (
    <>
      {isDev && (
        <div className="flex flex-wrap gap-1 border-b border-line bg-ground-2 px-3 py-2">
          {DEV_STATES.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setState(s.state)}
              className={[
                'rounded-[4px] px-2 py-1 font-mono text-[10px]',
                state.kind === s.state.kind ? 'bg-sel text-white' : 'bg-surface text-muted',
              ].join(' ')}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <PaymentScreen
        data={flow.payment}
        state={state}
        onPay={() => setState({ kind: 'signing', index: 1, total: 2 })}
        // API 연결 시 잔액을 다시 조회해 판정한다(§5.16). 채워졌으면 곧장 서명 단계로 간다.
        onRetry={() => setState({ kind: 'review' })}
        onViewBalance={() => navigate('/wallet')}
        onBackToShow={() => navigate(`/performances/${flow.detail.performanceId}`)}
      />
    </>
  )
}

interface ActivePaymentJob {
  jobId: string
  kind: PaymentSignKind
  nextIndex: number
  childOrderId?: number
}

function PaymentDataError({
  onRetry,
  onBackHome,
  message,
}: {
  onRetry: () => void
  onBackHome: () => void
  message?: string
}) {
  const { text } = useLocale()
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-sm text-center" role="alert">
        <p className="font-semibold text-ink">
          {message ?? text('결제 정보를 불러오지 못했습니다.', 'Could not load payment details.')}
        </p>
        <button
          type="button"
          className="mt-4 rounded-button border border-line px-4 py-2 text-sm font-semibold text-ink"
          onClick={onRetry}
        >
          {text('다시 시도', 'Retry')}
        </button>
        <button
          type="button"
          className="mt-2 rounded-button border border-line px-4 py-2 text-sm font-semibold text-ink"
          onClick={onBackHome}
        >
          {text('홈으로', 'Back to home')}
        </button>
      </div>
    </main>
  )
}

function isPaymentSignRequest(
  request: SignRequest,
): request is SignRequest & { kind: PaymentSignKind } {
  return request.required && (request.kind === 'APPROVE' || request.kind === 'PURCHASE')
}

function childOrderIdOf(request: SignRequest): number | undefined {
  const id = request.summary.orderId
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : undefined
}

function hasPaymentStatus(status: PaymentStatusResult | undefined, value: string): boolean {
  return status?.payments?.some((payment) => payment.paymentStatus === value) === true
}

function groupPaid(status: PaymentStatusResult | undefined): boolean {
  return (
    status?.groupStatus === 'PAID' &&
    Boolean(status.payments?.length) &&
    status.payments!.every((payment) => payment.paymentStatus === 'PAID')
  )
}

function payable(status: string | undefined): boolean {
  return status === 'PENDING_PAYMENT' || status === 'PARTIALLY_PAID'
}

function unpaidSignRequests(
  status: Pick<PaymentStatusResult, 'payments' | 'signRequests'>,
  confirmed: Set<number>,
) {
  return (status.signRequests ?? []).filter(isPaymentSignRequest).filter((request) => {
    if (request.kind === 'APPROVE') return true
    const id = childOrderIdOf(request)
    if (!id || confirmed.has(id)) return false
    const payment = status.payments?.find((payment) => payment.orderId === id)
    return payment?.paymentStatus === 'AWAITING_SIGNATURE'
  })
}

function errorMessage(error: unknown, text: Localize, language: ErrorLang): string {
  if (error instanceof WalletError) {
    if (error.kind === 'WRONG_CHAIN') {
      return text(
        'Kairos 네트워크로 전환한 뒤 다시 시도해 주세요.',
        'Switch to Kairos and try again.',
      )
    }
    if (error.kind === 'NOT_CONNECTED') {
      return text('소셜 지갑을 다시 연결해 주세요.', 'Reconnect your social wallet and try again.')
    }
    return text(
      '지갑에서 결제 서명을 완료하지 못했습니다. 다시 시도해 주세요.',
      'The wallet could not complete the payment signature. Please try again.',
    )
  }
  if (isApiError(error)) {
    if (error.code === CommonCode.CONFLICT) {
      return text(
        '결제 상태가 바뀌었습니다. 새로 확인한 뒤 다시 시도해 주세요.',
        'The payment state changed. Refresh it and try again.',
      )
    }
    return conflictMessage(error.code, language)!
  }
  return text(
    '결제를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    'We could not complete the payment. Please try again shortly.',
  )
}

function LivePaymentPage() {
  const navigate = useNavigate()
  const { orderId: orderIdParam } = useParams()
  const [searchParams] = useSearchParams()
  const fromPerformanceId = searchParams.get('from')
  const parsedOrderId = Number(orderIdParam)
  const orderId =
    Number.isSafeInteger(parsedOrderId) && parsedOrderId > 0 ? parsedOrderId : undefined
  const { adapter } = useWeb3Auth()
  /**
   * P-03·P-06과 같은 마운트 게이트(D-77). A-05만 빠져 있어, 화면에 들자마자 누른 결제가
   * 계정 없는 지갑으로 나가 `NOT_CONNECTED`로 떨어졌다 — 사용자에게는 "몇 번 눌러야 된다"다.
   */
  const { ready: walletReady, addressUnavailable } = useWalletReady(adapter, {
    requireAddress: true,
  })
  const goToLogin = useGoToLogin()
  const { language, text } = useLocale()
  const paymentStatus = usePaymentStatus(orderId)
  const orderDetail = useOrderDetail(orderId)
  // 주문 응답에는 포스터가 없다 — 주문 요약 카드의 포스터는 공연 상세(API-performance-03)에서 가져온다
  const performanceDetail = usePerformanceDetail(orderDetail.data?.performanceId ?? 0)
  const posterImageUrl = performanceDetail.data?.posterImageUrl ?? null
  const wallet = useMyWallet()
  const startPayment = useStartPayment()
  const reportSignedTx = useReportPaymentSignedTx()
  const abandonSignature = useAbandonPaymentSignature()
  const invalidateOnConfirmed = useInvalidateOnPaymentConfirmed()
  const idempotencyKeyRef = useRef(newIdempotencyKey())
  const requestsRef = useRef<Array<SignRequest & { kind: PaymentSignKind }>>([])
  const failedJobIdsRef = useRef(new Set<string>())
  const confirmedJobIdsRef = useRef(new Set<string>())
  const confirmedOrderIdsRef = useRef(new Set<number>())
  const expiresAtRef = useRef<string | null | undefined>(null)
  const busyRef = useRef(false)
  const lastPaymentViewRef = useRef<{ orderId: number; view: PaymentView } | null>(null)
  const [state, setState] = useState<PaymentState>({ kind: 'review' })
  const [activeJob, setActiveJob] = useState<ActivePaymentJob | null>(null)
  /** [2026-09-24] 본인 확인. `stepUpRequired`가 true일 때만 쓰인다. */
  const stepUp = useStepUp()
  /** 토큰 범위 = PAYMENT · 주문 그룹(payment-01·02 `orderGroupId`). 다른 그룹에는 못 쓴다. */
  const stepUpScopeRef = useRef<StepUpScope | null>(null)
  /** 본인 확인이 끝나면 이어서 서명할 `requestsRef` 위치. */
  const stepUpResumeIndexRef = useRef(0)

  // 새로고침 복원 경로는 startSigning 을 거치지 않는다 — 조회 응답의 그룹으로 범위를 잡아 둔다.
  const statusGroupId = paymentStatus.data?.orderGroupId
  useEffect(() => {
    if (statusGroupId) stepUpScopeRef.current = { action: 'PAYMENT', targetId: statusGroupId }
  }, [statusGroupId])

  const restoreActivePaymentJob = useCallback(
    (status: PaymentStatusResult | undefined): boolean => {
      if (!status) return false
      const paying = status.payments?.find(
        (payment) =>
          payment.paymentStatus === 'PAYING' &&
          payment.purchaseJobId &&
          !confirmedJobIdsRef.current.has(payment.purchaseJobId) &&
          !failedJobIdsRef.current.has(payment.purchaseJobId),
      )
      if (paying?.purchaseJobId) {
        requestsRef.current = []
        busyRef.current = true
        setActiveJob({
          jobId: paying.purchaseJobId,
          kind: 'PURCHASE',
          nextIndex: 0,
          childOrderId: paying.orderId,
        })
        setState({ kind: 'confirming' })
        return true
      }
      if (hasPaymentStatus(status, 'AWAITING_SIGNATURE') && status.approveJobId) {
        if (
          failedJobIdsRef.current.has(status.approveJobId) ||
          confirmedJobIdsRef.current.has(status.approveJobId)
        )
          return false
        const requests = unpaidSignRequests(status, confirmedOrderIdsRef.current)
        expiresAtRef.current = status.expiresAt
        requestsRef.current = requests
        const approveIndex = requests.findIndex((request) => request.kind === 'APPROVE')
        busyRef.current = true
        setActiveJob({
          jobId: status.approveJobId,
          kind: 'APPROVE',
          nextIndex: approveIndex >= 0 ? approveIndex + 1 : 0,
        })
        setState({ kind: 'confirming' })
        return true
      }
      return false
    },
    [],
  )

  const freshPaymentView = useMemo<PaymentView | null>(() => {
    const order = orderDetail.data
    const status = paymentStatus.data
    if (!order) return null
    const groupedChildren = order.orders ?? []
    const activeChildren = groupedChildren.filter((child) => child.status !== 'CANCELLED')
    const activeOrderIds = new Set(
      activeChildren.flatMap((child) => (child.orderId == null ? [] : [child.orderId])),
    )
    const outstandingChildren = activeChildren.filter((child) => child.status !== 'PAID')
    const groupedFallbackAmount =
      groupedChildren.length > 0 && outstandingChildren.every((child) => child.amount != null)
        ? outstandingChildren.reduce((sum, child) => sum + (child.amount ?? 0), 0)
        : order.totalAmount
    const paymentAmount = status?.payments?.length
      ? status.payments
          .filter(
            (payment) =>
              payment.paymentStatus !== 'PAID' &&
              payment.paymentStatus !== 'REFUNDED' &&
              (groupedChildren.length === 0 ||
                (payment.orderId != null && activeOrderIds.has(payment.orderId))),
          )
          .reduce((sum, payment) => sum + (payment.amount ?? 0), 0)
      : groupedFallbackAmount
    if (paymentAmount == null) return null
    const items = activeChildren.flatMap((child) => child.items ?? [])
    const firstItem = items[0]
    const paymentFor = (childOrderId: number | undefined) =>
      childOrderId == null
        ? undefined
        : status?.payments?.find((payment) => payment.orderId === childOrderId)
    const childIsPaid = (child: NonNullable<typeof order.orders>[number]) =>
      child.status === 'PAID' || paymentFor(child.orderId)?.paymentStatus === 'PAID'
    return {
      performanceId: order.performanceId ? String(order.performanceId) : undefined,
      posterImageUrl,
      showTitle: order.performanceTitle ?? text('공연', 'Show'),
      dateLabel: order.startAt ? formatKst(order.startAt) : '—',
      venue: order.venueName ?? '—',
      ticketTypeName: firstItem?.name ?? text('티켓', 'Ticket'),
      quantity: items.reduce((total, item) => total + (item.quantity ?? 0), 0) || 1,
      teamName:
        activeChildren
          .map((child) => child.chosenTeamName)
          .filter(Boolean)
          .join(', ') || text('선택 없음', 'No team selected'),
      teamAllocations: activeChildren.map((child) => {
        return {
          teamName: child.chosenTeamName ?? '—',
          quantity: child.items?.reduce((sum, item) => sum + (item.quantity ?? 0), 0) ?? 0,
          amount: child.amount ?? 0,
          paid: childIsPaid(child),
        }
      }),
      paidQuantity: activeChildren
        .filter(childIsPaid)
        .reduce(
          (sum, child) =>
            sum + (child.items?.reduce((n, item) => n + (item.quantity ?? 0), 0) ?? 0),
          0,
        ),
      totalAmount: paymentAmount,
      walletBalance: status?.walletBalance ?? wallet.data?.balance?.amount ?? null,
    }
  }, [orderDetail.data, paymentStatus.data, posterImageUrl, text, wallet.data?.balance?.amount])

  useEffect(() => {
    if (freshPaymentView && orderId) {
      lastPaymentViewRef.current = { orderId, view: freshPaymentView }
    }
  }, [freshPaymentView, orderId])

  const completionLocation = useCallback(() => {
    const search = new URLSearchParams()
    if (fromPerformanceId) search.set('from', fromPerformanceId)
    return {
      pathname: `/orders/${encodeURIComponent(String(orderId))}/complete`,
      search: search.toString(),
    }
  }, [fromPerformanceId, orderId])

  const goToCompletion = useCallback(async () => {
    if (!orderId) return
    busyRef.current = true
    try {
      await invalidateOnConfirmed({ orderId, kind: 'PURCHASE' })
    } catch {
      // 캐시 무효화 재조회 실패가 이미 확정된 결제 완료 이동을 막아서는 안 된다.
    } finally {
      navigate(completionLocation(), { replace: true })
    }
  }, [completionLocation, invalidateOnConfirmed, navigate, orderId])

  /**
   * 본인 확인 단계로 들어간다 — 지원 여부를 보고 옵션을 **미리** 받아 둔다. 기기 인증 창은 사용자가
   * 버튼을 눌렀을 때 `handleStepUp`이 연다(사용자 활성화가 필요해서 여기서 열지 않는다).
   */
  const enterStepUp = useCallback(
    async (index: number, message?: string) => {
      stepUpResumeIndexRef.current = index
      busyRef.current = true
      setState({ kind: 'stepUp', mode: 'loading', message })
      try {
        const scope = stepUpScopeRef.current
        if (!scope) throw new Error('payment step-up scope unknown')
        const mode = await stepUp.prepare(scope)
        if (mode === 'unsupported') busyRef.current = false
        setState({ kind: 'stepUp', mode, message })
      } catch (error) {
        busyRef.current = false
        setState({ kind: 'failed', message: errorMessage(error, text, language) })
      }
    },
    [language, stepUp, text],
  )

  const signRequestAt = useCallback(
    async (index: number) => {
      const request = requestsRef.current[index]
      if (expiresAtRef.current && Date.parse(expiresAtRef.current) <= Date.now()) {
        busyRef.current = false
        requestsRef.current = []
        setState({
          kind: 'failed',
          message: text(
            '결제 시간이 만료됐습니다. 이미 결제된 티켓은 유지됩니다.',
            'The payment window expired. Confirmed tickets are kept.',
          ),
        })
        return
      }
      const childOrderId = request && childOrderIdOf(request)
      if (!orderId || !request || (request.kind === 'PURCHASE' && !childOrderId)) {
        busyRef.current = false
        setState({
          kind: 'failed',
          message: text(
            '서명할 결제 요청을 찾지 못했습니다.',
            'We could not find a payment request to sign.',
          ),
        })
        return
      }

      if (!adapter) {
        busyRef.current = false
        setState({
          kind: 'failed',
          message: text(
            '소셜 지갑 연결을 먼저 완료해 주세요.',
            'Connect your social wallet before continuing.',
          ),
        })
        return
      }

      setState({ kind: 'signing', index: index + 1, total: requestsRef.current.length })
      try {
        const getSenderSignedRlp = () => adapter.signTransaction(request)
        const token = stepUpScopeRef.current ? stepUp.token(stepUpScopeRef.current) : null
        const stepUpToken = token ? { stepUpToken: token } : {}
        const accepted = await reportSignedTx.mutateAsync(
          request.kind === 'PURCHASE'
            ? { orderId, childOrderId: childOrderId!, kind: 'PURCHASE', getSenderSignedRlp, ...stepUpToken }
            : { orderId, kind: 'APPROVE', getSenderSignedRlp, ...stepUpToken },
        )
        setActiveJob({
          jobId: accepted.jobId,
          kind: request.kind,
          nextIndex: index + 1,
          childOrderId,
        })
        setState({ kind: 'confirming' })
      } catch (error) {
        busyRef.current = false
        if (isApiError(error) && error.code === WEBAUTHN_STEP_UP_REQUIRED) {
          // 토큰이 만료·소비됐거나 새로고침으로 잃었다 — 에러 화면이 아니라 본인 확인으로 되돌아가
          // 같은 서명 위치부터 잇는다.
          stepUp.clear()
          void enterStepUp(index)
          return
        }
        if (isWalletDisconnected(error) && addressUnavailable) {
          // 게이트가 상한까지 기다리고도 주소를 못 받았다 = 복원할 세션이 아예 없다.
          // 이 화면의 재시도로는 풀리지 않으므로 재로그인으로 보낸다.
          goToLogin()
          return
        }
        if (error instanceof WalletError && error.kind === 'USER_REJECTED') {
          try {
            await abandonSignature.mutateAsync(
              request.kind === 'PURCHASE'
                ? { orderId, childOrderId: childOrderId!, kind: 'PURCHASE' }
                : { orderId, kind: 'APPROVE' },
            )
          } catch {
            // 취소 알림 실패가 결제 실패는 아니다. 서버의 주문 만료 규칙이 마지막 안전망이다.
          }
          setState({ kind: 'review' })
          return
        }
        setState({ kind: 'failed', message: errorMessage(error, text, language) })
      }
    },
    [
      abandonSignature,
      adapter,
      addressUnavailable,
      enterStepUp,
      goToLogin,
      language,
      orderId,
      reportSignedTx,
      stepUp,
      text,
    ],
  )

  /** 서명을 시작한다. 서버가 본인 확인을 요구하고 아직 토큰이 없으면 그 단계를 먼저 넣는다. */
  const startSigning = useCallback(
    async (prepared: { stepUpRequired?: boolean; orderGroupId?: number } | undefined) => {
      if (prepared?.orderGroupId) {
        stepUpScopeRef.current = { action: 'PAYMENT', targetId: prepared.orderGroupId }
      }
      const scope = stepUpScopeRef.current
      if (prepared?.stepUpRequired === true && !(scope && stepUp.token(scope))) {
        await enterStepUp(0)
        return
      }
      await signRequestAt(0)
    },
    [enterStepUp, signRequestAt, stepUp],
  )

  /**
   * 본인 확인 버튼. **첫 줄에서** 기기 인증 창을 연다 — 앞에 await가 있으면 Safari·iOS가 사용자
   * 활성화가 끝났다고 보고 창을 막는다(D-82). 옵션은 `enterStepUp`이 미리 받아 두었다.
   */
  const handleStepUp = useCallback(() => {
    if (state.kind !== 'stepUp' || (state.mode !== 'register' && state.mode !== 'verify')) return
    const pending = stepUp.run(state.mode)
    setState({ kind: 'stepUp', mode: 'working' })
    void pending.then((outcome) => {
      if (outcome.kind === 'needVerify') {
        setState({ kind: 'stepUp', mode: 'verify' })
        return
      }
      if (outcome.kind === 'token') {
        void signRequestAt(stepUpResumeIndexRef.current)
        return
      }
      if (outcome.kind === 'cancelled') {
        // 인증 창을 닫았다 — 에러가 아니다. 결제 전 화면으로 되돌리고 잔액은 그대로다.
        busyRef.current = false
        setState({ kind: 'review' })
        return
      }
      void enterStepUp(
        stepUpResumeIndexRef.current,
        text('본인 확인에 실패했어요. 다시 시도해 주세요.', 'Verification failed. Please try again.'),
      )
    })
  }, [enterStepUp, signRequestAt, state, stepUp, text])

  const paymentJob = useChainJob(activeJob?.jobId, {
    onConfirmed: () => {
      if (!activeJob) return
      confirmedJobIdsRef.current.add(activeJob.jobId)
      if (activeJob.kind === 'PURCHASE' && activeJob.childOrderId)
        confirmedOrderIdsRef.current.add(activeJob.childOrderId)
      setActiveJob(null)
      if (activeJob.nextIndex < requestsRef.current.length) {
        void signRequestAt(activeJob.nextIndex)
        return
      }
      void paymentStatus
        .refetch()
        .then(({ data }) => {
          if (groupPaid(data)) {
            void goToCompletion()
            return
          }
          if (restoreActivePaymentJob(data)) return
          busyRef.current = false
          setState({ kind: 'review' })
        })
        .catch(() => {
          busyRef.current = false
          setState({
            kind: 'failed',
            message: text('결제 상태를 다시 확인해 주세요.', 'Check the payment status again.'),
          })
        })
    },
    onFailed: (job) => {
      busyRef.current = false
      setActiveJob(null)
      failedJobIdsRef.current.add(job.jobId)
      // 체인 실패 뒤에는 같은 서명 요청/RLP가 서버의 실패 job으로 재생되지 않도록
      // 다음 prepare를 새로운 멱등 시도로 구분한다.
      idempotencyKeyRef.current = newIdempotencyKey()
      setState({
        kind: 'failed',
        message:
          job.failureReason ??
          text(
            '체인에서 결제를 확정하지 못했습니다. 다시 시도해 주세요.',
            'The payment could not be confirmed on-chain. Please try again.',
          ),
      })
    },
  })

  useEffect(() => {
    if (!activeJob || !paymentJob.timedOut) return
    busyRef.current = false
    setActiveJob(null)
    requestsRef.current = []
    setState({
      kind: 'failed',
      message: text(
        '결제 확인이 지연되고 있습니다. 다시 조회해 주세요.',
        'Confirmation is delayed. Check the payment status again.',
      ),
    })
  }, [activeJob, paymentJob.timedOut, text])

  useEffect(() => {
    const status = paymentStatus.data
    if (!status || busyRef.current) return
    if (groupPaid(status)) {
      void goToCompletion()
      return
    }
    if (status.blockedReason === 'INSUFFICIENT_BALANCE') {
      setState(
        status.shortfall != null && status.shortfall > 0
          ? { kind: 'insufficient', shortfall: status.shortfall }
          : { kind: 'insufficient', shortfall: null },
      )
      return
    }
    if (restoreActivePaymentJob(status)) return
    if (hasPaymentStatus(status, 'FAILED')) {
      // chain job 콜백이 먼저 전달한 구체적인 실패 사유를 늦은 상태 폴이 지우지 않는다.
      setState((currentState) =>
        currentState.kind === 'failed' && currentState.message ? currentState : { kind: 'failed' },
      )
    }
  }, [goToCompletion, paymentStatus.data, restoreActivePaymentJob])

  useEffect(() => {
    const orderStatus = orderDetail.data?.groupStatus
    if (!orderStatus || busyRef.current) return
    if (orderStatus === 'PAID') {
      void goToCompletion()
      return
    }
    if (!payable(orderStatus)) {
      setState({ kind: 'failed', message: nonPayableOrderMessage(orderStatus, text) })
    }
  }, [goToCompletion, orderDetail.data?.groupStatus, text])

  const beginPayment = useCallback(
    async (freshStatus?: PaymentStatusResult) => {
      if (!orderId || busyRef.current) return
      if (orderDetail.data?.groupStatus && !payable(orderDetail.data.groupStatus)) {
        setState({
          kind: 'failed',
          message: nonPayableOrderMessage(orderDetail.data.groupStatus, text),
        })
        return
      }
      busyRef.current = true
      try {
        const current = freshStatus ?? paymentStatus.data
        if (groupPaid(current)) {
          await goToCompletion()
          return
        }
        if (restoreActivePaymentJob(current)) return
        if (current?.expiresAt && Date.parse(current.expiresAt) <= Date.now()) {
          busyRef.current = false
          setState({
            kind: 'failed',
            message: text(
              '결제 시간이 만료됐습니다. 이미 결제된 티켓은 유지됩니다.',
              'The payment window expired. Confirmed tickets are kept.',
            ),
          })
          return
        }
        const prepared =
          current &&
          hasPaymentStatus(current, 'AWAITING_SIGNATURE') &&
          !hasPaymentStatus(current, 'FAILED') &&
          current.signRequests &&
          !(current.approveJobId && failedJobIdsRef.current.has(current.approveJobId))
            ? current
            : await startPayment.mutateAsync({ orderId, idempotencyKey: idempotencyKeyRef.current })
        const requests = unpaidSignRequests(prepared, confirmedOrderIdsRef.current)
        if (!requests.some((request) => request.kind === 'PURCHASE')) {
          busyRef.current = false
          setState({
            kind: 'failed',
            message: text(
              '필요한 결제 서명 요청이 없습니다.',
              'No required payment signature request was returned.',
            ),
          })
          return
        }
        requestsRef.current = requests
        expiresAtRef.current = prepared.expiresAt
        await startSigning(prepared)
      } catch (error) {
        if (isApiError(error) && error.code === PAYMENT_ALREADY_PAID) {
          try {
            const refreshed = await paymentStatus.refetch()
            if (!refreshed.isError && groupPaid(refreshed.data)) {
              await goToCompletion()
              return
            }
          } catch {
            /* A 409 alone never proves every child was paid. */
          }
          busyRef.current = false
          setState({
            kind: 'failed',
            message: text(
              '전체 결제가 완료되지 않았습니다. 결제된 티켓은 내 티켓에서 확인해 주세요.',
              'The group is not fully paid. Confirmed tickets are available in My tickets.',
            ),
          })
          return
        }
        if (isApiError(error) && error.code === WalletCode.NOT_FOUND) {
          navigate('/onboarding/wallet', { replace: true })
          return
        }
        if (isApiError(error) && error.code === TICKET_SALE_CLOSED) {
          navigate('/', { replace: true })
          return
        }
        if (isApiError(error) && isInsufficientBalance(error.code)) {
          const [refreshedPayment, refreshedOrder] = await Promise.all([
            paymentStatus.refetch(),
            orderDetail.refetch(),
          ])
          const refreshedStatus = refreshedPayment.data
          const refreshedOrderStatus =
            refreshedOrder?.data?.groupStatus ?? orderDetail.data?.groupStatus
          if (restoreActivePaymentJob(refreshedStatus)) return
          const resumedRequests = refreshedStatus
            ? unpaidSignRequests(refreshedStatus, confirmedOrderIdsRef.current)
            : []
          if (
            hasPaymentStatus(refreshedStatus, 'AWAITING_SIGNATURE') &&
            resumedRequests.length > 0
          ) {
            requestsRef.current = resumedRequests
            expiresAtRef.current = refreshedStatus?.expiresAt
            await startSigning(refreshedStatus)
            return
          }
          const shortfall = refreshedStatus?.shortfall
          if (
            shortfall != null &&
            shortfall > 0 &&
            (error.code === PAYMENT_INSUFFICIENT_BALANCE ||
              refreshedStatus?.blockedReason === 'INSUFFICIENT_BALANCE')
          ) {
            busyRef.current = false
            setState({ kind: 'insufficient', shortfall })
            return
          }
          if (error.code === PAYMENT_INSUFFICIENT_BALANCE) {
            busyRef.current = false
            setState({ kind: 'insufficient', shortfall: null })
            return
          }
          // API-payment-01의 현재 계약은 잔액 부족도 COMMON_CONFLICT로 응답하고 payment를
          // 만들지 않는다. 결제 조회 404 + 아직 결제 가능한 주문 조합으로만 그 경우를 좁힌다.
          // 주문 만료·이미 서명 대기·멱등 충돌은 이 조합을 만족하지 않는다.
          if (
            !refreshedStatus &&
            payable(refreshedOrderStatus) &&
            isApiError(refreshedPayment.error) &&
            refreshedPayment.error.code === CommonCode.NOT_FOUND
          ) {
            busyRef.current = false
            setState({
              kind: 'insufficient',
              shortfall: null,
              message: errorMessage(error, text, language),
            })
            return
          }
          busyRef.current = false
          setState({ kind: 'failed', message: errorMessage(error, text, language) })
          return
        }
        busyRef.current = false
        setState({ kind: 'failed', message: errorMessage(error, text, language) })
      }
    },
    [
      goToCompletion,
      language,
      navigate,
      orderDetail,
      orderId,
      paymentStatus,
      restoreActivePaymentJob,
      startPayment,
      startSigning,
      text,
    ],
  )

  const retry = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    setActiveJob(null)
    let refreshedOrder
    let refreshedPayment
    try {
      ;[refreshedOrder, refreshedPayment] = await Promise.all([
        orderDetail.refetch(),
        paymentStatus.refetch(),
      ])
    } catch (error) {
      busyRef.current = false
      setState({ kind: 'failed', message: errorMessage(error, text, language) })
      return
    }
    const refreshedOrderStatus = refreshedOrder?.data?.groupStatus
    const refreshedPaymentStatus = refreshedPayment?.data
    const refreshError =
      (refreshedOrder?.isError ? refreshedOrder.error : undefined) ??
      (refreshedPayment?.isError ? refreshedPayment.error : undefined)
    if (refreshError) {
      busyRef.current = false
      setState({ kind: 'failed', message: errorMessage(refreshError, text, language) })
      return
    }
    const paymentIsPaid = groupPaid(refreshedPaymentStatus)
    if (refreshedOrderStatus === 'PAID' || paymentIsPaid) {
      await goToCompletion()
      return
    }
    if (refreshedOrderStatus && !payable(refreshedOrderStatus)) {
      busyRef.current = false
      setState({ kind: 'failed', message: nonPayableOrderMessage(refreshedOrderStatus, text) })
      return
    }
    const failedApproveNeedsResign =
      hasPaymentStatus(refreshedPaymentStatus, 'AWAITING_SIGNATURE') &&
      Boolean(refreshedPaymentStatus?.approveJobId) &&
      failedJobIdsRef.current.has(refreshedPaymentStatus!.approveJobId!)
    if (failedApproveNeedsResign) {
      busyRef.current = false
      await beginPayment(refreshedPaymentStatus)
      return
    }
    if (restoreActivePaymentJob(refreshedPaymentStatus)) return
    if (hasPaymentStatus(refreshedPaymentStatus, 'FAILED')) {
      // 같은 FAILED 응답을 다시 화면 상태에 반영하면 재시도 직후 실패 화면으로 되돌아간다.
      // 사용자가 누른 재시도는 새 idempotent prepare와 서명 흐름을 즉시 시작한다.
      idempotencyKeyRef.current = newIdempotencyKey()
      busyRef.current = false
      await beginPayment(refreshedPaymentStatus)
      return
    }
    busyRef.current = false
    setState({ kind: 'review' })
  }, [
    beginPayment,
    goToCompletion,
    language,
    orderDetail,
    paymentStatus,
    restoreActivePaymentJob,
    text,
  ])

  if (!orderId) {
    return (
      <div role="alert" className="p-6 text-danger">
        {text('올바르지 않은 주문 번호입니다.', 'Invalid order number.')}
      </div>
    )
  }

  const needsFreshPaymentData = state.kind === 'review' || state.kind === 'insufficient'
  const lastPaymentView =
    lastPaymentViewRef.current?.orderId === orderId ? lastPaymentViewRef.current.view : null
  const hasPaymentView = Boolean(freshPaymentView ?? lastPaymentView)
  const isRequiredDataLoading =
    (orderDetail.isLoading || orderDetail.isFetching) && !orderDetail.data
  if (
    !hasPaymentView &&
    state.kind !== 'failed' &&
    (isRequiredDataLoading || state.kind === 'signing' || state.kind === 'confirming')
  ) {
    return (
      <main className="grid min-h-dvh place-items-center px-4" aria-busy="true">
        <p className="text-sm text-muted" role="status">
          {state.kind === 'signing' || state.kind === 'confirming'
            ? text('결제 처리 중…', 'Processing payment…')
            : text('결제 정보를 불러오는 중입니다.', 'Loading payment…')}
        </p>
      </main>
    )
  }

  if (needsFreshPaymentData && !freshPaymentView) {
    return <PaymentDataError onRetry={retry} onBackHome={() => navigate('/')} />
  }

  const data = freshPaymentView ?? lastPaymentView
  if (!data) {
    return (
      <PaymentDataError
        onRetry={() => void retry()}
        onBackHome={() => navigate('/')}
        message={
          state.kind === 'failed'
            ? (state.message ??
              text(
                '결제를 완료하지 못했습니다. 다시 시도해 주세요.',
                'Could not complete payment. Please try again.',
              ))
            : undefined
        }
      />
    )
  }
  const performanceId = data.performanceId

  return (
    <PaymentScreen
      data={data}
      state={state}
      onPay={() => void beginPayment()}
      onRetry={() => void retry()}
      onViewBalance={() => navigate('/wallet')}
      walletReady={walletReady}
      onStepUp={handleStepUp}
      onBackToShow={
        performanceId
          ? () => navigate(`/performances/${encodeURIComponent(performanceId)}`)
          : undefined
      }
      onBackHome={() => navigate('/')}
    />
  )
}

export default PaymentPage
