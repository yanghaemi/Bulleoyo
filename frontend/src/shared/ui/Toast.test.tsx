import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import i18n from '@/shared/i18n'
import { Toast } from './Toast'

afterEach(async () => { await act(() => i18n.changeLanguage('en')) })

it.each([['en', 'Dismiss notification'], ['ko', '알림 닫기']])('dismisses in the selected locale %s', async (lang, name) => {
  await act(() => i18n.changeLanguage(lang))
  const dismiss = vi.fn()
  render(<Toast title="Saved" message="Details remain available" onDismiss={dismiss} />)
  expect(screen.getByRole('status')).toHaveTextContent('Details remain available')
  fireEvent.click(screen.getByRole('button', { name }))
  expect(dismiss).toHaveBeenCalledOnce()
})
