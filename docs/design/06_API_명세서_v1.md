# API 명세서 v1

> 대상: S15P21B204 (소규모 공연 티켓팅·공동 정산 플랫폼) · 작성 2026-08-28(금) · 상태: **초안** · **노션 미러**: [API 명세서 DB](https://app.notion.com/p/6c42746d15ab836a9e57811892753f30) · 기준: [API 공통 응답 규격 v3](./01_API_공통_응답_규격.md) · [설계문서 작성계획 v1](./00_설계문서_작성계획_v1.md) §1 SSOT · [기획 v2.1](../planning/01_기획_초안_v2.md) · [개발 컨벤션](./02_개발_컨벤션.md) · [비기능 계획 v0](./03_비기능_요구사항_명세서_v0_계획.md) · [정산 지갑 두 갈래](../planning/03_정산지갑_두갈래_v1.html)
>
> 표기 — **[팀]** 팀 결정 / **[권]** 권고안(이견 시 변경). 엔드포인트 번호·메서드·경로·이름은 계획 v1 §1.7 인벤토리와 **글자 단위로 동일**하며 이 문서에서 임의로 만들지 않는다. 에러 코드는 규격 v3 §3에 있는 것만 쓰고, 없어서 아쉬웠던 코드·경로는 **§17 신설 제안**에만 모았다(본문 미사용). 상태값 문자열은 계획 §1.5 그대로다.
>
> 각 엔드포인트 절의 구성 순서(`## 요구사항` → `## Request` → `### 시스템 처리` → `## Response`)는 노션 `APISpec` DB 행 템플릿 순서를 그대로 옮긴 것이다. 2단계에서 이 절들이 노션 행 본문이 된다.

---

## 0. 공통 규약

### 0.1 기본

| 항목 | 규칙 |
|------|------|
| base URL | `/api/v1` — 이 문서의 모든 경로는 base를 포함해 전체 경로로 적는다 |
| 리소스 표기 | 복수형 kebab-case, path 변수는 `{performanceId}` 형식(컨벤션 PK 이름과 동일) |
| 인증 | `Authorization: Bearer {accessToken}`. **공개 API**(`GET /api/v1/performances`, `GET /api/v1/performances/{performanceId}`, `GET /api/v1/coin/supply`, `GET /api/v1/transfers/{token}`, `GET /api/v1/public/**`)는 헤더 **불필요**하며, 각 절의 "권한: GUEST(인증 불필요)"로 명시한다 |
| 응답 래퍼 | 성공·실패 구분 없이 `{ code, data, msg }` 3필드 고정. 실패 시 `data`는 예외 없이 `null` |
| 성공 판별 | **`code === "SUCCESS"`**. `status === 200` 하드코딩 금지 — 201·202가 정상 응답으로 존재한다 |
| `msg` | 사용자에게 그대로 노출 가능한 한국어. 성공은 빈 문자열이 기본, 토스트 문구가 있을 때만 채운다. **클라이언트가 `msg`로 분기하지 않는다** |
| 시간 | ISO 8601 오프셋 표기 `2026-09-19T19:00:00+09:00` (KST). 서버 저장은 `DATETIME(6)` |
| 금액 | **원 단위 정수**(JSON number, 서버 `BIGINT`). KRWS `decimals=0`, 1 KRWS = 1원이라 소수가 없다 |
| 주소·해시 | 지갑 주소 `0x` + 40 hex = **42자**, 트랜잭션 해시 `0x` + 64 hex = **66자**. 대소문자는 체크섬 표기 그대로 반환 |
| 문자 인코딩 | 요청·응답 모두 UTF-8, `Content-Type: application/json;charset=UTF-8` |

### 0.2 목록(페이지네이션)

| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `page` | query | integer | N | **0-base**, 기본 `0`, 최소 0 |
| `size` | query | integer | N | 기본 `20`, 최소 1, **최대 100**. 초과 시 `COMMON_VALIDATION_FAILED` |
| `sort` | query | string | N | `필드,asc\|desc`. 각 API 절에 허용 필드를 적는다. 미지정 시 절마다 명시한 기본 정렬 |

```json
{
  "code": "SUCCESS",
  "data": {
    "items": [ { "performanceId": 12, "title": "합정 3밴드 합동공연" } ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 37, "hasNext": true }
  },
  "msg": ""
}
```

### 0.3 비동기 트랜잭션 규약 (202)

온체인 tx·금융망 이체처럼 즉시 끝나지 않는 작업은 **`202 Accepted` + 작업 식별자**를 반환하고, 클라이언트는 폴링으로 결과를 확인한다. `code`는 `SUCCESS`다.

```json
{ "code": "SUCCESS", "data": { "jobId": "chain_01J8XQ7M2K", "status": "PENDING", "pollAfterMs": 1500 }, "msg": "" }
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `jobId` | string | 작업 식별자. `chain_*`(ChainJob) 또는 `mint_*`·`burn_*`(CoinJob) 접두 |
| `status` | string | `PENDING` / `SUBMITTED` / `CONFIRMED` / `FAILED` (계획 §1.5 CoinJob·ChainJob) |
| `pollAfterMs` | integer | 다음 폴링까지 권장 대기(ms). 기본 1500, 혼잡 시 서버가 늘려 내려준다 |

폴링 대상은 **`GET /api/v1/chain/jobs/{jobId}`** 하나다(API-chain-01). 확정(`CONFIRMED`) 시 `txHash`(66자)와 `explorerUrl`이 채워지고, `FAILED`면 `failureReason`(규격 v3 코드 문자열)과 `retryable`이 채워진다.

- **재시도**: 서버가 큐에서 **최대 3회** 자동 재시도한다(비기능 REL-09). 3회 최종 실패 시 `status=FAILED`로 고정하고 운영자 알림을 발송하며, 관리자 재처리 경로(`POST /api/v1/admin/coin/jobs/{jobId}/retry`, `POST /api/v1/admin/redemptions/{redemptionId}/retry`)로 넘어간다.
- **온체인 반영 목표**: 예매 확정 응답은 tx 확정을 기다리지 않으며 온체인 반영 ≤ 60초(PERF-04).
- **nonce**: operator 지갑의 tx는 단일 nonce 직렬 큐로 처리한다. 큐 직렬화 실패는 `CHAIN_NONCE_CONFLICT`.

### 0.4 멱등키

| 항목 | 규칙 |
|------|------|
| 헤더 | `Idempotency-Key: {UUIDv4}` |
| **필수** 대상 | 주문 생성(API-ticket-01) · 결제 요청(API-payment-01) · 개별 취소·환불(API-refund-02) · 공연 취소(API-performance-12) · 환급 재시도(API-redeem-02) · 코인 작업 재시도(API-coin-03) · release 실행(API-settlement-05) |
| 보존 | 키 + 요청 해시를 **24시간** 저장. 같은 키·같은 요청 재호출 시 **최초 응답을 그대로 재생**하며 부작용을 재실행하지 않는다(REL-04) |
| 충돌 | 같은 키에 다른 요청 본문이 오면 `409 COMMON_CONFLICT` |
| 누락 | 필수 대상에서 헤더가 없으면 `400 COMMON_VALIDATION_FAILED` |

### 0.5 호출 제한 (rate limit)

로그인·QR 검증·양도 수락 엔드포인트는 **IP당 60회/분**을 넘으면 `429 COMMON_TOO_MANY_REQUESTS`(SEC-10). 예매 매크로 차단 룰도 같은 코드를 쓴다. 초과 시 `Retry-After` 헤더(초)를 함께 내린다.

### 0.6 공통 에러

아래는 모든 엔드포인트에 공통으로 적용되며, 각 절의 에러 표에서는 **그 API에 고유하거나 발생 조건이 특별한 것만** 다시 적는다.

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 요청 body·쿼리 파라미터가 Bean Validation 규칙 위반 (SEC-12) |
| 401 | `COMMON_UNAUTHORIZED` | 인증이 필요한 API에 `Authorization` 헤더가 없음 |
| 401 | `AUTH_TOKEN_EXPIRED` | access token 만료. 클라이언트는 **이 코드에서만** 토큰 재발급 후 원요청 재시도 |
| 401 | `AUTH_TOKEN_INVALID` | 서명 불일치·위조 토큰. 재발급 시도 없이 즉시 로그아웃 |
| 403 | `COMMON_FORBIDDEN` | 인증됐으나 권한 없음 (도메인 전용 코드가 없을 때만) |
| 404 | `COMMON_NOT_FOUND` | 리소스 없음 (도메인 전용 코드가 없을 때만) |
| 409 | `COMMON_CONFLICT` | 동시 요청으로 인한 일반적 상태 충돌, 멱등키 본문 불일치 |
| 429 | `COMMON_TOO_MANY_REQUESTS` | 호출 한도 초과 |
| 500 | `COMMON_INTERNAL_ERROR` | 처리되지 않은 서버 예외. 상세는 로그에만 |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | 금융망·체인 노드 오류이며 도메인 전용 코드가 없는 경우 |

**보안 규칙(SEC-09)** — 스택트레이스·SQL·체인 revert 원문·금융망 원본 오류 문자열은 `msg`에 넣지 않는다.

### 0.7 도메인 절 목차

| 절 | 도메인 | 엔드포인트 | 코드 접두 |
|----|--------|-----------|-----------|
| 1 | `member` 회원·인증 | API-member-01~07 | `AUTH_*` |
| 2 | `team` 공연팀 | API-team-01~07 | `TEAM_*` |
| 3 | `wallet` 팀 지갑 | API-wallet-01~02 | `WALLET_*` |
| 4 | `performance` 공연 | API-performance-01~12 | `PERFORMANCE_*` |
| 5 | `rule` 정산 규칙 | API-rule-01~04 | `RULE_*` |
| 6 | `ticket` 예매·티켓 | API-ticket-01~06 | `TICKET_*` |
| 7 | `payment` 결제 | API-payment-01~02 | `PAYMENT_*` |
| 8 | `coin` KRWS (+ 비동기 작업 폴링) | API-coin-01~03, API-chain-01 | `COIN_*`·`CHAIN_*` |
| 9 | `refund` 취소·환불 | API-refund-01~02 | `REFUND_*` |
| 10 | `transfer` 양도 | API-transfer-01~04 | `TRANSFER_*` |
| 11 | `entry` 입장 | API-entry-01~03 | `ENTRY_*` |
| 12 | `settlement` 정산 | API-settlement-01~05 | `SETTLEMENT_*` |
| 13 | `redeem` 환급 | API-redeem-01~02 | `REDEEM_*` |
| 14 | `verify` 공개 검증 | API-verify-01~02 | `CHAIN_*`·`COIN_*` |
| 15 | `admin` 관리자 | API-admin-01·02·04~08 (admin-03은 P1 → §16) | `COMMON_*` |

`chain` 도메인은 계획 §1.3의 15개 도메인 목록에 없고 API-chain-01 하나뿐이라 §8 `coin` 절 끝에 "공통 폴링" 항목으로 둔다. 번호·경로는 §1.7 그대로다.

---

## 1. member — 회원·인증

인증 전제 [권] P-1: 이메일+비밀번호 자체 로그인(P0), JWT **access 30분 / refresh 14일**(서버 저장·회전, SEC-02). 카카오 로그인(API-member-08)은 P1이라 §16에만 둔다. 관객은 지갑이 없고 대신 **금융망 계좌 1개**를 연결한다(P-7).

### API-member-01 회원가입
`POST /api/v1/auth/signup` · 권한: GUEST(인증 불필요) · 우선: P0 · 연관 화면: `C-02 회원가입` · 연관 기능: 이메일 회원가입

## 요구사항
- 이메일·비밀번호·이름·연락처와 약관 동의로 계정을 만든다. 이메일은 계정 식별자이며 중복될 수 없다.
- 비밀번호는 서버에서 BCrypt로 단방향 해싱해 저장하고 어떤 응답에도 포함하지 않는다.
- 가입 직후 역할은 `AUDIENCE`다. 팀에 소속되면 `PERFORMER` 권한이 함께 생긴다(계획 §1.2) [권].
- 가입 시점에는 금융망 계좌를 요구하지 않는다. 계좌 연결은 API-member-07에서 별도로 한다 [권] P-7.

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `email` | string | Y | RFC 5322, 최대 254자 | 로그인 ID |
| `password` | string | Y | 8~64자, 영문·숫자·특수문자 중 2종 이상 | 평문 전송(HTTPS 전 구간, SEC-01) |
| `name` | string | Y | 1~20자 | 실명 또는 활동명 |
| `phone` | string | Y | `010-0000-0000` 형식 | 예매 확인·알림용 |
| `termsAgreed` | boolean | Y | `true`만 허용 | 이용약관 동의 |
| `privacyAgreed` | boolean | Y | `true`만 허용 | 개인정보 처리방침 동의 |

```json
{
  "email": "audience@ssafy.io",
  "password": "b204!Pass",
  "name": "김관객",
  "phone": "010-1234-5678",
  "termsAgreed": true,
  "privacyAgreed": true
}
```

### 시스템 처리
1. Bean Validation → 이메일 중복 조회(`member.email` 유니크).
2. 상태 전이: 신규 `member` 생성, 인증 상태는 `UNAUTHENTICATED` 유지(가입만으로 로그인시키지 않는다) [권].
3. 외부 호출 없음.
4. `member` 저장 + 가입 감사 로그 기록.

## Response
### 201 Created
```json
{ "code": "SUCCESS", "data": { "memberId": 1024, "email": "audience@ssafy.io", "name": "김관객" }, "msg": "가입이 완료되었습니다. 로그인해 주세요." }
```

### 4xx
```json
{ "code": "AUTH_EMAIL_DUPLICATED", "data": null, "msg": "이미 가입된 이메일입니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 형식 위반, 약관 미동의 |
| 409 | `AUTH_EMAIL_DUPLICATED` | 동일 이메일 계정 존재 |

---

### API-member-02 로그인
`POST /api/v1/auth/login` · 권한: GUEST(인증 불필요) · 우선: P0 · 연관 화면: `C-01 로그인` · 연관 기능: 이메일 로그인

## 요구사항
- 이메일·비밀번호를 검증하고 access token(30분)·refresh token(14일)을 발급한다 [권] P-1 / SEC-02.
- refresh token은 서버에 저장하고 재발급 때마다 회전한다. 응답에 두 토큰과 만료 시각을 함께 담는다.
- 이메일 없음과 비밀번호 불일치를 구분하지 않고 같은 코드로 응답해 계정 존재 여부를 노출하지 않는다.
- IP당 60회/분 호출 제한 대상이다(SEC-10).

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `email` | string | Y | RFC 5322 | 로그인 ID |
| `password` | string | Y | 8~64자 | 평문 전송 |

```json
{ "email": "audience@ssafy.io", "password": "b204!Pass" }
```

### 시스템 처리
1. 이메일로 회원 조회 → BCrypt 비교. 실패 시 시도 횟수를 기록하고 동일 코드 반환.
2. 상태 전이: 인증 상태 `UNAUTHENTICATED` → `AUTHENTICATED`.
3. 외부 호출 없음.
4. `refresh_token` 저장(회원·디바이스 단위), 로그인 감사 로그 기록.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "memberId": 1024,
    "name": "김관객",
    "roles": ["AUDIENCE"],
    "accessToken": "eyJhbGciOi...",
    "accessTokenExpiresAt": "2026-08-28T14:30:00+09:00",
    "refreshToken": "eyJhbGciOi...",
    "refreshTokenExpiresAt": "2026-09-11T14:00:00+09:00"
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "AUTH_INVALID_CREDENTIALS", "data": null, "msg": "아이디 또는 비밀번호가 올바르지 않습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 이메일 형식 오류, 필드 누락 |
| 401 | `AUTH_INVALID_CREDENTIALS` | 계정 없음 또는 비밀번호 불일치 |
| 429 | `COMMON_TOO_MANY_REQUESTS` | IP당 60회/분 초과 (SEC-10) |

---

### API-member-03 토큰 재발급
`POST /api/v1/auth/refresh` · 권한: 회원(refresh token 소지) · 우선: P0 · 연관 화면: `공통` · 연관 기능: 토큰 재발급·세션 유지

## 요구사항
- `AUTH_TOKEN_EXPIRED`를 받은 클라이언트만 호출한다. `AUTH_TOKEN_INVALID`에서는 호출하지 않고 즉시 로그아웃한다(규격 v3 §1).
- refresh token은 **1회용**이다. 재발급 시 기존 토큰을 폐기하고 새 토큰으로 회전한다(SEC-02).
- 이미 폐기된 refresh token이 다시 오면 탈취로 보고 해당 회원의 전체 refresh token을 무효화한다 [권].

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- (access token 불필요 — 만료된 토큰 상태에서 호출하는 API다)

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `refreshToken` | string | Y | JWT | 로그인 시 발급받은 refresh token |

```json
{ "refreshToken": "eyJhbGciOi..." }
```

### 시스템 처리
1. 서명·만료 검증 → 서버 저장분과 대조(회전 이력 포함).
2. 상태 전이: 인증 상태 `AUTHENTICATED` 유지, 기존 refresh token 폐기.
3. 외부 호출 없음.
4. 새 access·refresh token 발급 후 저장.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "accessToken": "eyJhbGciOi...",
    "accessTokenExpiresAt": "2026-08-28T15:00:00+09:00",
    "refreshToken": "eyJhbGciOi...",
    "refreshTokenExpiresAt": "2026-09-11T15:00:00+09:00"
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "AUTH_TOKEN_INVALID", "data": null, "msg": "인증 정보가 올바르지 않습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `refreshToken` 누락 |
| 401 | `AUTH_TOKEN_EXPIRED` | refresh token도 만료(14일 초과) → 재로그인 |
| 401 | `AUTH_TOKEN_INVALID` | 서명 불일치, 이미 폐기된 토큰, 저장분 불일치 |

---

### API-member-04 로그아웃
`POST /api/v1/auth/logout` · 권한: 회원 · 우선: P0 · 연관 화면: `C-03 마이페이지` · 연관 기능: 로그아웃

## 요구사항
- 서버에 저장된 refresh token을 폐기해 재발급 경로를 끊는다. access token은 만료(최대 30분)까지 유효하다.
- 토큰이 이미 폐기된 상태여도 200으로 응답해 클라이언트 로그아웃 흐름을 막지 않는다 [권].

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `refreshToken` | string | N | JWT | 지정하면 해당 토큰만, 생략하면 현재 세션 토큰을 폐기 |

```json
{ "refreshToken": "eyJhbGciOi..." }
```

### 시스템 처리
1. access token으로 회원 식별.
2. 상태 전이: 인증 상태 `AUTHENTICATED` → `UNAUTHENTICATED`.
3. 외부 호출 없음.
4. `refresh_token` 행 폐기 + 로그아웃 감사 로그.

## Response
### 200 OK
```json
{ "code": "SUCCESS", "data": null, "msg": "로그아웃되었습니다." }
```

### 4xx
```json
{ "code": "COMMON_UNAUTHORIZED", "data": null, "msg": "로그인이 필요합니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 401 | `AUTH_TOKEN_INVALID` | 위조 토큰 |

---

### API-member-05 내 정보 조회
`GET /api/v1/members/me` · 권한: 회원 · 우선: P0 · 연관 화면: `C-03 마이페이지` · 연관 기능: 내 정보 조회

## 요구사항
- 프로필, 보유 역할, 금융망 계좌 연결 여부, 소속 팀 요약을 한 번에 준다. 마이페이지 진입 1회 호출로 화면이 그려져야 한다.
- 계좌번호는 **마스킹**해서 내려준다(뒤 4자리만 노출).
- 관객 화면에는 지갑·가스 개념을 노출하지 않는다(기획 §8.2). 팀 지갑 주소는 API-wallet-01에서만 준다.

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
없음.

### Body
없음.

### 시스템 처리
1. access token에서 `memberId` 추출.
2. 상태 전이 없음(조회).
3. 외부 호출 없음 — 계좌 실시간 잔액은 조회하지 않는다.
4. `member` + `member_bank_account` + `team_member` 조인 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "memberId": 1024,
    "email": "audience@ssafy.io",
    "name": "김관객",
    "phone": "010-1234-5678",
    "roles": ["AUDIENCE", "PERFORMER"],
    "bankAccount": { "connected": true, "bankCode": "088", "bankName": "신한", "accountNoMasked": "****5678", "holderName": "김관객" },
    "teams": [ { "teamId": 7, "teamName": "블루노트", "leader": true } ],
    "createdAt": "2026-08-20T10:11:00+09:00"
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "AUTH_TOKEN_EXPIRED", "data": null, "msg": "로그인이 만료되었습니다. 다시 로그인해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 401 | `AUTH_TOKEN_EXPIRED` | access token 만료 → API-member-03으로 재발급 |

---

### API-member-06 내 정보 수정
`PATCH /api/v1/members/me` · 권한: 회원 · 우선: P0 · 연관 화면: `C-03 마이페이지` · 연관 기능: 내 정보 수정

## 요구사항
- 이름·연락처·비밀번호를 부분 수정한다. 이메일은 계정 식별자라 변경 대상이 아니다 [권].
- 비밀번호 변경 시 `currentPassword`를 함께 받아 본인 확인을 하고, 성공하면 해당 회원의 refresh token을 전부 폐기한다(SEC-02).
- 전달된 필드만 수정한다(미포함 필드는 변경하지 않는다).

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `name` | string | N | 1~20자 | 이름 |
| `phone` | string | N | `010-0000-0000` | 연락처 |
| `currentPassword` | string | N | `newPassword`와 동시 필수 | 현재 비밀번호 |
| `newPassword` | string | N | 8~64자, 현재와 달라야 함 | 새 비밀번호 |

```json
{ "name": "김관객", "phone": "010-9999-0000", "currentPassword": "b204!Pass", "newPassword": "b204!NewPass" }
```

### 시스템 처리
1. 필드 검증 → 비밀번호 변경 요청이면 `currentPassword` 대조.
2. 상태 전이 없음(프로필 수정). 비밀번호 변경 시 인증 상태는 유지하되 refresh token 전량 폐기.
3. 외부 호출 없음.
4. `member` 갱신 + 변경 감사 로그.

## Response
### 200 OK
```json
{ "code": "SUCCESS", "data": { "memberId": 1024, "name": "김관객", "phone": "010-9999-0000" }, "msg": "정보가 수정되었습니다." }
```

### 4xx
```json
{ "code": "AUTH_INVALID_CREDENTIALS", "data": null, "msg": "아이디 또는 비밀번호가 올바르지 않습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 형식 위반, `newPassword`만 단독 전달 |
| 401 | `AUTH_INVALID_CREDENTIALS` | `currentPassword` 불일치 |
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |

---

### API-member-07 금융망 계좌 연결
`PUT /api/v1/members/me/bank-account` · 권한: AUDIENCE · 우선: P0 · 연관 화면: `C-03 마이페이지`·`A-05 결제` · 연관 기능: 관객 금융망 계좌 연결

## 요구사항
- 관객이 결제에 쓸 SSAFY 교육용 금융망 계좌를 **1개** 연결한다 [권] P-7. 이미 연결돼 있으면 교체한다(PUT 멱등).
- **예금주명이 회원 이름과 일치**해야 등록된다(SEC-13, 지갑 문서 "지금 잡을 것"). 불일치는 `COMMON_VALIDATION_FAILED`로 돌려보낸다(전용 코드는 §17 신설 제안).
- 계좌번호 원문은 응답에 담지 않고 마스킹만 내려준다. 저장 시 암호화한다.
- 계좌 미연결 상태로 결제(API-payment-01)를 시도하면 결제 단계에서 막힌다.

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `bankCode` | string | Y | 3자리 숫자 | 금융망 은행 코드 |
| `accountNo` | string | Y | 10~16자리 숫자 | 계좌번호(하이픈 없이) |
| `holderName` | string | Y | 1~20자, 회원 이름과 일치 | 예금주명 |

```json
{ "bankCode": "088", "accountNo": "1102045678", "holderName": "김관객" }
```

### 시스템 처리
1. 형식 검증 → 회원 이름과 `holderName` 대조.
2. 상태 전이 없음(회원 부속 정보 등록).
3. 외부 호출: 금융망 API 계좌 실재·예금주 조회(동기, 타임아웃 5초). 실패는 `502`로 매핑.
4. `member_bank_account` upsert(계좌번호 암호화) + 감사 로그.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": { "bankCode": "088", "bankName": "신한", "accountNoMasked": "****5678", "holderName": "김관객", "verifiedAt": "2026-08-28T14:22:10+09:00" },
  "msg": "계좌가 연결되었습니다."
}
```

### 4xx/5xx
```json
{ "code": "COMMON_VALIDATION_FAILED", "data": null, "msg": "예금주명이 회원 정보와 일치하지 않습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 형식 위반, 예금주명 불일치, 금융망에 없는 계좌 |
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | 금융망 API 오류 |

---

## 2. team — 공연팀

팀 생성 시 **팀별 커스터디얼 지갑이 자동 생성**된다 [권] P-2(옵션 B). 팀 키는 `agreeToRules` 서명 1회에만 복호화되고 나머지 tx는 운영지갑이 처리한다. 팀 리더만 팀 수정·초대·정산 계좌 등록 권한을 갖고 팀원은 조회만 한다(계획 §1.2, SEC-03).

### API-team-01 팀 생성(+팀 지갑 생성)
`POST /api/v1/teams` · 권한: 회원 · 우선: P0 · 연관 화면: `P-02 팀 관리` · 연관 기능: 공연팀 등록·팀 지갑 자동 생성

## 요구사항
- 팀을 만든 회원이 자동으로 **리더**가 되고 `PERFORMER` 역할을 얻는다(계획 §1.2).
- 같은 트랜잭션 안에서 **팀 지갑(EOA)을 자동 생성**한다. 개인키는 envelope encryption(AES-256-GCM DEK + KEK)으로 저장하고 평문은 DB·로그 어디에도 남기지 않는다(SEC-04). 지갑 생성 실패 시 팀 생성 전체를 롤백한다(`WALLET_CREATION_FAILED`).
- 지갑 생성 직후 운영지갑이 **가스를 소량 자동 전송**한다 [권] P-3. 사용자에게 가스 개념을 노출하지 않으며, 전송 실패가 팀 생성을 막지는 않는다(AVAIL-06 알림 대상).
- 팀 이름은 전역 유니크가 아니다. 동일인이 같은 이름의 팀을 중복 생성하는 것만 막는다 [권].

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `teamName` | string | Y | 1~30자 | 팀(밴드) 이름 |
| `genre` | string | N | 최대 20자 | 장르 |
| `introduction` | string | N | 최대 500자 | 팀 소개 |
| `contactEmail` | string | N | RFC 5322 | 섭외 연락처 |

```json
{ "teamName": "블루노트", "genre": "인디록", "introduction": "합정 기반 3인조", "contactEmail": "bluenote@ssafy.io" }
```

### 시스템 처리
1. 필드 검증 → 동일 리더·동일 이름 팀 중복 확인.
2. 상태 전이: `team` 생성, 요청자를 `team_member`(리더)로 등록해 역할에 `PERFORMER` 추가.
3. 외부 호출: 팀 지갑 EOA 생성(서버 내부) → 운영지갑에서 가스 소량 전송(비동기 큐, 실패해도 팀 생성은 유지).
4. `team`·`team_member`·`team_wallet` 저장 + 지갑 생성 감사 로그(SEC-11).

## Response
### 201 Created
```json
{
  "code": "SUCCESS",
  "data": {
    "teamId": 7,
    "teamName": "블루노트",
    "leaderMemberId": 1024,
    "walletAddress": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b",
    "createdAt": "2026-08-28T14:40:00+09:00"
  },
  "msg": "팀이 생성되었습니다."
}
```

### 4xx/5xx
```json
{ "code": "WALLET_CREATION_FAILED", "data": null, "msg": "팀 지갑 생성에 실패했습니다. 잠시 후 다시 시도해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 이름 길이·형식 위반 |
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 409 | `COMMON_CONFLICT` | 같은 리더가 같은 이름의 팀을 중복 생성 |
| 500 | `WALLET_CREATION_FAILED` | 지갑 생성·키 암호화 실패 → 팀 생성 전체 롤백 |

---

### API-team-02 내 팀 목록
`GET /api/v1/teams/me` · 권한: PERFORMER · 우선: P0 · 연관 화면: `P-01 공연자 대시보드` · 연관 기능: 내 팀 목록 조회

## 요구사항
- 로그인한 회원이 소속된 팀을 전부 준다. 리더 여부와 정산 계좌 등록 여부를 함께 담아 대시보드에서 "계좌 등록하세요" 안내를 띄울 수 있게 한다.
- 팀이 없으면 빈 배열과 `pageInfo`를 반환한다(404가 아니다).

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `page` | query | integer | N | 0-base, 기본 0 |
| `size` | query | integer | N | 기본 20, 최대 100 |

### Body
없음.

### 시스템 처리
1. access token에서 `memberId` 추출.
2. 상태 전이 없음(조회).
3. 외부 호출 없음(지갑 잔액은 조회하지 않는다 — API-wallet-01에서만).
4. `team_member` 기준 조회 후 `items`/`pageInfo`로 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "items": [
      { "teamId": 7, "teamName": "블루노트", "genre": "인디록", "leader": true, "memberCount": 3, "settlementAccountRegistered": false }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 1, "hasNext": false }
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "COMMON_UNAUTHORIZED", "data": null, "msg": "로그인이 필요합니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |

---

### API-team-03 팀 상세
`GET /api/v1/teams/{teamId}` · 권한: PERFORMER(해당 팀 소속) · 우선: P0 · 연관 화면: `P-02 팀 관리` · 연관 기능: 팀 상세 조회

## 요구사항
- 팀 정보·팀원 목록·정산 계좌 등록 상태를 준다. 팀 지갑 주소는 여기서도 노출하되 잔액·tx는 API-wallet-01/02가 담당한다.
- 소속 팀원이 아니면 조회할 수 없다(SEC-03). 정산 계좌번호는 마스킹한다.

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `teamId` | path | integer(BIGINT) | Y | 팀 PK |

### Body
없음.

### 시스템 처리
1. `teamId` 존재 확인 → 요청자의 소속 여부 확인.
2. 상태 전이 없음(조회).
3. 외부 호출 없음.
4. `team` + `team_member` + `team_settlement_account` + `team_wallet.address` 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "teamId": 7,
    "teamName": "블루노트",
    "genre": "인디록",
    "introduction": "합정 기반 3인조",
    "contactEmail": "bluenote@ssafy.io",
    "leaderMemberId": 1024,
    "walletAddress": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b",
    "members": [
      { "memberId": 1024, "name": "김리더", "leader": true, "joinedAt": "2026-08-28T14:40:00+09:00" },
      { "memberId": 1188, "name": "이베이스", "leader": false, "joinedAt": "2026-08-28T16:02:00+09:00" }
    ],
    "settlementAccount": { "registered": true, "bankName": "국민", "accountNoMasked": "****3311", "holderName": "블루노트" }
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "TEAM_NOT_FOUND", "data": null, "msg": "공연팀을 찾을 수 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 403 | `COMMON_FORBIDDEN` | 해당 팀 소속이 아님 |
| 404 | `TEAM_NOT_FOUND` | 존재하지 않는 `teamId` |

---

### API-team-04 팀 수정
`PATCH /api/v1/teams/{teamId}` · 권한: 리더 · 우선: P0 · 연관 화면: `P-02 팀 관리` · 연관 기능: 팀 정보 수정

## 요구사항
- 리더만 팀 이름·장르·소개·연락처를 수정한다. 팀원은 403이다(SEC-03).
- 전달된 필드만 수정한다. 팀 지갑 주소·리더는 이 API로 바꿀 수 없다 [권].
- 판매가 시작된 공연에 참여 중이어도 팀 프로필 수정은 허용한다(정산 규칙과 무관한 정보다) [권].

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `teamId` | path | integer(BIGINT) | Y | 팀 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `teamName` | string | N | 1~30자 | 팀 이름 |
| `genre` | string | N | 최대 20자 | 장르 |
| `introduction` | string | N | 최대 500자 | 소개 |
| `contactEmail` | string | N | RFC 5322 | 연락처 |

```json
{ "genre": "포스트록", "introduction": "합정 기반 4인조로 변경" }
```

### 시스템 처리
1. `teamId` 존재 확인 → 요청자가 리더인지 확인.
2. 상태 전이 없음.
3. 외부 호출 없음.
4. `team` 갱신.

## Response
### 200 OK
```json
{ "code": "SUCCESS", "data": { "teamId": 7, "teamName": "블루노트", "genre": "포스트록" }, "msg": "팀 정보가 수정되었습니다." }
```

### 4xx
```json
{ "code": "COMMON_FORBIDDEN", "data": null, "msg": "이 작업을 수행할 권한이 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 형식 위반 |
| 403 | `COMMON_FORBIDDEN` | 리더가 아님 |
| 404 | `TEAM_NOT_FOUND` | 존재하지 않는 `teamId` |

---

### API-team-05 팀원 초대
`POST /api/v1/teams/{teamId}/invitations` · 권한: 리더 · 우선: P0 · 연관 화면: `P-02 팀 관리` · 연관 기능: 팀원 초대

## 요구사항
- 리더가 이메일로 팀원을 초대하고, 서명된 초대 토큰과 수락 링크를 돌려받는다. 링크 전달은 클라이언트가 복사·공유로 처리한다 [권].
- 초대 토큰 유효기간은 **7일**이다 [권]. 만료된 토큰 수락은 `TEAM_INVITE_EXPIRED`(410).
- 이미 팀원인 회원, 이미 유효한 초대가 있는 이메일은 중복 초대하지 않는다.

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `teamId` | path | integer(BIGINT) | Y | 팀 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `email` | string | Y | RFC 5322 | 초대할 회원 이메일 |

```json
{ "email": "bass@ssafy.io" }
```

### 시스템 처리
1. 리더 권한 확인 → 대상 이메일의 기존 팀원·유효 초대 여부 확인.
2. 상태 전이: `team_invitation` 생성(유효 7일).
3. 외부 호출 없음(메일 발송은 범위 밖 [권]).
4. `team_invitation` 저장, 토큰과 수락 링크 반환.

## Response
### 201 Created
```json
{
  "code": "SUCCESS",
  "data": {
    "invitationToken": "inv_9f2c1a7b4e8d",
    "acceptUrl": "https://b204.ssafy.io/invitations/inv_9f2c1a7b4e8d",
    "email": "bass@ssafy.io",
    "expiresAt": "2026-09-04T14:50:00+09:00"
  },
  "msg": "초대 링크를 전달해 주세요."
}
```

### 4xx
```json
{ "code": "COMMON_CONFLICT", "data": null, "msg": "이미 초대가 진행 중이거나 팀에 소속된 회원입니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 이메일 형식 오류 |
| 403 | `COMMON_FORBIDDEN` | 리더가 아님 |
| 404 | `TEAM_NOT_FOUND` | 존재하지 않는 `teamId` |
| 409 | `COMMON_CONFLICT` | 이미 팀원이거나 유효한 초대가 존재 (전용 코드는 §17 신설 제안) |

---

### API-team-06 초대 수락
`POST /api/v1/teams/invitations/{token}/accept` · 권한: 회원 · 우선: P0 · 연관 화면: `P-02 팀 관리` · 연관 기능: 팀원 초대 수락

## 요구사항
- 로그인한 회원만 수락할 수 있다. 초대받은 이메일과 로그인 계정 이메일이 같아야 한다 [권].
- 수락 즉시 `team_member`로 등록되고 `PERFORMER` 역할을 얻는다. 초대 토큰은 1회용으로 폐기된다.
- 만료(7일 초과) 토큰은 `410 TEAM_INVITE_EXPIRED`, 이미 사용된 토큰은 `409 COMMON_CONFLICT`다.

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `token` | path | string | Y | 초대 토큰(서명 문자열, 최대 128자) |

### Body
없음.

### 시스템 처리
1. 토큰 서명·만료 검증 → 초대 이메일과 로그인 계정 대조.
2. 상태 전이: `team_invitation` 사용 처리, `team_member` 신규 등록(역할에 `PERFORMER` 추가).
3. 외부 호출 없음(팀 지갑은 팀 생성 시 이미 존재).
4. `team_member` 저장 + 감사 로그.

## Response
### 200 OK
```json
{ "code": "SUCCESS", "data": { "teamId": 7, "teamName": "블루노트", "memberId": 1188, "leader": false }, "msg": "팀에 합류했습니다." }
```

### 4xx
```json
{ "code": "TEAM_INVITE_EXPIRED", "data": null, "msg": "초대가 만료되었습니다. 주최자에게 재요청해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 상태 |
| 403 | `COMMON_FORBIDDEN` | 초대받은 이메일과 로그인 계정이 다름 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 토큰 |
| 409 | `COMMON_CONFLICT` | 이미 사용된 초대, 이미 팀원 |
| 410 | `TEAM_INVITE_EXPIRED` | 유효기간 7일 초과 |

---

### API-team-07 정산 계좌 등록(예금주 검증)
`PUT /api/v1/teams/{teamId}/settlement-account` · 권한: 리더 · 우선: P0 · 연관 화면: `P-02 팀 관리` · 연관 기능: 팀 정산 계좌 등록

## 요구사항
- 팀이 KRWS 환급(원화 이체)을 받을 계좌를 등록한다 [권] P-10. 리더만 등록·교체할 수 있다.
- **예금주명 일치 검증이 필수**다(SEC-13, 지갑 문서 "지금 잡을 것" 3항). 금융망 API로 실계좌·예금주를 조회해 대조하고, 불일치는 `COMMON_VALIDATION_FAILED`로 막는다(전용 코드는 §17 신설 제안).
- 계좌가 없으면 release 이후 자동 환급이 `REDEEM_ACCOUNT_NOT_REGISTERED`로 실패한다. 정산 잠금 전에 등록하도록 화면에서 유도한다.
- 정산이 `RELEASED` 이후로 진행된 공연의 진행 중 환급 건에는 소급 적용하지 않는다 [권].

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `teamId` | path | integer(BIGINT) | Y | 팀 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `bankCode` | string | Y | 3자리 숫자 | 은행 코드 |
| `accountNo` | string | Y | 10~16자리 숫자 | 계좌번호 |
| `holderName` | string | Y | 1~30자 | 예금주명 — 금융망 조회 결과와 일치해야 함 |

```json
{ "bankCode": "004", "accountNo": "80230103311", "holderName": "블루노트" }
```

### 시스템 처리
1. 리더 권한 확인 → 형식 검증.
2. 상태 전이 없음(팀 부속 정보 등록).
3. 외부 호출: 금융망 API 예금주 조회(동기, 타임아웃 5초) → 응답 예금주명과 `holderName` 대조. 오류는 `502`.
4. `team_settlement_account` upsert(계좌번호 암호화) + 감사 로그(SEC-11).

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": { "teamId": 7, "bankCode": "004", "bankName": "국민", "accountNoMasked": "****3311", "holderName": "블루노트", "verifiedAt": "2026-08-28T15:05:00+09:00" },
  "msg": "정산 계좌가 등록되었습니다."
}
```

### 4xx/5xx
```json
{ "code": "COMMON_VALIDATION_FAILED", "data": null, "msg": "예금주명이 계좌 정보와 일치하지 않습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 형식 위반, 예금주명 불일치, 금융망에 없는 계좌 |
| 403 | `COMMON_FORBIDDEN` | 리더가 아님 |
| 404 | `TEAM_NOT_FOUND` | 존재하지 않는 `teamId` |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | 금융망 API 오류 |

---

## 3. wallet — 팀 지갑

옵션 B 채택 [권] P-2. 팀 대시보드에 **지갑 주소와 익스플로러 링크**를 노출해 "각 팀이 독립 검증 경로를 갖는다"를 화면으로 성립시킨다(지갑 문서). 개인키는 어떤 API로도 노출되지 않는다(SEC-04). 가스 잔액은 사용자에게 원화·건수 단위 안내로만 바꿔 보여준다 [권] P-3.

### API-wallet-01 팀 지갑 조회(주소·잔액·링크)
`GET /api/v1/teams/{teamId}/wallet` · 권한: PERFORMER(해당 팀 소속) · 우선: P0 · 연관 화면: `P-02 팀 관리` · 연관 기능: 팀 지갑 조회

## 요구사항
- 팀 지갑 주소(42자), KRWS 잔액(원 단위 정수), 익스플로러 링크를 준다. 팀원도 조회할 수 있다.
- 가스 잔액은 raw 값 대신 `gasSufficient`(임계 충족 여부)와 남은 동의 tx 가능 횟수로 환산해 준다(AVAIL-06, P-3 "가스 개념 비노출").
- 체인 노드 조회 결과는 **10초 캐시**한다 [권]. 노드 장애 시에는 마지막 캐시값과 `staleAt`을 함께 준다(AVAIL-02).

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `teamId` | path | integer(BIGINT) | Y | 팀 PK |

### Body
없음.

### 시스템 처리
1. 팀 존재·소속 확인.
2. 상태 전이 없음(조회).
3. 외부 호출: 체인 노드에서 KRWS `balanceOf`·네이티브 가스 잔액 조회(10초 캐시). 노드 오류는 `502`.
4. 캐시 갱신 후 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "teamId": 7,
    "walletAddress": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b",
    "krwsBalance": 0,
    "gasSufficient": true,
    "remainingAgreeTxCount": 12,
    "explorerUrl": "https://amoy.polygonscan.com/address/0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b",
    "network": "polygon-amoy",
    "refreshedAt": "2026-08-28T15:10:00+09:00"
  },
  "msg": ""
}
```

### 4xx/5xx
```json
{ "code": "WALLET_NOT_FOUND", "data": null, "msg": "팀 지갑 정보를 찾을 수 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 403 | `COMMON_FORBIDDEN` | 해당 팀 소속이 아님 |
| 404 | `TEAM_NOT_FOUND` | 존재하지 않는 `teamId` |
| 404 | `WALLET_NOT_FOUND` | 팀은 있으나 지갑 레코드가 없음(생성 실패 잔재) |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | 체인 노드 조회 실패이며 캐시도 없음 |

---

### API-wallet-02 팀 지갑 tx 이력
`GET /api/v1/teams/{teamId}/wallet/transactions` · 권한: PERFORMER(해당 팀 소속) · 우선: P0 · 연관 화면: `P-02 팀 관리` · 연관 기능: 팀 지갑 트랜잭션 이력 조회

## 요구사항
- 이 팀 지갑이 관여한 tx를 최신순으로 준다 — `agreeToRules`(팀 키 서명), `release` 수령, 환급 `burnFrom`. 각 행에 `txHash`(66자)와 익스플로러 링크를 담아 독립 검증 경로를 만든다.
- 서버가 인덱싱한 `chain_job`·이벤트 기록을 원본으로 삼는다. 노드를 직접 페이징하지 않는다(PERF-01) [권].
- 실패한 tx도 `FAILED` 상태로 함께 보여준다(재시도 3회 이력 포함, REL-09).

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `teamId` | path | integer(BIGINT) | Y | 팀 PK |
| `type` | query | string | N | `AGREE` / `RELEASE` / `REDEEM_BURN`. 미지정 시 전체 |
| `page` | query | integer | N | 0-base, 기본 0 |
| `size` | query | integer | N | 기본 20, 최대 100 |

### Body
없음.

### 시스템 처리
1. 팀 존재·소속 확인 → `type` 값 검증.
2. 상태 전이 없음(조회).
3. 외부 호출 없음(인덱싱된 데이터 사용).
4. `chain_job` 조회 후 `items`/`pageInfo` 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "items": [
      {
        "jobId": "chain_01J8XQ7M2K",
        "type": "RELEASE",
        "status": "CONFIRMED",
        "performanceId": 12,
        "amount": 420000,
        "txHash": "0x9c1a4b7e2d5f8039ab6c4e1d2f3a5b7c9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6",
        "explorerUrl": "https://amoy.polygonscan.com/tx/0x9c1a4b7e2d5f8039ab6c4e1d2f3a5b7c9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6",
        "confirmedAt": "2026-09-22T18:03:12+09:00"
      }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 3, "hasNext": false }
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "COMMON_FORBIDDEN", "data": null, "msg": "이 작업을 수행할 권한이 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `type`, `size` 100 초과 |
| 403 | `COMMON_FORBIDDEN` | 해당 팀 소속이 아님 |
| 404 | `TEAM_NOT_FOUND` | 존재하지 않는 `teamId` |
| 404 | `WALLET_NOT_FOUND` | 지갑 레코드 없음 |

---

## 4. performance — 공연

공연 상태 전이(계획 §1.5): `DRAFT` → `PENDING_AGREEMENT` → `ON_SALE` → `SALE_CLOSED` → `ENDED` / `CANCELLED`. 좌석은 지정하지 않는 **스탠딩**이며 티켓 타입 1~N개, 1인 1공연 최대 4매다 [권] P-6. 판매 시작(`ON_SALE`) 이후에는 공연 정보·티켓 옵션·참여팀·정산 규칙을 바꿀 수 없다(컨트랙트가 강제, `PERFORMANCE_ALREADY_ON_SALE`).

### API-performance-01 공연 생성
`POST /api/v1/performances` · 권한: 리더 · 우선: P0 · 연관 화면: `P-03 공연 생성·수정` · 연관 기능: 공연 생성

## 요구사항
- 팀 리더가 공연 기본 정보(제목·소개·일시·장소·예매 마감)와 단독/공동 여부를 등록한다. 생성자 팀은 자동으로 참여팀 1번이 된다.
- 생성 직후 상태는 `DRAFT`다. 정산 규칙(API-rule-01)을 설정해야 `PENDING_AGREEMENT`로 넘어간다.
- 공연 일시가 과거이거나 예매 마감이 공연일 이후면 `PERFORMANCE_DATE_INVALID`다.
- **취소 마감은 공연일 D-3 00:00**으로 서버가 자동 계산한다 [권] P-8. 요청 필드로 받지 않는다.

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `hostTeamId` | integer | Y | 요청자가 리더인 팀 | 주최(생성자) 팀 |
| `title` | string | Y | 1~100자 | 공연 제목 |
| `description` | string | N | 최대 2000자 | 소개 |
| `posterImageUrl` | string | N | https URL, 최대 500자 | 포스터 |
| `venueName` | string | Y | 1~100자 | 공연장 이름 |
| `venueAddress` | string | Y | 1~200자 | 주소 |
| `startAt` | string(ISO 8601) | Y | 현재 이후 | 공연 시작 일시 |
| `endAt` | string(ISO 8601) | Y | `startAt` 이후 | 공연 종료 일시 — `ENDED` 전이 기준 |
| `saleCloseAt` | string(ISO 8601) | Y | `startAt` 이전 | 예매 마감 일시 |
| `jointPerformance` | boolean | Y | — | 공동 공연 여부. `true`면 참여팀 2팀 이상 필수 |

```json
{
  "hostTeamId": 7,
  "title": "합정 3밴드 합동공연",
  "description": "인디록 3팀 합동 무대",
  "posterImageUrl": "https://cdn.b204.ssafy.io/p/12.png",
  "venueName": "합정 언플러그드",
  "venueAddress": "서울 마포구 양화로 000",
  "startAt": "2026-09-19T19:00:00+09:00",
  "endAt": "2026-09-19T22:00:00+09:00",
  "saleCloseAt": "2026-09-19T17:00:00+09:00",
  "jointPerformance": true
}
```

### 시스템 처리
1. 리더 권한 확인 → 일시 정합성 검증(`startAt` 미래, `endAt` > `startAt`, `saleCloseAt` < `startAt`).
2. 상태 전이: `performance` 생성, 상태 `DRAFT`. `cancelDeadlineAt = startAt` 날짜 기준 D-3 00:00으로 계산.
3. 외부 호출 없음 — 컨트랙트 등록은 판매 시작(API-rule-04)에서 한다.
4. `performance` + 생성자 팀 `performance_participant`(수락 상태) 저장.

## Response
### 201 Created
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "title": "합정 3밴드 합동공연",
    "status": "DRAFT",
    "hostTeamId": 7,
    "startAt": "2026-09-19T19:00:00+09:00",
    "saleCloseAt": "2026-09-19T17:00:00+09:00",
    "cancelDeadlineAt": "2026-09-16T00:00:00+09:00"
  },
  "msg": "공연이 생성되었습니다."
}
```

### 4xx
```json
{ "code": "PERFORMANCE_DATE_INVALID", "data": null, "msg": "공연 일시와 예매 마감 일시를 다시 확인해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 제목 길이 등 형식 위반 |
| 400 | `PERFORMANCE_DATE_INVALID` | 과거 일시, `endAt` ≤ `startAt`, `saleCloseAt` ≥ `startAt` |
| 403 | `COMMON_FORBIDDEN` | `hostTeamId` 팀의 리더가 아님 |
| 404 | `TEAM_NOT_FOUND` | 존재하지 않는 `hostTeamId` |

---

### API-performance-02 공연 목록(공개)
`GET /api/v1/performances` · 권한: GUEST(인증 불필요) · 우선: P0 · 연관 화면: `A-01 홈·공연 탐색` · 연관 기능: 공연 목록 탐색

## 요구사항
- 비로그인 방문자도 볼 수 있는 공개 목록이다. **`ON_SALE`·`SALE_CLOSED` 공연만** 노출하고 `DRAFT`·`PENDING_AGREEMENT`는 제외한다 [권].
- 검색어(제목·팀명)와 날짜 범위로 필터한다. 기본 정렬은 공연 시작 일시 오름차순이다.
- 조회 API p95 ≤ 500ms 목표 대상이다(PERF-01). 목록 응답은 30초 캐시한다 [권].

## Request
### Headers
- `Accept: application/json`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `keyword` | query | string | N | 최대 50자. 제목·참여팀명 부분 일치 |
| `fromDate` | query | string(ISO 8601 date) | N | 공연일 시작(`2026-09-01`) |
| `toDate` | query | string(ISO 8601 date) | N | 공연일 종료. `fromDate` 이상 |
| `status` | query | string | N | `ON_SALE` / `SALE_CLOSED`. 미지정 시 둘 다 |
| `page` | query | integer | N | 0-base, 기본 0 |
| `size` | query | integer | N | 기본 20, 최대 100 |
| `sort` | query | string | N | `startAt,asc`(기본) / `startAt,desc` / `createdAt,desc` |

### Body
없음.

### 시스템 처리
1. 쿼리 검증(`toDate` ≥ `fromDate`, `status` 허용값).
2. 상태 전이 없음(조회).
3. 외부 호출 없음.
4. 공개 대상 상태만 필터해 `items`/`pageInfo` 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "items": [
      {
        "performanceId": 12,
        "title": "합정 3밴드 합동공연",
        "posterImageUrl": "https://cdn.b204.ssafy.io/p/12.png",
        "venueName": "합정 언플러그드",
        "startAt": "2026-09-19T19:00:00+09:00",
        "status": "ON_SALE",
        "minPrice": 25000,
        "soldOut": false,
        "teamNames": ["블루노트", "새벽세시", "노이즈캔슬"]
      }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 37, "hasNext": true }
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "COMMON_VALIDATION_FAILED", "data": null, "msg": "조회 조건을 다시 확인해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `size` 100 초과, 날짜 역전, 허용되지 않는 `status`·`sort` |
| 429 | `COMMON_TOO_MANY_REQUESTS` | 호출 한도 초과 |

---

### API-performance-03 공연 상세(공개)
`GET /api/v1/performances/{performanceId}` · 권한: GUEST(인증 불필요) · 우선: P0 · 연관 화면: `A-02 공연 상세` · 연관 기능: 공연 상세 조회

## 요구사항
- 출연팀·일시·장소·티켓 옵션(잔여 수량 포함)과 **공개 검증 페이지 링크**를 준다. 관객 화면이므로 지갑·가스·tx 용어를 담지 않는다(기획 §8.2).
- 티켓 타입별 잔여 수량은 Redis 재고 기준의 근사값이다. 실제 확정은 주문 생성 시점에 이뤄지고 경합에서 밀리면 `TICKET_SOLD_OUT`이다.
- 취소 마감 시각(`cancelDeadlineAt`)을 함께 내려 A-11 환불 안내에 쓴다 [권] P-8.
- `DRAFT`·`PENDING_AGREEMENT` 공연은 생성자·참여팀 리더에게만 보인다. 그 외에는 `PERFORMANCE_NOT_FOUND`로 존재를 숨긴다 [권].

## Request
### Headers
- `Accept: application/json`
- (선택) `Authorization: Bearer {accessToken}` — 미공개 상태 공연을 관계자가 미리 볼 때만

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
없음.

### 시스템 처리
1. 공연 조회 → 공개 상태가 아니면 요청자의 관계자 여부 확인.
2. 상태 전이 없음(조회).
3. 외부 호출 없음(온체인 값은 API-verify-01에서).
4. `performance` + `ticket_type` + `performance_participant` + Redis 재고 조합 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "title": "합정 3밴드 합동공연",
    "description": "인디록 3팀 합동 무대",
    "posterImageUrl": "https://cdn.b204.ssafy.io/p/12.png",
    "venueName": "합정 언플러그드",
    "venueAddress": "서울 마포구 양화로 000",
    "startAt": "2026-09-19T19:00:00+09:00",
    "endAt": "2026-09-19T22:00:00+09:00",
    "saleCloseAt": "2026-09-19T17:00:00+09:00",
    "cancelDeadlineAt": "2026-09-16T00:00:00+09:00",
    "status": "ON_SALE",
    "jointPerformance": true,
    "purchaseLimitPerMember": 4,
    "participants": [
      { "teamId": 7, "teamName": "블루노트", "host": true },
      { "teamId": 9, "teamName": "새벽세시", "host": false },
      { "teamId": 11, "teamName": "노이즈캔슬", "host": false }
    ],
    "ticketTypes": [
      { "ticketTypeId": 31, "name": "일반", "price": 25000, "totalQuantity": 80, "remainingQuantity": 41 },
      { "ticketTypeId": 32, "name": "응원", "price": 35000, "totalQuantity": 20, "remainingQuantity": 12 }
    ],
    "verificationUrl": "https://b204.ssafy.io/verify/12"
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "PERFORMANCE_NOT_FOUND", "data": null, "msg": "공연을 찾을 수 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않거나 비공개 상태를 비관계자가 조회 |

---

### API-performance-04 공연 수정(잠금 전)
`PATCH /api/v1/performances/{performanceId}` · 권한: 생성자 · 우선: P0 · 연관 화면: `P-03 공연 생성·수정` · 연관 기능: 공연 정보 수정

## 요구사항
- `DRAFT`·`PENDING_AGREEMENT` 상태에서만 수정할 수 있다. `ON_SALE` 이후에는 `PERFORMANCE_ALREADY_ON_SALE`이다(기획 §6 "판매 시작 후 변경 불가").
- 생성자 팀 리더만 수정한다. 참여팀 리더는 403이다(SEC-03).
- 일시를 바꾸면 `cancelDeadlineAt`(D-3 00:00)을 다시 계산한다 [권] P-8.
- 규칙이 이미 설정돼 `PENDING_AGREEMENT`인데 일시·공동 여부를 바꾸면 **기존 팀별 동의를 전부 초기화**(`RuleAgreement` → `PENDING`)하고 규칙 해시를 재산출한다 [권].

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `title` | string | N | 1~100자 | 제목 |
| `description` | string | N | 최대 2000자 | 소개 |
| `posterImageUrl` | string | N | https URL | 포스터 |
| `venueName` | string | N | 1~100자 | 공연장 |
| `venueAddress` | string | N | 1~200자 | 주소 |
| `startAt` | string(ISO 8601) | N | 현재 이후 | 시작 일시 |
| `endAt` | string(ISO 8601) | N | `startAt` 이후 | 종료 일시 |
| `saleCloseAt` | string(ISO 8601) | N | `startAt` 이전 | 예매 마감 |

```json
{ "venueName": "합정 언플러그드 B홀", "startAt": "2026-09-19T19:30:00+09:00", "endAt": "2026-09-19T22:30:00+09:00" }
```

### 시스템 처리
1. 생성자 권한 확인 → 상태가 `DRAFT`·`PENDING_AGREEMENT`인지 확인 → 일시 정합성 검증.
2. 상태 전이: 일시·공동 여부 변경 시 `RuleAgreement` `AGREED` → `PENDING` 초기화(공연 상태는 `PENDING_AGREEMENT` 유지).
3. 외부 호출 없음(아직 컨트랙트 미등록 구간).
4. `performance` 갱신 + `cancelDeadlineAt` 재계산.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": { "performanceId": 12, "status": "PENDING_AGREEMENT", "startAt": "2026-09-19T19:30:00+09:00", "cancelDeadlineAt": "2026-09-16T00:00:00+09:00", "agreementsReset": true },
  "msg": "공연 정보가 수정되었습니다. 참여팀 동의를 다시 받아야 합니다."
}
```

### 4xx
```json
{ "code": "PERFORMANCE_ALREADY_ON_SALE", "data": null, "msg": "티켓 판매가 시작되어 변경할 수 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 형식 위반 |
| 400 | `PERFORMANCE_DATE_INVALID` | 과거 일시, 일시 역전 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 409 | `PERFORMANCE_ALREADY_ON_SALE` | 상태가 `ON_SALE` 이후 |
| 409 | `PERFORMANCE_INVALID_STATUS` | 상태가 `CANCELLED`·`ENDED` |

---

### API-performance-05 티켓 옵션 설정(잠금 전)
`PUT /api/v1/performances/{performanceId}/ticket-types` · 권한: 생성자 · 우선: P0 · 연관 화면: `P-03 공연 생성·수정` · 연관 기능: 티켓 옵션 설정

## 요구사항
- 티켓 타입 1~N개(이름·가격·수량)를 **전체 교체**한다(PUT). 좌석은 지정하지 않는 스탠딩이다 [권] P-6.
- `ON_SALE` 이후에는 변경할 수 없다(`PERFORMANCE_ALREADY_ON_SALE`). 판매 시작 전에는 자유롭게 바꾼다.
- 이미 판매된 수량보다 적게 `totalQuantity`를 줄일 수 없다(판매 시작 전에는 판매분이 0이라 사실상 자유) [권].
- 1인 1공연 최대 구매 수량은 공연 단위 4매 고정이며 이 API로 바꾸지 않는다 [권] P-6.

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `ticketTypes` | array | Y | 1~10개 | 티켓 타입 전체 목록 |
| `ticketTypes[].ticketTypeId` | integer | N | 기존 항목 유지 시 지정 | 없으면 신규 생성 |
| `ticketTypes[].name` | string | Y | 1~30자, 공연 내 유니크 | 타입 이름 |
| `ticketTypes[].price` | integer | Y | 0 이상, 1,000,000 이하, 원 단위 정수 | 판매가 |
| `ticketTypes[].totalQuantity` | integer | Y | 1 이상, 5000 이하 | 총 수량 |

```json
{
  "ticketTypes": [
    { "ticketTypeId": 31, "name": "일반", "price": 25000, "totalQuantity": 80 },
    { "name": "응원", "price": 35000, "totalQuantity": 20 }
  ]
}
```

### 시스템 처리
1. 생성자 권한·상태(`DRAFT`·`PENDING_AGREEMENT`) 확인 → 이름 중복·금액·수량 검증.
2. 상태 전이 없음(공연 상태 유지). 목록에서 빠진 기존 타입은 삭제한다.
3. 외부 호출 없음.
4. `ticket_type` 전체 교체 + Redis 재고 키 재초기화.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "ticketTypes": [
      { "ticketTypeId": 31, "name": "일반", "price": 25000, "totalQuantity": 80, "remainingQuantity": 80 },
      { "ticketTypeId": 33, "name": "응원", "price": 35000, "totalQuantity": 20, "remainingQuantity": 20 }
    ]
  },
  "msg": "티켓 옵션이 저장되었습니다."
}
```

### 4xx
```json
{ "code": "PERFORMANCE_ALREADY_ON_SALE", "data": null, "msg": "티켓 판매가 시작되어 변경할 수 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 이름 중복, 금액·수량 범위 위반, 배열 크기 위반 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 404 | `TICKET_OPTION_NOT_FOUND` | 지정한 `ticketTypeId`가 이 공연 소속이 아님 |
| 409 | `PERFORMANCE_ALREADY_ON_SALE` | 상태가 `ON_SALE` 이후 |

---

### API-performance-06 내 팀 참여 공연 목록
`GET /api/v1/performances/me` · 권한: PERFORMER · 우선: P0 · 연관 화면: `P-01 공연자 대시보드` · 연관 기능: 내 참여 공연 목록 조회

## 요구사항
- 로그인 회원이 속한 모든 팀이 **주최하거나 참여 중인** 공연을 준다. `DRAFT`부터 `ENDED`·`CANCELLED`까지 전부 포함한다.
- 각 행에 공연 상태와 정산 상태(§1.5 `Settlement`)를 함께 담아 대시보드에서 "지금 할 일"을 뽑을 수 있게 한다.
- 초대받았지만 아직 수락하지 않은 공연도 `participationStatus: "INVITED"`로 함께 준다 [권].

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `status` | query | string | N | `DRAFT`/`PENDING_AGREEMENT`/`ON_SALE`/`SALE_CLOSED`/`ENDED`/`CANCELLED` |
| `page` | query | integer | N | 0-base, 기본 0 |
| `size` | query | integer | N | 기본 20, 최대 100 |
| `sort` | query | string | N | `startAt,desc`(기본) / `startAt,asc` |

### Body
없음.

### 시스템 처리
1. 회원의 소속 팀 목록 산출.
2. 상태 전이 없음(조회).
3. 외부 호출 없음.
4. `performance_participant` 조인 조회 → `items`/`pageInfo`.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "items": [
      {
        "performanceId": 12,
        "title": "합정 3밴드 합동공연",
        "startAt": "2026-09-19T19:00:00+09:00",
        "status": "ON_SALE",
        "settlementStatus": "NONE",
        "teamId": 7,
        "host": true,
        "participationStatus": "ACCEPTED",
        "myTeamAgreementStatus": "AGREED"
      }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 4, "hasNext": false }
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "COMMON_UNAUTHORIZED", "data": null, "msg": "로그인이 필요합니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `status`·`sort`, `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 403 | `COMMON_FORBIDDEN` | 소속 팀이 없는 계정(`PERFORMER` 아님) |

---
### API-performance-07 참여팀 초대
`POST /api/v1/performances/{performanceId}/participants` · 권한: 생성자 · 우선: P0 · 연관 화면: `P-04 참여팀 관리` · 연관 기능: 참여팀 초대

## 요구사항
- 생성자 팀 리더가 다른 팀을 공동 공연 참여팀으로 초대한다. 초대는 `INVITED` 상태로 저장되고 상대 팀 리더의 수락(API-performance-08)으로 확정된다.
- `ON_SALE` 이후에는 초대할 수 없다(`PERFORMANCE_ALREADY_ON_SALE`). 규칙이 이미 설정된 `PENDING_AGREEMENT`에서 초대하면 **기존 동의를 초기화**한다(참여팀 구성이 규칙 해시의 입력이므로) [권].
- 이미 참여 중이거나 초대 중인 팀은 `TEAM_ALREADY_JOINED`다.
- 참여팀 수 상한은 **8팀**으로 둔다 [권] — 균등 분배·화면 표시의 현실적 한계.

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `teamId` | integer | Y | 존재하는 팀 | 초대할 팀 |

```json
{ "teamId": 9 }
```

### 시스템 처리
1. 생성자 권한·공연 상태(`DRAFT`·`PENDING_AGREEMENT`) 확인 → 대상 팀 존재·중복·상한(8팀) 확인.
2. 상태 전이: `performance_participant` 생성(`INVITED`). 규칙 설정 후라면 `RuleAgreement` 전체 `PENDING`으로 초기화.
3. 외부 호출 없음(컨트랙트 참여팀 등록은 판매 시작 시 일괄).
4. `performance_participant` 저장 + 대상 팀 리더에게 알림 [권].

## Response
### 201 Created
```json
{
  "code": "SUCCESS",
  "data": { "performanceId": 12, "teamId": 9, "teamName": "새벽세시", "participationStatus": "INVITED", "invitedAt": "2026-08-28T16:10:00+09:00" },
  "msg": "참여 초대를 보냈습니다."
}
```

### 4xx
```json
{ "code": "TEAM_ALREADY_JOINED", "data": null, "msg": "이미 이 공연에 참여한 팀입니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `teamId` 누락, 참여팀 상한 8팀 초과 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 404 | `TEAM_NOT_FOUND` | 존재하지 않는 `teamId` |
| 409 | `TEAM_ALREADY_JOINED` | 이미 참여·초대 중인 팀 |
| 409 | `PERFORMANCE_ALREADY_ON_SALE` | 상태가 `ON_SALE` 이후 |

---

### API-performance-08 참여 수락
`POST /api/v1/performances/{performanceId}/participants/{teamId}/accept` · 권한: 초대팀 리더 · 우선: P0 · 연관 화면: `P-04 참여팀 관리` · 연관 기능: 참여 수락

## 요구사항
- 초대받은 팀의 리더만 수락한다. 수락 즉시 `participationStatus`가 `ACCEPTED`가 되고, 이 팀의 리더는 해당 공연의 **STAFF로 자동 지정**된다 [권] P-15.
- 수락 시점에 정산 계좌가 없어도 막지 않는다. 다만 응답에 `settlementAccountRegistered: false`를 담아 화면에서 등록을 유도한다 [권] P-10.
- `ON_SALE` 이후에는 수락할 수 없다.

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |
| `teamId` | path | integer(BIGINT) | Y | 수락하는 팀 PK. 요청자가 이 팀의 리더여야 함 |

### Body
없음.

### 시스템 처리
1. 초대 존재·상태(`INVITED`) 확인 → 요청자가 해당 팀 리더인지 확인.
2. 상태 전이: `performance_participant` `INVITED` → `ACCEPTED`. 팀 리더를 `performance_staff`에 자동 등록.
3. 외부 호출 없음.
4. `performance_participant`·`performance_staff` 저장 + 생성자에게 알림 [권].

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "teamId": 9,
    "participationStatus": "ACCEPTED",
    "walletAddress": "0x3c8a1f2b4d6e8091a2b3c4d5e6f708192a3b4c5d",
    "settlementAccountRegistered": false,
    "acceptedAt": "2026-08-28T16:22:00+09:00"
  },
  "msg": "참여가 확정되었습니다. 정산 계좌를 등록해 주세요."
}
```

### 4xx
```json
{ "code": "COMMON_FORBIDDEN", "data": null, "msg": "이 작업을 수행할 권한이 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 403 | `COMMON_FORBIDDEN` | 해당 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 404 | `TEAM_NOT_FOUND` | 초대 기록이 없는 `teamId` |
| 409 | `TEAM_ALREADY_JOINED` | 이미 수락 완료 |
| 409 | `PERFORMANCE_ALREADY_ON_SALE` | 상태가 `ON_SALE` 이후 |

---

### API-performance-09 참여팀 제외(잠금 전)
`DELETE /api/v1/performances/{performanceId}/participants/{teamId}` · 권한: 생성자 · 우선: P0 · 연관 화면: `P-04 참여팀 관리` · 연관 기능: 참여팀 제외

## 요구사항
- 생성자가 초대 취소 또는 수락한 팀 제외를 한다. **`ON_SALE` 이후에는 불가**하다 — 참여팀 구성이 잠긴 규칙의 입력이기 때문이다(`PERFORMANCE_ALREADY_ON_SALE`).
- 생성자(주최) 팀 자신은 제외할 수 없다 [권]. 공연을 없애려면 API-performance-12를 쓴다.
- 제외 후 공동 공연인데 참여팀이 2팀 미만이 되면 판매 시작에서 `TEAM_MIN_COUNT_NOT_MET`으로 막힌다. 제외 자체는 허용한다 [권].
- 규칙 설정 이후라면 기존 팀별 동의를 전부 초기화한다.

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |
| `teamId` | path | integer(BIGINT) | Y | 제외할 팀 PK |

### Body
없음.

### 시스템 처리
1. 생성자 권한·상태(`DRAFT`·`PENDING_AGREEMENT`) 확인 → 주최 팀 여부 확인.
2. 상태 전이: `performance_participant` 삭제, 해당 팀 리더의 `performance_staff` 자동 지정 해제, `RuleAgreement` 전체 `PENDING` 초기화.
3. 외부 호출 없음.
4. 삭제 반영 + 감사 로그.

## Response
### 200 OK
```json
{ "code": "SUCCESS", "data": { "performanceId": 12, "teamId": 11, "remainingParticipantCount": 2, "agreementsReset": true }, "msg": "참여팀에서 제외했습니다." }
```

### 4xx
```json
{ "code": "PERFORMANCE_ALREADY_ON_SALE", "data": null, "msg": "티켓 판매가 시작되어 변경할 수 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 주최 팀 제외 시도 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 404 | `TEAM_NOT_FOUND` | 참여 기록이 없는 `teamId` |
| 409 | `PERFORMANCE_ALREADY_ON_SALE` | 상태가 `ON_SALE` 이후 |

---

### API-performance-10 검표 관계자 지정
`PUT /api/v1/performances/{performanceId}/staff` · 권한: 생성자 · 우선: P0 · 연관 화면: `P-04 참여팀 관리` · 연관 기능: 검표 관계자 지정

## 요구사항
- 생성자가 공연별 STAFF 목록을 **전체 교체**한다(PUT) [권] P-15. 참여팀 리더는 자동 STAFF이며 이 목록에서 제거되지 않는다.
- STAFF는 해당 공연의 QR 검표(API-entry-01)와 입장 현황(API-entry-02)만 접근한다. 다른 공연·다른 API 권한은 생기지 않는다(SEC-03).
- `ON_SALE` 이후에도 변경할 수 있다 — 당일 인력 변경이 흔하다 [권]. 단 `CANCELLED` 공연에서는 불가하다.

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `memberIds` | array(integer) | Y | 0~20개, 중복 불가 | STAFF로 지정할 회원 PK 목록 |

```json
{ "memberIds": [1188, 1301, 1402] }
```

### 시스템 처리
1. 생성자 권한·공연 상태(`CANCELLED` 아님) 확인 → 회원 존재 확인.
2. 상태 전이 없음(권한 부여).
3. 외부 호출 없음.
4. `performance_staff` 전체 교체(자동 지정된 참여팀 리더는 유지) + 감사 로그.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "staff": [
      { "memberId": 1024, "name": "김리더", "auto": true },
      { "memberId": 1188, "name": "이베이스", "auto": false },
      { "memberId": 1301, "name": "박스태프", "auto": false }
    ]
  },
  "msg": "검표 관계자가 저장되었습니다."
}
```

### 4xx
```json
{ "code": "COMMON_NOT_FOUND", "data": null, "msg": "요청한 정보를 찾을 수 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 배열 크기·중복 위반 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 `memberId` 포함 |
| 409 | `PERFORMANCE_INVALID_STATUS` | 공연이 `CANCELLED` |

---

### API-performance-11 판매·선택 현황
`GET /api/v1/performances/{performanceId}/sales` · 권한: PERFORMER(참여팀) · 우선: P0 · 연관 화면: `P-07 판매·선택 현황` · 연관 기능: 판매·관객 선택 현황 조회

## 요구사항
- 매출·판매 수량·잔여와 **관람 목적 팀 선택 집계**를 준다. 서버 DB 집계와 **온체인 카운터**를 나란히 담아 화면에서 대조할 수 있게 한다(기획 §8.3 신뢰 보강 ①, REL-06).
- 불일치가 있으면 `counterMatched: false`와 팀별 차이를 표시한다. 이 상태에서는 집계 확정(API-settlement-02)이 `SETTLEMENT_AGGREGATE_MISMATCH`로 막힌다.
- 참여팀 소속만 조회한다. 온체인 조회 결과는 **30초 캐시**한다 [권].

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
없음.

### 시스템 처리
1. 공연 존재·참여팀 소속 확인.
2. 상태 전이 없음(조회).
3. 외부 호출: 컨트랙트 팀별 선택 카운터 조회(30초 캐시). 노드 오류 시 DB 집계만 주고 `onchainAvailable: false`.
4. `order_item`·`ticket` 집계 + 온체인 카운터 비교 결과 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "status": "ON_SALE",
    "grossRevenue": 1600000,
    "paidTicketCount": 64,
    "cancelledTicketCount": 3,
    "ticketTypes": [
      { "ticketTypeId": 31, "name": "일반", "price": 25000, "soldQuantity": 52, "remainingQuantity": 28 },
      { "ticketTypeId": 32, "name": "응원", "price": 35000, "soldQuantity": 12, "remainingQuantity": 8 }
    ],
    "teamChoices": [
      { "teamId": 7, "teamName": "블루노트", "dbCount": 30, "onchainCount": 30, "matched": true },
      { "teamId": 9, "teamName": "새벽세시", "dbCount": 21, "onchainCount": 21, "matched": true },
      { "teamId": 11, "teamName": "노이즈캔슬", "dbCount": 13, "onchainCount": 13, "matched": true }
    ],
    "counterMatched": true,
    "onchainAvailable": true,
    "refreshedAt": "2026-09-18T11:00:00+09:00"
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "SETTLEMENT_NOT_PARTICIPANT", "data": null, "msg": "참여팀만 정산 내역을 조회할 수 있습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 403 | `SETTLEMENT_NOT_PARTICIPANT` | 참여팀 소속이 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 409 | `PERFORMANCE_INVALID_STATUS` | 아직 `DRAFT`·`PENDING_AGREEMENT`라 판매 데이터가 없음 |

---

### API-performance-12 공연 취소(일괄 환불)
`POST /api/v1/performances/{performanceId}/cancel` · 권한: 생성자 · 우선: P0 · 연관 화면: `P-10 공연 취소` · 연관 기능: 공연 취소·일괄 환불

## 요구사항
- 판매 중 취소 시 **전 티켓을 수수료 없이 일괄 환불**하고 컨트랙트에 정산 중단 플래그를 세운다 [권] P-12. 정산 잠금 이후에도 **release 전까지**는 가능하다.
- 대량 작업이라 `202 Accepted`로 접수하고 `jobId` 폴링으로 진행을 확인한다. 티켓별 환불은 부분 성공을 허용하며 실패 건은 재시도 대기로 남긴다(REL-05).
- 상태 전이: 공연 `CANCELLED`, 정산 `HALTED`, 티켓 전량 `CANCELLED`, 주문 `REFUNDED`.
- `Idempotency-Key`가 필수다. 같은 키 재호출은 최초 `jobId`를 그대로 돌려준다.
- release가 이미 실행된 공연은 온체인 회수가 불가하므로 취소할 수 없다(`SETTLEMENT_ALREADY_RELEASED`).

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`
- `Idempotency-Key: {UUIDv4}` **필수**

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `reason` | string | Y | 1~200자 | 취소 사유 — 관객 안내 문구로 그대로 노출 |

```json
{ "reason": "공연장 사정으로 부득이하게 취소되었습니다." }
```

### 시스템 처리
1. 생성자 권한 확인 → 상태가 `ON_SALE`·`SALE_CLOSED`·`ENDED`이고 정산이 `RELEASED` 전인지 확인 → 멱등키 확인.
2. 상태 전이: `performance` → `CANCELLED`, `settlement` → `HALTED`, 대상 `ticket` → `CANCELLED`, `ticket_order` → `REFUNDED`.
3. 외부 호출(202): ① 컨트랙트 정산 중단 플래그 tx ② 티켓별 금융망 전액 환불 이체 ③ 이체 성공 확인 후 KRWS `burn`. **이체 성공 → 소각 순서를 반드시 지킨다**(지갑 문서). 각 단계 실패는 큐에서 3회 재시도, 최종 실패는 관리자 재처리(`M-02 정산·작업 관리`).
4. `refund`·`coin_job`·`chain_job` 생성, 관객 알림 발송 [권].

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": {
    "jobId": "chain_01J8ZC4P7Q",
    "status": "PENDING",
    "pollAfterMs": 2000,
    "performanceId": 12,
    "targetTicketCount": 64,
    "totalRefundAmount": 1600000
  },
  "msg": "공연 취소를 접수했습니다. 환불이 순차적으로 처리됩니다."
}
```

### 4xx
```json
{ "code": "SETTLEMENT_ALREADY_RELEASED", "data": null, "msg": "이미 정산이 완료된 공연입니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `reason` 누락, `Idempotency-Key` 헤더 없음 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 409 | `COMMON_CONFLICT` | 같은 멱등키에 다른 본문, 이미 취소 처리 진행 중 |
| 409 | `PERFORMANCE_INVALID_STATUS` | `DRAFT`·`PENDING_AGREEMENT`(판매 전이라 삭제·수정으로 처리) 또는 이미 `CANCELLED` |
| 409 | `SETTLEMENT_ALREADY_RELEASED` | release 완료 후 취소 시도 |

---

## 5. rule — 정산 규칙

정산 공식 [권] P-5: `공통 비용 차감 → 균등 / 관객 선택 / 기획 기여 3항목 비율(bp, 합 10000)`. 기본값 균등 4000 · 관객선택 5000 · 기획기여 1000, 각 항목 0 허용. **팀별 동의 tx**(각 팀 지갑이 `agreeToRules(showId, rulesHash)` 서명)가 전부 모여야 `startSale()`로 잠글 수 있다(기획 §8.3 신뢰 보강 ②, 핵심 시연 장면). 잠금 이후 setter는 컨트랙트에서 전부 revert된다.

### API-rule-01 정산 규칙 설정
`PUT /api/v1/performances/{performanceId}/rules` · 권한: 생성자 · 우선: P0 · 연관 화면: `P-05 정산 규칙 설정` · 연관 기능: 정산 규칙 설정

## 요구사항
- 공통 비용(원)과 3항목 비율(bp)을 설정한다. **비율 합이 정확히 10000**이 아니면 `RULE_RATIO_SUM_INVALID`다 [권] P-5.
- 기획 기여 비율이 0보다 크면 수령 팀(`plannerTeamId`)을 반드시 지정한다 [권].
- 저장할 때마다 **규칙 원문 정규화 JSON의 keccak256 해시**(`rulesHash`)를 재산출하고, 기존 팀별 동의를 전부 `PENDING`으로 초기화한다. 동의는 해시에 대한 서명이기 때문이다.
- 상태 전이: `DRAFT` → `PENDING_AGREEMENT`. 이미 `ON_SALE`이면 `RULE_ALREADY_LOCKED`다.
- 시뮬레이션(예상 분배액 미리보기)은 응답의 `simulation`으로 함께 준다 — 화면에서 별도 호출을 만들지 않기 위해서다 [권].

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `commonCost` | integer | Y | 0 이상, 원 단위 정수 | 장비비 등 우선 차감액 |
| `commonCostNote` | string | N | 최대 200자 | 공통 비용 설명(검증 페이지에 노출) |
| `equalRatioBp` | integer | Y | 0~10000 | 균등 분배 비율(basis point) |
| `choiceRatioBp` | integer | Y | 0~10000 | 관객 선택 분배 비율 |
| `plannerRatioBp` | integer | Y | 0~10000 | 기획 기여 분배 비율 |
| `plannerTeamId` | integer | 조건부 | `plannerRatioBp > 0`이면 필수, 참여팀이어야 함 | 기획 기여 수령 팀 |
| `simulationRevenue` | integer | N | 0 이상 | 시뮬레이션용 가정 매출. 미지정 시 현재 매출 사용 |

```json
{
  "commonCost": 300000,
  "commonCostNote": "PA 대여·엔지니어 비용",
  "equalRatioBp": 4000,
  "choiceRatioBp": 5000,
  "plannerRatioBp": 1000,
  "plannerTeamId": 7,
  "simulationRevenue": 1600000
}
```

### 시스템 처리
1. 생성자 권한·상태(`DRAFT`·`PENDING_AGREEMENT`) 확인 → 비율 합 10000 검증 → `plannerTeamId` 참여팀 여부 검증.
2. 상태 전이: `settlement_rule` upsert, 공연 `DRAFT` → `PENDING_AGREEMENT`, `rule_agreement` 전체 `PENDING` 초기화.
3. 외부 호출 없음 — 컨트랙트에는 판매 시작(API-rule-04) 때 잠긴 규칙으로 기록된다.
4. `rulesHash` 재산출·저장 + 시뮬레이션 계산 결과 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "status": "PENDING_AGREEMENT",
    "commonCost": 300000,
    "equalRatioBp": 4000,
    "choiceRatioBp": 5000,
    "plannerRatioBp": 1000,
    "plannerTeamId": 7,
    "rulesHash": "0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f",
    "agreementsReset": true,
    "simulation": {
      "assumedRevenue": 1600000,
      "distributable": 1300000,
      "shares": [
        { "teamId": 7, "teamName": "블루노트", "amount": 605000 },
        { "teamId": 9, "teamName": "새벽세시", "amount": 386000 },
        { "teamId": 11, "teamName": "노이즈캔슬", "amount": 309000 }
      ]
    }
  },
  "msg": "정산 규칙이 저장되었습니다. 참여팀 동의를 받아 주세요."
}
```

### 4xx
```json
{ "code": "RULE_RATIO_SUM_INVALID", "data": null, "msg": "분배 비율의 합이 100%가 되어야 합니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 음수 금액, bp 범위 위반, `plannerTeamId` 누락 |
| 400 | `RULE_RATIO_SUM_INVALID` | 3항목 bp 합이 10000이 아님 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 404 | `TEAM_NOT_FOUND` | `plannerTeamId`가 참여팀이 아님 |
| 409 | `RULE_ALREADY_LOCKED` | 판매 시작(`startSale`) 이후 수정 시도 |
| 409 | `RULE_COMMON_COST_EXCEEDS_REVENUE` | 시뮬레이션 매출보다 공통 비용이 큼 |

---

### API-rule-02 규칙·동의 현황 조회
`GET /api/v1/performances/{performanceId}/rules` · 권한: PERFORMER(참여팀) · 우선: P0 · 연관 화면: `P-05 정산 규칙 설정`·`P-06 규칙 동의·판매 시작` · 연관 기능: 정산 규칙·동의 현황 조회

## 요구사항
- 현재 규칙 원문·`rulesHash`·잠금 여부와 **팀별 동의 상태**(`PENDING`/`AGREED`, 동의 tx 해시)를 준다. P-06 화면이 이 응답 하나로 그려져야 한다.
- 판매 시작 가능 여부(`startSaleAvailable`)와 막힌 이유를 함께 담아 버튼 활성 조건을 서버가 정한다 [권].
- 참여팀 소속만 조회한다. 공개 검증용 데이터는 API-verify-01이 담당한다.

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
없음.

### 시스템 처리
1. 공연 존재·참여팀 소속 확인.
2. 상태 전이 없음(조회).
3. 외부 호출 없음(동의 tx는 인덱싱된 `chain_job` 기준).
4. `settlement_rule` + `rule_agreement` + 참여팀 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "performanceStatus": "PENDING_AGREEMENT",
    "locked": false,
    "rulesHash": "0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f",
    "rule": { "commonCost": 300000, "commonCostNote": "PA 대여·엔지니어 비용", "equalRatioBp": 4000, "choiceRatioBp": 5000, "plannerRatioBp": 1000, "plannerTeamId": 7 },
    "agreements": [
      { "teamId": 7, "teamName": "블루노트", "walletAddress": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b", "status": "AGREED", "txHash": "0x1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f901", "agreedAt": "2026-08-29T10:02:00+09:00" },
      { "teamId": 9, "teamName": "새벽세시", "walletAddress": "0x3c8a1f2b4d6e8091a2b3c4d5e6f708192a3b4c5d", "status": "PENDING", "txHash": null, "agreedAt": null }
    ],
    "startSaleAvailable": false,
    "startSaleBlockedReason": "RULE_NOT_AGREED_BY_ALL"
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "COMMON_NOT_FOUND", "data": null, "msg": "요청한 정보를 찾을 수 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 403 | `SETTLEMENT_NOT_PARTICIPANT` | 참여팀 소속이 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 404 | `COMMON_NOT_FOUND` | 규칙이 아직 설정되지 않음(`DRAFT`) |

---

### API-rule-03 내 팀 동의(agreeToRules tx)
`POST /api/v1/performances/{performanceId}/rules/agreements` · 권한: 리더 · 우선: P0 · 연관 화면: `P-06 규칙 동의·판매 시작` · 연관 기능: 정산 규칙 팀별 동의

## 요구사항
- 참여팀 리더가 자기 팀 지갑으로 `agreeToRules(performanceId, rulesHash)`에 서명한다. **팀 키를 복호화하는 유일한 지점**이며 복호화마다 감사 로그를 남긴다(SEC-04, 지갑 문서).
- 요청의 `rulesHash`가 서버 현재 해시와 다르면 `RULE_HASH_MISMATCH`다 — 규칙이 중간에 바뀐 상황이라 화면에서 다시 확인시켜야 한다.
- 온체인 tx이므로 **`202 Accepted` + `jobId`**로 접수하고 `GET /api/v1/chain/jobs/{jobId}`로 폴링한다. tx 확정 시 `rule_agreement` 상태가 `PENDING` → `AGREED`가 된다.
- 실패 시 큐에서 **3회 재시도**하고, 최종 실패는 `status=FAILED`로 남겨 관리자 재처리(`M-02`) 대상으로 넘긴다(REL-09). 팀 지갑 가스 부족은 `WALLET_GAS_INSUFFICIENT`이며 운영지갑 자동 충전 후 재시도한다 [권] P-3.

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `teamId` | integer | Y | 요청자가 리더인 참여팀 | 동의하는 팀 |
| `rulesHash` | string | Y | `0x` + 64 hex(66자) | API-rule-02에서 받은 현재 규칙 해시 |

```json
{ "teamId": 9, "rulesHash": "0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f" }
```

### 시스템 처리
1. 리더 권한·참여팀 여부 확인 → 공연 상태 `PENDING_AGREEMENT` 확인 → `rulesHash` 대조 → 중복 동의 확인.
2. 상태 전이: `rule_agreement` `PENDING` 유지, `chain_job` 생성(`PENDING`). tx 확정 시 `AGREED`.
3. 외부 호출(202): 팀 키 복호화 → `agreeToRules` 서명·전송 → `SUBMITTED` → 영수증 확인 시 `CONFIRMED`. 실패 3회 재시도, 최종 실패는 관리자 재처리.
4. `chain_job` 저장 + 키 복호화 감사 로그(누가·언제·어떤 tx, SEC-04·SEC-11).

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": { "jobId": "chain_01J9A2B3C4", "status": "PENDING", "pollAfterMs": 1500, "performanceId": 12, "teamId": 9 },
  "msg": "동의 트랜잭션을 전송했습니다. 잠시 후 상태가 갱신됩니다."
}
```

### 4xx/5xx
```json
{ "code": "RULE_HASH_MISMATCH", "data": null, "msg": "정산 규칙이 변경되었습니다. 내용을 다시 확인한 뒤 동의해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `rulesHash` 형식 위반(66자 아님) |
| 403 | `COMMON_FORBIDDEN` | 해당 팀 리더가 아님 |
| 403 | `SETTLEMENT_NOT_PARTICIPANT` | 참여팀이 아닌 팀으로 동의 시도 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 404 | `WALLET_NOT_FOUND` | 팀 지갑 레코드 없음 |
| 409 | `RULE_HASH_MISMATCH` | 요청 해시 ≠ 서버 현재 해시 |
| 409 | `RULE_ALREADY_LOCKED` | 이미 `startSale` 완료 |
| 409 | `COMMON_CONFLICT` | 이미 `AGREED`이거나 동일 팀 동의 tx가 진행 중 |
| 409 | `WALLET_GAS_INSUFFICIENT` | 팀 지갑 가스 부족(자동 충전 후 재시도 안내) |
| 500 | `WALLET_KEY_DECRYPT_FAILED` | KEK 미주입·DEK 손상 — 원인 미노출 |

---

### API-rule-04 판매 시작(startSale 잠금)
`POST /api/v1/performances/{performanceId}/sale/start` · 권한: 생성자 · 우선: P0 · 연관 화면: `P-06 규칙 동의·판매 시작` · 연관 기능: 판매 시작·정산 규칙 잠금

## 요구사항
- **전 참여팀이 `AGREED`**여야 실행된다. 하나라도 미동의면 `RULE_NOT_AGREED_BY_ALL`이다(기획 §8.3).
- 공동 공연인데 참여팀이 2팀 미만이면 `TEAM_MIN_COUNT_NOT_MET`이다.
- operator 지갑이 컨트랙트에 공연·참여팀·규칙을 등록하고 `startSale()`로 **one-way `locked=true`**를 건다. 이후 규칙·참여팀 setter는 전부 revert된다.
- 온체인 tx이므로 `202 Accepted` + `jobId`다. tx 확정 시 공연 상태가 `PENDING_AGREEMENT` → `ON_SALE`이 되고 그때부터 예매를 받는다. 확정 전 예매 시도는 `TICKET_SALE_NOT_STARTED`다.
- 티켓 옵션이 한 개도 없으면 시작할 수 없다 [권].

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `rulesHash` | string | Y | `0x` + 64 hex(66자) | 잠글 규칙 해시. 서버 현재 해시와 일치해야 함 |

```json
{ "rulesHash": "0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f" }
```

### 시스템 처리
1. 생성자 권한 확인 → 상태 `PENDING_AGREEMENT` 확인 → 전원 동의·참여팀 수·티켓 옵션 존재·`rulesHash` 대조.
2. 상태 전이: `chain_job` 생성(`PENDING`). tx 확정 시 공연 `PENDING_AGREEMENT` → `ON_SALE`, `settlement` `NONE` 유지.
3. 외부 호출(202): operator 지갑으로 컨트랙트 등록 + `startSale()` 전송(nonce 직렬 큐). 실패 3회 재시도, 최종 실패는 `FAILED`로 남기고 관리자 재처리(`M-02`).
4. `chain_job` 저장, tx 확정 시 Redis 재고 오픈 + 공개 목록 노출 시작.

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": { "jobId": "chain_01J9B7D8E9", "status": "PENDING", "pollAfterMs": 2000, "performanceId": 12, "nextStatus": "ON_SALE" },
  "msg": "판매 시작 트랜잭션을 전송했습니다. 확정되면 예매가 열립니다."
}
```

### 4xx/5xx
```json
{ "code": "RULE_NOT_AGREED_BY_ALL", "data": null, "msg": "모든 참여팀이 정산 규칙에 동의해야 판매를 시작할 수 있습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `rulesHash` 형식 위반, 티켓 옵션 없음 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 409 | `RULE_NOT_AGREED_BY_ALL` | 미동의 팀 존재 |
| 409 | `RULE_HASH_MISMATCH` | 요청 해시 ≠ 서버 현재 해시 |
| 409 | `RULE_ALREADY_LOCKED` | 이미 잠금 완료 |
| 409 | `TEAM_MIN_COUNT_NOT_MET` | 공동 공연인데 참여팀 2팀 미만 |
| 409 | `PERFORMANCE_INVALID_STATUS` | 상태가 `DRAFT`·`CANCELLED` |
| 500 | `CHAIN_GAS_INSUFFICIENT` | 운영지갑 가스 부족(관리자 알림 대상) |
| 504 | `CHAIN_TX_TIMEOUT` | tx 제출은 됐으나 확정 지연 — `jobId`로 계속 폴링 |

---

## 6. ticket — 예매·티켓

주문 상태(§1.5 `TicketOrder`): `PENDING_PAYMENT` → `PAID` → `CANCELLED` / `REFUNDED`. 미결제 15분 경과 시 `CANCELLED`. 티켓 상태(`Ticket`): `ISSUED` → `TRANSFER_PENDING` → `ISSUED`(새 소유자) / `USED` / `CANCELLED`. 관람 목적 팀은 **한 팀 필수 선택**이며 이 값이 온체인 선택 집계의 입력이다 [권] P-4. 1인 1공연 최대 4매다 [권] P-6.

### API-ticket-01 주문 생성(옵션·수량·선택 팀)
`POST /api/v1/orders` · 권한: AUDIENCE · 우선: P0 · 연관 화면: `A-03 예매 — 옵션·수량`·`A-04 예매 — 관람 목적 팀 선택` · 연관 기능: 티켓 주문 생성

## 요구사항
- 티켓 타입·수량과 **관람 목적 팀 1개**를 받아 `PENDING_PAYMENT` 주문을 만들고 Redis 재고를 선점한다. 결제(API-payment-01) 전까지 **15분** 유효하며 경과 시 `CANCELLED`로 자동 전이하고 재고를 원복한다.
- 공동 공연에서 팀 미선택은 `TICKET_TEAM_CHOICE_REQUIRED`, 참여팀이 아닌 팀 선택은 `TICKET_TEAM_CHOICE_INVALID`다 [권] P-4.
- 1인 1공연 누적 **4매**를 넘으면 `TICKET_PURCHASE_LIMIT_EXCEEDED`다(취소분은 누적에서 제외) [권] P-6.
- 재고 차감은 원자적으로 처리해 **초과 판매 0**을 보장한다(REL-01, PERF-02: 동시 100건에서 초과 판매 0, 밀린 요청은 `409 TICKET_SOLD_OUT`).
- `Idempotency-Key`가 필수다 — 새로고침·재전송으로 주문이 이중 생성되지 않게 한다.
- 온체인 `recordChoice`는 여기서 호출하지 않는다. **결제 확인 시점**(API-payment-01)에 비동기로 기록한다 [권].

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`
- `Idempotency-Key: {UUIDv4}` **필수**

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `performanceId` | integer | Y | `ON_SALE` 상태 | 공연 PK |
| `items` | array | Y | 1~5개 | 티켓 타입별 수량 |
| `items[].ticketTypeId` | integer | Y | 해당 공연 소속 | 티켓 타입 PK |
| `items[].quantity` | integer | Y | 1~4 | 수량 |
| `chosenTeamId` | integer | Y | 해당 공연 참여팀 | 관람 목적 팀(한 팀) |
| `totalAmount` | integer | Y | 원 단위 정수 | 클라이언트 계산 금액 — 서버 계산과 다르면 결제 단계에서 `PAYMENT_AMOUNT_MISMATCH` |

```json
{
  "performanceId": 12,
  "items": [ { "ticketTypeId": 31, "quantity": 2 } ],
  "chosenTeamId": 9,
  "totalAmount": 50000
}
```

### 시스템 처리
1. 멱등키 확인 → 공연 상태(`ON_SALE`)·예매 마감 확인 → 티켓 타입 소속·수량 범위·1인 4매 한도 확인 → `chosenTeamId` 참여팀 확인.
2. 상태 전이: Redis 원자적 재고 차감(실패 시 전량 원복) → `ticket_order` 생성(`PENDING_PAYMENT`, `expiresAt = now + 15분`).
3. 외부 호출 없음 — 결제·mint·`recordChoice`는 다음 단계다.
4. `ticket_order`·`order_item` 저장, 15분 만료 스케줄 등록.

## Response
### 201 Created
```json
{
  "code": "SUCCESS",
  "data": {
    "orderId": 5501,
    "performanceId": 12,
    "performanceTitle": "합정 3밴드 합동공연",
    "status": "PENDING_PAYMENT",
    "items": [ { "ticketTypeId": 31, "name": "일반", "price": 25000, "quantity": 2, "amount": 50000 } ],
    "chosenTeamId": 9,
    "chosenTeamName": "새벽세시",
    "totalAmount": 50000,
    "expiresAt": "2026-09-10T20:15:00+09:00"
  },
  "msg": "15분 안에 결제를 완료해 주세요."
}
```

### 4xx
```json
{ "code": "TICKET_SOLD_OUT", "data": null, "msg": "선택한 티켓이 모두 판매되었습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 수량 범위 위반, `Idempotency-Key` 없음 |
| 400 | `TICKET_TEAM_CHOICE_REQUIRED` | 공동 공연인데 `chosenTeamId` 누락 |
| 400 | `TICKET_TEAM_CHOICE_INVALID` | 참여팀이 아닌 팀 선택 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 공연 |
| 404 | `TICKET_OPTION_NOT_FOUND` | 이 공연의 티켓 타입이 아님 |
| 409 | `TICKET_SALE_NOT_STARTED` | 공연이 아직 `ON_SALE`이 아님 |
| 409 | `TICKET_SALE_CLOSED` | 예매 마감(`saleCloseAt` 경과) 또는 `SALE_CLOSED` 이후 |
| 409 | `TICKET_SOLD_OUT` | 재고 차감 실패(동시 예매 경합) |
| 409 | `TICKET_PURCHASE_LIMIT_EXCEEDED` | 1인 1공연 4매 초과 |
| 409 | `COMMON_CONFLICT` | 같은 멱등키에 다른 본문 |
| 429 | `COMMON_TOO_MANY_REQUESTS` | 매크로 차단 룰 |

---

### API-ticket-02 내 주문 목록
`GET /api/v1/orders/me` · 권한: AUDIENCE · 우선: P0 · 연관 화면: `A-12 주문 내역` · 연관 기능: 내 주문 목록 조회

## 요구사항
- 로그인 관객의 주문을 최신순으로 준다. 주문 상태(§1.5)와 결제·환불 상태를 함께 담는다.
- `PENDING_PAYMENT` 주문에는 남은 시간(`expiresAt`)을 담아 결제 화면으로 되돌아갈 수 있게 한다.

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `status` | query | string | N | `PENDING_PAYMENT`/`PAID`/`CANCELLED`/`REFUNDED` |
| `page` | query | integer | N | 0-base, 기본 0 |
| `size` | query | integer | N | 기본 20, 최대 100 |
| `sort` | query | string | N | `createdAt,desc`(기본) / `createdAt,asc` |

### Body
없음.

### 시스템 처리
1. 회원 식별 → 쿼리 검증.
2. 상태 전이 없음(조회). 만료된 `PENDING_PAYMENT`는 조회 시점에 `CANCELLED`로 정리해 노출한다.
3. 외부 호출 없음.
4. `ticket_order` + `payment` 조인 후 `items`/`pageInfo`.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "items": [
      {
        "orderId": 5501,
        "performanceId": 12,
        "performanceTitle": "합정 3밴드 합동공연",
        "startAt": "2026-09-19T19:00:00+09:00",
        "status": "PAID",
        "paymentStatus": "CONFIRMED",
        "totalAmount": 50000,
        "ticketCount": 2,
        "orderedAt": "2026-09-10T20:00:00+09:00",
        "expiresAt": null
      }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 6, "hasNext": false }
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "COMMON_VALIDATION_FAILED", "data": null, "msg": "조회 조건을 다시 확인해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `status`·`sort`, `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |

---

### API-ticket-03 주문 상세
`GET /api/v1/orders/{orderId}` · 권한: AUDIENCE(주문자) · 우선: P0 · 연관 화면: `A-06 예매 완료`·`A-12 주문 내역` · 연관 기능: 주문 상세 조회

## 요구사항
- 주문 항목·금액·선택 팀·결제 정보와 **발급된 티켓 목록**을 준다. A-06 예매 완료 화면이 이 응답으로 그려진다.
- 본인 주문만 조회한다. 타인 주문은 존재를 숨겨 `COMMON_NOT_FOUND`로 응답한다 [권].
- KRWS 민팅이 진행 중이면 `depositStatus`로 알려주되 티켓은 이미 유효하다 — 관객 화면에 코인·체인 용어를 쓰지 않고 "결제 확인 중" 수준으로 표기한다(기획 §8.2) [권].

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `orderId` | path | integer(BIGINT) | Y | 주문 PK |

### Body
없음.

### 시스템 처리
1. 주문 존재·소유자 확인.
2. 상태 전이 없음(조회). 만료된 `PENDING_PAYMENT`면 `CANCELLED`로 정리 후 반환.
3. 외부 호출 없음.
4. `ticket_order` + `order_item` + `ticket` + `payment` 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "orderId": 5501,
    "status": "PAID",
    "performanceId": 12,
    "performanceTitle": "합정 3밴드 합동공연",
    "venueName": "합정 언플러그드",
    "startAt": "2026-09-19T19:00:00+09:00",
    "chosenTeamId": 9,
    "chosenTeamName": "새벽세시",
    "items": [ { "ticketTypeId": 31, "name": "일반", "price": 25000, "quantity": 2, "amount": 50000 } ],
    "totalAmount": 50000,
    "payment": { "paymentId": 8801, "status": "CONFIRMED", "paidAt": "2026-09-10T20:03:11+09:00", "accountNoMasked": "****5678" },
    "depositStatus": "CONFIRMED",
    "tickets": [
      { "ticketId": 90211, "ticketTypeName": "일반", "status": "ISSUED" },
      { "ticketId": 90212, "ticketTypeName": "일반", "status": "ISSUED" }
    ]
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "COMMON_NOT_FOUND", "data": null, "msg": "요청한 정보를 찾을 수 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 주문 또는 타인 주문 |

---

### API-ticket-04 내 티켓 목록
`GET /api/v1/tickets/me` · 권한: AUDIENCE · 우선: P0 · 연관 화면: `A-07 내 티켓 목록` · 연관 기능: 내 티켓 목록 조회

## 요구사항
- 소유 중인 티켓을 예정·사용완료·취소 탭으로 나눠 볼 수 있게 상태별 필터를 제공한다.
- 양도중(`TRANSFER_PENDING`) 티켓은 예정 탭에 상태 배지와 함께 노출하고 입장·취소가 불가함을 표시한다 [권] P-13.
- 양도로 넘겨받은 티켓도 현재 소유자 기준으로 여기에 나온다(소유권은 DB 기준).

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `status` | query | string | N | `ISSUED`/`TRANSFER_PENDING`/`USED`/`CANCELLED`. 미지정 시 전체 |
| `page` | query | integer | N | 0-base, 기본 0 |
| `size` | query | integer | N | 기본 20, 최대 100 |
| `sort` | query | string | N | `startAt,asc`(기본) / `startAt,desc` |

### Body
없음.

### 시스템 처리
1. 회원 식별 → 쿼리 검증.
2. 상태 전이 없음(조회).
3. 외부 호출 없음.
4. `ticket` + `performance` 조인 후 `items`/`pageInfo`.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "items": [
      {
        "ticketId": 90211,
        "performanceId": 12,
        "performanceTitle": "합정 3밴드 합동공연",
        "venueName": "합정 언플러그드",
        "startAt": "2026-09-19T19:00:00+09:00",
        "ticketTypeName": "일반",
        "status": "ISSUED",
        "cancellable": true,
        "transferable": true
      }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 2, "hasNext": false }
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "COMMON_UNAUTHORIZED", "data": null, "msg": "로그인이 필요합니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `status`·`sort`, `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |

---

### API-ticket-05 티켓 상세
`GET /api/v1/tickets/{ticketId}` · 권한: AUDIENCE(소유자) · 우선: P0 · 연관 화면: `A-08 티켓 상세·QR` · 연관 기능: 티켓 상세 조회

## 요구사항
- 티켓 정보와 현재 상태, 취소·양도 가능 여부(사유 포함)를 준다. **QR 토큰은 여기 담지 않는다** — 회전 토큰은 API-ticket-06이 별도로 발급한다(SEC-06).
- 취소 가능 여부에는 수수료 구간(D-7 전액 / D-3 전까지 50% / D-3 00:00 이후 불가)의 판단 결과를 담는다 [권] P-8. 정확한 환불액은 API-refund-01에서 계산한다.
- 소유자가 아니면 `TICKET_NOT_OWNED`다(소유권은 DB 기준).

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `ticketId` | path | integer(BIGINT) | Y | 티켓 PK |

### Body
없음.

### 시스템 처리
1. 티켓 존재·소유자 확인.
2. 상태 전이 없음(조회).
3. 외부 호출 없음.
4. `ticket` + `performance` + `ticket_type` + 취소·양도 가능 판정 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "ticketId": 90211,
    "orderId": 5501,
    "performanceId": 12,
    "performanceTitle": "합정 3밴드 합동공연",
    "venueName": "합정 언플러그드",
    "venueAddress": "서울 마포구 양화로 000",
    "startAt": "2026-09-19T19:00:00+09:00",
    "ticketTypeName": "일반",
    "price": 25000,
    "status": "ISSUED",
    "chosenTeamName": "새벽세시",
    "cancellable": true,
    "cancelDeadlineAt": "2026-09-16T00:00:00+09:00",
    "transferable": true,
    "entryOpenAt": "2026-09-19T18:00:00+09:00",
    "usedAt": null
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "TICKET_NOT_OWNED", "data": null, "msg": "본인 소유의 티켓이 아닙니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `TICKET_NOT_OWNED` | 현재 소유자가 아님 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 `ticketId` |

---

### API-ticket-06 동적 QR 토큰 발급
`GET /api/v1/tickets/{ticketId}/qr` · 권한: 소유자 · 우선: P0 · 연관 화면: `A-08 티켓 상세·QR` · 연관 기능: 동적 QR 발급

## 요구사항
- **30초마다 회전하는 서명 토큰**(유효 60초)을 발급한다. 고정 티켓번호 QR은 만들지 않는다 [권] P-14 / SEC-06.
- 클라이언트는 `rotateAfterMs` 주기로 재호출한다. 서버는 티켓별 QR 시드로 서명하고, 양도 수락 시 시드를 폐기·재발급한다(SEC-07).
- `USED`·`CANCELLED`·`TRANSFER_PENDING` 티켓에는 발급하지 않는다 — 각각 `TICKET_ALREADY_USED`·`TICKET_CANCELED`·`TRANSFER_NOT_ALLOWED`다.
- 입장 허용 시간대 밖에서도 발급 자체는 허용하되, 검표(API-entry-01)에서 `ENTRY_NOT_IN_TIME_WINDOW`로 걸러진다 [권].

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `ticketId` | path | integer(BIGINT) | Y | 티켓 PK |

### Body
없음.

### 시스템 처리
1. 티켓 존재·소유자·상태(`ISSUED`) 확인.
2. 상태 전이 없음(토큰 발급).
3. 외부 호출 없음.
4. `ticket_qr_seed`로 서명 토큰 생성(exp 60초), 발급 로그 기록.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "ticketId": 90211,
    "qrToken": "eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjkwMjExLCJleHAiOjE3ODk...",
    "issuedAt": "2026-09-19T18:30:00+09:00",
    "expiresAt": "2026-09-19T18:31:00+09:00",
    "rotateAfterMs": 30000
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "TICKET_ALREADY_USED", "data": null, "msg": "이미 입장 처리된 티켓입니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `TICKET_NOT_OWNED` | 현재 소유자가 아님 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 `ticketId` |
| 409 | `TICKET_ALREADY_USED` | 상태가 `USED` |
| 409 | `TICKET_CANCELED` | 상태가 `CANCELLED` |
| 409 | `TRANSFER_NOT_ALLOWED` | 상태가 `TRANSFER_PENDING`(양도 진행 중) |
| 429 | `COMMON_TOO_MANY_REQUESTS` | 회전 주기보다 잦은 호출 |

---

## 7. payment — 결제

관객 계좌 → 플랫폼 에스크로 계좌 이체(SSAFY 교육용 금융망 API)로 결제하고, **입금 확인 이벤트에만 KRWS mint를 결합**한다 [권] P-7 / 기획 §8.4. 예치 없는 발행은 금지이며 준비금 증명(API-verify-02)으로 검증된다. 결제 상태(§1.5 `Payment`): `REQUESTED` → `CONFIRMED` / `FAILED` → `REFUNDED`.

### API-payment-01 결제 요청(금융망 이체)
`POST /api/v1/orders/{orderId}/payment` · 권한: AUDIENCE(주문자) · 우선: P0 · 연관 화면: `A-05 결제` · 연관 기능: 티켓 결제·KRWS 예치

## 요구사항
- `PENDING_PAYMENT` 주문에 대해 금융망 이체를 요청한다. 결제 확인 후 동일 금액 KRWS를 mint해 공연별 에스크로에 예치하고, 티켓을 발급하며, 온체인 `recordChoice`를 기록한다.
- 즉시 끝나지 않으므로 **`202 Accepted` + `jobId`**로 접수하고 `GET /api/v1/chain/jobs/{jobId}` 폴링 또는 API-payment-02로 상태를 확인한다. 예매 확정 응답은 tx 확정을 기다리지 않는다(PERF-04, 온체인 반영 ≤ 60초).
- `Idempotency-Key`가 필수다(REL-04). 같은 키 재호출은 최초 `jobId`를 재생하고 이체를 재실행하지 않는다.
- 클라이언트 금액과 서버 계산 금액이 다르면 `PAYMENT_AMOUNT_MISMATCH`로 막고 위조 시도로 로그를 남긴다.
- 금융망 오류 시 **재고를 즉시 원복하고 mint는 실행하지 않는다**(`PAYMENT_REQUEST_FAILED`). 결제는 성공했는데 mint가 최종 실패하면 자동 환불 보상 트랜잭션을 걸고 `COIN_MINT_FAILED`를 남긴다.
- 준비금 1:1이 깨진 상태(`COIN_RESERVE_MISMATCH`)에서는 mint를 중단한다(REL-03, P-11).

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`
- `Idempotency-Key: {UUIDv4}` **필수**

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `orderId` | path | integer(BIGINT) | Y | 주문 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `amount` | integer | Y | 원 단위 정수, 주문 금액과 일치 | 결제 금액 확인용 |

```json
{ "amount": 50000 }
```

### 시스템 처리
1. 멱등키 확인 → 주문 소유자·상태(`PENDING_PAYMENT`)·만료 확인 → 금액 대조 → 관객 계좌 연결 여부 확인 → 준비금 상태 확인.
2. 상태 전이: `payment` 생성(`REQUESTED`). 이체 확인 시 `CONFIRMED`, 주문 `PENDING_PAYMENT` → `PAID`, 티켓 `ISSUED` 발급.
3. 외부 호출(202): ① 금융망 이체(관객 계좌 → 에스크로 계좌, 멱등키 전달) → ② 입금 확인 시 minter 지갑이 동일 금액 KRWS `mint` → 공연 에스크로 예치 → ③ operator 지갑이 `recordChoice(ticketId, teamBitmap)` 기록(nonce 직렬 큐). 각 단계 실패는 3회 재시도, 최종 실패는 관리자 재처리(`M-02`).
4. `payment`·`coin_job`·`chain_job`·`ticket` 저장, 결제 감사 로그(SEC-11).

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": { "jobId": "chain_01J9C5F6G7", "status": "PENDING", "pollAfterMs": 1500, "orderId": 5501, "paymentId": 8801, "amount": 50000 },
  "msg": "결제를 처리하고 있습니다."
}
```

### 4xx/5xx
```json
{ "code": "PAYMENT_INSUFFICIENT_BALANCE", "data": null, "msg": "계좌 잔액이 부족합니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `amount` 누락, `Idempotency-Key` 헤더 없음 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 주문 또는 타인 주문 |
| 409 | `COMMON_CONFLICT` | 관객 금융망 계좌 미연결(§17 신설 제안), 같은 멱등키에 다른 본문 |
| 409 | `PAYMENT_ALREADY_PAID` | 이미 결제 완료된 주문 |
| 409 | `PAYMENT_AMOUNT_MISMATCH` | 요청 금액 ≠ 서버 계산 금액 |
| 409 | `PAYMENT_INSUFFICIENT_BALANCE` | 관객 계좌 잔액 부족 |
| 409 | `TICKET_SALE_CLOSED` | 결제 시도 시점에 예매 마감 |
| 409 | `COIN_RESERVE_MISMATCH` | 준비금 1:1 불일치로 mint 중단 상태 |
| 500 | `COIN_MINT_FAILED` | 결제 성공 후 민팅 최종 실패 — 자동 환불 보상 실행 |
| 502 | `PAYMENT_REQUEST_FAILED` | 금융망 API 오류 — 재고 원복, mint 미실행 |
| 504 | `PAYMENT_TIMEOUT` | 금융망 응답 지연 — 주문 내역에서 상태 확인 안내 |

---

### API-payment-02 결제 상태 조회
`GET /api/v1/orders/{orderId}/payment` · 권한: AUDIENCE(주문자) · 우선: P0 · 연관 화면: `A-05 결제` · 연관 기능: 결제 상태 조회

## 요구사항
- A-05 결제 화면의 처리 중 상태(202 폴링)에서 쓰는 조회다. 결제 단계와 예치(mint) 단계를 분리해 보여준다.
- 관객 화면에는 코인·체인 용어를 노출하지 않는다 — `depositStatus`는 "결제 확인 중 / 완료"로 매핑해 표기한다(기획 §8.2) [권].
- 결제가 확정되면 발급된 `ticketIds`를 함께 주어 A-06으로 바로 넘어갈 수 있게 한다.

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `orderId` | path | integer(BIGINT) | Y | 주문 PK |

### Body
없음.

### 시스템 처리
1. 주문 소유자 확인.
2. 상태 전이 없음(조회).
3. 외부 호출 없음 — 진행 상태는 `payment`·`coin_job` 레코드로 판단한다.
4. 결제·예치·티켓 발급 상태를 합쳐 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "orderId": 5501,
    "paymentId": 8801,
    "paymentStatus": "CONFIRMED",
    "orderStatus": "PAID",
    "depositStatus": "CONFIRMED",
    "amount": 50000,
    "requestedAt": "2026-09-10T20:03:00+09:00",
    "confirmedAt": "2026-09-10T20:03:11+09:00",
    "ticketIds": [90211, 90212],
    "jobId": "chain_01J9C5F6G7",
    "pollAfterMs": null
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "COMMON_NOT_FOUND", "data": null, "msg": "요청한 정보를 찾을 수 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 주문, 타인 주문, 결제 요청 이력 없음 |

---

## 8. coin — KRWS (+ 비동기 작업 폴링)

KRWS는 ERC-20, **decimals=0, 1 KRWS = 1원**이다. mint는 금융망 입금 확인에만 결합하고, burn은 환불·팀 환급에서만 일어난다. 운영지갑 권한은 **minter/burner와 operator 둘로 분리**한다(SEC-05, 지갑 문서). API-chain-01은 모든 202 응답의 공통 폴링 엔드포인트라 이 절 끝에 둔다.

### API-coin-01 KRWS 유통량·준비금 요약
`GET /api/v1/coin/supply` · 권한: GUEST(인증 불필요) · 우선: P0 · 연관 화면: `V-02 준비금 증명` · 연관 기능: KRWS 유통량 조회

## 요구사항
- 총 유통량과 에스크로 계좌 잔액, 1:1 성립 여부를 간단히 준다. 상세 증명 데이터는 API-verify-02가 담당하고 이쪽은 요약 위젯용이다.
- **1분 캐시**한다 [권] P-11 / REL-03. 응답에 `refreshedAt`을 담아 갱신 시각을 노출한다.
- 불일치가 확인되면 `reserveMatched: false`로 내려주고 서버는 mint를 중단한다. 조회 자체는 실패시키지 않는다 [권].
- 화면에 "테스트넷 모의 발행" 고지를 함께 띄우도록 `simulationNotice`를 담는다(CON-03).

## Request
### Headers
- `Accept: application/json`

### Path · Query
없음.

### Body
없음.

### 시스템 처리
1. 캐시(1분) 확인.
2. 상태 전이 없음(조회).
3. 외부 호출: 체인 노드 `totalSupply` + 금융망 에스크로 계좌 잔액 조회. 둘 중 하나라도 실패하면 마지막 성공값과 `stale: true`를 준다.
4. 캐시 갱신 후 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "totalSupply": 4820000,
    "escrowBalance": 4820000,
    "reserveMatched": true,
    "ratio": "1:1",
    "network": "polygon-amoy",
    "tokenAddress": "0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736",
    "refreshedAt": "2026-09-20T09:00:00+09:00",
    "stale": false,
    "simulationNotice": "테스트넷 모의 발행입니다. 실제 자금이 아닙니다."
  },
  "msg": ""
}
```

### 4xx/5xx
```json
{ "code": "COMMON_EXTERNAL_SERVICE_ERROR", "data": null, "msg": "외부 시스템 연동 중 오류가 발생했습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 429 | `COMMON_TOO_MANY_REQUESTS` | 호출 한도 초과 |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | 체인·금융망 조회 모두 실패하고 캐시도 없음 |

---

### API-coin-02 mint/burn 작업 목록
`GET /api/v1/admin/coin/jobs` · 권한: ADMIN · 우선: P0 · 연관 화면: `M-02 정산·작업 관리` · 연관 기능: 코인 작업 목록 조회

## 요구사항
- mint·burn 작업을 상태·유형·기간으로 필터해 준다. **실패 건을 먼저 찾는 화면**이므로 기본 정렬은 최신순이고 `status=FAILED` 필터를 자주 쓴다.
- 각 행에 재시도 횟수(최대 3회)와 재시도 가능 여부를 담아 API-coin-03 버튼 활성 조건을 서버가 정한다(REL-09).
- 관리자 전용이다. 감사 로그 대상 화면이다(SEC-11).

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `type` | query | string | N | `MINT` / `BURN` |
| `status` | query | string | N | `PENDING`/`SUBMITTED`/`CONFIRMED`/`FAILED` |
| `performanceId` | query | integer | N | 공연으로 좁히기 |
| `from` | query | string(ISO 8601) | N | 생성 시각 시작 |
| `to` | query | string(ISO 8601) | N | 생성 시각 종료 |
| `page` | query | integer | N | 0-base, 기본 0 |
| `size` | query | integer | N | 기본 20, 최대 100 |

### Body
없음.

### 시스템 처리
1. ADMIN 권한 확인 → 쿼리 검증.
2. 상태 전이 없음(조회).
3. 외부 호출 없음(인덱싱된 `coin_job` 사용).
4. `coin_job` 조회 후 `items`/`pageInfo`.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "items": [
      {
        "jobId": "mint_01J9C5F6G7",
        "type": "MINT",
        "status": "FAILED",
        "performanceId": 12,
        "orderId": 5501,
        "amount": 50000,
        "retryCount": 3,
        "retryable": true,
        "failureReason": "CHAIN_NONCE_CONFLICT",
        "txHash": null,
        "createdAt": "2026-09-10T20:03:12+09:00",
        "updatedAt": "2026-09-10T20:05:40+09:00"
      }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 2, "hasNext": false }
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "COMMON_FORBIDDEN", "data": null, "msg": "이 작업을 수행할 권한이 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `type`·`status`, 기간 역전, `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `COMMON_FORBIDDEN` | ADMIN이 아님 |

---

### API-coin-03 작업 재시도
`POST /api/v1/admin/coin/jobs/{jobId}/retry` · 권한: ADMIN · 우선: P0 · 연관 화면: `M-02 정산·작업 관리` · 연관 기능: 코인 작업 재시도

## 요구사항
- 자동 재시도 3회를 소진하고 `FAILED`로 남은 mint·burn 작업을 관리자가 수동으로 다시 태운다(REL-09 "최종 실패는 운영자 알림 + 수동 재처리 경로").
- 온체인 tx이므로 `202 Accepted` + 새 `jobId`가 아니라 **같은 `jobId`의 상태를 `PENDING`으로 되돌려** 폴링을 이어가게 한다 [권].
- `CONFIRMED` 작업이나 재시도 불가로 표시된 작업은 재시도하지 않는다.
- `Idempotency-Key`가 필수다 — 관리자 화면 더블클릭으로 이중 발행이 일어나면 준비금 증명이 깨진다.
- 준비금 1:1이 깨진 상태에서는 mint 재시도를 막는다(`COIN_RESERVE_MISMATCH`).

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`
- `Idempotency-Key: {UUIDv4}` **필수**

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `jobId` | path | string | Y | `mint_*` 또는 `burn_*` 작업 식별자 |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `note` | string | N | 최대 200자 | 재처리 사유(감사 로그에 기록) |

```json
{ "note": "nonce 충돌로 실패, 큐 정리 후 재실행" }
```

### 시스템 처리
1. ADMIN 권한 확인 → 멱등키 확인 → 작업 존재·상태(`FAILED`)·재시도 가능 여부 확인 → 준비금 상태 확인(mint인 경우).
2. 상태 전이: `coin_job` `FAILED` → `PENDING`, `retryCount` 유지하고 `manualRetryCount` 증가.
3. 외부 호출(202): minter/burner 지갑으로 tx 재전송(nonce 직렬 큐). 확정 시 `CONFIRMED`.
4. `coin_job` 갱신 + 관리자 작업 감사 로그(SEC-11).

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": { "jobId": "mint_01J9C5F6G7", "status": "PENDING", "pollAfterMs": 2000, "manualRetryCount": 1 },
  "msg": "재시도를 접수했습니다."
}
```

### 4xx/5xx
```json
{ "code": "COMMON_CONFLICT", "data": null, "msg": "다른 요청이 처리 중입니다. 잠시 후 다시 시도해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `Idempotency-Key` 헤더 없음 |
| 403 | `COMMON_FORBIDDEN` | ADMIN이 아님 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 `jobId` |
| 409 | `COMMON_CONFLICT` | 이미 `CONFIRMED`이거나 재시도 진행 중, 멱등키 본문 불일치 |
| 409 | `COIN_RESERVE_MISMATCH` | 준비금 1:1 불일치로 mint 중단 상태 |
| 500 | `COIN_MINT_FAILED` | 재시도 mint 최종 실패 |
| 500 | `COIN_BURN_FAILED` | 재시도 burn 최종 실패 — 금융망 이체는 진행하지 않는다 |
| 500 | `CHAIN_GAS_INSUFFICIENT` | 운영지갑 가스 부족 |

---

### API-chain-01 비동기 tx 작업 상태
`GET /api/v1/chain/jobs/{jobId}` · 권한: 요청자(작업을 만든 회원) 또는 ADMIN · 우선: P0 · 연관 화면: `공통(202 폴링)` · 연관 기능: 비동기 작업 상태 폴링

## 요구사항
- **모든 202 응답의 단일 폴링 엔드포인트**다. 동의 tx·판매 시작·결제/mint·환불/burn·집계·잠금·release·공연 취소 일괄 환불이 전부 이 경로로 상태를 확인한다.
- 상태값은 §1.5 그대로 `PENDING`/`SUBMITTED`/`CONFIRMED`/`FAILED`다. 확정 시 `txHash`(66자)와 `explorerUrl`, 실패 시 `failureReason`(규격 v3 코드 문자열)과 `retryable`을 채운다.
- 작업을 만든 회원 또는 ADMIN만 조회한다. 남의 작업은 존재를 숨겨 `COMMON_NOT_FOUND`로 응답한다 [권].
- 부분 성공이 있는 작업(공연 취소 일괄 환불, release)은 `results` 배열로 건별 상태를 함께 준다(규격 v3 §1 부분 성공).

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `jobId` | path | string | Y | 202 응답에서 받은 작업 식별자(`chain_*`·`mint_*`·`burn_*`) |

### Body
없음.

### 시스템 처리
1. 작업 존재·요청자 일치(또는 ADMIN) 확인.
2. 상태 전이 없음(조회). 상태 갱신은 tx 리스너·큐가 담당한다.
3. 외부 호출 없음 — 인덱싱된 `chain_job`·`coin_job` 레코드를 읽는다(PERF-01).
4. 상태·`txHash`·`explorerUrl`·부분 결과 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "jobId": "chain_01J9A2B3C4",
    "type": "AGREE_TO_RULES",
    "status": "CONFIRMED",
    "performanceId": 12,
    "teamId": 9,
    "txHash": "0x1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f901",
    "explorerUrl": "https://amoy.polygonscan.com/tx/0x1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f901",
    "retryCount": 0,
    "failureReason": null,
    "retryable": false,
    "results": null,
    "pollAfterMs": null,
    "submittedAt": "2026-08-29T10:01:40+09:00",
    "confirmedAt": "2026-08-29T10:02:00+09:00"
  },
  "msg": ""
}
```

진행 중인 경우 `status`가 `PENDING`·`SUBMITTED`이고 `pollAfterMs`가 채워진다. 최종 실패는 아래와 같다.

```json
{
  "code": "SUCCESS",
  "data": {
    "jobId": "mint_01J9C5F6G7",
    "type": "MINT",
    "status": "FAILED",
    "txHash": null,
    "retryCount": 3,
    "failureReason": "CHAIN_NONCE_CONFLICT",
    "retryable": true,
    "pollAfterMs": null
  },
  "msg": "처리에 실패했습니다. 관리자 확인 후 재처리됩니다."
}
```

### 4xx/5xx
```json
{ "code": "COMMON_NOT_FOUND", "data": null, "msg": "요청한 정보를 찾을 수 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 `jobId` 또는 타인의 작업 |
| 504 | `CHAIN_TX_TIMEOUT` | 제출은 됐으나 확정이 임계(기본 120초)를 넘김 — 계속 폴링 가능 |

---

## 9. refund — 취소·환불

취소 수수료 [권] P-8: **D-7 이전 전액 / D-3 이전 50% / D-3 00:00 이후 취소 불가**(취소 마감). 환불은 `금융망 이체 + KRWS burn + cancelChoice()` 세 단계를 함께 처리하며, **이체 성공 확인 후 소각** 순서를 반드시 지킨다(지갑 문서 — 반대로 하면 이체 실패 시 토큰만 사라져 준비금 증명이 깨진다).

### API-refund-01 환불액 미리보기
`GET /api/v1/tickets/{ticketId}/refund-quote` · 권한: 소유자 · 우선: P0 · 연관 화면: `A-11 취소·환불` · 연관 기능: 환불액 미리보기

## 요구사항
- 지금 취소하면 얼마를 돌려받는지 수수료 구간과 함께 보여준다. 계산 기준(구간 경계 시각)을 함께 담아 화면이 "왜 이 금액인지"를 설명할 수 있게 한다 [권] P-8.
- 조회만 하고 상태를 바꾸지 않는다. 실제 취소는 API-refund-02다.
- 취소 마감(D-3 00:00) 이후에는 `REFUND_DEADLINE_PASSED`로 응답해 화면에서 버튼을 막는다.
- 정산이 잠긴 이후(`LOCKED` 이상)에는 `REFUND_AFTER_SETTLEMENT_LOCK`이다 — 온체인 회수가 불가하므로 고객센터 문의로 안내한다.

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `ticketId` | path | integer(BIGINT) | Y | 티켓 PK |

### Body
없음.

### 시스템 처리
1. 티켓 존재·소유자·상태(`ISSUED`) 확인 → 공연 일시로 수수료 구간 판정.
2. 상태 전이 없음(조회).
3. 외부 호출 없음.
4. 결제 금액 · 수수료율 · 환불 예정액 계산 결과 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "ticketId": 90211,
    "paidAmount": 25000,
    "feeRatePercent": 50,
    "feeAmount": 12500,
    "refundAmount": 12500,
    "feeStage": "D-3_BEFORE",
    "fullRefundUntil": "2026-09-12T00:00:00+09:00",
    "cancelDeadlineAt": "2026-09-16T00:00:00+09:00",
    "refundAccount": { "bankName": "신한", "accountNoMasked": "****5678" }
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "REFUND_DEADLINE_PASSED", "data": null, "msg": "취소 가능 기간이 지났습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `TICKET_NOT_OWNED` | 현재 소유자가 아님 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 `ticketId` |
| 409 | `TICKET_ALREADY_USED` | 이미 입장 처리됨 |
| 409 | `TICKET_CANCELED` | 이미 취소된 티켓 |
| 409 | `TRANSFER_NOT_ALLOWED` | 양도 진행 중(`TRANSFER_PENDING`)이라 취소 불가 |
| 409 | `REFUND_DEADLINE_PASSED` | 취소 마감(D-3 00:00) 경과 |
| 409 | `REFUND_AFTER_SETTLEMENT_LOCK` | 정산이 `LOCKED` 이상 |

---

### API-refund-02 개별 취소·환불
`POST /api/v1/tickets/{ticketId}/cancel` · 권한: 소유자 · 우선: P0 · 연관 화면: `A-11 취소·환불` · 연관 기능: 티켓 개별 취소·환불

## 요구사항
- 티켓 1매를 취소하고 **금융망 환불 이체 → KRWS burn → `cancelChoice()` 온체인 카운터 롤백**을 순서대로 실행한다(기획 §6.1, REL-06).
- 외부 호출이 이어지므로 **`202 Accepted` + `jobId`**다. 상태는 `GET /api/v1/chain/jobs/{jobId}`로 확인한다.
- `Idempotency-Key`가 필수다. 같은 키 재호출은 최초 `jobId`를 재생한다(REL-04).
- 확정 시 티켓 `ISSUED` → `CANCELLED`, 주문의 전 티켓이 취소되면 주문 `PAID` → `REFUNDED`, 재고를 원복한다.
- 이체 실패는 `REFUND_TRANSFER_FAILED`로 재시도 대기(3회), 소각 실패는 `COIN_BURN_FAILED`로 남기고 **이미 나간 이체를 되돌리지 않는다** — 대사 대상으로 관리자에게 넘긴다(REL-05).
- 클라이언트는 확인 전 API-refund-01로 금액을 보여준 뒤 `expectedRefundAmount`로 재확인시킨다.

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`
- `Idempotency-Key: {UUIDv4}` **필수**

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `ticketId` | path | integer(BIGINT) | Y | 티켓 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `expectedRefundAmount` | integer | Y | 원 단위 정수 | API-refund-01의 `refundAmount`. 서버 재계산과 다르면 400 |
| `reason` | string | N | 최대 200자 | 취소 사유(통계용) |

```json
{ "expectedRefundAmount": 12500, "reason": "일정 변경" }
```

### 시스템 처리
1. 멱등키 확인 → 소유자·티켓 상태·취소 마감·정산 잠금 여부 확인 → 환불액 재계산 후 `expectedRefundAmount` 대조.
2. 상태 전이: `refund` 생성, 티켓 `ISSUED` → `CANCELLED`(tx 확정 시 확정 반영), 주문 전량 취소 시 `PAID` → `REFUNDED`.
3. 외부 호출(202): ① 금융망 환불 이체(에스크로 계좌 → 관객 계좌, 멱등키) → ② **이체 성공 확인 후** burner 지갑이 KRWS `burn` → ③ operator 지갑이 `cancelChoice(ticketId)` 호출. 실패는 단계별 3회 재시도, 최종 실패는 관리자 재처리(`M-02`).
4. `refund`·`coin_job`·`chain_job` 저장, 재고 원복, 감사 로그.

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": { "jobId": "chain_01J9D8H9J0", "status": "PENDING", "pollAfterMs": 2000, "ticketId": 90211, "refundAmount": 12500, "feeAmount": 12500 },
  "msg": "취소를 접수했습니다. 환불 결과는 주문 내역에서 확인해 주세요."
}
```

### 4xx/5xx
```json
{ "code": "REFUND_ALREADY_REQUESTED", "data": null, "msg": "이미 취소 요청이 접수된 티켓입니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `expectedRefundAmount` 불일치, `Idempotency-Key` 헤더 없음 |
| 403 | `TICKET_NOT_OWNED` | 현재 소유자가 아님 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 `ticketId` |
| 409 | `TICKET_ALREADY_USED` | 이미 입장 처리됨 |
| 409 | `TICKET_CANCELED` | 이미 취소됨 |
| 409 | `TRANSFER_NOT_ALLOWED` | 양도 진행 중이라 취소 불가 |
| 409 | `REFUND_DEADLINE_PASSED` | 취소 마감(D-3 00:00) 경과 |
| 409 | `REFUND_ALREADY_REQUESTED` | 취소 요청이 이미 접수됨 |
| 409 | `REFUND_AFTER_SETTLEMENT_LOCK` | 정산이 `LOCKED` 이상 |
| 409 | `COMMON_CONFLICT` | 같은 멱등키에 다른 본문 |
| 500 | `COIN_BURN_FAILED` | 이체 후 소각 최종 실패 — 대사 대상, 이체는 되돌리지 않음 |
| 502 | `REFUND_TRANSFER_FAILED` | 금융망 환불 이체 실패 — 재시도 대기 |

---

## 10. transfer — 양도(선물)

카카오 공유 링크에 담는 **서명 토큰, 24시간 만료**다 [권] P-13 / SEC-07. 수락은 로그인한 관객만 하고, 수락 즉시 소유자를 변경하며 **기존 QR 시드를 폐기·재발급**한다. 양도중(`TRANSFER_PENDING`) 티켓은 입장·취소가 막힌다(REL-08). Transfer 상태(§1.5): `PENDING` → `ACCEPTED` / `EXPIRED` / `CANCELLED`.

### API-transfer-01 양도 링크 생성
`POST /api/v1/tickets/{ticketId}/transfers` · 권한: 소유자 · 우선: P0 · 연관 화면: `A-09 양도 링크 생성` · 연관 기능: 티켓 양도 링크 생성

## 요구사항
- 티켓 1매에 대해 일회용 수락 링크를 만든다. 유효기간 **24시간**, 수락 즉시 무효다(SEC-07).
- 링크 생성 즉시 티켓 상태가 `ISSUED` → `TRANSFER_PENDING`이 되어 그동안 입장·취소·QR 발급이 막힌다(REL-08).
- 같은 티켓에 유효한 양도가 이미 있으면 새로 만들지 않는다(`TRANSFER_NOT_ALLOWED`). 취소는 API-transfer-04다.
- `USED`·`CANCELLED` 티켓, 취소 마감이 지난 티켓도 양도 대상이 아니다 — 마감 이후 양도는 허용한다 [권](입장만 가능하면 되므로).
- 응답의 `shareUrl`을 카카오 JavaScript SDK 공유하기에 그대로 넘긴다. 서버가 메시지를 발송하지는 않는다.

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `ticketId` | path | integer(BIGINT) | Y | 티켓 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `message` | string | N | 최대 100자 | 받는 사람에게 보여줄 한 줄 메시지 |

```json
{ "message": "그날 못 가게 돼서 보낼게!" }
```

### 시스템 처리
1. 소유자·티켓 상태(`ISSUED`) 확인 → 기존 유효 양도 존재 여부 확인.
2. 상태 전이: `transfer` 생성(`PENDING`, 24h), 티켓 `ISSUED` → `TRANSFER_PENDING`.
3. 외부 호출 없음(온체인 변화 없음 — 소유권은 DB 기준).
4. `transfer` 저장, 서명 토큰 발급, 기존 QR 토큰 무효화.

## Response
### 201 Created
```json
{
  "code": "SUCCESS",
  "data": {
    "transferId": 3301,
    "ticketId": 90211,
    "token": "trf_7c1a9b2e4d6f8031",
    "shareUrl": "https://b204.ssafy.io/transfers/trf_7c1a9b2e4d6f8031",
    "status": "PENDING",
    "expiresAt": "2026-09-15T21:00:00+09:00"
  },
  "msg": "24시간 안에 상대방이 수락해야 합니다."
}
```

### 4xx
```json
{ "code": "TRANSFER_NOT_ALLOWED", "data": null, "msg": "이 티켓은 더 이상 양도할 수 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `message` 길이 초과 |
| 403 | `TICKET_NOT_OWNED` | 현재 소유자가 아님 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 `ticketId` |
| 409 | `TICKET_ALREADY_USED` | 이미 입장 처리됨 |
| 409 | `TICKET_CANCELED` | 취소된 티켓 |
| 409 | `TRANSFER_NOT_ALLOWED` | 이미 유효한 양도 링크가 존재, 또는 양도 불가 상태 |

---

### API-transfer-02 양도 정보 조회
`GET /api/v1/transfers/{token}` · 권한: GUEST(인증 불필요) · 우선: P0 · 연관 화면: `A-10 양도 수락` · 연관 기능: 양도 정보 조회

## 요구사항
- 비로그인 상태에서 링크를 열었을 때 무엇을 받는지 먼저 보여준다 — 공연·일시·장소·티켓 타입·보낸 사람 이름(마스킹)·남은 시간.
- 개인정보를 최소화한다. 보낸 사람은 `김*객` 형태로 마스킹하고 티켓 소유자 연락처·이메일은 담지 않는다 [권].
- 만료된 링크는 `410 TRANSFER_LINK_EXPIRED`, 이미 수락된 링크는 `409 TRANSFER_LINK_ALREADY_USED`로 구분해 화면 문구를 다르게 한다.
- 수락 자체는 로그인이 필요하므로 응답에 `loginRequired: true`를 담아 A-10이 로그인 유도 흐름을 그린다.

## Request
### Headers
- `Accept: application/json`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `token` | path | string | Y | 양도 토큰(최대 64자) |

### Body
없음.

### 시스템 처리
1. 토큰 서명·존재·만료 검증.
2. 상태 전이: 만료가 확인되면 `transfer` `PENDING` → `EXPIRED`로 정리하고 티켓을 `TRANSFER_PENDING` → `ISSUED`로 되돌린다.
3. 외부 호출 없음.
4. 공연·티켓 요약 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "token": "trf_7c1a9b2e4d6f8031",
    "status": "PENDING",
    "senderNameMasked": "김*객",
    "message": "그날 못 가게 돼서 보낼게!",
    "performanceId": 12,
    "performanceTitle": "합정 3밴드 합동공연",
    "venueName": "합정 언플러그드",
    "startAt": "2026-09-19T19:00:00+09:00",
    "ticketTypeName": "일반",
    "expiresAt": "2026-09-15T21:00:00+09:00",
    "loginRequired": true
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "TRANSFER_LINK_EXPIRED", "data": null, "msg": "선물 링크가 만료되었습니다. 보낸 분에게 다시 요청해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 404 | `TRANSFER_LINK_NOT_FOUND` | 존재하지 않거나 서명이 깨진 토큰 |
| 409 | `TRANSFER_LINK_ALREADY_USED` | 이미 다른 사용자가 수락 |
| 410 | `TRANSFER_LINK_EXPIRED` | 24시간 경과 또는 보낸 사람이 취소 |

---

### API-transfer-03 양도 수락
`POST /api/v1/transfers/{token}/accept` · 권한: AUDIENCE · 우선: P0 · 연관 화면: `A-10 양도 수락` · 연관 기능: 양도 수락

## 요구사항
- 로그인한 관객만 수락한다. 수락 즉시 **DB 소유자를 변경**하고 기존 QR 시드를 폐기·재발급한다(SEC-07). 온체인 변화는 없다.
- 자기 자신에게는 보낼 수 없다(`TRANSFER_SELF_NOT_ALLOWED`). 1인 1공연 4매 한도를 넘기는 수락도 막는다(`TICKET_PURCHASE_LIMIT_EXCEEDED`) [권] P-6.
- 티켓 상태는 `TRANSFER_PENDING` → `ISSUED`(새 소유자)로 돌아가고, `transfer`는 `PENDING` → `ACCEPTED`가 된다.
- 동시 수락 경합은 토큰 단위 락으로 한 명만 성공시키고 나머지는 `TRANSFER_LINK_ALREADY_USED`다.
- IP당 60회/분 호출 제한 대상이다(SEC-10).

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `token` | path | string | Y | 양도 토큰 |

### Body
없음.

### 시스템 처리
1. 토큰 검증 → 만료·사용 여부 확인 → 수락자 ≠ 보낸 사람 확인 → 수락자의 해당 공연 보유 매수 한도 확인.
2. 상태 전이: `transfer` `PENDING` → `ACCEPTED`, 티켓 소유자 변경 후 `TRANSFER_PENDING` → `ISSUED`.
3. 외부 호출 없음.
4. `ticket.member_id` 갱신, `ticket_qr_seed` 폐기·재발급, 양도 이력 저장.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "transferId": 3301,
    "ticketId": 90211,
    "status": "ACCEPTED",
    "newOwnerMemberId": 2048,
    "performanceTitle": "합정 3밴드 합동공연",
    "startAt": "2026-09-19T19:00:00+09:00",
    "acceptedAt": "2026-09-15T09:31:00+09:00"
  },
  "msg": "티켓을 받았습니다. 내 티켓에서 확인해 주세요."
}
```

### 4xx
```json
{ "code": "TRANSFER_LINK_ALREADY_USED", "data": null, "msg": "이미 사용된 선물 링크입니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `TRANSFER_SELF_NOT_ALLOWED` | 보낸 사람이 직접 수락 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 404 | `TRANSFER_LINK_NOT_FOUND` | 존재하지 않는 토큰 |
| 409 | `TRANSFER_LINK_ALREADY_USED` | 이미 수락됨(동시 경합 포함) |
| 409 | `TICKET_PURCHASE_LIMIT_EXCEEDED` | 수락 시 1인 1공연 4매 초과 |
| 409 | `TRANSFER_NOT_ALLOWED` | 공연이 취소되었거나 티켓이 더 이상 유효하지 않음 |
| 410 | `TRANSFER_LINK_EXPIRED` | 24시간 경과 |
| 429 | `COMMON_TOO_MANY_REQUESTS` | IP당 60회/분 초과 (SEC-10) |

---

### API-transfer-04 양도 취소
`DELETE /api/v1/transfers/{token}` · 권한: 보낸 소유자 · 우선: P0 · 연관 화면: `A-09 양도 링크 생성` · 연관 기능: 양도 취소

## 요구사항
- 아직 수락되지 않은 양도 링크를 보낸 사람이 무효화한다. 티켓은 `TRANSFER_PENDING` → `ISSUED`로 돌아가고 다시 입장·취소가 가능해진다.
- 이미 수락된 링크는 되돌릴 수 없다(`TRANSFER_LINK_ALREADY_USED`). 되돌리려면 받은 사람이 다시 양도해야 한다.
- 만료된 링크에 대한 취소 요청은 성공(200)으로 처리한다 — 결과 상태가 같기 때문이다 [권].

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `token` | path | string | Y | 양도 토큰 |

### Body
없음.

### 시스템 처리
1. 토큰 존재·요청자가 보낸 소유자인지 확인 → 상태(`PENDING`·`EXPIRED`) 확인.
2. 상태 전이: `transfer` → `CANCELLED`, 티켓 `TRANSFER_PENDING` → `ISSUED`.
3. 외부 호출 없음.
4. QR 시드 재발급(캡처된 구 링크 무효화) + 이력 저장.

## Response
### 200 OK
```json
{ "code": "SUCCESS", "data": { "transferId": 3301, "ticketId": 90211, "status": "CANCELLED" }, "msg": "선물하기를 취소했습니다." }
```

### 4xx
```json
{ "code": "TRANSFER_LINK_ALREADY_USED", "data": null, "msg": "이미 사용된 선물 링크입니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `TICKET_NOT_OWNED` | 보낸 소유자가 아님 |
| 404 | `TRANSFER_LINK_NOT_FOUND` | 존재하지 않는 토큰 |
| 409 | `TRANSFER_LINK_ALREADY_USED` | 이미 수락 완료 |

---

## 11. entry — 입장

검표는 공연별로 지정된 STAFF만 한다 [권] P-15 / SEC-03. 동적 QR(30초 회전, 유효 60초)을 검증하고 Redis `SETNX` 원타임으로 재사용을 차단한다(SEC-06, REL-07 중복 입장 0). 스캔→판정 표시 p95 ≤ 1초, 스캐너 1대 ≥ 30건/분이 목표다(PERF-03). **QR 입장 보안은 서버 서명 QR의 몫이며 블록체인 성과가 아니다**(기획 §8.3).

### API-entry-01 QR 검증·입장 처리
`POST /api/v1/entries/verify` · 권한: STAFF(해당 공연) · 우선: P0 · 연관 화면: `S-02 검표 — QR 스캔` · 연관 기능: QR 검증·입장 처리

## 요구사항
- 스캔한 QR 토큰의 서명·만료를 검증하고 즉시 입장 처리한다. 판정 결과를 색·소리로 1초 안에 표시할 수 있도록 응답을 최소 필드로 유지한다(PERF-03).
- **Redis `SETNX` 원타임**으로 같은 토큰·같은 티켓의 중복 입장을 막는다. 중복은 `ENTRY_ALREADY_ENTERED`이며 `msg`에 최초 입장 시각을 담는다.
- 만료 QR은 `ENTRY_QR_EXPIRED`(401) — 관객 화면이 자동 재발급하므로 스태프는 "화면 새로고침" 안내만 하면 된다.
- 서명 검증 실패는 `ENTRY_QR_SIGNATURE_INVALID`(401)이며 캡처·복제 시도로 보고 검표 이력에 기록한다.
- 해당 공연의 STAFF가 아니면 `ENTRY_SCANNER_NOT_AUTHORIZED`(403)다. 입장 허용 시간대(공연 시작 60분 전 ~ 종료) 밖은 `ENTRY_NOT_IN_TIME_WINDOW`(409)다 [권].
- 양도중(`TRANSFER_PENDING`)·취소된 티켓은 입장시키지 않는다(REL-08).
- IP당 60회/분 호출 제한 대상이다(SEC-10).

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `performanceId` | integer | Y | STAFF로 지정된 공연 | 검표 중인 공연 |
| `qrToken` | string | Y | 최대 1024자 | 스캔한 서명 토큰 |
| `scannedAt` | string(ISO 8601) | N | — | 스캐너 단말 시각(로그용, 판정 기준은 서버 시각) |

```json
{ "performanceId": 12, "qrToken": "eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjkwMjExLCJleHAiOjE3ODk...", "scannedAt": "2026-09-19T18:42:03+09:00" }
```

### 시스템 처리
1. STAFF 권한 확인 → 토큰 서명·만료 검증 → 티켓의 공연 일치·상태(`ISSUED`) 확인 → 입장 시간대 확인.
2. 상태 전이: Redis `SETNX` 원타임 획득 성공 시 티켓 `ISSUED` → `USED`.
3. 외부 호출 없음(온체인과 무관).
4. `entry_log` 저장(성공·실패 모두), 실패 사유도 기록.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "ticketId": 90211,
    "status": "USED",
    "ticketTypeName": "일반",
    "holderNameMasked": "김*객",
    "enteredAt": "2026-09-19T18:42:03+09:00",
    "enteredCount": 41,
    "totalIssuedCount": 64
  },
  "msg": "입장 완료"
}
```

### 4xx
```json
{ "code": "ENTRY_ALREADY_ENTERED", "data": null, "msg": "이미 입장 처리된 티켓입니다. (최초 입장 19:12)" }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `qrToken` 누락·형식 위반 |
| 401 | `ENTRY_QR_EXPIRED` | 토큰 유효기간(60초) 경과 |
| 401 | `ENTRY_QR_SIGNATURE_INVALID` | 서명 검증 실패(캡처·복제 QR) |
| 403 | `ENTRY_SCANNER_NOT_AUTHORIZED` | 해당 공연의 STAFF가 아님 |
| 404 | `COMMON_NOT_FOUND` | 토큰이 가리키는 티켓 없음 |
| 409 | `ENTRY_ALREADY_ENTERED` | Redis 원타임 중복 감지 |
| 409 | `ENTRY_NOT_IN_TIME_WINDOW` | 입장 허용 시간대 밖 |
| 409 | `TICKET_CANCELED` | 취소된 티켓 |
| 409 | `TRANSFER_NOT_ALLOWED` | 양도 진행 중이라 입장 불가 |
| 429 | `COMMON_TOO_MANY_REQUESTS` | IP당 60회/분 초과 (SEC-10) |

---

### API-entry-02 입장 현황·이력
`GET /api/v1/performances/{performanceId}/entries` · 권한: STAFF·PERFORMER(참여팀) · 우선: P0 · 연관 화면: `S-03 입장 현황` · 연관 기능: 입장 현황 조회

## 요구사항
- 입장 수/총 발급 수와 최근 검표 이력을 준다. **중복 시도·만료 QR 같은 실패 건도 함께** 보여줘 현장에서 원인을 파악할 수 있게 한다.
- 검표 중 반복 호출되므로 요약값은 5초 캐시한다 [권](PERF-01).
- STAFF와 참여팀 소속 공연자만 조회한다.

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |
| `result` | query | string | N | `SUCCESS` / `FAILED`. 미지정 시 전체 |
| `page` | query | integer | N | 0-base, 기본 0 |
| `size` | query | integer | N | 기본 20, 최대 100 |

### Body
없음.

### 시스템 처리
1. 공연 존재 확인 → STAFF 또는 참여팀 소속 확인.
2. 상태 전이 없음(조회).
3. 외부 호출 없음.
4. `entry_log` 조회 + 요약 집계(5초 캐시) 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "summary": { "enteredCount": 41, "totalIssuedCount": 64, "duplicateAttemptCount": 3, "expiredQrCount": 5 },
    "items": [
      { "entryLogId": 77012, "ticketId": 90211, "holderNameMasked": "김*객", "result": "SUCCESS", "failureCode": null, "scannedAt": "2026-09-19T18:42:03+09:00", "scannerMemberId": 1301 },
      { "entryLogId": 77013, "ticketId": 90211, "holderNameMasked": "김*객", "result": "FAILED", "failureCode": "ENTRY_ALREADY_ENTERED", "scannedAt": "2026-09-19T18:42:31+09:00", "scannerMemberId": 1301 }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 49, "hasNext": true }
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "ENTRY_SCANNER_NOT_AUTHORIZED", "data": null, "msg": "이 공연의 검표 권한이 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `result`, `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `ENTRY_SCANNER_NOT_AUTHORIZED` | STAFF도 참여팀도 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |

---

### API-entry-03 내가 검표하는 공연 목록
`GET /api/v1/performances/staff/me` · 권한: STAFF · 우선: P0 · 연관 화면: `S-01 검표 — 공연 선택` · 연관 기능: 검표 담당 공연 목록 조회

## 요구사항
- 로그인 회원이 STAFF로 지정된 공연을 준다. 오늘 공연을 맨 위로 정렬해 현장에서 바로 고를 수 있게 한다 [권].
- 각 행에 입장 가능 시간대와 현재 입장 수를 담아 S-01에서 상태를 바로 보여준다.
- 종료된 공연(`ENDED`)은 기본 제외하고 `includeEnded=true`일 때만 포함한다 [권].

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `includeEnded` | query | boolean | N | 기본 `false` |
| `page` | query | integer | N | 0-base, 기본 0 |
| `size` | query | integer | N | 기본 20, 최대 100 |

### Body
없음.

### 시스템 처리
1. 회원 식별 → `performance_staff` 조회.
2. 상태 전이 없음(조회).
3. 외부 호출 없음.
4. 오늘 공연 우선 정렬 후 `items`/`pageInfo` 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "items": [
      {
        "performanceId": 12,
        "title": "합정 3밴드 합동공연",
        "venueName": "합정 언플러그드",
        "startAt": "2026-09-19T19:00:00+09:00",
        "status": "SALE_CLOSED",
        "entryOpenAt": "2026-09-19T18:00:00+09:00",
        "enteredCount": 41,
        "totalIssuedCount": 64,
        "auto": false
      }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 1, "hasNext": false }
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "COMMON_FORBIDDEN", "data": null, "msg": "이 작업을 수행할 권한이 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `COMMON_FORBIDDEN` | 어떤 공연에도 STAFF로 지정되지 않음 |

---

## 12. settlement — 정산

정산 시점 규칙 [권] P-9 / 기획 §8.3: `취소 마감(D-3) → 공연 종료 → 집계 확정 → 정산 잠금 → 이의제기 48h → release`. Settlement 상태(§1.5): `NONE` → `AGGREGATED` → `LOCKED` → `DISPUTE_OPEN` → `RELEASED` → `REDEEMED` / `HALTED`. 집계는 서버 DB값이 아니라 **온체인 선택 카운터**와 대조해 확정하고(REL-06), 불일치면 자동 정산을 중단한다. 이의가 접수되면 release 자동 실행이 보류된다 [권] P-16.

### API-settlement-01 정산 상태·집계·분배액·tx
`GET /api/v1/performances/{performanceId}/settlement` · 권한: PERFORMER(참여팀) · 우선: P0 · 연관 화면: `P-08 정산 대시보드` · 연관 기능: 정산 현황 조회

## 요구사항
- 정산 상태 머신의 현재 위치, 매출·공통 비용·분배 가능액, **팀별 분배액과 산출 근거**, 관련 tx 해시·익스플로러 링크를 한 번에 준다. P-08 화면 전체가 이 응답으로 그려진다.
- 각 단계 액션(집계 확정·잠금·이의제기·release)의 실행 가능 여부와 막힌 이유를 `actions`로 담아 버튼 활성 조건을 서버가 정한다 [권].
- 이의제기 기간 중이면 남은 시간(`disputeClosesAt`)을 준다. 이의가 열려 있으면 release 자동 실행이 보류됨을 표시한다.
- 참여팀 소속만 조회한다(`SETTLEMENT_NOT_PARTICIPANT`). 공개용 데이터는 API-verify-01이다.

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
없음.

### 시스템 처리
1. 공연 존재·참여팀 소속 확인.
2. 상태 전이 없음(조회).
3. 외부 호출 없음(온체인 값은 인덱싱 결과 사용, PERF-01).
4. `settlement` + `settlement_share` + `dispute` + `chain_job` 조합 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "settlementId": 91,
    "status": "DISPUTE_OPEN",
    "grossRevenue": 1600000,
    "refundedAmount": 75000,
    "commonCost": 300000,
    "distributableAmount": 1225000,
    "rulesHash": "0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f",
    "aggregatedAt": "2026-09-20T10:00:00+09:00",
    "lockedAt": "2026-09-20T18:00:00+09:00",
    "disputeClosesAt": "2026-09-22T18:00:00+09:00",
    "releasedAt": null,
    "counterMatched": true,
    "shares": [
      { "teamId": 7, "teamName": "블루노트", "equalAmount": 163333, "choiceAmount": 287109, "plannerAmount": 122500, "totalAmount": 572942, "choiceCount": 30, "redemptionStatus": null },
      { "teamId": 9, "teamName": "새벽세시", "equalAmount": 163333, "choiceAmount": 200976, "plannerAmount": 0, "totalAmount": 364309, "choiceCount": 21, "redemptionStatus": null },
      { "teamId": 11, "teamName": "노이즈캔슬", "equalAmount": 163334, "choiceAmount": 124415, "plannerAmount": 0, "totalAmount": 287749, "choiceCount": 13, "redemptionStatus": null }
    ],
    "disputes": [ { "disputeId": 41, "teamId": 11, "status": "OPEN", "createdAt": "2026-09-21T09:12:00+09:00" } ],
    "transactions": [
      { "type": "START_SALE", "txHash": "0x8f2e...c1d4", "explorerUrl": "https://amoy.polygonscan.com/tx/0x8f2e...c1d4" }
    ],
    "actions": {
      "aggregate": { "available": false, "blockedReason": "SETTLEMENT_ALREADY_RELEASED" },
      "lock": { "available": false, "blockedReason": "COMMON_CONFLICT" },
      "dispute": { "available": true, "blockedReason": null },
      "release": { "available": false, "blockedReason": "SETTLEMENT_DISPUTE_PERIOD" }
    }
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "SETTLEMENT_NOT_PARTICIPANT", "data": null, "msg": "참여팀만 정산 내역을 조회할 수 있습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `SETTLEMENT_NOT_PARTICIPANT` | 참여팀 소속이 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |

---

### API-settlement-02 집계 확정
`POST /api/v1/performances/{performanceId}/settlement/aggregate` · 권한: 생성자·ADMIN · 우선: P0 · 연관 화면: `P-08 정산 대시보드` · 연관 기능: 정산 집계 확정

## 요구사항
- **공연 종료(`ENDED`) 이후** 생성자 또는 관리자가 실행한다 [권] P-9. 취소 마감이 지나지 않았거나 공연이 끝나지 않았으면 `PERFORMANCE_INVALID_STATUS`다.
- 서버 집계와 **온체인 선택 카운터의 합**을 대조한다. 불일치면 `SETTLEMENT_AGGREGATE_MISMATCH`로 중단하고 관리자 확인으로 넘긴다(REL-06 "불일치 시 정산 잠금 차단").
- 결제는 확인됐지만 KRWS 민팅이 아직 확정되지 않은 건이 남아 있으면 `COIN_MINT_PENDING`으로 막는다.
- 공통 비용이 순매출을 초과하면 분배액이 음수가 되므로 `RULE_COMMON_COST_EXCEEDS_REVENUE`다.
- 온체인 조회·기록이 걸리므로 `202 Accepted` + `jobId`다. 확정 시 정산 `NONE` → `AGGREGATED`, 팀별 `settlement_share`가 확정 저장된다. 산출→제출까지 ≤ 5분이 목표다(PERF-05).

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
없음.

### 시스템 처리
1. 생성자·ADMIN 권한 확인 → 공연 상태(`ENDED`)·정산 상태(`NONE`) 확인 → 미확정 mint 잔여 확인.
2. 상태 전이: `settlement` 생성/갱신, tx 확정 시 `NONE` → `AGGREGATED`.
3. 외부 호출(202): 컨트랙트 팀별 선택 카운터 조회 → 서버 집계와 대조 → 분배액 산출 → 산출 결과 온체인 기록(operator). 실패 3회 재시도, 최종 실패는 관리자 재처리.
4. `settlement`·`settlement_share`·`chain_job` 저장 + 감사 로그.

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": { "jobId": "chain_01J9E1K2L3", "status": "PENDING", "pollAfterMs": 2000, "performanceId": 12, "nextStatus": "AGGREGATED" },
  "msg": "집계 확정을 접수했습니다."
}
```

### 4xx/5xx
```json
{ "code": "SETTLEMENT_AGGREGATE_MISMATCH", "data": null, "msg": "집계 검증에 실패했습니다. 관리자 확인 후 정산이 진행됩니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자도 ADMIN도 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 409 | `PERFORMANCE_INVALID_STATUS` | 공연이 아직 `ENDED`가 아니거나 `CANCELLED` |
| 409 | `COMMON_CONFLICT` | 이미 `AGGREGATED` 이상이거나 집계 작업이 진행 중 |
| 409 | `COIN_MINT_PENDING` | 확정되지 않은 민팅 건이 남아 있음 |
| 409 | `SETTLEMENT_AGGREGATE_MISMATCH` | 온체인 카운터 합 ≠ 서버 집계 |
| 409 | `RULE_COMMON_COST_EXCEEDS_REVENUE` | 공통 비용 > 순매출 |
| 504 | `CHAIN_TX_TIMEOUT` | 온체인 확정 지연 — `jobId`로 계속 폴링 |

---

### API-settlement-03 정산 잠금(이의제기 시작)
`POST /api/v1/performances/{performanceId}/settlement/lock` · 권한: 생성자·ADMIN · 우선: P0 · 연관 화면: `P-08 정산 대시보드` · 연관 기능: 정산 잠금·이의제기 기간 시작

## 요구사항
- `AGGREGATED` 상태에서만 실행한다. 잠금 즉시 팀별 분배액이 고정되고 **48시간 이의제기 기간**이 시작된다 [권] P-9·P-16.
- 잠금 이후 개별 환불은 앱에서 막힌다(`REFUND_AFTER_SETTLEMENT_LOCK`) — 온체인 회수가 불가하기 때문이다.
- 온체인 기록이 필요하므로 `202 Accepted` + `jobId`다. 확정 시 정산 `AGGREGATED` → `LOCKED`이고, 동시에 이의제기 창이 열려 조회 응답에서는 `DISPUTE_OPEN`으로 표시된다.
- 온체인 카운터 불일치 상태(`counterMatched: false`)에서는 잠글 수 없다(REL-06).

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
없음.

### 시스템 처리
1. 생성자·ADMIN 권한 확인 → 정산 상태(`AGGREGATED`)·카운터 일치 확인.
2. 상태 전이: tx 확정 시 `AGGREGATED` → `LOCKED`, `disputeClosesAt = now + 48h` 설정(`DISPUTE_OPEN` 표시).
3. 외부 호출(202): operator가 컨트랙트에 분배액 확정·잠금 기록. 실패 3회 재시도 후 관리자 재처리.
4. `settlement` 갱신 + 참여팀 리더 알림 [권] + 감사 로그.

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": { "jobId": "chain_01J9E4M5N6", "status": "PENDING", "pollAfterMs": 2000, "performanceId": 12, "nextStatus": "LOCKED", "disputeClosesAt": "2026-09-22T18:00:00+09:00" },
  "msg": "정산을 잠갔습니다. 48시간 동안 이의제기를 받습니다."
}
```

### 4xx/5xx
```json
{ "code": "SETTLEMENT_NOT_LOCKED", "data": null, "msg": "집계가 확정되지 않아 정산을 실행할 수 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자도 ADMIN도 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 409 | `SETTLEMENT_NOT_LOCKED` | 정산이 아직 `AGGREGATED`가 아님(집계 미확정) |
| 409 | `SETTLEMENT_AGGREGATE_MISMATCH` | 카운터 불일치 상태 |
| 409 | `COMMON_CONFLICT` | 이미 `LOCKED` 이상이거나 잠금 작업 진행 중 |
| 409 | `PERFORMANCE_INVALID_STATUS` | 공연이 `CANCELLED`(정산 `HALTED`) |
| 500 | `CHAIN_GAS_INSUFFICIENT` | 운영지갑 가스 부족 |

---

### API-settlement-04 이의제기
`POST /api/v1/performances/{performanceId}/settlement/disputes` · 권한: 참여팀 리더 · 우선: P0 · 연관 화면: `P-08 정산 대시보드` · 연관 기능: 정산 이의제기

## 요구사항
- 참여팀 리더가 **잠금 후 48시간 안에** 사유를 제출한다 [권] P-16. 접수되면 release 자동 실행이 보류되고 관리자 검토(API-admin-06)로 넘어간다.
- 기간이 끝난 뒤의 제출은 막는다. 규격 v3에 전용 코드가 없어 `COMMON_CONFLICT`로 응답하고 `msg`로 사유를 설명한다(전용 코드는 §17 신설 제안).
- 팀당 동시에 열려 있는 이의는 1건이다. 중복 제출은 `COMMON_CONFLICT`다.
- 온체인 작업이 아니므로 `201 Created` 동기 응답이다.

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `teamId` | integer | Y | 요청자가 리더인 참여팀 | 이의를 제기하는 팀 |
| `reason` | string | Y | 10~1000자 | 이의 사유 |
| `expectedAmount` | integer | N | 0 이상 | 팀이 주장하는 정산액(참고용) |

```json
{ "teamId": 11, "reason": "관객 선택 집계가 현장 티켓 수와 맞지 않습니다. 재확인 요청합니다.", "expectedAmount": 320000 }
```

### 시스템 처리
1. 리더·참여팀 확인 → 정산 상태(`LOCKED`/`DISPUTE_OPEN`)·기간(48h) 확인 → 중복 이의 확인.
2. 상태 전이: `dispute` 생성(`OPEN`). 정산은 `DISPUTE_OPEN` 유지하고 **release 자동 스케줄을 보류**한다.
3. 외부 호출 없음.
4. `dispute` 저장 + 관리자 알림 + 감사 로그.

## Response
### 201 Created
```json
{
  "code": "SUCCESS",
  "data": { "disputeId": 41, "performanceId": 12, "teamId": 11, "status": "OPEN", "createdAt": "2026-09-21T09:12:00+09:00", "releaseHeld": true },
  "msg": "이의제기가 접수되었습니다. 관리자 검토 후 정산이 재개됩니다."
}
```

### 4xx
```json
{ "code": "COMMON_CONFLICT", "data": null, "msg": "이의제기 기간이 종료되었습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 사유 길이 위반 |
| 403 | `COMMON_FORBIDDEN` | 해당 팀 리더가 아님 |
| 403 | `SETTLEMENT_NOT_PARTICIPANT` | 참여팀이 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 409 | `SETTLEMENT_NOT_LOCKED` | 아직 잠금 전이라 이의 대상이 없음 |
| 409 | `SETTLEMENT_ALREADY_RELEASED` | 이미 release 완료 |
| 409 | `COMMON_CONFLICT` | 이의제기 기간 종료, 같은 팀의 열린 이의 존재 (전용 코드는 §17 신설 제안) |

---

### API-settlement-05 release 실행
`POST /api/v1/performances/{performanceId}/settlement/release` · 권한: 생성자·ADMIN(자동 스케줄 병행) · 우선: P0 · 연관 화면: `P-08 정산 대시보드` · 연관 기능: 정산 release 실행

## 요구사항
- 이의제기 48시간이 지나면 **자동 스케줄이 실행**하고, 이 API는 같은 동작의 수동 트리거다 [권] P-9. 기간 중 호출은 `SETTLEMENT_DISPUTE_PERIOD`(`msg`에 종료 시각 표기)다.
- 열려 있는 이의(`OPEN`)가 있으면 자동 실행이 보류되고 수동 호출도 막힌다. 관리자가 이의를 처리(API-admin-06)해야 재개된다 [권] P-16.
- 컨트랙트가 팀 지갑으로 **KRWS를 실제 전송**한다(옵션 B). 확정 시 정산 `LOCKED`/`DISPUTE_OPEN` → `RELEASED`.
- release 직후 **팀별 자동 환급(push)** 이 이어진다 [권] P-10 — `이체 성공 확인 → burn` 순서다(§13 redeem). 전 팀 환급 완료 시 `REDEEMED`가 된다.
- 팀별 부분 성공을 허용한다. 실패 건은 `data.results`에 `retryable`로 표시하고 관리자 재시도(API-redeem-02) 대상이 된다(규격 v3 부분 성공, REL-05).
- `Idempotency-Key`가 필수다 — 이중 release는 준비금·정산 정합을 깨뜨린다.
- 준비금 1:1이 깨진 상태에서는 실행하지 않는다(`COIN_RESERVE_MISMATCH`, P-11).

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`
- `Idempotency-Key: {UUIDv4}` **필수**

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `note` | string | N | 최대 200자 | 수동 실행 사유(감사 로그) |

```json
{ "note": "이의 처리 완료 후 수동 실행" }
```

### 시스템 처리
1. 권한·멱등키 확인 → 정산 상태(`LOCKED`/`DISPUTE_OPEN`)·이의제기 기간 종료·열린 이의 없음·팀 정산 계좌 등록 여부·준비금 상태 확인.
2. 상태 전이: tx 확정 시 `LOCKED`/`DISPUTE_OPEN` → `RELEASED`. 환급 완료 시 `REDEEMED`.
3. 외부 호출(202): ① operator가 `release()` 호출 → 팀 지갑으로 KRWS 전송 → ② 팀별 자동 환급 큐 등록(금융망 이체 → 성공 확인 후 `burnFrom`). 실패는 3회 재시도, 최종 실패는 `REDEEM_BANK_TRANSFER_FAILED`·`COIN_BURN_FAILED`로 남기고 관리자 재처리(`M-02`).
4. `settlement`·`redemption`·`chain_job`·`coin_job` 저장 + 감사 로그(SEC-11).

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": {
    "jobId": "chain_01J9F7P8Q9",
    "status": "PENDING",
    "pollAfterMs": 2500,
    "performanceId": 12,
    "settlementId": 91,
    "nextStatus": "RELEASED",
    "targetTeamCount": 3,
    "totalAmount": 1225000
  },
  "msg": "정산 실행을 접수했습니다. 팀별 환급이 이어집니다."
}
```

부분 성공은 `GET /api/v1/chain/jobs/{jobId}` 응답의 `results`로 확인한다.

```json
{
  "code": "SUCCESS",
  "data": {
    "settlementId": 91,
    "results": [
      { "teamId": 7, "amount": 572942, "status": "TRANSFERRED", "txId": "FIN-8821" },
      { "teamId": 9, "amount": 364309, "status": "FAILED", "reason": "REDEEM_BANK_TRANSFER_FAILED", "retryable": true }
    ]
  },
  "msg": ""
}
```

### 4xx/5xx
```json
{ "code": "SETTLEMENT_DISPUTE_PERIOD", "data": null, "msg": "이의제기 기간이 끝난 뒤 정산할 수 있습니다. (2026-09-22 18:00 이후)" }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `Idempotency-Key` 헤더 없음 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자도 ADMIN도 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 409 | `SETTLEMENT_NOT_LOCKED` | 집계·잠금 전 |
| 409 | `SETTLEMENT_DISPUTE_PERIOD` | 이의제기 48시간 경과 전 또는 열린 이의 존재 |
| 409 | `SETTLEMENT_ALREADY_RELEASED` | 이미 release 완료 |
| 409 | `REDEEM_ACCOUNT_NOT_REGISTERED` | 참여팀 중 정산 계좌 미등록 팀 존재 |
| 409 | `COIN_ESCROW_INSUFFICIENT` | 공연 에스크로 잔액 < 분배 합계(대사 점검 대상) |
| 409 | `COIN_RESERVE_MISMATCH` | 준비금 1:1 불일치로 release 중단 상태 |
| 409 | `COMMON_CONFLICT` | 같은 멱등키에 다른 본문, release 작업 진행 중 |
| 500 | `CHAIN_GAS_INSUFFICIENT` | 운영지갑 가스 부족 |
| 504 | `CHAIN_TX_TIMEOUT` | 확정 지연 — `jobId`로 계속 폴링 |

