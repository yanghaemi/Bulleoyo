/**
 * A-01 맞춤 추천 — 화면설계 v8 A-01 · [v8.14] 판매중 / AI 추천 탭("기본 탭 = 판매중",
 * "`?tab=ai`일 때만 추천 조회", "GUEST·빈 결과·에러는 탭 안 안내", "`reason`이 있으면 카드
 * 하단 한 줄", "추천 카드도 판매중과 같은 카드·같은 그리드") · API-recommendation-01.
 *
 * `useQuery`를 모킹한다(`HomePage.test.tsx`와 같은 패턴) — 두 요청이 **분리돼 있는지**와
 * 화면이 응답을 어떻게 접는지가 관심사고 네트워크가 아니다. 추천 응답 픽스처는 이 파일에
 * 둔다. `shared/api/__fixtures__`는 **실서버에서 뽑은 응답**만 두는 자리이고(그 파일들의
 * 경고 주석) 백엔드가 아직 배포 전이라 손으로 적은 JSON을 거기 섞지 않는다.
 *
 * 모킹한 `useQuery`는 `enabled`를 보지 않고 늘 결과를 돌려준다. 그래서 "요청이 나가는가"는
 * 화면이 아니라 **넘긴 옵션의 `enabled`**로 검사한다.
 */

import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { useQuery } from '@tanstack/react-query'

import { HomePage } from './HomePage'

const session = vi.hoisted(() => ({ signedIn: true }))
const apiGetMock = vi.hoisted(() => vi.fn())
const ensureOptionalAccessTokenMock = vi.hoisted(() => vi.fn(async () => true))
/** 목록·추천이 각자 error를 갖는다. `null`을 API 오류로 보면 목록이 없는 code를 읽는다 */
const isApiErrorMock = vi.hoisted(() =>
  vi.fn((error: unknown) => error != null && typeof error === 'object' && 'code' in error),
)

vi.mock('@tanstack/react-query', () => ({ useQuery: vi.fn() }))
vi.mock('@/shared/api/client', () => ({
  api: { get: apiGetMock },
  ensureOptionalAccessToken: ensureOptionalAccessTokenMock,
  isApiError: isApiErrorMock,
  tokenStore: { hasSession: () => session.signedIn },
}))

const useQueryMock = vi.mocked(useQuery)

const NOW = new Date('2026-09-16T00:00:00.000Z')

/** performance_02 목록 항목 + `matchedGenres`·`reason`(명세 `RecommendationItem`) */
const recommendedItem = (over: Record<string, unknown> = {}) => ({
  performanceId: 12,
  title: 'Hapjeong Three Bands',
  posterImageUrl: null,
  venueName: 'Hapjeong Unplugged',
  startAt: '2026-10-19T10:00:00.000Z',
  status: 'ON_SALE' as const,
  minPriceAmount: 25000,
  currency: 'KRW',
  soldOut: false,
  teamNames: ['Blue Note', 'Noise Cancel'],
  matchedGenres: ['INDIE'],
  ...over,
})

const LIST_DATA = {
  items: [
    {
      performanceId: 5,
      title: 'IU Concert',
      venueName: 'Olympic Main Stadium',
      startAt: '2026-10-25T10:00:00.000Z',
      status: 'ON_SALE' as const,
      minPriceAmount: 132000,
      currency: 'KRW',
      soldOut: false,
      teamNames: ['IU'],
    },
  ],
  pageInfo: { page: 0, size: 16, totalElements: 1, hasNext: false },
}

function result(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  }
}

/** 두 요청이 **각자의 결과**를 본다. 키로 갈라 섞이지 않게 한다 */
function mockQueries(
  recommendation: Record<string, unknown>,
  listData: Record<string, unknown> = LIST_DATA,
) {
  useQueryMock.mockImplementation((options: { queryKey?: readonly unknown[] }) =>
    (options.queryKey?.[0] === 'recommendation'
      ? result(recommendation)
      : result({ data: listData })) as never,
  )
}

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})

afterAll(() => vi.unstubAllGlobals())

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.clearAllMocks()
  session.signedIn = true
})

afterEach(() => vi.useRealTimers())

