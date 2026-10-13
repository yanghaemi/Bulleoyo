# A-06 Cinematic Concert Ticket Implementation Plan

> **2026-09-11 revision:** This plan records the earlier film-proxy implementation. The current runtime supersedes its media steps with one live `ConcertCollectorTicket` DOM rotor plus an `aria-hidden` branded back. See D-016 and `STAGE_LEDGER_STATUS.md`; do not restore the film proxy during API integration.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the small A-06 completion card with the approved A-direction large horizontal concert ticket and a resilient 5.2-second print, fall, vertical-tilted return, slow 3D spin, settle, and shine reveal.

**Architecture:** Keep all meaningful booking data in one responsive DOM ticket. A pre-rendered, data-free film supplies the complex 3D motion, then crossfades into the geometrically identical DOM ticket; media failure or reduced motion immediately exposes that DOM ticket.

**Tech Stack:** React 19, TypeScript, Vite 7, Vitest, Testing Library, CSS transforms, HTML video, Playwright Core asset renderer, ffmpeg-static, WebM/VP9, MP4/H.264

**Spec:** `docs/superpowers/specs/2026-09-11-ticket-cinematic-video-redesign-design.md`

## Global Constraints

- The approved visual is A Concert Collector Pass: matte black paper, poster at left, information at center, perforation and vertical serial stub at right.
- Do not add B-direction holographic or rainbow material; only one restrained final gloss pass is allowed.
- Runtime duration is 5200ms: print 0–700, detach/fall 700–1200, empty beat 1200–1500, vertical-tilted return 1500–1900, slow Y spin 1900–4800, spatial settle by 3000, Z alignment by 4600, crossfade/shine 4800–5200.
- Video never contains show title, order number, seat, price, QR payload, or another user-specific value.
- The semantic DOM ticket and both completion CTAs exist and remain usable from first render.
- `prefers-reduced-motion: reduce`, autoplay rejection, codec/media error, stalled playback, or a 1200ms startup timeout must show the static DOM ticket.
- Do not invent seat, gate, admission number, or QR values absent from `BookingCompleteView`.
- WebM target is at most 3MB, MP4 target is at most 5MB, and poster target is at most 200KB.
- The media asset is lazy-route content; do not import its bytes into the application shell.
- Preserve the current payment, booking, routing, API, and chain contracts.
- In `pnpm dev:demo` only, Pay must visibly advance `signing 1/2 → signing 2/2 → confirming → A-06`; ordinary development and production builds must not simulate wallet success.

---

## File Structure

### Create

- `frontend/src/pages/PaymentPage.demo.test.tsx` — executable demo payment state and completion-route regression test.
- `frontend/src/features/ticket/bookingCompleteModel.ts` — the shared A-06 view contract, including optional poster URL.
- `frontend/src/features/ticket/ConcertCollectorTicket.tsx` — the only semantic ticket article and all data rendering.
- `frontend/src/features/ticket/ConcertCollectorTicket.css` — approved A-direction desktop and mobile ticket geometry.
- `frontend/src/features/ticket/ConcertCollectorTicket.test.tsx` — semantic data, fallback poster, no-fake-data, and responsive-contract tests.
- `frontend/src/features/ticket/TicketRevealStage.tsx` — video lifecycle, crossfade state, replay, timeout, and fallback.
- `frontend/src/features/ticket/TicketRevealStage.css` — stage, media layer, DOM crossfade, and reduced-motion rules.
- `frontend/src/features/ticket/TicketRevealStage.test.tsx` — media event and lifecycle tests.
- `frontend/src/features/ticket/TicketRevealAssets.test.ts` — committed media presence, signatures, and size-budget tests.
- `frontend/scripts/ticket-reveal-film.html` — deterministic, data-free 1600×720 frame source.
- `frontend/scripts/render-ticket-reveal.mjs` — frame capture plus WebM/MP4/poster encoder.
- `frontend/public/media/ticket/ticket-reveal.webm` — VP9 reveal film.
- `frontend/public/media/ticket/ticket-reveal.mp4` — H.264 compatibility reveal film.
- `frontend/public/media/ticket/ticket-reveal-poster.webp` — static first/final-safe media poster.

### Modify

