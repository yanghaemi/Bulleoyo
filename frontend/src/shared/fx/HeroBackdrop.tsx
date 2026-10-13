/**
 * A-01 히어로 배경 — 캐러셀 중앙 카드 뒤의 무대 조명 풀 (WebGPU).
 *
 * ── 역할 분리 (2026-09-08) ───────────────────────────────────────────────────
 * 배경 레이어(`styles/fx-backdrop.css`)와 이 캔버스가 같은 색으로 같은 자리를 덮어
 * 두 겹으로 보이던 것을 갈랐다.
 *   · 배경 CSS = **객석 전체** — 위에서 내려오는 조명 콘 3줄기 + 커서 팔로우 스팟(420px)
 *   · 이 캔버스 = **무대 위 풀 하나** — 중앙 카드 뒤에 고정, 커서 추종은 12%만
 * 셰이더의 반경·중심 결정은 `heroBackdrop.wgsl` 상단 주석에 있다. 이 파일은 그대로다 —
 * uniform 이름·순서를 하나도 바꾸지 않았다(struct Params ↔ 아래 `set:{ params }`).
 * ─────────────────────────────────────────────────────────────────────────────
 * 롤백 (한 줄)
 *   `src/features/performance/HomeScreen.tsx`에서 `<HeroBackdrop />` 한 줄과
 *   그 import 한 줄을 지우면 끝이다. 함께 들어간 래퍼 `<div className="relative isolate">`는
 *   블록 흐름을 바꾸지 않으므로 남겨 둬도 화면이 같다(지우려면 원래 `<>…</>`로 되돌린다).
 *   완전 제거는 이 파일 + `heroBackdrop.wgsl` 삭제 후 `pnpm remove vgpu`.
 *
 * ⚠ 스택 문서 미반영 — 실험. 채택 시 `docs/design/09_기술_스택`에 `vgpu`를 추가해야 한다.
 *   기술 스택 v3에는 그래픽 라이브러리 항목이 없다.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 점진적 향상만 한다. 팀 브라우저 하한은 Safari 16.4 · Chrome 111 · Firefox 128인데
 * WebGPU는 Safari 26+ / Firefox 미지원이다. 그래서 **켜지지 않는 게 정상 경로**다 —
 * 아래 조건 중 하나라도 걸리면 DOM에 캔버스조차 만들지 않고 지금 화면이 그대로 폴백이다.
 *
 *   ① `navigator.gpu`가 없다(Firefox·구형 Safari)
 *   ② `prefers-reduced-motion: reduce` — 커서 반응 자체가 모션이다
 *   ③ 어댑터·디바이스 획득 실패(원격 데스크톱, GPU 블록리스트, 드라이버)
 *
 * 콘솔 노이즈를 만들지 않는다. 실패는 조용히 넘어가고 DEV에서만 한 줄 남긴다 —
 * "WebGPU 없음"은 우리 하한 브라우저의 정상 상태라 error로 찍으면 매번 빨간 줄이 뜬다.
 *
 * 성능 —
 *   · DPR 상한 1.5, 프레임 상한 60fps
 *   · 탭이 hidden이거나 배경이 뷰포트 밖이면 루프를 멈춘다
 *   · 언마운트 시 surface·gpu 해제
 *   · `vgpu`는 **동적 import**다. WebGPU가 없는 브라우저는 청크를 아예 받지 않고,
 *     지원 브라우저에서도 메인 번들이 아니라 별도 청크로 늦게 온다
 *
 * 색은 하드코딩하지 않고 `--color-*` CSS 변수를 읽는다. 라이트·다크 전환 시
 * `data-theme` 변화를 감지해 배경색도 따라간다. CTA와 분리된
 * `--effect-primary-bright`가 있으면 조명에는 그쪽을 먼저 쓴다.
 */

import { useEffect, useRef, useState } from 'react'

import type { Frame, FrameLoopHandle, Gpu, Surface } from 'vgpu'