/** 테스트가 현재 주소를 읽을 수 있게 검색 문자열을 그대로 찍는다 */
function LocationProbe() {
  const location = useLocation()
  // `<output>`은 암묵 role=status라 로딩 status 검사와 겹친다 — 평범한 div로 둔다
  return <div data-testid="location-search">{location.search}</div>
}

/** 추천 화면을 보는 테스트가 대부분이라 기본은 `?tab=ai`로 연다 */
function renderHome(entry = '/?tab=ai') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <HomePage />
      <LocationProbe />
    </MemoryRouter>,
  )
}

function forYou() {
  return screen.getByRole('heading', { name: 'For you' }).closest('section')!
}

/** 마지막 렌더의 추천 쿼리 옵션 */
function lastRecommendationOptions() {
  return useQueryMock.mock.calls
    .map((call) => call[0])
    .filter((o) => (o.queryKey as unknown[] | undefined)?.[0] === 'recommendation')
    .at(-1)
}

it('`?tab=ai`면 AI 추천 탭에 추천 카드만 그리고 판매중 섹션은 그리지 않는다', () => {
  mockQueries({ data: { basis: 'GENRE', sessionId: 's-1', items: [recommendedItem()] } })
  renderHome()

  expect(screen.getByRole('tab', { name: 'AI picks' })).toHaveAttribute('aria-selected', 'true')
  expect(within(forYou()).getByRole('link', { name: /Hapjeong Three Bands/ })).toBeInTheDocument()
  // 두 섹션이 동시에 보이지 않는다 — 판매중은 다른 탭이다
  expect(screen.queryByRole('heading', { name: 'On sale' })).not.toBeInTheDocument()
})

it('`reason`이 없으면 사유 줄 없이 카드만 그린다', () => {
  // 1차 백엔드는 항상 null이고 전역 non_null이라 **키 자체가 없을 수 있다**
  const item = recommendedItem()
  expect(Object.hasOwn(item, 'reason')).toBe(false)
  mockQueries({ data: { basis: 'GENRE', sessionId: 's-1', items: [item] } })
  renderHome()

  const section = within(forYou())
  expect(section.getByRole('link', { name: /Hapjeong Three Bands/ })).toBeInTheDocument()
  // null이 문자열로 새면 카드에 "null"이 찍힌다
  expect(section.queryByText('null')).not.toBeInTheDocument()
})

it('`reason`이 있으면 카드 하단에 한 줄을 덧붙인다', () => {
  mockQueries({
    data: {
      basis: 'TAGGED',
      sessionId: 's-1',
      items: [recommendedItem({ reason: '좋아하는 인디 밴드가 무대에 올라요' })],
    },
  })
  renderHome()

  expect(within(forYou()).getByText('좋아하는 인디 밴드가 무대에 올라요')).toBeInTheDocument()
})

it('GUEST에게는 추천 대신 관심 장르 안내를 보이고 추천을 부르지 않는다', () => {
  session.signedIn = false
  mockQueries({ data: { basis: 'GENRE', sessionId: 's-1', items: [recommendedItem()] } })
  renderHome()

  expect(screen.queryByRole('heading', { name: 'For you' })).not.toBeInTheDocument()
  expect(screen.getByText(/Pick the genres you like/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Choose genres/ })).toHaveAttribute(
    'href',
    '/me/preferences',
  )
  expect(lastRecommendationOptions()?.enabled).toBe(false)
})

it('폴백 목록은 "맞춤 추천"이라고 말하지 않고 관심 장르 고르기를 권한다', () => {
  // basis=FALLBACK은 선호 0개·겹침 0건이라 곧 시작하는 순으로 채운 목록이다
  mockQueries({ data: { basis: 'FALLBACK', sessionId: 's-1', items: [recommendedItem()] } })
  renderHome()

  const section = screen.getByRole('heading', { name: 'You might like' }).closest('section')!
  expect(screen.queryByRole('heading', { name: 'For you' })).not.toBeInTheDocument()
  expect(within(section).getByRole('link', { name: /Hapjeong Three Bands/ })).toBeInTheDocument()
  expect(within(section).getByRole('link', { name: /Choose genres/ })).toHaveAttribute(
    'href',
    '/me/preferences',
  )
})

