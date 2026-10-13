/**
 * 관객 예매 세로축의 데모 데이터.
 *
 * 각 페이지가 독립된 와이어프레임 샘플을 들고 있으면 공연 상세에서 고른 공연이 다음 단계에서
 * 다른 공연으로 바뀐다. 실제 API를 붙이기 전까지도 URL의 performanceId 하나가 상세·옵션·팀·결제·
 * 완료 화면을 함께 결정하도록 이 파일에서만 데모 값을 만든다.
 *
 * pages 계층에 두는 이유 — 반환 타입은 여러 feature의 view contract를 조합한다. features끼리 직접
 * import하지 않는 의존 규칙을 지키면서, API 연결 시 페이지 단위로 이 fixture만 제거할 수 있다.
 */

import type { PaymentView } from '@/features/payment/PaymentScreen'
import type { PerformanceDetailView } from '@/features/performance/PerformanceDetail'
import type { BookingCompleteView } from '@/features/ticket/BookingComplete'
import { formatOrderNumber } from '@/features/ticket/bookingCompleteModel'
import type { TeamChoiceView } from '@/features/ticket/TeamChoice'
import type { TicketOptionsView, TicketTypeView } from '@/features/ticket/TicketOptions'
import { formatKst } from '@/shared/ui/format'

export interface DemoBookingFlow {
  detail: PerformanceDetailView
  ticketOptions: TicketOptionsView
  teamChoice: TeamChoiceView
  payment: PaymentView
  complete: BookingCompleteView
}

const DETAILS: Record<string, PerformanceDetailView> = {
  '12': {
    performanceId: 12,
    posterImageUrl: '/posters/12.webp',
    title: 'aespa — Synk: Parallel Line',
    status: 'on-sale',
    dateLabel: '9월 20일 오후 6:30 KST',
    venue: 'KSPO Dome, Seoul',
    teamNames: ['aespa', 'GOT the beat'],
    minPriceLabel: '88,000 YoYo',
    minPriceApprox: '$65.19',
    description:
      'aespa의 두 번째 단독 콘서트 투어. Synk: Parallel Line은 두 개의 평행한 세계를 가로지르는 이야기로 구성된 공연으로, 독창적인 무대 연출과 특수 효과로 관객을 맞이합니다.',
  },
  '8': {
    performanceId: 8,
    posterImageUrl: '/posters/8.webp',
    title: 'BTS — Yet To Come in BUSAN',
    status: 'on-sale',
    dateLabel: '3월 14일 오후 7:00 KST',
    venue: 'Busan Asiad Main Stadium',
    teamNames: ['BTS'],
    minPriceLabel: '165,000 YoYo',
    minPriceApprox: '$122.20',
    description:
      '서울월드컵경기장에서 열리는 단독 스타디움 공연. 데뷔 이후의 대표곡을 한 무대에 모은 세트리스트로, 스탠딩과 지정석을 함께 운영합니다.',
  },
  '5': {
    performanceId: 5,
    posterImageUrl: '/posters/5.webp',
    title: 'IU Concert — The Golden Hour',
    status: 'on-sale',
    dateLabel: '9월 14일 오후 7:00 KST',
    venue: 'Olympic Main Stadium',
    teamNames: ['IU'],
    minPriceLabel: '132,000 YoYo',
    minPriceApprox: '$97.80',
    description:
      '해가 지는 시간에 시작해 밤으로 이어지는 야외 공연. 스탠딩과 지정석을 함께 운영합니다.',
  },
  '7': {
    performanceId: 7,
    title: 'Seoul Indie Night vol.12',
    status: 'on-sale',
    dateLabel: '9월 26일 오후 7:00 KST',
    venue: 'Rolling Hall, Seoul',
    teamNames: ['Dabda', 'Say Sue Me', 'Silica Gel', 'wave to earth'],
    minPriceLabel: '15,000 YoYo',
    minPriceApprox: '$11.10',
    description:
      '네 팀이 한 무대에 서는 합동 공연. 수익은 팀별 공연 시간 비율로 자동 정산되며, 관객은 응원하는 팀을 골라 예매할 수 있습니다.',
  },
  '11': {
    performanceId: 11,
    title: 'Hongdae Garage Sessions',
    status: 'on-sale',
    dateLabel: '10월 3일 오후 6:00 KST',
    venue: 'Club FF, Seoul',
    teamNames: ['The Volunteers', 'Balming Tiger', 'Hathaw9y'],
    minPriceLabel: '12,000 YoYo',
    minPriceApprox: '$8.89',
    description:
      '홍대 라이브 클럽의 스탠딩 합동 공연. 세 팀이 40분씩 무대를 나눠 씁니다. 입장은 예매번호 순입니다.',
  },
  '4': {
    performanceId: 4,
    title: 'Busan Wave Festival',
    status: 'sold-out',
    dateLabel: '9월 12일 오후 5:00 KST',
    venue: 'Haeundae Beach, Busan',
    teamNames: ['Jannabi', 'Hyukoh', 'SURL', 'Car, the garden', 'ADOY', 'Lucy'],
    minPriceLabel: '39,000 YoYo',
    minPriceApprox: '$28.89',
    description:
      '해운대 백사장 특설 무대에서 여섯 팀이 이어 서는 야외 페스티벌. 전 좌석 매진으로 취소표 대기만 가능합니다.',
    bookingDisabled: true,
    bookingDisabledReason: 'Sold out / 매진',
  },
  '21': {
    performanceId: 21,
    title: 'Winter Acoustic Round',
    status: 'upcoming',
    dateLabel: '11월 8일 오후 6:00 KST',
    venue: 'Sangsangmadang, Seoul',
    teamNames: ['Stella Jang', 'Sunwoo Jung-a', '10cm', 'Kwak Jin-eon', 'Wooe'],
    minPriceLabel: '18,000 YoYo',
    minPriceApprox: '$13.33',
    description:
      '어쿠스틱 편성으로만 꾸리는 겨울 합동 공연. 판매 시작 전이며 오픈 알림을 받을 수 있습니다.',
    bookingDisabled: true,
    bookingDisabledReason: 'Opens soon / 판매 예정',
  },
}

