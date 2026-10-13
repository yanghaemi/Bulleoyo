---
name: b204-dev
description: B204(소규모 공연 티켓팅·공동 정산 플랫폼) 구현 작업 오케스트레이터. backend/ frontend/ blockchain/ exec/ 어디든 기능 구현·API 추가·화면 작성·컨트랙트 수정·마이그레이션·CI·compose·배포 요청이 오면 반드시 이 스킬로 라우팅한다. "ticket 도메인 만들어", "정산 화면 붙여", "RevenueSplitter 수정", "develop 배포 파이프라인", "0층 세로축 구현", "W3 작업". 후속 작업: 수정, 보완, 다시 구현, 부분 재실행, 명세 v7 반영, QA 결과 반영, 이전 구현 개선 요청에도 이 스킬. 단순 질문·문서 작업(docs/)·Jira·노션은 제외.
---

# b204-dev — 구현 오케스트레이터

## 실행 모드: 서브 에이전트

팀 모드를 쓰지 않는다. 이유: 파트 간 계약이 API v6·ERD v5·ABI 문서로 고정돼 있어 실시간 조율이 필요 없고, 한 요청은 보통 한 파트에 떨어진다. 파트 간 어긋남은 integration-qa가 사후에 잡는다. 느슨하게 유지하고, 조율 비용이 실제로 문제가 될 때 팀 모드로 올린다.

## 에이전트 구성

| 에이전트 | 담당 경로 | 스킬 | 출력 |
|---|---|---|---|
| be-dev | `backend/` | b204-stack(backend) | 코드 + `_workspace/be_{domain}_endpoints.md` |
| fe-dev | `frontend/` | b204-stack(frontend) | 코드 + `_workspace/fe_{domain}_api-usage.md` |
| contract-dev | `blockchain/` | b204-stack(contract) | 코드 + `deployments/kairos.json` + `_workspace/bc_interface.md` |
| infra-dev | `exec/`, CI, 서버 | b204-stack(infra) | 파일 + `_workspace/infra_runbook.md` |
| integration-qa | 읽기 + 검증 실행 | b204-integration-check | `_workspace/qa_{domain}_{date}.md` |

Agent 호출 시 `model`은 아래 표를 따른다(CLAUDE.md 모델 정책). 프로젝트 에이전트 정의(`.claude/agents/{name}.md`)를 프롬프트 첫 줄에 "이 정의를 따라라"로 지정한다.

| 역할 | 모델 | 이유 |
|---|---|---|
| 계획·라우팅·명세 대조 | 메인 세션(Fable)이 직접. `Plan` 에이전트를 쓰면 `model: "fable"` | 판단 품질이 전체를 결정 |
| 코드 작성 (be·fe·contract·infra) | `model: "opus"` | 구현 품질 |
| 검증 (integration-qa) | `model: "fable"` | 경계면 불일치는 놓치면 비용이 크다 |
| 문서·노션 (doc-writer) | `model: "sonnet"` | 내용은 메인이 정하고 옮기기만 한다 |

## 워크플로우

### Phase 0: 컨텍스트 확인
1. `_workspace/` 존재 확인.
   - 없음 → 초기 실행.
   - 있음 + 사용자가 특정 도메인·파트 수정 요청 → **부분 재실행**. 해당 에이전트만 호출하고 이전 산출물 경로를 프롬프트에 넣는다.
   - 있음 + 이전 QA 보고서 반영 요청 → `qa_*.md`의 "수정" 판정 항목별로 해당 파트 에이전트 호출.
2. 요청이 명세 밖이면(API v6에 없는 엔드포인트, 화면 v6에 없는 화면) 구현 전에 사용자에게 명세 수정이 먼저임을 알린다. 명세를 고치는 건 문서 작업이므로 이 스킬 범위 밖.

### Phase 1: 라우팅
요청을 파트별로 쪼갠다. 판단 기준은 **파일이 어느 디렉토리에 생기는가**.

| 요청 유형 | 호출 |
|---|---|
| API·엔티티·마이그레이션·체인 워커 | be-dev |
| 화면·훅·지갑 연동 | fe-dev |
| Solidity·Hardhat·배포 스크립트 | contract-dev |
| Dockerfile·compose·CI·Nginx·서버 | infra-dev |
| "도메인 X 전체"(API+화면) | be-dev ∥ fe-dev 병렬 → integration-qa(A) |
| 컨트랙트 인터페이스 변경 | contract-dev → be-dev(래퍼 재생성) → integration-qa(B, C) |
| 0층 세로축 관통 | 도메인별로 위 규칙 반복, 마지막에 integration-qa(A~E 전체) |

