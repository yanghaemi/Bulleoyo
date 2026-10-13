/**
 * chain 쿼리 훅 — 비동기 tx 폴링 (API v6 §0.3 · API-chain-01).
 *
 * ─────────────────────── 왜 이 파일 하나만 있어야 하는가 ───────────────────────
 * 202를 내려주는 API가 결제·환불·정산·지급·공연 등록에 흩어져 있지만 **폴링 경로는 하나**다.
 * 화면마다 `setInterval`을 만들면 ① 확정 후에도 계속 부르거나 ② 확정했는데 관련 화면을
 * 갱신하지 않는 사고가 도메인 수만큼 생긴다. 그래서 폴링 규칙과 무효화 규칙을 여기 모은다.
 *
 * 규칙 세 줄 —
 *   1. `PENDING`·`SUBMITTED`일 때만 폴링한다.
 *   2. 간격은 응답의 `pollAfterMs`(기본 1500)를 쓴다. 서버가 혼잡하면 늘려 내려준다.
 *   3. `CONFIRMED`면 `invalidatedBy(txType)`가 돌려주는 키를 **전부** 무효화한다.
 *      "무엇을 다시 불러야 하나"를 화면이 판단하면 지갑 잔액을 반드시 빠뜨린다(keys.ts).
 *
 * 사용례
 * ```tsx
 * const { job, isPolling } = useChainJob(grantJobId, {
 *   onConfirmed: () => toast('지급이 완료됐습니다'),
 * })
 * ```
 * `jobId`가 아직 없으면(202를 받기 전) `null`·`undefined`를 그대로 넘긴다 — 훅이 꺼져 있는다.
 */

