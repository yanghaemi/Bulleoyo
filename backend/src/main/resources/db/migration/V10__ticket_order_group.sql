-- ============================================================
-- V10 — ticket_order.order_group_id (표별 응원 팀 배분 = 주문 그룹)
--
-- 무엇을. ticket_order 한 행이 이제 **팀 하나·orderRef 하나·purchase tx 하나**를 뜻하는
--   하위 주문이고, order_group_id 가 결제 한 번에 묶이는 하위 주문들의 대표(= 첫 하위 주문)
--   ticket_order_id 를 가리킨다(자기참조). 단독 주문도 그룹 크기 1이라 자기 자신을 가리킨다.
--
-- 왜 새 테이블이 아닌가. 그룹은 "주문들의 묶음"일 뿐 자기 속성이 없다. 테이블을 하나 더 두면
--   행이 항상 1:N 으로 따라다니는 조인이 하나 늘 뿐이다. 그룹 조회는
--   WHERE order_group_id = :groupId 한 줄이다.
--
-- 왜 NOT NULL 이 아닌가. PK 가 AUTO_INCREMENT 라 대표 주문은 INSERT 시점에 자기 id 를 모르고,
--   InnoDB 에 지연 FK 가 없어 NOT NULL 을 걸면 그룹의 첫 행을 아예 넣을 수 없다. 대표 주문은
--   INSERT 후 같은 트랜잭션에서 자기 id 로 UPDATE 한다 — "커밋된 행에 NULL 이 없다"는 DB 제약이
--   아니라 앱 불변식이다(ERD v5 §ticket_order).
--
-- 컨트랙트는 바뀌지 않는다. purchase(showId, orderRef, teamIndex, amount, quantity)는 여전히
--   orderRef 1개 = 팀 1개다.
--
-- FK 가 1개 늘어난다 — FlywayMigrationTest.ERD_FK_COUNT 43 -> 44.
-- ============================================================

ALTER TABLE ticket_order
    ADD COLUMN order_group_id BIGINT NULL COMMENT '주문 그룹 대표(첫 하위 주문) 식별자' AFTER member_id;

-- 기존 행은 전부 그룹 크기 1이다.
UPDATE ticket_order SET order_group_id = ticket_order_id WHERE order_group_id IS NULL;

ALTER TABLE ticket_order
    ADD CONSTRAINT fk_ticket_order_group FOREIGN KEY (order_group_id)
        REFERENCES ticket_order(ticket_order_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE ticket_order
    ADD INDEX idx_ticket_order_group (order_group_id);

-- 옛 주문의 selected_team_id 를 생성팀으로 채운다.
--
-- 왜. 옛 코드는 단독 공연에서 팀 없이 주문을 만들었다(selected_team_id IS NULL). v6.2 부터는
--   단독 공연도 서버가 생성팀으로 채우므로(API 명세 §API-ticket-01 "단독 공연은 생략하고
--   서버가 공연 생성팀으로 채운다"), 백필하지 않으면 같은 공연 안에서 옛 주문만 팀이 없다.
--   그 표는 온체인에서 이미 teamIndex 0(= 생성팀)으로 세어져 있는데 서버 집계가
--   `selectedTeam is not null` 로 걸러 버려(SettlementTicketRepository · VerifyOrderRepository ·
--   VerifyRefundRepository) choiceCount 와 어긋나고 정산이 SETTLEMENT_AGGREGATE_MISMATCH 로
--   멈춘다. 결제 대기 중이던 옛 주문은 purchaseSlots 가 팀을 못 찾아 결제 자체가 불가능해진다.
--
-- 생성팀은 언제나 참여팀 1번이고 온체인 teamIndex 0 이라(§1471) 값이 지어내는 값이 아니다.
UPDATE ticket_order o
    JOIN performance p ON p.performance_id = o.performance_id
   SET o.selected_team_id = p.creator_team_id
 WHERE o.selected_team_id IS NULL;
