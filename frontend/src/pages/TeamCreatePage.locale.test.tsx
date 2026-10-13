import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'

import i18n from '@/shared/i18n'
import { TeamCreatePage } from './TeamCreatePage'

vi.mock('@/shared/queries/wallet', () => ({
  useMyWallet: () => ({ data: undefined, error: null, isPending: false }),
}))

vi.mock('@/shared/queries/team', () => ({
  useCreateTeam: () => ({ mutate: vi.fn(), error: null, isPending: false }),
}))

beforeEach(async () => {
  await i18n.changeLanguage('ko')
})

it('선택한 언어 하나로 모바일 스튜디오 제목을 표시한다', async () => {
  const view = render(
    <MemoryRouter>
      <TeamCreatePage />
    </MemoryRouter>,
  )

  expect(screen.getByRole('heading', { name: '팀 만들기', level: 1 })).toBeInTheDocument()
  expect(screen.queryByText('Create team / 팀 만들기')).not.toBeInTheDocument()

  await act(async () => {
    await i18n.changeLanguage('en')
  })
  view.rerender(
    <MemoryRouter>
      <TeamCreatePage />
    </MemoryRouter>,
  )
  expect(screen.getByRole('heading', { name: 'Create team', level: 1 })).toBeInTheDocument()
})
