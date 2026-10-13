/**
 * A-01 홈 탭의 값·주소 규칙(화면설계 v8.14).
 *
 * 선택은 URL 검색 파라미터 `?tab=onsale|ai`에 둔다 — 공연 상세(A-02)에 갔다가 뒤로 오면
 * 고른 탭이 그대로여야 한다. 컴포넌트 상태에 두면 재마운트 때 기본값으로 돌아간다.
 */

export type HomeTab = 'onsale' | 'ai'

export const HOME_TABS: readonly HomeTab[] = ['onsale', 'ai']

/** 검색 파라미터 이름 */
export const HOME_TAB_PARAM = 'tab'

/** 기본 탭은 판매중이다. 없는 값·잘못된 값도 여기로 접는다 */
export function parseHomeTab(value: string | null): HomeTab {
  return value === 'ai' ? 'ai' : 'onsale'
}

export const homeTabId = (tab: HomeTab) => `home-tab-${tab}`
export const homePanelId = (tab: HomeTab) => `home-panel-${tab}`
