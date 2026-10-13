/**
 * 수량 증감.
 *
 * 와이어프레임 A-03R/A-03DR의 Quantity 컨트롤 이식.
 * 상한 4는 요구사항 v6 §7.3 "1인 최대 구매 수량은 공연 단위로 4매"이며,
 * 컨트랙트 `MAX_QUANTITY_PER_ORDER = 4`와 같은 값이다(Kairos 실측 확인).
 * 상한을 넘기면 서버가 `TICKET_PURCHASE_LIMIT_EXCEEDED`(409)로 막지만,
 * 화면에서 먼저 못 넘게 한다.
 *
 * 2026-09-08 정돈 — 원·+/− 버튼이 32px(PC 36px)이라 터치 타겟 44px에 못 미쳤다.
 * 보이는 크기는 와이어프레임 그대로 두고 `after` 의사요소로 히트 영역만 6px씩 넓혔다
 * (32+12=44 · 36+12=48). 비활성 표시도 `opacity-40`에서 토큰 색으로 바꿨다 —
 * 반투명은 겹친 배경에 따라 결과가 달라져 "흐린 활성"으로 보인다.
 */

interface Props {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  /**
   * 무엇의 수량인지(팀 이름 등). 같은 화면에 스테퍼가 여러 개면 **반드시 준다** —
   * 없으면 모든 행의 버튼이 "수량 늘리기" 하나로 읽혀 낭독기 사용자가 어느 행을
   * 누르는지 알 수 없다. 스테퍼가 하나뿐이고 옆에 보이는 라벨이 있으면 생략한다.
   */
  label?: string
}

export function QuantityStepper({ value, onChange, min = 1, max = 4, label }: Props) {
  const decreaseLabel = label ? `${label} 수량 줄이기` : '수량 줄이기'
  const increaseLabel = label ? `${label} 수량 늘리기` : '수량 늘리기'
  const btn = [
    // `relative` + `after`가 44px 히트 영역이다. 보이는 원은 그대로 32/36px
    'relative flex h-8 w-8 items-center justify-center rounded-full border border-line bg-ground text-ink md:h-9 md:w-9',
    "after:absolute after:-inset-[6px] after:content-['']",
    'transition-[scale,background-color,border-color,color] duration-[160ms] ease-[cubic-bezier(.23,1,.32,1)]',
    'enabled:cursor-pointer enabled:hover:bg-ground-2 enabled:active:scale-[0.92]',
    'disabled:cursor-not-allowed disabled:border-line disabled:bg-ground disabled:text-faint',
  ].join(' ')

  return (
    <div className="flex items-center gap-3.5 md:gap-5">
      <button
        type="button"
        aria-label={decreaseLabel}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={btn}
      >
        <span aria-hidden className="text-lg leading-none">
          −
        </span>
      </button>
      <span
        aria-live="polite"
        className="min-w-5 text-center font-sans text-[15px] font-bold text-ink tabular-nums md:min-w-6 md:text-[17px]"
      >
        {value}
      </span>
      <button
        type="button"
        aria-label={increaseLabel}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className={btn}
      >
        <span aria-hidden className="text-lg leading-none">
          +
        </span>
      </button>
    </div>
  )
}
