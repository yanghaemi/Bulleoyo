/**
 * P-03 보증금 납부 — prepare → (선행 job) → 서명·보고 → 확정 순서를 못 박는다.
 *
 * 순서가 이 화면의 전부다. `createShow` 선행 job이 확정되기 전에 `deposit(showId)`를 보내면
 * revert되고, APPROVE가 확정되기 전에 DEPOSIT을 서명하면 allowance가 없어 실패한다.
 * 화면만 보고는 그 어긋남이 드러나지 않아(둘 다 "확인 중…"이다) 테스트로 잡는다.
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import i18n from '@/shared/i18n'

import { WalletError } from '@/shared/blockchain/WalletAdapter'

import { SETUP_STEP_DEPOSIT } from '@/features/studio/setupSteps'

import { PerformanceEditPage } from './PerformanceEditPage'

/**
 * 지갑 어댑터 더블. `warmUp`·`getAddress`를 갖는 것이 중요하다 — 화면이 마운트에서 그 둘로
 * 준비를 확인하고 그동안 납부 버튼을 잠근다(D-77). 둘이 없는 더블은 "즉시 준비됨"이 되어
 * 게이트를 통째로 건너뛴다.
 */
const adapter = vi.hoisted(() => ({
  signTransaction: vi.fn(),
  warmUp: vi.fn(),
  getAddress: vi.fn(),
}))
const WALLET_ADDRESS = '0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b'
const performance = vi.hoisted(() => ({
  prepare: vi.fn(),
  report: vi.fn(),
  update: vi.fn(),
  setTicketTypes: vi.fn(),
}))
const chain = vi.hoisted(() => ({
  jobIds: [] as (string | null)[],
  options: undefined as { onConfirmed?: () => void; onFailed?: (job: unknown) => void } | undefined,
}))

