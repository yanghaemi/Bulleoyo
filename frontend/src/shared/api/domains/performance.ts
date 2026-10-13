/**
 * performance 도메인 REST 함수 — API-performance-01 ~ 15.
 *
 * 정본: `docs/design/api/openapi.yaml`(operationId `performance_01`~`performance_15`)
 *      `docs/design/06_API_명세서_v6.md` §4 · §0.2 · §0.3 · §0.4 · §0.8
 *
 * ─────────────────────────── 이 파일의 책임 ───────────────────────────
 * 경로·메서드·요청 본문을 조립해 `api`에 넘기는 것까지만 한다. 캐시·무효화·폴링은
 * `@/shared/queries/performance`가, 화면 상태는 feature가 갖는다.
 *
 * 응답 타입은 **한 줄도 손으로 쓰지 않는다.** `ApiData<'performance_03'>`처럼 생성 타입에서
 * 꺼낸다. 손으로 쓰면 금액 shape(중첩 `{amount,currency,display}` / 루트 평면 `priceAmount` /
 * 루트 `rate` 축약형)가 절마다 달라 반드시 어느 절과 어긋난다.
 *
 * 클라이언트가 `{code,data,msg}` 래퍼를 이미 벗기므로 여기 반환값은 전부 `data`다.
 */

import { api, type QueryParams } from '@/shared/api/client'
import type { ApiBody, ApiData, ApiPath, ApiQuery } from '@/shared/api/schema'

/* ============================== 식별자 ============================== */

export type PerformanceId = ApiPath<'performance_03'>['performanceId']
export type ParticipantTeamId = ApiPath<'performance_08'>['teamId']

/* ============================== 요청 타입 ============================== */

export type PerformanceCreateRequest = ApiBody<'performance_01'>
export type PerformanceUpdateRequest = ApiBody<'performance_04'>
export type TicketTypeSetRequest = ApiBody<'performance_05'>
export type ParticipantInviteRequest = ApiBody<'performance_07'>
export type PerformanceCancelRequest = ApiBody<'performance_12'>
/** `{ kind: 'DEPOSIT', senderSignedRlp }` — §0.4 ③ */
export type DepositSignedTxRequest = ApiBody<'performance_14'>

export type PerformanceListQuery = NonNullable<ApiQuery<'performance_02'>>
export type MyPerformanceListQuery = NonNullable<ApiQuery<'performance_06'>>
export type EntryLinkQuery = NonNullable<ApiQuery<'performance_10'>>

/* ============================== 응답 타입 ============================== */

export type PerformanceCreated = ApiData<'performance_01'>
export type PerformanceListPage = ApiData<'performance_02'>
export type PerformanceDetail = ApiData<'performance_03'>
export type PerformanceUpdated = ApiData<'performance_04'>
export type TicketTypeSetResult = ApiData<'performance_05'>
/** 200 — performance_05와 **같은 shape**다(performanceId·rate·ticketTypes[]) */
export type TicketTypeListResult = ApiData<'performance_15'>
export type MyPerformanceListPage = ApiData<'performance_06'>
export type ParticipantInvited = ApiData<'performance_07'>
export type ParticipantAccepted = ApiData<'performance_08'>
export type ParticipantRemoved = ApiData<'performance_09'>
/** API-performance-19 참여팀 조회 — INVITED 팀까지 준다(REMOVED 제외). */
export type ParticipantList = ApiData<'performance_19'>
export type ParticipantListItem = NonNullable<ParticipantList['items']>[number]
export type EntryLink = ApiData<'performance_10'>
export type SalesStatus = ApiData<'performance_11'>
/** 202 — `{ jobId, status, pollAfterMs }`. 이후는 `GET /chain/jobs/{jobId}` 폴링(§0.3) */
export type PerformanceCancelAccepted = ApiData<'performance_12'>
/** 200 — `PrepareResponse`(signRequests·expiresAt) + 보증금 금액·prerequisiteJobId */
export type DepositPrepareResult = ApiData<'performance_13'>
/** 202 — `{ jobId, status, pollAfterMs }`. signerType=USER, feeDelegated=true */
export type DepositSignedTxAccepted = ApiData<'performance_14'>

