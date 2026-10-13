/**
 * P-06 규칙 동의·판매 시작 — 비결정적 순서를 못 박는다.
 *
 * 세 가지가 화면만 보고는 드러나지 않는다.
 *   ① 동의: prepare → 서명 → 보고 → **확정**. 202를 완료로 읽으면 아직 온체인에 없는 동의를
 *      "동의 완료"로 보여준다.
 *   ② prepare의 `signRequests`가 빈 배열이면 **오류가 아니라 서명 없이 완료**다(rule_03).
 *   ③ 판매 시작: 202의 `jobId`가 비고 `prerequisiteJobId`만 오면 `START_SALE` job이 아직 없다.
 *      그 선행 job을 지켜보는 것만으로는 판매가 시작되지 않는다 — **다시 호출**해야 한다.
 *      두 경우 모두 화면에는 똑같이 "확인 중…"만 뜬다.
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import i18n from '@/shared/i18n'

import { ApiError } from '@/shared/api/client'
import { WalletError } from '@/shared/blockchain/WalletAdapter'

import { AgreementsPage } from './AgreementsPage'

/**
 * 지갑 어댑터 더블. `warmUp`·`getAddress`를 갖는 것이 중요하다 — 화면이 마운트에서 그 둘로
 * 준비를 확인하고 그동안 동의 버튼을 잠근다(D-77). 둘이 없는 더블은 "즉시 준비됨"이 되어
 * 게이트를 통째로 건너뛴다.
 */
const adapter = vi.hoisted(() => ({
  signTransaction: vi.fn(),
  warmUp: vi.fn(),
  getAddress: vi.fn(),
}))
const WALLET_ADDRESS = '0x9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6f7081920'
const rule = vi.hoisted(() => ({
  prepare: vi.fn(),
  report: vi.fn(),
  startSale: vi.fn(),
  refetch: vi.fn(),
  data: undefined as unknown,
  statusCalls: [] as Array<{ performanceId: number; options?: { teamId?: number } }>,
}))
const chain = vi.hoisted(() => ({
  jobIds: [] as (string | null)[],
  options: undefined as { onConfirmed?: () => void; onFailed?: (job: unknown) => void } | undefined,
}))

vi.mock('@/shared/blockchain/useWeb3Auth', () => ({ useWeb3Auth: () => ({ adapter }) }))
vi.mock('@/shared/queries/chain', () => ({
  useChainJob: (jobId: string | null, options: typeof chain.options) => {
    chain.jobIds.push(jobId)
    chain.options = options
    return { timedOut: false }
  },
}))
vi.mock('@/shared/queries/team', () => ({
  useMyTeams: () => ({ data: { items: [{ teamId: 11, teamName: '노이즈캔슬', leader: true }] } }),
}))
vi.mock('@/shared/queries/performance', () => ({
  usePerformanceDetail: () => ({
    data: { performanceId: 12, title: '합정 3밴드 합동공연', status: 'PENDING_AGREEMENT' },
    isPending: false,
    refetch: vi.fn(),
  }),
  useMyPerformanceRows: () => ({
    data: { items: [{ performanceId: 12, teamId: 11, host: true, depositStatus: 'PAID' }] },
    isPending: false,
  }),
}))
vi.mock('@/shared/queries/rule', () => ({
  useRuleStatus: (performanceId: number, options?: { teamId?: number }) => {
    rule.statusCalls.push({ performanceId, options })
    return { data: rule.data, isPending: false, error: null, refetch: rule.refetch }
  },
  usePrepareAgreement: () => ({ mutateAsync: rule.prepare }),
  useReportAgreementSignedTx: () => ({ mutateAsync: rule.report }),
  useStartSale: () => ({ mutateAsync: rule.startSale }),
}))

const RULES_HASH = '0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f'

