/**
 * member 쿼리·뮤테이션 훅 (API v6 §1).
 *
 * ─────────────────────────── 이 파일이 하는 일 ───────────────────────────
 * · `GET /members/me`를 `qk.member.me()` 키 하나로 모은다. C-03·C-04·헤더·가드가 같은 키를
 *   보므로 설정을 바꾸면 화면 전체가 함께 갱신된다.
 * · 로그인·로그아웃 시 **토큰 저장/파기**와 **캐시 정리**를 한곳에서 한다.
 *
 * ─────────────────────── 이 파일이 하지 않는 일 ───────────────────────
 * · **토큰 재발급(member_03)** — `shared/api/client`가 401 `AUTH_TOKEN_EXPIRED`에서
 *   single-flight로 부른다. 훅을 만들면 동시 401에서 refresh가 두 번 나가고, 서버는 회전된
 *   토큰의 재사용을 탈취로 보아 그 회원의 refresh token을 **전량 폐기**한다(API-member-03).
 * · **강제 로그아웃 후 이동** — `app/providers`가 `setUnauthenticatedHandler`로 붙여 둔다.
 *   여기서 또 navigate하면 로그인 화면으로 두 번 튄다.
 * · **Web3Auth 세션 종료** — 서버가 하지 않는다(§1 API-member-04). 호출부가 서버 응답의
 *   `clientAction`이나 성공 여부와 무관하게 WalletAdapter 정리를 시도한다. shared/api는 지갑 SDK를
 *   부르지 않는다.
 */

import { useCallback } from 'react'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { tokenStore } from '@/shared/api/client'
import {
  affectsDisplayFormat,
  getMyMember,
  loginWithEmail,
  loginWithWeb3Auth,
  logout,
  signup,
  updateMyMember,
  type EmailLoginRequest,
  type MemberSessionView,
  type MemberUpdateRequest,
  type SignupRequest,
  type Web3AuthLoginRequest,
} from '@/shared/api/domains/member'
import { qk } from '@/shared/queries/keys'

export type {
  MemberMeView,
  MemberSessionView,
  MemberUpdateResultView,
  MemberLogoutResultView,
  MemberSignupResultView,
} from '@/shared/api/domains/member'
export { CLIENT_ACTION_CLEAR_WEB3AUTH_SESSION, MemberCode } from '@/shared/api/domains/member'

/* ============================== 조회 ============================== */

/** 프리페치·`useQueries`용 정의. 화면은 아래 `useMyMember`를 쓴다. */
export function myMemberQuery() {
  return queryOptions({
    queryKey: qk.member.me(),
    queryFn: ({ signal }) => getMyMember({ signal }),
  })
}

/**
 * API-member-05 · 내 정보.
 *
 * 기본 `enabled`는 **세션 유무**다 — 비로그인 상태에서 부르면 401만 왕복한다.
 * access token은 메모리에 있어 새로고침 직후 비지만, refresh token이 남아 있으면
 * `hasSession()`이 true이고 첫 요청의 401에서 클라이언트가 알아서 재발급한다.
 */
export function useMyMember(options: { enabled?: boolean; staleTime?: number } = {}) {
  const { enabled, staleTime } = options
  return useQuery({
    ...myMemberQuery(),
    enabled: enabled ?? tokenStore.hasSession(),
    // staleTime을 `undefined`로 명시하면 QueryClient 기본값(30초)을 덮어써 0이 된다. 있을 때만 넘긴다
    ...(staleTime !== undefined && { staleTime }),
  })
}

/* ============================== 로그인 ============================== */

/**
 * 로그인 성공 후 처리.
 *
 * 캐시를 통째로 비우는 이유 — 직전 세션의 지갑·티켓·주문이 남아 있으면 새 회원 화면에
 * 남의 데이터가 한 프레임 그려진다. `qk.member.me()`만 지워서는 막을 수 없다.
 */
function acceptSession(session: MemberSessionView, clearCache: () => void): void {
  tokenStore.setTokens({
    accessToken: session.tokens.accessToken,
    refreshToken: session.tokens.refreshToken,
  })
  clearCache()
}

