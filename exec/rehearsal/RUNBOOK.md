# 리허설 2 대본 — 1층 예외 경로 (S15P21B204-89)

- 일시: 2026-09-17 오전 · 대상: dev(Kairos 실체인)
- 작성: 2026-09-16. 근거는 전부 `backend/` 소스다(문서가 아니라 코드로 확인했다). 파일·행 번호를 각 항목에 남겼다.
- 도구: `exec/rehearsal/rehearse.sh` (호출) · `exec/rehearsal/seed-times.sql` (시각·권한 시드)
- 양해미 몫: 시드 준비 + 관객·리더·관리자 계정 API 호출
- **실행하지 않았다.** 아래 모든 기대 결과는 코드를 읽어 도출한 것이고 dev 에서 검증하지 않았다.

```bash
export BASE_URL=https://j15b204.p.ssafy.io     # 실제 dev 주소로 바꾼다
export TOKEN=...                                # 단계마다 주체가 다르다. "주체" 열을 본다
cd exec/rehearsal && ./rehearse.sh help
```

---

## 0. 맨 먼저 — 시나리오 6 진행 여부 판별

| 순서 | 단계 | 주체 | 조작 | 기대 결과 | 실패 시 판단 |
|---|---|---|---|---|---|
| 0-1 | 배포 판별 | 사람 | 브라우저에서 관객 A 로 로그인 → `/tickets/{보유 티켓 id}` 를 연다 | **실제 QR 이미지**가 렌더된다 | QR 이 없거나 placeholder 면 A-06/S-02 배포가 안 된 것이다 → **시나리오 6 을 이번 회차에서 뺀다.** 시나리오 1 부터 시작하고, Jira -89 에 "시나리오 6 다음 회차 이월" 코멘트를 남긴다 |
| 0-2 | 백엔드 생존 | 사람 | `curl -s "$BASE_URL/api/v1/performances?page=0&size=5"` | `{"code":"SUCCESS",...}` | 500·502 면 이강륜에게. 리허설 전체 중단 |

> 0-1 에서 QR 이 뜨더라도 **검표 엔드포인트가 배포됐는지는 별개**다. B-6-3 에서 처음 확인된다.

---

## A. 시드 준비 구간

> ⛔ **대본이 쓰던 공연 5·6 은 dev 에 없다.** 2026-09-17 12:40 확인 —
> `GET /api/v1/performances` 가 `totalElements: 0` 이다. **A-0 에서 두 개를 새로 만들고,
> 그 실제 `performance_id` 로 아래를 전부 읽는다.**
>
> | 대본 표기 | 실제 `performance_id` | 쓰는 곳 |
> |---|---|---|
> | **공연 A** · 명령의 `<A>` | `__________` | 시나리오 6(검표) · 1(환불) · 2(취소) |
> | **공연 B** · 명령의 `<B>` | `__________` | 시나리오 3(이의 → release) |
>
> 명령의 `<A>`·`<B>` 를 그 번호로 바꿔 친다. **0-2 는 A-0 보다 앞이라 번호가 아직 없다** —
> 백엔드 생존은 목록으로 확인하고 단건 조회는 A-0 뒤에 한다.
>
> `seed-times.sql` §0 의 `@perf_a`·`@perf_b`·`@admin_member` 세 줄에 같은 값을 적는다.
> 그 세 줄만 고치면 SQL 본문은 손대지 않는다. 비워 두면 UPDATE 가 0행이다(안전장치).

### A-0. 공연 A·B 를 만든다 — **브라우저**, 리더 계정

온체인 stage 가 0 이라 새로 만들어야 한다. 순서가 강제된다 — `RuleService.startSale` 이
`isDepositPaid()` 를 요구하고, 보증금·동의는 **사용자 지갑 서명**이라 리더 계정 주인이 직접 눌러야 한다.

