/**
 * P-05 도움말 예시의 숫자.
 *
 * 예시 금액을 글로 박아 두지 않고 **화면이 쓰는 `simulate()`로 계산**한다. 공식이 바뀌면 예시도 같이
 * 바뀌고, 틀린 예시가 화면에 남지 않는다. 기대값은 `ruleHelpExample.test.ts`가 손 계산으로 못 박는다.
 *
 * 정본 — 요구사항 v7 §7.2(2단계 bp · floor · dust는 공연 생성 팀).
 */

import { simulate } from '@/features/studio/settlementRuleCalc'

export const HELP_EXAMPLE = {
  revenue: 1_000_000,
  fixedRatioBp: 6_000,
  selectionRatioBp: 4_000,
  teams: [
    { teamId: 1, name: 'A', shareBp: 5_000, choices: 70, host: true },
    { teamId: 2, name: 'B', shareBp: 5_000, choices: 30, host: false },
  ],
  /** 버림으로 1 YoYo가 남는 경우를 보여 주는 매출 */
  dustRevenue: 1_000_001,
} as const

export function computeHelpExample(revenue: number = HELP_EXAMPLE.revenue) {
  const { fixedRatioBp, selectionRatioBp, teams } = HELP_EXAMPLE
  return simulate({
    assumedRevenueAmount: revenue,
    fixedRatioBp,
    selectionRatioBp,
    rows: teams.map((t) => ({ teamId: t.teamId, teamName: t.name, shareBp: String(t.shareBp) })),
    choiceCounts: Object.fromEntries(teams.map((t) => [t.teamId, t.choices])),
    hostTeamId: teams.find((t) => t.host)?.teamId,
  })
}
