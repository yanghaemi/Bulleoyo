-- ERD Cloud Import용 DDL v6 (논리명 COMMENT 포함) — 21 테이블
-- MySQL 8.4 · 2026-09-22(화) · 정본: ERD Cloud 다이어그램 kpxqsmzYGNrskWTMF (Cloud → SQL 방향)
-- 이전: 12_ERD_v5_import.sql (19 테이블, v5) — 원본 무수정
-- 근거: docs/superpowers/specs/2026-09-22-recommendation-design.md §4 · §12 · §13
--
-- 변경사항(v5 → v6, 추천 도메인):
--   team.genre                — VARCHAR(50) 자유 입력 → NOT NULL + 앱 enum 검증(코드 10종, D-R01).
--                               DB 컬럼 타입은 그대로 VARCHAR(Flyway ENUM validate 함정 회피). 기존 자유 입력은 ETC로 이관
--   member_preferred_genre    — 신설. member_id+genre 복합 PK, 회원당 0~3행
--   recommendation_log        — 신설. 추천 노출 로그 = CTR 랭커 학습 데이터(정답 라벨은 ticket_order 조인으로 계산)
--   (19 → 21 테이블, FK 43 → 46개)
--
-- ★ 이 파일은 ERD Cloud를 export해 만든 것이다. 반대 방향(이 SQL을 ERD Cloud에 import)은 금지한다.
--   팀이 손으로 고친 FK 물리명·ENUM·좌표가 재import로 지워지기 때문이다. Cloud 편집은 증분(update_column/delete_column)만.
--
-- 세계관: 화폐가 코인인 미래를 가정한다. 플랫폼은 시연용 코인을 지급할 뿐이며(화폐 발행 기관이 아니다),
--         모든 가치 이동은 지갑 간 온체인 전송이다. 법정화폐 입출구가 없으므로 계좌·법정화폐 거래 식별자·
--         코인 확보/반출 이력 테이블이 존재하지 않는다.
--         지갑은 사용자 소유(Web3Auth/Kaia Wallet), 서버는 사용자 키를 보관하지 않는다 — wallet에 키 컬럼 없음.
--
-- 변경사항(v4 → v5):
--   transfer 테이블 삭제       — 양도(선물) 기능을 설계에서 완전 제외(결정 v2 §14-34). FK 3개 함께 삭제
--   ticket                    — owner_member_id + buyer_member_id → member_id 단일(FK 1개), status ENUM 3값
--                               (ISSUED/USED/CANCELLED), qr_secret은 발급 시 1회 생성(양도 재생성 경로 소멸),
--                               original_price → purchase_price 개명(환불액 산정 기준 스냅샷)
--   wallet                    — cached_krws_balance·last_balance_check_at 2컬럼 삭제 → Redis 해시 wallet:balance (§B′)
--   PK 컨벤션 개명 5건        — rate_id→exchange_rate_id, participant_id→performance_participant_id,
--                               rule_id→settlement_rule_id, agreement_id→rule_agreement_id, share_id→settlement_share_id
--                               (어느 것도 FK로 참조되지 않아 연쇄 없음)
--   상태 컬럼 23개            — VARCHAR → ENUM(값 목록 포함). 앞서 검토한 VARCHAR+CHECK 안은 폐기
--   FK 물리명 규칙 통일       — 역할 없으면 {entity}_id, 역할 있으면 {role}_{entity}_id.
--                               FK 제약명 fk_{자식}_{부모}[_역할] (payment는 _approve / _purchase)
--   (20 → 19 테이블, 225 컬럼, FK 43개 — 전체본 = MVP본)
--   order_item.unit_price — v4 → v5 사이 ERD Cloud에서 유실됐다가 2026-09-03 복구. 파일 컬럼 순서는 v4 논리 순서 유지
--
-- 변경사항(2026-09-08): 코인 개명 KRWS → YoYo (name·symbol "YoYo", 환경변수·산출물 키 YOYO/YoYo, 로직 불변).
--                        삭제된 컬럼 이력 cached_krws_balance는 과거 이름 그대로 보존.
--
-- ★ ENUM 주의: 값을 늘리거나 줄이려면 ALTER TABLE <t> MODIFY <c> ENUM(...) 마이그레이션이 필요하다.
--   JPA는 @Enumerated(EnumType.STRING) + columnDefinition, 또는 Hibernate 6 @JdbcTypeCode(SqlTypes.NAMED_ENUM).
-- ★ audit_log.actor_role만 VARCHAR로 남는다 — 04 §4 actor 코드가 확정되면 ENUM으로 전환한다.
-- ★ ERD Cloud가 표현하지 못하는 3가지는 이 SQL에도 없다 — DATETIME(6) 정밀도,
--   updated_at의 ON UPDATE CURRENT_TIMESTAMP, FK의 ON DELETE/UPDATE 규칙. 구현 마이그레이션에서 부여한다.
--
-- 미생성(테이블로 만들지 않는다):
--   refresh_token    — 세션 리프레시 토큰은 Redis key auth:refresh:{jti} TTL 14일. 회전·폐기는 DEL
--   wallet:balance   — 지갑 잔액 캐시는 Redis 해시 wallet:balance (field=walletId,
--                      value="{balance}|{checkedAtEpochMs}", TTL 없음). v4의 wallet 2컬럼을 대체 (§B′)
--   wallet_challenge — 외부 지갑 등록 챌린지는 Redis key wallet:challenge:{memberId} TTL 300초.
--                      §B″로 MVP 승격됐지만 테이블은 만들지 않는다
--   coin_job         — 부활하지 않는다. 모든 온체인 작업은 chain_job이 tx_type으로 구분
--   지급 이력 전용 테이블 — chain_job WHERE tx_type='MINT' 가 곧 이력 (결정 문서 v2 §2.2)
--   wallet_tx        — 지갑 거래 이력은 chain_job(wallet_id, tx_type, amount) 조회로 생성
--
-- 생성 순서: member → exchange_rate → chain_job → wallet → team → performance → … (부모 → 자식)
--            chain_job 의 wallet/performance/ticket/team 역참조 FK 4개는 파일 말미 ALTER TABLE로 추가

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
    created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
    updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '수정 일시',
    web3auth_verifier_id  VARCHAR(255) COMMENT 'Web3Auth verifier 식별자',
    UNIQUE KEY uk_provider (auth_provider, provider_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='회원';

-- ============================================================
-- exchange_rate (표시 환율 — 화면 환산 전용, 참조 업무 컬럼 없음)
--    PK 개명: rate_id → exchange_rate_id (v5, 컨벤션 PK={테이블명}_id)
-- ============================================================
CREATE TABLE exchange_rate (
    exchange_rate_id   BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '표시 환율 식별자',
    pair               VARCHAR(10) NOT NULL COMMENT '통화쌍',
    rate               DECIMAL(18, 6) NOT NULL COMMENT '환율',
    effective_from     DATETIME NOT NULL COMMENT '적용 시작 일시',
    creator_member_id  BIGINT NOT NULL COMMENT '등록 관리자 회원 식별자',
    source             VARCHAR(100) NOT NULL DEFAULT 'MANUAL' COMMENT '출처',
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
    KEY idx_pair_eff (pair, effective_from),
    CONSTRAINT fk_exchange_rate_member FOREIGN KEY (creator_member_id) REFERENCES member(member_id)
) ENGINE=InnoDB COMMENT='표시 환율(정산·분배·컨트랙트·지급 금액 계산에는 사용 금지)';

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
    requested_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '요청 일시',
    confirmed_at           DATETIME COMMENT '확정 일시',
    CONSTRAINT fk_chain_job_member FOREIGN KEY (requester_member_id) REFERENCES member(member_id)
) ENGINE=InnoDB COMMENT='온체인 트랜잭션 작업';

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
    verified_at  DATETIME NOT NULL COMMENT '검증 일시',
    status       ENUM('LINKED','SUSPENDED') NOT NULL DEFAULT 'LINKED' COMMENT '상태',
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
    CONSTRAINT fk_wallet_member FOREIGN KEY (member_id) REFERENCES member(member_id)
) ENGINE=InnoDB COMMENT='회원 지갑(비수탁, 암호화 키 컬럼 없음)';

