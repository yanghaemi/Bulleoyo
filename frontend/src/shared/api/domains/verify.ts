/**
 * verify 도메인 — 정산 검증 데이터(V-01).
 *
 * 정본 · `docs/design/api/openapi.yaml` operationId `verify_01`
 *        `docs/design/06_API_명세서_v6.md` API-verify-01(4904행~)
 *        화면 V-01 정산 검증
 *
 * ───────────────────── 이 화면의 숫자가 방어선이다 ─────────────────────
 * V-01의 목적은 "서버 표시값을 믿지 말고 브라우저가 스스로 재계산하라"다. 그래서 이 매퍼는
 * **값을 만들지도, 고치지도, 서로 빼지도 않는다.** 서버가 준 것을 단위만 지켜 옮긴다.
 *
 * ⚠ **`onchainCounters`의 세 카운터는 단위가 서로 다르다**(명세 `VerificationOnchainCounter`
 *   description · 2026-09-09 팀 지시). 나란히 오기 때문에 합이 맞을 거라고 착각하기 쉽다.
 *
 *     choiceCount    티켓 수(Σ quantity). 환불 이력이 있는 주문의 표는 **전량 제외**
 *     purchaseCount  주문 수. 환불 이력이 있는 주문도 **포함**
 *     refundCount    주문 수. 티켓 3장 중 2장만 환불해도 **1**
 *     refundedAmount YoYo 정수. 유일한 **금액** 필드
 *
 *   따라서 `purchaseCount − refundCount = choiceCount`는 **성립하지 않는다.** 정상 상태에서도
 *   어긋나므로 검산식을 넣으면 **없는 오류를 만들어 낸다.** 이 파일에도, 화면에도 넣지 않는다.
 *   표에는 네 값을 그대로 나란히 놓고 단위를 라벨로 밝힌다.
 *
 * ⚠ `stale: true`면 서버가 붙인 `matched`는 **지금 체인 상태가 아니라 마지막으로 읽은 값** 기준이다.
 *   화면은 이때 대조 결과를 단정하지 않는다("판정 불가"). 명세가 사유(Redis 장애 / 체인 조회 지연)를
 *   구분해 주지 않아 이 계층도 구분할 수 없다 — 산출 문서의 "명세 미결" 항목에 올렸다.
 *
 * 에러 code → 화면 문구 매핑은 `features/verify/verifyErrors.ts`가 정본이다. 여기서 중복 정의하지 않는다.
 */

import { api } from '@/shared/api/client'
import { int, list, nullableInt, nullableText, text } from '@/shared/api/domains/_mapper'
import type { ApiData } from '@/shared/api/schema'

/* ============================ 생성 타입 별칭 ============================ */

type VerificationResponse = ApiData<'verify_01'>
type ContractsResponse = NonNullable<VerificationResponse['contracts']>
type LockedRuleResponse = NonNullable<VerificationResponse['lockedRule']>
type TeamShareResponse = NonNullable<NonNullable<LockedRuleResponse['raw']>['teamShares']>[number]
type AgreementResponse = NonNullable<VerificationResponse['agreements']>[number]
type CounterResponse = NonNullable<VerificationResponse['onchainCounters']>[number]
type RecalculationInputResponse = NonNullable<VerificationResponse['recalculationInput']>
type ShareResponse = NonNullable<VerificationResponse['shares']>[number]
type EscrowReconciliationResponse = NonNullable<VerificationResponse['escrowReconciliation']>
type ReleaseReconciliationResponse = NonNullable<VerificationResponse['releaseReconciliation']>
type ReleasedEventResponse = NonNullable<ReleaseReconciliationResponse['releasedEvents']>[number]
type DepositReconciliationResponse = NonNullable<VerificationResponse['depositReconciliation']>
type ReceiptItemResponse = NonNullable<VerificationResponse['receiptSummary']>[number]
type ReleaseTxResponse = NonNullable<VerificationResponse['releaseTx']>
type GuaranteesResponse = NonNullable<VerificationResponse['guarantees']>

