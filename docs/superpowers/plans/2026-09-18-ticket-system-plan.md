# Ticket System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 가로형 블루 티켓을 완료·목록·상세에 통합하고 실제 서버 QR의 확대 보기를 제공한다.
**Architecture:** `features/ticket/ConcertTicket`을 기존 완료·목록·상세 어댑터가 공유한다. 자동 갱신은 `useTicketQr` 하나가 소유하고 `TicketQr`는 표시·카운트다운·Modal 확대만 담당한다.
**Tech Stack:** React 19, TypeScript, CSS, TanStack Query 5, qrcode, Vitest, Testing Library, 기존 Modal/useLocale.
**Spec:** `docs/superpowers/specs/2026-09-18-ticket-system-design.md`. 사용자 승인: “이대로 확정하고 구현해”.

## Global Constraints

- 작업 경로: `C:/Users/SSAFY/IdeaProjects/S15P21B204/.worktrees/mvp-completeness`; 아래 테스트 명령 cwd는 `frontend/`다.
- 인증·결제·권한·API 계약 변경과 다른 `features/*` 간 교차 import는 없다.
- 인쇄 1200ms + 정착 160ms = 총 1360ms 유지. 회전·새 reveal 없음. 1024px 미만 모바일과 reduced-motion 즉시 표시, 완료 CTA 즉시 사용 유지.
- 목록·완료는 QR 조회·생성 없음. 상세는 서버 `qrToken` 원문만 인코딩. quiet zone 최소 4모듈, 터치 영역 최소 44px.
- `TicketSummary/Detail`에는 `posterImageUrl`이 없다. 실데이터는 타이포 폴백, 제공된 상위 props만 포스터 변형 사용.
- 주문/티켓 식별자를 구분한다. used/cancelled는 QR을 숨기고 조회하지 않는다. 토큰 만료를 새 티켓 상태로 만들지 않는다.
- KO/EN 선택 언어 적용. 기존 dirty 변경 보존. 커밋·푸시·외부 쓰기 없음. 실행 방식 재질문 없음.

## 소유권과 순서

티켓 구현자 한 명이 Task 1 → 2 → 3을 연속 수행한다. 메인은 독립된 Task 4의 Modal·페이지/조회 테스트를 준비하고 Task 2·3 인수 후 연결한다. Task 5는 1~3 뒤, Task 6은 모두 완료 후 실행한다. 같은 파일 수정자는 한 명으로 유지하고 각 작업의 RED/GREEN 결과를 메인에 전달해 검토받는다.

## Task 1: 공용 표현과 완료·목록 어댑터

**Files:** 생성 `frontend/src/features/ticket/ConcertTicket.tsx/.css/.test.tsx`, `TicketStub.test.tsx`; 수정 같은 폴더 `ConcertCollectorTicket.tsx/.css/.test.tsx`, `TicketStub.tsx`.
**Interface:** `ConcertTicket`은 다음 props를 export한다. `issued`는 완료 표현이며 API 상태 추가가 아니다.

```tsx
export interface ConcertTicketProps {
  title: string; dateLabel: string; venue: string; ticketTypeName: string
  teamName?: string; status: 'valid' | 'used' | 'cancelled' | 'issued'
  serialLabel: string; serial: string; posterImageUrl?: string | null
  density: 'compact' | 'full'; children?: React.ReactNode; className?: string
}
```

- [ ] RED: Testing Library의 render/screen/fireEvent로 아래 테스트를 먼저 추가한다.
```tsx
it('keeps actual values after poster failure', () => {
  render(<ConcertTicket title="Live night" dateLabel="2026.09.26" venue="Rolling Hall"
    ticketTypeName="Standing" status="used" serialLabel="Ticket number" serial="41"
    posterImageUrl="/posters/12.webp" density="compact" />)
  fireEvent.error(screen.getByRole('img'))
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.getByText('Live night')).toBeVisible()
  expect(screen.getByText('41')).toBeVisible()
})
```
- [ ] 실행: `pnpm exec vitest run src/features/ticket/ConcertTicket.test.tsx` → 새 모듈 부재로 실패 확인.
- [ ] GREEN: 공용 루트/내부는 span 기반으로 만들고 block 배치는 CSS로 한다. 기본 button/article/링크를 만들지 않아 목록 button 내부 중첩을 피한다. 오른쪽 스텁에 children을 놓는다. 블루 바탕·큰 배경 타이포·분홍 타원·노치·절취선, compact/full 밀도를 구현한다. 포스터 대비 오버레이·오류 폴백·URL 변경 시 오류 초기화를 구현한다.
- [ ] 완료 어댑터는 접근 가능한 article·기존 testid·decorative를 유지하고 `status="issued"`, 실제 orderNumber/수량/금액/결제시각을 표시한다. QR 없음. 기존 Valid 고정·foil CSS 구조 테스트는 승인된 표현으로 교체한다.
- [ ] 목록 어댑터는 button·locked·zooming·onLockChange·onSelect 계약을 보존한다. compact 표현에 ticketId와 실제 상태를 전달한다. CSS 효과가 없는 조건에서 클릭 1회는 onSelect 1회/onLockChange 0회, locked일 때 둘 다 0회를 테스트한다.
- [ ] GREEN 실행: `pnpm exec vitest run src/features/ticket/ConcertTicket.test.tsx src/features/ticket/ConcertCollectorTicket.test.tsx src/features/ticket/TicketStub.test.tsx src/features/ticket/BookingComplete.motion.test.tsx src/features/ticket/TicketRevealStage.test.tsx`. KO/EN·포스터 URL 교체·실제 값·QR 부재·1360ms 회귀 포함.

