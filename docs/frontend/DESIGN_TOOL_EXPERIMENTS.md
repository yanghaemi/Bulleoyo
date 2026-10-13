# 디자인 도구 실험 운영·인계 문서

- 시작일: 2026-09-10
- 브랜치: `codex/stage-ledger-foundation`
- 설계: `docs/superpowers/specs/2026-09-10-design-tool-experiments-design.md`
- 계획: `docs/superpowers/plans/2026-09-10-design-tool-experiments-plan.md`
- 후속 설계: `docs/superpowers/specs/2026-09-10-stage-motion-auth-polish-design.md`
- 후속 계획: `docs/superpowers/plans/2026-09-10-stage-motion-auth-polish-plan.md`
- 검증된 기존 미리보기: `http://127.0.0.1:5174` (추가 서버 불필요)
- 개발 실험실: `pnpm --dir frontend dev` 실행 후 `/__lab/design-tools`
- LAN HTTPS 데모: `pnpm --dir frontend dev:demo` 실행 후 `https://<host>:5173/__lab/design-tools`

## 현재 적용 상태

| 도구         | 책임                                | 제품 적용                                                                 | 상태                                                       |
| ------------ | ----------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Motion       | React 상태 기반 enter/exit·spring   | 지갑 지급 설명, V-02 전문 항목, P-05 모바일 시뮬레이션·조명, A-04 팀 무대 | implemented, automated verification, 아래 browser verified |
| Anime.js 4.5 | 과거 순차 단발 연출 실험            | A-06 2.2초 발권                                                           | 대체된 역사, 현재 A-06 런타임에서 사용하지 않음             |
| CSS          | A-06 print-only 인쇄                 | 실제 DOM 티켓 1200ms 인쇄 + 160ms settle                                 | 현재 구현, 총 1360ms                                        |
| CSS·SVG path | header·loader 정방향 2.4초·복귀 3.0초 | 공통 헤더, C-01 AuthHeader, 초기 로더, Lab                                | implemented, automated verification, 아래 browser verified |
| Bklit UI     | 데이터 관계 보조 시각화             | P-08 팀별 분배액, M-03 발행량 구성                                        | 구현·통합 테스트 완료                                      |
| Manus AI     | 저장소 밖 대안 탐색                 | 제품 코드에 직접 사용하지 않음                                            | 프롬프트만 준비, 외부 실행 전                              |
| Figma        | 확정 벡터·토큰 정본                 | 후속 컴포넌트·토큰 동기화에 사용                                          | 이번 작업에서 파일 쓰기 없음                               |

Manus는 외부 서비스 실행 결과를 제품 정본으로 삼지 않는다. 이번 세션에서는 계정·대상 프로젝트가 지정되지 않아 실행하지 않았고, 재현 가능한 프롬프트와 평가표만 준비했다.

## 설치와 코드 위치

```text
frontend/src/shared/ui/MotionDisclosure.tsx     Motion 공통 경계
frontend/src/shared/ui/AnimatedBrandLogo.tsx   로고 SVG 조각·상태 (안무: styles/fx-brand.css)
frontend/src/shared/ui/BrandLoader.tsx          라우트 초기 로더
frontend/src/shared/ui/AuthHeader.tsx           로그인 브랜드·언어 헤더
frontend/src/features/ticket/TeamChoiceStage.tsx 선택 팀의 장식 프리뷰
frontend/src/features/ticket/IssuedTicketHero.tsx 실제 티켓 DOM과 CSS 인쇄 연출
frontend/src/features/studio/SettlementLightStage.tsx 유효 비율의 CSS 조명
frontend/src/components/charts/                 Bklit registry 원본(vendored, 직접 사용 금지)
frontend/src/shared/charts/                      제품용 데이터 어댑터·접근성 래퍼
frontend/src/pages/DesignToolsLabPage.tsx        개발 전용 비교 화면
frontend/src/app/devRoutes.ts                    개발 경로 gate
```

의존성은 `motion`, Bklit이 요구한 `@visx/*`, `clsx`, `tailwind-merge`다. 현재 코드가 사용하지 않는 `animejs`·`d3-array`·`@number-flow/react`는 제거했다. Bklit registry 원본은 프로젝트 ESLint 대상에서 제외하고, 실제로 유지보수하는 `shared/charts` 래퍼는 lint한다.

## 경계와 유지보수 규칙

