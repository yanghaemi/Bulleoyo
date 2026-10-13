import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { ReactNode } from 'react'
import { SalesStatusPage } from './SalesStatusPage'
import { SettlementPage } from './SettlementPage'

const state = vi.hoisted(() => ({ refetch: vi.fn(), sales: vi.fn(), settlement: vi.fn() }))
vi.mock('@/shared/queries/performance', () => ({
  useSalesStatus: state.sales,
  usePerformanceDetail: () => ({ data: { title: 'Live show' }, isPending: false }),
}))
vi.mock('@/shared/queries/settlement', () => ({
  useSettlement: state.settlement,
  useAggregateSettlement: () => ({}),
  useLockSettlement: () => ({}),
  useReleaseSettlement: () => ({}),
  useCreateDispute: () => ({}),
  useApproveSettlement: () => ({}),
  useCreateSettlementShareLink: () => ({}),
}))
vi.mock('@/shared/queries/team', () => ({ useMyTeams: () => ({}) }))
vi.mock('@/shared/queries/chain', () => ({ useChainJob: () => ({}) }))
vi.mock('@/features/studio/StudioShell', () => ({
  StudioShell: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('@/features/studio/SalesStatus', () => ({
  SalesStatus: ({ error, onRetry }: { error?: string; onRetry: () => void }) => (
    <>
      {error && <div role="alert">{error}</div>}
      <button onClick={onRetry}>Retry</button>
    </>
  ),
}))
vi.mock('@/features/studio/SettlementDashboard', () => ({
  SettlementDashboard: ({ error, onRetry }: { error?: string; onRetry: () => void }) => (
    <>
      {error && <div role="alert">{error}</div>}
      <button onClick={onRetry}>Retry</button>
    </>
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
  const result = {
    data: { performanceId: 12 },
    isPending: false,
    isError: true,
    error: new Error('Network unavailable'),
    refetch: state.refetch,
  }
  state.sales.mockReturnValue(result)
  state.settlement.mockReturnValue(result)
})

it.each([
  ['sales', SalesStatusPage],
  ['settlement', SettlementPage],
] as const)('%s exposes refetch errors even with cached data', (path, Page) => {
  render(
    <MemoryRouter initialEntries={[`/studio/performances/12/${path}`]}>
      <Routes>
        <Route path={`/studio/performances/:id/${path}`} element={<Page />} />
      </Routes>
    </MemoryRouter>,
  )
  expect(screen.getByRole('alert')).not.toBeEmptyDOMElement()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(state.refetch).toHaveBeenCalledTimes(1)
})

it.each([
  ['sales', SalesStatusPage],
  ['settlement', SettlementPage],
] as const)('%s does not query a different performance for a malformed ID', (path, Page) => {
  render(
    <MemoryRouter initialEntries={[`/studio/performances/12garbage/${path}`]}>
      <Routes>
        <Route path={`/studio/performances/:id/${path}`} element={<Page />} />
      </Routes>
    </MemoryRouter>,
  )
  if (path === 'sales') expect(state.sales).toHaveBeenLastCalledWith(0, { enabled: false })
  else expect(state.settlement).toHaveBeenLastCalledWith(undefined)
})
