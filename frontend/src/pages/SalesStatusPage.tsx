/**
 * P-07 판매·선택 현황 페이지 — 라우트 `/studio/performances/:id/sales`.
 *
 * 이 파일은 **조립만** 한다. 껍데기(`StudioShell`)와 본문(`SalesStatus`)은 features에 있고
 * 여기서는 훅 세 개를 붙여 넘긴다. **페이지는 `api`를 직접 부르지 않는다.**
 *
 * ── API (S15P21B204-102) ───────────────────────────────────────────────
 *   판매·선택: `GET /api/v1/performances/{performanceId}/sales` (API-performance-11) — `useSalesStatus`
 *              정상 조회 중 15초마다 갱신한다(공연 ENDED·CANCELLED면 멈춤). 오류 시 자동 갱신을 멈추고 재시도를 안내한다.
 *   공연명   : `GET /api/v1/performances/{id}` (API-performance-03) — `usePerformanceDetail`
 *              ⚠ performance-11 응답에 공연명이 없다(P-08·S-03이 같은 문제).
 *   팀 목록  : `GET /api/v1/teams/me` (API-team-02) — `useMyTeams`. 껍데기 팀 전환용이다.
 *   에러     : `SETTLEMENT_NOT_PARTICIPANT`(403) · `PERFORMANCE_NOT_FOUND`(404) ·
 *              `COMMON_INTERNAL_ERROR`(500) · `COMMON_UNAUTHORIZED`(401 → 클라이언트가 조용히 재발급, §1.2 원칙 10).
 *
 * 분기는 `code`로만 한다 — `msg`로 분기하지 않는다(응답 규격 §1).
 */

import { useMemo, useState } from 'react'
import { useParams } from 'react-router'

import { SalesStatus } from '@/features/studio/SalesStatus'
import { StudioShell } from '@/features/studio/StudioShell'
import type { StudioTeamRef } from '@/features/studio/StudioShell'
import { isApiError } from '@/shared/api/client'
import { useLocale } from '@/shared/i18n/useLocale'
import { usePerformanceDetail, useSalesStatus } from '@/shared/queries/performance'
import { useMyTeams } from '@/shared/queries/team'

/** 라우트 파라미터는 사람이 고칠 수 있다. 숫자가 아니면 조회를 걸지 않는다 */
function toPerformanceId(raw: string | undefined): number | undefined {
  const parsed = raw && /^\d+$/.test(raw) ? Number(raw) : NaN
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

export function SalesStatusPage() {
  const { text } = useLocale()
  const performanceId = toPerformanceId(useParams().id)
  const enabled = performanceId !== undefined
  const id = performanceId ?? 0

  const sales = useSalesStatus(id, { enabled })
  const detail = usePerformanceDetail(id, { enabled })
  const myTeams = useMyTeams()

  /** 껍데기 사이드 메뉴의 "팀" 링크가 가리킬 팀. 공연은 바뀌지 않는다(P-04·P-09와 같다) */
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

  const error = isApiError(sales.error) ? sales.error : undefined
  /*
   * 주소의 `:id`가 숫자가 아니면 조회 자체를 걸지 않았다 — 그 주소의 공연은 실제로 없다.
   * 본문 에러 패널은 `msg`만 받으므로(컴포넌트 표) 여기서 문구를 고르되 **분기는 code로** 한다.
   */
  const errorMsg = !enabled
    ? text('공연을 찾을 수 없습니다.', 'Show not found.')
    : sales.isError
      ? error?.msg ||
        text(
          '판매 현황을 갱신하지 못했어요. 다시 시도해 주세요.',
          'Could not refresh sales. Please try again.',
        )
      : undefined

  // ⚠ 공연명은 performance-11에 없다. 상세가 안 오면 화면 이름으로 둔다(지어내지 않는다)
  const title = detail.data?.title ?? text('판매 현황', 'Sales status')

  return (
    <StudioShell
      teams={teams}
      activeTeamId={pickedTeamId}
      onTeamChange={setPickedTeamId}
      title={title}
    >
      <SalesStatus
        title={title}
        data={sales.data}
        // 두 조회 중 하나라도 첫 응답 전이면 스켈레톤이다
        loading={enabled && (sales.isPending || detail.isPending)}
        error={errorMsg}
        onRetry={() => void sales.refetch()}
      />
    </StudioShell>
  )
}

export default SalesStatusPage
