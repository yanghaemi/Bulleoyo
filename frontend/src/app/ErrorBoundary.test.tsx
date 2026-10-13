import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import { ErrorBoundary } from './ErrorBoundary'

vi.mock('@/shared/config', () => ({ isDev: false }))

function BrokenView(): never {
  throw new Error('private render detail')
}

it('renders a provider-independent single-language recovery screen', () => {
  document.documentElement.lang = 'en'
  const reactError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

  render(
    <ErrorBoundary>
      <BrokenView />
    </ErrorBoundary>,
  )

  expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  expect(screen.queryAllByText(/APP RECOVERY|safely/)).toHaveLength(0)
  expect(screen.getByText(/check your progress after reloading/i)).toBeInTheDocument()
  expect(screen.queryByText(/문제가 생겼어요|새로고침|private render detail/)).not.toBeInTheDocument()
  reactError.mockRestore()
})
