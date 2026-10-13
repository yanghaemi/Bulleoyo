# Performance Media Backend and Infrastructure Implementation Plan

> **For the implementing agent:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the current session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store authenticated poster and ticket artwork uploads safely, attach them to performances, and expose the managed artwork through performance, order, and ticket APIs.

**Architecture:** A `media` domain owns upload validation, disk storage, ownership metadata, expiry, and public URLs. Performance writes accept upload IDs rather than arbitrary URLs, attach matching `TEMP` records transactionally, and persist managed paths on `performance`; ticket and order reads expose both poster and ticket artwork URLs. Production serves the same bind-mounted directory through host Nginx, while local development uses a Spring resource handler and a Vite proxy.

**Tech Stack:** Java 17, Spring Boot 3.5, Spring MVC multipart, Spring Data JPA, Flyway/MySQL 8, Redis rate limiter, JUnit 5/Testcontainers, OpenAPI 3.1, Docker Compose, Nginx.

**Spec:** `docs/superpowers/specs/2026-09-21-performance-media-creation-flow-design.md`

## Global Constraints

- Server upload input is JPEG or PNG only; browser-selected WebP is converted before upload.
- Maximum request file size is 5MB.
- Poster output is 1080x1440 at 3:4; ticket artwork is 1800x720 at 5:2.
- Only a member leading at least one active team may upload.
- Write APIs accept `posterUploadId` and `ticketArtworkUploadId`, never a public URL supplied by the client.
- An upload can be attached once, only by its owner, and only to the matching purpose.
- Unattached `TEMP` files older than 24 hours are deleted; `ATTACHED` files are never deleted by that job.
- Upload rate limit is 20 requests per member per minute.
- Dynamic QR, ticket status, ticket number, and booking values stay outside the artwork image.
- Add every new error code to the current error specification before adding it to `ErrorCode.java`.
- Every commit body ends with `S15P21B204-99` until a dedicated Jira key is issued.

## Review Focus

- A valid extension with non-image bytes must return `FILE_IMAGE_INVALID` and leave no file or row behind; Task 3 tests this.
- A member must not attach another member's upload or the wrong purpose; Task 5 tests both paths.
- A performance transaction failure after upload lookup must not mark the upload attached; Task 5 tests rollback state.
- Cleanup must never escape `UPLOAD_DIR`, follow a crafted stored path, or delete `ATTACHED` files; Task 6 tests all three.
- Existing performances without media must still serialize with nullable URLs and render through the current fallback; Task 7 tests legacy rows.

---

### Task 1: Publish the media API contract

**Files:**
- Modify: `docs/design/01_API_공통_응답_규격.md`
- Modify: `docs/design/api/openapi.base.yaml`
- Create: `docs/design/api/parts/14_media.yaml`
- Modify: `docs/design/api/parts/04_performance.yaml`
- Modify: `docs/design/api/parts/06_ticket.yaml`
- Generate: `docs/design/api/openapi.yaml`
- Generate: `frontend/src/shared/api/generated/openapi.ts`

**Interfaces:**
- Produces: `POST /api/v1/files`, operation ID `media_01`, request fields `file` and `purpose`.
- Produces: `MediaUpload { uploadId, url, width, height, bytes, contentType }`.
- Produces: performance write fields `posterUploadId?: number`, `ticketArtworkUploadId?: number`.
- Produces: read fields `posterImageUrl?: string`, `ticketImageUrl?: string` on performance detail, order detail, ticket list, and ticket detail.

- [ ] **Step 1: Add exact error definitions to the current response specification**

Add a `FILE` section containing the following status/code pairs without modifying preserved v1/v2 files:

```text
FILE_EMPTY 400
FILE_TOO_LARGE 413
FILE_TYPE_NOT_ALLOWED 400
FILE_IMAGE_INVALID 400
FILE_DIMENSION_TOO_SMALL 400
FILE_UPLOAD_NOT_FOUND 404
FILE_UPLOAD_NOT_OWNED 403
FILE_UPLOAD_PURPOSE_MISMATCH 400
FILE_STORAGE_FAILED 500
```

- [ ] **Step 2: Define `media_01` and the changed performance/ticket schemas**

The new schema must use these exact names and required fields:

```yaml
MediaUpload:
  type: object
  required: [uploadId, url, width, height, bytes, contentType]
  properties:
    uploadId: { type: integer, format: int64 }
    url: { type: string, format: uri }
    width: { type: integer, minimum: 1 }
    height: { type: integer, minimum: 1 }
    bytes: { type: integer, format: int64, minimum: 1 }
    contentType: { type: string, enum: [image/jpeg, image/png] }
```

