/**
 * A-13·C-05가 쓰는 **표시 변환과 실패 분류.**
 *
 * 요청·캐시는 `@/shared/queries/wallet`(MR !91)이 한다. 그 뷰모델(`WalletTransactionView`)에는
 * 서버가 주지 않는 표시 문자열(행 시각·환산·이동 경로)이 없고, 409를 가르는 규칙도 없다 —
 * 여기 남는 것은 그 둘뿐이다.
 */

import { isApiError } from '@/shared/api/client'
import { CommonCode } from '@/shared/api/errorCodes'
import type { WalletRateView, WalletTransactionView } from '@/shared/api/domains/wallet'
import { formatApprox } from '@/features/member/localeOptions'
import { formatKst } from '@/shared/ui'

import type { OnboardingError } from './WalletOnboarding'
import type { WalletTx } from './WalletScreen'

/**
 * 응답 항목 → A-13 행. 서버가 주지 않는 **표시 문자열만** 여기서 만든다.
 *
 * · `occurredAtLabel` — §5.13 표기. 묶음 머리글과 같은 시간대로 만들어야 하므로 회원 시간대를 받는다
 * · `approxLabel`     — 루트 `rate`로 환산한다. **행마다 다시 계산하지 않는다**(§5.4 — 표시 전용)
 * · `linkTo`          — 주문에서 온 행만 A-12로 보낸다. 그 밖은 이동할 곳이 없다
 *
 * 종류·방향·상태·시각이 없는 행은 그릴 수 없어 `null`을 돌려준다(호출부가 건너뛴다).
 * 명세상 항상 오는 값이라 실제로는 걸리지 않지만, 없는 값을 기본값으로 지어내지 않는다.
 */
export function toWalletTx(
  item: WalletTransactionView,
  rate: WalletRateView | null | undefined,
  timeZone: string,
): WalletTx | null {
  if (!item.type || !item.direction || !item.status || !item.occurredAt) return null
  return {
    walletTxId: item.walletTxId,
    type: item.type,
    direction: item.direction,
    amount: item.amount,
    status: item.status,
    title: item.title ?? '',
    occurredAt: item.occurredAt,
    occurredAtLabel: formatKst(item.occurredAt, timeZone),
    approxLabel: approxLabel(item.amount, rate),
    linkTo: item.refType === 'ORDER' && item.refId != null ? `/orders/${item.refId}` : undefined,
  }
}

/**
 * `1 rate.currency = rate.rate KRW`(§0.5). 환율이 없으면 환산 자체를 보여주지 않는다.
 *
 * 표기는 `formatApprox` 하나로 모은다 — 여기서 Intl `narrowSymbol` 을 따로 쓰고 있었는데,
 * 같은 A-13 화면의 잔액은 `formatApprox` 를 쓴다. 두 포매터가 통화 목록 밖 통화에서 갈려
 * (한쪽은 기호 없이, 한쪽은 Intl 기호로) 한 화면에 두 표기가 섞였다. 계산만 여기서 한다.
 */
export function approxLabel(
  amountKrw: number,
  rate: WalletRateView | null | undefined,
): string | undefined {
  if (!rate || !(rate.rate > 0)) return undefined
  return formatApprox(rate.currency, amountKrw / rate.rate)
}

/**
 * `CONFLICT`는 **화면이 더 알아봐야 하는 상태**다 — 409 하나에 "이미 등록됨"과
 * "챌린지 만료·재사용"이 함께 들어 있어 코드만으로 나뉘지 않는다(둘 다 `COMMON_CONFLICT`).
 * 전용 코드 `WALLET_ALREADY_LINKED`·`WALLET_CHALLENGE_EXPIRED`는 §16.1 제안 단계이며
 * 실측(2026-09-13) 백엔드는 둘 다 `COMMON_CONFLICT`로 답한다. 서버가 전용 코드를 쓰기 시작해도
 * 아래 매핑이 그대로 받는다. 사유는 S15P21B204-93에 있다.
 */
export type OnboardingFailure = OnboardingError | 'CONFLICT'

export function onboardingErrorOf(error: unknown): OnboardingFailure | undefined {
  if (!isApiError(error)) return undefined // 지갑 팝업 거부·네트워크 — 화면이 일반 실패로 처리한다
  switch (error.code) {
    case 'WALLET_SIGNATURE_INVALID':
      return 'WALLET_SIGNATURE_INVALID'
    // `COMMON_VALIDATION_FAILED`(400)를 여기 함께 두었었다. 그러면 주소 형식 오류·필수값
    // 누락 같은 평범한 400 까지 "다른 지갑으로 서명했을 수 있어요"로 보여, 사용자가 같은
    // 서명을 계속 다시 한다. 전용 코드일 때만 서명 실패로 보고, 그 밖의 400 은 아래
    // `default` 로 흘려보내 **서버 `msg` 를 그대로** 띄운다(호출부가 넘긴다).
    case 'WALLET_CHALLENGE_EXPIRED':
      return 'WALLET_CHALLENGE_EXPIRED'
    case 'WALLET_ALREADY_LINKED':
    case CommonCode.CONFLICT:
      return 'CONFLICT'
    case CommonCode.EXTERNAL_SERVICE_ERROR:
      return 'COMMON_EXTERNAL_SERVICE_ERROR'
    default:
      return undefined
  }
}
