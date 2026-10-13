import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it } from 'vitest'

import i18n from '@/shared/i18n'
import { initTheme } from '@/shared/theme'
import { ThemeSwitch } from './ThemeSwitch'

beforeEach(async () => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  initTheme()
  await act(async () => {
    await i18n.changeLanguage('ko')
  })
})

it('라이트와 다크만 한 버튼으로 전환하고 선택을 저장한다', async () => {
  const user = userEvent.setup()
  render(<ThemeSwitch />)

  expect(screen.queryByText('Meta')).not.toBeInTheDocument()
  expect(screen.queryByText('Apple')).not.toBeInTheDocument()

  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  expect(screen.getByRole('button', { name: '라이트 테마 사용' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await user.click(screen.getByRole('button', { name: '라이트 테마 사용' }))
  expect(document.documentElement).not.toHaveAttribute('data-theme')
  expect(localStorage.getItem('b204.theme.light-v1')).toBe('light')

  await user.click(screen.getByRole('button', { name: '다크 테마 사용' }))
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  expect(localStorage.getItem('b204.theme.light-v1')).toBe('dark')
})
