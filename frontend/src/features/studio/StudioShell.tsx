/**
 * 스튜디오(공연자 P 화면) 껍데기.
 *
 * 정본 — 화면설계 v6 §4 P-01 **레이아웃** · §5.17 헤더 · §5.18 탭바 · §1.5 레이아웃 원칙
 *
 * P 화면은 **PC 우선**이다(§1.5 ②). 그래서 기준 배치가 "좌측 사이드 메뉴 240px 고정 +
 * 우측 본문, 최대폭 1200px"이고 모바일이 그 변형이다.
 *   · PC(≥md): `AppHeader` 아래에 240px 사이드 + 본문 2열. §5.17이 "공연자·관리자 화면은
 *     헤더에 좌측 사이드 메뉴가 더해진다"고 적은 그 배치다
 *   · 모바일(<md): 사이드 메뉴를 **햄버거 드로어**로 접는다(P-01 레이아웃)
 *
 * **관객 하단 탭바(`BottomNav`)를 쓰지 않는다.** §5.18의 탭 4개는 홈·내 티켓·잔액·마이,
 * 즉 관객의 것이다. 공연자 화면에 그것을 달면 스튜디오에서 관객 화면으로 새는 길이 생긴다.
 * 그래서 이 껍데기에는 탭바가 없고, 모바일 하단은 §5.19의 주 액션 하나(FixedBottom)만 쓴다.
 *
 * 드로어 전환은 `AppHeader`의 햄버거 시트와 **같은 방식·같은 값**이다 —
 * 마운트 후 한 프레임 뒤 클래스 토글, 220ms. 키프레임을 쓰지 않는 이유도 같다.
 * 방향만 다르다(시트는 아래→위, 드로어는 왼쪽→오른쪽) — 접힌 것이 사이드 메뉴라
 * 원래 있던 자리에서 나와야 "그것이 펴진 것"으로 읽힌다.
 *
 * 접근성 — 오버레이 클릭·Esc로 닫히고, 열려 있는 동안 Tab이 드로어 안을 돈다.
 * 드로어는 화면 전체를 덮으므로 포커스가 뒤로 새면 보이지 않는 링크에 커서가 놓인다.
 */

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router'

import { AppHeader } from '@/shared/ui'
import { useLocale } from '@/shared/i18n/useLocale'
import { studioBackPath } from './studioNavigation'

import './studio-refresh.css'

/** 드로어 등장·퇴장 시간(ms). 아래 전환 클래스의 duration과 같은 값이어야 한다 */
const DRAWER_MS = 220

export interface StudioTeamRef {
  teamId: number
  teamName: string
}

interface MenuItem {
  to: string
  en: string
  ko: string
  /** 완전 일치로만 활성 처리할지(NavLink `end`) */
  end?: boolean
}

/**
 * 사이드 메뉴 — 대시보드 / 팀 / 공연 셋.
 *
 * 아직 만들지 않은 화면은 링크만 걸어 두고 플레이스홀더로 간다(라우트는 `app/router.tsx`에
 * 이미 전부 잡혀 있다).
 *
 * ⚠ "공연" 항목의 대상이 명세에 없다. P 화면 중 공연을 **목록으로** 보는 전용 화면이 없고
 * (P-01 본문의 "참여 공연 목록"이 그 역할이다), 라우트도 공연별 관리 화면뿐이다.
 * 그래서 P-03 생성(`/studio/performances/new`)으로 보낸다 — 목록은 대시보드에 있으므로
 * 메뉴에서 남는 행동은 "새로 만들기"뿐이다. 공연 목록 화면이 신설되면 여기를 바꾼다.
 */
function menuItems(teamId?: number): MenuItem[] {
  return [
    { to: '/studio', en: 'Dashboard', ko: '대시보드', end: true },
    // 팀이 없으면 갈 팀 관리 화면도 없다 → P-02 생성 모드로 보낸다
    {
      to: teamId == null ? '/studio/teams/new' : `/studio/teams/${teamId}`,
      en: teamId == null ? 'Create team' : 'Manage team',
      ko: teamId == null ? '팀 만들기' : '팀 관리',
    },
    { to: '/studio/performances/new', en: 'Create show', ko: '새 공연 만들기' },
  ]
}

/** 메뉴 링크 한 줄. 사이드와 드로어가 같은 생김새를 쓴다 — 두 폭이 같은 메뉴임이 읽혀야 한다 */
function menuLinkClass({ isActive }: { isActive: boolean }): string {
  return [
    // 터치 타겟 44px(P-01 모바일·접근성)
    'flex min-h-12 items-center gap-3 rounded-control px-4 font-sans text-sm',
    'transition-colors duration-150 ease-out',
    isActive
      ? 'bg-primary/15 font-semibold text-primary-bright ring-1 ring-primary/20'
      : 'text-muted hover:bg-ground-2 hover:text-ink',
  ].join(' ')
}

