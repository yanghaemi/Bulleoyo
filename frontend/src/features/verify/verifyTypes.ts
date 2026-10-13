/**
 * V-01·V-02 응답 타입.
 *
 *   · `VerificationData`  = verify_01 `GET /api/v1/performances/{performanceId}/verification`
 *   · `CoinSupply`        = coin_01   `GET /api/v1/coin/supply`
 *
 * ⚠ 2026-09-16 실 API 연결(S15P21B204-102)에서 **손으로 옮겨 적은 응답 타입을 전부 지우고
 *   `@/shared/api/domains/*`의 도메인 타입 별칭으로 바꿨다.** 손으로 쓴 쪽은 명세를 옮겨 적는
 *   순간의 스냅샷이라 `pnpm gen:api` 이후 조용히 어긋난다 —
 *     · `releaseTx`가 `null`로 올 수 있는데 손으로 쓴 타입은 필수였다(release 전 공연에서 터진다)
 *     · `onchainCounters`에 `purchaseCount`·`refundCount`·`refundedAmount` 세 필드가 빠져 있었다
 *   매퍼(`shared/api/domains/verify`·`coin`)가 이미 "값 0"과 "필드 누락"을 구분해 좁혀 주므로
 *   화면은 좁혀진 값을 그대로 받는다. 여기서 다시 좁히지 않는다.
 *
 * features → shared 방향 import만 한다(기술 스택 §3.2). 이 파일은 그 경계의 한 겹이다.
 * 컴포넌트 파일이 아니라 타입 전용 모듈이다(Fast Refresh 규칙).
 */

export type {
  VerificationAgreement,
  VerificationContracts,
  VerificationData,
  VerificationDepositReconciliation,
  VerificationEscrowReconciliation,
  VerificationGuarantees,
  VerificationLockedRule,
  VerificationOnchainCounter,
  VerificationRecalculationInput,
  VerificationReceiptItem,
  VerificationReleaseReconciliation,
  VerificationReleaseTx,
  VerificationReleasedEvent,
  VerificationSettlementStatus,
  VerificationShare,
  VerificationTeamShare,
} from '@/shared/api/domains/verify'

export type {
  CoinInvariantName,
  /** 이름이 다르다 — 도메인은 `CoinDisplay`(§0.5 공통 `Display`)다 */
  CoinDisplay as CoinSupplyDisplay,
  CoinPerPerformanceEscrow as CoinSupplyPerPerformanceEscrow,
  CoinSupply,
  CoinSupplyInvariant,
  CoinSupplyIssuer,
} from '@/shared/api/domains/coin'
