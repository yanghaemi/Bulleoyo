/**
 * S-03 입장 현황 — **한 자원을 두 인증으로 본다.** 그 갈래를 못 박는다.
 *
 *   ① `/entry/:performanceId/entries`(검표 링크) : `X-Entry-Token`으로 나가야 한다.
 *      로그인하지 않은 스태프라 회원 세션 경로로 새면 401로 죽는다.
 *   ② `/studio/performances/:id/entries`(P-09)  : 검표 토큰을 **넘기면 안 된다.**
 *      넘기면 회원 권한이 아니라 링크 권한으로 보게 되고, 링크가 회전되면 리더가 자기 공연을 못 본다.
 *   ③ 응답 필드는 전부 선택이다. `summary`가 비었다고 **0으로 그리지 않는다** —
 *      "아무도 안 들어왔다"와 "모른다"는 현장에서 다른 말이고, 총 매수 0은 매진으로 읽힌다.
 *
 * 두 페이지가 같은 컴포넌트를 쓰므로 한 파일에서 나란히 본다.
 */

import { render, screen, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'

import i18n from '@/shared/i18n'

import { ScanEntriesPage } from './ScanEntriesPage'
import { StudioEntriesPage } from './StudioEntriesPage'

const entry = vi.hoisted(() => ({
  calls: [] as { params: unknown; auth: unknown }[],
  data: undefined as unknown,
}))

vi.mock('@/shared/queries/entry', () => ({
  useEntries: (params: unknown, auth: unknown) => {
    entry.calls.push({ params, auth })
    return { data: entry.data, isPending: false, error: null, refetch: vi.fn() }
  },
}))
vi.mock('@/shared/queries/performance', () => ({
  usePerformanceDetail: () => ({
    data: { performanceId: 12, title: '합정 3밴드 합동공연' },
    isPending: false,
    error: null,
  }),
}))
vi.mock('@/shared/queries/team', () => ({
  useMyTeams: () => ({ data: { items: [{ teamId: 7, teamName: '블루노트' }] } }),
}))

/** entry-02 200 예시(§10) — 요약과 실패 이력이 함께 온다 */
function statusData() {
  return {
    performanceId: 12,
    summary: {
      enteredCount: 41,
      totalIssuedCount: 64,
      duplicateAttemptCount: 3,
      expiredQrCount: 5,
    },
    items: [
      {
        entryLogId: 77013,
        ticketId: 90211,
        holderNameMasked: '김*객',
        result: 'FAILED',
        failureCode: 'ENTRY_ALREADY_ENTERED',
        scannedAt: '2026-09-19T09:42:31Z',
        scannerSource: 'ENTRY_LINK',
      },
    ],
    pageInfo: { page: 0, size: 20, totalElements: 49, hasNext: true },
  }
}

beforeEach(async () => {
  await i18n.changeLanguage('ko')
  entry.calls = []
  entry.data = statusData()
})

/** 요약·이력은 각각 이름 붙은 영역이다. 같은 낱말이 타일 라벨과 배지에 겹쳐 나와 구분해서 본다 */
function summary(): HTMLElement {
  return screen.getByRole('region', { name: '입장 요약' })
}

function logs(): HTMLElement {
  return screen.getByRole('region', { name: '입장 이력' })
}

function renderStaff(path = '/entry/12/entries?token=LINK-TOKEN') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/entry/:performanceId/entries" element={<ScanEntriesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderStudio(path = '/studio/performances/12/entries') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/studio/performances/:id/entries" element={<StudioEntriesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

it('검표 링크 경로는 entryToken을 넘기고 스캔 복귀 버튼을 켠다', () => {
  renderStaff()

  expect(entry.calls[0].auth).toEqual({ entryToken: 'LINK-TOKEN' })
  expect(entry.calls[0].params).toMatchObject({ performanceId: 12 })
  // 1417행 — 복귀 버튼은 검표 링크 진입에서만. 토큰을 유지한 스캔 주소로 돌아간다
  const back = screen.getAllByRole('link', { name: '스캔 화면으로' })
  expect(back[0]).toHaveAttribute('href', '/entry/12?token=LINK-TOKEN')
  // 중복 시도가 성공과 갈라 보인다(색이 아니라 라벨로). 요약 타일 라벨과 섞이지 않게 이력 안에서 본다
  expect(within(logs()).getAllByText('중복 시도').length).toBeGreaterThan(0)
  expect(within(logs()).getAllByText('이미 입장한 티켓입니다.').length).toBeGreaterThan(0)
})

it('공연자 경로는 검표 토큰을 넘기지 않고 복귀 버튼도 없다', () => {
  renderStudio()

  expect(entry.calls[0].auth).toEqual({})
  expect(entry.calls[0].params).toMatchObject({ performanceId: 12 })
  expect(screen.queryByRole('link', { name: '스캔 화면으로' })).not.toBeInTheDocument()
})

it('요약이 비어 오면 0이 아니라 "모른다"로 그린다', () => {
  entry.data = { performanceId: 12, items: [], pageInfo: {} }
  renderStaff()

  // 요약 타일 세 개(입장·총 매수·중복 시도)가 전부 "—"다. 0으로 채우면 총 매수 0 = 매진으로 읽힌다
  expect(within(summary()).getAllByText('—').length).toBeGreaterThanOrEqual(3)
  expect(within(summary()).queryByText('0')).not.toBeInTheDocument()
  expect(screen.getByText('아직 입장 이력이 없습니다')).toBeInTheDocument()
})

it('판정을 모르는 이력도 행을 버리지 않고 배지만 비운다', () => {
  entry.data = {
    performanceId: 12,
    summary: { enteredCount: 1, totalIssuedCount: 2 },
    // 명세에 없는 판정값 — 행 전체를 버리면 시각·티켓까지 사라진다
    items: [
      {
        entryLogId: 1,
        ticketId: 90211,
        result: 'UNKNOWN_FUTURE',
        scannedAt: '2026-09-19T09:00:00Z',
      },
    ],
    pageInfo: { page: 0, size: 20, totalElements: 1, hasNext: false },
  }
  renderStaff()

  expect(within(logs()).getAllByText('#90211').length).toBeGreaterThan(0)
  expect(within(logs()).queryByText('입장')).not.toBeInTheDocument()
  expect(within(logs()).queryByText('실패')).not.toBeInTheDocument()
  expect(within(logs()).queryByText('중복 시도')).not.toBeInTheDocument()
})

it('주소의 공연 id가 숫자가 아니면 조회를 켜지 않고 재시도 버튼도 주지 않는다', () => {
  renderStudio('/studio/performances/abc/entries')

  expect(entry.calls[0].params).toMatchObject({ performanceId: undefined })
  expect(screen.getByText('존재하지 않는 공연입니다.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
})
