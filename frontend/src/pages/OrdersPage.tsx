/** A-12: list and independently fetched receipt, selected by the URL. */
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { OrderList, type OrderListItem } from '@/features/order/OrderList'
import { ORDER_STATUS_LABEL, type OrderStatus } from '@/features/order/OrderStatusBadge'
import type { PaymentStatus } from '@/features/order/OrderDetailPanel'
import { useMyOrders, useOrderDetail } from '@/shared/queries/order'
import { useLocale } from '@/shared/i18n/useLocale'
import { Button, formatKst } from '@/shared/ui'

const paymentStatuses: PaymentStatus[] = [
  'REQUESTED',
  'AWAITING_SIGNATURE',
  'PAYING',
  'PAID',
  'FAILED',
  'REFUNDED',
]

export function OrdersPage() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const { language, text } = useLocale()
  const [page, setPage] = useState(0)
  const list = useMyOrders({ page, size: 20 })
  const [observedResumable, setObservedResumable] = useState<
    Record<number, { resumable: boolean; expiresAt?: string | null }>
  >({})
  useEffect(() => {
    const items = list.data?.items
    if (!items?.length) return
    setObservedResumable((previous) => {
      const next = { ...previous }
      let changed = false
      for (const item of items) {
        if (item.orderGroupId === undefined) continue
        const resumable = item.resumable === true
        const prior = previous[item.orderGroupId]
        if (prior?.resumable === resumable && prior.expiresAt === item.expiresAt) continue
        next[item.orderGroupId] = { resumable, expiresAt: item.expiresAt }
        changed = true
      }
      return changed ? next : previous
    })
  }, [list.data])
  const validId = (id: number | undefined): id is number =>
    Number.isSafeInteger(id) && (id ?? 0) > 0
  const routeId = orderId && /^\d+$/.test(orderId) ? Number(orderId) : undefined
  const invalidRoute = orderId !== undefined && !validId(routeId)
  const selectedId = invalidRoute ? undefined : (routeId ?? list.data?.items?.[0]?.orderGroupId)
  const detail = useOrderDetail(validId(selectedId) ? selectedId : undefined)
  const date = (iso: string | undefined | null) => (iso ? formatKst(iso, undefined, language) : '—')
  const orders: OrderListItem[] = (list.data?.items ?? []).flatMap((item) => {
    if (
      !validId(item.orderGroupId) ||
      !item.groupStatus ||
      !Object.hasOwn(ORDER_STATUS_LABEL, item.groupStatus)
    )
      return []
    return [
      {
        orderId: String(item.orderGroupId),
        orderNumber: String(item.orderGroupId),
        showTitle: item.performanceTitle ?? '—',
        dateLabel: date(item.startAt),
        venue: '—',
        status: item.groupStatus as OrderStatus,
        teamBreakdown: item.teamBreakdown,
        totalAmount: item.totalAmount ?? null,
        history: [],
        tickets: [],
        resumable:
          item.resumable === true &&
          (!item.expiresAt || Date.parse(item.expiresAt) > Date.now()),
      },
    ]
  })
  const data = detail.data
  const groupId = data?.orderGroupId ?? selectedId
  const selectedListItem = list.data?.items?.find((item) => item.orderGroupId === groupId)
  const selectedResume =
    selectedListItem ?? (validId(groupId) ? observedResumable[groupId] : undefined)
  const selected =
    data &&
    validId(data.orderGroupId) &&
    (data.orderGroupId === selectedId ||
      data.orders?.some((child) => child.orderId === selectedId)) &&
    data.groupStatus &&
    Object.hasOwn(ORDER_STATUS_LABEL, data.groupStatus)
      ? ({
          orderId: String(data.orderGroupId),
          orderNumber: String(data.orderGroupId),
          showTitle: data.performanceTitle ?? '—',
          dateLabel: date(data.startAt),
          venue: data.venueName ?? '—',
          status: data.groupStatus as OrderStatus,
          totalAmount: data.totalAmount ?? null,
          approxLabel:
            data.display?.approx != null
              ? `${data.display.currency} ${data.display.approx.toFixed(2)}`
              : undefined,
          // API-ticket-03 returns the current payment, not an event timeline. Never invent past states.
          history: (data.orders ?? []).flatMap((child) =>
            child.payment?.status && paymentStatuses.includes(child.payment.status as PaymentStatus)
              ? [
                  {
                    orderId: child.orderId,
                    teamName: child.chosenTeamName,
                    status: child.payment.status as PaymentStatus,
                    atLabel: child.payment.status === 'PAID' ? date(child.payment.paidAt) : '—',
                  },
                ]
              : [],
          ),
          tickets: (data.orders ?? []).flatMap((child) =>
            (child.tickets ?? []).flatMap((ticket) =>
              validId(ticket.ticketId)
                ? [
                    {
                      ticketId: String(ticket.ticketId),
                      ticketNumber: String(ticket.ticketId),
                      ticketTypeName: ticket.ticketTypeName ?? '—',
                      teamName: child.chosenTeamName ?? '—',
                      cancelled: ticket.status === 'CANCELLED',
                    },
                  ]
                : [],
            ),
          ),
          // Only the list supplies resumable (including expiry). Keep observed flags across pages,
          // but a current false or newer payment state wins. Unseen deep links remain unknown.
          resumable:
            (data.groupStatus === 'PENDING_PAYMENT' || data.groupStatus === 'PARTIALLY_PAID') &&
            (data.orders ?? []).some(
              (child) =>
                child.status === 'PENDING_PAYMENT' &&
                (!child.payment ||
                  ['AWAITING_SIGNATURE', 'FAILED'].includes(child.payment.status ?? '')),
            ) &&
            !(data.orders ?? []).some((child) => child.payment?.status === 'PAYING') &&
            selectedResume?.resumable === true &&
            (!selectedResume.expiresAt || Date.parse(selectedResume.expiresAt) > Date.now()),
        } satisfies OrderListItem)
      : undefined
  const error = invalidRoute
    ? text('잘못된 주문 번호입니다.', 'Invalid order.')
    : list.isError
      ? text('주문 내역을 불러오지 못했습니다.', 'Could not load orders.')
      : undefined
  return (
    <OrderList
      orders={error ? [] : orders}
      selectedOrder={selected}
      selectedId={
        orderId !== undefined && validId(routeId) ? (selected?.orderId ?? String(routeId)) : orderId
      }
      loading={list.isLoading}
      preview={false}
      error={error}
      onRetry={
        invalidRoute
          ? undefined
          : () => {
              void list.refetch()
            }
      }
      detailLoading={detail.isLoading}
      detailError={
        !invalidRoute && (detail.isError || (detail.data && !selected))
          ? text('주문 상세를 불러오지 못했습니다.', 'Could not load order details.')
          : undefined
      }
      onRetryDetail={() => {
        void detail.refetch()
      }}
      onSelect={(id) => navigate(`/orders/${id}`)}
      onCollapse={() => navigate('/orders', { replace: true })}
      pagination={
        !error && list.data?.pageInfo ? (
          <nav
            aria-label={text('주문 페이지', 'Order pages')}
            className="flex items-center justify-center gap-4 py-6"
          >
            <Button
              variant="secondary"
              disabled={page === 0 || list.isFetching}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
            >
              {text('이전 페이지', 'Previous page')}
            </Button>
            <span>{page + 1}</span>
            <Button
              variant="secondary"
              disabled={!list.data.pageInfo.hasNext || list.isFetching}
              onClick={() => setPage((value) => value + 1)}
            >
              {text('다음 페이지', 'Next page')}
            </Button>
          </nav>
        ) : undefined
      }
    />
  )
}

export default OrdersPage
