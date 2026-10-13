/**
 * settlement 쿼리·뮤테이션 훅.
 *
 * 정본 · `docs/design/06_API_명세서_v6.md` API-settlement-01~07 · 화면 P-08 · V-03
 * 호출 함수·매퍼는 `@/shared/api/domains/settlement`, 키는 `@/shared/queries/keys`가 정본이다.
 * **쿼리 키를 인라인 배열로 만들지 않는다** — 무효화가 조용히 빗나간다(keys.ts 주석).
 *
 * ───────────────────────── 202를 성공이라고 부르지 않는다 ─────────────────────────
 * aggregate·lock·release는 **접수(202 + jobId)** 까지만 돌아온다. 체인에서 실패해도 이 훅은
 * 성공으로 resolve한다. 화면은 `jobId`를 받아 `GET /chain/jobs/{jobId}` 폴링으로 확정을 기다리고
 * (member/wallet/chain 그룹의 `useChainJob`), **확정 후** `invalidatedBy(txType)`로 무효화한다.
 * 이 파일은 폴링하지 않는다.
 *
 * 여기서 하는 무효화는 **접수 즉시 서버 상태가 바뀌는 것 하나뿐**이다 — 정산 조회의 `actions`.
 * 작업이 진행 중이면 서버가 같은 액션을 `COMMON_CONFLICT`("작업 진행 중")로 막으므로,
 * 버튼이 계속 눌리는 것을 막으려면 접수 직후 한 번 다시 읽어야 한다.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'

import {
  aggregateSettlement,
  approveSettlement,
  createDispute,
  createSettlementShareLink,
  fetchPublicSettlement,
  fetchSettlement,
  lockSettlement,
  releaseSettlement,
} from '@/shared/api/domains/settlement'
import type {
  DisputeCreateRequest,
  PublicSettlement,
  SettlementApproval,
  SettlementData,
  SettlementStatus,
  SettlementDispute,
  SettlementShareLink,
} from '@/shared/api/domains/settlement'
import type { ApiError } from '@/shared/api/client'
import type { ChainJobAccepted } from '@/shared/api/types'
import { LIVE_STALE_MS, POLL_MS } from '@/shared/queries/freshness'
import { qk } from '@/shared/queries/keys'

/**
 * 관리자 이의 **목록 전체**를 잡는 접두.
 *
 * ⚠ `qk.admin.disputes()`는 `['admin','disputes', null]`이라 `['admin','disputes', {필터}]`의
 *   접두가 아니다. 그대로 넘기면 필터가 걸린 목록이 하나도 무효화되지 않는다.
 *   `keys.ts`에 목록용 접두가 생기기 전까지 팩토리 출력에서 params 자리를 잘라 쓴다.
 */
const ADMIN_DISPUTES_PREFIX = qk.admin.disputesAll()

/* =============================== 조회 =============================== */

/** 정산이 더 바뀌지 않는 상태. `RELEASED`는 지급 완료, `HALTED`는 되돌릴 수 없는 중단(§11 [v6]) */
const SETTLEMENT_TERMINAL: ReadonlySet<SettlementStatus> = new Set(['RELEASED', 'HALTED'])

/**
 * P-08 주기 갱신 간격. 성공 상태이고 종단이 아닐 때만 돈다.
 * 오류(403 등)를 반복 요청하지 않고, 종단 뒤에는 바뀔 것이 없으니 멈춘다.
 *
 * ⚠ **종단이어도 보증금이 아직 `PAID`면 계속 돈다.** 서버는 RELEASE 확정을 반영하는 순간
 *   `DEPOSIT_RETURN` job 을 하나 더 건다(`SettlementConfirmationService#applyRelease`).
 *   HALTED 도 전 건 환불이 끝나면 주기 작업이 반환을 건다. 정산 상태만 보고 멈추면 그 반환이
 *   화면에 영영 안 들어와 보증금 패널이 새로고침 전까지 "예치 중"에 머문다(9/24 dev).
 *   `UNPAID`·`RETURNED`·필드 없음이면 더 기다릴 것이 없으니 멈춘다.
 */
