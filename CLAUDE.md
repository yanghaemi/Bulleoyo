# S15P21B204 — 소규모 공연 티켓팅·공동 정산 플랫폼

설계 정본은 `docs/design/` 최신 버전(API v7 · ERD v6 · 화면 v8 · 요구/기능 v7 · 기술 스택 v3 · 디자인 토큰 v2 · 컨벤션). 추천 기능 설계는 `docs/superpowers/specs/2026-09-22-recommendation-design.md`, 실험 기록은 `docs/ml/RECOMMENDATION_EXPERIMENTS.md`. 코드는 명세의 결과물이고, 명세 밖은 명세를 먼저 고친다. **팀 공유 문서(착수 안내·계획)도 저장소 `docs/`가 정본**이다. 노션은 사본.

## Stage Ledger 프론트엔드 작업

- 설계: `docs/superpowers/specs/2026-09-10-stage-ledger-frontend-design.md`
- 현재 계획: `docs/superpowers/plans/2026-09-10-stage-ledger-foundation-plan.md`
- 진행 상태: `docs/frontend/STAGE_LEDGER_STATUS.md`
- 결정 로그: `docs/frontend/STAGE_LEDGER_DECISIONS.md`
- 디자인 도구 실험 설계: `docs/superpowers/specs/2026-09-10-design-tool-experiments-design.md`
- 디자인 도구 실험 계획: `docs/superpowers/plans/2026-09-10-design-tool-experiments-plan.md`
- 디자인 도구 실험 운영·롤백: `docs/frontend/DESIGN_TOOL_EXPERIMENTS.md`
- 외부 시안용 Manus 프롬프트: `docs/experiments/manus-prompts.md`

### 2026-09-10 무대 모션·AuthHeader 인수인계

- 최신 설계: `docs/superpowers/specs/2026-09-10-stage-motion-auth-polish-design.md`
- 실행 계획: `docs/superpowers/plans/2026-09-10-stage-motion-auth-polish-plan.md`
- 구현·자동 검증·브라우저 실측: `docs/frontend/STAGE_LEDGER_STATUS.md`, 판단 근거: `STAGE_LEDGER_DECISIONS.md`, 재현·청크·QA 한계: `DESIGN_TOOL_EXPERIMENTS.md`(모두 `docs/frontend/`).
- 브랜치 `codex/stage-ledger-foundation`: Tasks 1–6은 `d82f2e5`까지, Task 7 Lab·모달·문서는 이 항목을 포함한 커밋이다. 로컬 커밋 상태이며 push/merge하지 않았다. 후속 작업 전 `git status --short`로 실제 상태를 확인한다.
- 기존 안정 미리보기 `http://127.0.0.1:5174`: `/login`, `/performances/12/order/choice`, `/orders/12/complete`, `/studio/performances/12/rules`, `/__lab/design-tools`. 현재 실제 인증은 미연결이며 Lab은 고정 fixture다.
- 검증은 `frontend/`에서 `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`. 최종 코드 `8ccf123` 기록은 전체 31파일/165테스트, 팀·Lab 집중 2파일/11테스트 통과(직전 홈 링크 수정 `6a5e954`: 전체 164테스트). 집중 실행은 `pnpm exec vitest run <파일들>`을 쓴다(`pnpm test --`는 전체를 실행). 두 최종 수정은 CUA 미가용으로 자동 검증만 수행했으며 최초 `9f10753` 브라우저 QA와 구분한다.
- 로고 기록은 boolean이 아닌 문서별 `performance.timeOrigin`; reduced-motion은 path 기반 최종 영문 상태다. Apple 5초 제공 영상은 프레임 샘플링했고 15개 원본 전체 재생을 주장하지 않는다. Windows 스크롤바·Motion reduced-motion 개발 경고의 정확한 측정 경계는 QA 문서를 따른다.
- 2026-09-11부터 header 로고는 `morph-object` 한 벌로 마이크와 마지막 O를 표현한다. 새 문서의 2.40초 한글→영문 자동 재생 뒤 클릭마다 3.00초 영문→한글 전용 복귀와 정방향을 교대한다. 복귀는 O 우측 퇴장→같은 객체의 좌측 마이크 재등장→글자 위 바운스→ㅛ 착지이며 reverse가 아니다. 안정 상태는 `bulleoyo:header-form`에 보존하고, 중간 입력은 겹쳐 재생하지 않는다. D-017을 따른다.

