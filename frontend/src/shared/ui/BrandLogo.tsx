/**
 * 불러요 로고 — 이름이 찍힌 티켓.
 *
 * ── 무엇을 그렸나 ────────────────────────────────────────────────
 * 가로 티켓 한 장이다. 몸통에는 **불러**만 찍혀 있고, 떼어 가는 스텁이 **요**다.
 * 티켓을 찢으면 이름이 갈라진다 — 우리가 하는 일이 한 장을 여러 몫으로 나누는 일이라
 * 형태와 뜻이 같은 곳을 가리킨다.
 *
 * 절취선 자리를 색으로 표시한다(몸통 primary, 스텁 sel). 위아래 반원 홈이 티켓의 표식이고,
 * 이것만 있으면 한눈에 티켓으로 읽힌다 — 홈을 안 파면 그냥 둥근 사각형이 된다(시안 5차에서 확인).
 *
 * ── 왜 이 형태가 됐나 ───────────────────────────────────────────
 * 앞선 시안에서 버린 것들 —
 *   · 한글 '요' 한 글자만 기하 도형으로: 지도 핀으로 읽혔다
 *   · 원 + 그 아래 넓은 도형(조명·무대·티켓 안의 빛): **전부 사람 아이콘**이 됐다.
 *     원을 넓은 도형 위에 얹으면 머리와 몸통으로 읽힌다. 이 조합은 쓰지 마라.
 *   · 원을 조각낸 마크: 로딩 스피너로 읽혔다
 * 남은 답이 "티켓 모양을 정직하게 그리고 이름을 얹는 것"이었다.
 *
 * ── 글꼴 ────────────────────────────────────────────────────────
 * ⚠ SVG `<text>`라서 **보는 사람 기기의 글꼴로 렌더된다.** 기기마다 자소 폭이 조금씩 다르다.
 * 로고를 확정하면 이 글자를 패스로 따서 박아야 한다(그래야 어디서나 같은 모양이 된다).
 * 지금은 시연 단계라 텍스트로 둔다 — 이름이 바뀌어도 바로 따라오고, 화면 낭독기가 읽는다.
 */

interface Props {
  /** 높이(px). 가로는 비율대로 따라간다. 기본 28 */
  height?: number
  /** `torn`이면 스텁이 살짝 떨어져 있다(막 찢은 상태) */
  variant?: 'whole' | 'torn'
  className?: string
}

/** 절취선 홈이 x=116에 있는 가로 티켓. 위아래에 반원 홈이 하나씩 */
const TICKET =
  'M10 8H104a8 8 0 0 0 16 0h38a6 6 0 0 1 6 6v44a6 6 0 0 1-6 6h-38a8 8 0 0 0-16 0H10a6 6 0 0 1-6-6V14a6 6 0 0 1 6-6Z'

export function BrandLogo({ height = 28, variant = 'whole', className }: Props) {
  const torn = variant === 'torn'
  const bodyShift = torn ? -3 : 0
  const stubShift = torn ? 6 : 0
  const uid = variant

  return (
    <svg
      height={height}
      width={(height * 168) / 72}
      viewBox="0 0 168 72"
      fill="none"
      role="img"
      aria-label="불러요"
      className={className}
    >
      <defs>
        {/* 몸통과 스텁을 절취선(x=116)에서 자른다. 두 조각이 같은 실루엣을 공유해야
            찢어진 자리가 정확히 맞물린다 */}
        <clipPath id={`blg-body-${uid}`}>
          <rect x="-20" y="-20" width="136" height="112" />
        </clipPath>
        <clipPath id={`blg-stub-${uid}`}>
          <rect x="116" y="-20" width="80" height="112" />
        </clipPath>
      </defs>

      <g clipPath={`url(#blg-body-${uid})`}>
        <path
          d={TICKET}
          fill="var(--effect-primary-bright)"
          transform={`translate(${bodyShift} 0)`}
        />
      </g>
      <g clipPath={`url(#blg-stub-${uid})`}>
        <path d={TICKET} fill="var(--color-sel)" transform={`translate(${stubShift} 0)`} />
      </g>

      {/* 글자는 티켓 위에 인쇄된 것이라 바탕색(ground)으로 뚫는다 — 흰색을 박으면
          다크 테마에서 티켓만 어두워지고 글자가 붕 뜬다 */}
      <text
        x={56 + bodyShift}
        y="47"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        fontWeight="800"
        fontSize="32"
        letterSpacing="-1"
        fill="var(--color-ground)"
      >
        불러
      </text>
      <text
        x={141 + stubShift}
        y="47"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        fontWeight="800"
        fontSize="32"
        fill="var(--color-ground)"
      >
        요
      </text>
    </svg>
  )
}
