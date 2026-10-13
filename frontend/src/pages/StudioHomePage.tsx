/**
 * P-01 공연자 대시보드 페이지 — 라우트 `/studio`.
 *
 * 이 파일은 **조립만** 한다. 껍데기(`StudioShell`)와 본문(`StudioHome`)은 features에 있다.
 *
 * ── API (S15P21B204-99) ────────────────────────────────────────────────
 *   내 팀     : `GET /api/v1/teams/me` (API-team-02) — `useMyTeams`.
 *               **팀이 없으면 빈 배열이지 404가 아니다.**
 *   참여 공연 : `GET /api/v1/performances/me` (API-performance-06) — `useMyPerformancesAll`.
 *               **전체 페이지**를 받아 넘긴다 — 공연·정산·보증금 상태 필터와 10개 페이지는 화면이
 *               클라이언트에서 자른다(서버는 status 단일 필터뿐이라 서버 페이지와 섞으면 빈 페이지가 생긴다)
 *   팀 잔액   : `GET /api/v1/wallets/me` (API-wallet-01) — 리더 지갑이 곧 팀 지갑이다
 *   할 일     : `useStudioTodos` — 공통 헤더 알림과 **같은 쿼리·같은 규칙**이다. 참여 공연 표의
 *               페이지와 무관하게 할 일 대상 상태(DRAFT·PENDING_AGREEMENT·ENDED) 전체에서 뽑는다
 *
 * 팀 목록을 먼저 확인하고, 리더인 팀이 있을 때만 PERFORMER 전용 공연 목록을 조회한다.
 * 각 조회 실패는 빈 상태로 숨기지 않고 해당 패널에서 재시도한다(§5.10).
 *
 * ⚠ **정산금 도착 할 일은 아직 만들지 않는다**(`useStudioTodos`가 빈 배열을 넘긴다).
 *   settlement-01 의 `myTeam.totalAmount` 가 필요한데 목록 API 에 그 금액이 없어
 *   **공연 수만큼 호출**해야 한다(N+1). 배너 하나를 위해 그 비용을 지금 치르지 않는다 —
 *   performance-06 응답에 `myTeamSettlementAmount` 를 더하는 명세 개정이 먼저다.
 */

import { useCallback, useMemo, useState } from 'react'

import { formatApprox } from '@/features/member/localeOptions'
import { StudioHome } from '@/features/studio/StudioHome'
import type {
  PerformanceActionResult,
  StudioPerformance,
  StudioTeam,
  StudioWallet,
} from '@/features/studio/StudioHome'
import { StudioShell } from '@/features/studio/StudioShell'
import { isApiError } from '@/shared/api/client'
import { isWalletNotFound } from '@/shared/api/domains/wallet'
import { POLL_MS } from '@/shared/queries/freshness'
import { useDeletePerformance, useMyPerformancesAll } from '@/shared/queries/performance'
import { useStudioTodos } from '@/shared/queries/studioTodos'
import { useMyTeams } from '@/shared/queries/team'
import { useMyWallet } from '@/shared/queries/wallet'
import { formatKst } from '@/shared/ui'
import type { SettlementStatus } from '@/shared/ui'

/**
 * 응답의 `settlementStatus`는 생성 타입에서 넓은 `string`이다(스키마에 enum 이 없는 자리가 있다).
 * 캐스팅으로 밀어 넣지 않고 아는 값인지 좁힌다 — 캐스팅하면 서버가 새 상태를 추가했을 때
 * 배지가 조용히 빈칸이 되고, 그 행이 왜 비었는지 화면만 봐서는 알 수 없다.
 *
 * 배지 파일에 두지 않은 이유는 **컴포넌트 파일은 컴포넌트만 export 한다**는 규약 때문이다
 * (Fast Refresh). 쓰는 곳이 늘면 그때 `shared/ui` 아래 비컴포넌트 모듈로 올린다.
 */
const SETTLEMENT_STATUSES: readonly SettlementStatus[] = [
  'NONE',
  'AGGREGATED',
  'LOCKED',
  'DISPUTE_OPEN',
  'RELEASED',
  'HALTED',
]

function isSettlementStatus(value: unknown): value is SettlementStatus {
  return typeof value === 'string' && (SETTLEMENT_STATUSES as readonly string[]).includes(value)
}

