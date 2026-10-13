/**
 * P-07 판매 현황 — `performance_11` 스키마에서 필수 필드는 `onchainAvailable` 하나뿐이다.
 *
 * 빠진 값을 `0`으로 그리면 **잔여 매수 0 = 매진**, **총 매출 0 = 한 장도 안 팔림**으로 읽힌다.
 * 공연 당일 운영자가 그 숫자로 판단한다. 모르는 값은 `—`로 둔다.
 * 온체인 조회가 실패했으면 대조 결과를 일치·불일치 어느 쪽으로도 찍지 않는다.
 */

import { render, screen } from '@testing-library/react'
import i18n from '@/shared/i18n'

beforeEach(async () => {
  await i18n.changeLanguage('ko')
})
import { expect, it } from 'vitest'

import { SalesStatus } from './SalesStatus'
import type { SalesStatusData } from './SalesStatus'

it('작업 제목과 공연 맥락을 구분한다', () => {
  render(
    <SalesStatus
      title="합정 라이브"
      data={{ onchainAvailable: false, ticketTypes: [], teamChoices: [] }}
    />,
  )

  expect(screen.getByRole('heading', { name: '판매 현황' })).toBeVisible()
  expect(screen.getByText('합정 라이브')).toBeVisible()
})

it('빈 권종 응답에서 잔여 매수를 0으로 추정하지 않는다', () => {
  render(<SalesStatus title="합정 라이브" data={{ onchainAvailable: false, ticketTypes: [] }} />)
  expect(screen.queryByText('0매')).not.toBeInTheDocument()
})

it('응답에서 빠진 금액·수량을 0 이 아니라 —로 그린다', () => {
  // 서버가 온체인 조회에 실패해 집계만 내려준 상태
  const data: SalesStatusData = { onchainAvailable: false, teamChoices: [] }
  render(<SalesStatus title="합정 3밴드 합동공연" data={data} />)

  // 총 매출·판매 매수·잔여 매수·환불 네 타일이 전부 "모름"이다
  expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4)
  expect(screen.queryByText('0 YoYo')).not.toBeInTheDocument()
  expect(screen.queryByText('0매')).not.toBeInTheDocument()
  // 대조 결과를 단정하지 않는다
  expect(screen.getByText(/대조 결과를 알 수 없습니다/)).toBeInTheDocument()
})

it('값이 오면 그대로 그리고, 온체인 대조는 서버가 준 matched 로만 판단한다', () => {
  const data: SalesStatusData = {
    onchainAvailable: true,
    status: 'ON_SALE',
    grossRevenueAmount: 1_600_000,
    refundedAmount: 75_000,
    escrowBalanceAmount: 1_525_000,
    paidTicketCount: 64,
    cancelledTicketCount: 3,
    ticketTypes: [
      {
        ticketTypeId: 31,
        name: '일반',
        priceAmount: 25_000,
        soldQuantity: 52,
        remainingQuantity: 28,
      },
    ],
    teamChoices: [
      {
        teamId: 7,
        teamName: '블루노트',
        teamIndex: 0,
        dbCount: 30,
        onchainCount: 28,
        matched: false,
      },
    ],
    counterMatched: false,
    escrowMatched: true,
  }
  render(<SalesStatus title="합정 3밴드 합동공연" data={data} />)

  expect(screen.getByText('1,600,000 YoYo')).toBeInTheDocument()
  expect(screen.getByText('28매')).toBeInTheDocument()
  expect(screen.getByText('에스크로 잔액 = 판매액 − 환불액 일치')).toBeInTheDocument()
  expect(screen.getAllByText('불일치').length).toBeGreaterThan(0)
})
