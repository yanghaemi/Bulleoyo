import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import {
  IdentityStage as StrongerIdentityB,
  FeaturedShowList as ShowList,
} from '@/features/performance/IdentityStage'
import { useIdentityFont } from '@/shared/ui/useIdentityFont'
import { useLocale } from '@/shared/i18n/useLocale'
import { applyTheme, useTheme } from '@/shared/theme'
import { AnimatedBrandLogo, Poster } from '@/shared/ui'

import type { DiscoveryPrototypeShow } from './PerformanceDiscoveryPrototype'
import {
  ArrowRightIcon,
  ChevronIcon,
  ListViewIcon,
  PosterViewIcon,
  SearchIcon,
} from './EditorialLabIcons'
import './editorial-stage-lab.css'

export type LabConcept = 'editorial-a' | 'identity-b'
export type ViewMode = 'poster' | 'list'

interface StageProps {
  concept: LabConcept
  shows: DiscoveryPrototypeShow[]
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

export function EditorialStageLab({ concept, shows, viewMode, onViewModeChange }: StageProps) {
  const [activeId, setActiveId] = useState(shows[0]?.performanceId)
  const active = shows.find((show) => show.performanceId === activeId) ?? shows[0]

  useIdentityFont(concept === 'identity-b')

  if (!active) return null

  return (
    <div className="editorial-lab" data-concept={concept}>
      <LabHeader />
      <main>
        <section
          className="editorial-lab__concept"
          role="region"
          aria-label={
            concept === 'editorial-a' ? 'Editorial Stage A 시안' : 'Stronger Identity B 시안'
          }
        >
          <DiscoveryToolbar viewMode={viewMode} onViewModeChange={onViewModeChange} />
          {viewMode === 'list' ? (
            <ShowList shows={shows} active={active} onSelect={setActiveId} concept={concept} />
          ) : concept === 'editorial-a' ? (
            <EditorialStageA shows={shows} active={active} onSelect={setActiveId} />
          ) : (
            <StrongerIdentityB shows={shows} active={active} onCenterChange={setActiveId} />
          )}
        </section>
      </main>
      <LabMobileNav />
    </div>
  )
}

function LabHeader() {
  const { text } = useLocale()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [menuHeight, setMenuHeight] = useState(480)

  useEffect(() => {
    if (!open) return
    const measureSpace = () => {
      const bottom = triggerRef.current?.getBoundingClientRect().bottom ?? 0
      const reserve = window.matchMedia('(max-width: 48rem)').matches ? 84 : 24
      setMenuHeight(Math.max(48, window.innerHeight - bottom - reserve))
    }
    measureSpace()
    window.addEventListener('resize', measureSpace)
    window.addEventListener('scroll', measureSpace, true)
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') {
          setOpen(false)
          triggerRef.current?.focus()
        }
        return
      }
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('resize', measureSpace)
      window.removeEventListener('scroll', measureSpace, true)
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <header className="editorial-lab__header" aria-label="H1 검색 중심 헤더">
      <div className="editorial-lab__header-inner">
        <Link
          to="/"
          className="editorial-lab__brand"
          aria-label={text('불러요 홈', 'Bulleoyo home')}
        >
          <AnimatedBrandLogo mode="header" height={26} />
        </Link>
        <label className="editorial-lab__search">
          <SearchIcon />
          <span className="sr-only">{text('공연 검색', 'Search shows')}</span>
          <input type="search" placeholder={text('공연을 검색해 보세요', 'Search shows')} />
        </label>
        <Link to="/performances" className="editorial-lab__discover-link">
          {text('공연 찾기', 'Find shows')}
        </Link>
        <div
          className="editorial-lab__profile"
          ref={wrapRef}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
          }}
        >
          <button
            ref={triggerRef}
            type="button"
            aria-expanded={open}
            aria-controls={open ? 'editorial-profile-menu' : undefined}
            aria-label={text('프로필 메뉴 열기', 'Open profile menu')}
            onClick={() => setOpen((value) => !value)}
          >
            <span aria-hidden className="editorial-lab__avatar">
              B
            </span>
            <span>{text('마이페이지', 'My page')}</span>
            <ChevronIcon className={open ? 'is-open' : undefined} />
          </button>
          {open && <ProfilePanel maxHeight={menuHeight} />}
        </div>
      </div>
    </header>
  )
}

