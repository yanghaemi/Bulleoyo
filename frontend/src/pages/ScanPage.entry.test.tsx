/**
 * S-02 검표 — 화면만 보고는 드러나지 않는 세 가지를 못 박는다.
 *
 *   ① **`ENTRY_QR_EXPIRED`는 401이지만 세션 만료가 아니다.** 401을 status로 뭉뚱그리면
 *      스캔 도중 로그인 화면으로 튕기거나 "링크 무효"로 화면을 덮는다 — 입장 줄이 그대로 멈춘다.
 *      만료는 **판정**이고, 스캔은 계속 가능해야 한다.
 *   ② **같은 QR 두 번은 중복으로 보여야 한다.** 재입장 차단이 이 화면의 핵심인데
 *      409를 성공처럼 그리면 같은 티켓으로 두 명이 들어간다.
 *   ③ 검표 링크 토큰은 **`X-Entry-Token` 경로**로 나가야 한다. 회원 세션 경로로 새면
 *      비로그인 스태프의 검표가 401로 죽는다.
 *
 * 카메라는 jsdom에서 돌지 않는다(`navigator.mediaDevices`가 없다 → `unsupported`).
 * 그래서 스캔은 **수동 입력 경로**로 일으킨다 — 디코딩 경로와 같은 `handleScan`으로 들어간다.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'

import { ApiError } from '@/shared/api/client'
import { isPassthroughUnauthorized } from '@/shared/api/errorCodes'
import i18n from '@/shared/i18n'

import { ScanPage } from './ScanPage'

const entry = vi.hoisted(() => ({
  verify: vi.fn(),
  /** `useEntries`가 받은 (params, auth) — 인증 경로를 여기서 확인한다 */
  entriesArgs: [] as { params: unknown; auth: unknown }[],
  /** `useVerifyEntry`가 받은 auth */
  verifyAuth: undefined as unknown,
}))

vi.mock('@/shared/queries/entry', () => ({
  useEntries: (params: unknown, auth: unknown) => {
    entry.entriesArgs.push({ params, auth })
    return {
      data: { performanceId: 12, summary: { enteredCount: 41, totalIssuedCount: 64 } },
      isPending: false,
      error: null,
      refetch: vi.fn(),
    }
  },
  useVerifyEntry: (auth: unknown) => {
    entry.verifyAuth = auth
    return { mutateAsync: entry.verify }
  },
}))
vi.mock('@/shared/queries/performance', () => ({
  usePerformanceDetail: () => ({
    data: {
      performanceId: 12,
      title: '합정 3밴드 합동공연',
      startAt: '2026-09-19T10:00:00Z',
      venueName: '합정 롤링홀',
    },
    isPending: false,
    error: null,
  }),
}))

/** 스캔 사이의 디바운스(1200ms)를 넘기려고 시계를 앞으로 민다 */
let now = 1_700_000_000_000

beforeEach(async () => {
  await i18n.changeLanguage('ko')
  entry.verify.mockReset()
  entry.entriesArgs = []
  entry.verifyAuth = undefined
  now = 1_700_000_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function Probe() {
  const location = useLocation()
  return <div data-testid="probe">{location.pathname}</div>
}

function renderScan(path = '/entry/12?token=LINK-TOKEN') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/entry/:performanceId" element={<ScanPage />} />
        <Route path="/scan/:token" element={<ScanPage />} />
        <Route path="/login" element={<p>로그인 화면</p>} />
      </Routes>
      <Probe />
    </MemoryRouter>,
  )
}

/** 수동 입력으로 한 번 스캔한다. 카메라 디코딩과 같은 진입점이다 */
async function scan(qrToken: string) {
  fireEvent.change(screen.getByLabelText('QR 토큰 직접 입력'), { target: { value: qrToken } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '확인' }))
  })
}

