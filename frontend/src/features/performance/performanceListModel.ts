/**
 * A-15 공연 목록의 **데이터 계약**과 순수 변환.
 *
 * 컴포넌트를 두지 않는다 — 화면(`PerformanceList.tsx`)은 컴포넌트만 export해야 하고
 * (Fast Refresh), 타입·상수·변환 함수는 여기 모은다.
 *
 * 정본 —
 *   · API `docs/design/api/parts/04_performance.yaml` `GET /api/v1/performances`
 *     (operationId `performance_02`, API-performance-02) 의 query 파라미터와 200 응답
 *   · 화면설계 v6 §5.20 카드 그리드 · §5.13 KST 병기 · §5.4 금액 표기 · §0.5 축약형(API)
 *
 * ⚠ **A-15는 화면설계 v6에 절이 없다**(2026-09-09 기준). 양해미 제안 · 팀장 승인으로 먼저
 *   구현하고 문서 절 추가는 별도로 진행 중이다. 그래서 이 파일의 모든 판단은 A-01(홈)과
 *   API 명세에서 끌어왔고, 근거 없는 값은 만들지 않았다. 명세와 어긋나거나 비는 지점은
 *   고치지 않고 `_workspace/fe_performance-a15_api-usage.md`에 적었다.
 */

import type { ShowCardData } from '@/features/performance/ShowCard'
import { PERFORMANCE_KEYWORD_MAX_LENGTH } from '@/shared/searchLimits'
import { formatKst, formatYoyo } from '@/shared/ui'

/* ────────────────────── 응답 shape (performance_02 200) ────────────────────── */

/**
 * 공개 목록에 실려 오는 상태.
 *
 * `PerformanceStatus` enum은 6종(DRAFT·PENDING_AGREEMENT·ON_SALE·SALE_CLOSED·ENDED·CANCELLED)이지만
 * **이 엔드포인트는 `ON_SALE`·`SALE_CLOSED`만 노출한다**(performance_02 description, `status` query enum).
 * 그래서 A-01의 "Opening soon(오픈 예정 = DRAFT·PENDING_AGREEMENT)" 섹션은 이 API로 만들 수 없다.
 */
export type PublicPerformanceStatus = 'ON_SALE' | 'SALE_CLOSED'

/** `data.items[]` — 명세의 `PerformanceListItem`을 그대로 옮겼다. 필드를 더하지 않았다. */
export interface PerformanceListItem {
  performanceId: number
  title: string
  posterImageUrl?: string | null
  venueName: string
  /** ISO date-time. 표시는 §5.13 `formatKst` */
  startAt: string
  status: PublicPerformanceStatus
  /** 최저가(YoYo 정수). 매진 등으로 없을 수 있다 */
  minPriceAmount?: number
  /** 항상 `"KRW"` (§0.5) */
  currency: string
  soldOut: boolean
  /** 참여팀 이름. 출연팀 **수** 필드는 명세에 없어 이 배열 길이로 낸다 */
  teamNames: string[]
}

/** `data.rate` — 목록 축약형 환율(§0.5). 회원 표시 통화가 KRW면 내려오지 않는다 */
export interface RateBrief {
  currency: string
  rate: number
  asOf: string
}

/** `data.pageInfo` — 명세의 `PageMeta`(§0.2). 4필드가 전부다 */
export interface PageMeta {
  /** 0-base */
  page: number
  size: number
  totalElements: number
  hasNext: boolean
}

/** `data` 전체 */
export interface PerformanceListData {
  rate?: RateBrief
  items: PerformanceListItem[]
  pageInfo: PageMeta
}

/* ───────────────────────── query 파라미터 (performance_02) ───────────────────────── */

/** 명세가 받는 정렬 3종. 이 밖의 값은 400 `COMMON_VALIDATION_FAILED`다 */
export type PerformanceSort = 'startAt,asc' | 'startAt,desc' | 'createdAt,desc'

