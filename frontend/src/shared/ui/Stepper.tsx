/**
 * 예매 단계 표시기.
 *
 * 와이어프레임 `RStepper` 이식 + 수정 요청 §11("Payment 화면에만 있던 Stepper를 예매 과정
 * 전체의 공통 상단 영역으로 이동. A-03~A-05가 같은 위치·크기를 쓴다").
 *
 * ⚠ 화면설계 v6 §5 공통 컴포넌트 목록에 Stepper가 **없다.** 와이어프레임에서 새로 들어온
 * 요소라 명세 추가 대상이다(결정요청 문서에 기록).
 *
 * 색 규칙(수정 요청 §색상변경) — 완료·현재 단계는 배경색으로만 구분하고 Outline을 쓰지 않는다.
 *   완료: #D9468D 채움 + 흰 체크 / 현재: #D9468D 채움 / 이후: 회색 배경
 * 접근성 — 색만으로 구분하지 않도록 숫자·체크와 단계 라벨을 항상 함께 쓴다.
 *
 * 2026-09-08 정돈 — 단계를 넘길 때 원과 연결선 색이 한 프레임에 튀었다. 색에만 150ms
 * 전환을 걸었다(크기·위치는 건드리지 않아 라벨이 흔들리지 않는다). 숫자는 `tabular-nums`다.
 */

import { Fragment } from 'react'
import { useLocale } from '@/shared/i18n/useLocale'

export const BOOKING_STEPS = ['Tickets', 'Team', 'Review', 'Pay'] as const

interface Props {
  steps: readonly string[]
  /** 0-base 현재 단계 */
  active: number
}

export function Stepper({ steps, active }: Props) {
  const { text, language } = useLocale()
  const bookingLabels: Record<string, string> = {
    Tickets: '티켓 선택',
    Team: '팀 선택',
    Review: '주문 확인',
    Pay: '결제',
  }
  return (
    <ol
      className="ui-stepper mb-6 flex items-start"
      aria-label={text(
        `단계 ${active + 1} / ${steps.length}`,
        `Step ${active + 1} of ${steps.length}`,
      )}
    >
      {steps.map((step, i) => {
        const done = i < active
        const current = i === active
        return (
          <Fragment key={step}>
            <li
              className="ui-stepper-step flex shrink-0 flex-col items-center gap-1.5"
              data-done={done || undefined}
              aria-current={current ? 'step' : undefined}
            >
              <span
                className={[
                  'flex h-7 w-7 items-center justify-center rounded-full font-sans text-[10px] font-bold tabular-nums',
                  'transition-colors duration-150 ease-out',
                  done || current ? 'bg-sel text-white' : 'bg-ground-2 text-muted',
                ].join(' ')}
              >
                {done ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path
                      d="M2.5 6l3 3L9.5 3"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={[
                  'whitespace-nowrap font-sans text-[9px] transition-colors duration-150 ease-out md:text-[11px]',
                  current ? 'font-semibold text-sel' : 'text-muted',
                ].join(' ')}
              >
                {language === 'ko' ? (bookingLabels[step] ?? step) : step}
              </span>
            </li>
            {i < steps.length - 1 && (
              <li
                aria-hidden
                className={`mx-1 mt-[13px] h-[1.5px] flex-1 transition-colors duration-150 ease-out ${
                  done ? 'bg-sel' : 'bg-line'
                }`}
              />
            )}
          </Fragment>
        )
      })}
    </ol>
  )
}
