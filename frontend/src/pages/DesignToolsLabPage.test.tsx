import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, vi } from 'vitest'

import { DesignToolsLabPage } from './DesignToolsLabPage'

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }))
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
})

// cleanup() 은 vitest.setup.ts 의 afterEach 에 맡긴다 — after 훅은 역순이라 언마운트가 아래 두 정리 뒤로 간다.
// 언마운트 정리는 clearTimeout·cancelAnimationFrame·removeEventListener 뿐이라 실제 타이머로 돌아가도 안전하다.
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('Design Tools Lab logo replay', () => {
  it.each(['{Enter}', ' '])(
    'replays once through the native button keyboard action %j',
    async (key) => {
      vi.useRealTimers()
      window.sessionStorage.setItem(
        'bulleoyo:header-intro-document',
        String(window.performance.timeOrigin),
      )
      const user = userEvent.setup()
      render(
        <MemoryRouter>
          <DesignToolsLabPage />
        </MemoryRouter>,
      )
      const button = screen.getByRole('button', { name: '헤더 로고 전환해 보기' })
      const logo = within(button).getByRole('img', { name: '불러요' })
      const previousStates: (string | null)[] = []
      const observer = new MutationObserver((records) => {
        previousStates.push(...records.map((record) => record.oldValue))
      })
      observer.observe(logo, {
        attributes: true,
        attributeFilter: ['data-header-motion-state'],
        attributeOldValue: true,
      })
      try {
        button.focus()
        await user.keyboard(key)
        await waitFor(() => expect(logo).toHaveAttribute('data-header-motion-state', 'returning'))
        await waitFor(() => expect(logo).toHaveAttribute('data-header-motion-state', 'korean'), {
          timeout: 4000,
        })
        expect(button).toHaveFocus()
        expect(previousStates).toEqual(['complete', 'return-reset', 'returning'])
      } finally {
        observer.disconnect()
      }
    },
  )

  it.each(['button', 'svg'])(
    'runs one complete replay when activated through %s',
    async (activation) => {
      render(
        <MemoryRouter>
          <DesignToolsLabPage />
        </MemoryRouter>,
      )
      const button = screen.getByRole('button', { name: '헤더 로고 전환해 보기' })
      const logo = within(button).getByRole('img', { name: '불러요' })
      await act(() => vi.advanceTimersByTimeAsync(2400))
      expect(logo).toHaveAttribute('data-header-motion-state', 'complete')

      const previousStates: (string | null)[] = []
      const observer = new MutationObserver((records) => {
        previousStates.push(...records.map((record) => record.oldValue))
      })
      observer.observe(logo, {
        attributes: true,
        attributeFilter: ['data-header-motion-state'],
        attributeOldValue: true,
      })
      try {
        fireEvent.click(activation === 'button' ? button : logo)
        expect(logo).toHaveAttribute('data-header-motion-state', 'return-reset')
        await act(() => vi.advanceTimersByTimeAsync(20))
        expect(logo).toHaveAttribute('data-header-motion-state', 'returning')
        await act(() => vi.advanceTimersByTimeAsync(2600))
        expect(logo).toHaveAttribute('data-header-motion-state', 'returning')
        await act(() => vi.advanceTimersByTimeAsync(400))
        expect(logo).toHaveAttribute('data-header-motion-state', 'korean')
        expect(previousStates).toEqual(['complete', 'return-reset', 'returning'])
      } finally {
        observer.disconnect()
      }
    },
  )
})

describe('Design Tools Lab ticket states', () => {
  it('previews printing, fallback, and static collector ticket modes', () => {
    render(
      <MemoryRouter>
        <DesignToolsLabPage />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('ticket-reveal-stage')).toHaveAttribute(
      'data-reveal-state',
      'printing',
    )

    fireEvent.click(screen.getByRole('button', { name: '강제 폴백' }))
    expect(screen.getByTestId('ticket-reveal-stage')).toHaveAttribute(
      'data-reveal-state',
      'fallback',
    )
    expect(screen.getAllByRole('article')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: '정적 티켓' }))
    expect(screen.queryByTestId('ticket-reveal-stage')).not.toBeInTheDocument()
    expect(screen.getByTestId('concert-collector-ticket')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '실제 티켓 연출' }))
    expect(screen.getByTestId('ticket-reveal-stage')).toBeInTheDocument()
  })
})
