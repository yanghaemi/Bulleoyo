/**
 * 텍스트 입력.
 *
 * 2026-09-08 신설 — 지금까지 입력은 화면마다 인라인 클래스로 흩어져 있었다.
 * 같은 역할인데 높이(36/44px)·반경(하드코딩 6px)·포커스 표시가 제각각이라
 * 폼이 있는 화면마다 미세하게 다르게 보였다. 규격을 여기 한 곳에 모은다.
 *
 * 규격 —
 *   · 높이 44px(터치 타겟 하한, 화면설계 v6 접근성 규칙). `sm`은 헤더 검색용 36px
 *   · 반경은 토큰 `rounded-control` — 버튼과 같은 값이라 pill 테마에서 함께 둥글어진다
 *   · 경계선 `border-line`, hover `border-muted`, 포커스 `border-primary`
 *   · 포커스 **링은 그리지 않는다.** `styles.css`의 전역 `:focus-visible`이 담당한다.
 *     여기서 또 그리면 키보드 사용자에게 링이 두 겹으로 보인다
 *   · placeholder는 `text-faint`. `prefers-contrast: more`에서 토큰이 자동으로 진해진다
 *   · `invalid`는 색만으로 알리지 않는다 — `aria-invalid`를 함께 붙이고,
 *     오류 문구는 호출부가 입력 아래에 둔다(이 컴포넌트는 문구를 만들지 않는다)
 *
 * 사용처 — `ProfileEditSheet`(이름 수정). 다른 화면의 인라인 input은 발견 즉시 이걸로 교체한다.
 */

import type { InputHTMLAttributes, Ref } from 'react'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'size'> {
  /** 폭 100%. 기본값 true — 입력은 대개 칸을 다 쓴다 */
  full?: boolean
  /** 높이 36px 소형. 헤더 검색바처럼 줄 안에 들어가는 자리 */
  sm?: boolean
  /** 검증 실패. 테두리를 danger로 바꾸고 `aria-invalid`를 붙인다 */
  invalid?: boolean
  /** React 19는 함수 컴포넌트에 ref를 그냥 prop으로 넘긴다 — forwardRef가 필요 없다 */
  ref?: Ref<HTMLInputElement>
}

export function Input({ full = true, sm, invalid, disabled, ref, ...rest }: Props) {
  return (
    <input
      ref={ref}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      className={[
        'ui-input rounded-control border bg-ground font-sans text-ink',
        'transition-colors duration-150 ease-out placeholder:text-faint',
        'disabled:cursor-not-allowed disabled:bg-ground-2 disabled:text-faint',
        sm ? 'h-9 px-3 text-[13px]' : 'h-11 px-3.5 text-sm',
        full ? 'w-full' : '',
        invalid
          ? 'border-danger'
          : 'border-line enabled:hover:border-muted enabled:focus:border-primary',
      ].join(' ')}
      {...rest}
    />
  )
}
