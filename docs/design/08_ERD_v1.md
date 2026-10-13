# ERD 설계 v1 (2026-08-31)

> 원본: 04_요구사항_명세서_v2.md 엔티티 정의 기반
> 컨벤션: 02_개발_컨벤션.md §4 — snake_case, 단수형, PK `테이블명_id`, 예약어 회피(performance, ticket_order), 금액 BIGINT, 체인 주소 CHAR(42), tx 해시 CHAR(66)

## 1. 엔티티 목록 (26개)

| # | 테이블 | 도메인 | 설명 |
|---|--------|--------|------|
| 1 | member | 회원 | 회원 (관객+공연자+관리자) |
| 2 | refresh_token | 회원 | JWT 리프레시 토큰 |
| 3 | member_bank_account | 회원 | 관객 결제 계좌 (1인 1계좌) |
| 4 | team | 팀 | 공연팀 |
| 5 | team_member | 팀 | 팀-회원 소속 |
| 6 | team_invitation | 팀 | 팀원 초대 |
| 7 | team_settlement_account | 팀 | 팀 정산 계좌 (팀당 1개) |
| 8 | team_wallet | 지갑 | 팀 커스터디얼 지갑 (팀당 1개) |
| 9 | performance | 공연 | 공연 |
| 10 | ticket_type | 공연 | 티켓 옵션 (일반/얼리버드 등) |
| 11 | performance_participant | 공연 | 참여팀 |
| 12 | settlement_rule | 규칙 | 정산 규칙 (공연당 1개) |
| 13 | rule_agreement | 규칙 | 팀별 규칙 동의 |
| 14 | ticket_order | 티켓 | 주문 |
| 15 | order_item | 티켓 | 주문 항목 |
| 16 | ticket | 티켓 | 티켓 |
| 17 | ticket_qr_seed | 티켓 | QR 서명 시드 |
| 18 | payment | 결제 | 결제 |
| 19 | coin_job | KRWS | 발행·소각 작업 |
| 20 | chain_job | 체인 | 온체인 트랜잭션 작업 |
| 21 | refund | 환불 | 환불 |
| 22 | transfer | 양도 | 양도 |
| 23 | entry_log | 입장 | 입장 이력 |
| 24 | settlement | 정산 | 정산 |
| 25 | settlement_share | 정산 | 팀별 분배 내역 |
| 26 | dispute | 정산 | 이의제기 |
| 27 | redemption | 환급 | 팀 환급 |
| 28 | audit_log | 관리 | 감사 로그 (append-only) |

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

### member_bank_account
```sql
CREATE TABLE member_bank_account (
    account_id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    member_id           BIGINT NOT NULL UNIQUE,    -- 1인 1계좌
    bank_code           VARCHAR(10) NOT NULL,
    encrypted_account_no VARCHAR(512) NOT NULL,     -- 암호화 보관
    holder_name         VARCHAR(100) NOT NULL,
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
    status      ENUM('ACTIVE','DISBANDED') NOT NULL DEFAULT 'ACTIVE',
    created_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at  DATETIME(6),                       -- 소프트 삭제
    FOREIGN KEY (leader_id) REFERENCES member(member_id)
) ENGINE=InnoDB;
```

### team_member
```sql
CREATE TABLE team_member (
    team_member_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    team_id        BIGINT NOT NULL,
    member_id      BIGINT NOT NULL,
    role           ENUM('LEADER','MEMBER') NOT NULL DEFAULT 'MEMBER',
    joined_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UNIQUE KEY uk_team_member (team_id, member_id),
    FOREIGN KEY (team_id) REFERENCES team(team_id),
    FOREIGN KEY (member_id) REFERENCES member(member_id)
) ENGINE=InnoDB;
```

