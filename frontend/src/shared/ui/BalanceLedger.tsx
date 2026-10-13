/**
 * 들어온 돈 / 나간 돈 요약 — 잔액 패널 안 두 줄.
 *
 * ── 왜 곡선을 버리고 이것으로 바꿨나 (2026-09-08) ──────────────────────
 * 처음엔 잔액 궤적을 스파크라인으로 그렸다. "곡선이 뭘 의미하는지 모르겠다"는 지적이 맞았다.
 * 라벨과 툴팁을 붙여도 근본이 안 풀렸다 —
 *   ① 이 세계에는 **잔액을 늘리는 경로가 없다**(§1.2 원칙 12). 가입 지급 이후로는 내려가기만 하고
 *      가끔 환불로 조금 오른다. 추세라고 부를 모양이 아니다
 *   ② 점 4~6개짜리 선은 "추세"가 아니라 장식이다. 읽어서 **할 수 있는 행동이 없다**
 *   ③ 사용자가 이 화면에서 실제로 묻는 것은 "얼마나 들어왔고 얼마나 썼나"이지 "언제 얼마였나"가 아니다
 * 시간축 대신 확정된 입금·출금 합계를 보여준다.
 * 2026-09-21: 장식 막대와 애니메이션을 제거하고 라벨·금액 두 줄로 정리했다.
 *
 * 방향은 색이 아니라 부호(`+`/`−`)와 라벨로 구분한다(A-13 접근성 규칙). 색은 보조다.
 * 처리 중 금액은 여기 넣지 않는다 — 패널 하단의 보류 줄(§5.10)이 이미 그 역할을 한다.
 *
 * ⚠ §5.10 표에 없는 표시 전용 요소 — 채택 시 명세에 "입출 요약(표시 전용)" 한 줄 추가.
 */

import { formatYoyo } from '@/shared/ui/format'
import { useLocale } from '@/shared/i18n/useLocale'

export interface LedgerSummary {
  /** 확정된 IN 합계(지급·환불·정산 수령·보증금 반환) */
  in: number
  /** 확정된 OUT 합계(결제·보증금 납부) */
  out: number
  /** 합계에 포함된 확정 거래 수 */
  count: number
}

interface Props {
  summary: LedgerSummary
  className?: string
}

function Row({
  label,
  amount,
  sign,
}: {
  label: string
  amount: number
  sign: '+' | '−'
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="font-sans text-xs leading-relaxed text-muted">
        {label}
      </dt>
      <dd className="min-w-0 text-right font-num text-sm font-semibold tabular-nums text-ink [overflow-wrap:anywhere]">
        {sign}
        {formatYoyo(amount)}
      </dd>
    </div>
  )
}

export function BalanceLedger({ summary, className = '' }: Props) {
  const { text } = useLocale()
  const { in: inAmt, out: outAmt, count } = summary
  if (count === 0) return null

  return (
    <div className={className}>
      <p className="m-0 mb-3 font-sans text-xs text-muted">
        {text(`들어오고 나간 돈 · 확정 ${count}건`, `Money in & out · ${count} confirmed`)}
      </p>
      <dl className="flex flex-col gap-2">
        <Row
          label={text('들어옴', 'In')}
          amount={inAmt}
          sign="+"
        />
        <Row
          label={text('나감', 'Out')}
          amount={outAmt}
          sign="−"
        />
      </dl>
    </div>
  )
}
