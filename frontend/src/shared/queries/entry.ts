/**
 * entry 쿼리 훅 — API-entry-01 · 02 (S-02 검표 · S-03 입장 현황).
 *
 * ─────────────────────────── 이 도메인만 인증이 다르다 ───────────────────────────
 * S-02·S-03은 비로그인 화면이다. `entryToken`(검표 링크 토큰)을 넘기면 `X-Entry-Token`으로,
 * 넘기지 않으면 로그인한 참여팀 회원의 `Authorization`으로 나간다(domains/entry.ts가 가른다).
 *
 * ⚠ `ENTRY_QR_EXPIRED`·`ENTRY_QR_SIGNATURE_INVALID`는 **401이지만 세션 만료가 아니다.**
 *   훅은 이 에러를 삼키거나 로그인으로 보내지 않는다 — `ApiError.code` 그대로 화면에 올려
 *   "다시 스캔해 주세요"로 처리하게 둔다. 스캔 도중 로그인 화면으로 튕기면 검표가 멈춘다.
 *   `retry`도 걸지 않는다(전역 기본값이 ApiError에 재시도하지 않는다). 만료 QR은 다시 보내도 같다.
 *
 * 토큰은 쿼리 키에 넣지 않는다 — 캐시 키·devtools에 링크 토큰이 남지 않게 하고,
 * 같은 공연이면 인증 경로가 달라도 같은 자원이기 때문이다.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  fetchEntries,
  verifyEntry,
  type EntryAuth,
  type EntryListQuery,
  type EntryVerifyRequest,
  type EntryVerifyResult,
} from '@/shared/api/domains/entry'
import { qk } from '@/shared/queries/keys'

/** 서버가 요약값을 5초 캐시한다(PERF-01). 그보다 잦게 물어도 같은 값이 온다. */
const ENTRY_SUMMARY_CACHE_MS = 5_000

/* ------------------------------ 입장 현황 ------------------------------ */

/** 기본값은 openapi `entry_02`의 default와 같다. 키와 요청이 같은 객체를 쓴다. */
function normalizeEntryListParams(params: EntryListQuery): EntryListQuery {
  return {
    result: params.result,
    page: params.page ?? 0,
    size: params.size ?? 20,
  }
}

export interface UseEntriesOptions {
  enabled?: boolean
  /** 현장 보드라 기본으로 5초마다 갱신한다. `false`면 수동 갱신만. */
  refetchIntervalMs?: number | false
}

/**
 * API-entry-02 입장 현황·이력(S-03).
 * 실패 건(중복 시도·만료 QR)도 함께 오므로 현장에서 원인을 바로 본다.
 */
export function useEntries(
  params: { performanceId: number | undefined } & EntryListQuery,
  auth: EntryAuth = {},
  options: UseEntriesOptions = {},
) {
  const { performanceId, ...listParams } = params
  const normalized = normalizeEntryListParams(listParams)

  return useQuery({
    queryKey: qk.entry.byPerformance(performanceId ?? 0, normalized),
    queryFn: ({ signal }) =>
      fetchEntries({ performanceId: performanceId as number, ...normalized }, auth, { signal }),
    enabled: (options.enabled ?? true) && typeof performanceId === 'number',
    staleTime: ENTRY_SUMMARY_CACHE_MS,
    refetchInterval: options.refetchIntervalMs ?? ENTRY_SUMMARY_CACHE_MS,
    refetchIntervalInBackground: false,
  })
}

/* ------------------------------ QR 검증 ------------------------------ */

/**
 * API-entry-01 QR 검증·입장 처리(S-02).
 *
 * 성공하면 `enteredCount`/`totalIssuedCount`가 함께 와서 S-03을 기다리지 않고 바로 표시할 수 있다.
 * 판정 결과와 무관하게(성공·실패 모두) 서버가 검표 이력을 남기므로 **실패해도 현황을 다시 받는다.**
 *
 * 온체인·코인과 무관하다 — 지갑·정산 쿼리는 건드리지 않는다(v4).
 */
export function useVerifyEntry(auth: EntryAuth = {}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (variables: EntryVerifyRequest): Promise<EntryVerifyResult> =>
      verifyEntry(variables, auth),
    onSettled: () => {
      // 목록 파라미터가 제각각이라 접두(`['entry']`)로 한 번에 깨운다.
      queryClient.invalidateQueries({ queryKey: qk.entry.all })
    },
  })
}
