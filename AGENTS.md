# S15P21B204 — 소규모 공연 티켓팅·공동 정산 플랫폼

설계 정본은 `docs/design/` 최신 버전(API v6 · ERD v5 · 화면 v6 · 기술 스택 v3 · 컨벤션). 코드는 명세의 결과물이고, 명세 밖은 명세를 먼저 고친다. **팀 공유 문서(착수 안내·계획)도 저장소 `docs/`가 정본**이다. 노션은 사본.

## 하네스: B204 구현

**목표:** backend · frontend · blockchain · exec 네 파트를 파트별 에이전트가 구현하고, 파트 경계면(API 응답 ↔ 프론트 타입, ABI ↔ 래퍼, ERD ↔ 마이그레이션)은 QA 에이전트가 교차 검증한다. 느슨한 구성 — 서브 에이전트 모드, 팀 모드 없음.

**트리거:** `backend/` `frontend/` `blockchain/` `exec/` 구현·수정·배포 요청 시 `b204-dev` 스킬을 사용하라. 단순 질문·Jira는 직접 처리. `docs/` 문서 작성·개정과 노션 페이지 작성은 내용을 확정한 뒤 `doc-writer` 에이전트(sonnet)에 위임한다.

**경계면 검증:** 모듈 하나 완성 직후·MR 전에는 `b204-integration-check` 스킬.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-09-05 | 초기 구성 — 에이전트 5(be·fe·contract·infra·qa), 스킬 3(b204-dev·b204-stack·b204-integration-check) | 전체 | 파트별 최소 구성, 경계면 QA로 의존성 보호 |
| 2026-09-05 | 모델 정책 도입 — qa→fable, doc-writer(sonnet) 추가, b204-dev에 모델 표 | agents/integration-qa·doc-writer, skills/b204-dev | 사용자 요청: 계획·검증 Fable, 코드 opus, 문서·노션 sonnet |
| 2026-09-05 | 멀티 에이전트 기본 — 독립 작업 2개 이상이면 동시 실행 | AGENTS.md 실행 규칙, skills/b204-dev Phase 1 | 사용자 요청. 이전엔 "병렬 가능"만 적혀 순차로 돌았음 |
| 2026-09-05 | CI/CD를 GitLab CI → Jenkins로 전환 반영 | agents/infra-dev, skills/b204-stack(infra.md·description) | 사용자 결정(SSAFY 가이드 기준). 스택 v3 |

## 실행 규칙: 멀티 에이전트 기본

요청에 독립 작업이 2개 이상이면 **서브 에이전트를 한 응답에서 동시에 띄운다**(Agent 호출을 같은 메시지에 묶는다). 순차는 앞 결과가 뒤의 입력일 때만. 판단 기준:

- 독립 = 서로 다른 디렉토리·파일·노션 페이지를 건드리고 한쪽 결과 없이 다른 쪽이 시작 가능. 예: be-dev ∥ fe-dev ∥ contract-dev, infra 파일 작성 ∥ 노션 안내 문서, 학습로그 ∥ 문서 개정.
- 의존 = 파일 handoff가 있는 것. 예: contract-dev → be-dev(ABI 래퍼), learning-logger → star-writer, 구현 → integration-qa.
- 같은 디렉토리를 두 에이전트가 동시에 쓰지 않는다. 겹치면 하나로 합치거나 순차.
- 메인 세션은 에이전트가 도는 동안 기다리지 않고 자기 몫(사용자 답변, 검토, 다음 프롬프트 준비)을 한다. 결과는 도착 순서대로 검수한다.
- 팀 모드(TeamCreate)는 쓰지 않는다. 파트 간 계약이 문서(API v6·ERD v5·ABI)로 고정돼 에이전트 간 대화가 필요 없다.

## 모델 정책

| 작업 | 모델 | 적용 |
|---|---|---|
| 계획·라우팅·명세 대조·검증 | **Fable** | 메인 세션이 직접. `Plan` 에이전트와 `integration-qa`는 `model: "fable"` |
| 코드 작성 | **opus** | be-dev · fe-dev · contract-dev · infra-dev |
| 문서·노션 | **sonnet** | doc-writer (개인 기록 에이전트는 각자 `Codex.local.md`) |

Agent 호출 시 `model` 파라미터를 이 표와 에이전트 정의의 `model:`에 맞춘다. 하네스 플러그인의 "전 에이전트 opus" 기본값보다 이 표가 우선한다.

개인용 하네스(학습로그 등)는 `Codex.local.md`에 두고 커밋하지 않는다. `_workspace/`는 에이전트 중간 산출물이며 커밋하지 않는다.
