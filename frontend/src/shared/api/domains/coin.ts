/**
 * coin 도메인 — 발행량 공시·표시 환율·체인 설정·시연용 지급.
 *
 * 정본 · `docs/design/api/openapi.yaml` operationId `coin_01`·`coin_02`·`coin_03`·`coin_04`·`coin_07`·`coin_08`
 *        `docs/design/06_API_명세서_v6.md` API-coin-01~08(3509행~)
 *        화면 V-02(발행량·에스크로 공시) · M-03(표시 환율·코인 지급)
 *
 * ─────────────────── 지급 중단 판정에 `supplyMatched`를 쓰지 않는다 ───────────────────
 * `supplyMatched`는 **불변식 ①·④(총량 대사)만** 본다. 불변식 ③(정산 재계산 `RELEASED_EQUALS_RULE_RECALC`)이
 * 어긋나면 **`releaseHalted`만 켜지고 `supplyMatched`는 true로 남는다**(2026-09-10 백엔드 확인).
 *
 * openapi description에는 아직 "supplyMatched가 false면 mintHalted·releaseHalted가 모두 true"라고
 * **반대로** 적혀 있다. 그 문장을 믿고 `supplyMatched` 하나로 지급 중단을 판단하면, ③만 깨진 상황에서
 * 정산금 지급이 멈췄는데 화면은 "대사 결과: 일치"라고 표시한다 — 운영자가 원인을 알 수 없다.
 *
 * **그래서 이 매퍼는 세 값을 각각 그대로 노출하고 하나로 합치지 않는다.**
 * 중단 판정 로직은 `features/admin/haltState.ts`(`haltStateOf`)가 정본이며, 이 파일이 내보내는
 * `CoinSupply`는 그 함수의 `HaltInput`(supplyMatched·mintHalted·releaseHalted·invariants[{no,matched}])을
 * 그대로 만족한다.
 *
 * ─────────────────────────── 매퍼가 고치는 명세 버그 하나 ───────────────────────────
 * `CoinSupplyInvariant`의 번호 필드 이름이 생성 타입에서 **`false`** 다. `openapi.yaml`에 `no:`로 적혀
 * YAML 1.1이 그것을 boolean `false`로 파싱한 결과다(따옴표 누락). 값 자체는 1|2|3|4로 맞다.
 * 화면이 `invariant.false`를 읽는 일이 없도록 **여기서 `no`로 되돌린다.** 명세 수정 요청 대상이다.
 */

import { api } from '@/shared/api/client'
import { int, list, nullableInt, nullableText, text } from '@/shared/api/domains/_mapper'
import type { QueryParams } from '@/shared/api/client'
import type { ApiBody, ApiData, ApiQuery } from '@/shared/api/schema'
import type { ChainJobAccepted } from '@/shared/api/types'

/* ============================ 생성 타입 별칭 ============================ */

type CoinSupplyResponse = ApiData<'coin_01'>
type CoinSupplyInvariantResponse = NonNullable<CoinSupplyResponse['invariants']>[number]
type CoinSupplyIssuerResponse = NonNullable<CoinSupplyResponse['issuer']>
type CoinSupplyDisplayResponse = NonNullable<CoinSupplyResponse['display']>
type PerPerformanceEscrowResponse = NonNullable<CoinSupplyResponse['perPerformanceEscrow']>[number]
type ExchangeRateListResponse = ApiData<'coin_02'>
type ExchangeRateResponse = NonNullable<ExchangeRateListResponse['rates']>[number]
type ExchangeRateRegisterResponse = ApiData<'coin_03'>
type RegisteredRateResponse = NonNullable<ExchangeRateRegisterResponse['registered']>[number]
type ChainConfigResponse = ApiData<'coin_04'>
type GrantHistoryResponse = ApiData<'coin_08'>
type GrantHistoryItemResponse = NonNullable<GrantHistoryResponse['items']>[number]
type GrantHistorySummaryResponse = NonNullable<GrantHistoryResponse['summary']>
type ListRateResponse = NonNullable<GrantHistoryResponse['rate']>
type PageInfoResponse = NonNullable<GrantHistoryResponse['pageInfo']>

