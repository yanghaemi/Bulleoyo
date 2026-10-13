# API 공통 응답 규격

> 대상: S15P21B204 (소규모 공연 통합 플랫폼) · 작성일 2026-08-27 · 개정 2026-08-27 (래퍼 확정) · 상태: 확정
> 관련 Jira: [명세] REST API 명세 초안, [설계] 개발 컨벤션
> 함께 볼 문서: [02_개발_컨벤션.md](./02_개발_컨벤션.md)
>
> 개정 이력
> - **v1** — `{ success, data, error: { code, message } }` (보존: [_v1](./01_API_공통_응답_규격_v1.md))
> - **v2** — 래퍼를 `{ code, data, msg }` 3필드 기본형으로 변경, `code`는 문자열 enum (보존: [_v2](./01_API_공통_응답_규격_v2.md))
> - **v3 (현행)** — 기획 v2.1 확정 범위 반영: 관객 지갑·NFT 민팅 전제 제거(일반 티켓 기준), 굿즈(MD) 코드 삭제, 정산 자산을 **YoYo 스테이블코인**으로 변경(`COIN_*`·`REDEEM_*` 신설), `SHOW_*` → `PERFORMANCE_*`, 확장 기능 코드를 §3.16으로 분리
> - **2026-09-20** — `WALLET_BALANCE_INSUFFICIENT`(§3.3)·`PERFORMANCE_RULES_REQUIRED`(§3.4) 신설. API-performance-13 의 `COMMON_CONFLICT` 세 원인(이미 낸 보증금·잔액 부족·규칙 미저장)이 화면 행동이 다른데 구분되지 않았다 (S15P21B204-151). ⚠ `RULE_SYNC_IN_PROGRESS`(§3.6)·`AUTH_SIGNUP_REQUIRED`(§3.2)는 코드에만 있고 아직 이 문서에 등재되지 않았다
> - **2026-09-24** — `WEBAUTHN_STEP_UP_REQUIRED`(403)·`WEBAUTHN_VERIFICATION_FAILED`(400) 신설(§3.18). 패스키 본인 확인(step-up, API v7 §7.W · 결정 v2 §14-41) — 결제 보고·규칙 동의 보고·보증금 보고·정산 조기 동의·정산금 지급 다섯 동작. **스위치 `STEP_UP_ENABLED`(기본 off)가 켜졌을 때만** 발생한다. 같은 날 오전 초안의 `PAYMENT_STEP_UP_REQUIRED`(§3.8)는 공연자 동작으로 범위를 넓히며 배포 전에 개명했다. ⚠ 코드의 §3.17 `FILE_*` 6개는 아직 이 문서에 없다(번호만 비워 둔다)
> - **2026-09-08** — 코인 개명 KRWS → YoYo (name·symbol "YoYo", 환경변수·산출물 키 YOYO/YoYo, 로직 불변)

---

## 1. 래퍼 구조

모든 REST 응답은 성공·실패 구분 없이 아래 3개 필드를 사용한다.

```json
{
  "code": "SUCCESS",
  "data": { "ticketId": 812, "tokenId": 41 },
  "msg": ""
}
```

```json
{
  "code": "TICKET_SOLD_OUT",
  "data": null,
  "msg": "선택한 티켓이 모두 판매되었습니다."
}
```

| 필드 | 규칙 |
|------|------|
| `code` | 문자열 enum. 성공은 항상 `"SUCCESS"`, 실패는 `도메인_사유` 형식의 대문자 스네이크. **클라이언트 분기의 유일한 키이며, 배포된 코드 문자열은 변경 금지** |
| `data` | 성공 시 payload. 실패 시 예외 없이 항상 `null` |
| `msg` | 사용자에게 그대로 노출할 수 있는 한국어 문장. 성공 시 빈 문자열이며, 토스트로 띄울 문구가 있으면 담는다. **문구는 언제든 바뀌므로 클라이언트가 `msg`로 분기하면 안 된다** |

### 왜 `code`를 숫자가 아닌 문자열로 두는가

같은 HTTP status 안에서 클라이언트가 정반대로 동작해야 하는 경우가 이미 명세에 있다.

| status | code | 클라이언트 동작 |
|--------|------|-----------------|
| 401 | `AUTH_TOKEN_EXPIRED` | 조용히 토큰 재발급 후 원요청 재시도 |
| 401 | `AUTH_TOKEN_INVALID` | 재발급 시도 없이 즉시 로그아웃 |
| 409 | `TICKET_SOLD_OUT` | 다른 회차 안내 |
| 409 | `TICKET_PURCHASE_LIMIT_EXCEEDED` | 구매 제한 안내, 재시도 차단 |
| 409 | `RULE_NOT_AGREED_BY_ALL` | 미동의 팀 목록 노출 |
| 409 | `SETTLEMENT_DISPUTE_PERIOD` | 남은 이의제기 시간 표시 |

숫자 하나로는 이 구분이 불가능해 결국 `msg` 문자열로 분기하게 되고, 문구를 다듬는 순간 프론트가 깨진다. 커스텀 숫자(40901 등)를 쓰면 분기는 되지만 60여 개 매직넘버 대응표를 따로 관리해야 하고 로그·에러 리포트를 눈으로 읽을 수 없다.

### HTTP status와의 관계

`code`는 정확한 사유, HTTP status는 큰 분류를 담당한다. 둘의 성공/실패 판정은 항상 일치해야 한다.