---

## 13. redeem — 환급

release 시 **자동 push**다 [권] P-10 — 팀 출금 버튼은 없고 이력 조회만 있다. 순서는 **금융망 원화 이체 성공 확인 → KRWS `burnFrom`**이며 반대로 하면 이체 실패 시 토큰만 사라져 준비금 증명이 깨진다(지갑 문서). Redemption 상태(§1.5): `PENDING` → `TRANSFERRED` / `FAILED`.

### API-redeem-01 환급 이력
`GET /api/v1/teams/{teamId}/redemptions` · 권한: 리더 · 우선: P0 · 연관 화면: `P-09 환급 이력` · 연관 기능: 팀 환급 이력 조회

## 요구사항
- 공연별 자동 환급 결과를 최신순으로 준다 — 금액, 상태, **금융망 이체 ID**, burn tx 해시와 익스플로러 링크, 실패 사유.
- 실패 건은 `retryable`로 표시하되 재시도 버튼은 관리자 화면(M-02)에만 둔다. 팀 화면에는 "확인 후 순차 처리" 안내만 노출한다 [권] P-10.
- 리더만 조회한다 — 계좌·이체 정보가 포함되기 때문이다(SEC-03).

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `teamId` | path | integer(BIGINT) | Y | 팀 PK |
| `status` | query | string | N | `PENDING`/`TRANSFERRED`/`FAILED` |
| `page` | query | integer | N | 0-base, 기본 0 |
| `size` | query | integer | N | 기본 20, 최대 100 |