export type PerformanceListItem = NonNullable<PerformanceListPage['items']>[number]
export type MyPerformanceListItem = NonNullable<MyPerformanceListPage['items']>[number]

/* ============================== 에러 코드 ============================== */

/**
 * 이 절에서 화면이 분기하는 `code`. 공통 코드(§0.10)는 `@/shared/api/errorCodes`에 있다.
 * **분기는 `code`로만** 한다 — `msg`는 문구가 바뀐다(응답 규격 §1).
 */
export const PerformanceCode = {
  /** 404 — 없거나, DRAFT·PENDING_AGREEMENT를 비관계자가 조회(존재를 숨긴다) */
  NOT_FOUND: 'PERFORMANCE_NOT_FOUND',
  /** 403 — 생성자 팀 리더가 아님 */
  NOT_OWNER: 'PERFORMANCE_NOT_OWNER',
  /** 400 — 과거 일시, endAt ≤ startAt */
  DATE_INVALID: 'PERFORMANCE_DATE_INVALID',
  /** 409 — ON_SALE 이후라 수정·초대·제외·옵션 변경 불가 */
  ALREADY_ON_SALE: 'PERFORMANCE_ALREADY_ON_SALE',
  /** 409 — 그 작업을 받을 수 없는 상태(CANCELLED·ENDED·DRAFT 등) */
  INVALID_STATUS: 'PERFORMANCE_INVALID_STATUS',
  /** 404 — ticketTypeId가 이 공연 소속이 아님(performance_05) */
  TICKET_OPTION_NOT_FOUND: 'TICKET_OPTION_NOT_FOUND',
  /** 404 — 존재하지 않는 teamId */
  TEAM_NOT_FOUND: 'TEAM_NOT_FOUND',
  /** 409 — 이미 참여·초대 중인 팀 */
  TEAM_ALREADY_JOINED: 'TEAM_ALREADY_JOINED',
  /** 404 — 리더 지갑 미연결. 지갑 연결 화면으로 유도한다 */
  WALLET_NOT_FOUND: 'WALLET_NOT_FOUND',
  /** 403 — 참여팀 소속이 아님(performance_11) */
  NOT_PARTICIPANT: 'SETTLEMENT_NOT_PARTICIPANT',
  /** 409 — release 완료 후 공연 취소 시도(performance_12) */
  ALREADY_RELEASED: 'SETTLEMENT_ALREADY_RELEASED',
  /** 409 — 에스크로 잔액 < 환불 총액(performance_12, 대사 점검 대상) */
  ESCROW_INSUFFICIENT: 'COIN_ESCROW_INSUFFICIENT',
  /** 409 — RLP 발신자·to·data 불일치 또는 receipt 검증 실패(§0.4 ③④ 대체 코드) */
  TX_MISMATCH: 'PAYMENT_AMOUNT_MISMATCH',
  /** 500 — 운영지갑(fee payer) KAIA 부족. 사용자 잘못이 아니다 */
  GAS_INSUFFICIENT: 'CHAIN_GAS_INSUFFICIENT',
  /** 504 — 제출은 됐고 확정이 120초를 넘김. jobId로 계속 폴링한다 */
  TX_TIMEOUT: 'CHAIN_TX_TIMEOUT',
} as const

/* ============================== 목록 파라미터 정규화 ============================== */

