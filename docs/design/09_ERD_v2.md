# ERD 설계 v2 (2026-08-31)

> 원본: 04_요구사항_명세서_v2.md 엔티티 정의 기반
> 컨벤션: 02_개발_컨벤션.md §4 — snake_case, 단수형, PK `테이블명_id`, 예약어 회피(performance, ticket_order), 금액 BIGINT, 체인 주소 CHAR(42), tx 해시 CHAR(66)
> v1 대비 변경: `member_bank_account`+`team_settlement_account` → `bank_account` 통합, `team_member`·`team_invitation` 삭제, `team`에 `settlement_account_id` FK 추가, `settlement`에 `share_token` 추가, `performance.creator_member_id` 삭제, `entry_log` 삭제(ticket에 `entry_result`·`entered_at` 흡수), 정산 비율 2단계 구조(`settlement_rule.fixed_ratio_bp` + `performance_participant.team_share_bp`), `ticket_qr_seed` 삭제(ticket.`qr_secret`으로 TOTP 방식 전환), `coin_job` 삭제(KRWS 제거 — 결제·환불·환급은 금융망 직접 처리), `payment`에 결제수단·가상계좌·카드 컬럼 추가, `performance`에 보증금 컬럼 추가, `dispute.member_id` 삭제 (28 → 22 테이블)

## 1. 엔티티 목록 (22개)

| # | 테이블 | 도메인 | 설명 |
|---|--------|--------|------|
| 1 | member | 회원 | 회원 (관객+공연자+관리자) |
| 2 | refresh_token | 회원 | JWT 리프레시 토큰 |
| 3 | bank_account | 회원 | 계좌 (팀 정산 계좌 전용, 회원당 복수 가능) |
| 4 | team | 팀 | 공연팀 (리더 1인 관리, settlement_account_id로 정산 계좌 지정) |
| 5 | team_wallet | 지갑 | 팀 커스터디얼 지갑 (팀당 1개) |
| 6 | performance | 공연 | 공연 (보증금 deposit_* 포함) |
| 7 | ticket_type | 공연 | 티켓 옵션 (일반/얼리버드 등) |
| 8 | performance_participant | 공연 | 참여팀 (team_share_bp로 고정 풀 내 비율 지정) |
| 9 | settlement_rule | 규칙 | 정산 규칙 (공연당 1개) |
| 10 | rule_agreement | 규칙 | 팀별 규칙 동의 |
| 11 | ticket_order | 티켓 | 주문 |
| 12 | order_item | 티켓 | 주문 항목 |
| 13 | ticket | 티켓 | 티켓 (qr_secret TOTP 내장, entry_result·entered_at 내장) |
| 14 | payment | 결제 | 결제 (가상계좌/카드 지원) |
| 15 | chain_job | 체인 | 온체인 트랜잭션 작업 |
| 16 | refund | 환불 | 환불 |
| 17 | transfer | 양도 | 양도 |
| 18 | settlement | 정산 | 정산 (share_token으로 정산 내역 공유 링크 제공) |
| 19 | settlement_share | 정산 | 팀별 분배 내역 |
| 20 | dispute | 정산 | 이의제기 |
| 21 | redemption | 환급 | 팀 환급 |
| 22 | audit_log | 관리 | 감사 로그 (append-only) |

## 2. 테이블 상세

