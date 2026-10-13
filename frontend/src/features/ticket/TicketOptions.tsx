/**
 * A-03 예매 — 옵션·수량.
 *
 * 정본 — 와이어프레임 A-03R(모바일 360) · A-03DR(1440) · 화면설계 v6 §4 A-03
 *        · API 명세 v6 API-performance-03(옵션 조회) → API-ticket-01(주문 생성)
 *
 * - 모바일: Stepper → 옵션 라디오 → 수량 → 합계, `Next`는 하단 고정
 * - PC: 최대폭 1200px 2열, 우측 320px sticky 주문 요약
 *
 * 선택 상태는 배경색으로만 표현한다(수정 요청 §14). 수량 상한 4는 요구사항 v6 §7.3.
 * 합계 환산은 클라이언트가 계산한다 — 주문 생성 전이라 서버 `display`가 없다(§5.4 예외).
 */

import { useState } from 'react'
import { useLocale } from '@/shared/i18n/useLocale'
import './booking-selection.css'

import { OrderSummary } from '@/features/ticket/OrderSummary'
import {
  BOOKING_STEPS,
  Button,
  FixedBottom,
  Money,
  MobileHeader,
  QuantityStepper,
  SelectableRow,
  Stepper,
} from '@/shared/ui'

export interface TicketTypeView {
  ticketTypeId: string
  name: string
  /**
   * 단가 (YoYo 정수). **`undefined`는 0원이 아니라 "모른다"**이다(§5.10).
   * 가격을 모르면 합계를 계산할 수 없고, 계산해 보낸 `totalAmount`가 서버와 어긋나면
   * 결제 단계에서 `PAYMENT_AMOUNT_MISMATCH`가 난다. 그래서 고를 수 없게 막는다.
   */
  price?: number
  /** 표시 통화 환산 문자열 */
  priceApprox?: string
  /** 잔여 수량. 0이면 매진, `undefined`면 모른다(매진이 아니다) */
  remaining?: number
}

export interface TicketOptionsView {
  /** 포스터 더미 seed. A-02에서 넘어온 공연 ID를 그대로 들고 온다 */
  performanceId?: string
  showTitle: string
  dateLabel: string
  venue: string
  posterImageUrl?: string | null
  ticketTypes: TicketTypeView[]
}

interface Props {
  data: TicketOptionsView
  onNext: (selection: { ticketTypeId: string; quantity: number }) => void
}

const MAX_QUANTITY = 4

/** 고를 수 있는 옵션인가 — 매진이 아니고 **단가를 안다**. */
function isSelectable(t: TicketTypeView): boolean {
  return t.remaining !== 0 && t.price != null
}

