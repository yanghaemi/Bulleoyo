# Editorial Stage Lab A/B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build two full-size, production-quality editorial performance discovery concepts plus isolated typography and navigation specimens in the existing design lab.

**Architecture:** Keep the work inside `pages/prototypes`. `PerformanceDiscoveryPrototype` owns lab-only query state and shared active-view state; focused child components render A/B, type, and navigation specimens. Both integrated concepts consume the same `DiscoveryPrototypeShow[]`. Stronger Identity composes the existing `ShowCarousel` so production carousel interaction logic is reused without changing production routes.

**Tech Stack:** React 19, React Router 7, TypeScript, CSS, Vitest, Testing Library, Playwright Core.

**Spec:** `docs/superpowers/specs/2026-09-22-editorial-stage-lab-design.md`

## Global Constraints

- Do not change production screens or API/auth/payment/wallet/settlement behavior.
- Do not add a runtime library.
- Keep A/B on the current font, H1 header, and M1 mobile navigation.
- Keep font and navigation comparisons isolated from A/B.
- Reuse theme tokens, Poster, ShowCarousel, drag/swipe, focus, and reduced-motion behavior.
- User-facing view names are `포스터 보기` and `목록 보기`.
- Preserve the untracked root `AGENTS.md`.

## Review Focus

- At 390px the active poster, price, and CTA remain visible without horizontal overflow.
- Switching A/B or poster/list view preserves the shared show data and active first show.
- Reduced-motion users receive no long transform or lighting transition.
- The lab picker never appears as a product navigation control or alters production routes.
- Korean mode exposes no English experimental names in the product composition.

---

### Task 1: Lab contracts and view controls

**Files:**
- Modify: `frontend/src/pages/prototypes/PerformanceDiscoveryPrototype.test.tsx`
- Modify: `frontend/src/pages/prototypes/PerformanceDiscoveryPrototype.tsx`
- Create: `frontend/src/pages/prototypes/EditorialLabIcons.tsx`

**Interfaces:**
- Consumes: `DiscoveryPrototypeShow[]`, React Router search params.
- Produces: `LabConcept = 'editorial-a' | 'identity-b'`, `LabSpecimen = 'type' | 'navigation' | null`, `ViewMode = 'poster' | 'list'`, `PosterViewIcon`, `ListViewIcon`.

- [ ] Write failing tests proving `concept=editorial-a`, `concept=identity-b`, `specimen=type`, and `specimen=navigation` select only their intended full-size surface, while `v=1` and `v=2` remain aliases.
- [ ] Run `pnpm exec vitest run src/pages/prototypes/PerformanceDiscoveryPrototype.test.tsx` and confirm failures are missing lab concepts/specimens.
- [ ] Implement query parsing, a compact lab-only picker, and semantic poster/list icon controls using direct SVG components.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Editorial Stage A and Stronger Identity B

**Files:**
- Create: `frontend/src/pages/prototypes/EditorialStageLab.tsx`
- Create: `frontend/src/pages/prototypes/editorial-stage-lab.css`
- Modify: `frontend/src/pages/prototypes/PerformanceDiscoveryPrototype.test.tsx`
- Modify: `frontend/src/pages/prototypes/PerformanceDiscoveryPrototype.tsx`

**Interfaces:**
- Consumes: `DiscoveryPrototypeShow[]`, `ViewMode`, `onViewModeChange`.
- Produces: `EditorialStageA` and `StrongerIdentityB` with accessible region names, shared data, section view controls, H1 header, and M1 mobile nav.

- [ ] Write failing tests proving both concepts render the same first show/date/place/price, no experimental product labels, an H1 header, an M1 nav, and poster/list controls that preserve the selected concept.
- [ ] Run the focused test and confirm the expected missing-surface failures.
- [ ] Implement A as a polished editorial split layout and B as a stage-depth layout composing `ShowCarousel`.
- [ ] Add responsive, light/dark, focus-visible, and reduced-motion CSS without global production selectors.
- [ ] Re-run the focused test and confirm it passes.

### Task 3: Type and navigation specimens

**Files:**
- Create: `frontend/src/pages/prototypes/EditorialLabSpecimens.tsx`
- Modify: `frontend/src/pages/prototypes/editorial-stage-lab.css`
- Modify: `frontend/src/pages/prototypes/PerformanceDiscoveryPrototype.test.tsx`
- Modify: `frontend/src/pages/prototypes/PerformanceDiscoveryPrototype.tsx`

**Interfaces:**
- Consumes: shared Korean specimen strings and existing theme tokens.
- Produces: four isolated font comparison columns and H1/H2 navigation examples.

- [ ] Write failing tests that find the current, Wanted Sans, Paperlogy + Pretendard, and SUIT samples with identical strings, plus separate H1/H2 navigation examples.
- [ ] Run the focused test and confirm the specimen names are missing.
- [ ] Implement both specimens without applying candidate fonts to the A/B pages or production root.
- [ ] Re-run the focused test and confirm it passes.

### Task 4: Verification and evidence

**Files:**
- Create: `docs/design/lab-captures/2026-09-22/` screenshots generated by Playwright.

**Interfaces:**
- Consumes: the completed lab URLs.
- Produces: matched A/B desktop and mobile PNGs, type and navigation specimen PNGs, and a carousel before/after capture.

- [ ] Run the focused prototype test, full `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `git diff --check`.
- [ ] Start the local Vite server and capture A/B at 1440x1000 and 390x844 using the same language, theme, fixture, and active show.
- [ ] Capture Stronger Identity before and after one next-show action to prove the carousel interaction is visible.
- [ ] Capture type and navigation specimens at 1440px.
- [ ] Inspect every PNG for clipping, horizontal overflow, unreadable controls, and mismatched active show; record any unverified condition in the handoff.
