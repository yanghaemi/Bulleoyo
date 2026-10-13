# ERD 설계 v4 (2026-09-02)

> **9/2 팀 결정 — 최소 사이즈 원칙 + Web3Auth 동결**(v1 §14 `[팀 9/2]`, v4에서도 전부 유지): ① 인증·지갑 = **Web3Auth 단일**(소셜 3종). 자체 이메일 가입·로그인은 **P1**(F-member-02·10, API-member-02·08, C-02) — `member.password_hash`·`auth_provider='LOCAL'`은 예약 컬럼·예약값으로만 남는다. ② 외부 지갑 연결은 **Web3Auth 모달의 외부 지갑 어댑터**로 처리하고 자체 챌린지 서명 API(API-wallet-03·04, F-wallet-05)는 **P1**. 수수료 대납 서명을 지원하는 **Kaia Wallet만 MVP**, MetaMask는 P1. ③ 체인·컨트랙트 설정은 프론트 환경변수 하드코딩, API-coin-04·F-coin-09는 **P1**. ④ 기본 언어 en·통화 USD 고정. ⑤ 코인 이름은 **KRWS** 그대로 발표. ⑥ **양도(선물)는 최후순위(P2)** — `transfer` 테이블은 유지하되 MVP SQL에서 제외한다. ⑦ **가스 = Kaia 수수료 대납(fee delegation)** — 사용자 지갑에 KAIA를 넣지 않는다. 사용자 서명 tx는 `FeeDelegatedSmartContractExecution` 타입으로 프론트가 발신자 서명만 하고 서버(운영지갑 = fee payer)가 대납 서명 후 전송한다. 따라서 `signed-tx` 보고 본문은 `txHash`가 아니라 **발신자 서명 RLP**이며, `chain_job`의 `fee_delegated`·`fee_payer_address`·`sender_signed_rlp` 3컬럼이 그 근거다.

> 개정 2026-09-02(수) 오후 · 기준: [`../planning/06_방향전환_코인전환_v2.md`](../planning/06_방향전환_코인전환_v2.md) §8(ERD v4 변경 지시) · §7(상태 enum) · §2·§3(컬럼 의미 근거) (+ 덧씌워지지 않은 v1 절)
> 이전 버전: [10_ERD_v3.md](./10_ERD_v3.md)(24 테이블, v3.1) — 원본은 수정하지 않는다.
> 컨벤션: 02_개발_컨벤션.md §4 — snake_case, 단수형, PK `테이블명_id`, 예약어 회피(performance, ticket_order), 금액 BIGINT, 체인 주소 CHAR(42), tx 해시 CHAR(66). 금액 단위는 **KRWS 정수(1 KRWS = 1원, decimals=0)**.
>
> **화폐가 코인인 미래를 가정한다. 플랫폼은 시연용 코인을 지급할 뿐이며(화폐 발행 기관이 아니다), 모든 가치 이동은 지갑 간 온체인 전송이다.** 티켓 결제·환불·보증금·정산 분배·팀 수령이 전부 KRWS 하나로 일어나고, 법정화폐 입출구가 존재하지 않으므로 v4 ERD에는 계좌·법정화폐 거래 식별자·코인 확보/반출 이력 테이블이 없다. 남은 가치 이동의 근거는 `chain_job`(온체인 작업)·tx 해시·`wallet` 참조뿐이다.
> **지갑은 사용자 소유(Web3Auth/Kaia Wallet), 서버는 사용자 키를 보관하지 않는다.** `wallet` 테이블에는 개인키·니모닉·MPC 샤드·DEK 등 **어떤 암호화 키 컬럼도 없다**(v3.1 그대로).
>
> v3.1 대비 변경 요약 — 테이블 **4개 삭제**(v3.1 2번 리프레시 토큰[v4.1, Redis 대체] · 3번 회원 계좌 · 15번 코인 확보 이력 · 22번 팀 코인 반출 이력), `team`에서 정산 계좌 참조 컬럼(`settlement_account_id`) 삭제, `payment`에서 `mode`·자동 코인 확보 참조 컬럼 삭제 및 `status` 7종 → **6종**(`CHARGING` 제거), `settlement_share`에서 반출 누계 컬럼 삭제, `chain_job.tx_type` 15종 → **12종**(소각 1종·금고 2종 제거), `audit_log.action_type` 10종 → **8종**(소각·코인 확보·코인 반출 3종 제거, `GRANT` 신설). `exchange_rate`(표시 환율)·`wallet`(키 컬럼 없음)·v3.1 수수료 대납 컬럼 3종은 **그대로 유지**. (**24 → 21 테이블**, MVP는 `transfer` 제외 **20**)

## 0. 읽기 전 메모

- **`wallet_challenge`는 테이블이 아니다.** 외부 지갑 등록용 서명 챌린지(nonce·메시지·만료)는 Redis key `wallet:challenge:{memberId}` TTL 300s로만 보관한다. 1회용·5분 만료라 영속화 가치가 없으므로 **20 테이블에 포함하지 않는다.**
- **리프레시 토큰은 테이블이 아니다.** 세션 리프레시 토큰은 **Redis**에만 보관한다 — key `auth:refresh:{jti}`(값 = `memberId`·발급 시각·회전 이력 포인터), TTL 14일. 로그아웃·회전 시 즉시 삭제(`DEL`)하고, 회원 단위 일괄 폐기는 `auth:refresh:member:{memberId}` 집합으로 처리한다. 만료가 곧 정리이므로 영속 테이블·`revoked` 플래그·정리 배치가 모두 필요 없다. **20 테이블에 포함하지 않는다.**
- **`coin_job`은 부활하지 않는다.** mint·approve·purchase·refund·release·보증금 납부·보증금 반환까지 **모든 온체인 작업은 `chain_job` 한 테이블**이 `tx_type`으로 구분해 담는다.
- **시연용 지급 이력 테이블을 만들지 않는다**(결정 문서 v2 §2.2 [권]). 가입 시 기본 지급과 관리자 추가 지급은 `chain_job(tx_type='MINT', wallet_id=수신 지갑, amount, requester_id, idempotency_key=grantRef)` 한 행이 곧 이력이다. `requester_id`가 NULL이면 가입 시 자동 지급, 값이 있으면 관리자 지급이다.
- **`wallet_tx`도 테이블이 아니다.** 지갑 거래 이력(API-wallet-02)은 `chain_job`(`wallet_id`·`tx_type`·`amount`·`status`·`tx_hash`)을 회원 지갑 기준으로 조회해 만든다. 결정 문서 v2 §7의 필터 값 `GRANT/PURCHASE/REFUND/RELEASE/DEPOSIT/DEPOSIT_RETURN`은 `tx_type` 매핑이며(`GRANT` ← `MINT`), 별도 원장 테이블을 두지 않는다.
- **P1·P2 항목을 위한 컬럼은 만들지 않는다.** 예약은 enum 값 주석으로만 남긴다(`member.auth_provider` P1 `LOCAL`, `chain_job.issuer_type` P2 `EXTERNAL`, `performance.deposit_status` P1 `FORFEITED`, `wallet.provider`의 MetaMask는 P1이지만 값은 `EXTERNAL` 그대로).
- **서버 보관 키는 OPERATOR·MINTER 2개**뿐이며 DB에 저장하지 않는다(내부 서브넷 주입). v3.1의 세 번째 서버 키는 삭제됐다. 사용자 키는 어떤 테이블에도 없다.
- **`member.status`의 `WITHDRAWN`은 회원 탈퇴 상태값**이며 코인·법정화폐 도메인과 무관하다. v3.1 그대로 유지한다(결정 문서 v2 §8 — `member` 유지).
- **`exchange_rate`를 참조하는 업무 컬럼이 v4에는 없다.** v3.1에서 유일한 참조였던 코인 확보 영수증 스냅샷 컬럼이 테이블째 사라졌기 때문이다. 화면·API가 `pair`·`effective_from`으로 조회만 한다(표시 전용, P-17).

