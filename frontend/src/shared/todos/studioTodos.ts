/**
 * 스튜디오 할 일 — 공통 헤더 알림과 P-01 "지금 확인할 일"이 **함께 쓰는 단 하나의 규칙**.
 *
 * 정본 — 화면설계 v8 P-01 할 일 배너 · 공통 헤더 알림
 *        · API 명세 performance-06(`GET /api/v1/performances/me`)의 `pendingSignature`·
 *          `myParticipatingTeams[]`·`settlementStatus`·`myTeamSettlementApproved`
 *
 * 전에는 두 곳이 따로 계산했다 — 헤더는 전체 페이지·팀별 전개·정산 없음, 스튜디오 홈은
 * 현재 페이지·첫 팀만·정산 포함. 같은 회원에게 헤더 10, 홈 7이 떴다(9/24 dev).
 * 이 파일은 순수 함수만 둔다. 데이터를 모으는 쪽은 `shared/queries/studioTodos.ts`다.
 */

import type { MyPerformanceListItem } from '@/shared/api/domains/performance'
import { formatYoyo } from '@/shared/ui/format'

type Translate = (ko: string, en: string) => string

/** 순서가 곧 화면 표시 순서다(P-01 컴포넌트 표 순서 + 헤더 전용 TREASURY_IN) */
export const STUDIO_TODO_KINDS = [
  'invite',
  'rules',
  'deposit',
  'agree',
  'treasury',
  'aggregate',
  'lock',
  'settle-approve',
  'released',
] as const

export type StudioTodoKind = (typeof STUDIO_TODO_KINDS)[number]

export interface StudioTodo {
  /** `{kind}-{performanceId}-{teamId}` — 팀을 모르는 정산금 도착만 `released-{performanceId}` */
  id: string
  kind: StudioTodoKind
  /** 짧은 한 줄 — 헤더 알림의 굵은 줄, 홈 배너의 첫 줄 */
  title: string
  /** 보조 문구. 헤더는 쓰지 않는다 */
  note?: string
  /** `공연명 · 팀 #id` — 어느 공연·어느 팀의 일인지 */
  description: string
  to: string
  performanceId: number
  teamId?: number
  /**
   * 공연 메타 — performance-06 행의 `title`·`startAt`·`status`를 옮긴 **표시 전용** 값.
   * P-01 "지금 확인할 일"의 공연별 묶음 머리가 쓴다. 헤더 알림은 쓰지 않는다.
   * 정산금 도착처럼 목록에서 행을 찾지 못한 할 일에는 없다 — 지어내지 않는다.
   */
  performanceTitle?: string
  /** ISO-8601. 화면이 `formatKst`로 포맷한다 */
  performanceStartAt?: string
  performanceStatus?: NonNullable<MyPerformanceListItem['status']>
}

/** 헤더 알림·랩 미리보기가 그리는 최소 모양 */
export type StudioTodoLink = Pick<StudioTodo, 'id' | 'title' | 'description' | 'to'>

/**
 * 정산금 도착 알림의 재료. settlement-01 응답의 `myTeam.totalAmount`에서 온다.
 * 공연 목록(performance-06)에 금액이 없어 목록에서 파생할 수 없으므로 따로 받는다.
 */
export interface SettlementArrival {
  performanceId: number
  /** `myTeam.totalAmount` — YoYo 정수 */
  totalAmount: number
  teamId?: number
}

/** 팀 하나로 펼친 행. 판정은 모두 이 모양으로 한다 */
interface TeamRow {
  performanceId: number
  title: string
  startAt?: string
  status: NonNullable<MyPerformanceListItem['status']>
  settlementStatus?: string
  depositStatus?: MyPerformanceListItem['depositStatus']
  teamId: number
  host: boolean
  participationStatus?: MyPerformanceListItem['participationStatus']
  agreementStatus?: MyPerformanceListItem['myTeamAgreementStatus']
  pendingSignature?: MyPerformanceListItem['pendingSignature']
  settlementApproved?: boolean
}

/**
 * 행을 팀별로 펼친다. 한 회원이 두 팀을 이끌고 둘 다 같은 공연에 있으면 performance-06은 행을
 * 가르지 않고 `myParticipatingTeams`를 2개로 준다 — 평면 필드는 그 첫 항목일 뿐이다.
 * 배열이 없으면(구버전 응답) 평면 필드를 1팀으로 쓴다.
 */
