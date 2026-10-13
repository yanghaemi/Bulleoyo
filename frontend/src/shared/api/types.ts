/**
 * API 공통 타입 — 손으로 옮긴 **임시** 정의다.
 *
 * ⚠ 정본은 `docs/design/api/openapi.yaml`이며, Node 설치 후 스키마에서 타입을 생성해
 *   이 파일을 대체할 예정이다(`openapi-typescript` 등). 그때까지만 손으로 유지한다.
 *
 *   금액 응답 형태가 절마다 다르다(§0.5 — 항목마다 `display`를 붙이는 형태 / 루트에 `rate` 하나만
 *   두는 축약형 / `display` 자체를 생략하는 형태 …). 그래서 아래 `Money`는 "가장 넓은 형태"이지
 *   모든 절이 이 모양으로 내려온다는 뜻이 아니다. 도메인 타입은 각 절을 읽고 feature 안에서 좁힌다.
 *
 * 출처: docs/design/06_API_명세서_v6.md §0.1~§0.5, docs/design/01_API_공통_응답_규격.md §1
 */

/* ────────────────────────── 래퍼 (규격 §1) ────────────────────────── */

/**
 * 모든 REST 응답은 성공·실패 구분 없이 `{ code, data, msg }` 3필드다.
 * - `code` : 문자열 enum. 성공은 항상 `"SUCCESS"`. **클라이언트 분기의 유일한 키.**
 * - `data` : 성공 시 payload. 실패 시 예외 없이 `null`.
 * - `msg`  : 사용자에게 그대로 노출 가능한 문장. 토스트 표시 전용. **분기 금지.**
 */
export interface ApiEnvelope<T> {
  code: string
  data: T | null
  msg: string
}

/* ────────────────────── 목록·페이지네이션 (§0.2) ────────────────────── */

export interface PageInfo {
  /** 0-base */
  page: number
  /** 기본 20, 최대 100 */
  size: number
  totalElements: number
  hasNext: boolean
}

export interface Paged<T> {
  items: T[]
  pageInfo: PageInfo
}

/** `page`·`size`·`sort`(`필드,asc|desc`). 허용 정렬 필드는 각 API 절에 있다. */
export interface PageQuery {
  page?: number
  size?: number
  sort?: string
}

/* ─────────────────────── 금액과 display (§0.5) ─────────────────────── */

/**
 * **`Money`·`Display`·`RateInfo`는 여기에 두지 않는다.** `@/shared/api/schema`에서 가져온다.
 *
 * 예전에는 이 파일에도 손으로 쓴 정의가 있었는데, 생성 타입과 **의미가 갈려 있었다** —
 * 생성본의 `Money`는 `number`(YoYo 정수 그 자체)이고 여기 있던 것은
 * `{ amount, currency, display? }` 객체였다. 같은 이름이 import 출처에 따라 다른 것을
 * 가리키면, 잘못 쓴 쪽은 **타입 검사를 통과하면서 런타임에 `undefined`를 읽는다.**
 * 쓰는 곳이 하나도 없는 상태에서 발견해 지웠다.
 *
 * 남겨 둘 사실만 옮겨 적는다:
 *
 * - 금액의 원본은 **YoYo 정수 하나뿐**이다. YoYo는 `decimals=0`, 1 YoYo = 1 YoYo이라 소수가 없다.
 * - 계산·정산·컨트랙트 인자는 전부 그 정수만 쓴다. **환율은 절대 쓰지 않는다**(P-17).
 * - `display`는 **표시 전용**이며 요청 본문으로 되돌려 보낼 수 없다. 회원의 `display_currency`가
 *   KRW이거나 환율 레코드가 없으면 서버가 아예 내리지 않는다.
 * - 목록은 축약형이다 — 항목마다 `display`를 반복하지 않고 응답 루트에 `rate` 하나를 둔다.
 */

/* ─────────────── 비동기 tx / chain_job (§0.3 · API-chain-01) ─────────────── */

export type ChainJobStatus = 'PENDING' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED'