## 1. 엔티티 목록 (20개)

| # | 테이블 | 도메인 | v3.1 대비 | 설명 |
|---|--------|--------|-----------|------|
| 1 | member | 회원 | 유지 | 회원 (관객+공연자+관리자). 국가·로케일·표시통화·시간대 보유 |
| 2 | team | 팀 | **컬럼 삭제** | 공연팀 (리더 1인 관리). 팀 지갑 = `leader_id → wallet`으로 파생. 정산 계좌 참조 삭제 |
| 3 | wallet | 지갑 | 유지 | 회원 지갑 1:1 (Web3Auth MPC / Kaia Wallet). **암호화 키 컬럼 없음** |
| 4 | performance | 공연 | 유지 | 공연 (보증금 온체인 컬럼) |
| 5 | ticket_type | 공연 | 유지 | 티켓 옵션 (가격 단위 KRWS) |
| 6 | performance_participant | 공연 | 유지 | 참여팀 (`wallet_address` = createShow 시점 리더 지갑 스냅샷) |
| 7 | settlement_rule | 규칙 | 유지 | 정산 규칙 (공연당 1개) |
| 8 | rule_agreement | 규칙 | 유지 | 팀별 규칙 동의 (리더 서명 tx) |
| 9 | ticket_order | 티켓 | 유지 | 주문 (`order_ref` = 온체인 orderRef) |
| 10 | order_item | 티켓 | 유지 | 주문 항목 |
| 11 | ticket | 티켓 | 유지 | 티켓 (qr_secret TOTP 내장, entry_result·entered_at 내장) |
| 12 | payment | 결제 | **컬럼 삭제·enum 축소** | 코인 결제 (잔액 결제만 — approve/purchase 서명 job) |
| 13 | chain_job | 체인 | **enum 축소** | 온체인 트랜잭션 작업 (운영자 tx + 사용자 서명 tx 보고 + 시연용 지급 이력) |
| 14 | refund | 환불 | 유지 | 환불 (에스크로 → 관객 지갑) |
| 15 | transfer | 양도 | 유지(P2) | 양도. **MVP SQL에서 제외** |
| 16 | settlement | 정산 | 유지 | 정산 (`RELEASED`가 종단 = 팀 수령 완료) |
| 17 | settlement_share | 정산 | **컬럼 삭제** | 팀별 분배 내역 (수령 주소·release 확정) |
| 18 | dispute | 정산 | 유지 | 이의제기 |
| 19 | exchange_rate | 코인 | 유지 | 표시 환율 (화면 환산 전용, 정산 계산에 사용 금지) |
| 20 | audit_log | 관리 | **enum 변경** | 감사 로그 (append-only) |

삭제된 v3.1 테이블 3개: **3번**(회원 계좌 — 법정화폐 계좌 개념이 없다) · **15번**(코인 확보 이력 — 코인은 가입 시 지급과 관리자 지급으로만 생기고, 그 이력은 `chain_job(MINT)`이다) · **22번**(팀 코인 반출 이력 — `release`로 리더 지갑에 코인이 들어오면 정산이 끝난다). 미생성: `wallet_challenge`(Redis), `coin_job`(부활 없음), 지급 이력 전용 테이블(§0).

## 2. 테이블 상세

