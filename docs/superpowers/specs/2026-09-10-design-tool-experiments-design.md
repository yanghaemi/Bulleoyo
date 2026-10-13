# Stage Ledger 디자인 도구 실험 설계

2026-09-10 후속 승인인 `2026-09-10-stage-motion-auth-polish-design.md`와 해당 구현 계획이 팀 선택·발권·정산 조명·AuthHeader·정규화 로고의 최신 계약이다. 이 문서는 최초 도구 도입 배경을 유지하며 해당 영역은 아래처럼 동기화했다. 구현/자동 검증/브라우저 실측은 `docs/frontend/DESIGN_TOOL_EXPERIMENTS.md`에서 구분한다.

## 1. 목적

Stage Ledger의 기존 정보 구조와 거래 신뢰성을 유지하면서 Motion, Anime.js, Bklit UI를 실제 화면에 제한적으로 적용해 체감 품질과 데이터 이해도를 높인다. 외부 AI 빌더와 디자인 도구는 현재 제품의 정본을 대체하지 않고, 대안 탐색과 시안 검증에만 사용한다.

이번 실험은 “많이 움직이는 화면”을 만드는 작업이 아니다. 각 도구가 맡는 책임을 분리하고, 기존 CSS·View Transition·vgpu보다 분명한 이점이 있는 곳에서만 사용한다.

## 2. 승인된 방향

사용자가 2026-09-10에 다음 방향을 승인했다.

- 실험적인 시도도 허용한다.
- 앞서 제안한 Motion, Bklit UI, Anime.js 활용안을 모두 진행한다.
- Claude나 다른 에이전트가 이어서 작업해도 판단과 검증 상태를 알 수 있도록 문서를 갱신한다.
- 기존 서비스 흐름과 데이터 의미는 시각 실험 때문에 바꾸지 않는다.

## 3. 검토한 접근

### 접근 A. 하나의 애니메이션 라이브러리로 통일

Motion만 사용하면 번들과 유지보수는 가장 단순하다. React 상태 기반 UI와 스프링, layout, exit 전환을 한 API로 다룰 수 있다. 하지만 사용자가 Anime.js와 Bklit UI의 실제 적합성까지 확인하고 싶어 하므로 도구 비교라는 목적을 충족하지 못한다.

### 접근 B. 모든 도구를 제품 화면 전반에 적용

Anime.js를 홈·캐러셀·완료 화면에, Bklit을 모든 수치 화면에, Motion을 전역 인터랙션에 적용하면 도구 특성은 빠르게 확인할 수 있다. 반면 애니메이션 책임이 겹치고, 금융성 숫자의 가독성이 떨어지며, 실패 시 원인을 분리하기 어렵다. 기존 결정 D-005의 신규 시각 런타임 최소화 원칙과도 맞지 않는다.

### 접근 C. 책임이 겹치지 않는 격리 실험 — 채택

- Motion: 실제 사용자 상태 변화와 접기·펼치기처럼 반복 가능한 인터랙션
- Bklit UI: 정산 금액과 발행량 구성처럼 관계를 읽는 데이터 시각화
- Anime.js: 예매 완료처럼 드물고 순차 연출이 의미 있는 단발성 장면
- Manus AI: 저장소 밖 대안 시안과 발표용 랜딩 탐색
- 디자인 스킬: 구현 전 대안 생성, 구현 후 모션·접근성 검수

각 실험은 독립적으로 제거할 수 있어야 하며, 실험이 실패해도 기존 표·텍스트·버튼 흐름이 남는다.

## 4. 아키텍처

기존 의존 방향을 유지한다.

```text
app → pages → features → shared
```

추가 책임은 다음과 같이 둔다.

```text
shared/motion      상태 전환 프리셋과 reduced-motion 정책
shared/charts      Bklit 기반 시각화 어댑터와 데이터 변환
features/ticket   예매 완료 Anime.js 연출과 정적 fallback
docs/experiments  Manus/Figma용 프롬프트, 비교 기준, 결과 기록
```

