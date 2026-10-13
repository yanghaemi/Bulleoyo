/**
 * V-01 정산 검증 · V-02 발행량 공시 — 실 API 연결에서 **정직성**이 깨지는 지점을 못 박는다.
 *
 *   ① **두 호출을 함께 실패시키지 않는다.** coin_01(공개 API)이 죽어도 V-01 화면은 살아 있고
 *      불변식 ①·④만 "판정 불가"가 된다. 여기서 화면 전체를 에러로 덮으면 참여팀이 자기 공연의
 *      ②·③ 대조를 못 본다.
 *   ② **403은 페이지에서 끊는다.** 데이터를 한 조각도 컴포넌트에 넘기지 않는다(부분 표시 금지).
 *   ③ **"모른다"의 갈래를 뭉개지 않는다.** V-02의 `stale`(캐시 값을 보는 중)과 조회 실패는
 *      원인도 다음 행동도 다르다. 실패 화면에는 **마지막으로 성공한 응답의 `asOf`** 가 붙는다.
 */

import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'

import i18n from '@/shared/i18n'

import { SupplyDisclosurePage } from './SupplyDisclosurePage'
import { VerifyPage } from './VerifyPage'

const hooks = vi.hoisted(() => ({
  verification: { data: undefined as unknown, error: null as unknown, isPending: false },
  supply: { data: undefined as unknown, error: null as unknown, isPending: false },
}))

class FakeApiError extends Error {
  readonly code: string
  readonly status: number
  readonly msg: string
  constructor(code: string, status: number, msg = '') {
    super(code)
    this.code = code
    this.status = status
    this.msg = msg
  }
}

vi.mock('@/shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/client')>()
  return { ...actual, isApiError: (e: unknown) => e instanceof FakeApiError || actual.isApiError(e) }
})

vi.mock('@/shared/queries/verify', () => ({
  useVerification: () => ({ ...hooks.verification, refetch: vi.fn() }),
}))
vi.mock('@/shared/queries/coin', () => ({
  useCoinSupply: () => ({ ...hooks.supply, refetch: vi.fn() }),
}))

/** verify_01 200 예시를 화면이 그리는 최소한으로 줄인 것 */
function verification() {
  return {
    performanceId: 12,
    performanceTitle: '합정 3밴드 합동공연',
    performedAt: '2026-09-19T19:00:00+09:00',
    settlementStatus: 'RELEASED',
    network: 'kaia-kairos',
    chainId: 1001,
    contracts: {
      tokenAddress: '0x5f1e',
      tokenSymbol: 'YoYo',
      tokenDecimals: 0,
      revenueSplitter: '0xa1b2',
      explorerBaseUrl: 'https://kairos.kaiascan.io',
    },
    lockedRule: {
      rulesHash: '0x4d1c',
      raw: {
        performanceId: 12,
        fixedRatioBp: 6000,
        selectionRatioBp: 4000,
        teamShares: [{ teamId: 7, shareBp: 10000 }],
        hostTeamId: 7,
      },
      onchainRulesHash: '0x4d1c',
      hashMatched: true,
      lockedAt: '2026-09-03T11:00:00+09:00',
      startSaleTxHash: '0x8f2e',
    },
    agreements: [],
    onchainCounters: [
      { teamId: 7, teamIndex: 0, choiceCount: 64, purchaseCount: 64, refundCount: 0, refundedAmount: 0 },
    ],
    recalculationInput: {
      grossRevenueAmount: 1_600_000,
      refundedAmount: 75_000,
      netRevenueAmount: 1_525_000,
      distributableAmount: 1_525_000,
      fixedRatioBp: 6000,
      selectionRatioBp: 4000,
      teamShares: [{ teamId: 7, shareBp: 10000 }],
      participantCount: 1,
      totalChoiceCount: 64,
      roundingRule: 'FLOOR_TO_INTEGER_KRW',
      remainderRule: 'ASSIGN_DUST_TO_HOST_TEAM',
      hostTeamId: 7,
      dustAmount: 0,
      tokenDecimals: 0,
      currency: 'KRW',
    },
    shares: [
      { teamId: 7, teamName: '블루노트', fixedAmount: 915_000, choiceAmount: 610_000, dustAmount: 0, totalAmount: 1_525_000 },
    ],
    escrowReconciliation: {
      purchasedTotal: 1_600_000,
      refundedTotal: 75_000,
      releasedTotal: 1_525_000,
      escrowBalanceOnchain: 0,
      expectedEscrowBalance: 0,
      matched: true,
      note: '',
    },
    releaseReconciliation: {
      releasedEventTotal: 1_525_000,
      recalculatedTotal: 1_525_000,
      difference: 0,
      matched: true,
      releasedEvents: [],
    },
    depositReconciliation: {
      amount: 50_000,
      status: 'RETURNED',
      paidTxHash: '0x6c7d',
      returnTxHash: '0x8e9f',
      matched: true,
    },
    receiptSummary: [],
    releaseTx: null,
    guarantees: { guaranteed: [], notGuaranteed: [] },
    simulationNotice: '테스트넷 시연입니다.',
    refreshedAt: '2026-09-22T18:12:00+09:00',
    stale: false,
  }
}