export function settlementPollInterval(state: {
  status: 'pending' | 'error' | 'success'
  data?: Pick<SettlementData, 'status'> & { deposit?: Pick<SettlementData['deposit'], 'status'> }
}): number | false {
  if (state.status !== 'success') return false
  if (state.data && SETTLEMENT_TERMINAL.has(state.data.status)) {
    return state.data.deposit?.status === 'PAID' ? POLL_MS.settlement : false
  }
  return POLL_MS.settlement
}

/**
 * API-settlement-01 정산 현황. P-08 화면 전체가 이 하나로 그려진다.
 * 참여팀 소속만 조회할 수 있다(403 `SETTLEMENT_NOT_PARTICIPANT`).
 */
export function useSettlement(
  performanceId: number | undefined,
): UseQueryResult<SettlementData, ApiError> {
  const id = performanceId ?? 0
  return useQuery({
    queryKey: qk.settlement.byPerformance(id),
    queryFn: () => fetchSettlement(id),
    enabled: id > 0,
    staleTime: LIVE_STALE_MS,
    // 상대 팀 조기 동의·자동 release·이의 처리를 반영한다. 실패 후 반복 폴링은 중단한다.
    refetchInterval: (query) => settlementPollInterval(query.state),
    refetchIntervalInBackground: false,
  })
}

/**
 * API-settlement-07 공개 정산 조회(V-03) — **비로그인 경로**.
 *
 * 인증 쿼리와 키를 섞지 않는다(`qk.settlement.publicShare`). 회원 세션이 끝나 캐시를 비울 때
 * 이 데이터까지 날아가면 안 되고, 반대로 이 토큰 조회가 회원 정산 캐시를 덮어써서도 안 된다.
 * 요청 자체도 `Authorization` 없이 나간다(domains/settlement의 `fetchPublicSettlement`).
 */
export function usePublicSettlement(
  shareToken: string | undefined,
): UseQueryResult<PublicSettlement, ApiError> {
  const token = shareToken ?? ''
  return useQuery({
    queryKey: qk.settlement.publicShare(token),
    queryFn: () => fetchPublicSettlement(token),
    enabled: token.length > 0,
  })
}

/* ============================== 상태 전이 ============================== */

/**
 * API-settlement-02 집계 확정 → 202 + jobId(tx_type=AGGREGATE).
 *
 * 409 `SETTLEMENT_AGGREGATE_MISMATCH`는 **집계 확정만 거부**한다 — 정산 상태는 그대로다.
 * 화면이 "정산이 중단됐다"고 쓰면 안 된다.
 */
export function useAggregateSettlement(
  performanceId: number,
): UseMutationResult<ChainJobAccepted, ApiError, void> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => aggregateSettlement(performanceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.settlement.byPerformance(performanceId) })
    },
  })
}

/** API-settlement-03 정산 잠금(이의제기 48h 시작) → 202 + jobId(tx_type=LOCK). */
export function useLockSettlement(
  performanceId: number,
): UseMutationResult<ChainJobAccepted, ApiError, void> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => lockSettlement(performanceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.settlement.byPerformance(performanceId) })
    },
  })
}

export interface ReleaseSettlementVariables {
  /**
   * §0.8 **필수**. 훅이 만들지 않는다 — 재시도할 때 **같은 키를 다시 넘겨야** 한다.
   * 새 키로 재시도하면 서버가 다른 요청으로 보고 팀 지갑에 두 번 지급할 수 있다.
   */
  idempotencyKey: string
  /** 수동 실행 사유(감사 로그) */
  note?: string
  /** [2026-09-24] 본인 확인 토큰(범위 SETTLEMENT_RELEASE·공연). 없으면 헤더를 붙이지 않는다. */
  stepUpToken?: string
}