The multipart request declares `purpose` as `PERFORMANCE_POSTER | TICKET_ARTWORK`, and its 4xx descriptions enumerate the exact `FILE_*` codes.

- [ ] **Step 3: Build and lint the contract**

Run:

```powershell
Set-Location docs/design/api
python build.py
npx -y @redocly/cli lint openapi.yaml
Set-Location ../../../frontend
pnpm gen:api
pnpm typecheck
```

Expected: build reports one new operation; Redocly has no errors; generated TypeScript contains `media_01`, `posterUploadId`, and `ticketArtworkUploadId`.

- [ ] **Step 4: Commit the contract**

```powershell
git add docs/design/01_API_공통_응답_규격.md docs/design/api/openapi.base.yaml docs/design/api/parts/14_media.yaml docs/design/api/parts/04_performance.yaml docs/design/api/parts/06_ticket.yaml docs/design/api/openapi.yaml frontend/src/shared/api/generated/openapi.ts
git commit -m "docs: 공연 미디어 API 계약을 확정한다" -m "S15P21B204-99"
```

### Task 2: Add upload metadata and performance artwork persistence

**Files:**
- Create: `backend/src/main/resources/db/migration/V7__performance_media.sql`
- Create: `backend/src/main/java/com/ssafy/b204/media/entity/UploadedFile.java`
- Create: `backend/src/main/java/com/ssafy/b204/media/repository/UploadedFileRepository.java`
- Modify: `backend/src/main/java/com/ssafy/b204/performance/entity/Performance.java`
- Create: `backend/src/test/java/com/ssafy/b204/media/UploadedFilePersistenceTest.java`

**Interfaces:**
- Produces: `UploadedFile.Purpose`, `UploadedFile.Status`, `attach()`, `isExpired(LocalDateTime cutoff)`.
- Produces: `Performance#getTicketImagePath()` and `Performance#changeMedia(String, String)`.

- [ ] **Step 1: Write the failing persistence test**

Create a Testcontainers integration test that saves a member-owned `TEMP` upload, reloads it, calls `attach()`, and verifies `ATTACHED` plus a non-null `attachedAt`. The same test persists a performance with both media paths and reloads `ticketImagePath`.

```java
assertThat(saved.getStatus()).isEqualTo(UploadedFile.Status.TEMP);
saved.attach();
entityManager.flush();
entityManager.clear();
assertThat(repository.findById(saved.getUploadedFileId()).orElseThrow().getStatus())
        .isEqualTo(UploadedFile.Status.ATTACHED);
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd backend; ./gradlew test --tests '*UploadedFilePersistenceTest'`

Expected: FAIL because migration/table/entity do not exist.

- [ ] **Step 3: Add the migration and entities**

The migration adds `performance.ticket_image_path VARCHAR(500) NULL` and creates `uploaded_file` with owner FK, purpose/status enums, unique stored path, dimensions, byte size, timestamps, and indexes on `(status, created_at)` and `owner_member_id`.

Use this repository contract:

```java
public interface UploadedFileRepository extends JpaRepository<UploadedFile, Long> {
    List<UploadedFile> findTop100ByStatusAndCreatedAtBeforeOrderByCreatedAtAsc(
            UploadedFile.Status status, LocalDateTime cutoff);
}
```

- [ ] **Step 4: Run the persistence test**

Run: `cd backend; ./gradlew test --tests '*UploadedFilePersistenceTest'`

Expected: PASS.

- [ ] **Step 5: Commit the persistence layer**

```powershell
git add backend/src/main/resources/db/migration/V7__performance_media.sql backend/src/main/java/com/ssafy/b204/media backend/src/main/java/com/ssafy/b204/performance/entity/Performance.java backend/src/test/java/com/ssafy/b204/media/UploadedFilePersistenceTest.java
git commit -m "feat: 공연 미디어 저장 모델을 추가한다" -m "S15P21B204-99"
```

### Task 3: Validate and store uploaded images