/**
 * `chain_job.tx_type` **14종** (§0.3, 결정 v2 §7).
 *
 * v4의 소각·금고 왕복 3종은 삭제됐고 `MINT`는 시연용 지급을 뜻한다.
 *
 * **[2026-09-09 — S15P21B204-67]** `CREATE_SHOW`(온체인 공연 등록)·`START_SALE`(판매 개시)이
 * 신설되면서 12종 → 14종이 됐다. 이때 `LOCK`은 **정산 잠금(API-settlement-03) 전용**이 됐다 —
 * 종전엔 판매 시작과 겸용이라 확정 분기가 항상 판매 시작으로 해석돼 **정산 잠금 job이 진행되지
 * 않는 버그**가 있었다. 그래서 `LOCK`을 판매 시작 용도로 쓰면 안 된다.
 *
 * 값 목록과 타입을 **한 곳에서** 낸다. 전에는 타입 선언과 런타임 검사용 배열이 따로 있어
 * tx가 늘 때 한쪽만 고쳐지기 쉬웠다. 배열을 정본으로 두고 타입을 파생시키면 그 어긋남이
 * 구조적으로 불가능해진다. 런타임에서 모르는 값을 걸러야 하는 곳은 이 배열을 쓴다.
 */
export const CHAIN_TX_TYPES = [
  'MINT',
  'APPROVE',
  'PURCHASE',
  'REFUND',
  'DEPOSIT',
  'DEPOSIT_RETURN',
  'DEPOSIT_FORFEIT',
  'CREATE_SHOW',
  'AGREE',
  // 온체인 규칙 갱신(OPERATOR). 서버에서만 규칙을 바꾸면 두 해시가 갈려 참여팀의 agreeToRules 가
  // revert 한다 — rule_01 이 이 job 을 함께 건다(명세 [2026-09-10])
  'UPDATE_RULES',
  'START_SALE',
  'LOCK',
  'AGGREGATE',
  'RELEASE',
  'HALT',
] as const

export type ChainTxType = (typeof CHAIN_TX_TYPES)[number]

/**
 * 위 목록이 명세 생성물과 어긋나면 **컴파일이 깨진다.**
 *
 * 이 장치가 없으면 어긋남이 런타임에야 드러나는데, 그 증상이 고약하다 —
 * 모르는 `txType`은 무효화 매핑에서 조용히 빠지므로 tx는 확정됐는데 화면만 옛 값을
 * 계속 보여주고, 에러는 나지 않는다. 실제로 `CREATE_SHOW`·`START_SALE`이
 * 그렇게 9/9부터 빠져 있었다.
 *
 * 명세가 바뀌어 여기가 깨지면 `pnpm gen:api`를 돌린 뒤 위 배열을 맞춘다.
 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

export const CHAIN_TX_TYPES_MATCH_SPEC: Exact<
  ChainTxType,
  NonNullable<import('@/shared/api/generated/openapi').components['schemas']['ChainJob']['txType']>
> = true

/** OPERATOR = 서버 키 서명·전송 / USER = 사용자 지갑 서명 + 서버 대납 서명·전송 */
export type ChainSignerType = 'OPERATOR' | 'USER'

/** 지급 어댑터 감사 컬럼. MVP는 항상 MOCK. EXTERNAL은 P2 예약값이며 분기 로직을 만들지 않는다. */
export type ChainIssuerType = 'MOCK' | 'EXTERNAL'

/** 202 Accepted 본문. `code`는 SUCCESS다. */
export interface ChainJobAccepted {
  /** `chain_*` 하나로 통일 */
  jobId: string
  status: ChainJobStatus
  /** 다음 폴링까지 권장 대기(ms). 기본 1500 */
  pollAfterMs: number
}

/** 사용자 서명 tx의 receipt 검증 결과(§0.4 검증 5항목). */
export interface ChainJobVerification {
  verified: boolean
  expectedEvent: string | null
  checks: {
    receiptStatus: boolean
    to: boolean
    from: boolean
    event: boolean
    args: boolean
  }
  mismatchFields: string[]
}

/** 부분 성공(공연 취소 일괄 환불·release)의 건별 상태. */
export interface ChainJobResultItem {
  teamId?: number
  ticketId?: number
  amount?: number
  status: string
  reason?: string | null
  retryable?: boolean
  txHash?: string | null
}