### member
```sql
CREATE TABLE member (
    member_id       BIGINT AUTO_INCREMENT PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255),              -- LOCAL(자체 이메일) 회원만 값 — P1 예약, 소셜 회원은 NULL
    name            VARCHAR(100) NOT NULL,
    phone           VARCHAR(20),               -- 외국인 관객은 NULL 허용(국내 본인인증 불필요)
    auth_provider   ENUM('GOOGLE','FACEBOOK','KAKAO','LOCAL') NOT NULL,   -- LOCAL(이메일 가입)은 P1 예약, 기본값 없음(Web3Auth 동결)
    provider_user_id VARCHAR(255),             -- 소셜 제공자 사용자 ID
    web3auth_verifier_id VARCHAR(255),         -- Web3Auth verifier 식별자(idToken sub 매칭)
    country_code    CHAR(2) NOT NULL,          -- ISO 3166-1 alpha-2, 자기 선언(P-23)
    locale          VARCHAR(10) NOT NULL DEFAULT 'en',   -- en 기본, ko 병행(P-22)
    display_currency CHAR(3) NOT NULL DEFAULT 'USD',     -- 표시 통화(원 값은 항상 병기)
    timezone        VARCHAR(50) NOT NULL DEFAULT 'UTC',  -- IANA 시간대(KST 병기)
    is_admin        BOOLEAN NOT NULL DEFAULT FALSE,
    status          ENUM('ACTIVE','SUSPENDED','WITHDRAWN') NOT NULL DEFAULT 'ACTIVE',  -- WITHDRAWN = 회원 탈퇴(§0)
    created_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uk_provider (auth_provider, provider_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
v3.1 그대로다. 신규 회원 생성(API-member-01) 성공이 곧 기본 지급 100,000 KRWS의 `MINT` job 생성 근거이며(멱등키 `grant:signup:{memberId}`), 그 이력은 `chain_job`에만 남는다(§0).

### team
```sql
CREATE TABLE team (
    team_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    genre       VARCHAR(50),
    leader_id   BIGINT NOT NULL,                -- 팀 지갑 = 이 리더의 wallet (팀에 지갑 컬럼 없음)
    status      ENUM('ACTIVE','DISBANDED') NOT NULL DEFAULT 'ACTIVE',
    created_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at  DATETIME(6),                       -- 소프트 삭제
    FOREIGN KEY (leader_id) REFERENCES member(member_id)
) ENGINE=InnoDB;
```
v3.1의 `settlement_account_id` 컬럼과 그 FK가 삭제됐다. 팀이 정산금을 받는 곳은 오직 리더 지갑이며(`leader_id → wallet.address`), `release` 한 번으로 수령이 끝난다(P-10). MVP는 리더 교체 불가(§14-20).

### wallet
```sql
CREATE TABLE wallet (
    wallet_id             BIGINT AUTO_INCREMENT PRIMARY KEY,
    member_id             BIGINT NOT NULL UNIQUE,          -- 회원당 지갑 1개 (팀 지갑 = 리더 지갑)
    provider              ENUM('WEB3AUTH','EXTERNAL') NOT NULL,   -- EXTERNAL = Kaia Wallet(Web3Auth 모달 어댑터, 수수료 대납 서명 지원)만 MVP, MetaMask P1
    address               CHAR(42) NOT NULL UNIQUE,
    verified_at           DATETIME(6) NOT NULL,            -- idToken(wallets 클레임) 검증 시각. 자체 챌린지 서명 검증은 P1
    status                ENUM('LINKED','SUSPENDED') NOT NULL DEFAULT 'LINKED',
    last_balance_check_at DATETIME(6),
    cached_krws_balance   BIGINT NOT NULL DEFAULT 0,       -- 조회 캐시(원장은 체인)
    created_at            DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    FOREIGN KEY (member_id) REFERENCES member(member_id)
) ENGINE=InnoDB;
```
- **암호화 키 컬럼이 없다.** 서버는 사용자 개인키·니모닉·MPC 샤드를 어떤 형태로도 저장하지 않는다.
- `gas_funded_at`은 v3.1에서 이미 삭제됐다(수수료 대납이므로 사용자 지갑 KAIA 잔액은 0으로 동작한다).
- `cached_krws_balance`는 화면 표시용 캐시다. 잔액의 진실은 온체인 `KRWS.balanceOf(address)`이며 검증 페이지도 체인을 읽는다. 관객·팀 모두 이 잔액이 곧 돈이다(P-20).

### performance
```sql
CREATE TABLE performance (
    performance_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    title               VARCHAR(200) NOT NULL,
    description         TEXT,
    poster_image_path   VARCHAR(500),
    performance_at      DATETIME(6) NOT NULL,
    entry_start_at      DATETIME(6),
    entry_end_at        DATETIME(6),
    venue_name          VARCHAR(200),
    venue_address       VARCHAR(500),
    creator_team_id     BIGINT NOT NULL,
    is_joint            BOOLEAN NOT NULL DEFAULT FALSE,
    status              ENUM('DRAFT','PENDING_AGREEMENT','ON_SALE','SALE_CLOSED','ENDED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
    cancel_deadline_at  DATETIME(6),                -- D-3 00:00
    sale_close_at       DATETIME(6),                -- 공연 시작 1시간 전
    sale_start_at       DATETIME(6),                -- startSale 확정 시각
    on_chain_id         BIGINT,
    contract_address    CHAR(42),                   -- RevenueSplitter 주소
    deposit_amount      BIGINT NOT NULL,            -- 공연 등록 보증금(KRWS, 기본 50,000)
    deposit_status      ENUM('UNPAID','PAID','RETURNED','FORFEITED') NOT NULL DEFAULT 'UNPAID', -- FORFEITED는 P1 예약값
    deposit_job_id      BIGINT,                     -- 보증금 납부 chain_job(DEPOSIT, signer_type=USER)
    deposit_tx_hash     CHAR(66),                   -- Splitter.deposit tx 해시(리더 서명)
    deposit_return_tx_hash CHAR(66),                -- Splitter.returnDeposit tx 해시(운영자)
    deposit_returned_at DATETIME(6),
    created_at          DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at          DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    FOREIGN KEY (creator_team_id) REFERENCES team(team_id),
    FOREIGN KEY (deposit_job_id) REFERENCES chain_job(chain_job_id)
) ENGINE=InnoDB;
```
보증금은 생성팀 리더가 KRWS로 서명 납부한다(P-21). 리더 잔액이 모자라면 화면은 안내만 하고, 시연에서는 관리자 지급으로 해결한다(v2 §3.5).

### ticket_type
```sql
CREATE TABLE ticket_type (
    ticket_type_id  BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id  BIGINT NOT NULL,
    name            VARCHAR(100) NOT NULL,          -- 일반, 얼리버드 등
    price           BIGINT NOT NULL,                -- KRWS 정수(=원). 표시 통화 환산은 exchange_rate로 화면에서만
    total_quantity  INT NOT NULL,
    sold_quantity   INT NOT NULL DEFAULT 0,
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id)
) ENGINE=InnoDB;
```

### performance_participant
```sql
CREATE TABLE performance_participant (
    participant_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id      BIGINT NOT NULL,
    team_id             BIGINT NOT NULL,
    status              ENUM('REGISTERED','REMOVED') NOT NULL DEFAULT 'REGISTERED',
    registered_at       DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    on_chain_index      INT,                        -- 분배 계산 순서 (= Splitter teamIndex)
    team_share_bp       INT NOT NULL,               -- 고정 풀 내 이 팀의 비율 (bp, 합 10000)
    wallet_address      CHAR(42),                   -- createShow 시점 리더 지갑 스냅샷 (온체인 teamWallets와 1:1)
    UNIQUE KEY uk_perf_team (performance_id, team_id),
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id),
    FOREIGN KEY (team_id) REFERENCES team(team_id)
) ENGINE=InnoDB;
```
`wallet_address`는 `createShow` 호출 시점에 굳는다. 이후 리더 지갑이 바뀌어도 정산 수령 주소는 스냅샷을 따른다(§14-20).

### settlement_rule
```sql
CREATE TABLE settlement_rule (
    rule_id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id  BIGINT NOT NULL UNIQUE,         -- 공연당 1개
    fixed_ratio_bp  INT NOT NULL,                   -- 고정 분배 전체 비율 (bp, fixed+selection=10000)
    selection_ratio_bp INT NOT NULL,                -- 관객 선택 비율 (bp)
    rules_hash      VARCHAR(66),                    -- rulesHash
    is_locked       BOOLEAN NOT NULL DEFAULT FALSE,
    lock_tx_hash    CHAR(66),
    locked_at       DATETIME(6),
    created_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id)
) ENGINE=InnoDB;
```

### rule_agreement
```sql
CREATE TABLE rule_agreement (
    agreement_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id  BIGINT NOT NULL,
    team_id         BIGINT NOT NULL,
    status          ENUM('PENDING','SIGNING','AGREED') NOT NULL DEFAULT 'PENDING',
    agreed_rules_hash VARCHAR(66),
    agree_job_id    BIGINT,                         -- AGREE chain_job (signer_type=USER, 리더 서명)
    agree_tx_hash   CHAR(66),
    agreed_at       DATETIME(6),
    requested_by    BIGINT NOT NULL,                -- 동의 요청한 팀 리더
    UNIQUE KEY uk_perf_team_agree (performance_id, team_id),
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id),
    FOREIGN KEY (team_id) REFERENCES team(team_id),
    FOREIGN KEY (requested_by) REFERENCES member(member_id),
    FOREIGN KEY (agree_job_id) REFERENCES chain_job(chain_job_id)
) ENGINE=InnoDB;
```
`SIGNING` = 리더가 `agreeToRules` 발신자 서명 RLP를 보고한 상태, `AGREED` = 서버가 대납 전송 후 receipt를 검증해 확정한 상태(§7).

### ticket_order
```sql
CREATE TABLE ticket_order (
    ticket_order_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id  BIGINT NOT NULL,
    member_id       BIGINT NOT NULL,
    order_ref       CHAR(66) NOT NULL,              -- 온체인 orderRef = keccak256(orderId), purchase·refund 대사 키
    total_amount    BIGINT NOT NULL,                -- KRWS 정수
    total_quantity  INT NOT NULL,
    choice_team_id  BIGINT,                         -- 관람 목적 팀 (공동 공연 필수, purchase tx에 함께 기록)
    status          ENUM('PENDING_PAYMENT','PAID','CANCELLED','REFUNDED') NOT NULL DEFAULT 'PENDING_PAYMENT',
    payment_expires_at DATETIME(6) NOT NULL,        -- 생성 후 15분
    confirmed_at    DATETIME(6),
    created_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uk_order_ref (order_ref),
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id),
    FOREIGN KEY (member_id) REFERENCES member(member_id),
    FOREIGN KEY (choice_team_id) REFERENCES team(team_id)
) ENGINE=InnoDB;
```
잔액이 모자라 결제가 시작되지 못해도 주문은 그대로 남고, `payment_expires_at` 경과 시 `CANCELLED`가 된다(v2 §3.3).

### order_item
```sql
CREATE TABLE order_item (
    order_item_id   BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_order_id BIGINT NOT NULL,
    ticket_type_id  BIGINT NOT NULL,
    quantity        INT NOT NULL,
    unit_price      BIGINT NOT NULL,                -- 구매 시점 가격(KRWS)
    subtotal        BIGINT NOT NULL,
    FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id),
    FOREIGN KEY (ticket_type_id) REFERENCES ticket_type(ticket_type_id)
) ENGINE=InnoDB;
```

### ticket
```sql
CREATE TABLE ticket (
    ticket_id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_order_id     BIGINT NOT NULL,
    ticket_type_id      BIGINT NOT NULL,
    performance_id      BIGINT NOT NULL,
    owner_member_id     BIGINT NOT NULL,            -- 현재 소유자 (양도 시 변경, P2)
    buyer_member_id     BIGINT NOT NULL,            -- 최초 구매자
    status              ENUM('ISSUED','TRANSFER_PENDING','USED','CANCELLED') NOT NULL DEFAULT 'ISSUED',
    original_price      BIGINT NOT NULL,            -- 최초 구매 금액(KRWS)
    on_chain_ticket_id  BIGINT,
    choice_tx_hash      CHAR(66),                   -- 관객 선택이 기록된 Splitter.purchase tx 해시(별도 recordChoice 없음)
    issued_at           DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    status_changed_at   DATETIME(6),
    entry_result        VARCHAR(30),                -- 입장 판정 결과 (ADMITTED 등, 입장 전 NULL)
    entered_at          DATETIME(6),                -- 입장 처리 일시
    qr_secret           VARCHAR(512) NOT NULL,      -- TOTP용 QR 비밀키 (발급 시 생성, 양도 시 재생성)
    FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id),
    FOREIGN KEY (ticket_type_id) REFERENCES ticket_type(ticket_type_id),
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id),
    FOREIGN KEY (owner_member_id) REFERENCES member(member_id),
    FOREIGN KEY (buyer_member_id) REFERENCES member(member_id)
) ENGINE=InnoDB;
```

### payment
```sql
CREATE TABLE payment (
    payment_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_order_id BIGINT NOT NULL UNIQUE,                -- 주문당 1건
    payer_wallet_id BIGINT NOT NULL,                       -- 결제 서명 지갑(관객)
    amount          BIGINT NOT NULL,                       -- KRWS
    approve_job_id  BIGINT,                                -- APPROVE chain_job (USER, allowance 충분 시 NULL)
    purchase_job_id BIGINT,                                -- PURCHASE chain_job (USER)
    purchase_tx_hash CHAR(66),
    status          ENUM('REQUESTED','AWAITING_SIGNATURE','PAYING','PAID','FAILED','REFUNDED') NOT NULL DEFAULT 'REQUESTED',
    failure_code    VARCHAR(100),
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    requested_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    paid_at         DATETIME(6),
    FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id),
    FOREIGN KEY (payer_wallet_id) REFERENCES wallet(wallet_id),
    FOREIGN KEY (approve_job_id) REFERENCES chain_job(chain_job_id),
    FOREIGN KEY (purchase_job_id) REFERENCES chain_job(chain_job_id)
) ENGINE=InnoDB;
```
v3.1의 `mode` 컬럼(잔액 결제 / 원스텝 코인 확보 2값)과 거기에 딸린 참조 컬럼·FK가 삭제됐고, `status`에서 코인 확보 대기 상태 1종이 빠져 6종이 됐다. 결제는 **지갑 잔액 결제 하나뿐**이며(P-7), 잔액이 모자라면 결제를 시작하지 않고 409 `PAYMENT_INSUFFICIENT_BALANCE`로 안내한다. `AWAITING_SIGNATURE` = 서명 파라미터 발급, `PAYING` = 발신자 서명 RLP 보고·대납 전송, `PAID` = receipt 검증 완료(§7).

### chain_job
```sql
CREATE TABLE chain_job (
    chain_job_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    tx_type         ENUM('MINT','APPROVE','PURCHASE','REFUND','DEPOSIT','DEPOSIT_RETURN','DEPOSIT_FORFEIT','AGREE','LOCK','AGGREGATE','RELEASE','HALT') NOT NULL,  -- 12종(§7)
    signer_type     ENUM('OPERATOR','USER') NOT NULL DEFAULT 'OPERATOR',  -- USER = 프론트가 발신자 서명한 대납 tx RLP를 보고, 서버(fee payer)가 서명·전송·receipt 검증
    fee_delegated   BOOLEAN NOT NULL DEFAULT FALSE,   -- USER job은 TRUE (Kaia FeeDelegatedSmartContractExecution)
    fee_payer_address CHAR(42),                       -- 대납 서명 운영지갑 주소(USER job)
    sender_signed_rlp MEDIUMTEXT,                     -- 발신자 서명 RLP(USER job, 전송 성공·CONFIRMED 후 NULL로 비움)
    issuer_type     ENUM('MOCK','EXTERNAL') NOT NULL DEFAULT 'MOCK',      -- 발행 어댑터(P-25). EXTERNAL은 P2 예약값
    requester_id    BIGINT,                     -- 요청자(MINT: 관리자 지급이면 관리자, 가입 자동 지급이면 NULL)
    wallet_id       BIGINT,                     -- 서명·수신 지갑 (USER job·MINT 수신 지갑, NULL 허용)
    ref_performance_id BIGINT,
    ref_ticket_id   BIGINT,
    ref_team_id     BIGINT,
    amount          BIGINT,                     -- 이 작업이 옮기는 KRWS 금액 (해당 없으면 NULL)
    status          ENUM('PENDING','SUBMITTED','CONFIRMED','FAILED') NOT NULL DEFAULT 'PENDING',
    tx_hash         CHAR(66),
    confirmations   INT NOT NULL DEFAULT 0,
    retry_count     INT NOT NULL DEFAULT 0,
    failure_reason  VARCHAR(500),
    idempotency_key VARCHAR(255) UNIQUE,        -- OPERATOR job은 NOT NULL 운용(MINT는 grantRef), USER job은 발신자 서명 RLP 해시
    requested_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    confirmed_at    DATETIME(6),
    FOREIGN KEY (requester_id) REFERENCES member(member_id),
    FOREIGN KEY (wallet_id) REFERENCES wallet(wallet_id),
    FOREIGN KEY (ref_performance_id) REFERENCES performance(performance_id),
    FOREIGN KEY (ref_ticket_id) REFERENCES ticket(ticket_id),
    FOREIGN KEY (ref_team_id) REFERENCES team(team_id)
) ENGINE=InnoDB;
```
- `tx_type`이 v3.1의 15종에서 **12종**으로 줄었다. 소각 1종과 금고 관련 2종이 사라진 것은 팀이 코인을 그대로 보유하기 때문이다(P-10·P-20). 가스 자동 지급용 작업 유형은 v3.1에서 이미 삭제됐다(수수료 대납).
- **`MINT` job은 시연용 지급의 유일한 이력이다.** `wallet_id`(수신 지갑)·`amount`·`idempotency_key`(= `KRWS.mint`의 `grantRef`)가 필수이고, `requester_id`가 NULL이면 가입 시 자동 지급, 값이 있으면 관리자 지급이다(v2 §2.2·§3.1). 한도는 가입 기본 100,000 / 관리자 1회 최대 1,000,000(P-19).
- `signer_type=USER` job은 수수료 대납 절차를 탄다: 프론트가 발신자 서명 RLP를 보고하면 `PENDING`으로 생성 → 서버 운영지갑이 fee payer 서명 후 `kaia_sendRawTransaction` → `SUBMITTED` → receipt 검증 후 `CONFIRMED`. 전송 실패 시 같은 RLP로 재시도 가능하므로 USER job도 `idempotency_key`를 채운다(RLP 해시).
- **참조 방향**: 업무 테이블이 `*_job_id`로 chain_job을 가리키고, chain_job은 `ref_*`·`wallet_id`로 대상만 느슨하게 되짚는다. `coin_job`은 만들지 않는다.

### refund
```sql
CREATE TABLE refund (
    refund_id       BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_id       BIGINT NOT NULL,
    ticket_order_id BIGINT NOT NULL,
    payment_id      BIGINT NOT NULL,
    to_wallet_id    BIGINT NOT NULL,                -- 환불 수령 지갑(관객). 코인은 지갑에 그대로 남는다(P-20)
    reason          ENUM('CUSTOMER_CANCEL','PERFORMANCE_CANCEL') NOT NULL,
    original_amount BIGINT NOT NULL,
    fee             BIGINT NOT NULL DEFAULT 0,      -- 취소 수수료(에스크로에 남아 정산 재원)
    refund_amount   BIGINT NOT NULL,                -- 실제 환불 금액(KRWS)
    fee_tier        VARCHAR(20),                    -- BEFORE_D7, BEFORE_D3
    refund_job_id   BIGINT,                         -- REFUND chain_job (OPERATOR)
    refund_tx_hash  CHAR(66),                       -- Splitter.refund tx 해시
    status          ENUM('PENDING','PROCESSING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING',
    retry_count     INT NOT NULL DEFAULT 0,
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    requested_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    completed_at    DATETIME(6),
    FOREIGN KEY (ticket_id) REFERENCES ticket(ticket_id),
    FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id),
    FOREIGN KEY (payment_id) REFERENCES payment(payment_id),
    FOREIGN KEY (to_wallet_id) REFERENCES wallet(wallet_id),
    FOREIGN KEY (refund_job_id) REFERENCES chain_job(chain_job_id)
) ENGINE=InnoDB;
```
환불 1건 = `Splitter.refund` tx 1건이며 선택 카운터 감소도 그 안에서 처리된다. 환불 코인은 관객 지갑으로 돌아오고 거기서 끝난다(v2 §3.4).

### transfer
> 양도(선물)는 P2 최후순위. 테이블·컬럼은 유지하되 MVP에서 쓰지 않으며, ERD Cloud 반영본(`11_ERD_v4_import_mvp.sql`, 19 테이블)에서도 제외한다.

```sql
CREATE TABLE transfer (
    transfer_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_id       BIGINT NOT NULL,
    sender_id       BIGINT NOT NULL,
    receiver_id     BIGINT,                         -- 수락 시 기록
    token           VARCHAR(512) NOT NULL,
    expires_at      DATETIME(6) NOT NULL,           -- 24시간
    status          ENUM('PENDING','COMPLETED','EXPIRED','CANCELLED') NOT NULL DEFAULT 'PENDING',
    created_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    resolved_at     DATETIME(6),                    -- 수락·취소·만료 일시
    FOREIGN KEY (ticket_id) REFERENCES ticket(ticket_id),
    FOREIGN KEY (sender_id) REFERENCES member(member_id),
    FOREIGN KEY (receiver_id) REFERENCES member(member_id)
) ENGINE=InnoDB;
```
티켓 양도는 소유권 이전만 하며 코인 이동이 없다(대금 정산은 당사자 간 문제).

### settlement
```sql
CREATE TABLE settlement (
    settlement_id   BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id  BIGINT NOT NULL UNIQUE,
    status          ENUM('NONE','AGGREGATED','LOCKED','DISPUTE_OPEN','RELEASED','HALTED') NOT NULL DEFAULT 'NONE',
    total_revenue   BIGINT,                         -- 총 매출(KRWS)
    valid_ticket_count INT,
    total_choice_count INT,
    counter_match   BOOLEAN,                        -- 온체인·서버 대조 결과
    aggregated_at   DATETIME(6),
    locked_at       DATETIME(6),
    dispute_deadline_at DATETIME(6),                -- 잠금 + 48h
    released_at     DATETIME(6),
    aggregate_tx_hash CHAR(66),
    lock_tx_hash    CHAR(66),
    release_tx_hash CHAR(66),                       -- Splitter.release tx 해시(팀 리더 지갑들로 push)
    share_token     VARCHAR(512),                   -- 정산 내역 공개 링크 토큰
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id)
) ENGINE=InnoDB;
```
**`RELEASED`가 종단 상태이며 곧 팀 수령 완료다**(P-10). release로 리더 지갑에 코인이 들어오면 정산 절차가 끝나고, 이후 단계는 없다.

### settlement_share
```sql
CREATE TABLE settlement_share (
    share_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
    settlement_id   BIGINT NOT NULL,
    team_id         BIGINT NOT NULL,
    wallet_address  CHAR(42),                       -- 수령 주소 스냅샷(= performance_participant.wallet_address)
    equal_amount    BIGINT NOT NULL,                -- 고정 분배액
    selection_amount BIGINT NOT NULL,               -- 관객 선택 분배액
    dust_amount     BIGINT NOT NULL DEFAULT 0,      -- dust 귀속액
    total_amount    BIGINT NOT NULL,                -- 최종 분배액(KRWS)
    choice_count    INT NOT NULL,                   -- 해당 팀 선택 수
    released        BOOLEAN NOT NULL DEFAULT FALSE, -- release tx로 지갑 입금 확정
    released_at     DATETIME(6),
    UNIQUE KEY uk_settlement_team (settlement_id, team_id),
    FOREIGN KEY (settlement_id) REFERENCES settlement(settlement_id),
    FOREIGN KEY (team_id) REFERENCES team(team_id)
) ENGINE=InnoDB;
```
v3.1 말미의 누계 컬럼 1개가 삭제됐다. 수령 확인은 `released`·`released_at`·`wallet_address` 3개로 끝나며, 그 뒤를 추적할 후속 절차가 없다(v2 §3.6).

### dispute
```sql
CREATE TABLE dispute (
    dispute_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    settlement_id   BIGINT NOT NULL,
    team_id         BIGINT NOT NULL,
    reason          TEXT NOT NULL,
    status          ENUM('OPEN','RESOLVED','REJECTED') NOT NULL DEFAULT 'OPEN',
    admin_comment   TEXT,
    admin_id        BIGINT,
    submitted_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    resolved_at     DATETIME(6),
    FOREIGN KEY (settlement_id) REFERENCES settlement(settlement_id),
    FOREIGN KEY (team_id) REFERENCES team(team_id),
    FOREIGN KEY (admin_id) REFERENCES member(member_id)
) ENGINE=InnoDB;
```

### exchange_rate
```sql
CREATE TABLE exchange_rate (
    rate_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
    pair           VARCHAR(10) NOT NULL,                   -- 'USD_KRW', 'JPY_KRW', 'EUR_KRW' … 표시용만
    rate           DECIMAL(18,6) NOT NULL,                 -- 1 base = rate KRW
    effective_from DATETIME(6) NOT NULL,
    published_by   BIGINT NOT NULL,                        -- 등록 관리자
    source         VARCHAR(100) NOT NULL DEFAULT 'MANUAL',
    created_at     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    KEY idx_pair_eff (pair, effective_from),
    FOREIGN KEY (published_by) REFERENCES member(member_id)
) ENGINE=InnoDB;
```
**환율은 표시 환산(≈ $)에만 쓴다.** 정산·분배·컨트랙트·티켓 가격·지급 금액 계산에 절대 사용하지 않는다(P-17). v4에서는 이 테이블을 참조하는 업무 컬럼이 없다(§0) — 화면·API가 `pair`·`effective_from`으로 조회할 뿐이다.

### audit_log
```sql
CREATE TABLE audit_log (
    audit_log_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor_id        BIGINT,
    actor_role      VARCHAR(20),
    request_ip      VARCHAR(45),
    action_type     ENUM('ADMIN_ACTION','OPERATOR_SIGN','MINT','RELEASE','GRANT','RATE_CHANGE','WALLET_LINK','STATUS_CHANGE') NOT NULL,
    resource_type   VARCHAR(50) NOT NULL,
    resource_id     BIGINT,
    request_summary TEXT,
    result          ENUM('SUCCESS','FAILURE') NOT NULL,
    tx_hash         CHAR(66),
    created_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    FOREIGN KEY (actor_id) REFERENCES member(member_id)
    -- append-only: 수정·삭제 금지
) ENGINE=InnoDB;
```
v3.1의 10종에서 3종(소각·코인 확보·코인 반출)이 빠지고 **`GRANT`**(시연용 지급 승인 행위)가 신설돼 8종이 됐다(§7). `MINT`는 온체인 발행 tx 자체, `GRANT`는 그 지급을 승인한 관리자 행위를 남긴다. `OPERATOR_SIGN`은 서버 보관 키 **2개**의 서명 이벤트다.

## 3. 관계 요약

```
member ─┬── wallet (1:1, 회원당 지갑 1개 — member_id UNIQUE)
        ├─< ticket_order
        ├─< ticket (owner, buyer)
        ├─< transfer (sender, receiver)
        ├─< exchange_rate (published_by, 관리자)
        ├─< dispute (admin_id, 처리 관리자)
        └─< audit_log

