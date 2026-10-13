/**
 * P-03 공연 생성 페이지 — 라우트 `/studio/performances/new`.
 *
 * 이 파일은 **조립만** 한다. 껍데기(`StudioShell`)와 본문(`PerformanceForm`)은 features에 있다.
 *
 * ── API (S15P21B204-99) ────────────────────────────────────────────────
 *   생성 : `POST /api/v1/performances` (API-performance-01) — `useCreatePerformance`
 *   팀   : `GET /api/v1/teams/me` (API-team-02) — `leader === true`인 팀만 `hostTeamId` 후보다
 *   지갑 : `GET /api/v1/wallets/me` (API-wallet-01) — 보증금 패널의 리더 지갑 잔액
 *
 * 첫 단계에서 공연 정보와 티켓 옵션을 함께 입력한다. 저장 시 공연을 먼저 만든 뒤 받은
 * `performanceId`로 티켓 옵션을 저장하고, 둘 다 성공하면 다음 단계로 이동한다 —
 * 단독 공연은 **정산 규칙(P-05)**, 합동 공연은 **참여팀(P-03 2단계 → P-04)**이다.
 * 준비 순서는 `정보·티켓 → 참여팀 → 규칙 → 동의 → 보증금`이다(`setupSteps.ts`).
 *
 * ⚠ **`jointPerformance`는 이 화면에서만 정한다** — `PerformanceUpdateRequest` 에 그 필드가
 *   없어 만든 뒤에는 바꿀 수 없다. 그래서 **폼보다 먼저 선택 모달**(`JointChoiceDialog`)로 묻고
 *   (9/26 — 폼 안 체크박스는 작아서 지나쳤다), 폼은 고른 값을 문구로 보여 주며 "변경"으로 모달을
 *   다시 연다. 고르기 전에 닫으면(Esc·×·배경) 공연을 만들지 않겠다는 뜻으로 보고 이전 화면으로 돌아간다.
 *
 * 두 요청을 묶는 API 가 없어 **티켓 옵션만 실패하는 부분 성공**이 생긴다. 생성된 id 를 ref 에
 * 보관해 재시도에서 공연을 다시 만들지 않고, 무엇이 저장됐는지 문구로 알린다.
 *
 * 실패는 `code`로만 가른다 — `msg`는 표시 전용이다(응답 규격 §1). 서버가 어느 **필드**가 틀렸는지
 * 짚어 주지 않으므로(`PERFORMANCE_DATE_INVALID`는 "과거 일시" · "종료 역전" 둘 다) 필드 오류를
 * 지어내지 않고 폼 하단 안내 한 줄로 보여준다.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { formatApprox } from '@/features/member/localeOptions'
import { JointChoiceDialog } from '@/features/studio/JointChoiceDialog'
import { PerformanceForm } from '@/features/studio/PerformanceForm'
import type { HostTeamOption, SaveResult } from '@/features/studio/PerformanceForm'
import { StudioShell } from '@/features/studio/StudioShell'
import type { StudioTeamRef } from '@/features/studio/StudioShell'
import { toLeaderWallet } from '@/features/studio/leaderWallet'
import { kstInputToIso } from '@/features/studio/performanceFields'
import type { PerformanceInfoValues, TicketTypeDraft } from '@/features/studio/performanceFields'
import { isApiError } from '@/shared/api/client'
import { isWalletNotFound } from '@/shared/api/domains/wallet'
import { useLocale } from '@/shared/i18n/useLocale'
import {
  useCreatePerformance,
  useSetTicketTypes,
  useUpdatePerformance,
} from '@/shared/queries/performance'
import { useMyTeams } from '@/shared/queries/team'
import { useMyWallet } from '@/shared/queries/wallet'

/**
 * 공연은 만들어졌고 티켓 옵션만 실패했을 때 덧붙이는 안내.
 *
 * performance_01 과 performance_05 를 묶는 API 가 없어 부분 성공이 생긴다. 수정 화면
 * (`PerformanceEditPage`)에도 같은 뜻의 문구가 있는데, 거기는 "만들어졌다"를 말할 필요가 없다.
 */
const CREATED_WITHOUT_TICKETS =
  '공연은 준비 중(DRAFT)으로 만들어졌고 티켓 옵션만 저장되지 않았습니다. 다시 저장하면 같은 공연에 이어 저장됩니다.'

