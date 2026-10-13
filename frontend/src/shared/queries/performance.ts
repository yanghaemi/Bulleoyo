/**
 * performance 도메인 TanStack Query 훅 — API-performance-01 ~ 15.
 *
 * 정본: `docs/design/06_API_명세서_v6.md` §4 · §0.2 · §0.3 · §0.4 · §0.8
 * 요청 함수는 `@/shared/api/domains/performance`, 키는 `@/shared/queries/keys`에만 있다.
 *
 * ─────────────────────────── 여기서 지키는 규칙 ───────────────────────────
 * 1. **키를 인라인으로 만들지 않는다.** 전부 `qk.performance.*`를 쓴다. 한 곳이 `['performance', id]`로
 *    적어 두면 그 화면만 옛 데이터를 계속 보여주고, 화면은 멀쩡한데 숫자만 틀린다.
 * 2. **목록 파라미터는 훅 안에서 정규화한 뒤** 키에 넣는다. `undefined` 필드가 있고 없고가
 *    다른 캐시 키라, 화면마다 다르게 넘기면 같은 목록이 캐시에 두 벌 생긴다.
 * 3. **202 응답은 끝이 아니다.** `jobId`만 돌려주고 폴링은 하지 않는다 — 폴링은 `GET /chain/jobs/{jobId}`
 *    하나이고(§0.3) member/wallet/chain 그룹의 `useChainJob`이 담당한다. 확정(`CONFIRMED`) 뒤의
 *    최종 무효화도 거기서 `invalidatedBy(txType)`으로 한 번 더 돈다. 여기 무효화는 "접수됨"까지의 것이다.
 * 4. `senderSignedRlp`는 보고 직후 버린다(아래 `discardSignedRlp` 주석).
 */

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'

import {
  acceptParticipation,
  cancelPerformance,
  createPerformance,
  deletePerformance,
  fetchEntryLink,
  fetchParticipants,
  fetchMyPerformanceList,
  fetchPerformanceDetail,
  fetchPerformanceList,
  fetchTicketTypes,
  fetchSalesStatus,
  inviteParticipant,
  normalizeMyPerformanceListQuery,
  normalizePerformanceListQuery,
  prepareDeposit,
  removeParticipant,
  reportDepositSignedTx,
  setTicketTypes,
  updatePerformance,
  type DepositSignedTxRequest,
  type MyPerformanceListItem,
  type MyPerformanceListQuery,
  type ParticipantInviteRequest,
  type ParticipantTeamId,
  type PerformanceCancelRequest,
  type PerformanceCreateRequest,
  type PerformanceId,
  type PerformanceListQuery,
  type PerformanceUpdateRequest,
  type SalesStatus,
  type TicketTypeSetRequest,
} from '@/shared/api/domains/performance'
import { trackSignedTxReport } from '@/shared/blockchain/signingActivity'
import { LIVE_STALE_MS, POLL_MS } from '@/shared/queries/freshness'
import { invalidatedBy, qk } from '@/shared/queries/keys'

/* ============================== 내부 헬퍼 ============================== */

/** 경로 파라미터가 아직 안 정해졌거나(`Number(undefined)` = NaN) 0이면 쿼리를 켜지 않는다. */
function isValidId(id: number | undefined): boolean {
  return typeof id === 'number' && Number.isFinite(id) && id > 0
}

type QueryEnableOptions = { enabled?: boolean }

/* ============================== 조회 ============================== */

/**
 * API-performance-02 · 공개 공연 목록 (A-01 · A-15).
 *
 * 페이지를 넘길 때 이전 페이지를 남겨 목록이 비었다 다시 그려지는 깜빡임을 막는다.
 */
export function usePerformanceList(params?: PerformanceListQuery, options?: QueryEnableOptions) {
  const query = normalizePerformanceListQuery(params)
  return useQuery({
    queryKey: qk.performance.list(query),
    queryFn: () => fetchPerformanceList(query),
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  })
}

/**
 * API-performance-03 · 공연 상세 (A-02).
 *
 * 비로그인도 보지만 **토큰이 있으면 붙여 보낸다** — DRAFT·PENDING_AGREEMENT는 관계자에게만
 * 보이고 그 밖에는 404 `PERFORMANCE_NOT_FOUND`이기 때문이다. 그래서 로그인/로그아웃으로
 * 응답이 달라질 수 있고, 강제 로그아웃 시 클라이언트가 캐시를 통째로 비운다(app/providers).
 */
