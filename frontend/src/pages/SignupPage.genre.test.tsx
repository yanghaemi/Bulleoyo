/**
 * C-02가 선호 장르를 **항상** 실어 보내는지 — 화면설계 v8 C-02 "건너뛰기 = 빈 배열 전송",
 * API-member-06 `preferredGenres`(전체 교체, 빈 배열 = 전부 삭제).
 *
 * `undefined`로 두면 `JSON.stringify`가 키째 지워 "고르지 않기로 했다"가 서버에 닿지 않는다.
 * 화면은 "저장됨"을 보여 주는데 예전 선호가 그대로 남는다 — 화면만 봐서는 드러나지 않는다
 * (`TeamManagePage.save.test.tsx`의 소개 비우기와 같은 함정).
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

import { SignupPage } from './SignupPage'
import type { SignupValues } from '@/features/member/SignupScreen'

const navigate = vi.hoisted(() => vi.fn())
const mutate = vi.hoisted(() => vi.fn())

vi.mock('react-router', () => ({
  useLocation: () => ({ state: null }),
  useNavigate: () => navigate,
}))
vi.mock('@/shared/i18n/useLocale', () => ({
  useLocale: () => ({ language: 'en', text: (_ko: string, en: string) => en }),
}))
vi.mock('@/shared/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/ui')>()),
  toast: vi.fn(),
}))
vi.mock('@/features/member/localeOptions', () => ({ browserTimezone: () => 'Asia/Seoul' }))
vi.mock('@/shared/queries/member', () => ({
  useMyMember: () => ({ data: undefined }),
  useUpdateMyMember: () => ({ isPending: false, error: null, mutate }),
}))
// 화면 대신 값·콜백만 노출하는 껍데기를 둔다 — 여기 관심사는 PATCH 본문이다
vi.mock('@/features/member/SignupScreen', () => ({
  SignupScreen: ({
    values,
    onChange,
    onSubmit,
  }: {
    values: SignupValues
    onChange: (patch: Partial<SignupValues>) => void
    onSubmit: () => void
  }) => (
    <>
      <button onClick={() => onChange({ preferredGenres: ['ROCK', 'JAZZ'] })}>pick two</button>
      <button onClick={onSubmit}>Continue</button>
      <output>{values.preferredGenres.join(',')}</output>
    </>
  ),
}))

beforeEach(() => vi.clearAllMocks())

it('아무 장르도 고르지 않고 계속하면 빈 배열이 실린다 — 직렬화 후에도 키가 남는다', () => {
  render(<SignupPage />)

  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

  const body = mutate.mock.calls[0][0] as SignupValues
  expect(body.preferredGenres).toEqual([])
  expect(JSON.parse(JSON.stringify(body))).toHaveProperty('preferredGenres', [])
})

it('고른 장르는 그대로 실린다', () => {
  render(<SignupPage />)

  fireEvent.click(screen.getByRole('button', { name: 'pick two' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

  expect(mutate.mock.calls[0][0]).toMatchObject({ preferredGenres: ['ROCK', 'JAZZ'] })
})