| status | 사용 상황 |
|--------|-----------|
| 200 | 조회·수정 성공 |
| 201 | 리소스 생성 성공 |
| 202 | 비동기 작업 접수 (민팅, 정산 이체) |
| 400 | 요청 값 자체가 잘못됨 |
| 401 | 인증 실패·토큰 문제·QR 서명 검증 실패 |
| 403 | 인증됨, 권한 없음 |
| 404 | 리소스 없음 |
| 409 | 현재 상태에서 허용되지 않는 요청 (상태 충돌, 재고 소진, 중복) |
| 410 | 만료되어 사라진 리소스 (양도 링크, 초대) |
| 429 | 호출 한도 초과 |
| 500 | 서버 내부 오류 |
| 502 | 외부 시스템(금융망 API, 체인 노드) 오류 |
| 504 | 외부 시스템 타임아웃 |

성공 판별은 `code === "SUCCESS"`로 한다. **`status === 200` 하드코딩 금지** — 201·202가 정상 응답으로 존재한다.

### 목록 응답

`data` 안에서 `items` + `pageInfo`로 감싼다.

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

### 비동기 처리 응답 (민팅·정산 이체)

즉시 끝나지 않는 작업은 `202 Accepted` + 작업 식별자를 반환하고, 상태는 별도 조회 API로 확인한다. `code`는 `SUCCESS`다.

```json
{
  "code": "SUCCESS",
  "data": { "jobId": "mint_01J8XQ", "status": "IN_PROGRESS", "pollAfterMs": 1500 },
  "msg": ""
}
```

### 부분 성공 (정산 이체 일부 실패)

전체 실패가 아니므로 `code`는 `SUCCESS`로 두고, 실패 건은 `data` 안에서 재시도 대상으로 표시한다.

```json
{
  "code": "SUCCESS",
  "data": {
    "settlementId": 91,
    "results": [
      { "teamId": 1, "amount": 420000, "status": "TRANSFERRED", "txId": "FIN-8821" },
      { "teamId": 2, "amount": 310000, "status": "FAILED", "reason": "PAYMENT_REQUEST_FAILED", "retryable": true }
    ]
  },
  "msg": ""
}
```

### 보안

스택트레이스, SQL, 체인 revert 원문, 금융망 API 원본 오류 문자열은 `msg`에 넣지 않는다. 서버 로그에만 남기고 사용자에게는 일반화한 문장을 준다.

---

## 2. 서버 구현 규칙

- 모든 코드는 `ErrorCode` enum 한 곳에 정의한다. enum 필드는 `code(String)`, `status(HttpStatus)`, `defaultMsg(String)`.
- 컨트롤러는 `ApiResponse<T>`만 반환하고, 실패는 예외를 던져 `@RestControllerAdvice`에서 래핑한다. 컨트롤러 안에서 실패 응답을 직접 만들지 않는다.
- `msg`는 `ErrorCode`의 기본 문구를 쓰고, 금액·시각처럼 값이 들어가야 하는 경우만 예외 생성 시 덮어쓴다.
- 신규 코드를 추가하면 이 문서 §3에 발생 조건과 예시를 같이 추가한다. 문서에 없는 코드는 배포하지 않는다.
- 래퍼에 필드를 추가하지 않는다. 재시도 가능 여부·필드별 검증 상세처럼 부가 정보가 필요하면 `msg` 문장으로 전달하거나, 정말 필요한 경우 이 문서에서 먼저 합의한다.

---

## 3. 코드별 예시

기획 v2.1 확정 범위 기준이다. 관객은 지갑이 없고 티켓은 **일반 티켓**이며, 정산 자산은 **YoYo 스테이블코인**(ERC-20, decimals=0, 1 YoYo = 1원)이다. 각 항목은 `발생 조건` + 실제 응답 body이며, 래퍼 구조는 모두 동일하므로 `code`와 `msg`만 달라진다.

확장 기능(P1/P2)의 코드는 §3.16에 모아 두었다. MVP 구현 시에는 필요 없다.

### 3.1 COMMON — 공통

**COMMON_VALIDATION_FAILED — 400**
요청 body·쿼리 파라미터가 검증 규칙을 위반한 경우.
```json
{ "code": "COMMON_VALIDATION_FAILED", "data": null, "msg": "공연 제목은 1자 이상 100자 이하로 입력해 주세요." }
```

**COMMON_UNAUTHORIZED — 401**
토큰이 없거나 인증 헤더가 누락된 경우.
```json
{ "code": "COMMON_UNAUTHORIZED", "data": null, "msg": "로그인이 필요합니다." }
```

**COMMON_FORBIDDEN — 403**
로그인은 했으나 해당 리소스에 대한 권한이 없는 경우 (도메인 전용 코드가 없을 때만 사용).
```json
{ "code": "COMMON_FORBIDDEN", "data": null, "msg": "이 작업을 수행할 권한이 없습니다." }
```

**COMMON_NOT_FOUND — 404**
```json
{ "code": "COMMON_NOT_FOUND", "data": null, "msg": "요청한 정보를 찾을 수 없습니다." }
```

**COMMON_CONFLICT — 409**
동시 요청으로 인한 일반적인 상태 충돌.
```json
{ "code": "COMMON_CONFLICT", "data": null, "msg": "다른 요청이 처리 중입니다. 잠시 후 다시 시도해 주세요." }
```

