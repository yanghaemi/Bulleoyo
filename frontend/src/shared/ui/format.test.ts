import { expect, it } from 'vitest'
import { formatKst, formatYoyo } from './format'

it('formats English ticket dates without Korean while preserving the KST label', () => {
  const label = formatKst('2026-09-26T10:00:00Z', 'Asia/Seoul', 'en')
  expect(label).toContain('September 26')
  expect(label).toContain('KST')
  expect(label).not.toMatch(/[가-힣]/)
})

it('preserves Korean defaults and the secondary KST time for other zones', () => {
  expect(formatKst('2026-09-26T10:00:00Z', 'Asia/Seoul')).toContain('9월 26일')
  expect(formatKst('2026-09-26T10:00:00Z', 'America/New_York', 'en')).toContain('(KST 19:00)')
  expect(formatKst('not-a-date', 'Asia/Seoul', 'en')).toBe('not-a-date')
})

// 2026-09-24 결정 — 금액은 `10,000 YoYo`. ₩·KRW·"원" 표기는 관객이 현금·카드 결제로 오해한다
it('formats amounts as whole YoYo with thousands separators and a trailing ticker', () => {
  expect(formatYoyo(10000)).toBe('10,000 YoYo')
  expect(formatYoyo(0)).toBe('0 YoYo')
  expect(formatYoyo(1)).toBe('1 YoYo')
  expect(formatYoyo(123456789)).toBe('123,456,789 YoYo')
})

it('keeps the sign convention: + for inflow and U+2212 minus for outflow', () => {
  expect(formatYoyo(15000, '+')).toBe('+15,000 YoYo')
  expect(formatYoyo(15000, '−')).toBe('−15,000 YoYo')
})

it('never emits a won sign or the KRW code', () => {
  for (const value of [0, 5, 50000, 1000000]) {
    expect(formatYoyo(value)).not.toMatch(/₩|KRW|원/)
  }
})
