/**
 * 캐러셀 좌우 탭 이동 — 2026-09-10.
 *
 * 화살표가 PC 전용(`hidden md:flex`)이라 모바일에는 좌우 이동 수단이 드래그와 점뿐이었다.
 * 옆 카드는 `pointerEvents: 'none'`이라 눌러도 반응이 없었다.
 *
 * 여기서 거는 것 —
 *   ① 중앙 카드 위에서는 넘어가지 않는다(캡션 링크 자리를 빼앗으면 안 된다)
 *   ② 좁은 화면에서도 누를 만한 폭이 남는다
 *   ③ **키보드 가상 클릭(좌표 0,0)에 끌려가지 않는다**(MR !76 리뷰 지적)
 */

import { describe, expect, it } from 'vitest'

import { TAP_SLOP, tapDirection } from './carouselTap'

/** 컴포넌트와 같은 값 — 여기가 바뀌면 이 테스트가 알려 준다 */
const CW = 320
const CH = 480
const GAP = 210
const SIDE_SCALE = 0.78
const VISIBLE_SPAN = GAP * 2 + CW * SIDE_SCALE

/** 뷰포트 폭에서 트랙이 쓰는 배율. 컴포넌트의 `fit` 계산과 같은 형태다 */
function fitFor(viewport: number): number {
  return Math.min(1, Math.max(0.4, (viewport - 16) / VISIBLE_SPAN))
}

describe('좌우 탭 이동', () => {
  const w = 375
  const fit = fitFor(w)
  const h = CH * fit
  /** 트랙 세로 한가운데 — 진짜 탭이면 y가 여기쯤이다 */
  const midY = h / 2
  const dir = (x: number, y = midY) => tapDirection(x, y, w, h, CW, fit)

  it('왼쪽을 누르면 이전으로', () => {
    expect(dir(0)).toBe(-1)
    expect(dir(8)).toBe(-1)
  })

  it('오른쪽을 누르면 다음으로', () => {
    expect(dir(w)).toBe(1)
    expect(dir(w - 8)).toBe(1)
  })

  it('중앙 카드 위에서는 넘어가지 않는다 — 캡션 링크 자리다', () => {
    const half = (CW / 2) * fit
    expect(dir(w / 2)).toBe(0)
    expect(dir(w / 2 - half + 1)).toBe(0)
    expect(dir(w / 2 + half - 1)).toBe(0)
  })

  it('경계 바로 바깥은 넘어간다', () => {
    const half = (CW / 2) * fit
    expect(dir(w / 2 - half - 1)).toBe(-1)
    expect(dir(w / 2 + half + 1)).toBe(1)
  })

  describe('트랙 밖 좌표는 무시한다', () => {
    it('키보드 가상 클릭이 왼쪽 이동으로 새지 않는다', () => {
      // ⚠ 이게 이 테스트의 핵심이다.
      //
      // 가상 클릭은 clientX·clientY가 **뷰포트 기준 0**으로 온다. 컴포넌트는 트랙 기준으로
      // 바꿔서 넘기므로 실제로 들어오는 값은 `0 - rect.left`, `0 - rect.top`이다.
      // 모바일에서 트랙은 화면 왼쪽에 붙어 rect.left가 0이라 **x는 0 그대로**다 —
      // 정상적인 왼쪽 탭과 구별되지 않는다. 갈라 주는 것은 y다(트랙이 헤더 아래에 있다).
      const trackLeft = 0
      const trackTop = 172 // dev 실측: 헤더 + 날짜 칩 아래
      expect(tapDirection(0 - trackLeft, 0 - trackTop, w, h, CW, fit)).toBe(0)
    })

    it('위·아래로 벗어난 좌표도 무시한다', () => {
      expect(dir(8, -1)).toBe(0)
      expect(dir(8, h + 1)).toBe(0)
    })

    it('좌·우로 벗어난 좌표도 무시한다', () => {
      expect(dir(-1)).toBe(0)
      expect(dir(w + 1)).toBe(0)
    })

    it('경계값(0, h)은 트랙 안이다 — 가장자리 탭을 버리지 않는다', () => {
      expect(tapDirection(0, midY, w, h, CW, fit)).toBe(-1)
      expect(tapDirection(4, h, w, h, CW, fit)).toBe(-1)
    })
  })

  it('가장 좁은 지원 폭(320px)에서도 좌우에 44px 이상 남는다', () => {
    // 44px는 터치 타겟 최소치다(§5 접근성). 이보다 좁으면 누를 수 없는 띠가 된다
    const narrow = 320
    const f = fitFor(narrow)
    const nh = CH * f
    const zone = narrow / 2 - (CW / 2) * f
    expect(zone).toBeGreaterThanOrEqual(44)
    expect(tapDirection(zone - 1, nh / 2, narrow, nh, CW, f)).toBe(-1)
    expect(tapDirection(narrow - zone + 1, nh / 2, narrow, nh, CW, f)).toBe(1)
  })

  it('PC(배율 1)에서도 같은 규칙이다 — 화살표와 함께 동작한다', () => {
    const pc = VISIBLE_SPAN
    expect(tapDirection(10, CH / 2, pc, CH, CW, 1)).toBe(-1)
    expect(tapDirection(pc / 2, CH / 2, pc, CH, CW, 1)).toBe(0)
    expect(tapDirection(pc - 10, CH / 2, pc, CH, CW, 1)).toBe(1)
  })
})

describe('드래그·탭 임계값', () => {
  it('터치 흔들림을 견딜 만큼 여유가 있다', () => {
    // Android 터치 슬롭 8dp · iOS 약 10pt. 마우스 기준 6px로는 탭이 씹힌다(MR !76 리뷰)
    expect(TAP_SLOP).toBeGreaterThanOrEqual(8)
    // 한 칸이 GAP(210px)이라, 이보다 훨씬 작아야 진짜 드래그를 탭으로 오인하지 않는다
    expect(TAP_SLOP).toBeLessThan(GAP / 10)
  })
})