-- ============================================================
-- team (팀 지갑 = leader_member_id → wallet 으로 파생, 주소 컬럼 없음)
-- ============================================================
CREATE TABLE team (
    team_id           BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '공연팀 식별자',
    name              VARCHAR(100) NOT NULL UNIQUE COMMENT '이름',
    description       TEXT COMMENT '소개',
    genre             VARCHAR(50) NOT NULL COMMENT '장르 코드(ROCK·INDIE·POP·HIPHOP·RNB·JAZZ·ELECTRONIC·ACOUSTIC·CLASSICAL·ETC, 앱 enum 검증, 기존 자유 입력은 ETC로 이관)',
    leader_member_id  BIGINT NOT NULL COMMENT '팀 리더 회원 식별자',
    status            ENUM('ACTIVE','DISBANDED') NOT NULL DEFAULT 'ACTIVE' COMMENT '상태',
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
    updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '수정 일시',
    deleted_at        DATETIME COMMENT '삭제 일시',
    CONSTRAINT fk_team_member FOREIGN KEY (leader_member_id) REFERENCES member(member_id)
) ENGINE=InnoDB COMMENT='공연팀';

-- ============================================================
-- performance (보증금 = 리더 서명 YoYo 납부)
-- ============================================================
CREATE TABLE performance (
    performance_id          BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '공연 식별자',
    title                   VARCHAR(200) NOT NULL COMMENT '공연명',
    description             TEXT COMMENT '공연 소개',
    poster_image_path       VARCHAR(500) COMMENT '포스터 이미지 경로',
    performance_at          DATETIME NOT NULL COMMENT '공연 일시',
    entry_start_at          DATETIME COMMENT '입장 시작 일시',
    entry_end_at            DATETIME COMMENT '입장 종료 일시',
    venue_name              VARCHAR(200) COMMENT '공연장명',
    venue_address           VARCHAR(500) COMMENT '공연장 주소',
    creator_team_id         BIGINT NOT NULL COMMENT '생성 팀 식별자',
    is_joint                BOOLEAN NOT NULL DEFAULT FALSE COMMENT '공동 공연 여부',
    status                  ENUM('DRAFT','PENDING_AGREEMENT','ON_SALE','SALE_CLOSED','ENDED','CANCELLED') NOT NULL DEFAULT 'DRAFT' COMMENT '상태',
    cancel_deadline_at      DATETIME COMMENT '취소 마감 일시',
    sale_close_at           DATETIME COMMENT '판매 종료 일시',
    sale_start_at           DATETIME COMMENT '판매 시작 확정 일시',
    on_chain_id             BIGINT COMMENT '온체인 공연 식별자',
    contract_address        CHAR(42) COMMENT 'RevenueSplitter 주소',
    deposit_amount          BIGINT NOT NULL COMMENT '공연 등록 보증금',
    deposit_status          ENUM('UNPAID','PAID','RETURNED','FORFEITED') NOT NULL DEFAULT 'UNPAID' COMMENT '보증금 상태(FORFEITED=P1 예약)',
    deposit_chain_job_id    BIGINT COMMENT '보증금 납부 작업 식별자',
    deposit_tx_hash         CHAR(66) COMMENT '보증금 납부 트랜잭션 해시',
    deposit_return_tx_hash  CHAR(66) COMMENT '보증금 반환 트랜잭션 해시',
    deposit_returned_at     DATETIME COMMENT '보증금 반환 일시',
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
    updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '수정 일시',
    CONSTRAINT fk_performance_team FOREIGN KEY (creator_team_id) REFERENCES team(team_id),
    CONSTRAINT fk_performance_chain_job FOREIGN KEY (deposit_chain_job_id) REFERENCES chain_job(chain_job_id)
) ENGINE=InnoDB COMMENT='공연';

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
    CONSTRAINT fk_ticket_type_performance FOREIGN KEY (performance_id) REFERENCES performance(performance_id)
) ENGINE=InnoDB COMMENT='티켓 옵션';

