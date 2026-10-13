import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { RouteErrorPage } from '@/app/RouteErrorPage'
import { CoinOperations } from '@/features/admin/CoinOperations'
import { DisputeQueue } from '@/features/admin/DisputeQueue'
import type { CoinGrantHistory, DisputeStatus, ExchangeRateList } from '@/features/admin/adminTypes'
import { LoginScreen } from '@/features/member/LoginScreen'
import { MyPageScreen } from '@/features/member/MyPageScreen'
import { PreferencesScreen } from '@/features/member/PreferencesScreen'
import { ProfileEditSheet } from '@/features/member/ProfileEditSheet'
import { SignupScreen } from '@/features/member/SignupScreen'
import { PerformanceDetail } from '@/features/performance/PerformanceDetail'
import { PaymentScreen } from '@/features/payment/PaymentScreen'
import { BookingComplete } from '@/features/ticket/BookingComplete'
import { MyTickets, type TicketTab } from '@/features/ticket/MyTickets'
import { groupTicketsByPerformance } from '@/features/ticket/ticketGrouping'
import { TeamChoice } from '@/features/ticket/TeamChoice'
import { TicketDetail, type TicketDetailStatus } from '@/features/ticket/TicketDetail'
import { TicketOptions } from '@/features/ticket/TicketOptions'
import { WalletOnboarding, type WalletChoice } from '@/features/wallet/WalletOnboarding'
import { WalletScreen, type WalletTx } from '@/features/wallet/WalletScreen'
import { EntryStatus } from '@/features/entry/EntryStatus'
import type { EntryStatusData } from '@/features/entry/entryTypes'
import { SettlementShareView } from '@/features/settlement/SettlementShareView'
import { PerformanceForm } from '@/features/studio/PerformanceForm'
import { PerformanceReview } from '@/features/studio/PerformanceReview'
import { PosterEditor } from '@/features/studio/media/PosterEditor'
import { TicketArtworkEditor } from '@/features/studio/media/TicketArtworkEditor'
import { ParticipantManage, type ParticipantScreenData } from '@/features/studio/ParticipantManage'
import { RuleAgreements, type AgreementScreenData } from '@/features/studio/RuleAgreements'
import { SalesStatus, type SalesStatusData } from '@/features/studio/SalesStatus'
import { SettlementDashboard, type SettlementData } from '@/features/studio/SettlementDashboard'
import { SettlementRules, type RuleScreenData } from '@/features/studio/SettlementRules'
import { StudioHome } from '@/features/studio/StudioHome'
import { StudioShell } from '@/features/studio/StudioShell'
import { TeamCreate } from '@/features/studio/TeamCreate'
import { TeamManage } from '@/features/studio/TeamManage'
import { SettlementVerification } from '@/features/verify/SettlementVerification'
import { SupplyDisclosure } from '@/features/verify/SupplyDisclosure'
import verifyFixture from '@/shared/api/__fixtures__/verify_01.json'
import settlementShareFixture from '@/shared/api/__fixtures__/settlement_07.json'
import { toCoinSupply } from '@/shared/api/domains/coin'
import { toPublicSettlement } from '@/shared/api/domains/settlement'
import { toVerificationData } from '@/shared/api/domains/verify'
import type { ApiData } from '@/shared/api/schema'
import { AppHeader, LanguageSwitch, PageSkeleton } from '@/shared/ui'
import { setAppLanguage } from '@/shared/i18n'
import { useLocale } from '@/shared/i18n/useLocale'
import { PerformanceDiscoveryPrototype } from './prototypes/PerformanceDiscoveryPrototype'

const noop = () => undefined
const views = [
  'login',
  'signup',
  'my-page',
  'profile-edit',
  'preferences',
  'home',
  'detail',
  'ticket-options',
  'team-choice',
  'payment',
  'payment-loading',
  'wallet-loading',
  'balance',
  'wallet-setup',
  'complete',
  'tickets',
  'ticket-detail',
  'studio',
  'studio-team',
  'studio-team-manage',
  'studio-performance',
  'studio-participants',
  'studio-poster',
  'studio-artwork',
  'studio-review',
  'studio-settlement-rules',
  'studio-rules',
  'studio-sales',
  'studio-settlement',
  'studio-entries',
  'verify',
  'supply-disclosure',
  'public-settlement',
  'admin-disputes',
  'admin-coins',
  'route-error',
  'page-loading',
] as const
type View = (typeof views)[number]
const labels: Record<View, [string, string]> = {
  login: ['로그인', 'Login'],
  signup: ['가입 설정', 'Account setup'],
  'my-page': ['마이페이지', 'My page'],
  'profile-edit': ['프로필 수정', 'Profile edit'],
  preferences: ['환경설정', 'Preferences'],
  home: ['공연 탐색', 'Discover'],
  detail: ['공연 상세', 'Show details'],
  'ticket-options': ['티켓 선택', 'Ticket options'],
  'team-choice': ['팀 선택', 'Team choice'],
  payment: ['결제', 'Payment'],
  'payment-loading': ['결제 대기', 'Payment loading'],
  'wallet-loading': ['지갑 준비', 'Wallet loading'],
  balance: ['잔액', 'Balance'],
  'wallet-setup': ['지갑 등록', 'Wallet setup'],
  complete: ['예매 완료', 'Ticket'],
  tickets: ['내 티켓', 'My tickets'],
  'ticket-detail': ['티켓 상세', 'Ticket detail'],
  studio: ['스튜디오', 'Studio'],
  'studio-team': ['팀 만들기', 'Create team'],
  'studio-team-manage': ['팀 관리', 'Manage team'],
  'studio-performance': ['공연 만들기', 'Create show'],
  'studio-participants': ['참여팀', 'Participant teams'],
  'studio-poster': ['포스터 편집', 'Poster editor'],
  'studio-artwork': ['티켓 디자인', 'Ticket artwork'],
  'studio-review': ['등록 전 확인', 'Review before publishing'],
  'studio-settlement-rules': ['정산 규칙', 'Settlement rules'],
  'studio-rules': ['규칙 동의', 'Rule agreements'],
  'studio-sales': ['판매 현황', 'Sales overview'],
  'studio-settlement': ['정산', 'Settlement'],
  'studio-entries': ['입장 현황', 'Entry activity'],
  verify: ['정산 검증', 'Verification'],
  'supply-disclosure': ['발행량 공시', 'Supply disclosure'],
  'public-settlement': ['공개 정산', 'Public settlement'],
  'admin-disputes': ['이의제기 관리', 'Disputes'],
  'admin-coins': ['코인 운영', 'Coin operations'],
  'route-error': ['오류 복구', 'Route recovery'],
  'page-loading': ['목록 로딩', 'Page loading'],
}

