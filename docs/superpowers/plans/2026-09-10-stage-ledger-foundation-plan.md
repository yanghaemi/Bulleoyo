# Stage Ledger Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공연 예매 데모 데이터의 정합성, 모바일 폭, 초기 번들, 무대 효과 범위와 정본 문서를 안정화한다.

**Architecture:** 현재 `app → pages → features → shared` 의존 방향을 유지한다. 화면별 상수로 흩어진 예매 목 데이터는 pages 전용 fixture 모듈 하나로 합치고, 라우트 지연 로드와 경로 기반 무대 효과는 app 계층에서 처리한다.

**Tech Stack:** React 19, TypeScript, React Router 7, Tailwind CSS v4, Vitest, Motion, vgpu

**Spec:** `docs/superpowers/specs/2026-09-10-stage-ledger-frontend-design.md`

## Global Constraints

- 첫 진입 기본 테마는 `dark`, 색상 값의 정본은 팀 토큰이다.
- `Meta`·`Apple` 선택 UI는 개발 환경에서만 노출한다.
- 모바일 최소 기준 폭은 360px이고 페이지 전체 가로 스크롤을 만들지 않는다.
- WebGPU·모션이 꺼져도 기능과 정보는 동일해야 한다.
- 새로운 런타임 의존성을 추가하지 않는다.
- `.claude/launch.json`의 기존 사용자 변경은 수정하거나 커밋하지 않는다.
- 기능 변경은 실패하는 테스트를 먼저 실행한다.

---

### Task 1: 공연 ID 기반 데모 예매 데이터 단일화

**Files:**
- Create: `frontend/src/pages/demoBookingFlow.ts`
- Create: `frontend/src/pages/demoBookingFlow.test.ts`
- Modify: `frontend/src/pages/PerformanceDetailPage.tsx`
- Modify: `frontend/src/pages/TicketOptionsPage.tsx`
- Modify: `frontend/src/pages/TeamChoicePage.tsx`
- Modify: `frontend/src/pages/PaymentPage.tsx`
- Modify: `frontend/src/pages/BookingCompletePage.tsx`
- Delete: `frontend/src/features/performance/mockDetails.ts`

**Interfaces:**
- Produces: `demoBookingFlowFor(performanceId: string | undefined): DemoBookingFlow`
- Produces: `DemoBookingFlow = { detail, ticketOptions, teamChoice, payment, complete }`
- Consumes: 기존 `PerformanceDetailView`, `TicketOptionsView`, `TeamChoiceView`, `PaymentView`, `BookingCompleteView`
- Route contract: 결제 URL의 `from` query가 원래 `performanceId`를 보존하며, 완료 URL에도 `from`을 보존한다.

- [x] **Step 1: 예매 단계의 공연 정보가 같아야 한다는 실패 테스트 작성**

```ts
import { describe, expect, it } from 'vitest'

import { demoBookingFlowFor } from './demoBookingFlow'

describe('demoBookingFlowFor', () => {
  it('공연 7의 제목·장소·공연 ID를 예매와 결제까지 유지한다', () => {
    const flow = demoBookingFlowFor('7')

    expect(flow.detail.title).toBe('Seoul Indie Night vol.12')
    expect(flow.ticketOptions.performanceId).toBe('7')
    expect(flow.ticketOptions.showTitle).toBe(flow.detail.title)
    expect(flow.teamChoice.showTitle).toBe(flow.detail.title)
    expect(flow.teamChoice.summary.venue).toBe(flow.detail.venue)
    expect(flow.payment.showTitle).toBe(flow.detail.title)
    expect(flow.complete.showTitle).toBe(flow.detail.title)
  })

  it('공연 7의 참여팀을 팀 선택 화면에 같은 순서로 제공한다', () => {
    const flow = demoBookingFlowFor('7')
    expect(flow.teamChoice.teams.map((team) => team.teamName)).toEqual([
      'Dabda',
      'Say Sue Me',
      'Silica Gel',
      'wave to earth',
    ])
  })

  it('알 수 없는 공연 ID는 기존 기본 공연 12로 안전하게 대체한다', () => {
    expect(demoBookingFlowFor('999').detail.performanceId).toBe(12)
  })
})
```