**COMMON_TOO_MANY_REQUESTS — 429**
rate limit 초과. 예매 매크로 차단 룰 포함.
```json
{ "code": "COMMON_TOO_MANY_REQUESTS", "data": null, "msg": "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }
```

**COMMON_INTERNAL_ERROR — 500**
처리되지 않은 서버 예외. 상세 원인은 로그에만 남긴다.
```json
{ "code": "COMMON_INTERNAL_ERROR", "data": null, "msg": "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." }
```

**COMMON_EXTERNAL_SERVICE_ERROR — 502**
금융망 API·체인 노드 등 외부 시스템이 오류를 반환했고 도메인 전용 코드가 없는 경우.
```json
{ "code": "COMMON_EXTERNAL_SERVICE_ERROR", "data": null, "msg": "외부 시스템 연동 중 오류가 발생했습니다." }
```

### 3.2 AUTH — 인증·회원

**AUTH_INVALID_CREDENTIALS — 401**
```json
{ "code": "AUTH_INVALID_CREDENTIALS", "data": null, "msg": "아이디 또는 비밀번호가 올바르지 않습니다." }
```

**AUTH_TOKEN_EXPIRED — 401**
액세스 토큰 만료. 클라이언트는 이 코드에서만 토큰 재발급을 시도한다.
```json
{ "code": "AUTH_TOKEN_EXPIRED", "data": null, "msg": "로그인이 만료되었습니다. 다시 로그인해 주세요." }
```

**AUTH_TOKEN_INVALID — 401**
서명 불일치·위조된 토큰. 재발급 시도 없이 즉시 로그아웃 처리.
```json
{ "code": "AUTH_TOKEN_INVALID", "data": null, "msg": "인증 정보가 올바르지 않습니다." }
```

**AUTH_EMAIL_DUPLICATED — 409**
```json
{ "code": "AUTH_EMAIL_DUPLICATED", "data": null, "msg": "이미 가입된 이메일입니다." }
```

### 3.3 WALLET — 공연자(팀) 지갑

관객에게는 지갑이 없다. 이 도메인은 **공연자 팀 지갑과 운영지갑에만** 해당한다.

**WALLET_CREATION_FAILED — 500**
팀 생성 시 커스터디얼 지갑 생성 실패. 팀 생성 트랜잭션 전체를 롤백한다.
```json
{ "code": "WALLET_CREATION_FAILED", "data": null, "msg": "팀 지갑 생성에 실패했습니다. 잠시 후 다시 시도해 주세요." }
```

**WALLET_NOT_FOUND — 404**
```json
{ "code": "WALLET_NOT_FOUND", "data": null, "msg": "팀 지갑 정보를 찾을 수 없습니다." }
```

**WALLET_KEY_DECRYPT_FAILED — 500**
KEK 미주입·DEK 손상 등 서명 직전 복호화 실패. 원인은 절대 노출하지 않는다.
```json
{ "code": "WALLET_KEY_DECRYPT_FAILED", "data": null, "msg": "요청을 처리할 수 없습니다. 관리자에게 문의해 주세요." }
```

**WALLET_GAS_INSUFFICIENT — 409**
팀 지갑의 테스트넷 가스가 부족해 동의·환급 서명을 보낼 수 없는 경우. 가스 충전 절차는 미결 안건이다.
```json
{ "code": "WALLET_GAS_INSUFFICIENT", "data": null, "msg": "팀 지갑의 네트워크 수수료가 부족합니다. 관리자에게 충전을 요청해 주세요." }
```

**WALLET_BALANCE_INSUFFICIENT — 409** *[2026-09-20 — S15P21B204-151]*
리더 지갑의 YoYo 잔액이 보증금(API-performance-13)에 못 미치는 경우. 부족액은 서버만 아는 값이라
호출부가 `msg`를 덮는다(§2). 화면 분기는 **안내만**이고 잔액을 늘리는 버튼이 없어 기본 문구에 행동
지시를 넣지 않는다. 관객의 티켓 결제 잔액 부족은 주어가 달라 `PAYMENT_INSUFFICIENT_BALANCE` 쪽이다.
```json
{ "code": "WALLET_BALANCE_INSUFFICIENT", "data": null, "msg": "Insufficient balance · ₩38,000 short. (need ₩50,000 · have ₩12,000)" }
```

### 3.4 PERFORMANCE — 공연

`show`는 MySQL 예약어이므로 도메인·테이블·API 용어를 `performance`로 통일한다 (개발 컨벤션 §4).

**PERFORMANCE_NOT_FOUND — 404**
```json
{ "code": "PERFORMANCE_NOT_FOUND", "data": null, "msg": "공연을 찾을 수 없습니다." }
```

**PERFORMANCE_NOT_OWNER — 403**
공연 주최자가 아닌 계정이 수정·삭제를 시도한 경우.
```json
{ "code": "PERFORMANCE_NOT_OWNER", "data": null, "msg": "공연 주최자만 수정할 수 있습니다." }
```

**PERFORMANCE_INVALID_STATUS — 409**
현재 공연 상태에서 허용되지 않는 전이를 요청한 경우.
```json
{ "code": "PERFORMANCE_INVALID_STATUS", "data": null, "msg": "판매가 종료된 공연은 수정할 수 없습니다." }
```