- `frontend/src/pages/PaymentPage.tsx` — demo-only, cleanup-safe state progression into A-06.
- `frontend/src/shared/config/index.ts` — exported `isDemo` build-mode boundary.
- `frontend/src/features/ticket/BookingComplete.tsx` — import and re-export the extracted view type.
- `frontend/src/features/ticket/IssuedTicketHero.tsx` — replace the old Anime.js clones with the reveal stage and one DOM ticket.
- `frontend/src/features/ticket/BookingComplete.motion.test.tsx` — retain page integration and CTA coverage; remove obsolete Anime timeline assertions.
- `frontend/src/pages/demoBookingFlow.ts` — pass a known poster only for performances that have a committed poster asset.
- `frontend/src/pages/DesignToolsLabPage.tsx` — expose final, replay, failure, and reduced-motion preview states.
- `frontend/src/shared/motion/motionTokens.ts` — replace 2200ms DOM animation markers with the approved film timeline.
- `frontend/src/shared/motion/motionTokens.test.ts` — lock the 5200ms contract.
- `frontend/package.json` and `frontend/pnpm-lock.yaml` — add reproducible render tooling and a render script.
- `docs/frontend/STAGE_LEDGER_STATUS.md` — implementation and verification state.
- `docs/frontend/STAGE_LEDGER_DECISIONS.md` — A-direction and film/DOM boundary decision.
- `docs/frontend/DESIGN_TOOL_EXPERIMENTS.md` — renderer, fallback, manual QA, and rollback commands.
- `CLAUDE.md` — handoff entry points.

---

### Task 0: Make the Demo Payment Path Reach A-06

**Files:**
- Create: `frontend/src/pages/PaymentPage.demo.test.tsx`
- Modify: `frontend/src/pages/PaymentPage.tsx`
- Modify: `frontend/src/shared/config/index.ts`

**Interfaces:**
- Produces: `isDemo: boolean` from `shared/config`, defined as `import.meta.env.MODE === 'demo'`.
- Preserves: `PaymentScreen` props and `PaymentState`; real prepare/sign/report/poll contracts remain untouched.
- Produces: demo route transition `/orders/:orderId/complete?from=<performanceId>` after the existing visible states.

- [ ] **Step 1: Write the failing executable-flow test**

Create `PaymentPage.demo.test.tsx`. Mock only the build-mode boundary and use real page components and a memory router:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { BookingCompletePage } from './BookingCompletePage'
import { PaymentPage } from './PaymentPage'

const demoMode = vi.hoisted(() => ({ value: true }))
vi.mock('@/shared/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/config')>()),
  get isDemo() { return demoMode.value },
}))

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="current route">{location.pathname}{location.search}</output>
}