export function usePerformanceDetail(performanceId: PerformanceId, options?: QueryEnableOptions) {
  return useQuery({
    queryKey: qk.performance.detail(performanceId),
    queryFn: () => fetchPerformanceDetail(performanceId),
    enabled: isValidId(performanceId) && (options?.enabled ?? true),
    // 공연 상태(판매 시작·취소)는 다른 팀·운영자 tx가 바꾼다(freshness.ts).
    staleTime: LIVE_STALE_MS,
  })
}

/**
 * API-performance-15 · 티켓 옵션 조회 (P-03) — **생성자만**.
 *
 * 공개 상세(03)에도 `ticketTypes`가 있지만 금액 shape가 다르다(관객용 중첩 `price.amount` /
 * 여기는 저장 응답과 같은 평면 `priceAmount`). 수정 폼이 저장 전후로 같은 모양을 쓰게 이쪽을 읽는다.
 *
 * 키가 `qk.performance.detail(id)` 접두 아래라 `useSetTicketTypes`의 상세 무효화가 이 캐시도 함께 깨운다.
 */
export function useTicketTypes(performanceId: PerformanceId, options?: QueryEnableOptions) {
  return useQuery({
    queryKey: qk.performance.ticketTypes(performanceId),
    queryFn: () => fetchTicketTypes(performanceId),
    enabled: isValidId(performanceId) && (options?.enabled ?? true),
  })
}

/**
 * API-performance-06 · 내 팀이 주최·참여한 공연 (P-01 대시보드).
 *
 * `refetchIntervalMs`는 스튜디오 홈만 넘긴다(`POLL_MS.studioHome`) — 초대·동의 요청 카드를 다른 팀이
 * 만들기 때문이다. 같은 훅을 쓰는 진입 가드·팀 관리 화면은 주기 갱신이 필요 없어 기본값(끔)이다.
 */
export function useMyPerformanceList(
  params?: MyPerformanceListQuery,
  options?: QueryEnableOptions & { refetchIntervalMs?: number | false },
) {
  const query = normalizeMyPerformanceListQuery(params)
  const interval = options?.refetchIntervalMs ?? false
  return useQuery({
    queryKey: qk.performance.mine(query),
    queryFn: () => fetchMyPerformanceList(query),
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
    // 초대·동의 요청(`pendingSignature`)은 다른 팀이 만든다(freshness.ts).
    staleTime: LIVE_STALE_MS,
    // 오류(권한 등)를 반복 요청하지 않는다.
    refetchInterval: (q) => (interval && q.state.status === 'success' ? interval : false),
    refetchIntervalInBackground: false,
  })
}

/** `useMyPerformancesAll` 키 파라미터. `mine(...)` 아래라 `mines()` 무효화가 그대로 덮는다 */
export const MY_PERFORMANCES_ALL_KEY_PARAMS = {
  scope: 'all',
  size: 100,
  sort: 'startAt,desc',
} as const

export interface MyPerformancesAll {
  items: MyPerformanceListItem[]
  /** 마지막 페이지의 `pageInfo.totalElements`. 서버가 안 주면 undefined */
  totalElements?: number
}

/** 내 공연 전체 — `hasNext`가 끝날 때까지 size 100으로 순회한다 */
export async function fetchAllMyPerformances(signal?: AbortSignal): Promise<MyPerformancesAll> {
  const items: MyPerformanceListItem[] = []
  let totalElements: number | undefined
  let page = 0
  let hasNext = true
  while (hasNext) {
    const result = await fetchMyPerformanceList(
      normalizeMyPerformanceListQuery({
        page,
        size: MY_PERFORMANCES_ALL_KEY_PARAMS.size,
        sort: MY_PERFORMANCES_ALL_KEY_PARAMS.sort,
      }),
      { signal },
    )
    items.push(...(result.items ?? []))
    totalElements = result.pageInfo?.totalElements ?? totalElements
    hasNext = result.pageInfo?.hasNext === true
    page += 1
  }
  return { items, totalElements }
}

