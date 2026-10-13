import { render, screen, within } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

import type { ComponentProps } from 'react'

import { StudioHome, type StudioPerformance } from './StudioHome'
import i18n from '@/shared/i18n'
import { collectStudioTodos } from '@/shared/todos/studioTodos'

/**
 * 운영에서는 페이지가 `useStudioTodos` 결과를 넘긴다. 여기서는 같은 순수 함수로 표 행에서 할 일을
 * 만들어 넘겨 "배너가 공용 모델 결과를 그대로 그리는지"를 본다. 조건 표 자체는
 * `shared/todos/studioTodos.test.ts`가 맡는다.
 */
function HomeWithTodos(props: ComponentProps<typeof StudioHome>) {
  return <StudioHome {...props} todos={collectStudioTodos(props.performances, [], (ko) => ko)} />
}

beforeEach(async () => {
  await i18n.changeLanguage('ko')
})

it('팀이 없는 로그인 회원에게 역할을 전제하지 않는 빈 상태와 팀 만들기를 보여준다', () => {
  render(
    <MemoryRouter>
      <HomeWithTodos teams={[]} performances={[]} />
    </MemoryRouter>,
  )

  expect(screen.getByText('첫 무대를 함께 만들 팀을 준비하세요')).toBeInTheDocument()
  expect(screen.queryByText('리더인 팀이 없습니다')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '팀 만들기' })).toBeEnabled()
})