beforeEach(() => {
  demoMode.value = true
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

it('advances the demo wallet states and preserves from when entering A-06', async () => {
  render(
    <MemoryRouter initialEntries={['/orders/5501/payment?from=12']}>
      <Routes>
        <Route path="/orders/:orderId/payment" element={<PaymentPage />} />
        <Route path="/orders/:orderId/complete" element={<BookingCompletePage />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )

  fireEvent.click(screen.getByRole('button', { name: /Pay ₩99,000/ }))
  expect(screen.getByText('Confirm in your wallet (1/2)')).toBeVisible()

  await act(async () => vi.advanceTimersByTime(650))
  expect(screen.getByText('Confirm in your wallet (2/2)')).toBeVisible()

  await act(async () => vi.advanceTimersByTime(650))
  expect(screen.getByText('Processing payment')).toBeVisible()

  await act(async () => vi.advanceTimersByTime(900))
  expect(screen.getByLabelText('current route')).toHaveTextContent('/orders/5501/complete?from=12')
  expect(screen.getByRole('heading', { name: /예매가 완료되었습니다/ })).toBeVisible()
})
```

The production mutation caught by this test is removal of any signing step, failure to navigate, or loss of the `from` fixture identifier.

- [ ] **Step 2: Run the test and verify the current page stays at 1/2**

```powershell
pnpm exec vitest run src/pages/PaymentPage.demo.test.tsx
```

Expected: FAIL after the first 650ms because `PaymentPage` still displays `Confirm in your wallet (1/2)`.

- [ ] **Step 3: Add the config boundary**

In `shared/config/index.ts`, add:

```ts
/** Executable fixtures and automatic state progression used only by `pnpm dev:demo`. */
export const isDemo: boolean = import.meta.env.MODE === 'demo'
```

Do not redefine `isDev`; demo mode remains a development build and can still show the existing visual state controls.

- [ ] **Step 4: Implement one cleanup-safe demo transition per state**

In `PaymentPage.tsx`, read `orderId`, `from`, and `isDemo`. Add one effect whose only side effect is a single timer for the current demo state:

```ts
const DEMO_SIGNING_STEP_MS = 650
const DEMO_CONFIRMING_MS = 900

useEffect(() => {
  if (!isDemo) return

  let next: (() => void) | undefined
  let delay = DEMO_SIGNING_STEP_MS
  if (state.kind === 'signing' && state.index < state.total) {
    next = () => setState({ ...state, index: state.index + 1 })
  } else if (state.kind === 'signing') {
    next = () => setState({ kind: 'confirming' })
  } else if (state.kind === 'confirming' && orderId) {
    delay = DEMO_CONFIRMING_MS
    next = () => {
      const search = new URLSearchParams()
      if (fromPerformanceId) search.set('from', fromPerformanceId)
      navigate({ pathname: `/orders/${encodeURIComponent(orderId)}/complete`, search: search.toString() })
    }
  }

  if (!next) return
  const timer = window.setTimeout(next, delay)
  return () => window.clearTimeout(timer)
}, [fromPerformanceId, navigate, orderId, state])
```

Use `useParams`, keep `onPay` as the explicit start, and do not add a completed state to `PaymentScreen`.

- [ ] **Step 5: Prove demo and non-demo behavior separately**

Add this second test using the hoisted mode boundary from Step 1:

```tsx
it('does not synthesize wallet success outside demo mode', async () => {
  demoMode.value = false
  render(
    <MemoryRouter initialEntries={['/orders/5501/payment?from=12']}>
      <Routes><Route path="/orders/:orderId/payment" element={<PaymentPage />} /></Routes>
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: /Pay ₩99,000/ }))
  await act(async () => vi.advanceTimersByTime(3000))
  expect(screen.getByText('Confirm in your wallet (1/2)')).toBeVisible()
  expect(screen.queryByText('Processing payment')).not.toBeInTheDocument()
})
```

Run:

```powershell
pnpm exec vitest run src/pages/PaymentPage.demo.test.tsx src/pages/demoBookingFlow.test.ts
```

Expected: demo reaches A-06 with `?from=12`; non-demo does not synthesize payment completion; all tests PASS with no timer warnings.

- [ ] **Step 6: Commit the isolated prerequisite**

```powershell
git add frontend/src/pages/PaymentPage.demo.test.tsx frontend/src/pages/PaymentPage.tsx frontend/src/shared/config/index.ts
git commit -m "fix(fe): 데모 결제 흐름을 예매 완료까지 연결"
```

---

### Task 1: Extract the View Contract and Build the Static A-Direction Ticket

**Files:**
- Create: `frontend/src/features/ticket/bookingCompleteModel.ts`
- Create: `frontend/src/features/ticket/ConcertCollectorTicket.tsx`
- Create: `frontend/src/features/ticket/ConcertCollectorTicket.css`
- Create: `frontend/src/features/ticket/ConcertCollectorTicket.test.tsx`
- Modify: `frontend/src/features/ticket/BookingComplete.tsx`
- Modify: `frontend/src/pages/demoBookingFlow.ts`

**Interfaces:**
- Produces: `BookingCompleteView` with `posterImageUrl?: string | null` from `bookingCompleteModel.ts`.
- Produces: `ConcertCollectorTicket({ data, className?, decorative? })` where `decorative` defaults to `false`; only the false variant renders `role="article"` and readable data.
- Preserves: `BookingComplete.tsx` re-exports `BookingCompleteView` so existing imports do not break.

- [ ] **Step 1: Write the failing static-ticket tests**

Create `ConcertCollectorTicket.test.tsx` with concrete cases:

```tsx
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConcertCollectorTicket } from './ConcertCollectorTicket'
import type { BookingCompleteView } from './bookingCompleteModel'

const data: BookingCompleteView = {
  orderNumber: 'ORD-0012',
  showTitle: 'aespa — Synk: Parallel Line',
  dateLabel: '9월 20일 오후 6:30 KST',
  venue: 'KSPO Dome, Seoul',
  ticketTypeName: 'GA Standing',
  teamName: 'aespa',
  quantity: 2,
  totalPaidLabel: '₩176,000',
  paidAtLabel: '9월 11일 오후 2:30 KST',
  posterImageUrl: '/posters/12.webp',
}

describe('ConcertCollectorTicket', () => {
  it('renders one accessible collector ticket with every real booking value', () => {
    render(<ConcertCollectorTicket data={data} />)
    const ticket = screen.getByRole('article', { name: /발행된 티켓/ })
    for (const value of [
      data.orderNumber,
      data.showTitle,
      data.dateLabel,
      data.venue,
      data.ticketTypeName,
      data.teamName,
      data.totalPaidLabel,
      data.paidAtLabel,
    ]) {
      expect(within(ticket).getByText(String(value), { exact: false })).toBeInTheDocument()
    }
    expect(within(ticket).getByText('2매')).toBeInTheDocument()
    expect(within(ticket).getByText(/Valid \/ 사용 가능/)).toBeInTheDocument()
    expect(within(ticket).getByRole('img', { name: /공연 포스터/ })).toHaveAttribute('src', '/posters/12.webp')
  })

  it('uses a stable fallback poster and never fabricates seat, gate, or QR data', () => {
    render(<ConcertCollectorTicket data={{ ...data, posterImageUrl: null }} />)
    expect(screen.getByTestId('ticket-poster-fallback')).toBeVisible()
    expect(screen.queryByText(/seat|좌석|gate|게이트/i)).not.toBeInTheDocument()
    expect(screen.queryByTestId('ticket-qr')).not.toBeInTheDocument()
  })

  it('keeps decorative copies out of the accessibility tree', () => {
    render(<ConcertCollectorTicket data={data} decorative />)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.getByTestId('concert-collector-ticket')).toHaveAttribute('aria-hidden', 'true')
  })
})
```

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run from `frontend`:

```powershell
pnpm exec vitest run src/features/ticket/ConcertCollectorTicket.test.tsx
```

Expected: FAIL because `ConcertCollectorTicket` and `bookingCompleteModel` do not exist.

- [ ] **Step 3: Extract the model without breaking existing imports**

Move the current interface into `bookingCompleteModel.ts` and add only the optional poster field:

```ts
export interface BookingCompleteView {
  orderNumber: string
  showTitle: string
  dateLabel: string
  venue: string
  ticketTypeName: string
  teamName: string
  quantity: number
  totalPaidLabel: string
  paidAtLabel: string
  posterImageUrl?: string | null
}
```

In `BookingComplete.tsx`, import the type for local use and preserve the public export:

```ts
import type { BookingCompleteView } from './bookingCompleteModel'
export type { BookingCompleteView } from './bookingCompleteModel'
```

- [ ] **Step 4: Implement the semantic ticket and exact regions**

Implement a single root with stable selectors:

```tsx
interface Props {
  data: BookingCompleteView
  className?: string
  decorative?: boolean
}

