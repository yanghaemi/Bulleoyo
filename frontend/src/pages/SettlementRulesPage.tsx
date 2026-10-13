/**
 * P-05 정산 규칙 설정 페이지 — 라우트 `/studio/performances/:id/rules`.
 *
 * 이 파일은 **조립만** 한다. 껍데기(`StudioShell`)와 본문(`SettlementRules`)은 features에 있다.
 *
 * ── API (S15P21B204-99) ────────────────────────────────────────────────
 *   규칙·동의 : `GET /api/v1/performances/{id}/rules` (API-rule-02) — `useRuleStatus`
 *   규칙 저장 : `PUT /api/v1/performances/{id}/rules` (API-rule-01) — `useSetRules`
 *   공연 상세 : `GET /api/v1/performances/{id}` (API-performance-03) — 공연명과 참여팀(`host` 포함)
 *   내 공연   : `GET /api/v1/performances/me` (API-performance-06) — 규칙이 없을 때의 `depositStatus`
 *   판매 현황 : `GET /api/v1/performances/{id}/sales` (API-performance-11) — 가정 매출·팀별 선택 수
 *   내 팀     : `GET /api/v1/teams/me` (API-team-02) — 껍데기 팀 전환
 *
 * **규칙이 아직 없으면 rule_02가 404 `COMMON_NOT_FOUND`다. 오류가 아니라 빈 폼이다.**
 * 그때 참여팀·보증금 상태는 performance_03·performance_06에서 받아 채운다.
 *
 * 실패는 패널 단위로 가둔다 — 판매 현황이 502여도 폼은 그린다(§5.10).
 *
 * ⚠ **가정 매출 입력 필드가 명세에 없다(기존 지적 유지).** rule_01 요청에는 `simulationRevenue`가
 *   있는데 P-05 컴포넌트 표에 그 입력이 없어, 화면은 performance_11의 `grossRevenueAmount`를
 *   표시만 한다. 규칙은 판매 전에 정하므로 이 값은 대개 0이고, 그때 본문이 "아직 매출이 없어
 *   계산할 수 없습니다"를 띄운다. 저장 요청에 `simulationRevenue`를 실지 않는다 —
 *   화면이 사용자에게 묻지 않은 값을 서버로 보내는 셈이 된다.
 *
 * ⚠ **`createShow` 확정 뒤 규칙을 바꾸면 409다**(`RuleService.requireRuleChangeable`).
 *   서버가 온체인 `updateRules`를 보내는 중이면 `RULE_SYNC_IN_PROGRESS`이고, 이것은 **잠금이
 *   아니라 대기**다(기다리면 풀린다). 그래서 `isLockedCode`가 이 코드를 포함하지 않고,
 *   화면도 읽기 전용으로 바꾸지 않는다 — 문구만 띄우고 다시 저장할 수 있게 둔다.
 *   같은 규칙 재저장은 서버가 통과시킨다.
 */

import { useCallback, useMemo, useState } from 'react'
import { useParams } from 'react-router'

import { SettlementRules } from '@/features/studio/SettlementRules'
import type {
  RuleParticipant,
  RuleSaveResult,
  RuleScreenData,
} from '@/features/studio/SettlementRules'
import { StudioShell } from '@/features/studio/StudioShell'
import { performanceBackPath } from '@/features/studio/studioNavigation'
import type { StudioTeamRef } from '@/features/studio/StudioShell'
import { isLockedCode, studioFailureText } from '@/features/studio/studioErrors'
import { isApiError } from '@/shared/api/client'
import { PerformanceCode } from '@/shared/api/domains/performance'
import {
  useMyPerformanceRows,
  usePerformanceDetail,
  useSalesStatus,
} from '@/shared/queries/performance'
import { useRuleStatus, useSetRules } from '@/shared/queries/rule'
import { useMyTeams } from '@/shared/queries/team'
import type { DepositStatus } from '@/shared/ui'