/** 명세 그대로. 화면의 "All"은 파라미터를 **보내지 않는 것**이지 값이 아니다 */
export interface PerformanceListQuery {
  /** 제목·참여팀명 부분 일치, maxLength 50 */
  keyword?: string
  /** `YYYY-MM-DD` */
  fromDate?: string
  /** `YYYY-MM-DD` */
  toDate?: string
  status?: PublicPerformanceStatus
  /** 0-base, 기본 0 */
  page?: number
  /** 기본 20, 최대 100 */
  size?: number
  /** 기본 `startAt,asc` */
  sort?: PerformanceSort
}

/** 명세의 `keyword` maxLength. 입력 필드가 이 값을 넘기지 않게 막는 데 쓴다 */
export const KEYWORD_MAX_LENGTH = PERFORMANCE_KEYWORD_MAX_LENGTH

/** 목록 한 장의 크기. 명세 기본값 20을 그대로 쓴다(카드 4열 × 5줄) */
export const PAGE_SIZE = 20

/* ─────────────────────────── 상태 필터 ─────────────────────────── */

/** 화면의 상태 칩. `ALL`은 `status` 파라미터를 생략한다 */
export type StatusFilterKey = 'ALL' | PublicPerformanceStatus

export const STATUS_FILTERS: readonly { key: StatusFilterKey; en: string; ko: string }[] = [
  { key: 'ALL', en: 'All', ko: '전체' },
  { key: 'ON_SALE', en: 'On sale', ko: '판매 중' },
  { key: 'SALE_CLOSED', en: 'Sale closed', ko: '판매 마감' },
] as const

export const SORT_OPTIONS: readonly { key: PerformanceSort; en: string; ko: string }[] = [
  // 명세 기본값이 `startAt,asc`라 첫 항목으로 둔다
  { key: 'startAt,asc', en: 'Soonest', ko: '공연 임박순' },
  { key: 'startAt,desc', en: 'Latest', ko: '공연 늦은순' },
  { key: 'createdAt,desc', en: 'Newly added', ko: '최근 등록순' },
] as const

/* ─────────────────────────── 날짜 필터 칩 ───────────────────────────
 * A-01은 날짜 필터를 **칩 목록**으로 정했다 — `Any date · This week · Next week` + 이후 월 단위 칩.
 * 그런데 API가 받는 것은 `fromDate`·`toDate` 두 개뿐이다. 그래서 **칩 → 날짜 범위 번역은
 * 클라이언트 몫**이며, 아래가 그 번역이다. 명세에 없는 파라미터를 만들지 않았다.
 *
 * 기준 시간대는 **KST**다. 공연 일시 입력이 KST 기준이고(§5.13) 마감도 현지 시각이라,
 * 브라우저 시간대로 주를 자르면 외국인 관객에게 하루가 밀린다.
 */

/** 프리셋 세 개. A-01 컴포넌트 표의 `Any date · This week · Next week`가 그대로 온다 */
export type DateChipPreset = 'any' | 'thisWeek' | 'nextWeek'

/**
 * 프리셋 또는 월 칩 `YYYY-MM`.
 *
 * 월 칩이 값으로 계산되는 문자열이라 유니온으로 못 박지 않았다. 대신 `dateChipToRange`가
 * **모르는 키를 만나면 범위를 비운다**(= 전체) — 잘못된 키가 API 파라미터로 새지 않는다.
 */
export type DateChipKey = DateChipPreset | string

export interface DateChip {
  key: DateChipKey
  /** 칩에 찍히는 라벨. 월 칩은 `Sep 2026`처럼 만든다 */
  label: string
}

interface CalendarDate {
  y: number
  m: number
  d: number
}

/** KST 달력 날짜로 자른다. `en-CA`는 `YYYY-MM-DD`를 낸다 */
function kstToday(now: Date): CalendarDate {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const [y, m, d] = s.split('-').map(Number)
  return { y, m, d }
}

