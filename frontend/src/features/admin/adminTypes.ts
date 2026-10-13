/**
 * 관리자 화면(M-02·M-03)이 다루는 응답 타입 — **생성 타입에서 온 도메인 타입의 별칭만** 둔다.
 *
 * 정본 —
 *   · `@/shared/api/domains/admin`  admin_09(이의 목록) · admin_06(이의 처리)
 *   · `@/shared/api/domains/coin`   coin_01·02·03·07·08
 *   · `@/shared/api/domains/chain`  chain_01(작업 상태)
 *   · `@/shared/api/domains/settlement` settlement_01(M-02 상세 패널)
 *
 * ─────────────── 손으로 옮겨 적은 타입을 여기서 없앴다(S15P21B204-103) ───────────────
 * 예전에는 같은 응답을 이 파일이 한 벌 더 적어 두고 있었다. 그러면 생성 타입이 바뀌어도 이쪽은
 * 그대로라 **화면만 옛 모양을 믿는다.** 실제로 어긋나 있던 자리가 셋이다 —
 *   · `disputeClosesAt`을 `string` 필수로 적었지만 응답은 `null`을 준다(잠금 전에는 마감이 없다)
 *   · `currency`·`tokenSymbol`·`tokenDecimals`를 리터럴(`'KRW'`·`'YoYo'`·`0`)로 좁혀 두었다
 *   · 이의 상세(`DisputeSettlementDetail`)를 `settlement_01`의 **부분집합**으로 적어, 응답에 있는
 *     `transactions[]`(release 익스플로러 링크)를 화면이 쓸 수 없었다
 * 그래서 이 파일은 이제 **별칭과 화면 전용 타입**만 갖는다. 응답 모양을 여기서 다시 정의하지 않는다.
 *
 * 타입만 있는 파일이다 — 컴포넌트를 섞지 않는다(Fast Refresh).
 */

import type { ChainJobView } from '@/shared/api/domains/chain'
import type { ExchangeRateRegisterRequest } from '@/shared/api/domains/coin'
import type { SettlementData } from '@/shared/api/domains/settlement'

/* ────────────────────────── 공통 ────────────────────────── */

/**
 * 액션 실행 결과. **낙관적 UI를 쓰지 않기 위한 형태**다 —
 * 화면은 `ok`가 돌아오기 전까지 아무 상태도 옮기지 않는다.
 * 실패는 `code`로만 분기한다(응답 규격 §1). `msg`는 표시 전용이다.
 *
 * 훅(`useMutation`)의 `mutateAsync`는 실패를 던지므로, 페이지가 `ApiError`를 이 모양으로 옮겨
 * 컴포넌트에 넘긴다 — 컴포넌트가 `try/catch`와 `ApiError`를 알 필요가 없다.
 */
export type AdminResult<T> = { ok: true; data: T } | { ok: false; code: string; msg?: string }

/** 조회 실패. 화면 전체를 덮을지(403·404) 패널만 덮을지는 화면이 코드로 판단한다 */
export interface AdminError {
  code: string
  msg?: string
}

/* ───────────────────── 체인 작업(chain_01 · §0.3) ───────────────────── */

export type { ChainJobStatus } from '@/shared/api/domains/chain'
/** §0.3 202 응답 본문. 지급 요청이 이걸 받고 §5.2 폴링으로 넘어간다 */
export type { ChainJobAccepted } from '@/shared/api/types'

/**
 * 폴링 중인 작업. `useChainJob`이 돌려주는 뷰모델 그대로다.
 *
 * 화면이 실제로 읽는 것은 `status`·`txHash`·`explorerUrl`·`failureReason`·`retryable`뿐이지만,
 * **부분집합을 새로 적지 않는다** — 그 순간 폴링 훅과 화면이 다른 타입을 보게 된다.
 */
export type ChainJobState = ChainJobView

/* ───────────────────── M-02 이의제기 (admin_09 · admin_06) ───────────────────── */

