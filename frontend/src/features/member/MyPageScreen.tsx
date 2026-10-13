/**
 * C-03 마이페이지.
 *
 * 정본 — 화면설계 v6 §4 C-03 · §5.10 잔액 패널 · §5.15 provider 배지
 *        · §5.17 헤더 · §5.18 탭바 · §5.19 액션 배치
 *
 * 레이아웃 —
 *   · 모바일(<768px): 패널을 1열로 세로 나열(프로필 → 잔액 → 주문 내역 → 언어·통화 → 지갑 → Studio).
 *     **로그아웃은 하단 고정이 아니라 목록 맨 아래 본문에 둔다** — 하단 탭바 4개가 떠 있어서
 *     겹치기 때문이다(§5.19 · §5.18). 탭바와 고정 액션은 공존하지 않는다
 *   · PC(≥768px): 프로필·잔액을 나란히, 그 아래 설정·활동 메뉴를 행으로 나열한다.
 *     모바일과 같은 DOM을 사용하며 로그아웃은 메뉴 아래 본문에 둔다.
 *
 * Studio 진입은 팀 리더 여부와 무관하게 노출한다. 팀이 없는 회원도 P-01에서 첫 팀을 만든다.
 *
 * v5에서 사라진 것 — **계좌 항목**(이 세계에는 은행이 없다), **잔액을 늘리는 버튼**.
 * 잔액 패널은 탭하면 A-13으로만 이동한다.
 *
 * 관객 화면이라 지갑 주소·tx 해시·체인 용어를 노출하지 않는다(§1.2 원칙 2).
 */

import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useLocale } from '@/shared/i18n/useLocale'
import './member-refresh.css'

import { AppHeader, BalancePanel, BottomNav, Button, ProviderBadge } from '@/shared/ui'
import type { SocialProvider, WalletProvider } from '@/shared/ui/ProviderBadge'

export interface MyPageView {
  name: string
  email: string
  /** 로그인 제공자 — 프로필 패널에 "구글로 로그인"처럼 쓴다 */
  social?: SocialProvider
  /** 지갑 미등록이면 undefined. C-05로 보낸다 */
  walletProvider?: WalletProvider
  walletSuspended?: boolean
  /** 조회 실패면 undefined (§5.10) */
  balanceKrw?: number
  approxLabel?: string
  updatedAtLabel?: string
  /** 최근 주문 1건 요약. 없으면 패널에 요약 줄을 빼고 제목만 */
  latestOrderLabel?: string
  languageLabel: string
}

interface Props {
  data: MyPageView
  memberState?: 'pending' | 'error' | 'ready'
  onEditName: () => void
  onRetryBalance: () => void
  onSignOut: () => void
}

const SOCIAL_KO: Record<SocialProvider, string> = {
  GOOGLE: '구글',
  FACEBOOK: '페이스북',
  KAKAO: '카카오',
}

