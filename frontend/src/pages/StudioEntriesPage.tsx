/**
 * S-03(P-09) 입장 현황 — **공연자 경로**. 라우트 `/studio/performances/:id/entries`.
 *
 * 본문은 `features/entry/EntryStatus`로 `ScanEntriesPage`와 **같은 컴포넌트·같은 엔드포인트**다.
 * 차이는 껍데기와 인증이다 —
 *   · 여기는 로그인한 **참여팀 리더(PERFORMER)** 가 P-01·P-07에서 들어온다. `StudioShell`로 감싸고
 *     entry-02를 **`Authorization`** 으로 부른다(검표 토큰을 넘기지 않으면 도메인 함수가 그쪽으로 간다).
 *   · **`scanTo`를 넘기지 않는다.** 검표 링크 없이 들어왔으므로 돌아갈 스캔 화면이 없고,
 *     명세도 복귀 버튼을 "검표 링크 진입 시에만" 노출하라고 정했다(1417행).
 *
 * ── API (S15P21B204-101) ───────────────────────────────────────────────
 *   현황   : `GET /api/v1/performances/{performanceId}/entries` (API-entry-02) — `useEntries`
 *   공연명 : `GET /api/v1/performances/{id}` (API-performance-03) — `usePerformanceDetail`
 *            ⚠ entry-02 응답에 공연명이 없다(S-03·P-07이 같은 문제).
 *   팀 목록 : `GET /api/v1/teams/me` (API-team-02) — `useMyTeams`. 껍데기 팀 전환용이다.
 *   에러   : `COMMON_FORBIDDEN`(403, 참여팀 아님) · `PERFORMANCE_NOT_FOUND`(404) ·
 *            `COMMON_UNAUTHORIZED`(401) → 클라이언트가 조용히 재발급(§1.2 원칙 10).
 *
 * 분기는 `code`로만 한다 — `msg`로 분기하지 않는다(응답 규격 §1).
 */

import { useMemo, useState } from 'react'
import { useParams } from 'react-router'

import { EntryStatus } from '@/features/entry/EntryStatus'
import { EntryCode } from '@/features/entry/entryErrors'
import { StudioShell } from '@/features/studio/StudioShell'
import type { StudioTeamRef } from '@/features/studio/StudioShell'
import { isApiError } from '@/shared/api/client'
import { useEntries } from '@/shared/queries/entry'
import { usePerformanceDetail } from '@/shared/queries/performance'
import { useMyTeams } from '@/shared/queries/team'

/** 라우트 파라미터는 사람이 고칠 수 있다. 숫자가 아니면 조회를 걸지 않는다 */
function toPerformanceId(raw: string | undefined): number | undefined {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

export function StudioEntriesPage() {
  const performanceId = toPerformanceId(useParams().id)
  const enabled = performanceId !== undefined
  const id = performanceId ?? 0

  // 검표 토큰을 넘기지 않는다 — 로그인 회원의 Authorization으로 나가는 경로다
  const entries = useEntries({ performanceId }, {}, { enabled })
  const detail = usePerformanceDetail(id, { enabled })
  const myTeams = useMyTeams()

  /** 껍데기 사이드 메뉴의 "팀" 링크가 가리킬 팀. 공연은 바뀌지 않는다(P-04와 같다) */
  const [pickedTeamId, setPickedTeamId] = useState<number | undefined>()

  const teams: StudioTeamRef[] = useMemo(
    () =>
      (myTeams.data?.items ?? []).flatMap((item) =>
        item.teamId != null && item.teamName
          ? [{ teamId: item.teamId, teamName: item.teamName }]
          : [],
      ),
    [myTeams.data],
  )

  const error = isApiError(entries.error) ? entries.error : undefined
  /*
   * 주소의 `:id`가 숫자가 아니면 조회 자체를 걸지 않았다. 재시도로 낫지 않으므로
   * 다시 시도 버튼이 없는 "존재하지 않는 공연" 안내로 보낸다(그 주소의 공연은 실제로 없다).
   */
  const errorCode = enabled ? error?.code : EntryCode.PERFORMANCE_NOT_FOUND

  // ⚠ 공연명은 entry-02에 없다. 상세가 안 오면 화면 이름으로 둔다(지어내지 않는다)
  const title = detail.data?.title ?? '입장 현황'

  return (
    <StudioShell
      teams={teams}
      activeTeamId={pickedTeamId}
      onTeamChange={setPickedTeamId}
      title={title}
    >
      {/* `scanTo`를 넘기지 않는다 — 공연자 경로에는 스캔 화면 복귀 버튼이 없다(1417행) */}
      <EntryStatus
        title={title}
        data={entries.data}
        // 두 조회 중 하나라도 첫 응답 전이면 스켈레톤이다
        loading={enabled && (entries.isPending || detail.isPending)}
        errorCode={errorCode}
        errorMsg={enabled ? error?.msg : undefined}
        onRefresh={() => void entries.refetch()}
        onRetry={() => void entries.refetch()}
      />
    </StudioShell>
  )
}

export default StudioEntriesPage
