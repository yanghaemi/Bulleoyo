-- ERD Cloud Import용 DDL v4 (논리명 COMMENT 포함)
-- MySQL 8.0+ · 2026-09-02(수) 오후 · 기준: docs/planning/06_방향전환_코인전환_v2.md §8 (+ 덧씌워지지 않은 v1 절)
-- 이전: 10_ERD_v3_import.sql (24 테이블, v3.1) — 원본 무수정
--
-- 세계관: 화폐가 코인인 미래를 가정한다. 플랫폼은 시연용 코인을 지급할 뿐이며(화폐 발행 기관이 아니다),
--         모든 가치 이동은 지갑 간 온체인 전송이다. 법정화폐 입출구가 없으므로 계좌·법정화폐 거래 식별자·
--         코인 확보/반출 이력 테이블이 v4에는 존재하지 않는다.
--         지갑은 사용자 소유(Web3Auth/Kaia Wallet), 서버는 사용자 키를 보관하지 않는다 — wallet에 키 컬럼 없음.
--
-- 변경사항(v3.1 → v4):
--   테이블 4개 삭제 — v3.1 2번(리프레시 토큰, v4.1에서 Redis auth:refresh:{jti} TTL 14일로 대체)
--                  / 3번(회원 계좌) / 15번(코인 확보 이력) / 22번(팀 코인 반출 이력)
--   team          — settlement_account_id 컬럼·FK 삭제 (팀 수령처는 리더 지갑뿐)
--   payment       — mode·자동 코인 확보 참조 컬럼·FK 삭제, status 7종 → 6종 (CHARGING 제거)
--   settlement_share — 말미 반출 누계 컬럼 삭제 (수령 확인은 released/released_at/wallet_address로 종단)
--   chain_job     — tx_type 15종 → 12종 (소각 1종·금고 2종 제거). MINT job = 시연용 지급의 유일한 이력
--   audit_log     — action_type 10종 → 8종 (3종 삭제, GRANT 신설)
--   exchange_rate — 유지(표시 환율). 다만 이를 참조하던 유일한 업무 컬럼이 15번 테이블과 함께 사라졌다
--   wallet        — v3.1 그대로(암호화 키 컬럼 없음, gas_funded_at 없음)
--   chain_job     — v3.1 수수료 대납 컬럼(fee_delegated / fee_payer_address / sender_signed_rlp) 유지
--   (24 → 19 테이블, FK 44개 — transfer 제외)
--
-- 미생성: refresh_token — 세션 리프레시 토큰은 Redis key auth:refresh:{jti} TTL 14일. 회전·폐기는 DEL. 테이블 미포함
--         wallet_challenge — 외부 지갑 등록 챌린지는 Redis key wallet:challenge:{memberId} TTL 300s. 19 테이블 미포함
--         coin_job        — 부활하지 않는다. 모든 온체인 작업은 chain_job이 tx_type으로 구분
--         지급 이력 전용 테이블 — chain_job WHERE tx_type='MINT' 가 곧 이력 (결정 문서 v2 §2.2)
--         wallet_tx       — 지갑 거래 이력은 chain_job(wallet_id, tx_type, amount) 조회로 생성
--
-- 생성 순서: member → exchange_rate → chain_job → wallet → team → performance → … (부모 → 자식)
--            chain_job 의 wallet/performance/ticket/team 역참조 FK는 파일 말미 ALTER TABLE로 추가
--
-- 9/2 팀 결정 유지: Web3Auth 소셜 3종 단일(이메일 가입 P1), 외부 지갑 = Kaia Wallet, 수수료 대납, 양도 P2,
--                  체인 설정 프론트 env, en/USD 고정, 코인명 KRWS
-- [MVP 버전] transfer(양도) 테이블 제외 — 양도는 P2 최후순위(v1 §14-25). 19 테이블, FK 46개.
-- 원본(19 테이블)은 11_ERD_v4_import.sql
-- ============================================================
-- 1. member (기준 테이블)
-- ============================================================
CREATE TABLE member (
    member_id       BIGINT AUTO_INCREMENT PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE COMMENT '이메일(로그인 아이디)',
    password_hash   VARCHAR(255) COMMENT '비밀번호 해시(LOCAL 회원만 — P1 예약, 소셜은 NULL)',
    name            VARCHAR(100) NOT NULL COMMENT '이름',
    phone           VARCHAR(20) COMMENT '연락처(외국인 관객은 NULL 허용)',
    auth_provider   VARCHAR(30) NOT NULL COMMENT '인증 방식(GOOGLE/FACEBOOK/KAKAO, LOCAL은 P1 예약) — 기본값 없음',
    provider_user_id VARCHAR(255) COMMENT '소셜 제공자 사용자 ID',
    web3auth_verifier_id VARCHAR(255) COMMENT 'Web3Auth verifier 식별자',
    country_code    CHAR(2) NOT NULL COMMENT '국가 코드(ISO 3166-1 alpha-2, 자기 선언)',
    locale          VARCHAR(10) NOT NULL DEFAULT 'en' COMMENT '표시 언어(en 기본/ko)',
    display_currency CHAR(3) NOT NULL DEFAULT 'USD' COMMENT '표시 통화(원 값 항상 병기)',
    timezone        VARCHAR(50) NOT NULL DEFAULT 'UTC' COMMENT '시간대(IANA)',
    is_admin        BOOLEAN NOT NULL DEFAULT FALSE COMMENT '관리자 여부',
    status          VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' COMMENT '회원 상태(ACTIVE/SUSPENDED/WITHDRAWN=탈퇴)',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '수정 일시',
    UNIQUE KEY uk_provider (auth_provider, provider_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='회원';

-- ============================================================
-- 2. exchange_rate (표시 환율 — 화면 환산 전용, 참조 업무 컬럼 없음)
-- ============================================================
CREATE TABLE exchange_rate (
    rate_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
    pair           VARCHAR(10) NOT NULL COMMENT '통화쌍(USD_KRW 등, 표시용만)',
    rate           DECIMAL(18,6) NOT NULL COMMENT '환율(1 base = rate KRW)',
    effective_from DATETIME NOT NULL COMMENT '적용 시작 일시',
    published_by   BIGINT NOT NULL COMMENT '등록 관리자 회원 식별자',
    source         VARCHAR(100) NOT NULL DEFAULT 'MANUAL' COMMENT '출처(MANUAL 등)',
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
    KEY idx_pair_eff (pair, effective_from),
    FOREIGN KEY (published_by) REFERENCES member(member_id)
) ENGINE=InnoDB COMMENT='표시 환율(정산·분배·컨트랙트·지급 금액 계산에는 사용 금지)';

-- ============================================================
-- 3. chain_job (온체인 작업 큐 — coin_job은 부활하지 않는다)
--    MINT job = 시연용 지급의 유일한 이력 (wallet_id/amount/requester_id/idempotency_key=grantRef)
--    역참조 FK(wallet/performance/ticket/team)는 파일 말미 ALTER TABLE
-- ============================================================
CREATE TABLE chain_job (
    chain_job_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    tx_type         VARCHAR(30) NOT NULL COMMENT '작업 유형 12종(MINT/APPROVE/PURCHASE/REFUND/DEPOSIT/DEPOSIT_RETURN/DEPOSIT_FORFEIT/AGREE/LOCK/AGGREGATE/RELEASE/HALT)',
    signer_type     VARCHAR(30) NOT NULL DEFAULT 'OPERATOR' COMMENT '서명 주체(OPERATOR/USER — USER는 발신자 서명 대납 tx)',
    fee_delegated   BOOLEAN NOT NULL DEFAULT FALSE COMMENT '수수료 대납 여부(USER job TRUE)',
    fee_payer_address CHAR(42) COMMENT '대납 서명 운영지갑 주소(USER job)',
    sender_signed_rlp MEDIUMTEXT COMMENT '발신자 서명 RLP(USER job, 확정 후 NULL)',
    issuer_type     VARCHAR(30) NOT NULL DEFAULT 'MOCK' COMMENT '발행 어댑터(MOCK/EXTERNAL, EXTERNAL은 P2 예약)',
    requester_id    BIGINT COMMENT '요청자 회원 식별자(MINT: 관리자 지급이면 관리자, 가입 자동 지급이면 NULL)',
    wallet_id       BIGINT COMMENT '서명·수신 지갑 식별자(MINT는 수신 지갑, NULL 허용)',
    ref_performance_id BIGINT COMMENT '대상 공연 식별자(NULL 허용)',
    ref_ticket_id   BIGINT COMMENT '대상 티켓 식별자(NULL 허용)',
    ref_team_id     BIGINT COMMENT '대상 팀 식별자(NULL 허용)',
    amount          BIGINT COMMENT '이동 금액(KRWS, 해당 없으면 NULL)',
    status          VARCHAR(30) NOT NULL DEFAULT 'PENDING' COMMENT '상태(PENDING/SUBMITTED/CONFIRMED/FAILED)',
    tx_hash         CHAR(66) COMMENT '트랜잭션 해시',
    confirmations   INT NOT NULL DEFAULT 0 COMMENT '확인 블록 수',
    retry_count     INT NOT NULL DEFAULT 0 COMMENT '재시도 횟수',
    failure_reason  VARCHAR(500) COMMENT '실패 사유',
    idempotency_key VARCHAR(255) UNIQUE COMMENT '멱등키(OPERATOR job 필수 — MINT는 grantRef, USER job은 발신자 서명 RLP 해시)',
    requested_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '요청 일시',
    confirmed_at    DATETIME COMMENT '확정 일시',
    FOREIGN KEY (requester_id) REFERENCES member(member_id)
) ENGINE=InnoDB COMMENT='온체인 트랜잭션 작업';

-- ============================================================
-- 4. wallet (회원 1:1 비수탁 지갑)
--    서버는 사용자 개인키·니모닉·MPC 샤드를 저장하지 않는다 — 암호화 키 컬럼 없음
-- ============================================================
CREATE TABLE wallet (
    wallet_id             BIGINT AUTO_INCREMENT PRIMARY KEY,
    member_id             BIGINT NOT NULL UNIQUE COMMENT '회원 식별자(회원당 지갑 1개)',
    provider              VARCHAR(30) NOT NULL COMMENT '지갑 종류(WEB3AUTH/EXTERNAL — EXTERNAL은 Kaia Wallet만 MVP, MetaMask P1)',
    address               CHAR(42) NOT NULL UNIQUE COMMENT '지갑 주소(0x...)',
    verified_at           DATETIME NOT NULL COMMENT '검증 일시(idToken 검증, 챌린지 서명 검증은 P1)',
    status                VARCHAR(30) NOT NULL DEFAULT 'LINKED' COMMENT '상태(LINKED/SUSPENDED)',
    last_balance_check_at DATETIME COMMENT '마지막 잔액 조회 일시',
    cached_krws_balance   BIGINT NOT NULL DEFAULT 0 COMMENT '잔액 조회 캐시(원장은 체인)',
    created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
    FOREIGN KEY (member_id) REFERENCES member(member_id)
) ENGINE=InnoDB COMMENT='회원 지갑(비수탁, 암호화 키 컬럼 없음)';

-- ============================================================
-- 6. team (팀 지갑 = leader_id → wallet 으로 파생, 주소 컬럼 없음)
--    v4: 정산 계좌 참조 컬럼 삭제 — 팀 수령처는 리더 지갑뿐
-- ============================================================
CREATE TABLE team (
    team_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE COMMENT '이름',
    description TEXT COMMENT '소개',
    genre       VARCHAR(50) COMMENT '장르',
    leader_id   BIGINT NOT NULL COMMENT '팀 리더 회원 식별자(팀 지갑 = 리더 지갑)',
    status      VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' COMMENT '상태(ACTIVE/DISBANDED)',
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '수정 일시',
    deleted_at  DATETIME COMMENT '삭제 일시(소프트 삭제)',
    FOREIGN KEY (leader_id) REFERENCES member(member_id)
) ENGINE=InnoDB COMMENT='공연팀';

-- ============================================================
-- 7. performance (보증금 = 리더 서명 KRWS 납부)
-- ============================================================
CREATE TABLE performance (
    performance_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    title               VARCHAR(200) NOT NULL COMMENT '공연명',
    description         TEXT COMMENT '공연 소개',
    poster_image_path   VARCHAR(500) COMMENT '포스터 이미지 경로',
    performance_at      DATETIME NOT NULL COMMENT '공연 일시',
    entry_start_at      DATETIME COMMENT '입장 시작 일시',
    entry_end_at        DATETIME COMMENT '입장 종료 일시',
    venue_name          VARCHAR(200) COMMENT '공연장명',
    venue_address       VARCHAR(500) COMMENT '공연장 주소',
    creator_team_id     BIGINT NOT NULL COMMENT '생성 팀 식별자',
    is_joint            BOOLEAN NOT NULL DEFAULT FALSE COMMENT '공동 공연 여부',
    status              VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT '상태(DRAFT/PENDING_AGREEMENT/ON_SALE/SALE_CLOSED/ENDED/CANCELLED)',
    cancel_deadline_at  DATETIME COMMENT '취소 마감 일시(D-3 00:00)',
    sale_close_at       DATETIME COMMENT '판매 종료 일시(공연 1시간 전)',
    sale_start_at       DATETIME COMMENT '판매 시작 확정 일시',
    on_chain_id         BIGINT COMMENT '온체인 공연 식별자',
    contract_address    CHAR(42) COMMENT 'RevenueSplitter 주소',
    deposit_amount      BIGINT NOT NULL COMMENT '공연 등록 보증금(KRWS, 기본 50000)',
    deposit_status      VARCHAR(30) NOT NULL DEFAULT 'UNPAID' COMMENT '보증금 상태(UNPAID/PAID/RETURNED/FORFEITED, FORFEITED는 P1 예약)',
    deposit_job_id      BIGINT COMMENT '보증금 납부 작업 식별자(DEPOSIT, signer_type=USER)',
    deposit_tx_hash     CHAR(66) COMMENT '보증금 납부 트랜잭션 해시(리더 서명)',
    deposit_return_tx_hash CHAR(66) COMMENT '보증금 반환 트랜잭션 해시(운영자)',
    deposit_returned_at DATETIME COMMENT '보증금 반환 일시',
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '수정 일시',
    FOREIGN KEY (creator_team_id) REFERENCES team(team_id),
    FOREIGN KEY (deposit_job_id) REFERENCES chain_job(chain_job_id)
) ENGINE=InnoDB COMMENT='공연';

-- ============================================================
-- 8. ticket_type
-- ============================================================
CREATE TABLE ticket_type (
    ticket_type_id  BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id  BIGINT NOT NULL COMMENT '공연 식별자',
    name            VARCHAR(100) NOT NULL COMMENT '옵션명(일반/얼리버드 등)',
    price           BIGINT NOT NULL COMMENT '가격(KRWS 정수 = 원)',
    total_quantity  INT NOT NULL COMMENT '총 수량',
    sold_quantity   INT NOT NULL DEFAULT 0 COMMENT '판매 수량',
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id)
) ENGINE=InnoDB COMMENT='티켓 옵션';

-- ============================================================
-- 9. performance_participant (wallet_address = 리더 지갑 스냅샷)
-- ============================================================
CREATE TABLE performance_participant (
    participant_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id      BIGINT NOT NULL COMMENT '공연 식별자',
    team_id             BIGINT NOT NULL COMMENT '팀 식별자',
    status              VARCHAR(30) NOT NULL DEFAULT 'REGISTERED' COMMENT '상태(REGISTERED/REMOVED)',
    registered_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록 일시',
    on_chain_index      INT COMMENT '온체인 팀 인덱스(분배 계산 순서)',
    team_share_bp       INT NOT NULL COMMENT '고정 풀 내 이 팀의 비율(bp, 합 10000)',
    wallet_address      CHAR(42) COMMENT 'createShow 시점 리더 지갑 주소 스냅샷',
    UNIQUE KEY uk_perf_team (performance_id, team_id),
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id),
    FOREIGN KEY (team_id) REFERENCES team(team_id)
) ENGINE=InnoDB COMMENT='공연 참여팀';

