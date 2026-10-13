-- 리허설 2(S15P21B204-89) 시드 — 시각·권한 조정. 실행 주체: 배포 담당(이강륜).
--
-- 실행하기 전에 읽어라. 값은 그대로 쓰지 말고 아래 "고르는 법"대로 채운 뒤 실행한다.
-- 각 문장을 하나씩 실행하고 영향 행 수를 확인한다(1 이어야 한다).
-- 단, §0 의 SET 과 그 아래 문장은 **같은 접속**이어야 한다(§0 의 ⛔ 참조).
--
-- ============================================================================
-- 왜 SQL 인가 — 여기 있는 것만 API 에 경로가 없다
-- ============================================================================
-- entry_start_at · entry_end_at : 어떤 요청 DTO 에도 없다(PerformanceDtos 전수 확인).
--   PerformanceService 는 이 두 컬럼을 읽기만 한다.
-- member.is_admin              : 관리자 승격 엔드포인트가 없다. 컬럼이 유일한 출처다
--   (MemberService:374 → JwtTokenProvider 의 adm 클레임 → SecurityConfig 의 hasRole('ADMIN')).
--
-- 왜 안전한가 — 이 세 값은 온체인에 올라가지 않는다
-- ============================================================================
-- Splitter.createShow(showId, teamWallets, hostTeamIndex, rulesHash, fixedRatioBp, ...) 에
-- 시각 인자가 없다(ContractOperatorTxBuilder:234-241). 공연 시각·입장 시각·관리자 여부는
-- 서버 DB 에만 있고 컨트랙트가 참조하지 않으므로, 바꿔도 체인과 DB 가 갈리지 않는다.
--
-- ⛔ 반대로 아래는 절대 SQL 로 만들지 않는다 — 체인과 갈린다.
--    performance.status / deposit_status / on_chain_id / contract_address
--    ticket / ticket_order / payment / refund / settlement / settlement_share / chain_job
--    wallet (주소는 온체인 잔액의 주인이다)
--    이 값들은 반드시 API 를 태워 워커가 tx 를 보내고 receipt 로 확정하게 한다.

-- ============================================================================
-- 0. 공연 번호를 여기 한 번만 적는다
-- ============================================================================
-- 2026-09-17 확인: dev 에 공연 5·6 이 없다(공개 목록 totalElements = 0).
-- 대본 A-0 에서 **새로 만든** 공연 두 개의 실제 performance_id 를 아래에 적는다.
--   @perf_a = 공연 A — 환불·공연 취소·QR 검표용(대본이 "공연 5" 라고 부르는 것)
--   @perf_b = 공연 B — 이의제기·release 용(대본이 "공연 6" 이라고 부르는 것)
-- 이 세 줄만 고치면 아래 문장은 손대지 않는다.
SET @perf_a = NULL;        -- ← A-0 에서 만든 공연 A 의 performance_id
SET @perf_b = NULL;        -- ← A-0 에서 만든 공연 B 의 performance_id
SET @admin_member = NULL;  -- ← 관리자로 승격할 member_id
SET @aud_a = NULL;         -- ← 관객 A 의 member_id (0-1 조회용)
SET @aud_b = NULL;         -- ← 관객 B 의 member_id (0-1 조회용)

-- 하나라도 비면 아래 UPDATE 는 0행이다(NULL 비교는 참이 되지 않는다). 그게 안전장치다.
--
-- ⛔ SET 과 아래 문장들을 **같은 접속에서** 실행한다.
--    사용자 변수(@...)는 세션 범위다. DBeaver·DataGrip 의 탭을 옮기거나
--    `mysql -e "..."` 를 문장마다 새로 띄우면 @perf_a 가 다시 NULL 이 되고,
--    그때 UPDATE 는 0행인데 §2 주석의 "상태가 다르면 0행" 과 구분되지 않는다.
--    한 접속에서 위에서 아래로 실행하고, 0행이 나오면 먼저 `SELECT @perf_a;` 로
--    변수가 살아 있는지 확인한다.

-- ============================================================================
-- 0-1. 먼저 읽는다 — 지금 상태
-- ============================================================================
SELECT performance_id, title, status,
       performance_at, entry_start_at, entry_end_at, sale_close_at, cancel_deadline_at,
       deposit_status, on_chain_id
  FROM performance
 WHERE performance_id IN (@perf_a, @perf_b);

SELECT member_id, name, email, is_admin FROM member
 WHERE member_id IN (@aud_a, @aud_b, @admin_member);