### Body
없음.

### 시스템 처리
1. 팀 존재·리더 권한 확인 → 쿼리 검증.
2. 상태 전이 없음(조회).
3. 외부 호출 없음(인덱싱된 `redemption`·`coin_job` 사용).
4. `redemption` 조회 후 `items`/`pageInfo`.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "items": [
      {
        "redemptionId": 6601,
        "performanceId": 12,
        "performanceTitle": "합정 3밴드 합동공연",
        "amount": 572942,
        "status": "TRANSFERRED",
        "bankTransferId": "FIN-8821",
        "accountNoMasked": "****3311",
        "burnTxHash": "0x2c4e6a8091b3d5f70192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8",
        "explorerUrl": "https://amoy.polygonscan.com/tx/0x2c4e6a8091b3d5f70192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8",
        "failureReason": null,
        "retryable": false,
        "transferredAt": "2026-09-22T18:04:20+09:00"
      }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 1, "hasNext": false }
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "COMMON_FORBIDDEN", "data": null, "msg": "이 작업을 수행할 권한이 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `status`, `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `COMMON_FORBIDDEN` | 해당 팀 리더가 아님 |
| 404 | `TEAM_NOT_FOUND` | 존재하지 않는 `teamId` |

---

### API-redeem-02 환급 재시도
`POST /api/v1/admin/redemptions/{redemptionId}/retry` · 권한: ADMIN · 우선: P0 · 연관 화면: `M-02 정산·작업 관리` · 연관 기능: 환급 재시도