export function TicketOptions({ data, onNext }: Props) {
  const { text } = useLocale()
  // 고를 수 없는 줄을 초기 선택으로 잡으면 Next가 처음부터 죽은 채로 보인다
  const [selectedId, setSelectedId] = useState(
    () => data.ticketTypes.find(isSelectable)?.ticketTypeId ?? '',
  )
  const [quantity, setQuantity] = useState(1)

  const selected = data.ticketTypes.find((t) => t.ticketTypeId === selectedId)
  // A cached selection can outlive its stock count or be switched to a scarcer option.
  const maxQuantity = Math.max(1, Math.min(MAX_QUANTITY, selected?.remaining ?? MAX_QUANTITY))
  if (quantity > maxQuantity) setQuantity(maxQuantity)
  // 아무것도 고르지 않았으면 합계는 0이다(0원짜리 티켓이 아니라 0장이다)
  const total = selected?.price != null ? selected.price * quantity : 0
  const canProceed = selected != null && isSelectable(selected) && quantity <= maxQuantity

  const summary = (
    <OrderSummary
      data={{
        performanceId: data.performanceId,
        showTitle: data.showTitle,
        dateLabel: data.dateLabel,
        venue: data.venue,
        posterImageUrl: data.posterImageUrl,
        ticketTypeName: selected?.name ?? '—',
        quantity,
        totalAmount: total,
      }}
    />
  )

  return (
    <div className="booking-selection-page min-h-dvh">
      <MobileHeader title={text('티켓 선택', 'Choose your tickets')} />

      <main className="booking-selection-shell">
        <div className="booking-selection-layout">
          <section className="booking-selection-main">
            <Stepper steps={BOOKING_STEPS} active={0} />

            <h1 className="booking-selection-title hidden md:block">
              {text('티켓 선택', 'Choose tickets')}
            </h1>
            <div className="booking-selection-performance">
              <strong>{data.showTitle}</strong>
              <span>{data.dateLabel}</span>
              <span>{data.venue}</span>
            </div>

            {/* 티켓 타입 */}
            <div
              role="radiogroup"
              aria-label={text('티켓 종류', 'Ticket types')}
              className="booking-selection-options"
            >
              {data.ticketTypes.map((t) => {
                const soldOut = t.remaining === 0
                return (
                  <SelectableRow
                    key={t.ticketTypeId}
                    selected={selectedId === t.ticketTypeId}
                    disabled={!isSelectable(t)}
                    onSelect={() => setSelectedId(t.ticketTypeId)}
                  >
                    <span className="flex-1">
                      <span className="block font-sans text-[13px] font-semibold text-ink md:text-[15px]">
                        {t.name}
                      </span>
                      {/* 잔여를 모르면 그 자리를 비운다 — "0석"도 "매진"도 아니다 */}
                      <span className="mt-0.5 block font-sans text-[11px] text-muted md:text-xs">
                        {soldOut
                          ? text('매진', 'Sold out')
                          : t.price == null
                            ? text('가격 정보를 불러오지 못했어요', 'Price unavailable')
                            : t.remaining != null
                              ? text(`${t.remaining}석 남음`, `${t.remaining} remaining`)
                              : ''}
                      </span>
                    </span>
                    <span className="text-right">
                      {t.price == null ? (
                        <span className="font-sans text-[13px] text-muted md:text-[15px]">—</span>
                      ) : (
                        <Money
                          amount={t.price}
                          approx={t.priceApprox}
                          strong
                          className="text-[13px] text-ink md:text-[15px]"
                        />
                      )}
                    </span>
                  </SelectableRow>
                )
              })}
            </div>

            {/* 수량 */}
            <div className="booking-selection-quantity">
              <span className="font-sans text-[13px] font-semibold text-ink md:flex-1 md:text-sm">
                {text('수량', 'Quantity')}
              </span>
              <QuantityStepper value={quantity} onChange={setQuantity} max={maxQuantity} />
              <span className="font-sans text-[11px] text-muted md:text-xs">
                {text(`최대 ${maxQuantity}매`, `Up to ${maxQuantity}`)}
              </span>
            </div>

            {/* 합계 — 모바일 전용(PC는 우측 요약 패널이 대신한다) */}
            <div className="booking-selection-mobile-total md:hidden">
              <div className="mb-2.5 flex justify-between">
                <span className="font-sans text-xs text-muted">
                  {selected?.name ?? '—'} × {quantity}
                </span>
                <Money amount={total} className="text-xs text-ink" />
              </div>
              <div className="flex justify-between border-t border-line pt-2.5">
                <span className="font-sans text-[13px] font-bold text-ink">
                  {text('총 결제 금액', 'Total')}
                </span>
                <Money amount={total} strong className="text-sm text-ink" />
              </div>
            </div>

            <div className="mt-6 hidden md:block">
              <Button
                disabled={!canProceed}
                onClick={() => onNext({ ticketTypeId: selectedId, quantity })}
              >
                {text('다음: 팀 선택', 'Next: Select team')}
              </Button>
            </div>

            <div className="h-[72px] md:hidden" />
          </section>

          {/* PC 우측 sticky 요약 */}
          <aside className="booking-selection-summary hidden md:sticky md:top-6 md:block md:self-start">
            {summary}
          </aside>
        </div>
      </main>

      <FixedBottom>
        <Button
          full
          disabled={!canProceed}
          onClick={() => onNext({ ticketTypeId: selectedId, quantity })}
        >
          {text('다음: 팀 선택', 'Next: Select team')}
        </Button>
      </FixedBottom>
    </div>
  )
}
