/**
 * C-02·C-04가 함께 쓰는 선택지 — 국가·언어·표시 통화·시간대.
 *
 * 정본 — 화면설계 v6 §4 C-02·C-04 · §5.11 언어 스위치
 *        · API v6 member_06(`PATCH /api/v1/members/me`)의 필드 제약
 *
 * 필드 제약(요청 본문에 그대로 실린다) —
 *   · `countryCode`      ISO 3166-1 alpha-2, `^[A-Z]{2}$`
 *   · `locale`           `en` | `ko` (기본 en)
 *   · `displayCurrency`  `^[A-Z]{3}$` (기본 USD)
 *   · `timezone`         IANA 이름 (기본 UTC)
 *
 * 컴포넌트 파일이 아니라 여기 둔 이유 — 화면 파일은 컴포넌트만 export한다(Fast Refresh).
 */

import type { SupportedLanguage } from '@/shared/i18n'

/* ───────────────────────────── 언어 ───────────────────────────── */

/**
 * 언어 2종. **`en`이 기본이다**(§5.11 `[팀 9/2]`).
 * 지원 목록의 정본은 `shared/i18n`이고 여기서는 라벨만 붙인다.
 */
export const LANGUAGE_OPTIONS: { value: SupportedLanguage; label: string; sub: string }[] = [
  { value: 'en', label: 'English', sub: '영어' },
  { value: 'ko', label: '한국어', sub: 'Korean' },
]

/* ─────────────────────────── 표시 통화 ─────────────────────────── */

/**
 * C-02·C-04 컴포넌트 표가 적은 4종이다 — `USD(기본)·JPY·EUR·KRW`.
 * 임의로 늘리지 않는다. **C-04는 여기에 더해 "`exchange_rate`에 등록된 pair만"이라는
 * 조건이 붙는다**(C-04 입력 검증) — 등록되지 않은 통화는 목록에 노출하지 않으므로
 * 실제 노출 목록은 `GET /api/v1/coin/rates` 응답으로 한 번 더 거른다.
 */
export const CURRENCY_OPTIONS: { value: string; label: string; symbol: string }[] = [
  { value: 'USD', label: 'US dollar', symbol: '$' },
  { value: 'JPY', label: 'Japanese yen', symbol: '¥' },
  { value: 'EUR', label: 'Euro', symbol: '€' },
  // 값 `KRW`는 API `displayCurrency` enum이라 그대로 둔다. 화면에는 통화 이름 대신 "환산 없음"으로 보인다
  { value: 'KRW', label: 'No conversion', symbol: '' },
]

/**
 * 표시 통화가 KRW면 환산 자체가 없다 — YoYo 금액이 곧 표시 값이다.
 * API v6 §0.5도 이때는 `display` 블록을 아예 내리지 않는다.
 */
export const BASE_CURRENCY = 'KRW'

/** Currency labels follow the current screen language; codes remain unchanged. */
export function currencyName(currency: string, language: SupportedLanguage): string {
  return new Intl.DisplayNames([language], { type: 'currency' }).of(currency) ?? currency
}

/**
 * 표시 통화 선택지 한 줄. 기준 통화(`KRW`)는 "원화"로 읽히면 안 되므로(2026-09-24 결정 — 금액 표기는 YoYo)
 * 코드·통화 이름 대신 "YoYo — 환산 없음"으로 보인다. 나머지는 `USD — US Dollar` 형식 그대로다.
 */
export function currencyOptionLabel(currency: string, language: SupportedLanguage): string {
  if (currency === BASE_CURRENCY) return language === 'ko' ? 'YoYo — 환산 없음' : 'YoYo — no conversion'
  return `${currency} — ${currencyName(currency, language)}`
}

