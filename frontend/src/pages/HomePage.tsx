/**
 * A-01 홈 페이지 — 라우트 `/`. 모바일 하단 탭 1번째.
 *
 * ── API: `GET /api/v1/performances` (performance_02, 무인증 공개 목록) ──────────
 *   A-15(`PerformanceListPage`)와 **같은 엔드포인트·같은 모델**을 쓴다. 변환은
 *   `performanceListModel`의 `toListQuery` · `toShowCard` · `buildDateChips` · `rateNote`다.
 *   200  : `data = { rate?, items[], pageInfo }`
 *   에러 : 400 `COMMON_VALIDATION_FAILED` · 429 `COMMON_TOO_MANY_REQUESTS` ·
 *          500 `COMMON_INTERNAL_ERROR`. **`code`로만 분기한다**(규격 §1)
 *
 * 인증 헤더는 일부러 떼지 않는다 — 로그인 상태면 서버가 회원 표시 통화로 `rate`를 맞춰 준다(§0.5).
 *
 * 호출은 **한 번**이다. 섹션을 나누는 것은 클라이언트다(아래 `splitSections`).
 *
 * ── [v8] 섹션 ④ 맞춤 추천: `GET /api/v1/recommendations/performances` ────────────
 *   API-recommendation-01. **위 목록과 분리된 별도 요청**이고 로그인 회원만 부른다.
 *   200  : `data = { basis, sessionId, rate?, items[] }` — 항목은 목록 항목 + `matchedGenres`·`reason`.
 *          `rate`는 목록과 같은 §0.5 축약형이고 **이 응답의 것을 쓴다**(목록에서 빌리지 않는다)
 *   에러 : 명세가 적은 것은 401 `COMMON_UNAUTHORIZED`/`AUTH_TOKEN_EXPIRED` 하나다.
 *          **어떤 실패든 같은 안내 한 줄로 끝낸다**([v8.14] 탭 안이라 숨기면 빈 패널이 된다) —
 *          추천은 보조 정보라 홈을 막지 않는다(화면설계 v8 A-01). 그래서 code별 분기가 없다
 *   탭   : [v8.14] "AI 추천" 탭(`?tab=ai`)을 열 때만 부른다. 기본 탭은 판매중이다
 *   캐시 : `staleTime` 5분 · `refetchOnWindowFocus: false`. 조회마다 서버가 노출 로그 6건을
 *          남기므로 **재조회가 곧 분석 데이터 오염**이다. 선호 장르를 바꾸면 `useUpdateMyMember`가
 *          이 키를 무효화해 즉시 다시 받는다 — `staleTime`은 무효화를 막지 않는다
 */

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router'

import { HomeScreen } from '@/features/performance/HomeScreen'
import type { HomeView, RecommendedShow } from '@/features/performance/HomeScreen'
import { HOME_TAB_PARAM, parseHomeTab } from '@/features/performance/homeTabModel'
import type { HomeTab } from '@/features/performance/homeTabModel'
import type { CarouselItem } from '@/features/performance/ShowCarousel'
import type { ShowCardData } from '@/features/performance/ShowCard'
import { rateNote, toListQuery, toShowCard } from '@/features/performance/performanceListModel'
import type {
  PerformanceListData,
  PerformanceListItem,
  RateBrief,
} from '@/features/performance/performanceListModel'
import { RECOMMENDATION_MAX } from '@/features/performance/recommendationModel'
import type { RecommendationListData } from '@/features/performance/recommendationModel'
import {
  ApiError,
  api,
  ensureOptionalAccessToken,
  isApiError,
  tokenStore,
} from '@/shared/api/client'
import type { QueryParams } from '@/shared/api/client'
import { qk } from '@/shared/queries/keys'
import { useLocale } from '@/shared/i18n/useLocale'
import type { SupportedLanguage } from '@/shared/i18n'
import { formatKst } from '@/shared/ui'

/**
 * 홈 한 번 조회의 크기. **A-15의 `PAGE_SIZE`(20)와 다른 값이 의도다.**
 *
 * 두 화면 모두 `qk.performance.list(toListQuery(...))`로 키를 만드는데, A-15는
 * `useInfiniteQuery`(`{pages:[…]}`)이고 홈은 평범한 `useQuery`(평면 응답)다. 사용자가 A-15에서
 * "On sale" 칩을 고르면 status·sort·page가 홈과 모두 같아져 **키가 완전히 겹친다** — 모양이
 * 다른 두 캐시 값이 같은 칸을 다투게 된다. `size`를 다르게 두면 키가 갈려 그 충돌이 없다.
 * 섹션당 최대 8장(`DESKTOP_MAX`)이 두 섹션이라 16이면 채우고도 남는다.
 */
const HOME_PAGE_SIZE = 16

/**
 * "곧 마감"의 경계. A-01 정의는 **판매 마감까지 48시간 이내**이고 판매 마감은 공연 시작
 * 1분 전이므로, 시작 시각 기준으로는 48시간 1분이다.
 *
 * 정의의 나머지 절반인 "잔여 10% 이하"는 **판정할 수 없다** — 목록 응답에 잔여 수량이 없다.
 * `soldOut`(잔여 0%)만 그 조건을 확실히 만족하므로 그것만 쓴다. 흉내내지 않는다.
 */