-- ============================================================
-- performance_participant (wallet_address = 리더 지갑 스냅샷)
--    PK 개명: participant_id → performance_participant_id (v5)
-- ============================================================
CREATE TABLE performance_participant (
    performance_participant_id  BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '공연 참여팀 식별자',
    performance_id              BIGINT NOT NULL COMMENT '공연 식별자',
    team_id                     BIGINT NOT NULL COMMENT '팀 식별자',
    status                      ENUM('REGISTERED','REMOVED') NOT NULL DEFAULT 'REGISTERED' COMMENT '상태',
    registered_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록 일시',
    on_chain_index              INT COMMENT '온체인 팀 인덱스',
    team_share_bp               INT NOT NULL COMMENT '고정 풀 내 팀 비율',
    wallet_address              CHAR(42) COMMENT '리더 지갑 주소 스냅샷',
    UNIQUE KEY uk_perf_team (performance_id, team_id),
    CONSTRAINT fk_performance_participant_performance FOREIGN KEY (performance_id) REFERENCES performance(performance_id),
    CONSTRAINT fk_performance_participant_team FOREIGN KEY (team_id) REFERENCES team(team_id)
) ENGINE=InnoDB COMMENT='공연 참여팀';

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
    locked_at           DATETIME COMMENT '잠금 일시',
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '수정 일시',
    CONSTRAINT fk_settlement_rule_performance FOREIGN KEY (performance_id) REFERENCES performance(performance_id)
) ENGINE=InnoDB COMMENT='정산 규칙';

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
    agreed_at            DATETIME COMMENT '동의 확정 일시',
    requester_member_id  BIGINT NOT NULL COMMENT '동의 요청자 회원 식별자',
    UNIQUE KEY uk_perf_team_agree (performance_id, team_id),
    CONSTRAINT fk_rule_agreement_performance FOREIGN KEY (performance_id) REFERENCES performance(performance_id),
    CONSTRAINT fk_rule_agreement_team FOREIGN KEY (team_id) REFERENCES team(team_id),
    CONSTRAINT fk_rule_agreement_chain_job FOREIGN KEY (chain_job_id) REFERENCES chain_job(chain_job_id),
    CONSTRAINT fk_rule_agreement_member FOREIGN KEY (requester_member_id) REFERENCES member(member_id)
) ENGINE=InnoDB COMMENT='팀별 규칙 동의';

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
    payment_expires_at  DATETIME NOT NULL COMMENT '결제 만료 일시',
    confirmed_at        DATETIME COMMENT '결제 확정 일시',
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '수정 일시',
    UNIQUE KEY uk_order_ref (order_ref),
    CONSTRAINT fk_ticket_order_performance FOREIGN KEY (performance_id) REFERENCES performance(performance_id),
    CONSTRAINT fk_ticket_order_member FOREIGN KEY (member_id) REFERENCES member(member_id),
    CONSTRAINT fk_ticket_order_team FOREIGN KEY (selected_team_id) REFERENCES team(team_id)
) ENGINE=InnoDB COMMENT='주문';

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
    unit_price       BIGINT NOT NULL COMMENT '구매 시점 단가(YoYo) — 티켓 옵션 가격 변경과 무관하게 주문 시점 값을 보존',
    subtotal         BIGINT NOT NULL COMMENT '소계',
    CONSTRAINT fk_order_item_ticket_order FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id),
    CONSTRAINT fk_order_item_ticket_type FOREIGN KEY (ticket_type_id) REFERENCES ticket_type(ticket_type_id)
) ENGINE=InnoDB COMMENT='주문 항목';

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
    issued_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '발급 일시',
    status_changed_at   DATETIME COMMENT '상태 변경 일시',
    entry_result        VARCHAR(30) COMMENT '입장 판정 결과',
    entered_at          DATETIME COMMENT '입장 처리 일시',
    qr_secret           VARCHAR(512) NOT NULL COMMENT 'TOTP용 QR 비밀키',
    CONSTRAINT fk_ticket_ticket_order FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id),
    CONSTRAINT fk_ticket_ticket_type FOREIGN KEY (ticket_type_id) REFERENCES ticket_type(ticket_type_id),
    CONSTRAINT fk_ticket_performance FOREIGN KEY (performance_id) REFERENCES performance(performance_id),
    CONSTRAINT fk_ticket_member FOREIGN KEY (member_id) REFERENCES member(member_id)
) ENGINE=InnoDB COMMENT='티켓';

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
    requested_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '요청 일시',
    paid_at                DATETIME COMMENT '결제 확정 일시',
    CONSTRAINT fk_payment_ticket_order FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id),
    CONSTRAINT fk_payment_wallet FOREIGN KEY (payer_wallet_id) REFERENCES wallet(wallet_id),
    CONSTRAINT fk_payment_chain_job_approve FOREIGN KEY (approve_chain_job_id) REFERENCES chain_job(chain_job_id),
    CONSTRAINT fk_payment_chain_job_purchase FOREIGN KEY (purchase_chain_job_id) REFERENCES chain_job(chain_job_id)
) ENGINE=InnoDB COMMENT='코인 결제';

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
    requested_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '요청 일시',
    completed_at        DATETIME COMMENT '완료 일시',
    CONSTRAINT fk_refund_ticket FOREIGN KEY (ticket_id) REFERENCES ticket(ticket_id),
    CONSTRAINT fk_refund_ticket_order FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id),
    CONSTRAINT fk_refund_payment FOREIGN KEY (payment_id) REFERENCES payment(payment_id),
    CONSTRAINT fk_refund_wallet FOREIGN KEY (receiver_wallet_id) REFERENCES wallet(wallet_id),
    CONSTRAINT fk_refund_chain_job FOREIGN KEY (chain_job_id) REFERENCES chain_job(chain_job_id)
) ENGINE=InnoDB COMMENT='환불';

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
    aggregated_at        DATETIME COMMENT '집계 확정 일시',
    locked_at            DATETIME COMMENT '잠금 일시',
    dispute_deadline_at  DATETIME COMMENT '이의제기 마감',
    released_at          DATETIME COMMENT '분배 확정 일시',
    aggregate_tx_hash    CHAR(66) COMMENT '집계 트랜잭션 해시',
    lock_tx_hash         CHAR(66) COMMENT '잠금 트랜잭션 해시',
    release_tx_hash      CHAR(66) COMMENT '분배 트랜잭션 해시',
    share_token          VARCHAR(512) COMMENT '정산 내역 공개 링크 토큰',
    CONSTRAINT fk_settlement_performance FOREIGN KEY (performance_id) REFERENCES performance(performance_id)
) ENGINE=InnoDB COMMENT='정산';

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
    released_at          DATETIME COMMENT 'release 확정 일시',
    UNIQUE KEY uk_settlement_team (settlement_id, team_id),
    CONSTRAINT fk_settlement_share_settlement FOREIGN KEY (settlement_id) REFERENCES settlement(settlement_id),
    CONSTRAINT fk_settlement_share_team FOREIGN KEY (team_id) REFERENCES team(team_id)
) ENGINE=InnoDB COMMENT='팀별 분배 내역';

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
    submitted_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '제기 일시',
    resolved_at        DATETIME COMMENT '처리 일시',
    CONSTRAINT fk_dispute_settlement FOREIGN KEY (settlement_id) REFERENCES settlement(settlement_id),
    CONSTRAINT fk_dispute_team FOREIGN KEY (team_id) REFERENCES team(team_id),
    CONSTRAINT fk_dispute_member FOREIGN KEY (handler_member_id) REFERENCES member(member_id)
) ENGINE=InnoDB COMMENT='이의제기';

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
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 일시',
    CONSTRAINT fk_audit_log_member FOREIGN KEY (actor_member_id) REFERENCES member(member_id)
) ENGINE=InnoDB COMMENT='감사 로그';
-- ============================================================
-- member_preferred_genre (v6 신설 — 추천 도메인, 회원당 0~3행)
--    member_id -> member 는 식별 관계로 복합 PK(member_id, genre)를 구성한다
-- ============================================================
CREATE TABLE member_preferred_genre (
    member_id   BIGINT NOT NULL COMMENT '회원 식별자',
    genre       VARCHAR(20) NOT NULL COMMENT '장르 코드(team.genre 와 동일 10종, 앱 enum 검증)',
    created_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '선택 일시',
    PRIMARY KEY (member_id, genre),
    CONSTRAINT fk_member_preferred_genre_member FOREIGN KEY (member_id) REFERENCES member(member_id)
) ENGINE=InnoDB COMMENT='회원 선호 장르';

