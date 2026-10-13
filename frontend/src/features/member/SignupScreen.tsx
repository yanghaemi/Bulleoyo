/**
 * C-02 회원가입(보조) — 소셜 최초 로그인 회원의 확인 폼.
 *
 * 정본 — 화면설계 v6 §4 C-02 · §5.11 언어 스위치 · §5.18 탭바 · §5.19 액션 배치
 *        · API 명세 v6 member_06(`PATCH /api/v1/members/me`) · wallet_01(`GET /api/v1/wallets/me`)
 *
 * **[P1] 표기의 뜻** — 이메일 가입·로그인 자체가 P1로 내려갔다 `[팀 9/2]`. MVP에서 이 화면은
 * **이메일·비밀번호·이름·약관 체크박스 없이** 국가·언어·통화·시간대 확인 폼으로만 뜬다.
 * C-02 컴포넌트 표의 이메일 관련 3줄은 P1이므로 여기서 렌더하지 않는다 —
 * 자리만 만들어 두면 MVP 사용자가 채울 수 없는 칸을 보게 된다.
 *
 * 진입 — 소셜 최초 로그인 + 지갑 등록(C-05) 직후 **1회 자동 노출**. 이후 변경은 C-04다.
 * 복귀 — 제출하면 로그인 전에 저장해 둔 경로, 없으면 홈(A-01).
 *
 * 레이아웃 —
 *   · 지역·시간과 화면 표시를 구분한다. PC는 설명을 옆에, 모바일은 폼 아래에 둔다.
 *   · 저장 액션은 폼 안에 한 번만 렌더하며 국가·시간대는 검색 목록으로 선택한다.
 *
 * ⚠ 헤더의 언어 스위치와 본문의 "언어 선택"은 **같은 값 하나**를 본다. 둘을 따로 두면
 * 한 화면 안에서 서로 다른 언어를 가리키는 컨트롤이 두 개 생긴다.
 */

import { useState } from 'react'
import { useLocale } from '@/shared/i18n/useLocale'

import { Button, GenreChips, LanguageSwitch, formatYoyo } from '@/shared/ui'
import './member-refresh.css'
import type { SupportedLanguage } from '@/shared/i18n'
import type { Genre } from '@/shared/i18n/genres'

import { FormField } from './FormField'
import { PickerButton, SearchPicker } from './SearchPicker'
import {
  CURRENCY_OPTIONS,
  LANGUAGE_OPTIONS,
  countryName,
  currencyOptionLabel,
  countryOptions,
  suggestTimezone,
  timezoneOptions,
} from './localeOptions'
import { saveErrorText } from './memberErrors'

/** `PATCH /api/v1/members/me` 요청 본문에 그대로 실리는 4개 필드 */
export interface SignupValues {
  /** ISO 3166-1 alpha-2. **자기 선언이며 증빙을 받지 않는다.** 미입력이면 제출할 수 없다 */
  countryCode: string
  locale: SupportedLanguage
  /** `^[A-Z]{3}$` — 기본 USD */
  displayCurrency: string
  /** IANA 이름 */
  timezone: string
  /**
   * **[v8]** 선호 장르 0~3개. **빈 배열도 유효한 제출**이다(건너뛰기 = `preferredGenres: []`) —
   * `undefined`로 두면 `JSON.stringify`가 키째 지워 "고르지 않음"이 서버에 닿지 않는다.
   */
  preferredGenres: Genre[]
}

interface Props {
  values: SignupValues
  onChange: (patch: Partial<SignupValues>) => void
  /**
   * 신규 회원의 기본 지급 잔액(`GET /api/v1/wallets/me`의 `balance.amount`).
   * **환영 문구는 신규 회원에게만** 뜬다 — 값이 없으면 문구 자체를 렌더하지 않는다.
   */
  welcomeBalanceKrw?: number
  saving?: boolean
  /** 실패 응답의 `code`. 분기는 이 값으로만 한다(응답 규격 §1) */
  errorCode?: string
  errorMsg?: string
  /** `COMMON_VALIDATION_FAILED`의 `errors.fieldErrors`를 필드별 안내로 옮긴 것 */
  fieldErrors?: Partial<Record<keyof SignupValues, string>>
  onSubmit: () => void
  onBack: () => void
}

