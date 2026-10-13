import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import i18n, { readLanguage, setAppLanguage } from './index'
import { useLocale } from './useLocale'
import { LanguageSwitch } from '@/shared/ui/LanguageSwitch'

function Example() {
  const { text } = useLocale()
  return (
    <>
      <LanguageSwitch />
      <h1>{text('공연 둘러보기', 'Discover shows')}</h1>
    </>
  )
}

afterEach(async () => {
  cleanup()
  localStorage.removeItem('b204.locale')
  await act(() => i18n.changeLanguage('en'))
})

describe('selected language', () => {
  it('switches visible copy without bilingual duplication and remembers the choice', async () => {
    render(<Example />)
    fireEvent.click(screen.getByRole('button', { name: '한국어' }))
    await waitFor(() => expect(screen.getByRole('heading')).toHaveTextContent('공연 둘러보기'))
    expect(screen.queryByText('Discover shows')).not.toBeInTheDocument()
    expect(readLanguage()).toBe('ko')
    expect(document.documentElement.lang).toBe('ko')
    fireEvent.click(screen.getByRole('button', { name: 'EN' }))
    await waitFor(() => expect(screen.getByRole('heading')).toHaveTextContent('Discover shows'))
    expect(screen.queryByText('공연 둘러보기')).not.toBeInTheDocument()
    expect(readLanguage()).toBe('en')
  })
  it('falls back for an unsupported persisted locale', () => {
    localStorage.setItem('b204.locale', 'invalid')
    expect(readLanguage()).toBe('en')
    setAppLanguage('ko')
    expect(localStorage.getItem('b204.locale')).toBe('ko')
  })
})