-- ============================================================
-- recommendation_log (v6 신설 — 추천 도메인)
--    서빙 로그 = CTR 랭커 학습 데이터. 정답 라벨은 ticket_order(PAID, served_at 후 24h) 조인으로 계산(저장 안 함)
--    피처 컬럼명은 ml/ctr/synth.py 의 FEATURES 와 글자 단위로 동일해야 한다(계약)
-- ============================================================
CREATE TABLE recommendation_log (
    recommendation_log_id  BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '추천 노출 로그 식별자',
    member_id               BIGINT NOT NULL COMMENT '노출 대상 회원 식별자',
    performance_id          BIGINT NOT NULL COMMENT '노출된 공연 식별자',
    session_id              CHAR(36) NOT NULL COMMENT '추천 요청 1건 = 세션 1개(UUID)',
    position                TINYINT NOT NULL COMMENT '노출 순서(1~6)',
    basis                   ENUM('GENRE','TAGGED','RANKED','FALLBACK') NOT NULL COMMENT 'GENRE=팀 장르 매칭, TAGGED=LLM 태그 장르로 매칭, RANKED=랭커, FALLBACK=곧 시작 순',
    served_at               DATETIME(6) NOT NULL COMMENT '노출 일시',
    genre_overlap           TINYINT NOT NULL COMMENT '선호 장르 겹침 수(서빙 시점 스냅샷)',
    pref_count              TINYINT NOT NULL COMMENT '회원 선호 장르 개수(서빙 시점 스냅샷)',
    min_price               BIGINT NOT NULL COMMENT '최저 티켓 가격, YoYo(서빙 시점 스냅샷)',
    days_until              SMALLINT NOT NULL COMMENT '공연일까지 남은 일수(서빙 시점 스냅샷)',
    weekday                 TINYINT NOT NULL COMMENT '공연 요일 0=월(서빙 시점 스냅샷)',
    n_teams                 TINYINT NOT NULL COMMENT '참여 팀 수(서빙 시점 스냅샷)',
    is_joint                BOOLEAN NOT NULL COMMENT '공동 공연 여부(서빙 시점 스냅샷)',
    sold_ratio              DECIMAL(4,3) NOT NULL COMMENT '판매율(서빙 시점 스냅샷)',
    past_orders             SMALLINT NOT NULL COMMENT '회원의 과거 PAID 주문 수(서빙 시점 스냅샷)',
    KEY idx_recommendation_log_member (member_id, served_at),
    KEY idx_recommendation_log_performance (performance_id, served_at),
    KEY idx_recommendation_log_session (session_id),
    CONSTRAINT fk_recommendation_log_member FOREIGN KEY (member_id) REFERENCES member(member_id),
    CONSTRAINT fk_recommendation_log_performance FOREIGN KEY (performance_id) REFERENCES performance(performance_id)
) ENGINE=InnoDB COMMENT='추천 노출 로그(서빙 로그 = CTR 랭커 학습 데이터, 정답 라벨은 ticket_order PAID 24h 조인으로 계산)';

-- ============================================================
-- 상호 참조 FK — chain_job 역참조 (대상 테이블 생성 이후)
-- ============================================================
ALTER TABLE chain_job ADD CONSTRAINT fk_chain_job_wallet
    FOREIGN KEY (wallet_id) REFERENCES wallet(wallet_id);
ALTER TABLE chain_job ADD CONSTRAINT fk_chain_job_performance
    FOREIGN KEY (target_performance_id) REFERENCES performance(performance_id);
ALTER TABLE chain_job ADD CONSTRAINT fk_chain_job_ticket
    FOREIGN KEY (target_ticket_id) REFERENCES ticket(ticket_id);
ALTER TABLE chain_job ADD CONSTRAINT fk_chain_job_team
    FOREIGN KEY (target_team_id) REFERENCES team(team_id);
