/**
 * 주문 상태 배지 — 화면설계 v6 §5.1 상태값 → 화면 라벨 매핑.
 *
 * `TicketOrder`는 4상태다: `PENDING_PAYMENT` / `PAID` / `CANCELLED` / `REFUNDED`.
 * 공연 상태(`StatusBadge`)와 값이 겹치지 않아 따로 둔다.
 *
 * **색만으로 구분하지 않는다**(A-12 접근성 고려) — 라벨 문구를 항상 함께 쓰고,
 * 색은 보조 신호로만 쓴다.
 */

import { useLocale } from '@/shared/i18n/useLocale'

export type OrderStatus = 'PENDING_PAYMENT' | 'PAID' | 'PARTIALLY_PAID' | 'CANCELLED' | 'REFUNDED'

const MAP: Record<OrderStatus, { en: string; ko: string; className: string }> = {
  PENDING_PAYMENT: {
    en: 'Pending payment',
    ko: '결제 대기',
    className: 'bg-sel-soft text-ink',
  },
  PAID: { en: 'Paid', ko: '결제 완료', className: 'bg-primary text-white' },
  PARTIALLY_PAID: { en: 'Partially paid', ko: '일부 결제 완료', className: 'bg-sel-soft text-ink' },
  CANCELLED: { en: 'Cancelled', ko: '주문 취소', className: 'bg-ground-2 text-muted' },
  REFUNDED: { en: 'Refunded', ko: '환불 완료', className: 'bg-ground-2 text-muted' },
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { text } = useLocale()
  const s = MAP[status]
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center rounded-chip px-2 font-sans text-[11px] font-semibold ${s.className}`}
    >
      {text(s.ko, s.en)}
    </span>
  )
}

export const ORDER_STATUS_LABEL = MAP
