interface IconProps {
  size?: number
  className?: string
}

/** 중앙 포스터와 양옆 포스터가 보이는 실제 포스터 탐색 형태를 축약한다. */
export function PosterViewIcon({ size = 22, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
    >
      <rect x="8" y="3" width="8" height="18" rx="1.7" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M5.8 6.2H4.7A1.7 1.7 0 0 0 3 7.9v8.2a1.7 1.7 0 0 0 1.7 1.7h1.1M18.2 6.2h1.1A1.7 1.7 0 0 1 21 7.9v8.2a1.7 1.7 0 0 1-1.7 1.7h-1.1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path d="M10.5 17.6h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

/** 작은 포스터와 두 줄의 정보가 반복되는 실제 목록 형태를 축약한다. */
export function ListViewIcon({ size = 22, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
    >
      {[4, 10, 16].map((y) => (
        <g key={y}>
          <rect x="3" y={y} width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.6" />
          <path
            d={`M10 ${y + 1}h11M10 ${y + 3}h7`}
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </g>
      ))}
    </svg>
  )
}

export function SearchIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={className}
    >
      <circle cx="8.8" cy="8.8" r="5.3" stroke="currentColor" strokeWidth="1.6" />
      <path d="m12.8 12.8 3.8 3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function BellIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="M4.6 13.2h10.8l-1.2-1.8V8.3a4.2 4.2 0 0 0-8.4 0v3.1l-1.2 1.8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8.2 15.4a2 2 0 0 0 3.6 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function ChevronIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="m6.8 8 3.2 3.2L13.2 8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ArrowRightIcon({ size = 18, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="M4 10h11.2M11.2 6l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 큰 별 하나와 작은 별 하나 — "골라 준 목록"(맞춤 추천)을 표시하는 작은 표식이다. */
export function SparkleIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="M8.5 3.5l1.4 3.6 3.6 1.4-3.6 1.4-1.4 3.6-1.4-3.6-3.6-1.4 3.6-1.4 1.4-3.6z"
        fill="currentColor"
      />
      <path d="M15 12l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" fill="currentColor" />
    </svg>
  )
}
