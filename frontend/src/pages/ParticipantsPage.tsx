/**
 * P-04 참여팀 관리 페이지 — 라우트 `/studio/performances/:id/participants`.
 *
 * 이 파일은 **조립만** 한다. 껍데기(`StudioShell`)와 본문(`ParticipantManage`)은 features에 있다.
 *
 * ── API (S15P21B204-99) ────────────────────────────────────────────────
 *   공연 상세 : `GET /api/v1/performances/{id}` (API-performance-03) — `usePerformanceDetail`
 *               공연명·상태·`participants[]`
 *   내 공연   : `GET /api/v1/performances/me` (API-performance-06) — `useMyPerformanceRows`
 *               이 공연에 대한 **내 팀의** `host`·`teamId`·`participationStatus`·`depositStatus`
 *   내 팀     : `GET /api/v1/teams/me` (API-team-02) — 껍데기 팀 전환 + 초대받은 내 팀 이름
 *   검표 링크 : `GET …/entry-link` (API-performance-10) — `useEntryLink` / 재발급은 `useRotateEntryLink`
 *   초대·수락·제외: `useInviteParticipant` · `useAcceptParticipation` · `useRemoveParticipant`
 *
 * 조회는 서로를 기다리지 않는다. 검표 링크가 403이어도 참여팀 목록은 그린다(§5.10).
 *
 * ── 참여팀 목록 (2026-09-26, 화면설계 v8.12) ─────────────────────────────
 *   목록은 **API-performance-19 `GET …/participants`** 로 그린다 — INVITED 팀과 초대·수락 시각을
 *   준다. 서버·openapi에는 9/22부터 있었는데 이 화면이 수락 팀만 담는 performance_03
 *   `participants[]`를 쓰고 있어 "보낸 초대가 안 보인다"는 문제가 났다(생성 타입도 갱신이 빠져
 *   `get?: never`였다). 초대·수락·제외 뮤테이션이 `qk.performance.all`을 무효화하므로
 *   `qk.performance.participants` 키도 성공 직후 다시 읽힌다.
 *   performance_19가 실패하면(네트워크·권한) **예전 경로**(performance_03 + 06)로 되돌리고
 *   `participantsComplete=false`로 알려 "수락 팀만 보인다" 안내를 띄운다 — 목록이 통째로 비는 것보다 낫다.
 *
 * ── 팀 검색 (API-team-06) ─────────────────────────────────────────────
 *   초대 콤보박스의 후보는 `useTeamSearchFetcher`가 준다. 디바운스·취소는 콤보박스 몫이다.
 *
 * ⚠ **`leaderWalletLinked`도 조회에 없다.** 수락한 팀은 정의상 리더 지갑 주소를 가지므로
 *   (`PerformanceParticipant.isAccepted`) `true`로 확정할 수 있다. 그 밖의 행은 모른다 —
 *   `undefined`로 넘겨 배지를 비운다. `false`로 채우면 멀쩡한 팀이 "미등록"으로 보인다.
 */

import { useCallback, useMemo, useState } from 'react'
import { useParams } from 'react-router'

import { ParticipantManage } from '@/features/studio/ParticipantManage'
import {
  buildParticipantRows,
  buildParticipantRowsFromList,
} from '@/features/studio/participantRows'
import type {
  EntryLinkData,
  EntryLinkRotateResult,
  ParticipantActionResult,
  ParticipantScreenData,
  TeamCandidate,
} from '@/features/studio/ParticipantManage'
import { StudioShell } from '@/features/studio/StudioShell'
import { performanceBackPath } from '@/features/studio/studioNavigation'
import type { StudioTeamRef } from '@/features/studio/StudioShell'
import { entryLinkFailureText, studioFailureText } from '@/features/studio/studioErrors'
import { isApiError } from '@/shared/api/client'
import { PerformanceCode } from '@/shared/api/domains/performance'
import type { EntryLink } from '@/shared/api/domains/performance'
import {
  useAcceptParticipation,
  useEntryLink,
  useInviteParticipant,
  useMyPerformanceRows,
  useParticipants,
  usePerformanceDetail,
  useRemoveParticipant,
  useRotateEntryLink,
} from '@/shared/queries/performance'
import { useMyTeams, useTeamSearchFetcher } from '@/shared/queries/team'

