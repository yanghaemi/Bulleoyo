/**
 * settlement 도메인 — 호출 함수와 응답 매퍼.
 *
 * 정본 · `docs/design/api/openapi.yaml` operationId `settlement_01` ~ `settlement_07`
 *        `docs/design/06_API_명세서_v6.md` API-settlement-01~07
 *        화면 P-08(정산 대시보드) · V-03(정산 공유, 공개)
 *
 * ────────────────────────── 이 파일이 지키는 규약 ──────────────────────────
 * 1. **응답 타입을 손으로 쓰지 않는다.** 전부 `ApiData<'settlement_0N'>`(= openapi 생성 타입)에서
 *    파생시킨다. 명세가 바뀌면 `pnpm gen:api` 후 여기서 타입 에러가 난다 — 그게 목적이다.
 * 2. **매퍼의 일은 "좁히기"뿐이다.** 생성 타입에서 아직 optional인 필드를 화면이 매번
 *    존재 확인하지 않도록 여기서 한 번만 좁힌다.
 *    `openapi.yaml`에 `required:`를 42개 스키마에 올려(백엔드 record의 primitive 기준)
 *    상당수는 이미 optional이 풀렸다. 남은 것들은 서버가 상황에 따라 생략하는 값이다.
 *    ⚠ 좁힐 때 **"값이 0"과 "필드 누락"을 뭉개지 않는다** — 기본값 선택은 `_mapper.ts`의
 *    `int`(0으로 읽음)와 `nullableInt`(null로 남김) 중 하나를 고르는 일이고,
 *    그 파일 상단에 고르는 기준이 적혀 있다.
 * 3. **금액은 전부 YoYo 정수** 다. `rate`는 §0.5 표시 전용이며 계산에 쓰지 않는다(P-17).
 * 4. **분기는 `code`만.** 이 파일은 `ApiError`를 그대로 던지고, code → 문구 매핑은 화면이 한다
 *    (`features/studio/settlementMessages.ts` · `features/settlement/publicShare.ts`).
 *
 * ───────────────────────── 정산은 상태 기계다 ─────────────────────────
 *   NONE → (aggregate) → AGGREGATED → (lock) → LOCKED/DISPUTE_OPEN → (release) → RELEASED
 *
 * 세 단계 전이는 전부 온체인 tx라 **202 + `jobId`** 만 돌아온다. 이 계층은 `jobId`까지만
 * 책임지고 **폴링하지 않는다** — 폴링은 `GET /chain/jobs/{jobId}` 한 곳으로 모으고(§0.3)
 * 확정 후 무효화는 `invalidatedBy(txType)`(shared/queries/keys)가 판단한다.
 */

import { api } from '@/shared/api/client'
import { int, nullableInt, nullableText, text } from '@/shared/api/domains/_mapper'
import type { ApiBody, ApiData } from '@/shared/api/schema'
import type { ChainJobAccepted } from '@/shared/api/types'

/* ============================ 생성 타입 별칭 ============================ */

type SettlementResponse = ApiData<'settlement_01'>
type SettlementShareResponse = NonNullable<SettlementResponse['shares']>[number]
type SettlementMyTeamResponse = NonNullable<SettlementResponse['myTeam']>
type SettlementActionsResponse = NonNullable<SettlementResponse['actions']>
type SettlementActionStateResponse = NonNullable<SettlementActionsResponse['aggregate']>
type SettlementDepositResponse = NonNullable<SettlementResponse['deposit']>
type SettlementTransactionResponse = NonNullable<SettlementResponse['transactions']>[number]
type SettlementRateResponse = NonNullable<SettlementResponse['rate']>
type DisputeResponse = ApiData<'settlement_04'>
type ShareLinkResponse = ApiData<'settlement_06'>
type PublicSettlementResponse = ApiData<'settlement_07'>
type PublicShareResponse = NonNullable<PublicSettlementResponse['shares']>[number]

/* ============================== 도메인 타입 ============================== */

/** 정산 상태 머신의 6개 값. `@/shared/ui`의 `SettlementStatus`와 같은 union이다 */
export type SettlementStatus = NonNullable<SettlementResponse['status']>

/** 이의제기 상태 */
export type DisputeStatus = NonNullable<DisputeResponse['status']>

/** release가 종단이라 팀이 할 일은 둘뿐이다(v5에서 등록·유출 시작 삭제) */
export type SettlementNextAction = NonNullable<SettlementMyTeamResponse['nextAction']>

