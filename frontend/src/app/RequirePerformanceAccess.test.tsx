/**
 * 가드의 비자명한 세 갈래 — 참여자는 통과, 남은 막힘, **관리자는 목록 없이도 통과**.
 * 관리자가 막히면 M-02 이의제기 큐에서 P-08로 가는 링크가 죽는다(`DisputeQueue`).
 */

import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'

import { RequirePerformanceAccess } from '@/app/RequirePerformanceAccess'
import { tokenStore } from '@/shared/api/client'
import { useMyPerformanceList } from '@/shared/queries/performance'

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api/client')>()),
  tokenStore: { getAccessToken: vi.fn(), hasSession: vi.fn() },
}))

vi.mock('@/shared/queries/performance', () => ({ useMyPerformanceList: vi.fn() }))

const mocked = vi.mocked({ getAccessToken: tokenStore.getAccessToken, useMyPerformanceList })

/** `header.payload.signature` 중 payload만 쓴다 — 가드가 서명을 보지 않는다 */
function tokenWith(claims: object): string {
  return `h.${btoa(JSON.stringify(claims))}.s`
}

/**
 * 가드가 읽는 세 필드만 채운다. `UseQueryResult`는 20여 필드짜리 판별 유니온이라
 * 전부 채우면 테스트가 쿼리 라이브러리 내부 모양을 따라다니게 된다 — 가드가 보는 것만 준다.
 */
type QueryStub = ReturnType<typeof useMyPerformanceList>

function stub(value: Partial<QueryStub>): QueryStub {
  return value as QueryStub
}

type ListOptions = { isFetching?: boolean; hasNext?: boolean }

function listOf(ids: number[], options: ListOptions = {}): QueryStub {
  // 행에서 가드가 보는 것도 `performanceId` 하나다 — 나머지 필드는 판정에 쓰이지 않는다
  const items = ids.map((performanceId) => ({ performanceId })) as NonNullable<
    QueryStub['data']
  >['items']
  return stub({
    isPending: false,
    isError: false,
    isFetching: options.isFetching ?? false,
    data: {
      items,
      pageInfo: { page: 0, size: 100, totalElements: ids.length, hasNext: options.hasNext ?? false },
    },
  })
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/studio/performances/:id/settlement"
          element={
            <RequirePerformanceAccess>
              <p>Settlement</p>
            </RequirePerformanceAccess>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocked.getAccessToken.mockReturnValue(tokenWith({ adm: false }))
})

describe('RequirePerformanceAccess', () => {
  it('내 공연 목록에 있으면 통과시킨다', () => {
    mocked.useMyPerformanceList.mockReturnValue(listOf([7, 12]))
    renderAt('/studio/performances/12/settlement')
    expect(screen.getByText('Settlement')).toBeInTheDocument()
  })

  it('목록에 없으면 화면을 열지 않는다', () => {
    mocked.useMyPerformanceList.mockReturnValue(listOf([7]))
    renderAt('/studio/performances/12/settlement')
    expect(screen.queryByText('Settlement')).not.toBeInTheDocument()
    // 테스트 로케일은 영문이라 문구 대신 복귀 경로로 확인한다
    expect(screen.getByRole('link')).toHaveAttribute('href', '/studio')
  })

  it('관리자는 참여자가 아니어도 통과한다 — 목록을 부르지도 않는다', () => {
    mocked.getAccessToken.mockReturnValue(tokenWith({ adm: true }))
    mocked.useMyPerformanceList.mockReturnValue(listOf([]))
    renderAt('/studio/performances/12/settlement')
    expect(screen.getByText('Settlement')).toBeInTheDocument()
    expect(mocked.useMyPerformanceList).toHaveBeenCalledWith(
      expect.anything(),
      { enabled: false },
    )
  })

  it('목록 조회가 실패하면 막지 않는다 — 판정은 서버가 한다', () => {
    mocked.useMyPerformanceList.mockReturnValue(
      stub({ isPending: false, isError: true, data: undefined }),
    )
    renderAt('/studio/performances/12/settlement')
    expect(screen.getByText('Settlement')).toBeInTheDocument()
  })

  it('갱신 중인 목록으로 거부를 확정하지 않는다 — 방금 만든 자기 공연이 깜빡이면 안 된다', () => {
    // 공연 생성 직후: 무효화는 됐지만 캐시가 남아 isPending 은 false, data 는 옵 목록이다
    mocked.useMyPerformanceList.mockReturnValue(listOf([7], { isFetching: true }))
    renderAt('/studio/performances/12/settlement')
    expect(screen.queryByText('Settlement')).not.toBeInTheDocument()
    // 거부도 아니다 — 기다린다
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('이미 통과한 화면은 백그라운드 재조회에 화면을 빼앗기지 않는다', () => {
    mocked.useMyPerformanceList.mockReturnValue(listOf([12], { isFetching: true }))
    renderAt('/studio/performances/12/settlement')
    expect(screen.getByText('Settlement')).toBeInTheDocument()
  })

  it('목록이 한 장을 넘으면 모른다고 보고 서버에 넘긴다', () => {
    mocked.useMyPerformanceList.mockReturnValue(listOf([1, 2, 3], { hasNext: true }))
    renderAt('/studio/performances/12/settlement')
    expect(screen.getByText('Settlement')).toBeInTheDocument()
  })
})