1. feature는 `src/components/charts`를 직접 import하지 않고 `@/shared/charts`만 사용한다.
2. 차트는 서버 응답 수치를 표시만 한다. 정산 계산·반올림·불변식 판정의 정본이 아니다.
3. P-08 표, M-03 숫자 카드를 삭제하지 않는다. 차트가 실패해도 원 수치가 남아야 한다.
4. Anime.js는 `createScope({ root })` 안에서만 실행하고 unmount 시 `scope.revert()`한다.
5. 라우트·데이터 로딩을 애니메이션 길이에 맞춰 지연하지 않는다.
6. `prefers-reduced-motion: reduce`에서는 Anime.js timeline을 만들지 않고 Motion은 즉시 상태를 바꾼다.
7. 로고 path 그룹의 `data-part` 이름은 유지한다. 확정 벡터를 받으면 도형만 교체한다.
8. `/__lab/design-tools`는 `buildDevRoutes(import.meta.env.DEV)`로만 등록한다.

## 로고 원본과 교체 절차

2026-09-10 전달된 `bulleoyo_logo_mic_horizontal_variants.svg`에서 왼쪽 `variant-a-merged-stem`을 확정안으로 선택했다. 저장소에는 선택된 도형만 `frontend/src/assets/brand/bulleoyo-logo-variant-a.svg`로 보존했고, 애니메이션용 인라인 path는 `AnimatedBrandLogo.tsx`에 반영했다. 오른쪽 `variant-b-direct-base`는 사용하지 않는다.

이후 수정된 SVG/Figma 원본을 받으면:

1. 글자를 outline/path로 변환한 원본인지 확인한다.
2. `AnimatedBrandLogo.tsx`의 `ko-word`, `mic-head`, `mic-stand`, `mic-y`, `mic-o`, `english-word` 그룹에 해당 path를 배치한다. `ko-word`와 `english-word`는 접두부만 맡고 `mic-y`·`mic-o`는 두 접두부 밖에 둬 마지막 교차 전환 중에도 `YO`가 사라지지 않게 한다.
3. viewBox와 기준 좌표를 바꾸면 `fx-brand.css`의 transform·transform-origin·keyframes를 실측해 조정한다.
4. 22px 헤더, 72px 로더, light/dark에서 확인한다.
5. `AnimatedBrandLogo.test.tsx`, typecheck, build를 다시 실행한다.

런타임 영문은 `<text>`가 아니라 생성된 path다. `pnpm gen:brand`로 윤곽을 재생성할 수 있다. 문서 최초 재생 기록은 `sessionStorage['bulleoyo:header-intro-document'] = String(performance.timeOrigin)`이며 완료 boolean이 아니다. 새 문서는 한글→영문을 자동 재생하고, 이후 클릭은 영문→한글 전용 복귀와 한글→영문 정방향을 교대로 실행한다. 안정 형태는 `sessionStorage['bulleoyo:header-form']`에 저장해 SPA 재마운트에 유지한다. reduced-motion에서는 header·loader 모두 최종 영문 path 상태를 표시한다.

## 재현 경로와 Lab fixture

- `/login`: AuthHeader·언어·소셜 버튼. 현재 미리보기는 인증 미설정이므로 소셜 버튼이 비활성이다. pending/error의 동작은 `LoginScreen.test.tsx`로 검증했으며 실제 인증 성공으로 표현하지 않는다.
- `/performances/12/order/choice`: aespa/GOT the beat radio를 Space·Enter로 빠르게 바꾼다. 선택값·CTA는 즉시 갱신되고 원래 행은 남는다.
- `/orders/12/complete`: 실제 데모 예매번호 ORD-0012. replay→내 티켓→홈 순으로 Tab 이동한다. 발권 중에도 두 CTA는 활성이다.
- `/studio/performances/12/rules`: 고정 bp 입력을 3500으로 바꾸면 관객 선택 6500과 기존 분배표가 즉시 반영된다. 저장은 데모 핸들러이며 실제 서버 저장 증거가 아니다.
- `/__lab/design-tools`: 정규화 header logo, AuthHeader, TeamChoiceStage, IssuedTicketHero, SettlementLightStage, loader, ConfirmDialog, disclosure, 두 차트를 조합한다. 팀 포스터는 로컬 `/brand/mark.svg`, 티켓/비율은 상수 fixture다. API·지갑·실거래 호출은 없고 브랜드 문서·안정 형태 기록 외 별도 저장을 하지 않는다.
- Lab `팀 프리뷰`: 미선택·일반·긴 이름. 티켓은 컴포넌트의 접근 가능한 `Replay ticket / 티켓 다시 보기` 버튼을 사용한다. 헤더 로고 버튼은 선택적 `replayKey`를 증가시켜 버튼 자체·여백·키보드 활성화도 다음 방향의 안무 한 번으로 연결한다. 제어된 SVG는 별도의 click handler를 실행하지 않는다.
- Lab `정산 비율 상태`: 35/65, 0/100, 50/50, 100/0, 빈 값, 범위 초과, 합계 오류, 서버 합계 오류. invalid 전환은 마지막 valid를 유지한다. 별도 최초 invalid fixture는 두 값을 `—`로 표시한다.