/** `SettlementRateSummary` — §0.5 목록 축약형 환율. **표시 전용**, 계산 금지 */
export interface SettlementRate {
  currency: string
  /** `1 currency = rate KRW` */
  rate: number
  asOf: string
}

/** `available: false`일 때만 `blockedReason`(ErrorCode 문자열)이 온다 */
export interface SettlementActionState {
  available: boolean
  blockedReason: string | null
}

/**
 * 단계별 액션 5종의 실행 가능 여부. **버튼 활성 조건은 서버가 정한다.**
 *
 * ⚠ 체인 조회가 필요한 검사 2종(`SETTLEMENT_AGGREGATE_MISMATCH`·`COIN_ESCROW_INSUFFICIENT`)은
 *   여기에 반영되지 않는다(명세 API-settlement-01 요구사항, 2026-09-09). `available: true`여도
 *   실행이 409로 끝날 수 있으므로 화면은 409 `code` 안내 경로를 따로 둔다.
 */
export interface SettlementActions {
  aggregate: SettlementActionState
  lock: SettlementActionState
  dispute: SettlementActionState
  release: SettlementActionState
  /** 조기 동의(API-settlement-08). 참여팀 리더만 눌린다 — 관리자 우회가 없다 */
  approve: SettlementActionState
}

/** 팀별 분배액 한 줄. 금액 4종은 모두 YoYo 정수다 */
export interface SettlementShareRow {
  teamId: number
  teamName: string
  /** 수령 시점 지갑 주소 스냅샷 */
  walletAddress: string
  /** 2단계 규칙의 고정 풀 분배액(`teamShareBp`로 배분. v3 `equalAmount` 대체) */
  fixedAmount: number
  /** 관객 선택 풀 분배액 */
  choiceAmount: number
  /** 1원 단위 잔여. `dustTeamId` 팀에만 실린다 */
  dustAmount: number
  totalAmount: number
  /** **표 수**(티켓 수). 금액이 아니다 — 금액 필드와 섞지 않는다 */
  choiceCount: number
  /** release 확정 = 수령 완료 */
  released: boolean
  releasedAt: string | null
  /**
   * 조기 동의를 마친 팀인가(API-settlement-08). 전원이 차면 48h를 기다리지 않는다.
   *
   * **`undefined`는 "동의 안 함"이 아니라 "서버가 안 알려줌"이다**(이 파일 머리말 규약 2 —
   * 누락과 값을 뭉개지 않는다). 배지와 `n/m`은 이 값이 없으면 아예 그리지 않는다 —
   * 전 팀을 "동의 전"으로 단정해 보이는 것이 빈칸보다 나쁘다.
   */
  approved?: boolean
  approvedAt: string | null
}

export interface SettlementMyTeam {
  teamId: number
  totalAmount: number
  released: boolean
  releasedAt: string | null
  walletAddress: string
  nextAction: SettlementNextAction
  /**
   * 우리 팀이 이미 동의했는가. **버튼 활성 판단은 여전히 `actions.approve.available`이다.**
   * `undefined`는 서버가 안 알려준 것이다 — 버튼 라벨을 "동의 완료"로 바꾸지 않는다.
   */
  approved?: boolean
}

/** `type`은 `chain_job.tx_type`과 같은 값(§0.3). `explorerUrl`은 서버가 완성해 준다(§0.7) */
export interface SettlementTransaction {
  type: string
  txHash: string
  explorerUrl: string
}

/** 보증금. `status` enum은 performance·rule 도메인 소관이라 문자열 그대로 둔다 */
export interface SettlementDeposit {
  status: string
  amount: number
  returnTxHash: string | null
  returnedAt: string | null
}

/** 팀 단위 이의제기. `member_id`는 없다(v4 결정) */
export interface SettlementDispute {
  disputeId: number
  performanceId: number
  teamId: number
  status: DisputeStatus
  createdAt: string
  /** 이 이의로 release 자동 실행이 보류 중인지 */
  releaseHeld: boolean
}

