import type {
  MyPerformanceListItem,
  ParticipantListItem,
  PerformanceDetail,
} from '@/shared/api/domains/performance'
import type { ParticipantRow } from './ParticipantManage'
import type { StudioTeamRef } from './StudioShell'

/** Public detail has accepted teams only. Supplement all returned owned invitations; the API may omit others. */
export function buildParticipantRows(
  accepted: PerformanceDetail['participants'],
  mine: MyPerformanceListItem[],
  teams: StudioTeamRef[],
): ParticipantRow[] {
  const ownTeamIds = new Set([
    ...teams.map((team) => team.teamId),
    ...mine.flatMap((row) => (row.teamId == null ? [] : [row.teamId])),
  ])
  const rows: ParticipantRow[] = (accepted ?? []).flatMap((row) =>
    row.teamId != null && row.teamName
      ? [
          {
            teamId: row.teamId,
            teamName: row.teamName,
            host: row.host,
            participationStatus: 'ACCEPTED',
            leaderWalletLinked: true,
            myTeam: ownTeamIds.has(row.teamId),
          },
        ]
      : [],
  )
  for (const row of mine) {
    if (
      row.participationStatus !== 'INVITED' ||
      row.teamId == null ||
      rows.some((item) => item.teamId === row.teamId)
    )
      continue
    const team = teams.find((item) => item.teamId === row.teamId)
    if (!team) continue
    rows.push({
      teamId: team.teamId,
      teamName: team.teamName,
      host: row.host ?? false,
      participationStatus: 'INVITED',
      myTeam: true,
    })
  }
  return rows
}

/**
 * API-performance-19(참여팀 조회) → 화면 행. **초대만 보낸(INVITED) 팀까지** 담긴다.
 *
 * - `leaderWalletLinked` — 조회가 주지 않는다. 수락한 팀은 수락 시점에 리더 지갑 주소를
 *   스냅샷으로 굳혔으므로 `true`로 확정하고, 대기 중인 팀은 모르는 값(`undefined`)으로 둔다.
 *   `false`로 채우면 멀쩡한 팀에 "미등록" 배지가 뜬다.
 * - `myTeam` — 내가 리더인 팀(`teams`)이거나 performance_06이 돌려준 내 팀 행이면 참이다.
 * - 서버 정렬(주최팀 우선 → 등록 순)을 그대로 쓴다.
 */
export function buildParticipantRowsFromList(
  items: ParticipantListItem[] | undefined,
  mine: MyPerformanceListItem[],
  teams: StudioTeamRef[],
): ParticipantRow[] {
  const ownTeamIds = new Set([
    ...teams.map((team) => team.teamId),
    ...mine.flatMap((row) => (row.teamId == null ? [] : [row.teamId])),
  ])
  return (items ?? []).flatMap((item) => {
    if (item.teamId == null || !item.teamName || item.participationStatus == null) return []
    const accepted = item.participationStatus === 'ACCEPTED'
    return [
      {
        teamId: item.teamId,
        teamName: item.teamName,
        host: item.host,
        participationStatus: item.participationStatus,
        leaderWalletLinked: accepted ? true : undefined,
        invitedAt: item.invitedAt,
        acceptedAt: item.acceptedAt,
        myTeam: ownTeamIds.has(item.teamId),
      },
    ]
  })
}