vi.mock('@/shared/blockchain/useWeb3Auth', () => ({ useWeb3Auth: () => ({ adapter }) }))
vi.mock('@/shared/queries/chain', () => ({
  // 페이지는 `useChainJob` 을 두 번 부른다(보증금 서명 · P-10 취소). 콜백을 넘기는 쪽이
  // 보증금 흐름이라, 콜백 없는 호출이 `options` 를 덮어쓰지 않게 한다
  useChainJob: (jobId: string | null, options: typeof chain.options) => {
    chain.jobIds.push(jobId)
    if (options) chain.options = options
    return { timedOut: false }
  },
}))
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
  // 보증금은 준비 흐름의 **마지막** 단계다. 전원 동의를 마친 공연이라야 요청한 보증금 단계가
  // 그대로 열린다 — 미동의면 페이지가 규칙 동의 단계로 되돌린다(`initialStep` 게이트)
  useRuleStatus: () => ({
    data: {
      performanceId: 12,
      agreements: [{ teamId: 7, teamName: '블루노트', status: 'AGREED' }],
      startSaleAvailable: false,
      locked: false,
    },
    isPending: false,
    refetch: vi.fn(),
  }),
}))
vi.mock('@/shared/queries/performance', () => ({
  usePerformanceDetail: () => ({
    data: {
      performanceId: 12,
      title: '합정 3밴드 합동공연',
      venueName: '합정 언플러그드',
      venueAddress: '서울 마포구 양화로 000',
      startAt: '2030-09-19T19:00:00+09:00',
      endAt: '2030-09-19T22:00:00+09:00',
      status: 'DRAFT',
      jointPerformance: true,
      // 공동 공연은 수락 참여팀이 둘 이상이어야 보증금 단계로 갈 수 있다(S15P21B204-136).
      // 이 파일의 관심사는 그 뒤의 서명 순서라, 참여팀 단계는 통과한 상태로 둔다
      participants: [
        { teamId: 7, teamName: '블루노트', host: true },
        { teamId: 8, teamName: '한강밴드', host: false },
      ],
    },
    isPending: false,
    refetch: vi.fn(),
  }),
  useTicketTypes: () => ({
    data: {
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
    isPending: false,
    refetch: vi.fn(),
  }),
  useMyPerformanceRows: () => ({
    data: { items: [{ performanceId: 12, host: true, depositStatus: 'UNPAID' }] },
  }),
  useUpdatePerformance: () => ({ mutateAsync: performance.update }),
  useSetTicketTypes: () => ({ mutateAsync: performance.setTicketTypes }),
  usePrepareDeposit: () => ({ mutateAsync: performance.prepare }),
  useReportDepositSignedTx: () => ({ mutateAsync: performance.report }),
  // P-10 취소는 이 파일의 관심사가 아니다(`PerformanceEditPage.cancel.test.tsx`). 훅만 채운다
  useCancelPerformance: () => ({ mutate: vi.fn(), isPending: false }),
}))

function signRequest(kind: 'APPROVE' | 'DEPOSIT', required = true) {
  return {
    kind,
    required,
    txType: 'FEE_DELEGATED_SMART_CONTRACT_EXECUTION' as const,
    to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    data: '0x1234',
    value: '0x0' as const,
    chainId: '0x3e9' as const,
    feePayer: '0x1234567890abcdef1234567890abcdef12345678',
    summary: {},
  }
}

function renderPage(state?: { step: number }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/studio/performances/12/edit', state }]}>
      <Routes>
        <Route path="/studio/performances/:id/edit" element={<PerformanceEditPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

/**
 * 보증금 단계를 연다.
 *
 * 준비 흐름은 `정보·티켓 옵션 → 참여팀(P-04) → 정산 규칙(P-05) → 보증금` 네 단계이고,
 * 가운데 둘이 **다른 화면**이라 이 페이지 안에서 눌러 도달할 수 없다. 규칙을 저장하고
 * 돌아오는 경로가 `state.step = 보증금` 이므로(`SettlementRules`) 테스트도 같은 입구를 쓴다.
 */
async function goToDepositStep() {
  renderPage({ step: SETUP_STEP_DEPOSIT })
  // 지갑 준비 게이트(D-77) 가 풀릴 때까지 기다린다 — 그 전에는 실제 사용자도 누를 수 없다
  await payButton()
}

/** 열려 있는 납부(또는 서명) 버튼. 준비 전에는 잠겨 있으므로 열릴 때까지 기다린다 */
function payButton(name = '보증금 납부하기') {
  return waitFor(() => {
    const [first] = screen.getAllByRole('button', { name })
    expect(first).toBeEnabled()
    return first
  })
}

/** 폴링 중인 job 을 확정시킨다 */
function confirmJob() {
  act(() => chain.options?.onConfirmed?.())
}

beforeEach(async () => {
  await i18n.changeLanguage('ko')
  vi.clearAllMocks()
  chain.jobIds = []
  chain.options = undefined
  performance.update.mockResolvedValue({ performanceId: 12, agreementsReset: false })
  performance.setTicketTypes.mockResolvedValue({ performanceId: 12 })
  adapter.signTransaction.mockResolvedValue('0xsignedrlp')
  adapter.warmUp.mockResolvedValue(undefined)
  adapter.getAddress.mockResolvedValue(WALLET_ADDRESS)
})

/**
 * D-77 원인 B — 선행 job 확정 뒤에는 **같은 클릭으로 서명 팝업을 열지 않는다.**
 *
 * 확정 대기는 수 초라 그 뒤의 `eth_sign`은 브라우저의 사용자 활성화가 만료된 상태에서
 * 팝업을 열게 된다. 새 클릭 = 새 활성화이므로 "서명하기" 로 돌려주고 한 번 더 받는다.
 */
it('선행 createShow job 확정 뒤에는 자동 서명하지 않고 서명하기 단계로 돌아온다', async () => {
  performance.prepare
    .mockResolvedValueOnce({
      depositAmount: 50_000,
      prerequisiteJobId: 'job-create-show',
      signRequests: [signRequest('APPROVE'), signRequest('DEPOSIT')],
      expiresAt: '2030-09-19T18:00:00+09:00',
    })
    // 두 번째 클릭의 prepare — 선행 job 이 확정됐으므로 곧바로 서명으로 간다
    .mockResolvedValue({
      depositAmount: 50_000,
      prerequisiteJobId: null,
      signRequests: [signRequest('APPROVE'), signRequest('DEPOSIT')],
      expiresAt: '2030-09-19T18:00:00+09:00',
    })
  performance.report.mockResolvedValue({
    jobId: 'job-approve',
    status: 'PENDING',
    pollAfterMs: 1500,
  })

  await goToDepositStep()
  fireEvent.click(await payButton())

  // 선행 job 을 기다리는 동안은 지갑 팝업을 띄우지 않는다
  await screen.findAllByText(/확인 중/)
  expect(chain.jobIds).toContain('job-create-show')
  expect(adapter.signTransaction).not.toHaveBeenCalled()

  confirmJob()

  // 확정만으로는 서명하지 않는다 — 버튼이 "서명하기" 로 바뀌어 클릭을 기다린다
  await screen.findAllByText(/공연 등록이 확정됐어요/)
  expect(adapter.signTransaction).not.toHaveBeenCalled()
  expect(screen.queryByRole('alert')).toBeNull()

  fireEvent.click(await payButton('서명하기'))
  await waitFor(() => expect(adapter.signTransaction).toHaveBeenCalledTimes(1))
  expect(adapter.signTransaction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'APPROVE' }))
  expect(performance.prepare).toHaveBeenCalledTimes(2)
})

/**
 * D-77 원인 A — 화면 진입 직후의 클릭이 계정 없는 지갑으로 나가지 않는다.
 *
 * 9/21 dev 에서 첫 클릭들은 `eth_accounts` 가 빈 배열이어서 `NOT_CONNECTED` 로 떨어졌고
 * (짧게 실패 문구 → 버튼 재활성), 사용자에게는 "3~4번 눌러야 팝업이 뜬다" 로 보였다.
 */
it('지갑이 준비될 때까지 납부 버튼을 잠그고 준비 중임을 알린다', async () => {
  // wallet-services 가 아직 계정을 못 주는 창: 한 번 빈 계정, 다음에 주소
  adapter.getAddress.mockResolvedValueOnce(null).mockResolvedValue(WALLET_ADDRESS)
  performance.prepare.mockResolvedValue({
    depositAmount: 50_000,
    prerequisiteJobId: null,
    signRequests: [signRequest('DEPOSIT')],
    expiresAt: '2030-09-19T18:00:00+09:00',
  })
  performance.report.mockResolvedValue({
    jobId: 'job-deposit',
    status: 'PENDING',
    pollAfterMs: 1500,
  })

  renderPage({ step: SETUP_STEP_DEPOSIT })

  // 준비 전: 버튼은 잠기고 이유가 한 줄로 떠 있다
  await screen.findAllByText(/지갑을 준비하고 있어요/)
  expect(screen.getAllByRole('button', { name: '보증금 납부하기' })[0]).toBeDisabled()
  // 잠긴 버튼을 눌러도 요청이 나가지 않는다 — 여기서 나간 클릭이 D-77 의 첫 실패였다
  fireEvent.click(screen.getAllByRole('button', { name: '보증금 납부하기' })[0])
  expect(performance.prepare).not.toHaveBeenCalled()

  // 준비가 끝나면 버튼이 열리고 그 클릭은 바로 서명까지 간다
  fireEvent.click(await payButton())
  await waitFor(() => expect(adapter.signTransaction).toHaveBeenCalledTimes(1))
})

/**
 * D-77 원인 C — 지갑이 끝까지 계정을 못 주면 **원인을 말한다.**
 *
 * 예전에는 어댑터의 `NOT_CONNECTED` 가 `COMMON_INTERNAL_ERROR` + 영어 SDK 문장으로 떠서
 * ("잠시 후 다시 시도해 주세요 Web3Auth wallet did not provide an account.") 사용자가 할 수
 * 있는 일이 문구에 없었다.
 */
it('지갑이 계정을 주지 않으면 지갑 준비 문구로 알린다', async () => {
  performance.prepare.mockResolvedValue({
    depositAmount: 50_000,
    prerequisiteJobId: null,
    signRequests: [signRequest('DEPOSIT')],
    expiresAt: '2030-09-19T18:00:00+09:00',
  })
  adapter.signTransaction.mockRejectedValue(
    new WalletError('NOT_CONNECTED', 'Web3Auth wallet did not provide an account.'),
  )

  await goToDepositStep()
  fireEvent.click(await payButton())

  await screen.findByText(/지갑이 아직 준비되지 않았습니다/)
  // SDK 의 영어 문장을 사용자에게 옮기지 않는다
  expect(screen.queryByText(/did not provide an account/)).toBeNull()
  expect(performance.report).not.toHaveBeenCalled()
})

it('APPROVE 가 확정된 뒤에야 DEPOSIT 을 서명한다 — 배지는 서버 상태를 기다린다', async () => {
  performance.prepare.mockResolvedValue({
    depositAmount: 50_000,
    prerequisiteJobId: null,
    signRequests: [signRequest('APPROVE'), signRequest('DEPOSIT')],
    expiresAt: '2030-09-19T18:00:00+09:00',
  })
  performance.report
    .mockResolvedValueOnce({ jobId: 'job-approve', status: 'PENDING', pollAfterMs: 1500 })
    .mockResolvedValueOnce({ jobId: 'job-deposit', status: 'PENDING', pollAfterMs: 1500 })

  await goToDepositStep()
  fireEvent.click(await payButton())

  // APPROVE 한 건만 서명·보고하고 그 job 이 확정될 때까지 멈춘다
  await waitFor(() => expect(chain.jobIds).toContain('job-approve'))
  expect(adapter.signTransaction).toHaveBeenCalledTimes(1)
  // 보고한 RLP 는 지갑이 만든 값 그대로다 — 화면이 만들어 내지 않는다
  expect(performance.report).toHaveBeenCalledWith({
    performanceId: 12,
    kind: 'APPROVE',
    senderSignedRlp: '0xsignedrlp',
  })

  confirmJob()
  await waitFor(() => expect(adapter.signTransaction).toHaveBeenCalledTimes(2))
  expect(adapter.signTransaction).toHaveBeenLastCalledWith(
    expect.objectContaining({ kind: 'DEPOSIT' }),
  )
  expect(performance.report).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'DEPOSIT' }))

  // 확정되면 진행 표시가 끝난다. **배지를 낙관적으로 PAID 로 옮기지 않는다** —
  // `deposit_status` 는 performance_06 을 다시 읽어 바뀐다(무효화는 훅이 한다)
  confirmJob()
  await waitFor(() => expect(screen.queryAllByText(/확인 중/)).toHaveLength(0))
  expect(screen.queryByText('요청을 처리하지 못했습니다')).toBeNull()
})