function toIsoDate(c: CalendarDate): string {
  return `${c.y}-${String(c.m).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`
}

/** 달력 날짜 산술만 한다 — UTC로 다루므로 시간대·서머타임이 끼어들지 않는다 */
function addDays(c: CalendarDate, n: number): CalendarDate {
  const t = new Date(Date.UTC(c.y, c.m - 1, c.d + n))
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }
}

/** 0=일 … 6=토 */
function weekday(c: CalendarDate): number {
  return new Date(Date.UTC(c.y, c.m - 1, c.d)).getUTCDay()
}

/** 그 달의 마지막 날 */
function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/**
 * 칩 하나를 `fromDate`·`toDate`로 옮긴다. `any`는 둘 다 비운다(파라미터를 안 보낸다).
 *
 * 주는 **월요일 시작**이다. `This week`의 시작은 이번 주 월요일이 아니라 **오늘**로 둔다 —
 * 지난 날짜의 공연은 어차피 팔 수 없고, "이번 주"를 눌렀는데 이미 끝난 공연이 섞이면
 * 목록이 거짓말을 한다. `Next week`은 다음 주 월~일 전체다.
 */
export function dateChipToRange(
  key: DateChipKey,
  now: Date = new Date(),
): { fromDate?: string; toDate?: string } {
  if (key === 'any') return {}

  const today = kstToday(now)

  if (key === 'thisWeek') {
    // 월요일 시작 기준으로 이번 주 일요일까지 남은 일수. 일요일(0)이면 오늘이 마지막 날이다
    const wd = weekday(today)
    const toSunday = wd === 0 ? 0 : 7 - wd
    return { fromDate: toIsoDate(today), toDate: toIsoDate(addDays(today, toSunday)) }
  }

  if (key === 'nextWeek') {
    const wd = weekday(today)
    const toSunday = wd === 0 ? 0 : 7 - wd
    const nextMonday = addDays(today, toSunday + 1)
    return { fromDate: toIsoDate(nextMonday), toDate: toIsoDate(addDays(nextMonday, 6)) }
  }

  // 월 칩 — `YYYY-MM`
  const match = /^(\d{4})-(\d{2})$/.exec(key)
  if (!match) return {}
  const y = Number(match[1])
  const m = Number(match[2])
  return {
    fromDate: toIsoDate({ y, m, d: 1 }),
    toDate: toIsoDate({ y, m, d: lastDayOfMonth(y, m) }),
  }
}

/**
 * A-01과 같은 칩 목록을 만든다 — `Any date · This week · Next week` + 이후 월 칩.
 *
 * 월 칩 개수(`monthCount`)는 명세에 없다. A-01 목 데이터가 3개월치(Sep·Oct·Nov)를 두고 있어
 * 같은 3을 기본값으로 잡았다 — 근거는 A-01 화면이지 명세가 아니다.
 */
export function buildDateChips(now: Date = new Date(), monthCount = 3): DateChip[] {
  const today = kstToday(now)
  const chips: DateChip[] = [
    { key: 'any', label: 'Any date' },
    { key: 'thisWeek', label: 'This week' },
    { key: 'nextWeek', label: 'Next week' },
  ]
  for (let i = 0; i < monthCount; i += 1) {
    const t = new Date(Date.UTC(today.y, today.m - 1 + i, 1))
    const y = t.getUTCFullYear()
    const m = t.getUTCMonth() + 1
    chips.push({
      key: `${y}-${String(m).padStart(2, '0')}`,
      label: new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        month: 'short',
        year: 'numeric',
      }).format(t),
    })
  }
  return chips
}