**PERFORMANCE_ALREADY_ON_SALE — 409**
판매 시작 이후 참여팀·정산 규칙 변경을 시도한 경우.
```json
{ "code": "PERFORMANCE_ALREADY_ON_SALE", "data": null, "msg": "티켓 판매가 시작되어 변경할 수 없습니다." }
```

**PERFORMANCE_DATE_INVALID — 400**
공연 일시가 과거이거나 예매 마감이 공연일 이후인 경우.
```json
{ "code": "PERFORMANCE_DATE_INVALID", "data": null, "msg": "공연 일시와 예매 마감 일시를 다시 확인해 주세요." }
```

**PERFORMANCE_RULES_REQUIRED — 409** *[2026-09-20 — S15P21B204-151]*
정산 규칙을 저장하기 전에 보증금 서명을 요청한 경우(API-performance-13). 규칙이 없으면
`createShow`를 만들 수 없고(`rulesHash == 0` → `ZeroRulesHash`), 그대로 서명을 내주면 `deposit`이
`ShowNotFound`로 revert 한다. 화면은 규칙 저장으로 보낸다.
```json
{ "code": "PERFORMANCE_RULES_REQUIRED", "data": null, "msg": "정산 규칙을 먼저 저장해야 보증금을 낼 수 있습니다." }
```

### 3.5 TEAM — 참여팀

**TEAM_NOT_FOUND — 404**
```json
{ "code": "TEAM_NOT_FOUND", "data": null, "msg": "공연팀을 찾을 수 없습니다." }
```

**TEAM_ALREADY_JOINED — 409**
```json
{ "code": "TEAM_ALREADY_JOINED", "data": null, "msg": "이미 이 공연에 참여한 팀입니다." }
```

**TEAM_INVITE_EXPIRED — 410**
```json
{ "code": "TEAM_INVITE_EXPIRED", "data": null, "msg": "초대가 만료되었습니다. 주최자에게 재요청해 주세요." }
```

**TEAM_MIN_COUNT_NOT_MET — 409**
공동 공연으로 생성했으나 참여팀이 2팀 미만인 상태로 판매 시작을 시도한 경우.
```json
{ "code": "TEAM_MIN_COUNT_NOT_MET", "data": null, "msg": "공동 공연은 참여팀이 2팀 이상이어야 합니다." }
```

### 3.6 RULE — 정산 규칙 (핵심)

**RULE_RATIO_SUM_INVALID — 400**
균등·관객선택·기획기여 비율의 합이 100%가 아닌 경우.
```json
{ "code": "RULE_RATIO_SUM_INVALID", "data": null, "msg": "분배 비율의 합이 100%가 되어야 합니다." }
```

**RULE_NOT_AGREED_BY_ALL — 409**
모든 참여팀 지갑이 `agreeToRules`를 호출하기 전에 `startSale`을 시도한 경우.
```json
{ "code": "RULE_NOT_AGREED_BY_ALL", "data": null, "msg": "모든 참여팀이 정산 규칙에 동의해야 판매를 시작할 수 있습니다." }
```

**RULE_ALREADY_LOCKED — 409**
`startSale()` 이후 규칙 수정을 시도한 경우. 컨트랙트에서도 revert된다.
```json
{ "code": "RULE_ALREADY_LOCKED", "data": null, "msg": "정산 규칙이 확정되어 변경할 수 없습니다." }
```

**RULE_HASH_MISMATCH — 409**
동의 요청의 `rulesHash`가 현재 서버 규칙의 해시와 다른 경우. 규칙이 중간에 바뀐 상황이다.
```json
{ "code": "RULE_HASH_MISMATCH", "data": null, "msg": "정산 규칙이 변경되었습니다. 내용을 다시 확인한 뒤 동의해 주세요." }
```

**RULE_COMMON_COST_EXCEEDS_REVENUE — 409**
차감할 공통 비용이 총 매출을 초과해 분배액이 음수가 되는 경우.
```json
{ "code": "RULE_COMMON_COST_EXCEEDS_REVENUE", "data": null, "msg": "공통 비용이 총 판매 금액을 초과했습니다." }
```

### 3.7 TICKET — 티켓·예매 (일반 티켓)

**TICKET_OPTION_NOT_FOUND — 404**
```json
{ "code": "TICKET_OPTION_NOT_FOUND", "data": null, "msg": "선택한 티켓 종류를 찾을 수 없습니다." }
```

**TICKET_SALE_NOT_STARTED — 409**
```json
{ "code": "TICKET_SALE_NOT_STARTED", "data": null, "msg": "아직 예매가 시작되지 않았습니다." }
```

**TICKET_SALE_CLOSED — 409**
```json
{ "code": "TICKET_SALE_CLOSED", "data": null, "msg": "예매가 마감되었습니다." }
```

**TICKET_SOLD_OUT — 409**
Redis 재고 차감 실패. 동시 예매 경합에서 밀린 경우.
```json
{ "code": "TICKET_SOLD_OUT", "data": null, "msg": "선택한 티켓이 모두 판매되었습니다." }
```

**TICKET_PURCHASE_LIMIT_EXCEEDED — 409**
1인 구매 수량 제한 초과.
```json
{ "code": "TICKET_PURCHASE_LIMIT_EXCEEDED", "data": null, "msg": "1인당 최대 2장까지 구매할 수 있습니다." }
```