const CLOSING_WINDOW_MS = 48 * 60 * 60 * 1000 + 60 * 1000

/**
 * 맞춤 추천의 캐시 수명(화면설계 v8 A-01 섹션 ④ — `staleTime` 5분).
 * 전역 기본값 30초를 쓰면 홈을 오갈 때마다 재조회가 나가고 그만큼 노출 로그가 쌓인다.
 */
const RECOMMENDATION_STALE_TIME_MS = 5 * 60 * 1000

interface HomeSections {
  sections: HomeView['sections']
  carousel: CarouselItem[]
}

function splitSections(
  items: PerformanceListItem[],
  rate: RateBrief | undefined,
  language: SupportedLanguage,
): HomeSections {
  const now = Date.now()
  const onSale: ShowCardData[] = []
  const closing: ShowCardData[] = []

  for (const item of items) {
    const card = toShowCard(item, rate, language)
    if (item.soldOut || Date.parse(item.startAt) - now <= CLOSING_WINDOW_MS) {
      closing.push({ ...card, closingSoon: true })
    } else {
      onSale.push(card)
    }
  }

  return {
    sections: {
      /**
       * **비운다.** "오픈 예정"은 `DRAFT`·`PENDING_AGREEMENT`인데 performance_02는
       * `ON_SALE`·`SALE_CLOSED`만 노출한다(명세 `status` enum). 이 API로는 만들 수 없어
       * 지어내지 않는다 — 빈 섹션은 `HomeScreen`이 통째로 감춘다.
       */
      opening: [],
      onSale,
      closing,
    },
    // 대표 공연은 받은 순서(= `startAt,asc`) 앞 3개다. 배너로 떨어질 일이 없어 `banner`는 두지 않는다
    carousel: items.slice(0, 3).map((item) => ({
      performanceId: String(item.performanceId),
      title: item.title,
      dateLabel: formatKst(item.startAt, undefined, language),
      venue: item.venueName,
      posterImageUrl: item.posterImageUrl,
    })),
  }
}

