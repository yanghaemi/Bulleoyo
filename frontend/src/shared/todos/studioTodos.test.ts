import { describe, expect, it } from 'vitest'

import type { MyPerformanceListItem } from '@/shared/api/domains/performance'
import {
  collectStudioTodos,
  groupTodosByPerformance,
  pageTodoGroups,
  type StudioTodo,
  type StudioTodoKind,
} from './studioTodos'

const ko = (k: string) => k

const row = (over: Partial<MyPerformanceListItem> = {}): MyPerformanceListItem => ({
  performanceId: 7,
  title: '서울 인디 나이트',
  status: 'DRAFT',
  depositStatus: 'UNPAID',
  teamId: 11,
  host: true,
  participationStatus: 'ACCEPTED',
  myTeamAgreementStatus: 'PENDING',
  pendingSignature: null,
  ...over,
})

const kinds = (rows: MyPerformanceListItem[]) => collectStudioTodos(rows, [], ko).map((t) => t.kind)

describe('collectStudioTodos — kind 조건', () => {
  it.each<[string, Partial<MyPerformanceListItem>, StudioTodoKind[], string?]>([
    [
      '초대(DRAFT)',
      { host: false, participationStatus: 'INVITED' },
      ['invite'],
      '/studio/performances/7/participants',
    ],
    [
      '초대(PENDING_AGREEMENT)',
      { status: 'PENDING_AGREEMENT', host: false, participationStatus: 'INVITED' },
      ['invite'],
    ],
    [
      '초대는 판매 시작 뒤 없다',
      { status: 'ON_SALE', host: false, participationStatus: 'INVITED' },
      [],
    ],
    ['주최 DRAFT 미납 → 규칙', {}, ['rules'], '/studio/performances/7/rules'],
    ['주최 DRAFT 에 DEPOSIT 가 와도 규칙 먼저', { pendingSignature: 'DEPOSIT' }, ['rules']],
    ['참여팀 DRAFT 는 규칙 없음', { host: false }, []],
    [
      '보증금',
      { status: 'PENDING_AGREEMENT', pendingSignature: 'DEPOSIT' },
      ['deposit'],
      '/studio/performances/7/edit',
    ],
    [
      '보증금 납부 완료',
      { status: 'PENDING_AGREEMENT', pendingSignature: 'DEPOSIT', depositStatus: 'PAID' },
      [],
    ],
    [
      '참여팀에는 보증금 없음',
      { status: 'PENDING_AGREEMENT', host: false, pendingSignature: 'DEPOSIT' },
      [],
    ],
    [
      '규칙 동의',
      { status: 'PENDING_AGREEMENT', host: false, pendingSignature: 'AGREE' },
      ['agree'],
      '/studio/performances/7/agreements?teamId=11',
    ],
    [
      '동의 서명 중(SIGNING)은 없음',
      { status: 'PENDING_AGREEMENT', pendingSignature: 'AGREE', myTeamAgreementStatus: 'SIGNING' },
      [],
    ],
    ['DRAFT 에는 동의 없음', { host: false, pendingSignature: 'AGREE' }, []],
    [
      'TREASURY_IN',
      { status: 'PENDING_AGREEMENT', host: false, pendingSignature: 'TREASURY_IN' },
      ['treasury'],
      '/wallet',
    ],
    [
      '집계 확정(NONE)',
      { status: 'ENDED', depositStatus: 'RETURNED', settlementStatus: 'NONE' },
      ['aggregate'],
      '/studio/performances/7/settlement',
    ],
    ['집계 확정(정산 상태 없음)', { status: 'ENDED', depositStatus: 'RETURNED' }, ['aggregate']],
    [
      '모르는 정산 상태는 집계 확정으로 보지 않는다',
      { status: 'ENDED', depositStatus: 'RETURNED', settlementStatus: 'FUTURE_STATE' },
      [],
    ],
    ['참여팀에는 집계 없음', { status: 'ENDED', host: false, settlementStatus: 'NONE' }, []],
    [
      '정산 잠금',
      { status: 'ENDED', settlementStatus: 'AGGREGATED' },
      ['lock'],
      '/studio/performances/7/settlement',
    ],
    ['참여팀에는 잠금 없음', { status: 'ENDED', host: false, settlementStatus: 'AGGREGATED' }, []],
    [
      '정산 동의(LOCKED)',
      { status: 'ENDED', host: false, settlementStatus: 'LOCKED', myTeamSettlementApproved: false },
      ['settle-approve'],
    ],
    [
      '정산 동의(DISPUTE_OPEN)',
      { status: 'ENDED', settlementStatus: 'DISPUTE_OPEN', myTeamSettlementApproved: false },
      ['settle-approve'],
    ],
    ['정산 동의 여부 undefined → 미표시', { status: 'ENDED', settlementStatus: 'LOCKED' }, []],
    [
      '이미 정산 동의',
      { status: 'ENDED', settlementStatus: 'LOCKED', myTeamSettlementApproved: true },
      [],
    ],
    [
      '지급 완료',
      { status: 'ENDED', settlementStatus: 'RELEASED', myTeamSettlementApproved: false },
      [],
    ],
    ['판매 중에는 할 일 없음', { status: 'ON_SALE', depositStatus: 'PAID' }, []],
  ])('%s', (_name, over, expected, to) => {
    const todos = collectStudioTodos([row(over)], [], ko)
    expect(todos.map((t) => t.kind)).toEqual(expected)
    if (to) expect(todos[0].to).toBe(to)
  })

  it.each<Partial<MyPerformanceListItem>>([
    { status: 'CANCELLED', pendingSignature: 'DEPOSIT' },
    { status: 'CANCELLED', host: false, participationStatus: 'INVITED' },
    { status: 'CANCELLED', settlementStatus: 'NONE' },
    { status: 'ENDED', settlementStatus: 'HALTED', myTeamSettlementApproved: false },
    { status: 'PENDING_AGREEMENT', settlementStatus: 'HALTED', pendingSignature: 'TREASURY_IN' },
  ])('취소·정산 중단은 어떤 할 일도 만들지 않는다 %o', (over) => {
    expect(kinds([row(over)])).toEqual([])
  })
})

