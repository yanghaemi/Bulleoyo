import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import i18n from '@/shared/i18n'
import { BalanceLedger } from './BalanceLedger'
import { BalancePanel } from './BalancePanel'
import { DepositStatusBadge } from './DepositStatusBadge'
import { ProviderBadge } from './ProviderBadge'
import { SettlementStatusBadge } from './SettlementStatusBadge'
import { StatusBadge } from './StatusBadge'

describe('localized account and status presentation', () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('en')
    })
  })

  it('switches status labels to the selected language without bilingual copy', async () => {
    render(
      <>
        <StatusBadge status="on-sale" />
        <DepositStatusBadge status="PAID" />
        <SettlementStatusBadge status="DISPUTE_OPEN" />
      </>,
    )
    expect(screen.getByText('On sale')).toBeInTheDocument()
    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(screen.getByText('Dispute open')).toBeInTheDocument()
    await act(async () => {
      await i18n.changeLanguage('ko')
    })
    expect(screen.getByText('예매 중')).toBeInTheDocument()
    expect(screen.getByText('납부 완료')).toBeInTheDocument()
    expect(screen.getByText('이의제기 기간')).toBeInTheDocument()
    expect(screen.queryByText('On sale')).not.toBeInTheDocument()
  })

  it('keeps provider address visibility and suspension semantics in both languages', async () => {
    const { rerender } = render(
      <ProviderBadge provider="WEB3AUTH" social="GOOGLE" suspended shortAddress="0x123…456" />,
    )
    expect(screen.getByText('Connected with Google')).toBeInTheDocument()
    expect(screen.getByText('Suspended')).toBeInTheDocument()
    expect(screen.queryByText('0x123…456')).not.toBeInTheDocument()
    await act(async () => {
      await i18n.changeLanguage('ko')
    })
    expect(screen.getByText('구글 계정으로 연결됨')).toBeInTheDocument()
    expect(screen.getByText('이용 정지')).toBeInTheDocument()
    rerender(<ProviderBadge provider="EXTERNAL" tone="performer" shortAddress="0x123…456" />)
    expect(screen.getByText('외부 지갑')).toBeInTheDocument()
    expect(screen.getByText('0x123…456')).toBeInTheDocument()
  })

  it('preserves retry behavior and supplied update data while changing labels', async () => {
    const retry = vi.fn()
    render(<BalancePanel updatedAtLabel="12:30" onRetry={retry} />)
    expect(screen.getByRole('heading', { name: 'Balance' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalledOnce()
    expect(screen.getByText('Updated 12:30')).toBeInTheDocument()
    await act(async () => {
      await i18n.changeLanguage('ko')
    })
    expect(screen.getByRole('heading', { name: '잔액' })).toBeInTheDocument()
    expect(screen.getByLabelText('잔액을 불러오지 못했습니다')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
    expect(screen.getByText('갱신 12:30')).toBeInTheDocument()
  })

  it('keeps confirmed ledger amounts and signs independent of display language', async () => {
    const { rerender } = render(<BalanceLedger summary={{ in: 10000, out: 3000, count: 2 }} />)
    expect(screen.getByText('Money in & out · 2 confirmed')).toBeInTheDocument()
    expect(screen.getByText('+10,000 YoYo')).toBeInTheDocument()
    expect(screen.getByText('−3,000 YoYo')).toBeInTheDocument()
    await act(async () => {
      await i18n.changeLanguage('ko')
    })
    expect(screen.getByText('들어오고 나간 돈 · 확정 2건')).toBeInTheDocument()
    expect(screen.getByText('들어옴')).toBeInTheDocument()
    expect(screen.getByText('나감')).toBeInTheDocument()
    expect(screen.getByText('+10,000 YoYo')).toBeInTheDocument()
    rerender(<BalanceLedger summary={{ in: 0, out: 0, count: 0 }} />)
    expect(screen.queryByText(/확정/)).not.toBeInTheDocument()
  })
})
