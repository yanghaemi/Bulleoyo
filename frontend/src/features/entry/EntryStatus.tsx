/**
 * S-03 입장 현황.
 *
 * 정본 — 화면설계 v6 §4 S-03(1397~1430행) · §5.21 표 → 패널 접기 · §5.13 KST 병기
 *        · §5.7 빈 상태 · §5.19 액션 버튼 배치 · API 명세 v6 entry-02
 *          `GET /api/v1/performances/{performanceId}/entries`
 *
 * **한 화면 컴포넌트를 두 라우트가 공유한다**(1399행) —
 *   · `/scan/:token/entries` : 검표 담당자(STAFF). **로그인하지 않았다.** 껍데기가 없고
 *     (`StudioShell`·`AppHeader`를 쓰지 않는다 — 로그인 UI가 딸려 온다), 이 컴포넌트가
 *     얇은 헤더를 직접 그린다. S-02로 돌아가는 **스캔 화면 복귀 버튼이 여기서만 노출된다**(1417행).
 *   · `/studio/performances/:id/entries` : 참여팀 리더(PERFORMER, 로그인). 페이지가 `StudioShell`로
 *     감싸므로 헤더·사이드 메뉴는 껍데기가 갖고, 여기서는 본문만 그린다. 복귀 버튼은 없다
 *     (검표 링크 없이 들어왔으므로 돌아갈 스캔 화면이 없다).
 * 두 경로의 차이는 **`scanTo` prop 하나**로 갈린다 — 있으면 검표 링크 진입이다.
 *
 * 레이아웃(1407·1408행) — 모바일은 입장 요약을 상단에 **크게**, 이력은 1열 목록, 복귀 버튼 하단 고정.
 * PC는 **최대폭 960px**, 요약 3열 타일(입장·총 매수·중복 시도), 이력은 폭 100% 표.
 *
 * 개인정보 — 이력에 **관객 개인정보를 표시하지 않는다**(1416행). entry-02가 `holderNameMasked`를
 * 주지만 렌더하지 않는다. 데이터가 온다고 화면에 올리지 않는다(`WalletScreen`과 같은 태도).
 *
 * API (S15P21B204-101에서 연결) — 호출은 페이지가 한다(`ScanEntriesPage`·`StudioEntriesPage`).
 *   ⚠ 응답 필드는 **전부 선택**이다(생성 타입). 못 받은 숫자는 0이 아니라 "—"로 그리고,
 *     판정(`result`)을 모르는 행은 배지만 비운다 — 행을 통째로 버리지 않는다.
 *   현황:  entry-02 `GET /api/v1/performances/{performanceId}/entries` → `EntryStatusData`
 *          — `summary{enteredCount,totalIssuedCount,duplicateAttemptCount,expiredQrCount}`
 *          · `items[]`(`EntryLogItem`) · `pageInfo`. 요약값은 서버가 5초 캐시한다.
 *          인증은 `X-Entry-Token`(검표 링크) 또는 `Authorization`(참여팀 회원) 둘 중 하나.
 *   공연명: ⚠ **`EntryStatusData`에 공연명이 없다.** 상위(페이지)가 넘긴다(`SalesStatus`와 같은 문제).
 *   에러:  `ENTRY_SCANNER_NOT_AUTHORIZED`(403) · `COMMON_FORBIDDEN`(403) · `COMMON_UNAUTHORIZED`(401)
 *          · `PERFORMANCE_NOT_FOUND`(404) · `COMMON_VALIDATION_FAILED`(400) — `entryErrors.ts`.
 *   분기는 `code`로만 한다 — `msg`로 분기하지 않는다(응답 규격 §1).
 */

import { Link } from 'react-router'

import { useLocale } from '@/shared/i18n/useLocale'
import { Button, FixedBottom, InfoRow, formatKst } from '@/shared/ui'

import { entryFailureText, isDuplicateCode } from './entryErrors'
import type { EntryLogItem, EntryStatusData } from './entryTypes'

import './operations-refresh.css'

/**
 * 수량 표기. 요약과 표에서 자릿수가 흔들리지 않게 한 곳에서 만든다.
 *
 * ⚠ 응답 필드가 전부 선택이라 값이 안 올 수 있다. **`undefined`를 0으로 바꾸지 않는다** —
 *    "아직 아무도 입장하지 않았다"와 "입장 수를 모른다"는 현장에서 완전히 다른 말이다.
 */
