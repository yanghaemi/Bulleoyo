# Performance Media Frontend Implementation Plan

> **For the implementing agent:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the current session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-page performance form with a durable D-22 through D-27 creation flow that uploads real poster/ticket artwork and reuses that artwork throughout booking and issued-ticket screens.

**Architecture:** `PerformanceCreatePage` owns a typed in-memory draft and renders explicit wizard steps. Focused media components decode, crop, render, and upload images while preserving source blobs and editor values after failures; the final review performs the existing create-then-ticket-options sequence once and preserves `performanceId` after partial success. Existing ticket components receive an artwork URL selected as ticket artwork first, then poster fallback.

**Tech Stack:** React 19, TypeScript 5.6, Vite 7, TanStack Query 5, Canvas 2D, Pointer Events, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-21-performance-media-creation-flow-design.md`

## Global Constraints

- This plan starts only after `2026-09-21-media-backend-infra-plan.md` is complete and generated OpenAPI types include `media_01`.
- Draft data stays in React memory; do not persist the full form in localStorage.
- Selecting WebP is allowed, but every upload is converted to JPEG or PNG first.
- Upload output is exactly 1080x1440 for poster and 1800x720 for ticket artwork.
- Preserve source blob, transform, text, color, and successful upload metadata when another step fails.
- Never bake QR, status, serial, order ID, or ticket ID into uploaded artwork.
- Unknown errors show the code or HTTP status and state that entered data remains.
- All visible strings have Korean and English variants through the existing locale mechanism.
- Every commit body ends with `S15P21B204-99` until a dedicated Jira key is issued.

## Review Focus

- A portrait image smaller than the output canvas must not create blank crop bands; Task 2 tests minimum scale.
- EXIF-rotated/mobile and WebP inputs must decode or fail with a precise client reason while keeping the selected file; Task 2 tests decode and conversion.
- Moving between direct-design and upload tabs must retain both last valid results; Task 4 tests tab round trips.
- Double-clicking final submit must produce one performance; Task 6 tests an in-flight guard.
- A broken ticket artwork URL must reveal the poster/current generated fallback without hiding QR; Task 7 tests `onError` fallback and semantic QR presence.

---

### Task 1: Teach the API client to send multipart uploads

**Files:**
- Modify: `frontend/src/shared/api/client.ts`
- Create: `frontend/src/shared/api/client.multipart.test.ts`
- Create: `frontend/src/shared/api/domains/media.ts`
- Create: `frontend/src/shared/queries/media.ts`
- Create: `frontend/src/shared/api/domains/media.test.ts`

**Interfaces:**
- Produces: `uploadMedia(file: Blob, purpose: MediaPurpose, signal?: AbortSignal): Promise<MediaUpload>`.
- Produces: `useUploadMedia()` mutation.
- Produces: request handling where `FormData` is passed unchanged and `Content-Type` is left for the browser boundary.

- [ ] **Step 1: Write failing multipart client tests**

```ts
const form = new FormData()
form.append('file', new Blob(['image'], { type: 'image/jpeg' }), 'poster.jpg')
form.append('purpose', 'PERFORMANCE_POSTER')
await api.post('/files', form)
expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(form)
expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).has('Content-Type')).toBe(false)
```

Also test that an access token and `Accept-Language` remain present.

- [ ] **Step 2: Run and verify failure**

Run: `cd frontend; pnpm test -- src/shared/api/client.multipart.test.ts`

Expected: FAIL because `sendOnce` JSON-stringifies `FormData`.

- [ ] **Step 3: Implement `BodyInit` handling and the media domain**

Change the request body branch to:

```ts
let body: BodyInit | undefined
if (method !== 'GET' && method !== 'DELETE') {
  if (options.body instanceof FormData) body = options.body
  else {
    body = JSON.stringify(options.body ?? {})
    headers['Content-Type'] = 'application/json;charset=UTF-8'
  }
}
```

The domain function appends `file` and `purpose`, calls `/files`, and accepts an optional abort signal.

- [ ] **Step 4: Run client/domain tests**

Run: `cd frontend; pnpm test -- src/shared/api/client.multipart.test.ts src/shared/api/domains/media.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit multipart support**

