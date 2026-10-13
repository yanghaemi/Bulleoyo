/**
 * A-15 공연 목록 페이지 — 라우트 `/performances`.
 *
 * ⚠ **A-15는 화면설계 v6에 절이 아직 없다.** 근거와 판단은 `features/performance/PerformanceList.tsx`
 *   상단 주석과 `_workspace/fe_performance-a15_api-usage.md`에 있다.
 *
 * ── API: `GET /api/v1/performances` (performance_02, 무인증 공개 목록) ──────────
 *   query : `toListQuery()`가 만든 객체를 그대로 쿼리스트링으로 (keyword·fromDate·toDate·
 *           status·page·size·sort). **이 밖의 파라미터는 명세에 없다.**
 *   200   : `data = { rate?, items[], pageInfo }` → `toShowCard(item, data.rate)`로 카드로 옮긴다
 *   에러  : 400 `COMMON_VALIDATION_FAILED` · 429 `COMMON_TOO_MANY_REQUESTS` ·
 *           (§0.10 공통) 500 `COMMON_INTERNAL_ERROR`. **`code`로만 분기한다**(규격 §1)
 *   캐시  : 서버가 30초 캐시한다(performance_02). 클라이언트는 기본 staleTime만 둔다
 *
 * 인증 헤더는 **일부러 뗴지 않는다.** 공개 API지만 로그인 상태면 서버가 회원 표시 통화로
 * `rate`를 맞춰 준다(§0.5). 토큰이 없으면 클라이언트가 헤더를 붙이지 않으므로 그대로 공개 조회다.
 *
 * "더 보기"는 `useInfiniteQuery`다 — 페이지를 이어 붙이는 누적 상태를 직접 들고 있지 않는다.
 */

