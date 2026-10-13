/**
 * 세그먼트 필터 — 선택 표시가 **미끄러져 옮겨 가는** 탭.
 *
 * A-13 거래 이력 필터. 전에는 선택된 버튼만 배경색이 켜지고 나머지는 꺼지는 방식이라, 탭을
 * 옮길 때 "꺼짐 → 켜짐" 두 사건으로 보였다. 표시 하나가 자리를 옮기면 사건이 하나가 되고
 * 어디에서 어디로 갔는지가 남는다("필터 탭을 세그먼트로" — 강병구 2026-09-08).
 *
 * ── 왜 JS로 재나 ──────────────────────────────────────────────────
 * 라벨 길이가 제각각이라(`All / 전체` ~ `Payout / 정산 수령`) CSS만으로는 표시의 폭·위치를 알 수 없다.
 * 그래서 활성 버튼의 상자를 재서 인디케이터에 px로 넣는다. 재는 시점은 세 가지 —
 * 값이 바뀔 때, 컨테이너 크기가 바뀔 때(ResizeObserver), 항목이 바뀔 때(리더 필터 2개 추가).
 * 애니메이션은 `styles/fx-balance.css`가 갖는다. 그 파일이 없으면 인디케이터가 순간이동할 뿐 동작은 같다.
 *
 * ── 방향 ─────────────────────────────────────────────────────────
 * `row` = 모바일 가로 스크롤 한 줄, `col` = PC 좌측 세로 목록. 두 곳이 같은 컴포넌트를 쓰되
 * 인스턴스는 따로다(각자 자기 상자를 잰다).
 *
 * 접근성 — 버튼에 `aria-pressed`를 그대로 유지한다. 인디케이터는 `aria-hidden` 장식이고,
 * 선택 상태는 여전히 텍스트 굵기와 `aria-pressed`가 알린다(색·위치에만 기대지 않는다).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocale } from '@/shared/i18n/useLocale'

export interface SegmentItem<T extends string> {
  key: T
  en: string
  ko: string
}

interface Props<T extends string> {
  items: SegmentItem<T>[]
  value: T
  onChange: (key: T) => void
  orientation: 'row' | 'col'
  ariaLabel: string
}

interface Box {
  offset: number
  size: number
}

export function SegmentedFilter<T extends string>({
  items,
  value,
  onChange,
  orientation,
  ariaLabel,
}: Props<T>) {
  const { text, language } = useLocale()
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef(new Map<T, HTMLButtonElement>())
  const [box, setBox] = useState<Box | null>(null)
  const row = orientation === 'row'

  const measure = useCallback(() => {
    const el = btnRefs.current.get(value)
    if (!el) return
    setBox(
      row
        ? { offset: el.offsetLeft, size: el.offsetWidth }
        : { offset: el.offsetTop, size: el.offsetHeight },
    )
  }, [value, row])

  // 레이아웃 직후에 재야 첫 그림에서 인디케이터가 0에서 날아오지 않는다
  useLayoutEffect(measure, [measure, items.length, language])

  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

  return (
    <div
      ref={wrapRef}
      role="group"
      aria-label={ariaLabel}
      data-fx="segments"
      data-scroll-region={row ? 'horizontal' : undefined}
      className={[
        'relative',
        row
          ? 'flex max-w-full min-w-0 gap-1 overflow-x-auto overscroll-x-contain'
          : 'flex w-[200px] shrink-0 flex-col gap-0.5',
      ].join(' ')}
    >
      {/* 미끄러지는 표시. 버튼보다 먼저 그려 글자 뒤에 깔린다 */}
      {box && (
        <span
          aria-hidden
          className="fx-segment-indicator absolute rounded-control bg-sel-soft"
          style={
            row
              ? {
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: box.size,
                  transform: `translateX(${box.offset}px)`,
                }
              : {
                  left: 0,
                  right: 0,
                  top: 0,
                  height: box.size,
                  transform: `translateY(${box.offset}px)`,
                }
          }
        />
      )}

      {items.map((f) => (
        <button
          key={f.key}
          ref={(el) => {
            if (el) btnRefs.current.set(f.key, el)
            else btnRefs.current.delete(f.key)
          }}
          type="button"
          aria-pressed={value === f.key}
          onClick={() => onChange(f.key)}
          className={[
            'relative min-h-11 shrink-0 cursor-pointer rounded-control px-4 py-2.5 font-sans text-xs',
            'transition-colors duration-150 ease-out md:text-[13px]',
            row ? '' : 'w-full text-left',
            value === f.key ? 'font-semibold text-ink' : 'text-muted hover:text-ink',
          ].join(' ')}
        >
          {text(f.ko, f.en)}
        </button>
      ))}
    </div>
  )
}