/* ============================== 도메인 타입 ============================== */

/** 결정 문서 v2 §3.8 불변식 4개 */
export type CoinInvariantName = NonNullable<CoinSupplyInvariantResponse['name']>
export type CoinIssuerType = NonNullable<CoinSupplyIssuerResponse['type']>
export type CoinGrantSource = NonNullable<GrantHistoryItemResponse['source']>
export type CoinGrantJobStatus = NonNullable<GrantHistoryItemResponse['status']>

/**
 * 불변식 1건의 검사 결과.
 *
 * `expected`·`actual`·`checkedShows`·`mismatchedShows`·`maxDiff`는 **불변식마다 채워지는 항목이 다르고**
 * 읽지 못하면 null이다. null이면 그 값을 못 읽은 것이므로 화면은 `matched`를 그대로 믿지 않고
 * "판정 불가"로 표시한다(V-02 상태 "값 일부 실패: 실패한 값만 —").
 */
export interface CoinSupplyInvariant {
  /** 1~4. 생성 타입의 `false` 필드를 되돌린 이름이다(파일 상단 참조) */
  no: 1 | 2 | 3 | 4
  name: CoinInvariantName
  expected: number | null
  actual: number | null
  checkedShows: number | null
  mismatchedShows: number | null
  maxDiff: number | null
  matched: boolean
  note: string
}

/** §0.5 표시 환산. **표시 전용**이며 요청으로 되돌리지 않는다 */
export interface CoinDisplay {
  currency: string
  approx: number
  /** `1 currency = rate KRW` */
  rate: number
  asOf: string
}

export interface CoinSupplyIssuer {
  type: CoinIssuerType
  /** 예: `Platform (demo grant)` */
  label: string
  replaceable: boolean
}

export interface CoinPerPerformanceEscrow {
  performanceId: number
  escrowAmount: number
  depositAmount: number
}

/** coin_01 200 `data` — 공개 API(`security: []`). V-02 화면 전체를 그린다 */
export interface CoinSupply {
  /** `YoYo.totalSupply()`. 소각이 없어 단조 증가 */
  totalSupply: number
  /** 전 공연 `escrowOf` 합 + 보증금 합 */
  escrowTotal: number
  /** 전 지갑 보유 합계. 정상 상태에서 `totalSupply − escrowTotal`과 같다 */
  walletTotal: number
  /** 확정된 MINT job 건수(= 지급 **횟수**. 금액이 아니다) */
  grantCount: number
  /**
   * **불변식 ①·④(총량 대사)만** 본다. 전체 대사 결과가 아니다.
   * ⚠ 중단 판정에 쓰지 마라 — `mintHalted`·`releaseHalted`를 각각 본다(파일 상단).
   */
  supplyMatched: boolean
  currency: string
  /** ⚠ `totalSupply`에 대한 환산이다. escrowTotal·walletTotal용 display는 응답에 없다 */
  display?: CoinDisplay
  issuer: CoinSupplyIssuer
  /** 코인 지급(mint) 중단 — 불변식 ① 또는 ④ 불일치 */
  mintHalted: boolean
  /** 정산금 지급(release) 중단 — 불변식 ①·④ **또는 ③** 불일치. 노드 조회 불가는 사유가 아니다 */
  releaseHalted: boolean
  network: string
  chainId: number
  tokenAddress: string
  tokenSymbol: string
  tokenDecimals: number
  /** 서버가 완성한 절대 URL(§0.7) */
  explorerUrl: string
  invariants: CoinSupplyInvariant[]
  perPerformanceEscrow: CoinPerPerformanceEscrow[]
  asOf: string
  nextRefreshAt: string
  /**
   * 노드에서 `totalSupply`·에스크로 중 하나라도 읽지 못했는지.
   * 등록 지갑 잔액 조회 실패는 여기 오지 않는다 — `walletTotal`이 `0`, 불변식 4가 미평가(값 null)로 온다.
   *
   * ⚠ 명세가 사유를 구분해 주지 않는다 — boolean 하나뿐이다. 두 조회 실패가 같은 `true`로 온다
   *   (사유는 불변식 `note`). **여기서 사유를 추측해 만들지 않는다.**
   */
  stale: boolean
  /** Accept-Language에 맞춘 고지 문구(CON-03) */
  disclosure: string
  grantNotice: string
}

