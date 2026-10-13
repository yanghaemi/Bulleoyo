# Editorial Stage Lab A/B Design

## 목적

운영 화면을 변경하지 않고 기존 `__lab/design-refresh`에서 같은 공연 데이터로 두 개의 출시 가능한 공연 탐색 시안을 비교한다.

## 고정 조건

- 전체 화면은 `Editorial Stage A`와 `Stronger Identity B` 두 개만 만든다.
- 두 안은 같은 공연 배열, 같은 첫 활성 공연, 같은 날짜 필터, 같은 H1 헤더, 같은 M1 모바일 내비게이션을 사용한다.
- 폰트는 전체 화면에서 현재 `--font-sans`를 사용한다. 네 후보는 별도의 type specimen에서만 비교한다.
- H1/H2는 navigation specimen에서만 비교한다.
- 운영 라우트, API, 인증, 권한, 예매, 결제, 지갑, 정산 코드는 변경하지 않는다.
- 캐러셀의 drag/swipe, reduced-motion, focus 처리와 테마 토큰을 재사용한다.
- 제품 UI에는 `Stage Gallery`, `Editorial Lineup` 같은 실험 이름을 노출하지 않는다.

## 비교안

### Editorial Stage A

- 절제된 편집형 2열 무대.
- 큰 포스터, 넉넉한 여백, 즉시 읽히는 날짜·장소·가격·CTA.
- 국소 조명과 짧은 전환을 사용하되 포스터보다 앞서지 않는다.
- 목록 보기에서는 동일 데이터를 밀도 높은 행으로 표현한다.

### Stronger Identity B

- 중앙 선택 포스터와 양옆 포스터의 크기·깊이 차이를 통해 공연을 넘겨보는 공간감을 만든다.
- 기존 `ShowCarousel`을 재사용해 drag/swipe, 키보드, 점 이동, reduced-motion을 보존한다.
- 선택 포스터와 연결되는 방향성 조명, 무대선, 절취선 리듬을 제한적으로 사용한다.
- 핵심 정보와 CTA는 장식 및 모션과 독립적으로 즉시 보인다.

## 랩 진입

- `?view=home&concept=editorial-a`
- `?view=home&concept=identity-b`
- `?view=home&specimen=type`
- `?view=home&specimen=navigation`

`v=1`, `v=2`는 기존 공유 링크를 위해 각각 A, B의 호환 별칭으로 유지한다.

## 검증 뷰포트

- 1440 x 1000
- 1024 x 900
- 390 x 844
- 360 x 800

다크·라이트 테마, 한국어, 포스터 이미지, 키보드 포커스, reduced-motion을 확인한다.