function priceOf(detail: PerformanceDetailView): number {
  return Number(detail.minPriceLabel.replace(/[^0-9]/g, ''))
}

function ticketTypesFor(detail: PerformanceDetailView): TicketTypeView[] {
  const price = priceOf(detail)
  const remaining = detail.bookingDisabled ? 0 : 80

  return [
    {
      ticketTypeId: `ga-${detail.performanceId}`,
      name: 'General admission',
      price,
      priceApprox: detail.minPriceApprox,
      remaining,
    },
    {
      ticketTypeId: `support-${detail.performanceId}`,
      name: 'Supporter ticket',
      price: price + 5_000,
      remaining: detail.bookingDisabled ? 0 : 24,
    },
  ]
}

function detailFor(id: string | undefined): PerformanceDetailView {
  return (id && DETAILS[id]) || DETAILS['12']
}

export function demoBookingFlowFor(
  performanceId: string | undefined,
  languageOrOrderId: 'ko' | 'en' | number | string = 'ko',
  orderId?: number | string,
): DemoBookingFlow {
  const language = languageOrOrderId === 'ko' || languageOrOrderId === 'en' ? languageOrOrderId : 'ko'
  const displayOrderId =
    languageOrOrderId === 'ko' || languageOrOrderId === 'en' ? orderId : languageOrOrderId
  const startTimes: Record<number, string> = {
    12: '2026-09-20T09:30:00Z',
    8: '2026-03-14T10:00:00Z',
    5: '2026-09-14T10:00:00Z',
    7: '2026-09-26T10:00:00Z',
    11: '2026-10-03T09:00:00Z',
    4: '2026-09-12T08:00:00Z',
    21: '2026-11-08T09:00:00Z',
  }
  const original = detailFor(performanceId)
  const detail = {
    ...original,
    dateLabel: formatKst(startTimes[original.performanceId], 'Asia/Seoul', language),
  }
  const id = String(detail.performanceId)
  const ticketTypes = ticketTypesFor(detail)
  const ticketType = ticketTypes[0]
  // 데모 fixture는 단가를 늘 안다. TicketTypeView.price는 실제 API에서 모를 수 있어 선택이다
  const unitPrice = priceOf(detail)
  const teamName = detail.teamNames[0]
  const teams = detail.teamNames.map((name, index) => ({
    teamId: detail.performanceId * 100 + index + 1,
    teamName: name,
    teamIndex: index,
  }))

  return {
    detail,
    ticketOptions: {
      performanceId: id,
      showTitle: detail.title,
      dateLabel: detail.dateLabel,
      venue: detail.venue,
      ticketTypes,
    },
    teamChoice: {
      showTitle: detail.title,
      teams,
      summary: {
        performanceId: id,
        showTitle: detail.title,
        dateLabel: detail.dateLabel,
        venue: detail.venue,
        ticketTypeName: ticketType.name,
        quantity: 1,
        totalAmount: unitPrice,
        totalApprox: ticketType.priceApprox,
      },
    },
    payment: {
      performanceId: id,
      showTitle: detail.title,
      dateLabel: detail.dateLabel,
      venue: detail.venue,
      ticketTypeName: ticketType.name,
      quantity: 1,
      teamName,
      totalAmount: unitPrice,
      totalApprox: ticketType.priceApprox,
      walletBalance: Math.max(185_000, unitPrice * 3),
    },
    complete: {
      performanceId: id,
      posterImageUrl: detail.posterImageUrl,
      orderNumber: formatOrderNumber(displayOrderId ?? id),
      showTitle: detail.title,
      dateLabel: detail.dateLabel,
      venue: detail.venue,
      ticketTypeName: ticketType.name,
      teamName,
      quantity: 1,
      totalPaidLabel: detail.minPriceLabel,
      paidAtLabel: formatKst('2026-09-10T04:00:00Z', 'Asia/Seoul', language),
    },
  }
}