/**
 * `GET /api/v1/chain/jobs/{jobId}` 응답 (API-chain-01).
 * 폴링은 `PENDING`·`SUBMITTED`일 때만 돌리고, `CONFIRMED` 후 관련 쿼리를 invalidate한다.
 */
export interface ChainJob {
  jobId: string
  txType: ChainTxType
  signerType: ChainSignerType
  issuerType: ChainIssuerType
  /** signerType=USER이면 항상 true */
  feeDelegated: boolean
  feePayerAddress?: string | null
  status: ChainJobStatus
  walletAddress?: string | null
  performanceId?: number | null
  orderId?: number | null
  amount?: number | null
  currency?: 'KRW' | null
  /** 66자 (`0x` + 64 hex) */
  txHash: string | null
  /** 서버가 완성된 절대 URL로 내려준다. 프론트가 조립하지 않는다(§0.7) */
  explorerUrl?: string | null
  blockNumber?: number | null
  verification: ChainJobVerification | null
  retryCount: number
  /** 규격 코드 문자열. signerType=USER이면 retryable은 항상 false */
  failureReason: string | null
  retryable: boolean
  results?: ChainJobResultItem[] | null
  pollAfterMs: number | null
  submittedAt?: string | null
  confirmedAt?: string | null
  /** MINT job에만. 기본 지급/관리자 지급 구분 */
  grantSource?: string | null
}

/* ───────────── 사용자 서명 tx 규약 (§0.4 prepare → 서명 → signed-tx) ───────────── */

/** `chain_job.tx_type`과 같은 값. v4의 TREASURY_IN은 삭제됐다. */
export type SignKind = 'APPROVE' | 'PURCHASE' | 'DEPOSIT' | 'AGREE'

/** 항상 이 값 하나다. 프론트는 이 타입으로 **발신자 서명만** 만든다. */
export type FeeDelegatedTxType = 'FEE_DELEGATED_SMART_CONTRACT_EXECUTION'

/**
 * 서명 팝업 직전 사람이 읽는 요약(결정 v2 §2.3). `title`은 Accept-Language에 맞춰 내려온다.
 * 절마다 담기는 키가 달라 인덱스 시그니처를 열어 둔다.
 */
export interface SignRequestSummary {
  title: string
  amount?: number
  currency?: 'KRW'
  [key: string]: unknown
}

/** `POST …/prepare` 응답의 서명 대상 1건. 배열 순서대로 서명·보고한다. */
export interface SignRequest {
  kind: SignKind
  /** false면 생략 가능(allowance가 이미 충분한 APPROVE 등) */
  required: boolean
  txType: FeeDelegatedTxType
  /** 컨트랙트 주소 */
  to: string
  /** calldata (hex) */
  data: string
  /** 항상 "0x0" — YoYo는 ERC-20이다 */
  value: string
  /** 항상 "0x3e9" (Kairos 1001). 지갑 체인이 다르면 전환을 먼저 요청한다 */
  chainId: string
  /** 서버 추정 가스 한도 **힌트**. 수수료는 feePayer가 전액 부담한다 */
  gas: string
  /** 대납 서명·전송을 수행하는 운영지갑 주소. 표시·검증용이며 서명 대상 tx의 필드가 아니다 */
  feePayer: string
  summary: SignRequestSummary
}

/** `POST …/prepare` 200 응답. */
export interface PrepareSignResponse {
  signRequests: SignRequest[]
  /** 서명 파라미터 유효 시각(주문 15분 만료·규칙 해시 변경에 연동) */
  expiresAt: string
}

/**
 * `POST …/signed-tx` 요청 본문 → 202 + jobId.
 *
 * ⚠ `senderSignedRlp`는 **보고 직후 버린다.** localStorage·sessionStorage·로그·에러 리포트에
 *   남기지 않는다(기술 스택 v3 §3.2). 같은 RLP 재보고는 서버가 최초 jobId를 재생하므로
 *   재시도용으로 보관할 이유도 없다(RLP 해시가 자연 멱등키다 — §0.8).
 */
export interface SignedTxRequest {
  kind: SignKind
  /** `0x` + hex, 최대 8KB */
  senderSignedRlp: string
}