function formatCount(n: number | undefined): string {
  return n == null ? '—' : n.toLocaleString('ko-KR')
}

/* ── 판정 배지 ────────────────────────────────────────────────────────── */

/**
 * 이력 한 줄의 판정 — S-03 컴포넌트 표의 "중복 시도 여부 배지"를 겸한다.
 *
 * 중복 시도(`ENTRY_ALREADY_ENTERED`)만 배지로 달라는 것이 명세지만, 실패 이력에는
 * 만료·시간대 밖·취소 티켓도 섞인다(entry-02가 성공·실패를 모두 준다). 실패를 전부 같은 배지로
 * 뭉뜽그리면 스태프가 이력에서 아무것도 읽어 낼 수 없어 **중복 / 그 밖의 실패 / 성공** 셋으로 나눴다.
 * ⚠ "그 밖의 실패" 배지는 명세에 없는 임의 결정이다. 사유 문구는 `failureCode`를 그대로 옮긴다.
 * 색으로만 알리지 않는다 — 라벨을 항상 함께 쓴다.
 *
 * `result`가 비어 있으면(명세에 없는 값이거나 응답 누락) **배지 자리만 비운다.**
 * 판정을 모른다고 이력 한 줄을 통째로 버리면 시각·티켓까지 함께 사라진다.
 */
