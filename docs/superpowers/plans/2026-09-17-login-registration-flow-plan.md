# Social Login Registration Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 회원은 가입 정보를 다시 입력하지 않고 로그인하고, 신규 회원만 Web3Auth 인증 뒤 국가와 약관을 제출하게 한다.

**Architecture:** 백엔드는 회원 조회 결과에 따라 `AUTH_SIGNUP_REQUIRED`(409)를 반환하고, 프론트는 Web3Auth 연결의 최소 신원 값을 LoginPage 메모리에 잠시 보관한다. 가입 화면 제출은 같은 API를 다시 호출하되 OAuth 팝업을 다시 열지 않으며, 국가 옵션은 정적 자국어 이름과 현재 UI 언어 번역을 조합한다.

**Tech Stack:** Spring Boot, JPA, MockMvc, React 19, TypeScript, TanStack Query, Vitest, Testing Library, OpenAPI YAML

**Spec:** `docs/superpowers/specs/2026-09-17-login-registration-flow-design.md`

## Global Constraints

- UI 언어는 `en`과 `ko`만 지원한다.
- `idToken`, 지갑 주소, 제공자는 LoginPage 메모리에만 두고 브라우저 저장소·URL·로그에 남기지 않는다.
- 클라이언트 분기는 HTTP 메시지가 아니라 `code`만 사용한다.
- 기존 회원의 로그인과 신규 회원 가입 모두 같은 `POST /api/v1/auth/web3auth`를 사용한다.
- 신규 가입 완료 요청에서만 `countryCode`, `termsAgreed`, `privacyAgreed`가 필수다.
- OpenAPI 생성물 `docs/design/api/openapi.yaml`은 직접 편집하지 않고 `docs/design/api/build.py`로 생성한다.
- 기존 지갑 온보딩, `/signup`, `from` 복귀와 Web3Auth 사용자 취소 동작을 유지한다.

## File Structure

- `backend/src/main/java/com/ssafy/b204/common/error/ErrorCode.java` — 가입 필요 오류 코드 정본
- `backend/src/main/java/com/ssafy/b204/member/service/MemberService.java` — 기존 회원 조회와 신규 가입 요청 분리
- `backend/src/test/java/com/ssafy/b204/MemberWalletTeamFlowTest.java` — 실제 HTTP 계약 회귀 테스트
- `frontend/src/shared/api/errorCodes.ts` — 프론트 인증 분기 코드
- `frontend/src/pages/LoginPage.tsx` — OAuth 연결 보관, 가입 재요청, 라우팅
- `frontend/src/pages/LoginPage.test.tsx` — 로그인·가입 상태 전이 테스트
- `frontend/src/pages/LoginPage.loading.test.tsx` — 단계별 작업 오버레이 회귀 테스트
- `frontend/src/features/member/LoginScreen.tsx` — 소셜 로그인 화면과 조건부 가입 폼
- `frontend/src/features/member/LoginScreen.test.tsx` — 화면 상태와 접근성 테스트
- `frontend/src/features/member/localeOptions.ts` — 국가 자국어 명칭 정본과 옵션 생성
- `frontend/src/features/member/localeOptions.test.ts` — 자국어·번역·폴백 테스트
- `frontend/src/features/member/memberErrors.ts` — 가입 필요 코드를 일반 오류로 표시하지 않게 하는 문구 계약
- `docs/design/api/parts/01_member.yaml` — API-member-01 409 계약
- `docs/design/api/openapi.yaml` — 생성된 기계 판독 계약
- `docs/design/01_API_공통_응답_규격.md` — `AUTH_SIGNUP_REQUIRED` 정의
- `docs/design/05_기능_명세서_v6.md` — F-member-01 흐름
- `docs/design/06_API_명세서_v6.md` — API-member-01 요청·응답
- `docs/design/07_화면설계_v6.md` — C-01 조건부 가입 화면
- `_workspace/qa_login_registration.md` — 커밋하지 않는 통합 QA 기록

