# 추천 기능 설계 v1 — 콜드스타트 장르 매칭 · 임베딩 · CTR 랭커 · ML 서버 (2026-09-22)

상태: 설계 확정 대기(사용자 검토 전). 정본은 이 문서이며, 명세 개정(API v7·ERD v6·화면 v8·요구/기능 v7)은 이 문서를 근거로 한다. 실험 기록은 `docs/ml/RECOMMENDATION_EXPERIMENTS.md`에 누적한다.

## 0. 요약

회원 가입 직후 선호 장르를 받아(콜드스타트) 판매 중 공연을 추천한다. 세 단계를 전부 발표(2026-09-28) 주 안에 끝낸다(사용자 결정 9/22). 순서는 1차 SQL 매칭 → 2차 임베딩·LLM 태깅 → 3차 CTR 랭커이며, 3차는 실데이터가 부족하므로 합성 로그 + 실제 로그로 파이프라인 검증까지다. 새 온라인 인프라 없음. ML 서버는 별도 노트북(RTX 4050 Laptop 6GB)이고 요청 경로 밖에서만 돈다.

## 1. 배경·목표

- 문제: 신규 회원·신규 공연 모두 이력이 없다(사용자·아이템 콜드스타트). 팀 5명, 발표 6일 전, 회원 수십 명·공연 수십 건 규모. 협업 필터링은 학습 불가.
- 목표 3개: (1) 로그인 회원 홈에 개인화 섹션 1개, (2) 신규 공연도 첫날부터 추천 가능, (3) 추천 방식별 효과를 측정할 수 있는 로그.

## 2. 현재 상태(조사 결과)

- `team.genre` VARCHAR(50) 자유 입력, API-team-01은 20자 문자열. 화면 P-02 팀 폼에는 장르 입력란이 없다(`frontend/src/features/studio/teamForm.ts` 주석). 즉 장르 데이터가 사실상 없다.
- `performance`에 장르 컬럼 없음. `member`에 선호 정보 없음.
- 온보딩 흐름: C-01 로그인 → C-05 지갑 등록 → C-02(국가·언어·통화·시간대 1회 확인 폼, `PATCH /members/me`) → 홈. C-02가 선호 장르를 받을 자리다.
- 화면 v7 A-01 결정 D-D2 "장르 카테고리 내비를 두지 않는다"는 유지한다. 추천 섹션은 내비가 아닌 개인화 섹션이며, 빈 결과는 섹션을 감추는 기존 규칙을 따른다.
- API v6 §14는 양도 삭제로 결번. recommendation 장을 §14에 둔다(목차 이동 없음). §0.11 도메인 13 → 14.
- 컨벤션 §3.1 도메인 목록에 `recommendation` 추가, 파트에 `ml` 추가 예정(브랜치 `feat/ml/{도메인}`).

## 3. 단계 정의와 진입 조건

| 단계 | 내용 | 진입 조건 | 시점 |
|---|---|---|---|
| 1차 장르 SQL | 선호 장르 ∩ 공연 장르(생성팀+참여팀) 매칭, 폴백, 노출 로그 | 없음 | 9/23~9/25 |
| 2차 LLM 태깅 | LLM이 공연 소개에서 장르·분위기·키워드 추출, 공연 장르 = 팀 장르 ∪ 태그 장르로 1차 매칭 보강, 추천 사유 문장 | ML 서버 가동(9/24) | 9/25~9/26 |
| 3차 CTR 랭커 | 노출 로그로 XGBoost 학습, 후보 재정렬 | 이번 주는 합성 로그 + 실제 로그(1만 행 조건은 실데이터 재학습 시점으로 이월) | 9/27 |

## 4. 데이터 설계

### 4.1 장르 코드 10종

`ROCK, INDIE, POP, HIPHOP, RNB, JAZZ, ELECTRONIC, ACOUSTIC, CLASSICAL, ETC`. 코드는 영문 enum, 라벨은 §0.6 Accept-Language(en/ko). DB는 기존 `team.genre` VARCHAR 유지 + 앱 enum 검증(Flyway ENUM validate 함정 회피). 마이그레이션에서 기존 자유 입력은 `ETC`로 이관. 팀 장르는 단일·필수. 공연 장르 = 생성 팀 + `performance_participant.status=REGISTERED`이면서 지갑 등록을 수락한 팀 장르 합집합(컬럼 없음, 조인 파생) — 초대만 받고 미수락인 팀은 제외한다(정정 2026-09-28, 카드 `teamNames`와 같은 팀 집합을 보이려는 의도).

### 4.2 `member_preferred_genre`

