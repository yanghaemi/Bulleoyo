-- ============================================================
-- V12 — file (업로드 파일) + performance.ticket_image_path
--
-- 무엇을. 공연 포스터·티켓 아트워크 이미지 업로드(POST /api/v1/files)가 쓰는 테이블 하나와,
--   업로드된 티켓 아트워크를 공연에 매어 둘 컬럼 하나를 만든다.
--
-- 왜 테이블이 필요한가. 포스터 업로드 계획 v1 §4는 "file 테이블 없음 · url 직접 반환"이었다.
--   그러면 클라이언트가 만든 임의의 URL을 공연 생성 요청에 그대로 넣을 수 있어 서버가
--   "이 이미지는 이 회원이 올린 것"을 증명할 수단이 없다. 그래서 업로드는 uploadId(추측 불가능한
--   UUID)만 돌려주고, 공연 생성·수정이 그 id를 소유자·용도와 함께 검증해 경로로 바꾼다.
--   (2026-09-22 사용자 결정 — 계획 v1 §4는 이 마이그레이션으로 대체된다.)
--
-- upload_id 를 따로 두는 이유. file_id(AUTO_INCREMENT)를 응답에 실으면 남의 업로드 id를
--   1씩 더해 가며 훑을 수 있다. 소유자 검사가 있어 바인딩은 막히지만, 존재 여부 자체가 새는 것을
--   막으려면 공개 식별자가 추측 불가능해야 한다. CHAR(36)은 UUID 정규 표기 길이다.
--
-- status. TEMP = 업로드만 된 상태(24시간 뒤 행·파일 모두 삭제 대상), BOUND = 공연에 매인 상태.
--   BOUND 는 되돌리지 않는다 — 수정으로 포스터가 교체되면 옛 행은 참조가 끊긴 채 BOUND 로 남고
--   정리 대상이 되지 않는다(롤백·감사 흔적). FileStorageService#bind 주석 참조.
--
-- storage_path 는 UPLOAD_DIR 기준 **상대 경로**다(예: p/202609/{uuid}.jpg). 절대 URL을 넣지
--   않는다 — 도메인이 바뀌면 저장된 값이 전부 깨진다. 공개 URL은 조회 시점에
--   AppProperties#uploadUrl 이 {APP_BASE_URL}/uploads/{상대경로}로 조립한다.
--
-- 인덱스 (status, created_at). 정리 스케줄러가 "TEMP 이면서 created_at < 컷오프"를 주기적으로
--   훑는다. 순서가 반대면 시간 범위 안에서 status 를 다시 평가한다.
--
-- FK 는 RESTRICT — 회원은 물리 삭제하지 않는다(V1 헤더의 FK 정책과 같다).
--
-- performance.ticket_image_path. poster_image_path 와 같은 성격의 두 번째 이미지 경로다
--   (발급 티켓 렌더의 배경 아트워크). nullable 이며 기존 행은 비어 있다. ERD v5 에 없는 컬럼을
--   더하는 것은 V6 end_at · V7 approved_at · V9 accepted_at 과 같은 상황으로, ERD v6 개정 대상이다.
--
-- 되돌리기. DROP TABLE file; ALTER TABLE performance DROP COLUMN ticket_image_path;
--   업로드된 실제 파일은 UPLOAD_DIR 아래에 그대로 남으므로 디스크에서 따로 지워야 한다.
-- ============================================================

CREATE TABLE file (
    file_id          BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '업로드 파일 식별자',
    upload_id        CHAR(36) NOT NULL COMMENT '응답에 나가는 공개 식별자(UUID). PK를 노출하지 않기 위한 값',
    owner_member_id  BIGINT NOT NULL COMMENT '업로더 회원 식별자. 이 회원만 바인딩할 수 있다',
    purpose          ENUM('POSTER','TICKET_ARTWORK') NOT NULL COMMENT '용도. 자리와 다르면 FILE_PURPOSE_MISMATCH',
    status           ENUM('TEMP','BOUND') NOT NULL DEFAULT 'TEMP' COMMENT '상태(TEMP=미참조 24시간 뒤 삭제, BOUND=공연에 매임)',
    storage_path     VARCHAR(500) NOT NULL COMMENT 'UPLOAD_DIR 기준 상대 경로(p/{yyyyMM}/{uuid}.{ext})',
    content_type     VARCHAR(100) COMMENT '파일 시그니처로 판정한 MIME. 클라이언트가 보낸 값이 아니다',
    bytes            BIGINT COMMENT '파일 크기(바이트)',
    width            INT COMMENT '이미지 가로 픽셀',
    height           INT COMMENT '이미지 세로 픽셀',
    created_at       DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '업로드 일시. TEMP 만료 기준',
    bound_at         DATETIME(6) NULL COMMENT '공연에 매인 일시(BOUND 전이 시각)',
    UNIQUE KEY uk_file_upload_id (upload_id),
    KEY idx_file_status_created (status, created_at),
    CONSTRAINT fk_file_member FOREIGN KEY (owner_member_id) REFERENCES member(member_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='업로드 파일';

ALTER TABLE performance
    ADD COLUMN ticket_image_path VARCHAR(500) NULL COMMENT '티켓 아트워크 경로(UPLOAD_DIR 기준 상대 경로)' AFTER poster_image_path;