/** rule_02 200 — 우리 팀(11)이 아직 미동의. 인자로 갈래만 바꾼다 */
function ruleStatus(overrides: Record<string, unknown> = {}) {
  return {
    performanceId: 12,
    performanceStatus: 'PENDING_AGREEMENT',
    depositStatus: 'PAID',
    locked: false,
    rulesHash: RULES_HASH,
    rule: {
      fixedRatioBp: 6000,
      selectionRatioBp: 4000,
      teamShares: [
        { teamId: 7, shareBp: 5000 },
        { teamId: 11, shareBp: 5000 },
      ],
    },
    agreements: [
      {
        teamId: 7,
        teamName: '블루노트',
        walletAddress: '0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b',
        status: 'AGREED',
        txHash: null,
        explorerUrl: null,
        agreedAt: '2026-09-03T10:02:00+09:00',
      },
      {
        teamId: 11,
        teamName: '노이즈캔슬',
        walletAddress: '0x9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6f7081920',
        status: 'PENDING',
        txHash: null,
        explorerUrl: null,
        agreedAt: null,
      },
    ],
    myAgreement: { teamId: 11, status: 'PENDING', nextAction: 'SIGN' },
    startSaleAvailable: false,
    startSaleBlockedReason: 'RULE_NOT_AGREED_BY_ALL',
    ...overrides,
  }
}

function agreeSignRequest() {
  return {
    kind: 'AGREE' as const,
    required: true,
    txType: 'FEE_DELEGATED_SMART_CONTRACT_EXECUTION' as const,
    to: '0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
    data: '0x8f4ffcb1',
    value: '0x0' as const,
    chainId: '0x3e9' as const,
    feePayer: '0x9f8e7d6c5b4a39281706f5e4d3c2b1a098765432',
    summary: {},
  }
}

function renderPage(initialEntry = '/studio/performances/12/agreements') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/studio/performances/:id/agreements" element={<AgreementsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** 폴링 중인 job 을 확정시킨다 */
function confirmJob() {
  act(() => chain.options?.onConfirmed?.())
}

/**
 * 진행 표시(§5.14)의 현재 문구. PC 본문과 모바일 하단 고정이 같은 것을 그리므로 jsdom 에서는
 * 늘 두 벌이다 — 개수가 아니라 "그 문구가 떠 있는가"만 본다.
 */
function progressShows(text: string): boolean {
  return screen.queryAllByRole('status').some((el) => (el.textContent ?? '').includes(text))
}

beforeEach(async () => {
  await i18n.changeLanguage('ko')
  vi.clearAllMocks()
  chain.jobIds = []
  chain.options = undefined
  rule.data = ruleStatus()
  rule.statusCalls = []
  adapter.signTransaction.mockResolvedValue('0xsignedrlp')
  adapter.warmUp.mockResolvedValue(undefined)
  adapter.getAddress.mockResolvedValue(WALLET_ADDRESS)
})

it('알림 링크의 teamId를 규칙 상태 조회에 전달한다', () => {
  renderPage('/studio/performances/12/agreements?teamId=32')

  expect(rule.statusCalls).toContainEqual({
    performanceId: 12,
    options: expect.objectContaining({ enabled: true, teamId: 32 }),
  })
})

/**
 * 동의 버튼을 누른다 — **열릴 때까지 기다린 뒤에** 누른다.
 *
 * 지갑 준비 게이트(D-77) 때문에 마운트 직후 버튼은 잠겨 있다. 실제 사용자도 그 사이에는
 * 누를 수 없으므로 테스트도 같은 순서를 따른다. PC 본문·모바일 하단 고정이 같은 버튼을
 * 그리므로 jsdom 에서는 늘 두 벌이다.
 */
async function clickAgree(name = '우리 팀 동의하기') {
  const button = await waitFor(() => {
    const [first] = screen.getAllByRole('button', { name })
    expect(first).toBeEnabled()
    return first
  })
  fireEvent.click(button)
}

