/**
 * P-03 공연 수정·보증금 페이지 — 라우트 `/studio/performances/:id/edit`.
 *
 * 이 파일은 **조립만** 한다. 껍데기(`StudioShell`)와 본문(`PerformanceForm`)은 features에 있다.
 *
 * ── API (S15P21B204-99) ────────────────────────────────────────────────
 *   조회   : `GET /api/v1/performances/{performanceId}` (API-performance-03) — `usePerformanceDetail`
 *   수정   : `PATCH …` (API-performance-04) — `useUpdatePerformance`. 전 필드 선택
 *   티켓   : `GET …/ticket-types` (API-performance-15) — `useTicketTypes`. 생성자용 평면 금액 shape다
 *            `PUT …/ticket-types` (API-performance-05) — `useSetTicketTypes`. **전체 교체**다
 *   보증금 : `POST …/deposit/prepare`(13) → 지갑 서명 → `POST …/deposit/signed-tx`(14) → job 폴링
 *   취소   : `POST …/cancel` (API-performance-12) — `useCancelPerformance`. **202 + jobId**(P-10)
 *   상태   : `GET /api/v1/performances/me` (API-performance-06) — `depositStatus`·`host`
 *   규칙   : `GET …/rules` (API-rule-02) — `useRuleStatus`. **동의 단계 완료 판정에만** 쓴다
 *            (`agreements[]` 전부 AGREED). 규칙 미저장이면 404 이고 그것도 정상 상태다
 *   지갑   : `GET /api/v1/wallets/me` (API-wallet-01) — 리더 지갑 잔액
 *
 * ⚠ **`PerformanceDetail`에는 `deposit`이 없다.** 보증금 상태는 performance_06의 내 행에서,
 *   잔액은 wallet_01에서 온다. 보증금 **금액**은 읽기 전용 API 어디에도 없어(performance_01의
 *   `deposit.amount`와 performance_13의 `depositAmount`뿐) prepare 응답을 받기 전까지는
 *   명세가 고정한 50,000 YoYo(`DEPOSIT_AMOUNT`)을 쓴다. 보고 목록에 남긴다.
 *
 * ⚠ 보증금 서명은 **순서가 있다**(§0.4 · performance_13 설명).
 *   ① prepare — `prerequisiteJobId`가 있으면 온체인 `createShow`가 아직이다. 그 job이 CONFIRMED가
 *      되기 전에 `deposit(showId)`를 보내면 revert된다. 그래서 먼저 기다린다.
 *   ② `signRequests`를 **배열 순서대로** 하나씩 서명하고 보고한 뒤, 그 job이 확정된 다음에
 *      다음 건을 서명한다(APPROVE 확정 전 DEPOSIT은 allowance가 없어 실패한다).
 *   `senderSignedRlp`는 이 페이지의 상태로 들지 않는다 — 보고 함수 인자로만 지나간다(스택 v3 §3.2).
 *
 * 실패는 `code`로만 가른다 — `msg`는 표시 전용이다(응답 규격 §1).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'

import { formatApprox } from '@/features/member/localeOptions'
import { PerformanceForm } from '@/features/studio/PerformanceForm'
import type {
  DepositPayResult,
  DepositSignStage,
  DepositState,
  PerformanceEditData,
  SaveResult,
} from '@/features/studio/PerformanceForm'
import { useGoToLogin } from '@/features/member/loginNavigation'
import {
  SETUP_STEP_AGREEMENTS,
  SETUP_STEP_BASICS,
  SETUP_STEP_DEPOSIT,
  SETUP_STEP_PARTICIPANTS,
  SETUP_STEP_RULES,
  agreementsStepDone,
  participantsStepDone,
} from '@/features/studio/setupSteps'
import { StudioShell } from '@/features/studio/StudioShell'
import type { StudioTeamRef } from '@/features/studio/StudioShell'
import { toLeaderWallet } from '@/features/studio/leaderWallet'
import {
  cancelShowFailureText,
  studioFailureText,
  walletErrorFailure,
} from '@/features/studio/studioErrors'
import { DEPOSIT_AMOUNT, kstInputToIso } from '@/features/studio/performanceFields'
import type { PerformanceInfoValues, TicketTypeDraft } from '@/features/studio/performanceFields'
import { isApiError, newIdempotencyKey } from '@/shared/api/client'
import type {
  PerformanceCancelAccepted,
  PerformanceDetail,
  TicketTypeListResult,
} from '@/shared/api/domains/performance'
import { isWalletNotFound } from '@/shared/api/domains/wallet'
import { WEBAUTHN_STEP_UP_REQUIRED } from '@/shared/api/domains/webauthn'
import { useStepUp } from '@/shared/auth/useStepUp'
import type { SignRequest } from '@/shared/api/schema'
import { isWalletDisconnected, WalletError } from '@/shared/blockchain/WalletAdapter'
import { useWalletReady } from '@/shared/blockchain/useWalletReady'
import { useWeb3Auth } from '@/shared/blockchain/useWeb3Auth'
import { config } from '@/shared/config'
import { useChainJob } from '@/shared/queries/chain'
import {
  useCancelPerformance,
  useMyPerformanceRows,
  usePerformanceDetail,
  usePrepareDeposit,
  useReportDepositSignedTx,
  useSetTicketTypes,
  useTicketTypes,
  useUpdatePerformance,
} from '@/shared/queries/performance'
import { useRuleStatus } from '@/shared/queries/rule'
import { useMyTeams } from '@/shared/queries/team'
import { useMyWallet } from '@/shared/queries/wallet'
import { Button, ConfirmDialog, DepositStatusBadge, Input, formatYoyo } from '@/shared/ui'
import { StepUpDialog } from '@/shared/ui/StepUpDialog'

/** performance_12 `reason` 제약(1~200자). 관객 안내 문구로 그대로 노출된다 */
const CANCEL_REASON_MAX = 200