| 순서 | 단계 | 주체 | 조작 | 기대 결과 | 실패 시 판단 |
|---|---|---|---|---|---|
| A-0-0 | **리더 잔액 확인** | 스크립트 | `TOKEN=<리더> ./rehearse.sh me` | 잔액 **100,000 이상** | 보증금이 공연당 `DEPOSIT_AMOUNT = 50_000`(`PerformanceService:138`)이라 공연 두 개면 정확히 10만이다. 가입 지급이 10만이므로 **리허설 1 에서 조금이라도 썼으면 A-0-6 에서 막힌다** → 관리자 토큰으로 `./rehearse.sh grant <리더 memberId> <부족분> reh2-grant-leader-20260917` 를 먼저 |
| A-0-1 | 공연 A 생성 | **브라우저**(리더) | `/studio/performances/new` — 공연일 **5일 뒤**, 표 25,000 × 옵션 1, 참여팀 1 | `DRAFT` 로 생성, `performanceId` 확보 | 5일 뒤여야 D-3 환불 마감이 미래다. 더 가까우면 시나리오 1 이 `REFUND_DEADLINE_PASSED` 로 막힌다 |
| A-0-2 | 규칙 저장 | 브라우저 | 정산 규칙 화면에서 비율 합 10000bp | 저장됨 | 합이 10000 이 아니면 나중에 집계가 `RULE_RATIO_SUM_INVALID` 로 막힌다 |
| A-0-3 | 보증금 납부 | **브라우저**(리더 지갑) | 보증금 — **서명 2회**(APPROVE → DEPOSIT) | 두 job 이 차례로 `CONFIRMED` | 스크립트 불가(사용자 서명 RLP). **APPROVE 가 확정된 뒤에 DEPOSIT 을 서명한다** — 먼저 누르면 allowance 가 없어 실패한다(`PerformanceEditPage.tsx:24`) |
| A-0-4 | 규칙 동의 | **브라우저**(리더 지갑) | 동의 — **서명 1회** | 동의 확정 | 참여팀이 여럿이면 팀마다 필요하다 |
| A-0-5 | 판매 시작 | 브라우저 | 판매 시작 | `ON_SALE` · `on_chain_id` 채워짐 | 보증금이 확정되지 않았으면 여기서 막힌다(`startSale` 이 `isDepositPaid()` 를 본다) |
| A-0-6 | 공연 B 생성 | 브라우저 | A-0-1~5 를 한 번 더 | `ON_SALE` | 시각은 A-2 이후 SQL 로 과거로 민다 — **여기서는 미래로 둔다** |
| A-0-7 | **공연 B 표 구매** | **브라우저**(관객 A) | 공연 B 를 **1매 이상** 예매 — `/performances/<B>` → 주문 → 결제 서명 | `ISSUED` 티켓 1매 · 에스크로에 판매대금 | **여기서 안 사면 시나리오 3 이 빈 정산 위에서 돈다.** A-2 §3 이 공연 B 를 과거로 밀어 `ENDED` 로 보내면 그 뒤로는 못 산다(판매 마감). B-3-8 "팀 잔액 증가" 가 0 이 되고, 0매출 집계가 거절되는지 통과하는지는 **확인하지 못했다** — 매출을 만들어 두는 쪽이 안전하다 |
| A-0-8 | 번호 기록 | 사람 | 두 `performanceId` 를 위 표와 `seed-times.sql` §0 에 적는다 | — | **여기서 안 적으면 A-2 부터 전부 어긋난다** |

> A-0 은 티켓 구매(A-8)보다 **먼저**다. 공연 A 가 `ON_SALE` 이어야 관객이 살 수 있다.
> **공연 B 의 표는 A-0-7 이 마지막 기회다** — A-2 §3 이 B 를 `ENDED` 로 보내면 판매가 닫힌다.
> 첫 로그인은 지갑 생성 때문에 오래 걸린다 — 관객 A·B·리더·관리자 **4개 계정 로그인을 A-0 전에 미리** 돌려 둔다.

관객 A·B 계정은 각각 **지갑 연결 → 100,000 YoYo 자동 지급**을 이미 마쳤다고 본다.
`WalletService.registerWallet` 이 등록과 동시에 `SIGNUP_GRANT_AMOUNT = 100_000` MINT job 을 넣는다
(`wallet/service/WalletService.java:84, :367`). **가입 지급만으로 요구 잔액 100,000 이 채워진다 —
`coin-07` 관리자 지급은 리허설 1 에서 잔액을 쓴 만큼만 보충하는 용도다.**