export function HomePage() {
  const { language } = useLocale()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  /**
   * 헤더 표시와 추천 섹션이 같은 기준을 본다. 세션 유무는 즉시 답이 나오고,
   * `GET /members/me`를 기다리면 홈이 한 프레임 비로그인처럼 그려진다
   */
  const signedIn = tokenStore.hasSession()
  /**
   * [v8.14] 판매중 / AI 추천 탭. 선택은 주소(`?tab=onsale|ai`)에 둔다 — A-02에 갔다가 뒤로
   * 오면 그대로다. 없는 값·잘못된 값은 판매중. 기록은 `replace`라 탭을 오간 횟수만큼
   * 뒤로가기 기록이 쌓이지 않는다
   */
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = parseHomeTab(searchParams.get(HOME_TAB_PARAM))
  const changeTab = (next: HomeTab) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        params.set(HOME_TAB_PARAM, next)
        return params
      },
      { replace: true },
    )
  }
  const aiTabOpen = tab === 'ai'

  const listQuery: QueryParams = {
    ...toListQuery({
      keyword: '',
      dateChip: 'any',
      status: 'ON_SALE',
      sort: 'startAt,asc',
      page: 0,
    }),
    size: HOME_PAGE_SIZE,
  }

  const list = useQuery({
    queryKey: qk.performance.list(listQuery),
    queryFn: ({ signal }) =>
      api.get<PerformanceListData>('/performances', { query: listQuery, signal, public: true }),
  })

  /**
   * 섹션 ④ 맞춤 추천(API-recommendation-01) — **다른 섹션과 분리된 별도 요청**이다.
   * 로그인 회원만 부르고, 실패는 조용히 섹션을 감춘다(401 포함) — 홈의 나머지는 그대로 뜬다.
   * 그래서 `retry: false`다. 재시도해도 사용자가 볼 것이 없고 요청만 늘어난다.
   *
   * ⚠ **이 조회는 부작용이 있다.** 서버가 응답을 만든 뒤 노출 6건을 `recommendation_log`에
   * 비동기로 남긴다(§14). 그래서 다른 조회와 달리 **재조회 자체가 비용**이다 — 같은 카드가
   * 새 `sessionId`로 여러 번 기록되면 basis별 전환율(설계 §10)의 분모가 부푼다.
   * 화면설계 v8 A-01 섹션 ④가 못 박은 두 옵션을 그대로 둔다.
   *
   * [v8.14] **"AI 추천" 탭을 열 때만 부른다**(`enabled`에 `aiTabOpen`). 판매중만 보는 사람에게는
   * 요청도 노출 로그도 없다. 한 번 받은 뒤 판매중으로 돌아가면 쿼리가 꺼질 뿐 캐시는 남아서,
   * 5분 안에 다시 열면 요청 없이 그 결과를 그린다(같은 키 `qk.recommendation.performances()`).
   */
  const recommendation = useQuery({
    queryKey: qk.recommendation.performances(),
    queryFn: async ({ signal }) => {
      const ready = await ensureOptionalAccessToken()
      if (!ready) {
        throw new ApiError({ code: 'COMMON_UNAUTHORIZED', status: 401, msg: '' })
      }
      return api.get<RecommendationListData>('/recommendations/performances', {
        signal,
        silentAuthFailure: true,
      })
    },
    enabled: signedIn && aiTabOpen,
    retry: false,
    // 전역 기본값(30초)보다 길게 — 홈을 오가며 재마운트해도 5분 안에는 다시 부르지 않는다.
    // 추천은 분 단위로 달라질 값이 아니라 캐시가 낡아 곤란할 일이 없다.
    staleTime: RECOMMENDATION_STALE_TIME_MS,
    // 전역 기본값과 같은 값이지만 **여기서는 명시한다**. 기본값이 언제 뒤집히든 이 쿼리만은
    // 포커스 복귀로 다시 나가면 안 된다 — 화면은 멀쩡하고 분석 데이터만 조용히 오염된다.
    refetchOnWindowFocus: false,
  })

  const rate = list.data?.rate
  const items = list.data?.items
  const { sections, carousel } = useMemo(
    () => splitSections(items ?? [], rate, language),
    [items, rate, language],
  )

  /**
   * 추천 카드. **카드 변환은 목록과 같은 `toShowCard`**이고 사유 한 줄만 더 붙인다.
   * 환산은 **추천 응답 자신의 `rate`**로 한다 — 목록에서 빌려 오면 목록이 실패했을 때
   * 추천 카드의 환산액까지 함께 사라진다(두 요청이 분리된 이유와 같다).
   */
  const recommendedItems = recommendation.data?.items
  const recommendedRate = recommendation.data?.rate
  const recommended: RecommendedShow[] | undefined = useMemo(() => {
    // GUEST·에러·빈 결과는 모두 `undefined` — 화면이 섹션을 통째로 감춘다
    if (!signedIn || recommendation.isError || !recommendedItems?.length) return undefined
    return recommendedItems.slice(0, RECOMMENDATION_MAX).map((item) => ({
      ...toShowCard(item, recommendedRate, language),
      // `reason`은 키 자체가 없을 수 있다. null·''도 "사유 없음"으로 접는다
      ...(item.reason ? { reason: item.reason } : {}),
    }))
  }, [signedIn, recommendation.isError, recommendedItems, recommendedRate, language])

  /**
   * 검색어는 **받아 온 항목에 대한 제목 필터**로만 쓴다. 서버 `keyword`로 보내면 글자마다
   * 요청이 나간다. 확정(Enter)은 A-15로 넘긴다(화면설계 v6.3 A-15 라우팅 규칙).
   */
  const needle = query.trim().toLowerCase()
  const data: HomeView = {
    carousel: needle
      ? carousel.filter((show) => show.title.toLowerCase().includes(needle))
      : carousel,
    sections: needle
      ? {
          opening: filterByTitle(sections.opening, needle),
          onSale: filterByTitle(sections.onSale, needle),
          closing: filterByTitle(sections.closing, needle),
        }
      : sections,
    recommended,
    // 꺼진 쿼리도 `isPending`이 true다 — 탭이 닫혀 있으면 로딩으로 치지 않는다
    recommendationLoading: signedIn && aiTabOpen && recommendation.isPending,
    recommendationError: signedIn && recommendation.isError,
    // 제목 문구만 가른다 — FALLBACK은 "맞춤"이 아니라 곧 시작하는 순 목록이다
    recommendationBasis: recommendation.data?.basis,
    // 헤더 표시용. A-15와 **같은 기준**이어야 한다 — 한쪽이 회원 조회 결과를 보면 새로고침
    // 직후 화면마다 헤더가 달라진다. 세션 유무는 즉시 답이 나온다
    signedIn,
  }

  return (
    <HomeScreen
      data={data}
      state={list.isPending ? 'loading' : list.isError ? 'error' : 'ready'}
      // 실패 응답의 code만 넘긴다. msg로 분기하지 않는다(규격 §1)
      errorCode={isApiError(list.error) ? list.error.code : undefined}
      onRetry={() => void list.refetch()}
      rateFootnote={rateNote(rate, language)}
      query={query}
      onQueryChange={setQuery}
      // 빈 검색어는 keyword 없이 보낸다 — "빈 값은 보내지 않는다"가 그 규칙이다
      onSearchSubmit={(v) => {
        const k = v.trim()
        navigate(k ? `/performances?keyword=${encodeURIComponent(k)}` : '/performances')
      }}
      onResetFilters={() => {
        setQuery('')
      }}
      tab={tab}
      onTabChange={changeTab}
      // 사용자가 누른 재시도만 다시 부른다 — 자동 재시도(`retry`)는 여전히 끈다
      onRecommendationRetry={() => void recommendation.refetch()}
    />
  )
}

function filterByTitle(items: ShowCardData[], needle: string): ShowCardData[] {
  return items.filter((i) => i.title.toLowerCase().includes(needle))
}

export default HomePage
