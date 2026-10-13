/**
 * 주문 상세 패널 — A-12 컴포넌트 표의 "주문 상세 패널".
 *
 * 모바일에서는 카드 안에 펼쳐지고, PC에서는 우측 열에 그대로 들어간다.
 * **같은 컴포넌트를 두 자리에 쓴다** — 두 벌로 나누면 내용이 갈라진다.
 *
 * 담는 것 — 결제·환불 상태 이력(시각은 회원 시간대 + KST 병기) · 티켓 목록.
 * v4에 있던 **결제 수단 표기와 연결 확보 내역 패널은 없다.** 결제 경로가 하나뿐이라
 * 구분할 게 없어 v5에서 삭제됐다.
 *
 * 관객 화면이라 tx 해시·주소를 노출하지 않는다(§1.2 원칙 2·11).
 */

import { Link, useNavigate } from 'react-router'

import { Button, formatYoyo } from '@/shared/ui'
import { useLocale } from '@/shared/i18n/useLocale'

/** §5.1 Payment 6상태 */
export type PaymentStatus =
  'REQUESTED' | 'AWAITING_SIGNATURE' | 'PAYING' | 'PAID' | 'FAILED' | 'REFUNDED'

const PAYMENT_LABEL: Record<PaymentStatus, { en: string; ko: string }> = {
  REQUESTED: { en: 'Requested', ko: '요청됨' },
  AWAITING_SIGNATURE: { en: 'Waiting for confirmation', ko: '서명 대기' },
  PAYING: { en: 'Confirming', ko: '확인 중' },
  PAID: { en: 'Paid', ko: '결제 완료' },
  FAILED: { en: 'Payment failed', ko: '결제 실패' },
  REFUNDED: { en: 'Refunded', ko: '환불됨' },
}

export interface OrderHistoryEntry {
  orderId?: number
  teamName?: string
  status: PaymentStatus
  /** 회원 시간대 + KST 병기 */
  atLabel: string
}

export interface OrderTicket {
  ticketId: string
  ticketNumber: string
  ticketTypeName: string
  teamName: string
  /** 취소된 티켓은 목록에서 흐리게 */
  cancelled?: boolean
}

export interface OrderDetail {
  orderId: string
  orderNumber: string
  showTitle: string
  dateLabel: string
  venue: string
  totalAmount: number | null
  approxLabel?: string
  history: OrderHistoryEntry[]
  tickets: OrderTicket[]
}

export function OrderDetailPanel({ order }: { order: OrderDetail }) {
  const { text } = useLocale()
  return (
    <div className="order-receipt-body">
      {/* 결제·환불 상태 이력 */}
      <section>
        <h3 className="order-section-title">{text('결제 이력', 'Payment history')}</h3>
        {order.history.length === 0 && (
          <p className="text-xs text-muted">
            {text('결제 정보가 없습니다.', 'No payment information available.')}
          </p>
        )}
        <ol aria-label={text('결제 이력', 'Payment history')} className="order-timeline">
          {order.history.map((h, i) => {
            const label = PAYMENT_LABEL[h.status]
            const latest = i === 0
            return (
              <li
                key={`${h.orderId ?? i}-${h.status}-${h.atLabel}`}
                className="order-timeline-entry"
              >
                <span
                  aria-hidden
                  className={[
                    'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                    latest ? 'bg-sel' : 'bg-line',
                  ].join(' ')}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={[
                      'block font-sans text-xs',
                      latest ? 'font-semibold text-ink' : 'text-muted',
                    ].join(' ')}
                  >
                    {h.teamName ? `${h.teamName} · ` : ''}
                    {text(label.ko, label.en)}
                  </span>
                  <span className="block font-sans text-[11px] text-faint">{h.atLabel}</span>
                </span>
              </li>
            )
          })}
        </ol>
      </section>

      {/* 티켓 목록 */}
      <section>
        <h3 className="order-section-title">
          {text(`티켓 ${order.tickets.length}장`, `Tickets (${order.tickets.length})`)}
        </h3>
        {order.tickets.length === 0 ? (
          <p className="m-0 font-sans text-xs text-muted">
            {text(
              '발급된 티켓이 없어요. 결제가 끝나면 여기에 나타납니다.',
              'No tickets have been issued. They will appear here after payment.',
            )}
          </p>
        ) : (
          <ul className="m-0 list-none overflow-hidden rounded-card border border-line p-0">
            {order.tickets.map((t) => (
              <li key={t.ticketId} className="border-b border-line last:border-b-0">
                <Link
                  to={`/tickets/${t.ticketId}`}
                  className={[
                    'order-ticket-link flex min-h-11 items-center gap-2 px-3 py-3',
                    t.cancelled ? 'order-ticket-cancelled' : '',
                  ].join(' ')}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-xs font-semibold text-ink">
                      {t.ticketNumber}
                    </span>
                    <span className="block font-sans text-[11px] text-muted">
                      {t.ticketTypeName} · {t.teamName}
                      {t.cancelled && text(' · 취소됨', ' · Cancelled')}
                    </span>
                  </span>
                  <span aria-hidden className="font-sans text-muted">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 합계 */}
      <section className="order-receipt-total">
        <span className="font-sans text-[13px] font-semibold text-ink">
          {text('합계', 'Total')}
        </span>
        <span className="text-right">
          <span className="block font-mono text-base font-bold text-ink">
            {order.totalAmount == null ? '—' : formatYoyo(order.totalAmount)}
          </span>
          {order.approxLabel && (
            <span className="block font-sans text-[11px] text-muted">≈ {order.approxLabel}</span>
          )}
        </span>
      </section>
    </div>
  )
}

/**
 * `PENDING_PAYMENT` 주문에만 노출한다(A-12 컴포넌트 표).
 *
 * `Link`로 `Button`을 감싸지 않는다 — 앵커 안의 버튼은 유효하지 않은 마크업이고
 * 클릭이 두 번 처리된다. 이동은 `useNavigate`로 한다.
 */
export function ResumePaymentButton({ orderId }: { orderId: string }) {
  const navigate = useNavigate()
  const { text } = useLocale()
  return (
    <div className="mt-4">
      <Button full onClick={() => navigate(`/orders/${orderId}/payment`)}>
        {text('결제 이어하기', 'Resume payment')}
      </Button>
    </div>
  )
}