it('동의는 prepare → 서명 → 보고 → 확정 순서를 지킨다', async () => {
  rule.prepare.mockResolvedValue({
    performanceId: 12,
    teamId: 11,
    rulesHash: RULES_HASH,
    prerequisiteJobId: null,
    signRequests: [agreeSignRequest()],
    expiresAt: '2026-09-03T10:30:00+09:00',
  })
  rule.report.mockResolvedValue({ jobId: 'job-agree', status: 'SUBMITTED', pollAfterMs: 1500 })

  renderPage()
  await clickAgree()

  // prepare 가 준 서명 요청에만 서명한다 — 화면이 파라미터를 만들지 않는다
  await waitFor(() => expect(adapter.signTransaction).toHaveBeenCalledTimes(1))
  expect(rule.prepare).toHaveBeenCalledWith({
    performanceId: 12,
    body: { teamId: 11, rulesHash: RULES_HASH },
  })
  expect(adapter.signTransaction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'AGREE' }))

  // 보고한 RLP 는 지갑이 만든 값 그대로다
  await waitFor(() =>
    expect(rule.report).toHaveBeenCalledWith({
      performanceId: 12,
      teamId: 11,
      kind: 'AGREE',
      senderSignedRlp: '0xsignedrlp',
    }),
  )

  // 202 는 끝이 아니다 — job 을 폴링하는 동안은 "확인 중…"이고 아직 완료가 아니다
  await waitFor(() => expect(chain.jobIds).toContain('job-agree'))
  await waitFor(() => expect(progressShows('확인 중')).toBe(true))

  // 확정되면 진행 표시가 끝난다. **배지를 낙관적으로 AGREED 로 옮기지 않는다** —
  // 동의 현황은 rule_02 를 다시 읽어 바뀐다(무효화는 훅이 한다)
  confirmJob()
  await waitFor(() => expect(progressShows('확인 중')).toBe(false))
  expect(screen.queryByRole('alert')).toBeNull()
})

/**
 * D-77 원인 B — 선행 job 확정 뒤에는 **같은 클릭으로 서명 팝업을 열지 않는다.**
 *
 * 확정 대기는 수 초라 그 뒤의 `eth_sign`은 브라우저의 사용자 활성화가 만료된 상태에서
 * 팝업을 열게 된다. 새 클릭 = 새 활성화이므로 "서명하기" 단계로 돌려주고 한 번 더 받는다.
 */
it('선행 createShow job 확정 뒤에는 자동 서명하지 않고 서명하기 단계로 돌아온다', async () => {
  rule.prepare
    .mockResolvedValueOnce({
      performanceId: 12,
      teamId: 11,
      rulesHash: RULES_HASH,
      prerequisiteJobId: 'job-create-show',
      signRequests: [agreeSignRequest()],
      expiresAt: '2026-09-03T10:30:00+09:00',
    })
    // 두 번째 클릭의 prepare — 선행 job 이 확정됐으므로 곧바로 서명으로 간다
    .mockResolvedValue({
      performanceId: 12,
      teamId: 11,
      rulesHash: RULES_HASH,
      prerequisiteJobId: null,
      signRequests: [agreeSignRequest()],
      expiresAt: '2026-09-03T10:30:00+09:00',
    })
  rule.report.mockResolvedValue({ jobId: 'job-agree', status: 'SUBMITTED', pollAfterMs: 1500 })

  renderPage()
  await clickAgree()

  await waitFor(() => expect(progressShows('확인 중')).toBe(true))
  expect(chain.jobIds).toContain('job-create-show')
  expect(adapter.signTransaction).not.toHaveBeenCalled()

  confirmJob()

  // 확정만으로는 서명하지 않는다 — 버튼이 "서명하기"로 바뀌어 클릭을 기다린다
  await screen.findAllByText(/공연 등록이 확정됐어요/)
  expect(adapter.signTransaction).not.toHaveBeenCalled()
  // 실패가 아니다 — 오류 문구를 남기지 않는다
  expect(screen.queryByRole('alert')).toBeNull()

  await clickAgree('서명하기')
  await waitFor(() => expect(adapter.signTransaction).toHaveBeenCalledTimes(1))
  expect(rule.prepare).toHaveBeenCalledTimes(2)
})

/**
 * D-77 원인 A — 화면 진입 직후의 클릭이 계정 없는 지갑으로 나가지 않는다.
 *
 * 9/21 dev 에서 첫 클릭들은 `eth_accounts`가 빈 배열이어서 `NOT_CONNECTED`로 떨어졌고,
 * 사용자에게는 "3~4번 눌러야 팝업이 뜬다"로 보였다. 이제 마운트에서 기다리고 버튼을 잠근다.
 */