import { cssColor, towards, webGpuEligible } from './gpuSupport'
import type { Rgb } from './gpuSupport'
import shaderSource from './heroBackdrop.wgsl?raw'

/**
 * 흰 캔버스 위 최대 알파. 처음 0.32로 잡았더니 실기기(Windows Chrome, GPU 정상)에서
 * "안 보인다"는 피드백이 왔다 — 어댑터는 잡혔고 로그도 없었으니 순수 강도 문제였다.
 *
 * 조명 풀로 좁힌 뒤에도 0.55를 유지한다. 반경이 줄어 **화면을 덮는 면적**은 크게 줄었고,
 * 이 피크가 나오는 자리는 불투명한 중앙 카드 **뒤**라 실제로 보이는 것은 카드 가장자리의
 * 후광(≈0.19)뿐이다. 조명이 세다는 느낌이 부담스러우면 이 한 줄만 내리면 된다.
 */
const MAX_ALPHA = 0.55
/** 브랜드색을 배경색 쪽으로 이만큼 끌어당겨 채도를 낮춘다. 같은 이유로 0.28 → 0.12 */
const DESATURATE = 0.12
/** 커서가 캔버스를 벗어나도 조금은 따라간다. 무한정 끌려가지 않게 자른다 */
const CURSOR_MIN = -0.6
const CURSOR_MAX = 1.6
/** WGSL의 FOLLOW_FAST · FOLLOW_SLOW와 같은 값이어야 앵커 갱신이 이어진다 */
const FOLLOW_FAST = 2.6
const FOLLOW_SLOW = 1.1
/** 첫 포인터 이벤트 전에는 `time - activeAt`이 음수라 흔들림(wander)이 살아 있다 */
const NEVER = 1e9

const FALLBACK_A: Rgb = [0.192, 0.161, 0.867] // #3129dd
const FALLBACK_B: Rgb = [0.851, 0.275, 0.553] // #d9468d
const FALLBACK_GROUND: Rgb = [0.969, 0.969, 0.984] // #f7f7fb

function themeColors(): { glowA: Rgb; glowB: Rgb } {
  const ground = cssColor(['--color-ground'], FALLBACK_GROUND)
  return {
    glowA: towards(
      cssColor(['--effect-primary-bright', '--color-primary'], FALLBACK_A),
      ground,
      DESATURATE,
    ),
    glowB: towards(cssColor(['--color-sel'], FALLBACK_B), ground, DESATURATE),
  }
}

interface Props {
  /**
   * 셰이더가 실제로 그리기 시작했는지 알린다(시작 true, 정리 false).
   *
   * 예전에는 여기서 `canvas.parentElement`에 `data-gpu="on"`을 직접 달았다. MR !56 리뷰 지적:
   * 그 부모가 누구인지는 **호출부 마크업에 달려 있다.** 이 컴포넌트 안에 캔버스를 감싸는 div가
   * 한 겹만 생겨도 `parentElement`가 그 래퍼를 가리키게 되고, `fx-hero.css`의
   * `[data-gpu='on'] .fx-hero-glow`가 조용히 안 맞게 된다 — CSS 기본 조명이 셰이더와 겹쳐
   * 계속 밝은 채로 남는다. 오류는 안 난다.
   * 그래서 DOM을 뒤지지 않고 사실만 알린다. 어디에 표시할지는 마크업을 아는 쪽이 정한다.
   */
  onActiveChange?: (active: boolean) => void
}

