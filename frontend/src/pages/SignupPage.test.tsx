import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SignupPage } from './SignupPage'

const navigate = vi.hoisted(() => vi.fn())
const route = vi.hoisted(() => ({ state: null as unknown }))
const toast = vi.hoisted(() => vi.fn())

vi.mock('react-router', () => ({
  useLocation: () => route,
  useNavigate: () => navigate,
}))

vi.mock('@/shared/config', () => ({ isDev: false }))
vi.mock('@/shared/i18n/useLocale', () => ({
  useLocale: () => ({ language: 'en', text: (_ko: string, en: string) => en }),
}))
vi.mock('@/shared/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/ui')>()),
  toast,
}))
vi.mock('@/features/member/localeOptions', () => ({ browserTimezone: () => 'Asia/Seoul' }))
vi.mock('@/shared/queries/member', () => ({
  useMyMember: () => ({ data: undefined }),
  useUpdateMyMember: () => ({
    isPending: false,
    error: null,
    mutate: (_values: unknown, options?: { onSuccess?: () => void }) => options?.onSuccess?.(),
  }),
}))
vi.mock('@/features/member/SignupScreen', () => ({
  SignupScreen: ({ onSubmit }: { onSubmit: () => void }) => (
    <button onClick={onSubmit}>Save profile</button>
  ),
}))

describe('SignupPage login continuation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    route.state = null
  })

  it('returns to the validated pre-login route after signup', () => {
    route.state = { isNewMember: true, from: '/tickets?tab=mine' }
    render(<SignupPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    expect(toast).toHaveBeenCalledWith({ title: 'Saved', tone: 'success' })
    expect(navigate).toHaveBeenCalledWith('/tickets?tab=mine', { replace: true })
  })

  it('falls back home when router state contains an external target', () => {
    route.state = { isNewMember: true, from: 'https://evil.example' }
    render(<SignupPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    expect(navigate).toHaveBeenCalledWith('/', { replace: true })
  })
})
