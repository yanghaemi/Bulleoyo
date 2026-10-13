# 불러요 후속 화면 개편 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stage Gallery와 Editorial Lineup을 비교 가능한 상태로 보존하고, 아직 같은 디자인 기준이 적용되지 않은 Studio·운영·검증·관리 화면을 실제 상태 계약을 유지한 채 단계적으로 개편한다.

**Architecture:** `/__lab/design-refresh`는 API를 호출하지 않는 실제 컴포넌트 미리보기로 유지하며 1·2번 홈 시안을 독립 URL로 보존한다. 제품 화면은 기존 feature 컴포넌트와 상태 전이를 그대로 사용하고, 정보 계층·여백·행·표·행동 영역만 공통 라이트 편집 기준으로 정리한다. 각 묶음은 자체 테스트와 브라우저 확인을 끝낸 뒤 다음 묶음으로 넘어간다.

**Tech Stack:** React 19, TypeScript, React Router, Vitest, Testing Library, 기존 CSS 토큰

**Spec:** `docs/frontend/UI_REDESIGN_PREPARATION_2026-09-21.md`, `docs/superpowers/specs/2026-09-21-bulleoyo-visual-revival-design.md`

## Global Constraints

- `feat/fe/performance-media`의 기존 미커밋 변경을 되돌리거나 광역 포맷하지 않는다.
- 인증·권한·API·지갑·결제·QR·환불·정산 상태와 중복 요청 방지 계약을 변경하지 않는다.
- 새 런타임 의존성, 가짜 성공 상태, 명세에 없는 데이터 필드를 추가하지 않는다.
- 제품 화면에는 Jira·LAB·시안명·비교 도구를 노출하지 않는다.
- 한국어와 영어는 동시에 표시하지 않고 현재 언어 한 가지로 렌더한다.
- 운영 홈 승격은 별도 선택 전까지 보류하고 1·2번은 Lab에서 모두 유지한다.
- 커밋·push·MR·배포는 별도 사용자 요청 전에는 실행하지 않는다.

## Review Focus

- `?v=1`과 `?v=2` 직접 진입·새로고침·키보드 전환에서 같은 데이터와 올바른 활성 표시를 유지한다.
- 느린 응답·재시도·부분 데이터에서도 생성·서명·정산·관리 작업이 자동 실행되거나 중복 제출되지 않는다.
- 긴 공연명·팀명, 빈 목록, 누락 이미지, 미확인 금액에서 레이아웃이 깨지거나 사실을 추정하지 않는다.
- 320/390/768/1280/1440px에서 고정 행동 영역과 헤더·표·목록이 겹치지 않는다.
- reduced-motion과 키보드 환경에서도 정보와 행동이 애니메이션 완료에 의존하지 않는다.

---

### Task 1: 1·2번 홈 시안 병행 보존

**Files:**
- Modify: `frontend/src/pages/prototypes/PerformanceDiscoveryPrototype.tsx`
- Test: `frontend/src/pages/prototypes/PerformanceDiscoveryPrototype.test.tsx`

**Interfaces:**
- Consumes: `PerformanceDiscoveryPrototype({ shows })`, URL query `v=1|2|3`
- Produces: 번호가 포함된 비교 선택기, 독립 URL로 보존되는 Stage Gallery와 Editorial Lineup

- [ ] **Step 1: 번호와 독립 URL 계약을 실패 테스트로 추가**

```tsx
expect(screen.getByRole('button', { name: '1 Stage Gallery' })).toHaveAttribute('aria-current', 'true')
await user.click(screen.getByRole('button', { name: '2 Editorial Lineup' }))
expect(location.search).toContain('v=2')
```

- [ ] **Step 2: 집중 테스트를 실행해 기존 무번호 라벨 때문에 실패 확인**

Run: `pnpm exec vitest run src/pages/prototypes/PerformanceDiscoveryPrototype.test.tsx`
Expected: FAIL — `1 Stage Gallery` 버튼을 찾지 못함

- [ ] **Step 3: 선택기 라벨에 1·2·3 번호를 추가하고 기존 단축키·URL 동작 유지**

```ts
const variants = [
  { id: 'stage-gallery', label: '1 Stage Gallery' },
  { id: 'editorial-lineup', label: '2 Editorial Lineup' },
  { id: 'discovery-first', label: '3 Discovery First' },
]
```

- [ ] **Step 4: 집중 테스트와 390/1280px 브라우저 비교 통과**

Run: `pnpm exec vitest run src/pages/prototypes/PerformanceDiscoveryPrototype.test.tsx src/pages/DesignRefreshPage.test.tsx`
Expected: PASS

### Task 2: Studio 준비 흐름 정리

**Files:**
- Modify: `frontend/src/features/studio/TeamManage.tsx`
- Modify: `frontend/src/features/studio/ParticipantManage.tsx`
- Modify: `frontend/src/features/studio/SettlementRules.tsx`
- Modify: `frontend/src/features/studio/RuleAgreements.tsx`
- Modify: `frontend/src/features/studio/studio-refresh.css`
- Modify: `frontend/src/pages/DesignRefreshPage.tsx`
- Test: `frontend/src/pages/TeamManagePage.save.test.tsx`
- Test: `frontend/src/features/studio/ParticipantManage.lock.test.tsx`
- Test: `frontend/src/features/studio/SettlementRules.motion.test.tsx`
- Test: `frontend/src/features/studio/RuleAgreements.retry.test.tsx`

