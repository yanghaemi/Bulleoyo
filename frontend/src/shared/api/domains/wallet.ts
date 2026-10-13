/**
 * wallet 도메인 — 지갑 조회·거래 이력·등록 (API v6 §3).
 *
 * 정본: `docs/design/api/openapi.yaml`(operationId `wallet_01`~`wallet_04`) ·
 *      `docs/design/06_API_명세서_v6.md` §3
 *
 * ─────────────────────────── 이 도메인의 전제 ───────────────────────────
 * · **잔액을 늘리는 버튼이 없다.** 유일한 유입은 시연용 지급(`MINT`)이고 응답에 충전·출금 경로가
 *   없다(v5 §3 "이 장에서 사라진 것"). 가스 필드도 없다 — 수수료는 운영지갑이 전액 대납한다.
 * · 지갑은 **회원당 1개**이고 등록은 첫 1회뿐이다. 팀 리더가 부르면 그 응답이 곧 팀 지갑이다.
 * · 잔액 원장은 체인이고 응답은 Redis 캐시값이다. 노드 장애 시 `stale: true`가 온다(AVAIL-02) —
 *   이때도 화면은 마지막 값으로 계속 그린다.
 *
 * 보안 — 개인키·니모닉·MPC 샤드는 요청·응답 어디에도 없다. `signature`는 등록 1회용이고
 * 저장하지 않는다(기술 스택 v3 §3.2).
 */

import { api } from '@/shared/api/client'
import type { QueryParams } from '@/shared/api/client'
import { isApiError } from '@/shared/api/client'
import type { ApiBody, ApiData, ApiQuery, PageMeta } from '@/shared/api/schema'
import { toMoneyView, type MoneyView } from '@/shared/api/domains/member'

/* ============================== 파생 타입 ============================== */

export type WalletProvider = NonNullable<ApiData<'wallet_01'>['provider']>
export type WalletStatus = NonNullable<ApiData<'wallet_01'>['status']>
export type WalletNetwork = NonNullable<ApiData<'wallet_01'>['network']>

type WalletTxQueryDto = NonNullable<ApiQuery<'wallet_02'>>
/** `GRANT`·`PURCHASE`·`REFUND`·`RELEASE`·`DEPOSIT`·`DEPOSIT_RETURN` 6종(§3 API-wallet-02). */
export type WalletTxType = NonNullable<WalletTxQueryDto['type']>
export type WalletTxStatus = NonNullable<WalletTxQueryDto['status']>
export type WalletTxSort = NonNullable<WalletTxQueryDto['sort']>
export type WalletTxDirection = NonNullable<
  NonNullable<ApiData<'wallet_02'>['items']>[number]['direction']
>

/* ============================== 에러 코드 ============================== */

/**
 * wallet 도메인 전용 코드.
 *
 * ⚠ `WALLET_NOT_FOUND`(404)만 명세의 에러 표에 **실제 코드**로 적혀 있다.
 *   `WALLET_NOT_LINKED`·`WALLET_ALREADY_LINKED`·`WALLET_CHALLENGE_EXPIRED`·
 *   `WALLET_SIGNATURE_INVALID`는 §16.1 "신설 제안"이라 **아직 배포 문자열이 아니다.**
 *   지금 배포되는 코드는 각각 `COMMON_CONFLICT`(409) / `COMMON_VALIDATION_FAILED`(400)다.
 *   제안이 확정되면 여기만 고치면 된다 — 화면은 아래 술어만 쓴다.
 */
export const WalletCode = {
  /** 404 — 아직 지갑을 등록하지 않은 회원. 화면은 C-05(`/onboarding/wallet`)로 보낸다 */
  NOT_FOUND: 'WALLET_NOT_FOUND',
} as const

/**
 * "지갑이 아직 없다"인가. 404는 오류 화면이 아니라 **온보딩 분기**다.
 * wallet_01·wallet_02가 공통으로 이 코드를 쓴다.
 */