function ProfilePanel({ maxHeight }: { maxHeight: number }) {
  const { text } = useLocale()
  const theme = useTheme()
  return (
    <div
      id="editorial-profile-menu"
      className="editorial-lab__profile-panel"
      style={{ maxHeight }}
      aria-label={text('프로필 메뉴', 'Profile menu')}
    >
      <div className="editorial-lab__profile-summary">
        <strong>{text('미리보기 회원', 'Preview member')}</strong>
        <span>preview@example.com</span>
      </div>
      <div className="editorial-lab__menu-group">
        <Link to="/me">{text('마이페이지', 'My page')}</Link>
        <Link to="/tickets">{text('내 티켓', 'My tickets')}</Link>
        <Link to="/wallet">{text('지갑', 'Wallet')}</Link>
      </div>
      <div className="editorial-lab__menu-group">
        <Link to="/studio">{text('스튜디오', 'Studio')}</Link>
      </div>
      <div className="editorial-lab__menu-group">
        <Link to="/me/preferences">{text('설정', 'Settings')}</Link>
        <button type="button">
          <span>{text('언어', 'Language')}</span>
          <small>{text('한국어', 'English')}</small>
        </button>
        <button type="button" onClick={() => applyTheme(theme === 'dark' ? 'light' : 'dark')}>
          <span>{text('테마', 'Theme')}</span>
          <small>{theme === 'dark' ? text('다크', 'Dark') : text('라이트', 'Light')}</small>
        </button>
      </div>
      <button type="button" className="editorial-lab__logout">
        {text('로그아웃', 'Sign out')}
      </button>
    </div>
  )
}

function DiscoveryToolbar({
  viewMode,
  onViewModeChange,
}: {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}) {
  const { text } = useLocale()
  return (
    <div className="editorial-lab__discovery-head">
      <div>
        <p>{text('지금 만날 수 있는 무대', 'Shows to discover now')}</p>
        <h2>{text('추천 공연', 'Featured shows')}</h2>
      </div>
      <div className="editorial-lab__discovery-actions">
        <div
          className="editorial-lab__view-switch"
          role="group"
          aria-label={text('보기 방식', 'View mode')}
        >
          <button
            type="button"
            aria-label={text('포스터 보기', 'Poster view')}
            aria-pressed={viewMode === 'poster'}
            title={text('포스터 보기', 'Poster view')}
            onClick={() => onViewModeChange('poster')}
          >
            <PosterViewIcon />
          </button>
          <button
            type="button"
            aria-label={text('목록 보기', 'List view')}
            aria-pressed={viewMode === 'list'}
            title={text('목록 보기', 'List view')}
            onClick={() => onViewModeChange('list')}
          >
            <ListViewIcon />
          </button>
        </div>
        <Link to="/performances" className="editorial-lab__all-link">
          {text('전체 공연', 'All shows')}
          <ArrowRightIcon />
        </Link>
      </div>
      <div
        className="editorial-lab__filters"
        role="group"
        aria-label={text('날짜 필터', 'Date filter')}
      >
        <button type="button" aria-pressed="true">
          {text('전체', 'All')}
        </button>
        <button type="button" aria-pressed="false">
          {text('이번 주', 'This week')}
        </button>
        <button type="button" aria-pressed="false">
          {text('다음 주', 'Next week')}
        </button>
        <button type="button" aria-pressed="false">
          {text('10월', 'October')}
        </button>
      </div>
    </div>
  )
}

