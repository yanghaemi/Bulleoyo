/**
 * 단계형 화면의 헤더.
 *
 * 화면설계 v6 §5.17이 폭에 따라 다르게 정했다 —
 *   · **모바일(<768px)**: "단계형 화면(예매·결제·온보딩)에서는 로고 대신 **뒤로가기 + 화면 타이틀**"
 *   · **PC(≥768px)**: 그런 예외가 없다. 전 화면에 **전역 헤더**(로고·검색·내비)를 둔다
 *
 * 처음엔 모바일 헤더만 만들고 `md:hidden`으로 감췄는데, 그러면 **PC에서 단계형 화면에
 * 헤더가 아예 없어져** 홈으로 돌아갈 길이 사라졌다. A-02·A-03·A-04·A-05·A-06·A-11
 * 여섯 화면이 그 상태였다. 그래서 이 컴포넌트가 두 폭을 모두 책임진다.
 *
 * 와이어프레임 `RevHeader` 이식.
 *
 * 2026-09-08 정돈 — 뒤로가기 버튼에 hover 배경과 프레스 축소를 넣었다. 단계형 화면에서
 * 유일한 탈출구인데 눌렸는지 알 수 없었다. 44×44 히트박스와 헤더 높이(48px)는 그대로다.
 */

import { useNavigate } from 'react-router'

import { AppHeader } from '@/shared/ui/AppHeader'
import { ThemeSwitch } from '@/shared/ui/ThemeSwitch'
import { useLocale } from '@/shared/i18n/useLocale'

interface Props {
  title: string
  /** 지정하면 그 경로로, 없으면 히스토리 뒤로 */
  backTo?: string
}

export function MobileHeader({ title, backTo }: Props) {
  const { text } = useLocale()
  const navigate = useNavigate()

  return (
    <>
      {/* PC에서는 전역 헤더가 나온다 — 여기서만 렌더하면 단계형 화면도 내비를 갖는다 */}
      <div className="hidden md:block">
        <AppHeader signedIn />
      </div>

      <header className="ui-mobile-header sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-line bg-surface px-2 md:hidden">
        <button
          type="button"
          aria-label={text('뒤로', 'Back')}
          onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-control text-ink transition-[scale,background-color] duration-150 ease-out hover:bg-ground-2 active:scale-95"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path
              d="M12.5 16L6.5 10l6-6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <h1 className="min-w-0 flex-1 truncate font-sans text-[15px] font-semibold text-ink">{title}</h1>
        <ThemeSwitch />
      </header>
    </>
  )
}