### team_invitation
```sql
CREATE TABLE team_invitation (
    invitation_id   BIGINT AUTO_INCREMENT PRIMARY KEY,
    team_id         BIGINT NOT NULL,
    invitee_email   VARCHAR(255) NOT NULL,
    token           VARCHAR(512) NOT NULL,          -- 서명된 초대 토큰
    expires_at      DATETIME(6) NOT NULL,
    status          ENUM('PENDING','ACCEPTED','EXPIRED') NOT NULL DEFAULT 'PENDING',
    created_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    FOREIGN KEY (team_id) REFERENCES team(team_id)
) ENGINE=InnoDB;
```

### team_settlement_account
```sql
CREATE TABLE team_settlement_account (
    account_id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    team_id             BIGINT NOT NULL UNIQUE,     -- 팀당 1개
    bank_code           VARCHAR(10) NOT NULL,
    encrypted_account_no VARCHAR(512) NOT NULL,
    holder_name         VARCHAR(100) NOT NULL,
    holder_verified     BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at         DATETIME(6),
    FOREIGN KEY (team_id) REFERENCES team(team_id)
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
    creator_member_id   BIGINT NOT NULL,
    is_joint            BOOLEAN NOT NULL DEFAULT FALSE,
    status              ENUM('DRAFT','PENDING_AGREEMENT','ON_SALE','SALE_CLOSED','ENDED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
    cancel_deadline_at  DATETIME(6),                -- D-3 00:00
    sale_close_at       DATETIME(6),                -- 공연 시작 1시간 전
    sale_start_at       DATETIME(6),                -- startSale 확정 시각
    on_chain_id         BIGINT,
    contract_address    CHAR(42),
    created_at          DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at          DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    FOREIGN KEY (creator_team_id) REFERENCES team(team_id),
    FOREIGN KEY (creator_member_id) REFERENCES member(member_id)
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
    equal_ratio_bp  INT NOT NULL,                   -- 균등 분배 비율 (bp, 합 10000)
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
    FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id),
    FOREIGN KEY (ticket_type_id) REFERENCES ticket_type(ticket_type_id),
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id),
    FOREIGN KEY (owner_member_id) REFERENCES member(member_id),
    FOREIGN KEY (buyer_member_id) REFERENCES member(member_id)
) ENGINE=InnoDB;
```

### ticket_qr_seed
```sql
CREATE TABLE ticket_qr_seed (
    seed_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_id   BIGINT NOT NULL,
    seed_value  VARCHAR(512) NOT NULL,
    issued_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    revoked     BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at  DATETIME(6),
    FOREIGN KEY (ticket_id) REFERENCES ticket(ticket_id)
) ENGINE=InnoDB;
```

### payment
```sql
CREATE TABLE payment (
    payment_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_order_id BIGINT NOT NULL UNIQUE,         -- 주문당 1건
    amount          BIGINT NOT NULL,
    account_id      BIGINT,                         -- 출금 계좌
    status          ENUM('REQUESTED','CONFIRMED','FAILED','REFUNDED') NOT NULL DEFAULT 'REQUESTED',
    bank_tx_id      VARCHAR(255),                   -- 금융망 거래 ID
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    requested_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    confirmed_at    DATETIME(6),
    failure_code    VARCHAR(100),
    FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id),
    FOREIGN KEY (account_id) REFERENCES member_bank_account(account_id)
) ENGINE=InnoDB;
```

### coin_job
```sql
CREATE TABLE coin_job (
    coin_job_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    job_type        ENUM('MINT','BURN') NOT NULL,
    amount          BIGINT NOT NULL,
    ref_order_id    BIGINT,
    ref_refund_id   BIGINT,
    ref_redemption_id BIGINT,
    status          ENUM('PENDING','SUBMITTED','CONFIRMED','FAILED') NOT NULL DEFAULT 'PENDING',
    tx_hash         CHAR(66),
    retry_count     INT NOT NULL DEFAULT 0,
    failure_reason  VARCHAR(500),
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    requested_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    confirmed_at    DATETIME(6)
) ENGINE=InnoDB;
```