## 요구사항
- 자동 재시도 3회를 소진하고 `FAILED`로 남은 환급을 관리자가 다시 태운다(REL-09).
- 실패 지점에 따라 재개 위치가 다르다 — **이체 실패**(`REDEEM_BANK_TRANSFER_FAILED`)면 이체부터, **소각 실패**(`COIN_BURN_FAILED`)면 소각부터 재개한다. 이미 나간 이체를 다시 보내지 않는 것이 핵심이다.
- 팀 정산 계좌가 없으면 `REDEEM_ACCOUNT_NOT_REGISTERED`로 막고 팀에 등록을 요청한다.
- `Idempotency-Key`가 필수다 — 이중 이체는 준비금 정합을 깨뜨린다.
- 온체인·금융망 호출이 이어지므로 `202 Accepted`이며 같은 `redemptionId`의 상태가 `PENDING`으로 되돌아간다.

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`
- `Idempotency-Key: {UUIDv4}` **필수**

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `redemptionId` | path | integer(BIGINT) | Y | 환급 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `note` | string | N | 최대 200자 | 재처리 사유(감사 로그) |

```json
{ "note": "금융망 일시 오류, 복구 후 재실행" }
```

### 시스템 처리
1. ADMIN 권한·멱등키 확인 → 환급 존재·상태(`FAILED`)·재개 지점 판별 → 팀 정산 계좌 확인.
2. 상태 전이: `redemption` `FAILED` → `PENDING`. 성공 시 `TRANSFERRED`, 해당 공연의 전 팀 완료 시 정산 `RELEASED` → `REDEEMED`.
3. 외부 호출(202): 재개 지점부터 ① 금융망 원화 이체 → ② **이체 성공 확인 후** burner가 `burnFrom`. 실패 3회 재시도.
4. `redemption`·`coin_job` 갱신 + 관리자 작업 감사 로그(SEC-11).

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": { "jobId": "burn_01J9G2R3S4", "status": "PENDING", "pollAfterMs": 2000, "redemptionId": 6602, "resumeFrom": "BANK_TRANSFER", "amount": 364309 },
  "msg": "환급 재시도를 접수했습니다."
}
```