/** `1 base = rate KRW` */
export interface ExchangeRate {
  pair: string
  base: string
  quote: string
  rate: number
  effectiveFrom: string
  source: string
}

/** coin_02 200 `data`. 등록된 환율이 없으면 `rates`는 빈 배열이다(404가 아니다) */
export interface ExchangeRateList {
  rates: ExchangeRate[]
  /** "표시 전용" 고지. 화면에 그대로 노출한다 */
  usageNotice: string
  refreshedAt: string
}

export interface RegisteredExchangeRate {
  rateId: number
  pair: string
  rate: number
  effectiveFrom: string
  source: string
}

/** coin_03 200 `data` */
export interface ExchangeRateRegisterResult {
  registered: RegisteredExchangeRate[]
  publishedBy: number
  cacheInvalidated: boolean
  usageNotice: string
}

/** coin_03 요청 본문. `effectiveFrom`은 **현재 이후**만 허용(과거는 400) */
export type ExchangeRateRegisterRequest = ApiBody<'coin_03'>

/** coin_04 200 `data` — 프론트 Web3Auth 초기화용. 서버 보관 키 주소는 담기지 않는다 */
export type ChainConfig = ChainConfigResponse

/** coin_07 요청 본문. `memberId`·`address`는 **택일**(둘 다 오면 400) */
export type CoinGrantRequest = ApiBody<'coin_07'>

/** coin_08 `items[]` — 원본은 `chain_job WHERE tx_type='MINT'`이다(별도 이력 테이블 없음) */
export interface CoinGrantHistoryItem {
  jobId: string
  /** SIGNUP(가입 자동) / ADMIN(관리자 수동) */
  source: CoinGrantSource
  status: CoinGrantJobStatus
  memberId: number
  memberName: string
  /** 관리자 화면이므로 대상 지갑 주소를 노출한다 */
  address: string
  /** YoYo 정수 */
  amount: number
  memo: string
  requesterId: number | null
  requesterName: string | null
  /** 멱등키 UUID의 해시. 온체인 `YoYo.mint`의 `grantRef`다 */
  grantRef: string
  txHash: string
  explorerUrl: string
  requestedAt: string
  confirmedAt: string | null
}

/**
 * coin_08 `summary`.
 * ⚠ `*Count`는 **건수**, `*Total`은 **YoYo 금액**이다. 라벨에서 섞지 않는다.
 */
export interface CoinGrantHistorySummary {
  grantCount: number
  /** 확정된 지급 **금액** 합. V-02 `totalSupply`와 같아야 한다(불변식 ①) */
  grantedTotal: number
  signupCount: number
  signupTotal: number
  adminCount: number
  adminTotal: number
  currency: string
}

/** §0.5 목록 축약형 환율 — 항목마다 display를 반복하지 않고 루트에 하나 둔다 */
export interface ListRate {
  currency: string
  rate: number
  asOf: string
}

export interface PageInfo {
  /** 0-base */
  page: number
  size: number
  totalElements: number
  hasNext: boolean
}

/** coin_08 200 `data` */
export interface CoinGrantHistory {
  rate?: ListRate
  summary: CoinGrantHistorySummary
  items: CoinGrantHistoryItem[]
  pageInfo: PageInfo
}

/* ============================ 목록 파라미터 ============================ */

/** coin_08 쿼리. 키 안정화를 위해 아래 `normalizeGrantListParams`를 거쳐서만 쓴다 */
export type CoinGrantListParams = NonNullable<ApiQuery<'coin_08'>>

/** coin_02 쿼리 */
export type ExchangeRateListParams = NonNullable<ApiQuery<'coin_02'>>

/**
 * 목록 파라미터 정규화.
 *
 * TanStack Query 키는 객체를 안정 직렬화하지만 **`undefined` 필드가 있고 없고는 다른 키**가 된다
 * (shared/queries/keys 주석). 그래서 서버 기본값을 여기서 한 번 채워 키와 요청이 늘 같은 모양이 되게 한다.
 */