**TICKET_TEAM_CHOICE_REQUIRED — 400**
공동 공연 예매인데 관람 목적 팀을 선택하지 않은 경우. 이 값이 온체인 선택 집계의 입력이므로 필수다.
```json
{ "code": "TICKET_TEAM_CHOICE_REQUIRED", "data": null, "msg": "보고 싶은 팀을 선택해 주세요." }
```

**TICKET_TEAM_CHOICE_INVALID — 400**
선택한 팀이 해당 공연의 참여팀이 아니거나 허용 개수를 초과한 경우.
```json
{ "code": "TICKET_TEAM_CHOICE_INVALID", "data": null, "msg": "이 공연에 참여하지 않는 팀입니다." }
```

**TICKET_NOT_OWNED — 403**
현재 소유자가 아닌 계정이 QR 발급·양도를 시도한 경우. 소유권은 DB 기준이다.
```json
{ "code": "TICKET_NOT_OWNED", "data": null, "msg": "본인 소유의 티켓이 아닙니다." }
```

**TICKET_ALREADY_USED — 409**
```json
{ "code": "TICKET_ALREADY_USED", "data": null, "msg": "이미 입장 처리된 티켓입니다." }
```

**TICKET_CANCELED — 409**
```json
{ "code": "TICKET_CANCELED", "data": null, "msg": "취소된 티켓입니다." }
```

### 3.8 PAYMENT — 결제 (금융망 API = 입금 창구)

**PAYMENT_ALREADY_PAID — 409**
동일 주문에 대한 중복 결제 요청.
```json
{ "code": "PAYMENT_ALREADY_PAID", "data": null, "msg": "이미 결제가 완료된 주문입니다." }
```

**PAYMENT_AMOUNT_MISMATCH — 409**
클라이언트가 보낸 금액과 서버 계산 금액이 다른 경우. 위조 시도로 간주하고 로그를 남긴다.
```json
{ "code": "PAYMENT_AMOUNT_MISMATCH", "data": null, "msg": "결제 금액이 일치하지 않습니다. 처음부터 다시 시도해 주세요." }
```

**PAYMENT_INSUFFICIENT_BALANCE — 409**
```json
{ "code": "PAYMENT_INSUFFICIENT_BALANCE", "data": null, "msg": "계좌 잔액이 부족합니다." }
```

**PAYMENT_REQUEST_FAILED — 502**
금융망 API가 오류를 반환한 경우. 재고는 즉시 원복하고 YoYo 민팅은 실행하지 않는다.
```json
{ "code": "PAYMENT_REQUEST_FAILED", "data": null, "msg": "결제 처리 중 오류가 발생했습니다. 결제는 진행되지 않았습니다." }
```

**PAYMENT_TIMEOUT — 504**
응답을 받지 못한 상태. 결제 성공 여부가 불확실하므로 중복 결제를 유도하지 않는 문구를 쓴다.
```json
{ "code": "PAYMENT_TIMEOUT", "data": null, "msg": "결제 결과 확인이 지연되고 있습니다. 주문 내역에서 상태를 확인해 주세요." }
```

### 3.9 COIN — YoYo 스테이블코인 발행·소각

원칙: **금융망 입금 확인 이벤트에만 mint를 결합한다.** 예치 없는 발행은 금지이며 준비금 증명으로 검증된다.

**COIN_MINT_PENDING — 409**
결제는 확인됐지만 YoYo 민팅·에스크로 예치가 아직 확정되지 않은 상태에서 후속 작업(집계 확정 등)을 요청한 경우.
```json
{ "code": "COIN_MINT_PENDING", "data": null, "msg": "결제 예치 처리가 진행 중입니다. 잠시 후 다시 확인해 주세요." }
```

**COIN_MINT_FAILED — 500**
결제는 성공했으나 민팅이 최종 실패한 경우. 자동 환불 보상 트랜잭션을 걸고 이 코드를 반환한다.
```json
{ "code": "COIN_MINT_FAILED", "data": null, "msg": "결제 예치 처리에 실패했습니다. 결제 금액은 자동 환불됩니다." }
```

**COIN_BURN_FAILED — 500**
환불 또는 팀 환급 과정에서 소각이 실패한 경우. 금융망 이체를 진행하지 않고 재시도 대기로 남긴다.
```json
{ "code": "COIN_BURN_FAILED", "data": null, "msg": "처리가 지연되고 있습니다. 확인 후 순차적으로 처리됩니다." }
```

**COIN_ESCROW_INSUFFICIENT — 409**
공연별 에스크로 잔액이 요청 금액보다 적은 경우. 정상 흐름에서는 발생하지 않아야 하며, 발생 시 대사 점검 대상이다.
```json
{ "code": "COIN_ESCROW_INSUFFICIENT", "data": null, "msg": "정산 가능한 예치 금액이 부족합니다. 관리자 확인이 필요합니다." }
```

**COIN_RESERVE_MISMATCH — 409**
금융망 에스크로 계좌 잔액이 YoYo 유통량보다 적은 것으로 확인된 경우. 준비금 1:1이 깨진 상태이므로 mint·release를 중단한다.
```json
{ "code": "COIN_RESERVE_MISMATCH", "data": null, "msg": "예치금 검증에 실패했습니다. 관리자 확인 후 처리가 재개됩니다." }
```

### 3.10 CHAIN — 온체인 트랜잭션 공통

**CHAIN_TX_TIMEOUT — 504**
```json
{ "code": "CHAIN_TX_TIMEOUT", "data": null, "msg": "블록체인 처리가 지연되고 있습니다. 잠시 후 상태를 다시 확인해 주세요." }
```

