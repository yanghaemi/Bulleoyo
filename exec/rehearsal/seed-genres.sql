-- ============================================================
-- seed-genres.sql — 추천 시연용 팀 장르·선호 장르 지정 (2026-09-23)
--
-- 왜 필요한가. dev 의 팀 7개가 전부 genre NULL 이고, 마이그레이션 V13(추천) 이
--   `UPDATE team SET genre = 'ETC'` 로 조건 없이 전 행을 덮는다. 그래서 배포 뒤에는
--   모든 팀이 ETC 다. 추천은 "선호 장르 ∩ 공연 장르" 매칭이라, 전부 ETC 면 ETC 를
--   고른 회원에게만 걸리고 나머지는 전부 폴백으로 떨어진다.
--
-- ⚠ 반드시 V13 적용(= !192 배포) **뒤에** 실행한다. 먼저 넣으면 V13 의 UPDATE 가
--   지운다. 아래 0단계가 그것을 검사한다.
--
-- 실행:
--   scp exec/rehearsal/seed-genres.sql j15b204:/tmp/
--   ssh j15b204 'docker cp /tmp/seed-genres.sql b204-mysql:/tmp/ && \
--     docker exec b204-mysql sh -c "mysql -uroot -p\$MYSQL_ROOT_PASSWORD \
--     --default-character-set=utf8mb4 -t b204 < /tmp/seed-genres.sql"'
--
-- 되돌리기: 팀 장르는 `UPDATE team SET genre='ETC';`, 선호는 5단계 DELETE 만 실행.
-- ============================================================

-- ------------------------------------------------------------ 0) 전제 확인
-- V13(추천)이 적용됐는지. 결과가 0 행이면 여기서 멈추고 배포를 먼저 한다.
SELECT version, description, installed_on
FROM flyway_schema_history
WHERE version = '13' AND description = 'recommendation' AND success = 1;

-- 지금 상태 (실행 전 기록용)
SELECT team_id, name, genre FROM team ORDER BY team_id;

-- ------------------------------------------------------------ 1) 팀 장르
-- 판매 중 공연 6개가 전부 team 8(B204) 생성이다. 8 의 장르가 곧 그 6개의 장르다.
-- INDIE 로 둔 이유 — 서비스가 인디 공연 단일 도메인이고(D-D2), 시연 관객이 고를
-- 장르로 가장 자연스럽다. 공연 #58 만 team 6 이 참여해 INDIE ∪ ROCK 두 장르가 된다.
UPDATE team SET genre = 'INDIE'    WHERE team_id = 8;   -- B204 (판매 중 6개 생성)
UPDATE team SET genre = 'ROCK'     WHERE team_id = 6;   -- 2차리허설 (#58 공동 참여)
UPDATE team SET genre = 'JAZZ'     WHERE team_id = 5;   -- 햄밴드
UPDATE team SET genre = 'ACOUSTIC' WHERE team_id = 7;   -- 강륜밴드
UPDATE team SET genre = 'POP'      WHERE team_id = 9;   -- 연경잉
UPDATE team SET genre = 'ROCK'     WHERE team_id = 1;   -- 리허설밴드
UPDATE team SET genre = 'ETC'      WHERE team_id = 10;  -- test (그대로)

-- ------------------------------------------------------------ 2) 결과 확인
SELECT team_id, name, genre FROM team ORDER BY team_id;

-- ------------------------------------------------------------ 3) 공연별 장르 (조인 파생)
-- 추천이 실제로 무엇과 매칭되는지. performance 에는 장르 컬럼이 없고
-- 생성 팀 + REGISTERED 참여 팀의 장르 합집합이다(설계 §4.1).
SELECT p.performance_id, p.title, p.status,
       GROUP_CONCAT(DISTINCT g.genre ORDER BY g.genre) AS performance_genres
FROM performance p
LEFT JOIN (
    SELECT p2.performance_id, t.genre FROM performance p2 JOIN team t ON t.team_id = p2.creator_team_id
    UNION
    SELECT pp.performance_id, t.genre FROM performance_participant pp JOIN team t ON t.team_id = pp.team_id
    WHERE pp.status = 'REGISTERED'
) g ON g.performance_id = p.performance_id
WHERE p.status = 'ON_SALE'
GROUP BY p.performance_id
ORDER BY p.performance_id;

-- ------------------------------------------------------------ 4) 시연 회원 선호 장르
-- 화면(C-02·C-04)에서 직접 고르는 것이 정상 경로다. 아래는 화면 배포(!193) 전에
-- 백엔드만으로 추천을 확인하거나, 시연 직전 계정을 미리 맞출 때만 쓴다.
-- 회원당 최대 3행(설계 §4.2). 있으면 지우고 다시 넣는다 = API 의 전체 교체와 같다.

-- 이강륜(7) — 매칭되는 회원. INDIE 가 판매 중 6개에 걸린다.
DELETE FROM member_preferred_genre WHERE member_id = 7;
INSERT INTO member_preferred_genre (member_id, genre) VALUES (7, 'INDIE'), (7, 'ROCK');

-- 리허설관객(4) — 폴백을 보여줄 회원. 선호를 비워 둔다(0행 = 건너뛴 상태).
DELETE FROM member_preferred_genre WHERE member_id = 4;

-- 양해미(8) — 겹침 0건이라 역시 폴백으로 떨어진다.
DELETE FROM member_preferred_genre WHERE member_id = 8;
INSERT INTO member_preferred_genre (member_id, genre) VALUES (8, 'CLASSICAL');

SELECT m.member_id, m.name,
       IFNULL(GROUP_CONCAT(pg.genre ORDER BY pg.genre), '(없음)') AS preferred
FROM member m
LEFT JOIN member_preferred_genre pg ON pg.member_id = m.member_id
WHERE m.member_id IN (4, 7, 8)
GROUP BY m.member_id ORDER BY m.member_id;

-- ------------------------------------------------------------ 5) 되돌리기 (필요할 때만)
-- DELETE FROM member_preferred_genre WHERE member_id IN (4, 7, 8);
-- UPDATE team SET genre = 'ETC';

-- ------------------------------------------------------------ 6) 노출 로그 확인
-- 추천을 한 번 호출한 뒤 basis 가 카드 단위로 기록되는지 본다.
-- 폴백으로 채운 카드는 FALLBACK 이어야 한다(설계 §4.3).
SELECT session_id, position, basis, performance_id, genre_overlap, pref_count, served_at
FROM recommendation_log ORDER BY recommendation_log_id DESC LIMIT 12;

-- basis 별 24시간 전환율 (설계 §10). 노출이 쌓이기 전에는 0 행이다.
SELECT l.basis,
       COUNT(*) AS impressions,
       SUM(CASE WHEN o.ticket_order_id IS NOT NULL THEN 1 ELSE 0 END) AS conversions
FROM recommendation_log l
LEFT JOIN ticket_order o
       ON o.member_id = l.member_id AND o.performance_id = l.performance_id
      AND o.status = 'PAID' AND o.confirmed_at BETWEEN l.served_at AND l.served_at + INTERVAL 24 HOUR
GROUP BY l.basis;