export function normalizeGrantListParams(params: CoinGrantListParams = {}): CoinGrantListParams {
  return {
    source: params.source,
    status: params.status,
    memberId: params.memberId,
    address: params.address,
    from: params.from,
    to: params.to,
    page: params.page ?? 0,
    size: params.size ?? 20,
    sort: params.sort ?? 'requestedAt,desc',
  }
}

/* =============================== 매퍼 =============================== */

/**
 * 불변식 한 줄.
 *
 * 읽지 못한 값은 0이 아니라 **null**로 남긴다 — "0이었다"와 "못 읽었다"는 다른 말이다.
 * 공시에서 이 둘을 뭉개면 대사가 맞는지 틀리는지를 화면이 판단할 수 없다.
 */
function toInvariant(raw: CoinSupplyInvariantResponse): CoinSupplyInvariant {
  return {
    no: raw.no ?? 1,
    name: raw.name ?? 'SUPPLY_EQUALS_MINTED',
    expected: nullableInt(raw.expected),
    actual: nullableInt(raw.actual),
    checkedShows: nullableInt(raw.checkedShows),
    mismatchedShows: nullableInt(raw.mismatchedShows),
    maxDiff: nullableInt(raw.maxDiff),
    // 모르면 "일치"라고 하지 않는다. 대사 결과를 낙관적으로 채우면 공시의 의미가 없다.
    matched: raw.matched === true,
    note: text(raw.note),
  }
}

function toDisplay(raw: CoinSupplyDisplayResponse | undefined): CoinDisplay | undefined {
  if (!raw) return undefined
  return {
    currency: text(raw.currency),
    approx: int(raw.approx),
    rate: int(raw.rate),
    asOf: text(raw.asOf),
  }
}

function toIssuer(raw: CoinSupplyIssuerResponse | undefined): CoinSupplyIssuer {
  return {
    type: raw?.type ?? 'MOCK',
    label: text(raw?.label),
    replaceable: raw?.replaceable === true,
  }
}

function toPerPerformanceEscrow(raw: PerPerformanceEscrowResponse): CoinPerPerformanceEscrow {
  return {
    performanceId: int(raw.performanceId),
    escrowAmount: int(raw.escrowAmount),
    depositAmount: int(raw.depositAmount),
  }
}

export function toCoinSupply(raw: CoinSupplyResponse): CoinSupply {
  return {
    totalSupply: int(raw.totalSupply),
    escrowTotal: int(raw.escrowTotal),
    walletTotal: int(raw.walletTotal),
    grantCount: int(raw.grantCount),
    // 세 플래그를 각각 옮긴다. 하나로 합치지 않는다(파일 상단).
    supplyMatched: raw.supplyMatched === true,
    currency: raw.currency ?? 'KRW',
    display: toDisplay(raw.display),
    issuer: toIssuer(raw.issuer),
    mintHalted: raw.mintHalted === true,
    releaseHalted: raw.releaseHalted === true,
    network: text(raw.network),
    chainId: int(raw.chainId),
    tokenAddress: text(raw.tokenAddress),
    tokenSymbol: raw.tokenSymbol ?? 'YoYo',
    tokenDecimals: int(raw.tokenDecimals),
    explorerUrl: text(raw.explorerUrl),
    invariants: list(raw.invariants).map(toInvariant),
    perPerformanceEscrow: list(raw.perPerformanceEscrow).map(toPerPerformanceEscrow),
    asOf: text(raw.asOf),
    nextRefreshAt: text(raw.nextRefreshAt),
    stale: raw.stale === true,
    disclosure: text(raw.disclosure),
    grantNotice: text(raw.grantNotice),
  }
}

function toExchangeRate(raw: ExchangeRateResponse): ExchangeRate {
  return {
    pair: text(raw.pair),
    base: text(raw.base),
    quote: raw.quote ?? 'KRW',
    rate: int(raw.rate),
    effectiveFrom: text(raw.effectiveFrom),
    source: text(raw.source),
  }
}