-- ============================================================================
-- 1. 관리자 승격
-- ============================================================================
-- is_admin 은 로그인 시점에 access token 의 adm 클레임으로 굳는다(MemberService:374).
-- 이 UPDATE 뒤에 ① 다시 로그인하거나 ② POST /api/v1/auth/refresh 를 한 번 부른다.
-- refresh 는 member 를 DB 에서 다시 읽어 세션을 재발급하므로 새 access token 에 adm=true 가 붙는다.
-- 그 전의 토큰으로 /api/v1/admin/** 를 부르면 COMMON_FORBIDDEN(403) 이다.
UPDATE member SET is_admin = TRUE WHERE member_id = @admin_member;

-- ============================================================================
-- 2. 공연 A(@perf_a) — ON_SALE 을 유지한 채 입장 시간대만 연다 (시나리오 6 + 1 + 2)
-- ============================================================================
-- 요구가 서로 당긴다. 하나의 공연이 동시에 만족해야 하는 것:
--   (a) status = ON_SALE 이 유지될 것
--       → PerformanceService.sweepStatusTransitions 가 60초마다
--         sale_close_at <= now 인 ON_SALE 을 SALE_CLOSED 로 내린다. sale_close_at 이 미래여야 한다.
--   (b) 시나리오 1 개별 환불이 통과할 것
--       → RefundService.quote 가 now < cancel_deadline_at 을 요구한다.
--         cancel_deadline_at 이 비어 있으면 PerformanceService.cancelDeadlineOf =
--         공연일 D-3 의 00:00 으로 계산된다. 즉 공연일이 최소 모레보다 뒤여야 한다.
--   (c) 시나리오 6 검표가 통과할 것
--       → EntryService.verify 가 EntryWindows.isOpen 을 요구한다.
--         opensAt = entry_start_at 이 있으면 그 값, 없으면 performance_at - 1h
--         closesAt = entry_end_at 이 있으면 그 값, 없으면 performance_at + 3h (D-41)
--         EntryService 는 performance.status 를 보지 않는다 — 시간대만 본다.
--
-- (a)(b) 는 공연일을 미래로 밀어야 하고 (c) 는 입장 시각이 지금이어야 한다.
-- entry_start_at 을 명시로 채우면 둘이 충돌하지 않는다 — 이 UPDATE 하나가 그 유일한 지렛대다.
--
-- 고르는 법: performance_at = 오늘 + 4일 이상(D-3 00:00 이 확실히 미래가 되게).
--            sale_close_at  = performance_at 보다 앞이되 지금보다 뒤.
--            entry_start_at = 지금보다 1시간 전.
--            entry_end_at   = NULL 로 두면 performance_at + 3h 라 충분히 미래다. 건드리지 않는다.
-- cancel_deadline_at 은 코드와 같은 식으로 직접 채운다(= 공연일 D-3 의 00:00).
--   비워 두면 환불 판정은 같은 값으로 계산되지만 공개 조회 응답의 cancelDeadlineAt 이 null 이 되어
--   화면에서 마감이 사라진다. 값과 계산을 일치시켜 둔다.
UPDATE performance
   SET performance_at  = DATE_ADD(NOW(6), INTERVAL 5 DAY),
       sale_close_at   = DATE_ADD(NOW(6), INTERVAL 4 DAY),
       cancel_deadline_at = DATE_SUB(DATE(DATE_ADD(NOW(6), INTERVAL 5 DAY)), INTERVAL 3 DAY),
       entry_start_at  = DATE_SUB(NOW(6), INTERVAL 1 HOUR),
       entry_end_at    = NULL                   -- performance_at + 3h 로 추정된다(D-41)
 WHERE performance_id = @perf_a
   AND status = 'ON_SALE';                      -- 상태가 다르면 0행이다. 그러면 멈추고 대본 A-2 로

-- ============================================================================
-- 3. 공연 B(@perf_b) — ENDED 로 내려보낸다 (시나리오 3)
-- ============================================================================
-- D-41 확인: 종료 판정은 PerformanceService.sweepStatusTransitions 두 번째 루프다.
--   SALE_CLOSED 이고 performance_at <= now 인 공연 중,
--   now >= EntryWindows.closesAt(= entry_end_at, 없으면 performance_at + 3h) 인 것만 ENDED.
-- 그래서 performance_at 만 과거로 밀면 부족하다 — 3시간을 더 빼거나 entry_end_at 을 명시해야 한다.
-- 아래는 entry_end_at 을 명시하는 쪽이다(추정에 기대지 않는다).
--
-- ⚠️ status 는 직접 쓰지 않는다. 60초 주기 스윕이 ON_SALE → SALE_CLOSED → ENDED 를 태우게 두고,
--    ./rehearse.sh show <@perf_b> 로 ENDED 를 눈으로 확인한 뒤 다음 단계로 간다.
--    한 번의 스윕이 두 전이를 모두 태운다(첫 루프의 벌크 UPDATE 가 바로 DB 에 나가므로
--    같은 실행의 두 번째 루프가 방금 마감한 공연을 집는다 — 소스 주석 1289행).
--    즉 최대 약 60초면 ENDED 가 된다.
UPDATE performance
   SET performance_at = DATE_SUB(NOW(6), INTERVAL 6 HOUR),
       sale_close_at  = DATE_SUB(NOW(6), INTERVAL 7 HOUR),
       entry_end_at   = DATE_SUB(NOW(6), INTERVAL 3 HOUR)
 WHERE performance_id = @perf_b
   AND status IN ('ON_SALE', 'SALE_CLOSED');    -- 이미 ENDED 면 0행이다(정상). CANCELLED 면 못 쓴다

-- ============================================================================
-- 4. 다시 읽어 확인한다
-- ============================================================================
SELECT performance_id, status, performance_at, entry_start_at, entry_end_at,
       sale_close_at, cancel_deadline_at
  FROM performance WHERE performance_id IN (@perf_a, @perf_b);