function EditorialStageA({
  shows,
  active,
  onSelect,
}: {
  shows: DiscoveryPrototypeShow[]
  active: DiscoveryPrototypeShow
  onSelect: (id: string) => void
}) {
  const { text } = useLocale()
  return (
    <div className="editorial-a-stage">
      <div className="editorial-a-stage__copy">
        <span className="editorial-lab__edition">
          {text('추천 공연', 'Featured show')} ·{' '}
          {String(shows.indexOf(active) + 1).padStart(2, '0')}
        </span>
        <h1>{active.title}</h1>
        <p className="editorial-lab__summary">
          {text(
            '서로 다른 음악이 한 무대에서 만나는 밤. 좋아하는 공연을 가까이에서 만나보세요.',
            'A night where different sounds meet on one stage.',
          )}
        </p>
        <dl className="editorial-lab__facts">
          <div>
            <dt>{text('일시', 'Date')}</dt>
            <dd>{active.dateLabel}</dd>
          </div>
          <div>
            <dt>{text('장소', 'Venue')}</dt>
            <dd>{active.venue}</dd>
          </div>
          <div>
            <dt>{text('티켓', 'Ticket')}</dt>
            <dd>{active.priceLabel}</dd>
          </div>
        </dl>
        <Link to={`/performances/${active.performanceId}`} className="editorial-lab__primary-link">
          {text('공연 자세히 보기', 'View show')}
          <ArrowRightIcon />
        </Link>
      </div>
      <div className="editorial-a-stage__visual">
        <div className="editorial-a-stage__light" aria-hidden />
        <div className="editorial-a-stage__poster">
          <Poster
            src={active.posterImageUrl}
            seed={active.performanceId}
            label={active.title}
            ratio="2/3"
          />
          <span className="editorial-a-stage__poster-index" aria-hidden>
            {String(shows.indexOf(active) + 1).padStart(2, '0')} /{' '}
            {String(shows.length).padStart(2, '0')}
          </span>
        </div>
        <div
          className="editorial-a-stage__rail"
          aria-label={text('다른 추천 공연', 'Other featured shows')}
        >
          {shows.map((show, index) => (
            <button
              key={show.performanceId}
              type="button"
              aria-label={`${index + 1}. ${show.title}`}
              aria-pressed={show.performanceId === active.performanceId}
              onClick={() => onSelect(show.performanceId)}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{show.title}</strong>
              <small>{show.venue}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function LabMobileNav() {
  const { text } = useLocale()
  const items = [
    ['/', text('공연', 'Shows'), 'shows'],
    ['/tickets', text('내 티켓', 'My tickets'), 'tickets'],
    ['/wallet', text('지갑', 'Wallet'), 'wallet'],
    ['/me', 'MY', 'profile'],
  ] as const
  return (
    <nav
      className="editorial-lab__mobile-nav"
      aria-label={text('모바일 주요 메뉴', 'Mobile navigation')}
    >
      {items.map(([to, label, icon], index) => (
        <Link key={to} to={to} aria-current={index === 0 ? 'page' : undefined}>
          <MobileNavIcon name={icon} />
          <small>{label}</small>
        </Link>
      ))}
    </nav>
  )
}

function MobileNavIcon({ name }: { name: 'shows' | 'tickets' | 'wallet' | 'profile' }) {
  const paths = {
    shows: (
      <>
        <path d="M3.5 8.5h17v10h-17z" />
        <path d="M7 8.5V5.5h10v3" />
        <path d="M8 13h8" />
      </>
    ),
    tickets: (
      <>
        <path d="M4 6.5h16v4a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z" />
        <path d="M14 9v6" />
      </>
    ),
    wallet: (
      <>
        <path d="M3.5 7.5h17v11h-17z" />
        <path d="M5.5 7.5V5.5h12" />
        <path d="M15.5 12h5v3h-5a1.5 1.5 0 0 1 0-3Z" />
      </>
    ),
    profile: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5.5 19c.8-3.2 3-5 6.5-5s5.7 1.8 6.5 5" />
      </>
    ),
  } as const
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  )
}
