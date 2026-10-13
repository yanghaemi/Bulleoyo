/**
 * P-08 정산 대시보드 — 실 API 연결에서 틀리면 돈이 잘못 나가는 세 가지를 못 박는다.
 *
 *   ① **202는 성공이 아니다.** aggregate·lock·release는 접수까지만 돌아온다. job 이 CONFIRMED
 *      되기 전에 확정 UI로 넘어가면 체인에서 실패한 지급이 "완료"로 보인다.
 *   ② **release 재시도는 같은 멱등키를 쓴다.** 새 키로 재시도하면 서버가 다른 요청으로 보고
 *      팀 지갑에 **두 번 지급**한다(§0.8).
 *   ③ **`available: true`여도 409가 난다.** 집계 대사·에스크로 잔액은 체인을 읽어야 알 수 있어
 *      조회 시점에 못 막는다. 그 `code`가 화면 문구로 도착해야 한다.
 */

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import i18n from '@/shared/i18n'
import { beforeEach, expect, it, vi } from 'vitest'

import { SettlementPage } from './SettlementPage'

const hooks = vi.hoisted(() => ({
  data: undefined as unknown,
  /** release 호출마다 넘어온 변수(멱등키 확인용) */
  releaseCalls: [] as { idempotencyKey: string }[],
  /** release 뮤테이션이 돌려줄 값. 던지면 409 경로다 */
  releaseResult: null as
    { kind: 'accepted'; jobId: string } | { kind: 'error'; code: string } | null,
  /** `useChainJob`에 넘어온 jobId와 콜백 */
  job: null as { jobId: string | null; options: Record<string, (j: unknown) => void> } | null,
}))

class FakeApiError extends Error {
  readonly code: string
  readonly status = 409
  readonly msg = ''
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

vi.mock('@/shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/client')>()
  return {
    ...actual,
    isApiError: (e: unknown) => e instanceof FakeApiError || actual.isApiError(e),
  }
})

vi.mock('@/shared/queries/settlement', () => ({
  useSettlement: () => ({ data: hooks.data, isPending: false, error: null, refetch: vi.fn() }),
  useAggregateSettlement: () => ({ mutateAsync: vi.fn() }),
  useLockSettlement: () => ({ mutateAsync: vi.fn() }),
  useReleaseSettlement: () => ({
    mutateAsync: (variables: { idempotencyKey: string }) => {
      hooks.releaseCalls.push(variables)
      const result = hooks.releaseResult
      if (result?.kind === 'error') return Promise.reject(new FakeApiError(result.code))
      return Promise.resolve({ jobId: result?.jobId ?? 'job-1' })
    },
  }),
  useCreateDispute: () => ({ mutateAsync: vi.fn() }),
  useApproveSettlement: () => ({ mutateAsync: vi.fn() }),
  useCreateSettlementShareLink: () => ({ mutateAsync: vi.fn() }),
}))

vi.mock('@/shared/queries/chain', () => ({
  useChainJob: (jobId: string | null, options: Record<string, (j: unknown) => void>) => {
    hooks.job = { jobId, options }
    return { timedOut: false }
  },
}))

vi.mock('@/shared/queries/performance', () => ({
  usePerformanceDetail: () => ({
    data: { performanceId: 12, title: '합정 3밴드 합동공연' },
    isPending: false,
  }),
}))
vi.mock('@/shared/queries/team', () => ({
  useMyTeams: () => ({ data: { items: [{ teamId: 7, teamName: '블루노트' }] } }),
}))

