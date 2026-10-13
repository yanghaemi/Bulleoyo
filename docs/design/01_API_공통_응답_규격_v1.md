# API 공통 응답 규격 v1 (대체됨)

> ⚠️ **이 문서는 v1이며 [01_API_공통_응답_규격.md](./01_API_공통_응답_규격.md)(현행)로 대체되었습니다.** 비교·회귀 목적으로만 보존합니다.
> 대체 사유: 2026-08-27 팀 결정으로 래퍼를 `{ code, data, msg }` 3필드 기본형으로 변경.
>
> 작성일 2026-08-27 · 상태: 보존용

---

## 1. 래퍼 구조

모든 REST 응답은 성공·실패 구분 없이 동일한 래퍼를 사용한다.

```json
{
  "success": true,
  "data": { },
  "error": null
}
```

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "TICKET_SOLD_OUT",
    "message": "선택한 티켓이 모두 판매되었습니다."
  }
}
```

| 항목 | 규칙 |
|------|------|
| `success` | 불리언. 실패 시 `false` |
| `data` | 성공 시 payload, 실패 시 항상 `null` |
| `error` | 성공 시 항상 `null`, 실패 시 `{ code, message }` |
| `error.code` | 대문자 스네이크. `도메인_사유` 형식. 클라이언트 분기 키 |
| `error.message` | 사용자에게 그대로 보여줄 수 있는 한국어 문장 |
| HTTP status | body와 별개로 항상 의미에 맞게 설정. status와 `success`는 항상 일치 |

### 목록 응답

```json
{
  "success": true,
  "data": {
    "items": [ { "showId": 12, "title": "합정 3밴드 합동공연" } ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 37, "hasNext": true }
  },
  "error": null
}
```

### 비동기 처리 응답

```json
{
  "success": true,
  "data": { "jobId": "mint_01J8XQ", "status": "IN_PROGRESS", "pollAfterMs": 1500 },
  "error": null
}
```

---

## 2. HTTP status 매핑

| status | 사용 상황 |
|--------|-----------|
| 200 | 조회·수정 성공 |
| 201 | 리소스 생성 성공 |
| 202 | 비동기 작업 접수 |
| 400 | 요청 값 자체가 잘못됨 |
| 401 | 인증 실패·토큰 문제·QR 서명 검증 실패 |
| 403 | 인증됨, 권한 없음 |
| 404 | 리소스 없음 |
| 409 | 현재 상태에서 허용되지 않는 요청 |
| 410 | 만료되어 사라진 리소스 |
| 429 | 호출 한도 초과 |
| 500 | 서버 내부 오류 |
| 502 | 외부 시스템 오류 |
| 504 | 외부 시스템 타임아웃 |

---

## 3. 코드별 예시

각 항목은 `발생 조건` + 실제 응답 body다. 래퍼는 모두 동일하므로 `error` 부분만 달라진다.

### 3.1 COMMON — 공통

**COMMON_VALIDATION_FAILED — 400**
요청 body·쿼리 파라미터가 검증 규칙을 위반한 경우.
```json
{ "success": false, "data": null, "error": { "code": "COMMON_VALIDATION_FAILED", "message": "공연 제목은 1자 이상 100자 이하로 입력해 주세요." } }
```

**COMMON_UNAUTHORIZED — 401**
토큰이 없거나 인증 헤더가 누락된 경우.
```json
{ "success": false, "data": null, "error": { "code": "COMMON_UNAUTHORIZED", "message": "로그인이 필요합니다." } }
```

**COMMON_FORBIDDEN — 403**
로그인은 했으나 해당 리소스에 대한 권한이 없는 경우.
```json
{ "success": false, "data": null, "error": { "code": "COMMON_FORBIDDEN", "message": "이 작업을 수행할 권한이 없습니다." } }
```

**COMMON_NOT_FOUND — 404**
경로의 리소스를 찾을 수 없는 경우 (도메인 전용 코드가 없을 때만 사용).
```json
{ "success": false, "data": null, "error": { "code": "COMMON_NOT_FOUND", "message": "요청한 정보를 찾을 수 없습니다." } }
```

**COMMON_CONFLICT — 409**
동시 요청으로 인한 일반적인 상태 충돌.
```json
{ "success": false, "data": null, "error": { "code": "COMMON_CONFLICT", "message": "다른 요청이 처리 중입니다. 잠시 후 다시 시도해 주세요." } }
```

**COMMON_TOO_MANY_REQUESTS — 429**
rate limit 초과 (예매 매크로 차단 룰 포함).
```json
{ "success": false, "data": null, "error": { "code": "COMMON_TOO_MANY_REQUESTS", "message": "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." } }
```

**COMMON_INTERNAL_ERROR — 500**
처리되지 않은 서버 예외. 상세 원인은 로그에만 남긴다.
```json
{ "success": false, "data": null, "error": { "code": "COMMON_INTERNAL_ERROR", "message": "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." } }
```

### 3.2 AUTH — 인증·회원

**AUTH_INVALID_CREDENTIALS — 401**
```json
{ "success": false, "data": null, "error": { "code": "AUTH_INVALID_CREDENTIALS", "message": "아이디 또는 비밀번호가 올바르지 않습니다." } }
```

**AUTH_TOKEN_EXPIRED — 401**
액세스 토큰 만료. 클라이언트는 이 코드에서만 토큰 재발급을 시도한다.
```json
{ "success": false, "data": null, "error": { "code": "AUTH_TOKEN_EXPIRED", "message": "로그인이 만료되었습니다. 다시 로그인해 주세요." } }
```

**AUTH_TOKEN_INVALID — 401**
서명 불일치·위조된 토큰. 재발급 시도 없이 즉시 로그아웃 처리.
```json
{ "success": false, "data": null, "error": { "code": "AUTH_TOKEN_INVALID", "message": "인증 정보가 올바르지 않습니다." } }
```

**AUTH_EMAIL_DUPLICATED — 409**
```json
{ "success": false, "data": null, "error": { "code": "AUTH_EMAIL_DUPLICATED", "message": "이미 가입된 이메일입니다." } }
```

### 3.3 WALLET — 지갑·키 관리

**WALLET_CREATION_FAILED — 500**
회원가입 시 커스터디얼 지갑 생성 실패. 가입 트랜잭션 전체를 롤백한다.
```json
{ "success": false, "data": null, "error": { "code": "WALLET_CREATION_FAILED", "message": "지갑 생성에 실패했습니다. 잠시 후 다시 시도해 주세요." } }
```

**WALLET_NOT_FOUND — 404**
```json
{ "success": false, "data": null, "error": { "code": "WALLET_NOT_FOUND", "message": "지갑 정보를 찾을 수 없습니다." } }
```

**WALLET_KEY_DECRYPT_FAILED — 500**
KEK 미주입·DEK 손상 등 서명 직전 복호화 실패. 원인은 절대 노출하지 않는다.
```json
{ "success": false, "data": null, "error": { "code": "WALLET_KEY_DECRYPT_FAILED", "message": "요청을 처리할 수 없습니다. 관리자에게 문의해 주세요." } }
```

### 3.4 SHOW — 공연

**SHOW_NOT_FOUND — 404**
```json
{ "success": false, "data": null, "error": { "code": "SHOW_NOT_FOUND", "message": "공연을 찾을 수 없습니다." } }
```

**SHOW_NOT_OWNER — 403**
공연 주최자가 아닌 계정이 수정·삭제를 시도한 경우.
```json
{ "success": false, "data": null, "error": { "code": "SHOW_NOT_OWNER", "message": "공연 주최자만 수정할 수 있습니다." } }
```

**SHOW_INVALID_STATUS — 409**
현재 공연 상태에서 허용되지 않는 전이를 요청한 경우.
```json
{ "success": false, "data": null, "error": { "code": "SHOW_INVALID_STATUS", "message": "판매가 종료된 공연은 수정할 수 없습니다." } }
```

**SHOW_ALREADY_ON_SALE — 409**
판매 시작 이후 참여팀·정산 규칙 변경을 시도한 경우.
```json
{ "success": false, "data": null, "error": { "code": "SHOW_ALREADY_ON_SALE", "message": "티켓 판매가 시작되어 변경할 수 없습니다." } }
```

**SHOW_DATE_INVALID — 400**
공연 일시가 과거이거나 예매 마감이 공연일 이후인 경우.
```json
{ "success": false, "data": null, "error": { "code": "SHOW_DATE_INVALID", "message": "공연 일시와 예매 마감 일시를 다시 확인해 주세요." } }
```

### 3.5 TEAM — 참여팀

**TEAM_NOT_FOUND — 404**
```json
{ "success": false, "data": null, "error": { "code": "TEAM_NOT_FOUND", "message": "공연팀을 찾을 수 없습니다." } }
```

**TEAM_ALREADY_JOINED — 409**
```json
{ "success": false, "data": null, "error": { "code": "TEAM_ALREADY_JOINED", "message": "이미 이 공연에 참여한 팀입니다." } }
```

**TEAM_INVITE_EXPIRED — 410**
```json
{ "success": false, "data": null, "error": { "code": "TEAM_INVITE_EXPIRED", "message": "초대가 만료되었습니다. 주최자에게 재요청해 주세요." } }
```

**TEAM_MIN_COUNT_NOT_MET — 409**
공동 공연으로 생성했으나 참여팀이 2팀 미만인 상태로 판매 시작을 시도한 경우.
```json
{ "success": false, "data": null, "error": { "code": "TEAM_MIN_COUNT_NOT_MET", "message": "공동 공연은 참여팀이 2팀 이상이어야 합니다." } }
```

### 3.6 RULE — 정산 규칙 (핵심)

**RULE_RATIO_SUM_INVALID — 400**
균등·관객선택·기획기여 비율의 합이 100%가 아닌 경우.
```json
{ "success": false, "data": null, "error": { "code": "RULE_RATIO_SUM_INVALID", "message": "분배 비율의 합이 100%가 되어야 합니다." } }
```

**RULE_NOT_AGREED_BY_ALL — 409**
모든 참여팀이 `agreeToRules`를 호출하기 전에 판매 시작을 시도한 경우.
```json
{ "success": false, "data": null, "error": { "code": "RULE_NOT_AGREED_BY_ALL", "message": "모든 참여팀이 정산 규칙에 동의해야 판매를 시작할 수 있습니다." } }
```

**RULE_ALREADY_LOCKED — 409**
`startSale()` 이후 규칙 수정을 시도한 경우. 컨트랙트에서도 revert된다.
```json
{ "success": false, "data": null, "error": { "code": "RULE_ALREADY_LOCKED", "message": "정산 규칙이 확정되어 변경할 수 없습니다." } }
```

**RULE_HASH_MISMATCH — 409**
동의 요청의 `rulesHash`가 현재 서버 규칙의 해시와 다른 경우. 규칙이 중간에 바뀐 상황.
```json
{ "success": false, "data": null, "error": { "code": "RULE_HASH_MISMATCH", "message": "정산 규칙이 변경되었습니다. 내용을 다시 확인한 뒤 동의해 주세요." } }
```

**RULE_COMMON_COST_EXCEEDS_REVENUE — 409**
차감할 공통 비용이 총 매출을 초과해 분배액이 음수가 되는 경우.
```json
{ "success": false, "data": null, "error": { "code": "RULE_COMMON_COST_EXCEEDS_REVENUE", "message": "공통 비용이 총 판매 금액을 초과했습니다." } }
```

### 3.7 TICKET — 티켓·예매

**TICKET_OPTION_NOT_FOUND — 404**
```json
{ "success": false, "data": null, "error": { "code": "TICKET_OPTION_NOT_FOUND", "message": "선택한 티켓 종류를 찾을 수 없습니다." } }
```

**TICKET_SALE_NOT_STARTED — 409**
```json
{ "success": false, "data": null, "error": { "code": "TICKET_SALE_NOT_STARTED", "message": "아직 예매가 시작되지 않았습니다." } }
```

**TICKET_SALE_CLOSED — 409**
```json
{ "success": false, "data": null, "error": { "code": "TICKET_SALE_CLOSED", "message": "예매가 마감되었습니다." } }
```

**TICKET_SOLD_OUT — 409**
Redis 재고 차감 실패. 동시 예매 경합에서 밀린 경우.
```json
{ "success": false, "data": null, "error": { "code": "TICKET_SOLD_OUT", "message": "선택한 티켓이 모두 판매되었습니다." } }
```

**TICKET_PURCHASE_LIMIT_EXCEEDED — 409**
1인 구매 수량 제한 초과.
```json
{ "success": false, "data": null, "error": { "code": "TICKET_PURCHASE_LIMIT_EXCEEDED", "message": "1인당 최대 2장까지 구매할 수 있습니다." } }
```

**TICKET_TEAM_CHOICE_REQUIRED — 400**
공동 공연 예매인데 관람 목적 팀을 선택하지 않은 경우. 이 값이 정산 집계의 입력이므로 필수다.
```json
{ "success": false, "data": null, "error": { "code": "TICKET_TEAM_CHOICE_REQUIRED", "message": "보고 싶은 팀을 선택해 주세요." } }
```

**TICKET_TEAM_CHOICE_INVALID — 400**
선택한 팀이 해당 공연의 참여팀이 아니거나, 허용 개수를 초과한 경우.
```json
{ "success": false, "data": null, "error": { "code": "TICKET_TEAM_CHOICE_INVALID", "message": "이 공연에 참여하지 않는 팀입니다." } }
```

**TICKET_NOT_OWNED — 403**
현재 소유자가 아닌 계정이 QR 발급·양도·굿즈 구매를 시도한 경우.
```json
{ "success": false, "data": null, "error": { "code": "TICKET_NOT_OWNED", "message": "본인 소유의 티켓이 아닙니다." } }
```

**TICKET_ALREADY_USED — 409**
```json
{ "success": false, "data": null, "error": { "code": "TICKET_ALREADY_USED", "message": "이미 입장 처리된 티켓입니다." } }
```

**TICKET_CANCELED — 409**
```json
{ "success": false, "data": null, "error": { "code": "TICKET_CANCELED", "message": "취소된 티켓입니다." } }
```

### 3.8 PAYMENT — 결제 (금융망 API)

**PAYMENT_ALREADY_PAID — 409**
동일 주문에 대한 중복 결제 요청.
```json
{ "success": false, "data": null, "error": { "code": "PAYMENT_ALREADY_PAID", "message": "이미 결제가 완료된 주문입니다." } }
```

**PAYMENT_AMOUNT_MISMATCH — 409**
클라이언트가 보낸 금액과 서버 계산 금액이 다른 경우. 위조 시도로 간주하고 로그를 남긴다.
```json
{ "success": false, "data": null, "error": { "code": "PAYMENT_AMOUNT_MISMATCH", "message": "결제 금액이 일치하지 않습니다. 처음부터 다시 시도해 주세요." } }
```

**PAYMENT_INSUFFICIENT_BALANCE — 409**
```json
{ "success": false, "data": null, "error": { "code": "PAYMENT_INSUFFICIENT_BALANCE", "message": "계좌 잔액이 부족합니다." } }
```

**PAYMENT_REQUEST_FAILED — 502**
금융망 API가 오류를 반환한 경우. 재고는 즉시 원복한다.
```json
{ "success": false, "data": null, "error": { "code": "PAYMENT_REQUEST_FAILED", "message": "결제 처리 중 오류가 발생했습니다. 결제는 진행되지 않았습니다." } }
```

**PAYMENT_TIMEOUT — 504**
응답을 받지 못한 상태. 결제 성공 여부가 불확실하므로 사용자에게 중복 결제를 유도하지 않는 문구를 쓴다.
```json
{ "success": false, "data": null, "error": { "code": "PAYMENT_TIMEOUT", "message": "결제 결과 확인이 지연되고 있습니다. 주문 내역에서 상태를 확인해 주세요." } }
```

### 3.9 MINT / CHAIN — NFT 발급·온체인

**MINT_IN_PROGRESS — 409**
민팅이 아직 확정되지 않은 상태에서 QR 발급·양도를 시도한 경우.
```json
{ "success": false, "data": null, "error": { "code": "MINT_IN_PROGRESS", "message": "NFT 티켓 발급이 진행 중입니다. 잠시 후 다시 확인해 주세요." } }
```

**MINT_FAILED — 500**
결제는 성공했으나 민팅이 최종 실패한 경우. 자동 환불 보상 트랜잭션을 걸고 이 코드를 반환한다.
```json
{ "success": false, "data": null, "error": { "code": "MINT_FAILED", "message": "티켓 발급에 실패했습니다. 결제 금액은 자동 환불됩니다." } }
```

**CHAIN_TX_TIMEOUT — 504**
```json
{ "success": false, "data": null, "error": { "code": "CHAIN_TX_TIMEOUT", "message": "블록체인 처리가 지연되고 있습니다. 잠시 후 상태를 다시 확인해 주세요." } }
```

**CHAIN_GAS_INSUFFICIENT — 500**
운영지갑 가스 부족. 시연 전 사전 확보 대상이며 알림 대상 오류다.
```json
{ "success": false, "data": null, "error": { "code": "CHAIN_GAS_INSUFFICIENT", "message": "요청을 처리할 수 없습니다. 관리자에게 문의해 주세요." } }
```

**CHAIN_NONCE_CONFLICT — 500**
nonce 큐 직렬화 실패. 서버 내부에서 재시도하고, 최종 실패 시에만 노출한다.
```json
{ "success": false, "data": null, "error": { "code": "CHAIN_NONCE_CONFLICT", "message": "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." } }
```

### 3.10 REFUND — 취소·환불

**REFUND_DEADLINE_PASSED — 409**
취소 마감(예: 공연 당일) 이후 취소를 시도한 경우.
```json
{ "success": false, "data": null, "error": { "code": "REFUND_DEADLINE_PASSED", "message": "취소 가능 기간이 지났습니다." } }
```

**REFUND_ALREADY_REQUESTED — 409**
```json
{ "success": false, "data": null, "error": { "code": "REFUND_ALREADY_REQUESTED", "message": "이미 취소 요청이 접수된 티켓입니다." } }
```

**REFUND_AFTER_SETTLEMENT_LOCK — 409**
정산이 잠긴 이후의 환불 요청. 온체인 회수가 불가하므로 오프체인 준비금 정책으로 넘긴다.
```json
{ "success": false, "data": null, "error": { "code": "REFUND_AFTER_SETTLEMENT_LOCK", "message": "정산이 완료된 공연은 앱에서 취소할 수 없습니다. 고객센터로 문의해 주세요." } }
```

**REFUND_TRANSFER_FAILED — 502**
환불 이체가 금융망에서 실패한 경우. 상태는 재시도 대기로 남긴다.
```json
{ "success": false, "data": null, "error": { "code": "REFUND_TRANSFER_FAILED", "message": "환불 처리가 지연되고 있습니다. 확인 후 순차적으로 처리됩니다." } }
```

### 3.11 TRANSFER — 양도(선물)·재판매

**TRANSFER_LINK_NOT_FOUND — 404**
```json
{ "success": false, "data": null, "error": { "code": "TRANSFER_LINK_NOT_FOUND", "message": "유효하지 않은 선물 링크입니다." } }
```

**TRANSFER_LINK_EXPIRED — 410**
```json
{ "success": false, "data": null, "error": { "code": "TRANSFER_LINK_EXPIRED", "message": "선물 링크가 만료되었습니다. 보낸 분에게 다시 요청해 주세요." } }
```

**TRANSFER_LINK_ALREADY_USED — 409**
이미 다른 사용자가 수락한 링크.
```json
{ "success": false, "data": null, "error": { "code": "TRANSFER_LINK_ALREADY_USED", "message": "이미 사용된 선물 링크입니다." } }
```

**TRANSFER_SELF_NOT_ALLOWED — 400**
```json
{ "success": false, "data": null, "error": { "code": "TRANSFER_SELF_NOT_ALLOWED", "message": "자신에게는 선물할 수 없습니다." } }
```

**TRANSFER_NOT_ALLOWED — 409**
입장 완료·취소된 티켓이거나, 공연 시작 이후 양도를 시도한 경우.
```json
{ "success": false, "data": null, "error": { "code": "TRANSFER_NOT_ALLOWED", "message": "이 티켓은 더 이상 양도할 수 없습니다." } }
```

**RESALE_PRICE_EXCEEDS_ORIGINAL — 400**
재판매 가격이 해당 티켓의 실제 최초 구매가를 초과한 경우. 개정 공연법(2026-08-28 시행)을 컨트랙트로 코드화한 지점이며, 컨트랙트에서도 revert된다.
```json
{ "success": false, "data": null, "error": { "code": "RESALE_PRICE_EXCEEDS_ORIGINAL", "message": "재판매 가격은 최초 구매가(45,000원)를 넘을 수 없습니다." } }
```

### 3.12 ENTRY — 입장·QR 검표

**ENTRY_QR_EXPIRED — 401**
동적 QR의 유효기간이 지난 경우. 관객 화면에서 자동 재발급한다.
```json
{ "success": false, "data": null, "error": { "code": "ENTRY_QR_EXPIRED", "message": "QR이 만료되었습니다. 화면을 새로 고쳐 주세요." } }
```

**ENTRY_QR_SIGNATURE_INVALID — 401**
서명 검증 실패. 캡처·복제 QR로 간주하고 검표 이력에 기록한다.
```json
{ "success": false, "data": null, "error": { "code": "ENTRY_QR_SIGNATURE_INVALID", "message": "유효하지 않은 QR입니다." } }
```

**ENTRY_ALREADY_ENTERED — 409**
재사용 차단. 검표 화면에 최초 입장 시각을 함께 보여준다.
```json
{ "success": false, "data": null, "error": { "code": "ENTRY_ALREADY_ENTERED", "message": "이미 입장 처리된 티켓입니다. (최초 입장 19:12)" } }
```

**ENTRY_NOT_IN_TIME_WINDOW — 409**
입장 허용 시간대(예: 공연 2시간 전 ~ 시작 후 1시간) 밖의 스캔.
```json
{ "success": false, "data": null, "error": { "code": "ENTRY_NOT_IN_TIME_WINDOW", "message": "입장 가능 시간이 아닙니다." } }
```

**ENTRY_SCANNER_NOT_AUTHORIZED — 403**
해당 공연의 관계자로 등록되지 않은 계정이 검표를 시도한 경우.
```json
{ "success": false, "data": null, "error": { "code": "ENTRY_SCANNER_NOT_AUTHORIZED", "message": "이 공연의 검표 권한이 없습니다." } }
```

### 3.13 SETTLEMENT — 정산 (핵심)

**SETTLEMENT_NOT_LOCKED — 409**
집계 확정·정산 잠금 전에 release를 시도한 경우.
```json
{ "success": false, "data": null, "error": { "code": "SETTLEMENT_NOT_LOCKED", "message": "집계가 확정되지 않아 정산을 실행할 수 없습니다." } }
```

**SETTLEMENT_DISPUTE_PERIOD — 409**
이의제기 기간(48시간) 중에는 release가 활성화되지 않는다.
```json
{ "success": false, "data": null, "error": { "code": "SETTLEMENT_DISPUTE_PERIOD", "message": "이의제기 기간이 끝난 뒤 정산할 수 있습니다. (2026-09-20 18:00 이후)" } }
```

**SETTLEMENT_ALREADY_RELEASED — 409**
```json
{ "success": false, "data": null, "error": { "code": "SETTLEMENT_ALREADY_RELEASED", "message": "이미 정산이 완료된 공연입니다." } }
```

**SETTLEMENT_AGGREGATE_MISMATCH — 409**
온체인 이벤트 집계와 서버 집계가 불일치. 대사 실패이므로 자동 정산을 중단하고 관리자 확인으로 넘긴다.
```json
{ "success": false, "data": null, "error": { "code": "SETTLEMENT_AGGREGATE_MISMATCH", "message": "집계 검증에 실패했습니다. 관리자 확인 후 정산이 진행됩니다." } }
```

**SETTLEMENT_NOT_PARTICIPANT — 403**
참여팀이 아닌 계정이 팀별 정산 내역 조회를 시도한 경우. 단, 공개 검증 페이지 API는 인증 없이 열려 있다.
```json
{ "success": false, "data": null, "error": { "code": "SETTLEMENT_NOT_PARTICIPANT", "message": "참여팀만 정산 내역을 조회할 수 있습니다." } }
```

### 3.14 MD — 굿즈 (범위 유지 시)

**MD_NOT_TICKET_HOLDER — 403**
유효한 티켓 소유자만 구매 가능.
```json
{ "success": false, "data": null, "error": { "code": "MD_NOT_TICKET_HOLDER", "message": "예매자만 굿즈를 구매할 수 있습니다." } }
```

**MD_OUT_OF_STOCK — 409**
```json
{ "success": false, "data": null, "error": { "code": "MD_OUT_OF_STOCK", "message": "품절된 상품입니다." } }
```

---


---


---

## 4. 결정이 필요한 항목 (v1 시점의 미결 사항)

- **필드별 검증 오류 표현**: `error`가 `code`, `message` 두 개로 고정되어 필드 단위 오류를 구조적으로 전달할 수 없다. `error.details` 추가 여부 결정 필요.
- **`success` 필드 유지 여부**: HTTP status로도 판별 가능하므로 중복이다.
- **재시도 가능 여부 노출**: `error.retryable` 추가 검토.

> 위 3건은 현행 문서(v2)에서 모두 결정 완료 — `code` 문자열 enum 채택, `success` 제거, 필드 추가 없음.
