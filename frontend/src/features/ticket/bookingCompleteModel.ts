export interface BookingCompleteView {
  /** 예매번호. 화면 제목에 들어간다 */
  orderNumber: string
  showTitle: string
  dateLabel: string
  venue: string
  ticketTypeName: string
  teamName: string
  quantity: number
  /** 실제 결제된 금액 (YoYo 정수) */
  totalPaidLabel: string
  /** 결제 완료 시각 (회원 시간대 + KST 병기) */
  paidAtLabel: string
  posterImageUrl?: string | null
  performanceId?: string
  /** Partial groups show only confirmed tickets and their paid amount. */
  partial?: { paidQuantity: number; totalQuantity: number; cancelledQuantity?: number }
}

export function formatOrderNumber(orderId: number | string): string {
  return `ORD-${String(orderId).padStart(4, '0')}`
}