| 순서 | 단계 | 주체 | 호출 또는 조작 | 기대 결과 | 실패 시 판단 |
|---|---|---|---|---|---|
| A-1 | 관리자 승격 | 사람(배포 담당) | `seed-times.sql` §1 — `UPDATE member SET is_admin = TRUE WHERE member_id = ?` | 1행 | 관리자 승격 API 가 **없다.** `member.is_admin` 컬럼이 유일한 출처다(`V1__init.sql:42` → `MemberService:374` → `JwtTokenProvider` 의 `adm` 클레임 → `SecurityConfig` 의 `hasRole('ADMIN')`) |
| A-2 | 공연 A·B 시각 조정 | 사람(배포 담당) | `seed-times.sql` §2·§3 | 각 1행 | `WHERE status` 가 안 맞아 0행이면 멈춘다. 상태를 SQL 로 고치지 않는다(체인과 갈린다) |
| A-3 | 상태 전이 대기 | 사람 | `TOKEN=<공연 B 생성자 리더> ./rehearse.sh show <B>` 를 60초 간격으로 반복 | `status: "ENDED"` | 5분 지나도 SALE_CLOSED 면 `PerformanceStatusScheduler`(`@Profile("!test")`, `PT60S`)가 안 도는 것이다 → 이강륜에게 서버 로그 확인 요청. **404 는 전이 실패가 아니라 토큰 문제다** — `ENDED` 는 공개 조회가 안 된다(아래 주) |
| A-4 | 공연 A·B 확인 | 사람 | `TOKEN=<공연 A·B 리더> ./rehearse.sh seed <A> <B>` | A = `ON_SALE`, B = `ENDED`. A 의 `saleCloseAt`·`cancelDeadlineAt` 이 모두 미래 | A 가 `SALE_CLOSED` 면 `sale_close_at` 이 과거다. A-2 를 다시. B 가 404 면 그 토큰이 공연 B 의 리더가 아닌 것이다 — `show <A>`·`show <B>` 을 각자 토큰으로 나눠 부른다 |
| A-5 | 토큰 확보 (관객 A) | 사람 | 아래 **"토큰 얻는 법"** | `TOKEN` 30분짜리 | (C) 사전 준비물. CLI 가 스스로 만들 수 없다 |
| A-6 | 관객 A 상태 | 스크립트 | `TOKEN=<A> ./rehearse.sh me` 후 `./rehearse.sh tickets` | 지갑 주소가 있고, `ISSUED` 티켓 **2매 이상** | 지갑이 없으면 `WALLET_NOT_FOUND` → 브라우저에서 지갑 연결부터. 티켓이 모자라면 A-8 |
| A-7 | 잔액 보충(필요 시) | 스크립트 | `TOKEN=<관리자> ./rehearse.sh grant <A memberId> <부족분> reh2-grant-A-20260917` | 202 → `CONFIRMED`. `grantRef` 가 찍힌다 | `WALLET_NOT_FOUND`(404) = 대상에 지갑 없음. `COMMON_CONFLICT` = 지갑 정지. `COIN_RESERVE_MISMATCH` = 공급 대사 깨짐 → 이강륜 |
| A-8 | 티켓 부족 시 추가 구매 | **브라우저** | 관객 A 로 공연 A 예매 (`/performances/<A>` → 주문 → 결제 서명) | `ISSUED` 티켓이 2매 이상 | **스크립트 불가.** `POST /orders/{id}/payment/signed-tx` 가 사용자 지갑 서명 RLP 를 받는다 |
| A-9 | 관객 B 확인 | 스크립트 | `TOKEN=<B> ./rehearse.sh me` | 잔액 100,000 | 부족하면 A-7 을 B 로 (멱등키 `reh2-grant-B-20260917`) |
| A-10 | 검표 링크 | 스크립트 | `TOKEN=<공연 A 생성자 리더> ./rehearse.sh entrylink <A>` | `entryWindow` 가 **지금을 포함**. `token` 확보 | 포함하지 않으면 A-2 의 `entry_start_at` 이 안 먹은 것이다. 시나리오 6 중단 |
| A-11 | 티켓 배역 확정 | 사람 | A-6 출력에서 티켓 id 두 개를 골라 아래 표에 적는다 | — | **여기서 안 적으면 B 구간에서 섞인다** |

> ⚠️ **공연 조회는 상태에 따라 토큰이 필요하다.** 공개로 보이는 상태는 `ON_SALE`·`SALE_CLOSED`
> 둘뿐이고(`PerformanceService:195` `PUBLIC_STATUSES`), **`ENDED`(공연 B)·`CANCELLED`(취소 후 공연 A)는
> 그 공연의 생성자·참여팀 리더만 본다**(`:1447` `isInsider` — 관리자 우회가 없다).
> 그래서 A-3·A-4·B-2-4 는 리더 토큰으로 부른다. 토큰이 없으면 `PERFORMANCE_NOT_FOUND`(404) 다 —
> **공연이 사라진 것이 아니다.**

### 티켓 배역 — 리허설 시작 전에 채운다

| 배역 | ticketId | 어디서 쓰나 | 섞이면 |
|---|---|---|---|
| **검표용** | `__________` | B-6-2·B-6-3 에서 스캔 → `USED` 가 된다 | — |
| **환불용** | `__________` | B-1-2 개별 환불 | 검표용을 환불하면 `TICKET_ALREADY_USED`(409) — `RefundService:317` |

> `RefundService.quote` 는 `ISSUED` 만 통과시킨다. `USED` 는 `TICKET_ALREADY_USED`, `CANCELLED` 는 `TICKET_CANCELED` 다. 한 번 섞이면 그 티켓으로는 되돌릴 수 없다.

### D-54 — 이의제기 기간 주입 (배포 담당 이강륜 몫 · B-3 전에 끝나야 한다)

`SETTLEMENT_DISPUTE_PERIOD` 는 dev `.env` 에 **키는 있으나 값이 비어 있다**(`.env.example:74`).
비면 `application.yml:182` 의 기본 `48h` 다.

**순서가 제약이다.** 마감 시각은 LOCK job 이 **온체인에서 확정되는 순간**의 설정값으로 굳는다 —
`SettlementConfirmationService:240` 의 `settlement.markLocked(txHash, confirmedAt.plus(properties.disputePeriod()))`.
잠근 뒤에 값을 바꿔도 이미 굳은 `dispute_deadline_at` 은 바뀌지 않는다.

