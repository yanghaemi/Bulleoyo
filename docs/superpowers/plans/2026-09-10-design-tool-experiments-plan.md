# Stage Ledger Design Tool Experiments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Motion, Anime.js, Bklit UI, animated brand loading, and a development-only Design Lab을 기존 Stage Ledger 흐름을 훼손하지 않고 검증 가능한 형태로 적용한다.

**Architecture:** 상태 전환은 `shared/ui/MotionDisclosure`, 로고 모션은 `shared/ui/AnimatedBrandLogo`와 `BrandLoader`, 차트 데이터 변환은 `shared/charts`에 격리한다. Anime.js와 Bklit은 사용하는 lazy route 청크 안에만 남기고, 기존 표·숫자·내비게이션은 항상 fallback이자 정보 정본으로 유지한다.

**Tech Stack:** React 19, TypeScript 5.6, Vite 7, Tailwind CSS 4, Motion 13, Anime.js 4, Bklit UI shadcn registry, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-09-10-design-tool-experiments-design.md`

## Global Constraints

- 기존 의존 방향 `app → pages → features → shared`를 유지한다.
- 백엔드, 스마트 컨트랙트, 정산 공식, API 응답 의미를 변경하지 않는다.
- 애니메이션 없이도 모든 정보와 액션을 사용할 수 있어야 한다.
- UI 상태 전환은 300ms 이하, 예매 완료와 로딩 로고의 전체 sequence만 800ms/2.4초 예외를 허용한다.
- `prefers-reduced-motion: reduce`에서는 이동·회전·stagger를 실행하지 않는다.
- 큰 브랜드 로더는 route fallback에만 사용하고 버튼·부분 패널은 기존 `Spinner`를 유지한다.
- Bklit 차트는 기존 표와 카드의 보조 표현이며 정본 데이터를 계산하거나 저장하지 않는다.
- 개발 전용 `/__lab/design-tools` 라우트는 production route 배열에 존재하지 않아야 한다.
- 제안, 구현, 자동 검증, 수동 검증을 인계 문서에서 구분한다.

---

### Task 1: Dependencies and motion primitives

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/pnpm-lock.yaml`
- Create: `frontend/components.json`
- Create via registry: `frontend/src/charts/**`
- Create: `frontend/src/shared/ui/MotionDisclosure.tsx`
- Create: `frontend/src/shared/ui/MotionDisclosure.test.tsx`
- Modify: `frontend/src/shared/ui/index.ts`

**Interfaces:**
- Consumes: `motion/react`, Bklit `@bklit/bar-chart` registry, `animejs`.
- Produces: `MotionDisclosure({ open, children, className?, id? })` and generated Bklit chart primitives.

- [x] **Step 1: Write the failing disclosure test**

```tsx
render(<MotionDisclosure open={false}>details</MotionDisclosure>)
expect(screen.queryByText('details')).not.toBeInTheDocument()
rerender(<MotionDisclosure open>details</MotionDisclosure>)
expect(screen.getByText('details')).toBeVisible()
```

- [x] **Step 2: Run the focused test and confirm the missing module failure**

Run: `pnpm --dir frontend test -- src/shared/ui/MotionDisclosure.test.tsx`

Expected: FAIL because `MotionDisclosure` does not exist.

- [x] **Step 3: Install Anime.js and import one Bklit bar chart through its registry**

Run:

```powershell
pnpm --dir frontend add animejs
pnpm --dir frontend dlx shadcn@latest add '@bklit/bar-chart' --yes
```

Before the registry command, create `frontend/components.json` with React/TypeScript, `frontend/src/styles.css`, `@/*` aliases, and the `@bklit` registry URL. Preserve existing Tailwind tokens; do not run a shadcn initializer that rewrites `styles.css`.

- [x] **Step 4: Implement the minimal disclosure primitive**

```tsx
<AnimatePresence initial={false}>
  {open ? (
    <motion.div
      id={id}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  ) : null}
</AnimatePresence>
```

Use `useReducedMotion()` and hide overflow only on the animated wrapper.

- [x] **Step 5: Run disclosure tests and typecheck**

Run:

```powershell
pnpm --dir frontend test -- src/shared/ui/MotionDisclosure.test.tsx
pnpm --dir frontend typecheck
```

Expected: PASS.

