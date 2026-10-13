/**
 * P-05 비율 드래그 막대 — 구간 N개 + 경계 손잡이 N-1개.
 *
 * 1단계(고정 vs 관객 선택)는 구간 2 · 손잡이 1, 2단계(팀별 고정 비율)는 팀 수만큼 구간이다.
 * 손잡이 위치는 **누적 bp**다. 구간 값은 이웃 위치의 차이라 합이 언제나 10000이다(마지막 구간 = 나머지).
 *
 * - 포인터: `pointerdown/move/up` + `setPointerCapture` 하나로 마우스·터치·펜을 같이 받는다.
 *   막대 빈 곳을 누르면 가장 가까운 손잡이가 그리로 온다. 드래그는 1%(100bp) 단위로 스냅한다.
 * - 키보드: 손잡이마다 `role="slider"`. 좌우 ±1% · Shift ±10% · Home/End(이웃 경계까지).
 * - 잠김(`disabled`): 손잡이를 그리지 않고 구간만 보이는 읽기 전용 막대다.
 *
 * 값 표시는 막대 밑 범례가 맡는다. 구간 안에 글자를 넣으면 좁은 구간·다크 테마(`sel` 토큰이 밝다)에서
 * 대비가 깨진다.
 */

import { useRef } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'

import { BP_TOTAL, bpToPercentLabel } from '@/features/studio/settlementRuleCalc'
import { handleRange, keyToBp, ratioToSnappedBp } from '@/features/studio/ratioBarMath'

export interface RatioSegment {
  key: string | number
  label: string
  /** CSS 색 — 역할 토큰 변수만(`var(--color-primary)` 등) */
  color: string
}

interface Props {
  /** 경계 손잡이 위치(누적 bp, 오름차순). 길이 = 구간 수 − 1 */
  positions: number[]
  segments: RatioSegment[]
  /** 손잡이 i의 접근성 이름 */
  handleLabel: (index: number) => string
  /** 손잡이 i의 `aria-valuetext` — 양쪽 구간을 말로 */
  handleValueText: (index: number) => string
  onChange?: (index: number, bp: number) => void
  disabled?: boolean
  /** 막대 전체 이름(잠김 상태에서 `role="img"` 이름으로 쓴다) */
  label: string
  /**
   * 막대 밑 범례(색 · 이름 · %). 2단계는 끈다 — 팀 이름이 바로 아래 입력 줄에 이미 있어
   * 같은 글자가 두 번 나오고, 대신 입력 줄 앞에 같은 색 점을 둔다
   */
  legend?: boolean
  testId?: string
}