### member
```sql
CREATE TABLE member (
    member_id       BIGINT AUTO_INCREMENT PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255),              -- OAuth 전용 회원은 NULL
    name            VARCHAR(100) NOT NULL,
    phone           VARCHAR(20),
    auth_provider   ENUM('LOCAL','KAKAO','NAVER') NOT NULL DEFAULT 'LOCAL',
    provider_user_id VARCHAR(255),             -- OAuth 제공자 사용자 ID
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

### team
```sql
CREATE TABLE team (
    team_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    genre       VARCHAR(50),
    leader_id   BIGINT NOT NULL,
    settlement_account_id BIGINT,               -- 정산 계좌 (NULL = 미등록)
    status      ENUM('ACTIVE','DISBANDED') NOT NULL DEFAULT 'ACTIVE',
    created_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at  DATETIME(6),                       -- 소프트 삭제
    FOREIGN KEY (leader_id) REFERENCES member(member_id),
    FOREIGN KEY (settlement_account_id) REFERENCES bank_account(account_id)
) ENGINE=InnoDB;
```

### team_wallet
```sql
CREATE TABLE team_wallet (
    wallet_id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    team_id             BIGINT NOT NULL UNIQUE,     -- 팀당 1개
    address             CHAR(42) NOT NULL UNIQUE,
    encrypted_private_key VARBINARY(1024) NOT NULL,  -- AES-256-GCM DEK
    dek_reference       VARCHAR(255) NOT NULL,       -- KEK로 암호화된 DEK 참조
    last_gas_charge_at  DATETIME(6),
    last_balance_check_at DATETIME(6),
    created_at          DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    FOREIGN KEY (team_id) REFERENCES team(team_id)
) ENGINE=InnoDB;
```

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
    contract_address    CHAR(42),
    deposit_amount      BIGINT NOT NULL,                -- 공연 등록 보증금(원 단위)
    deposit_status      VARCHAR(30) NOT NULL DEFAULT 'UNPAID', -- UNPAID/PAID/RETURNED/FORFEITED
    deposit_bank_tx_id  VARCHAR(255),                   -- 금융망 보증금 거래 식별자
    deposit_returned_at DATETIME(6),                    -- 보증금 반환 일시
    created_at          DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at          DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    FOREIGN KEY (creator_team_id) REFERENCES team(team_id)
) ENGINE=InnoDB;
```

