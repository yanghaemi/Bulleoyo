-- ============================================================
-- V3 — chain_job.tx_type ENUM 14종 → 15종 (S15P21B204-70)
--
-- 왜 값을 늘리는가.
--   createShow 가 확정되면 컨트랙트에 rulesHash 가 박힌다. 그 뒤 규칙을 다시 저장하면
--   DB 해시만 바뀌고 온체인은 옛 해시로 남아, 참여팀의 agreeToRules 가 RulesHashMismatch 로
--   revert 하고 startSale 도 열리지 않는다. 되돌릴 수단이 없어 그동안은 재저장 자체를
--   409 로 막았다(MR !77). 이제 RevenueSplitter.updateRules 를 보내 온체인도 같이 바꾼다.
--
-- ENUM 값은 뒤에 붙인다. MySQL 은 ENUM 을 내부 정수로 저장하므로 순서를 바꾸면
-- 기존 행의 뜻이 통째로 바뀐다(V2 가 같은 이유로 그렇게 했다).
-- 데이터 이관 없음 — 종전에 이 뜻으로 쓰이던 값이 없다.
-- ============================================================

ALTER TABLE chain_job
    MODIFY COLUMN tx_type
        ENUM('MINT','APPROVE','PURCHASE','REFUND','DEPOSIT','DEPOSIT_RETURN','DEPOSIT_FORFEIT',
             'AGREE','LOCK','AGGREGATE','RELEASE','HALT','CREATE_SHOW','START_SALE',
             'UPDATE_RULES')
        NOT NULL COMMENT '작업 유형 15종(MINT=시연용 지급, LOCK=정산 잠금, START_SALE=판매 시작, UPDATE_RULES=규칙 재전송, DEPOSIT_FORFEIT=P1)';