wallet ─┬─< payment (payer_wallet_id)
        ├─< refund (to_wallet_id, 환불 수령)
        └─< chain_job (wallet_id, 서명·수신 지갑 + MINT 수신 지갑)
   ※ wallet에는 개인키·니모닉·MPC 샤드·DEK 어떤 키 컬럼도 없다. 서버는 사용자 키를 보관하지 않는다.
   ※ 외부 지갑 등록 챌린지(wallet:challenge:{memberId})는 Redis TTL 300s, 리프레시 토큰(auth:refresh:{jti})은 Redis TTL 14일 — 둘 다 테이블 없음(20개 미포함).

team ──┬── leader_id >── member   ※ 팀 지갑 = team.leader_id → wallet (team에 주소 컬럼도, 계좌 참조도 없다)
       ├─< performance (creator_team_id)
       ├─< performance_participant   (wallet_address = 리더 지갑 스냅샷)
       ├─< rule_agreement
       ├─< settlement_share
       ├─< dispute
       └─< ticket_order (choice_team_id, 관람 목적 팀)

performance ─┬─< ticket_type
             ├─< performance_participant
             ├─< settlement_rule (1:1)
             ├─< rule_agreement
             ├─< ticket_order
             ├─< ticket
             ├─< settlement (1:1)
             └── deposit_job_id >── chain_job (보증금 납부 job)

