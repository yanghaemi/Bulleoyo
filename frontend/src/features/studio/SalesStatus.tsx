import { useLocale } from '@/shared/i18n/useLocale'
/**
 * P-07 판매·선택 현황.
 *
 * 정본 — 화면설계 v6 §4 P-07(영역 구성·레이아웃·컴포넌트 표·상태·접근성)
 *        · §5.21 표 → 패널 접기 · §5.13 KST 병기 · §5.4 금액 표기 · §5.1 상태 배지
 *        · §5.19 액션 버튼 배치(이 화면은 **하단 고정 액션이 없다**)
 *        · API 명세 v6 performance-11(`GET /api/v1/performances/{performanceId}/sales`)
 *
 * 본문 순서는 P-07 **영역 구성** 그대로다 —
 * 매출 요약 → 에스크로 대조 배지 → 팀별 관람 선택 집계. 배지는 지표 타일 **바로 아래**에
 * 고정한다(레이아웃 항목이 두 폭 모두에 그렇게 못박았다).
 *
 * 지표 타일의 값과 순서도 컴포넌트 표 그대로다 — 총 매출(원) · 판매 매수 · 잔여 매수 ·
 * 환불 건수 · 환불액. 마지막 둘은 "환불" 타일 하나에 건수와 금액으로 함께 담아 PC 4열을 맞췄다.
 *
 * 팀별 집계는 두 폭에서 **열 순서가 같다** — 팀명 → 선택 수 → 비율 → 일치 배지(§5.21).
 * PC 표에서 왼쪽에 있던 값이 모바일 패널에서도 위에 온다.
 *
 * 껍데기(사이드 메뉴·드로어)는 `StudioShell`이 맡는다. 이 화면에는 관객 하단 탭바가 없다.
 *
 * TODO(API 연결)
 *   performance-11 `GET /api/v1/performances/{performanceId}/sales` → `SalesStatusData`.
 *   온체인 조회 결과는 서버가 30초 캐시한다(API 설명) — 프론트가 따로 폴링하지 않는다.
 *   에러: `COMMON_INTERNAL_ERROR`(500) · `SETTLEMENT_NOT_PARTICIPANT`(403) ·
 *         `PERFORMANCE_NOT_FOUND`(404) · `COMMON_UNAUTHORIZED`(401).
 *   분기는 `code`로만 한다 — `msg`로 분기하지 않는다(응답 규격 §1).
 */

import { Button, InfoRow, StatusBadge, formatYoyo, formatKst, shortenHex } from '@/shared/ui'
import { SHOW_STATUS } from '@/features/studio/showStatus'
import { StudioHeading } from '@/features/studio/StudioStates'
import { PageSkeleton } from '@/shared/ui/PageSkeleton'

/* ── 타입 ─────────────────────────────────────────────────────────────

   2026-09-16 실 API 연결(S15P21B204-102)에서 손으로 옮겨 적은 타입을 지우고 생성 타입
   별칭으로 바꿨다. 손으로 쓴 쪽은 열여섯 필드를 **전부 필수**로 적었는데 `performance_11`
   스키마에서 필수인 것은 `onchainAvailable` 하나뿐이다. "항상 온다"고 믿고 읽으면
   빠진 값이 `0`으로 보이고 — 잔여 매수 0은 **매진**으로, 총 매출 0은 **한 장도 안 팔림**으로
   읽힌다. 모르는 값은 `—`로 둔다.

   performance 도메인에는 매퍼가 없다(`SalesStatus = ApiData<'performance_11'>`). 좁히기가
   필요해지면 `shared/api/domains/performance`에 매퍼를 두는 것이 맞고, 화면에서 기본값을
   채워 넣지 않는다.  */

import type { SalesStatus as SalesStatusData } from '@/shared/api/domains/performance'
import type { Schemas } from '@/shared/api/schema'

export type { SalesStatus as SalesStatusData } from '@/shared/api/domains/performance'

/** `RateBrief` — 표시 환율(§0.5). `1 currency = rate KRW`. 클라이언트가 환율을 만들지 않는다 */
export type SalesRate = Schemas['RateBrief']
export type SalesTicketTypeStat = Schemas['SalesTicketTypeStat']
/** 서버 DB 집계(`dbCount`)와 온체인 카운터(`onchainCount`)를 나란히 준다 */
export type SalesTeamChoice = Schemas['TeamChoice']