it('팀 조회 실패를 팀 없음으로 숨기지 않고 재시도한다', () => {
  const retry = vi.fn()
  render(
    <MemoryRouter>
      <HomeWithTodos teams={[]} performances={[]} teamError onRetryTeams={retry} />
    </MemoryRouter>,
  )

  expect(screen.getByRole('alert')).toHaveTextContent('팀 정보를 불러오지 못했어요')
  expect(screen.queryByText('첫 무대를 함께 만들 팀을 준비하세요')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
  expect(retry).toHaveBeenCalledOnce()
})

it('공연 조회 실패를 공연 없음으로 숨기지 않고 재시도한다', () => {
  const retry = vi.fn()
  render(
    <MemoryRouter>
      <HomeWithTodos
        teams={[
          {
            teamId: 7,
            teamName: 'Blue note',
            leader: true,
            walletAddress: null,
          },
        ]}
        performances={[]}
        performanceError
        onRetryPerformances={retry}
      />
    </MemoryRouter>,
  )

  expect(screen.getByRole('alert')).toHaveTextContent('공연 정보를 불러오지 못했어요')
  expect(screen.queryByText('아직 참여 중인 공연이 없습니다')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
  expect(retry).toHaveBeenCalledOnce()
})

/**
 * 규칙 화면으로 가는 길은 **공연을 만든 직후 1회**뿐이었다. 그 화면을 벗어나면 대시보드의
 * 관리 링크도 할 일도 전부 P-03(보증금)으로 보내는데, 규칙이 없으면 보증금은 409
 * `정산 규칙을 먼저 저장해야…` 로 막힌다 — 되돌아갈 길이 없는 막다른 길이었다.
 *
 * `DRAFT` 는 곧 "규칙 미저장"이다(규칙을 저장해야 `PENDING_AGREEMENT` 로 간다).
 */
const draftShow = {
  performanceId: 7,
  title: 'ㅁㄻㅎ모',
  startAt: '2026-09-19T14:21:00+09:00',
  status: 'DRAFT' as const,
  depositStatus: 'UNPAID' as const,
  teamId: 2,
  host: true,
  participationStatus: 'ACCEPTED' as const,
  myTeamAgreementStatus: 'PENDING' as const,
  pendingSignature: 'DEPOSIT' as const,
}
const leaderTeam = {
  teamId: 2,
  teamName: '햄둥이',
  leader: true,
  memberCount: 1,
  walletAddress: '0x1dC59a570C658fa9225E627f3C80921dD19307de',
}

it('규칙을 저장하지 않은 DRAFT 공연은 보증금이 아니라 정산 규칙으로 보낸다', () => {
  render(
    <MemoryRouter>
      <HomeWithTodos teams={[leaderTeam]} performances={[draftShow]} />
    </MemoryRouter>,
  )

  // 할 일 — 보증금이 아니라 규칙이다
  const todo = screen.getByRole('link', { name: /정산 규칙 저장이 필요합니다/ })
  expect(todo).toHaveAttribute('href', '/studio/performances/7/rules')
  expect(screen.queryByText(/보증금 납부가 필요합니다/)).not.toBeInTheDocument()

  // 공연 이름(관리 링크)도 같은 곳으로 간다 — PC 표와 모바일 카드 두 벌이다
  for (const link of screen.getAllByRole('link', { name: /ㅁㄻㅎ모/ })) {
    expect(link).toHaveAttribute('href', '/studio/performances/7/rules')
  }
})

it('규칙을 저장한 뒤 보증금이 남았으면 보증금으로 보낸다', () => {
  render(
    <MemoryRouter>
      <HomeWithTodos
        teams={[leaderTeam]}
        performances={[{ ...draftShow, status: 'PENDING_AGREEMENT' as const }]}
      />
    </MemoryRouter>,
  )

  const todo = screen.getByRole('link', { name: /보증금 납부가 필요합니다/ })
  expect(todo).toHaveAttribute('href', '/studio/performances/7/edit')
})

it('집계 전 종료 공연에서도 정산을 시작할 수 있다', () => {
  render(
    // 집계 할 일이 있어 기본 탭은 확인할 일이다 — 표는 참여 공연 탭에서 본다
    <MemoryRouter initialEntries={['/studio?view=performances']}>
      <HomeWithTodos
        teams={[leaderTeam]}
        performances={[
          {
            ...draftShow,
            status: 'ENDED',
            settlementStatus: 'NONE',
            depositStatus: 'PAID',
            pendingSignature: null,
          },
        ]}
      />
    </MemoryRouter>,
  )
  for (const link of screen.getAllByRole('link', { name: /ㅁㄻㅎ모/ })) {
    expect(link).toHaveAttribute('href', '/studio/performances/7/settlement')
  }
  // 제목 링크만으로는 정산이 거기 있다는 것을 알 수 없다 — 관리 메뉴에 이름이 있어야 한다
  for (const link of screen.getAllByRole('link', { name: '정산' })) {
    expect(link).toHaveAttribute('href', '/studio/performances/7/settlement')
  }
})

it('초대 대기 팀을 수락 화면으로 안내하며 주최자 보증금과 규칙 작업을 요구하지 않는다', () => {
  render(
    <MemoryRouter>
      <HomeWithTodos
        teams={[leaderTeam]}
        performances={[
          { ...draftShow, host: false, participationStatus: 'INVITED', pendingSignature: null },
        ]}
      />
    </MemoryRouter>,
  )
  expect(screen.getByRole('link', { name: /공연 초대에 응답해 주세요/ })).toHaveAttribute(
    'href',
    '/studio/performances/7/participants',
  )
  expect(screen.queryByText(/정산 규칙 저장이 필요합니다/)).not.toBeInTheDocument()
  expect(screen.queryByText(/보증금 납부가 필요합니다/)).not.toBeInTheDocument()
  expect(screen.queryByText(/규칙 동의가 필요합니다/)).not.toBeInTheDocument()
})

it('수락한 참여팀에게는 서버가 안내한 규칙 동의만 요구한다', () => {
  render(
    <MemoryRouter>
      <HomeWithTodos
        teams={[leaderTeam]}
        performances={[
          { ...draftShow, status: 'PENDING_AGREEMENT', host: false, pendingSignature: 'AGREE' },
        ]}
      />
    </MemoryRouter>,
  )
  // 팀별로 펼치므로 동의 화면이 어느 팀으로 서명할지 쿼리로 넘긴다(헤더와 같은 링크)
  expect(screen.getByRole('link', { name: /규칙 동의가 필요합니다/ })).toHaveAttribute(
    'href',
    '/studio/performances/7/agreements?teamId=2',
  )
  expect(screen.queryByText(/보증금 납부가 필요합니다/)).not.toBeInTheDocument()
})

it.each<StudioPerformance['status']>(['ON_SALE', 'SALE_CLOSED', 'ENDED', 'CANCELLED'])(
  '%s 공연에 과거 미납·미동의가 남아도 서명 할 일을 만들지 않는다',
  (status) => {
    render(
      <MemoryRouter>
        <HomeWithTodos
          teams={[leaderTeam]}
          performances={[{ ...draftShow, status, pendingSignature: null }]}
        />
      </MemoryRouter>,
    )
    expect(screen.queryByText(/보증금 납부가 필요합니다/)).not.toBeInTheDocument()
    expect(screen.queryByText(/규칙 동의가 필요합니다/)).not.toBeInTheDocument()
  },
)

it('판매 중 주최자에게 공연 관리와 입장 현황의 진입 경로를 제공한다', () => {
  render(
    <MemoryRouter>
      <HomeWithTodos
        teams={[leaderTeam]}
        performances={[
          { ...draftShow, status: 'ON_SALE', depositStatus: 'PAID', pendingSignature: null },
        ]}
      />
    </MemoryRouter>,
  )
  for (const link of screen.getAllByRole('link', { name: '공연 관리' })) {
    expect(link).toHaveAttribute('href', '/studio/performances/7/edit')
  }
  for (const link of screen.getAllByRole('link', { name: '입장 현황' })) {
    expect(link).toHaveAttribute('href', '/studio/performances/7/entries')
  }
})

it('수락한 참여팀도 입장 현황에 들어가지만 주최자 관리 링크는 보이지 않는다', () => {
  render(
    <MemoryRouter>
      <HomeWithTodos
        teams={[leaderTeam]}
        performances={[
          {
            ...draftShow,
            host: false,
            status: 'ON_SALE',
            depositStatus: 'PAID',
            pendingSignature: null,
          },
        ]}
      />
    </MemoryRouter>,
  )
  expect(screen.getAllByRole('link', { name: '입장 현황' })).toHaveLength(2)
  expect(screen.queryByRole('link', { name: '공연 관리' })).not.toBeInTheDocument()
})

/**
 * 정산 단계 할 일 3종 — 집계 확정·정산 잠금(주최 팀) · 정산 동의(수락한 참여팀).
 * 공연이 끝난 뒤 대시보드가 비어 보이면 리더가 P-08에 들어갈 이유를 모른다(9/23 dev 재현).
 */
const endedShow: StudioPerformance = {
  performanceId: 9,
  title: '망원 어쿠스틱',
  status: 'ENDED',
  settlementStatus: 'NONE',
  depositStatus: 'RETURNED',
  teamId: 2,
  host: true,
  participationStatus: 'ACCEPTED',
  myTeamAgreementStatus: 'AGREED',
  pendingSignature: null,
}

function renderHome(performances: StudioPerformance[]) {
  render(
    <MemoryRouter>
      <HomeWithTodos teams={[leaderTeam]} performances={performances} />
    </MemoryRouter>,
  )
}

describe('정산 단계 할 일', () => {
  it('종료 후 집계 전이면 주최 팀에게 집계 확정을 요구한다', () => {
    renderHome([endedShow])
    expect(screen.getByRole('link', { name: /집계 확정이 필요합니다/ })).toHaveAttribute(
      'href',
      '/studio/performances/9/settlement',
    )
  })

  it('정산 상태를 모르는 종료 공연도 주최 팀에게는 집계 확정 대상이다', () => {
    renderHome([{ ...endedShow, settlementStatus: undefined }])
    expect(screen.getByRole('link', { name: /집계 확정이 필요합니다/ })).toBeInTheDocument()
  })

  it('집계가 확정되면 주최 팀에게 정산 잠금을 요구한다', () => {
    renderHome([{ ...endedShow, settlementStatus: 'AGGREGATED' }])
    expect(screen.getByRole('link', { name: /정산 잠금이 필요합니다/ })).toHaveAttribute(
      'href',
      '/studio/performances/9/settlement',
    )
    expect(screen.queryByText(/집계 확정이 필요합니다/)).not.toBeInTheDocument()
  })

  it('주최 팀이 아니면 집계·잠금 할 일을 띄우지 않는다', () => {
    renderHome([
      { ...endedShow, host: false },
      { ...endedShow, performanceId: 10, host: false, settlementStatus: 'AGGREGATED' },
    ])
    expect(screen.queryByText(/집계 확정이 필요합니다/)).not.toBeInTheDocument()
    expect(screen.queryByText(/정산 잠금이 필요합니다/)).not.toBeInTheDocument()
  })

  it.each(['LOCKED', 'DISPUTE_OPEN'] as const)(
    '%s 이고 내 팀이 미동의면 정산 동의를 요구한다',
    (settlementStatus) => {
      renderHome([{ ...endedShow, host: false, settlementStatus, myTeamSettlementApproved: false }])
      expect(screen.getByRole('link', { name: /정산 동의가 필요합니다/ })).toHaveAttribute(
        'href',
        '/studio/performances/9/settlement',
      )
      expect(
        screen.getByText('참여팀이 모두 동의하면 이의제기 기간 없이 정산금이 지급됩니다.'),
      ).toBeInTheDocument()
    },
  )

  it('동의 여부를 모르면(undefined) 정산 동의를 띄우지 않는다', () => {
    renderHome([{ ...endedShow, settlementStatus: 'LOCKED' }])
    expect(screen.queryByText(/정산 동의가 필요합니다/)).not.toBeInTheDocument()
  })

  it('이미 동의했으면 정산 동의를 띄우지 않는다', () => {
    renderHome([{ ...endedShow, settlementStatus: 'LOCKED', myTeamSettlementApproved: true }])
    expect(screen.queryByText(/정산 동의가 필요합니다/)).not.toBeInTheDocument()
  })

  it('중단·취소된 공연에는 정산 할 일을 띄우지 않는다', () => {
    renderHome([
      { ...endedShow, settlementStatus: 'HALTED', myTeamSettlementApproved: false },
      { ...endedShow, performanceId: 10, status: 'CANCELLED', settlementStatus: 'NONE' },
    ])
    expect(screen.queryByText(/집계 확정이 필요합니다/)).not.toBeInTheDocument()
    expect(screen.queryByText(/정산 동의가 필요합니다/)).not.toBeInTheDocument()
  })
})

describe('할 일 배너는 넘겨받은 목록만 그린다', () => {
  const todos = [
    {
      id: 'agree-30-32',
      kind: 'agree' as const,
      title: '규칙 동의가 필요합니다',
      note: '동의 화면에서 대상 팀과 규칙을 확인한 뒤 지갑에서 서명합니다.',
      description: '다른 페이지의 공연 · 팀 #32',
      to: '/studio/performances/30/agreements?teamId=32',
      performanceId: 30,
      teamId: 32,
    },
  ]

  it('현재 표 페이지에 없는 공연의 할 일도 개수·배너에 들어가고 "현재 페이지 기준"을 붙이지 않는다', () => {
    render(
      <MemoryRouter>
        <StudioHome teams={[leaderTeam]} performances={[]} todos={todos} performanceTotal={21} />
      </MemoryRouter>,
    )
    const banner = screen.getByRole('region', { name: '할 일' })
    expect(banner).toHaveTextContent('지금 확인할 일1')
    expect(
      screen.getByRole('link', { name: /규칙 동의가 필요합니다 · 다른 페이지의 공연 · 팀 #32/ }),
    ).toHaveAttribute('href', '/studio/performances/30/agreements?teamId=32')
    expect(screen.queryByText('현재 페이지 기준')).not.toBeInTheDocument()
    // 참여 공연 개수는 전체(totalElements)다
    expect(screen.getByText('참여 공연').closest('div')).toHaveTextContent('21')
  })

  it('할 일 조회를 모르면 개수 자리를 — 로 둔다', () => {
    render(
      <MemoryRouter>
        <StudioHome teams={[leaderTeam]} performances={[]} todos={[]} todosUnavailable />
      </MemoryRouter>,
    )
    expect(screen.getByText('확인할 일').closest('div')).toHaveTextContent('—')
  })
})

describe('할 일 배너는 공연별로 묶어 그린다', () => {
  const agreeShow = {
    ...draftShow,
    performanceId: 21,
    title: '합정 합동 공연',
    startAt: '2026-10-01T19:00:00+09:00',
    status: 'PENDING_AGREEMENT' as const,
    host: false,
    pendingSignature: 'AGREE' as const,
  }
  const rulesShow = {
    ...draftShow,
    performanceId: 22,
    title: '망원 규칙 공연',
    startAt: '2026-10-09T19:00:00+09:00',
    pendingSignature: null,
  }

  it('묶음 머리에 공연명·KST 일시·상태 배지·할 일 수를 싣고, 묶음 순서는 앞선 종류 먼저다', () => {
    render(
      <MemoryRouter>
        <HomeWithTodos teams={[leaderTeam]} performances={[agreeShow, rulesShow]} />
      </MemoryRouter>,
    )
    const banner = screen.getByRole('region', { name: '할 일' })
    const groups = within(banner).getAllByRole('group')
    // rules(규칙)가 agree(동의)보다 앞선 종류 — 시작 시각은 더 늦어도 먼저다
    expect(groups.map((g) => g.getAttribute('data-todo-group'))).toEqual(['22', '21'])
    const first = within(banner).getByRole('group', { name: '망원 규칙 공연' })
    expect(first).toHaveTextContent('KST')
    expect(first).toHaveTextContent('공개 예정')
    expect(first).toHaveTextContent('할 일 1개')
    // 개수 배지는 평평한 목록 수 그대로다
    expect(banner).toHaveTextContent('지금 확인할 일2')
    // 팀이 하나면 팀 표기를 화면에 띄우지 않는다(접근 가능한 이름에는 종전 설명이 남는다)
    expect(first.querySelector('[data-todo-team]')).toBeNull()
    expect(
      within(first).getByRole('link', {
        name: /정산 규칙 저장이 필요합니다 · 망원 규칙 공연 · 팀 #2/,
      }),
    ).toHaveAttribute('href', '/studio/performances/22/rules')
  })

  it('팀이 둘 이상이면 행에 팀 표기를 보인다', () => {
    render(
      <MemoryRouter>
        <HomeWithTodos
          teams={[leaderTeam, { ...leaderTeam, teamId: 3, teamName: '둘째 팀' }]}
          performances={[rulesShow]}
        />
      </MemoryRouter>,
    )
    const group = screen.getByRole('group', { name: '망원 규칙 공연' })
    expect(group.querySelector('[data-todo-team]')).toHaveTextContent('· 팀 #2')
  })
})