ticket_order ─┬─< order_item
              ├── payment (1:1)
              └─< ticket

ticket ─┬─< refund
        ├─< transfer (P2)
        ├── (qr_secret TOTP 내장 — 30초 회전, 양도 시 재생성)
        └── (entry_result, entered_at 내장 — 입장 1회성)

settlement ─┬─< settlement_share   (released·released_at·wallet_address로 수령 확인 — 종단)
            └─< dispute

exchange_rate — 참조하는 업무 컬럼 없음(표시 전용 조회만, P-17)

-- 온체인 작업은 chain_job 하나로 통합한다. coin_job은 부활하지 않는다.
chain_job ─┬── requester_id >── member (요청자, MINT 자동 지급은 NULL)
           ├── wallet_id >── wallet (서명·수신 지갑, NULL 허용)
           ├── ref_performance_id >── performance (NULL 허용)
           ├── ref_ticket_id >── ticket (NULL 허용)
           └── ref_team_id >── team (NULL 허용)

chain_job <─┬── performance.deposit_job_id          (DEPOSIT, USER)
            ├── rule_agreement.agree_job_id         (AGREE, USER)
            ├── payment.approve_job_id              (APPROVE, USER)
            ├── payment.purchase_job_id             (PURCHASE, USER)
            └── refund.refund_job_id                (REFUND, OPERATOR)
   ※ 시연용 지급(MINT)·LOCK·AGGREGATE·RELEASE·DEPOSIT_RETURN·HALT job은 역참조 컬럼 없이 chain_job에만 존재하며,
     ref_performance_id·ref_team_id·wallet_id로 대상을 되짚는다.
