/** 지갑 서명 진행 표시. 승인·결제처럼 여러 번 서명하는 흐름에서 현재 횟수를 명시한다. */
import { useLocale } from '@/shared/i18n/useLocale'

type Phase = 'waiting' | 'signing' | 'confirming' | 'complete'

const PHASE_LABEL: Record<Phase, string> = {
  waiting: '서명 준비 중',
  signing: '지갑에서 서명해 주세요',
  confirming: '서명 확인 중',
  complete: '서명 완료',
}
const PHASE_LABEL_EN: Record<Phase, string> = {
  waiting: 'Preparing your request',
  signing: 'Confirm in your wallet',
  confirming: 'Confirming your signature',
  complete: 'Signature confirmed',
}

interface Props {
  current: number
  total: number
  phase: Phase
  label?: string
}

export function SignatureProgress({ current, total, phase, label }: Props) {
  const { text } = useLocale()
  const phaseLabel = text(PHASE_LABEL[phase], PHASE_LABEL_EN[phase])
  const safeTotal = Number.isFinite(total) ? Math.max(1, total) : 1
  const normalizedCurrent = Number.isFinite(current) ? current : 0
  const safeCurrent =
    phase === 'complete'
      ? safeTotal
      : Math.min(Math.max(phase === 'waiting' ? 0 : normalizedCurrent, 0), safeTotal)
  const percent = phase === 'complete' ? 100 : Math.round((safeCurrent / safeTotal) * 100)

  return (
    <section
      className="ui-signature-progress rounded-card border border-line bg-surface p-4"
      aria-label={text('서명 진행 상태', 'Signature progress')}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          {label && <p className="font-sans text-xs font-semibold text-muted">{label}</p>}
          <p className="mt-0.5 font-sans text-sm font-bold text-ink">{phaseLabel}</p>
        </div>
        <span className="font-num text-sm font-bold tabular-nums text-primary">
          {safeCurrent}/{safeTotal}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeTotal}
        aria-valuenow={safeCurrent}
        aria-valuetext={`${phaseLabel}, ${safeCurrent}/${safeTotal}`}
        className="mt-3 h-2 overflow-hidden rounded-full bg-ground-2"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </section>
  )
}

export type { Phase as SignaturePhase }