---

### Task 1: Backend Signup-Required Contract

**Files:**
- Modify: `backend/src/main/java/com/ssafy/b204/common/error/ErrorCode.java`
- Modify: `backend/src/main/java/com/ssafy/b204/member/service/MemberService.java`
- Test: `backend/src/test/java/com/ssafy/b204/MemberWalletTeamFlowTest.java`

**Interfaces:**
- Consumes: `Web3AuthLoginRequest`의 선택 필드 `countryCode`, `termsAgreed`, `privacyAgreed`
- Produces: `ErrorCode.AUTH_SIGNUP_REQUIRED` with HTTP 409; 가입 정보가 없는 신규 신원에는 영속화·세션 발급 없이 예외

- [ ] **Step 1: Write the failing HTTP tests**

`MemberWalletTeamFlowTest`에 다음 계약을 추가한다.

```java
mvc.perform(post("/api/v1/auth/web3auth")
        .contentType(APPLICATION_JSON)
        .content(web3AuthBody(token, address, "GOOGLE", null, null, null)))
    .andExpect(status().isConflict())
    .andExpect(jsonPath("$.code").value("AUTH_SIGNUP_REQUIRED"));
assertThat(memberRepository.findByAuthProviderAndProviderUserId(GOOGLE, subject)).isEmpty();
```

같은 신원을 가입 필드와 다시 보내면 200이고, 세 번째 요청은 가입 필드 없이도 200이며 회원 수가 하나인지 검증한다. 기존 회원이 가입 필드 없이 로그인되는 기존 테스트도 명시적으로 남긴다.

- [ ] **Step 2: Run the focused backend test and verify RED**

Run from `backend`: `./gradlew test --tests com.ssafy.b204.MemberWalletTeamFlowTest`

Expected: 신규 신원 첫 요청이 현재 `COMMON_VALIDATION_FAILED` 400이라 실패한다.

- [ ] **Step 3: Add the error code and minimal service branch**

```java
AUTH_SIGNUP_REQUIRED(HttpStatus.CONFLICT, "가입 정보를 입력해 주세요."),
```

회원 조회 뒤 신규 신원이고 가입 정보가 하나도 없으면 `AUTH_SIGNUP_REQUIRED`를 던진다. 일부 값이 들어왔지만 세 필드가 완성되지 않았거나 동의가 `true`가 아니면 기존 `COMMON_VALIDATION_FAILED`를 유지한다. 이 분기는 `memberRepository.save`, `issueSession`보다 앞에 둔다.

- [ ] **Step 4: Run the focused backend test and verify GREEN**

Run from `backend`: `./gradlew test --tests com.ssafy.b204.MemberWalletTeamFlowTest`

Expected: PASS, 신규 첫 요청 뒤 회원과 refresh token이 만들어지지 않는다.

- [ ] **Step 5: Commit the backend contract**

```bash
git add -- backend/src/main/java/com/ssafy/b204/common/error/ErrorCode.java backend/src/main/java/com/ssafy/b204/member/service/MemberService.java backend/src/test/java/com/ssafy/b204/MemberWalletTeamFlowTest.java
git commit -m "feat: 신규 소셜 가입 분기"
```

### Task 2: Native Country Names

**Files:**
- Modify: `frontend/src/features/member/localeOptions.ts`
- Create: `frontend/src/features/member/localeOptions.test.ts`

**Interfaces:**
- Consumes: `SupportedLanguage = 'en' | 'ko'`
- Produces: `countryNativeName(code: string): string | undefined`; `countryOptions(locale): { value; label; sub }[]`

- [ ] **Step 1: Write failing country option tests**

