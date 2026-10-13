/**
 * 라우터.
 *
 * 정본: 화면설계 v6 §4 각 화면 절의 `라우트` + §8.3 라우트 표.
 *
 * §8.3 표는 **v5에서 바뀐 것만 담은 델타 표**다. 전체 목록은 §4의 33개 절 첫 줄에 있고
 * 아래는 그것을 그대로 옮긴 것이다. 화면 ID 주석을 지우지 마라 — QA가 이걸로 대조한다.
 *
 * 화면 31개 중 **P-10 공연 취소는 모달**이라 라우트가 없다(P-03·P-08에서 연다).
 * A-09·A-10은 v6에서 삭제된 결번이다(양도 기능 제외).
 *
 * `PUBLIC_PATHS`에 없는 화면은 lazy 모듈을 불러온 뒤 `RequireAuth`로 감싼다.
 * 관리자·스튜디오 역할은 클라이언트 응답에 판정 정보가 없어 서버 403을 정본으로 둔다.
 */

import type { ReactNode } from 'react'
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'

import { buildDevRoutes } from '@/app/devRoutes'
import { lazyPage } from '@/app/lazyPage'
import { RequireAuth } from '@/app/RequireAuth'
import { RequirePerformanceAccess } from '@/app/RequirePerformanceAccess'
import { RouteErrorPage } from '@/app/RouteErrorPage'
import { RouteTitle } from '@/app/RouteTitle'
import { BrandLoader } from '@/shared/ui/BrandLoader'

import { RedirectTransferToTicket } from '@/pages'

/* 각 화면 파일을 직접 가져와야 Vite가 화면 단위 청크를 유지한다. */
const loginPage = lazyPage(() => import('@/pages/LoginPage'), 'LoginPage')
const signupPage = lazyPage(() => import('@/pages/SignupPage'), 'SignupPage')
const myPage = lazyPage(() => import('@/pages/MyPage'), 'MyPage')
const preferencesPage = lazyPage(() => import('@/pages/PreferencesPage'), 'PreferencesPage')
const walletOnboardingPage = lazyPage(
  () => import('@/pages/WalletOnboardingPage'),
  'WalletOnboardingPage',
)
const homePage = lazyPage(() => import('@/pages/HomePage'), 'HomePage')
const performanceListPage = lazyPage(
  () => import('@/pages/PerformanceListPage'),
  'PerformanceListPage',
)
const performanceDetailPage = lazyPage(
  () => import('@/pages/PerformanceDetailPage'),
  'PerformanceDetailPage',
)
const orderOptionsPage = lazyPage(() => import('@/pages/TicketOptionsPage'), 'TicketOptionsPage')
const orderTeamChoicePage = lazyPage(() => import('@/pages/TeamChoicePage'), 'TeamChoicePage')
const paymentPage = lazyPage(() => import('@/pages/PaymentPage'), 'PaymentPage')
const orderCompletePage = lazyPage(
  () => import('@/pages/BookingCompletePage'),
  'BookingCompletePage',
)
const myTicketsPage = lazyPage(() => import('@/pages/MyTicketsPage'), 'MyTicketsPage')
const ticketDetailPage = lazyPage(() => import('@/pages/TicketDetailPage'), 'TicketDetailPage')
const ticketCancelPage = lazyPage(() => import('@/pages/TicketCancelPage'), 'TicketCancelPage')
const ordersPage = lazyPage(() => import('@/pages/OrdersPage'), 'OrdersPage')
const walletPage = lazyPage(() => import('@/pages/WalletPage'), 'WalletPage')
const studioHomePage = lazyPage(() => import('@/pages/StudioHomePage'), 'StudioHomePage')
const teamCreatePage = lazyPage(() => import('@/pages/TeamCreatePage'), 'TeamCreatePage')
const teamManagePage = lazyPage(() => import('@/pages/TeamManagePage'), 'TeamManagePage')
const performanceCreatePage = lazyPage(
  () => import('@/pages/PerformanceCreatePage'),
  'PerformanceCreatePage',
)
const performanceEditPage = lazyPage(
  () => import('@/pages/PerformanceEditPage'),
  'PerformanceEditPage',
)
const performancePosterPage = lazyPage(
  () => import('@/pages/PerformanceMediaPages'),
  'PerformancePosterPage',
)
const performanceArtworkPage = lazyPage(
  () => import('@/pages/PerformanceMediaPages'),
  'PerformanceArtworkPage',
)
const performanceReviewPage = lazyPage(
  () => import('@/pages/PerformanceMediaPages'),
  'PerformanceReviewPage',
)
const participantsPage = lazyPage(() => import('@/pages/ParticipantsPage'), 'ParticipantsPage')
const settlementRulesPage = lazyPage(
  () => import('@/pages/SettlementRulesPage'),
  'SettlementRulesPage',
)
const agreementsPage = lazyPage(() => import('@/pages/AgreementsPage'), 'AgreementsPage')
const salesStatusPage = lazyPage(() => import('@/pages/SalesStatusPage'), 'SalesStatusPage')
const settlementPage = lazyPage(() => import('@/pages/SettlementPage'), 'SettlementPage')
const studioEntriesPage = lazyPage(() => import('@/pages/StudioEntriesPage'), 'StudioEntriesPage')
const scanPage = lazyPage(() => import('@/pages/ScanPage'), 'ScanPage')
const scanEntriesPage = lazyPage(() => import('@/pages/ScanEntriesPage'), 'ScanEntriesPage')
const supplyDisclosurePage = lazyPage(
  () => import('@/pages/SupplyDisclosurePage'),
  'SupplyDisclosurePage',
)
const verifyPage = lazyPage(() => import('@/pages/VerifyPage'), 'VerifyPage')
const settlementSharePage = lazyPage(
  () => import('@/pages/SettlementSharePage'),
  'SettlementSharePage',
)
const adminDisputesPage = lazyPage(() => import('@/pages/AdminDisputesPage'), 'AdminDisputesPage')
const adminCoinPage = lazyPage(() => import('@/pages/AdminCoinPage'), 'AdminCoinPage')
const notFoundPage = lazyPage(() => import('@/pages/NotFoundPage'), 'NotFoundPage')

