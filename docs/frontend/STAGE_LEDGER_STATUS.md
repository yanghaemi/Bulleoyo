# Stage Ledger 프론트엔드 진행 상태

- 마지막 갱신: 2026-09-14
- 작업 브랜치: `codex/stage-ledger-foundation`
- 기준 커밋: `a9ba728` (`fix/fe/document-shell`에서 분기)
- 설계: `docs/superpowers/specs/2026-09-10-stage-ledger-frontend-design.md`
- 실행 계획: `docs/superpowers/plans/2026-09-10-stage-ledger-foundation-plan.md`
- 디자인 실험 운영: `docs/frontend/DESIGN_TOOL_EXPERIMENTS.md`
- 무대 모션 설계: `docs/superpowers/specs/2026-09-10-stage-motion-auth-polish-design.md`
- 무대 모션 계획: `docs/superpowers/plans/2026-09-10-stage-motion-auth-polish-plan.md`

## 현재 결론

단계 A, 디자인 도구 실험, 승인된 무대 모션·로그인 헤더 보완을 구현했다. Motion은 팀 선택·조명·disclosure, CSS는 header·loader와 현재 A-06 실제 티켓 연출, Bklit은 기존 숫자·표의 보조 차트에 쓴다. 자동 검증과 브라우저 검증 결과는 아래에서 구분한다. 이는 **데모 fixture 기반 프론트엔드 작업**이며 실제 API·인증·지갑·역할 가드 연결 완료를 뜻하지 않는다. 현재 5173 미리보기의 소셜 로그인은 미설정 상태로 비활성이다.

## 단계 A 완료 내역

| 작업                                 | 상태 | 커밋                  | 검증                                                    |
| ------------------------------------ | ---- | --------------------- | ------------------------------------------------------- |
| 공연 ID 기준 예매 데모 데이터 단일화 | 완료 | `40cce4e`             | `demoBookingFlow.test.ts` 3개 통과                      |
| 전역 무대 효과를 탐색 라우트로 제한  | 완료 | `71b69e2`             | `stageRoutes.test.ts` 8개 통과                          |
| 360·390px 페이지 가로 넘침 제거      | 완료 | `24228c0`             | 홈·지갑·공급 검증 실측에서 문서 폭과 화면 폭 일치       |
| 화면 라우트 지연 로딩                | 완료 | `e1c13de`             | 화면별 청크 생성, 홈 초기 로드에 Admin·Studio 청크 없음 |
| 정본·인계 문서 동기화                | 완료 | 이 문서가 포함된 커밋 | 토큰 v2·README·CLAUDE 진입점·계획 체크 반영             |

## 디자인 도구 실험 완료 내역

| 작업                                      | 상태 | 커밋                                        | 검증                                                       |
| ----------------------------------------- | ---- | ------------------------------------------- | ---------------------------------------------------------- |
| Motion disclosure 공통화·3개 화면 적용    | 완료 | `df5173c`, `351cc32`                        | 토글 접근성·unmount 테스트 통과                            |
| 왼쪽 A안 확정 SVG 로고·헤더/라우트 로더   | 완료 | `d0a1299`, `e356c89`, 이 문서가 포함된 커밋 | 헤더·loader·reduced-motion·matchMedia 부재 테스트 통과     |
| A-06 Anime.js 완료 연출(대체된 이력)      | 완료 | `c4ea716`                                   | 당시 scope 생성·cleanup·reduced-motion 생략 테스트 통과    |
| Bklit 데이터 어댑터·P-08/M-03 보조 차트   | 완료 | `f539b64`, `a049204`, `8b76181`             | 수치 보존·불일치·좁은 컨테이너 회귀 테스트 통과            |
| 개발 전용 Design Tools Lab·외부 실험 문서 | 완료 | `7149647`                                   | 개발 라우트 존재·프로덕션 라우트 부재 확인                 |
| 공통 확인 모달 이중 언어 버튼 넘침 수정   | 완료 | 이 문서가 포함된 커밋                       | 400px PC 모달에서 두 버튼 폭 352px, 좌우 경계 내 배치 실측 |

