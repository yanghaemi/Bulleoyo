# ERD 설계 v3 (2026-09-02)

> **9/2 팀 결정 — 최소 사이즈 원칙 + Web3Auth 동결**: 결정 문서 §14의 모든 안건을 "사이즈를 늘리지 않는" 쪽으로 확정했다. ① 인증·지갑 = **Web3Auth 단일**(소셜 3종). 자체 이메일 가입·로그인 삭제 → **P1**(F-member-02·10, API-member-02·08, C-02). ② 외부 지갑 연결은 **Web3Auth 모달의 외부 지갑 어댑터**(MetaMask·WalletConnect)로 처리하고 자체 챌린지 서명 API(API-wallet-03·04, F-wallet-05)는 **P1**. C-05는 모달 안내 화면으로 축소. ③ 충전 수단은 **카드만**(해외·국내). 가상계좌 충전·입금 시뮬레이션(F-charge-02, API-charge-04, A-14 `Bank transfer` 탭)은 **P1** — ERD 컬럼은 유지. ④ 체인·컨트랙트 설정은 프론트 환경변수 하드코딩, API-coin-04·F-coin-09는 **P1**. ⑤ 기본 언어 en·통화 USD 고정(국가별 자동 제안 없음, 수동 스위치만). ⑥ 코인 이름은 가칭 **KRWS 그대로 발표**. ⑦ **양도(선물)는 최후순위(P2)** — F-transfer-01~04, API-transfer-01~04, A-09·A-10, `transfer` 테이블 유지·구현 마지막. ⑧ **가스 = Kaia 수수료 대납(fee delegation) 채택 [팀 9/2]** — 사용자 지갑에 KAIA를 넣지 않는다. 사용자 서명 tx는 Kaia `FeeDelegatedSmartContractExecution` 타입으로 프론트(Web3Auth 키 + `@kaiachain/ethers-ext`)가 발신자 서명만 하고, 서버(운영지갑 = fee payer, `web3j` + Kaia `web3j-ext`)가 대납 서명 후 전송한다. 따라서 `signed-tx` 보고 본문은 `txHash`가 아니라 **발신자 서명 RLP**가 되고, 가스 자동 충전(F-wallet-04, API-wallet-05)은 삭제(P1 예비). 외부 지갑은 수수료 대납 서명을 지원하는 **Kaia Wallet만 MVP**, MetaMask는 P1. 나머지(approve+purchase 2단계·잔액 유지·카운터 미갱신·V-01 로그인 유지·모바일 외부 지갑 미지원)는 권고안 확정. 본문에서 위 항목은 제목에 `[P1 — 9/2 최소화]`로 표시했고 본문 서술은 v4 작성 시점 그대로다.

> 개정 2026-09-02(수) · 기준: [`../planning/06_방향전환_코인전환_v1.md`](../planning/06_방향전환_코인전환_v1.md) §8(ERD v3 변경 지시) · §7(상태 enum) · §2·§3(컬럼 의미 근거)
> 이전 버전: [09_ERD_v2.md](./09_ERD_v2.md)(22 테이블, 2026-08-31) — 원본은 수정하지 않는다.
> 컨벤션: 02_개발_컨벤션.md §4 — snake_case, 단수형, PK `테이블명_id`, 예약어 회피(performance, ticket_order), 금액 BIGINT, 체인 주소 CHAR(42), tx 해시 CHAR(66). 금액 단위는 **KRWS 정수(1 KRWS = 1원, decimals=0)**.
>
> **플랫폼이 시연용 가상 원화 스테이블코인을 발행·소각·준비금 공시한다.** 티켓 결제·환불·보증금·정산 분배·팀 수령의 모든 가치 이동이 이 코인 하나로 일어나므로, v3 ERD는 "금융망 원화 거래 식별자" 컬럼을 온체인 작업(`chain_job`)·tx 해시·지갑 참조로 대체한다.
> **지갑은 사용자 소유(Web3Auth/외부 지갑), 서버는 사용자 키를 보관하지 않는다.** 따라서 신설 `wallet` 테이블에는 개인키·니모닉·MPC 샤드·DEK 등 **어떤 암호화 키 컬럼도 없다**.
>
> v2 대비 변경 요약 — `team_wallet`(팀 커스터디얼) → **`wallet`(회원 1:1 비수탁, 키 컬럼 없음)** 대체, **`coin_charge`·`coin_withdrawal`·`exchange_rate` 신설**, `redemption` **삭제**(`coin_withdrawal`이 대체), `payment` **컬럼 전면 교체**(가상계좌·카드 → 지갑·모드·서명 job), `chain_job`에 `signer_type`·`issuer_type`·`wallet_id`·`amount`·`idempotency_key` 추가 및 `tx_type` 16종 확장, `performance` 보증금 컬럼을 온체인 컬럼(`deposit_job_id`·`deposit_tx_hash`·`deposit_return_tx_hash`)으로 교체, `performance_participant.wallet_address`(정산 수령 주소 스냅샷) 추가, `ticket_order.order_ref` 추가, `rule_agreement`에 `SIGNING` 상태·`agree_job_id` 추가, `settlement`에서 `REDEEMED` 제거·`release_tx_hash` 복원, `settlement_share` 컬럼 교체(`transfer_confirmed` → `released`·`released_at`·`wallet_address`·`withdrawn_amount`), `refund` 컬럼 교체(금융망 환불 → 온체인 환불 + 수령 지갑), `member`에 로케일·통화·시간대·국가·`web3auth_verifier_id` 추가 및 `auth_provider` 재정의, `audit_log.action_type` 재정의 (**22 → 24 테이블**).