- [x] **Step 6: Commit the dependency boundary**

```powershell
git add frontend/package.json frontend/pnpm-lock.yaml frontend/components.json frontend/src/charts frontend/src/shared/ui/MotionDisclosure.tsx frontend/src/shared/ui/MotionDisclosure.test.tsx frontend/src/shared/ui/index.ts
git commit -m "feat(fe): 디자인 실험 런타임 경계를 추가"
```

### Task 2: Motion disclosures in product screens

**Files:**
- Modify: `frontend/src/features/wallet/WalletScreen.tsx`
- Modify: `frontend/src/features/verify/SupplyDisclosure.tsx`
- Modify: `frontend/src/features/studio/SettlementRules.tsx`
- Create: `frontend/src/features/wallet/WalletScreen.motion.test.tsx`
- Create: `frontend/src/features/verify/SupplyDisclosure.motion.test.tsx`
- Create: `frontend/src/features/studio/SettlementRules.motion.test.tsx`

**Interfaces:**
- Consumes: `MotionDisclosure` from Task 1.
- Produces: accessible enter/exit transitions without changing feature props or data contracts.

- [x] **Step 1: Write failing interaction tests**

For each screen, click the existing toggle, assert `aria-expanded="true"`, and assert the associated content exists. Click again and wait for content removal. For `SupplyDisclosure`, assert `aria-controls` points to the disclosure id.

```tsx
await user.click(screen.getByRole('button', { name: /On-chain details/i }))
expect(screen.getByRole('button', { name: /On-chain details/i })).toHaveAttribute('aria-expanded', 'true')
expect(screen.getByText(/토큰 컨트랙트/i)).toBeInTheDocument()
```

- [x] **Step 2: Run the three focused tests and confirm failure**

Run: `pnpm --dir frontend test -- WalletScreen.motion SupplyDisclosure.motion SettlementRules.motion`

Expected: at least the new `aria-controls`/animated wrapper assertions fail.

- [x] **Step 3: Replace conditional blocks with MotionDisclosure**

- Wallet `GRANT`: 180ms enter, 140ms exit through the shared default.
- Supply details: `id="supply-technical-details"`; rotate chevron with a 160ms CSS transition.
- Mobile simulation: `id="settlement-simulation"`; keep desktop panel unwrapped.

Do not animate displayed currency or transaction identifiers.

- [x] **Step 4: Run focused and existing feature tests**

Run:

```powershell
pnpm --dir frontend test -- WalletScreen.motion SupplyDisclosure.motion SettlementRules.motion walletGrouping
pnpm --dir frontend typecheck
```

Expected: PASS.

- [x] **Step 5: Commit Motion product usage**

```powershell
git add frontend/src/features/wallet frontend/src/features/verify/SupplyDisclosure.tsx frontend/src/features/studio/SettlementRules.tsx
git commit -m "feat(fe): 상태 패널 전환을 Motion으로 연결"
```

### Task 3: Animated brand logo and route loader

**Files:**
- Create: `frontend/src/shared/ui/AnimatedBrandLogo.tsx`
- Create: `frontend/src/shared/ui/BrandLoader.tsx`
- Create: `frontend/src/shared/ui/AnimatedBrandLogo.test.tsx`
- Create: `frontend/src/styles/fx-brand.css`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/shared/ui/AppHeader.tsx`
- Modify: `frontend/src/shared/ui/index.ts`
- Modify: `frontend/src/app/providers.tsx`

**Interfaces:**
- Produces: `AnimatedBrandLogo({ height, mode: 'static' | 'header' | 'loader', className? })` and `BrandLoader({ label? })`.
- Consumes: Anime.js `createScope`/`createTimeline` only when `mode="loader"`; header mode uses CSS.

- [x] **Step 1: Write failing brand behavior tests**

```tsx
render(<AnimatedBrandLogo mode="header" height={26} />)
expect(screen.getByRole('img', { name: '불러요' })).toHaveAttribute('data-motion-mode', 'header')