function expandTeams(row: MyPerformanceListItem): TeamRow[] {
  if (row.performanceId == null || !row.title || !row.status) return []
  const shared = {
    performanceId: row.performanceId,
    title: row.title,
    startAt: row.startAt ?? undefined,
    status: row.status,
    settlementStatus: row.settlementStatus ?? undefined,
    depositStatus: row.depositStatus,
  }
  if (row.myParticipatingTeams?.length) {
    return row.myParticipatingTeams.flatMap((team) =>
      team.teamId == null
        ? []
        : [
            {
              ...shared,
              teamId: team.teamId,
              host: team.host,
              participationStatus: team.participationStatus,
              agreementStatus: team.agreementStatus,
              pendingSignature: team.pendingSignature,
              settlementApproved: team.settlementApproved,
            },
          ],
    )
  }
  if (row.teamId == null) return []
  return [
    {
      ...shared,
      teamId: row.teamId,
      host: row.host,
      participationStatus: row.participationStatus,
      agreementStatus: row.myTeamAgreementStatus,
      pendingSignature: row.pendingSignature,
      settlementApproved: row.myTeamSettlementApproved,
    },
  ]
}

function performanceMeta(
  r: TeamRow,
): Pick<StudioTodo, 'performanceTitle' | 'performanceStartAt' | 'performanceStatus'> {
  return { performanceTitle: r.title, performanceStartAt: r.startAt, performanceStatus: r.status }
}

const beforeSale = (r: TeamRow) => r.status === 'DRAFT' || r.status === 'PENDING_AGREEMENT'

/**
 * 한 팀 행에서 나오는 할 일. 조건은 서로 배타적이지만(pendingSignature는 팀당 한 값, 정산 단계는
 * 상태별) 하나만 고르지 않고 맞는 것을 모두 낸다 — 배타성이 깨져도 할 일을 숨기지 않는다.
 */
function todosOf(r: TeamRow, text: Translate): StudioTodo[] {
  const base = `/studio/performances/${r.performanceId}`
  const description = `${r.title} · ${text('팀', 'Team')} #${r.teamId}`
  const make = (kind: StudioTodoKind, title: string, to: string, note?: string): StudioTodo => ({
    id: `${kind}-${r.performanceId}-${r.teamId}`,
    kind,
    title,
    note,
    description,
    to,
    performanceId: r.performanceId,
    teamId: r.teamId,
    ...performanceMeta(r),
  })
  const out: StudioTodo[] = []
  const accepted = r.participationStatus === 'ACCEPTED'

  // 초대는 판매 전에만 받을 수 있다(ON_SALE 이후 초대는 409 ALREADY_ON_SALE)
  if (beforeSale(r) && r.participationStatus === 'INVITED') {
    out.push(
      make(
        'invite',
        text('공연 초대에 응답해 주세요', 'Respond to your show invitation'),
        `${base}/participants`,
        text('참여 여부를 확인해 주세요.', 'Review the invitation.'),
      ),
    )
  }

  // DRAFT = 규칙 미저장. 보증금 화면으로 보내면 409로 막히므로 규칙이 할 일이다
  if (r.host && accepted && r.status === 'DRAFT' && r.depositStatus === 'UNPAID') {
    out.push(
      make(
        'rules',
        text('정산 규칙 저장이 필요합니다', 'Settlement rules required'),
        `${base}/rules`,
      ),
    )
  }

  if (
    r.host &&
    accepted &&
    r.status === 'PENDING_AGREEMENT' &&
    r.pendingSignature === 'DEPOSIT' &&
    r.depositStatus === 'UNPAID'
  ) {
    out.push(
      make('deposit', text('보증금 납부가 필요합니다', 'Deposit payment required'), `${base}/edit`),
    )
  }

  // 팀별로 펼쳤으므로 동의 화면이 어느 팀으로 서명할지 알아야 한다 — `?teamId=`
  if (
    accepted &&
    r.status === 'PENDING_AGREEMENT' &&
    r.pendingSignature === 'AGREE' &&
    r.agreementStatus === 'PENDING'
  ) {
    out.push(
      make(
        'agree',
        text('규칙 동의가 필요합니다', 'Agreement required'),
        `${base}/agreements?teamId=${r.teamId}`,
        text(
          '동의 화면에서 대상 팀과 규칙을 확인한 뒤 지갑에서 서명합니다.',
          'Check the target team and rules on the agreement page before signing.',
        ),
      ),
    )
  }

  // openapi enum 에는 있지만 서버는 현재 내려주지 않는다(PerformanceService). 오면 숨기지 않는다
  if (r.pendingSignature === 'TREASURY_IN') {
    out.push(
      make('treasury', text('팀 지갑 준비가 필요합니다', 'Team wallet action required'), '/wallet'),
    )
  }

  // 정산 단계. 집계·잠금은 공연 생성 팀(주최)만 누른다(settlement-02·03).
  // 모르는 정산 상태 문자열은 NONE 으로 보지 않는다 — 새 상태에 "집계 확정"을 거짓으로 띄우지 않는다.
  const settle = `${base}/settlement`
  if (
    r.host &&
    r.status === 'ENDED' &&
    (r.settlementStatus == null || r.settlementStatus === 'NONE')
  ) {
    out.push(
      make(
        'aggregate',
        text('집계 확정이 필요합니다', 'Settlement tally required'),
        settle,
        text(
          '공연이 끝났습니다. 판매 결과를 확인하고 집계를 확정해 주세요.',
          'The show has ended. Review the sales and confirm the tally.',
        ),
      ),
    )
  }
  if (r.host && r.settlementStatus === 'AGGREGATED') {
    out.push(
      make(
        'lock',
        text('정산 잠금이 필요합니다', 'Settlement lock required'),
        settle,
        text(
          '집계가 확정됐습니다. 분배 금액을 확인한 뒤 정산을 잠가 주세요.',
          'The tally is confirmed. Check the payout amounts and lock the settlement.',
        ),
      ),
    )
  }
  // 동의 여부를 모르면(undefined) 띄우지 않는다 — 미동의로 단정하지 않는다
  if (
    accepted &&
    (r.settlementStatus === 'LOCKED' || r.settlementStatus === 'DISPUTE_OPEN') &&
    r.settlementApproved === false
  ) {
    out.push(
      make(
        'settle-approve',
        text('정산 동의가 필요합니다', 'Settlement approval required'),
        settle,
        text(
          '참여팀이 모두 동의하면 이의제기 기간 없이 정산금이 지급됩니다.',
          'Once every team approves, the payout is sent without waiting for the dispute period.',
        ),
      ),
    )
  }
  return out
}

