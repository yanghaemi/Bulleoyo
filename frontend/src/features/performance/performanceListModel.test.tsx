import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, it } from 'vitest'
import i18n from '@/shared/i18n'
import { toShowCard, rateNote, type PerformanceListItem } from './performanceListModel'
import { ShowCard } from './ShowCard'

beforeEach(async () => {
  await i18n.changeLanguage('en')
})
const item: PerformanceListItem = {
  performanceId: 25,
  title: 'Actual Show',
  venueName: 'Local Hall',
  startAt: '2026-09-20T09:00:00Z',
  status: 'SALE_CLOSED',
  minPriceAmount: 10000,
  currency: 'KRW',
  soldOut: false,
  teamNames: ['Local Band'],
}

it('shows that sales closed even when tickets remain', () => {
  render(
    <MemoryRouter>
      <ShowCard data={toShowCard(item)} />
    </MemoryRouter>,
  )
  expect(screen.getAllByText('Sale closed').length).toBeGreaterThan(0)
})

it('formats server performance and rate timestamps in the requested language', () => {
  expect(toShowCard(item, undefined, 'en').dateLabel).toContain('September')
  expect(rateNote({ currency: 'USD', rate: 1300, asOf: '2026-09-18T09:00:00Z' }, 'en')).toContain(
    'September',
  )
  expect(toShowCard(item, undefined, 'ko').dateLabel).toContain('9월')
})