export function PerformanceCreatePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { text } = useLocale()
  /**
   * 공연 형태 — 모달에서 고르기 전에는 `undefined`다. 기본값을 두지 않는다: 기본값이 있으면
   * 모달을 닫기만 해도 그 값으로 진행돼, 작은 체크박스를 지나치던 문제가 모양만 바꿔 남는다.
   */
  const [joint, setJoint] = useState<boolean | undefined>(undefined)
  const [choosingJoint, setChoosingJoint] = useState(true)
  const myTeams = useMyTeams()
  const wallet = useMyWallet()
  const create = useCreatePerformance()
  const update = useUpdatePerformance()
  const setTicketTypes = useSetTicketTypes()
  /**
   * 티켓 옵션 저장 실패 뒤 재시도할 때 같은 공연을 이어서 쓴다.
   *
   * **`hostTeamId`를 함께 들고 있어야 한다.** 재시도의 `PATCH`(performance_04)에는
   * `hostTeamId`가 없어 주최 팀을 옮길 수 없다 — 팀만 바꿔 다시 누르면 공연은 최초 팀 소유로
   * 남는데 화면은 성공으로 끝난다. 그래서 팀이 바뀌면 이 공연을 버리고 새로 만든다.
   */
  const createdRef = useRef<{ performanceId: number; hostTeamId: number } | undefined>(undefined)

  /** 껍데기의 팀 전환. 고르기 전까지는 첫 팀이다 */
  const [pickedTeamId, setPickedTeamId] = useState<number | undefined>()

  // 식별자·이름이 없는 행은 고를 수 없어 건너뛴다
  const teams: StudioTeamRef[] = useMemo(
    () =>
      (myTeams.data?.items ?? []).flatMap((item) =>
        item.teamId != null && item.teamName
          ? [{ teamId: item.teamId, teamName: item.teamName }]
          : [],
      ),
    [myTeams.data],
  )

  /** `hostTeamId` 후보 — **리더인 팀만** 온다(performance_01 403 `COMMON_FORBIDDEN`) */
  const hostTeams: HostTeamOption[] = useMemo(
    () =>
      (myTeams.data?.items ?? []).flatMap((item) =>
        item.teamId != null && item.teamName && item.leader
          ? [{ teamId: item.teamId, teamName: item.teamName }]
          : [],
      ),
    [myTeams.data],
  )

  // 404(미등록)는 오류가 아니다. 그 밖의 실패도 보증금 패널의 잔액만 비운다(§5.10)
  const walletView = wallet.data && !isWalletNotFound(wallet.error) ? wallet.data : undefined

  const onSaveSetup = useCallback(
    async (values: PerformanceInfoValues, rows: TicketTypeDraft[]): Promise<SaveResult> => {
      // 리더인 팀이 하나면 폼이 그 팀으로 고정한다. 하나도 없으면 만들 수 없다
      const hostTeamId = values.hostTeamId ?? hostTeams[0]?.teamId
      if (hostTeamId == null) {
        return {
          ok: false,
          code: 'COMMON_FORBIDDEN',
          fieldErrors: { hostTeamId: '리더인 팀이 있어야 공연을 만들 수 있습니다.' },
        }
      }

      const description = values.description.trim()
      const info = {
        title: values.title.trim(),
        ...(description ? { description } : {}),
        venueName: values.venueName.trim(),
        venueAddress: values.venueAddress.trim(),
        // 입력은 KST 벽시계다. 오프셋을 명시해 서버가 시간대를 추측하지 않게 한다
        startAt: kstInputToIso(values.startAt),
        endAt: kstInputToIso(values.endAt),
      }
      /*
       * 주최 팀이 바뀌었으면 이어 쓰지 않는다 — 옮길 API 가 없으니 새 공연을 만드는 것이
       * 사용자의 뜻이다. 먼저 만든 DRAFT 는 남는다(`/studio` 목록에서 지우거나 이어서 쓴다) —
       * 화면이 조용히 다른 팀 소유로 저장하는 것보다 낫다.
       */
      if (createdRef.current && createdRef.current.hostTeamId !== hostTeamId) {
        createdRef.current = undefined
      }
      let performanceId = createdRef.current?.performanceId
      try {
        if (performanceId === undefined) {
          const created = await create.mutateAsync({
            hostTeamId,
            ...info,
            /*
             * 공연 형태는 **여기서만** 정해진다 — `PerformanceUpdateRequest` 에 이 필드가 없어
             * 만든 뒤에는 바꿀 수 없다. 그래서 폼보다 먼저 모달로 묻고(수정 화면은 읽기 전용),
             * 재시도 경로의 `PATCH` 에는 담지 않는다.
             */
            jointPerformance: values.jointPerformance,
          })
          if (created.performanceId == null) {
            // 만들어지긴 했는데 어디로 가야 할지 모른다. 성공으로 치고 넘어가면 빈 화면이 된다
            return { ok: false, code: 'COMMON_INTERNAL_ERROR' }
          }
          performanceId = created.performanceId
          createdRef.current = { performanceId, hostTeamId }
        } else {
          // 첫 POST 뒤 티켓 저장이 실패했다면 같은 공연의 최신 입력값을 갱신하고 이어서 저장한다
          await update.mutateAsync({ performanceId, body: info })
        }
      } catch (error) {
        if (isApiError(error)) return { ok: false, code: error.code, msg: error.msg }
        return { ok: false, code: 'COMMON_INTERNAL_ERROR' }
      }

      /*
       * 여기부터는 **공연이 이미 만들어져 있다.** performance_01 과 performance_05 를 묶는
       * API 가 없어 티켓 옵션만 실패하는 부분 성공이 생긴다.
       *
       * 공연을 지우지 않는다 — DRAFT 로 남겨 두고 `createdRef` 로 이어 간다.
       * 재시도는 `POST` 대신 `PATCH`(같은 값 = 무해) + `PUT` 이라 공연이 중복되지 않는다.
       * 떠났을 때 남는 DRAFT 는 `/studio` 목록에서 이어서 고칠 수 있다.
       *
       * 그래서 **무엇이 저장됐는지 말한다.** "처리하지 못했습니다"만 띄우면 공연이 안 만들어진
       * 줄 알고 처음부터 다시 만들어 DRAFT 를 하나 더 쌓는다.
       */
      try {
        await setTicketTypes.mutateAsync({
          performanceId,
          body: {
            ticketTypes: rows.map((row) => ({
              name: row.name.trim(),
              price: Number(row.price),
              totalQuantity: Number(row.totalQuantity),
            })),
          },
        })

        /*
         * 다음 단계는 **공연 형태가 가른다.**
         *   단독 — 바로 정산 규칙(P-05)이다. 서버 순서가 `규칙 → createShow → …`라, 규칙 없이
         *          보증금을 서명하면 `ShowNotFound`로 revert 되고 대납 가스만 태운다(D-60).
         *   합동 — **참여팀 초대가 먼저**다(S15P21B204-136). 규칙 화면이 `participants[]` 로 팀
         *          몫을 나누므로 초대 전에 열면 규칙이 1팀으로 굳고, 보증금 prepare 가
         *          `TEAM_MIN_COUNT_NOT_MET` 로 막힌다. P-03 수정 화면의 참여팀 단계로 보낸다.
         */
        navigate(`/studio/performances/${performanceId}/poster`, { replace: true })
        return { ok: true }
      } catch (error) {
        const detail = isApiError(error) ? error.msg : undefined
        return {
          ok: false,
          code: isApiError(error) ? error.code : 'COMMON_INTERNAL_ERROR',
          msg: [CREATED_WITHOUT_TICKETS, detail].filter(Boolean).join(' '),
        }
      }
    },
    [create, hostTeams, navigate, setTicketTypes, update],
  )

  /**
   * 모달을 고르지 않고 닫았다. 처음 고르는 중이면 공연 만들기를 그만둔 것으로 보고 떠난다 —
   * 앱 안에서 들어왔으면 이전 화면으로, 주소를 바로 열었으면(돌아갈 곳이 앱 밖이다) 스튜디오 홈으로.
   * 이미 고른 뒤 "변경"으로 연 것이면 값을 그대로 두고 닫기만 한다.
   */
  const onCloseJointChoice = () => {
    if (joint !== undefined) {
      setChoosingJoint(false)
      return
    }
    if (location.key !== 'default') navigate(-1)
    else navigate('/studio', { replace: true })
  }

  return (
    <StudioShell
      teams={teams}
      activeTeamId={pickedTeamId ?? teams[0]?.teamId}
      onTeamChange={setPickedTeamId}
      title={text('새 공연', 'New show')}
    >
      <JointChoiceDialog
        open={choosingJoint}
        value={joint}
        onSelect={(value) => {
          setJoint(value)
          setChoosingJoint(false)
        }}
        onClose={onCloseJointChoice}
      />
      {/* 공연 형태를 고르기 전에는 폼을 그리지 않는다 — 기본값으로 저장될 길을 막는다 */}
      {joint !== undefined && (
        <PerformanceForm
          mode="create"
          // 팀 목록은 `hostTeamId`의 입력이라 도착 전에는 폼을 그리지 않는다.
          // 지갑은 기다리지 않는다 — 생성 자체에 필요 없다(§5.10)
          loading={myTeams.isPending}
          wallet={toLeaderWallet(walletView, formatApprox)}
          teams={hostTeams}
          onSaveSetup={onSaveSetup}
          jointPerformance={joint}
          onChangeJointPerformance={() => setChoosingJoint(true)}
        />
      )}
    </StudioShell>
  )
}

export default PerformanceCreatePage