## 0. 읽기 전 메모

- **`wallet_challenge`는 테이블이 아니다.** 외부 지갑 등록용 서명 챌린지(nonce·메시지·만료)는 Redis key `wallet:challenge:{memberId}` TTL 300s로만 보관한다(결정 문서 §8). 1회용·5분 만료라 영속화 가치가 없으므로 **24 테이블에 포함하지 않는다.**
- **`coin_job`은 부활하지 않는다.** v1에 있다가 v2에서 삭제된 `coin_job`은 v3에서도 만들지 않는다. mint·burn·approve·purchase·refund·release·보증금·팀 출금 예치까지 **모든 온체인 작업은 `chain_job` 한 테이블**이 `tx_type`으로 구분해 담는다.
- **P1·P2 항목을 위한 컬럼은 만들지 않는다.** 예약은 enum 값 주석으로만 남긴다(`coin_charge.method` P2 `USDC_SWAP`, `coin_withdrawal.kind` P1 `CARD_CANCEL`·P2 `ONCHAIN`, `chain_job.issuer_type` P2 `EXTERNAL`, `performance.deposit_status` P1 `FORFEITED`).
- **서버 보관 키는 OPERATOR·MINTER·BURNER 3개**뿐이며 DB에 저장하지 않는다(내부 서브넷 주입). 사용자 키는 어떤 테이블에도 없다.

## 1. 엔티티 목록 (24개)

| # | 테이블 | 도메인 | v2 대비 | 설명 |
|---|--------|--------|---------|------|
| 1 | member | 회원 | 변경 | 회원 (관객+공연자+관리자). 국가·로케일·표시통화·시간대 보유 |
| 2 | refresh_token | 회원 | 유지 | JWT 리프레시 토큰 |
| 3 | bank_account | 회원 | 유지 | 계좌 (팀 정산 계좌 전용, 회원당 복수 가능) |
| 4 | team | 팀 | 유지 | 공연팀 (리더 1인 관리). 팀 지갑 = `leader_id → wallet`으로 파생 |
| 5 | **wallet** | 지갑 | **신설(`team_wallet` 대체)** | 회원 지갑 1:1 (Web3Auth MPC / 외부 지갑). **암호화 키 컬럼 없음** |
| 6 | performance | 공연 | 변경 | 공연 (보증금 온체인 컬럼) |
| 7 | ticket_type | 공연 | 유지 | 티켓 옵션 (가격 단위 KRWS) |
| 8 | performance_participant | 공연 | 변경 | 참여팀 (`wallet_address` = createShow 시점 리더 지갑 스냅샷) |
| 9 | settlement_rule | 규칙 | 유지 | 정산 규칙 (공연당 1개) |
| 10 | rule_agreement | 규칙 | 변경 | 팀별 규칙 동의 (리더 서명 tx) |
| 11 | ticket_order | 티켓 | 변경 | 주문 (`order_ref` = 온체인 orderRef) |
| 12 | order_item | 티켓 | 유지 | 주문 항목 |
| 13 | ticket | 티켓 | 유지 | 티켓 (qr_secret TOTP 내장, entry_result·entered_at 내장) |
| 14 | payment | 결제 | **컬럼 교체** | 코인 결제 (지갑·모드·approve/purchase 서명 job) |
| 15 | **coin_charge** | 충전 | **신설** | 원화 충전 → mint (해외 카드·국내 카드·가상계좌) |
| 16 | chain_job | 체인 | 변경 | 온체인 트랜잭션 작업 (운영자 tx + 사용자 서명 tx 보고) |
| 17 | refund | 환불 | **컬럼 교체** | 환불 (에스크로 → 관객 지갑) |
| 18 | transfer | 양도 | 유지 | 양도 |
| 19 | settlement | 정산 | 변경 | 정산 (`release_tx_hash` 복원, `REDEEMED` 제거) |
| 20 | settlement_share | 정산 | **컬럼 교체** | 팀별 분배 내역 (수령 주소·release 확정·출금 누계) |
| 21 | dispute | 정산 | 유지 | 이의제기 |
| 22 | **coin_withdrawal** | 출금 | **신설(`redemption` 대체)** | 팀 원화 출금 (리더 서명 예치 → 이체 → burn) |
| 23 | **exchange_rate** | 코인 | **신설** | 표시 환율 (화면 환산 전용, 정산 계산에 사용 금지) |
| 24 | audit_log | 관리 | 변경 | 감사 로그 (append-only) |

삭제: `team_wallet`(→ `wallet`), `redemption`(→ `coin_withdrawal`). 미생성: `wallet_challenge`(Redis), `coin_job`(부활 없음).

## 2. 테이블 상세