### chain_job
```sql
CREATE TABLE chain_job (
    chain_job_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    tx_type         ENUM('AGREE','LOCK','RECORD_CHOICE','CANCEL_CHOICE','RELEASE','GAS_CHARGE') NOT NULL,
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
    FOREIGN KEY (requester_id) REFERENCES member(member_id)
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
    burn_job_id     BIGINT,
    cancel_choice_tx_hash CHAR(66),
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    retry_count     INT NOT NULL DEFAULT 0,
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    requested_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    completed_at    DATETIME(6),
    FOREIGN KEY (ticket_id) REFERENCES ticket(ticket_id),
    FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id),
    FOREIGN KEY (payment_id) REFERENCES payment(payment_id),
    FOREIGN KEY (burn_job_id) REFERENCES coin_job(coin_job_id)
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

### entry_log
```sql
CREATE TABLE entry_log (
    entry_log_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_id       BIGINT NOT NULL,
    performance_id  BIGINT NOT NULL,
    result          ENUM('ADMITTED','DUPLICATE','EXPIRED','SIGNATURE_MISMATCH','OUT_OF_TIME','UNAUTHORIZED') NOT NULL,
    scanned_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    first_entry_at  DATETIME(6),
    failure_code    VARCHAR(100),
    FOREIGN KEY (ticket_id) REFERENCES ticket(ticket_id),
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id)
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
    release_tx_hash CHAR(66),
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
    distribute_tx_hash CHAR(66),
    deposit_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
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
    member_id       BIGINT NOT NULL,                -- 제기한 팀 리더
    reason          TEXT NOT NULL,
    status          ENUM('OPEN','RESOLVED','REJECTED') NOT NULL DEFAULT 'OPEN',
    admin_comment   TEXT,
    admin_id        BIGINT,
    submitted_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    resolved_at     DATETIME(6),
    FOREIGN KEY (settlement_id) REFERENCES settlement(settlement_id),
    FOREIGN KEY (team_id) REFERENCES team(team_id),
    FOREIGN KEY (member_id) REFERENCES member(member_id),
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
    burn_job_id     BIGINT,
    burn_tx_hash    CHAR(66),
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    retry_count     INT NOT NULL DEFAULT 0,
    failure_reason  VARCHAR(500),
    requested_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    transferred_at  DATETIME(6),
    UNIQUE KEY uk_settlement_team_redeem (settlement_id, team_id),
    FOREIGN KEY (settlement_id) REFERENCES settlement(settlement_id),
    FOREIGN KEY (team_id) REFERENCES team(team_id),
    FOREIGN KEY (burn_job_id) REFERENCES coin_job(coin_job_id)
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
        ├─< member_bank_account (1:1)
        ├─< team_member >─ team
        ├─< ticket_order
        ├─< ticket (owner, buyer)
        ├─< transfer (sender, receiver)
        └─< audit_log

team ──┬─< team_member
       ├─< team_invitation
       ├─< team_settlement_account (1:1)
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
             ├─< entry_log
             └─< settlement (1:1)

ticket_order ─┬─< order_item
              ├─< payment (1:1)
              └─< ticket

ticket ─┬─< ticket_qr_seed
        ├─< refund
        ├─< transfer
        └─< entry_log

settlement ─┬─< settlement_share
            ├─< dispute
            └─< redemption
```

## 4. 인덱스 권고

| 테이블 | 인덱스 | 용도 |
|--------|--------|------|
| ticket | (performance_id, status) | 재고 조회·입장 검증 |
| ticket | (owner_member_id, status) | 내 티켓 목록 |
| ticket_order | (member_id, performance_id) | 중복 구매 검사 |
| ticket_order | (status, payment_expires_at) | 만료 주문 배치 |
| entry_log | (ticket_id, result) | 중복 입장 검사 |
| transfer | (ticket_id, status) | 양도 중 확인 |
| chain_job | (status, requested_at) | 재시도 큐 |
| coin_job | (status, requested_at) | 재시도 큐 |
| settlement | (performance_id) | 정산 조회 |
| audit_log | (created_at) | 시간순 조회 |
| audit_log | (actor_id, action_type) | 행위자별 조회 |