/**
 * API-performance-06 **전체** — P-01 참여 공연 표의 클라이언트 필터·페이지네이션용.
 *
 * performance-06은 `status` 단일값만 서버에서 거른다(보증금·정산 상태 필터 없음). 서버 페이지와
 * 클라이언트 필터를 섞으면 "이 페이지에는 맞는 공연이 없다"는 빈 페이지가 생긴다. 회원당 수십 건
 * 규모라 전체를 받아 화면에서 거른다 — API 계약은 그대로다. 서버 필터가 생기면 이 훅을 걷어낸다.
 *
 * `refetchIntervalMs`는 스튜디오 홈만 넘긴다(`POLL_MS.studioHome`) — `useMyPerformanceList`와 같은 이유.
 */
export function useMyPerformancesAll(options?: {
  enabled?: boolean
  refetchIntervalMs?: number | false
}) {
  const interval = options?.refetchIntervalMs ?? false
  return useQuery({
    queryKey: qk.performance.mine(MY_PERFORMANCES_ALL_KEY_PARAMS),
    queryFn: ({ signal }) => fetchAllMyPerformances(signal),
    enabled: options?.enabled ?? true,
    staleTime: LIVE_STALE_MS,
    refetchInterval: (q) => (interval && q.state.status === 'success' ? interval : false),
    refetchIntervalInBackground: false,
  })
}

/**
 * API-performance-06에 단건 조회가 없어 특정 공연의 **내 팀 행을 모두** 찾는 조회.
 *
 * 100건 상한의 첫 페이지만 읽으면 오래된 공연의 주최자·보증금·참여 판정이 사라진다.
 * `pageInfo.hasNext`가 끝날 때까지 순차 조회하고, 같은 공연에 여러 팀으로 속한 경우를 위해
 * 첫 행을 발견해도 나머지 페이지를 끝까지 읽는다. 서버에 단건/관계자 정보가 생기면 이 우회를 제거한다.
 */
export function useMyPerformanceRows(
  performanceId: PerformanceId,
  options?: QueryEnableOptions,
) {
  const query = useInfiniteQuery({
    // 실제 요청은 공연 단건이 아니라 "내 공연 전체"다. 공연 ID를 키에 넣지 않아
    // 다른 공연 화면으로 이동해도 이미 완주한 페이지 캐시를 재사용한다.
    queryKey: qk.performance.mineAllPages(),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchMyPerformanceList(
        normalizeMyPerformanceListQuery({ page: pageParam, size: 100 }),
      ),
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPage.pageInfo?.hasNext
        ? (lastPage.pageInfo.page ?? lastPageParam) + 1
        : undefined,
    enabled: isValidId(performanceId) && (options?.enabled ?? true),
    staleTime: LIVE_STALE_MS,
  })

  const items = useMemo(
    () =>
      query.data?.pages
        .flatMap((page) => page.items ?? [])
        .filter((item) => item.performanceId === performanceId) ?? [],
    [performanceId, query.data],
  )
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query
  const isCrawling = Boolean(query.data && hasNextPage)

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || query.isError) return
    void fetchNextPage()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, query.isError])

  return {
    ...query,
    // 뒤 페이지에 대상 공연이 있을 수 있으므로 중간 결과는 권한 판정에 쓰지 않는다.
    data: query.data && !isCrawling ? { items } : undefined,
    isPending: query.isPending || (!query.isError && isCrawling),
  }
}

/**
 * API-performance-19 · 참여팀 현황(P-04) — INVITED 팀·초대/수락 시각 포함.
 * 키는 `qk.performance.participants`다. 초대·수락·제외 뮤테이션이 `qk.performance.all`을
 * 무효화하므로 성공 직후 이 목록도 다시 읽힌다.
 */
export function useParticipants(performanceId: PerformanceId, options?: QueryEnableOptions) {
  return useQuery({
    queryKey: qk.performance.participants(performanceId),
    queryFn: () => fetchParticipants(performanceId),
    enabled: isValidId(performanceId) && (options?.enabled ?? true),
  })
}