| 순서 | 단계 | 주체 | 조작 | 기대 결과 | 실패 시 판단 |
|---|---|---|---|---|---|
| A-D54-1 | 값 주입 | **이강륜** | dev `.env` 에 `SETTLEMENT_DISPUTE_PERIOD=PT5M` | — | 5분은 B-3-3~B-3-5(이의 접수 → admin 판정)를 끝낼 수 있는 최소치다. 더 짧게 잡지 않는다 |
| A-D54-2 | **재배포** | **이강륜** | `cd ~/app && IMAGE_TAG=$(grep -m1 '^IMAGE_TAG=' .env \| cut -d= -f2-) bash deploy/blue-green.sh` | 쉬는 색이 새 `.env` 로 뜨고 전환, `cat ~/app/active_color` 가 바뀜 | **`docker restart` 로는 안 된다.** compose 가 `${SETTLEMENT_DISPUTE_PERIOD:-48h}` 를 **해석 시점**에 굳히므로 재기동은 컨테이너에 박힌 구 값을 다시 쓴다. 블루/그린 뒤에는 `backend` 서비스가 없다(`backend-blue`·`-green`) — 같은 태그로 `blue-green.sh` 를 한 번 더 돌리면 쉬는 색이 새 값으로 떠서 무중단이다. **새 활성 색만 5분이다** — 그 사이 롤백하면 48h 색으로 돌아간다 |
| A-D54-3 | 반영 확인 | 양해미 | B-3-2 `lock` 응답의 `disputeClosesAt` | 지금 + 약 5분 | **+48h 면 주입·재배포가 안 된 것이다.** 여기서 멈추고 B-3-2 를 되돌릴 수 없다는 점을 인지한다 — 재집계 경로가 없어 그 공연의 시나리오 3 은 끝난다 |

> ⚠️ **A-D54-2 가 끝나기 전에는 절대 `lock` 을 부르지 않는다.** 순서는 값 주입 → 재배포 → 잠금이다.

### 토큰 얻는 법 (C · 사전 준비물)

로그인 경로는 Web3Auth(`POST /auth/web3auth`) **하나뿐**이다. 이메일 로그인·가입은
`MemberService:216, :222` 에서 `COMMON_INTERNAL_ERROR "미구현"` 을 던진다. idToken 은 실제 JWKS 로
검증되므로 CLI 가 스스로 만들 수 없다.

권장 절차 — **브라우저 DevTools Network 탭**에서 로그인 응답의 `accessToken` 을 복사한다(30분 유효, `application.yml:120`).

> ⛔ `localStorage['b204.refreshToken']` 를 꺼내 `POST /auth/refresh` 를 부르지 마라.
> refresh 는 **회전**이라 쓴 jti 를 즉시 폐기하고, 브라우저가 그 다음 자동 refresh 를 시도하면
> **재사용 감지로 그 회원의 모든 세션이 통째로 폐기된다**(`MemberService:239-244`).
> CLI 와 브라우저가 같은 계정의 refresh token 을 공유하면 둘 다 죽는다.
> 토큰이 만료되면 브라우저에서 새로고침한 뒤 Network 탭에서 새 `accessToken` 을 다시 복사한다.

예외 — **A-1 직후의 관리자 계정만은** `adm` 클레임을 새로 받아야 한다. `is_admin` 은 토큰 발급
시점에 굳는다. A-1 전에 받은 토큰으로 `/api/v1/admin/**` 를 부르면 `COMMON_FORBIDDEN`(403) 이다.
→ A-1 뒤에 관리자 계정을 **브라우저에서 로그아웃 후 다시 로그인**하고 그때의 `accessToken` 을 쓴다.

---

## B. 리허설 진행 구간

순서는 **시나리오 6 → 1 → 2 → 3** 이다. 6 이 1 앞이다.
시나리오 6·1·2 는 공연 A, 시나리오 3 은 공연 B 을 쓴다.

### 시나리오 6 — A-08 QR → S-02 스캔 → USED → S-03 반영

