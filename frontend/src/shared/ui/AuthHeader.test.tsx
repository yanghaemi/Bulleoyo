import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

import type { SupportedLanguage } from '@/shared/i18n'

import { AuthHeader } from './AuthHeader'

describe('AuthHeader', () => {
  it('offers only the brand home link and language controls to unauthenticated users', () => {
    render(
      <MemoryRouter>
        <AuthHeader language="en" onLanguageChange={() => undefined} />
      </MemoryRouter>,
    )

    const header = within(screen.getByRole('banner'))
    expect(header.getByRole('link', { name: '불러요 홈' })).toHaveAttribute('href', '/')
    expect(header.getByRole('img', { name: '불러요' })).toBeInTheDocument()
    expect(header.queryByText('TICKR')).not.toBeInTheDocument()
    expect(header.getAllByRole('link')).toHaveLength(1)
    expect(header.getAllByRole('button')).toHaveLength(3)
    expect(header.getByRole('button', { name: 'Use light theme' })).toBeVisible()
    expect(header.getByRole('group', { name: 'Language' })).toBeInTheDocument()
    expect(header.queryByRole('navigation')).not.toBeInTheDocument()
    expect(header.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('respects the supplied home destination', () => {
    render(
      <MemoryRouter>
        <AuthHeader language="ko" onLanguageChange={() => undefined} homeTo="/performances" />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: '불러요 홈' })).toHaveAttribute('href', '/performances')
  })

  it('keeps language selection controlled and keyboard accessible', async () => {
    function ControlledHeader() {
      const [language, setLanguage] = useState<SupportedLanguage>('en')
      return <AuthHeader language={language} onLanguageChange={setLanguage} />
    }
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ControlledHeader />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true')
    screen.getByRole('button', { name: '한국어' }).focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: '한국어' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true')
  })
})