export function ConcertCollectorTicket({ data, className, decorative = false }: Props) {
  return (
    <article
      data-testid="concert-collector-ticket"
      data-ticket-layout="collector-a"
      aria-label={decorative ? undefined : `발행된 티켓 ${data.orderNumber}`}
      aria-hidden={decorative || undefined}
      role={decorative ? 'presentation' : undefined}
      className={clsx('collector-ticket', className)}
    >
      {/* poster: img when posterImageUrl exists, stable fallback otherwise */}
      {/* body: status, title, date, venue, ticket type, team, quantity, total */}
      {/* stub: ADMIT ONE, order number, paid time; no QR/seat/gate */}
    </article>
  )
}
```

`ConcertCollectorTicket.css` must set `aspect-ratio: 3.6 / 1`, `grid-template-columns: minmax(150px,18%) minmax(0,1fr) minmax(112px,14%)`, a matte `#11111a` body, a dotted stub divider, two-line title clamp, fixed-ratio poster, and `overflow: clip`. At `max-width: 47.999rem`, switch to a two-row grid, move the poster behind the heading, and turn the stub into a bottom horizontal row; never set page-level width above `100%`.

- [ ] **Step 5: Pass only existing poster assets through the demo flow**

Add `posterImageUrl` to `DETAILS` entries 5, 8, and 12 using `/posters/5.webp`, `/posters/8.webp`, and `/posters/12.webp`. Set `complete.posterImageUrl: detail.posterImageUrl`; leave other performances undefined so the fallback is exercised.

- [ ] **Step 6: Run focused and booking-flow tests**

```powershell
pnpm exec vitest run src/features/ticket/ConcertCollectorTicket.test.tsx src/pages/demoBookingFlow.test.ts
```

Expected: PASS, and existing `BookingCompleteView` imports compile through the re-export.

- [ ] **Step 7: Commit the static ticket**

```powershell
git add frontend/src/features/ticket/bookingCompleteModel.ts frontend/src/features/ticket/ConcertCollectorTicket.tsx frontend/src/features/ticket/ConcertCollectorTicket.css frontend/src/features/ticket/ConcertCollectorTicket.test.tsx frontend/src/features/ticket/BookingComplete.tsx frontend/src/pages/demoBookingFlow.ts
git commit -m "feat(fe): 대형 공연 티켓 디자인 추가"
```

---

### Task 2: Define the 5.2-Second Timeline and Video Lifecycle

**Files:**
- Create: `frontend/src/features/ticket/TicketRevealStage.tsx`
- Create: `frontend/src/features/ticket/TicketRevealStage.css`
- Create: `frontend/src/features/ticket/TicketRevealStage.test.tsx`
- Modify: `frontend/src/shared/motion/motionTokens.ts`
- Modify: `frontend/src/shared/motion/motionTokens.test.ts`

**Interfaces:**
- Consumes: one already-rendered semantic ticket as `children: ReactNode`.
- Produces: `TicketRevealStage({ children, forceFallback? })` with `forceFallback` restricted to development/lab use.
- Produces: `TICKET_TIMING` fields `printEndMs`, `fallEndMs`, `blankEndMs`, `returnEndMs`, `settleEndMs`, `crossfadeStartMs`, `totalMs`, and `startupTimeoutMs`.

- [ ] **Step 1: Change the token test first**

Replace the old 2200ms assertions with:

```ts
expect(TICKET_TIMING).toEqual({
  printEndMs: 700,
  fallEndMs: 1200,
  blankEndMs: 1500,
  returnEndMs: 3000,
  settleEndMs: 4800,
  crossfadeStartMs: 4800,
  totalMs: 5200,
  startupTimeoutMs: 1200,
})
```

