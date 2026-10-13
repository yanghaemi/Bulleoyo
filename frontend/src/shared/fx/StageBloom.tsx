/**
 * 무대 블룸 — 커서가 멈춘 자리와 누른 자리에 조명이 부드럽게 피었다 진다 (Canvas 2D).
 *
 * 강병구 요청(2026-09-08): "마우스 움직일 때 배경에서 조명이 조금씩 부드럽게 나타났다
 * 사라지는 것." 처음엔 흩날리는 빛가루(알갱이)도 함께 넣었는데 "알갱이는 아닌 거 같아"라고
 * 해서 뺐다. 지금 남은 것은 둘뿐이다:
 *   ① **정지 블룸** — 포인터가 0.6초 멈추면 그 자리에 큰 조명 원(반경 150~190px)이 1.8초 동안
 *      피었다 진다. 한 번 멈춤에 한 번. 조명기가 관객을 한 번 비춰 주는 느낌.
 *   ② **클릭 블룸** — Book now·공연 카드를 누르면(`emitBurst`) 그 지점에서 더 작고 빠른 원
 *      (반경 130px, 0.9초)이 번쩍 피고 진다. 화면 전환(View Transition)이 시작되기 전 170ms 동안
 *      보이고, 전환이 끝난 뒤 남은 꼬리가 새 화면 위에서 사라진다.
 *
 * ── 왜 Canvas 2D인가 ──────────────────────────────────────────────
 * WebGPU(vgpu)가 없어도 어디서나 돌아야 한다 — Firefox·LAN 주소·구형 기기. 원 몇 개의
 * drawImage는 2D로 충분하다. 스프라이트(방사형 그라디언트 원)는 색별로 한 번만 만들고 크기만 바꿔 찍는다.
 *
 * ── 어지럽지 않게 ─────────────────────────────────────────────────
 *   · 움직이는 동안에는 아무것도 그리지 않는다. 멈추거나 눌렀을 때만.
 *   · sin 엔벌로프(0→1→0)로 알파가 변해 뚝 나타나거나 뚝 사라지지 않는다.
 *   · 다크에서는 `lighter`(가산)로 빛처럼, 라이트에서는 `source-over` 저알파로.
 *   · `prefers-reduced-motion`·터치 기기(`hover: none`)에서는 캔버스를 만들지 않는다.
 *   · 그릴 것이 없으면 rAF를 멈춘다. 탭이 hidden이면 멈춘다.
 *
 * ── 롤백 ─────────────────────────────────────────────────────────
 * `app/providers.tsx`의 `<StageBloom />` 한 줄 삭제. 클릭 신호를 쏘는 쪽(`useStageLink` → `burst.ts`)은
 * 아무도 듣지 않는 이벤트를 쏠 뿐이라 함께 지우지 않아도 된다.
 *
 * ── z 축 ─────────────────────────────────────────────────────────
 * `AmbientBackdrop`과 같은 규약 — body 직계 포털, `position: fixed; z-index: -1`. providers에서
 * AmbientBackdrop 다음에 마운트해 조명 콘 위에 그려진다. 페이지 루트 래퍼에 불투명 `bg-ground`가
 * 있으면 이 층이 통째로 가려진다(2026-09-08 fx-backdrop.css 말미 주석) — 래퍼는 `min-h-dvh`만 둔다.
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { BURST_EVENT } from './burst'
import { cssColor } from './gpuSupport'
import type { Rgb } from './gpuSupport'

/* ── 튜닝 지점 ───────────────────────────────────────────────────── */
const IDLE_MS = 600
const IDLE_TTL = 1.8
const IDLE_RADIUS: [number, number] = [150, 190]
const CLICK_TTL = 0.9
const CLICK_RADIUS = 130
/** 최대 알파. 다크는 가산이라 낮게, 라이트는 덧칠이라 조금 더 */
const ALPHA = { dark: { idle: 0.11, click: 0.2 }, light: { idle: 0.09, click: 0.16 } }
const DPR_MAX = 1.5

interface Bloom {
  kind: 'idle' | 'click'
  x: number
  y: number
  age: number
  ttl: number
  radius: number
  /** 0 = primary 계열, 1 = sel(자홍) */
  tint: 0 | 1
}

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo)

function prefers(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(query).matches
}

function isDark(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'dark'
}

/** 방사형 그라디언트 원 스프라이트. 중심 불투명 → 가장자리 투명 */
function makeSprite(color: Rgb, size = 128): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')!
  const [r, gg, b] = color.map((v) => Math.round(v * 255))
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, `rgba(${r},${gg},${b},1)`)
  grad.addColorStop(0.4, `rgba(${r},${gg},${b},0.45)`)
  grad.addColorStop(1, `rgba(${r},${gg},${b},0)`)
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  return c
}

