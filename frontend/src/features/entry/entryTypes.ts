/**
 * 검표(S-02·S-03) 응답 타입.
 *
 * 정본 — API 명세 v6 `docs/design/api/parts/10_entry.yaml`
 *        entry-01 `POST /api/v1/entries/verify` · entry-02 `GET /api/v1/performances/{id}/entries`
 *        · performance-10 `GET /api/v1/performances/{id}/entry-link`(검표 링크 발급)
 *
 * ⚠ 2026-09-15 실 API 연결에서 **손으로 옮겨 적은 응답 타입을 전부 생성 타입 별칭으로 바꿨다.**
 *   손으로 쓴 쪽은 모든 필드를 필수로 적었는데 OpenAPI 생성 타입은 전부 선택(`?`)이라,
 *   화면이 "항상 온다"고 믿고 `summary.enteredCount`를 바로 읽으면 **응답에서 빠진 값이
 *   런타임에 `undefined`로 터지거나 0으로 보인다.** 모르는 값은 모른다고 그려야 한다.
 *   `EntryRequest`도 `ApiBody<'entry_01'>`(= `EntryVerifyRequest`)와 중복이라 지웠다.
 *
 * S-02·S-03이 같은 타입을 쓰므로 컴포넌트 파일이 아니라 여기에 모았다
 * (컴포넌트 파일은 컴포넌트만 export한다 — Fast Refresh).
 */

import type { EntryListResult, EntryVerifyResult } from '@/shared/api/domains/entry'

/* ── entry-01 `POST /api/v1/entries/verify` ───────────────────────────── */

/**
 * `EntryResult` — 200 응답의 `data`. 판정을 1초 안에 그리도록 최소 필드만 온다.
 *
 * `holderNameMasked`(마스킹된 관객 이름)가 함께 오지만 **화면에 그리지 않는다.**
 * S-02 컴포넌트 표의 판정 배지는 "성공/실패 + 사유"만 요구하고 S-03은 "관객 개인정보는
 * 표시하지 않는다"고 못박았다 — 받아 두되 렌더하지 않는다(§1.2 원칙 11과 같은 태도).
 */
export type EntryResult = EntryVerifyResult

/* ── entry-02 `GET /api/v1/performances/{performanceId}/entries` ───────── */

/** entry-02 200 응답의 `data` */
export type EntryStatusData = EntryListResult

/**
 * `EntrySummary`.
 * ⚠ `expiredQrCount`(만료 QR 스캔 수)는 응답에 오지만 S-03 컴포넌트 표에 없다
 *    (요약 타일은 입장·총 매수·중복 시도 3개). 응답에 온다고 타일을 늘리지 않는다.
 */
export type EntrySummary = NonNullable<EntryStatusData['summary']>

/** `EntryLogItem` — `holderNameMasked`는 개인정보라 렌더하지 않는다(1416행) */
export type EntryLogItem = NonNullable<EntryStatusData['items']>[number]

/** 검표 이력 한 줄의 판정 */
export type EntryLogResult = NonNullable<EntryLogItem['result']>

/** `PageMeta` — 공통 페이지 메타 */
export type EntryPageInfo = NonNullable<EntryStatusData['pageInfo']>

/* ── S-02 컨텍스트 헤더 ───────────────────────────────────────────────── */

/**
 * S-02 "검표 컨텍스트 헤더"가 요구하는 값 — 공연명·일시·장소, 입장 허용 시간대, 입장 완료/총 티켓 수.
 *
 * ⚠ **이 shape를 한 번에 주는 API가 없다.** 화면설계 v6 1443행은 `GET /api/v1/scan/{token}`을
 *    적었지만 API v6에 그 경로가 없다(불일치 ①). 지금 명세로 STAFF(비로그인)가 모을 수 있는 것은
 *      · 공연명·일시·장소 → performance-03 공연 상세(`security: [{}, bearerAuth]` — 비로그인 가능)
 *      · 입장 완료/총 티켓 수 → entry-02 `summary`(검표 토큰으로 부를 수 있다)
 *    이고 **입장 허용 시간대(`entryWindow`)는 performance-10에만 있는데 그건 `bearerAuth` 필수**라
 *    STAFF가 못 받는다. 그래서 전부 선택 필드다 — 못 받은 값은 그 줄을 그리지 않는다.
 *    값을 지어내지 않는다(0·현재 시각·빈 문자열 전부 거짓말이다).
 */
export interface ScanContext {
  /** 검표 중인 공연. 이 값이 없으면 entry-01을 부를 수 없다(본문 필수 필드) */
  performanceId: number
  /** performance-03 `title` */
  performanceTitle?: string
  /** 공연 일시(ISO). performance-03 `startAt` */
  startAt?: string
  /** 공연 장소. performance-03 `venueName` */
  venue?: string
  /** performance-10 `entryWindow` — STAFF는 받을 수 없다(위 ⚠). 받은 경로에서만 채운다 */
  entryWindow?: { opensAt?: string; closesAt?: string }
  /** entry-02 `summary`의 두 값. 스캔 성공마다 `EntryResult`가 주는 값으로 갱신한다 */
  enteredCount?: number
  totalIssuedCount?: number
}

/* ── 스캔 판정 ────────────────────────────────────────────────────────── */

/**
 * 한 번의 스캔 결과. 성공은 entry-01의 `data`, 실패는 `code`(+ 서버 `msg`)다.
 *
 * 실패에 `data`가 없다는 점이 중요하다 — `ErrorEnvelope.data`는 `null`로 못박혀 있어
 * **`ENTRY_ALREADY_ENTERED`일 때 "최초 입장 시각"을 받을 방법이 없다**(불일치 ③).
 */
export type ScanOutcome =
  { result: 'SUCCESS'; entry: EntryResult } | { result: 'FAILED'; code: string; msg?: string }
