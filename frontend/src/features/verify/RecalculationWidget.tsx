/**
 * V-01 재계산 위젯 — "브라우저에서 2단계 공식 실행 → 서버 표시값과 대조 → 일치/불일치 표시(2초 이내)".
 *
 * 정본 — 화면설계 v6 V-01 컴포넌트 표(재계산 위젯) · **입력 검증**(정수·bp만, 합 10,000bp 초과 시
 *        계산 전 차단) · **레이아웃**(모바일에서는 접기 영역에 둔다).
 *
 * 이 위젯이 이 화면의 존재 이유다 — 서버가 내려준 `shares[]`를 **믿지 않고** 잠긴 규칙과 온체인
 * 카운터만으로 다시 계산해 같은 값이 나오는지 본다. 그래서 입력값은 전부 수정할 수 있다.
 * 값을 고치면 이전 계산 결과는 **지운다** — 바뀐 입력 옆에 옛 결과가 남아 있으면 무엇을 대조한
 * 것인지 알 수 없다.
 *
 * 계산은 `recalc.ts`(순수 함수)가 한다. 여기서는 입력 상태와 표시만 맡는다.
 *
 * 모바일은 접기 영역, PC는 항상 펼침 — 토글 버튼 자체를 `md:hidden`으로 두고 본문은
 * `md:block`으로 강제한다(자바스크립트로 폭을 재지 않는다).
 */

import { useId, useState } from 'react'

import { MatchBadge } from '@/features/verify/MatchBadge'
import {
  BP_TOTAL,
  bpToPercentLabel,
  parseInteger,
  recalculate,
  validateRecalc,
} from '@/features/verify/recalc'
import type { RecalcDraft, RecalcResult } from '@/features/verify/recalc'
import type { VerificationShare } from '@/features/verify/verifyTypes'
import { useLocale } from '@/shared/i18n/useLocale'
import { Button, Input, formatYoyo } from '@/shared/ui'

/** 입력 한 칸. 라벨과 오류 문구를 세로로 붙인다 */
function Field({
  label,
  hint,
  value,
  onChange,
  suffix,
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  suffix?: string
}) {
  const id = useId()
  const invalid = parseInteger(value) == null
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-sans text-[11px] text-muted md:text-xs">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <Input
          id={id}
          value={value}
          invalid={invalid}
          inputMode="numeric"
          // 소수·음수·기호를 애초에 넣기 어렵게 한다. 검증은 `parseInteger`가 다시 한다
          pattern="[0-9]*"
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        {suffix && <span className="shrink-0 font-sans text-[11px] text-muted">{suffix}</span>}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="m-0 font-sans text-[11px] text-faint">
          {hint}
        </p>
      )}
    </div>
  )
}

interface Props {
  /** 응답값으로 채운 초기 입력(자동 입력). 사용자가 고칠 수 있다 */
  initialDraft: RecalcDraft
  /** `recalculationInput.hostTeamId` — dust 귀속 팀 */
  hostTeamId: number
  /** 대조 대상. 서버가 표시하는 팀별 산출액 */
  serverShares: VerificationShare[]
  /** 잠긴 규칙의 반올림·잔여 규칙 문자열. 그대로 노출한다 */
  roundingRule: string
  remainderRule: string
}

