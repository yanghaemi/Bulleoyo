/**
 * rule 도메인 REST 함수 — API-rule-01 ~ 05.
 *
 * 정본: `docs/design/api/openapi.yaml`(operationId `rule_01`~`rule_05`)
 *      `docs/design/06_API_명세서_v6.md` §5 · §0.3 · §0.4
 *
 * ───────────────────────── 이 도메인이 결정하는 것 ─────────────────────────
 * 공연이 판매를 시작할 수 있는지는 **여기서 정해진다.** 순서가 고정돼 있다.
 *
 *   규칙 저장(rule_01) → createShow → 보증금(performance_13·14) → 팀별 동의(rule_03·05) → 판매 시작(rule_04)
 *
 * 규칙을 다시 저장하면 `rulesHash`가 새로 계산되고 **기존 동의가 전부 PENDING으로 초기화**된다.
 * 그래서 rule_01 성공 뒤에 동의 현황(rule_02)을 무효화하지 않으면 화면이 "이미 동의됨"을
 * 계속 보여주고, 사용자는 열리지 않는 판매 시작 버튼 앞에서 멈춘다.
 *
 * `startSaleAvailable`·`startSaleBlockedReason`은 **서버가 정한다.** 프론트가 동의 배열을
 * 세어 직접 판단하지 않는다 — 보증금·팀 수·잠금까지 함께 보는 판단이라 재현하면 어긋난다.
 */

import { api } from '@/shared/api/client'
import type { ApiBody, ApiData, ApiPath } from '@/shared/api/schema'

/* ============================== 식별자 ============================== */

export type PerformanceId = ApiPath<'rule_02'>['performanceId']

/* ============================== 요청 타입 ============================== */

export type RuleSetRequest = ApiBody<'rule_01'>
export type AgreementPrepareRequest = ApiBody<'rule_03'>
/** `{ teamId, kind: 'AGREE', senderSignedRlp }` — §0.4 ③ */
export type AgreementSignedTxRequest = ApiBody<'rule_05'>
export type SaleStartRequest = ApiBody<'rule_04'>

/* ============================== 응답 타입 ============================== */

export type RuleSetResult = ApiData<'rule_01'>
export type RuleStatus = ApiData<'rule_02'>
/** 200 — `PrepareResponse`(signRequests·expiresAt) + teamId·rulesHash·prerequisiteJobId */
export type AgreementPrepareResult = ApiData<'rule_03'>
/** 202 — `{ jobId, status, pollAfterMs }`. signerType=USER */
export type AgreementSignedTxAccepted = ApiData<'rule_05'>
/** 202 — `{ jobId, status, pollAfterMs }`. signerType=OPERATOR */
export type SaleStartAccepted = ApiData<'rule_04'>

export type RuleAgreementTeam = NonNullable<RuleStatus['agreements']>[number]
export type RuleAgreementStatus = NonNullable<RuleAgreementTeam['status']>

/* ============================== 에러 코드 ============================== */

