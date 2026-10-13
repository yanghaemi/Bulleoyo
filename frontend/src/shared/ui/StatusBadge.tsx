/**
 * 상태 배지.
 *
 * 와이어프레임 `RStatusBadge` 이식. 화면설계 v6 §5.1의 상태값 → 라벨 매핑을 따른다.
 * 색이 아니라 문구로도 읽히게 라벨을 항상 함께 쓴다(접근성).
 *
 * 2026-09-08 정돈 — 반경이 `rounded-[4px]` 하드코딩이라 배지를 pill로 바꾸는 테마에서
 * 이것만 각져 있었다(토큰 문서 §3-1). `rounded-chip`으로 되돌리고, 카드 상단에서 배지가
 * 눌리거나 줄바꿈되지 않게 `shrink-0`·`whitespace-nowrap`, 11px에서 벌어져 보이는 자간에
 * `tracking-tight`을 더했다. 높이·색·문구는 그대로다.
 */

import { useLocale } from '@/shared/i18n/useLocale'
import { SHOW_STATUS_LABEL } from '@/shared/ui/statusLabels'

export type ShowStatus = 'on-sale' | 'sale-closed' | 'sold-out' | 'ended' | 'cancelled' | 'upcoming'

/** 라벨은 `statusLabels.ts`(필터와 공유), 색만 여기 둔다 */
const MAP: Record<ShowStatus, { className: string }> = {
  'on-sale': { className: 'bg-primary text-white' },
  // ⚠ `upcoming`이 선택 토큰(`sel-soft`)을 빌려 쓰고 있다. teal일 때는 중립으로 보였지만
  //   자홍(#fce8f2)이 되면서 "선택됨"으로 읽힐 여지가 생겼다. 상태 배지와 선택 표시는
  //   역할이 다르므로 분리하는 편이 맞다 — 신현경이 언급한 `warning` 용도가 정해지면
  //   그쪽으로 옮긴다(색값 미정이라 지금은 그대로 둔다).
  upcoming: { className: 'bg-sel-soft text-ink' },
  'sale-closed': { className: 'bg-ground-2 text-muted' },
  'sold-out': { className: 'bg-ground-2 text-muted' },
  ended: { className: 'bg-ground-2 text-muted' },
  cancelled: { className: 'bg-surface text-danger border border-danger' },
}

export function StatusBadge({ status }: { status: ShowStatus }) {
  const { text } = useLocale()
  const s = MAP[status]
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-chip px-2 font-sans text-[11px] font-semibold tracking-tight ${s.className}`}
    >
      {text(SHOW_STATUS_LABEL[status].ko, SHOW_STATUS_LABEL[status].en)}
    </span>
  )
}
