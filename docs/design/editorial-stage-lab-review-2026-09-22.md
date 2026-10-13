# Editorial Stage 디자인 랩 비교 자료

> 이 문서는 9월 22일 A/B 비교 시점의 기록이다. 아래 검사 수치와 캡처는 당시 결과이며, 중간 통합의 최신 검증 결과로 재사용하지 않는다. 캡처·ZIP은 로컬 검토 자료로 제품 커밋에서 제외한다.
>
> 9월 23일 후속 마감: Identity B의 기준 폰트는 Pretendard로 변경했고, 제목 줄바꿈·모바일 CTA·목록 보기·한국어 문구와 선택 포스터 주변 조명을 다듬었다. A 및 독립 시편은 비교용으로 유지한다. 현재도 디자인 랩 전용이며 운영 홈·인증·권한·거래 로직에는 연결하지 않았다. 공용 캐러셀의 기본값은 `standard`, 랩 전용 표현은 명시적인 `artwork` 옵션이다.

## 확인 주소

- Editorial Stage A: `/__lab/design-refresh?view=home&concept=editorial-a&lang=ko`
- Stronger Identity B: `/__lab/design-refresh?view=home&concept=identity-b&lang=ko`
- 타입 시편: `/__lab/design-refresh?view=home&specimen=type&lang=ko`
- 내비게이션 시편: `/__lab/design-refresh?view=home&specimen=navigation&lang=ko`
- 캡처용 클린 모드: 위 주소에 `&presentation=1` 추가
- 호환 주소: `v=1`은 A, `v=2`는 B

## 비교 조건

- 동일 데이터: 서울 인디 나이트 / Blue Hour / Sound of Tomorrow
- 동일 활성 공연: 서울 인디 나이트
- 동일 데스크톱 크기: 1440 × 1000
- 동일 모바일 크기: 390 × 844
- 동일 헤더: H1 검색 중심
- 동일 모바일 구조: M1 공연 / 내 티켓 / 지갑 / MY
- A/B 기준 폰트: 기존 서비스 폰트

## 캡처

| 항목 | 파일 |
| --- | --- |
| A 1440 | `lab-captures/2026-09-22/editorial-a-1440.png` |
| B 1440 | `lab-captures/2026-09-22/identity-b-1440.png` |
| A 390 | `lab-captures/2026-09-22/editorial-a-390.png` |
| B 390 | `lab-captures/2026-09-22/identity-b-390.png` |
| 캐러셀 이동 전 | `lab-captures/2026-09-22/carousel-before.png` |
| 캐러셀 이동 후 | `lab-captures/2026-09-22/carousel-after.png` |
| 타입 시편 | `lab-captures/2026-09-22/type-specimen-1440.png` |
| 내비게이션 시편 | `lab-captures/2026-09-22/navigation-specimen-1440.png` |

## A/B 핵심 차이

### A — Editorial Stage

- 정보, 대형 포스터, 짧은 공연 레일이 한 화면에서 명확히 연결된다.
- 포스터를 주인공으로 두되 조명은 카드 하단의 절제된 깊이로 제한한다.
- 공연 전환은 오른쪽 레일에서 직접 선택하며, 정보 탐색 속도를 우선한다.

### B — Stronger Identity

- A와 같은 날짜·장소·가격·CTA를 유지한다.
- 기존 Stage Gallery의 중앙 포스터, 양옆 공연 단서, 크기·깊이 차이, 연속 이동을 재해석한다.
- 활성 포스터와 연결되는 방향성 조명, 무대 바닥, 티켓 스텁 모티프를 국소적으로 사용한다.
- 기존 `ShowCarousel`의 drag/swipe, 키보드, focus, reduced-motion 로직을 그대로 재사용한다.

## 공통 UI

- 추천 공연 우측에 포스터 보기 / 목록 보기 전용 SVG를 사용한다.
- 포스터 보기 아이콘은 실제 중앙·측면 포스터 구성을 반영한다.
- 내부 이름인 Stage Gallery / Editorial Lineup은 제품 UI에 노출하지 않는다.
- 개인 메뉴는 마이페이지 드롭다운으로 묶고, 모바일은 4개 하단 탭으로 고정한다.
- `presentation=1`은 비교 캡처를 위해 디자인 미리보기 도구만 숨기며 제품 로직을 변경하지 않는다.

## 타입 및 내비게이션 시편

- 타입: 현재 폰트, Wanted Sans, Paperlogy + Pretendard, SUIT를 같은 문장·크기로 비교한다.
- 후보 웹폰트는 타입 시편이 열릴 때만 공식 배포 CSS에서 불러온다.
- 내비게이션: H1 검색 중심과 H2 운영 진입 강조만 비교한다.
- A/B 전체 화면은 승인 전까지 H1과 기존 폰트를 유지한다.

## 검증

- 390px A/B: `innerWidth=390`, `scrollWidth=390`으로 가로 넘침 없음
- 캐러셀 이동: 서울 인디 나이트 → Blue Hour로 제목, 일시, 장소, 가격, 활성 점이 함께 변경됨
- 집중 테스트: 21개 통과
- 전체 테스트: 161 files, 1203 tests 통과
- TypeScript: 통과
- ESLint: 통과
- production build: 통과
- 빌드의 기존 대용량 chunk 경고와 일부 기존 테스트의 `act(...)` 경고는 남아 있다.

## 이번 단계에서 하지 않은 일

- 운영 홈 화면 연결
- API, 권한, 인증, 예매, 결제, 지갑, 정산 로직 변경
- A/B 중 최종안 선택
- 폰트 또는 H1/H2의 운영 전역 적용
- 실기기 Safari/Android 브라우저 검증
