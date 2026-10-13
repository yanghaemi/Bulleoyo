# Stage Motion and Auth Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved band-selection stage, dynamic ticket-print hero, settlement-light simulator, login brand header, and exact path-based logo motion without changing product data or API behavior.

**Architecture:** Keep the existing `app → pages → features → shared` direction. Motion handles interruptible user-driven layout changes, Anime.js handles scoped one-shot timelines, and every effect falls back to complete static DOM. Feature components own their visual story; shared code contains only motion tokens, brand geometry, and the auth header contract.

**Tech Stack:** React 19, TypeScript, Vite, Motion 13, Anime.js 4.5, Tailwind CSS 4, Vitest, Testing Library, SVG, optional vgpu with CSS fallback

**Spec:** `docs/superpowers/specs/2026-09-10-stage-motion-auth-polish-design.md`

## Global Constraints

- Preserve all existing uncommitted user and prior-agent changes; inspect `git diff` before every task and stage only the files named by that task.
- Do not change backend, smart-contract, API response, settlement-calculation, or route semantics.
- All information and actions must exist in DOM immediately; animation must never delay navigation, authentication, calculation, or CTA use.
- Default reposition spring is `{ type: 'spring', bounce: 0, duration: 0.4 }`.
- Ticket choreography is 2.2 seconds maximum and sparkle runs once for 180ms.
- The official left `variant-a-merged-stem` geometry, pink support, gradient, and horizontal grille remain authoritative.
- `BULLEO` must be SVG path geometry, not SVG `<text>`.
- Reduced motion removes large translation, rotation, stagger, afterimage, and sparkle; use a static final state or a maximum 180ms cross-fade.
- No product-wide looping shimmer, cursor follower, sound autoplay, vibration, or animated settlement digits.
- At 360×800, 390×844, 768px, and 1440px, document width must not exceed viewport width.
- Update status, decisions, experiment QA, and Claude handoff documents with implemented versus verified evidence.

---

## File Map

**Create**

- `frontend/src/shared/motion/motionTokens.ts` — typed shared spring and duration constants
- `frontend/src/shared/motion/motionTokens.test.ts` — shared timing contract tests
- `frontend/src/shared/ui/AuthHeader.tsx` — thin unauthenticated/onboarding header
- `frontend/src/shared/ui/AuthHeader.test.tsx` — auth-header behavior contract
- `frontend/src/features/member/LoginScreen.test.tsx` — login layout and pending-state contract
- `frontend/src/features/ticket/TeamChoiceStage.tsx` — selected-band stage preview
- `frontend/src/features/ticket/TeamChoice.motion.test.tsx` — team-stage regression tests
- `frontend/src/features/ticket/IssuedTicketHero.tsx` — real ticket DOM and replay control
- `frontend/src/features/studio/SettlementLightStage.tsx` — two-light ratio visualization
- `frontend/src/features/studio/SettlementLightStage.test.tsx` — ratio/fallback tests
- `frontend/scripts/generate-brand-wordmark.mjs` — reproducible Montserrat outline generator

**Modify**

- `frontend/package.json`, `pnpm-lock.yaml` — outline-generator dev dependencies only
- `frontend/src/shared/ui/AnimatedBrandLogo.tsx` — path wordmark and document/click replay state
- `frontend/src/shared/ui/AnimatedBrandLogo.test.tsx` — geometry and replay contract
- `frontend/src/styles/fx-brand.css` — normalized 2.4-second frames and reset state
- `frontend/src/shared/ui/index.ts` — export AuthHeader
- `frontend/src/features/member/LoginScreen.tsx` — use AuthHeader and BrandLoader overlay
- `frontend/src/pages/LoginPage.tsx` — home logo navigation callback if required
- `frontend/src/features/ticket/TeamChoice.tsx` — compose TeamChoiceStage
- `frontend/src/features/ticket/BookingComplete.tsx` — compose IssuedTicketHero and keep current callbacks
- `frontend/src/features/ticket/BookingComplete.motion.test.tsx` — 2.2-second timeline and fallback
- `frontend/src/features/studio/SettlementRules.tsx` — compose light stage from valid ratios
- `frontend/src/features/studio/SettlementRules.motion.test.tsx` — preserve calculation and disclosure behavior
- `frontend/src/pages/DesignToolsLabPage.tsx` — replayable representative states
- `docs/frontend/STAGE_LEDGER_STATUS.md` — exact validation evidence
- `docs/frontend/STAGE_LEDGER_DECISIONS.md` — motion and fallback decisions
- `docs/frontend/DESIGN_TOOL_EXPERIMENTS.md` — manual QA and rollback
- `docs/superpowers/specs/2026-09-10-design-tool-experiments-design.md` — final logo replay wording
- `CLAUDE.md` — handoff entry point

