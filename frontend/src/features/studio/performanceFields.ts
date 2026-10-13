import { formatYoyo } from '@/shared/ui/format'

import { studioText } from './studioLocale'
/**
 * P-03 공연 폼의 값·검증·KST 시각 변환.
 *
 * (파일명이 `performanceFields`인 이유 — 컴포넌트 `PerformanceForm.tsx`와 대소문자만 다른 이름은
 *  Windows·macOS의 대소문자 무시 파일 시스템에서 같은 파일로 취급돼 TS가 TS1149로 막는다.)
 *
 * 정본 — 화면설계 v7 §4 P-03 **입력 검증**
 *        ("제목 1~100자, 공연 일시는 미래, 예매 마감은 공연 일시 이전, 티켓 타입 1개 이상,
 *          가격·수량은 양의 정수(가격은 원 정수, 소수점 없음)")
 *        · API 명세 v6 performance_01 `PerformanceCreateRequest` · performance_04 `PerformanceUpdateRequest`
 *          · performance_05 `TicketTypeInput`
 *
 * 컴포넌트 파일에서 상수·헬퍼를 내보내면 Fast Refresh가 끊긴다. 그래서 여기로 뺐고,
 * 덕분에 KST 변환과 bp 없는 순수 검증을 테스트로 못 박을 수 있다.
 *
 * ── 명세 대조에서 드러난 것 (전부 보고 목록에 있다) ──────────────────────
 * ① **`예매 마감`은 입력 필드가 아니다.** P-03 컴포넌트 표는 "일시·장소 폼"의 입력 필드로
 *    "공연 일시·장소·예매 마감"을 적었지만, performance_01의 400 설명이
 *    "saleCloseAt·cancelDeadlineAt·depositAmount 전달(서버 결정 필드)"을 위반으로 못박았다.
 *    서버가 `startAt − 1시간`으로 계산해 응답으로만 내려준다. 그래서 화면은 **읽기 전용 표시**로 뒀다.
 * ② **API가 요구하는데 화면설계 표에 없는 필드가 셋** — `venueAddress`·`endAt`·`jointPerformance`.
 *    셋 다 `PerformanceCreateRequest`의 required라 없으면 공연을 만들 수 없어 입력으로 둔다.
 *    `posterImageUrl`은 선택 필드라 넣지 않았다(표에 없는 것을 늘리지 않는다).
 *    ⚠ `jointPerformance`는 **생성 때 한 번만** 정할 수 있다 — `PerformanceUpdateRequest`에
 *    그 필드가 없다(openapi 주석: "생성 후 공동 공연 여부를 바꿀 수단이 없다"). 수정 화면은
 *    체크박스가 아니라 읽기 전용 한 줄로 보여준다.
 * ③ `hostTeamId`도 required지만 **폼 필드가 아니라 맥락**이다 — 리더인 팀이 하나면 그 팀이고,
 *    둘 이상일 때만 고르게 한다.
 */

/** API `PerformanceCreateRequest`의 상한들 */
export const TITLE_MAX = 100
export const DESCRIPTION_MAX = 2000
export const VENUE_NAME_MAX = 100
export const VENUE_ADDRESS_MAX = 200

/** API `TicketTypeInput` — 이름 30자, 가격 0~1,000,000, 수량 1~5,000, 배열 1~10개 */
export const TICKET_NAME_MAX = 30
export const TICKET_PRICE_MAX = 1_000_000
export const TICKET_QUANTITY_MAX = 5_000
export const TICKET_TYPE_MAX = 10

/** 보증금은 **50,000 YoYo 고정**이다(화면설계 P-03 보증금 패널 · performance_13 `depositAmount`) */
export const DEPOSIT_AMOUNT = 50_000

/* ── KST 시각 ↔ `datetime-local` 입력값 ────────────────────────────────── */

