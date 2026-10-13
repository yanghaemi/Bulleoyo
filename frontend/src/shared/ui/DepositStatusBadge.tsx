/**
 * 보증금 상태 배지 — 화면설계 v6 §5.1 `Performance.deposit_status` 행.
 *
 * 3값만 다룬다: `UNPAID` / `PAID` / `RETURNED`.
 * §5.1 표에는 `FORFEITED`(몰수됨)가 더 있지만 **P1**이고, API v6의
 * `PerformanceDepositStatus` enum도 3값뿐이라 여기서도 3값이다. P1이 들어오면 한 줄 더한다.
 *
 * 한글 라벨은 §5.1에서 그대로 옮겼다 — 보증금 미납 / 납부 완료 / 반환 완료.
 *
 * ⚠ 영문 라벨은 명세에 없다(§5.1 en 칸이 `— (공연자 화면 전용)`).
 * `SettlementStatusBadge`와 같이 영문은 enum을 읽기 쉽게 표기하고 선택 언어만 표시한다.
 *
 * 색 — `UNPAID`만 "아직 할 일이 남았다"는 뜻이라 테두리로 눈에 걸리게 하고,
 * `PAID`는 완료(채운 primary), `RETURNED`는 이미 끝난 일(중립)로 둔다.
 * 세 상태의 구분은 라벨이 갖는다 — 색은 보조다.
 */

import { useLocale } from '@/shared/i18n/useLocale'
import { DEPOSIT_STATUS_LABEL } from '@/shared/ui/statusLabels'

export type DepositStatus = 'UNPAID' | 'PAID' | 'RETURNED'

/** 라벨은 `statusLabels.ts`(필터와 공유), 색만 여기 둔다 */
const TONE: Record<DepositStatus, string> = {
  UNPAID: 'bg-surface text-ink border border-warning',
  PAID: 'bg-primary text-white',
  RETURNED: 'bg-ground-2 text-muted',
}

export function DepositStatusBadge({ status }: { status: DepositStatus }) {
  const { text } = useLocale()
  const label = DEPOSIT_STATUS_LABEL[status]
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center rounded-chip px-2 font-sans text-[11px] font-semibold whitespace-nowrap ${TONE[status]}`}
    >
      {text(label.ko, label.en)}
    </span>
  )
}