- [ ] **Step 2: Run the token test and verify the 2200ms mismatch**

```powershell
pnpm exec vitest run src/shared/motion/motionTokens.test.ts
```

Expected: FAIL showing the old `totalMs: 2200` contract.

- [ ] **Step 3: Update the shared token exactly once**

Replace `TICKET_TIMING` in `motionTokens.ts` with the object asserted in Step 1. Do not reuse these values for the 2400ms logo timeline.

- [ ] **Step 4: Write failing reveal-stage lifecycle tests**

Create tests that stub `HTMLMediaElement.prototype.play`, use fake timers, and assert these events:

```tsx
it('autoplays once and crossfades to the DOM ticket near 4.8 seconds', async () => {
  render(<TicketRevealStage><span>Live ticket</span></TicketRevealStage>)
  const video = screen.getByTestId('ticket-reveal-video') as HTMLVideoElement
  expect(video.querySelectorAll('source')).toHaveLength(2)
  expect(video.querySelector('source[type^="video/webm"]')).toHaveAttribute('src', '/media/ticket/ticket-reveal.webm')
  Object.defineProperty(video, 'currentTime', { value: 4.81, configurable: true })
  fireEvent.timeUpdate(video)
  expect(screen.getByTestId('ticket-reveal-stage')).toHaveAttribute('data-reveal-state', 'settling')
  fireEvent.ended(video)
  expect(screen.getByTestId('ticket-reveal-stage')).toHaveAttribute('data-reveal-state', 'complete')
})

it.each(['error', 'stalled'] as const)('falls back on %s without hiding content', (eventName) => {
  render(<TicketRevealStage><span>Live ticket</span></TicketRevealStage>)
  fireEvent(screen.getByTestId('ticket-reveal-video'), new Event(eventName))
  expect(screen.getByTestId('ticket-reveal-stage')).toHaveAttribute('data-reveal-state', 'fallback')
  expect(screen.getByText('Live ticket')).toBeVisible()
})

it('falls back when playback has not started after 1200ms', () => {
  vi.useFakeTimers()
  render(<TicketRevealStage><span>Live ticket</span></TicketRevealStage>)
  act(() => vi.advanceTimersByTime(1200))
  expect(screen.getByTestId('ticket-reveal-stage')).toHaveAttribute('data-reveal-state', 'fallback')
})
```

Add separate cases for rejected `play()`, reduced motion, replay from `currentTime = 0`, rerender without replay, and cleanup of the timeout on unmount.

- [ ] **Step 5: Run the reveal-stage test and verify the missing module failure**

```powershell
pnpm exec vitest run src/features/ticket/TicketRevealStage.test.tsx
```

Expected: FAIL because `TicketRevealStage` does not exist.

- [ ] **Step 6: Implement the finite media state machine**

Use only these states and transitions:

```ts
type RevealState = 'playing' | 'settling' | 'complete' | 'fallback' | 'reduced'

// initial: reduced when media query matches, otherwise playing
// playing -> settling when currentTime >= 4.8
// playing/settling -> complete on ended
// playing/settling -> fallback on error, stalled, rejected play, or startup timeout
// any non-reduced state -> playing on replay, after currentTime is reset to 0
```

Render one muted, `playsInline`, non-looping video with `preload="metadata"`, poster, WebM source first and MP4 source second. Put `children` in a sibling `[data-ticket-live]` layer. The startup timer starts when play is requested and is cleared only on `playing`, fallback, completion, replay cleanup, or unmount.

- [ ] **Step 7: Implement crossfade and reduced-motion CSS**

`TicketRevealStage.css` must keep `[data-ticket-live]` in layout while the film is absolutely positioned above it. During `playing`, live DOM opacity is 0 but remains in the accessibility tree. During `settling`, film opacity moves to 0 and live opacity to 1 over 400ms. During `complete`, `fallback`, and `reduced`, hide the video layer and show live DOM with no transform. Under reduced motion, remove all transitions and gloss pseudo-elements.

- [ ] **Step 8: Run the focused tests and commit**

```powershell
pnpm exec vitest run src/shared/motion/motionTokens.test.ts src/features/ticket/TicketRevealStage.test.tsx
git add frontend/src/shared/motion/motionTokens.ts frontend/src/shared/motion/motionTokens.test.ts frontend/src/features/ticket/TicketRevealStage.tsx frontend/src/features/ticket/TicketRevealStage.css frontend/src/features/ticket/TicketRevealStage.test.tsx
git commit -m "feat(fe): 티켓 영상 전환 상태기계 추가"
```

Expected: all focused tests PASS.

---

### Task 3: Create a Reproducible Film Renderer and Commit the Media

