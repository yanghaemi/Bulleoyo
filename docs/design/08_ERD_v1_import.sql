-- ERD Cloud Import용 DDL (논리명 COMMENT 포함)
-- MySQL 8.0+

CREATE TABLE member (
    member_id       BIGINT AUTO_INCREMENT PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE COMMENT '이메일(로그인 아이디)',
    password_hash   VARCHAR(255) COMMENT '비밀번호 해시(OAuth 전용은 NULL)',
    name            VARCHAR(100) NOT NULL COMMENT '이름',
    phone           VARCHAR(20) COMMENT '연락처',
    auth_provider   VARCHAR(30) NOT NULL DEFAULT 'LOCAL' COMMENT '인증 방식(LOCAL/KAKAO/NAVER)',
    provider_user_id VARCHAR(255) COMMENT 'OAuth 제공자 사용자 ID',
    is_admin        BOOLEAN NOT NULL DEFAULT FALSE COMMENT '관리자 여부',
    status          VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' COMMENT '상태',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '수정 일시',
    UNIQUE KEY uk_provider (auth_provider, provider_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='회원';

CREATE TABLE refresh_token (
    refresh_token_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    member_id        BIGINT NOT NULL COMMENT '회원 식별자',
    token_hash       VARCHAR(255) NOT NULL COMMENT '토큰 해시값',
    issued_at        DATETIME NOT NULL COMMENT '발급 일시',
    expires_at       DATETIME NOT NULL COMMENT '만료 일시',
    prev_token_id    BIGINT COMMENT '이전 토큰(회전 이력)',
    revoked          BOOLEAN NOT NULL DEFAULT FALSE COMMENT '폐기 여부',
    FOREIGN KEY (member_id) REFERENCES member(member_id),
    FOREIGN KEY (prev_token_id) REFERENCES refresh_token(refresh_token_id)
) ENGINE=InnoDB COMMENT='리프레시 토큰';

CREATE TABLE member_bank_account (
    account_id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    member_id           BIGINT NOT NULL UNIQUE COMMENT '회원 식별자',
    bank_code           VARCHAR(10) NOT NULL COMMENT '은행 코드',
    encrypted_account_no VARCHAR(512) NOT NULL COMMENT '암호화된 계좌번호',
    holder_name         VARCHAR(100) NOT NULL COMMENT '예금주명',
    verified_at         DATETIME COMMENT '검증 일시',
    FOREIGN KEY (member_id) REFERENCES member(member_id)
) ENGINE=InnoDB COMMENT='관객 결제 계좌';

CREATE TABLE team (
    team_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE COMMENT '이름',
    description TEXT COMMENT '소개',
    genre       VARCHAR(50) COMMENT '장르',
    leader_id   BIGINT NOT NULL COMMENT '팀 리더 회원 식별자',
    status      VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' COMMENT '상태',
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '수정 일시',
    deleted_at  DATETIME COMMENT '삭제 일시(소프트 삭제)',
    FOREIGN KEY (leader_id) REFERENCES member(member_id)
) ENGINE=InnoDB COMMENT='공연팀';

CREATE TABLE team_member (
    team_member_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    team_id        BIGINT NOT NULL COMMENT '팀 식별자',
    member_id      BIGINT NOT NULL COMMENT '회원 식별자',
    role           VARCHAR(30) NOT NULL DEFAULT 'MEMBER' COMMENT '팀 내 역할(LEADER/MEMBER)',
    joined_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '합류 일시',
    UNIQUE KEY uk_team_member (team_id, member_id),
    FOREIGN KEY (team_id) REFERENCES team(team_id),
    FOREIGN KEY (member_id) REFERENCES member(member_id)
) ENGINE=InnoDB COMMENT='팀 소속';

CREATE TABLE team_invitation (
    invitation_id   BIGINT AUTO_INCREMENT PRIMARY KEY,
    team_id         BIGINT NOT NULL COMMENT '팀 식별자',
    invitee_email   VARCHAR(255) NOT NULL COMMENT '초대 대상 이메일',
    token           VARCHAR(512) NOT NULL COMMENT '서명된 토큰',
    expires_at      DATETIME NOT NULL COMMENT '만료 일시',
    status          VARCHAR(30) NOT NULL DEFAULT 'PENDING' COMMENT '상태',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
    FOREIGN KEY (team_id) REFERENCES team(team_id)
) ENGINE=InnoDB COMMENT='팀원 초대';

CREATE TABLE team_settlement_account (
    account_id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    team_id             BIGINT NOT NULL UNIQUE COMMENT '팀 식별자',
    bank_code           VARCHAR(10) NOT NULL COMMENT '은행 코드',
    encrypted_account_no VARCHAR(512) NOT NULL COMMENT '암호화된 계좌번호',
    holder_name         VARCHAR(100) NOT NULL COMMENT '예금주명',
    holder_verified     BOOLEAN NOT NULL DEFAULT FALSE COMMENT '예금주 검증 결과',
    verified_at         DATETIME COMMENT '검증 일시',
    FOREIGN KEY (team_id) REFERENCES team(team_id)
) ENGINE=InnoDB COMMENT='팀 정산 계좌';

CREATE TABLE team_wallet (
    wallet_id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    team_id             BIGINT NOT NULL UNIQUE COMMENT '팀 식별자',
    address             CHAR(42) NOT NULL UNIQUE COMMENT '지갑 주소(0x...)',
    encrypted_private_key VARBINARY(1024) NOT NULL,
    dek_reference       VARCHAR(255) NOT NULL COMMENT 'DEK 참조 정보',
    last_gas_charge_at  DATETIME COMMENT '마지막 가스 충전 일시',
    last_balance_check_at DATETIME COMMENT '마지막 잔액 조회 일시',
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
    FOREIGN KEY (team_id) REFERENCES team(team_id)
) ENGINE=InnoDB COMMENT='팀 커스터디얼 지갑';

CREATE TABLE performance (
    performance_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    title               VARCHAR(200) NOT NULL COMMENT '제목',
    description         TEXT COMMENT '소개',
    poster_image_path   VARCHAR(500) COMMENT '포스터 이미지 경로',
    performance_at      DATETIME NOT NULL COMMENT '공연 일시',
    entry_start_at      DATETIME COMMENT '입장 시작 시각',
    entry_end_at        DATETIME COMMENT '입장 종료 시각',
    venue_name          VARCHAR(200) COMMENT '장소명',
    venue_address       VARCHAR(500) COMMENT '장소 주소',
    creator_team_id     BIGINT NOT NULL COMMENT '주최 팀 식별자',
    creator_member_id   BIGINT NOT NULL COMMENT '주최자 회원 식별자',
    is_joint            BOOLEAN NOT NULL DEFAULT FALSE COMMENT '공동 공연 여부',
    status              VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT '상태',
    cancel_deadline_at  DATETIME COMMENT '취소 마감 일시(D-3)',
    sale_close_at       DATETIME COMMENT '판매 마감 일시(공연 1시간 전)',
    sale_start_at       DATETIME COMMENT '판매 시작 일시',
    on_chain_id         BIGINT COMMENT '온체인 공연 식별자',
    contract_address    CHAR(42) COMMENT '컨트랙트 주소',
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '수정 일시',
    FOREIGN KEY (creator_team_id) REFERENCES team(team_id),
    FOREIGN KEY (creator_member_id) REFERENCES member(member_id)
) ENGINE=InnoDB COMMENT='공연';

CREATE TABLE ticket_type (
    ticket_type_id  BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id  BIGINT NOT NULL COMMENT '공연 식별자',
    name            VARCHAR(100) NOT NULL COMMENT '이름',
    price           BIGINT NOT NULL COMMENT '가격(원 단위 정수)',
    total_quantity  INT NOT NULL COMMENT '총 수량',
    sold_quantity   INT NOT NULL DEFAULT 0 COMMENT '판매 수량',
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id)
) ENGINE=InnoDB COMMENT='티켓 옵션';

CREATE TABLE performance_participant (
    participant_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id      BIGINT NOT NULL COMMENT '공연 식별자',
    team_id             BIGINT NOT NULL COMMENT '팀 식별자',
    status              VARCHAR(30) NOT NULL DEFAULT 'REGISTERED' COMMENT '상태',
    registered_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록 일시',
    on_chain_index      INT,
    UNIQUE KEY uk_perf_team (performance_id, team_id),
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id),
    FOREIGN KEY (team_id) REFERENCES team(team_id)
) ENGINE=InnoDB COMMENT='참여팀';

