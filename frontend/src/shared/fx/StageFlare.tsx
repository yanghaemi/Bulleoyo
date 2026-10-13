/**
 * A-01 히어로 배경 · **다크 테마 전용** — 중앙 카드 뒤에서 새어 나오는 무대 조명(WebGPU).
 *
 * 밝은 테마의 `HeroBackdrop`(무대 위 조명 풀)과 같은 자리에 마운트되며, `HomeScreen`이
 * `useTheme()`로 둘 중 하나만 렌더한다. 어두운 바닥에서는 "옅게 물든 풀"이 보이지 않고
 * 반대로 "새어 나오는 빛"이 보이기 때문에 셰이더를 따로 뒀다 — 같은 셰이더의 파라미터 조정으로는
 * 두 장면이 나오지 않는다(하나는 감산 느낌, 하나는 가산이다).
 *
 * ── 참고: Vercel vgpu 예제 `nextjs-flare` ─────────────────────────────
 * 로고 가장자리 림 라이트 + 빛 방향 48단계 레이 워크(볼류메트릭 산란) + 블루 노이즈 지터.
 * 그 구조를 카드 SDF 하나로 해석적으로 다시 썼다 — 렌더 타깃·텍스처 패스가 없다.
 * 어떤 것을 왜 바꿨는지는 `stageFlare.wgsl` 상단 주석에 있다.
 *
 * ── 움직임은 `stageRig`가, 여기는 GPU 수명만(2026-09-09) ─────────────────
 * 예전에는 여기서 지수 추종(`light += (target-light) * (1-exp(-dt/τ))`)을 손으로 돌렸다.
 * 지금은 `stageRig`가 `motion/vgpu`로 MotionValue를 uniform에 직접 묶고 스프링이 민다.
 * 바뀐 것은 코드량이 아니라 **움직임의 질**이다 — 지수 추종은 목표에 다가가기만 하지만
 * 스프링은 속도를 갖는다. 커서를 홱 던지면 빛이 따라오다 살짝 넘어갔다 돌아온다.
 * 클릭 순간의 도약(아래 `onBurst`)은 이 관성이 있어야 "번쩍"으로 읽힌다.
 *
 * 이 파일에 남은 것은 어댑터·서피스·프레임 루프·정리, 그리고 **매 프레임 목표가 어디인가**다.
 * 점등·추종·도약의 곡선은 `stageRig.ts`에 있고 `stageRig.test.ts`가 그 곡선을 실제로 잰다
 * (WebGPU 어댑터 없이도 — 그래서 CI에서도 움직임이 검증된다).
 *
 * ── 롤백 (한 줄) ───────────────────────────────────────────────────
 * `HomeScreen.tsx`의 `theme === 'dark' ? <StageFlare /> : <HeroBackdrop />`를 `<HeroBackdrop />`로
 * 되돌리면 끝. 완전 제거는 이 파일 + `stageFlare.wgsl` 삭제.
 *
 * ── 지원·성능 규약은 HeroBackdrop과 같다 ───────────────────────────────
 * 점진적 향상(WebGPU 없으면 캔버스 자체를 만들지 않음, `gpuSupport.webGpuEligible`), 동적 import,
 * DPR 상한 1.5, 탭 hidden·뷰포트 밖이면 루프 정지, 언마운트 시 surface·gpu 해제.
 *
 * ── 카드 위치는 DOM에서 잰다 ────────────────────────────────────────
 * 셰이더의 "가림막"은 캐러셀 중앙 카드다. 좌표를 상수로 박지 않고 `[data-fx="frame"]`
 * (ShowCarousel이 중앙 카드에만 붙이는 속성)의 getBoundingClientRect를 캔버스 기준 uv로 바꿔 넘긴다.
 * 카드 배율(`zoom`)·모바일 여백이 바뀌어도 빛이 카드 가장자리에 정확히 붙는다.
 * 리사이즈·스크롤 때만 다시 잰다(강제 레이아웃이라 pointermove마다 부르지 않는다).
 */

import { useEffect, useRef, useState } from 'react'

import type { Frame, FrameLoopHandle, Gpu, Surface } from 'vgpu'

import { BURST_EVENT } from './burst'
import { cssColor, webGpuEligible } from './gpuSupport'
import type { Rgb } from './gpuSupport'
import { createStageRig } from './stageRig'
import type { StageRig } from './stageRig'
import shaderSource from './stageFlare.wgsl?raw'