컬럼: member_id BIGINT FK, genre VARCHAR(20), created_at. PK(member_id, genre). 회원당 1~3행. 선택 안 함 = 0행.

### 4.3 `recommendation_log` — 서빙 로그이자 학습 데이터 계약

컬럼: recommendation_log_id PK, member_id, performance_id, session_id(요청 1건 = 세션 1개, UUID), position(1~6), basis ENUM('GENRE','TAGGED','RANKED','FALLBACK'), served_at, 그리고 서빙 시점 피처 스냅샷: genre_overlap TINYINT, pref_count TINYINT, min_price BIGINT, days_until SMALLINT, weekday TINYINT, n_teams TINYINT, is_joint BOOL, sold_ratio DECIMAL(4,3), past_orders SMALLINT.

정답 라벨은 저장하지 않고 조회 시 `ticket_order`(status=PAID, served_at 후 24시간 내, 같은 member·performance)와 조인해 만든다. 피처 이름은 `ml/ctr/synth.py`의 FEATURES와 동일해야 한다(계약).

인덱스: (member_id, served_at), (performance_id, served_at), (session_id). **basis 는 행(카드) 단위** — 응답 `data.basis` 를 복사하지 않는다(matchedGenres 가 빈 카드는 FALLBACK). 응답 basis 는 응답 단위라 그대로 쓰면 폴백 카드가 GENRE 로 남아 D-R06 위장이 로그에서 생긴다(MR !186 리뷰).

### 4.4 2차 컬럼(V12)

`performance.tags JSON`(LLM 추출 태그: genres·mood·keywords), `performance.embedding JSON`·`performance.embedding_model VARCHAR(50)`은 "비슷한 공연"(A-02 하단, 이번 주 범위 밖) 용도로만 예약. 회원 벡터는 두지 않는다(E-03). `ml_job` 테이블: job_id, type ENUM('TAG','EMBED','REASON'), target_id, status ENUM('PENDING','RUNNING','DONE','FAILED'), attempts, payload JSON, result JSON, created_at, updated_at. `chain_job` 워커 패턴과 같은 모양.

### 4.5 마이그레이션

V11: team.genre 이관 + member_preferred_genre + recommendation_log. V12(2차): 4.4.

> **번호 정정(2026-09-23)** — 처음엔 V8·V9 로 잡았으나 머지 전에 develop 이 `V8__performance_media`·`V10__ticket_order_group` 을 먼저 넣었고, dev DB 에 V10 까지 적용됐다. `spring.flyway.out-of-order: false` 라 **적용된 최고 버전(V10)보다 낮은 번호는 영영 못 쓴다**(V9 는 결번). 그래서 V11·V12 다. 구현 브랜치가 번호를 잡을 때는 파일명이 아니라 `flyway_schema_history` 의 최고 버전을 먼저 본다.

## 5. API 변경(API v7 근거)

- §0.11 도메인 14개, §14 recommendation.
- **recommendation-01** `GET /api/v1/recommendations/performances` · 권한 회원 · 우선 P0(1차). Query 없음. 응답 `data.basis`(GENRE|TAGGED|RANKED|FALLBACK), `data.sessionId`, `data.items[]`는 API-performance-02 항목 형태 + `matchedGenres: string[]` + `reason: string|null`(2차 전엔 항상 null). 최대 6건. 400/401/429는 공통. GUEST는 401.
- **member-05/06** `preferredGenres: string[]`(0~3개, enum 검증, 중복 불가). 06은 전체 교체 의미.
- **team-01/04** `genre` enum 필수(01), 04는 선택.
- §0.12 Redis 키 추가 없음(1차에서 캐시 안 씀. 근거 §9).

## 6. 화면 변경(화면 v8 근거)

- C-02: 국가·언어·통화·시간대 아래 "좋아하는 장르" 칩 다중 선택(최대 3), 건너뛰기 허용. `Continue`가 `PATCH /members/me`에 preferredGenres 포함.
- C-04: "선호 장르" 행 추가, 같은 칩 UI로 수정.
- P-02: 팀 생성·수정 폼에 장르 셀렉트(필수).
- A-01: 섹션 ④ `For you` / "맞춤 추천"을 판매 중 섹션 위에. 로그인 회원만. 별도 요청(다른 섹션과 분리). 빈 결과·GUEST·에러는 섹션 숨김. 카드 항목은 §1.6 고정표 그대로, `reason`이 있으면 카드 아래 한 줄(없으면 생략). D-D2 유지.

## 7. 추천 알고리즘

### 7.1 1차 규칙