### ticket_type
```sql
CREATE TABLE ticket_type (
    ticket_type_id  BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id  BIGINT NOT NULL,
    name            VARCHAR(100) NOT NULL,          -- 일반, 얼리버드 등
    price           BIGINT NOT NULL,                -- 원 단위 정수
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
    on_chain_index      INT,                        -- 분배 계산 순서
    team_share_bp       INT NOT NULL,               -- 고정 풀 내 이 팀의 비율 (bp, 합 10000)
    UNIQUE KEY uk_perf_team (performance_id, team_id),
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id),
    FOREIGN KEY (team_id) REFERENCES team(team_id)
) ENGINE=InnoDB;
```

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
    status          ENUM('PENDING','AGREED') NOT NULL DEFAULT 'PENDING',
    agreed_rules_hash VARCHAR(66),
    agree_tx_hash   CHAR(66),
    agreed_at       DATETIME(6),
    requested_by    BIGINT NOT NULL,                -- 동의 요청한 팀 리더
    UNIQUE KEY uk_perf_team_agree (performance_id, team_id),
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id),
    FOREIGN KEY (team_id) REFERENCES team(team_id),
    FOREIGN KEY (requested_by) REFERENCES member(member_id)
) ENGINE=InnoDB;
```

### ticket_order
```sql
CREATE TABLE ticket_order (
    ticket_order_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id  BIGINT NOT NULL,
    member_id       BIGINT NOT NULL,
    total_amount    BIGINT NOT NULL,                -- 원 단위 정수
    total_quantity  INT NOT NULL,
    choice_team_id  BIGINT,                         -- 관람 목적 팀 (공동 공연 필수)
    status          ENUM('PENDING_PAYMENT','PAID','CANCELLED','REFUNDED') NOT NULL DEFAULT 'PENDING_PAYMENT',
    payment_expires_at DATETIME(6) NOT NULL,        -- 생성 후 15분
    confirmed_at    DATETIME(6),
    created_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
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
    unit_price      BIGINT NOT NULL,                -- 구매 시점 가격
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
    original_price      BIGINT NOT NULL,            -- 최초 구매 금액
    on_chain_ticket_id  BIGINT,
    choice_tx_hash      CHAR(66),
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
    ticket_order_id BIGINT NOT NULL UNIQUE,         -- 주문당 1건
    amount          BIGINT NOT NULL,
    payment_method  VARCHAR(30) NOT NULL,            -- VIRTUAL_ACCOUNT / CARD
    virtual_account_id VARCHAR(20),                  -- SSAFY 가상계좌 ID
    virtual_account_no VARCHAR(30),                  -- 가상계좌번호
    card_no         VARCHAR(16),                     -- 카드번호
    card_transaction_no BIGINT,                      -- 카드 거래고유번호 (취소 시 필요)
    status          ENUM('REQUESTED','CONFIRMED','FAILED','REFUNDED') NOT NULL DEFAULT 'REQUESTED',
    bank_tx_id      VARCHAR(255),                   -- 금융망 거래 ID
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    requested_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    confirmed_at    DATETIME(6),
    failure_code    VARCHAR(100),
    FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id)
) ENGINE=InnoDB;
```

### chain_job
```sql
CREATE TABLE chain_job (
    chain_job_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    tx_type         ENUM('AGREE','LOCK','RECORD_CHOICE','CANCEL_CHOICE','GAS_CHARGE') NOT NULL,
    requester_id    BIGINT,
    ref_performance_id BIGINT,
    ref_ticket_id   BIGINT,
    ref_team_id     BIGINT,
    status          ENUM('PENDING','SUBMITTED','CONFIRMED','FAILED') NOT NULL DEFAULT 'PENDING',
    tx_hash         CHAR(66),
    confirmations   INT NOT NULL DEFAULT 0,
    retry_count     INT NOT NULL DEFAULT 0,
    failure_reason  VARCHAR(500),
    requested_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    confirmed_at    DATETIME(6),
    FOREIGN KEY (requester_id) REFERENCES member(member_id),
    FOREIGN KEY (ref_performance_id) REFERENCES performance(performance_id),
    FOREIGN KEY (ref_ticket_id) REFERENCES ticket(ticket_id),
    FOREIGN KEY (ref_team_id) REFERENCES team(team_id)
) ENGINE=InnoDB;
```

### refund
```sql
CREATE TABLE refund (
    refund_id       BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_id       BIGINT NOT NULL,
    ticket_order_id BIGINT NOT NULL,
    payment_id      BIGINT NOT NULL,
    reason          ENUM('CUSTOMER_CANCEL','PERFORMANCE_CANCEL') NOT NULL,
    original_amount BIGINT NOT NULL,
    fee             BIGINT NOT NULL DEFAULT 0,      -- 취소 수수료
    refund_amount   BIGINT NOT NULL,                -- 실제 환불 금액
    fee_tier        VARCHAR(20),                    -- BEFORE_D7, BEFORE_D3
    bank_refund_tx_id VARCHAR(255),
    cancel_choice_tx_hash CHAR(66),
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    retry_count     INT NOT NULL DEFAULT 0,
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    requested_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    completed_at    DATETIME(6),
    FOREIGN KEY (ticket_id) REFERENCES ticket(ticket_id),
    FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id),
    FOREIGN KEY (payment_id) REFERENCES payment(payment_id)
) ENGINE=InnoDB;
```

### transfer
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

### settlement
```sql
CREATE TABLE settlement (
    settlement_id   BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id  BIGINT NOT NULL UNIQUE,
    status          ENUM('NONE','AGGREGATED','LOCKED','DISPUTE_OPEN','RELEASED','REDEEMED','HALTED') NOT NULL DEFAULT 'NONE',
    total_revenue   BIGINT,                         -- 총 매출
    valid_ticket_count INT,
    total_choice_count INT,
    counter_match   BOOLEAN,                        -- 온체인·서버 대조 결과
    aggregated_at   DATETIME(6),
    locked_at       DATETIME(6),
    dispute_deadline_at DATETIME(6),                -- 잠금 + 48h
    released_at     DATETIME(6),
    aggregate_tx_hash CHAR(66),
    lock_tx_hash    CHAR(66),
    share_token     VARCHAR(512),                   -- 정산 내역 공개 링크 토큰
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id)
) ENGINE=InnoDB;
```

### settlement_share
```sql
CREATE TABLE settlement_share (
    share_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
    settlement_id   BIGINT NOT NULL,
    team_id         BIGINT NOT NULL,
    equal_amount    BIGINT NOT NULL,                -- 균등 분배액
    selection_amount BIGINT NOT NULL,               -- 관객 선택 분배액
    dust_amount     BIGINT NOT NULL DEFAULT 0,      -- dust 귀속액
    total_amount    BIGINT NOT NULL,                -- 최종 분배액
    choice_count    INT NOT NULL,                   -- 해당 팀 선택 수
    transfer_confirmed BOOLEAN NOT NULL DEFAULT FALSE, -- 금융망 이체 확인
    UNIQUE KEY uk_settlement_team (settlement_id, team_id),
    FOREIGN KEY (settlement_id) REFERENCES settlement(settlement_id),
    FOREIGN KEY (team_id) REFERENCES team(team_id)
) ENGINE=InnoDB;
```

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

### redemption
```sql
CREATE TABLE redemption (
    redemption_id   BIGINT AUTO_INCREMENT PRIMARY KEY,
    settlement_id   BIGINT NOT NULL,
    team_id         BIGINT NOT NULL,
    amount          BIGINT NOT NULL,                -- 환급 금액
    status          ENUM('PENDING','TRANSFERRED','FAILED') NOT NULL DEFAULT 'PENDING',
    bank_tx_id      VARCHAR(255),
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    retry_count     INT NOT NULL DEFAULT 0,
    failure_reason  VARCHAR(500),
    requested_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    transferred_at  DATETIME(6),
    UNIQUE KEY uk_settlement_team_redeem (settlement_id, team_id),
    FOREIGN KEY (settlement_id) REFERENCES settlement(settlement_id),
    FOREIGN KEY (team_id) REFERENCES team(team_id)
) ENGINE=InnoDB;
```

### audit_log
```sql
CREATE TABLE audit_log (
    audit_log_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor_id        BIGINT,
    actor_role      VARCHAR(20),
    request_ip      VARCHAR(45),
    action_type     ENUM('ADMIN_ACTION','KEY_DECRYPT','MINT','BURN','RELEASE','REDEEM','STATUS_CHANGE') NOT NULL,
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

## 3. 관계 요약

```
member ─┬─< refresh_token
        ├─< bank_account (1:N, 복수 계좌)
        ├─< ticket_order
        ├─< ticket (owner, buyer)
        ├─< transfer (sender, receiver)
        └─< audit_log

bank_account ─< team.settlement_account_id

team ──┬── settlement_account_id >── bank_account (N:1, 비식별, NULL 허용)
       ├── leader_id >── member
       ├─< team_wallet (1:1)
       ├─< performance_participant
       ├─< rule_agreement
       ├─< settlement_share
       ├─< dispute
       └─< redemption

performance ─┬─< ticket_type
             ├─< performance_participant
             ├─< settlement_rule (1:1)
             ├─< ticket_order
             ├─< ticket
             └─< settlement (1:1)

ticket_order ─┬─< order_item
              ├─< payment (1:1)
              └─< ticket

ticket ─┬─< refund
        ├─< transfer
        ├── (qr_secret TOTP 내장 — 30초 회전, 양도 시 재생성)
        └── (entry_result, entered_at 내장 — 입장 1회성)

settlement ─┬─< settlement_share
            ├─< dispute
            └─< redemption

-- coin_job 삭제됨 (KRWS 제거)

chain_job ─┬── requester_id >── member (요청자)
           ├── ref_performance_id >── performance (대상 공연, NULL 허용)
           ├── ref_ticket_id >── ticket (대상 티켓, NULL 허용)
           └── ref_team_id >── team (대상 팀, NULL 허용)
```

## 4. 인덱스 권고

| 테이블 | 인덱스 | 용도 |
|--------|--------|------|
| bank_account | (member_id) | 회원별 계좌 목록 |
| ticket | (performance_id, status) | 재고 조회·입장 검증 |
| ticket | (owner_member_id, status) | 내 티켓 목록 |
| ticket_order | (member_id, performance_id) | 중복 구매 검사 |
| ticket_order | (status, payment_expires_at) | 만료 주문 배치 |
| transfer | (ticket_id, status) | 양도 중 확인 |
| chain_job | (status, requested_at) | 재시도 큐 |
| settlement | (performance_id) | 정산 조회 |
| settlement | (share_token) | 공유 링크 조회 |
| audit_log | (created_at) | 시간순 조회 |
| audit_log | (actor_id, action_type) | 행위자별 조회 |

## 5. v1 → v2 변경 이력

| 변경 | 내용 | 이유 |
|------|------|------|
| `member_bank_account` → `bank_account` | 테이블명 변경, `holder_verified` 추가, `member_id` UNIQUE 제거 | `team_settlement_account`와 통합 — 계좌는 결국 회원 소유이며 팀은 참조만 |
| `team_settlement_account` 삭제 | `team.settlement_account_id` FK로 대체 | `bank_account`로 통합 |
| `team_member` 삭제 | 팀원 개별 관리 불필요 | 플랫폼에서 팀원 개인이 수행하는 기능 없음 — 리더만 관리 |
| `team_invitation` 삭제 | 팀원 초대 기능 제거 | `team_member` 삭제에 따른 연쇄 제거 |
| `team.settlement_account_id` 추가 | `bank_account` FK (NULL 허용, 비식별) | 팀이 정산받을 계좌를 지정 |
| `settlement.share_token` 추가 | 정산 내역 공개 링크 토큰 | 팀원(밴드 멤버)이 계정 없이 정산 내역 열람 |
| `performance.creator_member_id` 삭제 | `creator_team_id` → `team.leader_id`로 파생 | 중복 데이터 제거 — 리더가 바뀌지 않는 구조 |
| `entry_log` 삭제 | `ticket`에 `entry_result`·`entered_at` 컬럼 흡수 | 입장 1회성 — 별도 테이블 불필요 |
| `settlement_rule.equal_ratio_bp` → `fixed_ratio_bp` | 고정 분배 전체 비율 (bp) | 2단계 정산 비율: 1단계 fixed+selection=10000, 2단계 팀별 team_share_bp 합=10000 |
| `performance_participant.team_share_bp` 추가 | 고정 풀 내 이 팀의 비율 (bp, 합 10000) | 팀별 커스텀 고정 분배 비율 지원 |
| `ticket_qr_seed` 삭제 | `ticket.qr_secret`으로 흡수 (TOTP 방식) | 동적 QR에 시드 이력 불필요 — 비밀키 1개로 시간 기반 회전 |
| `chain_job` ref_* FK 추가 | `ref_performance_id`·`ref_ticket_id`·`ref_team_id`에 FK 제약 추가 | 기존 plain BIGINT → 정식 FK로 참조 무결성 보장 |
| `coin_job` 삭제 | KRWS 스테이블코인 개념 제거 | 블록체인은 규칙·동의·선택 기록만 담당, 돈은 금융망에서만 이동 |
| `payment` 변경 | `account_id`·`mint_job_id` 삭제, `payment_method`·`virtual_account_id`·`virtual_account_no`·`card_no`·`card_transaction_no` 추가 | 가상계좌+카드 결제 지원, 관객 연결계좌 불필요 |
| `refund.burn_job_id` 삭제 | coin_job 삭제에 따른 연쇄 제거 | 환불은 금융망 환불만 |
| `redemption.burn_job_id`·`burn_tx_hash` 삭제 | coin_job 삭제에 따른 연쇄 제거 | 환급은 금융망 이체만 |
| `settlement.release_tx_hash` 삭제 | KRWS release 없음 | 정산 분배는 금융망 직접 이체 |
| `settlement_share` 변경 | `distribute_tx_hash`·`deposit_confirmed` → `transfer_confirmed` | KRWS 분배 → 금융망 이체 확인 |
| `performance` 보증금 추가 | `deposit_amount`·`deposit_status`·`deposit_bank_tx_id`·`deposit_returned_at` | 공연 등록 보증금 (스팸 방지) |
| `dispute.member_id` 삭제 | `team_id` → `team.leader_id`로 파생 | 중복 데이터 제거 |
