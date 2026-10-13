/** A-12: the URL owns selection; mobile disclosures preserve the page's replace-collapse. */
import { Link } from 'react-router'
import type { ReactNode } from 'react'
import { OrderDetailPanel, ResumePaymentButton, type OrderDetail } from './OrderDetailPanel'
import { OrderStatusBadge, type OrderStatus } from './OrderStatusBadge'
import { useLocale } from '@/shared/i18n/useLocale'
import { AppHeader, BottomNav, formatYoyo } from '@/shared/ui'
import './order-history.css'

export interface OrderListItem extends OrderDetail {
  status: OrderStatus
  resumable?: boolean
  teamBreakdown?: { teamId?: number; teamName?: string; quantity?: number; amount?: number }[]
}

interface Props {
  orders: OrderListItem[]
  /** Independently loaded receipt; it is not an extra row in the current server page. */
  selectedOrder?: OrderListItem
  selectedId?: string
  loading?: boolean
  preview?: boolean
  error?: string
  onRetry?: () => void
  detailLoading?: boolean
  detailError?: string
  onRetryDetail?: () => void
  pagination?: ReactNode
  onSelect: (orderId: string) => void
  onCollapse: () => void
}

function OrderSummary({ order, selected }: { order: OrderListItem; selected?: boolean }) {
  const { text } = useLocale()
  return (
    <>
      <span className="order-row-meta">
        <span className="font-mono text-xs text-muted">{order.orderNumber}</span>
        <OrderStatusBadge status={order.status} />
      </span>
      <span className="order-row-title">{order.showTitle}</span>
      <span className="order-row-date">{order.dateLabel}</span>
      {order.teamBreakdown?.map((team, index) => (
        <span key={`${team.teamId ?? 'unknown'}-${team.teamName ?? 'team'}-${index}`} className="order-row-date">
          {team.teamName ?? '—'} ·{' '}
          {text(`${team.quantity ?? 0}장`, `${team.quantity ?? 0} tickets`)}
        </span>
      ))}
      <span className="order-row-total">
        <span className="font-num font-semibold tabular-nums">
          {order.totalAmount == null ? '—' : formatYoyo(order.totalAmount)}
        </span>
        {selected && (
          <span className="order-selected-label">
            {text('선택됨', 'Selected')} <span aria-hidden>↗</span>
          </span>
        )}
      </span>
    </>
  )
}

