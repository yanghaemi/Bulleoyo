import { useLocale } from '@/shared/i18n/useLocale'
/**
 * P-05 정산 규칙 설정.
 *
 * 정본 — 화면설계 v6 §4 P-05(영역 구성·레이아웃·컴포넌트 표 7행·상태·입력 검증·접근성)
 *        · §5.4 금액 표기 · §5.6 확인 모달 · §5.19 액션 버튼 배치 · §5.21 표 → 패널 접기
 *        · API 명세 v6 rule_01(`PUT …/rules`) · rule_02(`GET …/rules`)
 *
 * 본문 순서는 P-05 **영역 구성** 그대로다 —
 * 1단계 비율 입력 → 2단계 팀별 비율 → dust 귀속 안내 → 보증금 제외 안내 → 시뮬레이션 결과.
 * 레이아웃 항목이 정한 대로 PC는 **최대폭 1200px 2열**(좌 입력·합계 검증 / 우 시뮬레이션 고정)로
 * **입력과 결과를 동시에** 보게 하고, 저장 버튼은 좌측 열 하단이다.
 * 모바일은 1열이고 시뮬레이션 결과가 **기본 접힘**, 저장은 하단 고정(§5.19).
 *
 * **비율은 내부에서 bp(basis point)다.** 10000bp = 100%. 화면은 %로 보여 준다(9/26 v8.10).
 * 주 입력은 **드래그 막대**(`RatioBar`) — 1단계는 손잡이 1개, 2단계는 팀 경계 손잡이 N-1개.
 * 드래그·화살표는 1%(100bp) 단위, 옆의 작은 **% 입력칸**은 소수 둘째 자리(1bp)까지 받는 보조 입력이다.
 * 서버에는 지금과 같은 bp 정수를 보낸다(API rule_01 무변경). 1단계는 한쪽을 바꾸면 나머지를
 * 자동 보정해 합을 10000으로 유지하고, 2단계 막대는 마지막 팀이 나머지를 가져 합이 언제나 10000이다.
 * 용어 옆 `?` 버튼은 예시 계산 모달(`RuleHelp`)을 연다.
 *
 * **보증금은 분배 대상이 아니다.** 시뮬레이션의 분배 대상 금액에 50,000 YoYo이 들어가지 않는다.
 *
 * ⚠ 계산을 화면이 한다. 이유와 한계는 `settlementRuleCalc.ts` 머리말의 ⚠ 두 항목에 적었다 —
 * 요약하면 (a) 시뮬레이션을 돌려주는 API가 **저장(PUT)뿐**이고 (b) 규칙을 정하는 시점에는
 * 팀별 관객 선택 수가 없어 **균등 가정**으로 계산한다. 화면이 그 가정을 문장으로 밝힌다.
 *
 * 껍데기(사이드 메뉴·드로어)는 `StudioShell`이 맡는다. 관객 하단 탭바는 쓰지 않는다.
 *
 * TODO(API 연결)
 *   조회:  rule_02 `GET /api/v1/performances/{performanceId}/rules` → `RuleStatusResponseData`
 *          — performanceId·performanceStatus·depositStatus·locked·rulesHash·rule{fixedRatioBp,
 *            selectionRatioBp,teamShares[]}·agreements[]·myAgreement·startSaleAvailable·startSaleBlockedReason
 *          ⚠ 규칙을 아직 설정하지 않았으면 **404 `COMMON_NOT_FOUND`** 다(DRAFT). 그때는
 *            빈 폼으로 시작하고, 참여팀 목록은 performance_03 `participants[]`에서 받아야 한다
 *          ⚠ 응답에 `simulation`이 없다 — 시뮬레이션은 화면이 계산한다
 *   저장:  rule_01 `PUT …/rules` `{ fixedRatioBp, selectionRatioBp, teamShares[], simulationRevenue? }`
 *          → `RuleSetResponseData`(status·rulesHash·agreementsReset·simulation·nextAction)
 *          저장하면 공연이 `DRAFT` → `PENDING_AGREEMENT`가 되고 **기존 동의가 전부 초기화**된다
 *   에러:  400 `RULE_RATIO_SUM_INVALID` → 합계 필드 강조 · 400 `COMMON_VALIDATION_FAILED`
 *          403 `PERFORMANCE_NOT_OWNER` → 권한 없음 · 404 `PERFORMANCE_NOT_FOUND`
 *          409 `PERFORMANCE_INVALID_STATUS`(= §8.2 `PERFORMANCE_DEPOSIT_REQUIRED`) → P-03으로 안내
 *          409 `RULE_ALREADY_LOCKED` → 읽기 전용 전환
 *   분기는 `code`로만 한다 — `msg`로 분기하지 않는다(응답 규격 §1).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import {
  Button,
  ConfirmDialog,
  FixedBottom,
  InfoRow,
  Input,
  MotionDisclosure,
  StatusBadge,
  Stepper,
  formatYoyo,
} from '@/shared/ui'
import type { DepositStatus } from '@/shared/ui'
import { SETUP_STEP_RULES, visibleSetupSteps, visibleStepIndex } from '@/features/studio/setupSteps'
import { RatioBar } from '@/features/studio/RatioBar'
import { RuleHelpButton } from '@/features/studio/RuleHelp'
import {
  bpStringToPercentText,
  moveHandle,
  percentTextToBpString,
  positionsToShares,
  sharesToPositions,
} from '@/features/studio/ratioBarMath'
import { NextStepDialog } from '@/features/studio/NextStepDialog'
import { SettlementLightStage } from '@/features/studio/SettlementLightStage'
import { DEPOSIT_AMOUNT } from '@/features/studio/performanceFields'
import { StudioCode, studioFailureText } from '@/features/studio/studioErrors'
import {
  StudioErrorPanel,
  StudioHeading,
  StudioForbidden,
  StudioNotice,
  StudioSkeleton,
} from '@/features/studio/StudioStates'
import {
  BP_TOTAL,
  DEFAULT_FIXED_BP,
  autoFillRemainder,
  bpToPercentLabel,
  evenShareBp,
  parseBp,
  simulate,
  validateRules,
} from '@/features/studio/settlementRuleCalc'
import type { TeamShareDraft } from '@/features/studio/settlementRuleCalc'
import { SHOW_STATUS } from '@/features/studio/showStatus'
import type { PerformanceStatus } from '@/features/studio/showStatus'

/* ── 타입 ─────────────────────────────────────────────────────────────── */

