/**
 * 페이지 넘김 — 이전 · 페이지 번호 · 다음.
 *
 * 처음 쓰는 곳은 P-01 스튜디오 홈(확인할 일 · 참여 공연, 한 페이지 10개). 데이터 범위와 무관한
 * 표시 부품이라 shared/ui에 둔다 — 서버 페이지든 클라이언트 페이지든 `page`·`pageCount`만 받는다.
 *
 * 접근성 — `nav`에 이름을 붙이고(한 화면에 여러 개일 수 있다), 현재 페이지는 `aria-current="page"`.
 * 번호 버튼은 "3페이지"처럼 읽히게 `aria-label`을 준다. 이동할 수 없는 이전·다음은 숨기지 않고
 * 비활성으로 둔다 — 버튼이 나타났다 사라지면 옆 버튼 위치가 흔들린다.
 *
 * 페이지가 1개 이하면 아무것도 그리지 않는다.
 */

import { useLocale } from '@/shared/i18n/useLocale'

interface Props {
  /** 1부터 센다 */
  page: number
  pageCount: number
  onChange: (page: number) => void
  /** `nav`의 접근 가능한 이름. 예: "참여 공연 페이지" */
  label: string
  disabled?: boolean
}

/** 번호가 많으면 처음·끝·현재 ±1만 두고 사이를 …로 접는다. 7개 이하면 다 보인다 */
function pageItems(page: number, pageCount: number): (number | 'gap')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)
  const keep = new Set([1, pageCount, page - 1, page, page + 1])
  const items: (number | 'gap')[] = []
  for (let n = 1; n <= pageCount; n += 1) {
    if (keep.has(n)) items.push(n)
    else if (items[items.length - 1] !== 'gap') items.push('gap')
  }
  return items
}

const itemClass =
  'inline-flex h-11 min-w-11 items-center justify-center rounded-control px-3 font-sans text-[13px] tabular-nums transition-colors duration-150 ease-out'

export function Pagination({ page, pageCount, onChange, label, disabled = false }: Props) {
  const { text } = useLocale()
  if (pageCount <= 1) return null
  return (
    <nav aria-label={label} className="mt-4 flex flex-wrap items-center justify-center gap-1">
      <button
        type="button"
        aria-label={text('이전 페이지', 'Previous page')}
        disabled={disabled || page <= 1}
        onClick={() => onChange(page - 1)}
        className={`${itemClass} cursor-pointer text-ink hover:bg-ground-2 disabled:cursor-not-allowed disabled:text-muted disabled:hover:bg-transparent`}
      >
        ‹ {text('이전', 'Prev')}
      </button>
      {pageItems(page, pageCount).map((item, index) =>
        item === 'gap' ? (
          <span key={`gap-${index}`} aria-hidden className={`${itemClass} text-muted`}>
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            aria-label={text(`${item}페이지`, `Page ${item}`)}
            aria-current={item === page ? 'page' : undefined}
            disabled={disabled}
            onClick={() => onChange(item)}
            className={[
              itemClass,
              'cursor-pointer',
              item === page
                ? 'border border-sel bg-sel-soft font-semibold text-sel'
                : 'text-ink hover:bg-ground-2',
            ].join(' ')}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        aria-label={text('다음 페이지', 'Next page')}
        disabled={disabled || page >= pageCount}
        onClick={() => onChange(page + 1)}
        className={`${itemClass} cursor-pointer text-ink hover:bg-ground-2 disabled:cursor-not-allowed disabled:text-muted disabled:hover:bg-transparent`}
      >
        {text('다음', 'Next')} ›
      </button>
    </nav>
  )
}
