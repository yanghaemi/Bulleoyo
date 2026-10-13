/** Shared service navigation. Account actions use the existing guarded routes and session hooks. */
import { useContext, useEffect, useId, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { LanguageSwitch } from './LanguageSwitch'
import { ThemeSwitch } from './ThemeSwitch'
import { AnimatedBrandLogo } from './AnimatedBrandLogo'
import { useBrandHomeReplay } from './useBrandHomeReplay'
import { useIdentityFont } from './useIdentityFont'
import { SearchIcon, ChevronIcon } from './EditorialIcons'
import { HeaderNotifications } from './HeaderNotifications'
import type { StudioTodoLink } from '@/shared/todos/studioTodos'
import { useLocale } from '@/shared/i18n/useLocale'
import { useLogout } from '@/shared/queries/member'
import { Web3AuthContext } from '@/shared/blockchain/web3authContextState'
import { PERFORMANCE_KEYWORD_MAX_LENGTH } from '@/shared/searchLimits'
import './identity-header.css'

interface Props {
  signedIn?: boolean
  query?: string
  onQueryChange?: (value: string) => void
  onSearchSubmit?: (value: string) => void
  /** 테스트·디자인 랩은 네트워크 없이 같은 알림 UI를 확인할 수 있다. 운영은 생략해 실데이터를 쓴다. */
  notificationItems?: StudioTodoLink[]
}

export function AppHeader({
  signedIn = false,
  query,
  onQueryChange,
  onSearchSubmit,
  notificationItems,
}: Props) {
  // Keep the face available across routes; each component's CSS selects where it is used.
  useIdentityFont(true)
  const { text } = useLocale()
  const navigate = useNavigate()
  const location = useLocation()
  const { replayKey, onHomeClick } = useBrandHomeReplay('/')
  const [localQuery, setLocalQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [open, setOpen] = useState(false)
  const [menuVisited, setMenuVisited] = useState(false)
  const [menuHeight, setMenuHeight] = useState(480)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchTrigger = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  // Non-search pages own a local query; controlled pages keep their existing filtering callbacks.
  const value = onQueryChange ? (query ?? '') : localQuery

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [searchOpen])
  useEffect(() => {
    setOpen(false)
    setSearchOpen(false)
  }, [location.pathname, location.search])
  useEffect(() => {
    if (!open) return
    const measure = () =>
      setMenuHeight(
        Math.max(
          48,
          window.innerHeight - (triggerRef.current?.getBoundingClientRect().bottom ?? 0) - 88,
        ),
      )
    measure()
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') {
          setOpen(false)
          triggerRef.current?.focus()
        }
      } else if (!profileRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open])

  const submit = () => {
    if (onSearchSubmit) onSearchSubmit(value)
    else {
      const keyword = value.trim()
      navigate(keyword ? `/performances?keyword=${encodeURIComponent(keyword)}` : '/performances')
    }
  }
  const closeSearch = () => {
    setSearchOpen(false)
    searchTrigger.current?.focus()
  }

  return (
    <header className="identity-header ui-app-header">
      <div className={`identity-header__inner ${searchOpen ? 'is-search-open' : ''}`}>
        <NavLink to="/" onClick={onHomeClick} className="identity-header__brand fx-brand-link">
          <AnimatedBrandLogo mode="header" height={26} replayKey={replayKey} />
        </NavLink>
        <form
          className="identity-header__search"
          role="search"
          aria-label={text('공연 검색', 'Search shows')}
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <input
            ref={inputRef}
            type="search"
            maxLength={PERFORMANCE_KEYWORD_MAX_LENGTH}
            enterKeyHint="search"
            value={value}
            onChange={(event) =>
              onQueryChange ? onQueryChange(event.target.value) : setLocalQuery(event.target.value)
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                submit()
              }
              if (event.key === 'Escape') closeSearch()
            }}
            aria-label={text('공연 검색', 'Search shows')}
            placeholder={text('공연을 검색해 보세요', 'Search shows')}
          />
          <button
            type="submit"
            aria-label={text('검색', 'Search')}
            className="identity-header__submit"
          >
            <SearchIcon />
          </button>
        </form>
        {searchOpen && (
          <button type="button" className="identity-header__cancel" onClick={closeSearch}>
            {text('취소', 'Cancel')}
          </button>
        )}
        <NavLink to="/performances" className="identity-header__discover">
          {text('공연 찾기', 'Find shows')}
        </NavLink>
        {signedIn && (
          <HeaderNotifications signedIn itemsOverride={notificationItems} />
        )}
        {signedIn && (
          <NavLink to="/tickets" className="identity-header__tickets">
            {text('내 티켓', 'My tickets')}
          </NavLink>
        )}
        <button
          ref={searchTrigger}
          type="button"
          className="identity-header__mobile-search"
          aria-label={text('공연 검색 열기', 'Open search')}
          onClick={() => setSearchOpen(true)}
        >
          <SearchIcon />
        </button>
        {!signedIn && (
          <NavLink className="identity-header__login" to="/login">
            {text('로그인', 'Sign in')}
          </NavLink>
        )}
        <div
          ref={profileRef}
          className="identity-header__profile"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
          }}
        >
          <button
            ref={triggerRef}
            type="button"
            aria-expanded={open}
            aria-controls={open ? menuId : undefined}
            aria-label={
              signedIn
                ? text('프로필 메뉴 열기', 'Open profile menu')
                : text('환경설정 메뉴 열기', 'Open preferences menu')
            }
            onClick={() => {
              setMenuVisited(true)
              setOpen((previous) => !previous)
            }}
          >
            <span className="identity-header__avatar" aria-hidden>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              >
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 20c0-4 3-6 7-6s7 2 7 6" />
              </svg>
            </span>
            <span className="identity-header__profile-label">
              {signedIn ? text('마이페이지', 'My page') : text('설정', 'Settings')}
            </span>
            <ChevronIcon className={open ? 'is-open' : undefined} />
          </button>
          {menuVisited && (
            <nav
              hidden={!open}
              id={menuId}
              className="identity-header__panel"
              aria-label={text('프로필 메뉴', 'Profile menu')}
              style={{ maxHeight: menuHeight }}
            >
              {signedIn && (
                <>
                  <div className="identity-header__group">
                    <NavLink to="/me">{text('마이페이지', 'My page')}</NavLink>
                    <NavLink to="/wallet">{text('지갑', 'Wallet')}</NavLink>
                  </div>
                  <div className="identity-header__group">
                    <NavLink to="/studio">{text('스튜디오', 'Studio')}</NavLink>
                  </div>
                </>
              )}
              <div className="identity-header__group">
                {signedIn && <NavLink to="/me/preferences">{text('설정', 'Settings')}</NavLink>}
                {!signedIn && (
                  <>
                    <div className="identity-header__setting">
                      <span>{text('언어', 'Language')}</span>
                      <LanguageSwitch />
                    </div>
                    <div className="identity-header__setting">
                      <span>{text('테마', 'Theme')}</span>
                      <ThemeSwitch />
                    </div>
                  </>
                )}
              </div>
              <div className="identity-header__group">
                <NavLink to="/verify/supply">
                  {text('코인 발행량 공시', 'Coin supply disclosure')}
                </NavLink>
                {signedIn && (
                  <ProfileSignOut
                    onDone={() => {
                      setOpen(false)
                      navigate('/', { replace: true })
                    }}
                  />
                )}
              </div>
            </nav>
          )}
        </div>
      </div>
    </header>
  )
}

/** Mirrors MyPage sign-out: server revoke, local token/cache clearing, then best-effort wallet disconnect. */
function ProfileSignOut({ onDone }: { onDone: () => void }) {
  const { text } = useLocale()
  const leave = useLogout()
  const wallet = useContext(Web3AuthContext)
  const busy = useRef(false)
  const [pending, setPending] = useState(false)
  const signOut = async () => {
    if (busy.current) return
    busy.current = true
    setPending(true)
    try {
      await leave.mutateAsync({})
    } catch {
      /* useLogout always clears the local session. */
    }
    try {
      await wallet?.adapter?.disconnect()
    } catch {
      /* SDK failure must not retain the app session. */
    }
    onDone()
  }
  return (
    <button type="button" disabled={pending} onClick={() => void signOut()}>
      {pending ? text('로그아웃 중…', 'Signing out…') : text('로그아웃', 'Sign out')}
    </button>
  )
}