- [x] **Step 2: 테스트를 실행해 모듈 부재로 실패하는지 확인**

Run: `pnpm test -- src/pages/demoBookingFlow.test.ts`

Expected: FAIL with `Failed to resolve import "./demoBookingFlow"`.

- [x] **Step 3: 공연별 데모 흐름 생성기 구현**

`demoBookingFlow.ts`에서 기존 7개 상세 데이터를 옮기고 다음 규칙으로 파생 화면을 만든다.

```ts
export interface DemoBookingFlow {
  detail: PerformanceDetailView
  ticketOptions: TicketOptionsView
  teamChoice: TeamChoiceView
  payment: PaymentView
  complete: BookingCompleteView
}

export function demoBookingFlowFor(performanceId: string | undefined): DemoBookingFlow {
  const detail = detailFor(performanceId)
  const id = String(detail.performanceId)
  const ticketType = ticketTypesFor(detail)[0]
  const teamName = detail.teamNames[0]

  return {
    detail,
    ticketOptions: {
      performanceId: id,
      showTitle: detail.title,
      dateLabel: detail.dateLabel,
      venue: detail.venue,
      ticketTypes: ticketTypesFor(detail),
    },
    teamChoice: {
      showTitle: detail.title,
      teams: detail.teamNames.map((name, index) => ({ teamId: detail.performanceId * 10 + index, teamName: name, teamIndex: index })),
      summary: {
        performanceId: id,
        showTitle: detail.title,
        dateLabel: detail.dateLabel,
        venue: detail.venue,
        ticketTypeName: ticketType.name,
        quantity: 1,
        totalAmount: ticketType.price,
        totalApprox: ticketType.priceApprox,
      },
    },
    payment: paymentFor(detail, ticketType, teamName),
    complete: completeFor(detail, ticketType, teamName),
  }
}
```

`ticketTypesFor`, `paymentFor`, `completeFor`는 같은 파일의 비공개 함수로 두고 화면 컴포넌트에는 파생 규칙을 중복하지 않는다.

- [x] **Step 4: 각 페이지가 URL의 공연 ID로 같은 fixture를 읽도록 변경**

```ts
const { id } = useParams()
const flow = demoBookingFlowFor(id)
```

`PaymentPage`와 `BookingCompletePage`는 `useSearchParams()`의 `from`을 사용한다. `onBackToShow`는 `/performances/${flow.detail.performanceId}`로 이동한다.

- [x] **Step 5: 단위 테스트 통과 확인**

Run: `pnpm test -- src/pages/demoBookingFlow.test.ts`

Expected: 3 tests PASS.

- [x] **Step 6: 전체 테스트와 타입 검사**

Run: `pnpm test && pnpm typecheck`

Expected: all tests PASS and TypeScript exits 0.

Actual (2026-09-10): 8개 테스트 파일, 70개 테스트 통과. `pnpm typecheck` 종료 코드 0.

- [x] **Step 7: 커밋**

```bash
git add frontend/src/pages/demoBookingFlow.ts frontend/src/pages/demoBookingFlow.test.ts frontend/src/pages/PerformanceDetailPage.tsx frontend/src/pages/TicketOptionsPage.tsx frontend/src/pages/TeamChoicePage.tsx frontend/src/pages/PaymentPage.tsx frontend/src/pages/BookingCompletePage.tsx frontend/src/features/performance/mockDetails.ts
git commit -m "fix(fe): 예매 데모 데이터를 공연 ID로 단일화"
```

### Task 2: 무대 효과를 탐색 라우트에만 적용