-- ============================================================
-- 10. settlement_rule
-- ============================================================
CREATE TABLE settlement_rule (
    rule_id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id  BIGINT NOT NULL UNIQUE COMMENT '공연 식별자(공연당 1개)',
    fixed_ratio_bp  INT NOT NULL COMMENT '고정 분배 전체 비율(bp)',
    selection_ratio_bp INT NOT NULL COMMENT '관객 선택 분배 비율(bp)',
    rules_hash      VARCHAR(66) COMMENT '규칙 해시(rulesHash)',
    is_locked       BOOLEAN NOT NULL DEFAULT FALSE COMMENT '잠금 여부',
    lock_tx_hash    CHAR(66) COMMENT '잠금 트랜잭션 해시',
    locked_at       DATETIME COMMENT '잠금 일시',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '수정 일시',
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id)
) ENGINE=InnoDB COMMENT='정산 규칙';

-- ============================================================
-- 11. rule_agreement (동의 = 리더 서명 tx)
-- ============================================================
CREATE TABLE rule_agreement (
    agreement_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id  BIGINT NOT NULL COMMENT '공연 식별자',
    team_id         BIGINT NOT NULL COMMENT '팀 식별자',
    status          VARCHAR(30) NOT NULL DEFAULT 'PENDING' COMMENT '상태(PENDING/SIGNING/AGREED)',
    agreed_rules_hash VARCHAR(66) COMMENT '동의한 규칙 해시',
    agree_job_id    BIGINT COMMENT '동의 작업 식별자(AGREE, signer_type=USER)',
    agree_tx_hash   CHAR(66) COMMENT '동의 트랜잭션 해시',
    agreed_at       DATETIME COMMENT '동의 확정 일시',
    requested_by    BIGINT NOT NULL COMMENT '동의 요청자 회원 식별자',
    UNIQUE KEY uk_perf_team_agree (performance_id, team_id),
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id),
    FOREIGN KEY (team_id) REFERENCES team(team_id),
    FOREIGN KEY (requested_by) REFERENCES member(member_id),
    FOREIGN KEY (agree_job_id) REFERENCES chain_job(chain_job_id)
) ENGINE=InnoDB COMMENT='팀별 규칙 동의';