| 순서 | 단계 | 주체 | 호출/조작 | 기대 결과 | 실패 시 판단 |
|---|---|---|---|---|---|
| B-6-1 | 관객 화면 | **브라우저** | 관객 A 가 `/tickets/{검표용}` 에서 QR 을 띄운다 | QR 이미지 · 60초마다 회전 | 화면만 확인. 판정은 서버가 한다 |
| B-6-2 | QR 토큰 발급 | 스크립트 | `TOKEN=<A> ./rehearse.sh qr <검표용 ticketId>` | `qrToken` · `expiresAt` 이 약 60초 뒤 | `TICKET_ALREADY_USED` = 이미 스캔된 티켓. 배역표를 다시 본다 |
| B-6-3 | 검표 | 스크립트 | `ENTRY_TOKEN=<A-10 토큰> ./rehearse.sh scan <A> <B-6-2 의 qrToken>` | `result: "ADMITTED"` · `enteredCount` 1 증가 | `ENTRY_QR_EXPIRED`(401) = 60초 넘겼다 → B-6-2 부터 다시. `ENTRY_NOT_IN_TIME_WINDOW`(409) = A-2 의 `entry_start_at` 미반영. `ENTRY_SCANNER_NOT_AUTHORIZED`(403) = `ENTRY_TOKEN` 이 틀렸다 |
| B-6-4 | 재스캔 거절 | 스크립트 | B-6-3 을 같은 qrToken 으로 한 번 더 | `ENTRY_ALREADY_ENTERED`(409) + "최초 입장 HH:mm" | 두 번 다 ADMITTED 면 **결함**이다. Redis `entry:{ticketId}` SETNX 마커를 확인해야 한다 |
| B-6-5 | S-03 반영 | 스크립트 | `./rehearse.sh entrystat <A>` | `enteredCount` 가 B-6-3 만큼 | 0 이면 스캔이 반영되지 않았다 |
| B-6-6 | 티켓 상태 | 스크립트 | `TOKEN=<A> ./rehearse.sh tickets` | 검표용 티켓이 `USED` | — |

### 시나리오 1 — 개별 환불 (공연 A · 환불용 티켓)

| 순서 | 단계 | 주체 | 호출/조작 | 기대 결과 | 실패 시 판단 |
|---|---|---|---|---|---|
| B-1-0 | 잔액 스냅샷 | 스크립트 | `TOKEN=<A> ./rehearse.sh me` | 환불 전 balance 를 적어 둔다 | — |
| B-1-1 | 미리보기 | 스크립트 | `./rehearse.sh quote <환불용 ticketId>` | `refundAmount`·`feeStage` | `REFUND_DEADLINE_PASSED`(409) = A-2 의 `cancel_deadline_at` 이 과거. `TICKET_ALREADY_USED` = 검표용을 잘못 골랐다 |
| B-1-2 | 환불 접수 | 스크립트 | `./rehearse.sh refund <환불용 ticketId> reh2-refund-A-20260917` | 202 → 폴링 `CONFIRMED` | `COMMON_VALIDATION_FAILED` "환불 예정액이 바뀌었습니다" = 수수료 구간이 넘어갔다 → B-1-1 부터 다시. `REFUND_ALREADY_REQUESTED`(409) = 이미 환불된 티켓 |
| B-1-3 | **USED 환불 거절 확인** | 스크립트 | `./rehearse.sh quote <검표용 ticketId>` | `TICKET_ALREADY_USED`(409) | 통과해 버리면 **결함**이다. 스크립트는 여기서 멈춘다(정상 동작) |
| B-1-4 | 반영 확인 | 스크립트 | `./rehearse.sh tickets` · `./rehearse.sh me` | 환불용 티켓 `CANCELLED` · 잔액이 `refundAmount` 만큼 증가 | 잔액이 그대로면 `wallet:balance` 캐시 지연일 수 있다. 1분 뒤 재확인 후에도 같으면 이강륜 |

> 멱등키를 바꾸지 마라. 재실행은 **같은 키**로 해야 두 번 환불되지 않는다(`RefundService:144`).

### 시나리오 2 — 공연 취소 halt (공연 A)

| 순서 | 단계 | 주체 | 호출/조작 | 기대 결과 | 실패 시 판단 |
|---|---|---|---|---|---|
| B-2-1 | 주체 확인 | 사람 | `TOKEN` 을 **공연 A 생성자 팀 리더**로 바꾼다 | — | **관리자는 대신 못 한다.** `PerformanceService.cancel` → `requireOwnedPerformance` 가 생성자 팀 리더만 통과시킨다(admin 예외 없음). 관리자 토큰이면 `PERFORMANCE_NOT_OWNER`(403) |
| B-2-2 | 취소 접수 | 스크립트 | `./rehearse.sh cancelshow <A> reh2-cancel-p5-20260917 "리허설 2 공연 취소"` | 202 → halt job `CONFIRMED`. `targetTicketCount` 에 **`USED` 티켓도 포함**된다 | `PERFORMANCE_INVALID_STATUS` = 이미 취소됐거나 DRAFT/PENDING_AGREEMENT. `SETTLEMENT_ALREADY_RELEASED` = 정산이 이미 끝난 공연 |
| B-2-3 | 일괄 환불 추적 | 스크립트 | `TOKEN=<A> ./rehearse.sh tickets` 를 몇 분 간격으로 | 남은 티켓이 전부 `CANCELLED` 로 바뀐다 | halt 확정 후 주문별 refund job 이 순서대로 나간다. 응답의 `jobId` 는 halt 하나뿐이라 refund 는 티켓 상태로 따라간다 |
| B-2-4 | 공연 상태 | 스크립트 | `TOKEN=<공연 A 생성자 리더> ./rehearse.sh show <A>` | `status: "CANCELLED"` | 토큰을 지우면 404 다 — `CANCELLED` 는 공개 상태가 아니다 |
| B-2-5 | **D-56 확인** | — | 아래 별도 절 | — | — |