/** 값이 없을 때의 자리표시. 빈칸으로 두면 "0"인지 "모름"인지 구분되지 않는다 */
const EMPTY = '—'

/* ── 포맷 ─────────────────────────────────────────────────────────────── */

/*
 * §5.13 KST 병기는 `shared/ui`의 `formatKst`가 맡는다.
 * 2026-09-09 P-08 작업에서 이 파일에 있던 지역 함수 `formatWhen`을 그리로 올렸다 —
 * 시각을 찍는 스튜디오 화면이 늘어나면서 같은 규칙이 화면마다 복사될 참이었다.
 */

/**
 * 환산 병기 문자열(`$1,185.19` 형태)과 툴팁을 만든다.
 *
 * ⚠ §5.4는 "API 응답의 `display` 객체를 그대로 쓰고 클라이언트가 환율을 재계산하지 않는다"고
 * 정했는데, **`SalesStatusData`에는 `display` 객체가 없다** — `rate{currency,rate,asOf}`뿐이다.
 * 그래서 여기서는 `Money`(A-03 합계)가 이미 남긴 예외와 같은 방식으로 클라이언트가 나눈다.
 * 명세 개정이 필요한 지점이다(응답에 `display`를 더하거나, §5.4에 이 예외를 적거나).
 *
 * 원 값은 어떤 경우에도 그대로 보여주고, 환율이 없으면 **환산값만 감춘다**(§5.4).
 * 회원 표시 통화가 KRW면(= `rate.currency === 'KRW'`) 병기할 것이 없다.
 */
function approxOf(
  amount: number | undefined,
  rate?: SalesRate,
): { text: string; title: string } | undefined {
  // 원 값이 없으면 환산할 것도 없다. `rate`의 세 필드는 스키마상 전부 선택이라 하나라도 비면 감춘다
  if (
    amount == null ||
    !rate?.currency ||
    !rate.rate ||
    rate.currency === 'KRW' ||
    rate.rate <= 0
  ) {
    return undefined
  }
  const converted = amount / rate.rate
  const text = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: rate.currency,
  }).format(converted)
  // §5.4 — 환산값에는 적용 환율과 기준 시각을 툴팁으로 붙인다
  const applied = `1 ${rate.currency} = ${formatYoyo(rate.rate)}`
  // 기준 시각이 없으면 그 조각만 뺀다 — 현재 시각을 대신 넣지 않는다
  const title = rate.asOf ? `${applied} · ${formatKst(rate.asOf)}` : applied
  return { text, title }
}

/** 수량 표기. 금액과 같은 숫자 글꼴을 써서 타일 안에서 자릿수가 흔들리지 않게 한다 */
function formatCount(n: number): string {
  return n.toLocaleString('ko-KR')
}

/** 응답에서 빠진 금액은 `0 YoYo`이 아니라 `—`다 */
function krw(amount: number | undefined): string {
  return amount == null ? EMPTY : formatYoyo(amount)
}

/** 응답에서 빠진 수량은 `0매`가 아니라 `—`다 — 0매는 매진으로 읽힌다 */
function tickets(n: number | undefined, text: (ko: string, en: string) => string): string {
  return n == null ? EMPTY : text(`${formatCount(n)}매`, `${formatCount(n)} tickets`)
}

/* ── 매출 요약 타일 ───────────────────────────────────────────────────── */

interface TileProps {
  label: string
  /** 큰 값 — 금액 또는 수량 */
  value: string
  /** 환산 병기(§5.4). 원 값 아래 작게 */
  approx?: { text: string; title: string }
  /** 보조 줄(환불 타일의 건수 등) */
  note?: string
}

function SummaryTile({ label, value, approx, note }: TileProps) {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3 md:px-5 md:py-4">
      <p className="m-0 font-sans text-[11px] font-semibold text-muted md:text-xs">{label}</p>
      <p className="m-0 mt-1 font-num text-lg font-bold tabular-nums text-ink md:text-xl">
        {value}
      </p>
      {approx && (
        <p className="m-0 font-num text-[11px] tabular-nums text-muted" title={approx.title}>
          ≈ {approx.text}
        </p>
      )}
      {note && <p className="m-0 mt-0.5 font-sans text-[11px] text-muted">{note}</p>}
    </div>
  )
}