## Task 2: QR 수명과 확대

**Files:** `frontend/src/features/ticket/TicketQr.tsx/.test.tsx`만 수정.
**Interface:** 기존 `qrToken?: string, rotateAfterMs?: number, onRotate: () => void`에 `issuedAt?: string, expiresAt?: string` 추가. onRotate는 수동 재시도 전용. 기존 Modal의 open/title/description/children/onClose 사용.

- [ ] RED: 아래 테스트와 확대 이미지 동일성·만료 동시 제거 테스트를 추가한다.
```tsx
it('does not auto-refetch from the display timer', async () => {
  vi.useFakeTimers()
  try {
    const onRotate = vi.fn()
    render(<TicketQr rotateAfterMs={1000} onRotate={onRotate} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(onRotate).not.toHaveBeenCalled()
  } finally { vi.useRealTimers() }
})
```
- [ ] 실행: `pnpm exec vitest run src/features/ticket/TicketQr.test.tsx` → 기존 자동 onRotate 때문에 실패 확인.
- [ ] GREEN: 자동 onRotate를 제거한다. `toString(qrToken, { type: 'svg', errorCorrectionLevel: 'M', margin: 4 })`로 생성한 같은 src를 작은/확대 보기에 사용한다. 원문·SVG 로그 없음.
- [ ] 만료는 절대 expiresAt 기준이다. 기존 수명 값이 없는 경우 issuedAt/토큰 수신시각과 rotateAfterMs의 폴백 기준을 토큰별로 고정한다. 콜백 변경·재렌더·확대 열기로 수명을 초기화하지 않는다. `image?.token === qrToken && now < expiresAtMs`일 때만 src를 노출한다.
- [ ] 작은 QR은 최소 44px의 이름 있는 확대 버튼이다. 기존 Modal로 확대하고 같은 이미지·만료 상태를 공유한다. 실패/만료 안내와 수동 재시도는 선택 언어로 제공한다.
- [ ] 확대 테스트: 실제 SVG 수신 → trigger.focus() → click → dialog img.src가 작은 img.src와 같음 → Escape → dialog 없음·trigger focus 복귀. 확대 중 만료와 새 토큰 전환도 검증한다.
- [ ] GREEN 실행: 같은 명령. 실제 SVG 생성·원문 인코딩·margin 4·생성 실패·최초부터 만료된 토큰·새 토큰 전환을 검증한다. 자동 onRotate는 0회, 명시적 재시도 한 번에 1회다.

## Task 3: 상세·목록 연결

**Files:** 수정 `frontend/src/features/ticket/TicketDetail.tsx`, `MyTickets.tsx`; 생성 `TicketDetail.test.tsx`.
**Interface:** Task 1/2 컴포넌트 사용. TicketDetailView에 선택 issuedAt/expiresAt 표시 props 추가. 기존 onRotateQr/onCancel·usedAt·cancellable 유지.