**Files:**
- Create: `frontend/scripts/ticket-reveal-film.html`
- Create: `frontend/scripts/render-ticket-reveal.mjs`
- Create: `frontend/src/features/ticket/TicketRevealAssets.test.ts`
- Create: `frontend/public/media/ticket/ticket-reveal.webm`
- Create: `frontend/public/media/ticket/ticket-reveal.mp4`
- Create: `frontend/public/media/ticket/ticket-reveal-poster.webp`
- Modify: `frontend/package.json`
- Modify: `frontend/pnpm-lock.yaml`

**Interfaces:**
- Produces: `window.renderTicketFrame(milliseconds: number): void` in the film source.
- Produces: the three stable `/media/ticket/*` runtime URLs consumed by `TicketRevealStage`.
- Build-only dependencies: `playwright-core@1.62.1` and `ffmpeg-static@5.2.0`; neither is imported by application source.

- [ ] **Step 1: Write the failing asset-budget test**

```ts
// @vitest-environment node
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const asset = (name: string) => resolve(process.cwd(), 'public/media/ticket', name)

describe('ticket reveal media', () => {
  it.each([
    ['ticket-reveal.webm', 3_000_000],
    ['ticket-reveal.mp4', 5_000_000],
    ['ticket-reveal-poster.webp', 200_000],
  ])('%s exists within its byte budget', (name, maxBytes) => {
    expect(statSync(asset(name)).size).toBeLessThanOrEqual(maxBytes)
  })

  it('commits recognizable WebM, MP4, and WebP containers', () => {
    expect(readFileSync(asset('ticket-reveal.webm')).subarray(0, 4)).toEqual(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    expect(readFileSync(asset('ticket-reveal.mp4')).subarray(4, 8).toString('ascii')).toBe('ftyp')
    expect(readFileSync(asset('ticket-reveal-poster.webp')).subarray(8, 12).toString('ascii')).toBe('WEBP')
  })
})
```

- [ ] **Step 2: Run the test and verify missing assets**

```powershell
pnpm exec vitest run src/features/ticket/TicketRevealAssets.test.ts
```

Expected: FAIL with `ENOENT` for `public/media/ticket/ticket-reveal.webm`.

- [ ] **Step 3: Add deterministic build-only tooling**

Add this script and dev dependencies, then update the lockfile with `pnpm install`:

```json
{
  "scripts": {
    "render:ticket": "node scripts/render-ticket-reveal.mjs"
  },
  "devDependencies": {
    "ffmpeg-static": "5.2.0",
    "playwright-core": "1.62.1"
  }
}
```

Keep every existing script and dependency unchanged.

- [ ] **Step 4: Build the data-free frame source**

`ticket-reveal-film.html` must use a fixed 1600×720 dark stage and one A-direction blank ticket. Define `window.renderTicketFrame(ms)` with exact intervals from `TICKET_TIMING`. The function must derive every transform from `ms` without `requestAnimationFrame` so any frame is reproducible:

```js
window.renderTicketFrame = (ms) => {
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))
  const segment = (start, end) => clamp((ms - start) / (end - start))
  const easeOut = (t) => 1 - Math.pow(1 - t, 3)
  const print = easeOut(segment(0, 700))
  const fall = segment(700, 1200)
  const fly = easeOut(segment(1500, 3000))
  const spin = segment(1900, 4800)
  const align = segment(2100, 4600)
  const shine = segment(4800, 5200)
  // Apply print clip/translation, full off-stage fall, three trailing copies,
  // perspective fly-in, non-bouncy settle, and one diagonal gloss sweep.
}
```

The film ticket may contain only brand bars, poster-like gradients, perforation, and neutral decorative rules. It must not contain readable fake event, seat, order, price, or QR values.

- [ ] **Step 5: Implement frame capture and encoding**

`render-ticket-reveal.mjs` must:

```js
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import ffmpegPath from 'ffmpeg-static'
import { chromium } from 'playwright-core'

const FPS = 30
const FRAME_COUNT = 156
const outDir = resolve('public/media/ticket')
const frameDir = await mkdtemp(join(tmpdir(), 'bulleoyo-ticket-'))
const launch = process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
  : { channel: process.platform === 'win32' ? 'msedge' : 'chrome' }

// launch Chromium, open ticket-reveal-film.html at 1600×720,
// call renderTicketFrame(index * 1000 / FPS), and capture frame-%04d.png.
// Encode VP9 WebM and H.264 MP4 with yuv420p and no audio.
// Capture frame 155 as ticket-reveal-poster.webp.
// Run ffmpeg decode checks, enforce byte budgets, then remove frameDir in finally.
```

Use `spawnSync` argument arrays, fail on non-zero status, and never construct a shell command. VP9 arguments use `-c:v libvpx-vp9 -b:v 0 -crf 34 -deadline good -cpu-used 2`; MP4 arguments use `-c:v libx264 -crf 24 -preset slow -movflags +faststart -pix_fmt yuv420p`. If the packaged binary exposes `libopenh264` instead of `libx264`, detect encoders once and use `libopenh264` with a constrained bitrate. The committed output, not local renderer availability, is the runtime dependency.

