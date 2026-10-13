/**
 * P-01 공연자 대시보드.
 *
 * 정본 — 화면설계 v6 §4 P-01(영역 구성·레이아웃·컴포넌트 표·상태)
 *        · §5.10 잔액 패널 · §5.19 액션 버튼 배치 · §5.21 표 → 패널 접기 · §5.1 상태 배지
 *        · API 명세 v6 team-02(`GET /api/v1/teams/me`) · performance-06(`GET /api/v1/performances/me`)
 *          · wallet-01(`GET /api/v1/wallets/me`) · settlement-01(`GET …/settlement`)
 *
 * 본문 순서 — 지갑 미등록 배너 → 요약 타일 3개(= 탭) → 고른 탭의 패널 하나.
 * 패널은 확인할 일(공연별 묶음) / 참여 공연(표) / 내 팀(목록·팀 잔액)이다. 종전에는 세 영역을
 * 세로로 쌓아 참여 공연 표를 보려면 한참 스크롤해야 했다(9/24 요청 — 화면설계 v8.7 P-01).
 * 새 공연 만들기 버튼은 PC 본문 상단 오른쪽, 모바일은 하단 고정 하나뿐이다(§5.19).
 *
 * 두 폭에서 참여 공연 목록의 **열 순서가 같다** — 공연명 → 공연 상태 → 정산 상태 → 보증금 상태.
 * PC 표에서 왼쪽에 있던 값이 모바일 패널에서도 위에 온다(§5.21). 두 폭을 오가며 보는 사람이
 * 같은 순서를 기억할 수 있어야 한다.
 *
 * 이 화면에는 **관객 하단 탭바가 없다**(§5.18은 관객 탭 4개다). 껍데기는 `StudioShell`이 맡는다.
 *
 * ⚠ P-01 영역 구성에는 "정산 진행 요약"이 함께 적혀 있는데 **컴포넌트 표에는 그 항목이 없다.**
 * 표에 있는 것만 만들었고, 정산 진행은 참여 공연 표의 **정산 상태 배지 열**과 할 일 배너의
 * 도착 알림이 대신한다. 별도 요약 패널이 필요하면 명세에 컴포넌트 행을 먼저 추가해야 한다.
 */

