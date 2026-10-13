/**
 * C-04 언어·통화 설정.
 *
 * 정본 — 화면설계 v6 §4 C-04 · §5.4 금액 표기 · §5.13 KST 병기 · §5.19 액션 배치
 *        · API 명세 v6 member_06(`PATCH /api/v1/members/me`) · coin_02(`GET /api/v1/coin/rates`)
 *
 * 바꾸는 값은 넷이다 — **언어(locale) · 표시 통화(display_currency) · 시간대(timezone)
 * · [v8] 선호 장르(preferred_genres)**.
 * 국가(countryCode)는 C-02에서 한 번 받고 여기서는 다루지 않는다(C-04 컴포넌트 표에 없다).
 *
 * 규칙 —
 *   · **환율 조회에 실패해도 원 값은 항상 그대로 보여준다**(C-04 상태 절). 환산은 보조 정보다
 *   · 표시 통화는 `exchange_rate`에 **등록된 pair만** 고를 수 있다 — 등록되지 않은 통화는
 *     목록에 노출하지 않는다(C-04 입력 검증)
 *   · 저장 성공하면 전 화면 문구·금액 표기가 즉시 갱신된다(재로그인 불필요)
 *
 * 레이아웃 —
 *   · 모바일은 설정 뒤에 미리보기를 두고 PC는 두 영역을 나란히 보여준다.
 *   · 공통 저장 바는 전달받은 저장 가능 여부와 처리 중 상태를 표시한다.
 *
 * 하단 탭바를 렌더하지 않는다 — 하단 고정 액션과 탭바는 같은 화면에 함께 있을 수 없다(§5.19).
 */

import { useState } from 'react'
import { useLocale } from '@/shared/i18n/useLocale'

import { Button, GenreChips, MobileHeader, Money, SelectableRow, formatKst, formatYoyo } from '@/shared/ui'
import { ThemeSwitch } from '@/shared/ui/ThemeSwitch'
import './member-refresh.css'
import type { SupportedLanguage } from '@/shared/i18n'
import type { Genre } from '@/shared/i18n/genres'

import { FormField } from './FormField'
import { PickerButton, SearchPicker } from './SearchPicker'
import {
  BASE_CURRENCY,
  CURRENCY_OPTIONS,
  LANGUAGE_OPTIONS,
  formatApprox,
  currencyOptionLabel,
  timezoneOptions,
} from './localeOptions'
import { saveErrorText } from './memberErrors'

/**
 * `GET /api/v1/coin/rates`의 `rates[]` 한 줄. **1 base = rate KRW 방향**이다(coin_02).
 * 응답에는 `quote`·`source`도 있지만 이 화면이 쓰지 않아 옮기지 않았다 —
 * 쓰지 않는 필드를 타입에 적어 두면 화면이 그 값을 아는 것처럼 읽힌다.
 */
export interface DisplayRate {
  /** `USD_KRW` 형식 */
  pair: string
  /** `USD` */
  base: string
  rate: number
  /** 그 환율의 적용 시각(ISO 8601) */
  effectiveFrom: string
}

export interface PreferenceValues {
  locale: SupportedLanguage
  /** `^[A-Z]{3}$` */
  displayCurrency: string
  /** IANA 이름 */
  timezone: string
  /** **[v8]** 선호 장르 0~3개. 저장은 **전체 교체**이고 빈 배열은 전부 삭제다(API-member-06) */
  preferredGenres: Genre[]
}

interface Props {
  values: PreferenceValues
  onChange: (patch: Partial<PreferenceValues>) => void
  /**
   * 등록된 표시 환율. **`undefined`는 "아직 모른다"**(로딩·실패)이고,
   * 빈 배열은 "등록된 환율이 없다"는 정상 응답이다(coin_02 — 404가 아니다).
   */
  rates?: DisplayRate[]
  ratesLoading?: boolean
  /** 환율 조회 실패. 환산값만 접고 나머지는 그대로 그린다 */
  ratesFailed?: boolean
  /** 응답의 `usageNotice`. 오면 그대로 쓴다 — 서버 문구가 사용자 언어에 맞춰 온다 */
  usageNotice?: string
  saving?: boolean
  saveDisabled?: boolean
  /** 실패 응답의 `code`. 분기는 이 값으로만 한다(응답 규격 §1) */
  errorCode?: string
  errorMsg?: string
  fieldErrors?: Partial<Record<keyof PreferenceValues, string>>
  onSave: () => void
  onRetryRates: () => void
}

/**
 * 미리보기에 쓰는 고정 예시값. C-04 컴포넌트 표의 보기(`15,000 YoYo ≈ $11.10` ·
 * `Sep 20, 7:00 PM (KST 19:00)`)를 그대로 옮긴 것이고, 서버에서 받아오는 값이 아니다.
 * 실제 티켓 가격·공연 시각과 무관하다 — "내 설정이면 이렇게 보인다"만 알리는 자리다.
 */
const PREVIEW_AMOUNT = 15_000
const PREVIEW_ISO = '2026-09-20T19:00:00+09:00'