/** settlement_01 200 예시를 줄인 것. release 만 열려 있다 */
function settlement() {
  const blocked = { available: false, blockedReason: 'SETTLEMENT_ALREADY_RELEASED' }
  return {
    performanceId: 12,
    settlementId: 91,
    status: 'LOCKED',
    currency: 'KRW',
    grossRevenueAmount: 1_600_000,
    refundedAmount: 75_000,
    netRevenueAmount: 1_525_000,
    distributableAmount: 1_525_000,
    escrowBalanceAmount: 1_525_000,
    fixedRatioBp: 6000,
    selectionRatioBp: 4000,
    dustAmount: 0,
    dustTeamId: null,
    rulesHash: '0x4d1c',
    aggregatedAt: '2026-09-20T10:00:00+09:00',
    lockedAt: '2026-09-20T18:00:00+09:00',
    disputeClosesAt: null,
    releasedAt: null,
    releaseTxHash: null,
    counterMatched: true,
    deposit: { status: 'PAID', amount: 50_000, returnTxHash: null, returnedAt: null },
    shares: [],
    myTeam: {
      teamId: 11,
      totalAmount: 306_903,
      released: false,
      releasedAt: null,
      walletAddress: '0x9e0d',
      nextAction: 'WAIT_RELEASE',
    },
    disputes: [],
    transactions: [],
    actions: {
      aggregate: blocked,
      lock: blocked,
      dispute: blocked,
      release: { available: true, blockedReason: null },
      // 조기 동의(settlement_08). 이 시나리오의 주인공은 release라 막아 둔다
      approve: blocked,
    },
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/studio/performances/12/settlement']}>
      <Routes>
        <Route path="/studio/performances/:id/settlement" element={<SettlementPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('ko')
  hooks.data = settlement()
  hooks.releaseCalls = []
  hooks.releaseResult = { kind: 'accepted', jobId: 'job-release-1' }
  hooks.job = null
})

it('202 를 성공으로 쓰지 않는다 — job 이 확정될 때까지 처리 중을 유지한다', async () => {
  const user = userEvent.setup()
  renderPage()

  await user.click(screen.getAllByRole('button', { name: '정산금 지급' })[0])
  const confirm = await screen.findByRole('alertdialog')
  await user.click(within(confirm).getByRole('button', { name: '정산금 지급' }))

  // 202 접수 직후 — 확정 UI 로 넘어가지 않고 "처리 중"이 떠 있어야 한다
  await waitFor(() => expect(screen.getByText(/처리 중 ·\s*정산금 지급/)).toBeInTheDocument())
  expect(hooks.job?.jobId).toBe('job-release-1')

  // 확정이 와야 비로소 끝난다
  act(() => hooks.job?.options.onConfirmed?.({ jobId: 'job-release-1' }))
  await waitFor(() => expect(screen.queryByText(/처리 중 ·\s*정산금 지급/)).not.toBeInTheDocument())
})

it('release 재시도는 처음과 같은 멱등키를 다시 넘긴다 — 새 키면 두 번 지급된다', async () => {
  const user = userEvent.setup()
  renderPage()

  // 첫 시도: 409 로 되돌아온다
  hooks.releaseResult = { kind: 'error', code: 'COIN_ESCROW_INSUFFICIENT' }
  await user.click(screen.getAllByRole('button', { name: '정산금 지급' })[0])
  await user.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', { name: '정산금 지급' }),
  )
  // `available: true` 였는데도 409 다 — 체인을 읽어야 아는 실패라 조회 시점에 못 막는다
  await waitFor(() =>
    expect(screen.getByText(/에스크로 잔액이 분배 합계보다 적습니다/)).toBeInTheDocument(),
  )

  // 재시도
  hooks.releaseResult = { kind: 'accepted', jobId: 'job-release-2' }
  await user.click(screen.getAllByRole('button', { name: '정산금 지급' })[0])
  await user.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', { name: '정산금 지급' }),
  )

  await waitFor(() => expect(hooks.releaseCalls).toHaveLength(2))
  expect(hooks.releaseCalls[0].idempotencyKey).toBeTruthy()
  expect(hooks.releaseCalls[1].idempotencyKey).toBe(hooks.releaseCalls[0].idempotencyKey)
})

it('job 이 FAILED 로 끝나면 failureReason 코드로 안내한다 — 성공으로 넘기지 않는다', async () => {
  const user = userEvent.setup()
  renderPage()

  await user.click(screen.getAllByRole('button', { name: '정산금 지급' })[0])
  await user.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', { name: '정산금 지급' }),
  )
  await waitFor(() => expect(hooks.job?.jobId).toBe('job-release-1'))

  act(() =>
    hooks.job?.options.onFailed?.({
      jobId: 'job-release-1',
      failureReason: 'CHAIN_GAS_INSUFFICIENT',
    }),
  )

  await waitFor(() => expect(screen.getByText(/운영 지갑 가스가 부족합니다/)).toBeInTheDocument())
})

