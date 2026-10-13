import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

import { EntryStatus } from './EntryStatus'

vi.mock('@/shared/i18n/useLocale', () => ({
  useLocale: () => ({ language: 'en', text: (_ko: string, en: string) => en }),
}))

it('names the summary in English and keeps a partial ledger distinct from the total', () => {
  render(
    <MemoryRouter>
      <EntryStatus
        title="Night shift"
        data={{
          summary: { enteredCount: 8, totalIssuedCount: 20, duplicateAttemptCount: 1 },
          items: [{ entryLogId: 1, ticketId: 41, result: 'SUCCESS' }],
          pageInfo: { page: 0, size: 1, totalElements: 12, hasNext: true },
        }}
      />
    </MemoryRouter>,
  )

  expect(screen.getByRole('region', { name: 'Entry summary' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Entry activity', level: 2 })).toBeVisible()
  expect(screen.getByText('Showing 1 · total 12')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /more/i })).not.toBeInTheDocument()
})

it('keeps the protected ledger failure state in the selected language', () => {
  render(
    <MemoryRouter>
      <EntryStatus title="Night shift" errorCode="COMMON_FORBIDDEN" scanTo="/scan/link" />
    </MemoryRouter>,
  )

  expect(screen.getByRole('alert')).toHaveTextContent('Could not load entry activity')
  expect(screen.getAllByRole('link', { name: 'Back to scanner' })).toHaveLength(2)
  for (const link of screen.getAllByRole('link', { name: 'Back to scanner' })) {
    expect(link).toHaveAttribute('href', '/scan/link')
  }
  expect(document.body.textContent).not.toMatch(/[가-힣]/)
})
