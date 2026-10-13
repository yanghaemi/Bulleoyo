import { expect, it } from 'vitest'

import { groupTicketsByPerformance } from './ticketGrouping'

it('같은 공연과 상태의 티켓은 목록에서 한 장으로 묶고 실제 티켓 ID를 보존한다', () => {
  const grouped = groupTicketsByPerformance([
    { ticketId: '41', performanceId: '12', tab: 'upcoming', showTitle: '서울 인디 나이트' },
    { ticketId: '42', performanceId: '12', tab: 'upcoming', showTitle: '서울 인디 나이트' },
    { ticketId: '51', performanceId: '13', tab: 'upcoming', showTitle: 'Blue Hour' },
  ])

  expect(grouped).toHaveLength(2)
  expect(grouped[0]).toMatchObject({ ticketCount: 2, ticketIds: ['41', '42'] })
  expect(grouped[1]).toMatchObject({ ticketCount: 1, ticketIds: ['51'] })
})

it('공연 ID가 없거나 상태가 다른 티켓은 잘못 합치지 않는다', () => {
  const grouped = groupTicketsByPerformance([
    { ticketId: '41', tab: 'upcoming' },
    { ticketId: '42', tab: 'upcoming' },
    { ticketId: '43', performanceId: '12', tab: 'used' },
    { ticketId: '44', performanceId: '12', tab: 'cancelled' },
  ])

  expect(grouped.map((ticket) => ticket.ticketIds)).toEqual([['41'], ['42'], ['43'], ['44']])
})