export function isWalletNotFound(error: unknown): boolean {
  return isApiError(error) && error.code === WalletCode.NOT_FOUND
}

/* ============================== 뷰모델 ============================== */

export interface WalletView {
  walletId: number | null
  provider: WalletProvider | null
  address: string | null
  status: WalletStatus | null
  verifiedAt: string | null
  balance: MoneyView | null
  /**
   * 지갑 등록 시 걸린 기본 지급 `MINT` job이 아직 확정 전이면 그 jobId.
   * 화면은 이 값을 `useChainJob`에 그대로 넘겨 "arriving…"을 표시한다(A-13·C-05).
   */
  pendingGrantJobId: string | null
  network: WalletNetwork | null
  chainId: number | null
  tokenAddress: string | null
  explorerUrl: string | null
  cachedAt: string | null
  /** 노드 조회 실패로 캐시값을 준 경우 true. 화면은 "최신이 아닐 수 있음"만 알린다 */
  stale: boolean
}

export interface WalletTransactionView {
  walletTxId: string
  type: WalletTxType | null
  direction: WalletTxDirection | null
  /** YoYo 정수. 부호는 `direction`이 들고 있다 — 금액 자체는 항상 양수다 */
  amount: number
  currency: 'KRW'
  status: WalletTxStatus | null
  /** 참조 원본 종류. 명세가 고정 enum으로 못 박지 않아 문자열 그대로 둔다(예: CHAIN_JOB·ORDER) */
  refType: string | null
  refId: number | null
  title: string | null
  signerType: 'OPERATOR' | 'USER' | null
  feeDelegated: boolean
  txHash: string | null
  explorerUrl: string | null
  occurredAt: string | null
}

/** 목록 축약형(§0.5) — 항목마다 `display`를 반복하지 않고 루트에 환율 하나를 둔다. */
export interface WalletRateView {
  currency: string
  rate: number
  asOf: string | null
}

export interface WalletTransactionPageView {
  items: WalletTransactionView[]
  rate: WalletRateView | null
  pageInfo: PageMeta
}

export interface WalletChallengeView {
  /** 16 hex. wallet_04 요청에 그대로 되돌려 보낸다 */
  nonce: string
  /** EIP-191 `personal_sign` 대상 평문. **한 글자도 바꾸지 않고** 지갑에 넘긴다 */
  message: string
  signMethod: string | null
  chainId: number | null
  /** 5분. 지나면 서버가 409로 막는다 */
  expiresAt: string | null
}

export interface WalletLinkedSummaryView {
  walletId: number | null
  provider: WalletProvider | null
  walletLabel: string | null
  address: string | null
  status: WalletStatus | null
  verifiedAt: string | null
  explorerUrl: string | null
}

/**
 * 지갑 등록 202 응답.
 *
 * ⚠ §0.3 표준 `ChainJobAccepted`(`jobId`·`status`·`pollAfterMs`)와 **모양이 다르다.**
 * 여기는 `grantJobId`이고 `status`가 없다. 폴링은 `grantJobId`를 `useChainJob`에 넘긴다.
 */
export interface WalletLinkResultView {
  wallet: WalletLinkedSummaryView | null
  /** 기본 지급 `MINT` job. 실패해도 지갑 등록 자체는 성공으로 남는다 */
  grantJobId: string | null
  /** 지급 금액(100,000 YoYo) */
  signupGrant: MoneyView | null
  pollAfterMs: number | null
}

/* ============================== 매퍼 ============================== */

export function toWalletView(dto: ApiData<'wallet_01'>): WalletView {
  return {
    walletId: dto.walletId ?? null,
    provider: dto.provider ?? null,
    address: dto.address ?? null,
    status: dto.status ?? null,
    verifiedAt: dto.verifiedAt ?? null,
    balance: toMoneyView(dto.balance),
    pendingGrantJobId: dto.pendingGrantJobId ?? null,
    network: dto.network ?? null,
    chainId: dto.chainId ?? null,
    tokenAddress: dto.tokenAddress ?? null,
    explorerUrl: dto.explorerUrl ?? null,
    cachedAt: dto.cachedAt ?? null,
    stale: dto.stale ?? false,
  }
}