## 무대 모션·로그인 보완 적용 내역

| 항목                           | implemented           | automated verification                                   |
| ------------------------------ | --------------------- | -------------------------------------------------------- |
| 공유 spring·타이밍             | `cd438ac`             | 3개 테스트                                               |
| 정규화 path 로고               | `cdd5a56`             | 13개: 문서 최초 재생·SPA 유지·새로고침·클릭·최종 path    |
| AuthHeader·pending BrandLoader | `f9a2337`             | AuthHeader 3개 + LoginScreen 4개                         |
| TeamChoiceStage                | `72f076f`             | 6개: radio·빠른 선택·긴 이름·reduced-motion              |
| 2.2초 IssuedTicketHero         | `f49f7ab`             | 8개: 실제 timeline·replay·cleanup·실패·즉시 CTA          |
| SettlementLightStage           | `d82f2e5`             | 조명 8개 + 규칙 화면 6개: 경계·재목표·유효값 유지        |
| Lab·확인 모달                  | 이 문서가 포함된 커밋 | 모달 3개: 버튼 배치·Tab 순환·opener 복귀·exit inert·busy |

### 최종 코드 head 자동 검증 — 2026-09-10

| 코드 head                        | 기록된 전체 검증        | 영향 집중                    |
| -------------------------------- | ----------------------- | ---------------------------- |
| `6a5e954` 홈 링크 replay         | 31파일 / 164테스트 통과 | 5파일 / 36테스트 통과        |
| `8ccf123` 팀 포스터 행→무대 연결 | 31파일 / 165테스트 통과 | 팀·Lab 2파일 / 11테스트 통과 |

두 수정 모두 typecheck·lint·변경 소스 Prettier 통과. CUA 미가용으로 자동 검증만 수행했고 브라우저 재검증은 하지 못했다. 아래 40개 조합은 수정 전 `9f10753`의 근거다.

### 리뷰 후속 수정 — Lab 로고 replay 버튼 `a8ec518`

- Lab 버튼 자체·여백·Enter/Space 활성화가 자식 SVG의 클릭 핸들러에 닿지 않는 결함을 수정했다. 선택적 `replayKey`로 버튼이 재생을 요청하고 제어된 SVG의 중복 클릭 핸들러는 사용하지 않는다. 기존 자동 재생·SPA·홈 링크 계약은 유지한다.
- RED: 버튼 자체 클릭이 `complete`에 머무르는 실패와 새 신호 계약 실패 확인. GREEN: 실제 Lab 버튼/자식 클릭·Enter·Space 모두 정확히 한 번 `complete→reset→intro→complete`.
- 당시 자동 검증: 영향 집중 **4파일/25테스트**, 전체 **30파일/153테스트**, typecheck·lint·Prettier·build 통과. 진입 **391.44kB / gzip127.44kB**, Anime.js **43.17 / 17.26kB**. production Lab 제외 유지.
- 후속 브라우저 재확인은 CUA의 사용 가능 브라우저가 없어 수행하지 못했다. Enter/Space는 real-timer user-event로 실제 버튼 이벤트를 검증했다. 아래 최초 브라우저 QA는 `9f10753`의 근거로 보존한다.

### 헤더 로고 단일 객체 양방향 안무 — 현재 구현, 2026-09-11