/**
 * API-settlement-05 release 실행 → 202 + jobId(tx_type=RELEASE). **정산의 종단**이다.
 * 열린 이의가 있으면 409 `SETTLEMENT_DISPUTE_PERIOD`로 막힌다.
 */
export function useReleaseSettlement(
  performanceId: number,
): UseMutationResult<ChainJobAccepted, ApiError, ReleaseSettlementVariables> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: ReleaseSettlementVariables) =>
      releaseSettlement({ performanceId, ...variables }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.settlement.byPerformance(performanceId) })
    },
  })
}

/* ============================== 조기 동의 ============================== */

/**
 * API-settlement-08 정산 조기 동의 → **201 동기**(온체인 tx 아님, `jobId`가 없다).
 *
 * 성공하면 `settlement_01`을 다시 읽는다 — 내 팀의 `approved`, 다른 팀 배지, 그리고
 * 전원이 찼을 때 열리는 `actions.release.available`이 그 한 번의 조회로 같이 바뀐다.
 * `Idempotency-Key`는 붙이지 않는다(§0.8 필수는 release뿐이다).
 */
export function useApproveSettlement(
  performanceId: number,
): UseMutationResult<SettlementApproval, ApiError, { stepUpToken?: string } | void> {
  const queryClient = useQueryClient()
  return useMutation({
    // [2026-09-24] 본인 확인 토큰(범위 SETTLEMENT_APPROVE·공연)이 있으면 헤더로 싣는다.
    mutationFn: (variables: { stepUpToken?: string } | void) =>
      approveSettlement(performanceId, variables ? variables.stepUpToken : undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.settlement.byPerformance(performanceId) })
      // 대시보드 행(performance_06)의 `myTeamSettlementApproved`가 바뀐다 — 헤더·홈 "정산 동의" 할 일이
      // 동기 201 직후 사라져야 한다(체인 job 이 없어 invalidatedBy 가 대신 깨워 주지 않는다).
      void queryClient.invalidateQueries({ queryKey: qk.performance.mines() })
    },
  })
}

/* ============================== 이의제기 ============================== */

/**
 * API-settlement-04 이의제기 접수 → **201 동기**(온체인 tx 아님).
 * 접수 즉시 release 자동 실행이 보류되므로 정산 조회를 다시 읽는다.
 */
export function useCreateDispute(
  performanceId: number,
): UseMutationResult<SettlementDispute, ApiError, DisputeCreateRequest> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: DisputeCreateRequest) => createDispute(performanceId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.settlement.byPerformance(performanceId) })
      // 관리자 대기열의 openCount·releaseHeldCount가 즉시 바뀐다(admin_09).
      void queryClient.invalidateQueries({ queryKey: ADMIN_DISPUTES_PREFIX })
      // 정산이 DISPUTE_OPEN이 된다 — 검증(verify_01)·대시보드 행(performance_06)의 settlementStatus.
      void queryClient.invalidateQueries({ queryKey: qk.verify.byPerformance(performanceId) })
      void queryClient.invalidateQueries({ queryKey: qk.performance.mines() })
    },
  })
}

/* ============================== 공유 링크 ============================== */

/**
 * API-settlement-06 공유 링크 생성 → 201.
 *
 * ⚠ **재발급하면 기존 토큰이 무효화된다.** 그래서 이 값을 `invalidateQueries`로 다시 "조회"하지 않고
 *   (다시 부르면 또 재발급돼 이미 나눠 준 링크가 죽는다) 결과를 `setQueryData`로 캐시에 넣는다.
 *   버튼을 다시 누르는 것만이 재발급이다.
 */
export function useCreateSettlementShareLink(
  performanceId: number,
): UseMutationResult<SettlementShareLink, ApiError, void> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => createSettlementShareLink(performanceId),
    onSuccess: (link) => {
      queryClient.setQueryData(qk.settlement.shareLink(performanceId), link)
    },
  })
}
