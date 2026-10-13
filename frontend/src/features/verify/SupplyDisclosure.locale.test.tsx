import { render, screen } from '@testing-library/react'

import { SupplyDisclosure } from './SupplyDisclosure'

vi.mock('@/shared/i18n/useLocale', () => ({
  useLocale: () => ({ language: 'en', text: (_ko: string, en: string) => en }),
}))

it('keeps the unavailable public disclosure state in the selected language', () => {
  render(<SupplyDisclosure errorCode="COMMON_INTERNAL_ERROR" />)

  expect(screen.getByRole('alert')).toHaveTextContent('Could not load the disclosure')
  expect(document.body.textContent).not.toMatch(/[가-힣]/)
})