### 4xx/5xx
```json
{ "code": "REDEEM_ACCOUNT_NOT_REGISTERED", "data": null, "msg": "환급받을 계좌를 먼저 등록해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `Idempotency-Key` 헤더 없음 |
| 403 | `COMMON_FORBIDDEN` | ADMIN이 아님 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 `redemptionId` |
| 409 | `REDEEM_NOTHING_TO_REDEEM` | 환급할 잔액이 없음(이미 소각 완료) |
| 409 | `REDEEM_ACCOUNT_NOT_REGISTERED` | 팀 정산 계좌 미등록 |
| 409 | `REDEEM_ALREADY_REQUESTED` | 재시도 작업이 이미 진행 중 |
| 409 | `COMMON_CONFLICT` | 이미 `TRANSFERRED`, 멱등키 본문 불일치 |
| 500 | `COIN_BURN_FAILED` | 이체 후 소각 최종 실패 — 즉시 알림 대상 |
| 502 | `REDEEM_BANK_TRANSFER_FAILED` | 금융망 이체 재시도 실패 |

---

## 14. verify — 공개 검증

비로그인으로 열린다. 브라우저가 **서버 표시값을 믿지 않고 독립적으로 재계산**할 수 있도록 원자료를 전부 담는 것이 이 절의 목적이다(기획 §8.3 신뢰 보강 ③, PERF-07 재계산 ≤ 2초). 보장 범위는 정직하게 표기한다 — 잠긴 규칙의 사후 변조 불가·기록의 소급 수정 불가·계산의 결정론적 재현이며, **입력 데이터의 진실성은 보장하지 않는다**(기획 §8.3).

### API-verify-01 공개 검증 데이터
`GET /api/v1/public/performances/{performanceId}/verification` · 권한: GUEST(인증 불필요) · 우선: P0 · 연관 화면: `V-01 공개 정산 검증` · 연관 기능: 공개 정산 검증 데이터 조회

## 요구사항
- 컨트랙트 주소·잠긴 규칙(원문 + 해시)·팀별 동의 tx·온체인 선택 카운터·팀별 산출액·release tx·대사 결과(불일치 건수)와 **재계산에 필요한 원자료**를 한 응답에 담는다. 브라우저 위젯이 `(잠긴 가중치 × 온체인 카운터)`를 다시 계산해 서버 표시값과 대조할 수 있어야 한다.
- 재계산 입력은 `recalculationInput`으로 모아 준다 — 순매출, 공통 비용, bp 3항목, 팀별 온체인 카운터, 반올림 규칙, 잔여 원 배분 규칙. 이 값들만으로 `shares`가 재현되어야 한다.
- 온체인–금융망 대사 결과(`Released`·`Redeemed` 이벤트 vs 금융망 이체 내역)를 `reconciliation`으로 담고 불일치 건수를 명시한다(REL-02 "대사 불일치 0건").
- 개인정보는 담지 않는다 — 관객·주문·티켓 식별자는 노출하지 않고 팀 단위 집계만 준다.
- 인증이 필요 없고 캐시가 크게 이득이므로 **60초 캐시**한다 [권]. `DRAFT`·`PENDING_AGREEMENT` 공연은 공개하지 않는다.

## Request
### Headers
- `Accept: application/json`
- (인증 헤더 불필요)

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
없음.

### 시스템 처리
1. 공연 존재·공개 대상 상태(`ON_SALE` 이상) 확인 → 캐시(60초) 확인.
2. 상태 전이 없음(조회).
3. 외부 호출: 인덱싱된 온체인 이벤트·카운터를 사용하고, 캐시 미스 시에만 노드를 조회한다(PERF-07). 노드 장애 시 마지막 인덱싱 값과 `stale: true`.
4. 규칙 원문·해시·tx·집계·대사 결과를 합쳐 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "performanceTitle": "합정 3밴드 합동공연",
    "performedAt": "2026-09-19T19:00:00+09:00",
    "settlementStatus": "REDEEMED",
    "network": "polygon-amoy",
    "contracts": {
      "revenueSplitter": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
      "krwsToken": "0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736",
      "explorerBaseUrl": "https://amoy.polygonscan.com"
    },
    "lockedRule": {
      "rulesHash": "0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f",
      "raw": { "performanceId": 12, "commonCost": 300000, "equalRatioBp": 4000, "choiceRatioBp": 5000, "plannerRatioBp": 1000, "plannerTeamId": 7, "participantTeamIds": [7, 9, 11] },
      "lockedAt": "2026-08-29T11:00:00+09:00",
      "startSaleTxHash": "0x8f2e1d0c9b8a70695847362514039281a0b1c2d3e4f5061728394a5b6c7d8e9f"
    },
    "agreements": [
      { "teamId": 7, "teamName": "블루노트", "walletAddress": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b", "txHash": "0x1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f901", "agreedAt": "2026-08-29T10:02:00+09:00" },
      { "teamId": 9, "teamName": "새벽세시", "walletAddress": "0x3c8a1f2b4d6e8091a2b3c4d5e6f708192a3b4c5d", "txHash": "0x2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90112", "agreedAt": "2026-08-29T10:20:00+09:00" },
      { "teamId": 11, "teamName": "노이즈캔슬", "walletAddress": "0x9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6f7081920", "txHash": "0x3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9011223", "agreedAt": "2026-08-29T10:41:00+09:00" }
    ],
    "onchainCounters": [
      { "teamId": 7, "choiceCount": 30 },
      { "teamId": 9, "choiceCount": 21 },
      { "teamId": 11, "choiceCount": 13 }
    ],
    "recalculationInput": {
      "grossRevenue": 1600000,
      "refundedAmount": 75000,
      "netRevenue": 1525000,
      "commonCost": 300000,
      "distributableAmount": 1225000,
      "equalRatioBp": 4000,
      "choiceRatioBp": 5000,
      "plannerRatioBp": 1000,
      "plannerTeamId": 7,
      "participantCount": 3,
      "totalChoiceCount": 64,
      "roundingRule": "FLOOR_TO_INTEGER_KRW",
      "remainderRule": "ASSIGN_TO_LARGEST_CHOICE_COUNT_TEAM",
      "tokenDecimals": 0
    },
    "shares": [
      { "teamId": 7, "teamName": "블루노트", "equalAmount": 163333, "choiceAmount": 287109, "plannerAmount": 122500, "totalAmount": 572942 },
      { "teamId": 9, "teamName": "새벽세시", "equalAmount": 163333, "choiceAmount": 200976, "plannerAmount": 0, "totalAmount": 364309 },
      { "teamId": 11, "teamName": "노이즈캔슬", "equalAmount": 163334, "choiceAmount": 124415, "plannerAmount": 0, "totalAmount": 287749 }
    ],
    "releaseTx": {
      "txHash": "0x9c1a4b7e2d5f8039ab6c4e1d2f3a5b7c9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6",
      "explorerUrl": "https://amoy.polygonscan.com/tx/0x9c1a4b7e2d5f8039ab6c4e1d2f3a5b7c9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6",
      "releasedAt": "2026-09-22T18:00:30+09:00"
    },
    "reconciliation": {
      "onchainReleasedTotal": 1225000,
      "bankTransferredTotal": 1225000,
      "mismatchCount": 0,
      "checkedAt": "2026-09-22T18:10:00+09:00",
      "items": [
        { "teamId": 7, "onchainAmount": 572942, "bankAmount": 572942, "bankTransferId": "FIN-8821", "matched": true },
        { "teamId": 9, "onchainAmount": 364309, "bankAmount": 364309, "bankTransferId": "FIN-8822", "matched": true },
        { "teamId": 11, "onchainAmount": 287749, "bankAmount": 287749, "bankTransferId": "FIN-8823", "matched": true }
      ]
    },
    "guarantees": {
      "guaranteed": ["잠긴 규칙의 사후 변조 불가", "기록의 소급 수정 불가", "분배 계산의 결정론적 재현", "참여팀의 독립 검증 경로"],
      "notGuaranteed": ["입력 데이터(선택·매출)의 진실성"]
    },
    "simulationNotice": "테스트넷 모의 발행·모의 정산입니다.",
    "refreshedAt": "2026-09-22T18:12:00+09:00",
    "stale": false
  },
  "msg": ""
}
```