it('서명을 거부하면 에러가 아니라 초기 상태로 돌아간다 (§5.14 ④)', async () => {
  performance.prepare.mockResolvedValue({
    depositAmount: 50_000,
    prerequisiteJobId: null,
    signRequests: [signRequest('APPROVE'), signRequest('DEPOSIT')],
    expiresAt: '2030-09-19T18:00:00+09:00',
  })
  adapter.signTransaction.mockRejectedValue(
    new WalletError('USER_REJECTED', '사용자가 취소했습니다'),
  )

  await goToDepositStep()
  fireEvent.click(await payButton())

  await screen.findByText(/서명을 취소했어요/)
  expect(performance.report).not.toHaveBeenCalled()
  expect(screen.queryByText('요청을 처리하지 못했습니다')).toBeNull()
})

it('required=false 인 서명 요청은 건너뛴다', async () => {
  performance.prepare.mockResolvedValue({
    depositAmount: 50_000,
    prerequisiteJobId: null,
    signRequests: [signRequest('APPROVE', false), signRequest('DEPOSIT')],
    expiresAt: '2030-09-19T18:00:00+09:00',
  })
  performance.report.mockResolvedValue({
    jobId: 'job-deposit',
    status: 'PENDING',
    pollAfterMs: 1500,
  })

  await goToDepositStep()
  fireEvent.click(await payButton())

  await waitFor(() => expect(adapter.signTransaction).toHaveBeenCalledTimes(1))
  expect(adapter.signTransaction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'DEPOSIT' }))
  expect(performance.report).toHaveBeenCalledTimes(1)
})