**Files:**
- Create: `frontend/src/app/stageRoutes.ts`
- Create: `frontend/src/app/stageRoutes.test.ts`
- Create: `frontend/src/app/StageEffects.tsx`
- Modify: `frontend/src/app/RouteTitle.tsx`
- Modify: `frontend/src/app/providers.tsx`

**Interfaces:**
- Produces: `isStageRoute(pathname: string): boolean`
- Produces: `StageEffects(): ReactElement | null`
- Stage routes: `/`, `/performances`, `/performances/:positiveInteger`
- Excludes: `/performances/:id/order`, `/wallet`, `/studio/*`, `/verify/*`, `/admin/*`

- [x] **Step 1: 경로 판정 실패 테스트 작성**

```ts
import { describe, expect, it } from 'vitest'

import { isStageRoute } from './stageRoutes'

describe('isStageRoute', () => {
  it.each(['/', '/performances', '/performances/7'])('%s에는 무대 효과를 표시한다', (path) => {
    expect(isStageRoute(path)).toBe(true)
  })

  it.each(['/performances/7/order', '/wallet', '/studio', '/verify/supply', '/admin/coin'])(
    '%s에는 무대 효과를 표시하지 않는다',
    (path) => expect(isStageRoute(path)).toBe(false),
  )
})
```

- [x] **Step 2: 테스트를 실행해 모듈 부재로 실패 확인**

Run: `pnpm test -- src/app/stageRoutes.test.ts`

Expected: FAIL resolving `stageRoutes`.

- [x] **Step 3: 순수 경로 판정 함수 구현**

```ts
export function isStageRoute(pathname: string): boolean {
  if (pathname === '/' || pathname === '/performances') return true
  return /^\/performances\/\d+$/.test(pathname)
}
```

- [x] **Step 4: 라우터 안에서만 효과를 렌더하는 컴포넌트 구현**

```tsx
export function StageEffects() {
  const { pathname } = useLocation()
  if (!isStageRoute(pathname)) return null
  return (
    <>
      <AmbientBackdrop />
      <StageBloom />
    </>
  )
}
```

`RouteTitle`은 `<StageEffects /><Outlet /></>`을 반환하고, `providers.tsx`에서는 두 효과 import와 전역 렌더를 제거한다.

- [x] **Step 5: 경로 테스트와 전체 테스트 통과 확인**

Run: `pnpm test -- src/app/stageRoutes.test.ts && pnpm test`

Expected: route tests and full suite PASS.

Actual (2026-09-10): 9개 테스트 파일, 78개 테스트 통과. `stageRoutes.test.ts` 8개와 `pnpm typecheck` 통과.

- [x] **Step 6: 커밋**

```bash
git add frontend/src/app/stageRoutes.ts frontend/src/app/stageRoutes.test.ts frontend/src/app/StageEffects.tsx frontend/src/app/RouteTitle.tsx frontend/src/app/providers.tsx
git commit -m "perf(fe): 무대 효과를 탐색 화면으로 제한"
```

### Task 3: 360px 모바일 폭 안정화

**Files:**
- Create: `frontend/src/features/wallet/SegmentedFilter.test.tsx`
- Create: `frontend/src/features/performance/ShowCarousel.test.tsx`
- Modify: `frontend/src/features/wallet/SegmentedFilter.tsx`
- Modify: `frontend/src/features/wallet/WalletScreen.tsx`
- Modify: `frontend/src/features/performance/HomeScreen.tsx`
- Modify: `frontend/src/features/performance/ShowCarousel.tsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- `SegmentedFilter`의 row 방향은 자체 영역만 가로 스크롤한다.
- 페이지·메인·그리드의 flex/grid 자식은 `min-width: 0`을 갖는다.
- 모든 의도된 가로 스크롤 영역에는 `data-scroll-region`을 표시한다.

- [x] **Step 1: 필터 스크롤 경계를 나타내는 실패 테스트 작성**

```tsx
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'

import { SegmentedFilter } from './SegmentedFilter'