/** settlement_01 200 `data` — P-08 화면 전체가 이 하나로 그려진다 */
export interface SettlementData {
  performanceId: number
  settlementId: number
  status: SettlementStatus
  /** 등록된 표시 환율이 없으면 서버가 아예 내리지 않는다(§0.5) */
  rate?: SettlementRate
  currency: string
  grossRevenueAmount: number
  refundedAmount: number
  netRevenueAmount: number
  distributableAmount: number
  escrowBalanceAmount: number
  /** 고정 배분 비율(basis point, 10000 = 100%) */
  fixedRatioBp: number
  /** 관객 선택 배분 비율(basis point) */
  selectionRatioBp: number
  /** 버림 오차 잔여. `dustTeamId` 팀에 귀속 */
  dustAmount: number
  dustTeamId: number | null
  rulesHash: string | null
  aggregatedAt: string | null
  lockedAt: string | null
  /** 이의제기 마감(잠금 + 48h). 남은 시간 계산의 유일한 근거다 */
  disputeClosesAt: string | null
  releasedAt: string | null
  releaseTxHash: string | null
  /**
   * 온체인 선택 카운터 합과 서버 집계 일치 여부(REL-06).
   *
   * ⚠ 필드가 없으면 **true로 본다.** 없는 경고를 만들지 않기 위해서다 —
   *   정상 상태에서 뜨는 불일치 배너는 운영자를 오판하게 만든다.
   */
  counterMatched: boolean
  deposit: SettlementDeposit
  shares: SettlementShareRow[]
  /** 참여팀 소속이 아니면 오지 않는다 */
  myTeam?: SettlementMyTeam
  disputes: SettlementDispute[]
  transactions: SettlementTransaction[]
  actions: SettlementActions
  /**
   * [2026-09-24] 서버 본인 확인 스위치가 켜졌을 때만 true — 조기 동의·정산금 지급 직전에 본인 확인을
   * 넣는다(API v7 §7.W). 꺼져 있으면 키 자체가 없다(기존 매핑 결과 무변경).
   */
  stepUpRequired?: true
}

/**
 * API-settlement-08 201 `data` — 정산 조기 동의.
 *
 * **온체인 작업이 아니다.** `settlement_04`(이의제기)와 같은 201 동기 응답이라 job 폴링이 없다.
 * 타입을 손으로 적은 이유는 위 `Plus*` 별칭과 같다 — 아직 `openapi.yaml`에 없다.
 */
export interface SettlementApproval {
  teamId: number
  approvedAt: string
  /** 지금까지 동의한 팀 수 */
  approvedCount: number
  /** 전원 = 주최팀 포함 참여팀 수 */
  requiredCount: number
  /** 이 동의로 전원이 차서 지급이 열렸는가 */
  releaseUnlocked: boolean
}

/** settlement_06 201 `data`. **재발급하면 기존 토큰이 무효화된다** */
export interface SettlementShareLink {
  performanceId: number
  shareUrl: string
  shareToken: string
  issuedAt: string
}

/** V-03 공개 화면의 팀별 한 줄. 팀 ID·지갑 주소·관객 정보가 **없다** */
export interface PublicSettlementShare {
  teamName: string
  fixedAmount: number
  choiceAmount: number
  dustAmount: number
  totalAmount: number
  /** 표 수(티켓 수) */
  choiceCount: number
  released: boolean
}

/** settlement_07 200 `data` — 비로그인 공개 조회 */
export interface PublicSettlement {
  performanceId: number
  performanceTitle: string
  performedAt: string
  settlementStatus: SettlementStatus
  rate?: SettlementRate
  currency: string
  grossRevenueAmount: number
  refundedAmount: number
  netRevenueAmount: number
  fixedRatioBp: number
  selectionRatioBp: number
  shares: PublicSettlementShare[]
  /** `RELEASED` 이전에는 비어 있다 */
  releaseTxHash: string | null
  /** 서버가 완성한 절대 URL. 프론트가 조립하지 않는다(§0.7) */
  explorerUrl: string | null
  simulationNotice: string
}

/* =============================== 매퍼 =============================== */

function toRate(raw: SettlementRateResponse | undefined): SettlementRate | undefined {
  if (!raw) return undefined
  return { currency: text(raw.currency), rate: int(raw.rate), asOf: text(raw.asOf) }
}

function toActionState(raw: SettlementActionStateResponse | undefined): SettlementActionState {
  // 필드가 없으면 **막힌 것으로 본다.** 기본값을 available:true로 두면 서버가 응답을
  // 채우지 못한 순간 정산 전이 버튼이 전부 열려 버린다(release는 되돌릴 수 없다).
  return {
    available: raw?.available === true,
    blockedReason: nullableText(raw?.blockedReason),
  }
}