- feature가 Anime.js나 Bklit 내부 API를 여러 곳에서 직접 호출하지 않는다.
- Motion 전환 값은 작은 공통 프리셋으로 공유하되 모든 요소를 추상화하지 않는다.
- 차트는 기존 API 응답을 표시만 하며 정산 금액을 새로 계산하거나 정본으로 저장하지 않는다.
- 차트가 렌더링되지 않아도 동일한 수치를 기존 표와 카드에서 확인할 수 있다.
- 외부 AI 도구가 만든 코드는 자동으로 병합하지 않는다.

## 5. Motion 적용 범위

### 5.1 지갑 지급 설명

대상: `frontend/src/features/wallet/WalletScreen.tsx`

- `GRANT` 거래의 설명 영역에 `AnimatePresence`를 사용한다.
- 열기: opacity 0→1, transform `translateY(-4px)`→`translateY(0)`, 180ms ease-out.
- 닫기: opacity 1→0, transform `translateY(0)`→`translateY(-2px)`, 140ms ease-out.
- 높이는 내용 측정 또는 Motion layout으로 처리하되 다른 거래 행이 갑자기 점프하지 않게 한다.
- 버튼의 `aria-expanded`와 키보드 동작을 유지한다.

### 5.2 발행량 전문 항목

대상: `frontend/src/features/verify/SupplyDisclosure.tsx`

- 전문 항목 패널에 enter/exit 전환을 적용한다.
- 패널 전환은 200ms, 화살표 회전은 160ms로 한다.
- 닫히는 동안 링크가 포커스를 받지 않게 DOM과 포커스 상태를 일치시킨다.
- `prefers-reduced-motion: reduce`에서는 위치·높이 이동 없이 즉시 열고 닫는다.

### 5.3 모바일 정산 시뮬레이션

대상: `frontend/src/features/studio/SettlementRules.tsx`

- 모바일 접기 영역에 220ms layout/opacity 전환을 적용한다.
- 시뮬레이션 숫자는 애니메이션하지 않는다.
- PC의 항상 펼침 레이아웃에는 전환을 추가하지 않는다.

### 5.4 번들 경계

- `motion/react`는 앱 셸이 아니라 해당 lazy route 청크에서만 import한다.
- 단순 색상 hover와 press 피드백은 기존 CSS를 유지한다.
- `LazyMotion`이 실제 청크 절감에 도움이 되는지 production build로 비교하고, 효과가 없으면 사용하지 않는다.

## 6. Bklit UI 적용 범위

### 6.1 정산 대시보드 팀별 분배액

대상: `frontend/src/features/studio/SettlementDashboard.tsx`

- PC에서 팀별 `totalAmount`를 비교하는 가로 막대그래프를 팀별 분배액 표 위에 추가한다.
- 데이터는 `shares[]`와 `distributableAmount`만 사용한다.
- 기존 표와 모바일 패널은 삭제하거나 축약하지 않는다.
- 팀명, 정확한 금액, 전체 대비 비율을 제공한다.
- 색상은 팀을 구분하기 위한 장식이 아니라 막대 구분용이며, 텍스트 라벨 없이 색만으로 의미를 전달하지 않는다.
- 0원, 단일 팀, 긴 팀명, 매우 큰 금액을 처리한다.

### 6.2 코인 발행량 구성

대상: `frontend/src/features/admin/CoinSupplyPanel.tsx`

- `escrowTotal`과 `walletTotal`의 구성을 하나의 수평 누적 막대로 보여준다.
- `totalSupply` 및 불변식 판정은 기존 카드와 목록을 정본으로 유지한다.
- 합계 불일치가 있으면 차액을 별도 문구로 표시하고, 막대가 일치하는 것처럼 보이게 보정하지 않는다.
- 초기 진입 애니메이션은 기본 비활성화한다. 데이터 갱신 시 막대를 다시 재생하지 않는다.

### 6.3 도입 방식과 제한

- Bklit은 shadcn registry이므로 `components.json`과 생성 파일을 명시적으로 검토한다.
- 필요한 chart 하나와 그 직접 의존성만 가져온다.
- 생성된 컴포넌트는 팀 토큰, 다크 테마, `font-num`, focus-visible 규칙에 맞춘다.
- registry 설치 전후 `package.json`, lockfile, 생성 파일 목록을 문서에 기록한다.
- Studio 자체 코드나 유료 자산은 저장소에 복사하지 않는다.