export function RecalculationWidget({
  initialDraft,
  hostTeamId,
  serverShares,
  roundingRule,
  remainderRule,
}: Props) {
  const { language, text } = useLocale()
  const [draft, setDraft] = useState<RecalcDraft>(initialDraft)
  const [result, setResult] = useState<RecalcResult | undefined>(undefined)
  const [openOnMobile, setOpenOnMobile] = useState(false)
  const bodyId = useId()

  const validation = validateRecalc(draft)
  const validationReasons = [
    validation.hasInvalidField
      ? text(
          '비율(bp)과 금액·카운터는 0 이상의 정수만 넣을 수 있습니다',
          'Ratios, amounts, and counters must be non-negative integers.',
        )
      : null,
    validation.stageOneOver
      ? text(
          `1단계 비율 합이 ${validation.stageOneSum.toLocaleString('ko-KR')}bp입니다. 10,000bp가 되어야 계산할 수 있습니다`,
          `Step 1 totals ${validation.stageOneSum.toLocaleString('en-US')}bp. It must equal 10,000bp.`,
        )
      : null,
    validation.stageTwoOver
      ? text(
          `팀별 비율 합이 ${validation.stageTwoSum.toLocaleString('ko-KR')}bp입니다. 10,000bp가 되어야 계산할 수 있습니다`,
          `Team ratios total ${validation.stageTwoSum.toLocaleString('en-US')}bp. They must equal 10,000bp.`,
        )
      : null,
    draft.teams.length === 0
      ? text('참여팀이 없어 2단계를 계산할 수 없습니다', 'Step 2 needs at least one team.')
      : null,
  ].filter((reason): reason is string => reason != null)

  /** 입력이 바뀌면 결과를 버린다 — 옛 결과와 새 입력이 한 화면에 같이 있으면 안 된다 */
  const edit = (next: RecalcDraft) => {
    setDraft(next)
    setResult(undefined)
  }

  const setTeam = (teamId: number, patch: { shareBp?: string; choiceCount?: string }) =>
    edit({
      ...draft,
      teams: draft.teams.map((t) => (t.teamId === teamId ? { ...t, ...patch } : t)),
    })

  const run = () => {
    if (!validation.canCalculate) return
    setResult(recalculate({ draft, hostTeamId, serverShares }))
  }

  const reset = () => {
    setDraft(initialDraft)
    setResult(undefined)
  }

  return (
    <section
      aria-label={text('재계산', 'Recalculation')}
      className="rounded-card border border-line bg-surface"
    >
      <h2 className="sr-only">{text('재계산 위젯', 'Recalculation widget')}</h2>

      {/* 모바일 전용 접기 토글(V-01 레이아웃). PC에서는 없다 — 본문이 항상 보인다 */}
      <button
        type="button"
        aria-expanded={openOnMobile}
        aria-controls={bodyId}
        onClick={() => setOpenOnMobile((v) => !v)}
        className="flex min-h-11 w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-left md:hidden"
      >
        <span className="font-sans text-[13px] font-semibold text-ink">
          {text('브라우저에서 다시 계산', 'Recalculate in this browser')}
        </span>
        <span className="ml-auto font-sans text-[11px] text-muted">
          {openOnMobile ? text('접기', 'Collapse') : text('펼치기', 'Expand')}
        </span>
      </button>

      <div
        id={bodyId}
        className={`${openOnMobile ? 'block' : 'hidden'} px-4 pb-4 md:block md:px-5 md:py-4`}
      >
        <p className="m-0 mb-1 hidden font-sans text-[13px] font-semibold text-ink md:block md:text-sm">
          {text('브라우저에서 다시 계산', 'Recalculate in this browser')}
        </p>
        <p className="m-0 mb-3 font-sans text-[11px] text-muted md:text-xs">
          {text(
            '서버가 표시한 금액을 쓰지 않고, 잠긴 규칙과 온체인 카운터만으로 이 브라우저에서 다시 계산합니다. 값을 바꿔 가며 확인할 수 있습니다.',
            'Recalculate from the locked rule and on-chain counters without trusting the displayed server totals. You can edit the inputs to verify them.',
          )}
        </p>

        {/* 1단계 비율 · 총 매출 */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Field
            label={text('고정 비율 bp_f', 'Fixed ratio bp_f')}
            suffix="bp"
            value={draft.fixedRatioBp}
            onChange={(v) => edit({ ...draft, fixedRatioBp: v })}
            hint={
              parseInteger(draft.fixedRatioBp) != null
                ? bpToPercentLabel(parseInteger(draft.fixedRatioBp) ?? 0)
                : undefined
            }
          />
          <Field
            label={text('관객 선택 비율 bp_s', 'Audience ratio bp_s')}
            suffix="bp"
            value={draft.selectionRatioBp}
            onChange={(v) => edit({ ...draft, selectionRatioBp: v })}
            hint={
              parseInteger(draft.selectionRatioBp) != null
                ? bpToPercentLabel(parseInteger(draft.selectionRatioBp) ?? 0)
                : undefined
            }
          />
          <Field
            label={text('분배 대상 R', 'Distributable amount R')}
            suffix="YoYo"
            value={draft.distributableAmount}
            onChange={(v) => edit({ ...draft, distributableAmount: v })}
            hint={text(
              '서버가 확인한 분배 대상 금액입니다. 환불을 다시 차감하지 않습니다.',
              'This is the server-confirmed distributable amount. Refunds are not deducted again.',
            )}
          />
        </div>

        {/* 2단계 — 팀별 고정 비율 w_i와 온체인 카운터 */}
        <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
          {draft.teams.map((t) => (
            <li key={t.teamId} className="rounded-card border border-line bg-ground px-3 py-2.5">
              <span className="block font-sans text-[13px] font-bold text-ink">
                {t.teamName}
                {t.teamId === hostTeamId && (
                  <span className="ml-1.5 font-sans text-[10px] font-normal text-muted">
                    {text('잔여액 귀속', 'Remainder recipient')}
                  </span>
                )}
              </span>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <Field
                  label={text('팀 비율 w_i', 'Team ratio w_i')}
                  suffix="bp"
                  value={t.shareBp}
                  onChange={(v) => setTeam(t.teamId, { shareBp: v })}
                />
                <Field
                  label={text('온체인 카운터', 'On-chain counter')}
                  suffix={text('건', '')}
                  value={t.choiceCount}
                  onChange={(v) => setTeam(t.teamId, { choiceCount: v })}
                />
              </div>
            </li>
          ))}
        </ul>

        {/* 합계 줄 — 10,000bp를 넘으면 계산 전에 막는다(V-01 입력 검증) */}
        <p className="m-0 mt-2 font-sans text-[11px] text-muted md:text-xs">
          {text('1단계 합', 'Step 1 total')}{' '}
          <span
            className={`font-num tabular-nums ${validation.stageOneOver ? 'text-danger' : 'text-ink'}`}
          >
            {validation.stageOneSum.toLocaleString(language)}bp
          </span>
          {' · '}
          {text('팀 비율 합', 'Team ratio total')}{' '}
          <span
            className={`font-num tabular-nums ${validation.stageTwoOver ? 'text-danger' : 'text-ink'}`}
          >
            {validation.stageTwoSum.toLocaleString(language)}bp
          </span>
          {' · '}
          {text('기준', 'Required')} {BP_TOTAL.toLocaleString(language)}bp
        </p>

        {validationReasons.length > 0 && (
          <ul role="alert" className="m-0 mt-1 list-none p-0">
            {validationReasons.map((r) => (
              <li key={r} className="font-sans text-[11px] font-semibold text-danger md:text-xs">
                {r}
              </li>
            ))}
          </ul>
        )}

        {/* 규칙 원문 — 화면이 임의로 반올림하지 않았음을 드러낸다 */}
        <p className="m-0 mt-2 font-mono text-[10px] leading-4 text-faint md:text-[11px]">
          {roundingRule} · {remainderRule}
        </p>

        {/* PC는 하단 고정을 쓰지 않는다 — 폼의 마지막 줄 오른쪽에 둔다(§5.19) */}
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" sm onClick={reset}>
            {text('원래 값으로', 'Reset')}
          </Button>
          <Button sm onClick={run} disabled={!validation.canCalculate}>
            {text('계산', 'Calculate')}
          </Button>
        </div>

        {result && <RecalcResultView result={result} />}
      </div>
    </section>
  )
}

/** 계산 결과 — 팀별 재계산값과 서버 표시값을 나란히 둔다 */
function RecalcResultView({ result }: { result: RecalcResult }) {
  const { text } = useLocale()
  /**
   * 서버 `shares[]`에 없는 팀이 입력에 있으면 대조 자체가 안 된다.
   * 이때 `matched`를 쓰지 않고 **판정 불가**로 둔다 — 이 화면의 정직성 규칙.
   */
  const state = result.hasUnknownRow ? 'unknown' : result.matched ? 'matched' : 'mismatched'

  const headline = result.hasUnknownRow
    ? text('대조 결과를 알 수 없습니다', 'The comparison result is unavailable')
    : result.matched
      ? text(
          '재계산 결과가 서버 표시값과 일치합니다',
          'The recalculated values match the server totals',
        )
      : text(
          '재계산 결과가 서버 표시값과 일치하지 않습니다',
          'The recalculated values do not match the server totals',
        )

  return (
    <div role="status" className="mt-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* 색이 아니라 문구로 먼저 알린다(V-01 접근성 항목) */}
        <p className="m-0 flex-1 font-sans text-[13px] font-semibold text-ink md:text-sm">
          {headline}
        </p>
        <MatchBadge state={state} />
      </div>

      <p className="m-0 mt-1 font-sans text-[11px] text-muted md:text-xs">
        {text('분배 대상', 'Distributable')}{' '}
        <span className="font-num tabular-nums text-ink">
          {formatYoyo(result.distributableAmount)}
        </span>
        {' · '}
        {text('고정 풀', 'Fixed pool')}{' '}
        <span className="font-num tabular-nums text-ink">{formatYoyo(result.fixedPoolAmount)}</span>
        {' · '}
        {text('선택 풀', 'Audience pool')}{' '}
        <span className="font-num tabular-nums text-ink">
          {formatYoyo(result.selectionPoolAmount)}
        </span>
        {/* V-01 동작 항목이 "2초 이내"를 요구한다 — 실측값을 그대로 보여준다 */}
        {' · '}
        {text('계산', 'Calculated in')} {result.elapsedMs}ms
      </p>

      {/*
       * 근거가 생겼으므로 경고(⚠)가 아니라 안내다. 종전 문구는 "명세에 없어 해석했다"였는데,
       * 이 화면이 증명하려는 것이 "우리가 지어내지 않았다"이므로 스스로 해석이라 말하면
       * 목적과 반대다. 실제로는 컨트랙트와 같은 식으로 계산한다(RevenueSplitter.aggregate).
       */}
      {result.choiceCountZero && (
        <p className="m-0 mt-1 font-sans text-[11px] text-ink-muted md:text-xs">
          {text(
            '온체인 선택 카운터 합이 0이라 선택 풀을 참여팀 수로 균등 분배했습니다 — 컨트랙트와 같은 방식입니다',
            'The on-chain choice total is zero, so the audience pool was split evenly across participating teams, matching the contract.',
          )}
        </p>
      )}

      <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
        {result.rows.map((r) => {
          const rowState =
            r.serverTotalAmount == null ? 'unknown' : r.diff === 0 ? 'matched' : 'mismatched'
          return (
            <li
              key={r.teamId}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-card border border-line bg-ground px-3 py-2"
            >
              <span className="font-sans text-[13px] font-bold text-ink">{r.teamName}</span>
              <MatchBadge state={rowState} />
              <span className="w-full font-sans text-[11px] text-muted md:w-auto">
                {text('재계산', 'Recalculated')}{' '}
                <span className="font-num tabular-nums text-ink">{formatYoyo(r.totalAmount)}</span>
                {' · '}
                {text('서버', 'Server')}{' '}
                <span className="font-num tabular-nums text-ink">
                  {r.serverTotalAmount == null ? '—' : formatYoyo(r.serverTotalAmount)}
                </span>
                {r.diff != null && r.diff !== 0 && (
                  <>
                    {' · '}
                    {text('차액', 'Difference')}{' '}
                    <span className="font-num tabular-nums text-ink">
                      {r.diff > 0 ? '+' : '−'}
                      {formatYoyo(Math.abs(r.diff))}
                    </span>
                  </>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
