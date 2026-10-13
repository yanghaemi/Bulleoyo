/**
 * 상태 배지 라벨(ko·en) — 배지와 필터가 **같은 문구**를 쓰도록 한 곳에 둔다.
 *
 * 전에는 라벨이 각 배지 컴포넌트 파일 안에 있었다. P-01 참여 공연 필터가 같은 라벨을 옵션 이름으로
 * 써야 해서 꺼냈다 — 컴포넌트 파일은 컴포넌트만 export 한다(Fast Refresh)는 규약 때문에 별도 모듈이다.
 * 색(className)은 배지만 쓰므로 배지 파일에 남긴다.
 */

import type { DepositStatus } from '@/shared/ui/DepositStatusBadge'
import type { SettlementStatus } from '@/shared/ui/SettlementStatusBadge'
import type { ShowStatus } from '@/shared/ui/StatusBadge'

export interface StatusLabel {
  ko: string
  en: string
}

/** 화면설계 v6 §5.1 `Performance` 행(관객 배지에서 태어남) */
export const SHOW_STATUS_LABEL: Record<ShowStatus, StatusLabel> = {
  'on-sale': { ko: '예매 중', en: 'On sale' },
  'sale-closed': { ko: '예매 마감', en: 'Sale closed' },
  'sold-out': { ko: '매진', en: 'Sold out' },
  ended: { ko: '공연 종료', en: 'Ended' },
  cancelled: { ko: '공연 취소', en: 'Cancelled' },
  upcoming: { ko: '공개 예정', en: 'Coming soon' },
}

/** §5.1 `Settlement` 행. 영문은 명세에 없어 enum을 읽기 쉽게 적었다(배지 주석 참고) */
export const SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, StatusLabel> = {
  NONE: { ko: '정산 전', en: 'Not started' },
  AGGREGATED: { ko: '집계 확정', en: 'Aggregated' },
  LOCKED: { ko: '정산 잠금', en: 'Locked' },
  DISPUTE_OPEN: { ko: '이의제기 기간', en: 'Dispute open' },
  RELEASED: { ko: '수령 완료', en: 'Released' },
  HALTED: { ko: '정산 중단', en: 'Halted' },
}

/** §5.1 `Performance.deposit_status` 행 */
export const DEPOSIT_STATUS_LABEL: Record<DepositStatus, StatusLabel> = {
  UNPAID: { ko: '보증금 미납', en: 'Unpaid' },
  PAID: { ko: '납부 완료', en: 'Paid' },
  RETURNED: { ko: '반환 완료', en: 'Returned' },
}
