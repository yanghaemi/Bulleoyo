/** A-01: actual show sections, supported date filters and search into A-15. */
import { useState } from 'react'
import { Link } from 'react-router'
import { ErrorState } from './PerformanceList'
import { IdentityStage, FeaturedShowList } from './IdentityStage'
import { useIdentityFont } from '@/shared/ui/useIdentityFont'
import { ArrowRightIcon, PosterViewIcon, ListViewIcon } from '@/shared/ui/EditorialIcons'
import type { CarouselItem } from './ShowCarousel'
import { ShowCard, type ShowCardData } from './ShowCard'
import { HomeTabs } from './HomeTabs'
import { HOME_TABS, homePanelId, homeTabId } from './homeTabModel'
import type { HomeTab } from './homeTabModel'
import { RECOMMENDATION_MAX } from './recommendationModel'
import type { RecommendationBasis } from './recommendationModel'
import { AppHeader, BottomNav, PageSkeleton, formatYoyo } from '@/shared/ui'
import { useLocale } from '@/shared/i18n/useLocale'
import './performance-editorial.css'

export type ShowSectionKey = 'opening' | 'onSale' | 'closing'

/**
 * 공연 카드 그리드. **판매중 섹션과 AI 추천이 같은 값을 쓴다** — 추천만 3열이던 때는 같은
 * `ShowCard`인데도 칸 폭이 달라 포스터 크기가 섹션마다 달랐다(9/26 사용자 지적).
 */
export const SHOW_GRID_CLASS =
  'discovery-section__grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4'

export interface HomeBanner {
  performanceId: string
  title: string
  dateLabel: string
  posterImageUrl?: string | null
}

/**
 * 맞춤 추천 카드 — **기존 공연 카드에 사유 한 줄만 덧붙인다**(새 카드 컴포넌트를 만들지 않는다).
 * `reason`이 없으면(1차 전체·폴백 항목) 그 줄을 그리지 않는다.
 */
export interface RecommendedShow extends ShowCardData {
  reason?: string
}

export interface HomeView {
  /** The first public shows, presented in the featured stage before the section grids. */
  carousel?: CarouselItem[]
  banner?: HomeBanner
  sections: Record<ShowSectionKey, ShowCardData[]>
  /**
   * **[v8] 맞춤 추천**(API-recommendation-01). [v8.14]부터 "AI 추천" 탭 안에 그린다.
   *
   * `undefined`는 "그릴 카드가 없다" — GUEST·에러(401 포함)·빈 결과가 모두 여기로 모인다.
   * 탭 안에서는 빈 패널을 남길 수 없어 `signedIn`·`recommendationError`로 안내 문구를 가른다.
   */
  recommended?: RecommendedShow[]
  /** 추천 요청만의 로딩. 상태별 3섹션 로딩과 분리된 별도 요청이다 */
  recommendationLoading?: boolean
  /** 추천 조회 실패(401 포함). 캐시가 남아 있어도 실패면 카드를 그리지 않는다 */
  recommendationError?: boolean
  /**
   * 응답의 `basis`. **제목 문구를 가르는 데만 쓴다** — `FALLBACK`은 선호 장르가 0개거나
   * 겹친 결과가 없어 "곧 시작하는 순"으로 채운 목록이라 "맞춤"이 아니다(API-recommendation-01).
   */
  recommendationBasis?: RecommendationBasis
  signedIn?: boolean
}

const SECTION_LABEL: Record<ShowSectionKey, { en: string; ko: string }> = {
  opening: { en: 'Opening soon', ko: '오픈 예정' },
  onSale: { en: 'On sale', ko: '판매 중' },
  closing: { en: 'Closing soon', ko: '곧 마감' },
}
const MOBILE_MAX = 5
const DESKTOP_MAX = 8

