/**
 * 무대 조명 장치 — 셰이더 uniform을 미는 Motion 값들.
 *
 * `StageFlare`에서 떼어냈다. 두 가지가 섞여 있었기 때문이다: **GPU 수명 관리**(어댑터·서피스·
 * 프레임 루프·정리)와 **움직임**(어디를 비추고 얼마나 밝은가). 뒤엣것만 여기 있다.
 *
 * 떼어낸 실익은 검증이다. WebGPU 어댑터가 없는 환경(CI·헤드리스·하한 브라우저)에서는
 * StageFlare가 통째로 부팅하지 않아 움직임을 확인할 방법이 없었다. 이 장치는 vgpu에 의존하지
 * 않는다 — `set()`을 가진 아무 객체나 받는다. 그래서 jsdom에서 곡선을 그대로 재생해 볼 수 있고,
 * `stageRig.test.ts`가 점등·추종·도약을 실제로 잰다.
 *
 * ⚠ 키 경로 규칙 — Motion은 `"params.hold"` 같은 문자열 경로로 uniform을 찾고, **마지막 글자가
 * x·y·z·w면 벡터 성분 접근으로 해석한다**(`params.lightx` → light[0]). Params에 필드를 더할 때
 * 이 글자로 끝나지 않게 한다. vec2 `light`를 성분이 아니라 `"x y"` 문자열로 넘기는 것도 같은
 * 이유다 — vgpu Effect에는 getter가 없어 Motion이 벡터의 현재값을 읽지 못한다.
 */

/** `set()`으로 uniform을 받는 것. 실제로는 vgpu의 Effect이고, 테스트에서는 기록용 가짜다 */
export interface UniformSink {
  set(bag: Record<string, unknown>): void
}

export type RigPoint = readonly [number, number]

/**
 * 조명이 목표를 쫓는 스프링.
 *
 * 감쇠비 ζ = damping / 2√(stiffness·mass) = 19 / 2√200 ≈ **0.67**, 오버슈트 ≈ 5.8%
 * (exp(−πζ/√(1−ζ²))). 이동 거리의 6%쯤 지나쳤다 돌아오는데, 그 한 박자가 관성으로 읽힌다.
 *
 * ⚠ 여기를 만질 때 — 처음에 ζ ≈ 0.90(90/18/1.1)으로 뒀다가 `stageRig.test.ts`에 걸렸다.
 * 수식상 분명히 덜 감쇠인데 오버슈트가 **0.12%**여서 눈으로는 예전 지수 추종과 구분이 안 됐다.
 * "덜 감쇠면 스프링답게 보인다"가 아니다 — ζ가 0.8을 넘으면 오버슈트가 1% 밑으로 떨어진다.
 * 스프링으로 바꾼 값어치가 사라지므로 0.6~0.7 범위를 유지한다.
 *
 * 반응 속도도 같이 봐야 한다. ω = √(stiffness/mass) = 14.1 rad/s, 안정까지 ≈ 4/(ζω) ≈ 0.42초로
 * 예전 지수 추종(τ 0.3초, 사실상 0.9초 수렴)보다 오히려 빠르다.
 */
export const LIGHT_SPRING = { stiffness: 200, damping: 19, mass: 1 } as const
/** 잡았다/놓았다 전환. 여기는 넘어가면 안 된다(밝기가 출렁인다) — 과감쇠로 둔다 */
export const HOLD_SPRING = { stiffness: 110, damping: 30, mass: 1 } as const
/** 클릭 때 세기가 부푸는 비율. 0.55 = 최대 1.55배 */
export const FLASH_GAIN = 0.55
/** 점등에 걸리는 시간(ms) */
export const INTRO_MS = 1100
/** 도약 직후 `aim()`을 무시하는 시간(ms). 이 동안은 클릭 지점이 목표를 붙잡는다 */
export const LUNGE_HOLD_MS = 280