/** 이 절에서 화면이 분기하는 `code`. 공통 코드(§0.10)는 `@/shared/api/errorCodes`. */
export const RuleCode = {
  /** 400 — 1단계(fixed+selection) 또는 2단계(teamShares) 합이 10000이 아님 */
  RATIO_SUM_INVALID: 'RULE_RATIO_SUM_INVALID',
  /**
   * 409 — 내가 들고 있는 `rulesHash` ≠ 서버 현재 해시.
   * 그 사이 생성자가 규칙을 고쳤다는 뜻이다. 화면은 rule_02를 다시 불러 새 해시로 재시도한다.
   */
  HASH_MISMATCH: 'RULE_HASH_MISMATCH',
  /** 409 — 이미 startSale 완료. 규칙·동의는 더 이상 바뀌지 않는다 */
  ALREADY_LOCKED: 'RULE_ALREADY_LOCKED',
  /** 409 — PENDING·SIGNING 팀이 남아 판매를 시작할 수 없음 */
  NOT_AGREED_BY_ALL: 'RULE_NOT_AGREED_BY_ALL',
  /** 409 — 공동 공연인데 참여팀이 2팀 미만 */
  TEAM_MIN_COUNT_NOT_MET: 'TEAM_MIN_COUNT_NOT_MET',
  /** 403 — 참여팀 소속이 아님 */
  NOT_PARTICIPANT: 'SETTLEMENT_NOT_PARTICIPANT',
  /** 404 — 존재하지 않는 performanceId */
  PERFORMANCE_NOT_FOUND: 'PERFORMANCE_NOT_FOUND',
  /** 403 — 생성자 팀 리더가 아님(rule_01·rule_04) */
  PERFORMANCE_NOT_OWNER: 'PERFORMANCE_NOT_OWNER',
  /** 409 — 규칙을 받을 수 없는 상태, 또는 판매 시작 시 보증금이 PAID가 아님 */
  PERFORMANCE_INVALID_STATUS: 'PERFORMANCE_INVALID_STATUS',
  /** 404 — 리더 지갑 미연결 */
  WALLET_NOT_FOUND: 'WALLET_NOT_FOUND',
  /** 409 — receipt·이벤트 검증 실패(§0.4 ④ 대체 코드) */
  TX_MISMATCH: 'PAYMENT_AMOUNT_MISMATCH',
  /** 500 — 운영지갑(fee payer) KAIA 부족 */
  GAS_INSUFFICIENT: 'CHAIN_GAS_INSUFFICIENT',
  /** 504 — 확정 120초 초과. jobId로 계속 폴링 */
  TX_TIMEOUT: 'CHAIN_TX_TIMEOUT',
} as const

/* ============================== 경로 ============================== */

const rules = (performanceId: PerformanceId) => `/performances/${performanceId}/rules`

/* ============================== 요청 함수 ============================== */

/**
 * API-rule-01 · `PUT /performances/{performanceId}/rules` — 정산 규칙 저장(전체 교체).
 *
 * 보증금 선행 조건은 **없다**(2026-09-09). createShow가 `rulesHash != 0`을 요구하고
 * deposit이 createShow를 요구해 순환이 되기 때문이며, 보증금 검증은 판매 시작(rule_04)이 한다.
 * 저장할 때마다 `rulesHash`가 재산출되고 기존 동의가 전부 PENDING으로 초기화된다.
 */
export function setRules(
  performanceId: PerformanceId,
  body: RuleSetRequest,
): Promise<RuleSetResult> {
  return api.put<RuleSetResult>(rules(performanceId), body)
}

/**
 * API-rule-02 · `GET /performances/{performanceId}/rules` — 규칙·동의 현황.
 *
 * 규칙이 아직 없으면(DRAFT) 404 `COMMON_NOT_FOUND`다. "아직 안 만든 상태"이지 오류가 아니므로
 * 화면은 이 코드를 빈 상태 안내로 처리한다.
 */
export function fetchRuleStatus(
  performanceId: PerformanceId,
  teamId?: number,
): Promise<RuleStatus> {
  return api.get<RuleStatus>(
    rules(performanceId),
    teamId === undefined ? undefined : { query: { teamId } },
  )
}

/**
 * API-rule-03 · `POST …/rules/agreements/prepare` — §0.4 ① 동의 서명 파라미터.
 *
 * `rulesHash`는 rule_02에서 받은 **현재 값을 그대로** 보낸다. 다르면 409 `RULE_HASH_MISMATCH`다.
 * 이미 온체인 동의가 있으면 서버가 DB만 AGREED로 맞추고 `signRequests`를 **빈 배열**로 준다 —
 * 호출부는 빈 배열을 오류로 보지 말고 "서명 없이 완료"로 처리해야 한다.
 */
export function prepareAgreement(
  performanceId: PerformanceId,
  body: AgreementPrepareRequest,
): Promise<AgreementPrepareResult> {
  return api.post<AgreementPrepareResult>(`${rules(performanceId)}/agreements/prepare`, body)
}