**Interfaces:**
- Consumes: 기존 팀 저장·초대·비율 계산·서명·판매 시작 handlers
- Produces: 팀 정보 → 참여팀 → 정산 규칙 → 동의 진행 순서가 분명한 작업 화면

- [ ] **Step 1: 장식 라벨 대신 현재 작업과 상태가 먼저 보이는 실패 테스트 추가**

```tsx
expect(screen.getByRole('heading', { name: '참여팀 관리' })).toBeVisible()
expect(screen.getByText(/초대 상태/)).toBeVisible()
expect(screen.queryByText('YOUR WORKSPACE')).not.toBeInTheDocument()
```

- [ ] **Step 2: 기존 집중 테스트로 새 정보 계층 부재 확인**

Run: `pnpm exec vitest run src/pages/TeamManagePage.save.test.tsx src/features/studio/ParticipantManage.lock.test.tsx src/features/studio/SettlementRules.motion.test.tsx src/features/studio/RuleAgreements.retry.test.tsx`
Expected: FAIL only on newly added presentation assertions

- [ ] **Step 3: 동일 handler를 유지하며 제목·상태·표·행동 영역과 공통 여백 정리**

```tsx
<header className="studio-task-header">
  <div><h1>{title}</h1><p>{statusCopy}</p></div>
  {primaryAction}
</header>
```

- [ ] **Step 4: Lab에 팀 관리·참여팀·정산 규칙 화면을 실제 컴포넌트 fixture로 추가**

- [ ] **Step 5: 집중 테스트와 390/768/1280px 브라우저 검증 통과**

### Task 3: 판매·정산·입장 화면 정리

**Files:**
- Modify: `frontend/src/features/studio/SalesStatus.tsx`
- Modify: `frontend/src/features/studio/SettlementDashboard.tsx`
- Modify: `frontend/src/features/entry/EntryStatus.tsx`
- Modify: `frontend/src/features/entry/ScanScreen.tsx`
- Modify: `frontend/src/features/studio/studio-refresh.css`
- Modify: `frontend/src/pages/DesignRefreshPage.tsx`
- Test: `frontend/src/features/studio/SalesStatus.unknown.test.tsx`
- Test: `frontend/src/features/studio/SettlementDashboard.chart.test.tsx`
- Test: `frontend/src/features/entry/EntryStatus.locale.test.tsx`

**Interfaces:**
- Consumes: 판매 조회·정산 작업·입장 판정·수동 입력 handlers
- Produces: 상태 → 핵심 수치 → 불일치/작업 → 기록 순서의 운영 화면

- [ ] **Step 1: 미확인 금액·stale·불일치·최근 일부 기록을 보존하는 실패 테스트 추가**
- [ ] **Step 2: 집중 테스트를 실행해 새 구조 부재로 실패 확인**
- [ ] **Step 3: 가짜 0·가짜 완료 없이 표와 상태를 우선하는 레이아웃 구현**
- [ ] **Step 4: Lab fixture 추가 후 390/768/1280px 검증**
- [ ] **Step 5: 집중 테스트 통과**

### Task 4: 검증·공시·관리자·복구 화면 정리

**Files:**
- Modify: `frontend/src/features/verify/SettlementVerification.tsx`
- Modify: `frontend/src/features/verify/SupplyDisclosure.tsx`
- Modify: `frontend/src/features/settlement/SettlementShareView.tsx`
- Modify: `frontend/src/features/admin/DisputeQueue.tsx`
- Modify: `frontend/src/features/admin/CoinOperations.tsx`
- Modify: `frontend/src/app/RouteErrorPage.tsx`
- Modify: `frontend/src/app/ErrorBoundary.tsx`
- Test: `frontend/src/features/verify/SupplyDisclosure.data.test.tsx`
- Test: `frontend/src/features/verify/SupplyDisclosure.locale.test.tsx`
- Test: `frontend/src/features/settlement/SettlementShareView.locale.test.tsx`
- Test: `frontend/src/app/RouteErrorPage.test.tsx`
- Test: `frontend/src/app/ErrorBoundary.test.tsx`

**Interfaces:**
- Consumes: 재계산·불변식·이의 처리·코인 지급·라우트 복구 handlers
- Produces: 상태/판정 → 근거 → 가능한 행동 순서와 원인 추측 없는 복구 화면

- [ ] **Step 1: 내부 용어와 장식 라벨 제거, 미확인 상태 보존 실패 테스트 추가**
- [ ] **Step 2: 집중 테스트를 실행해 새 계약 부재로 실패 확인**
- [ ] **Step 3: handler와 provider 독립성을 유지하며 화면 계층 구현**
- [ ] **Step 4: Lab fixture 또는 안전한 실제 경로에서 브라우저 확인**
- [ ] **Step 5: 집중 테스트 통과**

### Task 5: 전체 회귀·브라우저 QA·기록

**Files:**
- Modify: `docs/frontend/UI_REDESIGN_LIGHT_2026-09-21.md`

**Interfaces:**
- Consumes: Tasks 1–4의 제품 화면과 Lab fixture
- Produces: 실행한 검사와 미검증 범위를 구분한 최종 기록

- [ ] **Step 1: 전체 테스트·타입·린트·빌드 실행**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: exit 0; 기존 제3자/청크 경고는 별도 기록

- [ ] **Step 2: 320/390/768/1280/1440px, KO/EN, 키보드, reduced-motion 확인**
- [ ] **Step 3: 콘솔 오류·가로 오버플로·고정 행동 겹침 확인**
- [ ] **Step 4: 실제 API E2E와 fixture 검증을 구분해 문서 갱신**