export interface StageRigOptions {
  /** uniform을 받을 대상 */
  sink: UniformSink
  /** 조명이 출발하고 되돌아올 기준점(uv) — 캐러셀 중앙 카드의 중심 */
  center: RigPoint
  /** 기본 밝기 배율. 점등이 끝나면 여기에 도달한다 */
  strength: number
  /**
   * 점등 시작 위치의 기준점 대비 오프셋(uv). 스프링은 만들어질 때 소스의 현재값에서
   * 출발하므로, 여기를 카드 밖에 두면 첫 `aim()` 순간 조명이 훑고 들어온다 — 그게 스윕이다.
   */
  from?: RigPoint
}

export interface StageRig {
  /** 이번 프레임의 조명 목표(uv). 도약 중에는 무시된다 */
  aim(x: number, y: number): void
  /** 포인터가 조명을 잡고 있는지 — 맥동을 멈춘다 */
  hold(on: boolean): void
  /** 클릭 지점(uv)으로 조명을 던지고 세기를 부풀린다 */
  lunge(x: number, y: number): void
  /** 지금 도약 중인가(테스트·진단용) */
  readonly lunging: boolean
  /** 구독을 끊는다. 이후 값 변경은 sink로 가지 않는다 */
  stop(): void
}

const DEFAULT_FROM: RigPoint = [-0.45, 0.18]

/**
 * 장치를 만들고 uniform에 묶는다. Motion은 여기서 지연 로드한다 — 이 장치를 만드는 쪽이
 * 이미 WebGPU가 있다고 판단한 뒤이므로, 없는 브라우저는 Motion을 내려받지 않는다.
 */
export async function createStageRig({
  sink,
  center,
  strength,
  from = DEFAULT_FROM,
}: StageRigOptions): Promise<StageRig> {
  const [{ animate, motionValue, springValue, transformValue }, { vgpuEffect }] = await Promise.all([
    import('motion'),
    import('motion/vgpu'),
  ])

  const aimX = motionValue(center[0] + from[0])
  const aimY = motionValue(center[1] + from[1])
  const lx = springValue(aimX, LIGHT_SPRING)
  const ly = springValue(aimY, LIGHT_SPRING)
  const holdAim = motionValue(0)
  const holdValue = springValue(holdAim, HOLD_SPRING)
  const flash = motionValue(0)
  const intro = motionValue(0)

  // vec2는 "x y" 문자열로. Motion이 공백 구분 숫자열을 배열로 바꿔 넣는다(파일 상단 ⚠)
  const lightUniform = transformValue(() => `${lx.get()} ${ly.get()}`)
  // 점등으로 밝아지고, 클릭 순간 부풀었다 가라앉는다
  const strengthUniform = transformValue(() => strength * intro.get() * (1 + FLASH_GAIN * flash.get()))

  const detach = vgpuEffect(sink, {
    'params.light': lightUniform,
    'params.hold': holdValue,
    'params.strength': strengthUniform,
  })

  // 점등. circOut이라 초반에 확 밝아졌다 천천히 자리를 잡는다
  const introRun = animate(intro, 1, { duration: INTRO_MS / 1000, ease: 'circOut' })

  let lungeUntil = 0
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

  return {
    aim(x, y) {
      if (now() < lungeUntil) return
      aimX.set(x)
      aimY.set(y)
    },
    hold(on) {
      if (now() < lungeUntil) return
      holdAim.set(on ? 1 : 0)
    },
    lunge(x, y) {
      aimX.set(x)
      aimY.set(y)
      lungeUntil = now() + LUNGE_HOLD_MS
      animate(flash, [0, 1, 0], {
        duration: 0.62,
        times: [0, 0.16, 1],
        ease: ['circOut', 'easeOut'],
      })
    },
    get lunging() {
      return now() < lungeUntil
    },
    stop() {
      introRun.stop()
      detach()
    },
  }
}
