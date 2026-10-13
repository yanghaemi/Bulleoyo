import { useLocale } from '@/shared/i18n/useLocale'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, type CSSProperties } from 'react'

import { STAGE_SPRING } from '@/shared/motion/motionTokens'

import { BP_TOTAL, bpToPercentLabel } from './settlementRuleCalc'

interface Props {
  fixedBp: number
  selectionBp: number
  valid: boolean
  disabled?: boolean
  reducedMotion?: boolean
}

/** Presentation only. Invalid drafts never replace the last valid lighting pair. */
export function SettlementLightStage({
  fixedBp,
  selectionBp,
  valid,
  disabled,
  reducedMotion,
}: Props) {
  const { text } = useLocale()
  const prefersReducedMotion = useReducedMotion()
  const isReduced = reducedMotion ?? prefersReducedMotion ?? false
  const staticLights = isReduced || disabled
  const lastValid = useRef<{ fixedBp: number; selectionBp: number } | null>(null)
  const pairValid =
    valid &&
    Number.isInteger(fixedBp) &&
    Number.isInteger(selectionBp) &&
    fixedBp >= 0 &&
    selectionBp >= 0 &&
    fixedBp + selectionBp === BP_TOTAL

  useEffect(() => {
    if (pairValid) lastValid.current = { fixedBp, selectionBp }
  }, [fixedBp, selectionBp, pairValid])

  const pair = pairValid ? { fixedBp, selectionBp } : lastValid.current
  const lights = [
    {
      id: 'fixed',
      label: text('고정 분배', 'Fixed share'),
      bp: pair?.fixedBp,
      color: 'var(--color-primary)',
    },
    {
      id: 'selection',
      label: text('관객 선택', 'Audience choice'),
      bp: pair?.selectionBp,
      color: 'var(--color-sel)',
    },
  ]

  return (
    <div
      data-testid="settlement-light-stage"
      className="mb-4 min-w-0 overflow-hidden rounded-control border border-line bg-ground-2"
    >
      <div
        aria-hidden="true"
        className="relative flex h-24 gap-1 overflow-hidden px-3 pt-2 md:h-28"
      >
        {pair &&
          lights.map(({ id, bp, color }) => {
            const ratio = (bp ?? 0) / BP_TOTAL
            return (
              <motion.div
                key={id}
                data-testid={`${id}-light`}
                initial={false}
                animate={
                  staticLights ? undefined : { flexGrow: ratio, opacity: 0.22 + ratio * 0.24 }
                }
                transition={STAGE_SPRING}
                className="h-full rounded-t-full"
                style={
                  {
                    '--light-ratio': ratio,
                    flexBasis: 0,
                    ...(staticLights ? { flexGrow: ratio, opacity: 0.22 + ratio * 0.24 } : {}),
                    minWidth: 12,
                    background: `radial-gradient(ellipse at 50% 0%, ${color} 0%, ${color} 15%, transparent 78%)`,
                  } as CSSProperties
                }
              />
            )
          })}
        <div className="absolute inset-x-3 bottom-0 h-px bg-line" />
      </div>
      <div className="grid grid-cols-2 gap-3 px-3 py-3">
        {lights.map(({ id, label, bp, color }) => (
          <div
            key={id}
            role="group"
            aria-label={text(`${label} 조명`, `${label} light`)}
            className="min-w-0"
          >
            <p className="m-0 flex items-center gap-1.5 font-sans text-[11px] text-muted">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: color }}
              />
              {label}
            </p>
            <p className="m-0 mt-1 font-mono text-xl font-semibold tabular-nums text-ink">
              {bp == null ? '—' : bpToPercentLabel(bp)}
            </p>
          </div>
        ))}
      </div>
      <p role="status" className="m-0 px-3 pb-3 font-sans text-[11px] text-muted">
        {pairValid
          ? text(
              '분배 비율에 따라 두 조명의 너비와 밝기가 달라집니다.',
              'The widths and brightness reflect your allocation ratio.',
            )
          : pair
            ? text(
                '비율 확인이 필요해 마지막 유효 비율을 표시합니다.',
                'Check the ratio. The preview shows the last valid values.',
              )
            : text(
                '유효한 비율을 입력하면 조명 미리보기가 표시됩니다.',
                'Enter a valid ratio to display the preview.',
              )}
      </p>
    </div>
  )
}
