/**
 * 티켓 상태 배지 — 화면설계 v6 §5.1 `Ticket` 행.
 *
 * `ISSUED` / `USED` / `CANCELLED` 3값 → `Valid / 사용 가능` · `Used / 사용 완료` · `Cancelled / 취소됨`.
 *
 * 왜 따로 두나 — A-07·A-08이 공연 배지(`StatusBadge`)를 빌려 써서 유효한 티켓에
 * **"On sale"**이 찍혔다. 공연 상태와 티켓 상태는 값도 라벨도 다른 엔티티다(§5.1).
 * 색만으로 구분하지 않도록 라벨 문구를 항상 함께 쓴다(접근성).
 */

export type TicketStatus = 'valid' | 'used' | 'cancelled'

const MAP: Record<TicketStatus, { label: string; className: string }> = {
  valid: { label: 'Valid / 사용 가능', className: 'bg-primary text-white' },
  used: { label: 'Used / 사용 완료', className: 'bg-ground-2 text-muted' },
  cancelled: { label: 'Cancelled / 취소됨', className: 'bg-surface text-danger border border-danger' },
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const s = MAP[status]
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center rounded-chip px-2 font-sans text-[11px] font-semibold whitespace-nowrap ${s.className}`}
    >
      {s.label}
    </span>
  )
}
