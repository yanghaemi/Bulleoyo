/**
 * M-03 코인 지급 — 돈을 만드는 화면이라 두 가지를 못 박는다.
 *
 *   ① **202는 성공이 아니다.** `coin_07`은 접수만 돌려준다. 확정 전에 "지급이 확정되었습니다"를
 *      찍으면 실패한 mint 도 완료로 보이고, 관리자는 같은 사람에게 또 지급한다.
 *   ② **재시도는 같은 멱등키로 나가야 한다.** 새 키로 재시도하면 앞선 요청이 사실 성공했을 때
 *      **같은 회원에게 두 번 발행된다.** 키는 요청 내용이 바뀔 때만 새로 만든다(§0.8).
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'

import { ApiError } from '@/shared/api/client'
import type { ChainJobView } from '@/shared/api/domains/chain'
import i18n from '@/shared/i18n'

import { AdminCoinPage } from './AdminCoinPage'

const q = vi.hoisted(() => ({
  grant: vi.fn(),
  chainConfigured: true,
  /** `useChainJob`이 돌려줄 값. 테스트가 바꾸고 rerender로 다시 읽힌다 */
  job: null as ChainJobView | null,
}))

vi.mock('@/shared/queries/coin', () => ({
  useCoinSupply: () => ({
    data: {
      totalSupply: 5_290_000,
      escrowTotal: 0,
      walletTotal: 5_290_000,
      grantCount: 3,
      supplyMatched: true,
      currency: 'KRW',
      issuer: { type: 'MOCK', label: 'Platform (demo grant)', replaceable: true },
      mintHalted: false,
      releaseHalted: false,
      network: 'kaia-kairos',
      chainId: 1001,
      tokenAddress: '0x1234567890123456789012345678901234567890',
      tokenSymbol: 'YoYo',
      tokenDecimals: 0,
      explorerUrl: 'https://kairos.kaiascan.io/address/0x1234',
      invariants: [],
      perPerformanceEscrow: [],
      asOf: '2026-09-22T14:00:00+09:00',
      nextRefreshAt: '2026-09-22T14:01:00+09:00',
      stale: false,
      disclosure: '테스트넷 시연',
      grantNotice: '데모 지급',
    },
    error: null,
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useExchangeRates: () => ({
    data: { rates: [], usageNotice: '표시 전용', refreshedAt: '' },
    error: null,
    isPending: false,
    refetch: vi.fn(),
  }),
  useRegisterExchangeRates: () => ({ mutateAsync: vi.fn() }),
  useCoinGrants: () => ({
    data: {
      summary: {
        grantCount: 0,
        grantedTotal: 0,
        signupCount: 0,
        signupTotal: 0,
        adminCount: 0,
        adminTotal: 0,
        currency: 'KRW',
      },
      items: [],
      pageInfo: { page: 0, size: 20, totalElements: 0, hasNext: false },
    },
    error: null,
    isPending: false,
    refetch: vi.fn(),
  }),
  useGrantCoin: () => ({ mutateAsync: q.grant }),
}))

vi.mock('@/shared/queries/chain', () => ({
  useChainJob: () => ({ job: q.job, timedOut: false }),
}))

// 컨트랙트 주소는 `.env`(gitignore)에서 오므로 CI에서는 비어 있다. 지급 가능 여부만 고정한다
vi.mock('@/shared/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/config')>()),
  get isChainConfigured() {
    return q.chainConfigured
  },
}))

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

const ADDRESS = '0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a'

beforeEach(async () => {
  await i18n.changeLanguage('ko')
  q.grant.mockReset()
  q.job = null
  q.chainConfigured = true
})

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminCoinPage />
    </MemoryRouter>,
  )
}

function fillForm() {
  fireEvent.change(screen.getByLabelText(/대상 지갑 주소/), { target: { value: ADDRESS } })
  fireEvent.change(screen.getByLabelText(/금액/), { target: { value: '200000' } })
  fireEvent.change(screen.getByLabelText(/메모/), { target: { value: '리허설 시연용 보충' } })
}

async function submit() {
  fireEvent.click(screen.getByRole('button', { name: /지급하기|같은 내용으로 재시도/ }))
  fireEvent.click(await screen.findByRole('button', { name: '지급' }))
}

it('미설정 상태는 운영 안내로 알리고 내부 파일명과 미구현 작업 버튼을 노출하지 않는다', () => {
  q.chainConfigured = false
  renderPage()

  expect(screen.getByText('체인 설정 대기')).toBeVisible()
  expect(screen.getByRole('button', { name: '지급하기' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: /온체인 작업 목록/ })).not.toBeInTheDocument()
  expect(document.body.textContent).not.toMatch(/MVP|\bP1\b|kairos\.json/)
  expect(q.grant).not.toHaveBeenCalled()
})

it('202를 받아도 확정이라고 쓰지 않는다 — CONFIRMED 뒤에야 확정 문구가 나온다', async () => {
  q.grant.mockResolvedValue({ jobId: 'job-1', status: 'PENDING', pollAfterMs: 800 })
  const { rerender } = renderPage()
  fillForm()
  await submit()

  expect(await screen.findByText(/온체인 확정을 기다리는 중/)).toBeInTheDocument()
  expect(screen.queryByText(/지급이 확정되었습니다/)).not.toBeInTheDocument()

  // 폴링이 CONFIRMED를 물어 왔다
  q.job = { jobId: 'job-1', status: 'CONFIRMED', txHash: '0xabc' } as ChainJobView
  rerender(
    <MemoryRouter>
      <AdminCoinPage />
    </MemoryRouter>,
  )
  expect(screen.getByText(/지급이 확정되었습니다/)).toBeInTheDocument()
})

it('같은 내용의 재시도는 같은 멱등키로 나간다', async () => {
  q.grant.mockRejectedValue(new ApiError({ code: 'COIN_MINT_FAILED', status: 500, msg: '' }))
  renderPage()
  fillForm()
  await submit()
  expect(await screen.findByText(/mint 트랜잭션이 최종 실패했습니다/)).toBeInTheDocument()

  q.grant.mockResolvedValue({ jobId: 'job-2', status: 'PENDING', pollAfterMs: 800 })
  await submit()
  expect(await screen.findByText(/온체인 확정을 기다리는 중/)).toBeInTheDocument()

  expect(q.grant).toHaveBeenCalledTimes(2)
  const [first, second] = q.grant.mock.calls.map((call) => call[0] as { idempotencyKey: string })
  expect(second.idempotencyKey).toBe(first.idempotencyKey)
  expect(first.idempotencyKey).toBeTruthy()
})