describe('collectStudioTodos — 팀별 전개', () => {
  it('한 공연에서 내가 이끄는 두 팀이 모두 미동의면 동의가 2개다', () => {
    const todos = collectStudioTodos(
      [
        row({
          performanceId: 30,
          title: '두 팀의 합동 공연',
          status: 'PENDING_AGREEMENT',
          teamId: 31,
          host: false,
          pendingSignature: 'AGREE',
          myParticipatingTeams: [
            {
              teamId: 31,
              host: false,
              participationStatus: 'ACCEPTED',
              agreementStatus: 'PENDING',
              pendingSignature: 'AGREE',
            },
            {
              teamId: 32,
              host: false,
              participationStatus: 'ACCEPTED',
              agreementStatus: 'PENDING',
              pendingSignature: 'AGREE',
            },
          ],
        }),
      ],
      [],
      ko,
    )
    expect(todos.map((t) => [t.id, t.description, t.to])).toEqual([
      ['agree-30-31', '두 팀의 합동 공연 · 팀 #31', '/studio/performances/30/agreements?teamId=31'],
      ['agree-30-32', '두 팀의 합동 공연 · 팀 #32', '/studio/performances/30/agreements?teamId=32'],
    ])
  })

  it('평면 필드가 아니라 팀 배열의 값으로 판정한다 — 두 번째 팀의 동의·정산 동의를 놓치지 않는다', () => {
    const todos = collectStudioTodos(
      [
        row({
          performanceId: 40,
          status: 'ENDED',
          settlementStatus: 'LOCKED',
          teamId: 41,
          host: true,
          myTeamSettlementApproved: true,
          myParticipatingTeams: [
            { teamId: 41, host: true, participationStatus: 'ACCEPTED', settlementApproved: true },
            { teamId: 42, host: false, participationStatus: 'ACCEPTED', settlementApproved: false },
            { teamId: 43, host: false, participationStatus: 'ACCEPTED' },
          ],
        }),
      ],
      [],
      ko,
    )
    expect(todos.map((t) => t.id)).toEqual(['settle-approve-40-42'])
  })

  it('집계·잠금은 주최 팀 하나에만 뜬다', () => {
    const todos = collectStudioTodos(
      [
        row({
          performanceId: 50,
          status: 'ENDED',
          settlementStatus: 'AGGREGATED',
          myParticipatingTeams: [
            { teamId: 51, host: true, participationStatus: 'ACCEPTED' },
            { teamId: 52, host: false, participationStatus: 'ACCEPTED' },
          ],
        }),
      ],
      [],
      ko,
    )
    expect(todos.map((t) => t.id)).toEqual(['lock-50-51'])
  })
})