- [ ] RED: MemoryRouter 안에서 valid 상세의 확대 버튼을 찾는 테스트 추가. 기존 모핑 훅이 필요하면 페이지 테스트처럼 useViewTransitionState만 false mock.
- [ ] 실행: `pnpm exec vitest run src/features/ticket/TicketDetail.test.tsx` → 확대 버튼 부재 실패 확인.
- [ ] GREEN: 아래 연결을 적용하고 주문번호는 하단 정보 그리드에서 티켓번호와 별도로 표시한다.
```tsx
<ConcertTicket title={data.showTitle} dateLabel={data.dateLabel} venue={data.venue}
  ticketTypeName={data.ticketTypeName} teamName={data.teamName} status={data.status}
  serialLabel={text('티켓번호', 'Ticket number')} serial={data.ticketNumber}
  posterImageUrl={data.posterImageUrl} density="full">
  {data.status === 'valid' && <TicketQr qrToken={data.qrToken}
    issuedAt={data.issuedAt} expiresAt={data.expiresAt}
    rotateAfterMs={data.rotateAfterMs} onRotate={onRotateQr} />}
</ConcertTicket>
```
- [ ] used/cancelled에 토큰 props가 있어도 QR·확대 버튼 없음, usedAt 표시, cancellable=false 비활성, 취소 클릭 1회 콜백을 검증한다. 관람 안내·뒤로가기를 보존한다.
- [ ] MyTickets는 간격·가용 폭만 조정한다. 탭·조회·선택 계약은 유지한다.
- [ ] GREEN 실행: `pnpm exec vitest run src/features/ticket/TicketDetail.test.tsx src/features/ticket/TicketStub.test.tsx src/pages/TicketDetailPage.qr.test.tsx`.

## Task 4: 페이지·조회 검증과 공용 Modal — 메인 소유

**Files:** 수정 `frontend/src/pages/TicketDetailPage.tsx/.qr.test.tsx`, `frontend/src/shared/ui/Modal.tsx/.test.tsx`; 생성 `frontend/src/shared/queries/ticket.test.tsx`. 실제 useTicketQr polling 정책 유지.

- [ ] RED: 페이지 mock이 qrError와 cached qr.data를 동시에 반환하게 한다. 오류 후 이미지 없음·티켓 정보 유지 테스트를 추가한다. Modal에는 KO/EN 닫기 이름 전환 테스트를 추가한다.
- [ ] 실행: `pnpm exec vitest run src/pages/TicketDetailPage.qr.test.tsx src/shared/ui/Modal.test.tsx` → 오래된 이미지/고정 한글 이름 실패 확인.
- [ ] GREEN: 페이지 전달값을 아래처럼 연결하고 QR_EXPIRED의 1회 오류 복구·로그인 유지 계약을 보존한다.
```tsx
data={{ ...view, qrToken: qr.error ? undefined : qr.data?.qrToken,
  issuedAt: qr.data?.issuedAt, expiresAt: qr.data?.expiresAt,
  rotateAfterMs: qr.data?.rotateAfterMs }}
```
- [ ] Modal: useLocale로 backdrop/닫기 이름 번역, `max-h-[calc(100dvh-2rem)] overflow-y-auto`, 닫기 h-11 w-11 유지(md:h-8/md:w-8 제거). focusTrap·restoreFocus·Escape·스크롤 잠금 보존.
- [ ] Query 테스트는 API fetchTicketQr만 mock하고 실제 useTicketQr+TicketQr+QueryClientProvider 사용. retry:false, fake timers, 30_000ms 응답. 최초 요청 완료 flush 후 아래 요청 수를 검증한다. 확대 열기·닫기는 요청 수를 늘리지 않아야 한다.
```tsx
expect(fetchTicketQr).toHaveBeenCalledTimes(1)
await act(async () => { await vi.advanceTimersByTimeAsync(29_999) })
expect(fetchTicketQr).toHaveBeenCalledTimes(1)
await act(async () => { await vi.advanceTimersByTimeAsync(1) })
expect(fetchTicketQr).toHaveBeenCalledTimes(2)
```
- [ ] GREEN 실행: `pnpm exec vitest run src/pages/TicketDetailPage.qr.test.tsx src/shared/queries/ticket.test.tsx src/shared/ui/Modal.test.tsx src/features/ticket/TicketQr.test.tsx`. USED/CANCELLED enabled=false, 캐시+오류 숨김, 만료 복구 1회 포함. 타이머·QueryClient 정리.

## Task 5: 개발 미리보기

**Files:** `frontend/src/pages/DesignRefreshPage.tsx/.test.tsx`. 기존 개발 전용 라우트/선택기 사용. 실 API 페이지 대신 BookingComplete/MyTickets/TicketDetail 직접 렌더링.