```ts
const option = (code: string, locale: SupportedLanguage) =>
  countryOptions(locale).find((entry) => entry.value === code)

expect(option('KR', 'en')).toEqual({ value: 'KR', label: '대한민국', sub: 'South Korea · KR' })
expect(option('JP', 'ko').label).toBe('日本')
expect(option('DE', 'ko').label).toBe('Deutschland')
expect(option('US', 'en').sub).toBe('US')
expect(countryNativeName('ZZ')).toBeUndefined()
```

또한 `countryOptions('en').map(value)`와 `countryOptions('ko').map(value)`가 같아 UI 언어 전환 때 순서가 고정되는지 검증한다.

- [ ] **Step 2: Run the locale test and verify RED**

Run from `frontend`: `pnpm test -- src/features/member/localeOptions.test.ts`

Expected: `countryNativeName`가 없고 기존 라벨이 UI 언어 번역이라 실패한다.

- [ ] **Step 3: Add the reviewed 40-country native-name map**

```ts
const COUNTRY_NATIVE_NAMES: Record<(typeof COUNTRY_CODES)[number], string> = {
  US: 'United States', KR: '대한민국', JP: '日本', CN: '中国', TW: '臺灣',
  HK: '香港', SG: 'Singapore', TH: 'ประเทศไทย', VN: 'Việt Nam', PH: 'Pilipinas',
  ID: 'Indonesia', MY: 'Malaysia', IN: 'भारत / India', AU: 'Australia',
  NZ: 'Aotearoa New Zealand', CA: 'Canada', MX: 'México', BR: 'Brasil',
  AR: 'Argentina', CL: 'Chile', GB: 'United Kingdom', IE: 'Éire / Ireland',
  FR: 'France', DE: 'Deutschland', NL: 'Nederland',
  BE: 'België / Belgique / Belgien', ES: 'España', PT: 'Portugal', IT: 'Italia',
  CH: 'Schweiz / Suisse / Svizzera', AT: 'Österreich', SE: 'Sverige',
  NO: 'Norge', DK: 'Danmark', FI: 'Suomi', PL: 'Polska', CZ: 'Česko',
  TR: 'Türkiye', AE: 'الإمارات العربية المتحدة', SA: 'المملكة العربية السعودية',
}
```

`label`은 자국어 이름, `sub`는 번역명이 다를 때 `${localized} · ${code}`, 같으면 코드만 사용한다. 정렬은 자국어 이름으로 한 번 고정해 두고 locale에 따라 다시 정렬하지 않는다.

- [ ] **Step 4: Run the locale test and verify GREEN**

Run from `frontend`: `pnpm test -- src/features/member/localeOptions.test.ts`

Expected: PASS for both UI languages and the fallback helper.

- [ ] **Step 5: Commit the country labels**

```bash
git add -- frontend/src/features/member/localeOptions.ts frontend/src/features/member/localeOptions.test.ts
git commit -m "feat: 국가 자국어 이름 표시"
```

### Task 3: Frontend Two-Step Login State Machine

**Files:**
- Modify: `frontend/src/shared/api/errorCodes.ts`
- Modify: `frontend/src/features/member/memberErrors.ts`
- Modify: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/pages/LoginPage.test.tsx`
- Modify: `frontend/src/pages/LoginPage.loading.test.tsx`
- Modify: `frontend/src/features/member/LoginScreen.tsx`
- Modify: `frontend/src/features/member/LoginScreen.test.tsx`

**Interfaces:**
- Consumes: API error `AUTH_SIGNUP_REQUIRED`; `Web3AuthConnection = { idToken; address; socialProvider }`
- Produces: `registrationRequired: boolean`, `onRegistrationSubmit()`, `onRegistrationCancel()` UI contract; `AuthCode.SIGNUP_REQUIRED`

- [ ] **Step 1: Replace the old pre-OAuth form tests with failing state-transition tests**

`LoginPage.test.tsx`에서 다음을 검증한다.

```ts
const signupRequired = new ApiError({
  code: 'AUTH_SIGNUP_REQUIRED',
  status: 409,
  msg: '가입 정보를 입력해 주세요.',
})