/* ============================== 도메인 타입 ============================== */

export type VerificationSettlementStatus = NonNullable<VerificationResponse['settlementStatus']>
export type VerificationSignerType = NonNullable<AgreementResponse['signerType']>

/** 주소는 화면에서 §5.3 규칙으로 축약한다. 여기서는 원문 그대로 둔다 */
export interface VerificationContracts {
  tokenAddress: string
  /** enum [YoYo] */
  tokenSymbol: string
  /** enum [0] — YoYo는 원 정수라 소수가 없다 */
  tokenDecimals: number
  revenueSplitter: string
  /** 예: `https://kairos.kaiascan.io` */
  explorerBaseUrl: string
}

/** 팀별 고정 풀 배분 비율(basis point, 10000 = 100%) */
export interface VerificationTeamShare {
  teamId: number
  shareBp: number
}

/** 잠금 당시 규칙 원문(해시 입력값). 온체인 해시와 대조한다 */
export interface VerificationLockedRule {
  rulesHash: string
  raw: {
    performanceId: number
    fixedRatioBp: number
    selectionRatioBp: number
    teamShares: VerificationTeamShare[]
    hostTeamId: number
  }
  onchainRulesHash: string
  /**
   * 서버 해시 = 온체인 해시 여부.
   *
   * ⚠ 필드가 없으면 **false**로 둔다. 대조 결과를 모르는 상태를 "일치"라고 말하면
   *   이 화면의 존재 이유가 사라진다(다른 곳의 기본값 정책과 반대인 이유가 이것이다).
   */
  hashMatched: boolean
  lockedAt: string
  startSaleTxHash: string
}

/** 팀별 동의 tx 한 줄 */
export interface VerificationAgreement {
  teamId: number
  teamName: string
  walletAddress: string
  onchainAgreed: boolean | null
  /** OPERATOR = 서버 키 / USER = 사용자 지갑 서명 + 대납 */
  signerType: VerificationSignerType
  txHash: string
  agreedAt: string
}

/**
 * 온체인 카운터 한 줄. **네 값의 단위가 다르다**(파일 상단 경고 참조).
 * 서로 더하거나 빼지 않는다 — 파생 필드를 만들지 않는 것이 이 타입의 설계다.
 */
export interface VerificationOnchainCounter {
  teamId: number
  /** `createShow` 시점 참여팀 순서. 온체인 인자로 그대로 쓰인다 */
  teamIndex: number
  /** **단위: 티켓 수**(Σ quantity). 환불 이력 주문의 표는 전량 제외된다 */
  choiceCount: number | null
  /** **단위: 주문 수**. 환불 이력이 있는 주문도 포함한다 */
  purchaseCount: number
  /** **단위: 주문 수**(COUNT DISTINCT order). 부분 환불도 1로 센다 */
  refundCount: number
  /** **단위: YoYo 정수**. 이 줄에서 유일한 금액이다 */
  refundedAmount: number
}

/** 이 값들만으로 `shares`가 재현되어야 한다(PERF-07 재계산 ≤ 2초) */
export interface VerificationRecalculationInput {
  grossRevenueAmount: number
  refundedAmount: number
  netRevenueAmount: number
  distributableAmount: number | null
  fixedRatioBp: number
  selectionRatioBp: number
  teamShares: VerificationTeamShare[]
  participantCount: number
  /** **단위: 티켓 수** — `onchainCounters[].choiceCount`의 합 */
  totalChoiceCount: number
  /** 예: `FLOOR_TO_INTEGER_KRW` */
  roundingRule: string
  /** 예: `ASSIGN_DUST_TO_HOST_TEAM` */
  remainderRule: string
  hostTeamId: number
  dustAmount: number
  tokenDecimals: number
  currency: string
}

/** 팀별 산출액 한 줄(금액 전부 YoYo 정수) */
export interface VerificationShare {
  teamId: number
  teamName: string
  fixedAmount: number
  choiceAmount: number
  dustAmount: number
  totalAmount: number
}