/**
 * 진행 표시 — 누른 순간부터 확정까지 액션 자리가 비지 않는다.
 *
 * prepare 왕복과 확정 직후가 각각 공백이었다. 둘 다 버튼이 "보증금 납부하기" 로 남아
 * 눌렸는지·진행 중인지 알 수 없었고, 확정 직후는 이미 낸 돈을 또 내려고 누르게 된다.
 */
it('클릭 직후부터 확정까지 액션 자리가 진행 상태를 말한다', async () => {
  let resolvePrepare: ((value: unknown) => void) | undefined
  performance.prepare.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolvePrepare = resolve
      }),
  )
  performance.report.mockResolvedValue({
    jobId: 'job-deposit',
    status: 'PENDING',
    pollAfterMs: 1500,
  })

  await goToDepositStep()
  fireEvent.click(await payButton())

  // ① prepare 응답을 기다리는 동안 — 버튼이 아니라 진행 표시다
  await screen.findAllByText(/준비 중/)
  expect(screen.queryAllByRole('button', { name: '보증금 납부하기' })).toHaveLength(0)

  await act(async () => {
    resolvePrepare?.({
      depositAmount: 50_000,
      prerequisiteJobId: null,
      signRequests: [signRequest('DEPOSIT')],
      expiresAt: '2030-09-19T18:00:00+09:00',
    })
  })

  // ② 서명 → ③ 체인 기록 확인
  await waitFor(() => expect(chain.jobIds).toContain('job-deposit'))
  await screen.findAllByText(/블록체인 기록을 확인 중/)

  // ④ 확정. 서버 `depositStatus` 는 아직 UNPAID 지만 버튼이 되살아나지 않는다
  confirmJob()
  await screen.findAllByText('납부 완료')
  expect(screen.queryAllByRole('button', { name: '보증금 납부하기' })).toHaveLength(0)
})