export function HeroBackdrop({ onActiveChange }: Props = {}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // 렌더 중 matchMedia를 매번 부르지 않게 최초 1회로 고정한다. 세션 중 설정이 바뀌면
  // 새로고침이 필요한데, 그래도 "덜 움직이는" 쪽으로 기울지 않으므로 다음 진입에서 반영된다
  // 어댑터 획득이 실패하면 false로 내려 캔버스를 DOM에서 치운다 — `eligible()`은
  // `navigator.gpu` 존재까지만 볼 수 있고, 어댑터 유무(원격 데스크톱·헤드리스·블록리스트)는
  // 비동기라 여기서 되돌려야 빈 캔버스가 남지 않는다
  const [enabled, setEnabled] = useState(() => webGpuEligible('HeroBackdrop'))
  // 콜백을 이펙트 의존성에 넣지 않는다 — 호출부가 매 렌더 새 함수를 주면 그때마다 어댑터를
  // 다시 잡고 서피스를 다시 만든다. 최신 것만 ref로 들고 본다
  const activeRef = useRef(onActiveChange)
  activeRef.current = onActiveChange

  useEffect(() => {
    const canvas = canvasRef.current
    if (!enabled || !canvas) return

    let torndown = false
    let teardown: (() => void) | null = null

    const boot = async () => {
      let gpu: Gpu | null = null
      let surf: Surface | null = null
      try {
        const { clock, effect, frameLoop, init, surface } = await import('vgpu')
        if (torndown) return

        // 어댑터가 없으면 여기서 VGPU-RING1-UNSUPPORTED로 던진다 → 조용히 폴백.
        // `powerPreference: 'low-power'`는 뺐다 — Windows Chrome이 무시하면서 콘솔에
        // 경고를 찍는다(crbug.com/369219127). 풀스크린 쿼드 하나라 절전 힌트의 실익도 없다.
        gpu = await init()
        if (torndown) {
          gpu.dispose()
          return
        }
        const context = gpu

        surf = surface(context, canvas, {
          // 배경이므로 선명도보다 전력이 우선. 레티나에서 4배 픽셀을 칠할 이유가 없다
          dpr: [1, 1.5],
          // 캔버스가 페이지 위에 투명하게 얹혀야 한다
          alphaMode: 'premultiplied',
          clearColor: [0, 0, 0, 0],
          label: 'hero-backdrop',
        })
        const view = surf

        const colors = themeColors()
        const fx = effect(context, shaderSource, {
          label: 'hero-backdrop',
          set: {
            params: {
              res: view.size,
              anchorA: [0.5, 0.5],
              anchorB: [0.5, 0.5],
              cursor: [0.5, 0.5],
              time: 0,
              eventAt: 0,
              activeAt: NEVER,
              strength: MAX_ALPHA,
              glowA: colors.glowA,
              glowB: colors.glowB,
            },
          },
        })

        const clk = clock(context)

        // ── 포인터 추적 ────────────────────────────────────────────────
        // 매 프레임이 아니라 이벤트에서만 uniform을 쓴다. 부드럽게 따라가는 건 셰이더가 한다.
        const anchorA: [number, number] = [0.5, 0.5]
        const anchorB: [number, number] = [0.5, 0.5]
        let eventAt = 0
        let activeAt = NEVER

        // getBoundingClientRect는 강제 레이아웃이라 pointermove마다 부르지 않는다.
        // 스크롤·리사이즈로 더러워졌을 때만 다시 잰다
        let rect = canvas.getBoundingClientRect()
        let rectStale = true
        const markStale = () => {
          rectStale = true
        }

        const clampCursor = (v: number) => Math.min(CURSOR_MAX, Math.max(CURSOR_MIN, v))

        const onPointerMove = (e: PointerEvent) => {
          if (rectStale) {
            rect = canvas.getBoundingClientRect()
            rectStale = false
          }
          if (rect.width <= 0 || rect.height <= 0) return

          const now = clk.time
          const dt = Math.max(now - eventAt, 0)
          // 셰이더가 지금 그리고 있는 위치를 JS에서 같은 식으로 구해 새 앵커로 삼는다.
          // 이렇게 해야 이벤트 경계에서 빛무리가 튀지 않는다
          const kA = 1 - Math.exp(-dt * FOLLOW_FAST)
          const kB = 1 - Math.exp(-dt * FOLLOW_SLOW)
          const cursor: [number, number] = [
            clampCursor((e.clientX - rect.left) / rect.width),
            clampCursor((e.clientY - rect.top) / rect.height),
          ]
          anchorA[0] += (cursor[0] - anchorA[0]) * kA
          anchorA[1] += (cursor[1] - anchorA[1]) * kA
          anchorB[0] += (cursor[0] - anchorB[0]) * kB
          anchorB[1] += (cursor[1] - anchorB[1]) * kB
          eventAt = now
          if (activeAt === NEVER) activeAt = now

          fx.set({ params: { anchorA, anchorB, cursor, eventAt, activeAt } })
        }

        const offResize = view.onResize(({ width, height }) => {
          rectStale = true
          fx.set({ params: { res: [width, height] } })
        })

        // ── 루프 (탭이 숨거나 화면 밖이면 멈춘다) ───────────────────────
        let handle: FrameLoopHandle | null = null
        let onScreen = true

        const tick = (frame: Frame) => {
          fx.set({ params: { time: clk.time } })
          frame.pass(view, fx)
        }
        const sync = () => {
          const shouldRun = !torndown && onScreen && document.visibilityState !== 'hidden'
          if (shouldRun && !handle) {
            handle = frameLoop(context, tick, { fps: 60 })
          } else if (!shouldRun && handle) {
            handle.stop()
            handle = null
          }
        }

        // 히어로가 화면 밖으로 스크롤되면 GPU를 놀린다
        const observer = new IntersectionObserver(
          (entries) => {
            onScreen = entries.some((entry) => entry.isIntersecting)
            sync()
          },
          { threshold: 0 },
        )
        observer.observe(canvas)

        // 테마를 바꾸면 배경색도 따라간다
        const themeObserver = new MutationObserver(() => {
          const next = themeColors()
          fx.set({ params: { glowA: next.glowA, glowB: next.glowB } })
        })
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['data-theme'],
        })

        window.addEventListener('pointermove', onPointerMove, { passive: true })
        window.addEventListener('scroll', markStale, { passive: true })
        window.addEventListener('resize', markStale, { passive: true })
        document.addEventListener('visibilitychange', sync)
        sync()


        // 셰이더가 실제로 그리기 시작했다는 표식. CSS 기본 조명층(fx-hero.css)이 이걸 보고 낮춘다 —
        // 둘 다 같은 자리를 비추므로 겹치면 과하게 밝아진다
        activeRef.current?.(true)
        teardown = () => {
          handle?.stop()
          handle = null
          observer.disconnect()
          themeObserver.disconnect()
          offResize()
          window.removeEventListener('pointermove', onPointerMove)
          window.removeEventListener('scroll', markStale)
          window.removeEventListener('resize', markStale)
          document.removeEventListener('visibilitychange', sync)
          activeRef.current?.(false)
          view.dispose()
          context.dispose()
        }
        // init을 기다리는 동안 언마운트됐다면 지금 바로 되돌린다
        if (torndown) teardown()
      } catch (err) {
        // WebGPU가 없는 건 우리 하한 브라우저의 정상 상태다. 사용자 콘솔을 더럽히지 않는다
        if (import.meta.env.DEV) {
          console.info('[HeroBackdrop] WebGPU 배경을 건너뜁니다:', (err as Error)?.message ?? err)
        }
        surf?.dispose()
        gpu?.dispose()
        // 캔버스를 내린다. 남겨두면 0×0으로 그려지지 않는 요소가 DOM에 떠 있게 된다
        if (!torndown) setEnabled(false)
      }
    }

    void boot()

    return () => {
      torndown = true
      teardown?.()
      teardown = null
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      // -z-10 + 부모 `isolate` — z-0으로 두면 캔버스가 "위치 지정 + z-index" 요소가 되어
      // 위치 지정이 없는 형제(점 내비게이션·Book now 버튼)보다 **위에** 칠해진다.
      // 부모가 isolate로 쌓임 맥락을 만들어 주므로 음수 z는 그 안에서만 뒤로 간다
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
    />
  )
}
