/**
 * P-01 요약 타일 탭 — 어느 영역을 보여 줄지(`?view=`) 정하는 순수 규칙.
 *
 * 컴포넌트 파일은 컴포넌트만 export 한다(Fast Refresh) — 그래서 따로 둔다.
 * 탭(`view`) · 페이지(`page`) · 참여 공연 필터(`status`·`settlement`·`deposit`)를 다룬다.
 */

import type { Schemas } from '@/shared/api/schema'
import type { DepositStatus, SettlementStatus, ShowStatus } from '@/shared/ui'
import { DEPOSIT_STATUS_LABEL, SETTLEMENT_STATUS_LABEL } from '@/shared/ui/statusLabels'
import { SHOW_STATUS, type PerformanceStatus } from '@/features/studio/showStatus'
import type { StudioPerformance } from '@/features/studio/StudioHome'

export const STUDIO_VIEWS = ['teams', 'performances', 'todos'] as const
export type StudioView = (typeof STUDIO_VIEWS)[number]

/** URL 검색 파라미터 이름 */
export const STUDIO_VIEW_PARAM = 'view'

function isStudioView(value: unknown): value is StudioView {
  return typeof value === 'string' && (STUDIO_VIEWS as readonly string[]).includes(value)
}

/**
 * `?view=` 값 → 보여 줄 영역.
 *
 * 값이 없거나 모르는 값이면 기본값이다 — 확인할 일이 1개 이상이면 `todos`, 0이면(또는 아직
 * 모르면) `performances`. 기본값은 URL에 쓰지 않는다. 할 일이 도착하면 기본값이 따라 바뀌지만,
 * 사용자가 한 번 고른 탭(`?view=` 있음)은 데이터가 바뀌어도 그대로 둔다.
 */
export function resolveStudioView(param: string | null | undefined, todoCount: number): StudioView {
  if (isStudioView(param)) return param
  return todoCount > 0 ? 'todos' : 'performances'
}

/* ── 페이지 ─────────────────────────────────────────────────────────────── */

/** 확인할 일·참여 공연 모두 한 페이지 10개(9/24 요청) */
export const STUDIO_PAGE_SIZE = 10
/**
 * 1부터 세는 페이지. **고른 탭 하나에만** 적용된다 — 탭을 바꾸면 지운다(1페이지부터).
 * 필터를 바꿔도 지운다. 1페이지는 URL에 쓰지 않는다.
 */
export const STUDIO_PAGE_PARAM = 'page'

/** `?page=` → 1 이상의 정수. 숫자가 아니거나 1 미만이면 1. 상한은 목록 길이를 아는 쪽이 당긴다 */
export function parseStudioPage(param: string | null | undefined): number {
  if (param == null || !/^\d+$/.test(param)) return 1
  const n = Number(param)
  return Number.isSafeInteger(n) && n >= 1 ? n : 1
}

/* ── 참여 공연 필터 ─────────────────────────────────────────────────────── */

/**
 * URL 검색 파라미터 이름. 세 필터는 AND다. 필터를 바꾸면 `page`를 지운다(1페이지).
 * 필터는 참여 공연 탭에만 적용되지만 탭을 바꿔도 지우지 않는다 — 돌아오면 그대로다.
 */
export const PERFORMANCE_FILTER_PARAMS = {
  show: 'status',
  settlement: 'settlement',
  deposit: 'deposit',
} as const

export type PerformanceFilterKey = keyof typeof PERFORMANCE_FILTER_PARAMS

export interface PerformanceFilters {
  /** 공연 상태 — **배지 값**으로 거른다(아래 SHOW_FILTER_VALUES 설명) */
  show?: ShowStatus
  /** `NONE`은 "정산 전" — 정산 행이 없는 공연(settlementStatus 없음)도 포함한다 */
  settlement?: SettlementStatus
  deposit?: DepositStatus
}

/**
 * 공연 상태 옵션. 생성 enum(`PerformanceStatus` 6값)을 배지 매핑(`SHOW_STATUS`)으로 옮긴 값이다.
 * `DRAFT`·`PENDING_AGREEMENT`는 배지가 둘 다 "공개 예정"이라 옵션도 하나다 — 표에 보이는 배지와
 * 같은 이름으로 거르게 한다(같은 라벨 두 개를 옵션에 두면 무엇이 다른지 알 수 없다).
 */
export const SHOW_FILTER_VALUES: readonly ShowStatus[] = [...new Set(Object.values(SHOW_STATUS))]
/** 정산 상태 6값(P-08 상태 머신 = 배지). openapi에는 settlementStatus enum 스키마가 없다 */
export const SETTLEMENT_FILTER_VALUES = Object.keys(SETTLEMENT_STATUS_LABEL) as SettlementStatus[]
/** 생성 enum `PerformanceDepositStatus` 3값 */
export const DEPOSIT_FILTER_VALUES = Object.keys(DEPOSIT_STATUS_LABEL) as DepositStatus[]

/* 화면 union이 생성 enum과 어긋나면 tsc가 깨진다(두 방향 동일성) */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Assert<T extends true> = T
export type PerformanceStatusMatchesSchema = Assert<
  Same<PerformanceStatus, Schemas['PerformanceStatus']>
>
export type DepositStatusMatchesSchema = Assert<
  Same<DepositStatus, Schemas['PerformanceDepositStatus']>
>

function pick<T extends string>(values: readonly T[], raw: string | null): T | undefined {
  return raw != null && (values as readonly string[]).includes(raw) ? (raw as T) : undefined
}

/** URL → 필터. 모르는 값은 "전체"로 본다 */
export function parsePerformanceFilters(params: URLSearchParams): PerformanceFilters {
  return {
    show: pick(SHOW_FILTER_VALUES, params.get(PERFORMANCE_FILTER_PARAMS.show)),
    settlement: pick(SETTLEMENT_FILTER_VALUES, params.get(PERFORMANCE_FILTER_PARAMS.settlement)),
    deposit: pick(DEPOSIT_FILTER_VALUES, params.get(PERFORMANCE_FILTER_PARAMS.deposit)),
  }
}

export function hasPerformanceFilter(filters: PerformanceFilters): boolean {
  return filters.show != null || filters.settlement != null || filters.deposit != null
}

/**
 * 세 필터 AND. 정산 `NONE`("정산 전")은 정산 상태가 없는 행도 포함한다 — 정산 행이 아직 없는 공연과
 * `NONE`은 사용자에게 같은 뜻이다. (서버가 모르는 정산 문자열을 주면 페이지가 `undefined`로 좁히므로
 * 그 행도 여기에 든다. 배지 자리는 `—`다.)
 */
export function filterPerformances(
  rows: readonly StudioPerformance[],
  filters: PerformanceFilters,
): StudioPerformance[] {
  return rows.filter((p) => {
    if (filters.show != null && SHOW_STATUS[p.status] !== filters.show) return false
    if (filters.deposit != null && p.depositStatus !== filters.deposit) return false
    if (filters.settlement != null) {
      const settlement = p.settlementStatus ?? 'NONE'
      if (settlement !== filters.settlement) return false
    }
    return true
  })
}

/** 목록을 `size`개씩 자른다. 범위 밖 페이지는 1..pageCount 로 당긴다. pageCount는 최소 1 */
export function paginate<T>(
  items: readonly T[],
  page: number,
  size: number = STUDIO_PAGE_SIZE,
): { items: T[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / size))
  const current = Math.min(Math.max(1, page), pageCount)
  return { items: items.slice((current - 1) * size, current * size), page: current, pageCount }
}