### 4xx/5xx
```json
{ "code": "PERFORMANCE_NOT_FOUND", "data": null, "msg": "공연을 찾을 수 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않거나 아직 공개 대상이 아닌 공연(`DRAFT`·`PENDING_AGREEMENT`) |
| 429 | `COMMON_TOO_MANY_REQUESTS` | 호출 한도 초과 |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | 체인 인덱스·노드 모두 사용 불가 |

---

### API-verify-02 준비금 증명
`GET /api/v1/public/reserve-proof` · 권한: GUEST(인증 불필요) · 우선: P0 · 연관 화면: `V-02 준비금 증명` · 연관 기능: 준비금 증명 조회

## 요구사항
- **금융망 에스크로 계좌 잔액 vs KRWS 총 유통량**, 갱신 시각, 1:1 성립 여부를 준다 [권] P-11 / REL-03.
- 조회 주기는 **≤ 1분**이며 결과를 1분 캐시한다. 응답에 `refreshedAt`과 `nextRefreshAt`을 담아 화면이 "언제 기준 값인지"를 표기한다.
- 불일치가 확인되면 `reserveMatched: false`와 차액을 담고, 서버는 mint를 중단하며 관리자에게 알린다. 조회 자체는 200으로 성공시킨다 [권].
- 잔액 조회값이 서버를 경유한다는 한계를 응답에 명시해 발표에서 그대로 인용할 수 있게 한다(기획 §8.4 "새 신뢰 지점").
- 공연별 에스크로 내역도 함께 줘 합이 총 유통량과 맞는지 브라우저가 확인할 수 있게 한다.

## Request
### Headers
- `Accept: application/json`
- (인증 헤더 불필요)

### Path · Query
없음.

### Body
없음.

### 시스템 처리
1. 캐시(1분) 확인.
2. 상태 전이 없음(조회). 불일치 확인 시 mint 중단 플래그를 세우고 알림을 발송한다.
3. 외부 호출: 체인 노드 `totalSupply` + 공연별 에스크로 잔액, 금융망 에스크로 계좌 잔액 조회.
4. 캐시 갱신 후 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "escrowBalance": 4820000,
    "totalSupply": 4820000,
    "difference": 0,
    "reserveMatched": true,
    "ratio": "1:1",
    "network": "polygon-amoy",
    "tokenAddress": "0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736",
    "tokenDecimals": 0,
    "escrowAccountMasked": "국민 ****9900",
    "perPerformance": [
      { "performanceId": 12, "escrowAmount": 1225000 },
      { "performanceId": 14, "escrowAmount": 3595000 }
    ],
    "refreshedAt": "2026-09-22T18:12:00+09:00",
    "nextRefreshAt": "2026-09-22T18:13:00+09:00",
    "stale": false,
    "disclosure": "잔액 조회값은 플랫폼 서버를 경유합니다. 테스트넷 모의 발행이며 실제 자금이 아닙니다.",
    "mintHalted": false
  },
  "msg": ""
}
```

