/**
 * 스튜디오 할 일 데이터 — 공통 헤더 알림과 P-01 스튜디오 홈이 **같은 쿼리 키**로 구독한다.
 *
 * 규칙은 `shared/todos/studioTodos.ts`(순수 함수), 데이터는 여기 한 곳이다. 두 화면이 각자
 * 모으면 범위(현재 페이지 vs 전체)가 갈라져 숫자가 달라진다(9/24 dev: 헤더 10 · 홈 7).
 *
 * ── 조회 범위 ──────────────────────────────────────────────────────────────
 * performance-06은 `status` 필터를 **하나만** 받는다(openapi `status?: PerformanceStatus`).
 * 할 일이 나올 수 있는 상태만 골라 상태별로 전체 페이지를 순회한다.
 *   DRAFT             — 초대 응답·규칙 저장
 *   PENDING_AGREEMENT — 초대 응답·보증금·규칙 동의
 *   ENDED             — 집계 확정·정산 잠금·정산 동의(정산은 ENDED 뒤에만 시작한다 — SettlementGates)
 * ON_SALE·SALE_CLOSED에는 할 일 조건이 없고, CANCELLED는 할 일을 만들지 않는다.
 *
 * ── 무효화 ────────────────────────────────────────────────────────────────
 * 키는 `qk.performance.mine({ scope: 'todos', … })`라 `qk.performance.mines()`·`.all` 접두 무효화가
 * 그대로 덮는다(DEPOSIT·AGREE·LOCK·AGGREGATE·RELEASE·HALT 확정, 초대·수락·규칙 저장·삭제·이의제기·조기 동의).
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  fetchMyPerformanceList,
  normalizeMyPerformanceListQuery,
  type MyPerformanceListItem,
} from '@/shared/api/domains/performance'
import { useLocale } from '@/shared/i18n/useLocale'
import { LIVE_STALE_MS } from '@/shared/queries/freshness'
import { qk } from '@/shared/queries/keys'
import { collectStudioTodos, type StudioTodo } from '@/shared/todos/studioTodos'

export const STUDIO_TODO_STATUSES = ['DRAFT', 'PENDING_AGREEMENT', 'ENDED'] as const
const PAGE_SIZE = 100

/** 키 파라미터. 조회 범위가 바뀌면 이 객체가 바뀌어 옛 캐시와 섞이지 않는다 */
export const STUDIO_TODO_KEY_PARAMS = {
  scope: 'todos',
  statuses: STUDIO_TODO_STATUSES,
  size: PAGE_SIZE,
} as const

async function fetchAllPages(
  status: (typeof STUDIO_TODO_STATUSES)[number],
  signal: AbortSignal | undefined,
): Promise<MyPerformanceListItem[]> {
  const items: MyPerformanceListItem[] = []
  let page = 0
  let hasNext = true
  // 후보가 100개를 넘어도 개수를 추측하지 않고 실제 모든 페이지를 확인한다
  while (hasNext) {
    const result = await fetchMyPerformanceList(
      normalizeMyPerformanceListQuery({ status, page, size: PAGE_SIZE, sort: 'startAt,asc' }),
      // 헤더는 모든 화면에 있다 — 알림 조회의 401이 사용자를 로그아웃시키면 안 된다
      { signal, silentAuthFailure: true },
    )
    items.push(...(result.items ?? []))
    hasNext = result.pageInfo?.hasNext === true
    page += 1
  }
  return items
}

/**
 * 세 상태를 병렬로 모아 공연 ID로 중복을 없앤다. 순회 도중 상태가 바뀐 공연은 두 목록에 걸칠 수
 * 있는데, 그때는 **나중 상태**(배열 뒤쪽 = 더 진행된 상태)를 남긴다.
 */
export async function fetchStudioTodoRows(signal?: AbortSignal): Promise<MyPerformanceListItem[]> {
  const lists = await Promise.all(STUDIO_TODO_STATUSES.map((s) => fetchAllPages(s, signal)))
  const byId = new Map<number, MyPerformanceListItem>()
  const orphans: MyPerformanceListItem[] = []
  for (const row of lists.flat()) {
    if (row.performanceId == null) orphans.push(row)
    else byId.set(row.performanceId, row)
  }
  return [...byId.values(), ...orphans]
}

export interface StudioTodosResult {
  todos: StudioTodo[]
  /** 첫 조회 전. `enabled=false`면 false */
  isPending: boolean
  /** 보여 줄 데이터 없이 실패했다. 캐시가 있으면 배경 재조회 실패는 숨긴다 */
  isError: boolean
  isFetching: boolean
  refetch: () => void
}

export function useStudioTodos(options: {
  enabled: boolean
  /** 화면이 보이는 동안의 주기 갱신. 스튜디오 홈만 켠다(`POLL_MS.studioHome`) */
  refetchIntervalMs?: number | false
}): StudioTodosResult {
  const { text } = useLocale()
  const interval = options.refetchIntervalMs ?? false
  const query = useQuery({
    queryKey: qk.performance.mine(STUDIO_TODO_KEY_PARAMS),
    queryFn: ({ signal }) => fetchStudioTodoRows(signal),
    enabled: options.enabled,
    retry: false,
    // 초대·동의 요청·정산 동의는 다른 팀이 만든다(freshness.ts)
    staleTime: LIVE_STALE_MS,
    refetchInterval: (q) => (interval && q.state.status === 'success' ? interval : false),
    refetchIntervalInBackground: false,
  })
  // 헤더는 모든 화면에 있어 `useQuery`를 통째로 모킹한 페이지 테스트에도 마운트된다.
  // 배열이 아닌 값은 받지 않는다(종전 헤더의 `Array.isArray` 방어를 그대로 옮겼다).
  const rows = Array.isArray(query.data) ? query.data : undefined
  // 정산금 도착(settlement-01 `myTeam.totalAmount`)은 목록 API에 금액이 없어 공연 수만큼 호출해야
  // 한다(N+1). 스튜디오 홈도 지금까지 빈 배열을 넘겼다 — 같은 출처(없음)를 유지한다.
  const todos = useMemo(() => collectStudioTodos(rows ?? [], [], text), [rows, text])
  return {
    todos,
    isPending: options.enabled && query.isPending,
    isError: query.isError && rows == null,
    isFetching: query.isFetching,
    refetch: () => void query.refetch(),
  }
}