CREATE TABLE settlement_rule (
    rule_id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id  BIGINT NOT NULL UNIQUE COMMENT '공연 식별자',
    equal_ratio_bp  INT NOT NULL COMMENT '균등 분배 비율(bp)',
    selection_ratio_bp INT NOT NULL COMMENT '관객 선택 비율(bp)',
    rules_hash      VARCHAR(66) COMMENT '규칙 해시(rulesHash)',
    is_locked       BOOLEAN NOT NULL DEFAULT FALSE COMMENT '잠금 여부',
    lock_tx_hash    CHAR(66) COMMENT '잠금 트랜잭션 해시',
    locked_at       DATETIME COMMENT '잠금 일시',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '수정 일시',
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id)
) ENGINE=InnoDB COMMENT='정산 규칙';

CREATE TABLE rule_agreement (
    agreement_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id  BIGINT NOT NULL COMMENT '공연 식별자',
    team_id         BIGINT NOT NULL COMMENT '팀 식별자',
    status          VARCHAR(30) NOT NULL DEFAULT 'PENDING' COMMENT '상태',
    agreed_rules_hash VARCHAR(66) COMMENT '동의 시 규칙 해시',
    agree_tx_hash   CHAR(66) COMMENT '동의 트랜잭션 해시',
    agreed_at       DATETIME COMMENT '동의 확정 일시',
    requested_by    BIGINT NOT NULL COMMENT '동의 요청자(팀 리더)',
    UNIQUE KEY uk_perf_team_agree (performance_id, team_id),
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id),
    FOREIGN KEY (team_id) REFERENCES team(team_id),
    FOREIGN KEY (requested_by) REFERENCES member(member_id)
) ENGINE=InnoDB COMMENT='규칙 동의';

