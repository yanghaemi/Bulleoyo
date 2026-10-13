/**
 * 검색 가능한 선택 목록 — C-02·C-04의 국가·시간대 선택.
 *
 * 정본 — 화면설계 v6 C-02 레이아웃("국가·시간대 선택은 **전체 화면 검색 목록**으로 띄운다")
 *        · C-02·C-04 모바일·접근성("검색 가능한 목록으로 제공한다", 터치 타겟 44px)
 *        · §5.19(모바일 확인은 하단에서, PC는 중앙 다이얼로그)
 *
 * 왜 `<select>`가 아닌가 — 시간대는 항목이 400개가 넘고 국가도 수십 개다.
 * 네이티브 셀렉트에는 검색이 없어서 사람이 목록을 눈으로 훑어야 한다.
 * 항목이 적은 언어·표시 통화는 그대로 `<select>`를 쓴다 — 여는 비용이 더 크다.
 *
 * 표시 형태 — **모바일은 전체 화면**, PC는 중앙 다이얼로그(최대 폭 420px · 최대 높이 70vh).
 *
 * 선택 표시는 토큰 문서 §3-2를 따른다 — 테두리 두께를 바꾸지 않고 `bg-sel-soft` + `text-sel`.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocale } from '@/shared/i18n/useLocale'
import { useMemberDialog } from './useMemberDialog'
import './member-refresh.css'

export interface PickerOption {
  value: string
  label: string
  /** 코드·UTC 오프셋처럼 라벨 옆에 붙는 보조 정보. 검색 대상에 함께 들어간다 */
  sub?: string
}

interface PickerProps {
  open: boolean
  /** 현재 언어로 번역된 다이얼로그 제목. */
  title: string
  options: PickerOption[]
  value?: string
  placeholder: string
  onSelect: (value: string) => void
  onClose: () => void
}

/** 목록을 한 번에 다 그리지 않는다 — 시간대 400여 개를 전부 DOM에 올리면 여는 순간 버벅인다 */
const VISIBLE = 60

export function SearchPicker({
  open,
  title,
  options,
  value,
  placeholder,
  onSelect,
  onClose,
}: PickerProps) {
  const { text } = useLocale()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useMemberDialog(open, onClose, inputRef)

  useEffect(() => {
    if (open) {
      setQuery('')
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        (o.sub ?? '').toLowerCase().includes(q),
    )
  }, [options, query])

  if (!open) return null

  const shown = filtered.slice(0, VISIBLE)

  return (
    <div className="fixed inset-0 z-50 flex md:items-center md:justify-center">
      <button
        type="button"
        aria-label={text('닫기', 'Close')}
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 hidden h-full w-full bg-black/65 backdrop-blur-sm md:block"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="member-dialog relative flex h-full w-full flex-col md:h-auto md:max-h-[70dvh] md:w-[480px] md:rounded-card"
      >
        <div className="flex items-center gap-2 border-b border-line px-2 py-2 md:px-4">
          <button
            type="button"
            aria-label={text('닫기', 'Close')}
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-control text-ink transition-[scale,background-color] duration-150 ease-out hover:bg-ground-2 active:scale-95"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <h2 className="min-w-0 flex-1 truncate font-sans text-[15px] font-semibold text-ink">
            {title}
          </h2>
        </div>

        <div className="border-b border-line px-4 py-3">
          {/* 검색 입력은 `shared/ui`의 Input을 쓰지 않는다 — type=search의 지우기 버튼과
              전체 화면 목록 안의 여백 규칙이 폼 입력과 달라서다 */}
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="h-11 w-full rounded-control border border-line bg-ground px-3.5 font-sans text-sm text-ink transition-colors duration-150 ease-out placeholder:text-faint hover:border-muted focus:border-primary"
          />
        </div>

        <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
          {shown.length === 0 && (
            <li role="status" className="px-4 py-14 text-center font-sans text-[13px] text-muted">
              {text('결과가 없어요', 'No matches.')}
            </li>
          )}
          {shown.map((o) => {
            const on = o.value === value
            return (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => onSelect(o.value)}
                  aria-current={on || undefined}
                  className={[
                    'flex min-h-11 w-full items-center gap-3 border-b border-line px-4 py-3 text-left',
                    'transition-colors duration-150 ease-out',
                    on ? 'bg-sel-soft' : 'hover:bg-ground-2',
                  ].join(' ')}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={[
                        'block break-words font-sans text-[13px] font-medium',
                        on ? 'text-sel' : 'text-ink',
                      ].join(' ')}
                    >
                      {o.label}
                    </span>
                  </span>
                  {o.sub && (
                    <span className="max-w-[35%] break-words font-mono text-[11px] text-muted">{o.sub}</span>
                  )}
                </button>
              </li>
            )
          })}
          {filtered.length > shown.length && (
            <li className="px-4 py-3 text-center font-sans text-[11px] text-muted">
              {text(
                `${filtered.length - shown.length}개가 더 있어요 — 검색어를 좁혀 보세요`,
                `${filtered.length - shown.length} more — keep typing to narrow it down.`,
              )}
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}

interface TriggerProps {
  /** `FormField`가 내려준 `id`·`aria-*`를 그대로 받는다 */
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
  /** 선택된 표시 문자열. 비어 있으면 placeholder를 회색으로 보여준다 */
  text?: string
  placeholder: string
  onOpen: () => void
}

/** 목록을 여는 버튼. 높이·반경·테두리를 `Input`과 맞춰 폼 안에서 같은 줄로 읽히게 한다 */
export function PickerButton({ text, placeholder, onOpen, ...aria }: TriggerProps) {
  return (
    <button
      {...aria}
      type="button"
      aria-haspopup="dialog"
      onClick={onOpen}
      className={[
        'flex h-11 w-full items-center justify-between gap-2 rounded-control border bg-ground px-3.5 text-left',
        'font-sans text-sm transition-colors duration-150 ease-out',
        aria['aria-invalid'] ? 'border-danger' : 'border-line hover:border-muted',
      ].join(' ')}
    >
      <span className={['min-w-0 truncate', text ? 'text-ink' : 'text-faint'].join(' ')}>
        {text || placeholder}
      </span>
      <span aria-hidden className="shrink-0 text-muted">
        ▾
      </span>
    </button>
  )
}