function ResultBadge({ item }: { item: EntryLogItem }) {
  const { text } = useLocale()
  if (item.result !== 'SUCCESS' && item.result !== 'FAILED') return null

  const style =
    item.result === 'SUCCESS'
      ? { label: text('입장', 'Entered'), className: 'border-ok text-ok' }
      : isDuplicateCode(item.failureCode)
        ? { label: text('중복 시도', 'Duplicate'), className: 'border-warning text-warning' }
        : { label: text('실패', 'Failed'), className: 'border-danger text-danger' }

  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-chip border bg-surface px-2 font-sans text-[11px] font-semibold tracking-tight ${style.className}`}
    >
      {style.label}
    </span>
  )
}

/* ── 요약 ─────────────────────────────────────────────────────────────── */

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3 md:px-5 md:py-4">
      <p className="m-0 font-sans text-[11px] font-semibold text-muted md:text-xs">{label}</p>
      <p className="m-0 mt-1 font-num text-lg font-bold tabular-nums text-ink md:text-2xl">
        {value}
      </p>
    </div>
  )
}

/**
 * 입장 요약(1415행) — 모바일은 "입장 42 / 총 80"을 **크게 한 줄**,
 * PC는 입장·총 매수·중복 시도 **3열 타일**. 같은 값의 두 배치라 한 컴포넌트가 폭으로 나눈다.
 *
 * ⚠ `summary.expiredQrCount`(만료 QR 수)는 응답에 오지만 컴포넌트 표에 없어 그리지 않는다.
 */
function EntrySummaryPanel({ data, onRefresh }: { data: EntryStatusData; onRefresh?: () => void }) {
  const { text } = useLocale()
  const s = data.summary ?? {}
  return (
    <section aria-label={text('입장 요약', 'Entry summary')}>
      {/* 모바일 — 상단에 크게. 스태프가 걸으면서 보는 숫자다 */}
      <div className="rounded-card border border-line bg-surface px-4 py-5 text-center md:hidden">
        <p className="m-0 font-num text-4xl font-bold tabular-nums text-ink">
          {formatCount(s.enteredCount)}
          <span className="text-muted"> / {formatCount(s.totalIssuedCount)}</span>
        </p>
        <p className="m-0 mt-1 font-sans text-[13px] text-muted">
          {text('입장', 'Entered')} {formatCount(s.enteredCount)} / {text('총', 'Total')}{' '}
          {formatCount(s.totalIssuedCount)} {' · '}
          {text('중복 시도', 'Duplicates')} {formatCount(s.duplicateAttemptCount)}
        </p>
        {onRefresh && (
          <div className="mt-3">
            {/* 컴포넌트 표의 동작이 "새로고침·폴링"이다. 폴링 주기는 페이지가 정한다 */}
            <Button variant="secondary" sm onClick={onRefresh}>
              {text('새로고침', 'Refresh')}
            </Button>
          </div>
        )}
      </div>

      {/* PC — 가로 3열 타일(1408행) */}
      <div className="hidden grid-cols-3 gap-4 md:grid">
        <SummaryTile label={text('입장', 'Entered')} value={formatCount(s.enteredCount)} />
        <SummaryTile label={text('총 매수', 'Issued')} value={formatCount(s.totalIssuedCount)} />
        <SummaryTile
          label={text('중복 시도', 'Duplicates')}
          value={formatCount(s.duplicateAttemptCount)}
        />
      </div>
    </section>
  )
}

/* ── 입장 이력 ────────────────────────────────────────────────────────── */

/**
 * 표의 열 머리글. PC 표와 모바일 패널이 **같은 순서**를 쓴다(§5.21).
 *
 * ⚠ 명세의 열은 "시각(KST)·티켓 종류·중복 시도 여부 배지"인데 `EntryLogItem`에
 *    **티켓 종류(`ticketTypeName`)가 없다** — 있는 것은 `ticketId`뿐이다(entry-01 응답에는 있다).
 *    종류를 지어낼 수 없어 티켓 열에는 식별자 `#{ticketId}`를 찍는다. 명세가 개정돼
 *    `ticketTypeName`이 오면 그 값으로 바꾼다. 개인정보(`holderNameMasked`)는 쓰지 않는다.
 */
const LOG_COLUMNS = ['시각', '티켓', '판정'] as const

/** 시각·티켓 식별자도 선택 필드다. 없으면 자리만 비운다(지어내지 않는다) */
function formatWhen(iso: string | undefined): string {
  return iso ? formatKst(iso) : '—'
}

function formatTicket(ticketId: number | undefined): string {
  return ticketId == null ? '—' : `#${ticketId}`
}

/** 실패 사유 한 줄. 코드에 대응하는 문구가 없으면 코드를 그대로 보여준다(`entryErrors`) */
function FailureText({ item }: { item: EntryLogItem }) {
  const { language } = useLocale()
  if (item.result !== 'FAILED') return null
  const copy =
    language === 'ko'
      ? entryFailureText(item.failureCode)
      : item.failureCode
        ? `Verification failed (${item.failureCode})`
        : 'Verification failed'
  return <span className="font-sans text-[11px] text-muted">{copy}</span>
}

function EntryLogList({ items }: { items: EntryLogItem[] }) {
  const { language, text } = useLocale()
  const columns = language === 'ko' ? LOG_COLUMNS : (['Time', 'Ticket', 'Result'] as const)
  if (items.length === 0) {
    /*
     * 빈 상태(1422행 "빈: 입장 이력 없음"). §5.7은 "안내 문구 + 다음 행동 버튼"인데
     * ⚠ 이 화면에서 스태프가 할 다음 행동은 **스캔뿐**이고 그 버튼은 하단 고정으로 이미 있다.
     *   버튼을 한 번 더 두지 않는다(공연자 경로에는 아예 다음 행동이 없다).
     */
    return (
      <p
        role="status"
        className="m-0 rounded-card border border-line bg-surface px-4 py-14 text-center font-sans text-[13px] text-muted"
      >
        {text('아직 입장 이력이 없습니다', 'No entry activity yet.')}
      </p>
    )
  }

  return (
    <>
      {/* ── PC: 폭 100% 표(1408행) ── */}
      <div className="hidden overflow-hidden rounded-card border border-line bg-surface md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              {columns.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className="px-4 py-2.5 font-sans text-[11px] font-semibold text-muted"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              // 식별자도 선택 필드라 없으면 순번으로 키를 만든다(행을 버리지 않는다)
              <tr key={item.entryLogId ?? index} className="border-b border-line last:border-b-0">
                <td className="px-4 py-3 font-num text-[13px] tabular-nums text-ink">
                  {formatWhen(item.scannedAt)}
                </td>
                <td className="px-4 py-3 font-mono text-[13px] text-ink">
                  {formatTicket(item.ticketId)}
                </td>
                <td className="px-4 py-3">
                  <ResultBadge item={item} />
                  <span className="mt-0.5 block">
                    <FailureText item={item} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 모바일: 행 하나 = 패널 하나(§5.21). 가로 스크롤을 만들지 않는다 ── */}
      <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
        {items.map((item, index) => (
          <li
            key={item.entryLogId ?? index}
            className="rounded-card border border-line bg-surface px-4 py-3"
          >
            {/* 표의 첫 열(시각)이 패널 제목이 된다 — PC에서 왼쪽에 있던 값이 위에 온다 */}
            <span className="block font-num text-[13px] font-bold tabular-nums text-ink">
              {formatWhen(item.scannedAt)}
            </span>
            <InfoRow label={columns[1]}>
              <span className="font-mono">{formatTicket(item.ticketId)}</span>
            </InfoRow>
            <InfoRow label={columns[2]}>
              <ResultBadge item={item} />
              <span className="mt-0.5 block">
                <FailureText item={item} />
              </span>
            </InfoRow>
          </li>
        ))}
      </ul>
    </>
  )
}

