import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, it } from 'vitest'
import { BottomNav } from './BottomNav'

it('공연장 진입 때 티켓을 바로 열 수 있는 네 개의 실제 경로를 제공한다', () => {
  render(
    <MemoryRouter initialEntries={['/tickets']}>
      <BottomNav />
    </MemoryRouter>,
  )
  expect(screen.getAllByRole('link')).toHaveLength(4)
  for (const [name, href] of [
    ['Shows', '/'],
    ['My Tickets', '/tickets'],
    ['Wallet', '/wallet'],
    ['MY', '/me'],
  ]) {
    expect(screen.getByRole('link', { name })).toHaveAttribute('href', href)
  }
  expect(screen.getByRole('link', { name: 'My Tickets' })).toHaveAttribute('aria-current', 'page')
})