import { useCallback, useId, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import {
  BalancePanel,
  Button,
  ConfirmDialog,
  DepositStatusBadge,
  FixedBottom,
  InfoRow,
  Pagination,
  ProviderBadge,
  SettlementStatusBadge,
  StatusBadge,
  formatKst,
} from '@/shared/ui'
import type { DepositStatus, SettlementStatus, WalletProvider } from '@/shared/ui'
import { SHOW_STATUS } from '@/features/studio/showStatus'
import type { PerformanceStatus } from '@/features/studio/showStatus'
import { studioFailureText } from '@/features/studio/studioErrors'
import {
  DEPOSIT_FILTER_VALUES,
  PERFORMANCE_FILTER_PARAMS,
  SETTLEMENT_FILTER_VALUES,
  SHOW_FILTER_VALUES,
  STUDIO_PAGE_PARAM,
  STUDIO_PAGE_SIZE,
  STUDIO_VIEW_PARAM,
  filterPerformances,
  hasPerformanceFilter,
  paginate,
  parsePerformanceFilters,
  parseStudioPage,
  resolveStudioView,
  type PerformanceFilterKey,
  type PerformanceFilters,
  type StudioView,
} from '@/features/studio/studioView'
import { useLocale } from '@/shared/i18n/useLocale'
import {
  DEPOSIT_STATUS_LABEL,
  SETTLEMENT_STATUS_LABEL,
  SHOW_STATUS_LABEL,
  type StatusLabel,
} from '@/shared/ui/statusLabels'
import {
  groupTodosByPerformance,
  pageTodoGroups,
  type StudioTodo,
} from '@/shared/todos/studioTodos'

import './studio-refresh.css'
import { PageSkeleton } from '@/shared/ui/PageSkeleton'

/* ── 타입: API v6 응답 스키마에서 필드 이름을 그대로 옮겼다 ──────────────── */

/** 공연 상태와 배지 매핑은 P-07과 공유한다 — `showStatus.ts` */
export type { PerformanceStatus } from '@/features/studio/showStatus'

/** `TeamListItem`(team-02) — teamId·teamName·genre·leader·walletAddress·balanceAmount */
export interface StudioTeam {
  teamId: number
  teamName: string
  genre?: string
  leader: boolean
  /**
   * 리더 지갑 주소. `leader_member_id → wallet`으로 파생한 값이라 team 테이블에는 없다(team-03 설명).
   * ⚠ 스키마에 nullable 표기가 없지만 **리더가 지갑을 등록하지 않았으면 줄 값이 없다.**
   * P-01의 "리더 지갑 등록 배지(등록됨/미등록)"가 성립하려면 미등록을 표현할 수단이 필요해
   * `null`을 허용했다. 서버가 필드를 생략하는 쪽으로 확정되면 `?`로 바꾼다.
   */
  walletAddress: string | null
  /**
   * `Money` — YoYo 정수, decimals 0.
   * **없을 수 있다** — 리더가 지갑을 등록하지 않았거나 노드 장애로 잔액을 못 읽으면 서버가
   * 이 필드를 주지 못한다. `walletAddress`를 `null` 허용으로 둔 것과 같은 이유다.
   * 0 으로 채우지 않는다 — "잔액 0원"과 "모름"은 다른 상태다(§5.10).
   */
  balanceAmount?: number
}

/** `MyPerformanceListItem`(performance-06) */
export interface StudioPerformance {
  performanceId: number
  title: string
  /**
   * `startAt`을 화면 문자열로 만든 값. 서버가 준 ISO를 페이지에서 포맷한다.
   * ⚠ P-01 컴포넌트 표의 "표시 데이터"에는 일시가 없다. 그런데 §5.13은 "시각이 나오는 모든 곳"에
   * KST를 병기하라 했고 응답에는 `startAt`이 있다. **열을 늘리지 않고** 식별자 열(공연명) 안의
   * 보조 줄로만 넣었다 — 열 개수·열 순서는 명세 그대로다.
   */
  startAtLabel?: string
  status: PerformanceStatus
  /**
   * ⚠ **`undefined`는 "모른다"다.** 응답의 이 필드는 생성 타입에서 넓은 `string`이라
   * 상위가 아는 값인지 좁힌 뒤 넘긴다. 모르는 값이 와도 **행을 버리지 않는다** —
   * 서버가 상태를 하나 추가하면 그 공연이 대시보드에서 통째로 사라지고 보증금·동의 할 일까지
   * 같이 사라진다. 배지 자리만 비운다.
   */
  settlementStatus?: SettlementStatus
  depositStatus: DepositStatus
  teamId: number
  host: boolean
  participationStatus: 'INVITED' | 'ACCEPTED'
  myTeamAgreementStatus: 'PENDING' | 'SIGNING' | 'AGREED'
  /** 이 회원이 지금 서명해야 하는 작업, 또는 null(performance-06 설명) */
  pendingSignature: 'DEPOSIT' | 'AGREE' | 'TREASURY_IN' | null
  /**
   * 내 팀의 정산 조기 동의(settlement-08) 여부(performance-06 `myTeamSettlementApproved`).
   * ⚠ **`undefined`는 "모른다"다** — 정산 행이나 내 팀 몫이 아직 없으면 서버가 키를 뺀다.
   * `false`로 채우지 않는다. 모르는 값을 미동의로 보면 "정산 동의가 필요합니다"가 거짓으로 뜬다.
   */
  myTeamSettlementApproved?: boolean
}

/** `WalletMe`(wallet-01)에서 이 화면이 쓰는 것만. `undefined`면 **지갑 미등록**이다 */
export interface StudioWallet {
  address: string
  provider: WalletProvider
  status: 'LINKED' | 'SUSPENDED'
  /** `balance.amount`. 조회 실패면 undefined — 패널이 `—`로 그린다(§5.10) */
  balanceKrw?: number
  /** `balance.display`를 서버 문구 그대로. 클라이언트가 환율을 재계산하지 않는다(§5.4) */
  approxLabel?: string
  /** `cachedAt`을 화면 문자열로 */
  updatedAtLabel?: string
}

/* ── 상태값 → 화면 매핑 ───────────────────────────────────────────────── */

/**
 * 정산 화면(P-08)이 의미를 갖는 시점인가.
 *
 * 종료·취소된 공연은 정산이 아직 `NONE`이어도 P-08이 할 일(집계 확정·중단 사유·환불 진행률)을
 * 갖는다. {@code manageRoute}와 목록의 `정산` 링크가 **같은 판단**을 써야 한다 — 갈라지면
 * 제목은 정산으로 가는데 링크 줄에는 정산이 없는 지금 상태가 된다(S15P21B204).
 */
function hasSettlementScreen(p: StudioPerformance): boolean {
  // 모르면 정산이 시작됐다고 단정하지 않는다 — 상태로 판단한다
  if (p.settlementStatus != null && p.settlementStatus !== 'NONE') return true
  return p.status === 'ENDED' || p.status === 'CANCELLED'
}

/** 삭제 요청 결과 — `ParticipantManage`의 `{ ok, code, msg }`와 같은 모양이다 */
export interface PerformanceActionResult {
  ok: boolean
  /** 실패 코드. `code`로만 분기한다 */
  code?: string
  msg?: string
}

/**
 * 이 공연을 지울 수 있는가 — 서버 판정(API-performance-18)과 **같은 조건**이다.
 *
 * 생성자만, **규칙 동의 전**(`DRAFT`·`PENDING_AGREEMENT`)만, 보증금이 아직 없을 때만이다.
 * 판매가 열린 뒤에는 이미 팔린 표가 있어 삭제가 아니라 공연 취소(P-10)가 맞고, 보증금을 낸
 * 공연을 지우면 에스크로에 잠긴 코인을 돌려받을 주인이 사라진다.
 *
 * 서버가 같은 것을 다시 판정하므로 여기 조건이 느슨해도 요청은 409로 막힌다 — 이 함수는
 * **누르지 못할 버튼을 보여 주지 않기 위한 것**이지 방어선이 아니다.
 */
function deletable(p: StudioPerformance): boolean {
  if (!p.host || p.participationStatus !== 'ACCEPTED') return false
  if (p.status !== 'DRAFT' && p.status !== 'PENDING_AGREEMENT') return false
  return p.depositStatus === 'UNPAID'
}

/**
 * 공연 행을 눌렀을 때 갈 곳.
 *
 * P-01 표는 "해당 공연 관리 화면(P-03~P-08) 이동"이라고만 적었고 **어느 화면인지는 정하지 않았다.**
 * ⚠ 아래 대응은 임의 결정이다 — 그 공연에서 지금 할 일이 있는 화면으로 보낸다.
 * 정산이 시작된 뒤에는(집계 확정 이상) 무엇을 하든 정산이 관심사이므로 P-08이 우선한다.
 */
function manageRoute(p: StudioPerformance): string {
  const base = `/studio/performances/${p.performanceId}`
  if (p.participationStatus === 'INVITED') return `${base}/participants`
  if (hasSettlementScreen(p)) return `${base}/settlement` // P-08
  switch (p.status) {
    case 'DRAFT':
      // 규칙이 아직 없다는 뜻이다 — 규칙을 저장해야 `PENDING_AGREEMENT` 로 간다(RuleService).
      // 보증금은 규칙 뒤에야 낼 수 있으므로(createShow 가 rulesHash 를 요구한다) P-03 으로
      // 보내면 409 `정산 규칙을 먼저 저장해야…` 에서 막힌다. 할 일은 규칙이다.
      return `${base}/${p.host ? 'rules' : 'participants'}`
    case 'PENDING_AGREEMENT':
      return `${base}/agreements` // P-06 — 규칙 동의·판매 시작
    case 'ON_SALE':
    case 'SALE_CLOSED':
      return `${base}/sales` // P-07 — 판매·선택 현황
    default:
      return `${base}/sales`
  }
}

/* ── 할 일 배너 ───────────────────────────────────────────────────────── */

/**
 * 할 일 배너. 목록은 헤더 알림과 **같은 훅·같은 규칙**이다(`shared/queries/studioTodos`).
 *
 * 화면에는 **공연별로 묶어** 그린다(`groupTodosByPerformance`). 묶기는 표시 전용이라 개수·id는
 * 헤더와 같다. 묶음 순서 = 가장 앞선 종류(초대 → 규칙·보증금 → 규칙 동의 → 집계·잠금·정산 동의
 * → 정산금 도착) → 공연 시작 시각. 묶음 안은 종류 순서다.
 *
 * 행의 접근 가능한 이름은 종전과 같다(`제목 · 공연명 · 팀 #id`) — 공연명은 묶음 머리에 이미 보이므로
 * 화면에서는 숨기고(sr-only) 스크린 리더에만 읽힌다. 팀 표기는 회원이 팀을 둘 이상 이끌거나
 * 한 묶음에 팀이 둘 이상일 때만 보인다 — 팀이 하나면 어느 팀의 일인지 묻지 않는다.
 *
 * 페이지는 **할 일 행 10개** 기준이다(묶음 단위가 아니다). 경계에서 잘린 묶음은 다음 페이지
 * 첫머리에 머리를 다시 두고 "(이어서)"를 붙인다. 데이터는 이미 전체라 클라이언트에서 자른다.
 */
function TodoBanner({
  todos,
  teamCount,
  page,
  onPageChange,
}: {
  todos: StudioTodo[]
  teamCount: number
  /** 1부터. 범위 밖이면 당겨서 보인다 */
  page: number
  onPageChange: (page: number) => void
}) {
  const { text } = useLocale()
  const paged = useMemo(
    () => pageTodoGroups(groupTodosByPerformance(todos), page, STUDIO_PAGE_SIZE),
    [todos, page],
  )
  // 할 일이 없으면 배너를 렌더하지 않는다 — 빈 패널은 "여기에 뭔가 있어야 한다"고 말한다
  if (todos.length === 0) return null
  return (
    <section
      id="studio-tasks"
      aria-label={text('할 일', 'Next steps')}
      className="w-full scroll-mt-24 rounded-card border border-primary/30 bg-surface p-5 md:p-6"
    >
      <h2 className="m-0 mb-3 flex items-center gap-3 font-sans text-lg font-semibold text-ink">
        {text('지금 확인할 일', 'Your next steps')}
        <span className="rounded-chip bg-primary px-2 py-0.5 text-sm tabular-nums text-white">
          {todos.length}
        </span>
      </h2>
      <div className="flex flex-col gap-5">
        {paged.groups.map((g) => {
          const headingId = `studio-todo-group-${g.performanceId}`
          const teamIds = new Set(g.todos.map((t) => t.teamId).filter((id) => id != null))
          const showTeam = teamCount > 1 || teamIds.size > 1
          return (
            <div
              key={g.performanceId}
              role="group"
              aria-labelledby={headingId}
              data-todo-group={g.performanceId}
            >
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 id={headingId} className="m-0 font-sans text-sm font-bold text-ink">
                  {g.title ?? text(`공연 #${g.performanceId}`, `Show #${g.performanceId}`)}
                  {g.continued && (
                    <span className="font-normal text-muted">
                      {' '}
                      {text('(이어서)', '(continued)')}
                    </span>
                  )}
                </h3>
                {g.startAt && (
                  <span className="font-sans text-[11px] text-muted">{formatKst(g.startAt)}</span>
                )}
                {g.status && <StatusBadge status={SHOW_STATUS[g.status]} />}
                <span className="ml-auto font-sans text-xs tabular-nums text-muted">
                  {text(`할 일 ${g.total}개`, `${g.total} to do`)}
                </span>
              </div>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {g.todos.map((t) => (
                  <li key={t.id} data-todo-id={t.id}>
                    <Link
                      to={t.to}
                      className="flex min-h-14 items-center justify-between gap-4 rounded-control bg-ground px-4 py-3 transition-colors duration-150 ease-out hover:bg-ground-2"
                    >
                      <span className="min-w-0">
                        <span className="block font-sans text-[13px] font-semibold text-ink md:text-sm">
                          {t.title}
                          {t.description && <span className="sr-only"> · {t.description}</span>}
                          {showTeam && t.teamId != null && (
                            <span aria-hidden data-todo-team className="text-muted">
                              {' '}
                              · {text('팀', 'Team')} #{t.teamId}
                            </span>
                          )}
                        </span>
                        {t.note && (
                          <span className="mt-1 block font-sans text-sm leading-relaxed text-muted">
                            {t.note}
                          </span>
                        )}
                      </span>
                      <span aria-hidden className="shrink-0 px-1 font-sans text-xl text-primary">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
      <Pagination
        page={paged.page}
        pageCount={paged.pageCount}
        onChange={onPageChange}
        label={text('확인할 일 페이지', 'Next step pages')}
      />
    </section>
  )
}

/** 확인할 일 탭이 비었거나 아직 모를 때. 빈 탭을 그냥 두면 고장처럼 보인다 */
function TodoPanelEmpty({ unavailable, onRetry }: { unavailable: boolean; onRetry?: () => void }) {
  const { text } = useLocale()
  return (
    <section
      role="status"
      className="rounded-card border border-line bg-surface px-4 py-14 text-center"
    >
      <p className="m-0 font-sans text-[13px] text-muted">
        {unavailable
          ? text('할 일을 아직 확인하지 못했어요.', 'Your next steps are not available yet.')
          : text('지금 확인할 일이 없습니다', 'You are all caught up')}
      </p>
      {unavailable && onRetry && (
        <div className="mt-3">
          <Button variant="secondary" onClick={onRetry}>
            {text('다시 시도', 'Try again')}
          </Button>
        </div>
      )}
    </section>
  )
}

/* ── 요약 타일 탭 ─────────────────────────────────────────────────────── */

interface MetricTab {
  view: StudioView
  label: string
  value: number | string
}

/**
 * 요약 타일 3개 = WAI-ARIA tabs. 타일을 누르면 아래 영역이 그 섹션으로 **바뀐다**(스크롤 이동이
 * 아니다 — 스크롤하지 않고 바로 보여야 한다는 9/24 요청).
 *
 * 자동 활성(automatic activation): 좌우 화살표·Home·End로 포커스를 옮기면 곧바로 선택된다.
 * 패널 전환이 네트워크 없이 즉시라 수동 활성(Enter로 확정)을 둘 이유가 없다.
 * 포커스는 로빙 tabindex — 선택된 탭만 Tab 순서에 들어간다.
 */
function MetricTabs({
  tabs,
  selected,
  idPrefix,
  onSelect,
}: {
  tabs: MetricTab[]
  selected: StudioView
  idPrefix: string
  onSelect: (view: StudioView) => void
}) {
  const { text } = useLocale()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const move = (index: number) => {
    const next = (index + tabs.length) % tabs.length
    onSelect(tabs[next].view)
    refs.current[next]?.focus()
  }
  return (
    <div
      role="tablist"
      aria-label={text('공연 관리 요약', 'Studio summary')}
      className="studio-metrics m-0 grid grid-cols-3"
    >
      {tabs.map((tab, index) => {
        const isSelected = tab.view === selected
        return (
          <button
            key={tab.view}
            ref={(el) => {
              refs.current[index] = el
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.view}`}
            aria-selected={isSelected}
            aria-controls={`${idPrefix}-panel-${tab.view}`}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelect(tab.view)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') move(index + 1)
              else if (event.key === 'ArrowLeft') move(index - 1)
              else if (event.key === 'Home') move(0)
              else if (event.key === 'End') move(tabs.length - 1)
              else return
              event.preventDefault()
            }}
            className="studio-metric studio-metric-tab px-3 py-3 md:px-5 md:py-4"
          >
            <span className="studio-metric-label block text-xs font-medium text-muted">
              {tab.label}
            </span>
            <span className="studio-metric-value mt-1 block font-sans text-2xl font-semibold tabular-nums tracking-tight text-ink md:text-3xl">
              {tab.value}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** 팀이 없거나 팀 조회가 실패했을 때의 요약 — 볼 영역이 없으므로 탭이 아니라 정적 숫자다 */
function StaticMetrics({ metrics }: { metrics: MetricTab[] }) {
  return (
    <dl className="studio-metrics m-0 grid grid-cols-3">
      {metrics.map((metric) => (
        <div key={metric.view} className="studio-metric px-3 py-3 md:px-5 md:py-4">
          <dt className="studio-metric-label text-xs font-medium text-muted">
            <span className="block">{metric.label}</span>
          </dt>
          <dd className="studio-metric-value m-0 mt-1 font-sans text-2xl font-semibold tabular-nums tracking-tight text-ink md:text-3xl">
            {metric.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/* ── 지갑 미등록 배너 ─────────────────────────────────────────────────── */

/**
 * P-01 **상태** 항목의 "지갑 미등록" 배너. 문구는 명세 그대로다.
 * 진입은 C-05 지갑 등록 온보딩(`/onboarding/wallet`)이다 — v6에서 로그인과 분리돼 라우트가 생겼다.
 *
 * ⚠ 배너 위치는 명세에 없다. 이 배너가 뜬 동안 "새 공연 만들기"가 막히므로 **할 일 배너보다 위**,
 * 본문 최상단에 뒀다 — 아래 것들을 다 읽고 나서야 막힌 이유를 알게 되면 늦다.
 */
function WalletMissingBanner() {
  const { text } = useLocale()
  return (
    <section
      role="status"
      className="w-full rounded-card border border-warning bg-surface px-4 py-3 md:px-5 md:py-4"
    >
      <p className="m-0 font-sans text-[13px] font-semibold text-ink md:text-sm">
        {text('공연을 만들려면 먼저 지갑을 등록해 주세요', 'Connect your wallet to create a show')}
      </p>
      <Link
        to="/onboarding/wallet"
        className="mt-1 inline-flex min-h-11 items-center font-sans text-[13px] font-semibold text-sel underline-offset-2 transition-colors duration-150 ease-out hover:text-ink hover:underline"
      >
        {text('지갑 등록하기', 'Connect wallet')} →
      </Link>
    </section>
  )
}

/* ── 내 팀 목록 ───────────────────────────────────────────────────────── */

/**
 * 리더 지갑 등록 배지 — P-01 변경 요지 ①(계좌 등록 배지가 **지갑** 등록 배지로 교체됐다).
 *
 * ⚠ §5.1에 이 배지 행이 없다. `Wallet` 행은 `LINKED`/`SUSPENDED`(연결됨/이용 정지)인데
 * 여기서 물어보는 것은 **지갑이 있느냐**이지 그 지갑이 정지됐느냐가 아니다.
 * 그래서 P-01 컴포넌트 표의 문구 "(등록됨/미등록)"를 라벨로 그대로 썼다.
 * 배지 크기·토큰은 `StatusBadge`와 같다.
 */
function WalletRegisteredBadge({ registered }: { registered: boolean }) {
  const { text } = useLocale()
  return (
    <span
      className={[
        'inline-flex h-6 shrink-0 items-center rounded-chip px-2 font-sans text-[11px] font-semibold whitespace-nowrap',
        registered ? 'bg-ground-2 text-muted' : 'bg-surface text-ink border border-warning',
      ].join(' ')}
    >
      {registered ? text('등록됨', 'Connected') : text('미등록', 'Not connected')}
    </span>
  )
}

function TeamList({ teams }: { teams: StudioTeam[] }) {
  const { text } = useLocale()
  return (
    <section aria-label={text('내 팀', 'My teams')}>
      <h2 className="mb-2 font-sans text-[11px] font-semibold text-muted md:text-xs">
        {text('내 팀', 'My teams')}
      </h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {teams.map((t) => (
          <li key={t.teamId}>
            {/* 탭 시 P-02 이동. 카드가 뜨는 것은 fx-hover.css가 정한다 — 여기는 속성만 토글한다 */}
            <Link
              to={`/studio/teams/${t.teamId}`}
              data-fx="lift"
              className="flex min-h-11 items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3"
            >
              <span className="min-w-0">
                <span className="block truncate font-sans text-sm font-bold text-ink">
                  {t.teamName}
                </span>
                <span className="mt-1 block text-xs text-muted">
                  {text('팀 ID', 'Team ID')} #{t.teamId}
                </span>
                {t.genre && (
                  <span className="block font-sans text-[11px] text-muted">{t.genre}</span>
                )}
              </span>
              <WalletRegisteredBadge registered={t.walletAddress != null} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ── 참여 공연 목록 ───────────────────────────────────────────────────── */

/** 표의 열 머리글. 이 배열이 PC 표와 모바일 패널의 **공통 순서**를 갖는다(§5.21) */
const SHOW_COLUMNS = [
  ['공연 상태', 'Show status'],
  ['정산 상태', 'Settlement status'],
  ['보증금 상태', 'Deposit status'],
] as const

/**
 * 기본 관리 링크와 별개로 주최자가 판매 중에도 수정·검표 화면으로 돌아갈 수 있어야 한다.
 *
 * 삭제 버튼도 여기 둔다 — 이 줄이 PC 표와 모바일 패널 **양쪽에서 같은 자리**에 그려지는
 * 유일한 조각이라, 여기 한 번 넣으면 두 폭이 어긋나지 않는다. 모바일 패널은 카드 전체가
 * `<a>`라서 그 안에 `<button>`을 넣을 수 없는데, 이 줄은 링크 **밖**에 있다.
 */
function PerformanceLinks({
  performance: p,
  onDelete,
}: {
  performance: StudioPerformance
  onDelete?: (performance: StudioPerformance) => void
}) {
  const { text } = useLocale()
  if (p.participationStatus !== 'ACCEPTED') return null
  const base = `/studio/performances/${p.performanceId}`
  const links = [
    ...(p.host
      ? [
          { to: `${base}/edit`, label: text('공연 관리', 'Manage show') },
          { to: `${base}/participants`, label: text('참여팀 관리', 'Manage participants') },
        ]
      : []),
    { to: `${base}/entries`, label: text('입장 현황', 'Entry status') },
    // 정산은 참여팀 전원이 본다 — 실행 버튼의 활성은 서버 `actions`가 정한다(P-08)
    ...(hasSettlementScreen(p)
      ? [{ to: `${base}/settlement`, label: text('정산', 'Settlement') }]
      : []),
  ]
  return (
    <nav
      aria-label={`${p.title} ${text('관리 메뉴', 'management')}`}
      className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
    >
      {links.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          className="inline-flex min-h-11 items-center text-xs font-semibold text-primary-bright underline underline-offset-4"
        >
          {link.label}
        </Link>
      ))}
      {onDelete && deletable(p) && (
        // 비가역이라 여기서 바로 지우지 않는다 — 확인 모달을 거친다(§5.6)
        <button
          type="button"
          onClick={() => onDelete(p)}
          className="inline-flex min-h-11 items-center text-xs font-semibold text-danger underline underline-offset-4"
        >
          {text('공연 삭제', 'Delete show')}
        </button>
      )}
    </nav>
  )
}

function PerformanceTable({
  performances,
  onDelete,
}: {
  performances: StudioPerformance[]
  onDelete?: (performance: StudioPerformance) => void
}) {
  const { text } = useLocale()
  return (
    <section aria-label={text('참여 공연', 'Your shows')}>
      <h2 className="mb-2 font-sans text-[11px] font-semibold text-muted md:text-xs">
        {text('참여 공연', 'Your shows')}
      </h2>

      {/* ── PC: 표 ── */}
      <div className="hidden overflow-hidden rounded-card border border-line bg-surface md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              <th
                scope="col"
                className="px-4 py-2.5 font-sans text-[11px] font-semibold text-muted"
              >
                {text('공연명', 'Show')}
              </th>
              {SHOW_COLUMNS.map((c) => (
                <th
                  key={c[0]}
                  scope="col"
                  className="px-4 py-2.5 font-sans text-[11px] font-semibold text-muted"
                >
                  {text(c[0], c[1])}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {performances.map((p) => (
              <tr
                key={`${p.performanceId}-${p.teamId}`}
                className="border-b border-line transition-colors duration-150 ease-out last:border-b-0 hover:bg-ground-2"
              >
                <th scope="row" className="px-4 py-3 font-normal">
                  <Link
                    to={manageRoute(p)}
                    className="block font-sans text-[13px] font-bold text-ink"
                  >
                    {p.title}
                  </Link>
                  {p.startAtLabel && (
                    <span className="block font-sans text-[11px] text-muted">{p.startAtLabel}</span>
                  )}
                  <PerformanceLinks performance={p} onDelete={onDelete} />
                </th>
                <td className="px-4 py-3">
                  <StatusBadge status={SHOW_STATUS[p.status]} />
                </td>
                <td className="px-4 py-3">
                  {p.settlementStatus ? (
                    <SettlementStatusBadge status={p.settlementStatus} />
                  ) : (
                    <span className="font-sans text-[11px] text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <DepositStatusBadge status={p.depositStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 모바일: 행 하나 = 패널 하나(§5.21). 가로 스크롤을 만들지 않는다 ── */}
      <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
        {performances.map((p) => (
          <li key={`${p.performanceId}-${p.teamId}`}>
            <Link
              to={manageRoute(p)}
              data-fx="lift"
              className="block rounded-card border border-line bg-surface px-4 py-3"
            >
              {/* 표의 첫 열(식별자)이 패널 제목이 된다 */}
              <span className="block font-sans text-[13px] font-bold text-ink">{p.title}</span>
              {p.startAtLabel && (
                <span className="mb-1 block font-sans text-[11px] text-muted">
                  {p.startAtLabel}
                </span>
              )}
              {/* 나머지 열은 `라벨: 값` 한 줄씩으로 쌓인다. 순서는 PC 표와 같다 */}
              <InfoRow label={text(...SHOW_COLUMNS[0])}>
                <StatusBadge status={SHOW_STATUS[p.status]} />
              </InfoRow>
              <InfoRow label={text(...SHOW_COLUMNS[1])}>
                {p.settlementStatus ? (
                  <SettlementStatusBadge status={p.settlementStatus} />
                ) : (
                  <span className="font-sans text-[11px] text-muted">—</span>
                )}
              </InfoRow>
              <InfoRow label={text(...SHOW_COLUMNS[2])}>
                <DepositStatusBadge status={p.depositStatus} />
              </InfoRow>
            </Link>
            <PerformanceLinks performance={p} onDelete={onDelete} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ── 참여 공연 필터 ───────────────────────────────────────────────────── */

const PERFORMANCE_FILTER_KEYS: readonly PerformanceFilterKey[] = ['show', 'settlement', 'deposit']

/**
 * 표 위 필터 줄 — 공연 상태 · 정산 상태 · 보증금 상태(AND). 옵션 이름은 표의 **배지 라벨 그대로**다
 * (`statusLabels.ts`). 단일 선택이라 네이티브 select를 쓴다 — 모바일에서 OS 선택기가 뜨고 키보드·
 * 스크린 리더 동작을 따로 만들 필요가 없다. 좁은 폭에서는 줄바꿈된다.
 */
function PerformanceFilterBar({
  filters,
  total,
  shown,
  onChange,
  onReset,
}: {
  filters: PerformanceFilters
  total: number
  shown: number
  onChange: (key: PerformanceFilterKey, value: string | undefined) => void
  onReset: () => void
}) {
  const { text } = useLocale()
  const fields: {
    key: PerformanceFilterKey
    label: string
    values: readonly string[]
    labelOf: (value: string) => StatusLabel
  }[] = [
    {
      key: 'show',
      label: text(...SHOW_COLUMNS[0]),
      values: SHOW_FILTER_VALUES,
      labelOf: (v) => SHOW_STATUS_LABEL[v as keyof typeof SHOW_STATUS_LABEL],
    },
    {
      key: 'settlement',
      label: text(...SHOW_COLUMNS[1]),
      values: SETTLEMENT_FILTER_VALUES,
      labelOf: (v) => SETTLEMENT_STATUS_LABEL[v as keyof typeof SETTLEMENT_STATUS_LABEL],
    },
    {
      key: 'deposit',
      label: text(...SHOW_COLUMNS[2]),
      values: DEPOSIT_FILTER_VALUES,
      labelOf: (v) => DEPOSIT_STATUS_LABEL[v as keyof typeof DEPOSIT_STATUS_LABEL],
    },
  ]
  const active = hasPerformanceFilter(filters)
  const baseId = useId()
  return (
    <div
      role="group"
      aria-label={text('참여 공연 필터', 'Show filters')}
      className="mb-3 flex flex-wrap items-end gap-x-3 gap-y-2"
    >
      {fields.map((field) => (
        <div key={field.key} className="flex min-w-0 flex-col gap-1">
          <label
            htmlFor={`${baseId}-${field.key}`}
            className="font-sans text-[11px] font-semibold text-muted"
          >
            {field.label}
          </label>
          <select
            id={`${baseId}-${field.key}`}
            value={filters[field.key] ?? ''}
            onChange={(event) => onChange(field.key, event.target.value || undefined)}
            className="h-11 min-w-0 cursor-pointer rounded-control border border-line bg-surface px-3 font-sans text-[13px] text-ink"
          >
            <option value="">{text('전체', 'All')}</option>
            {field.values.map((value) => {
              const label = field.labelOf(value)
              return (
                <option key={value} value={value}>
                  {text(label.ko, label.en)}
                </option>
              )
            })}
          </select>
        </div>
      ))}
      <div className="flex min-h-11 items-center gap-3">
        <Button variant="secondary" disabled={!active} onClick={onReset}>
          {text('필터 초기화', 'Reset filters')}
        </Button>
        <span role="status" className="font-sans text-xs tabular-nums text-muted">
          {text(`${total}개 중 ${shown}개`, `${shown} of ${total}`)}
        </span>
      </div>
    </div>
  )
}

/** 필터 결과 0 — 공연이 없는 것(NoShows)과 다르다. 푸는 방법(초기화)을 같이 준다 */
function NoFilteredShows({ onReset }: { onReset: () => void }) {
  const { text } = useLocale()
  return (
    <section
      role="status"
      className="rounded-card border border-line bg-surface px-4 py-14 text-center"
    >
      <p className="mt-0 mb-3 font-sans text-[13px] text-muted">
        {text('조건에 맞는 공연이 없습니다', 'No shows match these filters')}
      </p>
      <Button variant="secondary" onClick={onReset}>
        {text('필터 초기화', 'Reset filters')}
      </Button>
    </section>
  )
}

/* ── 빈 상태·로딩 ─────────────────────────────────────────────────────── */

/** §5.7 — 아이콘·이미지 없이 안내 문구 + 다음 행동 버튼 */
function NoTeams({ onCreateTeam }: { onCreateTeam: () => void }) {
  const { text } = useLocale()
  return (
    <section
      role="status"
      className="rounded-card border border-line bg-surface px-4 py-14 text-center"
    >
      <p className="mb-3 font-sans text-xl font-semibold tracking-tight text-ink">
        {text('첫 무대를 함께 만들 팀을 준비하세요', 'Your next stage starts with a team')}
      </p>
      <p className="mb-4 font-sans text-[13px] text-muted">
        {text(
          '팀을 만들면 공연을 열고 정산을 받을 수 있어요.',
          'Create a team to host shows and receive your payouts.',
        )}
      </p>
      {/* 팀 만들기 버튼 — P-02 생성 모드로 */}
      <Button onClick={onCreateTeam}>{text('팀 만들기', 'Create team')}</Button>
    </section>
  )
}

function NoShows() {
  const { text } = useLocale()
  return (
    <p
      role="status"
      className="m-0 rounded-card border border-line bg-surface px-4 py-14 text-center font-sans text-[13px] text-muted"
    >
      {text('아직 참여 중인 공연이 없습니다', 'Your shows will appear here')}
    </p>
  )
}

function LoadFailure({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { text } = useLocale()
  return (
    <section
      role="alert"
      className="rounded-card border border-danger bg-surface px-4 py-6 text-center"
    >
      <p className="mt-0 mb-3 font-sans text-[13px] text-danger">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {text('다시 시도', 'Try again')}
        </Button>
      )}
    </section>
  )
}

function Skeleton() {
  return <PageSkeleton variant="dashboard" />
}

/* ── 화면 ─────────────────────────────────────────────────────────────── */

interface Props {
  loading?: boolean
  teams: StudioTeam[]
  performances: StudioPerformance[]
  /**
   * 할 일 — 헤더 알림과 같은 `useStudioTodos` 결과다. 참여 공연 표의 **현재 페이지와 무관하게**
   * 할 일 대상 공연 전체에서 뽑는다. 없으면 배너를 그리지 않는다.
   */
  todos?: StudioTodo[]
  /** 할 일 조회를 아직 모르거나 실패했다 — 개수 자리를 `—`로 둔다 */
  todosUnavailable?: boolean
  /** `undefined`면 지갑 미등록 — 배너를 띄우고 새 공연 만들기를 막는다 */
  wallet?: StudioWallet
  /** 팀 잔액 패널이 가리킬 팀. 없으면 첫 팀 */
  activeTeamId?: number
  teamError?: boolean
  performanceError?: boolean
  onRetryTeams?: () => void
  onRetryPerformances?: () => void
  /** API-performance-18. 없으면 삭제 버튼을 그리지 않는다 */
  onDeletePerformance?: (performanceId: number) => Promise<PerformanceActionResult>
  refreshing?: boolean
  /**
   * 참여 공연 개수 칸 — performance-06 `pageInfo.totalElements`. 없으면 `performances.length`.
   * `performances`는 **전체**다(페이지가 전체를 받아 넘긴다). 필터·10개 페이지는 이 화면이 자른다.
   */
  performanceTotal?: number
}

export function StudioHome({
  loading = false,
  teams,
  performances,
  todos = [],
  todosUnavailable = false,
  wallet,
  activeTeamId,
  teamError = false,
  performanceError = false,
  onRetryTeams,
  onRetryPerformances,
  onDeletePerformance,
  refreshing = false,
  performanceTotal,
}: Props) {
  const { text } = useLocale()
  // 버튼은 `<a>` 안에 `<button>`을 넣지 않고 navigate로 이동한다(A-12 결제 재개 버튼과 같은 방식)
  const navigate = useNavigate()
  const activeTeam = teams.find((t) => t.teamId === activeTeamId) ?? teams[0]
  const hasTeam = teams.length > 0
  const walletMissing = wallet == null

  /** 확인 모달이 물어보고 있는 공연. `null`이면 닫힌 상태다 */
  const [deleteTarget, setDeleteTarget] = useState<StudioPerformance | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteFailure, setDeleteFailure] = useState<string | undefined>(undefined)

  const runDelete = useCallback(
    (performanceId: number) => {
      void (async () => {
        setDeleteFailure(undefined)
        setDeleting(true)
        try {
          const result = await onDeletePerformance?.(performanceId)
          if (!result || result.ok) return
          // 목록에서 행이 사라지는 것이 성공 신호다 — 성공 문구를 따로 띄우지 않는다
          setDeleteFailure(
            studioFailureText(result.code, result.msg) ??
              text('공연을 삭제하지 못했어요.', 'Could not delete the show.'),
          )
        } finally {
          setDeleting(false)
        }
      })()
    },
    [onDeletePerformance, text],
  )

  // 선택 탭은 URL `?view=`에 둔다 — 새로고침·뒤로 가기에 남는다. 기본값은 URL에 쓰지 않는다
  const [searchParams, setSearchParams] = useSearchParams()
  const idPrefix = useId()
  const view = resolveStudioView(
    searchParams.get(STUDIO_VIEW_PARAM),
    todosUnavailable ? 0 : todos.length,
  )
  const selectView = useCallback(
    (next: StudioView) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          params.set(STUDIO_VIEW_PARAM, next)
          // 페이지는 탭마다 뜻이 다르다 — 탭을 바꾸면 1페이지부터(필터는 참여 공연 전용이라 남긴다)
          params.delete(STUDIO_PAGE_PARAM)
          return params
        },
        // 탭 클릭마다 기록을 쌓지 않는다 — 뒤로 가기는 이전 화면으로, 돌아오면 URL의 탭이 복원된다
        { replace: true },
      )
    },
    [setSearchParams],
  )
  const page = parseStudioPage(searchParams.get(STUDIO_PAGE_PARAM))
  const setPage = useCallback(
    (next: number) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          if (next <= 1) params.delete(STUDIO_PAGE_PARAM)
          else params.set(STUDIO_PAGE_PARAM, String(next))
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )
  // 참여 공연 필터 — URL이 정본이다. 필터를 바꾸면 1페이지로(page 삭제)
  // 회원당 수십 건이라 렌더마다 거른다 — 메모 키를 맞추는 비용이 더 크다
  const filters = parsePerformanceFilters(searchParams)
  const filtered = filterPerformances(performances, filters)
  const performancePage = paginate(filtered, view === 'performances' ? page : 1, STUDIO_PAGE_SIZE)
  const setFilter = useCallback(
    (key: PerformanceFilterKey, value: string | undefined) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          if (value) params.set(PERFORMANCE_FILTER_PARAMS[key], value)
          else params.delete(PERFORMANCE_FILTER_PARAMS[key])
          params.delete(STUDIO_PAGE_PARAM)
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )
  const resetFilters = useCallback(() => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        for (const key of PERFORMANCE_FILTER_KEYS) params.delete(PERFORMANCE_FILTER_PARAMS[key])
        params.delete(STUDIO_PAGE_PARAM)
        return params
      },
      { replace: true },
    )
  }, [setSearchParams])
  const metrics: MetricTab[] = [
    { view: 'teams', label: text('내 팀', 'Teams'), value: teamError ? '—' : teams.length },
    {
      // 표는 필터·페이지로 나뉘지만 개수는 전체다 — 옆 "확인할 일"과 같은 범위로 맞춘다
      view: 'performances',
      label: text('참여 공연', 'Shows'),
      value: performanceError ? '—' : (performanceTotal ?? performances.length),
    },
    {
      // 헤더 알림 수와 같은 값이다(같은 useStudioTodos 결과)
      view: 'todos',
      label: text('확인할 일', 'Next steps'),
      value: todosUnavailable ? '—' : todos.length,
    },
  ]

  if (loading) {
    return (
      <div className="px-3 py-3 md:px-0 md:py-0">
        <Skeleton />
      </div>
    )
  }

  return (
    // 모바일 하단 고정 버튼(FixedBottom) 뒤로 내용이 숨지 않게 여백을 둔다.
    // PC에는 하단 고정이 없다(§5.19)
    <div className="studio-home flex flex-col gap-4 px-3 pt-3 pb-24 md:gap-6 md:px-0 md:pt-0 md:pb-0">
      {/* PC 본문 상단 오른쪽 = 새 공연 만들기(P-01 레이아웃). 모바일에서는 하단 고정으로 내려간다 */}
      <div className="studio-page-heading flex flex-wrap items-end justify-between gap-5 border-b border-line pb-7">
        <div>
          <h2 className="m-0 font-sans text-3xl font-semibold tracking-tight text-ink md:text-4xl">
            {text('공연 관리', 'Show management')}
          </h2>
        </div>
        {hasTeam && (
          <div className="flex flex-wrap gap-2">
            {onRetryPerformances && (
              <Button variant="secondary" disabled={refreshing} onClick={onRetryPerformances}>
                {refreshing
                  ? text('확인 중…', 'Refreshing…')
                  : text('알림·상태 새로고침', 'Refresh tasks and status')}
              </Button>
            )}
            <span className="hidden md:block">
              <Button disabled={walletMissing} onClick={() => navigate('/studio/performances/new')}>
                {text('새 공연 만들기', 'Create a show')}
              </Button>
            </span>
          </div>
        )}
      </div>

      {walletMissing && <WalletMissingBanner />}

      {teamError ? (
        <>
          <StaticMetrics metrics={metrics} />
          <LoadFailure
            message={text('팀 정보를 불러오지 못했어요.', 'Could not load team details.')}
            onRetry={onRetryTeams}
          />
        </>
      ) : !hasTeam ? (
        <>
          <StaticMetrics metrics={metrics} />
          <NoTeams onCreateTeam={() => navigate('/studio/teams/new')} />
        </>
      ) : (
        <>
          <MetricTabs tabs={metrics} selected={view} idPrefix={idPrefix} onSelect={selectView} />

          {/* 세 패널을 모두 두고 고르지 않은 것은 `hidden` — 페이지·삭제 모달 상태가 탭 전환에 남는다 */}
          <div
            role="tabpanel"
            id={`${idPrefix}-panel-todos`}
            aria-labelledby={`${idPrefix}-tab-todos`}
            hidden={view !== 'todos'}
            tabIndex={0}
          >
            {todos.length > 0 ? (
              <TodoBanner
                todos={todos}
                teamCount={teams.length}
                page={view === 'todos' ? page : 1}
                onPageChange={setPage}
              />
            ) : (
              <TodoPanelEmpty unavailable={todosUnavailable} onRetry={onRetryPerformances} />
            )}
          </div>

          <div
            role="tabpanel"
            id={`${idPrefix}-panel-performances`}
            aria-labelledby={`${idPrefix}-tab-performances`}
            hidden={view !== 'performances'}
            tabIndex={0}
            className="min-w-0"
          >
            {performanceError ? (
              <LoadFailure
                message={text('공연 정보를 불러오지 못했어요.', 'Could not load shows.')}
                onRetry={onRetryPerformances}
              />
            ) : performances.length === 0 ? (
              <NoShows />
            ) : (
              <>
                {deleteFailure && (
                  <p
                    role="alert"
                    className="mt-0 mb-2 rounded-card border border-danger bg-surface px-4 py-3 font-sans text-[13px] text-danger"
                  >
                    {deleteFailure}
                  </p>
                )}
                <PerformanceFilterBar
                  filters={filters}
                  total={performances.length}
                  shown={filtered.length}
                  onChange={setFilter}
                  onReset={resetFilters}
                />
                {filtered.length === 0 ? (
                  <NoFilteredShows onReset={resetFilters} />
                ) : (
                  <>
                    <PerformanceTable
                      performances={performancePage.items}
                      onDelete={onDeletePerformance ? setDeleteTarget : undefined}
                    />
                    <Pagination
                      page={performancePage.page}
                      pageCount={performancePage.pageCount}
                      onChange={setPage}
                      label={text('참여 공연 페이지', 'Show pages')}
                    />
                  </>
                )}
              </>
            )}
          </div>

          <div
            role="tabpanel"
            id={`${idPrefix}-panel-teams`}
            aria-labelledby={`${idPrefix}-tab-teams`}
            hidden={view !== 'teams'}
            tabIndex={0}
            className="min-w-0"
          >
            {/* 팀 정체성과 잔액 — 종전 보조 레일의 내용 그대로다 */}
            <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_320px] md:gap-6">
              <TeamList teams={teams} />
              <div>
                <h2 className="mb-2 font-sans text-[11px] font-semibold text-muted md:text-xs">
                  {text('팀 잔액', 'Team balance')}
                </h2>
                {activeTeam && wallet ? (
                  <Link
                    to={`/studio/teams/${activeTeam.teamId}`}
                    data-fx="lift"
                    className="block rounded-card"
                  >
                    <BalancePanel
                      balanceKrw={wallet.balanceKrw}
                      approxLabel={wallet.approxLabel}
                      updatedAtLabel={wallet.updatedAtLabel}
                      meta={
                        <ProviderBadge
                          provider={wallet.provider}
                          tone="performer"
                          suspended={wallet.status === 'SUSPENDED'}
                        />
                      }
                    />
                  </Link>
                ) : (
                  <p className="m-0 rounded-card border border-line bg-surface px-4 py-6 font-sans text-[13px] text-muted">
                    {text(
                      '지갑을 등록하면 팀 잔액이 여기에 보입니다',
                      'Connect a wallet to view the team balance here',
                    )}
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* 모바일 하단 고정은 주 액션 **하나만**(§5.19). 관객 탭바와 겹치지 않는다 — 이 화면엔 탭바가 없다 */}
      {hasTeam && (
        <FixedBottom>
          {walletMissing ? (
            // 막힌 버튼을 그냥 비활성으로 두면 모바일에서는 그것이 화면의 유일한 액션이라
            // 막다른 길이 된다. 대신 막힌 이유를 푸는 곳(C-05)으로 보낸다
            <Button full variant="secondary" onClick={() => navigate('/onboarding/wallet')}>
              {text('지갑 등록하고 공연 만들기', 'Connect wallet to create a show')}
            </Button>
          ) : (
            <Button full onClick={() => navigate('/studio/performances/new')}>
              {text('새 공연 만들기', 'Create a show')}
            </Button>
          )}
        </FixedBottom>
      )}

      {/* 삭제는 되돌릴 수 없다 → 확인 모달(§5.6). 참여팀 초대·정산 규칙도 함께 사라진다 */}
      <ConfirmDialog
        open={deleteTarget != null}
        title={text('이 공연을 삭제할까요?', 'Delete this show?')}
        body={
          deleteTarget
            ? text(
                `${deleteTarget.title} 공연과 참여팀 초대, 티켓 옵션, 정산 규칙이 함께 사라집니다. 되돌릴 수 없습니다.`,
                `${deleteTarget.title} will be removed along with its invitations, ticket options and settlement rules. This cannot be undone.`,
              )
            : undefined
        }
        confirmLabel={text('삭제하기', 'Delete show')}
        cancelLabel={text('취소', 'Cancel')}
        confirmVariant="danger"
        busy={deleting}
        onConfirm={() => {
          const target = deleteTarget
          setDeleteTarget(null)
          if (target) runDelete(target.performanceId)
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
