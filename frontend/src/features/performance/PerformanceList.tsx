/**
 * A-15 공연 목록(전체 공연) — 라우트 `/performances`.
 *
 * 화면설계 v6.3 A-15와 2026-09-18 Wave 1 개편이 현재 표시 계약이다.
 *   데이터와 공통 요소는 아래 계약을 유지한다 —
 *     · A-01 홈(§4 A-01) — 날짜 필터 칩 · 공연 카드 · 빈 상태 문구 · 상태 분기
 *     · §5.17 헤더 · §5.18 하단 탭바 · §5.20 카드 그리드(1열 / 2열 / 4열)
 *     · API `GET /api/v1/performances`(performance_02) — 필터·정렬·페이지 파라미터의 정본
 *   API 파라미터와 페이지 어댑터는 시각 개편과 분리해 유지한다.
 *
 * **이 화면이 필요한 이유** — A-01 각 섹션의 "More / 더 보기"가 이미 `/performances`를
 * 가리키는데 라우트가 없어 404였다(`HomeScreen.tsx`). 홈은 섹션당 몇 장만 보여 주고,
 * 전체를 검색·필터로 훑는 자리가 없었다.
 *
 * 검색은 헤더 한 곳으로 통합한다(2026-09-23 사용자 피드백).
 * 본문에는 적용한 검색어와 초기화, 날짜·판매 상태·정렬만 남긴다.
 *
 * 홈(A-01)에서 검색을 확정하면 `/performances?keyword=…`로 넘어온다(v6.3 라우팅 규칙).
 * 그 값을 URL에서 읽어 초기 검색어로 쓴다 — 그래야 홈에서 넘어온 검색어가 유지된다.
 *
 * ── 필터·정렬은 API가 받는 것만 ────────────────────────────────────
 * performance_02가 받는 것은 `keyword` · `fromDate` · `toDate` · `status` · `page` · `size` ·
 * `sort`뿐이다. 장르·지역·가격대 같은 것은 **만들지 않았다.** `status`도 명세 enum이
 * `ON_SALE`·`SALE_CLOSED` 둘뿐이라 칩도 그 둘 + 전체 셋이다.
 *
 * ── SegmentedFilter를 쓰지 않은 이유 ──────────────────────────────
 * `features/wallet/SegmentedFilter`는 다른 feature에 있고 **features끼리 import는 금지**다
 * (기술 스택 v3 §3.2). 공유하려면 `shared/ui`로 올려야 하는데 그건 이 작업 범위 밖이라,
 * 목록 안에 같은 역할의 칩을 두고 선택은 색과 체크 표시, aria-pressed로 전달한다.
 */

import { Link } from 'react-router'

import { ShowCard } from '@/features/performance/ShowCard'
import type { ShowCardData } from '@/features/performance/ShowCard'
import {
  SORT_OPTIONS,
  STATUS_FILTERS,
  KEYWORD_MAX_LENGTH,
} from '@/features/performance/performanceListModel'
import type {
  DateChip,
  DateChipKey,
  PageMeta,
  PerformanceSort,
  StatusFilterKey,
} from '@/features/performance/performanceListModel'
import { CommonCode } from '@/shared/api/errorCodes'
import { useLocale } from '@/shared/i18n/useLocale'
import { AppHeader, BottomNav, Button, PageSkeleton } from '@/shared/ui'
import './performance-list.css'

export interface PerformanceListFilters {
  keyword: string
  dateChip: DateChipKey
  status: StatusFilterKey
  sort: PerformanceSort
}

/**
 * 화면 상태.
 *   · `loading`     — 첫 조회·필터 변경 후 재조회. 그리드 자리에 스켈레톤
 *   · `loadingMore` — "더 보기" 진행. 이미 받은 카드는 그대로 두고 버튼만 바뀐다
 *   · `error`       — 목록을 못 받았다. 목록 자체가 없으므로 토스트가 아니라 본문에 세운다
 *   · `ready`       — 결과가 있거나(그리드) 없다(빈 상태)
 */
export type PerformanceListState = 'loading' | 'loadingMore' | 'error' | 'ready'

