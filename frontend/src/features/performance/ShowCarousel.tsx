/**
 * A-01 대표 공연 캐러셀 — 와이어프레임 `A-01D`(audience-desk.tsx) 이식.
 *
 * 중앙 카드 320×480, 좌우에 82% 크기 카드 하나씩 — **화면에는 항상 3장만** 보인다.
 * 화살표는 3장 바깥에 놓여 카드와 겹치지 않는다(래퍼 폭 = 3장 시야 + 화살표·여백).
 *
 * 명세 대조 — 화면설계 v6.1 §4 A-01이 이 캐러셀을 정본으로 확정했다(2026-09-08 개정).
 * **자동 슬라이드는 없다** — 와이어프레임 원본에 타이머가 없고, WCAG 2.2.2(움직이는 콘텐츠
 * 제어)와도 같은 방향이다.
 *
 * ── 회전문처럼 끝없이 돈다 ────────────────────────────────────────────
 * 인덱스가 아니라 **끝없는 위치값(`pos`)** 을 상태로 둔다. 4개짜리 목록에서 pos가
 * 5, 6, 7… 로 계속 늘어나도 되고 -1, -2… 로 줄어도 된다. 화면에는 pos 주변
 * 가상 칸 5개(pos−2 … pos+2)를 두되 **|offset| ≥ 1.5는 투명**하게 해 3장만 보이게 한다.
 * 5칸을 두는 이유는 나가는 카드가 투명해지며 밀려나야 뚝 사라지지 않기 때문이다.
 *
 * 왜 이렇게 하나 — 처음엔 "현재 인덱스로부터 가장 가까운 거리"를 매 렌더에 다시 계산했다.
 * 그러면 4개짜리에서 거리 ±2인 카드가 경계를 넘을 때 **−1에서 +2로 부호가 뒤집혀** 카드가
 * 화면을 가로질러 튄다. 가상 칸 방식은 각 칸의 위치가 pos에 연속으로 따라가므로 절대
 * 튀지 않고, 마지막 카드에서 다음으로 넘기면 자연스럽게 첫 카드가 옆에서 들어온다.
 *
 * ── 동작 원리 (emilkowalski/skills의 apple-design) ───────────────────
 *   ① **1:1 드래그 추적** — Pointer Events + `setPointerCapture`. 드래그 중엔 전환을 끈다
 *   ② **속도 인계 + 모멘텀 투영** — 놓는 순간 가장 가까운 칸으로 스냅하지 않는다.
 *      마지막 프레임들의 속도로 "어디까지 갈지"를 투영한 뒤 그 지점 칸으로 간다.
 *        project(v) = (v / 1000) * d / (1 - d),  d ≈ 0.998   (Apple 실제 함수)
 *   ③ **중간에 잡을 수 있다** — 이동 중 다시 누르면 현재 표시 위치에서 이어받는다
 *
 * ── 겪은 버그 두 개 (실제 마우스에서만 재현, `.click()` 테스트는 통과했다) ──
 *   · 화살표가 캡처 컨테이너 안에 있으면 pointerup이 컨테이너로 가서 버튼 click이
 *     발생하지 않는다 → 포인터 핸들러를 카드 트랙에만 걸고, 버튼·링크 위 누름은 무시한다
 *   · `onPointerMove`가 state `dragging`을 클로저로 읽으면 빠른 드래그의 첫 move들이
 *     아직 false인 클로저에 잡혀 버려진다 → ref로 판정한다. state는 렌더(전환 on/off)용
 *
 * 전환 곡선은 `cubic-bezier(0.22, 1, 0.36, 1)` 480ms — 튐 없이 감속하는 ease-out.
 * 진짜 스프링(damping/response)까지 가려면 `motion` 같은 라이브러리가 필요한데
 * 기술 스택 v3에 애니메이션 라이브러리가 없어서 의존성 없이 CSS 전환 + rAF로 했다.
 *
 * ── 캐러셀은 무대다 (2026-09-08 정제) ───────────────────────────────
 * 중앙 카드 하나만 조명을 받는다. 세 가지가 그 한 문장을 만든다:
 *   · 옆 카드를 더 어둡게 — 투명도 계수 0.55 → **0.38** (멈춘 옆 칸의 실효 불투명도 0.275 → 0.19)
 *   · 옆 카드를 더 뒤로 — 스케일 0.82 → **0.78**
 *   · 중앙 카드 그림자를 조명 방향(위에서 아래)으로 — `0 24px 48px / primary 18%`
 * 옆 카드에 덮던 `bg-ground/40` 안개는 `/20`으로 낮췄다. 투명도를 이미 내렸는데 안개까지
 * 그대로 두면 두 번 어두워져 포스터가 회색 판때기가 된다(실효 11%까지 떨어졌다).
 *
 * ── 호버 마이크로 인터랙션 ──────────────────────────────────────────
 * 중앙 카드만 포인터를 따라 ±6° 기울고 4px 떠오르며 광택이 스친다. 그리드 카드(ShowCard)는
 * 뜨기만 한다 — 틸트·광택은 이 화면에서 **이 카드 하나**의 것이다.
 * 시각 결정(각도·시간·알파)은 전부 `src/styles/fx-hover.css`에 있고 이 파일은 `data-fx`
 * 표식과 포인터 좌표만 넘긴다. `styles.css`의 `@import` 한 줄을 지우면 효과만 사라진다.
 *
 * 접근성 —
 *   · 화살표·점 모두 진짜 `<button>`이고 좌우 화살표 키로도 움직인다
 *   · 중앙 카드만 링크다. 나머지는 `aria-hidden`으로 탭 순서에서 뺀다
 *   · `prefers-reduced-motion`이면 전역 규칙이 전환을 끄고, 드래그도 막는다
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import { TAP_SLOP, tapDirection } from '@/features/performance/carouselTap'
import { claimPosterName, useStageLink } from '@/shared/fx/useStageLink'

import { useLocale } from '@/shared/i18n/useLocale'
import { Poster } from '@/shared/ui'

export interface CarouselItem {
  performanceId: string
  title: string
  dateLabel: string
  venue: string
  posterImageUrl?: string | null
}

/** 원본 비율 — 중앙 320×480. 옆 카드는 조명 밖이라 82% → **78%** 로 한 걸음 더 물러난다 */
const CW = 320
const CH = 480
const SIDE_SCALE = 0.78
/** 카드 사이 가로 간격 */
const GAP = 210
/** 양옆으로 몇 칸까지 그릴지. 2면 총 5칸 — 바깥 2칸은 투명해서 보이지 않고 퇴장 전환만 담당 */
const REACH = 2
/** 3장 시야 = 옆 카드 중심이 ±GAP, 거기서 옆 카드 절반(CW×0.82/2)만큼 더 */
const VISIBLE_SPAN = GAP * 2 + CW * SIDE_SCALE
/** 화살표 44px + 여백 16px 을 양쪽에 더한 래퍼 폭 — 카드와 화살표가 겹치지 않는 최소값 */
const WRAP_W = VISIBLE_SPAN + (44 + 16) * 2
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const DURATION = 480

