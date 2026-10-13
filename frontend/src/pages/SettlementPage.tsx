/**
 * P-08 정산 대시보드 페이지 — 라우트 `/studio/performances/:id/settlement`.
 *
 * 이 파일은 **조립만** 한다. 껍데기(`StudioShell`)와 본문(`SettlementDashboard`)은 features에
 * 있고 여기서는 훅을 붙여 넘긴다. **페이지는 `api`를 직접 부르지 않는다.**
 *
 * ── API (S15P21B204-102) ───────────────────────────────────────────────
 *   정산 조회: `GET /api/v1/performances/{performanceId}/settlement` (API-settlement-01) — `useSettlement`
 *              화면 전체가 이 하나로 그려진다.
 *   집계 확정: `POST …/settlement/aggregate` (settlement-02) → **202 + jobId**
 *   정산 잠금: `POST …/settlement/lock`      (settlement-03) → **202 + jobId**
 *   release  : `POST …/settlement/release`   (settlement-05) → **202 + jobId**, `Idempotency-Key` 필수
 *   이의제기 : `POST …/settlement/disputes`  (settlement-04) → **201 동기**(온체인 tx 아님)
 *   조기 동의: `POST …/settlement/approvals` (settlement-08) → **201 동기**(온체인 tx 아님).
 *              참여팀 전원이 동의하면 48h 이의제기 기간 없이 release가 열린다. 멱등키 없음
 *   공유 링크: `POST …/settlement/share-link`(settlement-06) → 201. 재발급하면 이전 토큰이 죽는다
 *   작업 폴링: `GET /api/v1/chain/jobs/{jobId}` (chain-01) — `useChainJob`
 *   공연명   : `GET /api/v1/performances/{id}` (performance-03) — `usePerformanceDetail`
 *              ⚠ settlement_01 응답에 공연명이 없다(P-07·S-03이 같은 문제).
 *   팀 목록  : `GET /api/v1/teams/me` (team-02) — `useMyTeams`. 껍데기 팀 전환용이다.
 *   에러     : `SETTLEMENT_NOT_PARTICIPANT`(403) · `PERFORMANCE_NOT_FOUND`(404) ·
 *              `COMMON_INTERNAL_ERROR`(500) · `COMMON_UNAUTHORIZED`(401 → 조용히 재발급, §1.2 원칙 10).
 *              분기는 `code`로만 한다 — `msg`로 분기하지 않는다(응답 규격 §1).
 *
 * ── 202는 성공이 아니다 ────────────────────────────────────────────────
 *   세 전이(aggregate·lock·release)는 **접수**까지만 돌아온다. 체인에서 실패해도 뮤테이션은
 *   성공으로 resolve한다. 그래서 `jobId`를 `useChainJob`에 넘겨 CONFIRMED/FAILED까지 기다린
 *   **뒤에야** 본문에 결과를 돌려준다(`SettlementDashboard`는 그동안 "처리 중"을 유지한다).
 *   폴링 상한(120초)에 닿으면 실패와 구분해 `CHAIN_TX_TIMEOUT`으로 알린다 — 워커가 멎었을 때
 *   "처리 중"에서 영원히 도는 것을 막는다.
 *
 * ── release 멱등키는 페이지가 보관한다 ─────────────────────────────────
 *   §0.8 필수 헤더이고 훅이 만들어 주지 않는다. **재시도에 같은 키를 다시 넘긴다** —
 *   새 키로 재시도하면 서버가 다른 요청으로 보고 팀 지갑에 **두 번 지급**한다. 그래서 키를
 *   `useRef`에 한 번 만들어 두고 이 화면이 살아 있는 동안 계속 쓴다. 이 경로는 lazy하게
 *   넘기지 않는다(호출 시점에 즉석 생성 금지).
 *
 * ── `available: true`여도 409가 날 수 있다 ─────────────────────────────
 *   집계 대사(`SETTLEMENT_AGGREGATE_MISMATCH`)와 release 직전 에스크로 잔액
 *   (`COIN_ESCROW_INSUFFICIENT`)은 **체인을 읽어야 알 수 있어** 조회 시점의 `actions`에
 *   반영되지 않는다(settlement_01 요구사항). 실행 결과의 `code`를 그대로 본문에 돌려주고,
 *   본문이 `settlementMessages` 표로 사전 차단과 **같은 문구**를 쓴다.
 *
 * ── 이의제기 기간 ──────────────────────────────────────────────────────
 *   기본 48시간이지만 리허설에서는 `SETTLEMENT_DISPUTE_PERIOD=PT1M`으로 줄인다. 화면은 48을
 *   상수로 갖지 않고 서버가 준 `disputeClosesAt`만으로 남은 시간을 센다(`formatRemaining`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'

import { SettlementDashboard } from '@/features/studio/SettlementDashboard'
import type {
  SettlementActionResult,
  SettlementShareLinkResult,
} from '@/features/studio/SettlementDashboard'
import { StudioShell } from '@/features/studio/StudioShell'
import type { StudioTeamRef } from '@/features/studio/StudioShell'
import { isApiError, newIdempotencyKey } from '@/shared/api/client'
import { WEBAUTHN_STEP_UP_REQUIRED, type StepUpAction } from '@/shared/api/domains/webauthn'
import { useStepUp } from '@/shared/auth/useStepUp'
import { StepUpDialog } from '@/shared/ui/StepUpDialog'
import { useLocale } from '@/shared/i18n/useLocale'
import { usePerformanceDetail } from '@/shared/queries/performance'
import {
  useAggregateSettlement,
  useApproveSettlement,
  useCreateDispute,
  useCreateSettlementShareLink,
  useLockSettlement,
  useReleaseSettlement,
  useSettlement,
} from '@/shared/queries/settlement'
import { useChainJob } from '@/shared/queries/chain'
import { useMyTeams } from '@/shared/queries/team'

/** 라우트 파라미터는 사람이 고칠 수 있다. 숫자가 아니면 조회를 걸지 않는다 */
function toPerformanceId(raw: string | undefined): number | undefined {
  const parsed = raw && /^\d+$/.test(raw) ? Number(raw) : NaN
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

/** 체인 작업이 종단에서 실패했다. 서버 `failureReason`이 곧 규격 code다 */
class JobFailure extends Error {
  readonly code: string
  constructor(code: string) {
    super(code)
    this.name = 'JobFailure'
    this.code = code
  }
}

/** 실패를 본문이 쓰는 `{ ok, code, msg }`로 옮긴다. 분기는 `code`로만 한다 */
function toFailure(error: unknown): SettlementActionResult {
  if (isApiError(error)) return { ok: false, code: error.code, msg: error.msg }
  if (error instanceof JobFailure) return { ok: false, code: error.code }
  // 네트워크 단절 등 규격 래퍼를 못 받은 경우. 코드를 지어내지 않고 공통 코드로 떨어뜨린다
  return { ok: false, code: 'COMMON_INTERNAL_ERROR' }
}

export function SettlementPage() {
  const { text } = useLocale()
  const performanceId = toPerformanceId(useParams().id)
  const enabled = performanceId !== undefined
  const id = performanceId ?? 0

  const settlement = useSettlement(performanceId)
  const detail = usePerformanceDetail(id, { enabled })
  const myTeams = useMyTeams()

  const aggregate = useAggregateSettlement(id)
  const lock = useLockSettlement(id)
  const release = useReleaseSettlement(id)
  const dispute = useCreateDispute(id)
  const approve = useApproveSettlement(id)
  const shareLink = useCreateSettlementShareLink(id)
  /** [2026-09-24] 본인 확인(API v7 §7.W). settlement_01 의 `stepUpRequired`가 true일 때만 쓰인다. */
  const stepUp = useStepUp()
  const stepUpRequired = settlement.data?.stepUpRequired === true

  /**
   * 조기 동의·정산금 지급 직전 본인 확인. 스위치가 꺼져 있으면 아무것도 하지 않는다(`{}`).
   * 지갑 서명이 없는 동작이라 토큰을 받으면 같은 흐름에서 곧바로 요청한다. 취소는 `cancelled`
   * — 대시보드가 문구 없이 원래 상태로 돌린다.
   */
  const stepUpFor = useCallback(
    async (action: StepUpAction): Promise<{ token?: string; stop?: SettlementActionResult }> => {
      if (!stepUpRequired) return {}
      const outcome = await stepUp.request({ action, targetId: id })
      if (outcome.kind === 'token') return { token: outcome.token }
      if (outcome.kind === 'cancelled') return { stop: { ok: false, cancelled: true } }
      if (outcome.kind === 'unsupported') {
        return {
          stop: {
            ok: false,
            code: WEBAUTHN_STEP_UP_REQUIRED,
            msg: text(
              '이 기기는 본인 확인을 지원하지 않습니다.',
              'This device doesn’t support identity verification.',
            ),
          },
        }
      }
      return { stop: toFailure(outcome.error) }
    },
    [id, stepUp, stepUpRequired, text],
  )

  /** 껍데기 사이드 메뉴의 "팀" 링크가 가리킬 팀. 공연은 바뀌지 않는다 */
  const [pickedTeamId, setPickedTeamId] = useState<number | undefined>()

  /**
   * release 멱등키(§0.8). **한 번 만들어 재시도에도 같은 값을 쓴다.**
   * 호출 시점에 만들면 "다시 시도"가 새 요청이 되어 두 번 지급될 수 있다.
   */
  const releaseKeyRef = useRef(newIdempotencyKey())

  /* ── 체인 job 하나를 확정까지 기다리는 약속(P-03·P-06과 같은 모양) ───── */

  const [watchedJobId, setWatchedJobId] = useState<string | null>(null)
  const waiterRef = useRef<{ resolve: () => void; reject: (error: unknown) => void } | null>(null)

  const settle = useCallback((outcome: (waiter: NonNullable<typeof waiterRef.current>) => void) => {
    const waiter = waiterRef.current
    waiterRef.current = null
    setWatchedJobId(null)
    if (waiter) outcome(waiter)
  }, [])

  const job = useChainJob(watchedJobId, {
    onConfirmed: () => settle((waiter) => waiter.resolve()),
    onFailed: (failed) =>
      settle((waiter) =>
        // 무효화는 훅이 이미 했고, 화면은 다시 읽은 `shares[].released`로 팀별 상태를 본다 —
        // 여기서 합성하지 않는다.
        //
        // ⚠ **release에 "팀별 부분 성공"은 없다.** 명세 §11-05가 그렇게 적었고 한때 이 주석도
        //   그걸 따랐지만, 컨트랙트 `release(showId)`는 팀 전원 transfer를 도는 **단일 원자
        //   tx**라 한 팀이 revert하면 tx 전체가 되돌아간다(`RevenueSplitter.sol`). 서버도
        //   CONFIRMED면 전 share를 released로, FAILED면 하나도 건드리지 않는다. 그래서
        //   `chain_01`의 `results[]`는 **항상 null**이다(백엔드에 채우는 코드가 없다).
        //   여기서 건별 상태를 만들어 내려 하지 마라 — 없는 것을 그리게 된다.
        waiter.reject(new JobFailure(failed.failureReason ?? 'COMMON_INTERNAL_ERROR')),
      ),
  })

  // 폴링 상한(120초)에 닿으면 훅이 폴링을 멈춘다. 약속을 그대로 두면 "처리 중"이 영영 돈다
  useEffect(() => {
    if (!job.timedOut) return
    settle((waiter) => waiter.reject(new JobFailure('CHAIN_TX_TIMEOUT')))
  }, [job.timedOut, settle])

  const waitForJob = useCallback(
    (jobId: string) =>
      new Promise<void>((resolve, reject) => {
        waiterRef.current = { resolve, reject }
        setWatchedJobId(jobId)
      }),
    [],
  )

  /* ── 운영자 액션 ────────────────────────────────────────────────────── */

  const onAction = useCallback(
    async (action: 'aggregate' | 'lock' | 'release'): Promise<SettlementActionResult> => {
      try {
        let stepUpToken: string | undefined
        if (action === 'release') {
          const gate = await stepUpFor('SETTLEMENT_RELEASE')
          if (gate.stop) return gate.stop
          stepUpToken = gate.token
        }
        const accepted =
          action === 'aggregate'
            ? await aggregate.mutateAsync()
            : action === 'lock'
              ? await lock.mutateAsync()
              : await release.mutateAsync({
                  idempotencyKey: releaseKeyRef.current,
                  ...(stepUpToken ? { stepUpToken } : {}),
                })
        // 202는 접수일 뿐이다. 확정까지 기다린 뒤에만 성공이라고 말한다
        await waitForJob(accepted.jobId)
        return { ok: true }
      } catch (error) {
        if (isApiError(error) && error.code === WEBAUTHN_STEP_UP_REQUIRED) stepUp.clear()
        return toFailure(error)
      }
    },
    [aggregate, lock, release, stepUp, stepUpFor, waitForJob],
  )

  /** 이의제기는 201 동기다(온체인 작업이 아니다) — 폴링이 없다 */
  const myTeamId = settlement.data?.myTeam?.teamId
  const onDispute = useCallback(
    async (reason: string): Promise<SettlementActionResult> => {
      // 참여팀 정보가 없으면 `teamId`를 만들 수 없다. 서버가 400으로 돌려보낼 요청을 보내지 않는다
      if (myTeamId == null) return { ok: false, code: 'SETTLEMENT_NOT_PARTICIPANT' }
      try {
        await dispute.mutateAsync({ teamId: myTeamId, reason })
        return { ok: true }
      } catch (error) {
        return toFailure(error)
      }
    },
    [dispute, myTeamId],
  )

  /** 조기 동의(settlement_08)도 201 동기다 — 폴링이 없고 멱등키도 붙이지 않는다 */
  const onApprove = useCallback(async (): Promise<SettlementActionResult> => {
    try {
      const gate = await stepUpFor('SETTLEMENT_APPROVE')
      if (gate.stop) return gate.stop
      await approve.mutateAsync(gate.token ? { stepUpToken: gate.token } : undefined)
      return { ok: true }
    } catch (error) {
      if (isApiError(error) && error.code === WEBAUTHN_STEP_UP_REQUIRED) stepUp.clear()
      return toFailure(error)
    }
  }, [approve, stepUp, stepUpFor])

  /**
   * 공유 링크 생성·재발급. `shareUrl`은 **서버가 완성해 준 절대 URL**이라 그대로 넘긴다 —
   * origin을 붙여 조립하지 않는다(§0.7).
   */
  const onCreateShareLink = useCallback(async (): Promise<SettlementShareLinkResult> => {
    try {
      return { ok: true, link: await shareLink.mutateAsync() }
    } catch (error) {
      return toFailure(error)
    }
  }, [shareLink])

  /* ── 화면 값 ────────────────────────────────────────────────────────── */

  const teams: StudioTeamRef[] = useMemo(
    () =>
      (myTeams.data?.items ?? []).flatMap((item) =>
        item.teamId != null && item.teamName
          ? [{ teamId: item.teamId, teamName: item.teamName }]
          : [],
      ),
    [myTeams.data],
  )

  const error = isApiError(settlement.error) ? settlement.error : undefined
  // 숫자가 아닌 주소의 공연은 실제로 없다 — 조회를 걸지 않고 안내만 띄운다
  const errorMsg = !enabled
    ? text('공연을 찾을 수 없습니다.', 'Show not found.')
    : settlement.isError
      ? error?.msg ||
        text(
          '정산 현황을 갱신하지 못했어요. 다시 시도해 주세요.',
          'Could not refresh settlement. Please try again.',
        )
      : undefined

  // ⚠ 공연명은 settlement_01에 없다. 상세가 안 오면 화면 이름으로 둔다(지어내지 않는다)
  const title = detail.data?.title ?? text('정산', 'Settlement')

  return (
    <StudioShell
      teams={teams}
      activeTeamId={pickedTeamId}
      onTeamChange={setPickedTeamId}
      title={title}
    >
      <SettlementDashboard
        title={title}
        data={settlement.data}
        loading={enabled && (settlement.isPending || detail.isPending)}
        error={errorMsg}
        onRetry={() => void settlement.refetch()}
        onAction={onAction}
        onDispute={onDispute}
        onApprove={onApprove}
        onCreateShareLink={onCreateShareLink}
      />
      <StepUpDialog {...stepUp.dialog} />
    </StudioShell>
  )
}

export default SettlementPage
