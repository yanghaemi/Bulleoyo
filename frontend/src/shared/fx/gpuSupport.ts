/**
 * WebGPU 배경 효과 공용 — 지원 판정과 CSS 토큰 색 읽기.
 *
 * `HeroBackdrop`(밝은 테마 무대 풀)과 `StageFlare`(다크 테마 볼류메트릭 빔)가 같은 판정·같은
 * 색 읽기를 쓴다. 두 파일에 복사해 두면 "안 보여요" 진단 문구가 갈라지고, 토큰 이름이 바뀔 때
 * 한쪽만 고치게 된다. 그래서 여기 한 곳에 둔다. 시각 결정은 하나도 없다 — 전부 호출부에 있다.
 */

export type Rgb = readonly [number, number, number]

export function hexToRgb(value: string): Rgb | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (!m) return null
  const h = m[1].toLowerCase()
  const full = h.length === 3 ? `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : h
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ]
}

/** 이름을 앞에서부터 훑어 처음 파싱되는 값을 쓴다. 전부 실패하면 fallback */
export function cssColor(names: readonly string[], fallback: Rgb): Rgb {
  const style = getComputedStyle(document.documentElement)
  for (const name of names) {
    const parsed = hexToRgb(style.getPropertyValue(name))
    if (parsed) return parsed
  }
  return fallback
}

export function towards(color: Rgb, target: Rgb, t: number): Rgb {
  return [
    color[0] + (target[0] - color[0]) * t,
    color[1] + (target[1] - color[1]) * t,
    color[2] + (target[2] - color[2]) * t,
  ]
}

/**
 * 캔버스를 아예 만들지 않을지 판단한다. 렌더 중 1회만 부른다.
 *
 * 점진적 향상만 한다. 팀 브라우저 하한은 Safari 16.4 · Chrome 111 · Firefox 128인데
 * WebGPU는 Safari 26+ / Firefox 미지원이다. 그래서 **켜지지 않는 게 정상 경로**다 —
 *   ① 보안 컨텍스트 아님(LAN IP http) — `navigator.gpu` 자체가 노출되지 않는다
 *   ② `navigator.gpu` 없음
 *   ③ `prefers-reduced-motion: reduce` — 커서 반응 자체가 모션이다
 * 어댑터 획득 실패(원격 데스크톱·블록리스트)는 비동기라 여기서 못 본다 — 호출부가 init 실패로 처리한다.
 *
 * 콘솔 노이즈를 만들지 않는다. "WebGPU 없음"은 하한 브라우저의 정상 상태라 error로 찍으면
 * 매번 빨간 줄이 뜬다. DEV에서만 어느 조건에 걸렸는지 한 줄 남긴다.
 */
export function webGpuEligible(label: string): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const skip = (why: string) => {
    if (import.meta.env.DEV) console.info(`[${label}] 배경을 켜지 않습니다: ${why}`)
    return false
  }
  if (!window.isSecureContext)
    return skip('보안 컨텍스트 아님 — https 또는 localhost로 열어야 WebGPU가 노출됩니다')
  if (!('gpu' in navigator))
    return skip('navigator.gpu 없음 — 브라우저가 WebGPU를 지원하지 않거나 꺼져 있습니다(chrome://gpu 확인)')
  // jsdom에는 matchMedia가 없다 — 테스트 렌더에서 죽지 않게 함수 존재부터 본다
  if (typeof window.matchMedia !== 'function') return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return skip('prefers-reduced-motion: reduce — OS 애니메이션 설정이 꺼져 있습니다')
  return true
}
