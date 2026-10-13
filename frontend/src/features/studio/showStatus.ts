/**
 * 공연 상태값과 상태 배지 매핑 — 스튜디오(P) 화면 공용.
 *
 * P-01 대시보드와 P-07 판매·선택 현황이 같은 `PerformanceStatus`를 배지로 그린다.
 * 같은 상태가 두 화면에서 다른 배지로 보이면 안 되므로 매핑을 한 곳에 둔다.
 * (컴포넌트 파일에서 상수를 내보내면 Fast Refresh가 끊겨 별도 모듈로 뺐다.)
 */

import type { ShowStatus } from '@/shared/ui'

/** `PerformanceStatus`(API v6). 화면 라벨 매핑은 화면설계 v6 §5.1 */
export type PerformanceStatus =
  'DRAFT' | 'PENDING_AGREEMENT' | 'ON_SALE' | 'SALE_CLOSED' | 'ENDED' | 'CANCELLED'

/**
 * 공연 상태 → 공통 `StatusBadge`의 값. §5.1 `Performance` 행이 정한 라벨과 맞물린다.
 *
 * ⚠ `StatusBadge`는 관객 화면(A-01)에서 태어나 `DRAFT`·`PENDING_AGREEMENT`에 해당하는 값이 없다.
 * 관객에게는 그 두 상태의 공연이 보이지 않기 때문이다. 배지를 새로 만드는 대신 가장 가까운
 * 기존 값으로 접었다 — `DRAFT`·`PENDING_AGREEMENT` → `upcoming`("Coming soon").
 * 공연자에게는 "준비 중 / 규칙 동의 대기"로 읽혀야 하므로, §5.1 라벨을 그대로 쓰려면
 * `StatusBadge`에 두 값을 추가하는 명세 개정이 필요하다.
 */
export const SHOW_STATUS: Record<PerformanceStatus, ShowStatus> = {
  DRAFT: 'upcoming',
  PENDING_AGREEMENT: 'upcoming',
  ON_SALE: 'on-sale',
  SALE_CLOSED: 'sale-closed',
  ENDED: 'ended',
  CANCELLED: 'cancelled',
}