#### D-56 — RELEASE job 이 큐에 있을 때 취소가 거절되는가

코드로 확인한 것: `PerformanceService.cancel` 은 공연 행을 잠근 뒤

```java
if (chainJobRepository.existsByTargetPerformanceIdAndTxTypeAndStatusIn(
        performanceId, ChainJob.TxType.RELEASE, RELEASE_IN_FLIGHT)
        || chainJobRepository.existsByTargetPerformanceIdAndTxTypeAndStatusAndFailureReason(
                performanceId, ChainJob.TxType.RELEASE, ChainJob.Status.FAILED, RELEASE_TIMED_OUT)) {
    throw BusinessException.of(ErrorCode.COMMON_CONFLICT,
            "정산 실행이 진행 중이라 공연을 취소할 수 없습니다.");
}
```

**`COMMON_CONFLICT` 로 거절되는 것이 맞다.**
`RELEASE_IN_FLIGHT = [PENDING, SUBMITTED, CONFIRMED]` 다(`PerformanceService:184-185`).
**`CONFIRMED` 도 막는다** — 확정과 정산 상태 반영 사이의 구간을 덮기 위해서다. 여기에 더해
`FAILED` 중 사유가 `CHAIN_TX_TIMEOUT` 인 job 도 막는다(브로드캐스트된 tx 가 나중에 블록에 들어가
에스크로를 비울 수 있으므로 결말을 모르는 쪽을 막는다). revert 로 실패한 job 은 통과시킨다.

| 순서 | 단계 | 주체 | 호출/조작 | 기대 결과 | 실패 시 판단 |
|---|---|---|---|---|---|
| B-2-D56 | 재현 | 스크립트 | 공연 **B** 에서 B-3-6 `release` 를 접수한 **직후**(폴링이 `PENDING`/`SUBMITTED` 인 동안) `TOKEN=<공연 B 생성자 리더> ./rehearse.sh cancelshow <B> reh2-d56-probe "D-56 확인"` | `COMMON_CONFLICT` + msg "정산 실행이 진행 중이라 공연을 취소할 수 없습니다." | 취소가 **접수되면** 결함이다 — Jira -89 에 응답 원문을 붙여 보고. 다른 코드(`PERFORMANCE_INVALID_STATUS` 등)면 그 코드를 그대로 기록한다 |

> 이 확인은 시나리오 3 의 release 와 **같은 순간**에만 가능하다. 미리 창을 띄워 두고 release 폴링이 시작되면 즉시 친다. 놓치면 "미확인" 으로 기록하고 넘어간다 — 억지로 만들지 않는다.

### 시나리오 3 — 이의 → admin-06 → release (공연 B)

| 순서 | 단계 | 주체 | 호출/조작 | 기대 결과 | 실패 시 판단 |
|---|---|---|---|---|---|
| B-3-0 | 상태 확인 | 스크립트 | `TOKEN=<관리자> ./rehearse.sh settlement <B>` | `status` 와 `actions.*.blockedReason` | **막히면 여기 이유가 적혀 있다.** 다른 어떤 추측보다 이 응답이 먼저다 |
| B-3-1 | 집계 확정 | 스크립트 | `./rehearse.sh aggregate <B>` | 202 → `CONFIRMED`, 이어서 `settlement <B>` 에서 `status: AGGREGATED` · `counterMatch: true` | `PERFORMANCE_INVALID_STATUS` = 공연 B 이 `ENDED` 가 아니다(A-3). `COIN_MINT_PENDING` = 미확정 결제·환불이 남았다 → 가라앉을 때까지 대기. `RULE_RATIO_SUM_INVALID` = 팀 비율 합이 10000bp 가 아니다 → **집계 전에 멈춘 것이라 복구 가능**. `TEAM_MIN_COUNT_NOT_MET` = 참여팀 0 |
| B-3-2 | **잠금** | 스크립트 | ⚠️ A-D54-2 재배포 완료 확인 후 `./rehearse.sh lock <B>` | 202 → `CONFIRMED`. `disputeClosesAt` ≈ 지금 + 5분 | `SETTLEMENT_AGGREGATE_MISMATCH` = `counterMatch` 가 true 가 아니다(온체인 카운터 불일치) → 이강륜. **`disputeClosesAt` 이 +48h 면 A-D54 실패다 — 되돌릴 수 없다.** 그대로 진행하려면 48시간을 기다려야 하므로 시나리오 3 은 중단하고 Jira 에 기록 |
| B-3-3 | 이의 제기 | 스크립트 | `TOKEN=<참여팀 리더> ./rehearse.sh dispute <B> <teamId> "리허설 2 이의"` | 201 · `disputeId` · `releaseHeld: true` | `COMMON_CONFLICT` "이의제기 기간이 종료되었습니다" = 5분을 넘겼다. `SETTLEMENT_NOT_PARTICIPANT` = teamId 가 참여팀이 아니다. `COMMON_FORBIDDEN` = 팀 리더가 아니다 |
| B-3-4 | release 보류 확인 | 스크립트 | `TOKEN=<관리자> ./rehearse.sh release <B>` | `SETTLEMENT_DISPUTE_PERIOD`(409) — 기간 중이거나 열린 이의가 있다 | **거절이 기대 결과다.** 여기서 스크립트가 멈추는 것이 정상이다. 통과하면 결함 |
| B-3-5 | admin-06 판정 | 스크립트 | `TOKEN=<관리자> ./rehearse.sh disputes <B>` → `./rehearse.sh resolve <disputeId> REJECTED "리허설 2 확인 — 분배 비율 이상 없음"` | `releaseHeld: false` | `adminComment` 는 10자 이상이어야 한다. `releaseHeld: true` 가 남으면 열린 이의가 더 있다 → `disputes` 로 찾아 전부 처리 |
| B-3-6 | **release** | 스크립트 | `disputeClosesAt` 경과를 확인한 뒤 `./rehearse.sh release <B>` | 202 → `CONFIRMED`. 팀 지갑에 분배 | ⚠️ **자동 스케줄러가 먼저 집을 수 있다.** `SettlementScheduler.releaseDueSettlements` 가 60초마다 돌며 마감이 지나고 열린 이의가 없는 정산을 자동 접수한다. `COMMON_CONFLICT` "정산 실행 작업이 진행 중입니다" 나 `SETTLEMENT_ALREADY_RELEASED` 가 나오면 **실패가 아니라 자동 실행이 이긴 것**이다 → `settlement <B>` 으로 결과를 확인하고 그 사실을 기록한다 |
| B-3-7 | 결과 확인 | 스크립트 | `./rehearse.sh settlement <B>` | `status: RELEASED` · 팀별 `txHash` | — |
| B-3-8 | 팀 잔액 | 스크립트 | `TOKEN=<참여팀 리더> ./rehearse.sh me` | 분배액만큼 증가 | 반영이 늦으면 1분 대기 후 재확인 |