render(<BrandLoader label="공연을 불러오는 중" />)
expect(screen.getByRole('status')).toHaveTextContent('공연을 불러오는 중')
```

Mock `matchMedia('(prefers-reduced-motion: reduce)')` and assert that the loader root has `data-reduced-motion="true"` and does not create an Anime.js scope.

- [x] **Step 2: Run the test and confirm failure**

Run: `pnpm --dir frontend test -- src/shared/ui/AnimatedBrandLogo.test.tsx`

Expected: FAIL because both components are absent.

- [x] **Step 3: Build the replaceable SVG structure**

Use one SVG with stable groups:

```tsx
<svg role="img" aria-label="불러요" data-motion-mode={mode}>
  <g data-part="ko-word">...</g>
  <g data-part="mic-stand">...</g>
  <g data-part="mic-head">...</g>
  <g data-part="english-word">...</g>
</svg>
```

The prototype may use SVG `<text>` for `불러`/`BULLEOYO` and geometric microphone paths. Keep `data-part` stable so final vector paths can replace the artwork.

- [x] **Step 4: Implement loader timeline and cleanup**

Inside a component-scoped Anime.js scope, schedule the 0.4/0.7/0.9/1.4/1.7/2.2/2.4 second keyframes from the spec. On unmount call `scope.revert()`. Under reduced motion, render the final English wordmark without creating the scope. Do not impose a minimum visible duration.

- [x] **Step 5: Implement header micro-interaction in CSS**

Gate hover with `@media (hover: hover) and (pointer: fine)`. Animate only the microphone group for 600ms on pointer entry/focus-visible, with transform origin at the microphone base. Add a reduced-motion block that removes transform and rotation.

- [x] **Step 6: Replace header logos and add RouterProvider fallback**

Replace both `BrandLogo` instances in `AppHeader` with `AnimatedBrandLogo mode="header"` while keeping heights 22/26. Render `<BrandLoader />` as `RouterProvider fallbackElement`; retain `Spinner` everywhere else.

- [x] **Step 7: Run tests and commit**

Run:

```powershell
pnpm --dir frontend test -- AnimatedBrandLogo AppHeader lazyPage
pnpm --dir frontend typecheck
```

Expected: PASS.

```powershell
git add frontend/src/shared/ui frontend/src/styles/fx-brand.css frontend/src/styles.css frontend/src/app/providers.tsx
git commit -m "feat(fe): 브랜드 로고 로딩과 헤더 모션을 추가"
```

### Task 4: Anime.js booking completion choreography

**Files:**
- Modify: `frontend/src/features/ticket/BookingComplete.tsx`
- Create: `frontend/src/features/ticket/BookingComplete.motion.test.tsx`

**Interfaces:**
- Consumes: Anime.js scope lifecycle established in Task 3.
- Produces: one-shot, component-scoped completion sequence; existing `onViewTickets` and `onBackHome` remain unchanged.

- [x] **Step 1: Write the failing lifecycle test**

Mock Anime.js and render `BookingComplete`. Assert one scope is created, its callback registers a timeline, and unmount calls `revert`. Under reduced motion assert zero scope calls.

- [x] **Step 2: Run and confirm failure**

Run: `pnpm --dir frontend test -- BookingComplete.motion`

Expected: FAIL because no scope is created.

- [x] **Step 3: Add stable animation parts**

Mark the success icon, check paths, heading, description, information cells, and CTA group with `data-complete-part` values. Keep all elements visible by default; Anime.js sets initial visual values only after scope creation.

- [x] **Step 4: Implement the one-shot timeline**

Create an at-most-800ms sequence: icon 220ms, check reveal 280ms overlapping the icon, text 220ms, cells 180ms with 35ms stagger, CTA opacity 160ms. Use transforms and opacity only. Revert on unmount and skip under reduced motion.

- [x] **Step 5: Run tests and commit**

```powershell
pnpm --dir frontend test -- BookingComplete.motion
pnpm --dir frontend typecheck
git add frontend/src/features/ticket/BookingComplete.tsx frontend/src/features/ticket/BookingComplete.motion.test.tsx
git commit -m "feat(fe): 예매 완료 시퀀스를 Anime.js로 연출"
```

### Task 5: Bklit data adapters and accessible charts

**Files:**
- Create: `frontend/src/shared/charts/chartData.ts`
- Create: `frontend/src/shared/charts/chartData.test.ts`
- Create: `frontend/src/shared/charts/TeamPayoutChart.tsx`
- Create: `frontend/src/shared/charts/SupplyCompositionChart.tsx`
- Create: `frontend/src/shared/charts/index.ts`
- Modify: generated Bklit chart files only for alias/token compatibility proven necessary by typecheck.

**Interfaces:**
- Produces: `toTeamPayoutSeries(shares, distributableAmount)`, `toSupplyComposition(supply)`, `TeamPayoutChart`, and `SupplyCompositionChart`.
- Consumes: generated Bklit `BarChart`/`Bar` primitives and existing numeric fields.

- [x] **Step 1: Write failing pure transformation tests**

```ts
expect(toTeamPayoutSeries([{ teamId: 1, teamName: '블루노트', totalAmount: 600 }], 1000)).toEqual([
  { name: '블루노트', amount: 600, percent: 60 },
])
expect(toSupplyComposition({ totalSupply: 1000, escrowTotal: 400, walletTotal: 500 })).toMatchObject({
  matched: false,
  difference: 100,
})
```

Clamp chart percentages to 0–100 only for geometry; preserve raw amounts and signed differences for text.

- [x] **Step 2: Run transformation tests and confirm failure**

Run: `pnpm --dir frontend test -- src/shared/charts/chartData.test.ts`

Expected: FAIL because chart adapters do not exist.

- [x] **Step 3: Implement pure adapters**

Handle zero totals without division by zero, retain input order, format no strings in the adapter, and never mutate API objects.

- [x] **Step 4: Build accessible chart wrappers**

- `TeamPayoutChart`: Bklit horizontal bar, `animate={false}`, visible team/value labels, adjacent screen-reader summary.
- `SupplyCompositionChart`: one stacked horizontal Bklit bar for escrow/wallet amounts, `animate={false}`, mismatch message outside the SVG.
- Wrap chart rendering in a local error boundary that returns `null`; the parent table/cards remain visible.

- [x] **Step 5: Run chart tests and typecheck**

```powershell
pnpm --dir frontend test -- src/shared/charts
pnpm --dir frontend typecheck
```

Expected: PASS with no TypeScript patch hidden by `any` in local adapters.

- [x] **Step 6: Commit chart infrastructure**

```powershell
git add frontend/src/shared/charts frontend/src/charts frontend/package.json frontend/pnpm-lock.yaml
git commit -m "feat(fe): Bklit 기반 정산 차트 경계를 추가"
```

### Task 6: Add Bklit charts to product screens

**Files:**
- Modify: `frontend/src/features/studio/SettlementDashboard.tsx`
- Modify: `frontend/src/features/admin/CoinSupplyPanel.tsx`
- Create: `frontend/src/features/studio/SettlementDashboard.chart.test.tsx`
- Create: `frontend/src/features/admin/CoinSupplyPanel.chart.test.tsx`

**Interfaces:**
- Consumes: chart wrappers from Task 5.
- Produces: PC payout comparison and supply composition while retaining all existing semantic tables/cards.

- [x] **Step 1: Write failing integration tests**

Assert a named chart region appears when valid rows exist, no chart appears for empty shares, mismatch text contains the raw difference, and the existing table/card values remain in the DOM.

- [x] **Step 2: Run and confirm failure**

Run: `pnpm --dir frontend test -- SettlementDashboard.chart CoinSupplyPanel.chart`

Expected: FAIL because chart regions are absent.

- [x] **Step 3: Integrate the payout chart**

Render it above the desktop table only when `teams.length > 0`. Keep the mobile list and all six existing columns unchanged.

- [x] **Step 4: Integrate the supply composition**

Render it after the three numeric cards. If `escrowTotal + walletTotal !== totalSupply`, show the signed difference and do not normalize the raw amounts to fake a match.

- [x] **Step 5: Run integration and regression tests**

```powershell
pnpm --dir frontend test -- SettlementDashboard.chart CoinSupplyPanel.chart
pnpm --dir frontend typecheck
```

Expected: PASS.

- [x] **Step 6: Commit product chart usage**

```powershell
git add frontend/src/features/studio/SettlementDashboard.tsx frontend/src/features/studio/SettlementDashboard.chart.test.tsx frontend/src/features/admin/CoinSupplyPanel.tsx frontend/src/features/admin/CoinSupplyPanel.chart.test.tsx
git commit -m "feat(fe): 정산과 발행량에 보조 시각화를 추가"
```

### Task 7: Development-only Design Lab and external-tool prompts

**Files:**
- Create: `frontend/src/pages/DesignToolsLabPage.tsx`
- Create: `frontend/src/app/devRoutes.ts`
- Create: `frontend/src/app/devRoutes.test.ts`
- Modify: `frontend/src/app/router.tsx`
- Create: `docs/experiments/manus-prompts.md`
- Create: `docs/frontend/DESIGN_TOOL_EXPERIMENTS.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Produces: `buildDevRoutes(isDev: boolean)` and `/__lab/design-tools` only for development.
- Consumes: Motion disclosure, brand loader, booking complete, and chart wrappers with fixed fixtures.

