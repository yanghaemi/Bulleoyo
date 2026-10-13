/**
 * 정산 상태 배지 — 화면설계 v6 §5.1 `Settlement` 행.
 *
 * 값 6종은 P-08 영역 구성이 적은 상태 머신 그대로다:
 * `NONE`→`AGGREGATED`→`LOCKED`→`DISPUTE_OPEN`→`RELEASED` / `HALTED`.
 * 종단은 둘 — **`RELEASED`(수령 완료)** 와 **`HALTED`(정산 중단)** 이고,
 * `HALTED`에서 되돌아오는 경로는 없다(§5.1 v6 변경 ③).
 *
 * 한글 라벨은 §5.1 표에서 한 글자도 바꾸지 않고 옮겼다 —
 * 정산 전 / 집계 확정 / 정산 잠금 / 이의제기 기간 / 수령 완료 / 정산 중단.
 *
 * ⚠ 영문 라벨은 명세에 없다. §5.1의 `Settlement` 행은 en 칸이 `—`이고
 * "공연자 화면 전용이므로 ko만 정의한다"고 적혀 있다. 그런데 P-08 절 본문·API 명세는
 * 단계를 부를 때 enum 값(`AGGREGATED`…)을 그대로 쓴다. 영문은 이 상태를 읽기 쉽게 표기하고
 * 현재 선택 언어에 해당하는 라벨 하나만 표시한다. enum 및 상태 전이 의미는 바꾸지 않는다.
 *
 * 색 —
 *   · **색만으로 상태를 알리지 않는다.** 6값을 6색으로 나누면 구분이 색에만 실린다.
 *     라벨이 정보를 다 갖고, 색은 "진행 전 / 진행 중 / 종단" 세 덩어리만 구분한다
 *   · 새 색을 만들지 않았다. `StatusBadge`·`TicketStatusBadge`가 쓰던 조합만 쓴다
 *   · `DISPUTE_OPEN`만 테두리에 `warning`을 써 눈에 걸리게 했다. 글자는 `ink` 그대로다 —
 *     `text-warning`은 밝은 테마의 흰 배경 위에서 대비가 2.3:1로 떨어진다(토큰 문서 §2.1 실측)
 */

import { useLocale } from '@/shared/i18n/useLocale'
import { SETTLEMENT_STATUS_LABEL } from '@/shared/ui/statusLabels'

export type SettlementStatus =
  'NONE' | 'AGGREGATED' | 'LOCKED' | 'DISPUTE_OPEN' | 'RELEASED' | 'HALTED'

/** 라벨은 `statusLabels.ts`(필터와 공유), 색만 여기 둔다 */
const TONE: Record<SettlementStatus, string> = {
  NONE: 'bg-ground-2 text-muted',
  AGGREGATED: 'bg-surface text-ink border border-line',
  LOCKED: 'bg-sel-soft text-ink',
  DISPUTE_OPEN: 'bg-surface text-ink border border-warning',
  RELEASED: 'bg-primary text-white',
  HALTED: 'bg-surface text-danger border border-danger',
}

export function SettlementStatusBadge({ status }: { status: SettlementStatus }) {
  const { text } = useLocale()
  const label = SETTLEMENT_STATUS_LABEL[status]
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center rounded-chip px-2 font-sans text-[11px] font-semibold whitespace-nowrap ${TONE[status]}`}
    >
      {text(label.ko, label.en)}
    </span>
  )
}
