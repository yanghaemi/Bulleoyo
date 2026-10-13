/** 사용자용 라이트·다크 전환. 현재 테마의 반대 상태를 아이콘과 접근성 이름으로 안내한다. */

import { useLocale } from '@/shared/i18n/useLocale'
import { applyTheme, useTheme } from '@/shared/theme'

export function ThemeSwitch() {
  const { text } = useLocale()
  const theme = useTheme()
  const dark = theme === 'dark'
  const label = dark
    ? text('라이트 테마 사용', 'Use light theme')
    : text('다크 테마 사용', 'Use dark theme')

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={dark}
      onClick={() => applyTheme(dark ? 'light' : 'dark')}
      className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-control text-muted transition-[scale,background-color,color] duration-150 ease-out hover:bg-ground-2 hover:text-ink active:scale-95"
    >
      {dark ? (
        <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden>
          <circle cx="10" cy="10" r="3.25" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 2.25v2M10 15.75v2M2.25 10h2M15.75 10h2M4.52 4.52l1.42 1.42M14.06 14.06l1.42 1.42M15.48 4.52l-1.42 1.42M5.94 14.06l-1.42 1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden>
          <path d="M16.5 12.55A6.6 6.6 0 0 1 7.45 3.5 6.6 6.6 0 1 0 16.5 12.55Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}