interface Props {
  data: HomeView
  /** Previously received cards remain visible during a refetch. */
  state?: 'loading' | 'error' | 'ready'
  errorCode?: string
  onRetry?: () => void
  rateFootnote?: string
  query: string
  onQueryChange: (v: string) => void
  onSearchSubmit: (v: string) => void
  onResetFilters: () => void
  /** 선택된 탭. 주소(`?tab=`)에서 읽는 것은 페이지다 */
  tab?: HomeTab
  onTabChange?: (tab: HomeTab) => void
  /** 추천 조회 실패 뒤 "다시 시도" */
  onRecommendationRetry?: () => void
}

function Section({ id, shows }: { id: ShowSectionKey; shows: ShowCardData[] }) {
  const { text } = useLocale()
  if (shows.length === 0) return null
  const label = SECTION_LABEL[id]
  return (
    <section className="discovery-section" aria-labelledby={`shows-${id}`}>
      <div className="discovery-section__heading">
        <h2 id={`shows-${id}`}>{text(label.ko, label.en)}</h2>
        {id === 'onSale' && (
          <Link to="/performances?status=ON_SALE">
            {text('전체 보기', 'View all')} <span aria-hidden>→</span>
          </Link>
        )}
      </div>
      <ul className={SHOW_GRID_CLASS}>
        {shows.slice(0, DESKTOP_MAX).map((show, index) => (
          <li key={show.performanceId} className={index >= MOBILE_MAX ? 'hidden md:block' : ''}>
            <ShowCard data={show} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * 관심 장르 유도 한 줄 — C-04(`/me/preferences`)의 선호 장르 행으로 보낸다.
 * GUEST가 누르면 라우트 가드가 로그인(C-01)을 먼저 거치게 한다.
 */
function GenrePrompt() {
  const { text } = useLocale()
  return (
    <p className="home-ai-prompt">
      {text(
        '관심 장르를 고르면 공연을 추천해 드려요',
        'Pick the genres you like and we’ll suggest shows',
      )}{' '}
      <Link to="/me/preferences">
        {text('관심 장르 고르기', 'Choose genres')} <span aria-hidden>→</span>
      </Link>
    </p>
  )
}

/**
 * 맞춤 추천 — [v8.14]부터 "AI 추천" 탭 패널 안에 그린다. `더 보기` 없음(A-01 컴포넌트 표).
 *
 * 상태별 3섹션과 **다른 요청**이라 스켈레톤도 자체적으로 갖는다. 섹션 시절에는 GUEST·빈 결과·
 * 에러를 "섹션 숨김"으로 끝냈지만 탭 안에서 숨기면 빈 패널만 남는다 — 그래서 안내로 바꾼다.
 *   · GUEST·빈 결과 → 관심 장르 유도(`GenrePrompt`)
 *   · 에러(401 포함) → 짧은 실패 문구 + 다시 시도. 목록 오류 화면(`ErrorState`)과는 섞지 않는다
 *   · `FALLBACK` → 카드는 그대로 보이고 제목 아래에 관심 장르 유도 한 줄
 */
function RecommendedSection({
  shows,
  loading,
  error,
  signedIn,
  basis,
  onRetry,
}: {
  shows?: RecommendedShow[]
  loading?: boolean
  error?: boolean
  signedIn?: boolean
  basis?: RecommendationBasis
  onRetry?: () => void
}) {
  const { text } = useLocale()
  // 선호를 고르지 않은 회원에게 "맞춤 추천"이라고 말하지 않는다. 받는 중에는 basis를
  // 모르므로 기본 문구로 두고, 값이 오면 그때 갈린다
  const title =
    basis === 'FALLBACK'
      ? text('이런 공연은 어때요', 'You might like')
      : text('맞춤 추천', 'For you')

  if (!signedIn) {
    return (
      <div className="discovery-empty" role="status">
        <GenrePrompt />
      </div>
    )
  }

  if (error) {
    return (
      <div className="discovery-empty" role="status">
        <p>{text('추천을 불러오지 못했어요', 'We couldn’t load your picks.')}</p>
        {onRetry && (
          <button type="button" onClick={onRetry}>
            {text('다시 시도', 'Try again')}
          </button>
        )}
      </div>
    )
  }

  if (!shows?.length) {
    if (!loading) {
      return (
        <div className="discovery-empty" role="status">
          <GenrePrompt />
        </div>
      )
    }
    return (
      <section className="discovery-section" aria-labelledby="shows-recommended" aria-busy="true">
        <div className="discovery-section__heading">
          <h2 id="shows-recommended">{title}</h2>
        </div>
        {/* 색·움직임만으로 알리지 않는다 — 라벨을 함께 둔다(A-01 로딩 규칙) */}
        <p role="status" className="sr-only">
          {text('맞춤 추천을 불러오고 있어요', 'Loading your recommendations')}
        </p>
        <ul aria-hidden className={SHOW_GRID_CLASS}>
          {Array.from({ length: 4 }, (_, index) => (
            <li key={index} className="h-40 animate-pulse rounded-card bg-ground-2 md:h-72" />
          ))}
        </ul>
      </section>
    )
  }

  return (
    <section className="discovery-section" aria-labelledby="shows-recommended">
      <div className="discovery-section__heading">
        <h2 id="shows-recommended">{title}</h2>
      </div>
      {basis === 'FALLBACK' && <GenrePrompt />}
      {/* 판매중 섹션과 같은 그리드·같은 카드 — 포스터 크기가 탭마다 달라지지 않는다 */}
      <ul className={SHOW_GRID_CLASS}>
        {shows.slice(0, RECOMMENDATION_MAX).map((show) => (
          <li key={show.performanceId}>
            <ShowCard data={show} />
            {/* 사유는 2차부터 온다. 없으면 줄 자체가 없다 */}
            {show.reason && <p className="discovery-section__reason">{show.reason}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function HomeScreen({
  data,
  state = 'ready',
  errorCode,
  onRetry,
  rateFootnote,
  query,
  onQueryChange,
  onSearchSubmit,
  onResetFilters,
  tab = 'onsale',
  onTabChange,
  onRecommendationRetry,
}: Props) {
  const { text } = useLocale()
  const [showView, setShowView] = useState<'poster' | 'list'>('poster')
  const [activeId, setActiveId] = useState<string>()
  useIdentityFont(true)
  const total =
    data.sections.opening.length + data.sections.onSale.length + data.sections.closing.length
  const filtered = query.trim().length > 0
  const cards = [...data.sections.onSale, ...data.sections.closing, ...data.sections.opening]
  const lineup = (data.carousel ?? []).map((show) => {
    const card = cards.find((item) => item.performanceId === show.performanceId)
    return {
      ...show,
      priceLabel:
        card?.fromPriceKrw == null ? text('가격 미정', 'Price TBD') : formatYoyo(card.fromPriceKrw),
    }
  })

  const active = lineup.find((show) => show.performanceId === activeId) ?? lineup[0]

  /** "판매중" 탭 패널 — 탭 도입 전 본문의 상태별 3섹션·로딩·오류·빈 상태를 그대로 옮겼다 */
  const onSalePanel =
    total > 0 ? (
      <>
        <Section id="onSale" shows={data.sections.onSale} />
        <Section id="closing" shows={data.sections.closing} />
        <Section id="opening" shows={data.sections.opening} />
        {rateFootnote && <p className="discovery-rate">{rateFootnote}</p>}
      </>
    ) : state === 'loading' ? (
      <PageSkeleton variant="home" label={text('공연을 불러오고 있어요', 'Loading shows')} />
    ) : state === 'error' ? (
      <ErrorState
        code={errorCode}
        onRetry={onRetry ?? onResetFilters}
        onResetFilters={onResetFilters}
      />
    ) : (
      <div className="discovery-empty" role="status">
        <p>
          {filtered
            ? text('조건에 맞는 공연이 없습니다', 'No shows match your filters.')
            : text('등록된 공연이 없습니다', 'No shows available.')}
        </p>
        {filtered && (
          <button type="button" onClick={onResetFilters}>
            {text('필터 초기화', 'Reset filters')}
          </button>
        )}
      </div>
    )

  return (
    <div
      data-concept="identity-b"
      className="editorial-lab identity-home min-h-dvh min-w-0 max-w-full overflow-x-clip pb-16 md:pb-0"
    >
      <AppHeader
        signedIn={data.signedIn}
        query={query}
        onQueryChange={onQueryChange}
        onSearchSubmit={onSearchSubmit}
      />
      <main className="discovery-editorial editorial-lab__concept">
        {!active && <h1 className="sr-only">{text('공연', 'Shows')}</h1>}
        <div className="editorial-lab__discovery-head">
          <div>
            <p>{text('지금 만날 수 있는 무대', 'Shows to discover now')}</p>
            <h2>{text('대표 공연', 'Featured shows')}</h2>
          </div>
          <div className="editorial-lab__discovery-actions">
            <div
              className="editorial-lab__view-switch"
              role="group"
              aria-label={text('보기 방식', 'View mode')}
            >
              <button
                type="button"
                aria-label={text('포스터 보기', 'Poster view')}
                title={text('포스터 보기', 'Poster view')}
                aria-pressed={showView === 'poster'}
                onClick={() => setShowView('poster')}
              >
                <PosterViewIcon />
              </button>
              <button
                type="button"
                aria-label={text('목록 보기', 'List view')}
                title={text('목록 보기', 'List view')}
                aria-pressed={showView === 'list'}
                onClick={() => setShowView('list')}
              >
                <ListViewIcon />
              </button>
            </div>
            <Link to="/performances" className="editorial-lab__all-link">
              {text('전체 공연', 'All shows')}
              <ArrowRightIcon />
            </Link>
          </div>
        </div>
        {/* 대표 공연 무대. 목록이 있어야 가격·라인업을 만들 수 있어 `total > 0`에 매인다 */}
        {total > 0 &&
          active &&
          (showView === 'poster' ? (
            <IdentityStage
              key={lineup.map((show) => show.performanceId).join(',')}
              shows={lineup}
              active={active}
              onCenterChange={setActiveId}
            />
          ) : (
            <FeaturedShowList
              shows={lineup}
              active={active}
              onSelect={setActiveId}
              concept="identity-b"
            />
          ))}

        {/* [v8.14] 판매중 / AI 추천 탭 — 무대 아래. 두 패널은 늘 DOM에 있어 `aria-controls`가
            가리킬 곳이 있고, 선택되지 않은 패널은 `hidden`이며 내용을 그리지 않는다 */}
        <HomeTabs active={tab} onChange={(next) => onTabChange?.(next)} />

        {HOME_TABS.map((panel) => (
          <div
            key={panel}
            role="tabpanel"
            id={homePanelId(panel)}
            aria-labelledby={homeTabId(panel)}
            hidden={panel !== tab}
            tabIndex={panel === tab ? 0 : -1}
            className="home-tabpanel"
          >
            {panel === tab &&
              (panel === 'ai' ? (
                /* 추천은 **목록 조회 상태 밖**이다. 별도 요청이라 목록이 로딩·실패여도
                   추천은 추천대로 뜬다(A-01 상태 규칙) */
                <RecommendedSection
                  shows={data.recommended}
                  loading={data.recommendationLoading}
                  error={data.recommendationError}
                  signedIn={data.signedIn}
                  basis={data.recommendationBasis}
                  onRetry={onRecommendationRetry}
                />
              ) : (
                onSalePanel
              ))}
          </div>
        ))}
      </main>
      <footer className="discovery-footer">
        <div className="discovery-footer__inner">
          <Link to="/verify/supply">
            {text('코인 발행량 공시', 'Coin supply disclosure')} <span aria-hidden>→</span>
          </Link>
          <p>
            {text(
              '테스트넷(Kaia Kairos) 시연입니다. 화폐가 코인인 미래를 가정했으며 실가상자산·실화폐가 아닙니다.',
              'Test network (Kaia Kairos). A demo that assumes a future where money is a coin. No real assets, no real currency.',
            )}
          </p>
          <p>© 2026 BULLEOYO</p>
        </div>
      </footer>
      <BottomNav />
    </div>
  )
}