## browser verified — 2026-09-10, 최초 Task 7 `9f10753`

Lab replay와 최종 홈 링크 replay·팀 포스터 연결 수정은 CUA 미가용으로 브라우저 재확인을 하지 못했다. 후속 근거는 실제 컴포넌트·라우터·모션 자동 검증이며 아래 40개 조합은 수정 전 `9f10753`의 QA로만 보존한다.

Windows Chromium in-app browser, 기존 5174 서버를 사용했다. 다섯 경로×네 폭×light/dark **40개 조합**을 확인했다. 아래 값은 light/dark가 같고 `scrollWidth / innerWidth` 순서다.

| 경로                            | 360×800   | 390×844   | 768×1024  | 1440×1000   | console.error |
| ------------------------------- | --------- | --------- | --------- | ----------- | ------------- |
| `/login`                        | 345 / 360 | 375 / 390 | 753 / 768 | 1425 / 1440 | 0             |
| `/performances/12/order/choice` | 360 / 360 | 390 / 390 | 768 / 768 | 1440 / 1440 | 0             |
| `/orders/12/complete`           | 360 / 360 | 390 / 390 | 768 / 768 | 1440 / 1440 | 0             |
| `/studio/performances/12/rules` | 345 / 360 | 375 / 390 | 753 / 768 | 1425 / 1440 | 0             |
| `/__lab/design-tools`           | 345 / 360 | 375 / 390 | 753 / 768 | 1425 / 1440 | 0             |

모든 조합에서 `scrollWidth === documentElement.clientWidth`. Windows의 고정 세로 스크롤바 15px 때문에 login/rules/Lab는 **`scrollWidth === innerWidth`가 false**다. 측정을 true로 바꾸거나 페이지 폭 문제로 오인하지 않는다. 일반 모션의 console.warn/error는 0이었다.

네 폭 모두 실제 키 입력으로 다음을 확인했다.

| 화면              | 키보드 검증                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------- |
| Login             | 로고→EN→한국어. 미설정 소셜 버튼은 disabled라 Tab에서 제외된다.                              |
| TeamChoice        | 첫 radio Space→Tab→두 번째 radio Enter. 선택 `[false,true]`, 표시되는 다음 CTA 활성.         |
| BookingComplete   | replay→내 티켓→홈. 버튼이 장식/투명 레이어 안에 없고 발권 중에도 활성.                       |
| SettlementRules   | 고정 bp→관객 선택 bp 순서. 3500 입력 시 6500과 조명 35%/65% 즉시 반영.                       |
| Lab ConfirmDialog | 확인→유지→확인 순환, Shift+Tab 역순, Escape→모달 열기 버튼 복귀. 퇴장 DOM inert·aria-hidden. |

확인 모달은 360·390px에서 너비 345·375px, 버튼은 313·343px이고, 768·1440px에서는 모달 400px/버튼 352px다. 네 폭 모두 두 이중 언어 액션의 좌우 경계와 focus ring이 모달 안에 보이는 스크린샷을 확인했다. 수정 전 Tab이 배경 disclosure로 빠지는 현상을 브라우저에서 재현하고 RED 테스트 후 최소 수정했다.

조명은 네 폭×두 테마에서 `0/100→35/65→50/50→100/0→35/65→빈 값→범위 초과→합계 오류→서버 합계 오류` **72회**를 확인했다. 정상 표기/target ratio가 일치하고 네 invalid에서 35/65를 유지하며 stage는 경계 안에 남는다. 최초 invalid fixture는 두 `—`와 안내만 표시한다. 실제 규칙 3500/6500의 예상 합계는 블루노트 626,668원, 새벽세시 514,666원, 노이즈캔슬 458,666원으로 총 1,600,000원을 유지했다. 숫자는 즉시 갱신하고 count-up하지 않는다.

