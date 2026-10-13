/**
 * `motion/vgpu` → vgpu uniform 결선 계약 테스트.
 *
 * StageFlare는 조명 위치·hold·strength를 `vgpuEffect`로 셰이더 uniform에 묶는다. 이 배선은
 * **문자열 키 경로**로 되어 있어 타입 검사가 잡아주지 못한다. 깨지는 방식이 조용하다 —
 * 화면은 그대로 뜨는데 조명만 움직이지 않는다. 그래서 여기서 모양을 못 박는다.
 *
 * 특히 두 가지가 위험하다.
 *   ① Motion은 키의 **마지막 글자가 x·y·z·w면 벡터 성분 접근**으로 해석한다.
 *      Params에 `maxX` 같은 필드를 추가하면 `params.maxX`가 `max[0]`로 바뀌어 버린다.
 *   ② vec2 `light`는 vgpu Effect에 getter가 없어 성분 경로가 성립하지 않는다.
 *      `"x y"` 문자열로 넘겨야 Motion이 `[x, y]` 배열로 바꿔 넣는다.
 *
 * 스프링 물리는 Motion의 몫이라 검증하지 않는다. 우리 몫은 "무엇이 fx.set에 들어가는가"다.
 */

import { motionValue } from 'motion'
import { vgpuEffect } from 'motion/vgpu'
import { describe, expect, it } from 'vitest'

/** vgpu Effect 흉내. `isVGPUSubject`는 set() 함수 + kind 문자열이면 통과시킨다 */
function fakeEffect() {
  const bags: Record<string, unknown>[] = []
  return {
    bags,
    kind: 'effect' as const,
    set(bag: Record<string, unknown>) {
      bags.push(structuredClone(bag))
    },
  }
}

/** Motion은 바뀐 값을 frame.preRender에 모았다 한 번에 흘린다. rAF 두 번이면 확실히 지난다 */
async function flush() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}

/** 여러 번의 set()을 병합해 최종 params를 만든다 */
function mergedParams(bags: Record<string, unknown>[]) {
  return bags.reduce<Record<string, unknown>>(
    (acc, bag) => Object.assign(acc, (bag.params as Record<string, unknown>) ?? {}),
    {},
  )
}

describe('motion/vgpu uniform 결선', () => {
  it('vec2는 "x y" 문자열로 넘기면 숫자 배열로 들어간다', async () => {
    const fx = fakeEffect()
    const light = motionValue('0.5 0.39')
    const detach = vgpuEffect(fx, { 'params.light': light })

    light.set('0.82 0.14')
    await flush()
    detach()

    expect(mergedParams(fx.bags).light).toEqual([0.82, 0.14])
  })

  it('스칼라 uniform은 숫자 그대로 들어간다', async () => {
    const fx = fakeEffect()
    const hold = motionValue(0)
    const strength = motionValue(0.8)
    const detach = vgpuEffect(fx, { 'params.hold': hold, 'params.strength': strength })

    hold.set(1)
    strength.set(1.24)
    await flush()
    detach()

    const params = mergedParams(fx.bags)
    expect(params.hold).toBe(1)
    expect(params.strength).toBeCloseTo(1.24)
  })

  it('StageFlare가 쓰는 Params 필드 이름은 벡터 성분으로 오해되지 않는다', () => {
    // stageFlare.wgsl의 struct Params 필드 전부. 마지막 글자가 x·y·z·w면 Motion이
    // 성분 접근으로 해석해 엉뚱한 uniform을 건드린다
    const fields = [
      'res',
      'light',
      'cardCenter',
      'cardHalf',
      'time',
      'frame',
      'strength',
      'hold',
      'colorA',
      'cornerR',
      'colorB',
    ]
    const clashing = fields.filter((f) => 'xyzw'.includes(f.slice(-1).toLowerCase()))
    expect(clashing).toEqual([])
  })

  it('detach하면 이후 변경이 셰이더로 가지 않는다', async () => {
    const fx = fakeEffect()
    const hold = motionValue(0)
    const detach = vgpuEffect(fx, { 'params.hold': hold })

    hold.set(0.5)
    await flush()
    const seen = fx.bags.length
    expect(seen).toBeGreaterThan(0)

    detach()
    hold.set(1)
    await flush()

    expect(fx.bags.length).toBe(seen)
  })
})