/** `ParticipantSummary`(performance_03) — 2단계 입력 줄의 원본 */
export interface RuleParticipant {
  teamId: number
  teamName: string
  /** 공연을 만든 팀. dust가 이 팀에 귀속된다 */
  host: boolean
}

/** rule_02 `RuleStatusResponseData`에서 이 화면이 쓰는 것만 */
export interface RuleScreenData {
  performanceId: number
  performanceStatus: PerformanceStatus
  depositStatus: DepositStatus
  /** 판매 시작 이후면 true — 읽기 전용 */
  locked: boolean
  /**
   * 합동 공연인가(performance_03 `jointPerformance`). 단계 표시에서 참여팀 단계를 그릴지
   * 가른다 — 단독 공연은 초대할 팀이 없어 그 단계를 숨긴다(P-03 과 같은 판정).
   */
  jointPerformance: boolean
  /** 저장된 규칙. 아직 없으면(DRAFT) undefined */
  rule?: {
    fixedRatioBp: number
    selectionRatioBp: number
    teamShares: { teamId: number; shareBp: number }[]
  }
  /**
   * 참여팀. ⚠ rule_02의 `agreements[]`에서 뽑거나, 규칙이 아직 없으면
   * performance_03 `participants[]`에서 받아 온다(rule_02가 404이기 때문)
   */
  participants: RuleParticipant[]
  /** `agreements[]` 중 `AGREED`·`SIGNING` 건수. 1건 이상이면 규칙 변경 경고를 띄운다 */
  agreedCount: number
  /**
   * 시뮬레이션 가정 매출.
   * ⚠ P-05 컴포넌트 표에 **가상 매출 입력 필드가 없다.** rule_01 요청에는 `simulationRevenue`가
   * 있는데 화면에 그것을 넣을 자리가 명세에 없다. 그래서 화면은 서버가 아는 현재 매출을
   * 받아 표시만 하고, 판매 전이라 0이면 시뮬레이션 자리에 안내를 띄운다(보고 목록 참조).
   */
  assumedRevenueAmount: number
  /** 팀별 관객 선택 수(판매가 시작된 뒤에만 있다). 없으면 균등 가정 */
  choiceCounts?: Record<number, number>
}

export interface RuleSaveResult {
  ok: boolean
  code?: string
  msg?: string
}

/* ── 합계 표시 ────────────────────────────────────────────────────────── */

/**
 * 합계 검증 줄 — P-05 "합계 상시 표시" · "합계 실시간 검증".
 *
 * 색만으로 알리지 않는다. 합이 맞으면 "합계 10000bp (100%)", 어긋나면 얼마나 남았는지·넘쳤는지를
 * 숫자로 말한다. `RULE_RATIO_SUM_INVALID`(400)를 서버에서 받았을 때도 같은 자리를 강조한다.
 */
function SumRow({ sum, invalid, id }: { sum: number; invalid: boolean; id?: string }) {
  const { text } = useLocale()
  const diff = BP_TOTAL - sum
  return (
    <p
      id={id}
      role="status"
      className={[
        'm-0 flex flex-wrap items-baseline gap-x-2 rounded-control px-3 py-2 font-sans text-[13px]',
        invalid
          ? 'bg-surface font-semibold text-danger ring-1 ring-danger'
          : 'bg-ground-2 text-muted',
      ].join(' ')}
    >
      <span>
        {text('합계', 'Total')}{' '}
        <span className="font-num tabular-nums">
          {bpToPercentLabel(sum)} ({sum.toLocaleString('ko-KR')}bp)
        </span>
      </span>
      {invalid && (
        <span className="font-num tabular-nums">
          {diff > 0
            ? text(
                `· ${bpToPercentLabel(diff)} 모자랍니다`,
                `· ${bpToPercentLabel(diff)} remaining`,
              )
            : text(
                `· ${bpToPercentLabel(Math.abs(diff))} 넘었습니다`,
                `· ${bpToPercentLabel(Math.abs(diff))} over`,
              )}
        </span>
      )}
    </p>
  )
}

/**
 * % 입력 한 칸 — 드래그 막대의 **보조** 정밀 입력(9/26 v8.10). 소수 둘째 자리 = 1bp까지 받는다.
 *
 * 폼 상태는 여전히 **bp 문자열**이다(`value`·`onChange`). 이 칸은 사용자가 친 글자(`draft`)를 따로 들고,
 * 바깥 bp가 **다른 곳에서** 바뀌었을 때(막대 드래그·반대쪽 자동 보정·균등 분할)만 글자를 다시 쓴다 —
 * 치는 중인 "35."가 "35"로 지워지지 않게. 형식이 아닌 글자는 `!원문`으로 올려 기존 검증
 * (`parseBp` → `validateRules`)이 그대로 "값이 아님"으로 잡는다.
 */
function PercentInput({
  id,
  value,
  disabled,
  invalid,
  describedBy,
  onChange,
}: {
  id: string
  /** bp 문자열(폼 상태) */
  value: string
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
  /** bp 문자열로 올린다 */
  onChange: (value: string) => void
}) {
  const [draft, setDraft] = useState(() => bpStringToPercentText(value))
  const [seen, setSeen] = useState(value)
  // 렌더 중 동기화 — effect 로 setState 하면 한 프레임 낡은 값이 보인다(React "prop 변화에 state 맞추기")
  if (value !== seen) {
    setSeen(value)
    if (percentTextToBpString(draft) !== value) setDraft(bpStringToPercentText(value))
  }
  return (
    <div className="flex items-center gap-2">
      <div className="w-24">
        <Input
          id={id}
          // `type="number"`를 쓰지 않는 이유 — 휠·화살표로 값이 조용히 바뀌고, 브라우저마다
          // 소수 입력 허용이 달라 검증이 갈린다. 소수점이 있는 숫자 키보드만 띄운다
          inputMode="decimal"
          value={draft}
          disabled={disabled}
          invalid={invalid}
          aria-describedby={describedBy}
          onChange={(e) => {
            setDraft(e.target.value)
            onChange(percentTextToBpString(e.target.value))
          }}
        />
      </div>
      <span className="shrink-0 font-sans text-[13px] text-muted">%</span>
    </div>
  )
}