- 문서 최초에는 2.40초 `불러요 → BULLEOYO`를 자동 재생한다. 그다음 클릭은 3.00초 `BULLEOYO → 불러요`, 다음 클릭은 다시 정방향으로 순환한다. 같은 문서의 안정 상태는 `bulleoyo:header-form`에 보존한다.
- 마이크와 마지막 O는 `morph-object` 하나다. 외곽 원의 X/Y 비율, mask aperture, 흰 grill이 함께 변하므로 두 완성 객체를 교차 표시하지 않는다.
- 정방향은 O의 굴림과 Y 변형을 겹치지 않는다. O가 최종 위치에 도착하는 58.333%까지 ㅛ 지지대를 유지하고, 이후 70.833%까지 Y로 바꾼 다음 영문 접두부 전환을 마친다.
- 복귀는 reverse가 아니다. O가 우측에서 2~3회 튀고 퇴장한 뒤 같은 객체가 왼쪽에서 마이크로 재등장해 글자 위를 바운스하고 ㅛ에 착지한다. 퇴장 구간은 header SVG에서 clip되어 옆 검색·내비게이션을 덮지 않는다.
- 자동 검증: `AnimatedBrandLogo` 16개, `BrandHomeReplay` 11개, `DesignToolsLabPage` 5개 집중 테스트와 최신 전체 **36파일·192테스트** 통과. typecheck·lint·build 종료 코드 0, Vite 1,166모듈 변환. AppHeader JS **5.68kB / gzip 2.04kB**. Chrome 1440px에서 정방향 1.20초에는 O가 구르는 동안 ㅛ/Y opacity가 `1/0`, O 안착 직후인 1.45초부터 `0.833/0.167`로 Y 전환이 시작되는 것을 실측했다.

### 최초 Task 7 자동 검증 — `9f10753`, 2026-09-10

- `pnpm test`: **29개 파일, 148개 테스트 통과**, 종료 코드 0. unhandled rejection·act 경고·콘솔 오류 없음.
- 계획의 `pnpm test -- <7개 파일>`은 pnpm wrapper가 `--`를 그대로 넘겨 전체 148개를 실행한다. 실제 집중 실행은 `pnpm exec vitest run <7개 파일>`: **7개 파일, 47개 테스트 통과**.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`: 모두 종료 코드 0, 최종 진단·빌드 경고 없음.
- 진입 JS: **391.29 kB / gzip 127.37 kB**. Anime.js 동적 청크: **43.17 / 17.26 kB**.
- Motion 사용 route: TeamChoice **5.18 / 2.27**, SettlementRules **17.66 / 6.17**, Wallet **11.20 / 4.32**, SupplyDisclosure **14.96 / 5.28 kB**(원본 / gzip).
- BookingComplete **11.48 / 3.93 kB**, Login **3.73 / 1.78 kB**. 상세 청크와 정적 import 경계는 실험 문서 참조.
- 기존 `devRoutes.test.ts`와 production gate는 변경하지 않았다. `dist`에 Lab route·컴포넌트·fixture 문자열 없음.

### 최초 Task 7 브라우저 검증 — browser verified, `9f10753`

- 안정 미리보기: `http://127.0.0.1:5174`. `/login`, `/performances/12/order/choice`, `/orders/12/complete`, `/studio/performances/12/rules`, `/__lab/design-tools`.
- 360×800·390×844·768×1024·1440×1000, light/dark 총 40개 조합에서 수평 넘침 없음, console.error 0·일반 모션 경고 0.
- Windows 고정 세로 스크롤바 때문에 login/rules/Lab의 `scrollWidth === innerWidth`는 **false**다(각 폭−15px). 다섯 경로 모두 `scrollWidth === clientWidth`; 팀 선택/완료는 `innerWidth`까지 동일했다. 값을 보정하거나 true로 기록하지 않는다.
- 네 폭 모두 실제 키보드 이동 확인: 팀 radio Space/Enter, 발권 replay→두 CTA, 정산 두 bp 입력, 모달 확인↔유지 순환·Escape→열기 버튼 복귀. 로그인은 로고→EN→한국어; 미설정 소셜 버튼은 비활성이므로 Tab에서 제외된다.
- 조명: 네 폭×두 테마에서 0/100·35/65·50/50·100/0 및 빈 값·범위 초과·합계 오류·서버 오류를 72회 전환해 유효 비율 유지와 경계 내 배치 확인. 최초 invalid는 `—`와 안내만 표시.
- reduced-motion: OS 설정 변경이 아닌 임시 `matchMedia` fixture로 다섯 실제 route를 네 폭에서 확인했다. 로고 최종 영문 path opacity 1, 티켓 `reduced`·transform none, 조명 정적 최종 비율. console.error는 0이나 Motion의 개발용 “Reduced Motion enabled” 경고가 해당 12개 문서에서 각 1회 발생했다. 숨기지 않았으며 자동 테스트 경고와 구분한다.
- Apple 근거: 제공된 5초 WebM은 프레임 샘플링했다. iPad Air 원본 미디어의 계약·구조를 조사했지만 미디어 접근 불가로 15개 원본 모두를 실제 재생하지 못했다. 구조적 모션 원칙만 재현했고 Apple 영상·자산은 복사하지 않았다.