CREATE TABLE ticket_order (
    ticket_order_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id  BIGINT NOT NULL COMMENT '공연 식별자',
    member_id       BIGINT NOT NULL COMMENT '회원 식별자',
    total_amount    BIGINT NOT NULL COMMENT '최종 분배액',
    total_quantity  INT NOT NULL COMMENT '총 수량',
    choice_team_id  BIGINT COMMENT '관람 목적 선택 팀',
    status          VARCHAR(30) NOT NULL DEFAULT 'PENDING_PAYMENT' COMMENT '상태',
    payment_expires_at DATETIME NOT NULL COMMENT '결제 만료 일시(15분)',
    confirmed_at    DATETIME COMMENT '결제 확인 일시',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '수정 일시',
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id),
    FOREIGN KEY (member_id) REFERENCES member(member_id),
    FOREIGN KEY (choice_team_id) REFERENCES team(team_id)
) ENGINE=InnoDB COMMENT='주문';

CREATE TABLE order_item (
    order_item_id   BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_order_id BIGINT NOT NULL COMMENT '주문 식별자',
    ticket_type_id  BIGINT NOT NULL COMMENT '티켓 타입 식별자',
    quantity        INT NOT NULL COMMENT '수량',
    unit_price      BIGINT NOT NULL COMMENT '단가(구매 시점)',
    subtotal        BIGINT NOT NULL COMMENT '소계',
    FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id),
    FOREIGN KEY (ticket_type_id) REFERENCES ticket_type(ticket_type_id)
) ENGINE=InnoDB COMMENT='주문 항목';

CREATE TABLE ticket (
    ticket_id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_order_id     BIGINT NOT NULL COMMENT '주문 식별자',
    ticket_type_id      BIGINT NOT NULL COMMENT '티켓 타입 식별자',
    performance_id      BIGINT NOT NULL COMMENT '공연 식별자',
    owner_member_id     BIGINT NOT NULL COMMENT '현재 소유자',
    buyer_member_id     BIGINT NOT NULL COMMENT '최초 구매자',
    status              VARCHAR(30) NOT NULL DEFAULT 'ISSUED' COMMENT '상태',
    original_price      BIGINT NOT NULL COMMENT '최초 구매 금액',
    on_chain_ticket_id  BIGINT COMMENT '온체인 티켓 식별자',
    choice_tx_hash      CHAR(66) COMMENT '선택 기록 트랜잭션 해시',
    issued_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '발급 일시',
    status_changed_at   DATETIME COMMENT '상태 변경 일시',
    FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id),
    FOREIGN KEY (ticket_type_id) REFERENCES ticket_type(ticket_type_id),
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id),
    FOREIGN KEY (owner_member_id) REFERENCES member(member_id),
    FOREIGN KEY (buyer_member_id) REFERENCES member(member_id)
) ENGINE=InnoDB COMMENT='티켓';