### member
```sql
CREATE TABLE member (
    member_id       BIGINT AUTO_INCREMENT PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255),              -- LOCAL(자체 이메일) 회원만 값, 소셜 회원은 NULL
    name            VARCHAR(100) NOT NULL,
    phone           VARCHAR(20),               -- 외국인 관객은 NULL 허용(국내 본인인증 불필요)
    auth_provider   ENUM('GOOGLE','FACEBOOK','KAKAO','LOCAL') NOT NULL,   -- v3.1: LOCAL(이메일 가입)은 P1 예약, 기본값 없음(Web3Auth 동결)
    provider_user_id VARCHAR(255),             -- 소셜 제공자 사용자 ID
    web3auth_verifier_id VARCHAR(255),         -- Web3Auth verifier 식별자(idToken sub 매칭)
    country_code    CHAR(2) NOT NULL,          -- ISO 3166-1 alpha-2, 자기 선언(P-23)
    locale          VARCHAR(10) NOT NULL DEFAULT 'en',   -- en 기본, ko 병행(P-22)
    display_currency CHAR(3) NOT NULL DEFAULT 'USD',     -- 표시 통화(원 값은 항상 병기)
    timezone        VARCHAR(50) NOT NULL DEFAULT 'UTC',  -- IANA 시간대(KST 병기)
    is_admin        BOOLEAN NOT NULL DEFAULT FALSE,
    status          ENUM('ACTIVE','SUSPENDED','WITHDRAWN') NOT NULL DEFAULT 'ACTIVE',
    created_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uk_provider (auth_provider, provider_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### refresh_token
```sql
CREATE TABLE refresh_token (
    refresh_token_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    member_id        BIGINT NOT NULL,
    token_hash       VARCHAR(255) NOT NULL,
    issued_at        DATETIME(6) NOT NULL,
    expires_at       DATETIME(6) NOT NULL,
    prev_token_id    BIGINT,                   -- 회전 이력
    revoked          BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (member_id) REFERENCES member(member_id),
    FOREIGN KEY (prev_token_id) REFERENCES refresh_token(refresh_token_id)
) ENGINE=InnoDB;
```

### bank_account
```sql
CREATE TABLE bank_account (
    account_id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    member_id           BIGINT NOT NULL,           -- 복수 계좌 허용 (UNIQUE 없음)
    bank_code           VARCHAR(10) NOT NULL,
    encrypted_account_no VARCHAR(512) NOT NULL,     -- 암호화 보관
    holder_name         VARCHAR(100) NOT NULL,
    holder_verified     BOOLEAN NOT NULL DEFAULT FALSE, -- 예금주 검증 결과
    verified_at         DATETIME(6),
    FOREIGN KEY (member_id) REFERENCES member(member_id)
) ENGINE=InnoDB;
```
팀 원화 출금(off-ramp) 수취 계좌. 관객은 사용하지 않는다(관객 잔액 출금 없음, P-20).

### team
```sql
CREATE TABLE team (
    team_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    genre       VARCHAR(50),
    leader_id   BIGINT NOT NULL,                -- 팀 지갑 = 이 리더의 wallet (팀에 지갑 컬럼 없음)
    settlement_account_id BIGINT,               -- 정산 계좌 (NULL = 미등록)
    status      ENUM('ACTIVE','DISBANDED') NOT NULL DEFAULT 'ACTIVE',
    created_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at  DATETIME(6),                       -- 소프트 삭제
    FOREIGN KEY (leader_id) REFERENCES member(member_id),
    FOREIGN KEY (settlement_account_id) REFERENCES bank_account(account_id)
) ENGINE=InnoDB;
```
MVP는 리더 교체 불가(결정 문서 §14-20). 팀 지갑 주소는 `team.leader_id → wallet.address`로 파생하며 `team`에 주소 컬럼을 두지 않는다.

### wallet
```sql
CREATE TABLE wallet (
    wallet_id             BIGINT AUTO_INCREMENT PRIMARY KEY,
    member_id             BIGINT NOT NULL UNIQUE,          -- 회원당 지갑 1개 (팀 지갑 = 리더 지갑)
    provider              ENUM('WEB3AUTH','EXTERNAL') NOT NULL,            -- v3.1: EXTERNAL = Kaia Wallet(Web3Auth 모달 어댑터, 수수료 대납 서명 지원)만 MVP, MetaMask P1
    address               CHAR(42) NOT NULL UNIQUE,
    verified_at           DATETIME(6) NOT NULL,            -- idToken(wallets 클레임) 검증 시각. 자체 챌린지 서명 검증은 P1
    status                ENUM('LINKED','SUSPENDED') NOT NULL DEFAULT 'LINKED',
    last_balance_check_at DATETIME(6),
    cached_krws_balance   BIGINT NOT NULL DEFAULT 0,       -- 조회 캐시(원장은 체인)
    created_at            DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    FOREIGN KEY (member_id) REFERENCES member(member_id)
) ENGINE=InnoDB;
```
- **암호화 키 컬럼이 없다.** 서버는 사용자 개인키·니모닉·MPC 샤드를 어떤 형태로도 저장하지 않는다. v2 `team_wallet`의 `encrypted_private_key`·`dek_reference`는 대응 컬럼 없이 삭제됐다.
- `provider=WEB3AUTH`는 소셜 로그인 시 자동 생성된 MPC 지갑, `EXTERNAL`은 Kaia Wallet·MetaMask 등을 서명 챌린지로 소유 증명한 지갑이다. 챌린지 자체는 Redis(TTL 300s)에만 있고 테이블이 없다.
- `cached_krws_balance`는 화면 표시용 캐시다. 잔액의 진실은 온체인 `KRWS.balanceOf(address)`이며 검증 페이지도 체인을 읽는다.

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
v2 `deposit_bank_tx_id`(금융망 거래 식별자)는 삭제됐다. 보증금은 생성팀 리더가 KRWS로 서명 납부한다(P-21).

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
`SIGNING` = 리더가 `agreeToRules` tx 해시를 보고한 상태, `AGREED` = 서버가 receipt를 검증해 확정한 상태(§7).

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
    owner_member_id     BIGINT NOT NULL,            -- 현재 소유자 (양도 시 변경)
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
    mode            ENUM('BALANCE','AUTO_CHARGE') NOT NULL,
    auto_charge_id  BIGINT,                                -- AUTO_CHARGE일 때 coin_charge
    approve_job_id  BIGINT,                                -- APPROVE chain_job (USER, allowance 충분 시 NULL)
    purchase_job_id BIGINT,                                -- PURCHASE chain_job (USER)
    purchase_tx_hash CHAR(66),
    status          ENUM('REQUESTED','CHARGING','AWAITING_SIGNATURE','PAYING','PAID','FAILED','REFUNDED') NOT NULL DEFAULT 'REQUESTED',
    failure_code    VARCHAR(100),
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    requested_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    paid_at         DATETIME(6),
    FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id),
    FOREIGN KEY (payer_wallet_id) REFERENCES wallet(wallet_id),
    FOREIGN KEY (auto_charge_id) REFERENCES coin_charge(charge_id),
    FOREIGN KEY (approve_job_id) REFERENCES chain_job(chain_job_id),
    FOREIGN KEY (purchase_job_id) REFERENCES chain_job(chain_job_id)
) ENGINE=InnoDB;
```
v2의 `payment_method`·`virtual_account_id`·`virtual_account_no`·`card_no`·`card_transaction_no`·`bank_tx_id`·`confirmed_at`은 전부 삭제됐다. 카드·가상계좌는 이제 **충전(`coin_charge`)의 속성**이며 결제는 코인 이동 하나뿐이다(P-24 원장 단일화).