export function PreferencesScreen({
  values,
  onChange,
  rates,
  ratesLoading,
  ratesFailed,
  usageNotice,
  saving,
  saveDisabled,
  errorCode,
  errorMsg,
  fieldErrors,
  onSave,
  onRetryRates,
}: Props) {
  const { language, text } = useLocale()
  const [pickerOpen, setPickerOpen] = useState(false)

  const error = errorCode ? saveErrorText(errorCode) : undefined
  const selectedRate = rates?.find((r) => r.base === values.displayCurrency)
  const isBase = values.displayCurrency === BASE_CURRENCY

  /**
   * 고를 수 있는 표시 통화.
   * KRW는 원 값 자체라 환율 없이 항상 고를 수 있고, 나머지는 등록된 pair만 남긴다.
   * ⚠ 환율을 **아직 모를 때**(로딩·실패)는 거르지 않는다 — 여기서 걸러 버리면 지금 쓰고 있는
   * 통화가 목록에서 사라져 선택이 제멋대로 바뀐 것처럼 보인다. 지원 여부는 저장 시
   * 서버가 `COMMON_VALIDATION_FAILED`로 알려 준다.
   */
  const currencyOptions = CURRENCY_OPTIONS.filter(
    (c) => rates == null || c.value === BASE_CURRENCY || rates.some((r) => r.base === c.value),
  )

  /**
   * 미리보기 환산.
   * §5.4는 "응답의 `display`를 그대로 쓰고 클라이언트가 환율을 재계산하지 않는다"고 했지만,
   * **C-04 미리보기는 아직 저장하지 않은 통화로 그려야 하므로 서버가 줄 `display`가 없다.**
   * C-04 컴포넌트 표가 미리보기 패널의 연결 API를 `GET /api/v1/coin/rates`로 지정한 것도
   * 같은 이유다. 이 화면에 한정한 예외다(Money.tsx의 A-03 예외와 같은 성격).
   */
  const approx =
    selectedRate && selectedRate.rate > 0
      ? formatApprox(values.displayCurrency, PREVIEW_AMOUNT / selectedRate.rate)
      : undefined

  const saveButton = (
    <Button full disabled={saving || saveDisabled} onClick={onSave}>
      {saving ? text('저장 중…', 'Saving…') : text('저장', 'Save')}
    </Button>
  )

  /* ── 미리보기 패널 ── */
  const preview = (
    <section aria-live="polite" aria-label={text('미리보기', 'Preview')} className="member-preview">
      <h2 className="mt-0 mb-2 font-sans text-[11px] font-semibold tracking-wide text-muted uppercase">
        {text('미리보기', 'Preview')}
      </h2>
      <p className="mb-6 text-xs text-muted">
        {text('설정에 따른 표시 예시', 'Example with your preferences')}
      </p>

      {/* 금액 — 원 값이 먼저고 환산은 보조다(§1.2 원칙 3 · §5.4).
          환율을 부르는 동안에는 환산 자리만 스켈레톤이고 YoYo 금액은 그대로 남는다 */}
      <p className="m-0 font-sans text-[17px] font-bold text-ink">
        <Money amount={PREVIEW_AMOUNT} approx={approx} strong />
        {!isBase && !approx && ratesLoading && (
          <span
            aria-hidden
            className="ml-2 inline-block h-3.5 w-14 animate-pulse rounded-chip bg-ground-2 align-middle"
          />
        )}
      </p>

      {!isBase && !approx && !ratesLoading && (
        <p className="mt-1 mb-0 font-sans text-[11px] text-muted">
          {ratesFailed ? (
            <>
              {text('환율을 불러오지 못했어요.', 'Couldn’t load the rate.')}{' '}
              <button
                type="button"
                onClick={onRetryRates}
                className="member-retry cursor-pointer font-semibold text-sel underline-offset-2 hover:underline"
              >
                {text('다시 시도', 'Try again')}
              </button>
            </>
          ) : (
            <>
              {text(
                rates == null
                  ? '환율 정보를 아직 확인할 수 없어요.'
                  : '이 통화의 환율이 아직 등록되지 않았어요.',
                rates == null
                  ? 'Rate information is not available yet.'
                  : 'No rate registered for this currency yet.',
              )}
            </>
          )}
        </p>
      )}

      {/* 시각 — 선택한 시간대로 그리고 KST를 병기한다(§5.13).
          시간대가 KST면 병기가 생략된다 — formatKst가 그 규칙을 갖고 있다 */}
      <p className="mt-2 mb-0 font-sans text-[13px] text-ink">
        {formatKst(PREVIEW_ISO, values.timezone, language)}
      </p>
      <p className="mt-0.5 mb-0 font-mono text-[11px] text-muted">{values.timezone}</p>
    </section>
  )

  /* ── 환산 고지 ── */
  const notice = (
    <p className="member-preview-note m-0 font-sans text-[12px] leading-relaxed text-muted">
      {usageNotice ?? (
        <>
          {text(
            '환산 금액은 참고용이며, 결제·환불·정산은 모두 YoYo 기준이에요.',
            'Converted amounts are for reference only. All payments, refunds and settlements are in YoYo.',
          )}
        </>
      )}
      {/* 적용 환율·기준 시각(C-04 컴포넌트 표). 표시 통화가 KRW면 적용할 환율이 없다 */}
      {selectedRate && (
        <span className="mt-1 block font-mono text-[11px] text-faint">
          1 {selectedRate.base} = {formatYoyo(selectedRate.rate)} ·{' '}
          {formatKst(selectedRate.effectiveFrom, values.timezone, language)}
        </span>
      )}
    </p>
  )

  /* ── 선택 필드 3개 ── */
  const fields = (
    <div className="flex flex-col gap-5">
      {/* 언어 — 라디오(C-04 컴포넌트 표). 선택 표시는 배경색으로만 한다(토큰 문서 §3-2) */}
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-1.5 p-0 font-sans text-[11px] font-semibold text-muted md:text-xs">
          {text('언어', 'Language')}
        </legend>
        <div
          role="radiogroup"
          aria-label={text('언어', 'Language')}
          className="flex flex-col gap-3"
        >
          {LANGUAGE_OPTIONS.map((o) => (
            <SelectableRow
              key={o.value}
              selected={values.locale === o.value}
              onSelect={() => onChange({ locale: o.value })}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-sans text-[13px] font-semibold text-ink">
                  {o.value === 'ko' ? text('한국어', 'Korean') : text('영어', 'English')}
                </span>
              </span>
            </SelectableRow>
          ))}
        </div>
      </fieldset>

      <FormField
        id="pref-currency"
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
            {currencyOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {currencyOptionLabel(o.value, language)}
              </option>
            ))}
          </select>
        )}
      </FormField>

      <FormField
        id="pref-timezone"
        label={<>{text('시간대', 'Time zone')}</>}
        error={fieldErrors?.timezone}
      >
        {(a) => (
          <PickerButton
            {...a}
            text={values.timezone}
            placeholder={text('시간대 선택', 'Select your time zone')}
            onOpen={() => setPickerOpen(true)}
          />
        )}
      </FormField>

      {/* [v8] 선호 장르 — C-02와 같은 칩을 그대로 쓴다(같은 API, 같은 제약) */}
      <GenreChips
        value={values.preferredGenres}
        onChange={(preferredGenres) => onChange({ preferredGenres })}
        legend={text('선호 장르', 'Genres you like')}
      />

      {error && (
        <p
          role="alert"
          className="m-0 rounded-card border border-danger px-3.5 py-3 font-sans text-[13px] leading-relaxed text-danger"
        >
          {errorMsg || text(error.ko, error.en)}
        </p>
      )}
    </div>
  )

  return (
    <div className="min-h-dvh bg-ground">
      {/* 뒤로가기 + 타이틀(모바일) / 전역 헤더(PC) — §5.17 */}
      <MobileHeader title={text('내 설정', 'Settings')} backTo="/me" />

      <main className="member-workspace">
        <div className="member-heading">
          <h1 className="member-title hidden md:block">{text('내 설정', 'Settings')}</h1>
          <p className="member-description">
            {text(
              '화면 테마와 언어, 금액과 공연 시간의 표시 방식을 바꿔보세요.',
              'Choose your theme, language, prices and show times.',
            )}
          </p>
        </div>

        {/* 모바일 1열 → PC 2열(좌 480px 필드 · 우 280px 미리보기 고정).
            **폼을 폭별로 두 벌 렌더하지 않는다** — 같은 화면에 `id`가 두 개씩 생기면
            `label htmlFor`가 어느 컨트롤을 가리키는지 알 수 없게 된다. 한 벌만 두고
            컨테이너 클래스로 배치만 바꾼다 */}
        <div className="member-settings-grid">
          <section
            className="member-surface"
            aria-label={text('설정 조정', 'Adjust preferences')}
            aria-busy={saving || undefined}
          >
            {fields}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
              <div>
                <h2 className="text-sm font-semibold text-ink">
                  {text('화면 테마', 'Appearance')}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  {text('이 기기에 바로 적용됩니다.', 'Applied immediately on this device.')}
                </p>
              </div>
              <ThemeSwitch />
            </div>
          </section>
          <div className="member-settings-preview">
            <div className="flex flex-col gap-4">
              {preview}
              {notice}
            </div>
          </div>
        </div>
        <div className="member-save-bar">
          <p role="status">
            {saving
              ? text('설정을 저장하고 있어요', 'Saving your preferences')
              : saveDisabled
                ? text(
                    '저장할 변경 사항이 없거나 아직 설정을 확인할 수 없어요',
                    'No changes to save, or preferences are not available yet',
                  )
                : text('변경한 설정을 저장해 주세요', 'Save your updated preferences')}
          </p>
          {saveButton}
        </div>
      </main>

      <SearchPicker
        open={pickerOpen}
        title={text('시간대', 'Time zone')}
        options={timezoneOptions()}
        value={values.timezone}
        placeholder={text('시간대 검색', 'Search time zones')}
        onSelect={(tz) => {
          onChange({ timezone: tz })
          setPickerOpen(false)
        }}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  )
}