### 4xx/5xx
```json
{ "code": "COMMON_EXTERNAL_SERVICE_ERROR", "data": null, "msg": "외부 시스템 연동 중 오류가 발생했습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 429 | `COMMON_TOO_MANY_REQUESTS` | 호출 한도 초과 |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | 체인·금융망 조회 모두 실패하고 캐시도 없음 |

---

## 15. admin — 관리자

관리자 전용 도메인이라 도메인 전용 에러 코드가 없고 `COMMON_*`을 쓴다(계획 §1.3). 모든 관리자 작업은 append-only 감사 로그 대상이다(SEC-11). 실패 작업 재처리 경로(`M-02`)가 REL-09의 "수동 재처리"를 담당한다. **API-admin-03(회원 상태 변경)은 계획 §1.7에서 P1이라 이 절에 상세를 두지 않고 §16 P1 예약 경로에만 적었다** — 이 절의 상세는 API-admin-01·02·04~08 7개다.

### API-admin-01 관리자 요약
`GET /api/v1/admin/dashboard` · 권한: ADMIN · 우선: P0 · 연관 화면: `M-01 관리자 대시보드` · 연관 기능: 관리자 대시보드 조회

## 요구사항
- 회원·공연·정산·운영지갑 요약과 **실패 작업 수**를 한 번에 준다. M-01이 이 응답 하나로 그려진다.
- 실패 작업 수는 mint/burn·환급·체인 tx를 구분해 담아 M-02로 바로 진입할 수 있게 한다.
- 준비금 1:1 상태와 운영지갑 가스 임계 충족 여부를 상단 경고로 쓸 수 있게 포함한다(REL-03, AVAIL-06).
- 집계 비용이 크므로 **30초 캐시**한다 [권].

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
없음.

### Body
없음.

### 시스템 처리
1. ADMIN 권한 확인 → 캐시(30초) 확인.
2. 상태 전이 없음(조회).
3. 외부 호출: 운영지갑 가스·준비금 요약(캐시 재사용). 실패 시 해당 블록만 `stale: true`.
4. 집계 결과 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "members": { "total": 412, "newToday": 9 },
    "performances": { "onSale": 6, "saleClosed": 2, "ended": 11, "cancelled": 1 },
    "settlements": { "aggregated": 1, "locked": 2, "disputeOpen": 1, "released": 8, "redeemed": 7, "halted": 1 },
    "failedJobs": { "coinJobs": 2, "redemptions": 1, "chainJobs": 0 },
    "openDisputes": 1,
    "reserve": { "reserveMatched": true, "escrowBalance": 4820000, "totalSupply": 4820000, "mintHalted": false },
    "operatorWallet": { "gasSufficient": true, "belowThresholdWallets": 0 },
    "refreshedAt": "2026-09-22T18:15:00+09:00"
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "COMMON_FORBIDDEN", "data": null, "msg": "이 작업을 수행할 권한이 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `COMMON_FORBIDDEN` | ADMIN이 아님 |

---

### API-admin-02 회원 목록
`GET /api/v1/admin/members` · 권한: ADMIN · 우선: P0 · 연관 화면: `M-03 회원·공연 관리` · 연관 기능: 회원 목록 조회(관리)

## 요구사항
- 이메일·이름·역할·상태로 회원을 검색한다. 개인정보 최소 노출 원칙에 따라 연락처는 마스킹한다 [권].
- 소속 팀 수와 최근 로그인 시각을 담아 문제 계정을 빠르게 찾을 수 있게 한다.
- 조회 자체도 감사 로그 대상이다(SEC-11).

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `keyword` | query | string | N | 최대 50자. 이메일·이름 부분 일치 |
| `role` | query | string | N | `AUDIENCE`/`PERFORMER`/`ADMIN` |
| `status` | query | string | N | `ACTIVE`/`SUSPENDED`/`WITHDRAWN` |
| `page` | query | integer | N | 0-base, 기본 0 |
| `size` | query | integer | N | 기본 20, 최대 100 |
| `sort` | query | string | N | `createdAt,desc`(기본) / `createdAt,asc` |

### Body
없음.

### 시스템 처리
1. ADMIN 권한 확인 → 쿼리 검증.
2. 상태 전이 없음(조회).
3. 외부 호출 없음.
4. `member` 조회 후 `items`/`pageInfo`, 조회 감사 로그 기록.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "items": [
      { "memberId": 1024, "email": "audience@ssafy.io", "name": "김관객", "phoneMasked": "010-****-5678", "roles": ["AUDIENCE", "PERFORMER"], "status": "ACTIVE", "teamCount": 1, "lastLoginAt": "2026-09-22T09:12:00+09:00", "createdAt": "2026-08-20T10:11:00+09:00" }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 412, "hasNext": true }
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "COMMON_VALIDATION_FAILED", "data": null, "msg": "조회 조건을 다시 확인해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `role`·`status`·`sort`, `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `COMMON_FORBIDDEN` | ADMIN이 아님 |

---

### API-admin-04 공연 목록(관리)
`GET /api/v1/admin/performances` · 권한: ADMIN · 우선: P0 · 연관 화면: `M-03 회원·공연 관리` · 연관 기능: 공연 목록 조회(관리)

## 요구사항
- 상태·기간·주최팀·키워드로 전체 공연을 조회한다. 공개 목록(API-performance-02)과 달리 `DRAFT`·`CANCELLED`까지 전부 보인다.
- 각 행에 정산 상태와 실패 작업 수를 담아 문제 공연을 바로 찾을 수 있게 한다.

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `keyword` | query | string | N | 최대 50자. 제목·주최팀명 |
| `status` | query | string | N | `DRAFT`/`PENDING_AGREEMENT`/`ON_SALE`/`SALE_CLOSED`/`ENDED`/`CANCELLED` |
| `settlementStatus` | query | string | N | `NONE`/`AGGREGATED`/`LOCKED`/`DISPUTE_OPEN`/`RELEASED`/`REDEEMED`/`HALTED` |
| `from` | query | string(ISO 8601 date) | N | 공연일 시작 |
| `to` | query | string(ISO 8601 date) | N | 공연일 종료 |
| `page` | query | integer | N | 0-base, 기본 0 |
| `size` | query | integer | N | 기본 20, 최대 100 |

### Body
없음.

### 시스템 처리
1. ADMIN 권한 확인 → 쿼리 검증.
2. 상태 전이 없음(조회).
3. 외부 호출 없음.
4. `performance` + `settlement` 조인 후 `items`/`pageInfo`.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "items": [
      { "performanceId": 12, "title": "합정 3밴드 합동공연", "hostTeamName": "블루노트", "startAt": "2026-09-19T19:00:00+09:00", "status": "ENDED", "settlementStatus": "REDEEMED", "participantCount": 3, "paidTicketCount": 61, "grossRevenue": 1600000, "failedJobCount": 0 }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 20, "hasNext": false }
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "COMMON_FORBIDDEN", "data": null, "msg": "이 작업을 수행할 권한이 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `status`·`settlementStatus`, 기간 역전, `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `COMMON_FORBIDDEN` | ADMIN이 아님 |

---

### API-admin-05 정산 목록·실패 건
`GET /api/v1/admin/settlements` · 권한: ADMIN · 우선: P0 · 연관 화면: `M-02 정산·작업 관리` · 연관 기능: 정산 목록·실패 건 조회

## 요구사항
- 정산 상태별 목록과 **실패한 환급·소각 건**을 함께 준다. 실패 건에는 `redemptionId`·`jobId`를 담아 API-redeem-02·API-coin-03로 바로 넘어갈 수 있게 한다.
- 대사 불일치(`counterMatched: false`, `reconciliationMismatchCount > 0`)를 우선 노출한다(REL-02·REL-06).
- 열린 이의제기 건수를 함께 담아 API-admin-06 처리 대상을 찾게 한다.

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `status` | query | string | N | `NONE`/`AGGREGATED`/`LOCKED`/`DISPUTE_OPEN`/`RELEASED`/`REDEEMED`/`HALTED` |
| `hasFailure` | query | boolean | N | `true`면 실패 건이 있는 정산만 |
| `page` | query | integer | N | 0-base, 기본 0 |
| `size` | query | integer | N | 기본 20, 최대 100 |

### Body
없음.

### 시스템 처리
1. ADMIN 권한 확인 → 쿼리 검증.
2. 상태 전이 없음(조회).
3. 외부 호출 없음(인덱싱 결과 사용).
4. `settlement` + `redemption` + `coin_job` 집계 후 `items`/`pageInfo`.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "items": [
      {
        "settlementId": 91,
        "performanceId": 12,
        "performanceTitle": "합정 3밴드 합동공연",
        "status": "RELEASED",
        "distributableAmount": 1225000,
        "counterMatched": true,
        "reconciliationMismatchCount": 0,
        "openDisputeCount": 0,
        "failures": [
          { "kind": "REDEMPTION", "redemptionId": 6602, "teamId": 9, "amount": 364309, "failureReason": "REDEEM_BANK_TRANSFER_FAILED", "retryable": true }
        ]
      }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 12, "hasNext": false }
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "COMMON_FORBIDDEN", "data": null, "msg": "이 작업을 수행할 권한이 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `status`, `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `COMMON_FORBIDDEN` | ADMIN이 아님 |

---

### API-admin-06 이의제기 처리
`PATCH /api/v1/admin/disputes/{disputeId}` · 권한: ADMIN · 우선: P0 · 연관 화면: `M-02 정산·작업 관리` · 연관 기능: 이의제기 처리

## 요구사항
- 열린 이의를 `RESOLVED` 또는 `REJECTED`로 처리한다 [권] P-16. 처리 결과와 사유는 참여팀에게 공개된다.
- **`REJECTED`이면 release 보류가 풀려** 자동 스케줄이 재개된다. `RESOLVED`(이의 인정)이면 재집계가 필요하므로 자동 재개하지 않고 관리자가 `settlement/aggregate`부터 다시 진행한다 [권].
- 이미 처리된 이의는 다시 바꿀 수 없다(`COMMON_CONFLICT`).
- release가 이미 실행된 정산의 이의는 처리 대상이 아니다.

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `disputeId` | path | integer(BIGINT) | Y | 이의제기 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `status` | string | Y | `RESOLVED` / `REJECTED` | 처리 결과 |
| `adminComment` | string | Y | 10~1000자 | 처리 사유 — 참여팀에 공개 |

```json
{ "status": "REJECTED", "adminComment": "온체인 카운터와 서버 집계가 일치하며 재확인 결과 이상이 없어 기각합니다." }
```