it('지갑이 준비될 때까지 동의 버튼을 잠그고 준비 중임을 알린다', async () => {
  // wallet-services 가 아직 계정을 못 주는 창: 한 번 빈 계정, 다음에 주소
  adapter.getAddress.mockResolvedValueOnce(null).mockResolvedValue(WALLET_ADDRESS)
  rule.prepare.mockResolvedValue({
    performanceId: 12,
    teamId: 11,
    rulesHash: RULES_HASH,
    prerequisiteJobId: null,
    signRequests: [agreeSignRequest()],
    expiresAt: '2026-09-03T10:30:00+09:00',
  })
  rule.report.mockResolvedValue({ jobId: 'job-agree', status: 'SUBMITTED', pollAfterMs: 1500 })

  renderPage()

  // 준비 전: 버튼은 잠기고 이유가 한 줄로 떠 있다
  await screen.findAllByText(/지갑을 준비하고 있어요/)
  expect(screen.getAllByRole('button', { name: '우리 팀 동의하기' })[0]).toBeDisabled()
  fireEvent.click(screen.getAllByRole('button', { name: '우리 팀 동의하기' })[0])
  expect(rule.prepare).not.toHaveBeenCalled()

  // 준비가 끝나면 버튼이 열리고 그 클릭은 바로 서명까지 간다
  await clickAgree()
  await waitFor(() => expect(adapter.signTransaction).toHaveBeenCalledTimes(1))
})

/**
 * D-77 원인 C — 실패는 **언제나 한 줄을 남긴다.**
 *
 * `COMMON_CONFLICT`(이미 진행 중)는 서명 거부와 함께 "문구 없이 초기 상태로" 처리됐다.
 * 사용자에게는 안 눌린 것으로 보여 다시 누르게 됐고, 그 클릭이 또 CONFLICT를 만들었다.
 */
it('이미 진행 중(COMMON_CONFLICT)이면 문구를 남긴다 — 조용히 되돌리지 않는다', async () => {
  rule.prepare.mockRejectedValue(
    new ApiError({ code: 'COMMON_CONFLICT', status: 409, msg: '이미 동의 처리 중입니다.' }),
  )

  renderPage()
  await clickAgree()

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('이미 처리 중입니다. 잠시 뒤 현황이 갱신됩니다.')
  // 취소 안내(§5.14 ④')와 섞지 않는다 — 사용자가 한 일이 아니다
  expect(screen.queryByText(/동의를 취소했어요/)).toBeNull()
  expect(adapter.signTransaction).not.toHaveBeenCalled()
})

it('signRequests 가 빈 배열이면 오류가 아니라 서명 없이 완료다', async () => {
  rule.prepare.mockResolvedValue({
    performanceId: 12,
    teamId: 11,
    rulesHash: RULES_HASH,
    prerequisiteJobId: null,
    // 이미 온체인 동의가 있어 서버가 DB만 AGREED 로 맞춘 경우(rule_03)
    signRequests: [],
    expiresAt: '2026-09-03T10:30:00+09:00',
  })

  renderPage()
  await clickAgree()

  await waitFor(() => expect(rule.prepare).toHaveBeenCalledTimes(1))
  // 지갑 팝업 대기가 풀리고 초기 상태로 돌아온다 — 오류도 "취소함" 안내도 아니다
  await waitFor(() => expect(progressShows('지갑에서 확인해 주세요')).toBe(false))
  expect(adapter.signTransaction).not.toHaveBeenCalled()
  expect(rule.report).not.toHaveBeenCalled()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByText(/동의를 취소했어요/)).toBeNull()
})

it('서명을 거부하면 에러가 아니라 안내 한 줄로 돌아간다 (§5.14 ④)', async () => {
  rule.prepare.mockResolvedValue({
    performanceId: 12,
    teamId: 11,
    rulesHash: RULES_HASH,
    prerequisiteJobId: null,
    signRequests: [agreeSignRequest()],
    expiresAt: '2026-09-03T10:30:00+09:00',
  })
  adapter.signTransaction.mockRejectedValue(
    new WalletError('USER_REJECTED', '사용자가 취소했습니다'),
  )

  renderPage()
  await clickAgree()

  await screen.findByText(/동의를 취소했어요/)
  expect(rule.report).not.toHaveBeenCalled()
  expect(screen.queryByRole('alert')).toBeNull()
})