```powershell
git add frontend/src/shared/api/client.ts frontend/src/shared/api/client.multipart.test.ts frontend/src/shared/api/domains/media.ts frontend/src/shared/api/domains/media.test.ts frontend/src/shared/queries/media.ts
git commit -m "feat: 공연 이미지 업로드 클라이언트를 추가한다" -m "S15P21B204-99"
```

### Task 2: Build deterministic browser image transforms

**Files:**
- Create: `frontend/src/features/studio/media/imageTransform.ts`
- Create: `frontend/src/features/studio/media/imageTransform.test.ts`
- Create: `frontend/src/features/studio/media/mediaErrors.ts`
- Create: `frontend/src/features/studio/media/mediaErrors.test.ts`

**Interfaces:**
- Produces: `decodeImage(file: Blob): Promise<ImageBitmap>`.
- Produces: `minimumCoverScale(source, target, rotation): number`.
- Produces: `renderCroppedImage(source, transform, output): Promise<Blob>`.
- Produces: `mediaErrorOf(error): ActionableMediaError`.

- [ ] **Step 1: Write failing geometry and error tests**

```ts
expect(minimumCoverScale({ width: 800, height: 1200 }, { width: 1080, height: 1440 }, 0))
  .toBeCloseTo(1.35)
expect(mediaErrorOf(apiError('FILE_TOO_LARGE')).action).toBe('choose-smaller-file')
expect(mediaErrorOf(new DOMException('timed out', 'TimeoutError')).code)
  .toBe('CLIENT_UPLOAD_TIMEOUT')
```

Include 90-degree rotation, no blank bands after clamping, WebP decode failure, Canvas null context, offline, and memory failure classifications.

- [ ] **Step 2: Run and verify failure**

Run: `cd frontend; pnpm test -- src/features/studio/media/imageTransform.test.ts src/features/studio/media/mediaErrors.test.ts`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement pure geometry plus Canvas rendering**

Keep transform state explicit:

```ts
export interface CropTransform {
  x: number
  y: number
  scale: number
  rotation: 0 | 90 | 180 | 270
}
export interface OutputSize { width: number; height: number }
```

Use `createImageBitmap(file, { imageOrientation: 'from-image' })`, render to an exact-size canvas, prefer JPEG quality 0.82, and use PNG only when alpha must be preserved.

- [ ] **Step 4: Run transform tests**

Run: `cd frontend; pnpm test -- src/features/studio/media/imageTransform.test.ts src/features/studio/media/mediaErrors.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit transform utilities**

```powershell
git add frontend/src/features/studio/media
git commit -m "feat: 공연 이미지 편집 변환을 구현한다" -m "S15P21B204-99"
```

### Task 3: Implement the D-23 poster editor

**Files:**
- Create: `frontend/src/features/studio/media/PosterEditor.tsx`
- Create: `frontend/src/features/studio/media/PosterEditor.test.tsx`
- Create: `frontend/src/features/studio/media/media-editor.css`
- Create: `frontend/src/features/studio/media/MediaErrorPanel.tsx`
- Create: `frontend/src/features/studio/media/MediaErrorPanel.test.tsx`

**Interfaces:**
- Consumes: image transform functions and `useUploadMedia()`.
- Produces: `PosterEditorValue { sourceFile, transform, upload?: MediaUpload }`.
- Produces: `onChange(value)` without owning the wizard draft.

- [ ] **Step 1: Write failing interaction tests**

Test JPEG/PNG/WebP picker acceptance, drag translation, slider zoom clamping, center reset, 90-degree rotation, upload success, failure retaining filename/transform, Korean/English error text, and reduced-motion class behavior.

```tsx
await user.upload(screen.getByLabelText('포스터 이미지'), file)
await user.click(screen.getByRole('button', { name: '90도 회전' }))
upload.rejectOnce(apiError('FILE_STORAGE_FAILED'))
expect(await screen.findByText('저장소에 이미지를 기록하지 못했습니다.')).toBeVisible()
expect(screen.getByText(file.name)).toBeVisible()
```

- [ ] **Step 2: Run and verify failure**

Run: `cd frontend; pnpm test -- src/features/studio/media/PosterEditor.test.tsx src/features/studio/media/MediaErrorPanel.test.tsx`

Expected: FAIL because components do not exist.

- [ ] **Step 3: Implement the editor and actionable error panel**

The error panel renders cause, impact, action, and `code/status` for unknown errors. Retry reuses the rendered Blob; replace file returns to the picker. Pointer capture must end on `pointerup` and `pointercancel`.

- [ ] **Step 4: Run editor tests**

Run: `cd frontend; pnpm test -- src/features/studio/media/PosterEditor.test.tsx src/features/studio/media/MediaErrorPanel.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit D-23**

