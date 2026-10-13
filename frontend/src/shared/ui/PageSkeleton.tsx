import { useLocale } from '@/shared/i18n/useLocale'

type Variant = 'home' | 'list' | 'detail' | 'form' | 'dashboard' | 'tickets'

interface Props {
  variant?: Variant
  label?: string
}

function Lines() {
  return (
    <div className="ui-skeleton-lines">
      <i />
      <i />
      <i />
    </div>
  )
}

/** Preserve the next screen's structure while its real data is loading. */
export function PageSkeleton({ variant = 'list', label }: Props) {
  const { text } = useLocale()
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`ui-page-skeleton ui-page-skeleton--${variant}`}
    >
      <span className="sr-only">
        {label ?? text('화면을 불러오고 있어요', 'Loading this page')}
      </span>
      <div aria-hidden="true" className="ui-page-skeleton-content">
        <div className="ui-skeleton-heading">
          <i />
          <i />
        </div>
        {variant === 'home' && (
          <div className="ui-skeleton-hero">
            <Lines />
          </div>
        )}
        {variant === 'detail' ? (
          <div className="ui-skeleton-detail">
            <div className="ui-skeleton-poster" />
            <div className="ui-skeleton-panel">
              <Lines />
              <Lines />
              <div className="ui-skeleton-action" />
            </div>
          </div>
        ) : variant === 'form' ? (
          <div className="ui-skeleton-panel ui-skeleton-form">
            <Lines />
            <Lines />
            <Lines />
            <div className="ui-skeleton-action" />
          </div>
        ) : (
          <div className="ui-skeleton-grid">
            {Array.from({ length: variant === 'dashboard' ? 3 : 4 }, (_, index) => (
              <div key={index} className="ui-skeleton-panel">
                {variant !== 'dashboard' && <div className="ui-skeleton-poster" />}
                <Lines />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
