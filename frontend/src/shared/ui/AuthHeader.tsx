import { NavLink } from 'react-router'

import type { SupportedLanguage } from '@/shared/i18n'
import { AnimatedBrandLogo } from '@/shared/ui/AnimatedBrandLogo'
import { LanguageSwitch } from '@/shared/ui/LanguageSwitch'
import { ThemeSwitch } from '@/shared/ui/ThemeSwitch'
import { useBrandHomeReplay } from '@/shared/ui/useBrandHomeReplay'

interface Props {
  language: SupportedLanguage
  onLanguageChange: (language: SupportedLanguage) => void
  homeTo?: string
}

/** 비회원용 얇은 헤더 — 화면설계 v6 C-01의 브랜드와 언어 전환만 제공한다. */
export function AuthHeader({ language, onLanguageChange, homeTo = '/' }: Props) {
  const { replayKey, onHomeClick } = useBrandHomeReplay(homeTo)
  return (
    <header className="ui-auth-header flex h-14 items-center justify-between gap-3 border-b border-line bg-surface px-4 md:px-6">
      <NavLink
        to={homeTo}
        onClick={onHomeClick}
        aria-label="불러요 홈"
        className="fx-brand-link shrink-0"
      >
        <AnimatedBrandLogo mode="header" height={22} replayKey={replayKey} />
      </NavLink>
      <div className="flex items-center gap-2">
        <LanguageSwitch value={language} onChange={onLanguageChange} />
        <ThemeSwitch />
      </div>
    </header>
  )
}