/* ───────────── [2026-09-24] 패스키 본인 확인(API v7 §7.W) — 정산금 지급 ───────────── */

const stepUpMocks = vi.hoisted(() => ({
  supported: vi.fn(),
  get: vi.fn(),
  authenticationOptions: vi.fn(),
  authenticate: vi.fn(),
}))

// 브라우저 WebAuthn 호출만 가짜로 둔다. 취소 판정(isPasskeyCancelled)은 실제 코드다.
vi.mock('@/shared/auth/passkey', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/auth/passkey')>()),
  isPasskeySupported: stepUpMocks.supported,
  getPasskeyAssertion: stepUpMocks.get,
}))
vi.mock('@/shared/api/domains/webauthn', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api/domains/webauthn')>()),
  fetchAuthenticationOptions: stepUpMocks.authenticationOptions,
  authenticatePasskey: stepUpMocks.authenticate,
}))

function withStepUp() {
  hooks.data = { ...settlement(), stepUpRequired: true }
  stepUpMocks.supported.mockResolvedValue(true)
  stepUpMocks.authenticationOptions.mockResolvedValue({
    registered: true,
    challenge: 'Y2g',
    rpId: 'localhost',
    allowCredentials: [{ type: 'public-key', id: 'Y3JlZA' }],
    timeout: 60000,
    userVerification: 'required',
  })
  stepUpMocks.get.mockResolvedValue({
    credentialId: 'Y3JlZA',
    clientDataJSON: 'Y2Q',
    authenticatorData: 'YWQ',
    signature: 'c2ln',
  })
  stepUpMocks.authenticate.mockResolvedValue({
    stepUpToken: 'tok-rel',
    expiresAt: '2030-01-01T00:00:00Z',
  })
}

async function clickRelease(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole('button', { name: '정산금 지급' })[0])
  await user.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', { name: '정산금 지급' }),
  )
}

it('stepUpRequired 가 없으면 본인 확인 없이 지급한다 — 헤더도 싣지 않는다', async () => {
  stepUpMocks.authenticationOptions.mockClear()
  const user = userEvent.setup()
  renderPage()
  await clickRelease(user)

  await waitFor(() => expect(hooks.releaseCalls).toHaveLength(1))
  expect(stepUpMocks.authenticationOptions).not.toHaveBeenCalled()
  expect(hooks.releaseCalls[0]).not.toHaveProperty('stepUpToken')
})

it('stepUpRequired 면 지급 직전 본인 확인 — 범위는 정산금 지급·이 공연, 토큰을 싣는다', async () => {
  withStepUp()
  const user = userEvent.setup()
  renderPage()
  await clickRelease(user)

  const dialog = await screen.findByRole('dialog', { name: '본인 확인' })
  expect(hooks.releaseCalls).toHaveLength(0)
  expect(stepUpMocks.authenticationOptions).toHaveBeenCalledWith({
    action: 'SETTLEMENT_RELEASE',
    targetId: 12,
  })

  await user.click(await within(dialog).findByRole('button', { name: '본인 확인' }))
  expect(stepUpMocks.get).toHaveBeenCalledTimes(1)

  await waitFor(() => expect(hooks.releaseCalls).toHaveLength(1))
  expect(hooks.releaseCalls[0]).toMatchObject({ stepUpToken: 'tok-rel' })
})

it('본인 확인 창을 닫으면(NotAllowedError) 에러 없이 원래 상태 — 지급하지 않는다', async () => {
  withStepUp()
  stepUpMocks.get.mockRejectedValue(new DOMException('cancelled', 'NotAllowedError'))
  const user = userEvent.setup()
  renderPage()
  await clickRelease(user)

  const dialog = await screen.findByRole('dialog', { name: '본인 확인' })
  await user.click(await within(dialog).findByRole('button', { name: '본인 확인' }))

  await waitFor(() => expect(screen.queryByRole('dialog', { name: '본인 확인' })).toBeNull())
  expect(hooks.releaseCalls).toHaveLength(0)
  expect(screen.queryByText(/처리 중 ·\s*정산금 지급/)).toBeNull()
  expect(screen.queryByRole('alert')).toBeNull()
})