/**
 * 창 복귀 갱신(fix/fe/live-refresh)으로 상세·티켓·규칙 조회가 **서명 도중에** 새 객체로
 * 다시 도착해도 보증금 진행 단계는 되감기지 않는다. 이 파일의 목 훅은 렌더마다 새 객체를
 * 돌려주므로, 다시 그리는 것만으로 "재조회 결과 도착"과 같다.
 */
it('서명 대기 중 조회가 새로 도착해도 보증금 진행 단계가 유지된다', async () => {
  performance.prepare.mockResolvedValue({
    depositAmount: 50_000,
    prerequisiteJobId: null,
    signRequests: [signRequest('DEPOSIT')],
    expiresAt: '2030-09-19T18:00:00+09:00',
  })
  performance.report.mockResolvedValue({
    jobId: 'job-deposit',
    status: 'PENDING',
    pollAfterMs: 1500,
  })
  let resolveSign: ((rlp: string) => void) | undefined
  adapter.signTransaction.mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        resolveSign = resolve
      }),
  )

  const view = renderPage({ step: SETUP_STEP_DEPOSIT })
  fireEvent.click(await payButton())
  await waitFor(() => expect(adapter.signTransaction).toHaveBeenCalledTimes(1))

  view.rerender(
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

  // 버튼이 "보증금 납부하기"로 되살아나지 않고 prepare 도 다시 부르지 않는다
  expect(screen.queryAllByRole('button', { name: '보증금 납부하기' })).toHaveLength(0)
  expect(performance.prepare).toHaveBeenCalledTimes(1)

  await act(async () => resolveSign?.('0xsignedrlp'))
  await waitFor(() => expect(performance.report).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(chain.jobIds).toContain('job-deposit'))
  await screen.findAllByText(/블록체인 기록을 확인 중/)
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

it('stepUpRequired 면 본인 확인 → 서명하기(새 클릭) → APPROVE·DEPOSIT 두 보고에 같은 토큰', async () => {
  armStepUp('tok-dep')
  performance.prepare.mockResolvedValue({
    depositAmount: 50_000,
    prerequisiteJobId: null,
    signRequests: [signRequest('APPROVE'), signRequest('DEPOSIT')],
    expiresAt: '2030-09-19T18:00:00+09:00',
    stepUpRequired: true,
  })
  performance.report
    .mockResolvedValueOnce({ jobId: 'job-approve', status: 'PENDING', pollAfterMs: 1500 })
    .mockResolvedValueOnce({ jobId: 'job-deposit', status: 'PENDING', pollAfterMs: 1500 })

  await goToDepositStep()
  fireEvent.click(await payButton())
  await verifyInDialog()
  expect(stepUpMocks.authenticationOptions).toHaveBeenCalledWith({ action: 'DEPOSIT', targetId: 12 })

  // 생체 인증 창이 이 클릭의 활성화를 썼다 — 지갑 서명은 다음 클릭에서(D-77)
  expect(adapter.signTransaction).not.toHaveBeenCalled()
  fireEvent.click(await payButton('서명하기'))

  await waitFor(() => expect(performance.report).toHaveBeenCalledTimes(1))
  confirmJob()
  await waitFor(() => expect(performance.report).toHaveBeenCalledTimes(2))
  expect(performance.report.mock.calls[0][0]).toMatchObject({ kind: 'APPROVE', stepUpToken: 'tok-dep' })
  expect(performance.report.mock.calls[1][0]).toMatchObject({ kind: 'DEPOSIT', stepUpToken: 'tok-dep' })
  // 한 번의 본인 확인으로 두 보고가 통과한다
  expect(stepUpMocks.get).toHaveBeenCalledTimes(1)
})

it('stepUpRequired 가 없으면 본인 확인 없이 납부 서명으로 간다(스위치 off 무변경)', async () => {
  stepUpMocks.authenticationOptions.mockClear()
  performance.prepare.mockResolvedValue({
    depositAmount: 50_000,
    prerequisiteJobId: null,
    signRequests: [signRequest('DEPOSIT')],
    expiresAt: '2030-09-19T18:00:00+09:00',
  })
  performance.report.mockResolvedValue({ jobId: 'job-deposit', status: 'PENDING', pollAfterMs: 1500 })

  await goToDepositStep()
  fireEvent.click(await payButton())

  await waitFor(() => expect(performance.report).toHaveBeenCalledTimes(1))
  expect(stepUpMocks.authenticationOptions).not.toHaveBeenCalled()
  expect(performance.report.mock.calls[0][0]).not.toHaveProperty('stepUpToken')
})

it('이 기기가 본인 확인을 지원하지 않으면 안내하고 서명하지 않는다', async () => {
  stepUpMocks.supported.mockResolvedValue(false)
  performance.prepare.mockResolvedValue({
    depositAmount: 50_000,
    prerequisiteJobId: null,
    signRequests: [signRequest('DEPOSIT')],
    expiresAt: '2030-09-19T18:00:00+09:00',
    stepUpRequired: true,
  })

  await goToDepositStep()
  fireEvent.click(await payButton())

  const dialog = await screen.findByRole('dialog', { name: '본인 확인' })
  expect(within(dialog).getAllByText('이 기기는 본인 확인을 지원하지 않습니다.').length).toBeGreaterThan(0)
  fireEvent.click(within(dialog).getByRole('button', { name: '확인' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '본인 확인' })).toBeNull())
  expect(adapter.signTransaction).not.toHaveBeenCalled()
})