/** Apple이 실제로 쓰는 감속 투영식(apple-design 스킬). 교과서의 v²/(2a)가 아니라 지수 감쇠형이다 */
function project(velocityPxPerSec: number, decelerationRate = 0.998): number {
  return ((velocityPxPerSec / 1000) * decelerationRate) / (1 - decelerationRate)
}

/**
 * 호버 마이크로 인터랙션의 유일한 JS 몫 — 포인터 위치를 상자 기준 0~1 비율로 CSS 변수에 넣는다.
 * 각도·이징·광택은 `styles/fx-hover.css`가 정하고, 그 파일을 빼면 이 변수는 아무도 읽지 않는다.
 * 매 move마다 rect를 재는 건 의도한 것이다 — 카드가 캐러셀 전환으로 계속 움직여 캐시하면 어긋난다.
 *
 * 이제 이 함수는 **여기 한 곳에만** 있다. ShowCard에 있던 복사본은 그리드 카드에서
 * 틸트·광택을 빼면서 같이 지웠다(호버 효과를 쓰는 곳이 이 카드 하나뿐이라 중복이 사라졌다).
 * `shared/fx`로 올리지 않는 이유 — 사용처가 하나고, 계약(`--mx`/`--my`)은 CSS가 쥐고 있다.
 */
function trackFxPointer(e: React.PointerEvent<HTMLElement>) {
  const el = e.currentTarget
  const r = el.getBoundingClientRect()
  if (r.width === 0 || r.height === 0) return
  el.style.setProperty('--mx', String((e.clientX - r.left) / r.width))
  el.style.setProperty('--my', String((e.clientY - r.top) / r.height))
}

