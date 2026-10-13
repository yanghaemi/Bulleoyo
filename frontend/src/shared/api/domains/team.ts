/**
 * team 도메인 REST 함수 — API-team-01 ~ 04 · 06(팀 검색, 2026-09-26).
 *
 * 정본: `docs/design/api/openapi.yaml`(operationId `team_01`~`team_04`)
 *      `docs/design/06_API_명세서_v6.md` §2
 *
 * ─────────────────────────── 알아둘 두 가지 ───────────────────────────
 * 1. **팀 지갑 = 리더 지갑이다.** team 테이블에 지갑 컬럼이 없고 응답의 `walletAddress`는
 *    `leaderMemberId → wallet`으로 파생한 값이다. 그래서 팀 생성 전에 리더 지갑 연결
 *    (`status=LINKED`)이 끝나 있어야 하고, 미연결이면 404 `WALLET_NOT_FOUND`다.
 * 2. 팀 수정(team_04)으로 **리더·지갑 주소는 바꿀 수 없다.** 그 필드를 본문에 실어 보내면
 *    400 `COMMON_VALIDATION_FAILED`다. 화면에서 읽기 전용으로 둔다.
 */

import { api, type QueryParams } from '@/shared/api/client'
import type { ApiBody, ApiData, ApiPath, ApiQuery } from '@/shared/api/schema'

/* ============================== 식별자 ============================== */

export type TeamId = ApiPath<'team_03'>['teamId']

/* ============================== 요청 타입 ============================== */

export type TeamCreateRequest = ApiBody<'team_01'>
export type TeamUpdateRequest = ApiBody<'team_04'>
export type TeamListQuery = NonNullable<ApiQuery<'team_02'>>
export type TeamSearchQuery = NonNullable<ApiQuery<'team_06'>>

/* ============================== 응답 타입 ============================== */

export type TeamCreated = ApiData<'team_01'>
export type TeamListPage = ApiData<'team_02'>
export type TeamDetail = ApiData<'team_03'>
export type TeamUpdated = ApiData<'team_04'>

export type TeamListItem = NonNullable<TeamListPage['items']>[number]
export type TeamSearchResult = ApiData<'team_06'>
export type TeamSearchItem = TeamSearchResult['items'][number]

/** team_06 `q` 길이 상한. 서버가 trim 뒤 1~50자로 검사한다 — 넘기기 전에 잘라 400을 피한다. */
export const TEAM_SEARCH_QUERY_MAX = 50

/* ============================== 에러 코드 ============================== */

/** 이 절에서 화면이 분기하는 `code`. 공통 코드(§0.10)는 `@/shared/api/errorCodes`. */
export const TeamCode = {
  /** 404 — 존재하지 않는 teamId */
  NOT_FOUND: 'TEAM_NOT_FOUND',
  /**
   * 404 — 요청자(또는 리더) 지갑 미연결.
   * 팀 생성의 선행 조건이라 화면은 이 코드를 "지갑 먼저 연결" 안내로 처리한다.
   * (전용 코드 `WALLET_NOT_LINKED`는 §16.1 신설 제안 상태다 — 지금은 이 코드가 온다)
   */
  WALLET_NOT_FOUND: 'WALLET_NOT_FOUND',
} as const

/* ============================== 목록 파라미터 정규화 ============================== */

/**
 * `undefined` 필드가 있고 없고가 다른 캐시 키가 되므로 목록 파라미터를 한 모양으로 맞춘다.
 * §0.2 범위(page ≥ 0, 1 ≤ size ≤ 100)로 깎아 서버 400을 미리 막는다.
 *
 * team_02에는 `sort`가 없다(page·size만). 정렬 파라미터를 만들어 보내면 서버가 무시하거나
 * 400을 낸다 — 필요해지면 명세부터 고친다.
 */
export function normalizeTeamListQuery(params?: TeamListQuery): TeamListQuery {
  const page = params?.page
  const size = params?.size
  return {
    page: page === undefined || !Number.isFinite(page) ? 0 : Math.max(0, Math.trunc(page)),
    size:
      size === undefined || !Number.isFinite(size)
        ? 20
        : Math.min(100, Math.max(1, Math.trunc(size))),
  }
}

/* ============================== 경로 ============================== */

const ROOT = '/teams'

/* ============================== 요청 함수 ============================== */

/** API-team-01 · `POST /teams` — 201. 만든 회원이 리더가 되고 PERFORMER 역할을 얻는다 */
export function createTeam(body: TeamCreateRequest): Promise<TeamCreated> {
  return api.post<TeamCreated>(ROOT, body)
}

/**
 * API-team-02 · `GET /teams/me` — 내가 **리더인** 팀 목록.
 * 팀이 없으면 404가 아니라 빈 배열 + pageInfo다. 잔액은 Redis 캐시값이며 노드를 조회하지 않는다.
 */
export function fetchMyTeams(query: TeamListQuery): Promise<TeamListPage> {
  return api.get<TeamListPage>(`${ROOT}/me`, { query: query as QueryParams })
}

/** API-team-03 · `GET /teams/{teamId}` — 팀 상세. 그 팀 리더만 조회할 수 있다(403) */
export function fetchTeamDetail(teamId: TeamId): Promise<TeamDetail> {
  return api.get<TeamDetail>(`${ROOT}/${teamId}`)
}

/** API-team-04 · `PATCH /teams/{teamId}` — 전달된 필드만 바꾼다(부분 수정) */
export function updateTeam(teamId: TeamId, body: TeamUpdateRequest): Promise<TeamUpdated> {
  return api.patch<TeamUpdated>(`${ROOT}/${teamId}`, body)
}

/**
 * API-team-06 · `GET /teams/search?q=&size=` — 초대 자동완성(P-04).
 *
 * 이름 부분 일치(대소문자 무시) + 숫자면 팀 ID 정확 일치. 해산 팀 제외, 최대 10건.
 * 결과는 `teamId`·`teamName`·`genre`뿐이다(지갑 주소 없음). `signal`은 디바운스 뒤 이전 요청을
 * 끊는 데 쓴다 — 늦게 도착한 옛 응답이 새 입력의 후보를 덮지 않게 한다.
 */
export function searchTeams(
  query: TeamSearchQuery,
  options: { signal?: AbortSignal } = {},
): Promise<TeamSearchResult> {
  return api.get<TeamSearchResult>(`${ROOT}/search`, {
    query: query as QueryParams,
    signal: options.signal,
  })
}