/**
 * API-performance-10 · 검표 링크 조회 (P-04 · P-01).
 *
 * `rotate`는 여기서 절대 넘기지 않는다. 재발급은 부작용이 있는 작업이라
 * `useRotateEntryLink()` mutation으로 분리했다 — 쿼리 재시도·포커스 refetch가
 * 링크를 몰래 갈아끼우면 이미 공유한 링크가 죽는다.
 */
export function useEntryLink(performanceId: PerformanceId, options?: QueryEnableOptions) {
  return useQuery({
    queryKey: qk.performance.entryLink(performanceId),
    queryFn: () => fetchEntryLink(performanceId),
    enabled: isValidId(performanceId) && (options?.enabled ?? true),
  })
}

/**
 * API-performance-11 · 판매·선택 현황 (P-07).
 *
 * 관객 결제를 보여주려고 성공한 현황만 15초마다 갱신한다(`POLL_MS.sales`). 규칙 편집 단계의
 * 409 등 오류를 반복 요청하지 않고, 공연이 끝나거나(ENDED) 취소되면(CANCELLED) 더 팔리지 않으니 멈춘다.
 */
export function useSalesStatus(performanceId: PerformanceId, options?: QueryEnableOptions) {
  return useQuery({
    queryKey: qk.performance.sales(performanceId),
    queryFn: () => fetchSalesStatus(performanceId),
    enabled: isValidId(performanceId) && (options?.enabled ?? true),
    staleTime: LIVE_STALE_MS,
    refetchInterval: (query) => salesPollInterval(query.state),
    refetchIntervalInBackground: false,
  })
}

/** 판매 현황이 더 바뀌지 않는 공연 상태 */
const SALES_TERMINAL: ReadonlySet<string> = new Set(['ENDED', 'CANCELLED'])

/** P-07 주기 갱신 간격. 성공 상태이고 공연이 끝나지 않았을 때만 돈다. */
export function salesPollInterval(state: {
  status: 'pending' | 'error' | 'success'
  data?: Pick<SalesStatus, 'status'>
}): number | false {
  if (state.status !== 'success') return false
  if (state.data?.status && SALES_TERMINAL.has(state.data.status)) return false
  return POLL_MS.sales
}

/* ============================== 변경 ============================== */

/**
 * API-performance-01 · 공연 생성 (P-03).
 * 새 DRAFT가 내 목록에 나타나야 하므로 performance 도메인을 통째로 무효화한다.
 */
export function useCreatePerformance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: PerformanceCreateRequest) => createPerformance(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.performance.all })
    },
  })
}

export type UpdatePerformanceVariables = {
  performanceId: PerformanceId
  body: PerformanceUpdateRequest
}

/**
 * API-performance-04 · 공연 수정 (P-03).
 *
 * 일시·공동 여부를 바꾸면 서버가 **팀별 동의를 전부 PENDING으로 되돌린다**(`agreementsReset`).
 * 그래서 규칙 도메인까지 같이 무효화한다. 빠뜨리면 "동의 완료"가 화면에 남아
 * 판매 시작이 왜 막히는지 알 수 없게 된다.
 */
export function useUpdatePerformance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ performanceId, body }: UpdatePerformanceVariables) =>
      updatePerformance(performanceId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.performance.all })
      void queryClient.invalidateQueries({ queryKey: qk.rule.all })
    },
  })
}

/**
 * API-performance-18 · 공연 삭제 (P-01).
 *
 * 목록에서 행이 사라져야 하므로 performance 도메인을 통째로 무효화하고, 그 공연에 달려 있던
 * 규칙·동의 캐시도 함께 버린다(삭제와 함께 서버에서 사라진 자료다).
 */
export function useDeletePerformance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (performanceId: PerformanceId) => deletePerformance(performanceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.performance.all })
      void queryClient.invalidateQueries({ queryKey: qk.rule.all })
    },
  })
}

export type SetTicketTypesVariables = {
  performanceId: PerformanceId
  body: TicketTypeSetRequest
}

/**
 * API-performance-05 · 티켓 옵션 전체 교체 (P-03).
 * 공개 목록의 `minPriceAmount`·`soldOut`이 따라 바뀌므로 목록도 무효화한다.
 */
export function useSetTicketTypes() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ performanceId, body }: SetTicketTypesVariables) =>
      setTicketTypes(performanceId, body),
    onSuccess: (_data, { performanceId }) => {
      void queryClient.invalidateQueries({ queryKey: qk.performance.detail(performanceId) })
      void queryClient.invalidateQueries({ queryKey: qk.performance.lists() })
    },
  })
}

