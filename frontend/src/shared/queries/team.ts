/**
 * team 도메인 TanStack Query 훅 — API-team-01 ~ 04.
 *
 * 정본: `docs/design/06_API_명세서_v6.md` §2 · §0.2
 * 요청 함수는 `@/shared/api/domains/team`, 키는 `@/shared/queries/keys`에만 있다.
 *
 * ⚠ 키 선택 한 가지를 적어 둔다 — `GET /teams/me`는 `qk.team.me()`가 아니라
 *   `qk.team.list(params)`에 담는다. keys.ts 주석은 `/teams/me`를 `qk.team.me()`로 적어 뒀지만
 *   이 엔드포인트는 **페이지네이션 목록**(page·size·pageInfo)이라 단건 키에 담으면
 *   페이지마다 같은 키를 덮어쓰게 된다. 목록 키를 쓰면 `qk.team.lists()` 접두로 전 페이지를
 *   한 번에 무효화할 수 있다. keys.ts 정리는 배럴 작업에서 메인 세션이 판단한다.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createTeam,
  fetchMyTeams,
  fetchTeamDetail,
  normalizeTeamListQuery,
  searchTeams,
  TEAM_SEARCH_QUERY_MAX,
  updateTeam,
  type TeamCreateRequest,
  type TeamId,
  type TeamListQuery,
  type TeamUpdateRequest,
} from '@/shared/api/domains/team'
import { useCallback } from 'react'

import { qk } from '@/shared/queries/keys'

/* ============================== 내부 헬퍼 ============================== */

function isValidId(id: number | undefined): boolean {
  return typeof id === 'number' && Number.isFinite(id) && id > 0
}

type QueryEnableOptions = { enabled?: boolean }

/* ============================== 조회 ============================== */

/**
 * API-team-06 · 팀 검색 키. `keys.ts`에 새 슬롯을 만들지 않고 도메인 접두 아래 둔다 —
 * `qk.team.all` 무효화(팀 생성·수정·해산)에 함께 잡혀 이름이 바뀐 팀이 옛 후보로 남지 않는다.
 */
export const teamSearchKey = (q: string) => [...qk.team.all, 'search', q] as const

/**
 * API-team-06 · 초대 자동완성(P-04)용 검색 함수를 돌려준다.
 *
 * 훅(`useQuery`)이 아니라 **함수**인 이유 — 디바운스·취소·키보드 선택 상태가 전부 콤보박스
 * 안에 있고, 콤보박스는 검색어가 확정될 때마다 한 번 부르면 된다. `fetchQuery`로 부르므로
 * 같은 검색어는 30초 동안 캐시를 쓰고, `qk.team.all` 무효화에도 함께 잡힌다.
 * 빈 검색어는 요청하지 않는다(서버 400). 50자를 넘으면 잘라 보낸다.
 */
export function useTeamSearchFetcher() {
  const queryClient = useQueryClient()
  return useCallback(
    (q: string, signal?: AbortSignal) => {
      const query = q.trim().slice(0, TEAM_SEARCH_QUERY_MAX)
      if (query.length === 0) return Promise.resolve({ items: [] })
      return queryClient.fetchQuery({
        queryKey: teamSearchKey(query),
        queryFn: () => searchTeams({ q: query, size: 10 }, { signal }),
        staleTime: 30_000,
      })
    },
    [queryClient],
  )
}

/**
 * API-team-02 · 내가 리더인 팀 목록 (P-01).
 * 팀이 없으면 404가 아니라 빈 배열이 온다 — "팀 없음"은 오류 상태가 아니다.
 */
export function useMyTeams(params?: TeamListQuery, options?: QueryEnableOptions) {
  const query = normalizeTeamListQuery(params)
  return useQuery({
    queryKey: qk.team.list(query),
    queryFn: () => fetchMyTeams(query),
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  })
}

/** API-team-03 · 팀 상세 (P-02). 그 팀 리더가 아니면 403 `COMMON_FORBIDDEN`이다. */
export function useTeamDetail(teamId: TeamId, options?: QueryEnableOptions) {
  return useQuery({
    queryKey: qk.team.detail(teamId),
    queryFn: () => fetchTeamDetail(teamId),
    enabled: isValidId(teamId) && (options?.enabled ?? true),
  })
}

/* ============================== 변경 ============================== */

/**
 * API-team-01 · 팀 생성 (P-02).
 *
 * 만든 회원이 리더가 되고 **PERFORMER 역할을 얻는다.** 역할이 바뀌면 내비게이션·가드가
 * 달라지므로 `qk.member.me()`도 함께 무효화한다. 팀 지갑은 리더 지갑이라 새로 만들지 않는다.
 */
export function useCreateTeam() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: TeamCreateRequest) => createTeam(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.team.all })
      void queryClient.invalidateQueries({ queryKey: qk.member.me() })
    },
  })
}

export type UpdateTeamVariables = {
  teamId: TeamId
  body: TeamUpdateRequest
}

/**
 * API-team-04 · 팀 수정 (P-02).
 * 리더·지갑 주소는 이 API로 바꿀 수 없다(보내면 400). 이름·장르가 목록에도 보이므로 함께 무효화한다.
 */
export function useUpdateTeam() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ teamId, body }: UpdateTeamVariables) => updateTeam(teamId, body),
    onSuccess: (_data, { teamId }) => {
      void queryClient.invalidateQueries({ queryKey: qk.team.detail(teamId) })
      void queryClient.invalidateQueries({ queryKey: qk.team.lists() })
      // member_05 `teams[].teamName`(껍데기 팀 전환 메뉴)도 같은 이름을 싣는다.
      void queryClient.invalidateQueries({ queryKey: qk.member.me() })
    },
  })
}
