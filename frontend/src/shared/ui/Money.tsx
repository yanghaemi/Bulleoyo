/**
 * 금액 표기.
 *
 * 화면설계 v6 §1.2 원칙 3 · §5.4 —
 *   YoYo 값(정수, 천 단위 구분, `10,000 YoYo`)을 **항상 먼저** 쓰고, 표시 통화가 기준(KRW 코드)이 아니면
 *   `≈`로 병기한다. 환산은 표시 전용이며 요청에 실리는 값은 언제나 YoYo 정수다.
 *   2026-09-24 — ₩·KRW 표기 폐기, YoYo 표기로 통일(화면설계 v8.4).
 *
 * ⚠ §5.4는 "API 응답의 `display` 객체를 그대로 쓰고 클라이언트가 환율을 재계산하지 않는다"고
 * 정했지만, A-03 합계처럼 **주문 생성 전** 화면은 서버가 `display`를 줄 수 없어 클라이언트가
 * 계산할 수밖에 없다. 그 예외를 명세에 반영해야 한다(결정요청 문서에 기록).
 *
 * 2026-09-08 정돈 — 금액에 `tabular-nums`를 걸었다. 목록에서 세로로 쌓이는 금액이
 * 비례폭 숫자라 자릿수가 어긋나 보였다. 크기·색·병기 규칙은 그대로다.
 */

import { formatYoyo } from '@/shared/ui/format'

interface Props {
  /** YoYo 정수 */
  amount: number
  /** 표시 통화 환산 문자열. 없으면 병기하지 않는다 */
  approx?: string
  /** 크게 강조 */
  strong?: boolean
  className?: string
}

export function Money({ amount, approx, strong, className = '' }: Props) {
  return (
    <span className={className}>
      <span className={`font-sans tabular-nums ${strong ? 'font-bold' : ''}`}>
        {formatYoyo(amount)}
      </span>
      {approx && (
        <span className="ml-1 font-sans text-[10px] font-normal text-muted md:text-xs">
          ≈ {approx}
        </span>
      )}
    </span>
  )
}