/**
 * `datetime-local` 입력은 **브라우저 로컬 시간대**로 해석된다. 그런데 화면설계는
 * "공연 일시(KST 기준 입력)"라고 못박았다(P-03 컴포넌트 표). 공연이 한국에서 열리고
 * 마감·입장이 전부 KST 기준이라, 외국에 있는 리더가 자기 시간대로 적으면 공연 시각이 어긋난다.
 *
 * 그래서 입력값을 **언제나 KST 벽시계 시각으로 읽고 쓴다**. 라벨에도 KST를 붙여
 * 어느 시간대로 적는지 화면에서 말한다.
 */
const KST_OFFSET = '+09:00'

/** 서울 기준 연·월·일·시·분을 뽑는다. `Intl`을 쓰므로 서머타임 없는 KST에서 정확하다 */
function seoulParts(d: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const out: Record<string, string> = {}
  for (const p of parts) if (p.type !== 'literal') out[p.type] = p.value
  return out
}

/**
 * 서버 ISO → `datetime-local` 입력값(`YYYY-MM-DDTHH:mm`, KST 벽시계).
 * 파싱에 실패하면 빈 문자열 — 입력에 쓰레기를 넣지 않는다.
 */
export function isoToKstInput(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = seoulParts(d)
  // `en-CA`의 24시간제는 자정을 `24`로 줄 때가 있다(구형 엔진). `00`으로 되돌린다
  const hour = p.hour === '24' ? '00' : p.hour
  return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}`
}

/**
 * `datetime-local` 입력값(KST 벽시계) → 서버로 보낼 ISO 8601 문자열.
 * 오프셋을 명시해 서버가 시간대를 추측하지 않게 한다.
 */
export function kstInputToIso(value: string): string {
  if (!value) return ''
  // `YYYY-MM-DDTHH:mm` 뒤에 초와 오프셋을 붙인다. 초를 이미 포함한 값도 받아 준다
  const withSeconds = value.length === 16 ? `${value}:00` : value
  return `${withSeconds}${KST_OFFSET}`
}

/* ── 폼 값 ────────────────────────────────────────────────────────────── */

/** 1단계(공연 정보·티켓 옵션)의 공연 정보 값. 시각 둘은 KST 벽시계 입력값이다 */
export interface PerformanceInfoValues {
  title: string
  description: string
  venueName: string
  /** ⚠ 화면설계 표에 없지만 `PerformanceCreateRequest`의 required다 */
  venueAddress: string
  startAt: string
  /** ⚠ 화면설계 표에 없지만 required다. `ENDED` 전이 기준이 된다 */
  endAt: string
  /**
   * ⚠ 화면설계 표에 없지만 required다. true면 참여팀 단계가 서고, 판매 시작 전에 수락 참여팀이
   * 2팀 이상이어야 한다(`TEAM_MIN_COUNT_NOT_MET`).
   *
   * **생성 때 한 번만 정한다** — 수정 API(`PerformanceUpdateRequest`)에 이 필드가 없다.
   */
  jointPerformance: boolean
  /** 리더인 팀이 둘 이상일 때만 고른다. 하나면 그 팀으로 고정 */
  hostTeamId?: number
}

export interface PerformanceInfoErrors {
  title?: string
  description?: string
  venueName?: string
  venueAddress?: string
  startAt?: string
  endAt?: string
  hostTeamId?: string
}

/** 2단계(티켓 옵션)의 한 줄. 가격·수량은 입력 중 빈 문자열이 될 수 있어 문자열로 들고 있는다 */
export interface TicketTypeDraft {
  /** 화면 내 식별자. 서버 `ticketTypeId`가 있으면 그 값을, 신규면 임시 키를 쓴다 */
  key: string
  /** 기존 항목 유지 시 지정. 없으면 신규 생성(performance_05) */
  ticketTypeId?: number
  name: string
  price: string
  totalQuantity: string
  /** 이미 팔린 수량. 서버가 주면 이보다 적게 줄일 수 없다(performance_05 설명) */
  soldQuantity?: number
}

export interface TicketTypeErrors {
  name?: string
  price?: string
  totalQuantity?: string
}

/** 정수만 받는다. 소수·문자열 금액은 서버가 `COMMON_VALIDATION_FAILED`로 막는다 */
function parseIntStrict(value: string): number | undefined {
  if (!/^\d+$/.test(value.trim())) return undefined
  return Number(value.trim())
}

/**
 * 1단계 검증. `now`를 주입받아 테스트가 시간을 고정할 수 있게 한다.
 *
 * "공연 일시는 미래"(화면설계) · "endAt은 startAt 이후"(performance_01 `PERFORMANCE_DATE_INVALID`).
 */
export function validateInfo(
  values: PerformanceInfoValues,
  opts: { now?: number; needsHostTeam?: boolean } = {},
): PerformanceInfoErrors {
  const now = opts.now ?? Date.now()
  const errors: PerformanceInfoErrors = {}

  const title = values.title.trim()
  if (title.length === 0)
    errors.title = studioText('공연 제목을 입력해 주세요.', 'Enter a show title.')
  else if (title.length > TITLE_MAX)
    errors.title = studioText(
      `제목은 ${TITLE_MAX}자까지 쓸 수 있습니다. (지금 ${title.length}자)`,
      `Titles can have up to ${TITLE_MAX} characters (currently ${title.length}).`,
    )

  if (values.description.length > DESCRIPTION_MAX)
    errors.description = studioText(
      `설명은 ${DESCRIPTION_MAX}자까지 쓸 수 있습니다.`,
      `Descriptions can have up to ${DESCRIPTION_MAX} characters.`,
    )

  if (values.venueName.trim().length === 0)
    errors.venueName = studioText('공연 장소를 입력해 주세요.', 'Enter a venue.')
  else if (values.venueName.trim().length > VENUE_NAME_MAX)
    errors.venueName = studioText(
      `장소 이름은 ${VENUE_NAME_MAX}자까지 쓸 수 있습니다.`,
      `Venue names can have up to ${VENUE_NAME_MAX} characters.`,
    )

  if (values.venueAddress.trim().length === 0)
    errors.venueAddress = studioText('주소를 입력해 주세요.', 'Enter the venue address.')
  else if (values.venueAddress.trim().length > VENUE_ADDRESS_MAX)
    errors.venueAddress = studioText(
      `주소는 ${VENUE_ADDRESS_MAX}자까지 쓸 수 있습니다.`,
      `Addresses can have up to ${VENUE_ADDRESS_MAX} characters.`,
    )

  const start = values.startAt ? new Date(kstInputToIso(values.startAt)).getTime() : NaN
  const end = values.endAt ? new Date(kstInputToIso(values.endAt)).getTime() : NaN

  if (!values.startAt)
    errors.startAt = studioText('공연 일시를 입력해 주세요.', 'Enter the show start time.')
  else if (Number.isNaN(start))
    errors.startAt = studioText('공연 일시를 다시 확인해 주세요.', 'Check the show start time.')
  else if (start <= now)
    errors.startAt = studioText(
      '공연 일시는 지금보다 뒤여야 합니다.',
      'The show must start in the future.',
    )

  if (!values.endAt)
    errors.endAt = studioText('공연 종료 시각을 입력해 주세요.', 'Enter the show end time.')
  else if (Number.isNaN(end))
    errors.endAt = studioText('공연 종료 시각을 다시 확인해 주세요.', 'Check the show end time.')
  else if (!Number.isNaN(start) && end <= start)
    errors.endAt = studioText(
      '종료 시각은 시작 시각보다 뒤여야 합니다.',
      'The end time must be after the start time.',
    )

  if (opts.needsHostTeam && values.hostTeamId == null)
    errors.hostTeamId = studioText('공연을 여는 팀을 골라 주세요.', 'Select the host team.')

  return errors
}

/**
 * 티켓 옵션 한 줄 검증.
 *
 * 이름 중복은 줄 단위로 볼 수 없어 `duplicated`로 받아 온다(performance_05 400 "이름 중복").
 */
export function validateTicketType(
  row: TicketTypeDraft,
  opts: { duplicated?: boolean } = {},
): TicketTypeErrors {
  const errors: TicketTypeErrors = {}
  const name = row.name.trim()

  if (name.length === 0)
    errors.name = studioText('옵션 이름을 입력해 주세요.', 'Enter a ticket type name.')
  else if (name.length > TICKET_NAME_MAX)
    errors.name = studioText(
      `이름은 ${TICKET_NAME_MAX}자까지 쓸 수 있습니다.`,
      `Names can have up to ${TICKET_NAME_MAX} characters.`,
    )
  else if (opts.duplicated)
    errors.name = studioText(
      '같은 이름의 옵션이 있습니다.',
      'A ticket type with this name already exists.',
    )

  const price = parseIntStrict(row.price)
  if (price == null)
    errors.price = studioText(
      '가격은 YoYo 단위 정수로 입력해 주세요.',
      'Enter the price as a whole number of YoYo.',
    )
  else if (price > TICKET_PRICE_MAX)
    errors.price = studioText(
      `가격은 ${formatYoyo(TICKET_PRICE_MAX)}까지 넣을 수 있습니다.`,
      `The maximum price is ${formatYoyo(TICKET_PRICE_MAX)}.`,
    )

  const qty = parseIntStrict(row.totalQuantity)
  if (qty == null || qty < 1)
    errors.totalQuantity = studioText(
      '수량은 1 이상의 정수여야 합니다.',
      'Quantity must be a whole number greater than zero.',
    )
  else if (qty > TICKET_QUANTITY_MAX)
    errors.totalQuantity = studioText(
      `수량은 ${TICKET_QUANTITY_MAX.toLocaleString('ko-KR')}까지 넣을 수 있습니다.`,
      `Quantity cannot exceed ${TICKET_QUANTITY_MAX.toLocaleString('en-US')}.`,
    )
  else if (row.soldQuantity != null && qty < row.soldQuantity)
    errors.totalQuantity = studioText(
      `이미 ${row.soldQuantity}매가 팔려 그보다 적게 줄일 수 없습니다.`,
      `${row.soldQuantity} tickets have already been sold. Quantity cannot be lower.`,
    )

  return errors
}

/** 목록 전체 검증. 줄마다 오류 객체를 돌려주고, 목록 자체의 문제는 `listError`로 준다 */
export function validateTicketTypes(rows: TicketTypeDraft[]): {
  rows: TicketTypeErrors[]
  listError?: string
} {
  // 이름 중복 판정은 공백을 지운 뒤 대소문자 구분 없이 — 서버 규칙("공연 내 유니크")을 넓게 잡는다
  const counts = new Map<string, number>()
  for (const r of rows) {
    const key = r.name.trim().toLowerCase()
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const rowErrors = rows.map((r) =>
    validateTicketType(r, { duplicated: (counts.get(r.name.trim().toLowerCase()) ?? 0) > 1 }),
  )

  let listError: string | undefined
  if (rows.length === 0)
    listError = studioText('티켓 옵션을 1개 이상 만들어 주세요.', 'Add at least one ticket type.')
  else if (rows.length > TICKET_TYPE_MAX)
    listError = studioText(
      `티켓 옵션은 ${TICKET_TYPE_MAX}개까지 만들 수 있습니다.`,
      `You can create up to ${TICKET_TYPE_MAX} ticket types.`,
    )

  return { rows: rowErrors, listError }
}

/**
 * 오류 객체에 값이 하나라도 있는가.
 *
 * 매개변수를 `object`로 받는 이유 — TS의 인터페이스는 암묵적 인덱스 시그니처를 얻지 못해
 * `Record<string, string | undefined>`에 대입되지 않는다. 호출부마다 캐스팅을 넣느니 여기서 넓게 받는다.
 */
export function hasAnyError(errors: object): boolean {
  return Object.values(errors).some(Boolean)
}

/** 티켓 옵션 목록이 제출 가능한가 */
export function ticketTypesValid(result: {
  rows: TicketTypeErrors[]
  listError?: string
}): boolean {
  return !result.listError && result.rows.every((e) => !hasAnyError(e))
}