/** 라우트 파라미터는 사람이 고칠 수 있다. 숫자가 아니면 조회를 걸지 않는다. */
function toPerformanceId(raw: string | undefined): number | undefined {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

export function SettlementRulesPage() {
  const performanceId = toPerformanceId(useParams().id)
  const enabled = performanceId !== undefined
  const id = performanceId ?? 0

  const rules = useRuleStatus(id, { enabled })
  const detail = usePerformanceDetail(id, { enabled })
  // 단건 API가 없으므로 pageInfo를 끝까지 따라가 보증금 상태 행을 찾는다.
  const mine = useMyPerformanceRows(id, { enabled })
  const sales = useSalesStatus(id, { enabled })
  const myTeams = useMyTeams()
  const save = useSetRules()

  /** 껍데기 사이드 메뉴의 "팀" 링크가 가리킬 팀. 공연은 바뀌지 않는다 */
  const [pickedTeamId, setPickedTeamId] = useState<number | undefined>()

  /**
   * 저장이 잠금 코드로 거절됐는가 — 그 순간부터 읽기 전용이다(P-05 **상태**).
   * 조회값(`locked`)이 아직 옛것일 수 있어 화면이 직접 기억한다.
   */
  const [lockedByServer, setLockedByServer] = useState(false)

  const teams: StudioTeamRef[] = useMemo(
    () =>
      (myTeams.data?.items ?? []).flatMap((item) =>
        item.teamId != null && item.teamName
          ? [{ teamId: item.teamId, teamName: item.teamName }]
          : [],
      ),
    [myTeams.data],
  )

  const myRow = useMemo(
    () => (mine.data?.items ?? []).find((item) => item.performanceId === id),
    [mine.data, id],
  )

  /** 참여팀은 performance_03에서 받는다 — rule_02의 `agreements[]`에는 `host`가 없다 */
  const participants: RuleParticipant[] = useMemo(
    () =>
      (detail.data?.participants ?? []).flatMap((p) =>
        p.teamId != null && p.teamName
          ? [{ teamId: p.teamId, teamName: p.teamName, host: p.host }]
          : [],
      ),
    [detail.data],
  )

  /** 팀별 관객 선택 수 — 판매가 시작된 뒤에만 값이 있다. 집계가 없는 팀은 넣지 않는다 */
  const choiceCounts = useMemo(() => {
    const entries = (sales.data?.teamChoices ?? []).flatMap((c) =>
      c.teamId != null && c.dbCount != null ? [[c.teamId, c.dbCount] as const] : [],
    )
    return entries.length > 0 ? Object.fromEntries(entries) : undefined
  }, [sales.data])

  const ruleError = isApiError(rules.error) ? rules.error : undefined
  const detailError = isApiError(detail.error) ? detail.error : undefined
  /** 규칙 미설정(404)은 오류가 아니라 빈 폼이다 — 화면을 덮지 않는다 */
  const ruleMissing = ruleError?.code === 'COMMON_NOT_FOUND'

  // 생성 타입의 `PerformanceStatus`·`PerformanceDepositStatus`가 화면 타입과 같은 enum이다
  const status = rules.data?.performanceStatus ?? detail.data?.status
  // 규칙이 있으면 rule_02가 정본이고, 없으면 내 대시보드 행이 유일한 출처다.
  // 둘 다 모르면 보증금 상태를 지어내지 않는다 — 저장 가능 여부가 그 값에 달려 있다.
  const depositStatus: DepositStatus | undefined = rules.data?.depositStatus ?? myRow?.depositStatus

  const rule = rules.data?.rule
  const teamShares = rule?.teamShares
  const agreedCount = (rules.data?.agreements ?? []).filter(
    (a) => a.status === 'AGREED' || a.status === 'SIGNING',
  ).length

  const data: RuleScreenData | undefined =
    status !== undefined && depositStatus !== undefined && participants.length > 0
      ? {
          performanceId: id,
          performanceStatus: status,
          depositStatus,
          // 단계 표시에서 참여팀 단계를 그릴지 가른다. 모르면 단독으로 본다(P-03 과 같은 판정)
          jointPerformance: detail.data?.jointPerformance === true,
          locked: rules.data?.locked === true || lockedByServer,
          rule:
            rule?.fixedRatioBp != null && rule.selectionRatioBp != null && teamShares
              ? {
                  fixedRatioBp: rule.fixedRatioBp,
                  selectionRatioBp: rule.selectionRatioBp,
                  teamShares: teamShares.map((s) => ({ teamId: s.teamId, shareBp: s.shareBp })),
                }
              : undefined,
          participants,
          agreedCount,
          // 규칙을 정하는 시점에는 대개 0이다. 조회가 실패했을 때도 0이고, 그때 본문은
          // "아직 매출이 없어 계산할 수 없습니다"를 띄운다(추정 금액을 지어내지 않는다)
          assumedRevenueAmount: sales.data?.grossRevenueAmount ?? 0,
          choiceCounts,
        }
      : undefined

  const onSave = useCallback(
    async (payload: {
      fixedRatioBp: number
      selectionRatioBp: number
      teamShares: { teamId: number; shareBp: number }[]
    }): Promise<RuleSaveResult> => {
      if (!enabled) return { ok: false }
      try {
        await save.mutateAsync({ performanceId: id, body: payload })
        return { ok: true }
      } catch (error) {
        if (!isApiError(error)) return { ok: false }
        // 잠금(409)은 문구로 끝나지 않는다 — 폼을 읽기 전용으로 바꾼다.
        // `RULE_SYNC_IN_PROGRESS`는 여기 해당하지 않는다(머리말 ⚠ · 기다리면 풀린다)
        if (isLockedCode(error.code)) setLockedByServer(true)
        return { ok: false, code: error.code, msg: error.msg }
      }
    },
    [enabled, id, save],
  )

  const title = detail.data?.title ?? '공연'

  // 403(참여팀·생성자 아님)과 그 밖(404·5xx)은 화면이 다르다
  const blocking = ruleMissing ? detailError : (ruleError ?? detailError)
  const failureText = blocking ? studioFailureText(blocking.code, blocking.msg) : undefined
  const forbidden =
    blocking?.code === PerformanceCode.NOT_PARTICIPANT ||
    blocking?.code === PerformanceCode.NOT_OWNER ||
    blocking?.code === 'COMMON_FORBIDDEN'
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
      <SettlementRules
        title={title}
        // mine 이 빠지면 규칙 미설정(rule_02 404) 공연에서 rules·detail 이 먼저 끝난 순간
        // depositStatus 가 아직 undefined 라 data 가 없고, 본문이 그것을 곧장
        // "불러오지 못했습니다"로 그린다. 조회가 정상인데 오류 화면이 뜨는 경로다
        loading={enabled && (rules.isPending || detail.isPending || mine.isPending)}
        data={data}
        forbidden={forbidden}
        error={!enabled ? '잘못된 공연 주소입니다.' : forbidden ? undefined : failureText}
        onRetry={() => {
          void rules.refetch()
          void detail.refetch()
        }}
        onSave={onSave}
      />
    </StudioShell>
  )
}

export default SettlementRulesPage
