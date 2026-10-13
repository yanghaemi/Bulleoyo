# API 명세서 v4 — 전부 코인(KRWS) · 비수탁 지갑 · 사용자 서명 tx

> 대상: S15P21B204 (소규모 공연 티켓팅·공동 정산 플랫폼) · 작성 2026-08-28(금) · 개정 2026-08-31(일) v3 · **개정 2026-09-02(수) v4** · 상태: **초안**
>
> 기준: [방향 전환 결정 문서 v1](../planning/06_방향전환_코인전환_v1.md) **(SSOT)** · [API 공통 응답 규격 v3](./01_API_공통_응답_규격.md) · [설계문서 작성계획 v1](./00_설계문서_작성계획_v1.md) §1.7(결정 문서가 덧씌우지 않은 부분만)
>
> 이전 버전(보존, 무수정): [06_API_명세서_v3.md](./06_API_명세서_v3.md) · [06_API_명세서_v2.md](./06_API_명세서_v2.md) · [06_API_명세서_v1.md](./06_API_명세서_v1.md) · **노션 미러**: [API 명세서 DB](https://app.notion.com/p/6c42746d15ab836a9e57811892753f30)
>
> 함께 볼 v4 문서: [요구사항 명세서 v4](./04_요구사항_명세서_v4.md) · [기능 명세서 v4](./05_기능_명세서_v4.md) · [화면설계 v4](./07_화면설계_v4.md) · [ERD v3](./10_ERD_v3.md) · [기획 초안 v3](../planning/01_기획_초안_v3.md)
>
> **v4에서 달라진 것** — ① **결제 레일이 코인 하나로** — 금융망 직접 결제가 사라지고 모든 티켓 대금은 `RevenueSplitter.purchase`로 에스크로에 들어온다(결정 §2.4·P-24). 금융망은 **충전(on-ramp)·팀 원화 출금(off-ramp)** 창구로만 남는다 ② **비수탁 지갑** — 회원당 지갑 1개(Web3Auth MPC 자동 생성 또는 외부 지갑 등록). `wallet` 도메인이 회원 1:1로 재정의되고 API-wallet-01~05가 신설된다 ③ **사용자 서명 tx 패턴(prepare → 서명 → signed-tx → receipt 검증)** 신설 — §0.4. 결제·보증금·규칙 동의·팀 출금 예치가 이 패턴을 쓴다 ④ **`charge` 도메인 신설**(API-charge-01~04) — 해외 카드·국내 카드·가상계좌 충전 ⑤ **`redeem` → `withdraw` 개명**(API-redeem-01·02 삭제 → API-withdraw-01~04). 자동 push 환급이 **리더 서명 예치 → 원화 이체 → burn**으로 바뀐다 ⑥ **금액에 `display` 객체**(원 값 항상 + 표시 통화 환산), **`Accept-Language`**(en 기본·ko) ⑦ **API-coin-02·03·04 신설**(표시 환율 조회·등록, 체인·컨트랙트 설정), **API-verify-02 준비금 공시 부활** ⑧ **API-performance-13·14**(보증금 서명), **API-rule-05**(동의 tx 보고), **API-payment-03**(결제 tx 보고) 신설 ⑨ v3 소셜 OAuth 로그인 API 삭제 → **API-member-01 Web3Auth 로그인/가입**으로 통합 ⑩ 도메인 15 → **16개**, 상세 P0 **76개**
>
> 표기 — **[팀]** 팀 결정 / **[권]** 권고안(이견 시 변경) / **[v4]** 이 버전에서 신설·변경 / **[v4 삭제]** 폐지 / **P1·P2** MVP 제외. 엔드포인트 번호·메서드·경로·이름은 **결정 문서 §9 인벤토리와 글자 단위로 동일**하며 이 문서에서 임의로 만들지 않는다. 에러 코드는 **규격 v3 §3에 있는 것만** 쓰고, 없어서 대체한 코드는 **§18 규격 v4 신설 제안**에 모았다(본문 미사용). 상태값 문자열은 결정 문서 §7 그대로다.
>
> 각 엔드포인트 절의 구성 순서(`## 요구사항` → `## Request` → `### 시스템 처리` → `## Response`)는 노션 `APISpec` DB 행 템플릿 순서를 그대로 옮긴 것이다. 2단계에서 이 절들이 노션 행 본문이 된다.

---

## 0. 공통 규약

> **9/2 팀 결정 — 최소 사이즈 원칙 + Web3Auth 동결**: 결정 문서 §14의 모든 안건을 "사이즈를 늘리지 않는" 쪽으로 확정했다. ① 인증·지갑 = **Web3Auth 단일**(소셜 3종). 자체 이메일 가입·로그인 삭제 → **P1**(F-member-02·10, API-member-02·08, C-02). ② 외부 지갑 연결은 **Web3Auth 모달의 외부 지갑 어댑터**(MetaMask·WalletConnect)로 처리하고 자체 챌린지 서명 API(API-wallet-03·04, F-wallet-05)는 **P1**. C-05는 모달 안내 화면으로 축소. ③ 충전 수단은 **카드만**(해외·국내). 가상계좌 충전·입금 시뮬레이션(F-charge-02, API-charge-04, A-14 `Bank transfer` 탭)은 **P1** — ERD 컬럼은 유지. ④ 체인·컨트랙트 설정은 프론트 환경변수 하드코딩, API-coin-04·F-coin-09는 **P1**. ⑤ 기본 언어 en·통화 USD 고정(국가별 자동 제안 없음, 수동 스위치만). ⑥ 코인 이름은 가칭 **KRWS 그대로 발표**. ⑦ **양도(선물)는 최후순위(P2)** — F-transfer-01~04, API-transfer-01~04, A-09·A-10, `transfer` 테이블 유지·구현 마지막. ⑧ **가스 = Kaia 수수료 대납(fee delegation) 채택 [팀 9/2]** — 사용자 지갑에 KAIA를 넣지 않는다. 사용자 서명 tx는 Kaia `FeeDelegatedSmartContractExecution` 타입으로 프론트(Web3Auth 키 + `@kaiachain/ethers-ext`)가 발신자 서명만 하고, 서버(운영지갑 = fee payer, `web3j` + Kaia `web3j-ext`)가 대납 서명 후 전송한다. 따라서 `signed-tx` 보고 본문은 `txHash`가 아니라 **발신자 서명 RLP**가 되고, 가스 자동 충전(F-wallet-04, API-wallet-05)은 삭제(P1 예비). 외부 지갑은 수수료 대납 서명을 지원하는 **Kaia Wallet만 MVP**, MetaMask는 P1. 나머지(approve+purchase 2단계·잔액 유지·카운터 미갱신·V-01 로그인 유지·모바일 외부 지갑 미지원)는 권고안 확정. 본문에서 위 항목은 제목에 `[P1 — 9/2 최소화]`로 표시했고 본문 서술은 v4 작성 시점 그대로다.

**이 서비스의 자금 원장은 하나다. 플랫폼이 시연용 가상 원화 스테이블코인을 발행·소각·준비금 공시한다**(결정 §2.2·§12.2-0). 발행 로직은 얇은 `CoinIssuerPort` 인터페이스 뒤에 있으며, "인가 발행사 코인으로 교체 가능"이라는 이야기는 §18.4 리스크·Q&A 절에서만 쓴다.

**지갑은 사용자 소유(Web3Auth/외부 지갑)이며, 서버는 사용자 키를 보관하지 않는다**(결정 §2.3·P-2). 서버가 가진 키는 OPERATOR·MINTER·BURNER 3개뿐이고, 이 문서의 어떤 API도 사용자 개인키·니모닉·MPC 샤드를 받거나 반환하지 않는다. v3의 "팀 키를 서버가 보관하고 서명 직전 복호화한다"는 전제는 폐기됐다.

### 0.1 기본

| 항목 | 규칙 |
|------|------|
| base URL | `/api/v1` — 이 문서의 모든 경로는 base를 포함해 전체 경로로 적는다 |
| 리소스 표기 | 복수형 kebab-case, path 변수는 `{performanceId}` 형식(컨벤션 PK 이름과 동일) |
| 인증 | `Authorization: Bearer {accessToken}`. **공개 API**(`GET /api/v1/performances`, `GET /api/v1/performances/{performanceId}`, `GET /api/v1/coin/supply`, `GET /api/v1/coin/rates`, `GET /api/v1/coin/config`, `GET /api/v1/transfers/{token}`, `GET /api/v1/public/reserve-proof`, `GET /api/v1/public/settlement/{shareToken}`)는 헤더 **불필요**하며, 각 절의 "권한: GUEST(인증 불필요)"로 명시한다 |
| 세션 발급 | **[v4]** 회원 세션(JWT access 30분 / refresh 14일)은 ① Web3Auth idToken 검증(API-member-01) ② 자체 이메일 로그인(API-member-02) 두 경로로만 발급된다. Web3Auth idToken 자체를 `Authorization` 헤더로 쓰지 않는다 |
| 검표 링크 토큰 | 입장 API(API-entry-01·02)는 `Authorization` 대신 **`X-Entry-Token: {entryToken}`** 헤더(또는 `entryToken` 쿼리)로 인증할 수 있다. 토큰은 API-performance-10이 발급하며 해당 공연에만 유효하다 |
| 응답 래퍼 | 성공·실패 구분 없이 `{ code, data, msg }` 3필드 고정. 실패 시 `data`는 예외 없이 `null` |
| 성공 판별 | **`code === "SUCCESS"`**. `status === 200` 하드코딩 금지 — 201·202가 정상 응답으로 존재한다 |
| `msg` | 사용자에게 그대로 노출 가능한 문장. **[v4]** `Accept-Language`에 따라 en/ko로 내려간다(§0.6). 성공은 빈 문자열이 기본. **클라이언트가 `msg`로 분기하지 않는다** |
| 시간 | ISO 8601 오프셋 표기. **[v4]** 서버는 요청자의 `timezone`(회원 프로필) 오프셋으로 내려주고 화면이 KST를 병기한다(P-22). 비회원·미설정은 `+09:00`(KST) |
| 금액 | **KRWS 정수**(JSON number, 서버 `BIGINT`). KRWS는 `decimals=0`, 1 KRWS = 1원이라 소수가 없다. 표시 통화 환산은 §0.5 `display` 객체로만 내려간다 |
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

### 0.3 비동기 트랜잭션 규약 (202) — 운영자 tx

운영자(OPERATOR·MINTER·BURNER) 키로 서버가 보내는 온체인 tx와 금융망 이체처럼 즉시 끝나지 않는 작업은 **`202 Accepted` + 작업 식별자**를 반환하고, 클라이언트는 폴링으로 결과를 확인한다. `code`는 `SUCCESS`다.

```json
{ "code": "SUCCESS", "data": { "jobId": "chain_01J8XQ7M2K", "status": "PENDING", "pollAfterMs": 1500 }, "msg": "" }
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `jobId` | string | 작업 식별자. **[v4]** `chain_*` 하나로 통일한다(`chain_job` 단일 테이블. v3의 `발행_*`·`소각_*` 별도 접두는 없어졌다) |
| `status` | string | `PENDING` / `SUBMITTED` / `CONFIRMED` / `FAILED` (결정 §7 `ChainJob.status`) |
| `pollAfterMs` | integer | 다음 폴링까지 권장 대기(ms). 기본 1500, 혼잡 시 서버가 늘려 내려준다 |

폴링 대상은 **`GET /api/v1/chain/jobs/{jobId}`** 하나다(API-chain-01). 확정(`CONFIRMED`) 시 `txHash`(66자)와 `explorerUrl`이 채워지고, `FAILED`면 `failureReason`(규격 코드 문자열)과 `retryable`이 채워진다.

- **`signer_type`** — **[v4]** 모든 `chain_job`은 `signerType`이 `OPERATOR`(서버 키 서명) 또는 `USER`(사용자 지갑 서명 후 해시 보고)다. `USER` job은 서버가 tx를 보내지 않고 **receipt·이벤트 검증만** 하며, 생성 시점부터 `SUBMITTED`로 시작한다(§0.4).
- **`issuer_type`** — 발행 어댑터 감사 컬럼. MVP는 항상 `MOCK`(`MockIssuer`). `EXTERNAL`은 P2 예약값이며 분기 로직은 만들지 않는다(결정 §2.6).
- **재시도**: OPERATOR job은 큐에서 **최대 3회** 자동 재시도하고(비기능 REL-09), 이후 지수 백오프로 시스템이 연장 재시도한다. USER job은 서버가 재전송할 수 없으므로 재시도 대상이 아니고 **receipt 재조회**만 반복한다(최대 120초, 이후 `FAILED`).
- **온체인 반영 목표**: Kaia Kairos 블록 시간이 약 1초라 확정까지 수 초다. 예매 확정 응답은 tx 확정을 기다리지 않으며 온체인 반영 ≤ 60초(PERF-04).
- **nonce**: OPERATOR·MINTER·BURNER 각 지갑의 tx는 지갑별 단일 nonce 직렬 큐로 처리한다. 큐 직렬화 실패는 `CHAIN_NONCE_CONFLICT`.

### 0.4 사용자 서명 tx 규약 (prepare → 서명 → signed-tx → receipt 검증) **[v4 신설]**

결제(`approve`+`purchase`)·보증금(`deposit`)·규칙 동의(`agreeToRules`)·팀 출금 예치(`KRWS.transfer`)는 **사용자 지갑이 서명한다**(결정 §2.5·P-18). 서버는 사용자 키를 갖고 있지 않으므로 tx를 대신 보낼 수 없고, 대신 **플랫폼이 tx를 발의하고 사용자가 서명한다**. 3단계 고정 패턴이다.

**① `POST …/prepare` → `200 OK` + 서명 파라미터**

서버가 서명해야 할 tx를 구성해 내려준다. 프론트는 이 값을 Web3Auth 내장 프로바이더(`eth_sendTransaction`) 또는 연결된 외부 지갑(Kaia Wallet·MetaMask)에 그대로 넘긴다. 사용자가 지갑 앱에서 주소로 직접 송금하는 흐름은 **없다**.

```json
{
  "code": "SUCCESS",
  "data": {
    "signRequests": [
      {
        "kind": "APPROVE",
        "required": true,
        "to": "0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736",
        "data": "0x095ea7b3000000000000000000000000a1b2c3d4e5f60718293a4b5c6d7e8f9012345678000000000000000000000000000000000000000000000000000000000000c350",
        "value": "0x0",
        "chainId": "0x3e9",
        "gas": "0x11170",
        "summary": { "title": "Allow ticket payment", "amount": 50000, "currency": "KRW", "spender": "RevenueSplitter", "spenderAddress": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678" }
      },
      {
        "kind": "PURCHASE",
        "required": true,
        "to": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
        "data": "0x3d7403a3...",
        "value": "0x0",
        "chainId": "0x3e9",
        "gas": "0x30d40",
        "summary": { "title": "Confirm ₩50,000 payment", "amount": 50000, "currency": "KRW", "performanceId": 12, "orderRef": "0x6f7264657231...", "teamIndex": 1 }
      }
    ],
    "gasStatus": { "sufficient": true, "fundingJobId": null },
    "expiresAt": "2026-09-10T20:15:00+09:00"
  },
  "msg": ""
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `signRequests` | array | 서명해야 할 tx 목록. **배열 순서대로** 서명·전송한다 |
| `signRequests[].kind` | string | `APPROVE` / `PURCHASE` / `DEPOSIT` / `AGREE` / `TREASURY_IN`. `chain_job.tx_type`과 같은 값 |
| `signRequests[].required` | boolean | `false`면 생략 가능. `APPROVE`는 현재 allowance가 충분하면 `false`로 내려온다(결정 §2.5 "①의 allowance가 이미 충분하면 ①을 생략") |
| `to`·`data`·`value` | string(hex) | 컨트랙트 주소·calldata·전송 네이티브 값. `value`는 항상 `"0x0"`(KRWS는 ERC-20이다) |
| `chainId` | string(hex) | 항상 `"0x3e9"`(Kaia Kairos, 1001). 프론트는 지갑의 현재 체인이 다르면 전환을 먼저 요청한다 |
| `gas` | string(hex) | 서버 추정 가스 한도 **힌트**. 지갑이 자체 추정치를 쓸 수 있다 |
| `summary` | object | **서명 팝업 직전 사람이 읽을 화면**에 그대로 쓰는 요약(결정 §2.3 "tx의 `to`·`data`를 서명 전 화면에 사람이 읽을 수 있게 표시"). `title`은 `Accept-Language`에 맞춰 내려온다 |
| `gasStatus` | object | `sufficient=false`면 서버가 운영지갑에서 KAIA 자동 충전 job을 걸고 `fundingJobId`를 준다. 프론트는 그 job이 `CONFIRMED`가 된 뒤 서명을 요청한다(P-3) |
| `expiresAt` | string | 서명 파라미터 유효 시각. 주문의 15분 만료, 규칙 해시 변경 등에 연동된다 |

**② 프론트가 서명·전송** — 지갑이 반환한 `txHash`를 모은다. 사용자가 팝업을 닫으면(거부) 서버에 아무것도 보고하지 않는다. 주문은 `PENDING_PAYMENT`로 남아 15분 뒤 만료되고, 이미 충전된 코인은 **사용자 지갑 잔액으로 남는다**(결정 §2.5 "서명 취소·실패").

**③ `POST …/signed-tx {kind, txHash}` → `202 Accepted` + `jobId`(`signerType=USER`)**

서버가 `chain_job`을 `SUBMITTED`로 만들고 receipt를 검증한다. 검증 항목은 5개다.

1. receipt `status == 1` (revert 아님)
2. `to` == 서버가 내려준 컨트랙트 주소
3. `from` == 요청자의 등록 지갑 주소(`wallet.address`)
4. 기대 이벤트가 로그에 존재 — `Purchased(showId, orderRef, buyer, teamIndex, amount)` / `DepositPaid` / `RulesAgreed` / `Transfer(→ 상환 금고)`
5. 이벤트 인자가 서버 상태와 일치 — `orderRef`·`amount`·`teamIndex`·`showId`·`rulesHash`

다섯 중 하나라도 어긋나면 상태를 전이하지 않고 `chain_job`을 `FAILED`로 고정한다. 응답 코드는 **불일치 계열**이며, 규격 v3에 전용 코드가 없어 본문에서는 `PAYMENT_AMOUNT_MISMATCH`(409)로 대체했다 — 전용 코드 `PAYMENT_TX_MISMATCH`는 §18.1 신설 제안이다. 같은 `txHash`를 두 번 보고하면 최초 `jobId`를 재생하고 부작용을 재실행하지 않는다.

| 단계 | 실패 | 서버 처리 |
|---|---|---|
| ① prepare | 잔액·재고·상태 불충족 | 서명 파라미터를 주지 않고 4xx |
| ② 서명 | 사용자 거부·지갑 오류 | 보고 없음 → 주문 15분 만료 → `CANCELLED`. 코인은 잔액으로 남는다 |
| ② 서명 | tx revert(재고·잠금·allowance) | 프론트가 `signed-tx`로 보고 → 서버가 receipt `status=0` 확인 → `FAILED` + 사유 표시 |
| ③ 검증 | 이벤트·인자 불일치 | 상태 전이 없음, `FAILED` 고정, 운영자 알림 |

**가스** — 지갑 등록·생성 시 운영지갑이 KAIA를 자동 충전한다(관객 **0.05**, 팀 리더 **0.5** [권] P-3). 서명 직전 잔액이 임계(관객 0.01·리더 0.05) 미달이면 `prepare` 응답의 `gasStatus`로 재충전 job을 알린다. 사용자 화면에 가스 개념을 노출하지 않으며 허용 문구는 "Confirm in your wallet" 한 줄이다. Kaia 수수료 대납(fee delegation)은 P1이다.

### 0.5 금액 표기와 `display` 객체 **[v4 신설]**

금액 필드는 **KRWS 정수(= 원)** 하나가 원본이고, 표시 통화 환산은 같은 자리의 `display` 객체로만 내려간다(P-22·P-17).

```json
{ "amount": 15000, "currency": "KRW", "display": { "currency": "USD", "approx": 10.80, "rate": 1388.9, "asOf": "2026-09-02T09:00:00+09:00" } }
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `amount` | integer | **원본.** KRWS 정수. 모든 계산·정산·컨트랙트 인자가 이 값을 쓴다 |
| `currency` | string | 항상 `"KRW"` |
| `display.currency` | string | 회원의 `display_currency`(기본 `USD`). `KRW`면 `display`를 **생략**한다 |
| `display.approx` | number | 환산 근사값(소수 2자리). **표시 전용** — 요청 본문으로 되돌려 보낼 수 없다 |
| `display.rate` | number | 환산에 쓴 표시 환율(`1 display.currency = rate KRW`). 출처는 `exchange_rate`(API-coin-02·03) |
| `display.asOf` | string | 그 환율의 `effective_from`. 화면 툴팁에 "as of …"로 노출한다 |

- **환율은 표시에만 쓴다.** 정산·분배·컨트랙트 인자·티켓 가격·충전 금액·출금 금액에는 절대 쓰지 않는다(결정 전제 3·P-17). 서버는 요청 본문의 `display*` 필드를 **전부 무시**하며, 금액 검증은 `amount`만 본다.
- 목록 응답에서 항목마다 `display`를 반복하지 않고, `data.rate`(`{ currency, rate, asOf }`) 하나를 응답 루트에 담고 항목에는 `amount`만 두는 축약형을 허용한다. 각 절에 어느 형태인지 적었다.
- `display_currency`가 `KRW`이거나 환율 레코드가 없으면 `display`를 내리지 않는다. 화면은 원 값만 표시한다(환율 미등록은 오류가 아니다).
- **이 문서의 예시는 `USD_KRW = 1350.0`** [권] P-17 미결 안건 2번 확정값을 쓴다. 위 규격 예시 블록만 결정 문서 §9의 형태 예시(1388.9)를 그대로 옮겼다.

### 0.6 언어·로케일 (`Accept-Language`) **[v4 신설]**

| 항목 | 규칙 |
|------|------|
| 헤더 | `Accept-Language: en` (**기본**) / `ko`. 그 밖의 값은 `en`으로 폴백한다 |
| 우선순위 | 로그인 회원은 **프로필 `locale`이 헤더보다 우선**한다(C-04에서 바꾼 값이 곧바로 반영되게). 비회원은 헤더만 본다 |
| 적용 대상 | `msg` 문장, `signRequests[].summary.title`, `simulationNotice`·`disclosure` 같은 고지 문구, 실패 사유 사용자 문장 |
| 적용 제외 | `code`(문자열 enum), 상태값, 필드명, 팀·공연 이름처럼 사용자가 입력한 데이터 |
| 관객 화면 용어 | 블록체인 용어는 노출하지 않는다. 허용 예외는 공개 검증(V-01)·준비금 공시(V-02)와 서명 단계의 `"Confirm in your wallet"` 한 줄이다(결정 §3.3) |

### 0.7 체인·컨트랙트 노출 규칙 **[v4 신설]**

| 항목 | 값·규칙 |
|------|------|
| 네트워크 | `network: "kaia-kairos"`, `chainId: 1001`, `chainIdHex: "0x3e9"`. Besu 백업 프로필은 `network: "besu-private"`로만 바뀌고 필드 구조는 같다 |
| RPC | `https://public-en-kairos.node.kaia.io` — API-coin-04만 내려준다(프론트 Web3Auth 초기화용) |
| 익스플로러 | `explorerBaseUrl: "https://kairos.kaiascan.io"`. tx는 `{base}/tx/{txHash}`, 주소는 `{base}/address/{address}`. 서버가 `explorerUrl`을 **완성된 절대 URL로** 내려주고 프론트가 조립하지 않는다 |
| 컨트랙트 주소 | `tokenAddress`(KRWS) · `splitterAddress`(RevenueSplitter) · `treasuryAddress`(상환 금고). 이 세 개만 노출한다 |
| 노출 화면 | 공연자·검증·관리자 화면(P-02·P-08·V-01·V-02·M-03)과 지갑 화면(A-13·C-05)에만. **관객 예매·결제 화면에는 주소·해시를 노출하지 않는다**(P-22·결정 §5 원칙 3) |
| 비노출 | OPERATOR·MINTER·BURNER 키, 서버 서명자 주소는 어떤 응답에도 담지 않는다. `treasuryAddress`는 예외로 노출한다 — 리더가 서명할 `transfer`의 수신 주소라 서명 화면에서 확인해야 한다 |

### 0.8 멱등키

| 항목 | 규칙 |
|------|------|
| 헤더 | `Idempotency-Key: {UUIDv4}` |
| **필수** 대상 | **[v4] 7개** — 주문 생성(API-ticket-01) · 결제 시작(API-payment-01) · **충전 요청(API-charge-01)** · 개별 취소·환불(API-refund-02) · 공연 취소(API-performance-12) · release 실행(API-settlement-05) · **팀 출금 시작(API-withdraw-01)**. v3의 5개에 `charge-01`·`withdraw-01`이 더해졌다 — 둘 다 금융망 이체를 유발한다 |
| `signed-tx` 계열 | 헤더를 요구하지 않는다. **`txHash` 자체가 자연 멱등키**다(같은 해시 재보고 = 최초 `jobId` 재생) |
| 보존 | 키 + 요청 해시를 **24시간** 저장. 같은 키·같은 요청 재호출 시 **최초 응답을 그대로 재생**하며 부작용을 재실행하지 않는다(REL-04) |
| 충돌 | 같은 키에 다른 요청 본문이 오면 `409 COMMON_CONFLICT` |
| 누락 | 필수 대상에서 헤더가 없으면 `400 COMMON_VALIDATION_FAILED` |
| 온체인 연계 | `coin_charge.idempotency_key`의 해시가 `KRWS.mint(..., bytes32 chargeRef)`의 `chargeRef`가 되고, `coin_withdrawal.idempotency_key`의 해시가 `KRWS.burn(..., bytes32 withdrawalRef)`의 `withdrawalRef`가 된다. 재시도해도 온체인 참조가 바뀌지 않는다 |

### 0.9 호출 제한 (rate limit)

로그인(API-member-01·02)·QR 검증·양도 수락은 **IP당 60회/분**을 넘으면 `429 COMMON_TOO_MANY_REQUESTS`(SEC-10). 예매 매크로 차단 룰도 같은 코드를 쓴다. **[v4]** 지갑 챌린지 발급(API-wallet-03)은 **회원당 10회/분**, 가스 재충전 요청(API-wallet-05)은 **회원당 3회/분**으로 별도 한도를 둔다. 초과 시 `Retry-After` 헤더(초)를 함께 내린다.

### 0.10 공통 에러

아래는 모든 엔드포인트에 공통으로 적용되며, 각 절의 에러 표에서는 **그 API에 고유하거나 발생 조건이 특별한 것만** 다시 적는다.

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 요청 body·쿼리 파라미터가 Bean Validation 규칙 위반 (SEC-12) |
| 401 | `COMMON_UNAUTHORIZED` | 인증이 필요한 API에 `Authorization` 헤더가 없음 |
| 401 | `AUTH_TOKEN_EXPIRED` | access token 만료. 클라이언트는 **이 코드에서만** 토큰 재발급 후 원요청 재시도 |
| 401 | `AUTH_TOKEN_INVALID` | 서명 불일치·위조 토큰. 재발급 시도 없이 즉시 로그아웃. **[v4]** Web3Auth idToken 검증 실패(JWKS·aud·exp·nonce)도 이 코드로 대체한다 |
| 403 | `COMMON_FORBIDDEN` | 인증됐으나 권한 없음 (도메인 전용 코드가 없을 때만) |
| 404 | `COMMON_NOT_FOUND` | 리소스 없음 (도메인 전용 코드가 없을 때만) |
| 409 | `COMMON_CONFLICT` | 동시 요청으로 인한 일반적 상태 충돌, 멱등키 본문 불일치 |
| 429 | `COMMON_TOO_MANY_REQUESTS` | 호출 한도 초과 |
| 500 | `COMMON_INTERNAL_ERROR` | 처리되지 않은 서버 예외. 상세는 로그에만 |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | 금융망·체인 노드·Web3Auth JWKS 오류이며 도메인 전용 코드가 없는 경우 |

**보안 규칙(SEC-09)** — 스택트레이스·SQL·체인 revert 원문·금융망 원본 오류 문자열은 `msg`에 넣지 않는다. **[v4]** 사용자 지갑 주소는 소유자 본인·참여팀·검증 화면에만 노출하고, 다른 회원의 주소는 어떤 목록에도 담지 않는다.

### 0.11 도메인 절 목차 (16개)

| 절 | 도메인 | 엔드포인트 | 코드 접두 |
|----|--------|-----------|-----------|
| 1 | `member` 회원·인증 | API-member-01~06·08 (07은 P1) | `AUTH_*` |
| 2 | `team` 공연팀 | API-team-01~04, 07 (team-05·06은 v3에서 삭제) | `TEAM_*` |
| 3 | `wallet` 지갑 **[v4 재정의]** | API-wallet-01~05 | `WALLET_*` |
| 4 | `performance` 공연 | API-performance-01~14 | `PERFORMANCE_*` |
| 5 | `rule` 정산 규칙 | API-rule-01~05 | `RULE_*` |
| 6 | `ticket` 예매·티켓 | API-ticket-01~06 | `TICKET_*` |
| 7 | `payment` 코인 결제 | API-payment-01~03 | `PAYMENT_*` |
| 8 | `charge` 충전 **[v4 신설]** | API-charge-01~04 | `CHARGE_*`(규격 v4 신설 — 본문은 대체 코드) |
| 9 | `coin` KRWS (+ `chain` 공통 폴링) | API-coin-01~04 (05·06은 P1), API-chain-01 | `COIN_*`, `CHAIN_*` |
| 10 | `refund` 취소·환불 | API-refund-01~02 | `REFUND_*` |
| 11 | `transfer` 양도 | API-transfer-01~04 | `TRANSFER_*` |
| 12 | `entry` 입장 | API-entry-01~02 | `ENTRY_*` |
| 13 | `settlement` 정산 | API-settlement-01~07 | `SETTLEMENT_*` |
| 14 | `withdraw` 출금 **[v4 개명 — 구 `redeem`]** | API-withdraw-01~03 (04는 P1) | `WITHDRAW_*`(규격 v4 신설 — 본문은 `REDEEM_*` 대체) |
| 15 | `verify` 공개 검증 | API-verify-01~02 | `CHAIN_*`, `COIN_*` |
| 16 | `admin` 관리자 | API-admin-06·09 (01~05·07·08은 P1) | `COMMON_*` |

`chain` 도메인은 결정 문서 §5의 16개 목록에 없고 API-chain-01 하나뿐이라 §9 `coin` 절 끝에 "공통 폴링" 항목으로 둔다. 브랜치 도메인은 `charge`·`withdraw`가 `payment`, `coin`이 `contract`다(결정 §5).

---

## 1. member — 회원·인증

**[v4] 인증 전제 전면 교체(P-1)** — 서비스 로그인은 **Web3Auth 소셜 로그인 3종(구글·페이스북·카카오) 동결**이다. 백엔드는 Web3Auth `idToken`을 JWKS로 검증해 자체 세션(JWT **access 30분 / refresh 14일**, 서버 저장·회전, SEC-02)을 발급하고, 같은 트랜잭션에서 **회원과 지갑(`provider=WEB3AUTH`)을 등록**한다. 최초 로그인이 곧 가입이다. 자체 이메일+비밀번호는 **보조**로만 남으며(API-member-02·08), 이메일 가입 회원은 지갑이 없으므로 **첫 결제 전 지갑 연결이 필수**다(미결 안건 18). v3의 소셜 OAuth 로그인 API(구 API-member-08)는 **[v4 삭제]**되어 API-member-01에 통합됐다.

**[v4] 회원 신규 속성** — `countryCode`(ISO 3166-1 alpha-2, 자기 선언) · `locale`(**en 기본**·ko) · `displayCurrency`(**USD 기본**) · `timezone`(IANA) · `authProvider`(`GOOGLE`/`FACEBOOK`/`KAKAO`/`LOCAL`) · `web3authVerifierId`. 외국인 가입에 국내 본인인증·휴대폰·국내 계좌를 요구하지 않는다(P-23). 관객의 원화 수령 계좌 개념도 없어졌다 — 환불은 지갑 잔액으로 돌아가고(P-20), 관객 계좌 연결(API-member-07)은 **P1**이다.

### API-member-01 Web3Auth 로그인/가입 **[v4 신설 — 구 signup/login/OAuth 통합]**
`POST /api/v1/auth/web3auth` · 권한: GUEST(인증 불필요) · 우선: P0 · 연관 화면: `C-01 로그인`·`C-02 회원가입(보조)` · 연관 기능: `F-member-01 Web3Auth 로그인·가입`

## 요구사항
- 프론트가 Web3Auth SDK로 소셜 로그인(구글·페이스북·카카오)을 마치고 얻은 `idToken`과 **MPC 지갑 주소**를 보낸다. 서버는 idToken을 **JWKS로 검증**(서명·`aud`·`exp`·`iss`·`nonce`)하고, 회원이 없으면 만들고 있으면 조회해 세션 JWT를 발급한다. **최초 로그인 = 가입**이다.
- 같은 트랜잭션에서 `wallet`(`provider=WEB3AUTH`, `address`, `verified_at`, `status=LINKED`)을 등록한다. **회원당 지갑 1개**이며 `address`는 전역 UNIQUE다. 다른 회원이 이미 등록한 주소면 `COMMON_CONFLICT`로 거부한다(전용 코드 `WALLET_ALREADY_LINKED`는 §18.1 신설 제안).
- **서버는 사용자 개인키·니모닉·MPC 샤드를 받지도, 저장하지도 않는다.** 요청 본문에 그런 필드가 오면 `COMMON_VALIDATION_FAILED`로 거부한다(알 수 없는 필드 거부).
- 지갑 등록 직후 **운영지갑이 KAIA를 자동 충전**한다(관객 0.05 [권] P-3). 비동기 job이며 실패해도 로그인을 막지 않는다. `gasFundingJobId`로 알려준다.
- 신규 회원은 `countryCode`가 필수다(P-23 자기 선언). 요청에 없으면 회원·지갑·세션은 만들되 `profileCompletionRequired: true`를 내려 C-02 보조 폼을 1회 띄운다 [권]. 기존 회원 로그인에는 이 플래그가 `false`다.
- 이미 같은 소셜 계정(`authProvider` + `web3authVerifierId`)으로 가입돼 있으면 회원을 새로 만들지 않고 로그인 처리한다. Web3Auth MPC는 같은 소셜 계정에 같은 주소를 재현하므로 주소도 일치해야 하며, 불일치는 `COMMON_CONFLICT`다(지갑 교체는 MVP 관리자 처리, 미결 안건 14).
- IP당 60회/분 호출 제한 대상이다(SEC-10).

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Accept-Language: en` (기본) / `ko`

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `idToken` | string | Y | JWT, 최대 4096자 | Web3Auth가 발급한 idToken. 서버가 JWKS로 검증 |
| `address` | string | Y | `0x` + 40 hex(42자) | Web3Auth MPC 지갑 주소. idToken의 지갑 클레임과 일치해야 함 |
| `provider` | string | Y | `GOOGLE` / `FACEBOOK` / `KAKAO` | 소셜 로그인 제공자 — `member.auth_provider`에 저장 |
| `countryCode` | string | 조건부 | ISO 3166-1 alpha-2, 신규 회원 필수 | 거주·국적 자기 선언 |
| `locale` | string | N | `en`(기본) / `ko` | 미지정 시 `Accept-Language` → `en` |
| `displayCurrency` | string | N | ISO 4217 3자, 기본 `USD` | 표시 통화 |
| `timezone` | string | N | IANA, 기본 `UTC` | 시간 표시 기준 |
| `termsAgreed` | boolean | 조건부 | 신규 회원 `true`만 허용 | 이용약관 동의 |
| `privacyAgreed` | boolean | 조건부 | 신규 회원 `true`만 허용 | 개인정보 처리방침 동의(Web3Auth 처리 위탁·국외 이전 고지 포함) |

```json
{
  "idToken": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9...",
  "address": "0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a",
  "provider": "GOOGLE",
  "countryCode": "US",
  "locale": "en",
  "displayCurrency": "USD",
  "timezone": "America/Los_Angeles",
  "termsAgreed": true,
  "privacyAgreed": true
}
```

### 시스템 처리
1. Bean Validation → Web3Auth JWKS 공개키로 `idToken` 서명 검증 → `aud`(클라이언트 ID)·`iss`·`exp`·`nonce` 확인 → 토큰의 지갑 클레임과 `address` 대조.
2. 상태 전이: `member` 조회(`auth_provider` + `provider_user_id`) → 없으면 생성(`auth_provider`=요청 `provider`, `web3auth_verifier_id`, `password_hash=NULL`, 역할 `AUDIENCE`) → `wallet` upsert(`provider=WEB3AUTH`, `status=LINKED`, `verified_at=now`).
3. 외부 호출: ① Web3Auth JWKS 조회(캐시 10분, 실패는 `502`) ② 운영지갑 → 사용자 주소 KAIA 자동 충전 `chain_job`(`tx_type=GAS_CHARGE`, `signer_type=OPERATOR`) 등록(비동기).
4. `member`·`wallet`·`refresh_token` 저장 + 감사 로그(`action_type=WALLET_LINK`, SEC-11). **개인키·샤드는 어떤 컬럼·로그에도 남기지 않는다.**

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "memberId": 1024,
    "isNewMember": true,
    "name": "Alex Kim",
    "email": "alex@example.com",
    "roles": ["AUDIENCE"],
    "authProvider": "GOOGLE",
    "countryCode": "US",
    "locale": "en",
    "displayCurrency": "USD",
    "timezone": "America/Los_Angeles",
    "profileCompletionRequired": false,
    "wallet": {
      "provider": "WEB3AUTH",
      "address": "0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a",
      "status": "LINKED",
      "explorerUrl": "https://kairos.kaiascan.io/address/0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a"
    },
    "gasFundingJobId": "chain_01J9G1A2B3",
    "accessToken": "eyJhbGciOi...",
    "accessTokenExpiresAt": "2026-09-02T14:30:00+09:00",
    "refreshToken": "eyJhbGciOi...",
    "refreshTokenExpiresAt": "2026-09-16T14:00:00+09:00"
  },
  "msg": ""
}
```

`isNewMember: true`면 클라이언트는 C-02 보조 폼(국가·언어·통화·시간대)을 1회 보인다. `gasFundingJobId`는 관객 화면에 노출하지 않고 내부 폴링에만 쓴다(§0.6 용어 규칙).

### 4xx/5xx
```json
{ "code": "AUTH_TOKEN_INVALID", "data": null, "msg": "Sign-in verification failed. Please try again." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 주소 형식 위반, 신규 회원 `countryCode`·약관 동의 누락, 허용되지 않는 `provider`, 개인키·니모닉류 필드 전달 |
| 401 | `AUTH_TOKEN_INVALID` | idToken 서명·`aud`·`exp`·`nonce` 검증 실패, 토큰 지갑 클레임 ≠ `address` (전용 코드 `AUTH_WEB3AUTH_TOKEN_INVALID`는 §18.1) |
| 409 | `COMMON_CONFLICT` | 같은 `address`가 다른 회원에 등록됨, 같은 소셜 계정의 기존 지갑 주소와 불일치 (전용 코드 `WALLET_ALREADY_LINKED`는 §18.1) |
| 429 | `COMMON_TOO_MANY_REQUESTS` | IP당 60회/분 초과 (SEC-10) |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | Web3Auth JWKS 조회 실패이며 캐시도 없음 — 외부 지갑 등록 경로(C-05)로 우회 안내 |

---

### API-member-02 자체 이메일 로그인(보조) **[P1 — 9/2 최소화]**
`POST /api/v1/auth/login` · 권한: GUEST(인증 불필요) · 우선: P0 · 연관 화면: `C-01 로그인` · 연관 기능: `F-member-02 자체 이메일 로그인(보조)`

## 요구사항
- 이메일·비밀번호를 검증하고 access token(30분)·refresh token(14일)을 발급한다 [권] P-1 / SEC-02. refresh token은 서버에 저장하고 재발급마다 회전한다.
- 이메일 없음과 비밀번호 불일치를 구분하지 않고 같은 코드로 응답해 계정 존재 여부를 노출하지 않는다.
- **소셜 회원**(`authProvider != LOCAL`, 비밀번호 NULL)이 비밀번호 로그인을 시도하면 `AUTH_INVALID_CREDENTIALS`로 거부하고 `msg`로 소셜 로그인을 안내한다(경로는 API-member-01).
- **[v4]** 이 경로로 로그인한 회원은 지갑이 없을 수 있다. 응답의 `wallet`이 `null`이면 클라이언트는 **첫 결제 전에 C-05 지갑 연결**로 보낸다(미결 안건 18). 지갑 없이도 탐색·양도 수락은 가능하다.
- IP당 60회/분 호출 제한 대상이다(SEC-10).

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Accept-Language: en` / `ko`

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `email` | string | Y | RFC 5322 | 로그인 ID |
| `password` | string | Y | 8~64자 | 평문 전송(HTTPS 전 구간, SEC-01) |

```json
{ "email": "audience@ssafy.io", "password": "b204!Pass" }
```

### 시스템 처리
1. 이메일로 회원 조회 → BCrypt 비교. 실패 시 시도 횟수를 기록하고 동일 코드 반환.
2. 상태 전이: 인증 상태 `UNAUTHENTICATED` → `AUTHENTICATED`.
3. 외부 호출 없음.
4. `refresh_token` 저장(회원·디바이스 단위), 로그인 감사 로그. **[v4]** `wallet` 유무를 함께 조회해 응답에 담는다.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "memberId": 1030,
    "name": "김관객",
    "roles": ["AUDIENCE"],
    "authProvider": "LOCAL",
    "locale": "ko",
    "displayCurrency": "KRW",
    "timezone": "Asia/Seoul",
    "wallet": null,
    "walletLinkRequired": true,
    "accessToken": "eyJhbGciOi...",
    "accessTokenExpiresAt": "2026-09-02T14:30:00+09:00",
    "refreshToken": "eyJhbGciOi...",
    "refreshTokenExpiresAt": "2026-09-16T14:00:00+09:00"
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
| 401 | `AUTH_INVALID_CREDENTIALS` | 계정 없음, 비밀번호 불일치, 소셜 전용 회원의 비밀번호 로그인 |
| 429 | `COMMON_TOO_MANY_REQUESTS` | IP당 60회/분 초과 (SEC-10) |

---

### API-member-03 토큰 재발급
`POST /api/v1/auth/refresh` · 권한: 회원(refresh token) · 우선: P0 · 연관 화면: `공통` · 연관 기능: `F-member-03 토큰 재발급`

## 요구사항
- refresh token으로 access token을 재발급하고 refresh token을 **회전**한다(SEC-02). 이전 refresh token은 즉시 폐기한다.
- 클라이언트는 `AUTH_TOKEN_EXPIRED`(401)를 받은 경우에만 호출한다. `AUTH_TOKEN_INVALID`에서는 재발급 없이 로그아웃한다.
- 이미 폐기·회전된 refresh token 재사용은 탈취 신호로 보고 해당 회원의 refresh token을 **전량 폐기**한 뒤 `AUTH_TOKEN_INVALID`로 응답한다 [권].
- **[v4]** 로그인 경로(Web3Auth·자체 이메일)와 무관하게 같은 세션 구조를 쓴다. Web3Auth idToken을 다시 요구하지 않는다.

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `refreshToken` | string | Y | JWT | 로그인 시 받은 refresh token |

```json
{ "refreshToken": "eyJhbGciOi..." }
```

### 시스템 처리
1. 토큰 서명·만료 검증 → `refresh_token` 저장 레코드 존재·미폐기 확인.
2. 상태 전이: 기존 refresh token 폐기 → 새 access·refresh 발급·저장(회전).
3. 외부 호출 없음.
4. 재사용 감지 시 회원의 전체 `refresh_token` 폐기 + 감사 로그.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "accessToken": "eyJhbGciOi...",
    "accessTokenExpiresAt": "2026-09-02T15:00:00+09:00",
    "refreshToken": "eyJhbGciOi...",
    "refreshTokenExpiresAt": "2026-09-16T14:30:00+09:00"
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
| 401 | `AUTH_TOKEN_EXPIRED` | refresh token 만료 → 재로그인 필요 |
| 401 | `AUTH_TOKEN_INVALID` | 서명 불일치, 폐기·회전된 토큰 재사용(전량 폐기 처리) |

---

### API-member-04 로그아웃
`POST /api/v1/auth/logout` · 권한: 회원 · 우선: P0 · 연관 화면: `C-03 마이페이지` · 연관 기능: `F-member-04 로그아웃`

## 요구사항
- 서버에 저장된 해당 디바이스의 refresh token을 폐기한다. access token은 만료까지 유효하므로 클라이언트가 즉시 파기한다.
- `allDevices: true`면 회원의 refresh token을 전량 폐기한다 [권].
- **[v4]** 로그아웃은 서버 세션만 끊는다. **Web3Auth 세션과 사용자 지갑은 서버가 건드리지 않는다** — 프론트가 Web3Auth SDK의 `logout()`을 별도로 호출하고, 외부 지갑은 연결 해제만 한다. 지갑 등록(`wallet` 레코드)은 로그아웃으로 사라지지 않는다.
- 이미 폐기된 토큰으로 호출해도 200으로 성공시킨다(결과 상태가 같다) [권].

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
| `refreshToken` | string | N | JWT | 폐기할 디바이스 토큰. 생략 시 현재 access token의 세션 |
| `allDevices` | boolean | N | 기본 `false` | 전 디바이스 로그아웃 |

```json
{ "refreshToken": "eyJhbGciOi...", "allDevices": false }
```

### 시스템 처리
1. access token에서 `memberId` 추출.
2. 상태 전이: 대상 `refresh_token` 폐기(`allDevices`면 전량).
3. 외부 호출 없음 — Web3Auth 세션 종료는 클라이언트 몫이다.
4. 로그아웃 감사 로그.

## Response
### 200 OK
```json
{ "code": "SUCCESS", "data": { "loggedOut": true, "revokedCount": 1, "clientAction": "CLEAR_WEB3AUTH_SESSION" }, "msg": "로그아웃되었습니다." }
```

### 4xx
```json
{ "code": "COMMON_UNAUTHORIZED", "data": null, "msg": "로그인이 필요합니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 401 | `AUTH_TOKEN_EXPIRED` | access token 만료 |

---

### API-member-05 내 정보 조회
`GET /api/v1/members/me` · 권한: 회원 · 우선: P0 · 연관 화면: `C-03 마이페이지`·`C-04 언어·통화 설정` · 연관 기능: `F-member-05 내 정보 조회`

## 요구사항
- **[v4]** 프로필·역할·**로케일·표시 통화·시간대·국가**·**지갑 요약**·소속 팀 요약을 한 번에 준다. C-03 진입 1회 호출로 화면이 그려져야 한다.
- 지갑 요약은 `provider` 배지(`WEB3AUTH`/`EXTERNAL`)·주소·**KRWS 잔액 + `display`**·`status`까지다. 상세 잔액·가스 상태·거래 이력은 API-wallet-01·02가 담당한다.
- 지갑이 없는 자체 이메일 회원은 `wallet: null` + `walletLinkRequired: true`다.
- 관객 화면이므로 가스·해시·컨트랙트 주소를 담지 않는다(§0.7 비노출 규칙). 지갑 주소는 본인 소유라 노출한다.
- 관객 원화 계좌 개념은 v4에서 사라졌다 — 계좌 정보는 **팀 정산 계좌**(API-team-03)에만 있다.

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`
- `Accept-Language: en` / `ko`

### Path · Query
없음.

### Body
없음.

### 시스템 처리
1. access token에서 `memberId` 추출.
2. 상태 전이 없음(조회).
3. 외부 호출: 지갑 잔액은 `wallet.cached_krws_balance`를 쓰고 **노드를 조회하지 않는다**(PERF-01). 실시간 값은 API-wallet-01이 조회한다.
4. `member` + `wallet` + `team`(`leader_id = memberId`) + 유효 `exchange_rate` 조인 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "memberId": 1024,
    "email": "alex@example.com",
    "name": "Alex Kim",
    "roles": ["AUDIENCE", "PERFORMER"],
    "authProvider": "GOOGLE",
    "countryCode": "US",
    "locale": "en",
    "displayCurrency": "USD",
    "timezone": "America/Los_Angeles",
    "wallet": {
      "provider": "WEB3AUTH",
      "address": "0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a",
      "status": "LINKED",
      "balance": { "amount": 35000, "currency": "KRW", "display": { "currency": "USD", "approx": 25.93, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" } },
      "cachedAt": "2026-09-02T13:59:40+09:00"
    },
    "walletLinkRequired": false,
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
`PATCH /api/v1/members/me` · 권한: 회원 · 우선: P0 · 연관 화면: `C-03 마이페이지`·`C-04 언어·통화 설정` · 연관 기능: `F-member-06 내 정보 수정` · `F-member-09 언어·통화 설정`

## 요구사항
- 이름·연락처와 **[v4] `countryCode`·`locale`·`displayCurrency`·`timezone`**을 부분 수정한다. 전달된 필드만 바꾼다. 이메일은 계정 식별자라 변경 대상이 아니다 [권].
- **[v4] `locale`·`displayCurrency`·`timezone`은 즉시 반영**된다 — 이후 모든 응답의 `msg`·`display`·시간 오프셋이 새 값을 따른다(§0.5·§0.6). `displayCurrency`를 `KRW`로 바꾸면 `display` 객체가 더 이상 내려가지 않는다.
- `displayCurrency`는 **표시 전용**이다. 바꿔도 잔액·티켓 가격·정산액의 원본 `amount`는 1원도 달라지지 않는다(P-17).
- 지원하지 않는 통화(현재 등록된 `exchange_rate` pair에 없는 통화)로 바꾸면 저장은 허용하고 `displaySupported: false`를 내려 화면이 원 값만 표시하게 한다 [권]. 오류로 막지 않는다.
- 비밀번호 변경(`currentPassword`+`newPassword`)은 `authProvider=LOCAL` 회원만 가능하다. 성공하면 해당 회원의 refresh token을 전부 폐기한다(SEC-02). 소셜 회원의 비밀번호 변경 시도는 `COMMON_VALIDATION_FAILED`다.
- **연락처는 선택**이다 — 외국인 관객에게 국내 휴대폰 번호를 요구하지 않는다(P-23).

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
| `name` | string | N | 1~40자 | 이름 또는 활동명 |
| `phone` | string | N | E.164 또는 `010-0000-0000`, 최대 20자 | 연락처(선택) |
| `countryCode` | string | N | ISO 3166-1 alpha-2 | 국가 자기 선언 |
| `locale` | string | N | `en` / `ko` | UI 언어 |
| `displayCurrency` | string | N | ISO 4217 3자 | 표시 통화 |
| `timezone` | string | N | IANA | 시간대 |
| `currentPassword` | string | N | `newPassword`와 동시 필수, LOCAL 회원만 | 현재 비밀번호 |
| `newPassword` | string | N | 8~64자, 현재와 달라야 함 | 새 비밀번호 |

```json
{ "locale": "ko", "displayCurrency": "JPY", "timezone": "Asia/Tokyo" }
```

### 시스템 처리
1. 필드 검증 → `locale`·`displayCurrency`·`timezone` 화이트리스트·형식 확인 → 비밀번호 변경 요청이면 `authProvider=LOCAL` 확인 후 `currentPassword` 대조.
2. 상태 전이 없음(프로필 수정). 비밀번호 변경 시 인증 상태는 유지하되 refresh token 전량 폐기.
3. 외부 호출 없음.
4. `member` 갱신 + 변경 감사 로그. `displayCurrency`에 대응하는 유효 `exchange_rate`가 있는지 조회해 `displaySupported`를 계산한다.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "memberId": 1024,
    "name": "Alex Kim",
    "countryCode": "JP",
    "locale": "ko",
    "displayCurrency": "JPY",
    "displaySupported": true,
    "timezone": "Asia/Tokyo",
    "appliedRate": { "currency": "JPY", "rate": 9.12, "asOf": "2026-09-02T09:00:00+09:00" }
  },
  "msg": "설정이 저장되었습니다."
}
```

### 4xx
```json
{ "code": "COMMON_VALIDATION_FAILED", "data": null, "msg": "지원하지 않는 언어 코드입니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 형식 위반, `newPassword` 단독 전달, 소셜 회원의 비밀번호 변경 시도, 허용되지 않는 `locale`·`countryCode`·`timezone` |
| 401 | `AUTH_INVALID_CREDENTIALS` | `currentPassword` 불일치 |
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |

---

### API-member-07 금융망 계좌 연결 **[v4 P1]**
`PUT /api/v1/members/me/bank-account` · 권한: AUDIENCE · 우선: **P1** · 연관 화면: — · 연관 기능: `F-member-07 금융망 계좌 연결 [P1]`

> **v4에서 P1로 내려갔다.** 관객은 코인으로 결제하고 환불도 **지갑 잔액으로** 받으므로(P-20·결정 §3.4) MVP에 관객 원화 계좌가 필요하지 않다. 관객 잔액의 원화 출금과 카드 취소(모의)가 P1로 올라올 때 이 경로가 함께 살아난다. 경로·메서드·이름만 §17에 예약하고 상세는 v1.1에서 채운다. **팀 정산 계좌 등록(API-team-07)은 P0로 그대로 있다.**

---

### API-member-08 자체 이메일 가입(보조) **[P1 — 9/2 최소화]**
`POST /api/v1/auth/signup` · 권한: GUEST(인증 불필요) · 우선: P0 · 연관 화면: `C-02 회원가입(보조)` · 연관 기능: `F-member-10 자체 이메일 가입(보조)`

## 요구사항
- **[v4 번호 이동]** v3의 API-member-01(회원가입)이 이 번호로 옮겨졌다. 소셜 로그인을 쓸 수 없는 사용자를 위한 **보조 경로**이며, 기본 가입 경로는 API-member-01이다.
- 이메일·비밀번호·이름과 **[v4] `countryCode`·`locale`·`displayCurrency`·`timezone`**, 약관 동의로 계정을 만든다. 이메일은 계정 식별자이며 중복될 수 없다.
- 비밀번호는 BCrypt로 단방향 해싱해 저장하고 어떤 응답에도 포함하지 않는다. `authProvider=LOCAL`이다.
- **지갑을 만들지 않는다.** 서버는 사용자 키를 생성·보관하지 않으므로, 이 회원은 **첫 결제 전에 지갑을 연결**해야 한다(Web3Auth 이메일 패스워드리스로 API-member-01 재진입, 또는 외부 지갑 등록 API-wallet-03·04). 응답의 `walletLinkRequired: true`가 그 안내다(미결 안건 18).
- 가입 직후 역할은 `AUDIENCE`다. 팀을 만들면 `PERFORMER`가 더해진다. 가입만으로 로그인시키지 않는다 [권].
- 연락처는 선택 항목이다(P-23).

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Accept-Language: en` / `ko`

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `email` | string | Y | RFC 5322, 최대 254자 | 로그인 ID |
| `password` | string | Y | 8~64자, 영문·숫자·특수문자 중 2종 이상 | 평문 전송(HTTPS 전 구간, SEC-01) |
| `name` | string | Y | 1~40자 | 실명 또는 활동명 |
| `countryCode` | string | Y | ISO 3166-1 alpha-2 | 국가 자기 선언 |
| `locale` | string | N | `en`(기본) / `ko` | UI 언어 |
| `displayCurrency` | string | N | ISO 4217 3자, 기본 `USD` | 표시 통화 |
| `timezone` | string | N | IANA, 기본 `UTC` | 시간대 |
| `phone` | string | N | 최대 20자 | 연락처(선택) |
| `termsAgreed` | boolean | Y | `true`만 허용 | 이용약관 동의 |
| `privacyAgreed` | boolean | Y | `true`만 허용 | 개인정보 처리방침 동의 |

```json
{
  "email": "audience@ssafy.io",
  "password": "b204!Pass",
  "name": "김관객",
  "countryCode": "KR",
  "locale": "ko",
  "displayCurrency": "KRW",
  "timezone": "Asia/Seoul",
  "termsAgreed": true,
  "privacyAgreed": true
}
```

### 시스템 처리
1. Bean Validation → 이메일 중복 조회(`member.email` 유니크) → `countryCode`·`locale`·`timezone` 화이트리스트 확인.
2. 상태 전이: `member` 생성(`auth_provider=LOCAL`, 역할 `AUDIENCE`), 인증 상태 `UNAUTHENTICATED` 유지.
3. 외부 호출 없음 — **지갑을 만들지 않고 KAIA 충전도 하지 않는다.**
4. `member` 저장 + 가입 감사 로그.

## Response
### 201 Created
```json
{
  "code": "SUCCESS",
  "data": {
    "memberId": 1030,
    "email": "audience@ssafy.io",
    "name": "김관객",
    "authProvider": "LOCAL",
    "locale": "ko",
    "walletLinkRequired": true
  },
  "msg": "가입이 완료되었습니다. 로그인 후 지갑을 연결해 주세요."
}
```

### 4xx
```json
{ "code": "AUTH_EMAIL_DUPLICATED", "data": null, "msg": "이미 가입된 이메일입니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 형식 위반, 약관 미동의, `countryCode` 누락 |
| 409 | `AUTH_EMAIL_DUPLICATED` | 동일 이메일 계정 존재 |

---

> **v3 API-member-08 `POST /api/v1/auth/oauth/{provider}` (소셜 OAuth 로그인)은 [v4 삭제]됐다.** 자체 OAuth 토큰 교환 대신 **Web3Auth가 소셜 로그인과 지갑 생성을 함께 처리**하고 백엔드는 idToken만 검증하므로(P-1·미결 안건 5), 이 경로는 **API-member-01 `POST /api/v1/auth/web3auth`로 통합**됐다. 지원 제공자는 구글·페이스북·카카오 3종으로 동결됐다. 관련 코드 `AUTH_OAUTH_EXCHANGE_FAILED`·`AUTH_OAUTH_PROVIDER_UNSUPPORTED`(v3 §17.1 신설 후보)도 §18.3 폐기 후보로 옮겼다.

---

## 2. team — 공연팀

**[v4] 팀 지갑은 리더 지갑이다.** 팀 생성 시 서버가 지갑을 만들지 않는다 — `team_wallet` 테이블은 삭제됐고, 팀의 수령 주소는 `team.leader_id → wallet.address`로 **파생**된다(결정 §8 #4·#5). 팀 리더가 지갑을 연결하지 않았으면 팀 생성 자체를 막는다(F-team-01). 팀당 리더 1인이며 리더 교체는 MVP에서 불가하다(미결 안건 20). 정산 계좌(`bank_account`, 예금주 검증)는 **팀 원화 출금(§14)** 에 쓰이며 그대로 유지된다.

### API-team-01 팀 생성 **[v4 변경 — 지갑 생성 없음]**
`POST /api/v1/teams` · 권한: 회원 · 우선: P0 · 연관 화면: `P-02 팀 관리` · 연관 기능: `F-team-01 팀 생성`

## 요구사항
- 팀을 만든 회원이 자동으로 **리더**가 되고 `PERFORMER` 역할을 얻는다. 팀 지갑 = 리더 지갑이라 **지갑을 새로 만들지 않는다**.
- **[v4] 리더 지갑 연결이 선행 조건**이다. 요청자에게 `wallet`(`status=LINKED`)이 없으면 `WALLET_NOT_FOUND`(404)로 막고 C-05 지갑 연결로 보낸다(전용 코드 `WALLET_NOT_LINKED`는 §18.1 신설 제안).
- 리더 지갑에는 팀 리더 기준 KAIA를 보강 충전한다(0.5 [권] P-3) — 보증금·동의·출금 서명이 관객보다 많기 때문이다. 비동기이며 실패해도 팀 생성을 막지 않는다.
- 팀 이름은 전역 유니크가 아니다. 동일인이 같은 이름의 팀을 중복 생성하는 것만 막는다 [권].

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}`

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
1. **요청자의 `wallet` 존재·`LINKED` 확인** → 필드 검증 → 동일 리더·동일 이름 중복 확인.
2. 상태 전이: `team` 생성, 요청자를 `team.leader_id`로 등록해 역할에 `PERFORMER` 추가.
3. 외부 호출: 리더 지갑 KAIA 보강 충전 `chain_job`(`GAS_CHARGE`, `OPERATOR`) 등록(비동기).
4. `team` 저장 + 감사 로그. **`team_wallet`은 만들지 않는다**(v4 삭제 테이블).

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
    "walletProvider": "EXTERNAL",
    "explorerUrl": "https://kairos.kaiascan.io/address/0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b",
    "gasFundingJobId": "chain_01J9G4C5D6",
    "settlementAccountRegistered": false,
    "createdAt": "2026-09-02T14:40:00+09:00"
  },
  "msg": "팀이 생성되었습니다. 정산 계좌를 등록해 주세요."
}
```

`walletAddress`는 **리더 지갑 주소를 파생해 보여주는 값**이며 `team` 테이블 컬럼이 아니다.

### 4xx
```json
{ "code": "WALLET_NOT_FOUND", "data": null, "msg": "지갑을 먼저 연결해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 이름 길이·형식 위반 |
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 404 | `WALLET_NOT_FOUND` | **[v4]** 요청자 지갑 미연결 (전용 코드 `WALLET_NOT_LINKED`는 §18.1) |
| 409 | `COMMON_CONFLICT` | 같은 리더가 같은 이름의 팀을 중복 생성 |
| 409 | `WALLET_NOT_FOUND` 상태 `SUSPENDED` | 지갑이 관리자 정지 상태 → `COMMON_FORBIDDEN`으로 응답 |

---

### API-team-02 내 팀 목록
`GET /api/v1/teams/me` · 권한: PERFORMER · 우선: P0 · 연관 화면: `P-01 공연자 대시보드` · 연관 기능: `F-team-02 내 팀 목록 조회`

## 요구사항
- 로그인 회원이 **리더인** 팀을 전부 준다. 리더 여부·정산 계좌 등록 여부·**[v4] 팀 KRWS 잔액 요약**을 담아 대시보드에서 "계좌 등록하세요"·"원화로 받기" 배지를 띄울 수 있게 한다.
- 팀이 없으면 빈 배열과 `pageInfo`를 반환한다(404가 아니다).
- 잔액은 `wallet.cached_krws_balance` 캐시값이며 노드를 조회하지 않는다(PERF-01). 실시간 값은 API-wallet-01이다.
- **[v4]** 금액은 §0.5 축약형 — 응답 루트에 `rate` 하나, 항목에는 `amount`만.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

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
3. 외부 호출 없음.
4. `team`(`leader_id = memberId`) + `wallet` + `bank_account` 조인 후 `items`/`pageInfo` 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "rate": { "currency": "USD", "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "items": [
      { "teamId": 7, "teamName": "블루노트", "genre": "인디록", "leader": true, "walletAddress": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b", "balanceAmount": 572942, "settlementAccountRegistered": true, "withdrawableAmount": 572942 }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 1, "hasNext": false }
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |

---

### API-team-03 팀 상세
`GET /api/v1/teams/{teamId}` · 권한: PERFORMER(해당 팀 리더) · 우선: P0 · 연관 화면: `P-02 팀 관리` · 연관 기능: `F-team-03 팀 상세 조회`

## 요구사항
- 팀 정보·**[v4] 리더 지갑(주소·provider 배지·익스플로러 링크)**·정산 계좌 등록 상태를 준다. 잔액·거래 이력은 API-wallet-01·02가 담당한다.
- 팀 리더가 아니면 조회할 수 없다(SEC-03). 정산 계좌번호는 마스킹한다.
- **[v4]** `walletAddress`는 `leader_id → wallet`으로 파생한 값이다. `team` 테이블에 지갑 컬럼은 없다.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `teamId` | path | integer(BIGINT) | Y | 팀 PK |

### Body
없음.

### 시스템 처리
1. `teamId` 존재 확인 → 요청자가 리더인지 확인.
2. 상태 전이 없음(조회).
3. 외부 호출 없음.
4. `team` + `wallet`(리더) + `bank_account`(`settlement_account_id`) 반환.

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
    "wallet": {
      "provider": "EXTERNAL",
      "address": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b",
      "status": "LINKED",
      "explorerUrl": "https://kairos.kaiascan.io/address/0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b"
    },
    "settlementAccount": { "registered": true, "bankName": "국민", "accountNoMasked": "****3311", "holderName": "블루노트", "holderVerified": true }
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 403 | `COMMON_FORBIDDEN` | 해당 팀 리더가 아님 |
| 404 | `TEAM_NOT_FOUND` | 존재하지 않는 `teamId` |
| 404 | `WALLET_NOT_FOUND` | 리더 지갑 레코드가 없음(비정상 상태 — 관리자 확인) |

---

### API-team-04 팀 수정
`PATCH /api/v1/teams/{teamId}` · 권한: 리더 · 우선: P0 · 연관 화면: `P-02 팀 관리` · 연관 기능: `F-team-04 팀 정보 수정`

## 요구사항
- 리더만 팀 이름·장르·소개·연락처를 수정한다. 전달된 필드만 바꾼다.
- **[v4]** 리더와 지갑 주소는 이 API로 바꿀 수 없다. 지갑 교체는 MVP에서 관리자 처리이며(미결 안건 14), 리더 교체는 불가하다(미결 안건 20) — 정산 주소가 `performance_participant.wallet_address` 스냅샷으로 고정되기 때문이다.
- 판매가 시작된 공연에 참여 중이어도 팀 프로필 수정은 허용한다 [권].

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}`

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
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 형식 위반, `leaderMemberId`·`walletAddress` 등 변경 불가 필드 전달 |
| 403 | `COMMON_FORBIDDEN` | 리더가 아님 |
| 404 | `TEAM_NOT_FOUND` | 존재하지 않는 `teamId` |

---

### API-team-05 팀원 초대 **[v3 삭제 · v4 유지]**

> **v3에서 삭제됐고 v4에서도 되살리지 않는다.** `team_member`·`team_invitation` 테이블이 없어 팀원 소속 개념이 없다. 팀은 리더(`team.leader_id`) 1인이 관리하며, v4에서는 그 리더의 지갑이 팀 지갑이 되어 리더 단일 구조가 더 강해졌다. 밴드 멤버에게 정산 결과를 보여주는 경로는 **정산 공유 링크**(API-settlement-06·07)다.

---

### API-team-06 초대 수락 **[v3 삭제 · v4 유지]**

> **v3에서 삭제됐고 v4에서도 되살리지 않는다.** API-team-05와 동일 사유.

---

### API-team-07 정산 계좌 등록(예금주 검증)
`PUT /api/v1/teams/{teamId}/settlement-account` · 권한: 리더 · 우선: P0 · 연관 화면: `P-02 팀 관리` · 연관 기능: `F-team-07 팀 정산 계좌 등록`

## 요구사항
- **[v4]** 팀이 **원화 출금**(§14 `withdraw` — 리더가 KRWS를 상환 금고에 예치하면 서버가 원화를 이체한다)을 받을 계좌를 등록한다. 리더만 등록·교체한다. 한국인 팀 가정이므로 국내 계좌다(외국인 팀은 P2).
- **예금주명 일치 검증이 필수**다(SEC-13). 금융망 API로 실계좌·예금주를 조회해 대조하고 불일치는 `COMMON_VALIDATION_FAILED`로 막는다(전용 코드는 §18.1).
- 계좌가 없으면 팀 출금 시작(API-withdraw-01)이 `REDEEM_ACCOUNT_NOT_REGISTERED`로 막힌다. **[v4]** release 자체는 계좌 없이도 성공한다 — release는 리더 지갑에 KRWS를 보내는 온체인 동작이고, 원화 이체는 리더가 별도로 시작하기 때문이다(P-10 개정).
- 진행 중인 출금 건에는 소급 적용하지 않는다 [권].

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `teamId` | path | integer(BIGINT) | Y | 팀 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `bankCode` | string | Y | 3자리 숫자 | 은행 코드 |
| `accountNo` | string | Y | 10~16자리 숫자 | 계좌번호(하이픈 없이) |
| `holderName` | string | Y | 1~30자 | 예금주명 — 금융망 조회 결과와 일치해야 함 |

```json
{ "bankCode": "004", "accountNo": "80230103311", "holderName": "블루노트" }
```

### 시스템 처리
1. 리더 권한 확인 → 형식 검증.
2. 상태 전이 없음(팀 부속 정보 등록).
3. 외부 호출: 금융망 API 예금주 조회(동기, 타임아웃 5초) → 응답 예금주명과 `holderName` 대조. 오류는 `502`.
4. `bank_account` insert(계좌번호 암호화, `holder_verified = true`) → `team.settlement_account_id` 갱신 + 감사 로그(SEC-11).

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": { "teamId": 7, "bankCode": "004", "bankName": "국민", "accountNoMasked": "****3311", "holderName": "블루노트", "holderVerified": true, "verifiedAt": "2026-09-02T15:05:00+09:00" },
  "msg": "정산 계좌가 등록되었습니다."
}
```

### 4xx/5xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 형식 위반, 예금주명 불일치, 금융망에 없는 계좌 |
| 403 | `COMMON_FORBIDDEN` | 리더가 아님 |
| 404 | `TEAM_NOT_FOUND` | 존재하지 않는 `teamId` |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | 금융망 API 오류 |

---

## 3. wallet — 지갑 **[v4 재정의: 팀 지갑 → 회원 1:1 비수탁 지갑]**

**지갑은 사용자 소유이며 서버는 사용자 키를 보관하지 않는다**(P-2·결정 §2.3). `wallet` 테이블은 **회원 1:1**(`member_id` UNIQUE, `address` UNIQUE)이고 **암호화 키 컬럼이 없다**. 등록 경로는 둘이다.

| provider | 등록 경로 | 검증 | 화면 |
|---|---|---|---|
| `WEB3AUTH` | API-member-01 로그인 시 자동 | idToken(JWKS) 검증 시각 = `verified_at` | C-01 |
| `EXTERNAL` | API-wallet-03(챌린지 발급) → 지갑 서명 → API-wallet-04(검증) | 서명 챌린지 검증 시각 = `verified_at` | C-05 |

상태는 `LINKED` / `SUSPENDED`(관리자 정지)다. 회원당 1개이며 교체는 MVP에서 관리자 처리(잔액 0 확인 후, 미결 안건 14)다. **팀 지갑 = 팀 리더의 지갑**이므로 이 절의 API가 관객·리더 모두를 다룬다. v3의 팀 지갑 조회(`GET /teams/{teamId}/wallet`)·tx 이력(`GET /teams/{teamId}/wallet/transactions`) 경로는 회원 기준 `GET /wallets/me`·`GET /wallets/me/transactions`로 **대체**됐다.

### API-wallet-01 내 지갑 조회 **[v4 신설]**
`GET /api/v1/wallets/me` · 권한: 회원 · 우선: P0 · 연관 화면: `A-13 내 지갑`·`P-02 팀 관리`·`C-03 마이페이지` · 연관 기능: `F-wallet-02 지갑 조회`

## 요구사항
- 내 지갑의 `provider`·주소·**KRWS 잔액(원 값 + `display`)**·상태·익스플로러 링크·가스 상태를 준다. A-13 화면 전체가 이 응답으로 그려진다.
- 잔액은 체인 `KRWS.balanceOf(address)`가 원장이다. 노드 조회 결과를 **10초 캐시**하고 `wallet.cached_krws_balance`를 갱신한다 [권]. 노드 장애 시 마지막 캐시값과 `stale: true`·`cachedAt`을 함께 준다(AVAIL-02).
- **가스는 원시값을 노출하지 않는다**(P-3). `gas.sufficient`(임계 충족)와 `gas.remainingSignCount`(남은 서명 가능 횟수 추정)로 환산해 주고, 부족하면 `gas.refillAvailable: true`로 API-wallet-05 버튼을 열어준다. 화면 문구는 §0.6 규칙을 따른다.
- **개인키·니모닉·MPC 샤드는 어떤 필드로도 반환하지 않는다.** 서버가 갖고 있지 않다.
- 지갑이 없으면 `404 WALLET_NOT_FOUND`다 — 클라이언트는 C-05 지갑 연결로 보낸다(전용 코드 `WALLET_NOT_LINKED`는 §18.1).
- 팀 리더가 호출하면 이 응답이 곧 **팀 지갑 조회**다. 별도 팀 지갑 경로는 없다.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
없음.

### Body
없음.

### 시스템 처리
1. 회원 식별 → `wallet` 존재·상태 확인.
2. 상태 전이 없음(조회).
3. 외부 호출: `KRWS.balanceOf(address)` + 네이티브 KAIA 잔액 조회(10초 캐시). 노드 오류 시 캐시값 + `stale: true`, 캐시도 없으면 `502`.
4. `wallet.cached_krws_balance`·`last_balance_check_at` 갱신 후 반환. 유효 `exchange_rate`로 `display` 계산.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "walletId": 4401,
    "provider": "WEB3AUTH",
    "address": "0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a",
    "status": "LINKED",
    "verifiedAt": "2026-09-02T13:00:00+09:00",
    "balance": { "amount": 35000, "currency": "KRW", "display": { "currency": "USD", "approx": 25.93, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" } },
    "gas": { "sufficient": true, "remainingSignCount": 12, "refillAvailable": false, "lastFundedAt": "2026-09-02T13:00:05+09:00" },
    "network": "kaia-kairos",
    "chainId": 1001,
    "tokenAddress": "0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736",
    "explorerUrl": "https://kairos.kaiascan.io/address/0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a",
    "cachedAt": "2026-09-02T14:00:00+09:00",
    "stale": false
  },
  "msg": ""
}
```

### 4xx/5xx
```json
{ "code": "WALLET_NOT_FOUND", "data": null, "msg": "연결된 지갑이 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 403 | `COMMON_FORBIDDEN` | 지갑 상태가 `SUSPENDED` |
| 404 | `WALLET_NOT_FOUND` | 지갑 미연결 회원 (자체 이메일 가입 후 미연결) |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | 체인 노드 조회 실패이며 캐시도 없음 |

---

### API-wallet-02 내 지갑 거래 이력 **[v4 신설]**
`GET /api/v1/wallets/me/transactions` · 권한: 회원 · 우선: P0 · 연관 화면: `A-13 내 지갑` · 연관 기능: `F-wallet-03 지갑 거래 이력 조회`

## 요구사항
- 내 지갑이 관여한 거래를 최신순으로 준다. 필터는 결정 §7 `WalletTx.type`의 **8종** — `CHARGE`(충전 mint) / `PURCHASE`(결제) / `REFUND`(환불 수령) / `RELEASE`(정산 수령) / `DEPOSIT`(보증금 납부) / `DEPOSIT_RETURN`(보증금 반환) / `WITHDRAW_BANK`(원화 출금 예치) / `GAS`(가스 충전)다.
- 각 행에 **부호 있는 금액**(`direction`: `IN`/`OUT`)·상태·`txHash`·익스플로러 링크·`signerType`을 담아 사용자가 직접 검증할 수 있게 한다. 실패한 거래도 `FAILED`로 함께 보여준다.
- 서버가 인덱싱한 `chain_job`·`coin_charge`·`coin_withdrawal`·`refund`·`settlement_share`를 원본으로 삼는다. **노드를 직접 페이징하지 않는다**(PERF-01).
- 관객 화면(A-13)에서는 `txHash`를 기본 접어 두고 "자세히"에서만 펼친다 — 블록체인 용어 노출 최소화(§0.6). 응답에는 그대로 담는다.
- `GAS` 행은 KRWS가 아니라 네이티브 KAIA라 `currency: "KAIA"`이며 `display`를 내리지 않는다. 화면에서는 기본 필터에서 제외한다 [권].

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `type` | query | string | N | `CHARGE`/`PURCHASE`/`REFUND`/`RELEASE`/`DEPOSIT`/`DEPOSIT_RETURN`/`WITHDRAW_BANK`/`GAS`. 미지정 시 `GAS` 제외 전체 |
| `status` | query | string | N | `PENDING`/`SUBMITTED`/`CONFIRMED`/`FAILED` |
| `page` | query | integer | N | 0-base, 기본 0 |
| `size` | query | integer | N | 기본 20, 최대 100 |
| `sort` | query | string | N | `occurredAt,desc`(기본) / `occurredAt,asc` |

### Body
없음.

### 시스템 처리
1. 회원·지갑 확인 → `type`·`status` 화이트리스트 검증.
2. 상태 전이 없음(조회).
3. 외부 호출 없음(인덱싱된 데이터 사용).
4. 도메인 레코드를 `WalletTx` 뷰로 통합해 `items`/`pageInfo` 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "rate": { "currency": "USD", "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "items": [
      {
        "walletTxId": "chg_7701",
        "type": "CHARGE",
        "direction": "IN",
        "amount": 50000,
        "currency": "KRW",
        "status": "CONFIRMED",
        "refType": "CHARGE",
        "refId": 7701,
        "title": "Top-up (Visa ****4242)",
        "signerType": "OPERATOR",
        "txHash": "0x4a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293",
        "explorerUrl": "https://kairos.kaiascan.io/tx/0x4a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293",
        "occurredAt": "2026-09-10T19:58:12+09:00"
      },
      {
        "walletTxId": "pay_8801",
        "type": "PURCHASE",
        "direction": "OUT",
        "amount": 50000,
        "currency": "KRW",
        "status": "CONFIRMED",
        "refType": "ORDER",
        "refId": 5501,
        "title": "합정 3밴드 합동공연 · 일반 2매",
        "signerType": "USER",
        "txHash": "0x5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f607182934a",
        "explorerUrl": "https://kairos.kaiascan.io/tx/0x5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f607182934a",
        "occurredAt": "2026-09-10T20:03:11+09:00"
      }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 9, "hasNext": false }
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `type`·`status`·`sort`, `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 404 | `WALLET_NOT_FOUND` | 지갑 미연결 회원 |

---

### API-wallet-03 외부 지갑 등록 챌린지 발급 **[v4 신설 · P1 — 9/2 최소화: Web3Auth 모달 어댑터로 대체]**
`POST /api/v1/wallets/challenge` · 권한: 회원 · 우선: P0 · 연관 화면: `C-05 지갑 연결` · 연관 기능: `F-wallet-05 외부 지갑 등록(챌린지·서명 검증)`

## 요구사항
- 이미 지갑(Kaia Wallet·MetaMask)을 가진 사용자가 **그 지갑의 소유를 증명**하도록 서명할 메시지를 발급한다. 서버 난수 `nonce` + **도메인 바인딩**(서비스 도메인·chainId·회원 ID)을 포함하고 **5분 유효, 1회용**이다(결정 §2.3).
- 챌린지는 **테이블로 만들지 않는다** — Redis `wallet:challenge:{memberId}` TTL 300s에 저장한다 [권](결정 §8). 같은 회원이 다시 호출하면 이전 챌린지를 덮어써 무효화한다.
- 서명할 메시지는 EIP-191 `personal_sign` 대상 평문이며, 사용자가 **읽고 무엇에 서명하는지 알 수 있는 문장**이어야 한다. 서버는 이 문장을 그대로 저장해 검증에 쓴다.
- 이미 지갑이 `LINKED`인 회원은 `COMMON_CONFLICT`로 막는다 — MVP에는 교체 화면이 없다(미결 안건 14, 전용 코드 `WALLET_ALREADY_LINKED`는 §18.1).
- **회원당 10회/분** 호출 제한(§0.9). 챌린지 발급 자체는 가스도 온체인 작업도 쓰지 않는다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `address` | string | Y | `0x` + 40 hex(42자) | 등록하려는 외부 지갑 주소. 검증 단계의 복구 주소와 일치해야 함 |

```json
{ "address": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b" }
```

### 시스템 처리
1. 회원 식별 → 기존 `wallet` 존재 확인(있으면 409) → 주소 형식 확인 → **다른 회원이 이미 등록한 주소인지** 확인(있으면 409).
2. 상태 전이 없음. Redis `wallet:challenge:{memberId}`에 `{nonce, address, message, issuedAt}` 저장(TTL 300s, 기존 값 덮어쓰기).
3. 외부 호출 없음.
4. 챌린지 발급 감사 로그(`action_type=WALLET_LINK`).

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "nonce": "3f9c1d2e4b5a6c8d",
    "message": "B204 Stage wants you to link this wallet.\n\nAddress: 0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b\nMember: 1024\nChain: Kaia Kairos (1001)\nDomain: b204.ssafy.io\nNonce: 3f9c1d2e4b5a6c8d\nIssued At: 2026-09-02T15:20:00+09:00\n\nThis signature does not authorize any transfer.",
    "signMethod": "personal_sign",
    "chainId": 1001,
    "expiresAt": "2026-09-02T15:25:00+09:00"
  },
  "msg": ""
}
```

`message`는 **한 글자도 바꾸지 않고** 지갑에 넘겨야 한다. 서버는 저장한 원문으로만 서명을 검증한다.

### 4xx
```json
{ "code": "COMMON_CONFLICT", "data": null, "msg": "이미 연결된 지갑이 있습니다. 관리자에게 문의해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 주소 형식 위반 |
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 409 | `COMMON_CONFLICT` | 요청자에게 이미 `LINKED` 지갑이 있음, 또는 그 주소가 다른 회원에 등록됨 (전용 코드 `WALLET_ALREADY_LINKED`는 §18.1) |
| 429 | `COMMON_TOO_MANY_REQUESTS` | 회원당 10회/분 초과 (§0.9) |

---

### API-wallet-04 챌린지 서명 검증 → 지갑 등록 **[v4 신설 · P1 — 9/2 최소화]**
`POST /api/v1/wallets/verify` · 권한: 회원 · 우선: P0 · 연관 화면: `C-05 지갑 연결` · 연관 기능: `F-wallet-05 외부 지갑 등록(챌린지·서명 검증)`

## 요구사항
- 지갑이 만든 서명을 받아 **`ecrecover`로 주소를 복구**하고, ① 복구 주소 == 챌린지의 `address` ② `nonce` 일치 ③ 5분 미경과 ④ 미사용(1회용)을 모두 확인한 뒤 `wallet`(`provider=EXTERNAL`, `verified_at=now`, `status=LINKED`)을 등록한다.
- 검증 실패는 `COMMON_VALIDATION_FAILED`(400), 만료·재사용은 `COMMON_CONFLICT`(409)로 구분한다(전용 코드 `WALLET_SIGNATURE_INVALID`·`WALLET_CHALLENGE_EXPIRED`는 §18.1). 성공 즉시 Redis 챌린지를 **삭제**해 재사용을 막는다.
- 등록 직후 운영지갑이 KAIA를 자동 충전한다(관객 0.05 / 팀 리더 0.5 [권] P-3). 비동기 job이며 실패해도 등록을 되돌리지 않는다.
- **서버는 사용자 개인키를 받지 않는다.** 받는 것은 서명 문자열(65바이트 hex)뿐이며, 이 서명은 어떤 자금 이동 권한도 위임하지 않는다(메시지 문장에 그렇게 적혀 있다).
- 등록 후 이 회원의 결제·보증금·동의·출금 서명은 이 지갑으로만 가능하다. Web3Auth 회원은 이 API를 쓰지 않는다(C-05에서 정보 표시만).

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `address` | string | Y | 42자, 챌린지와 동일 | 등록할 지갑 주소 |
| `nonce` | string | Y | 16 hex | API-wallet-03이 준 `nonce` |
| `signature` | string | Y | `0x` + 130 hex(132자) | `personal_sign(message)` 결과 |
| `walletLabel` | string | N | 최대 20자 | `KAIA_WALLET` / `METAMASK` 등 표시용 라벨 |

```json
{
  "address": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b",
  "nonce": "3f9c1d2e4b5a6c8d",
  "signature": "0x9f1c...1b",
  "walletLabel": "KAIA_WALLET"
}
```

### 시스템 처리
1. Redis `wallet:challenge:{memberId}` 조회 → 존재·`nonce`·`address` 일치·미만료 확인 → `ecrecover(message, signature)` 복구 주소 대조.
2. 상태 전이: `wallet` insert(`provider=EXTERNAL`, `status=LINKED`, `verified_at=now`) → Redis 챌린지 **삭제**.
3. 외부 호출: 운영지갑 → 사용자 주소 KAIA 충전 `chain_job`(`GAS_CHARGE`, `OPERATOR`) 등록(비동기).
4. `wallet` 저장 + 감사 로그(`action_type=WALLET_LINK`, 주소·provider·검증 시각). **서명 원문은 로그에 남기고 개인키류는 존재하지 않는다.**

## Response
### 201 Created
```json
{
  "code": "SUCCESS",
  "data": {
    "walletId": 4402,
    "provider": "EXTERNAL",
    "walletLabel": "KAIA_WALLET",
    "address": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b",
    "status": "LINKED",
    "verifiedAt": "2026-09-02T15:22:40+09:00",
    "explorerUrl": "https://kairos.kaiascan.io/address/0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b",
    "gasFundingJobId": "chain_01J9G7E8F9",
    "balance": { "amount": 0, "currency": "KRW", "display": { "currency": "USD", "approx": 0.00, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" } }
  },
  "msg": "지갑이 연결되었습니다."
}
```

### 4xx
```json
{ "code": "COMMON_VALIDATION_FAILED", "data": null, "msg": "서명 확인에 실패했습니다. 다시 시도해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 서명 형식 위반, `ecrecover` 복구 주소 ≠ `address`, `nonce` 불일치 (전용 코드 `WALLET_SIGNATURE_INVALID`는 §18.1) |
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 409 | `COMMON_CONFLICT` | 챌린지 만료(5분)·이미 사용됨·발급 이력 없음, 요청자에게 이미 지갑 존재, 주소가 다른 회원에 등록됨 (전용 코드 `WALLET_CHALLENGE_EXPIRED`·`WALLET_ALREADY_LINKED`는 §18.1) |

---

### API-wallet-05 가스 재충전 요청 **[v4 신설 · 삭제 — 9/2 수수료 대납 채택, P1 예비]**
`POST /api/v1/wallets/me/gas` · 권한: 회원 · 우선: P0 · 연관 화면: `공통(서명 단계 컴포넌트)` · 연관 기능: `F-wallet-04 가스 자동 충전`

## 요구사항
- 서명 직전 사용자 지갑의 KAIA가 임계(관객 0.01 · 팀 리더 0.05) 미달일 때 **운영지갑이 소액을 대신 채워 준다**(P-3). 온체인 전송이므로 `202 Accepted` + `jobId`이며 폴링은 API-chain-01이다.
- 충전량은 서버가 정한다 — 관객 **0.05**, 팀 리더(팀을 하나 이상 소유) **0.5** KAIA [권]. 요청으로 금액을 지정할 수 없다(무한 인출 방지).
- 임계를 이미 넘긴 지갑의 요청은 **충전하지 않고 200으로 성공**시킨다(`funded: false`, `reason: "SUFFICIENT"`) — 프론트가 조건 없이 호출해도 안전하게 만들기 위해서다 [권].
- **회원당 3회/분·일 20회** 제한(§0.9). 초과는 `429`다. 운영지갑 잔액 부족은 `CHAIN_GAS_INSUFFICIENT`(500)이며 관리자 알림 대상이다.
- 사용자 화면에 가스·KAIA 단위를 노출하지 않는다 — "Preparing your wallet…" 같은 문구로 감싼다(§0.6). 응답의 수치는 관리자·로그용이다.
- 대부분의 경우 프론트는 이 API를 직접 부르지 않는다. `prepare` 응답의 `gasStatus.fundingJobId`가 이미 job을 걸어 주기 때문이며(§0.4), 이 경로는 **수동 재시도용**이다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
없음.

### Body
없음(빈 객체 `{}` 허용).

### 시스템 처리
1. 회원·지갑 확인 → 호출 한도 확인 → 네이티브 잔액 조회 → 임계 비교 → 회원 유형(관객/팀 리더) 판정.
2. 상태 전이: 충전 필요 시 `chain_job` 생성(`tx_type=GAS_CHARGE`, `signer_type=OPERATOR`, `wallet_id`, `PENDING`).
3. 외부 호출(202): 운영지갑 → 사용자 주소 KAIA 전송(nonce 직렬 큐). 실패 3회 재시도 후 연장 재시도.
4. `chain_job` 저장 + `wallet.gas_funded_at` 갱신(확정 시) + 감사 로그.

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": { "jobId": "chain_01J9G9H0K1", "status": "PENDING", "pollAfterMs": 1500, "funded": true, "walletRole": "TEAM_LEADER", "fundedAmountKaia": "0.5" },
  "msg": ""
}
```

### 200 OK (충전 불필요)
```json
{ "code": "SUCCESS", "data": { "jobId": null, "funded": false, "reason": "SUFFICIENT", "remainingSignCount": 14 }, "msg": "" }
```

### 4xx/5xx
```json
{ "code": "COMMON_TOO_MANY_REQUESTS", "data": null, "msg": "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 403 | `COMMON_FORBIDDEN` | 지갑 상태가 `SUSPENDED` |
| 404 | `WALLET_NOT_FOUND` | 지갑 미연결 회원 |
| 429 | `COMMON_TOO_MANY_REQUESTS` | 회원당 3회/분 또는 일 20회 초과 |
| 500 | `CHAIN_GAS_INSUFFICIENT` | 운영지갑 잔액 부족 — 관리자 알림 대상, 원인 미노출 |

---

> **v3 API-wallet-01 `GET /api/v1/teams/{teamId}/wallet`·API-wallet-02 `GET /api/v1/teams/{teamId}/wallet/transactions`는 [v4 경로 교체]됐다.** 지갑이 팀 소유에서 **회원 소유**로 바뀌어(`team_wallet` 삭제, `wallet` 회원 1:1) 팀 경로에 지갑을 매달 근거가 없어졌다. 팀 리더가 `GET /api/v1/wallets/me`를 부르면 그 응답이 곧 팀 지갑이고, 팀 화면(P-02)에는 API-team-03이 파생 주소를 담아 준다. 번호(API-wallet-01·02)는 재사용하며 v3 경로는 되살리지 않는다.

---

## 4. performance — 공연

공연 상태 전이: `DRAFT` → `PENDING_AGREEMENT` → `ON_SALE` → `SALE_CLOSED` → `ENDED` / `CANCELLED`. 좌석 없는 **스탠딩**, 티켓 타입 1~N개, 1인 1공연 최대 4매 [권] P-6. 판매 시작 이후 공연 정보·티켓 옵션·참여팀·정산 규칙은 바꿀 수 없다(컨트랙트가 강제, `PERFORMANCE_ALREADY_ON_SALE`).

**[v4] 보증금 단계가 추가됐다(P-21).** 공연 생성 시 `deposit_amount`(기본 **50,000 KRWS** [권])가 정해지고 `deposit_status=UNPAID`로 시작한다. **생성팀 리더가 `approve` + `RevenueSplitter.deposit(showId)`를 직접 서명**해 `PAID`가 되어야 정산 규칙 설정(API-rule-01)으로 넘어갈 수 있다. 서명 흐름은 §0.4 prepare/signed-tx 패턴이고 API-performance-13·14가 담당한다. 반환은 정산 `RELEASED` 확정 시 또는 공연 취소 일괄 환불 완료 시 운영자가 `returnDeposit`으로 실행한다. 몰수(`forfeitDeposit`)는 P1이다.

**[v4] 티켓 가격 단위는 KRWS(=원)** 이고, 공개 응답의 금액에는 `display`가 붙는다(§0.5). `performance.deposit_bank_tx_id`는 삭제되고 `deposit_job_id`·`deposit_tx_hash`·`deposit_return_tx_hash`로 대체됐다(결정 §8 #6).

### API-performance-01 공연 생성 **[v4 변경 — 보증금 필드 추가]**
`POST /api/v1/performances` · 권한: 리더 · 우선: P0 · 연관 화면: `P-03 공연 생성·수정` · 연관 기능: `F-performance-01 공연 생성`

## 요구사항
- 팀 리더가 공연 기본 정보(제목·소개·일시·장소)와 단독/공동 여부를 등록한다. 생성자 팀은 자동으로 참여팀 1번이 된다.
- 생성 직후 상태는 `DRAFT`, **[v4] `depositStatus`는 `UNPAID`**다. 응답의 `depositAmount`·`depositStatus`·`nextAction`으로 P-03 화면이 보증금 단계를 띄운다. 보증금이 `PAID`가 아니면 API-rule-01이 막힌다.
- **취소 마감(공연일 D-3 00:00)과 판매 마감(공연 시작 1시간 전)은 서버가 `startAt`에서 자동 계산한다** [권] P-8·P-9. 둘 다 요청 필드로 받지 않고 응답으로만 내려준다.
- 공연 일시가 과거이거나 `endAt` ≤ `startAt`이면 `PERFORMANCE_DATE_INVALID`다.
- **[v4] 생성 시점에 리더 지갑 연결을 확인**한다. 미연결이면 `WALLET_NOT_FOUND`다 — 보증금 서명을 할 수 없기 때문이다.
- 공연 생성과 동시에 **검표 페이지 링크**(서명 토큰)가 자동 생성된다. 조회는 API-performance-10이다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

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
| `jointPerformance` | boolean | Y | — | 공동 공연 여부. `true`면 참여팀 2팀 이상 필수 |

`depositAmount`는 요청 필드가 **아니다** — 플랫폼 고정값 50,000 KRWS다(P-21, 미결 안건 9).

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
  "jointPerformance": true
}
```

### 시스템 처리
1. 리더 권한 확인 → **리더 `wallet` 존재·`LINKED` 확인** → 일시 정합성 검증(`startAt` 미래, `endAt` > `startAt`).
2. 상태 전이: `performance` 생성(`DRAFT`, `deposit_amount=50000`, `deposit_status=UNPAID`). `cancelDeadlineAt = startAt` 날짜 기준 D-3 00:00, `saleCloseAt = startAt - 1시간`으로 서버가 계산.
3. 외부 호출 없음 — 컨트랙트 `createShow`는 판매 시작(API-rule-04)에서 하고, 보증금 서명은 API-performance-13·14다.
4. `performance` + 생성자 팀 `performance_participant`(수락 상태, `wallet_address`는 `createShow` 시점에 스냅샷) 저장 + 검표 링크 토큰 발급.

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
    "endAt": "2026-09-19T22:00:00+09:00",
    "saleCloseAt": "2026-09-19T18:00:00+09:00",
    "cancelDeadlineAt": "2026-09-16T00:00:00+09:00",
    "deposit": {
      "status": "UNPAID",
      "amount": 50000,
      "currency": "KRW",
      "display": { "currency": "USD", "approx": 37.04, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
      "leaderBalance": 120000,
      "sufficient": true
    },
    "nextAction": "PAY_DEPOSIT"
  },
  "msg": "공연이 생성되었습니다. 보증금을 납부해 주세요."
}
```

`nextAction`은 `PAY_DEPOSIT` → `SET_RULES` → `COLLECT_AGREEMENTS` → `START_SALE` 순서로 바뀌며 P-03 화면 진행 표시에 쓴다.

### 4xx
```json
{ "code": "PERFORMANCE_DATE_INVALID", "data": null, "msg": "공연 일시를 다시 확인해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 형식 위반, `saleCloseAt`·`cancelDeadlineAt`·`depositAmount` 전달(서버 결정 필드) |
| 400 | `PERFORMANCE_DATE_INVALID` | 과거 일시, `endAt` ≤ `startAt` |
| 403 | `COMMON_FORBIDDEN` | `hostTeamId` 팀의 리더가 아님 |
| 404 | `TEAM_NOT_FOUND` | 존재하지 않는 `hostTeamId` |
| 404 | `WALLET_NOT_FOUND` | **[v4]** 리더 지갑 미연결 |

---

### API-performance-02 공연 목록(공개)
`GET /api/v1/performances` · 권한: GUEST(인증 불필요) · 우선: P0 · 연관 화면: `A-01 홈·공연 탐색` · 연관 기능: `F-performance-02 공연 목록 탐색`

## 요구사항
- 비로그인 방문자도 볼 수 있는 공개 목록이다. **`ON_SALE`·`SALE_CLOSED` 공연만** 노출한다 [권]. 검색어(제목·팀명)·날짜 범위로 필터하고 기본 정렬은 공연 시작 일시 오름차순이다.
- **[v4]** 금액은 §0.5 축약형(`data.rate` + 항목 `minPriceAmount`)이며, 문구·고지는 `Accept-Language`에 따라 en/ko다. 목록에 지갑 주소·해시는 담지 않는다.
- 조회 API p95 ≤ 500ms 목표 대상이다(PERF-01). 목록 응답은 30초 캐시하며, **환율이 바뀌면 캐시를 무효화**한다 [권].

## Request
### Headers
- `Accept: application/json` · `Accept-Language: en` / `ko`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `keyword` | query | string | N | 최대 50자. 제목·참여팀명 부분 일치 |
| `fromDate` | query | string(ISO date) | N | 공연일 시작 |
| `toDate` | query | string(ISO date) | N | 공연일 종료. `fromDate` 이상 |
| `status` | query | string | N | `ON_SALE` / `SALE_CLOSED`. 미지정 시 둘 다 |
| `page`·`size`·`sort` | query | — | N | §0.2. `sort`는 `startAt,asc`(기본)/`startAt,desc`/`createdAt,desc` |

### Body
없음.

### 시스템 처리
1. 쿼리 검증(`toDate` ≥ `fromDate`, `status`·`sort` 허용값).
2. 상태 전이 없음(조회).
3. 외부 호출 없음.
4. 공개 대상 상태만 필터해 `items`/`pageInfo` + 유효 환율 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "rate": { "currency": "USD", "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "items": [
      {
        "performanceId": 12,
        "title": "합정 3밴드 합동공연",
        "posterImageUrl": "https://cdn.b204.ssafy.io/p/12.png",
        "venueName": "합정 언플러그드",
        "startAt": "2026-09-19T19:00:00+09:00",
        "status": "ON_SALE",
        "minPriceAmount": 25000,
        "currency": "KRW",
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
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `size` 100 초과, 날짜 역전, 허용되지 않는 `status`·`sort` |
| 429 | `COMMON_TOO_MANY_REQUESTS` | 호출 한도 초과 |

---

### API-performance-03 공연 상세(공개)
`GET /api/v1/performances/{performanceId}` · 권한: GUEST(인증 불필요) · 우선: P0 · 연관 화면: `A-02 공연 상세` · 연관 기능: `F-performance-03 공연 상세 조회`

## 요구사항
- 출연팀·일시·장소·티켓 옵션(잔여 수량)과 **공개 검증 페이지 링크**를 준다. **[v4]** 가격은 원 값 + `display` 환산을 함께 담아 "₩25,000 ≈ $18.52"로 표시하게 한다(P-22).
- 관객 화면이므로 지갑 주소·해시·컨트랙트 용어를 담지 않는다(§0.7). 참여팀 지갑 주소는 API-verify-01에서만 준다.
- 티켓 타입별 잔여 수량은 Redis 재고 기준 근사값이다. 확정은 주문 생성 시점이며 경합에서 밀리면 `TICKET_SOLD_OUT`이다.
- 취소 마감 시각(`cancelDeadlineAt`)을 함께 내려 A-11 환불 안내에 쓴다 [권] P-8. **[v4]** 환불이 지갑 잔액으로 돌아간다는 고지(`refundPolicyNotice`)를 함께 담는다.
- `DRAFT`·`PENDING_AGREEMENT` 공연은 생성자·참여팀 리더에게만 보이고, 그 외에는 `PERFORMANCE_NOT_FOUND`로 존재를 숨긴다 [권].

## Request
### Headers
- `Accept: application/json` · `Accept-Language` · (선택) `Authorization: Bearer {accessToken}` — 미공개 공연을 관계자가 미리 볼 때만

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
4. `performance` + `ticket_type` + `performance_participant` + Redis 재고 + 유효 환율 조합 반환.

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
    "saleCloseAt": "2026-09-19T18:00:00+09:00",
    "cancelDeadlineAt": "2026-09-16T00:00:00+09:00",
    "status": "ON_SALE",
    "jointPerformance": true,
    "purchaseLimitPerMember": 4,
    "rate": { "currency": "USD", "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "participants": [
      { "teamId": 7, "teamName": "블루노트", "host": true },
      { "teamId": 9, "teamName": "새벽세시", "host": false },
      { "teamId": 11, "teamName": "노이즈캔슬", "host": false }
    ],
    "ticketTypes": [
      { "ticketTypeId": 31, "name": "일반", "price": { "amount": 25000, "currency": "KRW", "display": { "currency": "USD", "approx": 18.52, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" } }, "totalQuantity": 80, "remainingQuantity": 41 },
      { "ticketTypeId": 32, "name": "응원", "price": { "amount": 35000, "currency": "KRW", "display": { "currency": "USD", "approx": 25.93, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" } }, "totalQuantity": 20, "remainingQuantity": 12 }
    ],
    "refundPolicyNotice": "Refunds are returned to your balance in Korean won.",
    "verificationUrl": "https://b204.ssafy.io/verify/12"
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않거나 비공개 상태를 비관계자가 조회 |

---

### API-performance-04 공연 수정(잠금 전)
`PATCH /api/v1/performances/{performanceId}` · 권한: 생성자 · 우선: P0 · 연관 화면: `P-03 공연 생성·수정` · 연관 기능: `F-performance-04 공연 정보 수정`

## 요구사항
- `DRAFT`·`PENDING_AGREEMENT`에서만 수정할 수 있다. `ON_SALE` 이후에는 `PERFORMANCE_ALREADY_ON_SALE`이다. 생성자 팀 리더만 수정한다(SEC-03).
- 일시를 바꾸면 `cancelDeadlineAt`·`saleCloseAt`을 다시 계산한다 [권] P-8.
- 규칙이 이미 설정돼 `PENDING_AGREEMENT`인데 일시·공동 여부를 바꾸면 **기존 팀별 동의를 전부 초기화**(`RuleAgreement` → `PENDING`)하고 규칙 해시를 재산출한다 [권]. **[v4]** 이미 `SIGNING`(tx 보고 후 receipt 대기) 상태인 동의도 `PENDING`으로 되돌리고, 그 `chain_job`은 `FAILED`(사유: 규칙 변경)로 닫는다.
- **[v4] 보증금은 초기화 대상이 아니다.** 이미 납부된 `deposit_status=PAID`는 유지된다 — 온체인 `deposit`은 공연 단위 1회이고 규칙 해시와 무관하기 때문이다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}`

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

`saleCloseAt`·`cancelDeadlineAt`·`depositAmount`는 요청 필드가 아니다.

```json
{ "venueName": "합정 언플러그드 B홀", "startAt": "2026-09-19T19:30:00+09:00", "endAt": "2026-09-19T22:30:00+09:00" }
```

### 시스템 처리
1. 생성자 권한 확인 → 상태(`DRAFT`·`PENDING_AGREEMENT`) 확인 → 일시 정합성 검증.
2. 상태 전이: 일시·공동 여부 변경 시 `rule_agreement` `AGREED`·`SIGNING` → `PENDING` 초기화(진행 중 `chain_job`은 `FAILED`로 닫는다). `deposit_status`는 유지.
3. 외부 호출 없음(아직 `createShow` 전 구간).
4. `performance` 갱신 + `cancelDeadlineAt`·`saleCloseAt` 재계산.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": { "performanceId": 12, "status": "PENDING_AGREEMENT", "startAt": "2026-09-19T19:30:00+09:00", "saleCloseAt": "2026-09-19T18:30:00+09:00", "cancelDeadlineAt": "2026-09-16T00:00:00+09:00", "agreementsReset": true, "depositStatus": "PAID" },
  "msg": "공연 정보가 수정되었습니다. 참여팀 동의를 다시 받아야 합니다."
}
```

### 4xx
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
`PUT /api/v1/performances/{performanceId}/ticket-types` · 권한: 생성자 · 우선: P0 · 연관 화면: `P-03 공연 생성·수정` · 연관 기능: `F-performance-05 티켓 옵션 설정`

## 요구사항
- 티켓 타입 1~10개(이름·가격·수량)를 **전체 교체**한다(PUT). 좌석 없는 스탠딩이다 [권] P-6. `ON_SALE` 이후에는 `PERFORMANCE_ALREADY_ON_SALE`이다.
- **[v4] 가격 단위는 KRWS(=원) 정수**다. KRWS `decimals=0`이라 소수를 받지 않으며, 소수·문자열 금액은 `COMMON_VALIDATION_FAILED`다. 표시 통화로 가격을 입력받지 않는다(P-17 — 환율은 표시에만).
- 이미 판매된 수량보다 적게 `totalQuantity`를 줄일 수 없다 [권]. 1인 1공연 최대 4매는 공연 단위 고정이며 이 API로 바꾸지 않는다.
- 응답에는 원 값과 `display` 환산을 함께 담아 P-03 미리보기가 관객 화면과 같은 표기를 쓰게 한다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}`

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
| `ticketTypes[].price` | integer | Y | 0 이상, 1,000,000 이하, **KRWS 정수** | 판매가 |
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
1. 생성자 권한·상태(`DRAFT`·`PENDING_AGREEMENT`) 확인 → 이름 중복·금액(정수·범위)·수량 검증.
2. 상태 전이 없음. 목록에서 빠진 기존 타입은 삭제한다.
3. 외부 호출 없음.
4. `ticket_type` 전체 교체 + Redis 재고 키 재초기화.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "rate": { "currency": "USD", "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "ticketTypes": [
      { "ticketTypeId": 31, "name": "일반", "priceAmount": 25000, "currency": "KRW", "totalQuantity": 80, "remainingQuantity": 80 },
      { "ticketTypeId": 33, "name": "응원", "priceAmount": 35000, "currency": "KRW", "totalQuantity": 20, "remainingQuantity": 20 }
    ]
  },
  "msg": "티켓 옵션이 저장되었습니다."
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 이름 중복, 금액 소수·범위 위반, 수량 위반, 배열 크기 위반 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 404 | `TICKET_OPTION_NOT_FOUND` | 지정한 `ticketTypeId`가 이 공연 소속이 아님 |
| 409 | `PERFORMANCE_ALREADY_ON_SALE` | 상태가 `ON_SALE` 이후 |

---

### API-performance-06 내 팀 참여 공연 목록
`GET /api/v1/performances/me` · 권한: PERFORMER · 우선: P0 · 연관 화면: `P-01 공연자 대시보드` · 연관 기능: `F-performance-06 내 참여 공연 목록 조회`

## 요구사항
- 로그인 회원이 리더인 팀이 **주최하거나 참여 중인** 공연을 `DRAFT`부터 `CANCELLED`까지 전부 준다.
- 각 행에 공연 상태·정산 상태·**[v4] `depositStatus`·`myTeamAgreementStatus`(`PENDING`/`SIGNING`/`AGREED`)·`pendingSignature`**를 담아 대시보드가 "지금 서명할 일"을 뽑을 수 있게 한다.
- `pendingSignature`는 이 회원이 지금 서명해야 하는 작업(`DEPOSIT`/`AGREE`/`TREASURY_IN`) 또는 `null`이다 — P-01 배지의 근거다 [권].
- 초대받았지만 아직 수락하지 않은 공연도 `participationStatus: "INVITED"`로 함께 준다 [권].

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `status` | query | string | N | `DRAFT`/`PENDING_AGREEMENT`/`ON_SALE`/`SALE_CLOSED`/`ENDED`/`CANCELLED` |
| `page`·`size`·`sort` | query | — | N | §0.2. `sort`는 `startAt,desc`(기본)/`startAt,asc` |

### Body
없음.

### 시스템 처리
1. 회원이 리더인 팀 목록 산출.
2. 상태 전이 없음(조회).
3. 외부 호출 없음.
4. `performance_participant` + `performance` + `rule_agreement` + `settlement` 조인 조회 → `items`/`pageInfo`.

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
        "status": "PENDING_AGREEMENT",
        "settlementStatus": "NONE",
        "depositStatus": "PAID",
        "teamId": 7,
        "host": true,
        "participationStatus": "ACCEPTED",
        "myTeamAgreementStatus": "PENDING",
        "pendingSignature": "AGREE"
      }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 4, "hasNext": false }
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `status`·`sort`, `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 403 | `COMMON_FORBIDDEN` | 리더인 팀이 없는 계정(`PERFORMER` 아님) |

---

### API-performance-07 참여팀 초대
`POST /api/v1/performances/{performanceId}/participants` · 권한: 생성자 · 우선: P0 · 연관 화면: `P-04 참여팀 관리` · 연관 기능: `F-performance-07 참여팀 초대`

## 요구사항
- 생성자 팀 리더가 다른 팀을 공동 공연 참여팀으로 초대한다. `INVITED`로 저장되고 상대 팀 리더의 수락(API-performance-08)으로 확정된다.
- `ON_SALE` 이후에는 초대할 수 없다. 규칙이 설정된 `PENDING_AGREEMENT`에서 초대하면 **기존 동의를 초기화**한다 [권] — 참여팀 구성이 규칙 해시의 입력이다.
- **[v4] 초대 대상 팀의 리더 지갑 연결을 확인**한다. 미연결 팀은 `WALLET_NOT_FOUND`로 막는다 — `createShow`의 `teamWallets` 배열에 넣을 주소가 없고 동의 서명도 불가하기 때문이다.
- 이미 참여·초대 중인 팀은 `TEAM_ALREADY_JOINED`다. 참여팀 상한은 **8팀** [권]이다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}`

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
1. 생성자 권한·공연 상태(`DRAFT`·`PENDING_AGREEMENT`) 확인 → 대상 팀 존재·**리더 지갑 `LINKED`**·중복·상한(8팀) 확인.
2. 상태 전이: `performance_participant` 생성(`INVITED`). 규칙 설정 후라면 `rule_agreement` 전체 `PENDING` 초기화.
3. 외부 호출 없음(컨트랙트 참여팀 등록은 판매 시작 시 일괄).
4. `performance_participant` 저장 + 대상 팀 리더에게 알림 [권].

## Response
### 201 Created
```json
{
  "code": "SUCCESS",
  "data": { "performanceId": 12, "teamId": 9, "teamName": "새벽세시", "participationStatus": "INVITED", "leaderWalletLinked": true, "invitedAt": "2026-09-02T16:10:00+09:00" },
  "msg": "참여 초대를 보냈습니다."
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `teamId` 누락, 참여팀 상한 8팀 초과 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 404 | `TEAM_NOT_FOUND` | 존재하지 않는 `teamId` |
| 404 | `WALLET_NOT_FOUND` | **[v4]** 대상 팀 리더 지갑 미연결 |
| 409 | `TEAM_ALREADY_JOINED` | 이미 참여·초대 중인 팀 |
| 409 | `PERFORMANCE_ALREADY_ON_SALE` | 상태가 `ON_SALE` 이후 |

---

### API-performance-08 참여 수락
`POST /api/v1/performances/{performanceId}/participants/{teamId}/accept` · 권한: 초대팀 리더 · 우선: P0 · 연관 화면: `P-04 참여팀 관리` · 연관 기능: `F-performance-08 참여 수락`

## 요구사항
- 초대받은 팀의 리더만 수락한다. 수락 즉시 `ACCEPTED`가 되고 검표 링크(API-performance-10)·입장 현황(API-entry-02)을 볼 수 있게 된다 [권] P-15.
- **[v4]** 응답에 리더 지갑 주소와 정산 계좌 등록 여부를 담아 화면이 "정산 계좌를 등록하세요"·"규칙 동의 서명이 필요합니다"를 안내하게 한다. 계좌 미등록으로 수락을 막지는 않는다(P-10 개정 — 계좌는 출금 시작 시점에 필요하다).
- `ON_SALE` 이후에는 수락할 수 없다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |
| `teamId` | path | integer(BIGINT) | Y | 수락하는 팀 PK. 요청자가 이 팀의 리더여야 함 |

### Body
없음.

### 시스템 처리
1. 초대 존재·상태(`INVITED`) 확인 → 요청자가 해당 팀 리더인지 확인 → 리더 지갑 `LINKED` 재확인.
2. 상태 전이: `performance_participant` `INVITED` → `ACCEPTED`.
3. 외부 호출 없음.
4. `performance_participant` 저장 + 생성자에게 알림 [권].

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
    "walletProvider": "WEB3AUTH",
    "settlementAccountRegistered": false,
    "nextAction": "AGREE_RULES",
    "acceptedAt": "2026-09-02T16:22:00+09:00"
  },
  "msg": "참여가 확정되었습니다. 정산 계좌를 등록해 주세요."
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 403 | `COMMON_FORBIDDEN` | 해당 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 404 | `TEAM_NOT_FOUND` | 초대 기록이 없는 `teamId` |
| 404 | `WALLET_NOT_FOUND` | **[v4]** 리더 지갑 미연결 |
| 409 | `TEAM_ALREADY_JOINED` | 이미 수락 완료 |
| 409 | `PERFORMANCE_ALREADY_ON_SALE` | 상태가 `ON_SALE` 이후 |

---

### API-performance-09 참여팀 제외(잠금 전)
`DELETE /api/v1/performances/{performanceId}/participants/{teamId}` · 권한: 생성자 · 우선: P0 · 연관 화면: `P-04 참여팀 관리` · 연관 기능: `F-performance-09 참여팀 제외`

## 요구사항
- 생성자가 초대 취소 또는 수락한 팀 제외를 한다. **`ON_SALE` 이후에는 불가**하다 — 참여팀 구성이 잠긴 규칙(`createShow`의 `teamWallets`)의 입력이기 때문이다.
- 생성자(주최) 팀 자신은 제외할 수 없다 [권]. 공연을 없애려면 API-performance-12를 쓴다.
- 제외 후 공동 공연인데 참여팀이 2팀 미만이면 판매 시작에서 `TEAM_MIN_COUNT_NOT_MET`으로 막힌다. 제외 자체는 허용한다 [권].
- 규칙 설정 이후라면 기존 팀별 동의를 전부 초기화한다(진행 중 `SIGNING` job은 `FAILED`로 닫는다).

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |
| `teamId` | path | integer(BIGINT) | Y | 제외할 팀 PK |

### Body
없음.

### 시스템 처리
1. 생성자 권한·상태(`DRAFT`·`PENDING_AGREEMENT`) 확인 → 주최 팀 여부 확인.
2. 상태 전이: `performance_participant` 삭제, `rule_agreement` 전체 `PENDING` 초기화.
3. 외부 호출 없음.
4. 삭제 반영 + 감사 로그.

## Response
### 200 OK
```json
{ "code": "SUCCESS", "data": { "performanceId": 12, "teamId": 11, "remainingParticipantCount": 2, "agreementsReset": true }, "msg": "참여팀에서 제외했습니다." }
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 주최 팀 제외 시도 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 404 | `TEAM_NOT_FOUND` | 참여 기록이 없는 `teamId` |
| 409 | `PERFORMANCE_ALREADY_ON_SALE` | 상태가 `ON_SALE` 이후 |

---

### API-performance-10 검표 페이지 링크 조회
`GET /api/v1/performances/{performanceId}/entry-link` · 권한: PERFORMER(참여팀) · 우선: P0 · 연관 화면: `P-04 참여팀 관리`·`P-01 공연자 대시보드` · 연관 기능: `F-performance-10 검표 페이지 링크`

## 요구사항
- 검표 담당자를 회원으로 등록하지 않고, **공연별 서명 토큰이 박힌 검표 페이지 링크**를 공연 생성 시 자동 발급해 두고 이 API로 조회한다. 링크는 해당 공연에만 유효하며 다른 API 권한을 만들지 않는다(SEC-03).
- 조회 권한은 참여팀 소속이다. 토큰 유효기간은 **공연 종료 + 2시간** [권]이며, 생성자는 `rotate=true`로 재발급해 이전 링크를 즉시 무효화할 수 있다.
- 응답에 QR 스캔 화면 URL과 `X-Entry-Token` 헤더로 실을 원본 토큰을 함께 담는다(API-entry-01·02 인증 수단).
- **[v4]** 검표는 온체인·코인과 무관하다 — 이 링크로는 지갑·자금 관련 API에 접근할 수 없다.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |
| `rotate` | query | boolean | N | 기본 `false`. `true`면 재발급하고 이전 링크를 폐기. **공연 생성자만** |

### Body
없음.

### 시스템 처리
1. 공연 존재·참여팀 소속 확인 → `rotate=true`면 생성자 권한 추가 확인.
2. 상태 전이 없음(조회). `rotate=true`일 때만 토큰 버전을 올려 이전 토큰을 무효화한다.
3. 외부 호출 없음.
4. 토큰 발급·재발급 사실을 감사 로그에 남긴다(SEC-11).

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "performanceTitle": "합정 3밴드 합동공연",
    "entryUrl": "https://b204.ssafy.io/entry/12?token=eyJhbGciOi...",
    "entryToken": "eyJhbGciOi...",
    "expiresAt": "2026-09-20T00:00:00+09:00",
    "entryWindow": { "opensAt": "2026-09-19T18:00:00+09:00", "closesAt": "2026-09-19T22:00:00+09:00" },
    "issuedAt": "2026-09-02T15:40:00+09:00",
    "rotated": false
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 403 | `COMMON_FORBIDDEN` | 참여팀 소속이 아님 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자가 아닌 참여팀이 `rotate=true` 호출 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 409 | `PERFORMANCE_INVALID_STATUS` | 공연이 `CANCELLED` |

---

### API-performance-11 판매·선택 현황
`GET /api/v1/performances/{performanceId}/sales` · 권한: PERFORMER(참여팀) · 우선: P0 · 연관 화면: `P-07 판매·선택 현황` · 연관 기능: `F-performance-11 판매·관객 선택 현황 조회`

## 요구사항
- 매출·판매 수량·잔여와 **관람 목적 팀 선택 집계**를 준다. 서버 DB 집계와 **온체인 카운터**(`RevenueSplitter.choiceCountOf`)를 나란히 담아 화면에서 대조하게 한다(REL-06).
- **[v4]** 관객 선택은 별도 tx가 아니라 **`purchase` tx 안에서 기록**된다(결정 §2.4·미결 안건 12). 따라서 DB 집계와 온체인 카운터의 차이는 "receipt 미확정 결제" 또는 "환불 반영 지연"에서만 발생한다.
- **[v4]** 에스크로 잔액(`escrowOf(showId)`)을 함께 담는다 — 판매액 − 환불액 − release가 맞는지 공연자가 즉시 볼 수 있게 한다(결정 §3.8 불변식 2).
- 불일치가 있으면 `counterMatched: false`와 팀별 차이를 표시한다. 이 상태에서는 집계 확정(API-settlement-02)이 `SETTLEMENT_AGGREGATE_MISMATCH`로 막힌다.
- 참여팀 소속만 조회한다. 온체인 조회 결과는 **30초 캐시**한다 [권].

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
없음.

### 시스템 처리
1. 공연 존재·참여팀 소속 확인.
2. 상태 전이 없음(조회).
3. 외부 호출: `choiceCountOf`·`escrowOf` 조회(30초 캐시). 노드 오류 시 DB 집계만 주고 `onchainAvailable: false`.
4. `order_item`·`ticket`·`payment` 집계 + 온체인 값 비교 결과 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "status": "ON_SALE",
    "rate": { "currency": "USD", "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "grossRevenueAmount": 1600000,
    "refundedAmount": 75000,
    "escrowBalanceAmount": 1525000,
    "currency": "KRW",
    "paidTicketCount": 64,
    "cancelledTicketCount": 3,
    "ticketTypes": [
      { "ticketTypeId": 31, "name": "일반", "priceAmount": 25000, "soldQuantity": 52, "remainingQuantity": 28 },
      { "ticketTypeId": 32, "name": "응원", "priceAmount": 35000, "soldQuantity": 12, "remainingQuantity": 8 }
    ],
    "teamChoices": [
      { "teamId": 7, "teamName": "블루노트", "teamIndex": 0, "dbCount": 30, "onchainCount": 30, "matched": true },
      { "teamId": 9, "teamName": "새벽세시", "teamIndex": 1, "dbCount": 21, "onchainCount": 21, "matched": true },
      { "teamId": 11, "teamName": "노이즈캔슬", "teamIndex": 2, "dbCount": 13, "onchainCount": 13, "matched": true }
    ],
    "counterMatched": true,
    "escrowMatched": true,
    "onchainAvailable": true,
    "splitterAddress": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    "refreshedAt": "2026-09-18T11:00:00+09:00"
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 403 | `SETTLEMENT_NOT_PARTICIPANT` | 참여팀 소속이 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 409 | `PERFORMANCE_INVALID_STATUS` | 아직 `DRAFT`·`PENDING_AGREEMENT`라 판매 데이터가 없음 |

---

### API-performance-12 공연 취소(일괄 환불) **[v4 변경 — 코인 환불 + 보증금 반환]**
`POST /api/v1/performances/{performanceId}/cancel` · 권한: 생성자 · 우선: P0 · 연관 화면: `P-10 공연 취소` · 연관 기능: `F-performance-12 공연 취소·일괄 환불`

## 요구사항
- 판매 중 취소 시 **전 티켓을 수수료 없이 일괄 환불**하고 컨트랙트에 `halt(showId)`를 걸어 이후 `refund`만 허용한다 [권] P-12. 정산 잠금 이후에도 **release 전까지**는 가능하다.
- **[v4] 환불은 금융망 이체가 아니라 온체인이다.** 건별로 운영자가 `RevenueSplitter.refund(showId, orderRef, 관객 지갑, teamIndex, amount)`를 보내 **에스크로 → 관객 지갑 KRWS**로 되돌리고, 선택 카운터도 함께 −1 된다. 관객에게는 **잔액으로 남는다**(P-20 — 카드 취소는 P1).
- **[v4] 일괄 환불이 전부 끝나면 보증금을 반환한다** — 운영자가 `returnDeposit(showId)`를 보내 생성팀 리더 지갑으로 되돌리고 `deposit_status`를 `RETURNED`로 만든다(P-21). 몰수(`forfeitDeposit`)는 P1이다.
- 대량 작업이라 `202 Accepted` + `jobId`이며 건별 부분 성공을 허용한다. 실패 건은 재시도 대기로 남는다(REL-05). 진행률은 API-chain-01의 `results`로 본다.
- `Idempotency-Key`가 필수다. 같은 키 재호출은 최초 `jobId`를 그대로 돌려준다.
- release가 이미 실행된 공연은 온체인 회수가 불가하므로 취소할 수 없다(`SETTLEMENT_ALREADY_RELEASED`).

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Idempotency-Key: {UUIDv4}` **필수**

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
2. 상태 전이: `performance` → `CANCELLED`, `settlement` → `HALTED`, 대상 `ticket` → `CANCELLED`, `ticket_order` → `REFUNDED`, `refund` 레코드 생성(`PENDING`).
3. 외부 호출(202, 전부 OPERATOR 서명): ① `halt(showId)` ② 티켓·주문별 `refund(...)` 순차 전송(nonce 직렬 큐) → 확정마다 `refund` `PROCESSING` → `COMPLETED` ③ 전 건 완료 후 `returnDeposit(showId)`. **금융망 이체·burn은 이 흐름에 없다** — 환불은 코인 이동뿐이다.
4. `refund`·`chain_job` 저장, 재고 원복, 관객 알림 발송 [권], 감사 로그.

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
    "totalRefundAmount": 1600000,
    "currency": "KRW",
    "depositReturnPlanned": true,
    "depositAmount": 50000
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
| 409 | `PERFORMANCE_INVALID_STATUS` | `DRAFT`·`PENDING_AGREEMENT`(판매 전이라 수정·삭제로 처리) 또는 이미 `CANCELLED` |
| 409 | `SETTLEMENT_ALREADY_RELEASED` | release 완료 후 취소 시도 |
| 409 | `COIN_ESCROW_INSUFFICIENT` | **[v4]** 에스크로 잔액 < 환불 총액(대사 점검 대상) |
| 500 | `CHAIN_GAS_INSUFFICIENT` | 운영지갑 가스 부족 — 관리자 알림 대상 |

---

### API-performance-13 보증금 서명 파라미터 **[v4 신설]**
`POST /api/v1/performances/{performanceId}/deposit/prepare` · 권한: 생성자(팀 리더) · 우선: P0 · 연관 화면: `P-03 공연 생성·수정` · 연관 기능: `F-performance-10 보증금 서명 납부`

## 요구사항
- 생성팀 리더가 보증금 **50,000 KRWS**를 컨트랙트에 납부하기 위해 서명할 tx를 받는다(P-21). §0.4 prepare 규약을 따르며 `signRequests`는 최대 2건 — `APPROVE`(allowance 부족 시) + `DEPOSIT`이다.
- `DEPOSIT`의 대상은 `RevenueSplitter.deposit(showId)`이고 컨트랙트가 `token.transferFrom(msg.sender, this, depositAmount)`를 실행한다. **서명 주체는 리더 본인**이며 서버는 이 tx를 보낼 수 없다.
- **선행 조건**: ① 요청자가 생성팀 리더 ② `deposit_status = UNPAID` ③ 공연 상태 `DRAFT` ④ 리더 지갑 `LINKED` ⑤ 리더 지갑 KRWS 잔액 ≥ 50,000. ⑤가 부족하면 `PAYMENT_INSUFFICIENT_BALANCE`(409)로 막고 응답 `msg`로 충전(A-14)을 안내한다.
- **`createShow`가 선행되어야 한다.** `deposit(showId)`은 컨트랙트에 공연이 등록돼 있어야 동작하므로, 이 API는 `createShow`가 아직이면 **먼저 운영자 `createShow` job을 걸고** `prerequisiteJobId`를 함께 내려준다. 프론트는 그 job이 `CONFIRMED`가 된 뒤 서명한다.
- 가스 부족이면 `gasStatus.sufficient: false` + `fundingJobId`를 준다(§0.4).
- 이 API는 상태를 바꾸지 않는다(조회·발의). 실제 전이는 API-performance-14의 receipt 검증에서 일어난다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
없음(빈 객체 `{}` 허용).

### 시스템 처리
1. 생성팀 리더 확인 → `deposit_status=UNPAID`·상태 `DRAFT` 확인 → 리더 지갑 `LINKED` 확인 → `KRWS.balanceOf` 조회로 잔액 확인 → `KRWS.allowance(리더, Splitter)` 조회.
2. 상태 전이 없음. `createShow` 미완이면 `chain_job`(`tx_type=AGGREGATE` 아님 — 별도 `CREATE_SHOW` 처리는 판매 시작 흐름과 공유, `signer_type=OPERATOR`) 등록.
3. 외부 호출: 잔액·allowance·가스 조회(캐시 없음 — 서명 직전 값이어야 한다). 필요 시 KAIA 충전 job.
4. calldata 생성(`approve(splitter, 50000)`, `deposit(performanceId)`) + 감사 로그(발의 기록).

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "depositAmount": 50000,
    "currency": "KRW",
    "display": { "currency": "USD", "approx": 37.04, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "prerequisiteJobId": null,
    "signRequests": [
      {
        "kind": "APPROVE",
        "required": true,
        "to": "0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736",
        "data": "0x095ea7b3000000000000000000000000a1b2c3d4e5f60718293a4b5c6d7e8f9012345678000000000000000000000000000000000000000000000000000000000000c350",
        "value": "0x0",
        "chainId": "0x3e9",
        "gas": "0x11170",
        "summary": { "title": "Allow deposit of ₩50,000", "amount": 50000, "currency": "KRW", "spender": "RevenueSplitter", "spenderAddress": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678" }
      },
      {
        "kind": "DEPOSIT",
        "required": true,
        "to": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
        "data": "0xb6b55f25000000000000000000000000000000000000000000000000000000000000000c",
        "value": "0x0",
        "chainId": "0x3e9",
        "gas": "0x1d4c0",
        "summary": { "title": "Pay ₩50,000 show deposit", "amount": 50000, "currency": "KRW", "performanceId": 12 }
      }
    ],
    "gasStatus": { "sufficient": true, "fundingJobId": null },
    "expiresAt": "2026-09-02T16:35:00+09:00"
  },
  "msg": ""
}
```

### 4xx/5xx
```json
{ "code": "PAYMENT_INSUFFICIENT_BALANCE", "data": null, "msg": "잔액이 부족합니다. 충전 후 다시 시도해 주세요. (필요 ₩50,000 · 보유 ₩12,000)" }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 404 | `WALLET_NOT_FOUND` | 리더 지갑 미연결 |
| 409 | `COMMON_CONFLICT` | `deposit_status`가 이미 `PAID`·`RETURNED` (전용 코드 `PERFORMANCE_DEPOSIT_ALREADY_PAID`는 §18.1) |
| 409 | `PERFORMANCE_INVALID_STATUS` | 공연 상태가 `DRAFT`가 아님(`CANCELLED` 등) |
| 409 | `PAYMENT_INSUFFICIENT_BALANCE` | 리더 지갑 KRWS 잔액 < 보증금 |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | 잔액·allowance 조회 실패(서명 파라미터를 만들 수 없음) |

---

### API-performance-14 보증금 tx 해시 보고 **[v4 신설]**
`POST /api/v1/performances/{performanceId}/deposit/signed-tx` · 권한: 생성자(팀 리더) · 우선: P0 · 연관 화면: `P-03 공연 생성·수정` · 연관 기능: `F-performance-10 보증금 서명 납부` · `F-wallet-06 사용자 서명 tx 보고·검증`

## 요구사항
- 리더가 서명·전송한 tx의 해시를 보고한다. 서버는 `202 Accepted` + `jobId`(`signerType=USER`)를 주고 **receipt와 `DepositPaid` 이벤트를 검증**해 상태를 전이한다(§0.4 검증 5항목).
- `kind`가 `APPROVE`면 allowance 확인만 하고 `deposit_status`는 바꾸지 않는다. `kind=DEPOSIT`의 receipt가 확정될 때 `deposit_status` `UNPAID` → **`PAID`**가 되고 `nextAction`이 `SET_RULES`로 넘어간다.
- 검증 항목: receipt `status=1` · `to == splitterAddress` · `from == 리더 지갑 주소` · 로그에 `DepositPaid(showId, payer, amount)` 존재 · `showId == performanceId` **및 `amount == deposit_amount`**. 하나라도 어긋나면 전이 없이 `FAILED`이며 `PAYMENT_AMOUNT_MISMATCH`(409)로 응답한다(전용 코드 `PAYMENT_TX_MISMATCH`는 §18.1).
- 같은 `txHash` 재보고는 최초 `jobId`를 재생한다(§0.8 — `txHash`가 자연 멱등키).
- 서명 거부는 이 API를 호출하지 않는 것으로 표현된다. `deposit_status`는 `UNPAID`로 남고 사용자는 다시 시도할 수 있다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `kind` | string | Y | `APPROVE` / `DEPOSIT` | 어느 서명의 결과인지 |
| `txHash` | string | Y | `0x` + 64 hex(66자) | 지갑이 반환한 tx 해시 |

```json
{ "kind": "DEPOSIT", "txHash": "0x6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5" }
```

### 시스템 처리
1. 생성팀 리더 확인 → `txHash` 형식·중복 보고 확인 → 해당 공연의 `prepare` 발의 기록 존재 확인.
2. 상태 전이: `chain_job` 생성(`tx_type=APPROVE`|`DEPOSIT`, `signer_type=USER`, `issuer_type=MOCK`, `status=SUBMITTED`, `wallet_id`, `tx_hash`). receipt 확정 시 `CONFIRMED` + `performance.deposit_status=PAID`·`deposit_job_id`·`deposit_tx_hash` 기록.
3. 외부 호출(202): `eth_getTransactionReceipt` 폴링(최대 120초) → 로그 파싱·`DepositPaid` 검증. 실패·불일치는 `FAILED` 고정(재전송 없음, §0.3 USER job 규칙).
4. `chain_job`·`performance` 갱신 + 감사 로그(`action_type=OPERATOR_SIGN`이 아니라 사용자 서명 기록으로 남긴다).

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": {
    "jobId": "chain_01J9GA1B2C",
    "status": "SUBMITTED",
    "signerType": "USER",
    "pollAfterMs": 1500,
    "performanceId": 12,
    "kind": "DEPOSIT",
    "txHash": "0x6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5",
    "explorerUrl": "https://kairos.kaiascan.io/tx/0x6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5",
    "nextDepositStatus": "PAID"
  },
  "msg": "보증금 트랜잭션을 확인하고 있습니다."
}
```

### 4xx/5xx
```json
{ "code": "PAYMENT_AMOUNT_MISMATCH", "data": null, "msg": "트랜잭션 내용이 요청과 일치하지 않습니다. 처음부터 다시 시도해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `txHash` 형식 위반, 허용되지 않는 `kind` |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 404 | `COMMON_NOT_FOUND` | `prepare` 발의 기록이 없음(순서 위반) |
| 409 | `COMMON_CONFLICT` | 이미 `deposit_status=PAID`, 또는 같은 `txHash`가 다른 공연·다른 회원으로 보고됨 |
| 409 | `PAYMENT_AMOUNT_MISMATCH` | receipt·이벤트 검증 실패(`to`·`from`·`showId`·`amount`·이벤트 부재) (전용 코드 `PAYMENT_TX_MISMATCH`는 §18.1) |
| 504 | `CHAIN_TX_TIMEOUT` | 제출은 됐으나 확정이 120초를 넘김 — `jobId`로 계속 폴링 |

---

## 5. rule — 정산 규칙

정산 공식 [권] P-5: **2단계** — 1단계 `fixedRatioBp`(고정 전체) + `selectionRatioBp`(관객 선택) = **10000**, 2단계 `teamShares`로 고정 풀 내 팀별 비율(합 10000). dust는 **공연 생성 팀**에 귀속한다. 잠금 이후 setter는 컨트랙트에서 전부 revert된다.

**[v4] 동의가 사용자 서명으로 바뀌었다.** v3는 서버가 팀 키로 `agreeToRules`를 대신 서명했지만, v4에서는 서버가 사용자 키를 갖고 있지 않으므로 **참여팀 리더가 지갑으로 직접 서명**한다. §0.4 패턴에 따라 **API-rule-03(`…/agreements/prepare`)** 이 서명 파라미터를 주고 **API-rule-05(`…/agreements/signed-tx`)** 가 해시를 받아 receipt를 검증한다. `RuleAgreement` 상태도 `PENDING → SIGNING → AGREED` 3단계로 늘었다(결정 §7). 규칙 설정에는 **보증금 `PAID`가 선행 조건**이다(P-21).

### API-rule-01 정산 규칙 설정 **[v4 변경 — 보증금 선행]**
`PUT /api/v1/performances/{performanceId}/rules` · 권한: 생성자 · 우선: P0 · 연관 화면: `P-05 정산 규칙 설정` · 연관 기능: `F-rule-01 정산 규칙 설정`

## 요구사항
- **2단계 비율** 구조다. 어느 쪽이든 합이 10000이 아니면 `RULE_RATIO_SUM_INVALID`다 [권] P-5. 각 항목은 0도 허용한다. 삭제된 필드(`equalRatioBp`·`commonCost`·`plannerRatioBp`)가 오면 `COMMON_VALIDATION_FAILED`다.
- **[v4] `deposit_status = PAID`가 선행 조건**이다. `UNPAID`면 `PERFORMANCE_INVALID_STATUS`(409)로 막고 P-03 보증금 단계로 돌려보낸다(전용 코드 `PERFORMANCE_DEPOSIT_REQUIRED`는 §18.1).
- 저장할 때마다 **규칙 정규화 JSON의 keccak256 해시**(`rulesHash`)를 재산출하고 기존 동의를 전부 `PENDING`으로 초기화한다(진행 중 `SIGNING` job은 `FAILED`로 닫는다). 동의는 해시에 대한 서명이기 때문이다.
- 상태 전이: `DRAFT` → `PENDING_AGREEMENT`. 이미 `ON_SALE`이면 `RULE_ALREADY_LOCKED`다.
- 시뮬레이션(예상 분배액)은 응답의 `simulation`으로 함께 준다. **[v4]** 금액은 KRWS 정수 + `display` 축약형이다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `fixedRatioBp` | integer | Y | 0~10000 | 고정 분배 전체 비율(bp) |
| `selectionRatioBp` | integer | Y | 0~10000 | 관객 선택 분배 비율(bp). 위와 합 10000 |
| `teamShares` | array | Y | 참여팀 수와 일치 | `[{teamId, shareBp}]`, `shareBp` 합 = 10000 |
| `simulationRevenue` | integer | N | 0 이상, KRWS 정수 | 시뮬레이션 가정 매출. 미지정 시 현재 매출 |

```json
{
  "fixedRatioBp": 6000,
  "selectionRatioBp": 4000,
  "teamShares": [ { "teamId": 7, "shareBp": 5000 }, { "teamId": 9, "shareBp": 3000 }, { "teamId": 11, "shareBp": 2000 } ],
  "simulationRevenue": 1600000
}
```

### 시스템 처리
1. 생성자 권한·상태(`DRAFT`·`PENDING_AGREEMENT`) 확인 → **`deposit_status=PAID` 확인** → 1·2단계 비율 합 검증 → `teamShares`의 팀이 전부 현재 참여팀인지 확인.
2. 상태 전이: `settlement_rule` upsert, `performance_participant.team_share_bp` 갱신, 공연 `DRAFT` → `PENDING_AGREEMENT`, `rule_agreement` 전체 `PENDING` 초기화.
3. 외부 호출 없음 — 컨트랙트에는 판매 시작(API-rule-04)의 `createShow`+`startSale`에서 잠긴 규칙으로 기록된다.
4. `rulesHash` 재산출·저장 + 시뮬레이션 계산 결과 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "status": "PENDING_AGREEMENT",
    "depositStatus": "PAID",
    "fixedRatioBp": 6000,
    "selectionRatioBp": 4000,
    "teamShares": [ { "teamId": 7, "shareBp": 5000 }, { "teamId": 9, "shareBp": 3000 }, { "teamId": 11, "shareBp": 2000 } ],
    "rulesHash": "0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f",
    "agreementsReset": true,
    "rate": { "currency": "USD", "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "simulation": {
      "assumedRevenueAmount": 1600000,
      "distributableAmount": 1600000,
      "currency": "KRW",
      "dustTeamId": 7,
      "shares": [
        { "teamId": 7, "teamName": "블루노트", "amount": 641668 },
        { "teamId": 9, "teamName": "새벽세시", "amount": 529166 },
        { "teamId": 11, "teamName": "노이즈캔슬", "amount": 429166 }
      ]
    },
    "nextAction": "COLLECT_AGREEMENTS"
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
| 400 | `COMMON_VALIDATION_FAILED` | bp 범위 위반, 삭제된 필드 전달, `teamShares`의 팀이 참여팀이 아님 |
| 400 | `RULE_RATIO_SUM_INVALID` | 1단계 또는 2단계 합이 10000이 아님 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 409 | `PERFORMANCE_INVALID_STATUS` | **[v4]** `deposit_status`가 `PAID`가 아님 (전용 코드 `PERFORMANCE_DEPOSIT_REQUIRED`는 §18.1) |
| 409 | `RULE_ALREADY_LOCKED` | 판매 시작 이후 수정 시도 |

---

### API-rule-02 규칙·동의 현황 조회
`GET /api/v1/performances/{performanceId}/rules` · 권한: PERFORMER(참여팀) · 우선: P0 · 연관 화면: `P-05 정산 규칙 설정`·`P-06 규칙 동의·판매 시작` · 연관 기능: `F-rule-02 정산 규칙·동의 현황 조회`

## 요구사항
- 규칙 원문(두 비율 bp + `teamShares`)·`rulesHash`·잠금 여부와 **팀별 동의 상태**를 준다. P-06 화면이 이 응답 하나로 그려져야 한다.
- **[v4]** 동의 상태는 `PENDING` / `SIGNING`(tx 보고 후 receipt 대기) / `AGREED` 3단계이며, 각 팀의 **리더 지갑 주소**와 동의 `txHash`·`explorerUrl`을 함께 담는다. 내 팀의 다음 행동은 `myAgreement.nextAction`(`SIGN` / `WAIT` / `NONE`)이다.
- 판매 시작 가능 여부(`startSaleAvailable`)와 막힌 이유를 담아 버튼 활성 조건을 서버가 정한다 [권].
- 참여팀 소속만 조회한다.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
없음.

### 시스템 처리
1. 공연 존재·참여팀 소속 확인.
2. 상태 전이 없음(조회).
3. 외부 호출 없음(동의 tx는 인덱싱된 `chain_job` 기준). 필요 시 `agreedOf(showId, wallet)` view와 대조하는 것은 API-verify-01의 몫이다.
4. `settlement_rule` + `rule_agreement` + `performance_participant`(+`wallet`) 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "performanceStatus": "PENDING_AGREEMENT",
    "depositStatus": "PAID",
    "locked": false,
    "rulesHash": "0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f",
    "rule": { "fixedRatioBp": 6000, "selectionRatioBp": 4000, "teamShares": [ { "teamId": 7, "shareBp": 5000 }, { "teamId": 9, "shareBp": 3000 }, { "teamId": 11, "shareBp": 2000 } ] },
    "agreements": [
      { "teamId": 7, "teamName": "블루노트", "walletAddress": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b", "status": "AGREED", "txHash": "0x1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f901", "explorerUrl": "https://kairos.kaiascan.io/tx/0x1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f901", "agreedAt": "2026-09-03T10:02:00+09:00" },
      { "teamId": 9, "teamName": "새벽세시", "walletAddress": "0x3c8a1f2b4d6e8091a2b3c4d5e6f708192a3b4c5d", "status": "SIGNING", "txHash": "0x2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90112", "explorerUrl": "https://kairos.kaiascan.io/tx/0x2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90112", "agreedAt": null },
      { "teamId": 11, "teamName": "노이즈캔슬", "walletAddress": "0x9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6f7081920", "status": "PENDING", "txHash": null, "explorerUrl": null, "agreedAt": null }
    ],
    "myAgreement": { "teamId": 11, "status": "PENDING", "nextAction": "SIGN" },
    "startSaleAvailable": false,
    "startSaleBlockedReason": "RULE_NOT_AGREED_BY_ALL"
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 403 | `SETTLEMENT_NOT_PARTICIPANT` | 참여팀 소속이 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 404 | `COMMON_NOT_FOUND` | 규칙이 아직 설정되지 않음(`DRAFT`) |

---

### API-rule-03 규칙 동의 서명 파라미터 **[v4 변경 — 구 202 운영자 tx → prepare]**
`POST /api/v1/performances/{performanceId}/rules/agreements/prepare` · 권한: 참여팀 리더 · 우선: P0 · 연관 화면: `P-06 규칙 동의·판매 시작` · 연관 기능: `F-rule-03 정산 규칙 동의`

## 요구사항
- **v3에서 서버가 팀 키로 대신 서명하던 지점**이다. v4에서는 서버가 사용자 키를 보관하지 않으므로 **리더 지갑이 `RevenueSplitter.agreeToRules(showId, rulesHash)`에 직접 서명**한다. 이 API는 그 서명 파라미터를 만들어 준다(§0.4).
- 요청의 `rulesHash`가 서버 현재 해시와 다르면 `RULE_HASH_MISMATCH`(409)다 — 규칙이 중간에 바뀐 상황이라 화면에서 다시 확인시켜야 한다. `prepare` 응답에도 현재 해시를 담아 프론트가 대조할 수 있게 한다.
- **`createShow`가 선행되어야 한다**(`teamWallets`에 msg.sender가 있어야 컨트랙트가 통과시킨다). 미완이면 운영자 `createShow` job을 걸고 `prerequisiteJobId`를 내려준다. 프론트는 그 job 확정 후 서명한다.
- `signRequests`는 1건(`AGREE`)이며 `approve`가 필요 없다 — 자금 이동이 없는 동의 tx다. 요약(`summary`)에는 비율·팀별 몫·예상 분배액을 담아 리더가 **무엇에 동의하는지** 읽을 수 있게 한다(결정 §2.3).
- 선행 조건: 요청자가 참여팀 리더 · `participationStatus=ACCEPTED` · 공연 `PENDING_AGREEMENT` · 내 팀 동의가 `PENDING`(`SIGNING`·`AGREED`면 `COMMON_CONFLICT`) · 리더 지갑 `LINKED`. 가스 부족이면 `gasStatus`로 알린다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

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
1. 리더·참여팀 확인 → 공연 상태 `PENDING_AGREEMENT` 확인 → `rulesHash` 대조 → 내 팀 동의 상태 `PENDING` 확인 → 리더 지갑 `LINKED` 확인.
2. 상태 전이 없음(발의). `createShow` 미완이면 운영자 job 등록.
3. 외부 호출: 가스 잔액 조회, 필요 시 KAIA 충전 job. `agreedOf(showId, wallet)` view로 이미 온체인 동의가 있는지 확인(있으면 DB만 `AGREED`로 동기화하고 `signRequests: []` 반환).
4. calldata 생성(`agreeToRules(performanceId, rulesHash)`) + 발의 기록.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "teamId": 9,
    "rulesHash": "0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f",
    "prerequisiteJobId": null,
    "signRequests": [
      {
        "kind": "AGREE",
        "required": true,
        "to": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
        "data": "0x8f4ffcb14d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f000000000000000000000000000000000000000000000000000000000000000c",
        "value": "0x0",
        "chainId": "0x3e9",
        "gas": "0x186a0",
        "summary": {
          "title": "Agree to the settlement rules",
          "performanceId": 12,
          "teamName": "새벽세시",
          "fixedRatioBp": 6000,
          "selectionRatioBp": 4000,
          "myShareBp": 3000,
          "rulesHash": "0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f"
        }
      }
    ],
    "gasStatus": { "sufficient": true, "fundingJobId": null },
    "expiresAt": "2026-09-03T10:30:00+09:00"
  },
  "msg": ""
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
| 404 | `WALLET_NOT_FOUND` | 리더 지갑 미연결 |
| 409 | `RULE_HASH_MISMATCH` | 요청 해시 ≠ 서버 현재 해시 |
| 409 | `RULE_ALREADY_LOCKED` | 이미 `startSale` 완료 |
| 409 | `COMMON_CONFLICT` | 내 팀 동의가 이미 `SIGNING`·`AGREED` |
| 409 | `WALLET_GAS_INSUFFICIENT` | 가스 충전 job이 실패해 서명을 진행할 수 없음 |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | 체인 조회 실패로 서명 파라미터를 만들 수 없음 |

---

### API-rule-05 규칙 동의 tx 해시 보고 **[v4 신설]**
`POST /api/v1/performances/{performanceId}/rules/agreements/signed-tx` · 권한: 참여팀 리더 · 우선: P0 · 연관 화면: `P-06 규칙 동의·판매 시작` · 연관 기능: `F-rule-03 정산 규칙 동의` · `F-wallet-06 사용자 서명 tx 보고·검증`

## 요구사항
- 리더가 서명·전송한 `agreeToRules` tx 해시를 보고한다. 서버는 `202` + `jobId`(`signerType=USER`)를 주고 receipt와 동의 이벤트를 검증한다(§0.4).
- 보고 즉시 `rule_agreement` `PENDING` → **`SIGNING`**, receipt 확정 시 → **`AGREED`**(+ `agree_job_id`·`agreed_at` 기록)로 전이한다. 검증 실패는 `PENDING`으로 되돌리고 `chain_job`을 `FAILED`로 고정한다.
- 검증 항목: receipt `status=1` · `to == splitterAddress` · `from == 리더 지갑 주소` · 이벤트에 `showId == performanceId` · **`rulesHash`가 서버 현재 해시와 동일**. 마지막 항목이 어긋나면(그 사이 규칙이 바뀐 경우) `RULE_HASH_MISMATCH`(409)다.
- 전 참여팀이 `AGREED`가 되면 응답 `allAgreed: true`와 `startSaleAvailable: true`를 내려 생성자에게 판매 시작(API-rule-04) 버튼을 열어 준다.
- 같은 `txHash` 재보고는 최초 `jobId`를 재생한다. 서명 거부는 이 API를 호출하지 않는 것으로 표현되고 상태는 `PENDING`으로 남는다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `teamId` | integer | Y | 요청자가 리더인 참여팀 | 동의한 팀 |
| `txHash` | string | Y | `0x` + 64 hex(66자) | 지갑이 반환한 tx 해시 |

```json
{ "teamId": 9, "txHash": "0x2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90112" }
```

### 시스템 처리
1. 리더·참여팀 확인 → `txHash` 형식·중복 보고 확인 → `prepare` 발의 기록 존재 확인.
2. 상태 전이: `chain_job` 생성(`tx_type=AGREE`, `signer_type=USER`, `SUBMITTED`), `rule_agreement` → `SIGNING`. receipt 확정 시 `CONFIRMED` + `AGREED`.
3. 외부 호출(202): receipt 폴링(최대 120초) → 로그 파싱·이벤트 검증 → 전원 동의 여부 재계산.
4. `chain_job`·`rule_agreement` 갱신 + 생성자에게 "전원 동의 완료" 알림(전원 완료 시) [권].

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": {
    "jobId": "chain_01J9GB3C4D",
    "status": "SUBMITTED",
    "signerType": "USER",
    "pollAfterMs": 1500,
    "performanceId": 12,
    "teamId": 9,
    "agreementStatus": "SIGNING",
    "txHash": "0x2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90112",
    "explorerUrl": "https://kairos.kaiascan.io/tx/0x2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90112",
    "allAgreed": false,
    "pendingTeamIds": [11],
    "startSaleAvailable": false
  },
  "msg": "동의 트랜잭션을 확인하고 있습니다."
}
```

### 4xx/5xx
```json
{ "code": "PAYMENT_AMOUNT_MISMATCH", "data": null, "msg": "트랜잭션 내용이 요청과 일치하지 않습니다. 처음부터 다시 시도해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `txHash` 형식 위반, `teamId` 누락 |
| 403 | `COMMON_FORBIDDEN` | 해당 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 404 | `COMMON_NOT_FOUND` | `prepare` 발의 기록이 없음(순서 위반) |
| 409 | `RULE_HASH_MISMATCH` | tx의 `rulesHash` ≠ 서버 현재 해시 |
| 409 | `RULE_ALREADY_LOCKED` | 이미 `startSale` 완료 |
| 409 | `COMMON_CONFLICT` | 이미 `AGREED`, 또는 같은 `txHash`가 다른 팀으로 보고됨 |
| 409 | `PAYMENT_AMOUNT_MISMATCH` | receipt·이벤트 검증 실패(`to`·`from`·`showId`·이벤트 부재) (전용 코드 `PAYMENT_TX_MISMATCH`는 §18.1) |
| 504 | `CHAIN_TX_TIMEOUT` | 확정이 120초를 넘김 — `jobId`로 계속 폴링 |

---

### API-rule-04 판매 시작(startSale 잠금)
`POST /api/v1/performances/{performanceId}/sale/start` · 권한: 생성자 · 우선: P0 · 연관 화면: `P-06 규칙 동의·판매 시작` · 연관 기능: `F-rule-04 판매 시작·정산 규칙 잠금`

## 요구사항
- **전 참여팀이 `AGREED`**여야 실행된다. 하나라도 `PENDING`·`SIGNING`이면 `RULE_NOT_AGREED_BY_ALL`이다. 공동 공연인데 참여팀 2팀 미만이면 `TEAM_MIN_COUNT_NOT_MET`, 티켓 옵션이 없으면 시작할 수 없다 [권].
- **[v4]** 운영자가 `RevenueSplitter.startSale(showId)`로 **one-way `locked=true`**를 건다. `createShow`(참여팀 지갑 배열·비율·`rulesHash`·`depositAmount`)는 보증금·동의 단계에서 이미 실행돼 있으며, 이 API는 미완이면 `createShow`부터 순차 실행한다.
- **[v4]** `createShow` 시점의 각 팀 리더 지갑 주소가 `performance_participant.wallet_address`에 **스냅샷**으로 고정된다 — 이후 지갑 교체와 무관하게 정산 수령 주소가 정해진다(미결 안건 20).
- `202 Accepted` + `jobId`다. tx 확정 시 공연 `PENDING_AGREEMENT` → `ON_SALE`이 되고 예매를 받는다. 확정 전 예매 시도는 `TICKET_SALE_NOT_STARTED`다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}`

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
1. 생성자 권한 확인 → 상태 `PENDING_AGREEMENT`·`deposit_status=PAID` 확인 → 전원 `AGREED`·참여팀 수·티켓 옵션·`rulesHash` 대조.
2. 상태 전이: `chain_job` 생성(`tx_type=LOCK`, `signer_type=OPERATOR`). tx 확정 시 공연 → `ON_SALE`, `settlement` `NONE` 유지.
3. 외부 호출(202): 운영지갑이 (필요 시 `createShow` →) `startSale()` 전송(nonce 직렬 큐). 실패 3회 재시도 후 연장 재시도.
4. `chain_job`·`performance_participant.wallet_address` 저장, tx 확정 시 Redis 재고 오픈 + 공개 목록 노출 시작.

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": {
    "jobId": "chain_01J9B7D8E9",
    "status": "PENDING",
    "signerType": "OPERATOR",
    "pollAfterMs": 2000,
    "performanceId": 12,
    "nextStatus": "ON_SALE",
    "splitterAddress": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    "teamWallets": [
      { "teamId": 7, "teamIndex": 0, "walletAddress": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b" },
      { "teamId": 9, "teamIndex": 1, "walletAddress": "0x3c8a1f2b4d6e8091a2b3c4d5e6f708192a3b4c5d" },
      { "teamId": 11, "teamIndex": 2, "walletAddress": "0x9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6f7081920" }
    ]
  },
  "msg": "판매 시작 트랜잭션을 전송했습니다. 확정되면 예매가 열립니다."
}
```

`teamIndex`는 `purchase(showId, orderRef, teamIndex, amount)`의 인자이자 온체인 선택 카운터의 키다. 이후 바뀌지 않는다.

### 4xx/5xx
```json
{ "code": "RULE_NOT_AGREED_BY_ALL", "data": null, "msg": "모든 참여팀이 정산 규칙에 동의해야 판매를 시작할 수 있습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `rulesHash` 형식 위반, 티켓 옵션 없음 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 409 | `RULE_NOT_AGREED_BY_ALL` | `PENDING`·`SIGNING` 팀 존재 |
| 409 | `RULE_HASH_MISMATCH` | 요청 해시 ≠ 서버 현재 해시 |
| 409 | `RULE_ALREADY_LOCKED` | 이미 잠금 완료 |
| 409 | `TEAM_MIN_COUNT_NOT_MET` | 공동 공연인데 참여팀 2팀 미만 |
| 409 | `PERFORMANCE_INVALID_STATUS` | `DRAFT`·`CANCELLED`, 또는 **[v4]** `deposit_status`가 `PAID`가 아님 |
| 500 | `CHAIN_GAS_INSUFFICIENT` | 운영지갑 가스 부족(관리자 알림 대상) |
| 504 | `CHAIN_TX_TIMEOUT` | 제출은 됐으나 확정 지연 — `jobId`로 계속 폴링 |

---

## 6. ticket — 예매·티켓

주문 상태: `PENDING_PAYMENT` → `PAID` → `CANCELLED` / `REFUNDED`. 미결제 15분 경과 시 `CANCELLED`. 티켓 상태: `ISSUED` → `TRANSFER_PENDING` → `ISSUED`(새 소유자) / `USED` / `CANCELLED`. 관람 목적 팀은 **한 팀 필수 선택**이고 1인 1공연 최대 4매다 [권] P-4·P-6.

**[v4] 관객 선택은 별도 tx가 아니다.** v3의 `recordChoice`·`cancelChoice`는 삭제되고 **`purchase` tx가 결제와 선택을 함께 기록**한다(결정 §2.4·미결 안건 12). 주문 생성 시 서버가 **`orderRef = keccak256(orderId)`**(`ticket_order.order_ref`)와 **`teamIndex`**(`createShow` 시점 참여팀 순서)를 확정해 내려주고, 그 값이 그대로 온체인 인자가 된다. 주문 응답에는 **지갑 잔액과 부족분**이 함께 담겨 A-05가 "잔액으로 결제 / 카드로 결제"를 즉시 그릴 수 있다.

### API-ticket-01 주문 생성(옵션·수량·선택 팀) **[v4 변경 — orderRef·잔액·부족분]**
`POST /api/v1/orders` · 권한: AUDIENCE · 우선: P0 · 연관 화면: `A-03 예매 — 옵션·수량`·`A-04 예매 — 관람 목적 팀 선택` · 연관 기능: `F-ticket-01 티켓 주문 생성`

## 요구사항
- 티켓 타입·수량과 **관람 목적 팀 1개**를 받아 `PENDING_PAYMENT` 주문을 만들고 Redis 재고를 선점한다. 결제 전까지 **15분** 유효하며 경과 시 `CANCELLED`로 자동 전이하고 재고를 원복한다.
- **[v4]** 응답에 **`orderRef`**(온체인 `bytes32`), **`teamIndex`**, **`walletBalance`**, **`shortfall`**(부족분 = 결제액 − 잔액, 0 이상)을 담는다. `shortfall > 0`이면 A-05가 "원화로 결제"(자동 충전) 경로를 기본 선택한다(결정 §3.3).
- **[v4] 지갑 미연결 회원은 주문을 만들 수 없다** — `WALLET_NOT_FOUND`(404)로 막고 C-05로 보낸다. 서명할 지갑이 없으면 결제가 불가능하기 때문이다.
- 공동 공연에서 팀 미선택은 `TICKET_TEAM_CHOICE_REQUIRED`, 참여팀이 아닌 팀 선택은 `TICKET_TEAM_CHOICE_INVALID`다. 1인 1공연 누적 **4매** 초과는 `TICKET_PURCHASE_LIMIT_EXCEEDED`다(취소분 제외).
- 재고 차감은 원자적으로 처리해 **초과 판매 0**을 보장한다(REL-01·PERF-02). `Idempotency-Key`가 필수다.
- `totalAmount`는 **KRWS 정수**이며 서버 계산과 다르면 결제 단계에서 `PAYMENT_AMOUNT_MISMATCH`다. `display` 필드는 요청에서 무시된다(§0.5).

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language` · `Idempotency-Key: {UUIDv4}` **필수**

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
| `totalAmount` | integer | Y | KRWS 정수 | 클라이언트 계산 금액 |

```json
{ "performanceId": 12, "items": [ { "ticketTypeId": 31, "quantity": 2 } ], "chosenTeamId": 9, "totalAmount": 50000 }
```

### 시스템 처리
1. 멱등키 확인 → **요청자 `wallet` 존재·`LINKED` 확인** → 공연 상태(`ON_SALE`)·예매 마감 확인 → 티켓 타입 소속·수량·1인 4매 한도 확인 → `chosenTeamId` 참여팀 확인 → 금액 재계산.
2. 상태 전이: Redis 원자적 재고 차감(실패 시 전량 원복) → `ticket_order` 생성(`PENDING_PAYMENT`, `expiresAt = now + 15분`, **`order_ref = keccak256(orderId)`**).
3. 외부 호출: `KRWS.balanceOf(지갑)` 조회로 `walletBalance`·`shortfall` 산출(캐시 미사용 — 결제 화면 진입 값이다). 노드 실패 시 캐시값 + `balanceStale: true`.
4. `ticket_order`·`order_item` 저장, 15분 만료 스케줄 등록. **온체인 tx는 아직 없다** — 결제 서명이 다음 단계다.

## Response
### 201 Created
```json
{
  "code": "SUCCESS",
  "data": {
    "orderId": 5501,
    "orderRef": "0x9a8b7c6d5e4f30211f2e3d4c5b6a798807162534435261708f9e0d1c2b3a4958",
    "performanceId": 12,
    "performanceTitle": "합정 3밴드 합동공연",
    "status": "PENDING_PAYMENT",
    "items": [ { "ticketTypeId": 31, "name": "일반", "priceAmount": 25000, "quantity": 2, "amount": 50000 } ],
    "chosenTeamId": 9,
    "chosenTeamName": "새벽세시",
    "teamIndex": 1,
    "totalAmount": 50000,
    "currency": "KRW",
    "display": { "currency": "USD", "approx": 37.04, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "walletBalance": 35000,
    "shortfall": 15000,
    "balanceStale": false,
    "suggestedPaymentMode": "AUTO_CHARGE",
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
| 400 | `COMMON_VALIDATION_FAILED` | 수량 범위 위반, `Idempotency-Key` 없음, `totalAmount` 소수 |
| 400 | `TICKET_TEAM_CHOICE_REQUIRED` | 공동 공연인데 `chosenTeamId` 누락 |
| 400 | `TICKET_TEAM_CHOICE_INVALID` | 참여팀이 아닌 팀 선택 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 공연 |
| 404 | `TICKET_OPTION_NOT_FOUND` | 이 공연의 티켓 타입이 아님 |
| 404 | `WALLET_NOT_FOUND` | **[v4]** 지갑 미연결 회원 |
| 409 | `TICKET_SALE_NOT_STARTED` | 공연이 아직 `ON_SALE`이 아님 |
| 409 | `TICKET_SALE_CLOSED` | 예매 마감 또는 `SALE_CLOSED` 이후 |
| 409 | `TICKET_SOLD_OUT` | 재고 차감 실패(동시 예매 경합) |
| 409 | `TICKET_PURCHASE_LIMIT_EXCEEDED` | 1인 1공연 4매 초과 |
| 409 | `COMMON_CONFLICT` | 같은 멱등키에 다른 본문 |
| 429 | `COMMON_TOO_MANY_REQUESTS` | 매크로 차단 룰 |

---

### API-ticket-02 내 주문 목록
`GET /api/v1/orders/me` · 권한: AUDIENCE · 우선: P0 · 연관 화면: `A-12 주문 내역` · 연관 기능: `F-ticket-02 내 주문 목록 조회`

## 요구사항
- 로그인 관객의 주문을 최신순으로 준다. **[v4]** `paymentStatus`는 결정 §7 `Payment` 값(`REQUESTED`/`CHARGING`/`AWAITING_SIGNATURE`/`PAYING`/`PAID`/`FAILED`/`REFUNDED`)이며, `AWAITING_SIGNATURE`인 주문에는 "서명 대기" 배지를 띄우도록 `resumable: true`를 담는다.
- `PENDING_PAYMENT` 주문에는 남은 시간(`expiresAt`)을 담아 A-05로 되돌아갈 수 있게 한다. 만료분은 조회 시점에 `CANCELLED`로 정리해 노출한다.
- 금액은 §0.5 축약형이다.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `status` | query | string | N | `PENDING_PAYMENT`/`PAID`/`CANCELLED`/`REFUNDED` |
| `page`·`size`·`sort` | query | — | N | §0.2. `sort`는 `createdAt,desc`(기본)/`createdAt,asc` |

### Body
없음.

### 시스템 처리
1. 회원 식별 → 쿼리 검증.
2. 상태 전이: 만료된 `PENDING_PAYMENT`는 `CANCELLED`로 정리(재고 원복).
3. 외부 호출 없음.
4. `ticket_order` + `payment` + `coin_charge`(AUTO_CHARGE 연계) 조인 후 `items`/`pageInfo`.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "rate": { "currency": "USD", "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "items": [
      { "orderId": 5501, "performanceId": 12, "performanceTitle": "합정 3밴드 합동공연", "startAt": "2026-09-19T19:00:00+09:00", "status": "PAID", "paymentStatus": "PAID", "paymentMode": "AUTO_CHARGE", "totalAmount": 50000, "currency": "KRW", "ticketCount": 2, "resumable": false, "orderedAt": "2026-09-10T20:00:00+09:00", "expiresAt": null }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 6, "hasNext": false }
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `status`·`sort`, `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |

---

### API-ticket-03 주문 상세
`GET /api/v1/orders/{orderId}` · 권한: AUDIENCE(주문자) · 우선: P0 · 연관 화면: `A-06 예매 완료`·`A-12 주문 내역` · 연관 기능: `F-ticket-03 주문 상세 조회`

## 요구사항
- 주문 항목·금액·선택 팀·결제 정보와 **발급된 티켓 목록**을 준다. A-06 화면이 이 응답으로 그려진다. 본인 주문만 조회하고 타인 주문은 `COMMON_NOT_FOUND`로 존재를 숨긴다 [권].
- **[v4]** 결제 정보는 `paymentMode`(`BALANCE`/`AUTO_CHARGE`)·`paymentStatus`·`chargeId`(자동 충전 시)·`purchaseTxHash`를 담는다. **관객 화면에는 해시를 접어 두고** "결제 완료" 수준으로 표기한다(§0.6). 응답에는 담아 A-13 이력·문의 대응에 쓴다.
- v3의 `depositStatus`(발행 확정 여부) 필드는 없어졌다 — 결제 자체가 온체인이라 `paymentStatus`에 흡수됐다.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `orderId` | path | integer(BIGINT) | Y | 주문 PK |

### Body
없음.

### 시스템 처리
1. 주문 존재·소유자 확인.
2. 상태 전이: 만료된 `PENDING_PAYMENT`면 `CANCELLED`로 정리 후 반환.
3. 외부 호출 없음.
4. `ticket_order` + `order_item` + `ticket` + `payment` + `coin_charge` 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "orderId": 5501,
    "orderRef": "0x9a8b7c6d5e4f30211f2e3d4c5b6a798807162534435261708f9e0d1c2b3a4958",
    "status": "PAID",
    "performanceId": 12,
    "performanceTitle": "합정 3밴드 합동공연",
    "venueName": "합정 언플러그드",
    "startAt": "2026-09-19T19:00:00+09:00",
    "chosenTeamId": 9,
    "chosenTeamName": "새벽세시",
    "items": [ { "ticketTypeId": 31, "name": "일반", "priceAmount": 25000, "quantity": 2, "amount": 50000 } ],
    "totalAmount": 50000,
    "currency": "KRW",
    "display": { "currency": "USD", "approx": 37.04, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "payment": {
      "paymentId": 8801,
      "mode": "AUTO_CHARGE",
      "status": "PAID",
      "chargeId": 7701,
      "purchaseTxHash": "0x5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f607182934a",
      "paidAt": "2026-09-10T20:03:11+09:00"
    },
    "tickets": [
      { "ticketId": 90211, "ticketTypeName": "일반", "status": "ISSUED" },
      { "ticketId": 90212, "ticketTypeName": "일반", "status": "ISSUED" }
    ]
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 주문 또는 타인 주문 |

---

### API-ticket-04 내 티켓 목록
`GET /api/v1/tickets/me` · 권한: AUDIENCE · 우선: P0 · 연관 화면: `A-07 내 티켓 목록` · 연관 기능: `F-ticket-04 내 티켓 목록 조회`

## 요구사항
- 소유 중인 티켓을 상태별 필터로 준다. 양도중(`TRANSFER_PENDING`)은 상태 배지와 함께 노출하고 입장·취소 불가를 표시한다 [권] P-13. 양도로 받은 티켓도 현재 소유자 기준으로 나온다.
- **[v4]** `cancellable`이 `true`인 티켓에는 환불이 **지갑 잔액**으로 돌아간다는 안내(`refundTarget: "WALLET_BALANCE"`)를 담는다(P-20).

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `status` | query | string | N | `ISSUED`/`TRANSFER_PENDING`/`USED`/`CANCELLED`. 미지정 시 전체 |
| `page`·`size`·`sort` | query | — | N | §0.2. `sort`는 `startAt,asc`(기본)/`startAt,desc` |

### Body
없음.

### 시스템 처리
1. 회원 식별 → 쿼리 검증. 2. 상태 전이 없음(조회). 3. 외부 호출 없음. 4. `ticket` + `performance` 조인 후 `items`/`pageInfo`.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "items": [
      { "ticketId": 90211, "performanceId": 12, "performanceTitle": "합정 3밴드 합동공연", "venueName": "합정 언플러그드", "startAt": "2026-09-19T19:00:00+09:00", "ticketTypeName": "일반", "status": "ISSUED", "cancellable": true, "refundTarget": "WALLET_BALANCE", "transferable": true }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 2, "hasNext": false }
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `status`·`sort`, `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |

---

### API-ticket-05 티켓 상세
`GET /api/v1/tickets/{ticketId}` · 권한: AUDIENCE(소유자) · 우선: P0 · 연관 화면: `A-08 티켓 상세·QR` · 연관 기능: `F-ticket-05 티켓 상세 조회`

## 요구사항
- 티켓 정보·현재 상태·취소·양도 가능 여부(사유 포함)를 준다. **QR 토큰은 여기 담지 않는다** — 회전 토큰은 API-ticket-06이 발급한다(SEC-06).
- 취소 가능 여부에는 수수료 구간(D-7 전액 / D-3 전까지 50% / D-3 00:00 이후 불가) 판단 결과를 담는다 [권] P-8. 정확한 환불액은 API-refund-01이다.
- 소유자가 아니면 `TICKET_NOT_OWNED`다(소유권은 DB 기준).

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `ticketId` | path | integer(BIGINT) | Y | 티켓 PK |

### Body
없음.

### 시스템 처리
1. 티켓 존재·소유자 확인. 2. 상태 전이 없음(조회). 3. 외부 호출 없음. 4. `ticket` + `performance` + `ticket_type` + 취소·양도 판정 반환.

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
    "priceAmount": 25000,
    "currency": "KRW",
    "display": { "currency": "USD", "approx": 18.52, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "status": "ISSUED",
    "chosenTeamName": "새벽세시",
    "cancellable": true,
    "refundTarget": "WALLET_BALANCE",
    "cancelDeadlineAt": "2026-09-16T00:00:00+09:00",
    "transferable": true,
    "entryOpenAt": "2026-09-19T18:00:00+09:00",
    "usedAt": null
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `TICKET_NOT_OWNED` | 현재 소유자가 아님 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 `ticketId` |

---

### API-ticket-06 동적 QR 토큰 발급
`GET /api/v1/tickets/{ticketId}/qr` · 권한: 소유자 · 우선: P0 · 연관 화면: `A-08 티켓 상세·QR` · 연관 기능: `F-ticket-06 동적 QR 발급`

## 요구사항
- **TOTP 방식 동적 QR** — 서버가 `ticket.qr_secret`과 현재 30초 윈도우로 HMAC-SHA256을 계산해 반환한다. 클라이언트는 `rotateAfterMs`(30초) 주기로 재호출한다. 고정 티켓번호 QR은 만들지 않는다 [권] P-14 / SEC-06.
- `qr_secret`은 발급 시 생성되고 양도 수락 시 재생성되어 이전 소유자 QR을 즉시 무효화한다(SEC-07).
- `USED`·`CANCELLED`·`TRANSFER_PENDING`에는 발급하지 않는다. 입장 시간대 밖에서도 발급은 허용하되 검표에서 `ENTRY_NOT_IN_TIME_WINDOW`로 걸러진다 [권].
- **[v4]** QR·입장은 온체인과 무관하다. 티켓의 유효성은 DB 소유권과 서명 QR이 정한다(요구사항 §5 원칙 — 블록체인 성과가 아니다).

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `ticketId` | path | integer(BIGINT) | Y | 티켓 PK |

### Body
없음.

### 시스템 처리
1. 티켓 존재·소유자·상태(`ISSUED`) 확인. 2. 상태 전이 없음(토큰 발급). 3. 외부 호출 없음. 4. `HMAC(qr_secret, ticketId + floor(now/30))`으로 토큰 생성(유효 60초). DB 쓰기 없음.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": { "ticketId": 90211, "qrToken": "eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjkwMjExLCJleHAiOjE3ODk...", "issuedAt": "2026-09-19T18:30:00+09:00", "expiresAt": "2026-09-19T18:31:00+09:00", "rotateAfterMs": 30000 },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `TICKET_NOT_OWNED` | 현재 소유자가 아님 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 `ticketId` |
| 409 | `TICKET_ALREADY_USED` | 상태가 `USED` |
| 409 | `TICKET_CANCELED` | 상태가 `CANCELLED` |
| 409 | `TRANSFER_NOT_ALLOWED` | 상태가 `TRANSFER_PENDING` |
| 429 | `COMMON_TOO_MANY_REQUESTS` | 회전 주기보다 잦은 호출 |

---

## 7. payment — 코인 결제

**[v4] 결제 레일이 완전히 바뀌었다.** v3는 관객 계좌 → 플랫폼 에스크로 계좌 원화 이체였지만, v4의 결제는 **관객 지갑이 서명하는 `RevenueSplitter.purchase(showId, orderRef, teamIndex, amount)` tx** 하나다. 컨트랙트가 `token.transferFrom(관객, this, amount)`로 KRWS를 에스크로에 넣고 **선택 카운터를 함께 +1** 한다(결정 §2.4). 금융망 직접 결제는 없다(P-24 원장 단일화).

두 가지 모드가 있다(결정 §3.3).

| mode | 조건 | 흐름 |
|---|---|---|
| `BALANCE` | 지갑 잔액 ≥ 결제액 | prepare(`approve`?+`purchase`) → 서명 2회 → signed-tx → receipt 검증 → `PAID` |
| `AUTO_CHARGE` | 잔액 부족 ("원화로 결제" 원스텝) | 부족분 충전(`coin_charge`, `purpose=AUTO_PAYMENT`) → mint 확정 → 서명 파라미터 발급 → 서명 → signed-tx → `PAID` |

Payment 상태(결정 §7): `REQUESTED → CHARGING → AWAITING_SIGNATURE → PAYING → PAID` / `FAILED` / `REFUNDED`. **실패 보상 원칙** — 충전(mint) 성공 후 서명이 거부·실패하면 **코인은 지갑 잔액으로 남고** 주문만 만료된다. 돈이 사라지는 경로는 없다.

### API-payment-01 결제 시작 **[v4 변경 — 서명 파라미터·자동 충전]**
`POST /api/v1/orders/{orderId}/payment` · 권한: AUDIENCE(주문자) · 우선: P0 · 연관 화면: `A-05 결제` · 연관 기능: `F-payment-01 결제 시작(잔액)` · `F-payment-04 원화로 결제(자동 충전 연계)`

## 요구사항
- `PENDING_PAYMENT` 주문에 대해 결제를 시작한다. `mode=BALANCE`면 **즉시 서명 파라미터**(§0.4 `signRequests`)를 주고, `mode=AUTO_CHARGE`면 부족분 충전을 먼저 접수해 `chargeId`를 주고 서명 파라미터는 **충전 완료 후** API-payment-02 폴링에서 내려준다.
- `AUTO_CHARGE`의 부족분은 **서버가 계산**한다(`shortfall = totalAmount − balanceOf`). 클라이언트가 금액을 지정할 수 없다. 충전 수단(`chargeMethod`)은 `FOREIGN_CARD`(주) / `DOMESTIC_CARD` / `VIRTUAL_ACCOUNT`이며, 가상계좌는 입금까지 최대 30분이 걸려 주문 15분 만료와 충돌하므로 **`AUTO_CHARGE`에서는 카드만 허용**한다 [권] — 가상계좌는 A-14에서 미리 충전(API-charge-01)한 뒤 `BALANCE`로 결제한다.
- 클라이언트 금액과 서버 계산 금액이 다르면 `PAYMENT_AMOUNT_MISMATCH`로 막고 위조 시도로 로그를 남긴다.
- **[v4] 준비금 불일치 상태에서는 `AUTO_CHARGE`를 막는다**(mint 중단, P-11) — `COIN_RESERVE_MISMATCH`(409). `BALANCE` 결제는 mint가 없어 그대로 허용한다.
- `Idempotency-Key`가 필수다. 같은 키 재호출은 최초 응답(`paymentId`·`chargeId`)을 재생하고 카드 승인을 재실행하지 않는다.
- 관객 화면 문구는 "Pay with balance" / "Pay with card (KRW)"이고, 서명 팝업 직전 "Confirm ₩50,000 payment" 확인 화면을 띄운다. 블록체인 용어는 "Confirm in your wallet" 한 줄만 허용된다(§0.6).

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language` · `Idempotency-Key: {UUIDv4}` **필수**

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `orderId` | path | integer(BIGINT) | Y | 주문 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `mode` | string | Y | `BALANCE` / `AUTO_CHARGE` | 결제 방식 |
| `amount` | integer | Y | KRWS 정수, 주문 금액과 일치 | 결제 금액 확인용 |
| `chargeMethod` | string | 조건부 | `AUTO_CHARGE`일 때 필수, `FOREIGN_CARD`/`DOMESTIC_CARD` | 부족분 충전 수단 |
| `card` | object | 조건부 | 카드 충전일 때 필수 | `{ cardNo, expiry, cvc, holderName }` — 서버는 마스킹만 저장 |

```json
{
  "mode": "AUTO_CHARGE",
  "amount": 50000,
  "chargeMethod": "FOREIGN_CARD",
  "card": { "cardNo": "4242424242424242", "expiry": "12/29", "cvc": "123", "holderName": "ALEX KIM" }
}
```

### 시스템 처리
1. 멱등키 확인 → 주문 소유자·상태(`PENDING_PAYMENT`)·만료 확인 → 금액 대조 → 지갑 `LINKED` 확인 → `mode=AUTO_CHARGE`면 준비금 상태 확인 → `balanceOf` 조회로 부족분 산출.
2. 상태 전이: `payment` 생성(`mode`, `REQUESTED`). `BALANCE`면 곧바로 `AWAITING_SIGNATURE`. `AUTO_CHARGE`면 `CHARGING` + `coin_charge` 생성(`purpose=AUTO_PAYMENT`, `ticket_order_id`).
3. 외부 호출: `AUTO_CHARGE`일 때 ① 금융망 카드 승인(멱등키 전달) → `coin_charge.FIAT_CONFIRMED` ② `CoinIssuerPort.mint(지갑, 부족분, chargeRef)` `chain_job`(`MINT`, `OPERATOR`) → 확정 시 `coin_charge.COMPLETED` + `payment.AWAITING_SIGNATURE`. **`BALANCE`는 외부 호출 없이 즉시 서명 파라미터를 만든다.**
4. `payment`·`coin_charge`·`chain_job` 저장 + 결제 감사 로그(SEC-11).

## Response
### 200 OK — `mode=BALANCE` (서명 파라미터 즉시)
```json
{
  "code": "SUCCESS",
  "data": {
    "orderId": 5501,
    "paymentId": 8801,
    "mode": "BALANCE",
    "paymentStatus": "AWAITING_SIGNATURE",
    "amount": 50000,
    "currency": "KRW",
    "display": { "currency": "USD", "approx": 37.04, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "chargeId": null,
    "signRequests": [
      { "kind": "APPROVE", "required": false, "to": "0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736", "data": "0x095ea7b3...", "value": "0x0", "chainId": "0x3e9", "gas": "0x11170", "summary": { "title": "Allow ticket payment", "amount": 50000, "currency": "KRW", "spender": "RevenueSplitter", "spenderAddress": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678" } },
      { "kind": "PURCHASE", "required": true, "to": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678", "data": "0x3d7403a3...", "value": "0x0", "chainId": "0x3e9", "gas": "0x30d40", "summary": { "title": "Confirm ₩50,000 payment", "amount": 50000, "currency": "KRW", "performanceId": 12, "orderRef": "0x9a8b7c6d5e4f30211f2e3d4c5b6a798807162534435261708f9e0d1c2b3a4958", "teamIndex": 1, "teamName": "새벽세시" } }
    ],
    "gasStatus": { "sufficient": true, "fundingJobId": null },
    "expiresAt": "2026-09-10T20:15:00+09:00"
  },
  "msg": ""
}
```

`APPROVE.required: false`는 현재 allowance가 이미 충분하다는 뜻이며 프론트는 그 항목을 건너뛴다(결정 §2.5).

### 202 Accepted — `mode=AUTO_CHARGE` (충전 접수)
```json
{
  "code": "SUCCESS",
  "data": {
    "orderId": 5501,
    "paymentId": 8801,
    "mode": "AUTO_CHARGE",
    "paymentStatus": "CHARGING",
    "amount": 50000,
    "shortfall": 15000,
    "currency": "KRW",
    "display": { "currency": "USD", "approx": 11.11, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "chargeId": 7701,
    "chargeStatus": "REQUESTED",
    "chargeMethod": "FOREIGN_CARD",
    "cardRegion": "FOREIGN",
    "conversionNotice": "Your card issuer converts this amount to your currency.",
    "signRequests": null,
    "pollAfterMs": 1500,
    "expiresAt": "2026-09-10T20:15:00+09:00"
  },
  "msg": "결제를 준비하고 있습니다."
}
```

`signRequests`가 `null`인 동안 프론트는 API-payment-02를 폴링하고, `paymentStatus=AWAITING_SIGNATURE`가 되면 그 응답의 `signRequests`로 서명한다.

### 4xx/5xx
```json
{ "code": "PAYMENT_AMOUNT_MISMATCH", "data": null, "msg": "결제 금액이 일치하지 않습니다. 처음부터 다시 시도해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `mode`·`amount` 누락, `Idempotency-Key` 없음, `AUTO_CHARGE`에 `chargeMethod=VIRTUAL_ACCOUNT` 전달 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 주문 또는 타인 주문 |
| 404 | `WALLET_NOT_FOUND` | 지갑 미연결 회원 |
| 409 | `COMMON_CONFLICT` | 같은 멱등키에 다른 본문, 주문 만료, 이미 서명 대기 중인 결제 존재 |
| 409 | `PAYMENT_ALREADY_PAID` | 이미 결제 완료된 주문 |
| 409 | `PAYMENT_AMOUNT_MISMATCH` | 요청 금액 ≠ 서버 계산 금액 |
| 409 | `PAYMENT_INSUFFICIENT_BALANCE` | `mode=BALANCE`인데 지갑 잔액 < 결제액 (화면은 `AUTO_CHARGE`로 유도) |
| 409 | `TICKET_SALE_CLOSED` | 결제 시도 시점에 예매 마감 |
| 409 | `COIN_RESERVE_MISMATCH` | **[v4]** 준비금 1:1 불일치로 mint 중단 상태(`AUTO_CHARGE`만) |
| 409 | `WALLET_GAS_INSUFFICIENT` | 가스 충전 job이 실패해 서명을 진행할 수 없음 |
| 500 | `COIN_MINT_FAILED` | 카드 승인 성공 후 mint 최종 실패 — 카드 취소 보상 대상, 운영자 알림 |
| 502 | `PAYMENT_REQUEST_FAILED` | 금융망 카드 API 오류 — mint 미실행, 재고 유지(주문은 15분 만료로 정리) |
| 504 | `PAYMENT_TIMEOUT` | 카드 승인 응답 지연 — 결과 재조회 예약, 주문 내역에서 확인 안내 |

---

### API-payment-02 결제 상태 조회 **[v4 변경 — 서명 파라미터 포함]**
`GET /api/v1/orders/{orderId}/payment` · 권한: AUDIENCE(주문자) · 우선: P0 · 연관 화면: `A-05 결제` · 연관 기능: `F-payment-02 결제 상태 조회`

## 요구사항
- A-05의 처리 중 상태(폴링)에서 쓰는 조회다. **[v4]** 충전 단계(`chargeStatus`)와 결제 단계(`paymentStatus`)를 분리해 보여주고, `paymentStatus=AWAITING_SIGNATURE`이면 **응답에 `signRequests`를 함께 담는다** — 프론트가 별도 prepare 호출 없이 곧바로 서명을 요청할 수 있게 하기 위해서다(A-05 원스텝 UX).
- 결제가 확정되면 발급된 `ticketIds`를 함께 주어 A-06으로 바로 넘어갈 수 있게 한다.
- 관객 화면에는 코인·체인 용어를 노출하지 않는다 — `chargeStatus`·`paymentStatus`는 "결제 준비 중 / 지갑에서 확인 / 확인 중 / 완료"로 매핑해 표기한다(§0.6).
- `signRequests`는 매 호출마다 **현재 allowance·잔액·가스를 다시 반영해** 만들어 준다. 잔액이 그 사이 줄었으면 `PAYMENT_INSUFFICIENT_BALANCE`를 `blockedReason`으로 담고 `signRequests`를 `null`로 준다.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `orderId` | path | integer(BIGINT) | Y | 주문 PK |

### Body
없음.

### 시스템 처리
1. 주문 소유자 확인.
2. 상태 전이 없음(조회). 단, `coin_charge`가 `COMPLETED`인데 `payment`가 `CHARGING`이면 `AWAITING_SIGNATURE`로 **동기화**한다.
3. 외부 호출: `AWAITING_SIGNATURE`일 때만 `balanceOf`·`allowance`·가스 조회(서명 파라미터 재생성). 그 외 단계는 `payment`·`coin_charge`·`chain_job` 레코드로 판단한다.
4. 충전·결제·티켓 발급 상태를 합쳐 반환.

## Response
### 200 OK (서명 대기)
```json
{
  "code": "SUCCESS",
  "data": {
    "orderId": 5501,
    "paymentId": 8801,
    "mode": "AUTO_CHARGE",
    "paymentStatus": "AWAITING_SIGNATURE",
    "orderStatus": "PENDING_PAYMENT",
    "amount": 50000,
    "currency": "KRW",
    "display": { "currency": "USD", "approx": 37.04, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "charge": { "chargeId": 7701, "status": "COMPLETED", "method": "FOREIGN_CARD", "amount": 15000, "mintTxHash": "0x4a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293" },
    "walletBalance": 50000,
    "signRequests": [
      { "kind": "APPROVE", "required": true, "to": "0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736", "data": "0x095ea7b3...", "value": "0x0", "chainId": "0x3e9", "gas": "0x11170", "summary": { "title": "Allow ticket payment", "amount": 50000, "currency": "KRW", "spender": "RevenueSplitter", "spenderAddress": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678" } },
      { "kind": "PURCHASE", "required": true, "to": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678", "data": "0x3d7403a3...", "value": "0x0", "chainId": "0x3e9", "gas": "0x30d40", "summary": { "title": "Confirm ₩50,000 payment", "amount": 50000, "currency": "KRW", "performanceId": 12, "orderRef": "0x9a8b7c6d5e4f30211f2e3d4c5b6a798807162534435261708f9e0d1c2b3a4958", "teamIndex": 1, "teamName": "새벽세시" } }
    ],
    "gasStatus": { "sufficient": true, "fundingJobId": null },
    "blockedReason": null,
    "approveJobId": null,
    "purchaseJobId": null,
    "ticketIds": [],
    "pollAfterMs": null,
    "expiresAt": "2026-09-10T20:15:00+09:00"
  },
  "msg": ""
}
```

### 200 OK (결제 완료)
```json
{
  "code": "SUCCESS",
  "data": {
    "orderId": 5501,
    "paymentId": 8801,
    "mode": "AUTO_CHARGE",
    "paymentStatus": "PAID",
    "orderStatus": "PAID",
    "amount": 50000,
    "currency": "KRW",
    "charge": { "chargeId": 7701, "status": "COMPLETED", "method": "FOREIGN_CARD", "amount": 15000 },
    "signRequests": null,
    "approveJobId": "chain_01J9GC5D6E",
    "purchaseJobId": "chain_01J9GC5D6F",
    "purchaseTxHash": "0x5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f607182934a",
    "ticketIds": [90211, 90212],
    "paidAt": "2026-09-10T20:03:11+09:00",
    "pollAfterMs": null
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 주문, 타인 주문, 결제 시작 이력 없음 |

---

### API-payment-03 결제 tx 해시 보고 **[v4 신설]**
`POST /api/v1/orders/{orderId}/payment/signed-tx` · 권한: AUDIENCE(주문자) · 우선: P0 · 연관 화면: `A-05 결제` · 연관 기능: `F-payment-05 결제 서명 tx 보고` · `F-wallet-06 사용자 서명 tx 보고·검증`

## 요구사항
- 관객이 서명·전송한 tx 해시를 보고한다. `kind=APPROVE`면 allowance 확인만 하고, `kind=PURCHASE`의 receipt가 확정될 때 **결제가 성립**한다. `202` + `jobId`(`signerType=USER`)를 준다.
- 상태 전이: `PURCHASE` 보고 즉시 `payment` `AWAITING_SIGNATURE` → **`PAYING`**. receipt 확정 시 → **`PAID`** + 주문 `PENDING_PAYMENT` → `PAID` + **티켓 `ISSUED` 발급**(`qr_secret` 생성) + `ticket.choice_tx_hash`에 purchase 해시 기록.
- 검증 항목(§0.4): receipt `status=1` · `to == splitterAddress` · `from == 관객 지갑` · 로그에 **`Purchased(showId, orderRef, buyer, teamIndex, amount)`** 존재 · `showId == performanceId` · **`orderRef == ticket_order.order_ref`** · `teamIndex == 저장된 값` · `amount == totalAmount`. 하나라도 어긋나면 티켓을 발급하지 않고 `PAYMENT_AMOUNT_MISMATCH`(409)로 응답한다(전용 코드 `PAYMENT_TX_MISMATCH`는 §18.1).
- **tx가 revert된 경우**(receipt `status=0`)는 재고 소진·판매 잠금·allowance 부족이 원인이다. `payment`를 `FAILED`로 두되 **주문은 `PENDING_PAYMENT`로 남겨** 사용자가 재시도할 수 있게 한다(15분 만료까지). 코인은 이동하지 않았으므로 잔액 그대로다.
- **서명 거부**는 이 API를 호출하지 않는 것으로 표현된다. `payment`는 `AWAITING_SIGNATURE`로 남고 주문 만료 시 `FAILED`, 주문은 `CANCELLED`가 되며 **충전된 코인은 잔액으로 남는다**(결정 §3.3 실패 보상). 명시적으로 알리려면 아래 `abandoned` 플래그를 보낸다 [권].
- 같은 `txHash` 재보고는 최초 `jobId`를 재생한다. 티켓 발급은 receipt 확정 직후이며 Kairos 블록 1초라 "Confirming…" 표시는 수 초다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `orderId` | path | integer(BIGINT) | Y | 주문 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `kind` | string | Y | `APPROVE` / `PURCHASE` | 어느 서명의 결과인지 |
| `txHash` | string | 조건부 | `0x` + 64 hex(66자). `abandoned`가 아니면 필수 | 지갑이 반환한 tx 해시 |
| `abandoned` | boolean | N | 기본 `false` | `true`면 사용자가 서명을 취소했음을 알린다. `payment`는 `AWAITING_SIGNATURE` 유지, 주문은 만료 스케줄대로 처리 |

```json
{ "kind": "PURCHASE", "txHash": "0x5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f607182934a" }
```

### 시스템 처리
1. 주문 소유자·`payment` 상태(`AWAITING_SIGNATURE`·`PAYING`) 확인 → `txHash` 형식·중복 보고 확인 → 주문 만료 여부 확인.
2. 상태 전이: `chain_job` 생성(`tx_type=APPROVE`|`PURCHASE`, `signer_type=USER`, `SUBMITTED`) → `PURCHASE`면 `payment` → `PAYING`. receipt 확정 시 `payment` → `PAID`, 주문 → `PAID`, `ticket` 발급, `payment.purchase_tx_hash`·`purchase_job_id` 기록.
3. 외부 호출(202): receipt 폴링(최대 120초) → `Purchased` 이벤트 파싱·8개 항목 검증. 서버는 tx를 재전송하지 않는다(§0.3 USER job).
4. `chain_job`·`payment`·`ticket_order`·`ticket` 저장 + 결제 감사 로그. 확정 시 관객 알림(예매 완료).

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": {
    "jobId": "chain_01J9GC5D6F",
    "status": "SUBMITTED",
    "signerType": "USER",
    "pollAfterMs": 1200,
    "orderId": 5501,
    "paymentId": 8801,
    "kind": "PURCHASE",
    "paymentStatus": "PAYING",
    "txHash": "0x5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f607182934a",
    "explorerUrl": "https://kairos.kaiascan.io/tx/0x5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f607182934a",
    "expectedEvent": "Purchased"
  },
  "msg": "결제를 확인하고 있습니다."
}
```

### 200 OK (`abandoned: true`)
```json
{ "code": "SUCCESS", "data": { "orderId": 5501, "paymentId": 8801, "paymentStatus": "AWAITING_SIGNATURE", "orderStatus": "PENDING_PAYMENT", "balanceKept": true, "expiresAt": "2026-09-10T20:15:00+09:00" }, "msg": "결제가 완료되지 않았습니다. 충전한 금액은 잔액에 남아 있습니다." }
```

### 4xx/5xx
```json
{ "code": "PAYMENT_AMOUNT_MISMATCH", "data": null, "msg": "트랜잭션 내용이 주문과 일치하지 않습니다. 처음부터 다시 시도해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `txHash` 형식 위반, 허용되지 않는 `kind`, `abandoned=false`인데 `txHash` 누락 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 주문, 타인 주문, 결제 시작 이력 없음(순서 위반) |
| 409 | `PAYMENT_ALREADY_PAID` | 이미 `PAID`인 주문 |
| 409 | `COMMON_CONFLICT` | 주문 만료(15분 경과), 같은 `txHash`가 다른 주문으로 보고됨 (서명 거부 전용 코드 `PAYMENT_SIGNATURE_REJECTED`는 §18.1) |
| 409 | `PAYMENT_AMOUNT_MISMATCH` | receipt·`Purchased` 이벤트 검증 실패(8개 항목 중 하나) (전용 코드 `PAYMENT_TX_MISMATCH`는 §18.1) |
| 409 | `TICKET_SOLD_OUT` | tx가 재고 부족으로 revert됨(컨트랙트·재고 대사 결과) |
| 409 | `TICKET_SALE_CLOSED` | tx가 판매 잠금(`ON_SALE` 아님)으로 revert됨 |
| 504 | `CHAIN_TX_TIMEOUT` | 확정이 120초를 넘김 — `jobId`로 계속 폴링 |

---

## 8. charge — 충전 (on-ramp) **[v4 신설 도메인]**

**금융망은 이제 결제 수단이 아니라 충전 창구다.** 외국인 관객이 자국 카드로 원화 금액을 결제하면(카드사가 환전) 서버가 금융망 승인을 확인하고 **`CoinIssuerPort.mint(회원 지갑, amount, chargeRef)`** 로 같은 금액의 KRWS를 발행한다. **원화 입금 확인 없이는 어떤 경로로도 mint하지 않는다**(결정 §2.2). 준비금 공시(API-verify-02)가 `금융망 원화 예치 잔액 ≥ KRWS 총 유통량`을 대사하며, 불일치 시 mint가 중단된다(P-11).

| method | 대상 | 흐름 |
|---|---|---|
| `FOREIGN_CARD` | **외국인 관객(주 경로)** | 카드 승인(원화 금액, 카드사 환전) → `FIAT_CONFIRMED` → mint → `COMPLETED` |
| `DOMESTIC_CARD` | 내국인 관객 | 같은 API·같은 흐름. `cardRegion` 표시와 환전 고지 유무만 다르다 |
| `VIRTUAL_ACCOUNT` | 내국인 관객 부가 | 가상계좌 발급(기한 30분) → 입금 → 확인 폴링 → `FIAT_CONFIRMED` → mint → `COMPLETED`. 미입금 시 `EXPIRED` |

CoinCharge 상태(결정 §7): `REQUESTED → FIAT_CONFIRMED → MINTING → COMPLETED` / `FAILED` / `EXPIRED`. 한도는 **1회 최소 1,000 / 최대 1,000,000 KRWS**, 가상계좌 입금 기한 **30분**이다(P-19). `purpose`는 `MANUAL`(A-14에서 직접 충전) 또는 `AUTO_PAYMENT`(API-payment-01이 만든 부족분 충전)다. **관객 잔액은 유지되며 출금 화면이 없다**(P-20) — 카드 취소(모의)·원화 출금은 P1, 온체인 출금은 P2다.

### API-charge-01 충전 요청 **[v4 신설]**
`POST /api/v1/charges` · 권한: 회원 · 우선: P0 · 연관 화면: `A-14 충전` · 연관 기능: `F-charge-01 카드 충전(해외·국내)` · `F-charge-02 가상계좌 충전`

## 요구사항
- 회원이 원화 금액을 정해 KRWS를 충전한다. `202 Accepted` + `chargeId`이며 상태는 API-charge-02로 폴링한다.
- **한도**: 1회 **1,000 ~ 1,000,000 KRWS** 정수(P-19). 소수·범위 위반은 `COMMON_VALIDATION_FAILED`다(전용 코드 `CHARGE_LIMIT_EXCEEDED`는 §18.1). 금액은 **원화로만** 입력받는다 — 표시 통화 금액을 그대로 받지 않는다(P-17).
- **카드**(`FOREIGN_CARD`·`DOMESTIC_CARD`): 금융망 카드 API로 원화 금액을 승인한다. 화면은 "₩30,000 (≈ $22.22) · Your card issuer converts to your currency"로 표시하고, `conversionNotice`를 응답에 담아 문구를 서버가 정한다(§0.6).
- **가상계좌**(`VIRTUAL_ACCOUNT`): 계좌번호·기한(30분)을 응답에 담는다. 시연에서는 API-charge-04로 입금을 시뮬레이션한다.
- **[v4] 지갑 연결이 선행 조건**이다 — mint 대상 주소가 필요하다. 미연결은 `WALLET_NOT_FOUND`(404)다.
- **준비금 불일치 시 충전을 접수하지 않는다** — `COIN_RESERVE_MISMATCH`(409). 예치 없는 발행이 금지되는 것과 대칭으로, 대사가 깨진 상태에서 유통량을 늘리지 않는다(P-11).
- `Idempotency-Key`가 필수다. 이 키의 해시가 온체인 `mint(..., bytes32 chargeRef)`의 `chargeRef`가 되므로 재시도해도 온체인 참조가 바뀌지 않는다(§0.8).
- 카드 정보는 **마스킹만 저장**한다(`card_no_masked`). 원문·CVC는 어떤 컬럼·로그에도 남기지 않는다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language` · `Idempotency-Key: {UUIDv4}` **필수**

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `method` | string | Y | `FOREIGN_CARD` / `DOMESTIC_CARD` / `VIRTUAL_ACCOUNT` | 충전 수단. P2 예약값 `USDC_SWAP`은 거부 |
| `amount` | integer | Y | 1,000 ~ 1,000,000, KRWS 정수 | 충전할 원화 금액 = 발행 KRWS |
| `card` | object | 조건부 | 카드 수단일 때 필수 | `{ cardNo, expiry, cvc, holderName }` |
| `displayRateId` | integer | N | `exchange_rate.rate_id` | 화면에 보여준 환율 스냅샷(영수증용, 선택) |

```json
{ "method": "FOREIGN_CARD", "amount": 30000, "card": { "cardNo": "4242424242424242", "expiry": "12/29", "cvc": "123", "holderName": "ALEX KIM" }, "displayRateId": 55 }
```

### 시스템 처리
1. 멱등키 확인 → 지갑 `LINKED` 확인 → `method`·`amount` 한도 검증 → 준비금 상태 확인 → 카드 수단이면 카드 형식(Luhn) 검증.
2. 상태 전이: `coin_charge` 생성(`purpose=MANUAL`, `status=REQUESTED`, `idempotency_key`, `card_no_masked`).
3. 외부 호출: **카드** — 금융망 카드 승인(멱등키 전달, 타임아웃 10초) → 성공 시 `FIAT_CONFIRMED`·`card_transaction_no`·`bank_tx_id` 기록 → `CoinIssuerPort.mint` `chain_job`(`MINT`, `OPERATOR`, `issuer_type=MOCK`) 등록 → `MINTING`. **가상계좌** — 금융망 가상계좌 발급 → 계좌번호·`virtual_account_expires_at`(30분) 기록, 상태는 `REQUESTED` 유지.
4. `coin_charge`·`chain_job` 저장 + 준비금 스냅샷 갱신 + 감사 로그(`action_type=CHARGE`).

## Response
### 202 Accepted — 카드
```json
{
  "code": "SUCCESS",
  "data": {
    "chargeId": 7702,
    "method": "FOREIGN_CARD",
    "cardRegion": "FOREIGN",
    "cardNoMasked": "****4242",
    "status": "MINTING",
    "amount": 30000,
    "currency": "KRW",
    "display": { "currency": "USD", "approx": 22.22, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "conversionNotice": "Your card issuer converts this amount to your currency.",
    "walletAddress": "0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a",
    "mintJobId": "chain_01J9GD7E8F",
    "pollAfterMs": 1200,
    "requestedAt": "2026-09-10T19:57:40+09:00"
  },
  "msg": "충전을 처리하고 있습니다."
}
```

### 202 Accepted — 가상계좌
```json
{
  "code": "SUCCESS",
  "data": {
    "chargeId": 7703,
    "method": "VIRTUAL_ACCOUNT",
    "status": "REQUESTED",
    "amount": 30000,
    "currency": "KRW",
    "virtualAccount": { "bankName": "국민", "accountNo": "79912345678901", "holderName": "B204 스테이지", "expiresAt": "2026-09-10T20:27:40+09:00" },
    "simulateDepositAvailable": true,
    "pollAfterMs": 3000,
    "requestedAt": "2026-09-10T19:57:40+09:00"
  },
  "msg": "30분 안에 입금해 주세요."
}
```

`simulateDepositAvailable`은 시연 프로필에서만 `true`다(API-charge-04 노출 여부).

### 4xx/5xx
```json
{ "code": "COMMON_VALIDATION_FAILED", "data": null, "msg": "충전 금액은 1,000원 이상 1,000,000원 이하로 입력해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `amount` 한도·소수 위반, 허용되지 않는 `method`(`USDC_SWAP` 포함), 카드 형식 위반, `Idempotency-Key` 없음 (전용 코드 `CHARGE_LIMIT_EXCEEDED`·`CHARGE_METHOD_UNSUPPORTED`는 §18.1) |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `COMMON_FORBIDDEN` | 지갑 상태가 `SUSPENDED` |
| 404 | `WALLET_NOT_FOUND` | 지갑 미연결 회원 |
| 409 | `COMMON_CONFLICT` | 같은 멱등키에 다른 본문, 동일 회원의 미완료 가상계좌 충전이 이미 존재 |
| 409 | `COIN_RESERVE_MISMATCH` | 준비금 1:1 불일치로 발행 중단 상태 |
| 500 | `COIN_MINT_FAILED` | 카드 승인 후 mint 최종 실패 — 카드 취소 보상 대상, 운영자 알림 |
| 502 | `PAYMENT_REQUEST_FAILED` | 금융망 카드·가상계좌 API 오류 — mint 미실행 (전용 코드 `CHARGE_CARD_DECLINED`는 §18.1) |
| 504 | `PAYMENT_TIMEOUT` | 카드 승인 응답 지연 — 결과 재조회 예약, A-14에서 상태 확인 안내 |

---

### API-charge-02 충전 상태 조회 **[v4 신설]**
`GET /api/v1/charges/{chargeId}` · 권한: 요청자 · 우선: P0 · 연관 화면: `A-14 충전` · 연관 기능: `F-charge-03 충전 상태 조회`

## 요구사항
- 충전 단계(`REQUESTED` → `FIAT_CONFIRMED` → `MINTING` → `COMPLETED`)와 실패·만료를 준다. A-14의 진행 표시와 API-payment-01(`AUTO_CHARGE`) 폴링이 함께 쓴다.
- `COMPLETED`면 `mintTxHash`·`explorerUrl`과 **갱신된 지갑 잔액**을 담아 화면이 곧바로 잔액을 갱신하게 한다.
- 가상계좌는 남은 시간(`virtualAccount.expiresAt`)과 입금 대기 상태를 준다. 30분 경과 시 조회 시점에 `EXPIRED`로 정리한다.
- 본인 충전만 조회한다. 타인 건은 `COMMON_NOT_FOUND`로 존재를 숨긴다 [권].
- 관객 화면 표기는 "Processing → Adding to your balance → Done"이다(§0.6 — mint·발행 용어 비노출).

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `chargeId` | path | integer(BIGINT) | Y | 충전 PK |

### Body
없음.

### 시스템 처리
1. 충전 존재·요청자 확인.
2. 상태 전이: 가상계좌 기한 경과 시 `REQUESTED` → `EXPIRED` 정리.
3. 외부 호출: 가상계좌가 `REQUESTED`면 금융망 입금 확인 조회(폴링, 5초 캐시). 확인되면 `FIAT_CONFIRMED` → mint job 등록.
4. `coin_charge` + `chain_job` + `wallet` 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "chargeId": 7702,
    "purpose": "MANUAL",
    "method": "FOREIGN_CARD",
    "cardRegion": "FOREIGN",
    "cardNoMasked": "****4242",
    "status": "COMPLETED",
    "amount": 30000,
    "currency": "KRW",
    "display": { "currency": "USD", "approx": 22.22, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "ticketOrderId": null,
    "mintJobId": "chain_01J9GD7E8F",
    "mintTxHash": "0x7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6",
    "explorerUrl": "https://kairos.kaiascan.io/tx/0x7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6",
    "walletBalanceAfter": 65000,
    "failureCode": null,
    "requestedAt": "2026-09-10T19:57:40+09:00",
    "fiatConfirmedAt": "2026-09-10T19:57:52+09:00",
    "completedAt": "2026-09-10T19:58:12+09:00",
    "pollAfterMs": null
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 `chargeId` 또는 타인 충전 (전용 코드 `CHARGE_NOT_FOUND`는 §18.1) |

---

### API-charge-03 내 충전 이력 **[v4 신설]**
`GET /api/v1/charges/me` · 권한: 회원 · 우선: P0 · 연관 화면: `A-13 내 지갑` · 연관 기능: `F-charge-03 충전 이력 조회`

## 요구사항
- 내 충전 이력을 최신순으로 준다. 수단·금액·상태·mint tx·실패 사유를 담고, `purpose`로 직접 충전(`MANUAL`)과 결제 연계 충전(`AUTO_PAYMENT`)을 구분한다.
- 실패·만료 건도 함께 보여준다. **재시도 버튼은 두지 않는다** — 실패한 충전은 새 충전으로 다시 하는 것이 안전하다(카드 승인 멱등성 때문) [권].
- 금액은 §0.5 축약형이다. 카드번호는 마스킹만 노출한다.
- **[v4]** 이 목록은 A-13 거래 이력(API-wallet-02)의 `CHARGE` 필터와 같은 사건을 보여주지만, 카드·가상계좌 정보가 더 자세하다. A-14 "충전 내역" 탭 전용이다.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `status` | query | string | N | `REQUESTED`/`FIAT_CONFIRMED`/`MINTING`/`COMPLETED`/`FAILED`/`EXPIRED` |
| `method` | query | string | N | `FOREIGN_CARD`/`DOMESTIC_CARD`/`VIRTUAL_ACCOUNT` |
| `purpose` | query | string | N | `MANUAL`/`AUTO_PAYMENT` |
| `page`·`size`·`sort` | query | — | N | §0.2. `sort`는 `requestedAt,desc`(기본)/`requestedAt,asc` |

### Body
없음.

### 시스템 처리
1. 회원 식별 → 쿼리 화이트리스트 검증. 2. 상태 전이: 기한 경과 가상계좌 건 `EXPIRED` 정리. 3. 외부 호출 없음. 4. `coin_charge` + `chain_job` 조회 후 `items`/`pageInfo`.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "rate": { "currency": "USD", "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "summary": { "completedTotalAmount": 80000, "currency": "KRW", "count": 3 },
    "items": [
      { "chargeId": 7702, "purpose": "MANUAL", "method": "FOREIGN_CARD", "cardNoMasked": "****4242", "status": "COMPLETED", "amount": 30000, "mintTxHash": "0x7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6", "failureCode": null, "requestedAt": "2026-09-10T19:57:40+09:00", "completedAt": "2026-09-10T19:58:12+09:00" },
      { "chargeId": 7701, "purpose": "AUTO_PAYMENT", "method": "FOREIGN_CARD", "cardNoMasked": "****4242", "status": "COMPLETED", "amount": 15000, "ticketOrderId": 5501, "mintTxHash": "0x4a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293", "failureCode": null, "requestedAt": "2026-09-10T20:01:00+09:00", "completedAt": "2026-09-10T20:01:30+09:00" },
      { "chargeId": 7699, "purpose": "MANUAL", "method": "VIRTUAL_ACCOUNT", "status": "EXPIRED", "amount": 20000, "mintTxHash": null, "failureCode": "DEPOSIT_TIMEOUT", "requestedAt": "2026-09-09T11:00:00+09:00", "completedAt": null }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 3, "hasNext": false }
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `status`·`method`·`purpose`·`sort`, `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |

---

### API-charge-04 가상계좌 입금 시뮬레이션 (시연 전용) **[v4 신설 · P1 — 9/2 최소화]**
`POST /api/v1/charges/{chargeId}/simulate-deposit` · 권한: 요청자 · 우선: P0(시연 프로필 한정) · 연관 화면: `A-14 충전` · 연관 기능: `F-charge-02 가상계좌 충전`

## 요구사항
- 시연 환경에서 가상계좌에 **입금이 들어온 것처럼** 금융망 입금 이벤트를 발생시킨다. 발표 시연에서 실제 계좌 이체를 기다리지 않기 위한 경로다.
- **운영 프로필에서는 비활성**이다. `app.profile != demo`면 `COMMON_NOT_FOUND`(404)로 응답해 경로 존재 자체를 숨긴다 [권]. API-charge-01 응답의 `simulateDepositAvailable`로만 노출 여부를 알린다.
- 대상은 `status=REQUESTED`이고 기한이 남은 `VIRTUAL_ACCOUNT` 충전이며, 본인 건만 가능하다. 그 외는 `COMMON_CONFLICT`다.
- 호출 즉시 `FIAT_CONFIRMED`로 전이하고 mint job을 등록해 `MINTING`이 된다. 이후 흐름은 실제 입금과 **완전히 동일**하다 — mint 경로를 따로 두지 않는다(예치 없는 발행 금지 원칙을 시연에서도 형태로 유지한다).
- 멱등하다. 이미 `FIAT_CONFIRMED` 이상이면 현재 상태를 그대로 돌려준다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `chargeId` | path | integer(BIGINT) | Y | 충전 PK (`VIRTUAL_ACCOUNT`) |

### Body
없음(빈 객체 `{}` 허용).

### 시스템 처리
1. 프로필 확인(`demo`) → 충전 존재·요청자·`method=VIRTUAL_ACCOUNT`·`status=REQUESTED`·기한 확인.
2. 상태 전이: `coin_charge` `REQUESTED` → `FIAT_CONFIRMED`(`fiat_confirmed_at`, `bank_tx_id`= 시뮬레이션 ID) → mint job 등록 후 `MINTING`.
3. 외부 호출: 금융망 입금 시뮬레이션 API 호출 → `CoinIssuerPort.mint` `chain_job`(`MINT`, `OPERATOR`) 등록.
4. `coin_charge`·`chain_job` 저장 + 감사 로그(시뮬레이션 표기 포함).

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": { "chargeId": 7703, "status": "MINTING", "amount": 30000, "currency": "KRW", "mintJobId": "chain_01J9GE9F0G", "simulated": true, "pollAfterMs": 1200 },
  "msg": "입금이 확인되었습니다. 잔액에 반영하고 있습니다."
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 404 | `COMMON_NOT_FOUND` | 운영 프로필(경로 비활성), 존재하지 않는 `chargeId`, 타인 충전 |
| 409 | `COMMON_CONFLICT` | `method`가 `VIRTUAL_ACCOUNT`가 아님, 기한 경과(`EXPIRED`), 이미 `FIAT_CONFIRMED` 이상 |
| 409 | `COIN_RESERVE_MISMATCH` | 준비금 불일치로 발행 중단 상태 |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | 금융망 시뮬레이션 API 오류 |

---

## 9. coin — KRWS (+ chain 공통 폴링)

KRWS는 ERC-20, **`decimals=0`, 1 KRWS = 1원**이다(결정 §2.1). **플랫폼이 시연용 가상 원화 스테이블코인을 발행·소각하고 준비금을 공시한다.** mint는 원화 충전 확인에만, burn은 팀 원화 이체 성공 후에만 일어난다(결정 §2.2). 발행·소각·유통량·준비금 조회는 서비스 코드가 컨트랙트를 직접 부르지 않고 **얇은 `CoinIssuerPort` 인터페이스**를 지난다(구현은 `MockIssuer` 1개, 분기 없음 — P-25). 서버 보관 키는 **OPERATOR·MINTER·BURNER 3개**이며 권한이 서로 분리돼 있다(SEC-05).

**[v4] 표시 환율(`exchange_rate`)이 신설됐다**(P-17). 관리자가 `USD_KRW` 등을 등록하고(API-coin-03) 클라이언트가 조회한다(API-coin-02). **환산은 표시에만 쓰이며** 정산·분배·컨트랙트 인자·티켓 가격·충전 금액에는 절대 쓰이지 않는다. **[v4] 체인·컨트랙트 설정 조회(API-coin-04)** 는 프론트 Web3Auth 초기화용이다.

API-chain-01은 모든 202 응답(운영자 job + 사용자 서명 job)의 공통 폴링 엔드포인트라 이 절 끝에 둔다.

### API-coin-01 KRWS 유통량·준비금 요약 **[v4 변경]**
`GET /api/v1/coin/supply` · 권한: GUEST(인증 불필요) · 우선: P0 · 연관 화면: `V-02 준비금 공시` · 연관 기능: `F-coin-02 유통량·준비금 조회`

## 요구사항
- 총 유통량(`KRWS.totalSupply`)과 금융망 원화 예치 잔액, 1:1 성립 여부를 요약해 준다. 상세 증명 데이터는 API-verify-02이고 이쪽은 요약 위젯용이다.
- **1분 캐시**한다 [권] P-11 / REL-03. 응답에 `refreshedAt`을 담아 갱신 시각을 노출한다.
- 불일치가 확인되면 `reserveMatched: false`로 내려주고 서버는 **mint와 release를 중단**한다. 조회 자체는 200으로 성공시킨다 [권].
- **[v4] 발행 주체 라벨**을 담는다 — `issuer.label`(`"Platform (demo mint)"`), `issuer.type`(`MOCK`), `issuer.replaceable: true`. `MOCK`은 결정 §2.6의 `MockIssuer`이며, 인가 발행사 코인으로 바꿀 수 있다는 설명은 §18.4 Q&A 절에만 둔다.
- **[v4] 모의 고지 문구**(`simulationNotice`)를 `Accept-Language`에 맞춰 내려준다 — "테스트넷에서 플랫폼이 발행한 시연용 가상 코인이며 실제 자금이 아닙니다"(CON-03).

## Request
### Headers
- `Accept: application/json` · `Accept-Language: en` / `ko`

### Path · Query
없음.

### Body
없음.

### 시스템 처리
1. 캐시(1분) 확인.
2. 상태 전이 없음(조회). 불일치 확인 시 mint·release 중단 플래그를 세우고 운영자 알림을 발송한다.
3. 외부 호출: `CoinIssuerPort.totalSupply()` + `CoinIssuerPort.reserve()`(금융망 예치 계좌 잔액). 둘 중 하나라도 실패하면 마지막 성공값과 `stale: true`.
4. 캐시 갱신 후 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "totalSupply": 4820000,
    "reserveBalance": 4820000,
    "difference": 0,
    "reserveMatched": true,
    "ratio": "1:1",
    "currency": "KRW",
    "display": { "currency": "USD", "approx": 3570.37, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "issuer": { "type": "MOCK", "label": "Platform (demo mint)", "replaceable": true },
    "mintHalted": false,
    "network": "kaia-kairos",
    "chainId": 1001,
    "tokenAddress": "0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736",
    "tokenDecimals": 0,
    "explorerUrl": "https://kairos.kaiascan.io/address/0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736",
    "refreshedAt": "2026-09-20T09:00:00+09:00",
    "stale": false,
    "simulationNotice": "This is a demo won-pegged coin issued by the platform on a testnet. No real funds are involved."
  },
  "msg": ""
}
```

### 4xx/5xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 429 | `COMMON_TOO_MANY_REQUESTS` | 호출 한도 초과 |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | 체인·금융망 조회 모두 실패하고 캐시도 없음 |

---

### API-coin-02 표시 환율 조회 **[v4 신설]**
`GET /api/v1/coin/rates` · 권한: GUEST(인증 불필요) · 우선: P0 · 연관 화면: `공통` · 연관 기능: `F-coin-06 표시 환율 조회`

## 요구사항
- 현재 유효한 표시 환율을 pair별로 준다. **표시 전용**이며 결제·정산·컨트랙트 계산에 쓰이지 않는다(P-17). 응답에 그 사실을 `usageNotice`로 명시한다.
- `1 base = rate KRW` 방향이다(`USD_KRW`의 `rate: 1350.0` = 1 USD가 1,350원). 클라이언트는 원 값 ÷ rate로 환산한다.
- `pair` 쿼리로 하나만 조회할 수 있고, 미지정 시 등록된 전부를 준다. 유효 레코드는 `effective_from ≤ now`인 것 중 가장 최근 1건이다.
- **1분 캐시**한다 [권]. 시연에서는 하루 1회 등록·고정이라 사실상 상수다(미결 안건 2).
- 등록된 환율이 없으면 빈 배열을 준다(404가 아니다). 클라이언트는 그때 원 값만 표시한다 — 환율 미등록은 오류가 아니다.

## Request
### Headers
- `Accept: application/json` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `pair` | query | string | N | `USD_KRW`·`JPY_KRW`·`EUR_KRW` 등. 미지정 시 전체 |

### Body
없음.

### 시스템 처리
1. 캐시(1분) 확인 → `pair` 형식 검증. 2. 상태 전이 없음(조회). 3. 외부 호출 없음(관리자 등록 값이다 — 외부 시세 API는 P1). 4. `exchange_rate`에서 pair별 유효 1건 조회.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "rates": [
      { "pair": "USD_KRW", "base": "USD", "quote": "KRW", "rate": 1350.0, "effectiveFrom": "2026-09-02T09:00:00+09:00", "source": "MANUAL" },
      { "pair": "JPY_KRW", "base": "JPY", "quote": "KRW", "rate": 9.12, "effectiveFrom": "2026-09-02T09:00:00+09:00", "source": "MANUAL" },
      { "pair": "EUR_KRW", "base": "EUR", "quote": "KRW", "rate": 1462.5, "effectiveFrom": "2026-09-02T09:00:00+09:00", "source": "MANUAL" }
    ],
    "usageNotice": "Rates are for display only. All payments, refunds and settlements are calculated in Korean won.",
    "refreshedAt": "2026-09-02T14:00:00+09:00"
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `pair` 형식 위반(`{3자}_{3자}` 아님) |
| 429 | `COMMON_TOO_MANY_REQUESTS` | 호출 한도 초과 |

---

### API-coin-03 표시 환율 등록 **[v4 신설]**
`PUT /api/v1/admin/coin/rates` · 권한: ADMIN · 우선: P0 · 연관 화면: `M-03 표시 환율·준비금 경고` · 연관 기능: `F-coin-07 표시 환율 등록`

## 요구사항
- 관리자가 pair별 표시 환율을 등록한다. **하루 1회, 시연 고정**을 전제로 한 최소 기능이다(P-17·미결 안건 2). 외부 시세 API 자동 연동은 P1이다.
- 등록은 **append-only**다 — 기존 레코드를 수정하지 않고 새 `exchange_rate` 행을 만든다(`effective_from`, `published_by`, `source`). 이력이 남아야 과거 영수증의 `display.rate`를 재현할 수 있다.
- `effective_from`은 미래 시각도 허용한다(예약 등록). 과거 시각은 이미 발행된 표시값을 소급 변경하므로 **거부**한다 [권].
- 여러 pair를 한 번에 등록할 수 있다(배열). 부분 실패를 허용하지 않고 전량 롤백한다.
- **이 값이 자금 계산에 쓰이지 않음**을 응답 `usageNotice`로 다시 명시한다. 등록해도 기존 주문·정산 금액은 1원도 바뀌지 않는다.
- 감사 로그 `action_type=RATE_CHANGE`로 남긴다(SEC-11).

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}`

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `rates` | array | Y | 1~10개 | 등록할 환율 목록 |
| `rates[].pair` | string | Y | `{3자}_KRW` | 통화쌍. quote는 `KRW` 고정 |
| `rates[].rate` | number | Y | 0 초과, 소수 6자리까지 | `1 base = rate KRW` |
| `rates[].effectiveFrom` | string(ISO 8601) | N | 현재 이후. 미지정 시 `now` | 적용 시각 |
| `rates[].source` | string | N | 기본 `MANUAL`, 최대 100자 | 출처 표기 |

```json
{
  "rates": [
    { "pair": "USD_KRW", "rate": 1350.0, "source": "MANUAL" },
    { "pair": "JPY_KRW", "rate": 9.12, "source": "MANUAL" }
  ]
}
```

### 시스템 처리
1. ADMIN 권한 확인 → `pair` 형식·quote=`KRW`·`rate` 범위·`effectiveFrom` 미래 여부 검증 → 배열 내 pair 중복 확인.
2. 상태 전이 없음(신규 레코드 append). 기존 행은 수정하지 않는다.
3. 외부 호출 없음.
4. `exchange_rate` insert(`published_by = 관리자 memberId`) + **표시 환율 캐시 무효화**(API-coin-02·목록 캐시) + 감사 로그(`RATE_CHANGE`).

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "registered": [
      { "rateId": 56, "pair": "USD_KRW", "rate": 1350.0, "effectiveFrom": "2026-09-02T09:00:00+09:00", "source": "MANUAL" },
      { "rateId": 57, "pair": "JPY_KRW", "rate": 9.12, "effectiveFrom": "2026-09-02T09:00:00+09:00", "source": "MANUAL" }
    ],
    "publishedBy": 1,
    "cacheInvalidated": true,
    "usageNotice": "표시 환산에만 사용됩니다. 정산·분배·티켓 가격·충전 금액은 원화 정수로 계산됩니다."
  },
  "msg": "표시 환율이 등록되었습니다."
}
```

### 4xx
```json
{ "code": "COMMON_VALIDATION_FAILED", "data": null, "msg": "적용 시각은 현재 이후여야 합니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `pair` 형식·quote 위반, `rate` ≤ 0, `effectiveFrom` 과거, 배열 내 pair 중복, 배열 크기 위반 |
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 403 | `COMMON_FORBIDDEN` | ADMIN이 아님 |

---

### API-coin-04 체인·컨트랙트 설정 조회 **[v4 신설 · P1 — 9/2 최소화: 프론트 환경변수]**
`GET /api/v1/coin/config` · 권한: GUEST(인증 불필요) · 우선: P0 · 연관 화면: `공통(프론트 초기화)` · 연관 기능: `F-coin-09 체인·컨트랙트 설정 조회`

## 요구사항
- 프론트가 **Web3Auth SDK와 지갑 연결을 초기화**하는 데 필요한 값을 준다 — `chainNamespace`·`chainId`(hex·decimal)·`rpcTarget`·`displayName`·`ticker`·익스플로러·컨트랙트 주소. 하드코딩 대신 이 API로 받는다(미결 안건 17).
- 비인증 공개다. 여기 담기는 값은 모두 **공개 정보**(테스트넷 RPC·배포된 컨트랙트 주소)이며, **운영자·발행·소각 키의 주소는 담지 않는다**(§0.7 비노출 규칙). `treasuryAddress`(상환 금고)는 예외로 담는다 — 팀 출금 서명의 수신 주소라 사용자가 확인해야 한다.
- Besu 백업으로 전환하면 같은 응답 구조에서 `network`·`chainId`·`rpcTarget`·익스플로러만 바뀐다. 프론트는 값을 그대로 쓰고 분기하지 않는다(AVAIL — 리허설 전환 절차).
- **5분 캐시**한다 [권]. 컨트랙트 재배포 시 캐시를 즉시 무효화한다.
- `contracts.abiVersion`으로 프론트가 번들한 ABI와 서버가 가리키는 컨트랙트의 세대를 맞출 수 있게 한다 [권]. 불일치면 프론트가 "새로고침" 안내를 띄운다.

## Request
### Headers
- `Accept: application/json`

### Path · Query
없음.

### Body
없음.

### 시스템 처리
1. 캐시(5분) 확인. 2. 상태 전이 없음(조회). 3. 외부 호출 없음(설정값 반환). 4. 설정(`coin.issuer.token-address` 등)과 배포 메타를 조합해 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "network": "kaia-kairos",
    "chainNamespace": "eip155",
    "chainId": 1001,
    "chainIdHex": "0x3e9",
    "displayName": "Kaia Kairos",
    "ticker": "KAIA",
    "tickerName": "Kaia",
    "rpcTarget": "https://public-en-kairos.node.kaia.io",
    "explorerBaseUrl": "https://kairos.kaiascan.io",
    "contracts": {
      "tokenAddress": "0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736",
      "tokenSymbol": "KRWS",
      "tokenDecimals": 0,
      "splitterAddress": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
      "treasuryAddress": "0xb2c3d4e5f60718293a4b5c6d7e8f901234567890",
      "abiVersion": "v4.0.0"
    },
    "web3auth": { "clientIdPublic": "BJ8xk...public", "loginProviders": ["google", "facebook", "kakao"] },
    "gasPolicy": { "audienceInitialKaia": "0.05", "leaderInitialKaia": "0.5", "feeDelegation": false },
    "refreshedAt": "2026-09-02T14:00:00+09:00"
  },
  "msg": ""
}
```

`web3auth.clientIdPublic`은 SDK 초기화에 쓰는 **공개** 클라이언트 ID다. 비밀키·verifier 시크릿은 담지 않는다. `gasPolicy.feeDelegation: false`는 Kaia 수수료 대납이 P1임을 뜻한다.

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 429 | `COMMON_TOO_MANY_REQUESTS` | 호출 한도 초과 |
| 500 | `COMMON_INTERNAL_ERROR` | 컨트랙트 주소 설정 누락(배포 전 상태) — 관리자 알림 대상 |

---

> **API-coin-05 `GET /api/v1/admin/coin/jobs`(온체인 작업 목록)와 API-coin-06 `POST /api/v1/admin/coin/jobs/{jobId}/retry`(작업 재시도)는 [v4 P1]이다.** v3에서 API-coin-02·03이던 번호가 환율·설정 API 신설로 05·06으로 **이동**했고(결정 §9 "번호 이동(P1)"), 우선순위는 P1 그대로다. MVP의 처리 방식은 다음과 같다.
>
> - **자동 재시도** — OPERATOR job은 큐에서 최대 3회 재시도하고, 이후 지수 백오프로 시스템이 연장 재시도한다(REL-09).
> - **USER job은 재시도 대상이 아니다** — 서버가 사용자 키로 tx를 재전송할 수 없다(§0.3). receipt 재조회만 반복하고 최종 실패는 사용자가 다시 서명한다.
> - **결정적 실패** — 준비금 불일치로 인한 mint 차단처럼 재시도해도 결과가 같은 실패는 `FAILED`로 고정하고 운영자 알림을 보낸다. MVP에서는 운영자가 DB·체인을 직접 확인한다.
> - **폴링** — 개별 작업 상태는 API-chain-01로 그대로 확인한다. 이 경로는 P0다.

---

### API-chain-01 비동기 tx 작업 상태 **[v4 변경 — signerType·issuerType]**
`GET /api/v1/chain/jobs/{jobId}` · 권한: 요청자(작업을 만든 회원) 또는 ADMIN · 우선: P0 · 연관 화면: `공통(202 폴링)` · 연관 기능: `F-coin-03 온체인 작업 상태 폴링`

## 요구사항
- **모든 202 응답의 단일 폴링 엔드포인트**다. 운영자 tx(mint·burn·refund·lock·release·halt·returnDeposit·가스 충전)와 **[v4] 사용자 서명 tx**(approve·purchase·deposit·agree·treasury-in)가 전부 이 경로로 상태를 확인한다.
- 상태값은 `PENDING`/`SUBMITTED`/`CONFIRMED`/`FAILED`다. 확정 시 `txHash`(66자)와 `explorerUrl`, 실패 시 `failureReason`(규격 코드 문자열)과 `retryable`을 채운다.
- **[v4] `signerType`·`issuerType`을 함께 준다.** `signerType=USER`인 job은 `retryable`이 항상 `false`다 — 서버가 재전송할 수 없고 사용자가 다시 서명해야 한다(§0.3). `issuerType`은 감사용이며 MVP에서는 항상 `MOCK`이다.
- **[v4] `verification` 블록**을 담아 사용자 서명 tx의 receipt 검증 결과를 알려준다 — 어느 항목이 어긋났는지(`to`·`from`·`event`·`args`) 프론트가 사용자 문구를 고를 수 있게 한다.
- 작업을 만든 회원 또는 ADMIN만 조회한다. 남의 작업은 존재를 숨겨 `COMMON_NOT_FOUND`로 응답한다 [권].
- 부분 성공이 있는 작업(공연 취소 일괄 환불, release)은 `results` 배열로 건별 상태를 함께 준다(규격 §1 부분 성공).
- 외부 호출 없이 인덱싱된 `chain_job` 레코드를 읽는다(PERF-01).

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `jobId` | path | string | Y | 202 응답에서 받은 작업 식별자(`chain_*`) |

### Body
없음.

### 시스템 처리
1. 작업 존재·요청자 일치(또는 ADMIN) 확인.
2. 상태 전이 없음(조회). 상태 갱신은 tx 리스너·큐가 담당한다.
3. 외부 호출 없음.
4. 상태·`txHash`·`explorerUrl`·`verification`·부분 결과 반환.

## Response
### 200 OK — 사용자 서명 tx 확정
```json
{
  "code": "SUCCESS",
  "data": {
    "jobId": "chain_01J9GC5D6F",
    "txType": "PURCHASE",
    "signerType": "USER",
    "issuerType": "MOCK",
    "status": "CONFIRMED",
    "walletAddress": "0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a",
    "performanceId": 12,
    "orderId": 5501,
    "amount": 50000,
    "currency": "KRW",
    "txHash": "0x5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f607182934a",
    "explorerUrl": "https://kairos.kaiascan.io/tx/0x5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f607182934a",
    "blockNumber": 184920311,
    "verification": { "verified": true, "expectedEvent": "Purchased", "checks": { "receiptStatus": true, "to": true, "from": true, "event": true, "args": true }, "mismatchFields": [] },
    "retryCount": 0,
    "failureReason": null,
    "retryable": false,
    "results": null,
    "pollAfterMs": null,
    "submittedAt": "2026-09-10T20:03:04+09:00",
    "confirmedAt": "2026-09-10T20:03:11+09:00"
  },
  "msg": ""
}
```

### 200 OK — 운영자 tx 최종 실패
```json
{
  "code": "SUCCESS",
  "data": {
    "jobId": "chain_01J9GD7E8F",
    "txType": "MINT",
    "signerType": "OPERATOR",
    "issuerType": "MOCK",
    "status": "FAILED",
    "txHash": null,
    "verification": null,
    "retryCount": 3,
    "failureReason": "CHAIN_NONCE_CONFLICT",
    "retryable": true,
    "pollAfterMs": null
  },
  "msg": "처리에 실패했습니다. 확인 후 순차적으로 재처리됩니다."
}
```

### 200 OK — 사용자 서명 tx 검증 실패
```json
{
  "code": "SUCCESS",
  "data": {
    "jobId": "chain_01J9GA1B2C",
    "txType": "DEPOSIT",
    "signerType": "USER",
    "status": "FAILED",
    "txHash": "0x6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5",
    "verification": { "verified": false, "expectedEvent": "DepositPaid", "checks": { "receiptStatus": true, "to": true, "from": true, "event": true, "args": false }, "mismatchFields": ["amount"] },
    "retryCount": 0,
    "failureReason": "PAYMENT_AMOUNT_MISMATCH",
    "retryable": false,
    "pollAfterMs": null
  },
  "msg": "트랜잭션 내용이 요청과 일치하지 않습니다. 처음부터 다시 시도해 주세요."
}
```

### 4xx/5xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 `jobId` 또는 타인의 작업 |
| 504 | `CHAIN_TX_TIMEOUT` | 제출은 됐으나 확정이 임계(기본 120초)를 넘김 — 계속 폴링 가능 |

---

## 10. refund — 취소·환불

취소 수수료 [권] P-8: **D-7 이전 전액 / D-3 이전 50% / D-3 00:00 이후 취소 불가**(취소 마감). 구간은 v3와 같다.

**[v4] 환불은 온체인 1건이다.** v3의 "금융망 환불 이체 + burn + `cancelChoice`" 3단계가 **운영자의 `RevenueSplitter.refund(showId, orderRef, to, teamIndex, amount)` 한 tx**로 줄었다(결정 §3.4). 컨트랙트가 에스크로 → **관객 지갑**으로 KRWS를 되돌리고 선택 카운터를 −1 한다. **환불금은 관객 잔액으로 남는다**(P-20 — "Refunded to your balance"). 카드 취소(모의)는 P1, 원화 계좌 환급은 없다. 수수료분은 에스크로에 남아 정산 재원에 포함된다. Refund 상태(결정 §7): `PENDING → PROCESSING → COMPLETED` / `FAILED`(`PROCESSING` = `refund` tx 제출, `COMPLETED` = 확정).

`burn`이 사라졌으므로 v3의 "이체 성공 확인 후 소각" 순서 제약도 이 흐름에서는 없다. 그 원칙은 **팀 원화 출금(§14)** 에만 남는다.

### API-refund-01 환불액 미리보기 **[v4 변경 — 잔액 반환]**
`GET /api/v1/tickets/{ticketId}/refund-quote` · 권한: 소유자 · 우선: P0 · 연관 화면: `A-11 취소·환불` · 연관 기능: `F-refund-01 환불액 미리보기`

## 요구사항
- 지금 취소하면 얼마를 돌려받는지 수수료 구간과 함께 보여준다. 계산 기준(구간 경계 시각)을 함께 담아 화면이 "왜 이 금액인지"를 설명할 수 있게 한다 [권] P-8. 조회만 하고 상태를 바꾸지 않는다.
- **[v4] 환불 대상은 계좌가 아니라 지갑이다.** `refundTarget: "WALLET_BALANCE"`와 수신 지갑 주소·환불 후 예상 잔액(`walletBalanceAfter`)을 담고, 문구는 "Refunded to your balance"다. `refundAccount` 필드는 삭제됐다.
- 취소 마감 이후에는 `REFUND_DEADLINE_PASSED`, 정산 잠금(`LOCKED` 이상) 이후에는 `REFUND_AFTER_SETTLEMENT_LOCK`이다 — 온체인 회수가 불가하므로 고객센터 문의로 안내한다.
- 금액에 `display` 환산을 함께 담는다(§0.5).

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `ticketId` | path | integer(BIGINT) | Y | 티켓 PK |

### Body
없음.

### 시스템 처리
1. 티켓 존재·소유자·상태(`ISSUED`) 확인 → 공연 일시로 수수료 구간 판정 → 정산 상태 확인.
2. 상태 전이 없음(조회).
3. 외부 호출: 현재 지갑 잔액 조회(10초 캐시)로 `walletBalanceAfter` 산출. 실패 시 해당 필드만 `null`.
4. 결제 금액·수수료율·환불 예정액 계산 결과 반환.

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
    "currency": "KRW",
    "display": { "currency": "USD", "approx": 9.26, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "feeStage": "D-3_BEFORE",
    "fullRefundUntil": "2026-09-12T00:00:00+09:00",
    "cancelDeadlineAt": "2026-09-16T00:00:00+09:00",
    "refundTarget": "WALLET_BALANCE",
    "refundWalletAddress": "0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a",
    "walletBalanceAfter": 12500,
    "refundNotice": "Refunded to your balance in Korean won. You can use it for another show."
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

### API-refund-02 개별 취소·환불 **[v4 변경 — 온체인 refund 1건]**
`POST /api/v1/tickets/{ticketId}/cancel` · 권한: 소유자 · 우선: P0 · 연관 화면: `A-11 취소·환불` · 연관 기능: `F-refund-02 티켓 개별 취소·환불`

## 요구사항
- 티켓 1매를 취소하고 **운영자가 `RevenueSplitter.refund(...)` 한 tx**로 에스크로 → 관객 지갑 KRWS를 되돌린다. 같은 tx에서 선택 카운터가 −1 되므로 v3의 `cancelChoice` 별도 tx는 없다(결정 §3.4).
- `202 Accepted` + `jobId`(`signerType=OPERATOR`)이며 상태는 API-chain-01로 확인한다. `Idempotency-Key`가 필수다 — 같은 키 재호출은 최초 `jobId`를 재생한다.
- 확정 시 `refund` `PROCESSING` → `COMPLETED`, 티켓 `ISSUED` → `CANCELLED`, 주문의 전 티켓이 취소되면 주문 `PAID` → `REFUNDED`(+ `payment` → `REFUNDED`), 재고를 원복한다.
- **`orderRef`당 누적 환불 ≤ 구매액**이 컨트랙트 불변식이다. 초과 요청은 컨트랙트가 revert하고 서버도 사전에 막는다(`COMMON_CONFLICT`).
- 클라이언트는 확인 전 API-refund-01로 금액을 보여준 뒤 `expectedRefundAmount`로 재확인시킨다. 서버 재계산과 다르면 400이다.
- **[v4] 실패 보상**: `refund` tx가 실패하면 **아무것도 이동하지 않는다** — 코인은 에스크로에 그대로 있고 티켓 상태만 되돌린다(`refund` → `FAILED`, 티켓 `ISSUED` 복구). v3처럼 "이체는 나갔는데 소각이 실패"하는 어긋난 중간 상태가 원리적으로 없다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language` · `Idempotency-Key: {UUIDv4}` **필수**

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `ticketId` | path | integer(BIGINT) | Y | 티켓 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `expectedRefundAmount` | integer | Y | KRWS 정수 | API-refund-01의 `refundAmount`. 서버 재계산과 다르면 400 |
| `reason` | string | N | 최대 200자 | 취소 사유(통계용) |

```json
{ "expectedRefundAmount": 12500, "reason": "일정 변경" }
```

### 시스템 처리
1. 멱등키 확인 → 소유자·티켓 상태·취소 마감·정산 잠금 확인 → 환불액 재계산 후 `expectedRefundAmount` 대조 → `orderRef` 누적 환불 한도 확인 → 에스크로 잔액 확인.
2. 상태 전이: `refund` 생성(`PENDING`, `to_wallet_id`= 관객 지갑) → tx 제출 시 `PROCESSING` → 확정 시 `COMPLETED` + 티켓 `CANCELLED`(+ 주문 전량 취소 시 `REFUNDED`).
3. 외부 호출(202): 운영지갑이 `refund(showId, orderRef, 관객 지갑, teamIndex, refundAmount)` 전송(nonce 직렬 큐) → receipt·`Refunded` 이벤트 확인. 실패 3회 재시도 후 연장 재시도. **금융망 이체·burn 없음.**
4. `refund`(`refund_job_id`·`refund_tx_hash`)·`chain_job` 저장, 재고 원복, 감사 로그.

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": {
    "jobId": "chain_01J9D8H9J0",
    "status": "PENDING",
    "signerType": "OPERATOR",
    "pollAfterMs": 1500,
    "ticketId": 90211,
    "refundId": 6101,
    "refundAmount": 12500,
    "feeAmount": 12500,
    "currency": "KRW",
    "display": { "currency": "USD", "approx": 9.26, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "refundTarget": "WALLET_BALANCE",
    "refundWalletAddress": "0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a"
  },
  "msg": "취소를 접수했습니다. 환불 금액은 잔액으로 돌아갑니다."
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
| 404 | `WALLET_NOT_FOUND` | 소유자 지갑이 없음(환불 수신 주소 부재) |
| 409 | `TICKET_ALREADY_USED` | 이미 입장 처리됨 |
| 409 | `TICKET_CANCELED` | 이미 취소됨 |
| 409 | `TRANSFER_NOT_ALLOWED` | 양도 진행 중이라 취소 불가 |
| 409 | `REFUND_DEADLINE_PASSED` | 취소 마감(D-3 00:00) 경과 |
| 409 | `REFUND_ALREADY_REQUESTED` | 취소 요청이 이미 접수됨 |
| 409 | `REFUND_AFTER_SETTLEMENT_LOCK` | 정산이 `LOCKED` 이상 |
| 409 | `COMMON_CONFLICT` | 같은 멱등키에 다른 본문, `orderRef` 누적 환불 한도 초과 |
| 409 | `COIN_ESCROW_INSUFFICIENT` | **[v4]** 에스크로 잔액 < 환불액(대사 점검 대상) |
| 500 | `CHAIN_GAS_INSUFFICIENT` | 운영지갑 가스 부족 — 관리자 알림 대상 |
| 502 | `REFUND_TRANSFER_FAILED` | **[v4 재정의]** `refund` tx 최종 실패 — 코인은 이동하지 않았고 재시도 대기 |

---

## 11. transfer — 양도(선물)

**공유 링크**에 담는 **서명 토큰, 24시간 만료**다 [권] P-13 / SEC-07. 수락은 로그인한 관객만 하고, 수락 즉시 소유자를 변경하며 **기존 QR 시드를 폐기·재발급**한다. 양도중(`TRANSFER_PENDING`) 티켓은 입장·취소가 막힌다(REL-08). Transfer 상태: `PENDING` → `COMPLETED` / `EXPIRED` / `CANCELLED`. 공연법 제4조의2에 따라 **플랫폼 동의 하의 구입가 이하 무상 이전**만 다루며 유료 재판매는 P2다.

**[v4] 양도에는 온체인 tx가 없다.** v3는 수락 시 `cancelChoice` → `recordChoice` 2건을 보냈지만, v4에서는 관객 선택이 `purchase` tx에 이미 기록돼 있고 그 tx를 되돌릴 수 없으므로 **온체인 선택 카운터는 양도로 바뀌지 않는다.** 대신 수락자가 고른 팀은 **오프체인(`order_item`)에만 갱신**하고, `counterMatched` 대사는 **온체인 카운터를 기준**으로 삼는다. 결과적으로 양도 수락은 순수 오프체인 동작이며 `chainJobIds` 응답 필드도 없어졌다. 정산 분배는 온체인 카운터(원 구매자의 선택)를 쓴다 — 이 판단을 §18.2 #4에 판단 지점으로 기록했다.

### API-transfer-01 양도 링크 생성 **[P2 — 9/2 최후순위]**
`POST /api/v1/tickets/{ticketId}/transfers` · 권한: 소유자 · 우선: P0 · 연관 화면: `A-09 양도 링크 생성` · 연관 기능: `F-transfer-01 티켓 양도 링크 생성`

## 요구사항
- 티켓 1매에 대해 일회용 수락 링크를 만든다. 유효기간 24시간, 수락 즉시 무효다(SEC-07). 생성 즉시 티켓이 `ISSUED` → `TRANSFER_PENDING`이 되어 입장·취소·QR 발급이 막힌다(REL-08).
- 같은 티켓에 유효한 양도가 이미 있으면 새로 만들지 않는다(`TRANSFER_NOT_ALLOWED`). 취소는 API-transfer-04다. `USED`·`CANCELLED` 티켓은 대상이 아니다. 취소 마감 이후 양도는 허용한다 [권].
- **[v4] 무상 이전만 지원한다.** 금액 필드가 없고 코인 이동도 없다. 받는 사람에게 대금을 청구하는 경로를 만들지 않는다(공연법·P2 재판매 경계).
- `shareUrl`은 클라이언트가 복사·OS 공유 시트로 그대로 쓴다. 서버가 메시지를 발송하지 않는다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

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
1. 소유자·티켓 상태(`ISSUED`) 확인 → 기존 유효 양도 존재 여부 확인. 2. 상태 전이: `transfer` 생성(`PENDING`, 24h), 티켓 → `TRANSFER_PENDING`. 3. 외부 호출 없음. 4. `transfer` 저장, 서명 토큰 발급, 기존 QR 토큰 무효화.

## Response
### 201 Created
```json
{
  "code": "SUCCESS",
  "data": { "transferId": 3301, "ticketId": 90211, "token": "trf_7c1a9b2e4d6f8031", "shareUrl": "https://b204.ssafy.io/transfers/trf_7c1a9b2e4d6f8031", "status": "PENDING", "expiresAt": "2026-09-15T21:00:00+09:00" },
  "msg": "24시간 안에 상대방이 수락해야 합니다."
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `message` 길이 초과 |
| 403 | `TICKET_NOT_OWNED` | 현재 소유자가 아님 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 `ticketId` |
| 409 | `TICKET_ALREADY_USED` | 이미 입장 처리됨 |
| 409 | `TICKET_CANCELED` | 취소된 티켓 |
| 409 | `TRANSFER_NOT_ALLOWED` | 이미 유효한 양도 링크가 존재하거나 양도 불가 상태 |

---

### API-transfer-02 양도 정보 조회 **[P2 — 9/2 최후순위]**
`GET /api/v1/transfers/{token}` · 권한: GUEST(인증 불필요) · 우선: P0 · 연관 화면: `A-10 양도 수락` · 연관 기능: `F-transfer-02 양도 정보 조회`

## 요구사항
- 비로그인 상태에서 링크를 열었을 때 무엇을 받는지 보여준다 — 공연·일시·장소·티켓 타입·보낸 사람 이름(마스킹)·남은 시간. 개인정보를 최소화하고 연락처·이메일은 담지 않는다 [권].
- 만료는 `410 TRANSFER_LINK_EXPIRED`, 이미 수락은 `409 TRANSFER_LINK_ALREADY_USED`로 구분해 화면 문구를 다르게 한다.
- 수락은 로그인이 필요하므로 `loginRequired: true`를 담는다. **[v4]** 비회원은 **Web3Auth 소셜 로그인(API-member-01)** 으로 가입·로그인한 뒤 이 화면으로 복귀한다 — 지갑도 그때 함께 만들어진다.
- 공동 공연이면 `choiceRequired: true`와 선택 가능한 참여팀 목록을 함께 준다. **[v4]** 그 선택은 오프체인 기록용임을 `choiceNotice`로 알린다.

## Request
### Headers
- `Accept: application/json` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `token` | path | string | Y | 양도 토큰(최대 64자) |

### Body
없음.

### 시스템 처리
1. 토큰 서명·존재·만료 검증. 2. 상태 전이: 만료 확인 시 `transfer` → `EXPIRED`, 티켓 `TRANSFER_PENDING` → `ISSUED` 복구. 3. 외부 호출 없음. 4. 공연·티켓 요약 반환.

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
    "loginRequired": true,
    "walletRequired": false,
    "jointPerformance": true,
    "choiceRequired": true,
    "choiceNotice": "Your pick is recorded for your ticket. The on-chain tally keeps the original buyer's pick.",
    "selectableTeams": [ { "teamId": 7, "teamName": "블루노트" }, { "teamId": 9, "teamName": "새벽세시" }, { "teamId": 11, "teamName": "노이즈캔슬" } ]
  },
  "msg": ""
}
```

`walletRequired: false` — 양도 수락에는 지갑이 필요 없다(코인 이동이 없다). 지갑은 결제·환불 수령에만 필요하다.

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 404 | `TRANSFER_LINK_NOT_FOUND` | 존재하지 않거나 서명이 깨진 토큰 |
| 409 | `TRANSFER_LINK_ALREADY_USED` | 이미 다른 사용자가 수락 |
| 410 | `TRANSFER_LINK_EXPIRED` | 24시간 경과 또는 보낸 사람이 취소 |

---

### API-transfer-03 양도 수락 **[v4 변경 — 온체인 tx 없음]** **[P2 — 9/2 최후순위]**
`POST /api/v1/transfers/{token}/accept` · 권한: AUDIENCE · 우선: P0 · 연관 화면: `A-10 양도 수락` · 연관 기능: `F-transfer-03 양도 수락`

## 요구사항
- 로그인한 관객만 수락한다. 수락 즉시 **DB 소유자를 변경**하고 `ticket.qr_secret`을 재생성해 이전 소유자 QR을 무효화한다(SEC-07). 티켓 `TRANSFER_PENDING` → `ISSUED`(새 소유자), `transfer` `PENDING` → `COMPLETED`.
- 공동 공연이면 `choiceTeamId`가 필수다. 단독 공연이면 보내지 않는다(보내면 `COMMON_VALIDATION_FAILED`).
- **[v4] 온체인 tx가 없다.** `cancelChoice`·`recordChoice` 2건은 삭제됐다 — 선택은 `purchase` tx에 이미 기록돼 있고 서버가 그 tx를 되돌릴 수 없다. 수락자의 선택은 `order_item`에만 갱신되며, **온체인 카운터와 정산 분배는 원 구매자의 선택을 유지**한다. 응답의 `onchainChoiceUnchanged: true`가 그 사실이다. `chainJobIds` 필드는 없어졌다.
- **[v4] 지갑이 없어도 수락할 수 있다.** 자금 이동이 없기 때문이다. 다만 그 티켓을 나중에 **환불**하려면 수신 지갑이 필요하므로 `walletLinkRecommended: true`를 담아 C-05를 권한다 [권].
- 자기 자신에게는 보낼 수 없다(`TRANSFER_SELF_NOT_ALLOWED`). 1인 1공연 4매 한도를 넘기는 수락도 막는다. 동시 수락 경합은 토큰 단위 락으로 한 명만 성공시킨다. IP당 60회/분 제한 대상이다(SEC-10).

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `token` | path | string | Y | 양도 토큰 |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `choiceTeamId` | integer | 조건부 | **공동 공연이면 필수**, 해당 공연의 수락된 참여팀 | 수락자가 고르는 관람 목적 팀(오프체인 기록) |

```json
{ "choiceTeamId": 9 }
```

### 시스템 처리
1. 토큰 검증 → 만료·사용 여부 → 수락자 ≠ 보낸 사람 → 수락자의 해당 공연 보유 매수 한도 → 공동 공연이면 `choiceTeamId` 참여팀 여부 확인.
2. 상태 전이: `transfer` → `COMPLETED`, `ticket.owner_member_id` 변경 후 `TRANSFER_PENDING` → `ISSUED`, `order_item`의 선택 팀 갱신, `ticket.qr_secret` 재생성.
3. **외부 호출 없음** — 온체인 카운터를 건드리지 않는다.
4. `transfer`·`ticket`·`order_item` 저장 + 양도 이력·감사 로그.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "transferId": 3301,
    "ticketId": 90211,
    "status": "COMPLETED",
    "newOwnerMemberId": 2048,
    "choiceTeamId": 9,
    "onchainChoiceUnchanged": true,
    "walletLinkRecommended": true,
    "performanceTitle": "합정 3밴드 합동공연",
    "startAt": "2026-09-19T19:00:00+09:00",
    "acceptedAt": "2026-09-15T09:31:00+09:00"
  },
  "msg": "티켓을 받았습니다. 내 티켓에서 확인해 주세요."
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 공동 공연인데 `choiceTeamId` 누락, 단독 공연인데 전달 |
| 400 | `TRANSFER_SELF_NOT_ALLOWED` | 보낸 사람이 직접 수락 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 404 | `TEAM_NOT_FOUND` | `choiceTeamId`가 해당 공연의 참여팀이 아님 |
| 404 | `TRANSFER_LINK_NOT_FOUND` | 존재하지 않는 토큰 |
| 409 | `TRANSFER_LINK_ALREADY_USED` | 이미 수락됨(동시 경합 포함) |
| 409 | `TICKET_PURCHASE_LIMIT_EXCEEDED` | 수락 시 1인 1공연 4매 초과 |
| 409 | `TRANSFER_NOT_ALLOWED` | 공연이 취소되었거나 티켓이 더 이상 유효하지 않음 |
| 410 | `TRANSFER_LINK_EXPIRED` | 24시간 경과 |
| 429 | `COMMON_TOO_MANY_REQUESTS` | IP당 60회/분 초과 (SEC-10) |

---

### API-transfer-04 양도 취소 **[P2 — 9/2 최후순위]**
`DELETE /api/v1/transfers/{token}` · 권한: 보낸 소유자 · 우선: P0 · 연관 화면: `A-09 양도 링크 생성` · 연관 기능: `F-transfer-04 양도 취소`

## 요구사항
- 아직 수락되지 않은 링크를 보낸 사람이 무효화한다. 티켓은 `TRANSFER_PENDING` → `ISSUED`로 돌아가고 입장·취소가 다시 가능해진다.
- 이미 수락된 링크는 되돌릴 수 없다(`TRANSFER_LINK_ALREADY_USED`). 만료된 링크에 대한 취소는 200으로 처리한다(결과 상태가 같다) [권].
- 온체인 tx가 없다(§11 도입부).

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `token` | path | string | Y | 양도 토큰 |

### Body
없음.

### 시스템 처리
1. 토큰 존재·요청자가 보낸 소유자인지 확인 → 상태(`PENDING`·`EXPIRED`) 확인. 2. 상태 전이: `transfer` → `CANCELLED`, 티켓 → `ISSUED`. 3. 외부 호출 없음. 4. QR 시드 재발급 + 이력 저장.

## Response
### 200 OK
```json
{ "code": "SUCCESS", "data": { "transferId": 3301, "ticketId": 90211, "status": "CANCELLED" }, "msg": "선물하기를 취소했습니다." }
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `TICKET_NOT_OWNED` | 보낸 소유자가 아님 |
| 404 | `TRANSFER_LINK_NOT_FOUND` | 존재하지 않는 토큰 |
| 409 | `TRANSFER_LINK_ALREADY_USED` | 이미 수락 완료 |

---

## 12. entry — 입장

검표 권한은 **공연별 검표 페이지 링크 토큰**이 정한다 [권] P-15 / SEC-03. 검표 담당자는 계정을 만들지 않고 API-performance-10이 발급한 링크로 들어와 그 토큰으로 인증한다. 동적 QR(30초 회전, 유효 60초)을 검증하고 Redis `SETNX` 원타임으로 재사용을 차단한다(SEC-06, REL-07 중복 입장 0). 스캔→판정 표시 p95 ≤ 1초, 스캐너 1대 ≥ 30건/분이 목표다(PERF-03).

**[v4]** 입장은 v3와 완전히 같다 — **온체인·코인과 무관하다.** QR 입장 보안은 서버 서명 QR의 몫이며 블록체인 성과가 아니다. 이 절의 두 API는 결정 문서에서 "유지"로 분류됐고 실질 변경이 없다(문구·`Accept-Language`만 §0.6을 따른다).

### API-entry-01 QR 검증·입장 처리
`POST /api/v1/entries/verify` · 권한: **검표 링크 토큰 보유자**(해당 공연) 또는 참여팀 회원 · 우선: P0 · 연관 화면: `S-02 검표 — QR 스캔` · 연관 기능: `F-entry-01 QR 검증·입장 처리`

## 요구사항
- 스캔한 QR 토큰의 서명·만료를 검증하고 즉시 입장 처리한다. 판정을 1초 안에 색·소리로 표시할 수 있도록 응답을 최소 필드로 유지한다(PERF-03).
- **Redis `SETNX` 원타임**으로 중복 입장을 막는다. 중복은 `ENTRY_ALREADY_ENTERED`이며 `msg`에 최초 입장 시각을 담는다. 만료 QR은 `ENTRY_QR_EXPIRED`(401), 서명 검증 실패는 `ENTRY_QR_SIGNATURE_INVALID`(401)이며 캡처·복제 시도로 보고 검표 이력에 기록한다.
- **인증은 `X-Entry-Token` 헤더**(권장) 또는 `entryToken` 쿼리다. 서버는 토큰 서명·만료와 **토큰의 공연 == body의 `performanceId`**를 검증한다. `Authorization` 헤더는 필요 없다. 참여팀 소속 회원이 `Authorization`으로 호출하는 경로도 허용한다 [권].
- 토큰이 없거나 불일치면 `ENTRY_SCANNER_NOT_AUTHORIZED`(403), 입장 허용 시간대(시작 60분 전 ~ 종료) 밖은 `ENTRY_NOT_IN_TIME_WINDOW`(409)다 [권]. 양도중·취소 티켓은 입장시키지 않는다(REL-08).
- IP당 60회/분 제한 대상이며 링크 토큰 기준으로도 같은 한도를 적용한다(SEC-10).

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Accept-Language`
- `X-Entry-Token: {entryToken}` — 검표 링크 토큰. **`Authorization`과 둘 중 하나는 필수**
- `Authorization: Bearer {accessToken}` — 참여팀 소속 회원이 호출할 때만

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `entryToken` | query | string | N | 헤더를 못 쓰는 클라이언트용 대체. 헤더가 있으면 헤더 우선 |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `performanceId` | integer | Y | 검표 토큰의 공연과 일치 | 검표 중인 공연 |
| `qrToken` | string | Y | 최대 1024자 | 스캔한 서명 토큰 |
| `scannedAt` | string(ISO 8601) | N | — | 스캐너 단말 시각(로그용, 판정 기준은 서버 시각) |

```json
{ "performanceId": 12, "qrToken": "eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjkwMjExLCJleHAiOjE3ODk...", "scannedAt": "2026-09-19T18:42:03+09:00" }
```

### 시스템 처리
1. 검표 토큰 검증(서명·만료·공연 일치) **또는** 참여팀 소속 확인 → QR에서 `ticketId` 추출 후 `ticket.qr_secret`으로 현재·이전 30초 윈도우 HMAC 재계산·대조 → 티켓의 공연 일치·상태(`ISSUED`) 확인 → 입장 시간대 확인.
2. 상태 전이: Redis `SETNX` 원타임 획득 성공 시 티켓 `ISSUED` → `USED`(`entry_result`·`entered_at` 기록).
3. 외부 호출 없음(온체인과 무관).
4. `ticket` 갱신 + 검표 이력(성공·실패 모두) 기록.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": { "ticketId": 90211, "status": "USED", "ticketTypeName": "일반", "holderNameMasked": "김*객", "enteredAt": "2026-09-19T18:42:03+09:00", "enteredCount": 41, "totalIssuedCount": 64 },
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
| 401 | `COMMON_UNAUTHORIZED` | `X-Entry-Token`·`Authorization` 둘 다 없음 |
| 403 | `ENTRY_SCANNER_NOT_AUTHORIZED` | 검표 토큰이 무효·만료·다른 공연의 것이거나 참여팀 소속도 아님 |
| 404 | `COMMON_NOT_FOUND` | 토큰이 가리키는 티켓 없음 |
| 409 | `ENTRY_ALREADY_ENTERED` | Redis 원타임 중복 감지 |
| 409 | `ENTRY_NOT_IN_TIME_WINDOW` | 입장 허용 시간대 밖 |
| 409 | `TICKET_CANCELED` | 취소된 티켓 |
| 409 | `TRANSFER_NOT_ALLOWED` | 양도 진행 중이라 입장 불가 |
| 429 | `COMMON_TOO_MANY_REQUESTS` | IP당 60회/분 초과 (SEC-10) |

---

### API-entry-02 입장 현황·이력
`GET /api/v1/performances/{performanceId}/entries` · 권한: **검표 링크 토큰 보유자**·PERFORMER(참여팀) · 우선: P0 · 연관 화면: `S-03 입장 현황` · 연관 기능: `F-entry-02 입장 현황 조회`

## 요구사항
- 입장 수/총 발급 수와 최근 검표 이력을 준다. **중복 시도·만료 QR 같은 실패 건도 함께** 보여줘 현장에서 원인을 파악하게 한다. 요약값은 5초 캐시한다 [권](PERF-01).
- 인증은 API-entry-01과 같다 — 검표 링크 토큰 또는 참여팀 소속 회원.
- 관객 개인정보는 담지 않는다. 티켓 식별 정보·시각·마스킹된 이름만 준다.

## Request
### Headers
- `Accept: application/json` · `Accept-Language` · `X-Entry-Token` 또는 `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |
| `entryToken` | query | string | N | 헤더 대체 경로 |
| `result` | query | string | N | `SUCCESS` / `FAILED`. 미지정 시 전체 |
| `page`·`size` | query | — | N | §0.2 |

### Body
없음.

### 시스템 처리
1. 공연 존재 확인 → 검표 토큰 검증 또는 참여팀 소속 확인. 2. 상태 전이 없음(조회). 3. 외부 호출 없음. 4. `ticket`(`entry_result`·`entered_at`) 조회 + 요약 집계(5초 캐시) 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "summary": { "enteredCount": 41, "totalIssuedCount": 64, "duplicateAttemptCount": 3, "expiredQrCount": 5 },
    "items": [
      { "entryLogId": 77012, "ticketId": 90211, "holderNameMasked": "김*객", "result": "SUCCESS", "failureCode": null, "scannedAt": "2026-09-19T18:42:03+09:00", "scannerSource": "ENTRY_LINK" },
      { "entryLogId": 77013, "ticketId": 90211, "holderNameMasked": "김*객", "result": "FAILED", "failureCode": "ENTRY_ALREADY_ENTERED", "scannedAt": "2026-09-19T18:42:31+09:00", "scannerSource": "ENTRY_LINK" }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 49, "hasNext": true }
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `result`, `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | `X-Entry-Token`·`Authorization` 둘 다 없음 |
| 403 | `ENTRY_SCANNER_NOT_AUTHORIZED` | 검표 토큰이 무효·만료·다른 공연의 것이거나 참여팀 소속도 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |

---

> **API-entry-03 `GET /api/v1/performances/staff/me`는 v2에서 삭제됐고 v4에서도 되살리지 않는다.** STAFF 회원 지정(`performance_staff`)이 폐지돼 "내가 검표하는 공연"이라는 개념이 없다. 검표 담당자는 공유받은 링크로 곧바로 `S-02`에 들어가고, 참여팀 공연자는 `P-01`·`P-04`에서 링크(API-performance-10)를 확인한다.

---

## 13. settlement — 정산

정산 시점 규칙 [권] P-9: `취소 마감(D-3) → 공연 종료 → 집계 확정 → 정산 잠금 → 이의제기 48h → release`. **[v4] Settlement 상태는 `NONE → AGGREGATED → LOCKED → DISPUTE_OPEN → RELEASED` / `HALTED`이며 `REDEEMED`가 삭제됐다**(결정 §7·미결 안건 11) — `release`로 팀 리더 지갑에 KRWS가 들어가면 정산은 **종단(`RELEASED`)** 이고, 그 뒤 원화 출금은 팀이 원할 때 시작하는 별개 도메인(§14 `withdraw`)이다.

**[v4] release가 실제로 하는 일**: 운영자가 `RevenueSplitter.release(showId)`를 보내면 컨트랙트가 잠긴 규칙·온체인 카운터로 분배액을 산출해 **각 팀 리더 지갑으로 KRWS를 `transfer`(push)** 하고 `Released(showId, teamWallet, amount)` 이벤트를 남긴다. dust는 공연 생성 팀에 귀속된다. **자동 원화 이체는 없다**(P-10 개정 — 리더 서명이 필요하다). release 확정 시 리더에게 알림을 보내고 P-09 배지를 띄운다. 이어서 **보증금 반환**(`returnDeposit`)도 실행한다(P-21).

집계는 서버 DB값이 아니라 **온체인 선택 카운터**와 대조해 확정하고(REL-06), 불일치면 자동 정산을 중단한다.

### API-settlement-01 정산 상태·집계·분배액·tx **[v4 변경]**
`GET /api/v1/performances/{performanceId}/settlement` · 권한: PERFORMER(참여팀) · 우선: P0 · 연관 화면: `P-08 정산 대시보드` · 연관 기능: `F-settlement-01 정산 현황 조회`

## 요구사항
- 정산 상태 머신의 현재 위치, 총 매출·환불액·분배 대상액, **팀별 분배액과 산출 근거**, 관련 tx 해시·익스플로러 링크를 한 번에 준다. P-08 화면 전체가 이 응답으로 그려진다.
- **[v4]** 팀별 항목에 **`released`(수령 여부)·`releasedAt`·`walletAddress`(수령 주소 스냅샷)·`withdrawnAmount`(원화로 출금한 누적액)** 를 담는다(결정 §8 #20 `settlement_share` 컬럼 교체). v3의 `redemptionStatus`·`transfer_confirmed`는 없어졌다.
- **[v4]** `releaseTxHash`·`escrowBalance`·**보증금 반환 상태**(`deposit.status`·`returnTxHash`)를 담는다.
- **[v4] 내 팀의 다음 행동**을 `myTeam.nextAction`으로 준다 — `NONE` / `REGISTER_ACCOUNT`(계좌 미등록) / `WITHDRAW`(출금 가능). P-08 → P-09 이동 근거다.
- 각 단계 액션(집계 확정·잠금·이의제기·release)의 실행 가능 여부와 막힌 이유를 `actions`로 담아 버튼 활성 조건을 서버가 정한다 [권]. 이의제기 기간 중이면 `disputeClosesAt`을 준다.
- 참여팀 소속만 조회한다(`SETTLEMENT_NOT_PARTICIPANT`). 공개용은 API-verify-01, 밴드 멤버용은 API-settlement-07이다.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

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
4. `settlement` + `settlement_share` + `dispute` + `chain_job` + `coin_withdrawal` + `performance`(보증금) 조합 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "settlementId": 91,
    "status": "RELEASED",
    "rate": { "currency": "USD", "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "currency": "KRW",
    "grossRevenueAmount": 1600000,
    "refundedAmount": 75000,
    "netRevenueAmount": 1525000,
    "distributableAmount": 1525000,
    "escrowBalanceAmount": 0,
    "fixedRatioBp": 6000,
    "selectionRatioBp": 4000,
    "dustAmount": 4,
    "dustTeamId": 7,
    "rulesHash": "0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f",
    "aggregatedAt": "2026-09-20T10:00:00+09:00",
    "lockedAt": "2026-09-20T18:00:00+09:00",
    "disputeClosesAt": "2026-09-22T18:00:00+09:00",
    "releasedAt": "2026-09-22T18:00:30+09:00",
    "releaseTxHash": "0x9c1a4b7e2d5f8039ab6c4e1d2f3a5b7c9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6",
    "counterMatched": true,
    "deposit": { "status": "RETURNED", "amount": 50000, "returnTxHash": "0x8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7", "returnedAt": "2026-09-22T18:00:45+09:00" },
    "shares": [
      { "teamId": 7, "teamName": "블루노트", "walletAddress": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b", "fixedAmount": 457500, "choiceAmount": 285937, "dustAmount": 4, "totalAmount": 743441, "choiceCount": 30, "released": true, "releasedAt": "2026-09-22T18:00:30+09:00", "withdrawnAmount": 0 },
      { "teamId": 9, "teamName": "새벽세시", "walletAddress": "0x3c8a1f2b4d6e8091a2b3c4d5e6f708192a3b4c5d", "fixedAmount": 274500, "choiceAmount": 200156, "dustAmount": 0, "totalAmount": 474656, "choiceCount": 21, "released": true, "releasedAt": "2026-09-22T18:00:30+09:00", "withdrawnAmount": 474656 },
      { "teamId": 11, "teamName": "노이즈캔슬", "walletAddress": "0x9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6f7081920", "fixedAmount": 183000, "choiceAmount": 123903, "dustAmount": 0, "totalAmount": 306903, "choiceCount": 13, "released": true, "releasedAt": "2026-09-22T18:00:30+09:00", "withdrawnAmount": 0 }
    ],
    "myTeam": { "teamId": 11, "totalAmount": 306903, "released": true, "withdrawnAmount": 0, "settlementAccountRegistered": false, "nextAction": "REGISTER_ACCOUNT" },
    "disputes": [],
    "transactions": [
      { "type": "START_SALE", "txHash": "0x8f2e1d0c9b8a70695847362514039281a0b1c2d3e4f5061728394a5b6c7d8e9f", "explorerUrl": "https://kairos.kaiascan.io/tx/0x8f2e1d0c9b8a70695847362514039281a0b1c2d3e4f5061728394a5b6c7d8e9f" },
      { "type": "RELEASE", "txHash": "0x9c1a4b7e2d5f8039ab6c4e1d2f3a5b7c9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6", "explorerUrl": "https://kairos.kaiascan.io/tx/0x9c1a4b7e2d5f8039ab6c4e1d2f3a5b7c9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6" }
    ],
    "actions": {
      "aggregate": { "available": false, "blockedReason": "SETTLEMENT_ALREADY_RELEASED" },
      "lock": { "available": false, "blockedReason": "SETTLEMENT_ALREADY_RELEASED" },
      "dispute": { "available": false, "blockedReason": "SETTLEMENT_ALREADY_RELEASED" },
      "release": { "available": false, "blockedReason": "SETTLEMENT_ALREADY_RELEASED" }
    }
  },
  "msg": ""
}
```

`fixedAmount`는 v3의 `equalAmount`를 대체한다 — 2단계 규칙에서 고정 풀은 균등이 아니라 `teamShareBp`로 나뉘기 때문이다(v3 §5 규칙과 일치하도록 필드명을 정정했다, §18.2 #2).

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `SETTLEMENT_NOT_PARTICIPANT` | 참여팀 소속이 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |

---

### API-settlement-02 집계 확정
`POST /api/v1/performances/{performanceId}/settlement/aggregate` · 권한: 생성자·ADMIN · 우선: P0 · 연관 화면: `P-08 정산 대시보드` · 연관 기능: `F-settlement-02 정산 집계 확정`

## 요구사항
- **공연 종료(`ENDED`) 이후** 생성자 또는 관리자가 실행한다 [권] P-9. 공연이 끝나지 않았으면 `PERFORMANCE_INVALID_STATUS`다.
- 서버 집계와 **온체인 선택 카운터의 합**을 대조한다. 불일치면 `SETTLEMENT_AGGREGATE_MISMATCH`로 중단하고 관리자 확인으로 넘긴다(REL-06).
- **[v4]** 결제 서명이 끝나지 않은 주문(`payment` `AWAITING_SIGNATURE`·`PAYING`)이나 확정 대기 mint가 남아 있으면 `COIN_MINT_PENDING`(409)으로 막는다. 온체인 카운터가 아직 움직이는 중이면 집계가 의미 없다.
- 온체인 조회·기록이 걸리므로 `202 Accepted` + `jobId`다. 확정 시 정산 `NONE` → `AGGREGATED`, 팀별 `settlement_share`가 확정 저장된다. 산출→제출 ≤ 5분이 목표다(PERF-05).

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
없음.

### 시스템 처리
1. 생성자·ADMIN 권한 확인 → 공연 상태(`ENDED`)·정산 상태(`NONE`) 확인 → 미확정 결제·mint 잔여 확인.
2. 상태 전이: `settlement` 생성/갱신, tx 확정 시 `NONE` → `AGGREGATED`.
3. 외부 호출(202): `choiceCountOf`·`escrowOf` 조회 → 서버 집계와 대조 → 분배액 산출(2단계 규칙, dust는 생성 팀) → `aggregate(showId, validTicketCount)` 온체인 기록(OPERATOR). 실패 3회 재시도 후 연장 재시도.
4. `settlement`·`settlement_share`·`chain_job` 저장 + 감사 로그.

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": { "jobId": "chain_01J9E1K2L3", "status": "PENDING", "signerType": "OPERATOR", "pollAfterMs": 2000, "performanceId": 12, "nextStatus": "AGGREGATED", "validTicketCount": 64 },
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
| 409 | `COMMON_CONFLICT` | 이미 `AGGREGATED` 이상이거나 집계 작업 진행 중 |
| 409 | `COIN_MINT_PENDING` | **[v4]** 확정되지 않은 결제 서명·mint 건이 남아 있음 |
| 409 | `SETTLEMENT_AGGREGATE_MISMATCH` | 온체인 카운터 합 ≠ 서버 집계 |
| 500 | `CHAIN_GAS_INSUFFICIENT` | 운영지갑 가스 부족 |
| 504 | `CHAIN_TX_TIMEOUT` | 온체인 확정 지연 — `jobId`로 계속 폴링 |

---

### API-settlement-03 정산 잠금(이의제기 시작)
`POST /api/v1/performances/{performanceId}/settlement/lock` · 권한: 생성자·ADMIN · 우선: P0 · 연관 화면: `P-08 정산 대시보드` · 연관 기능: `F-settlement-03 정산 잠금·이의제기 기간 시작`

## 요구사항
- `AGGREGATED`에서만 실행한다. 잠금 즉시 팀별 분배액이 고정되고 **48시간 이의제기 기간**이 시작된다 [권] P-9·P-16. 조회 응답에서는 `DISPUTE_OPEN`으로 표시된다.
- 잠금 이후 개별 환불은 앱에서 막힌다(`REFUND_AFTER_SETTLEMENT_LOCK`) — 컨트랙트도 lock 이후 `refund`를 revert한다.
- 온체인 카운터 불일치(`counterMatched: false`)에서는 잠글 수 없다(REL-06).
- `202 Accepted` + `jobId`다. 운영자가 `lock(showId)`를 보낸다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
없음.

### 시스템 처리
1. 생성자·ADMIN 권한 확인 → 정산 상태(`AGGREGATED`)·카운터 일치 확인.
2. 상태 전이: tx 확정 시 `AGGREGATED` → `LOCKED`, `disputeClosesAt = now + 48h`.
3. 외부 호출(202): 운영자가 `lock(showId)` 전송. 실패 3회 재시도 후 연장 재시도.
4. `settlement` 갱신 + 참여팀 리더 알림 [권] + 감사 로그.

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": { "jobId": "chain_01J9E4M5N6", "status": "PENDING", "signerType": "OPERATOR", "pollAfterMs": 2000, "performanceId": 12, "nextStatus": "LOCKED", "disputeClosesAt": "2026-09-22T18:00:00+09:00" },
  "msg": "정산을 잠갔습니다. 48시간 동안 이의제기를 받습니다."
}
```

### 4xx/5xx
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
`POST /api/v1/performances/{performanceId}/settlement/disputes` · 권한: 참여팀 리더 · 우선: P0 · 연관 화면: `P-08 정산 대시보드` · 연관 기능: `F-settlement-04 정산 이의제기`

## 요구사항
- 참여팀 리더가 **잠금 후 48시간 안에** 사유를 제출한다 [권] P-16. 접수되면 release 자동 실행이 보류되고 관리자 검토(API-admin-06)로 넘어간다.
- 기간이 끝난 뒤 제출은 막는다. 규격에 전용 코드가 없어 `COMMON_CONFLICT`로 응답하고 `msg`로 사유를 설명한다(전용 코드 `SETTLEMENT_DISPUTE_CLOSED`는 §18.1).
- 팀당 동시에 열린 이의는 1건이다. 중복 제출은 `COMMON_CONFLICT`다.
- 온체인 작업이 아니므로 `201 Created` 동기 응답이다. **[v4]** `dispute`에 `member_id`는 없다 — 팀 단위 이의다(9/1 커밋 `69fa8e9`).

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `teamId` | integer | Y | 요청자가 리더인 참여팀 | 이의를 제기하는 팀 |
| `reason` | string | Y | 10~1000자 | 이의 사유 |
| `expectedAmount` | integer | N | 0 이상, KRWS 정수 | 팀이 주장하는 정산액(참고용) |

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
{ "code": "SUCCESS", "data": { "disputeId": 41, "performanceId": 12, "teamId": 11, "status": "OPEN", "createdAt": "2026-09-21T09:12:00+09:00", "releaseHeld": true }, "msg": "이의제기가 접수되었습니다. 관리자 검토 후 정산이 재개됩니다." }
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 사유 길이 위반 |
| 403 | `COMMON_FORBIDDEN` | 해당 팀 리더가 아님 |
| 403 | `SETTLEMENT_NOT_PARTICIPANT` | 참여팀이 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 409 | `SETTLEMENT_NOT_LOCKED` | 아직 잠금 전이라 이의 대상이 없음 |
| 409 | `SETTLEMENT_ALREADY_RELEASED` | 이미 release 완료 |
| 409 | `COMMON_CONFLICT` | 이의제기 기간 종료, 같은 팀의 열린 이의 존재 (전용 코드는 §18.1) |

---

### API-settlement-05 release 실행 **[v4 변경 — 리더 지갑 push + 보증금 반환]**
`POST /api/v1/performances/{performanceId}/settlement/release` · 권한: 생성자·ADMIN(자동 스케줄 병행) · 우선: P0 · 연관 화면: `P-08 정산 대시보드` · 연관 기능: `F-settlement-05 정산 release 실행`

## 요구사항
- 이의제기 48시간이 지나면 **자동 스케줄이 실행**하고 이 API는 같은 동작의 수동 트리거다 [권] P-9. 기간 중 호출은 `SETTLEMENT_DISPUTE_PERIOD`(`msg`에 종료 시각)다. 열린 이의가 있으면 자동·수동 모두 막힌다 — 관리자가 처리(API-admin-06)해야 재개된다 [권] P-16.
- **[v4]** 운영자가 `release(showId)`를 보내고 컨트랙트가 각 팀 리더 지갑으로 KRWS를 `transfer`(push)한다. 확정 시 정산 → **`RELEASED`(종단)**, `settlement_share.released=true`·`released_at` 기록, `settlement.release_tx_hash` 기록.
- **[v4] 원화 이체·burn은 이 API가 하지 않는다.** release 확정 후 **리더에게 알림**을 보내고 P-09 배지를 띄우면, 리더가 "원화로 받기"를 눌러 §14 흐름을 시작한다(P-10 개정 — 자동 push 이체 불가). 그래서 **정산 계좌 미등록이 release를 막지 않는다** — v3의 `REDEEM_ACCOUNT_NOT_REGISTERED` 사전 검사가 없어졌다.
- **[v4] release 확정 직후 보증금을 반환**한다 — 같은 job 체인에서 `returnDeposit(showId)`를 보내 생성팀 리더 지갑으로 되돌리고 `deposit_status=RETURNED`로 만든다(P-21).
- 팀별 부분 성공을 허용한다. 실패 건은 `results`에 `retryable`로 표시하고 시스템 자동 재시도 대상이 된다(REL-05).
- `Idempotency-Key`가 필수다 — 이중 release는 준비금·정산 정합을 깨뜨린다. 준비금 1:1이 깨진 상태에서는 실행하지 않는다(`COIN_RESERVE_MISMATCH`, P-11).
- **불변식**: Σ`Released` = 잠긴 규칙 × 카운터로 재계산한 분배액 합(dust 포함, 1원도 다르지 않아야 한다). 확정 후 검증 페이지(API-verify-01)가 이 값을 대사한다(결정 §3.8 #3).

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Idempotency-Key: {UUIDv4}` **필수**

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
1. 권한·멱등키 확인 → 정산 상태(`LOCKED`/`DISPUTE_OPEN`)·이의제기 기간 종료·열린 이의 없음·에스크로 잔액 ≥ 분배 합계·준비금 상태 확인.
2. 상태 전이: tx 확정 시 `LOCKED`/`DISPUTE_OPEN` → `RELEASED`(종단), `settlement_share.released`·`wallet_address` 기록, `deposit_status` → `RETURNED`.
3. 외부 호출(202, 전부 OPERATOR): ① `release(showId)` → 팀 리더 지갑들로 KRWS push, `Released` 이벤트 ② `returnDeposit(showId)` → 생성팀 리더 지갑. 실패는 3회 재시도 후 연장 재시도, 결정적 실패만 운영자 알림.
4. `settlement`·`settlement_share`·`performance`·`chain_job` 저장 + **팀 리더 알림(정산금 도착 → "원화로 받기")** + 감사 로그(`action_type=RELEASE`, SEC-11).

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": {
    "jobId": "chain_01J9F7P8Q9",
    "status": "PENDING",
    "signerType": "OPERATOR",
    "pollAfterMs": 2500,
    "performanceId": 12,
    "settlementId": 91,
    "nextStatus": "RELEASED",
    "targetTeamCount": 3,
    "totalAmount": 1525000,
    "currency": "KRW",
    "depositReturnPlanned": true,
    "depositAmount": 50000,
    "payoutNotice": "release 확정 후 각 팀 리더가 '원화로 받기'를 눌러 출금을 시작합니다."
  },
  "msg": "정산 실행을 접수했습니다."
}
```

부분 성공은 API-chain-01 응답의 `results`로 확인한다.

```json
{
  "code": "SUCCESS",
  "data": {
    "settlementId": 91,
    "results": [
      { "teamId": 7, "walletAddress": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b", "amount": 743441, "status": "RELEASED", "txHash": "0x9c1a4b7e2d5f8039ab6c4e1d2f3a5b7c9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6" },
      { "teamId": 9, "walletAddress": "0x3c8a1f2b4d6e8091a2b3c4d5e6f708192a3b4c5d", "amount": 474656, "status": "FAILED", "reason": "CHAIN_NONCE_CONFLICT", "retryable": true }
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
| 409 | `COIN_ESCROW_INSUFFICIENT` | 에스크로 잔액 < 분배 합계(대사 점검 대상) |
| 409 | `COIN_RESERVE_MISMATCH` | 준비금 1:1 불일치로 release 중단 상태 |
| 409 | `COMMON_CONFLICT` | 같은 멱등키에 다른 본문, release 작업 진행 중 |
| 500 | `CHAIN_GAS_INSUFFICIENT` | 운영지갑 가스 부족 |
| 504 | `CHAIN_TX_TIMEOUT` | 확정 지연 — `jobId`로 계속 폴링 |

> **v4에서 사라진 에러**: `REDEEM_ACCOUNT_NOT_REGISTERED`(release 사전 검사)는 이 API에서 빠졌다 — 계좌는 §14 출금 시작 시점에 필요하다. 대신 API-settlement-01의 `myTeam.nextAction=REGISTER_ACCOUNT`로 유도한다.

---

### API-settlement-06 정산 공유 링크 생성
`POST /api/v1/performances/{performanceId}/settlement/share-link` · 권한: 생성자(리더) · 우선: P0 · 연관 화면: `P-08 정산 대시보드` · 연관 기능: `F-settlement-06 정산 공유 링크 생성`

## 요구사항
- 팀 리더가 정산 내역을 밴드 멤버에게 보여줄 공개 링크를 만든다. `settlement.share_token`을 발급해 `/public/settlement/{shareToken}`으로 로그인 없이 조회할 수 있게 한다. **[v4]** 팀원 소속 개념이 없으므로(§2) 이 링크가 밴드 멤버 공유의 유일한 경로다.
- 재발급하면 기존 토큰이 무효화된다. 정산이 `AGGREGATED` 이상이어야 의미 있는 데이터가 있고, `NONE`에서는 `PERFORMANCE_INVALID_STATUS`로 막는다.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
없음.

### 시스템 처리
1. 생성자 권한 확인 → 정산 상태(`AGGREGATED` 이상) 확인. 2. 상태 전이: `settlement.share_token` 발급·갱신(기존 무효화). 3. 외부 호출 없음. 4. `settlement` 갱신 + 감사 로그.

## Response
### 201 Created
```json
{
  "code": "SUCCESS",
  "data": { "performanceId": 12, "shareUrl": "https://b204.ssafy.io/settlement/share/stl_9f2c1a7b4e8d", "shareToken": "stl_9f2c1a7b4e8d", "issuedAt": "2026-09-22T18:30:00+09:00" },
  "msg": "공유 링크가 생성되었습니다. 밴드 멤버에게 전달해 주세요."
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 409 | `PERFORMANCE_INVALID_STATUS` | 정산이 아직 `NONE` |

---

### API-settlement-07 정산 공유 링크 조회 (공개)
`GET /api/v1/public/settlement/{shareToken}` · 권한: GUEST(인증 불필요) · 우선: P0 · 연관 화면: — · 연관 기능: `F-settlement-07 정산 내역 공개 조회`

## 요구사항
- `share_token`으로 정산 내역(팀별 분배액·선택 수·상태)을 로그인 없이 조회한다. 관객 개인정보는 담지 않고 팀 단위 집계만 준다.
- **[v4]** `settlementStatus`는 `RELEASED`가 종단이다(`REDEEMED` 삭제). 팀별 원화 출금 진행 여부는 담지 않는다 — 계좌·이체 정보이므로 리더만 볼 수 있다(§14).
- **[v4]** 금액은 KRWS 정수 + 축약 환율이며, "테스트넷 시연 정산" 고지를 `Accept-Language`에 맞춰 담는다.
- 토큰이 무효화됐거나 없으면 `404 COMMON_NOT_FOUND`다.

## Request
### Headers
- `Accept: application/json` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `shareToken` | path | string | Y | 정산 공유 토큰 |

### Body
없음.

### 시스템 처리
1. 토큰 존재·유효성 확인. 2. 상태 전이 없음(조회). 3. 외부 호출 없음. 4. `settlement` + `settlement_share` + `performance` 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "performanceTitle": "합정 3밴드 합동공연",
    "performedAt": "2026-09-19T19:00:00+09:00",
    "settlementStatus": "RELEASED",
    "rate": { "currency": "USD", "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "currency": "KRW",
    "grossRevenueAmount": 1600000,
    "refundedAmount": 75000,
    "netRevenueAmount": 1525000,
    "fixedRatioBp": 6000,
    "selectionRatioBp": 4000,
    "shares": [
      { "teamName": "블루노트", "fixedAmount": 457500, "choiceAmount": 285937, "dustAmount": 4, "totalAmount": 743441, "choiceCount": 30, "released": true },
      { "teamName": "새벽세시", "fixedAmount": 274500, "choiceAmount": 200156, "dustAmount": 0, "totalAmount": 474656, "choiceCount": 21, "released": true },
      { "teamName": "노이즈캔슬", "fixedAmount": 183000, "choiceAmount": 123903, "dustAmount": 0, "totalAmount": 306903, "choiceCount": 13, "released": true }
    ],
    "releaseTxHash": "0x9c1a4b7e2d5f8039ab6c4e1d2f3a5b7c9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6",
    "explorerUrl": "https://kairos.kaiascan.io/tx/0x9c1a4b7e2d5f8039ab6c4e1d2f3a5b7c9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6",
    "simulationNotice": "테스트넷 시연 정산입니다. 실제 자금이 아닙니다."
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 404 | `COMMON_NOT_FOUND` | 존재하지 않거나 무효화된 토큰 |

---

## 14. withdraw — 출금 **[v4 개명 — 구 `redeem` 환급]**

**[v4] v3의 "release 시 자동 push 환급"은 불가능해졌다.** 팀 지갑이 리더의 비수탁 지갑이므로 서버가 그 잔액을 옮길 수 없다. 대신 **리더가 "원화로 받기"를 눌러 서명**한다(P-10 개정·결정 §3.6).

```
release 확정 → 리더 지갑 KRWS
  → ① POST /teams/{teamId}/withdrawals            (금액·계좌 지정 → 서명 파라미터)
  → ② ✍️ KRWS.transfer(상환 금고, amount)          (리더 서명)
  → ③ POST .../withdrawals/{withdrawalId}/signed-tx (txHash 보고 → receipt 검증 → TRANSFERRING)
  → ④ 🏦 금융망 원화 이체                            (서버, TRANSFERRED)
  → ⑤ 🔗 KRWS.burn(amount, withdrawalRef)          (BURNER = 상환 금고, COMPLETED)
```

**순서 불변식(v3 원칙 5 유지)**: **④ 이체 성공 확인 후에만 ⑤ burn**한다. 반대로 하면 이체 실패 시 토큰만 사라져 준비금 공시가 깨진다. ④가 실패하면 운영자가 **금고 → 리더 지갑으로 되돌리고**(`TREASURY_RETURN`) 상태를 `RETURNED`로 만든다.

CoinWithdrawal 상태(결정 §7): `AWAITING_SIGNATURE → TRANSFERRING → TRANSFERRED → BURNING → COMPLETED` / `FAILED` / `RETURNED`. `kind`는 `BANK_TRANSFER` 하나이며 `CARD_CANCEL`(P1)·`ONCHAIN`(P2)은 enum 예약값이다. 최소 출금 **1,000 KRWS**, 수수료 **0**이다(P-20). 팀 출금은 **원화 금융망 이체만** 지원한다 — 온체인 출금·USDC 역교환은 P2다. **관객 출금 화면은 없다**(P-20 — 관객 잔액은 유지되며 카드 취소·원화 출금은 P1).

### API-withdraw-01 팀 출금 시작 **[v4 신설]**
`POST /api/v1/teams/{teamId}/withdrawals` · 권한: 리더 · 우선: P0 · 연관 화면: `P-09 팀 출금` · 연관 기능: `F-withdraw-01 팀 원화 출금 시작(서명 파라미터)`

## 요구사항
- 리더가 출금 금액과 정산 계좌를 정하면 `coin_withdrawal`을 만들고 **`KRWS.transfer(상환 금고, amount)` 서명 파라미터**를 준다(§0.4). 전액 또는 일부를 고를 수 있다.
- **선행 조건**: ① 요청자가 팀 리더 ② 팀에 **검증된 정산 계좌**가 있음(없으면 `REDEEM_ACCOUNT_NOT_REGISTERED` 409 — 화면은 P-02 계좌 등록으로 보낸다) ③ 리더 지갑 KRWS 잔액 ≥ `amount` ④ `amount` ≥ 1,000 ⑤ 진행 중인 미완료 출금이 없음(팀당 동시 1건 [권], 위반은 `REDEEM_ALREADY_REQUESTED` 409).
- 잔액이 0이면 `REDEEM_NOTHING_TO_REDEEM`(409)이다.
- **수신 주소는 서버가 정한다** — 상환 금고 주소(`treasuryAddress`)이며 요청으로 지정할 수 없다. 임의 주소로 보내는 경로를 만들지 않는다(온체인 출금은 P2).
- `signRequests`는 1건(`TREASURY_IN`)이다. **`approve`가 필요 없다** — 컨트랙트 호출이 아니라 사용자가 직접 `transfer`를 실행하는 표준 ERC-20 전송이기 때문이다. `summary`에는 금액·수신처("Platform redemption vault")·입금 계좌 마스킹을 담아 리더가 무엇에 서명하는지 읽게 한다.
- `Idempotency-Key`가 필수다. 이 키의 해시가 온체인 `burn(..., bytes32 withdrawalRef)`의 `withdrawalRef`가 된다(§0.8).
- 이 API는 코인을 옮기지 않는다. 실제 이동은 리더 서명이며 상태 전이는 API-withdraw-02가 한다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language` · `Idempotency-Key: {UUIDv4}` **필수**

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `teamId` | path | integer(BIGINT) | Y | 팀 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `amount` | integer | Y | 1,000 이상, 보유 잔액 이하, KRWS 정수 | 출금할 금액 |
| `bankAccountId` | integer | Y | 팀의 검증된 `bank_account` | 입금받을 계좌 |
| `settlementId` | integer | N | 해당 팀이 참여한 정산 | 대상 정산(선택). 잔액 통합 출금이면 생략 |

```json
{ "amount": 474656, "bankAccountId": 2201, "settlementId": 91 }
```

### 시스템 처리
1. 멱등키 확인 → 리더 권한 확인 → `bank_account`가 팀 소유·`holder_verified=true` 확인 → 리더 지갑 `LINKED` 확인 → `KRWS.balanceOf` 조회로 잔액 확인 → 최소 금액·동시 진행 건 확인.
2. 상태 전이: `coin_withdrawal` 생성(`kind=BANK_TRANSFER`, `status=AWAITING_SIGNATURE`, `idempotency_key`).
3. 외부 호출: 잔액·가스 조회(서명 직전 값), 필요 시 KAIA 충전 job.
4. calldata 생성(`transfer(treasuryAddress, amount)`) + 발의 기록 + 감사 로그(`action_type=WITHDRAW`).

## Response
### 201 Created
```json
{
  "code": "SUCCESS",
  "data": {
    "withdrawalId": 6601,
    "teamId": 9,
    "settlementId": 91,
    "kind": "BANK_TRANSFER",
    "status": "AWAITING_SIGNATURE",
    "amount": 474656,
    "currency": "KRW",
    "display": { "currency": "USD", "approx": 351.60, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "feeAmount": 0,
    "bankAccount": { "bankName": "국민", "accountNoMasked": "****3311", "holderName": "블루노트" },
    "treasuryAddress": "0xb2c3d4e5f60718293a4b5c6d7e8f901234567890",
    "signRequests": [
      {
        "kind": "TREASURY_IN",
        "required": true,
        "to": "0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736",
        "data": "0xa9059cbb000000000000000000000000b2c3d4e5f60718293a4b5c6d7e8f9012345678900000000000000000000000000000000000000000000000000000000000073ea0",
        "value": "0x0",
        "chainId": "0x3e9",
        "gas": "0x11170",
        "summary": { "title": "원화로 받기 · ₩474,656", "amount": 474656, "currency": "KRW", "recipient": "Platform redemption vault", "recipientAddress": "0xb2c3d4e5f60718293a4b5c6d7e8f901234567890", "payoutTo": "국민 ****3311 (블루노트)" }
      }
    ],
    "gasStatus": { "sufficient": true, "fundingJobId": null },
    "expiresAt": "2026-09-22T19:00:00+09:00",
    "requestedAt": "2026-09-22T18:40:00+09:00"
  },
  "msg": "지갑에서 확인하면 원화 이체가 시작됩니다."
}
```

### 4xx/5xx
```json
{ "code": "REDEEM_ACCOUNT_NOT_REGISTERED", "data": null, "msg": "환급받을 계좌를 먼저 등록해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `amount` < 1,000 또는 소수, `Idempotency-Key` 헤더 없음 (전용 코드 `WITHDRAW_MIN_AMOUNT`는 §18.1) |
| 403 | `COMMON_FORBIDDEN` | 해당 팀 리더가 아님 |
| 404 | `TEAM_NOT_FOUND` | 존재하지 않는 `teamId` |
| 404 | `COMMON_NOT_FOUND` | `bankAccountId`가 이 팀 소유가 아님, `settlementId`가 이 팀의 정산이 아님 |
| 404 | `WALLET_NOT_FOUND` | 리더 지갑 미연결 |
| 409 | `REDEEM_ACCOUNT_NOT_REGISTERED` | 정산 계좌 미등록 또는 예금주 미검증 (개명 후보 `WITHDRAW_ACCOUNT_NOT_REGISTERED`는 §18.1) |
| 409 | `REDEEM_NOTHING_TO_REDEEM` | 리더 지갑 KRWS 잔액 0 (개명 후보 `WITHDRAW_NOTHING_TO_WITHDRAW`는 §18.1) |
| 409 | `REDEEM_ALREADY_REQUESTED` | 진행 중인 미완료 출금이 이미 있음 (개명 후보 `WITHDRAW_ALREADY_REQUESTED`는 §18.1) |
| 409 | `PAYMENT_INSUFFICIENT_BALANCE` | 잔액 < 요청 `amount` |
| 409 | `COMMON_CONFLICT` | 같은 멱등키에 다른 본문 |
| 409 | `WALLET_GAS_INSUFFICIENT` | 가스 충전 job이 실패해 서명을 진행할 수 없음 |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | 잔액 조회 실패로 서명 파라미터를 만들 수 없음 |

---

### API-withdraw-02 출금 예치 tx 해시 보고 **[v4 신설]**
`POST /api/v1/teams/{teamId}/withdrawals/{withdrawalId}/signed-tx` · 권한: 리더 · 우선: P0 · 연관 화면: `P-09 팀 출금` · 연관 기능: `F-withdraw-02 출금 예치 tx 보고 → 이체 → burn`

## 요구사항
- 리더가 서명·전송한 `KRWS.transfer(상환 금고, amount)` tx 해시를 보고한다. `202` + `jobId`(`signerType=USER`)를 주고 receipt를 검증한 뒤 **금융망 원화 이체 → burn** 체인을 이어 실행한다.
- 검증 항목(§0.4): receipt `status=1` · `to == tokenAddress`(KRWS 컨트랙트) · `from == 리더 지갑` · 로그에 **`Transfer(from=리더, to=treasuryAddress, value=amount)`** 존재 · `value == coin_withdrawal.amount`. 특히 **수신 주소가 상환 금고인지**를 반드시 확인한다 — 다른 주소로 보낸 tx를 출금으로 인정하면 이중 지급이 된다. 불일치는 `PAYMENT_AMOUNT_MISMATCH`(409)이고 상태를 바꾸지 않는다.
- 상태 전이: 보고 즉시 `AWAITING_SIGNATURE` → **`TRANSFERRING`**(금고 예치 확정 대기) → receipt 확정 후 🏦 원화 이체 성공 시 → **`TRANSFERRED`** → burn job 제출 시 `BURNING` → burn 확정 시 → **`COMPLETED`**.
- **이체 실패 보상**: 원화 이체가 최종 실패하면 **burn하지 않고** 운영자가 `TREASURY_RETURN`(금고 → 리더 지갑 `transfer`)으로 되돌린 뒤 `RETURNED`로 만든다. 리더 잔액이 복구되므로 손실이 없다. 이체는 3회 재시도 후 연장 재시도하며 결정적 실패(계좌 오류 등)만 `RETURNED`로 넘어간다.
- **순서 불변식**: `TRANSFERRED` 확인 없이 burn job을 만들지 않는다. burn 대상은 **상환 금고가 보유한 잔액**이며 BURNER 키로 실행한다(결정 §2.2).
- 같은 `txHash` 재보고는 최초 `jobId`를 재생한다. 서명 거부는 이 API를 호출하지 않는 것으로 표현되고 `coin_withdrawal`은 `AWAITING_SIGNATURE`로 남는다(만료 후 `FAILED`).
- 진행 단계는 API-chain-01 또는 API-withdraw-03으로 확인한다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `teamId` | path | integer(BIGINT) | Y | 팀 PK |
| `withdrawalId` | path | integer(BIGINT) | Y | 출금 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `txHash` | string | Y | `0x` + 64 hex(66자) | 지갑이 반환한 `transfer` tx 해시 |

```json
{ "txHash": "0xa1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90" }
```

### 시스템 처리
1. 리더 권한·출금 소유(팀) 확인 → `status=AWAITING_SIGNATURE` 확인 → `txHash` 형식·중복 보고 확인.
2. 상태 전이: `chain_job` 생성(`tx_type=TREASURY_IN`, `signer_type=USER`, `SUBMITTED`) → `coin_withdrawal` → `TRANSFERRING`.
3. 외부 호출(202, 순차): ① receipt 폴링 → `Transfer(→ 금고)` 검증 ② 🏦 금융망 원화 이체(멱등키 = `coin_withdrawal.idempotency_key`) → 성공 시 `TRANSFERRED`·`bank_tx_id` ③ `chain_job`(`tx_type=BURN`, `signer_type=OPERATOR`, BURNER 키) `burn(amount, withdrawalRef)` → `BURNING` → 확정 시 `COMPLETED`. ②실패 시 `chain_job`(`TREASURY_RETURN`, OPERATOR) → `RETURNED`.
4. `coin_withdrawal`·`chain_job`·`settlement_share.withdrawn_amount` 갱신 + 감사 로그(`WITHDRAW`·`BURN`).

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": {
    "jobId": "chain_01J9GF0G1H",
    "status": "SUBMITTED",
    "signerType": "USER",
    "pollAfterMs": 1500,
    "withdrawalId": 6601,
    "withdrawalStatus": "TRANSFERRING",
    "amount": 474656,
    "currency": "KRW",
    "txHash": "0xa1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
    "explorerUrl": "https://kairos.kaiascan.io/tx/0xa1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
    "expectedEvent": "Transfer",
    "steps": [
      { "step": "TREASURY_IN", "status": "SUBMITTED" },
      { "step": "BANK_TRANSFER", "status": "PENDING" },
      { "step": "BURN", "status": "PENDING" }
    ]
  },
  "msg": "예치를 확인하고 원화 이체를 진행합니다."
}
```

`steps`는 P-09 화면의 단계 표시(예치 → 이체 → 완료)에 그대로 쓴다.

### 4xx/5xx
```json
{ "code": "PAYMENT_AMOUNT_MISMATCH", "data": null, "msg": "트랜잭션 내용이 요청과 일치하지 않습니다. 처음부터 다시 시도해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `txHash` 형식 위반 |
| 403 | `COMMON_FORBIDDEN` | 해당 팀 리더가 아님 |
| 404 | `TEAM_NOT_FOUND` | 존재하지 않는 `teamId` |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 `withdrawalId` 또는 이 팀 소유가 아님 |
| 409 | `COMMON_CONFLICT` | `status`가 `AWAITING_SIGNATURE`가 아님, 같은 `txHash`가 다른 출금으로 보고됨 |
| 409 | `PAYMENT_AMOUNT_MISMATCH` | receipt·`Transfer` 이벤트 검증 실패(`to`가 상환 금고가 아님, `value` 불일치 등) (전용 코드 `PAYMENT_TX_MISMATCH`는 §18.1) |
| 500 | `COIN_BURN_FAILED` | 이체 성공 후 burn 최종 실패 — 이체는 되돌리지 않고 재시도 대기(대사 대상, 운영자 알림) |
| 502 | `REDEEM_BANK_TRANSFER_FAILED` | 금융망 원화 이체 실패 — burn 미실행, 금고 → 리더 반환(`RETURNED`) 예약 (개명 후보 `WITHDRAW_BANK_TRANSFER_FAILED`는 §18.1) |
| 504 | `CHAIN_TX_TIMEOUT` | 예치 tx 확정이 120초를 넘김 — `jobId`로 계속 폴링 |

---

### API-withdraw-03 팀 출금 이력 **[v4 개명 — 구 API-redeem-01]**
`GET /api/v1/teams/{teamId}/withdrawals` · 권한: 리더 · 우선: P0 · 연관 화면: `P-09 팀 출금` · 연관 기능: `F-withdraw-03 출금 이력 조회`

## 요구사항
- **v3 API-redeem-01 `GET /api/v1/teams/{teamId}/redemptions`의 개명·재설계본**이다. 팀의 원화 출금 이력을 최신순으로 준다 — 금액, 상태(7단계), **예치 tx 해시**, 금융망 이체 ID, **burn tx 해시**, 익스플로러 링크, 실패 사유.
- **[v4]** 각 행에 `steps`(예치·이체·burn 3단계 상태)를 담아 P-09가 진행 막대를 그리게 한다. `AWAITING_SIGNATURE`인 건은 `resumable: true`로 표시해 서명을 이어갈 수 있게 한다.
- 실패 건은 `retryable`로 표시하되 **재시도 버튼은 두지 않는다** — 시스템이 자동 재시도한다. `RETURNED`(이체 실패로 되돌림) 건에는 "잔액으로 복구되었습니다" 안내를 붙인다 [권].
- 응답 상단에 **현재 출금 가능 잔액**(`availableAmount` = 리더 지갑 KRWS)과 계좌 등록 상태를 담아 P-09 진입 1회 호출로 화면이 그려지게 한다.
- 리더만 조회한다 — 계좌·이체 정보가 포함되기 때문이다(SEC-03).

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `teamId` | path | integer(BIGINT) | Y | 팀 PK |
| `status` | query | string | N | `AWAITING_SIGNATURE`/`TRANSFERRING`/`TRANSFERRED`/`BURNING`/`COMPLETED`/`FAILED`/`RETURNED` |
| `page`·`size`·`sort` | query | — | N | §0.2. `sort`는 `requestedAt,desc`(기본)/`requestedAt,asc` |

### Body
없음.

### 시스템 처리
1. 팀 존재·리더 권한 확인 → 쿼리 화이트리스트 검증.
2. 상태 전이 없음(조회).
3. 외부 호출: 리더 지갑 `KRWS.balanceOf` 조회(10초 캐시)로 `availableAmount` 산출. 실패 시 캐시값 + `balanceStale: true`.
4. `coin_withdrawal` + `chain_job` + `bank_account` 조회 후 `items`/`pageInfo`.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "teamId": 9,
    "rate": { "currency": "USD", "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "currency": "KRW",
    "availableAmount": 0,
    "walletAddress": "0x3c8a1f2b4d6e8091a2b3c4d5e6f708192a3b4c5d",
    "settlementAccount": { "registered": true, "bankName": "국민", "accountNoMasked": "****3311", "holderVerified": true },
    "minWithdrawAmount": 1000,
    "feeAmount": 0,
    "balanceStale": false,
    "items": [
      {
        "withdrawalId": 6601,
        "kind": "BANK_TRANSFER",
        "settlementId": 91,
        "performanceTitle": "합정 3밴드 합동공연",
        "amount": 474656,
        "status": "COMPLETED",
        "accountNoMasked": "****3311",
        "treasuryInTxHash": "0xa1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
        "bankTransferId": "FIN-8822",
        "burnTxHash": "0x2c4e6a8091b3d5f70192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8",
        "explorerUrls": {
          "treasuryIn": "https://kairos.kaiascan.io/tx/0xa1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
          "burn": "https://kairos.kaiascan.io/tx/0x2c4e6a8091b3d5f70192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8"
        },
        "steps": [
          { "step": "TREASURY_IN", "status": "CONFIRMED" },
          { "step": "BANK_TRANSFER", "status": "CONFIRMED" },
          { "step": "BURN", "status": "CONFIRMED" }
        ],
        "resumable": false,
        "retryable": false,
        "failureReason": null,
        "requestedAt": "2026-09-22T18:40:00+09:00",
        "completedAt": "2026-09-22T18:41:20+09:00"
      }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 1, "hasNext": false }
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `status`·`sort`, `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `COMMON_FORBIDDEN` | 해당 팀 리더가 아님 |
| 404 | `TEAM_NOT_FOUND` | 존재하지 않는 `teamId` |

---

> **API-withdraw-04 `POST /api/v1/admin/withdrawals/{withdrawalId}/retry`(이체·burn 재시도)는 [v4 P1]이다** — v3 API-redeem-02 `POST /api/v1/admin/redemptions/{redemptionId}/retry`의 개명본이며 우선순위는 P1 그대로다(결정 §9 "개명(P1)"). MVP의 처리 방식은 다음과 같다.
>
> - **금융망 이체 실패**(`REDEEM_BANK_TRANSFER_FAILED`)는 큐에서 3회 재시도한 뒤 지수 백오프로 연장 재시도한다(REL-09). 결정적 실패는 **금고 → 리더 반환**(`TREASURY_RETURN`)으로 마무리해 `RETURNED`가 되고, 리더는 잔액을 되찾아 계좌를 고친 뒤 다시 출금하면 된다.
> - **burn 실패**(`COIN_BURN_FAILED`)는 이체가 이미 성공한 상태이므로 **되돌리지 않고 burn만 재개**한다. 그동안 준비금 공시에는 유통량 초과가 잠깐 남으므로 대사 알림이 뜬다.
> - **순서 불변식은 재시도에서도 같다** — 이체 성공 확인 → burn.
> - 출금 상태는 API-withdraw-03으로 팀이 직접 확인한다. 이 경로는 P0다.
>
> **v3 API-redeem-01·02는 [v4 삭제]**되어 위 `withdraw` 경로로 완전히 대체됐다. `redemption` 테이블도 `coin_withdrawal`로 교체됐다(결정 §8).

---

## 15. verify — 공개 검증

정산 검증 데이터(API-verify-01)는 **참여팀 전용**(로그인 필수)이고, **준비금 공시(API-verify-02)만 공개**다. 브라우저가 서버 표시값을 믿지 않고 **독립적으로 재계산**할 수 있도록 원자료를 전부 담는 목적은 v3와 같다(PERF-07 재계산 ≤ 2초).

보장 범위는 정직하게 표기한다 — 잠긴 규칙의 사후 변조 불가·기록의 소급 수정 불가·계산의 결정론적 재현·참여팀의 독립 검증 경로이며, **입력 데이터(선택·매출)의 진실성은 보장하지 않는다.** 탈중앙을 주장하지도 않는다 — 정산 흐름은 운영자가 발의·실행한다.

**[v4] 검증 대상이 넓어졌다.** 결제가 온체인이 되면서 검증 페이지가 대사할 불변식이 4개로 늘었다(결정 §3.8).

| # | 불변식 | 담기는 곳 |
|---|---|---|
| 1 | `token.totalSupply` = Σ(충전 mint) − Σ(팀 출금 burn) | API-verify-02 `supplyReconciliation` |
| 2 | `escrowOf(showId)` = Σ(purchase) − Σ(refund) − Σ(release) (+ 보증금 별도) | API-verify-01 `escrowReconciliation` |
| 3 | Σ`Released` = 잠긴 규칙 × 카운터 재계산 합 (dust 포함, 1원도 다르지 않아야 한다) | API-verify-01 `recalculationInput` + `releaseReconciliation` |
| 4 | 금융망 원화 예치 ≥ `totalSupply` | API-verify-02 `reserveMatched` |

### API-verify-01 정산 검증 데이터 **[v4 변경]**
`GET /api/v1/performances/{performanceId}/verification` · 권한: **PERFORMER(참여팀, 로그인 필수)** · 우선: P0 · 연관 화면: `V-01 정산 검증` · 연관 기능: `F-verify-01 정산 검증 데이터 조회` · `F-verify-03 정산 재계산 검증`

## 요구사항
- 컨트랙트 주소(**[v4] `tokenAddress` 추가**)·잠긴 규칙(원문 + 해시)·**팀별 리더 지갑 주소**·팀별 동의 tx·온체인 선택 카운터·**[v4] 에스크로 잔액**·팀별 산출액·`Released` 이벤트·release tx와 **재계산에 필요한 원자료**를 한 응답에 담는다.
- 재계산 입력은 `recalculationInput`으로 모아 준다 — 총 매출·환불액·순매출, 2단계 bp(`fixedRatioBp`·`selectionRatioBp`)와 팀별 `teamShareBp`, 팀별 온체인 카운터, 참여팀 수, 버림 규칙, dust 귀속 규칙(공연 생성 팀), `tokenDecimals=0`. **이 값들만으로 `shares`가 재현되어야 한다.**
- **[v4] 대사 3종을 담는다** — ① `escrowReconciliation`(불변식 2) ② `releaseReconciliation`(불변식 3: `Released` 이벤트 합 vs 재계산 합) ③ `depositReconciliation`(보증금 납부·반환 tx). v3의 "온체인 vs 금융망 이체" 대사는 **팀 원화 출금 구간으로 옮겨졌고**(계좌 정보라 이 응답에 담지 않는다) 대신 `withdrawSummary`로 팀별 출금 누적액만 표기한다.
- 개인정보는 담지 않는다 — 관객·주문·티켓 식별자와 **관객 지갑 주소**를 노출하지 않고 팀 단위 집계만 준다. 팀 리더 지갑 주소는 정산 수령 주소라 노출한다(§0.7).
- 참여팀 전용이지만 재조회가 잦으므로 **60초 캐시**한다 [권](공연 단위 캐시). `DRAFT`·`PENDING_AGREEMENT`는 검증 대상이 아니다. 노드 장애 시 마지막 인덱싱 값과 `stale: true`.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
없음.

### 시스템 처리
1. 공연 존재·검증 대상 상태(`ON_SALE` 이상) 확인 → **참여팀 소속 확인** → 캐시(60초) 확인.
2. 상태 전이 없음(조회).
3. 외부 호출: 인덱싱된 온체인 이벤트·`escrowOf`·`choiceCountOf`·`rulesHashOf`·`agreedOf` view를 사용하고, 캐시 미스 시에만 노드를 조회한다(PERF-07).
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
    "settlementStatus": "RELEASED",
    "network": "kaia-kairos",
    "chainId": 1001,
    "contracts": {
      "tokenAddress": "0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736",
      "tokenSymbol": "KRWS",
      "tokenDecimals": 0,
      "revenueSplitter": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
      "explorerBaseUrl": "https://kairos.kaiascan.io"
    },
    "lockedRule": {
      "rulesHash": "0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f",
      "raw": { "performanceId": 12, "fixedRatioBp": 6000, "selectionRatioBp": 4000, "teamShares": [{"teamId":7,"shareBp":5000},{"teamId":9,"shareBp":3000},{"teamId":11,"shareBp":2000}], "hostTeamId": 7 },
      "onchainRulesHash": "0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f",
      "hashMatched": true,
      "lockedAt": "2026-09-03T11:00:00+09:00",
      "startSaleTxHash": "0x8f2e1d0c9b8a70695847362514039281a0b1c2d3e4f5061728394a5b6c7d8e9f"
    },
    "agreements": [
      { "teamId": 7, "teamName": "블루노트", "walletAddress": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b", "onchainAgreed": true, "signerType": "USER", "txHash": "0x1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f901", "agreedAt": "2026-09-03T10:02:00+09:00" },
      { "teamId": 9, "teamName": "새벽세시", "walletAddress": "0x3c8a1f2b4d6e8091a2b3c4d5e6f708192a3b4c5d", "onchainAgreed": true, "signerType": "USER", "txHash": "0x2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90112", "agreedAt": "2026-09-03T10:20:00+09:00" },
      { "teamId": 11, "teamName": "노이즈캔슬", "walletAddress": "0x9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6f7081920", "onchainAgreed": true, "signerType": "USER", "txHash": "0x3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9011223", "agreedAt": "2026-09-03T10:41:00+09:00" }
    ],
    "onchainCounters": [
      { "teamId": 7, "teamIndex": 0, "choiceCount": 30 },
      { "teamId": 9, "teamIndex": 1, "choiceCount": 21 },
      { "teamId": 11, "teamIndex": 2, "choiceCount": 13 }
    ],
    "recalculationInput": {
      "grossRevenueAmount": 1600000,
      "refundedAmount": 75000,
      "netRevenueAmount": 1525000,
      "distributableAmount": 1525000,
      "fixedRatioBp": 6000,
      "selectionRatioBp": 4000,
      "teamShares": [{"teamId":7,"shareBp":5000},{"teamId":9,"shareBp":3000},{"teamId":11,"shareBp":2000}],
      "participantCount": 3,
      "totalChoiceCount": 64,
      "roundingRule": "FLOOR_TO_INTEGER_KRW",
      "remainderRule": "ASSIGN_DUST_TO_HOST_TEAM",
      "hostTeamId": 7,
      "dustAmount": 4,
      "tokenDecimals": 0,
      "currency": "KRW"
    },
    "shares": [
      { "teamId": 7, "teamName": "블루노트", "fixedAmount": 457500, "choiceAmount": 285937, "dustAmount": 4, "totalAmount": 743441 },
      { "teamId": 9, "teamName": "새벽세시", "fixedAmount": 274500, "choiceAmount": 200156, "dustAmount": 0, "totalAmount": 474656 },
      { "teamId": 11, "teamName": "노이즈캔슬", "fixedAmount": 183000, "choiceAmount": 123903, "dustAmount": 0, "totalAmount": 306903 }
    ],
    "escrowReconciliation": {
      "purchasedTotal": 1600000,
      "refundedTotal": 75000,
      "releasedTotal": 1525000,
      "escrowBalanceOnchain": 0,
      "expectedEscrowBalance": 0,
      "matched": true,
      "note": "escrowOf(showId) = Σpurchase − Σrefund − Σrelease"
    },
    "releaseReconciliation": {
      "releasedEventTotal": 1525000,
      "recalculatedTotal": 1525000,
      "difference": 0,
      "matched": true,
      "releasedEvents": [
        { "teamWallet": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b", "amount": 743441 },
        { "teamWallet": "0x3c8a1f2b4d6e8091a2b3c4d5e6f708192a3b4c5d", "amount": 474656 },
        { "teamWallet": "0x9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6f7081920", "amount": 306903 }
      ]
    },
    "depositReconciliation": {
      "amount": 50000,
      "status": "RETURNED",
      "paidTxHash": "0x6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5",
      "returnTxHash": "0x8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7",
      "matched": true
    },
    "withdrawSummary": [
      { "teamId": 7, "withdrawnAmount": 0 },
      { "teamId": 9, "withdrawnAmount": 474656 },
      { "teamId": 11, "withdrawnAmount": 0 }
    ],
    "releaseTx": {
      "txHash": "0x9c1a4b7e2d5f8039ab6c4e1d2f3a5b7c9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6",
      "explorerUrl": "https://kairos.kaiascan.io/tx/0x9c1a4b7e2d5f8039ab6c4e1d2f3a5b7c9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6",
      "releasedAt": "2026-09-22T18:00:30+09:00"
    },
    "guarantees": {
      "guaranteed": ["잠긴 규칙의 사후 변조 불가", "기록의 소급 수정 불가", "분배 계산의 결정론적 재현", "참여팀의 독립 검증 경로", "결제·환불·분배가 모두 같은 원장(KRWS) 위에 있음"],
      "notGuaranteed": ["입력 데이터(선택·매출)의 진실성", "탈중앙 운영 — 정산 흐름은 운영자가 발의·실행한다"]
    },
    "simulationNotice": "테스트넷에서 플랫폼이 발행한 시연용 가상 원화 코인으로 정산했습니다. 실제 자금이 아닙니다.",
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
| 401 | `COMMON_UNAUTHORIZED` | 로그인하지 않고 검증 데이터를 조회 |
| 403 | `COMMON_FORBIDDEN` | 참여팀 소속이 아닌 회원의 조회 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않거나 아직 검증 대상이 아닌 공연(`DRAFT`·`PENDING_AGREEMENT`) |
| 429 | `COMMON_TOO_MANY_REQUESTS` | 호출 한도 초과 |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | 체인 인덱스·노드 모두 사용 불가 |

---

### API-verify-02 준비금 공시 **[v4 부활]**
`GET /api/v1/public/reserve-proof` · 권한: GUEST(인증 불필요) · 우선: P0 · 연관 화면: `V-02 준비금 공시` · 연관 기능: `F-verify-02 준비금 공시 조회`

## 요구사항
- **v3에서 삭제됐다가 v4에서 부활한다** — 플랫폼이 코인을 발행하게 되면서 준비금 공시가 서사의 축이 됐다(P-11·결정 §12.2-0). **`/api/v1/public/**` 아래 공개 경로**이며 `Authorization`을 요구하지 않는다.
- **금융망 원화 예치 잔액 vs KRWS 총 유통량**, 차액, 갱신 시각, 1:1 성립 여부를 준다. 조회 주기는 ≤ 1분이며 결과를 1분 캐시하고 `refreshedAt`·`nextRefreshAt`을 담아 "언제 기준 값인지"를 표기한다.
- **[v4] 불변식 1 대사**(`supplyReconciliation`)를 담는다 — `totalSupply` = Σ(충전 mint) − Σ(팀 출금 burn). 브라우저가 mint·burn 이벤트 합으로 유통량을 재확인할 수 있다.
- 불일치가 확인되면 `reserveMatched: false`와 차액을 담고, 서버는 **mint·release를 중단**하며 운영자에게 알림을 보낸다(`COIN_RESERVE_MISMATCH`). 조회 자체는 200으로 성공시킨다 [권].
- **[v4] 발행 주체를 명시한다** — `issuer.label = "Platform (demo mint)"`, `issuer.type = "MOCK"`. 그리고 **"테스트넷에서 플랫폼이 발행한 시연용 가상 코인이며 실제 자금이 아니다"**·"잔액 조회값은 플랫폼 서버를 경유한다"는 한계를 `disclosure`로 함께 담아 발표에서 그대로 인용할 수 있게 한다(CON-03).
- 공연별 에스크로 내역도 함께 줘 합이 유통량 이하인지 브라우저가 확인할 수 있게 한다.

## Request
### Headers
- `Accept: application/json` · `Accept-Language: en` / `ko` · (인증 헤더 불필요)

### Path · Query
없음.

### Body
없음.

### 시스템 처리
1. 캐시(1분) 확인.
2. 상태 전이 없음(조회). 불일치 확인 시 mint·release 중단 플래그를 세우고 알림을 발송한다.
3. 외부 호출: `CoinIssuerPort.totalSupply()` + `CoinIssuerPort.reserve()`(금융망 예치 계좌 잔액) + 공연별 `escrowOf` + 인덱싱된 `Minted`·`Burned` 이벤트 합.
4. 캐시 갱신 후 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "reserveBalance": 4820000,
    "totalSupply": 4820000,
    "difference": 0,
    "reserveMatched": true,
    "ratio": "1:1",
    "currency": "KRW",
    "display": { "currency": "USD", "approx": 3570.37, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "issuer": { "type": "MOCK", "label": "Platform (demo mint)", "replaceable": true },
    "mintHalted": false,
    "releaseHalted": false,
    "network": "kaia-kairos",
    "chainId": 1001,
    "tokenAddress": "0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736",
    "tokenSymbol": "KRWS",
    "tokenDecimals": 0,
    "explorerUrl": "https://kairos.kaiascan.io/address/0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736",
    "reserveAccountMasked": "국민 ****9900",
    "supplyReconciliation": {
      "mintedTotal": 5290000,
      "burnedTotal": 470000,
      "expectedTotalSupply": 4820000,
      "onchainTotalSupply": 4820000,
      "matched": true,
      "note": "totalSupply = Σmint(charges) − Σburn(team withdrawals)"
    },
    "perPerformanceEscrow": [
      { "performanceId": 12, "escrowAmount": 1225000 },
      { "performanceId": 14, "escrowAmount": 3595000 }
    ],
    "refreshedAt": "2026-09-22T18:12:00+09:00",
    "nextRefreshAt": "2026-09-22T18:13:00+09:00",
    "stale": false,
    "disclosure": "This is a demo won-pegged coin issued by the platform on a testnet. No real funds are involved. Balance figures are read through the platform server.",
    "legalNotice": "Mint happens only after a confirmed won top-up; burn happens only after a confirmed won transfer to a team."
  },
  "msg": ""
}
```

### 4xx/5xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 429 | `COMMON_TOO_MANY_REQUESTS` | 호출 한도 초과 |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | 체인·금융망 조회 모두 실패하고 캐시도 없음 |

---

## 16. admin — 관리자

관리자 기능은 최소화 상태를 유지한다. 별도 운영 화면 없이 **감사 로그 적재**와 **이의제기 처리**만 P0이며, 실패한 온체인·이체 작업은 관리자 수동 재처리 대신 **시스템 자동 재시도 + 결정적 실패 알림**으로 처리한다(REL-09).

**[v4] 관리자 P0가 하나 늘었다** — **표시 환율 등록(API-coin-03 `PUT /api/v1/admin/coin/rates`, M-03)**. 준비금 불일치 경고 확인도 M-03 화면에서 하지만, 데이터는 공개 API(API-verify-02)를 그대로 쓰므로 별도 관리자 경로를 만들지 않았다. `admin` 도메인 전용 에러 코드는 여전히 없고 `COMMON_*`을 쓴다.

| v3·v4 번호 | 경로 | 이름 | v4 처리 |
|---------|------|---------|---------|
| API-admin-01 | `GET /api/v1/admin/dashboard` | 관리자 요약 | §17 P1 — 운영 대시보드 화면(`M-01`) 자체를 P1로 미룸 |
| API-admin-02 | `GET /api/v1/admin/members` | 회원 목록 | §17 P1 |
| API-admin-03 | `PATCH /api/v1/admin/members/{memberId}/status` | 회원 상태 변경 | §17 P1. **[v4]** 정지 시 refresh token 전량 폐기 + `wallet.status=SUSPENDED` 전제만 기록 |
| API-admin-04 | `GET /api/v1/admin/performances` | 공연 목록(관리) | §17 P1 |
| API-admin-05 | `GET /api/v1/admin/settlements` | 정산 목록·실패 건 | §17 P1 — 실패 건은 자동 재시도 + 알림으로 대체 |
| API-admin-07 | `GET /api/v1/admin/operator-wallet` | 운영지갑 상태 | §17 P1. **[v4]** OPERATOR·MINTER·BURNER **3개 지갑** 상태를 보여야 하므로 P1에서 응답 구조를 다시 잡는다 |
| API-admin-08 | `GET /api/v1/admin/audit-logs` | 감사 로그 | §17 P1 — **조회 화면만** P1이고 **적재는 MVP에서 그대로 한다**(SEC-11) |
| API-coin-05·06 | `GET/POST /api/v1/admin/coin/jobs…` | 온체인 작업 목록·재시도 | §17 P1 — §9 참고 |
| API-withdraw-04 | `POST /api/v1/admin/withdrawals/{withdrawalId}/retry` | 출금 재시도 | §17 P1 — §14 참고 |

**감사 로그 적재는 P1로 미루지 않는다.** **[v4]** 남기는 `action_type`은 `ADMIN_ACTION` / `OPERATOR_SIGN` / `MINT` / `BURN` / `RELEASE` / `CHARGE` / `WITHDRAW` / `RATE_CHANGE` / `WALLET_LINK` / `STATUS_CHANGE` 10종이다(결정 §7). v3의 `KEY_DECRYPT`는 **삭제**됐다 — 서버가 복호화할 사용자 키가 없다. 사용자 서명 tx는 `chain_job`(`signer_type=USER`)에 남고, 서버 키 서명은 `OPERATOR_SIGN`으로 남는다. 조회는 MVP에서 DB 직접 확인이다.

### API-admin-09 이의제기 목록
`GET /api/v1/admin/disputes` · 권한: ADMIN · 우선: P0 · 연관 화면: `M-02 이의제기 처리` · 연관 기능: `F-admin-09 이의제기 목록 조회`

## 요구사항
- 관리자가 처리 대기 중인 이의를 찾아 들어가는 진입점이다. 기본 정렬은 **미처리 우선, 오래된 순**(`status=OPEN` → `createdAt,asc`)이며 release 보류를 풀어야 하는 건이 위로 온다.
- 이의 본문·제출 팀·대상 공연·정산 상태·이의제기 마감 시각을 담아 목록에서 우선순위를 판단하게 한다. 관객 개인정보는 담지 않는다.
- **[v4]** `settlementStatus`에서 `REDEEMED`가 사라졌으므로 종단은 `RELEASED`다. 요약에 `releaseHeldCount`(release가 보류된 정산 수)를 담는다.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `status` | query | string | N | `OPEN` / `RESOLVED` / `REJECTED`. 미지정 시 전체 |
| `performanceId` | query | integer | N | 특정 공연으로 좁히기 |
| `page`·`size`·`sort` | query | — | N | §0.2. `sort`는 `createdAt`/`disputeClosesAt`, 기본 `createdAt,asc`(`OPEN` 우선) |

### Body
없음.

### 시스템 처리
1. ADMIN 권한 확인. 2. 상태 전이 없음(조회). 3. 외부 호출 없음. 4. `dispute` + `settlement` + `performance` + `team` 조인 결과를 `items`/`pageInfo`로 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "summary": { "openCount": 2, "releaseHeldCount": 1 },
    "items": [
      {
        "disputeId": 41,
        "performanceId": 12,
        "performanceTitle": "합정 3밴드 합동공연",
        "teamId": 11,
        "teamName": "노이즈캔슬",
        "status": "OPEN",
        "reason": "관객 선택 집계가 현장 카운트와 다릅니다.",
        "expectedAmount": 320000,
        "currency": "KRW",
        "settlementStatus": "DISPUTE_OPEN",
        "disputeClosesAt": "2026-09-22T18:00:00+09:00",
        "releaseHeld": true,
        "createdAt": "2026-09-21T09:12:00+09:00",
        "resolvedAt": null
      }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 2, "hasNext": false }
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `status`·`sort`, `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 403 | `COMMON_FORBIDDEN` | ADMIN이 아님 |

---

### API-admin-06 이의제기 처리
`PATCH /api/v1/admin/disputes/{disputeId}` · 권한: ADMIN · 우선: P0 · 연관 화면: `M-02 이의제기 처리` · 연관 기능: `F-admin-06 이의제기 처리`

## 요구사항
- 열린 이의를 `RESOLVED` 또는 `REJECTED`로 처리한다 [권] P-16. 처리 결과와 사유는 참여팀에게 공개된다.
- **`REJECTED`이면 release 보류가 풀려** 자동 스케줄이 재개된다. `RESOLVED`(이의 인정)이면 재집계가 필요하므로 자동 재개하지 않고 관리자가 `settlement/aggregate`부터 다시 진행한다 [권].
- 이미 처리된 이의는 다시 바꿀 수 없다(`COMMON_CONFLICT`). release가 이미 실행된 정산의 이의는 처리 대상이 아니다.
- 관리자 작업 감사 로그(`action_type=ADMIN_ACTION`)를 남긴다(SEC-11).

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

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
4. `dispute` 갱신 + 참여팀 알림 + 감사 로그(`ADMIN_ACTION`).

## Response
### 200 OK
```json
{ "code": "SUCCESS", "data": { "disputeId": 41, "performanceId": 12, "teamId": 11, "status": "REJECTED", "releaseHeld": false, "resolvedAt": "2026-09-22T17:40:00+09:00" }, "msg": "이의제기를 처리했습니다." }
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `status`, 사유 길이 위반 |
| 403 | `COMMON_FORBIDDEN` | ADMIN이 아님 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 `disputeId` |
| 409 | `COMMON_CONFLICT` | 이미 처리된 이의 |
| 409 | `SETTLEMENT_ALREADY_RELEASED` | 해당 정산이 이미 release 완료 |

---

## 17. P1·P2 예약 경로

MVP 이후 확장이다. **경로·메서드·이름만 예약**하고 상세는 v1.1 이후에 채운다. 결정 문서 §9 말미 "예약 경로" 절과 §13 컷 라인·P1/P2 목록을 그대로 옮겼다.

### 17.1 P1 예약 경로 (12개)

| 번호 | 메서드 | 경로 | 이름 | actor | 화면 | v4 비고 |
|------|--------|------|------|-------|------|---------|
| API-member-07 | PUT | `/api/v1/members/me/bank-account` | 금융망 계좌 연결(관객) | AUDIENCE | `A-15 관객 출금`(P1) | **[v4] P0 → P1.** 관객 환불이 지갑 잔액으로 가므로 MVP에 계좌가 필요 없다(P-20). 관객 원화 출금·카드 취소가 P1로 올라올 때 함께 살린다 |
| API-coin-05 | GET | `/api/v1/admin/coin/jobs` | 온체인 작업 목록 | ADMIN | `M-02` | **[v4] 번호 이동**(구 API-coin-02). 개별 작업은 API-chain-01로 폴링 |
| API-coin-06 | POST | `/api/v1/admin/coin/jobs/{jobId}/retry` | 작업 재시도 | ADMIN | `M-02` | **[v4] 번호 이동**(구 API-coin-03). 자동 재시도(3회 + 연장)로 대체. **USER job은 재시도 불가** |
| API-withdraw-04 | POST | `/api/v1/admin/withdrawals/{withdrawalId}/retry` | 출금 이체·burn 재시도 | ADMIN | `M-02` | **[v4] 개명**(구 API-redeem-02 `/admin/redemptions/{id}/retry`). 자동 재시도로 대체 |
| API-admin-01 | GET | `/api/v1/admin/dashboard` | 관리자 요약 | ADMIN | `M-01` | 운영 대시보드 화면 P1 |
| API-admin-02 | GET | `/api/v1/admin/members` | 회원 목록 | ADMIN | `M-04`(P1) | 회원 관리 화면 P1 |
| API-admin-03 | PATCH | `/api/v1/admin/members/{memberId}/status` | 회원 상태 변경 | ADMIN | `M-04`(P1) | 정지 시 refresh token 전량 폐기 + `wallet.status=SUSPENDED` |
| API-admin-04 | GET | `/api/v1/admin/performances` | 공연 목록(관리) | ADMIN | `M-04`(P1) | 공연 관리 화면 P1 |
| API-admin-05 | GET | `/api/v1/admin/settlements` | 정산 목록·실패 건 | ADMIN | `M-02` | 실패 건은 자동 재시도 + 알림으로 대체 |
| API-admin-07 | GET | `/api/v1/admin/operator-wallet` | 운영 지갑 상태 | ADMIN | `M-05`(P1) | **[v4]** OPERATOR·MINTER·BURNER **3개 지갑**의 KAIA·KRWS 잔액·nonce를 보여야 한다 |
| API-admin-08 | GET | `/api/v1/admin/audit-logs` | 감사 로그 조회 | ADMIN | `M-05`(P1) | **조회만 P1. 적재는 MVP에서 그대로 한다**(SEC-11) |
| (신설 제안) | POST | `/api/v1/wallets/me/replace` | 지갑 교체(잔액 0 확인 후) | 회원 | `C-05`(P1) | **[v4]** 미결 안건 14 — MVP는 관리자 DB 처리. §18.2 경로 후보 |

### 17.2 P1 기능 경로 (결정 §13 P1 대기 항목)

| 제안 경로 | 메서드 | 필요한 곳 | 비고 |
|-----------|--------|-----------|------|
| `/api/v1/orders/{orderId}/payment/permit` | POST | **ERC20Permit 1-서명 결제** | `purchaseWithPermit(..., deadline, v, r, s)`용. `approve` 서명을 없애 결제가 1회 서명이 된다(미결 안건 6). 결정 §9 예약 경로 |
| `/api/v1/withdrawals` | POST | **관객 출금**(카드 취소·원화 계좌) | 관객 잔액을 카드 취소(모의) 또는 원화 계좌로 빼는 경로(P-20). 화면 `A-15` P1 |
| `/api/v1/withdrawals/me` | GET | 관객 출금 이력 | 위와 한 쌍 |
| `/api/v1/performances/{performanceId}/deposit/forfeit` | POST | **보증금 몰수** | `forfeitDeposit(showId)` 운영자 tx(P-21). MVP는 반환만 |
| `/api/v1/charges/{chargeId}/cancel` | POST | 충전 카드 취소(모의) | 관객 카드 취소 P1과 한 쌍 |
| `/api/v1/tickets/{ticketId}/exchanges` · `…/{exchangeId}` | POST·GET | 티켓 교환 | v3 §16에서 이월. 코드 `EXCHANGE_*`는 규격 v3 §3.16에 이미 존재 |
| `/api/v1/tickets/{ticketId}/wallet-pass` | POST | 구글 월렛 패스 | v3 §16에서 이월. RotatingBarcode로 동적 QR과 양립 |
| `/api/v1/members/me/attendances` | GET | 관람 기록 | v3 §16에서 이월 |
| `/api/v1/tickets/{ticketId}/photo-ticket` | GET | 포토 티켓 데이터 | v3 §16에서 이월 |
| `/api/v1/performances/{performanceId}/settlement/disputes` | GET | 공연자용 이의제기 목록 | 현재는 API-settlement-01 응답의 `disputes` 배열로 충분하다 |

### 17.3 P2 — 경로를 만들지 않는다

USDC 교환·역교환(`tUSDC`·`KRWSExchange` 컨트랙트), **온체인 출금**(임의 주소 전송), 외국인 팀 정산, **`ExternalIssuer`(인가 발행사 코인 어댑터)**, 외부 지갑 교체 화면, NFT 티켓·유료 재판매·NFC·애플 월렛·AI 기능은 **경로를 예약하지 않는다.** 요구사항 명세서 v4 §10 "확장 범위"에만 나열한다(결정 §13). `ExternalIssuer`는 `CoinIssuerPort` 인터페이스 뒤의 두 번째 구현체로 설계만 기록하며 MVP에 코드가 없다(결정 §2.6).

`coin_charge.method`의 `USDC_SWAP`, `coin_withdrawal.kind`의 `CARD_CANCEL`(P1)·`ONCHAIN`(P2), `chain_job.issuer_type`의 `EXTERNAL`은 **enum 예약값**으로만 두고 API가 받지 않는다(전달 시 `COMMON_VALIDATION_FAILED`).

---

## 18. 규격 v4 신설 제안

본문 작성 중 **규격 v3 §3에 없어서 기존 코드로 대체한 코드**와 **결정 문서 §9에 없어서 예약만 한 경로**, **판단이 필요한 지점**, **v4에서 쓰이지 않게 된 기존 코드**를 모았다. 규격 §2 "문서에 없는 코드는 배포하지 않는다"에 따라 **본문에서는 하나도 쓰지 않았다.** 결정 문서 §15 공통 규칙 ⑧에 따른 목록이며 팀 검토(9/3) 안건이다.

### 18.1 에러 코드 후보 (신설)

**결정 문서 §15 ⑧이 지목한 10개**

| 제안 코드 | status | 필요한 곳 | 본문 대체 코드 | 사유 |
|-----------|--------|-----------|-----------|------|
| `CHARGE_LIMIT_EXCEEDED` | 400 | API-charge-01 | `COMMON_VALIDATION_FAILED` | 1회 1,000~1,000,000 KRWS 한도(P-19) 위반은 화면이 "금액을 조정하세요"로 분기해야 한다. 일반 검증 실패와 문구가 다르다 |
| `CHARGE_METHOD_UNSUPPORTED` | 400 | API-charge-01, API-payment-01 | `COMMON_VALIDATION_FAILED` | `USDC_SWAP`(P2 예약값)·`AUTO_CHARGE`의 `VIRTUAL_ACCOUNT`는 클라이언트 라우팅 버그 신호라 분리 로깅이 낫다 |
| `CHARGE_ALREADY_COMPLETED` | 409 | API-charge-04 | `COMMON_CONFLICT` | 시뮬레이션 재호출·중복 입금 감지를 일반 충돌과 구분해야 시연 중 원인을 즉시 알 수 있다 |
| `CHARGE_EXPIRED` | 409 | API-charge-02·04 | `COMMON_CONFLICT` | 가상계좌 30분 만료는 "다시 발급"으로 유도하는 상황이라 전용 분기가 필요하다 |
| `CHARGE_CARD_DECLINED` | 402 | API-charge-01, API-payment-01 | `PAYMENT_REQUEST_FAILED`(502) | 카드사 거절은 **사용자가 조치할 문제**(다른 카드)인데 502는 서버 오류로 읽힌다. status도 402가 맞다 |
| `CHARGE_NOT_FOUND` | 404 | API-charge-02·04 | `COMMON_NOT_FOUND` | 도메인 접두 일관성(`charge` 도메인은 `CHARGE_*`, 결정 §5) |
| `WITHDRAW_NOTHING_TO_WITHDRAW` | 409 | API-withdraw-01 | `REDEEM_NOTHING_TO_REDEEM` | **개명**. `redeem` → `withdraw` 도메인 개명(결정 §5·미결 안건 13)에 따라 코드 접두도 함께 바꿔야 한다 |
| `WITHDRAW_ACCOUNT_NOT_REGISTERED` | 409 | API-withdraw-01 | `REDEEM_ACCOUNT_NOT_REGISTERED` | **개명**. 동상 |
| `WITHDRAW_ALREADY_REQUESTED` | 409 | API-withdraw-01 | `REDEEM_ALREADY_REQUESTED` | **개명**. v4에서는 "팀당 동시 진행 1건" 규칙의 코드로 의미가 명확해졌다(v3 §17.3 #3의 "쓸 자리 없음" 문제가 해소됐다) |
| `WITHDRAW_BANK_TRANSFER_FAILED` | 502 | API-withdraw-02 | `REDEEM_BANK_TRANSFER_FAILED` | **개명**. 동상 |
| `WITHDRAW_MIN_AMOUNT` | 400 | API-withdraw-01 | `COMMON_VALIDATION_FAILED` | 최소 1,000 KRWS(P-20) 위반을 화면이 "최소 금액" 안내로 분기 |
| `WALLET_CHALLENGE_EXPIRED` | 409 | API-wallet-04 | `COMMON_CONFLICT` | 챌린지 5분 만료·재사용은 "다시 시작하세요"로 유도해야 한다. 일반 충돌과 문구가 다르다 |
| `WALLET_SIGNATURE_INVALID` | 400 | API-wallet-04 | `COMMON_VALIDATION_FAILED` | `ecrecover` 복구 주소 불일치는 **다른 지갑으로 서명한 경우**가 많아 "선택한 계정을 확인하세요"라는 전용 안내가 필요하다 |
| `WALLET_ALREADY_LINKED` | 409 | API-member-01, API-wallet-03·04 | `COMMON_CONFLICT` | "이미 지갑이 있음"과 "이 주소가 남의 것"을 구분해야 한다. 후자는 보안 로깅 대상이다 |
| `WALLET_NOT_LINKED` | 409 | API-team-01, API-performance-01·07·08, API-ticket-01, API-charge-01 | `WALLET_NOT_FOUND`(404) | **6개 API가 같은 선행 조건을 검사한다.** 404는 "리소스 없음"이라 "먼저 연결하세요"라는 흐름 지시를 담지 못한다. 409가 맞다 |
| `AUTH_WEB3AUTH_TOKEN_INVALID` | 401 | API-member-01 | `AUTH_TOKEN_INVALID` | 우리 access token 위조와 **Web3Auth idToken 검증 실패**는 클라이언트 동작이 정반대다 — 후자는 로그아웃이 아니라 "다시 로그인" 재시도다 |
| `PAYMENT_SIGNATURE_REJECTED` | 409 | API-payment-03, API-performance-14, API-rule-05, API-withdraw-02 | (호출 안 함 / `COMMON_CONFLICT`) | 사용자가 지갑 팝업을 닫은 상황. 지금은 "호출하지 않음"과 `abandoned` 플래그로 표현하는데, 전용 코드가 있으면 4개 흐름의 분기가 단순해진다 |
| `PAYMENT_TX_MISMATCH` | 409 | API-payment-03, API-performance-14, API-rule-05, API-withdraw-02 | `PAYMENT_AMOUNT_MISMATCH` | **가장 필요한 코드.** receipt·이벤트 검증 실패는 금액 불일치만이 아니라 `to`·`from`·`event`·`orderRef`·수신 주소 불일치를 포함한다. §0.4 검증 5~8항목 전부를 하나로 담을 코드가 없어 금액 코드를 빌려 쓰고 있다 |
| `PAYMENT_TX_NOT_FOUND` | 404 | API-payment-03, API-performance-14, API-rule-05, API-withdraw-02 | `COMMON_NOT_FOUND` | 보고된 `txHash`가 체인에 없는 경우(오타·다른 네트워크 전송). "네트워크를 확인하세요" 안내로 분기해야 한다 |
| `PAYMENT_ALLOWANCE_INSUFFICIENT` | 409 | API-payment-03 | `PAYMENT_AMOUNT_MISMATCH` | `purchase`가 allowance 부족으로 revert된 경우. "승인을 먼저 해 주세요"로 `approve` 단계로 되돌려야 한다 |
| `PERFORMANCE_DEPOSIT_REQUIRED` | 409 | API-rule-01, API-rule-04 | `PERFORMANCE_INVALID_STATUS` | 보증금 미납은 "보증금을 납부하세요"라는 명확한 다음 행동이 있는데 일반 상태 오류로 묻힌다 |

**추가로 필요해진 후보**

| 제안 코드 | status | 필요한 곳 | 본문 대체 | 사유 |
|-----------|--------|-----------|-----------|------|
| `PERFORMANCE_DEPOSIT_ALREADY_PAID` | 409 | API-performance-13·14 | `COMMON_CONFLICT` | 보증금 중복 납부 시도(새로고침·이중 서명)를 일반 충돌과 구분 |
| `WALLET_BALANCE_INSUFFICIENT` | 409 | API-performance-13, API-withdraw-01 | `PAYMENT_INSUFFICIENT_BALANCE` | v3 `PAYMENT_INSUFFICIENT_BALANCE`는 **계좌 잔액** 전제 코드다. v4는 지갑 KRWS 잔액이며 화면 분기(충전 유도)가 다르다 |
| `AUTH_WEB3AUTH_ADDRESS_MISMATCH` | 409 | API-member-01 | `COMMON_CONFLICT` | 같은 소셜 계정인데 주소가 달라진 경우(Web3Auth 설정 변경·verifier 교체). 관리자 확인이 필요한 상황이라 별도 알림 대상 |
| `COIN_RATE_NOT_FOUND` | 404 | API-coin-02 | (빈 배열 200) | 지금은 환율 미등록을 오류로 보지 않는다. 관리자 화면(M-03)에서만 "미등록" 경고가 필요하면 이 코드를 쓴다 |
| `COMMON_IDEMPOTENCY_KEY_CONFLICT` | 409 | 멱등키 필수 7개 API | `COMMON_CONFLICT` | v3 §17.1에서 이월. 같은 키·다른 본문은 클라이언트 버그 신호라 분리 로깅·알림이 낫다 |
| `SETTLEMENT_DISPUTE_CLOSED` | 409 | API-settlement-04 | `COMMON_CONFLICT` | v3 §17.1에서 이월. `SETTLEMENT_DISPUTE_PERIOD`는 "아직 기간 중"이라 정반대 의미다 |
| `SETTLEMENT_DISPUTE_ALREADY_OPEN` | 409 | API-settlement-04 | `COMMON_CONFLICT` | v3 §17.1에서 이월. 팀당 열린 이의 1건 규칙을 코드로 표현할 수단이 없다 |
| `PAYMENT_ACCOUNT_HOLDER_MISMATCH` | 400 | API-team-07 | `COMMON_VALIDATION_FAILED` | v3 §17.1에서 이월. SEC-13이 "예금주명 일치 검증 필수"를 ★로 두는데 전용 코드가 없다 |
| `PAYMENT_ACCOUNT_NOT_FOUND` | 400 | API-team-07 | `COMMON_VALIDATION_FAILED` | v3 §17.1에서 이월. 금융망에 없는 계좌와 형식 오류를 구분해야 재입력 문구가 달라진다 |
| `TICKET_TRANSFER_PENDING` | 409 | API-ticket-06, API-refund-01·02 | `TRANSFER_NOT_ALLOWED` | v3 §17.1에서 이월. 양도 도메인 코드를 티켓·환불 흐름에서 빌려 쓰고 있다 |
| `PERFORMANCE_PARTICIPANT_LIMIT_EXCEEDED` | 400 | API-performance-07 | `COMMON_VALIDATION_FAILED` | v3 §17.1에서 이월. 참여팀 상한(8팀) 안내 |
| `ENTRY_LINK_EXPIRED` | 403 | API-entry-01·02 | `ENTRY_SCANNER_NOT_AUTHORIZED` | v3 §17.1에서 이월. 링크 **만료**와 **애초에 권한 없음**을 구분해야 한다 |
| `TRANSFER_CHOICE_TEAM_REQUIRED` | 400 | API-transfer-03 | `COMMON_VALIDATION_FAILED` | v3 §17.1에서 이월. 팀 선택 UI로 돌려보내야 하는 상황 |

**합계: 신설 후보 34개** (결정 §15 ⑧ 지목 10개 + 개명 4개 + `charge`/`wallet`/`payment` 추가 8개 + v3 이월 12개).

### 18.2 경로 후보

| 제안 경로 | 메서드 | 필요한 곳 | 사유 |
|-----------|--------|-----------|------|
| `/api/v1/wallets/me/replace` | POST | 지갑 교체 | 미결 안건 14 — MVP는 관리자 DB 처리. 잔액 0 확인 → 챌린지 → 교체. §17.1에 P1로 예약 |
| `/api/v1/wallets/me/challenge` | POST | 챌린지 경로 일관성 | 현재 `POST /wallets/challenge`(결정 §9 그대로)인데 다른 지갑 API는 `/wallets/me/*`다. 결정 문서 경로를 **글자 단위로 지켰지만** 규격 v4에서 `/wallets/me/challenge`·`/wallets/me/verify`로 통일하는 안을 올린다 |
| `/api/v1/orders/{orderId}/payment/prepare` | POST | 결제 서명 파라미터 재발급 | 현재는 API-payment-01(시작)과 API-payment-02(상태 조회)가 `signRequests`를 겸한다. §0.4의 다른 흐름(보증금·동의)이 모두 `…/prepare`인데 결제만 예외라 패턴이 어긋난다. 결정 §9 인벤토리에 없어 만들지 않았다 |
| `/api/v1/coin/rates/history` | GET | 환율 이력 | M-03 화면의 "환율 이력"에 필요하다. 현재는 관리자가 DB로 확인한다 |
| `/api/v1/admin/coin/reserve/recheck` | POST | 준비금 즉시 재대사 | 불일치 알림을 받은 관리자가 mint 중단을 풀기 전에 강제 재조회하는 경로. 현재는 1분 캐시 만료를 기다린다 |
| `/api/v1/admin/chain/jobs` · `…/{jobId}/retry` | GET·POST | 관리자 체인 작업 | v3 §17.2에서 이월. API-coin-05·06(P1)과 중복이라 v1.1에서 하나로 정리해야 한다 |

### 18.3 판단이 필요한 지점 (팀 검토 안건)

| # | 내용 | 이 문서의 처리 |
|---|------|----------------|
| 1 | **`display` 객체 필드명 불일치** — 결정 문서 §9는 `display: {currency, amount, rate, rateAt}`, 작업 지시는 `display: {currency, approx, rate, asOf}`다 | **작업 지시의 필드명(`approx`·`asOf`)을 채택**했다(§0.5). `amount`는 같은 객체의 원본 금액 키와 충돌하고, `asOf`가 "표시 전용 스냅샷"이라는 의미를 더 잘 담는다. 결정 문서 §9의 한 줄을 v1.1에서 정정하거나, 반대로 뒤집으면 v4 본문의 `display` 예시 전부(약 25곳)를 함께 고쳐야 한다 |
| 2 | **표시 환율 예시값 불일치** — P-17·미결 안건 2는 `USD_KRW = 1,350` 확정인데 작업 지시의 형태 예시는 `1388.9`, 결정 §3.1의 화면 예시(₩30,000 ≈ $22.20)는 약 1,351이다 | **본문 전체를 `1350.0`으로 통일**했고(P-17 확정값 우선) §0.5 규격 예시 블록 하나만 작업 지시의 형태 예시를 그대로 남겼다. 시연 전 실제 등록값이 정해지면 예시를 일괄 치환한다 |
| 3 | **`settlement_share` 금액 필드명** — v3는 `equalAmount`(균등)인데 v3 규칙 자체는 이미 2단계(`fixedRatioBp` + 팀별 `teamShareBp`)여서 "균등"이 아니다 | v4에서 **`fixedAmount`로 정정**했다(API-settlement-01·07, API-verify-01). ERD v3 `settlement_share`에도 같은 논리명을 쓰도록 ERD 담당에게 전달해야 한다 |
| 4 | **양도 후 온체인 선택 카운터** — 수락자가 관람 팀을 다시 고르는데, `purchase` tx에 기록된 원 구매자의 선택은 되돌릴 수 없다 | **온체인 카운터를 그대로 두고 정산은 그 값을 쓴다**고 확정했다(§11). v3는 `cancelChoice`+`recordChoice` 2건으로 갱신했지만 v4에서는 그 함수들이 삭제됐고(결정 §7 `RECORD_CHOICE`·`CANCEL_CHOICE` 삭제) 관객 지갑이 서명한 tx를 서버가 되돌릴 수도 없다. **대안**: 운영자용 `adjustChoice(showId, from, to)`를 컨트랙트에 추가(범위 증가) / 양도 시 팀 재선택을 없애고 원 선택 승계(UX 단순). 팀 결정 필요 |
| 5 | **결제 `prepare` 경로 부재** — §0.4 패턴은 `prepare`/`signed-tx` 쌍인데 결제만 `payment`(시작)/`payment`(조회)/`payment/signed-tx`다 | 결정 §9 인벤토리에 결제 `prepare` 경로가 없어 **만들지 않고**, API-payment-01·02가 `signRequests`를 겸하도록 했다. 실무상 문제는 없지만(조회가 매번 재생성) 패턴 일관성은 §18.2 경로 후보로 올렸다 |
| 6 | **규격 v3에 없는 코드를 v3 본문이 쓰고 있었다** — v3 API 문서는 `SETTLEMENT_BALANCE_MISMATCH`·`SETTLEMENT_ESCROW_INSUFFICIENT`·`PAYMENT_PENDING`·`PAYMENT_FAILED`·`SETTLEMENT_NOT_AGGREGATED`를 썼는데 규격 v3 §3에는 없다 | v4에서 **규격에 실제로 있는 코드로 정정**했다 — `COIN_RESERVE_MISMATCH` / `COIN_ESCROW_INSUFFICIENT` / `COIN_MINT_PENDING` / `COIN_MINT_FAILED`. 규격 v4에서 굳이 `SETTLEMENT_*` 별칭을 만들 필요는 없다고 본다 |
| 7 | **`WALLET_*` 기존 3개 코드의 전제가 무너졌다** — `WALLET_CREATION_FAILED`(서버가 지갑 생성)·`WALLET_KEY_DECRYPT_FAILED`(서버가 키 복호화)는 v4에 해당 동작이 없다 | 본문에서 **전부 제거**했다. §18.4 폐기 후보 |
| 8 | **비동기 예시 상태값** — 규격 v3 §1의 비동기 예시가 `"status": "IN_PROGRESS"`인데 실제 enum은 `PENDING`/`SUBMITTED`/`CONFIRMED`/`FAILED`다 | v3 §17.3 #1에서 이월. v4도 enum을 우선해 `PENDING`·`SUBMITTED`를 썼다. 규격 v4에서 예시를 고쳐야 한다 |
| 9 | **`TICKET_PURCHASE_LIMIT_EXCEEDED` 기본 문구** — 규격 v3는 "1인당 최대 2장"인데 정책은 4매다 | v3 §17.3 #2에서 이월. 본문은 4매 기준이며 규격 v4에서 기본 `msg`를 "최대 4장"으로 고쳐야 한다 |
| 10 | **`ENTRY_SCANNER_NOT_AUTHORIZED` 기본 문구** — "검표 권한이 없습니다"는 회원 권한을 전제한다 | v3 §17.3 #8에서 이월. 코드는 그대로 쓰고 의미를 "검표 링크 토큰이 유효하지 않음"으로 재해석했다. 규격 v4에서 문구를 링크 기준으로 고쳐야 한다 |
| 11 | **`REFUND_TRANSFER_FAILED` 재정의** — v3는 "금융망 환불 이체 실패"였는데 v4의 환불에는 금융망 이체가 없다 | 본문에서 **"`refund` tx 최종 실패"로 재정의**해 그대로 썼다(API-refund-02). 규격 v4에서 발생 조건 문장을 고쳐야 한다 |
| 12 | **관객 잔액의 법적 성격** — 충전 잔액이 사용자 지갑에 있어 플랫폼 예수금 성격이 약하다는 Q&A 논리(결정 §12.3)가 API 설계에 반영돼 있는지 | API 차원에서는 **관객 출금 경로를 만들지 않았고**(P-20) 잔액 조회·거래 이력만 제공한다. 선불업 잔액 환급 의무는 실서비스 항목으로 Q&A에 남긴다 |

### 18.4 v4에서 쓰이지 않게 된 기존 코드 (규격 v4 폐기 후보)

| 코드 | v3에서 쓰인 곳 | v4 처리 |
|------|---------------|---------|
| `WALLET_CREATION_FAILED` (500) | API-team-01(서버가 팀 지갑 EOA 생성·키 암호화) | **발생할 수 없다.** 서버가 지갑을 만들지 않는다(P-2). 규격 v4에서 삭제 |
| `WALLET_KEY_DECRYPT_FAILED` (500) | API-rule-03(팀 키 복호화 후 `agreeToRules` 서명) | **발생할 수 없다.** 서버가 보관·복호화하는 사용자 키가 없다(결정 §2.3 — v3 SEC-04 전제 폐기). 규격 v4에서 삭제 |
| `PAYMENT_INSUFFICIENT_BALANCE` (409) | API-payment-01(관객 **계좌** 잔액 부족) | **의미가 바뀌었다.** v4에서는 **지갑 KRWS 잔액** 부족이며 화면 분기가 "충전 유도"다. 기본 `msg`를 "잔액이 부족합니다. 충전 후 다시 시도해 주세요."로 고치거나 `WALLET_BALANCE_INSUFFICIENT`로 분리(§18.1) |
| `PAYMENT_REQUEST_FAILED` (502) | API-payment-01(금융망 결제 이체 실패) | **위치가 옮겨졌다.** v4에서는 **충전(카드) 실패**에서만 쓰인다. 기본 `msg`의 "결제는 진행되지 않았습니다"를 충전 맥락으로 고쳐야 한다 |
| `PAYMENT_TIMEOUT` (504) | API-payment-01 | 동상 — 충전 맥락으로 재정의 |
| `REDEEM_NOTHING_TO_REDEEM` · `REDEEM_ACCOUNT_NOT_REGISTERED` · `REDEEM_ALREADY_REQUESTED` · `REDEEM_BANK_TRANSFER_FAILED` | API-redeem-01·02, API-settlement-05 | **`WITHDRAW_*`로 개명**(§18.1). 도메인 개명(결정 §5)에 맞춘다. 개명 전까지 v4 본문은 `REDEEM_*`을 그대로 쓴다 |
| `SETTLEMENT_RELEASE_NOT_ACTIVE` (409) | (v3 본문 미사용) | **v4에서 쓸 자리가 생겼다.** API-withdraw-01에서 "release 전 팀이 출금을 시도"에 쓸 수 있다. 다만 그 경우 잔액이 0이라 `REDEEM_NOTHING_TO_REDEEM`으로 충분해 본문에서는 쓰지 않았다. 규격 v4에서 삭제하거나 이 용도로 재정의 |
| `RULE_COMMON_COST_EXCEEDS_REVENUE` (409) | (v2에서 사용처 제거) | v3 §17.4에서 이월. 공통 비용 항목이 삭제돼 **발생할 수 없다.** 규격 v4에서 삭제 |
| `AUTH_OAUTH_EXCHANGE_FAILED` · `AUTH_OAUTH_PROVIDER_UNSUPPORTED` · `AUTH_TERMS_NOT_AGREED` | (v3 §17.1 신설 후보, 미배포) | **신설 후보에서 철회한다.** 자체 OAuth 토큰 교환이 없어졌다(Web3Auth가 처리). 대신 `AUTH_WEB3AUTH_TOKEN_INVALID`가 필요하다(§18.1) |

### 18.5 Q&A 방어 논리 (리스크 절 이관용)

이 문서의 본문은 "플랫폼이 시연용 가상 원화 스테이블코인을 발행·소각·준비금 공시한다"만 말한다. 아래는 발표 Q&A와 요구사항 명세서 v4 §8 리스크 절로 넘길 논리이며 본문 어디에도 쓰지 않았다(결정 §15 ⑨).

| 질문 | 답 | API 근거 |
|---|---|---|
| 학생 팀이 스테이블코인을 발행하는 것이 규제상 가능한가 | 테스트넷 시연용 가상 발행이며 실화폐가 없다. **발행 로직은 `CoinIssuerPort` 인터페이스 하나 뒤에 있어 인가 발행사 코인이 나오면 구현체만 바꾸고, 정산 컨트랙트는 토큰 주소만 바꾼다** | API-coin-01·verify-02의 `issuer.type`·`issuer.replaceable`, API-coin-04의 `contracts.tokenAddress`. `RevenueSplitter`는 `tokenAddress()`만 의존한다 |
| 예치 없는 발행이 아닌 것을 어떻게 아는가 | mint는 `coin_charge.status = FIAT_CONFIRMED` 이후에만 실행되고, `chargeRef`가 그 충전 건의 멱등키 해시다. 준비금 공시가 `예치 ≥ 유통량`을 1분 주기로 대사한다 | API-charge-01 시스템 처리, API-verify-02 `supplyReconciliation` |
| 플랫폼이 사용자 돈을 쥐고 있지 않다는 근거 | 사용자 잔액은 **사용자 지갑**에 있고 서버가 옮길 수 없다. 팀 출금도 리더 서명 없이는 시작되지 않는다 | API-wallet-01, §0.4, API-withdraw-01·02(리더 서명 필수) |
| 탈중앙인가 | 아니다. 판매 시작·환불·집계·잠금·release·mint·burn은 **운영자가 발의·실행**한다. 보장하는 것은 규칙의 사후 변조 불가와 계산의 재현 가능성이다 | API-verify-01 `guarantees.notGuaranteed` |

---

## 19. 검수표 — v4 P0 전수 확인

**기준은 결정 문서 §9 API 인벤토리다.** v3의 71행(P0 61 + P1 10) 체제에서 **89행(P0 76 + P1 12 + 삭제 4)** 로 바뀌었다.

| 구분 | v3 | v4 | 차이 |
|------|----:|----:|------|
| P0 상세 작성 | 61 | **76** | +15 |
| P1 예약 경로 | 10 | **12** | +2 |
| 삭제(어디에도 없음) | 1 | **4** | +3 |
| 합계(행 수) | 71 | **89** | +18 |

**증감 내역** — **신설 20개**: wallet-01~05(5, 번호 재사용·경로 교체) · performance-13·14(2) · rule-05(1) · payment-03(1) · charge-01~04(4) · coin-02·03·04(3) · withdraw-01·02(2) · verify-02(1, 부활) · member-08(1, 번호 이동). **대체·변경 12개**: member-01(Web3Auth) · member-05·06 · team-01 · performance-01·12 · rule-01·03 · ticket-01 · payment-01·02 · refund-01·02 · settlement-01·05 · chain-01 · coin-01 · verify-01 · withdraw-03(개명). **P0 → P1 1개**: member-07. **삭제 4개**: v3 member-08(소셜 OAuth) · redeem-01 · redeem-02 · (v3 wallet-01·02 경로 — 번호는 재사용). **번호 이동 3개**: coin-02·03 → coin-05·06(P1) · redeem-02 → withdraw-04(P1).

"본문"은 이 문서에 `### {번호}` 절과 `` `메서드 경로` `` 표기가 **글자 단위로 일치**함을 확인한 결과다. 순서는 문서 본문 등장 순서다.

| # | 번호 | 메서드 경로 | 이름 | 본문 | 절 | v4 비고 |
|---|------|-------------|------|:----:|----|---------|
| 1 | API-member-01 | `POST /api/v1/auth/web3auth` | Web3Auth 로그인/가입 | ☑ | §1 | **v4 신설** — 구 signup/login/OAuth 통합 |
| 2 | API-member-02 | `POST /api/v1/auth/login` | 자체 이메일 로그인(보조) | ☑ | §1 | v4 변경 — `wallet`·`walletLinkRequired` 추가 |
| 3 | API-member-03 | `POST /api/v1/auth/refresh` | 토큰 재발급 | ☑ | §1 | 유지 |
| 4 | API-member-04 | `POST /api/v1/auth/logout` | 로그아웃 | ☑ | §1 | v4 변경 — Web3Auth 세션은 클라이언트가 종료 |
| 5 | API-member-05 | `GET /api/v1/members/me` | 내 정보 조회 | ☑ | §1 | v4 변경 — 로케일·통화·시간대·지갑 요약 |
| 6 | API-member-06 | `PATCH /api/v1/members/me` | 내 정보 수정 | ☑ | §1 | v4 변경 — 언어·통화 설정(F-member-09) |
| — | API-member-07 | `PUT /api/v1/members/me/bank-account` | 금융망 계좌 연결 | — | §17 | **v4 P0 → P1** |
| 7 | API-member-08 | `POST /api/v1/auth/signup` | 자체 이메일 가입(보조) | ☑ | §1 | **v4 번호 이동** — 구 member-01 |
| 8 | API-team-01 | `POST /api/v1/teams` | 팀 생성 | ☑ | §2 | v4 변경 — 지갑 생성 없음, 리더 지갑 검사 |
| 9 | API-team-02 | `GET /api/v1/teams/me` | 내 팀 목록 | ☑ | §2 | v4 변경 — 팀 잔액 요약 |
| 10 | API-team-03 | `GET /api/v1/teams/{teamId}` | 팀 상세 | ☑ | §2 | v4 변경 — 리더 지갑 파생 |
| 11 | API-team-04 | `PATCH /api/v1/teams/{teamId}` | 팀 수정 | ☑ | §2 | 유지 |
| ~~12~~ | ~~API-team-05~~ | ~~`POST /api/v1/teams/{teamId}/invitations`~~ | ~~팀원 초대~~ | — | — | v3 삭제 유지 |
| ~~13~~ | ~~API-team-06~~ | ~~`POST /api/v1/teams/invitations/{token}/accept`~~ | ~~초대 수락~~ | — | — | v3 삭제 유지 |
| 12 | API-team-07 | `PUT /api/v1/teams/{teamId}/settlement-account` | 정산 계좌 등록(예금주 검증) | ☑ | §2 | 유지 — 팀 원화 출금용 |
| 13 | API-wallet-01 | `GET /api/v1/wallets/me` | 내 지갑 조회 | ☑ | §3 | **v4 신설** — 경로 교체(구 `/teams/{id}/wallet`) |
| 14 | API-wallet-02 | `GET /api/v1/wallets/me/transactions` | 내 지갑 거래 이력 | ☑ | §3 | **v4 신설** — 경로 교체 |
| 15 | API-wallet-03 | `POST /api/v1/wallets/challenge` | 외부 지갑 등록 챌린지 발급 | ☑ | §3 | **v4 신설** |
| 16 | API-wallet-04 | `POST /api/v1/wallets/verify` | 챌린지 서명 검증 → 지갑 등록 | ☑ | §3 | **v4 신설** |
| 17 | API-wallet-05 | `POST /api/v1/wallets/me/gas` | 가스 재충전 요청 | ☑ | §3 | **v4 신설** |
| 18 | API-performance-01 | `POST /api/v1/performances` | 공연 생성 | ☑ | §4 | v4 변경 — 보증금 필드 |
| 19 | API-performance-02 | `GET /api/v1/performances` | 공연 목록(공개) | ☑ | §4 | v4 변경 — `display`·en |
| 20 | API-performance-03 | `GET /api/v1/performances/{performanceId}` | 공연 상세(공개) | ☑ | §4 | v4 변경 — `display`·환불 고지 |
| 21 | API-performance-04 | `PATCH /api/v1/performances/{performanceId}` | 공연 수정(잠금 전) | ☑ | §4 | v4 변경 — `SIGNING` 초기화 |
| 22 | API-performance-05 | `PUT /api/v1/performances/{performanceId}/ticket-types` | 티켓 옵션 설정(잠금 전) | ☑ | §4 | v4 변경 — KRWS 정수 |
| 23 | API-performance-06 | `GET /api/v1/performances/me` | 내 팀 참여 공연 목록 | ☑ | §4 | v4 변경 — `pendingSignature` |
| 24 | API-performance-07 | `POST /api/v1/performances/{performanceId}/participants` | 참여팀 초대 | ☑ | §4 | v4 변경 — 리더 지갑 검사 |
| 25 | API-performance-08 | `POST /api/v1/performances/{performanceId}/participants/{teamId}/accept` | 참여 수락 | ☑ | §4 | v4 변경 — 지갑 주소 반환 |
| 26 | API-performance-09 | `DELETE /api/v1/performances/{performanceId}/participants/{teamId}` | 참여팀 제외(잠금 전) | ☑ | §4 | 유지 |
| 27 | API-performance-10 | `GET /api/v1/performances/{performanceId}/entry-link` | 검표 페이지 링크 조회 | ☑ | §4 | 유지 |
| 28 | API-performance-11 | `GET /api/v1/performances/{performanceId}/sales` | 판매·선택 현황 | ☑ | §4 | v4 변경 — 에스크로 잔액·`teamIndex` |
| 29 | API-performance-12 | `POST /api/v1/performances/{performanceId}/cancel` | 공연 취소(일괄 환불) | ☑ | §4 | v4 변경 — 온체인 refund + 보증금 반환 |
| 30 | API-performance-13 | `POST /api/v1/performances/{performanceId}/deposit/prepare` | 보증금 서명 파라미터 | ☑ | §4 | **v4 신설** |
| 31 | API-performance-14 | `POST /api/v1/performances/{performanceId}/deposit/signed-tx` | 보증금 tx 해시 보고 | ☑ | §4 | **v4 신설** |
| 32 | API-rule-01 | `PUT /api/v1/performances/{performanceId}/rules` | 정산 규칙 설정 | ☑ | §5 | v4 변경 — 보증금 선행 |
| 33 | API-rule-02 | `GET /api/v1/performances/{performanceId}/rules` | 규칙·동의 현황 조회 | ☑ | §5 | v4 변경 — `SIGNING` 3단계 |
| 34 | API-rule-03 | `POST /api/v1/performances/{performanceId}/rules/agreements/prepare` | 규칙 동의 서명 파라미터 | ☑ | §5 | **v4 변경** — 경로·동작 교체 |
| 35 | API-rule-04 | `POST /api/v1/performances/{performanceId}/sale/start` | 판매 시작(startSale 잠금) | ☑ | §5 | v4 변경 — 지갑 스냅샷·`teamIndex` |
| 36 | API-rule-05 | `POST /api/v1/performances/{performanceId}/rules/agreements/signed-tx` | 규칙 동의 tx 해시 보고 | ☑ | §5 | **v4 신설** |
| 37 | API-ticket-01 | `POST /api/v1/orders` | 주문 생성(옵션·수량·선택 팀) | ☑ | §6 | v4 변경 — `orderRef`·잔액·부족분 |
| 38 | API-ticket-02 | `GET /api/v1/orders/me` | 내 주문 목록 | ☑ | §6 | v4 변경 — 결제 상태 7값 |
| 39 | API-ticket-03 | `GET /api/v1/orders/{orderId}` | 주문 상세 | ☑ | §6 | v4 변경 — `paymentMode`·`purchaseTxHash` |
| 40 | API-ticket-04 | `GET /api/v1/tickets/me` | 내 티켓 목록 | ☑ | §6 | v4 변경 — `refundTarget` |
| 41 | API-ticket-05 | `GET /api/v1/tickets/{ticketId}` | 티켓 상세 | ☑ | §6 | v4 변경 — `display`·`refundTarget` |
| 42 | API-ticket-06 | `GET /api/v1/tickets/{ticketId}/qr` | 동적 QR 토큰 발급 | ☑ | §6 | 유지 |
| 43 | API-payment-01 | `POST /api/v1/orders/{orderId}/payment` | 결제 시작 | ☑ | §7 | **v4 변경** — 서명 파라미터·자동 충전 |
| 44 | API-payment-02 | `GET /api/v1/orders/{orderId}/payment` | 결제 상태 조회 | ☑ | §7 | **v4 변경** — `signRequests` 포함 |
| 45 | API-payment-03 | `POST /api/v1/orders/{orderId}/payment/signed-tx` | 결제 tx 해시 보고 | ☑ | §7 | **v4 신설** |
| 46 | API-charge-01 | `POST /api/v1/charges` | 충전 요청 | ☑ | §8 | **v4 신설** |
| 47 | API-charge-02 | `GET /api/v1/charges/{chargeId}` | 충전 상태 조회 | ☑ | §8 | **v4 신설** |
| 48 | API-charge-03 | `GET /api/v1/charges/me` | 내 충전 이력 | ☑ | §8 | **v4 신설** |
| 49 | API-charge-04 | `POST /api/v1/charges/{chargeId}/simulate-deposit` | 가상계좌 입금 시뮬레이션 | ☑ | §8 | **v4 신설**(시연 프로필 한정) |
| 50 | API-coin-01 | `GET /api/v1/coin/supply` | KRWS 유통량·준비금 요약 | ☑ | §9 | v4 변경 — 발행 주체 라벨 |
| 51 | API-coin-02 | `GET /api/v1/coin/rates` | 표시 환율 조회 | ☑ | §9 | **v4 신설** |
| 52 | API-coin-03 | `PUT /api/v1/admin/coin/rates` | 표시 환율 등록 | ☑ | §9 | **v4 신설**(ADMIN) |
| 53 | API-coin-04 | `GET /api/v1/coin/config` | 체인·컨트랙트 설정 조회 | ☑ | §9 | **v4 신설** |
| — | API-coin-05 | `GET /api/v1/admin/coin/jobs` | 온체인 작업 목록 | — | §17 | v4 번호 이동(P1) |
| — | API-coin-06 | `POST /api/v1/admin/coin/jobs/{jobId}/retry` | 작업 재시도 | — | §17 | v4 번호 이동(P1) |
| 54 | API-chain-01 | `GET /api/v1/chain/jobs/{jobId}` | 비동기 tx 작업 상태 | ☑ | §9 | v4 변경 — `signerType`·`issuerType`·`verification` |
| 55 | API-refund-01 | `GET /api/v1/tickets/{ticketId}/refund-quote` | 환불액 미리보기 | ☑ | §10 | v4 변경 — 잔액 반환 |
| 56 | API-refund-02 | `POST /api/v1/tickets/{ticketId}/cancel` | 개별 취소·환불 | ☑ | §10 | v4 변경 — 온체인 refund 1건 |
| 57 | API-transfer-01 | `POST /api/v1/tickets/{ticketId}/transfers` | 양도 링크 생성 | ☑ | §11 | 유지 |
| 58 | API-transfer-02 | `GET /api/v1/transfers/{token}` | 양도 정보 조회 | ☑ | §11 | v4 변경 — Web3Auth 로그인 유도 |
| 59 | API-transfer-03 | `POST /api/v1/transfers/{token}/accept` | 양도 수락 | ☑ | §11 | **v4 변경** — 온체인 tx 없음 |
| 60 | API-transfer-04 | `DELETE /api/v1/transfers/{token}` | 양도 취소 | ☑ | §11 | 유지 |
| 61 | API-entry-01 | `POST /api/v1/entries/verify` | QR 검증·입장 처리 | ☑ | §12 | 유지 |
| 62 | API-entry-02 | `GET /api/v1/performances/{performanceId}/entries` | 입장 현황·이력 | ☑ | §12 | 유지 |
| 63 | API-settlement-01 | `GET /api/v1/performances/{performanceId}/settlement` | 정산 상태·집계·분배액·tx | ☑ | §13 | v4 변경 — `released`·`withdrawnAmount`·보증금 |
| 64 | API-settlement-02 | `POST /api/v1/performances/{performanceId}/settlement/aggregate` | 집계 확정 | ☑ | §13 | v4 변경 — `COIN_MINT_PENDING` 검사 |
| 65 | API-settlement-03 | `POST /api/v1/performances/{performanceId}/settlement/lock` | 정산 잠금(이의제기 시작) | ☑ | §13 | 유지 |
| 66 | API-settlement-04 | `POST /api/v1/performances/{performanceId}/settlement/disputes` | 이의제기 | ☑ | §13 | 유지 |
| 67 | API-settlement-05 | `POST /api/v1/performances/{performanceId}/settlement/release` | release 실행 | ☑ | §13 | **v4 변경** — 리더 지갑 push + 보증금 반환 |
| 68 | API-settlement-06 | `POST /api/v1/performances/{performanceId}/settlement/share-link` | 정산 공유 링크 생성 | ☑ | §13 | 유지 |
| 69 | API-settlement-07 | `GET /api/v1/public/settlement/{shareToken}` | 정산 공유 링크 조회(공개) | ☑ | §13 | v4 변경 — `REDEEMED` 삭제 |
| 70 | API-withdraw-01 | `POST /api/v1/teams/{teamId}/withdrawals` | 팀 출금 시작 | ☑ | §14 | **v4 신설** |
| 71 | API-withdraw-02 | `POST /api/v1/teams/{teamId}/withdrawals/{withdrawalId}/signed-tx` | 출금 예치 tx 해시 보고 | ☑ | §14 | **v4 신설** |
| 72 | API-withdraw-03 | `GET /api/v1/teams/{teamId}/withdrawals` | 팀 출금 이력 | ☑ | §14 | **v4 개명** — 구 redeem-01 |
| — | API-withdraw-04 | `POST /api/v1/admin/withdrawals/{withdrawalId}/retry` | 출금 재시도 | — | §17 | v4 개명(P1) — 구 redeem-02 |
| 73 | API-verify-01 | `GET /api/v1/performances/{performanceId}/verification` | 정산 검증 데이터 | ☑ | §15 | v4 변경 — 불변식 3종 대사 |
| 74 | API-verify-02 | `GET /api/v1/public/reserve-proof` | 준비금 공시 | ☑ | §15 | **v4 부활** |
| 75 | API-admin-09 | `GET /api/v1/admin/disputes` | 이의제기 목록 | ☑ | §16 | 유지 |
| 76 | API-admin-06 | `PATCH /api/v1/admin/disputes/{disputeId}` | 이의제기 처리 | ☑ | §16 | 유지 |

### 추가 확인

| 항목 | 결과 |
|------|------|
| P0 76개 전부 본문에 상세 절 존재 | ☑ (본문 `### API-*` 절 76개, 누락 0) |
| P1 12개 | ☑ §17.1 표에 경로·메서드·이름만. 본문 상세 없음 |
| 삭제 4개 | ☑ v3 member-08(소셜 OAuth) §1 말미 · redeem-01·02 §14 말미 · v3 wallet-01·02 경로 §3 말미에 사유 주석만 |
| 도메인 16개 전부 절 존재 | ☑ §1~§16 (결정 §5 순서 그대로: member·team·wallet·performance·rule·ticket·payment·charge·coin·refund·transfer·entry·settlement·withdraw·verify·admin) |
| 본문 에러 코드가 전부 규격 v3 §3에 존재 | ☑ (미등재 코드 0 — 신설 후보 34개는 §18.1에만) |
| 결정 §7 상태 문자열 사용 | ☑ Wallet(`LINKED`/`SUSPENDED`, `WEB3AUTH`/`EXTERNAL`) · CoinCharge 6값 · Payment 7값 · CoinWithdrawal 7값 · RuleAgreement 3값 · ChainJob(`tx_type` 16값·`signer_type`·`issuer_type`·`status`) · Settlement 6값(`REDEEMED` 없음) · `deposit_status` 4값 · Refund 4값 · WalletTx.type 8값 · Member.auth_provider 4값 |
| 멱등키 필수 API | ☑ **7개** — ticket-01 · payment-01 · **charge-01** · refund-02 · performance-12 · settlement-05 · **withdraw-01** |
| 202 + `jobId`(OPERATOR) API | wallet-05 · rule-04 · performance-12 · refund-02 · settlement-02·03·05 · charge-01·04 (폴링 대상 API-chain-01) |
| 202 + `jobId`(USER, 서명 tx 보고) API | performance-14 · rule-05 · payment-03 · withdraw-02 — **4개** |
| `…/prepare` 서명 파라미터 API | performance-13 · rule-03 · withdraw-01(생성 겸용) · payment-01·02(겸용) |
| 공개(비인증) 경로 | `GET /performances` · `GET /performances/{id}` · `GET /coin/supply` · **`GET /coin/rates`** · **`GET /coin/config`** · `GET /transfers/{token}` · **`GET /public/reserve-proof`** · `GET /public/settlement/{shareToken}` · `POST /auth/web3auth` · `POST /auth/login` · `POST /auth/signup` |
| 검표 링크 토큰(`X-Entry-Token`) API | API-entry-01 · API-entry-02 (발급은 API-performance-10) |
| 체인 표기 | ☑ 전부 `kaia-kairos` · `chainId 1001`/`0x3e9` · `https://kairos.kaiascan.io` (Polygon Amoy 잔존 0) |
| 금액 표기 | ☑ 전부 KRWS 정수 + `display` 객체(또는 축약형 `rate`). 소수 금액 0 |
| `Accept-Language` 명시 | ☑ 사용자 문구가 있는 전 API 헤더 절에 표기(en 기본·ko) |
| §15 ⑨ 문장("플랫폼이 시연용 가상 원화 스테이블코인을 발행·소각·준비금 공시한다") | ☑ §0 서두 1회 + §9 도입부 1회 |
| §15 ⑩ 문장("지갑은 사용자 소유, 서버는 사용자 키를 보관하지 않는다") | ☑ §0 서두 1회 + §3 도입부 1회 |
| "인가 발행사 코인 교체 가능" 언급 위치 | ☑ §18.4·§18.5(Q&A) 및 `issuer.replaceable` 필드 설명에만. 본문 서사 0 |
| 금지 문자열 | ☑ "envelope encryption" 0건 · "네이버" 0건 · "관객에게는 지갑이 없다" 0건 |
| 사용자 키 관련 필드 | ☑ 개인키·니모닉·MPC 샤드를 받거나 반환하는 필드 0개. API-wallet-04는 서명 문자열만 받는다 |
| P2 경로 없음 | ☑ USDC·온체인 출금·외국인 팀·`ExternalIssuer`·NFT 경로 0 (§17.3에 "만들지 않는다"만) |

---

## 변경 이력

| 버전 | 날짜 | 내용 |
|------|------|------|
| v1 | 2026-08-28 | 초안. 계획 §1.7(71행) P0 69개 상세 + P1 2개 + 신설 제안 + 검수표 |
| v2 | 2026-08-31 | 요구사항 v2 반영. P0 61 / P1 10 / 삭제 1로 재편. OAuth P0 승격, 정산 공식 2단계, 검표 링크, 판매 마감 서버 계산, 검증 참여팀 전용, 관리자 최소화, 양도 팀 재선택, 체인 Kaia Kairos 전환 |
| v3 | 2026-08-31 | ERD v2 반영. 계좌 테이블 통합, 팀원 관리 삭제(team-05·06), 정산 공유 링크(settlement-06·07), `entry_log` 흡수, 2단계 비율 필드, QR TOTP, 23 테이블 |
| **v4** | **2026-09-02** | **[방향 전환 결정 문서 v1](../planning/06_방향전환_코인전환_v1.md) 반영 — 전부 코인·외국인 관객·비수탁 지갑. P0 76 / P1 12 / 삭제 4.**<br>① **§0.4 사용자 서명 tx 규약 신설** — `prepare`(서버가 `to`·`data`·`value`·`chainId`·`gas`·`summary` 발급) → 지갑 서명 → `signed-tx {kind, txHash}` → 서버 receipt·이벤트 검증(5항목) → 상태 전이. `chain_job.signer_type=USER`, 불일치는 `PAYMENT_AMOUNT_MISMATCH` 대체(전용 `PAYMENT_TX_MISMATCH`는 §18.1)<br>② **§0.5 금액 `display` 객체 신설** — `amount`(KRWS 정수 원본) + `display{currency, approx, rate, asOf}`. 환율은 표시 전용, 요청 본문에서 무시. 목록은 루트 `rate` 축약형<br>③ **§0.6 `Accept-Language` 신설**(en 기본·ko, 회원 `locale` 우선), **§0.7 체인·컨트랙트 노출 규칙 신설**(`chainId 1001`/`0x3e9`, KaiaScan 절대 URL, 주소 3종, 관객 화면 비노출)<br>④ **`charge` 도메인 신설**(API-charge-01~04) — 해외/국내 카드·가상계좌 충전, `CoinIssuerPort.mint`, 시연용 입금 시뮬레이션. 멱등키 필수 추가<br>⑤ **`wallet` 도메인 재정의**(API-wallet-01~05) — 회원 1:1 비수탁 지갑, 외부 지갑 챌린지·`ecrecover` 검증, 가스 자동 충전. v3 팀 지갑 경로 2개 폐기<br>⑥ **`redeem` → `withdraw` 개명**(API-withdraw-01~04) — 리더 서명 예치 → 원화 이체 → burn, 이체 실패 시 금고→리더 반환. 자동 push 환급 폐기, `redemption` → `coin_withdrawal`<br>⑦ **API-member-01 Web3Auth 로그인/가입 신설** — idToken JWKS 검증 + 지갑 등록 + 세션. v3 소셜 OAuth API 삭제, 구 member-01은 member-08(이메일 가입 보조)로 이동. member-07 P1 강등<br>⑧ **결제 재작성**(payment-01·02·03) — `BALANCE` / `AUTO_CHARGE` 2모드, `approve`+`purchase` 2단계 서명, `Purchased` 이벤트 8항목 검증, 서명 거부 시 코인은 잔액으로 남음<br>⑨ **보증금**(performance-13·14, P-21 50,000 KRWS 리더 서명) · **동의 서명**(rule-03 `prepare`·rule-05 `signed-tx`, `PENDING→SIGNING→AGREED`) 신설<br>⑩ **coin-02·03·04 신설**(표시 환율 조회·등록, 체인·컨트랙트 설정), **verify-02 준비금 공시 부활**, coin-02·03 → coin-05·06(P1) 번호 이동<br>⑪ **환불이 온체인 1건으로** — `refund` tx가 에스크로 → 관객 지갑 KRWS 반환 + 카운터 −1. `cancelChoice` 삭제, 금융망 환불 이체·burn 폐기, 환불금은 잔액 유지(P-20)<br>⑫ **정산 종단 `RELEASED`** — `REDEEMED` 삭제, release는 리더 지갑 push + 보증금 반환. 계좌 미등록이 release를 막지 않음. `settlement_share`에 `released`·`walletAddress`·`withdrawnAmount`<br>⑬ **양도에서 온체인 tx 제거** — `recordChoice`·`cancelChoice` 삭제로 수락자 선택은 오프체인만, 온체인 카운터는 원 구매자 선택 유지(§18.3 #4 판단 지점)<br>⑭ **검증 강화** — verify-01에 `tokenAddress`·에스크로/release/보증금 대사 3종, verify-02에 `supplyReconciliation`(불변식 1). chain-01에 `signerType`·`issuerType`·`verification`<br>⑮ **§18 규격 v4 신설 제안 34개**(`CHARGE_*` 6 · `WITHDRAW_*` 5 · `WALLET_*` 4 · `PAYMENT_*` 4 · `AUTH_WEB3AUTH_*` 2 · `PERFORMANCE_DEPOSIT_*` 2 · 기타 11) + 폐기 후보 12개 + 판단 지점 12개 + Q&A 방어 논리<br>⑯ 도메인 15 → **16개**, 멱등키 5 → **7개**, 감사 `action_type`에서 `KEY_DECRYPT` 삭제·`OPERATOR_SIGN`·`WALLET_LINK`·`RATE_CHANGE` 추가 |
