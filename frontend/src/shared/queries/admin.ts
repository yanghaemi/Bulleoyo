/**
 * admin 쿼리·뮤테이션 훅 — M-02 이의제기 처리.
 *
 * 정본 · `docs/design/06_API_명세서_v6.md` API-admin-09(목록) · API-admin-06(처리)
 * 호출 함수·매퍼는 `@/shared/api/domains/admin`, 키는 `@/shared/queries/keys`가 정본이다.
 *
 * M-03(코인 지급·표시 환율)은 coin 도메인이다 — `@/shared/queries/coin`을 쓴다.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'

import {
  fetchAdminDisputes,
  normalizeDisputeListParams,
  resolveDispute,
} from '@/shared/api/domains/admin'
import type {
  DisputeAdminList,
  DisputeListParams,
  DisputeResolveRequest,
  DisputeResolveResult,
} from '@/shared/api/domains/admin'
import type { ApiError } from '@/shared/api/client'
import { qk } from '@/shared/queries/keys'

/**
 * 이의 **목록 전체**를 잡는 접두.
 *
 * ⚠ `qk.admin.disputes()`는 `['admin','disputes', null]`이라 필터가 붙은 목록
 *   `['admin','disputes', {status:'OPEN', …}]`의 접두가 아니다. 그대로 `invalidateQueries`에
 *   넘기면 **지금 화면에 떠 있는 목록이 갱신되지 않는다**(처리했는데 대기열에 그대로 남는다).
 *   `keys.ts`에 목록용 접두가 생기기 전까지 팩토리 출력에서 params 자리를 잘라 쓴다.
 */
const ADMIN_DISPUTES_PREFIX = qk.admin.disputesAll()

/* =============================== 조회 =============================== */

/**
 * API-admin-09 이의제기 목록(M-02).
 *
 * 기본 정렬은 **미처리 우선·오래된 순**이다 — release 보류를 풀어야 하는 건이 위로 온다.
 * `summary.releaseHeldCount`는 이의 건수가 아니라 **보류된 정산 수**다(라벨을 섞지 않는다).
 */
export function useAdminDisputes(
  params: DisputeListParams = {},
): UseQueryResult<DisputeAdminList, ApiError> {
  // 키와 요청이 늘 같은 모양이 되도록 여기서 한 번만 정규화한다(keys.ts 주석).
  const normalized = normalizeDisputeListParams(params)
  return useQuery({
    queryKey: qk.admin.disputes(normalized),
    queryFn: () => fetchAdminDisputes(normalized),
  })
}

/* =============================== 변경 =============================== */

export interface ResolveDisputeVariables {
  disputeId: number
  body: DisputeResolveRequest
}

/**
 * API-admin-06 이의제기 처리 — **온체인 tx가 없다**(동기 200). 이의 상태만 바뀐다.
 *
 * `REJECTED`면 release 보류가 풀려 자동 스케줄이 재개된다. `RESOLVED`여도 `AGGREGATED`로
 * 되돌아가지 않는다 — 재집계 경로는 없다(API-admin-06 요구사항).
 *
 * 응답의 `performanceId`로 그 공연의 정산 조회까지 함께 깨운다. `releaseHeld`가 바뀌면
 * P-08의 `actions.release`도 함께 바뀌기 때문이다.
 */
export function useResolveDispute(): UseMutationResult<
  DisputeResolveResult,
  ApiError,
  ResolveDisputeVariables
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: ResolveDisputeVariables) =>
      resolveDispute(variables.disputeId, variables.body),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_DISPUTES_PREFIX })
      if (result.performanceId > 0) {
        void queryClient.invalidateQueries({
          queryKey: qk.settlement.byPerformance(result.performanceId),
        })
        // 판정으로 정산 상태(DISPUTE_OPEN ↔ LOCKED)가 바뀌면 검증 화면의 `settlementStatus`와
        // 스튜디오 대시보드 행의 `settlementStatus`도 따라 바뀐다.
        void queryClient.invalidateQueries({
          queryKey: qk.verify.byPerformance(result.performanceId),
        })
        void queryClient.invalidateQueries({ queryKey: qk.performance.mines() })
      }
    },
  })
}
