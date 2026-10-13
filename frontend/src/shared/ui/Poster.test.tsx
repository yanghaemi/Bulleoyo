import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { Poster } from './Poster'

const mode = vi.hoisted(() => ({ isDemo: false }))
vi.mock('@/shared/config', () => mode)
beforeEach(() => {
  mode.isDemo = false
})

it.each(['7', '12', 'new-show'])(
  'never substitutes unrelated artwork for a live show %s',
  (seed) => {
    const { container } = render(<Poster seed={seed} label="Actual Local Show" />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.queryByText('Seoul Indie Night · vol.12')).not.toBeInTheDocument()
    expect(screen.getByText('AL')).toBeInTheDocument()
  },
)

it('falls back to actual-title initials after the API image fails and retries a changed URL', () => {
  const { container, rerender } = render(<Poster seed="12" label="Local Show" src="/actual.jpg" />)
  fireEvent.error(screen.getByRole('img'))
  expect(container.querySelector('img')).toBeNull()
  expect(screen.getByText('LS')).toBeInTheDocument()
  rerender(<Poster seed="12" label="Local Show" src="/updated.jpg" />)
  expect(screen.getByRole('img')).toHaveAttribute('src', '/updated.jpg')
})

it('retains fixture artwork in explicit demo mode', () => {
  mode.isDemo = true
  render(<Poster seed="7" label="Demo" />)
  expect(screen.getByText('Seoul Indie Night · vol.12')).toBeInTheDocument()
})

it('allows an isolated lab to opt in while continuing to prefer its supplied artwork', () => {
  const { rerender } = render(<Poster seed="7" label="Lab" allowDemoArtwork />)
  expect(screen.getByText('Seoul Indie Night · vol.12')).toBeInTheDocument()
  rerender(<Poster seed="7" label="Lab" allowDemoArtwork src="/lab-actual.jpg" />)
  expect(screen.getByRole('img')).toHaveAttribute('src', '/lab-actual.jpg')
  expect(screen.queryByText('Seoul Indie Night · vol.12')).not.toBeInTheDocument()
})