export function OrderList({
  orders,
  selectedOrder,
  selectedId,
  loading,
  onSelect,
  onCollapse,
  preview = true,
  error,
  onRetry,
  detailLoading,
  detailError,
  onRetryDetail,
  pagination,
}: Props) {
  const { text } = useLocale()
  // Preserve the existing desktop-first-item and collapsed-mobile contract.
  const pageSelected = selectedId ? orders.find((order) => order.orderId === selectedId) : orders[0]
  const desktopSelected = selectedOrder ?? pageSelected
  const showList = !error && !loading && orders.length > 0
  const detailContent = (order: OrderListItem) =>
    detailError ? (
      <div role="alert">
        <p>{detailError}</p>
        <button type="button" onClick={onRetryDetail}>
          {text('다시 시도', 'Retry')}
        </button>
      </div>
    ) : detailLoading ? (
      <>
        <p role="status">{text('주문 상세를 불러오는 중', 'Loading order details')}</p>
        {(order.status === 'PENDING_PAYMENT' || order.status === 'PARTIALLY_PAID') &&
          order.resumable === true && <ResumePaymentButton orderId={order.orderId} />}
      </>
    ) : (
      <>
        <OrderDetailPanel order={order} />
        {(order.status === 'PENDING_PAYMENT' || order.status === 'PARTIALLY_PAID') &&
          order.resumable !== false && <ResumePaymentButton orderId={order.orderId} />}
      </>
    )

  const receipt = (order: OrderListItem, mobile = false) => (
    <section
      aria-label={
        mobile
          ? text(`선택한 주문 ${order.orderNumber}`, `Selected order ${order.orderNumber}`)
          : text(`주문 ${order.orderNumber} 영수증`, `Receipt ${order.orderNumber}`)
      }
      className={mobile ? 'order-receipt md:hidden' : 'order-receipt'}
    >
      <header className="order-receipt-heading">
        <div className="order-row-meta">
          <p className="order-eyebrow">{text('주문 영수증', 'Order receipt')}</p>
          <OrderStatusBadge status={order.status} />
        </div>
        <span className="font-mono text-xs text-muted">{order.orderNumber}</span>
        <h2>{order.showTitle}</h2>
        <p className="order-receipt-venue">
          {order.dateLabel}
          <br />
          {order.venue}
        </p>
      </header>
      {detailContent(order)}
      {mobile && (
        <button type="button" onClick={onCollapse} className="min-h-11 px-4">
          {text('상세 닫기', 'Close order details')}
        </button>
      )}
    </section>
  )

  return (
    <div className="order-history min-h-dvh pb-20 md:pb-0">
      <AppHeader signedIn />
      <main className="order-history-main">
        <header className="order-history-heading">
          <div>
            <p className="order-eyebrow">{text('예매 기록', 'Your purchases')}</p>
            <h1>{text('주문 내역', 'Order history')}</h1>
            <p>
              {text(
                '주문을 선택해 결제 이력과 티켓을 확인하세요.',
                'Select an order to review its payment history and tickets.',
              )}
            </p>
          </div>
          {!loading && (
            <span className="order-count">
              {text(`${orders.length}건`, `${orders.length} orders`)}
            </span>
          )}
        </header>
        {preview && (
          <p className="order-preview-note">
            {text(
              '샘플 주문입니다. 실제 주문 내역은 아직 연결되지 않았어요.',
              'Sample orders. Your actual order history is not connected yet.',
            )}
          </p>
        )}

        {selectedId &&
          !desktopSelected &&
          (detailError ? (
            <div role="alert">
              <p>{detailError}</p>
              <button type="button" onClick={onRetryDetail}>
                {text('다시 시도', 'Retry')}
              </button>
            </div>
          ) : (
            detailLoading && (
              <p role="status">{text('주문 상세를 불러오는 중', 'Loading order details')}</p>
            )
          ))}
        {error ? (
          <div role="alert">
            <p>{error}</p>
            {onRetry && (
              <button type="button" onClick={onRetry}>
                {text('다시 시도', 'Retry')}
              </button>
            )}
          </div>
        ) : loading ? (
          <div
            aria-busy="true"
            aria-label={text('주문 내역을 불러오는 중', 'Loading order history')}
            className="order-loading"
          >
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-28 rounded-card bg-ground-2 motion-safe:animate-pulse"
              />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <section className="order-empty" role="status">
            <span aria-hidden className="order-empty-symbol">
              ↗
            </span>
            <h2>
              {selectedOrder
                ? text('이 페이지에 주문이 없습니다', 'No orders on this page.')
                : text('주문 내역이 없습니다', 'No orders yet.')}
            </h2>
            <p>
              {text(
                '주문이 생기면 이곳에서 결제 이력과 티켓을 확인할 수 있어요.',
                'Your payment history and tickets will appear here when you place an order.',
              )}
            </p>
          </section>
        ) : null}
        {showList && (
          <>
            <ul
              aria-label={text('주문 펼침 목록', 'Order disclosures')}
              className="order-mobile-list md:hidden"
            >
              {orders.map((order) => {
                const open = order.orderId === selectedId
                return (
                  <li
                    key={order.orderId}
                    className="order-mobile-card"
                    data-selected={open || undefined}
                  >
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={`order-panel-${order.orderId}`}
                      onClick={() => (open ? onCollapse() : onSelect(order.orderId))}
                      className="order-disclosure"
                    >
                      <span className="min-w-0 flex-1">
                        <OrderSummary order={order} selected={open} />
                      </span>
                      <span aria-hidden className="order-disclosure-icon">
                        {open ? '−' : '+'}
                      </span>
                    </button>
                    {open && (
                      <div id={`order-panel-${order.orderId}`} className="order-mobile-detail">
                        <p className="order-receipt-venue">
                          {desktopSelected?.venue ?? order.venue}
                        </p>
                        {detailContent(desktopSelected ?? order)}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
        {selectedId &&
          desktopSelected &&
          (!pageSelected || !showList) &&
          receipt(desktopSelected, true)}
        {(showList || desktopSelected) && (
          <div className="order-desktop-layout hidden md:grid">
            {showList && (
              <nav aria-label={text('주문 목록', 'Order list')} className="min-w-0">
                <div className="order-list-heading">
                  <span>{text('주문', 'Orders')}</span>
                  <span>{text('상태 · 금액', 'Status · Amount')}</span>
                </div>
                <ul className="order-desktop-list">
                  {orders.map((order) => {
                    const active = order.orderId === desktopSelected?.orderId
                    return (
                      <li key={order.orderId}>
                        <Link
                          to={`/orders/${order.orderId}`}
                          aria-current={active ? 'true' : undefined}
                          className="order-list-link"
                        >
                          <OrderSummary order={order} selected={active} />
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </nav>
            )}
            {desktopSelected && receipt(desktopSelected)}
          </div>
        )}
        {pagination}
      </main>
      <BottomNav />
    </div>
  )
}