const PUBLIC_PATHS = new Set([
  '/',
  '/performances',
  '/performances/:id',
  '/login',
  '/verify/supply',
  '/verify/:performanceId',
  '/settlement/share/:token',
  '/entry/:performanceId',
  '/entry/:performanceId/entries',
  '/scan/:token',
  '/scan/:token/entries',
  '/tickets/:ticketId/transfer',
  '/transfers/:token',
  '/me/wallet/link',
  '/dev/ui',
  '/__lab/design-tools',
  '/__lab/design-refresh',
  '*',
])

/**
 * 화면 단위 코드 분할을 유지하면서 보호 화면만 인증 경계 안에 넣는다.
 *
 * `/studio/performances/:id/*`는 로그인만으로 부족하다 — 남의 공연 id를 주소에 넣으면
 * 관리 화면이 그려졌다. 경로 하나로 판별해 {@link RequirePerformanceAccess}를 덧씌운다
 * (`/studio/performances/new`는 `:id`가 없어 걸리지 않는다).
 */
const PERFORMANCE_SCOPED = '/studio/performances/:id'

function guarded(node: ReactNode, path: string): ReactNode {
  const inner = path.startsWith(PERFORMANCE_SCOPED) ? (
    <RequirePerformanceAccess>{node}</RequirePerformanceAccess>
  ) : (
    node
  )
  return <RequireAuth>{inner}</RequireAuth>
}

function withGuard(route: RouteObject): RouteObject {
  if (!route.path || PUBLIC_PATHS.has(route.path)) return route
  const path = route.path
  if (route.element) return { ...route, element: guarded(route.element, path) }
  if (typeof route.lazy !== 'function') return route

  const load = route.lazy
  return {
    ...route,
    lazy: async () => {
      const loaded = await load()
      if (!loaded.Component) return loaded
      const Component = loaded.Component
      return {
        ...loaded,
        Component: () => guarded(<Component />, path),
      }
    },
  }
}

/**
 * ⚠ 라우트마다 `handle.title`을 단다 — 탭 제목이 여기서 정해진다.
 *
 * 2026-09-10 감사에서 33개 화면이 전부 `B204`를 달고 있는 것이 드러났다. 화면 컴포넌트를
 * 33개 고치는 대신 **표 한 곳**에서 정하고, 루트의 `RouteTitle`이 읽어 세팅한다.
 * 제목을 안 주면 브랜드명(`불러요`)만 남는다 — 홈이 그 경우다.
 *
 * `description`은 링크 미리보기용이라 **밖에서 열리는 화면에만** 단다(V-03 정산 공유).
 * 공연명처럼 데이터에서 오는 값은 여기 담을 수 없다 — 정적 표이기 때문이다.
 */