/** 화면 상태 → 명세 query. 값이 비면 키 자체를 넣지 않는다(빈 문자열을 보내지 않는다) */
export function toListQuery(input: {
  keyword: string
  dateChip: DateChipKey
  status: StatusFilterKey
  sort: PerformanceSort
  page: number
  now?: Date
}): PerformanceListQuery {
  const { fromDate, toDate } = dateChipToRange(input.dateChip, input.now)
  const keyword = input.keyword.trim()
  return {
    ...(keyword ? { keyword: keyword.slice(0, KEYWORD_MAX_LENGTH) } : {}),
    ...(fromDate ? { fromDate } : {}),
    ...(toDate ? { toDate } : {}),
    ...(input.status === 'ALL' ? {} : { status: input.status }),
    page: input.page,
    size: PAGE_SIZE,
    sort: input.sort,
  }
}

/* ─────────────────────────── 표시 변환 ─────────────────────────── */

/**
 * §0.5 **축약형** 환산. 목록은 항목마다 `display`를 반복하지 않고 루트에 `rate` 하나만 준다.
 *
 * ⚠ §5.4는 "응답의 `display` 객체를 그대로 쓰고 클라이언트가 환율을 재계산하지 않는다"고
 *   적었는데, 축약형에는 `display.approx`가 아예 없다. **환율을 새로 만드는 게 아니라
 *   서버가 준 `rate`를 적용하는 것**이므로 §5.4의 금지(재계산)에는 걸리지 않는다고 봤다.
 *   이 해석은 보고서에 남겼다 — 서버가 항목마다 `approx`를 주는 쪽으로 바꾸려면 명세 수정이다.
 *
 * 환율이 없으면 `undefined`를 돌려 환산만 감춘다(§5.4 — 원 값은 언제나 보인다).
 */
export function approxLabel(
  amount: number | undefined,
  rate: RateBrief | undefined,
): string | undefined {
  if (amount == null || !rate || !(rate.rate > 0)) return undefined
  const value = amount / rate.rate
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: rate.currency,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    // 등록되지 않은 통화 코드가 오면 통화 기호를 지어내지 않고 코드를 그대로 붙인다
    return `${value.toFixed(2)} ${rate.currency}`
  }
}

/** 표시용 환율 각주 — §5.4 "적용 환율과 기준 시각". 목록에는 한 번만 찍는다 */
export function rateNote(
  rate: RateBrief | undefined,
  language: 'ko' | 'en' = 'ko',
): string | undefined {
  if (!rate) return undefined
  return `1 ${rate.currency} = ${formatYoyo(rate.rate)} · as of ${formatKst(rate.asOf, undefined, language)}`
}

/**
 * 목록 항목 → 카드(§5.20). **`ShowCard`를 그대로 재사용**하므로 홈과 카드가 같다.
 *
 * 채우지 못하는 필드 —
 *   · `closingSoon` — A-01은 "판매 마감까지 48시간 이내이거나 잔여 10% 이하"로 정의하는데
 *     목록 응답에는 `saleCloseAt`도 잔여 수량도 **없다**. 지어내지 않고 비운다(보고서 참조).
 */
export function toShowCard(
  item: PerformanceListItem,
  rate?: RateBrief,
  language: 'ko' | 'en' = 'ko',
): ShowCardData {
  return {
    // 라우트 파라미터가 문자열이라 카드도 문자열로 받는다(A-01과 같다)
    performanceId: String(item.performanceId),
    title: item.title,
    // 출연팀 수 필드가 없어 참여팀 이름 배열의 길이로 낸다
    bandCount: item.teamNames.length,
    venue: item.venueName,
    dateLabel: formatKst(item.startAt, undefined, language),
    fromPriceKrw: item.minPriceAmount,
    fromPriceUsd: approxLabel(item.minPriceAmount, rate),
    posterImageUrl: item.posterImageUrl,
    soldOut: item.soldOut,
    saleClosed: item.status === 'SALE_CLOSED',
    // A-01 정의 그대로 — 참여팀 2팀 이상이면 공동공연
    jointShow: item.teamNames.length >= 2,
  }
}
