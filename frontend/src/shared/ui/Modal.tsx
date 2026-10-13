/**
 * 범용 모달.
 *
 * 모바일에서는 하단 시트, 768px 이상에서는 중앙 다이얼로그로 표시한다.
 * Escape·배경 클릭으로 닫을 수 있고, 열린 동안 포커스와 배경 스크롤을 모달 안에 가둔다.
 * 닫히면 열기 직전에 포커스가 있던 요소로 되돌린다.
 * 비가역 액션 확인은 이 컴포넌트보다 의도가 좁은 `ConfirmDialog`를 사용한다.
 */

import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

import { restoreFocusIfSafe, trapFocus } from '@/shared/ui/focusTrap'
import { useLocale } from '@/shared/i18n/useLocale'

interface Props {
  open: boolean
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
}

export function Modal({ open, title, description, children, footer, onClose }: Props) {
  const { text } = useLocale()
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()
  const descriptionId = useId()
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return

    const previouslyFocusedElement = document.activeElement as HTMLElement | null
    const previousBodyOverflow = document.body.style.overflow
    const dialogElement = dialogRef.current
    document.body.style.overflow = 'hidden'
    dialogElement?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      const dialog = dialogRef.current
      if (!dialog) return
      trapFocus(event, dialog)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousBodyOverflow
      restoreFocusIfSafe(previouslyFocusedElement, dialogElement)
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label={text('모달 닫기', 'Close dialog')}
        className="absolute inset-0 h-full w-full bg-black/65"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="relative max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-t-card bg-surface p-5 shadow-xl md:w-[440px] md:rounded-card md:p-6"
      >
        <div aria-hidden className="mx-auto mb-4 h-1 w-9 rounded-full bg-line md:hidden" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="font-sans text-lg font-bold text-ink">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 font-sans text-sm leading-relaxed text-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label={text('닫기', 'Close')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-xl text-muted hover:bg-ground-2 hover:text-ink"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="mt-5">{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}
