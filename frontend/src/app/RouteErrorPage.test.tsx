import { render, screen } from '@testing-library/react'
import { afterEach } from 'vitest'

import { RouteErrorPage } from './RouteErrorPage'

afterEach(() => {
  document.documentElement.lang = ''
})

it('lazy route loading failure shows a safe English recovery screen', () => {
  document.documentElement.lang = 'en'
  render(<RouteErrorPage />)

  expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
  expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  expect(screen.queryByText(/문제가 생겼어요|새로고침/)).not.toBeInTheDocument()
  expect(screen.queryByText('private chunk detail')).not.toBeInTheDocument()
})

it('uses only Korean when the document language is Korean', () => {
  document.documentElement.lang = 'ko'
  render(<RouteErrorPage />)

  expect(screen.getByRole('alert')).toHaveTextContent('문제가 생겼어요')
  expect(screen.getByRole('button', { name: '새로고침' })).toBeInTheDocument()
  expect(screen.queryByText(/Something went wrong|Reload/)).not.toBeInTheDocument()
  expect(screen.queryByText(/RECOVERY/)).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: '홈으로' })).toHaveAttribute('href', '/')
})
