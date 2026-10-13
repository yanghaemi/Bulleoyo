/** 무대 배경이 제품 의미를 갖는 공연 탐색·상세 경로만 고른다. */
export function isStageRoute(pathname: string): boolean {
  if (pathname === '/' || pathname === '/performances' || pathname === '/performances/') return true
  // performanceId는 OpenAPI의 integer 계약을 따른다. 브라우저가 유지하는 끝 슬래시만 허용한다.
  return /^\/performances\/\d+\/?$/.test(pathname)
}
