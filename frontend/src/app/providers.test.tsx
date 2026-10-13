import { act, render, screen } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { safeLoginReturnPath } from '@/features/member/loginNavigation'

import { AppProviders } from './providers'

const navigate = vi.hoisted(() => vi.fn())
const setUnauthenticatedHandler = vi.hoisted(() => vi.fn())

vi.mock('@/app/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: PropsWithChildren) => <>{children}</>,
}))
vi.mock('@/app/router', () => ({ router: { navigate } }))
vi.mock('@/shared/fx/AmbientBackdrop', () => ({ AmbientBackdrop: () => null }))
vi.mock('@/shared/fx/StageBloom', () => ({ StageBloom: () => null }))
vi.mock('@/shared/ui', () => ({ ToastHost: () => null }))
vi.mock('@/shared/i18n', () => ({ default: {} }))
vi.mock('@/shared/api/client', () => ({
  isApiError: () => false,
  setLanguageResolver: vi.fn(),
  setUnauthenticatedHandler,
  tokenStore: { clear: vi.fn() },
}))
vi.mock('react-i18next', () => ({
  I18nextProvider: ({ children }: PropsWithChildren) => <>{children}</>,
  useTranslation: () => ({ i18n: { language: 'en' } }),
}))
vi.mock('react-router', () => ({ RouterProvider: () => <div>router</div> }))
vi.mock('@/shared/blockchain/Web3AuthContext', () => ({
  Web3AuthProvider: ({ children }: PropsWithChildren) => (
    <div data-testid="web3auth-provider">{children}</div>
  ),
}))

describe('AppProviders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/')
  })

  it('mounts exactly one Web3AuthProvider around the routed app', () => {
    render(<AppProviders />)

    expect(screen.getAllByTestId('web3auth-provider')).toHaveLength(1)
    expect(screen.getByText('router')).toBeInTheDocument()
  })

  it('preserves pathname, search, and hash in a forced-logout return path', () => {
    window.history.replaceState({}, '', '/tickets?tab=mine#seat-a')
    render(<AppProviders />)
    const handler = setUnauthenticatedHandler.mock.calls[0]?.[0] as
      ((reason: 'REFRESH_FAILED') => void) | undefined

    expect(handler).toEqual(expect.any(Function))
    act(() => handler?.('REFRESH_FAILED'))

    expect(navigate).toHaveBeenCalledWith('/login?from=%2Ftickets%3Ftab%3Dmine%23seat-a')
    const loginTarget = navigate.mock.calls[0]?.[0] as string
    const from = new URL(loginTarget, window.location.origin).searchParams.get('from')
    expect(safeLoginReturnPath(from)).toBe('/tickets?tab=mine#seat-a')
  })
})
