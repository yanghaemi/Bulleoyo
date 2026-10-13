/**
 * 탭.
 *
 * 와이어프레임 A-07R/A-07DR의 Upcoming·Used·Cancelled 탭 이식.
 *
 * 활성 표시는 밑줄 2px + 색이다. 와이어프레임 수정 요청 §14가 "선택 상태에 Outline을
 * 쓰지 않는다"고 한 것은 **선택 행·칩·버튼** 이야기이고, 탭의 밑줄은 그 대상이 아니다
 * (요청서가 "활성 탭"에는 `#D9468D`(신현경 확정)를 쓰라고 따로 적었다).
 *
 * 접근성 — 색만으로 구분되지 않게 활성 탭은 굵기도 바뀌고 `aria-selected`가 붙는다.
 * 모바일은 탭이 폭을 균등 분할하고(터치 타겟 44px), PC는 내용 폭이다.
 *
 * 2026-09-08 정돈 — 탭을 바꾸면 밑줄과 글자색이 툭 튀었다. 색·테두리에만 150ms 전환을
 * 걸고(위치는 움직이지 않으므로 레이아웃 흔들림이 없다), 비활성 탭에 hover 색을 줘서
 * 누를 수 있는 곳임을 알린다. 굵기는 전환하지 않는다 — 폭이 변해 옆 탭이 밀린다.
 */

interface Props<T extends string> {
  tabs: readonly { id: T; label: string }[]
  active: T
  onChange: (id: T) => void
}

export function Tabs<T extends string>({ tabs, active, onChange }: Props<T>) {
  return (
    <div role="tablist" className="ui-tabs flex border-b border-line bg-surface md:bg-transparent">
      {tabs.map((tab) => {
        const selected = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={[
              'h-11 flex-1 cursor-pointer border-b-2 font-sans text-[13px] whitespace-nowrap',
              'transition-[color,border-color] duration-150 ease-out',
              'md:flex-none md:px-6 md:text-sm',
              selected
                ? 'border-b-sel font-semibold text-sel'
                : 'border-b-transparent text-muted hover:border-b-line hover:text-ink',
            ].join(' ')}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