reduced-motion은 **OS 설정을 바꾸지 않고 임시 matchMedia fixture**로 다섯 실제 route를 네 폭에서 확인했다. 로고 header/loader 최종 영문 path opacity 1, 티켓 `data-motion=reduced`·transform none·잔상/반짝임 없음, 팀 카드 transform none, 조명 정적 flex 비율/opacity를 확인했다. console.error는 0이다. Motion이 개발 모드에서 출력하는 “Reduced Motion enabled” 경고는 해당 12개 문서에서 각 1회 발생했으며 숨기지 않았다. 전체 무경고는 일반 모션과 자동 검증 결과에 한정한다. OS/브라우저 네이티브 미디어 설정 변경을 실측한 것으로 기록하지 않는다.

기존 로고 36프레임·티켓 7체크포인트 검증은 Tasks 2/5 보고서에 남아 있다. Task 7은 통합 경로·반응형·키보드·정산 테마 검증이며 모든 타임라인 프레임을 다시 촬영했다고 주장하지 않는다.

## automated verification — 최종 코드 head 기록

| 코드 head                | 기록된 전체 검증        | 영향 집중                    |
| ------------------------ | ----------------------- | ---------------------------- |
| `6a5e954` 홈 링크 replay | 31파일 / 164테스트 통과 | 5파일 / 36테스트 통과        |
| `8ccf123` 팀 포스터 연결 | 31파일 / 165테스트 통과 | 팀·Lab 2파일 / 11테스트 통과 |

두 수정 모두 typecheck·lint·변경 소스 Prettier 통과. 이 문서 정리는 테스트 재실행이 아니며, 아래 빌드 크기는 `a8ec518` 당시 기록이다.

### Lab replay 수정 `a8ec518` 당시 실행

