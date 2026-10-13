/**
 * 선택 가능한 넓은 행 (티켓 옵션·팀 선택 등).
 *
 * 수정 요청 §14 "선택 상태 디자인 전체 수정"을 그대로 구현한다.
 *   - 파란 Stroke·Outline을 쓰지 않는다
 *   - **선택 시 테두리 두께가 변하거나 요소 크기가 달라지지 않는다** (레이아웃 흔들림 방지)
 *   - 선택은 오직 배경색으로 — 넓은 행은 #FCE8F2(연한 자홍), 텍스트는 #17171C
 *   - 라디오 점은 #D9468D 100%
 *
 * 와이어프레임 코드(`audience-revised.tsx`)는 아직 선택 시 border 색을 바꾸고 `R.sel`이
 * 분홍(#f5daef)으로 남아 있다 — 요청서가 그것을 고치라고 한 것이므로 **요청서를 따랐다.**
 *
 * 2026-09-08 정돈 — 반경 하드코딩(`rounded-[8px]`)을 토큰 `rounded-card`로 되돌리고,
 * 미선택 행에 hover 배경(`bg-ground-2`)과 프레스 축소를 넣었다. 축소는 버튼의 0.97이 아니라
 * **0.99**다 — 폭이 화면만 한 행에서 0.97은 3%가 십수 px이라 옆 행까지 흔들려 보인다.
 * 선택 표시는 규칙대로 배경색만 바꾼다(테두리 두께·크기 불변).
 */

import type { ReactNode } from 'react'

interface Props {
  selected: boolean
  disabled?: boolean
  onSelect: () => void
  /** 라디오 표시 여부 */
  radio?: boolean
  /** 라디오를 왼쪽에 둘지 오른쪽에 둘지. 와이어프레임이 화면마다 다르다(A-03 좌·A-04 우) */
  radioSide?: 'left' | 'right'
  children: ReactNode
}

export function SelectableRow({
  selected,
  disabled,
  onSelect,
  radio = true,
  radioSide = 'left',
  children,
}: Props) {
  const dot = radio ? (
    <span
      aria-hidden
      className={[
        'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 md:h-5 md:w-5',
        'transition-[background-color,border-color] duration-150 ease-out',
        selected ? 'border-sel bg-sel' : 'border-line bg-surface',
      ].join(' ')}
    >
      {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
    </span>
  ) : null

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={[
        // 테두리는 항상 같은 두께로 둔다 — 선택해도 크기가 변하지 않게
        'ui-selectable-row flex w-full items-center gap-3 rounded-card border border-line px-3.5 py-3.5 text-left',
        'md:gap-4 md:px-5 md:py-[18px]',
        'transition-[scale,background-color] duration-[160ms] ease-[cubic-bezier(.23,1,.32,1)]',
        'enabled:active:scale-[0.99]',
        selected ? 'bg-sel-soft' : 'bg-surface enabled:hover:bg-ground-2',
        disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
      ].join(' ')}
    >
      {radioSide === 'left' && dot}
      {children}
      {radioSide === 'right' && dot}
    </button>
  )
}