---

### Task 1: Shared Motion Tokens

**Files:**
- Create: `frontend/src/shared/motion/motionTokens.ts`
- Test: `frontend/src/shared/motion/motionTokens.test.ts`

**Interfaces:**
- Produces: `STAGE_SPRING`, `TICKET_TIMING`, `BRAND_TIMING`, and `clampRatio(value: number): number`
- Consumes: no feature modules

- [ ] **Step 1: Write the failing token-contract test**

```ts
import { describe, expect, it } from 'vitest'
import { BRAND_TIMING, STAGE_SPRING, TICKET_TIMING, clampRatio } from './motionTokens'

describe('motion tokens', () => {
  it('keeps approved stage and ticket timing stable', () => {
    expect(STAGE_SPRING).toEqual({ type: 'spring', bounce: 0, duration: 0.4 })
    expect(TICKET_TIMING.totalMs).toBe(2200)
    expect(TICKET_TIMING.sparkleStartMs).toBe(2020)
    expect(BRAND_TIMING.totalMs).toBe(2400)
  })

  it('clamps visualization ratios without changing source data', () => {
    expect(clampRatio(-0.2)).toBe(0)
    expect(clampRatio(0.42)).toBe(0.42)
    expect(clampRatio(1.4)).toBe(1)
  })
})
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `pnpm test -- src/shared/motion/motionTokens.test.ts`

Expected: FAIL because `motionTokens.ts` does not exist.

- [ ] **Step 3: Implement the typed constants**

```ts
export const STAGE_SPRING = { type: 'spring', bounce: 0, duration: 0.4 } as const

export const TICKET_TIMING = {
  printEndMs: 550,
  detachEndMs: 850,
  dropEndMs: 1150,
  returnEndMs: 1850,
  settleEndMs: 2020,
  sparkleStartMs: 2020,
  totalMs: 2200,
} as const

export const BRAND_TIMING = {
  splitMs: 400,
  moveMs: 700,
  morphMs: 900,
  koreanCompleteMs: 1400,
  crossfadeMs: 1700,
  englishCompleteMs: 2200,
  totalMs: 2400,
} as const

export function clampRatio(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
}
```

- [ ] **Step 4: Run the focused test and typecheck**

Run: `pnpm test -- src/shared/motion/motionTokens.test.ts && pnpm typecheck`

Expected: PASS and exit code 0.

- [ ] **Step 5: Commit the isolated shared contract**

```powershell
git add -- frontend/src/shared/motion/motionTokens.ts frontend/src/shared/motion/motionTokens.test.ts
git commit -m "feat(fe): 무대 모션 토큰을 고정"
```

---

### Task 2: Exact Path-Based Brand Logo and Replay State

**Files:**
- Create: `frontend/scripts/generate-brand-wordmark.mjs`
- Modify: `frontend/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `frontend/src/shared/ui/AnimatedBrandLogo.tsx`
- Modify: `frontend/src/shared/ui/AnimatedBrandLogo.test.tsx`
- Modify: `frontend/src/styles/fx-brand.css`