후보 = ON_SALE 공연 − 회원이 PAID 주문한 공연. 점수 = 겹침 수 내림차순, 공연일 오름차순. 상위 6. 선호 0개 또는 결과 0건이면 폴백(곧 시작하는 ON_SALE 순, basis=FALLBACK). 6건 미만이면 폴백으로 채우되 basis는 GENRE 유지(항목별 matchedGenres가 비면 폴백 항목).

### 7.2 2차 LLM 태깅 **[E-03으로 개정 9/22]**

공연 생성·수정 시 `ml_job(TAG)`가 소개·팀 소개를 LLM에 보내 `tags{genres, mood, keywords}`를 얻는다. 공연 장르 = 생성 팀·참여 팀 장르 ∪ `tags.genres`. 1차 SQL 매칭이 이 합집합을 쓰며, 팀 장르만으로 겹친 항목은 `basis=GENRE`, 태그 장르 덕에 겹친 항목은 `basis=TAGGED`로 기록해 전환율을 비교한다. 추천 사유(`reason`)는 `ml_job(REASON)`이 (선호 장르 조합, performance_id) 단위로 생성해 캐시한다.

임베딩 코사인으로 홈 추천을 만드는 원안은 폐기한다. E-03에서 bge-m3 공연 문서 벡터가 장르를 전혀 구분하지 못했다(같은 장르 쌍 0.506 vs 다른 장르 쌍 0.525, 최근접 이웃 적중 0/10). 임베딩은 "이 공연과 비슷한 공연"(분위기·성격 유사) 섹션 용도로만 남기며 이번 주 범위 밖이다.

### 7.3 3차 랭커

1차(태그 보강) 후보 상위 30건을 XGBoost 클릭 예측기로 재정렬, basis=RANKED. 피처 = 4.3 스냅샷 컬럼 + position 제외. 학습 분할은 회원 단위(GroupShuffleSplit). 모델은 EC2 Spring 프로세스 안에서 xgboost4j로 로드(HTTP 홉 없음). 라이브러리 선택 근거는 실험 E-01: LightGBM과 품질 동일, 학습 4배 느리지만 우리 규모에서 5초 이하, Java 인프로세스 서빙이 결정 요인.

### 7.4 제외·안전 규칙

취소·마감 공연 제외, 본인 팀 공연 제외 여부는 미정. 추천 결과는 결제·발권 상태와 어떤 의존도 없다.

## 8. ML 서버 아키텍처(2차·3차)

- 하드웨어: 별도 노트북. RTX 4050 Laptop, 전용 VRAM 6GB, 공유 18GB(시스템 RAM 경유, 사용 시 5~10배 느려 사실상 미사용), NPU 있음(미사용). WSL2.
- 런타임: Ollama 단일 프로세스. LLM Qwen3 4B Q4_K_M(기본), EXAONE 3.5 2.4B(한국어 비교 후보, E-02로 결정). 임베딩 bge-m3(fp16 ≈ 1.1GB, "비슷한 공연" 예약). 합계 약 4GB로 6GB 안. 실측(9/22): qwen3:4b 3.2GB + bge-m3 0.66GB 상주 시 VRAM 3.6GB, EXAONE까지 3개면 5.3GB로 모델 교체(evict)가 일어나므로 비교 후 EXAONE은 내린다. 8B 4비트는 KV 캐시 포함 6GB 초과로 제외.
- 설정: `keep_alive=-1`(상주), `num_ctx=2048`, 태깅 `max_tokens=80` JSON 스키마 강제, 사유 40자 제한.
- 구성: FastAPI(태깅·임베딩·사유 엔드포인트) + MLflow(실험·모델 기록, sqlite 백엔드, 데스크톱·EC2 학습 잡이 Tailscale 주소로 기록). EC2 Spring ↔ 노트북은 Tailscale. 상시 전원·절전 해제 필요.
- 경계: Spring은 요청 경로에서 ML 서버를 호출하지 않는다. 태깅·임베딩·사유는 `ml_job`으로 비동기. 호출 타임아웃 3초, 실패 시 태그·사유·벡터 없이 1차 SQL로 폴백. 서버 다운 시 잡만 쌓이고 서비스 영향 없음.
- 랭커는 노트북이 아닌 EC2 인프로세스(GPU 불필요, 온라인 의존 제거).
- NPU 제외 근거: WSL2 통과 불가, Intel/AMD 툴체인 별도.
- 사유 캐시 키: (선호 장르 조합, performance_id). 회원별이 아님.

## 9. 성능 예산

온라인(목표 p95 500ms, PERF-01):

