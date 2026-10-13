/**
 * 무대 조명 장치가 실제로 그리는 곡선을 잰다.
 *
 * 왜 이 테스트가 있나 — 이 움직임은 WebGPU가 있는 브라우저에서만 눈에 보인다. CI·헤드리스·
 * Firefox·Safari 하한에는 어댑터가 없어 `StageFlare`가 통째로 부팅하지 않는다. 즉 **눈으로
 * 확인할 수 없는 환경이 정상 경로**다. 그래서 셰이더에 들어가는 값 자체를 여기서 잰다.
 * WGSL은 이 변경에서 손대지 않았으므로, 값이 맞으면 그림도 맞다.
 *
 * 재는 것 셋 —
 *   ① 점등: 밝기가 0에서 시작해 기준 밝기로 올라간다
 *   ② 스윕: 조명이 기준점 밖에서 출발해 목표로 다가간다
 *   ③ 도약: 클릭하면 목표를 **지나쳤다** 돌아오고(스프링 관성) 밝기가 기준 위로 솟는다
 * ③의 오버슈트가 이 작업의 핵심이다. 예전 지수 추종에서는 원리적으로 나올 수 없었다.
 */

import { describe, expect, it } from 'vitest'

import { createStageRig } from './stageRig'
import type { UniformSink } from './stageRig'

const STRENGTH = 0.8
const CENTER = [0.5, 0.39] as const

interface Frame {
  light?: number[]
  hold?: number
  strength?: number
}

/** 셰이더 대신 값을 받아 적는다. `isVGPUSubject`는 set() + kind 문자열이면 통과시킨다 */
function recorder() {
  const frames: Frame[] = []
  const sink: UniformSink & { kind: string } = {
    kind: 'effect',
    set(bag) {
      const params = (bag.params ?? {}) as Frame
      frames.push({ ...params })
    },
  }
  return { sink, frames }
}

/** Motion은 바뀐 값을 frame.preRender에 모았다 흘린다. rAF를 n번 돌려 시간을 보낸다 */
async function run(ticks: number) {
  for (let i = 0; i < ticks; i++) await new Promise(requestAnimationFrame)
}

/** 기록에서 한 축의 값만 순서대로 */
function series<K extends keyof Frame>(frames: Frame[], key: K): NonNullable<Frame[K]>[] {
  return frames.map((f) => f[key]).filter((v): v is NonNullable<Frame[K]> => v !== undefined)
}

describe('무대 조명 장치', () => {
  it('점등 — 밝기가 0에서 출발해 기준 밝기로 올라간다', async () => {
    const { sink, frames } = recorder()
    const rig = await createStageRig({ sink, center: CENTER, strength: STRENGTH })
    rig.aim(CENTER[0], CENTER[1])

    await run(6)
    const early = series(frames, 'strength')
    rig.stop()

    expect(early.length).toBeGreaterThan(0)
    // 첫 값은 꺼진 상태에 가깝다
    expect(early[0]).toBeLessThan(STRENGTH * 0.6)
    // 그리고 올라간다
    expect(early.at(-1)!).toBeGreaterThan(early[0])
    // 점등 중에는 기준 밝기를 넘지 않는다(넘는 건 클릭 때뿐이다)
    expect(Math.max(...early)).toBeLessThanOrEqual(STRENGTH + 1e-9)
  })

  it('스윕 — 조명이 기준점 밖에서 출발해 목표로 다가간다', async () => {
    const { sink, frames } = recorder()
    const from = [-0.45, 0.18] as const
    const rig = await createStageRig({ sink, center: CENTER, strength: STRENGTH, from })

    rig.aim(CENTER[0], CENTER[1])
    await run(8)
    rig.stop()

    const lights = series(frames, 'light')
    expect(lights.length).toBeGreaterThan(1)
    // 시작점은 기준점에서 왼쪽으로 크게 벗어나 있다
    expect(lights[0][0]).toBeLessThan(CENTER[0] - 0.2)
    // 그리고 목표 쪽으로 좁혀 온다
    const firstGap = Math.abs(lights[0][0] - CENTER[0])
    const lastGap = Math.abs(lights.at(-1)![0] - CENTER[0])
    expect(lastGap).toBeLessThan(firstGap)
  })

  it('도약 — 클릭하면 목표를 지나쳤다 돌아온다(스프링 관성)', async () => {
    const { sink, frames } = recorder()
    const rig = await createStageRig({ sink, center: CENTER, strength: STRENGTH, from: [0, 0] })

    // 조명이 기준점에 자리 잡을 때까지
    rig.aim(CENTER[0], CENTER[1])
    await run(4)
    frames.length = 0

    const targetX = 0.9
    rig.lunge(targetX, CENTER[1])
    await run(60)
    rig.stop()

    const xs = series(frames, 'light').map((l) => l[0])
    expect(xs.length).toBeGreaterThan(10)

    // 목표를 넘어섰다 = 관성이 있다. 지수 추종에서는 원리적으로 나오지 않는 값이다.
    // 다만 "넘었다"만으로는 부족하다 — ζ가 1에 가까우면 수식상 넘기긴 해도 오버슈트가
    // 0.1% 수준이라 눈에 보이지 않는다(실제로 첫 튜닝이 그랬다). 이동 거리의 2%를 건다.
    const travel = targetX - CENTER[0]
    const overshoot = (Math.max(...xs) - targetX) / travel
    expect(overshoot).toBeGreaterThan(0.02)
    // 그렇다고 튀어서도 안 된다 — 15%를 넘으면 조명이 아니라 고무공이다
    expect(overshoot).toBeLessThan(0.15)
    // 그리고 되돌아와 목표 근처에 앉는다
    expect(Math.abs(xs.at(-1)! - targetX)).toBeLessThan(0.05)
  })

  it('도약 — 밝기가 기준 위로 솟았다 가라앉는다', async () => {
    const { sink, frames } = recorder()
    const rig = await createStageRig({ sink, center: CENTER, strength: STRENGTH, from: [0, 0] })

    // 점등이 끝나 기준 밝기에 도달할 때까지 기다린다
    rig.aim(CENTER[0], CENTER[1])
    await run(80)
    frames.length = 0

    rig.lunge(0.7, 0.3)
    await run(60)
    rig.stop()

    const s = series(frames, 'strength')
    expect(Math.max(...s)).toBeGreaterThan(STRENGTH * 1.2)
    // 끝나면 기준으로 돌아온다
    expect(s.at(-1)!).toBeCloseTo(STRENGTH, 1)
  })

  it('도약 직후에는 커서 추종이 조명을 다시 끌어가지 못한다', async () => {
    const { sink } = recorder()
    const rig = await createStageRig({ sink, center: CENTER, strength: STRENGTH, from: [0, 0] })

    rig.lunge(0.9, 0.1)
    expect(rig.lunging).toBe(true)
    // 잠금 동안의 aim은 무시된다
    rig.aim(CENTER[0], CENTER[1])
    expect(rig.lunging).toBe(true)
    rig.stop()
  })

  it('stop 뒤에는 값이 셰이더로 가지 않는다', async () => {
    const { sink, frames } = recorder()
    const rig = await createStageRig({ sink, center: CENTER, strength: STRENGTH, from: [0, 0] })

    rig.aim(0.6, 0.4)
    await run(4)
    expect(frames.length).toBeGreaterThan(0)

    rig.stop()
    const seen = frames.length
    rig.aim(0.2, 0.2)
    await run(4)

    expect(frames.length).toBe(seen)
  })
})
