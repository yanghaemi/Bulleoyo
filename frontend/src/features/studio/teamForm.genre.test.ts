/**
 * P-02 장르 검증 — 화면설계 v8 P-02("장르 셀렉트, 필수") · API v7 team-01(`genre` 필수) ·
 * team-04(`genre` 선택).
 *
 * 생성에서 안 막으면 400(`COMMON_VALIDATION_FAILED`)으로 폼이 되돌아온다. 반대로 수정에서
 * 막으면 마이그레이션 전 자유 문자열을 가진 팀이 **이름·소개조차 못 고친다** — 두 방향을
 * 모두 고정한다.
 */

import { expect, it } from 'vitest'

import { validateTeamForm } from './teamForm'

const base = { teamName: '블루노트', introduction: '', genre: '' } as const

it('생성은 장르를 고르지 않으면 통과하지 못한다', () => {
  expect(validateTeamForm(base, { genreRequired: true }).genre).toBeTruthy()
  expect(validateTeamForm({ ...base, genre: 'INDIE' }, { genreRequired: true }).genre).toBeUndefined()
})

it('수정도 유효한 장르 하나를 선택해야 저장할 수 있다', () => {
  expect(validateTeamForm(base, { genreRequired: true }).genre).toBeTruthy()
  expect(validateTeamForm({ ...base, genre: 'ROCK' }, { genreRequired: true }).genre).toBeUndefined()
})