it('row 필터는 페이지가 아니라 자체 영역에서만 가로 스크롤한다', () => {
  render(
    <SegmentedFilter
      items={[{ key: 'ALL', en: 'All', ko: '전체' }, { key: 'PAYMENT', en: 'Payment', ko: '결제' }]}
      value="ALL"
      onChange={() => undefined}
      orientation="row"
      ariaLabel="거래 필터"
    />,
  )

  const filter = screen.getByRole('group', { name: '거래 필터' })
  expect(filter).toHaveAttribute('data-scroll-region', 'horizontal')
  expect(filter).toHaveClass('max-w-full', 'min-w-0', 'overflow-x-auto')
})
```

- [x] **Step 2: 테스트 실패 확인**

Run: `pnpm test -- src/features/wallet/SegmentedFilter.test.tsx`

Expected: FAIL because `data-scroll-region` and width boundary classes are absent.

- [x] **Step 3: 내부 스크롤 경계와 페이지 폭 수정**

`SegmentedFilter` row root에 `max-w-full min-w-0 overflow-x-auto overscroll-x-contain`과 `data-scroll-region="horizontal"`을 적용한다. `WalletScreen`의 모바일 필터 부모와 홈 날짜 필터에 `min-w-0 max-w-full`을 적용한다.

`styles.css` base layer에 다음 안전장치를 추가한다.

```css
html,
body,
#root {
  max-width: 100%;
  min-width: 0;
}

body {
  overflow-x: clip;
}
```

`overflow-x: clip`은 페이지 루트의 실수로 생긴 브라우저 스크롤만 차단하며, `data-scroll-region` 내부의 `overflow-x: auto`는 유지한다.

실측 중 캐러셀의 절대 배치된 옆 카드가 홈 문서 폭을 늘리는 것이 추가로 확인됐다. `ShowCarousel` 경계에 `overflow-x-clip`을 적용하고 회귀 테스트를 추가한다.

- [x] **Step 4: 컴포넌트 테스트 통과 확인**

Run: `pnpm test -- src/features/wallet/SegmentedFilter.test.tsx`

Expected: PASS.

- [x] **Step 5: 실제 360px·390px 화면 확인**

Run: `pnpm dev -- --host 127.0.0.1 --port 5173 --strictPort`

Check:
- `/` 날짜 칩만 내부 스크롤되고 페이지 가로 스크롤 없음
- `/wallet` 거래 필터만 내부 스크롤되고 하단 탭이 화면 폭 안에 있음
- `/verify/supply` 긴 숫자·영문이 화면 밖으로 나가지 않음

Actual (2026-09-10): 360px·390px 모두 세 경로의 `documentScrollWidth === innerWidth`. 홈 날짜 칩과 지갑 필터는 각각 자체 `overflow-x: auto` 영역을 유지.

- [x] **Step 6: 전체 테스트·타입·린트 확인**

Run: `pnpm test && pnpm typecheck && pnpm lint`

Expected: all commands exit 0.

Actual (2026-09-10): 11개 테스트 파일, 80개 테스트 통과. 타입 검사와 린트 종료 코드 0.

- [x] **Step 7: 커밋**

```bash
git add frontend/src/features/wallet/SegmentedFilter.test.tsx frontend/src/features/wallet/SegmentedFilter.tsx frontend/src/features/wallet/WalletScreen.tsx frontend/src/features/performance/HomeScreen.tsx frontend/src/features/performance/ShowCarousel.tsx frontend/src/features/performance/ShowCarousel.test.tsx frontend/src/styles.css
git commit -m "fix(fe): 모바일 가로 스크롤 경계를 안정화"
```

### Task 4: 라우트 단위 코드 분할

**Files:**
- Create: `frontend/src/app/lazyPage.ts`
- Create: `frontend/src/app/lazyPage.test.ts`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/pages/index.tsx`

**Interfaces:**
- Produces: `lazyPage<TModule, TKey extends keyof TModule>(loader, key)` returning React Router lazy route result `{ Component }`
- Router continues to own `handle.title` and `handle.description`.
- Redirect components remain eager because they add negligible size.

