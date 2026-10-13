/**
 * M-03 관리자 화면 순수 로직 — MR !65 리뷰에서 지적받은 두 자리.
 *
 * 둘 다 "지금 응답이 이렇게 오니까 통과하더라"에 기대고 있던 코드다.
 * 목 데이터로는 드러나지 않아서, 여기서는 **드러나는 입력**을 직접 만들어 건다.
 */

import { describe, expect, it } from 'vitest'

import { invariantDiffText } from './adminMessages'
import { isNowMinute, toRateRegisterItem, validateGrant, validateRate } from './adminForms'
import type { CoinSupplyInvariant } from './adminTypes'
import type { RateFormValues } from './adminForms'

function inv(patch: Partial<CoinSupplyInvariant>): CoinSupplyInvariant {
  return {
    no: 1,
    name: 'SUPPLY_EQUALS_MINTED',
    expected: null,
    actual: null,
    checkedShows: null,
    mismatchedShows: null,
    maxDiff: null,
    matched: true,
    note: '',
    ...patch,
  }
}

describe('불변식 차액 문구는 no로 분기한다', () => {
  it('①·④는 expected/actual의 차를 금액으로 적는다', () => {
    expect(invariantDiffText(inv({ no: 1, expected: 1000, actual: 1500 }))).toContain('차액')
    expect(invariantDiffText(inv({ no: 4, expected: 1000, actual: 1000 }))).toBe('차액 없음')
  })

  it('②는 총액 필드가 함께 와도 불일치 공연 수로 적는다', () => {
    // 서버가 총액 비교값을 같이 실어 보내는 경우. 예전 코드는 여기서 "차액 500원"을 찍었다
    const text = invariantDiffText(
      inv({ no: 2, checkedShows: 12, mismatchedShows: 3, expected: 1000, actual: 1500 }),
    )
    expect(text).toBe('불일치 공연 3건 / 검사 12건')
  })

  it('③은 총액 필드가 함께 와도 최대 오차로 적는다', () => {
    const text = invariantDiffText(inv({ no: 3, maxDiff: 4, expected: 1000, actual: 1500 }))
    expect(text).toContain('최대 오차')
    expect(text).not.toContain('차액')
  })

  it('그 불변식의 지표가 없으면 아무 말도 하지 않는다 — 0으로 채우지 않는다', () => {
    expect(invariantDiffText(inv({ no: 2 }))).toBeUndefined()
    expect(invariantDiffText(inv({ no: 3 }))).toBeUndefined()
    expect(invariantDiffText(inv({ no: 1 }))).toBeUndefined()
    // 검사 공연 수만 없으면 아는 것만 적는다("검사 0건"이라고 지어내지 않는다)
    expect(invariantDiffText(inv({ no: 2, mismatchedShows: 3 }))).toBe('불일치 공연 3건')
  })
})

describe('환율 적용 시각은 분 단위 입력에 맞춰 검증한다', () => {
  const form = (effectiveFrom: string): RateFormValues => ({
    pair: 'USD_KRW',
    rate: '1350',
    effectiveFrom,
  })

  // 로컬 시간대와 무관하게 "지금 이 분"을 만들려면 now에서 거꾸로 만든다
  const now = new Date('2026-09-09T14:07:40+09:00').getTime()
  function localInput(ms: number): string {
    const d = new Date(ms)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
  }

  it('지금 이 분을 골랐으면 통과한다 — 초가 흘렀다고 튕기지 않는다', () => {
    expect(validateRate(form(localInput(now)), now).effectiveFrom).toBeUndefined()
  })

  it('지난 분은 여전히 막는다', () => {
    expect(validateRate(form(localInput(now - 60_000)), now).effectiveFrom).toBeDefined()
  })

  it('미래는 통과한다', () => {
    expect(validateRate(form(localInput(now + 3_600_000)), now).effectiveFrom).toBeUndefined()
  })

  it('지금 이 분이면 요청에서 effectiveFrom을 빼 서버가 now로 채우게 한다', () => {
    const item = toRateRegisterItem(form(localInput(now)), isNowMinute(localInput(now), now))
    expect(item.effectiveFrom).toBeUndefined()
    expect(item.rate).toBe(1350)
  })

  it('미래 시각은 그대로 실어 보낸다', () => {
    const later = localInput(now + 3_600_000)
    const item = toRateRegisterItem(form(later), isNowMinute(later, now))
    expect(item.effectiveFrom).toBe(new Date(later).toISOString())
  })
})

describe('관리자 폼 검증 문구는 선택 언어를 따른다', () => {
  it('영문 모드에서 지급·환율 오류에 한글을 섞지 않는다', () => {
    const grantErrors = validateGrant(
      { memberId: null, address: '', amount: '', memo: '' },
      'en',
    )
    const rateErrors = validateRate(
      { pair: 'USD_KRW', rate: '', effectiveFrom: '' },
      Date.now(),
      'en',
    )

    expect(Object.values(grantErrors).join(' ')).not.toMatch(/[가-힣]/)
    expect(Object.values(rateErrors).join(' ')).not.toMatch(/[가-힣]/)
  })
})
