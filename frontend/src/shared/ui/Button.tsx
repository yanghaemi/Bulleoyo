/**
 * 버튼.
 *
 * 와이어프레임 `RBtn` 이식. 높이 44px(터치 타겟 하한, 화면설계 v6 모바일·접근성 규칙),
 * `sm`은 32px. 선택·활성 상태에 파란 Outline을 쓰지 않는다(와이어프레임 색상 규칙).
 *
 * 2026-09-08 상태 마감 — 이전엔 `transition-opacity` 하나와 hover 색뿐이라 누른 느낌이 없었다.
 * 토큰 문서 §3-5의 프레스 규칙(scale .97 · 160ms · cubic-bezier(.23,1,.32,1))을 그대로 넣고,
 * variant마다 hover/active/disabled를 토큰으로 채웠다(색값은 한 개도 새로 만들지 않았다).
 * focus 링은 `styles.css`의 전역 `:focus-visible`에 맡긴다 — 여기서 outline을 또 그리지 않는다.
 *
 * ⚠ 함정 — Tailwind v4의 `scale-*`는 `transform`이 아니라 **`scale` 속성**을 낸다.
 * `transition-[transform,...]`으로 적으면 눌림이 전환되지 않고 그냥 점프한다.
 * 전환 목록에 `scale`(슬라이드는 `translate`)을 직접 적어야 한다.
 */

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  children: ReactNode
  variant?: Variant
  /** 폭 100% */
  full?: boolean
  /** 높이 32px 소형 */
  sm?: boolean
  /** React 19는 함수 컴포넌트에 ref를 그냥 prop으로 넘긴다 — forwardRef가 필요 없다 */
  ref?: Ref<HTMLButtonElement>
}

/**
 * variant별 4상태.
 *
 * · hover  — Tailwind v4의 `hover:`는 `@media (hover:hover)` 안에서만 나온다.
 *            터치에서 눌어붙는 sticky hover가 생기지 않아 별도 게이트가 필요 없다
 * · active — 색을 hover보다 한 단계 더 눌러 "누르는 중"을 색으로도 알린다(스케일만으로 알리지 않는다)
 * · disabled — `opacity`를 쓰지 않는다. 반투명은 겹친 배경에 따라 결과가 달라져서
 *            "비활성"이 아니라 "흐린 활성"으로 보인다. 전부 토큰 색으로 못 박는다
 * · 그림자 — primary만. 색 그림자는 새 색이 아니라 토큰 알파(`shadow-primary/20`)다
 */
const VARIANT: Record<Variant, string> = {
  primary: [
    'bg-primary text-white shadow-sm shadow-primary/20',
    'hover:bg-primary-bright hover:shadow-md hover:shadow-primary/25',
    'active:bg-primary-bright active:shadow-sm',
    'disabled:bg-ground disabled:text-faint disabled:shadow-none',
  ].join(' '),
  secondary: [
    'bg-surface text-ink border border-line',
    'hover:bg-ground-2 active:bg-ground-2',
    'disabled:bg-ground disabled:text-faint',
  ].join(' '),
  ghost: [
    'bg-transparent text-primary',
    'hover:bg-primary/10 hover:text-primary-bright active:bg-primary/15',
    'disabled:bg-transparent disabled:text-faint',
  ].join(' '),
  danger: [
    'bg-surface text-danger border border-danger',
    'hover:bg-danger/10 active:bg-danger/15',
    'disabled:bg-ground disabled:border-line disabled:text-faint',
  ].join(' '),
}

export function Button({ children, variant = 'primary', full, sm, disabled, ref, ...rest }: Props) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      className={[
        // 반경은 토큰이다 — 테마가 pill(100px)로 바꿔도 여기는 그대로 둔다
        `ui-button ui-button--${variant} inline-flex items-center justify-center rounded-control font-sans font-semibold`,
        'select-none whitespace-nowrap disabled:cursor-not-allowed',
        // 프레스 감. `enabled:`를 붙여 비활성 버튼이 눌린 척하지 않게 한다
        'transition-[scale,background-color,border-color,box-shadow,color]',
        'duration-[160ms] ease-[cubic-bezier(.23,1,.32,1)]',
        'enabled:active:scale-[0.97]',
        sm ? 'h-8 px-3 text-xs' : 'h-11 px-5 text-sm',
        full ? 'w-full' : '',
        VARIANT[variant],
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  )
}
