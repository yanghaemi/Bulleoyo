/**
 * P-02 팀 관리(관리 모드) 페이지 — 라우트 `/studio/teams/:teamId`.
 *
 * 이 파일은 **조립만** 한다. 껍데기(`StudioShell`)와 본문(`TeamManage`)은 features에 있다.
 *
 * ── API (S15P21B204-99) ────────────────────────────────────────────────
 *   팀 상세   : `GET /api/v1/teams/{teamId}` (API-team-03) — `useTeamDetail`
 *   팀 수정   : `PATCH /api/v1/teams/{teamId}` (API-team-04) — `useUpdateTeam`. **바뀐 필드만** 보낸다.
 *               **[v8]** `genre`는 선택이라 바뀌었을 때만 실린다(미전달 = 기존 값 유지)
 *   팀 전환   : `GET /api/v1/teams/me` (API-team-02) — 껍데기 사이드의 팀 목록
 *   지갑      : `GET /api/v1/wallets/me` (API-wallet-01) — `useMyWallet`
 *   거래 이력 : `GET /api/v1/wallets/me/transactions` (API-wallet-02) — 첫 페이지만.
 *               화면설계 P-02는 페이지네이션·필터를 요구하지 않는다
 *
 * **팀 상세의 `wallet`은 잔액을 갖지 않는다**(team_03 설명). 잔액·이력은 wallet 도메인이 정본이라
 * 두 곳을 따로 부른다.
 *
 * 에러는 패널 단위로 가른다 — 하나가 실패해도 화면 전체를 덮지 않는다(§5.10).
 *   403 `COMMON_FORBIDDEN` → 권한 없음 화면 · 404 `TEAM_NOT_FOUND` → 에러 패널
 *   404 `WALLET_NOT_FOUND` → **오류가 아니라 미등록**이라 지갑 패널만 빈다
 *   502 → 잔액 자리만 `—`. 분기는 `code`로만 한다(응답 규격 §1)
 *
 * **잔액 부족 안내(§5.16)** — P-02 컴포넌트 표는 연결 API를 `GET /wallets/me` 하나로 적었지만
 *   그 응답만으로는 "보증금 미납 공연이 있는가"를 알 수 없다(`TeamManage.tsx`의 `DepositShortfall`
 *   주석에 같은 지적이 있다). `GET /performances/me`(performance_06)에서 `depositStatus === 'UNPAID'`
 *   이고 `host`인 행을 함께 보고 판정한다 — `pickDepositShortfall`. 잔액을 못 읽었으면 안내하지
 *   않는다(모름 ≠ 0원). 보증금 **금액**은 읽기 전용 API에 없어 명세 고정값 50,000 YoYo을 쓴다.
 */

import { useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router'

import { formatApprox } from '@/features/member/localeOptions'
import { StudioShell } from '@/features/studio/StudioShell'
import type { StudioTeamRef } from '@/features/studio/StudioShell'
import { TeamManage } from '@/features/studio/TeamManage'
import type { TeamDetailData } from '@/features/studio/TeamManage'
import {
  pickDepositShortfall,
  toLeaderWallet,
  toStudioWalletTx,
} from '@/features/studio/leaderWallet'
import { DEPOSIT_AMOUNT } from '@/features/studio/performanceFields'
import { studioFailureText } from '@/features/studio/studioErrors'
import type { TeamFormValues } from '@/features/studio/teamForm'
import { isApiError } from '@/shared/api/client'
import { isGenre } from '@/shared/i18n/genres'
import type { Genre } from '@/shared/i18n/genres'
import { isWalletNotFound } from '@/shared/api/domains/wallet'
import { useMyPerformanceList } from '@/shared/queries/performance'
import { useMyTeams, useTeamDetail, useUpdateTeam } from '@/shared/queries/team'
import { useMyWallet, useMyWalletTransactions } from '@/shared/queries/wallet'

/** 라우트 파라미터는 문자열이고 사람이 고칠 수 있다. 숫자가 아니면 조회를 걸지 않는다. */
function toTeamId(raw: string | undefined): number | undefined {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

export function TeamManagePage() {
  const navigate = useNavigate()
  const { teamId: rawTeamId } = useParams()
  const teamId = toTeamId(rawTeamId)

  const detail = useTeamDetail(teamId ?? 0, { enabled: teamId !== undefined })
  const myTeams = useMyTeams()
  const wallet = useMyWallet()
  const transactions = useMyWalletTransactions({ size: 20, sort: 'occurredAt,desc' })
  // §5.16 안내의 나머지 절반. 실패해도 다른 패널은 그대로 그린다(§5.10)
  const performances = useMyPerformanceList()
  const save = useUpdateTeam()

  const teams: StudioTeamRef[] = (myTeams.data?.items ?? []).flatMap((item) =>
    item.teamId != null && item.teamName ? [{ teamId: item.teamId, teamName: item.teamName }] : [],
  )

  // `useMemo` 는 성능이 아니라 **정체성** 때문이다 — 매 렌더 새 객체면 아래 `onSave` 의
  // `useCallback` 이 매번 새로 만들어져 의존성으로 두는 의미가 사라진다.
  const team: TeamDetailData | undefined = useMemo(() => {
    const data = detail.data
    if (data?.teamId == null || !data.teamName) return undefined
    return {
      teamId: data.teamId,
      teamName: data.teamName,
      introduction: data.introduction ?? undefined,
      // [v8] 10종 밖의 값(마이그레이션 전 자유 문자열)은 폼에 넣지 않는다 — 그대로 되돌려
      // 보내면 서버가 400을 준다. 리더가 한 번 고르면 정상 코드가 된다
      genre: isGenre(data.genre) ? data.genre : undefined,
      contactEmail: data.contactEmail ?? undefined,
    }
  }, [detail.data])

  // 403은 "리더가 아니다", 404는 "그런 팀이 없다" — 화면이 다르게 그린다
  const detailError = isApiError(detail.error) ? detail.error : undefined
  const forbidden =
    detailError?.code === 'COMMON_FORBIDDEN'
      ? studioFailureText(detailError.code, detailError.msg)
      : undefined
  const error =
    detailError && detailError.code !== 'COMMON_FORBIDDEN'
      ? studioFailureText(detailError.code, detailError.msg)
      : undefined

  // 404(미등록)는 오류가 아니다. 그 밖의 실패도 지갑 패널만 비우고 팀 정보는 그대로 둔다
  const walletView = wallet.data && !isWalletNotFound(wallet.error) ? wallet.data : undefined

  const onSave = useCallback(
    (values: TeamFormValues) => {
      if (teamId === undefined) return
      // **바뀐 필드만 보낸다**(team_04는 전달된 필드만 수정한다). 같은 값을 다시 보내면
      // 서버가 무의미한 갱신을 하고 감사 로그가 지저분해진다.
      //
      // ⚠ **비우기는 빈 문자열로 보낸다.** `undefined`를 담으면 `JSON.stringify`가 키째 지워
      // 본문이 `{}`가 되고, 소개를 지운 사람은 "저장됨"을 보고도 옛 소개가 그대로 남는다.
      // `null`도 안 된다 — `Team.update`가 `if (description != null)`이라 null은 건너뛴다.
      // 빈 문자열만이 실제로 지운다.
      const body: { teamName?: string; introduction?: string; genre?: Genre } = {}
      if (values.teamName !== team?.teamName) body.teamName = values.teamName
      // [v8] 장르는 **선택**이다(team-04). 바뀌지 않았거나 아직 못 고른 상태면 보내지 않는다
      if (values.genre !== '' && values.genre !== team?.genre) body.genre = values.genre
      // 조회는 소개 없음을 `undefined`로 준다. 비교 전에 폼과 같은 ''로 맞춘다
      if (values.introduction !== (team?.introduction ?? '')) {
        body.introduction = values.introduction
      }
      if (Object.keys(body).length === 0) return
      save.mutate({ teamId, body })
    },
    [save, team, teamId],
  )

  return (
    <StudioShell
      teams={teams}
      activeTeamId={teamId}
      onTeamChange={(next) => navigate(`/studio/teams/${next}`)}
      title={team?.teamName ?? 'Team / 팀'}
    >
      <TeamManage
        // 팀을 바꾸면 `teamId`가 바뀌어 `useTeamDetail`이 새 키로 조회한다 —
        // `placeholderData`가 없어 그 순간 `isPending`이 다시 true다. 전환 상태를 따로 들 필요가 없다
        loading={detail.isPending}
        data={team}
        wallet={toLeaderWallet(walletView, formatApprox)}
        shortfall={pickDepositShortfall(
          performances.data?.items ?? [],
          walletView?.balance?.amount,
          DEPOSIT_AMOUNT,
        )}
        // 종류·상태가 없는 행은 그릴 수 없어 건너뛴다(toStudioWalletTx가 null을 준다)
        transactions={(transactions.data?.items ?? []).flatMap((item) => {
          const row = toStudioWalletTx(item)
          return row ? [row] : []
        })}
        forbidden={forbidden}
        error={error}
        onSave={onSave}
        saving={save.isPending}
        saveFailure={
          isApiError(save.error) ? studioFailureText(save.error.code, save.error.msg) : undefined
        }
      />
    </StudioShell>
  )
}

export default TeamManagePage