type Point = readonly [number, number]

/** 어두운 바닥의 밝기 배율. 1.0으로 시작했는데 "조명이 너무 센가"는 피드백에 0.8로 내렸다(2026-09-08).
 *  배경 콘(fx-backdrop 다크 알파)도 같은 날 3할 내렸다 — 둘이 같은 자리에 겹쳐 세게 보였다. 부담스러우면 이 줄만 */
const STRENGTH = 0.8
/** 커서가 조명을 카드 뒤에서 끌고 가는 비율. 1.0이면 커서 위치 그대로. 0.55 = 카드 가장자리를 살짝 넘는 정도 */
const CURSOR_PULL = 0.55
/** 자율 궤도 — 카드 절반 크기 대비 반경 비율. 카드 뒤를 벗어나지 않되 가장자리를 스치게 */
const ORBIT = 0.85
/** 클릭 지점으로 던지는 비율(평소 CURSOR_PULL보다 멀리) */
const LUNGE_PULL = 0.8

const FALLBACK_A: Rgb = [0.482, 0.459, 1.0] // #7b75ff (다크 primary-bright)
const FALLBACK_B: Rgb = [0.89, 0.349, 0.612] // #e3599c (다크 sel)

/** 캔버스 기준 uv 카드 사각형. 실측 실패 시 320×480 카드가 히어로 높이 ~700px에 놓인 근사값 */
interface CardRect {
  center: Point
  /** 높이 단위(캔버스 높이 = 1) */
  half: Point
  cornerR: number
}
const FALLBACK_CARD: CardRect = { center: [0.5, 0.39], half: [0.229, 0.343], cornerR: 0.012 }
const containedArtwork = new WeakMap<HTMLImageElement, boolean>()

function themeColors(): { colorA: Rgb; colorB: Rgb } {
  return {
    colorA: cssColor(['--effect-primary-bright', '--color-primary'], FALLBACK_A),
    colorB: cssColor(['--color-sel'], FALLBACK_B),
  }
}

function measureCard(canvas: HTMLCanvasElement): CardRect {
  const host = canvas.parentElement
  const card = host?.querySelector<HTMLElement>('[data-fx="frame"]')
  const c = canvas.getBoundingClientRect()
  if (!card || c.width <= 0 || c.height <= 0) return FALLBACK_CARD
  let r = card.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return FALLBACK_CARD
  // Artwork is contained, not cropped: its painted bounds can be smaller than
  // the 2:3 carousel slot. Light must follow the image, not the letterbox.
  const image = card.querySelector('img')
  const isContained = image
    ? (containedArtwork.get(image) ?? (() => {
        const value = getComputedStyle(image).objectFit === 'contain'
        containedArtwork.set(image, value)
        return value
      })())
    : false
  if (
    image &&
    image.naturalWidth > 0 &&
    image.naturalHeight > 0 &&
    isContained
  ) {
    const box = image.getBoundingClientRect()
    const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight)
    const width = image.naturalWidth * scale
    const height = image.naturalHeight * scale
    r = new DOMRect(
      box.left + (box.width - width) / 2,
      box.top + (box.height - height) / 2,
      width,
      height,
    )
  }
  return {
    center: [(r.left + r.width / 2 - c.left) / c.width, (r.top + r.height / 2 - c.top) / c.height],
    half: [r.width / 2 / c.height, r.height / 2 / c.height],
    // 카드 모서리는 rounded-card(8px)다. 캔버스 높이 단위로
    cornerR: Math.max(8 / c.height, 0.004),
  }
}

