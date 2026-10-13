-- ============================================================
-- V14 — webauthn_credential (결제 전 패스키 본인 확인)
--
-- 무엇을. 관객 기기 패스키의 공개키를 저장한다(API v7 §7.W · ERD v6.1 · 결정 v2 §14-41).
--   생체 정보·개인키는 어디에도 없다. 기기가 생체로 잠금을 푼 개인키로 서명하고, 서버는 여기 둔
--   공개키로 그 서명만 검증한다.
--
-- 스위치. 결제 흐름에서 쓰이는 것은 PAYMENT_STEP_UP_ENABLED=true 일 때뿐이다. 테이블은 스위치와
--   무관하게 만든다 — 스키마를 설정에 따라 갈라 두면 켜는 순간 마이그레이션이 필요해진다.
--
-- credential_id 가 VARBINARY 인 이유. base64url 문자열을 utf8mb4_0900_ai_ci 컬럼에 넣으면 대소문자를
--   구분하지 않아 서로 다른 ID 가 같은 값으로 비교된다(유니크·조회 모두 틀린다). 원본 바이트를 둔다.
--   1023 은 WebAuthn 규격의 credential ID 상한이다(유니크 인덱스 한도 3072 바이트 안).
--
-- public_key. COSE_Key CBOR 바이트(ES256·RS256). webauthn4j 가 읽고 쓴다.
--
-- 챌린지·step-up 토큰은 테이블이 아니다 — Redis webauthn:challenge:* (300초)·webauthn:stepup:* (120초).
--
-- 번호. develop 최고 버전은 V12지만 추천 도메인 브랜치(feat/be/recommendation)가 V13을 잡고 있어 V14로 둔다.
--   out-of-order=false라 이 파일이 V13보다 먼저 develop에 적용되면 V13은 적용되지 못한다 — 추천 브랜치가 먼저 머지되거나 V15 이상으로 올려야 한다.
--
-- FK 는 RESTRICT — 회원은 물리 삭제하지 않는다(V1 헤더의 FK 정책과 같다).
--
-- 되돌리기. DROP TABLE webauthn_credential;
-- ============================================================

CREATE TABLE webauthn_credential (
    webauthn_credential_id  BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '패스키 식별자',
    member_id               BIGINT NOT NULL COMMENT '기기를 등록한 회원',
    credential_id           VARBINARY(1023) NOT NULL COMMENT '인증기가 만든 credential ID(원본 바이트)',
    public_key              BLOB NOT NULL COMMENT 'COSE_Key CBOR 공개키',
    sign_count              BIGINT NOT NULL DEFAULT 0 COMMENT '인증기 서명 카운터(복제 탐지)',
    transports              VARCHAR(100) NULL COMMENT '전송 힌트(쉼표 구분, internal·hybrid 등)',
    created_at              DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '등록 일시',
    updated_at              DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '수정 일시',
    last_used_at            DATETIME(6) NULL COMMENT '마지막 본인 확인 성공 일시',
    UNIQUE KEY uk_webauthn_credential_credential_id (credential_id),
    KEY idx_webauthn_credential_member_id (member_id),
    CONSTRAINT fk_webauthn_credential_member FOREIGN KEY (member_id) REFERENCES member(member_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='회원 기기 패스키(결제 전 본인 확인)';