-- ============================================================
-- 12. ticket_order (order_ref = 온체인 orderRef)
-- ============================================================
CREATE TABLE ticket_order (
    ticket_order_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id  BIGINT NOT NULL COMMENT '공연 식별자',
    member_id       BIGINT NOT NULL COMMENT '주문 회원 식별자',
    order_ref       CHAR(66) NOT NULL COMMENT '온체인 주문 참조(keccak256(orderId))',
    total_amount    BIGINT NOT NULL COMMENT '총 결제 금액(KRWS)',
    total_quantity  INT NOT NULL COMMENT '총 수량',
    choice_team_id  BIGINT COMMENT '관람 목적 팀(공동 공연 필수, purchase tx에 함께 기록)',
    status          VARCHAR(30) NOT NULL DEFAULT 'PENDING_PAYMENT' COMMENT '상태(PENDING_PAYMENT/PAID/CANCELLED/REFUNDED)',
    payment_expires_at DATETIME NOT NULL COMMENT '결제 만료 일시(생성 후 15분)',
    confirmed_at    DATETIME COMMENT '결제 확정 일시',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '수정 일시',
    UNIQUE KEY uk_order_ref (order_ref),
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id),
    FOREIGN KEY (member_id) REFERENCES member(member_id),
    FOREIGN KEY (choice_team_id) REFERENCES team(team_id)
) ENGINE=InnoDB COMMENT='주문';