export function RatioBar({
  positions,
  segments,
  handleLabel,
  handleValueText,
  onChange,
  disabled,
  label,
  legend = true,
  testId,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragIndex = useRef<number | null>(null)
  /** 겹친 손잡이를 잡았을 때 첫 움직임 방향으로 어느 쪽인지 정한다 */
  const dragTied = useRef<number[] | null>(null)
  const handleRefs = useRef<(HTMLDivElement | null)[]>([])

  const edges = [0, ...positions, BP_TOTAL]
  const widths = edges.slice(1).map((edge, i) => Math.max(0, edge - edges[i]))

  const commit = (index: number, bp: number) => {
    const { min, max } = handleRange(positions, index)
    const next = Math.min(max, Math.max(min, bp))
    if (next !== positions[index]) onChange?.(index, next)
  }

  const bpFromClientX = (clientX: number): number | undefined => {
    const rect = trackRef.current?.getBoundingClientRect()
    // 레이아웃이 없으면(폭 0) 계산하지 않는다 — 0으로 나누면 손잡이가 끝으로 튄다
    if (!rect || rect.width <= 0 || !Number.isFinite(clientX)) return undefined
    return ratioToSnappedBp((clientX - rect.left) / rect.width)
  }

  /**
   * 가장 가까운 손잡이. 0% 팀이 있으면 손잡이 둘이 **같은 자리**에 겹친다 — 그때는 가려는 방향으로
   * 움직일 수 있는 쪽을 고른다(왼쪽이면 앞 손잡이, 오른쪽이면 뒤 손잡이). 안 그러면 겹친 손잡이가
   * 서로를 막아 영영 떼어 낼 수 없다.
   */
  const nearestHandle = (bp: number): number => {
    const best = Math.min(...positions.map((p) => Math.abs(p - bp)))
    const tied = positions.flatMap((p, i) => (Math.abs(p - bp) === best ? [i] : []))
    return bp < positions[tied[0]] ? tied[0] : tied[tied.length - 1]
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || positions.length === 0) return
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return
    const bp = bpFromClientX(e.clientX)
    const fromHandle = (e.target as HTMLElement).closest<HTMLElement>('[data-handle-index]')
    const index = fromHandle
      ? Number(fromHandle.dataset.handleIndex)
      : bp == null
        ? null
        : nearestHandle(bp)
    if (index == null) return
    e.preventDefault()
    dragIndex.current = index
    const tied = positions.flatMap((p, i) => (p === positions[index] ? [i] : []))
    dragTied.current = fromHandle && tied.length > 1 ? tied : null
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      // jsdom·구형 브라우저 — 캡처 없이도 move 는 트랙 위에서 계속 들어온다
    }
    handleRefs.current[index]?.focus()
    // 손잡이를 잡기만 한 경우엔 값을 바꾸지 않는다(잡는 순간 스냅으로 값이 튀지 않게)
    if (!fromHandle && bp != null) commit(index, bp)
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    let index = dragIndex.current
    if (index == null) return
    const bp = bpFromClientX(e.clientX)
    if (bp == null) return
    const tied = dragTied.current
    if (tied) {
      if (bp === positions[index]) return
      index = bp < positions[index] ? tied[0] : tied[tied.length - 1]
      dragIndex.current = index
      dragTied.current = null
    }
    commit(index, bp)
  }

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (dragIndex.current == null) return
    dragIndex.current = null
    dragTied.current = null
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId)
    } catch {
      // 이미 풀린 캡처
    }
  }

  const onKeyDown = (index: number) => (e: KeyboardEvent<HTMLDivElement>) => {
    const next = keyToBp(e.key, e.shiftKey, positions[index], handleRange(positions, index))
    if (next == null) return
    e.preventDefault()
    commit(index, next)
  }

  return (
    <div data-testid={testId} className="flex flex-col gap-2">
      <div
        ref={trackRef}
        data-testid={testId ? `${testId}-track` : undefined}
        role={disabled ? 'img' : undefined}
        aria-label={disabled ? label : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={[
          'relative h-11 select-none',
          // 드래그 중 페이지가 같이 스크롤되지 않게 — 막대 높이만큼만 스크롤을 양보한다
          disabled ? '' : 'cursor-pointer touch-none',
        ].join(' ')}
      >
        {/* 구간 — 막대 가운데 높이 12px. 손잡이 터치 영역(44px)이 막대보다 크다 */}
        <div className="absolute inset-x-0 top-1/2 flex h-3 -translate-y-1/2 overflow-hidden rounded-full bg-ground-2">
          {segments.map((s, i) => (
            <div
              key={s.key}
              data-testid={testId ? `${testId}-segment-${i}` : undefined}
              className={['h-full', disabled ? 'opacity-60' : ''].join(' ')}
              style={{ width: `${(widths[i] / BP_TOTAL) * 100}%`, background: s.color }}
            />
          ))}
        </div>

        {!disabled &&
          positions.map((p, i) => {
            const range = handleRange(positions, i)
            return (
              <div
                key={i}
                ref={(el) => {
                  handleRefs.current[i] = el
                }}
                role="slider"
                tabIndex={0}
                data-handle-index={i}
                aria-label={handleLabel(i)}
                aria-valuemin={range.min / 100}
                aria-valuemax={range.max / 100}
                aria-valuenow={p / 100}
                aria-valuetext={handleValueText(i)}
                aria-orientation="horizontal"
                onKeyDown={onKeyDown(i)}
                className="group absolute top-0 flex h-11 w-11 -translate-x-1/2 cursor-grab items-center justify-center rounded-full outline-none active:cursor-grabbing"
                style={{ left: `${(p / BP_TOTAL) * 100}%` }}
              >
                <span
                  aria-hidden
                  className="block h-6 w-6 rounded-full border-2 border-surface bg-ink shadow-md transition-transform duration-150 ease-out group-focus-visible:ring-2 group-focus-visible:ring-focus group-focus-visible:ring-offset-2 group-active:scale-110"
                />
              </div>
            )
          })}
      </div>

      {/* 범례 — 색 · 이름 · % . 스크린 리더는 손잡이 valuetext 로 같은 내용을 듣는다 */}
      {legend && (
        <ul
          aria-hidden
          className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 font-sans text-[11px] text-muted"
        >
          {segments.map((s, i) => (
            <li key={s.key} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: s.color }}
              />
              <span className="text-ink">{s.label}</span>
              <span className="font-num tabular-nums">{bpToPercentLabel(widths[i])}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
