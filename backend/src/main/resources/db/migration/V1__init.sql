-- V1 — ERD v5 전체 스키마 (19 테이블)
--
-- 정본: docs/design/12_ERD_v5_import.sql (ERD Cloud 다이어그램 kpxqsmzYGNrskWTMF export)
-- 이 파일은 그 export에 **ERD Cloud가 표현하지 못하는 3가지**를 부여한 것이다
-- (12_ERD_v5_import.sql 헤더의 ★ 항목):
--   1. DATETIME → DATETIME(6)  · DEFAULT CURRENT_TIMESTAMP(6)   — 컨벤션 §4
--   2. updated_at 에 ON UPDATE CURRENT_TIMESTAMP(6)
--   3. FK 의 ON DELETE / ON UPDATE 규칙
-- 여기에 더해 모든 테이블에 CHARSET utf8mb4 · COLLATE utf8mb4_0900_ai_ci 를 명시했다(컨벤션 §4).
-- 컬럼·타입·ENUM 값·제약명·인덱스명은 export 원본과 **글자 단위로 동일**하다. 임의로 고치지 않는다.
--
-- FK 정책
--   CASCADE  order_item→ticket_order, settlement_share→settlement — 부모 없이 존재할 수 없는 구성요소
--   SET NULL chain_job 참조 5건, 감사·처리자 참조 3건 — 부가 참조이므로 부모 삭제를 막지 않는다
--   RESTRICT 그 외 전부(기본) — 업무 이력이라 부모를 지우지 못하게 막는다.
--            공연·팀·회원은 물리 삭제하지 않고 status(CANCELLED·DISBANDED·WITHDRAWN)로 처리한다
--   ON UPDATE CASCADE 는 전부 동일 — PK가 AUTO_INCREMENT라 실제로 갱신되지 않는 형식상의 값이다
--
-- ⚠️ 스키마를 고칠 때는 이 파일을 수정하지 않는다. V2 이후 마이그레이션을 새로 만든다.
--    ENUM 값 변경은 ALTER TABLE … MODIFY … ENUM(...) 마이그레이션과 코드 배포를 함께 계획한다(컨벤션 §4).
--
-- ERD에 테이블로 존재하지 않는 상태(Redis 전용, API v6 §0.12):
--   auth:refresh:{jti} 14d · auth:refresh:member:{memberId} · wallet:challenge:{memberId} 300s
--   wallet:balance (hash) · 입장 원타임 SETNX 마커 60s

