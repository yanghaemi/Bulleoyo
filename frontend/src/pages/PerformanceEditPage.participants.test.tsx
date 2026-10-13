/**
 * P-03 여는 단계 — **덜 끝난 앞 단계로 되돌린다**(S15P21B204-136, 장부 D-76).
 *
 * ① **참여팀이 규칙·동의·보증금보다 앞이다.** 규칙 화면(P-05)은 공연 상세의 `participants[]`
 *    로 팀 몫 행을 만들고, 서버는 공동 공연의 보증금 prepare 에서 수락 참여팀 2 이상을
 *    요구한다(`TEAM_MIN_COUNT_NOT_MET`, MR !135). 초대가 덜 끝난 공동 공연을 뒤 단계로 열어
 *    주면 어느 쪽에서도 진행할 수 없다.
 * ② **규칙 동의가 보증금보다 앞이다**(팀 결정 2026-09-21). 보증금은 판매 직전 마지막 잠금이라
 *    전원 동의가 끝나기 전에 보증금 단계를 요청하면 동의 단계를 먼저 연다. 이건 서버 제약이
 *    아니라 순서 안내라서, 규칙이 아직 없으면(rule_02 404) 되돌리지 않는다.
 *
 * 두 판정 모두 **조회가 도착해야** 할 수 있어(`jointPerformance`·`participants[]`·
 * `agreements[]`) 폼이 첫 렌더가 아니라 값이 도착한 시점에 단계를 다시 읽는다 — 그 연결을
 * 여기서 못 박는다.
 */

import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import i18n from '@/shared/i18n'

import { SETUP_STEP_DEPOSIT } from '@/features/studio/setupSteps'

import { PerformanceEditPage } from './PerformanceEditPage'

/** 테스트마다 갈아 끼우는 공연 상세 — `vi.mock` 은 호이스팅되므로 참조를 통해 바꾼다 */
const detail = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
  /** 조회가 늦게 도착하는 경우 — 폼은 값이 들어온 시점에 단계를 다시 읽어야 한다 */
  pending: false,
}))

/**
 * rule_02 응답 — 규칙 동의 게이트의 입력이다.
 * `value: undefined` = 규칙 미저장(404). 그때는 되돌리지 않는다.
 */
const rules = vi.hoisted(() => ({
  value: undefined as Record<string, unknown> | undefined,
  pending: false,
}))

vi.mock('@/shared/blockchain/useWeb3Auth', () => ({ useWeb3Auth: () => ({ adapter: undefined }) }))
vi.mock('@/shared/queries/chain', () => ({ useChainJob: () => ({ timedOut: false }) }))
vi.mock('@/shared/queries/team', () => ({
  useMyTeams: () => ({ data: { items: [{ teamId: 7, teamName: '블루노트', leader: true }] } }),
}))
vi.mock('@/shared/queries/wallet', () => ({
  useMyWallet: () => ({
    data: {
      provider: 'WEB3AUTH',
      address: '0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b',
      status: 'LINKED',
      balance: { amount: 120_000 },
    },
  }),
}))
vi.mock('@/shared/queries/rule', () => ({
  useRuleStatus: () => ({ data: rules.value, isPending: rules.pending, refetch: vi.fn() }),
}))
vi.mock('@/shared/queries/performance', () => ({
  usePerformanceDetail: () => ({
    data: detail.pending ? undefined : detail.value,
    isPending: detail.pending,
    refetch: vi.fn(),
  }),
  useTicketTypes: () => ({
    data: detail.pending
      ? undefined
      : {
          performanceId: 12,
          ticketTypes: [
            {
              ticketTypeId: 31,
              name: '일반',
              priceAmount: 25_000,
              currency: 'KRW',
              totalQuantity: 80,
              remainingQuantity: 41,
            },
          ],
        },
    isPending: detail.pending,
    refetch: vi.fn(),
  }),
  useMyPerformanceRows: () => ({
    data: { items: [{ performanceId: 12, host: true, depositStatus: 'UNPAID' }] },
  }),
  useUpdatePerformance: () => ({ mutateAsync: vi.fn() }),
  useSetTicketTypes: () => ({ mutateAsync: vi.fn() }),
  usePrepareDeposit: () => ({ mutateAsync: vi.fn() }),
  useReportDepositSignedTx: () => ({ mutateAsync: vi.fn() }),
  useCancelPerformance: () => ({ mutate: vi.fn(), isPending: false }),
}))

interface ShowOptions {
  jointPerformance: boolean
  participants?: { teamId: number; teamName: string; host: boolean }[]
  /**
   * 규칙 저장 여부는 **공연 상태로 안다** — 규칙을 저장해야 `DRAFT → PENDING_AGREEMENT` 다
   * (`RuleService`). rule_02 가 응답을 주는 공연은 `PENDING_AGREEMENT` 여야 앞뒤가 맞는다.
   */
  status?: string
}

function show({ jointPerformance, participants, status = 'DRAFT' }: ShowOptions) {
  return {
    performanceId: 12,
    title: '합정 3밴드 합동공연',
    venueName: '합정 언플러그드',
    venueAddress: '서울 마포구 양화로 000',
    startAt: '2030-09-19T19:00:00+09:00',
    endAt: '2030-09-19T22:00:00+09:00',
    status,
    jointPerformance,
    ...(participants ? { participants } : {}),
  }
}

const HOST_ONLY = [{ teamId: 7, teamName: '블루노트', host: true }]
const TWO_TEAMS = [...HOST_ONLY, { teamId: 8, teamName: '한강밴드', host: false }]

