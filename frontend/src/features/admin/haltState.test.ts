/**
 * 중단 판정 — 2026-09-10 팀 지적.
 *
 * 핵심은 **불변식 ③만 깨진 경우**다. `supplyMatched`는 true로 남고 `releaseHalted`만 켜진다.
 * 이 케이스가 없으면 `supplyMatched` 하나로 판단하는 코드가 테스트를 그대로 통과한다 —
 * 실제로 그래서 못 잡았다.
 */

import { describe, expect, it } from 'vitest'

import { haltStateOf } from './haltState'
import type { HaltInput } from './haltState'

/** 불변식 ①②③④. `broken`에 적은 번호만 어긋난 것으로 만든다 */
function invariants(broken: number[]): HaltInput['invariants'] {
  return [1, 2, 3, 4].map((no) => ({ no, matched: !broken.includes(no) }))
}

const OK: HaltInput = {
  supplyMatched: true,
  mintHalted: false,
  releaseHalted: false,
  invariants: invariants([]),
}

/** 총량 대사(①·④)가 깨짐 — 서버가 둘 다 막는다 */
const SUPPLY_BROKEN: HaltInput = {
  supplyMatched: false,
  mintHalted: true,
  releaseHalted: true,
  invariants: invariants([1, 4]),
}

/** ③(정산 재계산)만 깨짐 — release만 막히고 supplyMatched는 **true로 남는다** */
const RELEASE_ONLY: HaltInput = {
  supplyMatched: true,
  mintHalted: false,
  releaseHalted: true,
  invariants: invariants([3]),
}

describe('중단 판정', () => {
  it('정상이면 아무것도 막지 않고 배너 문구도 만들지 않는다', () => {
    const s = haltStateOf(OK)
    expect(s.anyHalted).toBe(false)
    expect(s.mismatch).toBe(false)
    expect(s.brokenNos).toEqual([])
    // 배너를 안 띄우므로 제목이 남아 있으면 안 된다 — 호출부가 잘못 갖다 쓸 수 있다
    expect(s.bannerTitle).toBe('')
    expect(s.ackNote).toBe('')
  })

  it('총량 대사가 깨지면 둘 다 중단이라고 말한다', () => {
    const s = haltStateOf(SUPPLY_BROKEN)
    expect(s.anyHalted).toBe(true)
    expect(s.mismatch).toBe(true)
    expect(s.brokenNos).toEqual([1, 4])
    expect(s.bannerTitle).toContain('코인 지급(mint)과 정산금 지급(release)')
  })

  describe('③만 깨진 경우 — supplyMatched는 true다', () => {
    const s = haltStateOf(RELEASE_ONLY)

    it('supplyMatched가 true여도 배너를 띄운다', () => {
      // `!supplyMatched`로 걸면 여기서 false가 되어 배너가 아예 안 뜬다
      expect(RELEASE_ONLY.supplyMatched).toBe(true)
      expect(s.anyHalted).toBe(true)
    })

    it('배너가 release만 중단이라고 말한다 — mint는 이름을 부르지 않는다', () => {
      expect(s.bannerTitle).toContain('정산금 지급(release)')
      expect(s.bannerTitle).not.toContain('코인 지급')
      expect(s.ackNote).toContain('정산금 지급')
      expect(s.ackNote).not.toContain('코인 지급')
    })

    it('mint는 막지 않는다 — 멀쩡한 지급을 포기하게 하면 안 된다', () => {
      expect(s.mintHalted).toBe(false)
      expect(s.releaseHalted).toBe(true)
    })

    it('요약 줄이 "일치"라고 쓰지 않는다 — 바로 아래 목록과 모순되면 안 된다', () => {
      expect(s.mismatch).toBe(true)
      expect(s.brokenNos).toEqual([3])
    })
  })

  it('mint만 막힌 경우도 mint만 이름을 부른다', () => {
    const s = haltStateOf({ ...RELEASE_ONLY, mintHalted: true, releaseHalted: false })
    expect(s.bannerTitle).toContain('코인 지급(mint)')
    expect(s.bannerTitle).not.toContain('정산금 지급')
  })

  it('중단은 없는데 불변식이 어긋난 경우 — 불일치라고는 하되 배너는 띄우지 않는다', () => {
    // 서버가 아직 막지 않은 상태. 화면이 스스로 "중단"이라고 단정하지 않는다
    const s = haltStateOf({ ...OK, invariants: invariants([2]) })
    expect(s.mismatch).toBe(true)
    expect(s.brokenNos).toEqual([2])
    expect(s.anyHalted).toBe(false)
    expect(s.bannerTitle).toBe('')
  })
})

describe('대사 결과 문구 — 번호가 없어도 문장이 잘리지 않는다', () => {
  it('일치면 "일치"', () => {
    expect(haltStateOf(OK).mismatchText).toBe('일치')
  })

  it('번호가 있으면 함께 적는다', () => {
    expect(haltStateOf(SUPPLY_BROKEN).mismatchText).toBe('불일치 — 깨진 불변식 1·4')
    expect(haltStateOf(RELEASE_ONLY).mismatchText).toBe('불일치 — 깨진 불변식 3')
  })

  it('supplyMatched만 false이고 어긋난 항목이 없으면 문장을 자르지 않는다', () => {
    // 서버가 총량 대사만 실패로 표시하고 항목을 못 채운 경우(MR !75 리뷰 지적).
    // 예전에는 "불일치 — 깨진 불변식 "으로 뒤가 잘려 렌더됐다
    const s = haltStateOf({ ...OK, supplyMatched: false })
    expect(s.mismatch).toBe(true)
    expect(s.brokenNos).toEqual([])
    expect(s.mismatchText).toBe('불일치 — 깨진 불변식을 특정하지 못했습니다')
    expect(s.mismatchText).not.toMatch(/불변식 $/)
  })

  it('invariants가 아예 비어 있어도 마찬가지다', () => {
    const s = haltStateOf({ ...OK, supplyMatched: false, invariants: [] })
    expect(s.mismatchText).toBe('불일치 — 깨진 불변식을 특정하지 못했습니다')
  })
})