/** Development-only presentation fixtures. No login, payment, or API mutation occurs here. */
export function DesignRefreshPage() {
  const { language, text } = useLocale()
  const [searchParams, setSearchParams] = useSearchParams()
  const view = parsePreviewView(searchParams.get('view'))
  const presentation = view === 'home' && searchParams.get('presentation') === '1'
  const requestedLanguage = searchParams.get('lang')

  useEffect(() => {
    if (requestedLanguage !== 'ko' && requestedLanguage !== 'en') return
    if (requestedLanguage === language) return
    void setAppLanguage(requestedLanguage)
  }, [language, requestedLanguage])
  const setView = (next: View) => {
    const params = new URLSearchParams(searchParams)
    params.set('view', next)
    setSearchParams(params, { replace: true })
  }
  const [country, setCountry] = useState('KR')
  const [terms, setTerms] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const [memberSettings, setMemberSettings] = useState({
    countryCode: 'KR',
    displayCurrency: 'KRW',
    timezone: 'Asia/Seoul',
  })
  const [artwork, setArtwork] = useState<'type' | 'poster' | 'broken'>('type')
  const [ticketState, setTicketState] = useState<TicketDetailStatus>('valid')
  const [ticketTab, setTicketTab] = useState<TicketTab>('upcoming')
  const [selectedTicketId, setSelectedTicketId] = useState('41')
  const [walletChoice, setWalletChoice] = useState<WalletChoice>('WEB3AUTH')
  const [longTitle, setLongTitle] = useState(false)
  const [disputeStatus, setDisputeStatus] = useState<DisputeStatus>('OPEN')
  const [selectedDisputeId, setSelectedDisputeId] = useState<number | null>(null)
  const [haltAcknowledged, setHaltAcknowledged] = useState(false)
  const [sampleQr, setSampleQr] = useState(() => makeSampleQr())
  const ticketPreview = view === 'complete' || view === 'tickets' || view === 'ticket-detail'
  const ticketArtwork =
    artwork === 'poster'
      ? '/posters/12.webp'
      : artwork === 'broken'
        ? '/posters/missing-preview-poster.webp'
        : undefined
  const fixture = {
    showTitle: text('서울 인디 나이트', 'Seoul Indie Night'),
    dateLabel: '2026. 09. 26 · 19:00 KST',
    venue: text('롤링홀 · 서울', 'Rolling Hall · Seoul'),
    ticketTypeName: text('스탠딩', 'Standing'),
    teamName: 'BULLEOYO',
    quantity: 1,
  }
  const carouselItems = [12, 8, 5].map((id, index) => ({
    performanceId: `preview-${id}`,
    title: [fixture.showTitle, 'Blue Hour', 'Sound of Tomorrow'][index],
    dateLabel: [fixture.dateLabel, '2026. 10. 03 · 18:00 KST', '2026. 10. 11 · 17:00 KST'][index],
    venue: [
      fixture.venue,
      text('무신사 개러지 · 서울', 'Musinsa Garage · Seoul'),
      text('노들섬 · 서울', 'Nodeul Island · Seoul'),
    ][index],
    priceLabel: ['25,000 YoYo', '32,000 YoYo', '28,000 YoYo'][index],
    posterImageUrl: `/posters/${id}.webp`,
  }))
  // Reproducible lab-only content stress cases; no production/API data is changed.
  const contentCase = searchParams.get('contentCase')
  if (contentCase === 'long-title') carouselItems[0].title = '서울 인디 나이트 — 서로 다른 음악이 만나는 아주 긴 이름의 특별한 밤'
  if (contentCase === 'unbroken-title') carouselItems[0].title = '서울인디나이트아주아주긴공백없는공연이름으로확인하는레이아웃'
  if (contentCase === 'large-price') carouselItems[0].priceLabel = '123,456,789 YoYo'
  if (contentCase === 'missing-poster') carouselItems[0].posterImageUrl = '/lab-missing-artwork.svg'
  const ticketFixture = {
    ...fixture,
    showTitle: longTitle
      ? text(
          '서울 인디 나이트 — 서로 다른 음악이 만나는 아주 긴 이름의 특별한 밤',
          'Seoul Indie Night — An Extraordinary Evening of Independent Music Together',
        )
      : fixture.showTitle,
    posterImageUrl: ticketArtwork,
  }
  const walletTransactions: WalletTx[] = [
    {
      walletTxId: 'preview-credit',
      type: 'GRANT',
      direction: 'IN',
      amount: 50_000,
      status: 'CONFIRMED',
      title: text('가입 축하 지급', 'Welcome credit'),
      occurredAt: '2026-09-18T09:10:00+09:00',
      occurredAtLabel: text('9월 18일 오전 9:10 KST', 'Sep 18, 9:10 AM KST'),
      grantMemo: text('샘플 지급 내역', 'Sample credit entry'),
    },
    {
      walletTxId: 'preview-payment',
      type: 'PURCHASE',
      direction: 'OUT',
      amount: 25_000,
      status: 'CONFIRMED',
      title: fixture.showTitle,
      occurredAt: '2026-09-18T10:30:00+09:00',
      occurredAtLabel: text('9월 18일 오전 10:30 KST', 'Sep 18, 10:30 AM KST'),
      linkTo: '/orders/PREVIEW-001',
    },
    {
      walletTxId: 'preview-refund',
      type: 'REFUND',
      direction: 'IN',
      amount: 12_500,
      status: 'PENDING',
      title: text('환불 처리 중', 'Refund in progress'),
      occurredAt: '2026-09-18T11:00:00+09:00',
      occurredAtLabel: text('9월 18일 오전 11:00 KST', 'Sep 18, 11:00 AM KST'),
    },
  ]
  const studioTeams = [{ teamId: 7, teamName: 'Blue Note' }]
  const studioWallet = {
    provider: 'WEB3AUTH' as const,
    address: '0x1234567890123456789012345678901234567890',
    status: 'LINKED' as const,
  }
  const participantData: ParticipantScreenData = {
    performanceId: 12,
    performanceStatus: 'PENDING_AGREEMENT',
    depositStatus: 'UNPAID',
    isOwner: true,
    participants: [
      {
        teamId: 7,
        teamName: 'Blue Note',
        host: true,
        participationStatus: 'ACCEPTED',
        leaderWalletLinked: true,
      },
      {
        teamId: 9,
        teamName: 'Dawn Three',
        host: false,
        participationStatus: 'ACCEPTED',
        leaderWalletLinked: true,
      },
    ],
    entryLink: {
      entryUrl: 'https://preview.invalid/entry/sample',
      issuedAt: '2026-09-20T09:00:00+09:00',
      expiresAt: '2026-09-26T22:00:00+09:00',
    },
  }
  const settlementRulesData: RuleScreenData = {
    performanceId: 12,
    performanceStatus: 'PENDING_AGREEMENT',
    depositStatus: 'PAID',
    locked: false,
    jointPerformance: true,
    participants: [
      { teamId: 7, teamName: 'Blue Note', host: true },
      { teamId: 9, teamName: 'Dawn Three', host: false },
    ],
    rule: {
      fixedRatioBp: 6000,
      selectionRatioBp: 4000,
      teamShares: [
        { teamId: 7, shareBp: 6000 },
        { teamId: 9, shareBp: 4000 },
      ],
    },
    agreedCount: 0,
    assumedRevenueAmount: 1_000_000,
  }
  const agreementData: AgreementScreenData = {
    performanceId: 12,
    performanceStatus: 'PENDING_AGREEMENT',
    depositStatus: 'PAID',
    locked: false,
    rulesHash: `0x${'1'.repeat(64)}`,
    rule: {
      fixedRatioBp: 6000,
      selectionRatioBp: 4000,
      teamShares: [
        { teamId: 7, shareBp: 5000 },
        { teamId: 9, shareBp: 5000 },
      ],
    },
    agreements: [
      { teamId: 7, teamName: 'Blue Note', status: 'AGREED' },
      { teamId: 9, teamName: 'Dawn Three', status: 'PENDING' },
    ],
    myAgreement: { teamId: 7, status: 'AGREED', nextAction: 'NONE' },
    startSaleAvailable: false,
    startSaleBlockedReason: 'RULE_NOT_AGREED_BY_ALL',
    isOwner: true,
  }
  const salesData: SalesStatusData = {
    onchainAvailable: true,
    status: 'ON_SALE',
    grossRevenueAmount: 1_600_000,
    refundedAmount: 75_000,
    escrowBalanceAmount: 1_525_000,
    paidTicketCount: 64,
    cancelledTicketCount: 3,
    ticketTypes: [
      {
        ticketTypeId: 31,
        name: text('일반', 'General'),
        priceAmount: 25_000,
        soldQuantity: 52,
        remainingQuantity: 28,
      },
    ],
    teamChoices: [
      {
        teamId: 7,
        teamName: 'Blue Note',
        teamIndex: 0,
        dbCount: 30,
        onchainCount: 30,
        matched: true,
      },
    ],
    counterMatched: true,
    escrowMatched: true,
  }
  const blockedSettlementAction = {
    available: false,
    blockedReason: 'SETTLEMENT_NOT_LOCKED',
  }
  const settlementData: SettlementData = {
    performanceId: 12,
    settlementId: 91,
    status: 'AGGREGATED',
    currency: 'KRW',
    grossRevenueAmount: 1_600_000,
    refundedAmount: 75_000,
    netRevenueAmount: 1_525_000,
    distributableAmount: 1_525_000,
    escrowBalanceAmount: 1_525_000,
    fixedRatioBp: 6000,
    selectionRatioBp: 4000,
    dustAmount: 0,
    dustTeamId: 7,
    rulesHash: `0x${'2'.repeat(64)}`,
    aggregatedAt: '2026-09-27T00:10:00+09:00',
    lockedAt: null,
    disputeClosesAt: null,
    releasedAt: null,
    releaseTxHash: null,
    counterMatched: true,
    deposit: { status: 'PAID', amount: 50_000, returnTxHash: null, returnedAt: null },
    shares: [
      {
        teamId: 7,
        teamName: 'Blue Note',
        walletAddress: '0x1234567890123456789012345678901234567890',
        fixedAmount: 549_000,
        choiceAmount: 305_000,
        dustAmount: 0,
        totalAmount: 854_000,
        choiceCount: 30,
        released: false,
        releasedAt: null,
        approvedAt: null,
      },
      {
        teamId: 9,
        teamName: 'Dawn Three',
        walletAddress: '0x9876543210987654321098765432109876543210',
        fixedAmount: 366_000,
        choiceAmount: 305_000,
        dustAmount: 0,
        totalAmount: 671_000,
        choiceCount: 30,
        released: false,
        releasedAt: null,
        approvedAt: null,
      },
    ],
    disputes: [],
    transactions: [],
    actions: {
      aggregate: blockedSettlementAction,
      lock: { available: true, blockedReason: null },
      dispute: blockedSettlementAction,
      release: blockedSettlementAction,
      approve: blockedSettlementAction,
    },
  }
  const entryStatusData: EntryStatusData = {
    performanceId: 12,
    summary: {
      enteredCount: 41,
      totalIssuedCount: 64,
      duplicateAttemptCount: 3,
      expiredQrCount: 1,
    },
    items: [
      {
        entryLogId: 77013,
        ticketId: 90211,
        result: 'FAILED',
        failureCode: 'ENTRY_ALREADY_ENTERED',
        scannedAt: '2026-09-26T19:12:31+09:00',
        scannerSource: 'ENTRY_LINK',
      },
      {
        entryLogId: 77012,
        ticketId: 90210,
        result: 'SUCCESS',
        scannedAt: '2026-09-26T19:11:08+09:00',
        scannerSource: 'ENTRY_LINK',
      },
    ],
    pageInfo: { page: 0, size: 20, totalElements: 44, hasNext: true },
  }
  const disputeItems = [
    {
      disputeId: 501,
      performanceId: 12,
      performanceTitle: fixture.showTitle,
      teamId: 7,
      teamName: 'Blue Note',
      status: 'OPEN' as const,
      reason: text(
        '선택 카운터가 공연 종료 시점 기록과 다릅니다.',
        'The audience-choice counter differs from the show-end record.',
      ),
      expectedAmount: 854_000,
      currency: 'KRW',
      settlementStatus: 'DISPUTE_OPEN' as const,
      disputeClosesAt: '2026-09-29T00:10:00+09:00',
      releaseHeld: true,
      createdAt: '2026-09-27T09:30:00+09:00',
      resolvedAt: null,
    },
  ]
  const verificationBase = toVerificationData(verifyFixture.data as unknown as ApiData<'verify_01'>)
  const verificationTeamNames = [
    text('블루노트', 'Blue Note'),
    text('던 쓰리', 'Dawn Three'),
    text('모노 웨이브', 'Mono Wave'),
  ]
  const verificationData = {
    ...verificationBase,
    performanceTitle: fixture.showTitle,
    agreements: verificationBase.agreements.map((agreement, index) => ({
      ...agreement,
      teamName: verificationTeamNames[index] ?? agreement.teamName,
    })),
    shares: verificationBase.shares.map((share, index) => ({
      ...share,
      teamName: verificationTeamNames[index] ?? share.teamName,
    })),
    guarantees: {
      guaranteed: [
        text('잠긴 규칙의 사후 변경 방지', 'Locked rules cannot be changed afterward'),
        text('같은 입력으로 분배 결과 재현', 'The payout can be reproduced from the same inputs'),
      ],
      notGuaranteed: [
        text('입력 데이터 자체의 진실성', 'The truthfulness of source data'),
        text('완전한 탈중앙 운영', 'Fully decentralized operation'),
      ],
    },
    simulationNotice: text(
      '테스트넷 시연 결과이며 실제 자금이 아닙니다.',
      'This is a testnet demonstration and does not represent real funds.',
    ),
  }
  const supplyData = toCoinSupply({
    totalSupply: 950_000,
    escrowTotal: 225_000,
    walletTotal: 725_000,
    grantCount: 12,
    supplyMatched: true,
    mintHalted: false,
    releaseHalted: false,
    currency: 'KRW',
    tokenSymbol: 'YoYo',
    tokenDecimals: 0,
    network: 'kaia-kairos',
    chainId: 1001,
    tokenAddress: '0xA5d7031D70DAab33EACDfC912baC0668D5776e5b',
    explorerUrl: 'https://kairos.kaiascan.io/token/0xA5d7031D70DAab33EACDfC912baC0668D5776e5b',
    asOf: '2026-09-22T09:20:00+09:00',
    nextRefreshAt: '2026-09-22T09:21:00+09:00',
    stale: false,
    disclosure: text(
      '테스트넷 발행량과 보관 위치를 공개합니다.',
      'Testnet supply and custody are disclosed here.',
    ),
    grantNotice: text('시연용 지급 내역입니다.', 'Demo grant records only.'),
    issuer: { type: 'MOCK', label: 'Platform (demo grant)', replaceable: true },
    invariants: [
      { no: 1, expected: 950_000, actual: 950_000, matched: true },
      { no: 2, checkedShows: 6, mismatchedShows: 0, matched: true },
      { no: 3, checkedShows: 3, maxDiff: 0, matched: true },
      { no: 4, expected: 950_000, actual: 950_000, matched: true },
    ],
    perPerformanceEscrow: [{ performanceId: 12, escrowAmount: 175_000, depositAmount: 50_000 }],
  })
  const grantHistoryData: CoinGrantHistory = {
    summary: {
      grantCount: 12,
      grantedTotal: 950_000,
      signupCount: 8,
      signupTotal: 800_000,
      adminCount: 4,
      adminTotal: 150_000,
      currency: 'KRW',
    },
    items: [
      {
        jobId: 'job-preview-12',
        source: 'ADMIN',
        status: 'CONFIRMED',
        memberId: 204,
        memberName: 'Preview member',
        address: '0x1234567890123456789012345678901234567890',
        amount: 50_000,
        memo: text('리허설 잔액 보충', 'Rehearsal balance top-up'),
        requesterId: 1,
        requesterName: 'Admin',
        grantRef: 'preview-grant-ref',
        txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        explorerUrl:
          'https://kairos.kaiascan.io/tx/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        requestedAt: '2026-09-22T09:10:00+09:00',
        confirmedAt: '2026-09-22T09:11:00+09:00',
      },
    ],
    pageInfo: { page: 0, size: 20, totalElements: 1, hasNext: false },
  }
  const rateData: ExchangeRateList = {
    rates: [
      {
        pair: 'USD_KRW',
        base: 'USD',
        quote: 'KRW',
        rate: 1_350,
        effectiveFrom: '2026-09-22T09:00:00+09:00',
        source: 'MANUAL',
      },
    ],
    usageNotice: text(
      '표시 환산에만 사용되는 환율입니다.',
      'This rate is used for display conversion only.',
    ),
    refreshedAt: '2026-09-22T09:20:00+09:00',
  }
  const publicSettlementBase = toPublicSettlement(
    settlementShareFixture.data as unknown as ApiData<'settlement_07'>,
  )
  const publicSettlementData = {
    ...publicSettlementBase,
    performanceTitle: fixture.showTitle,
    shares: publicSettlementBase.shares.map((share, index) => ({
      ...share,
      teamName: verificationTeamNames[index] ?? share.teamName,
    })),
    simulationNotice: text(
      '테스트넷 시연 정산이며 실제 자금이 아닙니다.',
      'This is a testnet settlement demonstration and does not represent real funds.',
    ),
  }
  return (
    <>
      {!presentation && (
        <aside
          className="design-preview-controls"
          aria-label={text('디자인 미리보기', 'Design preview')}
        >
          <div>
            <strong>{text('디자인 미리보기', 'DESIGN PREVIEW')}</strong>
            <span>{text('샘플 데이터 · 실제 결제 없음', 'Sample data · no real transactions')}</span>
          </div>
          <nav>
            {views.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={view === item}
                onClick={() => setView(item)}
              >
                {text(...labels[item])}
              </button>
            ))}
          </nav>
          <LanguageSwitch />
        </aside>
      )}
      {ticketPreview && (
        <section
          className="border-b border-line bg-surface px-5 py-4"
          aria-label={text('티켓 시안 설정', 'Ticket preview settings')}
        >
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-4 text-sm text-ink">
            <label className="flex items-center gap-2">
              {text('티켓 배경', 'Ticket artwork')}
              <select
                className="min-h-11 rounded-control border border-line bg-ground px-3"
                value={artwork}
                onChange={(event) => setArtwork(event.target.value as typeof artwork)}
              >
                <option value="type">{text('타이포그래피', 'Typography')}</option>
                <option value="poster">{text('공연 포스터', 'Show poster')}</option>
                <option value="broken">{text('포스터 오류', 'Broken poster')}</option>
              </select>
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={longTitle}
                onChange={(event) => setLongTitle(event.target.checked)}
              />
              {text('긴 공연명', 'Long title')}
            </label>
            {view === 'ticket-detail' && (
              <>
                <label className="flex items-center gap-2">
                  {text('티켓 상태', 'Ticket state')}
                  <select
                    className="min-h-11 rounded-control border border-line bg-ground px-3"
                    value={ticketState}
                    onChange={(event) => setTicketState(event.target.value as TicketDetailStatus)}
                  >
                    <option value="valid">{text('사용 가능', 'Valid')}</option>
                    <option value="used">{text('사용 완료', 'Used')}</option>
                    <option value="cancelled">{text('취소됨', 'Cancelled')}</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="min-h-11 rounded-control border border-line px-3"
                  onClick={() => setSampleQr(makeSampleQr())}
                >
                  {text('샘플 QR 갱신', 'Renew sample QR')}
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-control border border-line px-3"
                  onClick={() =>
                    setSampleQr((previous) => ({
                      ...previous,
                      expiresAt: new Date(0).toISOString(),
                    }))
                  }
                >
                  {text('QR 만료 보기', 'Expire QR')}
                </button>
                <p className="w-full text-muted">
                  {text(
                    '샘플 QR · 실제 입장에 사용할 수 없습니다',
                    'Sample QR · not valid for entry',
                  )}
                </p>
              </>
            )}
          </div>
        </section>
      )}
      {view === 'login' || view === 'wallet-loading' ? (
        <LoginScreen
          language={language}
          onLanguageChange={setAppLanguage}
          countryCode={country}
          termsAgreed={terms}
          privacyAgreed={privacy}
          onCountryCodeChange={setCountry}
          onTermsAgreedChange={setTerms}
          onPrivacyAgreedChange={setPrivacy}
          onSignIn={noop}
          pending={view === 'wallet-loading'}
          pendingPhase="social-wallet"
        />
      ) : null}
      {view === 'signup' && (
        <SignupScreen
          values={{ ...memberSettings, locale: language, preferredGenres: ['INDIE'] }}
          onChange={(patch) => {
            if (patch.locale) setAppLanguage(patch.locale)
            setMemberSettings((current) => ({ ...current, ...patch }))
          }}
          welcomeBalanceKrw={10000}
          onSubmit={noop}
          onBack={noop}
        />
      )}
      {(view === 'my-page' || view === 'profile-edit') && (
        <>
          <MyPageScreen
            data={{
              name: text('미리보기 회원', 'Preview member'),
              email: 'preview@example.com',
              social: 'GOOGLE',
              walletProvider: 'WEB3AUTH',
              balanceKrw: 50000,
              approxLabel: language === 'ko' ? undefined : '$37.00',
              updatedAtLabel: text('방금', 'just now'),
              languageLabel: [
                text('한국어', 'English'),
                memberSettings.displayCurrency,
                memberSettings.timezone,
              ].join(' · '),
            }}
            onEditName={() => setView('profile-edit')}
            onRetryBalance={noop}
            onSignOut={noop}
          />
          <ProfileEditSheet
            open={view === 'profile-edit'}
            initialName={text('미리보기 회원', 'Preview member')}
            onClose={() => setView('my-page')}
            onSave={noop}
          />
        </>
      )}
      {view === 'preferences' && (
        <PreferencesScreen
          values={{
            locale: language,
            displayCurrency: memberSettings.displayCurrency,
            timezone: memberSettings.timezone,
            preferredGenres: ['INDIE', 'JAZZ'],
          }}
          rates={[
            {
              pair: 'USD_KRW',
              base: 'USD',
              rate: 1350,
              effectiveFrom: '2026-09-18T10:00:00+09:00',
            },
          ]}
          onChange={(patch) => {
            if (patch.locale) setAppLanguage(patch.locale)
            setMemberSettings((current) => ({ ...current, ...patch }))
          }}
          onSave={noop}
          onRetryRates={noop}
        />
      )}
      {view === 'balance' && (
        <WalletScreen
          balanceKrw={25_000}
          approxLabel={language === 'en' ? '$18.52' : undefined}
          updatedAtLabel={text('방금', 'just now')}
          transactions={walletTransactions}
          onRetryBalance={noop}
        />
      )}
      {view === 'wallet-setup' && (
        <WalletOnboarding
          phase={{ kind: 'choose' }}
          selected={walletChoice}
          onSelect={setWalletChoice}
          onConfirm={noop}
          onRetry={noop}
          onFinish={noop}
        />
      )}
      {view === 'home' && <PerformanceDiscoveryPrototype shows={carouselItems} />}
      {view === 'detail' && (
        <PerformanceDetail
          data={{
            performanceId: 12,
            title: fixture.showTitle,
            status: 'on-sale',
            dateLabel: fixture.dateLabel,
            venue: fixture.venue,
            teamNames: ['BULLEOYO', 'Blue Hour'],
            minPriceLabel: '25,000 YoYo',
            description: text(
              '서로 다른 음악이 하나의 밤으로 모입니다. 두 팀이 함께 만드는 무대에서 새로운 라이브를 만나보세요.',
              'Two bands. One shared stage. Discover a night of new sounds and familiar feelings.',
            ),
            posterImageUrl: '/posters/12.webp',
          }}
          onBook={noop}
        />
      )}
      {view === 'ticket-options' && (
        <TicketOptions
          data={{
            performanceId: '12',
            showTitle: fixture.showTitle,
            dateLabel: fixture.dateLabel,
            venue: fixture.venue,
            posterImageUrl: '/posters/12.webp',
            ticketTypes: [
              {
                ticketTypeId: '31',
                name: text('스탠딩', 'Standing'),
                price: 25_000,
                remaining: 28,
              },
              {
                ticketTypeId: '32',
                name: text('지정석', 'Reserved seat'),
                price: 35_000,
                remaining: 4,
              },
              {
                ticketTypeId: '33',
                name: text('현장 관람', 'Door ticket'),
                price: 40_000,
                remaining: 0,
              },
            ],
          }}
          onNext={noop}
        />
      )}
      {view === 'team-choice' && (
        <TeamChoice
          data={{
            showTitle: fixture.showTitle,
            teams: [
              { teamId: 7, teamName: 'BULLEOYO', posterImageUrl: '/posters/12.webp' },
              { teamId: 9, teamName: 'Blue Hour', posterImageUrl: '/posters/8.webp' },
            ],
            summary: {
              performanceId: '12',
              showTitle: fixture.showTitle,
              dateLabel: fixture.dateLabel,
              venue: fixture.venue,
              posterImageUrl: '/posters/12.webp',
              ticketTypeName: fixture.ticketTypeName,
              quantity: 3,
              totalAmount: 75_000,
            },
          }}
          onContinue={noop}
        />
      )}
      {(view === 'payment' || view === 'payment-loading') && (
        <PaymentScreen
          data={{
            ...fixture,
            performanceId: '12',
            posterImageUrl: '/posters/12.webp',
            totalAmount: 25000,
            walletBalance: 50000,
          }}
          state={
            view === 'payment-loading'
              ? { kind: 'signing', index: 1, total: 2 }
              : { kind: 'review' }
          }
          onPay={noop}
          onRetry={noop}
          onViewBalance={noop}
          onBackToShow={noop}
        />
      )}
      {view === 'complete' && (
        <BookingComplete
          data={{
            ...ticketFixture,
            orderNumber: 'PREVIEW-001',
            totalPaidLabel: '25,000 YoYo',
            paidAtLabel: fixture.dateLabel,
          }}
          onViewTickets={() => setView('tickets')}
          onBackHome={noop}
        />
      )}
      {view === 'tickets' && (
        <MyTickets
          active={ticketTab}
          onTabChange={setTicketTab}
          tickets={groupTicketsByPerformance(
            (['upcoming', 'upcoming', 'used', 'cancelled'] as const).map((tab, index) => ({
              ...ticketFixture,
              ticketId: String(41 + index),
              performanceId: '12',
              tab,
            })),
          )}
          onSelect={(ticket) => {
            setSelectedTicketId(ticket.ticketId)
            setTicketState(ticket.tab === 'upcoming' ? 'valid' : ticket.tab)
            setView('ticket-detail')
          }}
        />
      )}
      {view === 'ticket-detail' && (
        <TicketDetail
          data={{
            ...ticketFixture,
            ticketId: selectedTicketId,
            ticketNumber: selectedTicketId,
            orderNumber: 'PREVIEW-001',
            performanceId: '12',
            status: ticketState,
            ...sampleQr,
            rotateAfterMs: 30_000,
            usedAtLabel: ticketState === 'used' ? fixture.dateLabel : undefined,
            cancellable: ticketState === 'valid',
          }}
          ticketSequence={
            ticketState === 'valid'
              ? {
                  ticketIds: ['41', '42'],
                  activeIndex: selectedTicketId === '42' ? 1 : 0,
                }
              : undefined
          }
          onSelectTicket={(nextTicketId) => {
            setSelectedTicketId(nextTicketId)
            setSampleQr(makeSampleQr())
          }}
          onRotateQr={() => setSampleQr(makeSampleQr())}
          onCancel={noop}
        />
      )}
      {view === 'studio' && (
        <StudioShell teams={studioTeams} activeTeamId={7}>
          <StudioHome
            teams={[
              {
                ...studioTeams[0],
                leader: true,
                walletAddress: studioWallet.address,
              },
            ]}
            performances={[
              {
                performanceId: 12,
                title: fixture.showTitle,
                startAtLabel: fixture.dateLabel,
                status: 'DRAFT',
                settlementStatus: 'NONE',
                depositStatus: 'UNPAID',
                teamId: 7,
                host: true,
                participationStatus: 'ACCEPTED',
                myTeamAgreementStatus: 'PENDING',
                pendingSignature: 'DEPOSIT',
              },
            ]}
            wallet={studioWallet}
          />
        </StudioShell>
      )}
      {view === 'studio-team' && (
        <StudioShell
          teams={studioTeams}
          activeTeamId={7}
          title={text('팀 만들기', 'Create team')}
          backTo="?v=2&view=studio"
        >
          <TeamCreate wallet={studioWallet} onSubmit={noop} />
        </StudioShell>
      )}
      {view === 'studio-team-manage' && (
        <StudioShell teams={studioTeams} activeTeamId={7} backTo="?v=2&view=studio">
          <TeamManage
            data={{
              teamId: 7,
              teamName: 'Blue Note',
              introduction: text(
                '두 팀이 함께 만드는 라이브 음악 크루입니다.',
                'A two-team live music collective.',
              ),
            }}
            wallet={{
              ...studioWallet,
              balanceAmount: 125_000,
              approxLabel: '$92.59',
              cachedAt: '2026-09-22T09:20:00+09:00',
              stale: false,
            }}
            transactions={[]}
            onSave={noop}
          />
        </StudioShell>
      )}
      {view === 'studio-performance' && (
        <StudioShell
          teams={studioTeams}
          activeTeamId={7}
          title={text('새 공연 만들기', 'Create a show')}
          backTo="?v=2&view=studio"
        >
          <PerformanceForm mode="create" teams={studioTeams} wallet={studioWallet} />
        </StudioShell>
      )}
      {view === 'studio-participants' && (
        <StudioShell
          teams={studioTeams}
          activeTeamId={7}
          title={fixture.showTitle}
          backTo="?v=2&view=studio-performance"
        >
          <ParticipantManage title={fixture.showTitle} data={participantData} />
        </StudioShell>
      )}
      {view === 'studio-poster' && (
        <StudioShell
          teams={studioTeams}
          activeTeamId={7}
          title={text('공연 포스터', 'Show poster')}
          backTo="?v=2&view=studio-performance"
        >
          <PosterEditor />
        </StudioShell>
      )}
      {view === 'studio-artwork' && (
        <StudioShell
          teams={studioTeams}
          activeTeamId={7}
          title={text('티켓 디자인', 'Ticket artwork')}
          backTo="?v=2&view=studio-performance"
        >
          <TicketArtworkEditor initialTitle={fixture.showTitle} />
        </StudioShell>
      )}
      {view === 'studio-review' && (
        <StudioShell
          teams={studioTeams}
          activeTeamId={7}
          title={text('등록 전 확인', 'Review before publishing')}
          backTo="?v=2&view=studio-performance"
        >
          <PerformanceReview
            info={{
              title: fixture.showTitle,
              startAtLabel: fixture.dateLabel,
              venueName: fixture.venue,
            }}
            posterImageUrl="/posters/12.webp"
            ticketArtworkImageUrl="/posters/8.webp"
            ticketTypes={[
              {
                key: 'standing',
                name: fixture.ticketTypeName,
                priceLabel: '25,000 YoYo',
                totalQuantityLabel: text('50매', '50 tickets'),
              },
            ]}
            onEditInfo={() => setView('studio-performance')}
            onEditPoster={() => setView('studio-poster')}
            onEditTicketArtwork={() => setView('studio-artwork')}
            onEditTicketTypes={() => setView('studio-performance')}
          />
        </StudioShell>
      )}
      {view === 'studio-settlement-rules' && (
        <StudioShell teams={studioTeams} activeTeamId={7} title={fixture.showTitle} backTo="?v=2&view=studio-performance">
          <SettlementRules title={fixture.showTitle} data={settlementRulesData} />
        </StudioShell>
      )}
      {view === 'studio-rules' && (
        <StudioShell teams={studioTeams} activeTeamId={7} title={fixture.showTitle} backTo="?v=2&view=studio-performance">
          <RuleAgreements title={fixture.showTitle} data={agreementData} />
        </StudioShell>
      )}
      {view === 'studio-sales' && (
        <StudioShell teams={studioTeams} activeTeamId={7} title={fixture.showTitle} backTo="?v=2&view=studio-performance">
          <SalesStatus title={fixture.showTitle} data={salesData} />
        </StudioShell>
      )}
      {view === 'studio-settlement' && (
        <StudioShell teams={studioTeams} activeTeamId={7} title={fixture.showTitle} backTo="?v=2&view=studio-performance">
          <SettlementDashboard title={fixture.showTitle} data={settlementData} />
        </StudioShell>
      )}
      {view === 'studio-entries' && (
        <StudioShell teams={studioTeams} activeTeamId={7} title={fixture.showTitle} backTo="?v=2&view=studio-performance">
          <EntryStatus title={fixture.showTitle} data={entryStatusData} onRefresh={noop} />
        </StudioShell>
      )}
      {view === 'verify' && (
        <>
          <AppHeader
            signedIn
            notificationItems={[
              {
                id: 'preview-invite',
                title: text('공연 초대에 응답해 주세요', 'Respond to your show invitation'),
                description: text('서울 인디 나이트 · 팀 #7', 'Seoul Indie Night · Team #7'),
                to: '/studio/performances/7/participants',
              },
              {
                id: 'preview-agreement',
                title: text('규칙 동의가 필요합니다', 'Agreement required'),
                description: text('블루 아워 · 팀 #12', 'Blue Hour · Team #12'),
                to: '/studio/performances/12/agreements',
              },
            ]}
          />
          <SettlementVerification data={verificationData} supply={supplyData} />
        </>
      )}
      {view === 'supply-disclosure' && (
        <>
          <AppHeader />
          <SupplyDisclosure data={supplyData} lastSuccessAt={supplyData.asOf} />
        </>
      )}
      {view === 'public-settlement' && (
        <div className="min-h-dvh bg-ground">
          <SettlementShareView data={publicSettlementData} />
        </div>
      )}
      {view === 'admin-disputes' && (
        <main className="mx-auto min-h-dvh max-w-[1200px] bg-ground px-4 py-8 md:px-6">
          <DisputeQueue
            loading={false}
            summary={{ openCount: 1, releaseHeldCount: 1 }}
            items={disputeStatus === 'OPEN' ? disputeItems : []}
            status={disputeStatus}
            onStatusChange={(next) => {
              setDisputeStatus(next)
              setSelectedDisputeId(null)
            }}
            pageInfo={{ page: 0, size: 20, totalElements: 1, hasNext: false }}
            onPageChange={noop}
            selectedId={selectedDisputeId}
            onSelect={setSelectedDisputeId}
            detail={{ loading: false, data: settlementData }}
            onResolve={async (_disputeId, request) => ({
              ok: true,
              data: {
                disputeId: 501,
                performanceId: 12,
                teamId: 7,
                status: request.status,
                releaseHeld: request.status === 'RESOLVED',
                resolvedAt: '2026-09-27T10:00:00+09:00',
              },
            })}
            onRetry={noop}
            onRetryDetail={noop}
          />
        </main>
      )}
      {view === 'admin-coins' && (
        <main className="mx-auto min-h-dvh max-w-[1200px] bg-ground px-4 py-8 md:px-6">
          <CoinOperations
            supply={{
              loading: false,
              data: supplyData,
              onRefresh: noop,
            }}
            halt={{
              acknowledged: haltAcknowledged,
              onAcknowledge: () => setHaltAcknowledged(true),
            }}
            grantForm={{
              onGrant: async () => ({ ok: false, code: 'PREVIEW_READ_ONLY' }),
              onAccepted: noop,
              job: null,
              prefill: null,
            }}
            grantHistory={{
              loading: false,
              history: grantHistoryData,
              filter: { target: '', from: '', to: '' },
              onFilterChange: noop,
              onRetry: noop,
              onRetryGrant: noop,
            }}
            rateForm={{
              current: rateData,
              onRegister: async () => ({ ok: false, code: 'PREVIEW_READ_ONLY' }),
            }}
            rateHistory={{
              loading: false,
              data: rateData,
              onRetry: noop,
            }}
          />
        </main>
      )}
      {view === 'route-error' && <RouteErrorPage />}
      {view === 'page-loading' && (
        <>
          <AppHeader />
          <main className="mx-auto max-w-[1200px] px-5 py-12">
            <PageSkeleton variant="home" />
          </main>
        </>
      )}
    </>
  )
}

function parsePreviewView(value: string | null): View {
  return views.includes(value as View) ? (value as View) : 'home'
}

function makeSampleQr() {
  const now = Date.now()
  return {
    qrToken: `sample-only-not-valid-for-entry-${now}`,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
  }
}