function toActions(raw: SettlementActionsResponse | undefined): SettlementActions {
  return {
    aggregate: toActionState(raw?.aggregate),
    lock: toActionState(raw?.lock),
    dispute: toActionState(raw?.dispute),
    release: toActionState(raw?.release),
    approve: toActionState(raw?.approve),
  }
}

function toShareRow(raw: SettlementShareResponse): SettlementShareRow {
  return {
    teamId: int(raw.teamId),
    teamName: text(raw.teamName),
    walletAddress: text(raw.walletAddress),
    fixedAmount: int(raw.fixedAmount),
    choiceAmount: int(raw.choiceAmount),
    dustAmount: int(raw.dustAmount),
    totalAmount: int(raw.totalAmount),
    choiceCount: int(raw.choiceCount),
    released: raw.released === true,
    releasedAt: nullableText(raw.releasedAt),
    approved: raw.approved,
    approvedAt: nullableText(raw.approvedAt),
  }
}

function toMyTeam(
  raw: SettlementMyTeamResponse | undefined,
): SettlementMyTeam | undefined {
  if (!raw) return undefined
  return {
    teamId: int(raw.teamId),
    totalAmount: int(raw.totalAmount),
    released: raw.released === true,
    releasedAt: nullableText(raw.releasedAt),
    walletAddress: text(raw.walletAddress),
    // 값이 없으면 WAIT_RELEASE가 아니라 NONE으로 둔다 — 없는 대기 상태를 만들지 않는다.
    nextAction: raw.nextAction ?? 'NONE',
    approved: raw.approved,
  }
}

function toDeposit(raw: SettlementDepositResponse | undefined): SettlementDeposit {
  return {
    status: text(raw?.status),
    amount: int(raw?.amount),
    returnTxHash: nullableText(raw?.returnTxHash),
    returnedAt: nullableText(raw?.returnedAt),
  }
}

function toTransaction(raw: SettlementTransactionResponse): SettlementTransaction {
  return {
    type: text(raw.type),
    txHash: text(raw.txHash),
    explorerUrl: text(raw.explorerUrl),
  }
}

export function toDispute(raw: DisputeResponse): SettlementDispute {
  return {
    disputeId: int(raw.disputeId),
    performanceId: int(raw.performanceId),
    teamId: int(raw.teamId),
    status: raw.status ?? 'OPEN',
    createdAt: text(raw.createdAt),
    releaseHeld: raw.releaseHeld === true,
  }
}

export function toSettlementData(raw: SettlementResponse): SettlementData {
  return {
    performanceId: int(raw.performanceId),
    settlementId: int(raw.settlementId),
    status: raw.status ?? 'NONE',
    rate: toRate(raw.rate),
    currency: raw.currency ?? 'KRW',
    grossRevenueAmount: int(raw.grossRevenueAmount),
    refundedAmount: int(raw.refundedAmount),
    netRevenueAmount: int(raw.netRevenueAmount),
    distributableAmount: int(raw.distributableAmount),
    escrowBalanceAmount: int(raw.escrowBalanceAmount),
    fixedRatioBp: int(raw.fixedRatioBp),
    selectionRatioBp: int(raw.selectionRatioBp),
    dustAmount: int(raw.dustAmount),
    dustTeamId: nullableInt(raw.dustTeamId),
    rulesHash: nullableText(raw.rulesHash),
    aggregatedAt: nullableText(raw.aggregatedAt),
    lockedAt: nullableText(raw.lockedAt),
    disputeClosesAt: nullableText(raw.disputeClosesAt),
    releasedAt: nullableText(raw.releasedAt),
    releaseTxHash: nullableText(raw.releaseTxHash),
    counterMatched: raw.counterMatched !== false,
    deposit: toDeposit(raw.deposit),
    shares: (raw.shares ?? []).map(toShareRow),
    myTeam: toMyTeam(raw.myTeam),
    disputes: (raw.disputes ?? []).map(toDispute),
    transactions: (raw.transactions ?? []).map(toTransaction),
    actions: toActions(raw.actions),
    ...(raw.stepUpRequired === true ? { stepUpRequired: true as const } : {}),
  }
}

export function toShareLink(raw: ShareLinkResponse): SettlementShareLink {
  return {
    performanceId: int(raw.performanceId),
    shareUrl: text(raw.shareUrl),
    shareToken: text(raw.shareToken),
    issuedAt: text(raw.issuedAt),
  }
}