- [ ] **Step 6: Render, inspect metadata, and enforce budgets**

```powershell
pnpm render:ticket
pnpm exec vitest run src/features/ticket/TicketRevealAssets.test.ts
```

Expected: 156-frame, 30fps, 5.2-second silent assets; the test PASSes and the script reports WebM/MP4/poster sizes within budget.

- [ ] **Step 7: Commit the renderer and media**

```powershell
git add frontend/package.json frontend/pnpm-lock.yaml frontend/scripts/ticket-reveal-film.html frontend/scripts/render-ticket-reveal.mjs frontend/src/features/ticket/TicketRevealAssets.test.ts frontend/public/media/ticket
git commit -m "feat(fe): 티켓 시네마틱 영상 자산 제작"
```

---

### Task 4: Integrate the Film with the Real Ticket

**Files:**
- Modify: `frontend/src/features/ticket/IssuedTicketHero.tsx`
- Modify: `frontend/src/features/ticket/BookingComplete.motion.test.tsx`
- Modify: `frontend/src/pages/DesignToolsLabPage.tsx`

**Interfaces:**
- Consumes: `ConcertCollectorTicket`, `TicketRevealStage`, and unchanged `BookingCompleteView` values.
- Produces: `IssuedTicketHero({ data })` as the unchanged public entry point.

- [ ] **Step 1: Replace obsolete Anime-specific expectations with failing integration expectations**

Keep the existing immediate data and CTA tests, then assert the new composition:

```tsx
it('renders one semantic A-direction ticket inside the cinematic stage', () => {
  mount()
  expect(screen.getByTestId('ticket-reveal-stage')).toBeInTheDocument()
  expect(screen.getByTestId('concert-collector-ticket')).toHaveAttribute('data-ticket-layout', 'collector-a')
  expect(screen.getAllByRole('article')).toHaveLength(1)
  expect(screen.getByRole('button', { name: /티켓 다시 보기/ })).toBeEnabled()
})

it('keeps completion actions usable before media playback starts', () => {
  const { onViewTickets, onBackHome } = mount()
  fireEvent.click(screen.getByRole('button', { name: /내 티켓 보기/ }))
  fireEvent.click(screen.getByRole('button', { name: /홈으로/ }))
  expect(onViewTickets).toHaveBeenCalledOnce()
  expect(onBackHome).toHaveBeenCalledOnce()
})
```

Delete assertions tied to `anime.createTimeline`, decorative DOM clones, 2200ms duration, and old `data-ticket-part` transforms. Lifecycle details now belong to `TicketRevealStage.test.tsx`.

- [ ] **Step 2: Run the integration test and verify the old structure fails**

```powershell
pnpm exec vitest run src/features/ticket/BookingComplete.motion.test.tsx
```

Expected: FAIL because the old `IssuedTicketHero` has no reveal stage or collector-A layout.

- [ ] **Step 3: Reduce `IssuedTicketHero` to composition**

The component should contain no dynamic Anime import and no duplicated ticket content:

```tsx
export function IssuedTicketHero({ data }: { data: BookingCompleteView }) {
  return (
    <section data-testid="issued-ticket-hero" className="mx-auto mb-6 w-full max-w-[1180px] md:mb-8">
      <TicketRevealStage>
        <ConcertCollectorTicket data={data} />
      </TicketRevealStage>
    </section>
  )
}
```

Keep the replay button owned by `TicketRevealStage`. Do not delay `BookingComplete` heading or action rendering.

- [ ] **Step 4: Extend the Design Tools Lab without production flags**

Add controls that remount the hero, force the documented media fallback through `TicketRevealStage`'s development-only prop, and display the static collector ticket. Keep the lab under its existing development guard; do not add query-string backdoors to production routes.

- [ ] **Step 5: Run all ticket and lab tests**

```powershell
pnpm exec vitest run src/features/ticket src/pages/DesignToolsLabPage.test.tsx
```

Expected: PASS with one semantic article per issued ticket and no Anime timeline call from A-06.

- [ ] **Step 6: Commit the integration**

```powershell
git add frontend/src/features/ticket/IssuedTicketHero.tsx frontend/src/features/ticket/BookingComplete.motion.test.tsx frontend/src/pages/DesignToolsLabPage.tsx
git commit -m "feat(fe): 예매 완료에 대형 티켓 영상 연출 연결"
```

---

### Task 5: Browser QA and Motion Tuning

**Files:**
- Modify if measurements require it: `frontend/src/features/ticket/ConcertCollectorTicket.css`
- Modify if measurements require it: `frontend/src/features/ticket/TicketRevealStage.css`
- Modify if timing source requires it: `frontend/scripts/ticket-reveal-film.html`
- Regenerate after any film change: `frontend/public/media/ticket/ticket-reveal.webm`, `ticket-reveal.mp4`, `ticket-reveal-poster.webp`

