/**
 * 주문 요약 패널.
 *
 * 와이어프레임 `OrderSummaryPanel`(A-03DR~A-05DR 우측 sticky) 이식.
 * PC에서는 우측 sticky 패널, 모바일에서는 본문 아래 카드로 쓴다.
 */

import { Money, Poster } from '@/shared/ui'
import { useLocale } from '@/shared/i18n/useLocale'

export interface OrderSummaryData {
  showTitle: string
  dateLabel: string
  venue: string
  posterImageUrl?: string | null
  /** 포스터 더미의 seed. 없으면 `showTitle`로 떨어진다 — 제목만 같아도 그림은 일치한다 */
  performanceId?: string
  ticketTypeName: string
  quantity: number
  /** 단가 × 수량 (YoYo 정수) */
  totalAmount: number
  totalApprox?: string
  /** 팀 선택 단계(A-04) 이후에만 표시 */
  teamName?: string
  /** 여러 팀에 티켓 수를 나눠 배분한 경우. 새 계약 적용 전까지 teamName도 유지한다. */
  teamAllocations?: { teamName: string; quantity: number }[]
}

export function OrderSummary({ data }: { data: OrderSummaryData }) {
  const { text } = useLocale()
  return (
    <div className="checkout-panel">
      <p className="mb-6 font-sans text-base font-semibold text-ink">
        {text('주문 요약', 'Order summary')}
      </p>

      <div className="mb-4 flex gap-3">
        <div className="w-12 shrink-0">
          <Poster
            src={data.posterImageUrl}
            seed={data.performanceId ?? data.showTitle}
            label={data.showTitle}
            ratio="2/3"
            className="rounded-[4px]"
          />
        </div>
        <div className="min-w-0">
          <p className="mb-0.5 font-sans text-xs font-semibold leading-snug text-ink">
            {data.showTitle}
          </p>
          <p className="mb-0.5 font-sans text-[11px] text-muted">{data.dateLabel}</p>
          <p className="m-0 font-sans text-[11px] text-muted">{data.venue}</p>
        </div>
      </div>

      <div className="border-t border-line pt-3.5">
        <div className="mb-2 flex justify-between">
          <span className="font-sans text-[11px] text-muted">{text('티켓', 'Ticket')}</span>
          <span className="font-sans text-xs text-ink">
            {data.ticketTypeName} × {data.quantity}
          </span>
        </div>
        {data.teamAllocations?.map((allocation) => (
          <div key={allocation.teamName} className="mb-2 flex justify-between gap-3">
            <span className="font-sans text-[11px] text-muted">{text('응원 팀', 'Team')}</span>
            <span className="text-right font-sans text-xs text-ink">
              {allocation.teamName} × {allocation.quantity}
            </span>
          </div>
        ))}
        {!data.teamAllocations?.length && data.teamName && (
          <div className="mb-2 flex justify-between">
            <span className="font-sans text-[11px] text-muted">{text('응원 팀', 'Team')}</span>
            <span className="font-sans text-xs text-ink">{data.teamName}</span>
          </div>
        )}
        <div className="mt-1 flex items-start justify-between border-t border-line pt-3">
          <span className="font-sans text-[13px] font-bold text-ink">{text('합계', 'Total')}</span>
          <span className="text-right">
            <Money
              amount={data.totalAmount}
              approx={data.totalApprox}
              strong
              className="text-[15px] text-primary"
            />
          </span>
        </div>
      </div>
    </div>
  )
}