export type InviteParticipantVariables = {
  performanceId: PerformanceId
  body: ParticipantInviteRequest
}

/** API-performance-07 · 참여팀 초대 (P-04). 규칙 설정 후 초대하면 기존 동의가 초기화된다. */
export function useInviteParticipant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ performanceId, body }: InviteParticipantVariables) =>
      inviteParticipant(performanceId, body),
    onSuccess: (_data, { performanceId }) => {
      // 초대가 같은 회원의 다른 팀에 도착하거나 기존 동의가 초기화될 수 있다.
      void queryClient.invalidateQueries({ queryKey: qk.performance.all })
      void queryClient.invalidateQueries({ queryKey: qk.rule.byPerformance(performanceId) })
    },
  })
}

export type ParticipantVariables = {
  performanceId: PerformanceId
  teamId: ParticipantTeamId
}

/**
 * API-performance-08 · 참여 수락 (P-04).
 * 내 대시보드의 `participationStatus`·`pendingSignature`가 바뀌므로 도메인 전체를 무효화한다.
 */
export function useAcceptParticipation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ performanceId, teamId }: ParticipantVariables) =>
      acceptParticipation(performanceId, teamId),
    onSuccess: (_data, { performanceId }) => {
      void queryClient.invalidateQueries({ queryKey: qk.performance.all })
      void queryClient.invalidateQueries({ queryKey: qk.rule.byPerformance(performanceId) })
    },
  })
}

/** API-performance-09 · 참여팀 제외 (P-04). 규칙 설정 이후면 동의가 초기화된다. */
export function useRemoveParticipant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ performanceId, teamId }: ParticipantVariables) =>
      removeParticipant(performanceId, teamId),
    onSuccess: (_data, { performanceId }) => {
      void queryClient.invalidateQueries({ queryKey: qk.performance.all })
      void queryClient.invalidateQueries({ queryKey: qk.rule.byPerformance(performanceId) })
    },
  })
}

/**
 * API-performance-10(`rotate=true`) · 검표 링크 **재발급** (P-04).
 *
 * GET이지만 이전 링크를 즉시 폐기하는 부작용이 있어 mutation이다. 생성자만 호출할 수 있고
 * 참여팀이 부르면 403 `PERFORMANCE_NOT_OWNER`다. 새 링크를 캐시에 바로 심어
 * 화면이 재조회 없이 QR·URL을 바꿔 보여주게 한다.
 */
export function useRotateEntryLink() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (performanceId: PerformanceId) => fetchEntryLink(performanceId, { rotate: true }),
    onSuccess: (data, performanceId) => {
      queryClient.setQueryData(qk.performance.entryLink(performanceId), data)
    },
  })
}

export type CancelPerformanceVariables = {
  performanceId: PerformanceId
  body: PerformanceCancelRequest
  /**
   * §0.8 멱등키. 호출부가 `newIdempotencyKey()`로 **한 번** 만들어 들고 있다가
   * 재시도할 때 **같은 값**을 다시 넘긴다. 매번 새로 만들면 일괄 환불이 두 번 돈다.
   */
  idempotencyKey: string
}

/**
 * API-performance-12 · 공연 취소·일괄 환불 (P-10) — **202 + jobId**.
 *
 * 여기서 끝나는 게 아니다. 실제 환불·보증금 반환은 job이 확정돼야 반영되므로
 * 반환된 `jobId`를 `useChainJob`에 넘겨 폴링하고, 확정 뒤 최종 무효화를 거기서 한 번 더 한다.
 * 이 자리의 무효화는 "취소 접수됨"을 화면에 반영하기 위한 것이다.
 */
export function useCancelPerformance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ performanceId, body, idempotencyKey }: CancelPerformanceVariables) =>
      cancelPerformance(performanceId, body, idempotencyKey),
    onSuccess: (_data, { performanceId }) => {
      void queryClient.invalidateQueries({ queryKey: qk.performance.all })
      // rule_02 `performanceStatus`·`startSaleAvailable`이 CANCELLED를 따라 바뀐다.
      void queryClient.invalidateQueries({ queryKey: qk.rule.byPerformance(performanceId) })
      void queryClient.invalidateQueries({ queryKey: qk.ticket.all })
      void queryClient.invalidateQueries({ queryKey: qk.order.all })
      void queryClient.invalidateQueries({ queryKey: qk.settlement.all })
      void queryClient.invalidateQueries({ queryKey: qk.verify.all })
    },
  })
}

