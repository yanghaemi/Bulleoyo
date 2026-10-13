/**
 * C-03 마이페이지 — 라우트 `/me`. 모바일 하단 탭 4번째.
 *
 * ── API ────────────────────────────────────────────────────────────────────
 *   진입   : `GET /api/v1/members/me` (API-member-05) **한 번**으로 화면 전체를 그린다 —
 *            프로필·지갑 요약(잔액 캐시 포함)·소속 팀이 한 응답에 있다(명세 요구사항 그대로)
 *   이름   : `PATCH /api/v1/members/me` (API-member-06) `{ name }` — 1~40자
 *   로그아웃: `POST /api/v1/auth/logout` (API-member-04) → 토큰 파기 후 A-01
 *   401 `COMMON_UNAUTHORIZED`는 진입 가드(`app/RequireAuth`)가 먼저 걸러 C-01로 보낸다.
 *
 * **잔액을 위해 `GET /wallets/me`를 따로 부르지 않는다.** API-member-05가 Redis 캐시값을 이미
 * 담아 주고(§0.12), 실시간 값이 필요한 화면은 A-13이다(패널을 탭하면 그리로 간다).
 * 캐시가 비어 있으면 금액 자리가 `—`가 되고 "다시 시도"가 이 쿼리를 다시 부른다(§5.10) —
 * 패널 전체를 에러로 덮지 않는다.
 *
 * 주문 요약(`latestOrderLabel`)은 `GET /api/v1/orders/me`라 이번 범위(인증·지갑·프로필) 밖이다.
 * ponytail: 진입 패널에 요약 줄 없이 제목만 나온다 — order 연동이 붙으면 한 줄을 채운다.
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { MyPageScreen } from '@/features/member/MyPageScreen'
import type { MyPageView } from '@/features/member/MyPageScreen'
import { ProfileEditSheet } from '@/features/member/ProfileEditSheet'
import { formatApprox } from '@/features/member/localeOptions'
import type { MemberMeView } from '@/shared/api/domains/member'
import { useWeb3Auth } from '@/shared/blockchain/useWeb3Auth'
import { useLogout, useMyMember, useUpdateMyMember } from '@/shared/queries/member'
import { formatKst, toastApiError } from '@/shared/ui'
import type { SocialProvider } from '@/shared/ui'

/** `authProvider`는 `LOCAL`(P1 이메일 회원)일 수 있다 — 그때는 소셜 문구를 렌더하지 않는다 */
function socialOf(authProvider: string | null): SocialProvider | undefined {
  return authProvider === 'GOOGLE' || authProvider === 'FACEBOOK' || authProvider === 'KAKAO'
    ? authProvider
    : undefined
}

/** "English · USD · Asia/Seoul" — C-04 진입 패널의 요약 줄 */
function languageLabel(me: MemberMeView): string {
  const language = me.locale === 'ko' ? '한국어' : 'English'
  return [language, me.displayCurrency, me.timezone].filter(Boolean).join(' · ')
}

function toView(me: MemberMeView): MyPageView {
  const balance = me.wallet?.balance
  return {
    name: me.name ?? '',
    email: me.email ?? '',
    social: socialOf(me.authProvider),
    // 등록 전이면 서버가 `wallet` 자체를 내리지 않는다 → C-05로 보내는 분기가 여기서 갈린다
    walletProvider: me.wallet?.provider ?? undefined,
    walletSuspended: me.wallet?.status === 'SUSPENDED',
    balanceKrw: balance?.amount,
    // 환산은 서버가 준 `display`를 그대로 쓴다 — 클라이언트가 환율을 다시 계산하지 않는다(§5.4)
    approxLabel: balance?.display
      ? formatApprox(balance.display.currency, balance.display.approx)
      : undefined,
    updatedAtLabel: me.wallet?.cachedAt
      ? formatKst(me.wallet.cachedAt, me.timezone ?? undefined)
      : undefined,
    languageLabel: languageLabel(me),
  }
}

/** 조회 전·실패에도 화면 골격은 그린다. 금액 자리만 `—`가 된다(§5.10) */
const PLACEHOLDER: MyPageView = { name: '…', email: '', languageLabel: '' }

export function MyPage() {
  const navigate = useNavigate()
  const { adapter } = useWeb3Auth()
  const me = useMyMember()
  const [editing, setEditing] = useState(false)
  const signOutPending = useRef(false)

  useEffect(() => {
    if (me.isError) toastApiError(me.error)
  }, [me.error, me.isError])

  // 이름만 바꾸므로 훅이 `me` 캐시 하나만 무효화한다(표시 설정을 바꿀 때만 전체다)
  const rename = useUpdateMyMember()
  // 서버 호출이 실패해도 훅의 `onSettled`가 토큰·캐시를 비운다 — 두 경우 모두 홈으로 보낸다
  const leave = useLogout()

  const view = me.data ? toView(me.data) : PLACEHOLDER

  const signOut = async () => {
    if (signOutPending.current) return
    signOutPending.current = true

    try {
      await leave.mutateAsync({})
    } catch {
      // 서버 세션 폐기에 실패해도 이 브라우저의 로그아웃은 계속한다.
    }

    try {
      await adapter?.disconnect()
    } catch {
      // SDK 실패가 로컬 로그아웃과 안전한 이동을 막아서는 안 된다.
    }

    signOutPending.current = false
    navigate('/', { replace: true })
  }

  return (
    <>
      <MyPageScreen
        data={view}
        memberState={me.isPending ? 'pending' : me.isError ? 'error' : 'ready'}
        onEditName={() => setEditing(true)}
        onRetryBalance={() => void me.refetch()}
        onSignOut={() => void signOut()}
      />

      <ProfileEditSheet
        open={editing}
        initialName={view.name}
        onClose={() => setEditing(false)}
        onSave={(name) =>
          rename.mutate({ name }, { onSuccess: () => setEditing(false), onError: toastApiError })
        }
      />
    </>
  )
}

export default MyPage
