/**
 * P-05 도움말 — `?` 버튼 + 예시 모달.
 *
 * "고정 분배" · "관객 선택" · "팀별 고정 분배 비율" 옆에 붙는다. 세 버튼이 **같은 예시**를 쓰고
 * 주제마다 설명 문장과 강조하는 단계만 다르다 — 셋이 한 계산의 서로 다른 칸이라 한 그림에서
 * 보는 편이 이해가 빠르다.
 *
 * 모달은 `shared/ui/Modal`을 그대로 쓴다 — Esc · 바깥(배경) 클릭 닫기 · 포커스 가두기 ·
 * 닫힌 뒤 `?` 버튼으로 포커스 복귀가 이미 들어 있다.
 *
 * 예시 금액은 `computeHelpExample()`(= 화면의 `simulate()`) 결과다. 글로 박지 않는다.
 */

import { useState } from 'react'
import type { ReactNode } from 'react'

import { Button, Modal, formatYoyo } from '@/shared/ui'
import { useLocale } from '@/shared/i18n/useLocale'
import { bpToPercentLabel } from '@/features/studio/settlementRuleCalc'
import { HELP_EXAMPLE, computeHelpExample } from '@/features/studio/ruleHelpExample'

import './rule-help.css'

export type RuleHelpTopic = 'fixed' | 'selection' | 'teamShare'

const FIXED_COLOR = 'var(--color-primary)'
const SELECTION_COLOR = 'var(--color-sel)'

/** 예시 막대 — 매출이 두 풀로 갈라지고 팀 막대가 차오른다. 장식이라 스크린 리더에서 숨긴다 */
function HelpAnimation() {
  const { text } = useLocale()
  const ex = computeHelpExample()
  const revenue = ex.assumedRevenueAmount
  const pct = (amount: number) => `${(amount / revenue) * 100}%`

  const row = (key: string, label: string, amount: number, children: ReactNode) => (
    <div key={key} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-2">
      <span className="font-sans text-[11px] font-semibold text-muted">{label}</span>
      <div className="flex h-3 overflow-hidden rounded-full bg-ground-2">{children}</div>
      <span className="rule-help-total min-w-[6.5rem] text-right font-num text-[11px] tabular-nums text-ink">
        {formatYoyo(amount)}
      </span>
    </div>
  )

  return (
    <div
      aria-hidden
      data-testid="rule-help-animation"
      className="flex flex-col gap-2 rounded-control border border-line bg-surface px-3 py-3"
    >
      {row(
        'revenue',
        text('매출', 'Revenue'),
        revenue,
        <>
          <div
            className="rule-help-fill h-full"
            data-phase="1"
            style={{ width: pct(ex.fixedPoolAmount), background: FIXED_COLOR }}
          />
          <div
            className="rule-help-fill h-full"
            data-phase="1"
            style={{ width: pct(ex.selectionPoolAmount), background: SELECTION_COLOR }}
          />
        </>,
      )}
      {ex.rows.map((r) =>
        row(
          String(r.teamId),
          text(`팀 ${r.teamName}`, `Team ${r.teamName}`),
          r.totalAmount,
          <>
            <div
              className="rule-help-fill h-full"
              data-phase="2"
              style={{ width: pct(r.fixedAmount), background: FIXED_COLOR }}
            />
            <div
              className="rule-help-fill h-full"
              data-phase="3"
              style={{ width: pct(r.choiceAmount + r.dustAmount), background: SELECTION_COLOR }}
            />
          </>,
        ),
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 font-sans text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: FIXED_COLOR }}
          />
          {text('고정 분배', 'Fixed share')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: SELECTION_COLOR }}
          />
          {text('관객 선택', 'Audience choice')}
        </span>
      </div>
    </div>
  )
}