CREATE TABLE ticket_qr_seed (
    seed_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_id   BIGINT NOT NULL COMMENT '티켓 식별자',
    seed_value  VARCHAR(512) NOT NULL COMMENT 'QR 서명 시드값',
    issued_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '발급 일시',
    revoked     BOOLEAN NOT NULL DEFAULT FALSE COMMENT '폐기 여부',
    revoked_at  DATETIME COMMENT '폐기 일시',
    FOREIGN KEY (ticket_id) REFERENCES ticket(ticket_id)
) ENGINE=InnoDB COMMENT='QR 서명 시드';

CREATE TABLE payment (
    payment_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_order_id BIGINT NOT NULL UNIQUE COMMENT '주문 식별자',
    amount          BIGINT NOT NULL COMMENT '결제/환급 금액',
    account_id      BIGINT COMMENT '계좌 식별자',
    status          VARCHAR(30) NOT NULL DEFAULT 'REQUESTED' COMMENT '상태',
    bank_tx_id      VARCHAR(255) COMMENT '금융망 거래 식별자',
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    requested_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '요청 일시',
    confirmed_at    DATETIME COMMENT '결제 확인 일시',
    failure_code    VARCHAR(100) COMMENT '실패 사유 코드',
    FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id),
    FOREIGN KEY (account_id) REFERENCES member_bank_account(account_id)
) ENGINE=InnoDB COMMENT='결제';

CREATE TABLE coin_job (
    coin_job_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    job_type        VARCHAR(30) NOT NULL COMMENT '작업 유형(MINT/BURN)',
    amount          BIGINT NOT NULL COMMENT '결제/환급 금액',
    ref_order_id    BIGINT COMMENT '관련 주문 식별자',
    ref_refund_id   BIGINT COMMENT '관련 환불 식별자',
    ref_redemption_id BIGINT COMMENT '관련 환급 식별자',
    status          VARCHAR(30) NOT NULL DEFAULT 'PENDING' COMMENT '상태',
    tx_hash         CHAR(66) COMMENT '트랜잭션 해시',
    retry_count     INT NOT NULL DEFAULT 0 COMMENT '재시도 횟수',
    failure_reason  VARCHAR(500) COMMENT '실패 사유',
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    requested_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '요청 일시',
    confirmed_at    DATETIME COMMENT '결제 확인 일시'
) ENGINE=InnoDB COMMENT='KRWS 발행·소각 작업';

CREATE TABLE chain_job (
    chain_job_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    tx_type         VARCHAR(30) NOT NULL COMMENT '트랜잭션 종류',
    requester_id    BIGINT COMMENT '요청자 회원 식별자',
    ref_performance_id BIGINT COMMENT '대상 공연 식별자',
    ref_ticket_id   BIGINT COMMENT '대상 티켓 식별자',
    ref_team_id     BIGINT COMMENT '대상 팀 식별자',
    status          VARCHAR(30) NOT NULL DEFAULT 'PENDING' COMMENT '상태',
    tx_hash         CHAR(66) COMMENT '트랜잭션 해시',
    confirmations   INT NOT NULL DEFAULT 0 COMMENT '컨펌 수',
    retry_count     INT NOT NULL DEFAULT 0 COMMENT '재시도 횟수',
    failure_reason  VARCHAR(500) COMMENT '실패 사유',
    requested_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '요청 일시',
    confirmed_at    DATETIME COMMENT '결제 확인 일시',
    FOREIGN KEY (requester_id) REFERENCES member(member_id)
) ENGINE=InnoDB COMMENT='온체인 트랜잭션 작업';