describe('collectStudioTodos — id·순서·정산금 도착', () => {
  const mixed = [
    row({ performanceId: 1, status: 'ENDED', settlementStatus: 'NONE' }),
    row({ performanceId: 2, status: 'PENDING_AGREEMENT', host: false, pendingSignature: 'AGREE' }),
    row({ performanceId: 3, host: false, participationStatus: 'INVITED' }),
    row({ performanceId: 4 }),
    // 상태 전이 중 두 목록에 걸친 같은 행
    row({ performanceId: 4 }),
  ]

  it('id 는 {kind}-{performanceId}-{teamId} 이고 중복이 없다', () => {
    const todos = collectStudioTodos(mixed, [], ko)
    const ids = todos.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of todos) expect(t.id).toBe(`${t.kind}-${t.performanceId}-${t.teamId}`)
  })

  it('종류 순서(초대 → 규칙 → … → 정산)로 정렬한다', () => {
    expect(kinds(mixed)).toEqual(['invite', 'rules', 'agree', 'aggregate'])
  })

  it('정산금 도착은 맨 뒤에 붙고 공연명을 설명에 쓴다', () => {
    const todos = collectStudioTodos(
      [
        row({
          performanceId: 9,
          title: '망원 어쿠스틱',
          status: 'ENDED',
          settlementStatus: 'RELEASED',
        }),
      ],
      [{ performanceId: 9, totalAmount: 120000 }],
      ko,
    )
    expect(todos).toHaveLength(1)
    expect(todos[0]).toMatchObject({
      id: 'released-9-11',
      kind: 'released',
      title: '정산금 120,000 YoYo가 지갑에 도착했습니다',
      description: '망원 어쿠스틱 · 팀 #11',
      to: '/studio/performances/9/settlement',
    })
  })

  it('식별자가 없는 행은 추측하지 않는다', () => {
    expect(kinds([{ host: false, title: '식별자 없음' }, row({ teamId: undefined })])).toEqual([])
  })
})

describe('collectStudioTodos — 공연 메타', () => {
  it('할 일에 공연명·시작 시각·상태를 옮기고 기존 필드는 그대로 둔다', () => {
    const [todo] = collectStudioTodos([row({ startAt: '2026-10-01T19:00:00+09:00' })], [], ko)
    expect(todo).toMatchObject({
      id: 'rules-7-11',
      description: '서울 인디 나이트 · 팀 #11',
      performanceTitle: '서울 인디 나이트',
      performanceStartAt: '2026-10-01T19:00:00+09:00',
      performanceStatus: 'DRAFT',
    })
  })

  it('목록에 없는 공연의 정산금 도착에는 메타를 지어내지 않는다', () => {
    const [todo] = collectStudioTodos([], [{ performanceId: 99, totalAmount: 1000 }], ko)
    expect(todo.performanceTitle).toBeUndefined()
    expect(todo.performanceStartAt).toBeUndefined()
    expect(todo.performanceStatus).toBeUndefined()
  })
})

