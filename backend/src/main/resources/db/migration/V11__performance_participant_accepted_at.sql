-- ============================================================
-- V11 — performance_participant.accepted_at (참여 수락 시각)
--
-- 무엇을. 초대받은 팀이 참여를 수락한 시각. API-performance-16(공연 참여팀 조회)이
--   invitedAt(= registered_at)과 함께 acceptedAt 을 내려야 하는데 담을 컬럼이 없었다.
--
-- 판정에는 쓰지 않는다. participationStatus(INVITED/ACCEPTED)의 파생 근거는 그대로
--   wallet_address 유무다(PerformanceParticipant#participationStatus). 여기에 두 번째 진실을
--   만들면 두 값이 갈렸을 때 어느 쪽이 맞는지 답할 근거가 없다. accepted_at 은 표시용 시각이다.
--
-- 재스냅샷(snapshotWallet — startSale 직전 리더 지갑 재확인)은 이 컬럼을 건드리지 않는다.
--   주소를 다시 굳히는 것은 수락이 아니다.
--
-- 백필. 이미 wallet_address 가 있는 행은 수락을 마친 행이다. 그 시각을 알 수 있는 기록이
--   어디에도 없으므로 registered_at(초대 시각)으로 채운다 — 실제 수락 시각이 아니라 하한이다.
--   화면은 "언제 수락했는지"를 대략적으로만 쓰고, 정산·잠금 판정은 이 값을 읽지 않는다.
--
-- 타입은 같은 테이블 registered_at 과 같은 DATETIME(6).
-- ============================================================

ALTER TABLE performance_participant
    ADD COLUMN accepted_at DATETIME(6) NULL COMMENT '참여 수락 일시(표시용. 판정은 wallet_address 유무)' AFTER registered_at;

-- 정확한 수락 시각을 알 수 없다 — 초대 시각으로 대신한다(위 주석 참조).
UPDATE performance_participant
   SET accepted_at = registered_at
 WHERE wallet_address IS NOT NULL
   AND accepted_at IS NULL;