### A-06 대형 티켓 시네마틱 — 대체된 구현 이력, `760f223` · `219a455` · `6becd81`, 2026-09-11

> 아래 5.20초 영상→DOM 기록은 당시 검증 이력이며 현재 런타임 계약이 아니다. 현재 계약은 이 문서의 「A-06 print-only 티켓 — 현재 구현」과 D-019를 따른다.

- 실제 데이터는 `ConcertCollectorTicket`의 접근 가능한 DOM 한 벌만 소유한다. 영상은 데이터 없는 장식 셸이며 `aria-hidden`으로 분리했다. 예매 완료 문구와 `내 티켓 보기`·`홈으로` CTA는 첫 렌더부터 사용할 수 있다.
- 확정 타임라인은 **5.20초 / 156프레임 / 30fps**다. 0~~0.70초 가로 인쇄, 0.70~~1.20초 낙하, 1.20~~1.50초 빈 호흡, 1.50~~1.90초 세로 재등장, 1.90~~4.80초 느린 Y축 1회전, 4.80~~5.20초 DOM 교차 전환·단발 광택으로 끝난다.
- 재등장 시작 자세는 가로 티켓을 `rotateZ(-60deg)`로 세워 **수직선에서 약 30도 오른쪽으로 기울어진 긴 축**을 만들고, `rotateY(-15deg)`·`rotateX(10deg)`로 앞면과 깊이를 함께 보인다. 공간 이동·확대는 3.00초에 먼저 끝나고, 회전·가로 안착은 4.80초까지 천천히 이어진다.
- 자산은 1600×720 무음 영상이며 WebM VP9 **155,430B**, MP4 H.264 **293,505B**, poster WebP **10,064B**다. 런타임 URL은 `/media/ticket/ticket-reveal.{webm,mp4}`와 `/media/ticket/ticket-reveal-poster.webp`다.
- 데스크톱은 **1024px 이상**에서 영상→DOM 전환을 재생한다. 1024px 미만은 정보 가독성과 수평 넘침 방지를 위해 반응형 DOM 티켓을 즉시 표시하며 replay 버튼을 숨긴다. 실제 티켓과 영상의 최종 외곽은 `1280 / 422`, stage는 `1600 / 720`으로 맞췄다.
- 실제 브라우저에서 1.70·1.90·2.30·4.00·4.75·5.00초 프레임을 확인했다. 360·390·768·1024·1440px에서 수평 넘침이 없고, 768px은 정적 세로 재배치, 1024px 이상은 영상과 실제 티켓의 위치·크기 전환이 일치한다.
- autoplay 거부, `error`, `stalled`, 시작 제한시간 초과, reduced-motion은 완성 DOM 티켓으로 복구한다. 영상 재생 여부는 결제 성공이나 CTA 활성화와 무관하다.
- 2026-09-11 최종 자동 게이트: `pnpm test` **35개 파일·192개 테스트**, `pnpm typecheck`, `pnpm lint`, `pnpm build` 모두 종료 코드 0. Vite는 1,166개 모듈을 변환했고 A-06 청크는 CSS **6.61kB / gzip 1.90kB**, JS **7.08kB / gzip 2.81kB**다.

