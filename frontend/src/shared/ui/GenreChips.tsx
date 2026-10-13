/**
 * 선호 장르 칩 — C-02 회원가입(보조)·C-04 언어·통화 설정이 **같은 것**을 쓴다.
 *
 * 정본 — 화면설계 v8 §4 C-02("좋아하는 장르 칩 … 최대 3개, 선택 0개 허용",
 *        "3개 초과 선택 시 나머지 칩 비활성") · C-04 "선호 장르 선택"
 *        · API v7 API-member-06 `preferredGenres`(0~3, 중복 불가)
 *
 * 규칙 —
 *   · **0개도 유효한 값**이다. 건너뛰기는 빈 배열 전송이지 "미입력"이 아니다
 *   · 상한(3)에 닿으면 **고르지 않은 칩만** 비활성이다 — 이미 고른 칩은 눌러서 뺄 수 있어야 한다
 *   · 선택 표시는 **배경색으로만** 한다(디자인 토큰 v2 §3-2 · A-01 날짜 필터 칩과 같은 패턴).
 *     테두리 두께가 바뀌면 칩이 한 줄에서 밀린다
 *
 * 모바일은 가로 스크롤 한 줄, PC는 줄바꿈 배치다(C-02 레이아웃).
 */

import { GENRE_OPTIONS, MAX_PREFERRED_GENRES } from '@/shared/i18n/genres'
import type { Genre } from '@/shared/i18n/genres'
import { useLocale } from '@/shared/i18n/useLocale'

interface Props {
  /** 지금 고른 코드들. 빈 배열은 "아직 고르지 않음"이 아니라 **고르지 않기로 함**이다 */
  value: readonly Genre[]
  onChange: (next: Genre[]) => void
  /** 라벨을 화면마다 다르게 쓸 일이 없어 기본값을 둔다 */
  legend?: string
  disabled?: boolean
}

export function GenreChips({ value, onChange, legend, disabled }: Props) {
  const { language, text } = useLocale()
  const full = value.length >= MAX_PREFERRED_GENRES

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-1.5 p-0 font-sans text-[11px] font-semibold text-muted md:text-xs">
        {legend ?? text('좋아하는 장르', 'Genres you like')}
      </legend>
      <div
        data-scroll-region="horizontal"
        className="flex max-w-full min-w-0 gap-2 overflow-x-auto overscroll-x-contain pb-1 md:flex-wrap md:overflow-visible md:pb-0"
      >
        {GENRE_OPTIONS.map((g) => {
          const selected = value.includes(g.value)
          // 상한에 닿아도 이미 고른 칩은 살려 둔다 — 아니면 바꾸려면 전부 지워야 한다
          const blocked = disabled || (full && !selected)
          return (
            <button
              key={g.value}
              type="button"
              aria-pressed={selected}
              disabled={blocked}
              onClick={() =>
                onChange(
                  selected ? value.filter((v) => v !== g.value) : [...value, g.value],
                )
              }
              className={[
                'shrink-0 rounded-chip border border-line px-3.5 py-2 font-sans text-xs font-semibold md:text-[13px]',
                selected ? 'bg-sel-soft text-ink' : 'bg-surface text-muted',
                blocked ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
              ].join(' ')}
            >
              {language === 'ko' ? g.ko : g.en}
            </button>
          )
        })}
      </div>
      <p className="mt-1.5 mb-0 font-sans text-[11px] text-muted">
        {text(
          `최대 ${MAX_PREFERRED_GENRES}개까지 고를 수 있어요. 고르지 않아도 괜찮아요.`,
          `Pick up to ${MAX_PREFERRED_GENRES}. You can skip this.`,
        )}
      </p>
    </fieldset>
  )
}