SET NAMES utf8mb4;
-- ============================================================
-- member (기준 테이블)
-- ============================================================
CREATE TABLE member (
    member_id             BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '회원 식별자',
    email                 VARCHAR(255) NOT NULL UNIQUE COMMENT '이메일',
    password_hash         VARCHAR(255) COMMENT '비밀번호 해시',
    name                  VARCHAR(100) NOT NULL COMMENT '이름',
    phone                 VARCHAR(20) COMMENT '연락처',
    auth_provider         ENUM('GOOGLE','FACEBOOK','KAKAO','LOCAL') NOT NULL COMMENT '인증 방식(LOCAL=이메일 가입 P1 예약, 기본값 없음)',
    provider_user_id      VARCHAR(255) COMMENT '소셜 제공자 사용자 ID',
    country_code          CHAR(2) NOT NULL COMMENT '국가 코드',
    locale                VARCHAR(10) NOT NULL DEFAULT 'en' COMMENT '표시 언어',
    display_currency      CHAR(3) NOT NULL DEFAULT 'USD' COMMENT '표시 통화',
    timezone              VARCHAR(50) NOT NULL DEFAULT 'UTC' COMMENT '시간대',
    is_admin              BOOLEAN NOT NULL DEFAULT FALSE COMMENT '관리자 여부',
    status                ENUM('ACTIVE','SUSPENDED','WITHDRAWN') NOT NULL DEFAULT 'ACTIVE' COMMENT '회원 상태(WITHDRAWN=탈퇴)',
    created_at            DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '생성 일시',
    updated_at            DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '수정 일시',
    web3auth_verifier_id  VARCHAR(255) COMMENT 'Web3Auth verifier 식별자',
    UNIQUE KEY uk_provider (auth_provider, provider_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='회원';

-- ============================================================
-- exchange_rate (표시 환율 — 화면 환산 전용, 참조 업무 컬럼 없음)
--    PK 개명: rate_id → exchange_rate_id (v5, 컨벤션 PK={테이블명}_id)
-- ============================================================
CREATE TABLE exchange_rate (
    exchange_rate_id   BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '표시 환율 식별자',
    pair               VARCHAR(10) NOT NULL COMMENT '통화쌍',
    rate               DECIMAL(18, 6) NOT NULL COMMENT '환율',
    effective_from     DATETIME(6) NOT NULL COMMENT '적용 시작 일시',
    creator_member_id  BIGINT NOT NULL COMMENT '등록 관리자 회원 식별자',
    source             VARCHAR(100) NOT NULL DEFAULT 'MANUAL' COMMENT '출처',
    created_at         DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '생성 일시',
    KEY idx_pair_eff (pair, effective_from),
    CONSTRAINT fk_exchange_rate_member FOREIGN KEY (creator_member_id) REFERENCES member(member_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='표시 환율(정산·분배·컨트랙트·지급 금액 계산에는 사용 금지)';

-- ============================================================
-- chain_job (온체인 작업 큐 — coin_job은 부활하지 않는다)
--    MINT job = 시연용 지급의 유일한 이력 (wallet_id/amount/requester_member_id/idempotency_key=grantRef)
--    역참조 FK(wallet/performance/ticket/team)는 파일 말미 ALTER TABLE
-- ============================================================
CREATE TABLE chain_job (
    chain_job_id           BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '온체인 트랜잭션 작업 식별자',
    tx_type                ENUM('MINT','APPROVE','PURCHASE','REFUND','DEPOSIT','DEPOSIT_RETURN','DEPOSIT_FORFEIT','AGREE','LOCK','AGGREGATE','RELEASE','HALT') NOT NULL COMMENT '작업 유형 12종(MINT=시연용 지급, DEPOSIT_FORFEIT=P1)',
    signer_type            ENUM('OPERATOR','USER') NOT NULL DEFAULT 'OPERATOR' COMMENT '서명 주체(USER=발신자 서명 대납 tx)',
    fee_delegated          BOOLEAN NOT NULL DEFAULT FALSE COMMENT '수수료 대납 여부',
    fee_payer_address      CHAR(42) COMMENT '대납 서명 운영지갑 주소',
    sender_signed_rlp      MEDIUMTEXT COMMENT '발신자 서명 RLP',
    issuer_type            ENUM('MOCK','EXTERNAL') NOT NULL DEFAULT 'MOCK' COMMENT '발행 어댑터(EXTERNAL=P2 예약)',
    requester_member_id    BIGINT COMMENT '요청자 회원 식별자',
    wallet_id              BIGINT COMMENT '서명·수신 지갑 식별자',
    target_performance_id  BIGINT COMMENT '대상 공연 식별자',
    target_ticket_id       BIGINT COMMENT '대상 티켓 식별자',
    target_team_id         BIGINT COMMENT '대상 팀 식별자',
    amount                 BIGINT COMMENT '이동 금액',
    status                 ENUM('PENDING','SUBMITTED','CONFIRMED','FAILED') NOT NULL DEFAULT 'PENDING' COMMENT '상태',
    tx_hash                CHAR(66) COMMENT '트랜잭션 해시',
    confirmations          INT NOT NULL DEFAULT 0 COMMENT '확인 블록 수',
    retry_count            INT NOT NULL DEFAULT 0 COMMENT '재시도 횟수',
    failure_reason         VARCHAR(500) COMMENT '실패 사유',
    idempotency_key        VARCHAR(255) UNIQUE COMMENT '멱등키',
    requested_at           DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '요청 일시',
    confirmed_at           DATETIME(6) COMMENT '확정 일시',
    CONSTRAINT fk_chain_job_member FOREIGN KEY (requester_member_id) REFERENCES member(member_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='온체인 트랜잭션 작업';

-- ============================================================
-- wallet (회원 1:1 비수탁 지갑)
--    서버는 사용자 개인키·니모닉·MPC 샤드를 저장하지 않는다 — 암호화 키 컬럼 없음
--    v5: 잔액 캐시 2컬럼(cached_krws_balance·last_balance_check_at) 삭제 → Redis 해시 wallet:balance
-- ============================================================
CREATE TABLE wallet (
    wallet_id    BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '회원 지갑 식별자',
    member_id    BIGINT NOT NULL UNIQUE COMMENT '회원 식별자',
    provider     ENUM('WEB3AUTH','EXTERNAL') NOT NULL COMMENT '지갑 종류(EXTERNAL=Kaia Wallet MVP, MetaMask P1)',
    address      CHAR(42) NOT NULL UNIQUE COMMENT '지갑 주소',
    verified_at  DATETIME(6) NOT NULL COMMENT '검증 일시',
    status       ENUM('LINKED','SUSPENDED') NOT NULL DEFAULT 'LINKED' COMMENT '상태',
    created_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '생성 일시',
    CONSTRAINT fk_wallet_member FOREIGN KEY (member_id) REFERENCES member(member_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='회원 지갑(비수탁, 암호화 키 컬럼 없음)';

-- ============================================================
-- team (팀 지갑 = leader_member_id → wallet 으로 파생, 주소 컬럼 없음)
-- ============================================================
CREATE TABLE team (
    team_id           BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '공연팀 식별자',
    name              VARCHAR(100) NOT NULL UNIQUE COMMENT '이름',
    description       TEXT COMMENT '소개',
    genre             VARCHAR(50) COMMENT '장르',
    leader_member_id  BIGINT NOT NULL COMMENT '팀 리더 회원 식별자',
    status            ENUM('ACTIVE','DISBANDED') NOT NULL DEFAULT 'ACTIVE' COMMENT '상태',
    created_at        DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '생성 일시',
    updated_at        DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '수정 일시',
    deleted_at        DATETIME(6) COMMENT '삭제 일시',
    CONSTRAINT fk_team_member FOREIGN KEY (leader_member_id) REFERENCES member(member_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='공연팀';

-- ============================================================
-- performance (보증금 = 리더 서명 KRWS 납부)
-- ============================================================
CREATE TABLE performance (
    performance_id          BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '공연 식별자',
    title                   VARCHAR(200) NOT NULL COMMENT '공연명',
    description             TEXT COMMENT '공연 소개',
    poster_image_path       VARCHAR(500) COMMENT '포스터 이미지 경로',
    performance_at          DATETIME(6) NOT NULL COMMENT '공연 일시',
    entry_start_at          DATETIME(6) COMMENT '입장 시작 일시',
    entry_end_at            DATETIME(6) COMMENT '입장 종료 일시',
    venue_name              VARCHAR(200) COMMENT '공연장명',
    venue_address           VARCHAR(500) COMMENT '공연장 주소',
    creator_team_id         BIGINT NOT NULL COMMENT '생성 팀 식별자',
    is_joint                BOOLEAN NOT NULL DEFAULT FALSE COMMENT '공동 공연 여부',
    status                  ENUM('DRAFT','PENDING_AGREEMENT','ON_SALE','SALE_CLOSED','ENDED','CANCELLED') NOT NULL DEFAULT 'DRAFT' COMMENT '상태',
    cancel_deadline_at      DATETIME(6) COMMENT '취소 마감 일시',
    sale_close_at           DATETIME(6) COMMENT '판매 종료 일시',
    sale_start_at           DATETIME(6) COMMENT '판매 시작 확정 일시',
    on_chain_id             BIGINT COMMENT '온체인 공연 식별자',
    contract_address        CHAR(42) COMMENT 'RevenueSplitter 주소',
    deposit_amount          BIGINT NOT NULL COMMENT '공연 등록 보증금',
    deposit_status          ENUM('UNPAID','PAID','RETURNED','FORFEITED') NOT NULL DEFAULT 'UNPAID' COMMENT '보증금 상태(FORFEITED=P1 예약)',
    deposit_chain_job_id    BIGINT COMMENT '보증금 납부 작업 식별자',
    deposit_tx_hash         CHAR(66) COMMENT '보증금 납부 트랜잭션 해시',
    deposit_return_tx_hash  CHAR(66) COMMENT '보증금 반환 트랜잭션 해시',
    deposit_returned_at     DATETIME(6) COMMENT '보증금 반환 일시',
    created_at              DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '생성 일시',
    updated_at              DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '수정 일시',
    CONSTRAINT fk_performance_team FOREIGN KEY (creator_team_id) REFERENCES team(team_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_performance_chain_job FOREIGN KEY (deposit_chain_job_id) REFERENCES chain_job(chain_job_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='공연';

-- ============================================================
-- ticket_type
-- ============================================================
CREATE TABLE ticket_type (
    ticket_type_id  BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '티켓 옵션 식별자',
    performance_id  BIGINT NOT NULL COMMENT '공연 식별자',
    name            VARCHAR(100) NOT NULL COMMENT '옵션명',
    price           BIGINT NOT NULL COMMENT '가격',
    total_quantity  INT NOT NULL COMMENT '총 수량',
    sold_quantity   INT NOT NULL DEFAULT 0 COMMENT '판매 수량',
    CONSTRAINT fk_ticket_type_performance FOREIGN KEY (performance_id) REFERENCES performance(performance_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='티켓 옵션';

-- ============================================================
-- performance_participant (wallet_address = 리더 지갑 스냅샷)
--    PK 개명: participant_id → performance_participant_id (v5)
-- ============================================================
CREATE TABLE performance_participant (
    performance_participant_id  BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '공연 참여팀 식별자',
    performance_id              BIGINT NOT NULL COMMENT '공연 식별자',
    team_id                     BIGINT NOT NULL COMMENT '팀 식별자',
    status                      ENUM('REGISTERED','REMOVED') NOT NULL DEFAULT 'REGISTERED' COMMENT '상태',
    registered_at               DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '등록 일시',
    on_chain_index              INT COMMENT '온체인 팀 인덱스',
    team_share_bp               INT NOT NULL COMMENT '고정 풀 내 팀 비율',
    wallet_address              CHAR(42) COMMENT '리더 지갑 주소 스냅샷',
    UNIQUE KEY uk_perf_team (performance_id, team_id),
    CONSTRAINT fk_performance_participant_performance FOREIGN KEY (performance_id) REFERENCES performance(performance_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_performance_participant_team FOREIGN KEY (team_id) REFERENCES team(team_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='공연 참여팀';

-- ============================================================
-- settlement_rule
--    PK 개명: rule_id → settlement_rule_id (v5)
-- ============================================================
CREATE TABLE settlement_rule (
    settlement_rule_id  BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '정산 규칙 식별자',
    performance_id      BIGINT NOT NULL UNIQUE COMMENT '공연 식별자',
    fixed_ratio_bp      INT NOT NULL COMMENT '고정 분배 전체 비율',
    selection_ratio_bp  INT NOT NULL COMMENT '관객 선택 분배 비율',
    rules_hash          VARCHAR(66) COMMENT '규칙 해시',
    is_locked           BOOLEAN NOT NULL DEFAULT FALSE COMMENT '잠금 여부',
    lock_tx_hash        CHAR(66) COMMENT '잠금 트랜잭션 해시',
    locked_at           DATETIME(6) COMMENT '잠금 일시',
    created_at          DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '생성 일시',
    updated_at          DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '수정 일시',
    CONSTRAINT fk_settlement_rule_performance FOREIGN KEY (performance_id) REFERENCES performance(performance_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='정산 규칙';

-- ============================================================
-- rule_agreement (동의 = 리더 서명 tx)
--    PK 개명: agreement_id → rule_agreement_id (v5)
-- ============================================================
CREATE TABLE rule_agreement (
    rule_agreement_id    BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '팀별 규칙 동의 식별자',
    performance_id       BIGINT NOT NULL COMMENT '공연 식별자',
    team_id              BIGINT NOT NULL COMMENT '팀 식별자',
    status               ENUM('PENDING','SIGNING','AGREED') NOT NULL DEFAULT 'PENDING' COMMENT '상태',
    agreed_rules_hash    VARCHAR(66) COMMENT '동의한 규칙 해시',
    chain_job_id         BIGINT COMMENT '동의 작업 식별자',
    agree_tx_hash        CHAR(66) COMMENT '동의 트랜잭션 해시',
    agreed_at            DATETIME(6) COMMENT '동의 확정 일시',
    requester_member_id  BIGINT NOT NULL COMMENT '동의 요청자 회원 식별자',
    UNIQUE KEY uk_perf_team_agree (performance_id, team_id),
    CONSTRAINT fk_rule_agreement_performance FOREIGN KEY (performance_id) REFERENCES performance(performance_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_rule_agreement_team FOREIGN KEY (team_id) REFERENCES team(team_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_rule_agreement_chain_job FOREIGN KEY (chain_job_id) REFERENCES chain_job(chain_job_id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_rule_agreement_member FOREIGN KEY (requester_member_id) REFERENCES member(member_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='팀별 규칙 동의';

-- ============================================================
-- ticket_order (order_ref = 온체인 orderRef)
-- ============================================================
CREATE TABLE ticket_order (
    ticket_order_id     BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '주문 식별자',
    performance_id      BIGINT NOT NULL COMMENT '공연 식별자',
    member_id           BIGINT NOT NULL COMMENT '주문 회원 식별자',
    order_ref           CHAR(66) NOT NULL COMMENT '온체인 주문 참조',
    total_amount        BIGINT NOT NULL COMMENT '총 결제 금액',
    total_quantity      INT NOT NULL COMMENT '총 수량',
    selected_team_id    BIGINT COMMENT '관람 목적 팀',
    status              ENUM('PENDING_PAYMENT','PAID','CANCELLED','REFUNDED') NOT NULL DEFAULT 'PENDING_PAYMENT' COMMENT '상태',
    payment_expires_at  DATETIME(6) NOT NULL COMMENT '결제 만료 일시',
    confirmed_at        DATETIME(6) COMMENT '결제 확정 일시',
    created_at          DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '생성 일시',
    updated_at          DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '수정 일시',
    UNIQUE KEY uk_order_ref (order_ref),
    CONSTRAINT fk_ticket_order_performance FOREIGN KEY (performance_id) REFERENCES performance(performance_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_ticket_order_member FOREIGN KEY (member_id) REFERENCES member(member_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_ticket_order_team FOREIGN KEY (selected_team_id) REFERENCES team(team_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='주문';

-- ============================================================
-- order_item
--    unit_price는 v4 → v5 사이 ERD Cloud에서 유실됐다가 2026-09-03 복구됐다.
--    Cloud 표시 순서는 subtotal 뒤지만 이 파일은 v4의 논리 순서(quantity → unit_price → subtotal)를 따른다
-- ============================================================
CREATE TABLE order_item (
    order_item_id    BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '주문 항목 식별자',
    ticket_order_id  BIGINT NOT NULL COMMENT '주문 식별자',
    ticket_type_id   BIGINT NOT NULL COMMENT '티켓 옵션 식별자',
    quantity         INT NOT NULL COMMENT '수량',
    unit_price       BIGINT NOT NULL COMMENT '구매 시점 단가(KRWS) — 티켓 옵션 가격 변경과 무관하게 주문 시점 값을 보존',
    subtotal         BIGINT NOT NULL COMMENT '소계',
    CONSTRAINT fk_order_item_ticket_order FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_order_item_ticket_type FOREIGN KEY (ticket_type_id) REFERENCES ticket_type(ticket_type_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='주문 항목';

-- ============================================================
-- ticket (v5: member_id 단일 소유 컬럼, status 3값, purchase_price 개명)
-- ============================================================
CREATE TABLE ticket (
    ticket_id           BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '티켓 식별자',
    ticket_order_id     BIGINT NOT NULL COMMENT '주문 식별자',
    ticket_type_id      BIGINT NOT NULL COMMENT '티켓 옵션 식별자',
    performance_id      BIGINT NOT NULL COMMENT '공연 식별자',
    member_id           BIGINT NOT NULL COMMENT '회원 식별자',
    status              ENUM('ISSUED','USED','CANCELLED') NOT NULL DEFAULT 'ISSUED' COMMENT '상태(발급/사용/취소)',
    purchase_price      BIGINT NOT NULL COMMENT '환불액 산정 기준(발급 시점 가격 스냅샷)',
    on_chain_ticket_id  BIGINT COMMENT '온체인 티켓 식별자',
    choice_tx_hash      CHAR(66) COMMENT '선택 기록 purchase 트랜잭션 해시',
    issued_at           DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '발급 일시',
    status_changed_at   DATETIME(6) COMMENT '상태 변경 일시',
    entry_result        VARCHAR(30) COMMENT '입장 판정 결과',
    entered_at          DATETIME(6) COMMENT '입장 처리 일시',
    qr_secret           VARCHAR(512) NOT NULL COMMENT 'TOTP용 QR 비밀키',
    CONSTRAINT fk_ticket_ticket_order FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_ticket_ticket_type FOREIGN KEY (ticket_type_id) REFERENCES ticket_type(ticket_type_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_ticket_performance FOREIGN KEY (performance_id) REFERENCES performance(performance_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_ticket_member FOREIGN KEY (member_id) REFERENCES member(member_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='티켓';

-- ============================================================
-- payment (코인 결제 — 지갑 잔액 결제만, Splitter.purchase 사용자 서명)
-- ============================================================
CREATE TABLE payment (
    payment_id             BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '코인 결제 식별자',
    ticket_order_id        BIGINT NOT NULL UNIQUE COMMENT '주문 식별자',
    payer_wallet_id        BIGINT NOT NULL COMMENT '결제 서명 지갑 식별자',
    amount                 BIGINT NOT NULL COMMENT '결제 금액',
    approve_chain_job_id   BIGINT COMMENT 'approve 작업 식별자(APPROVE, USER, 생략 가능) — chain_job 2회 참조라 역할 접두',
    purchase_chain_job_id  BIGINT COMMENT 'purchase 작업 식별자(PURCHASE, USER) — chain_job 2회 참조라 역할 접두',
    purchase_tx_hash       CHAR(66) COMMENT 'purchase 트랜잭션 해시',
    status                 ENUM('REQUESTED','AWAITING_SIGNATURE','PAYING','PAID','FAILED','REFUNDED') NOT NULL DEFAULT 'REQUESTED' COMMENT '상태 6값',
    failure_code           VARCHAR(100) COMMENT '실패 코드',
    idempotency_key        VARCHAR(255) NOT NULL UNIQUE COMMENT '멱등키',
    requested_at           DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '요청 일시',
    paid_at                DATETIME(6) COMMENT '결제 확정 일시',
    CONSTRAINT fk_payment_ticket_order FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_payment_wallet FOREIGN KEY (payer_wallet_id) REFERENCES wallet(wallet_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_payment_chain_job_approve FOREIGN KEY (approve_chain_job_id) REFERENCES chain_job(chain_job_id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_payment_chain_job_purchase FOREIGN KEY (purchase_chain_job_id) REFERENCES chain_job(chain_job_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='코인 결제';

-- ============================================================
-- refund (에스크로 → 관객 지갑)
-- ============================================================
CREATE TABLE refund (
    refund_id           BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '환불 식별자',
    ticket_id           BIGINT NOT NULL COMMENT '티켓 식별자',
    ticket_order_id     BIGINT NOT NULL COMMENT '주문 식별자',
    payment_id          BIGINT NOT NULL COMMENT '결제 식별자',
    receiver_wallet_id  BIGINT NOT NULL COMMENT '환불 수령 지갑 식별자(티켓 소유자 지갑)',
    reason              ENUM('CUSTOMER_CANCEL','PERFORMANCE_CANCEL') NOT NULL COMMENT '환불 사유',
    original_amount     BIGINT NOT NULL COMMENT '원 결제 금액',
    fee                 BIGINT NOT NULL DEFAULT 0 COMMENT '취소 수수료',
    refund_amount       BIGINT NOT NULL COMMENT '실제 환불 금액',
    fee_tier            ENUM('BEFORE_D7','BEFORE_D3') COMMENT '수수료 구간(D-7 이전 전액 / D-3 이전 50%)',
    chain_job_id        BIGINT COMMENT '환불 작업 식별자(REFUND, OPERATOR)',
    refund_tx_hash      CHAR(66) COMMENT '환불 트랜잭션 해시',
    status              ENUM('PENDING','PROCESSING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING' COMMENT '상태',
    retry_count         INT NOT NULL DEFAULT 0 COMMENT '재시도 횟수',
    idempotency_key     VARCHAR(255) NOT NULL UNIQUE COMMENT '멱등키',
    requested_at        DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '요청 일시',
    completed_at        DATETIME(6) COMMENT '완료 일시',
    CONSTRAINT fk_refund_ticket FOREIGN KEY (ticket_id) REFERENCES ticket(ticket_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_refund_ticket_order FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_refund_payment FOREIGN KEY (payment_id) REFERENCES payment(payment_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_refund_wallet FOREIGN KEY (receiver_wallet_id) REFERENCES wallet(wallet_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_refund_chain_job FOREIGN KEY (chain_job_id) REFERENCES chain_job(chain_job_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='환불';

-- ============================================================
-- settlement (RELEASED = 종단 = 팀 수령 완료)
-- ============================================================
CREATE TABLE settlement (
    settlement_id        BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '정산 식별자',
    performance_id       BIGINT NOT NULL UNIQUE COMMENT '공연 식별자',
    status               ENUM('NONE','AGGREGATED','LOCKED','DISPUTE_OPEN','RELEASED','HALTED') NOT NULL DEFAULT 'NONE' COMMENT '상태(HALTED=공연 취소 또는 관리자 복구 불가 판정, 종단)',
    total_revenue        BIGINT COMMENT '총 매출',
    valid_ticket_count   INT COMMENT '유효 티켓 수',
    total_choice_count   INT COMMENT '총 선택 수',
    counter_match        BOOLEAN COMMENT '온체인·서버 대조 결과',
    aggregated_at        DATETIME(6) COMMENT '집계 확정 일시',
    locked_at            DATETIME(6) COMMENT '잠금 일시',
    dispute_deadline_at  DATETIME(6) COMMENT '이의제기 마감',
    released_at          DATETIME(6) COMMENT '분배 확정 일시',
    aggregate_tx_hash    CHAR(66) COMMENT '집계 트랜잭션 해시',
    lock_tx_hash         CHAR(66) COMMENT '잠금 트랜잭션 해시',
    release_tx_hash      CHAR(66) COMMENT '분배 트랜잭션 해시',
    share_token          VARCHAR(512) COMMENT '정산 내역 공개 링크 토큰',
    CONSTRAINT fk_settlement_performance FOREIGN KEY (performance_id) REFERENCES performance(performance_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='정산';

-- ============================================================
-- settlement_share
--    PK 개명: share_id → settlement_share_id (v5)
-- ============================================================
CREATE TABLE settlement_share (
    settlement_share_id  BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '팀별 분배 내역 식별자',
    settlement_id        BIGINT NOT NULL COMMENT '정산 식별자',
    team_id              BIGINT NOT NULL COMMENT '팀 식별자',
    wallet_address       CHAR(42) COMMENT '수령 주소 스냅샷',
    equal_amount         BIGINT NOT NULL COMMENT '고정 분배액',
    selection_amount     BIGINT NOT NULL COMMENT '관객 선택 분배액',
    dust_amount          BIGINT NOT NULL DEFAULT 0 COMMENT 'dust 귀속액',
    total_amount         BIGINT NOT NULL COMMENT '최종 분배액',
    choice_count         INT NOT NULL COMMENT '해당 팀 선택 수',
    released             BOOLEAN NOT NULL DEFAULT FALSE COMMENT '수령 완료 여부',
    released_at          DATETIME(6) COMMENT 'release 확정 일시',
    UNIQUE KEY uk_settlement_team (settlement_id, team_id),
    CONSTRAINT fk_settlement_share_settlement FOREIGN KEY (settlement_id) REFERENCES settlement(settlement_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_settlement_share_team FOREIGN KEY (team_id) REFERENCES team(team_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='팀별 분배 내역';

-- ============================================================
-- dispute
-- ============================================================
CREATE TABLE dispute (
    dispute_id         BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '이의제기 식별자',
    settlement_id      BIGINT NOT NULL COMMENT '정산 식별자',
    team_id            BIGINT NOT NULL COMMENT '팀 식별자',
    reason             TEXT NOT NULL COMMENT '이의 사유',
    status             ENUM('OPEN','RESOLVED','REJECTED') NOT NULL DEFAULT 'OPEN' COMMENT '상태',
    admin_comment      TEXT COMMENT '관리자 처리 의견',
    handler_member_id  BIGINT COMMENT '처리 관리자 식별자',
    submitted_at       DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '제기 일시',
    resolved_at        DATETIME(6) COMMENT '처리 일시',
    CONSTRAINT fk_dispute_settlement FOREIGN KEY (settlement_id) REFERENCES settlement(settlement_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_dispute_team FOREIGN KEY (team_id) REFERENCES team(team_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_dispute_member FOREIGN KEY (handler_member_id) REFERENCES member(member_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='이의제기';

-- ============================================================
-- audit_log (append-only)
-- ============================================================
CREATE TABLE audit_log (
    audit_log_id     BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '감사 로그 식별자',
    actor_member_id  BIGINT COMMENT '행위자 회원 식별자',
    actor_role       VARCHAR(20) COMMENT '행위자 역할',
    request_ip       VARCHAR(45) COMMENT '요청 IP',
    action_type      ENUM('ADMIN_ACTION','OPERATOR_SIGN','MINT','RELEASE','GRANT','RATE_CHANGE','WALLET_LINK','STATUS_CHANGE') NOT NULL COMMENT '행위 유형 8종',
    resource_type    VARCHAR(50) NOT NULL COMMENT '대상 리소스 종류',
    resource_id      BIGINT COMMENT '대상 리소스 식별자',
    request_summary  TEXT COMMENT '요청 요약',
    result           ENUM('SUCCESS','FAILURE') NOT NULL COMMENT '판정 결과',
    tx_hash          CHAR(66) COMMENT '트랜잭션 해시',
    created_at       DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '생성 일시',
    CONSTRAINT fk_audit_log_member FOREIGN KEY (actor_member_id) REFERENCES member(member_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='감사 로그';
-- ============================================================
-- 상호 참조 FK — chain_job 역참조 (대상 테이블 생성 이후)
-- ============================================================
ALTER TABLE chain_job ADD CONSTRAINT fk_chain_job_wallet
    FOREIGN KEY (wallet_id) REFERENCES wallet(wallet_id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE chain_job ADD CONSTRAINT fk_chain_job_performance
    FOREIGN KEY (target_performance_id) REFERENCES performance(performance_id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE chain_job ADD CONSTRAINT fk_chain_job_ticket
    FOREIGN KEY (target_ticket_id) REFERENCES ticket(ticket_id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE chain_job ADD CONSTRAINT fk_chain_job_team
    FOREIGN KEY (target_team_id) REFERENCES team(team_id) ON DELETE SET NULL ON UPDATE CASCADE;