-- ============================================================
-- 13. order_item
-- ============================================================
CREATE TABLE order_item (
    order_item_id   BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_order_id BIGINT NOT NULL COMMENT '주문 식별자',
    ticket_type_id  BIGINT NOT NULL COMMENT '티켓 옵션 식별자',
    quantity        INT NOT NULL COMMENT '수량',
    unit_price      BIGINT NOT NULL COMMENT '구매 시점 단가(KRWS)',
    subtotal        BIGINT NOT NULL COMMENT '소계(KRWS)',
    FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id),
    FOREIGN KEY (ticket_type_id) REFERENCES ticket_type(ticket_type_id)
) ENGINE=InnoDB COMMENT='주문 항목';

-- ============================================================
-- 14. ticket
-- ============================================================
CREATE TABLE ticket (
    ticket_id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_order_id     BIGINT NOT NULL COMMENT '주문 식별자',
    ticket_type_id      BIGINT NOT NULL COMMENT '티켓 옵션 식별자',
    performance_id      BIGINT NOT NULL COMMENT '공연 식별자',
    owner_member_id     BIGINT NOT NULL COMMENT '현재 소유자 회원 식별자',
    buyer_member_id     BIGINT NOT NULL COMMENT '최초 구매자 회원 식별자',
    status              VARCHAR(30) NOT NULL DEFAULT 'ISSUED' COMMENT '상태(ISSUED/TRANSFER_PENDING/USED/CANCELLED)',
    original_price      BIGINT NOT NULL COMMENT '최초 구매 금액(KRWS)',
    on_chain_ticket_id  BIGINT COMMENT '온체인 티켓 식별자',
    choice_tx_hash      CHAR(66) COMMENT '관객 선택이 기록된 purchase 트랜잭션 해시',
    issued_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '발급 일시',
    status_changed_at   DATETIME COMMENT '상태 변경 일시',
    entry_result        VARCHAR(30) COMMENT '입장 판정 결과(입장 전 NULL)',
    entered_at          DATETIME COMMENT '입장 처리 일시',
    qr_secret           VARCHAR(512) NOT NULL COMMENT 'TOTP용 QR 비밀키(양도 시 재생성)',
    FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id),
    FOREIGN KEY (ticket_type_id) REFERENCES ticket_type(ticket_type_id),
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id),
    FOREIGN KEY (owner_member_id) REFERENCES member(member_id),
    FOREIGN KEY (buyer_member_id) REFERENCES member(member_id)
) ENGINE=InnoDB COMMENT='티켓';