function toPublicShareRow(raw: PublicShareResponse): PublicSettlementShare {
  return {
    teamName: text(raw.teamName),
    fixedAmount: int(raw.fixedAmount),
    choiceAmount: int(raw.choiceAmount),
    dustAmount: int(raw.dustAmount),
    totalAmount: int(raw.totalAmount),
    choiceCount: int(raw.choiceCount),
    released: raw.released === true,
  }
}

export function toPublicSettlement(raw: PublicSettlementResponse): PublicSettlement {
  return {
    performanceId: int(raw.performanceId),
    performanceTitle: text(raw.performanceTitle),
    performedAt: text(raw.performedAt),
    settlementStatus: raw.settlementStatus ?? 'NONE',
    rate: toRate(raw.rate),
    currency: raw.currency ?? 'KRW',
    grossRevenueAmount: int(raw.grossRevenueAmount),
    refundedAmount: int(raw.refundedAmount),
    netRevenueAmount: int(raw.netRevenueAmount),
    fixedRatioBp: int(raw.fixedRatioBp),
    selectionRatioBp: int(raw.selectionRatioBp),
    shares: (raw.shares ?? []).map(toPublicShareRow),
    releaseTxHash: nullableText(raw.releaseTxHash),
    explorerUrl: nullableText(raw.explorerUrl),
    simulationNotice: text(raw.simulationNotice),
  }
}

/* ============================== 요청 함수 ============================== */

const settlementPath = (performanceId: number, suffix = ''): string =>
  '/performances/' + String(performanceId) + '/settlement' + suffix

/**
 * API-settlement-01 `GET /performances/{performanceId}/settlement`
 * 403 `SETTLEMENT_NOT_PARTICIPANT` · 404 `PERFORMANCE_NOT_FOUND` · 401 `COMMON_UNAUTHORIZED`
 */
export async function fetchSettlement(performanceId: number): Promise<SettlementData> {
  const raw = await api.get<SettlementResponse>(settlementPath(performanceId))
  return toSettlementData(raw)
}

/**
 * API-settlement-02 `POST …/settlement/aggregate` → **202 + jobId**(tx_type=AGGREGATE).
 *
 * 409 `SETTLEMENT_AGGREGATE_MISMATCH`는 **집계 확정만 거부**하고 정산 상태를 그대로 둔다.
 * `HALTED`로 전이하는 경로가 아니다 — 화면이 "중단됐다"고 말하면 안 된다.
 */
export function aggregateSettlement(performanceId: number): Promise<ChainJobAccepted> {
  return api.post<ChainJobAccepted>(settlementPath(performanceId, '/aggregate'))
}

/**
 * API-settlement-03 `POST …/settlement/lock` → **202 + jobId**(tx_type=LOCK).
 * `counterMatched: false`면 서버가 `SETTLEMENT_AGGREGATE_MISMATCH`(409)로 막는다.
 */
export function lockSettlement(performanceId: number): Promise<ChainJobAccepted> {
  return api.post<ChainJobAccepted>(settlementPath(performanceId, '/lock'))
}

/** API-settlement-04 요청 본문. `reason` 10~1000자, `expectedAmount`는 0 이상 YoYo 정수 */
export type DisputeCreateRequest = ApiBody<'settlement_04'>

/**
 * API-settlement-04 `POST …/settlement/disputes` → **201 동기 응답**(온체인 tx 아님).
 * 접수되면 release 자동 실행이 보류되고 관리자 검토(API-admin-06)로 넘어간다.
 */
export async function createDispute(
  performanceId: number,
  body: DisputeCreateRequest,
): Promise<SettlementDispute> {
  const raw = await api.post<DisputeResponse>(settlementPath(performanceId, '/disputes'), body)
  return toDispute(raw)
}

/**
 * API-settlement-08 `POST …/settlement/approvals` → **201 동기 응답**.
 *
 * 참여팀 리더(관리자 우회 없음)가 정산에 동의한다. 전원(주최팀 포함)이 동의하면
 * 48시간 이의제기 기간을 기다리지 않고 `release`가 열린다(`releaseUnlocked`).
 *
 * ⚠ **온체인 작업이 아니다** — `settlement_04`와 같은 모양이라 `jobId`가 없고 폴링을 붙이지 않는다.
 * `Idempotency-Key`도 필요 없다(§0.8 필수는 release뿐이다).
 *
 * 409 `COMMON_CONFLICT`(이미 동의했거나 이의를 취소해야 하는 경우 — 서버 `msg`로 구분한다) ·
 * 403 `COMMON_FORBIDDEN`·`SETTLEMENT_NOT_PARTICIPANT` · 409 `SETTLEMENT_NOT_LOCKED`
 */