/** 진입 패널 한 줄 — 제목 + (선택) 요약 + 화살표 */
function EntryPanel({
  to,
  title,
  titleKo,
  summary,
  badge,
  state,
}: {
  to: string
  title: string
  titleKo: string
  summary?: string
  badge?: ReactNode
  /** 도착 화면에 넘길 router state(예: C-05 복귀 경로) */
  state?: unknown
}) {
  const { text } = useLocale()
  return (
    <Link to={to} state={state} aria-label={text(titleKo, title)} className="member-nav-row">
      <span className="min-w-0 flex-1">
        <span className="member-nav-title">{text(titleKo, title)}</span>
        {summary && <span className="member-nav-summary">{summary}</span>}
        {badge && <span className="mt-1 block">{badge}</span>}
      </span>
      <svg
        className="member-nav-arrow"
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden
      >
        <path
          d="m8 5 5 5-5 5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  )
}

export function MyPageScreen({
  data,
  memberState = 'ready',
  onEditName,
  onRetryBalance,
  onSignOut,
}: Props) {
  const { text } = useLocale()
  const walletRegistered = data.walletProvider != null

  const profile = (
    <section className="member-identity" aria-busy={memberState === 'pending'}>
      <span aria-hidden className="member-avatar">
        {memberState === 'ready' ? data.name.slice(0, 1).toUpperCase() : '—'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="member-name">
          {memberState === 'ready' ? data.name : text('내 계정', 'Your account')}
        </p>
        {memberState === 'ready' && <p className="member-email">{data.email}</p>}
        {memberState === 'ready' && data.social && (
          <p className="m-0 font-sans text-[11px] text-faint">
            {text(
              `${SOCIAL_KO[data.social]}로 로그인`,
              `Signed in with ${data.social[0] + data.social.slice(1).toLowerCase()}`,
            )}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onEditName}
        disabled={memberState !== 'ready'}
        className="member-edit"
      >
        {text('수정', 'Edit')}
      </button>
    </section>
  )

  const providerBadge = walletRegistered ? (
    <ProviderBadge
      provider={data.walletProvider!}
      social={data.social}
      suspended={data.walletSuspended}
    />
  ) : null

  {
    /* 잔액 패널 — 탭하면 A-13으로만 간다. 패널 안에 액션 버튼은 없다(§5.10).
       제공자 배지는 C-03 컴포넌트 표대로 이 패널 안에 넣는다(§5.15).

       조회 실패일 때는 Link로 감싸지 않는다 — 감싸면 "다시 시도" 버튼이 앵커 안에 중첩돼
       (유효하지 않은 마크업이기도 하고) 누를 때 재조회와 A-13 이동이 같이 일어난다.
       실패는 예외 상태이고 재시도가 바로 옆에 있으므로 그때만 탭 이동을 뺀다. */
  }
  const panel = (
    <BalancePanel
      balanceKrw={data.balanceKrw}
      approxLabel={data.approxLabel}
      updatedAtLabel={data.updatedAtLabel}
      onRetry={onRetryBalance}
      meta={providerBadge}
    />
  )
  const balance =
    data.balanceKrw == null ? (
      panel
    ) : (
      <Link to="/wallet" className="block">
        {panel}
      </Link>
    )

  const entries = (
    <>
      <section className="member-menu-group" aria-labelledby="member-activity-title">
        <h2 id="member-activity-title">{text('이용 내역', 'Activity')}</h2>
        <div className="member-menu-rows">
          <EntryPanel
            to="/orders"
            title="Orders"
            titleKo="주문 내역"
            summary={data.latestOrderLabel}
          />
        </div>
      </section>
      <section className="member-menu-group" aria-labelledby="member-settings-title">
        <h2 id="member-settings-title">{text('계정 설정', 'Account settings')}</h2>
        <div className="member-menu-rows">
          {/* C-04의 정본 라우트는 `/me/preferences`다(router.tsx · 화면설계 v6 §4 C-04).
          `/settings/locale`로 적혀 있어서 누르면 404가 났다 — C-04를 구현하면서 드러났다.
          C-04가 플레이스홀더였던 동안에는 어디로 보내든 같은 자리로 떨어져 티가 나지 않았다. */}
          <EntryPanel
            to="/me/preferences"
            title="Language & currency"
            titleKo="언어·통화"
            summary={data.languageLabel}
          />
          {/* 조회가 끝나기 전에는 undefined를 "미등록"으로 해석해 C-05로 유도하지 않는다. */}
          {memberState === 'ready' ? (
            <EntryPanel
              to="/onboarding/wallet"
              title={walletRegistered ? 'Wallet ready' : 'Set up your wallet'}
              titleKo={walletRegistered ? '지갑 준비됨' : '지갑 등록이 필요해요'}
              // 등록됨이면 C-05는 보기 전용 "내 지갑"이다. 주소는 C-05에서만 축약해 보여준다
              // (이 화면은 §1.2 원칙 2로 주소를 싣지 않는다). 돌아올 곳을 넘겨 버튼이 여기로 온다
              summary={
                walletRegistered
                  ? text('주소·등록 정보 보기', 'View address and details')
                  : undefined
              }
              state={walletRegistered ? { from: '/me' } : undefined}
              badge={providerBadge}
            />
          ) : (
            <div role="status" className="member-menu-status font-sans text-[13px] text-muted">
              {memberState === 'pending'
                ? text('회원 정보를 확인하는 중이에요', 'Checking member information')
                : text('회원 정보를 확인하지 못했어요', 'Member information unavailable')}
            </div>
          )}
        </div>
      </section>
      <section className="member-menu-group" aria-labelledby="member-studio-title">
        <h2 id="member-studio-title">{text('공연 운영', 'Show management')}</h2>
        <div className="member-menu-rows">
          <EntryPanel
            to="/studio"
            title="Studio"
            titleKo="팀·공연 관리"
            summary={text(
              '팀과 공연, 정산을 한곳에서 관리해요',
              'Manage your teams, shows and settlements',
            )}
          />
        </div>
      </section>
    </>
  )

  const signOut = (
    <Button variant="secondary" full onClick={onSignOut}>
      {text('로그아웃', 'Sign out')}
    </Button>
  )

  return (
    <div className="min-h-dvh pb-16 md:pb-0">
      <AppHeader signedIn />

      <main className="member-workspace">
        <div className="member-heading">
          <h1 className="member-title">{text('마이페이지', 'My page')}</h1>
        </div>
        <div className="member-identity-grid">
          {profile}
          <div className="member-balance">
            {memberState === 'pending' ? (
              <div role="status" className="member-surface text-sm text-muted">
                {text('회원 정보를 확인하는 중이에요', 'Checking member information')}
              </div>
            ) : (
              balance
            )}
          </div>
        </div>
        <nav className="member-navigation" aria-label={text('계정 메뉴', 'Account navigation')}>
          {entries}
        </nav>
        <div className="member-signout">{signOut}</div>
      </main>

      <BottomNav />
    </div>
  )
}
