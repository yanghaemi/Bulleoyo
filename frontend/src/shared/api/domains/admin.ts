/**
 * admin 도메인 — 이의제기 목록·처리(M-02).
 *
 * 정본 · `docs/design/api/openapi.yaml` operationId `admin_09`(목록) · `admin_06`(처리)
 *        `docs/design/06_API_명세서_v6.md` API-admin-09(5083행) · API-admin-06(5148행)
 *        화면 M-02 이의제기 처리
 *
 * P0 admin API는 이 둘뿐이다(01~05·07·08은 P1). M-03의 코인 지급·표시 환율은 admin이 아니라
 * coin 도메인이다 — `domains/coin.ts`를 쓴다. 여기에 중복 정의하지 않는다.
 *
 * ──────────────────────── `RESOLVED`는 "환불"이 아니다 ────────────────────────
 * `admin_06`은 **온체인 tx를 만들지 않는다.** 이의 상태만 바꾼다.
 *   · `REJECTED` → release 보류가 풀려 자동 스케줄이 재개된다.
 *   · `RESOLVED` → 잠금이 이미 온체인에 확정돼 **재집계가 불가능**하다. 관리자는 그대로 release를
 *     진행하거나(API-settlement-05) 전액 환불 판정 후 공연 취소 경로(API-performance-12)로 간다.
 *   **`AGGREGATED`로 되돌리는 경로는 없다.** 화면이 "재집계" 버튼을 만들면 안 된다.
 *
 * 에러 code → 문구 매핑은 `features/admin/adminMessages.ts`가 정본이다. 여기서 중복 정의하지 않는다.
 */

import { api } from '@/shared/api/client'
import { int, nullableInt, nullableText, text } from '@/shared/api/domains/_mapper'
import type { QueryParams } from '@/shared/api/client'
import type { ApiBody, ApiData, ApiQuery } from '@/shared/api/schema'

/* ============================ 생성 타입 별칭 ============================ */

type DisputeListResponse = ApiData<'admin_09'>
type DisputeListItemResponse = NonNullable<DisputeListResponse['items']>[number]
type DisputeListSummaryResponse = NonNullable<DisputeListResponse['summary']>
type DisputePageInfoResponse = NonNullable<DisputeListResponse['pageInfo']>
type DisputeResolveResponse = ApiData<'admin_06'>

/* ============================== 도메인 타입 ============================== */

export type DisputeStatus = NonNullable<DisputeListItemResponse['status']>
export type DisputeSettlementStatus = NonNullable<DisputeListItemResponse['settlementStatus']>
/** 처리 결과는 `OPEN`으로 되돌릴 수 없다 */
export type DisputeResolution = NonNullable<DisputeResolveResponse['status']>

/** admin_09 `data.summary` — 우선순위 판단용 */
export interface DisputeAdminListSummary {
  openCount: number
  /** release가 **보류된 정산 수**. 이의 건수가 아니다(한 정산에 이의가 여럿일 수 있다) */
  releaseHeldCount: number
}

/** admin_09 `data.items[]`. 관객 개인정보는 담기지 않는다 */
export interface DisputeAdminListItem {
  disputeId: number
  performanceId: number
  performanceTitle: string
  teamId: number
  teamName: string
  status: DisputeStatus
  /** 사유 전문. 상세 패널이 그대로 보여준다 */
  reason: string
  /** 팀이 주장하는 정산액(참고용, YoYo 정수). 제출하지 않았으면 null */
  expectedAmount: number | null
  currency: string
  /** 이 이의가 걸린 정산의 상태 */
  settlementStatus: DisputeSettlementStatus
  /** 이의제기 마감(잠금 + 48h) */
  disputeClosesAt: string | null
  /** 이 이의로 release가 보류 중인지 */
  releaseHeld: boolean
  createdAt: string
  resolvedAt: string | null
}

export interface DisputePageInfo {
  /** 0-base */
  page: number
  size: number
  totalElements: number
  hasNext: boolean
}

/** admin_09 200 `data` */
export interface DisputeAdminList {
  summary: DisputeAdminListSummary
  items: DisputeAdminListItem[]
  pageInfo: DisputePageInfo
}

/** admin_06 요청 본문. `adminComment`는 10~1000자이며 **참여팀에 공개**된다 */
export type DisputeResolveRequest = ApiBody<'admin_06'>

/** admin_06 200 `data` */
export interface DisputeResolveResult {
  disputeId: number
  performanceId: number
  teamId: number
  status: DisputeResolution
  /** 처리 후에도 release가 보류 중인지(같은 정산에 열린 이의가 더 있으면 true로 남는다) */
  releaseHeld: boolean
  resolvedAt: string
}

