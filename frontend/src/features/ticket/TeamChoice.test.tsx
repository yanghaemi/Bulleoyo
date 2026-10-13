import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'

import i18n from '@/shared/i18n'
import { TeamChoice, type TeamChoiceView } from './TeamChoice'

const fixture: TeamChoiceView = {
  showTitle: 'Indie Night',
  teams: [
    { teamId: 7, teamIndex: 0, teamName: 'Neon Harbor' },
    { teamId: 9, teamIndex: 1, teamName: 'Blue Static' },
  ],
  summary: {
    showTitle: 'Indie Night',
    dateLabel: '2026. 9. 10.',
    venue: 'SSAFY Hall',
    ticketTypeName: 'Standing',
    quantity: 2,
    totalAmount: 40000,
  },
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

function renderChoice(data = fixture) {
  const onContinue = vi.fn()
  render(
    <MemoryRouter>
      <TeamChoice data={data} onContinue={onContinue} />
    </MemoryRouter>,
  )
  return onContinue
}

it('starts with every ticket unassigned and keeps review disabled', () => {
  renderChoice()

  expect(screen.queryByTestId('team-choice-stage')).not.toBeInTheDocument()
  expect(screen.getByText('0 of 2 tickets assigned')).toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'Neon Harbor ticket allocation' })).toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'Blue Static ticket allocation' })).toBeInTheDocument()
  for (const button of screen.getAllByRole('button', { name: 'Continue to review' })) {
    expect(button).toBeDisabled()
  }
})

it('splits tickets across teams and submits only when the total is fully assigned', () => {
  const onContinue = renderChoice()
  const neon = screen.getByRole('group', { name: 'Neon Harbor ticket allocation' })
  const blue = screen.getByRole('group', { name: 'Blue Static ticket allocation' })

  fireEvent.click(within(neon).getByRole('button', { name: '수량 늘리기' }))
  expect(screen.getByText('1 of 2 tickets assigned')).toBeInTheDocument()
  for (const button of screen.getAllByRole('button', { name: 'Continue to review' })) {
    expect(button).toBeDisabled()
  }

  fireEvent.click(within(blue).getByRole('button', { name: '수량 늘리기' }))
  expect(screen.getByText('2 of 2 tickets assigned')).toBeInTheDocument()
  expect(screen.getByRole('complementary')).toHaveTextContent('Neon Harbor × 1')
  expect(screen.getByRole('complementary')).toHaveTextContent('Blue Static × 1')
  const buttons = screen.getAllByRole('button', { name: 'Continue to review' })
  expect(buttons[0]).toBeEnabled()
  fireEvent.click(buttons[0])
  expect(onContinue).toHaveBeenCalledWith([
    { teamId: 7, quantity: 1 },
    { teamId: 9, quantity: 1 },
  ])
})

it('keeps keyboard focus on the quantity control while assigning tickets', async () => {
  const user = userEvent.setup()
  renderChoice()
  const neon = screen.getByRole('group', { name: 'Neon Harbor ticket allocation' })
  const increase = within(neon).getByRole('button', { name: '수량 늘리기' })

  increase.focus()
  await user.keyboard('{Enter}')
  expect(increase).toHaveFocus()
  expect(screen.getByText('1 of 2 tickets assigned')).toBeInTheDocument()
})

it('preserves a long team name in the selection payload', () => {
  const team = {
    teamId: 42,
    teamIndex: 0,
    teamName: '아주 긴 이름을 가진 밴드 TheLongestUnbrokenBandNameInTheWholeFestival',
  }
  const onContinue = renderChoice({ ...fixture, teams: [team] })
  const row = screen.getByRole('group', { name: `${team.teamName} ticket allocation` })

  fireEvent.click(within(row).getByRole('button', { name: '수량 늘리기' }))
  fireEvent.click(within(row).getByRole('button', { name: '수량 늘리기' }))
  fireEvent.click(screen.getAllByRole('button', { name: 'Continue to review' })[0])
  expect(onContinue).toHaveBeenCalledWith([{ teamId: 42, quantity: 2 }])
})
