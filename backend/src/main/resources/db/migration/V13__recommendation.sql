-- ============================================================
-- V13 — 추천 도메인 (team.genre 코드화 · member_preferred_genre · recommendation_log)
--
-- 무엇을. 회원의 선호 장르와 팀 장르를 맞춰 판매 중 공연을 추천하기 위한 스키마다
--   (설계 v1 §4 · ERD v6 §2 · API-recommendation-01). 세 덩어리다.
--
--   1) team.genre 를 자유 입력에서 코드 10종으로 바꾸고 NOT NULL 을 건다.
--   2) member_preferred_genre — 회원당 0~3행의 선호 장르.
--   3) recommendation_log — 추천 노출 로그. 서빙 기록이자 CTR 랭커 학습 데이터다.
--
-- 왜 team.genre 의 컬럼 타입을 ENUM 으로 바꾸지 않는가. ddl-auto=none 인 이 프로젝트에서
--   MySQL ENUM 은 Flyway·Hibernate 양쪽에 값 집합을 이중으로 박는다 — 장르가 하나 늘 때마다
--   ALTER TABLE 마이그레이션과 코드 배포를 같은 시점에 맞춰야 하고, 순서가 엇갈리면 기동이
--   깨진다(b204-stack "ENUM 값 변경" 함정). 장르는 상태 컬럼과 달리 운영 중 늘어날 값이라
--   VARCHAR(50) 을 그대로 두고 **앱 레벨 enum 으로만 검증**한다(설계 D-R01).
--   recommendation_log.basis 는 반대다 — 추천 단계(GENRE·TAGGED·RANKED·FALLBACK)는 설계가
--   고정한 4값이고 늘지 않으므로 ERD v6 대로 ENUM 이다.
--
-- 왜 기존 값을 전부 ETC 로 밀어버리는가. v5 까지 genre 는 자유 입력이었고 팀 폼에 입력란조차
--   없어 실제로는 값이 거의 없다(설계 §2). "인디록" 같은 한글 문자열을 코드로 추정해 옮기면
--   추정이 틀렸을 때 추천 결과가 조용히 어긋난다. 전부 ETC 로 내려두고 리더가 팀 수정에서
--   고르게 하는 쪽이 정직하다.
--
-- 왜 공연에는 장르 컬럼을 만들지 않는가. 공연 장르 = 생성 팀 + 참여 팀(REGISTERED) 장르의
--   합집합이다(ERD v6 §2 team). 컬럼으로 복제하면 참여 팀이 바뀔 때마다 동기화 대상이 하나
--   늘 뿐이다. 조회 시 조인해서 만든다.
--
-- recommendation_log 의 피처 9개는 전부 NOT NULL 인 **서빙 시점 스냅샷**이다. 나중에 조회로
--   다시 계산할 수 없는 값(그때의 판매율·남은 일수)이라 지금 박아야 학습 데이터가 된다.
--   컬럼 이름은 ml/ctr/synth.py 의 FEATURES 와 글자 단위로 같아야 한다(계약, 설계 §4.3).
--   basis 는 응답 단위가 아니라 **그 카드의 근거**다 — 6건을 못 채워 폴백으로 메운 카드는
--   FALLBACK 으로 남아야 basis 별 전환율 비교(설계 §10)가 오염되지 않는다.
--   session_id 인덱스는 전환율 쿼리·피처 배치가 세션으로 조인하기 때문에 둔다.
--   정답 라벨은 저장하지 않고 ticket_order(PAID, served_at + 24h 내) 와 조인해 만든다(D-R07).
--
-- FK 가 3개 늘어난다 — FlywayMigrationTest.ERD_FK_COUNT 45 -> 48, 테이블 20 -> 22,
-- ENUM 컬럼 23 -> 24.
--
-- 번호. 설계는 V8 을 잡았으나 develop 이 V8·V10 을 먼저 넣어 V11 로 옮겼고, 머지 직전
--   develop 에 다시 V11(performance_participant.accepted_at)·V12(file)가 들어와 V13 이 됐다.
--   out-of-order 를 끄고 쓰므로 적용된 최고 버전보다 낮은 번호는 영영 못 쓴다 — 번호는
--   머지 직전 develop 의 최고 버전 + 1 로 잡는다.
-- ============================================================

-- ------------------------------------------------------------ 1) team.genre 코드화
-- NOT NULL 을 걸기 전에 NULL·자유 입력을 전부 ETC 로 이관한다. 순서를 바꾸면 ALTER 가 실패한다.
UPDATE team SET genre = 'ETC';

ALTER TABLE team
    MODIFY COLUMN genre VARCHAR(50) NOT NULL
        COMMENT '장르 코드(ROCK·INDIE·POP·HIPHOP·RNB·JAZZ·ELECTRONIC·ACOUSTIC·CLASSICAL·ETC, 앱 enum 검증)';

-- ------------------------------------------------------------ 2) member_preferred_genre
CREATE TABLE member_preferred_genre (
    member_id   BIGINT       NOT NULL COMMENT '회원 식별자',
    genre       VARCHAR(20)  NOT NULL COMMENT '선호 장르 코드(team.genre 와 같은 10종)',
    created_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '선택 일시',
    PRIMARY KEY (member_id, genre),
    CONSTRAINT fk_member_preferred_genre_member FOREIGN KEY (member_id)
        REFERENCES member (member_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='회원 선호 장르(0~3행)';

-- ------------------------------------------------------------ 3) recommendation_log
CREATE TABLE recommendation_log (
    recommendation_log_id  BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '추천 노출 로그 식별자',
    member_id              BIGINT      NOT NULL COMMENT '노출 대상 회원',
    performance_id         BIGINT      NOT NULL COMMENT '노출된 공연',
    session_id             CHAR(36)    NOT NULL COMMENT '추천 요청 1건 = 세션 1개(UUID)',
    position               TINYINT     NOT NULL COMMENT '카드 노출 순서(1~6)',
    basis                  ENUM('GENRE','TAGGED','RANKED','FALLBACK') NOT NULL COMMENT '추천 근거',
    served_at              DATETIME(6) NOT NULL COMMENT '노출 일시',
    genre_overlap          TINYINT     NOT NULL COMMENT '[피처] 선호 ∩ 공연 장르 겹침 수',
    pref_count             TINYINT     NOT NULL COMMENT '[피처] 회원 선호 장르 개수',
    min_price              BIGINT      NOT NULL COMMENT '[피처] 최저 티켓 가격(YoYo)',
    days_until             SMALLINT    NOT NULL COMMENT '[피처] 공연일까지 남은 일수',
    weekday                TINYINT     NOT NULL COMMENT '[피처] 공연 요일(0=월)',
    n_teams                TINYINT     NOT NULL COMMENT '[피처] 참여 팀 수',
    is_joint               BOOLEAN     NOT NULL COMMENT '[피처] 공동 공연 여부',
    sold_ratio             DECIMAL(4,3) NOT NULL COMMENT '[피처] 판매율(판매 수량/총 수량)',
    past_orders            SMALLINT    NOT NULL COMMENT '[피처] 회원의 과거 PAID 주문 수',
    KEY idx_recommendation_log_session (session_id),
    KEY idx_recommendation_log_member (member_id, served_at),
    KEY idx_recommendation_log_performance (performance_id, served_at),
    CONSTRAINT fk_recommendation_log_member FOREIGN KEY (member_id)
        REFERENCES member (member_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_recommendation_log_performance FOREIGN KEY (performance_id)
        REFERENCES performance (performance_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='추천 노출 로그(= CTR 랭커 학습 데이터)';