import { useEffect, useRef, useState } from 'react'
import { queryOptions, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'

import {
  DEFAULT_POLL_AFTER_MS,
  getChainJob,
  nextPollInterval,
  type ChainJobView,
} from '@/shared/api/domains/chain'
import {
  claimSigningJob,
  releaseSigningJob,
  releaseSigningJobNow,
} from '@/shared/blockchain/signingActivity'
import { invalidatedBy, qk } from '@/shared/queries/keys'

export type { ChainJobView } from '@/shared/api/domains/chain'
export { DEFAULT_POLL_AFTER_MS, isChainTimeout } from '@/shared/api/domains/chain'

/**
 * 폴링을 포기하는 상한.
 *
 * 서버 워커의 receipt 재조회 상한과 **같은 값이어야 한다**
 * (`backend/src/main/resources/application.yml` `b204.chain.worker.receipt-timeout-seconds: 120`).
 * 한쪽만 바꾸면 어긋난다.
 *
 * 정상 운영에서는 이 상한에 닿지 않는다 — 워커가 그 시간에 job 을 종단 상태로 닫기 때문이다.
 * 닿는 경우는 **워커가 돌지 않을 때**다(체인 설정 누락·소유권을 쥔 인스턴스 사망 등). 그때
 * `PENDING` 이 영영 유지되는데, 상한이 없으면 화면이 "처리 중"에서 무한히 돈다.
 */
export const CHAIN_JOB_POLL_TIMEOUT_MS = 120_000

/**
 * job 폴링 쿼리 정의.
 *
 * `useQueries`로 job 여러 개를 동시에 지켜봐야 하는 화면(결제의 approve + purchase 등)이
 * 폴링 규칙을 다시 쓰지 않도록 factory로 노출한다.
 */
export function chainJobQuery(jobId: string) {
  return queryOptions({
    queryKey: qk.chain.job(jobId),
    queryFn: ({ signal }) => getChainJob(jobId, { signal }),
    // 폴링 대상이라 캐시를 신선하다고 볼 이유가 없다. 확정 후에는 refetchInterval이 false가 된다
    staleTime: 0,
    refetchInterval: (query) => nextPollInterval(query.state.data, query.state.error),
    // 탭이 가려져 있어도 확정을 놓치면 안 된다(결제 중 앱 전환은 흔하다)
    refetchIntervalInBackground: true,
    // 재시도는 refetchInterval이 대신한다. 504 타임아웃도 다음 주기에 다시 부른다
    retry: false,
  })
}

/**
 * 확정된 job이 바꾼 도메인 캐시를 무효화한다.
 *
 * 훅 밖(뮤테이션 `onSuccess` 등)에서도 쓸 수 있게 순수 함수로 뺐다.
 * - `CONFIRMED` — 항상 무효화한다.
 * - `FAILED` — 원칙적으로 상태가 바뀌지 않았지만, **부분 성공**(공연 취소 일괄 환불·release)은
 *   `results`에 성공 건이 섞여 있다. 그때만 무효화한다(§0.3 · 규격 §1 부분 성공).
 */
export function invalidateForChainJob(queryClient: QueryClient, job: ChainJobView): void {
  if (!job.knownTxType) return // 매핑이 모르는 tx(신설 CREATE_SHOW 등)는 건너뛴다
  const partiallySucceeded = (job.results?.length ?? 0) > 0
  if (!job.isConfirmed && !(job.isFailed && partiallySucceeded)) return

  for (const queryKey of invalidatedBy(job.knownTxType)) {
    void queryClient.invalidateQueries({ queryKey })
  }
}

export interface UseChainJobOptions {
  /** 기본 true. 화면이 보이지 않는 동안 끄고 싶을 때 false */
  enabled?: boolean
  /** `CONFIRMED` 진입 시 1회. 무효화는 훅이 이미 했다 */
  onConfirmed?: (job: ChainJobView) => void
  /** `FAILED` 진입 시 1회. `failureReason`·`verification`으로 문구를 고른다 */
  onFailed?: (job: ChainJobView) => void
}

/**
 * 온체인 작업 하나를 확정까지 지켜본다.
 *
 * @param jobId 202 응답의 `jobId`. 아직 없으면 `null`·`undefined`
 */
export function useChainJob(jobId: string | null | undefined, options: UseChainJobOptions = {}) {
  const queryClient = useQueryClient()
  const enabled = (options.enabled ?? true) && Boolean(jobId)

  /**
   * 같은 종단 상태로 두 번 알리지 않기 위한 표식(`jobId:status`).
   * 아래 "감시 대상 교체" 효과가 지우므로 선언이 그보다 앞에 있어야 한다.
   */
  const handledRef = useRef<string | null>(null)
  /** 지금 지켜보는 jobId. 표식을 지울 때(= 대상이 바뀔 때)를 판정한다 */
  const watchedRef = useRef<string | null>(null)

  // 상한 타이머. jobId 가 바뀌면 처음부터 다시 잰다.
  const [timedOut, setTimedOut] = useState(false)
  useEffect(() => {
    // 감시 대상이 바뀌었다(다른 job, 또는 비움) — 직전 대상에서 처리한 표식을 버린다.
    //
    // ⚠ 이 분기가 없으면 **같은 jobId 가 같은 종단 상태로 다시 올 때 콜백이 영영 안 불린다.**
    //   멱등키를 지켜 재시도하면(§0.8) 서버는 FAILED job 도 **같은 jobId 로 재생**한다
    //   (`SettlementService`·`CoinGrantService`). 그때 표식이 남아 있으면 `onFailed` 가
    //   막혀 호출부의 약속이 매달리고, 실패가 120초 뒤 `CHAIN_TX_TIMEOUT`(= "지연")으로
    //   둔갑한다. 재시도할수록 실패를 늦게 아는 화면이 된다.
    //
    // ⚠ 반대로 지우는 조건을 `enabled` 까지 넓히면 안 된다. `enabled` 만 끄고 켜는 것(화면 숨김)은
    //   새 감시가 아니다 — 그때 지우면 이미 알린 CONFIRMED 가 재조회로 다시 와서 `onConfirmed` 가
    //   한 번 더 불리고, 콜백 안의 이동·토스트가 두 번 난다. 재시도로 같은 jobId 를 다시 지켜보려면
    //   호출부가 jobId 를 한 번 비운다(`setWatchedJobId(null)` → 다시 같은 id). 결제·보증금·정산
    //   호출부는 이미 그렇게 한다(`settle` → `setWatchedJobId(null)`).
    //
    //   리렌더·포커스 refetch 는 `jobId` 를 바꾸지 않으므로 중복 방지는 그대로다.
    const target = jobId ?? null
    if (watchedRef.current !== target) {
      watchedRef.current = target
      handledRef.current = null
    }
    if (!enabled) return
    setTimedOut(false)
    const timer = window.setTimeout(() => setTimedOut(true), CHAIN_JOB_POLL_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [jobId, enabled])

  const query = useQuery({
    ...chainJobQuery(jobId ?? ''),
    enabled,
    // 상한에 닿으면 폴링을 멈춘다. 종단 상태가 이미 왔으면 refetchInterval 이 스스로 false 다.
    refetchInterval: timedOut ? false : chainJobQuery(jobId ?? '').refetchInterval,
  })

  // 콜백을 ref에 담는다. 인라인 화살표 함수를 deps에 넣으면 매 렌더 효과가 다시 돈다
  const onConfirmedRef = useRef(options.onConfirmed)
  const onFailedRef = useRef(options.onFailed)
  useEffect(() => {
    onConfirmedRef.current = options.onConfirmed
    onFailedRef.current = options.onFailed
  })

  // 같은 종단 상태로 두 번 알리지 않는다(리렌더·포커스 refetch로 같은 데이터가 다시 온다).
  // 표식은 위에서 선언하고 "새 감시 시작"마다 지운다.
  const job = query.data

  useEffect(() => {
    if (!job || !job.isTerminal) return
    const mark = job.jobId + ':' + job.status
    if (handledRef.current === mark) return
    handledRef.current = mark

    invalidateForChainJob(queryClient, job)

    if (job.isConfirmed) onConfirmedRef.current?.(job)
    else onFailedRef.current?.(job)
    // 콜백 **다음에** 놓는다. 연속 서명이면 콜백이 다음 서명을 시작해 오버레이가 이어진다.
    releaseSigningJobNow(job.jobId)
  }, [job, queryClient])

  // 서명 보고가 맡긴 job이면 오버레이(signingActivity)의 확정 대기를 이 훅이 이어받는다.
  // 맡겨진 job이 아니면(운영자 tx 등) 두 함수 모두 아무것도 하지 않는다.
  useEffect(() => {
    if (!enabled || !jobId) return
    claimSigningJob(jobId)
    return () => releaseSigningJob(jobId)
  }, [jobId, enabled])

  // 폴링 상한 — 화면이 "지연" 안내를 띄우므로 오버레이가 가리지 않게 놓는다
  useEffect(() => {
    if (timedOut && jobId) releaseSigningJobNow(jobId)
  }, [timedOut, jobId])

  return {
    // 쿼리 결과를 펼쳐 `isError`·`error`·`refetch`를 그대로 쓴다. (v5의 속성 추적 최적화는
    // 꺼지지만, 폴링 훅은 상태가 바뀔 때마다 다시 그리는 것이 목적이라 손해가 없다)
    ...query,
    /** 뷰모델. 아직 응답 전이면 undefined */
    job,
    /** 폴링 중인가(`PENDING`·`SUBMITTED`) */
    isPolling: timedOut ? false : (job?.isPolling ?? (enabled && query.isPending)),
    isConfirmed: job?.isConfirmed ?? false,
    isFailed: job?.isFailed ?? false,
    /**
     * 상한(120초)에 닿아 폴링을 멈췄다. 호출부가 "확정이 늦어지고 있습니다"를 안내하고
     * `refetch()` 를 열어 준다. 종단 상태로 끝났으면 false 다.
     */
    timedOut: timedOut && !(job?.isTerminal ?? false),
    /** 다음 폴링까지 권장 대기. 진행률 표시가 필요할 때 쓴다 */
    pollAfterMs: job?.pollAfterMs ?? DEFAULT_POLL_AFTER_MS,
  }
}