export const router = createBrowserRouter([
  {
    element: <RouteTitle />,
    HydrateFallback: BrandLoader,
    errorElement: <RouteErrorPage />,
    children: [
      /* ── C 공통 ─────────────────────────────────────────────────── */
      { path: '/login', lazy: loginPage, handle: { title: '로그인' } }, // C-01
      { path: '/signup', lazy: signupPage, handle: { title: '회원가입' } }, // C-02
      { path: '/me', lazy: myPage, handle: { title: '마이페이지' } }, // C-03
      { path: '/me/preferences', lazy: preferencesPage, handle: { title: '언어·통화' } }, // C-04
      {
        path: '/onboarding/wallet',
        lazy: walletOnboardingPage,
        // 등록된 회원도 C-03에서 들어와 보는 화면이다. 제목 인프라가 정적 표라 상태별로 못 가른다
        handle: { title: '내 지갑' },
      }, // C-05

      /* ── A 관객 ─────────────────────────────────────────────────── */
      // 홈은 제목을 주지 않는다 — 탭에 브랜드명만 뜨는 게 맞다
      { path: '/', lazy: homePage }, // A-01
      // A-15 공연 목록. **':id'보다 먼저 둘 필요는 없다** — react-router 7은 정적 세그먼트가
      // 동적 세그먼트를 이기므로 순서와 무관하지만, 읽는 사람이 헷갈리지 않게 위에 둔다
      { path: '/performances', lazy: performanceListPage, handle: { title: '공연 목록' } }, // A-15
      { path: '/performances/:id', lazy: performanceDetailPage, handle: { title: '공연' } }, // A-02
      {
        path: '/performances/:id/order',
        lazy: orderOptionsPage,
        handle: { title: '티켓 선택' },
      }, // A-03
      {
        path: '/performances/:id/order/choice',
        lazy: orderTeamChoicePage,
        handle: { title: '응원할 팀 고르기' },
      }, // A-04
      { path: '/orders/:orderId/payment', lazy: paymentPage, handle: { title: '결제' } }, // A-05
      {
        path: '/orders/:orderId/complete',
        lazy: orderCompletePage,
        handle: { title: '예매 완료' },
      }, // A-06
      { path: '/tickets', lazy: myTicketsPage, handle: { title: '내 티켓' } }, // A-07
      { path: '/tickets/:ticketId', lazy: ticketDetailPage, handle: { title: '티켓' } }, // A-08
      {
        path: '/tickets/:ticketId/cancel',
        lazy: ticketCancelPage,
        handle: { title: '예매 취소' },
      }, // A-11
      { path: '/orders', lazy: ordersPage, handle: { title: '주문 내역' } }, // A-12
      { path: '/orders/:orderId', lazy: ordersPage, handle: { title: '주문 상세' } }, // A-12
      { path: '/wallet', lazy: walletPage, handle: { title: '잔액' } }, // A-13 (모바일 하단 탭 3번째)

      /* ── P 공연자(스튜디오) ──────────────────────────────────────── */
      { path: '/studio', lazy: studioHomePage, handle: { title: '스튜디오' } }, // P-01
      { path: '/studio/teams/new', lazy: teamCreatePage, handle: { title: '팀 만들기' } }, // P-02
      { path: '/studio/teams/:teamId', lazy: teamManagePage, handle: { title: '팀 관리' } }, // P-02
      {
        path: '/studio/performances/new',
        lazy: performanceCreatePage,
        handle: { title: '공연 등록' },
      }, // P-03
      {
        path: '/studio/performances/:id/edit',
        lazy: performanceEditPage,
        handle: { title: '공연 수정' },
      }, // P-03
      {
        path: '/studio/performances/:id/poster',
        lazy: performancePosterPage,
        handle: { title: '공연 포스터' },
      },
      {
        path: '/studio/performances/:id/artwork',
        lazy: performanceArtworkPage,
        handle: { title: '티켓 꾸미기' },
      },
      {
        path: '/studio/performances/:id/review',
        lazy: performanceReviewPage,
        handle: { title: '등록 전 확인' },
      },
      {
        path: '/studio/performances/:id/participants',
        lazy: participantsPage,
        handle: { title: '참여팀 관리' },
      }, // P-04
      {
        path: '/studio/performances/:id/rules',
        lazy: settlementRulesPage,
        handle: { title: '정산 규칙' },
      }, // P-05
      {
        path: '/studio/performances/:id/agreements',
        lazy: agreementsPage,
        handle: { title: '규칙 동의' },
      }, // P-06
      {
        path: '/studio/performances/:id/sales',
        lazy: salesStatusPage,
        handle: { title: '판매 현황' },
      }, // P-07
      {
        path: '/studio/performances/:id/settlement',
        lazy: settlementPage,
        handle: { title: '정산' },
      }, // P-08
      {
        path: '/studio/performances/:id/entries',
        lazy: studioEntriesPage,
        handle: { title: '입장 현황' },
      }, // S-03(공연자 경로)

      /* ── S 검표 (비로그인 · 링크 토큰) ─────────────────────────────
         ⚠ 서버가 발급하는 검표 링크는 performance-10 `entryUrl` =
            `{base}/entry/{performanceId}?token=…`이다(`AppProperties.entryUrl`).
            화면설계 v6는 `/scan/:token`이라 적었지만 P-04가 공유하는 것은 서버가 준 URL이라
            그 경로만 받으면 **모든 검표 링크가 404**다. 양쪽을 받고 불일치는 보고했다.
            옛 경로에는 공연 id가 없어 entry-01·02를 부를 수 없다 — 페이지가 안내만 띄운다. */
      { path: '/entry/:performanceId', lazy: scanPage, handle: { title: '검표' } }, // S-02
      {
        path: '/entry/:performanceId/entries',
        lazy: scanEntriesPage,
        handle: { title: '입장 현황' },
      }, // S-03
      { path: '/scan/:token', lazy: scanPage, handle: { title: '검표' } }, // S-02(옛 경로)
      { path: '/scan/:token/entries', lazy: scanEntriesPage, handle: { title: '입장 현황' } }, // S-03(옛 경로)

      /* ── V 검증 ─────────────────────────────────────────────────── */
      {
        path: '/verify/supply',
        lazy: supplyDisclosurePage,
        handle: {
          title: '발행량 공시',
          description: '지금 발행된 코인이 어디에 있는지, 불변식 검사 결과와 함께 공개합니다.',
        },
      }, // V-02 (":performanceId"보다 먼저)
      {
        path: '/verify/:performanceId',
        lazy: verifyPage,
        handle: {
          title: '정산 검증',
          description: '이 공연의 정산이 규칙대로 계산됐는지 온체인 기록과 대조해 확인합니다.',
        },
      }, // V-01
      // V-03(제안) 정산 공유 — 비로그인. 경로는 API 명세의 shareUrl 예시를 그대로 따른다.
      // 서버의 SETTLEMENT_SHARE_BASE_URL이 이 경로를 가리켜야 발급 링크가 열린다.
      // ⚠ 이 화면은 **링크로 공유되는 것이 존재 이유**라 description을 반드시 둔다
      {
        path: '/settlement/share/:token',
        lazy: settlementSharePage,
        handle: {
          title: '정산 결과',
          description: '공연 매출과 팀별 분배 결과입니다. 계산 근거를 그대로 함께 공개합니다.',
        },
      },

      /* ── M 관리자 ───────────────────────────────────────────────── */
      { path: '/admin/disputes', lazy: adminDisputesPage, handle: { title: '이의제기' } }, // M-02
      { path: '/admin/coin', lazy: adminCoinPage, handle: { title: '코인 운영' } }, // M-03

      /* ── v6에서 삭제된 라우트 리다이렉트 (§8.3) ──────────────────── */
      { path: '/tickets/:ticketId/transfer', element: <RedirectTransferToTicket /> }, // 구 A-09
      { path: '/transfers/:token', element: <Navigate to="/" replace /> }, // 구 A-10
      { path: '/me/wallet/link', element: <Navigate to="/onboarding/wallet" replace /> }, // 구 C-05

      ...buildDevRoutes(import.meta.env.DEV),
      { path: '*', lazy: notFoundPage, handle: { title: '화면을 찾을 수 없습니다' } },
    ].map(withGuard),
  },
])

export default router