**Files:**
- Create: `backend/src/main/java/com/ssafy/b204/media/config/MediaProperties.java`
- Create: `backend/src/main/java/com/ssafy/b204/media/dto/MediaDtos.java`
- Create: `backend/src/main/java/com/ssafy/b204/media/service/ImageInspector.java`
- Create: `backend/src/main/java/com/ssafy/b204/media/service/MediaStorage.java`
- Create: `backend/src/main/java/com/ssafy/b204/media/service/MediaService.java`
- Modify: `backend/src/main/java/com/ssafy/b204/common/error/ErrorCode.java`
- Modify: `backend/src/main/resources/application.yml`
- Modify: `backend/src/main/resources/application-example.yml`
- Create: `backend/src/test/java/com/ssafy/b204/media/MediaServiceTest.java`

**Interfaces:**
- Consumes: `UploadedFileRepository`, `TeamRepository`, `MediaProperties`.
- Produces: `MediaService.upload(MemberPrincipal, MultipartFile, UploadedFile.Purpose): MediaDtos.MediaUploadResponse`.
- Produces: `MediaStorage.deleteManaged(String storedPath)` that rejects paths outside the configured root.

- [ ] **Step 1: Write failing service tests with `@TempDir`**

Cover exact JPEG/PNG success, empty input, 5MB+1 byte, fake `.jpg`, corrupt bytes, poster dimensions below 1080x1440, ticket dimensions below 1800x720, and a member without an active led team.

```java
assertThatThrownBy(() -> service.upload(me, fakeJpeg, Purpose.PERFORMANCE_POSTER))
        .isInstanceOfSatisfying(BusinessException.class,
                e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.FILE_IMAGE_INVALID));
assertThat(Files.walk(tempDir).filter(Files::isRegularFile)).isEmpty();
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd backend; ./gradlew test --tests '*MediaServiceTest'`

Expected: FAIL because the media services and error codes are absent.

- [ ] **Step 3: Implement signature, decode, dimension, and storage validation**

Check JPEG `FF D8 FF` or PNG `89 50 4E 47 0D 0A 1A 0A`, then use an `ImageReader` to inspect width and height before allocating a decoded image. Reject any dimensions other than the purpose output (poster 1080x1440, ticket 1800x720), decode once to prove the payload is valid, and atomically move the temporary file to `p/yyyyMM/<uuid>.jpg|png`. Delete the temporary file in `finally` on every failure.

```java
public record MediaUploadResponse(Long uploadId, String url, int width, int height,
                                  long bytes, String contentType) {}
```

Configure:

```yaml
spring:
  servlet:
    multipart:
      max-file-size: 5MB
      max-request-size: 6MB
b204:
  media:
    upload-dir: ${UPLOAD_DIR:./data/uploads}
```

- [ ] **Step 4: Run the service test**

Run: `cd backend; ./gradlew test --tests '*MediaServiceTest'`

Expected: PASS with no files left after rejected inputs.

- [ ] **Step 5: Commit storage validation**

```powershell
git add backend/src/main/java/com/ssafy/b204/media backend/src/main/java/com/ssafy/b204/common/error/ErrorCode.java backend/src/main/resources/application.yml backend/src/main/resources/application-example.yml backend/src/test/java/com/ssafy/b204/media/MediaServiceTest.java
git commit -m "feat: 이미지 업로드를 검증하고 저장한다" -m "S15P21B204-99"
```

### Task 4: Expose the authenticated upload endpoint and local files

**Files:**
- Create: `backend/src/main/java/com/ssafy/b204/media/controller/MediaController.java`
- Create: `backend/src/main/java/com/ssafy/b204/media/config/MediaWebConfig.java`
- Modify: `backend/src/main/java/com/ssafy/b204/common/support/RateLimiter.java`
- Modify: `backend/src/main/java/com/ssafy/b204/common/error/GlobalExceptionHandler.java`
- Modify: `backend/src/main/java/com/ssafy/b204/common/config/SecurityConfig.java`
- Create: `backend/src/test/java/com/ssafy/b204/media/MediaUploadApiTest.java`

**Interfaces:**
- Consumes: `MediaService.upload(MemberPrincipal, MultipartFile, UploadedFile.Purpose)`.
- Produces: `POST /api/v1/files` with `201 ApiResponse<MediaUploadResponse>`.
- Produces: local/test-only `GET /uploads/**` file access.

- [ ] **Step 1: Write failing MockMvc tests**

Test unauthenticated 401, non-leader 403, valid leader 201 response shape, 21st request in one minute 429, and a multipart parser overflow mapped to `FILE_TOO_LARGE`.