-- ============================================================
-- 15. payment (코인 결제 — 지갑 잔액 결제만, Splitter.purchase 사용자 서명)
--     v4: mode·자동 코인 확보 참조 컬럼 삭제, status 6종
-- ============================================================
CREATE TABLE payment (
    payment_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_order_id BIGINT NOT NULL UNIQUE COMMENT '주문 식별자(주문당 1건)',
    payer_wallet_id BIGINT NOT NULL COMMENT '결제 서명 지갑 식별자',
    amount          BIGINT NOT NULL COMMENT '결제 금액(KRWS)',
    approve_job_id  BIGINT COMMENT 'approve 작업 식별자(APPROVE, USER, 생략 가능)',
    purchase_job_id BIGINT COMMENT 'purchase 작업 식별자(PURCHASE, USER)',
    purchase_tx_hash CHAR(66) COMMENT 'purchase 트랜잭션 해시',
    status          VARCHAR(30) NOT NULL DEFAULT 'REQUESTED' COMMENT '상태(REQUESTED/AWAITING_SIGNATURE/PAYING/PAID/FAILED/REFUNDED)',
    failure_code    VARCHAR(100) COMMENT '실패 코드',
    idempotency_key VARCHAR(255) NOT NULL UNIQUE COMMENT '멱등키',
    requested_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '요청 일시',
    paid_at         DATETIME COMMENT '결제 확정 일시',
    FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id),
    FOREIGN KEY (payer_wallet_id) REFERENCES wallet(wallet_id),
    FOREIGN KEY (approve_job_id) REFERENCES chain_job(chain_job_id),
    FOREIGN KEY (purchase_job_id) REFERENCES chain_job(chain_job_id)
) ENGINE=InnoDB COMMENT='코인 결제';