/** 불변식 ② `escrowOf(showId) = Σpurchase − Σrefund − Σrelease` (보증금 별도 계정) */
export interface VerificationEscrowReconciliation {
  purchasedTotal: number
  refundedTotal: number
  releasedTotal: number | null
  escrowBalanceOnchain: number | null
  expectedEscrowBalance: number | null
  matched: boolean | null
  note: string
}

export interface VerificationReleasedEvent {
  teamWallet: string
  amount: number
}

/** 불변식 ③ — dust 포함 1원 오차 0 */
export interface VerificationReleaseReconciliation {
  releasedEventTotal: number | null
  recalculatedTotal: number | null
  difference: number | null
  matched: boolean | null
  releasedEvents: VerificationReleasedEvent[]
}

/** 보증금 대사. 에스크로와 **별도 계정**이다 */
export interface VerificationDepositReconciliation {
  amount: number
  /** `UNPAID` / `PAID` / `RETURNED` — 스키마가 문자열이라 좁히지 않는다 */
  status: string
  paidTxHash: string
  returnTxHash: string
  matched: boolean | null
}

/** release 확정이 곧 수령이라 이 값이 종단 정보다 */
export interface VerificationReceiptItem {
  teamId: number
  walletAddress: string
  receivedAmount: number
  received: boolean
  receivedAt: string | null
}

export interface VerificationReleaseTx {
  txHash: string
  explorerUrl: string
  releasedAt: string
}

/** 보장하지 않는 것을 함께 적는다(정직성 규칙) */
export interface VerificationGuarantees {
  guaranteed: string[]
  notGuaranteed: string[]
}

/** verify_01 200 `data` */
export interface VerificationData {
  performanceId: number
  performanceTitle: string
  performedAt: string
  settlementStatus: VerificationSettlementStatus
  network: string
  chainId: number
  contracts: VerificationContracts
  lockedRule: VerificationLockedRule
  agreements: VerificationAgreement[]
  onchainCounters: VerificationOnchainCounter[]
  recalculationInput: VerificationRecalculationInput
  shares: VerificationShare[]
  escrowReconciliation: VerificationEscrowReconciliation
  releaseReconciliation: VerificationReleaseReconciliation
  depositReconciliation: VerificationDepositReconciliation
  receiptSummary: VerificationReceiptItem[]
  releaseTx: VerificationReleaseTx | null
  guarantees: VerificationGuarantees
  simulationNotice: string
  refreshedAt: string
  /**
   * 노드 장애로 **마지막 인덱싱 값**을 보여주는 중인지.
   * `true`면 아래 `matched` 3종을 "일치"로 단정하지 않는다.
   *
   * ⚠ 명세가 사유를 구분해 주지 않는다(boolean 하나). Redis 장애와 체인 조회 지연이 같은 값으로 온다.
   */
  stale: boolean
}

/* =============================== 매퍼 =============================== */

function toContracts(raw: ContractsResponse | undefined): VerificationContracts {
  return {
    tokenAddress: text(raw?.tokenAddress),
    tokenSymbol: raw?.tokenSymbol ?? 'YoYo',
    tokenDecimals: int(raw?.tokenDecimals),
    revenueSplitter: text(raw?.revenueSplitter),
    explorerBaseUrl: text(raw?.explorerBaseUrl),
  }
}

function toTeamShare(raw: TeamShareResponse): VerificationTeamShare {
  return { teamId: int(raw.teamId), shareBp: int(raw.shareBp) }
}

function toLockedRule(raw: LockedRuleResponse | undefined): VerificationLockedRule {
  const rawRule = raw?.raw
  return {
    rulesHash: text(raw?.rulesHash),
    raw: {
      performanceId: int(rawRule?.performanceId),
      fixedRatioBp: int(rawRule?.fixedRatioBp),
      selectionRatioBp: int(rawRule?.selectionRatioBp),
      teamShares: list(rawRule?.teamShares).map(toTeamShare),
      hostTeamId: int(rawRule?.hostTeamId),
    },
    onchainRulesHash: text(raw?.onchainRulesHash),
    // 모르면 "일치"라고 하지 않는다. 대조가 이 화면의 전부다.
    hashMatched: raw?.hashMatched === true,
    lockedAt: text(raw?.lockedAt),
    startSaleTxHash: text(raw?.startSaleTxHash),
  }
}