| 구간 | 예상 |
|---|---|
| 선호 조회 | 1ms |
| 후보 조인 | 5~10ms |
| 코사인(앱 메모리, 수십 건) | <1ms |
| 랭커 인프로세스 | <1ms |
| 노출 로그 INSERT(@Async, 응답 밖) | 0ms |
| 합계 | 약 20ms |

오프라인(4050 예상):

| 작업 | 예상 |
|---|---|
| 태깅 | 2~3초/건 |
| 임베딩 | 30~50ms/건 |
| 회원 벡터 | 30ms |
| 사유 6건 배치 | 약 10초 |

정책: 공연 벡터는 앱 기동 시 메모리 로드·저장 시 갱신. Redis 캐시 안 씀(5분 정체 부작용, 병목 확인 후 도입). GPU 직렬이므로 잡 순차 처리, 태깅+임베딩 한 잡. 홈에서 추천 섹션은 별도 요청·스켈레톤.

실측은 `docs/ml/RECOMMENDATION_EXPERIMENTS.md`의 E-04·E-05로 기록한다.

## 10. 평가

- 오프라인: AUC, logloss, NDCG@6(세션 단위). 분할은 회원 단위. 기준선은 1차 규칙 정렬.
- 온라인: basis별 전환율 = 노출 ∩ 24h 내 PAID 주문 / 노출. 쿼리 1개. A/B 플랫폼 대체. **노출은 (member, performance, 1시간) 단위로 중복 제거해 센다** — 창 포커스 복귀 재조회 등으로 같은 카드가 새 sessionId 로 여러 번 기록돼 분모가 부푸는 것을 막는다(FE 도 A-01 추천 쿼리 재조회를 막는다, 화면 v8 A-01).
- 합성 데이터(`ml/ctr/synth.py`)는 파이프라인 검증용이며 모델 품질 근거로 쓰지 않는다. 실데이터 전환 시 생성기만 `recommendation_log ⋈ ticket_order` 조회로 교체.
- 정량 결과는 MLflow run에 기록하고(실험명 `ctr-ranker`, 파라미터·메트릭·모델 파일), 해석·한계·결정은 `docs/ml/RECOMMENDATION_EXPERIMENTS.md`에 쓴다. 지금은 `ml/ctr/mlruns/` 로컬 파일 스토어(gitignore), ML 서버가 서면 sqlite 백엔드 `mlflow server`로 옮기고 `MLFLOW_TRACKING_URI`만 바꾼다. E-04 p95·E-07 전환율은 학습이 아니므로 MLflow에 넣지 않고 문서 표로만 남긴다.

## 11. 하지 않는 것

협업 필터링, LLM 인라인 재랭킹, 실시간 학습, 장르 내비·필터, 공연별 장르 컬럼, 벡터 DB, Spring AI 등 프레임워크(RestClient + 코사인 몇 줄), 클릭 수집 엔드포인트(서빙 시점 노출 기록으로 대체), Jenkins 크론(공연 저장 동기 + @Scheduled), NPU.

## 12. 결정 목록

| 번호 | 결정 | 대안 | 근거 |
|---|---|---|---|
| D-R01 | 장르 코드는 VARCHAR + 앱 enum 검증 | DB ENUM 타입 | Flyway ENUM validate 함정 회피 |
| D-R02 | 팀 장르는 단일·필수 | 다중 선택 | 매칭·집계 단순화, MVP 범위 |
| D-R03 | 선호 장르는 별도 테이블 | member에 컬럼 3개 | 0~3개 가변 개수 표현 |
| D-R04 | 선호 장르 입력은 C-02에 얹는다 | 새 온보딩 화면 신설 | 화면 추가 없이 기존 1회 확인 폼 재사용 |
| D-R05 | recommendation 장은 §14 재사용 | 새 번호로 목차 재배치 | 양도 삭제로 결번된 자리, 문서 diff 최소화 |
| D-R06 | 폴백 결과도 basis로 노출 표시 | 폴백을 GENRE로 위장 | 로그 정직성, 평가 지표 왜곡 방지 |
| D-R07 | 전환율은 노출 로그 조인으로 계산, 별도 클릭 엔드포인트 없음 | 클릭 수집 API 신설 | 엔드포인트·프론트 계측 추가 없이 서빙 시점 기록으로 대체 |
| D-R08 | 랭커는 XGBoost, EC2 Spring 인프로세스 | LightGBM, 별도 서빙 서버 | E-01: 품질 동일, xgboost4j로 HTTP 홉 없이 로드 가능 |
| D-R09 | LLM은 4B급, 8B 이상 제외 | Qwen3 8B 4bit | 6GB VRAM에서 KV 캐시 포함 시 초과 |
| D-R10 | 로컬 추론 런타임은 Ollama | vLLM | 단일 GPU·소규모 트래픽에 설치·운영 단순 |
| D-R11 | ML 호출은 비동기 잡 + 3초 타임아웃 | 동기 호출 | 요청 경로에서 GPU 의존 제거, 서버 다운 시 서비스 영향 없음 |
| D-R12 | EC2-노트북 연결은 Tailscale | 공인 IP·포트포워딩 | 별도 네트워크 설정 없이 사설 연결 |
| D-R13 | 1차에서 Redis 캐시 미도입 | 공연 벡터·후보 캐시 | 병목 미확인 상태에서 정체 부작용 회피, 필요 시 도입 |
| D-R14 | NPU 미사용 | NPU 오프로드 | WSL2 통과 불가, 별도 툴체인 필요 |
| D-R15 | 랭커는 노트북이 아닌 EC2 배치 | 노트북에서 추론 서빙 | GPU 불필요한 작업이고 온라인 의존을 제거 |
| D-R16 | 2차는 LLM 태깅으로 1차 매칭을 보강, 임베딩 홈 추천 폐기 | 공연 문서 코사인 상위 K | E-03: bge-m3가 장르를 구분하지 못함(차이 ≈ 0, NN 0/10). 태깅은 E-02 장르 적중 9/10 |
| D-R17 | 태깅 모델 qwen3:4b | exaone3.5:2.4b(2배 빠름) | E-02: 엉뚱한 장르 6 vs 19. 오프라인 경로라 2초는 예산 안 |

