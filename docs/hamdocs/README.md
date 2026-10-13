# hamdocs — 양해미 백엔드 0층 작업 기록 (2026-09-08 ~ 09)

작성자: 양해미 · 브랜치 `feat/be/init` · 대상: Jira `S15P21B204-46`·`-47`·`-48`(백엔드 0층 세로축) + QA 대응 + develop 병합 + 동시성 결함 수정

이 디렉토리는 **작업 기록**이다. 설계 정본은 `docs/design/`(API v6·ERD v5)이고, 여기 적힌 내용이 그와 충돌하면
설계 정본이 옳다. 개별 엔드포인트의 요청·응답 필드 shape는 옮기지 않았다 — 정본은 `_workspace/be_*.md` 3편이다.

## 무엇을 했나 (요약)

1. **카드 3장 구현** — member·wallet·team(-46) → performance·rule·ticket·payment(-47) → entry(-48). 세로축(로그인 →
   지갑 등록 → 팀 생성 → 공연 → 규칙 동의 → 결제 → 티켓 발급 → QR 검표)이 한 번에 관통하는 통합 테스트로 고정했다.
2. **경계면 QA 2회** — 1차에서 `수정` 10건·`명세 수정` 다수·`팀 결정` 다수를 판정받았고, 전부 반영한 뒤 2차 재검증에서
   9건 해결 확인 + 새 불일치(프록시 헤더) 1건을 추가로 잡았다.
3. **develop 병합** — 실물 체인 모듈(`web3j-ext`)이 develop에 들어와 우리가 임시로 만든 체인 포트/스텁을 걷어내고
   호출부를 실물에 직접 붙였다. 코인 개명 KRWS→YoYo 반영. 병합 중 develop 쪽 결함 2건을 발견해 함께 고쳤다.
4. **동시성 결함 3건 수정** — 주문 생성 멱등, 재고 보상, 늦게 도착한 결제 receipt 처리. 이 저장소에서 가장 공들인
   부분이며 상세는 `02_결함과_수정.md`에 있다.
5. **인프라 2건** — `OPERATOR_ADDRESS`·`APP_BASE_URL` 환경변수 배선, 프록시 헤더
   신뢰 경계(XFF·Forwarded 등 7종) 정리.

## 지금 어디까지 왔나

- **테스트**: 73 → 102 → 124 → 144(QA 1차 수정) → 348(develop 병합, 우리 146 + develop 202, skip 2는 실체인
  전제 E2E) → **359**(동시성 수정, 신규 11). 빌드 명령은 `./gradlew clean build -PdockerApiVersion=1.44`
  — Docker Engine 29.6.1에서 `docker-java`가 `/info`를 400으로 거부해 이 플래그가 없으면 Testcontainers가 죽는다.
- **커밋 상태**: 카드 3장·환경변수 배선·프록시 하드닝·develop 병합까지는 커밋됐다(`git log --oneline
  origin/develop..HEAD` 5건 — 853305c·2a7c258·59f71dc·ae929fa·13583da). **동시성 결함 수정은 아직 커밋하지
  않았다** — 워킹트리에 남아 있다.
- **Jira 상태**: 카드 3장 모두 완료 기준을 충족했지만 MR 전이라 **진행 중**으로 남겨 뒀다.
- **결제 확정 경로는 배선되지 않았다.** `ChainJobConfirmationService.confirm()`을 부르는 프로덕션 코드가
  없다(워커가 receipt 이벤트 topic0 파싱을 못 해 `TxReceipt`를 만들지 못한다). 검증 로직 자체는 있고 테스트는
  `TxReceipt`를 직접 주입해 통과시킨 것이다. 실서버에서는 `chain_job`이 `PENDING`에 머문다.
  정확한 표현은 **"접수·검증은 구현, 확정은 배선 미완"**이다. "완성"이라고 부르지 않는다.

## 문서 구성

| 문서 | 내용 |
|---|---|
| [`01_구현_기록.md`](./01_구현_기록.md) | Jira 카드 3장의 범위·완료 기준·달성 여부, 구현 엔드포인트 목록(도메인별), develop 병합 요약 |
| [`02_결함과_수정.md`](./02_결함과_수정.md) | **가장 중요.** QA에서 나온 결함, 타임존 결함, 프록시 헤더 결함, 동시성 결함 3건 — 각각 문제→원인→검토한 대안→선택→근거→남은 한계 구조 |
| [`03_남은_과제.md`](./03_남은_과제.md) | 미완 항목, 팀 결정 대기 목록, 사람이 해야 할 조치 |
| [`04_멱등과_부분실패.md`](./04_멱등과_부분실패.md) | 결함 기록이 아니라 지도 — 멱등 장치 4종, 명세 §0.8과 코드의 격차, release가 원자적이라 부분 실패가 없는 이유, `retryable` 표시값 문제, release 게이트의 좁은 창, 프론트-서버 멱등 재생이 충돌한 실제 사례(2026-09-16) |

## 원본 자료 (상세 shape·필드 표는 여기서 찾는다)

`_workspace/`에 있으며 이 문서 세트가 정리한 원본이다. 이 브랜치가 머지되면 `_workspace/`는 삭제 대상이므로
장기 보관이 필요한 사실은 이미 위 세 문서에 옮겨졌다.

- `be_member-wallet-team_endpoints.md` · `be_performance-rule-ticket-payment_endpoints.md` · `be_entry_endpoints.md` — 카드 3장 상세
- `qa_be-0층_2026-09-08.md` · `qa_be-0층-재검증_2026-09-08.md` — QA 1·2차 전체 판정표
- `be_qa-fixes_2026-09-08.md` — QA 지적 반영 상세
- `be_develop-merge_2026-09-09.md` — develop 병합 상세
- `be_concurrency-fixes_2026-09-09.md` — 동시성 결함 수정 상세
- `infra_env-operator-address.md` · `infra_xff-hardening.md` — 인프라 2건