- [x] **Step 1: Write the failing route gate test**

```ts
expect(buildDevRoutes(false)).toEqual([])
expect(buildDevRoutes(true)).toHaveLength(1)
expect(buildDevRoutes(true)[0]).toMatchObject({ path: '/__lab/design-tools' })
```

- [x] **Step 2: Run and confirm failure**

Run: `pnpm --dir frontend test -- src/app/devRoutes.test.ts`

Expected: FAIL because `buildDevRoutes` does not exist.

- [x] **Step 3: Implement the guarded route and lab page**

Use `...buildDevRoutes(import.meta.env.DEV)` in the existing child route array. The lab page composes production components with local fixtures and contains no API calls.

- [x] **Step 4: Write safe Manus prompts and experiment runbook**

`manus-prompts.md` must contain sanitized landing/mobile-detail prompts and forbid secrets, real accounts, actual API hosts, and user data. `DESIGN_TOOL_EXPERIMENTS.md` must list dependencies, generated Bklit files, route URLs, reduced-motion checks, removal commands, and current verification state.

- [x] **Step 5: Connect Claude handoff**

Add links from `CLAUDE.md` to the experiment spec, plan, status, decisions, and runbook. Do not duplicate their full contents.

- [x] **Step 6: Run route tests and commit**

```powershell
pnpm --dir frontend test -- devRoutes
pnpm --dir frontend typecheck
git add frontend/src/pages/DesignToolsLabPage.tsx frontend/src/app/devRoutes.ts frontend/src/app/devRoutes.test.ts frontend/src/app/router.tsx docs/experiments/manus-prompts.md docs/frontend/DESIGN_TOOL_EXPERIMENTS.md CLAUDE.md
git commit -m "feat(fe): 개발용 디자인 실험실과 인계 문서를 추가"
```