import { useMemo, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'

import { PerformanceList } from '@/features/performance/PerformanceList'
import type {
  PerformanceListFilters,
  PerformanceListState,
} from '@/features/performance/PerformanceList'
import {
  KEYWORD_MAX_LENGTH,
  buildDateChips,
  rateNote,
  toListQuery,
  toShowCard,
} from '@/features/performance/performanceListModel'
import type {
  DateChipKey,
  PerformanceListData,
  PerformanceSort,
  StatusFilterKey,
} from '@/features/performance/performanceListModel'
import { api, isApiError, tokenStore } from '@/shared/api/client'
import type { QueryParams } from '@/shared/api/client'
import { qk } from '@/shared/queries/keys'
import { useLocale } from '@/shared/i18n/useLocale'

const DEFAULT_FILTERS: PerformanceListFilters = {
  keyword: '',
  dateChip: 'any',
  status: 'ALL',
  sort: 'startAt,asc',
}

function fetchPerformances(
  filters: PerformanceListFilters,
  page: number,
  signal: AbortSignal,
): Promise<PerformanceListData> {
  const query: QueryParams = { ...toListQuery({ ...filters, page }) }
  return api.get<PerformanceListData>('/performances', { query, signal, public: true })
}

export function PerformanceListPage() {
  const { language } = useLocale()
  /**
   * URL의 `?keyword=`를 **첫 값으로만** 읽는다(화면설계 v6.3 A-15 라우팅 규칙).
   * A-01에서 검색을 확정하면 `/performances?keyword=…`로 넘어오는데, 그 검색어가 유지되지
   * 않으면 홈에서 친 것이 사라진다.
   *
   * 이후에는 입력이 정본이다 — 매 글자마다 URL을 다시 쓰면 뒤로 가기가 글자 수만큼 쌓인다.
   * 명세의 "최대 50자"도 여기서 자른다. URL은 사용자가 손으로 고칠 수 있는 값이라
   * 화면이 받을 때 한 번 더 막는다.
   */
  const [searchParams] = useSearchParams()
  const initialKeyword = (searchParams.get('keyword') ?? '').slice(0, KEYWORD_MAX_LENGTH)
  const initialStatus = searchParams.get('status')
  const [filters, setFilters] = useState<PerformanceListFilters>(() => ({
    ...DEFAULT_FILTERS,
    keyword: initialKeyword,
    status: initialStatus === 'ON_SALE' || initialStatus === 'SALE_CLOSED' ? initialStatus : 'ALL',
  }))
  const [keywordDraft, setKeywordDraft] = useState(initialKeyword)

  // 날짜 칩은 오늘(KST) 기준으로 만든다. 마운트 시 한 번만 — 매 렌더 새 배열이면 칩이 흔들린다
  const dateChips = useMemo(() => buildDateChips(), [])

  const list = useInfiniteQuery({
    // page는 키에 넣지 않는다. 필터가 바뀌면 새 키 = 첫 페이지부터 다시 받는다.
    // **키는 반드시 `qk` 에서 만든다** — 손으로 쓴 `['performances', …]` 는 `qk.performance`
    // (`['performance', …]`)와 한 글자가 달라 어떤 무효화에도 걸리지 않았다. 공연 생성·취소
    // (`useCreatePerformance`·`useCancelPerformance`·`invalidatedBy('CREATE_SHOW')`)가
    // `qk.performance.all` 을 무효화해도 이 목록만 옛 데이터를 그대로 보여준다.
    queryKey: qk.performance.list(toListQuery({ ...filters, page: 0 })),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => fetchPerformances(filters, pageParam, signal),
    // 0-base. `hasNext`가 false면 undefined → "더 보기"가 사라진다
    getNextPageParam: (last) => (last.pageInfo.hasNext ? last.pageInfo.page + 1 : undefined),
  })

  const pages = list.data?.pages
  // 환율(§0.5 축약형)은 응답 루트에 하나다. 페이지마다 반복되므로 첫 장 값을 쓴다
  const rate = pages?.[0]?.rate
  const items = useMemo(
    () => (pages ?? []).flatMap((p) => p.items).map((it) => toShowCard(it, rate, language)),
    [pages, rate, language],
  )

  const state: PerformanceListState = list.isPending
    ? 'loading'
    : list.isError && !pages?.length
      ? 'error'
      : list.isFetchingNextPage
        ? 'loadingMore'
        : 'ready'

  /** 필터가 바뀌면 첫 페이지로 돌아간다 — 쿼리 키가 바뀌므로 페이지 상태도 함께 초기화된다 */
  const applyFilters = (next: Partial<PerformanceListFilters>) => {
    setFilters((prev) => ({ ...prev, ...next }))
  }

  return (
    <PerformanceList
      items={items}
      pageInfo={pages?.[pages.length - 1]?.pageInfo}
      rateFootnote={rateNote(rate, language)}
      filters={filters}
      keywordDraft={keywordDraft}
      dateChips={dateChips}
      state={state}
      // 실패 응답의 code만 넘긴다. msg로 분기하지 않는다(규격 §1)
      errorCode={isApiError(list.error) ? list.error.code : undefined}
      // ponytail: 세션 유무만 본다(헤더 로그인 버튼 표시용). 회원 조회 쿼리가 생기면 그걸로 바꾼다
      signedIn={tokenStore.hasSession()}
      onKeywordChange={setKeywordDraft}
      onKeywordSubmit={(keyword) => applyFilters({ keyword })}
      onKeywordClear={() => {
        setKeywordDraft('')
        applyFilters({ keyword: '' })
      }}
      onDateChipChange={(dateChip: DateChipKey) => applyFilters({ dateChip })}
      onStatusChange={(status: StatusFilterKey) => applyFilters({ status })}
      onSortChange={(sort: PerformanceSort) => applyFilters({ sort })}
      onResetFilters={() => {
        setKeywordDraft('')
        setFilters(DEFAULT_FILTERS)
      }}
      loadMoreError={list.isFetchNextPageError}
      onLoadMore={() => void list.fetchNextPage()}
      onRetry={() => void list.refetch()}
    />
  )
}

export default PerformanceListPage
