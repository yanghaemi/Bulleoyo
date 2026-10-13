-- ============================================================
-- V6 — performance.end_at (공연 종료 일시 저장 컬럼)
--
-- 무엇을. API-performance-01·04 가 받던 endAt 을 실제로 저장한다.
--
-- 왜. 지금까지 end_at 컬럼이 없어 생성 요청의 endAt 은 "startAt 보다 뒤인가" 검증에만 쓰이고
--   버려졌고, 상세 조회(API-performance-03)는 endAt 을 항상 null 로 내려보냈다. 그 결과 P-03
--   공연 수정 화면이 필수 값 누락으로 판단해 폼을 아예 열지 못했다.
--
-- NULL 을 허용하고 기존 행을 백필하지 않는 이유. ERD v5 에 아직 end_at 이 없어 코드가 명세보다
--   먼저 나간다. 기존 행에는 진짜 종료 시각이 없고, 임의로 채우면 "서버가 추정한 값"과
--   "주최자가 입력한 값"을 구분할 수 없게 된다. 비어 있는 동안은 응답이 EntryWindows.closesAt
--   (entry_end_at, 비면 performance_at + b204.entry.default-duration)으로 폴백한다.
--
-- ENDED 자동 전이·검표 링크 만료는 이번에 바꾸지 않는다. 그쪽은 계속 EntryWindows.closesAt 을
--   쓴다 — 기존 행이 비어 있는 채로 기준 시각만 바꾸면 전이 시점이 공연마다 달라진다.
--   API v6 §4 가 endAt 을 "ENDED 전이 기준"으로 적고 있어 백필·문서 개정 뒤 별도로 다룬다.
--
-- 타입은 V1 의 performance_at·entry_end_at·sale_close_at 과 같은 DATETIME(6) 이다.
-- ============================================================

ALTER TABLE performance
    ADD COLUMN end_at DATETIME(6) NULL COMMENT '공연 종료 일시(NULL=미입력, 응답은 입장 종료 추정으로 폴백)' AFTER performance_at;