**Interfaces:**
- Consumes: `BRAND_TIMING`
- Produces: `AnimatedBrandLogo` with `data-part="english-word"` path geometry and header states `reset | intro | complete`

- [ ] **Step 1: Add failing geometry and replay tests**

```tsx
it('uses fixed path geometry for every visible wordmark', () => {
  const { container } = render(<AnimatedBrandLogo mode="static" height={26} />)
  expect(container.querySelector('text')).not.toBeInTheDocument()
  expect(container.querySelector('path[data-part="english-word"]')).toHaveAttribute('d')
  expect(container.querySelector('svg')).toHaveAttribute('data-logo-geometry', 'normalized-v2')
})

it('replays on a new document id but not on an SPA remount', () => {
  sessionStorage.setItem('bulleoyo:header-intro-document', 'old-document')
  const first = render(<AnimatedBrandLogo mode="header" height={26} />)
  expect(first.container.querySelector('svg')).toHaveAttribute('data-header-motion-state', 'intro')
  act(() => vi.advanceTimersByTime(2400))
  first.unmount()
  const second = render(<AnimatedBrandLogo mode="header" height={26} />)
  expect(second.container.querySelector('svg')).toHaveAttribute('data-header-motion-state', 'complete')
})

it('restarts the full intro when the header logo is clicked', () => {
  const { container } = render(<AnimatedBrandLogo mode="header" height={26} />)
  act(() => vi.advanceTimersByTime(2400))
  fireEvent.click(container.querySelector('svg')!)
  act(() => vi.advanceTimersByTime(20))
  expect(container.querySelector('svg')).toHaveAttribute('data-header-motion-state', 'intro')
})
```

- [ ] **Step 2: Run the brand test and confirm RED**

Run: `pnpm test -- src/shared/ui/AnimatedBrandLogo.test.tsx`

Expected: FAIL because `<text>` remains, normalized geometry is absent, storage contains `true`, and click does not restart.

- [ ] **Step 3: Install reproducible outline-generation dependencies**

Run: `pnpm add -D @fontsource/montserrat@5.3.0 opentype.js@2.0.0`

Verify: only `devDependencies` and lockfile change; no runtime import is added.

- [ ] **Step 4: Add the outline generator and produce `BULLEO_PATH`**

```js
// frontend/scripts/generate-brand-wordmark.mjs
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import opentype from 'opentype.js'

const require = createRequire(import.meta.url)
const fontFile = require.resolve('@fontsource/montserrat/files/montserrat-latin-900-normal.woff2')
const font = opentype.loadSync(resolve(fontFile))
const path = font.getPath('BULLEO', 0, 0, 200)
process.stdout.write(path.toPathData(2))
```

Run from `frontend`: `node scripts/generate-brand-wordmark.mjs`

Copy the complete generated `d` string into a `BULLEO_PATH` constant. Apply one group transform, measured in the browser, so `BULLEO`, `Y`, and `O` share the same cap height and optical baseline; do not hand-edit individual glyph commands.

- [ ] **Step 5: Implement document-aware and click replay state**

```ts
type HeaderMotionState = 'reset' | 'intro' | 'complete'

function currentDocumentId() {
  return String(window.performance.timeOrigin)
}

function hasPlayedInCurrentDocument() {
  return sessionStorage.getItem('bulleoyo:header-intro-document') === currentDocumentId()
}

const replay = () => {
  if (mode !== 'header' || reducedMotion) return
  setHeaderMotionState('reset')
  replayFrame.current = requestAnimationFrame(() => setHeaderMotionState('intro'))
}
```

Store `currentDocumentId()` when intro starts. Cancel the replay frame and completion timer on unmount. Attach `onClick={replay}` to the SVG without preventing the containing home link.

- [ ] **Step 6: Normalize CSS start, reset, intro, complete, and reduced states**

Add explicit `reset` rules that show Korean prefix, stand, and head while hiding English prefix, Y, and O. Keep the approved breakpoints at 16.667%, 29.167%, 37.5%, 58.333%, 70.833%, and 91.667%. Final geometry must occupy the same optical height as the initial mark.