/**
 * 공연 정보는 저장됐고 티켓 옵션만 실패했을 때 덧붙이는 안내.
 *
 * 두 요청(performance_04 · performance_05)을 묶는 API 가 없어 부분 성공이 생긴다.
 * 생성 화면은 "공연이 만들어졌다"까지 말해야 해서 문구가 달라 따로 둔다.
 */
const SAVED_INFO_ONLY = '공연 정보는 저장됐고 티켓 옵션만 저장되지 않았습니다.'

/** 라우트 파라미터는 사람이 고칠 수 있다. 숫자가 아니면 조회를 걸지 않는다 */
function toPerformanceId(raw: string | undefined): number | undefined {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

/** 보증금 서명 두 종류. `required === false`인 건은 서명도 보고도 건너뛴다(§0.4) */
function isDepositSignRequest(
  request: SignRequest,
): request is SignRequest & { kind: 'APPROVE' | 'DEPOSIT' } {
  return request.required && (request.kind === 'APPROVE' || request.kind === 'DEPOSIT')
}

/**
 * performance_03 → 폼 값. 필수 값이 하나라도 없으면 `undefined` — 빈 폼을 그려 두면
 * 사용자가 그대로 저장해 서버 값을 지운다.
 *
 * 티켓 옵션은 **한 줄도 버리지 않는다.** `PUT …/ticket-types`가 전체 교체라, 못 읽은 줄을
 * 빼고 저장하면 그 옵션이 삭제된다. 값이 비면 빈 칸으로 두고 폼 검증이 저장을 막게 한다.
 */
function toEditData(
  data: PerformanceDetail,
  status: PerformanceEditData['status'],
  ticketTypes: NonNullable<TicketTypeListResult['ticketTypes']>,
): PerformanceEditData | undefined {
  if (
    data.performanceId == null ||
    !data.title ||
    !data.venueName ||
    !data.venueAddress ||
    !data.startAt ||
    !data.endAt
  ) {
    return undefined
  }
  return {
    performanceId: data.performanceId,
    title: data.title,
    description: data.description,
    venueName: data.venueName,
    venueAddress: data.venueAddress,
    startAt: data.startAt,
    endAt: data.endAt,
    saleCloseAt: data.saleCloseAt,
    cancelDeadlineAt: data.cancelDeadlineAt,
    status,
    jointPerformance: data.jointPerformance,
    /*
     * `participants[]`는 **수락한 팀만** 담는다(`PerformanceService.acceptedParticipants`) —
     * 초대(INVITED)만 해 둔 팀은 세어지지 않는다. 서버가 보증금 prepare 에서 보는 기준과
     * 같아서 그대로 쓴다. 조회가 이 배열을 주지 않으면 세지 않는다(0 과 "모름"을 구분한다).
     */
    acceptedParticipantCount: data.participants?.length,
    ticketTypes: ticketTypes.map((t, index): TicketTypeDraft => {
      const sold =
        t.totalQuantity != null && t.remainingQuantity != null
          ? t.totalQuantity - t.remainingQuantity
          : undefined
      return {
        key: t.ticketTypeId != null ? String(t.ticketTypeId) : `tt-${index}`,
        ...(t.ticketTypeId != null ? { ticketTypeId: t.ticketTypeId } : {}),
        name: t.name ?? '',
        price: t.priceAmount != null ? String(t.priceAmount) : '',
        totalQuantity: t.totalQuantity != null ? String(t.totalQuantity) : '',
        ...(sold != null ? { soldQuantity: sold } : {}),
      }
    }),
  }
}

/** 체인 job이 실패하거나 폴링 상한에 닿았을 때. `code`로 문구를 고르게 한다 */
class ChainJobError extends Error {
  readonly code: string
  constructor(code: string, message?: string) {
    super(message ?? code)
    this.name = 'ChainJobError'
    this.code = code
  }
}

export function PerformanceEditPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  /**
   * 생성 화면(P-03 `/new`)이 첫 단계를 저장하고 넘겨준 단계. 주소를 직접 열면 없다.
   *
   * ⚠️ `replace`로 심은 state는 그 히스토리 엔트리에 계속 남는다. 새로고침하거나 뒤로가기로
   * 그 엔트리에 돌아와도 같은 단계가 열린다 — 흐름을 잇는 것이라 그대로 둔다. 1회성으로
   * 쓰려면 읽은 뒤 `navigate(pathname, { replace: true, state: null })`로 지워야 한다.
   *
   * 받는 값은 **1(참여팀)·2(정산 규칙)·3(규칙 동의)·4(보증금) 넷뿐**이다. 히스토리에서 오는
   * 값이라 임의 숫자를 그대로 쓰지 않는다 — 없는 단계를 열면 빈 화면이 된다.
   */
  const stepFromState = (useLocation().state as { step?: number } | null)?.step
  const requestedStep =
    stepFromState === SETUP_STEP_PARTICIPANTS ||
    stepFromState === SETUP_STEP_RULES ||
    stepFromState === SETUP_STEP_AGREEMENTS ||
    stepFromState === SETUP_STEP_DEPOSIT
      ? stepFromState
      : SETUP_STEP_BASICS
  const performanceId = toPerformanceId(id)
  const enabled = performanceId !== undefined

  const detail = usePerformanceDetail(performanceId ?? 0, { enabled })
  // 단건 API가 없으므로 pageInfo를 끝까지 따라가 이 공연의 내 팀 행을 찾는다.
  const mine = useMyPerformanceRows(performanceId ?? 0, { enabled })
  const ticketTypes = useTicketTypes(performanceId ?? 0, { enabled })
  /*
   * 규칙·동의 현황(rule_02) — **P-05·P-06 과 같은 훅**이다. 이 화면이 직접 세지 않고 같은
   * 응답의 `agreements[]` 를 읽어 동의 단계 완료를 판정한다(`agreementsStepDone`).
   * 규칙 미저장이면 404 `COMMON_NOT_FOUND` 다 — **오류가 아니라 빈 상태**라 아래 `error`
   * 계산에 넣지 않는다(그쪽은 detail·ticketTypes 실패만 본다).
   */
  const rules = useRuleStatus(performanceId ?? 0, { enabled })
  const myTeams = useMyTeams()
  const wallet = useMyWallet()
  const update = useUpdatePerformance()
  const setTicketTypes = useSetTicketTypes()
  const prepare = usePrepareDeposit()
  const reportSignedTx = useReportDepositSignedTx()
  /** [2026-09-24] 본인 확인(API v7 §7.W). prepare 응답의 `stepUpRequired`가 true일 때만 쓰인다. */
  const stepUp = useStepUp()
  const { adapter } = useWeb3Auth()
  /**
   * 마운트에서 지갑 예열 + 계정 조회를 끝내 둔다(D-77 원인 A).
   *
   * 진입 직후 눌린 납부는 `eth_accounts`가 빈 배열이어서 `NOT_CONNECTED`로 떨어졌다 —
   * 사용자에게는 "세 번쯤 눌러야 서명 팝업이 뜬다"로 보였다. 기다림을 클릭 밖으로 옮기고
   * 그동안 버튼을 잠근다(로그인 화면 C-01과 같은 게이트).
   */
  const { ready: walletReady, addressUnavailable } = useWalletReady(adapter, {
    requireAddress: true,
  })
  const goToLogin = useGoToLogin()

  const [pickedTeamId, setPickedTeamId] = useState<number | undefined>()
  /** prepare가 알려 준 실제 보증금 금액. 받기 전에는 명세 고정값을 쓴다 */
  const [preparedAmount, setPreparedAmount] = useState<number | undefined>()

  /* ── 체인 job 하나를 확정까지 기다리는 약속 ──────────────────────────── */

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
    settle((waiter) => waiter.reject(new ChainJobError('CHAIN_TX_TIMEOUT')))
  }, [job.timedOut, settle])

  const waitForJob = useCallback(
    (jobId: string) =>
      new Promise<void>((resolve, reject) => {
        waiterRef.current = { resolve, reject }
        setWatchedJobId(jobId)
      }),
    [],
  )

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

  const myRow = (mine.data?.items ?? []).find((item) => item.performanceId === performanceId)

  /**
   * 세 응답이 **다 온 뒤에** 한 번에 만든다.
   *
   * 폼은 `data.performanceId`가 처음 생길 때 한 번만 값을 심는다(`PerformanceForm`의 재동기화 효과).
   * 상세만 먼저 넘기면 티켓 옵션이 빈 채로 굳고, 그 상태로 저장하면 **전체 교체라 옵션이 지워진다.**
   *
   * rule_02 를 기다리는 이유도 같다 — 폼이 **그 한 번의 시점**에 `initialStep` 도 다시 읽는데,
   * 동의 판정(`agreements[]`)이 아직 없으면 전원 동의한 공연도 동의 단계로 열린다.
   * 404(규칙 미저장)는 `isPending` 이 풀리는 것으로 충분하다 — 기다림이 끝났다는 뜻이다.
   */
  const rulesSettled = !enabled || !rules.isPending
  const data = useMemo(() => {
    const status = detail.data?.status
    if (!detail.data || !status || !ticketTypes.data || !rulesSettled) return undefined
    return toEditData(detail.data, status, ticketTypes.data.ticketTypes ?? [])
  }, [detail.data, ticketTypes.data, rulesSettled])

  /**
   * 참여팀 전원이 규칙에 동의했는가 — 판정은 폼·페이지가 공유한다(`agreementsStepDone`).
   * `agreements[]` 로만 본다. 이유는 그 함수 주석(⚠ `startSaleBlockedReason` 은 못 쓴다).
   */
  const allAgreed = agreementsStepDone(rules.data?.agreements)

  /**
   * 여는 단계 — **덜 끝난 앞 단계로 되돌린다.** 순서는 준비 흐름과 같다.
   *
   * ① **참여팀** — 공동 공연인데 수락한 참여팀이 둘이 안 되면 규칙·동의·보증금 어디로 보내도
   *    막힌다. 규칙은 `participants[]`로 팀 몫을 나눠 1팀으로 굳고, 보증금 prepare 는 서버가
   *    `TEAM_MIN_COUNT_NOT_MET` 409 로 되돌린다(MR !135). 그래서 P-04 로 가는 단계를 먼저 연다.
   * ② **규칙 동의** — 보증금을 요청했는데 아직 전원 동의가 아니면 동의 단계를 연다.
   *    이건 **서버 제약이 아니라 순서 안내**다(팀 결정 2026-09-21). 그래서 보증금 단계를
   *    요청했을 때만 되돌리고, 보증금 카드 자체는 그대로 눌리게 둔다(`DepositStep` 주석).
   *    규칙이 아직 없으면(rule_02 404 → `rules.data == null`) 되돌리지 않는다 — 그때 동의
   *    단계는 "규칙을 먼저 저장하세요"밖에 못 하고, 보증금은 서버 409 가 정확히 막아 준다.
   *
   * 첫 단계(정보·티켓 옵션)를 요청한 경우는 어느 쪽도 건드리지 않는다 — 공연을 아직 저장하지도
   * 않은 사람을 다른 화면으로 밀어내지 않는다.
   *
   * ⚠ 이 값은 **공연이 도착한 뒤에야 확정된다.** `PerformanceForm`이 첫 렌더가 아니라
   * `data`가 처음 들어오는 시점에 이 prop 을 다시 읽는다(그 재동기화 효과 주석 참고).
   */
  const initialStep =
    data == null || requestedStep === SETUP_STEP_BASICS
      ? requestedStep
      : !participantsStepDone(data)
        ? SETUP_STEP_PARTICIPANTS
        : requestedStep === SETUP_STEP_DEPOSIT && rules.data != null && !allAgreed
          ? SETUP_STEP_AGREEMENTS
          : requestedStep

  const walletView = wallet.data && !isWalletNotFound(wallet.error) ? wallet.data : undefined

  /**
   * 보증금 상태는 내 공연 목록의 행에서만 알 수 있다. 행을 못 찾으면 넘기지 않는다 —
   * 폼이 `UNPAID`로 가정하지만, 이미 납부했다면 서버가 409로 막는다(이중 납부는 생기지 않는다).
   */
  const deposit: DepositState | undefined = myRow?.depositStatus
    ? {
        status: myRow.depositStatus,
        amount: preparedAmount ?? DEPOSIT_AMOUNT,
        leaderBalance: walletView?.balance?.amount,
      }
    : undefined

  /* ── 저장 ───────────────────────────────────────────────────────────── */

  const onSaveSetup = useCallback(
    async (values: PerformanceInfoValues, rows: TicketTypeDraft[]): Promise<SaveResult> => {
      if (performanceId === undefined) return { ok: false, code: 'COMMON_NOT_FOUND' }
      try {
        await update.mutateAsync({
          performanceId,
          body: {
            title: values.title.trim(),
            description: values.description.trim(),
            venueName: values.venueName.trim(),
            venueAddress: values.venueAddress.trim(),
            // 입력은 KST 벽시계다. 오프셋을 명시해 서버가 시간대를 추측하지 않게 한다
            startAt: kstInputToIso(values.startAt),
            endAt: kstInputToIso(values.endAt),
          },
        })
      } catch (error) {
        if (isApiError(error)) return { ok: false, code: error.code, msg: error.msg }
        return { ok: false, code: 'COMMON_INTERNAL_ERROR' }
      }

      /*
       * 여기부터는 **공연 정보가 이미 저장됐다.** 두 요청을 한 트랜잭션으로 묶을 API 가 없어
       * (performance_04 와 performance_05 는 별개다) 티켓 옵션만 실패하는 부분 성공이 생긴다.
       *
       * 되돌리지 않는다 — 저장된 값은 사용자가 방금 입력한 그 값이고, 직전 값을 화면이 들고
       * 있지 않아 "복구"가 또 하나의 추측이 된다. 대신 **무엇이 저장됐는지 말한다.** 잠자코
       * "처리하지 못했습니다"만 띄우면 아무것도 안 바뀐 줄 알고 떠나게 된다.
       *
       * 폼 값은 그대로 남으므로 재시도는 같은 `PATCH`(같은 값 = 무해)와 `PUT`을 다시 보낸다.
       */
      try {
        const saved = await setTicketTypes.mutateAsync({
          performanceId,
          body: {
            // 폼 검증을 통과한 뒤에만 들어온다(정수 문자열). 유지할 줄은 `ticketTypeId`를 함께 보낸다
            ticketTypes: rows.map((row) => ({
              ...(row.ticketTypeId != null ? { ticketTypeId: row.ticketTypeId } : {}),
              name: row.name.trim(),
              price: Number(row.price),
              totalQuantity: Number(row.totalQuantity),
            })),
          },
        })
        // performance_05는 입력 순서대로 저장된 옵션을 반환한다(PerformanceService).
        // 조회 무효화만으로는 폼의 신규 행 ID가 바뀌지 않는다. 제출한 로컬 key에 연결한다.
        return {
          ok: true,
          ticketTypeIds: rows.flatMap((row, index) => {
            const ticketTypeId = saved.ticketTypes?.[index]?.ticketTypeId
            return ticketTypeId == null ? [] : [{ key: row.key, ticketTypeId }]
          }),
        }
      } catch (error) {
        const detail = isApiError(error) ? error.msg : undefined
        return {
          ok: false,
          code: isApiError(error) ? error.code : 'COMMON_INTERNAL_ERROR',
          msg: [SAVED_INFO_ONLY, detail].filter(Boolean).join(' '),
        }
      }
    },
    [performanceId, setTicketTypes, update],
  )

  /* ── 보증금 (§0.4 ①②③④) ──────────────────────────────────────────── */

  const onPayDeposit = useCallback(
    async (
      report: (stage: DepositSignStage) => void,
    ): Promise<DepositPayResult | undefined> => {
      if (performanceId === undefined) return { ok: false, code: 'COMMON_NOT_FOUND' }
      if (!adapter) {
        // 서명할 지갑이 없다. 가짜 서명을 만들지 않고 여기서 멈춘다
        return { ok: false, code: 'WALLET_NOT_FOUND' }
      }
      try {
        const prepared = await prepare.mutateAsync(performanceId)
        if (prepared.depositAmount != null) setPreparedAmount(prepared.depositAmount)

        // ① 온체인 createShow 선행 job. 확정 전에는 deposit(showId)이 revert된다
        if (prepared.prerequisiteJobId) {
          report({ kind: 'confirming' })
          await waitForJob(prepared.prerequisiteJobId)
          /*
           * **여기서 끝낸다 — 같은 클릭으로 서명 팝업을 열지 않는다**(D-77 원인 B).
           * 위 대기는 수 초라, 그 뒤의 `eth_sign`은 브라우저의 사용자 활성화(user activation)가
           * 만료된 상태에서 팝업을 열게 된다. 새 클릭 = 새 활성화이므로 폼에 "서명하기"를
           * 돌려주고 한 번 더 받는다. 다음 클릭의 prepare에는 선행 job이 없어 곧바로 서명으로 간다.
           *
           * ⚠ **APPROVE → DEPOSIT 사이에는 이 멈춤을 두지 않았다.** 같은 이유로 막힐 수 있지만
           * 9/21 재현에서는 첫 팝업이 열린 뒤 두 서명이 모두 끝났고(활성화 만료 징후 없음),
           * 두 번 서명하는 자리에 클릭을 하나 더 넣으면 §5.14의 (1/2 → 2/2) 흐름이 끊긴다.
           * 그 경로가 실제로 막히는 로그가 나오면 여기와 같은 모양으로 단계를 하나 더 만든다.
           */
          return { ok: false, readyToSign: true }
        }

        const requests = (prepared.signRequests ?? []).filter(isDepositSignRequest)
        if (requests.length === 0) return { ok: false, code: 'COMMON_INTERNAL_ERROR' }

        /*
         * [2026-09-24] 본인 확인(스위치 켜짐일 때만). 범위 = 보증금 · 이 공연 — APPROVE·DEPOSIT 두 보고에
         * 같은 토큰을 싣는다. 토큰을 **방금** 받았으면 여기서 끝내고 "서명하기"를 돌려준다 — 생체 인증
         * 창이 이 클릭의 사용자 활성화를 썼기 때문이다(위 선행 job 과 같은 D-77 판단). 다음 클릭에는
         * 토큰이 이미 있어 곧바로 서명으로 간다. 취소는 에러가 아니다(원래 상태로).
         */
        let stepUpToken: string | undefined
        if (prepared.stepUpRequired === true) {
          const scope = { action: 'DEPOSIT' as const, targetId: performanceId }
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

        // ② 배열 순서대로. 앞 건이 확정된 뒤에 다음 건을 서명한다
        for (const [index, request] of requests.entries()) {
          report({ kind: 'signing', step: index + 1, total: requests.length })
          const senderSignedRlp = await adapter.signTransaction(request)
          const accepted = await reportSignedTx.mutateAsync({
            performanceId,
            kind: request.kind,
            senderSignedRlp,
            ...(stepUpToken ? { stepUpToken } : {}),
          })
          report({ kind: 'confirming' })
          await waitForJob(accepted.jobId)
        }
        return { ok: true }
      } catch (error) {
        // 서명 거부(에러가 아니다, §5.14 ④')와 지갑 미준비(D-77)를 가른다 — 판정은 P-06과 공유한다
        if (error instanceof WalletError) {
          // 게이트가 상한까지 기다리고도 주소를 못 받았다 = 복원할 세션이 아예 없다. 재로그인으로
          // 보내고 실패 문구는 남기지 않는다 — 바뀌는 찰나에 깜빡이면 "납부 실패"로 읽힌다.
          if (isWalletDisconnected(error) && addressUnavailable) {
            goToLogin()
            return undefined
          }
          return walletErrorFailure(error)
        }
        if (error instanceof ChainJobError) return { ok: false, code: error.code }
        // 토큰이 만료·소비됐다 — 버리고 다음 시도에서 본인 확인을 다시 받는다
        if (isApiError(error) && error.code === WEBAUTHN_STEP_UP_REQUIRED) stepUp.clear()
        if (isApiError(error)) return { ok: false, code: error.code, msg: error.msg }
        return { ok: false, code: 'COMMON_INTERNAL_ERROR' }
      }
    },
    [addressUnavailable, adapter, goToLogin, performanceId, prepare, reportSignedTx, stepUp, waitForJob],
  )

  /* ── P-10 공연 취소·일괄 환불 (performance_12) ─────────────────────── */

  const cancelShow = useCancelPerformance()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelFailure, setCancelFailure] = useState<string | undefined>()
  /** 202 응답. 받은 뒤에는 확정 버튼을 다시 누를 수 없고 진행 표시로 바뀐다 */
  const [accepted, setAccepted] = useState<PerformanceCancelAccepted | undefined>()
  /**
   * §0.8 멱등키 — **같은 사유면 같은 키**다. 그래야 실패 후 재시도가 최초 `jobId`를 재생하고
   * 일괄 환불이 두 번 돌지 않는다. 사유를 고쳐 보내면 새 키를 만든다 — 같은 키에 다른 본문은
   * 서버가 409 `COMMON_CONFLICT`로 막는다(performance_12 4xx). A-04 주문과 같은 방식이다.
   */
  const cancelKeyRef = useRef<{ reason: string; key: string } | null>(null)

  // 접수된 대표 job(HALT)을 확정까지 지켜본다. 캐시 무효화는 훅과 뮤테이션이 한다
  const cancelJob = useChainJob(accepted?.jobId)

  const reason = cancelReason.trim()
  /** 접수 전이면 요청 중, 접수 뒤에는 되돌릴 수 없으므로 확정을 계속 잠근다 */
  const cancelBusy = cancelShow.isPending || accepted !== undefined
  const cancelDepositAmount = accepted?.depositAmount ?? deposit?.amount

  const onCancelConfirm = () => {
    if (performanceId === undefined || cancelBusy) return
    if (reason.length === 0 || reason.length > CANCEL_REASON_MAX) return
    if (cancelKeyRef.current?.reason !== reason) {
      cancelKeyRef.current = { reason, key: newIdempotencyKey() }
    }
    setCancelFailure(undefined)
    cancelShow.mutate(
      { performanceId, body: { reason }, idempotencyKey: cancelKeyRef.current.key },
      {
        onSuccess: (data) => setAccepted(data),
        // 분기는 `code`로만 한다. `msg`는 문구 뒤에 덧붙이기만 한다(응답 규격 §1)
        onError: (error) =>
          setCancelFailure(
            cancelShowFailureText(
              isApiError(error) ? error.code : 'COMMON_INTERNAL_ERROR',
              isApiError(error) ? error.msg : undefined,
            ),
          ),
      },
    )
  }

  /**
   * ⚠ **건별 진행률("환불 42 / 80 처리")은 그리지 못한다.** 202가 주는 `jobId`는 대표 job인
   * **HALT** 하나이고(performance_12 202 설명), 건별 `refund` job의 id는 응답에 없다.
   * "진행률은 API-chain-01의 `results`로 본다"는 명세 문장이 이 job에는 맞지 않는다 —
   * 없는 숫자를 만들지 않고 대상 건수와 job 상태만 적는다. 보고 목록 참조.
   */
  const cancelProgressText = cancelJob.timedOut
    ? studioFailureText('CHAIN_TX_TIMEOUT')
    : cancelJob.isConfirmed
      ? '판매를 중단했습니다. 환불은 순차적으로 처리됩니다.'
      : cancelJob.isFailed
        ? studioFailureText(cancelJob.job?.failureReason ?? 'COMMON_INTERNAL_ERROR')
        : '취소를 접수했습니다. 환불을 순차적으로 처리하고 있습니다.'

  /**
   * 취소 버튼을 그릴 수 있는 상태인가 — performance_12가 막는 상태를 그대로 옮겼다.
   * 판매 전(`DRAFT`·`PENDING_AGREEMENT`)은 "수정·삭제로 처리"라 취소가 없고, `CANCELLED`는
   * 종단이다. 그 밖의 판정은 **화면이 하지 않는다** — release 여부 등은 서버가 409로 답한다.
   */
  const cancellable =
    data?.status === 'ON_SALE' || data?.status === 'SALE_CLOSED' || data?.status === 'ENDED'

  /* ── 실패 화면 ──────────────────────────────────────────────────────── */

  // 공개 상세(03)는 403을 주지 않는다. 생성자 여부는 performance_15가 가른다 — 그쪽이 서버 판정이다
  const failure =
    (isApiError(detail.error) ? detail.error : undefined) ??
    (isApiError(ticketTypes.error) ? ticketTypes.error : undefined)
  const forbidden =
    failure?.code === 'PERFORMANCE_NOT_OWNER' || myRow?.host === false
      ? studioFailureText('PERFORMANCE_NOT_OWNER')
      : undefined
  const error =
    failure && failure.code !== 'PERFORMANCE_NOT_OWNER'
      ? studioFailureText(failure.code, failure.msg)
      : !enabled
        ? studioFailureText('PERFORMANCE_NOT_FOUND')
        : detail.data && ticketTypes.data && !data
          ? '공연 정보에 필요한 값이 빠져 있습니다.'
          : undefined

  return (
    <StudioShell
      teams={teams}
      activeTeamId={pickedTeamId ?? teams[0]?.teamId}
      onTeamChange={setPickedTeamId}
      title={data?.title ?? 'Show / 공연'}
    >
      <PerformanceForm
        mode="edit"
        initialStep={initialStep}
        loading={enabled && (detail.isPending || ticketTypes.isPending || rules.isPending)}
        data={data}
        allAgreed={allAgreed}
        deposit={deposit}
        wallet={toLeaderWallet(walletView, formatApprox)}
        // 서명 요약의 "대상 컨트랙트". 환경변수가 비면 주소를 지어내지 않고 그 줄을 감춘다
        splitterAddress={config.chain.splitterAddress || undefined}
        forbidden={forbidden}
        error={error}
        onRetry={() => {
          void detail.refetch()
          void ticketTypes.refetch()
          void rules.refetch()
        }}
        onSaveSetup={onSaveSetup}
        onOpenMedia={() => navigate(`/studio/performances/${performanceId}/poster`)}
        onPayDeposit={onPayDeposit}
        walletReady={walletReady}
        onCancelRequest={cancellable ? () => setCancelOpen(true) : undefined}
      />

      {/* P-10 공연 취소 — 비가역 액션이라 확인 모달을 거친다(§5.6·§5.19) */}
      <ConfirmDialog
        open={cancelOpen}
        title="공연을 취소하시겠어요?"
        confirmLabel="취소 확정"
        cancelLabel="닫기"
        confirmVariant="danger"
        // 진행 중에도 **닫기만은 활성**으로 남긴다(P-10 상태)
        busy={cancelBusy}
        // 사유가 비었다는 것은 "처리 중"이 아니다 — 확정 버튼만 잠그고 닫기·포커스는 그대로 둔다
        confirmDisabled={reason.length === 0}
        closableWhileBusy
        onConfirm={onCancelConfirm}
        onClose={() => setCancelOpen(false)}
        body={
          <>
            <p>
              전 티켓이{' '}
              <strong className="font-semibold text-ink">수수료 없이 관객 지갑으로 환불</strong>되며
              정산이 중단됩니다. 일괄 환불이 끝나면{' '}
              {cancelDepositAmount != null
                ? `보증금 ${formatYoyo(cancelDepositAmount)}가`
                : '보증금이'}{' '}
              반환됩니다.
            </p>

            {accepted === undefined ? (
              <label className="mt-3 block">
                <span className="mb-1 block font-semibold text-ink">
                  취소 사유 (관객에게 그대로 안내됩니다)
                </span>
                <Input
                  value={cancelReason}
                  maxLength={CANCEL_REASON_MAX}
                  disabled={cancelShow.isPending}
                  placeholder="예) 공연장 사정으로 부득이하게 취소되었습니다."
                  onChange={(event) => setCancelReason(event.target.value)}
                />
              </label>
            ) : (
              <div className="mt-3 space-y-1">
                <p className="text-ink">
                  환불 대상 티켓 {accepted.targetTicketCount}건 · 총{' '}
                  {formatYoyo(accepted.totalRefundAmount)}
                </p>
                <p role="status">{cancelProgressText}</p>

                {/*
                  HALT 가 실패·타임아웃으로 끝났을 때 — **재접수는 할 수 없다.** 접수 시점에
                  서버가 공연을 `CANCELLED` 로 만들어 두므로(`PerformanceService#cancel`),
                  같은 멱등키는 그 실패 job 을 재생하고 새 키는 409
                  `PERFORMANCE_INVALID_STATUS` 로 막힌다. 이중 환불은 생기지 않지만 사용자가
                  다시 누를 수 있는 것도 없다.
                  그래서 확정은 계속 잠근 채 **상태를 다시 읽을 길만** 준다 — 워커가 늦은 것과
                  정말 실패한 것을 여기서 구분할 수 없고, 새로고침 말고는 방법이 없었다.
                  환불이 남았다면 운영자 개입이 필요하다.
                */}
                {(cancelJob.isFailed || cancelJob.timedOut) && (
                  <div className="pt-1">
                    <Button
                      variant="secondary"
                      disabled={cancelJob.isFetching}
                      onClick={() => void cancelJob.refetch()}
                    >
                      {cancelJob.isFetching ? '확인 중…' : '상태 다시 확인'}
                    </Button>
                  </div>
                )}
                {/* 보증금 반환은 `deposit_status`(performance_06)가 정본이다 — 화면이 앞당기지 않는다 */}
                {accepted.depositReturnPlanned && deposit && (
                  <p className="flex items-center gap-2 pt-1">
                    <DepositStatusBadge status={deposit.status} />
                    <span>
                      {deposit.status === 'RETURNED'
                        ? '보증금이 반환됐습니다.'
                        : '일괄 환불이 끝나면 보증금이 반환됩니다.'}
                    </span>
                  </p>
                )}
              </div>
            )}

            {cancelFailure && (
              <p role="alert" className="mt-3 text-danger">
                {cancelFailure}
              </p>
            )}
          </>
        }
      />
      <StepUpDialog {...stepUp.dialog} />
    </StudioShell>
  )
}

export default PerformanceEditPage