/**
 * 목록 파라미터를 **캐시 키에 넣기 전에** 한 모양으로 만든다.
 *
 * TanStack Query는 키 객체를 안정 직렬화하므로 키 순서는 문제가 아니지만,
 * `undefined` 필드가 있고 없고는 **다른 키**가 된다. 화면마다 `{page:0}`·`{page:0,keyword:undefined}`를
 * 섞어 넘기면 같은 목록이 캐시에 두 벌 생기고 무효화가 한쪽만 맞는다.
 * 그래서 값이 없는 필드는 **키에서 뺀다**(서버로도 보내지 않는다).
 *
 * page·size는 §0.2 범위(page ≥ 0, 1 ≤ size ≤ 100)로 깎는다. 범위를 넘겨 보내면
 * 서버가 400 `COMMON_VALIDATION_FAILED`로 거절하는데, 그건 사용자가 고칠 수 없는 오류다.
 */
function clampPage(page: number | undefined): number {
  if (page === undefined || !Number.isFinite(page)) return 0
  return Math.max(0, Math.trunc(page))
}

function clampSize(size: number | undefined): number {
  if (size === undefined || !Number.isFinite(size)) return 20
  return Math.min(100, Math.max(1, Math.trunc(size)))
}

function trimmed(value: string | undefined): string | undefined {
  const next = value?.trim()
  return next ? next : undefined
}

/** API-performance-02 기본 정렬은 `startAt,asc`(공연이 가까운 순). */
export function normalizePerformanceListQuery(params?: PerformanceListQuery): PerformanceListQuery {
  const keyword = trimmed(params?.keyword)
  return {
    ...(keyword !== undefined ? { keyword } : {}),
    ...(params?.fromDate ? { fromDate: params.fromDate } : {}),
    ...(params?.toDate ? { toDate: params.toDate } : {}),
    ...(params?.status ? { status: params.status } : {}),
    page: clampPage(params?.page),
    size: clampSize(params?.size),
    sort: params?.sort ?? 'startAt,asc',
  }
}

/** API-performance-06 기본 정렬은 `startAt,desc`(최근 공연이 위). */
export function normalizeMyPerformanceListQuery(
  params?: MyPerformanceListQuery,
): MyPerformanceListQuery {
  return {
    ...(params?.status ? { status: params.status } : {}),
    page: clampPage(params?.page),
    size: clampSize(params?.size),
    sort: params?.sort ?? 'startAt,desc',
  }
}

/* ============================== 경로 ============================== */

const ROOT = '/performances'
const one = (performanceId: PerformanceId) => `${ROOT}/${performanceId}`
const participant = (performanceId: PerformanceId, teamId: ParticipantTeamId) =>
  `${one(performanceId)}/participants/${teamId}`

/* ============================== 요청 함수 ============================== */

/** API-performance-01 · `POST /performances` — 201. DRAFT·보증금 UNPAID로 생성된다 */
export function createPerformance(body: PerformanceCreateRequest): Promise<PerformanceCreated> {
  return api.post<PerformanceCreated>(ROOT, body)
}

/**
 * API-performance-02 · `GET /performances` — 공개 목록.
 * 비로그인도 부를 수 있지만 Authorization을 굳이 떼지 않는다(서버가 무시한다).
 */
export function fetchPerformanceList(query: PerformanceListQuery): Promise<PerformanceListPage> {
  return api.get<PerformanceListPage>(ROOT, { query: query as QueryParams })
}

/**
 * API-performance-03 · `GET /performances/{performanceId}` — 공개 상세.
 *
 * 로그인 여부로 응답이 달라진다 — DRAFT·PENDING_AGREEMENT는 생성자·참여팀 리더에게만 보이고
 * 그 밖에는 `PERFORMANCE_NOT_FOUND`다. 그래서 **토큰을 떼고 부르면 안 된다.**
 */
export function fetchPerformanceDetail(performanceId: PerformanceId): Promise<PerformanceDetail> {
  return api.get<PerformanceDetail>(one(performanceId))
}

/**
 * API-performance-04 · `PATCH /performances/{performanceId}` — 잠금 전 수정.
 * 일시·공동 여부를 바꾸면 서버가 팀별 동의를 전부 PENDING으로 되돌린다(`agreementsReset`).
 */
