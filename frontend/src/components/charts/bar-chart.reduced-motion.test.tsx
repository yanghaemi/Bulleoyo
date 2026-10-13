import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Bar } from './bar'
import { BarChart } from './bar-chart'
import { BarColumnTrack, BarSquares } from './bar-squares'

const motionPreference = vi.hoisted(() => ({ reduced: false }))

vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  motion: {
    rect: ({ animate: _animate, initial: _initial, transition: _transition, ...props }: Record<string, unknown>) => (
      <rect data-motion-rect="true" {...props} />
    ),
  },
  useReducedMotion: () => motionPreference.reduced,
}))

vi.mock('@visx/responsive', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => React.ReactNode }) =>
    children({ width: 400, height: 240 }),
}))

beforeEach(() => {
  motionPreference.reduced = false
})

describe('BarChart reduced motion', () => {
  it('starts at rest instead of entering a reveal phase when reduced motion is requested', () => {
    motionPreference.reduced = true
    const onPhaseChange = vi.fn()

    render(
      <BarChart data={[{ name: 'A', amount: 10 }]} onPhaseChange={onPhaseChange}>
        <Bar dataKey="amount" />
      </BarChart>,
    )

    expect(onPhaseChange).toHaveBeenCalledWith('ready')
    expect(onPhaseChange).not.toHaveBeenCalledWith('revealing')
  })

  it('treats an explicit zero duration as an instant chart', () => {
    const onPhaseChange = vi.fn()

    render(
      <BarChart
        animationDuration={0}
        data={[{ name: 'A', amount: 10 }]}
        onPhaseChange={onPhaseChange}
      >
        <Bar dataKey="amount" />
      </BarChart>,
    )

    expect(onPhaseChange).toHaveBeenCalledWith('ready')
    expect(onPhaseChange).not.toHaveBeenCalledWith('revealing')
  })

  it.each([
    ['reduced motion', true, undefined],
    ['zero duration', false, 0],
  ] as const)('renders square bars and their tracks statically for %s', (_label, reduced, duration) => {
    motionPreference.reduced = reduced

    const view = render(
      <BarChart
        animationDuration={duration}
        data={[{ name: 'A', amount: 10 }]}
      >
        <BarColumnTrack />
        <BarSquares dataKey="amount" />
      </BarChart>,
    )

    expect(view.container.querySelector('[data-motion-rect="true"]')).not.toBeInTheDocument()
  })
})
