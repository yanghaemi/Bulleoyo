import {
  bpStringToPercentText,
  bpToPercentText,
  handleRange,
  keyToBp,
  moveHandle,
  percentTextToBp,
  percentTextToBpString,
  positionsToShares,
  ratioToSnappedBp,
  sharesToPositions,
} from './ratioBarMath'
import { parseBp } from './settlementRuleCalc'

describe('% ↔ bp 변환', () => {
  it('% 문자열을 부동소수 없이 bp 정수로 바꾼다', () => {
    expect(percentTextToBp('60')).toBe(6000)
    expect(percentTextToBp('35.1')).toBe(3510) // 35.1 * 100 = 3509.999… 함정
    expect(percentTextToBp('33.34')).toBe(3334)
    expect(percentTextToBp('33.')).toBe(3300)
    expect(percentTextToBp(' 50 % ')).toBe(5000)
    expect(percentTextToBp('100')).toBe(10000)
    expect(percentTextToBp('100.01')).toBe(10001)
  })

  it('형식이 아니면 undefined, 폼 상태로는 parseBp 가 거절하는 값이 된다', () => {
    for (const bad of ['', 'abc', '-5', '1.234', '1000', '10001']) {
      expect(percentTextToBp(bad)).toBeUndefined()
      expect(parseBp(percentTextToBpString(bad))).toBeUndefined()
    }
    // 100% 초과는 bp 로 올리되 parseBp 가 막는다(기존 10001bp 검증과 같다)
    expect(parseBp(percentTextToBpString('100.01'))).toBeUndefined()
  })

  it('bp → % 칸 문자열은 뒤 0을 지운다', () => {
    expect(bpToPercentText(6000)).toBe('60')
    expect(bpToPercentText(3350)).toBe('33.5')
    expect(bpToPercentText(3334)).toBe('33.34')
    expect(bpToPercentText(5)).toBe('0.05')
    expect(bpStringToPercentText('!12a')).toBe('12a')
    expect(bpStringToPercentText('3334')).toBe('33.34')
  })
})

describe('경계 손잡이', () => {
  it('비율 ↔ 누적 위치가 왕복하고 마지막 팀이 나머지를 갖는다', () => {
    expect(sharesToPositions([3334, 3333, 3333])).toEqual([3334, 6667])
    expect(positionsToShares([3334, 6667])).toEqual([3334, 3333, 3333])
    expect(positionsToShares([])).toEqual([10000])
    // 합이 모자란 초안도 막대에서는 마지막 팀이 나머지를 가져 10000이 된다
    expect(positionsToShares(sharesToPositions([5000, 3000, 1000]))).toEqual([5000, 3000, 2000])
    // 누적이 넘치면 10000에서 멈춘다
    expect(sharesToPositions([8000, 5000, 1000])).toEqual([8000, 10000])
  })

  it('손잡이는 이웃을 넘지 못한다', () => {
    expect(handleRange([3000, 7000], 0)).toEqual({ min: 0, max: 7000 })
    expect(handleRange([3000, 7000], 1)).toEqual({ min: 3000, max: 10000 })
    expect(moveHandle([3000, 7000], 0, 9000)).toEqual([7000, 7000])
    expect(moveHandle([3000, 7000], 1, -5)).toEqual([3000, 3000])
  })

  it('드래그는 1% 단위로 스냅한다', () => {
    expect(ratioToSnappedBp(0.6049)).toBe(6000)
    expect(ratioToSnappedBp(0.6051)).toBe(6100)
    expect(ratioToSnappedBp(-1)).toBe(0)
    expect(ratioToSnappedBp(2)).toBe(10000)
  })

  it('키보드 — 화살표 ±1%, Shift ±10%, Home/End 는 이웃 경계', () => {
    const range = { min: 2000, max: 9000 }
    expect(keyToBp('ArrowRight', false, 6000, range)).toBe(6100)
    expect(keyToBp('ArrowLeft', false, 6000, range)).toBe(5900)
    expect(keyToBp('ArrowRight', true, 6000, range)).toBe(7000)
    expect(keyToBp('ArrowLeft', true, 2500, range)).toBe(2000)
    expect(keyToBp('Home', false, 6000, range)).toBe(2000)
    expect(keyToBp('End', false, 6000, range)).toBe(9000)
    expect(keyToBp('Tab', false, 6000, range)).toBeUndefined()
  })
})