### coin_charge
```sql
CREATE TABLE coin_charge (
    charge_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
    member_id        BIGINT NOT NULL,
    wallet_id        BIGINT NOT NULL,                      -- mint 대상 지갑
    purpose          ENUM('MANUAL','AUTO_PAYMENT') NOT NULL DEFAULT 'MANUAL',
    ticket_order_id  BIGINT,                               -- AUTO_PAYMENT일 때 대상 주문
    method           ENUM('FOREIGN_CARD','DOMESTIC_CARD','VIRTUAL_ACCOUNT') NOT NULL,  -- v3.1: VIRTUAL_ACCOUNT는 P1(카드만 MVP), P2 예약: USDC_SWAP
    amount           BIGINT NOT NULL,                      -- 원화 금액 = 발행 KRWS (1:1)
    display_rate_id  BIGINT,                               -- 화면 환산에 쓴 표시 환율 스냅샷(영수증용, 선택)
    virtual_account_no VARCHAR(30),
    virtual_account_expires_at DATETIME(6),                -- 입금 기한 30분(P-19)
    card_no_masked   VARCHAR(19),
    card_transaction_no BIGINT,
    bank_tx_id       VARCHAR(255),
    mint_job_id      BIGINT,                               -- MINT chain_job (OPERATOR/MINTER)
    mint_tx_hash     CHAR(66),
    status           ENUM('REQUESTED','FIAT_CONFIRMED','MINTING','COMPLETED','FAILED','EXPIRED') NOT NULL DEFAULT 'REQUESTED',
    failure_code     VARCHAR(100),
    idempotency_key  VARCHAR(255) NOT NULL UNIQUE,
    requested_at     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    fiat_confirmed_at DATETIME(6),
    completed_at     DATETIME(6),
    FOREIGN KEY (member_id) REFERENCES member(member_id),
    FOREIGN KEY (wallet_id) REFERENCES wallet(wallet_id),
    FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id),
    FOREIGN KEY (display_rate_id) REFERENCES exchange_rate(rate_id),
    FOREIGN KEY (mint_job_id) REFERENCES chain_job(chain_job_id)
) ENGINE=InnoDB;
```
`idempotency_key`는 `KRWS.mint(to, amount, chargeRef)`의 `chargeRef` 원본이다. `status = FIAT_CONFIRMED`(금융망 성공 응답) 없이는 어떤 경로로도 mint하지 않는다(§2.2).