function SummaryTiles({ data }: { data: SalesStatusData }) {
  const { text } = useLocale()
  /**
   * 잔여 매수는 **응답에 단일 필드가 없다.** `SalesStatusData`가 주는 것은
   * `ticketTypes[].remainingQuantity`뿐이라 권종별 잔여를 더해 만든다.
   * (판매 매수는 `paidTicketCount`가 있어 `soldQuantity` 합으로 만들지 않는다 —
   *  취소분 처리 기준이 서버와 어긋날 수 있어 서버가 준 값을 쓴다.)
   */
  const types = data.ticketTypes
  const remaining =
    types && types.length > 0 && types.every((t) => t.remainingQuantity != null)
      ? types.reduce((sum, t) => sum + (t.remainingQuantity ?? 0), 0)
      : undefined

  return (
    // PC 가로 4열 · 모바일 2열 × 2행(P-07 레이아웃)
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-4">
      <SummaryTile
        label={text('총 매출', 'Gross sales')}
        value={krw(data.grossRevenueAmount)}
        approx={approxOf(data.grossRevenueAmount, data.rate)}
      />
      <SummaryTile
        label={text('판매 매수', 'Tickets sold')}
        value={tickets(data.paidTicketCount, text)}
      />
      <SummaryTile
        label={text('잔여 매수', 'Remaining tickets')}
        value={tickets(remaining, text)}
      />
      <SummaryTile
        label={text('환불', 'Refunds')}
        value={krw(data.refundedAmount)}
        approx={approxOf(data.refundedAmount, data.rate)}
        note={
          data.cancelledTicketCount == null
            ? undefined
            : text(
                `${formatCount(data.cancelledTicketCount)}건`,
                `${formatCount(data.cancelledTicketCount)} refunds`,
              )
        }
      />
    </div>
  )
}