```java
mvc.perform(multipart("/api/v1/files")
        .file(jpeg)
        .param("purpose", "PERFORMANCE_POSTER")
        .with(bearer(leaderToken)))
   .andExpect(status().isCreated())
   .andExpect(jsonPath("$.data.uploadId").isNumber())
   .andExpect(jsonPath("$.data.contentType").value("image/jpeg"));
```

- [ ] **Step 2: Run the API test and verify it fails**

Run: `cd backend; ./gradlew test --tests '*MediaUploadApiTest'`

Expected: FAIL with 404 for `/api/v1/files`.

- [ ] **Step 3: Implement controller, rate policy, and multipart exception mapping**

Add `MEDIA_UPLOAD_MEMBER("media:upload:member", 20)` and call it before storage. Map `MaxUploadSizeExceededException` to `FILE_TOO_LARGE`. Permit GET `/uploads/**`; do not permit POST `/api/v1/files` anonymously.

```java
rateLimiter.check(RateLimitPolicy.MEDIA_UPLOAD_MEMBER, principal.memberId().toString());
MediaDtos.MediaUploadResponse uploaded = mediaService.upload(principal, file, purpose);
return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(uploaded));
```

- [ ] **Step 4: Implement local resource serving**

`MediaWebConfig` registers `/uploads/**` against the normalized upload root only under `local` and `test` profiles, with `Cache-Control: public, max-age=31536000, immutable`.

```java
registry.addResourceHandler("/uploads/**")
        .addResourceLocations(mediaProperties.uploadDir().toUri().toString())
        .setCacheControl(CacheControl.maxAge(365, TimeUnit.DAYS).cachePublic().immutable());
```

- [ ] **Step 5: Run the API and security tests**

Run:

```powershell
cd backend
./gradlew test --tests '*MediaUploadApiTest' --tests '*ErrorCodeTest' --tests '*MemberWalletTeamFlowTest'
```

Expected: PASS.

- [ ] **Step 6: Commit the endpoint**

```powershell
git add backend/src/main/java/com/ssafy/b204/media backend/src/main/java/com/ssafy/b204/common backend/src/test/java/com/ssafy/b204/media/MediaUploadApiTest.java
git commit -m "feat: 공연 미디어 업로드 API를 연다" -m "S15P21B204-99"
```

### Task 5: Attach owned uploads during performance writes

**Files:**
- Modify: `backend/src/main/java/com/ssafy/b204/performance/dto/PerformanceDtos.java`
- Modify: `backend/src/main/java/com/ssafy/b204/performance/service/PerformanceService.java`
- Modify: `backend/src/main/java/com/ssafy/b204/performance/entity/Performance.java`
- Create: `backend/src/main/java/com/ssafy/b204/media/service/MediaAttachmentService.java`
- Create: `backend/src/test/java/com/ssafy/b204/performance/PerformanceMediaApiTest.java`

**Interfaces:**
- Consumes: `MediaAttachmentService.requireAttachable(memberId, uploadId, purpose)`.
- Produces: create/update support for `posterUploadId` and `ticketArtworkUploadId`.
- Produces: performance detail `ticketImageUrl`.

- [ ] **Step 1: Write failing attachment tests**

Test owner success, another owner `FILE_UPLOAD_NOT_OWNED`, wrong purpose `FILE_UPLOAD_PURPOSE_MISMATCH`, missing/expired `FILE_UPLOAD_NOT_FOUND`, reuse of `ATTACHED` upload rejected, and transaction rollback leaving the upload `TEMP`.

```java
assertThatThrownBy(() -> service.create(otherPrincipal, requestUsing(ownerUpload)))
        .isInstanceOfSatisfying(BusinessException.class,
                e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.FILE_UPLOAD_NOT_OWNED));
```

- [ ] **Step 2: Run and observe failure**

Run: `cd backend; ./gradlew test --tests '*PerformanceMediaApiTest'`

Expected: FAIL because performance requests still accept `posterImageUrl`.

- [ ] **Step 3: Replace client URL writes with upload IDs**

Resolve both IDs while holding rows with a pessimistic write lock, verify owner/purpose/TEMP/age, write stored paths, and call `attach()` in the same transaction as performance creation/update. Omitted update IDs preserve existing paths; explicit removal is not part of this scope.