## 7. Anime.js 적용 범위

대상: `frontend/src/features/ticket/IssuedTicketHero.tsx`, `BookingComplete.tsx`.

이전 800ms 완료 아이콘 연출을 승인된 **2200ms 발권 서사**로 대체한다. 실제 티켓 article/dl은 데이터 정본이고 성공 정보·CTA는 애니메이션 밖에서 즉시 사용할 수 있다.

1. 0~550ms: 슬롯에서 인쇄.
2. 550~850ms: 분리·2도 기울기.
3. 850~1150ms: viewport 아래까지 낙하, 낙하 중 opacity 1 유지.
4. 1150~1850ms: 대각선 재진입, 두 장의 낮은 불투명도 잔상.
5. 1850~2020ms: 정착.
6. 2020~2200ms: 테두리 빛·12px 별빛 한 번, 반복 없음.

`Replay ticket / 티켓 다시 보기`는 키보드로 접근 가능하며 기존 scope를 취소·정리한 뒤 재시작한다. 초기화/실행 실패는 정적 최종 티켓으로 돌아간다. reduced-motion에서는 잔상·반짝임·큰 이동을 제거한다.

제약:

- `prefers-reduced-motion: reduce`에서는 timeline을 만들지 않는다.
- 페이지를 뒤로 갔다 다시 열었을 때 DOM과 스타일이 정상 초기화되어야 한다.
- Anime.js scope를 컴포넌트 root에 제한하고 unmount 시 revert/cleanup한다.
- 기능 로직, 내비게이션, 예매 데이터에는 관여하지 않는다.
- production build에서 Anime.js가 예매 완료 route 청크 밖으로 올라오면 병합하지 않는다.

## 8. 브랜드 로고 모션

제공된 2.4초 키프레임 시트를 시각 기준으로 사용한다. 2026-09-10 전달된 원본 SVG의 왼쪽 `variant-a-merged-stem`을 정본으로 삼고, 애니메이션 wrapper와 timing을 유지한 채 각 path를 독립 파트로 배치한다.

### 8.1 전체 로딩 로고

신규 `BrandLoader`는 전체 페이지 또는 lazy route 로딩 경계에서 사용한다.

- 0.0~0.4초: 한글 워드마크와 마이크를 정지 상태로 표시한다.
- 0.4~0.7초: 마이크 헤드와 스탠드를 분리한다.
- 0.7~0.9초: 헤드를 오른쪽으로 이동시키며 회전을 시작한다.
- 0.9~1.4초: 헤드를 원형 `O`로 변형한다. 프로토타입에서는 SVG path morph 대신 원·마이크 glyph의 opacity/scale 교차와 회전으로 구현해 브라우저 간 안정성을 우선한다.
- 1.4~1.7초: `불러YO` 상태를 정렬한다.
- 1.7~2.2초: 한글 접두부 `불러`와 영문 접두부 `BULLEO`만 500ms 교차 전환한다. 독립된 `Y`·`O`는 계속 보인다.
- 2.2~2.4초: 영문 워드마크를 정지 상태로 둔다.

로딩이 2.4초를 넘기면 전체 변형을 반복하지 않는다. 최종 워드마크 옆 마이크/O 마크만 opacity 0.72~1, scale 0.98~1 범위로 1.4초 주기의 잔잔한 idle 상태를 반복한다. 실제 데이터가 먼저 준비되면 애니메이션 종료를 기다리지 않고 140ms 이내 opacity로 빠져나간다. 브랜드 연출 때문에 로딩 시간을 인위적으로 늘리지 않는다.

적용 경계:

- `RouterProvider`의 lazy route fallback처럼 화면 전체가 아직 준비되지 않은 경우에만 큰 로고를 사용한다.
- 버튼 제출, 결제 서명, 작은 패널 새로고침에는 기존 `Spinner`를 유지한다. 작은 영역에서 2.4초 워드마크를 쓰면 공간과 의미가 맞지 않는다.
- 로딩 컨테이너는 `role="status"`, `aria-live="polite"`, 화면 낭독기용 “불러오는 중” 문구를 제공한다. SVG 자체는 장식으로 처리한다.

