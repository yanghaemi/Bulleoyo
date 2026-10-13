/** 상태 피드백 토스트. 색과 아이콘·문구를 함께 써서 상태를 색에만 의존하지 않는다. */

import type { ReactNode } from 'react'
import { useLocale } from '@/shared/i18n/useLocale'

type Tone = 'info' | 'success' | 'warning' | 'error'

const TONE: Record<Tone, { icon: string; className: string }> = {
  info: { icon: 'i', className: 'border-primary text-primary' },
  success: { icon: '✓', className: 'border-ok text-ok' },
  warning: { icon: '!', className: 'border-warning text-warning' },
  error: { icon: '×', className: 'border-danger text-danger' },
}

interface Props {
  title: string
  message?: string
  tone?: Tone
  action?: ReactNode
  onDismiss?: () => void
}

export function Toast({ title, message, tone = 'info', action, onDismiss }: Props) {
  const style = TONE[tone]
  const { text } = useLocale()
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className="ui-toast"
      data-expanded={Boolean(message || action)}
    >
      <span
        aria-hidden
        className={`ui-toast-icon flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-sans text-xs font-bold ${style.className}`}
      >
        {style.icon}
      </span>
      <div className="ui-toast-content min-w-0 flex-1">
        <p className="font-sans text-sm leading-6 font-semibold text-ink">{title}</p>
        {message && <p className="mt-1 font-sans text-xs leading-relaxed text-muted">{message}</p>}
        {action && <div className="mt-2">{action}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          aria-label={text('알림 닫기', 'Dismiss notification')}
          className="ui-toast-dismiss flex shrink-0 items-center justify-center rounded-control text-muted hover:bg-ground-2 hover:text-ink"
          onClick={onDismiss}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      )}
    </div>
  )
}

export type { Tone as ToastTone }