**CHAIN_GAS_INSUFFICIENT — 500**
운영지갑 가스 부족. 시연 전 사전 확보 대상이며 알림 대상 오류다. (팀 지갑 가스 부족은 `WALLET_GAS_INSUFFICIENT`)
```json
{ "code": "CHAIN_GAS_INSUFFICIENT", "data": null, "msg": "요청을 처리할 수 없습니다. 관리자에게 문의해 주세요." }
```

**CHAIN_NONCE_CONFLICT — 500**
nonce 큐 직렬화 실패. 서버 내부에서 재시도하고 최종 실패 시에만 노출한다.
```json
{ "code": "CHAIN_NONCE_CONFLICT", "data": null, "msg": "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." }
```

### 3.11 REFUND — 취소·환불

취소는 `YoYo burn + 금융망 환불 + cancelChoice()` 세 단계를 함께 처리한다.

**REFUND_DEADLINE_PASSED — 409**
취소 마감 이후 취소를 시도한 경우.
```json
{ "code": "REFUND_DEADLINE_PASSED", "data": null, "msg": "취소 가능 기간이 지났습니다." }
```

**REFUND_ALREADY_REQUESTED — 409**
```json
{ "code": "REFUND_ALREADY_REQUESTED", "data": null, "msg": "이미 취소 요청이 접수된 티켓입니다." }
```

**REFUND_AFTER_SETTLEMENT_LOCK — 409**
정산이 잠긴 이후의 환불 요청. 온체인 회수가 불가하므로 오프체인 준비금 정책으로 넘긴다.
```json
{ "code": "REFUND_AFTER_SETTLEMENT_LOCK", "data": null, "msg": "정산이 완료된 공연은 앱에서 취소할 수 없습니다. 고객센터로 문의해 주세요." }
```

**REFUND_TRANSFER_FAILED — 502**
환불 이체가 금융망에서 실패한 경우. 상태는 재시도 대기로 남긴다.
```json
{ "code": "REFUND_TRANSFER_FAILED", "data": null, "msg": "환불 처리가 지연되고 있습니다. 확인 후 순차적으로 처리됩니다." }
```

### 3.12 TRANSFER — 티켓 양도(선물)

일반 티켓 기준이다. 수락 시 DB 소유자를 변경하고 기존 QR 시드를 폐기·재발급한다.

**TRANSFER_LINK_NOT_FOUND — 404**
```json
{ "code": "TRANSFER_LINK_NOT_FOUND", "data": null, "msg": "유효하지 않은 선물 링크입니다." }
```

**TRANSFER_LINK_EXPIRED — 410**
```json
{ "code": "TRANSFER_LINK_EXPIRED", "data": null, "msg": "선물 링크가 만료되었습니다. 보낸 분에게 다시 요청해 주세요." }
```

**TRANSFER_LINK_ALREADY_USED — 409**
이미 다른 사용자가 수락한 링크.
```json
{ "code": "TRANSFER_LINK_ALREADY_USED", "data": null, "msg": "이미 사용된 선물 링크입니다." }
```

**TRANSFER_SELF_NOT_ALLOWED — 400**
```json
{ "code": "TRANSFER_SELF_NOT_ALLOWED", "data": null, "msg": "자신에게는 선물할 수 없습니다." }
```

**TRANSFER_NOT_ALLOWED — 409**
입장 완료·취소된 티켓이거나, 양도중·교환중 상태로 잠긴 티켓에 양도를 시도한 경우.
```json
{ "code": "TRANSFER_NOT_ALLOWED", "data": null, "msg": "이 티켓은 더 이상 양도할 수 없습니다." }
```

### 3.13 ENTRY — 입장·QR 검표

**ENTRY_QR_EXPIRED — 401**
동적 QR의 유효기간(30~60초)이 지난 경우. 관객 화면에서 자동 재발급한다.
```json
{ "code": "ENTRY_QR_EXPIRED", "data": null, "msg": "QR이 만료되었습니다. 화면을 새로 고쳐 주세요." }
```

**ENTRY_QR_SIGNATURE_INVALID — 401**
서명 검증 실패. 캡처·복제 QR로 간주하고 검표 이력에 기록한다.
```json
{ "code": "ENTRY_QR_SIGNATURE_INVALID", "data": null, "msg": "유효하지 않은 QR입니다." }
```

**ENTRY_ALREADY_ENTERED — 409**
Redis 원타임 처리에서 중복 감지. 검표 화면에 최초 입장 시각을 함께 보여준다.
```json
{ "code": "ENTRY_ALREADY_ENTERED", "data": null, "msg": "이미 입장 처리된 티켓입니다. (최초 입장 19:12)" }
```

**ENTRY_NOT_IN_TIME_WINDOW — 409**
입장 허용 시간대 밖의 스캔.
```json
{ "code": "ENTRY_NOT_IN_TIME_WINDOW", "data": null, "msg": "입장 가능 시간이 아닙니다." }
```

**ENTRY_SCANNER_NOT_AUTHORIZED — 403**
해당 공연의 관계자로 등록되지 않은 계정이 검표를 시도한 경우.
```json
{ "code": "ENTRY_SCANNER_NOT_AUTHORIZED", "data": null, "msg": "이 공연의 검표 권한이 없습니다." }
```