/** coin_01 200 예시를 줄인 것 */
function supply(patch: Record<string, unknown> = {}) {
  return {
    totalSupply: 5_290_000,
    escrowTotal: 1_275_000,
    walletTotal: 4_015_000,
    grantCount: 53,
    supplyMatched: true,
    currency: 'KRW',
    issuer: { type: 'MOCK', label: 'Platform (demo grant)', replaceable: true },
    mintHalted: false,
    releaseHalted: false,
    network: 'kaia-kairos',
    chainId: 1001,
    tokenAddress: '0x5f1e',
    tokenSymbol: 'YoYo',
    tokenDecimals: 0,
    explorerUrl: 'https://kairos.kaiascan.io/address/0x5f1e',
    invariants: [],
    perPerformanceEscrow: [],
    asOf: '2026-09-22T18:12:00+09:00',
    nextRefreshAt: '2026-09-22T18:13:00+09:00',
    stale: false,
    disclosure: '테스트넷 시연입니다.',
    grantNotice: '전부 시연용 지급입니다.',
    ...patch,
  }
}

function renderVerify() {
  render(
    <MemoryRouter initialEntries={['/verify/12']}>
      <Routes>
        <Route path="/verify/:performanceId" element={<VerifyPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('ko')
  hooks.verification = { data: verification(), error: null, isPending: false }
  hooks.supply = { data: supply(), error: null, isPending: false }
})

it('공시(coin_01)가 죽어도 검증 화면은 살아 있고 ①·④만 판정 불가가 된다', () => {
  hooks.supply = {
    data: undefined,
    error: new FakeApiError('COMMON_EXTERNAL_SERVICE_ERROR', 502),
    isPending: false,
  }
  renderVerify()

  // 화면이 죽지 않았다 — verify_01 이 준 값은 그대로 그린다
  expect(screen.getByText('합정 3밴드 합동공연')).toBeInTheDocument()
  // ①·④만 "대조하지 못했다"고 말한다. "일치"라고 쓰지 않는다
  expect(
    screen.getAllByText(/발행량·에스크로 공시를 불러오지 못해 대조하지 못했습니다/),
  ).toHaveLength(2)
})

it('403 참여팀 아님이면 데이터를 한 조각도 그리지 않는다', () => {
  // 캐시에 직전 성공값이 남아 있어도 새 나가면 안 된다 — 그래서 data 를 함께 둔 채 검증한다
  hooks.verification = {
    data: verification(),
    error: new FakeApiError('SETTLEMENT_NOT_PARTICIPANT', 403, '이 공연의 참여팀이 아닙니다.'),
    isPending: false,
  }
  renderVerify()

  expect(screen.getByText('이 공연의 참여팀 리더만 볼 수 있어요')).toBeInTheDocument()
  expect(screen.queryByText('합정 3밴드 합동공연')).not.toBeInTheDocument()
})

it('V-02 는 캐시 값(stale)과 조회 실패를 다른 말로 구분한다', () => {
  // ⓐ stale — 값은 있지만 "지금" 체인 상태가 아니다
  hooks.supply = { data: supply({ stale: true }), error: null, isPending: false }
  const view = render(
    <MemoryRouter>
      <SupplyDisclosurePage />
    </MemoryRouter>,
  )
  expect(screen.getByText(/지금은 마지막으로 읽은 값입니다/)).toBeInTheDocument()
  view.unmount()

  // ⓑ 조회 실패 — 값이 아니라 "언제 마지막으로 성공했는지"를 알린다
  hooks.supply = {
    data: supply(),
    error: new FakeApiError('CHAIN_TX_TIMEOUT', 504, '체인 조회가 지연되고 있습니다.'),
    isPending: false,
  }
  render(
    <MemoryRouter>
      <SupplyDisclosurePage />
    </MemoryRouter>,
  )
  expect(screen.getByText(/마지막 성공 조회/)).toBeInTheDocument()
  expect(screen.queryByText(/지금은 마지막으로 읽은 값입니다/)).not.toBeInTheDocument()
})
