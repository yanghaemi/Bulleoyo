import { act, fireEvent, render, screen } from '@testing-library/react'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Link, MemoryRouter, useLocation } from 'react-router'
import { afterEach, vi } from 'vitest'

import { AppHeader } from './AppHeader'
import { AnimatedBrandLogo } from './AnimatedBrandLogo'
import { BrandLoader } from './BrandLoader'

const brandStyles = readFileSync(resolve(process.cwd(), 'src/styles/fx-brand.css'), 'utf8')

function setReducedMotion(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? reduced : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

afterEach(() => {
  setReducedMotion(false)
  vi.useRealTimers()
})

describe('AnimatedBrandLogo', () => {
  it('rolls the O into place before the Korean stand changes into Y', () => {
    expect(brandStyles).toMatch(
      /@keyframes fx-brand-header-object\s*\{[\s\S]*?58\.333%,\s*100%\s*\{[^}]*translate\(var\(--brand-head-end-x\), var\(--brand-head-end-y\)\)/,
    )
    expect(brandStyles).toMatch(
      /@keyframes fx-brand-header-stand\s*\{\s*0%,\s*58\.333%\s*\{[^}]*opacity:\s*1/,
    )
    expect(brandStyles).toMatch(
      /@keyframes fx-brand-header-y\s*\{\s*0%,\s*58\.333%\s*\{[^}]*opacity:\s*0[\s\S]*?70\.833%,\s*100%\s*\{[^}]*opacity:\s*1/,
    )
  })

  it('alternates a forward story and a dedicated return story with one morphing object', () => {
    vi.useFakeTimers()
    setReducedMotion(false)
    window.sessionStorage.setItem(
      'bulleoyo:header-intro-document',
      String(window.performance.timeOrigin),
    )
    const { container } = render(<AnimatedBrandLogo mode="header" height={26} />)
    const logo = screen.getByRole('img', { name: '불러요' })

    expect(logo).toHaveAttribute('data-brand-form', 'english')
    expect(container.querySelectorAll('[data-part="morph-object"]')).toHaveLength(1)
    expect(container.querySelector('[data-part="mic-head"]')).not.toBeInTheDocument()
    expect(container.querySelector('[data-part="mic-o"]')).not.toBeInTheDocument()

    fireEvent.click(logo)
    expect(logo).toHaveAttribute('data-header-motion-state', 'return-reset')
    act(() => vi.advanceTimersByTime(20))
    expect(logo).toHaveAttribute('data-header-motion-state', 'returning')
    act(() => vi.advanceTimersByTime(3_000))
    expect(logo).toHaveAttribute('data-header-motion-state', 'korean')
    expect(logo).toHaveAttribute('data-brand-form', 'korean')

    fireEvent.click(logo)
    expect(logo).toHaveAttribute('data-header-motion-state', 'reset')
    act(() => vi.advanceTimersByTime(20))
    expect(logo).toHaveAttribute('data-header-motion-state', 'intro')
    act(() => vi.advanceTimersByTime(2_400))
    expect(logo).toHaveAttribute('data-header-motion-state', 'complete')
    expect(logo).toHaveAttribute('data-brand-form', 'english')
  })

  it('replays only changed explicit signals and ignores them under reduced motion', () => {
    vi.useFakeTimers()
    setReducedMotion(false)
    window.sessionStorage.setItem(
      'bulleoyo:header-intro-document',
      String(window.performance.timeOrigin),
    )
    const view = render(<AnimatedBrandLogo mode="header" replayKey={0} />)
    const logo = screen.getByRole('img', { name: '불러요' })
    expect(logo).toHaveAttribute('data-header-motion-state', 'complete')
    view.rerender(<AnimatedBrandLogo mode="header" replayKey={1} />)
    expect(logo).toHaveAttribute('data-header-motion-state', 'return-reset')
    act(() => vi.advanceTimersByTime(20))
    expect(logo).toHaveAttribute('data-header-motion-state', 'returning')
    act(() => vi.advanceTimersByTime(3000))
    expect(logo).toHaveAttribute('data-header-motion-state', 'korean')
    view.rerender(<AnimatedBrandLogo mode="header" replayKey={1} height={40} />)
    expect(logo).toHaveAttribute('data-header-motion-state', 'korean')
    view.unmount()

    setReducedMotion(true)
    const reducedView = render(<AnimatedBrandLogo mode="header" replayKey={0} />)
    reducedView.rerender(<AnimatedBrandLogo mode="header" replayKey={1} />)
    expect(screen.getByRole('img', { name: '불러요' })).toHaveAttribute(
      'data-header-motion-state',
      'complete',
    )
  })

  it('reproduces finite checked-in outlines with the build-time generator', () => {
    const generated = JSON.parse(
      execFileSync(process.execPath, ['scripts/generate-brand-wordmark.mjs', '--json'], {
        encoding: 'utf8',
      }),
    ) as { outlines: Record<string, string> }
    const { container } = render(<AnimatedBrandLogo mode="static" />)

    for (const [name, part] of [
      ['BULLEO_PATH', 'english-word'],
      ['MIC_Y_PATH', 'mic-y'],
    ]) {
      expect(generated.outlines[name]).toMatch(/^[MLQCZ\d.,\s-]+$/)
      expect(container.querySelector(`path[data-part="${part}"]`)).toHaveAttribute(
        'd',
        generated.outlines[name],
      )
    }
  })

  it('uses fixed path geometry for every visible wordmark', () => {
    const { container } = render(<AnimatedBrandLogo mode="static" height={26} />)

    expect(container.querySelector('text')).not.toBeInTheDocument()
    expect(container.querySelector('path[data-part="english-word"]')).toHaveAttribute('d')
    expect(container.querySelector('svg')).toHaveAttribute('data-logo-geometry', 'normalized-v2')
  })

  it('falls back to normal motion when matchMedia is unavailable', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: undefined,
    })

    render(<AnimatedBrandLogo mode="header" height={26} />)

    expect(screen.getByRole('img', { name: '불러요' })).toHaveAttribute(
      'data-reduced-motion',
      'false',
    )
  })

  it('exposes stable animation groups for the header interaction', () => {
    setReducedMotion(false)
    const { container } = render(<AnimatedBrandLogo mode="header" height={26} />)

    expect(screen.getByRole('img', { name: '불러요' })).toHaveAttribute(
      'data-motion-mode',
      'header',
    )
    expect(screen.getByRole('img', { name: '불러요' })).toHaveAttribute(
      'data-logo-variant',
      'variant-a-merged-stem',
    )
    expect(container.querySelector('[data-part="ko-word"]')?.tagName).toBe('path')
    expect(container.querySelector('[data-part="morph-object"]')).toBeInTheDocument()
    expect(container.querySelector('[data-part="mic-head"]')).not.toBeInTheDocument()
    expect(container.querySelector('[data-part="mic-o"]')).not.toBeInTheDocument()
    expect(container.querySelector('[data-part="english-word"]')).toBeInTheDocument()
  })

  it('uses one transforming object while the Korean and English prefixes crossfade', () => {
    setReducedMotion(false)
    const { container } = render(<AnimatedBrandLogo mode="loader" height={72} />)

    const koreanPrefix = container.querySelector('[data-part="ko-lockup"]')
    const englishPrefix = container.querySelector('[data-part="english-word"]')
    const micY = container.querySelector<SVGPathElement>('[data-part="mic-y"]')
    const morphObject = container.querySelector<SVGGElement>('[data-part="morph-object"]')

    expect(koreanPrefix).toBeInTheDocument()
    expect(englishPrefix?.tagName).toBe('path')
    expect(englishPrefix).toHaveAttribute('d')
    expect(micY).toBeInTheDocument()
    expect(morphObject).toBeInTheDocument()
    expect(container.querySelector('[data-part="mic-o"]')).not.toBeInTheDocument()
    expect(koreanPrefix).not.toContainElement(micY)
    expect(koreanPrefix).not.toContainElement(morphObject)
    expect(screen.getByRole('img', { name: '불러요' })).toHaveAttribute(
      'data-motion-duration',
      '2400',
    )
  })

  it('autoplays once per document load and keeps SPA remounts on the final mark', () => {
    vi.useFakeTimers()
    setReducedMotion(false)
    window.sessionStorage.setItem('bulleoyo:header-intro-document', 'previous-document')

    const first = render(<AnimatedBrandLogo mode="header" height={26} />)
    expect(screen.getByRole('img', { name: '불러요' })).toHaveAttribute(
      'data-header-motion-state',
      'intro',
    )
    expect(window.sessionStorage.getItem('bulleoyo:header-intro-document')).toBe(
      String(window.performance.timeOrigin),
    )

    act(() => vi.advanceTimersByTime(2_400))
    expect(screen.getByRole('img', { name: '불러요' })).toHaveAttribute(
      'data-header-motion-state',
      'complete',
    )

    first.unmount()
    render(<AnimatedBrandLogo mode="header" height={26} />)
    expect(screen.getByRole('img', { name: '불러요' })).toHaveAttribute(
      'data-header-motion-state',
      'complete',
    )
  })

  it('starts the dedicated return story when the completed English logo is clicked', () => {
    vi.useFakeTimers()
    setReducedMotion(false)

    render(<AnimatedBrandLogo mode="header" height={26} />)
    act(() => vi.advanceTimersByTime(2_400))

    const logo = screen.getByRole('img', { name: '불러요' })
    expect(logo).toHaveAttribute('data-header-motion-state', 'complete')

    fireEvent.click(logo)
    expect(logo).toHaveAttribute('data-header-motion-state', 'return-reset')
    act(() => vi.advanceTimersByTime(20))
    expect(logo).toHaveAttribute('data-header-motion-state', 'returning')
  })

  it('ignores a competing click while one continuous morph is still running', () => {
    vi.useFakeTimers()
    setReducedMotion(false)
    render(<AnimatedBrandLogo mode="header" />)
    const logo = screen.getByRole('img', { name: '불러요' })

    act(() => vi.advanceTimersByTime(1_000))
    fireEvent.click(logo)
    act(() => vi.advanceTimersByTime(20))
    act(() => vi.advanceTimersByTime(1_400))
    expect(logo).toHaveAttribute('data-header-motion-state', 'complete')
  })

  it('allows the containing home link to navigate when replay is clicked', () => {
    function Location() {
      return <output>{useLocation().pathname}</output>
    }
    const { container } = render(
      <MemoryRouter initialEntries={['/login']}>
        <Link to="/">
          <AnimatedBrandLogo mode="header" />
        </Link>
        <Location />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('img', { name: '불러요' }))
    expect(container.querySelector('output')).toHaveTextContent(/^\/$/)
  })

  it('immediately completes and skips click replay with reduced motion', () => {
    vi.useFakeTimers()
    setReducedMotion(true)
    render(<AnimatedBrandLogo mode="header" />)
    const logo = screen.getByRole('img', { name: '불러요' })
    expect(logo).toHaveAttribute('data-header-motion-state', 'complete')
    fireEvent.click(logo)
    act(() => vi.advanceTimersByTime(20))
    expect(logo).toHaveAttribute('data-header-motion-state', 'complete')
  })

  it('marks the loader as static when reduced motion is requested', () => {
    setReducedMotion(true)
    render(<AnimatedBrandLogo mode="loader" height={72} />)

    expect(screen.getByRole('img', { name: '불러요' })).toHaveAttribute(
      'data-reduced-motion',
      'true',
    )
  })
})

describe('BrandLoader', () => {
  it('announces loading without hiding the brand artwork', () => {
    setReducedMotion(false)
    render(<BrandLoader label="공연을 불러오는 중" />)

    expect(screen.getByRole('status')).toHaveTextContent('공연을 불러오는 중')
    expect(screen.getByRole('img', { name: '불러요' })).toBeInTheDocument()
  })
})

describe('AppHeader brand', () => {
  it('uses one shared responsive logo with the short header motion variant', () => {
    setReducedMotion(false)
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    )

    const logos = screen.getAllByRole('img', { name: '불러요' })
    expect(logos).toHaveLength(1)
    for (const logo of logos) expect(logo).toHaveAttribute('data-motion-mode', 'header')
  })
})