interface Props {
  /** `toShowCard`로 옮긴 카드들. "더 보기"로 누적된 전체다 */
  items: ShowCardData[]
  /** 응답 `data.pageInfo`. 없으면 개수·더 보기를 그리지 않는다 */
  pageInfo?: PageMeta
  /** §5.4 환율 각주(`rateNote`). 환율이 없으면 넘기지 않는다 — 환산만 감춘다 */
  rateFootnote?: string
  filters: PerformanceListFilters
  keywordDraft: string
  dateChips: readonly DateChip[]
  state: PerformanceListState
  /** 실패 응답의 `code`. **`msg`로 분기하지 않는다**(공통 응답 규격 §1) */
  errorCode?: string
  signedIn?: boolean
  onKeywordChange: (v: string) => void
  onKeywordSubmit: (v: string) => void
  onKeywordClear: () => void
  onDateChipChange: (key: DateChipKey) => void
  onStatusChange: (key: StatusFilterKey) => void
  onSortChange: (key: PerformanceSort) => void
  onResetFilters: () => void
  onLoadMore: () => void
  onRetry: () => void
  loadMoreError?: boolean
}

/** 선택 상태는 aria-pressed와 feature-local 색/체크 표시로 전달한다. */
function FilterChip({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={[
        'performance-list__chip shrink-0 cursor-pointer rounded-chip border px-3.5 py-2 font-sans text-xs font-semibold',
        'transition-colors duration-150 ease-out md:text-[13px]',
        selected ? 'border-line bg-sel-soft text-ink' : 'border-line bg-surface text-muted',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

/** 로딩 스켈레톤 — 그리드와 같은 열 수로 깔아야 결과가 들어올 때 자리가 튀지 않는다 */
function GridSkeleton() {
  return <PageSkeleton variant="list" />
}

/**
 * 에러 — **`code`로만 분기한다.** 목록을 통째로 못 받은 상태라 A-01의 "토스트 + 재시도"
 * 대신 본문에 세운다(토스트만 띄우면 빈 화면에 이유가 남지 않는다).
 *
 * 400 `COMMON_VALIDATION_FAILED`는 정상 조작으로는 나오지 않는다(칩·정렬이 명세 enum이고
 * size가 20 고정이다). 그래도 자리를 두는 이유는, 나면 **우리 쪽 파라미터 버그**라서
 * "다시 시도"가 아니라 "필터 초기화"로 빠져나가야 하기 때문이다.
 */
/**
 * 목록을 못 받았을 때 본문에 세우는 상태. **A-01 홈(`HomeScreen`)도 이걸 그대로 쓴다** —
 * 같은 엔드포인트(performance_02)의 같은 실패라 문구가 두 벌이면 한쪽만 고쳐진다.
 * (이 파일은 Fast Refresh 때문에 컴포넌트만 export한다.)
 */
export function ErrorState({
  code,
  onRetry,
  onResetFilters,
}: {
  code?: string
  onRetry: () => void
  onResetFilters: () => void
}) {
  const { text } = useLocale()
  const validation = code === CommonCode.VALIDATION_FAILED
  const rateLimited = code === CommonCode.TOO_MANY_REQUESTS

  const en = validation
    ? "We couldn't apply those filters."
    : rateLimited
      ? 'Too many requests. Please wait a moment.'
      : "We couldn't load the shows."
  const ko = validation
    ? '필터 조건을 적용하지 못했습니다'
    : rateLimited
      ? '요청이 많습니다. 잠시 후 다시 시도해 주세요'
      : '공연 목록을 불러오지 못했습니다'

  return (
    <div role="alert" className="px-3 py-16 text-center md:px-0">
      <p className="mb-4 font-sans text-sm font-semibold text-ink">{text(ko, en)}</p>
      <Button variant="secondary" sm onClick={validation ? onResetFilters : onRetry}>
        {validation ? text('필터 초기화', 'Reset filters') : text('다시 시도', 'Try again')}
      </Button>
    </div>
  )
}

/**
 * 빈 상태 두 갈래.
 *   · 필터가 걸려 있으면 A-01과 **같은 문구**를 쓰고 초기화로 빠져나갈 길을 준다
 *   · 필터가 하나도 없는데 비었다면 조건 문제가 아니라 **판매 중인 공연이 없는 것**이다.
 *     이때 "필터 초기화"를 내밀면 눌러도 아무 일이 없어 사용자를 속인다
 */
function EmptyState({
  filtered,
  onResetFilters,
}: {
  filtered: boolean
  onResetFilters: () => void
}) {
  const { text } = useLocale()
  if (!filtered) {
    return (
      <div role="status" className="px-3 py-16 text-center md:px-0">
        <p className="mb-1 font-sans text-sm font-semibold text-ink">
          {text('아직 판매 중인 공연이 없습니다', 'No shows are on sale yet.')}
        </p>
        <Link to="/" className="font-sans text-[13px] font-semibold text-sel">
          {text('홈으로', 'Back to home')}
        </Link>
      </div>
    )
  }

  return (
    <div role="status" className="px-3 py-16 text-center md:px-0">
      <p className="mb-3 font-sans text-sm text-muted">
        {text('조건에 맞는 공연이 없습니다', 'No shows match your filters.')}
      </p>
      <button
        type="button"
        onClick={onResetFilters}
        className="cursor-pointer font-sans text-[13px] font-semibold text-sel"
      >
        {text('필터 초기화', 'Reset filters')}
      </button>
    </div>
  )
}

export function PerformanceList({
  items,
  pageInfo,
  rateFootnote,
  filters,
  keywordDraft,
  dateChips,
  state,
  errorCode,
  signedIn,
  onKeywordChange,
  onKeywordSubmit,
  onKeywordClear,
  onDateChipChange,
  onStatusChange,
  onSortChange,
  onResetFilters,
  onLoadMore,
  onRetry,
  loadMoreError = false,
}: Props) {
  const { text } = useLocale()
  const keyword = filters.keyword.trim()
  // "필터가 걸려 있다" = API로 나가는 파라미터가 기본값과 다르다. 정렬은 필터가 아니다 —
  // 정렬을 바꿨다고 결과 개수가 달라지지 않으므로 빈 상태의 원인이 될 수 없다
  const filtered = keyword.length > 0 || filters.dateChip !== 'any' || filters.status !== 'ALL'
  const total = pageInfo?.totalElements

  return (
    <div className="min-h-dvh pb-16 md:pb-0">
      {/* 검색은 헤더 한 곳에서 확정하고, 본문은 날짜·상태·정렬을 담당한다. */}
      <AppHeader
        signedIn={signedIn}
        query={keywordDraft}
        onQueryChange={onKeywordChange}
        onSearchSubmit={onKeywordSubmit}
      />

      <main className="performance-list">
        {/* ── 제목 줄 ── */}
        <header className="performance-list__masthead">
          <h1>
            {keyword
              ? text(`“${keyword}” 검색 결과`, `Search results for “${keyword}”`)
              : text('공연', 'Shows')}
          </h1>

        </header>

        <section
          className="performance-list__filters"
          aria-label={text('공연 필터', 'Filter shows')}
        >
          {/* ── 날짜 필터 칩 — A-01과 같은 가로 스크롤 한 줄 ── */}
          <div
            role="group"
            aria-label={text('날짜 필터', 'Date filter')}
            className="performance-list__filter-group"
          >
            <span className="performance-list__filter-label" aria-hidden="true">
              {text('날짜', 'Date')}
            </span>
            {dateChips.map((c) => (
              <FilterChip
                key={c.key}
                label={
                  c.key === 'any'
                    ? text('전체 날짜', c.label)
                    : c.key === 'thisWeek'
                      ? text('이번 주', c.label)
                      : c.key === 'nextWeek'
                        ? text('다음 주', c.label)
                        : text(`${Number(c.key.split('-')[1])}월`, c.label)
                }
                selected={c.key === filters.dateChip}
                onClick={() => onDateChipChange(c.key)}
              />
            ))}
          </div>

          {/* ── 상태 칩 + 정렬 ──
            정렬은 값이 3개뿐이고 "고르면 목록이 다시 온다"는 점에서 칩과 역할이 겹치지 않게
            네이티브 select로 둔다. 모바일에서 OS 피커가 그대로 열리는 편이 칩 줄이 두 줄로
            늘어나는 것보다 낫다 */}
          <div
            role="group"
            aria-label={text('판매 상태 필터', 'Sale status')}
            className="performance-list__filter-group"
          >
            <span className="performance-list__filter-label" aria-hidden="true">
              {text('판매', 'Sales')}
            </span>
            {STATUS_FILTERS.map((s) => (
              <FilterChip
                key={s.key}
                label={text(s.ko, s.en)}
                selected={s.key === filters.status}
                onClick={() => onStatusChange(s.key)}
              />
            ))}
          </div>
        </section>

        {/* ── 적용된 검색어 칩 ──
            모바일 헤더에서는 검색이 아이콘 뒤로 접혀 무엇으로 걸렀는지 보이지 않는다.
            여기서 보여 주고, 여기서 지울 수 있게 한다 */}
        {keyword.length > 0 && (
          <div className="performance-list__applied">
            <button
              type="button"
              onClick={onKeywordClear}
              aria-label={text(`검색어 ${keyword} 지우기`, `Clear search ${keyword}`)}
              className="inline-flex min-h-11 max-w-full cursor-pointer items-center gap-1.5 rounded-chip border border-line bg-sel-soft px-3 py-1.5 font-sans text-xs text-ink"
            >
              <span className="truncate">
                {/* 명세 maxLength 50 — 그보다 긴 값은 서버로도 잘려 나가므로 표시도 맞춘다 */}
                {text('검색어', 'Keyword')}: {keyword.slice(0, KEYWORD_MAX_LENGTH)}
              </span>
              <span aria-hidden className="text-muted">
                ×
              </span>
            </button>
          </div>
        )}

        <section aria-label={text('공연 결과', 'Show results')}>
          <div className="performance-list__results-bar">
            <p className="performance-list__count" aria-live="polite">
              {(state === 'ready' || state === 'loadingMore') && total != null
                ? text(
                    `${total.toLocaleString('ko-KR')}개 공연`,
                    `${total.toLocaleString('en-US')} shows`,
                  )
                : text('공연 목록', 'Shows')}
            </p>
            <label className="performance-list__sort">
              <span>{text('정렬', 'Sort')}</span>
              <select
                value={filters.sort}
                onChange={(e) => onSortChange(e.target.value as PerformanceSort)}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {text(o.ko, o.en)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {/* ── 본문 ── */}
          {state === 'loading' ? (
            <GridSkeleton />
          ) : state === 'error' ? (
            <ErrorState code={errorCode} onRetry={onRetry} onResetFilters={onResetFilters} />
          ) : items.length === 0 ? (
            <EmptyState filtered={filtered} onResetFilters={onResetFilters} />
          ) : (
            <>
              {/* 모바일 1열 / 768~1023 2열 / ≥1024 4열 — §5.20. 4장 미만이면 좌측 정렬로 남는다
                (그리드를 늘려 빈칸을 만들지 않는다). 카드는 홈과 **같은** `ShowCard`라
                클릭 연출(useStageLink + claimPosterName)도 홈과 같다 */}
              <ul
                aria-label={text('공연', 'Shows')}
                className="performance-list__grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
              >
                {items.map((s) => (
                  <li key={s.performanceId}>
                    <ShowCard data={s} />
                  </li>
                ))}
              </ul>

              {/* ── 더 보기 ──
                응답 `pageInfo`가 주는 것은 `page·size·totalElements·hasNext`다. 페이지 번호를
                줄줄이 세우는 것보다 `hasNext` 한 값을 그대로 쓰는 "더 보기"가 이 응답에 맞고,
                카드 그리드에서 스크롤 위치가 유지된다. 몇 장까지 봤는지는 `totalElements`로 적는다 */}
              <div className="flex flex-col items-center gap-2 px-3 pt-6 md:px-0 md:pt-10">
                {total != null && (
                  <p className="m-0 font-sans text-xs text-muted">
                    {text(
                      `전체 ${total.toLocaleString('ko-KR')}개 중 ${items.length.toLocaleString('ko-KR')}개 표시`,
                      `${items.length.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} shows`,
                    )}
                  </p>
                )}
                {pageInfo?.hasNext && loadMoreError ? (
                  <div role="alert" className="flex flex-col items-center gap-2">
                    <p className="m-0 font-sans text-xs text-muted">
                      {text('공연을 더 불러오지 못했습니다', "Couldn't load more shows.")}
                    </p>
                    <Button variant="secondary" onClick={onLoadMore}>
                      {text('다시 시도', 'Try again')}
                    </Button>
                  </div>
                ) : pageInfo?.hasNext ? (
                  <Button
                    variant="secondary"
                    onClick={onLoadMore}
                    disabled={state === 'loadingMore'}
                    aria-busy={state === 'loadingMore'}
                  >
                    {state === 'loadingMore'
                      ? text('불러오는 중…', 'Loading…')
                      : text('더 보기', 'Load more')}
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </section>

        {/* 환율 각주 — §5.4 "적용 환율과 기준 시각". 목록이라 카드마다 붙이지 않고 한 번만 적는다.
            환율이 없으면 통째로 사라진다(환산만 감추고 원 값은 카드에 그대로 있다) */}
        {rateFootnote && state === 'ready' && items.length > 0 && (
          <p className="m-0 px-3 pt-4 font-sans text-[11px] text-muted md:px-0 md:pt-6">
            {rateFootnote}
          </p>
        )}

        <div className="h-8 md:h-14" />
      </main>

      <BottomNav />
    </div>
  )
}