/**
 * performance-06 행 + 정산금 도착 → 할 일 목록.
 *
 * 취소(`CANCELLED`)·정산 중단(`HALTED`) 공연은 어떤 할 일도 만들지 않는다 — 낼 보증금도,
 * 동의할 규칙도, 진행할 정산도 없다. 같은 id가 두 번 나오면(상태 전이 중 두 목록에 걸친 행)
 * 첫 것만 남긴다.
 */
export function collectStudioTodos(
  rows: readonly MyPerformanceListItem[],
  arrivals: readonly SettlementArrival[],
  text: Translate,
): StudioTodo[] {
  const teamRows = rows
    .flatMap(expandTeams)
    .filter((r) => r.status !== 'CANCELLED' && r.settlementStatus !== 'HALTED')

  const todos = teamRows.flatMap((r) => todosOf(r, text))

  for (const a of arrivals) {
    const row = teamRows.find((r) => r.performanceId === a.performanceId)
    const teamId = a.teamId ?? row?.teamId
    const performanceTitle = row?.title
    todos.push({
      id: teamId == null ? `released-${a.performanceId}` : `released-${a.performanceId}-${teamId}`,
      kind: 'released',
      title: text(
        `정산금 ${formatYoyo(a.totalAmount)}가 지갑에 도착했습니다`,
        `Payout ${formatYoyo(a.totalAmount)} arrived in your wallet`,
      ),
      // 수령 액션이 아니라 확인용이다(P-01 변경 요지 ②)
      note: text(
        '이미 지갑에 들어와 있습니다. 이후 별도 절차는 없습니다.',
        'The funds are already in your wallet. No further action is needed.',
      ),
      description: [
        performanceTitle,
        teamId == null ? undefined : `${text('팀', 'Team')} #${teamId}`,
      ]
        .filter(Boolean)
        .join(' · '),
      to: `/studio/performances/${a.performanceId}/settlement`,
      performanceId: a.performanceId,
      teamId,
      ...(row ? performanceMeta(row) : {}),
    })
  }

  const seen = new Set<string>()
  const unique = todos.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
  const order = (t: StudioTodo) => STUDIO_TODO_KINDS.indexOf(t.kind)
  // Array.prototype.sort 는 안정 정렬이다 — 같은 종류 안에서는 목록 순서(startAt 오름차순)가 유지된다
  return unique.sort((a, b) => order(a) - order(b))
}

/* ── 공연별 묶음 — P-01 "지금 확인할 일" 표시 전용 ─────────────────────────── */