export function toExchangeRateList(raw: ExchangeRateListResponse): ExchangeRateList {
  return {
    rates: list(raw.rates).map(toExchangeRate),
    usageNotice: text(raw.usageNotice),
    refreshedAt: text(raw.refreshedAt),
  }
}

export function toExchangeRateRegisterResult(
  raw: ExchangeRateRegisterResponse,
): ExchangeRateRegisterResult {
  return {
    registered: list(raw.registered).map((item: RegisteredRateResponse) => ({
      rateId: int(item.rateId),
      pair: text(item.pair),
      rate: int(item.rate),
      effectiveFrom: text(item.effectiveFrom),
      source: text(item.source),
    })),
    publishedBy: int(raw.publishedBy),
    cacheInvalidated: raw.cacheInvalidated === true,
    usageNotice: text(raw.usageNotice),
  }
}

function toGrantItem(raw: GrantHistoryItemResponse): CoinGrantHistoryItem {
  return {
    jobId: text(raw.jobId),
    source: raw.source ?? 'ADMIN',
    status: raw.status ?? 'PENDING',
    memberId: int(raw.memberId),
    memberName: text(raw.memberName),
    address: text(raw.address),
    amount: int(raw.amount),
    memo: text(raw.memo),
    // 가입 자동 지급은 요청자가 없다(`requester_member_id IS NULL`). 0으로 채우면 회원 1번이 된다.
    requesterId: nullableInt(raw.requesterId),
    requesterName: nullableText(raw.requesterName),
    grantRef: text(raw.grantRef),
    txHash: text(raw.txHash),
    explorerUrl: text(raw.explorerUrl),
    requestedAt: text(raw.requestedAt),
    confirmedAt: nullableText(raw.confirmedAt),
  }
}

function toGrantSummary(raw: GrantHistorySummaryResponse | undefined): CoinGrantHistorySummary {
  return {
    grantCount: int(raw?.grantCount),
    grantedTotal: int(raw?.grantedTotal),
    signupCount: int(raw?.signupCount),
    signupTotal: int(raw?.signupTotal),
    adminCount: int(raw?.adminCount),
    adminTotal: int(raw?.adminTotal),
    currency: raw?.currency ?? 'KRW',
  }
}

function toListRate(raw: ListRateResponse | undefined): ListRate | undefined {
  if (!raw) return undefined
  return { currency: text(raw.currency), rate: int(raw.rate), asOf: text(raw.asOf) }
}

function toPageInfo(raw: PageInfoResponse | undefined): PageInfo {
  return {
    page: int(raw?.page),
    size: int(raw?.size),
    totalElements: int(raw?.totalElements),
    hasNext: raw?.hasNext === true,
  }
}

export function toCoinGrantHistory(raw: GrantHistoryResponse): CoinGrantHistory {
  return {
    rate: toListRate(raw.rate),
    summary: toGrantSummary(raw.summary),
    items: list(raw.items).map(toGrantItem),
    pageInfo: toPageInfo(raw.pageInfo),
  }
}

/* ============================== 요청 함수 ============================== */

/**
 * API-coin-01 `GET /coin/supply` — **공개**(`security: []`). 서버 1분 캐시.
 * 429 `COMMON_TOO_MANY_REQUESTS` · 502 `COMMON_EXTERNAL_SERVICE_ERROR`(캐시도 없음).
 *
 * ⚠ 공개 API지만 `skipAuth`를 쓰지 **않는다.** §0.6이 "로그인 회원은 프로필 locale이 우선"이라
 *   고지 문구(`disclosure`·`grantNotice`)를 회원 언어로 받으려면 토큰이 붙어야 한다.
 *   비로그인이면 애초에 붙일 토큰이 없어 그대로 공개 호출이 된다.
 *   (인증 헤더가 **붙으면 안 되는** 경로는 정산 공유 링크 하나다 — `domains/settlement.ts` 참조)
 */
export async function fetchCoinSupply(): Promise<CoinSupply> {
  const raw = await api.get<CoinSupplyResponse>('/coin/supply')
  return toCoinSupply(raw)
}