### A-06 실제 데이터 DOM 회전 전환 — 대체된 구현 이력, 2026-09-11

> 아래 3D 회전·Stage Halo 기록은 D-019에 의해 대체됐다. 과거 구현과 측정 근거를 보존하기 위한 항목이며 현재 동작을 설명하지 않는다.

- 위 영상·DOM 교차 전환은 이 변경으로 대체됐다. `TicketRevealStage`는 `<video>`를 렌더하지 않고, 예매 응답으로 만든 `ConcertCollectorTicket` **그 자체**를 인쇄·낙하·재등장·3D 회전·안착시킨다. 따라서 연출 중에도 공연명·포스터·예매번호·결제 정보가 임시 이미지가 아니라 실제 화면 데이터다.
- 앞면이 카메라 반대편을 향할 때만 `aria-hidden` 브랜드 뒷면을 보여 준다. 접근성 트리에는 실제 티켓 `article` 한 벌만 남고, CTA는 처음부터 활성 상태다.
- 5.20초 계약과 재등장 자세 `rotateZ(-60deg) rotateY(-15deg) rotateX(10deg)`는 유지했다. 재등장부터 최종 안착까지 Y/Z/X 회전, 위치, 깊이, 크기를 모두 같은 선형 진행률로 보간한다. 회전 중 크기는 약 `0.67 → 0.725 → 0.853 → 0.963 → 1`로 커지며, 중간 ease-out 때문에 멈췄다 다시 도는 느낌을 제거했다.
- 비어 있던 무대에는 `Stage Halo`를 추가했다. 재등장 구간부터 저채도 인디고·핑크 스포트라이트와 바닥 타원 접지광이 열리고, 안착 직전에 얇은 링이 한 번 퍼진다. 모두 의미 없는 `aria-hidden` 장식이며 transform·opacity만 애니메이션한다. 1024px 미만과 reduced-motion에서는 렌더 장식을 숨긴다.
- 최종 실물 티켓은 `Collector Foil A+`로 갱신했다. 데스크톱은 실측 `13 / 5` 외곽, 약 27% 포스터, 큰 공연명, 포일 테두리, 절취 노치와 장식용 정품 실을 사용한다. 1024px 미만은 포스터-본문-스텁 세로 패스로 재배치하며 좌석·게이트·QR처럼 API에 없는 값은 추가하지 않는다. 리빌 뒷면과 잔상도 같은 비율로 맞췄다.
- 1024px 미만과 `prefers-reduced-motion: reduce`에서는 읽기 쉬운 정적 반응형 티켓을 즉시 표시한다. 기존 WebM·MP4·poster와 렌더 스크립트는 비교·회귀 확인용 실험 자산으로 보존하지만 실제 예매 완료 런타임에서는 참조하지 않는다.
- 데모 fixture에서 아이유 공연(`5`)은 예매 가능으로 바꾸고, `Busan Wave Festival`(`4`)을 매진 대상으로 옮겼다. 홈·공연 목록·상세/예매 흐름이 같은 상태를 사용한다.
- 최신 자동 검증: 티켓·리빌·결제 완료·로고 집중 **4파일·38테스트**, 전체 **36파일·192테스트**, typecheck·lint·build 통과. Vite 1,166모듈 변환, A-06 CSS **18.18kB / gzip 4.48kB**, JS **7.32kB / gzip 2.60kB**다.
- 브라우저 실측: Chrome 1440×1000에서 Collector Foil A+의 최종 외곽이 **896×344.61px(2.600:1)**이고 `scrollWidth === clientWidth === 1440`이다. 2.70초 회전 프레임과 4.90초 안착·광택 프레임을 확인했다. 390×844에서는 **358×863px** 세로 패스이며 `scrollWidth === clientWidth === 390`이다. 안정 미리보기는 `http://127.0.0.1:5173` 한 포트다.