CREATE TABLE refund (
    refund_id       BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_id       BIGINT NOT NULL COMMENT '티켓 식별자',
    ticket_order_id BIGINT NOT NULL COMMENT '주문 식별자',
    payment_id      BIGINT NOT NULL COMMENT '결제 식별자',
    reason          VARCHAR(30) NOT NULL COMMENT '환불/이의 사유',
    original_amount BIGINT NOT NULL COMMENT '원 결제 금액',
    fee             BIGINT NOT NULL DEFAULT 0 COMMENT '취소 수수료',
    refund_amount   BIGINT NOT NULL COMMENT '실제 환불 금액',
    fee_tier        VARCHAR(20) COMMENT '수수료 구간(D-7/D-3)',
    bank_refund_tx_id VARCHAR(255) COMMENT '금융망 환불 거래 ID',
    burn_job_id     BIGINT COMMENT '소각 작업 식별자',
    cancel_choice_tx_hash CHAR(66) COMMENT '선택 취소 트랜잭션 해시',
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '상태',
    retry_count     INT NOT NULL DEFAULT 0 COMMENT '재시도 횟수',
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    requested_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '요청 일시',
    completed_at    DATETIME COMMENT '완료 일시',
    FOREIGN KEY (ticket_id) REFERENCES ticket(ticket_id),
    FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id),
    FOREIGN KEY (payment_id) REFERENCES payment(payment_id),
    FOREIGN KEY (burn_job_id) REFERENCES coin_job(coin_job_id)
) ENGINE=InnoDB COMMENT='환불';

CREATE TABLE transfer (
    transfer_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_id       BIGINT NOT NULL COMMENT '티켓 식별자',
    sender_id       BIGINT NOT NULL COMMENT '보낸 회원 식별자',
    receiver_id     BIGINT COMMENT '받은 회원 식별자',
    token           VARCHAR(512) NOT NULL COMMENT '서명된 토큰',
    expires_at      DATETIME NOT NULL COMMENT '만료 일시',
    status          VARCHAR(30) NOT NULL DEFAULT 'PENDING' COMMENT '상태',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
    resolved_at     DATETIME COMMENT '수락·취소·만료 일시',
    FOREIGN KEY (ticket_id) REFERENCES ticket(ticket_id),
    FOREIGN KEY (sender_id) REFERENCES member(member_id),
    FOREIGN KEY (receiver_id) REFERENCES member(member_id)
) ENGINE=InnoDB COMMENT='양도';

CREATE TABLE entry_log (
    entry_log_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_id       BIGINT NOT NULL COMMENT '티켓 식별자',
    performance_id  BIGINT NOT NULL COMMENT '공연 식별자',
    result          VARCHAR(30) NOT NULL COMMENT '판정 결과',
    scanned_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '스캔 일시',
    first_entry_at  DATETIME COMMENT '최초 입장 일시',
    failure_code    VARCHAR(100) COMMENT '실패 사유 코드',
    FOREIGN KEY (ticket_id) REFERENCES ticket(ticket_id),
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id)
) ENGINE=InnoDB COMMENT='입장 이력';

CREATE TABLE settlement (
    settlement_id   BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id  BIGINT NOT NULL UNIQUE COMMENT '공연 식별자',
    status          VARCHAR(30) NOT NULL DEFAULT 'NONE' COMMENT '상태',
    total_revenue   BIGINT COMMENT '총 매출',
    valid_ticket_count INT COMMENT '유효 티켓 수',
    total_choice_count INT COMMENT '팀 선택 수 합계',
    counter_match   BOOLEAN COMMENT '온체인·서버 대조 결과',
    aggregated_at   DATETIME COMMENT '집계 확정 일시',
    locked_at       DATETIME COMMENT '잠금 일시',
    dispute_deadline_at DATETIME COMMENT '이의제기 마감 일시(잠금+48h)',
    released_at     DATETIME COMMENT 'release 일시',
    aggregate_tx_hash CHAR(66) COMMENT '집계 트랜잭션 해시',
    lock_tx_hash    CHAR(66) COMMENT '잠금 트랜잭션 해시',
    release_tx_hash CHAR(66) COMMENT '분배 트랜잭션 해시',
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id)
) ENGINE=InnoDB COMMENT='정산';

