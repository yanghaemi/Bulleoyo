/**
 * 하단 고정 액션 영역 (모바일 전용).
 *
 * 화면설계 v6 §5.19 — 하단 고정 액션 버튼과 탭바가 같은 화면에 함께 있으면 안 된다.
 * 이 컴포넌트를 쓰는 화면은 탭바를 노출하지 않는다.
 * PC(≥768px)에서는 액션이 본문·우측 패널로 들어가므로 이 영역을 숨긴다.
 */

import type { ReactNode } from 'react'

export function FixedBottom({ children }: { children: ReactNode }) {
  return (
    <div
      className="ui-fixed-bottom fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface px-4 py-3 md:hidden"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      {children}
    </div>
  )
}
