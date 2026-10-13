/**
 * chain 도메인 — 비동기 tx 작업 상태 (API v6 §8 API-chain-01).
 *
 * 정본: `docs/design/api/openapi.yaml`(operationId `chain_01`) ·
 *      `docs/design/06_API_명세서_v6.md` §0.3·§0.4·API-chain-01
 *
 * ───────────────────────── 이 엔드포인트의 위치 ─────────────────────────
 * **202를 내려주는 모든 API가 이 경로 하나로 폴링된다.** 운영자 tx(MINT·REFUND·LOCK·
 * AGGREGATE·RELEASE·HALT·DEPOSIT_RETURN…)도, 사용자 서명 tx(APPROVE·PURCHASE·DEPOSIT·
 * AGREE)도 같다. 그래서 도메인별로 폴링 코드를 따로 만들지 않는다 — 결제·환불·정산·지급이
 * 전부 `shared/queries/chain`의 `useChainJob` 하나를 쓴다.
 *
 * ─────────────────────────── 폴링 규칙(§0.3) ───────────────────────────
 * · `PENDING`·`SUBMITTED`에서만 폴링한다. `CONFIRMED`·`FAILED`는 **종단**이라 더 부르지 않는다.
 * · 간격은 응답의 `pollAfterMs`다(기본 1500). 혼잡하면 서버가 늘려 내려주므로 상수로 고정하지 않는다.
 * · 504 `CHAIN_TX_TIMEOUT`은 실패가 아니다 — "제출은 됐는데 확정이 임계를 넘었다"는 뜻이고
 *   **계속 폴링할 수 있다.** 이 코드에서 폴링을 멈추면 확정된 tx를 화면이 영영 못 본다.
 */

import { api, isApiError } from '@/shared/api/client'
import type { ApiData } from '@/shared/api/schema'
import { CHAIN_TX_TYPES } from '@/shared/api/types'
import type {
  ChainJobResultItem,
  ChainJobVerification,
  ChainSignerType,
  ChainTxType,
} from '@/shared/api/types'

/* ============================== 파생 타입·상수 ============================== */

type ChainJobDto = ApiData<'chain_01'>

export type ChainJobStatus = ChainJobDto['status']
/**
 * 응답의 `txType` 원본 문자열 유니온.
 *
 * ⚠ 생성물(`generated/openapi.ts`)과 손작성 `shared/api/types.ts`의 `ChainTxType`은 **개수가
 *   다를 수 있다.** 정본 openapi.yaml은 14종(`CREATE_SHOW`·`START_SALE` 포함 —
 *   2026-09-09 S15P21B204-67)인데 커밋된 생성물은 12종 시점의 것이다(`pnpm gen:api` 미실행).
 *   그래서 여기서는 생성 타입을 그대로 쓰고, 무효화 매핑(`invalidatedBy`)에 넘기기 전에
 *   `toKnownTxType`으로 **좁힌다.** 어느 쪽이 먼저 늘어나도 타입이 깨지지 않고, 매핑이 모르는
 *   tx는 조용히 무효화를 건너뛴다.
 */
export type ChainJobTxType = ChainJobDto['txType']

/** §0.3 — 다음 폴링까지 권장 대기 기본값. */
export const DEFAULT_POLL_AFTER_MS = 1500

/** 504 — 확정이 임계(기본 120초)를 넘김. 실패가 아니며 폴링을 이어 간다(API-chain-01 4xx/5xx). */
export const CHAIN_TX_TIMEOUT = 'CHAIN_TX_TIMEOUT'

/** 폴링을 계속해야 하는 상태(§0.3). */
const POLLING_STATUSES: readonly ChainJobStatus[] = ['PENDING', 'SUBMITTED']

/**
 * `invalidatedBy`가 다루는 tx 종류 — **`shared/api/types.ts`의 `ChainTxType`(14종)과 같은
 * 집합이어야 한다.** 타입만으로는 런타임 문자열을 좁힐 수 없어 값 목록이 한 벌 더 필요하다.
 * 빠뜨리면 그 tx가 확정돼도 캐시가 갱신되지 않으므로, 명세에 tx가 늘면 여기와 `keys.ts`를 같이 고친다.
 */