it('빈 결과면 관심 장르 안내를 보인다', () => {
  mockQueries({ data: { basis: 'FALLBACK', sessionId: 's-1', items: [] } })
  renderHome()

  expect(screen.queryByRole('heading', { name: 'For you' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Choose genres/ })).toHaveAttribute(
    'href',
    '/me/preferences',
  )
})

it('추천 조회가 실패하면(401 포함) 추천 실패 문구만 보이고 목록 오류로 둔갑하지 않는다', () => {
  const refetch = vi.fn()
  mockQueries({
    isError: true,
    error: { code: 'COMMON_UNAUTHORIZED', msg: 'unauthorized' },
    refetch,
  })
  renderHome()

  expect(screen.queryByRole('heading', { name: 'For you' })).not.toBeInTheDocument()
  expect(screen.getByText(/couldn’t load your picks/)).toBeInTheDocument()
  // 추천 실패를 목록 오류 화면으로 둔갑시키지 않는다
  expect(screen.queryByText("We couldn't load the shows.")).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(refetch).toHaveBeenCalledTimes(1)

  // 판매중 탭의 목록은 그대로다
  fireEvent.click(screen.getByRole('tab', { name: 'On sale' }))
  expect(screen.getByRole('heading', { name: 'On sale' })).toBeInTheDocument()
})

it('성공 캐시가 남아 있어도 재조회가 실패하면 오래된 추천을 숨긴다', () => {
  mockQueries({
    data: { basis: 'GENRE', sessionId: 's-1', items: [recommendedItem()] },
    isError: true,
    error: { code: 'COMMON_UNAUTHORIZED', msg: 'unauthorized' },
  })
  renderHome()

  expect(screen.queryByRole('heading', { name: 'For you' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Hapjeong Three Bands/ })).not.toBeInTheDocument()
})

it('추천 요청은 공개 홈의 refresh-only 세션을 먼저 복구한다', async () => {
  mockQueries({ data: { basis: 'GENRE', sessionId: 's-1', items: [recommendedItem()] } })
  renderHome()

  const queryFn = lastRecommendationOptions()?.queryFn
  expect(queryFn).toBeTypeOf('function')
  if (typeof queryFn !== 'function') throw new Error('recommendation queryFn is missing')
  await queryFn({ signal: new AbortController().signal } as never)

  expect(ensureOptionalAccessTokenMock).toHaveBeenCalledTimes(1)
  expect(apiGetMock).toHaveBeenCalledWith(
    '/recommendations/performances',
    expect.objectContaining({ silentAuthFailure: true }),
  )
})

