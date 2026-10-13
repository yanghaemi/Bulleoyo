/**
 * 불변식 4행 — 결정 문서 v2 §3.8. V-01 "불변식 대사 패널"과 V-02 "불변식 4행 목록"이 함께 쓴다.
 *
 * **§5.21 예외 규칙 그대로 접지 않는다** — "숫자 정합을 나란히 대조해야 하는 표(V-01 불변식 4행)는
 * 접지 않고 행마다 패널 하나로 세로 나열한다. 대조가 목적이므로 값과 차액이 한 화면에 같이 보여야 한다."
 * 그래서 PC에서도 표를 만들지 않고 두 폭 모두 패널 4개를 세로로 쌓는다.
 *
 * V-02는 이 목록 전체가 **기본 접힘**이다(컴포넌트 표) — `collapsible`로 감싼다.
 * 불일치 행이 있으면 접힌 채로 두지 않는다(V-02 대사 결과 배지 동작: "불일치면 어떤 불변식이
 * 깨졌는지 행 단위로 펼친다").
 *
 * 확인 중 행은 값 자리를 `—`로 두고 사유를 문장으로 쓴다. 여기서 기대값·실제값 중 하나만
 * 있다고 임의로 차액을 만들지 않는다.
 */

import { useEffect, useId, useState } from 'react'

import { MatchBadge } from '@/features/verify/MatchBadge'
import { signedAmount } from '@/features/verify/invariants'
import type { InvariantRow } from '@/features/verify/invariants'
import { formatYoyo } from '@/shared/ui'
import { useLocale } from '@/shared/i18n/useLocale'

const EN_TITLES = {
  1: '① totalSupply = Σ Minted (demo grants, monotonically increasing)',
  2: '② escrowOf(showId) = Σpurchase − Σrefund − Σrelease (deposits accounted separately)',
  3: '③ Σ Released per show = locked rules × counters (including dust, zero tolerance)',
  4: '④ Supply compared with registered wallet balances + escrow and deposits',
}

const EN_LABELS: Record<string, string> = {
  '검사한 공연': 'Shows checked',
  '어긋난 공연': 'Mismatched shows',
  '허용 오차': 'Allowed difference',
  '최대 차액': 'Maximum difference',
  'Σ지갑 + Σ에스크로': 'Registered wallets + escrow',
  기대값: 'Expected',
  'Σ등록 지갑 + Σ에스크로': 'Registered wallets + escrow',
  실제값: 'Actual',
  '기대 잔액(Σpurchase − Σrefund − Σrelease)': 'Expected balance (Σpurchase − Σrefund − Σrelease)',
  '재계산 합': 'Recalculated total',
}

const EN_REASONS: Record<string, string> = {
  '체인 조회가 지연돼 마지막 캐시 값을 보고 있습니다':
    'On-chain reads are delayed; showing cached values.',
  '체인 조회가 지연돼 마지막 인덱싱 값을 보고 있습니다':
    'On-chain reads are delayed; showing the last indexed values.',
  '공연별 에스크로를 읽지 못했습니다': 'Could not read escrow values for shows.',
  'Released 이벤트를 읽지 못했습니다': 'Released events could not be assessed.',
  '온체인 값을 읽지 못했습니다': 'Could not read on-chain values.',
  '대조에 필요한 값을 읽지 못했습니다': 'Could not read the values needed for comparison.',
  '아직 지급되지 않았거나 대조에 필요한 값이 없습니다':
    'Payout has not occurred or the values needed for comparison are unavailable.',
  '이 불변식의 검사 결과가 응답에 없습니다': 'This invariant result is absent from the response.',
  '이 불변식의 검사 결과가 공시 응답에 없습니다':
    'This invariant result is absent from the supply response.',
  '발행량·에스크로 공시를 불러오지 못해 대조하지 못했습니다':
    'The supply disclosure is unavailable, so comparison is not possible.',
}

/** 값 자리. 판정 불가면 `—`(빈칸으로 두면 "0"인지 "없음"인지 구분되지 않는다) */
function Value({ value, unit }: { value?: number; unit: 'krw' | 'count' }) {
  const { language, text } = useLocale()
  if (value == null) return <span className="font-num tabular-nums text-muted">—</span>
  return (
    <span className="font-num tabular-nums text-ink">
      {unit === 'krw' ? formatYoyo(value) : `${value.toLocaleString(language)}${text('건', '')}`}
    </span>
  )
}