### Task 8: Full verification, visual QA, and decisions

**Files:**
- Modify: `docs/frontend/STAGE_LEDGER_STATUS.md`
- Modify: `docs/frontend/STAGE_LEDGER_DECISIONS.md`
- Modify: `docs/frontend/DESIGN_TOOL_EXPERIMENTS.md`
- Modify: this plan to check completed steps

**Interfaces:**
- Consumes: all prior tasks.
- Produces: current automated and manual evidence plus explicit keep/remove decisions.

- [x] **Step 1: Run the complete automated suite**

```powershell
pnpm --dir frontend test
pnpm --dir frontend typecheck
pnpm --dir frontend lint
pnpm --dir frontend build
```

Expected: all commands exit 0.

- [x] **Step 2: Verify bundle boundaries**

Inspect `frontend/dist/assets`. Confirm Anime.js identifiers appear only in booking/loader or lab-related lazy chunks, Bklit/visx identifiers appear only in settlement/admin/lab chunks, and the initial entry chunk remains within the documented target. Record actual file sizes instead of estimates.

- [x] **Step 3: Perform browser QA**

Check 360×800, 390×844, 768px, and 1440px for:

- no page-level horizontal overflow;
- header motion triggers once per pointer entry and does not delay navigation;
- route loader can disappear before 2.4 seconds;
- reduced motion skips movement;
- charts retain exact text/table values;
- Design Lab exists in development and is absent from production routing.

- [x] **Step 4: Record evidence and decisions**

Update status/runbook with command, exit code, date, browser size, observed result, and any unverified item. Add decision-log entries for Anime.js, Bklit, and brand-motion retention or removal based on evidence.

- [x] **Step 5: Final commit**

```powershell
git add docs/frontend docs/superpowers/plans/2026-09-10-design-tool-experiments-plan.md
git commit -m "docs(fe): 디자인 실험 검증 결과를 인계"
```