/**
 * API-coin-02 `GET /coin/rates` — 공개. 등록된 환율이 없으면 **빈 배열 200**이다(404가 아니다).
 * 400 `COMMON_VALIDATION_FAILED`(`pair` 형식) · 429.
 */
export async function fetchExchangeRates(
  params: ExchangeRateListParams = {},
): Promise<ExchangeRateList> {
  const query: QueryParams = { pair: params.pair }
  const raw = await api.get<ExchangeRateListResponse>('/coin/rates', { query })
  return toExchangeRateList(raw)
}

/**
 * API-coin-03 `PUT /admin/coin/rates` — ADMIN. **append-only**(기존 레코드를 고치지 않는다).
 * 여러 pair를 한 번에 등록하고 **부분 실패 없이 전량 롤백**한다.
 * 400(`pair` 형식·`rate` ≤ 0·`effectiveFrom` 과거·배열 내 중복) · 401 · 403.
 */
export async function registerExchangeRates(
  body: ExchangeRateRegisterRequest,
): Promise<ExchangeRateRegisterResult> {
  const raw = await api.put<ExchangeRateRegisterResponse>('/admin/coin/rates', body)
  return toExchangeRateRegisterResult(raw)
}

/**
 * API-coin-04 `GET /coin/config` — 공개. P1이며 MVP는 프론트 환경변수로 대체한다.
 * 500 `COMMON_INTERNAL_ERROR`는 **컨트랙트 주소 설정 누락(배포 전)** 을 뜻한다 —
 * `kairos.json` 커밋 전에는 이 값이 비어 있을 수 있고, 그때 화면은 체인 기능을 비활성으로 표시한다.
 */
export function fetchChainConfig(): Promise<ChainConfig> {
  return api.get<ChainConfigResponse>('/coin/config')
}

export interface GrantCoinParams {
  body: CoinGrantRequest
  /**
   * §0.8 **필수**. 헤더의 UUID가 `chain_job.idempotency_key`가 되고 그 해시가 온체인
   * `YoYo.mint`의 `grantRef`가 된다. **재시도할 때 같은 키를 다시 넘겨야** 두 번 발행되지 않는다.
   * 그래서 이 계층이 자동 생성하지 않는다 — 생성·보관은 호출부 책임이다.
   */
  idempotencyKey: string
}

/**
 * API-coin-07 `PUT /admin/coin/grants` → **202 + jobId**(tx_type=MINT, signer_type=OPERATOR).
 *
 * 1회 1 ~ 1,000,000 YoYo. `mintHalted` 상태면 409 `COIN_RESERVE_MISMATCH`로 거절된다
 * (규격 개명 제안 `COIN_SUPPLY_MISMATCH`는 §16.1 — 배포 코드는 기존 이름이다).
 * 한도 초과는 400 `COMMON_VALIDATION_FAILED`(전용 코드 `COIN_GRANT_LIMIT_EXCEEDED`도 §16.1 제안).
 * 관리자당 30회/분 → 429 + `Retry-After`.
 */
export function grantCoin(params: GrantCoinParams): Promise<ChainJobAccepted> {
  return api.put<ChainJobAccepted>('/admin/coin/grants', params.body, {
    idempotencyKey: params.idempotencyKey,
  })
}

/**
 * API-coin-08 `GET /admin/coin/grants` — ADMIN. 가입 자동 지급(SIGNUP)과 관리자 지급(ADMIN)이 섞여 나온다.
 * 400(허용되지 않는 `source`·`status`·`sort`, `size` 100 초과) · 401 · 403.
 */
export async function fetchCoinGrants(params: CoinGrantListParams = {}): Promise<CoinGrantHistory> {
  const p = normalizeGrantListParams(params)
  const query: QueryParams = {
    source: p.source,
    status: p.status,
    memberId: p.memberId,
    address: p.address,
    from: p.from,
    to: p.to,
    page: p.page,
    size: p.size,
    sort: p.sort,
  }
  const raw = await api.get<GrantHistoryResponse>('/admin/coin/grants', { query })
  return toCoinGrantHistory(raw)
}