it('판매 시작이 선행 job 만 받으면 그 job 확정 후 다시 호출한다', async () => {
  rule.data = ruleStatus({
    agreements: [
      {
        teamId: 7,
        teamName: '블루노트',
        walletAddress: '0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b',
        status: 'AGREED',
        agreedAt: '2026-09-03T10:02:00+09:00',
      },
      {
        teamId: 11,
        teamName: '노이즈캔슬',
        walletAddress: '0x9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6f7081920',
        status: 'AGREED',
        agreedAt: '2026-09-03T10:20:00+09:00',
      },
    ],
    myAgreement: { teamId: 11, status: 'AGREED', nextAction: 'NONE' },
    startSaleAvailable: true,
    startSaleBlockedReason: null,
  })
  // ① createShow 미확정 — START_SALE job 이 없다 ② 재호출에서야 생긴다
  rule.startSale
    .mockResolvedValueOnce({
      prerequisiteJobId: 'job-create-show',
      status: 'PENDING',
      pollAfterMs: 2000,
      performanceId: 12,
    })
    .mockResolvedValueOnce({
      jobId: 'job-start-sale',
      prerequisiteJobId: null,
      status: 'PENDING',
      pollAfterMs: 2000,
      performanceId: 12,
      nextStatus: 'ON_SALE',
    })

  renderPage()
  fireEvent.click(screen.getAllByRole('button', { name: '판매 시작' })[0])
  // 되돌릴 수 없는 액션이라 확인 모달을 거친다(§5.6)
  const confirm = await screen.findAllByRole('button', { name: '판매 시작' })
  fireEvent.click(confirm[confirm.length - 1])

  await waitFor(() => expect(rule.startSale).toHaveBeenCalledTimes(1))
  // 선행 job 을 지켜보는 것만으로는 판매가 시작되지 않는다
  await waitFor(() => expect(chain.jobIds).toContain('job-create-show'))
  expect(rule.startSale).toHaveBeenCalledTimes(1)

  confirmJob()
  await waitFor(() => expect(rule.startSale).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(chain.jobIds).toContain('job-start-sale'))

  // 확정 전에는 아직 판매 중이 아니다 — 상태 배지는 재조회가 옮긴다(낙관적 UI 아님)
  expect(screen.queryByRole('alert')).toBeNull()
  confirmJob()
  await waitFor(() => expect(screen.queryByText('판매를 여는 중…')).toBeNull())
})

it('판매 시작 202 에 job 이 하나도 없으면 완료로 알리지 않는다', async () => {
  rule.data = ruleStatus({
    myAgreement: { teamId: 11, status: 'AGREED', nextAction: 'NONE' },
    startSaleAvailable: true,
    startSaleBlockedReason: null,
  })
  rule.startSale.mockResolvedValue({ status: 'PENDING', pollAfterMs: 2000, performanceId: 12 })

  renderPage()
  fireEvent.click(screen.getAllByRole('button', { name: '판매 시작' })[0])
  const confirm = await screen.findAllByRole('button', { name: '판매 시작' })
  fireEvent.click(confirm[confirm.length - 1])

  await screen.findByRole('alert')
  expect(chain.jobIds.filter(Boolean)).toHaveLength(0)
})

/**
 * 창 복귀·주기 갱신(fix/fe/live-refresh)으로 rule_02 가 **서명 도중에** 새 값으로 바뀌어도
 * 진행 단계는 로컬 state 라 되감기지 않는다. 되감기면 지갑 팝업이 떠 있는데 버튼이 다시
 * "동의하기"가 되고, 사용자가 한 번 더 눌러 CONFLICT 를 만든다.
 */
it('서명 대기 중 동의 현황이 새로 도착해도 진행 단계가 유지된다', async () => {
  rule.prepare.mockResolvedValue({
    performanceId: 12,
    teamId: 11,
    rulesHash: RULES_HASH,
    prerequisiteJobId: null,
    signRequests: [agreeSignRequest()],
    expiresAt: '2026-09-03T10:30:00+09:00',
  })
  rule.report.mockResolvedValue({ jobId: 'job-agree', status: 'SUBMITTED', pollAfterMs: 1500 })
  let resolveSign: ((rlp: string) => void) | undefined
  adapter.signTransaction.mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        resolveSign = resolve
      }),
  )

  const view = renderPage()
  await clickAgree()
  await waitFor(() => expect(adapter.signTransaction).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(progressShows('지갑에서 확인해 주세요')).toBe(true))

  // 폴링 결과 도착 — 새 객체이고 다른 팀(7)의 동의 시각이 바뀌었다
  const polled = ruleStatus()
  polled.agreements[0] = { ...polled.agreements[0], agreedAt: '2026-09-03T10:05:00+09:00' }
  rule.data = polled
  view.rerender(
    <MemoryRouter initialEntries={['/studio/performances/12/agreements']}>
      <Routes>
        <Route path="/studio/performances/:id/agreements" element={<AgreementsPage />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(progressShows('지갑에서 확인해 주세요')).toBe(true)
  expect(rule.prepare).toHaveBeenCalledTimes(1)

  await act(async () => resolveSign?.('0xsignedrlp'))
  await waitFor(() =>
    expect(rule.report).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'AGREE', senderSignedRlp: '0xsignedrlp' }),
    ),
  )
  await waitFor(() => expect(progressShows('확인 중')).toBe(true))
})

