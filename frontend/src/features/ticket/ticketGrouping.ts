export interface GroupableTicket {
  ticketId: string
  performanceId?: string
  tab: string
}

export type GroupedTicket<T extends GroupableTicket> = T & {
  ticketIds: string[]
  ticketCount: number
}

/**
 * 내 티켓 목록에서는 공연 하나를 카드 하나로 보여 준다.
 * 상태 탭이 다르거나 공연 ID가 없는 티켓은 서로 합치지 않는다.
 */
export function groupTicketsByPerformance<T extends GroupableTicket>(
  tickets: readonly T[],
): GroupedTicket<T>[] {
  const grouped = new Map<string, GroupedTicket<T>>()

  tickets.forEach((ticket) => {
    const key = ticket.performanceId
      ? `${ticket.tab}:performance:${ticket.performanceId}`
      : `${ticket.tab}:ticket:${ticket.ticketId}`
    const current = grouped.get(key)
    if (current) {
      if (!current.ticketIds.includes(ticket.ticketId)) current.ticketIds.push(ticket.ticketId)
      current.ticketCount = current.ticketIds.length
      return
    }
    grouped.set(key, { ...ticket, ticketIds: [ticket.ticketId], ticketCount: 1 })
  })

  return [...grouped.values()]
}