```powershell
git add frontend/src/features/studio/media
git commit -m "feat: 공연 포스터 편집 화면을 만든다" -m "S15P21B204-99"
```

### Task 4: Implement D-24 and D-24A ticket artwork

**Files:**
- Create: `frontend/src/features/studio/media/TicketArtworkEditor.tsx`
- Create: `frontend/src/features/studio/media/TicketArtworkEditor.test.tsx`
- Create: `frontend/src/features/studio/media/TicketArtworkPreview.tsx`
- Modify: `frontend/src/features/studio/media/media-editor.css`

**Interfaces:**
- Consumes: poster URL/source, title, start time, venue, and upload mutation.
- Produces: `TicketArtworkValue { mode, sourceFile?, transform, accent, title, subtitle, upload? }`.
- Produces: flat 1800x720 artwork without dynamic ticket fields.

- [ ] **Step 1: Write failing designer tests**

Test poster reuse, custom background, accent/title/subtitle changes, automatic date/place defaults, direct upload with 5:2, wrong-ratio routing to crop, tab round trip preservation, mobile preview, and absence of QR/ticket identifiers in rendered upload canvas.

- [ ] **Step 2: Run and verify failure**

Run: `cd frontend; pnpm test -- src/features/studio/media/TicketArtworkEditor.test.tsx`

Expected: FAIL because the editor does not exist.

- [ ] **Step 3: Implement designer and upload modes**

Use `mode: 'DESIGN' | 'UPLOAD'`; never clear the inactive mode value. The final `renderTicketArtwork` call receives only decorative/static inputs:

```ts
renderTicketArtwork({ background, accent, title, subtitle, startAtLabel, venue },
                    { width: 1800, height: 720 })
```

- [ ] **Step 4: Run designer tests**

