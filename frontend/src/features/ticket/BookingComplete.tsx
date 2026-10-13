/**
 * A-06 예매 완료.
 *
 * 정본 — 와이어프레임 A-06R(모바일 360) · A-06DR(1440) · 화면설계 v6 §4 A-06
 *        · API 명세 v6 API-ticket-03(주문 상세)
 *
 * - 성공 안내 → 발행된 실물형 티켓 → 버튼 2개(모바일 세로·PC 가로).
 * - 기존 정보 그리드는 티켓 article/dl로 통합해 중복 낭독을 피한다.
 *   결제 시각까지 같은 BookingCompleteView에서 읽으며, CTA는 연출 밖에 둔다.
 *
 * 와이어프레임 수정 요청 §12 반영 —
 *   · **"Remaining balance" 항목을 두지 않는다**(요청서가 삭제하라고 한 항목)
 *   · Label과 Value 영역을 분리해 텍스트가 겹치지 않게 한다
 *   · 성공 아이콘·제목·정보·버튼 사이 간격을 넉넉히 준다
 *   · View my tickets와 Back to home 사이 간격 16px 이상
 *
 * 관객 화면이라 tx 해시·주소를 노출하지 않는다(화면설계 v6 §1.2 원칙 2·11).
 * 결제가 온체인에서 확정된 뒤에 도달하는 화면이지만, 그 사실을 체인 용어로 말하지 않는다.
 */

import { Button } from '@/shared/ui'
import { useLocale } from '@/shared/i18n/useLocale'

import { IssuedTicketHero } from './IssuedTicketHero'
import type { BookingCompleteView } from './bookingCompleteModel'

export type { BookingCompleteView } from './bookingCompleteModel'

interface Props {
  data: BookingCompleteView
  onViewTickets: () => void
  onBackHome: () => void
  onResumePayment?: () => void
}

function SuccessIcon() {
  return (
    <span
      data-complete-part="success-icon"
      className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 md:h-16 md:w-16"
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-primary md:h-7 md:w-7"
        aria-hidden
      >
        <path data-complete-part="check" d="M22 11.08V12a10 10 0 11-5.93-9.14" />
        <path data-complete-part="check" d="M22 4L12 14.01l-3-3" />
      </svg>
    </span>
  )
}

export function BookingComplete({ data, onViewTickets, onBackHome, onResumePayment }: Props) {
  const { text } = useLocale()
  return (
    <div className="min-h-dvh">
      <div className="mx-auto max-w-[1200px] px-4 pb-6 pt-8 md:px-10 md:py-10">
        {/* 성공 히어로 */}
        <div className="mb-2 flex flex-col items-center gap-2.5 md:mb-3 md:gap-3">
          <SuccessIcon />
          <div className="text-center">
            <h1
              data-complete-part="heading"
              className="mb-3 break-words font-sans text-xl font-bold leading-snug tracking-tight text-ink md:text-3xl"
            >
              {data.partial
                ? text('일부 티켓의 예매가 완료되었습니다', 'Part of your booking is confirmed')
                : text('예매가 완료되었습니다', 'You’re going to the show')}
            </h1>
            <p
              data-complete-part="description"
              className="m-0 break-words font-sans text-xs text-muted md:text-sm"
            >
              {data.partial
                ? data.partial.cancelledQuantity &&
                  data.partial.paidQuantity >= data.partial.totalQuantity
                  ? text(
                      `${data.partial.paidQuantity}장 결제 완료 · ${data.partial.cancelledQuantity}장 주문 만료·취소`,
                      `${data.partial.paidQuantity} tickets paid · ${data.partial.cancelledQuantity} expired or cancelled`,
                    )
                  : text(
                      `${data.partial.totalQuantity}장 중 ${data.partial.paidQuantity}장 결제됨${data.partial.cancelledQuantity ? ` · ${data.partial.cancelledQuantity}장 주문 만료·취소` : ''} · 발급된 티켓은 그대로 사용할 수 있어요.`,
                      `${data.partial.paidQuantity} of ${data.partial.totalQuantity} tickets paid${data.partial.cancelledQuantity ? ` · ${data.partial.cancelledQuantity} expired or cancelled` : ''}. Your issued tickets remain valid.`,
                    )
                : text(
                    `예매번호 ${data.orderNumber} · 아래에서 티켓을 확인해 주세요.`,
                    `Booking ${data.orderNumber} is complete. Check your tickets below.`,
                  )}
            </p>
          </div>
        </div>

        <IssuedTicketHero data={data} />

        {/* 버튼 — 모바일 세로 전폭 / PC 가로 내용 폭. 간격 16px(요청 §12) */}
        <div
          data-complete-part="actions"
          className="mx-auto flex max-w-[640px] flex-col gap-4 md:flex-row md:justify-center md:[&>button]:w-auto"
        >
          {onResumePayment && (
            <Button full onClick={onResumePayment}>
              {text('결제 이어하기', 'Resume payment')}
            </Button>
          )}
          <Button full onClick={onViewTickets}>
            {text('내 티켓 보기', 'View my tickets')}
          </Button>
          <Button variant="secondary" full onClick={onBackHome}>
            {text('홈으로', 'Back to home')}
          </Button>
        </div>
      </div>
    </div>
  )
}