export async function approveSettlement(
  performanceId: number,
  /** [2026-09-24] 본인 확인 토큰(범위 SETTLEMENT_APPROVE·공연). 없으면 헤더를 붙이지 않는다. */
  stepUpToken?: string,
): Promise<SettlementApproval> {
  const raw = stepUpToken
    ? await api.post<Partial<SettlementApproval>>(
        settlementPath(performanceId, '/approvals'),
        undefined,
        { headers: { 'X-Step-Up-Token': stepUpToken } },
      )
    : await api.post<Partial<SettlementApproval>>(settlementPath(performanceId, '/approvals'))
  return {
    teamId: int(raw.teamId),
    approvedAt: text(raw.approvedAt),
    approvedCount: int(raw.approvedCount),
    requiredCount: int(raw.requiredCount),
    releaseUnlocked: raw.releaseUnlocked === true,
  }
}

export interface ReleaseSettlementParams {
  performanceId: number
  /**
   * §0.8 **필수**. 클라이언트가 자동 생성하지 않는다 —
   * 재시도할 때 **같은 키를 다시 넘겨야** 중복 지급이 나지 않는다. 생성·보관은 호출부 책임이다.
   */
  idempotencyKey: string
  /** 수동 실행 사유(감사 로그) */
  note?: string
  /** [2026-09-24] 본인 확인 토큰(범위 SETTLEMENT_RELEASE·공연). 없으면 헤더를 붙이지 않는다. */
  stepUpToken?: string
}

/**
 * API-settlement-05 `POST …/settlement/release` → **202 + jobId**(tx_type=RELEASE).
 *
 * 이의 48시간이 지나면 자동 스케줄이 같은 일을 한다. 이 호출은 수동 트리거다.
 * 열린 이의가 있으면 `SETTLEMENT_DISPUTE_PERIOD`(409)로 막힌다.
 */
export function releaseSettlement(params: ReleaseSettlementParams): Promise<ChainJobAccepted> {
  const body: ApiBody<'settlement_05'> = params.note ? { note: params.note } : {}
  return api.post<ChainJobAccepted>(settlementPath(params.performanceId, '/release'), body, {
    idempotencyKey: params.idempotencyKey,
    ...(params.stepUpToken ? { headers: { 'X-Step-Up-Token': params.stepUpToken } } : {}),
  })
}

/**
 * API-settlement-06 `POST …/settlement/share-link` → 201.
 *
 * ⚠ **재발급하면 기존 토큰이 무효화된다.** 이미 나눠 준 링크가 죽으므로 이 호출을
 *   "조회"처럼 refetch에 걸면 안 된다. 화면이 명시적으로 눌렀을 때만 부른다.
 */
export async function createSettlementShareLink(
  performanceId: number,
): Promise<SettlementShareLink> {
  const raw = await api.post<ShareLinkResponse>(settlementPath(performanceId, '/share-link'))
  return toShareLink(raw)
}

/**
 * API-settlement-07 `GET /public/settlement/{shareToken}` — **비로그인 공개 경로**(V-03).
 *
 * `public: true`로 부른다. 세 가지를 동시에 막는다 —
 *   ① `Authorization` 헤더를 붙이지 않는다(로그인 상태로 열어도 회원 토큰이 새 나가지 않는다)
 *   ② `AUTH_TOKEN_EXPIRED` refresh 재시도 경로를 타지 않는다
 *   ③ `AUTH_TOKEN_INVALID`가 와도 **강제 로그아웃되지 않는다**
 *
 * ③이 `skipAuth`만으로는 막히지 않아 `public`을 따로 만들었다. `skipAuth`는 refresh 호출에도
 * 쓰이고 그쪽은 `TOKEN_INVALID`에 로그아웃하는 것이 맞기 때문이다. 공개 경로에서 그 코드가
 * 오면 이 사용자의 세션과 무관한 서버 사정인데, 거기서 로그아웃시키면 **공유 링크를
 * 열어 본 것만으로 로그인이 풀린다.**
 *
 * 토큰이 무효화됐거나 없으면 404 `COMMON_NOT_FOUND`다.
 */
export async function fetchPublicSettlement(shareToken: string): Promise<PublicSettlement> {
  const raw = await api.get<PublicSettlementResponse>(
    '/public/settlement/' + encodeURIComponent(shareToken),
    { public: true },
  )
  return toPublicSettlement(raw)
}
