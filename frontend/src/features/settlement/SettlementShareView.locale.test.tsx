import { render, screen } from '@testing-library/react'

import { SettlementShareView } from './SettlementShareView'

vi.mock('@/shared/i18n/useLocale', () => ({
  useLocale: () => ({ language: 'en', text: (_ko: string, en: string) => en }),
}))

it('keeps unavailable public evidence token-safe and in the selected language', () => {
  render(<SettlementShareView error={{ code: 'COMMON_NOT_FOUND' }} />)

  expect(screen.getByRole('alert')).toHaveTextContent('This settlement report is unavailable')
  expect(screen.getByText('BULLEOYO settlement report')).toBeInTheDocument()
  expect(document.body.textContent).not.toMatch(/[가-힣]/)
})