describe('groupTodosByPerformance', () => {
  const rows: MyPerformanceListItem[] = [
    // 공연 1 — 규칙(rules), 가장 늦게 시작(invite 공연 제외)
    row({ performanceId: 1, title: '늦은 공연', startAt: '2026-10-09T19:00:00+09:00' }),
    // 공연 2 — 두 팀 동의(agree ×2), 가장 일찍 시작
    row({
      performanceId: 2,
      title: '합동 공연',
      status: 'PENDING_AGREEMENT',
      startAt: '2026-10-01T19:00:00+09:00',
      myParticipatingTeams: [
        {
          teamId: 21,
          host: false,
          participationStatus: 'ACCEPTED',
          agreementStatus: 'PENDING',
          pendingSignature: 'AGREE',
        },
        {
          teamId: 22,
          host: false,
          participationStatus: 'ACCEPTED',
          agreementStatus: 'PENDING',
          pendingSignature: 'AGREE',
        },
      ],
    }),
    // 공연 3 — 규칙(rules), 공연 1보다 일찍 시작 → 같은 종류면 시작 시각 순
    row({ performanceId: 3, title: '이른 규칙 공연', startAt: '2026-10-05T19:00:00+09:00' }),
    // 공연 4 — 초대(invite) + 다른 팀 규칙(rules): 한 공연에 종류가 둘
    row({
      performanceId: 4,
      title: '초대 공연',
      startAt: '2026-10-20T19:00:00+09:00',
      myParticipatingTeams: [
        { teamId: 41, host: true, participationStatus: 'ACCEPTED', agreementStatus: 'PENDING' },
        { teamId: 42, host: false, participationStatus: 'INVITED', agreementStatus: 'PENDING' },
      ],
    }),
  ]
  const flat = collectStudioTodos(rows, [], ko)
  const groups = groupTodosByPerformance(flat)

  it('공연별로 묶고 머리에 공연명·시각·상태를 싣는다', () => {
    expect(groups).toHaveLength(4)
    expect(groups[0]).toMatchObject({
      performanceId: 4,
      title: '초대 공연',
      startAt: '2026-10-20T19:00:00+09:00',
      status: 'DRAFT',
    })
  })

  it('묶음 순서 — 가장 앞선 종류가 먼저, 같으면 시작 시각 오름차순', () => {
    // 공연 4는 invite를 가져 맨 앞(시각은 가장 늦어도), 3·1은 rules끼리 시각 순, 2는 agree
    expect(groups.map((g) => g.performanceId)).toEqual([4, 3, 1, 2])
  })

  it('묶음 안 순서는 종류 순서다', () => {
    expect(groups[0].todos.map((t) => t.id)).toEqual(['invite-4-42', 'rules-4-41'])
    expect(groups[3].todos.map((t) => t.id)).toEqual(['agree-2-21', 'agree-2-22'])
  })

  it('할 일 수 합 = 평평한 목록 수이고 id 집합이 같다(묶기는 표시 전용)', () => {
    const grouped = groups.flatMap((g) => g.todos)
    expect(grouped).toHaveLength(flat.length)
    expect(new Set(grouped.map((t) => t.id))).toEqual(new Set(flat.map((t) => t.id)))
  })

  it('시작 시각을 모르는 공연은 같은 종류 안에서 뒤로, 그다음 performanceId 순', () => {
    const noTime = collectStudioTodos(
      [
        row({ performanceId: 9, title: '시각 없음 B' }),
        row({ performanceId: 8, title: '시각 없음 A' }),
        row({ performanceId: 5, title: '시각 있음', startAt: '2026-12-01T19:00:00+09:00' }),
      ],
      [],
      ko,
    )
    expect(groupTodosByPerformance(noTime).map((g) => g.performanceId)).toEqual([5, 8, 9])
  })

  it('메타 없는 정산금 도착이 먼저 와도 같은 공연의 다른 할 일이 머리를 채운다', () => {
    const [released] = collectStudioTodos([], [{ performanceId: 1, totalAmount: 500 }], ko)
    const [rules] = collectStudioTodos([rows[0]], [], ko)
    const [group] = groupTodosByPerformance([released, rules])
    expect(group.title).toBe('늦은 공연')
    expect(group.todos.map((t) => t.kind)).toEqual(['rules', 'released'])
  })

  it('입력 배열을 바꾸지 않는다', () => {
    const copy = flat.map((t) => t.id)
    groupTodosByPerformance(flat)
    expect(flat.map((t) => t.id)).toEqual(copy)
  })

  it('빈 목록은 빈 묶음', () => {
    expect(groupTodosByPerformance([])).toEqual([])
  })
})