export type {
  DisputeAdminList,
  DisputeAdminListItem,
  DisputeAdminListSummary,
  DisputeListParams,
  DisputePageInfo,
  DisputeResolveRequest,
  DisputeResolveResult,
  DisputeStatus,
} from '@/shared/api/domains/admin'

/**
 * M-02 상세 패널이 읽는 정산 — `settlement_01` **전체**다.
 *
 * ⚠ 이 조회의 `x-role`이 `[PERFORMER]`뿐이라 관리자 계정은 403(`SETTLEMENT_NOT_PARTICIPANT`
 *   또는 `COMMON_FORBIDDEN`)을 받을 수 있다. 명세 수정 요청 대상이며, 그때 화면은 **목록을 살려 둔
 *   채 상세 패널만** 안내로 대체한다(`DisputeQueue`의 `SettlementSummary`).
 */
export type DisputeSettlementDetail = SettlementData

/* ───────────────────── M-03 발행량 공시 (coin_01) ───────────────────── */

export type {
  CoinDisplay,
  CoinInvariantName,
  CoinSupply,
  CoinSupplyInvariant,
} from '@/shared/api/domains/coin'

/* ───────────────────── M-03 지급 (coin_07 · coin_08) ───────────────────── */

export type {
  CoinGrantHistory,
  CoinGrantHistoryItem,
  CoinGrantHistorySummary,
  CoinGrantListParams,
  CoinGrantRequest,
  ListRate,
} from '@/shared/api/domains/coin'

/**
 * 지급 이력 필터 — M-03 컴포넌트 표 "필터(대상·기간)".
 *
 * ⚠ **이름 검색은 서버가 못 한다.** `coin_08`의 대상 필터는 `memberId`·`address` 둘뿐이고
 *   표시명으로 찾는 파라미터가 없다. 그래서 `target`은 회원 ID(숫자)나 `0x` 주소일 때만
 *   서버 쿼리가 되고, 그 외에는 **거르지 않는다** — 클라이언트에서 현재 페이지만 걸러 내면
 *   서버가 준 `summary`(전체 합계)와 표가 어긋난다. 화면이 그 사실을 문구로 알린다.
 */
export interface GrantHistoryFilter {
  /** 대상 — 회원 ID 또는 지갑 주소. `memberId`·`address`로 번역된다 */
  target: string
  /** `from`(requestedAt 기준, `YYYY-MM-DD`) */
  from: string
  /** `to`(requestedAt 기준, `YYYY-MM-DD`) */
  to: string
}

/* ───────────────────── M-03 표시 환율 (coin_02 · coin_03) ───────────────────── */

export type {
  ExchangeRate,
  ExchangeRateList,
  ExchangeRateRegisterRequest,
  ExchangeRateRegisterResult,
  RegisteredExchangeRate,
} from '@/shared/api/domains/coin'

/** `coin_03` 요청 본문의 `rates[]` 한 줄 */
export type ExchangeRateRegisterItem = ExchangeRateRegisterRequest['rates'][number]

/* ───────────────────── M-03 회원 검색 — 없앤 타입 ─────────────────────
 *
 * `AdminMemberSearchItem`을 지웠다. 화면설계 M-03은 회원 검색의 연결 API를
 * `GET /api/v1/admin/members`라고 적었지만 **API v6·openapi.yaml 어디에도 그 경로가 없다**
 * (admin 도메인은 disputes 2개뿐). 응답 스키마가 없는 타입을 손으로 지어 두면 화면이
 * 있지도 않은 필드(잔액 등)를 그린다.
 *
 * 그래서 지급 대상은 **지갑 주소 직접 입력** 하나로 줄였다(`coin_07`은 `memberId | address`를
 * 택일로 받는다 — 주소만으로 지급이 성립한다).
 * **복구 조건**: 명세에 회원 검색 엔드포인트가 생기면 `shared/api/domains/`에 그 응답 타입을
 * 만들고 `CoinGrantForm`의 대상 필드 위에 검색 패널을 되살린다. 그 전에는 만들지 않는다.
 */