it('추천을 받는 동안에는 자체 스켈레톤만 뜬다 — 목록은 기다리지 않는다', () => {
  mockQueries({ isPending: true })
  renderHome()

  expect(screen.getByRole('heading', { name: 'For you' })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Loading your recommendations')
  // 무대(대표 공연)는 목록 응답으로 그대로 떠 있다
  expect(screen.getByRole('heading', { name: 'IU Concert', level: 1 })).toBeInTheDocument()
})

/* ── 환율은 추천 응답 자신의 `rate`를 쓴다(API-recommendation-01) ──────────────── */

it('추천 카드의 환산은 추천 응답의 rate로 한다 — 목록의 rate를 빌리지 않는다', () => {
  mockQueries(
    {
      data: {
        basis: 'GENRE',
        sessionId: 's-1',
        // 25,000 / 1,000 = $25.00
        rate: { currency: 'USD', rate: 1000, asOf: '2026-09-16T00:00:00+09:00' },
        items: [recommendedItem()],
      },
    },
    // 목록은 다른 통화다. 빌려 쓰면 추천 카드에 ¥ 값이 찍힌다
    { ...LIST_DATA, rate: { currency: 'JPY', rate: 10, asOf: '2026-09-16T00:00:00+09:00' } },
  )
  renderHome()

  const section = within(forYou())
  expect(section.getAllByText(/\$25\.00/).length).toBeGreaterThan(0)
  expect(section.queryByText(/¥/)).not.toBeInTheDocument()
})

it('추천 응답에 rate가 없으면 환산만 빠지고 원 값은 남는다', () => {
  // 회원 표시 통화가 KRW면 rate가 내려오지 않는다(§0.5). 목록 rate로 메우지 않는다
  mockQueries(
    { data: { basis: 'GENRE', sessionId: 's-1', items: [recommendedItem()] } },
    { ...LIST_DATA, rate: { currency: 'USD', rate: 1000, asOf: '2026-09-16T00:00:00+09:00' } },
  )
  renderHome()

  const section = within(forYou())
  expect(section.getAllByText(/25,000 YoYo/).length).toBeGreaterThan(0)
  expect(section.queryByText(/\$25\.00/)).not.toBeInTheDocument()
})

/* ── 재조회 억제 — 조회마다 노출 로그 6건이 쌓인다(화면설계 v8 A-01 섹션 ④) ────────── */

it('추천 쿼리는 창 포커스 복귀로 다시 요청하지 않고 5분간 신선하다', () => {
  mockQueries({ data: { basis: 'GENRE', sessionId: 's-1', items: [recommendedItem()] } })
  renderHome()

  const options = lastRecommendationOptions()

  // 전역 기본값과 같은 값이라도 이 쿼리에서는 명시가 계약이다 — 기본값이 뒤집혀도
  // 포커스 복귀로 다시 나가면 basis별 전환율의 분모가 부푼다
  expect(options?.refetchOnWindowFocus).toBe(false)
  // 전역 30초가 아니라 5분. 홈을 오가며 재마운트해도 그 안에는 다시 부르지 않는다
  expect(options?.staleTime).toBe(5 * 60 * 1000)

  // 목록 쿼리까지 덩달아 묶이지 않았는지 — 공개 목록은 전역 기본값을 그대로 쓴다
  const listOptions = useQueryMock.mock.calls
    .map((call) => call[0])
    .filter((o) => {
      const key = o.queryKey as unknown[] | undefined
      return key?.[0] === 'performance' && key[1] === 'list'
    })
    .at(-1)
  expect(listOptions?.staleTime).toBeUndefined()
})

/* ── [v8.14] 판매중 / AI 추천 탭 ─────────────────────────────────────────────── */

it('기본 탭은 판매중이고 추천은 부르지 않는다', () => {
  mockQueries({ data: { basis: 'GENRE', sessionId: 's-1', items: [recommendedItem()] } })
  renderHome('/')

  expect(screen.getByRole('tab', { name: 'On sale' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('tab', { name: 'AI picks' })).toHaveAttribute('aria-selected', 'false')
  expect(screen.getByRole('heading', { name: 'On sale' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'For you' })).not.toBeInTheDocument()
  // 로그인 회원이어도 탭을 열기 전에는 요청이 나가지 않는다 — 노출 로그도 없다
  expect(lastRecommendationOptions()?.enabled).toBe(false)
})

it('잘못된 `?tab` 값은 판매중으로 접는다', () => {
  mockQueries({ data: { basis: 'GENRE', sessionId: 's-1', items: [recommendedItem()] } })
  renderHome('/?tab=bogus')

  expect(screen.getByRole('tab', { name: 'On sale' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('heading', { name: 'On sale' })).toBeInTheDocument()
  expect(lastRecommendationOptions()?.enabled).toBe(false)
})

it('`?tab=ai`로 열면(상세에서 뒤로 온 경우) 탭이 복원되고 그때만 추천을 부른다', () => {
  mockQueries({ data: { basis: 'GENRE', sessionId: 's-1', items: [recommendedItem()] } })
  renderHome('/?tab=ai')

  expect(screen.getByRole('tab', { name: 'AI picks' })).toHaveAttribute('aria-selected', 'true')
  expect(lastRecommendationOptions()?.enabled).toBe(true)
})

it('탭을 누르면 주소의 `?tab`이 바뀌고 패널이 갈린다', () => {
  mockQueries({ data: { basis: 'GENRE', sessionId: 's-1', items: [recommendedItem()] } })
  renderHome('/')

  fireEvent.click(screen.getByRole('tab', { name: 'AI picks' }))
  expect(screen.getByTestId('location-search')).toHaveTextContent('?tab=ai')
  expect(screen.getByRole('heading', { name: 'For you' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'On sale' })).not.toBeInTheDocument()
  expect(lastRecommendationOptions()?.enabled).toBe(true)
  // 탭을 오가도 쿼리 키는 같다 — 한 번 받은 추천은 캐시로 다시 그린다
  expect(lastRecommendationOptions()?.queryKey).toEqual(['recommendation', 'performances'])

  fireEvent.click(screen.getByRole('tab', { name: 'On sale' }))
  expect(screen.getByTestId('location-search')).toHaveTextContent('?tab=onsale')
  expect(screen.getByRole('heading', { name: 'On sale' })).toBeInTheDocument()
})

it('WAI-ARIA tabs — tab·tabpanel이 서로를 가리키고 선택된 탭만 Tab 순서에 든다', () => {
  mockQueries({ data: { basis: 'GENRE', sessionId: 's-1', items: [recommendedItem()] } })
  renderHome('/')

  const tablist = screen.getByRole('tablist', { name: 'Browse shows' })
  const [onSale, ai] = within(tablist).getAllByRole('tab')
  expect(onSale).toHaveAttribute('tabindex', '0')
  expect(ai).toHaveAttribute('tabindex', '-1')

  const panel = screen.getByRole('tabpanel')
  expect(onSale).toHaveAttribute('aria-controls', panel.id)
  expect(panel).toHaveAttribute('aria-labelledby', onSale.id)
  // 선택되지 않은 패널도 DOM에 있어 aria-controls가 가리킬 곳이 있다
  const hiddenPanelId = ai.getAttribute('aria-controls') ?? ''
  expect(document.getElementById(hiddenPanelId)).toHaveAttribute('hidden')
})

it('좌우 방향키·Home·End로 탭을 옮기면 포커스와 선택이 함께 간다', () => {
  mockQueries({ data: { basis: 'GENRE', sessionId: 's-1', items: [recommendedItem()] } })
  renderHome('/')

  const onSale = screen.getByRole('tab', { name: 'On sale' })
  const ai = screen.getByRole('tab', { name: 'AI picks' })
  onSale.focus()

  fireEvent.keyDown(onSale, { key: 'ArrowRight' })
  expect(ai).toHaveFocus()
  expect(ai).toHaveAttribute('aria-selected', 'true')

  // 끝에서 오른쪽은 처음으로 돈다
  fireEvent.keyDown(ai, { key: 'ArrowRight' })
  expect(onSale).toHaveFocus()
  expect(onSale).toHaveAttribute('aria-selected', 'true')

  fireEvent.keyDown(onSale, { key: 'ArrowLeft' })
  expect(ai).toHaveFocus()

  fireEvent.keyDown(ai, { key: 'Home' })
  expect(onSale).toHaveFocus()
  expect(onSale).toHaveAttribute('aria-selected', 'true')

  fireEvent.keyDown(onSale, { key: 'End' })
  expect(ai).toHaveFocus()
  expect(ai).toHaveAttribute('aria-selected', 'true')
})

it('추천 카드는 판매중 카드와 같은 카드 컴포넌트·같은 그리드를 쓴다', () => {
  mockQueries({ data: { basis: 'GENRE', sessionId: 's-1', items: [recommendedItem()] } })
  renderHome('/?tab=ai')

  const aiLink = within(forYou()).getByRole('link', { name: /Hapjeong Three Bands/ })
  const aiGridClass = aiLink.closest('ul')?.className
  const aiCardClass = aiLink.className

  fireEvent.click(screen.getByRole('tab', { name: 'On sale' }))
  const onSaleSection = screen.getByRole('heading', { name: 'On sale' }).closest('section')!
  const onSaleLink = within(onSaleSection).getByRole('link', { name: /IU Concert/ })

  expect(aiGridClass).toBeTruthy()
  expect(aiGridClass).toBe(onSaleLink.closest('ul')?.className)
  expect(aiCardClass).toBe(onSaleLink.className)
})