**기본은 동시 실행이다.** 서로 다른 디렉토리에 떨어지는 작업은 Agent 호출을 한 메시지에 묶어 한 번에 띄운다(CLAUDE.md 실행 규칙). 순차는 파일 handoff가 있을 때만(contract → be 래퍼, 구현 → QA). 같은 디렉토리를 두 에이전트가 동시에 건드리지 않는다. 에이전트가 도는 동안 메인 세션은 기다리지 않고 다음 프롬프트·검토를 진행한다.

### Phase 2: 실행
각 에이전트 프롬프트에 반드시 포함:
- 에이전트 정의 파일 경로
- 대상 도메인과 구현 층(0층/1층)
- 읽어야 할 명세 절 번호(API v6 `API-{domain}-NN`, 화면 v6 화면 ID, ERD v5 테이블명)
- 출력 파일 경로(`_workspace/...`)
- 부분 재실행이면 이전 산출물 경로와 사용자 피드백

### Phase 3: 검증
파트 2개 이상이 관여했거나 경계면(응답 shape·ABI·스키마·환경변수)이 바뀌었으면 integration-qa를 호출한다. 한 파트 내부 변경(리팩터, 스타일)이면 생략한다.

QA 보고서에 "수정" 판정이 있으면 해당 파트 에이전트를 1회 재호출한다. 재호출 후에도 남으면 사용자에게 보고하고 멈춘다.

### Phase 4: 정리
- 사용자에게: 만든 파일 목록, QA 불일치 수, 미해결 항목, 다음 단계(MR·배포·명세 수정).
- 커밋은 사용자가 요청할 때만. push는 하지 않는다.
- **브랜치·커밋 규칙은 `CLAUDE.md` 「브랜치·커밋 규칙」과 각 에이전트 정의의 같은 블록이 정본**(컨벤션 §3.1·§3.3). 에이전트 프롬프트에 브랜치명·커밋 메시지를 적을 때 그 형식으로 쓴다 — `feat/{파트}/{도메인}`, `type: 요약`(스코프 괄호 없음·50자 이내), Jira 키는 본문의 마지막 줄(`Co-Authored-By` 줄은 그 위).

## 데이터 흐름
```
사용자 요청
  → [Phase 1 라우팅]
  → be-dev ──→ _workspace/be_{d}_endpoints.md ─┐
  → fe-dev ──→ _workspace/fe_{d}_api-usage.md ─┼→ integration-qa → qa_{d}_{date}.md
  → contract-dev → _workspace/bc_interface.md ─┤        │
  → infra-dev → _workspace/infra_runbook.md ───┘        ↓ "수정" 항목
                                              해당 에이전트 1회 재호출
```
계약 문서(읽기 전용): `docs/design/06_API_명세서_v6.md` · `12_ERD_v5.md` · `07_화면설계_v6.md` · `02_개발_컨벤션.md` · `blockchain/deployments/kairos.json`

## 에러 핸들링

| 상황 | 처리 |
|---|---|
| 에이전트 빌드·테스트 실패 | 에이전트가 1회 자체 수정. 재실패 시 로그를 받아 사용자에게 보고. 다른 파트는 계속 진행 |
| 명세 없음·충돌 | 구현 중단, 사용자에게 명세 수정 요청. 임의 해석 금지 |
| 상대 파트 미구현 | 명세 shape로 진행. QA는 "상대 미구현" 표시 |
| 컨트랙트 미배포 | be-dev는 인터페이스 명세로 스텁, fe-dev는 주소 없이 진행. `kairos.json` 생기면 부분 재실행 |
| Docker 미기동(로컬) | 실행 검증 건너뛰고 정적 비교만. 보고서에 명시 |

## 테스트 시나리오

### 정상: "ticket 도메인 0층 만들어"
1. Phase 0: `_workspace/` 없음 → 초기.
2. Phase 1: be-dev(ticket-01·10·11 API, ERD ticket·ticket_order) ∥ fe-dev(공연 상세·옵션·팀 선택 화면) 병렬.
3. Phase 3: integration-qa(A, D) → `qa_ticket_*.md`. 불일치 1건(tokenId 타입) → fe-dev 재호출.
4. Phase 4: 파일 목록 + "불일치 1건 해결" 보고.

### 에러: "RevenueSplitter에 halt 추가"
1. contract-dev 실행, `bc_interface.md` 첫 줄 `INTERFACE CHANGED`.
2. be-dev 호출해 래퍼 재생성. Kairos 재배포는 수동이라 `kairos.json` 주소는 그대로 → be-dev는 새 ABI로 래퍼만 갱신.
3. integration-qa(B): 서버 revert 코드 매핑에 `Halted` 누락 → be-dev 재호출.
4. 사용자에게 "Kairos 재배포 수동 트리거 필요" 보고.

### 부분 재실행: "QA에서 나온 fe 수정만"
Phase 0에서 최신 `qa_*.md` 읽음 → "fe 수정" 항목만 fe-dev에 전달 → 재QA(A) → 보고.