### A-06 실제 데이터 티켓 인쇄 인수인계 — 현재 계약

- 진입점은 `frontend/src/features/ticket/IssuedTicketHero.tsx` → `TicketRevealStage.tsx` + `ConcertCollectorTicket.tsx`다. 실제 예매 데이터로 만든 DOM 티켓을 프린터 슬롯에서 아래로 인쇄하고 짧게 정착시킨다.
- 타이밍 정본은 `frontend/src/shared/motion/motionTokens.ts`의 **인쇄 1200ms + settle 160ms = 총 1360ms**다. 현재 구현에는 3D 회전, 브랜드 뒷면, Stage Halo, 영상 재생, DOM 교차 전환, 단발 링·광택·별빛이 없다.
- 1024px 미만 모바일과 `prefers-reduced-motion: reduce`에서는 인쇄 애니메이션 없이 반응형 실제 티켓을 즉시 표시한다. 모바일에서는 replay를 숨기고 reduced-motion에서는 replay를 비활성화한다.
- 예매 완료 문구와 `내 티켓 보기`·`홈으로` CTA는 연출 상태와 분리되어 첫 렌더부터 항상 사용할 수 있다. 모션 상태를 결제·발권 완료 판정에 연결하지 않는다.
- 2026-09-11의 5.20초 영상/DOM·3D 회전 시네마틱 설계와 `render:ticket` 흐름은 대체된 실험 이력이다. 현재 판단은 `docs/frontend/STAGE_LEDGER_DECISIONS.md`의 D-019를 따른다.
- 데모 매진 공연은 Busan Wave Festival(`4`)이고 IU(`5`)는 예매 가능이다. 홈·공연 목록·상세 fixture를 함께 바꿨다. 후속 작업자는 `git status --short`, 현재 상태 문서, D-019를 먼저 확인한다.

## 하네스: B204 구현

**목표:** backend · frontend · blockchain · exec 네 파트를 파트별 에이전트가 구현하고, 파트 경계면(API 응답 ↔ 프론트 타입, ABI ↔ 래퍼, ERD ↔ 마이그레이션)은 QA 에이전트가 교차 검증한다. 느슨한 구성 — 서브 에이전트 모드, 팀 모드 없음.

**트리거:** `backend/` `frontend/` `blockchain/` `exec/` 구현·수정·배포 요청 시 `b204-dev` 스킬을 사용하라. 단순 질문·Jira는 직접 처리. `docs/` 문서 작성·개정과 노션 페이지 작성은 내용을 확정한 뒤 `doc-writer` 에이전트(sonnet)에 위임한다.

**경계면 검증:** 모듈 하나 완성 직후·MR 전에는 `b204-integration-check` 스킬.

**변경 이력:**