-- ============================================================
-- 16. refund (에스크로 → 관객 지갑)
-- ============================================================
CREATE TABLE refund (
    refund_id       BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_id       BIGINT NOT NULL COMMENT '티켓 식별자',
    ticket_order_id BIGINT NOT NULL COMMENT '주문 식별자',
    payment_id      BIGINT NOT NULL COMMENT '결제 식별자',
    to_wallet_id    BIGINT NOT NULL COMMENT '환불 수령 지갑 식별자(관객)',
    reason          VARCHAR(30) NOT NULL COMMENT '사유(CUSTOMER_CANCEL/PERFORMANCE_CANCEL)',
    original_amount BIGINT NOT NULL COMMENT '원 결제 금액(KRWS)',
    fee             BIGINT NOT NULL DEFAULT 0 COMMENT '취소 수수료(에스크로 잔류)',
    refund_amount   BIGINT NOT NULL COMMENT '실제 환불 금액(KRWS)',
    fee_tier        VARCHAR(20) COMMENT '수수료 구간(BEFORE_D7/BEFORE_D3)',
    refund_job_id   BIGINT COMMENT '환불 작업 식별자(REFUND, OPERATOR)',
    refund_tx_hash  CHAR(66) COMMENT '환불 트랜잭션 해시',
    status          VARCHAR(30) NOT NULL DEFAULT 'PENDING' COMMENT '상태(PENDING/PROCESSING/COMPLETED/FAILED)',
    retry_count     INT NOT NULL DEFAULT 0 COMMENT '재시도 횟수',
    idempotency_key VARCHAR(255) NOT NULL UNIQUE COMMENT '멱등키',
    requested_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '요청 일시',
    completed_at    DATETIME COMMENT '완료 일시',
    FOREIGN KEY (ticket_id) REFERENCES ticket(ticket_id),
    FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id),
    FOREIGN KEY (payment_id) REFERENCES payment(payment_id),
    FOREIGN KEY (to_wallet_id) REFERENCES wallet(wallet_id),
    FOREIGN KEY (refund_job_id) REFERENCES chain_job(chain_job_id)
) ENGINE=InnoDB COMMENT='환불';