function MenuList({ teamId, onNavigate }: { teamId?: number; onNavigate?: () => void }) {
  const { text } = useLocale()
  return (
    <nav aria-label={text('스튜디오 메뉴', 'Studio menu')}>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {menuItems(teamId).map((m, index) => (
          <li key={m.to}>
            <NavLink to={m.to} end={m.end} onClick={onNavigate} className={menuLinkClass}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                {index === 0 ? (
                  <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
                ) : index === 1 ? (
                  <>
                    <circle cx="9" cy="8" r="3" />
                    <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5" />
                  </>
                ) : (
                  <>
                    <rect x="3" y="5" width="18" height="16" rx="3" />
                    <path d="M7 3v4M17 3v4M3 11h18M12 14v4M10 16h4" />
                  </>
                )}
              </svg>
              {text(m.ko, m.en)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * 팀 전환 — **팀이 둘 이상일 때만** 렌더한다(P-01 영역 구성 "팀 전환(다중 팀 리더 시)").
 * 하나뿐이면 고를 것이 없어 자리만 차지한다.
 */
function TeamSwitch({
  teams,
  activeTeamId,
  onTeamChange,
}: {
  teams: StudioTeamRef[]
  activeTeamId?: number
  onTeamChange?: (teamId: number) => void
}) {
  const { text } = useLocale()
  if (teams.length < 2) return null
  return (
    <label className="flex items-center gap-2">
      <span className="font-sans text-xs text-muted">{text('팀', 'Team')}</span>
      <select
        value={activeTeamId ?? teams[0].teamId}
        onChange={(e) => onTeamChange?.(Number(e.target.value))}
        // 모바일 터치 타겟 44px(P-01 접근성). PC에서는 헤더 줄 높이에 맞춰 36px로 줄인다
        className="h-11 rounded-control border border-line bg-surface px-2 font-sans text-[13px] text-ink md:h-9"
      >
        {teams.map((t) => (
          <option key={t.teamId} value={t.teamId}>
            {t.teamName}
          </option>
        ))}
      </select>
    </label>
  )
}

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <path
        d="M3 6h14M3 10h14M3 14h14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M12.5 16 6.5 10l6-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface Props {
  /** 사이드 메뉴 "팀" 링크 대상 + 팀 전환 목록. 비어 있으면 팀 링크는 P-02 생성 모드로 간다 */
  teams?: StudioTeamRef[]
  activeTeamId?: number
  onTeamChange?: (teamId: number) => void
  /**
   * 모바일 상단 바에 찍을 제목. 넘기지 않으면 "Studio / 스튜디오"다.
   *
   * 공연별 화면(P-03~P-08)은 "지금 보는 것이 어느 공연인가"가 제목 자리에 와야 한다 —
   * P-07 영역 구성이 "헤더: 공연명"이다. 모바일은 세로 공간이 귀해 본문에 제목을 또 찍지 않고
   * 이 바 하나로 해결한다(PC는 사이드에 스튜디오 제목이 이미 있어 본문이 공연명을 갖는다).
   * 기본값이 있어 P-01 등 기존 사용처는 그대로다.
   */
  title?: string
  /** 디자인 랩처럼 실제 스튜디오 URL 밖에서 렌더할 때 돌아갈 경로를 명시한다. */
  backTo?: string | null
  children: ReactNode
}

export function StudioShell({
  teams = [],
  activeTeamId,
  onTeamChange,
  title,
  backTo: backToOverride,
  children,
}: Props) {
  const { text } = useLocale()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  /** DOM에 있는가 — 닫은 뒤에도 전환이 끝날 때까지 남는다 */
  const [mounted, setMounted] = useState(false)
  /** 전환의 끝 상태인가 — 마운트 다음 프레임에 켠다 */
  const [shown, setShown] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const teamId = activeTeamId ?? teams[0]?.teamId
  const backTo = backToOverride === undefined ? studioBackPath(pathname) : backToOverride
  const backLabel = backTo?.endsWith('/edit')
    ? text('공연 관리로 돌아가기', 'Back to show management')
    : text('스튜디오로 돌아가기', 'Back to Studio')

  useEffect(() => {
    if (open) {
      setMounted(true)
      // 마운트와 같은 프레임에 켜면 시작 상태가 그려지지 않아 전환이 생략된다(AppHeader와 같은 이유)
      const id = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(id)
    }
    setShown(false)
    const timer = setTimeout(() => setMounted(false), DRAWER_MS)
    return () => clearTimeout(timer)
  }, [open])

  // 열리면 드로어 안 첫 요소로 포커스를 옮긴다. `mounted`도 의존성에 넣는 이유는
  // 여는 첫 렌더에 패널이 아직 DOM에 없어 ref가 비어 있기 때문이다(ConfirmDialog와 같다)
  useEffect(() => {
    if (!open || !mounted) return
    panelRef.current?.querySelector<HTMLElement>('a,button,select')?.focus()
  }, [open, mounted])

  // Esc로 닫고, Tab은 드로어 안을 돌게 가둔다.
  // 드로어가 화면을 덮는 동안 뒤쪽 본문으로 포커스가 새면 보이지 않는 링크에 커서가 놓인다
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusable = panel.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),select')
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    // 화면 루트에 bg-ground를 두지 않는다 — 배경 효과 레이어(fx-backdrop)를 가린다
    <div className="studio-shell min-h-dvh">
      <AppHeader signedIn />

      {/* ── 모바일: 햄버거 + 스튜디오 타이틀 + 팀 전환 한 줄 ── */}
      <div className="studio-shell-mobilebar flex h-12 items-center gap-1 border-b border-line bg-surface px-2 md:hidden">
        {backTo && (
          <Link
            to={backTo}
            aria-label={backLabel}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink transition-[scale,background-color] duration-150 ease-out hover:bg-ground-2 active:scale-95"
          >
            <BackIcon />
          </Link>
        )}
        <button
          type="button"
          aria-label={text('스튜디오 메뉴 열기', 'Open studio menu')}
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-control text-ink transition-[scale,background-color] duration-150 ease-out hover:bg-ground-2 active:scale-95"
        >
          <HamburgerIcon />
        </button>
        {/* 공연명이 길면 잘라 낸다 — 줄바꿈되면 바 높이(48px)가 흔들려 아래 본문이 밀린다 */}
        <h1 className="min-w-0 truncate font-sans text-[15px] font-semibold text-ink">
          {title ?? text('스튜디오', 'Studio')}
        </h1>
        <div className="flex-1" />
        <TeamSwitch teams={teams} activeTeamId={activeTeamId} onTeamChange={onTeamChange} />
      </div>

      {/* ── PC: 최대폭 1200px, 좌 240px 사이드 + 우 본문 ── */}
      <div className="studio-shell-layout mx-auto flex w-full max-w-[1440px] gap-8 md:px-6 md:py-10">
        <aside className="studio-shell-sidebar hidden w-[232px] shrink-0 self-start md:sticky md:top-24 md:block">
          <div className="studio-shell-brand">
            <h1 className="font-sans text-xl font-bold tracking-tight text-ink">
              {text('스튜디오', 'Studio')}
            </h1>
          </div>
          <TeamSwitchRow teams={teams} activeTeamId={activeTeamId} onTeamChange={onTeamChange} />
          <MenuList teamId={teamId} />
        </aside>

        <main className="studio-shell-main min-w-0 flex-1 md:pt-1">
          {backTo && (
            <Link
              to={backTo}
              aria-label={backLabel}
              className="mb-5 hidden min-h-11 w-fit items-center gap-2 rounded-control px-3 font-sans text-sm font-semibold text-muted transition-[background-color,color,translate] duration-150 ease-out hover:-translate-x-0.5 hover:bg-ground-2 hover:text-ink md:inline-flex"
            >
              <BackIcon />
              <span>{backLabel}</span>
            </Link>
          )}
          {children}
        </main>
      </div>

      {/* ── 모바일 드로어 — 접힌 사이드 메뉴 ── */}
      {mounted && (
        <div className={`fixed inset-0 z-50 md:hidden ${shown ? '' : 'pointer-events-none'}`}>
          <button
            type="button"
            aria-label={text('스튜디오 메뉴 닫기', 'Close studio menu')}
            onClick={() => setOpen(false)}
            className={[
              'absolute inset-0 h-full w-full bg-ink/40',
              'transition-opacity duration-[220ms] ease-out',
              shown ? 'opacity-100' : 'opacity-0',
            ].join(' ')}
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={text('스튜디오 메뉴', 'Studio menu')}
            className={[
              'absolute inset-y-0 left-0 w-60 max-w-[80%] border-r border-line bg-surface px-3 py-3',
              'transition-[translate] duration-[220ms] ease-out',
              shown ? 'translate-x-0' : '-translate-x-full',
            ].join(' ')}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="px-1 font-sans text-sm font-bold text-ink">
                {text('스튜디오', 'Studio')}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={text('스튜디오 메뉴 닫기', 'Close studio menu')}
                className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-control text-muted transition-colors duration-150 ease-out hover:bg-ground-2 hover:text-ink"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                  <path
                    d="M4 4l10 10M14 4L4 14"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <MenuList teamId={teamId} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  )
}

/** PC 사이드 상단의 팀 전환 자리. 팀이 하나면 `TeamSwitch`가 아무것도 그리지 않아 여백도 안 남는다 */
function TeamSwitchRow({
  teams,
  activeTeamId,
  onTeamChange,
}: {
  teams: StudioTeamRef[]
  activeTeamId?: number
  onTeamChange?: (teamId: number) => void
}) {
  if (teams.length < 2) return null
  return (
    <div className="mb-3 px-3">
      <TeamSwitch teams={teams} activeTeamId={activeTeamId} onTeamChange={onTeamChange} />
    </div>
  )
}