| 날짜       | 변경 내용                                                                                           | 대상                                                      | 사유                                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-05 | 초기 구성 — 에이전트 5(be·fe·contract·infra·qa), 스킬 3(b204-dev·b204-stack·b204-integration-check) | 전체                                                      | 파트별 최소 구성, 경계면 QA로 의존성 보호                                                                                 |
| 2026-09-05 | 모델 정책 도입 — qa→fable, doc-writer(sonnet) 추가, b204-dev에 모델 표                              | agents/integration-qa·doc-writer, skills/b204-dev         | 사용자 요청: 계획·검증 Fable, 코드 opus, 문서·노션 sonnet                                                                 |
| 2026-09-05 | 멀티 에이전트 기본 — 독립 작업 2개 이상이면 동시 실행                                               | CLAUDE.md 실행 규칙, skills/b204-dev Phase 1              | 사용자 요청. 이전엔 "병렬 가능"만 적혀 순차로 돌았음                                                                      |
| 2026-09-05 | CI/CD를 GitLab CI → Jenkins로 전환 반영                                                             | agents/infra-dev, skills/b204-stack(infra.md·description) | 사용자 결정(SSAFY 가이드 기준). 스택 v3                                                                                   |
| 2026-09-08 | doc-writer tools에 `ToolSearch` 추가 + 지연 로드 안내                                               | agents/doc-writer                                         | MCP 도구는 지연 로드라 ToolSearch 없는 서브에이전트에선 노션 도구가 보이지 않음. 9/7 노션 v6 미러(-36)가 이 이유로 미작성 |
| 2026-09-10 | Stage Ledger 설계·계획·상태·결정 로그 진입점 추가                                                   | frontend 문서                                             | Claude·Codex 세션 간 구현 근거와 다음 작업을 동일하게 인계                                                                |
| 2026-09-11 | A-06 대형 티켓 영상·DOM 전환과 5.2초 타임라인 인수인계(대체된 이력)                                  | frontend 티켓·미디어·문서                                 | 당시 표현층과 실제 데이터·결제 상태 경계를 기록                                                                           |
| 2026-09-14 | A-06을 1360ms print-only로 단순화                                                                    | frontend 티켓·문서                                        | 현재 소스 계약과 인계 문서를 동기화하고 3D·Halo·영상 의존을 제거                                                          |
| 2026-09-14 | 브랜치·커밋 규칙 블록(컨벤션 §3.1·§3.3) 추가 — 프롬프트와 다르면 규칙 우선 | CLAUDE.md, agents/be·fe·contract·infra-dev·doc-writer, skills/b204-dev | 규칙이 문서에만 있고 하네스엔 스킬 한 줄뿐이라 에이전트가 프롬프트대로 만듦. `git log --no-merges --since=2026-09-05 9a8cdac`(committer date) 298건 중 스코프 괄호 116·요약 50자 초과 51, 9/14 세션도 기능 단위 브랜치·스코프 커밋을 지시 |
| 2026-09-15 | 규칙 블록 보강 — 형식이 없는 타입의 브랜치(가장 가까운 형식), 인프라 파트 `be`, doc-writer 워크트리·작업 단위 줄, CLAUDE.md 요약에 작업 단위, 집계 명령 명시 | CLAUDE.md, agents/be·fe·contract·infra-dev·doc-writer | MR !108 컨설턴트님·자동 리뷰. 사용자 결정 A: 컨벤션 문서는 그대로 두고 해석을 규칙에 적는다 |
| 2026-09-16 | 도메인 목록 제약과 fix/docs 폴백의 충돌 해소 — 도메인 목록은 `feat/`에만, `fix/`·`docs/`의 `{내용}`은 서술형 | CLAUDE.md, agents/be·fe·contract·infra-dev·doc-writer | MR !111 오민근 리뷰 — 도메인 목록 제약과 fix/docs 폴백이 충돌해 에이전트가 갈렸다. develop 이력이 서술형 리프를 쓰고 있어 그 해석으로 고정 |
| 2026-09-22 | 추천 도메인 신설 — 컨벤션 §3.1에 `recommendation`·파트 `ml`, API v7·ERD v6·화면 v8·요구/기능 v7, 설계·실험 문서 진입점 | CLAUDE.md, docs/design, docs/superpowers/specs, docs/ml | 콜드스타트 장르 추천(에픽 -174). ML 서버(4050 노트북)는 요청 경로 밖, E-03으로 임베딩 추천 폐기 |

## 브랜치·커밋 규칙

