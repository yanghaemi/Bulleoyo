# Wallet Duplicate and Actionable Error UX Implementation Plan

> **For the implementing agent:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the current session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect an existing wallet before creation, distinguish same-account and other-account conflicts safely, and replace vague failures in the wallet/media flows with cause-impact-action guidance.

**Architecture:** The backend emits dedicated wallet conflict codes while preserving privacy. The onboarding page begins in a checking phase driven by the existing `useMyWallet` query, converts 200 to a read-only linked card and 404 to wallet choice, and handles a create-time race by refetching only for `WALLET_ALREADY_LINKED`. A shared actionable-error model provides localized cause, impact, action, retryability, and diagnostic code for wallet and media screens.

**Tech Stack:** Java 17/Spring Boot, React 19, TypeScript, TanStack Query, i18n helper, JUnit 5, Vitest/Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-21-performance-media-creation-flow-design.md`

**Dependency:** Run the media backend plan before Task 1 and the performance media frontend plan through its media components before Task 4, because this plan reuses their error codes, generated types, and `MediaErrorPanel`.

## Global Constraints

- `/onboarding/wallet` calls `GET /api/v1/wallets/me` immediately.
- A 200 response hides all creation actions and displays provider, shortened address, and linked time.
- `WALLET_NOT_FOUND` is a normal state that opens wallet choice.
- `WALLET_ALREADY_LINKED` refetches the current member's wallet and never appears as a fatal error.
- `WALLET_ADDRESS_IN_USE` never reveals the other member, provider, address, or email.
- Branching uses `code`; `msg` is display-only.
- Every error panel states cause, impact, and next action; unknown errors retain form state and display code or HTTP status.
- Retry buttons appear only for transient/read failures, not permission or ownership failures.
- Every commit body ends with `S15P21B204-99` until a dedicated Jira key is issued.

## Review Focus

- A slow preflight response must not briefly expose wallet creation buttons; Task 2 tests the initial checking phase.
- A 404 must be treated as no-wallet, while network 404-shaped failures must not be inferred from message text; Task 2 tests code-only branching.
- A create race ending in `WALLET_ALREADY_LINKED` must refetch and show linked data; Task 3 tests it.
- `WALLET_ADDRESS_IN_USE` must not trigger the linked screen or leak another user's values; Tasks 1 and 3 test it.
- Unknown API and non-API failures must keep the user's selection and show a diagnostic code/status; Task 4 tests both.

---

### Task 1: Emit dedicated wallet conflict codes

**Files:**
- Modify: `backend/src/main/java/com/ssafy/b204/common/error/ErrorCode.java`
- Modify: `backend/src/main/java/com/ssafy/b204/wallet/service/WalletService.java`
- Modify: `backend/src/test/java/com/ssafy/b204/MemberWalletTeamFlowTest.java`
- Test: `backend/src/test/java/com/ssafy/b204/common/error/ErrorCodeTest.java`
- Modify: `docs/design/01_API_공통_응답_규격.md`
- Modify: `docs/design/api/parts/03_wallet.yaml`
- Generate: `docs/design/api/openapi.yaml`
- Generate: `frontend/src/shared/api/generated/openapi.ts`

**Interfaces:**
- Produces: `WALLET_ALREADY_LINKED` for a member who already owns a linked wallet.
- Produces: `WALLET_ADDRESS_IN_USE` for an address linked to a different member.

- [ ] **Step 1: Change integration expectations first**

Update duplicate registration tests to assert the two exact codes and that the response body never contains the other member's address, email, name, or ID.

```java
.andExpect(status().isConflict())
.andExpect(jsonPath("$.code").value("WALLET_ADDRESS_IN_USE"))
.andExpect(content().string(not(containsString(otherEmail))));
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend; ./gradlew test --tests '*MemberWalletTeamFlowTest' --tests '*ErrorCodeTest'`

Expected: FAIL because both cases return `COMMON_CONFLICT`.

- [ ] **Step 3: Add and use the dedicated codes**

Add `WALLET_ALREADY_LINKED 409` and `WALLET_ADDRESS_IN_USE 409` to the current common response specification, then replace all duplicate checks in challenge and register paths consistently. Keep security logs limited to current `memberId`; do not log the owner of the existing address.

```java
if (walletRepository.existsByMemberId(memberId)) {
    throw new BusinessException(ErrorCode.WALLET_ALREADY_LINKED);
}
if (walletRepository.existsByAddress(normalizedAddress)) {
    throw new BusinessException(ErrorCode.WALLET_ADDRESS_IN_USE);
}
```

- [ ] **Step 4: Rebuild the API contract and generated types**

```powershell
cd docs/design/api
python build.py
cd ../../../frontend
pnpm gen:api
```

- [ ] **Step 5: Run wallet/backend regressions**

Run: `cd backend; ./gradlew test --tests '*MemberWalletTeamFlowTest' --tests '*ErrorCodeTest'`

Expected: PASS.

- [ ] **Step 6: Commit backend wallet codes**

```powershell
git add backend/src/main/java/com/ssafy/b204/common/error/ErrorCode.java backend/src/main/java/com/ssafy/b204/wallet/service/WalletService.java backend/src/test/java/com/ssafy/b204/MemberWalletTeamFlowTest.java backend/src/test/java/com/ssafy/b204/common/error/ErrorCodeTest.java docs/design/01_API_공통_응답_규격.md docs/design/api/parts/03_wallet.yaml docs/design/api/openapi.yaml frontend/src/shared/api/generated/openapi.ts
git commit -m "fix: 지갑 중복 사유를 전용 코드로 구분한다" -m "S15P21B204-99"
```

### Task 2: Check for an existing wallet before showing actions

**Files:**
- Modify: `frontend/src/features/wallet/WalletOnboarding.tsx`
- Modify: `frontend/src/pages/WalletOnboardingPage.tsx`
- Modify: `frontend/src/pages/WalletOnboardingPage.test.tsx`
- Modify: `frontend/src/features/wallet/wallet-refresh.css`

**Interfaces:**
- Produces: onboarding phase `{ kind: 'checking' }`.
- Consumes: `useMyWallet()` enabled on entry.

- [ ] **Step 1: Write failing preflight tests**

Test that the initial render says `등록된 지갑을 확인하고 있어요`, has no creation button, 200 renders linked immediately, 404 opens choose, and network/500 renders a retry action without opening choose.

```tsx
renderPage({ walletQuery: pendingQuery() })
expect(screen.getByText('등록된 지갑을 확인하고 있어요')).toBeVisible()
expect(screen.queryByRole('button', { name: '계속' })).not.toBeInTheDocument()
```

- [ ] **Step 2: Run and verify failure**

Run: `cd frontend; pnpm test -- src/pages/WalletOnboardingPage.test.tsx`

Expected: FAIL because the query is disabled and the first phase is `choose`.

- [ ] **Step 3: Implement checking, linked, no-wallet, and failed-read states**

Use query data/error directly instead of a one-shot mount effect. A retry calls `walletQuery.refetch()`. Only `isWalletNotFound(error)` opens choice.

```ts
const phase = walletQuery.isPending
  ? { kind: 'checking' as const }
  : walletQuery.data
    ? { kind: 'linked' as const, wallet: walletQuery.data }
    : isWalletNotFound(walletQuery.error)
      ? { kind: 'choose' as const }
      : { kind: 'read-failed' as const, error: walletQuery.error }