it('만료 QR(401)은 로그인으로 보내지도, 링크 무효로 화면을 덮지도 않는다', async () => {
  entry.verify.mockRejectedValue(
    new ApiError({ code: 'ENTRY_QR_EXPIRED', status: 401, msg: 'QR 유효시간이 지났습니다.' }),
  )
  renderScan()

  await scan('EXPIRED-QR')

  await waitFor(() => {
    expect(screen.getAllByText(/QR이 만료됐습니다/).length).toBeGreaterThan(0)
  })
  // 라우트가 그대로다 — 401을 세션 만료로 읽었으면 여기서 /login이 된다
  expect(screen.getByTestId('probe')).toHaveTextContent('/entry/12')
  expect(screen.queryByText('로그인 화면')).not.toBeInTheDocument()
  // 링크 무효 패널(카메라를 닫는 전체 안내)로 빠지지 않는다
  expect(screen.queryByText(/검표 링크가 유효하지 않아요/)).not.toBeInTheDocument()
  // 스캔을 계속할 수 있다 — 입력칸이 살아 있고 재스캔 안내가 붙는다
  expect(screen.getByLabelText('QR 토큰 직접 입력')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '다시 스캔' })).toBeInTheDocument()
})

it('같은 QR 재스캔은 중복 입장으로 갈라 보인다', async () => {
  entry.verify
    .mockResolvedValueOnce({
      ticketId: 90211,
      status: 'USED',
      ticketTypeName: '일반',
      enteredAt: '2026-09-19T09:42:03Z',
      enteredCount: 42,
      totalIssuedCount: 64,
    })
    .mockRejectedValueOnce(new ApiError({ code: 'ENTRY_ALREADY_ENTERED', status: 409, msg: '' }))
  renderScan()

  await scan('SAME-QR')
  await waitFor(() => expect(screen.getAllByText('입장 완료').length).toBeGreaterThan(0))

  // 디바운스를 넘긴 뒤 같은 토큰을 다시 넣는다
  now += 5_000
  await scan('SAME-QR')

  await waitFor(() => expect(screen.getAllByText('중복 입장').length).toBeGreaterThan(0))
  // 플래시와 판정 줄 둘 다에 뜬다 — 색만이 아니라 문구로 사유가 분명해야 한다(§1.2)
  expect(screen.getAllByText('이미 입장한 티켓입니다.').length).toBeGreaterThan(0)
  // 두 번째 판정이 성공으로 보이면 같은 티켓으로 두 명이 들어간다
  expect(screen.queryByText('입장 완료')).not.toBeInTheDocument()
  expect(entry.verify).toHaveBeenCalledTimes(2)
})

it('검표 링크 토큰을 두 조회·판정 모두에 넘긴다(회원 세션 경로로 새지 않는다)', async () => {
  entry.verify.mockResolvedValue({ ticketId: 1, status: 'USED', enteredCount: 1 })
  renderScan()

  expect(entry.verifyAuth).toEqual({ entryToken: 'LINK-TOKEN' })
  expect(entry.entriesArgs[0].auth).toEqual({ entryToken: 'LINK-TOKEN' })
  expect(entry.entriesArgs[0].params).toMatchObject({ performanceId: 12 })

  await scan('QR-1')
  expect(entry.verify).toHaveBeenCalledWith(
    expect.objectContaining({ performanceId: 12, qrToken: 'QR-1' }),
  )
})

it('공연을 알 수 없는 옛 링크(/scan/:token)는 카메라를 열지 않고 안내만 남긴다', () => {
  renderScan('/scan/LINK-TOKEN')

  expect(screen.getByText(/검표 정보를 불러오지 못했습니다/)).toBeInTheDocument()
  // 공연 id 없이는 entry-01 본문도 entry-02 경로도 만들 수 없다 — 조회를 켜지 않는다
  expect(entry.entriesArgs[0].params).toEqual({ performanceId: undefined, size: 1 })
  expect(screen.queryByLabelText('QR 토큰 직접 입력')).not.toBeInTheDocument()
})

it('QR 만료·서명 무효는 클라이언트가 가로채지 않는 401이다', () => {
  // 이 목록에서 빠지면 client.ts가 refresh·강제 로그아웃을 돌려 스캔이 멈춘다
  expect(isPassthroughUnauthorized('ENTRY_QR_EXPIRED')).toBe(true)
  expect(isPassthroughUnauthorized('ENTRY_QR_SIGNATURE_INVALID')).toBe(true)
})