### 8.2 헤더 로고 반응

2026-09-10 사용자 변경 결정에 따라 헤더는 브라우저 **문서 최초 진입**에 로더와 같은 2.4초 전체 시퀀스를 한 번 실행한다. `sessionStorage['bulleoyo:header-intro-document']`에 `String(performance.timeOrigin)`을 저장하며 boolean이 아니다. SPA 재마운트는 완성형을 유지하고 새로고침은 새 문서이므로 재생한다. 로고 클릭은 재생을 시작하며 홈 이동을 지연하지 않는다.

1. 0.0~0.4초에는 왼쪽 확정 로고를 그대로 보인다.
2. 0.4~1.4초에 마이크 스탠드를 `Y`로, 헤드를 이동·회전시켜 `O`로 바꾼다.
3. 1.4~1.7초에는 `불러YO`를 유지한다.
4. 1.7~2.2초에는 `YO`를 유지한 채 `불러`만 `BULLEO`로 교차 전환하고, 2.4초까지 최종형을 유지한다.

- 전체 재생 뒤에는 영문 완성형을 유지하고, hover/focus-visible에는 `Y`·`O`만 650ms 반응한다.
- 터치 기기에서는 hover 모션을 만들지 않는다. 클릭/탭은 전체 로고 재생과 홈 이동을 함께 시작한다.
- 키보드 focus에는 같은 650ms 반응을 한 번 제공하지만 내비게이션을 지연시키지 않는다.
- `prefers-reduced-motion: reduce`에서는 header와 loader 모두 path 기반 최종 영문 워드마크를 정적으로 표시한다.
- 헤더 모바일/PC 모두 같은 `AnimatedBrandLogo`를 사용하며 높이만 기존 22px/26px를 유지한다.

### 8.3 Anime.js와 CSS의 경계

- 전체 로딩의 순차 choreography는 Anime.js scope/timeline을 사용한다.
- 헤더의 최초 2.4초 자동 재생과 이후 650ms 반응은 CSS keyframes로 구현한다. hover를 위해 Anime.js 청크를 앱 셸에 올리지 않는다.
- 로고 SVG의 마이크/O 그룹에는 안정적인 `data-part` 이름을 부여하고 외부에서 DOM selector 문자열을 중복하지 않는다.
- 언마운트 시 Anime.js scope를 revert해 StrictMode 이중 effect와 route 전환 후 잔여 inline style을 막는다.

### 8.4 자산 교체 규칙

- 현재 참고 PNG를 런타임 이미지로 잘라 쓰지 않는다. 여러 해상도와 테마에서 선명해야 하므로 SVG 구조로 재작성한다.
- 최종 로고 벡터가 전달되면 글자·마이크 path만 교체하고 component props, `data-part`, timeline 계약은 유지한다.
- 런타임 영문은 SVG path로 고정한다. `pnpm gen:brand`가 Montserrat outline을 생성하고 `BULLEO`·`Y`·`O`의 cap-height·optical baseline을 한 좌표계에서 맞춘다. 런타임 `<text>`나 font 요청으로 레이아웃을 결정하지 않는다.

## 9. 외부 디자인 도구 실험

### 9.1 Manus AI

현재 환경에는 Manus 계정이나 저장소 연결 도구가 없다. 따라서 다음 산출물을 저장소에 작성한다.

- 비밀정보와 실제 API 주소를 제거한 랜딩 페이지 생성 프롬프트
- 모바일 공연 상세 대안 생성 프롬프트
- 결과 비교표: 브랜드 일치, 정보 정확성, 접근성, 반응형, 코드 이식 비용
- 외부 결과를 정본 코드로 승격하는 수동 검수 절차

Manus에는 `.env`, 지갑 개인키, GitLab 토큰, 실사용자 데이터, 내부 관리자 계정을 제공하지 않는다.