```

삭제된 v3.1 관계: 회원·팀 → 계좌(`team.settlement_account_id`, 계좌 테이블 자체 삭제), 지갑·회원·주문·환율 → 코인 확보 이력, 팀·지갑·정산·계좌 → 팀 코인 반출 이력, `payment` → 코인 확보 이력(자동 결제 연계).

## 4. 인덱스 권고

| 테이블 | 인덱스 | 용도 |
|--------|--------|------|
| wallet | (address) | 주소 → 회원 역조회, 이벤트 대사 |
| ticket | (performance_id, status) | 재고 조회·입장 검증 |
| ticket | (owner_member_id, status) | 내 티켓 목록 |
| ticket_order | (member_id, performance_id) | 중복 구매 검사 |
| ticket_order | (status, payment_expires_at) | 만료 주문 배치 |
| payment | (status, requested_at) | 서명 대기·전송 중 결제 모니터링 |
| transfer | (ticket_id, status) | 양도 중 확인(P2) |
| chain_job | (status, requested_at) | 재시도 큐 |
| chain_job | (tx_type, status) | 유형별 작업 모니터링 |
| **chain_job** | **(tx_type, wallet_id)** | **시연용 지급 이력 조회(API-coin-08)·지갑 거래 이력(API-wallet-02)** |
| chain_job | (signer_type, status) | 사용자 서명 tx receipt 검증 대기열 |
| chain_job | (tx_hash) | 프론트 보고 해시 → job 역조회 |
| settlement | (performance_id) | 정산 조회 |
| settlement | (share_token) | 공유 링크 조회 |
| exchange_rate | (pair, effective_from) | 유효 환율 조회(테이블 정의에 포함) |
| audit_log | (created_at) | 시간순 조회 |
| audit_log | (actor_id, action_type) | 행위자별 조회 |

v3.1 인덱스 표에서 삭제된 행: 계좌(member_id), 코인 확보 이력 2행(진행 상태·만료 배치), 팀 코인 반출 이력 2행. 신설: `chain_job(tx_type, wallet_id)`.

## 5. v3.1 → v4 변경 이력

| 변경 | 내용 | 이유 |
|------|------|------|
| **v3.1 3번 테이블 삭제** | 회원 계좌 테이블(계좌번호·예금주·검증 결과 7컬럼)과 이를 가리키던 FK 2개를 통째로 제거 | 화폐가 코인인 세계에는 법정화폐 계좌가 존재하지 않는다(P-26). 예금주 검증 절차도 함께 사라진다 |
| **v3.1 15번 테이블 삭제** | 코인 확보 이력 테이블(21컬럼, FK 5개) 제거 | 코인은 가입 시 기본 지급과 관리자 지급으로만 생기고, 그 이력은 `chain_job(tx_type='MINT')` 한 행으로 충분하다. 별도 이력 테이블을 만들지 않는다(v2 §2.2 [권]) |
| **v3.1 22번 테이블 삭제** | 팀 코인 반출 이력 테이블(20컬럼, FK 7개) 제거 | `release`로 리더 지갑에 코인이 들어오면 정산이 끝난다(P-10). 코인이 곧 돈이므로 뒤따르는 3단계 절차가 통째로 사라졌다 |
| `team` 컬럼 삭제 | `settlement_account_id`와 그 FK 제거 | 팀이 정산금을 받는 곳은 리더 지갑뿐이다. 정산 계좌 등록 화면·API도 함께 삭제(§9 API-team-07) |
| `payment` 컬럼 삭제·enum 축소 | `mode` 컬럼(잔액 결제 / 원스텝 코인 확보 2값)과 자동 코인 확보 참조 컬럼·FK 제거, `status` 7종 → **6종**(코인 확보 대기 상태 제거) | 결제 수단이 지갑 잔액 하나로 줄었다(P-7). 잔액 부족은 결제 시작 전에 409 `PAYMENT_INSUFFICIENT_BALANCE`로 안내하고 주문만 남긴다 |
| `settlement_share` 컬럼 삭제 | 말미의 반출 누계 컬럼 1개 제거 | 추적할 후속 절차가 없다. 수령 확인은 `released`·`released_at`·`wallet_address`로 끝난다 |
| `chain_job.tx_type` 축소 | 15종 → **12종**(소각 1종·금고 2종 제거) — `MINT`·`APPROVE`·`PURCHASE`·`REFUND`·`DEPOSIT`·`DEPOSIT_RETURN`·`DEPOSIT_FORFEIT`·`AGREE`·`LOCK`·`AGGREGATE`·`RELEASE`·`HALT` | 소각이 사라지고(v2 §2.1) 금고 경유 절차가 없어졌다. 가스 자동 지급용 유형은 v3.1에서 이미 삭제 |
| `chain_job` 의미 확장 | `MINT` job = **시연용 지급의 유일한 이력**(`wallet_id`·`amount`·`requester_id`·`idempotency_key`=grantRef 필수) | 지급 이력 테이블을 만들지 않기로 한 결정(v2 §2.2)의 직접적 결과. `requester_id` NULL = 가입 자동 지급 |
| `audit_log.action_type` 변경 | 10종 → **8종**: 3종(소각·코인 확보·코인 반출) 삭제, `GRANT` 신설 → `ADMIN_ACTION`·`OPERATOR_SIGN`·`MINT`·`RELEASE`·`GRANT`·`RATE_CHANGE`·`WALLET_LINK`·`STATUS_CHANGE` | 감사 대상이 되는 행위 목록이 세계관 변경을 따라간다. 서버 보관 키가 3개 → 2개로 줄어 `OPERATOR_SIGN`의 범위도 좁아졌다 |
| `exchange_rate` 유지, 참조 소멸 | 테이블·컬럼 그대로. 다만 이를 가리키던 유일한 업무 컬럼(v3.1 15번 테이블의 영수증 스냅샷)이 함께 사라졌다 | 표시 환율은 외국인 관객 화면의 ≈ $ 환산에 계속 필요하다(P-17·P-22). 정산·분배 계산에는 여전히 사용 금지 |
| `wallet` 유지 | 키 컬럼 없음·`gas_funded_at` 없음(v3.1) 그대로 | 지갑은 사용자 소유이고 가스는 대납이다. v4에서 바뀔 이유가 없다 |
| `member`·`performance`·`refund`·`settlement` 등 유지 | v3.1 컬럼·enum 그대로 | 세계관 변경이 컬럼에 닿지 않는 영역이다. `member.status`의 `WITHDRAWN`은 회원 탈퇴 상태값으로 코인 도메인과 무관(§0) |
| `transfer` 유지(P2) | 테이블 유지, **ERD Cloud 반영본은 `11_ERD_v4_import_mvp.sql`(transfer 제외, 19 테이블)** | 양도는 최후순위(§14-25). v3.1과 동일한 취급 |
| **리프레시 토큰 테이블 삭제 (v4.1)** | v3.1 2번 테이블(토큰 해시·발급/만료 일시·회전 포인터·폐기 플래그 7컬럼, FK 2개)을 제거하고 **Redis** `auth:refresh:{jti}` TTL 14일로 대체 | 수명이 짧고 만료가 곧 정리인 데이터다. 회전·즉시 폐기가 `DEL` 한 번이면 끝나고 정리 배치도 필요 없다. 검증·정산 어느 흐름도 이 테이블을 참조하지 않는다 |
| 테이블 수 | 24 → **20** (삭제 4, 신설 0) | 남은 20개 중 컬럼이 바뀐 것은 `team`·`payment`·`chain_job`·`settlement_share`·`audit_log` 5개다 |

### 산출물

| 파일 | 내용 |
|---|---|
| `11_ERD_v4.md` | 이 문서 (20 테이블, MySQL ENUM 표기) |
| `11_ERD_v4_import.sql` | ERD Cloud Import용 DDL 전체 **20 테이블** (VARCHAR + COMMENT 논리명) |
| `11_ERD_v4_import_mvp.sql` | 같은 DDL에서 `transfer` 제외 **19 테이블** — ERD Cloud(`kpxqsmzYGNrskWTMF`) 반영본 |

생성 순서는 두 SQL 모두 `member → exchange_rate → chain_job → wallet → team → performance → …`(부모 → 자식)이고, `chain_job`의 역참조 FK 4개(`wallet`·`performance`·`ticket`·`team`)는 파일 말미 `ALTER TABLE`로 추가한다. FK 총수는 전체 **49개**, MVP **46개**(`transfer` 3개 제외)다.