function toAgreement(raw: AgreementResponse): VerificationAgreement {
  return {
    teamId: int(raw.teamId),
    teamName: text(raw.teamName),
    walletAddress: text(raw.walletAddress),
    onchainAgreed: raw.onchainAgreed ?? null,
    signerType: raw.signerType ?? 'OPERATOR',
    txHash: text(raw.txHash),
    agreedAt: text(raw.agreedAt),
  }
}

/**
 * 카운터 한 줄. **네 값을 각각 그대로 옮기기만 한다.**
 * 여기서 뺄셈·덧셈을 하면 정상 상태에서도 불일치가 나온다(파일 상단 경고).
 */
function toCounter(raw: CounterResponse): VerificationOnchainCounter {
  return {
    teamId: int(raw.teamId),
    teamIndex: int(raw.teamIndex),
    choiceCount: nullableInt(raw.choiceCount),
    purchaseCount: int(raw.purchaseCount),
    refundCount: int(raw.refundCount),
    refundedAmount: int(raw.refundedAmount),
  }
}

function toRecalculationInput(
  raw: RecalculationInputResponse | undefined,
): VerificationRecalculationInput {
  return {
    grossRevenueAmount: int(raw?.grossRevenueAmount),
    refundedAmount: int(raw?.refundedAmount),
    netRevenueAmount: int(raw?.netRevenueAmount),
    distributableAmount: nullableInt(raw?.distributableAmount),
    fixedRatioBp: int(raw?.fixedRatioBp),
    selectionRatioBp: int(raw?.selectionRatioBp),
    teamShares: list(raw?.teamShares).map(toTeamShare),
    participantCount: int(raw?.participantCount),
    totalChoiceCount: int(raw?.totalChoiceCount),
    roundingRule: text(raw?.roundingRule),
    remainderRule: text(raw?.remainderRule),
    hostTeamId: int(raw?.hostTeamId),
    dustAmount: int(raw?.dustAmount),
    tokenDecimals: int(raw?.tokenDecimals),
    currency: raw?.currency ?? 'KRW',
  }
}

function toShare(raw: ShareResponse): VerificationShare {
  return {
    teamId: int(raw.teamId),
    teamName: text(raw.teamName),
    fixedAmount: int(raw.fixedAmount),
    choiceAmount: int(raw.choiceAmount),
    dustAmount: int(raw.dustAmount),
    totalAmount: int(raw.totalAmount),
  }
}

function toEscrowReconciliation(
  raw: EscrowReconciliationResponse | undefined,
): VerificationEscrowReconciliation {
  return {
    purchasedTotal: int(raw?.purchasedTotal),
    refundedTotal: int(raw?.refundedTotal),
    releasedTotal: nullableInt(raw?.releasedTotal),
    escrowBalanceOnchain: nullableInt(raw?.escrowBalanceOnchain),
    expectedEscrowBalance: nullableInt(raw?.expectedEscrowBalance),
    matched: raw?.matched ?? null,
    note: text(raw?.note),
  }
}

function toReleasedEvent(raw: ReleasedEventResponse): VerificationReleasedEvent {
  return { teamWallet: text(raw.teamWallet), amount: int(raw.amount) }
}

function toReleaseReconciliation(
  raw: ReleaseReconciliationResponse | undefined,
): VerificationReleaseReconciliation {
  return {
    releasedEventTotal: nullableInt(raw?.releasedEventTotal),
    recalculatedTotal: nullableInt(raw?.recalculatedTotal),
    // 서버가 준 차이를 그대로 쓴다. releasedEventTotal − recalculatedTotal로 다시 계산하지 않는다
    // (누락 필드가 0으로 채워진 경우 "차이 0"이라는 거짓 결론이 나온다).
    difference: nullableInt(raw?.difference),
    matched: raw?.matched ?? null,
    releasedEvents: list(raw?.releasedEvents).map(toReleasedEvent),
  }
}

