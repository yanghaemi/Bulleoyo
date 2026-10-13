/**
 * 진입 가드 — 화면설계 v6 §2 "권한 없는 화면 접근".
 *
 * 로그인이 필요한 화면에 비로그인으로 들어오면 **C-01로 보내고 원래 경로를 저장해**
 * 로그인 성공 후 복귀시킨다. 복귀 경로 규칙은 강제 로그아웃 경로(`app/providers`의
 * `setUnauthenticatedHandler`)와 같은 `loginPathFrom` 하나를 공유한다.
 *
 * ── 새로고침에서 튕기지 않게 ────────────────────────────────────────
 * access token은 메모리라 새로고침하면 사라지고 refresh token만 localStorage에 남는다
 * (`shared/api/client` 토큰 저장 위치). 가드가 "access 없음 = 비로그인"으로 보면
 * 새로고침마다 로그인 화면으로 튕긴다. 그래서 refresh token이 있으면 **먼저 재발급을
 * 기다린다**(`ensureAccessToken` — single-flight를 공유한다). 그동안은 로그인으로도
 * 보내지 않고 화면도 그리지 않는다.
 *
 * ── 역할 가드는 두지 않는다 ────────────────────────────────────────
 * `RequireRole`이 여기 있었는데 지웠다. **화면이 판정할 수 있는 역할이 없다.**
 *   · 관리자 — `GET /members/me`의 `roles`는 명세상 `[AUDIENCE, PERFORMER]` 둘뿐이고
 *     (01_member.yaml:583) 관리자 여부는 JWT `adm` 클레임에만 있다. `role="ADMIN"`으로
 *     막으면 진짜 관리자도 못 들어간다(M-02·M-03이 도달 불가였다).
 *   · 리더(`PERFORMER`) — 팀을 만들어야 생기는 역할인데 그 팀을 만드는 화면이
 *     `/studio/teams/new`(P-02)다. 역할로 막으면 아무도 리더가 될 수 없다.
 *   · 공연 단위 권한(남의 공연) — 애초에 `roles`로 판정할 수 없다.
 * 전부 서버가 403 `COMMON_FORBIDDEN`·`PERFORMANCE_NOT_OWNER`로 막는다(§2). 그쪽이 정본이다.
 * 되살리려면 member_05 응답에 관리자 필드를 **명세에 먼저** 넣어야 한다.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'

import { loginPathFrom } from '@/app/loginPath'
import { ensureAccessToken, tokenStore } from '@/shared/api/client'
import { OperationOverlay } from '@/shared/ui'

type GuardState = 'restoring' | 'allowed' | 'denied'

function initialState(): GuardState {
  if (tokenStore.getAccessToken() !== null) return 'allowed'
  // refresh token만 있는 상태 = 새로고침 직후. 재발급을 기다린다.
  return tokenStore.hasSession() ? 'restoring' : 'denied'
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [state, setState] = useState<GuardState>(initialState)

  useEffect(() => {
    if (state !== 'restoring') return
    let alive = true
    void ensureAccessToken().then((ok) => {
      if (alive) setState(ok ? 'allowed' : 'denied')
    })
    return () => {
      alive = false
    }
  }, [state])

  if (state === 'restoring') {
    return (
      <OperationOverlay label="Restoring your session… / 로그인 세션을 복구하고 있어요…" />
    )
  }

  if (state === 'denied') {
    return <Navigate to={loginPathFrom(location.pathname + location.search)} replace />
  }

  return <>{children}</>
}