```java
UploadedFile poster = request.posterUploadId() == null ? null
        : attachmentService.requireAttachable(member.getMemberId(), request.posterUploadId(),
                UploadedFile.Purpose.PERFORMANCE_POSTER);
UploadedFile ticket = request.ticketArtworkUploadId() == null ? null
        : attachmentService.requireAttachable(member.getMemberId(), request.ticketArtworkUploadId(),
                UploadedFile.Purpose.TICKET_ARTWORK);
performance.changeMedia(pathOrCurrent(poster, currentPosterPath),
        pathOrCurrent(ticket, currentTicketPath));
attachmentService.attachIfPresent(poster);
attachmentService.attachIfPresent(ticket);
```

- [ ] **Step 4: Run attachment and existing studio tests**

Run:

```powershell
cd backend
./gradlew test --tests '*PerformanceMediaApiTest' --tests '*PerformanceStudioApiTest'
```

Expected: PASS.

- [ ] **Step 5: Commit attachment logic**

```powershell
git add backend/src/main/java/com/ssafy/b204/performance backend/src/main/java/com/ssafy/b204/media/service/MediaAttachmentService.java backend/src/test/java/com/ssafy/b204/performance/PerformanceMediaApiTest.java
git commit -m "feat: 업로드 이미지를 공연에 연결한다" -m "S15P21B204-99"
```

### Task 6: Clean expired temporary uploads safely

**Files:**
- Create: `backend/src/main/java/com/ssafy/b204/media/service/MediaCleanupScheduler.java`
- Modify: `backend/src/main/java/com/ssafy/b204/media/repository/UploadedFileRepository.java`
- Create: `backend/src/test/java/com/ssafy/b204/media/MediaCleanupSchedulerTest.java`

**Interfaces:**
- Consumes: `MediaStorage.deleteManaged(storedPath)`.
- Produces: hourly cleanup with cutoff `now - 24h`.

- [ ] **Step 1: Write failing cleanup tests**

Create old/new `TEMP` and old `ATTACHED` rows. Add a crafted `../outside.jpg` path and assert the outside sentinel remains. Verify only the old managed `TEMP` row and file are deleted.

- [ ] **Step 2: Run and observe failure**

Run: `cd backend; ./gradlew test --tests '*MediaCleanupSchedulerTest'`

Expected: FAIL because the scheduler does not exist.

- [ ] **Step 3: Implement bounded cleanup**

Fetch at most 100 candidates per run, normalize every path against `UPLOAD_DIR`, delete the row only after file deletion or confirmed absence, and log but retain the row after an I/O failure for the next run.

```java
@Scheduled(cron = "0 0 * * * *")
@Transactional
public void deleteExpiredTemporaryUploads() {
    LocalDateTime cutoff = TimeSupport.nowStored().minusHours(24);
    repository.findTop100ByStatusAndCreatedAtBeforeOrderByCreatedAtAsc(
            UploadedFile.Status.TEMP, cutoff).forEach(this::deleteIfManaged);
}
```

- [ ] **Step 4: Run cleanup tests**

Run: `cd backend; ./gradlew test --tests '*MediaCleanupSchedulerTest'`

Expected: PASS.

- [ ] **Step 5: Commit cleanup**

```powershell
git add backend/src/main/java/com/ssafy/b204/media backend/src/test/java/com/ssafy/b204/media/MediaCleanupSchedulerTest.java
git commit -m "feat: 만료된 임시 이미지를 정리한다" -m "S15P21B204-99"
```

### Task 7: Carry artwork through order and ticket reads

**Files:**
- Modify: `backend/src/main/java/com/ssafy/b204/ticket/dto/TicketDtos.java`
- Modify: `backend/src/main/java/com/ssafy/b204/ticket/service/OrderService.java`
- Modify: `backend/src/main/java/com/ssafy/b204/ticket/service/TicketService.java`
- Test: `backend/src/test/java/com/ssafy/b204/PerformancePaymentFlowTest.java`
- Create: `backend/src/test/java/com/ssafy/b204/ticket/TicketArtworkResponseTest.java`

**Interfaces:**
- Produces: nullable `posterImageUrl` and `ticketImageUrl` in order detail, ticket list, and ticket detail.

- [ ] **Step 1: Write failing response tests**

Persist one performance with both paths and one legacy performance with nulls. Assert both fields for the first and JSON omission/null compatibility for the second; do not alter QR or ticket ownership behavior.

- [ ] **Step 2: Run and observe failure**

Run: `cd backend; ./gradlew test --tests '*TicketArtworkResponseTest'`

Expected: FAIL because DTOs lack the fields.

- [ ] **Step 3: Add fields to DTO constructors and service mappings**

