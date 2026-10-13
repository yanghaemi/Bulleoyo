import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

import { AdminShell } from './AdminShell'

vi.mock('@/shared/i18n/useLocale', () => ({
  useLocale: () => ({ language: 'en', text: (_ko: string, en: string) => en }),
}))

it('keeps the administration chrome in the selected language', () => {
  render(
    <MemoryRouter initialEntries={['/admin/disputes']}>
      <AdminShell title="Dispute review">
        <p>Workbench</p>
      </AdminShell>
    </MemoryRouter>,
  )

  expect(screen.getAllByRole('navigation', { name: 'Admin navigation' })).toHaveLength(2)
  expect(screen.getAllByRole('link', { name: 'Disputes' }).length).toBeGreaterThan(0)
  expect(document.body.textContent).not.toMatch(/[가-힣]/)
})
