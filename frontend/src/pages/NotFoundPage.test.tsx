import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

import { NotFoundPage } from './NotFoundPage'

vi.mock('@/shared/i18n/useLocale', () => ({
  useLocale: () => ({ language: 'en', text: (_ko: string, en: string) => en }),
}))

it('renders the recovery page in only the selected language', () => {
  render(
    <MemoryRouter>
      <NotFoundPage />
    </MemoryRouter>,
  )

  expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Go home' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument()
  expect(screen.queryByText(/찾는 페이지|홈으로|이전 화면/)).not.toBeInTheDocument()
})
