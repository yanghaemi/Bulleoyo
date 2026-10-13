/**
 * 클릭 블룸 신호 — `StageBloom`이 듣는 커스텀 이벤트.
 *
 * 컴포넌트 파일(StageBloom.tsx)과 분리한 이유는 Fast Refresh 규칙 하나다: 컴포넌트 파일이
 * 함수도 export하면 HMR이 그 파일을 통째로 다시 마운트한다. 호출부(`useStageLink`)는
 * 이 파일만 알고, 듣는 쪽이 없으면(StageBloom 롤백) 이벤트는 그냥 사라진다.
 */

export const BURST_EVENT = 'fx:burst'

/** 카드·버튼이 눌린 지점(뷰포트 px)에서 조명이 번쩍 핀다 */
export function emitBurst(x: number, y: number): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(BURST_EVENT, { detail: { x, y } }))
}