function themeSprites(): [HTMLCanvasElement, HTMLCanvasElement] {
  const dark = isDark()
  // 라이트 바탕에서는 bright(#5b54ff)가 씻겨 보이므로 본색 primary를, 다크에서는 bright를
  const a = cssColor(
    dark ? ['--effect-primary-bright', '--color-primary'] : ['--color-primary'],
    [0.36, 0.33, 1],
  )
  const b = cssColor(['--color-sel'], [0.85, 0.27, 0.55])
  return [makeSprite(a), makeSprite(b)]
}

export function StageBloom() {
  const [enabled] = useState(
    () =>
      typeof document !== 'undefined' &&
      !prefers('(hover: none)') &&
      !prefers('(prefers-reduced-motion: reduce)'),
  )
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!enabled || !canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    let sprites = themeSprites()
    let dark = isDark()
    const blooms: Bloom[] = []
    let raf = 0
    let last = 0
    let dpr = 1

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX)
      canvas.width = Math.floor(window.innerWidth * dpr)
      canvas.height = Math.floor(window.innerHeight * dpr)
    }
    resize()

    const spawn = (b: Bloom) => {
      blooms.push(b)
      schedule()
    }

    // ── ① 정지 블룸 ─────────────────────────────────────────────
    let lastX = NaN
    let lastY = NaN
    let idleTimer = 0
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      lastX = e.clientX
      lastY = e.clientY
      window.clearTimeout(idleTimer)
      idleTimer = window.setTimeout(() => {
        spawn({
          kind: 'idle',
          x: lastX,
          y: lastY,
          age: 0,
          ttl: IDLE_TTL,
          radius: rand(IDLE_RADIUS[0], IDLE_RADIUS[1]),
          // 대체로 보라, 가끔 자홍 — 조명기가 두 종류다(배경 콘과 같은 규칙)
          tint: Math.random() < 0.8 ? 0 : 1,
        })
      }, IDLE_MS)
    }

    // ── ② 클릭 블룸 ─────────────────────────────────────────────
    const onBurst = (e: Event) => {
      const { x, y } = (e as CustomEvent<{ x: number; y: number }>).detail
      spawn({ kind: 'click', x, y, age: 0, ttl: CLICK_TTL, radius: CLICK_RADIUS, tint: 0 })
    }

    // ── 루프 ──────────────────────────────────────────────────
    const step = (now: number) => {
      raf = 0
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016
      last = now

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over'
      const A = dark ? ALPHA.dark : ALPHA.light

      for (let i = blooms.length - 1; i >= 0; i--) {
        const b = blooms[i]
        b.age += dt
        if (b.age >= b.ttl) {
          blooms.splice(i, 1)
          continue
        }
        const t = b.age / b.ttl
        // 클릭은 빨리 켜지고 천천히 꺼진다(제곱근으로 앞을 당김). 정지는 대칭으로 숨 쉰다
        const env = b.kind === 'click' ? Math.sin(Math.PI * Math.sqrt(t)) : Math.sin(Math.PI * t)
        // 피는 동안 살짝 커진다 — 빛이 퍼지는 방향
        const r = b.radius * (0.85 + 0.2 * t)
        ctx.globalAlpha = (b.kind === 'click' ? A.click : A.idle) * env
        ctx.drawImage(sprites[b.tint], b.x - r, b.y - r, r * 2, r * 2)
      }

      if (blooms.length > 0) schedule()
      else last = 0
    }

    const schedule = () => {
      if (raf || document.visibilityState === 'hidden') return
      raf = requestAnimationFrame(step)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (raf) cancelAnimationFrame(raf)
        raf = 0
        last = 0
        return
      }
      schedule()
    }

    // 테마가 바뀌면 색과 합성 모드를 다시 잡는다
    const themeObserver = new MutationObserver(() => {
      sprites = themeSprites()
      dark = isDark()
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener(BURST_EVENT, onBurst)
    window.addEventListener('resize', resize, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener(BURST_EVENT, onBurst)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
      themeObserver.disconnect()
      window.clearTimeout(idleTimer)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [enabled, canvas])

  if (!enabled || typeof document === 'undefined') return null

  return createPortal(
    <canvas
      ref={setCanvas}
      aria-hidden
      className="fx-bloom"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: -1,
        pointerEvents: 'none',
      }}
    />,
    document.body,
  )
}

export default StageBloom