- [ ] RED: MemoryRouter에서 선택기 "Ticket detail" 클릭 → `/sample QR.*not valid for entry/i` 안내 표시·fetch spy 호출 0회 테스트 추가.
- [ ] 실행: `pnpm exec vitest run src/pages/DesignRefreshPage.test.tsx` → 새 선택기 부재로 실패 확인.
- [ ] GREEN: 목록/상세 탭, 포스터 있음/없음/깨진 URL, valid/used/cancelled, 긴 제목 fixture 제공. QR은 sample-only 문자열, 화면 안내는 `text('샘플 QR · 실제 입장에 사용할 수 없습니다', 'Sample QR · not valid for entry')`. 실제 API 요청·결제/취소 없음.
- [ ] fixture 수명 기준은 생성 시 고정한다. 명시적 조작으로만 새 샘플 토큰을 공급한다. 기존 로컬 /posters/12.webp와 LanguageSwitch 사용.
- [ ] GREEN: 같은 테스트 명령. 기존 미리보기 탭 유지·실 API 요청 없음 확인.

## Task 6: 전체 회귀와 브라우저 인수

- [ ] 변경된 티켓·페이지·조회·Modal·미리보기 테스트를 집중 실행 후 `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check`를 각각 실행한다. 기존 459개 회귀와 새 테스트를 합친 실제 통과 수를 기록한다.
- [ ] `pnpm dev --host 127.0.0.1`의 실제 포트와 기존 개발 미리보기 경로를 확인한다. 1440px/390px·KO/EN, 완료/목록/상세, 포스터 있음/없음/실패, 긴 제목, 모든 상태를 캡처한다. 증거는 `_workspace/` 아래 저장한다.
- [ ] 대비·잘림·수평 넘침·44px 터치 영역·노치/스텁 통일감을 확인한다. 키보드 확대·Escape·focus 복귀, 낮은 화면의 스크롤/닫기 접근, 확대 중 만료/실패/새 토큰을 확인한다.
- [ ] 데스크톱 1360ms 인쇄, 모바일/reduced-motion 즉시 표시, 첫 렌더부터 완료 CTA 사용을 확인한다. 새로운 회전/reveal 없음.
- [ ] 실제 토큰과 검표 기기가 있으면 작은/확대 QR의 기기·폭·스캔 결과를 기록한다. 없으면 미검증으로 보고한다. fixture/스크린샷/자동 테스트를 실제 스캔 성공으로 보고하지 않는다.
- [ ] 최종 보고: 변경·테스트 수·typecheck/lint/build·스크린샷 위치·실기기 미검증 범위. 후속 관객/회원·지갑/스튜디오/정산·관리자 UI는 별도. 커밋·푸시 없음.

## 실행 결과 — 2026-09-18

메인 세션의 최종 검증 결과를 기록한다. Task 1~5 구현과 Task 6 자동 검증·브라우저 QA를 완료했다. 위 체크박스는 원래 실행 계획으로 보존하며, 아래 검증 범위와 미검증 항목을 최종 판정으로 삼는다.

- `pnpm test`: 105개 파일·497개 테스트 PASS. 근거: `_workspace/ticket-system-final-tests.json`.
- typecheck·lint·build·git diff check PASS. 기존 querystring 외부화·PURE annotation·큰 청크 빌드 경고는 남아 있다.
- CUA에서 1440/390/320px, KO/EN, 완료·목록·상세, 포스터 있음/없음/실패·긴 제목을 확인했다. 수평 넘침은 없고 used/cancelled에서는 QR·취소 동작이 표시되지 않았다.
- 작은 QR·확대 QR이 같은 이미지를 사용했다. 60초 수명 fixture를 실제로 기다려 만료 시 두 이미지 제거를 확인했고 Escape·배경 클릭 뒤 포커스 복귀를 확인했다.
- 640×420 화면에서 Modal 높이 388px·세로 스크롤 auto·닫기 44×44px을 확인했다.
- 데스크톱 1360ms 인쇄 후 티켓이 viewport 안에 표시됐다. 모바일은 animation none·replay 없음. reduced-motion은 단위 테스트로만 확인했다.
- 실제 서버 QR·실물 검표 기기의 스캔은 미검증이다. 브라우저 fixture 검증을 실제 입장 성공으로 판정하지 않는다.
- 최종 리뷰 Approved: `_workspace/ticket-final-review.md`, `_workspace/ticket-page-review-result.md`.
- 전체 앱의 후속 UI 묶음은 미완료이며 `_workspace/all-screen-refresh-waves.md`로 분리했다. 기존 주문·환불 mock 문제도 이번 작업에서 수정하지 않았다.
- 현재 브랜치 `fix/fe/mvp-completeness`와 작업 트리를 보존했다. 커밋·푸시·병합·배포는 수행하지 않았다.