function toRateView(dto: { currency?: string; rate?: number; asOf?: string } | undefined) {
  if (!dto) return null
  return {
    currency: dto.currency ?? '',
    rate: dto.rate ?? 0,
    asOf: dto.asOf ?? null,
  } satisfies WalletRateView
}

export function toWalletTransactionPageView(
  dto: ApiData<'wallet_02'>,
  fallback: { page: number; size: number },
): WalletTransactionPageView {
  const items = (dto.items ?? []).map<WalletTransactionView>((item) => ({
    // walletTxId는 `job_9901`처럼 원본 종류 접두가 붙은 문자열이다. 목록 key로 그대로 쓴다
    walletTxId: item.walletTxId ?? '',
    type: item.type ?? null,
    direction: item.direction ?? null,
    amount: item.amount ?? 0,
    currency: item.currency ?? 'KRW',
    status: item.status ?? null,
    refType: item.refType ?? null,
    refId: item.refId ?? null,
    title: item.title ?? null,
    signerType: item.signerType ?? null,
    feeDelegated: item.feeDelegated ?? false,
    txHash: item.txHash ?? null,
    explorerUrl: item.explorerUrl ?? null,
    occurredAt: item.occurredAt ?? null,
  }))

  return {
    items,
    rate: toRateView(dto.rate),
    // 규격상 pageInfo는 항상 온다(§0.2). 아래는 서버가 빠뜨렸을 때 목록이 깨지지 않게 하는 폴백이다
    pageInfo: {
      page: dto.pageInfo?.page ?? fallback.page,
      size: dto.pageInfo?.size ?? fallback.size,
      totalElements: dto.pageInfo?.totalElements ?? items.length,
      hasNext: dto.pageInfo?.hasNext ?? false,
    },
  }
}

/* ============================== 요청 타입·정규화 ============================== */

export type WalletChallengeRequest = ApiBody<'wallet_03'>
export type WalletLinkRequest = ApiBody<'wallet_04'>

/**
 * 거래 이력 조회 파라미터.
 *
 * `type`·`status`는 미지정 = 전체다. 나머지는 서버 기본값과 같은 값을 **여기서 채운다** —
 * 쿼리 키에 그대로 들어가므로 `{page:0}`과 `{}`가 다른 키가 되는 사고를 막는다(keys.ts 주의).
 */
export interface WalletTxQuery {
  type?: WalletTxType
  status?: WalletTxStatus
  page?: number
  size?: number
  sort?: WalletTxSort
}

export interface NormalizedWalletTxQuery {
  type: WalletTxType | null
  status: WalletTxStatus | null
  page: number
  size: number
  sort: WalletTxSort
}

/** 기본값은 명세(§0.2 · API-wallet-02 Query 표)와 같은 값이다. */
export const WALLET_TX_DEFAULT_SIZE = 20
export const WALLET_TX_DEFAULT_SORT: WalletTxSort = 'occurredAt,desc'
/** size 상한 100(§0.2). 넘기면 서버가 400으로 막으므로 보내기 전에 자른다 */
const WALLET_TX_MAX_SIZE = 100

export function normalizeWalletTxQuery(params: WalletTxQuery = {}): NormalizedWalletTxQuery {
  const size = params.size ?? WALLET_TX_DEFAULT_SIZE
  return {
    type: params.type ?? null,
    status: params.status ?? null,
    page: Math.max(0, params.page ?? 0),
    size: Math.min(Math.max(1, size), WALLET_TX_MAX_SIZE),
    sort: params.sort ?? WALLET_TX_DEFAULT_SORT,
  }
}