CREATE TABLE settlement_share (
    share_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
    settlement_id   BIGINT NOT NULL COMMENT '정산 식별자',
    team_id         BIGINT NOT NULL COMMENT '팀 식별자',
    equal_amount    BIGINT NOT NULL COMMENT '균등 분배액',
    selection_amount BIGINT NOT NULL COMMENT '관객 선택 분배액',
    dust_amount     BIGINT NOT NULL DEFAULT 0 COMMENT 'dust 귀속액',
    total_amount    BIGINT NOT NULL COMMENT '최종 분배액',
    choice_count    INT NOT NULL COMMENT '해당 팀 선택 수',
    distribute_tx_hash CHAR(66) COMMENT '분배 트랜잭션 해시',
    deposit_confirmed BOOLEAN NOT NULL DEFAULT FALSE COMMENT '팀 지갑 입금 확인',
    UNIQUE KEY uk_settlement_team (settlement_id, team_id),
    FOREIGN KEY (settlement_id) REFERENCES settlement(settlement_id),
    FOREIGN KEY (team_id) REFERENCES team(team_id)
) ENGINE=InnoDB COMMENT='팀별 분배 내역';

CREATE TABLE dispute (
    dispute_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    settlement_id   BIGINT NOT NULL COMMENT '정산 식별자',
    team_id         BIGINT NOT NULL COMMENT '팀 식별자',
    member_id       BIGINT NOT NULL COMMENT '회원 식별자',
    reason          TEXT NOT NULL COMMENT '환불/이의 사유',
    status          VARCHAR(30) NOT NULL DEFAULT 'OPEN' COMMENT '상태',
    admin_comment   TEXT COMMENT '관리자 처리 의견',
    admin_id        BIGINT COMMENT '처리 관리자 식별자',
    submitted_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '제기 일시',
    resolved_at     DATETIME COMMENT '수락·취소·만료 일시',
    FOREIGN KEY (settlement_id) REFERENCES settlement(settlement_id),
    FOREIGN KEY (team_id) REFERENCES team(team_id),
    FOREIGN KEY (member_id) REFERENCES member(member_id),
    FOREIGN KEY (admin_id) REFERENCES member(member_id)
) ENGINE=InnoDB COMMENT='이의제기';

CREATE TABLE redemption (
    redemption_id   BIGINT AUTO_INCREMENT PRIMARY KEY,
    settlement_id   BIGINT NOT NULL COMMENT '정산 식별자',
    team_id         BIGINT NOT NULL COMMENT '팀 식별자',
    amount          BIGINT NOT NULL COMMENT '결제/환급 금액',
    status          VARCHAR(30) NOT NULL DEFAULT 'PENDING' COMMENT '상태',
    bank_tx_id      VARCHAR(255) COMMENT '금융망 거래 식별자',
    burn_job_id     BIGINT COMMENT '소각 작업 식별자',
    burn_tx_hash    CHAR(66) COMMENT '소각 트랜잭션 해시',
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    retry_count     INT NOT NULL DEFAULT 0 COMMENT '재시도 횟수',
    failure_reason  VARCHAR(500) COMMENT '실패 사유',
    requested_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '요청 일시',
    transferred_at  DATETIME COMMENT '이체 완료 일시',
    UNIQUE KEY uk_settlement_team_redeem (settlement_id, team_id),
    FOREIGN KEY (settlement_id) REFERENCES settlement(settlement_id),
    FOREIGN KEY (team_id) REFERENCES team(team_id),
    FOREIGN KEY (burn_job_id) REFERENCES coin_job(coin_job_id)
) ENGINE=InnoDB COMMENT='팀 환급';

CREATE TABLE audit_log (
    audit_log_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor_id        BIGINT COMMENT '행위자 회원 식별자',
    actor_role      VARCHAR(20) COMMENT '행위자 역할',
    request_ip      VARCHAR(45) COMMENT '요청 IP',
    action_type     VARCHAR(30) NOT NULL COMMENT '행위 유형',
    resource_type   VARCHAR(50) NOT NULL COMMENT '대상 리소스 종류',
    resource_id     BIGINT COMMENT '대상 리소스 식별자',
    request_summary TEXT COMMENT '요청 요약',
    result          VARCHAR(30) NOT NULL COMMENT '판정 결과',
    tx_hash         CHAR(66) COMMENT '트랜잭션 해시',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
    FOREIGN KEY (actor_id) REFERENCES member(member_id)
) ENGINE=InnoDB COMMENT='감사 로그';