/* ─────────────── 보증금: prepare → (지갑 서명) → signed-tx (§0.4) ─────────────── */

/**
 * API-performance-13 · 보증금 서명 파라미터 (P-03) — §0.4 ①.
 *
 * 조회처럼 보이지만 POST이고, createShow가 미완이면 서버가 운영자 job을 걸어
 * `prerequisiteJobId`를 내려준다. 캐시에 담지 않는다 — `expiresAt`이 있는 일회용 값이라
 * 재사용하면 만료된 파라미터로 서명하게 된다.
 *
 * 서명 자체는 이 계층이 하지 않는다. 응답의 `signRequests`를 WalletAdapter에 넘기는 것은
 * 지갑 작업 범위이고, 여기는 ①의 호출과 ③의 보고만 담당한다.
 */
export function usePrepareDeposit() {
  return useMutation({
    mutationFn: (performanceId: PerformanceId) => prepareDeposit(performanceId),
  })
}

export type ReportDepositSignedTxVariables = {
  performanceId: PerformanceId
  /** [2026-09-24] 본인 확인 토큰(범위 DEPOSIT·공연). 없으면 헤더를 붙이지 않는다. */
  stepUpToken?: string
} & DepositSignedTxRequest

/**
 * TanStack Query는 `mutate`에 넘긴 **variables 객체를 참조로 붙들고** 있다
 * (`mutation.variables`, devtools, `onSettled` 인자). 그대로 두면 보고가 끝난 뒤에도
 * `senderSignedRlp`가 훅 상태에 남는다. 기술 스택 v3 §3.2는 이 값을 저장소·로그·에러 리포트
 * 어디에도 남기지 말라고 한다. 그래서 보고 직후 그 슬롯을 비운다 — 호출부가 넘긴 바로 그 객체다.
 *
 * 재보고가 필요하면 **지갑에서 다시 서명을 받아라.** 같은 RLP 재보고는 서버가 최초 jobId를
 * 재생하므로 안전하지만(§0.4 — RLP 해시가 자연 멱등키), 이 계층은 그 값을 보관하지 않는다.
 */
function discardSignedRlp(variables: { senderSignedRlp: string }): void {
  variables.senderSignedRlp = ''
}

/**
 * API-performance-14 · 보증금 발신자 서명 RLP 보고 (P-03) — §0.4 ③, **202 + jobId**.
 *
 * 202는 "대납 서명·전송을 접수했다"는 뜻이다. `deposit_status`가 PAID가 되는 건 receipt 검증이
 * 끝난 뒤이므로, 반환된 `jobId`를 `useChainJob`으로 폴링해 CONFIRMED를 확인해야 한다.
 * 확정 시 최종 무효화는 `invalidatedBy('DEPOSIT')`이 담당한다 — 여기서도 같은 매핑을 쓴다.
 */
export function useReportDepositSignedTx() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      performanceId,
      kind,
      senderSignedRlp,
      stepUpToken,
    }: ReportDepositSignedTxVariables) =>
      // 서명을 마친 뒤 보고~확정 대기 동안 "처리 중" 오버레이(signingActivity)
      trackSignedTxReport(() =>
        reportDepositSignedTx(performanceId, { kind, senderSignedRlp }, stepUpToken),
      ),
    onSuccess: () => {
      for (const queryKey of invalidatedBy('DEPOSIT')) {
        void queryClient.invalidateQueries({ queryKey })
      }
      // `invalidatedBy`는 `qk.performance.details()` 접두까지만 잡는다.
      // 대시보드 목록(`qk.performance.mine`)의 `pendingSignature`도 바뀌므로 도메인 전체를 깨운다.
      void queryClient.invalidateQueries({ queryKey: qk.performance.all })
    },
    onSettled: (_data, _error, variables) => {
      discardSignedRlp(variables)
    },
  })
}