/* ───────────── [2026-09-24] 패스키 본인 확인(API v7 §7.W) ───────────── */

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

function armStepUp(token: string) {
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
  stepUpMocks.authenticate.mockResolvedValue({ stepUpToken: token, expiresAt: '2030-01-01T00:00:00Z' })
}

async function verifyInDialog() {
  const dialog = await screen.findByRole('dialog', { name: '본인 확인' })
  fireEvent.click(await within(dialog).findByRole('button', { name: '본인 확인' }))
  // 클릭 핸들러 안에서 곧바로 기기 인증 창을 연다(D-82)
  expect(stepUpMocks.get).toHaveBeenCalled()
}

it('stepUpRequired 가 없으면 본인 확인 없이 서명한다(스위치 off 무변경)', async () => {
  rule.prepare.mockResolvedValue({
    performanceId: 12,
    teamId: 11,
    rulesHash: RULES_HASH,
    prerequisiteJobId: null,
    signRequests: [agreeSignRequest()],
    expiresAt: '2026-09-03T10:30:00+09:00',
  })
  rule.report.mockResolvedValue({ jobId: 'job-agree', status: 'SUBMITTED', pollAfterMs: 1500 })

  renderPage()
  await clickAgree()

  await waitFor(() => expect(adapter.signTransaction).toHaveBeenCalledTimes(1))
  expect(stepUpMocks.authenticationOptions).not.toHaveBeenCalled()
  expect(rule.report.mock.calls[0][0]).not.toHaveProperty('stepUpToken')
})

it('stepUpRequired 면 본인 확인 → 서명하기(새 클릭) → 토큰을 실어 동의를 보고한다', async () => {
  armStepUp('tok-agree')
  rule.prepare.mockResolvedValue({
    performanceId: 12,
    teamId: 11,
    rulesHash: RULES_HASH,
    prerequisiteJobId: null,
    signRequests: [agreeSignRequest()],
    expiresAt: '2026-09-03T10:30:00+09:00',
    stepUpRequired: true,
  })
  rule.report.mockResolvedValue({ jobId: 'job-agree', status: 'SUBMITTED', pollAfterMs: 1500 })

  renderPage()
  await clickAgree()
  await verifyInDialog()
  expect(stepUpMocks.authenticationOptions).toHaveBeenCalledWith({ action: 'RULE_AGREE', targetId: 12 })

  // 생체 인증 창이 이 클릭의 활성화를 썼다 — 서명은 다음 클릭에서(D-77)
  expect(adapter.signTransaction).not.toHaveBeenCalled()
  await clickAgree('서명하기')

  await waitFor(() => expect(rule.report).toHaveBeenCalledTimes(1))
  expect(rule.report.mock.calls[0][0]).toMatchObject({ teamId: 11, stepUpToken: 'tok-agree' })
  expect(stepUpMocks.get).toHaveBeenCalledTimes(1)
})

it('본인 확인 창을 닫으면(NotAllowedError) 에러 없이 원래 상태로 돌아간다', async () => {
  armStepUp('tok-agree')
  stepUpMocks.get.mockRejectedValue(new DOMException('cancelled', 'NotAllowedError'))
  rule.prepare.mockResolvedValue({
    performanceId: 12,
    teamId: 11,
    rulesHash: RULES_HASH,
    prerequisiteJobId: null,
    signRequests: [agreeSignRequest()],
    expiresAt: '2026-09-03T10:30:00+09:00',
    stepUpRequired: true,
  })

  renderPage()
  await clickAgree()
  await verifyInDialog()

  await waitFor(() => expect(screen.queryByRole('dialog', { name: '본인 확인' })).toBeNull())
  await clickAgree('우리 팀 동의하기')
  expect(adapter.signTransaction).not.toHaveBeenCalled()
  expect(rule.report).not.toHaveBeenCalled()
  expect(screen.queryByRole('alert')).toBeNull()
})