function TicketSalesProgress({ data }: { data: SalesStatusData }) {
  const { text } = useLocale()
  const ticketTypes = data.ticketTypes ?? []

  return (
    <section aria-label={text('티켓 판매 추이', 'Ticket sales progress')}>
      <h2 className="mb-2 font-sans text-[11px] font-semibold text-muted md:text-xs">
        {text('티켓 판매 추이', 'Ticket sales progress')}
      </h2>
      {ticketTypes.length === 0 ? (
        <p className="m-0 rounded-card border border-line bg-surface px-4 py-14 text-center font-sans text-[13px] text-muted">
          {text('티켓 옵션별 판매 정보가 없습니다', 'Ticket-type sales are unavailable')}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {ticketTypes.map((ticket) => {
            const sold = ticket.soldQuantity
            const remaining = ticket.remainingQuantity
            const total = sold != null && remaining != null ? sold + remaining : undefined
            const ratio = total && sold != null ? Math.round((sold / total) * 100) : undefined
            return (
              <li
                key={ticket.ticketTypeId ?? ticket.name}
                className="rounded-card border border-line bg-surface px-4 py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="m-0 truncate font-sans text-[13px] font-semibold text-ink">
                      {ticket.name ?? EMPTY}
                    </p>
                    <p className="m-0 mt-1 font-num text-[11px] tabular-nums text-muted">
                      {ticket.priceAmount == null ? EMPTY : formatYoyo(ticket.priceAmount)}
                    </p>
                  </div>
                  <p className="m-0 shrink-0 text-right font-num text-[13px] tabular-nums text-ink">
                    {sold == null
                      ? EMPTY
                      : text(`${formatCount(sold)}매 판매`, `${formatCount(sold)} sold`)}
                    <span className="mt-0.5 block text-[11px] text-muted">
                      {remaining == null
                        ? EMPTY
                        : text(
                            `${formatCount(remaining)}매 남음`,
                            `${formatCount(remaining)} remaining`,
                          )}
                    </span>
                  </p>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ground-2" aria-hidden>
                  {ratio != null && (
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${ratio}%` }}
                    />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/* ── 에스크로 대조 배지 ───────────────────────────────────────────────── */

/**
 * P-07 컴포넌트 표 — "에스크로 잔액 = 판매액 − 환불액 일치" 또는 불일치 경고.
 *
 * 일치·불일치를 **색으로만 알리지 않는다.** 문구 + 실제 수치(에스크로 잔액 / 판매액 − 환불액,
 * 어긋나면 차액)를 함께 둬서 눈으로 대조가 되게 한다.
 *
 * ⚠ `onchainAvailable === false`일 때의 문구는 **명세에 없다.** 온체인 조회가 실패하면
 * `escrowMatched`를 신뢰할 수 없으므로 일치·불일치 어느 쪽으로도 단정하지 않고
 * "알 수 없다"고 말한다. 문구는 임의 결정이며 명세 개정 시 확정한다.
 */
function EscrowMatchBanner({ data }: { data: SalesStatusData }) {
  const { text } = useLocale()
  const gross = data.grossRevenueAmount
  const refunded = data.refundedAmount
  // 두 값 중 하나라도 없으면 기대 잔액을 만들지 않는다 — 없는 값을 0으로 읽으면 대조가 거짓말이 된다
  const expected = gross != null && refunded != null ? gross - refunded : undefined
  const diff =
    expected != null && data.escrowBalanceAmount != null
      ? data.escrowBalanceAmount - expected
      : undefined
  // 온체인 조회가 실패했거나 서버가 대조 결과를 주지 않았으면 어느 쪽으로도 단정하지 않는다
  const unknown = !data.onchainAvailable || data.escrowMatched == null
  const matched = data.escrowMatched === true

  const tone = unknown
    ? 'border-line'
    : matched
      ? 'border-ok'
      : // 불일치는 사람이 손대야 하는 상태다 — 경고색(주의·대기)으로 둔다(토큰 문서 §3-4)
        'border-warning'

  const headline = unknown
    ? text(
        '온체인 조회를 하지 못했습니다 — 대조 결과를 알 수 없습니다',
        'On-chain data is unavailable. Reconciliation status is unknown.',
      )
    : matched
      ? text('에스크로 잔액 = 판매액 − 환불액 일치', 'Escrow matches sales minus refunds')
      : text(
          '에스크로 잔액이 판매액 − 환불액과 일치하지 않습니다',
          'Escrow does not match sales minus refunds',
        )

  return (
    <section
      role="status"
      aria-label={text('에스크로 대조', 'Escrow reconciliation')}
      className={`rounded-card border bg-surface px-4 py-3 md:px-5 md:py-3.5 ${tone}`}
    >
      <p className="m-0 font-sans text-[13px] font-semibold text-ink md:text-sm">
        {/* ⚠ 표시 — 아래 문구가 명세에 없는 임의 문구임을 화면에서도 드러낸다 */}
        {unknown && <span aria-hidden>⚠ </span>}
        {headline}
      </p>

      {/* 수치 대조 줄. 두 값을 같은 줄에 나란히 둬야 대조가 눈으로 된다 */}
      <p className="m-0 mt-1 font-sans text-[11px] text-muted md:text-xs">
        {text('에스크로 잔액', 'Escrow balance')}{' '}
        <span className="font-num tabular-nums text-ink">
          {unknown ? EMPTY : krw(data.escrowBalanceAmount)}
        </span>
        {' · '}
        {text('판매액 − 환불액', 'Sales minus refunds')}{' '}
        <span className="font-num tabular-nums text-ink">
          {krw(gross)} − {krw(refunded)} = {krw(expected)}
        </span>
        {!unknown && diff != null && diff !== 0 && (
          <>
            {' · '}
            {text('차액', 'Difference')}{' '}
            <span className="font-num tabular-nums text-ink">
              {diff > 0 ? '+' : '−'}
              {formatYoyo(Math.abs(diff))}
            </span>
          </>
        )}
      </p>

      {!unknown && !matched && (
        // 명세 **상태** 항목의 문구 그대로
        <p className="m-0 mt-1 font-sans text-[13px] font-semibold text-ink">
          {text('관리자 확인 중', 'Under admin review')}
        </p>
      )}

      {/*
        대조 대상 컨트랙트. ⚠ P-07 컴포넌트 표에 이 항목은 없지만 응답의 `splitterAddress`가
        "무엇의 잔액을 본 것인가"를 특정하므로 배지 보조 줄로만 뒀다(열·타일을 늘리지 않았다).
        주소 노출은 공연자 화면이라 허용된다(§1.2 원칙 11).
      */}
      {/* 주소가 오지 않으면 줄 자체를 그리지 않는다 — 무엇의 잔액인지 특정하지 못하는 줄이다 */}
      {data.splitterAddress && (
        <p className="m-0 mt-1 font-sans text-[11px] text-muted">
          {text('정산 컨트랙트', 'Settlement contract')}
          <span className="font-mono">{shortenHex(data.splitterAddress)}</span>
        </p>
      )}
    </section>
  )
}

/* ── 팀별 선택 집계 ───────────────────────────────────────────────────── */

/** 표의 열 머리글. 이 배열이 PC 표와 모바일 패널의 **공통 순서**를 갖는다(§5.21) */
const TEAM_COLUMNS = [
  ['선택 수', 'Audience choices'],
  ['비율', 'Share'],
  ['일치', 'Reconciliation'],
] as const

type MatchState = 'matched' | 'mismatched' | 'unknown'

/**
 * 서버 집계 vs 온체인 카운터 일치 배지.
 *
 * 색만으로 알리지 않는다 — 라벨을 항상 함께 쓴다(`StatusBadge`와 같은 규칙).
 * ⚠ `unknown`("확인 불가")은 명세에 없는 상태다. `onchainAvailable === false`면 비교할
 * 온체인 값이 없어 `matched`를 믿을 수 없으므로 일치·불일치 어느 쪽으로도 찍지 않는다.
 */
function MatchBadge({ state }: { state: MatchState }) {
  const { text } = useLocale()
  const MAP: Record<MatchState, { label: string; className: string }> = {
    matched: { label: text('일치', 'Matched'), className: 'border-ok text-ok' },
    mismatched: { label: text('불일치', 'Mismatch'), className: 'border-warning text-warning' },
    unknown: { label: text('확인 불가', 'Unavailable'), className: 'border-line text-muted' },
  }
  const s = MAP[state]
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-chip border bg-surface px-2 font-sans text-[11px] font-semibold tracking-tight ${s.className}`}
    >
      {s.label}
    </span>
  )
}

/** 서버 집계와 온체인 카운터가 어긋난 팀만 차이를 드러낸다 */
function CountDetail({ team }: { team: SalesTeamChoice }) {
  const { text } = useLocale()
  const diff =
    team.dbCount != null && team.onchainCount != null ? team.dbCount - team.onchainCount : undefined
  return (
    <span className="font-sans text-[11px] text-muted">
      {text('서버', 'Server')}{' '}
      <span className="font-num tabular-nums text-ink">
        {team.dbCount == null ? EMPTY : formatCount(team.dbCount)}
      </span>{' '}
      {text('· 온체인', '· On-chain')}{' '}
      <span className="font-num tabular-nums text-ink">
        {team.onchainCount == null ? EMPTY : formatCount(team.onchainCount)}
      </span>{' '}
      {text('· 차이', '· Difference')}{' '}
      <span className="font-num tabular-nums text-ink">
        {diff == null ? EMPTY : `${diff > 0 ? '+' : '−'}${formatCount(Math.abs(diff))}`}
      </span>
    </span>
  )
}

function TeamChoiceList({ data }: { data: SalesStatusData }) {
  const { text } = useLocale()
  const teams = data.teamChoices ?? []
  /**
   * 비율(%)은 **응답에 없다.** 컴포넌트 표가 "비율(%)"을 요구하므로
   * `dbCount / 전체 dbCount 합`으로 계산한다 — 온체인 카운터가 아니라 서버 집계 기준이다
   * (`onchainCount`는 대조용이고, 불일치 시에는 분모가 흔들린다).
   * 선택이 하나도 없으면 0으로 나누게 되므로 `—`로 둔다.
   */
  const total = teams.reduce((sum, t) => sum + (t.dbCount ?? 0), 0)
  const ratioOf = (n: number | undefined): string =>
    total === 0 || n == null ? EMPTY : `${((n / total) * 100).toFixed(1)}%`

  // 온체인 값을 못 읽었거나 서버가 대조 결과를 주지 않았으면 일치·불일치를 찍지 않는다
  const matchState = (t: SalesTeamChoice): MatchState =>
    !data.onchainAvailable || t.matched == null ? 'unknown' : t.matched ? 'matched' : 'mismatched'

  return (
    <section aria-label={text('팀별 관람 선택 집계', 'Audience choices by team')}>
      <h2 className="mb-2 font-sans text-[11px] font-semibold text-muted md:text-xs">
        {text('팀별 관람 선택', 'Audience choices by team')}
      </h2>

      {/*
        counterMatched === false 경고. "이 상태에서는 집계 확정(API-settlement-02)이 막힌다"는
        performance-11 설명 문장을 그대로 인용한다 — 화면이 임의로 완화해 말하면 안 된다.
      */}
      {data.onchainAvailable && data.counterMatched === false && (
        <p
          role="status"
          className="m-0 mb-2 rounded-card border border-warning bg-surface px-4 py-2.5 font-sans text-[13px] font-semibold text-ink"
        >
          {text(
            '서버 집계와 온체인 카운터가 일치하지 않습니다',
            'Server counts do not match the on-chain counters.',
          )}
          <span className="ml-1 font-normal text-muted">
            {text(
              '· 이 상태에서는 집계 확정이 막힙니다',
              '· Aggregation cannot be confirmed until resolved.',
            )}
          </span>
        </p>
      )}

      {teams.length === 0 ? (
        // §5.7 — 아이콘·이미지 없이 안내 문구만. 다음 행동이 없는 화면이라 버튼도 두지 않는다
        <p
          role="status"
          className="m-0 rounded-card border border-line bg-surface px-4 py-14 text-center font-sans text-[13px] text-muted"
        >
          {text('아직 관람 선택이 없습니다', 'No audience choices yet')}
        </p>
      ) : (
        <>
          {/* ── PC: 표 ── */}
          <div className="hidden overflow-hidden rounded-card border border-line bg-surface md:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  <th
                    scope="col"
                    className="px-4 py-2.5 font-sans text-[11px] font-semibold text-muted"
                  >
                    {text('팀명', 'Team name')}
                  </th>
                  {TEAM_COLUMNS.map((c) => (
                    <th
                      key={c[0]}
                      scope="col"
                      className="px-4 py-2.5 font-sans text-[11px] font-semibold text-muted"
                    >
                      {text(c[0], c[1])}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => (
                  <tr key={t.teamId} className="border-b border-line last:border-b-0">
                    <th scope="row" className="px-4 py-3 font-sans text-[13px] font-bold text-ink">
                      {t.teamName ?? EMPTY}
                    </th>
                    <td className="px-4 py-3 font-num text-[13px] tabular-nums text-ink">
                      {t.dbCount == null ? EMPTY : formatCount(t.dbCount)}
                      {/* 불일치 팀만 서버·온체인 값을 함께 펼친다 — 대조가 목적이다 */}
                      {matchState(t) === 'mismatched' && (
                        <span className="mt-0.5 block">
                          <CountDetail team={t} />
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-num text-[13px] tabular-nums text-ink">
                      {ratioOf(t.dbCount)}
                    </td>
                    <td className="px-4 py-3">
                      <MatchBadge state={matchState(t)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── 모바일: 행 하나 = 패널 하나(§5.21). 가로 스크롤을 만들지 않는다 ── */}
          <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
            {teams.map((t) => (
              <li key={t.teamId} className="rounded-card border border-line bg-surface px-4 py-3">
                {/* 표의 첫 열(팀명)이 패널 제목이 된다 */}
                <span className="block font-sans text-[13px] font-bold text-ink">
                  {t.teamName ?? EMPTY}
                </span>
                {/* 나머지 열은 `라벨: 값` 한 줄씩. 순서는 PC 표와 같다 */}
                <InfoRow label={text(...TEAM_COLUMNS[0])}>
                  <span className="font-num tabular-nums">
                    {t.dbCount == null ? EMPTY : formatCount(t.dbCount)}
                  </span>
                  {matchState(t) === 'mismatched' && (
                    <span className="mt-0.5 block">
                      <CountDetail team={t} />
                    </span>
                  )}
                </InfoRow>
                <InfoRow label={text(...TEAM_COLUMNS[1])}>
                  <span className="font-num tabular-nums">{ratioOf(t.dbCount)}</span>
                </InfoRow>
                <InfoRow label={text(...TEAM_COLUMNS[2])}>
                  <MatchBadge state={matchState(t)} />
                </InfoRow>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/* ── 로딩·에러 ────────────────────────────────────────────────────────── */

/** P-07 **상태** — 로딩은 스켈레톤. 본문 골격(타일 4 → 배지 → 목록)과 같은 자리를 잡는다 */
function Skeleton() {
  return <PageSkeleton variant="dashboard" />
}

/**
 * P-07 **상태** — 에러는 `COMMON_INTERNAL_ERROR`(500).
 * 서버 `msg`를 그대로 노출하고(§5.5) 클라이언트가 문구로 분기하지 않는다.
 */
function ErrorPanel({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
  const { text } = useLocale()
  return (
    <section
      role="alert"
      className="rounded-card border border-danger bg-surface px-4 py-10 text-center"
    >
      <p className="m-0 mb-1 font-sans text-sm font-semibold text-ink">
        {text('판매 현황을 불러오지 못했습니다', 'Could not load sales overview')}
      </p>
      <p className="m-0 mb-4 font-sans text-[13px] text-muted">{msg}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {text('다시 시도', 'Try again')}
        </Button>
      )}
    </section>
  )
}

/* ── 화면 ─────────────────────────────────────────────────────────────── */

interface Props {
  /**
   * 공연명 — P-07 **영역 구성**의 헤더다.
   * ⚠ `SalesStatusData`에 공연명이 없다. 상위(페이지)가 performance-04 공연 상세에서 받아 넘긴다.
   */
  title: string
  data?: SalesStatusData
  loading?: boolean
  /** 실패 시 서버 `msg`. 있으면 에러 패널을 그린다 */
  error?: string
  onRetry?: () => void
}

export function SalesStatus({ title, data, loading = false, error, onRetry }: Props) {
  const { text } = useLocale()
  // 하단 고정 액션이 없는 화면이라(P-07 영역 구성) 바닥 여백을 비워 두지 않는다
  const frame = 'flex flex-col gap-4 px-3 pt-3 pb-8 md:gap-6 md:px-0 md:pt-0 md:pb-0'

  if (loading) {
    return (
      <div className={frame}>
        <Skeleton />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className={frame}>
        <ErrorPanel
          msg={error ?? text('잠시 후 다시 시도해 주세요.', 'Please try again in a moment.')}
          onRetry={onRetry}
        />
      </div>
    )
  }

  return (
    <div className={frame}>
      {/*
        헤더 줄 — 공연명 + 공연 상태 배지 + 갱신 시각.
        공연명은 PC에서만 여기 찍는다. 모바일에서는 `StudioShell`의 상단 바가 이미 공연명을
        달고 있어(title prop) 같은 문자열이 두 번 나오면 좁은 화면에서 두 줄을 낭비한다.
      */}
      <StudioHeading title={title} section={['판매 현황', 'Sales overview']}>
        {/* 상태·갱신 시각이 오지 않으면 그 자리를 비운다 — 기본 배지·현재 시각을 지어내지 않는다 */}
        {data.status && <StatusBadge status={SHOW_STATUS[data.status]} />}
        {data.refreshedAt && (
          <span className="ml-auto font-sans text-[11px] text-muted md:text-xs">
            {text('갱신 시각', 'Updated')}
            <span className="font-mono">{formatKst(data.refreshedAt)}</span>
          </span>
        )}
      </StudioHeading>

      <SummaryTiles data={data} />
      <EscrowMatchBanner data={data} />
      <div className="grid min-w-0 gap-4 md:grid-cols-2 md:gap-6">
        <TicketSalesProgress data={data} />
        <TeamChoiceList data={data} />
      </div>
    </div>
  )
}