### 9.2 프로토타입과 디자인 스킬

- `prototype`: 예매 완료와 정산 차트 대안을 비교하는 격리된 개발 전용 화면에 사용한다.
- `apple-design`: 모바일 접기·시트·드래그의 반응성과 reduced-motion을 검수한다.
- `emil-design-eng`: duration, easing, press 피드백, hover 대상, transform-origin을 검수한다.
- `review-animations`: 구현이 끝난 뒤 모든 새 모션을 비판적으로 검수한다.
- Figma library 생성은 대상 Figma 파일과 연결 권한이 제공될 때 별도 작업으로 수행한다. 현재 코드 변경의 완료 조건에는 포함하지 않는다.

## 10. 개발 전용 실험 화면

도구 간 비교를 위해 개발 빌드에서만 접근 가능한 `Design Lab` 경로를 둔다.

- 경로: `/__lab/design-tools`
- 프로덕션 빌드에서는 라우트와 진입 링크를 제공하지 않는다.
- 실제 서비스 데이터를 요청하지 않고 고정 fixture를 사용한다.
- 정규화 header logo, AuthHeader, TeamChoiceStage, IssuedTicketHero, SettlementLightStage, 확인 모달, Motion 펼침 패널, loader, Bklit 차트의 대표 상태를 한곳에서 비교한다. 티켓은 접근 가능한 replay 버튼, 조명은 정상·경계·invalid 선택기를 제공한다.
- 각 실험은 정상, 빈 값, 긴 텍스트, reduced-motion 상태를 확인할 수 있어야 한다.
- 실험 화면이 실제 feature를 복제하지 않도록 production component와 작은 fixture만 조합한다.

## 11. 접근성 및 모션 원칙

- 정보의 존재와 의미를 애니메이션에 의존하지 않는다.
- `prefers-reduced-motion`에서는 이동·크기 변화·stagger를 제거하고 필요한 경우 짧은 opacity 전환만 허용한다.
- 데이터 차트는 키보드 또는 인접 표로 같은 정보를 읽을 수 있어야 한다.
- 애니메이션 중에도 포커스 링, 버튼 hit area 44px, `aria-expanded`, 제목 구조를 유지한다.
- 거래·정산 숫자는 count-up, rolling digit, 반복 pulse를 새로 추가하지 않는다.
- disclosure는 기존 짧은 전환을 유지한다. 선택·조명 spring은 400ms/bounce 0, 발권은 최대 2200ms, 브랜드 서사는 2400ms로 후속 승인 범위를 적용한다. reduced-motion은 정적 최종 상태 또는 최대 180ms cross-fade다.

## 12. 오류 및 fallback

- Motion 로드 실패: 정적 DOM과 기존 토글 동작을 유지한다.
- Anime.js 초기화 실패: 모든 완료 정보와 CTA를 즉시 최종 상태로 표시한다.
- 로고 모션 초기화 실패: 현재 `BrandLogo` 또는 새 SVG의 최종 정적 프레임을 표시한다.
- Bklit 렌더 실패 또는 ResizeObserver 미지원: 차트를 감추고 기존 표·카드를 표시한다.
- 차트 데이터가 비었거나 유효하지 않음: 그래프를 추정하지 않고 기존 빈 상태 문구를 사용한다.
- 개발 전용 Design Lab이 실수로 production에 포함되면 build test를 실패시킨다.

## 13. 테스트 전략

모든 동작은 실패하는 테스트를 먼저 작성한다.

- Motion: 토글 enter/exit, `aria-expanded`, 닫힌 링크 포커스, reduced-motion 정적 경로
- Anime.js: scope 생성·정리, 한 번 실행, reduced-motion 미실행, 내비게이션 콜백 보존
- 브랜드 로고: 2.4초 강제 대기 없음, header pointer-enter/focus 동작, 터치·reduced-motion 정적 경로, StrictMode cleanup
- Bklit: 데이터 변환, 0원·단일 팀·합계 불일치, 표 fallback, 접근 가능한 요약
- Design Lab: development에서만 라우트 등록, production에서 미등록
- 회귀: 기존 wallet, settlement, supply, booking complete 테스트
- 빌드: typecheck, lint, 전체 Vitest, production build, route chunk 목록과 크기 비교
- 수동 QA: 360×800, 390×844, 768px, 1440px, 키보드 전용, reduced-motion

