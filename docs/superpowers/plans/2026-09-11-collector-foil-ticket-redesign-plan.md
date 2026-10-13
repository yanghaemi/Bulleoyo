# Collector Foil A+ Ticket Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 결제 완료 화면의 실제 티켓을 `Collector Foil A+` 디자인으로 재구성하고 기존 시네마틱 리빌과 정확히 결합한다.

**Architecture:** `ConcertCollectorTicket`가 실제 데이터와 반응형 시각 구조를 소유하고, `TicketRevealStage`는 티켓 내용을 알지 않은 채 같은 실루엣 비율로 회전·안착·광택만 제공한다. 데이터 계약은 `BookingCompleteView` 그대로 유지한다.

**Tech Stack:** React 19, TypeScript, CSS, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-09-11-collector-foil-ticket-redesign-design.md`

## Global Constraints

- 기존 연결 작업과 문서 수정이 함께 있는 작업 트리이므로 자동 커밋·스테이징은 하지 않는다.
- 실제 예매 데이터 외 좌석·게이트·QR 등의 값을 만들지 않는다.
- 기존 5.2초 리빌 궤적과 reduced-motion 정책은 보존한다.
- 구현은 테스트 실패를 먼저 확인한 뒤 최소 변경으로 통과시키는 순서로 진행한다.

---

## Task 1: Collector Foil A+ 티켓 구조와 반응형 디자인

**Files:**

- Modify: `frontend/src/features/ticket/ConcertCollectorTicket.test.tsx`
- Modify: `frontend/src/features/ticket/ConcertCollectorTicket.tsx`
- Modify: `frontend/src/features/ticket/ConcertCollectorTicket.css`

- [x] **Step 1: 새 디자인 계약을 테스트로 고정**

  레이아웃 식별자 `collector-foil-a-plus`, `13 / 5` 비율, 포일 레일, 정품 실, 모바일 세로 패스 규칙을 검증한다. 기존의 실제 값 노출과 가짜 좌석·게이트·QR 금지 테스트는 유지한다.

- [x] **Step 2: 변경된 테스트가 실패하는지 확인**

  Run: `pnpm test -- ConcertCollectorTicket.test.tsx`
  Expected: 새 레이아웃 식별자와 CSS 계약이 아직 없어서 FAIL

- [x] **Step 3: 티켓 마크업과 CSS 구현**

  포스터 27%, 큰 제목, 매트 블랙 배경, 이리데슨트 포일 테두리, 절취 노치, 장식용 정품 실을 추가한다. `64rem` 미만에서는 포스터-본문-스텁의 세로형 패스로 재배치한다.

- [x] **Step 4: 단위 테스트 통과 확인**

  Run: `pnpm test -- ConcertCollectorTicket.test.tsx`
  Expected: PASS

---

## Task 2: 시네마틱 리빌 실루엣 동기화

**Files:**

- Modify: `frontend/src/features/ticket/TicketRevealStage.test.tsx`
- Modify: `frontend/src/features/ticket/TicketRevealStage.css`
- Modify: `frontend/src/features/ticket/BookingComplete.motion.test.tsx`

- [x] **Step 1: 리빌 프록시 비율과 통합 식별자 테스트 갱신**

  뒷면과 잔상이 `13 / 5`를 사용하고 결제 완료 화면이 `collector-foil-a-plus` 티켓을 렌더링하는지 검증한다.

- [x] **Step 2: 변경된 테스트가 실패하는지 확인**

  Run: `pnpm test -- TicketRevealStage.test.tsx BookingComplete.motion.test.tsx`
  Expected: 기존 `1280 / 422`, `collector-a` 계약 때문에 FAIL

- [x] **Step 3: 리빌 CSS 비율을 실제 티켓과 맞춤**

  회전 궤적과 5.2초 타이밍은 건드리지 않고 뒷면과 잔상의 실루엣만 `13 / 5`로 변경한다.

- [x] **Step 4: 티켓 모션 관련 테스트 통과 확인**

  Run: `pnpm test -- ConcertCollectorTicket.test.tsx TicketRevealStage.test.tsx BookingComplete.motion.test.tsx`
  Expected: PASS

---

## Task 3: 시각 검증, 문서 동기화, 전체 품질 게이트

**Files:**

- Modify: `docs/frontend/STAGE_LEDGER_DECISIONS.md`
- Modify: `docs/frontend/STAGE_LEDGER_STATUS.md`

- [x] **Step 1: 결정 문서 갱신**

  `Collector Foil A+`, `13 / 5`, 실제 데이터만 사용, 모바일 세로 패스, 기존 리빌 광택 재사용 결정을 기록한다.

- [x] **Step 2: 브라우저 시각 검증**

  `http://127.0.0.1:5173`에서 결제 완료 리빌의 인쇄-회전-안착-광택과 최종 티켓을 확인한다. 데스크톱과 모바일에서 잘림, 가로 넘침, 텍스트 대비를 확인한다.

- [x] **Step 3: 전체 검증**

  Run: `pnpm test`
  Expected: 전체 PASS

  Run: `pnpm typecheck`
  Expected: exit 0

  Run: `pnpm lint`
  Expected: exit 0

  Run: `pnpm build`
  Expected: exit 0

  Run: `git diff --check`
  Expected: 출력 없음
