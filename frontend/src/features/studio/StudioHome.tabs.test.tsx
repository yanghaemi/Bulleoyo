/**
 * P-01 요약 타일 탭 — WAI-ARIA tabs · `?view=` 동기화 · 기본값 규칙.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'

import { StudioHome, type StudioPerformance, type StudioTeam } from './StudioHome'
import i18n from '@/shared/i18n'
import { collectStudioTodos } from '@/shared/todos/studioTodos'

const team: StudioTeam = { teamId: 2, teamName: '햄둥이', leader: true, walletAddress: null }

const onSale: StudioPerformance = {
  performanceId: 7,
  title: '합정 라이브',
  status: 'ON_SALE',
  depositStatus: 'PAID',
  teamId: 2,
  host: true,
  participationStatus: 'ACCEPTED',
  myTeamAgreementStatus: 'AGREED',
  pendingSignature: null,
}
const draft: StudioPerformance = {
  ...onSale,
  performanceId: 8,
  title: '규칙 공연',
  status: 'DRAFT',
  depositStatus: 'UNPAID',
  myTeamAgreementStatus: 'PENDING',
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname + location.search}</output>
}

function renderHome(performances: StudioPerformance[], url = '/studio') {
  const todos = collectStudioTodos(performances, [], (ko) => ko)
  render(
    <MemoryRouter initialEntries={[url]}>
      <StudioHome teams={[team]} performances={performances} todos={todos} />
      <LocationProbe />
    </MemoryRouter>,
  )
}

const tab = (name: RegExp) => screen.getByRole('tab', { name })
const location = () => screen.getByTestId('location').textContent

beforeEach(async () => {
  await i18n.changeLanguage('ko')
})

it('세 타일이 tablist 안의 tab이고 각 tab이 자기 tabpanel을 가리킨다', () => {
  renderHome([onSale])
  expect(screen.getByRole('tablist', { name: '공연 관리 요약' })).toBeInTheDocument()
  const tabs = screen.getAllByRole('tab')
  expect(tabs.map((t) => t.textContent)).toEqual(['내 팀1', '참여 공연1', '확인할 일0'])
  for (const t of tabs) {
    const panel = document.getElementById(t.getAttribute('aria-controls') ?? '')
    expect(panel).toHaveAttribute('role', 'tabpanel')
    expect(panel).toHaveAttribute('aria-labelledby', t.id)
  }
})

it('확인할 일이 있으면 기본은 확인할 일 탭이다(URL에는 쓰지 않는다)', () => {
  renderHome([draft])
  expect(tab(/확인할 일/)).toHaveAttribute('aria-selected', 'true')
  expect(tab(/확인할 일/)).toHaveAttribute('tabIndex', '0')
  expect(tab(/참여 공연/)).toHaveAttribute('aria-selected', 'false')
  expect(tab(/참여 공연/)).toHaveAttribute('tabIndex', '-1')
  expect(screen.getByRole('tabpanel')).toHaveAccessibleName(/확인할 일/)
  expect(screen.getByRole('region', { name: '할 일' })).toBeVisible()
  expect(location()).toBe('/studio')
})

it('확인할 일이 0이면 기본은 참여 공연 탭이다', () => {
  renderHome([onSale])
  expect(tab(/참여 공연/)).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('tabpanel')).toHaveAccessibleName(/참여 공연/)
  expect(screen.getAllByRole('link', { name: '합정 라이브' }).length).toBeGreaterThan(0)
})

it('타일을 누르면 스크롤 없이 영역이 바뀌고 ?view= 에 남는다', () => {
  renderHome([draft])
  fireEvent.click(tab(/내 팀/))
  expect(tab(/내 팀/)).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('tabpanel')).toHaveAccessibleName(/내 팀/)
  expect(screen.getByRole('link', { name: /햄둥이/ })).toBeVisible()
  expect(screen.queryByRole('region', { name: '할 일' })).not.toBeInTheDocument()
  expect(location()).toBe('/studio?view=teams')

  fireEvent.click(tab(/참여 공연/))
  expect(location()).toBe('/studio?view=performances')
  expect(screen.getAllByRole('link', { name: '규칙 공연' }).length).toBeGreaterThan(0)
})

it('좌우 화살표·Home·End로 탭을 옮기면 포커스와 선택이 함께 간다(끝에서 돌아간다)', () => {
  renderHome([draft]) // 기본 = 확인할 일(마지막 탭)
  const todos = tab(/확인할 일/)
  todos.focus()
  fireEvent.keyDown(todos, { key: 'ArrowRight' })
  expect(tab(/내 팀/)).toHaveFocus()
  expect(tab(/내 팀/)).toHaveAttribute('aria-selected', 'true')
  expect(location()).toBe('/studio?view=teams')

  fireEvent.keyDown(tab(/내 팀/), { key: 'ArrowLeft' })
  expect(tab(/확인할 일/)).toHaveFocus()
  fireEvent.keyDown(tab(/확인할 일/), { key: 'ArrowLeft' })
  expect(tab(/참여 공연/)).toHaveFocus()
  expect(tab(/참여 공연/)).toHaveAttribute('aria-selected', 'true')

  fireEvent.keyDown(tab(/참여 공연/), { key: 'Home' })
  expect(tab(/내 팀/)).toHaveFocus()
  fireEvent.keyDown(tab(/내 팀/), { key: 'End' })
  expect(tab(/확인할 일/)).toHaveFocus()
  expect(location()).toBe('/studio?view=todos')
})

it('URL의 ?view= 를 복원한다 — 할 일이 있어도 사용자가 고른 탭이 이긴다', () => {
  renderHome([draft], '/studio?view=teams')
  expect(tab(/내 팀/)).toHaveAttribute('aria-selected', 'true')
})

it('잘못된 ?view= 값은 기본값 규칙을 따른다', () => {
  renderHome([draft], '/studio?view=wallet')
  expect(tab(/확인할 일/)).toHaveAttribute('aria-selected', 'true')
})

it('확인할 일 탭이 비었으면 빈 상태 문구를 보인다', () => {
  renderHome([onSale], '/studio?view=todos')
  expect(screen.getByText('지금 확인할 일이 없습니다')).toBeVisible()
})

describe('확인할 일 — 할 일 행 10개씩 페이지', () => {
  /** 공연 하나에 팀 n개가 모두 동의 대기 → 할 일 n개(한 묶음) */
  const agreeShow = (performanceId: number, teams: number): StudioPerformance[] =>
    Array.from({ length: teams }, (_, i) => ({
      ...draft,
      performanceId,
      title: `동의 공연 ${performanceId}`,
      status: 'PENDING_AGREEMENT' as const,
      teamId: 100 + i,
      host: false,
      pendingSignature: 'AGREE' as const,
    }))

  function renderTodos(rows: StudioPerformance[], url = '/studio') {
    // 표 행은 팀 하나씩이라 collectStudioTodos 가 팀마다 할 일을 만든다
    const todos = collectStudioTodos(rows, [], (ko) => ko)
    render(
      <MemoryRouter initialEntries={[url]}>
        <StudioHome teams={[team]} performances={rows} todos={todos} />
        <LocationProbe />
      </MemoryRouter>,
    )
    return todos
  }
  const items = () =>
    screen.getByRole('region', { name: '할 일' }).querySelectorAll('li[data-todo-id]')

  it('10개면 페이지 넘김이 없다', () => {
    renderTodos(agreeShow(1, 10))
    expect(items()).toHaveLength(10)
    expect(screen.queryByRole('navigation', { name: '확인할 일 페이지' })).not.toBeInTheDocument()
  })

  it('11개면 1페이지 10개, 다음 페이지에 1개와 이어지는 묶음 머리가 나온다', () => {
    renderTodos(agreeShow(1, 11))
    expect(items()).toHaveLength(10)
    const nav = screen.getByRole('navigation', { name: '확인할 일 페이지' })
    expect(screen.getByRole('button', { name: '1페이지' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: '이전 페이지' })).toBeDisabled()
    expect(nav).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }))
    expect(location()).toBe('/studio?page=2')
    expect(items()).toHaveLength(1)
    expect(screen.getByRole('group', { name: '동의 공연 1 (이어서)' })).toHaveTextContent(
      '할 일 11개',
    )
    expect(screen.getByRole('button', { name: '2페이지' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: '다음 페이지' })).toBeDisabled()
  })

  it('21개면 3페이지 — ?page=3 을 복원한다', () => {
    renderTodos([...agreeShow(1, 12), ...agreeShow(2, 9)], '/studio?page=3')
    expect(items()).toHaveLength(1)
    expect(screen.getByRole('group', { name: '동의 공연 2 (이어서)' })).toBeInTheDocument()
  })

  it('범위 밖 ?page= 는 마지막 페이지를 보인다', () => {
    renderTodos(agreeShow(1, 11), '/studio?page=9')
    expect(items()).toHaveLength(1)
  })

  it('탭을 바꾸면 페이지를 지운다', () => {
    renderTodos(agreeShow(1, 11), '/studio?page=2')
    fireEvent.click(tab(/참여 공연/))
    expect(location()).toBe('/studio?view=performances')
  })
})

it('팀이 없으면 탭 없이 정적 숫자와 빈 상태만 보인다', () => {
  render(
    <MemoryRouter>
      <StudioHome teams={[]} performances={[]} todos={[]} />
    </MemoryRouter>,
  )
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  expect(screen.getByText('첫 무대를 함께 만들 팀을 준비하세요')).toBeInTheDocument()
})