## 14. 성능 예산과 승격 조건

- 초기 gzip 번들 500KB 이하 목표를 유지한다.
- Anime.js와 Bklit은 사용하는 route chunk 밖에 포함되지 않아야 한다.
- 데이터 차트가 없는 기존 화면 대비 LCP를 200ms 이상 악화시키면 기본 비활성 또는 제거한다.
- 장시간 태스크 증가, 반복 layout thrashing, 콘솔 오류가 없어야 한다.
- 360px에서 페이지 전체 가로 스크롤이 없어야 한다.
- 기존 텍스트·표만으로 모든 금액과 상태를 확인할 수 있어야 한다.

도구별 승격 판단:

- Motion: 세 토글 화면의 품질이 개선되고 테스트·번들 조건을 통과하면 유지한다.
- Bklit: 표보다 관계 파악이 빨라지고 모바일·접근성 fallback을 만족하면 해당 두 화면에만 유지한다.
- Anime.js: Motion/CSS 대비 완료 경험의 차이가 명확하고 route 격리가 확인될 때만 유지한다. 차이가 작으면 제거한다.
- Manus: 결과물을 코드 정본으로 사용하지 않는다. 채택할 아이디어만 팀 토큰과 컴포넌트 규칙으로 다시 구현한다.

## 15. 문서와 인계

구현 단계마다 다음 문서를 갱신한다.

- `docs/frontend/STAGE_LEDGER_STATUS.md`: 현재 구현 단계, 검증 결과, 다음 작업
- `docs/frontend/STAGE_LEDGER_DECISIONS.md`: 도구 유지·제거 결정과 근거
- `docs/frontend/DESIGN_TOOL_EXPERIMENTS.md`: 설치 파일, 실험 방법, 수동 QA 결과, 롤백
- `docs/experiments/manus-prompts.md`: 외부 AI 빌더용 안전한 프롬프트와 평가 기준
- `CLAUDE.md`: 위 문서 진입 링크

기록에는 제안, 구현, 자동 검증, 수동 검증을 구분한다. 브라우저에서 직접 확인하지 않은 항목을 시각 검증 완료로 표시하지 않는다.

참고 근거: 사용자 제공 5초 WebM은 프레임 샘플링했다. Apple iPad Air 소스 미디어의 계약·구조는 조사했지만 미디어 접근 불가로 15개 원본 모두를 실제 재생하지 못했다. 구조적 모션 원칙만 재현했고 Apple 영상·자산을 복사하지 않았다. 최종 QA의 Windows 세로 스크롤바 차이와 Motion 개발용 reduced-motion 경고는 실험 문서에 그대로 기록한다.

## 16. 범위 제외

- 백엔드와 스마트 컨트랙트 변경
- 정산 공식 또는 API 응답 의미 변경
- 기존 View Transition, vgpu 무대 조명, 캐러셀 물리 로직 교체
- 모든 버튼과 카드에 일괄 Motion 적용
- 실사용자 데이터를 외부 AI 서비스로 전송
- 대상 파일과 권한이 없는 상태에서 Figma 원본 수정

## 17. 완료 기준

- Motion 세 전환과 Anime.js 완료 timeline이 reduced-motion을 포함해 동작한다.
- 전체 로딩 로고와 헤더 로고는 같은 2.4초 서사를 한 번만 재생하며 내비게이션을 지연하지 않는다.
- Bklit 기반 두 시각화가 기존 숫자·표의 보조 표현으로 동작한다.
- 개발 전용 Design Lab에서 대표 상태를 비교할 수 있고 production에는 진입점이 없다.
- 전체 테스트, typecheck, lint, production build가 통과한다.
- 신규 route chunk와 번들 영향이 문서에 기록된다.
- Claude가 `CLAUDE.md`와 상태 문서만 읽고 다음 작업과 롤백 방법을 알 수 있다.
