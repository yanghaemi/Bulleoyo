import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'

import { ensureOptionalAccessToken, tokenStore } from '@/shared/api/client'
import { getMyMember } from '@/shared/api/domains/member'
import { useLocale } from '@/shared/i18n/useLocale'
import { qk } from '@/shared/queries/keys'
import { useStudioTodos } from '@/shared/queries/studioTodos'
import type { StudioTodoLink } from '@/shared/todos/studioTodos'
import { BellIcon } from './EditorialIcons'

/**
 * 공통 헤더 알림. 목록은 스튜디오 홈 "지금 확인할 일"과 **같은 훅·같은 규칙**이다
 * (`useStudioTodos` → `collectStudioTodos`). 두 곳의 수가 다르면 그건 버그다.
 */
export function HeaderNotifications({
  signedIn,
  itemsOverride,
}: {
  signedIn: boolean
  itemsOverride?: StudioTodoLink[]
}) {
  if (itemsOverride !== undefined) {
    return <HeaderNotificationPopover items={itemsOverride} />
  }
  if (!signedIn || !tokenStore.hasSession()) {
    return <HeaderNotificationPopover items={[]} />
  }
  return <LiveHeaderNotifications />
}

/** 쿼리 훅은 실제 세션이 있을 때만 마운트한다. 랩·정적 테스트는 QueryClient가 없어도 된다. */
function LiveHeaderNotifications() {
  const member = useQuery({
    queryKey: qk.member.me(),
    queryFn: async ({ signal }) => {
      const ready = await ensureOptionalAccessToken()
      if (!ready) throw new Error('OPTIONAL_SESSION_UNAVAILABLE')
      return getMyMember({ signal, silentAuthFailure: true })
    },
    retry: false,
    staleTime: 5 * 60_000,
  })
  const isPerformer = member.data?.roles?.includes('PERFORMER') ?? false
  const todos = useStudioTodos({ enabled: isPerformer })
  const loading = member.isPending || todos.isPending
  const failed = member.isError || (isPerformer && todos.isError)
  return (
    <HeaderNotificationPopover
      items={todos.todos}
      loading={loading}
      failed={failed}
      onRetry={() => {
        void member.refetch()
        if (isPerformer) todos.refetch()
      }}
    />
  )
}

function HeaderNotificationPopover({
  items,
  loading = false,
  failed = false,
  onRetry,
}: {
  items: StudioTodoLink[]
  loading?: boolean
  failed?: boolean
  onRetry?: () => void
}) {
  const { text } = useLocale()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') {
          setOpen(false)
          triggerRef.current?.focus()
        }
      } else if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const countLabel = items.length > 99 ? '99+' : String(items.length)
  const buttonLabel = items.length
    ? text(`확인할 알림 ${items.length}개`, `${items.length} notifications to review`)
    : text('알림', 'Notifications')

  return (
    <div ref={rootRef} className="identity-header__notifications">
      <button
        ref={triggerRef}
        type="button"
        aria-label={buttonLabel}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((previous) => !previous)}
      >
        <BellIcon />
        {items.length > 0 && (
          <span className="identity-header__notification-count" aria-hidden>
            {countLabel}
          </span>
        )}
      </button>
      {open && (
        <section
          id={panelId}
          className="identity-header__notification-panel"
          aria-labelledby={`${panelId}-title`}
        >
          <div className="identity-header__notification-head">
            <h2 id={`${panelId}-title`}>{text('확인할 일', 'Notifications')}</h2>
            {items.length > 0 && <span>{text(`${items.length}개`, `${items.length}`)}</span>}
          </div>
          {loading ? (
            <p className="identity-header__notification-state" role="status">
              {text('알림을 확인하고 있어요…', 'Checking notifications…')}
            </p>
          ) : failed ? (
            <div className="identity-header__notification-state" role="alert">
              <p>{text('알림을 불러오지 못했어요.', 'Could not load notifications.')}</p>
              <button type="button" onClick={onRetry}>
                {text('다시 시도', 'Try again')}
              </button>
            </div>
          ) : items.length === 0 ? (
            <p className="identity-header__notification-state">
              {text('새로 확인할 일이 없어요.', 'Nothing needs your attention.')}
            </p>
          ) : (
            <ul className="identity-header__notification-list">
              {items.map((item) => (
                <li key={item.id} data-todo-id={item.id}>
                  <Link to={item.to} onClick={() => setOpen(false)}>
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                    <span aria-hidden>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