```

- [ ] **Step 4: Run onboarding tests**

Run: `cd frontend; pnpm test -- src/pages/WalletOnboardingPage.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit preflight UX**

```powershell
git add frontend/src/features/wallet/WalletOnboarding.tsx frontend/src/pages/WalletOnboardingPage.tsx frontend/src/pages/WalletOnboardingPage.test.tsx frontend/src/features/wallet/wallet-refresh.css
git commit -m "feat: 지갑 등록 전에 기존 연결을 확인한다" -m "S15P21B204-99"
```

### Task 3: Recover create-time races without ambiguity

**Files:**
- Modify: `frontend/src/features/wallet/walletView.ts`
- Modify: `frontend/src/features/wallet/walletView.test.ts`
- Modify: `frontend/src/pages/WalletOnboardingPage.tsx`
- Modify: `frontend/src/pages/WalletOnboardingPage.test.tsx`

**Interfaces:**
- Produces: `OnboardingFailure = 'ALREADY_LINKED' | 'ADDRESS_IN_USE' | 'CHALLENGE_EXPIRED' | 'SIGNATURE_INVALID' | 'EXTERNAL_SERVICE_ERROR' | 'UNKNOWN'`.
- Consumes: dedicated backend error codes.

- [ ] **Step 1: Write failing classification and race tests**

Assert `WALLET_ALREADY_LINKED` refetches and transitions to linked, `WALLET_ADDRESS_IN_USE` stays on choose with a different-account action, and neither code falls through to `COMMON_EXTERNAL_SERVICE_ERROR`.

- [ ] **Step 2: Run and verify failure**

Run: `cd frontend; pnpm test -- src/features/wallet/walletView.test.ts src/pages/WalletOnboardingPage.test.tsx`

Expected: FAIL because both paths are still grouped with `COMMON_CONFLICT`.

- [ ] **Step 3: Implement code-only recovery**

Remove `COMMON_CONFLICT` from the already-linked mapping. Keep it as an unknown conflict that displays its diagnostic code; only `WALLET_ALREADY_LINKED` may invoke `recoverAlreadyLinkedWallet()`.