/** 라벨 + `?` 도움말 + 보조 설명 + 컨트롤. 라벨 안에 버튼을 넣지 않는다(라벨 이름이 오염된다) */
function RatioField({
  id,
  label,
  hint,
  help,
  children,
}: {
  id: string
  label: string
  hint: string
  help: ReactNode
  children: (a: { id: string; hintId: string }) => ReactNode
}) {
  const hintId = `${id}-hint`
  return (
    <div className="flex flex-col gap-1.5">
      <div className="-my-2 flex items-center gap-0.5">
        <label htmlFor={id} className="font-sans text-sm font-medium text-ink">
          {label}
        </label>
        {help}
      </div>
      <p id={hintId} className="m-0 font-sans text-[11px] text-muted">
        {hint}
      </p>
      {children({ id, hintId })}
    </div>
  )
}

/** 2단계 막대 구간 색 — 역할 토큰만. 팀이 다섯을 넘으면 되돌아 쓴다(입력 줄의 같은 색 점 옆에 팀 이름이 있다) */
const TEAM_COLORS = [
  'var(--color-primary)',
  'var(--color-sel)',
  'var(--color-ok)',
  'var(--color-warning)',
  'var(--color-muted)',
]

/* ── 시뮬레이션 결과 패널 ─────────────────────────────────────────────── */

/** 표의 열 머리글. 이 배열이 PC 표와 모바일 패널의 **공통 순서**를 갖는다(§5.21) */
const SIM_COLUMNS = [
  ['고정 분배', 'Fixed share'],
  ['관객 선택', 'Audience choice'],
  ['잔여 금액', 'Remainder'],
  ['합계', 'Total'],
] as const