/**
 * API-rule-05 · `POST …/rules/agreements/signed-tx` — §0.4 ③ **202 + jobId**.
 *
 * 보고 즉시 동의가 PENDING → SIGNING이 되고, receipt 확정 후에야 AGREED가 된다.
 * 검증 실패면 서버가 PENDING으로 되돌린다.
 *
 * ⚠ `senderSignedRlp`는 인자로 들어와 본문으로 나가는 것이 전부다. 어디에도 남기지 않는다.
 */
export function reportAgreementSignedTx(
  performanceId: PerformanceId,
  body: AgreementSignedTxRequest,
  /** [2026-09-24] 본인 확인 토큰(범위 RULE_AGREE·공연). 없으면 헤더를 붙이지 않는다. */
  stepUpToken?: string,
): Promise<AgreementSignedTxAccepted> {
  return api.post<AgreementSignedTxAccepted>(
    `${rules(performanceId)}/agreements/signed-tx`,
    body,
    stepUpToken ? { headers: { 'X-Step-Up-Token': stepUpToken } } : {},
  )
}

/**
 * API-rule-04 · `POST /performances/{performanceId}/sale/start` — **202 + jobId**(운영자 tx).
 *
 * 경로가 `/rules` 아래가 아니라 `/sale/start`다(절만 rule이다).
 * tx가 확정돼야 PENDING_AGREEMENT → ON_SALE이 된다. 202 응답만 보고 "판매 중"으로 바꾸지 않는다.
 */
export function startSale(
  performanceId: PerformanceId,
  body: SaleStartRequest,
): Promise<SaleStartAccepted> {
  return api.post<SaleStartAccepted>(`/performances/${performanceId}/sale/start`, body)
}

/**
 * 판매 시작 202를 **폴링 가능한 형태**로 좁힌다.
 *
 * ─────────────────────────── 왜 이 함수가 필요한가 ───────────────────────────
 * `createShow`가 아직 확정되지 않았으면 서버는 `START_SALE` job을 만들지 않는다. 만들면 두 job이
 * 동시에 PENDING이 되고 워커가 startSale을 먼저 보내 revert하기 때문이다(`RuleService.startSale`).
 * 그때 응답은 **`jobId`가 없고** 선행 `CREATE_SHOW` job의 `prerequisiteJobId`만 온다.
 * 서버가 `non_null` 직렬화라 `jobId` 키 자체가 사라진다.
 *
 * 그대로 `useChainJob(res.jobId)`에 넘기면 `enabled`가 `Boolean(undefined)` = false가 되어
 * **폴링이 조용히 켜지지 않는다.** 에러도, 로딩도 없이 영원히 확정되지 않는 화면이 된다.
 *
 * 그래서 두 경우를 타입으로 갈라 호출부가 **분기를 잊을 수 없게** 만든다.
 * `phase === 'prerequisite'`면 그 job이 확정된 뒤 `startSale`을 **다시 호출**해야 한다 —
 * 선행 job을 지켜보는 것만으로는 판매가 시작되지 않는다.
 *
 * 생성 타입은 두 필드를 모두 `string | null` optional로 준다(S15P21B204-67·92로 명세가 실제
 * 응답에 맞춰졌다). 캐스트는 없어졌지만 **이 함수는 남는다** — 스키마상 두 키가 동시에 없을 수
 * 있어 `phase: 'none'` 갈래를 타입으로 강제해야 하기 때문이다.
 */
export type SaleStartPolling =
  | { phase: 'start-sale'; jobId: string }
  | { phase: 'prerequisite'; jobId: string }
  | { phase: 'none'; jobId: null }

export function saleStartPolling(accepted: SaleStartAccepted): SaleStartPolling {
  if (accepted.jobId) return { phase: 'start-sale', jobId: accepted.jobId }
  if (accepted.prerequisiteJobId) {
    return { phase: 'prerequisite', jobId: accepted.prerequisiteJobId }
  }

  // 서버 계약상 오지 않아야 하는 응답이다. 조용히 넘기면 위의 "영원히 안 끝나는 화면"이 되므로
  // 호출부가 사용자에게 재시도를 안내할 수 있도록 상태로 드러낸다.
  return { phase: 'none', jobId: null }
}