/* ── 로딩·에러 ────────────────────────────────────────────────────────── */

/** 1422행 "로딩: 스켈레톤". 요약 → 이력의 자리를 그대로 잡는다 */
function Skeleton() {
  const { text } = useLocale()
  return (
    <div
      aria-busy="true"
      aria-label={text('입장 현황을 불러오는 중', 'Loading entry activity')}
      className="flex flex-col gap-4"
    >
      <div className="h-28 animate-pulse rounded-card bg-ground-2 md:h-24" />
      <div className="h-64 animate-pulse rounded-card bg-ground-2" />
    </div>
  )
}

/**
 * 1422행 에러 — `ENTRY_SCANNER_NOT_AUTHORIZED`(403)·`COMMON_FORBIDDEN`(403).
 *
 * 권한 실패는 **데이터를 일절 노출하지 않는다** — 요약도 이력도 그리지 않고 이 패널만 남는다.
 * 다시 시도 버튼은 권한 실패에는 두지 않는다(눌러도 같은 결과다).
 */
function ErrorPanel({ text, onRetry }: { text: string; onRetry?: () => void }) {
  const { text: localeText } = useLocale()
  return (
    <section
      role="alert"
      className="rounded-card border border-danger bg-surface px-4 py-10 text-center"
    >
      <p className="m-0 mb-1 font-sans text-sm font-semibold text-ink">
        {localeText('입장 현황을 불러오지 못했습니다', 'Could not load entry activity')}
      </p>
      <p className="m-0 mb-4 font-sans text-[13px] text-muted">{text}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {localeText('다시 시도', 'Try again')}
        </Button>
      )}
    </section>
  )
}

/* ── 화면 ─────────────────────────────────────────────────────────────── */

interface Props {
  /**
   * 공연명 — S-03 **영역 구성**의 헤더다.
   * ⚠ `EntryStatusData`에 공연명이 없다. 상위(페이지)가 받아 넘긴다.
   */
  title: string
  data?: EntryStatusData
  loading?: boolean
  /** 실패 코드. `code`로만 분기한다 */
  errorCode?: string
  /** 서버 `msg`. 안내 문구 뒤에 덧붙인다(§5.5) */
  errorMsg?: string
  onRetry?: () => void
  onRefresh?: () => void
  /**
   * S-02 경로(`/scan/{token}`). **검표 링크로 들어왔을 때만** 넘긴다 —
   * 이 값의 유무가 곧 "검표 담당자 경로인가"이고, 복귀 버튼과 자체 헤더가 여기에 달린다(1417행).
   */
  scanTo?: string
}

