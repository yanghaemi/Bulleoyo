import type { ComponentProps } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import i18n from '@/shared/i18n'
import { PerformanceList } from './PerformanceList'

const defaults: ComponentProps<typeof PerformanceList> = {
  items: [
    {
      performanceId: '12',
      title: 'Blue Hour',
      bandCount: 2,
      venue: 'Live Hall',
      dateLabel: '19:00 KST',
    },
  ],
  pageInfo: { page: 0, size: 20, totalElements: 3, hasNext: true },
  filters: { keyword: '', dateChip: 'any', status: 'ALL', sort: 'startAt,asc' },
  keywordDraft: '',
  dateChips: [
    { key: 'any', label: 'Any date' },
    { key: 'thisWeek', label: 'This week' },
  ],
  state: 'ready',
  onKeywordChange: vi.fn(),
  onKeywordSubmit: vi.fn(),
  onKeywordClear: vi.fn(),
  onDateChipChange: vi.fn(),
  onStatusChange: vi.fn(),
  onSortChange: vi.fn(),
  onResetFilters: vi.fn(),
  onLoadMore: vi.fn(),
  onRetry: vi.fn(),
}

function show(props: Partial<ComponentProps<typeof PerformanceList>> = {}) {
  return render(
    <MemoryRouter>
      <PerformanceList {...defaults} {...props} />
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('en')
})

it('distinguishes a committed keyword from a browse draft and exposes a named search action', () => {
  const view = show({ keywordDraft: 'Blue' })
  expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent(/Search results/)
  fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search shows' }), { key: 'Enter' })
  expect(defaults.onKeywordSubmit).toHaveBeenCalledWith('Blue')
  view.rerender(
    <MemoryRouter>
      <PerformanceList
        {...defaults}
        filters={{ ...defaults.filters, keyword: 'Blue' }}
        keywordDraft="Blue"
      />
    </MemoryRouter>,
  )
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Search results for “Blue”')
  fireEvent.click(screen.getByRole('button', { name: 'Clear search Blue' }))
  expect(defaults.onKeywordClear).toHaveBeenCalledTimes(1)
})

it('groups supported filters and presents the result count alongside sorting', () => {
  show()
  const filters = screen.getByRole('region', { name: 'Filter shows' })
  fireEvent.click(within(filters).getByRole('button', { name: 'This week' }))
  fireEvent.click(within(filters).getByRole('button', { name: 'On sale' }))
  expect(defaults.onDateChipChange).toHaveBeenCalledWith('thisWeek')
  expect(defaults.onStatusChange).toHaveBeenCalledWith('ON_SALE')
  const results = screen.getByRole('region', { name: 'Show results' })
  expect(within(results).getByText('3 shows')).toBeInTheDocument()
  fireEvent.change(within(results).getByRole('combobox', { name: 'Sort' }), {
    target: { value: 'createdAt,desc' },
  })
  expect(defaults.onSortChange).toHaveBeenCalledWith('createdAt,desc')
  expect(within(results).getByRole('list', { name: 'Shows' })).toBeInTheDocument()
})

it('uses Korean for progress, filters and result copy without the English footer literal', async () => {
  await i18n.changeLanguage('ko')
  show()
  const main = screen.getByRole('main')
  expect(within(main).getByText('전체 3개 중 1개 표시')).toBeInTheDocument()
  expect(main).not.toHaveTextContent(/of 3 shows|Any date|Sale closed/)
  expect(within(main).getByRole('region', { name: '공연 필터' })).toBeInTheDocument()
})

it('keeps loaded cards and the result count while loading more and disables duplicate load requests', () => {
  show({ state: 'loadingMore' })
  const results = screen.getByRole('region', { name: 'Show results' })
  expect(within(results).getByText('3 shows')).toBeInTheDocument()
  expect(within(results).getAllByText('Blue Hour').length).toBeGreaterThan(0)
  expect(within(results).getByRole('button', { name: 'Loading…' })).toBeDisabled()
})

it('preserves filtered empty reset and validation failure recovery', () => {
  const view = show({ items: [], filters: { ...defaults.filters, status: 'ON_SALE' } })
  fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
  expect(defaults.onResetFilters).toHaveBeenCalledTimes(1)
  view.rerender(
    <MemoryRouter>
      <PerformanceList
        {...defaults}
        items={[]}
        state="error"
        errorCode="COMMON_VALIDATION_FAILED"
      />
    </MemoryRouter>,
  )
  fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Reset filters' }))
  expect(defaults.onResetFilters).toHaveBeenCalledTimes(2)
})