- [x] **Step 1: lazy export 선택 실패 테스트 작성**

```ts
import { expect, it } from 'vitest'

import { lazyPage } from './lazyPage'

it('동적 모듈에서 지정한 named page를 Component로 반환한다', async () => {
  function Page() { return null }
  const load = lazyPage(async () => ({ Page }), 'Page')
  await expect(load()).resolves.toEqual({ Component: Page })
})
```

- [x] **Step 2: 테스트 실패 확인**

Run: `pnpm test -- src/app/lazyPage.test.ts`

Expected: FAIL resolving `lazyPage`.

- [x] **Step 3: 타입 안전한 lazy helper 구현**

```ts
import type { ComponentType } from 'react'

export function lazyPage<TModule, TKey extends keyof TModule>(
  loader: () => Promise<TModule>,
  key: TKey,
) {
  return async (): Promise<{ Component: ComponentType }> => {
    const module = await loader()
    return { Component: module[key] as ComponentType }
  }
}
```

- [x] **Step 4: 각 라우트를 직접 동적 import하도록 변경**

```ts
const home = lazyPage(() => import('@/pages/HomePage'), 'HomePage')
const wallet = lazyPage(() => import('@/pages/WalletPage'), 'WalletPage')

{ path: '/', lazy: home }
{ path: '/wallet', lazy: wallet, handle: { title: '잔액' } }
```

관객·공연자·검표·검증·관리자 페이지를 모두 같은 방식으로 바꾼다. `pages/index.tsx`는 리다이렉트 컴포넌트만 남기거나 삭제하고, 라우터 안에 작은 리다이렉트 컴포넌트를 둔다.

- [x] **Step 5: lazy helper와 전체 테스트 통과 확인**

Run: `pnpm test -- src/app/lazyPage.test.ts && pnpm test && pnpm typecheck`

Expected: all commands exit 0.

- [x] **Step 6: 프로덕션 빌드에서 초기 청크 감소 확인**

Run: `pnpm build`

Expected:
- build exits 0
- 페이지별 청크가 생성됨
- 기존 `887.80 kB` 단일 청크보다 최대 앱 청크가 작음
- 홈 초기 청크가 관리자·스튜디오 페이지 청크에 의존하지 않음

Actual (2026-09-10): 최대 앱 청크 381.68 kB(기존 887.80 kB 대비 약 57% 감소). 홈 프로덕션 첫 로드에 `HomePage` 청크가 포함되고 `Admin`·`Studio` 청크는 포함되지 않음.

- [x] **Step 7: 커밋**

```bash
git add frontend/src/app/lazyPage.ts frontend/src/app/lazyPage.test.ts frontend/src/app/router.tsx frontend/src/pages/index.tsx
git commit -m "perf(fe): 화면 라우트를 지연 로드"
```

### Task 5: 정본 문서와 Claude 인계 문서 동기화

**Files:**
- Create: `docs/design/14_디자인_토큰_v2.md`
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Create: `docs/frontend/STAGE_LEDGER_STATUS.md`
- Create: `docs/frontend/STAGE_LEDGER_DECISIONS.md`
- Modify: `docs/superpowers/plans/2026-09-10-stage-ledger-foundation-plan.md`

**Interfaces:**
- `CLAUDE.md`는 설계·현재 계획·상태·결정 로그 네 경로만 짧게 안내한다.
- 상태 문서는 다음 세션이 실행할 명령과 현재 미완료 범위를 포함한다.
- 디자인 토큰 v1은 원본 보존하고 v2를 새 정본으로 만든다.

- [x] **Step 1: 디자인 토큰 v2 작성**

v1 내용을 보존해 v2를 만들고 폰트 절을 다음으로 변경한다.

```css
--font-sans: "DM Sans", "Noto Sans KR", system-ui, sans-serif;
--font-num: Inter, "DM Sans", "Noto Sans KR", system-ui, sans-serif;
--font-mono: "JetBrains Mono", "DM Mono", ui-monospace, monospace;
```