### chain_job
```sql
CREATE TABLE chain_job (
    chain_job_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    tx_type         ENUM('MINT','BURN','APPROVE','PURCHASE','REFUND','DEPOSIT','DEPOSIT_RETURN','DEPOSIT_FORFEIT','AGREE','LOCK','AGGREGATE','RELEASE','HALT','TREASURY_IN','TREASURY_RETURN') NOT NULL,  -- v3.1: GAS_CHARGE 삭제(수수료 대납 채택, P1 예비)
    signer_type     ENUM('OPERATOR','USER') NOT NULL DEFAULT 'OPERATOR',  -- USER = 프론트가 발신자 서명한 대납 tx RLP를 보고, 서버(fee payer)가 서명·전송·receipt 검증
    fee_delegated   BOOLEAN NOT NULL DEFAULT FALSE,   -- v3.1: USER job은 TRUE (Kaia FeeDelegatedSmartContractExecution)
    fee_payer_address CHAR(42),                       -- v3.1: 대납 서명 운영지갑 주소(USER job)
    sender_signed_rlp MEDIUMTEXT,                     -- v3.1: 발신자 서명 RLP(USER job, 전송 성공·CONFIRMED 후 NULL로 비움)
    issuer_type     ENUM('MOCK','EXTERNAL') NOT NULL DEFAULT 'MOCK',      -- 발행 어댑터(P-25). EXTERNAL은 P2 예약값
    requester_id    BIGINT,
    wallet_id       BIGINT,                     -- 서명·수신 지갑 (USER job, NULL 허용)
    ref_performance_id BIGINT,
    ref_ticket_id   BIGINT,
    ref_team_id     BIGINT,
    amount          BIGINT,                     -- 이 작업이 옮기는 KRWS 금액 (해당 없으면 NULL)
    status          ENUM('PENDING','SUBMITTED','CONFIRMED','FAILED') NOT NULL DEFAULT 'PENDING',
    tx_hash         CHAR(66),
    confirmations   INT NOT NULL DEFAULT 0,
    retry_count     INT NOT NULL DEFAULT 0,
    failure_reason  VARCHAR(500),
    idempotency_key VARCHAR(255) UNIQUE,        -- OPERATOR job은 NOT NULL 운용, USER job은 NULL(재시도 불가)
    requested_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    confirmed_at    DATETIME(6),
    FOREIGN KEY (requester_id) REFERENCES member(member_id),
    FOREIGN KEY (wallet_id) REFERENCES wallet(wallet_id),
    FOREIGN KEY (ref_performance_id) REFERENCES performance(performance_id),
    FOREIGN KEY (ref_ticket_id) REFERENCES ticket(ticket_id),
    FOREIGN KEY (ref_team_id) REFERENCES team(team_id)
) ENGINE=InnoDB;
```
- v2 `tx_type`의 `RECORD_CHOICE`·`CANCEL_CHOICE`는 삭제됐다(각각 `PURCHASE`·`REFUND`에 흡수). `TREASURY_IN` = 리더의 출금 예치 transfer, `TREASURY_RETURN` = 이체 실패 시 금고 → 리더 반환.
- `signer_type=USER` job은 **v3.1(수수료 대납)**: 프론트가 발신자 서명 RLP를 보고하면 `PENDING`으로 생성 → 서버 운영지갑이 fee payer 서명 후 `kaia_sendRawTransaction` → `SUBMITTED` → receipt 검증 후 `CONFIRMED`. 전송 실패 시 같은 RLP로 재시도 가능하므로 USER job도 `idempotency_key`를 채운다(RLP 해시).
- 가스 자동 충전(`GAS_CHARGE`)은 삭제됐다. 사용자 지갑은 KAIA 잔액 0으로 동작한다.
- **참조 방향**: 업무 테이블이 `*_job_id`로 chain_job을 가리키고, chain_job은 `ref_*`·`wallet_id`로 대상만 느슨하게 되짚는다. `coin_job`은 만들지 않는다.

### refund
```sql
CREATE TABLE refund (
    refund_id       BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_id       BIGINT NOT NULL,
    ticket_order_id BIGINT NOT NULL,
    payment_id      BIGINT NOT NULL,
    to_wallet_id    BIGINT NOT NULL,                -- 환불 수령 지갑(관객). 코인은 잔액으로 남는다(P-20)
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
v2의 `bank_refund_tx_id`(금융망 환불)·`cancel_choice_tx_hash`(별도 취소 tx)는 삭제됐다. 환불 1건 = `Splitter.refund` tx 1건이며 선택 카운터 감소도 그 안에서 처리된다.

### transfer
> **v3.1**: 양도(선물)는 P2 최후순위. 테이블·컬럼은 유지하되 MVP에서 쓰지 않는다.

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
티켓 양도는 소유권 이전만 하며 코인 이동이 없다(대금 정산은 당사자 간 문제, v3 유지).

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
`REDEEMED`가 삭제되어 **`RELEASED`가 종단 상태**다(§14-11). 이후 팀 원화 출금은 `coin_withdrawal`이 독립적으로 관리한다.

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
    withdrawn_amount BIGINT NOT NULL DEFAULT 0,     -- 이 분배액 중 원화로 출금된 누계
    UNIQUE KEY uk_settlement_team (settlement_id, team_id),
    FOREIGN KEY (settlement_id) REFERENCES settlement(settlement_id),
    FOREIGN KEY (team_id) REFERENCES team(team_id)
) ENGINE=InnoDB;
```
v2 `transfer_confirmed`(금융망 이체 확인)는 삭제됐다. release는 온체인 push이고, 원화 이체 여부는 `coin_withdrawal`이 따로 추적한다.

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