type OpenPicker = 'country' | 'timezone' | null

export function SignupScreen({
  values,
  onChange,
  welcomeBalanceKrw,
  saving,
  errorCode,
  errorMsg,
  fieldErrors,
  onSubmit,
  onBack,
}: Props) {
  const { language, text } = useLocale()
  const [picker, setPicker] = useState<OpenPicker>(null)
  /**
   * 시간대를 사람이 직접 골랐는가. 국가를 바꿀 때 제안 시간대로 덮어쓸지 판단한다 —
   * 직접 고른 값을 나중에 국가 변경이 조용히 되돌리면 "왜 바뀌었지"가 된다.
   */
  const [timezoneTouched, setTimezoneTouched] = useState(false)

  // 국가 필수(C-02 입력 검증). 나머지는 제안값 그대로 저장할 수 있다
  const canSubmit = values.countryCode.length === 2 && !saving
  const error = errorCode ? saveErrorText(errorCode) : undefined
  const countries = countryOptions(values.locale)
  const timezones = timezoneOptions()

  const selectCountry = (code: string) => {
    // 국가로 시간대 기본 제안(C-02 "시간대 선택 — IANA. 국가로 기본 제안").
    // **언어·통화는 제안하지 않는다** — §5.11이 en·USD 고정으로 못 박았다. localeOptions 주석 참고
    const suggested = suggestTimezone(code)
    onChange({
      countryCode: code,
      ...(suggested && !timezoneTouched ? { timezone: suggested } : {}),
    })
    setPicker(null)
  }

  const submitButton = (
    <Button full disabled={!canSubmit} onClick={onSubmit}>
      {saving ? text('저장 중…', 'Saving…') : text('계속하기', 'Continue')}
    </Button>
  )

  const fields = (
    <>
      <fieldset className="member-field-group">
        <legend>{text('지역과 시간', 'Region & time')}</legend>
        <div className="member-fields">
          <FormField
            id="signup-country"
            label={<>{text('국가', 'Country')}</>}
            required
            error={fieldErrors?.countryCode}
          >
            {(a) => (
              <PickerButton
                {...a}
                text={values.countryCode ? countryName(values.countryCode, values.locale) : ''}
                placeholder={text('국가 선택', 'Select your country')}
                onOpen={() => setPicker('country')}
              />
            )}
          </FormField>
          <FormField
            id="signup-timezone"
            label={text('시간대', 'Time zone')}
            error={fieldErrors?.timezone}
          >
            {(a) => (
              <PickerButton
                {...a}
                text={values.timezone}
                placeholder={text('시간대 선택', 'Select your time zone')}
                onOpen={() => setPicker('timezone')}
              />
            )}
          </FormField>
        </div>
      </fieldset>
      <fieldset className="member-field-group">
        <legend>{text('화면 표시', 'Display preferences')}</legend>
        <div className="member-fields">
          <FormField
            id="signup-locale"
            label={<>{text('언어', 'Language')}</>}
            error={fieldErrors?.locale}
          >
            {(a) => (
              <select
                {...a}
                value={values.locale}
                onChange={(e) => onChange({ locale: e.target.value as SupportedLanguage })}
                className="h-11 w-full rounded-control border border-line bg-ground px-3 font-sans text-sm text-ink"
              >
                {LANGUAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.value === 'ko' ? text('한국어', 'Korean') : text('영어', 'English')}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <FormField
            id="signup-currency"
            label={<>{text('표시 통화', 'Display currency')}</>}
            error={fieldErrors?.displayCurrency}
          >
            {(a) => (
              <select
                {...a}
                value={values.displayCurrency}
                onChange={(e) => onChange({ displayCurrency: e.target.value })}
                className="h-11 w-full rounded-control border border-line bg-ground px-3 font-sans text-sm text-ink"
              >
                {CURRENCY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {currencyOptionLabel(o.value, language)}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        </div>
      </fieldset>
      {/* [v8] 좋아하는 장르 — 4개 필드 아래 폭 100%(C-02 레이아웃). 최대 3개, 0개 허용 */}
      <fieldset className="member-field-group">
        <legend>{text('취향', 'Your taste')}</legend>
        {/* `.member-fields`(PC 2열 그리드)에 넣지 않는다 — 칩은 폭 100%로 줄바꿈해야 한다 */}
        <GenreChips
          value={values.preferredGenres}
          onChange={(preferredGenres) => onChange({ preferredGenres })}
        />
      </fieldset>
    </>
  )

  return (
    <div className="flex min-h-dvh flex-col bg-ground">
      {/* 헤더 — 뒤로가기 + 언어 스위치(C-02 영역 구성).
          전역 헤더(§5.17)를 쓰지 않는다: 아직 온보딩 중이라 내비로 새 나갈 자리가 아니다 */}
      <header className="flex h-14 items-center gap-2 border-b border-line bg-surface px-2 md:px-4">
        <button
          type="button"
          aria-label={text('뒤로', 'Back')}
          onClick={onBack}
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-control text-ink transition-[scale,background-color] duration-150 ease-out hover:bg-ground-2 active:scale-95"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path
              d="M12.5 16L6.5 10l6-6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="flex-1" />
        <LanguageSwitch value={values.locale} onChange={(locale) => onChange({ locale })} />
      </header>

      <main className="member-workspace member-setup-workspace flex-1">
        <div className="member-heading">
          <h1 className="member-title">{text('계정 표시 설정', 'Account preferences')}</h1>
          <p className="member-description">
            {text(
              '국가와 언어, 금액·시간의 표시 방식을 확인해 주세요.',
              'Confirm your country, language, currency and time zone.',
            )}
          </p>
        </div>
        <div className="member-setup-grid">
          <section
            className="member-surface"
            aria-label={text('표시 설정', 'Display settings')}
            aria-busy={saving || undefined}
          >
            {/* 환영 문구 — 신규 회원에게만. 지갑 등록(C-05)이 끝나 기본 지급이 들어온 뒤라
            금액을 확정해서 말할 수 있다. 금액은 항상 원 값이 먼저다(§1.2 원칙 3) */}
            {welcomeBalanceKrw != null && (
              <p className="mt-0 mb-4 rounded-card border border-line bg-surface px-4 py-3.5 font-sans text-[13px] font-semibold text-ink">
                {text(
                  `준비 끝 — 지갑에 ${formatYoyo(welcomeBalanceKrw)}가 있어요.`,
                  `You’re all set — ${formatYoyo(welcomeBalanceKrw)} is in your wallet.`,
                )}
              </p>
            )}

            <div>{fields}</div>

            {/* 표시 통화 안내 — 그리드 아래 폭 100%(C-02 레이아웃) */}
            <p className="mt-5 mb-0 font-sans text-[12px] leading-relaxed text-muted">
              {text(
                '티켓 가격은 YoYo 기준이고, 선택한 통화로 대략의 금액을 함께 보여드려요.',
                'Tickets are priced in YoYo. We show an approximate amount in your currency.',
              )}
            </p>

            {error && (
              <p
                role="alert"
                className="mt-4 mb-0 rounded-card border border-danger px-3.5 py-3 font-sans text-[13px] leading-relaxed text-danger"
              >
                {errorMsg || text(error.ko, error.en)}
              </p>
            )}

            <div className="member-save-bar">
              <p>
                {text(
                  '설정은 마이페이지에서 언제든 바꿀 수 있어요.',
                  'You can change these preferences later in My page.',
                )}
              </p>
              {submitButton}
            </div>
          </section>
        </div>
      </main>

      <SearchPicker
        open={picker === 'country'}
        title={text('국가', 'Country')}
        options={countries}
        value={values.countryCode}
        placeholder={text('국가 검색', 'Search countries')}
        onSelect={selectCountry}
        onClose={() => setPicker(null)}
      />
      <SearchPicker
        open={picker === 'timezone'}
        title={text('시간대', 'Time zone')}
        options={timezones}
        value={values.timezone}
        placeholder={text('시간대 검색', 'Search time zones')}
        onSelect={(tz) => {
          setTimezoneTouched(true)
          onChange({ timezone: tz })
          setPicker(null)
        }}
        onClose={() => setPicker(null)}
      />
    </div>
  )
}