### 3.14 SETTLEMENT — 정산 분배 (핵심)

**SETTLEMENT_NOT_LOCKED — 409**
집계 확정·정산 잠금 전에 release를 시도한 경우.
```json
{ "code": "SETTLEMENT_NOT_LOCKED", "data": null, "msg": "집계가 확정되지 않아 정산을 실행할 수 없습니다." }
```

**SETTLEMENT_DISPUTE_PERIOD — 409**
이의제기 기간(48시간) 중에는 release가 활성화되지 않는다.
```json
{ "code": "SETTLEMENT_DISPUTE_PERIOD", "data": null, "msg": "이의제기 기간이 끝난 뒤 정산할 수 있습니다. (2026-09-20 18:00 이후)" }
```

**SETTLEMENT_RELEASE_NOT_ACTIVE — 409**
컨트랙트의 release가 아직 활성화되지 않은 상태에서 팀이 수령을 시도한 경우.
```json
{ "code": "SETTLEMENT_RELEASE_NOT_ACTIVE", "data": null, "msg": "아직 정산이 실행되지 않았습니다." }
```

**SETTLEMENT_ALREADY_RELEASED — 409**
```json
{ "code": "SETTLEMENT_ALREADY_RELEASED", "data": null, "msg": "이미 정산이 완료된 공연입니다." }
```

**SETTLEMENT_AGGREGATE_MISMATCH — 409**
온체인 선택 카운터 합과 서버 집계가 불일치. 대사 실패이므로 자동 정산을 중단하고 관리자 확인으로 넘긴다.
```json
{ "code": "SETTLEMENT_AGGREGATE_MISMATCH", "data": null, "msg": "집계 검증에 실패했습니다. 관리자 확인 후 정산이 진행됩니다." }
```

**SETTLEMENT_NOT_PARTICIPANT — 403**
참여팀이 아닌 계정이 팀별 정산 내역 조회를 시도한 경우. 공개 검증 페이지 API는 인증 없이 열려 있다.
```json
{ "code": "SETTLEMENT_NOT_PARTICIPANT", "data": null, "msg": "참여팀만 정산 내역을 조회할 수 있습니다." }
```

### 3.15 REDEEM — 팀 환급 (YoYo → 원화)

release로 팀 지갑에 들어온 YoYo를 소각하고 금융망으로 원화를 이체하는 구간이다.

**REDEEM_NOTHING_TO_REDEEM — 409**
환급할 YoYo 잔액이 없는 경우.
```json
{ "code": "REDEEM_NOTHING_TO_REDEEM", "data": null, "msg": "환급할 정산 금액이 없습니다." }
```

**REDEEM_ACCOUNT_NOT_REGISTERED — 409**
팀의 원화 수령 계좌가 등록되지 않은 경우.
```json
{ "code": "REDEEM_ACCOUNT_NOT_REGISTERED", "data": null, "msg": "환급받을 계좌를 먼저 등록해 주세요." }
```

**REDEEM_ALREADY_REQUESTED — 409**
```json
{ "code": "REDEEM_ALREADY_REQUESTED", "data": null, "msg": "이미 환급 요청이 접수되었습니다." }
```

**REDEEM_BANK_TRANSFER_FAILED — 502**
소각은 됐으나 금융망 이체가 실패한 경우. 보상 처리 대상이며 잔액 불일치가 생기므로 즉시 알림을 띄운다.
```json
{ "code": "REDEEM_BANK_TRANSFER_FAILED", "data": null, "msg": "환급 이체가 지연되고 있습니다. 확인 후 순차적으로 처리됩니다." }
```

### 3.16 확장 기능 코드 (P1/P2 — MVP 제외)

기획 v2.1에서 후순위로 내려간 기능들이다. **MVP 구현 시에는 이 코드를 만들지 않는다.**

교환 (P1)

**EXCHANGE_NOT_ALLOWED — 409**
```json
{ "code": "EXCHANGE_NOT_ALLOWED", "data": null, "msg": "이 티켓은 교환할 수 없습니다." }
```

**EXCHANGE_OPTION_UNAVAILABLE — 409**
```json
{ "code": "EXCHANGE_OPTION_UNAVAILABLE", "data": null, "msg": "선택한 회차의 잔여 좌석이 없습니다." }
```

유료 재판매 (P2). 가격 상한은 개정 공연법(2026-08-28 시행)을 컨트랙트로 코드화한 지점이며, 기준은 티켓 타입 정가가 아니라 **해당 티켓의 실제 최초 구매가**다.

**RESALE_PRICE_EXCEEDS_ORIGINAL — 400**
```json
{ "code": "RESALE_PRICE_EXCEEDS_ORIGINAL", "data": null, "msg": "재판매 가격은 최초 구매가(45,000원)를 넘을 수 없습니다." }
```

**RESALE_NOT_ALLOWED — 403**
```json
{ "code": "RESALE_NOT_ALLOWED", "data": null, "msg": "이 공연은 재판매를 허용하지 않습니다." }
```

NFT 티켓 (P2 — 시간이 남으면 마지막에 붙이는 부가 기능). 도입 시 관객 지갑이 함께 필요해진다.

**NFT_MINT_PENDING — 409**
```json
{ "code": "NFT_MINT_PENDING", "data": null, "msg": "NFT 티켓 발급이 진행 중입니다. 잠시 후 다시 확인해 주세요." }
```