/* ============================== fetch 함수 ============================== */

/**
 * API-wallet-01 · `GET /api/v1/wallets/me` — 내 지갑(A-13 전체가 이 응답으로 그려진다).
 *
 * 404 `WALLET_NOT_FOUND`는 **정상 분기**다(아직 등록 전). 호출부는 `isWalletNotFound(error)`로
 * 판별해 C-05로 보낸다. 403 `COMMON_FORBIDDEN`은 `SUSPENDED` 지갑이다.
 */
export async function getMyWallet(options: { signal?: AbortSignal } = {}): Promise<WalletView> {
  const data = await api.get<ApiData<'wallet_01'>>('/wallets/me', { signal: options.signal })
  return toWalletView(data)
}

/** API-wallet-02 · `GET /api/v1/wallets/me/transactions` — 거래 이력(최신순). */
export async function getMyWalletTransactions(
  params: NormalizedWalletTxQuery,
  options: { signal?: AbortSignal } = {},
): Promise<WalletTransactionPageView> {
  // QueryParams로 명시 조립한다. null·undefined는 클라이언트가 쿼리스트링에서 빼 준다
  const query: QueryParams = {
    type: params.type,
    status: params.status,
    page: params.page,
    size: params.size,
    sort: params.sort,
  }
  const data = await api.get<ApiData<'wallet_02'>>('/wallets/me/transactions', {
    query,
    signal: options.signal,
  })
  return toWalletTransactionPageView(data, { page: params.page, size: params.size })
}

/**
 * API-wallet-03 · `POST /api/v1/wallets/challenge` — 외부 지갑 소유 증명 챌린지.
 *
 * 5분·1회용이고 같은 회원이 다시 부르면 이전 챌린지가 무효가 된다. 회원당 10회/분 제한이라
 * 429가 오면 `Retry-After`(초)가 `ApiError.retryAfterSeconds`에 담긴다(§0.9).
 * 발급받은 `message`는 **가공 없이** WalletAdapter의 `signMessage`로 넘긴다.
 */
export async function requestWalletChallenge(
  body: WalletChallengeRequest,
): Promise<WalletChallengeView> {
  const data = await api.post<ApiData<'wallet_03'>>('/wallets/challenge', body)
  return {
    nonce: data.nonce ?? '',
    message: data.message ?? '',
    signMethod: data.signMethod ?? null,
    chainId: data.chainId ?? null,
    expiresAt: data.expiresAt ?? null,
  }
}

/**
 * API-wallet-04 · `POST /api/v1/wallets` — 지갑 등록(회원당 첫 1회).
 *
 * `provider=WEB3AUTH`면 `{provider, address}` 두 필드로 끝나고, `EXTERNAL`이면 wallet_03의
 * `nonce`와 그 메시지 서명(`signature`)이 필수다. **202**이며 기본 지급 `MINT` job이 함께 걸린다 —
 * 호출부는 `grantJobId`를 `useChainJob`으로 폴링한다.
 * `Idempotency-Key`는 요구하지 않는다(§0.8 — "회원당 1개" 제약이 중복을 막는다).
 */
export async function linkWallet(body: WalletLinkRequest): Promise<WalletLinkResultView> {
  const data = await api.post<ApiData<'wallet_04'>>('/wallets', body)
  return {
    wallet: data.wallet
      ? {
          walletId: data.wallet.walletId ?? null,
          provider: data.wallet.provider ?? null,
          walletLabel: data.wallet.walletLabel ?? null,
          address: data.wallet.address ?? null,
          status: data.wallet.status ?? null,
          verifiedAt: data.wallet.verifiedAt ?? null,
          explorerUrl: data.wallet.explorerUrl ?? null,
        }
      : null,
    grantJobId: data.grantJobId ?? null,
    signupGrant: toMoneyView(data.signupGrant),
    pollAfterMs: data.pollAfterMs ?? null,
  }
}