export function updatePerformance(
  performanceId: PerformanceId,
  body: PerformanceUpdateRequest,
): Promise<PerformanceUpdated> {
  return api.patch<PerformanceUpdated>(one(performanceId), body)
}

/**
 * API-performance-18 · `DELETE /performances/{performanceId}` — 공연 삭제(신설).
 *
 * **규칙 동의 전**(`DRAFT`·`PENDING_AGREEMENT`)이고 보증금 미납인 공연만 지운다. `ON_SALE`
 * 이후는 409 `PERFORMANCE_ALREADY_ON_SALE`이며 되무르는 것은 `cancelPerformance`(12)다.
 *
 * 응답 본문(`performanceId`·`title`)은 쓰지 않으므로 타입을 만들지 않는다 — 생성 타입에 이 절이
 * 아직 없다(코드가 문서보다 먼저 나갔다). 필요해지면 `openapi.yaml`에 절을 넣고 `ApiData`로 꺼낸다.
 */
export function deletePerformance(performanceId: PerformanceId): Promise<void> {
  return api.delete<void>(one(performanceId))
}

/**
 * API-performance-15 · `GET /performances/{performanceId}/ticket-types` — 생성자용 옵션 조회.
 *
 * 공개 상세(performance_03)에도 `ticketTypes`가 있지만 그쪽은 관객용 중첩 금액(`price.amount`)이고
 * 여기는 저장(05) 응답과 같은 평면형(`priceAmount`)이다. P-03이 저장 전후로 같은 모양을 쓴다.
 * 옵션이 없으면 빈 배열이며 404가 아니다.
 */
export function fetchTicketTypes(performanceId: PerformanceId): Promise<TicketTypeListResult> {
  return api.get<TicketTypeListResult>(`${one(performanceId)}/ticket-types`)
}

/**
 * API-performance-05 · `PUT /performances/{performanceId}/ticket-types` — **전체 교체**.
 * 유지할 항목은 `ticketTypeId`를 같이 보내야 한다. 빠뜨리면 그 옵션은 사라진다.
 */
export function setTicketTypes(
  performanceId: PerformanceId,
  body: TicketTypeSetRequest,
): Promise<TicketTypeSetResult> {
  return api.put<TicketTypeSetResult>(`${one(performanceId)}/ticket-types`, body)
}

/** API-performance-06 · `GET /performances/me` — 내 팀이 주최·참여한 공연(DRAFT~CANCELLED 전부) */
export function fetchMyPerformanceList(
  query: MyPerformanceListQuery,
  options: { signal?: AbortSignal; silentAuthFailure?: boolean } = {},
): Promise<MyPerformanceListPage> {
  return api.get<MyPerformanceListPage>(`${ROOT}/me`, {
    query: query as QueryParams,
    signal: options.signal,
    silentAuthFailure: options.silentAuthFailure,
  })
}

/**
 * API-performance-19 · `GET /performances/{performanceId}/participants` — 참여팀 현황(P-04).
 * 공연 상세(performance_03)의 `participants[]`와 달리 **아직 수락하지 않은 INVITED 팀**과
 * `invitedAt`·`acceptedAt`을 준다. 주최팀·참여팀 리더만 조회할 수 있다(그 밖 403).
 */
export function fetchParticipants(performanceId: PerformanceId): Promise<ParticipantList> {
  return api.get<ParticipantList>(`${one(performanceId)}/participants`)
}

/** API-performance-07 · `POST /performances/{performanceId}/participants` — 201. 초대(INVITED) */
export function inviteParticipant(
  performanceId: PerformanceId,
  body: ParticipantInviteRequest,
): Promise<ParticipantInvited> {
  return api.post<ParticipantInvited>(`${one(performanceId)}/participants`, body)
}

/** API-performance-08 · `POST …/participants/{teamId}/accept` — 초대받은 팀 리더의 수락 */
export function acceptParticipation(
  performanceId: PerformanceId,
  teamId: ParticipantTeamId,
): Promise<ParticipantAccepted> {
  return api.post<ParticipantAccepted>(`${participant(performanceId, teamId)}/accept`)
}