describe('pageTodoGroups — 할 일 행 10개씩', () => {
  /** 공연 performanceId에 할 일 n개. 종류는 모두 agree라 묶음 안 순서는 입력 순서다 */
  const todosOf = (performanceId: number, n: number): StudioTodo[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `agree-${performanceId}-${i + 1}`,
      kind: 'agree' as const,
      title: '규칙 동의가 필요합니다',
      description: `공연 ${performanceId} · 팀 #${i + 1}`,
      to: `/studio/performances/${performanceId}/agreements?teamId=${i + 1}`,
      performanceId,
      teamId: i + 1,
      performanceTitle: `공연 ${performanceId}`,
      performanceStartAt: `2026-10-${String(performanceId).padStart(2, '0')}T19:00:00+09:00`,
      performanceStatus: 'PENDING_AGREEMENT' as const,
    }))
  const groupsOf = (...sizes: number[]) =>
    groupTodosByPerformance(sizes.flatMap((n, i) => todosOf(i + 1, n)))
  const count = (page: ReturnType<typeof pageTodoGroups>) =>
    page.groups.reduce((sum, g) => sum + g.todos.length, 0)

  it('10개는 1페이지에 다 들어간다', () => {
    const page = pageTodoGroups(groupsOf(4, 6), 1, 10)
    expect(page.pageCount).toBe(1)
    expect(count(page)).toBe(10)
    expect(page.groups.every((g) => !g.continued)).toBe(true)
  })

  it('11개는 2페이지 — 경계에서 잘린 묶음은 다음 페이지 첫머리에 (이어서)로 다시 나온다', () => {
    const groups = groupsOf(4, 7) // 공연1 4개 + 공연2 7개 → 공연2가 6/1로 갈린다
    const first = pageTodoGroups(groups, 1, 10)
    const second = pageTodoGroups(groups, 2, 10)
    expect(first.pageCount).toBe(2)
    expect(first.groups.map((g) => [g.performanceId, g.todos.length, g.continued])).toEqual([
      [1, 4, false],
      [2, 6, false],
    ])
    expect(second.groups.map((g) => [g.performanceId, g.todos.length, g.continued])).toEqual([
      [2, 1, true],
    ])
    // 머리의 개수는 묶음 전체 수다
    expect(second.groups[0]).toMatchObject({ total: 7, title: '공연 2' })
  })

  it('21개는 3페이지이고 마지막 페이지는 1개, 이어 붙이면 원래 순서다', () => {
    const groups = groupsOf(3, 15, 3) // 공연2가 1·2페이지에 걸친다
    const pages = [1, 2, 3].map((p) => pageTodoGroups(groups, p, 10))
    expect(pages[0].pageCount).toBe(3)
    expect(pages.map(count)).toEqual([10, 10, 1])
    expect(pages[1].groups.map((g) => [g.performanceId, g.continued])).toEqual([
      [2, true],
      [3, false],
    ])
    expect(pages[2].groups.map((g) => [g.performanceId, g.continued])).toEqual([[3, true]])
    const joined = pages.flatMap((p) => p.groups.flatMap((g) => g.todos.map((t) => t.id)))
    expect(joined).toEqual(groups.flatMap((g) => g.todos.map((t) => t.id)))
  })

  it('범위 밖 페이지는 1..pageCount 로 당긴다', () => {
    const groups = groupsOf(11)
    expect(pageTodoGroups(groups, 0, 10).page).toBe(1)
    expect(pageTodoGroups(groups, 99, 10).page).toBe(2)
    expect(pageTodoGroups(groups, Number.NaN, 10).page).toBe(1)
  })

  it('빈 목록은 1페이지짜리 빈 페이지', () => {
    expect(pageTodoGroups([], 1, 10)).toEqual({ groups: [], page: 1, pageCount: 1 })
  })
})