function renderPage(step: number) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/studio/performances/12/edit', state: { step } }]}>
      <Routes>
        <Route path="/studio/performances/:id/edit" element={<PerformanceEditPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** 전원 동의를 마친 rule_02 응답 — 보증금 단계가 그대로 열려야 하는 상태 */
function agreed(statuses: string[]) {
  return {
    performanceId: 12,
    locked: false,
    agreements: statuses.map((status, i) => ({
      teamId: 7 + i,
      teamName: `팀${i}`,
      status,
    })),
    startSaleAvailable: false,
    // 보증금이 마지막 단계라 이 자리는 늘 보증금 이유다 — 동의 판정에 쓰면 안 되는 값이다
    startSaleBlockedReason: 'PERFORMANCE_INVALID_STATUS',
  }
}

beforeEach(async () => {
  await i18n.changeLanguage('ko')
  detail.pending = false
  rules.value = undefined
  rules.pending = false
})

it('공동 공연의 참여팀이 하나뿐이면 보증금을 요청해도 참여팀 단계를 먼저 연다', async () => {
  // 그대로 보증금을 열면 prepare 가 409 `TEAM_MIN_COUNT_NOT_MET` 로 되돌아온다
  detail.value = show({ jointPerformance: true, participants: HOST_ONLY })

  renderPage(SETUP_STEP_DEPOSIT)

  expect(await screen.findByRole('region', { name: '참여팀' })).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: '보증금' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: '참여팀 초대' })).toHaveAttribute(
    'href',
    '/studio/performances/12/participants',
  )
})

it('참여팀이 둘이면 요청한 보증금 단계를 그대로 연다', async () => {
  detail.value = show({ jointPerformance: true, participants: TWO_TEAMS })

  renderPage(SETUP_STEP_DEPOSIT)

  expect(await screen.findByRole('region', { name: '보증금' })).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: '참여팀' })).not.toBeInTheDocument()
})

it('단독 공연은 참여팀이 하나여도 보증금 단계를 연다', async () => {
  detail.value = show({ jointPerformance: false, participants: HOST_ONLY })

  renderPage(SETUP_STEP_DEPOSIT)

  expect(await screen.findByRole('region', { name: '보증금' })).toBeInTheDocument()
})

it('공연이 늦게 도착해도 단계 판정을 놓치지 않는다', async () => {
  // 폼은 조회 중에 이미 마운트된다(스켈레톤도 폼이 그린다). 첫 렌더의 `initialStep` 만
  // 읽으면 공동 공연 판정이 끝나기 전 값이라 그대로 보증금이 열린다
  detail.pending = true
  detail.value = show({ jointPerformance: true, participants: HOST_ONLY })

  const { rerender } = renderPage(SETUP_STEP_DEPOSIT)
  detail.pending = false
  rerender(
    <MemoryRouter
      initialEntries={[
        { pathname: '/studio/performances/12/edit', state: { step: SETUP_STEP_DEPOSIT } },
      ]}
    >
      <Routes>
        <Route path="/studio/performances/:id/edit" element={<PerformanceEditPage />} />
      </Routes>
    </MemoryRouter>,
  )

  await waitFor(() => expect(screen.getByRole('region', { name: '참여팀' })).toBeInTheDocument())
})

/* ── 규칙 동의 게이트(팀 결정 2026-09-21) ────────────────────────────── */

it('전원 동의 전이면 보증금을 요청해도 규칙 동의 단계를 먼저 연다', async () => {
  detail.value = show({
    jointPerformance: true,
    participants: TWO_TEAMS,
    status: 'PENDING_AGREEMENT',
  })
  rules.value = agreed(['AGREED', 'PENDING'])

  renderPage(SETUP_STEP_DEPOSIT)

  expect(await screen.findByRole('region', { name: '규칙 동의' })).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: '보증금' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: '규칙 동의 받으러 가기' })).toHaveAttribute(
    'href',
    '/studio/performances/12/agreements',
  )
})

it('전원 동의를 마쳤으면 요청한 보증금 단계를 그대로 연다', async () => {
  detail.value = show({
    jointPerformance: true,
    participants: TWO_TEAMS,
    status: 'PENDING_AGREEMENT',
  })
  rules.value = agreed(['AGREED', 'AGREED'])

  renderPage(SETUP_STEP_DEPOSIT)

  expect(await screen.findByRole('region', { name: '보증금' })).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: '규칙 동의' })).not.toBeInTheDocument()
})

it('단독 공연도 리더 본인이 동의해야 보증금으로 넘어간다', async () => {
  // 컨트랙트가 `agreedCount == teamWallets.length` 를 요구한다 — 참여팀이 하나뿐이어도
  // 그 리더의 서명이 필요하다. 건너뛰는 것은 참여팀 단계뿐이다
  detail.value = show({
    jointPerformance: false,
    participants: HOST_ONLY,
    status: 'PENDING_AGREEMENT',
  })
  rules.value = agreed(['PENDING'])

  renderPage(SETUP_STEP_DEPOSIT)

  expect(await screen.findByRole('region', { name: '규칙 동의' })).toBeInTheDocument()
})

it('규칙이 아직 없으면 되돌리지 않는다 — 보증금은 서버 409 가 막는다', async () => {
  // rule_02 404. 동의 단계로 보내 봐야 "규칙을 먼저 저장하세요"밖에 할 수 없고,
  // 화면이 서버보다 앞서 막으면 규칙·보증금 어느 쪽으로도 못 가는 교착이 된다
  detail.value = show({ jointPerformance: false, participants: HOST_ONLY })
  rules.value = undefined

  renderPage(SETUP_STEP_DEPOSIT)

  expect(await screen.findByRole('region', { name: '보증금' })).toBeInTheDocument()
})
