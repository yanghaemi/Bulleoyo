/**
 * i18n 초기화.
 *
 * 정본: API v6 §0.6 · 화면설계 v6 §1.2
 *
 * - **`en`이 기본이고 `ko`가 보조다.** 관객이 외국인이라는 전제로 만든 서비스라
 *   관객 화면은 영어를 1급으로 둔다. 그 밖의 값은 en으로 폴백한다.
 * - 서버도 같은 규칙을 쓴다. `Accept-Language`는 shared/api/client가 모든 요청에 붙이고,
 *   로그인 회원은 서버가 프로필 `locale`을 헤더보다 우선한다(C-04에서 바꾼 값이 곧바로 반영되게).
 *   즉 여기 언어는 **표시용 기본값**이고, 회원의 최종 언어는 서버가 정한다.
 * - 번역 대상이 아닌 것: `code` 문자열, 상태값, 필드명, 팀·공연 이름처럼 사용자가 입력한 데이터.
 *   서버가 내려준 `msg`·`summary.title`·고지 문구는 이미 번역돼 오므로 그대로 출력한다.
 * - 관객 화면에는 블록체인 용어를 노출하지 않는다. 허용 예외는 공개 검증(V-01)·발행량 공시(V-02)와
 *   서명 단계의 "Confirm in your wallet" 한 줄이다.
 *
 * 지금은 공통 문구 몇 개만 둔다. 화면 문구는 각 화면을 구현할 때 네임스페이스로 늘린다.
 */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from '@/shared/i18n/locales/en.json'
import ko from '@/shared/i18n/locales/ko.json'

export const SUPPORTED_LANGUAGES = ['en', 'ko'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en'
const LANGUAGE_KEY = 'b204.locale'

export function readLanguage(): SupportedLanguage {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY)
    return saved === 'ko' || saved === 'en' ? saved : DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
}

/** Explicit language selection persists across routes and reloads. */
export function setAppLanguage(language: SupportedLanguage): void {
  try {
    localStorage.setItem(LANGUAGE_KEY, language)
  } catch {
    /* Private browsing. */
  }
  document.documentElement.lang = language
  void i18n.changeLanguage(language)
}

/** 브라우저 언어가 ko*이면 ko, 그 밖은 전부 en으로 폴백한다(§0.6). */
export function normalizeLanguage(raw: string | undefined): SupportedLanguage {
  return raw && raw.toLowerCase().startsWith('ko') ? 'ko' : 'en'
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ko: { translation: ko },
  },
  lng: readLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  interpolation: { escapeValue: false },
  returnNull: false,
})

i18n.on('languageChanged', (language) => {
  if (typeof document !== 'undefined') document.documentElement.lang = normalizeLanguage(language)
})
if (typeof document !== 'undefined') document.documentElement.lang = readLanguage()

export default i18n
