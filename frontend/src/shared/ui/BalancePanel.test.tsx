import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { BalancePanel } from './BalancePanel'

it('shows the actual balance immediately on first render and every update', () => {
  const { rerender } = render(<BalancePanel balanceKrw={100000} />)
  expect(screen.getByText('100,000 YoYo')).toBeVisible()
  expect(screen.queryByText('0 YoYo')).not.toBeInTheDocument()
  rerender(<BalancePanel balanceKrw={75000} />)
  expect(screen.getByText('75,000 YoYo')).toBeVisible()
  expect(screen.queryByText('100,000 YoYo')).not.toBeInTheDocument()
})

it('keeps stale context and retry instead of showing a made-up zero after failure', () => {
  const retry = vi.fn()
  const { rerender } = render(<BalancePanel balanceKrw={4000} updatedAtLabel="13:10" onRetry={retry} />)
  rerender(<BalancePanel updatedAtLabel="13:10" onRetry={retry} />)
  expect(screen.getByText('—')).toBeVisible()
  expect(screen.getByText(/13:10/)).toBeVisible()
  expect(screen.queryByText('0 YoYo')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button'))
  expect(retry).toHaveBeenCalledOnce()
})
