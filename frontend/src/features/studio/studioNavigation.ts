/** 기본 돌아가기는 권한과 무관하게 열 수 있는 스튜디오다. 주최자 화면은 페이지에서 덮어쓴다. */
export function studioBackPath(pathname: string): string | null {
  if (pathname === '/studio' || !pathname.startsWith('/studio/')) return null
  return '/studio'
}

export function performanceBackPath(performanceId: number, host: boolean | undefined): string {
  return host === true ? `/studio/performances/${performanceId}/edit` : '/studio'
}