### coin_withdrawal
```sql
CREATE TABLE coin_withdrawal (
    withdrawal_id   BIGINT AUTO_INCREMENT PRIMARY KEY,
    team_id         BIGINT NOT NULL,
    wallet_id       BIGINT NOT NULL,                       -- 리더 지갑
    settlement_id   BIGINT,                                -- 대상 정산(선택, 잔액 통합 출금이면 NULL)
    kind            ENUM('BANK_TRANSFER') NOT NULL DEFAULT 'BANK_TRANSFER',  -- P1 예약: CARD_CANCEL, P2 예약: ONCHAIN
    amount          BIGINT NOT NULL,                       -- KRWS
    bank_account_id BIGINT NOT NULL,
    treasury_in_job_id BIGINT,                             -- TREASURY_IN chain_job (USER: 리더 → 상환 금고)
    treasury_in_tx_hash CHAR(66),
    bank_tx_id      VARCHAR(255),                          -- 금융망 원화 이체 거래 식별자
    burn_job_id     BIGINT,                                -- BURN chain_job (OPERATOR/BURNER)
    burn_tx_hash    CHAR(66),
    return_job_id   BIGINT,                                -- TREASURY_RETURN (이체 실패 시 금고 → 리더 반환)
    status          ENUM('AWAITING_SIGNATURE','TRANSFERRING','TRANSFERRED','BURNING','COMPLETED','FAILED','RETURNED') NOT NULL DEFAULT 'AWAITING_SIGNATURE',
    retry_count     INT NOT NULL DEFAULT 0,
    failure_reason  VARCHAR(500),
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    requested_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    completed_at    DATETIME(6),
    FOREIGN KEY (team_id) REFERENCES team(team_id),
    FOREIGN KEY (wallet_id) REFERENCES wallet(wallet_id),
    FOREIGN KEY (settlement_id) REFERENCES settlement(settlement_id),
    FOREIGN KEY (bank_account_id) REFERENCES bank_account(account_id),
    FOREIGN KEY (treasury_in_job_id) REFERENCES chain_job(chain_job_id),
    FOREIGN KEY (burn_job_id) REFERENCES chain_job(chain_job_id),
    FOREIGN KEY (return_job_id) REFERENCES chain_job(chain_job_id)
) ENGINE=InnoDB;
```
순서 불변식: **원화 이체 성공(`TRANSFERRED`) 확인 후에만 burn**한다. 이체 실패 시 burn하지 않고 금고 → 리더 반환(`RETURNED`). `idempotency_key`가 `KRWS.burn(amount, withdrawalRef)`의 `withdrawalRef` 원본이다.

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
**환율은 표시 환산(≈)에만 쓴다.** 정산·분배·컨트랙트·티켓 가격·충전 금액 계산에 절대 사용하지 않는다(P-17). 이 테이블을 참조하는 유일한 업무 컬럼은 영수증 스냅샷용 `coin_charge.display_rate_id`다.

### audit_log
```sql
CREATE TABLE audit_log (
    audit_log_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor_id        BIGINT,
    actor_role      VARCHAR(20),
    request_ip      VARCHAR(45),
    action_type     ENUM('ADMIN_ACTION','OPERATOR_SIGN','MINT','BURN','RELEASE','CHARGE','WITHDRAW','RATE_CHANGE','WALLET_LINK','STATUS_CHANGE') NOT NULL,
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
v2 `KEY_DECRYPT`·`REDEEM`은 삭제됐다(서버가 복호화할 사용자 키가 없다). `OPERATOR_SIGN`(서버 키 3개의 서명 이벤트)·`WALLET_LINK`·`CHARGE`·`WITHDRAW`·`RATE_CHANGE`가 신설됐다.

## 3. 관계 요약

```
member ─┬─< refresh_token
        ├─< bank_account (1:N, 복수 계좌)
        ├── wallet (1:1, 회원당 지갑 1개 — member_id UNIQUE)
        ├─< coin_charge
        ├─< ticket_order
        ├─< ticket (owner, buyer)
        ├─< transfer (sender, receiver)
        ├─< exchange_rate (published_by, 관리자)
        └─< audit_log

wallet ─┬─< coin_charge (mint 대상)
        ├─< payment (payer_wallet_id)
        ├─< refund (to_wallet_id, 환불 수령)
        ├─< coin_withdrawal (리더 지갑)
        └─< chain_job (wallet_id, 서명·수신 지갑)
   ※ wallet에는 개인키·니모닉·MPC 샤드·DEK 어떤 키 컬럼도 없다. 서버는 사용자 키를 보관하지 않는다.
   ※ 외부 지갑 등록 챌린지(wallet:challenge:{memberId})는 Redis TTL 300s — 테이블 없음(24개 미포함).

bank_account ─┬─< team.settlement_account_id
              └─< coin_withdrawal (수취 계좌)

team ──┬── leader_id >── member   ※ 팀 지갑 = team.leader_id → wallet (team에 주소 컬럼 없음)
       ├── settlement_account_id >── bank_account (N:1, 비식별, NULL 허용)
       ├─< performance_participant   (wallet_address = 리더 지갑 스냅샷)
       ├─< rule_agreement
       ├─< settlement_share
       ├─< dispute
       └─< coin_withdrawal

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
              ├─< coin_charge (AUTO_PAYMENT 부족분 충전)
              └─< ticket