Read only from the associated performance. Do not copy artwork into ticket rows and do not put QR values into artwork fields.

```java
String posterImageUrl = mediaUrlResolver.publicUrl(performance.getPosterImagePath());
String ticketImageUrl = mediaUrlResolver.publicUrl(performance.getTicketImagePath());
```

- [ ] **Step 4: Run ticket/payment regressions**

Run:

```powershell
cd backend
./gradlew test --tests '*TicketArtworkResponseTest' --tests '*PerformancePaymentFlowTest'
```

Expected: PASS.

- [ ] **Step 5: Commit read propagation**

```powershell
git add backend/src/main/java/com/ssafy/b204/ticket backend/src/test/java/com/ssafy/b204/ticket/TicketArtworkResponseTest.java backend/src/test/java/com/ssafy/b204/PerformancePaymentFlowTest.java
git commit -m "feat: 발급 티켓에 공연 아트를 전달한다" -m "S15P21B204-99"
```

### Task 8: Wire persistent storage into local and production infrastructure

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker-compose.local.yml`
- Modify: `.env.example`
- Modify: `exec/nginx/j15b204.p.ssafy.io.conf`
- Modify: `frontend/vite.config.ts`
- Modify: `exec/rehearsal/RUNBOOK.md`

**Interfaces:**
- Produces: backend `UPLOAD_DIR=/app/uploads` backed by `/home/ubuntu/app/uploads`.
- Produces: Nginx `/uploads/` alias with immutable caching.
- Produces: local Vite `/uploads` proxy to Spring on port 8080.

- [ ] **Step 1: Add a failing configuration assertion**

Run before editing:

```powershell
rg -n "UPLOAD_DIR|location /uploads/|/uploads.*target" docker-compose.yml exec/nginx/j15b204.p.ssafy.io.conf frontend/vite.config.ts
```

Expected: no complete storage wiring.

- [ ] **Step 2: Add bind mounts and environment variables**

Production backend receives:

```yaml
environment:
  UPLOAD_DIR: /app/uploads
volumes:
  - /home/ubuntu/app/uploads:/app/uploads
```

The runbook creates the directory once with owner UID 10001 and mode 0755. The local backend profile uses a named `uploads_local_data` volume; host `bootRun` keeps `./data/uploads`.

- [ ] **Step 3: Add Nginx and Vite routes**

```nginx
location /uploads/ {
    alias /home/ubuntu/app/uploads/;
    autoindex off;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    add_header X-Content-Type-Options "nosniff" always;
}
```

Set upload API `client_max_body_size 6m` specifically on `location = /api/v1/files`, add a JSON `413` response carrying `FILE_TOO_LARGE`, and leave Jenkins and unrelated limits unchanged. Add a Vite `/uploads` proxy next to `/api`.

- [ ] **Step 4: Validate infrastructure files**

Run:

```powershell
docker compose -f docker-compose.yml config --quiet
docker compose -f docker-compose.local.yml config --quiet
git diff --check
```

On the server during deployment, run `sudo nginx -t` before reload.

- [ ] **Step 5: Commit infrastructure wiring**

```powershell
git add docker-compose.yml docker-compose.local.yml .env.example exec/nginx/j15b204.p.ssafy.io.conf frontend/vite.config.ts exec/rehearsal/RUNBOOK.md
git commit -m "chore: 공연 이미지 저장소를 배포에 연결한다" -m "S15P21B204-99"
```

### Task 9: Run the backend and contract quality gates

**Files:**
- Verify only.

**Interfaces:**
- Produces: a green backend/media foundation for the frontend plan.

- [ ] **Step 1: Run focused tests**

```powershell
cd backend
./gradlew test --tests '*Media*' --tests '*PerformanceMediaApiTest' --tests '*TicketArtworkResponseTest' --tests '*MemberWalletTeamFlowTest' --tests '*PerformanceStudioApiTest'
```

Expected: PASS.

- [ ] **Step 2: Run the full backend suite**

Run: `cd backend; ./gradlew test`

Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Rebuild and lint OpenAPI plus frontend generated types**

```powershell
cd docs/design/api
python build.py
npx -y @redocly/cli lint openapi.yaml
cd ../../../frontend
pnpm gen:api
pnpm typecheck
```

Expected: all commands succeed with no generated diff left unstaged.

- [ ] **Step 4: Check final diff**

Run: `git status --short; git diff --check`

Expected: only intentional backend/contract/infra changes, no secrets or `.env` files.