function toDepositReconciliation(
  raw: DepositReconciliationResponse | undefined,
): VerificationDepositReconciliation {
  return {
    amount: int(raw?.amount),
    status: text(raw?.status),
    paidTxHash: text(raw?.paidTxHash),
    returnTxHash: text(raw?.returnTxHash),
    matched: raw?.matched ?? null,
  }
}

function toReceiptItem(raw: ReceiptItemResponse): VerificationReceiptItem {
  return {
    teamId: int(raw.teamId),
    walletAddress: text(raw.walletAddress),
    receivedAmount: int(raw.receivedAmount),
    received: raw.received === true,
    receivedAt: nullableText(raw.receivedAt),
  }
}

function toReleaseTx(raw: ReleaseTxResponse | undefined): VerificationReleaseTx | null {
  // release 전에는 tx가 없다. 빈 객체를 만들어 "해시 없음"을 가짜로 표시하지 않는다.
  if (!raw || !raw.txHash) return null
  return {
    txHash: raw.txHash,
    explorerUrl: text(raw.explorerUrl),
    releasedAt: text(raw.releasedAt),
  }
}

function toGuarantees(raw: GuaranteesResponse | undefined): VerificationGuarantees {
  return { guaranteed: list(raw?.guaranteed), notGuaranteed: list(raw?.notGuaranteed) }
}

export function toVerificationData(raw: VerificationResponse): VerificationData {
  return {
    performanceId: int(raw.performanceId),
    performanceTitle: text(raw.performanceTitle),
    performedAt: text(raw.performedAt),
    settlementStatus: raw.settlementStatus ?? 'NONE',
    network: text(raw.network),
    chainId: int(raw.chainId),
    contracts: toContracts(raw.contracts),
    lockedRule: toLockedRule(raw.lockedRule),
    agreements: list(raw.agreements).map(toAgreement),
    onchainCounters: list(raw.onchainCounters).map(toCounter),
    recalculationInput: toRecalculationInput(raw.recalculationInput),
    shares: list(raw.shares).map(toShare),
    escrowReconciliation: toEscrowReconciliation(raw.escrowReconciliation),
    releaseReconciliation: toReleaseReconciliation(raw.releaseReconciliation),
    depositReconciliation: toDepositReconciliation(raw.depositReconciliation),
    receiptSummary: list(raw.receiptSummary).map(toReceiptItem),
    releaseTx: toReleaseTx(raw.releaseTx),
    guarantees: toGuarantees(raw.guarantees),
    simulationNotice: text(raw.simulationNotice),
    refreshedAt: text(raw.refreshedAt),
    stale: raw.stale === true,
  }
}

/* ============================== 요청 함수 ============================== */

/**
 * API-verify-01 `GET /performances/{performanceId}/verification` — 참여팀 로그인 전용.
 *
 * 401 `COMMON_UNAUTHORIZED` · 403 `COMMON_FORBIDDEN`·`SETTLEMENT_NOT_PARTICIPANT`
 * · 404 `PERFORMANCE_NOT_FOUND` · 429 `COMMON_TOO_MANY_REQUESTS` · 502 `COMMON_EXTERNAL_SERVICE_ERROR`
 * (화면설계는 504 `CHAIN_TX_TIMEOUT`도 적었다 — 둘 다 처리한다. `features/verify/verifyErrors.ts` 참조)
 *
 * 서버가 60초 캐시한다. 관객 지갑 주소·주문·티켓 식별자는 응답에 담기지 않는다.
 */
export async function fetchVerification(performanceId: number): Promise<VerificationData> {
  const raw = await api.get<VerificationResponse>(
    '/performances/' + String(performanceId) + '/verification',
  )
  return toVerificationData(raw)
}
