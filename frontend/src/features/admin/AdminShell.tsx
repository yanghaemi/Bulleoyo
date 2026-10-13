/**
 * 관리자(M 화면) 껍데기 — 헤더 + 좌측 사이드 메뉴.
 *
 * 정본 — 화면설계 v6 §5.17 헤더("공연자·관리자 화면은 여기에 **좌측 사이드 메뉴**가 더해진다")
 *        · §5.18(관객 하단 탭바는 쓰지 않는다) · §1.5 PC 최대폭 1200px · M-02 "관리자 로그인 후 기본 진입"
 *
 * 관리자 화면은 **PC 우선**이다(M-02·M-03 모바일·접근성 항목 "데스크톱 우선").
 * 그래서 기준 배치가 "좌측 사이드 240px + 우측 본문, 최대폭 1200px"이고 모바일이 그 변형이다.
 *
 * ⚠ 판단 — 모바일에서 사이드 메뉴를 **햄버거 드로어로 접지 않았다.**
 *   `StudioShell`은 메뉴가 3개+팀 전환이라 드로어가 필요했지만, 관리자 메뉴는
 *   **M-02·M-03 둘뿐**이라 360px 폭에 두 칸으로 들어간다. 두 개짜리 메뉴를 드로어에 숨기면
 *   화면 전환마다 두 번 눌러야 한다. 관리자 화면이 늘어나면(M-01 등) 그때 드로어로 접는다.
 *
 * **관객 내비게이션을 달지 않는다** — 하단 탭바(`BottomNav`)도, 전역 `AppHeader`도 쓰지 않는다.
 * 둘 다 Home·My Tickets·Balance 링크를 달고 있어서, 관리자가 코인을 지급하거나 이의제기를
 * 판정하는 도중에 관객 화면으로 새는 길이 된다.
 * ⚠ 처음에는 탭바만 빼고 `AppHeader`는 그대로 뒀는데, 그 헤더에 같은 링크가 들어 있어 의도가
 * 반쯤 무너져 있었다(2026-09-09에 화면을 열어 보고 발견). S-02·S-03(검표)과 V-03(정산 공유)도
 * 같은 이유로 전역 헤더를 쓰지 않는다 — 로그인·예매 진입이 붙어 있기 때문이다.
 * 그래서 여기서는 서비스 이름과 "관리자"만 있는 얇은 헤더를 직접 둔다.
 *
 * 이 화면들은 블록체인 용어를 노출해도 된다(§1.2 원칙 11) — 껍데기에서 감추는 장치를 두지 않는다.
 */

import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router'

import { useLocale } from '@/shared/i18n/useLocale'

import './operations-refresh.css'

/**
 * 관리자 메뉴. 화면설계 v6 §4에 있는 M 화면은 M-02·M-03 둘뿐이다(M-01은 결번).
 * "코인 운영"이라는 이름은 M-03 진입 경로 설명("관리자 메뉴 **코인 운영**")에서 그대로 가져왔다.
 */
const MENU: { to: string; ko: string; en: string; screenId: string }[] = [
  { to: '/admin/disputes', ko: '이의제기 처리', en: 'Disputes', screenId: 'M-02' },
  { to: '/admin/coin', ko: '코인 운영', en: 'Coin operations', screenId: 'M-03' },
]

function menuLinkClass({ isActive }: { isActive: boolean }): string {
  return [
    // 터치 타겟 44px(M-02·M-03 접근성)
    'flex min-h-11 flex-1 items-center justify-center rounded-control px-3 font-sans text-sm',
    'transition-colors duration-150 ease-out md:justify-start',
    isActive ? 'bg-sel-soft font-semibold text-ink' : 'text-muted hover:bg-ground-2 hover:text-ink',
  ].join(' ')
}

interface Props {
  /** 본문 제목. 모바일 상단 바와 PC 본문 머리에 같은 값이 온다 */
  title: string
  children: ReactNode
}

export function AdminShell({ title, children }: Props) {
  const { text } = useLocale()
  const navigationLabel = text('관리자 메뉴', 'Admin navigation')

  return (
    // 화면 루트에 bg-ground를 두지 않는다 — 배경 효과 레이어를 가린다(StudioShell과 같은 이유)
    <div className="admin-workbench min-h-dvh">
      {/* 관리자 전용 얇은 헤더. 관객 내비를 담지 않는다(위 ⚠ 참고).
          서비스 이름은 관리자 첫 화면(M-02)으로만 간다 */}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-[1200px] items-center gap-3 px-4 py-3 md:px-6">
          <Link to="/admin/disputes" className="font-display text-lg font-bold text-primary">
            TICKR
          </Link>
          <span className="rounded-chip bg-ground-2 px-2 py-0.5 font-sans text-[11px] font-semibold text-muted">
            {text('관리자', 'Admin')}
          </span>
        </div>
      </header>

      {/* ── 모바일: 화면 제목 + 메뉴 두 칸 ── */}
      <div className="border-b border-line bg-surface px-2 py-2 md:hidden">
        <h1 className="mb-1 truncate px-1 font-sans text-[15px] font-semibold text-ink">{title}</h1>
        <nav aria-label={navigationLabel}>
          <ul className="m-0 flex list-none gap-1 p-0">
            {MENU.map((m) => (
              <li key={m.to} className="flex flex-1">
                <NavLink to={m.to} className={menuLinkClass}>
                  {text(m.ko, m.en)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* ── PC: 최대폭 1200px, 좌 240px 사이드 + 우 본문 ── */}
      <div className="mx-auto flex w-full max-w-[1200px] gap-6 md:px-6 md:py-8">
        <aside className="hidden w-60 shrink-0 md:block">
          <h1 className="mb-3 px-3 font-sans text-lg font-bold text-ink">
            {text('관리자', 'Admin')}
          </h1>
          <nav aria-label={navigationLabel}>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {MENU.map((m) => (
                <li key={m.to}>
                  <NavLink to={m.to} className={menuLinkClass}>
                    {text(m.ko, m.en)}
                    <span className="ml-2 font-mono text-[10px] text-faint">{m.screenId}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