## 13. 문서 개정·브랜치

| 문서 | 새 버전 | 바뀌는 곳 |
|---|---|---|
| 02 개발 컨벤션 | 제자리 | §3.1 도메인 목록에 recommendation·파트에 ml |
| ERD | v5 → v6 | 4.2~4.4 테이블 |
| API | v6 → v7 | §5 |
| 요구·기능 명세 | v6 → v7 | 추천 요구사항 |
| 화면 정의 | v7 → v8 | §6 |
| api/parts 조각 + build.py | — | §14 recommendation 조각 추가 |

> **API P0 수(2026-09-23 정정)** — 처음 이 설계는 v6 P0를 61로 셌으나 v6 작성 뒤 신설분(2026-09-15 API-performance-15 · 2026-09-21 API-settlement-08 · 2026-09-22 API-performance-16·17 미디어)이 빠져 있었다. v7 머지 시점 실제 값은 **v6 65 → v7 66**(+ recommendation-01)이고, 상세 절 69 = P0 66 + P1 3이다(API v7 §17 검수표와 같은 수).

> **§4.1 참여 팀 장르 범위(2026-09-28 정정)** — 이 설계와 API v7 §14·ERD v6 §2가 "REGISTERED"만 적어 왔으나, 실제 구현(`RecommendationService.java:200-203`·`PerformanceParticipant.isAccepted()`)은 REGISTERED이면서 지갑 등록을 수락한 참여 팀만 합친다 — 카드 `teamNames`와 같은 팀 집합을 보이려는 의도다(MR !192 리뷰). 코드 의도가 맞으므로 세 문서 모두 이 정정을 따른다. 근거: 경계면 검증 2026-09-28(MR !236 · S15P21B204-180), 코드가 정본.

**배포 순서** — team-01 `genre` 가 필수가 되므로 **BE(V11·검증)와 FE(P-02 장르 셀렉트)를 같은 배포에 넣는다.** BE 만 먼저 나가면 현재 P-02 폼(`teamForm.ts`, genre 미전송)의 팀 생성이 400 `COMMON_VALIDATION_FAILED` 로 막힌다(MR !186 리뷰).

**시연 준비** — V11 이 기존 팀을 전부 `ETC` 로 이관하므로, 그대로면 1차 매칭에서 제외돼 추천이 전부 `FALLBACK` 이 된다. 배포 직후 시연용 주요 팀의 장르를 **P-02(또는 API-team-04)로** 실제 장르(ROCK·INDIE 등)로 지정한다 — DB 직접 UPDATE 는 쓰지 않는다(MR !186 컨설턴트 리뷰).

브랜치: 문서 `docs/recommendation-spec`, BE `feat/be/recommendation`, FE `feat/fe/recommendation`, ML `feat/ml/recommendation`(파트 추가 후). `ml/ctr/`는 스파이크이며 E-01 근거로만 남긴다.

## 14. 리스크

발표 6일 전 범위 초과, 노트북 가용성, 4B 한국어 태깅 품질, 합성 결과 오해, 장르 데이터 부재(팀 장르 입력 UI 선행 필수).