export function EntryStatus({
  title,
  data,
  loading = false,
  errorCode,
  errorMsg,
  onRetry,
  onRefresh,
  scanTo,
}: Props) {
  const { language, text } = useLocale()
  const staff = scanTo != null

  /*
   * 폭 제한(1408행 최대폭 960px)은 **검표 링크 경로에서만** 이 컴포넌트가 건다.
   * 공연자 경로는 `StudioShell`이 이미 자기 본문 폭을 갖고 있어 여기서 또 걸면 두 번 좁아진다.
   * 하단 여백은 복귀 버튼이 하단 고정인 모바일에서만 필요하다(§5.19).
   */
  const frame = [
    'flex flex-col gap-4 px-3 pt-3 md:gap-6 md:pt-0',
    staff ? 'mx-auto w-full max-w-[960px] md:px-4' : 'md:px-0',
    staff ? 'pb-24 md:pb-8' : 'pb-8 md:pb-0',
  ].join(' ')

  /** 이력은 선택 필드다. 안 오면 "빈 이력"으로 그린다 — 그 판단은 목록 컴포넌트가 한다 */
  const items = data?.items ?? []

  const body = loading ? (
    <Skeleton />
  ) : errorCode || !data ? (
    <ErrorPanel
      text={
        language === 'ko'
          ? (entryFailureText(errorCode, errorMsg) ?? '잠시 후 다시 시도해 주세요.')
          : (errorMsg ??
            (errorCode === 'COMMON_FORBIDDEN'
              ? 'Only participating teams can view this entry ledger.'
              : 'Please try again in a moment.'))
      }
      // 권한 실패는 재시도로 풀리지 않는다 — 그 코드에서는 버튼을 감춘다
      onRetry={errorCode ? undefined : onRetry}
    />
  ) : (
    <>
      <EntrySummaryPanel data={data} onRefresh={onRefresh} />
      <section aria-label={text('입장 이력', 'Entry activity')}>
        <h2 className="mb-2 font-sans text-[11px] font-semibold text-muted md:text-xs">
          {text('입장 이력', 'Entry activity')}
        </h2>
        <EntryLogList items={items} />
        {items.length > 0 && (
          /*
           * ⚠ 명세에 "더 보기"·페이지네이션 컴포넌트가 없다(entry-02는 `pageInfo.hasNext`를 준다).
           *   버튼을 지어내지 않고, 지금 보이는 것이 전체가 아님을 문구로만 알린다.
           */
          <p className="m-0 mt-2 font-sans text-[11px] text-muted">
            {text('최근', 'Showing')} {formatCount(items.length)}
            {text('건', '')} · {text('전체', 'total')} {formatCount(data.pageInfo?.totalElements)}
            {text('건', '')}
          </p>
        )}
      </section>
    </>
  )

  return (
    <>
      {staff ? (
        // 검표 담당자 경로 — 껍데기가 없다. 공연명만 얹은 얇은 헤더를 직접 그린다(로그인 UI 없음)
        <header className="entry-ledger__header border-b border-line bg-surface px-3 py-2.5">
          <div className="mx-auto flex w-full max-w-[960px] items-center gap-2">
            <p className="m-0 min-w-0 flex-1 truncate font-sans text-[15px] font-bold text-ink">
              {title}
            </p>
            <p className="m-0 shrink-0 font-sans text-[11px] text-muted">
              {text('입장 현황', 'Entry activity')}
            </p>
          </div>
        </header>
      ) : null}

      <div className={`entry-ledger ${frame}`}>
        {/*
          공연자 경로의 공연명 — PC에서만 찍는다. 모바일은 `StudioShell` 상단 바가 이미 공연명을
          달고 있어 같은 문자열이 두 번 나오면 좁은 화면에서 두 줄을 낭비한다(`SalesStatus`와 동일).
        */}
        {!staff && (
          <h2 className="m-0 hidden font-sans text-2xl font-bold text-ink md:block">{title}</h2>
        )}

        {body}
      </div>

      {/* 스캔 화면 복귀 버튼 — 검표 링크 진입 시에만(1417행). 모바일은 하단 고정(§5.19) */}
      {staff && scanTo && (
        <>
          <FixedBottom>
            <Link
              to={scanTo}
              className="flex h-12 w-full items-center justify-center rounded-control bg-primary font-sans text-[15px] font-semibold text-white"
            >
              {text('스캔 화면으로', 'Back to scanner')}
            </Link>
          </FixedBottom>

          {/* PC는 하단 고정을 쓰지 않는다(§5.19) — 본문 마지막 줄 오른쪽에 둔다 */}
          <div className="mx-auto hidden w-full max-w-[960px] justify-end px-4 pb-8 md:flex">
            <Link
              to={scanTo}
              className="flex h-11 items-center rounded-control bg-primary px-4 font-sans text-sm font-semibold text-white"
            >
              {text('스캔 화면으로', 'Back to scanner')}
            </Link>
          </div>
        </>
      )}
    </>
  )
}