/** 음수도 안전한 나머지 */
function mod(a: number, n: number): number {
  return ((a % n) + n) % n
}

interface CarouselProps {
  items: CarouselItem[]
  /** Opt-in lab layout; existing service presentation remains unchanged. */
  presentation?: 'standard' | 'artwork'
  initialPerformanceId?: string
  /**
   * 가운데 놓인 공연이 바뀔 때. 홈의 `Book now`가 **지금 보이는 공연**을 열게 하려고 있다.
   *
   * 2026-09-09까지 그 버튼은 `carousel[0]`을 열었다. 캐러셀을 아무리 돌려도 늘 첫 공연
   * (아이유)으로 가서, 캐러셀이 장식처럼 보였다. 중앙이 어디인지는 이 컴포넌트만 알기에
   * 밖으로 알려 준다.
   */
  onCenterChange?: (item: CarouselItem) => void
}

export function ShowCarousel({
  items,
  onCenterChange,
  presentation = 'standard',
  initialPerformanceId,
}: CarouselProps) {
  const { text } = useLocale()
  const open = useStageLink()
  /** 끝없는 위치. 정수일 때가 "멈춘" 상태다 */
  const [pos, setPos] = useState(() =>
    Math.max(
      0,
      items.findIndex((item) => item.performanceId === initialPerformanceId),
    ),
  )
  /** 드래그 중 손가락을 따라온 픽셀. 놓으면 0으로 돌아간다 */
  const [drag, setDrag] = useState(0)
  /** 렌더용 — 전환을 켜고 끈다 */
  const [dragging, setDragging] = useState(false)
  /** 판정용 — 이벤트 핸들러는 이걸 본다. state는 클로저에 갇혀 빠른 드래그를 놓친다 */
  const draggingRef = useRef(false)

  const startX = useRef(0)
  const history = useRef<{ t: number; x: number }[]>([])
  /**
   * 마지막 드래그 거리. `drag` state는 pointerup에서 0으로 돌아가는데 `click`은 그 뒤에
   * 오므로, state로는 "드래그였는지"를 click 시점에 알 수 없다. ref에 남겨 둔다.
   */
  const lastDrag = useRef(0)
  const reduceMotion = useRef(false)

  /**
   * 좁은 화면 배율. 3장 시야(682px)+화살표가 뷰포트보다 넓으면 트랙을 `zoom`으로 줄인다.
   * 처음엔 래퍼만 100%로 줄여서 트랙(고정 682px)이 넘쳐 **모바일에서 화살표가 중앙 카드 위에
   * 겹쳤다.** `zoom`은 레이아웃 크기까지 줄여 넘침이 없고, 팀 하한(Firefox 128)부터 표준이다.
   * 드래그 좌표는 clientX가 뷰포트 px라 배율로 나눠 트랙 좌표로 바꾼다.
   */
  const wrapRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(1)
  const fitRef = useRef(1)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      // md 이상은 화살표(44)+여백(16) 양쪽, 모바일은 화살표를 숨기니 좌우 8px만 뺀다.
      // 375px에서 0.37→0.53(카드 118→170px)이 된다. 모바일 이동은 스와이프·점이 맡는다
      const arrows = window.matchMedia('(min-width: 48rem)').matches ? (44 + 16) * 2 : 16
      const avail = entry.contentRect.width - arrows
      const mobileArtwork =
        presentation === 'artwork' && !window.matchMedia('(min-width: 48rem)').matches
      // Keep the centre poster legible; adjacent cards peek through the clipped wings.
      const next = Math.min(1, Math.max(0.4, avail / (mobileArtwork ? CW + 80 : VISIBLE_SPAN)))
      fitRef.current = next
      setFit(next)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [presentation])

  useEffect(() => {
    reduceMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  const n = items.length
  const go = useCallback((dir: 1 | -1) => setPos((p) => p + dir), [])

  /**
   * 트랙의 **중앙 카드 밖**을 누르면 그 방향으로 한 칸 돈다.
   *
   * ── 왜 (2026-09-10) ──────────────────────────────────────────────
   * 화살표는 `hidden md:flex`라 **PC에만 있다.** 모바일에는 드래그와 점밖에 없는데,
   * 옆 카드는 `pointerEvents: 'none'`이라 눌러도 아무 일이 없었다 — 화면의 좌우 3분의 1이
   * 통째로 죽은 자리였다. 옆 카드는 "이전/다음"으로 읽히는 자리이므로 눌리는 게 맞다.
   *
   * `pointerup`이 아니라 `click`에 다는 이유 —
   *   · `onPointerDown`은 `reduceMotion`이면 바로 빠져나간다. 거기에 달면 모션을 줄인
   *     사용자에게는 탭 이동이 통째로 없어진다. 이동은 모션 설정과 무관해야 한다
   *   · `lastDrag`로 드래그와 탭을 가르는 방식이 캡션 링크와 같아진다(같은 `TAP_SLOP` 기준).
   *     `lastDrag`는 다음 `pointerdown`에서 0으로 돌아가므로 click 시점에도 유효하다
   *
   * 중앙 카드 위는 건드리지 않는다 — 캡션 링크가 상세로 보내는 자리다.
   * 좌표는 `getBoundingClientRect`로 잰다(`zoom` 배율이 이미 반영된 값이라 나눌 필요가 없다).
   * 방향 판정은 `carouselTap.ts`에 있다 — 폭·배율 계산이 어긋나도 DOM 없이 확인할 수 있게.
   */
  const onTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 드래그로 민 뒤의 click은 이동이 아니다(캡션 링크와 같은 기준을 쓴다)
    if (Math.abs(lastDrag.current) > TAP_SLOP) return
    // 화살표·점·캡션 링크에서 온 click은 각자 처리한다
    if ((e.target as HTMLElement).closest('button, a')) return

    // 좌표가 트랙 밖이면(키보드 가상 클릭은 (0,0)으로 온다) tapDirection이 0을 준다
    const rect = e.currentTarget.getBoundingClientRect()
    const dir = tapDirection(
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height,
      CW,
      fitRef.current,
    )
    if (dir !== 0) go(dir)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (reduceMotion.current) return
    /*
     * ⚠ 이 리셋은 아래 early return **앞에** 있어야 한다(MR !61 자동 리뷰 지적).
     *
     * `lastDrag`는 "방금 민 거리"이고, 중앙 카드 캡션 링크의 onClick이 이 값으로 드래그와
     * 클릭을 가른다(6px 넘게 밀었으면 이동하지 않는다). 리셋이 아래 `closest('button, a')`
     * 뒤에 있으면 이렇게 굳는다 —
     *   ① 포스터를 드래그해 lastDrag = −96
     *   ② 캡션 링크를 누름 → pointerdown이 closest에 걸려 **리셋 전에 빠져나감**
     *   ③ click은 여전히 −96을 보고 이동을 막음 → 다시 눌러도 같은 경로
     * **드래그를 한 번 하면 그 뒤로 카드가 영영 안 눌린다**(포스터 여백을 눌러야 풀린다).
     * 2026-09-09에 실제로 재현했다.
     *
     * pointerup이 아니라 여기서 되돌리는 이유 — 이벤트 순서가 down → move → up → click이라
     * up에서 지우면 바로 뒤따르는 click이 0을 보고 이동해 버려 드래그 억제가 사라진다.
     */
    lastDrag.current = 0
    // 화살표·점·링크 위에서 시작한 누름은 드래그가 아니다. 여기서 캡처를 잡으면
    // pointerup이 컨테이너로 가서 버튼의 click이 영영 발생하지 않는다.
    if ((e.target as HTMLElement).closest('button, a')) return
    // 활성 포인터가 아니면(일부 입력 장치·합성 이벤트) 던진다. 캡처는 편의일 뿐
    // 필수가 아니므로 실패해도 드래그는 시작한다.
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* 캡처 없이 진행 */
    }
    startX.current = e.clientX
    history.current = [{ t: performance.now(), x: e.clientX }]
    draggingRef.current = true
    setDragging(true)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return
    const dx = (e.clientX - startX.current) / fitRef.current
    setDrag(dx)
    lastDrag.current = dx
    history.current.push({ t: performance.now(), x: e.clientX })
    if (history.current.length > 6) history.current.shift()
  }

  const onPointerUp = () => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)

    const h = history.current
    let velocity = 0
    if (h.length >= 2) {
      const a = h[0]
      const b = h[h.length - 1]
      const dt = b.t - a.t
      if (dt > 0) velocity = ((b.x - a.x) / dt) * 1000
    }

    // 놓은 지점 + 모멘텀이 데려갈 지점 → 몇 칸 이동할지. 왼쪽으로 밀면 다음 카드
    const projected = lastDrag.current + project(velocity)
    const steps = Math.round(-projected / GAP)

    setDrag(0)
    if (steps !== 0) setPos((p) => p + steps)
    history.current = []
  }

  // 중앙이 바뀌면 밖에 알린다(Book now가 이 값을 쓴다). 렌더 중에 부르면 안 되므로 이펙트로 미룬다.
  // ⚠ `if (n === 0) return null` **위에** 둔다 — 훅은 조건 없이 매 렌더 같은 순서로 돌아야 한다
  //
  // ⚠ **공연 id로 막는다. 객체 동일성으로 막으면 안 된다**(MR !61 리뷰 지적).
  // 지금은 `items`가 모듈 상수라 참조가 유지되지만, API를 붙여 매 렌더 새 배열이 오면
  // `centerItem`이 매번 새 객체가 된다 → 이펙트 실행 → `onCenterChange` → 부모 setState →
  // 리렌더 → 또 새 배열… **무한 렌더 루프**다. id를 ref에 적어 두면 그 고리가 끊어진다.
  //
  // 인덱스가 아니라 id로 적는 이유 — 캐러셀 내용이 바뀌었는데 중앙 인덱스가 그대로면
  // 인덱스 비교는 "안 바뀌었다"고 판단해 부모가 옛 공연을 들고 있게 된다.
  const centerItem = n > 0 ? items[mod(Math.round(pos), n)] : undefined
  const centerId = centerItem?.performanceId
  const notifiedId = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!centerItem || notifiedId.current === centerId) return
    notifiedId.current = centerId
    onCenterChange?.(centerItem)
  }, [centerId, centerItem, onCenterChange])

  if (n === 0) return null

  const base = Math.round(pos)
  const current = mod(base, n)

  const active = items[current]

  // 가상 칸 — base 주변 REACH칸씩. 키를 칸 번호로 두면 pos가 바뀌어도 같은 칸은 같은 노드라
  // transform만 바뀌며 이동한다. 새 칸은 가장자리(투명한 곳)에서 마운트된다.
  const slots: number[] = []
  const singleArtwork = presentation === 'artwork' && n === 1
  if (singleArtwork) slots.push(base)
  else for (let v = base - REACH; v <= base + REACH; v += 1) slots.push(v)

  return (
    <section
      data-presentation={presentation}
      aria-roledescription="carousel"
      aria-label={text('대표 공연', 'Featured shows')}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          go(-1)
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          go(1)
        }
      }}
      className="flex w-full min-w-0 flex-col items-center gap-5 overflow-x-clip py-10 md:py-14"
    >
      {/* 래퍼 폭이 3장 + 화살표를 정확히 담는다. 그보다 좁은 화면에서는 100%로 줄어든다 */}
      <div
        ref={wrapRef}
        className="relative flex items-center justify-center"
        style={{ height: CH * fit + 40, width: '100%', maxWidth: WRAP_W }}
      >
        {!singleArtwork && (
          <button
            type="button"
            aria-label={text('이전 공연', 'Previous show')}
            onClick={() => go(-1)}
            className="absolute left-0 z-30 hidden h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-lg text-primary md:flex"
          >
            {presentation === 'artwork' ? <CarouselChevron /> : '‹'}
          </button>
        )}

        {/* 드래그는 카드 트랙에서만 시작한다. 화살표·점은 이 밖에 있어 캡처에 걸리지 않는다.
            트랙 폭을 3장 시야로 잡아 옆 카드 위에서도 드래그가 시작된다 */}
        <div
          className="relative touch-pan-y select-none"
          // zoom은 자식 transform·그림자까지 같은 배율로 줄인다 — 좁은 화면에서만 1 미만
          style={{ width: VISIBLE_SPAN, height: CH, zoom: fit }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          // 중앙 카드 밖을 누르면 그 방향으로 한 칸. 모바일에는 화살표가 없다(onTrackClick 주석)
          onClick={onTrackClick}
        >
          {slots.map((v) => {
            const item = items[mod(v, n)]
            const offset = v - pos + drag / GAP
            const abs = Math.abs(offset)
            const scale = 1 - Math.min(abs, 1) * (1 - SIDE_SCALE)
            // 0~0.5 중앙 불투명 · 0.5~1.5 옆 카드 0.38→0 · 1.5 이상 보이지 않음(3장 시야)
            // 계수를 0.55에서 내렸다 — 멈춘 옆 칸(abs=1)의 실효 불투명도가 0.275 → 0.19다.
            // "중앙만 조명을 받는다"를 만드는 숫자라 여기 하나만 바꾸면 전체 인상이 바뀐다.
            const opacity = abs < 0.5 ? 1 : abs < 1.5 ? 0.38 * (1.5 - abs) : 0
            const isCenter = abs < 0.5

            return (
              <div
                key={v}
                aria-hidden={!isCenter}
                // 중앙 카드만 기울고 떠오른다. 이 칸은 포스터를 자르려고 overflow-hidden인데
                // 그대로면 떠오른 카드의 가장자리가 잘리므로, 표식을 붙여 CSS가 클리핑을
                // 안쪽 카드로 넘기게 한다(fx-hover.css). 옆 카드에는 붙지 않아 그대로다.
                data-fx={isCenter ? 'frame' : undefined}
                className="absolute top-0 overflow-hidden rounded-[6px]"
                style={{
                  // 트랙 중앙에 놓고 offset만큼 밀어낸다
                  left: (VISIBLE_SPAN - CW) / 2,
                  width: CW,
                  height: CH,
                  transform: `translateX(${offset * GAP}px) scale(${scale})`,
                  opacity,
                  zIndex: 10 - Math.round(abs),
                  // 조명이 위에서 내려오니 그림자는 아래로만 진다(x 오프셋 0). 옛 값은
                  // 브랜드 hex를 박아 두면 다크 화면에도 라이트용 그림자가 남는다.
                  // 토큰 + color-mix로 바꿔 현재 테마를 따라가게 했다.
                  // (인라인이라 Lightning CSS를 거치지 않는다 — gradient 폴백 문제와 무관하다.
                  //  color-mix 미지원 브라우저에서는 선언이 무시돼 그림자만 사라진다.)
                  boxShadow: isCenter
                    ? '0 24px 48px color-mix(in srgb, var(--color-primary) 18%, transparent)'
                    : 'none',
                  // 드래그 중에는 전환을 끈다 — 손가락에 1:1로 붙어야 한다.
                  // 투명도는 이동의 절반 시간에 끝낸다 — ease-out 꼬리에서 거의 안 보이는
                  // 카드가 화살표 밑을 지나가는 잔상을 없애기 위해서다
                  transition: dragging
                    ? 'none'
                    : `transform ${DURATION}ms ${EASE}, opacity ${DURATION / 2}ms ${EASE}`,
                  pointerEvents: isCenter ? 'auto' : 'none',
                  willChange: 'transform, opacity',
                }}
              >
                {/* 포스터+캡션을 한 겹으로 묶는다 — 기울기·뜨기는 둘이 같이 움직여야 하고,
                    칸(div) 자체는 캐러셀이 transform으로 쓰고 있어 겹칠 수 없기 때문이다.
                    CSS가 없으면 스타일 없는 <div> 한 겹이라 레이아웃이 그대로다(높이=포스터).
                    onPointerMove는 stopPropagation하지 않는다 — 같은 이벤트를 바깥 트랙의
                    드래그 로직이 받아야 한다. 드래그 중에는 포인터 캡처가 트랙에 있어
                    move가 여기까지 오지도 않고, data-dragging으로 CSS가 효과를 끈다. */}
                <div
                  data-fx={isCenter ? 'tilt' : undefined}
                  data-fx-variant="poster"
                  data-dragging={dragging ? 'true' : undefined}
                  onPointerMove={trackFxPointer}
                  // ⚠ 이름을 **상시로 갖지 않는다.** 2026-09-09까지는 중앙 카드가 늘 물고 있었는데,
                  // 그러면 아래 그리드 카드를 눌렀을 때 이름이 둘이 되어(실측 2개) 전환이 통째로
                  // 취소됐다 — 캐러셀은 되는데 목록은 안 되던 이유다. 누르는 순간에만 잡는다
                  // (아래 onClick의 claimPosterName). 상세(A-02) 포스터가 같은 이름을 받아
                  // 포스터가 그 자리로 늘어나며 열린다(fx-stage.css)
                  data-vt-card={isCenter ? '' : undefined}
                >
                  <Poster
                    src={item.posterImageUrl}
                    seed={item.performanceId}
                    label={item.title}
                    ratio="2/3"
                    className={presentation === 'artwork' ? 'object-contain' : undefined}
                    allowDemoArtwork={presentation === 'artwork' ? false : undefined}
                  />
                  {isCenter && (
                    <Link
                      aria-label={
                        presentation === 'artwork'
                          ? text(`${item.title} 공연 자세히 보기`, `View ${item.title}`)
                          : undefined
                      }
                      to={`/performances/${item.performanceId}`}
                      viewTransition
                      // 드래그로 밀었을 때는 이동하지 않는다(before가 false). 아니면 블룸 → 모핑 전환
                      onClick={open(`/performances/${item.performanceId}`, (e) => {
                        // 드래그로 밀었을 때는 이동하지 않는다
                        // TAP_SLOP를 트랙 탭 판정과 **같은 값**으로 쓴다 — 한쪽만 올리면
                        // 옆은 넘어가는데 가운데는 안 열리는 어긋난 손맛이 된다
                        if (Math.abs(lastDrag.current) > TAP_SLOP) return false
                        claimPosterName(e.currentTarget.closest<HTMLElement>('[data-vt-card]'))
                      })}
                      className={
                        presentation === 'artwork'
                          ? 'absolute inset-x-0 bottom-0 block h-16 focus-visible:outline-offset-[-4px]'
                          : 'absolute inset-x-0 bottom-0 block bg-gradient-to-t from-black/90 via-black/40 to-transparent px-4 pt-14 pb-4'
                      }
                    >
                      {presentation !== 'artwork' && (
                        <>
                          <span className="mb-0.5 block font-sans text-[13px] font-bold text-white">
                            {item.title}
                          </span>
                          <span className="block font-sans text-[10px] text-white/75">
                            {item.dateLabel} · {item.venue}
                          </span>
                        </>
                      )}
                    </Link>
                  )}
                </div>
                {/* 조명 밖의 공기. 투명도 계수를 0.38로 내리면서 안개는 /40 → /20으로 낮췄다 —
                    둘 다 어둡게 하면 옆 카드가 포스터가 아니라 회색 판때기로 보인다 */}
                {!isCenter && <span className="absolute inset-0 bg-ground/20" />}
              </div>
            )
          })}
        </div>

        {!singleArtwork && (
          <button
            type="button"
            aria-label={text('다음 공연', 'Next show')}
            onClick={() => go(1)}
            className="absolute right-0 z-30 hidden h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-lg text-primary md:flex"
          >
            {presentation === 'artwork' ? <CarouselChevron next /> : '›'}
          </button>
        )}
      </div>

      {/* 점 — 장식이 아니라 이동 버튼이다. 누르면 가장 가까운 방향으로 돈다 */}
      <div className="flex gap-[7px]">
        {items.map((item, i) => {
          // 현재에서 i까지 가장 짧은 방향의 거리 — 회전문이니 뒤로 도는 게 짧을 수도 있다
          let delta = i - current
          if (delta > n / 2) delta -= n
          if (delta < -n / 2) delta += n
          return (
            <button
              key={item.performanceId}
              type="button"
              aria-label={text(`${i + 1}번째 공연: ${item.title}`, `Show ${i + 1}: ${item.title}`)}
              aria-current={i === current ? 'true' : undefined}
              onClick={() => setPos(base + delta)}
              className={
                presentation === 'artwork'
                  ? 'flex h-11 w-11 items-center justify-center'
                  : 'flex h-11 items-center'
              }
            >
              <span
                className={[
                  'block h-[7px] rounded-[4px] transition-all duration-250',
                  i === current ? 'w-[18px] bg-ink' : 'w-[7px] bg-line',
                ].join(' ')}
              />
            </button>
          )
        })}
      </div>

      {/* 스크린리더에는 현재 카드만 알린다 — 카드가 움직일 때마다 읽히지 않게 */}
      <p className="sr-only" aria-live="polite">
        {active.title}
      </p>
    </section>
  )
}

function CarouselChevron({ next = false }: { next?: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={next ? 'm9 5 7 7-7 7' : 'm15 5-7 7 7 7'} />
    </svg>
  )
}
