import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'

import i18n from '@/shared/i18n'

import { StudioHomePage } from './StudioHomePage'

const { useMyPerformancesAll, useMyTeams, useStudioTodos } = vi.hoisted(() => ({
  useMyPerformancesAll: vi.fn(),
  useMyTeams: vi.fn(),
  useStudioTodos: vi.fn(),
}))

// 삭제 뮤테이션은 이 파일의 관심사가 아니다 — 훅이 있기만 하면 된다
vi.mock('@/shared/queries/performance', () => ({
  useMyPerformancesAll,
  useDeletePerformance: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/shared/queries/team', () => ({ useMyTeams }))
// 할 일 데이터는 헤더와 공유하는 훅이다 — 조회·규칙은 studioTodos 테스트와 일치 테스트가 맡는다
vi.mock('@/shared/queries/studioTodos', () => ({ useStudioTodos }))
vi.mock('@/shared/queries/wallet', () => ({
  useMyWallet: () => ({ data: undefined, error: null, isError: false }),
}))

const leaderTeams = {
  data: { items: [{ teamId: 7, teamName: '블루노트', leader: true }] },
  isPending: false,
  isError: false,
  refetch: vi.fn(),
}

/** 공연 n개. 짝수 번째는 보증금 납부, 홀수 번째는 반환 — 필터가 가를 수 있게 */
function shows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    performanceId: 100 + i,
    title: `공연 ${i + 1}`,
    status: 'ON_SALE',
    depositStatus: i % 2 === 0 ? 'PAID' : 'RETURNED',
    teamId: 7,
    host: true,
    participationStatus: 'ACCEPTED',
    myTeamAgreementStatus: 'AGREED',
  }))
}

function allOf(items: unknown[], extra: Record<string, unknown> = {}) {
  return {
    data: { items, totalElements: items.length },
    isPending: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
    ...extra,
  }
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.search}</output>
}

function renderPage(url = '/studio') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <StudioHomePage />
      <LocationProbe />
    </MemoryRouter>,
  )
}

const search = () => screen.getByTestId('location').textContent
/** PC 표의 공연 행 제목(모바일 패널과 두 벌이라 표 안에서만 센다) */
const tableTitles = () =>
  within(screen.getByRole('table'))
    .getAllByRole('rowheader')
    .map((th) => within(th).getAllByRole('link')[0].textContent)

beforeEach(async () => {
  await i18n.changeLanguage('ko')
  useMyPerformancesAll.mockReset()
  useMyTeams.mockReset()
  useStudioTodos.mockReset()
  useStudioTodos.mockReturnValue({
    todos: [],
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  })
})

it('팀이 없으면 PERFORMER 전용 공연 목록을 요청하지 않는다', () => {
  useMyTeams.mockReturnValue({ ...leaderTeams, data: { items: [] } })
  useMyPerformancesAll.mockReturnValue(allOf([]))
  renderPage()
  expect(useMyPerformancesAll).toHaveBeenCalledWith({ enabled: false, refetchIntervalMs: 15_000 })
  expect(useStudioTodos).toHaveBeenCalledWith({ enabled: false, refetchIntervalMs: 15_000 })
})

describe('참여 공연 — 전체를 받아 10개씩', () => {
  beforeEach(() => {
    useMyTeams.mockReturnValue(leaderTeams)
  })

  it('10개면 페이지 넘김이 없다', () => {
    useMyPerformancesAll.mockReturnValue(allOf(shows(10)))
    renderPage()
    expect(tableTitles()).toHaveLength(10)
    expect(screen.queryByRole('navigation', { name: '참여 공연 페이지' })).not.toBeInTheDocument()
    expect(useMyPerformancesAll).toHaveBeenLastCalledWith({
      enabled: true,
      refetchIntervalMs: 15_000,
    })
  })

  it('11개면 2페이지 — 다음 페이지에 1개, ?page=2 로 남는다', () => {
    useMyPerformancesAll.mockReturnValue(allOf(shows(11)))
    renderPage()
    expect(tableTitles()).toHaveLength(10)
    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }))
    expect(search()).toBe('?page=2')
    expect(tableTitles()).toEqual(['공연 11'])
    expect(screen.getByRole('button', { name: '2페이지' })).toHaveAttribute('aria-current', 'page')
  })

  it('21개면 3페이지 — ?page=3 을 복원한다', () => {
    useMyPerformancesAll.mockReturnValue(allOf(shows(21)))
    renderPage('/studio?page=3')
    expect(tableTitles()).toEqual(['공연 21'])
    // 개수 칸은 필터·페이지와 무관한 전체다
    expect(screen.getByRole('tab', { name: /참여 공연/ })).toHaveTextContent('21')
  })

  it('다시 받는 중에도 이미 받은 전체 안에서는 페이지를 넘길 수 있다', () => {
    useMyPerformancesAll.mockReturnValue(allOf(shows(21), { isFetching: true }))
    renderPage()
    expect(screen.getByRole('button', { name: '다음 페이지' })).toBeEnabled()
  })
})

