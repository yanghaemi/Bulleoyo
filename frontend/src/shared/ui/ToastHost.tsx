/** 전역 토스트가 그려지는 자리 하나. `app/providers`가 라우터 밖에 한 번 렌더한다. */

import { useSyncExternalStore } from 'react'

import { Toast } from '@/shared/ui/Toast'
import { dismissToast, getToasts, subscribeToasts } from '@/shared/ui/toastStore'

export function ToastHost() {
  const list = useSyncExternalStore(subscribeToasts, getToasts, getToasts)
  if (list.length === 0) return null

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
    >
      {list.map((item) => (
        <div key={item.id} className="pointer-events-auto w-full max-w-sm">
          <Toast
            title={item.title}
            message={item.message}
            tone={item.tone}
            onDismiss={() => dismissToast(item.id)}
          />
        </div>
      ))}
    </div>
  )
}