-- ============================================================
-- 18. settlement (RELEASED = 종단 = 팀 수령 완료)
-- ============================================================
CREATE TABLE settlement (
    settlement_id   BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id  BIGINT NOT NULL UNIQUE COMMENT '공연 식별자',
    status          VARCHAR(30) NOT NULL DEFAULT 'NONE' COMMENT '상태(NONE/AGGREGATED/LOCKED/DISPUTE_OPEN/RELEASED/HALTED)',
    total_revenue   BIGINT COMMENT '총 매출(KRWS)',
    valid_ticket_count INT COMMENT '유효 티켓 수',
    total_choice_count INT COMMENT '총 선택 수',
    counter_match   BOOLEAN COMMENT '온체인·서버 대조 결과',
    aggregated_at   DATETIME COMMENT '집계 확정 일시',
    locked_at       DATETIME COMMENT '잠금 일시',
    dispute_deadline_at DATETIME COMMENT '이의제기 마감(잠금 + 48h)',
    released_at     DATETIME COMMENT '분배 확정 일시',
    aggregate_tx_hash CHAR(66) COMMENT '집계 트랜잭션 해시',
    lock_tx_hash    CHAR(66) COMMENT '잠금 트랜잭션 해시',
    release_tx_hash CHAR(66) COMMENT '분배 트랜잭션 해시(팀 리더 지갑 push)',
    share_token     VARCHAR(512) COMMENT '정산 내역 공개 링크 토큰',
    FOREIGN KEY (performance_id) REFERENCES performance(performance_id)
) ENGINE=InnoDB COMMENT='정산';

