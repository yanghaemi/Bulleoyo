/**
 * P-06 규칙 동의·판매 시작 페이지 — 라우트 `/studio/performances/:id/agreements`.
 *
 * 이 파일은 **조립만** 한다. 껍데기(`StudioShell`)와 본문(`RuleAgreements`)은 features에 있다.
 *
 * ── API (S15P21B204-99) ────────────────────────────────────────────────
 *   규칙·동의 : `GET /api/v1/performances/{id}/rules` (API-rule-02) — `useRuleStatus`
 *               performanceStatus·depositStatus·locked·rulesHash·rule·agreements[]
 *               ·myAgreement·startSaleAvailable·startSaleBlockedReason
 *   공연 상세 : `GET /api/v1/performances/{id}` (API-performance-03) — 공연명
 *   내 공연   : `GET /api/v1/performances/me` (API-performance-06) — 생성자 판정(`host`)
 *   내 팀     : `GET /api/v1/teams/me` (API-team-02) — 껍데기 팀 전환
 *   동의      : `POST …/rules/agreements/prepare` (API-rule-03) → `WalletAdapter` 서명
 *               → `POST …/rules/agreements/signed-tx` (API-rule-05, 202) → job 폴링
 *   판매 시작 : `POST …/sale/start` (API-rule-04, 202) → job 폴링. **서명이 없다**
 *
 * ⚠ **순서가 이 화면의 전부다.**
 *   ① 동의 — prepare에 `prerequisiteJobId`가 있으면 온체인 `createShow`가 아직이다. 확정 전에
 *      `agreeToRules`를 보내면 revert되므로 먼저 기다린다(P-03 보증금과 같은 모양).
 *      `signRequests`가 **빈 배열**로 오면 이미 온체인 동의가 있어 서버가 DB만 맞춘 것이다 —
 *      오류가 아니라 "서명 없이 완료"다(rule_03).
 *   ② 판매 시작 — 202의 `jobId`를 그대로 폴링하면 안 된다. `createShow`가 아직이면 서버가
 *      `START_SALE` job을 만들지 않고 `prerequisiteJobId`만 준다. `saleStartPolling`으로 갈라
 *      `phase === 'prerequisite'`면 그 job 확정 후 **판매 시작을 다시 호출**한다.
 *   ③ **202는 끝이 아니다.** job이 CONFIRMED된 뒤에만 완료로 알린다. 202만 보고 `ON_SALE`로
 *      옮기면 아직 열리지 않은 공연이 관객에게 노출된다. 배지는 재조회가 바꾼다(낙관적 UI 아님).
 *   `senderSignedRlp`는 이 페이지의 상태로 들지 않는다 — 보고 함수 인자로만 지나간다(스택 v3 §3.2).
 *
 * ⚠ **rule_02 응답에 "내가 생성자인가"와 공연명이 없다**(`RuleAgreements` 머리말 ①②).
 *   생성자 판정은 performance_06의 내 행 `host`, 공연명은 performance_03 `title`에서 온다.
 *
 * ⚠ **다른 팀의 동의는 폴링으로 갱신한다**(P-06 상태 항목). rule_02를 주기적으로 다시 부른다.
 *   잠기면(`locked`) 더 바뀔 것이 없어 멈춘다.
 *
 * 실패는 `code`로만 가른다 — `msg`는 표시 전용이다(응답 규격 §1).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'

import { useGoToLogin } from '@/features/member/loginNavigation'
import { RuleAgreements } from '@/features/studio/RuleAgreements'
import type {
  AgreeResult,
  AgreeSignStage,
  AgreementRow,
  AgreementScreenData,
  StartSaleResult,
} from '@/features/studio/RuleAgreements'
import { StudioShell } from '@/features/studio/StudioShell'
import { performanceBackPath } from '@/features/studio/studioNavigation'
import { StudioNotice } from '@/features/studio/StudioStates'
import type { StudioTeamRef } from '@/features/studio/StudioShell'
import { studioFailureText, walletErrorFailure } from '@/features/studio/studioErrors'
import { isApiError } from '@/shared/api/client'
import { RuleCode, saleStartPolling } from '@/shared/api/domains/rule'
import { WEBAUTHN_STEP_UP_REQUIRED } from '@/shared/api/domains/webauthn'
import { useStepUp } from '@/shared/auth/useStepUp'
import { StepUpDialog } from '@/shared/ui/StepUpDialog'
import type { SignRequest } from '@/shared/api/schema'
import { isWalletDisconnected, WalletError } from '@/shared/blockchain/WalletAdapter'
import { useWalletReady } from '@/shared/blockchain/useWalletReady'
import { useWeb3Auth } from '@/shared/blockchain/useWeb3Auth'
import { useChainJob } from '@/shared/queries/chain'
import { useMyPerformanceRows, usePerformanceDetail } from '@/shared/queries/performance'
import {
  usePrepareAgreement,
  useReportAgreementSignedTx,
  useRuleStatus,
  useStartSale,
} from '@/shared/queries/rule'
import { useMyTeams } from '@/shared/queries/team'
import type { DepositStatus } from '@/shared/ui'

/** 라우트 파라미터는 사람이 고칠 수 있다. 숫자가 아니면 조회를 걸지 않는다 */
function toPerformanceId(raw: string | undefined): number | undefined {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

/** 알림 링크가 지정한 참여 팀도 같은 기준으로 검증한다. */
function toTeamId(raw: string | null): number | undefined {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

/** 다른 팀 동의를 다시 읽는 간격. 서명 한 건이 확정되기까지의 체감 시간보다 짧게 둔다 */
const AGREEMENT_POLL_MS = 5_000

/** 동의 서명은 1건(AGREE)이다. `required === false`면 서명도 보고도 건너뛴다(§0.4) */
function isAgreeSignRequest(request: SignRequest): request is SignRequest & { kind: 'AGREE' } {
  return request.required && request.kind === 'AGREE'
}

/**
 * 체인 job이 실패하거나 폴링 상한에 닿았을 때. `code`로 문구를 고르게 한다.
 *
 * ⚠ 같은 클래스와 아래 `waitForJob` 약속이 `PerformanceEditPage`에도 있다(보증금). 두 벌뿐이라
 * 공용 모듈을 새로 만들지 않았다 — 세 번째가 생기면 `shared/queries`로 올린다
 * (`shared/queries/rule.ts`의 `discardSignedRlp`가 같은 판단을 적어 뒀다).
 */
class ChainJobError extends Error {
  readonly code: string
  constructor(code: string, message?: string) {
    super(message ?? code)
    this.name = 'ChainJobError'
    this.code = code
  }
}

/** 실행 실패를 화면이 쓰는 `{ ok, code, msg }`로 옮긴다. 분기는 `code`로만 한다 */
function toFailure(error: unknown): AgreeResult {
  // 서명 거부(에러가 아니다, §5.14 ④')와 지갑 미준비(D-77)를 가른다 — 판정은 P-03과 공유한다
  if (error instanceof WalletError) return walletErrorFailure(error)
  if (error instanceof ChainJobError) return { ok: false, code: error.code }
  if (isApiError(error)) return { ok: false, code: error.code, msg: error.msg }
  return { ok: false, code: 'COMMON_INTERNAL_ERROR' }
}

export function AgreementsPage() {
  const performanceId = toPerformanceId(useParams().id)
  const [searchParams] = useSearchParams()
  const requestedTeamId = toTeamId(searchParams.get('teamId'))
  const enabled = performanceId !== undefined
  const id = performanceId ?? 0

  const rules = useRuleStatus(id, { enabled, teamId: requestedTeamId })
  const detail = usePerformanceDetail(id, { enabled })
  // 단건 API가 없으므로 pageInfo를 끝까지 따라가 생성자 판정 행을 찾는다.
  const mine = useMyPerformanceRows(id, { enabled })
  const myTeams = useMyTeams()

  const prepare = usePrepareAgreement()
  const reportSignedTx = useReportAgreementSignedTx()
  /** [2026-09-24] 본인 확인(API v7 §7.W). prepare 응답의 `stepUpRequired`가 true일 때만 쓰인다. */
  const stepUp = useStepUp()
  const startSale = useStartSale()
  const { adapter } = useWeb3Auth()
  /**
   * 마운트에서 지갑 예열 + 계정 조회를 끝내 둔다(D-77 원인 A).
   *
   * 진입 직후 눌린 동의는 `eth_accounts`가 빈 배열이어서 `NOT_CONNECTED`로 떨어졌다 —
   * 사용자에게는 "세 번쯤 눌러야 팝업이 뜬다"로 보였다. 기다림을 클릭 밖으로 옮기고
   * 그동안 버튼을 잠근다(로그인 화면 C-01과 같은 게이트).
   */
  const { ready: walletReady, addressUnavailable } = useWalletReady(adapter, {
    requireAddress: true,
  })
  const goToLogin = useGoToLogin()

  /** 껍데기 사이드 메뉴의 "팀" 링크가 가리킬 팀. 공연은 바뀌지 않는다 */
  const [pickedTeamId, setPickedTeamId] = useState<number | undefined>(requestedTeamId)

  /* ── 체인 job 하나를 확정까지 기다리는 약속(P-03 보증금과 같은 모양) ──── */

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
        waiter.reject(
          new ChainJobError('COMMON_INTERNAL_ERROR', failed.failureReason ?? undefined),
        ),
      ),
  })

  // 폴링 상한(120초)에 닿으면 훅이 폴링을 멈춘다. 약속을 그대로 두면 화면이 "확인 중…"에서
  // 영영 돈다 — 워커가 멎었을 때가 그렇다. 상한을 실패와 구분해 알린다(504와 같은 문구)
  useEffect(() => {
    if (!job.timedOut) return
    settle((waiter) => waiter.reject(new ChainJobError(RuleCode.TX_TIMEOUT)))
  }, [job.timedOut, settle])

  const waitForJob = useCallback(
    (jobId: string) =>
      new Promise<void>((resolve, reject) => {
        waiterRef.current = { resolve, reject }
        setWatchedJobId(jobId)
      }),
    [],
  )

  /* ── 다른 팀 동의 폴링(P-06 상태 항목) ───────────────────────────────── */

  const locked = rules.data?.locked === true
  const refetchRules = rules.refetch
  useEffect(() => {
    // 잠긴 뒤에는 동의도 공연 상태도 더 바뀌지 않는다 — 읽기 전용 화면을 계속 두드리지 않는다
    if (!enabled || locked) return
    const timer = window.setInterval(() => void refetchRules(), AGREEMENT_POLL_MS)
    return () => window.clearInterval(timer)
  }, [enabled, locked, refetchRules])

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

  /** 이 공연에 대한 내 팀의 행. 내가 리더인 팀만 담겨 온다(performance_06) */
  const myRow = useMemo(
    () => (mine.data?.items ?? []).find((item) => item.performanceId === id),
    [mine.data, id],
  )

  /**
   * 동의 현황 — 식별자(teamId·teamName)와 상태가 없는 줄은 건너뛴다. 배지·"우리 팀" 표시의
   * 근거가 그 셋이다. **지갑 주소는 없으면 빈 칸으로 둔다** — 없는 주소를 지어내지 않고,
   * 주소 하나 때문에 팀을 목록에서 지우면 "n / m 동의" 셈이 틀어진다.
   */
  const agreements: AgreementRow[] = useMemo(
    () =>
      (rules.data?.agreements ?? []).flatMap<AgreementRow>((a) =>
        a.teamId != null && a.teamName && a.status
          ? [
              {
                teamId: a.teamId,
                teamName: a.teamName,
                walletAddress: a.walletAddress,
                status: a.status,
                txHash: a.txHash,
                explorerUrl: a.explorerUrl,
                agreedAt: a.agreedAt,
              },
            ]
          : [],
      ),
    [rules.data],
  )

  // 생성 타입의 `PerformanceStatus`·`PerformanceDepositStatus`가 화면 타입과 같은 enum이다
  const status = rules.data?.performanceStatus ?? detail.data?.status
  // 규칙이 있으면 rule_02가 정본이고, 없으면 내 대시보드 행이 유일한 출처다
  const depositStatus: DepositStatus | undefined = rules.data?.depositStatus ?? myRow?.depositStatus
  const rulesHash = rules.data?.rulesHash
  const rule = rules.data?.rule
  const teamShares = rule?.teamShares
  const myAgreement = rules.data?.myAgreement

  /**
   * 규칙 해시·비율이 없으면 화면을 그리지 않는다 — **서명 대상이 없다.**
   * 해시가 동의 서명의 입력이자 판매 시작(rule_04)의 본문이라, 그것 없이 버튼을 열어 두면
   * 누를 때마다 400이 난다. 조회가 200인데 해시가 없는 응답은 서버 계약 위반이다.
   */
  const data: AgreementScreenData | undefined =
    status !== undefined &&
    depositStatus !== undefined &&
    rulesHash != null &&
    rule?.fixedRatioBp != null &&
    rule.selectionRatioBp != null &&
    teamShares
      ? {
          performanceId: id,
          performanceStatus: status,
          depositStatus,
          locked: rules.data?.locked === true,
          rulesHash,
          rule: {
            fixedRatioBp: rule.fixedRatioBp,
            selectionRatioBp: rule.selectionRatioBp,
            teamShares: teamShares.map((s) => ({ teamId: s.teamId, shareBp: s.shareBp })),
          },
          agreements,
          // 참여팀이 아니면(생성자 관전 등) 없다. 식별자·상태가 빠지면 그 자리를 비운다
          myAgreement:
            myAgreement?.teamId != null && myAgreement.status
              ? {
                  teamId: myAgreement.teamId,
                  status: myAgreement.status,
                  nextAction: myAgreement.nextAction,
                }
              : undefined,
          // 서버가 정한다 — 화면이 동의 배열을 세어 다시 판단하지 않는다
          startSaleAvailable: rules.data?.startSaleAvailable === true,
          startSaleBlockedReason: rules.data?.startSaleBlockedReason,
          // 생성자 판정은 performance_06의 `host`다 — rule_02에는 없다(머리말 ①)
          isOwner: myRow?.host === true,
          // 공동 공연 여부는 performance_03 에만 있다 — 모르면 비워 둔다(RuleAgreements 주석)
          jointPerformance: detail.data?.jointPerformance,
        }
      : undefined

  /* ── 우리 팀 동의 (§0.4 ①③④) ───────────────────────────────────────── */

  const onAgree = useCallback(
    async (report: (stage: AgreeSignStage) => void): Promise<AgreeResult | undefined> => {
      if (!enabled) return { ok: false, code: RuleCode.PERFORMANCE_NOT_FOUND }
      const teamId = rules.data?.myAgreement?.teamId
      const hash = rules.data?.rulesHash
      // 서명 대상(해시)이나 동의할 팀을 모르면 요청을 지어내지 않는다
      if (teamId == null || hash == null) return { ok: false, code: 'COMMON_NOT_FOUND' }
      if (!adapter) {
        // 서명할 지갑이 없다. 가짜 RLP를 만들지 않고 여기서 멈춘다
        return { ok: false, code: RuleCode.WALLET_NOT_FOUND }
      }
      try {
        const prepared = await prepare.mutateAsync({
          performanceId: id,
          body: { teamId, rulesHash: hash },
        })

        // ① 온체인 createShow 선행 job. 확정 전에는 agreeToRules가 revert된다
        if (prepared.prerequisiteJobId) {
          report({ kind: 'confirming' })
          await waitForJob(prepared.prerequisiteJobId)
          /*
           * **여기서 끝낸다 — 같은 클릭으로 서명 팝업을 열지 않는다**(D-77 원인 B).
           * 위 대기는 수 초라 그 뒤의 `eth_sign`은 브라우저의 사용자 활성화(user activation)가
           * 만료된 상태에서 팝업을 열게 된다. 새 클릭 = 새 활성화이므로 화면에 "서명하기"를
           * 돌려주고 한 번 더 받는다. 다음 클릭의 prepare에는 선행 job이 없어 곧바로 서명으로 간다.
           */
          return { ok: false, readyToSign: true }
        }

        const requests = (prepared.signRequests ?? []).filter(isAgreeSignRequest)
        // 빈 배열 = 이미 온체인 동의가 있어 서버가 DB만 AGREED로 맞췄다(rule_03).
        // **오류가 아니라 서명 없이 완료**다. 배지는 prepare가 무효화한 재조회가 옮긴다
        if (requests.length === 0) return { ok: true }

        /*
         * [2026-09-24] 본인 확인(스위치 켜짐일 때만). 범위 = 규칙 동의 · 이 공연. 토큰을 방금 받았으면
         * "서명하기"를 돌려주고 다음 클릭에서 서명한다(생체 인증 창이 이 클릭의 활성화를 썼다 — D-77).
         * 취소는 에러가 아니다(원래 상태로).
         */
        let stepUpToken: string | undefined
        if (prepared.stepUpRequired === true) {
          const scope = { action: 'RULE_AGREE' as const, targetId: id }
          const held = stepUp.token(scope)
          if (held) {
            stepUpToken = held
          } else {
            const outcome = await stepUp.request(scope)
            if (outcome.kind === 'token') return { ok: false, readyToSign: true }
            if (outcome.kind === 'cancelled') return undefined
            if (outcome.kind === 'unsupported') {
              return { ok: false, code: WEBAUTHN_STEP_UP_REQUIRED, msg: '이 기기는 본인 확인을 지원하지 않습니다.' }
            }
            throw outcome.error
          }
        }

        // ② 서명 → 보고 → 확정. 동의는 approve가 없어 보통 1건이다
        for (const request of requests) {
          report({ kind: 'signing' })
          const senderSignedRlp = await adapter.signTransaction(request)
          const accepted = await reportSignedTx.mutateAsync({
            performanceId: id,
            teamId,
            kind: request.kind,
            senderSignedRlp,
            ...(stepUpToken ? { stepUpToken } : {}),
          })
          // ③ 202는 접수일 뿐이다. 확정돼야 AGREED다
          report({ kind: 'confirming' })
          await waitForJob(accepted.jobId)
        }
        return { ok: true }
      } catch (error) {
        // 게이트가 상한까지 기다리고도 주소를 못 받았다 = 복원할 세션이 아예 없다. 재로그인으로
        // 보내고 실패 문구는 남기지 않는다 — 화면이 바뀌는 찰나에 깜빡이면 "동의 실패"로 읽힌다.
        if (isWalletDisconnected(error) && addressUnavailable) {
          goToLogin()
          return undefined
        }
        // 토큰이 만료·소비됐다 — 버리고 다음 시도에서 본인 확인을 다시 받는다
        if (isApiError(error) && error.code === WEBAUTHN_STEP_UP_REQUIRED) stepUp.clear()
        return toFailure(error)
      }
    },
    [
      addressUnavailable,
      adapter,
      enabled,
      goToLogin,
      id,
      prepare,
      reportSignedTx,
      rules.data,
      stepUp,
      waitForJob,
    ],
  )

  /* ── 판매 시작 (rule_04 · 서명 없음) ─────────────────────────────────── */

  const onStartSale = useCallback(async (): Promise<StartSaleResult> => {
    if (!enabled) return { ok: false, code: RuleCode.PERFORMANCE_NOT_FOUND }
    const hash = rules.data?.rulesHash
    if (hash == null) return { ok: false, code: 'COMMON_NOT_FOUND' }
    try {
      // `createShow` 미확정이면 첫 호출이 선행 job만 준다. 그 job이 확정된 뒤 **다시 호출**해야
      // START_SALE job이 생긴다 — 선행 job을 지켜보는 것만으로는 판매가 시작되지 않는다.
      // 두 번째도 선행 job이면 서버 쪽 문제이므로 멈추고 재시도를 안내한다(무한 루프 금지)
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const accepted = await startSale.mutateAsync({
          performanceId: id,
          body: { rulesHash: hash },
        })
        const polling = saleStartPolling(accepted)
        if (polling.phase === 'none') return { ok: false, code: 'COMMON_INTERNAL_ERROR' }
        await waitForJob(polling.jobId)
        if (polling.phase === 'start-sale') return { ok: true }
      }
      return { ok: false, code: 'COMMON_INTERNAL_ERROR' }
    } catch (error) {
      return toFailure(error)
    }
  }, [enabled, id, rules.data, startSale, waitForJob])

  /* ── 실패 화면 ──────────────────────────────────────────────────────── */

  const title = detail.data?.title ?? '공연'

  // 규칙 조회가 이 화면의 전부다. 공연명만 못 읽은 경우로 화면을 덮지 않는다(§5.10)
  const failure = isApiError(rules.error) ? rules.error : undefined
  const failureText = failure ? studioFailureText(failure.code, failure.msg) : undefined
  /**
   * 규칙이 아직 없으면 rule_02 가 404 `COMMON_NOT_FOUND`다. **오류가 아니라 빈 상태**이고
   * (P-05 가 같은 코드를 빈 폼으로 읽는다) 여기서 할 수 있는 일은 규칙을 먼저 저장하는 것뿐이다.
   * 오류 패널로 덮으면 "다시 시도"만 남아 되돌아갈 길이 안 보인다.
   */
  const ruleMissing = failure?.code === 'COMMON_NOT_FOUND'
  // 403(참여팀·생성자 아님)과 그 밖(5xx)은 화면이 다르다
  const forbidden =
    failure?.code === RuleCode.NOT_PARTICIPANT ||
    failure?.code === RuleCode.PERFORMANCE_NOT_OWNER ||
    failure?.code === 'COMMON_FORBIDDEN'
      ? failureText
      : undefined

  return (
    <StudioShell
      teams={teams}
      // 공연 스코프 화면이라 팀을 골라도 공연이 바뀌지는 않는다. 사이드 메뉴 "팀" 링크가
      // 가리킬 팀만 바뀐다(P-04·P-05 와 같다). 핸들러를 안 주면 select 는 그려지는데 골라도
      // 아무 일이 없다 — 죽은 컨트롤을 두느니 실제로 하는 일을 준다
      activeTeamId={pickedTeamId ?? myRow?.teamId}
      onTeamChange={setPickedTeamId}
      title={title}
      backTo={performanceBackPath(id, myRow?.host)}
    >
      {ruleMissing ? (
        /*
         * 규칙을 저장할 수 있는 사람은 **생성자뿐**이다(rule_01). 참여팀 리더에게 P-05 링크를
         * 주면 눌러도 403 이라 막다른 길이 된다 — 그쪽에는 기다릴 일만 알린다.
         *
         * `host` 를 못 읽었으면(performance_06 의 내 행이 없거나 아직) 링크를 걸지 않는다.
         * 없는 권한을 가정해 막다른 길을 만드는 쪽이 더 나쁘다.
         */
        <StudioNotice
          title={
            myRow?.host === true
              ? '정산 규칙을 먼저 저장해 주세요'
              : '생성자가 정산 규칙을 저장하면 동의할 수 있습니다'
          }
          action={
            myRow?.host === true ? (
              <Link
                to={`/studio/performances/${performanceId}/rules`}
                className="inline-flex min-h-11 items-center rounded-control bg-primary px-5 font-sans text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-primary-bright"
              >
                정산 규칙 화면으로
              </Link>
            ) : undefined
          }
        >
          {myRow?.host === true
            ? '규칙을 저장하면 참여팀 리더에게 동의를 받을 수 있습니다.'
            : '규칙이 저장되면 이 화면에서 지갑으로 동의할 수 있습니다.'}
        </StudioNotice>
      ) : (
        <RuleAgreements
          title={title}
          // `data`를 만드는 조회를 하나라도 빠뜨리면 정상 상황에서 오류 패널이 뜬다 —
          // 규칙이 먼저 와도 `host`(mine)·공연명(detail)이 아직이면 data 가 반쪽이다
          loading={enabled && (rules.isPending || detail.isPending || mine.isPending)}
          data={data}
          forbidden={forbidden}
          error={!enabled ? '잘못된 공연 주소입니다.' : forbidden ? undefined : failureText}
          walletReady={walletReady}
          onRetry={() => {
            void rules.refetch()
            void detail.refetch()
          }}
          onAgree={onAgree}
          onStartSale={onStartSale}
        />
      )}
      <StepUpDialog {...stepUp.dialog} />
    </StudioShell>
  )
}

export default AgreementsPage
