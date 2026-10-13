/**
 * A-06 예매 완료 페이지 — 라우트 `/orders/:orderId/complete`.
 *
 * API 연결
 *   `GET /api/v1/orders/{orderId}` (API-ticket-03 주문 상세)로 확정된 주문을 읽는다.
 *   그룹의 PAID / PARTIALLY_PAID를 구분하고 확정된 표만 완료 요약에 담는다.
 */

import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router'

import { BookingComplete } from '@/features/ticket/BookingComplete'
import type { BookingCompleteView } from '@/features/ticket/BookingComplete'
import { formatOrderNumber } from '@/features/ticket/bookingCompleteModel'
import { isDemo } from '@/shared/config'
import { useLocale } from '@/shared/i18n/useLocale'
import { useChainJob } from '@/shared/queries/chain'
import { useOrderDetail } from '@/shared/queries/order'
import { usePaymentStatus } from '@/shared/queries/payment'
import { formatYoyo, formatKst, PageSkeleton } from '@/shared/ui'

import { demoBookingFlowFor } from './demoBookingFlow'

export function BookingCompletePage() {
  const { text, language } = useLocale()
  const navigate = useNavigate()
  const { orderId } = useParams<{ orderId: string }>()
  const [searchParams] = useSearchParams()
  const orderIdCandidate = orderId && /^\d+$/.test(orderId) ? Number(orderId) : undefined
  const parsedOrderId =
    Number.isSafeInteger(orderIdCandidate) && Number(orderIdCandidate) > 0
      ? Number(orderIdCandidate)
      : undefined
  const orderQuery = useOrderDetail(parsedOrderId, { enabled: !isDemo })
  const order = orderQuery.data
  const orderConfirmsPaid = order?.groupStatus === 'PAID'
  const paymentQuery = usePaymentStatus(parsedOrderId, {
    enabled: !isDemo && Boolean(order) && !orderConfirmsPaid,
  })
  const payingChild = paymentQuery.data?.payments?.find(
    (payment) => payment.paymentStatus === 'PAYING',
  )
  const isPayingWithPolling = Boolean(payingChild) && paymentQuery.data?.pollAfterMs != null
  const paymentJob = useChainJob(isPayingWithPolling ? payingChild?.purchaseJobId : null, {
    enabled: !isDemo && isPayingWithPolling,
    onConfirmed: () => void Promise.all([orderQuery.refetch(), paymentQuery.refetch()]),
    onFailed: () => void Promise.all([orderQuery.refetch(), paymentQuery.refetch()]),
  })

  const query = searchParams.toString()
  const withQuery = (path: string) => `${path}${query ? `?${query}` : ''}`

  if (parsedOrderId === undefined) return <Navigate replace to="/" />

  const paymentConfirmsPaid = orderConfirmsPaid || paymentQuery.data?.groupStatus === 'PAID'
  const partiallyPaid =
    !paymentConfirmsPaid &&
    (order?.groupStatus === 'PARTIALLY_PAID' || paymentQuery.data?.groupStatus === 'PARTIALLY_PAID')
  const needsPaymentConfirmation = !orderConfirmsPaid && !partiallyPaid
  // 실패한 payment에도 purchaseJobId가 남으므로 job ID 존재만으로 진행 중이라 단정하지 않는다.
  const paymentIsProcessing = isPayingWithPolling && !paymentJob.timedOut && !paymentJob.isFailed

  if (
    !isDemo &&
    ((!order && (orderQuery.isLoading || orderQuery.isFetching)) ||
      (needsPaymentConfirmation &&
        !paymentQuery.data &&
        (paymentQuery.isLoading || paymentQuery.isFetching)) ||
      (needsPaymentConfirmation &&
        !paymentConfirmsPaid &&
        orderQuery.isFetching &&
        paymentQuery.isFetching) ||
      (needsPaymentConfirmation && !paymentConfirmsPaid && paymentIsProcessing))
  ) {
    return (
      <main className="mx-auto min-h-dvh max-w-[1200px] px-4 py-12">
        <PageSkeleton variant="detail" />
      </main>
    )
  }

  if (!isDemo && !order) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <div className="max-w-sm text-center" role="alert">
          <p className="font-semibold text-ink">
            {text('예매 정보를 불러오지 못했습니다.', 'Could not load your booking.')}
          </p>
          <button
            type="button"
            className="mt-4 rounded-button border border-line px-4 py-2 text-sm font-semibold text-ink"
            onClick={() => void Promise.all([orderQuery.refetch(), paymentQuery.refetch()])}
          >
            {text('다시 시도', 'Retry')}
          </button>
        </div>
      </main>
    )
  }

  if (!isDemo && !paymentConfirmsPaid && !partiallyPaid) {
    return <Navigate replace to={withQuery(`/orders/${parsedOrderId}/payment`)} />
  }

  let data: BookingCompleteView
  if (isDemo) {
    data = demoBookingFlowFor(
      searchParams.get('from') ?? undefined,
      language,
      parsedOrderId,
    ).complete
  } else {
    if (!order) return null
    const displayOrderId = order.orderGroupId ?? parsedOrderId
    const children = order.orders ?? []
    const confirmed = children.filter(
      (child) =>
        paymentConfirmsPaid ||
        child.status === 'PAID' ||
        paymentQuery.data?.payments?.some(
          (payment) => payment.orderId === child.orderId && payment.paymentStatus === 'PAID',
        ),
    )
    const quantityOf = (child: (typeof children)[number]) =>
      child.items?.reduce((total, item) => total + (item.quantity ?? 0), 0) ||
      child.tickets?.length ||
      0
    const quantity = confirmed.reduce((total, child) => total + quantityOf(child), 0)
    const payableQuantity = children
      .filter((child) => child.status !== 'CANCELLED')
      .reduce((total, child) => total + quantityOf(child), 0)
    const cancelledQuantity = children
      .filter((child) => child.status === 'CANCELLED')
      .reduce((total, child) => total + quantityOf(child), 0)
    const paidAmount = partiallyPaid
      ? confirmed.length > 0 && confirmed.every((child) => child.amount != null)
        ? confirmed.reduce((total, child) => total + (child.amount ?? 0), 0)
        : null
      : order.totalAmount
    // payment 쿼리 폴백은 체인 확정 뒤 order의 PAID 반영이 늦는 짧은 구간에서만 쓰인다.
    const paidAt =
      confirmed
        .map((child) => child.payment?.paidAt)
        .filter((at): at is string => Boolean(at))
        .sort()
        .at(-1) ?? paymentQuery.data?.paidAt
    data = {
      performanceId: order.performanceId != null ? String(order.performanceId) : undefined,
      orderNumber: formatOrderNumber(displayOrderId),
      showTitle: order.performanceTitle ?? text('공연', 'Show'),
      dateLabel: order.startAt ? formatKst(order.startAt, undefined, language) : '—',
      venue: order.venueName ?? '—',
      ticketTypeName:
        [
          ...new Set(
            confirmed.flatMap(
              (child) => child.items?.map((item) => item.name).filter(Boolean) ?? [],
            ),
          ),
        ].join(' · ') || text('티켓', 'Ticket'),
      teamName: confirmed
        .map(
          (child) =>
            `${child.chosenTeamName ?? text('선택 없음', 'None selected')} · ${text(`${quantityOf(child)}장`, `${quantityOf(child)} tickets`)}`,
        )
        .join(' / '),
      quantity,
      totalPaidLabel: paidAmount == null ? '—' : formatYoyo(paidAmount),
      paidAtLabel: paidAt ? formatKst(paidAt, undefined, language) : '—',
      partial: partiallyPaid
        ? {
            paidQuantity: quantity,
            totalQuantity: payableQuantity,
            ...(cancelledQuantity > 0 ? { cancelledQuantity } : {}),
          }
        : undefined,
    }
  }

  return (
    <BookingComplete
      data={data}
      onViewTickets={() => navigate('/tickets')}
      onBackHome={() => navigate('/')}
      onResumePayment={
        // The completion page is intentionally fail-closed: only payment-02 proves that
        // this group still has a live payment window. Order-list `resumable` is not loaded here.
        !isDemo &&
        partiallyPaid &&
        !payingChild &&
        order?.orders?.some((child) => child.status === 'PENDING_PAYMENT') &&
        paymentQuery.data?.expiresAt &&
        Date.parse(paymentQuery.data.expiresAt) > Date.now()
          ? () => navigate(withQuery(`/orders/${order.orderGroupId ?? parsedOrderId}/payment`))
          : undefined
      }
    />
  )
}

export default BookingCompletePage