/** API-performance-09 · `DELETE …/participants/{teamId}` — 초대 취소·참여팀 제외 */
export function removeParticipant(
  performanceId: PerformanceId,
  teamId: ParticipantTeamId,
): Promise<ParticipantRemoved> {
  return api.delete<ParticipantRemoved>(participant(performanceId, teamId))
}

/**
 * API-performance-10 · `GET /performances/{performanceId}/entry-link` — 검표 링크.
 *
 * ⚠ `rotate=true`는 **조회가 아니라 재발급**이다(이전 링크 즉시 폐기, 생성자만 가능).
 *   GET이지만 부작용이 있으므로 훅에서는 mutation으로 감싼다.
 */
export function fetchEntryLink(
  performanceId: PerformanceId,
  query?: EntryLinkQuery,
): Promise<EntryLink> {
  return api.get<EntryLink>(`${one(performanceId)}/entry-link`, {
    query: (query ?? {}) as QueryParams,
  })
}

/**
 * API-performance-11 · `GET /performances/{performanceId}/sales` — 판매·선택 현황.
 * DB 집계와 온체인 카운터를 나란히 준다. `counterMatched=false`면 집계 확정이 막힌다.
 */
export function fetchSalesStatus(performanceId: PerformanceId): Promise<SalesStatus> {
  return api.get<SalesStatus>(`${one(performanceId)}/sales`)
}

/**
 * API-performance-12 · `POST /performances/{performanceId}/cancel` — **202 + jobId**.
 *
 * §0.8 멱등키 **필수**다. `idempotencyKey`는 호출부가 `newIdempotencyKey()`로 한 번 만들어
 * 보관하고 재시도 때 **같은 값**을 다시 넘겨야 한다. 매번 새로 만들면 일괄 환불이 두 번 돈다.
 */
export function cancelPerformance(
  performanceId: PerformanceId,
  body: PerformanceCancelRequest,
  idempotencyKey: string,
): Promise<PerformanceCancelAccepted> {
  return api.post<PerformanceCancelAccepted>(`${one(performanceId)}/cancel`, body, {
    idempotencyKey,
  })
}

/**
 * API-performance-13 · `POST …/deposit/prepare` — §0.4 ① 서명 파라미터.
 *
 * 본문은 없다(`{}`를 보낸다). 응답 `signRequests`는 최대 2건(APPROVE + DEPOSIT)이고
 * `required=false`인 건은 건너뛴다. 서명은 이 계층이 하지 않는다 — WalletAdapter 몫이다.
 */
export function prepareDeposit(performanceId: PerformanceId): Promise<DepositPrepareResult> {
  return api.post<DepositPrepareResult>(`${one(performanceId)}/deposit/prepare`)
}

/**
 * API-performance-14 · `POST …/deposit/signed-tx` — §0.4 ③ **202 + jobId**.
 *
 * ⚠ `senderSignedRlp`는 이 함수의 인자로 들어와 요청 본문으로 나가는 것이 **전부**다.
 *   localStorage·sessionStorage·모듈 변수·로그·에러 리포트 어디에도 남기지 않는다(스택 v3 §3.2).
 *   같은 RLP 재보고는 서버가 최초 jobId를 재생하므로 재시도용으로 들고 있을 이유도 없다(§0.8).
 */
export function reportDepositSignedTx(
  performanceId: PerformanceId,
  body: DepositSignedTxRequest,
  /** [2026-09-24] 본인 확인 토큰(범위 DEPOSIT·공연). 없으면 헤더를 붙이지 않는다(스위치 off 경로 무변경). */
  stepUpToken?: string,
): Promise<DepositSignedTxAccepted> {
  return api.post<DepositSignedTxAccepted>(
    `${one(performanceId)}/deposit/signed-tx`,
    body,
    stepUpToken ? { headers: { 'X-Step-Up-Token': stepUpToken } } : {},
  )
}