export function StudioHomePage() {
  const myTeams = useMyTeams()
  const teams: StudioTeam[] = useMemo(
    () =>
      (myTeams.data?.items ?? []).flatMap((item) =>
        item.teamId != null && item.teamName
          ? [
              {
                teamId: item.teamId,
                teamName: item.teamName,
                genre: item.genre ?? undefined,
                leader: item.leader ?? false,
                // 리더가 지갑을 등록하지 않았으면 줄 값이 없다 — null 이 "미등록" 배지의 입력이다
                walletAddress: item.walletAddress ?? null,
                balanceAmount: item.balanceAmount ?? undefined,
              },
            ]
          : [],
      ),
    [myTeams.data],
  )

  // 화면에 실제로 쓸 수 있는 팀이 있을 때만 PERFORMER 전용 API를 호출한다.
  const hasLoadedTeam = teams.length > 0
  // 초대·동의 요청 카드는 다른 팀이 만든다 — 화면이 보이는 동안 15초마다 다시 읽는다
  const performances = useMyPerformancesAll({
    enabled: hasLoadedTeam,
    refetchIntervalMs: POLL_MS.studioHome,
  })
  // 헤더 알림과 같은 키라 캐시를 공유한다. 홈이 보이는 동안만 주기 갱신한다
  const todos = useStudioTodos({ enabled: hasLoadedTeam, refetchIntervalMs: POLL_MS.studioHome })
  const wallet = useMyWallet()

  /** 사용자가 고르기 전까지는 첫 팀이다. `undefined`로 두면 껍데기가 아무것도 선택하지 않는다 */
  const [pickedTeamId, setPickedTeamId] = useState<number | undefined>()

  // 뮤테이션 실패를 화면이 쓰는 `{ ok, code, msg }`로 옮긴다. 분기는 `code`로만 한다
  const remove = useDeletePerformance()
  const onDeletePerformance = useCallback(
    async (performanceId: number): Promise<PerformanceActionResult> => {
      try {
        await remove.mutateAsync(performanceId)
        return { ok: true }
      } catch (error) {
        return isApiError(error) ? { ok: false, code: error.code, msg: error.msg } : { ok: false }
      }
    },
    [remove],
  )

  const rows: StudioPerformance[] = useMemo(
    () =>
      (performances.data?.items ?? []).flatMap((item) => {
        // 식별자·상태가 없는 행은 그릴 수 없다. 없는 값을 기본값으로 지어내면 "정산 완료"
        // 같은 상태가 화면에 잘못 뜬다.
        if (
          item.performanceId == null ||
          !item.title ||
          !item.status ||
          !item.depositStatus ||
          item.teamId == null ||
          !item.participationStatus ||
          !item.myTeamAgreementStatus
        ) {
          return []
        }
        return [
          {
            performanceId: item.performanceId,
            title: item.title,
            // §5.13 — 시각이 나오는 곳에는 KST 를 병기한다. 열은 늘리지 않고 보조 줄이다
            startAtLabel: item.startAt ? formatKst(item.startAt) : undefined,
            status: item.status,
            // 응답의 settlementStatus 는 넓은 string 이라 배지가 아는 값인지 좁힌다.
            // 캐스팅하면 서버가 상태를 추가했을 때 배지가 조용히 빈칸이 된다.
            // **모르는 값이어도 행은 버리지 않는다** — 행을 버리면 그 공연이 대시보드에서
            // 사라지고 보증금·동의 할 일까지 함께 사라진다. 배지 자리만 비운다
            settlementStatus: isSettlementStatus(item.settlementStatus)
              ? item.settlementStatus
              : undefined,
            depositStatus: item.depositStatus,
            teamId: item.teamId,
            host: item.host ?? false,
            participationStatus: item.participationStatus,
            myTeamAgreementStatus: item.myTeamAgreementStatus,
            pendingSignature: item.pendingSignature ?? null,
            // 키가 없으면 "모른다" — false 로 채우지 않는다(할 일이 거짓으로 뜬다)
            myTeamSettlementApproved: item.myTeamSettlementApproved,
          },
        ]
      }),
    [performances.data],
  )

  // 404(미등록)는 오류가 아니다. `undefined`면 본문이 지갑 미등록 배너를 그린다.
  const walletView = wallet.data && !isWalletNotFound(wallet.error) ? wallet.data : undefined
  const studioWallet: StudioWallet | undefined =
    walletView?.address && walletView.provider && walletView.status
      ? {
          address: walletView.address,
          provider: walletView.provider,
          status: walletView.status,
          balanceKrw: walletView.balance?.amount,
          approxLabel: walletView.balance?.display
            ? formatApprox(walletView.balance.display.currency, walletView.balance.display.approx)
            : undefined,
          updatedAtLabel: walletView.cachedAt ? formatKst(walletView.cachedAt) : undefined,
        }
      : undefined

  const activeTeamId = pickedTeamId ?? teams[0]?.teamId

  return (
    <StudioShell teams={teams} activeTeamId={activeTeamId} onTeamChange={setPickedTeamId}>
      <StudioHome
        // 세 조회 중 하나라도 아직이면 뼈대를 그린다. 실패는 패널이 각자 처리한다
        loading={myTeams.isPending || (hasLoadedTeam && performances.isPending)}
        teams={teams}
        performances={rows}
        todos={todos.todos}
        todosUnavailable={todos.isPending || todos.isError}
        wallet={studioWallet}
        activeTeamId={activeTeamId}
        teamError={myTeams.isError && teams.length === 0}
        performanceError={hasLoadedTeam && performances.isError && performances.data == null}
        onRetryTeams={() => void myTeams.refetch()}
        onRetryPerformances={() => {
          void performances.refetch()
          todos.refetch()
        }}
        onDeletePerformance={onDeletePerformance}
        refreshing={performances.isFetching}
        performanceTotal={performances.data?.totalElements}
      />
    </StudioShell>
  )
}

export default StudioHomePage