/**
 * API-member-01 · Web3Auth 로그인/가입 (C-01).
 *
 * 호출부는 Web3Auth SDK로 받은 `idToken`·주소를 넘긴다. **개인키·니모닉·MPC 샤드는 넘기지
 * 않는다** — 서버가 받지도 저장하지도 않고, 그런 필드가 오면 400으로 거절한다.
 * 성공 응답의 `walletLinkRequired`가 true면 홈 대신 C-05(`/onboarding/wallet`)로 보낸다.
 */
export function useWeb3AuthLogin() {
  const queryClient = useQueryClient()
  return useCallback(
    async (body: Web3AuthLoginRequest) => {
      // idToken을 TanStack mutation variables에 넣으면 mutation cache 수명 동안 남는다. 공개 인증
      // 요청은 즉시 실행하고 세션 응답만 반환해 앱 캐시에 OAuth 토큰을 보관하지 않는다.
      const session = await loginWithWeb3Auth(body)
      acceptSession(session, () => queryClient.clear())
      return session
    },
    [queryClient],
  )
}

/** API-member-02 · 자체 이메일 로그인(P1 보조). 실패 코드는 `AUTH_INVALID_CREDENTIALS` 하나다. */
export function useEmailLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: EmailLoginRequest) => loginWithEmail(body),
    onSuccess: (session) => acceptSession(session, () => queryClient.clear()),
  })
}

/**
 * API-member-08 · 자체 이메일 가입(P1 보조).
 * **가입만으로 로그인되지 않는다** — 토큰이 없으므로 호출부가 이어서 `useEmailLogin`을 부른다.
 */
export function useSignup() {
  return useMutation({
    mutationFn: (body: SignupRequest) => signup(body),
  })
}

/**
 * API-member-04 · 로그아웃 (C-03).
 *
 * 서버 호출이 실패해도 **로컬 세션은 반드시 끊는다**(`onSettled`). access token은 만료까지
 * 유효하므로 클라이언트가 즉시 파기하는 것이 명세의 요구다.
 * 캐시는 전부 비운다 — `qk.member.me()`뿐 아니라 지갑·티켓·주문이 모두 회원 소유 데이터다.
 */
export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: { allDevices?: boolean } = {}) => logout(variables),
    onSettled: () => {
      tokenStore.clear()
      // `qk.member.me()`를 포함한 전 캐시를 비운다(me()만 지우면 지갑·티켓이 남는다)
      queryClient.clear()
    },
  })
}

/* ============================== 수정 ============================== */

/**
 * API-member-06 · 내 정보 수정 (C-03·C-04).
 *
 * `locale`·`displayCurrency`·`timezone`이 바뀌면 **이후 모든 응답의 `display`·`msg`·시간
 * 오프셋**이 달라진다(§0.5·§0.6). 캐시에 남은 다른 도메인의 금액이 옛 통화로 그려지므로
 * 그때는 전체 무효화가 맞다. 이름·연락처만 바꿨으면 `me()` 하나로 끝낸다.
 *
 * 비밀번호 변경(LOCAL 회원)은 성공 시 서버가 refresh token을 전부 폐기한다 — 다음 401에서
 * 재발급이 실패하고 클라이언트가 로그인 화면으로 보낸다. 여기서 따로 로그아웃시키지 않는다.
 */
export function useUpdateMyMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: MemberUpdateRequest) => updateMyMember(body),
    onSuccess: (_result, body) => {
      if (affectsDisplayFormat(body)) {
        void queryClient.invalidateQueries()
        return
      }
      void queryClient.invalidateQueries({ queryKey: qk.member.me() })
      // [v8] 선호 장르만 바꿔도 홈 추천(A-01 섹션 ④)의 근거가 달라진다. 여기서 깨우지
      // 않으면 방금 장르를 고친 사람이 홈에서 예전 추천을 다시 본다(API-recommendation-01)
      if (body?.preferredGenres !== undefined)
        void queryClient.invalidateQueries({ queryKey: qk.recommendation.performances() })
    },
  })
}
