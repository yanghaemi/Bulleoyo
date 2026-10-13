import { useEffect, useId, useRef, useState } from 'react'

import { BrandLoader } from '@/shared/ui/BrandLoader'
import { restoreFocusIfSafe } from '@/shared/ui/focusTrap'
import { useLocale } from '@/shared/i18n/useLocale'

interface Props {
  label: string
  description?: string
  /** Labels and current index come from the real operation state, never a timer. */
  steps?: readonly string[]
  currentStep?: number
}

/** 긴 작업의 실제 대기 상태에만 표시한다. 완료·실패 시 애니메이션 대기 없이 제거한다. */
export function OperationOverlay({ label, description, steps, currentStep }: Props) {
  const { text } = useLocale()
  const descriptionId = useId()
  // 부모의 inert가 DOM에 반영되기 전에 시작 버튼을 기억한다.
  const [previousFocus] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  )
  const progressRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const progressElement = progressRef.current
    // 현재 문서의 진행 상태에 한 번만 포커스한다. 팝업/window focus나 trap은 사용하지 않는다.
    progressElement?.focus({ preventScroll: true })
    return () => {
      // 라우트 전환 커밋까지 끝난 뒤 검사한다. 다음 overlay가 이미 열렸거나 이전 버튼이
      // 화면에서 사라졌다면 성공 이동으로 보고 포커스를 되돌리지 않는다.
      queueMicrotask(() => {
        if (!document.querySelector('[data-operation-overlay]')) {
          restoreFocusIfSafe(previousFocus, progressElement)
        }
      })
    }
  }, [previousFocus])

  return (
    <div
      ref={progressRef}
      role="group"
      aria-label={text('작업 진행 중', 'Operation in progress')}
      aria-describedby={description ? descriptionId : undefined}
      tabIndex={-1}
      data-operation-overlay
      className="ui-operation-overlay fixed inset-0 z-50 flex min-h-dvh flex-col items-center justify-center gap-4 px-5 text-center"
    >
      <div className="ui-operation-card">
        <BrandLoader fullScreen={false} label={label} />
        {description && (
          <p
            id={descriptionId}
            className="m-0 max-w-sm font-sans text-xs leading-relaxed text-muted"
          >
            {description}
          </p>
        )}
        {steps && steps.length > 0 && currentStep != null && (
          <ol className="ui-operation-steps" aria-label={text('진행 단계', 'Progress steps')}>
            {steps.map((step, index) => (
              <li
                key={`${index}-${step}`}
                aria-current={index === currentStep ? 'step' : undefined}
                data-done={index < currentStep || undefined}
              >
                <span aria-hidden="true" className="ui-operation-step-dot">
                  {index < currentStep ? '✓' : index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
