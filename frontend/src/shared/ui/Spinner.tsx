/**
 * 진행 표시 스피너.
 *
 * 와이어프레임의 원형 스피너 이식. `prefers-reduced-motion`에서는 회전이 멈춘다
 * (styles.css의 전역 규칙이 애니메이션을 0.01ms로 줄인다).
 * 색만으로 알리지 않도록 항상 라벨과 함께 쓴다.
 */

export function Spinner({ size = 36 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block animate-spin rounded-full border-[3px] border-line border-t-primary"
      style={{ width: size, height: size }}
    />
  )
}