function HelpBody({ topic }: { topic: RuleHelpTopic }) {
  const { text } = useLocale()
  const ex = computeHelpExample()
  const dustEx = computeHelpExample(HELP_EXAMPLE.dustRevenue)
  const [a, b] = ex.rows
  const [ta, tb] = HELP_EXAMPLE.teams
  const fixedPct = bpToPercentLabel(HELP_EXAMPLE.fixedRatioBp)
  const selPct = bpToPercentLabel(HELP_EXAMPLE.selectionRatioBp)
  const totalChoices = ta.choices + tb.choices
  const dustA = dustEx.rows[0]

  /** 주제가 가리키는 단계를 강조한다 — 같은 예시에서 "지금 묻는 칸"이 어디인지 */
  const focus: Record<RuleHelpTopic, number[]> = {
    fixed: [1, 2],
    selection: [1, 3],
    teamShare: [2],
  }
  const stepClass = (n: number) =>
    [
      'rounded-control px-3 py-2',
      focus[topic].includes(n) ? 'bg-sel-soft ring-1 ring-sel' : 'bg-ground-2',
    ].join(' ')

  return (
    <div className="flex flex-col gap-3 font-sans text-[13px] leading-relaxed text-ink">
      <HelpAnimation />

      <p className="m-0 text-muted">
        <b className="text-ink">{text('예시', 'Example')}</b>{' '}
        {text(
          `매출 ${formatYoyo(ex.assumedRevenueAmount)} · 고정 분배 ${fixedPct} / 관객 선택 ${selPct} · 팀 A:B 고정 비율 ${bpToPercentLabel(ta.shareBp)}:${bpToPercentLabel(tb.shareBp)} · 관객 ${ta.choices}명이 A, ${tb.choices}명이 B를 선택`,
          `Revenue ${formatYoyo(ex.assumedRevenueAmount)} · fixed ${fixedPct} / audience choice ${selPct} · team A:B fixed split ${bpToPercentLabel(ta.shareBp)}:${bpToPercentLabel(tb.shareBp)} · ${ta.choices} audience members choose A, ${tb.choices} choose B`,
        )}
      </p>

      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        <li className={stepClass(1)} data-testid="rule-help-step-1">
          <b>{text('① 매출을 두 몫으로', '① Split revenue into two pools')}</b>
          <br />
          {text('고정 몫', 'Fixed pool')} {formatYoyo(ex.assumedRevenueAmount)} × {fixedPct} ={' '}
          <b className="font-num tabular-nums">{formatYoyo(ex.fixedPoolAmount)}</b>
          <br />
          {text('관객 선택 몫', 'Audience choice pool')} {formatYoyo(ex.assumedRevenueAmount)} ×{' '}
          {selPct} = <b className="font-num tabular-nums">{formatYoyo(ex.selectionPoolAmount)}</b>
        </li>
        <li className={stepClass(2)} data-testid="rule-help-step-2">
          <b>{text('② 고정 몫을 팀별 고정 비율로', '② Fixed pool by team split')}</b>
          <br />A {formatYoyo(ex.fixedPoolAmount)} × {bpToPercentLabel(ta.shareBp)} ={' '}
          <b className="font-num tabular-nums">{formatYoyo(a.fixedAmount)}</b>
          <br />B {formatYoyo(ex.fixedPoolAmount)} × {bpToPercentLabel(tb.shareBp)} ={' '}
          <b className="font-num tabular-nums">{formatYoyo(b.fixedAmount)}</b>
        </li>
        <li className={stepClass(3)} data-testid="rule-help-step-3">
          <b>{text('③ 관객 선택 몫을 선택 수대로', '③ Audience choice pool by choices')}</b>
          <br />A {formatYoyo(ex.selectionPoolAmount)} × {ta.choices}/{totalChoices} ={' '}
          <b className="font-num tabular-nums">{formatYoyo(a.choiceAmount)}</b>
          <br />B {formatYoyo(ex.selectionPoolAmount)} × {tb.choices}/{totalChoices} ={' '}
          <b className="font-num tabular-nums">{formatYoyo(b.choiceAmount)}</b>
        </li>
        <li className={stepClass(4)} data-testid="rule-help-step-4">
          <b>{text('④ 합계', '④ Total')}</b>
          <br />A <b className="font-num tabular-nums">{formatYoyo(a.totalAmount)}</b> · B{' '}
          <b className="font-num tabular-nums">{formatYoyo(b.totalAmount)}</b>
        </li>
      </ol>

      <p className="m-0 text-[12px] text-muted" data-testid="rule-help-dust">
        {text(
          `1 YoYo 미만은 버립니다. 버려서 남는 금액은 공연을 만든 팀(A)이 받습니다. 예를 들어 매출이 ${formatYoyo(HELP_EXAMPLE.dustRevenue)}이면 두 몫이 ${formatYoyo(dustEx.fixedPoolAmount)} · ${formatYoyo(dustEx.selectionPoolAmount)}이라 ${formatYoyo(dustA.dustAmount)}가 남고, A가 ${formatYoyo(dustA.totalAmount)}를 받습니다.`,
          `Amounts below 1 YoYo are rounded down, and the leftover goes to the host team (A). For example, with revenue of ${formatYoyo(HELP_EXAMPLE.dustRevenue)} the two pools are ${formatYoyo(dustEx.fixedPoolAmount)} and ${formatYoyo(dustEx.selectionPoolAmount)}, leaving ${formatYoyo(dustA.dustAmount)}, so A receives ${formatYoyo(dustA.totalAmount)}.`,
        )}
      </p>
    </div>
  )
}

const TITLES: Record<RuleHelpTopic, [string, string]> = {
  fixed: ['고정 분배란?', 'What is the fixed share?'],
  selection: ['관객 선택이란?', 'What is the audience choice share?'],
  teamShare: ['팀별 고정 분배 비율이란?', 'What is the fixed share by team?'],
}

const DESCRIPTIONS: Record<RuleHelpTopic, [string, string]> = {
  fixed: [
    '관객이 누구를 골랐는지와 상관없이, 미리 정한 팀별 고정 비율대로 나누는 몫입니다.',
    'This pool is split by each team’s preset fixed share, regardless of audience choices.',
  ],
  selection: [
    '관객이 티켓을 살 때 고른 팀에게, 받은 선택 수만큼 나눠 주는 몫입니다.',
    'This pool goes to the teams the audience chose at purchase, in proportion to their choices.',
  ],
  teamShare: [
    '고정 분배 몫을 팀끼리 어떤 비율로 나눌지 정합니다. 모든 팀을 더하면 100%여야 합니다.',
    'Sets how the fixed pool is divided among teams. All teams must add up to 100%.',
  ],
}

/** `?` 버튼(44px 터치 영역) + 도움말 모달 */
export function RuleHelpButton({ topic, label }: { topic: RuleHelpTopic; label: string }) {
  const { text } = useLocale()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-focus"
      >
        <span
          aria-hidden
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current font-sans text-[11px] font-bold"
        >
          ?
        </span>
      </button>
      <Modal
        open={open}
        title={text(...TITLES[topic])}
        description={text(...DESCRIPTIONS[topic])}
        onClose={() => setOpen(false)}
        footer={
          <Button variant="secondary" onClick={() => setOpen(false)}>
            {text('확인', 'Got it')}
          </Button>
        }
      >
        <HelpBody topic={topic} />
      </Modal>
    </>
  )
}