/* ============================ 목록 파라미터 ============================ */

export type DisputeListParams = NonNullable<ApiQuery<'admin_09'>>

/**
 * 목록 파라미터 정규화. 기본값은 명세가 정한 **미처리 우선·오래된 순**이다
 * (`status=OPEN` → `createdAt,asc`) — release 보류를 풀어야 하는 건이 위로 온다.
 *
 * ⚠ `sort` enum이 `createdAt`·`disputeClosesAt` **필드명뿐**이라 방향(`,asc`)을 붙일 수 없다.
 *   명세는 "기본값은 createdAt,asc"라고 쓰면서 enum에는 방향 없는 값만 뒀다 — 불일치로 보고했다.
 *   지금은 enum이 허용하는 값만 보낸다(방향은 서버 기본값에 맡긴다).
 */
export function normalizeDisputeListParams(params: DisputeListParams = {}): DisputeListParams {
  return {
    status: params.status,
    performanceId: params.performanceId,
    page: params.page ?? 0,
    size: params.size ?? 20,
    sort: params.sort ?? 'createdAt',
  }
}

/* =============================== 매퍼 =============================== */

function toListItem(raw: DisputeListItemResponse): DisputeAdminListItem {
  return {
    disputeId: int(raw.disputeId),
    performanceId: int(raw.performanceId),
    performanceTitle: text(raw.performanceTitle),
    teamId: int(raw.teamId),
    teamName: text(raw.teamName),
    status: raw.status ?? 'OPEN',
    reason: text(raw.reason),
    // 제출하지 않은 주장액을 0으로 채우면 "0원을 주장했다"가 된다. null로 남긴다.
    expectedAmount: nullableInt(raw.expectedAmount),
    currency: raw.currency ?? 'KRW',
    settlementStatus: raw.settlementStatus ?? 'NONE',
    disputeClosesAt: nullableText(raw.disputeClosesAt),
    releaseHeld: raw.releaseHeld === true,
    createdAt: text(raw.createdAt),
    resolvedAt: nullableText(raw.resolvedAt),
  }
}

function toSummary(raw: DisputeListSummaryResponse | undefined): DisputeAdminListSummary {
  return {
    openCount: int(raw?.openCount),
    releaseHeldCount: int(raw?.releaseHeldCount),
  }
}

function toPageInfo(raw: DisputePageInfoResponse | undefined): DisputePageInfo {
  return {
    page: int(raw?.page),
    size: int(raw?.size),
    totalElements: int(raw?.totalElements),
    hasNext: raw?.hasNext === true,
  }
}

export function toDisputeAdminList(raw: DisputeListResponse): DisputeAdminList {
  return {
    summary: toSummary(raw.summary),
    items: (raw.items ?? []).map(toListItem),
    pageInfo: toPageInfo(raw.pageInfo),
  }
}

export function toDisputeResolveResult(raw: DisputeResolveResponse): DisputeResolveResult {
  return {
    disputeId: int(raw.disputeId),
    performanceId: int(raw.performanceId),
    teamId: int(raw.teamId),
    status: raw.status ?? 'REJECTED',
    releaseHeld: raw.releaseHeld === true,
    resolvedAt: text(raw.resolvedAt),
  }
}

/* ============================== 요청 함수 ============================== */

/**
 * API-admin-09 `GET /admin/disputes` — ADMIN.
 * 400(허용되지 않는 `status`·`sort`, `size` 100 초과) · 401 · 403.
 */
export async function fetchAdminDisputes(
  params: DisputeListParams = {},
): Promise<DisputeAdminList> {
  const p = normalizeDisputeListParams(params)
  const query: QueryParams = {
    status: p.status,
    performanceId: p.performanceId,
    page: p.page,
    size: p.size,
    sort: p.sort,
  }
  const raw = await api.get<DisputeListResponse>('/admin/disputes', { query })
  return toDisputeAdminList(raw)
}

/**
 * API-admin-06 `PATCH /admin/disputes/{disputeId}` — ADMIN. **온체인 tx 없음**(동기 200).
 * 400(허용되지 않는 `status`, 사유 길이) · 403 · 404 · 409 `COMMON_CONFLICT`(이미 처리됨)
 * · 409 `SETTLEMENT_ALREADY_RELEASED`.
 */
export async function resolveDispute(
  disputeId: number,
  body: DisputeResolveRequest,
): Promise<DisputeResolveResult> {
  const raw = await api.patch<DisputeResolveResponse>('/admin/disputes/' + String(disputeId), body)
  return toDisputeResolveResult(raw)
}
