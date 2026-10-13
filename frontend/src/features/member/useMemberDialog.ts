import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { restoreFocusIfSafe, trapFocus } from '@/shared/ui/focusTrap'

/** The picker and profile sheet share the same keyboard and scroll behavior. */
export function useMemberDialog(open: boolean, onClose: () => void, initialFocus: RefObject<HTMLInputElement | null>) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    const dialog = dialogRef.current
    document.body.style.overflow = 'hidden'
    initialFocus.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
      } else if (dialog) trapFocus(event, dialog)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      restoreFocusIfSafe(previousFocus, dialog)
    }
  }, [open, initialFocus])

  return dialogRef
}