/** 한 공연의 할 일 묶음. 메타는 묶음 첫 할 일에서 온다(같은 공연이면 같은 행에서 나왔다) */
export interface StudioTodoGroup {
  performanceId: number
  title?: string
  startAt?: string
  status?: StudioTodo['performanceStatus']
  /** 종류 순서(STUDIO_TODO_KINDS) 그대로 */
  todos: StudioTodo[]
}

/**
 * 평평한 할 일 목록을 공연별로 묶는다. **표시 계층 전용**이다 — 할 일의 개수·id·내용은 바꾸지
 * 않으므로 묶음들의 할 일 수 합 = 입력 길이다. 헤더 알림은 이 함수를 쓰지 않는다.
 *
 * 묶음 순서: 묶음 안 가장 앞선 종류(STUDIO_TODO_KINDS) → 공연 시작 시각 오름차순(시각을 모르면 뒤)
 *           → performanceId 오름차순(완전 결정적이게).
 * 묶음 안 순서: 종류 순서. 같은 종류는 입력 순서(안정 정렬).
 */
export function groupTodosByPerformance(todos: readonly StudioTodo[]): StudioTodoGroup[] {
  const kindIndex = (t: StudioTodo) => STUDIO_TODO_KINDS.indexOf(t.kind)
  const byId = new Map<number, StudioTodoGroup>()
  for (const t of todos) {
    let group = byId.get(t.performanceId)
    if (!group) {
      group = { performanceId: t.performanceId, todos: [] }
      byId.set(t.performanceId, group)
    }
    // 메타가 빠진 할 일(정산금 도착)이 먼저 와도 뒤의 할 일이 채운다
    group.title ??= t.performanceTitle
    group.startAt ??= t.performanceStartAt
    group.status ??= t.performanceStatus
    group.todos.push(t)
  }
  const groups = [...byId.values()]
  for (const g of groups) g.todos.sort((a, b) => kindIndex(a) - kindIndex(b))
  const firstKind = (g: StudioTodoGroup) => Math.min(...g.todos.map(kindIndex))
  const time = (g: StudioTodoGroup) => {
    const ms = g.startAt ? Date.parse(g.startAt) : NaN
    return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms
  }
  return groups.sort((a, b) => {
    const byKind = firstKind(a) - firstKind(b)
    if (byKind !== 0) return byKind
    const ta = time(a)
    const tb = time(b)
    if (ta !== tb) return ta < tb ? -1 : 1
    return a.performanceId - b.performanceId
  })
}

/** 한 페이지에 보이는 묶음 조각 */
export interface StudioTodoPageGroup extends StudioTodoGroup {
  /** 이 조각이 앞 페이지에서 이어진다 — 머리에 "(이어서)"를 붙인다 */
  continued: boolean
  /** 묶음 전체 할 일 수(이 페이지 조각이 아니라). 머리의 개수는 이것이다 */
  total: number
}

export interface StudioTodoPage {
  groups: StudioTodoPageGroup[]
  /** 범위 밖 요청을 1..pageCount 로 당긴 실제 페이지(1부터) */
  page: number
  /** 최소 1 */
  pageCount: number
}

/**
 * 묶음 목록을 **할 일 행 `size`개** 기준으로 자른다(묶음 단위가 아니다). 한 묶음이 페이지 경계에서
 * 잘리면 다음 페이지 첫머리에 같은 묶음 머리를 다시 두고 `continued=true`로 표시한다.
 * 순서는 입력 묶음 순서 그대로 — 페이지를 이어 붙이면 `groups.flatMap(g => g.todos)`와 같다.
 */
export function pageTodoGroups(
  groups: readonly StudioTodoGroup[],
  page: number,
  size: number,
): StudioTodoPage {
  const rows = groups.flatMap((group) => group.todos.map((todo, index) => ({ group, todo, index })))
  const pageCount = Math.max(1, Math.ceil(rows.length / size))
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pageCount)
  const slice = rows.slice((current - 1) * size, current * size)
  const out: StudioTodoPageGroup[] = []
  for (const { group, todo, index } of slice) {
    const last = out[out.length - 1]
    if (last && last.performanceId === group.performanceId) {
      last.todos.push(todo)
      continue
    }
    out.push({
      performanceId: group.performanceId,
      title: group.title,
      startAt: group.startAt,
      status: group.status,
      todos: [todo],
      continued: index > 0,
      total: group.todos.length,
    })
  }
  return { groups: out, page: current, pageCount }
}