- [ ] **Step 7: Run focused tests and inspect six frames in Design Lab**

Run: `pnpm test -- src/shared/ui/AnimatedBrandLogo.test.tsx && pnpm typecheck`

Browser checkpoints: 0.45, 0.80, 1.15, 1.70, 2.20, and 2.42 seconds at 22px, 26px, and 72px heights in light/dark themes.

Expected: all tests PASS; no `<text>` element; `BULLEOYO` has uniform cap height and baseline; YO remains visible through the prefix cross-fade.

- [ ] **Step 8: Commit brand changes only**

```powershell
git add -- frontend/package.json pnpm-lock.yaml frontend/scripts/generate-brand-wordmark.mjs frontend/src/shared/ui/AnimatedBrandLogo.tsx frontend/src/shared/ui/AnimatedBrandLogo.test.tsx frontend/src/styles/fx-brand.css
git commit -m "fix(fe): 로고 도형과 재생 흐름을 정합화"
```

---

### Task 3: Login Auth Header and Non-Blocking Brand Loader

**Files:**
- Create: `frontend/src/shared/ui/AuthHeader.tsx`
- Create: `frontend/src/shared/ui/AuthHeader.test.tsx`
- Modify: `frontend/src/shared/ui/index.ts`
- Modify: `frontend/src/features/member/LoginScreen.tsx`
- Test: `frontend/src/features/member/LoginScreen.test.tsx`

**Interfaces:**
- Consumes: `AnimatedBrandLogo`, `BrandLoader`, `LanguageSwitch`, `SupportedLanguage`
- Produces: `AuthHeader({ language, onLanguageChange, homeTo?, backTo? })`

- [ ] **Step 1: Write failing auth header and pending-state tests**

```tsx
it('shows the approved brand instead of the legacy TICKR title', () => {
  render(<AuthHeader language="en" onLanguageChange={vi.fn()} />)
  expect(screen.getByRole('img', { name: '불러요' })).toBeInTheDocument()
  expect(screen.queryByText('TICKR')).not.toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'Language / 언어' })).toBeInTheDocument()
})

it('keeps login content mounted while pending and shows the brand loader', () => {
  render(<LoginScreen {...baseProps} pending />)
  expect(screen.getByRole('status')).toHaveTextContent('계정을 준비하고 있어요')
  expect(screen.getByRole('heading', { name: /Sign in/ })).toBeInTheDocument()
  screen.getAllByRole('button', { name: /계속하기/ }).forEach((button) => {
    expect(button).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm test -- src/shared/ui/AuthHeader.test.tsx src/features/member/LoginScreen.test.tsx`

Expected: FAIL because AuthHeader and LoginScreen tests do not exist and LoginScreen still renders `TICKR` plus Spinner.

- [ ] **Step 3: Implement AuthHeader**

```tsx
export function AuthHeader({ language, onLanguageChange, homeTo = '/' }: Props) {
  return (
    <header className="flex h-14 items-center justify-between gap-3 border-b border-line bg-surface px-4 md:px-6">
      <NavLink to={homeTo} aria-label="불러요 홈" className="fx-brand-link shrink-0">
        <AnimatedBrandLogo mode="header" height={22} />
      </NavLink>
      <LanguageSwitch value={language} onChange={onLanguageChange} />
    </header>
  )
}
```

Keep the thin-header information architecture; do not compose AppHeader.

- [ ] **Step 4: Replace LoginScreen header and pending Spinner**

Render `AuthHeader` at the current header position. In the pending overlay render `<BrandLoader full={false} label="Setting up your account… / 계정을 준비하고 있어요…" />`; do not add a minimum delay and do not unmount the login heading or provider buttons.

- [ ] **Step 5: Run login tests and inspect 360/1440 layouts**

Run: `pnpm test -- src/shared/ui/AuthHeader.test.tsx src/features/member/LoginScreen.test.tsx && pnpm typecheck`

