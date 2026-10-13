import { fireEvent, render, screen } from '@testing-library/react'

import i18n from '@/shared/i18n'

import { Pagination } from './Pagination'

beforeEach(async () => {
  await i18n.changeLanguage('ko')
})

it('페이지가 1개 이하면 그리지 않는다', () => {
  const { container } = render(
    <Pagination page={1} pageCount={1} onChange={vi.fn()} label="목록 페이지" />,
  )
  expect(container).toBeEmptyDOMElement()
})

it('이름 붙은 nav · 현재 페이지 aria-current · 번호 클릭으로 이동한다', () => {
  const onChange = vi.fn()
  render(<Pagination page={2} pageCount={3} onChange={onChange} label="목록 페이지" />)
  expect(screen.getByRole('navigation', { name: '목록 페이지' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '2페이지' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('button', { name: '1페이지' })).not.toHaveAttribute('aria-current')
  fireEvent.click(screen.getByRole('button', { name: '3페이지' }))
  fireEvent.click(screen.getByRole('button', { name: '이전 페이지' }))
  expect(onChange.mock.calls).toEqual([[3], [1]])
})

it('번호가 7개를 넘으면 처음·끝·현재 ±1만 두고 사이를 접는다', () => {
  render(<Pagination page={5} pageCount={10} onChange={vi.fn()} label="목록 페이지" />)
  const numbers = screen
    .getAllByRole('button')
    .map((b) => b.textContent)
    .filter((t) => /^\d+$/.test(t ?? ''))
  expect(numbers).toEqual(['1', '4', '5', '6', '10'])
})
