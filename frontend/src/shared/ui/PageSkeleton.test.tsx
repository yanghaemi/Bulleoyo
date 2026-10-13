import { act, render, screen } from '@testing-library/react'
import i18n from '@/shared/i18n'
import { PageSkeleton } from './PageSkeleton'

it('announces one localized loading message and hides decorative placeholders', async () => {
  await i18n.changeLanguage('en')
  render(<PageSkeleton variant="tickets" />)
  expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
  expect(screen.getByRole('status')).toHaveTextContent('Loading this page')
  expect(screen.getByRole('status').querySelector('[aria-hidden="true"]')).toBeInTheDocument()
  await act(async () => {
    await i18n.changeLanguage('ko')
  })
  expect(screen.getByRole('status')).toHaveTextContent('화면을 불러오고 있어요')
  expect(screen.getByRole('status')).not.toHaveTextContent('Loading this page')
  await act(async () => {
    await i18n.changeLanguage('en')
  })
})