```powershell
cd frontend
pnpm exec vitest run src/pages/DesignToolsLabPage.test.tsx src/shared/ui/AnimatedBrandLogo.test.tsx src/shared/ui/AuthHeader.test.tsx src/features/member/LoginScreen.test.tsx
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

- 당시 리뷰 수정 영향 집중: **4개 파일·25개 테스트**, 전체 **30개 파일·153개 테스트**. 모두 종료 코드 0, 해당 실행에서 act/unhandled rejection/console 오류·경고 없음.
- 최초 `9f10753`의 계획 집중은 7파일/47테스트, 전체 29파일/148테스트였다. `pnpm test -- <파일들>`은 wrapper가 `--`를 그대로 전달해 전체를 실행한다. 집중 결과는 위 `pnpm exec vitest run`을 사용한다.
- replay RED: 실제 named button 자체 클릭은 complete에 머물러 실패, SVG 클릭은 통과했다. GREEN: 버튼 자체/자식 클릭 및 real-timer Enter/Space 모두 `complete→reset→intro→complete` 한 번을 MutationObserver로 확인했다. 추가 계약 테스트는 같은 replayKey 재렌더·reduced-motion 재생 생략과 기존 자동/클릭/이동 계약을 보호한다.
- 모달 RED: 기존 overflow 회귀 1개 통과, 새 focus/busy 회귀 2개 실패. GREEN: 3개 통과. 최종 typecheck/lint/build 모두 종료 코드 0.
- 기존 development route gate와 `devRoutes.test.ts`는 수정하지 않았다. production dist에 `/__lab/design-tools`, `DesignToolsLab`, `LAB-20260910-00012` 없음.

| production 청크              | 원본 kB | gzip kB |
| ---------------------------- | ------: | ------: |
| 진입 `index-ChSAPULP.js`     |  391.44 |  127.44 |
| Anime.js `index-lZqNE26Y.js` |   43.17 |   17.26 |
| TeamChoicePage               |    5.18 |    2.28 |
| SettlementRulesPage          |   17.66 |    6.17 |
| WalletPage                   |   11.20 |    4.32 |
| SupplyDisclosurePage         |   14.96 |    5.28 |
| MotionDisclosure             |    4.75 |    2.21 |
| BookingCompletePage          |   11.48 |    3.93 |
| LoginPage                    |    3.73 |    1.77 |
| SettlementPage (P-08)        |   31.34 |   10.14 |
| AdminCoinPage (M-03)         |   38.75 |   11.98 |

청크 크기는 replay 후속 수정 빌드의 파일별 Vite 출력이며 합산 초기 전송량이 아니다. 초기 gzip 500kB 예산 대비 진입 JS는 127.44kB다. Anime.js는 dynamic import이며 CSS header 반응 때문에 정적으로 셸에 들어가지 않는다. Motion은 사용 route와 공유 청크에 남는다. 홈 최초 네트워크 요청 수의 이전 측정은 이번 QA에서 재측정하지 않았다.

## 개별 롤백

- Motion: 세 feature에서 `MotionDisclosure`를 기존 조건부 블록으로 되돌리고 `shared/ui` export를 제거한다.
- 티켓 print-only 완료: `IssuedTicketHero`에서 `TicketRevealStage`를 제거하고 `ConcertCollectorTicket`만 남긴다. 실제 article/dl 데이터와 항상 사용 가능한 CTA는 유지한다. 현재 런타임은 영상·렌더 스크립트에 의존하지 않는다.
- 팀 무대·정산 조명: 해당 `TeamChoiceStage`/`SettlementLightStage` 호출을 제거한다. radio·bp 입력·표·저장 로직은 유지한다.
- CSS 브랜드 모션: AppHeader·AuthHeader·BrandLoader의 로고를 `mode="static"`으로 바꾸고 홈 링크 replay 연결을 제거한다. 링크·로딩 상태·최종 path 스타일은 유지하며 `fx-brand.css` 전체를 제거하지 않는다.
- Bklit: 두 feature의 `TeamPayoutChart`/`SupplyCompositionChart` 호출을 제거한다. 기존 표·카드는 그대로 남는다.
- Lab: router의 `...buildDevRoutes(...)`, `devRoutes.ts`, `DesignToolsLabPage.tsx`를 제거한다.

## 외부 도구 결과 경계

- 제공된 5초 WebM은 프레임 샘플링했다. Apple iPad Air의 소스 미디어 계약·구조는 확인했지만 미디어 접근 불가로 15개 원본 모두를 실제 재생하지 못했다. 완전한 시작/끝 상태·한 주인공·명시적 replay 같은 구조적 모션 원칙만 재현했다. Apple 영상·자산을 제품에 복사하지 않았다.
- Manus 프롬프트: `docs/experiments/manus-prompts.md`
- 외부 결과는 검토 전 `docs/experiments/results/`에 링크·스크린샷·평가점수만 기록한다.
- 외부 생성 코드를 바로 복사하지 않는다. 정본과 충돌한 항목은 버리고, 채택 항목은 결정 로그를 먼저 갱신한다.

## A-06 티켓 연출 재현·검증

### 현재 print-only 계약 — 2026-09-14

- `TicketRevealStage`는 `<video>`나 3D 객체를 렌더하지 않는다. 실제 `ConcertCollectorTicket` DOM을 프린터 슬롯에서 아래로 인쇄하며 `printing` → `settling` → `complete`로 끝난다.
- 재현 타이밍은 **0~1200ms 인쇄, 1200~1360ms settle, 총 1360ms**다. `motionTokens.ts`의 `TICKET_TIMING`과 `TicketRevealStage.css`의 `ticket-reveal-printout`을 함께 확인한다.
- 실제 흐름은 `/orders/5501/complete?from=12`, Lab 비교는 `/__lab/design-tools`의 실제 티켓·강제 폴백·정적 티켓을 사용한다. 현재 재현에 `render:ticket`이나 `/media/ticket/*`가 필요하지 않다.
- 1024px 미만과 reduced-motion에서는 애니메이션 없는 정적 반응형 티켓을 즉시 표시한다. 모바일에서는 replay가 숨겨지고 reduced-motion·강제 폴백에서는 replay가 비활성화된다.
- 예매 완료 문구와 두 CTA는 첫 렌더부터 사용할 수 있으며 인쇄 완료를 기다리지 않는다.

### 대체된 2026-09-11 시네마틱 실험 이력

- 당시에는 30fps·156프레임·5.20초 영상→DOM 안과 실제 DOM 3D 회전 안을 차례로 검증했다. `rotateZ(-60deg) rotateY(-15deg) rotateX(10deg)` 시작 자세, 느린 Y축 회전, Stage Halo·접지광·링, 단발 광택은 모두 D-019로 대체됐다.
- 당시 `render:ticket`으로 1600×720 무음 WebM·MP4와 WebP poster를 만들고 자산 예산을 검증했다. 이 명령과 `/media/ticket/*`는 현재 구현·재현 경로가 아니다.
- D-015/D-016/D-018은 결정 배경을 보존하는 역사다. 영상이나 3D 무대를 다시 제품 흐름에 연결하려면 D-019를 재검토하고 별도 결정을 먼저 남긴다.

현재 롤백은 `IssuedTicketHero`에서 `TicketRevealStage`만 제거하고 `ConcertCollectorTicket`을 직접 렌더하면 된다. 실제 데이터 계약과 CTA는 유지한다.
