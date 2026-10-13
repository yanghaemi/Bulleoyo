/**
 * 관객 화면 금액 표기 회귀 — 2026-09-24 결정(화면설계 v8.4 §0.6).
 *
 * 금액은 `10,000 YoYo`로만 쓴다. ₩ 기호·`KRW` 코드·금액 뒤 "원"이 다시 들어오면 관객이
 * 현금·카드 결제로 오해한다. 주요 관객 화면(A-03 옵션 · A-04 팀 배분 · A-05 결제 ·
 * 잔액 · A-12 주문 내역)을 ko·en 두 언어로 렌더해 본문 어디에도 원화 표기가 없는지 본다.
 */
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { OrderList, type OrderListItem } from '@/features/order/OrderList'
import { PaymentScreen } from '@/features/payment/PaymentScreen'
import { TeamChoice } from '@/features/ticket/TeamChoice'
import { TicketOptions } from '@/features/ticket/TicketOptions'
import { WalletScreen, type WalletTx } from '@/features/wallet/WalletScreen'
import i18n from '@/shared/i18n'

/** ₩ · KRW · 숫자 바로 뒤(공백 허용)의 "원" */
const WON_NOTATION = /₩|KRW|\d\s?원/

const transactions: WalletTx[] = [
  {
    walletTxId: '1',
    type: 'PURCHASE',
    direction: 'OUT',
    amount: 15000,
    status: 'CONFIRMED',
    title: 'Indie Night',
    occurredAt: '2026-09-08T16:00:00Z',
    occurredAtLabel: 'Sep 9, 01:00 KST',
  },
  {
    walletTxId: '2',
    type: 'GRANT',
    direction: 'IN',
    amount: 100000,
    status: 'CONFIRMED',
    title: 'Welcome',
    occurredAt: '2026-09-07T16:00:00Z',
    occurredAtLabel: 'Sep 8, 01:00 KST',
  },
]

const orders: OrderListItem[] = [
  {
    orderId: '82',
    orderNumber: 'ORD-82',
    showTitle: 'Indie Night',
    dateLabel: 'Sep 20, 18:30 KST',
    venue: 'Seoul',
    status: 'PAID',
    totalAmount: 88000,
    history: [{ status: 'PAID', atLabel: 'Sep 3, 20:06 KST' }],
    tickets: [],
  },
]

const screens: [string, () => ReactElement][] = [
  [
    'A-03 ticket options',
    () => (
      <TicketOptions
        data={{
          showTitle: 'Indie Night',
          dateLabel: 'September 20',
          venue: 'Hall',
          ticketTypes: [{ ticketTypeId: '1', name: 'Standing', price: 25000, remaining: 5 }],
        }}
        onNext={vi.fn()}
      />
    ),
  ],
  [
    'A-04 team choice',
    () => (
      <TeamChoice
        data={{
          showTitle: 'Indie Night',
          teams: [{ teamId: 7, teamIndex: 0, teamName: 'Neon Harbor' }],
          summary: {
            showTitle: 'Indie Night',
            dateLabel: '2026. 9. 20.',
            venue: 'Hall',
            ticketTypeName: 'Standing',
            quantity: 2,
            totalAmount: 50000,
          },
        }}
        onContinue={vi.fn()}
      />
    ),
  ],
  [
    'A-05 payment',
    () => (
      <PaymentScreen
        data={{
          showTitle: 'Indie Night',
          dateLabel: '2026-09-20',
          venue: 'Hall',
          ticketTypeName: 'Standing',
          quantity: 1,
          teamName: 'Neon Harbor',
          totalAmount: 25000,
          walletBalance: 20000,
        }}
        state={{ kind: 'insufficient', shortfall: 5000 }}
        onPay={vi.fn()}
        onRetry={vi.fn()}
        onViewBalance={vi.fn()}
        onBackToShow={vi.fn()}
      />
    ),
  ],
  [
    'balance',
    () => (
      <WalletScreen
        balanceKrw={85000}
        approxLabel="$62.96"
        transactions={transactions}
        onRetryBalance={vi.fn()}
      />
    ),
  ],
  [
    'A-12 order history',
    () => <OrderList orders={orders} onSelect={vi.fn()} onCollapse={vi.fn()} />,
  ],
]

afterEach(async () => {
  // 언어를 되돌리기 전에 먼저 언마운트한다 — 마운트된 채로 바꾸면 act 경고가 난다
  cleanup()
  await i18n.changeLanguage('en')
})

describe.each(['ko', 'en'] as const)('audience amounts in %s', (language) => {
  it.each(screens)('%s shows amounts in YoYo without won notation', async (_name, ui) => {
    await i18n.changeLanguage(language)
    const { container } = render(<MemoryRouter>{ui()}</MemoryRouter>)
    const body = container.textContent ?? ''
    expect(body).toMatch(/\d[\d,]* YoYo/)
    expect(body).not.toMatch(WON_NOTATION)
    // 스크린 리더가 읽는 aria-label에도 원화 표기가 남지 않는다
    for (const el of container.querySelectorAll('[aria-label]')) {
      expect(el.getAttribute('aria-label') ?? '').not.toMatch(WON_NOTATION)
    }
  })
})