ticket ─┬─< refund
        ├─< transfer
        ├── (qr_secret TOTP 내장 — 30초 회전, 양도 시 재생성)
        └── (entry_result, entered_at 내장 — 입장 1회성)

settlement ─┬─< settlement_share
            ├─< dispute
            └─< coin_withdrawal (settlement_id NULL 허용 — 잔액 통합 출금)

exchange_rate ──< coin_charge.display_rate_id (영수증 스냅샷, 표시 전용)

-- 온체인 작업은 chain_job 하나로 통합한다. coin_job은 v2에서 삭제된 뒤 v3에서도 부활하지 않는다.
chain_job ─┬── requester_id >── member (요청자)
           ├── wallet_id >── wallet (서명·수신 지갑, NULL 허용)
           ├── ref_performance_id >── performance (NULL 허용)
           ├── ref_ticket_id >── ticket (NULL 허용)
           └── ref_team_id >── team (NULL 허용)

chain_job <─┬── performance.deposit_job_id          (DEPOSIT, USER)
            ├── rule_agreement.agree_job_id         (AGREE, USER)
            ├── coin_charge.mint_job_id             (MINT, OPERATOR)
            ├── payment.approve_job_id              (APPROVE, USER)
            ├── payment.purchase_job_id             (PURCHASE, USER)
            ├── refund.refund_job_id                (REFUND, OPERATOR)
            ├── coin_withdrawal.treasury_in_job_id  (TREASURY_IN, USER)
            ├── coin_withdrawal.burn_job_id         (BURN, OPERATOR)
            └── coin_withdrawal.return_job_id       (TREASURY_RETURN, OPERATOR)