/**
 * 무효화 매핑이 아는 tx인지 좁힌다.
 *
 * `invalidatedBy(txType)`는 `ChainTxType`만 받고 `default` 분기가 없다. 명세가 새 tx를 추가하고
 * 서버가 그 값을 먼저 내려보내면 여기서 `null`이 되어 **무효화만** 건너뛴다 — 폴링·화면은 정상이다.
 */
export function toKnownTxType(txType: string): ChainTxType | null {
  return (CHAIN_TX_TYPES as readonly string[]).includes(txType) ? (txType as ChainTxType) : null
}

/** 폴링을 이어 가야 하는 에러인가(504 타임아웃). */
export function isChainTimeout(error: unknown): boolean {
  return isApiError(error) && error.code === CHAIN_TX_TIMEOUT
}

/* ============================== 뷰모델 ============================== */

/**
 * `GET /chain/jobs/{jobId}` 응답.
 *
 * 필드 이름은 응답과 1:1이고, 맨 아래 4개만 화면 조건문을 줄이려고 더한 **파생값**이다.
 */
export interface ChainJobView {
  jobId: string
  txType: ChainJobTxType
  /** `invalidatedBy`에 넘길 수 있는 값으로 좁힌 것. 모르는 tx면 null */
  knownTxType: ChainTxType | null
  signerType: ChainSignerType
  /** 지급 어댑터 감사 컬럼. MVP는 항상 MOCK이며 분기 로직을 만들지 않는다 */
  issuerType: string | null
  /** `signerType=USER`면 항상 true */
  feeDelegated: boolean
  /** 대납한 운영지갑 주소. 사용자가 익스플로러에서 "수수료를 누가 냈는지" 확인한다 */
  feePayerAddress: string | null
  status: ChainJobStatus
  walletAddress: string | null
  performanceId: number | null
  orderId: number | null
  /** YoYo 정수. 금액이 없는 job은 null */
  amount: number | null
  currency: 'KRW' | null
  txHash: string | null
  /** 서버가 완성해 내려준 절대 URL. **프론트가 조립하지 않는다**(§0.7) */
  explorerUrl: string | null
  blockNumber: number | null
  /** 사용자 서명 tx의 receipt 검증 5항목(§0.4). 어긋난 항목으로 문구를 고른다 */
  verification: ChainJobVerification | null
  retryCount: number
  /** 규격 코드 문자열(예: `CHAIN_NONCE_CONFLICT`·`PAYMENT_AMOUNT_MISMATCH`) */
  failureReason: string | null
  /** `signerType=USER`면 항상 false — 서버가 발신자 서명을 다시 만들 수 없다 */
  retryable: boolean
  /** 부분 성공(공연 취소 일괄 환불·release)의 건별 결과 */
  results: ChainJobResultItem[] | null
  pollAfterMs: number | null
  /** `txType=MINT`일 때만 — `SIGNUP`(가입 자동) / `ADMIN`(관리자 지급) */
  grantSource: string | null
  submittedAt: string | null
  confirmedAt: string | null
  createdAt: string | null

  /* 파생 */
  /** `PENDING`·`SUBMITTED` — 아직 폴링해야 한다 */
  isPolling: boolean
  /** `CONFIRMED`·`FAILED` — 더 부르지 않는다 */
  isTerminal: boolean
  isConfirmed: boolean
  isFailed: boolean
}