> **"① 갈래" 를 REJECTED 로 해석했다.** Jira -89 본문의 갈래 번호를 직접 읽지 못했다.
> 리허설 시작 전에 확인하고, `RESOLVED` 가 맞으면 B-3-5 의 인자만 바꾼다(응답 형태는 같다).
> 둘 다 `releaseHeld` 를 푸는 데는 차이가 없다 — `Dispute.isOpen()` 이 `OPEN` 만 보기 때문이다.

---

## 부록 1 — (A)/(B)/(C) 분류표

### (A) 스크립트 가능 — 운영자 서명이거나 서명이 없다

| 단계 | 엔드포인트 | 주체 토큰 | 근거 |
|---|---|---|---|
| 코인 지급 | `PUT /api/v1/admin/coin/grants` | 관리자 | `CoinGrantService` — `chain_job(MINT, OPERATOR)` 행만 만든다. 서명은 서버 MINTER 워커 |
| 지급 이력 | `GET /api/v1/admin/coin/grants` | 관리자 | 조회 |
| 이의 목록·판정 | `GET`/`PATCH /api/v1/admin/disputes[/{id}]` | 관리자 | `AdminDisputeController` — **온체인 tx 를 만들지 않는다**(상태만 바꾼다) |
| 집계·잠금·실행 | `POST /performances/{id}/settlement/{aggregate,lock,release}` | 생성자 리더 **또는 관리자** | `SettlementGates.ownerOrAdmin` |
| 이의 제기 | `POST /performances/{id}/settlement/disputes` | 참여팀 리더 | `SettlementGates.dispute` |
| 정산 조회 | `GET /performances/{id}/settlement` | 참여팀·관리자 | — |
| 공연 취소 | `POST /performances/{id}/cancel` | **생성자 팀 리더만** | `requireOwnedPerformance` — 관리자 우회 없음 |
| 개별 환불 | `GET /tickets/{id}/refund-quote` · `POST /tickets/{id}/cancel` | 티켓 소유자 | `RefundService` — 환불 tx 는 OPERATOR 서명 |
| QR 토큰 | `GET /tickets/{id}/qr` | 티켓 소유자 | `qr_secret` HMAC 계산. 저장 없음 |
| 검표 링크 | `GET /performances/{id}/entry-link` | 생성자·참여팀 | `EntryLinkTokens` |
| 검표 | `POST /entries/verify` | `X-Entry-Token` | 서명 없음 |
| 입장 현황 | `GET /performances/{id}/entries` | `X-Entry-Token` | — |
| 공연 조회 | `GET /performances[/{id}]` | `ON_SALE`·`SALE_CLOSED` 는 **없어도 됨** / `ENDED`·`CANCELLED` 는 **그 공연 리더** | `SecurityConfig.PUBLIC_GET` + `PerformanceService:195·1447` |
| job 폴링 | `GET /chain/jobs/{jobId}` | 요청자 또는 관리자 | `ChainController` |

