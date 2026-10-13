/**
 * 결제 에러 코드 판정.
 *
 * 잔액 부족이 어느 코드로 오는지 아직 확정이 아니다.
 *
 * - API 명세 v6 `API-payment-01` 4xx 표는 409 `COMMON_CONFLICT` 한 줄에 잔액 부족·주문 만료·
 *   이미 서명 대기 중·멱등키 본문 불일치를 **함께** 묶었고, §16.1은 전용 코드
 *   `PAYMENT_INSUFFICIENT_BALANCE`를 "신설 제안"으로만 둔다.
 * - 그런데 응답 규격 v3 §3.8과 백엔드 `ErrorCode` enum **양쪽에 그 코드가 실재한다**(409).
 *   백엔드 `PaymentService`는 아직 스켈레톤이라 어느 쪽을 던질지 확정되지 않았다.
 *
 * 그래서 **둘 다 받는다.** 결정이 어느 쪽으로 나도 화면을 고치지 않는다.
 * 다만 `COMMON_CONFLICT`는 다른 상황과 겹치므로 호출부가 결제·주문을 함께 재조회해
 * `payment 없음 + PENDING_PAYMENT` 또는 명시적 `blockedReason`일 때만 잔액 부족으로 확정한다.
 */

import { CommonCode } from '@/shared/api/errorCodes'

export const PAYMENT_INSUFFICIENT_BALANCE = 'PAYMENT_INSUFFICIENT_BALANCE'
export const PAYMENT_ALREADY_PAID = 'PAYMENT_ALREADY_PAID'
export const TICKET_SALE_CLOSED = 'TICKET_SALE_CLOSED'

/** 잔액 부족 판정 — 전용 코드와 잠정 대체 코드를 모두 받는다. */
export function isInsufficientBalance(code: string): boolean {
  return code === PAYMENT_INSUFFICIENT_BALANCE || code === CommonCode.CONFLICT
}
