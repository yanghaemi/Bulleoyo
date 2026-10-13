/**
 * 슬로건 포스터가 있는 공연 ID. `SloganPoster.tsx`의 `SLOGANS` 키와 같아야 한다.
 *
 * 컴포넌트 파일과 분리한 이유는 Fast Refresh 규칙 하나다 — 컴포넌트 파일이 함수도 export하면
 * HMR이 그 파일을 통째로 다시 마운트한다. `Poster`는 이 파일만 보고 분기한다.
 */
export const SLOGAN_IDS = ['7', '11', '4', '21'] as const

export type SloganId = (typeof SLOGAN_IDS)[number]

export function hasSloganPoster(seed?: string): seed is SloganId {
  return seed !== undefined && (SLOGAN_IDS as readonly string[]).includes(seed)
}