function SimulationPanel({
  result,
  choiceAssumed,
}: {
  result: ReturnType<typeof simulate>
  choiceAssumed: boolean
}) {
  const { text } = useLocale()
  if (result.assumedRevenueAmount === 0) {
    // 판매 전이라 매출이 0이면 전부 0원이 된다. 0으로 채운 표를 보여 주느니 왜 비었는지 말한다
    return (
      <p className="m-0 rounded-card border border-line bg-surface px-4 py-10 text-center font-sans text-[13px] text-muted">
        {text(
          '아직 매출이 없어 예상 분배액을 계산할 수 없습니다.',
          'Projected payouts are unavailable until there are sales.',
        )}
        <br />
        {text(
          '판매가 시작되면 실제 매출로 다시 계산합니다.',
          'Projections will use actual revenue when sales begin.',
        )}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-card border border-line bg-surface px-4 py-3">
        <p className="m-0 font-sans text-[11px] font-semibold text-muted">
          {text('분배 대상 금액', 'Distributable revenue')}
        </p>
        <p className="m-0 font-num text-xl font-bold tabular-nums text-ink">
          {formatYoyo(result.assumedRevenueAmount)}
        </p>
        <p className="m-0 mt-1 font-sans text-[11px] text-muted">
          {text('고정 풀', 'Fixed pool')}{' '}
          <span className="font-num tabular-nums text-ink">
            {formatYoyo(result.fixedPoolAmount)}
          </span>{' '}
          {text('· 관객 선택 풀', '· Audience choice pool')}{' '}
          <span className="font-num tabular-nums text-ink">
            {formatYoyo(result.selectionPoolAmount)}
          </span>
        </p>
      </div>

      {choiceAssumed && (
        // ⚠ 이 문장이 명세에 없다. 클라이언트 계산의 가정을 화면에서 밝히지 않으면
        //   나중에 실제 분배액과 달라졌을 때 사용자가 속았다고 느낀다
        <p className="m-0 font-sans text-[11px] text-muted">
          {text('⚠ 팀별 관객 선택 수가 아직 없어', 'Audience choices are not available yet.')}
          <b>{text('균등 가정', 'Equal distribution assumed')}</b>
          {text(
            '으로 계산했습니다. 실제 분배액은 관객 선택 결과에 따라 달라집니다.',
            'Actual payouts will depend on the audience’s choices.',
          )}
        </p>
      )}

      {/* ── PC: 표 ── */}
      <div className="hidden overflow-hidden rounded-card border border-line bg-surface md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              <th
                scope="col"
                className="px-3 py-2.5 font-sans text-[11px] font-semibold text-muted"
              >
                {text('팀명', 'Team name')}
              </th>
              {SIM_COLUMNS.map((c) => (
                <th
                  key={c[0]}
                  scope="col"
                  className="px-3 py-2.5 font-sans text-[11px] font-semibold text-muted"
                >
                  {text(c[0], c[1])}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.teamId} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-3 py-2.5 font-sans text-[13px] font-bold text-ink">
                  {r.teamName}
                </th>
                <td className="px-3 py-2.5 font-num text-[13px] tabular-nums text-muted">
                  {formatYoyo(r.fixedAmount)}
                </td>
                <td className="px-3 py-2.5 font-num text-[13px] tabular-nums text-muted">
                  {formatYoyo(r.choiceAmount)}
                </td>
                <td className="px-3 py-2.5 font-num text-[13px] tabular-nums text-muted">
                  {r.dustAmount === 0 ? '—' : formatYoyo(r.dustAmount)}
                </td>
                <td className="px-3 py-2.5 font-num text-[13px] font-bold tabular-nums text-ink">
                  {formatYoyo(r.totalAmount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 모바일: 행 하나 = 패널 하나(§5.21). 열 순서는 PC 표와 같다 ── */}
      <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
        {result.rows.map((r) => (
          <li key={r.teamId} className="rounded-card border border-line bg-surface px-4 py-3">
            <span className="block font-sans text-[13px] font-bold text-ink">{r.teamName}</span>
            <InfoRow label={text(...SIM_COLUMNS[0])}>{formatYoyo(r.fixedAmount)}</InfoRow>
            <InfoRow label={text(...SIM_COLUMNS[1])}>{formatYoyo(r.choiceAmount)}</InfoRow>
            <InfoRow label={text(...SIM_COLUMNS[2])}>
              {r.dustAmount === 0 ? '—' : formatYoyo(r.dustAmount)}
            </InfoRow>
            <InfoRow label={text(...SIM_COLUMNS[3])}>
              <b>{formatYoyo(r.totalAmount)}</b>
            </InfoRow>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── 화면 ─────────────────────────────────────────────────────────────── */

interface Props {
  /**
   * 공연명 — P-05 **영역 구성**의 헤더다.
   * ⚠ `RuleStatusResponseData`에 공연명이 없다. 상위(페이지)가 performance_03에서 받아 넘긴다.
   */
  title: string
  loading?: boolean
  data?: RuleScreenData
  /** 403 `PERFORMANCE_NOT_OWNER` */
  forbidden?: string
  /** 조회 실패 문구 */
  error?: string
  onRetry?: () => void
  onSave?: (payload: {
    fixedRatioBp: number
    selectionRatioBp: number
    teamShares: { teamId: number; shareBp: number }[]
  }) => Promise<RuleSaveResult>
}

export function SettlementRules({
  title,
  loading = false,
  data,
  forbidden,
  error,
  onRetry,
  onSave,
}: Props) {
  const { text } = useLocale()
  /** 1단계 — 고정 분배 비율. 관객 선택은 10000에서 뺀 값이라 상태를 하나만 둔다 */
  const [fixedBp, setFixedBp] = useState<string>(
    String(data?.rule?.fixedRatioBp ?? DEFAULT_FIXED_BP),
  )
  const [selectionBp, setSelectionBp] = useState<string>(
    String(data?.rule?.selectionRatioBp ?? BP_TOTAL - DEFAULT_FIXED_BP),
  )
  /** 2단계 — 팀별 비율. 저장된 값이 있으면 그것을, 없으면 균등 분할 */
  const [shares, setShares] = useState<TeamShareDraft[]>(() => initialShares(data))
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  /** 서버가 `RULE_RATIO_SUM_INVALID`를 보냈을 때 합계 자리를 강조한다 */
  const [sumInvalidFromServer, setSumInvalidFromServer] = useState(false)
  const [saved, setSaved] = useState(false)
  /**
   * 저장 성공 안내 모달(9/24). 인라인 안내만으로는 "무엇이 됐는지·다음에 뭘 하는지"가 헷갈렸다.
   * `saved`와 따로 둔다 — 모달을 닫아도 인라인 안내(와 P-06 링크)는 남아야 한다.
   */
  const [savedDialogOpen, setSavedDialogOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  /** 모바일 시뮬레이션 접기 — P-05 레이아웃 "기본 접힘" */
  const [simOpen, setSimOpen] = useState(false)

  /**
   * 서버 값이 **나중에** 도착하는 경우를 위한 재동기화.
   *
   * useState 초기화 함수는 첫 렌더에 한 번만 돈다. 페이지가 조회 중에 이 컴포넌트를 먼저
   * 마운트하면(로딩 스켈레톤도 이 컴포넌트가 그린다) 폼이 기본값으로 굳는다.
   * 공연 하나를 보는 화면이라 performanceId가 바뀌는 일은 없고, 그래서 사용자가 편집 중인
   * 값을 이 효과가 덮어쓸 일도 없다 — 값이 처음 들어올 때 한 번만 돈다.
   */
  useEffect(() => {
    if (!data) return
    setFixedBp(String(data.rule?.fixedRatioBp ?? DEFAULT_FIXED_BP))
    setSelectionBp(String(data.rule?.selectionRatioBp ?? BP_TOTAL - DEFAULT_FIXED_BP))
    setShares(initialShares(data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.performanceId])

  const fixed = parseBp(fixedBp) ?? 0
  const selection = parseBp(selectionBp) ?? 0
  const validation = useMemo(
    () => validateRules(fixed, selection, shares),
    [fixed, selection, shares],
  )

  const hostTeamId = data?.participants.find((p) => p.host)?.teamId
  const simulation = useMemo(
    () =>
      simulate({
        assumedRevenueAmount: data?.assumedRevenueAmount ?? 0,
        fixedRatioBp: fixed,
        rows: shares,
        choiceCounts: data?.choiceCounts,
        hostTeamId,
      }),
    [data?.assumedRevenueAmount, data?.choiceCounts, fixed, hostTeamId, shares],
  )

  /** 1단계는 한쪽을 바꾸면 나머지를 자동 보정한다 — P-05 컴포넌트 표 그대로 */
  const changeFixed = (value: string) => {
    setFixedBp(value)
    const bp = parseBp(value)
    if (bp != null) setSelectionBp(String(BP_TOTAL - bp))
    setSumInvalidFromServer(false)
    setSaved(false)
  }
  const changeSelection = (value: string) => {
    setSelectionBp(value)
    const bp = parseBp(value)
    if (bp != null) setFixedBp(String(BP_TOTAL - bp))
    setSumInvalidFromServer(false)
    setSaved(false)
  }

  /** 막대 드래그 → 1단계. 반대쪽 자동 보정은 `changeFixed`가 한다 */
  const dragFixed = (bp: number) => changeFixed(String(bp))

  /**
   * 막대 드래그 → 2단계. 경계 위치에서 팀 비율을 다시 뽑는다 — 마지막 팀이 나머지라 합이 언제나 10000이다.
   * 칸이 유효하면 움직인 경계 양옆 두 팀만 바뀐다. 값이 아닌 칸이 있었다면 그 칸은 0으로 정리된다.
   */
  const dragTeamBoundary = (index: number, bp: number) => {
    setShares((prev) => {
      const positions = sharesToPositions(prev.map((r) => parseBp(r.shareBp) ?? 0))
      const next = positionsToShares(moveHandle(positions, index, bp))
      return prev.map((r, i) => ({ ...r, shareBp: String(next[i]) }))
    })
    setSumInvalidFromServer(false)
    setSaved(false)
  }

  const depositUnpaid = data != null && data.depositStatus !== 'PAID'
  /** 판매 시작 이후면 입력 자체가 막힌다(RULE_ALREADY_LOCKED) */
  const locked = data?.locked === true
  /**
   * 보증금 미납은 **저장을 막지 않는다.** 서버 순서가 `규칙 → createShow → 보증금`이다 —
   * createShow 가 `rulesHash`를 요구하고 `deposit`은 등록된 공연에만 된다. 미납을 게이트로
   * 걸면 규칙도 보증금도 낼 수 없는 교착이 된다(리허설2 D-60).
   */
  const saveBlocked = locked

  const runSave = useCallback(async () => {
    if (!data || !validation.canSave || saving || saveBlocked) return
    setFailure(undefined)
    setSumInvalidFromServer(false)
    setSaving(true)
    try {
      const result = await onSave?.({
        fixedRatioBp: fixed,
        selectionRatioBp: selection,
        teamShares: shares.map((s) => ({ teamId: s.teamId, shareBp: parseBp(s.shareBp) ?? 0 })),
      })
      // 핸들러가 없으면(목·미연결) 아무것도 단정하지 않는다
      if (!result) return
      if (!result.ok) {
        if (result.code === StudioCode.RATIO_SUM_INVALID) setSumInvalidFromServer(true)
        setFailure(studioFailureText(result.code, result.msg))
        return
      }
      setSaved(true)
      setSavedDialogOpen(true)
    } finally {
      setSaving(false)
    }
  }, [data, fixed, onSave, saveBlocked, saving, selection, shares, validation.canSave])

  /** 저장 — 초기화될 동의가 있으면 확인 모달을 거친다(§5.6 비가역 액션) */
  const requestSave = () => {
    if (!validation.canSave || saveBlocked) return
    if ((data?.agreedCount ?? 0) > 0) {
      setConfirming(true)
      return
    }
    void runSave()
  }

  if (loading) {
    return (
      <div className="px-3 py-3 md:px-0 md:py-0">
        <StudioSkeleton
          label={text('정산 규칙을 불러오는 중', 'Loading settlement rules')}
          rows={1}
        />
      </div>
    )
  }

  if (forbidden) {
    return (
      <div className="px-3 py-3 md:px-0 md:py-0">
        <StudioForbidden msg={forbidden} />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="px-3 py-3 md:px-0 md:py-0">
        <StudioErrorPanel
          title={text('정산 규칙을 불러오지 못했습니다', 'Could not load settlement rules')}
          msg={error ?? text('잠시 후 다시 시도해 주세요.', 'Please try again in a moment.')}
          onRetry={onRetry}
        />
      </div>
    )
  }

  const stageOneInvalid = (!validation.stageOneValid || sumInvalidFromServer) && !locked
  /** 1단계 손잡이 위치 — 고정 칸이 값이 아니면 관객 선택 칸에서 거꾸로 구한다 */
  const selectionParsed = parseBp(selectionBp)
  const stageOnePosition =
    parseBp(fixedBp) ?? (selectionParsed != null ? BP_TOTAL - selectionParsed : 0)
  const stageOneText = (ko: [string, string], en: [string, string]) =>
    text(
      `${ko[0]}${bpToPercentLabel(stageOnePosition)}${ko[1]}${bpToPercentLabel(BP_TOTAL - stageOnePosition)}`,
      `${en[0]}${bpToPercentLabel(stageOnePosition)}${en[1]}${bpToPercentLabel(BP_TOTAL - stageOnePosition)}`,
    )
  const teamPositions = sharesToPositions(shares.map((r) => parseBp(r.shareBp) ?? 0))
  const teamPercent = (i: number) =>
    bpToPercentLabel(
      (i < teamPositions.length ? teamPositions[i] : BP_TOTAL) - (i > 0 ? teamPositions[i - 1] : 0),
    )
  const stageTwoInvalid = (!validation.stageTwoValid || sumInvalidFromServer) && !locked

  return (
    <div
      className={[
        'flex w-full max-w-[1200px] flex-col gap-4 px-3 pt-3 md:gap-6 md:px-0 md:pt-0 md:pb-0',
        locked ? 'pb-8' : 'pb-28',
      ].join(' ')}
    >
      {/* 헤더 — 공연명 + 공연 상태 배지. 모바일은 `StudioShell` 상단 바가 공연명을 갖는다 */}
      <StudioHeading title={title} section={['정산 규칙 설정', 'Settlement rules']}>
        <StatusBadge status={SHOW_STATUS[data.performanceStatus]} />
      </StudioHeading>

      {/*
        공연 준비는 `정보·티켓 옵션 → 참여팀 → 정산 규칙 → 규칙 동의 → 보증금` 다섯 단계이고
        그 세 번째가 이 화면이다. 참여팀이 규칙보다 앞인 이유는 이 화면이 `participants[]` 로
        팀 몫 행을 만들기 때문이다 — 초대 전에 열면 공동 공연의 규칙이 1팀으로 굳는다.
        규칙이 동의보다 앞인 이유는 규칙 저장이 온체인 `createShow` 를 걸기 때문이고,
        보증금이 마지막인 것은 팀 결정이다(둘 다 S15P21B204-136 · `setupSteps.ts` 머리말).
        P-03 과 **같은 라벨·같은 순서**를 쓴다 — 화면이 갈려도 진행 위치는 하나로 보여야 한다.
        단독 공연은 P-03 과 똑같이 참여팀 단계를 숨긴다(`visibleSetupSteps`).
        판매가 시작돼 규칙이 잠긴 뒤에는 준비 단계가 아니므로 그리지 않는다.
      */}
      {!locked && (
        <Stepper
          steps={visibleSetupSteps(data.jointPerformance).map((label) => text(label[0], label[1]))}
          active={visibleStepIndex(SETUP_STEP_RULES, data.jointPerformance)}
        />
      )}

      {/*
        보증금 미납 — **보증금은 준비 흐름의 마지막**이다(팀 결정 2026-09-21). 여기서 규칙을
        저장하면 다음은 동의이고 보증금은 그 뒤다. 순서를 뒤집어 안내하면 리더가 동의도 받기
        전에 보증금부터 내러 간다.
      */}
      {depositUnpaid && !locked && (
        <StudioNotice
          title={text(
            '규칙 → 동의 → 보증금 순서로 진행합니다',
            'The order is rules, then agreements, then the deposit.',
          )}
        >
          {text(
            '규칙을 저장하면 참여팀 리더가 동의할 수 있습니다. 전원 동의 뒤 보증금을 내면 판매를 시작할 수 있습니다.',
            'Once the rules are saved, team leaders can agree. After everyone agrees, pay the deposit to start ticket sales.',
          )}
        </StudioNotice>
      )}

      {locked && (
        <StudioNotice
          tone="warning"
          title={text(
            '판매가 시작돼 규칙이 잠겼습니다',
            'Ticket sales have started. Rules are locked.',
          )}
        >
          {text(
            '판매 시작 이후에는 규칙을 바꿀 수 없습니다. 지금은 읽기 전용입니다.',
            'Rules cannot change after sales begin. This view is read-only.',
          )}
        </StudioNotice>
      )}

      {/* 규칙 변경 경고 — 동의 1건 이상일 때만(P-05 컴포넌트 표) */}
      {!locked && data.agreedCount > 0 && (
        <StudioNotice
          tone="warning"
          title={text(
            '규칙을 저장하면 이미 받은 팀 동의가 모두 초기화됩니다',
            'Saving rules resets all existing team agreements.',
          )}
        >
          {text('지금 동의한 팀', 'Teams currently agreed:')}
          {data.agreedCount}
          {text('곳이 다시 서명해야 합니다.', 'must sign again.')}
        </StudioNotice>
      )}

      {failure && (
        <StudioNotice
          tone="danger"
          title={text('규칙을 저장하지 못했습니다', 'Could not save rules')}
        >
          {failure}
        </StudioNotice>
      )}

      {saved && (
        /*
         * 저장 성공 → 공연 상태가 `PENDING_AGREEMENT`로 전이되고 `rulesHash`가 생긴다.
         * **다음은 언제나 규칙 동의(P-06)다** — 보증금 여부로 갈리지 않는다. 동의(rule_03)의
         * 선행 조건은 `참여팀 리더 · ACCEPTED · PENDING_AGREEMENT · 지갑 LINKED`뿐이고 보증금을
         * 보지 않는다. 보증금은 판매 직전 마지막 잠금이다(팀 결정 2026-09-21).
         */
        <StudioNotice
          title={text('정산 규칙을 저장했습니다', 'Settlement rules saved')}
          action={
            <Link
              to={`/studio/performances/${data.performanceId}/agreements`}
              className="inline-flex min-h-11 items-center rounded-control bg-primary px-5 font-sans text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-primary-bright"
            >
              {text('규칙 동의 받으러 가기', 'Review team agreements')}
            </Link>
          }
        >
          {text(
            '규칙을 저장하면 참여팀 리더가 동의할 수 있습니다. 전원 동의 뒤 보증금을 내면 판매를 시작할 수 있습니다.',
            'Once the rules are saved, team leaders can agree. After everyone agrees, pay the deposit to start ticket sales.',
          )}
        </StudioNotice>
      )}

      {/* PC 2열 — 좌 입력·합계 / 우 시뮬레이션 고정(P-05 레이아웃) */}
      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4 md:gap-6">
          {/* ── 1단계 ── */}
          <section
            aria-label={text('1단계 비율', 'Step 1 ratio')}
            className="rounded-card border border-line bg-surface px-4 py-4 md:px-5 md:py-5"
          >
            <h3 className="m-0 mb-3 font-sans text-[11px] font-semibold text-muted md:text-xs">
              {text('고정 분배 · 관객 선택', 'Fixed share and audience choice')}
            </h3>

            <SettlementLightStage
              fixedBp={fixed}
              selectionBp={selection}
              valid={
                validation.stageOneValid &&
                !sumInvalidFromServer &&
                parseBp(fixedBp) != null &&
                parseBp(selectionBp) != null
              }
              disabled={locked}
            />

            {/* 주 입력 — 드래그 막대. 손잡이 = 고정 분배 끝 · 관객 선택 시작 */}
            <div className="mb-4">
              <RatioBar
                testId="rule-stage1-bar"
                label={stageOneText(
                  ['고정 분배 ', ' · 관객 선택 '],
                  ['Fixed share ', ' · audience choice '],
                )}
                positions={[stageOnePosition]}
                segments={[
                  {
                    key: 'fixed',
                    label: text('고정 분배', 'Fixed share'),
                    color: 'var(--color-primary)',
                  },
                  {
                    key: 'selection',
                    label: text('관객 선택', 'Audience choice'),
                    color: 'var(--color-sel)',
                  },
                ]}
                handleLabel={() =>
                  text('고정 분배 · 관객 선택 비율', 'Fixed and audience choice ratio')
                }
                handleValueText={() =>
                  stageOneText(
                    ['고정 분배 ', ', 관객 선택 '],
                    ['Fixed share ', ', audience choice '],
                  )
                }
                onChange={(_, bp) => dragFixed(bp)}
                disabled={locked}
              />
            </div>

            {/* 보조 입력 — 정밀 % */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <RatioField
                id="rule-fixed-bp"
                label={text('고정 분배', 'Fixed share')}
                hint={text(
                  '팀별 고정 비율(2단계)로 나뉘는 몫입니다.',
                  'Distributed using each team’s fixed share in step 2.',
                )}
                help={
                  <RuleHelpButton
                    topic="fixed"
                    label={text('고정 분배 설명', 'About the fixed share')}
                  />
                }
              >
                {(a) => (
                  <PercentInput
                    id={a.id}
                    value={fixedBp}
                    disabled={locked}
                    invalid={stageOneInvalid}
                    describedBy={`${a.hintId} rule-stage1-sum`}
                    onChange={changeFixed}
                  />
                )}
              </RatioField>

              <RatioField
                id="rule-selection-bp"
                label={text('관객 선택', 'Audience choice')}
                hint={text(
                  '관객이 고른 팀에게 가는 몫입니다.',
                  'Distributed to the teams selected by the audience.',
                )}
                help={
                  <RuleHelpButton
                    topic="selection"
                    label={text('관객 선택 설명', 'About the audience choice share')}
                  />
                }
              >
                {(a) => (
                  <PercentInput
                    id={a.id}
                    value={selectionBp}
                    disabled={locked}
                    invalid={stageOneInvalid}
                    describedBy={`${a.hintId} rule-stage1-sum`}
                    onChange={changeSelection}
                  />
                )}
              </RatioField>
            </div>

            <div className="mt-3">
              <SumRow id="rule-stage1-sum" sum={validation.stageOneSum} invalid={stageOneInvalid} />
            </div>
          </section>

          {/* ── 2단계 ── */}
          <section
            aria-label={text('2단계 팀별 비율', 'Step 2 team shares')}
            className="rounded-card border border-line bg-surface px-4 py-4 md:px-5 md:py-5"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="-my-2 flex items-center gap-0.5">
                <h3 className="m-0 font-sans text-[11px] font-semibold text-muted md:text-xs">
                  {text('팀별 고정 분배 비율', 'Fixed share by team')}
                </h3>
                <RuleHelpButton
                  topic="teamShare"
                  label={text('팀별 고정 분배 비율 설명', 'About the fixed share by team')}
                />
              </div>
              {!locked && (
                <div className="flex flex-wrap gap-2">
                  {/* 잔여 자동 배분 옵션(P-05 컴포넌트 표) */}
                  <Button
                    sm
                    variant="secondary"
                    disabled={validation.stageTwoSum === BP_TOTAL}
                    onClick={() => setShares((prev) => autoFillRemainder(prev))}
                  >
                    {text('잔여 자동 배분', 'Allocate remainder')}
                  </Button>
                  <Button
                    sm
                    variant="ghost"
                    onClick={() =>
                      setShares((prev) =>
                        prev.map((r, i) => ({
                          ...r,
                          shareBp: String(evenShareBp(prev.length)[i]),
                        })),
                      )
                    }
                  >
                    {text('균등 분할', 'Split equally')}
                  </Button>
                </div>
              )}
            </div>

            {data.participants.length === 0 ? (
              <p className="m-0 rounded-card border border-line px-4 py-10 text-center font-sans text-[13px] text-muted">
                {text(
                  '참여팀이 없습니다. 참여팀 관리에서 팀을 먼저 초대해 주세요.',
                  'No participating teams. Invite teams in participant management first.',
                )}
              </p>
            ) : (
              <>
                {/* 주 입력 — 팀 수만큼 구간, 경계 손잡이 N-1개. 1팀이면 손잡이 없이 100% 한 구간 */}
                <div className="mb-4">
                  <RatioBar
                    testId="rule-stage2-bar"
                    label={shares.map((r, i) => `${r.teamName} ${teamPercent(i)}`).join(' · ')}
                    positions={teamPositions}
                    segments={shares.map((r, i) => ({
                      key: r.teamId,
                      label: r.teamName,
                      color: TEAM_COLORS[i % TEAM_COLORS.length],
                    }))}
                    handleLabel={(i) =>
                      text(
                        `${shares[i].teamName} · ${shares[i + 1].teamName} 경계`,
                        `Boundary between ${shares[i].teamName} and ${shares[i + 1].teamName}`,
                      )
                    }
                    handleValueText={(i) =>
                      `${shares[i].teamName} ${teamPercent(i)}, ${shares[i + 1].teamName} ${teamPercent(i + 1)}`
                    }
                    onChange={dragTeamBoundary}
                    disabled={locked}
                    legend={false}
                  />
                </div>
                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                  {shares.map((row, i) => (
                    <li
                      key={row.teamId}
                      className="flex flex-wrap items-center justify-between gap-3"
                    >
                      <label
                        htmlFor={`rule-team-${row.teamId}`}
                        className="inline-flex min-w-0 items-center gap-1.5 font-sans text-sm font-semibold text-ink"
                      >
                        {/* 막대 구간과 같은 색 점 — 어느 구간이 어느 팀인지 잇는다 */}
                        <span
                          aria-hidden
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: TEAM_COLORS[i % TEAM_COLORS.length] }}
                        />
                        {row.teamName}
                        {data.participants[i]?.host && (
                          <span className="ml-1 font-normal text-[11px] text-muted">
                            {text('· 공연 생성 팀', '· Host team')}
                          </span>
                        )}
                      </label>
                      <PercentInput
                        id={`rule-team-${row.teamId}`}
                        value={row.shareBp}
                        disabled={locked}
                        invalid={stageTwoInvalid || validation.invalidTeamIds.includes(row.teamId)}
                        describedBy="rule-stage2-sum"
                        onChange={(value) => {
                          setShares((prev) =>
                            prev.map((r, idx) => (idx === i ? { ...r, shareBp: value } : r)),
                          )
                          setSumInvalidFromServer(false)
                          setSaved(false)
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="mt-3">
              <SumRow id="rule-stage2-sum" sum={validation.stageTwoSum} invalid={stageTwoInvalid} />
            </div>
          </section>

          {/* dust 귀속 안내 · 보증금 제외 안내 — 명세가 정한 문구 그대로 */}
          <div className="flex flex-col gap-2">
            <p className="m-0 font-sans text-[11px] text-muted md:text-xs">
              {text(
                '나눗셈에서 남는 1 YoYo 단위 잔액은 공연을 만든 팀에 귀속됩니다',
                'Any whole-YoYo remainder goes to the host team.',
              )}
            </p>
            <p className="m-0 font-sans text-[11px] text-muted md:text-xs">
              {text('보증금', 'Deposit')}
              {formatYoyo(DEPOSIT_AMOUNT)}
              {text(
                '은 분배 대상이 아니며 정산 완료 시 별도로 반환됩니다',
                'is excluded from payouts and returned separately after settlement.',
              )}
            </p>
          </div>

          {/* PC 액션 — 좌측 열 하단(P-05 레이아웃). 모바일에서는 하단 고정으로 내려간다 */}
          {!locked && (
            <div className="hidden justify-end md:flex">
              <Button disabled={!validation.canSave || saving || saveBlocked} onClick={requestSave}>
                {saving ? text('저장 중…', 'Saving…') : text('규칙 저장', 'Save rules')}
              </Button>
            </div>
          )}
        </div>

        {/* 우측 — 시뮬레이션 결과. PC는 스크롤에 따라붙어 입력과 결과를 동시에 본다 */}
        <div className="w-full shrink-0 md:w-[420px]">
          <div className="md:sticky md:top-4">
            <h3 className="mb-2 font-sans text-[11px] font-semibold text-muted md:text-xs">
              {text('예상 분배액', 'Projected payouts')}
            </h3>

            {/* 모바일은 접기 영역(기본 접힘). PC는 항상 펼친다 */}
            <div className="md:hidden">
              <button
                type="button"
                aria-expanded={simOpen}
                aria-controls="settlement-simulation"
                onClick={() => setSimOpen((v) => !v)}
                className="flex min-h-11 w-full items-center justify-between rounded-card border border-line bg-surface px-4 font-sans text-[13px] font-semibold text-ink"
              >
                {text('시뮬레이션 결과 보기', 'View projected payouts')}
                <span
                  aria-hidden
                  className={`text-muted transition-transform duration-150 ease-out ${simOpen ? 'rotate-180' : ''}`}
                >
                  ▼
                </span>
              </button>
              <MotionDisclosure
                open={simOpen}
                id="settlement-simulation"
                enterMs={220}
                exitMs={160}
              >
                <div className="mt-2">
                  <SimulationPanel result={simulation} choiceAssumed={simulation.choiceAssumed} />
                </div>
              </MotionDisclosure>
            </div>
            <div className="hidden md:block">
              <SimulationPanel result={simulation} choiceAssumed={simulation.choiceAssumed} />
            </div>
          </div>
        </div>
      </div>

      {/* 모바일 하단 고정 — 주 액션 하나만(§5.19) */}
      {!locked && (
        <FixedBottom>
          <Button
            full
            disabled={!validation.canSave || saving || saveBlocked}
            onClick={requestSave}
          >
            {saving ? text('저장 중…', 'Saving…') : text('규칙 저장', 'Save rules')}
          </Button>
        </FixedBottom>
      )}

      {/* 동의 초기화는 되돌릴 수 없다 → 어느 폭에서든 확인 모달을 거친다(§5.6 · §5.19) */}
      <ConfirmDialog
        open={confirming}
        title={text('규칙을 저장할까요?', 'Save these rules?')}
        body={text(
          `이미 받은 팀 동의 ${data.agreedCount}건이 모두 초기화되고, 참여팀이 다시 서명해야 합니다.`,
          `All ${data.agreedCount} existing team agreements will reset. Teams must sign again.`,
        )}
        confirmLabel={text('저장하고 동의 초기화', 'Save and reset agreements')}
        cancelLabel={text('취소', 'Cancel')}
        confirmVariant="danger"
        busy={saving}
        onConfirm={() => {
          setConfirming(false)
          void runSave()
        }}
        onClose={() => setConfirming(false)}
      />

      {/*
        저장 성공 → 다음은 언제나 규칙 동의(P-06)다(위 인라인 안내 주석과 같은 근거).
        "닫기"는 이 화면에 머문다 — 인라인 안내의 링크가 같은 곳으로 남아 있다.
      */}
      <NextStepDialog
        open={savedDialogOpen}
        title={text('정산 규칙을 저장했어요', 'Settlement rules saved')}
        body={text(
          '참여팀 모두 규칙에 동의해야 판매를 시작할 수 있어요.',
          'Every team must agree to the rules before ticket sales can start.',
        )}
        primary={{
          label: text('규칙 동의 받으러 가기', 'Review team agreements'),
          to: `/studio/performances/${data.performanceId}/agreements`,
        }}
        onClose={() => setSavedDialogOpen(false)}
      />
    </div>
  )
}

/**
 * 2단계 초기값 — 저장된 규칙이 있으면 그 값, 없으면 참여팀 수 균등 분할(P-05 컴포넌트 표).
 *
 * 참여팀 목록이 정본이고 저장된 `teamShares`는 그 위에 얹는다 — 참여팀이 바뀐 뒤에 들어오면
 * 저장된 규칙에 없는 팀이 생기고, 그 팀은 0이 아니라 **균등 몫**으로 시작해야 눈에 띈다.
 */
function initialShares(data?: RuleScreenData): TeamShareDraft[] {
  const participants = data?.participants ?? []
  if (participants.length === 0) return []
  const even = evenShareBp(participants.length)
  return participants.map((p, i) => {
    const saved = data?.rule?.teamShares.find((s) => s.teamId === p.teamId)
    return {
      teamId: p.teamId,
      teamName: p.teamName,
      shareBp: String(saved?.shareBp ?? even[i]),
    }
  })
}