### (B) 브라우저 필수 — 사용자 지갑 서명이 필요하다

| 단계 | 왜 |
|---|---|
| 로그인 | `POST /auth/web3auth` 가 실제 JWKS 로 idToken 을 검증한다(`Web3AuthTokenVerifier`). 이메일 경로는 미구현(`MemberService:216, :222`) |
| 지갑 등록 (`POST /wallets`) | `WEB3AUTH` 경로는 세션의 idToken `wallets` 클레임과 대조하고, `EXTERNAL` 경로는 challenge 에 대한 **사용자 개인키 서명**을 요구한다(`WalletService:352-357`). **자체 챌린지 서명 경로도 (B) 다** |
| 보증금 납부 (performance-14) | 사용자 서명 RLP |
| 티켓 구매 (`POST /orders/{id}/payment/signed-tx`) | 사용자 서명 RLP |
| A-06 QR 화면 확인 | 화면 확인 자체가 목적 |

### (C) 사전 준비물 — 사람이 미리 얻어 스크립트에 넘긴다

| 값 | 얻는 법 | 주의 |
|---|---|---|
| 관객 A·B·리더·관리자 `accessToken` | 브라우저 로그인 → DevTools Network 탭의 로그인 응답 | 30분 만료. refresh token 을 CLI 로 빼 쓰면 **브라우저 세션이 통째로 죽는다** |
| 관리자 `is_admin` | `seed-times.sql` §1 UPDATE **후 재로그인** | 토큰 발급 시점에 굳는다 |
| `ENTRY_TOKEN` | `./rehearse.sh entrylink <A>` 출력 | 유효기간 = 입장 종료 + 2시간 |
| `SETTLEMENT_DISPUTE_PERIOD` | 이강륜이 `.env` 주입 + 재배포 | lock **전에** |
| 공연 A·B 시각 | `seed-times.sql` §2·§3 | 배포 담당이 DB 에서 |
| teamId (B-3-3) | `./rehearse.sh settlement <B>` 응답의 분배 내역 | — |
| 멱등키 | 대본에 미리 적힌 문자열을 그대로 | 재실행 시 **같은 키**. 새로 만들면 중복 실행 |

---

## 부록 2 — 확인하지 못한 것 (모르는 것을 아는 척 적지 않는다)

1. **dev 의 실제 데이터 상태.** 공연 A·B 이 존재하는지, 현재 상태가 무엇인지, 관객 A 가 티켓을 몇 장 갖고 있는지 전부 **모른다.** dev 에 붙지 않았다. A-4·A-6 이 그 확인 단계다.
2. **Jira -89 의 "① 갈래" 가 무엇인지.** Jira 본문을 읽지 못했다. `REJECTED` 로 가정했다(B-3-5 각주).
3. **시나리오 3 이 쓸 공연 B 의 판매 실적.** 정산할 에스크로가 실제로 있는지, 참여팀이 몇 팀이고 비율 합이 10000bp 인지 모른다. B-3-0 `settlement <B>` 이 첫 확인이다.
4. **A-06/S-02 배포 여부.** 0-1 에서 판단한다.
5. **dev `.env` 의 실제 내용.** `.env.example:74` 에 `SETTLEMENT_DISPUTE_PERIOD=` 로 키만 있는 것을 확인했을 뿐 dev 서버의 `.env` 는 보지 못했다. 빈 문자열이 주입된 경우 Spring 이 `48h` 기본값으로 떨어지는지 빈 Duration 바인딩 오류가 나는지도 **미검증**이다.
6. **스크립트를 실행하지 않았다.** `bash -n` 문법 검사와 JSON 추출 함수 단위 확인만 했다. HTTP 경로·헤더는 컨트롤러 소스와 대조했으나 실제 응답으로 검증하지 않았다.
7. **자동 release 스케줄러와 수동 release 의 경합 결과.** 코드상 둘 다 같은 게이트를 지나므로 하나만 접수되지만, 실제로 어느 쪽이 이기는지는 타이밍이다. B-3-6 에 두 갈래를 다 적어 뒀다.

---

## 부록 3 — 산출물

| 파일 | 내용 |
|---|---|
| `exec/rehearsal/rehearse.sh` | 서브커맨드 21개. `BASE_URL`·`TOKEN`·`ENTRY_TOKEN` 환경변수, 멱등키는 인자. 개인키를 다루지 않는다. 2xx 이 아니거나 `code != SUCCESS` 면 즉시 중단. jobId 를 내는 호출은 `CONFIRMED` 까지 폴링하고 `FAILED` 면 중단 |
| `exec/rehearsal/seed-times.sql` | `member.is_admin` · 공연 A·B 시각. **온체인에 올라가지 않는 값만** 건드린다(근거는 파일 머리말). 상태·티켓·정산·지갑은 손대지 않는다 |