`docs/design/02_개발_컨벤션.md` §3.1·§3.3이 정본. 메인 세션이 에이전트 프롬프트를 쓸 때와 직접 커밋할 때 모두 적용한다.

- 브랜치 `feat/{파트}/{도메인}` · `fix/{파트}/{내용}` · `docs/{내용}` — Jira 키 금지
- 리프의 §3.1 도메인 목록 제약은 `feat/`에만 적용된다 — `fix/`·`docs/`의 `{내용}`은 서술형 한 줄 요약이다(예: `fix/be/settlement-balance-refresh`, `fix/be/chain-timeout-not-dead`)
- 형식이 없는 타입(`refactor`·`test`·`style`·`chore`·`build`·`ci`)은 가장 가까운 형식에 — 코드·설정·빌드·CI는 `fix/{파트}/{내용}`, 문서·하네스는 `docs/{내용}`(커밋도 `docs:`)
- 인프라 작업의 파트는 `be`(프론트에만 속하면 `fe`), 리프는 `infra` — 예: `feat/be/infra`
- 커밋 제목 `type: 요약` — 스코프 괄호 없음, 한국어 50자 이내, 마침표 없음
- 커밋 단위 = 작업 단위 — 한 커밋에 한 가지 완결된 작업
- Jira 키는 **본문의 마지막 줄** — `Co-Authored-By` 줄은 키 위에 둔다. 클로징 키워드 금지
- 에이전트 정의(be·fe·contract·infra-dev·doc-writer)에 같은 블록이 있다. 프롬프트가 규칙과 다르면 에이전트는 규칙을 따른다

## 실행 규칙: 멀티 에이전트 기본

요청에 독립 작업이 2개 이상이면 **서브 에이전트를 한 응답에서 동시에 띄운다**(Agent 호출을 같은 메시지에 묶는다). 순차는 앞 결과가 뒤의 입력일 때만. 판단 기준:

- 독립 = 서로 다른 디렉토리·파일·노션 페이지를 건드리고 한쪽 결과 없이 다른 쪽이 시작 가능. 예: be-dev ∥ fe-dev ∥ contract-dev, infra 파일 작성 ∥ 노션 안내 문서, 학습로그 ∥ 문서 개정.
- 의존 = 파일 handoff가 있는 것. 예: contract-dev → be-dev(ABI 래퍼), learning-logger → star-writer, 구현 → integration-qa.
- 같은 디렉토리를 두 에이전트가 동시에 쓰지 않는다. 겹치면 하나로 합치거나 순차.
- 메인 세션은 에이전트가 도는 동안 기다리지 않고 자기 몫(사용자 답변, 검토, 다음 프롬프트 준비)을 한다. 결과는 도착 순서대로 검수한다.
- 팀 모드(TeamCreate)는 쓰지 않는다. 파트 간 계약이 문서(API v6·ERD v5·ABI)로 고정돼 에이전트 간 대화가 필요 없다.

## 모델 정책

| 작업                       | 모델       | 적용                                                                    |
| -------------------------- | ---------- | ----------------------------------------------------------------------- |
| 계획·라우팅·명세 대조·검증 | **Fable**  | 메인 세션이 직접. `Plan` 에이전트와 `integration-qa`는 `model: "fable"` |
| 코드 작성                  | **opus**   | be-dev · fe-dev · contract-dev · infra-dev                              |
| 문서·노션                  | **sonnet** | doc-writer (개인 기록 에이전트는 각자 `CLAUDE.local.md`)                |

Agent 호출 시 `model` 파라미터를 이 표와 에이전트 정의의 `model:`에 맞춘다. 하네스 플러그인의 "전 에이전트 opus" 기본값보다 이 표가 우선한다.

개인용 하네스(학습로그 등)는 `CLAUDE.local.md`에 두고 커밋하지 않는다. `_workspace/`는 에이전트 중간 산출물이며 커밋하지 않는다.
