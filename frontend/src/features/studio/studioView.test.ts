import { describe, expect, it } from 'vitest'

import type { StudioPerformance } from './StudioHome'
import {
  filterPerformances,
  hasPerformanceFilter,
  paginate,
  parsePerformanceFilters,
  parseStudioPage,
  resolveStudioView,
} from './studioView'

const show = (over: Partial<StudioPerformance>): StudioPerformance => ({
  performanceId: 1,
  title: '공연',
  status: 'ON_SALE',
  depositStatus: 'PAID',
  teamId: 1,
  host: true,
  participationStatus: 'ACCEPTED',
  myTeamAgreementStatus: 'AGREED',
  pendingSignature: null,
  ...over,
})

describe('parseStudioPage', () => {
  it.each([
    [null, 1],
    ['1', 1],
    ['3', 3],
    ['0', 1],
    ['-2', 1],
    ['2.5', 1],
    ['abc', 1],
    ['', 1],
  ])('%j → %d', (param, expected) => {
    expect(parseStudioPage(param)).toBe(expected)
  })
})

describe('paginate', () => {
  const items = Array.from({ length: 21 }, (_, i) => i + 1)
  it('10 / 11 / 21개 경계', () => {
    expect(paginate(items.slice(0, 10), 1)).toMatchObject({ pageCount: 1 })
    expect(paginate(items.slice(0, 11), 2)).toEqual({ items: [11], page: 2, pageCount: 2 })
    expect(paginate(items, 3)).toEqual({ items: [21], page: 3, pageCount: 3 })
  })
  it('범위 밖 페이지는 당기고 빈 목록은 1페이지', () => {
    expect(paginate(items, 9).page).toBe(3)
    expect(paginate([], 4)).toEqual({ items: [], page: 1, pageCount: 1 })
  })
})

describe('참여 공연 필터', () => {
  const rows = [
    show({ performanceId: 1, status: 'DRAFT', depositStatus: 'UNPAID' }),
    show({ performanceId: 2, status: 'PENDING_AGREEMENT', depositStatus: 'PAID' }),
    show({
      performanceId: 3,
      status: 'ENDED',
      settlementStatus: 'NONE',
      depositStatus: 'RETURNED',
    }),
    show({ performanceId: 4, status: 'ENDED', settlementStatus: 'LOCKED', depositStatus: 'PAID' }),
  ]
  const ids = (list: StudioPerformance[]) => list.map((p) => p.performanceId)

  it('URL 파라미터를 검증해 읽는다 — 모르는 값은 전체', () => {
    const f = parsePerformanceFilters(
      new URLSearchParams('status=upcoming&settlement=NOPE&deposit=PAID'),
    )
    expect(f).toEqual({ show: 'upcoming', settlement: undefined, deposit: 'PAID' })
    expect(hasPerformanceFilter(f)).toBe(true)
    expect(hasPerformanceFilter(parsePerformanceFilters(new URLSearchParams()))).toBe(false)
  })

  it('공연 상태는 배지 값으로 거른다 — DRAFT·PENDING_AGREEMENT 모두 "공개 예정"', () => {
    expect(ids(filterPerformances(rows, { show: 'upcoming' }))).toEqual([1, 2])
  })

  it('세 필터는 AND다', () => {
    expect(ids(filterPerformances(rows, { show: 'upcoming', deposit: 'PAID' }))).toEqual([2])
    expect(
      ids(filterPerformances(rows, { show: 'ended', settlement: 'LOCKED', deposit: 'PAID' })),
    ).toEqual([4])
    expect(ids(filterPerformances(rows, { show: 'ended', deposit: 'UNPAID' }))).toEqual([])
  })

  it('정산 NONE은 정산 상태가 없는 공연도 포함한다', () => {
    expect(ids(filterPerformances(rows, { settlement: 'NONE' }))).toEqual([1, 2, 3])
  })

  it('필터가 없으면 그대로', () => {
    expect(ids(filterPerformances(rows, {}))).toEqual([1, 2, 3, 4])
  })
})

describe('resolveStudioView', () => {
  it.each(['teams', 'performances', 'todos'] as const)('?view=%s 는 그대로 쓴다', (view) => {
    expect(resolveStudioView(view, 0)).toBe(view)
    expect(resolveStudioView(view, 3)).toBe(view)
  })

  it('값이 없으면 확인할 일이 있을 때 todos, 없을 때 performances', () => {
    expect(resolveStudioView(null, 1)).toBe('todos')
    expect(resolveStudioView(null, 0)).toBe('performances')
    expect(resolveStudioView(undefined, 0)).toBe('performances')
  })

  it.each(['', 'TODOS', 'wallet', 'todos '])('잘못된 값(%j)은 기본값이다', (param) => {
    expect(resolveStudioView(param, 2)).toBe('todos')
    expect(resolveStudioView(param, 0)).toBe('performances')
  })
})
