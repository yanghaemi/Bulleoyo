import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, vi } from 'vitest'

import { LoginScreen } from '@/features/member/LoginScreen'

import { AppHeader } from './AppHeader'
import { AuthHeader } from './AuthHeader'

function Location() {
  return <output aria-label="current route">{useLocation().pathname}</output>
}

function setReducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches,
    media,
    addEventListener() {},
    removeEventListener() {},
  }))
}

beforeEach(() => {
  vi.useFakeTimers()
  setReducedMotion(false)
  sessionStorage.setItem('bulleoyo:header-intro-document', String(window.performance.timeOrigin))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function RouterFixture() {
  return (
    <>
      <Routes>
        <Route
          path="/login"
          element={
            <LoginScreen
              language="en"
              onLanguageChange={() => undefined}
              onSignIn={() => undefined}
            />
          }
        />
        <Route path="/" element={<AppHeader />} />
      </Routes>
      <Link to="/login">ordinary login</Link>
      <Link to="/">ordinary home</Link>
      <Location />
    </>
  )
}

describe('semantic brand home replay', () => {
  it('removes a pending replay left by a previous browser document', async () => {
    sessionStorage.setItem(
      'bulleoyo:header-pending-replay',
      JSON.stringify({ documentId: 'previous-document', target: '/' }),
    )

    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    )
    await act(() => vi.advanceTimersByTimeAsync(20))

    expect(sessionStorage.getItem('bulleoyo:header-pending-replay')).toBeNull()
  })

  it.each(['document', 'target'] as const)(
    'ignores a pending replay for another %s',
    async (mismatch) => {
      sessionStorage.setItem(
        'bulleoyo:header-pending-replay',
        JSON.stringify({
          documentId:
            mismatch === 'document' ? 'previous-document' : String(window.performance.timeOrigin),
          target: mismatch === 'target' ? '/other' : '/',
        }),
      )
      render(
        <MemoryRouter>
          <AppHeader />
        </MemoryRouter>,
      )
      await act(() => vi.advanceTimersByTimeAsync(20))
      for (const logo of screen.getAllByRole('img', { name: '불러요' })) {
        expect(logo).toHaveAttribute('data-header-motion-state', 'complete')
      }
    },
  )

  it.each(['auth', 'app'] as const)(
    'runs the next logo story once from native Enter on the %s home link',
    async (header) => {
      vi.useRealTimers()
      sessionStorage.setItem(
        'bulleoyo:header-intro-document',
        String(window.performance.timeOrigin),
      )
      const user = userEvent.setup()
      render(
        <MemoryRouter>
          <>
            {header === 'auth' ? (
              <AuthHeader language="en" onLanguageChange={() => undefined} />
            ) : (
              <AppHeader />
            )}
          </>
        </MemoryRouter>,
      )
      const link = screen.getAllByRole('link', { name: /^불러요(?: 홈)?$/ })[0]
      const logo = within(link).getByRole('img', { name: '불러요' })
      expect(logo).toHaveAttribute('data-header-motion-state', 'complete')
      link.focus()
      await user.keyboard('{Enter}')
      await waitFor(() => expect(logo).toHaveAttribute('data-header-motion-state', 'returning'))
      await waitFor(() => expect(logo).toHaveAttribute('data-header-motion-state', 'korean'), {
        timeout: 4000,
      })
      expect(link).toHaveFocus()
    },
  )

  it.each(['link', 'svg'] as const)(
    'transitions mounted responsive logos once from %s activation',
    async (activation) => {
      render(
        <MemoryRouter>
          <AppHeader />
        </MemoryRouter>,
      )
      const link = screen.getAllByRole('link', { name: '불러요' })[0]
      const logos = screen.getAllByRole('img', { name: '불러요' })
      const states: (string | null)[] = []
      const observer = new MutationObserver((records) =>
        states.push(...records.map((record) => record.oldValue)),
      )
      observer.observe(logos[0], {
        attributes: true,
        attributeFilter: ['data-header-motion-state'],
        attributeOldValue: true,
      })
      try {
        // Targeting the anchor itself reproduces its padding, not the child SVG.
        fireEvent.click(activation === 'link' ? link : logos[0])
        await act(() => vi.advanceTimersByTimeAsync(20))
        for (const logo of logos)
          expect(logo).toHaveAttribute('data-header-motion-state', 'returning')
        await act(() => vi.advanceTimersByTimeAsync(3000))
        for (const logo of logos)
          expect(logo).toHaveAttribute('data-header-motion-state', 'korean')
        expect(states).toEqual(['complete', 'return-reset', 'returning'])
      } finally {
        observer.disconnect()
      }
    },
  )

  it.each(['Enter', 'link', 'svg'] as const)(
    'carries the %s logo transition from the real login screen into the replacement home header once',
    async (activation) => {
      if (activation === 'Enter') vi.useRealTimers()
      sessionStorage.setItem(
        'bulleoyo:header-intro-document',
        String(window.performance.timeOrigin),
      )
      const user = userEvent.setup()
      render(
        <StrictMode>
          <MemoryRouter initialEntries={['/login']}>
            <RouterFixture />
          </MemoryRouter>
        </StrictMode>,
      )
      const link = screen.getByRole('link', { name: '불러요 홈' })
      const outgoing = within(link).getByRole('img', { name: '불러요' })
      if (activation === 'Enter') {
        link.focus()
        await user.keyboard('{Enter}')
      } else {
        fireEvent.click(activation === 'link' ? link : outgoing)
      }
      expect(screen.getByRole('status', { name: 'current route' })).toHaveTextContent(/^\/$/)
      expect(outgoing).not.toBeInTheDocument()
      const incoming = screen.getAllByRole('img', { name: '불러요' })
      if (activation === 'Enter') {
        await waitFor(() => {
          for (const logo of incoming)
            expect(logo).toHaveAttribute('data-header-motion-state', 'returning')
        })
        await waitFor(
          () => {
            for (const logo of incoming)
              expect(logo).toHaveAttribute('data-header-motion-state', 'korean')
          },
          { timeout: 4000 },
        )
      } else {
        await act(() => vi.advanceTimersByTimeAsync(20))
        for (const logo of incoming)
          expect(logo).toHaveAttribute('data-header-motion-state', 'returning')
        await act(() => vi.advanceTimersByTimeAsync(2600))
        for (const logo of incoming)
          expect(logo).toHaveAttribute('data-header-motion-state', 'returning')
        await act(() => vi.advanceTimersByTimeAsync(400))
        for (const logo of incoming)
          expect(logo).toHaveAttribute('data-header-motion-state', 'korean')
      }

      fireEvent.click(screen.getByRole('link', { name: 'ordinary login' }))
      fireEvent.click(screen.getByRole('link', { name: 'ordinary home' }))
      if (activation !== 'Enter') await act(() => vi.advanceTimersByTimeAsync(20))
      for (const logo of screen.getAllByRole('img', { name: '불러요' })) {
        expect(logo).toHaveAttribute('data-header-motion-state', 'korean')
      }
    },
  )

  it('consumes a navigation replay when AppHeader stays mounted across routes', async () => {
    render(
      <MemoryRouter initialEntries={['/tickets']}>
        <AppHeader />
        <Location />
      </MemoryRouter>,
    )
    const logos = screen.getAllByRole('img', { name: '불러요' })
    fireEvent.click(screen.getAllByRole('link', { name: '불러요' })[0])
    expect(screen.getByRole('status', { name: 'current route' })).toHaveTextContent(/^\/$/)
    await act(() => vi.advanceTimersByTimeAsync(20))
    expect(screen.getAllByRole('img', { name: '불러요' })[0]).toBe(logos[0])
    for (const logo of logos)
      expect(logo).toHaveAttribute('data-header-motion-state', 'returning')
  })

  it('keeps reduced-motion navigation final and does not leave a replay for later remounts', async () => {
    setReducedMotion(true)
    render(
      <MemoryRouter initialEntries={['/login']}>
        <RouterFixture />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('link', { name: '불러요 홈' }))
    await act(() => vi.advanceTimersByTimeAsync(20))
    for (const logo of screen.getAllByRole('img', { name: '불러요' })) {
      expect(logo).toHaveAttribute('data-header-motion-state', 'complete')
    }
    fireEvent.click(screen.getByRole('link', { name: 'ordinary login' }))
    setReducedMotion(false)
    fireEvent.click(screen.getByRole('link', { name: 'ordinary home' }))
    await act(() => vi.advanceTimersByTimeAsync(20))
    for (const logo of screen.getAllByRole('img', { name: '불러요' })) {
      expect(logo).toHaveAttribute('data-header-motion-state', 'complete')
    }
  })
})
