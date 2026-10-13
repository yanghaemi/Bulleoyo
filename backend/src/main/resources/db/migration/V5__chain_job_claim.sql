-- 체인 job claim — 인스턴스가 둘 이상일 때 **같은 job 을 두 번 집지 않게** 한다(S15P21B204-96).
--
-- 버전이 V5 인 이유: !94 가 V4__chain_job_performance_index.sql 을 쓴다. 같은 버전이 둘이면 Flyway 가
-- 기동을 거절한다. 머지 순서는 반드시 !94(V4) → !98(V5) — V5 가 먼저 적용된 DB 에 V4 가 나중에 오면
-- out-of-order: false(application.yml) 라 Flyway 가 기동을 거절한다.
--
-- status 에 PROCESSING 을 더하지 않는 이유: status 는 API-chain-01 폴링이 그대로 보는 값이라
-- 값 하나를 더하면 openapi ChainJob.status · 프론트 생성 타입 · 확정·실패 분기까지 번진다.
-- claim 은 **워커 내부 사정**이지 클라이언트가 볼 상태가 아니다. 그래서 컬럼을 따로 둔다 —
-- PENDING → SUBMITTED 전이는 그대로고 API 응답은 한 글자도 바뀌지 않는다.
--
-- 회수 경로를 따로 만들지 않는다: claimed_at 이 낡으면 다시 집을 수 있다. claim 해 놓고 죽은
-- 인스턴스의 job 이 영영 안 돌아가는 것(S15P21B204-76 과 같은 함정)을 구조로 막는다.
ALTER TABLE chain_job
    ADD COLUMN claimed_by VARCHAR(64) NULL COMMENT '이 job 을 집은 인스턴스(b204.chain.instance-id). NULL=아무도 안 집음' AFTER status,
    ADD COLUMN claimed_at DATETIME(6) NULL COMMENT 'claim 시각. 낡으면 다른 인스턴스가 다시 집는다' AFTER claimed_by;

-- 워커 스캔 인덱스. claim 자체는 PK 조회라 인덱스가 필요 없고, 매 주기(1초) 도는 것은
-- findByStatusAndSignerTypeOrderByChainJobIdAsc(PENDING, OPERATOR) 다 — 등가 두 개 + id 정렬.
-- 종전 (status, claimed_at) 은 어떤 조회도 쓰지 않아 뺐다.
-- !94 V4 의 (target_performance_id, tx_type, status) 와는 선두 컬럼이 달라 겹치지 않는다.
CREATE INDEX idx_chain_job_status_signer ON chain_job (status, signer_type, chain_job_id);