### A-06 print-only 티켓 — 현재 구현, 2026-09-14

- `TicketRevealStage`는 실제 `ConcertCollectorTicket` DOM을 프린터 슬롯에서 아래로 인쇄한다. 상태는 `printing` → `settling` → `complete`이며 `<video>`, 3D 회전, 브랜드 뒷면, Stage Halo를 렌더하지 않는다.
- `TICKET_TIMING` 계약은 **인쇄 1200ms + settle 160ms = 총 1360ms**다. CSS `ticket-reveal-printout`도 1360ms로 같은 값을 사용한다.
- 1024px 미만 모바일과 `prefers-reduced-motion: reduce`에서는 clip/transform/animation을 제거한 정적 반응형 티켓을 즉시 표시한다. 모바일에서는 replay를 숨기고 reduced-motion에서는 replay를 비활성화한다.
- 예매 완료 문구와 `내 티켓 보기`·`홈으로` CTA는 리빌 바깥에 있으며 인쇄 중에도 항상 사용할 수 있다. 연출 상태는 결제·발권 완료 판정을 소유하지 않는다.
- 과거 5.20초 영상/DOM 교차 전환, 3D 회전·Stage Halo, `render:ticket` 생성 흐름은 D-015/D-016/D-018 당시의 대체된 실험 이력이다. 현재 결정은 D-019다.

## 아직 구현하지 않은 범위

### 단계 B. 실제 세로축 연결

- OpenAPI 타입과 공연 목록·상세 API 연결
- 티켓 옵션, 주문 생성, 응원팀 선택, 결제 서명, 완료 조회 Query 연결
- 로그인·지갑 등록·공연자·관리자·참여팀 리더 라우트 가드
- API 오류 코드별 복구 행동과 데모 fixture adapter 분리

단계 B를 시작하기 전에 현재 OpenAPI, 백엔드 실제 구현, 환경변수를 다시 대조한다. 계약이 다르면 추측해 맞추지 말고 이 문서에 차단 사항을 기록한다.

### 단계 C. 남은 progressive enhancement

- View Transition 적용 범위와 기존 부분 구현 재점검
- CSS scroll-driven reveal
- 네이티브 Popover와 키보드 fallback
- vgpu 프레임 기반 품질 저하와 CSS fallback

Motion·Anime.js·Bklit 실험은 각 책임과 fallback을 정해 적용했다. 기존 코드의 View Transition·vgpu 구현은 보존했으며, 위 목록은 지원 판정·fallback·성능 예산까지 완성하는 추가 작업으로 아직 시작하지 않았다.

## 다음 세션 시작 순서

1. `git status --short`로 사용자 변경과 작업 브랜치를 확인한다.
2. `cd frontend && pnpm install --frozen-lockfile`
3. `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
4. 이 문서, 결정 로그, 설계 문서, 현재 계획 순으로 읽는다.
5. 단계 B 계획을 쓰기 전에 `docs/design/06_API_명세서_v6.md`, `docs/design/api/openapi.yaml`, 백엔드 컨트롤러·DTO, `frontend/src/shared/api`를 교차 대조한다.

## 작업 경계와 주의사항

- 원본 checkout의 `.claude/launch.json`에는 사용자의 기존 pnpm 경로 변경이 있다. 이번 브랜치는 해당 파일을 수정하거나 커밋하지 않았다.
- 디자인 실험에서 `animejs`와 Bklit 요구 의존성을 추가했다. 직접 사용 경계와 제거 절차는 `DESIGN_TOOL_EXPERIMENTS.md`를 따른다.
- 데모 fixture 성공을 실제 API 성공으로 표현하지 않는다.
- 되돌릴 때는 위 커밋을 역순으로 각각 revert한다. 모바일 커밋은 페이지 폭, 라우트 커밋은 번들 로딩 경계, fixture 커밋은 예매 데모 정합성에 영향을 준다.