**Interfaces:**
- Verifies the spec; produces no new runtime contract.

- [ ] **Step 1: Start the demo server and open the real completion route**

```powershell
pnpm dev:demo -- --port 5173
```

Open the A-06 completion route and the existing `/__lab/design-tools` route. Record the exact URLs in the status document in Task 6.

- [ ] **Step 2: Check the six timeline boundaries**

Use replay and inspect approximately 0.70s, 1.20s, 1.50s, 1.90s, 2.30s, 4.00s, 4.75s, and 5.00s. Verify full off-screen disappearance during the empty beat, the `rotateZ(-60deg)` vertical/30-degree return pose, a slow single Y spin, no brighter afterimage than the main ticket, no bounce loop, exact film-to-DOM alignment, and one gloss pass.

- [ ] **Step 3: Check responsive geometry**

At 360×800, 390×844, 768×1024, and 1440×900 verify no document-level horizontal scroll, readable title and order number, poster fallback stability, horizontal mobile stub, desktop vertical stub, and visible CTAs.

- [ ] **Step 4: Check fallback and interaction conditions**

Verify reduced motion, blocked media request, forced lab fallback, 4× CPU slowdown, keyboard-only replay, replay while already playing, route leave during playback, light theme, and default dark theme. Any failure must end with the DOM ticket and usable CTAs.

- [ ] **Step 5: Regenerate only when the film source changes**

After an approved source change:

```powershell
pnpm render:ticket
pnpm exec vitest run src/features/ticket/TicketRevealAssets.test.ts
```

Commit a tuning change only after rechecking the six timeline boundaries:

```powershell
git add frontend/src/features/ticket/ConcertCollectorTicket.css frontend/src/features/ticket/TicketRevealStage.css frontend/scripts/ticket-reveal-film.html frontend/public/media/ticket
git commit -m "fix(fe): 티켓 영상과 실제 UI 전환 정렬"
```

---

### Task 6: Update Handoff Documents and Run the Full Gate

**Files:**
- Modify: `docs/frontend/STAGE_LEDGER_STATUS.md`
- Modify: `docs/frontend/STAGE_LEDGER_DECISIONS.md`
- Modify: `docs/frontend/DESIGN_TOOL_EXPERIMENTS.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Produces: one current handoff path for Codex, Claude, or a human developer.

- [ ] **Step 1: Record implementation evidence, not intent**

Add the following facts with their real command output and date:

- A-direction collector ticket files and optional `posterImageUrl` contract
- media source and renderer command
- WebM, MP4, and poster byte sizes
- first-entry, replay, fallback, and reduced-motion behavior
- exact automated test counts and browser viewports actually checked
- any remaining manual check labelled `미검증`, never described as complete

- [ ] **Step 2: Record the decision and rollback boundary**

In `STAGE_LEDGER_DECISIONS.md`, state that the 2026-09-11 document supersedes only A-06 of the earlier 2.2-second DOM design. In `DESIGN_TOOL_EXPERIMENTS.md`, document this rollback:

```text
1. Keep ConcertCollectorTicket and its real data contract.
2. Replace TicketRevealStage with direct children rendering.
3. Remove /public/media/ticket only after no source references remain.
4. Do not restore duplicated decorative ticket DOM or block completion CTAs.
```

- [ ] **Step 3: Update the Claude entry point**

Link both the spec and this plan from `CLAUDE.md`, name `IssuedTicketHero.tsx` as the public entry, and require reading `bookingCompleteModel.ts`, `TicketRevealStage.tsx`, and the current status before modifying A-06.

- [ ] **Step 4: Run the full automated gate**

From `frontend`:

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Expected: every command exits 0. Record exact test file/test counts and the A-06 route chunk in `STAGE_LEDGER_STATUS.md`.

- [ ] **Step 5: Inspect the final diff and committed media**

```powershell
git diff --check
git status --short
git ls-files frontend/public/media/ticket
```

Expected: no whitespace errors, only intended changes before the documentation commit, and all three runtime media files tracked.

- [ ] **Step 6: Commit the handoff record**

```powershell
git add docs/frontend/STAGE_LEDGER_STATUS.md docs/frontend/STAGE_LEDGER_DECISIONS.md docs/frontend/DESIGN_TOOL_EXPERIMENTS.md CLAUDE.md
git commit -m "docs(fe): 대형 티켓 연출 검증과 인계 기록"
```

- [ ] **Step 7: Run a final clean-tree verification**

```powershell
git status --short
git log -7 --oneline
```

Expected: no tracked-file changes remain. `.superpowers/brainstorm` may remain untracked as a local visual-comparison session and must not be included in product commits.