/** 라우트 파라미터는 사람이 고칠 수 있다. 숫자가 아니면 조회를 걸지 않는다. */
function toPerformanceId(raw: string | undefined): number | undefined {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

/**
 * performance_10 응답 → 화면 타입. `entryToken`은 옮기지 않는다(본문 머리말).
 * 링크·발급 시각·만료 중 하나라도 없으면 패널을 그리지 않는다 — 반쪽 링크는 공유하면 안 된다.
 */
function toEntryLink(data: EntryLink | undefined): EntryLinkData | undefined {
  if (!data?.entryUrl || !data.expiresAt || !data.issuedAt) return undefined
  const window =
    data.entryWindow?.opensAt && data.entryWindow.closesAt
      ? { opensAt: data.entryWindow.opensAt, closesAt: data.entryWindow.closesAt }
      : undefined
  return {
    entryUrl: data.entryUrl,
    expiresAt: data.expiresAt,
    issuedAt: data.issuedAt,
    entryWindow: window,
  }
}

/** 뮤테이션 실패를 화면이 쓰는 `{ ok, code, msg }`로 옮긴다. 분기는 `code`로만 한다 */
function toFailure(error: unknown): ParticipantActionResult {
  return isApiError(error) ? { ok: false, code: error.code, msg: error.msg } : { ok: false }
}

export function ParticipantsPage() {
  const performanceId = toPerformanceId(useParams().id)
  const enabled = performanceId !== undefined
  const id = performanceId ?? 0

  const detail = usePerformanceDetail(id, { enabled })
  // 단건 API가 없으므로 pageInfo를 끝까지 따라가 이 공연의 내 팀 행을 모두 찾는다.
  const mine = useMyPerformanceRows(id, { enabled })
  const myTeams = useMyTeams()
  const entryLink = useEntryLink(id, { enabled })
  const participantList = useParticipants(id, { enabled })
  const fetchTeamSearch = useTeamSearchFetcher()

  /** 껍데기 사이드 메뉴의 "팀" 링크가 가리킬 팀. 공연은 바뀌지 않는다 */
  const [pickedTeamId, setPickedTeamId] = useState<number | undefined>()

  const invite = useInviteParticipant()
  const accept = useAcceptParticipation()
  const remove = useRemoveParticipant()
  const rotate = useRotateEntryLink()

  const teams: StudioTeamRef[] = useMemo(
    () =>
      (myTeams.data?.items ?? []).flatMap((item) =>
        item.teamId != null && item.teamName
          ? [{ teamId: item.teamId, teamName: item.teamName }]
          : [],
      ),
    [myTeams.data],
  )

  /** 같은 공연에 여러 팀으로 참여해도 첫 행만 보고 초대나 주최 권한을 놓치지 않는다. */
  const myRows = useMemo(
    () => (mine.data?.items ?? []).filter((item) => item.performanceId === id),
    [mine.data, id],
  )
  const myRow = myRows.find((item) => item.host) ?? myRows[0]
  // performance_19가 성공하면 그것이 정본이다. 실패하면 예전 경로(수락 팀 + 내 초대)로 되돌린다.
  const participantsComplete = participantList.data !== undefined || !participantList.isError
  const rows = useMemo(
    () =>
      participantList.data
        ? buildParticipantRowsFromList(participantList.data.items, myRows, teams)
        : buildParticipantRows(detail.data?.participants, myRows, teams),
    [participantList.data, detail.data, myRows, teams],
  )
  const ownTeamIds = useMemo(() => teams.map((team) => team.teamId), [teams])

  /** API-team-06 → 콤보박스 후보. 화면 타입으로 옮겨 생성 타입이 features로 새지 않게 한다 */
  const onSearchTeams = useCallback(
    async (q: string, signal: AbortSignal): Promise<TeamCandidate[]> => {
      const result = await fetchTeamSearch(q, signal)
      return (result.items ?? []).map((item) => ({
        teamId: item.teamId,
        teamName: item.teamName,
        genre: item.genre,
      }))
    },
    [fetchTeamSearch],
  )

  const detailError = isApiError(detail.error) ? detail.error : undefined
  // 생성 타입의 `PerformanceStatus`가 화면 타입과 같은 enum이라 좁히기만 하면 된다
  const status = detail.data?.status

  const data: ParticipantScreenData | undefined =
    status !== undefined
      ? {
          performanceId: id,
          performanceStatus: status,
          // 생성자 판정은 performance_06의 `host`다 — 상세에는 "내가 생성자인가"가 없다
          isOwner: myRow?.host === true,
          depositStatus: myRow?.depositStatus,
          participants: rows,
          participantsComplete,
          ownTeamIds,
          entryLink: toEntryLink(entryLink.data),
          // 이 맥락에서 `PERFORMANCE_INVALID_STATUS`는 보증금이 아니라 공연 취소다
          entryLinkError: isApiError(entryLink.error)
            ? entryLinkFailureText(entryLink.error.code, entryLink.error.msg)
            : undefined,
        }
      : undefined

  const onInvite = useCallback(
    async (teamId: number): Promise<ParticipantActionResult> => {
      if (!enabled) return { ok: false }
      try {
        await invite.mutateAsync({ performanceId: id, body: { teamId } })
        return { ok: true }
      } catch (error) {
        return toFailure(error)
      }
    },
    [enabled, id, invite],
  )

  const onAccept = useCallback(
    async (teamId: number): Promise<ParticipantActionResult> => {
      if (!enabled) return { ok: false }
      try {
        await accept.mutateAsync({ performanceId: id, teamId })
        return { ok: true }
      } catch (error) {
        return toFailure(error)
      }
    },
    [accept, enabled, id],
  )

  const onRemove = useCallback(
    async (teamId: number): Promise<ParticipantActionResult> => {
      if (!enabled) return { ok: false }
      try {
        await remove.mutateAsync({ performanceId: id, teamId })
        return { ok: true }
      } catch (error) {
        return toFailure(error)
      }
    },
    [enabled, id, remove],
  )

  const onRotateEntryLink = useCallback(async (): Promise<EntryLinkRotateResult> => {
    if (!enabled) return { ok: false }
    try {
      const result = await rotate.mutateAsync(id)
      // 재발급은 됐는데 응답이 반쪽이면 성공으로만 알리고 링크는 갈아끼우지 않는다
      return { ok: true, link: toEntryLink(result) }
    } catch (error) {
      return toFailure(error)
    }
  }, [enabled, id, rotate])

  const title = detail.data?.title ?? '공연'

  // 403(관계자 아님)과 그 밖(404·5xx)은 화면이 다르다. 한 문구가 두 자리에 겹쳐 뜨지 않게 가른다
  const failureText = detailError ? studioFailureText(detailError.code, detailError.msg) : undefined
  const forbidden =
    detailError?.code === PerformanceCode.NOT_OWNER || detailError?.code === 'COMMON_FORBIDDEN'
      ? failureText
      : undefined

  return (
    <StudioShell
      teams={teams}
      // 공연 스코프 화면이라 팀을 골라도 공연이 바뀌지는 않는다. 사이드 메뉴 "팀" 링크가
      // 가리킬 팀만 바뀐다(P-03 와 같다). 핸들러를 안 주면 select 는 그려지는데 골라도
      // 아무 일이 없다 — 죽은 컨트롤을 두느니 실제로 하는 일을 준다
      activeTeamId={pickedTeamId ?? myRow?.teamId}
      onTeamChange={setPickedTeamId}
      title={title}
      backTo={performanceBackPath(id, myRow?.host)}
    >
      <ParticipantManage
        key={id}
        title={title}
        // 참여팀 목록도 기다린다 — 먼저 그리면 수락 팀만 보였다가 초대 팀이 뒤늦게 튀어나온다
        loading={enabled && (detail.isPending || mine.isPending || participantList.isPending)}
        data={data}
        // 403은 "이 공연의 관계자가 아니다", 그 밖은 에러 패널이다
        forbidden={forbidden}
        error={!enabled ? '잘못된 공연 주소입니다.' : forbidden ? undefined : failureText}
        onRetry={() => {
          void detail.refetch()
          void participantList.refetch()
        }}
        onInvite={onInvite}
        onAccept={onAccept}
        onRemove={onRemove}
        onRotateEntryLink={onRotateEntryLink}
        onSearchTeams={onSearchTeams}
      />
    </StudioShell>
  )
}

export default ParticipantsPage