function InvariantPanel({ row }: { row: InvariantRow }) {
  const { language, text } = useLocale()
  const label = (value: string) => (language === 'ko' ? value : (EN_LABELS[value] ?? value))
  const tone =
    row.state === 'matched'
      ? 'border-ok'
      : row.state === 'mismatched'
        ? row.severity === 'danger'
          ? 'border-danger'
          : 'border-warning'
        : 'border-line'

  return (
    <li className={`rounded-card border bg-surface px-4 py-3 md:px-5 md:py-3.5 ${tone}`}>
      <div className="flex flex-wrap items-start gap-2">
        {/* 불변식 문장이 패널 제목이다. 전문 용어를 그대로 쓴다(§1.2 원칙 2의 명시적 예외) */}
        <p className="m-0 flex-1 font-sans text-[13px] font-semibold text-ink md:text-sm">
          {text(row.title, EN_TITLES[row.no])}
        </p>
        <MatchBadge state={row.state} severity={row.severity} />
      </div>

      {/* 두 값을 같은 줄에 나란히 둬야 대조가 눈으로 된다 */}
      <p className="m-0 mt-1.5 font-sans text-[11px] text-muted md:text-xs">
        {label(row.expectedLabel)} <Value value={row.expected} unit={row.unit} />
        {' · '}
        {label(row.actualLabel)} <Value value={row.actual} unit={row.unit} />
        {row.diff != null && (
          <>
            {' · '}
            {text('차액', 'Difference')}{' '}
            <span className="font-num tabular-nums text-ink">
              {row.unit === 'krw'
                ? signedAmount(row.diff)
                : `${row.diff.toLocaleString(language)}${text('건', '')}`}
            </span>
          </>
        )}
        {row.scope && (
          <>
            {' '}
            {' · '}
            {text('대상', 'Scope')} {text(row.scope, `${row.scopeCount ?? '—'} shows`)}
          </>
        )}
      </p>

      {row.state === 'unknown' && (
        // 정직성 규칙의 핵심 문장. 일치·불일치 어느 쪽으로도 단정하지 않는다
        <p className="m-0 mt-1 font-sans text-[11px] font-semibold text-ink md:text-xs">
          {text('아직 판정할 수 없습니다', 'Cannot assess yet')}
          {row.unknownReason && (
            <span className="font-normal text-muted">
              {' · '}
              {text(
                row.unknownReason,
                EN_REASONS[row.unknownReason] ??
                  'Required values are unavailable or have not been assessed.',
              )}
            </span>
          )}
        </p>
      )}

      {row.note && (
        // 서버가 붙인 설명(`note`)을 그대로 옮긴다 — 화면이 고쳐 쓰지 않는다
        <p className="m-0 mt-1 font-mono text-[10px] leading-4 text-faint md:text-[11px]">
          {row.note}
        </p>
      )}
    </li>
  )
}

interface Props {
  rows: InvariantRow[]
  /** V-02는 기본 접힘. V-01은 항상 펼친 상태로 둔다 */
  collapsible?: boolean
  /** 접힘 상태로 시작할지. 불일치·판정 불가가 있으면 호출부가 `false`로 넘긴다 */
  defaultOpen?: boolean
}

export function InvariantList({ rows, collapsible = false, defaultOpen = true }: Props) {
  const { text } = useLocale()
  const [open, setOpen] = useState(defaultOpen)
  const listId = useId()

  useEffect(() => {
    if (defaultOpen) setOpen(true)
  }, [defaultOpen])

  const list = (
    <ul id={listId} className="m-0 flex list-none flex-col gap-2 p-0">
      {rows.map((row) => (
        <InvariantPanel key={row.no} row={row} />
      ))}
    </ul>
  )

  if (!collapsible) {
    return (
      <section aria-label={text('불변식 대사', 'Invariants')}>
        <h2 className="mb-2 font-sans text-[11px] font-semibold text-muted md:text-xs">
          {text('불변식 대사 4행', 'Invariants')}
        </h2>
        {list}
      </section>
    )
  }

  return (
    <section aria-label={text('불변식 대사', 'Invariants')}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        // 터치 타겟 44px(V-02 접근성 항목)
        className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-card border border-line bg-surface px-4 py-2.5 text-left transition-colors duration-150 ease-out hover:bg-ground-2"
      >
        <span className="font-sans text-[13px] font-semibold text-ink md:text-sm">
          {text('불변식 4행', 'Invariants')}
        </span>
        <span className="ml-auto font-sans text-[11px] text-muted">
          {open ? text('접기', 'Collapse') : text('펼치기', 'Expand')}
        </span>
        <span aria-hidden className="font-sans text-[11px] text-muted">
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && <div className="mt-2">{list}</div>}
    </section>
  )
}