결정 이력에 2026-09-08 강병구 결정, 금액 폭 안정성, 0/O 식별성을 기록한다. Meta·Apple에서만 Inter를 쓴다는 기존 문구를 삭제한다.

- [x] **Step 2: README 공통 응답 규격 링크 수정**

README의 공통 응답 규격 링크를 현행 v3 파일인 `01_API_공통_응답_규격.md`로 바꾼다. 디자인 토큰 정본 링크가 있다면 v2로 갱신한다.

- [x] **Step 3: 결정 로그와 진행 상태 작성**

`STAGE_LEDGER_DECISIONS.md`에 다음 결정을 기록한다.

- 팀 토큰 정본 + 첫 표시 dark
- Inter 금액, JetBrains Mono 식별자
- Meta·Apple 개발 전용
- 새 시각 런타임 의존성 추가 없음
- 실험 기능은 progressive enhancement

`STAGE_LEDGER_STATUS.md`에는 단계 A의 각 Task 상태, 커밋, 테스트 결과, 단계 B·C 미착수, `.claude/launch.json` 제외 사실을 기록한다.

- [x] **Step 4: CLAUDE.md 진입점 추가**

```md
## Stage Ledger 프론트엔드 작업

- 설계: `docs/superpowers/specs/2026-09-10-stage-ledger-frontend-design.md`
- 현재 계획: `docs/superpowers/plans/2026-09-10-stage-ledger-foundation-plan.md`
- 진행 상태: `docs/frontend/STAGE_LEDGER_STATUS.md`
- 결정 로그: `docs/frontend/STAGE_LEDGER_DECISIONS.md`
```

- [x] **Step 5: 문서 정합성 검사**

Run:

```bash
rg -n "01_API_공통_응답_규격_v[12]\.md" README.md CLAUDE.md docs/frontend
rg -n "font-num|JetBrains Mono|첫 진입.*dark" docs/design/14_디자인_토큰_v2.md docs/frontend/STAGE_LEDGER_DECISIONS.md
git diff --check
```

Expected: 첫 검색은 결과 없음, 두 번째 검색은 결정 근거 표시, diff check exits 0.

- [x] **Step 6: 최종 검증**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`

Expected: all commands exit 0 and all test files pass.

Actual (2026-09-10): 12개 테스트 파일, 81개 테스트 통과. typecheck·lint·build 모두 종료 코드 0. 최대 앱 청크 381.68 kB.

- [x] **Step 7: 계획 체크박스와 상태 문서에 실제 결과 반영**

실행한 단계만 `[x]`로 바꾸고, 테스트 파일 수·테스트 수·최대 청크 크기를 명령 출력 그대로 기록한다.

- [x] **Step 8: 커밋**

```bash
git add README.md CLAUDE.md docs/design/14_디자인_토큰_v2.md docs/frontend/STAGE_LEDGER_STATUS.md docs/frontend/STAGE_LEDGER_DECISIONS.md docs/superpowers/plans/2026-09-10-stage-ledger-foundation-plan.md docs/superpowers/specs/2026-09-10-stage-ledger-frontend-design.md frontend/src/styles.css
git commit -m "docs(fe): Stage Ledger 인계 문서를 연결"
```

## Plan Self-Review

- 단계 A의 다섯 목표는 각각 Task 1~5에 대응한다.
- 새 타입의 생산·소비 파일과 라우트 파라미터 전달 규칙을 명시했다.
- 기능 변경 Task 1~4는 모두 실패 테스트를 먼저 실행한다.
- 스타일과 문서 작업은 자동 검사와 실제 모바일 QA를 함께 둔다.
- 실제 API·인증 가드는 단계 B 계획으로 분리해 현재 계획에 섞지 않았다.
- View Transition·Scroll-driven·Popover·vgpu 적응형 품질은 단계 C 계획으로 분리했다.
