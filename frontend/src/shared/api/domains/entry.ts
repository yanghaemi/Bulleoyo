/**
 * entry — QR 검증·입장 처리, 입장 현황 (API-entry-01 · 02).
 *
 * 정본: `docs/design/06_API_명세서_v6.md` §10 entry · `docs/design/api/openapi.yaml`
 *       operationId `entry_01`(POST /entries/verify)
 *       · `entry_02`(GET /performances/{performanceId}/entries)
 *
 * ─────────────────────────── 인증 경로가 두 개다 ───────────────────────────
 * S-02·S-03은 **비로그인 화면**이다. 검표 담당자는 계정 없이 공유 링크의 토큰만 들고 들어온다.
 *   ① 검표 링크 토큰 → `X-Entry-Token` 헤더 → `createEntryClient(entryToken)` (권장·기본)
 *   ② 참여팀 소속 회원 → `Authorization` → 일반 `api`
 * 둘을 섞지 않는다. ①은 회원 세션 인터셉터(refresh·강제 로그아웃)를 타지 않아야 한다.
 *
 * ⚠ `ENTRY_QR_EXPIRED`·`ENTRY_QR_SIGNATURE_INVALID`는 **401이지만 세션 만료가 아니다.**
 *   QR 만료로 로그인 화면에 튕기면 검표가 멈춘다. client.ts가 이 코드를 가로채지 않고
 *   그대로 넘겨주므로(`isPassthroughUnauthorized`), 이 계층도 손대지 않고 화면이 `code`로 분기하게 둔다.
 *
 * 입장은 온체인·코인과 무관하다(v4).
 */

import { api, createEntryClient, type QueryParams } from '@/shared/api/client'
import type { ApiBody, ApiData, ApiQuery } from '@/shared/api/schema'

/* ------------------------------ 타입 ------------------------------ */

/**
 * 검표 인증 수단. `entryToken`이 있으면 링크 토큰 경로(`X-Entry-Token`),
 * 없으면 로그인한 참여팀 회원 경로(`Authorization`)로 나간다.
 */
export interface EntryAuth {
  entryToken?: string
}

/** `POST /entries/verify` 요청 본문. `scannedAt`은 로그용이고 판정 기준은 서버 시각이다. */
export type EntryVerifyRequest = ApiBody<'entry_01'>
/** 판정 표시를 1초 안에 끝내려고 최소 필드만 온다(PERF-03). */
export type EntryVerifyResult = ApiData<'entry_01'>

/** `GET /performances/{id}/entries` 쿼리(`entryToken` 제외 — 그건 헤더로 보낸다). */
export type EntryListQuery = Omit<NonNullable<ApiQuery<'entry_02'>>, 'entryToken'>
/** 요약 + 검표 이력(성공·실패 모두). 요약값은 서버가 5초 캐시한다. */
export type EntryListResult = ApiData<'entry_02'>

/* ------------------------------ 호출 ------------------------------ */

/**
 * API-entry-01 QR 검증·입장 처리.
 *
 * 실패 코드를 화면이 그대로 받아 분기한다 — 401 `ENTRY_QR_EXPIRED`/`ENTRY_QR_SIGNATURE_INVALID`,
 * 403 `ENTRY_SCANNER_NOT_AUTHORIZED`, 409 `ENTRY_ALREADY_ENTERED`/`ENTRY_NOT_IN_TIME_WINDOW`/`TICKET_CANCELED`,
 * 429 `COMMON_TOO_MANY_REQUESTS`(IP당 60회/분).
 */
export function verifyEntry(
  body: EntryVerifyRequest,
  auth: EntryAuth = {},
  options: { signal?: AbortSignal } = {},
): Promise<EntryVerifyResult> {
  const path = '/entries/verify'
  if (auth.entryToken) {
    return createEntryClient(auth.entryToken).post<EntryVerifyResult>(path, body, {
      signal: options.signal,
    })
  }
  return api.post<EntryVerifyResult>(path, body, { signal: options.signal })
}

/** API-entry-02 입장 현황·이력. 관객 개인정보는 담기지 않는다(마스킹된 이름까지). */
export function fetchEntries(
  params: { performanceId: number } & EntryListQuery,
  auth: EntryAuth = {},
  options: { signal?: AbortSignal } = {},
): Promise<EntryListResult> {
  const path = '/performances/' + params.performanceId + '/entries'
  const query: QueryParams = {
    result: params.result,
    page: params.page,
    size: params.size,
  }
  if (auth.entryToken) {
    return createEntryClient(auth.entryToken).get<EntryListResult>(path, {
      query,
      signal: options.signal,
    })
  }
  return api.get<EntryListResult>(path, { query, signal: options.signal })
}
