import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, currentTheme, initTheme, readTheme } from './theme'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})
afterEach(() => vi.restoreAllMocks())

describe('user light and dark theme', () => {
  it.each([null, 'team', 'meta', 'apple', 'invalid'])(
    'falls back to dark for an unsupported stored theme: %s',
    (old) => {
      if (old) localStorage.setItem('b204.theme.light-v1', old)
      initTheme()
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
      expect(currentTheme()).toBe('dark')
      expect(readTheme()).toBe('dark')
    },
  )

  it('restores an explicit dark choice before and after app startup', () => {
    applyTheme('dark')
    document.documentElement.removeAttribute('data-theme')
    initTheme()
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(readTheme()).toBe('dark')

    applyTheme('light')
    expect(document.documentElement).not.toHaveAttribute('data-theme')
    expect(currentTheme()).toBe('light')
  })

  it('uses dark when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => initTheme()).not.toThrow()
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })

  it.each([false, true])('first paint and hydrated theme agree when storage is blocked=%s', (blocked) => {
    localStorage.setItem('b204.theme.light-v1', 'dark')
    if (blocked) vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const html = readFileSync('index.html', 'utf8')
    const boot = new DOMParser().parseFromString(html, 'text/html').querySelector('script:not([src])')!
    // Execute the actual first-paint script rather than asserting its source spelling.
    new Function('document', 'localStorage', boot.textContent!)(document, localStorage)
    if (blocked) expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    else expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    initTheme()
    if (blocked) expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    else expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })
})
