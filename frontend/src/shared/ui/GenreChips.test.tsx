/**
 * 선호 장르 칩의 상한 규칙 — 화면설계 v8 C-02 "최대 3개, 선택 0개 허용",
 * "3개 초과 선택 시 나머지 칩 비활성" · API-member-06(0~3개).
 *
 * 상한을 화면에서 막지 않으면 4개째가 그대로 PATCH로 나가 400(`COMMON_VALIDATION_FAILED`)이
 * 되고, 사용자는 "왜 저장이 안 되지"만 본다. 여기서 잡는다.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import { GenreChips } from './GenreChips'

vi.mock('@/shared/i18n/useLocale', () => ({
  useLocale: () => ({ language: 'en', text: (_ko: string, en: string) => en }),
}))

it('3개를 고르면 나머지 칩이 비활성이고 고른 칩은 그대로 누를 수 있다', () => {
  const onChange = vi.fn()
  render(<GenreChips value={['ROCK', 'INDIE', 'POP']} onChange={onChange} />)

  expect(screen.getByRole('button', { name: 'Jazz' })).toBeDisabled()
  // 이미 고른 칩까지 막으면 바꾸려면 전부 지워야 한다
  const rock = screen.getByRole('button', { name: 'Rock' })
  expect(rock).toBeEnabled()
  expect(rock).toHaveAttribute('aria-pressed', 'true')

  fireEvent.click(rock)
  expect(onChange).toHaveBeenCalledWith(['INDIE', 'POP'])
})

it('상한 아래에서는 고르지 않은 칩을 더할 수 있다', () => {
  const onChange = vi.fn()
  render(<GenreChips value={['ROCK']} onChange={onChange} />)

  fireEvent.click(screen.getByRole('button', { name: 'Jazz' }))

  expect(onChange).toHaveBeenCalledWith(['ROCK', 'JAZZ'])
})

it('0개도 유효한 상태다 — 아무 칩도 눌린 표시가 아니고 전부 활성이다', () => {
  render(<GenreChips value={[]} onChange={vi.fn()} />)

  for (const name of ['Rock', 'Indie', 'Other']) {
    const chip = screen.getByRole('button', { name })
    expect(chip).toBeEnabled()
    expect(chip).toHaveAttribute('aria-pressed', 'false')
  }
})
