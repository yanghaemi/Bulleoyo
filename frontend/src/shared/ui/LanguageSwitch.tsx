/**
 * 언어 스위치 — 화면설계 v6 §5.11.
 *
 * 규격 —
 *   · `EN` / `한국어` **2값 토글**. 3값 이상으로 늘리지 않는다(지원 언어가 둘뿐이다)
 *   · 기본 언어는 `en`, 기본 표시 통화는 `USD`로 고정한다 `[팀 9/2]`.
 *     **국가별 자동 제안을 하지 않는다** — 수동 스위치만 둔다
 *   · 비로그인 값은 로컬에 저장하고, 로그인 후에는 `member.locale`을 따르며
 *     변경 시 `PATCH /api/v1/members/me`로 저장한다
 *   · 전환은 새로고침 없이 문구만 교체하고 스크롤 위치를 유지한다
 *
 * 2026-09-09 신설 — 지금까지 이 토글은 `AppHeader` 안의 비공개 함수로만 있었고
 * **누를 수 없는 장식**이었다(`aria-pressed`가 항상 EN 고정). C-01·C-02가 헤더에
 * 이 스위치를 요구해서 공용으로 꺼냈다. `AppHeader`도 이 파일을 쓴다 — 같은 역할의
 * 컴포넌트를 두 벌 두지 않는다.
 *
 * setAppLanguage가 화면 언어와 로컬 선택값을 함께 바꾼다. 제어 모드에서도 전역 언어를
 * 갱신하며, 회원 설정을 저장하는 부모는 onChange에서 서버 저장을 연결할 수 있다.
 *
 * ⚠ §5.11의 "세부 설정은 스위치의 **더 보기**에서 C-04로 보낸다"는 아직 없다.
 * 더 보기는 회원만 갈 수 있는 경로(`/me/preferences`)라 GUEST 화면(C-01·C-02)에
 * 붙일 수 없어서, 전역 헤더 작업에서 회원 조건과 함께 넣는 편이 맞다.
 */

import { setAppLanguage, type SupportedLanguage } from '@/shared/i18n'
import { useLocale } from '@/shared/i18n/useLocale'

interface Props {
  /** 제어 모드. 주지 않으면 현재 전역 언어를 표시한다. */
  value?: SupportedLanguage
  onChange?: (lang: SupportedLanguage) => void
}

const OPTIONS: { lang: SupportedLanguage; label: string }[] = [
  // §5.11의 표기 그대로다. 한국어 쪽을 `KO`로 줄이지 않는다 —
  // 한국어를 찾는 사람이 읽을 글자가 화면에 있어야 한다
  { lang: 'en', label: 'EN' },
  { lang: 'ko', label: '한국어' },
]

export function LanguageSwitch({ value, onChange }: Props) {
  const { language } = useLocale()
  const current = value ?? language

  const select = (lang: SupportedLanguage) => {
    setAppLanguage(lang)
    onChange?.(lang)
  }

  return (
    // 선택 배경만 움직이고 텍스트와 44px 터치 영역은 고정한다.
    <div
      className="ui-language-switch"
      data-language={current}
      role="group"
      aria-label={current === 'ko' ? '언어' : 'Language'}
    >
      <span className="ui-language-indicator" aria-hidden="true" />
      {OPTIONS.map((o) => {
        const on = o.lang === current
        return (
          <button
            key={o.lang}
            type="button"
            aria-pressed={on}
            onClick={() => select(o.lang)}
            className="ui-language-option"
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
