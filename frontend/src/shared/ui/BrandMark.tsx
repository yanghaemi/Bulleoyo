/**
 * 불러요 심볼 — 티켓 스텁.
 *
 * `BrandLogo`(가로 로고)에서 **떼어 가는 스텁만** 잘라낸 것이다. 그 안에 '요' 한 글자가 있다.
 * 앱 아이콘·파비콘·프로필처럼 정사각 자리에 쓴다.
 *
 * ── 왜 스텁이 심볼인가 ─────────────────────────────────────────────
 * 가로 로고는 몸통에 **불러**, 스텁에 **요**가 찍혀 있다. 티켓을 찢으면 이름이 갈라지고,
 * 관객이 손에 쥐는 쪽이 스텁이다. 그 조각 하나가 서비스를 대신한다.
 *
 * 홈이 파여 있어 **글자만 있을 때와 달리 티켓으로 읽힌다.** 앞선 시안에서 '요'를 도형으로만
 * 그렸을 때는 지도 핀처럼 보였는데, 티켓 실루엣이 문맥을 잡아 주면서 글자로 돌아왔다.
 * 홈을 지우면 그냥 둥근 사각형이 된다 — 그때 티켓이라는 신호가 통째로 사라진다.
 *
 * ⚠ 글자는 SVG `<text>`라 **보는 사람 기기의 글꼴로 렌더된다.** 로고를 확정하면 패스로 따서
 * 박아야 한다. 지금은 시연 단계라 텍스트로 둔다 — 화면 낭독기가 읽고, 이름이 바뀌어도 따라온다.
 */

interface Props {
  /** 한 변 길이(px). 기본 28 */
  size?: number
  className?: string
}

/** 위아래 반원 홈이 있는 세로 스텁. 홈이 티켓의 표식이다 */
const STUB =
  'M12 6h40a6 6 0 0 1 6 6v10a6 6 0 0 0 0 12v18a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6V34a6 6 0 0 0 0-12V12a6 6 0 0 1 6-6Z'

export function BrandMark({ size = 28, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="불러요"
      className={className}
    >
      <path d={STUB} fill="var(--color-sel)" />
      <text
        x="32"
        y="44"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        fontWeight="800"
        fontSize="30"
        fill="var(--color-ground)"
      >
        요
      </text>
    </svg>
  )
}
