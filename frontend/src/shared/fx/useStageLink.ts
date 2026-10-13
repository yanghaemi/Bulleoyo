/**
 * 공연으로 들어가는 링크의 클릭 연출 — 눌린 자리에서 조명이 번쩍 피고, 잠깐 뒤 포스터가
 * 상세 히어로로 늘어나며(View Transition) 화면이 바뀐다.
 *
 * Book now · 캐러셀 중앙 카드 · 그리드 카드가 같은 훅을 쓴다. 세 곳이 각자 다르게 움직이면
 * "공연을 연다"는 하나의 동작이 세 가지로 느껴진다.
 *
 * 왜 170ms를 기다리나 — View Transition은 시작 순간 옛 화면을 **정지 스냅샷**으로 찍는다.
 * 그 직후에 튀는 블룸은 아무도 못 본다. 블룸이 눈에 들어올 최소 시간만 벌고 전환한다.
 * `prefers-reduced-motion`이면 기다리지 않는다. 새 탭 열기(⌘/Ctrl·중클릭)는 그대로 둔다.
 *
 * 롤백 — 호출부의 `onClick={open(to)}`를 지우면 `<Link viewTransition>`의 기본 동작으로 돌아간다.
 */

import type { MouseEvent } from 'react'
import { useNavigate } from 'react-router'

import { emitBurst } from './burst'

const DELAY_MS = 170

/** 상세(A-02) 포스터와 짝을 이루는 이름. 양쪽이 같은 이름을 가져야 모핑이 성립한다 */
export const POSTER_VT_NAME = 'show-poster'

/** 이 이름을 붙여 둔 요소에 남기는 표식. 다음 클릭이 걷어낼 대상을 찾는 데 쓴다 */
const CLAIM_ATTR = 'data-vt-claimed'

/**
 * 포스터 모핑 이름을 **이 요소가 독차지하게** 한다.
 *
 * `view-transition-name`은 문서 안에서 유일해야 한다. 둘 이상이 같은 이름을 갖는 순간
 * 브라우저는 전환을 **통째로 취소한다** — 오류를 던지지 않고 그냥 애니메이션이 없어진다.
 *
 * 2026-09-09에 실제로 그랬다. 캐러셀 중앙 카드가 이 이름을 **상시** 물고 있어서, 아래 그리드
 * 카드를 누르면 이름이 둘이 되고(실측 2개) 전환이 매번 취소됐다. 캐러셀은 되는데 목록은
 * 안 되는 이유가 그것이었다. 그래서 **아무도 평소에는 이름을 갖지 않는다.** 누르는 순간
 * 그 카드가 잡고, 잡기 전에 먼저 남의 것을 걷어낸다.
 *
 * 걷어내는 일이 필요한 이유 — 뒤로 가기로 목록에 돌아왔을 때 React가 되살린 DOM에 지난번
 * 인라인 스타일이 남아 있을 수 있다. 남은 이름 하나가 다음 전환을 통째로 죽인다.
 */
export function claimPosterName(el: HTMLElement | null | undefined): void {
  if (typeof document === 'undefined') return
  for (const prev of document.querySelectorAll<HTMLElement>(`[${CLAIM_ATTR}]`)) {
    prev.style.viewTransitionName = ''
    prev.removeAttribute(CLAIM_ATTR)
  }
  if (!el) return
  el.style.viewTransitionName = POSTER_VT_NAME
  el.setAttribute(CLAIM_ATTR, '')
}

export function useStageLink() {
  const navigate = useNavigate()

  return (to: string, before?: (e: MouseEvent<HTMLAnchorElement>) => boolean | void) =>
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return
      // 호출부의 사전 조건(드래그 판정, view-transition-name 부착 등). false면 이동 자체를 막는다
      if (before && before(e) === false) {
        e.preventDefault()
        return
      }
      e.preventDefault()
      emitBurst(e.clientX, e.clientY)
      const go = () => navigate(to, { viewTransition: true })
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) go()
      else window.setTimeout(go, DELAY_MS)
    }
}