Run: `cd frontend; pnpm test -- src/features/studio/media/TicketArtworkEditor.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit D-24/D-24A**

```powershell
git add frontend/src/features/studio/media
git commit -m "feat: 티켓 아트 제작과 업로드를 구현한다" -m "S15P21B204-99"
```

### Task 5: Introduce a typed D-22 through D-27 creation wizard

**Files:**
- Create: `frontend/src/features/studio/performanceCreationDraft.ts`
- Create: `frontend/src/features/studio/PerformanceCreationWizard.tsx`
- Create: `frontend/src/features/studio/PerformanceCreationWizard.test.tsx`
- Modify: `frontend/src/pages/PerformanceCreatePage.tsx`
- Modify: `frontend/src/features/studio/PerformanceForm.tsx`

**Interfaces:**
- Consumes: existing `PerformanceInfoValues`, `TicketTypeDraft`, editors, and save mutations.
- Produces: `PerformanceCreationDraft` and steps `INFO | POSTER | TICKET_ART | TICKET_TYPES | REVIEW`.

- [ ] **Step 1: Write failing wizard navigation tests**

Test required info gates, back/forward value retention, successful upload IDs carried to review, edit links returning to the correct step, and no create API call before review confirmation.

```tsx
await user.click(screen.getByRole('button', { name: '공연 등록 검토' }))
expect(screen.getByText('등록 전 확인')).toBeVisible()
expect(createPerformance).not.toHaveBeenCalled()
```

- [ ] **Step 2: Run and verify failure**

Run: `cd frontend; pnpm test -- src/features/studio/PerformanceCreationWizard.test.tsx src/pages/PerformanceCreatePage.test.tsx`

Expected: FAIL because creation is still one page.

- [ ] **Step 3: Extract form sections without changing existing edit mode**

Keep `PerformanceEditPage` on the existing form contract. In create mode, the wizard owns values and uses focused section callbacks; do not fork validation rules or date conversion.

- [ ] **Step 4: Implement step navigation and draft ownership**

```ts
export interface PerformanceCreationDraft {
  info: PerformanceInfoValues
  poster?: PosterEditorValue
  ticketArtwork?: TicketArtworkValue
  ticketTypes: TicketTypeDraft[]
}
```

- [ ] **Step 5: Run wizard and edit regressions**

Run:

```powershell
cd frontend
pnpm test -- src/features/studio/PerformanceCreationWizard.test.tsx src/pages/PerformanceCreatePage.test.tsx src/pages/PerformanceEditPage.tickets.test.tsx src/pages/PerformanceEditPage.deposit.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit the wizard**

```powershell
git add frontend/src/features/studio frontend/src/pages/PerformanceCreatePage.tsx
git commit -m "feat: 공연 등록을 단계형 흐름으로 바꾼다" -m "S15P21B204-99"
```

### Task 6: Submit once from D-27 and recover partial success

**Files:**
- Modify: `frontend/src/pages/PerformanceCreatePage.tsx`
- Create: `frontend/src/features/studio/PerformanceReview.tsx`
- Create: `frontend/src/features/studio/PerformanceReview.test.tsx`
- Modify: `frontend/src/pages/PerformanceCreatePage.test.tsx`

**Interfaces:**
- Consumes: `poster.upload.uploadId`, `ticketArtwork.upload.uploadId`.
- Produces: one create request followed by ticket type save; preserves `performanceId` for retry.

- [ ] **Step 1: Write failing submit tests**

Cover request body upload IDs, double click, create failure retaining draft, ticket type failure retaining `performanceId`, retry using PATCH+PUT instead of a second POST, and final navigation only after both writes.

```ts
expect(createPerformance).toHaveBeenCalledTimes(1)
expect(createPerformance).toHaveBeenCalledWith(expect.objectContaining({
  posterUploadId: 11,
  ticketArtworkUploadId: 12,
}))
```

- [ ] **Step 2: Run and verify failure**

Run: `cd frontend; pnpm test -- src/pages/PerformanceCreatePage.test.tsx src/features/studio/PerformanceReview.test.tsx`

Expected: FAIL because upload IDs and review submit do not exist.

- [ ] **Step 3: Implement review and an in-flight guard**

Keep the existing `createdRef` recovery, add a synchronous `submittingRef`, and reset it in `finally`. Unknown errors include code/status and the sentence that all entered values remain.

- [ ] **Step 4: Run submit tests**