### 시스템 처리
1. ADMIN 권한 확인 → 이의 존재·상태(`OPEN`)·해당 정산 상태 확인.
2. 상태 전이: `dispute` `OPEN` → `RESOLVED`/`REJECTED`. `REJECTED`이고 남은 열린 이의가 없으면 정산의 release 보류 해제.
3. 외부 호출 없음(release 실행은 스케줄러 또는 API-settlement-05).
4. `dispute` 갱신 + 참여팀 알림 + 관리자 작업 감사 로그(SEC-11).

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": { "disputeId": 41, "performanceId": 12, "teamId": 11, "status": "REJECTED", "releaseHeld": false, "resolvedAt": "2026-09-22T17:40:00+09:00" },
  "msg": "이의제기를 처리했습니다."
}
```

### 4xx
```json
{ "code": "COMMON_CONFLICT", "data": null, "msg": "이미 처리된 이의제기입니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `status`, 사유 길이 위반 |
| 403 | `COMMON_FORBIDDEN` | ADMIN이 아님 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 `disputeId` |
| 409 | `COMMON_CONFLICT` | 이미 처리된 이의 |
| 409 | `SETTLEMENT_ALREADY_RELEASED` | 해당 정산이 이미 release 완료 |

---

### API-admin-07 운영지갑 상태
`GET /api/v1/admin/operator-wallet` · 권한: ADMIN · 우선: P0 · 연관 화면: `M-04 운영지갑·감사 로그` · 연관 기능: 운영지갑 상태 조회

## 요구사항
- **minter/burner와 operator 두 지갑**의 주소·가스 잔액·nonce·보유 권한을 준다. 권한 분리가 실제로 유지되는지 화면에서 확인할 수 있어야 한다(SEC-05).
- 가스 임계(release 10회분) 미달 여부와 팀 지갑 중 임계 미달 목록을 함께 담는다(AVAIL-06).
- nonce 직렬 큐의 대기 건수를 담아 `CHAIN_NONCE_CONFLICT` 조짐을 미리 본다(지갑 문서 "지금 잡을 것" 2항).
- 개인키·니모닉은 어떤 경우에도 응답에 담지 않는다(SEC-04).

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
없음.

### Body
없음.

### 시스템 처리
1. ADMIN 권한 확인.
2. 상태 전이 없음(조회).
3. 외부 호출: 체인 노드에서 두 운영지갑의 잔액·nonce 조회(10초 캐시). 노드 오류 시 마지막 값 + `stale: true`.
4. 큐 대기 건수·팀 지갑 임계 미달 목록과 함께 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "network": "polygon-amoy",
    "wallets": [
      { "role": "MINTER_BURNER", "address": "0xb1c2d3e4f5061728394a5b6c7d8e9f0011223344", "gasBalanceWei": "412000000000000000", "gasSufficient": true, "nonce": 184, "grants": ["MINTER_ROLE", "BURNER_ROLE"] },
      { "role": "OPERATOR", "address": "0x1f2e3d4c5b6a79880192a3b4c5d6e7f809112233", "gasBalanceWei": "233000000000000000", "gasSufficient": true, "nonce": 902, "grants": ["OPERATOR_ROLE"] }
    ],
    "roleSeparationOk": true,
    "pendingTxQueueSize": 0,
    "teamWalletsBelowThreshold": [],
    "refreshedAt": "2026-09-22T18:16:00+09:00",
    "stale": false
  },
  "msg": ""
}
```

### 4xx/5xx
```json
{ "code": "CHAIN_GAS_INSUFFICIENT", "data": null, "msg": "요청을 처리할 수 없습니다. 관리자에게 문의해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `COMMON_FORBIDDEN` | ADMIN이 아님 |
| 500 | `CHAIN_GAS_INSUFFICIENT` | 운영지갑 가스가 임계 미달이라 알림과 함께 반환(대시보드 경고용) |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | 체인 노드 조회 실패하고 캐시도 없음 |

---

### API-admin-08 감사 로그
`GET /api/v1/admin/audit-logs` · 권한: ADMIN · 우선: P0 · 연관 화면: `M-04 운영지갑·감사 로그` · 연관 기능: 감사 로그 조회

## 요구사항
- **관리자 작업·키 복호화·mint/burn·release 전건**을 append-only로 기록한 로그를 검색한다(SEC-11).
- 행위자·대상·시각·결과·요청 식별자로 필터한다. 수정·삭제 API는 만들지 않는다.
- 로그 본문에 개인키·계좌번호 원문·토큰 원문을 담지 않는다(SEC-04·SEC-09). 대상 식별자와 마스킹 값만 남긴다.
- 기간 미지정 시 최근 7일로 제한해 과도한 스캔을 막는다 [권] PERF-01.

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `action` | query | string | N | 예: `WALLET_KEY_DECRYPT`, `COIN_MINT`, `COIN_BURN`, `SETTLEMENT_RELEASE`, `ADMIN_MEMBER_STATUS` |
| `actorMemberId` | query | integer | N | 행위자 회원 PK |
| `targetType` | query | string | N | `MEMBER`/`TEAM`/`PERFORMANCE`/`SETTLEMENT`/`WALLET` |
| `targetId` | query | integer | N | 대상 PK |
| `from` | query | string(ISO 8601) | N | 시작 시각. 미지정 시 7일 전 |
| `to` | query | string(ISO 8601) | N | 종료 시각. 미지정 시 현재 |
| `page` | query | integer | N | 0-base, 기본 0 |
| `size` | query | integer | N | 기본 20, 최대 100 |

### Body
없음.

### 시스템 처리
1. ADMIN 권한 확인 → 기간 기본값(7일)·범위 검증.
2. 상태 전이 없음(조회).
3. 외부 호출 없음.
4. `audit_log` 조회 후 `items`/`pageInfo`. 이 조회 자체도 로그로 남긴다.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "items": [
      {
        "auditLogId": 302911,
        "action": "WALLET_KEY_DECRYPT",
        "actorMemberId": 1024,
        "actorName": "김리더",
        "targetType": "WALLET",
        "targetId": 7,
        "detail": "agreeToRules 서명 (performanceId=12)",
        "result": "SUCCESS",
        "requestId": "req_01J9A2B3C4",
        "ip": "203.0.113.***",
        "createdAt": "2026-08-29T10:01:39+09:00"
      }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 1184, "hasNext": true }
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "COMMON_VALIDATION_FAILED", "data": null, "msg": "조회 조건을 다시 확인해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 기간 역전, 조회 범위 상한(90일) 초과, `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `COMMON_FORBIDDEN` | ADMIN이 아님 |

---

## 16. P1 예약 경로

MVP 이후 1차 확장(계획 §1.1 P1)이다. **경로·메서드·이름만 예약**하고 상세는 v1.1 이후에 채운다. 계획 §1.7의 P1은 **API-member-08(카카오 로그인)·API-admin-03(회원 상태 변경) 둘뿐**이며 번호를 그대로 쓴다. §1.7에 경로가 없는 항목(교환·월렛 패스·관람 기록·포토 티켓)은 **§17.2 신설 제안**에도 함께 올려 두었다 — 규격 v4·계획 v1.1에서 확정되기 전에는 구현하지 않는다.

| 번호 | 메서드 | 경로 | 이름 | actor | 화면 | 비고 |
|------|--------|------|------|-------|------|------|
| API-member-08 | POST | `/api/v1/auth/kakao` | 카카오 로그인 | GUEST | `C-01 로그인` | 계획 §1.7 등재. P0 승격 시 계획 §6 영향 매트릭스 P-1 행 적용 |
| (신설 제안) | POST | `/api/v1/tickets/{ticketId}/exchanges` | 티켓 교환(옵션 변경) 요청 | AUDIENCE | `A-08 티켓 상세·QR` | 차액은 금융망 결제·환불. 코드 `EXCHANGE_*`는 규격 v3 §3.16에 이미 존재 |
| (신설 제안) | GET | `/api/v1/tickets/{ticketId}/exchanges/{exchangeId}` | 교환 상태 조회 | AUDIENCE | `A-08 티켓 상세·QR` | — |
| (신설 제안) | POST | `/api/v1/tickets/{ticketId}/wallet-pass` | 구글 월렛 패스 발급 | AUDIENCE | `A-08 티켓 상세·QR` | RotatingBarcode로 동적 QR 정책과 양립 |
| (신설 제안) | GET | `/api/v1/members/me/attendances` | 관람 기록 목록 | AUDIENCE | `C-03 마이페이지` | 입장 처리된 관객만 |
| (신설 제안) | GET | `/api/v1/tickets/{ticketId}/photo-ticket` | 포토 티켓 데이터 | AUDIENCE | `C-03 마이페이지` | 장르별 템플릿 렌더링 입력 |
| API-admin-03 | PATCH | `/api/v1/admin/members/{memberId}/status` | 회원 상태 변경 | ADMIN | `M-03 회원·공연 관리` | 계획 §1.7 등재. 정지 시 refresh token 전량 폐기(SEC-02) 전제만 남기고 상세는 v1.1에서 |

**P2는 경로를 만들지 않는다** — NFT 티켓·유료 재판매·NFC·애플 월렛·AI 기능은 요구사항 명세서의 "확장 범위" 절에만 나열한다(계획 §1.1, 품질 체크리스트 3항).

---

## 17. 신설 제안 (규격 v4 후보)

본문 작성 중 **규격 v3 §3에 없어서 `COMMON_*`으로 대체한 코드**와 **계획 §1.7에 없어서 예약만 한 경로**를 모았다. 규격 §2 "문서에 없는 코드는 배포하지 않는다"에 따라 **본문에서는 하나도 쓰지 않았다**. 팀 검토(8/31) 안건으로 올린다.

### 17.1 에러 코드 후보

| 제안 코드 | status | 필요한 곳 | 현재 대체 | 사유 |
|-----------|--------|-----------|-----------|------|
| `PAYMENT_ACCOUNT_HOLDER_MISMATCH` | 400 | API-member-07, API-team-07 | `COMMON_VALIDATION_FAILED` | SEC-13이 "예금주명 일치 검증 필수"를 ★ 항목으로 두고 있는데 전용 코드가 없다. 화면에서 "다시 입력" 대신 "명의 확인" 안내로 분기해야 한다 |
| `PAYMENT_ACCOUNT_NOT_FOUND` | 400 | API-member-07, API-team-07 | `COMMON_VALIDATION_FAILED` | 금융망에 없는 계좌와 형식 오류를 구분해야 재입력 유도 문구가 달라진다 |
| `PAYMENT_ACCOUNT_NOT_REGISTERED` | 409 | API-payment-01 | `COMMON_CONFLICT` | 팀 환급에는 `REDEEM_ACCOUNT_NOT_REGISTERED`가 있는데 관객 결제 계좌 미연결에는 대응 코드가 없다. 클라이언트는 이 코드에서 C-03 계좌 연결 화면으로 보내야 한다 |
| `TEAM_MEMBER_ALREADY_JOINED` | 409 | API-team-05, API-team-06 | `COMMON_CONFLICT` | `TEAM_ALREADY_JOINED`는 "공연에 참여한 팀"이라 의미가 다르다. 팀원 중복 초대·중복 수락에 쓸 코드가 없다 |
| `TEAM_INVITE_ALREADY_USED` | 409 | API-team-06 | `COMMON_CONFLICT` | 만료(`TEAM_INVITE_EXPIRED`, 410)와 이미 사용을 구분해야 문구가 달라진다 |
| `SETTLEMENT_DISPUTE_CLOSED` | 409 | API-settlement-04 | `COMMON_CONFLICT` | `SETTLEMENT_DISPUTE_PERIOD`는 "아직 기간 중"이라 정반대 의미다. 기간 종료 후 제출을 막을 코드가 필요하다 |
| `SETTLEMENT_DISPUTE_ALREADY_OPEN` | 409 | API-settlement-04 | `COMMON_CONFLICT` | 팀당 열린 이의 1건 규칙을 코드로 표현할 수단이 없다 |
| `TICKET_TRANSFER_PENDING` | 409 | API-ticket-06, API-refund-01/02 | `TRANSFER_NOT_ALLOWED` | 현재는 양도 도메인 코드를 티켓·환불 흐름에서 빌려 쓰고 있다. 의미는 통하지만 도메인 접두가 어긋난다 |
| `COMMON_IDEMPOTENCY_KEY_CONFLICT` | 409 | 멱등키 필수 7개 API | `COMMON_CONFLICT` | 같은 키·다른 본문은 클라이언트 버그 신호라 일반 충돌과 분리해 로깅·알림하는 편이 낫다 |
| `PERFORMANCE_PARTICIPANT_LIMIT_EXCEEDED` | 400 | API-performance-07 | `COMMON_VALIDATION_FAILED` | 참여팀 상한(8팀 [권])을 별도 코드로 두면 화면에서 상한 안내를 정확히 띄울 수 있다 |

### 17.2 경로 후보

| 제안 경로 | 메서드 | 필요한 곳 | 사유 |
|-----------|--------|-----------|------|
| `/api/v1/tickets/{ticketId}/exchanges` | POST | P1 교환 | 계획 §1.7에 교환 경로가 없다. §16에 예약만 해 두었다 |
| `/api/v1/tickets/{ticketId}/exchanges/{exchangeId}` | GET | P1 교환 | 동상 |
| `/api/v1/tickets/{ticketId}/wallet-pass` | POST | P1 월렛 패스 | 동상 |
| `/api/v1/members/me/attendances` | GET | P1 관람 기록 | 동상 |
| `/api/v1/tickets/{ticketId}/photo-ticket` | GET | P1 포토 티켓 | 동상 |
| `/api/v1/performances/{performanceId}/settlement/disputes` | GET | P0 이의제기 목록 | §1.7에는 POST만 있다. P-08 화면은 이의 목록을 봐야 하는데, 지금은 API-settlement-01 응답의 `disputes` 배열로 대신하고 있다. 목록이 길어지면 분리가 필요하다 |
| `/api/v1/admin/chain/jobs` | GET | P0 관리자 체인 작업 목록 | §1.7에는 `/admin/coin/jobs`(mint/burn)만 있다. `agreeToRules`·`startSale`·`release` 같은 순수 체인 작업의 실패 목록을 볼 경로가 없어 M-02가 반쪽이 된다. 현재는 API-admin-05의 `failures` 배열로 대신했다 |
| `/api/v1/admin/chain/jobs/{jobId}/retry` | POST | P0 관리자 체인 작업 재시도 | 동상. REL-09 "최종 실패는 수동 재처리 경로"를 mint/burn 밖에서도 충족하려면 필요하다 |

### 17.3 규격 v3와 충돌하거나 판단이 필요한 지점

| # | 내용 | 이 문서의 처리 |
|---|------|----------------|
| 1 | 규격 v3 §1의 비동기 예시가 `"status": "IN_PROGRESS"`인데, 계획 §1.5의 CoinJob·ChainJob 상태는 `PENDING`/`SUBMITTED`/`CONFIRMED`/`FAILED`다 | §1.5를 우선해 `PENDING`을 썼다. 규격 v4에서 예시를 §1.5에 맞춰 고쳐야 한다 |
| 2 | `TICKET_PURCHASE_LIMIT_EXCEEDED`의 규격 v3 기본 문구가 "1인당 최대 2장"인데 정책 전제 P-6은 **4매**다 | 본문은 4매 기준으로 썼다. 규격 v4에서 기본 `msg`를 "최대 4장"으로 고쳐야 한다 |
| 3 | `REDEEM_ALREADY_REQUESTED`는 팀 수동 출금 전제의 코드인데 P-10에서 **자동 push**로 확정됐다 | 관리자 재시도(API-redeem-02) 중복 호출 방지 용도로 재해석해 사용했다. 규격 v3 §5 미결 사항에도 같은 지적이 있다 |
| 4 | 규격 v3 §3.16에 `EXCHANGE_*`가 이미 있는데 §1.7에는 교환 경로가 없다 | 코드는 두고 경로만 §16·§17.2에 예약했다 |
| 5 | 계획 §1.7 인벤토리 행 수 표기 불일치(초기 §2.3 "P0 66개") | 코디네이터가 계획 v1을 **71행 / P0 69 / P1 2**로 정정 완료. 이 문서는 정정본 기준으로 P0 69개를 상세 작성하고 P1 2개는 §16에만 두었다 |
| 6 | `SETTLEMENT_RELEASE_NOT_ACTIVE`(409)는 "팀이 수령을 시도했으나 release 미활성"을 뜻하는데, P-10에서 **자동 push**로 확정돼 팀 수령 엔드포인트 자체가 없다 | 본문에서 쓸 자리를 찾지 못해 사용하지 않았다. 규격 v4에서 삭제하거나 "release 전 팀 정산 조회 시 안내" 용도로 재정의해야 한다 |

---

## 18. 검수표 — 계획 §1.7 P0 전수 확인

계획 §1.7 인벤토리(정정본: **71행 = P0 69 + P1 2**)의 **P0 69개**를 번호순으로 대조했다. "본문"은 이 문서에 `### {번호}` 절과 `` `메서드 경로` `` 표기가 **글자 단위로 일치**함을 스크립트로 확인한 결과다. P1 2개(API-member-08 · API-admin-03)는 §16에만 경로·이름으로 두었다.

| # | 번호 | 메서드 경로 | 이름 | 본문 | 절 |
|---|------|-------------|------|:----:|----|
| 1 | API-member-01 | `POST /api/v1/auth/signup` | 회원가입 | ☑ | §1 |
| 2 | API-member-02 | `POST /api/v1/auth/login` | 로그인 | ☑ | §1 |
| 3 | API-member-03 | `POST /api/v1/auth/refresh` | 토큰 재발급 | ☑ | §1 |
| 4 | API-member-04 | `POST /api/v1/auth/logout` | 로그아웃 | ☑ | §1 |
| 5 | API-member-05 | `GET /api/v1/members/me` | 내 정보 조회 | ☑ | §1 |
| 6 | API-member-06 | `PATCH /api/v1/members/me` | 내 정보 수정 | ☑ | §1 |
| 7 | API-member-07 | `PUT /api/v1/members/me/bank-account` | 금융망 계좌 연결 | ☑ | §1 |
| 8 | API-team-01 | `POST /api/v1/teams` | 팀 생성(+팀 지갑 생성) | ☑ | §2 |
| 9 | API-team-02 | `GET /api/v1/teams/me` | 내 팀 목록 | ☑ | §2 |
| 10 | API-team-03 | `GET /api/v1/teams/{teamId}` | 팀 상세 | ☑ | §2 |
| 11 | API-team-04 | `PATCH /api/v1/teams/{teamId}` | 팀 수정 | ☑ | §2 |
| 12 | API-team-05 | `POST /api/v1/teams/{teamId}/invitations` | 팀원 초대 | ☑ | §2 |
| 13 | API-team-06 | `POST /api/v1/teams/invitations/{token}/accept` | 초대 수락 | ☑ | §2 |
| 14 | API-team-07 | `PUT /api/v1/teams/{teamId}/settlement-account` | 정산 계좌 등록(예금주 검증) | ☑ | §2 |
| 15 | API-wallet-01 | `GET /api/v1/teams/{teamId}/wallet` | 팀 지갑 조회(주소·잔액·링크) | ☑ | §3 |
| 16 | API-wallet-02 | `GET /api/v1/teams/{teamId}/wallet/transactions` | 팀 지갑 tx 이력 | ☑ | §3 |
| 17 | API-performance-01 | `POST /api/v1/performances` | 공연 생성 | ☑ | §4 |
| 18 | API-performance-02 | `GET /api/v1/performances` | 공연 목록(공개) | ☑ | §4 |
| 19 | API-performance-03 | `GET /api/v1/performances/{performanceId}` | 공연 상세(공개) | ☑ | §4 |
| 20 | API-performance-04 | `PATCH /api/v1/performances/{performanceId}` | 공연 수정(잠금 전) | ☑ | §4 |
| 21 | API-performance-05 | `PUT /api/v1/performances/{performanceId}/ticket-types` | 티켓 옵션 설정(잠금 전) | ☑ | §4 |
| 22 | API-performance-06 | `GET /api/v1/performances/me` | 내 팀 참여 공연 목록 | ☑ | §4 |
| 23 | API-performance-07 | `POST /api/v1/performances/{performanceId}/participants` | 참여팀 초대 | ☑ | §4 |
| 24 | API-performance-08 | `POST /api/v1/performances/{performanceId}/participants/{teamId}/accept` | 참여 수락 | ☑ | §4 |
| 25 | API-performance-09 | `DELETE /api/v1/performances/{performanceId}/participants/{teamId}` | 참여팀 제외(잠금 전) | ☑ | §4 |
| 26 | API-performance-10 | `PUT /api/v1/performances/{performanceId}/staff` | 검표 관계자 지정 | ☑ | §4 |
| 27 | API-performance-11 | `GET /api/v1/performances/{performanceId}/sales` | 판매·선택 현황 | ☑ | §4 |
| 28 | API-performance-12 | `POST /api/v1/performances/{performanceId}/cancel` | 공연 취소(일괄 환불) | ☑ | §4 |
| 29 | API-rule-01 | `PUT /api/v1/performances/{performanceId}/rules` | 정산 규칙 설정 | ☑ | §5 |
| 30 | API-rule-02 | `GET /api/v1/performances/{performanceId}/rules` | 규칙·동의 현황 조회 | ☑ | §5 |
| 31 | API-rule-03 | `POST /api/v1/performances/{performanceId}/rules/agreements` | 내 팀 동의(agreeToRules tx) → 202 | ☑ | §5 |
| 32 | API-rule-04 | `POST /api/v1/performances/{performanceId}/sale/start` | 판매 시작(startSale 잠금) → 202 | ☑ | §5 |
| 33 | API-ticket-01 | `POST /api/v1/orders` | 주문 생성(옵션·수량·선택 팀) | ☑ | §6 |
| 34 | API-ticket-02 | `GET /api/v1/orders/me` | 내 주문 목록 | ☑ | §6 |
| 35 | API-ticket-03 | `GET /api/v1/orders/{orderId}` | 주문 상세 | ☑ | §6 |
| 36 | API-ticket-04 | `GET /api/v1/tickets/me` | 내 티켓 목록 | ☑ | §6 |
| 37 | API-ticket-05 | `GET /api/v1/tickets/{ticketId}` | 티켓 상세 | ☑ | §6 |
| 38 | API-ticket-06 | `GET /api/v1/tickets/{ticketId}/qr` | 동적 QR 토큰 발급 | ☑ | §6 |
| 39 | API-payment-01 | `POST /api/v1/orders/{orderId}/payment` | 결제 요청(금융망 이체) → 202 | ☑ | §7 |
| 40 | API-payment-02 | `GET /api/v1/orders/{orderId}/payment` | 결제 상태 조회 | ☑ | §7 |
| 41 | API-coin-01 | `GET /api/v1/coin/supply` | KRWS 유통량·준비금 요약 | ☑ | §8 |
| 42 | API-coin-02 | `GET /api/v1/admin/coin/jobs` | mint/burn 작업 목록 | ☑ | §8 |
| 43 | API-coin-03 | `POST /api/v1/admin/coin/jobs/{jobId}/retry` | 작업 재시도 | ☑ | §8 |
| 44 | API-chain-01 | `GET /api/v1/chain/jobs/{jobId}` | 비동기 tx 작업 상태 | ☑ | §8 |
| 45 | API-refund-01 | `GET /api/v1/tickets/{ticketId}/refund-quote` | 환불액 미리보기 | ☑ | §9 |
| 46 | API-refund-02 | `POST /api/v1/tickets/{ticketId}/cancel` | 개별 취소·환불 → 202 | ☑ | §9 |
| 47 | API-transfer-01 | `POST /api/v1/tickets/{ticketId}/transfers` | 양도 링크 생성 | ☑ | §10 |
| 48 | API-transfer-02 | `GET /api/v1/transfers/{token}` | 양도 정보 조회 | ☑ | §10 |
| 49 | API-transfer-03 | `POST /api/v1/transfers/{token}/accept` | 양도 수락 | ☑ | §10 |
| 50 | API-transfer-04 | `DELETE /api/v1/transfers/{token}` | 양도 취소 | ☑ | §10 |
| 51 | API-entry-01 | `POST /api/v1/entries/verify` | QR 검증·입장 처리 | ☑ | §11 |
| 52 | API-entry-02 | `GET /api/v1/performances/{performanceId}/entries` | 입장 현황·이력 | ☑ | §11 |
| 53 | API-entry-03 | `GET /api/v1/performances/staff/me` | 내가 검표하는 공연 목록 | ☑ | §11 |
| 54 | API-settlement-01 | `GET /api/v1/performances/{performanceId}/settlement` | 정산 상태·집계·분배액·tx | ☑ | §12 |
| 55 | API-settlement-02 | `POST /api/v1/performances/{performanceId}/settlement/aggregate` | 집계 확정 → 202 | ☑ | §12 |
| 56 | API-settlement-03 | `POST /api/v1/performances/{performanceId}/settlement/lock` | 정산 잠금(이의제기 시작) → 202 | ☑ | §12 |
| 57 | API-settlement-04 | `POST /api/v1/performances/{performanceId}/settlement/disputes` | 이의제기 | ☑ | §12 |
| 58 | API-settlement-05 | `POST /api/v1/performances/{performanceId}/settlement/release` | release 실행 → 202 | ☑ | §12 |
| 59 | API-redeem-01 | `GET /api/v1/teams/{teamId}/redemptions` | 환급 이력 | ☑ | §13 |
| 60 | API-redeem-02 | `POST /api/v1/admin/redemptions/{redemptionId}/retry` | 환급 재시도 | ☑ | §13 |
| 61 | API-verify-01 | `GET /api/v1/public/performances/{performanceId}/verification` | 공개 검증 데이터 | ☑ | §14 |
| 62 | API-verify-02 | `GET /api/v1/public/reserve-proof` | 준비금 증명 | ☑ | §14 |
| 63 | API-admin-01 | `GET /api/v1/admin/dashboard` | 관리자 요약 | ☑ | §15 |
| 64 | API-admin-02 | `GET /api/v1/admin/members` | 회원 목록 | ☑ | §15 |
| 65 | API-admin-04 | `GET /api/v1/admin/performances` | 공연 목록(관리) | ☑ | §15 |
| 66 | API-admin-05 | `GET /api/v1/admin/settlements` | 정산 목록·실패 건 | ☑ | §15 |
| 67 | API-admin-06 | `PATCH /api/v1/admin/disputes/{disputeId}` | 이의제기 처리 | ☑ | §15 |
| 68 | API-admin-07 | `GET /api/v1/admin/operator-wallet` | 운영지갑 상태 | ☑ | §15 |
| 69 | API-admin-08 | `GET /api/v1/admin/audit-logs` | 감사 로그 | ☑ | §15 |

### 추가 확인

| 항목 | 결과 |
|------|------|
| P0 69개 전부 본문에 상세 절 존재 | ☑ (스크립트 대조, 누락 0) |
| P1 2개(API-member-08 · API-admin-03) | ☑ §16 P1 예약 경로 표에 경로·메서드·이름만. 본문 상세 없음 |
| 본문 에러 코드가 전부 규격 v3 §3에 존재 | ☑ (스크립트 대조, 미등재 코드 0 — 신설 후보는 §17에만) |
| P2(NFT·재판매·NFC·애플 월렛·AI) 경로 없음 | ☑ |
| 상태값이 계획 §1.5 문자열과 일치 | ☑ |
| 화면 표기가 계획 §1.6 `ID 화면명` 형식 | ☑ |
| 멱등키 필수 7개 API에 헤더 명시 | ☑ ticket-01 · payment-01 · refund-02 · performance-12 · settlement-05 · coin-03 · redeem-02 |
| 202 + `jobId` 폴링을 쓰는 API | rule-03 · rule-04 · payment-01 · refund-02 · performance-12 · settlement-02 · settlement-03 · settlement-05 · coin-03 · redeem-02 (폴링 대상은 API-chain-01) |
| API-chain-01 배치 | ☑ 계획 §1.7 규약("공통 엔드포인트, `coin` 도메인에 대표 배치")에 따라 §8 끝에 |

---

## 변경 이력

| 버전 | 날짜 | 내용 |
|------|------|------|
| v1 | 2026-08-28 | 초안 작성. 계획 §1.7(정정본 71행) **P0 69개 상세** + P1 2개 예약 경로 + 신설 제안(코드 10·경로 8) + P0 전수 검수표 |
