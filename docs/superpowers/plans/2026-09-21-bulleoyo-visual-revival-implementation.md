# 불러요 시각 연출 복원 구현 계획

> **Jira:** `S15P21B204-163`
> **Spec:** `docs/superpowers/specs/2026-09-21-bulleoyo-visual-revival-design.md`

## 목표

운영 홈을 변경하지 않고 `/__lab/design-refresh`의 공연 탐색 화면에서 동일한 대표 공연 fixture로 세 가지 히어로 방향을 전환 비교한다. 구현은 기존 라이트 UI와 데이터 흐름을 보존하며, 기존 WebGPU/CSS 효과를 필요한 위치에만 재사용한다.

## 전역 제약

- 기존 미커밋 변경을 되돌리거나 포맷하지 않는다.
- `HomePage`의 API·쿼리·거래 흐름은 변경하지 않는다.
- 새 패키지를 설치하지 않는다.
- 자동 재생을 추가하지 않는다.
- 모든 새 동작은 테스트를 먼저 작성하고 실패를 확인한 뒤 구현한다.
- 커밋 메시지 본문 마지막 줄에 `S15P21B204-163`을 넣는다.

## Task 1 — lab 전용 히어로 계약과 전환 UI

**Files**

- Create: `frontend/src/features/performance/VisualRevivalPreview.tsx`
- Modify: `frontend/src/pages/DesignRefreshPage.tsx`
- Test: `frontend/src/pages/DesignRefreshPage.test.tsx`

**RED**

1. 공연 탐색 미리보기에서 `Light Stage`, `Concert Editorial`, `Stage Window` 세 방향을 라디오 그룹으로 찾을 수 있는 테스트를 추가한다.
2. 방향을 바꿔도 같은 공연명·날짜·상세 링크가 유지되는지 검증한다.
3. 이전·다음 버튼과 현재 위치 텍스트가 있고, 이동 후 대표 공연이 바뀌는지 검증한다.
4. targeted Vitest를 실행해 컴포넌트 부재로 실패하는지 확인한다.

**GREEN**

1. `VisualRevivalPreview`에 방향 상태와 대표 공연 인덱스 상태를 둔다.
2. 세 방향은 동일한 `CarouselItem[]`을 사용하고 표현용 클래스와 설명만 전환한다.
3. 자동 재생 없이 명시적 이전·다음 버튼과 현재 위치를 제공한다.
4. `DesignRefreshPage`의 `home` view에만 컴포넌트를 렌더한다.
5. targeted Vitest를 통과시킨다.

## Task 2 — 세 시안 시각 구조와 반응형

**Files**

- Modify: `frontend/src/features/performance/VisualRevivalPreview.tsx`
- Modify: `frontend/src/styles/design-refresh.css`
- Test: `frontend/src/pages/DesignRefreshPage.test.tsx`

**RED**

1. 활성 방향과 활성 공연에 의미 있는 `aria-pressed`/`aria-current`가 붙는 테스트를 추가한다.
2. 이미지가 없어도 제목과 공연 정보가 남는 폴백 테스트를 추가한다.
3. 테스트를 실행해 새 접근성 계약이 아직 없어 실패하는지 확인한다.

**GREEN**

1. Light Stage는 밝은 무대 표면·방향성 하이라이트·포스터 접지 그림자로 구성한다.
2. Concert Editorial은 비대칭 타이포·포스터 2열 구성으로 만든다.
3. Stage Window는 라이트 페이지 안의 국소 다크 창으로 제한한다.
4. 390px에서는 단일 열, 1440px에서는 포스터와 정보를 분리한다.
5. 원형 블러를 독립 장식으로 쓰지 않고 포스터 접지와 광원 방향을 일치시킨다.
6. targeted Vitest를 통과시킨다.

## Task 3 — 모션·GPU 폴백·검증

**Files**

- Modify: `frontend/src/features/performance/VisualRevivalPreview.tsx`
- Modify: `frontend/src/styles/design-refresh.css`
- Test: `frontend/src/pages/DesignRefreshPage.test.tsx`

**RED**

1. `prefers-reduced-motion`에서 정적 상태 표식이 적용되는 테스트를 추가한다.
2. GPU를 사용할 수 없어도 콘텐츠와 CTA가 존재하는 테스트를 추가한다.
3. 테스트가 필요한 계약의 부재로 실패하는지 확인한다.

**GREEN**

1. 전환은 180–240ms 범위의 짧은 교차 전환만 사용한다.
2. Light Stage의 점등은 최초 1회에 한정하고, reduced-motion에서는 제거한다.
3. GPU 효과는 보조층으로만 두고 CSS 표면·그림자만으로 동일한 정보 구조를 유지한다.
4. targeted Vitest를 통과시킨다.

## Task 4 — 전체 검증과 기록

1. `DesignRefreshPage` targeted Vitest를 실행한다.
2. 관련 performance 테스트를 실행한다.
3. 프론트 typecheck, lint, build를 실행한다.
4. 390px와 1440px에서 세 방향을 브라우저로 확인한다.
5. 공개 미리보기에서 GPU 지원 여부와 무관하게 텍스트·CTA가 보이는지 확인한다.
6. 검증 결과와 남은 미검증 항목을 작업 ledger에 기록한다.

## 완료 계약

- `/__lab/design-refresh`의 공연 탐색 화면에서 세 방향을 즉시 비교할 수 있다.
- 동일 fixture와 동일 언어에서 방향만 바뀐다.
- 키보드와 포인터로 모든 전환을 수행할 수 있다.
- 390px/1440px에서 가로 넘침과 정보 겹침이 없다.
- reduced-motion 및 GPU 미지원 환경에서도 핵심 정보와 CTA가 동일하다.
- 운영 홈과 API 흐름에는 변화가 없다.

## Task 5 — 승인 시안 운영 홈 승격

후속 사용자 승인으로 기존 완료 계약의 “운영 홈에는 변화가 없다”는 비교 단계까지만
적용한다. 승인된 공통 편집형 무대를 운영 홈에 승격하되 API 흐름은 변경하지 않는다.

1. `HomeScreen`이 `carousel`을 받은 경우 제품용 대표 공연 무대를 렌더하는 테스트를 먼저 추가한다.
2. 테스트가 무대 부재로 실패하는지 확인한다.
3. 실험 컴포넌트를 제품용 `FeaturedShowStage`로 전환하고 `HomeScreen`에 직접 연결한다.
4. Jira·LAB·시안명·설명 문구를 제거하고 접근성 이름만 유지한다.
5. 빈 필터 결과에는 대표 공연을 노출하지 않는 기존 계약을 보존한다.
6. 관련 테스트, 전체 테스트, 타입 검사, 린트, 빌드와 390px·1440px 화면을 검증한다.