**NFT_MINT_FAILED — 500**
일반 티켓은 이미 발급된 상태이므로 티켓 자체는 유효하다. NFT 발급만 재시도 대상이다.
```json
{ "code": "NFT_MINT_FAILED", "data": null, "msg": "NFT 발급에 실패했습니다. 티켓은 정상 사용할 수 있습니다." }
```

**NFT_TRANSFER_NOT_ALLOWED — 409**
`_update` 오버라이드로 플랫폼 경유 이전만 허용한다.
```json
{ "code": "NFT_TRANSFER_NOT_ALLOWED", "data": null, "msg": "플랫폼을 통해서만 이전할 수 있습니다." }
```

### 3.18 WEBAUTHN — 결제 전 본인 확인(패스키) **[2026-09-24 신설]**

API v7 §7.W(API-webauthn-01~04). 기기 생체 인증 자체는 기기 안에서 끝나고 서버는 기기 키의 서명만 검증한다. (§3.17은 코드에만 있는 `FILE_*` 자리로 비워 둔다.)

**WEBAUTHN_STEP_UP_REQUIRED — 403**
본인 확인 스위치가 켜져 있는데 보호 동작 — API-payment-03(결제 보고) · API-rule-05(규칙 동의 보고) · API-performance-14(보증금 보고) · API-settlement-08(정산 조기 동의) · API-settlement-05(정산금 지급) — 에 유효한 `X-Step-Up-Token`이 없다. 헤더 없음·만료(120초)·이미 소비·**다른 동작이나 다른 대상**에 발급된 토큰·다른 회원의 토큰. 권한·소유 검사가 먼저 돌기 때문에 이 코드는 "그 동작을 할 수 있는 사람"에게만 나온다. 클라이언트는 에러 화면이 아니라 **본인 확인 단계로 되돌아간다**. 스위치가 꺼져 있으면 발생하지 않는다.
```json
{ "code": "WEBAUTHN_STEP_UP_REQUIRED", "data": null, "msg": "이 작업 전에 본인 확인이 필요합니다." }
```

**WEBAUTHN_VERIFICATION_FAILED — 400**
기기 등록(API-webauthn-02) 또는 본인 확인(API-webauthn-04)의 검증 실패 — 챌린지 없음·만료(300초)·재사용, origin·rpId 불일치, 사용자 확인(UV) 플래그 없음, 서명 불일치, signCount 역행, 등록되지 않았거나 다른 회원의 credential. 원인을 가르지 않는다(공격자에게 어느 단계에서 막혔는지 알려 주지 않는다). 상세 원인은 서버 로그에만 남긴다. 클라이언트는 옵션을 다시 받아 한 번 더 시도하게 한다.
```json
{ "code": "WEBAUTHN_VERIFICATION_FAILED", "data": null, "msg": "본인 확인에 실패했습니다. 다시 시도해 주세요." }
```

---

## 4. 확정된 설계 판단

| 항목 | 결정 | 근거 |
| --- | --- | --- |
| `code` 타입 | 문자열 enum | 같은 HTTP status 안에서 클라이언트 동작이 갈리는 케이스가 다수 존재. 숫자로는 분기 불가 |
| 성공 판별 | `code === "SUCCESS"` | 201·202가 정상 응답이라 status 비교로는 부족 |
| `success` 불리언 필드 | 사용하지 않음 | `code`가 그 역할을 겸함. 필드 수를 3개로 유지 |
| 실패 시 `data` | 예외 없이 `null` | 특례를 두지 않아 클라이언트 타입이 단순해진다. 필드별 검증 상세는 `msg` 문장으로 전달 |
| 래퍼 필드 추가 | 하지 않음 | 3필드 기본형 유지. 부가 정보는 `data` 내부 구조로만 표현 |
| 성공 시 `msg` | 빈 문자열 기본 | 토스트 문구가 필요한 경우에만 채운다 |
| 공연 도메인 용어 | `performance` | `show`는 MySQL 예약어. 테이블·API·코드 용어를 함께 통일 |
| 관객 지갑 코드 | 두지 않음 | 기획 v2.1에서 관객 지갑 제거. `WALLET_*`는 팀 지갑·운영지갑 전용 |
| NFT 관련 코드 | §3.16으로 분리 | P2 부가 기능. MVP 구현 대상이 아니다 |
| 굿즈(MD) 코드 | 삭제 | 8/27 범위 재조정으로 기능 자체가 제외됨 |

## 5. 미결 사항 (기획 §10 연동)

아래가 정해지면 관련 코드의 발생 조건을 확정해야 한다.

- **결제·정산 자금 흐름의 실패 보상 경계** — 금융망 입금 → mint → 분배 → burn → 출금 중 어느 단계까지 자동 보상할지. `COIN_*`·`REDEEM_*`의 재시도 정책이 여기에 달려 있다.
- **환급 방식** — 팀 수동 출금 vs release 시 자동 환급. 자동이면 `REDEEM_ALREADY_REQUESTED`의 의미가 달라진다.
- **준비금 증명 조회 주기** — 금융망 잔액 조회 주기가 `COIN_RESERVE_MISMATCH`의 판정 시점을 결정한다.
- **개별 취소 수수료 구간** — `REFUND_DEADLINE_PASSED`의 경계.
- **팀 지갑 가스 충전 절차** — `WALLET_GAS_INSUFFICIENT`를 사용자에게 노출할지, 운영지갑 대납으로 감출지.
