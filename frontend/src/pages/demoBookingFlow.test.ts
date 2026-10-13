import { describe, expect, it } from 'vitest'

import { demoBookingFlowFor } from './demoBookingFlow'

describe('demoBookingFlowFor', () => {
  it('공연 7의 제목·장소·공연 ID를 예매와 결제까지 유지한다', () => {
    const flow = demoBookingFlowFor('7')

    expect(flow.detail.title).toBe('Seoul Indie Night vol.12')
    expect(flow.ticketOptions.performanceId).toBe('7')
    expect(flow.ticketOptions.showTitle).toBe(flow.detail.title)
    expect(flow.teamChoice.showTitle).toBe(flow.detail.title)
    expect(flow.teamChoice.summary.venue).toBe(flow.detail.venue)
    expect(flow.payment.showTitle).toBe(flow.detail.title)
    expect(flow.complete.showTitle).toBe(flow.detail.title)
  })

  it('공연 7의 참여팀을 팀 선택 화면에 같은 순서로 제공한다', () => {
    const flow = demoBookingFlowFor('7')

    expect(flow.teamChoice.teams.map((team) => team.teamName)).toEqual([
      'Dabda',
      'Say Sue Me',
      'Silica Gel',
      'wave to earth',
    ])
  })

  it('알 수 없는 공연 ID는 기존 기본 공연 12로 안전하게 대체한다', () => {
    expect(demoBookingFlowFor('999').detail.performanceId).toBe(12)
  })

  it('아이유는 예매 가능하고 Busan Wave Festival이 매진이다', () => {
    const iu = demoBookingFlowFor('5')
    const busan = demoBookingFlowFor('4')

    expect(iu.detail.status).toBe('on-sale')
    expect(iu.detail.bookingDisabled).not.toBe(true)
    expect(
      iu.ticketOptions.ticketTypes.every(
        (ticket) => ticket.remaining != null && ticket.remaining > 0,
      ),
    ).toBe(true)

    expect(busan.detail.status).toBe('sold-out')
    expect(busan.detail.bookingDisabled).toBe(true)
    expect(busan.ticketOptions.ticketTypes.every((ticket) => ticket.remaining === 0)).toBe(true)
  })

  it('완료 화면 예매번호는 공연 ID가 아니라 주문 ID를 사용한다', () => {
    expect(demoBookingFlowFor('7', 5501).complete.orderNumber).toBe('ORD-5501')
  })
})