```

삭제된 v2 관계: `team ─< team_wallet`(팀 커스터디얼 지갑), `settlement ─< redemption`·`team ─< redemption`(팀 환급).

## 4. 인덱스 권고

| 테이블 | 인덱스 | 용도 |
|--------|--------|------|
| bank_account | (member_id) | 회원별 계좌 목록 |
| wallet | (address) | 주소 → 회원 역조회, 이벤트 대사 |
| coin_charge | (wallet_id, status) | 내 충전 이력·진행 중 충전 |
| coin_charge | (status, virtual_account_expires_at) | 가상계좌 30분 만료 배치 |
| ticket | (performance_id, status) | 재고 조회·입장 검증 |
| ticket | (owner_member_id, status) | 내 티켓 목록 |
| ticket_order | (member_id, performance_id) | 중복 구매 검사 |
| ticket_order | (status, payment_expires_at) | 만료 주문 배치 |
| transfer | (ticket_id, status) | 양도 중 확인 |
| chain_job | (status, requested_at) | 재시도 큐 |
| chain_job | (tx_type, status) | 유형별 작업 모니터링 |
| chain_job | (signer_type, status) | 사용자 서명 tx receipt 검증 대기열 |
| chain_job | (tx_hash) | 프론트 보고 해시 → job 역조회 |
| settlement | (performance_id) | 정산 조회 |
| settlement | (share_token) | 공유 링크 조회 |
| coin_withdrawal | (team_id, status) | 팀 출금 이력·진행 중 출금 |
| coin_withdrawal | (status, requested_at) | 이체·burn 재시도 큐 |
| exchange_rate | (pair, effective_from) | 유효 환율 조회(테이블 정의에 포함) |
| audit_log | (created_at) | 시간순 조회 |
| audit_log | (actor_id, action_type) | 행위자별 조회 |

## 5. v2 → v3 변경 이력

| 변경 | 내용 | 이유 |
|------|------|------|
| **`coin_charge` 신설** | 해외 카드·국내 카드·가상계좌 충전 → mint 이력 | 원화 on-ramp가 결제 수단에서 충전 수단으로 이동(P-7). mint는 `FIAT_CONFIRMED` 근거 없이 금지 |
| **`coin_withdrawal` 신설**, `redemption` 삭제 | 리더 서명 예치(TREASURY_IN) → 원화 이체 → burn 3단계 상태와 job 3종 참조 | 팀 수령이 "금융망 이체 1건"에서 "온체인·오프체인 3단계"로 바뀜(P-10). `redeem` → `withdraw` 개명(§14-13) |
| **`exchange_rate` 신설** | 관리자 등록 표시 환율(pair·rate·effective_from) | 외국인 관객 화면의 ≈ 환산 표기(P-17·P-22). 정산·분배 계산에는 절대 미사용 |
| `payment` 컬럼 교체 | `payment_method`·`virtual_account_*`·`card_*`·`bank_tx_id`·`confirmed_at` 삭제 → `payer_wallet_id`·`mode`·`auto_charge_id`·`approve_job_id`·`purchase_job_id`·`purchase_tx_hash`·`paid_at`, status 7종 | 결제 = `Splitter.purchase` 서명 tx 하나. 카드·가상계좌는 충전의 속성으로 이동(P-24 원장 단일화) |
| `chain_job` 확장 | `signer_type`·`issuer_type`·`wallet_id`·`amount`·`idempotency_key` 추가, `tx_type` 5종 → 16종(`RECORD_CHOICE`·`CANCEL_CHOICE` 삭제) | 사용자 서명 tx(USER)와 운영자 tx(OPERATOR)를 한 큐에서 추적(P-18). 선택 기록은 `purchase`에 흡수(§14-12) |
| `coin_job` 미부활 | 신설하지 않음 | mint·burn까지 `chain_job` 하나로 충분. 온체인 작업 큐 이원화를 만들지 않는다 |
| `member` 컬럼 변경 | `auth_provider` → `GOOGLE/FACEBOOK/KAKAO/LOCAL`, `web3auth_verifier_id`·`country_code`·`locale`·`display_currency`·`timezone` 추가 | Web3Auth 소셜 3종 동결, 외국인 관객 로케일·표시 통화·시간대(P-1·P-22·P-23) |
| `performance` 보증금 컬럼 교체 | `deposit_bank_tx_id` 삭제 → `deposit_job_id`·`deposit_tx_hash`·`deposit_return_tx_hash`, `deposit_status` ENUM 명문화 | 보증금이 금융망 거래에서 리더 서명 KRWS 납부로 바뀜(P-21) |
| `performance_participant.wallet_address` 추가 | createShow 시점 리더 지갑 스냅샷 | 온체인 `teamWallets` 배열과 1:1 대사. 정산 수령 주소를 생성 시점에 고정(§14-20) |
| `ticket_order.order_ref` 추가 | `CHAR(66)` UNIQUE, keccak256(orderId) | `purchase`·`refund` 이벤트의 `orderRef`로 온체인·오프체인 주문을 대사 |
| `rule_agreement` 변경 | `status`에 `SIGNING` 추가, `agree_job_id` 추가 | 동의가 운영자 tx에서 리더 서명 tx로 바뀌어 "해시 보고 → receipt 확정" 중간 상태가 필요 |
| `refund` 컬럼 교체 | `bank_refund_tx_id`·`cancel_choice_tx_hash` 삭제 → `refund_job_id`·`refund_tx_hash`·`to_wallet_id`, status 4종 명문화 | 환불이 금융망 이체에서 에스크로 → 관객 지갑 코인 반환으로 바뀜(P-8). 선택 카운터 감소는 같은 tx에 포함 |
| `settlement` 변경 | `release_tx_hash` 복원, status에서 `REDEEMED` 제거 | 분배가 온체인 `release`로 복귀. 출금은 `coin_withdrawal`이 별도 추적하므로 `RELEASED`가 종단(§14-11) |
| `settlement_share` 컬럼 교체 | `transfer_confirmed` 삭제 → `released`·`released_at`·`wallet_address`·`withdrawn_amount` | 팀별 분배 확정이 온체인 push이며, 원화 출금 진행도를 분배 건별로 누계 관리 |
| `audit_log.action_type` 변경 | `KEY_DECRYPT`·`REDEEM` 삭제 → `OPERATOR_SIGN`·`CHARGE`·`WITHDRAW`·`RATE_CHANGE`·`WALLET_LINK` 추가 | 복호화할 사용자 키가 없다. 서버 키 3개의 서명·충전·출금·환율 변경이 새 감사 대상 |
| `wallet_challenge` 미생성 | Redis `wallet:challenge:{memberId}` TTL 300s 메모로만 기재 | 1회용·5분 만료 nonce라 영속화 가치 없음. 24 테이블에 포함하지 않는다 |
| 테이블 수 | 22 → **24** (신설 3 + 대체 1, 삭제 2) | `wallet`·`coin_charge`·`coin_withdrawal`·`exchange_rate` 신설, `team_wallet`·`redemption` 삭제 |

### v3.1 (2026-09-02 팀 결정 반영 — 최소 사이즈·Web3Auth 동결·수수료 대납)

| 변경 | 내용 | 이유 |
|---|---|---|
| `member.auth_provider` | `DEFAULT 'LOCAL'` 제거(기본값 없음), `LOCAL`은 P1 예약값 | 이메일 가입 삭제(§14-18), Web3Auth 소셜 3종만 |
| `wallet.provider` | `EXTERNAL` = Kaia Wallet(Web3Auth 모달 어댑터)만 MVP, `verified_at`은 idToken 검증 시각 | 자체 챌린지 서명 P1(§14-23), 대납 서명 지원 지갑만(§14-26) |
| `wallet` | `gas_funded_at` 삭제 | 수수료 대납으로 사용자 지갑 가스 충전 없음 |
| `chain_job` | `tx_type`에서 `GAS_CHARGE` 삭제, `fee_delegated`·`fee_payer_address`·`sender_signed_rlp` 추가, USER job도 `idempotency_key` 사용 | Kaia 수수료 대납(§14-4 방식 B) — 서버가 발신자 서명 RLP를 받아 fee payer 서명·전송·재시도 |
| `coin_charge.method` | `VIRTUAL_ACCOUNT`는 P1 예약값(컬럼 유지) | 충전은 카드만(§14-24) |
| `transfer` | 유지, MVP 미사용. **ERD Cloud 반영본은 `10_ERD_v3_import_mvp.sql`(transfer 제외, 23 테이블)** | 양도 P2 최후순위(§14-25) |
| 테이블 수 | **24 유지** | 컬럼 변경만 |