```ts
switch (getApiErrorCode(error)) {
  case 'WALLET_ALREADY_LINKED':
    await recoverAlreadyLinkedWallet()
    return
  case 'WALLET_ADDRESS_IN_USE':
    setFailure('ADDRESS_IN_USE')
    return
  default:
    setFailure('UNKNOWN')
}
```

- [ ] **Step 4: Run race tests**

Run: `cd frontend; pnpm test -- src/features/wallet/walletView.test.ts src/pages/WalletOnboardingPage.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit race handling**

```powershell
git add frontend/src/features/wallet/walletView.ts frontend/src/features/wallet/walletView.test.ts frontend/src/pages/WalletOnboardingPage.tsx frontend/src/pages/WalletOnboardingPage.test.tsx
git commit -m "fix: 지갑 중복 등록 경쟁을 안전하게 복구한다" -m "S15P21B204-99"
```

### Task 4: Replace vague wallet/media failures with actionable errors

**Files:**
- Create: `frontend/src/shared/api/actionableError.ts`
- Create: `frontend/src/shared/api/actionableError.test.ts`
- Modify: `frontend/src/shared/api/errorMessages.ts`
- Modify: `frontend/src/shared/api/errorMessages.test.ts`
- Modify: `frontend/src/features/wallet/WalletOnboarding.tsx`
- Modify: `frontend/src/pages/WalletOnboardingPage.tsx`
- Modify: `frontend/src/features/studio/media/MediaErrorPanel.tsx`

**Interfaces:**
- Produces: `ActionableError { code, cause, impact, action, retryable, status? }`.
- Produces: `toActionableError(error, context, language)`.

- [ ] **Step 1: Write failing message coverage tests**

Test all `FILE_*`, `WALLET_*`, offline, timeout, decode, Canvas, memory, rate limit with `Retry-After`, and unknown API/non-API errors. Assert no touched flow renders `잠시 문제가 있었어요` or `Something went wrong`.

```ts
const result = toActionableError(api('FILE_STORAGE_FAILED', 500), 'media-upload', 'ko')
expect(result).toMatchObject({
  cause: '서버 저장소에 이미지를 기록하지 못했습니다.',
  impact: '입력한 공연 정보와 편집 내용은 이 화면에 남아 있습니다.',
  action: '잠시 후 이미지 업로드만 다시 시도해 주세요.',
  retryable: true,
})
```

- [ ] **Step 2: Run and verify failure**

Run: `cd frontend; pnpm test -- src/shared/api/actionableError.test.ts src/shared/api/errorMessages.test.ts src/pages/WalletOnboardingPage.test.tsx`

Expected: FAIL because the shared model does not exist and wallet has vague fallback text.

- [ ] **Step 3: Implement the model and update both flows**

For unknown errors use:

```text
요청을 완료하지 못했습니다.
입력한 내용은 이 화면에 남아 있습니다.
다시 시도해도 계속되면 오류 코드 <code-or-status>를 전달해 주세요.
```

Do not show stack traces, storage paths, raw fetch bodies, or another account's data.

- [ ] **Step 4: Run message coverage tests**

Run: `cd frontend; pnpm test -- src/shared/api/actionableError.test.ts src/shared/api/errorMessages.test.ts src/pages/WalletOnboardingPage.test.tsx src/features/studio/media/MediaErrorPanel.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit actionable errors**

```powershell
git add frontend/src/shared/api frontend/src/features/wallet/WalletOnboarding.tsx frontend/src/pages/WalletOnboardingPage.tsx frontend/src/features/studio/media/MediaErrorPanel.tsx
git commit -m "fix: 지갑과 이미지 오류를 원인별로 안내한다" -m "S15P21B204-99"
```

### Task 5: Run final wallet/error and branch verification

**Files:**
- Verify only.

**Interfaces:**
- Produces: green regression evidence for merge request review.

- [ ] **Step 1: Run backend wallet tests**

Run: `cd backend; ./gradlew test --tests '*MemberWalletTeamFlowTest' --tests '*ErrorCodeTest'`

Expected: PASS.

- [ ] **Step 2: Run frontend wallet/media tests**

```powershell
cd frontend
pnpm test -- src/pages/WalletOnboardingPage.test.tsx src/features/wallet src/features/studio/media src/shared/api/actionableError.test.ts src/shared/api/errorMessages.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run all project quality gates**

```powershell
cd frontend
pnpm test
pnpm typecheck
pnpm lint
pnpm build
cd ../backend
./gradlew test
```

Expected: all pass.

- [ ] **Step 4: Manually verify the race and privacy paths**

Open the onboarding URL with an existing-wallet account, a no-wallet account, and two accounts attempting the same address. Confirm creation actions never flash for the first account and no other-account data appears for the third.

- [ ] **Step 5: Check final repository state**

Run: `git status --short; git diff --check; git log --oneline origin/develop..HEAD`

Expected: only planned commits, all with a Jira key in the body, and no secret files.