describe('참여 공연 필터', () => {
  beforeEach(() => {
    useMyTeams.mockReturnValue(leaderTeams)
  })

  const select = (name: string) => screen.getByRole('combobox', { name })

  it('보증금 필터를 고르면 AND로 거르고 1페이지로 돌아가며 "N개 중 M개"를 보인다', () => {
    useMyPerformancesAll.mockReturnValue(allOf(shows(21)))
    renderPage('/studio?page=2')
    fireEvent.change(select('보증금 상태'), { target: { value: 'RETURNED' } })
    expect(search()).toBe('?deposit=RETURNED')
    // 21개 중 홀수 번째(반환) 10개
    expect(screen.getByText('21개 중 10개')).toBeInTheDocument()
    expect(tableTitles()).toHaveLength(10)
    expect(screen.queryByRole('navigation', { name: '참여 공연 페이지' })).not.toBeInTheDocument()
  })

  it('두 필터는 AND다 — 결과 0이면 빈 상태 문구와 초기화를 준다', () => {
    useMyPerformancesAll.mockReturnValue(allOf(shows(4)))
    renderPage('/studio?deposit=PAID&status=ended')
    expect(screen.getByText('조건에 맞는 공연이 없습니다')).toBeInTheDocument()
    expect(screen.getByText('4개 중 0개')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: '필터 초기화' })[0])
    expect(search()).toBe('')
    expect(tableTitles()).toHaveLength(4)
  })

  it('공연 상태 × 보증금 상태 AND — 둘 다 맞는 공연만 남는다', () => {
    const [a, b, c] = shows(3)
    useMyPerformancesAll.mockReturnValue(
      allOf([
        { ...a, title: '종료·납부', status: 'ENDED', depositStatus: 'PAID' },
        { ...b, title: '종료·반환', status: 'ENDED', depositStatus: 'RETURNED' },
        { ...c, title: '판매·납부', status: 'ON_SALE', depositStatus: 'PAID' },
      ]),
    )
    renderPage('/studio?status=ended&deposit=PAID')
    expect(tableTitles()).toEqual(['종료·납부'])
    expect(screen.getByText('3개 중 1개')).toBeInTheDocument()
  })

  it('정산 "정산 전"은 정산 상태가 없는 공연도 포함한다', () => {
    useMyPerformancesAll.mockReturnValue(
      allOf([
        { ...shows(1)[0], title: '정산 없음' },
        { ...shows(2)[1], title: 'NONE 공연', settlementStatus: 'NONE' },
        { ...shows(3)[2], title: '잠금 공연', status: 'ENDED', settlementStatus: 'LOCKED' },
      ]),
    )
    renderPage('/studio?settlement=NONE')
    expect(tableTitles()).toEqual(['정산 없음', 'NONE 공연'])
    expect(select('정산 상태')).toHaveValue('NONE')
  })

  it('URL의 필터를 복원하고, 모르는 값은 전체로 본다', () => {
    useMyPerformancesAll.mockReturnValue(allOf(shows(4)))
    renderPage('/studio?deposit=PAID&settlement=WHAT')
    expect(select('보증금 상태')).toHaveValue('PAID')
    expect(select('정산 상태')).toHaveValue('')
    expect(tableTitles()).toEqual(['공연 1', '공연 3'])
  })

  it('필터 옵션 이름은 표의 배지 라벨과 같다', () => {
    useMyPerformancesAll.mockReturnValue(allOf(shows(1)))
    renderPage()
    const options = (name: string) =>
      within(select(name))
        .getAllByRole('option')
        .map((o) => o.textContent)
    expect(options('공연 상태')).toEqual([
      '전체',
      '공개 예정',
      '예매 중',
      '예매 마감',
      '공연 종료',
      '공연 취소',
    ])
    expect(options('정산 상태')).toEqual([
      '전체',
      '정산 전',
      '집계 확정',
      '정산 잠금',
      '이의제기 기간',
      '수령 완료',
      '정산 중단',
    ])
    expect(options('보증금 상태')).toEqual(['전체', '보증금 미납', '납부 완료', '반환 완료'])
  })

  it('영문에서도 필터·개수·페이지 이동을 표시한다', async () => {
    await i18n.changeLanguage('en')
    useMyTeams.mockReturnValue({
      ...leaderTeams,
      data: { items: [{ teamId: 7, teamName: 'Blue Note', leader: true }] },
    })
    useMyPerformancesAll.mockReturnValue(allOf(shows(21)))
    renderPage()
    expect(screen.getByText('21 of 21')).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Deposit status' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeVisible()
  })
})

it('캐시된 팀이 있으면 백그라운드 재조회 실패에도 기존 화면을 유지한다', () => {
  useMyTeams.mockReturnValue({ ...leaderTeams, isError: true })
  useMyPerformancesAll.mockReturnValue(allOf([]))
  renderPage()
  expect(screen.getAllByText('블루노트').length).toBeGreaterThan(0)
  expect(screen.queryByText('팀 정보를 불러오지 못했어요')).not.toBeInTheDocument()
})

it('캐시된 공연이 있으면 백그라운드 재조회 실패에도 기존 공연을 유지한다', () => {
  useMyTeams.mockReturnValue(leaderTeams)
  useMyPerformancesAll.mockReturnValue(
    allOf([{ ...shows(1)[0], title: '합정 라이브' }], { isError: true }),
  )
  renderPage()
  expect(screen.getAllByText('합정 라이브').length).toBeGreaterThan(0)
  expect(screen.queryByText('공연 정보를 불러오지 못했어요')).not.toBeInTheDocument()
})