-- ============================================================
-- 19. settlement_share (v4: 반출 누계 컬럼 삭제)
-- ============================================================
CREATE TABLE settlement_share (
    share_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
    settlement_id   BIGINT NOT NULL COMMENT '정산 식별자',
    team_id         BIGINT NOT NULL COMMENT '팀 식별자',
    wallet_address  CHAR(42) COMMENT '수령 주소 스냅샷',
    equal_amount    BIGINT NOT NULL COMMENT '고정 분배액(KRWS)',
    selection_amount BIGINT NOT NULL COMMENT '관객 선택 분배액(KRWS)',
    dust_amount     BIGINT NOT NULL DEFAULT 0 COMMENT 'dust 귀속액(KRWS)',
    total_amount    BIGINT NOT NULL COMMENT '최종 분배액(KRWS)',
    choice_count    INT NOT NULL COMMENT '해당 팀 선택 수',
    released        BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'release 입금 확정 여부(수령 완료)',
    released_at     DATETIME COMMENT 'release 확정 일시',
    UNIQUE KEY uk_settlement_team (settlement_id, team_id),
    FOREIGN KEY (settlement_id) REFERENCES settlement(settlement_id),
    FOREIGN KEY (team_id) REFERENCES team(team_id)
) ENGINE=InnoDB COMMENT='팀별 분배 내역';

-- ============================================================
-- 20. dispute
-- ============================================================
CREATE TABLE dispute (
    dispute_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    settlement_id   BIGINT NOT NULL COMMENT '정산 식별자',
    team_id         BIGINT NOT NULL COMMENT '팀 식별자',
    reason          TEXT NOT NULL COMMENT '이의 사유',
    status          VARCHAR(30) NOT NULL DEFAULT 'OPEN' COMMENT '상태(OPEN/RESOLVED/REJECTED)',
    admin_comment   TEXT COMMENT '관리자 처리 의견',
    admin_id        BIGINT COMMENT '처리 관리자 식별자',
    submitted_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '제기 일시',
    resolved_at     DATETIME COMMENT '처리 일시',
    FOREIGN KEY (settlement_id) REFERENCES settlement(settlement_id),
    FOREIGN KEY (team_id) REFERENCES team(team_id),
    FOREIGN KEY (admin_id) REFERENCES member(member_id)
) ENGINE=InnoDB COMMENT='이의제기';

-- ============================================================
-- 21. audit_log (append-only)
-- ============================================================
CREATE TABLE audit_log (
    audit_log_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor_id        BIGINT COMMENT '행위자 회원 식별자',
    actor_role      VARCHAR(20) COMMENT '행위자 역할',
    request_ip      VARCHAR(45) COMMENT '요청 IP',
    action_type     VARCHAR(30) NOT NULL COMMENT '행위 유형 8종(ADMIN_ACTION/OPERATOR_SIGN/MINT/RELEASE/GRANT/RATE_CHANGE/WALLET_LINK/STATUS_CHANGE)',
    resource_type   VARCHAR(50) NOT NULL COMMENT '대상 리소스 종류',
    resource_id     BIGINT COMMENT '대상 리소스 식별자',
    request_summary TEXT COMMENT '요청 요약',
    result          VARCHAR(30) NOT NULL COMMENT '판정 결과(SUCCESS/FAILURE)',
    tx_hash         CHAR(66) COMMENT '트랜잭션 해시',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
    FOREIGN KEY (actor_id) REFERENCES member(member_id)
) ENGINE=InnoDB COMMENT='감사 로그';

-- ============================================================
-- 상호 참조 FK — chain_job 역참조 (대상 테이블 생성 이후)
-- ============================================================
ALTER TABLE chain_job ADD CONSTRAINT fk_chain_job_wallet
    FOREIGN KEY (wallet_id) REFERENCES wallet(wallet_id);
ALTER TABLE chain_job ADD CONSTRAINT fk_chain_job_performance
    FOREIGN KEY (ref_performance_id) REFERENCES performance(performance_id);
ALTER TABLE chain_job ADD CONSTRAINT fk_chain_job_ticket
    FOREIGN KEY (ref_ticket_id) REFERENCES ticket(ticket_id);
ALTER TABLE chain_job ADD CONSTRAINT fk_chain_job_team
    FOREIGN KEY (ref_team_id) REFERENCES team(team_id);
