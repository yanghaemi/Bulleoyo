/**
 * 앰비언트 배경 레이어 — 전 페이지 공통, 콘텐츠 뒤에 고정.
 *
 * ── 이 파일이 하는 일은 하나뿐이다 ─────────────────────────────────
 * 포인터 좌표를 CSS 변수 `--fx-cx`/`--fx-cy`에 px로 써 넣는 것. 그게 전부다.
 * 그 좌표는 무대 **팔로우 스팟**(반경 420px)의 중심이 된다 — 조명 하나가 관객을 따라온다.
 * 색·알파·워시의 크기·숨쉬기·노이즈는 전부 `styles/fx-backdrop.css`가 정한다.
 * 이유는 fx-hover.css와 같다 — 시각을 조정할 때 컴포넌트를 열지 않게, 그리고
 * 롤백이 코드 되돌리기가 아니라 import 한 줄 삭제가 되게.
 *
 * ── 롤백 ─────────────────────────────────────────────────────────
 * ① 효과만 끄기(한 줄): `styles.css`의 `@import "./styles/fx-backdrop.css";` 삭제.
 *    이 컴포넌트는 CSS 변수만 세팅하므로 아무도 읽지 않는 변수를 쓰는 빈 div가 남을 뿐이다.
 * ② 완전 제거: 위 한 줄 + `app/providers.tsx`의 import·`<AmbientBackdrop />` 두 줄 삭제 후
 *    이 파일과 `styles/fx-backdrop.css` 삭제.
 *
 * ── 왜 body로 포털하나 ────────────────────────────────────────────
 * `z-index: -1`은 "가장 가까운 쌓임 맥락의 음수 단계"로 갈 뿐이다. React 트리 안쪽에
 * 두면 언젠가 조상에 `transform`·`isolate`·`opacity`가 붙는 순간 그 안에 갇혀
 * 형제 콘텐츠 뒤가 아니라 조상 뒤로 사라진다. body 직계로 올리면 그 사고가 구조적으로 없다.
 * body·html은 쌓임 맥락을 만들지 않고 `#root`에도 스타일이 없어(index.html) 의도대로
 * html/body 배경 위, `#root` 콘텐츠 아래에 그려진다.
 * 히어로의 `HeroBackdrop`(`absolute -z-10` + 부모 `isolate`)과는 층이 달라 충돌하지 않는다.
 *
 * ── 성능 ─────────────────────────────────────────────────────────
 * 항상 도는 rAF는 없다. 포인터가 움직여야 루프가 켜지고, 목표까지 0.5px 안으로
 * 수렴하면 스스로 멈춘다. 탭이 hidden이면 멈춘다(브라우저가 rAF를 죽이기도 하지만
 * 명시적으로 끊어 둬야 복귀할 때 한 프레임에 몰아 튀지 않는다).
 */

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/** 보간 계수. 클수록 빨리 따라붙는다. 0.12면 대략 6~8프레임에 눈에 띄는 차이가 사라진다 */
const LERP = 0.12

/** 수렴 판정 임계값(px). 이 아래로 좁혀지면 더 그려 봐야 같은 픽셀이라 루프를 끊는다 */
const SETTLE_PX = 0.5

/** matchMedia가 없는 환경(jsdom 테스트)에서도 죽지 않게 감싼다. 없으면 "아니오"로 본다 */
function prefers(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(query).matches
}

export function AmbientBackdrop() {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // 터치 기기에서는 좌표를 아예 건드리지 않는다. CSS 기본값(50%/42%)이 남아
    // 스포트라이트가 화면 중앙에 고정된다. 리스너도 rAF도 만들지 않는 게 핵심이다 —
    // 모바일에서 60fps 루프를 돌릴 이유가 없다.
    if (prefers('(hover: none)')) return

    // 모션 축소 사용자는 '따라오는 움직임'이 문제지 조명 자체가 아니다.
    // 그래서 스포트라이트는 남기되 lerp를 건너뛰고 즉시 그 자리에 놓는다.
    const reduced = prefers('(prefers-reduced-motion: reduce)')

    // 목표(포인터)와 현재(그려진 위치). 시작값을 화면 중앙으로 맞춰 두면
    // 첫 pointermove에서 좌상단(0,0)부터 날아오는 부자연스러운 진입이 없다.
    let tx = window.innerWidth / 2
    let ty = window.innerHeight * 0.42
    let cx = tx
    let cy = ty
    let raf = 0

    const paint = () => {
      // toFixed(1) — 소수점 이하를 다 넘기면 같은 픽셀인데 스타일 무효화만 반복된다
      el.style.setProperty('--fx-cx', `${cx.toFixed(1)}px`)
      el.style.setProperty('--fx-cy', `${cy.toFixed(1)}px`)
    }

    const step = () => {
      raf = 0
      cx += (tx - cx) * LERP
      cy += (ty - cy) * LERP
      paint()
      // 수렴하지 않았을 때만 다음 프레임을 예약한다 = 멈추는 조건이 루프 안에 있다
      if (Math.abs(tx - cx) > SETTLE_PX || Math.abs(ty - cy) > SETTLE_PX) schedule()
    }

    const schedule = () => {
      if (raf || document.visibilityState === 'hidden') return
      raf = requestAnimationFrame(step)
    }

    const onMove = (event: PointerEvent) => {
      tx = event.clientX
      ty = event.clientY
      if (reduced) {
        cx = tx
        cy = ty
        paint()
        return
      }
      schedule()
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (raf) cancelAnimationFrame(raf)
        raf = 0
        return
      }
      // 돌아왔을 때 아직 목표에 못 미쳤으면 마저 수렴시킨다
      schedule()
    }

    // passive — 좌표만 읽고 기본 동작을 막지 않는다. 스크롤 성능에 얹히지 않게.
    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('visibilitychange', onVisibility)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  // SSR·비DOM 환경 방어. 지금은 CSR 전용이지만 포털은 document를 전제하므로 명시한다.
  if (typeof document === 'undefined') return null

  return createPortal(
    // aria-hidden — 순수 장식이다. 스크린리더가 읽을 것이 하나도 없다.
    <div ref={ref} className="fx-ambient" aria-hidden>
      {/* 형태 없는 빛 둘 — 위쪽 워시(보라)와 우하단 온기(자홍). 조명 콘 3줄기(2차)는 도형으로
          읽혀 지웠다(2026-09-08). 색·크기·숨쉬기는 전부 fx-backdrop.css가 정하고 여기는 자리만 만든다 */}
      <div className="fx-ambient__wash" />
      <div className="fx-ambient__warm" />
      {/* 리프트는 빛 위에 와야 본문 영역 휘도를 되올린다 — DOM 순서가 곧 페인트 순서다 */}
      <div className="fx-ambient__lift" />
      <div className="fx-ambient__spot" />
      <div className="fx-ambient__grain" />
    </div>,
    document.body,
  )
}

export default AmbientBackdrop
