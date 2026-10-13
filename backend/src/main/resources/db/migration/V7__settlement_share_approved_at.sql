-- ============================================================
-- V7 — settlement_share.approved_at (정산 조기 동의)
--
-- 무엇을. 참여팀이 "이 분배안에 동의한다"를 누른 시각. 전원(주최팀 포함)이 동의하면
--   48시간 이의제기 기간을 건너뛰고 release 가 열린다(API-settlement-08).
--
-- 왜 새 테이블이 아닌가. settlement_share 가 이미 "정산 × 팀" 한 행이고 released·released_at 을
--   같은 자리에 들고 있다. 동의도 같은 축의 값이라 행이 늘 1:1 로 따라다닌다 — 조인을 하나
--   더 만들 이유가 없다.
--
-- NULL = 미동의. 철회가 없어(사용자 결정) 한 번 채워지면 되돌아가지 않는다. boolean 을 따로
--   두지 않는 이유도 같다 — 시각 하나로 여부와 시점을 둘 다 답한다.
--
-- 타입은 같은 테이블의 released_at 과 같은 DATETIME(6) 이다.
-- ============================================================

ALTER TABLE settlement_share
    ADD COLUMN approved_at DATETIME(6) NULL COMMENT '정산 조기 동의 일시(NULL=미동의, 철회 없음)' AFTER released_at;
