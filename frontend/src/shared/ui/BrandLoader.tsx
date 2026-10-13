import { AnimatedBrandLogo } from '@/shared/ui/AnimatedBrandLogo'
import { Spinner } from '@/shared/ui/Spinner'
import { useLocale } from '@/shared/i18n/useLocale'

interface Props {
  label?: string
  fullScreen?: boolean
}

/** 라우트 청크를 기다리는 동안만 표시한다. 애니메이션을 위해 대기를 인위적으로 늘리지 않는다. */
export function BrandLoader({ label, fullScreen = true }: Props) {
  const { text } = useLocale()
  return (
    <div
      role="status"
      aria-live="polite"
      className={fullScreen ? 'ui-brand-loader ui-brand-loader--full' : 'ui-brand-loader'}
    >
      <div className="ui-brand-loader__brand">
        <AnimatedBrandLogo mode="loader" height={42} />
      </div>
      <Spinner size={42} />
      <span className="ui-brand-loader__label">
        {label ?? text('화면을 불러오고 있어요', 'Getting things ready')}
      </span>
    </div>
  )
}
