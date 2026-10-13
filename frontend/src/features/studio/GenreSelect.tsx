/**
 * P-02 팀 장르 셀렉트 — 생성 모드·관리 모드가 같은 것을 쓴다.
 *
 * 정본 — 화면설계 v8 §4 P-02 컴포넌트 표("장르(셀렉트, 필수)", C-02 칩과 같은 10종)
 *        · API v7 team-01 `genre`(필수) · team-04 `genre`(선택)
 *
 * 팀 장르는 **단일**이라 칩(다중 선택)이 아니라 셀렉트다. 코드·라벨은 선호 장르 칩과
 * 같은 `shared/i18n/genres.ts`를 본다 — 두 화면의 목록이 갈리면 매칭이 조용히 빗나간다.
 *
 * 빈 값(`''`)은 "아직 고르지 않음"이고 요청에 실리지 않는다. 마이그레이션 전 자유 문자열을
 * 가진 팀은 이 상태로 열리므로 첫 항목을 임의로 선택된 것처럼 보이게 하지 않는다.
 */

import { FormField } from '@/features/studio/FormField'
import { GENRE_OPTIONS } from '@/shared/i18n/genres'
import type { Genre } from '@/shared/i18n/genres'
import { useLocale } from '@/shared/i18n/useLocale'

interface Props {
  /** 같은 화면에 두 벌이 뜨지 않으므로 호출부가 화면별 id를 준다 */
  id: string
  value: Genre | ''
  onChange: (genre: Genre | '') => void
  error?: string
  /** 생성은 필수, 수정은 선택(team-01 Y / team-04 N) */
  required?: boolean
}

export function GenreSelect({ id, value, onChange, error, required }: Props) {
  const { language, text } = useLocale()

  return (
    <FormField
      id={id}
      label={text('장르', 'Genre')}
      required={required}
      error={error}
      hint={text(
        '맞춤 추천이 이 장르로 관객을 찾아 줍니다.',
        'We use this to recommend your shows to the right audience.',
      )}
    >
      {(a) => (
        <select
          {...a}
          value={value}
          onChange={(e) => onChange(e.target.value as Genre | '')}
          className={[
            'h-11 w-full rounded-control border bg-ground px-3 font-sans text-sm text-ink',
            error ? 'border-danger' : 'border-line hover:border-muted focus:border-primary',
          ].join(' ')}
        >
          <option value="">{text('장르 선택', 'Select a genre')}</option>
          {GENRE_OPTIONS.map((g) => (
            <option key={g.value} value={g.value}>
              {language === 'ko' ? g.ko : g.en}
            </option>
          ))}
        </select>
      )}
    </FormField>
  )
}