Expected: PASS. Browser: the thin header contains animated brand plus language switch, the card remains 400px maximum, and pending overlay has no horizontal overflow.

- [ ] **Step 6: Commit login changes only**

```powershell
git add -- frontend/src/shared/ui/AuthHeader.tsx frontend/src/shared/ui/AuthHeader.test.tsx frontend/src/shared/ui/index.ts frontend/src/features/member/LoginScreen.tsx frontend/src/features/member/LoginScreen.test.tsx
git commit -m "feat(fe): 로그인 브랜드 헤더를 통일"
```

---

### Task 4: Selected Band Moves to Center Stage

**Files:**
- Create: `frontend/src/features/ticket/TeamChoiceStage.tsx`
- Create: `frontend/src/features/ticket/TeamChoice.motion.test.tsx`
- Modify: `frontend/src/features/ticket/TeamChoice.tsx`

**Interfaces:**
- Consumes: `TeamOption`, `STAGE_SPRING`, selected team or `null`
- Produces: `TeamChoiceStage({ team, showTitle, reducedMotion? })`

- [ ] **Step 1: Write failing selection-stage tests**

```tsx
it('moves the selected radio option into the stage without delaying selection data', async () => {
  render(<TeamChoice data={fixture} onContinue={vi.fn()} />)
  await user.click(screen.getByRole('radio', { name: /Neon Harbor/ }))
  expect(screen.getByTestId('team-choice-stage')).toHaveTextContent('Neon Harbor')
  expect(screen.getByText('Order summary / 주문 요약').parentElement).toHaveTextContent('Neon Harbor')
})

it('retargets immediately when another team is selected', async () => {
  render(<TeamChoice data={fixture} onContinue={vi.fn()} />)
  await user.click(screen.getByRole('radio', { name: /Neon Harbor/ }))
  await user.click(screen.getByRole('radio', { name: /Blue Static/ }))
  expect(screen.getByTestId('team-choice-stage')).toHaveTextContent('Blue Static')
})
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `pnpm test -- src/features/ticket/TeamChoice.motion.test.tsx`

Expected: FAIL because no stage preview exists.

- [ ] **Step 3: Implement TeamChoiceStage with Motion layout**

Use `motion/react` in this lazy feature. Render a 168px mobile/220px desktop stage. The selected poster wrapper uses `layoutId={\`team-card-${team.teamId}\`}` and `transition={STAGE_SPRING}`. Render two low-opacity radial lights behind it. When `team` is null, show a static instruction instead of an empty animated box.

- [ ] **Step 4: Compose the stage without changing radio semantics**

Place `TeamChoiceStage` above the current radiogroup. Keep `SelectableRow`, `selectedId`, `onContinue`, and `OrderSummary` unchanged. Add an equal-height placeholder only inside the stage transition layer, not inside the accessible radio label.

- [ ] **Step 5: Run focused tests and browser QA**

Run: `pnpm test -- src/features/ticket/TeamChoice.motion.test.tsx && pnpm typecheck`

Browser: rapid reselect on desktop and mobile; one team; long team name; reduced-motion. Expected: no jump, no overflow, current radio and summary update immediately.

- [ ] **Step 6: Commit the band stage**

```powershell
git add -- frontend/src/features/ticket/TeamChoiceStage.tsx frontend/src/features/ticket/TeamChoice.motion.test.tsx frontend/src/features/ticket/TeamChoice.tsx
git commit -m "feat(fe): 응원팀 선택을 무대 전환으로 표현"
```

---

### Task 5: Ticket Print, Drop, Swoosh, Settle, and Sparkle

**Files:**
- Create: `frontend/src/features/ticket/IssuedTicketHero.tsx`
- Modify: `frontend/src/features/ticket/BookingComplete.tsx`
- Modify: `frontend/src/features/ticket/BookingComplete.motion.test.tsx`

**Interfaces:**
- Consumes: `BookingCompleteView`, `TICKET_TIMING`
- Produces: `IssuedTicketHero({ data })` with a `Replay ticket / 티켓 다시 보기` button and stable `data-ticket-part` selectors

- [ ] **Step 1: Replace the existing 800ms expectation with failing 2.2-second contract tests**

```tsx
it('builds the approved ticket timeline in order', async () => {
  render(<BookingComplete data={data} onViewTickets={vi.fn()} onBackHome={vi.fn()} />)
  await waitFor(() => expect(createTimeline).toHaveBeenCalled())
  expect(timeline.add).toHaveBeenCalledWith('[data-ticket-part="printed-ticket"]', expect.anything(), 0)
  expect(timeline.add).toHaveBeenCalledWith('[data-ticket-part="drop-ticket"]', expect.anything(), 850)
  expect(timeline.add).toHaveBeenCalledWith('[data-ticket-part="hero-ticket"]', expect.anything(), 1150)
  expect(timeline.add).toHaveBeenCalledWith('[data-ticket-part="sparkle"]', expect.anything(), 2020)
})

it('keeps completion actions usable before the timeline ends', () => {
  const onViewTickets = vi.fn()
  render(<BookingComplete data={data} onViewTickets={onViewTickets} onBackHome={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /내 티켓 보기/ }))
  expect(onViewTickets).toHaveBeenCalledOnce()
})

it('replays on request and skips translation and sparkle for reduced motion', async () => {
  matchMediaMock.matches = true
  render(<BookingComplete data={data} onViewTickets={vi.fn()} onBackHome={vi.fn()} />)
  expect(screen.getByTestId('issued-ticket-hero')).toHaveAttribute('data-motion', 'reduced')
  expect(createTimeline).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `pnpm test -- src/features/ticket/BookingComplete.motion.test.tsx`

Expected: FAIL because ticket parts, replay, and 2.2-second offsets do not exist.

- [ ] **Step 3: Build the real ticket DOM**

Render show title, date, venue, ticket type, team, quantity, amount, and order number inside a semantic ticket card. Add separate decorative clones with `aria-hidden="true"` for print/drop and two afterimages. Only the final ticket is exposed to assistive technology.

- [ ] **Step 4: Build the scoped Anime.js timeline**

```ts
createTimeline({ defaults: { ease: 'out(3)' } })
  .add('[data-ticket-part="printed-ticket"]', { clipPath: ['inset(0 0 100% 0)', 'inset(0 0 0% 0)'], y: [-36, 0], duration: 550 }, 0)
  .add('[data-ticket-part="printed-ticket"]', { rotate: 2, y: 10, duration: 300 }, 550)
  .add('[data-ticket-part="drop-ticket"]', { y: '120vh', rotate: 8, duration: 300, ease: 'in(3)' }, 850)
  .add('[data-ticket-part="afterimage"]', { opacity: [0, 0.22, 0], x: [-54, 0], y: [72, 0], rotate: [-22, 0], duration: 700, delay: stagger(55) }, 1150)
  .add('[data-ticket-part="hero-ticket"]', { opacity: [0, 1], x: [-54, 0], y: [72, 0], rotate: [-18, 0], scale: [0.72, 1], duration: 700 }, 1150)
  .add('[data-ticket-part="hero-ticket"]', { scale: [1.015, 1], duration: 170 }, 1850)
  .add('[data-ticket-part="sparkle"]', { opacity: [0, 1, 0], scale: [0.5, 1.08, 1], duration: 180 }, 2020)
```

Scope selectors to the component root and revert on cleanup. The exact `clipPath` property may use a CSS custom property if Anime.js cannot interpolate the array; the visual contract and timing remain unchanged.

- [ ] **Step 5: Implement replay and failure fallback**

Store the scope cleanup function and replay by reverting, applying a `reset` state for one animation frame, then creating a fresh scope. Catch dynamic import rejection and set `data-motion="fallback"`; CSS shows only the final ticket. Never hide CTA.

- [ ] **Step 6: Run tests and frame-by-frame browser QA**

Run: `pnpm test -- src/features/ticket/BookingComplete.motion.test.tsx && pnpm typecheck`

Browser checkpoints: 0.30, 0.70, 1.00, 1.45, 1.90, 2.08, 2.25 seconds. Verify final sparkle affects only the border and 12px star, runs once, and does not flash the viewport.

- [ ] **Step 7: Commit the ticket hero**

```powershell
git add -- frontend/src/features/ticket/IssuedTicketHero.tsx frontend/src/features/ticket/BookingComplete.tsx frontend/src/features/ticket/BookingComplete.motion.test.tsx
git commit -m "feat(fe): 티켓 발행 시네마틱을 추가"
```

---

### Task 6: Settlement Ratio Light Simulator

**Files:**
- Create: `frontend/src/features/studio/SettlementLightStage.tsx`
- Create: `frontend/src/features/studio/SettlementLightStage.test.tsx`
- Modify: `frontend/src/features/studio/SettlementRules.tsx`
- Modify: `frontend/src/features/studio/SettlementRules.motion.test.tsx`

**Interfaces:**
- Consumes: valid `fixedBp`, valid `selectionBp`, `BP_TOTAL`, `STAGE_SPRING`, optional `disabled`
- Produces: `SettlementLightStage({ fixedBp, selectionBp, valid })`; invalid input keeps the last valid pair

- [ ] **Step 1: Write failing mapping and invalid-input tests**

```tsx
it('maps basis points to the two labeled lights', () => {
  render(<SettlementLightStage fixedBp={6500} selectionBp={3500} valid />)
  expect(screen.getByTestId('fixed-light')).toHaveStyle({ '--light-ratio': '0.65' })
  expect(screen.getByTestId('selection-light')).toHaveStyle({ '--light-ratio': '0.35' })
  expect(screen.getByText('65%')).toBeInTheDocument()
  expect(screen.getByText('35%')).toBeInTheDocument()
})

it('keeps the last valid lights when draft input is invalid', () => {
  const view = render(<SettlementLightStage fixedBp={6000} selectionBp={4000} valid />)
  view.rerender(<SettlementLightStage fixedBp={0} selectionBp={0} valid={false} />)
  expect(screen.getByTestId('fixed-light')).toHaveStyle({ '--light-ratio': '0.6' })
})
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm test -- src/features/studio/SettlementLightStage.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the light stage with a static CSS fallback**

Keep the last valid pair in a ref. Render two labeled `motion.div` light cones with `animate={{ flexGrow: ratio, opacity: 0.22 + ratio * 0.24 }}` and `transition={STAGE_SPRING}`. Add CSS radial gradients as the baseline; enhance with vgpu only when its existing capability path reports support. Do not place exact financial amounts inside the canvas.

- [ ] **Step 4: Compose above Step 1 inputs**

In `SettlementRules`, compute `stageOneValid` from existing validation and render:

```tsx
<SettlementLightStage
  fixedBp={fixed}
  selectionBp={selection}
  valid={validation.stageOneValid && !sumInvalidFromServer}
/>
```

Do not change `changeFixed`, `changeSelection`, `simulate`, save payload, or validation messages.

- [ ] **Step 5: Run settlement regression and browser QA**

Run: `pnpm test -- src/features/studio/SettlementLightStage.test.tsx src/features/studio/SettlementRules.motion.test.tsx && pnpm typecheck`

Browser: 0/100, 35/65, 50/50, 100/0, blank, range overflow, server-invalid. Expected: existing bp and payout calculations are identical; invalid drafts retain the last valid light state.

- [ ] **Step 6: Commit settlement lights**

```powershell
git add -- frontend/src/features/studio/SettlementLightStage.tsx frontend/src/features/studio/SettlementLightStage.test.tsx frontend/src/features/studio/SettlementRules.tsx frontend/src/features/studio/SettlementRules.motion.test.tsx
git commit -m "feat(fe): 정산 비율을 무대 조명으로 시각화"
```

---

### Task 7: Lab, Documentation, and Full Verification

**Files:**
- Modify: `frontend/src/pages/DesignToolsLabPage.tsx`
- Modify: `docs/frontend/STAGE_LEDGER_STATUS.md`
- Modify: `docs/frontend/STAGE_LEDGER_DECISIONS.md`
- Modify: `docs/frontend/DESIGN_TOOL_EXPERIMENTS.md`
- Modify: `docs/superpowers/specs/2026-09-10-design-tool-experiments-design.md`
- Modify: `CLAUDE.md`
- Preserve and finalize: `frontend/src/shared/ui/ConfirmDialog.tsx`, `frontend/src/shared/ui/ConfirmDialog.test.tsx`

**Interfaces:**
- Consumes: all previous task components and current ConfirmDialog overflow fix
- Produces: reproducible development fixtures, final verification evidence, and Claude handoff

- [ ] **Step 1: Add Lab fixtures and accessible replay controls**

Add separate sections for normalized header logo, TeamChoice stage, issued ticket hero, settlement lights, and AuthHeader. Use fixed local fixture data only. Keep the development-only route exclusion test unchanged.

- [ ] **Step 2: Run focused UI tests including the pending modal fix**

Run:

```powershell
pnpm test -- src/shared/ui/AnimatedBrandLogo.test.tsx src/shared/ui/AuthHeader.test.tsx src/shared/ui/ConfirmDialog.test.tsx src/features/ticket/TeamChoice.motion.test.tsx src/features/ticket/BookingComplete.motion.test.tsx src/features/studio/SettlementLightStage.test.tsx src/features/studio/SettlementRules.motion.test.tsx
```

Expected: all focused tests PASS with no unhandled rejection, act warning, or console error.

- [ ] **Step 3: Run full automated verification**

Run:

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all exit code 0. Record exact test-file count, test count, entry gzip size, Anime.js chunk size, Motion-using route chunks, and Design Lab production exclusion.

- [ ] **Step 4: Run responsive and accessibility browser QA**

Routes: `/login`, team choice demo route, booking complete demo route, settlement rules demo route, `/__lab/design-tools`.

Widths: 360×800, 390×844, 768px, 1440px.

For each, record `document.documentElement.scrollWidth === window.innerWidth`, console error count, keyboard focus order, and reduced-motion final state. Confirm ConfirmDialog bilingual buttons remain inside their 400px modal.

- [ ] **Step 5: Update handoff documents with evidence boundaries**

Record each item as `implemented`, `automated verification`, or `browser verified`; do not mark all 15 Apple source videos as watched. State that the supplied 5-second WebM was frame-sampled and only structural motion principles were reproduced.

- [ ] **Step 6: Review source motion quality and fix only blocking findings**

Check interruption, repeated sparkle, CTA lockout, hidden focus, layout shift, and reduced-motion. Any source fix requires a new failing test before patching.

- [ ] **Step 7: Commit Lab, modal, and documentation changes**

```powershell
git add -- frontend/src/pages/DesignToolsLabPage.tsx frontend/src/shared/ui/ConfirmDialog.tsx frontend/src/shared/ui/ConfirmDialog.test.tsx docs/frontend/STAGE_LEDGER_STATUS.md docs/frontend/STAGE_LEDGER_DECISIONS.md docs/frontend/DESIGN_TOOL_EXPERIMENTS.md docs/superpowers/specs/2026-09-10-design-tool-experiments-design.md CLAUDE.md
git commit -m "docs(fe): 무대 모션 검증 결과를 인계"
```

- [ ] **Step 8: Verify the final diff and keep the dev server available**

Run: `git status --short`, `git log -8 --oneline`, and repeat any command affected by the final documentation or formatting changes.

Expected: no accidental unrelated files are staged or committed; the development server remains reachable for user inspection.