Run: `cd frontend; pnpm test -- src/pages/PerformanceCreatePage.test.tsx src/features/studio/PerformanceReview.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit D-27 submission**

```powershell
git add frontend/src/pages/PerformanceCreatePage.tsx frontend/src/pages/PerformanceCreatePage.test.tsx frontend/src/features/studio/PerformanceReview.tsx frontend/src/features/studio/PerformanceReview.test.tsx
git commit -m "feat: 공연 등록 검토와 단일 제출을 연결한다" -m "S15P21B204-99"
```

### Task 7: Use ticket artwork in every issued-ticket surface

**Files:**
- Modify: `frontend/src/pages/BookingCompletePage.tsx`
- Modify: `frontend/src/pages/MyTicketsPage.tsx`
- Modify: `frontend/src/pages/TicketDetailPage.tsx`
- Modify: `frontend/src/features/ticket/ConcertTicket.tsx`
- Modify: `frontend/src/features/ticket/ConcertCollectorTicket.tsx`
- Modify: `frontend/src/features/ticket/bookingCompleteModel.ts`
- Test: `frontend/src/features/ticket/ConcertTicket.test.tsx`
- Test: `frontend/src/features/ticket/ConcertCollectorTicket.test.tsx`
- Test: `frontend/src/pages/BookingCompletePage.live.test.tsx`
- Create: `frontend/src/pages/MyTicketsPage.artwork.test.tsx`
- Test: `frontend/src/pages/TicketDetailPage.qr.test.tsx`

**Interfaces:**
- Consumes: API `ticketImageUrl` and `posterImageUrl`.
- Produces: `artworkImageUrl = ticketImageUrl ?? posterImageUrl` in view models.
- Produces: fallback to generated/poster art after image load failure.

- [ ] **Step 1: Write failing precedence and fallback tests**

Test ticket art over poster, poster when ticket art is absent, generated art after `img` error, and QR remaining in the DOM while art changes.

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
cd frontend
pnpm test -- src/features/ticket/ConcertTicket.test.tsx src/features/ticket/ConcertCollectorTicket.test.tsx src/pages/TicketDetailPage.qr.test.tsx
```

Expected: FAIL because API artwork is not mapped.

- [ ] **Step 3: Map and render artwork without changing dynamic overlays**

Pass the chosen URL only to the decorative art layer. Keep QR, timer, status, title, ticket number, and accessibility text as DOM nodes.

```ts
const artworkImageUrl = ticket.ticketImageUrl ?? ticket.posterImageUrl ?? undefined
const onArtworkError = () => setArtworkImageUrl(undefined)
```

- [ ] **Step 4: Run ticket and booking regressions**

Run: `cd frontend; pnpm test -- src/features/ticket src/pages/BookingCompletePage.live.test.tsx src/pages/MyTicketsPage.artwork.test.tsx src/pages/TicketDetailPage.qr.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit ticket rendering**

```powershell
git add frontend/src/pages/BookingCompletePage.tsx frontend/src/pages/BookingCompletePage.live.test.tsx frontend/src/pages/MyTicketsPage.tsx frontend/src/pages/MyTicketsPage.artwork.test.tsx frontend/src/pages/TicketDetailPage.tsx frontend/src/pages/TicketDetailPage.qr.test.tsx frontend/src/features/ticket
git commit -m "feat: 발급 티켓에 주최자 아트를 적용한다" -m "S15P21B204-99"
```

### Task 8: Verify the full frontend flow and browser geometry

**Files:**
- Verify only; update tests only if verification exposes a regression.

**Interfaces:**
- Produces: a browser-verified desktop/mobile creation and ticket flow.

- [ ] **Step 1: Run all frontend gates**

```powershell
cd frontend
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all pass.

- [ ] **Step 2: Start backend and frontend against local storage**

```powershell
docker compose -f docker-compose.local.yml up -d
cd backend
./gradlew bootRun --args='--spring.profiles.active=local'
```

In another terminal: `cd frontend; pnpm dev --host 0.0.0.0`.

- [ ] **Step 3: Perform browser QA at 1440px and 360px**

Verify D-22→D-27, JPEG/PNG/WebP selection, wrong ratio crop, upload retry after offline mode, final submit, performance detail, booking complete, my tickets, and ticket detail. Confirm no horizontal overflow and reduced-motion removes decorative transitions.

- [ ] **Step 4: Inspect network behavior**

Expected: one upload per explicit completion, one performance POST on final submit, one ticket type PUT, no render-loop requests, and immutable `/uploads/p/yyyyMM/<uuid>.jpg` responses.

- [ ] **Step 5: Check final diff**

Run: `git status --short; git diff --check`

Expected: only intentional frontend changes and generated OpenAPI types.
