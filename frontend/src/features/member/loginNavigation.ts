import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router'

export interface LoginContinuationState {
  isNewMember: boolean
  from: string
}

const RETURN_PATH_BASE = 'https://tickr.invalid'

/** 외부 origin과 로그인 루프를 제거한 앱 내부 복귀 경로만 허용한다. */
export function safeLoginReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/'

  try {
    const target = new URL(value, RETURN_PATH_BASE)
    const isLoginRoute = target.pathname === '/login' || target.pathname.startsWith('/login/')
    if (target.origin !== RETURN_PATH_BASE || isLoginRoute) return '/'
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return '/'
  }
}

/** router state는 신뢰 경계이므로 다음 화면마다 다시 좁혀 읽는다. */
export function readLoginContinuationState(value: unknown): LoginContinuationState {
  const state = typeof value === 'object' && value !== null ? value : {}
  const from = 'from' in state ? state.from : undefined
  const isNewMember = 'isNewMember' in state && state.isNewMember === true
  return { isNewMember, from: safeLoginReturnPath(from) }
}

/**
 * C-01 복귀 경로 규칙 — **한 곳에만 둔다.** `safeLoginReturnPath`의 반대 방향이라 같이 산다.
 *
 * 쓰는 곳이 진입 가드(`app/RequireAuth`)·강제 로그아웃(`app/providers`)·지갑 세션 만료
 * (아래 {@link useGoToLogin})로 셋이다. 각자 문자열을 만들면 한쪽만 고쳐져 복귀가 조용히 깨진다.
 * `app/loginPath`가 이것을 그대로 다시 내보낸다 — pages는 app을 import하지 않으므로 정본은 여기다.
 */
export function loginPathFrom(pathAndSearch: string): string {
  if (!pathAndSearch || pathAndSearch === '/login') return '/login'
  return `/login?from=${encodeURIComponent(pathAndSearch)}`
}

/**
 * 지갑 세션이 없을 때 지금 화면으로 돌아오는 로그인으로 보낸다(D-77 후속).
 *
 * 마운트 게이트(`useWalletReady`)는 **복원 중**을 기다린다. 복원할 세션이 아예 없는 경우는
 * 기다려도 오지 않는다 — Web3Auth는 `storageType: 'session'`이라 탭을 새로 열면 지갑만 끊기고
 * (refresh token은 localStorage라 API 로그인은 남는다) 그 상태의 서명은 언제나 `NOT_CONNECTED`다.
 * `WALLET_NOT_READY`("잠시 뒤 다시 눌러 주세요")는 그 자리를 벗어나게 해 주지 못한다.
 * 사용자가 할 수 있는 일은 재로그인 하나뿐이라 그리로 보낸다.
 */
export function useGoToLogin(): () => void {
  const navigate = useNavigate()
  const location = useLocation()
  return useCallback(() => {
    navigate(loginPathFrom(location.pathname + location.search), { replace: true })
  }, [location.pathname, location.search, navigate])
}
