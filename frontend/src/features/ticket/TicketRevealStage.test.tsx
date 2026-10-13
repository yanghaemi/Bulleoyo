import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TICKET_TIMING } from '@/shared/motion/motionTokens'
import { TicketRevealStage } from './TicketRevealStage'

interface MediaPreference extends MediaQueryList {
  setMatches: (matches: boolean) => void
}

function createMediaPreference(initialMatches = false): MediaPreference {
  let matches = initialMatches
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  return {
    get matches() {
      return matches
    },
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: vi.fn((_event, listener) => listeners.add(listener)),
    removeEventListener: vi.fn((_event, listener) => listeners.delete(listener)),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    setMatches(nextMatches: boolean) {
      matches = nextMatches
      const event = { matches, media: '(prefers-reduced-motion: reduce)' } as MediaQueryListEvent
      listeners.forEach((listener) => listener(event))
    },
  } as unknown as MediaPreference
}

let preference: MediaPreference
const revealStyles = readFileSync(
  resolve(process.cwd(), 'src/features/ticket/TicketRevealStage.css'),
  'utf8',
)

beforeEach(() => {
  vi.useFakeTimers()
  preference = createMediaPreference()
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => preference),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function mount(props: { forceFallback?: boolean } = {}) {
  return render(
    <TicketRevealStage forceFallback={props.forceFallback}>
      <article aria-label="발행된 티켓">Live ticket</article>
    </TicketRevealStage>,
  )
}

describe('TicketRevealStage', () => {
  it('prints the one real semantic ticket from a decorative printer slot', () => {
    mount()

    const printout = screen.getByTestId('ticket-reveal-printout')
    expect(within(printout).getByRole('article', { name: /발행된 티켓/ })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByTestId('ticket-reveal-printer')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByTestId('ticket-reveal-video')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ticket-reveal-rotor')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ticket-reveal-back')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ticket-reveal-atmosphere')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ticket-reveal-trails')).not.toBeInTheDocument()
  })

  it('moves from printing to a brief paper settle and then fixes the ticket in place', () => {
    mount()
    const stage = screen.getByTestId('ticket-reveal-stage')

    expect(stage).toHaveAttribute('data-reveal-state', 'printing')
    act(() => vi.advanceTimersByTime(TICKET_TIMING.printMs))
    expect(stage).toHaveAttribute('data-reveal-state', 'settling')
    act(() => vi.advanceTimersByTime(TICKET_TIMING.settleMs))
    expect(stage).toHaveAttribute('data-reveal-state', 'complete')
    expect(screen.getByText('Live ticket')).toBeVisible()
  })

  it('settles immediately when the printout animation completes', () => {
    mount()
    fireEvent.animationEnd(screen.getByTestId('ticket-reveal-printout'), {
      animationName: 'ticket-reveal-printout',
    })
    expect(screen.getByTestId('ticket-reveal-stage')).toHaveAttribute(
      'data-reveal-state',
      'complete',
    )
  })

  it('replays the same semantic ticket printing sequence', () => {
    mount()
    act(() => vi.advanceTimersByTime(TICKET_TIMING.totalMs))
    expect(screen.getByTestId('ticket-reveal-printout')).toHaveAttribute('data-replay-key', '0')

    fireEvent.click(screen.getByRole('button', { name: 'Replay ticket' }))

    expect(screen.getByTestId('ticket-reveal-stage')).toHaveAttribute(
      'data-reveal-state',
      'printing',
    )
    expect(screen.getByTestId('ticket-reveal-printout')).toHaveAttribute('data-replay-key', '1')
    expect(screen.getAllByRole('article')).toHaveLength(1)
  })

  it('does not replay merely because ticket data rerenders', () => {
    const view = mount()
    view.rerender(
      <TicketRevealStage>
        <article aria-label="발행된 티켓">Updated live ticket</article>
      </TicketRevealStage>,
    )

    expect(screen.getByTestId('ticket-reveal-printout')).toHaveAttribute('data-replay-key', '0')
    expect(screen.getByText('Updated live ticket')).toBeVisible()
  })

  it('uses an immediate static ticket and disables replay for reduced motion', () => {
    preference = createMediaPreference(true)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => preference),
    )
    mount()

    expect(screen.getByTestId('ticket-reveal-stage')).toHaveAttribute(
      'data-reveal-state',
      'reduced',
    )
    expect(screen.getByText('Live ticket')).toBeVisible()
    expect(screen.getByRole('button', { name: /disabled for reduced motion/ })).toBeDisabled()
  })

  it('switches immediately to reduced motion and clears both reveal timers', () => {
    const clearTimeout = vi.spyOn(window, 'clearTimeout')
    mount()

    act(() => preference.setMatches(true))

    expect(screen.getByTestId('ticket-reveal-stage')).toHaveAttribute(
      'data-reveal-state',
      'reduced',
    )
    expect(clearTimeout).toHaveBeenCalledTimes(2)
  })

  it('uses an immediate static lab fallback', () => {
    mount({ forceFallback: true })
    expect(screen.getByTestId('ticket-reveal-stage')).toHaveAttribute(
      'data-reveal-state',
      'fallback',
    )
    expect(screen.getByText('Live ticket')).toBeVisible()
    expect(screen.getByRole('button', { name: /disabled in static preview/ })).toBeDisabled()
  })

  it('cleans both reveal timers on unmount', () => {
    const clearTimeout = vi.spyOn(window, 'clearTimeout')
    const view = mount()
    view.unmount()
    expect(clearTimeout).toHaveBeenCalledTimes(2)
  })

  it('keeps only one short printout animation and static accessibility fallbacks', () => {
    expect(revealStyles.match(/@keyframes/g)).toHaveLength(1)
    expect(revealStyles).toMatch(/animation:\s*ticket-reveal-printout 1360ms/)
    expect(revealStyles).toMatch(
      /\.ticket-reveal-stage__printout\s*\{[^}]*transform:\s*translateY\(0\)/s,
    )
    expect(revealStyles).not.toMatch(
      /rotate[XYZ]?\(|perspective|trail|beam|landing-ring|gloss|spark/,
    )

    const mobileRules = revealStyles.slice(revealStyles.indexOf('@media (max-width: 63.999rem)'))
    expect(mobileRules).toMatch(
      /\.ticket-reveal-stage__printout\s*\{[^}]*animation:\s*none !important/s,
    )
    const reducedRules = revealStyles.slice(
      revealStyles.indexOf('@media (prefers-reduced-motion: reduce)'),
    )
    expect(reducedRules).toMatch(
      /\.ticket-reveal-stage__printout\s*\{[^}]*animation:\s*none !important/s,
    )
  })

  it('lets long ticket content determine the desktop viewport height', () => {
    const desktop = revealStyles.slice(0, revealStyles.indexOf('@media'))
    expect(desktop).not.toMatch(/aspect-ratio:/)
    expect(desktop).toMatch(/\.ticket-reveal-stage__printout\s*\{[^}]*position:\s*relative/s)
  })
})