expect(screenProps.registrationRequired).toBe(false)
await screenProps.onSignIn('GOOGLE')
expect(connectSocial).toHaveBeenCalledTimes(1)

login.mockRejectedValueOnce(signupRequired)
await screenProps.onSignIn('GOOGLE')
expect(screenProps.registrationRequired).toBe(true)
await screenProps.onRegistrationSubmit()
expect(connectSocial).toHaveBeenCalledTimes(1)
expect(login).toHaveBeenLastCalledWith(expect.objectContaining({ countryCode: 'KR', termsAgreed: true, privacyAgreed: true }))
```

성공, 취소, 언마운트 뒤 임시 연결을 재사용할 수 없고, 기존 회원 성공 시 가입 폼이 나타나지 않는 테스트도 추가한다.

`LoginScreen.test.tsx`는 최초 화면에서 가입 필드가 없고 소셜 버튼이 활성화되는지, 가입 필요 상태에만 국가·체크박스·제출·취소가 나타나며 미완성 제출이 비활성인지 검증한다.

- [ ] **Step 2: Run focused frontend tests and verify RED**

Run from `frontend`: `pnpm test -- src/pages/LoginPage.test.tsx src/pages/LoginPage.loading.test.tsx src/features/member/LoginScreen.test.tsx`

Expected: 새 props와 상태 전이가 없어 실패한다.

- [ ] **Step 3: Implement the minimal in-memory state machine**

`LoginPage`에 `pendingConnection` 상태를 추가한다. 첫 로그인 요청은 가입 필드를 보내지 않는다. `isApiError(error) && error.code === AuthCode.SIGNUP_REQUIRED`이면 연결을 보관하고 가입 단계를 연다. 제출은 보관된 연결과 폼 값을 사용해 API만 다시 호출한다.

```ts
export const AuthCode = {
  TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  SIGNUP_REQUIRED: 'AUTH_SIGNUP_REQUIRED',
} as const
```

공통 `completeLogin(session)` 함수가 기존 목적지 계산과 navigate를 한 곳에서 수행한다. 가입 취소·성공·언마운트 시 `pendingConnection`을 비우며 idToken을 출력하지 않는다.

- [ ] **Step 4: Render social and registration modes accessibly**

`LoginScreen`은 `registrationRequired=false`일 때 소셜 버튼만, `true`일 때 `fieldset`과 Submit/Cancel만 그린다. 등록 중 오버레이 문구는 `Creating your account… / 계정을 만들고 있어요…`로 구분한다. 일반 로그인 오류는 기존 alert 규칙을 유지하되 가입 필요 코드는 alert로 출력하지 않는다.

- [ ] **Step 5: Run focused frontend tests and verify GREEN**

Run from `frontend`: `pnpm test -- src/pages/LoginPage.test.tsx src/pages/LoginPage.loading.test.tsx src/features/member/LoginScreen.test.tsx src/features/member/localeOptions.test.ts`

Expected: PASS and `connectSocial` is called once across the new-user flow.

- [ ] **Step 6: Commit the frontend flow**

```bash
git add -- frontend/src/shared/api/errorCodes.ts frontend/src/features/member/memberErrors.ts frontend/src/pages/LoginPage.tsx frontend/src/pages/LoginPage.test.tsx frontend/src/pages/LoginPage.loading.test.tsx frontend/src/features/member/LoginScreen.tsx frontend/src/features/member/LoginScreen.test.tsx
git commit -m "feat: 소셜 로그인 가입 단계 분리"
```

### Task 4: Contract Documentation and Integration Verification

**Files:**
- Modify: `docs/design/api/parts/01_member.yaml`
- Modify: `docs/design/api/openapi.yaml`
- Modify: `docs/design/01_API_공통_응답_규격.md`
- Modify: `docs/design/05_기능_명세서_v6.md`
- Modify: `docs/design/06_API_명세서_v6.md`
- Modify: `docs/design/07_화면설계_v6.md`
- Create locally only: `_workspace/qa_login_registration.md`

**Interfaces:**
- Consumes: Tasks 1-3의 실제 HTTP 코드, request shape, UI state
- Produces: 동일한 `AUTH_SIGNUP_REQUIRED` 409 계약을 설명하는 Markdown/OpenAPI와 QA 증거

- [ ] **Step 1: Update the source contract documents**

API-member-01에 첫 요청의 선택 가입 필드, 신규 신원의 409 응답, 두 번째 요청의 필수 조건을 적는다. C-01은 최초 소셜 버튼 화면과 인증 뒤 가입 화면을 분리한다. 공통 응답 규격 §3 AUTH 표에 `AUTH_SIGNUP_REQUIRED | 409`와 “회원·세션 미생성”을 추가한다.

- [ ] **Step 2: Regenerate and lint OpenAPI**

Run from `docs/design/api`: `python build.py`

Run: `npx -y @redocly/cli lint openapi.yaml`

Expected: generated `openapi.yaml` contains API-member-01 409 `AUTH_SIGNUP_REQUIRED`; lint has 0 errors.

- [ ] **Step 3: Regenerate frontend API types**

Run from `frontend`: `pnpm gen:api`

Expected: generated types remain compatible with optional signup fields; commit the generated file only if its content changes.

- [ ] **Step 4: Run the full verification suite**

Run from `backend`: `./gradlew test`

Run from `frontend`:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 5: Record integration QA without committing it**

`_workspace/qa_login_registration.md`에 백엔드 DTO/오류 코드, 프론트 요청/분기, OpenAPI/Markdown 일치 여부와 각 검증 명령 결과를 적는다. 로컬 HTTPS 수동 테스트가 환경상 불가능하면 자동 검증과 분리해 `NOT_RUN` 및 이유를 기록한다.

- [ ] **Step 6: Commit docs and generated contract**

```bash
git add -- docs/design/api/parts/01_member.yaml docs/design/api/openapi.yaml docs/design/01_API_공통_응답_규격.md docs/design/05_기능_명세서_v6.md docs/design/06_API_명세서_v6.md docs/design/07_화면설계_v6.md frontend/src/shared/api/generated/openapi.ts
git commit -m "docs: 소셜 가입 계약 동기화"
```

Do not add `_workspace/qa_login_registration.md`.

### Task 5: Final Review and Merge Request

**Files:**
- Review: all files changed since `origin/develop`

**Interfaces:**
- Consumes: Tasks 1-4 complete and green
- Produces: review-ready branch and GitLab merge request

- [ ] **Step 1: Review branch scope and secrets**

Run:

```bash
git status --short
git diff --check origin/develop...HEAD
git diff --stat origin/develop...HEAD
git log --oneline origin/develop..HEAD
git diff origin/develop...HEAD -- . ':!docs/design/api/openapi.yaml' ':!frontend/src/shared/api/generated/openapi.ts'
```

Expected: no `.env`, token, private key, `_workspace`, or unrelated file is tracked.

- [ ] **Step 2: Perform browser smoke checks**

In local HTTPS, verify one existing social account bypasses registration and one fresh identity reaches registration then completes without a second popup. Check English/Korean switching, keyboard focus, 360px width, cancel, user-rejected popup, and retry after API failure.

- [ ] **Step 3: Push and create the MR**

Push `fix/fe/login-registration`, create an MR targeting `develop`, summarize the two-request new-member flow, list the dedicated error code and security boundary, and include exact automated/manual verification evidence.

- [ ] **Step 4: Merge only after review and CI**

Inspect MR discussions and Jenkins/GitLab pipeline. Resolve actionable review feedback with tests, rerun affected/full checks, and merge only when required approvals and CI are green.