/** 환산 근사값 문자열. 서버 `display.approx`가 있으면 **그 값을 쓰고 여기서 계산하지 않는다**(§5.4) */
export function formatApprox(currency: string, approx: number): string {
  const symbol = CURRENCY_OPTIONS.find((c) => c.value === currency)?.symbol ?? ''
  // JPY는 소수를 쓰지 않는 통화지만 응답 `approx`가 소수 2자리로 내려오므로(§0.5)
  // 표기 자리수는 Intl에 맡긴다 — 통화별 규칙을 화면이 다시 정하지 않는다
  const digits = currency === 'JPY' ? 0 : 2
  return `${symbol}${approx.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}

/* ───────────────────────────── 국가 ───────────────────────────── */

/**
 * 국가 코드 목록.
 *
 * ⚠ ISO 3166-1 alpha-2 **전체(249개)를 열거하는 표준 브라우저 API가 없다.** 그래서
 * 여기 목록은 시연 대상 지역 위주의 **표시용 부분집합**이고, 서버는 전체 집합을 검증한다
 * (`COMMON_VALIDATION_FAILED` — 허용되지 않는 countryCode). 목록을 늘려야 하면 이 배열만 고친다.
 *
 * 주 표시명은 자국어 이름으로 고정한다. UI 언어를 바꿔도 선택한 나라를 알아보기 쉽고,
 * 목록 순서도 바뀌지 않는다. 보조 표시명만 `Intl.DisplayNames`로 현재 UI 언어에 맞춘다.
 */
const COUNTRY_CODES = [
  'US',
  'KR',
  'JP',
  'CN',
  'TW',
  'HK',
  'SG',
  'TH',
  'VN',
  'PH',
  'ID',
  'MY',
  'IN',
  'AU',
  'NZ',
  'CA',
  'MX',
  'BR',
  'AR',
  'CL',
  'GB',
  'IE',
  'FR',
  'DE',
  'NL',
  'BE',
  'ES',
  'PT',
  'IT',
  'CH',
  'AT',
  'SE',
  'NO',
  'DK',
  'FI',
  'PL',
  'CZ',
  'TR',
  'AE',
  'SA',
] as const

const COUNTRY_NATIVE_NAMES: Record<(typeof COUNTRY_CODES)[number], string> = {
  US: 'United States',
  KR: '대한민국',
  JP: '日本',
  CN: '中国',
  TW: '臺灣',
  HK: '香港',
  SG: 'Singapore',
  TH: 'ประเทศไทย',
  VN: 'Việt Nam',
  PH: 'Pilipinas',
  ID: 'Indonesia',
  MY: 'Malaysia',
  IN: 'भारत / India',
  AU: 'Australia',
  NZ: 'Aotearoa New Zealand',
  CA: 'Canada',
  MX: 'México',
  BR: 'Brasil',
  AR: 'Argentina',
  CL: 'Chile',
  GB: 'United Kingdom',
  IE: 'Éire / Ireland',
  FR: 'France',
  DE: 'Deutschland',
  NL: 'Nederland',
  BE: 'België / Belgique / Belgien',
  ES: 'España',
  PT: 'Portugal',
  IT: 'Italia',
  CH: 'Schweiz / Suisse / Svizzera',
  AT: 'Österreich',
  SE: 'Sverige',
  NO: 'Norge',
  DK: 'Danmark',
  FI: 'Suomi',
  PL: 'Polska',
  CZ: 'Česko',
  TR: 'Türkiye',
  AE: 'الإمارات العربية المتحدة',
  SA: 'المملكة العربية السعودية',
}

const COUNTRY_CODES_BY_NATIVE_NAME = [...COUNTRY_CODES].sort((left, right) =>
  COUNTRY_NATIVE_NAMES[left].localeCompare(COUNTRY_NATIVE_NAMES[right]),
)

/**
 * 국가 → 시간대 기본 제안.
 *
 * C-02·C-04의 "시간대 선택 — IANA. **국가로 기본 제안**"을 위한 값이다. 나라 하나에
 * 시간대가 여럿인 곳(US·BR·AU 등)은 **가장 인구가 많은 하나**를 제안하고, 사용자가
 * 시간대 목록에서 언제든 바꾼다. 제안이지 확정이 아니다.
 *
 * ⚠ **언어·통화는 제안하지 않는다.** C-02 표에는 "국가 선택 시 언어·통화·시간대 기본값
 * 자동 제안"이라고 적혀 있지만, §5.11이 `[팀 9/2]` 결정으로 **"기본 언어 en·기본 표시 통화
 * USD 고정, 국가별 자동 제안은 하지 않는다"**고 못 박았다. 두 줄이 정면으로 부딪혀서
 * 나중 결정이자 더 강한 표현인 §5.11을 따랐고, 시간대만 제안한다(시간대는 C-02 표
 * "국가로 기본 제안"이 §5.11과 충돌하지 않는 유일한 항목이다). — 명세 확인 요청 대상.
 */
const COUNTRY_TIMEZONE: Record<string, string> = {
  US: 'America/Los_Angeles',
  KR: 'Asia/Seoul',
  JP: 'Asia/Tokyo',
  CN: 'Asia/Shanghai',
  TW: 'Asia/Taipei',
  HK: 'Asia/Hong_Kong',
  SG: 'Asia/Singapore',
  TH: 'Asia/Bangkok',
  VN: 'Asia/Ho_Chi_Minh',
  PH: 'Asia/Manila',
  ID: 'Asia/Jakarta',
  MY: 'Asia/Kuala_Lumpur',
  IN: 'Asia/Kolkata',
  AU: 'Australia/Sydney',
  NZ: 'Pacific/Auckland',
  CA: 'America/Toronto',
  MX: 'America/Mexico_City',
  BR: 'America/Sao_Paulo',
  AR: 'America/Argentina/Buenos_Aires',
  CL: 'America/Santiago',
  GB: 'Europe/London',
  IE: 'Europe/Dublin',
  FR: 'Europe/Paris',
  DE: 'Europe/Berlin',
  NL: 'Europe/Amsterdam',
  BE: 'Europe/Brussels',
  ES: 'Europe/Madrid',
  PT: 'Europe/Lisbon',
  IT: 'Europe/Rome',
  CH: 'Europe/Zurich',
  AT: 'Europe/Vienna',
  SE: 'Europe/Stockholm',
  NO: 'Europe/Oslo',
  DK: 'Europe/Copenhagen',
  FI: 'Europe/Helsinki',
  PL: 'Europe/Warsaw',
  CZ: 'Europe/Prague',
  TR: 'Europe/Istanbul',
  AE: 'Asia/Dubai',
  SA: 'Asia/Riyadh',
}

/** 국가 코드로 제안할 시간대. 모르는 코드면 제안하지 않는다(빈 값 대신 undefined) */
export function suggestTimezone(countryCode: string): string | undefined {
  return COUNTRY_TIMEZONE[countryCode]
}

/** 국가명. `Intl.DisplayNames`가 없거나 모르는 코드면 코드를 그대로 돌려준다 — 값을 숨기지 않는다 */
export function countryName(code: string, locale: SupportedLanguage = 'en'): string {
  try {
    const names = new Intl.DisplayNames([locale], { type: 'region' })
    return names.of(code) ?? code
  } catch {
    return code
  }
}

/** 지원 목록에 있는 국가의 자국어 이름. 목록 밖의 코드는 표시하지 않는다. */
export function countryNativeName(code: string): string | undefined {
  return Object.hasOwn(COUNTRY_NATIVE_NAMES, code)
    ? COUNTRY_NATIVE_NAMES[code as keyof typeof COUNTRY_NATIVE_NAMES]
    : undefined
}

/** 국가 선택 목록. 자국어 이름으로 한 번 고정한 순서를 UI 언어와 무관하게 유지한다. */
export function countryOptions(
  locale: SupportedLanguage = 'en',
): { value: string; label: string; sub: string }[] {
  return COUNTRY_CODES_BY_NATIVE_NAME.map((code) => {
    const label = COUNTRY_NATIVE_NAMES[code]
    const localized = countryName(code, locale)
    return {
      value: code,
      label,
      sub: localized === label ? code : `${localized} · ${code}`,
    }
  })
}

/* ──────────────────────────── 시간대 ──────────────────────────── */

/**
 * IANA 시간대가 너무 많아 손으로 적을 수 없다. `Intl.supportedValuesOf('timeZone')`가
 * 브라우저가 아는 전체 목록을 준다. 없는 브라우저(구형 Safari 등)에서는 아래 폴백만 보이므로
 * **검색 목록이 비지 않게** 대표 시간대를 남겨 둔다.
 */
const TIMEZONE_FALLBACK = [
  'Asia/Seoul',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
]

export function timezoneOptions(): { value: string; label: string; sub: string }[] {
  // 타입 정의에 `supportedValuesOf`가 없는 lib 설정에서도 깨지지 않게 좁혀서 읽는다
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
  let zones: string[]
  try {
    zones = intl.supportedValuesOf?.('timeZone') ?? TIMEZONE_FALLBACK
  } catch {
    zones = TIMEZONE_FALLBACK
  }
  return zones.map((tz) => ({ value: tz, label: tz, sub: utcOffsetLabel(tz) }))
}

/**
 * `UTC+09:00` 표기. 시간대 이름만으로는 몇 시인지 모르는 사람이 훨씬 많아서
 * 검색 목록에 보조 정보로 붙인다. 계산이 실패하면 빈 문자열 — 목록을 막지 않는다.
 */
export function utcOffsetLabel(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    }).formatToParts(new Date())
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
  } catch {
    return ''
  }
}

/** 브라우저가 추정한 시간대. 국가 제안이 없을 때의 초기값으로 쓴다 */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}
