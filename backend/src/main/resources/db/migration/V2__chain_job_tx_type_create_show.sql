-- ============================================================
-- V2 — chain_job.tx_type ENUM 12종 → 14종 (S15P21B204-67)
--
-- 왜 값을 늘리는가.
--   ① createShow 를 담을 값이 없었다. RevenueSplitter 는 stage 가 CREATED 인 뒤에만
--      deposit·startSale 을 받으므로 createShow 를 보내지 않으면 실체인에서 보증금 tx 가
--      ShowNotFound 로 revert 한다.
--   ② LOCK 하나가 판매 시작(API-rule-04)과 정산 잠금(API-settlement-03) 두 뜻을 겸했다.
--      멱등키 접두(startSale:)로 뜻을 가르던 임시 처방이 확정 분기 버그를 냈다.
--
-- ENUM 값은 뒤에 붙인다. MySQL 은 ENUM 을 내부 정수로 저장하므로 순서를 바꾸면
-- 기존 행의 뜻이 통째로 바뀐다.
-- ============================================================

ALTER TABLE chain_job
    MODIFY COLUMN tx_type
        ENUM('MINT','APPROVE','PURCHASE','REFUND','DEPOSIT','DEPOSIT_RETURN','DEPOSIT_FORFEIT',
             'AGREE','LOCK','AGGREGATE','RELEASE','HALT','CREATE_SHOW','START_SALE')
        NOT NULL COMMENT '작업 유형 14종(MINT=시연용 지급, LOCK=정산 잠금, START_SALE=판매 시작, DEPOSIT_FORFEIT=P1)';

-- 기존 판매 시작 job 이관. 멱등키 접두가 유일한 식별자였다.
UPDATE chain_job
   SET tx_type = 'START_SALE'
 WHERE tx_type = 'LOCK'
   AND idempotency_key LIKE 'startSale:%';
