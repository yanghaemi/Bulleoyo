/**
 * 장르 코드 10종과 en/ko 라벨 — **한 곳**에서만 정의한다.
 *
 * 정본 — API v7 §1 API-member-05·06(`preferredGenres`) · §2 API-team-01·04(`genre`)
 *        · 화면설계 v8 §4 C-02·C-04·P-02 · `openapi.yaml`의 `Genre` 스키마
 *
 * 쓰는 곳이 셋이다 — C-02 선호 장르 칩 · C-04 선호 장르 수정 · P-02 팀 장르 셀렉트.
 * features끼리는 import하지 않으므로(기술 스택 v2 §3.2) shared에 둔다.
 *
 * 코드는 **언어 중립**이고 라벨만 화면 언어를 따른다(§0.6). 코드 자체를 번역하거나
 * 라벨로 분기하지 않는다 — 서버가 받는 것은 항상 대문자 enum이다.
 *
 * ko 라벨은 화면설계 v8 변경 요지의 10종 표기를 그대로 옮겼다. en 라벨은 명세가
 * 코드만 적고 문구를 정하지 않아 통용 표기를 썼다(보고 항목).
 */

import type { Schemas } from '@/shared/api/schema'
import type { SupportedLanguage } from '@/shared/i18n'

/** `openapi.yaml`의 `Genre`. 손으로 적지 않고 생성 타입에서 꺼낸다 */
export type Genre = Schemas['Genre']

/** 회원이 고를 수 있는 선호 장르 개수 상한(API-member-06 — 0~3개) */
export const MAX_PREFERRED_GENRES = 3

/** 표시 순서도 명세 나열 순서 그대로다. 임의로 정렬하지 않는다 */
export const GENRE_OPTIONS: readonly { value: Genre; ko: string; en: string }[] = [
  { value: 'ROCK', ko: '록', en: 'Rock' },
  { value: 'INDIE', ko: '인디', en: 'Indie' },
  { value: 'POP', ko: '팝', en: 'Pop' },
  { value: 'HIPHOP', ko: '힙합', en: 'Hip-hop' },
  { value: 'RNB', ko: '알앤비', en: 'R&B' },
  { value: 'JAZZ', ko: '재즈', en: 'Jazz' },
  { value: 'ELECTRONIC', ko: '일렉트로닉', en: 'Electronic' },
  { value: 'ACOUSTIC', ko: '어쿠스틱', en: 'Acoustic' },
  { value: 'CLASSICAL', ko: '클래식', en: 'Classical' },
  { value: 'ETC', ko: '기타', en: 'Other' },
] as const

/**
 * 코드 → 라벨. **모르는 코드는 코드를 그대로 돌려준다** — 값을 숨기지 않는다
 * (`countryName`과 같은 판단). 마이그레이션 전 자유 문자열이 남아 있어도 화면이 비지 않는다.
 */
export function genreLabel(code: string, language: SupportedLanguage = 'en'): string {
  const found = GENRE_OPTIONS.find((g) => g.value === code)
  if (!found) return code
  return language === 'ko' ? found.ko : found.en
}

/** 응답의 문자열이 우리가 아는 10종인지. 모르는 값이 폼 상태로 새지 않게 막는다 */
export function isGenre(code: string | null | undefined): code is Genre {
  return GENRE_OPTIONS.some((g) => g.value === code)
}