/** 포인터가 없을 때 조명이 카드 뒤를 천천히 돈다. 예제 mapAutonomousLight의 궤도 계수를 그대로 */
function autonomousLight(t: number, card: CardRect, aspect: number): Point {
  const phase = t * 0.32
  const radius = 0.34 + 0.09 * Math.sin(phase * 0.83)
  // 높이 단위 → uv. x는 종횡비로 나눠 되돌린다
  const dx = (Math.cos(phase) * radius * 1.1 * ORBIT * card.half[0] * 2) / aspect
  const dy = -Math.sin(phase) * radius * 0.85 * ORBIT * card.half[1] * 2
  return [card.center[0] + dx, card.center[1] + dy]
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

export function StageFlare({ onActiveChange }: Props = {}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [enabled, setEnabled] = useState(() => webGpuEligible('StageFlare'))
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
      let rig: StageRig | null = null
      try {
        // vgpu는 지연 로드한다(Motion도 stageRig 안에서 같이). WebGPU가 없는 브라우저에서는
        // 이 boot 자체가 돌지 않아 둘 다 내려받지 않는다 — 조명은 CSS 기본층(fx-hero.css)이 맡는다
        const { clock, effect, frameLoop, init, surface } = await import('vgpu')
        if (torndown) return

        gpu = await init()
        if (torndown) {
          gpu.dispose()
          return
        }
        const context = gpu

        surf = surface(context, canvas, {
          dpr: [1, 1.5],
          alphaMode: 'premultiplied',
          clearColor: [0, 0, 0, 0],
          label: 'stage-flare',
        })
        const view = surf

        let card = measureCard(canvas)
        const colors = themeColors()
        const fx = effect(context, shaderSource, {
          label: 'stage-flare',
          set: {
            params: {
              res: view.size,
              light: card.center,
              cardCenter: card.center,
              cardHalf: card.half,
              time: 0,
              frame: 0,
              strength: STRENGTH,
              hold: 0,
              colorA: colors.colorA,
              cornerR: card.cornerR,
              colorB: colors.colorB,
              _pad: 0,
            },
          },
        })

        const clk = clock(context)

        // ── 조명 장치 ───────────────────────────────────────────────
        // 어디를 얼마나 밝게 비출지는 전부 stageRig가 정한다(점등·스프링 추종·클릭 도약).
        // 여기서 남은 몫은 매 프레임 "목표가 어디인가"를 계산해 넘기는 것뿐이다
        rig = await createStageRig({ sink: fx, center: card.center, strength: STRENGTH })
        if (torndown) {
          rig.stop()
          rig = null
          view.dispose()
          context.dispose()
          return
        }
        const stage = rig

        // ── 포인터 → 조명 목표 ───────────────────────────────────────
        let pointer: Point | null = null
        let rect = canvas.getBoundingClientRect()
        let rectStale = true
        let cardStale = false
        let cardMovingUntil = 0
        const markStale = () => {
          rectStale = true
          cardStale = true
        }
        const markResponsiveStale = () => {
          canvas.parentElement
            ?.querySelectorAll('img')
            .forEach((image) => containedArtwork.delete(image))
          markStale()
        }
        const freshRect = () => {
          if (rectStale) {
            rect = canvas.getBoundingClientRect()
            rectStale = false
          }
          return rect
        }

        const onPointerMove = (e: PointerEvent) => {
          if (e.pointerType === 'touch') return
          const r = freshRect()
          if (r.width <= 0 || r.height <= 0) return
          pointer = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]
        }
        // 히어로 밖으로 나가면 자율 궤도로 돌아간다. window에서 듣되 캔버스 영역 밖이면 놓는다
        const onPointerLeaveWindow = () => {
          pointer = null
        }

        // ── 클릭 도약 ────────────────────────────────────────────────
        // `useStageLink`가 공연으로 들어갈 때 쏘는 신호(StageBloom도 같은 걸 듣는다).
        // 눌린 자리로 조명을 던지고 세기를 부풀린다. 스프링이라 목표를 지나쳤다 돌아오면서
        // 빛이 휘청인다 — 이 도약 뒤 170ms 후에 View Transition이 시작된다.
        // 도약 동안 tick의 `aim`은 장치가 알아서 무시한다(`stageRig.LUNGE_HOLD_MS`).
        const onBurst = (e: Event) => {
          const at = (e as CustomEvent<{ x: number; y: number }>).detail
          const r = freshRect()
          if (!at || r.width <= 0 || r.height <= 0) return
          const px = (at.x - r.left) / r.width
          const py = (at.y - r.top) / r.height
          // ⚠ 히어로 밖에서 온 신호는 무시한다(MR !61 자동 리뷰 지적).
          // `emitBurst`는 `useStageLink`를 쓰는 **모든** 링크가 쏜다 — 아래 그리드 카드를 누르면
          // py가 1을 크게 넘어 조명이 캔버스 밖으로 날아가고, LUNGE_HOLD_MS(280ms) 동안 aim이
          // 막혀 되돌아오지도 못한다(전환은 170ms 뒤에 시작한다). tick이 포인터에 쓰는 것과 같은 게이트다
          if (px < -0.2 || px > 1.2 || py < -0.3 || py > 1.3) return
          stage.lunge(
            card.center[0] + (px - card.center[0]) * LUNGE_PULL,
            card.center[1] + (py - card.center[1]) * LUNGE_PULL,
          )
        }

        const offResize = view.onResize(({ width, height }) => {
          rectStale = true
          cardStale = true
          fx.set({ params: { res: [width, height] } })
        })

        // ── 루프 ────────────────────────────────────────────────────
        let handle: FrameLoopHandle | null = null
        let onScreen = true
        let frameIndex = 0

        const tick = (frame: Frame) => {
          const t = clk.time

          if (cardStale || performance.now() < cardMovingUntil) {
            card = measureCard(canvas)
            cardStale = false
            fx.set({
              params: { cardCenter: card.center, cardHalf: card.half, cornerR: card.cornerR },
            })
          }

          const aspect = view.size[0] / Math.max(view.size[1], 1)
          // 포인터가 있으면 카드 중심에서 커서 쪽으로 PULL만큼. 히어로 영역을 크게 벗어난 커서는 놓는다
          let target: Point
          if (
            pointer &&
            pointer[0] > -0.2 &&
            pointer[0] < 1.2 &&
            pointer[1] > -0.3 &&
            pointer[1] < 1.3
          ) {
            target = [
              card.center[0] + (pointer[0] - card.center[0]) * CURSOR_PULL,
              card.center[1] + (pointer[1] - card.center[1]) * CURSOR_PULL,
            ]
          } else {
            pointer = null
            target = autonomousLight(t, card, aspect)
          }
          // 목표만 적는다 — 추종은 장치의 스프링이 하고, 도약 중이면 무시된다
          stage.aim(target[0], target[1])
          stage.hold(pointer !== null)

          // light·hold·strength는 장치가 넣는다. 여기서는 시간 축만
          fx.set({ params: { time: t, frame: frameIndex } })
          frame.pass(view, fx)
          frameIndex += 1
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

        const observer = new IntersectionObserver(
          (entries) => {
            onScreen = entries.some((entry) => entry.isIntersecting)
            sync()
          },
          { threshold: 0 },
        )
        observer.observe(canvas)

        const themeObserver = new MutationObserver(() => {
          const next = themeColors()
          fx.set({ params: { colorA: next.colorA, colorB: next.colorB } })
        })
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['data-theme'],
        })

        // A different upload can have a different aspect ratio, even though
        // every carousel slot stays 320×480. Re-measure during its transition
        // and after image loading without restarting the GPU surface.
        const host = canvas.parentElement
        const artworkChanged = () => {
          host?.querySelectorAll('img').forEach((image) => containedArtwork.delete(image))
          markStale()
          cardMovingUntil = performance.now() + 600
        }
        const artworkObserver = new MutationObserver(artworkChanged)
        if (host) {
          artworkObserver.observe(host, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['data-fx', 'src'],
          })
          host.addEventListener('load', artworkChanged, true)
          host.addEventListener('transitionend', markStale)
        }

        window.addEventListener('pointermove', onPointerMove, { passive: true })
        window.addEventListener('pointerleave', onPointerLeaveWindow, { passive: true })
        window.addEventListener('blur', onPointerLeaveWindow)
        window.addEventListener('scroll', markStale, { passive: true })
        window.addEventListener('resize', markResponsiveStale, { passive: true })
        window.addEventListener(BURST_EVENT, onBurst)
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
          artworkObserver.disconnect()
          host?.removeEventListener('load', artworkChanged, true)
          host?.removeEventListener('transitionend', markStale)
          offResize()
          stage.stop()
          rig = null
          window.removeEventListener('pointermove', onPointerMove)
          window.removeEventListener('pointerleave', onPointerLeaveWindow)
          window.removeEventListener('blur', onPointerLeaveWindow)
          window.removeEventListener('scroll', markStale)
          window.removeEventListener('resize', markResponsiveStale)
          window.removeEventListener(BURST_EVENT, onBurst)
          document.removeEventListener('visibilitychange', sync)
          activeRef.current?.(false)
          view.dispose()
          context.dispose()
        }
        if (torndown) teardown()
      } catch (err) {
        if (import.meta.env.DEV) {
          console.info('[StageFlare] WebGPU 배경을 건너뜁니다:', (err as Error)?.message ?? err)
        }
        rig?.stop()
        rig = null
        surf?.dispose()
        gpu?.dispose()
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
      // HeroBackdrop과 같은 이유의 -z-10 + 부모 isolate
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
    />
  )
}
