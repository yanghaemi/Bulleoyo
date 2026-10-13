/**
 * C-01 복귀 경로 규칙 — **한 곳에만 둔다.**
 *
 * 로그인이 필요한 화면에 들어오지 못한 경우 원래 경로를 저장했다가 로그인 후 복귀시킨다
 * (화면설계 v6 §2 GUEST). 저장 수단은 `?from=` 쿼리 하나다.
 *
 * 규칙 자체는 `features/member/loginNavigation`이 정본이다 — 지갑 세션이 끊긴 서명 화면도
 * 같은 경로를 만들어야 하는데 pages는 app을 import하지 않기 때문이다. 여기서는 app 쪽 두 곳
 * (진입 가드 `RequireAuth`, 강제 로그아웃 `providers`)이 쓰도록 다시 내보내기만 한다.
 */
export { loginPathFrom } from '@/features/member/loginNavigation'

/**
 * `?from=`·라우터 state로 돌아온 복귀 경로를 **한 번 검증한다.**
 *
 * 그 값은 주소창에 담겨 온 사용자 입력이다. 검증 없이 `navigate()`에 넣으면
 * `/login?from=//evil.com`이 로그인 직후 외부 사이트로 나가는 열린 리다이렉트가 된다
 * (`//host`·`https://host`는 브라우저가 절대 URL로 읽는다). 그래서 **같은 오리진의
 * 내부 경로만** 통과시키고 나머지는 홈으로 접는다.
 *
 * 온보딩(C-05 → C-02)을 거치는 동안 `?from=`은 URL에서 사라지고 라우터 state로만 남는다.
 * state도 히스토리 엔트리라 사용자가 손댈 수 있으므로 복원하는 쪽에서 이 함수를 다시 부른다.
 */
export function safeReturnPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/')) return '/'
  // 브라우저 URL 파서는 탭·개행을 제거한 뒤 경로를 해석하므로 `/%09/host`도 막는다.
  if (/[\t\n\r]/.test(raw)) return '/'
  // `//evil.com`(프로토콜 상대 URL)과 `/\evil.com`(브라우저가 `//`로 정규화한다)
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/'
  // 로그인 화면으로 되돌아가면 인증 성공 뒤에도 같은 화면에 갇힌다.
  if (raw === '/login' || raw.startsWith('/login?') || raw.startsWith('/login#')) return '/'
  return raw
}