/* =========================== unknown 안전 읽기 =========================== */
/*
 * `verification`·`results`는 openapi에서 `additionalProperties: true`로 열려 있어 생성 타입이
 * `{ [key: string]: unknown }`이다. 캐스팅 한 번으로 넘기면 서버가 모양을 바꿨을 때 화면에서
 * `undefined.checks`로 터진다. 그래서 읽을 때 타입을 확인한다.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asBoolean(value: unknown): boolean {
  return typeof value === 'boolean' ? value : false
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function toVerification(value: unknown): ChainJobVerification | null {
  const record = asRecord(value)
  if (!record) return null
  const checks = asRecord(record.checks) ?? {}
  return {
    verified: asBoolean(record.verified),
    expectedEvent: asStringOrNull(record.expectedEvent),
    checks: {
      receiptStatus: asBoolean(checks.receiptStatus),
      to: asBoolean(checks.to),
      from: asBoolean(checks.from),
      event: asBoolean(checks.event),
      args: asBoolean(checks.args),
    },
    mismatchFields: asStringArray(record.mismatchFields),
  }
}

function toResults(value: unknown): ChainJobResultItem[] | null {
  if (!Array.isArray(value)) return null
  return value.map((raw) => {
    const record = asRecord(raw) ?? {}
    const item: ChainJobResultItem = {
      status: asStringOrNull(record.status) ?? '',
      reason: asStringOrNull(record.reason),
      txHash: asStringOrNull(record.txHash),
    }
    const teamId = asNumberOrUndefined(record.teamId)
    if (teamId !== undefined) item.teamId = teamId
    const ticketId = asNumberOrUndefined(record.ticketId)
    if (ticketId !== undefined) item.ticketId = ticketId
    const amount = asNumberOrUndefined(record.amount)
    if (amount !== undefined) item.amount = amount
    if (typeof record.retryable === 'boolean') item.retryable = record.retryable
    return item
  })
}

/* ============================== 매퍼 ============================== */

export function toChainJobView(dto: ChainJobDto): ChainJobView {
  const isConfirmed = dto.status === 'CONFIRMED'
  const isFailed = dto.status === 'FAILED'
  return {
    jobId: dto.jobId,
    txType: dto.txType,
    knownTxType: toKnownTxType(dto.txType),
    signerType: dto.signerType,
    issuerType: dto.issuerType ?? null,
    // signerType=USER면 명세상 항상 true다. 서버가 필드를 빠뜨려도 그 규칙으로 채운다(§0.3)
    feeDelegated: dto.feeDelegated ?? dto.signerType === 'USER',
    feePayerAddress: dto.feePayerAddress ?? null,
    status: dto.status,
    walletAddress: dto.walletAddress ?? null,
    performanceId: dto.performanceId ?? null,
    orderId: dto.orderId ?? null,
    amount: dto.amount ?? null,
    currency: dto.currency ?? null,
    txHash: dto.txHash ?? null,
    explorerUrl: dto.explorerUrl ?? null,
    blockNumber: dto.blockNumber ?? null,
    verification: toVerification(dto.verification),
    retryCount: dto.retryCount ?? 0,
    failureReason: dto.failureReason ?? null,
    retryable: dto.retryable ?? false,
    results: toResults(dto.results),
    pollAfterMs: dto.pollAfterMs ?? null,
    grantSource: dto.grantSource ?? null,
    submittedAt: dto.submittedAt ?? null,
    confirmedAt: dto.confirmedAt ?? null,
    createdAt: dto.createdAt ?? null,

    isPolling: POLLING_STATUSES.includes(dto.status),
    isTerminal: isConfirmed || isFailed,
    isConfirmed,
    isFailed,
  }
}

/**
 * 다음 폴링까지 기다릴 ms. 더 폴링하지 않아도 되면 `false`.
 *
 * 데이터와 에러를 함께 본다 — 504 타임아웃은 에러지만 **폴링을 이어 가야** 하기 때문이다.
 * 마지막 성공 응답의 `pollAfterMs`가 있으면 그 간격을 유지한다(서버가 혼잡도를 반영한 값).
 */
export function nextPollInterval(job: ChainJobView | undefined, error: unknown): number | false {
  if (error && !isChainTimeout(error)) return false
  if (!job) return isChainTimeout(error) ? DEFAULT_POLL_AFTER_MS : false
  if (!job.isPolling) return false
  return job.pollAfterMs ?? DEFAULT_POLL_AFTER_MS
}

/* ============================== fetch 함수 ============================== */

/**
 * API-chain-01 · `GET /api/v1/chain/jobs/{jobId}`.
 *
 * 작업을 만든 회원(또는 ADMIN)만 조회할 수 있고, 남의 작업은 존재를 숨겨 404
 * `COMMON_NOT_FOUND`로 온다 — "없는 job"과 구분되지 않으니 화면은 둘을 같게 처리한다.
 */
export async function getChainJob(
  jobId: string,
  options: { signal?: AbortSignal } = {},
): Promise<ChainJobView> {
  const data = await api.get<ChainJobDto>('/chain/jobs/' + encodeURIComponent(jobId), {
    signal: options.signal,
  })
  return toChainJobView(data)
}
