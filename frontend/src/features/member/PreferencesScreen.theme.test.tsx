import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, it, vi } from 'vitest'
import { PreferencesScreen } from './PreferencesScreen'
import { applyTheme, currentTheme } from '@/shared/theme'

it('테마는 설정에서 즉시 바꾸되 회원 저장 요청에는 섞지 않는다', () => {
  applyTheme('dark')
  const onChange = vi.fn()
  render(
    <MemoryRouter>
      <PreferencesScreen
        values={{
          locale: 'en',
          displayCurrency: 'USD',
          timezone: 'Asia/Seoul',
          preferredGenres: [],
        }}
        onChange={onChange}
        onSave={vi.fn()}
        onRetryRates={vi.fn()}
      />
    </MemoryRouter>,
  )
  fireEvent.click(
    within(screen.getByRole('region', { name: 'Adjust preferences' })).getByRole('button', {
      name: 'Use light theme',
    }),
  )
  expect(currentTheme()).toBe('light')
  expect(onChange).not.toHaveBeenCalled()
  applyTheme('dark')
})
