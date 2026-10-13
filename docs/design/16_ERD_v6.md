# ERD 설계 v6 (2026-09-22)

> **정본은 ERD Cloud 다이어그램 [`kpxqsmzYGNrskWTMF`](https://www.erdcloud.com/d/kpxqsmzYGNrskWTMF)다.** 이 문서와 두 SQL은 그 다이어그램을 읽어 만든 산출물(Cloud → 문서 방향)이다. 팀이 9/2 import 이후 FK 물리명을 손으로 고쳐 왔고 9/3에 상태 컬럼 23개를 ENUM으로 전환했기 때문에, **SQL을 만들어 다시 import하면 그 작업이 지워진다. 재import는 금지하고 Cloud 편집은 증분(컬럼 수정·삭제)만 한다.**

> 개정 2026-09-22(화) · 기준: [`docs/superpowers/specs/2026-09-22-recommendation-design.md`](../superpowers/specs/2026-09-22-recommendation-design.md) §4 · §12 · §13
> 이전 버전: [12_ERD_v5.md](./12_ERD_v5.md)(19 테이블, v5) — **원본 3파일(`12_ERD_v5.md`·`12_ERD_v5_import.sql`·`12_ERD_v5_import_mvp.sql`)은 수정하지 않는다.**
> 컨벤션: `02_개발_컨벤션.md` §4 — snake_case, 단수형, PK `{테이블명}_id`, 예약어 회피(performance, ticket_order), 금액 BIGINT, 체인 주소 CHAR(42), tx 해시 CHAR(66). 금액 단위는 **YoYo 정수(1 YoYo = 1원, decimals=0)**.

### 변경 이력

| 버전 | 변경 |
|---|---|
| v3.1 → v4 | 테이블 4개 삭제(리프레시 토큰·회원 계좌·코인 확보 이력·팀 코인 반출 이력), `payment`·`chain_job`·`audit_log` enum 축소 — [11_ERD_v4.md §5](./11_ERD_v4.md) |
| v4 → v5 | `transfer` 삭제, `ticket` 컬럼 통합·`purchase_price` 개명, `wallet` 잔액 캐시 2컬럼 삭제(Redis 이전), PK 5건 컨벤션 개명, 상태 컬럼 ENUM 전환, FK 물리명 규칙 통일 |
| v5 (2026-09-08) | 코인 개명 KRWS → YoYo (name·symbol "YoYo", 환경변수·산출물 키 YOYO/YoYo, 로직 불변). 삭제된 컬럼 이력 `cached_krws_balance`는 과거 이름 그대로 보존 |
| v5 (2026-09-21) | `settlement_share.approved_at` 컬럼 추가(정산 조기 동의, API-settlement-08) — 코드가 명세보다 먼저 나갔다(`V7__settlement_share_approved_at.sql`). NULL=미동의, 철회 없음(사용자 결정) |
| **v5.1 (2026-09-22)** | **표별 응원 팀 배분(주문 그룹) — 결정 v2 §14-40.** `ticket_order.order_group_id BIGINT NULL`(자기참조 FK `fk_ticket_order_group`·인덱스 `idx_ticket_order_group`는 유지) 추가. `ticket_order` 한 행이 이제 **팀 하나·`orderRef` 하나의 하위 주문**이고, `order_group_id`가 결제 한 번에 묶이는 하위 주문들의 대표(= 첫 하위 주문) `ticket_order_id`를 가리킨다. 테이블을 새로 만들지 않고(컨트랙트·다른 테이블도 무변경), FK만 **1개 늘린다** — `FlywayMigrationTest`의 `ERD_FK_COUNT`는 머지 시점의 값에 1을 더해 갱신한다(2026-09-22 develop 기준 44 → 45. `performance_media`가 먼저 1개를 더해 놓았다). 절대값을 박아 두면 다른 브랜치가 같은 수로 올렸을 때 병합이 충돌 없이 한 쪽 값만 남긴다. `V{다음 빈 번호}__ticket_order_group.sql` |
| **v5 → v6** | **추천 도메인 — `team.genre` 코드화·NOT NULL, `member_preferred_genre`·`recommendation_log` 신설(설계 v1 §4, ERD Cloud 반영 완료)** |
| **v6.1 (2026-09-24)** | **결제 전 패스키 본인 확인 — 결정 v2 §14-41.** `webauthn_credential` 신설(FK 1개 `fk_webauthn_credential_member`, 유니크 `uk_webauthn_credential_credential_id`, 인덱스 `idx_webauthn_credential_member_id`). 테이블 **21 → 22**. 적용은 증분 마이그레이션 `V14__webauthn_credential.sql`. ⚠ **ERD Cloud 반영·두 SQL 재export는 아직이다** — 정본 방향(Cloud → 문서)상 Cloud에 테이블을 더한 뒤 SQL을 다시 뽑는다. 챌린지·step-up 토큰은 Redis(API v7 §0.12)라 테이블이 없다 |
| **v6.2 (2026-09-28)** | **명세를 구현에 맞춘다.** 공연 장르의 참여 팀 범위를 "REGISTERED"에서 **"REGISTERED이면서 지갑 등록을 수락한 팀"**으로 정정(§0·§2, `RecommendationService.java:200-203`) — 초대만 받고 미수락인 팀 장르는 제외한다. §5 FK 개수 "46"을 현재 마이그레이션(`V1`~`V14`) 실측값 **50**으로 정정(`FlywayMigrationTest.ERD_FK_COUNT = 50`). 근거: 경계면 검증 2026-09-28(MR !236 · S15P21B204-180), 코드가 정본 |

**v5 상세 변경 6건**

| # | 변경 | 내용 | 근거 |
|---|------|------|------|
| 1 | `transfer` 테이블 삭제 | 양도(선물) 기능을 설계에서 완전 제외. 테이블 1개 + FK 3개 삭제 | 결정 v2 §14-34 · §B-1 |
| 2 | `ticket` 컬럼 통합·개명 | `owner_member_id` + `buyer_member_id` → `member_id` 단일(FK 2개 → 1개), `status` ENUM 3값, `qr_secret` 발급 시 1회 생성, **`original_price` → `purchase_price`** | §B-3 (b)(d) · D-B5 |
| 3 | `wallet` 컬럼 2개 삭제 | `cached_krws_balance`·`last_balance_check_at` → Redis 해시 `wallet:balance` | §B′ |
| 4 | PK 컨벤션 개명 5건 | `rate_id`→`exchange_rate_id`, `participant_id`→`performance_participant_id`, `rule_id`→`settlement_rule_id`, `agreement_id`→`rule_agreement_id`, `share_id`→`settlement_share_id`. **어느 것도 FK로 참조되지 않아 연쇄 없음** | §B-4 |
| 5 | 상태 컬럼 23개 ENUM 전환 | VARCHAR + 주석 → `ENUM('...')` (값 목록 포함). 앞서 검토한 VARCHAR+CHECK 안은 폐기 | 사용자 확정 9/3 · §B-4 |
| 6 | FK 물리명 규칙 통일 | 역할 없으면 `{entity}_id`, 역할 있으면 `{role}_{entity}_id`. FK 제약명 `fk_{자식}_{부모}[_역할]` | 사용자 확정 9/3 · §B-4 |

> **⚠ ENUM 마이그레이션** — 상태 컬럼이 ENUM이므로 **값을 추가·삭제·개명하려면 `ALTER TABLE <테이블> MODIFY <컬럼> ENUM(...)` 마이그레이션이 필요하다.** 값 집합 변경은 코드 배포와 함께 계획해야 한다. JPA는 `@Enumerated(EnumType.STRING)` + `columnDefinition`, 또는 Hibernate 6 `@JdbcTypeCode(SqlTypes.NAMED_ENUM)`.

> **테이블 수 실측(v5 시점)** — v5 확정 당시 ERD Cloud 정본은 **19 테이블 · 225 컬럼 · FK 43개**였다(2026-09-03 `list_tables` 실측, MySQL 8.4 실행으로 재확인). `11_ERD_v4.md`는 "20 테이블 / MVP 19"로 적었는데, 그 20에는 `transfer`가 포함돼 있었다. v5에서 `transfer`가 사라지면서 **전체본과 MVP본이 같은 19 테이블**이 됐다. v4 문서·SQL 헤더의 FK 수 표기(md 49/46, SQL 47/44)는 서로 어긋나 있었으므로 v5는 **MySQL에서 센 실측값 43**만 적었다. **v6은 추천 도메인 테이블 2개·FK 3개가 더해져 21 테이블 · 244 컬럼 · FK 46개다(2026-09-22 재실측, §5).** **[정정 2026-09-28]** 이후 `V8__performance_media`(FK 1)·`V10__ticket_order_group`(FK 1)·`V12__file_upload`(FK 1)·`V14__webauthn_credential`(FK 1)이 더해져(46 + 4), 현재 마이그레이션(`V1`~`V14`)을 실제로 센 FK는 **50개**다(`FlywayMigrationTest.ERD_FK_COUNT = 50`, 테이블 24 · ENUM 컬럼 26과 함께 통과). 46은 v6이 추천 도메인만 더한 시점의 스냅샷으로 보존하고, 이후 값은 이 정정을 본다.

## 0. 읽기 전 메모

- **`transfer`는 테이블이 아니다 — 존재하지 않는다.** 양도(선물)는 v6/ERD v5에서 설계째 삭제됐다(결정 v2 §14-34). ERD Cloud에도 이미 없다.
- **지갑 잔액 캐시는 테이블이 아니다.** **Redis 해시 `wallet:balance`** — field = `walletId`, value = `"{balance}|{checkedAtEpochMs}"`, **TTL 없음**(노드 장애 시 낡은 값이라도 보여야 한다, AVAIL-02). `checkedAt`이 10초보다 낡으면 노드 `balanceOf`를 읽어 갱신하고, 노드 실패 시 낡은 값 + `stale: true`를 반환한다. Redis가 비면 다음 조회에서 체인 재조회로 재구축된다(데이터 손실이 아니다). **21 테이블에 포함하지 않는다.**
- **지갑 등록 챌린지는 테이블이 아니다.** **Redis key `wallet:challenge:{memberId}` TTL 300초.** §B″로 지갑 등록이 로그인에서 분리되고 자체 챌린지 서명이 **MVP로 승격**됐지만, 1회용·5분 만료라 영속화 가치가 없어 **테이블은 만들지 않는다.**
- **리프레시 토큰은 테이블이 아니다.** **Redis key `auth:refresh:{jti}` TTL 14일**(값 = memberId·발급 시각·회전 이력 포인터). 로그아웃·회전 시 `DEL`, 회원 단위 일괄 폐기는 `auth:refresh:member:{memberId}` 집합. 만료가 곧 정리이므로 영속 테이블·`revoked` 플래그·정리 배치가 필요 없다. **21 테이블에 포함하지 않는다.**
- **`coin_job`은 부활하지 않는다.** mint·approve·purchase·refund·release·보증금 납부·보증금 반환까지 **모든 온체인 작업은 `chain_job` 한 테이블**이 `tx_type`으로 구분해 담는다.
- **시연용 지급 이력 전용 테이블을 만들지 않는다**(결정 v2 §2.2). 가입 기본 지급과 관리자 추가 지급은 `chain_job(tx_type='MINT', wallet_id=수신 지갑, amount, requester_member_id, idempotency_key=grantRef)` 한 행이 곧 이력이다. `requester_member_id`가 NULL이면 자동 지급, 값이 있으면 관리자 지급이다.
- **`wallet_tx`도 테이블이 아니다.** 지갑 거래 이력(API-wallet-02)은 `chain_job`(`wallet_id`·`tx_type`·`amount`·`status`·`tx_hash`)을 회원 지갑 기준으로 조회해 만든다. 필터 값 `GRANT/PURCHASE/REFUND/RELEASE/DEPOSIT/DEPOSIT_RETURN`은 `tx_type` 매핑이며(`GRANT` ← `MINT`) 별도 원장 테이블을 두지 않는다.
- **P1·P2 항목을 위한 컬럼은 만들지 않는다.** 예약은 ENUM 값으로만 남긴다 — `member.auth_provider`의 `LOCAL`(P1), `chain_job.issuer_type`의 `EXTERNAL`(P2), `performance.deposit_status`의 `FORFEITED`(P1). `wallet.provider`의 MetaMask는 P1이지만 값은 `EXTERNAL` 그대로다.
- **서버 보관 키는 OPERATOR·MINTER 2개**뿐이며 DB에 저장하지 않는다(내부 서브넷 주입). 사용자 키는 어떤 테이블에도 없다.
- **ENUM으로 바꾸지 않은 상태성 컬럼 5개** — `member.locale`·`member.display_currency`·`exchange_rate.source`·`ticket.entry_result`·`audit_log.actor_role`·`audit_log.resource_type`. 값 집합이 열려 있거나(로케일·통화·출처·입장 실패 코드·테이블명) 아직 정의되지 않았다. 특히 **`audit_log.actor_role`은 `04 §4`의 actor 코드가 확정되면 ENUM으로 전환한다.**
- **ERD Cloud가 표현하지 못하는 3가지는 이 문서와 SQL에도 없다** — `DATETIME(6)` 정밀도, `updated_at`의 `ON UPDATE CURRENT_TIMESTAMP`, FK의 `ON DELETE`/`ON UPDATE` 규칙. (v4 md는 `DATETIME(6)`·`ON UPDATE`를 적었으나 v4 import SQL과 Cloud는 `DATETIME`이었다 — v5는 정본 하나에 맞춰 `DATETIME`으로 통일하고, 실제 정밀도·갱신 트리거·삭제 규칙은 구현 마이그레이션에서 부여한다.)
- **`order_item.unit_price`는 v4 → v5 사이 ERD Cloud에서 유실됐다가 2026-09-03 복구됐다.** 파일에서의 컬럼 순서는 v4의 논리 순서(`quantity` → `unit_price` → `subtotal`)를 따르며 Cloud 표시 순서(`subtotal` 뒤)와 다르다 — DDL 컬럼 순서는 업무 의미에 영향이 없다.

## 1. 엔티티 목록 (22개 — v6 21 + v6.1 1)

| # | 테이블 | 도메인 | v4 대비 | 설명 |
|---|--------|--------|---------|------|
| 1 | member | 회원 | 유지 | 회원 (관객+공연자+관리자). 국가·로케일·표시통화·시간대 보유 |
| 2 | team | 팀 | **FK 개명, `genre` 코드화·NOT NULL(v6)** | 공연팀 (리더 1인 관리). 팀 지갑 = `leader_member_id → wallet`으로 파생 |
| 3 | wallet | 지갑 | **컬럼 2개 삭제** | 회원 지갑 1:1. 잔액 캐시 2컬럼을 Redis `wallet:balance`로 이전. **암호화 키 컬럼 없음** |
| 4 | performance | 공연 | **FK 개명** | 공연 (보증금 온체인 컬럼) |
| 5 | ticket_type | 공연 | 유지 | 티켓 옵션 (가격 단위 YoYo) |
| 6 | performance_participant | 공연 | **PK 개명** | 참여팀 (`wallet_address` = createShow 시점 리더 지갑 스냅샷) |
| 7 | settlement_rule | 규칙 | **PK 개명** | 정산 규칙 (공연당 1개) |
| 8 | rule_agreement | 규칙 | **PK·FK 개명** | 팀별 규칙 동의 (리더 서명 tx) |
| 9 | ticket_order | 티켓 | **FK 개명, 컬럼 추가(v5.1)** | 주문 (`order_ref` = 온체인 orderRef). **v5.1** — 한 행 = 팀 하나의 하위 주문, `order_group_id`(자기참조)로 표별 배분 그룹을 묶는다 |
| 10 | order_item | 티켓 | 유지 | 주문 항목. `unit_price`는 9/3 ERD Cloud 복구분(§0) |
| 11 | ticket | 티켓 | **컬럼 통합·개명·enum 축소** | 티켓. `member_id` 단일 소유, `status` 3값, `purchase_price` 개명 |
| 12 | payment | 결제 | **FK 개명** | 코인 결제 (잔액 결제만 — approve/purchase 서명 job) |
| 13 | chain_job | 체인 | **FK 개명** | 온체인 트랜잭션 작업 (운영자 tx + 사용자 서명 tx 보고 + 시연용 지급 이력) |
| 14 | refund | 환불 | **FK 개명** | 환불 (에스크로 → 관객 지갑) |
| 15 | settlement | 정산 | 유지 | 정산 (`RELEASED`가 종단 = 팀 수령 완료) |
| 16 | settlement_share | 정산 | **PK 개명** | 팀별 분배 내역 (수령 주소·release 확정·**[2026-09-21] 조기 동의**) |
| 17 | dispute | 정산 | **FK 개명** | 이의제기 |
| 18 | exchange_rate | 코인 | **PK·FK 개명** | 표시 환율 (화면 환산 전용, 정산 계산에 사용 금지) |
| 19 | audit_log | 관리 | **FK 개명** | 감사 로그 (append-only) |
| 20 | member_preferred_genre | 추천 | **신설(v6)** | 회원 선호 장르 (0~3행, PK = member_id + genre) |
| 21 | recommendation_log | 추천 | **신설(v6)** | 추천 노출 로그 (서빙 로그 = CTR 랭커 학습 데이터) |
| 22 | webauthn_credential | 결제(본인 확인) | **신설(v6.1)** | 회원 기기 패스키 공개키 (결제 전 step-up 검증용. 생체 정보 없음) |

삭제된 v4 테이블 1개: **`transfer`**(양도 — 결정 v2 §14-34로 설계째 제외). 미생성: `wallet:balance`·`wallet:challenge`·`auth:refresh`(모두 Redis) · `coin_job`(부활 없음) · 지급 이력 전용 테이블 · `wallet_tx`(§0).

**v6에서 추가된 2개(추천 도메인)** — `member_preferred_genre`·`recommendation_log`. 공연 자체에는 장르 컬럼이 없다 — 공연 장르는 **생성 팀 + `performance_participant`(status=REGISTERED이면서 지갑 등록을 수락한) 참여 팀의 `genre` 합집합**으로 매 조회 시 조인 파생한다 — 초대만 받고 미수락인 팀은 제외한다(설계 v1 §4.1).

## 2. 테이블 상세

### member
```sql
CREATE TABLE member (
    member_id             BIGINT AUTO_INCREMENT PRIMARY KEY,
    email                 VARCHAR(255) NOT NULL UNIQUE,
    password_hash         VARCHAR(255),
    name                  VARCHAR(100) NOT NULL,
    phone                 VARCHAR(20),
    auth_provider         ENUM('GOOGLE','FACEBOOK','KAKAO','LOCAL') NOT NULL, -- 인증 방식(LOCAL=이메일 가입 P1 예약, 기본값 없음)
    provider_user_id      VARCHAR(255),
    country_code          CHAR(2) NOT NULL,
    locale                VARCHAR(10) NOT NULL DEFAULT 'en',
    display_currency      CHAR(3) NOT NULL DEFAULT 'USD',
    timezone              VARCHAR(50) NOT NULL DEFAULT 'UTC',
    is_admin              BOOLEAN NOT NULL DEFAULT FALSE,
    status                ENUM('ACTIVE','SUSPENDED','WITHDRAWN') NOT NULL DEFAULT 'ACTIVE', -- 회원 상태(WITHDRAWN=탈퇴)
    created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    web3auth_verifier_id  VARCHAR(255),
    UNIQUE KEY uk_provider (auth_provider, provider_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
v4 그대로다(`status`·`auth_provider`가 ENUM으로 바뀐 것만 다르다). 신규 회원 생성(API-member-01) 성공이 곧 기본 지급 100,000 YoYo의 `MINT` job 생성 근거이며(멱등키 `grant:signup:{memberId}`), 그 이력은 `chain_job`에만 남는다(§0). **v6부터 지갑 등록은 로그인과 분리되므로**(§B″) 회원 생성 시점에 `wallet` 행이 없을 수 있고, 기본 지급은 지갑 등록 완료 시점에 트리거된다 — `member` 컬럼에는 영향이 없다.

### exchange_rate
```sql
CREATE TABLE exchange_rate (
    exchange_rate_id   BIGINT AUTO_INCREMENT PRIMARY KEY,
    pair               VARCHAR(10) NOT NULL,
    rate               DECIMAL(18, 6) NOT NULL,
    effective_from     DATETIME NOT NULL,
    creator_member_id  BIGINT NOT NULL,
    source             VARCHAR(100) NOT NULL DEFAULT 'MANUAL',
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_pair_eff (pair, effective_from),
    CONSTRAINT fk_exchange_rate_member FOREIGN KEY (creator_member_id) REFERENCES member(member_id)
) ENGINE=InnoDB;
```
**PK를 `rate_id` → `exchange_rate_id`로 개명했다**(컨벤션 PK = `{테이블명}_id`). FK로 참조되는 곳이 없어 연쇄가 없다. `published_by` → `creator_member_id`는 9/3 FK 물리명 규칙 적용분이다(참조 엔티티가 이름에 드러나야 한다). 이 테이블을 참조하는 업무 컬럼은 v5에도 없다 — 화면·API가 `pair`·`effective_from`으로 조회만 한다(표시 전용, P-17).

### chain_job
```sql
CREATE TABLE chain_job (
    chain_job_id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    tx_type                ENUM('MINT','APPROVE','PURCHASE','REFUND','DEPOSIT','DEPOSIT_RETURN','DEPOSIT_FORFEIT','AGREE','LOCK','AGGREGATE','RELEASE','HALT','CREATE_SHOW','START_SALE','UPDATE_RULES') NOT NULL, -- 작업 유형 15종(MINT=시연용 지급, DEPOSIT_FORFEIT=P1) [2026-09-10 — S15P21B204-70]
    signer_type            ENUM('OPERATOR','USER') NOT NULL DEFAULT 'OPERATOR', -- 서명 주체(USER=발신자 서명 대납 tx)
    fee_delegated          BOOLEAN NOT NULL DEFAULT FALSE,
    fee_payer_address      CHAR(42),
    sender_signed_rlp      MEDIUMTEXT,
    issuer_type            ENUM('MOCK','EXTERNAL') NOT NULL DEFAULT 'MOCK', -- 발행 어댑터(EXTERNAL=P2 예약)
    requester_member_id    BIGINT,
    wallet_id              BIGINT,
    target_performance_id  BIGINT,
    target_ticket_id       BIGINT,
    target_team_id         BIGINT,
    amount                 BIGINT,
    status                 ENUM('PENDING','SUBMITTED','CONFIRMED','FAILED') NOT NULL DEFAULT 'PENDING',
    claimed_by             VARCHAR(64),                          -- 이 job 을 집은 인스턴스(b204.chain.instance-id). NULL=아무도 안 집음 [2026-09-14 — S15P21B204-96]
    claimed_at             DATETIME(6),                          -- claim 시각. 5분 넘게 낡으면 다른 인스턴스가 다시 집는다 [2026-09-14 — S15P21B204-96]
    tx_hash                CHAR(66),
    confirmations          INT NOT NULL DEFAULT 0,
    retry_count            INT NOT NULL DEFAULT 0,
    failure_reason         VARCHAR(500),
    idempotency_key        VARCHAR(255) UNIQUE,
    requested_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confirmed_at           DATETIME,
    CONSTRAINT fk_chain_job_member FOREIGN KEY (requester_member_id) REFERENCES member(member_id),
    CONSTRAINT fk_chain_job_wallet FOREIGN KEY (wallet_id) REFERENCES wallet(wallet_id),
    CONSTRAINT fk_chain_job_performance FOREIGN KEY (target_performance_id) REFERENCES performance(performance_id),
    CONSTRAINT fk_chain_job_ticket FOREIGN KEY (target_ticket_id) REFERENCES ticket(ticket_id),
    CONSTRAINT fk_chain_job_team FOREIGN KEY (target_team_id) REFERENCES team(team_id)
) ENGINE=InnoDB;
```
> **[2026-09-09 — S15P21B204-67]** 새 값 두 개는 **뒤에 붙인다**. MySQL 은 ENUM 을 내부 정수로 저장하므로 중간에 끼우면 기존 행의 뜻이 통째로 바뀐다. `V2__chain_job_tx_type_create_show.sql` 과 순서가 같아야 한다.

`tx_type` 15종이 ENUM으로 확정됐다(**[2026-09-10 — S15P21B204-70]** `UPDATE_RULES` 신설 · 119줄 DDL 이 정본). **`MINT` job 한 행이 시연용 지급의 유일한 이력**이며(지급 이력 전용 테이블을 만들지 않는다 — §0), `requester_member_id`가 NULL이면 자동 지급, 값이 있으면 관리자 지급이다.
- **[2026-09-10 — S15P21B204-70]** `UPDATE_RULES`(온체인 규칙 교체)를 **맨 뒤에** 신설했다(14종 → 15종). `createShow` 확정 뒤 규칙을 다시 저장하면 DB 해시만 바뀌어 온체인과 갈리고, 그러면 `agreeToRules`가 `RulesHashMismatch`로 revert 한다 — `RevenueSplitter.updateRules`를 보내는 것이 유일한 복구 수단이다. **ENUM 값은 반드시 뒤에 붙인다**(MySQL은 ENUM을 내부 정수로 저장한다 · 마이그레이션 `V3`).
- **[2026-09-09 — S15P21B204-67]** `CREATE_SHOW`(온체인 공연 등록)·`START_SALE`(판매 개시)를 신설했다. 종전엔 `LOCK` 하나가 판매 시작(API-rule-04)과 정산 잠금(API-settlement-03) 두 뜻을 겸해, 확정 분기가 항상 판매 시작으로 해석돼 정산 잠금 job이 진행되지 않는 버그가 있었다. `LOCK`은 이제 정산 잠금 전용이다.
- **[2026-09-14 — S15P21B204-96]** `claimed_by`·`claimed_at`을 신설했다(마이그레이션 `V5`). 인스턴스가 둘 이상일 때(블루/그린) 워커가 같은 job 을 두 번 집어 **같은 tx 를 두 번 보내지 않게** 하는 DB 펜싱이다 — Redis 소유권 임대만으로는 멈췄다 깨어난 옛 소유자를 막지 못한다. 워커는 전송 전에 `claimed_at IS NULL OR claimed_at < 5분 전 OR claimed_by = 자기` 조건의 UPDATE 한 번으로 집는다. **`status`에 `PROCESSING`을 더하지 않았다** — `status`는 API-chain-01 폴링이 그대로 보는 값이라 API 응답이 바뀐다. 단일 인스턴스(`instance-id` 미설정)면 이 컬럼은 계속 NULL 이다. 워커 스캔용 인덱스 `idx_chain_job_status_signer (status, signer_type, chain_job_id)`를 함께 만들었다(§4).
- FK 물리명: `requester_id` → `requester_member_id`, `ref_*` → `target_*`(대상 역할이 분명하므로 `{role}_{entity}_id`).
- **`wallet_id`는 아직 역할 접두가 없다** — `USER` tx에서는 서명자, `MINT`·`REFUND`에서는 수신자로 `tx_type`에 따라 역할이 갈려 하나의 role로 못 정한다. 후보는 `subject_wallet_id`(대상 지갑) 또는 컬럼 분리(`signer_wallet_id`/`receiver_wallet_id`)이며 **팀 결정 대기 중**이다. 그때까지 `wallet_id`를 유지한다(§B-4).
- 역참조 FK 4개(`wallet`·`performance`·`ticket`·`team`)는 순환 참조라 import SQL 말미의 `ALTER TABLE`로 붙인다.

### wallet
```sql
CREATE TABLE wallet (
    wallet_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    member_id    BIGINT NOT NULL UNIQUE,
    provider     ENUM('WEB3AUTH','EXTERNAL') NOT NULL,           -- 지갑 종류(EXTERNAL=Kaia Wallet MVP, MetaMask P1)
    address      CHAR(42) NOT NULL UNIQUE,
    verified_at  DATETIME NOT NULL,
    status       ENUM('LINKED','SUSPENDED') NOT NULL DEFAULT 'LINKED',
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_wallet_member FOREIGN KEY (member_id) REFERENCES member(member_id)
) ENGINE=InnoDB;
```
- **v5에서 컬럼 2개가 사라졌다** — `cached_krws_balance`·`last_balance_check_at`. 잔액 캐시는 **Redis 해시 `wallet:balance`**(field = `walletId`, value = `"{balance}|{checkedAtEpochMs}"`, TTL 없음)로 이전했다(§B′). 잔액 조회 API가 불릴 때마다 `wallet` 행에 UPDATE가 발생하던 문제(읽기가 쓰기를 만든다)가 없어지고, 표시용 사본이 ERD에서 빠져 결합도도 내려간다.
- 갱신 시점은 ① 잔액 조회 API가 노드를 읽었을 때 ② **지갑이 관여하는 `chain_job`이 `CONFIRMED`될 때**(결제·보증금 = 발신 지갑, 환불·release·보증금 반환·`MINT` = 수신 지갑) 두 가지다. ~~V-02 발행량 대사의 지갑 보유 합계는 `HVALS wallet:balance` 합산(1분 캐시)으로 구한다.~~ **[2026-09-15 — S15P21B204-88·-90]** 대사는 이 캐시를 읽지 않고 `wallet`(LINKED) 을 순회해 노드 `balanceOf` 를 직접 합산한다 — 캐시는 화면 표시 전용.
- **암호화 키 컬럼이 없다.** 서버는 사용자 개인키·니모닉·MPC 샤드를 어떤 형태로도 저장하지 않는다. `gas_funded_at`도 없다(수수료 대납).
- 잔액의 진실은 온체인 `YoYo.balanceOf(address)`이며 검증 페이지도 체인을 읽는다.
- 지갑 등록 챌린지는 **Redis `wallet:challenge:{memberId}` TTL 300초**다 — §B″로 MVP 경로에 올라왔지만 **테이블은 만들지 않는다**.

### team
```sql
CREATE TABLE team (
    team_id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    name              VARCHAR(100) NOT NULL UNIQUE,
    description       TEXT,
    genre             VARCHAR(50) NOT NULL, -- 장르 코드(ROCK·INDIE·POP·HIPHOP·RNB·JAZZ·ELECTRONIC·ACOUSTIC·CLASSICAL·ETC, 앱 enum 검증, 기존 자유 입력은 ETC로 이관)
    leader_member_id  BIGINT NOT NULL,
    status            ENUM('ACTIVE','DISBANDED') NOT NULL DEFAULT 'ACTIVE',
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at        DATETIME,
    CONSTRAINT fk_team_member FOREIGN KEY (leader_member_id) REFERENCES member(member_id)
) ENGINE=InnoDB;
```
`leader_id` → `leader_member_id`로 개명했다(참조 엔티티가 이름에 드러나야 한다는 9/3 규칙). 팀이 정산금을 받는 곳은 오직 리더 지갑이며(`leader_member_id → wallet.address`) `release` 한 번으로 수령이 끝난다(P-10). 팀에는 지갑 주소 컬럼도, 계좌 참조도 없다. MVP는 리더 교체 불가(§14-20).

**[2026-09-22] `genre` 코드화·NOT NULL(v6, 추천 도메인)** — v5까지 `VARCHAR(50)` 자유 입력이라 사실상 값이 없었다. v6은 컬럼 타입을 바꾸지 않고(Flyway ENUM validate 함정 회피, D-R01) **앱 레벨 enum 검증**만 추가한다. 코드 10종은 `ROCK, INDIE, POP, HIPHOP, RNB, JAZZ, ELECTRONIC, ACOUSTIC, CLASSICAL, ETC`(설계 v1 §4.1). 마이그레이션은 **NULL을 포함한 전 행**을 `ETC`로 이관한 뒤 `NOT NULL`을 건다(`UPDATE team SET genre='ETC'` — 현재 팀 대부분이 NULL이라 자유 입력 행만 바꾸면 `NOT NULL` ALTER가 실패한다, MR !186 리뷰). 팀 장르는 단일·필수(D-R02, 다중 선택 폐기). 공연 장르는 별도 컬럼 없이 **생성 팀 + `performance_participant`(status=REGISTERED이면서 지갑 등록을 수락한) 참여 팀의 `genre` 합집합**으로 조인 파생한다 — 초대만 받고 미수락인 팀은 제외하며, `performance`에는 이번 버전에도 장르 컬럼을 두지 않는다.

### performance
```sql
CREATE TABLE performance (
    performance_id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    title                   VARCHAR(200) NOT NULL,
    description             TEXT,
    poster_image_path       VARCHAR(500),
    performance_at          DATETIME NOT NULL,
    entry_start_at          DATETIME,
    entry_end_at            DATETIME,
    venue_name              VARCHAR(200),
    venue_address           VARCHAR(500),
    creator_team_id         BIGINT NOT NULL,
    is_joint                BOOLEAN NOT NULL DEFAULT FALSE,
    status                  ENUM('DRAFT','PENDING_AGREEMENT','ON_SALE','SALE_CLOSED','ENDED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
    cancel_deadline_at      DATETIME,
    sale_close_at           DATETIME,
    sale_start_at           DATETIME,
    on_chain_id             BIGINT,
    contract_address        CHAR(42),
    deposit_amount          BIGINT NOT NULL,
    deposit_status          ENUM('UNPAID','PAID','RETURNED','FORFEITED') NOT NULL DEFAULT 'UNPAID', -- 보증금 상태(FORFEITED=P1 예약)
    deposit_chain_job_id    BIGINT,
    deposit_tx_hash         CHAR(66),
    deposit_return_tx_hash  CHAR(66),
    deposit_returned_at     DATETIME,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_performance_team FOREIGN KEY (creator_team_id) REFERENCES team(team_id),
    CONSTRAINT fk_performance_chain_job FOREIGN KEY (deposit_chain_job_id) REFERENCES chain_job(chain_job_id)
) ENGINE=InnoDB;
```
`team_id` → `creator_team_id`, `deposit_job_id` → `deposit_chain_job_id`로 개명했다. `status` 6값·`deposit_status` 4값이 ENUM으로 확정됐다(`FORFEITED`는 P1 예약값). 보증금은 리더가 서명한 YoYo 납부이며 그 job이 `deposit_chain_job_id`다.

### ticket_type
```sql
CREATE TABLE ticket_type (
    ticket_type_id  BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id  BIGINT NOT NULL,
    name            VARCHAR(100) NOT NULL,
    price           BIGINT NOT NULL,
    total_quantity  INT NOT NULL,
    sold_quantity   INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_ticket_type_performance FOREIGN KEY (performance_id) REFERENCES performance(performance_id)
) ENGINE=InnoDB;
```
v4 그대로다. `price`는 YoYo 정수(1 YoYo = 1원, decimals = 0).

### performance_participant
```sql
CREATE TABLE performance_participant (
    performance_participant_id  BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id              BIGINT NOT NULL,
    team_id                     BIGINT NOT NULL,
    status                      ENUM('REGISTERED','REMOVED') NOT NULL DEFAULT 'REGISTERED',
    registered_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    on_chain_index              INT,
    team_share_bp               INT NOT NULL,
    wallet_address              CHAR(42),
    UNIQUE KEY uk_perf_team (performance_id, team_id),
    CONSTRAINT fk_performance_participant_performance FOREIGN KEY (performance_id) REFERENCES performance(performance_id),
    CONSTRAINT fk_performance_participant_team FOREIGN KEY (team_id) REFERENCES team(team_id)
) ENGINE=InnoDB;
```
**PK를 `participant_id` → `performance_participant_id`로 개명했다.** `wallet_address`는 `createShow` 시점 리더 지갑 주소 스냅샷이며, 이후 리더 지갑이 바뀌어도 온체인 분배 대상은 이 스냅샷이다. `(performance_id, team_id)` 유니크로 같은 팀의 중복 참여를 막는다.

### settlement_rule
```sql
CREATE TABLE settlement_rule (
    settlement_rule_id  BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id      BIGINT NOT NULL UNIQUE,
    fixed_ratio_bp      INT NOT NULL,
    selection_ratio_bp  INT NOT NULL,
    rules_hash          VARCHAR(66),
    is_locked           BOOLEAN NOT NULL DEFAULT FALSE,
    lock_tx_hash        CHAR(66),
    locked_at           DATETIME,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_settlement_rule_performance FOREIGN KEY (performance_id) REFERENCES performance(performance_id)
) ENGINE=InnoDB;
```
**PK를 `rule_id` → `settlement_rule_id`로 개명했다.** 공연당 1개(`performance_id` UNIQUE)이며, `is_locked`·`lock_tx_hash`·`locked_at`이 온체인 `lock(showId)` 확정을 기록한다. 잠금 이후 규칙 변경 경로는 없다.

### rule_agreement
```sql
CREATE TABLE rule_agreement (
    rule_agreement_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id       BIGINT NOT NULL,
    team_id              BIGINT NOT NULL,
    status               ENUM('PENDING','SIGNING','AGREED') NOT NULL DEFAULT 'PENDING',
    agreed_rules_hash    VARCHAR(66),
    chain_job_id         BIGINT,
    agree_tx_hash        CHAR(66),
    agreed_at            DATETIME,
    requester_member_id  BIGINT NOT NULL,
    UNIQUE KEY uk_perf_team_agree (performance_id, team_id),
    CONSTRAINT fk_rule_agreement_performance FOREIGN KEY (performance_id) REFERENCES performance(performance_id),
    CONSTRAINT fk_rule_agreement_team FOREIGN KEY (team_id) REFERENCES team(team_id),
    CONSTRAINT fk_rule_agreement_chain_job FOREIGN KEY (chain_job_id) REFERENCES chain_job(chain_job_id),
    CONSTRAINT fk_rule_agreement_member FOREIGN KEY (requester_member_id) REFERENCES member(member_id)
) ENGINE=InnoDB;
```
**PK를 `agreement_id` → `rule_agreement_id`로 개명했다.** `requested_by` → `requester_member_id`(동의 요청자), `agree_job_id` → `chain_job_id`(동의라는 역할이 이미 테이블 이름에 있으므로 일반 관계로 본다). 동의는 리더가 서명한 `AGREE` tx다.

### ticket_order
```sql
CREATE TABLE ticket_order (
    ticket_order_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id      BIGINT NOT NULL,
    member_id           BIGINT NOT NULL,
    order_group_id      BIGINT NULL,
    order_ref           CHAR(66) NOT NULL,
    total_amount        BIGINT NOT NULL,
    total_quantity      INT NOT NULL,
    selected_team_id    BIGINT,
    status              ENUM('PENDING_PAYMENT','PAID','CANCELLED','REFUNDED') NOT NULL DEFAULT 'PENDING_PAYMENT',
    payment_expires_at  DATETIME NOT NULL,
    confirmed_at        DATETIME,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_order_ref (order_ref),
    CONSTRAINT fk_ticket_order_performance FOREIGN KEY (performance_id) REFERENCES performance(performance_id),
    CONSTRAINT fk_ticket_order_member FOREIGN KEY (member_id) REFERENCES member(member_id),
    CONSTRAINT fk_ticket_order_team FOREIGN KEY (selected_team_id) REFERENCES team(team_id),
    CONSTRAINT fk_ticket_order_group FOREIGN KEY (order_group_id) REFERENCES ticket_order(ticket_order_id),
    INDEX idx_ticket_order_group (order_group_id)
) ENGINE=InnoDB;
```
`choice_team_id` → `selected_team_id`(관객이 선택한 팀). `order_ref`는 온체인 `orderRef`(= `keccak256(orderId)`)이며 유니크다. 공동 공연에서는 `selected_team_id`가 필수이고 그 값이 `purchase` tx에 함께 기록된다.

**`order_group_id`(v5.1, 2026-09-22) — 표별 응원 팀 배분(주문 그룹).** 관객이 한 번의 예매에서 표마다 다른 팀을 응원 대상으로 배분할 수 있게 되면서(결정 v2 §14-40), `ticket_order` 한 행은 **팀 하나·`orderRef` 하나·`purchase` tx 하나**를 뜻하는 **하위 주문**이 됐다. `order_group_id`는 **결제 한 번에 묶이는 하위 주문들의 대표 주문(= 첫 하위 주문)의 `ticket_order_id`**를 가리키는 자기참조 컬럼이다. 대표 주문은 **INSERT 후 같은 트랜잭션에서 자기 `ticket_order_id`로 UPDATE**하고, 하위 주문은 처음부터 대표 id로 INSERT한다. **"커밋된 행에 NULL이 없다"는 DB 제약이 아니라 앱 불변식이다.** 단독 공연·팀 하나 주문도 그룹 크기 1이라 언제나 자기 자신을 가리킨다. 그룹 조회는 `WHERE order_group_id = :groupId` 한 줄 그대로다. 컨트랙트는 바뀌지 않는다(`purchase`는 여전히 `orderRef` 1개 = 팀 1개).

`12_ERD_v5_import.sql`은 재import 금지 파일이라 본문 DDL은 그대로 두고, 실제 적용은 증분 마이그레이션 `V{다음 빈 번호}__ticket_order_group.sql`로 한다. 번호는 **머지 시점에 비어 있는 다음 번호로 확정한다**(2026-09-22 기준 V8·V9·V10이 다른 브랜치에서 선점됨). `order_group_id`를 **NOT NULL로 걸지 않는 이유** — PK가 `AUTO_INCREMENT`(IDENTITY)라 대표 주문은 자기 id를 INSERT 시점에 모르고, InnoDB에는 지연 FK가 없어 NOT NULL을 걸면 그룹의 첫 행을 넣을 수 없다:
```sql
ALTER TABLE ticket_order ADD COLUMN order_group_id BIGINT NULL AFTER member_id;
UPDATE ticket_order SET order_group_id = ticket_order_id WHERE order_group_id IS NULL;  -- 기존 행은 전부 그룹 크기 1
ALTER TABLE ticket_order ADD CONSTRAINT fk_ticket_order_group FOREIGN KEY (order_group_id) REFERENCES ticket_order(ticket_order_id);
ALTER TABLE ticket_order ADD INDEX idx_ticket_order_group (order_group_id);
```

### order_item
```sql
CREATE TABLE order_item (
    order_item_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_order_id  BIGINT NOT NULL,
    ticket_type_id   BIGINT NOT NULL,
    quantity         INT NOT NULL,
    unit_price       BIGINT NOT NULL,                            -- 구매 시점 단가(YoYo) — 티켓 옵션 가격 변경과 무관하게 주문 시점 값을 보존
    subtotal         BIGINT NOT NULL,
    CONSTRAINT fk_order_item_ticket_order FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id),
    CONSTRAINT fk_order_item_ticket_type FOREIGN KEY (ticket_type_id) REFERENCES ticket_type(ticket_type_id)
) ENGINE=InnoDB;
```
`unit_price`(구매 시점 단가)는 **v4 → v5 사이 ERD Cloud에서 유실됐다가 2026-09-03 복구됐다.** 티켓 옵션 가격이 나중에 바뀌어도 주문 시점 단가를 보존하는 컬럼이므로 `subtotal / quantity` 환산으로 대체할 수 없다.
- **컬럼 순서 주의** — ERD Cloud에서는 복구된 `unit_price`가 `subtotal` 뒤에 붙었지만, 이 문서와 두 SQL은 v4의 논리 순서(`quantity` → `unit_price` → `subtotal`)를 따른다. DDL 컬럼 순서는 업무 의미에 영향이 없으므로 Cloud 표시 순서와 달라도 무방하다.

### ticket
```sql
CREATE TABLE ticket (
    ticket_id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_order_id     BIGINT NOT NULL,
    ticket_type_id      BIGINT NOT NULL,
    performance_id      BIGINT NOT NULL,
    member_id           BIGINT NOT NULL,
    status              ENUM('ISSUED','USED','CANCELLED') NOT NULL DEFAULT 'ISSUED', -- 상태(발급/사용/취소)
    purchase_price      BIGINT NOT NULL,                         -- 환불액 산정 기준(발급 시점 가격 스냅샷)
    on_chain_ticket_id  BIGINT,
    choice_tx_hash      CHAR(66),
    issued_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status_changed_at   DATETIME,
    entry_result        VARCHAR(30),
    entered_at          DATETIME,
    qr_secret           VARCHAR(512) NOT NULL,
    CONSTRAINT fk_ticket_ticket_order FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id),
    CONSTRAINT fk_ticket_ticket_type FOREIGN KEY (ticket_type_id) REFERENCES ticket_type(ticket_type_id),
    CONSTRAINT fk_ticket_performance FOREIGN KEY (performance_id) REFERENCES performance(performance_id),
    CONSTRAINT fk_ticket_member FOREIGN KEY (member_id) REFERENCES member(member_id)
) ENGINE=InnoDB;
```
**v5에서 가장 많이 바뀐 테이블이다.**
- `owner_member_id` + `buyer_member_id` → **`member_id` 단일 컬럼 + FK 1개**(D-B5). 두 컬럼을 나눈 유일한 이유가 양도(소유자 이전)였고, 양도가 없으면 두 값이 달라질 경로가 설계에 없다. 환불 수령 지갑 판정도 분기 없이 한 줄로 끝난다.
- `status`가 **ENUM 3값**(`ISSUED`/`USED`/`CANCELLED`)이다. `TRANSFER_PENDING`이 사라졌다.
- `original_price` → **`purchase_price`**(논리명 "구매 금액"). "최초"라는 수식이 양도로 소유자가 바뀌는 세계를 전제했기 때문이다. 용도는 그대로 **환불액 산정 기준(발급 시점 가격 스냅샷)** 이다.
- `qr_secret`은 **티켓 발급 시 1회 생성**한다. v4 주석의 "양도 시 재생성"은 재생성 경로가 소멸해 삭제했다. QR 자체는 TOTP로 30초 회전한다.
- `entry_result`는 VARCHAR로 남는다 — `ADMITTED` 외에 실패 코드 문자열이 들어와 값 집합이 열려 있다.

### payment
```sql
CREATE TABLE payment (
    payment_id             BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_order_id        BIGINT NOT NULL UNIQUE,
    payer_wallet_id        BIGINT NOT NULL,
    amount                 BIGINT NOT NULL,
    approve_chain_job_id   BIGINT,                               -- approve 작업 식별자(APPROVE, USER, 생략 가능) — chain_job 2회 참조라 역할 접두
    purchase_chain_job_id  BIGINT,                               -- purchase 작업 식별자(PURCHASE, USER) — chain_job 2회 참조라 역할 접두
    purchase_tx_hash       CHAR(66),
    status                 ENUM('REQUESTED','AWAITING_SIGNATURE','PAYING','PAID','FAILED','REFUNDED') NOT NULL DEFAULT 'REQUESTED', -- 상태 6값
    failure_code           VARCHAR(100),
    idempotency_key        VARCHAR(255) NOT NULL UNIQUE,
    requested_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    paid_at                DATETIME,
    CONSTRAINT fk_payment_ticket_order FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id),
    CONSTRAINT fk_payment_wallet FOREIGN KEY (payer_wallet_id) REFERENCES wallet(wallet_id),
    CONSTRAINT fk_payment_chain_job_approve FOREIGN KEY (approve_chain_job_id) REFERENCES chain_job(chain_job_id),
    CONSTRAINT fk_payment_chain_job_purchase FOREIGN KEY (purchase_chain_job_id) REFERENCES chain_job(chain_job_id)
) ENGINE=InnoDB;
```
`wallet_id` → `payer_wallet_id`, `approve_job_id`/`purchase_job_id` → **`approve_chain_job_id`/`purchase_chain_job_id`**. 같은 부모(`chain_job`)를 두 역할로 참조하므로 역할 접두가 필수이고, FK 제약명도 `fk_payment_chain_job_approve` / `fk_payment_chain_job_purchase`로 갈린다. `status` 6값 ENUM(v4에서 `CHARGING`이 빠진 뒤 그대로). 결제 수단은 지갑 잔액 하나뿐이며 잔액 부족은 결제 시작 전 409로 안내한다.

### refund
```sql
CREATE TABLE refund (
    refund_id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    ticket_id           BIGINT NOT NULL,
    ticket_order_id     BIGINT NOT NULL,
    payment_id          BIGINT NOT NULL,
    receiver_wallet_id  BIGINT NOT NULL,                         -- 환불 수령 지갑 식별자(티켓 소유자 지갑)
    reason              ENUM('CUSTOMER_CANCEL','PERFORMANCE_CANCEL') NOT NULL, -- 환불 사유
    original_amount     BIGINT NOT NULL,
    fee                 BIGINT NOT NULL DEFAULT 0,
    refund_amount       BIGINT NOT NULL,
    fee_tier            ENUM('BEFORE_D7','BEFORE_D3'),           -- 수수료 구간(D-7 이전 전액 / D-3 이전 50%)
    chain_job_id        BIGINT,                                  -- 환불 작업 식별자(REFUND, OPERATOR)
    refund_tx_hash      CHAR(66),
    status              ENUM('PENDING','PROCESSING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING',
    retry_count         INT NOT NULL DEFAULT 0,
    idempotency_key     VARCHAR(255) NOT NULL UNIQUE,
    requested_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at        DATETIME,
    CONSTRAINT fk_refund_ticket FOREIGN KEY (ticket_id) REFERENCES ticket(ticket_id),
    CONSTRAINT fk_refund_ticket_order FOREIGN KEY (ticket_order_id) REFERENCES ticket_order(ticket_order_id),
    CONSTRAINT fk_refund_payment FOREIGN KEY (payment_id) REFERENCES payment(payment_id),
    CONSTRAINT fk_refund_wallet FOREIGN KEY (receiver_wallet_id) REFERENCES wallet(wallet_id),
    CONSTRAINT fk_refund_chain_job FOREIGN KEY (chain_job_id) REFERENCES chain_job(chain_job_id)
) ENGINE=InnoDB;
```
`to_wallet_id` → `receiver_wallet_id`, `refund_job_id` → `chain_job_id`(환불이라는 역할이 테이블 이름에 이미 있으므로 일반 관계). `reason` 2값·`fee_tier` 2값(`BEFORE_D7`/`BEFORE_D3`)·`status` 4값이 ENUM으로 확정됐다. **`REFUND_TRANSFER_FAILED` 에러 코드는 양도와 무관한 환불 tx 실패 코드이며 그대로 남는다.**

### settlement
```sql
CREATE TABLE settlement (
    settlement_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
    performance_id       BIGINT NOT NULL UNIQUE,
    status               ENUM('NONE','AGGREGATED','LOCKED','DISPUTE_OPEN','RELEASED','HALTED') NOT NULL DEFAULT 'NONE', -- 상태(HALTED=공연 취소 또는 관리자 복구 불가 판정, 종단)
    total_revenue        BIGINT,
    valid_ticket_count   INT,
    total_choice_count   INT,
    counter_match        BOOLEAN,
    aggregated_at        DATETIME,
    locked_at            DATETIME,
    dispute_deadline_at  DATETIME,
    released_at          DATETIME,
    aggregate_tx_hash    CHAR(66),
    lock_tx_hash         CHAR(66),
    release_tx_hash      CHAR(66),
    share_token          VARCHAR(512),
    CONSTRAINT fk_settlement_performance FOREIGN KEY (performance_id) REFERENCES performance(performance_id)
) ENGINE=InnoDB;
```
`status` 6값이 ENUM으로 확정됐다. **`HALTED`는 종단 상태**이며 진입 경로는 ① 공연 취소 ② 관리자가 이의 처리 중 집계를 되돌릴 수 없다고 판정해 전액 환불을 결정한 경우 둘뿐이다. 어느 쪽도 시스템이 불일치를 감지해 자동 전이시키지 않는다(§A). 집계 409 게이트·이의 중 release 보류·발행량 대사 `releaseHalted`는 **상태를 바꾸지 않는 별개 장치**다. `RELEASED`가 종단 = 팀 수령 완료.

### settlement_share
```sql
CREATE TABLE settlement_share (
    settlement_share_id  BIGINT AUTO_INCREMENT PRIMARY KEY,
    settlement_id        BIGINT NOT NULL,
    team_id              BIGINT NOT NULL,
    wallet_address       CHAR(42),
    equal_amount         BIGINT NOT NULL,
    selection_amount     BIGINT NOT NULL,
    dust_amount          BIGINT NOT NULL DEFAULT 0,
    total_amount         BIGINT NOT NULL,
    choice_count         INT NOT NULL,
    released             BOOLEAN NOT NULL DEFAULT FALSE,
    released_at          DATETIME,
    approved_at          DATETIME,
    UNIQUE KEY uk_settlement_team (settlement_id, team_id),
    CONSTRAINT fk_settlement_share_settlement FOREIGN KEY (settlement_id) REFERENCES settlement(settlement_id),
    CONSTRAINT fk_settlement_share_team FOREIGN KEY (team_id) REFERENCES team(team_id)
) ENGINE=InnoDB;
```
**PK를 `share_id` → `settlement_share_id`로 개명했다.** 수령 확인은 `released`·`released_at`·`wallet_address` 세 컬럼으로 종단이며, 그 뒤를 추적하는 반출 절차가 없다(v4에서 이미 컬럼 삭제).

**[2026-09-21] `approved_at`(정산 조기 동의, API-settlement-08)** — 참여팀이 "이 분배안에 동의한다"를 누른 시각. `NULL` = 미동의. **철회가 없어**(사용자 결정) 한 번 채워지면 되돌아가지 않으므로 `boolean` 컬럼을 따로 두지 않았다 — 시각 하나로 여부와 시점을 둘 다 답한다. 참여팀 전원(주최팀 포함)의 `approved_at`이 모두 채워지면 48시간 이의제기 기간을 건너뛰고 release가 열린다. 실제 컬럼 타입은 같은 테이블의 `released_at`과 같은 `DATETIME(6)`이다 — 이 문서가 `DATETIME`으로 적는 것은 §0의 표기 관례다(ERD Cloud가 정밀도를 표현하지 못한다). 두 컬럼 사이에 정밀도 차이는 없다.

### dispute
```sql
CREATE TABLE dispute (
    dispute_id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    settlement_id      BIGINT NOT NULL,
    team_id            BIGINT NOT NULL,
    reason             TEXT NOT NULL,
    status             ENUM('OPEN','RESOLVED','REJECTED') NOT NULL DEFAULT 'OPEN',
    admin_comment      TEXT,
    handler_member_id  BIGINT,
    submitted_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at        DATETIME,
    CONSTRAINT fk_dispute_settlement FOREIGN KEY (settlement_id) REFERENCES settlement(settlement_id),
    CONSTRAINT fk_dispute_team FOREIGN KEY (team_id) REFERENCES team(team_id),
    CONSTRAINT fk_dispute_member FOREIGN KEY (handler_member_id) REFERENCES member(member_id)
) ENGINE=InnoDB;
```
`admin_id` → `handler_member_id`(처리 관리자). `status` 3값 ENUM. `RESOLVED`(이의 인정) 이후에는 온체인 `lock`이 이미 확정돼 재집계가 불가능하므로, 관리자는 ① 분배 결과를 그대로 두고 `release`를 진행하거나 ② 전액 환불을 결정해 정산을 `HALTED`로 전이하는(공연 취소와 같은 경로) 둘 중 하나를 택한다. `AGGREGATED`로 되돌리는 경로는 없다(§A-5 D1).

### audit_log
```sql
CREATE TABLE audit_log (
    audit_log_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor_member_id  BIGINT,
    actor_role       VARCHAR(20),
    request_ip       VARCHAR(45),
    action_type      ENUM('ADMIN_ACTION','OPERATOR_SIGN','MINT','RELEASE','GRANT','RATE_CHANGE','WALLET_LINK','STATUS_CHANGE') NOT NULL, -- 행위 유형 8종
    resource_type    VARCHAR(50) NOT NULL,
    resource_id      BIGINT,
    request_summary  TEXT,
    result           ENUM('SUCCESS','FAILURE') NOT NULL,
    tx_hash          CHAR(66),
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_log_member FOREIGN KEY (actor_member_id) REFERENCES member(member_id)
) ENGINE=InnoDB;
```
`actor_id` → `actor_member_id`. `action_type` 8종·`result` 2값이 ENUM으로 확정됐다. **`actor_role`은 VARCHAR로 남는다** — 값 집합이 아직 정의되지 않았다. `04 §4`의 actor 코드가 확정되면 ENUM으로 전환한다. `resource_type`은 테이블명이 들어오므로 계속 VARCHAR다.

### member_preferred_genre **(v6 신설)**
```sql
CREATE TABLE member_preferred_genre (
    member_id   BIGINT NOT NULL,
    genre       VARCHAR(20) NOT NULL,
    created_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (member_id, genre),
    CONSTRAINT fk_member_preferred_genre_member FOREIGN KEY (member_id) REFERENCES member(member_id)
) ENGINE=InnoDB;
```
회원당 0~3행(D-R03, 가변 개수라 `member`에 컬럼 3개를 두지 않고 별도 테이블로 뺐다). `member_id → member`는 식별 관계이며 `(member_id, genre)` 복합 PK를 구성한다(별도 `AUTO_INCREMENT` PK 없음). 선택 안 함 = 0행. `genre` 값 집합은 `team.genre`와 같은 10종(설계 v1 §4.1)이며 앱 enum으로만 검증한다(D-R01과 동일 근거). 입력 지점은 화면 C-02(온보딩 1회 확인 폼, D-R04)·C-04(마이페이지 수정).

### recommendation_log **(v6 신설)**
```sql
CREATE TABLE recommendation_log (
    recommendation_log_id  BIGINT AUTO_INCREMENT PRIMARY KEY,
    member_id               BIGINT NOT NULL,
    performance_id          BIGINT NOT NULL,
    session_id              CHAR(36) NOT NULL,
    position                TINYINT NOT NULL,
    basis                   ENUM('GENRE','TAGGED','RANKED','FALLBACK') NOT NULL,
    served_at               DATETIME(6) NOT NULL,
    genre_overlap           TINYINT NOT NULL,
    pref_count              TINYINT NOT NULL,
    min_price               BIGINT NOT NULL,
    days_until              SMALLINT NOT NULL,
    weekday                 TINYINT NOT NULL,
    n_teams                 TINYINT NOT NULL,
    is_joint                BOOLEAN NOT NULL,
    sold_ratio              DECIMAL(4,3) NOT NULL,
    past_orders             SMALLINT NOT NULL,
    CONSTRAINT fk_recommendation_log_member FOREIGN KEY (member_id) REFERENCES member(member_id),
    CONSTRAINT fk_recommendation_log_performance FOREIGN KEY (performance_id) REFERENCES performance(performance_id)
) ENGINE=InnoDB;
```
서빙 로그이자 학습 데이터 계약(설계 v1 §4.3). `member_id`는 노출 대상 회원, `performance_id`는 노출된 공연을 가리키는 **비식별** FK다(§3.1 규칙 1 — 역할 없는 일반 관계라 `{entity}_id` 그대로). `session_id`는 추천 요청 1건 = 세션 1개(UUID), `position`은 1~6(카드 노출 순서). `basis`는 `GENRE`(팀 장르 매칭)·`TAGGED`(LLM 태그 장르로 매칭)·`RANKED`(랭커)·`FALLBACK`(곧 시작 순) 4값이며 폴백도 위장하지 않고 그대로 남긴다(D-R06). **`basis`는 행(카드) 단위다 — 응답의 `data.basis`를 복사하지 않는다.** 응답 basis는 "부족분을 폴백으로 채워도 GENRE 유지"인 응답 단위 판정이라, 그대로 쓰면 폴백으로 채운 카드가 `GENRE`로 남아 D-R06이 막으려던 위장이 로그에서 생기고 basis별 전환율(E-07)이 오염된다. 행 판정: 그 카드의 `matchedGenres`가 비면 `FALLBACK`, 태그 장르 덕에 겹쳤으면 `TAGGED`, 팀 장르만으로 겹쳤으면 `GENRE`, 랭커가 재정렬한 응답이면 `RANKED`.

나머지 9컬럼은 **서빙 시점 피처 스냅샷**이다 — `genre_overlap`(선호 장르 겹침 수)·`pref_count`(회원 선호 장르 개수)·`min_price`(최저 티켓 가격, YoYo)·`days_until`(공연일까지 남은 일수)·`weekday`(공연 요일, 0=월)·`n_teams`(참여 팀 수)·`is_joint`(공동 공연 여부)·`sold_ratio`(판매율)·`past_orders`(회원의 과거 PAID 주문 수). 전부 `NOT NULL`이며, 이름은 `ml/ctr/synth.py`의 `FEATURES`와 글자 단위로 동일해야 한다(계약, 설계 v1 §4.3). 정답 라벨(클릭·구매 여부)은 이 테이블에 저장하지 않고 조회 시 `ticket_order`(status=PAID, `served_at` 후 24시간 내, 같은 `member_id`·`performance_id`)와 조인해 만든다 — 별도 클릭 수집 엔드포인트를 두지 않는다(D-R07).

### webauthn_credential **(v6.1 신설 · 2026-09-24)**
```sql
CREATE TABLE webauthn_credential (
    webauthn_credential_id  BIGINT AUTO_INCREMENT PRIMARY KEY,
    member_id               BIGINT NOT NULL,
    credential_id           VARBINARY(1023) NOT NULL,
    public_key              BLOB NOT NULL,
    sign_count              BIGINT NOT NULL DEFAULT 0,
    transports              VARCHAR(100) NULL,
    created_at              DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at              DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    last_used_at            DATETIME(6) NULL,
    UNIQUE KEY uk_webauthn_credential_credential_id (credential_id),
    KEY idx_webauthn_credential_member_id (member_id),
    CONSTRAINT fk_webauthn_credential_member FOREIGN KEY (member_id) REFERENCES member(member_id)
) ENGINE=InnoDB;
```
결제 전 본인 확인(API v7 §7.W)에 쓰는 **회원 기기 패스키의 공개키**. 회원 1 : N(기기마다 1행). **생체 정보·개인키는 어디에도 없다** — 기기가 생체로 잠금을 푼 개인키로 서명하고 서버는 여기 저장한 공개키로 그 서명만 검증한다.

- `credential_id` — 인증기가 만든 credential ID **원본 바이트**. `VARBINARY`인 이유: base64url 문자열을 `utf8mb4_0900_ai_ci` 컬럼에 넣으면 **대소문자를 구분하지 않아** 서로 다른 ID가 같은 값으로 비교된다(유니크·조회 모두 틀린다). 1023은 WebAuthn 규격의 상한이다.
- `public_key` — COSE_Key CBOR 바이트(ES256·RS256).
- `sign_count` — 인증기 서명 카운터. 본인 확인마다 제시값이 저장값보다 커야 한다(둘 다 0인 동기화 패스키는 예외 — WebAuthn §6.1.1). 복제된 인증기 탐지용.
- `transports` — `internal,hybrid`처럼 쉼표로 이은 힌트. `allowCredentials`에 되돌려 준다.
- `last_used_at` — 마지막 본인 확인 성공 시각.
- 챌린지(300초)·step-up 토큰(120초)은 1회용·단명이라 **Redis에만 둔다**(API v7 §0.12). 테이블을 만들지 않는다.

**v7 예정: `performance.tags JSON`, `ml_job`**(2차 LLM 태깅·임베딩 예약 컬럼·테이블, 설계 v1 §4.4). 이번 버전에는 넣지 않는다.

## 3. 관계 요약

```
member ─┬── wallet (1:1, 회원당 지갑 1개 — member_id UNIQUE)
        ├─< ticket_order (member_id, 주문 회원)
        ├─< ticket (member_id, 소유자 = 구매자 — v5에서 단일 컬럼으로 통합)
        ├─< exchange_rate (creator_member_id, 등록 관리자)
        ├─< rule_agreement (requester_member_id, 동의 요청자)
        ├─< dispute (handler_member_id, 처리 관리자)
        ├─< chain_job (requester_member_id, 요청자)
        ├─< team (leader_member_id, 팀 리더)
        └─< audit_log (actor_member_id, 행위자)

wallet ─┬─< payment (payer_wallet_id, 결제 서명 지갑)
        ├─< refund (receiver_wallet_id, 환불 수령 지갑)
        └─< chain_job (wallet_id, 서명·수신 지갑 + MINT 수신 지갑)
   ※ wallet에는 개인키·니모닉·MPC 샤드·DEK 어떤 키 컬럼도 없다. 서버는 사용자 키를 보관하지 않는다.
   ※ v5에서 잔액 캐시 2컬럼이 빠졌다 — Redis 해시 wallet:balance (TTL 없음).
   ※ 지갑 등록 챌린지(wallet:challenge:{memberId} TTL 300s), 리프레시 토큰(auth:refresh:{jti} TTL 14일)
     은 모두 Redis이며 테이블이 없다(21개 미포함).

team ──┬── leader_member_id >── member   ※ 팀 지갑 = team.leader_member_id → wallet (팀에 주소·계좌 컬럼 없음)
       ├─< performance (creator_team_id, 생성 팀)
       ├─< performance_participant (wallet_address = 리더 지갑 스냅샷)
       ├─< rule_agreement
       ├─< settlement_share
       ├─< dispute
       └─< ticket_order (selected_team_id, 관객 선택 팀)

performance ─┬─< ticket_type
             ├─< performance_participant
             ├─< settlement_rule (1:1)
             ├─< rule_agreement
             ├─< ticket_order
             ├─< ticket
             ├─< settlement (1:1)
             └── deposit_chain_job_id >── chain_job (보증금 납부 job)

ticket_order ─┬─< order_item
              ├── payment (1:1, ticket_order_id UNIQUE)
              ├─< ticket
              ├─< refund
              └── order_group_id >── ticket_order (자기참조, 대표 주문 = 첫 하위 주문. v5.1)

ticket ─┬─< refund
        ├── (qr_secret TOTP 내장 — 30초 회전, 발급 시 1회 생성)
        └── (entry_result, entered_at 내장 — 입장 1회성)

settlement ─┬─< settlement_share   (released·released_at·wallet_address로 수령 확인 — 종단)
            └─< dispute

exchange_rate — 참조하는 업무 컬럼 없음(표시 전용 조회만, P-17)

-- 온체인 작업은 chain_job 하나로 통합한다. coin_job은 부활하지 않는다.
chain_job ─┬── requester_member_id   >── member       (요청자, MINT 자동 지급은 NULL)
           ├── wallet_id             >── wallet       (서명·수신 지갑, NULL 허용 — 역할 접두 팀 결정 대기)
           ├── target_performance_id >── performance  (NULL 허용)
           ├── target_ticket_id      >── ticket       (NULL 허용)
           └── target_team_id        >── team         (NULL 허용)

chain_job <─┬── performance.deposit_chain_job_id       (DEPOSIT, USER)
            ├── rule_agreement.chain_job_id            (AGREE, USER)
            ├── payment.approve_chain_job_id           (APPROVE, USER)
            ├── payment.purchase_chain_job_id          (PURCHASE, USER)
            └── refund.chain_job_id                    (REFUND, OPERATOR)
   ※ 시연용 지급(MINT)·LOCK·AGGREGATE·RELEASE·DEPOSIT_RETURN·HALT job은 역참조 컬럼 없이 chain_job에만 존재하며,
     target_performance_id·target_team_id·wallet_id로 대상을 되짚는다.

-- v6 신설(추천 도메인)
member ─┬─< member_preferred_genre (member_id, 식별 관계 — PK 구성. 0~3행)
        └─< recommendation_log (member_id, 노출 대상 회원 — 비식별)

performance ─< recommendation_log (performance_id, 노출된 공연 — 비식별)

-- v6.1 신설(결제 전 본인 확인)
member ─< webauthn_credential (member_id, 기기 패스키 — 비식별. 회원당 기기 수만큼)
```

삭제된 v4 관계 4개: `transfer` → `ticket`, `transfer` → `member`(양도인), `transfer` → `member`(양수인), `ticket.buyer_member_id` → `member`. v5의 FK는 **43개**였고, v6에서 `member_preferred_genre`·`recommendation_log`의 FK 3개(각각 1개, 2개)가 더해져 **46개**다.

### 3.1 FK 물리명·제약명 규칙 (사용자 확정 9/3)

1. 역할 없는 일반 관계 = **`{entity}_id`** — 참조 PK명 그대로. `owner_` 같은 역할을 만들어내지 않는다.
2. 참조 대상에 명확한 역할이 있으면 **`{role}_{entity}_id`**.
3. 같은 부모를 여러 역할로 참조하면 반드시 역할을 구분한다(`payment` → `chain_job` 2회).
4. `leader_id`·`requester_id`처럼 **참조 엔티티가 드러나지 않는 이름은 금지**한다.
5. 역할이 소유 테이블의 개념과 겹치면 일반 관계로 본다 — `refund.chain_job_id`(환불 작업), `rule_agreement.chain_job_id`(동의 작업).
6. FK 제약명은 **`fk_{자식}_{부모}[_역할]`** — `fk_payment_chain_job_approve` / `fk_payment_chain_job_purchase`.

| 테이블 | v4 컬럼 | v5 확정 | 참조 | 역할 |
|---|---|---|---|---|
| exchange_rate | `published_by` | `creator_member_id` | member | 환율 등록 관리자 |
| chain_job | `requester_id` | `requester_member_id` | member | 요청자 |
| chain_job | `ref_performance_id` | `target_performance_id` | performance | 대상 |
| chain_job | `ref_ticket_id` | `target_ticket_id` | ticket | 대상 |
| chain_job | `ref_team_id` | `target_team_id` | team | 대상 |
| team | `leader_id` | `leader_member_id` | member | 팀 리더 |
| performance | `team_id` | `creator_team_id` | team | 생성 팀 |
| performance | `deposit_job_id` | `deposit_chain_job_id` | chain_job | 보증금 납부 |
| rule_agreement | `requested_by` | `requester_member_id` | member | 동의 요청자 |
| rule_agreement | `agree_job_id` | `chain_job_id` | chain_job | (일반 관계) |
| ticket_order | `choice_team_id` | `selected_team_id` | team | 관객 선택 팀 |
| ticket | `owner_member_id`+`buyer_member_id` | `member_id` | member | (일반 소유 관계, 통합) |
| payment | `wallet_id` | `payer_wallet_id` | wallet | 결제(서명) 지갑 |
| payment | `approve_job_id` | `approve_chain_job_id` | chain_job | approve |
| payment | `purchase_job_id` | `purchase_chain_job_id` | chain_job | purchase |
| refund | `to_wallet_id` | `receiver_wallet_id` | wallet | 환불 수령 |
| refund | `refund_job_id` | `chain_job_id` | chain_job | (일반 관계) |
| dispute | `admin_id` | `handler_member_id` | member | 처리 관리자 |
| audit_log | `actor_id` | `actor_member_id` | member | 행위자 |

**검토 필요 1건 — `chain_job.wallet_id`.** 논리명이 "서명·수신 지갑"이고 `USER` tx에서는 서명자, `MINT`·`REFUND`에서는 수신자로 `tx_type`에 따라 역할이 갈려 하나의 role로 정할 수 없다. 후보는 `subject_wallet_id`(대상 지갑) 또는 컬럼 분리(`signer_wallet_id` / `receiver_wallet_id`)다. **팀 결정 대기 중이며 그때까지 `wallet_id`를 유지한다.**

### 3.2 상태 컬럼 ENUM 목록 (24개)

| 테이블 | 컬럼 | 값 |
|---|---|---|
| member | `auth_provider` | GOOGLE / FACEBOOK / KAKAO / LOCAL(P1 예약) |
| member | `status` | ACTIVE / SUSPENDED / WITHDRAWN |
| chain_job | `tx_type` | MINT / APPROVE / PURCHASE / REFUND / DEPOSIT / DEPOSIT_RETURN / DEPOSIT_FORFEIT(P1) / AGREE / LOCK / AGGREGATE / RELEASE / HALT / CREATE_SHOW / START_SALE / UPDATE_RULES |
| chain_job | `signer_type` | OPERATOR / USER |
| chain_job | `issuer_type` | MOCK / EXTERNAL(P2 예약) |
| chain_job | `status` | PENDING / SUBMITTED / CONFIRMED / FAILED |
| wallet | `provider` | WEB3AUTH / EXTERNAL |
| wallet | `status` | LINKED / SUSPENDED |
| team | `status` | ACTIVE / DISBANDED |
| performance | `status` | DRAFT / PENDING_AGREEMENT / ON_SALE / SALE_CLOSED / ENDED / CANCELLED |
| performance | `deposit_status` | UNPAID / PAID / RETURNED / FORFEITED(P1) |
| performance_participant | `status` | REGISTERED / REMOVED |
| rule_agreement | `status` | PENDING / SIGNING / AGREED |
| ticket_order | `status` | PENDING_PAYMENT / PAID / CANCELLED / REFUNDED |
| **ticket** | **`status`** | **ISSUED / USED / CANCELLED** (v5에서 `TRANSFER_PENDING` 삭제) |
| payment | `status` | REQUESTED / AWAITING_SIGNATURE / PAYING / PAID / FAILED / REFUNDED |
| refund | `reason` | CUSTOMER_CANCEL / PERFORMANCE_CANCEL |
| refund | `fee_tier` | BEFORE_D7 / BEFORE_D3 |
| refund | `status` | PENDING / PROCESSING / COMPLETED / FAILED |
| settlement | `status` | NONE / AGGREGATED / LOCKED / DISPUTE_OPEN / RELEASED / HALTED |
| dispute | `status` | OPEN / RESOLVED / REJECTED |
| audit_log | `action_type` | ADMIN_ACTION / OPERATOR_SIGN / MINT / RELEASE / GRANT / RATE_CHANGE / WALLET_LINK / STATUS_CHANGE |
| audit_log | `result` | SUCCESS / FAILURE |
| **recommendation_log** | **`basis`** | **GENRE / TAGGED / RANKED / FALLBACK (v6 신설)** |

VARCHAR로 남는 상태성 컬럼: `member.locale`·`member.display_currency`·`exchange_rate.source`·`ticket.entry_result`·`audit_log.actor_role`·`audit_log.resource_type`(§0). **v6에서 앱 enum 검증만 추가되고 DB 컬럼 타입은 그대로 VARCHAR인 것**: `team.genre`(D-R01, Flyway ENUM validate 함정 회피)·`member_preferred_genre.genre`(같은 값 집합).

## 4. 인덱스 권고

| 테이블 | 인덱스 | 용도 |
|--------|--------|------|
| wallet | (address) | 주소 → 회원 역조회, 이벤트 대사 |
| ticket | (performance_id, status) | 재고 조회·입장 검증 |
| **ticket** | **(member_id, status)** | **내 티켓 목록** (v4의 `owner_member_id` → 통합 컬럼) |
| ticket_order | (member_id, performance_id) | 중복 구매 검사 |
| ticket_order | (status, payment_expires_at) | 만료 주문 배치 |
| **ticket_order** | **(order_group_id)** | **주문 그룹 조회 — 대표/하위 주문 어느 쪽으로 들어와도 그룹 전체를 찾는다. 인덱스명 `idx_ticket_order_group` · `V{다음 빈 번호}`(v5.1)** |
| payment | (status, requested_at) | 서명 대기·전송 중 결제 모니터링 |
| chain_job | (status, requested_at) | 재시도 큐 |
| **chain_job** | **(status, signer_type, chain_job_id)** | **워커 PENDING·OPERATOR 스캔(id 순). 인덱스명 `idx_chain_job_status_signer` · `V5`** [2026-09-14 — S15P21B204-96] |
| chain_job | (tx_type, status) | 유형별 작업 모니터링 |
| chain_job | (tx_type, wallet_id) | 시연용 지급 이력 조회(API-coin-08)·지갑 거래 이력(API-wallet-02) |
| chain_job | (signer_type, status) | 사용자 서명 tx receipt 검증 대기열 |
| chain_job | (tx_hash) | 프론트 보고 해시 → job 역조회 |
| settlement | (performance_id) | 정산 조회 |
| settlement | (share_token) | 공유 링크 조회 |
| exchange_rate | (pair, effective_from) | 유효 환율 조회(테이블 정의에 포함) |
| audit_log | (created_at) | 시간순 조회 |
| **audit_log** | **(actor_member_id, action_type)** | **행위자별 조회** (FK 개명 반영) |
| **recommendation_log** | **`idx_recommendation_log_member` (member_id, served_at)** | **회원별 노출 이력 조회, 전환율 조인(v6)** |
| **recommendation_log** | **`idx_recommendation_log_performance` (performance_id, served_at)** | **공연별 노출 이력 조회, 전환율 조인(v6)** |
| **recommendation_log** | **`idx_recommendation_log_session` (session_id)** | **세션 단위 집계·피처 배치 조인(v6, MR !186 컨설턴트 리뷰). 비동기 INSERT 에 붙는 비용은 CHAR(36) 보조 인덱스 하나** |
| **webauthn_credential** | **`uk_webauthn_credential_credential_id` (credential_id) UNIQUE** · **`idx_webauthn_credential_member_id` (member_id)** | **본인 확인 시 credential 조회 · 회원별 등록 기기 목록(v6.1)** |

v4 인덱스 표에서 삭제된 행: `transfer (ticket_id, status)` — 테이블이 없어졌다.

## 5. 검증 결과 (MySQL 8.4)

`docker run -d -e MYSQL_ALLOW_EMPTY_PASSWORD=1 mysql:8.4` 컨테이너에서 두 SQL을 각각 빈 스키마에 실행했다(2026-09-22, 이 개정에서 재실측).

| 항목 | `16_ERD_v6_import.sql` | `16_ERD_v6_import_mvp.sql` |
|---|---:|---:|
| 실행 결과 | **성공 (에러 0건)** | **성공 (에러 0건)** |
| 테이블 | **21** (v5 19 + 신설 2) | **21** |
| 컬럼 | **244** (v5 225 + 신설 19) | **244** |
| FK 제약 | **46** (v5 43 + 신설 3) | **46** |
| UNIQUE 제약 | 15 | 15 |
| ENUM 컬럼 | **24** (v5 23 + `recommendation_log.basis`) | **24** |

MySQL 버전 `8.4.11`(컨테이너 `mysql:8.4`). FK 제약명 46개는 모두 서로 다르고 `fk_{자식}_{부모}[_역할]` 규칙을 지킨다. v5의 43·225·19·23 실측치는 [`12_ERD_v5.md` §5](./12_ERD_v5.md)에 남아 있다.

### 산출물

| 파일 | 내용 |
|---|---|
| `16_ERD_v6.md` | 이 문서 (21 테이블, MySQL ENUM 표기) |
| `16_ERD_v6_import.sql` | 전체 DDL **21 테이블** (논리명 COMMENT 포함) |
| `16_ERD_v6_import_mvp.sql` | **전체본과 내용이 완전히 동일하다** — v5부터 이어지는 상태이며, v6에서도 MVP 제외 테이블이 없다(D-B7). "ERD Cloud 반영본 = `_mvp.sql`"이라는 팀 약속을 유지하기 위해 파일만 남긴다 |

생성 순서는 두 SQL 모두 `member → exchange_rate → chain_job → wallet → team → performance → … → audit_log → member_preferred_genre → recommendation_log`(부모 → 자식)이고, `chain_job`의 역참조 FK 4개(`wallet`·`performance`·`ticket`·`team`)는 순환 참조라 파일 말미 `ALTER TABLE`로 추가한다.

**두 SQL은 ERD Cloud에 import하지 않는다.** 정본이 Cloud이고 이 파일들이 그 export이기 때문이다. Cloud를 바꿔야 하면 컬럼 단위 증분 편집(`update_column(s)` / `delete_column`)만 하고, 그 뒤 이 파일들을 다시 export해 갱신한다.

### v5를 만들 때 ERD Cloud에 적용한 증분 6건 (2026-09-03, 참고용 — v5 이력)

| 대상 | 변경 |
|---|---|
| `ticket.original_price` | → `purchase_price` (논리명 "구매 금액", COMMENT "환불액 산정 기준(발급 시점 가격 스냅샷)") |
| `exchange_rate.rate_id` | → `exchange_rate_id` |
| `performance_participant.participant_id` | → `performance_participant_id` |
| `settlement_rule.rule_id` | → `settlement_rule_id` |
| `rule_agreement.agreement_id` | → `rule_agreement_id` |
| `settlement_share.share_id` | → `settlement_share_id` |

한 번의 `update_columns` 호출로 적용했으므로 되돌리려면 ERD Cloud에서 **undo 1회**면 된다. `wallet`의 잔액 캐시 2컬럼과 `transfer` 테이블, `ticket`의 소유자/구매자 분리 컬럼은 **팀이 이미 Cloud에서 제거해 둔 상태**여서 추가 삭제 작업이 없었다.

### v6을 만들 때 ERD Cloud에 적용한 증분 (2026-09-22, 추천 도메인)

| 대상 | 변경 |
|---|---|
| `team.genre` | `VARCHAR(50)` 자유 입력 → `NOT NULL` + 앱 enum 검증(코드 10종). 기존 자유 입력 값은 `ETC`로 이관 |
| `member_preferred_genre` | 테이블 신설. `member_id`+`genre` 복합 PK, FK 1개(`fk_member_preferred_genre_member`) |
| `recommendation_log` | 테이블 신설. FK 2개(`fk_recommendation_log_member`·`fk_recommendation_log_performance`), 인덱스 3개(§4) |

ERD Cloud 반영 완료(설계 v1 §4·§13). 이 문서·두 SQL은 그 반영을 읽어 만든 산출물이다.

이어서 같은 날 팀이 직접 적용한 증분 2건도 이 문서에 반영돼 있다.

| 대상 | 변경 |
|---|---|
| `order_item.unit_price` | **복구**(`add_column`) — `BIGINT NOT NULL`, 논리명 "구매 시점 단가", COMMENT "구매 시점 단가(YoYo) — 티켓 옵션 가격 변경과 무관하게 주문 시점 값을 보존". v4 → v5 사이 Cloud 편집 중 유실된 것으로 확인됐다 |
| `ticket.status` COMMENT | `상태(양도 제외로 TRANSFER_PENDING 없음)` → **`상태(발급/사용/취소)`** — 삭제된 기능 이름을 정본 주석에서 걷어냈다 |

