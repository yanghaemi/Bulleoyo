# API 명세서 v7 — 추천 도메인 신설 · 선호 장르 · 팀 장르 코드화

> 대상: S15P21B204 (소규모 공연 티켓팅·공동 정산 플랫폼) · 작성 2026-08-28(금) · 개정 2026-08-31(일) v3 · 개정 2026-09-02(수) v4 · 개정 2026-09-02(수) 오후 v5 · 개정 2026-09-03(목) v6 · **개정 2026-09-22(화) v7** · 상태: **초안**
>
> 기준: [방향 전환 결정 문서 v2](../planning/06_방향전환_코인전환_v2.md) **(SSOT)** · [방향 전환 결정 문서 v1](../planning/06_방향전환_코인전환_v1.md)(v2가 덧씌우지 않은 절만) · [추천 기능 설계 v1](./superpowers/specs/2026-09-22-recommendation-design.md) · [API 공통 응답 규격 v3](./01_API_공통_응답_규격.md) · [설계문서 작성계획 v1](./00_설계문서_작성계획_v1.md) §1.7
>
> 이전 버전(보존, 무수정): [06_API_명세서_v6.md](./06_API_명세서_v6.md) · [06_API_명세서_v5.md](./06_API_명세서_v5.md) · [06_API_명세서_v4.md](./06_API_명세서_v4.md) · [06_API_명세서_v3.md](./06_API_명세서_v3.md) · [06_API_명세서_v2.md](./06_API_명세서_v2.md) · [06_API_명세서_v1.md](./06_API_명세서_v1.md) · **노션 미러**: [API 명세서 DB](https://app.notion.com/p/6c42746d15ab836a9e57811892753f30)
>
> 함께 볼 v7 문서: [요구사항 명세서 v6](./04_요구사항_명세서_v6.md) · [기능 명세서 v6](./05_기능_명세서_v6.md) · [화면설계 v6](./07_화면설계_v6.md) · [ERD v5](./12_ERD_v5.md) · [v6 변경 계획 v1](./00_v6_변경계획_v1.md) · [기획 초안 v4](../planning/01_기획_초안_v4.md)
>
> **v7에서 달라진 것** — ① **`recommendation` 도메인 신설** — 결번이던 §14를 채운다. `API-recommendation-01` 맞춤 추천 목록(`GET /api/v1/recommendations/performances`)이 로그인 회원 홈에 개인화 섹션을 준다. 도메인 13 → **14개**(§0.11) ② **회원 선호 장르** — `API-member-05` 응답에 `preferredGenres`, `API-member-06` 요청에 `preferredGenres`(0~3개, 전체 교체)가 더해졌다 ③ **팀 장르 코드화** — `API-team-01`의 `genre`가 자유 문자열에서 **10종 enum**(단일)으로 바뀌고 **필수**가 됐다. `API-team-04`는 같은 enum으로 선택 수정 ④ P0 상세 **65 → 66개**(§17. v6 작성 시점 61에서 2026-09-15 API-performance-15·2026-09-21 API-settlement-08·2026-09-22 API-performance-16·17(미디어) 신설로 이미 65로 늘어 있었고, 이번에 recommendation-01이 더해 66이 됐다) ⑤ 근거: `docs/superpowers/specs/2026-09-22-recommendation-design.md` §4·§5·§7·§9·§10·§12
>
> **v5에서 달라진 것** — ① **법정화폐 입출구가 전부 사라졌다** — `charge`(충전) 도메인 4개, `withdraw`(팀 원화 수령) 도메인 4개, `API-member-07`(계좌 연결), `API-team-07`(정산 계좌), `API-wallet-05`(가스)가 삭제되고 도메인이 16 → **14개**가 됐다(결정 v2 §5·§9) ② **코인 확보 = 시연용 지급(faucet)** — `API-member-01`이 신규 회원에게 기본 잔액 100,000 YoYo를 mint하는 job을 걸고, 관리자가 `API-coin-07`로 추가 지급한다. `API-coin-08`이 지급 이력이다(신설 2개) ③ **결제는 잔액 결제 하나** — `API-payment-01`의 본문이 사라졌고(`mode` 삭제) 잔액이 모자라면 409 안내로 끝난다. 자동 충전 분기·`CHARGING` 상태가 없다 ④ **팀 수령은 `release`가 종단** — 정산 상태가 `RELEASED`에서 끝나고 `withdrawnAmount`·수령 계좌·2차 서명이 없다 ⑤ **`API-coin-01`이 발행량·에스크로 공시로 개편**되고 `API-verify-02`가 여기에 통합됐다 ⑥ **서명 tx는 Kaia 수수료 대납 고정** — `signed-tx` 본문이 `{kind, senderSignedRlp}`이고 서버(fee payer)가 대납 서명·전송한다(§0.4) ⑦ 유지: 비수탁 지갑·`display` 객체·`Accept-Language`·보증금 서명·규칙 동의 서명·검증 페이지·이메일 가입 P1 ⑧ P0 상세 59개(v5 기준 — v6은 61개, §17)
>
> **v6에서 달라진 것** — ① **양도(선물) 기능이 설계에서 삭제됐다** — `transfer` 장(API-transfer-01~04)이 통째로 사라져 도메인이 14 → **13개**가 되고 도메인 장이 **§1~§13**으로 당겨졌다(§14는 결번, §15~§17 고정). 티켓 상태는 **3값**(`ISSUED`/`USED`/`CANCELLED`)이고 `transferable` 필드·`TRANSFER_*` 409 행이 전부 빠졌다(결정 v2 §14-34) ② **지갑 등록이 로그인에서 분리됐다** — API-member-01은 신원만 만들고(`wallet` nullable, `grantJobId`·`signupGrant` 삭제), 등록은 **`POST /api/v1/wallets`**(API-wallet-04, 경로·역할 확장) 하나로 두 provider를 받는다. API-wallet-03·04가 **P1 → P0**, 기본 지급은 **지갑 등록 성공 직후**다(결정 v2 §14-35) ③ **지갑 잔액 캐시가 Redis로 옮겨졌다** — `wallet:balance` 해시(§0.12 신설)를 쓰고 DB 잔액 사본 컬럼이 없어졌으며, 지갑이 관여한 job 확정 시마다 갱신한다 ④ **정산 `HALTED` 서술 정정** — "되돌릴 수 있는 정지 3종"과 종단 중단을 §11 도입부에서 구분하고, 이의 `RESOLVED` 후 재집계 경로를 삭제했다(상태값·API 변경 없음) ⑤ **§0.12 서버 측 저장소(Redis) 키 규약 신설** ⑥ P0 상세 **61개**(§17)
>
> 표기 — **[팀]** 팀 결정 / **[권]** 권고안(이견 시 변경) / **[v5]** 이 버전에서 신설·변경 / **[v5 삭제]** 폐지 / **[v4]** v4에서 신설·변경된 뒤 **v5에서 그대로 유지**되는 항목(유지 API 절의 서술은 v4 본문을 손질해 옮긴 것이다) / **P1·P2** MVP 제외. 엔드포인트 번호·메서드·경로·이름은 **결정 문서 v2 §9 인벤토리와 글자 단위로 동일**하며 이 문서에서 임의로 만들지 않는다. 에러 코드는 **규격 v3 §3에 있는 것만** 쓰고, 없어서 대체한 코드는 **§16 규격 v5 신설 제안**에 모았다(본문 미사용). 상태값 문자열은 결정 문서 v2 §7 그대로다.
>
> **절 번호** — v4의 `§17 예약 경로`·`§18 규격 신설 제안`·`§19 검수표`는 v5에서 **§15·§16·§17**로 당겨졌고 v6·v7에서도 **그대로 고정**이다. **[v6]** 양도 장 삭제로 **도메인 장은 §1~§13**이며 §14는 결번이었다. **[v7]** `recommendation` 도메인 신설로 **§14가 채워져 도메인 장은 §1~§14**가 됐다 — §15~§17(예약 경로·규격 신설 제안·검수표)은 그대로 고정이며, 뒤 장을 다시 당기면 다른 문서·이슈의 "§16.1 에러 코드"·"§17 검수표" 참조가 한꺼번에 어긋난다(§16.3 #11).
>
> 각 엔드포인트 절의 구성 순서(`## 요구사항` → `## Request` → `### 시스템 처리` → `## Response`)는 노션 `APISpec` DB 행 템플릿 순서를 그대로 옮긴 것이다. 2단계에서 이 절들이 노션 행 본문이 된다.

> **정정(2026-09-07)** — 설계 문서 정합성 리뷰 반영.

| 위치 | 원문 | 정정 | 근거 |
|------|------|------|------|
| API-member-02 절 메타 행 | 우선: P0 | 우선: P1 | 절 제목·§17 검수표(5396행)·`openapi.yaml` x-priority가 모두 P1 |
| API-member-08 절 메타 행 | 우선: P0 | 우선: P1 | 절 제목·§17 검수표(5402행)·`openapi.yaml` x-priority가 모두 P1 |
| API-coin-04 절 메타 행 | 우선: P0 | 우선: P1 | 절 제목·§17 검수표(5446행)·`openapi.yaml` x-priority가 모두 P1 |

> **정정(2026-09-08)** — 코인 개명 KRWS → YoYo (name·symbol "YoYo", 환경변수·산출물 키 YOYO/YoYo, 로직 불변). 본문 전체의 `KRWS` 표기를 `YoYo`로 치환.
> **보강(2026-09-09)** — §11 -01 `actions` 계약: `blockedReason`은 실행 API의 `ErrorCode`와 같은 문자열, 체인 조회가 필요한 검사 2종(집계 대사·에스크로)은 `actions`에 미반영 → `available: true`여도 409 가능(D-25). openapi `SettlementActions` description 동일 반영.
> **보강(2026-09-21)** — **API-settlement-08 정산 조기 동의 신설**(코드가 먼저 나갔다, `EndpointInventoryTest` P0 62→63 · 66개). 참여팀 전원(주최팀 포함)이 동의하면 48시간 이의제기 기간을 건너뛰고 release가 열린다. 권한은 **참여팀 리더 전용**(ADMIN 우회 없음)이고 동의는 철회할 수 없다. §11 -01 응답에 `shares[].approved`·`shares[].approvedAt`·`myTeam.approved`·`actions.approve` 4필드를 추가하고, §11 -05의 release 게이트를 "이의제기 기간 종료" → "이의제기 기간 종료 **또는** 참여팀 전원 동의"로 정정한다. ERD v5 `settlement_share.approved_at DATETIME(6) NULL` 추가(`V7__settlement_share_approved_at.sql`). openapi `parts/11_settlement.yaml` 동일 반영.
> **보강(2026-09-22) — 표별 응원 팀 배분(주문 그룹) 도입, 결정 v2 §14-40.** A-04를 "관람 목적 팀 선택(한 팀)"에서 **"표별 응원 팀 배분"**으로 확장한다. 서버가 배분을 **팀별 하위 주문**(기존 `ticket_order`가 그대로 하위 주문, 팀 하나·`orderRef` 하나·`purchase` tx 하나)으로 쪼개 **주문 그룹**(`ticket_order.order_group_id`)으로 묶는다. **컨트랙트는 바뀌지 않는다**(`purchase`는 여전히 orderRef 1개 = 팀 1개). 영향 API — `API-ticket-01`(요청 `items[].chosenTeamId`로 변경, 응답 `orderGroupId`·`orders[]`) · `API-ticket-02/03/04`(그룹 단위 응답) · `API-payment-01`(서명 = `APPROVE` 1 + `PURCHASE` × 미결제 하위 주문) · `API-payment-02`(그룹 뷰) · `API-payment-03`(본문에 `orderId` 추가). 1인 4매 한도·재고 차감은 그룹 합산, 부분 실패는 확정분 유지·실패분만 만료. `EndpointInventoryTest` 카운트는 변하지 않는다(엔드포인트 신설 없음). ERD v5 `ticket_order.order_group_id BIGINT NULL`(자기참조 FK·인덱스는 유지, `V{다음 빈 번호}__ticket_order_group.sql`). openapi `parts/06_ticket.yaml`·`parts/07_payment.yaml` 동일 반영.
>
> **보강(2026-09-22) — 잔여 allowance.** `APPROVE`가 미결제 합계를 승인한 뒤 `PURCHASE` 일부만 성공하면 Splitter에 승인 잔량이 남는다. 다음 `payment-01`의 `APPROVE`가 절대값으로 덮어쓰므로 자금 위험은 없지만, **승인 잔량이 0이라고 가정하는 화면 문구·감사 로그를 쓰지 않는다.**
> **보강(2026-09-22) — 구현 시 바꾸지 않아도 되는 것.** 1인 4매 한도 쿼리(`TicketOrderRepository.sumQuantity`, 회원×공연 누적 합)·재고(`TicketStock.reserve`/`release`)·만료(`OrderExpiryScheduler` → `cancelIfPending`)는 **전부 `ticket_order` 행 단위**라 하위 주문으로 쪼개도 그룹 합산과 하위 주문 단위 만료가 그대로 성립한다. 코드에서 바꿀 것은 `OrderService.MAX_ITEMS` 5 → 10 하나다.

> **보강(2026-09-22 · S15P21B204-163)** — 공연 편집 흐름에서 사용할 **API-performance-16 미디어 저장**과 **API-performance-17 미디어 조회**를 신설했다. `poster`·`ticket-artwork` 두 종류의 JPEG·PNG·WebP(5MB 이하)를 공연별로 보관하며, 조회 경로는 공개 공연·티켓 화면에서 직접 사용한다. 엔드포인트는 68개(P0 65 + P1 3)다.
> **정정(2026-09-28)** — §14 recommendation-01을 실제 구현에 맞춘다. 근거: 경계면 검증 2026-09-28(MR !236 · S15P21B204-180), 코드가 정본. ① 공연 장르의 참여 팀 범위를 "REGISTERED"에서 "REGISTERED이면서 지갑 등록을 수락한 팀"으로 좁힌다(`RecommendationService.java:200-203`·`PerformanceParticipant.isAccepted()`) — 카드 `teamNames`와 같은 팀 집합을 보이려는 의도(MR !192 리뷰), 초대만 받고 미수락인 팀 장르는 제외한다. ② 후보 조건에 "공연 시작 시각이 지난 공연 제외"를 추가한다(`RecommendationCandidateRepository.java:37`). ③ 후보가 0건일 때의 동작(`items: []`·`basis: FALLBACK`·노출 로그 미기록)을 명시한다. ④ 401 오류 표에 `AUTH_TOKEN_INVALID`(서명 불일치·위조 토큰, 또는 회원 행 없음 — §0 정의 + `RecommendationService.java:88`)를 더한다. ⑤ performance-02·recommendation-01 예시 JSON에 빠져 있던 `ticketImageUrl`을 채운다(`04_performance.yaml:1488`·백엔드에는 이미 있음).
>
> **보강(2026-09-24) — 패스키 본인 확인(step-up), 결정 v2 §14-41.** §7 끝에 부속 절 **§7.W `webauthn`**(API-webauthn-01~04, P1)을 신설했다. 서버 스위치 **`STEP_UP_ENABLED`**(기본 **off**, 하나)가 켜지면 보호 동작 5개 — API-payment-03(결제 보고) · API-rule-05(규칙 동의 보고) · API-performance-14(보증금 보고) · API-settlement-08(정산 조기 동의) · API-settlement-05(정산금 지급) — 가 헤더 `X-Step-Up-Token`을 요구하고(없거나 무효면 **403 `WEBAUTHN_STEP_UP_REQUIRED`**), 그 직전에 화면이 읽는 응답 — API-payment-01·02 · API-performance-13 · API-rule-03 · API-settlement-01 — 에 `stepUpRequired: true`가 실린다. 토큰 범위는 **회원 + 동작 + 대상**이다(API-webauthn-03 본문 `{action, targetId}`). **꺼져 있으면 응답에 키가 없고 헤더도 보지 않아 모든 계약이 이 개정 전과 같다.** 새 코드 `WEBAUTHN_STEP_UP_REQUIRED`(403)·`WEBAUTHN_VERIFICATION_FAILED`(400)는 규격 §3.18(같은 날 오전 초안의 `PAYMENT_STEP_UP_REQUIRED`는 배포 전 개명), 새 테이블 `webauthn_credential`은 ERD v6.1, Redis 키 3개는 §0.12. 엔드포인트 72 → **76**(코드 기준 `EndpointInventoryTest`).

---

## 0. 공통 규약

> **9/2 오후 팀 결정 — 세계관 전제**: 이 문서는 **법정화폐(현금·은행·결제 대행)가 존재하지 않는 미래**를 가정한다(결정 v2 §0·P-26). YoYo는 "원(₩) 단위의 디지털 화폐 그 자체"이며 페그·적립 자산·청구권 개념이 없다. 사람들은 이미 지갑에 코인을 갖고 있고, 우리 서비스는 시연을 위해 가입자에게 기본 잔액을 지급한다. 오전(v4) 결정 중 **유지되는 것** — ① 인증·지갑 = Web3Auth 단일(소셜 3종), 자체 이메일 가입·로그인은 **P1** ② 외부 지갑은 **Kaia Wallet만 MVP** — **[v6]** 소유 증명은 Web3Auth 모달 어댑터가 아니라 **자체 챌린지(API-wallet-03·04, P0)** 로 한다(§14-35) ③ 체인·컨트랙트 설정은 프론트 환경변수, API-coin-04는 **P1** ④ 기본 언어 en·통화 USD 고정 ⑤ 코인 티커 **YoYo**(풀네임은 쓰지 않는다) ⑥ **[v6] 양도는 설계에서 삭제**(§14-34 — v5의 "최후순위 P2"를 격상) ⑦ **가스 = Kaia 수수료 대납(fee delegation)** — 사용자 지갑에 KAIA를 넣지 않고, 프론트가 발신자 서명 RLP만 만들어 보고하면 서버(운영지갑 = fee payer)가 대납 서명 후 전송한다.

**화폐가 코인인 미래를 가정한다. 플랫폼은 시연용 코인을 지급할 뿐 발행·상환·준비금의 주체가 아니며, 모든 가치 이동은 지갑 간 온체인 이체다**(결정 v2 §0·§2.2·§12.2-0). 지급 로직은 얇은 `CoinIssuerPort`(`tokenAddress`·`mint`·`totalSupply`) 뒤에 있으며, "인가 발행사 코인·CBDC로 교체 가능"이라는 이야기는 §16.4 Q&A 절에서만 쓴다.

**지갑은 사용자 소유(Web3Auth/Kaia Wallet)이며, 서버는 사용자 키를 보관하지 않는다**(결정 v2 §2.3·P-2). 서버가 가진 키는 **OPERATOR(운영지갑 = fee payer)·MINTER 2개**뿐이고, 이 문서의 어떤 API도 사용자 개인키·니모닉·MPC 샤드를 받거나 반환하지 않는다.

### 0.1 기본

| 항목 | 규칙 |
|------|------|
| base URL | `/api/v1` — 이 문서의 모든 경로는 base를 포함해 전체 경로로 적는다 |
| 리소스 표기 | 복수형 kebab-case, path 변수는 `{performanceId}` 형식(컨벤션 PK 이름과 동일) |
| 인증 | `Authorization: Bearer {accessToken}`. **공개 API**(`GET /api/v1/performances`, `GET /api/v1/performances/{performanceId}`, `GET /api/v1/coin/supply`, `GET /api/v1/coin/rates`, `GET /api/v1/coin/config`, `GET /api/v1/public/settlement/{shareToken}`)는 헤더 **불필요**하며, 각 절의 "권한: GUEST(인증 불필요)"로 명시한다. **[v5]** `GET /api/v1/public/reserve-proof`는 삭제되고 공시는 `GET /api/v1/coin/supply` 하나로 통합됐다 |
| 세션 발급 | 회원 세션(JWT access 30분 / refresh 14일)은 ① Web3Auth idToken 검증(API-member-01) ② 자체 이메일 로그인(API-member-02, P1) 두 경로로만 발급된다. Web3Auth idToken 자체를 `Authorization` 헤더로 쓰지 않는다 |
| 검표 링크 토큰 | 입장 API(API-entry-01·02)는 `Authorization` 대신 **`X-Entry-Token: {entryToken}`** 헤더(또는 `entryToken` 쿼리)로 인증할 수 있다. 토큰은 API-performance-10이 발급하며 해당 공연에만 유효하다 |
| 응답 래퍼 | 성공·실패 구분 없이 `{ code, data, msg }` 3필드 고정. 실패 시 `data`는 예외 없이 `null` |
| 성공 판별 | **`code === "SUCCESS"`**. `status === 200` 하드코딩 금지 — 201·202가 정상 응답으로 존재한다 |
| `msg` | 사용자에게 그대로 노출 가능한 문장. `Accept-Language`에 따라 en/ko로 내려간다(§0.6). 성공은 빈 문자열이 기본. **클라이언트가 `msg`로 분기하지 않는다** |
| 시간 | ISO 8601 오프셋 표기. 서버는 요청자의 `timezone`(회원 프로필) 오프셋으로 내려주고 화면이 KST를 병기한다(P-22). 비회원·미설정은 `+09:00`(KST) |
| 금액 | **YoYo 정수**(JSON number, 서버 `BIGINT`). YoYo는 `decimals=0`, 1 YoYo = 이 세계의 1원이라 소수가 없다. 표시 통화 환산은 §0.5 `display` 객체로만 내려간다 |
| 주소·해시 | 지갑 주소 `0x` + 40 hex = **42자**, 트랜잭션 해시 `0x` + 64 hex = **66자**. 대소문자는 체크섬 표기 그대로 반환 |
| 문자 인코딩 | 요청·응답 모두 UTF-8, `Content-Type: application/json;charset=UTF-8` |

### 0.2 목록(페이지네이션)

| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `page` | query | integer | N | **0-base**, 기본 `0`, 최소 0 |
| `size` | query | integer | N | 기본 `20`, 최소 1, **최대 100**. 초과 시 `COMMON_VALIDATION_FAILED` |
| `sort` | query | string | N | `필드,asc\|desc`. 각 API 절에 허용 필드를 적는다. 미지정 시 절마다 명시한 기본 정렬 |

```json
{
  "code": "SUCCESS",
  "data": {
    "items": [ { "performanceId": 12, "title": "합정 3밴드 합동공연" } ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 37, "hasNext": true }
  },
  "msg": ""
}
```

### 0.3 비동기 트랜잭션 규약 (202) — 운영자 tx

운영자 키(**OPERATOR·MINTER 2개**)로 서버가 보내는 온체인 tx는 즉시 끝나지 않으므로 **`202 Accepted` + 작업 식별자**를 반환하고, 클라이언트는 폴링으로 결과를 확인한다. `code`는 `SUCCESS`다.

```json
{ "code": "SUCCESS", "data": { "jobId": "chain_01J8XQ7M2K", "status": "PENDING", "pollAfterMs": 1500 }, "msg": "" }
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `jobId` | string | 작업 식별자. `chain_*` 하나로 통일한다(`chain_job` 단일 테이블) |
| `status` | string | `PENDING` / `SUBMITTED` / `CONFIRMED` / `FAILED` (결정 v2 §7 `ChainJob.status`) |
| `pollAfterMs` | integer | 다음 폴링까지 권장 대기(ms). 기본 1500, 혼잡 시 서버가 늘려 내려준다 |

폴링 대상은 **`GET /api/v1/chain/jobs/{jobId}`** 하나다(API-chain-01). 202를 내려주는 모든 API — 운영자 tx와 §0.4의 사용자 서명 tx 보고 — 가 같은 경로로 폴링된다. 확정(`CONFIRMED`) 시 `txHash`(66자)와 `explorerUrl`이 채워지고, `FAILED`면 `failureReason`(규격 코드 문자열)과 `retryable`이 채워진다.

- **`tx_type`** — **15종**(결정 v2 §7, **[2026-09-09 — S15P21B204-67]** `CREATE_SHOW`·`START_SALE` 신설, **[2026-09-10 — S15P21B204-70]** `UPDATE_RULES` 신설): `MINT` / `APPROVE` / `PURCHASE` / `REFUND` / `DEPOSIT` / `DEPOSIT_RETURN` / `DEPOSIT_FORFEIT` / `CREATE_SHOW` / `AGREE` / `START_SALE` / `LOCK` / `AGGREGATE` / `RELEASE` / `HALT` / `UPDATE_RULES`. `UPDATE_RULES`는 `createShow` 확정 뒤 규칙이 바뀌었을 때 온체인 `rulesHash`를 갈아 끼우는 운영자 tx다(DB만 바꾸면 `agreeToRules`가 `RulesHashMismatch`로 revert 한다). v4의 소각·금고 왕복 3종은 삭제됐고 `MINT`는 **시연용 지급**을 뜻한다. `CREATE_SHOW`는 온체인 공연 등록, `START_SALE`은 판매 개시다. `LOCK`은 이제 **정산 잠금(API-settlement-03) 전용**이며, 종전엔 판매 시작과 겸용이라 확정 분기가 항상 판매 시작으로 해석돼 정산 잠금 job이 진행되지 않는 버그가 있었다.
- **`signer_type`** — 모든 `chain_job`은 `signerType`이 `OPERATOR`(서버 키 서명·전송) 또는 `USER`(사용자 지갑이 서명하고 서버가 대납 서명·전송)다. `USER` job은 §0.4의 검증 절차를 따른다.
- **`fee_delegated`** — **[v5] `USER` job은 항상 `true`**다. 사용자 지갑의 KAIA 잔액은 0이며 화면에 가스 개념을 노출하지 않는다(P-3·결정 v1 §14-4).
- **`issuer_type`** — 지급 어댑터 감사 컬럼. MVP는 항상 `MOCK`(`MockIssuer`). `EXTERNAL`은 P2 예약값이며 분기 로직은 만들지 않는다(결정 v2 §2.6).
- **재시도**: OPERATOR job은 큐에서 **최대 3회** 자동 재시도하고(비기능 REL-09), 이후 지수 백오프로 시스템이 연장 재시도한다. USER job은 서버가 발신자 서명을 다시 만들 수 없으므로 자동 재시도 대상이 아니고 **receipt 재조회**만 반복한다(시한 120초가 지나도 노드가 tx 를 알면 `SUBMITTED` 로 두고 계속 조회한다. 노드가 tx 를 모르는 상태가 다시 120초 이어질 때만 `CHAIN_TX_TIMEOUT` 으로 `FAILED`. 전송을 마친 OPERATOR job 의 receipt 대기도 같은 규칙이다 — [2026-09-14 S15P21B204-76] 뒤늦게 채굴되는 tx 를 실패로 닫지 않는다).
- **온체인 반영 목표**: Kaia Kairos 블록 시간이 약 1초라 확정까지 수 초다. 예매 확정 응답은 tx 확정을 기다리지 않으며 온체인 반영 ≤ 60초(PERF-04).
- **nonce**: OPERATOR·MINTER 각 지갑의 tx는 지갑별 단일 nonce 직렬 큐로 처리한다. 큐 직렬화 실패는 `CHAIN_NONCE_CONFLICT`.

### 0.4 사용자 서명 tx 규약 (prepare → 서명 → signed-tx → 대납 전송 → receipt 검증)

결제(`approve`+`purchase`)·보증금(`deposit`)·규칙 동의(`agreeToRules`)는 **사용자 지갑이 서명한다**(결정 v2 §2.5·P-18). 서버는 사용자 키를 갖고 있지 않으므로 tx를 대신 만들 수 없고, 대신 **플랫폼이 tx를 발의하고 사용자가 발신자 서명만 하며, 서버가 수수료를 대납해 전송한다**. 3단계 고정 패턴이다.

**① `POST …/prepare` → `200 OK` + 서명 파라미터**

서버가 서명해야 할 tx를 구성해 내려준다. 프론트는 이 값을 Web3Auth 내장 프로바이더(키 + `@kaiachain/ethers-ext`) 또는 연결된 Kaia Wallet에 넘겨 **Kaia `FeeDelegatedSmartContractExecution` 타입의 발신자 서명**을 받는다. 사용자가 지갑 앱에서 주소로 직접 송금하는 흐름은 **없다**.

```json
{
  "code": "SUCCESS",
  "data": {
    "signRequests": [
      {
        "kind": "APPROVE",
        "required": true,
        "txType": "FEE_DELEGATED_SMART_CONTRACT_EXECUTION",
        "to": "0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736",
        "data": "0x095ea7b3000000000000000000000000a1b2c3d4e5f60718293a4b5c6d7e8f9012345678000000000000000000000000000000000000000000000000000000000000c350",
        "value": "0x0",
        "chainId": "0x3e9",
        "gas": "0x11170",
        "feePayer": "0x9f8e7d6c5b4a39281706f5e4d3c2b1a098765432",
        "summary": { "title": "Allow ticket payment", "amount": 50000, "currency": "KRW", "spender": "RevenueSplitter", "spenderAddress": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678" }
      },
      {
        "kind": "PURCHASE",
        "required": true,
        "txType": "FEE_DELEGATED_SMART_CONTRACT_EXECUTION",
        "to": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
        "data": "0x3d7403a3...",
        "value": "0x0",
        "chainId": "0x3e9",
        "gas": "0x30d40",
        "feePayer": "0x9f8e7d6c5b4a39281706f5e4d3c2b1a098765432",
        "summary": { "title": "Confirm 50,000 YoYo payment", "amount": 50000, "currency": "KRW", "performanceId": 12, "orderRef": "0x6f7264657231...", "teamIndex": 1 }
      }
    ],
    "expiresAt": "2026-09-10T20:15:00+09:00"
  },
  "msg": ""
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `signRequests` | array | 서명해야 할 tx 목록. **배열 순서대로** 서명·보고한다 |
| `signRequests[].kind` | string | **[v5] `APPROVE` / `PURCHASE` / `DEPOSIT` / `AGREE` 4종.** `chain_job.tx_type`과 같은 값이며 v4의 `TREASURY_IN`은 삭제됐다 |
| `signRequests[].required` | boolean | `false`면 생략 가능. `APPROVE`는 현재 allowance가 충분하면 `false`로 내려온다(결정 v1 §2.5 "①의 allowance가 이미 충분하면 ①을 생략") |
| `txType` | string | **[v5]** 항상 `FEE_DELEGATED_SMART_CONTRACT_EXECUTION`. 프론트는 이 타입으로 발신자 서명만 만든다 |
| `to`·`data`·`value` | string(hex) | 컨트랙트 주소·calldata·전송 네이티브 값. `value`는 항상 `"0x0"`(YoYo는 ERC-20이다) |
| `chainId` | string(hex) | 항상 `"0x3e9"`(Kaia Kairos, 1001). 프론트는 지갑의 현재 체인이 다르면 전환을 먼저 요청한다 |
| `gas` | string(hex) | 서버 추정 가스 한도 **힌트**. 수수료는 `feePayer`가 전액 부담한다 |
| `feePayer` | string | **[v5]** 대납 서명·전송을 수행하는 운영지갑 주소. 프론트가 서명 요약 화면에 "Fee paid by 서비스"로 표기하는 근거이며, 서명 대상 tx의 필드가 아니라 표시·검증용이다 |
| `summary` | object | **서명 팝업 직전 사람이 읽을 화면**에 그대로 쓰는 요약(결정 v2 §2.3 "서명 전 tx 요약 표시"). `title`은 `Accept-Language`에 맞춰 내려온다 |
| `expiresAt` | string | 서명 파라미터 유효 시각. 주문의 15분 만료, 규칙 해시 변경 등에 연동된다 |

**[v5] `gasStatus`는 삭제됐다.** 사용자 지갑에 KAIA를 넣지 않으므로 가스 잔액을 조회·안내할 대상이 없고, 응답 어디에도 가스 필드가 없다.

**② 프론트가 발신자 서명** — 지갑이 반환한 **발신자 서명 RLP**(`senderSignedRlp`, `0x`로 시작하는 hex 문자열)를 모은다. 사용자가 팝업을 닫으면(거부) 서버에 아무것도 보고하지 않는다. 주문은 `PENDING_PAYMENT`로 남아 15분 뒤 만료되고, **잔액은 그대로 남는다**(결정 v2 §2.5).

**③ `POST …/signed-tx {kind, senderSignedRlp}` → `202 Accepted` + `jobId`(`signerType=USER`, `feeDelegated=true`)**

| 필드 | 타입 | 필수 | 설명 |
|------|------|:----:|------|
| `kind` | string | Y | `APPROVE` / `PURCHASE` / `DEPOSIT` / `AGREE` — ①에서 받은 `signRequests[].kind` 그대로 |
| `senderSignedRlp` | string | Y | 사용자 지갑이 만든 **발신자 서명 RLP**. `0x` + hex, 최대 8KB. 서버는 이 값을 `chain_job.sender_signed_rlp`에 저장한다 |

서버 처리 순서는 5단계다.

1. **RLP 파싱·발신자 검증** — RLP를 디코드해 `txType`·`to`·`data`·`value`·`nonce`·`chainId`와 복구된 발신자 주소를 얻고, ①에서 발급한 값 및 요청자의 등록 지갑 주소(`wallet.address`)와 대조한다.
2. **대납 서명** — 운영지갑(fee payer) 키로 `feePayer` 서명을 붙인다. 이 시점에 `chain_job`을 `PENDING`으로 생성한다(`signer_type=USER`, `fee_delegated=true`, `fee_payer_address`·`sender_signed_rlp` 기록).
3. **전송** — Kaia Kairos에 전송하고 `txHash`를 받아 `SUBMITTED`로 전이한다.
4. **receipt 검증** — 확정 후 아래 5항목을 확인한다.
5. **상태 전이** — 전부 통과하면 도메인 상태를 전이하고(`PAID`·`deposit_status=PAID`·`AGREED`), 하나라도 어긋나면 전이하지 않고 `chain_job`을 `FAILED`로 고정한다.

**receipt 검증 5항목**

1. receipt `status == 1` (revert 아님)
2. `to` == 서버가 내려준 컨트랙트 주소
3. `from` == 요청자의 등록 지갑 주소(`wallet.address`)
4. 기대 이벤트가 로그에 존재 — `Purchased(showId, orderRef, buyer, teamIndex, amount, quantity)` / `DepositPaid` / `RulesAgreed` / `Approval`
5. 이벤트 인자가 서버 상태와 일치 — `orderRef`·`amount`·`teamIndex`·`quantity`·`showId`·`rulesHash`

응답 코드는 **불일치 계열**이며, 규격 v3에 전용 코드가 없어 본문에서는 `PAYMENT_AMOUNT_MISMATCH`(409)로 대체했다 — 전용 코드 `PAYMENT_TX_MISMATCH`는 §16.1 신설 제안이다. 같은 `senderSignedRlp`를 두 번 보고하면 **최초 `jobId`를 재생**하고 부작용을 재실행하지 않는다(RLP 해시가 자연 멱등키다).

| 단계 | 실패 | 서버 처리 |
|---|---|---|
| ① prepare | 잔액·재고·상태 불충족 | 서명 파라미터를 주지 않고 4xx |
| ② 서명 | 사용자 거부·지갑 오류 | 보고 없음 → 주문 15분 만료 → `CANCELLED`. **잔액은 그대로 남는다** |
| ③ RLP 검증 | 발신자·`to`·`data` 불일치 | 대납 서명하지 않고 4xx(`PAYMENT_AMOUNT_MISMATCH` 대체). `chain_job`을 만들지 않는다 |
| ③ 전송 | 노드 오류·대납 잔액 부족 | `chain_job` `FAILED` + `CHAIN_GAS_INSUFFICIENT`(운영지갑 KAIA 부족은 알림 대상) |
| ④ 검증 | tx revert(재고·잠금·allowance) | receipt `status=0` 확인 → `FAILED` + 사유 표시 |
| ④ 검증 | 이벤트·인자 불일치 | 상태 전이 없음, `FAILED` 고정, 운영자 알림 |

**가스** — 사용자 지갑의 KAIA 잔액은 **항상 0이며 그래도 된다.** 수수료는 운영지갑이 전액 대납하고, 사용자 화면에 가스·수수료 개념을 노출하지 않는다. 허용 문구는 "Confirm in your wallet" 한 줄이다. 운영지갑 KAIA 잔액은 시연 전 사전 확보 대상이며 부족은 `CHAIN_GAS_INSUFFICIENT`(500, 운영자 알림)다.

### 0.5 금액 표기와 `display` 객체

금액 필드는 **YoYo 정수** 하나가 원본이고, 표시 통화 환산은 같은 자리의 `display` 객체로만 내려간다(P-22·P-17).

```json
{ "amount": 15000, "currency": "KRW", "display": { "currency": "USD", "approx": 11.11, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" } }
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `amount` | integer | **원본.** YoYo 정수. 모든 계산·정산·컨트랙트 인자가 이 값을 쓴다 |
| `currency` | string | 항상 `"KRW"`. **식별자일 뿐 화면에 노출하지 않는다** — 화면 표기는 `YoYo`다 |
| `display.currency` | string | 회원의 `display_currency`(기본 `USD`). `KRW`면 `display`를 **생략**한다 |
| `display.approx` | number | 환산 근사값(소수 2자리). **표시 전용** — 요청 본문으로 되돌려 보낼 수 없다 |
| `display.rate` | number | 환산에 쓴 표시 환율(`1 display.currency = rate KRW`). 출처는 `exchange_rate`(API-coin-02·03) |
| `display.asOf` | string | 그 환율의 `effective_from`. 화면 툴팁에 "as of …"로 노출한다 |

- **환율은 표시에만 쓴다.** 정산·분배·컨트랙트 인자·티켓 가격·**지급 금액**에는 절대 쓰지 않는다(P-17). 서버는 요청 본문의 `display*` 필드를 **전부 무시**하며, 금액 검증은 `amount`만 본다.
- 목록 응답에서 항목마다 `display`를 반복하지 않고, `data.rate`(`{ currency, rate, asOf }`) 하나를 응답 루트에 담고 항목에는 `amount`만 두는 축약형을 허용한다. 각 절에 어느 형태인지 적었다.
- `display_currency`가 `KRW`이거나 환율 레코드가 없으면 `display`를 내리지 않는다. 화면은 YoYo 값만 표시한다(환율 미등록은 오류가 아니다).
- **화면 표기(2026-09-24, 결정 v2 §14-42)** — 금액은 `10,000 YoYo`(천 단위 쉼표, 숫자 뒤 공백 + `YoYo`, ko·en 동일)로 쓰고 ₩ 기호·`KRW`·금액 뒤 "원"은 쓰지 않는다. `currency`·`displayCurrency` 값 `KRW`, 통화쌍 `USD_KRW`는 API 식별자라 바꾸지 않는다(화면 §5.4). 서버 `msg`·`usageNotice` 문구에 남은 ₩·"Korean won" 표기는 백엔드 후속 작업이며, 이 문서의 `msg` 예시는 현 구현값이다.
- **이 문서의 예시는 `USD_KRW = 1350.0`**[권] P-17 확정값으로 통일했다.

### 0.6 언어·로케일 (`Accept-Language`)

| 항목 | 규칙 |
|------|------|
| 헤더 | `Accept-Language: en` (**기본**) / `ko`. 그 밖의 값은 `en`으로 폴백한다 |
| 우선순위 | 로그인 회원은 **프로필 `locale`이 헤더보다 우선**한다(C-04에서 바꾼 값이 곧바로 반영되게). 비회원은 헤더만 본다 |
| 적용 대상 | `msg` 문장, `signRequests[].summary.title`, `simulationNotice`·`disclosure` 같은 고지 문구, 실패 사유 사용자 문장 |
| 적용 제외 | `code`(문자열 enum), 상태값, 필드명, 팀·공연 이름처럼 사용자가 입력한 데이터, `invariants[].note`(**[2026-09-15 — S15P21B204-90 D-37]** 발행량 공시 불변식 행의 판정 사유. 서버가 **한국어 한 줄로 고정**해 내려보내며 로케일에 따라 바뀌지 않는다. `MessageSource` 이관은 W5 이후 별건) |
| 관객 화면 용어 | 블록체인 용어는 노출하지 않는다. 허용 예외는 공개 검증(V-01)·발행량 공시(V-02)와 서명 단계의 `"Confirm in your wallet"` 한 줄이다 |
| 고지 문구 | **[v5]** `simulationNotice`의 기본 문장은 "화폐가 코인인 미래를 가정한 테스트넷 시연. 실가상자산·실화폐 없음"(en: "A testnet demo set in a future where money is a coin. No real assets or currency.")이다(결정 v2 §2.1) |

### 0.7 체인·컨트랙트 노출 규칙

| 항목 | 값·규칙 |
|------|------|
| 네트워크 | `network: "kaia-kairos"`, `chainId: 1001`, `chainIdHex: "0x3e9"`. Besu 백업 프로필은 `network: "besu-private"`로만 바뀌고 필드 구조는 같다 |
| RPC | `https://public-en-kairos.node.kaia.io` — API-coin-04(P1)만 내려준다(프론트 Web3Auth 초기화용) |
| 익스플로러 | `explorerBaseUrl: "https://kairos.kaiascan.io"`. tx는 `{base}/tx/{txHash}`, 주소는 `{base}/address/{address}`. 서버가 `explorerUrl`을 **완성된 절대 URL로** 내려주고 프론트가 조립하지 않는다 |
| 컨트랙트 주소 | **[v5] `tokenAddress`(YoYo) · `splitterAddress`(RevenueSplitter) 2개만** 노출한다. v4의 `treasuryAddress`는 삭제됐다 |
| 노출 화면 | 공연자·검증·관리자 화면(P-02·P-08·V-01·V-02·M-03)과 지갑 화면(A-13·C-05)에만. **관객 예매·결제 화면에는 주소·해시를 노출하지 않는다**(P-22) |
| 비노출 | OPERATOR(fee payer)·MINTER 키와 서버 서명자 주소는 어떤 응답에도 담지 않는다. **예외 1개** — §0.4 `signRequests[].feePayer`는 "수수료를 서비스가 낸다"는 사실을 서명 화면에서 확인해야 하므로 주소를 노출한다 |

### 0.8 멱등키

| 항목 | 규칙 |
|------|------|
| 헤더 | `Idempotency-Key: {UUIDv4}` |
| **필수** 대상 | **[v5] 6개** — 주문 생성(API-ticket-01) · 결제 시작(API-payment-01) · 개별 취소·환불(API-refund-02) · 공연 취소(API-performance-12) · release 실행(API-settlement-05) · **시연용 코인 지급(API-coin-07)**. v4의 두 항목은 해당 API가 삭제돼 빠지고, 지급이 새로 들어왔다 |
| `signed-tx` 계열 | 헤더를 요구하지 않는다. **`senderSignedRlp` 자체가 자연 멱등키**다(같은 RLP 재보고 = 최초 `jobId` 재생) |
| 보존 | 키 + 요청 해시를 **24시간** 저장. 같은 키·같은 요청 재호출 시 **최초 응답을 그대로 재생**하며 부작용을 재실행하지 않는다(REL-04) |
| 충돌 | 같은 키에 다른 요청 본문이 오면 `409 COMMON_CONFLICT` |
| 누락 | 필수 대상에서 헤더가 없으면 `400 COMMON_VALIDATION_FAILED` |
| 온체인 연계 | **[v5]** `chain_job.idempotency_key`가 `YoYo.mint(..., bytes32 grantRef)`의 `grantRef`가 된다. 기본 지급은 `grant:signup:{memberId}`, 관리자 지급은 요청 헤더의 UUID를 그대로 쓴다. 재시도해도 온체인 참조가 바뀌지 않으므로 **같은 회원에게 기본 지급이 두 번 나가지 않는다**(결정 v2 §3.0). **[v6]** 트리거 시점은 **지갑 등록 성공 직후**로 옮겼고(§14-35) 키 이름은 유지한다 — 이 값이 온체인 `grantRef`로 그대로 들어가기 때문이다 |

### 0.9 호출 제한 (rate limit)

로그인(API-member-01·02)·QR 검증은 **IP당 60회/분**을 넘으면 `429 COMMON_TOO_MANY_REQUESTS`(SEC-10). 예매 매크로 차단 룰도 같은 코드를 쓴다. 지갑 챌린지 발급(API-wallet-03, **[v6] P0**)은 **회원당 10회/분**, **시연용 코인 지급(API-coin-07)은 관리자당 30회/분**으로 별도 한도를 둔다. 초과 시 `Retry-After` 헤더(초)를 함께 내린다.

### 0.10 공통 에러

아래는 모든 엔드포인트에 공통으로 적용되며, 각 절의 에러 표에서는 **그 API에 고유하거나 발생 조건이 특별한 것만** 다시 적는다.

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 요청 body·쿼리 파라미터가 Bean Validation 규칙 위반 (SEC-12) |
| 401 | `COMMON_UNAUTHORIZED` | 인증이 필요한 API에 `Authorization` 헤더가 없음 |
| 401 | `AUTH_TOKEN_EXPIRED` | access token 만료. 클라이언트는 **이 코드에서만** 토큰 재발급 후 원요청 재시도 |
| 401 | `AUTH_TOKEN_INVALID` | 서명 불일치·위조 토큰. 재발급 시도 없이 즉시 로그아웃. Web3Auth idToken 검증 실패(JWKS·aud·exp·nonce)도 이 코드로 대체한다 |
| 403 | `COMMON_FORBIDDEN` | 인증됐으나 권한 없음 (도메인 전용 코드가 없을 때만) |
| 404 | `COMMON_NOT_FOUND` | 리소스 없음 (도메인 전용 코드가 없을 때만) |
| 409 | `COMMON_CONFLICT` | 동시 요청으로 인한 일반적 상태 충돌, 멱등키 본문 불일치, **[v5] 지갑 YoYo 잔액 부족**(전용 코드 `PAYMENT_INSUFFICIENT_BALANCE` 재정의는 §16.1) |
| 429 | `COMMON_TOO_MANY_REQUESTS` | 호출 한도 초과 |
| 500 | `COMMON_INTERNAL_ERROR` | 처리되지 않은 서버 예외. 상세는 로그에만 |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | 체인 노드·Web3Auth JWKS 오류이며 도메인 전용 코드가 없는 경우 |

**보안 규칙(SEC-09)** — 스택트레이스·SQL·체인 revert 원문은 `msg`에 넣지 않는다. 사용자 지갑 주소는 소유자 본인·참여팀·검증 화면에만 노출하고, 다른 회원의 주소는 어떤 목록에도 담지 않는다.

### 0.11 도메인 절 목차 (14개) **[v7]**

| 절 | 도메인 | 엔드포인트 | 코드 접두 |
|----|--------|-----------|-----------|
| 1 | `member` 회원·인증 | API-member-01·03~06 (02·08은 P1, 07은 **v5 삭제**) | `AUTH_*` |
| 2 | `team` 공연팀 | API-team-01~04 · **06(팀 검색, 2026-09-26 신설)** (05·06은 v3 삭제 — 06 번호는 팀 검색이 이어받음, 07은 **v5 삭제**) | `TEAM_*` |
| 3 | `wallet` 지갑 | **[v6]** API-wallet-01·02·03·04 (05는 **삭제**) | `WALLET_*` |
| 4 | `performance` 공연 | API-performance-01~14 | `PERFORMANCE_*` |
| 5 | `rule` 정산 규칙 | API-rule-01~05 | `RULE_*` |
| 6 | `ticket` 예매·티켓 | API-ticket-01~06 | `TICKET_*` |
| 7 | `payment` 코인 결제 | API-payment-01~03 | `PAYMENT_*` |
| 8 | `coin` YoYo (+ `chain` 공통 폴링) | API-coin-01·02·03·**07·08** (04~06은 P1), API-chain-01 | `COIN_*`, `CHAIN_*` |
| 9 | `refund` 취소·환불 | API-refund-01·02 | `REFUND_*` |
| 10 | `entry` 입장 | API-entry-01·02 | `ENTRY_*` |
| 11 | `settlement` 정산 | API-settlement-01~07 | `SETTLEMENT_*` |
| 12 | `verify` 공개 검증 | API-verify-01 (02는 **v5 삭제 → API-coin-01 통합**) | `CHAIN_*`, `COIN_*` |
| 13 | `admin` 관리자 | API-admin-06·09 (01~05·07·08은 P1) | `COMMON_*` |
| 14 | `recommendation` 추천 | API-recommendation-01 | `RECOMMENDATION_*` |
| 7.W | `webauthn` 본인 확인(step-up) **[2026-09-24]** | API-webauthn-01~04 (P1 — 스위치 `STEP_UP_ENABLED` 기본 off) | `WEBAUTHN_*` (보호 동작 가드도 `WEBAUTHN_STEP_UP_REQUIRED`) |

**[v5] 삭제된 장 2개** — v4 §8 `charge` 충전(API-charge-01~04)과 v4 §14 `withdraw` 출금(API-withdraw-01~04)은 장 전체가 사라졌다. 법정화폐가 존재하지 않는 세계이므로 코인을 사들이는 입구와 코인을 현금으로 바꾸는 출구가 둘 다 없다(결정 v2 §0 전제 2·§5). 규격 신설 제안 `CHARGE_*`·`WITHDRAW_*`도 함께 철회했다(§16.1).

**[v6] 삭제된 장 1개** — v5 §10 `transfer` 양도(API-transfer-01~04)가 장째로 사라져 도메인이 14 → **13개**가 됐다(결정 v2 §14-34). 뒤 도메인 장 번호를 하나씩 당겨 도메인 장은 **§1~§13**이고, `TRANSFER_*` 코드는 발생 경로가 0이 됐다(§16.1). §14는 결번이었다 — §15~§17(예약 경로·규격 신설 제안·검수표)은 다른 문서·이슈에서 이미 참조되고 있어 번호를 당기지 않았다.

**[v7] §14 사용 시작** — 결번이던 §14를 `recommendation` 도메인이 채워 도메인이 13 → **14개**가 됐다(설계: `docs/superpowers/specs/2026-09-22-recommendation-design.md` §5 D-R05 — 새 번호로 목차를 재배치하는 대신 결번 자리를 재사용해 문서 diff를 최소화했다). §15~§17은 그대로 고정이다.

**[2026-09-24] `webauthn`은 장 번호를 새로 받지 않고 §7 payment의 부속 절 §7.W로 둔다** — 처음 결제에 붙여 만들었고(오후에 공연자 동작 4개로 범위를 넓혔다), §15~§17 고정 번호를 흔들지 않기 위해서다. 코드 패키지는 `com.ssafy.b204.webauthn`, 경로 접두는 `/api/v1/webauthn`이다.

`chain` 도메인은 결정 문서 v2 §5의 도메인 목록에 없고 API-chain-01 하나뿐이라 §8 `coin` 절 끝에 "공통 폴링" 항목으로 둔다. 브랜치 도메인은 `payment`가 그대로, `coin`이 `contract`다(결정 v2 §5).

### 0.12 서버 측 저장소(Redis) 키 규약 **[v6 신설]**

서버가 **테이블 없이 Redis에만** 두는 상태를 한자리에 모았다(결정 v2 §8·§14-33·§14-35). 본문 각 API 절에도 같은 키가 지역 문맥으로 적혀 있고, 이 표가 규약의 정본이다. **여기 있는 것은 ERD에 테이블·컬럼으로 존재하지 않는다.**

| 키 | 자료형 | 값 | TTL | 쓰는 곳 |
|----|--------|----|-----|---------|
| `auth:refresh:{jti}` | string | 리프레시 토큰 해시 | **14일** | API-member-01·02·03·04 (발급·회전·폐기) |
| `auth:refresh:member:{memberId}` | set | 그 회원의 유효 `jti` 집합 | — (회원 삭제·전체 로그아웃 시 정리) | 전체 로그아웃·재사용 감지, 관리자 회원 정지(API-admin-03, P1) |
| `wallet:challenge:{memberId}` | string(JSON) | `{nonce, address, message, issuedAt}` | **300초** | API-wallet-03 발급 → `POST /api/v1/wallets` 검증 후 즉시 삭제(1회용) |
| `wallet:balance` | hash | field = `walletId`, value = `"{balance}\|{checkedAtEpochMs}"` | **없음** | API-wallet-01 조회, 지갑이 관여한 `chain_job` 확정. **[2026-09-15 — S15P21B204-88·-90]** 발행량 대사(API-coin-01)는 이 캐시를 **읽지 않는다** — 화면 표시 전용 |
| 입장 원타임 키(QR) | string | `SETNX` 마커 | QR 유효 구간(60초) | API-entry-01 중복 입장 차단(SEC-06·REL-07) |
| `webauthn:challenge:{memberId}:{purpose}` **[2026-09-24]** | string | base64url 챌린지(32바이트). `purpose` = `registration`·`authentication`. 인증 챌린지는 뒤에 `\|{action}\|{targetId}`(API-webauthn-03 본문)를 붙여 저장한다 | **300초** | API-webauthn-01 → 02, 03 → 04. 검증 직전 `GETDEL`(1회용 — 검증이 실패해도 재사용 불가) |
| `webauthn:stepup:{token}` **[2026-09-24]** | string | `{memberId}\|{action}\|{targetId}` — 발급 때 정해진 범위 | **120초** | API-webauthn-04 발급 → 보호 동작 5개가 `GETDEL`로 소비(1회용). 범위가 요청과 다르면 거부 |
| `webauthn:stepup:scope:{memberId}:{action}:{targetId}` **[2026-09-24]** | string | 그 범위에 소비된 step-up 토큰 | **120초**(소비 시점부터) | 보호 동작 5개. 한 동작이 보고를 여러 번 하는 경우(결제 `APPROVE` 1 + `PURCHASE` × N, 보증금 `APPROVE` → `DEPOSIT`) 첫 보고가 토큰을 소비하며 범위에 묶고, 같은 범위의 이어지는 보고는 같은 토큰으로 통과한다. `action` = `PAYMENT`(대상 = 주문 그룹 id) · `RULE_AGREE` · `DEPOSIT` · `SETTLEMENT_APPROVE` · `SETTLEMENT_RELEASE`(대상 = 공연 id) |

**`wallet:balance` 규칙 (§B′ 결정 — 잔액 캐시는 Redis에만 둔다)**

- **TTL이 없다.** 노드 장애 시에도 마지막 값을 보여줘야 하기 때문이다(AVAIL-02). 대신 value의 `checkedAt`이 **10초**보다 낡으면 조회 시 노드를 다시 읽고 갱신한다.
- **갱신 시점은 둘이다.** ① API-wallet-01이 노드를 읽었을 때 ② **지갑이 관여한 `chain_job`이 `CONFIRMED`될 때** — 발신 지갑(결제 `PURCHASE`·보증금 `DEPOSIT`)과 수신 지갑(환불 `REFUND`·정산 `RELEASE`·보증금 반환 `DEPOSIT_RETURN`·지급 `MINT`) 모두를 갱신한다. 결제 직후 에스크로만 늘고 구매자 캐시가 그대로면 지갑 화면(A-13)이 낡은 잔액을 보여준다. **[2026-09-15 — S15P21B204-88]** 발행량 대사는 이 캐시를 읽지 않는다(아래).
- **원장은 언제나 체인이다.** Redis가 비면 다음 조회에서 체인 재조회로 재구축되며 데이터 손실이 아니다. DB에 잔액 사본 컬럼을 두지 않는다(ERD `wallet`에서 삭제됨).
- ~~API-coin-01의 "Σ지갑 잔액"은 `HVALS wallet:balance` 합산(1분 캐시)으로 낸다.~~ **[2026-09-15 — S15P21B204-88·-90]** **등록(`LINKED`) 지갑을 순회해 노드 `YoYo.balanceOf`를 직접 합산**한다(30초 주기 대사가 계산, 공시는 1분 캐시). 화면 캐시는 조회된 지갑만 있어 합계가 작게 나왔다(9/10 D-44). 지갑 하나라도 못 읽으면 불변식 4는 **미평가**(`expected`·`actual` null).


---
## 1. member — 회원·인증

**인증 전제(P-1)** — 서비스 로그인은 **Web3Auth 소셜 로그인 3종(구글·페이스북·카카오) 동결**이다. 백엔드는 Web3Auth `idToken`을 JWKS로 검증해 자체 세션(JWT **access 30분 / refresh 14일**, Redis 저장·회전, SEC-02 — §0.12)을 발급한다. 최초 로그인이 곧 가입이다. 자체 이메일+비밀번호는 **보조**로만 남는다(API-member-02·08, **P1**).

**[v6] 로그인은 신원만 만든다(결정 v2 §14-35).** v5까지는 같은 트랜잭션에서 지갑(`provider=WEB3AUTH`)까지 등록했지만, v6에서는 **지갑 등록이 로그인 후 첫 1회 별도 단계**다(§3 `POST /api/v1/wallets` · 화면 C-05). 소셜 로그인 회원도, P1 이메일 가입 회원도 같은 한 화면·한 엔드포인트를 지난다 — 로그인 화면에서 "지갑이 있는 사람/없는 사람"을 미리 갈라 고르게 하지 않는다.

**[v6] 기본 잔액 지급은 "지갑 등록 시"다(P-27)** — 화폐가 코인인 세계에서 사람들은 이미 지갑에 돈을 갖고 있다. 우리 서비스는 그 세계를 시연하기 위해 **회원에게 100,000 YoYo를 1회 지급**한다(결정 v2 §3.0·미결 안건 29). 지급은 `MINT` `chain_job` 한 건이며 멱등키는 `grant:signup:{memberId}`다 — **트리거 시점만 v6에서 지갑 등록 성공 직후로 옮겼고 키 이름은 유지한다**(§14-35). 키가 회원 단위이므로 재로그인·재등록에서 다시 지급되지 않는다.

**회원 속성** — `countryCode`(ISO 3166-1 alpha-2, 자기 선언) · `locale`(**en 기본**·ko) · `displayCurrency`(**USD 기본**) · `timezone`(IANA) · `authProvider`(`GOOGLE`/`FACEBOOK`/`KAKAO`, `LOCAL`은 P1 예약) · `web3authVerifierId`. 외국인 가입에 국내 본인인증·휴대폰을 요구하지 않는다(P-23). **[v5] 회원의 법정화폐 수령 수단 개념은 존재하지 않는다** — 환불은 지갑으로 돌아오고(P-20), v4의 API-member-07은 삭제됐다(장 말미).

### API-member-01 Web3Auth 로그인/가입 **[v6 변경 — 지갑 등록·기본 지급 분리]**
`POST /api/v1/auth/web3auth` · 권한: GUEST(인증 불필요) · 우선: P0 · 연관 화면: `C-01 로그인` · 연관 기능: `F-member-01 Web3Auth 로그인·가입`

## 요구사항
- 프론트가 Web3Auth SDK로 소셜 로그인(구글·페이스북·카카오)을 마치고 얻은 `idToken`과 **MPC 지갑 주소**를 보낸다. 서버는 idToken을 **JWKS로 검증**(서명·`aud`·`exp`·`iss`·`nonce`)하고, 회원이 없으면 만들고 있으면 조회해 세션 JWT를 발급한다. **최초 로그인 = 가입**이다.
- **[v6] 이 API는 신원만 만든다.** 지갑을 등록하지 않고 기본 지급도 걸지 않는다. 지갑 등록은 로그인 후 첫 1회 별도 단계(`POST /api/v1/wallets` · C-05)이며, 기본 지급은 그 등록 성공 직후에 트리거된다(결정 v2 §14-35). 요청의 `address`는 **idToken 지갑 클레임과 대조하는 검증용**으로만 쓰고 저장하지 않는다.
- **서버는 사용자 개인키·니모닉·MPC 샤드를 받지도, 저장하지도 않는다.** 요청 본문에 그런 필드가 오면 `COMMON_VALIDATION_FAILED`로 거부한다(알 수 없는 필드 거부).
- **[v6] 응답의 `wallet`은 nullable이다.** 아직 지갑을 등록하지 않은 회원이면 `null`이고, 클라이언트는 곧바로 지갑 등록 온보딩(C-05 `/onboarding/wallet`)으로 보낸다. 이 규칙은 소셜·이메일(P1) 구분 없이 **전원 공통**이다.
- **[v5] 가스 지원 job은 없다.** 수수료 대납을 채택했으므로 사용자 지갑의 KAIA 잔액은 0으로 두고, v4의 `gasFundingJobId` 필드는 삭제됐다(§0.4).
- **[2026-09-15 · S15P21B204-105]** 신규 회원은 `countryCode`·이용약관 동의(`termsAgreed`)·개인정보 처리방침 동의(`privacyAgreed`)가 **전부 필수**다. 하나라도 없으면 `COMMON_VALIDATION_FAILED`(400)이고 회원을 만들지 않는다 — **아래 4xx 표가 정본이다.**
- 근거: ERD `member.country_code`가 NOT NULL이라 국가 없이 회원 행을 만들 수 없고, 기본 국가를 지어내면 P-23 자기 선언이 무의미해진다. 약관 동의도 나중에 받는 대신 가입 시점에 받는 편이 안전하다.
- OAuth 전에는 신규·기존을 구분할 수 없으므로 **C-01이 전원에게** 이 셋을 먼저 받는다. 기존 회원 로그인이면 서버가 쓰지 않는다(회원 정보 변경은 API-member-06 · C-04).
- `profileCompletionRequired`는 **항상 `false`**다. v6이 제안했던 "국가 없이 가입 후 보조 폼" 경로를 쓰지 않기로 해 예약값으로만 남는다(응답 required 필드라 삭제하지 않는다).
- 이미 같은 소셜 계정(`authProvider` + `web3authVerifierId`)으로 가입돼 있으면 회원을 새로 만들지 않고 로그인 처리한다. Web3Auth MPC는 같은 소셜 계정에 같은 주소를 재현하므로, **[v6] 이미 지갑을 등록한 회원**이라면 요청 `address`가 등록된 주소와 일치해야 하며 불일치는 `COMMON_CONFLICT`다(지갑 교체는 MVP 관리자 처리, 미결 안건 14).
- IP당 60회/분 호출 제한 대상이다(SEC-10).

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Accept-Language: en` (기본) / `ko`

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `idToken` | string | Y | JWT, 최대 4096자 | Web3Auth가 발급한 idToken. 서버가 JWKS로 검증 |
| `address` | string | Y | `0x` + 40 hex(42자) | Web3Auth MPC 지갑 주소. idToken의 지갑 클레임과 일치해야 함 |
| `provider` | string | Y | `GOOGLE` / `FACEBOOK` / `KAKAO` | 소셜 로그인 제공자 — `member.auth_provider`에 저장 |
| `countryCode` | string | 조건부 | ISO 3166-1 alpha-2, 신규 회원 필수 | 거주·국적 자기 선언 |
| `locale` | string | N | `en`(기본) / `ko` | 미지정 시 `Accept-Language` → `en` |
| `displayCurrency` | string | N | ISO 4217 3자, 기본 `USD` | 표시 통화 |
| `timezone` | string | N | IANA, 기본 `UTC` | 시간 표시 기준 |
| `termsAgreed` | boolean | 조건부 | 신규 회원 `true`만 허용 | 이용약관 동의 |
| `privacyAgreed` | boolean | 조건부 | 신규 회원 `true`만 허용 | 개인정보 처리방침 동의(Web3Auth 처리 위탁·국외 이전 고지 포함) |

```json
{
  "idToken": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9...",
  "address": "0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a",
  "provider": "GOOGLE",
  "countryCode": "US",
  "locale": "en",
  "displayCurrency": "USD",
  "timezone": "America/Los_Angeles",
  "termsAgreed": true,
  "privacyAgreed": true
}
```

### 시스템 처리
1. Bean Validation → Web3Auth JWKS 공개키로 `idToken` 서명 검증 → `aud`(클라이언트 ID)·`iss`·`exp`·`nonce` 확인 → 토큰의 지갑 클레임과 `address` 대조.
2. 상태 전이: `member` 조회(`auth_provider` + `provider_user_id`) → 없으면 생성(`auth_provider`=요청 `provider`, `web3auth_verifier_id`, 역할 `AUDIENCE`). **[v6] 지갑 등록·`chain_job` 생성은 하지 않는다.**
3. 등록된 지갑이 있으면 응답 `wallet`에 담고, 없으면 `null`을 담는다(지갑 등록은 `POST /api/v1/wallets`).
4. 외부 호출: Web3Auth JWKS 조회(캐시 10분, 실패는 `502`) 하나뿐이다. **[v6]** `YoYo.mint` 전송은 이 API의 처리 단계에서 빠졌다.
5. `member` 저장 + 리프레시 토큰은 **Redis**(`auth:refresh:{jti}`, TTL 14일 — §0.12) 저장 + 감사 로그(로그인, SEC-11). **[v6]** `WALLET_LINK`·`GRANT` 감사 로그는 지갑 등록 절로 옮겼다. **개인키·샤드는 어떤 컬럼·로그에도 남기지 않는다.**

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "memberId": 1024,
    "isNewMember": true,
    "name": "Alex Kim",
    "email": "alex@example.com",
    "roles": ["AUDIENCE"],
    "authProvider": "GOOGLE",
    "countryCode": "US",
    "locale": "en",
    "displayCurrency": "USD",
    "timezone": "America/Los_Angeles",
    "profileCompletionRequired": false,
    "wallet": null,
    "accessToken": "eyJhbGciOi...",
    "accessTokenExpiresAt": "2026-09-02T14:30:00+09:00",
    "refreshToken": "eyJhbGciOi...",
    "refreshTokenExpiresAt": "2026-09-16T14:00:00+09:00"
  },
  "msg": "Signed in."
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `isNewMember` | boolean | **[v6 유지]** 보조 폼(국가·언어·통화·시간대) 1회 노출 조건. 지갑 등록 여부와는 별개다 |
| `wallet` | object\|null | **[v6 nullable]** 등록된 지갑이 없으면 `null`. `provider`·`address`·`status`·`explorerUrl`을 담는다 |
| `profileCompletionRequired` | boolean | **[2026-09-15 · S15P21B204-105]** 항상 `false`(예약). 가입 시 `countryCode`·약관 동의를 전부 받으므로 실제로는 쓰이지 않는다 |

**[v6] `grantJobId`·`signupGrant`는 이 응답에서 삭제됐다** — 기본 지급은 지갑 등록 응답(`POST /api/v1/wallets`)이 돌려준다.

`isNewMember: true`면 클라이언트는 보조 폼(국가·언어·통화·시간대)을 1회 보인다(화면 C-01). **[v6] `wallet`이 `null`이면 홈에 닿기 전에 지갑 등록(C-05 `/onboarding/wallet`)으로 보낸다** — 기존 회원이 지갑만 없는 상태(등록 전 이탈, P1 이메일 가입 회원)도 같은 규칙이다.

### 4xx/5xx
```json
{ "code": "AUTH_TOKEN_INVALID", "data": null, "msg": "Sign-in verification failed. Please try again." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 주소 형식 위반, 신규 회원 `countryCode`·약관 동의 누락, 허용되지 않는 `provider`, 개인키·니모닉류 필드 전달 |
| 401 | `AUTH_TOKEN_INVALID` | idToken 서명·`aud`·`exp`·`nonce` 검증 실패, 토큰 지갑 클레임 ≠ `address` (전용 코드 `AUTH_WEB3AUTH_TOKEN_INVALID`는 §16.1) |
| 409 | `COMMON_CONFLICT` | **[v6]** 이미 지갑을 등록한 회원인데 요청 `address`가 등록된 주소와 불일치(verifier 교체 의심 — 관리자 확인 대상) |
| 429 | `COMMON_TOO_MANY_REQUESTS` | IP당 60회/분 초과 (SEC-10) |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | Web3Auth JWKS 조회 실패이며 캐시도 없음 |

> **[v6]** 기본 지급 job이 `FAILED`로 끝나면 회원은 잔액 0으로 서비스에 들어온다(지급은 지갑 등록 절에서 트리거된다). 화면은 결제 단계에서 "Insufficient balance"만 보여주고(§0.4·화면 §5.16), 운영자가 M-03에서 API-coin-07로 지급한다.

---
### API-member-02 자체 이메일 로그인(보조) **[P1 — 9/2 최소화]**
`POST /api/v1/auth/login` · 권한: GUEST(인증 불필요) · 우선: P1 · 연관 화면: `C-01 로그인` · 연관 기능: `F-member-02 자체 이메일 로그인(보조)`

## 요구사항
- 이메일·비밀번호를 검증하고 access token(30분)·refresh token(14일)을 발급한다 [권] P-1 / SEC-02. refresh token은 서버에 저장하고 재발급마다 회전한다.
- 이메일 없음과 비밀번호 불일치를 구분하지 않고 같은 코드로 응답해 계정 존재 여부를 노출하지 않는다.
- **소셜 회원**(`authProvider != LOCAL`, 비밀번호 NULL)이 비밀번호 로그인을 시도하면 `AUTH_INVALID_CREDENTIALS`로 거부하고 `msg`로 소셜 로그인을 안내한다(경로는 API-member-01).
- **[v6]** 지갑이 없는 회원은 응답의 `wallet`이 `null`이다. 이때 클라이언트는 **지갑 등록 온보딩(C-05 `/onboarding/wallet`)** 으로 보낸다 — v5의 "LOCAL 경로 한정" 규칙이 v6에서 **전원 공통 규칙**으로 올라갔다(§14-35). 지갑 없이도 공연 탐색은 가능하다.
- IP당 60회/분 호출 제한 대상이다(SEC-10).

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Accept-Language: en` / `ko`

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `email` | string | Y | RFC 5322 | 로그인 ID |
| `password` | string | Y | 8~64자 | 평문 전송(HTTPS 전 구간, SEC-01) |

```json
{ "email": "audience@ssafy.io", "password": "b204!Pass" }
```

### 시스템 처리
1. 이메일로 회원 조회 → BCrypt 비교. 실패 시 시도 횟수를 기록하고 동일 코드 반환.
2. 상태 전이: 인증 상태 `UNAUTHENTICATED` → `AUTHENTICATED`.
3. 외부 호출 없음.
4. 리프레시 토큰을 **Redis**에 저장(`auth:refresh:{jti}` TTL 14일 + `auth:refresh:member:{memberId}` 집합에 등록 — 회원·디바이스 단위), 로그인 감사 로그. **[v4]** `wallet` 유무를 함께 조회해 응답에 담는다.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "memberId": 1030,
    "name": "김관객",
    "roles": ["AUDIENCE"],
    "authProvider": "LOCAL",
    "locale": "ko",
    "displayCurrency": "KRW",
    "timezone": "Asia/Seoul",
    "wallet": null,
    "walletLinkRequired": true,
    "accessToken": "eyJhbGciOi...",
    "accessTokenExpiresAt": "2026-09-02T14:30:00+09:00",
    "refreshToken": "eyJhbGciOi...",
    "refreshTokenExpiresAt": "2026-09-16T14:00:00+09:00"
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "AUTH_INVALID_CREDENTIALS", "data": null, "msg": "아이디 또는 비밀번호가 올바르지 않습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 이메일 형식 오류, 필드 누락 |
| 401 | `AUTH_INVALID_CREDENTIALS` | 계정 없음, 비밀번호 불일치, 소셜 전용 회원의 비밀번호 로그인 |
| 429 | `COMMON_TOO_MANY_REQUESTS` | IP당 60회/분 초과 (SEC-10) |

---

### API-member-03 토큰 재발급
`POST /api/v1/auth/refresh` · 권한: 회원(refresh token) · 우선: P0 · 연관 화면: `공통` · 연관 기능: `F-member-03 토큰 재발급`

## 요구사항
- refresh token으로 access token을 재발급하고 refresh token을 **회전**한다(SEC-02). 이전 refresh token은 즉시 폐기한다.
- 클라이언트는 `AUTH_TOKEN_EXPIRED`(401)를 받은 경우에만 호출한다. `AUTH_TOKEN_INVALID`에서는 재발급 없이 로그아웃한다.
- 이미 폐기·회전된 refresh token 재사용은 탈취 신호로 보고 해당 회원의 refresh token을 **전량 폐기**한 뒤 `AUTH_TOKEN_INVALID`로 응답한다 [권].
- **[v4]** 로그인 경로(Web3Auth·자체 이메일)와 무관하게 같은 세션 구조를 쓴다. Web3Auth idToken을 다시 요구하지 않는다.

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `refreshToken` | string | Y | JWT | 로그인 시 받은 refresh token |

```json
{ "refreshToken": "eyJhbGciOi..." }
```

### 시스템 처리
1. 토큰 서명·만료 검증 → **Redis** `auth:refresh:{jti}` 키 존재 확인(키 부재 = 만료·폐기·재사용).
2. 상태 전이: 기존 refresh token 폐기 → 새 access·refresh 발급·저장(회전).
3. 외부 호출 없음.
4. 재사용 감지(삭제된 키로 재요청) 시 `auth:refresh:member:{memberId}` 집합의 키 전량 삭제 + 감사 로그.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "accessToken": "eyJhbGciOi...",
    "accessTokenExpiresAt": "2026-09-02T15:00:00+09:00",
    "refreshToken": "eyJhbGciOi...",
    "refreshTokenExpiresAt": "2026-09-16T14:30:00+09:00"
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "AUTH_TOKEN_INVALID", "data": null, "msg": "인증 정보가 올바르지 않습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `refreshToken` 누락 |
| 401 | `AUTH_TOKEN_EXPIRED` | refresh token 만료 → 재로그인 필요 |
| 401 | `AUTH_TOKEN_INVALID` | 서명 불일치, 폐기·회전된 토큰 재사용(전량 폐기 처리) |

---

### API-member-04 로그아웃
`POST /api/v1/auth/logout` · 권한: 회원 · 우선: P0 · 연관 화면: `C-03 마이페이지` · 연관 기능: `F-member-04 로그아웃`

## 요구사항
- 서버에 저장된 해당 디바이스의 refresh token을 폐기한다. access token은 만료까지 유효하므로 클라이언트가 즉시 파기한다.
- `allDevices: true`면 회원의 refresh token을 전량 폐기한다 [권].
- **[v4]** 로그아웃은 서버 세션만 끊는다. **Web3Auth 세션과 사용자 지갑은 서버가 건드리지 않는다** — 프론트가 Web3Auth SDK의 `logout()`을 별도로 호출하고, 외부 지갑은 연결 해제만 한다. 지갑 등록(`wallet` 레코드)은 로그아웃으로 사라지지 않는다.
- 이미 폐기된 토큰으로 호출해도 200으로 성공시킨다(결과 상태가 같다) [권].

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `refreshToken` | string | N | JWT | 폐기할 디바이스 토큰. 생략 시 현재 access token의 세션 |
| `allDevices` | boolean | N | 기본 `false` | 전 디바이스 로그아웃 |

```json
{ "refreshToken": "eyJhbGciOi...", "allDevices": false }
```

### 시스템 처리
1. access token에서 `memberId` 추출.
2. 상태 전이: 대상 **Redis** 키 삭제(`allDevices`면 `auth:refresh:member:{memberId}` 집합 전량 삭제).
3. 외부 호출 없음 — Web3Auth 세션 종료는 클라이언트 몫이다.
4. 로그아웃 감사 로그.

## Response
### 200 OK
```json
{ "code": "SUCCESS", "data": { "loggedOut": true, "revokedCount": 1, "clientAction": "CLEAR_WEB3AUTH_SESSION" }, "msg": "로그아웃되었습니다." }
```

### 4xx
```json
{ "code": "COMMON_UNAUTHORIZED", "data": null, "msg": "로그인이 필요합니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 401 | `AUTH_TOKEN_EXPIRED` | access token 만료 |

---

### API-member-05 내 정보 조회
`GET /api/v1/members/me` · 권한: 회원 · 우선: P0 · 연관 화면: `C-03 마이페이지`·`C-04 언어·통화 설정` · 연관 기능: `F-member-05 내 정보 조회`

## 요구사항
- **[v4]** 프로필·역할·**로케일·표시 통화·시간대·국가**·**지갑 요약**·소속 팀 요약을 한 번에 준다. C-03 진입 1회 호출로 화면이 그려져야 한다.
- 지갑 요약은 `provider` 배지(`WEB3AUTH`/`EXTERNAL`)·주소·**YoYo 잔액 + `display`**·`status`까지다. 상세 잔액·가스 상태·거래 이력은 API-wallet-01·02가 담당한다.
- **[v6]** 아직 지갑을 등록하지 않은 회원은 `wallet: null` + `walletLinkRequired: true`다(소셜·이메일 구분 없이 전원 공통 — 지갑 등록은 `POST /api/v1/wallets` · C-05).
- 관객 화면이므로 가스·해시·컨트랙트 주소를 담지 않는다(§0.7 비노출 규칙). 지갑 주소는 본인 소유라 노출한다.
- **[v5]** 회원의 법정화폐 수령 수단 개념은 존재하지 않는다 — 잔액·주소는 지갑(API-wallet-01)에만 있고, 응답에 그 밖의 금전 수단 필드가 없다.
- **[v7]** `preferredGenres`(선호 장르, API-team-01과 같은 장르 코드 10종 중 0~3개)를 함께 준다. 선택 안 함은 빈 배열이며 콜드스타트 추천(API-recommendation-01)이 이 값을 읽는다(추천 설계 §4.2).

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`
- `Accept-Language: en` / `ko`

### Path · Query
없음.

### Body
없음.

### 시스템 처리
1. access token에서 `memberId` 추출.
2. 상태 전이 없음(조회).
3. 외부 호출: 지갑 잔액은 **[v6]** Redis `wallet:balance`의 캐시값을 쓰고 **노드를 조회하지 않는다**(PERF-01·§0.12). 실시간 값은 API-wallet-01이 조회한다.
4. `member` + `wallet` + `team`(`leader_member_id = memberId`) + 유효 `exchange_rate` 조인 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "memberId": 1024,
    "email": "alex@example.com",
    "name": "Alex Kim",
    "roles": ["AUDIENCE", "PERFORMER"],
    "authProvider": "GOOGLE",
    "countryCode": "US",
    "locale": "en",
    "displayCurrency": "USD",
    "timezone": "America/Los_Angeles",
    "wallet": {
      "provider": "WEB3AUTH",
      "address": "0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a",
      "status": "LINKED",
      "balance": { "amount": 35000, "currency": "KRW", "display": { "currency": "USD", "approx": 25.93, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" } },
      "cachedAt": "2026-09-02T13:59:40+09:00"
    },
    "walletLinkRequired": false,
    "teams": [ { "teamId": 7, "teamName": "블루노트", "leader": true } ],
    "preferredGenres": ["ROCK", "INDIE"],
    "createdAt": "2026-08-20T10:11:00+09:00"
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "AUTH_TOKEN_EXPIRED", "data": null, "msg": "로그인이 만료되었습니다. 다시 로그인해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 401 | `AUTH_TOKEN_EXPIRED` | access token 만료 → API-member-03으로 재발급 |

---

### API-member-06 내 정보 수정
`PATCH /api/v1/members/me` · 권한: 회원 · 우선: P0 · 연관 화면: `C-03 마이페이지`·`C-04 언어·통화 설정` · 연관 기능: `F-member-06 내 정보 수정` · `F-member-09 언어·통화 설정`

## 요구사항
- 이름·연락처와 **[v4] `countryCode`·`locale`·`displayCurrency`·`timezone`**을 부분 수정한다. 전달된 필드만 바꾼다. 이메일은 계정 식별자라 변경 대상이 아니다 [권].
- **[v4] `locale`·`displayCurrency`·`timezone`은 즉시 반영**된다 — 이후 모든 응답의 `msg`·`display`·시간 오프셋이 새 값을 따른다(§0.5·§0.6). `displayCurrency`를 `KRW`로 바꾸면 `display` 객체가 더 이상 내려가지 않는다.
- `displayCurrency`는 **표시 전용**이다. 바꿔도 잔액·티켓 가격·정산액의 원본 `amount`는 1원도 달라지지 않는다(P-17).
- 지원하지 않는 통화(현재 등록된 `exchange_rate` pair에 없는 통화)로 바꾸면 저장은 허용하고 `displaySupported: false`를 내려 화면이 원 값만 표시하게 한다 [권]. 오류로 막지 않는다.
- 비밀번호 변경(`currentPassword`+`newPassword`)은 `authProvider=LOCAL` 회원만 가능하다. 성공하면 해당 회원의 refresh token을 전부 폐기한다(SEC-02). 소셜 회원의 비밀번호 변경 시도는 `COMMON_VALIDATION_FAILED`다.
- **연락처는 선택**이다 — 외국인 관객에게 국내 휴대폰 번호를 요구하지 않는다(P-23).
- **[v7]** `preferredGenres`로 선호 장르를 **전체 교체**한다. 빈 배열을 보내면 전부 삭제된다. 코드는 API-team-01과 같은 10종 enum이며 라벨(en/ko)은 §0.6 규칙을 따른다.

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `name` | string | N | 1~40자 | 이름 또는 활동명 |
| `phone` | string | N | E.164 또는 `010-0000-0000`, 최대 20자 | 연락처(선택) |
| `countryCode` | string | N | ISO 3166-1 alpha-2 | 국가 자기 선언 |
| `locale` | string | N | `en` / `ko` | UI 언어 |
| `displayCurrency` | string | N | ISO 4217 3자 | 표시 통화 |
| `timezone` | string | N | IANA | 시간대 |
| `preferredGenres` | string[] | N | 0~3개, 장르 코드 enum(`ROCK`·`INDIE`·`POP`·`HIPHOP`·`RNB`·`JAZZ`·`ELECTRONIC`·`ACOUSTIC`·`CLASSICAL`·`ETC`), 중복 불가 | **[v7]** 선호 장르 전체 교체(빈 배열 = 모두 삭제) |
| `currentPassword` | string | N | `newPassword`와 동시 필수, LOCAL 회원만 | 현재 비밀번호 |
| `newPassword` | string | N | 8~64자, 현재와 달라야 함 | 새 비밀번호 |

```json
{ "locale": "ko", "displayCurrency": "JPY", "timezone": "Asia/Tokyo", "preferredGenres": ["ROCK", "INDIE"] }
```

### 시스템 처리
1. 필드 검증 → `locale`·`displayCurrency`·`timezone` 화이트리스트·형식 확인 → `preferredGenres` 개수(≤3)·enum·중복 확인 → 비밀번호 변경 요청이면 `authProvider=LOCAL` 확인 후 `currentPassword` 대조.
2. 상태 전이 없음(프로필 수정). 비밀번호 변경 시 인증 상태는 유지하되 refresh token 전량 폐기.
3. 외부 호출 없음.
4. `member` 갱신 + 변경 감사 로그. `preferredGenres` 전달 시 `member_preferred_genre` **전체 교체**(delete + insert). `displayCurrency`에 대응하는 유효 `exchange_rate`가 있는지 조회해 `displaySupported`를 계산한다.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "memberId": 1024,
    "name": "Alex Kim",
    "countryCode": "JP",
    "locale": "ko",
    "displayCurrency": "JPY",
    "displaySupported": true,
    "timezone": "Asia/Tokyo",
    "appliedRate": { "currency": "JPY", "rate": 9.12, "asOf": "2026-09-02T09:00:00+09:00" },
    "preferredGenres": ["ROCK", "INDIE"]
  },
  "msg": "설정이 저장되었습니다."
}
```

### 4xx
```json
{ "code": "COMMON_VALIDATION_FAILED", "data": null, "msg": "지원하지 않는 언어 코드입니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 형식 위반, `newPassword` 단독 전달, 소셜 회원의 비밀번호 변경 시도, 허용되지 않는 `locale`·`countryCode`·`timezone`, **[v7]** `preferredGenres` 4개 이상·허용값 밖·중복 |
| 401 | `AUTH_INVALID_CREDENTIALS` | `currentPassword` 불일치 |
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |

---

### API-member-08 자체 이메일 가입(보조) **[P1 — 9/2 최소화]**
`POST /api/v1/auth/signup` · 권한: GUEST(인증 불필요) · 우선: P1 · 연관 화면: `C-02 회원가입(보조)` · 연관 기능: `F-member-10 자체 이메일 가입(보조)`

## 요구사항
- **[v4 번호 이동]** v3의 API-member-01(회원가입)이 이 번호로 옮겨졌다. 소셜 로그인을 쓸 수 없는 사용자를 위한 **보조 경로**이며, 기본 가입 경로는 API-member-01이다.
- 이메일·비밀번호·이름과 **[v4] `countryCode`·`locale`·`displayCurrency`·`timezone`**, 약관 동의로 계정을 만든다. 이메일은 계정 식별자이며 중복될 수 없다.
- 비밀번호는 BCrypt로 단방향 해싱해 저장하고 어떤 응답에도 포함하지 않는다. `authProvider=LOCAL`이다.
- **지갑을 만들지 않는다.** 서버는 사용자 키를 생성·보관하지 않으므로, 이 회원도 **[v6] 다른 회원과 똑같이 지갑 등록 단계(`POST /api/v1/wallets` · C-05)** 를 지난다. 응답의 `walletLinkRequired: true`가 그 안내다(미결 안건 18).
- 가입 직후 역할은 `AUDIENCE`다. 팀을 만들면 `PERFORMER`가 더해진다. 가입만으로 로그인시키지 않는다 [권].
- 연락처는 선택 항목이다(P-23).

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Accept-Language: en` / `ko`

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `email` | string | Y | RFC 5322, 최대 254자 | 로그인 ID |
| `password` | string | Y | 8~64자, 영문·숫자·특수문자 중 2종 이상 | 평문 전송(HTTPS 전 구간, SEC-01) |
| `name` | string | Y | 1~40자 | 실명 또는 활동명 |
| `countryCode` | string | Y | ISO 3166-1 alpha-2 | 국가 자기 선언 |
| `locale` | string | N | `en`(기본) / `ko` | UI 언어 |
| `displayCurrency` | string | N | ISO 4217 3자, 기본 `USD` | 표시 통화 |
| `timezone` | string | N | IANA, 기본 `UTC` | 시간대 |
| `phone` | string | N | 최대 20자 | 연락처(선택) |
| `termsAgreed` | boolean | Y | `true`만 허용 | 이용약관 동의 |
| `privacyAgreed` | boolean | Y | `true`만 허용 | 개인정보 처리방침 동의 |

```json
{
  "email": "audience@ssafy.io",
  "password": "b204!Pass",
  "name": "김관객",
  "countryCode": "KR",
  "locale": "ko",
  "displayCurrency": "KRW",
  "timezone": "Asia/Seoul",
  "termsAgreed": true,
  "privacyAgreed": true
}
```

### 시스템 처리
1. Bean Validation → 이메일 중복 조회(`member.email` 유니크) → `countryCode`·`locale`·`timezone` 화이트리스트 확인.
2. 상태 전이: `member` 생성(`auth_provider=LOCAL`, 역할 `AUDIENCE`), 인증 상태 `UNAUTHENTICATED` 유지.
3. 외부 호출 없음 — **지갑을 만들지 않고 KAIA를 넣지도 않는다.** 지갑이 없으므로 기본 지급도 없다(지갑 연결 후 관리자 지급, API-coin-07).
4. `member` 저장 + 가입 감사 로그.

## Response
### 201 Created
```json
{
  "code": "SUCCESS",
  "data": {
    "memberId": 1030,
    "email": "audience@ssafy.io",
    "name": "김관객",
    "authProvider": "LOCAL",
    "locale": "ko",
    "walletLinkRequired": true
  },
  "msg": "가입이 완료되었습니다. 로그인 후 지갑을 연결해 주세요."
}
```

### 4xx
```json
{ "code": "AUTH_EMAIL_DUPLICATED", "data": null, "msg": "이미 가입된 이메일입니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 형식 위반, 약관 미동의, `countryCode` 누락 |
| 409 | `AUTH_EMAIL_DUPLICATED` | 동일 이메일 계정 존재 |

---

> **v3 API-member-08 `POST /api/v1/auth/oauth/{provider}` (소셜 OAuth 로그인)은 [v4 삭제]됐다.** 자체 OAuth 토큰 교환 대신 **Web3Auth가 소셜 로그인과 지갑 생성을 함께 처리**하고 백엔드는 idToken만 검증하므로(P-1·미결 안건 5), 이 경로는 **API-member-01 `POST /api/v1/auth/web3auth`로 통합**됐다. 지원 제공자는 구글·페이스북·카카오 3종으로 동결됐다. 관련 코드 `AUTH_OAUTH_EXCHANGE_FAILED`·`AUTH_OAUTH_PROVIDER_UNSUPPORTED`(v3 §17.1 신설 후보)도 §16.3 폐기 후보로 옮겼다.

---

### 삭제된 API — §1 말미 기록

- **API-member-07 (`PUT /api/v1/members/me/bank-account`)** — **[v5 삭제]** 법정화폐가 존재하지 않는 세계라 회원이 등록할 금전 수단이 없다. 환불은 지갑으로 돌아오고 정산금은 지갑으로 도착한다(결정 v2 §0 전제 2·P-20·§9). v4에서 P1이었고 v5에서 경로 자체를 없앴다 — §15 예약 경로에도 두지 않는다.
- **v3 소셜 OAuth 로그인 API(구 API-member-08)** — v4에서 API-member-01로 통합됐다(변경 없음).

---

## 2. team — 공연팀

**팀 지갑은 리더 지갑이다.** 팀 생성 시 서버가 지갑을 만들지 않는다 — `team_wallet` 테이블은 없고, 팀의 수령 주소는 `team.leader_member_id → wallet.address`로 **파생**된다. 팀 리더가 지갑을 연결하지 않았으면 팀 생성 자체를 막는다(F-team-01). 팀당 리더 1인이며 리더 교체는 MVP에서 불가하다(미결 안건 20).

**[v5] 팀에는 금전 수단 정보가 없다.** `team.settlement_account_id` 컬럼과 그 참조 테이블이 ERD v4에서 삭제됐고(결정 v2 §8), 등록 API(API-team-07)도 사라졌다. 정산금은 `release`가 **리더 지갑으로 YoYo를 밀어 넣는 것으로 끝난다**(P-10). 그래서 team 응답에서 v4의 등록 여부·상세·수령 가능액 3개 필드가 전부 빠졌다.

### API-team-01 팀 생성 **[v5 변경 — 금전 수단 필드 없음, v7 변경 — 장르 코드 필수]**
`POST /api/v1/teams` · 권한: 회원 · 우선: P0 · 연관 화면: `P-02 팀 관리` · 연관 기능: `F-team-01 팀 생성`

## 요구사항
- 팀을 만든 회원이 자동으로 **리더**가 되고 `PERFORMER` 역할을 얻는다. 팀 지갑 = 리더 지갑이라 **지갑을 새로 만들지 않는다**.
- **리더 지갑 등록이 선행 조건**이다. 요청자에게 `wallet`(`status=LINKED`)이 없으면 `WALLET_NOT_FOUND`(404)로 막고 지갑 등록(C-05 `/onboarding/wallet`)으로 보낸다(전용 코드 `WALLET_NOT_LINKED`는 §16.1 신설 제안).
- **[v5] 리더 지갑에 KAIA를 넣는 단계가 없다.** 보증금·동의·결제 서명은 전부 수수료 대납이므로 리더 지갑의 KAIA 잔액도 0이면 된다(§0.4). v4 응답의 `gasFundingJobId`는 삭제됐다.
- **[v5] 요청·응답에 금전 수단 필드가 없다.** 팀이 정산금을 받는 주소는 리더 지갑 하나뿐이라 등록할 것이 없다.
- 팀 이름은 전역 유니크가 아니다. 동일인이 같은 이름의 팀을 중복 생성하는 것만 막는다 [권].
- **[v7]** `genre`는 자유 문자열이 아니라 **장르 코드 10종 enum 중 1개, 필수**다 — `ROCK`·`INDIE`·`POP`·`HIPHOP`·`RNB`·`JAZZ`·`ELECTRONIC`·`ACOUSTIC`·`CLASSICAL`·`ETC`. 코드는 언어 중립이며 화면에 보이는 라벨(예: "인디")은 §0.6 규칙대로 `Accept-Language`에 따라 en/ko로 매핑된다. 기존 자유 입력 데이터는 마이그레이션 시 `ETC`로 이관했다(추천 설계 §4.1 D-R02). 팀 장르는 **단일**이며 공연 장르는 생성 팀 + 참여 팀 장르의 합집합으로 API-recommendation-01이 매칭에 쓴다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}`

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `teamName` | string | Y | 1~30자 | 팀(밴드) 이름 |
| `genre` | string | Y | **[v7]** `ROCK`·`INDIE`·`POP`·`HIPHOP`·`RNB`·`JAZZ`·`ELECTRONIC`·`ACOUSTIC`·`CLASSICAL`·`ETC` 중 1 | 대표 장르 코드(단일) |
| `introduction` | string | N | 최대 500자 | 팀 소개 |
| `contactEmail` | string | N | RFC 5322 | 섭외 연락처 |

```json
{ "teamName": "블루노트", "genre": "INDIE", "introduction": "합정 기반 3인조", "contactEmail": "bluenote@ssafy.io" }
```

### 시스템 처리
1. 필드 검증(`teamName`·`genre`) → **요청자의 `wallet` 존재·`LINKED` 확인** → 동일 리더·동일 이름 중복 확인. 필드 검증이 먼저인 것은 Bean Validation이 컨트롤러 진입 전에 돌기 때문이다(프레임워크 동작, v7 이전 `teamName`도 같았다). 화면(P-02)은 지갑 미등록이면 제출 버튼이 비활성이라 사용자는 이 순서 차이를 만나지 않는다.
2. 상태 전이: `team` 생성, 요청자를 `team.leader_member_id`로 등록해 역할에 `PERFORMER` 추가.
3. 외부 호출 없음 — **[v5]** 지갑 생성도, KAIA 지원도 없다.
4. `team` 저장 + 감사 로그.

## Response
### 201 Created
```json
{
  "code": "SUCCESS",
  "data": {
    "teamId": 7,
    "teamName": "블루노트",
    "leaderMemberId": 1024,
    "walletAddress": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b",
    "walletProvider": "EXTERNAL",
    "explorerUrl": "https://kairos.kaiascan.io/address/0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b",
    "createdAt": "2026-09-02T14:40:00+09:00"
  },
  "msg": "팀이 생성되었습니다."
}
```

`walletAddress`는 **리더 지갑 주소를 파생해 보여주는 값**이며 `team` 테이블 컬럼이 아니다. `walletProvider`는 `WEB3AUTH`(소셜 로그인 지갑) 또는 `EXTERNAL`(Kaia Wallet)이다.

### 4xx
```json
{ "code": "WALLET_NOT_FOUND", "data": null, "msg": "지갑을 먼저 연결해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 이름 길이·형식 위반, **[v7]** `genre` 누락 또는 허용값 밖 |
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 404 | `WALLET_NOT_FOUND` | 요청자 지갑 미연결 (전용 코드 `WALLET_NOT_LINKED`는 §16.1) |
| 409 | `COMMON_CONFLICT` | 같은 리더가 같은 이름의 팀을 중복 생성 |
| 403 | `COMMON_FORBIDDEN` | 지갑이 관리자 정지 상태(`SUSPENDED`) |

---

### API-team-02 내 팀 목록 **[v5 변경 — 수령 가능액·등록 여부 삭제]**
`GET /api/v1/teams/me` · 권한: 회원(로그인) · 우선: P0 · 연관 화면: `P-01 공연자 대시보드` · 연관 기능: `F-team-02 내 팀 목록 조회`

## 요구사항
- 로그인 회원이 **리더인** 팀을 전부 준다. 리더 여부와 **팀 YoYo 잔액 요약**을 담아 대시보드에 표시한다.
- **[v5]** v4의 등록 여부·수령 가능액 두 필드가 삭제됐다. 잔액이 곧 팀이 가진 돈이고 그 밖의 "받을 수 있는 금액" 개념이 없다(P-20).
- 팀이 없는 AUDIENCE도 조회할 수 있으며, 빈 배열과 `pageInfo`를 반환한다(403·404가 아니다). P-01은 이 응답으로 첫 팀 생성 진입을 연다.
- 잔액은 **[v6]** Redis `wallet:balance` 캐시값이며 노드를 조회하지 않는다(PERF-01·§0.12). 실시간 값은 API-wallet-01이다.
- 금액은 §0.5 축약형 — 응답 루트에 `rate` 하나, 항목에는 `amount`만.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `page` | query | integer | N | 0-base, 기본 0 |
| `size` | query | integer | N | 기본 20, 최대 100 |

### Body
없음.

### 시스템 처리
1. access token에서 `memberId` 추출.
2. 상태 전이 없음(조회).
3. 외부 호출 없음.
4. `team`(`leader_member_id = memberId`) + `wallet`(리더) 조인 후 `items`/`pageInfo` 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "rate": { "currency": "USD", "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "items": [
      { "teamId": 7, "teamName": "블루노트", "genre": "INDIE", "leader": true, "walletAddress": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b", "balanceAmount": 572942 }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 1, "hasNext": false }
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |

---

### API-team-03 팀 상세 **[v5 변경 — 금전 수단 블록 삭제]**
`GET /api/v1/teams/{teamId}` · 권한: PERFORMER(해당 팀 리더) · 우선: P0 · 연관 화면: `P-02 팀 관리` · 연관 기능: `F-team-03 팀 상세 조회`

## 요구사항
- 팀 정보와 **리더 지갑(주소·provider 배지·익스플로러 링크)**을 준다. 잔액·거래 이력은 API-wallet-01·02가 담당한다.
- **[v5]** v4 응답의 `settlementAccount` 객체가 삭제됐다. 팀이 돈을 받는 곳은 리더 지갑 주소 하나이며 그 값은 이미 `wallet.address`에 있다.
- 팀 리더가 아니면 조회할 수 없다(SEC-03).
- `walletAddress`는 `leader_member_id → wallet`으로 파생한 값이다. `team` 테이블에 지갑 컬럼은 없다.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `teamId` | path | integer(BIGINT) | Y | 팀 PK |

### Body
없음.

### 시스템 처리
1. `teamId` 존재 확인 → 요청자가 리더인지 확인.
2. 상태 전이 없음(조회).
3. 외부 호출 없음.
4. `team` + `wallet`(리더) 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "teamId": 7,
    "teamName": "블루노트",
    "genre": "INDIE",
    "introduction": "합정 기반 3인조",
    "contactEmail": "bluenote@ssafy.io",
    "leaderMemberId": 1024,
    "wallet": {
      "provider": "EXTERNAL",
      "address": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b",
      "status": "LINKED",
      "explorerUrl": "https://kairos.kaiascan.io/address/0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b"
    }
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 403 | `COMMON_FORBIDDEN` | 해당 팀 리더가 아님 |
| 404 | `TEAM_NOT_FOUND` | 존재하지 않는 `teamId` |
| 404 | `WALLET_NOT_FOUND` | 리더 지갑 레코드가 없음(비정상 상태 — 관리자 확인) |

---
### API-team-04 팀 수정 **[v7 변경 — 장르 코드 enum]**
`PATCH /api/v1/teams/{teamId}` · 권한: 리더 · 우선: P0 · 연관 화면: `P-02 팀 관리` · 연관 기능: `F-team-04 팀 정보 수정`

## 요구사항
- 리더만 팀 이름·장르·소개·연락처를 수정한다. 전달된 필드만 바꾼다.
- **[v4]** 리더와 지갑 주소는 이 API로 바꿀 수 없다. 지갑 교체는 MVP에서 관리자 처리이며(미결 안건 14), 리더 교체는 불가하다(미결 안건 20) — 정산 주소가 `performance_participant.wallet_address` 스냅샷으로 고정되기 때문이다.
- 판매가 시작된 공연에 참여 중이어도 팀 프로필 수정은 허용한다 [권].
- **[v7]** `genre`를 전달하면 API-team-01과 같은 장르 코드 10종 enum이어야 한다(**선택**, 미전달 시 기존 값 유지). 자유 문자열은 더 이상 허용하지 않는다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `teamId` | path | integer(BIGINT) | Y | 팀 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `teamName` | string | N | 1~30자 | 팀 이름 |
| `genre` | string | N | **[v7]** `ROCK`·`INDIE`·`POP`·`HIPHOP`·`RNB`·`JAZZ`·`ELECTRONIC`·`ACOUSTIC`·`CLASSICAL`·`ETC` 중 1 | 대표 장르 코드(단일) |
| `introduction` | string | N | 최대 500자 | 소개 |
| `contactEmail` | string | N | RFC 5322 | 연락처 |

```json
{ "genre": "ROCK", "introduction": "합정 기반 4인조로 변경" }
```

### 시스템 처리
1. `teamId` 존재 확인 → 요청자가 리더인지 확인 → `genre` 전달 시 enum 확인.
2. 상태 전이 없음.
3. 외부 호출 없음.
4. `team` 갱신.

## Response
### 200 OK
```json
{ "code": "SUCCESS", "data": { "teamId": 7, "teamName": "블루노트", "genre": "ROCK" }, "msg": "팀 정보가 수정되었습니다." }
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 형식 위반, `leaderMemberId`·`walletAddress` 등 변경 불가 필드 전달, **[v7]** `genre` 허용값 밖 |
| 403 | `COMMON_FORBIDDEN` | 리더가 아님 |
| 404 | `TEAM_NOT_FOUND` | 존재하지 않는 `teamId` |

---

### API-team-06 팀 검색(초대 자동완성) **[2026-09-26 신설]**
`GET /api/v1/teams/search` · 권한: 회원 · 우선: P0 · 연관 화면: `P-04 참여팀 관리` · 연관 기능: `F-performance-05 참여팀 초대·수락`

> 번호 — v3에서 삭제된 팀원 초대 수락(API-team-06)의 빈 번호를 이어받는다. API-team-05(팀 해산)가 같은 방식으로 빈 번호를 받았다. operationId `team_06`.

## 요구사항
- 공동 공연 생성자가 초대할 팀을 **팀 이름으로** 찾는다. 이전에는 팀 ID를 상대에게 물어 직접 입력해야 했다.
- 초대 자체(API-performance-07)는 **바뀌지 않는다** — 이 API로 고른 팀의 `teamId`를 그대로 보낸다.
- 결과는 이미 공개되는 최소 필드(`teamId`·`teamName`·`genre`)만 준다. 지갑 주소·리더 이름·이메일 같은 개인정보는 주지 않는다.
- 해산한 팀(`DISBANDED`)은 결과에서 뺀다. 결과가 없으면 빈 배열이다(404 아님).

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `q` | query | string | Y | 앞뒤 공백 제거 후 1~50자. 팀 이름 부분 일치(대소문자 무시). 숫자만이면 팀 ID 정확 일치도 포함 |
| `size` | query | integer | N | 1~10, 기본 10 |

### 시스템 처리
1. `q`를 trim → 길이 1~50 확인, `size` 1~10 확인(위반 시 400).
2. 이름 검색은 `LIKE CONCAT('%', :q, '%')` 파라미터 바인딩이다. `q` 안의 `%`·`_`는 이스케이프해 **글자 그대로** 찾는다(와일드카드로 해석하지 않는다).
3. 정렬 — 팀 ID 정확 일치 → 이름 정확 일치(대소문자 무시) → 이름 오름차순(동률은 `teamId` 오름차순). 최대 `size`건.
4. 상태 전이·외부 호출·저장 없음.

## Response
### 200 OK
```json
{ "code": "SUCCESS", "data": { "items": [ { "teamId": 7, "teamName": "블루노트", "genre": "INDIE" }, { "teamId": 12, "teamName": "블루스 브라더스", "genre": "ROCK" } ] }, "msg": "" }
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `q` 누락·공백뿐·50자 초과, `size` 1~10 밖 |
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |

---

### 삭제된 API — §2 말미 기록

- **API-team-05 `POST /api/v1/teams/{teamId}/invitations` · API-team-06 `POST /api/v1/teams/invitations/{token}/accept`** — (2026-09-26: 06 번호는 팀 검색 `GET /api/v1/teams/search`가 이어받았다) v3에서 삭제됐고 v4·v5에서도 되살리지 않는다. `team_member`·`team_invitation` 테이블이 없어 팀원 소속 개념이 없다. 팀은 리더 1인이 관리하며, 리더 지갑이 팀 지갑이다. 밴드 멤버에게 정산 결과를 보여주는 경로는 **정산 공유 링크**(API-settlement-06·07)다.
- **API-team-07 (`PUT /api/v1/teams/{teamId}/settlement-account`)** — **[v5 삭제]** 팀이 정산금을 받는 곳은 리더 지갑 하나이며, `release`가 그 지갑으로 YoYo를 밀어 넣으면 수령이 끝난다(P-10·결정 v2 §3.6). 등록할 대상도, 예금주 검증이라는 외부 조회도 존재하지 않는다. `team.settlement_account_id` 컬럼과 참조 테이블은 ERD v4에서 삭제됐고, 규격 신설 제안 `PAYMENT_ACCOUNT_HOLDER_MISMATCH`·`PAYMENT_ACCOUNT_NOT_FOUND`도 철회했다(§16.1).

---
## 3. wallet — 지갑

**지갑은 사용자 소유(Web3Auth/Kaia Wallet)이며, 서버는 사용자 키를 보관하지 않는다**(P-2·결정 v2 §2.3). `wallet` 테이블은 **회원 1:1**(`member_id` UNIQUE, `address` UNIQUE)이고 **암호화 키 컬럼도, 가스 관련 컬럼도 없다**.

**[v6] 등록은 로그인 후 첫 1회, 입구 하나다(결정 v2 §14-35).** 두 갈래(`WEB3AUTH`/`EXTERNAL`)를 **한 화면(C-05)·한 엔드포인트(`POST /api/v1/wallets` = API-wallet-04)** 로 받고, 요청 본문의 `provider`로만 나눈다. 입구를 둘로 나누면 "로그인 전에 자기 유형을 잘못 고르면 되돌릴 수 없다"는 함정이 API 층에 그대로 재현되므로 그렇게 하지 않는다.

| provider | 등록 경로 | 소유 증명 | 화면 |
|---|---|---|---|
| `WEB3AUTH` | **[v6]** `POST /api/v1/wallets` (`provider=WEB3AUTH`) — idToken `wallets` 클레임 주소를 그대로 등록 | idToken(JWKS) 검증 시각 = `verified_at` | C-05 |
| `EXTERNAL` | **[v6]** API-wallet-03 챌린지 발급 → `POST /api/v1/wallets` (`provider=EXTERNAL`, `nonce`·`signature`) | 자체 챌린지 서명(`personal_sign` → `ecrecover`) 검증 시각 = `verified_at`. **Web3Auth 모달의 외부 지갑 어댑터에 의존하지 않는다** | C-05 |

**등록 성공 즉시 기본 지급 `MINT` job이 걸린다**(멱등키 `grant:signup:{memberId}`, §0.8). 상태는 `LINKED` / `SUSPENDED`(관리자 정지)다. 회원당 1개이며 종류는 첫 등록 때 결정되고 교체는 P1(MVP는 관리자 처리, 잔액 0 확인 후 — 미결 안건 14)이다. **팀 지갑 = 팀 리더의 지갑**이므로 이 절의 API가 관객·리더 모두를 다룬다.

**[v5] 이 장에서 사라진 것 2개** — ① **가스 개념** — 수수료 대납을 채택해 사용자 지갑의 KAIA 잔액은 항상 0이며, 응답에서 `gas` 블록이 삭제되고 API-wallet-05(가스 재지원)는 경로째 없어졌다(장 말미). ② **법정화폐 입출구** — 잔액을 늘리는 유일한 경로는 시연용 지급(`MINT`)이고, 잔액을 밖으로 빼는 플랫폼 경로는 없다. 지갑 앱에서 외부 주소로 옮기는 것은 사용자 자유이며 우리 화면은 안내하지 않는다(P-20·결정 v2 §3.7).

### API-wallet-01 내 지갑 조회 **[v5 변경 — 가스 블록 삭제]**
`GET /api/v1/wallets/me` · 권한: 회원 · 우선: P0 · 연관 화면: `A-13 내 지갑`·`P-02 팀 관리`·`C-03 마이페이지` · 연관 기능: `F-wallet-02 지갑 조회`

## 요구사항
- 내 지갑의 `provider`·주소·**YoYo 잔액(원 값 + `display`)**·상태·익스플로러 링크를 준다. A-13 화면 전체가 이 응답으로 그려진다.
- 잔액은 체인 `YoYo.balanceOf(address)`가 원장이다. **[v6]** 조회 결과는 **Redis 해시 `wallet:balance`**(field = `walletId`, value = `"{balance}|{checkedAtEpochMs}"`, TTL 없음 — §0.12)에 두고 `checkedAt`이 **10초**보다 낡으면 노드를 다시 읽는다 [권]. DB 테이블에 잔액 사본을 두지 않는다(읽기가 쓰기를 만들지 않는다). 노드 장애 시 마지막 캐시값과 `stale: true`·`cachedAt`을 함께 준다(AVAIL-02).
- **[v5] 가스 상태 필드가 없다.** v4의 `gas.sufficient`·`gas.remainingSignCount`·`gas.refillAvailable`·`gas.lastFundedAt`은 전부 삭제됐다. 수수료는 운영지갑이 대납하고 사용자에게 노출할 잔액이 없다(§0.4·P-3).
- **[v5] 잔액을 늘리는 버튼이 없다.** 응답에 어떤 유입 경로도 담지 않는다. 잔액이 모자란 상황의 화면 처리는 "Insufficient balance · 3,000 YoYo short" 안내뿐이다(화면 §5.16).
- **[v6] `pendingGrantJobId`** — **지갑 등록 시** 걸린 기본 지급 `MINT` job이 아직 `CONFIRMED`가 아니면 그 `jobId`를 담아 A-13이 "arriving…"을 표시할 수 있게 한다. 확정 후에는 `null`이다.
- **개인키·니모닉·MPC 샤드는 어떤 필드로도 반환하지 않는다.** 서버가 갖고 있지 않다.
- 지갑이 없으면 `404 WALLET_NOT_FOUND`다 — 클라이언트는 지갑 등록(C-05 `/onboarding/wallet`)으로 보낸다(전용 코드 `WALLET_NOT_LINKED`는 §16.1).
- 팀 리더가 호출하면 이 응답이 곧 **팀 지갑 조회**다. 별도 팀 지갑 경로는 없다.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
없음.

### Body
없음.

### 시스템 처리
1. 회원 식별 → `wallet` 존재·상태 확인.
2. 상태 전이 없음(조회).
3. 외부 호출: Redis `wallet:balance`의 `checkedAt`이 10초보다 낡으면 `YoYo.balanceOf(address)` 조회. **[v5]** 네이티브 KAIA 잔액은 조회하지 않는다. 노드 오류 시 캐시값 + `stale: true`, 캐시도 없으면 `502`.
4. **[v6]** 노드를 읽었으면 Redis `wallet:balance` 해시를 갱신한 뒤 반환한다(DB 쓰기 없음). 유효 환율로 `display` 계산. 미확정 `MINT` job이 있으면 `pendingGrantJobId`에 담는다.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "walletId": 4401,
    "provider": "WEB3AUTH",
    "address": "0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a",
    "status": "LINKED",
    "verifiedAt": "2026-09-02T13:00:00+09:00",
    "balance": { "amount": 85000, "currency": "KRW", "display": { "currency": "USD", "approx": 62.96, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" } },
    "pendingGrantJobId": null,
    "network": "kaia-kairos",
    "chainId": 1001,
    "tokenAddress": "0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736",
    "explorerUrl": "https://kairos.kaiascan.io/address/0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a",
    "cachedAt": "2026-09-02T14:00:00+09:00",
    "stale": false
  },
  "msg": ""
}
```

### 4xx/5xx
```json
{ "code": "WALLET_NOT_FOUND", "data": null, "msg": "연결된 지갑이 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 403 | `COMMON_FORBIDDEN` | 지갑 상태가 `SUSPENDED` |
| 404 | `WALLET_NOT_FOUND` | **[v6]** 아직 지갑을 등록하지 않은 회원 — 클라이언트는 C-05(`/onboarding/wallet`)로 보낸다 |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | 체인 노드 조회 실패이며 캐시도 없음 |

---

### API-wallet-02 내 지갑 거래 이력 **[v5 변경 — 이력 종류 6종]**
`GET /api/v1/wallets/me/transactions` · 권한: 회원 · 우선: P0 · 연관 화면: `A-13 내 지갑` · 연관 기능: `F-wallet-03 지갑 거래 이력 조회`

## 요구사항
- 내 지갑이 관여한 거래를 최신순으로 준다. 필터는 결정 v2 §7 `WalletTx.type`의 **6종** — `GRANT`(시연용 지급 mint) / `PURCHASE`(결제) / `REFUND`(환불 수령) / `RELEASE`(정산 수령) / `DEPOSIT`(보증금 납부) / `DEPOSIT_RETURN`(보증금 반환)이다.
- **[v5]** v4의 유입 이력 종류는 `GRANT`로 대체됐고, 법정화폐 유출·가스 두 종류는 해당 동작이 없어져 삭제됐다. 따라서 이 응답의 모든 행은 **YoYo 단위**이며 `currency`가 항상 `"KRW"`다 — 네이티브 코인 행이 섞이지 않는다.
- 각 행에 **부호 있는 금액**(`direction`: `IN`/`OUT`)·상태·`txHash`·익스플로러 링크·`signerType`·**[v5] `feeDelegated`**를 담아 사용자가 직접 검증할 수 있게 한다. 실패한 거래도 `FAILED`로 함께 보여준다.
- 서버가 인덱싱한 `chain_job`·`refund`·`settlement_share`를 원본으로 삼는다. **노드를 직접 페이징하지 않는다**(PERF-01). 지급 이력의 원본은 `chain_job WHERE tx_type='MINT'`이며 별도 테이블이 없다(결정 v2 §2.2·미결 안건 31).
- 관객 화면(A-13)에서는 `txHash`를 기본 접어 두고 "자세히"에서만 펼친다 — 블록체인 용어 노출 최소화(§0.6). 응답에는 그대로 담는다.
- `GRANT` 행의 `title`은 지급 사유를 담는다 — 가입 자동 지급은 `"Welcome balance"`, 관리자 지급은 API-coin-07의 `memo`를 그대로 쓴다.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `type` | query | string | N | **[v5]** `GRANT`/`PURCHASE`/`REFUND`/`RELEASE`/`DEPOSIT`/`DEPOSIT_RETURN`. 미지정 시 전체 |
| `status` | query | string | N | `PENDING`/`SUBMITTED`/`CONFIRMED`/`FAILED` |
| `page` | query | integer | N | 0-base, 기본 0 |
| `size` | query | integer | N | 기본 20, 최대 100 |
| `sort` | query | string | N | `occurredAt,desc`(기본) / `occurredAt,asc` |

### Body
없음.

### 시스템 처리
1. 회원·지갑 확인 → `type`·`status` 화이트리스트 검증.
2. 상태 전이 없음(조회).
3. 외부 호출 없음(인덱싱된 데이터 사용).
4. 도메인 레코드를 `WalletTx` 뷰로 통합해 `items`/`pageInfo` 반환.
5. `RELEASE`는 **`settlement_share`**(수령 지갑 주소 일치 · `released=true`), `DEPOSIT_RETURN`은 **`performance`**(주최팀 리더 지갑 주소 일치 · `deposit_status=RETURNED`)가 원본이다 — 둘은 운영자 tx 하나가 여러(또는 다른) 지갑으로 보내는 유형이라 `chain_job.wallet_id`에 수령자가 없다. 나머지 4종만 `chain_job.wallet_id`로 찾는다. 두 원본을 합쳐 `occurredAt` 순으로 정렬한 뒤 페이지를 자른다.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "rate": { "currency": "USD", "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "items": [
      {
        "walletTxId": "job_9901",
        "type": "GRANT",
        "direction": "IN",
        "amount": 100000,
        "currency": "KRW",
        "status": "CONFIRMED",
        "refType": "CHAIN_JOB",
        "refId": 9901,
        "title": "Welcome balance",
        "signerType": "OPERATOR",
        "feeDelegated": false,
        "txHash": "0x4a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293",
        "explorerUrl": "https://kairos.kaiascan.io/tx/0x4a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293",
        "occurredAt": "2026-09-10T19:58:12+09:00"
      },
      {
        "walletTxId": "share_7701",
        "type": "RELEASE",
        "direction": "IN",
        "amount": 3000,
        "currency": "KRW",
        "status": "CONFIRMED",
        "refType": "SETTLEMENT_SHARE",
        "refId": 7701,
        "title": "합정 3밴드 합동공연",
        "signerType": "OPERATOR",
        "feeDelegated": false,
        "txHash": "0x6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f607182934a5b",
        "explorerUrl": "https://kairos.kaiascan.io/tx/0x6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f607182934a5b",
        "occurredAt": "2026-09-21T11:20:44+09:00"
      },
      {
        "walletTxId": "pay_8801",
        "type": "PURCHASE",
        "direction": "OUT",
        "amount": 50000,
        "currency": "KRW",
        "status": "CONFIRMED",
        "refType": "ORDER",
        "refId": 5501,
        "title": "합정 3밴드 합동공연 · 일반 2매",
        "signerType": "USER",
        "feeDelegated": true,
        "txHash": "0x5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f607182934a",
        "explorerUrl": "https://kairos.kaiascan.io/tx/0x5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f607182934a",
        "occurredAt": "2026-09-10T20:03:11+09:00"
      }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 9, "hasNext": false }
  },
  "msg": ""
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `feeDelegated` | boolean | **[v5]** `signerType=USER` 행은 항상 `true`(운영지갑이 수수료를 냈다). `OPERATOR` 행은 `false` |
| `refType` | string | 그 행의 원본 — `CHAIN_JOB`(`GRANT`·`PURCHASE`·`REFUND`·`DEPOSIT`) / `ORDER`(결제·환불의 주문 참조) / `SETTLEMENT_SHARE`(`RELEASE`) / `PERFORMANCE`(`DEPOSIT_RETURN`). `walletTxId` 접두도 원본을 따른다 — `job_`·`pay_`·`share_`·`deposit_return_` |

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `type`·`status`·`sort`, `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 404 | `WALLET_NOT_FOUND` | 지갑 미연결 회원 |

---
### API-wallet-03 외부 지갑 등록 챌린지 발급 **[v6 변경 — MVP 승격(P1 → P0)]**
`POST /api/v1/wallets/challenge` · 권한: 회원 · 우선: **P0** · 연관 화면: `C-05 지갑 등록` · 연관 기능: `F-wallet-01 지갑 등록(첫 1회 선택)`

## 요구사항
- **[v6]** 지갑 등록 화면에서 "이미 지갑이 있다"를 고른 회원이 **그 지갑의 소유를 증명**하도록 서명할 메시지를 발급한다. Web3Auth 모달의 외부 지갑 어댑터에 의존하지 않는 **자체 소유 증명 경로**이며, v5에서 P1이던 이 API가 v6에서 MVP 필수 경로가 됐다(결정 v2 §14-35). 서버 난수 `nonce` + **도메인 바인딩**(서비스 도메인·chainId·회원 ID)을 포함하고 **5분 유효, 1회용**이다(결정 v2 §2.3).
- 챌린지는 **테이블로 만들지 않는다** — Redis `wallet:challenge:{memberId}` TTL 300초에 저장한다 [권](결정 v2 §8 · 키 규약 §0.12). 같은 회원이 다시 호출하면 이전 챌린지를 덮어써 무효화한다.
- 서명할 메시지는 EIP-191 `personal_sign` 대상 평문이며, 사용자가 **읽고 무엇에 서명하는지 알 수 있는 문장**이어야 한다. 서버는 이 문장을 그대로 저장해 검증에 쓴다.
- 이미 지갑이 `LINKED`인 회원은 `COMMON_CONFLICT`로 막는다 — MVP에는 교체 화면이 없다(미결 안건 14, 전용 코드 `WALLET_ALREADY_LINKED`는 §16.1).
- **회원당 10회/분** 호출 제한(§0.9). 챌린지 발급 자체는 가스도 온체인 작업도 쓰지 않는다.
- 검증·등록은 **`POST /api/v1/wallets`**(API-wallet-04)가 이어받는다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `address` | string | Y | `0x` + 40 hex(42자) | 등록하려는 외부 지갑 주소. 검증 단계의 복구 주소와 일치해야 함 |

```json
{ "address": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b" }
```

### 시스템 처리
1. 회원 식별 → 기존 `wallet` 존재 확인(있으면 409) → 주소 형식 확인 → **다른 회원이 이미 등록한 주소인지** 확인(있으면 409).
2. 상태 전이 없음. Redis `wallet:challenge:{memberId}`에 `{nonce, address, message, issuedAt}` 저장(TTL 300초, 기존 값 덮어쓰기 — §0.12).
3. 외부 호출 없음.
4. 챌린지 발급 감사 로그(`action_type=WALLET_LINK`).

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "nonce": "3f9c1d2e4b5a6c8d",
    "message": "B204 Stage wants you to link this wallet.\n\nAddress: 0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b\nMember: 1024\nChain: Kaia Kairos (1001)\nDomain: b204.ssafy.io\nNonce: 3f9c1d2e4b5a6c8d\nIssued At: 2026-09-02T15:20:00+09:00\n\nThis signature does not authorize any transfer.",
    "signMethod": "personal_sign",
    "chainId": 1001,
    "expiresAt": "2026-09-02T15:25:00+09:00"
  },
  "msg": ""
}
```

`message`는 **한 글자도 바꾸지 않고** 지갑에 넘겨야 한다. 서버는 저장한 원문으로만 서명을 검증한다.

### 4xx
```json
{ "code": "COMMON_CONFLICT", "data": null, "msg": "이미 연결된 지갑이 있습니다. 관리자에게 문의해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 주소 형식 위반 |
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 409 | `COMMON_CONFLICT` | 요청자에게 이미 `LINKED` 지갑이 있음, 또는 그 주소가 다른 회원에 등록됨 (전용 코드 `WALLET_ALREADY_LINKED`는 §16.1) |
| 429 | `COMMON_TOO_MANY_REQUESTS` | 회원당 10회/분 초과 (§0.9) |

---

### API-wallet-04 지갑 등록(첫 1회 선택) **[v6 변경 — 경로·역할 확장, P1 → P0]**
`POST /api/v1/wallets` · 권한: 회원 · 우선: **P0** · 연관 화면: `C-05 지갑 등록` · 연관 기능: `F-wallet-01 지갑 등록(첫 1회 선택)`

## 요구사항
- **[v6] 두 갈래를 한 엔드포인트로 받는다.** 요청 본문 `provider`가 `WEB3AUTH`면 소셜 로그인으로 만들어진 MPC 지갑을, `EXTERNAL`이면 사용자가 이미 쓰는 지갑(**MVP는 Kaia Wallet**)을 등록한다. v5의 경로 `POST /api/v1/wallets/verify`(= `EXTERNAL` 전용 챌린지 검증)를 **컬렉션 생성 경로 `POST /api/v1/wallets`로 확장**한 것이다(결정 v2 §14-35). 번호는 그대로 API-wallet-04를 쓴다 — 삭제된 번호(API-wallet-05)는 재사용하지 않는다.
- **회원당 첫 1회만 성공한다.** 이미 지갑이 있으면 `COMMON_CONFLICT`(409, 전용 코드 `WALLET_ALREADY_LINKED`는 §16.1). 교체는 P1이다(`/wallets/me/replace` 신설 제안 — §16.2).
- `provider = WEB3AUTH`면 `nonce`·`signature`를 받지 않는다. 서버는 요청자의 idToken `wallets` 클레임 주소와 `address`가 같은지 확인한다(로그인 세션에 그 클레임을 보관한다).
- `provider = EXTERNAL`이면 API-wallet-03이 발급한 `nonce`와 그 메시지에 대한 `signature`가 필수다. 서버는 Redis `wallet:challenge:{memberId}`(§0.12)를 조회해 `nonce`·`address`·미만료를 확인하고 `ecrecover`로 복원한 주소를 대조한 뒤 **키를 삭제**한다(1회용).
- **등록 성공 즉시 기본 지급 `MINT` job을 건다** — `YoYo.mint(to=등록 주소, 100000, grantRef)`, 멱등키 `grant:signup:{memberId}`(§0.8). 온체인 확정을 기다리지 않으므로 **`202 Accepted`** 다. 지급이 실패해도 지갑 등록 자체는 성공으로 남기고 관리자 재지급(API-coin-07)으로 복구한다.
- `Idempotency-Key` 헤더는 요구하지 않는다 — "회원당 1개" 제약과 회원 단위 지급 멱등키가 중복을 막는다.
- **서버는 사용자 개인키·니모닉·MPC 샤드를 받지 않는다.** 받는 것은 주소와(외부 지갑이면) 서명 문자열뿐이며, 그 서명은 어떤 자금 이동 권한도 위임하지 않는다(챌린지 메시지 문장에 그렇게 적혀 있다).
- **[v5 유지]** 등록 직후 네이티브 코인을 넣는 단계가 없다. 수수료는 운영지갑이 대납한다(§0.4·P-3).
- 등록 후 이 회원의 결제·보증금·동의 서명은 이 지갑으로만 가능하다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `provider` | string | Y | `WEB3AUTH` / `EXTERNAL` | 등록할 지갑 종류. 첫 등록 때 결정되며 이후 변경은 P1 |
| `address` | string | Y | `0x` + 40 hex(42자) | 등록할 주소. `WEB3AUTH`면 idToken `wallets` 클레임과, `EXTERNAL`이면 챌린지의 주소와 일치해야 함 |
| `nonce` | string | `EXTERNAL`만 | 16 hex | API-wallet-03이 발급한 값 |
| `signature` | string | `EXTERNAL`만 | `0x` + 130 hex(132자) | 챌린지 메시지에 대한 `personal_sign` 결과 |
| `walletLabel` | string | N | 최대 20자 | `KAIA_WALLET` / `METAMASK` 등 표시용 라벨 |

```json
{
  "provider": "EXTERNAL",
  "address": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b",
  "nonce": "3f9c1d2e4b5a6c8d",
  "signature": "0x9f1c...1b",
  "walletLabel": "KAIA_WALLET"
}
```

`provider = WEB3AUTH`인 요청은 `{ "provider": "WEB3AUTH", "address": "0x6d5c…4b3a" }` 두 필드로 끝난다.

### 시스템 처리
1. 회원 확인 → 기존 지갑 유무 확인(있으면 409) → 주소 형식·전역 중복 확인(다른 회원의 주소면 409, 보안 로깅 대상).
2. provider별 소유 증명 — `WEB3AUTH`: 세션의 idToken `wallets` 클레임 주소 대조 / `EXTERNAL`: Redis `wallet:challenge:{memberId}` 조회 → `nonce`·`address`·미만료 확인 → `ecrecover(message, signature)` 복원 주소 대조.
3. 상태 전이: `wallet` insert(`provider`, `status=LINKED`, `verified_at=now`) → `chain_job`(`MINT`, `OPERATOR`, `amount=100000`, 멱등키 `grant:signup:{memberId}`) insert → MINTER 키 큐 등록(비동기) → `EXTERNAL`이면 Redis 챌린지 키 **삭제**. **[v6]** `MINT` 확정 시 수신 지갑의 `wallet:balance` 갱신(§0.12).
4. 외부 호출: `YoYo.mint` 전송(MINTER, 비동기 — 3의 job 큐가 처리).
5. `wallet`·`chain_job` 저장 + 감사 로그(`action_type=WALLET_LINK` — 주소·provider·검증 시각, 지급은 `action_type=GRANT`). **서명 원문은 로그에 남기고 개인키류는 존재하지 않는다.**

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": {
    "wallet": {
      "walletId": 4402,
      "provider": "EXTERNAL",
      "walletLabel": "KAIA_WALLET",
      "address": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b",
      "status": "LINKED",
      "verifiedAt": "2026-09-19T14:02:11+09:00",
      "explorerUrl": "https://kairos.kaiascan.io/address/0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b"
    },
    "grantJobId": "chain_01J9G1A2B3",
    "signupGrant": {
      "amount": 100000,
      "currency": "KRW",
      "display": { "currency": "USD", "approx": 74.07, "rate": 1350.0, "asOf": "2026-09-19T09:00:00+09:00" }
    },
    "pollAfterMs": 1500
  },
  "msg": "지갑을 연결했습니다. 기본 잔액을 지급하고 있습니다."
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `wallet` | object | 등록된 지갑. 이 응답 이후 API-member-01·05의 `wallet`도 `null`이 아니게 된다 |
| `grantJobId` | string | 기본 지급 `MINT` job 식별자. 프론트는 API-chain-01로 폴링해 `CONFIRMED`가 되면 "Welcome — your balance is 100,000 YoYo" 안내를 확정 표시한다(화면 C-05) |
| `signupGrant` | object | 지급 금액(§0.5) |
| `pollAfterMs` | integer | 첫 폴링까지 대기 시간(§0.3) |

### 4xx/5xx
```json
{ "code": "COMMON_VALIDATION_FAILED", "data": null, "msg": "서명 확인에 실패했습니다. 다시 시도해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 주소·서명 형식 위반, `EXTERNAL`인데 `nonce`·`signature` 누락, `ecrecover` 복원 주소 ≠ `address`, `nonce` 불일치 (전용 코드 `WALLET_SIGNATURE_INVALID`는 §16.1) |
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 409 | `COMMON_CONFLICT` | 요청자에게 이미 지갑이 있음, 그 주소가 다른 회원에 등록됨, 챌린지 만료(5분)·재사용·발급 이력 없음 (전용 코드 `WALLET_ALREADY_LINKED`·`WALLET_CHALLENGE_EXPIRED`는 §16.1) |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | `WEB3AUTH` 경로에서 JWKS 조회 실패이며 캐시도 없음 |

> **[v6] 경로 변경 고지** — v5의 `POST /api/v1/wallets/verify`는 v6에서 쓰지 않는다. 결정 문서 v2 §9 인벤토리의 경로 표기도 §14-35에서 함께 갱신된다(§16.3 #1과 같은 성격의 "인벤토리 문구 갱신" 항목).


### 삭제된 API — §3 말미 기록

- **API-wallet-05 (`POST /api/v1/wallets/me/gas`)** — **[v5 삭제]** Kaia 수수료 대납을 채택해 사용자 지갑에 네이티브 코인을 넣을 이유가 없어졌다(결정 v1 §14-4·v2 §6 P-3). v4에서 이미 "삭제(P1 예비)"였고 v5에서 경로·예약을 모두 정리했다. 운영지갑(fee payer)의 잔액 관리는 관리자 영역이며 API-admin-07(P1)이 다룬다.
- **v3 팀 지갑 경로 2개(`GET /teams/{teamId}/wallet`·`…/transactions`)** — v4에서 회원 기준 `GET /wallets/me`·`GET /wallets/me/transactions`로 대체됐다(변경 없음).

---
## 4. performance — 공연

공연 상태 전이: `DRAFT` → `PENDING_AGREEMENT` → `ON_SALE` → `SALE_CLOSED` → `ENDED` / `CANCELLED`. 좌석 없는 **스탠딩**, 티켓 타입 1~N개, 1인 1공연 최대 4매 [권] P-6. 판매 시작 이후 공연 정보·티켓 옵션·참여팀·정산 규칙은 바꿀 수 없다(컨트랙트가 강제, `PERFORMANCE_ALREADY_ON_SALE`).

**[v4] 보증금 단계가 추가됐다(P-21).** 공연 생성 시 `deposit_amount`(기본 **50,000 YoYo** [권])가 정해지고 `deposit_status=UNPAID`로 시작한다. **생성팀 리더가 `approve` + `RevenueSplitter.deposit(showId)`를 직접 서명**해 `PAID`가 되어야 정산 규칙 설정(API-rule-01)으로 넘어갈 수 있다. 서명 흐름은 §0.4 prepare/signed-tx 패턴이고 API-performance-13·14가 담당한다. 반환은 정산 `RELEASED` 확정 시 또는 공연 취소 일괄 환불 완료 시 운영자가 `returnDeposit`으로 실행한다. 몰수(`forfeitDeposit`)는 P1이다.

**[v4] 티켓 가격 단위는 YoYo(=원)** 이고, 공개 응답의 금액에는 `display`가 붙는다(§0.5). `performance.deposit_bank_tx_id`는 삭제되고 `deposit_job_id`·`deposit_tx_hash`·`deposit_return_tx_hash`로 대체됐다(결정 v2 §8 #6).

### API-performance-01 공연 생성 **[v4 변경 — 보증금 필드 추가]**
`POST /api/v1/performances` · 권한: 리더 · 우선: P0 · 연관 화면: `P-03 공연 생성·수정` · 연관 기능: `F-performance-01 공연 생성`

## 요구사항
- 팀 리더가 공연 기본 정보(제목·소개·일시·장소)와 단독/공동 여부를 등록한다. 생성자 팀은 자동으로 참여팀 1번이 된다.
- 생성 직후 상태는 `DRAFT`, **[v4] `depositStatus`는 `UNPAID`**다. 응답의 `depositAmount`·`depositStatus`·`nextAction`으로 P-03 화면이 보증금 단계를 띄운다. 보증금이 `PAID`가 아니면 API-rule-01이 막힌다.
- **취소 마감(공연일 D-3 00:00)과 판매 마감(공연 시작 1분 전)은 서버가 `startAt`에서 자동 계산한다** [권] P-8·P-9. 둘 다 요청 필드로 받지 않고 응답으로만 내려준다.
- 공연 일시가 과거이거나 `endAt` ≤ `startAt`이면 `PERFORMANCE_DATE_INVALID`다.
- **[v4] 생성 시점에 리더 지갑 연결을 확인**한다. 미연결이면 `WALLET_NOT_FOUND`다 — 보증금 서명을 할 수 없기 때문이다.
- 공연 생성과 동시에 **검표 페이지 링크**(서명 토큰)가 자동 생성된다. 조회는 API-performance-10이다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `hostTeamId` | integer | Y | 요청자가 리더인 팀 | 주최(생성자) 팀 |
| `title` | string | Y | 1~100자 | 공연 제목 |
| `description` | string | N | 최대 2000자 | 소개 |
| `posterImageUrl` | string | N | https URL, 최대 500자 | 포스터 |
| `venueName` | string | Y | 1~100자 | 공연장 이름 |
| `venueAddress` | string | Y | 1~200자 | 주소 |
| `startAt` | string(ISO 8601) | Y | 현재 이후 | 공연 시작 일시 |
| `endAt` | string(ISO 8601) | Y | `startAt` 이후 | 공연 종료 일시 — `ENDED` 전이 기준 |
| `jointPerformance` | boolean | Y | — | 공동 공연 여부. `true`면 참여팀 2팀 이상 필수 |

`depositAmount`는 요청 필드가 **아니다** — 플랫폼 고정값 50,000 YoYo다(P-21, 미결 안건 9).

**[2026-09-18] 화면은 `jointPerformance`를 입력받지 않고 `false`를 고정해 보낸다** — 화면설계 v7 P-03(공연 생성)에는 참여팀 초대 단계가 아직 없어 생성 시점에 참여팀이 1팀뿐이다. `true`로 보내면 참여팀 2팀 하한(`TEAM_MIN_COUNT_NOT_MET`)에 걸려 생성 자체가 실패한다. 필드 자체는 서버 계약대로 required로 남는다. 데모·리허설 범위는 단독 공연만. 되살리려면 생성 흐름에 참여팀 초대 단계가 규칙·보증금보다 앞에 와야 한다(S15P21B204-136·149).

**[2026-09-21 — S15P21B204-136] 되살렸다.** 화면설계 v7.2가 P-03 준비 흐름을 `정보·티켓 옵션 → 참여팀(합동만) → 정산 규칙 → 규칙 동의 → 보증금 → 판매 시작` 5단계로 확정해 참여팀 초대가 규칙·보증금보다 앞에 온다. 생성 화면은 다시 `jointPerformance`를 입력받아 그 값을 보낸다(생성 시점에만 — API-performance-04 수정 요청에는 이 필드가 없다). 서버 계약·선행 조건은 바뀌지 않는다 — 규칙 저장이 `createShow`를 걸고(API-rule-01), 동의(API-rule-03)는 보증금을 요구하지 않으며, 판매 시작(API-rule-04)만 전원 동의 + `deposit_status = PAID`를 함께 요구한다.

```json
{
  "hostTeamId": 7,
  "title": "합정 3밴드 합동공연",
  "description": "인디록 3팀 합동 무대",
  "posterImageUrl": "https://cdn.b204.ssafy.io/p/12.png",
  "venueName": "합정 언플러그드",
  "venueAddress": "서울 마포구 양화로 000",
  "startAt": "2026-09-19T19:00:00+09:00",
  "endAt": "2026-09-19T22:00:00+09:00",
  "jointPerformance": true
}
```

### 시스템 처리
1. 리더 권한 확인 → **리더 `wallet` 존재·`LINKED` 확인** → 일시 정합성 검증(`startAt` 미래, `endAt` > `startAt`).
2. 상태 전이: `performance` 생성(`DRAFT`, `deposit_amount=50000`, `deposit_status=UNPAID`). `cancelDeadlineAt = startAt` 날짜 기준 D-3 00:00, `saleCloseAt = startAt - 1분`으로 서버가 계산.
3. 외부 호출 없음 — 컨트랙트 `createShow`는 판매 시작(API-rule-04)에서 하고, 보증금 서명은 API-performance-13·14다.
4. `performance` + 생성자 팀 `performance_participant`(수락 상태, `wallet_address`는 `createShow` 시점에 스냅샷) 저장 + 검표 링크 토큰 발급.

## Response
### 201 Created
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "title": "합정 3밴드 합동공연",
    "status": "DRAFT",
    "hostTeamId": 7,
    "startAt": "2026-09-19T19:00:00+09:00",
    "endAt": "2026-09-19T22:00:00+09:00",
    "saleCloseAt": "2026-09-19T18:00:00+09:00",
    "cancelDeadlineAt": "2026-09-16T00:00:00+09:00",
    "deposit": {
      "status": "UNPAID",
      "amount": 50000,
      "currency": "KRW",
      "display": { "currency": "USD", "approx": 37.04, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
      "leaderBalance": 120000,
      "sufficient": true
    },
    "nextAction": "PAY_DEPOSIT"
  },
  "msg": "공연이 생성되었습니다. 보증금을 납부해 주세요."
}
```

`nextAction`은 `PAY_DEPOSIT` → `SET_RULES` → `COLLECT_AGREEMENTS` → `START_SALE` 순서로 바뀌며 P-03 화면 진행 표시에 쓴다.

### 4xx
```json
{ "code": "PERFORMANCE_DATE_INVALID", "data": null, "msg": "공연 일시를 다시 확인해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 형식 위반, `saleCloseAt`·`cancelDeadlineAt`·`depositAmount` 전달(서버 결정 필드) |
| 400 | `PERFORMANCE_DATE_INVALID` | 과거 일시, `endAt` ≤ `startAt` |
| 403 | `COMMON_FORBIDDEN` | `hostTeamId` 팀의 리더가 아님 |
| 404 | `TEAM_NOT_FOUND` | 존재하지 않는 `hostTeamId` |
| 404 | `WALLET_NOT_FOUND` | **[v4]** 리더 지갑 미연결 |

---

### API-performance-02 공연 목록(공개)
`GET /api/v1/performances` · 권한: GUEST(인증 불필요) · 우선: P0 · 연관 화면: `A-01 홈·공연 탐색`, `A-15 공연 목록` · 연관 기능: `F-performance-02 공연 목록 탐색`

## 요구사항
- 비로그인 방문자도 볼 수 있는 공개 목록이다. **`ON_SALE`·`SALE_CLOSED` 공연만** 노출한다 [권]. 검색어(제목·팀명)·날짜 범위로 필터하고 기본 정렬은 공연 시작 일시 오름차순이다.
- **[v4]** 금액은 §0.5 축약형(`data.rate` + 항목 `minPriceAmount`)이며, 문구·고지는 `Accept-Language`에 따라 en/ko다. 목록에 지갑 주소·해시는 담지 않는다.
- 조회 API p95 ≤ 500ms 목표 대상이다(PERF-01). 목록 응답은 30초 캐시하며, **환율이 바뀌면 캐시를 무효화**한다 [권].

## Request
### Headers
- `Accept: application/json` · `Accept-Language: en` / `ko`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `keyword` | query | string | N | 최대 50자. 제목·참여팀명 부분 일치 |
| `fromDate` | query | string(ISO date) | N | 공연일 시작 |
| `toDate` | query | string(ISO date) | N | 공연일 종료. `fromDate` 이상 |
| `status` | query | string | N | `ON_SALE` / `SALE_CLOSED`. 미지정 시 둘 다 |
| `page`·`size`·`sort` | query | — | N | §0.2. `sort`는 `startAt,asc`(기본)/`startAt,desc`/`createdAt,desc` |

### Body
없음.

### 시스템 처리
1. 쿼리 검증(`toDate` ≥ `fromDate`, `status`·`sort` 허용값).
2. 상태 전이 없음(조회).
3. 외부 호출 없음.
4. 공개 대상 상태만 필터해 `items`/`pageInfo` + 유효 환율 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "rate": { "currency": "USD", "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "items": [
      {
        "performanceId": 12,
        "title": "합정 3밴드 합동공연",
        "posterImageUrl": "https://cdn.b204.ssafy.io/p/12.png",
        "ticketImageUrl": "https://cdn.b204.ssafy.io/t/12.png",
        "venueName": "합정 언플러그드",
        "startAt": "2026-09-19T19:00:00+09:00",
        "status": "ON_SALE",
        "minPriceAmount": 25000,
        "currency": "KRW",
        "soldOut": false,
        "teamNames": ["블루노트", "새벽세시", "노이즈캔슬"]
      }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 37, "hasNext": true }
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `size` 100 초과, 날짜 역전, 허용되지 않는 `status`·`sort` |
| 429 | `COMMON_TOO_MANY_REQUESTS` | 호출 한도 초과 |

---

### API-performance-03 공연 상세(공개)
`GET /api/v1/performances/{performanceId}` · 권한: GUEST(인증 불필요) · 우선: P0 · 연관 화면: `A-02 공연 상세` · 연관 기능: `F-performance-03 공연 상세 조회`

## 요구사항
- 출연팀·일시·장소·티켓 옵션(잔여 수량)과 **공개 검증 페이지 링크**를 준다. **[v4]** 가격은 YoYo 값 + `display` 환산을 함께 담아 "25,000 YoYo ≈ $18.52"로 표시하게 한다(P-22).
- 관객 화면이므로 지갑 주소·해시·컨트랙트 용어를 담지 않는다(§0.7). 참여팀 지갑 주소는 API-verify-01에서만 준다.
- 티켓 타입별 잔여 수량은 Redis 재고 기준 근사값이다. 확정은 주문 생성 시점이며 경합에서 밀리면 `TICKET_SOLD_OUT`이다.
- 취소 마감 시각(`cancelDeadlineAt`)을 함께 내려 A-11 환불 안내에 쓴다 [권] P-8. **[v4]** 환불이 지갑 잔액으로 돌아간다는 고지(`refundPolicyNotice`)를 함께 담는다.
- `DRAFT`·`PENDING_AGREEMENT` 공연은 생성자·참여팀 리더에게만 보이고, 그 외에는 `PERFORMANCE_NOT_FOUND`로 존재를 숨긴다 [권].

## Request
### Headers
- `Accept: application/json` · `Accept-Language` · (선택) `Authorization: Bearer {accessToken}` — 미공개 공연을 관계자가 미리 볼 때만

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
없음.

### 시스템 처리
1. 공연 조회 → 공개 상태가 아니면 요청자의 관계자 여부 확인.
2. 상태 전이 없음(조회).
3. 외부 호출 없음(온체인 값은 API-verify-01에서).
4. `performance` + `ticket_type` + `performance_participant` + Redis 재고 + 유효 환율 조합 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "title": "합정 3밴드 합동공연",
    "description": "인디록 3팀 합동 무대",
    "posterImageUrl": "https://cdn.b204.ssafy.io/p/12.png",
    "venueName": "합정 언플러그드",
    "venueAddress": "서울 마포구 양화로 000",
    "startAt": "2026-09-19T19:00:00+09:00",
    "endAt": "2026-09-19T22:00:00+09:00",
    "saleCloseAt": "2026-09-19T18:00:00+09:00",
    "cancelDeadlineAt": "2026-09-16T00:00:00+09:00",
    "status": "ON_SALE",
    "jointPerformance": true,
    "purchaseLimitPerMember": 4,
    "rate": { "currency": "USD", "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "participants": [
      { "teamId": 7, "teamName": "블루노트", "host": true },
      { "teamId": 9, "teamName": "새벽세시", "host": false },
      { "teamId": 11, "teamName": "노이즈캔슬", "host": false }
    ],
    "ticketTypes": [
      { "ticketTypeId": 31, "name": "일반", "price": { "amount": 25000, "currency": "KRW", "display": { "currency": "USD", "approx": 18.52, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" } }, "totalQuantity": 80, "remainingQuantity": 41 },
      { "ticketTypeId": 32, "name": "응원", "price": { "amount": 35000, "currency": "KRW", "display": { "currency": "USD", "approx": 25.93, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" } }, "totalQuantity": 20, "remainingQuantity": 12 }
    ],
    "refundPolicyNotice": "Refunds are returned to your balance in Korean won.",
    "verificationUrl": "https://b204.ssafy.io/verify/12"
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않거나 비공개 상태를 비관계자가 조회 |

---

### API-performance-04 공연 수정(잠금 전)
`PATCH /api/v1/performances/{performanceId}` · 권한: 생성자 · 우선: P0 · 연관 화면: `P-03 공연 생성·수정` · 연관 기능: `F-performance-04 공연 정보 수정`

## 요구사항
- `DRAFT`·`PENDING_AGREEMENT`에서만 수정할 수 있다. `ON_SALE` 이후에는 `PERFORMANCE_ALREADY_ON_SALE`이다. 생성자 팀 리더만 수정한다(SEC-03).
- 일시를 바꾸면 `cancelDeadlineAt`·`saleCloseAt`을 다시 계산한다 [권] P-8.
- 규칙이 이미 설정돼 `PENDING_AGREEMENT`인데 일시·공동 여부를 바꾸면 **기존 팀별 동의를 전부 초기화**(`RuleAgreement` → `PENDING`)하고 규칙 해시를 재산출한다 [권]. **[v4]** 이미 `SIGNING`(tx 보고 후 receipt 대기) 상태인 동의도 `PENDING`으로 되돌리고, 그 `chain_job`은 `FAILED`(사유: 규칙 변경)로 닫는다.
- **[v4] 보증금은 초기화 대상이 아니다.** 이미 납부된 `deposit_status=PAID`는 유지된다 — 온체인 `deposit`은 공연 단위 1회이고 규칙 해시와 무관하기 때문이다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `title` | string | N | 1~100자 | 제목 |
| `description` | string | N | 최대 2000자 | 소개 |
| `posterImageUrl` | string | N | https URL | 포스터 |
| `venueName` | string | N | 1~100자 | 공연장 |
| `venueAddress` | string | N | 1~200자 | 주소 |
| `startAt` | string(ISO 8601) | N | 현재 이후 | 시작 일시 |
| `endAt` | string(ISO 8601) | N | `startAt` 이후 | 종료 일시 |

`saleCloseAt`·`cancelDeadlineAt`·`depositAmount`는 요청 필드가 아니다. **`jointPerformance`도 없다** — 생성 후 공동 공연 여부를 바꿀 수단이 없다(요구사항 항목의 "공동 여부를 바꾸면"은 향후 필드가 추가될 때를 대비한 서술이다). 화면이 생성 시 `false`로 고정하는 현재 범위에서는 미치는 영향이 없지만, 되살리는 시점에는 이 필드 추가가 명세 개정 사항이다(화면설계 v7 P-03, API-performance-01 [2026-09-18] 메모 참조).

```json
{ "venueName": "합정 언플러그드 B홀", "startAt": "2026-09-19T19:30:00+09:00", "endAt": "2026-09-19T22:30:00+09:00" }
```

### 시스템 처리
1. 생성자 권한 확인 → 상태(`DRAFT`·`PENDING_AGREEMENT`) 확인 → 일시 정합성 검증.
2. 상태 전이: 일시·공동 여부 변경 시 `rule_agreement` `AGREED`·`SIGNING` → `PENDING` 초기화(진행 중 `chain_job`은 `FAILED`로 닫는다). `deposit_status`는 유지.
3. 외부 호출 없음(아직 `createShow` 전 구간).
4. `performance` 갱신 + `cancelDeadlineAt`·`saleCloseAt` 재계산.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": { "performanceId": 12, "status": "PENDING_AGREEMENT", "startAt": "2026-09-19T19:30:00+09:00", "saleCloseAt": "2026-09-19T18:30:00+09:00", "cancelDeadlineAt": "2026-09-16T00:00:00+09:00", "agreementsReset": true, "depositStatus": "PAID" },
  "msg": "공연 정보가 수정되었습니다. 참여팀 동의를 다시 받아야 합니다."
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 형식 위반 |
| 400 | `PERFORMANCE_DATE_INVALID` | 과거 일시, 일시 역전 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 409 | `PERFORMANCE_ALREADY_ON_SALE` | 상태가 `ON_SALE` 이후 |
| 409 | `PERFORMANCE_INVALID_STATUS` | 상태가 `CANCELLED`·`ENDED` |

---

### API-performance-16 공연 미디어 저장
`POST /api/v1/performances/{performanceId}/media/{kind}` · 권한: 생성자 · 우선: P0 · 연관 화면: `P-03 공연 생성·수정`

## 요구사항
- `kind`는 `poster`·`ticket-artwork` 둘 중 하나다.
- `DRAFT`·`PENDING_AGREEMENT` 상태에서 생성자 팀 리더만 저장한다.
- `multipart/form-data`의 `file`로 JPEG·PNG·WebP 5MB 이하만 받는다.
- `poster`를 저장하면 `performance.poster_image_url`을 공개 조회 URL로 갱신한다.

## Response
### 200 OK
```json
{ "code": "SUCCESS", "data": { "imageUrl": "/api/v1/performances/12/media/poster" }, "msg": "" }
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | kind·파일 형식 오류, 빈 파일, 5MB 초과 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 공연 없음 |
| 409 | `PERFORMANCE_ALREADY_ON_SALE`·`PERFORMANCE_INVALID_STATUS` | 수정 불가 상태 |

---

### API-performance-17 공연 미디어 조회
`GET /api/v1/performances/{performanceId}/media/{kind}` · 권한: GUEST · 우선: P0 · 연관 화면: `A-01·A-02·A-03`

## 요구사항
- 저장된 `poster`·`ticket-artwork` 이미지 바이트와 원본 Content-Type을 공개로 반환한다.
- 저장된 해당 이미지가 없으면 `PERFORMANCE_NOT_FOUND`다.
- 이미지 교체를 즉시 반영하도록 `Cache-Control: no-cache`를 사용한다.

---

### API-performance-15 티켓 옵션 조회
`GET /api/v1/performances/{performanceId}/ticket-types` · 권한: 생성자 · 우선: P0 · 연관 화면: `P-03 공연 생성·수정` · 연관 기능: `F-performance-05 티켓 옵션 설정`

## 요구사항
- P-03 수정 화면이 티켓 옵션만 다시 읽는다. 응답은 **API-performance-05(전체 교체)의 200과 같은 shape**라 화면이 저장 전후로 같은 값을 쓴다.
- 옵션이 하나도 없으면 **빈 배열**이며 404가 아니다(공연 생성 직후가 그렇다).
- 관객용 목록은 API-performance-03의 `ticketTypes`다 — 그쪽은 중첩 금액(`price.amount`)이고 여기는 평면형(`priceAmount`)이다.
- 상태 전이·외부 호출 없음(조회).

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
없음.

### 시스템 처리
1. 생성자 팀 리더 확인.
2. 상태 전이 없음(조회).
3. 외부 호출 없음.
4. `ticket_type` 조회(쓰기 없음).

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "rate": { "currency": "USD", "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "ticketTypes": [
      { "ticketTypeId": 31, "name": "일반", "priceAmount": 25000, "currency": "KRW", "totalQuantity": 80, "remainingQuantity": 41 },
      { "ticketTypeId": 33, "name": "응원", "priceAmount": 35000, "currency": "KRW", "totalQuantity": 20, "remainingQuantity": 12 }
    ]
  },
  "msg": null
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 토큰 없음·만료 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |

---

### API-performance-05 티켓 옵션 설정(잠금 전)
`PUT /api/v1/performances/{performanceId}/ticket-types` · 권한: 생성자 · 우선: P0 · 연관 화면: `P-03 공연 생성·수정` · 연관 기능: `F-performance-05 티켓 옵션 설정`

## 요구사항
- 티켓 타입 1~10개(이름·가격·수량)를 **전체 교체**한다(PUT). 좌석 없는 스탠딩이다 [권] P-6. `ON_SALE` 이후에는 `PERFORMANCE_ALREADY_ON_SALE`이다.
- **[v4] 가격 단위는 YoYo(=원) 정수**다. YoYo `decimals=0`이라 소수를 받지 않으며, 소수·문자열 금액은 `COMMON_VALIDATION_FAILED`다. 표시 통화로 가격을 입력받지 않는다(P-17 — 환율은 표시에만).
- 이미 판매된 수량보다 적게 `totalQuantity`를 줄일 수 없다 [권]. 1인 1공연 최대 4매는 공연 단위 고정이며 이 API로 바꾸지 않는다.
- 응답에는 원 값과 `display` 환산을 함께 담아 P-03 미리보기가 관객 화면과 같은 표기를 쓰게 한다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `ticketTypes` | array | Y | 1~10개 | 티켓 타입 전체 목록 |
| `ticketTypes[].ticketTypeId` | integer | N | 기존 항목 유지 시 지정 | 없으면 신규 생성 |
| `ticketTypes[].name` | string | Y | 1~30자, 공연 내 유니크 | 타입 이름 |
| `ticketTypes[].price` | integer | Y | 0 이상, 1,000,000 이하, **YoYo 정수** | 판매가 |
| `ticketTypes[].totalQuantity` | integer | Y | 1 이상, 5000 이하 | 총 수량 |

```json
{
  "ticketTypes": [
    { "ticketTypeId": 31, "name": "일반", "price": 25000, "totalQuantity": 80 },
    { "name": "응원", "price": 35000, "totalQuantity": 20 }
  ]
}
```

### 시스템 처리
1. 생성자 권한·상태(`DRAFT`·`PENDING_AGREEMENT`) 확인 → 이름 중복·금액(정수·범위)·수량 검증.
2. 상태 전이 없음. 목록에서 빠진 기존 타입은 삭제한다.
3. 외부 호출 없음.
4. `ticket_type` 전체 교체 + Redis 재고 키 재초기화.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "rate": { "currency": "USD", "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "ticketTypes": [
      { "ticketTypeId": 31, "name": "일반", "priceAmount": 25000, "currency": "KRW", "totalQuantity": 80, "remainingQuantity": 80 },
      { "ticketTypeId": 33, "name": "응원", "priceAmount": 35000, "currency": "KRW", "totalQuantity": 20, "remainingQuantity": 20 }
    ]
  },
  "msg": "티켓 옵션이 저장되었습니다."
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 이름 중복, 금액 소수·범위 위반, 수량 위반, 배열 크기 위반 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 404 | `TICKET_OPTION_NOT_FOUND` | 지정한 `ticketTypeId`가 이 공연 소속이 아님 |
| 409 | `PERFORMANCE_ALREADY_ON_SALE` | 상태가 `ON_SALE` 이후 |

---

### API-performance-06 내 팀 참여 공연 목록
`GET /api/v1/performances/me` · 권한: PERFORMER · 우선: P0 · 연관 화면: `P-01 공연자 대시보드` · 연관 기능: `F-performance-06 내 참여 공연 목록 조회`

## 요구사항
- 로그인 회원이 리더인 팀이 **주최하거나 참여 중인** 공연을 `DRAFT`부터 `CANCELLED`까지 전부 준다.
- 각 행에 공연 상태·정산 상태·**[v4] `depositStatus`·`myTeamAgreementStatus`(`PENDING`/`SIGNING`/`AGREED`)·`pendingSignature`**를 담아 대시보드가 "지금 서명할 일"을 뽑을 수 있게 한다.
- `pendingSignature`는 이 회원이 지금 서명해야 하는 작업(`DEPOSIT`/`AGREE`/`TREASURY_IN`) 또는 `null`이다 — P-01 배지의 근거다 [권].
- 초대받았지만 아직 수락하지 않은 공연도 `participationStatus: "INVITED"`로 함께 준다 [권].

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `status` | query | string | N | `DRAFT`/`PENDING_AGREEMENT`/`ON_SALE`/`SALE_CLOSED`/`ENDED`/`CANCELLED` |
| `page`·`size`·`sort` | query | — | N | §0.2. `sort`는 `startAt,desc`(기본)/`startAt,asc` |

### Body
없음.

### 시스템 처리
1. 회원이 리더인 팀 목록 산출.
2. 상태 전이 없음(조회).
3. 외부 호출 없음.
4. `performance_participant` + `performance` + `rule_agreement` + `settlement` 조인 조회 → `items`/`pageInfo`.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "items": [
      {
        "performanceId": 12,
        "title": "합정 3밴드 합동공연",
        "startAt": "2026-09-19T19:00:00+09:00",
        "status": "PENDING_AGREEMENT",
        "settlementStatus": "NONE",
        "depositStatus": "PAID",
        "teamId": 7,
        "host": true,
        "participationStatus": "ACCEPTED",
        "myTeamAgreementStatus": "PENDING",
        "pendingSignature": "AGREE"
      }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 4, "hasNext": false }
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `status`·`sort`, `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 403 | `COMMON_FORBIDDEN` | 리더인 팀이 없는 계정(`PERFORMER` 아님) |

---

### API-performance-07 참여팀 초대
`POST /api/v1/performances/{performanceId}/participants` · 권한: 생성자 · 우선: P0 · 연관 화면: `P-04 참여팀 관리` · 연관 기능: `F-performance-07 참여팀 초대`

## 요구사항
- 생성자 팀 리더가 다른 팀을 공동 공연 참여팀으로 초대한다. `INVITED`로 저장되고 상대 팀 리더의 수락(API-performance-08)으로 확정된다.
- `ON_SALE` 이후에는 초대할 수 없다. 규칙이 설정된 `PENDING_AGREEMENT`에서 초대하면 **기존 동의를 초기화**한다 [권] — 참여팀 구성이 규칙 해시의 입력이다.
- **[v4] 초대 대상 팀의 리더 지갑 연결을 확인**한다. 미연결 팀은 `WALLET_NOT_FOUND`로 막는다 — `createShow`의 `teamWallets` 배열에 넣을 주소가 없고 동의 서명도 불가하기 때문이다.
- 이미 참여·초대 중인 팀은 `TEAM_ALREADY_JOINED`다. 참여팀 상한은 **8팀** [권]이다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `teamId` | integer | Y | 존재하는 팀 | 초대할 팀 |

```json
{ "teamId": 9 }
```

### 시스템 처리
1. 생성자 권한·공연 상태(`DRAFT`·`PENDING_AGREEMENT`) 확인 → 대상 팀 존재·**리더 지갑 `LINKED`**·중복·상한(8팀) 확인.
2. 상태 전이: `performance_participant` 생성(`INVITED`). 규칙 설정 후라면 `rule_agreement` 전체 `PENDING` 초기화.
3. 외부 호출 없음(컨트랙트 참여팀 등록은 판매 시작 시 일괄).
4. `performance_participant` 저장 + 대상 팀 리더에게 알림 [권].

## Response
### 201 Created
```json
{
  "code": "SUCCESS",
  "data": { "performanceId": 12, "teamId": 9, "teamName": "새벽세시", "participationStatus": "INVITED", "leaderWalletLinked": true, "invitedAt": "2026-09-02T16:10:00+09:00" },
  "msg": "참여 초대를 보냈습니다."
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `teamId` 누락, 참여팀 상한 8팀 초과 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 404 | `TEAM_NOT_FOUND` | 존재하지 않는 `teamId` |
| 404 | `WALLET_NOT_FOUND` | **[v4]** 대상 팀 리더 지갑 미연결 |
| 409 | `TEAM_ALREADY_JOINED` | 이미 참여·초대 중인 팀 |
| 409 | `PERFORMANCE_ALREADY_ON_SALE` | 상태가 `ON_SALE` 이후 |

---

### API-performance-08 참여 수락
`POST /api/v1/performances/{performanceId}/participants/{teamId}/accept` · 권한: 초대팀 리더 · 우선: P0 · 연관 화면: `P-04 참여팀 관리` · 연관 기능: `F-performance-08 참여 수락`

## 요구사항
- 초대받은 팀의 리더만 수락한다. 수락 즉시 `ACCEPTED`가 되고 검표 링크(API-performance-10)·입장 현황(API-entry-02)을 볼 수 있게 된다 [권] P-15.
- **[v5]** 응답에 리더 지갑 주소를 담아 화면이 "규칙 동의 서명이 필요합니다"를 안내하게 한다. 팀이 정산금을 받는 곳은 그 지갑 하나이므로 수락 단계에서 확인할 다른 등록 정보가 없다(P-10).
- `ON_SALE` 이후에는 수락할 수 없다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |
| `teamId` | path | integer(BIGINT) | Y | 수락하는 팀 PK. 요청자가 이 팀의 리더여야 함 |

### Body
없음.

### 시스템 처리
1. 초대 존재·상태(`INVITED`) 확인 → 요청자가 해당 팀 리더인지 확인 → 리더 지갑 `LINKED` 재확인.
2. 상태 전이: `performance_participant` `INVITED` → `ACCEPTED`.
3. 외부 호출 없음.
4. `performance_participant` 저장 + 생성자에게 알림 [권].

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "teamId": 9,
    "participationStatus": "ACCEPTED",
    "walletAddress": "0x3c8a1f2b4d6e8091a2b3c4d5e6f708192a3b4c5d",
    "walletProvider": "WEB3AUTH",
    "nextAction": "AGREE_RULES",
    "acceptedAt": "2026-09-02T16:22:00+09:00"
  },
  "msg": "참여가 확정되었습니다. 정산 규칙 동의 서명을 진행해 주세요."
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 403 | `COMMON_FORBIDDEN` | 해당 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 404 | `TEAM_NOT_FOUND` | 초대 기록이 없는 `teamId` |
| 404 | `WALLET_NOT_FOUND` | **[v4]** 리더 지갑 미연결 |
| 409 | `TEAM_ALREADY_JOINED` | 이미 수락 완료 |
| 409 | `PERFORMANCE_ALREADY_ON_SALE` | 상태가 `ON_SALE` 이후 |

---

### API-performance-09 참여팀 제외(잠금 전)
`DELETE /api/v1/performances/{performanceId}/participants/{teamId}` · 권한: 생성자 · 우선: P0 · 연관 화면: `P-04 참여팀 관리` · 연관 기능: `F-performance-09 참여팀 제외`

## 요구사항
- 생성자가 초대 취소 또는 수락한 팀 제외를 한다. **`ON_SALE` 이후에는 불가**하다 — 참여팀 구성이 잠긴 규칙(`createShow`의 `teamWallets`)의 입력이기 때문이다.
- 생성자(주최) 팀 자신은 제외할 수 없다 [권]. 공연을 없애려면 API-performance-12를 쓴다.
- 제외 후 공동 공연인데 참여팀이 2팀 미만이면 판매 시작에서 `TEAM_MIN_COUNT_NOT_MET`으로 막힌다. 제외 자체는 허용한다 [권].
- 규칙 설정 이후라면 기존 팀별 동의를 전부 초기화한다(진행 중 `SIGNING` job은 `FAILED`로 닫는다).

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |
| `teamId` | path | integer(BIGINT) | Y | 제외할 팀 PK |

### Body
없음.

### 시스템 처리
1. 생성자 권한·상태(`DRAFT`·`PENDING_AGREEMENT`) 확인 → 주최 팀 여부 확인.
2. 상태 전이: `performance_participant` 삭제, `rule_agreement` 전체 `PENDING` 초기화.
3. 외부 호출 없음.
4. 삭제 반영 + 감사 로그.

## Response
### 200 OK
```json
{ "code": "SUCCESS", "data": { "performanceId": 12, "teamId": 11, "remainingParticipantCount": 2, "agreementsReset": true }, "msg": "참여팀에서 제외했습니다." }
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 주최 팀 제외 시도 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 404 | `TEAM_NOT_FOUND` | 참여 기록이 없는 `teamId` |
| 409 | `PERFORMANCE_ALREADY_ON_SALE` | 상태가 `ON_SALE` 이후 |

---

### API-performance-10 검표 페이지 링크 조회
`GET /api/v1/performances/{performanceId}/entry-link` · 권한: PERFORMER(참여팀) · 우선: P0 · 연관 화면: `P-04 참여팀 관리`·`P-01 공연자 대시보드` · 연관 기능: `F-performance-10 검표 페이지 링크`

## 요구사항
- 검표 담당자를 회원으로 등록하지 않고, **공연별 서명 토큰이 박힌 검표 페이지 링크**를 공연 생성 시 자동 발급해 두고 이 API로 조회한다. 링크는 해당 공연에만 유효하며 다른 API 권한을 만들지 않는다(SEC-03).
- 조회 권한은 참여팀 소속이다. 토큰 유효기간은 **공연 종료 + 2시간** [권]이며, 생성자는 `rotate=true`로 재발급해 이전 링크를 즉시 무효화할 수 있다.
- 응답에 QR 스캔 화면 URL과 `X-Entry-Token` 헤더로 실을 원본 토큰을 함께 담는다(API-entry-01·02 인증 수단).
- **[v4]** 검표는 온체인·코인과 무관하다 — 이 링크로는 지갑·자금 관련 API에 접근할 수 없다.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |
| `rotate` | query | boolean | N | 기본 `false`. `true`면 재발급하고 이전 링크를 폐기. **공연 생성자만** |

### Body
없음.

### 시스템 처리
1. 공연 존재·참여팀 소속 확인 → `rotate=true`면 생성자 권한 추가 확인.
2. 상태 전이 없음(조회). `rotate=true`일 때만 토큰 버전을 올려 이전 토큰을 무효화한다.
3. 외부 호출 없음.
4. 토큰 발급·재발급 사실을 감사 로그에 남긴다(SEC-11).

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "performanceTitle": "합정 3밴드 합동공연",
    "entryUrl": "https://b204.ssafy.io/entry/12?token=eyJhbGciOi...",
    "entryToken": "eyJhbGciOi...",
    "expiresAt": "2026-09-20T00:00:00+09:00",
    "entryWindow": { "opensAt": "2026-09-19T18:00:00+09:00", "closesAt": "2026-09-19T22:00:00+09:00" },
    "issuedAt": "2026-09-02T15:40:00+09:00",
    "rotated": false
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 403 | `COMMON_FORBIDDEN` | 참여팀 소속이 아님 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자가 아닌 참여팀이 `rotate=true` 호출 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 409 | `PERFORMANCE_INVALID_STATUS` | 공연이 `CANCELLED` |

---

### API-performance-11 판매·선택 현황
`GET /api/v1/performances/{performanceId}/sales` · 권한: PERFORMER(참여팀) · 우선: P0 · 연관 화면: `P-07 판매·선택 현황` · 연관 기능: `F-performance-11 판매·관객 선택 현황 조회`

## 요구사항
- 매출·판매 수량·잔여와 **관람 목적 팀 선택 집계**를 준다. 서버 DB 집계와 **온체인 카운터**(`RevenueSplitter.choiceCountOf`)를 나란히 담아 화면에서 대조하게 한다(REL-06).
- **[v4]** 관객 선택은 별도 tx가 아니라 **`purchase` tx 안에서 기록**된다(결정 v2 §2.4·미결 안건 12). 따라서 DB 집계와 온체인 카운터의 차이는 "receipt 미확정 결제" 또는 "환불 반영 지연"에서만 발생한다.
- **[v4]** 에스크로 잔액(`escrowOf(showId)`)을 함께 담는다 — 판매액 − 환불액 − release가 맞는지 공연자가 즉시 볼 수 있게 한다(결정 v2 §3.8 불변식 2).
- 불일치가 있으면 `counterMatched: false`와 팀별 차이를 표시한다. 이 상태에서는 집계 확정(API-settlement-02)이 `SETTLEMENT_AGGREGATE_MISMATCH`로 막힌다.
- 참여팀 소속만 조회한다. 온체인 조회 결과는 **30초 캐시**한다 [권].

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
없음.

### 시스템 처리
1. 공연 존재·참여팀 소속 확인.
2. 상태 전이 없음(조회).
3. 외부 호출: `choiceCountOf`·`escrowOf` 조회(30초 캐시). 노드 오류 시 DB 집계만 주고 `onchainAvailable: false`.
4. `order_item`·`ticket`·`payment` 집계 + 온체인 값 비교 결과 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "status": "ON_SALE",
    "rate": { "currency": "USD", "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "grossRevenueAmount": 1600000,
    "refundedAmount": 75000,
    "escrowBalanceAmount": 1525000,
    "currency": "KRW",
    "paidTicketCount": 64,
    "cancelledTicketCount": 3,
    "ticketTypes": [
      { "ticketTypeId": 31, "name": "일반", "priceAmount": 25000, "soldQuantity": 52, "remainingQuantity": 28 },
      { "ticketTypeId": 32, "name": "응원", "priceAmount": 35000, "soldQuantity": 12, "remainingQuantity": 8 }
    ],
    "teamChoices": [
      { "teamId": 7, "teamName": "블루노트", "teamIndex": 0, "dbCount": 30, "onchainCount": 30, "matched": true },
      { "teamId": 9, "teamName": "새벽세시", "teamIndex": 1, "dbCount": 21, "onchainCount": 21, "matched": true },
      { "teamId": 11, "teamName": "노이즈캔슬", "teamIndex": 2, "dbCount": 13, "onchainCount": 13, "matched": true }
    ],
    "counterMatched": true,
    "escrowMatched": true,
    "onchainAvailable": true,
    "splitterAddress": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    "refreshedAt": "2026-09-18T11:00:00+09:00"
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 403 | `SETTLEMENT_NOT_PARTICIPANT` | 참여팀 소속이 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 409 | `PERFORMANCE_INVALID_STATUS` | 아직 `DRAFT`·`PENDING_AGREEMENT`라 판매 데이터가 없음 |

---

### API-performance-12 공연 취소(일괄 환불) **[v4 변경 — 코인 환불 + 보증금 반환]**
`POST /api/v1/performances/{performanceId}/cancel` · 권한: 생성자 · 우선: P0 · 연관 화면: `P-10 공연 취소` · 연관 기능: `F-performance-12 공연 취소·일괄 환불`

## 요구사항
- 판매 중 취소 시 **전 티켓을 수수료 없이 일괄 환불**하고 컨트랙트에 `halt(showId)`를 걸어 이후 `refund`만 허용한다 [권] P-12. 정산 잠금 이후에도 **release 전까지**는 가능하다.
- **[v5] 환불은 온체인 코인 이동뿐이다.** 건별로 운영자가 `RevenueSplitter.refund(showId, orderRef, 관객 지갑, teamIndex, amount)`를 보내 **에스크로 → 관객 지갑 YoYo**로 되돌리고, 선택 카운터도 함께 −1 된다. **환불 코인은 관객 지갑으로 돌아온다**(P-20). 그 밖의 되돌리기 수단은 존재하지 않는다.
- **[v4] 일괄 환불이 전부 끝나면 보증금을 반환한다** — 운영자가 `returnDeposit(showId)`를 보내 생성팀 리더 지갑으로 되돌리고 `deposit_status`를 `RETURNED`로 만든다(P-21). 몰수(`forfeitDeposit`)는 P1이다.
- 대량 작업이라 `202 Accepted` + `jobId`이며 건별 부분 성공을 허용한다. 실패 건은 재시도 대기로 남는다(REL-05). 진행률은 API-chain-01의 `results`로 본다.
- `Idempotency-Key`가 필수다. 같은 키 재호출은 최초 `jobId`를 그대로 돌려준다.
- release가 이미 실행된 공연은 온체인 회수가 불가하므로 취소할 수 없다(`SETTLEMENT_ALREADY_RELEASED`).

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Idempotency-Key: {UUIDv4}` **필수**

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `reason` | string | Y | 1~200자 | 취소 사유 — 관객 안내 문구로 그대로 노출 |

```json
{ "reason": "공연장 사정으로 부득이하게 취소되었습니다." }
```

### 시스템 처리
1. 생성자 권한 확인 → 정산이 `RELEASED` 전인지 확인 → 멱등키 확인. 받는 상태는 `ON_SALE`·`SALE_CLOSED`·`ENDED`와, **보증금을 낸 판매 전 공연**(`DRAFT`·`PENDING_AGREEMENT` + `deposit_status = PAID`)이다 — 후자는 환불 대상이 없고 온체인 에스크로에 보증금만 남아 있어, 이 API 가 유일한 회수 경로다[2026-09-18 · S15P21B204-140].
2. 상태 전이: `performance` → `CANCELLED`, `settlement` → `HALTED`, 대상 `ticket` → `CANCELLED`, `ticket_order` → `REFUNDED`, `refund` 레코드 생성(`PENDING`). **판매 전 취소는 앞의 둘만 일어난다** — 결제된 주문이 없어 환불 대상이 없고, `halt` 확정 뒤 `returnDeposit`만 이어진다[2026-09-18 · S15P21B204-140].
3. 외부 호출(202, 전부 OPERATOR 서명): ① `halt(showId)` ② 티켓·주문별 `refund(...)` 순차 전송(nonce 직렬 큐) → 확정마다 `refund` `PROCESSING` → `COMPLETED` ③ 전 건 완료 후 `returnDeposit(showId)`. **이 흐름에는 온체인 tx만 있다** — 외부 정산 경로가 없다.
4. `refund`·`chain_job` 저장, 재고 원복, 관객 알림 발송 [권], 감사 로그.

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": {
    "jobId": "chain_01J8ZC4P7Q",
    "status": "PENDING",
    "pollAfterMs": 2000,
    "performanceId": 12,
    "targetTicketCount": 64,
    "totalRefundAmount": 1600000,
    "currency": "KRW",
    "depositReturnPlanned": true,
    "depositAmount": 50000
  },
  "msg": "공연 취소를 접수했습니다. 환불이 순차적으로 처리됩니다."
}
```

### 4xx
```json
{ "code": "SETTLEMENT_ALREADY_RELEASED", "data": null, "msg": "이미 정산이 완료된 공연입니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `reason` 누락, `Idempotency-Key` 헤더 없음 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 409 | `COMMON_CONFLICT` | 같은 멱등키에 다른 본문, 이미 취소 처리 진행 중 |
| 409 | `PERFORMANCE_INVALID_STATUS` | 보증금을 내지 않은 `DRAFT`·`PENDING_AGREEMENT`(되돌릴 돈이 없어 수정·삭제로 처리) 또는 이미 `CANCELLED` [2026-09-18 · S15P21B204-140] |
| 409 | `SETTLEMENT_ALREADY_RELEASED` | release 완료 후 취소 시도 |
| 409 | `COIN_ESCROW_INSUFFICIENT` | **[v4]** 에스크로 잔액 < 환불 총액(대사 점검 대상) |
| 500 | `CHAIN_GAS_INSUFFICIENT` | 운영지갑 가스 부족 — 관리자 알림 대상 |

---

### API-performance-13 보증금 서명 파라미터 **[v5 변경 — 가스 필드 삭제·수수료 대납]**
`POST /api/v1/performances/{performanceId}/deposit/prepare` · 권한: 생성자(팀 리더) · 우선: P0 · 연관 화면: `P-03 공연 생성·수정` · 연관 기능: `F-performance-10 보증금 서명 납부`

## 요구사항
- **[2026-09-24] 본인 확인 스위치(§7.W)** — `STEP_UP_ENABLED`가 켜져 있으면 응답에 **`stepUpRequired: true`**가 실린다(꺼져 있으면 키 없음 — 계약 무변경). 화면은 이 값으로 보증금 서명 직전에 본인 확인 단계를 넣고, 받은 토큰(범위 `DEPOSIT`·공연 id)을 API-performance-14 헤더 `X-Step-Up-Token`에 싣는다.
- 생성팀 리더가 보증금 **50,000 YoYo**를 컨트랙트에 납부하기 위해 서명할 tx를 받는다(P-21). §0.4 prepare 규약을 따르며 `signRequests`는 최대 2건 — `APPROVE`(allowance 부족 시) + `DEPOSIT`이다.
- `DEPOSIT`의 대상은 `RevenueSplitter.deposit(showId)`이고 컨트랙트가 `token.transferFrom(msg.sender, this, depositAmount)`를 실행한다. **서명 주체는 리더 본인**이며 서버는 이 tx를 보낼 수 없다.
- **선행 조건**: ① 요청자가 생성팀 리더 ② `deposit_status = UNPAID` ③ 공연 상태 `DRAFT` 또는 `PENDING_AGREEMENT` **[2026-09-09 — S15P21B204-67]** (규칙 저장이 보증금보다 앞이라 이 API 는 `PENDING_AGREEMENT` 에서 불린다) ④ 리더 지갑 `LINKED` ⑤ 리더 지갑 YoYo 잔액 ≥ 50,000 ⑥ 공동 공연(`is_joint`)이면 수락 완료 참여팀 ≥ 2(생성팀 포함) **[2026-09-18 — S15P21B204-138]** (판매 시작 API-rule-04 와 같은 판정. 보증금은 온체인에 들어가면 되돌릴 수 없으므로 돈이 움직이기 전에 막는다). **[v5]** ⑤가 부족하면 `COMMON_CONFLICT`(409)로 막고 `msg`로 부족액만 안내한다 — 잔액을 늘리는 화면 경로는 없고, 시연에서는 관리자 지급(API-coin-07)으로 해결한다.
- **`createShow`가 선행되어야 한다.** `deposit(showId)`은 컨트랙트에 공연이 등록돼 있어야 동작하므로, 이 API는 `createShow`가 아직이면 **먼저 운영자 `createShow` job을 걸고** `prerequisiteJobId`를 함께 내려준다. 프론트는 그 job이 `CONFIRMED`가 된 뒤 서명한다.
- **[v5] 가스 관련 필드가 없다.** 수수료는 운영지갑이 대납하므로 `gasStatus`·`fundingJobId`가 응답에서 삭제됐다(§0.4).
- 이 API는 상태를 바꾸지 않는다(조회·발의). 실제 전이는 API-performance-14의 receipt 검증에서 일어난다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
없음(빈 객체 `{}` 허용).

### 시스템 처리
1. 생성팀 리더 확인 → `deposit_status=UNPAID`·상태 `DRAFT` 확인 → 리더 지갑 `LINKED` 확인 → `YoYo.balanceOf` 조회로 잔액 확인 → `YoYo.allowance(리더, Splitter)` 조회.
2. 상태 전이 없음. `createShow` 미완이면 `chain_job` 등록. **[2026-09-09 — S15P21B204-67]** `createShow`는 `tx_type=CREATE_SHOW`·`signer_type=OPERATOR` job이며 멱등키는 `createShow:{performanceId}`다.
3. 외부 호출: 잔액·allowance 조회(캐시 없음 — 서명 직전 값이어야 한다). **[v5]** 네이티브 코인 잔액은 조회하지 않는다.
4. calldata 생성(`approve(splitter, 50000)`, `deposit(performanceId)`) + 감사 로그(발의 기록).

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "depositAmount": 50000,
    "currency": "KRW",
    "display": { "currency": "USD", "approx": 37.04, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "prerequisiteJobId": null,
    "signRequests": [
      {
        "kind": "APPROVE",
        "required": true,
        "to": "0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736",
        "data": "0x095ea7b3000000000000000000000000a1b2c3d4e5f60718293a4b5c6d7e8f9012345678000000000000000000000000000000000000000000000000000000000000c350",
        "value": "0x0",
        "chainId": "0x3e9",
        "gas": "0x11170",
        "txType": "FEE_DELEGATED_SMART_CONTRACT_EXECUTION",
        "feePayer": "0x9f8e7d6c5b4a39281706f5e4d3c2b1a098765432",
        "summary": { "title": "Allow deposit of 50,000 YoYo", "amount": 50000, "currency": "KRW", "spender": "RevenueSplitter", "spenderAddress": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678" }
      },
      {
        "kind": "DEPOSIT",
        "required": true,
        "to": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
        "data": "0xb6b55f25000000000000000000000000000000000000000000000000000000000000000c",
        "value": "0x0",
        "chainId": "0x3e9",
        "gas": "0x1d4c0",
        "txType": "FEE_DELEGATED_SMART_CONTRACT_EXECUTION",
        "feePayer": "0x9f8e7d6c5b4a39281706f5e4d3c2b1a098765432",
        "summary": { "title": "Pay 50,000 YoYo show deposit", "amount": 50000, "currency": "KRW", "performanceId": 12 }
      }
    ],
    "expiresAt": "2026-09-02T16:35:00+09:00"
  },
  "msg": ""
}
```

### 4xx/5xx
```json
{ "code": "WALLET_BALANCE_INSUFFICIENT", "data": null, "msg": "Insufficient balance · ₩38,000 short. (need ₩50,000 · have ₩12,000)" }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 404 | `WALLET_NOT_FOUND` | 리더 지갑 미연결 |
| 409 | `COMMON_CONFLICT` | `deposit_status`가 이미 `PAID`·`RETURNED` (전용 코드 `PERFORMANCE_DEPOSIT_ALREADY_PAID`는 §16.1). **[2026-09-20 — S15P21B204-151]** 잔액 부족·규칙 미저장이 전용 코드로 빠져 이 API에서 `COMMON_CONFLICT`는 **이 원인 하나만** 뜻한다 — 화면은 `depositStatus`로 이미 안다 |
| 409 | `PERFORMANCE_INVALID_STATUS` | 공연 상태가 `DRAFT`·`PENDING_AGREEMENT` 가 아님(`ON_SALE`·`CANCELLED` 등) |
| 409 | `WALLET_BALANCE_INSUFFICIENT` | 리더 지갑 YoYo 잔액 < 보증금. 부족액은 `msg`에만 담긴다(코드로 옮길 수 없는 값). 화면 분기는 **안내만**이고 잔액을 늘리는 버튼이 없다 **[2026-09-20 — S15P21B204-151]** — 종전 `COMMON_CONFLICT`. §16.1이 이 API 한 곳만 필요한 곳으로 지목한 코드를 그대로 썼다. `PAYMENT_INSUFFICIENT_BALANCE` 재정의 안은 API-payment-01·02까지 번지므로 쓰지 않는다 |
| 409 | `PERFORMANCE_RULES_REQUIRED` | 정산 규칙 미저장 — `createShow`를 만들 수 없어 서명을 내주면 `deposit`이 `ShowNotFound`로 revert 한다. 화면은 규칙 저장으로 보낸다 **[2026-09-20 — S15P21B204-151]** — 종전 `COMMON_CONFLICT` + 문구(MR !131). §16.1 제안 표에 없는 신설이며 근거는 `RULE_SYNC_IN_PROGRESS`와 같다(대체 코드가 막다른 길) |
| 409 | `TEAM_MIN_COUNT_NOT_MET` | 공동 공연인데 수락 완료 참여팀이 2팀 미만(생성팀 포함) **[2026-09-18 — S15P21B204-138]** |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | 잔액·allowance 조회 실패(서명 파라미터를 만들 수 없음) |

---

### API-performance-14 보증금 tx 해시 보고 **[v5 변경 — 본문 = `{kind, senderSignedRlp}`]**
`POST /api/v1/performances/{performanceId}/deposit/signed-tx` · 권한: 생성자(팀 리더) · 우선: P0 · 연관 화면: `P-03 공연 생성·수정` · 연관 기능: `F-performance-10 보증금 서명 납부` · `F-wallet-06 사용자 서명 tx 보고·검증`

## 요구사항
- **[2026-09-24] 본인 확인 가드(§7.W)** — 스위치가 켜져 있으면 헤더 **`X-Step-Up-Token`**(범위 `DEPOSIT`·공연 id)이 필수다. 공연 생성자 확인 **뒤에** 검사하므로 권한이 없는 요청은 기존 코드로 막히고 토큰을 태우지 않는다. 없음·만료·이미 소비·다른 동작/대상/회원의 토큰은 403 `WEBAUTHN_STEP_UP_REQUIRED`. `APPROVE` → `DEPOSIT` 두 보고는 같은 토큰으로 통과한다. **꺼져 있으면 헤더를 읽지 않는다.**
- **[v5]** 리더가 만든 **발신자 서명 RLP**를 보고한다. 서버가 대납 서명(fee payer)을 붙여 **전송**하고, `202 Accepted` + `jobId`(`signerType=USER`, `feeDelegated=true`)를 주고 **receipt와 `DepositPaid` 이벤트를 검증**해 상태를 전이한다(§0.4). 이름은 v1 §9 인벤토리 표기를 그대로 유지했다(§16.3 #1).
- `kind`가 `APPROVE`면 allowance 확인만 하고 `deposit_status`는 바꾸지 않는다. `kind=DEPOSIT`의 receipt가 확정될 때 `deposit_status` `UNPAID` → **`PAID`**가 되고 `nextAction`이 `SET_RULES`로 넘어간다.
- 검증 항목: receipt `status=1` · `to == splitterAddress` · `from == 리더 지갑 주소` · 로그에 `DepositPaid(showId, payer, amount)` 존재 · `showId == performanceId` **및 `amount == deposit_amount`**. 하나라도 어긋나면 전이 없이 `FAILED`이며 `PAYMENT_AMOUNT_MISMATCH`(409)로 응답한다(전용 코드 `PAYMENT_TX_MISMATCH`는 §16.1).
- **[v5]** 같은 `senderSignedRlp` 재보고는 최초 `jobId`를 재생한다(§0.8 — RLP 해시가 자연 멱등키).
- 서명 거부는 이 API를 호출하지 않는 것으로 표현된다. `deposit_status`는 `UNPAID`로 남고 사용자는 다시 시도할 수 있다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `kind` | string | Y | `APPROVE` / `DEPOSIT` | 어느 서명의 결과인지 |
| `senderSignedRlp` | string | Y | `0x` + hex, 최대 8KB | **[v5]** 리더 지갑이 만든 발신자 서명 RLP(`FeeDelegatedSmartContractExecution`) |

```json
{ "kind": "DEPOSIT", "senderSignedRlp": "0x31f8a..." }
```

### 시스템 처리
1. 생성팀 리더 확인 → **[v5]** RLP 디코드·발신자 주소 복구·`to`·`data` 대조·중복 보고 확인 → 해당 공연의 `prepare` 발의 기록 존재 확인.
2. 상태 전이: `chain_job` 생성(`tx_type=APPROVE`|`DEPOSIT`, `signer_type=USER`, `fee_delegated=true`, `issuer_type=MOCK`, `status=PENDING`, `wallet_id`, `sender_signed_rlp`, `fee_payer_address`) → **대납 서명·전송** 후 `tx_hash` 기록·`SUBMITTED`. receipt 확정 시 `CONFIRMED` + `performance.deposit_status=PAID`·`deposit_job_id`·`deposit_tx_hash` 기록 + **[v6] 발신(리더) 지갑의 `wallet:balance` 갱신**(§0.12).
3. 외부 호출(202): `eth_getTransactionReceipt` 폴링(시한 120초 뒤에도 노드가 tx 를 알면 계속, §0.3) → 로그 파싱·`DepositPaid` 검증. 실패·불일치는 `FAILED` 고정(재전송 없음, §0.3 USER job 규칙).
4. `chain_job`·`performance` 갱신 + 감사 로그(`action_type=OPERATOR_SIGN`이 아니라 사용자 서명 기록으로 남긴다).

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": {
    "jobId": "chain_01J9GA1B2C",
    "status": "SUBMITTED",
    "signerType": "USER",
    "pollAfterMs": 1500,
    "performanceId": 12,
    "kind": "DEPOSIT",
    "feeDelegated": true,
    "txHash": "0x6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5",
    "explorerUrl": "https://kairos.kaiascan.io/tx/0x6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5",
    "nextDepositStatus": "PAID"
  },
  "msg": "보증금 트랜잭션을 확인하고 있습니다."
}
```

### 4xx/5xx
```json
{ "code": "PAYMENT_AMOUNT_MISMATCH", "data": null, "msg": "트랜잭션 내용이 요청과 일치하지 않습니다. 처음부터 다시 시도해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | **[v5]** RLP 형식 위반·디코드 실패, 허용되지 않는 `kind` |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성팀 리더가 아님 |
| 403 | `WEBAUTHN_STEP_UP_REQUIRED` | **[2026-09-24]** 스위치 켜짐 + 토큰 없음·만료·소비·범위(`DEPOSIT`·공연) 불일치 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 404 | `COMMON_NOT_FOUND` | `prepare` 발의 기록이 없음(순서 위반) **[2026-09-20 — S15P21B204-151]** — 발의 기록 = 그 공연의 `CREATE_SHOW` `chain_job`. API-performance-13이 `REQUIRES_NEW`로 커밋하는 그 행이 `prepare` 가 남기는 유일한 흔적이다(`FAILED` 재시도로 멱등키가 반납돼도 행은 남으므로 `target_performance_id` + `tx_type`으로 본다). 위 `PERFORMANCE_RULES_REQUIRED`가 **먼저**다 — 규칙이 없으면 `prepare`를 불러도 job이 생기지 않아 이 줄에 걸리는데, 그때는 규칙 저장이 더 구체적인 안내다 |
| 409 | `COMMON_CONFLICT` | 이미 `deposit_status=PAID`, 또는 같은 RLP가 다른 공연·다른 회원으로 보고됨 |
| 409 | `PERFORMANCE_RULES_REQUIRED` | 정산 규칙 미저장 — `createShow`를 만들 수 없어 보고를 받아 봐야 `deposit`이 `ShowNotFound`로 revert 한다. 화면은 규칙 저장으로 보낸다 **[2026-09-20 — S15P21B204-151]** — 종전 `COMMON_CONFLICT` + "등록이 끝난 뒤에" 문구. API-performance-13과 **같은 코드**라 화면 분기가 한 벌이다. 정상 흐름은 13이 먼저 막으므로 여기는 방어선이다 |
| 409 | `COMMON_CONFLICT` | `createShow` job이 아직 `CONFIRMED`가 아님(`PENDING`·`SUBMITTED`·`FAILED`). 온체인 공연이 없으면 대납 가스만 태우고 revert 한다 **[2026-09-20 — S15P21B204-151]** — `FAILED`는 기다려도 확정되지 않으므로 `msg`는 **보증금 납부를 다시 시작**하라고 말한다(API-performance-13은 멱등이라 진행 중이면 같은 job을 돌려준다). `PENDING`·`SUBMITTED`를 `FAILED`와 더 가르지 않는 이유는 화면이 할 일이 같기 때문이다. **job 부재는 이 줄이 아니라 위 404**다 — 여기는 시작한 것이 아직 안 끝났다는 뜻이고, 부재는 시작한 적이 없다는 뜻이라 화면이 할 일이 다르다 |
| 409 | `PAYMENT_AMOUNT_MISMATCH` | **[v5]** RLP에서 복구한 발신자 ≠ 리더 지갑, `to`·`data`가 `prepare` 발급값과 다름 |
| 500 | `CHAIN_GAS_INSUFFICIENT` | **[v5]** 운영지갑(fee payer) 잔액 부족으로 대납 전송 불가 — 운영자 알림 대상 |
| 409 | `PAYMENT_AMOUNT_MISMATCH` | receipt·이벤트 검증 실패(`to`·`from`·`showId`·`amount`·이벤트 부재) (전용 코드 `PAYMENT_TX_MISMATCH`는 §16.1) |
| 504 | `CHAIN_TX_TIMEOUT` | 제출은 됐으나 확정이 120초를 넘김 — `jobId`로 계속 폴링 |

---

## 5. rule — 정산 규칙

정산 공식 [권] P-5: **2단계** — 1단계 `fixedRatioBp`(고정 전체) + `selectionRatioBp`(관객 선택) = **10000**, 2단계 `teamShares`로 고정 풀 내 팀별 비율(합 10000). dust는 **공연 생성 팀**에 귀속한다. 잠금 이후 setter는 컨트랙트에서 전부 revert된다.

**[v4] 동의가 사용자 서명으로 바뀌었다.** v3는 서버가 팀 키로 `agreeToRules`를 대신 서명했지만, v4에서는 서버가 사용자 키를 갖고 있지 않으므로 **참여팀 리더가 지갑으로 직접 서명**한다. §0.4 패턴에 따라 **API-rule-03(`…/agreements/prepare`)** 이 서명 파라미터를 주고 **API-rule-05(`…/agreements/signed-tx`)** 가 해시를 받아 receipt를 검증한다. `RuleAgreement` 상태도 `PENDING → SIGNING → AGREED` 3단계로 늘었다(결정 v2 §7). 규칙 설정에는 **보증금 `PAID`가 선행 조건**이다(P-21).

### API-rule-01 정산 규칙 설정 **[2026-09-09 변경 — 규칙이 보증금보다 먼저다]**
`PUT /api/v1/performances/{performanceId}/rules` · 권한: 생성자 · 우선: P0 · 연관 화면: `P-05 정산 규칙 설정` · 연관 기능: `F-rule-01 정산 규칙 설정`

## 요구사항
- **2단계 비율** 구조다. 어느 쪽이든 합이 10000이 아니면 `RULE_RATIO_SUM_INVALID`다 [권] P-5. 각 항목은 0도 허용한다. 삭제된 필드(`equalRatioBp`·`commonCost`·`plannerRatioBp`)가 오면 `COMMON_VALIDATION_FAILED`다.
- **[2026-09-09 — S15P21B204-67] 보증금 선행 조건을 걷었다.** [v4]는 `deposit_status = PAID`를 선행으로 뒀지만 온체인 순서가 그것을 허용하지 않는다 — `deposit(showId)`은 컨트랙트에 공연이 등록된 뒤에만 동작하고(`createShow` 선행), `createShow`는 `rulesHash == 0`을 `ZeroRulesHash`로 거절한다. 셋을 그대로 두면 **규칙 ← 보증금 ← createShow ← 규칙**의 원이 되어 0층이 통째로 막힌다. 순서는 **규칙 → `createShow` → 보증금 → 동의 → 판매 시작**이다. "판매 전에 보증금을 받는다"는 의도는 API-rule-04가 그대로 지킨다(그쪽이 `PAID`를 요구한다).
- 저장할 때마다 **규칙 정규화 JSON의 keccak256 해시**(`rulesHash`)를 재산출하고 기존 동의를 전부 `PENDING`으로 초기화한다(진행 중 `SIGNING` job은 `FAILED`로 닫는다). 동의는 해시에 대한 서명이기 때문이다.
- 상태 전이: `DRAFT` → `PENDING_AGREEMENT`. 이미 `ON_SALE`이면 `RULE_ALREADY_LOCKED`다.
- 시뮬레이션(예상 분배액)은 응답의 `simulation`으로 함께 준다. **[v4]** 금액은 YoYo 정수 + `display` 축약형이다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `fixedRatioBp` | integer | Y | 0~10000 | 고정 분배 전체 비율(bp) |
| `selectionRatioBp` | integer | Y | 0~10000 | 관객 선택 분배 비율(bp). 위와 합 10000 |
| `teamShares` | array | Y | 참여팀 수와 일치 | `[{teamId, shareBp}]`, `shareBp` 합 = 10000 |
| `simulationRevenue` | integer | N | 0 이상, YoYo 정수 | 시뮬레이션 가정 매출. 미지정 시 현재 매출 |

```json
{
  "fixedRatioBp": 6000,
  "selectionRatioBp": 4000,
  "teamShares": [ { "teamId": 7, "shareBp": 5000 }, { "teamId": 9, "shareBp": 3000 }, { "teamId": 11, "shareBp": 2000 } ],
  "simulationRevenue": 1600000
}
```

### 시스템 처리
1. 생성자 권한·상태(`DRAFT`·`PENDING_AGREEMENT`) 확인 → 1·2단계 비율 합 검증 → `teamShares`의 팀이 전부 현재 참여팀인지 확인.
2. 상태 전이: `settlement_rule` upsert, `performance_participant.team_share_bp` 갱신, 공연 `DRAFT` → `PENDING_AGREEMENT`, `rule_agreement` 전체 `PENDING` 초기화.
3. **[2026-09-10 — S15P21B204-70] 온체인 공연이 이미 등록돼 있으면 `UPDATE_RULES` job을 건다.** 종전의 "외부 호출 없음"은 `createShow` 확정 **전**에만 사실이다. 확정 뒤에는 컨트랙트에 `rulesHash`가 박혀 있어서, 서버에서만 규칙을 바꾸면 두 해시가 갈리고 참여팀의 `agreeToRules`가 전부 `RulesHashMismatch`로 revert 한다. 그래서 **바꾸면 온체인도 같이 바꾼다** — `RevenueSplitter.updateRules`(OPERATOR, `tx_type=UPDATE_RULES`). 전송은 워커가 하고 이 API는 job만 만든다(§0.3).
   - **거는 조건은 셋 중 하나다.** ① 해시가 바뀌었다 ② 해시는 같은데 온체인과 갈려 있다(앞선 전송이 실패한 뒤 같은 규칙을 다시 저장하는 것이 리더가 아는 유일한 복구 동작이다) ③ 해시가 같고 온체인과도 맞지만 **되돌린 동의가 있다**. ③이 필요한 이유 — 전원 동의 뒤 저장 버튼을 다시 누르면 서버 동의만 `PENDING`이 되고 온체인 `rulesEpoch`는 그대로라, 팀들이 다시 동의하려 해도 컨트랙트가 `AlreadyAgreed`로 revert 한다. DB는 영영 `PENDING`이고 판매 시작이 **영구히 막힌다.**
   - 멱등키는 `updateRules:{performanceId}:{rulesHash}:{회차}`다. **키에 해시를 담는 이유** — 확정 대조를 "현재 DB 해시"로 하면, 전송 뒤 규칙이 또 저장됐을 때 **성공한 tx가 `FAILED`로 기록된다**. 체인은 우리가 보낸 그 해시를 박았는데 서버가 나중 해시를 들이대는 것이라 틀린 쪽은 대조다. 회차는 A→B→A 처럼 되돌아올 때 UNIQUE 충돌만 피한다.
   - `createShow`·`startSale`이 **전송 중**(`PENDING`·`SUBMITTED`)이면 저장을 `RULE_SYNC_IN_PROGRESS`(409)로 막는다. **`createShow` 창에서 막는 것은 "해시가 바뀌는 저장"뿐이다** — 같은 규칙 재저장은 온체인과 갈리지 않아 통과시킨다. 아직 온체인에 박히지 않은 규칙은 `updateRules`로 고칠 수 없고(`showExists` revert), 무엇이 박힐지도 모른다 — 빌더가 규칙을 읽는 것과 저장이 경쟁한다. **`startSale` 창에서는 같은 규칙 재저장도 막는다**: 저장은 서버 동의를 되돌리는데 온체인은 전원 동의한 채로 영구히 잠기고, 그 불일치를 되돌릴 `updateRules`는 잠긴 뒤라 `RulesLocked`로 revert 한다.
4. `rulesHash` 재산출·저장 + 시뮬레이션 계산 결과 반환. **응답에 job id를 담지 않는다** — 이 API의 성공은 "규칙이 저장됐다"이고 온체인 반영은 뒤따르는 별개 사건이다. 프론트는 규칙·동의 현황(API-rule-02)의 `startSaleBlockedReason`으로 진행 중임을 본다(`blockedReason`은 payment-06·settlement-01의 다른 필드다 — 이름이 갈린다). 여기에 job id를 실으면 화면이 규칙 저장마다 폴링을 시작해야 하고, job이 안 걸리는 경우(위 세 조건에 모두 해당하지 않을 때)에 `null`을 어떻게 읽을지가 또 갈린다.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "status": "PENDING_AGREEMENT",
    "depositStatus": "PAID",
    "fixedRatioBp": 6000,
    "selectionRatioBp": 4000,
    "teamShares": [ { "teamId": 7, "shareBp": 5000 }, { "teamId": 9, "shareBp": 3000 }, { "teamId": 11, "shareBp": 2000 } ],
    "rulesHash": "0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f",
    "agreementsReset": true,
    "rate": { "currency": "USD", "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "simulation": {
      "assumedRevenueAmount": 1600000,
      "distributableAmount": 1600000,
      "currency": "KRW",
      "dustTeamId": 7,
      "shares": [
        { "teamId": 7, "teamName": "블루노트", "amount": 641668 },
        { "teamId": 9, "teamName": "새벽세시", "amount": 529166 },
        { "teamId": 11, "teamName": "노이즈캔슬", "amount": 429166 }
      ]
    },
    "nextAction": "COLLECT_AGREEMENTS"
  },
  "msg": "정산 규칙이 저장되었습니다. 참여팀 동의를 받아 주세요."
}
```

### 4xx
```json
{ "code": "RULE_RATIO_SUM_INVALID", "data": null, "msg": "분배 비율의 합이 100%가 되어야 합니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | bp 범위 위반, 삭제된 필드 전달, `teamShares`의 팀이 참여팀이 아님 |
| 400 | `RULE_RATIO_SUM_INVALID` | 1단계 또는 2단계 합이 10000이 아님 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 409 | `PERFORMANCE_INVALID_STATUS` | **[2026-09-10 정정]** 공연 상태가 `DRAFT`·`PENDING_AGREEMENT`가 아님. **[v4]의 "`deposit_status`가 `PAID`가 아님"은 더는 조건이 아니다** — 위 2026-09-09 항목이 보증금 선행을 걷었는데 이 표만 남아 있었다(기계 정본 `parts/05_rule.yaml`·`RuleService.isModifiable`과 갈려 있었다) |
| 409 | `RULE_ALREADY_LOCKED` | 판매 시작 이후 수정 시도 |
| 409 | `RULE_SYNC_IN_PROGRESS` | **[2026-09-10 — S15P21B204-70]** `createShow` 또는 `startSale`이 전송 중(`PENDING`·`SUBMITTED`). **기다리면 풀린다** — 사용자가 지금 고칠 것이 없다. 그래서 "상태가 잘못됐다"(`PERFORMANCE_INVALID_STATUS`)와 코드를 나눈다: 화면이 붙이는 다음 행동이 정반대다 |

---

### API-rule-02 규칙·동의 현황 조회
`GET /api/v1/performances/{performanceId}/rules` · 권한: PERFORMER(참여팀) · 우선: P0 · 연관 화면: `P-05 정산 규칙 설정`·`P-06 규칙 동의·판매 시작` · 연관 기능: `F-rule-02 정산 규칙·동의 현황 조회`

## 요구사항
- 규칙 원문(두 비율 bp + `teamShares`)·`rulesHash`·잠금 여부와 **팀별 동의 상태**를 준다. P-06 화면이 이 응답 하나로 그려져야 한다.
- **[v4]** 동의 상태는 `PENDING` / `SIGNING`(tx 보고 후 receipt 대기) / `AGREED` 3단계이며, 각 팀의 **리더 지갑 주소**와 동의 `txHash`·`explorerUrl`을 함께 담는다. 내 팀의 다음 행동은 `myAgreement.nextAction`(`SIGN` / `WAIT` / `NONE`)이다.
- 판매 시작 가능 여부(`startSaleAvailable`)와 막힌 이유를 담아 버튼 활성 조건을 서버가 정한다 [권].
- 참여팀 소속만 조회한다.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
없음.

### 시스템 처리
1. 공연 존재·참여팀 소속 확인.
2. 상태 전이 없음(조회).
3. 외부 호출 없음(동의 tx는 인덱싱된 `chain_job` 기준). 필요 시 `agreedOf(showId, wallet)` view와 대조하는 것은 API-verify-01의 몫이다.
4. `settlement_rule` + `rule_agreement` + `performance_participant`(+`wallet`) 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "performanceStatus": "PENDING_AGREEMENT",
    "depositStatus": "PAID",
    "locked": false,
    "rulesHash": "0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f",
    "rule": { "fixedRatioBp": 6000, "selectionRatioBp": 4000, "teamShares": [ { "teamId": 7, "shareBp": 5000 }, { "teamId": 9, "shareBp": 3000 }, { "teamId": 11, "shareBp": 2000 } ] },
    "agreements": [
      { "teamId": 7, "teamName": "블루노트", "walletAddress": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b", "status": "AGREED", "txHash": "0x1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f901", "explorerUrl": "https://kairos.kaiascan.io/tx/0x1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f901", "agreedAt": "2026-09-03T10:02:00+09:00" },
      { "teamId": 9, "teamName": "새벽세시", "walletAddress": "0x3c8a1f2b4d6e8091a2b3c4d5e6f708192a3b4c5d", "status": "SIGNING", "txHash": "0x2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90112", "explorerUrl": "https://kairos.kaiascan.io/tx/0x2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90112", "agreedAt": null },
      { "teamId": 11, "teamName": "노이즈캔슬", "walletAddress": "0x9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6f7081920", "status": "PENDING", "txHash": null, "explorerUrl": null, "agreedAt": null }
    ],
    "myAgreement": { "teamId": 11, "status": "PENDING", "nextAction": "SIGN" },
    "startSaleAvailable": false,
    "startSaleBlockedReason": "RULE_NOT_AGREED_BY_ALL"
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 403 | `SETTLEMENT_NOT_PARTICIPANT` | 참여팀 소속이 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 404 | `COMMON_NOT_FOUND` | 규칙이 아직 설정되지 않음(`DRAFT`) |

---

### API-rule-03 규칙 동의 서명 파라미터 **[v5 변경 — 가스 필드 삭제·수수료 대납]**
`POST /api/v1/performances/{performanceId}/rules/agreements/prepare` · 권한: 참여팀 리더 · 우선: P0 · 연관 화면: `P-06 규칙 동의·판매 시작` · 연관 기능: `F-rule-03 정산 규칙 동의`

## 요구사항
- **[2026-09-24] 본인 확인 스위치(§7.W)** — `STEP_UP_ENABLED`가 켜져 있으면 응답에 **`stepUpRequired: true`**가 실린다(꺼져 있으면 키 없음 — 계약 무변경). 화면은 이 값으로 동의 서명 직전에 본인 확인 단계를 넣고, 받은 토큰(범위 `RULE_AGREE`·공연 id)을 API-rule-05 헤더 `X-Step-Up-Token`에 싣는다.
- **v3에서 서버가 팀 키로 대신 서명하던 지점**이다. v4에서는 서버가 사용자 키를 보관하지 않으므로 **리더 지갑이 `RevenueSplitter.agreeToRules(showId, rulesHash)`에 직접 서명**한다. 이 API는 그 서명 파라미터를 만들어 준다(§0.4).
- 요청의 `rulesHash`가 서버 현재 해시와 다르면 `RULE_HASH_MISMATCH`(409)다 — 규칙이 중간에 바뀐 상황이라 화면에서 다시 확인시켜야 한다. `prepare` 응답에도 현재 해시를 담아 프론트가 대조할 수 있게 한다.
- **`createShow`가 선행되어야 한다**(`teamWallets`에 msg.sender가 있어야 컨트랙트가 통과시킨다). 미완이면 운영자 `createShow` job을 걸고 `prerequisiteJobId`를 내려준다. 프론트는 그 job 확정 후 서명한다.
- `signRequests`는 1건(`AGREE`)이며 `approve`가 필요 없다 — 자금 이동이 없는 동의 tx다. 요약(`summary`)에는 비율·팀별 몫·예상 분배액을 담아 리더가 **무엇에 동의하는지** 읽을 수 있게 한다(결정 v2 §2.3).
- 선행 조건: 요청자가 참여팀 리더 · `participationStatus=ACCEPTED` · 공연 `PENDING_AGREEMENT` · 내 팀 동의가 `PENDING`(`SIGNING`·`AGREED`면 `COMMON_CONFLICT`) · 리더 지갑 `LINKED`. **[v5]** 가스 조건이 없다 — 수수료는 운영지갑이 대납한다(§0.4).

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `teamId` | integer | Y | 요청자가 리더인 참여팀 | 동의하는 팀 |
| `rulesHash` | string | Y | `0x` + 64 hex(66자) | API-rule-02에서 받은 현재 규칙 해시 |

```json
{ "teamId": 9, "rulesHash": "0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f" }
```

### 시스템 처리
1. 리더·참여팀 확인 → 공연 상태 `PENDING_AGREEMENT` 확인 → `rulesHash` 대조 → 내 팀 동의 상태 `PENDING` 확인 → 리더 지갑 `LINKED` 확인.
2. 상태 전이 없음(발의). `createShow` 미완이면 운영자 job 등록.
3. 외부 호출: **[v5]** `agreedOf(showId, wallet)` view로 이미 온체인 동의가 있는지 확인(있으면 DB만 `AGREED`로 동기화하고 `signRequests: []` 반환). 네이티브 코인 잔액은 조회하지 않는다.
4. calldata 생성(`agreeToRules(performanceId, rulesHash)`) + 발의 기록.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "teamId": 9,
    "rulesHash": "0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f",
    "prerequisiteJobId": null,
    "signRequests": [
      {
        "kind": "AGREE",
        "required": true,
        "to": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
        "data": "0x8f4ffcb14d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f000000000000000000000000000000000000000000000000000000000000000c",
        "value": "0x0",
        "chainId": "0x3e9",
        "gas": "0x186a0",
        "txType": "FEE_DELEGATED_SMART_CONTRACT_EXECUTION",
        "feePayer": "0x9f8e7d6c5b4a39281706f5e4d3c2b1a098765432",
        "summary": {
          "title": "Agree to the settlement rules",
          "performanceId": 12,
          "teamName": "새벽세시",
          "fixedRatioBp": 6000,
          "selectionRatioBp": 4000,
          "myShareBp": 3000,
          "rulesHash": "0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f"
        }
      }
    ],
    "expiresAt": "2026-09-03T10:30:00+09:00"
  },
  "msg": ""
}
```

### 4xx/5xx
```json
{ "code": "RULE_HASH_MISMATCH", "data": null, "msg": "정산 규칙이 변경되었습니다. 내용을 다시 확인한 뒤 동의해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `rulesHash` 형식 위반(66자 아님) |
| 403 | `COMMON_FORBIDDEN` | 해당 팀 리더가 아님 |
| 403 | `SETTLEMENT_NOT_PARTICIPANT` | 참여팀이 아닌 팀으로 동의 시도 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 404 | `WALLET_NOT_FOUND` | 리더 지갑 미연결 |
| 409 | `RULE_HASH_MISMATCH` | 요청 해시 ≠ 서버 현재 해시 |
| 409 | `RULE_ALREADY_LOCKED` | 이미 `startSale` 완료 |
| 409 | `COMMON_CONFLICT` | 내 팀 동의가 이미 `SIGNING`·`AGREED` |
| 409 | `RULE_SYNC_IN_PROGRESS` | **[2026-09-10 — S15P21B204-70]** DB 해시와 온체인 해시가 갈려 있음(`UPDATE_RULES` 미확정·실패·다른 해시 겨냥). 이 상태로 서명하면 `agreeToRules`가 `RulesHashMismatch`로 revert 해 가스만 태운다 |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | 체인 조회 실패로 서명 파라미터를 만들 수 없음 |

---

### API-rule-05 규칙 동의 tx 해시 보고 **[v5 변경 — 본문 = `{teamId, senderSignedRlp}`]**
`POST /api/v1/performances/{performanceId}/rules/agreements/signed-tx` · 권한: 참여팀 리더 · 우선: P0 · 연관 화면: `P-06 규칙 동의·판매 시작` · 연관 기능: `F-rule-03 정산 규칙 동의` · `F-wallet-06 사용자 서명 tx 보고·검증`

## 요구사항
- **[2026-09-24] 본인 확인 가드(§7.W)** — 스위치가 켜져 있으면 헤더 **`X-Step-Up-Token`**(범위 `RULE_AGREE`·공연 id)이 필수다. 참여팀 리더 확인 **뒤에** 검사하므로 권한이 없는 요청은 기존 코드로 막히고 토큰을 태우지 않는다. 없음·만료·이미 소비·다른 동작/대상/회원의 토큰은 403 `WEBAUTHN_STEP_UP_REQUIRED`. **꺼져 있으면 헤더를 읽지 않는다.**
- 리더가 서명·전송한 `agreeToRules` tx 해시를 보고한다. 서버는 `202` + `jobId`(`signerType=USER`)를 주고 receipt와 동의 이벤트를 검증한다(§0.4).
- 보고 즉시 `rule_agreement` `PENDING` → **`SIGNING`**, receipt 확정 시 → **`AGREED`**(+ `agree_job_id`·`agreed_at` 기록)로 전이한다. 검증 실패는 `PENDING`으로 되돌리고 `chain_job`을 `FAILED`로 고정한다.
- 검증 항목: receipt `status=1` · `to == splitterAddress` · `from == 리더 지갑 주소` · 이벤트에 `showId == performanceId` · **`rulesHash`가 서버 현재 해시와 동일**. 마지막 항목이 어긋나면(그 사이 규칙이 바뀐 경우) `RULE_HASH_MISMATCH`(409)다.
- 전 참여팀이 `AGREED`가 되면 응답 `allAgreed: true`와 `startSaleAvailable: true`를 내려 생성자에게 판매 시작(API-rule-04) 버튼을 열어 준다.
- **[v5]** 같은 `senderSignedRlp` 재보고는 최초 `jobId`를 재생한다. **[S15P21B204-94] 예외: 규칙 동기화 중(`UPDATE_RULES` 미확정·실패)에는 같은 RLP 재보고도 `RULE_SYNC_IN_PROGRESS`(409)이며 기존 job 멱등 응답을 주지 않는다** — 동기화 판정이 재생 판정보다 앞이다. 서명 거부는 이 API를 호출하지 않는 것으로 표현되고 상태는 `PENDING`으로 남는다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `teamId` | integer | Y | 요청자가 리더인 참여팀 | 동의한 팀 |
| `senderSignedRlp` | string | Y | `0x` + hex, 최대 8KB | **[v5]** 리더 지갑이 만든 발신자 서명 RLP(`FeeDelegatedSmartContractExecution`) |

```json
{ "teamId": 9, "senderSignedRlp": "0x31f8b..." }
```

### 시스템 처리
1. 리더·참여팀 확인 → **[v5]** RLP 디코드·발신자 주소 복구·`to`·`data` 대조·중복 보고 확인 → `prepare` 발의 기록 존재 확인.
2. 상태 전이: `chain_job` 생성(`tx_type=AGREE`, `signer_type=USER`, `fee_delegated=true`, `PENDING` → 대납 서명·전송 후 `SUBMITTED`), `rule_agreement` → `SIGNING`. receipt 확정 시 `CONFIRMED` + `AGREED`.
3. 외부 호출(202): receipt 폴링(시한 120초 뒤에도 노드가 tx 를 알면 계속, §0.3) → 로그 파싱·이벤트 검증 → 전원 동의 여부 재계산.
4. `chain_job`·`rule_agreement` 갱신 + 생성자에게 "전원 동의 완료" 알림(전원 완료 시) [권].

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": {
    "jobId": "chain_01J9GB3C4D",
    "status": "SUBMITTED",
    "signerType": "USER",
    "pollAfterMs": 1500,
    "performanceId": 12,
    "teamId": 9,
    "agreementStatus": "SIGNING",
    "txHash": "0x2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90112",
    "explorerUrl": "https://kairos.kaiascan.io/tx/0x2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90112",
    "allAgreed": false,
    "pendingTeamIds": [11],
    "startSaleAvailable": false
  },
  "msg": "동의 트랜잭션을 확인하고 있습니다."
}
```

### 4xx/5xx
```json
{ "code": "PAYMENT_AMOUNT_MISMATCH", "data": null, "msg": "트랜잭션 내용이 요청과 일치하지 않습니다. 처음부터 다시 시도해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | **[v5]** RLP 형식 위반·디코드 실패, `teamId` 누락 |
| 403 | `COMMON_FORBIDDEN` | 해당 팀 리더가 아님 |
| 403 | `WEBAUTHN_STEP_UP_REQUIRED` | **[2026-09-24]** 스위치 켜짐 + 토큰 없음·만료·소비·범위(`RULE_AGREE`·공연) 불일치 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 404 | `COMMON_NOT_FOUND` | `prepare` 발의 기록이 없음(순서 위반) |
| 409 | `RULE_HASH_MISMATCH` | tx의 `rulesHash` ≠ 서버 현재 해시 |
| 409 | `RULE_ALREADY_LOCKED` | 이미 `startSale` 완료 |
| 409 | `COMMON_CONFLICT` | 이미 `AGREED`, 또는 같은 RLP가 다른 팀으로 보고됨 |
| 500 | `CHAIN_GAS_INSUFFICIENT` | **[v5]** 운영지갑(fee payer) 잔액 부족으로 대납 전송 불가 — 운영자 알림 대상 |
| 409 | `PAYMENT_AMOUNT_MISMATCH` | receipt·이벤트 검증 실패(`to`·`from`·`showId`·이벤트 부재) (전용 코드 `PAYMENT_TX_MISMATCH`는 §16.1) |
| 409 | `RULE_SYNC_IN_PROGRESS` | **[2026-09-10 — S15P21B204-70]** DB 해시와 온체인 해시가 갈려 있음. **rule-03 과 같은 판정이다** — 이미 서명을 손에 쥔 클라이언트도 게이트를 건너뛰지 못한다. 전원 동의 뒤 **같은 규칙** 재저장으로 `UPDATE_RULES` 가 걸린 창에 앞서 서명한 RLP 가 들어오면, 막지 않을 경우 해시가 같아 검증을 통과하고 대납 전송돼 온체인에서 `AlreadyAgreed` 로 revert 한다(`UPDATE_RULES` 확정 뒤 재시도는 성공한다) |
| 504 | `CHAIN_TX_TIMEOUT` | 확정이 120초를 넘김 — `jobId`로 계속 폴링 |

---

### API-rule-04 판매 시작(startSale 잠금)
`POST /api/v1/performances/{performanceId}/sale/start` · 권한: 생성자 · 우선: P0 · 연관 화면: `P-06 규칙 동의·판매 시작` · 연관 기능: `F-rule-04 판매 시작·정산 규칙 잠금`

## 요구사항
- **전 참여팀이 `AGREED`**여야 실행된다. 하나라도 `PENDING`·`SIGNING`이면 `RULE_NOT_AGREED_BY_ALL`이다. 공동 공연인데 참여팀 2팀 미만이면 `TEAM_MIN_COUNT_NOT_MET`, 티켓 옵션이 없으면 시작할 수 없다 [권].
- **[v4]** 운영자가 `RevenueSplitter.startSale(showId)`로 **one-way `locked=true`**를 건다. `createShow`(참여팀 지갑 배열·비율·`rulesHash`·`depositAmount`)는 보증금·동의 단계에서 이미 실행돼 있으며, 이 API는 미완이면 `createShow`부터 순차 실행한다.
- **[2026-09-09 — S15P21B204-67]** `createShow` job이 `CONFIRMED`가 아니면 `START_SALE` job을 만들지 않고 `202` + `prerequisiteJobId`로 돌려준다 — 두 job이 동시에 `PENDING`이면 워커가 `startSale`을 먼저 보내 revert할 수 있어서다.
- **[v4]** `createShow` 시점의 각 팀 리더 지갑 주소가 `performance_participant.wallet_address`에 **스냅샷**으로 고정된다 — 이후 지갑 교체와 무관하게 정산 수령 주소가 정해진다(미결 안건 20).
- `202 Accepted` + `jobId`다. tx 확정 시 공연 `PENDING_AGREEMENT` → `ON_SALE`이 되고 예매를 받는다. 확정 전 예매 시도는 `TICKET_SALE_NOT_STARTED`다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `rulesHash` | string | Y | `0x` + 64 hex(66자) | 잠글 규칙 해시. 서버 현재 해시와 일치해야 함 |

```json
{ "rulesHash": "0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f" }
```

### 시스템 처리
1. 생성자 권한 확인 → 상태 `PENDING_AGREEMENT`·`deposit_status=PAID` 확인 → 전원 `AGREED`·참여팀 수·티켓 옵션·`rulesHash` 대조.
2. 상태 전이: `chain_job` 생성(`tx_type=START_SALE`, `signer_type=OPERATOR`). **[2026-09-09 — S15P21B204-67]** 종전 `tx_type=LOCK`에서 정정 — `LOCK`은 정산 잠금(API-settlement-03) 전용이다. tx 확정 시 공연 → `ON_SALE`, `settlement` `NONE` 유지.
3. 외부 호출(202): 운영지갑이 (필요 시 `createShow` →) `startSale()` 전송(nonce 직렬 큐). 실패 3회 재시도 후 연장 재시도.
4. `chain_job`·`performance_participant.wallet_address` 저장, tx 확정 시 Redis 재고 오픈 + 공개 목록 노출 시작.

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": {
    "jobId": "chain_01J9B7D8E9",
    "prerequisiteJobId": null,
    "status": "PENDING",
    "signerType": "OPERATOR",
    "pollAfterMs": 2000,
    "performanceId": 12,
    "nextStatus": "ON_SALE",
    "splitterAddress": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    "teamWallets": [
      { "teamId": 7, "teamIndex": 0, "walletAddress": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b" },
      { "teamId": 9, "teamIndex": 1, "walletAddress": "0x3c8a1f2b4d6e8091a2b3c4d5e6f708192a3b4c5d" },
      { "teamId": 11, "teamIndex": 2, "walletAddress": "0x9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6f7081920" }
    ]
  },
  "msg": "판매 시작 트랜잭션을 전송했습니다. 확정되면 예매가 열립니다."
}
```

`teamIndex`는 `purchase(showId, orderRef, teamIndex, amount, quantity)`의 인자이자 온체인 선택 카운터의 키다. 이후 바뀌지 않는다.

### 4xx/5xx
```json
{ "code": "RULE_NOT_AGREED_BY_ALL", "data": null, "msg": "모든 참여팀이 정산 규칙에 동의해야 판매를 시작할 수 있습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `rulesHash` 형식 위반, 티켓 옵션 없음 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 409 | `RULE_NOT_AGREED_BY_ALL` | `PENDING`·`SIGNING` 팀 존재 |
| 409 | `RULE_HASH_MISMATCH` | 요청 해시 ≠ 서버 현재 해시 |
| 409 | `RULE_ALREADY_LOCKED` | 이미 잠금 완료 |
| 409 | `TEAM_MIN_COUNT_NOT_MET` | 공동 공연인데 참여팀 2팀 미만 |
| 409 | `PERFORMANCE_INVALID_STATUS` | `DRAFT`·`CANCELLED`, 또는 **[v4]** `deposit_status`가 `PAID`가 아님 |
| 409 | `RULE_SYNC_IN_PROGRESS` | **[2026-09-10 — S15P21B204-70]** DB 해시와 온체인 해시가 갈려 있음. 그대로 잠그면 온체인은 옛 규칙으로 **영구히** 고정된다 — 동의 준비(API-rule-03)와 **같은 판정 하나**를 본다(판정이 갈리면 한쪽이 규칙을 놓친다) |
| 500 | `CHAIN_GAS_INSUFFICIENT` | 운영지갑 가스 부족(관리자 알림 대상) |
| 504 | `CHAIN_TX_TIMEOUT` | 제출은 됐으나 확정 지연 — `jobId`로 계속 폴링 |

---

## 6. ticket — 예매·티켓

주문 상태: `PENDING_PAYMENT` → `PAID` → `CANCELLED` / `REFUNDED`. 미결제 15분 경과 시 `CANCELLED`. 티켓 상태: `ISSUED` → `USED` / `CANCELLED`(**[v6] 3값**). **[v6.2] 응원 팀은 표마다 배분**하고(공동 공연 필수), 1인 1공연 최대 4매는 **그룹 합산**으로 검사한다 [권] P-4·P-6.

**[v4] 관객 선택은 별도 tx가 아니다.** v3의 `recordChoice`·`cancelChoice`는 삭제되고 **`purchase` tx가 결제와 선택을 함께 기록**한다(결정 v2 §2.4·미결 안건 12). 주문 생성 시 서버가 **`orderRef = keccak256(orderId)`**(`ticket_order.order_ref`)와 **`teamIndex`**(`createShow` 시점 참여팀 순서)를 확정해 내려주고, 그 값이 그대로 온체인 인자가 된다. **[v5]** 주문 응답에는 **지갑 잔액과 부족액**이 함께 담긴다. 결제 수단은 잔액 하나뿐이므로 부족액은 선택을 위한 값이 아니라 **안내 문구용**이다 — A-05는 잔액이 충분하면 "Pay from balance", 모자라면 "Insufficient balance · 15,000 YoYo short"를 그린다(P-7·화면 §5.16).

**[v6.2] 표별 응원 팀 배분(주문 그룹) — 결정 v2 §14-40.** 관객은 한 번의 예매에서 표마다 다른 팀을 응원 대상으로 나눌 수 있다. 컨트랙트의 `purchase(uint256 showId, bytes32 orderRef, uint8 teamIndex, uint256 amount, uint16 quantity)`는 여전히 **orderRef 1개 = 팀 1개**만 받으므로(변경 없음), 서버가 배분을 팀별로 묶어 `ticket_order` 행을 여러 개(**하위 주문**, 팀 하나·`orderRef` 하나·`purchase` tx 하나) 만들고 **`order_group_id`**(대표 주문 = 첫 하위 주문의 `ticket_order_id`)로 묶는다. 단독 공연·팀 하나 배분도 그룹 크기 1이다. 1인 4매 한도·재고 차감은 그룹 합산, 결제는 `orderGroupId` 하나로 시작해 `APPROVE` 1 + `PURCHASE` × 하위 주문 수를 서명한다. 하위 주문 일부만 결제가 확정되는 **부분 실패**는 확정분을 유지하고 실패분만 기존 15분 만료 경로를 탄다(API-ticket-01·API-payment-01·03).

### API-ticket-01 주문 생성(표별 응원 팀 배분) **[v6 변경 — 표별 응원 팀 배분·주문 그룹]**
`POST /api/v1/orders` · 권한: AUDIENCE · 우선: P0 · 연관 화면: `A-03 예매 — 옵션·수량`·`A-04 예매 — 표별 응원 팀 배분` · 연관 기능: `F-ticket-01 티켓 주문 생성`

## 요구사항
- 티켓 타입·수량을 받아 **표마다 응원 팀을 배분**하고, 서버가 배분을 팀별 **하위 주문**(팀 하나·`orderRef` 하나)으로 쪼개 `PENDING_PAYMENT`로 만들고 Redis 재고를 선점한다. 결제 전까지 **15분**(그룹 공통) 유효하며 경과 시 하위 주문을 `CANCELLED`로 자동 전이하고 재고를 원복한다.
- **(v6.2)** 같은 `ticketTypeId`라도 배분한 팀이 다르면 `items[]`의 행을 나눠 담는다(예: 같은 타입 2매를 두 팀에 1매씩이면 행 2개). 단독 공연은 `items[].chosenTeamId`를 생략하고 서버가 공연 생성팀으로 채운다.
- 응답에 **`orderGroupId`**(그룹 대표 주문 id)·**`orderId`**(= `orderGroupId`, 하위 호환)·**`orders[]`**(하위 주문마다 `orderId`·`orderRef`·`chosenTeamId`·`chosenTeamName`·`teamIndex`·`items[]`·`quantity`·`amount`)·**`totalAmount`**·**`totalQuantity`**(그룹 합)·**`walletBalance`**·**`shortfall`**(그룹 합계 기준 부족액)을 담는다. **[v5]** `shortfall > 0`이어도 주문(그룹)은 만들어지고 **`PENDING_PAYMENT`로 15분 유지**된다 — 관객이 잔액을 확보하면(시연: 관리자 지급) 그대로 결제 단계로 갈 수 있다. 대체 결제 경로를 제안하는 필드는 없다(결정 v2 §3.3).
- **지갑을 등록하지 않은 회원은 주문을 만들 수 없다** — `WALLET_NOT_FOUND`(404)로 막고 C-05(`/onboarding/wallet`)로 보낸다. 서명할 지갑이 없으면 결제가 불가능하기 때문이다.
- 공동 공연에서 배분되지 않은 표(행)가 있으면 `TICKET_TEAM_CHOICE_REQUIRED`, 참여팀이 아닌 팀 배분은 `TICKET_TEAM_CHOICE_INVALID`다. 1인 1공연 누적 **4매** 초과는 `TICKET_PURCHASE_LIMIT_EXCEEDED`다(취소분 제외, **그룹 합산**). **[2026-09-26]** 누적에는 `PAID`와 **결제 시한이 남은** `PENDING_PAYMENT`만 센다 — 시한이 지났지만 만료 스윕(60초 주기)이 아직 줍지 않은 주문은 빼서, 사용자가 스윕을 기다리지 않고 다시 살 수 있게 한다. 코드는 하나지만 `msg`는 "한 번에 최대 4매"(요청 합이 4매 초과)와 "결제 완료·결제 대기 N매 포함 최대 4매"(누적 초과)로 나뉜다.
- 재고 차감은 **그룹 전체를 원자적으로** 처리해 **초과 판매 0**을 보장한다(REL-01·PERF-02) — 하위 주문 하나라도 모자라면 **아무것도 차감하지 않는다**. `Idempotency-Key`가 필수(그룹 단위).
- `totalAmount`는 **YoYo 정수**이며 서버 계산과 다르면 결제 단계에서 `PAYMENT_AMOUNT_MISMATCH`다. `display` 필드는 요청에서 무시된다(§0.5).

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language` · `Idempotency-Key: {UUIDv4}` **필수**

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `performanceId` | integer | Y | `ON_SALE` 상태 | 공연 PK |
| `items` | array | Y | **1~10개**, 행 `quantity` 1~4, 그룹 합 ≤ 4 | 티켓 타입·응원 팀별 수량 |
| `items[].ticketTypeId` | integer | Y | 해당 공연 소속 | 티켓 타입 PK |
| `items[].quantity` | integer | Y | 1~4 | 수량 |
| `items[].chosenTeamId` | integer | 공동 공연 Y / 단독 생략 | 해당 공연 참여팀 | **(v6.2)** 이 행의 표가 응원할 팀. 같은 `ticketTypeId`가 팀별로 여러 행일 수 있다 |
| `totalAmount` | integer | Y | YoYo 정수 | 클라이언트 계산 금액(그룹 합계) |

```json
{ "performanceId": 12, "items": [ { "ticketTypeId": 31, "quantity": 1, "chosenTeamId": 9 }, { "ticketTypeId": 31, "quantity": 1, "chosenTeamId": 11 } ], "totalAmount": 50000 }
```

### 시스템 처리
1. 멱등키 확인 → **요청자 `wallet` 존재·`LINKED` 확인** → 공연 상태(`ON_SALE`)·예매 마감 확인 → 티켓 타입 소속·수량·**그룹 합산 1인 4매 한도** 확인 → 각 행의 `items[].chosenTeamId` 참여팀 확인 → 금액 재계산.
2. 상태 전이: Redis 원자적 재고 차감(**그룹 합으로, Lua 스크립트 하나** — 전 종류 잔량을 확인한 뒤에만 한꺼번에 차감하고 모자라면 쓰지 않는다. **[2026-09-26]** 티켓 종류 필드가 Redis에 없으면 DB 기준값 `total_quantity - sold_quantity - 결제 대기 수량`을 `HSETNX`로 깐 뒤 차감한다. 서버는 판매 중 공연의 Redis 재고를 같은 기준값과 대사해 어긋남이 두 번 관측되면 보정한다 — 기동 30초 뒤·5분 주기, 외부 API 없음) → **(v6.2)** `items`를 `chosenTeamId`별로 묶어 **하위 주문 N개**를 `ticket_order` 행으로 생성(`PENDING_PAYMENT`, `expiresAt = now + 15분`은 그룹 공통, 하위 주문마다 **`order_ref = keccak256(orderId)`**). 첫 하위 주문의 `ticket_order_id`를 모든 하위 주문의 **`order_group_id`**로 채운다.
3. 외부 호출: `YoYo.balanceOf(지갑)` 조회로 **그룹 합계** 기준 `walletBalance`·`shortfall` 산출(캐시 미사용 — 결제 화면 진입 값이다). 노드 실패 시 캐시값 + `balanceStale: true`.
4. `ticket_order`·`order_item` 저장(하위 주문마다), 15분 만료 스케줄 등록(그룹 단위). **온체인 tx는 아직 없다** — 결제 서명이 다음 단계다.

## Response
### 201 Created
```json
{
  "code": "SUCCESS",
  "data": {
    "orderGroupId": 5501,
    "orderId": 5501,
    "performanceId": 12,
    "performanceTitle": "합정 3밴드 합동공연",
    "status": "PENDING_PAYMENT",
    "orders": [
      {
        "orderId": 5501,
        "orderRef": "0x9a8b7c6d5e4f30211f2e3d4c5b6a798807162534435261708f9e0d1c2b3a4958",
        "chosenTeamId": 9,
        "chosenTeamName": "새벽세시",
        "teamIndex": 1,
        "items": [ { "ticketTypeId": 31, "name": "일반", "priceAmount": 25000, "quantity": 1, "amount": 25000 } ],
        "quantity": 1,
        "amount": 25000
      },
      {
        "orderId": 5502,
        "orderRef": "0x1c2b3a4958f6a9d8e7c6b5a49382716f5e4d3c2b1a09887766554433221100f",
        "chosenTeamId": 11,
        "chosenTeamName": "노을과기타",
        "teamIndex": 2,
        "items": [ { "ticketTypeId": 31, "name": "일반", "priceAmount": 25000, "quantity": 1, "amount": 25000 } ],
        "quantity": 1,
        "amount": 25000
      }
    ],
    "totalAmount": 50000,
    "totalQuantity": 2,
    "currency": "KRW",
    "display": { "currency": "USD", "approx": 37.04, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "walletBalance": 35000,
    "shortfall": 15000,
    "balanceStale": false,
    "expiresAt": "2026-09-10T20:15:00+09:00"
  },
  "msg": "15분 안에 결제를 완료해 주세요. (Insufficient balance · ₩15,000 short)"
}
```

### 4xx
```json
{ "code": "TICKET_SOLD_OUT", "data": null, "msg": "선택한 티켓이 모두 판매되었습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 수량 범위 위반, `Idempotency-Key` 없음, `totalAmount` 소수, **(v6.2) `items` 11행 이상**(같은 팀으로 중복된 행은 오류가 아니라 서버가 합산한다) |
| 400 | `TICKET_TEAM_CHOICE_REQUIRED` | **(v6.2) 공동 공연인데 `chosenTeamId`가 없는 행이 있음** |
| 400 | `TICKET_TEAM_CHOICE_INVALID` | 참여팀이 아닌 팀 배분 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 공연 |
| 404 | `TICKET_OPTION_NOT_FOUND` | 이 공연의 티켓 타입이 아님 |
| 404 | `WALLET_NOT_FOUND` | 지갑 미연결 회원 |
| 409 | `TICKET_SALE_NOT_STARTED` | 공연이 아직 `ON_SALE`이 아님 |
| 409 | `TICKET_SALE_CLOSED` | 예매 마감 또는 `SALE_CLOSED` 이후 |
| 409 | `TICKET_SOLD_OUT` | 재고 차감 실패(동시 예매 경합, 그룹 전체 미차감) |
| 409 | `TICKET_PURCHASE_LIMIT_EXCEEDED` | 1인 1공연 4매 초과(그룹 합산, 결제 시한이 남은 결제 대기 포함) 또는 한 번에 4매 초과 — `msg`로 구분 |
| 409 | `COMMON_CONFLICT` | 같은 멱등키에 다른 본문 |
| 429 | `COMMON_TOO_MANY_REQUESTS` | 매크로 차단 룰 |

---

### API-ticket-02 내 주문 목록
`GET /api/v1/orders/me` · 권한: AUDIENCE · 우선: P0 · 연관 화면: `A-12 주문 내역` · 연관 기능: `F-ticket-02 내 주문 목록 조회`

## 요구사항
- 로그인 관객의 주문을 **주문 그룹 단위**로 최신순으로 준다. **[v5]** `paymentStatus`는 결정 v2 §7 `Payment` **6값**(`REQUESTED`/`AWAITING_SIGNATURE`/`PAYING`/`PAID`/`FAILED`/`REFUNDED`)이며, `AWAITING_SIGNATURE`인 주문에는 "서명 대기" 배지를 띄우도록 `resumable: true`를 담는다.
- **(v6.2)** 각 항목에 `orderGroupId`·`groupStatus`(하위 주문에서 파생, §0 표)·팀별 표 수·금액(`teamBreakdown[]`)을 담는다.
- `PENDING_PAYMENT`/`PARTIALLY_PAID` 그룹에는 남은 시간(`expiresAt`)을 담아 A-05로 되돌아갈 수 있게 한다. 만료분은 조회 시점에 `CANCELLED`로 정리해 노출한다.
- 금액은 §0.5 축약형이다.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `status` | query | string | N | `PENDING_PAYMENT`/`PAID`/`PARTIALLY_PAID`/`CANCELLED`/`REFUNDED`(**v6.2** — `groupStatus` 파생값 포함) |
| `page`·`size`·`sort` | query | — | N | §0.2. `sort`는 `createdAt,desc`(기본)/`createdAt,asc` |

### Body
없음.

### 시스템 처리
1. 회원 식별 → 쿼리 검증.
2. 상태 전이: 만료된 `PENDING_PAYMENT` 하위 주문은 `CANCELLED`로 정리(재고 원복).
3. 외부 호출 없음.
4. **[v5]** `ticket_order` + `payment` 조인 후 **(v6.2) `order_group_id`로 묶어** `items`/`pageInfo`. 결제 보조 테이블은 없다.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "rate": { "currency": "USD", "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "items": [
      { "orderGroupId": 5501, "performanceId": 12, "performanceTitle": "합정 3밴드 합동공연", "startAt": "2026-09-19T19:00:00+09:00", "groupStatus": "PAID", "teamBreakdown": [ { "teamId": 9, "teamName": "새벽세시", "quantity": 1, "amount": 25000 }, { "teamId": 11, "teamName": "노을과기타", "quantity": 1, "amount": 25000 } ], "totalAmount": 50000, "currency": "KRW", "ticketCount": 2, "resumable": false, "orderedAt": "2026-09-10T20:00:00+09:00", "expiresAt": null }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 6, "hasNext": false }
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `status`·`sort`, `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |

---

### API-ticket-03 주문 상세
`GET /api/v1/orders/{orderId}` · 권한: AUDIENCE(주문자) · 우선: P0 · 연관 화면: `A-06 예매 완료`·`A-12 주문 내역` · 연관 기능: `F-ticket-03 주문 상세 조회`

## 요구사항
- 주문 항목·응원 팀·결제 정보와 **발급된 티켓 목록**을 준다. A-06 화면이 이 응답으로 그려진다. 본인 주문만 조회하고 타인 주문은 `COMMON_NOT_FOUND`로 존재를 숨긴다 [권].
- **(v6.2)** `orderId`(경로 파라미터)는 **그룹의 어느 하위 주문이든** 조회할 수 있고, 응답은 항상 **그룹 전체**를 담는다(`orderGroupId`·`groupStatus`·`orders[]`, 하위 주문마다 `items`·`chosenTeamName`·`payment`·`tickets`).
- **[v5]** 결제 정보는 `status`(§0.3 `Payment` 6값)·`approveTxHash`·`purchaseTxHash`를 담는다. v4의 결제 수단 구분 필드와 그 보조 식별자는 결제 경로가 하나가 되면서 삭제됐다. **관객 화면에는 해시를 접어 두고** "결제 완료" 수준으로 표기한다(§0.6). 응답에는 담아 A-13 이력·문의 대응에 쓴다.
- v3의 `depositStatus`(발행 확정 여부) 필드는 없어졌다 — 결제 자체가 온체인이라 `paymentStatus`에 흡수됐다.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `orderId` | path | integer(BIGINT) | Y | 주문 PK(**v6.2** 그룹의 어느 하위 주문이든 허용) |

### Body
없음.

### 시스템 처리
1. 주문 존재·소유자 확인 → **(v6.2) `order_group_id`로 그룹의 나머지 하위 주문 조회**.
2. 상태 전이: 만료된 `PENDING_PAYMENT` 하위 주문이면 `CANCELLED`로 정리 후 반환.
3. 외부 호출 없음.
4. **[v5]** `ticket_order` + `order_item` + `ticket` + `payment` 반환(**v6.2** 하위 주문마다).

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "orderGroupId": 5501,
    "groupStatus": "PAID",
    "performanceId": 12,
    "performanceTitle": "합정 3밴드 합동공연",
    "venueName": "합정 언플러그드",
    "startAt": "2026-09-19T19:00:00+09:00",
    "orders": [
      {
        "orderId": 5501,
        "orderRef": "0x9a8b7c6d5e4f30211f2e3d4c5b6a798807162534435261708f9e0d1c2b3a4958",
        "status": "PAID",
        "chosenTeamId": 9,
        "chosenTeamName": "새벽세시",
        "items": [ { "ticketTypeId": 31, "name": "일반", "priceAmount": 25000, "quantity": 1, "amount": 25000 } ],
        "amount": 25000,
        "payment": { "paymentId": 8801, "status": "PAID", "approveTxHash": "0x1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809", "purchaseTxHash": "0x5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f607182934a", "paidAt": "2026-09-10T20:03:11+09:00" },
        "tickets": [ { "ticketId": 90211, "ticketTypeName": "일반", "status": "ISSUED" } ]
      },
      {
        "orderId": 5502,
        "orderRef": "0x1c2b3a4958f6a9d8e7c6b5a49382716f5e4d3c2b1a09887766554433221100f",
        "status": "PAID",
        "chosenTeamId": 11,
        "chosenTeamName": "노을과기타",
        "items": [ { "ticketTypeId": 31, "name": "일반", "priceAmount": 25000, "quantity": 1, "amount": 25000 } ],
        "amount": 25000,
        "payment": { "paymentId": 8802, "status": "PAID", "approveTxHash": null, "purchaseTxHash": "0x8f90a1b2c3d4e5f607182934a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7", "paidAt": "2026-09-10T20:03:22+09:00" },
        "tickets": [ { "ticketId": 90212, "ticketTypeName": "일반", "status": "ISSUED" } ]
      }
    ],
    "totalAmount": 50000,
    "currency": "KRW",
    "display": { "currency": "USD", "approx": 37.04, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" }
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 주문 또는 타인 주문 |

---

### API-ticket-04 내 티켓 목록
`GET /api/v1/tickets/me` · 권한: AUDIENCE · 우선: P0 · 연관 화면: `A-07 내 티켓 목록` · 연관 기능: `F-ticket-04 내 티켓 목록 조회`

## 요구사항
- 소유 중인 티켓을 상태별 필터로 준다. 상태 배지와 함께 입장·취소 가능 여부를 표시한다 [권] P-13.
- **[v4]** `cancellable`이 `true`인 티켓에는 환불이 **지갑 잔액**으로 돌아간다는 안내(`refundTarget: "WALLET_BALANCE"`)를 담는다(P-20).
- **(v6.2)** 티켓마다 응원 팀 표기(`chosenTeamName`)를 담는다. 관객 화면은 "응원 팀"으로만 표기하고 티커·지갑·tx 용어는 노출하지 않는다(§0.6).

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `status` | query | string | N | `ISSUED`/`USED`/`CANCELLED`(**[v6] 3값**). 미지정 시 전체 |
| `page`·`size`·`sort` | query | — | N | §0.2. `sort`는 `startAt,asc`(기본)/`startAt,desc` |

### Body
없음.

### 시스템 처리
1. 회원 식별 → 쿼리 검증. 2. 상태 전이 없음(조회). 3. 외부 호출 없음. 4. `ticket` + `performance` 조인 후 `items`/`pageInfo`.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "items": [
      { "ticketId": 90211, "performanceId": 12, "performanceTitle": "합정 3밴드 합동공연", "venueName": "합정 언플러그드", "startAt": "2026-09-19T19:00:00+09:00", "ticketTypeName": "일반", "chosenTeamName": "새벽세시", "status": "ISSUED", "cancellable": true, "refundTarget": "WALLET_BALANCE" }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 2, "hasNext": false }
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `status`·`sort`, `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |

---

### API-ticket-05 티켓 상세
`GET /api/v1/tickets/{ticketId}` · 권한: AUDIENCE(소유자) · 우선: P0 · 연관 화면: `A-08 티켓 상세·QR` · 연관 기능: `F-ticket-05 티켓 상세 조회`

## 요구사항
- 티켓 정보·현재 상태·취소 가능 여부(사유 포함)를 준다. **QR 토큰은 여기 담지 않는다** — 회전 토큰은 API-ticket-06이 발급한다(SEC-06).
- 취소 가능 여부에는 수수료 구간(D-7 전액 / D-3 전까지 50% / D-3 00:00 이후 불가) 판단 결과를 담는다 [권] P-8. 정확한 환불액은 API-refund-01이다.
- 소유자가 아니면 `TICKET_NOT_OWNED`다(소유권은 DB 기준).

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `ticketId` | path | integer(BIGINT) | Y | 티켓 PK |

### Body
없음.

### 시스템 처리
1. 티켓 존재·소유자 확인. 2. 상태 전이 없음(조회). 3. 외부 호출 없음. 4. `ticket` + `performance` + `ticket_type` + 취소 판정 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "ticketId": 90211,
    "orderId": 5501,
    "performanceId": 12,
    "performanceTitle": "합정 3밴드 합동공연",
    "venueName": "합정 언플러그드",
    "venueAddress": "서울 마포구 양화로 000",
    "startAt": "2026-09-19T19:00:00+09:00",
    "ticketTypeName": "일반",
    "priceAmount": 25000,
    "currency": "KRW",
    "display": { "currency": "USD", "approx": 18.52, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "status": "ISSUED",
    "chosenTeamName": "새벽세시",
    "cancellable": true,
    "refundTarget": "WALLET_BALANCE",
    "cancelDeadlineAt": "2026-09-16T00:00:00+09:00",
    "entryOpenAt": "2026-09-19T18:00:00+09:00",
    "usedAt": null
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `TICKET_NOT_OWNED` | 현재 소유자가 아님 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 `ticketId` |

---

### API-ticket-06 동적 QR 토큰 발급
`GET /api/v1/tickets/{ticketId}/qr` · 권한: 소유자 · 우선: P0 · 연관 화면: `A-08 티켓 상세·QR` · 연관 기능: `F-ticket-06 동적 QR 발급`

## 요구사항
- **TOTP 방식 동적 QR** — 서버가 `ticket.qr_secret`과 현재 30초 윈도우로 HMAC-SHA256을 계산해 반환한다. 클라이언트는 `rotateAfterMs`(30초) 주기로 재호출한다. 고정 티켓번호 QR은 만들지 않는다 [권] P-14 / SEC-06.
- `qr_secret`은 **[v6] 티켓 발급 시 1회 생성**되고 이후 재생성 경로가 없다(SEC-07).
- `USED`·`CANCELLED`에는 발급하지 않는다. 입장 시간대 밖에서도 발급은 허용하되 검표에서 `ENTRY_NOT_IN_TIME_WINDOW`로 걸러진다 [권].
- **[v4]** QR·입장은 온체인과 무관하다. 티켓의 유효성은 DB 소유권과 서명 QR이 정한다(요구사항 §5 원칙 — 블록체인 성과가 아니다).
- **[2026-09-16 — S15P21B204-101] QR 이미지의 페이로드는 `qrToken` 문자열 그대로다**(포장·접두 없음). 검표(S-02)는 읽은 문자열을 API-entry-01의 `qrToken`에 그대로 넣고, `performanceId`는 QR이 아니라 검표 진입 URL `/entry/{performanceId}`에서 가져온다. 검표 링크의 `?token=`(STAFF 기기 인증, API-performance-10이 발급)과는 **다른 토큰**이다.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `ticketId` | path | integer(BIGINT) | Y | 티켓 PK |

### Body
없음.

### 시스템 처리
1. 티켓 존재·소유자·상태(`ISSUED`) 확인. 2. 상태 전이 없음(토큰 발급). 3. 외부 호출 없음. 4. `HMAC(qr_secret, ticketId + floor(now/30))`으로 토큰 생성(유효 60초). DB 쓰기 없음.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": { "ticketId": 90211, "qrToken": "eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjkwMjExLCJleHAiOjE3ODk...", "issuedAt": "2026-09-19T18:30:00+09:00", "expiresAt": "2026-09-19T18:31:00+09:00", "rotateAfterMs": 30000 },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `TICKET_NOT_OWNED` | 현재 소유자가 아님 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 `ticketId` |
| 409 | `TICKET_ALREADY_USED` | 상태가 `USED` |
| 409 | `TICKET_CANCELED` | 상태가 `CANCELLED` |
| 429 | `COMMON_TOO_MANY_REQUESTS` | 회전 주기보다 잦은 호출 |

---

## 7. payment — 코인 결제

**결제는 관객 지갑이 서명하는 `RevenueSplitter.purchase(showId, orderRef, teamIndex, amount, quantity)` tx 하나다.** 컨트랙트가 `token.transferFrom(관객, this, amount)`로 YoYo를 에스크로에 넣고 **선택 카운터를 함께 +1** 한다(결정 v2 §2.4). 모든 티켓 대금은 이 경로로만 에스크로에 들어온다(P-24 원장 단일화).

**[v5] 결제 수단은 하나다(P-7).** v4의 결제 수단 2모드가 사라지고 **잔액 결제만** 남았다. 요청 본문이 없어지고(`mode`·금액·외부 수단 정보 전부 삭제) 서버가 주문·잔액을 보고 판단한다.

| 상황 | 응답 | 화면(A-05) |
|---|---|---|
| 지갑 잔액 ≥ 결제액 | `200 OK` + 서명 파라미터(§0.4 `signRequests`) | "Pay 50,000 YoYo from balance" → "Confirm in your wallet" → "Confirming…" → "Paid" |
| 지갑 잔액 < 결제액 | **`409 COMMON_CONFLICT`** + `shortfall` | "Insufficient balance · 15,000 YoYo short" 안내만. **잔액을 늘리는 버튼이 없다**(화면 §5.16) |

- 전용 코드 **`PAYMENT_INSUFFICIENT_BALANCE`**(409)는 규격 v5 신설·재정의 제안이며(§16.1) 본문은 대체 코드 `COMMON_CONFLICT`를 쓴다. 규격 v3의 같은 이름 코드는 기본 문구가 지갑 잔액을 전제하지 않아 그대로 쓸 수 없다.
- 잔액이 모자란 경우에도 **주문은 `PENDING_PAYMENT`로 15분 남는다.** 관객이 그 안에 잔액을 확보하면(시연에서는 관리자 지급, API-coin-07) 같은 주문으로 다시 결제 시작을 호출할 수 있다.

Payment 상태(결정 v2 §7): **`REQUESTED → AWAITING_SIGNATURE → PAYING → PAID` / `FAILED` / `REFUNDED`** — v4의 `CHARGING`은 삭제됐다. 서명 파라미터 발급 = `AWAITING_SIGNATURE`, RLP 보고·대납 전송 = `PAYING`, receipt 검증 통과 = `PAID`.

**실패 보상 원칙** — 서명 거부·`purchase` revert 어느 쪽이든 **잔액은 그대로 남고** 주문만 15분 뒤 만료된다. 돈이 사라지는 경로도, 되돌려야 할 외부 승인도 없다.

**[v6.2] 주문 그룹 결제.** 하위 주문이 N개면 결제는 **`APPROVE` 1(미결제 하위 주문 합계) + `PURCHASE` × N**을 서명한다(2팀이면 3회). 경로의 `{orderId}`는 **그룹의 어느 하위 주문이든** 허용하고 서버가 그룹으로 해석하며, `Idempotency-Key`는 그룹 단위다. 하위 주문마다 `payment` 행이 하나씩 생긴다(`ticket_order_id` UNIQUE 유지). 하위 주문 일부만 결제가 확정되는 **부분 실패**는 확정분을 유지하고 실패분만 만료 경로로 보낸다 — "되돌리기(이미 확정된 표 자동 환불)"는 하지 않는다(API-ticket-01 참고).

### API-payment-01 결제 시작 **[v6 변경 — 주문 그룹 결제]**
`POST /api/v1/orders/{orderId}/payment` · 권한: AUDIENCE(주문자) · 우선: P0 · 연관 화면: `A-05 결제` · 연관 기능: `F-payment-01 결제 시작(잔액)`

## 요구사항
- `PENDING_PAYMENT`(또는 `PARTIALLY_PAID`) 주문 그룹에 대해 결제를 시작한다. **[v5] 요청 본문이 없다** — 결제 수단이 하나이므로 고를 것이 없고, 금액은 주문(`ticket_order`)에 이미 확정돼 있어 클라이언트가 다시 보낼 필요가 없다. `mode`·`amount`·외부 수단 정보 필드는 전부 삭제됐다.
- **(v6.2)** 경로의 `{orderId}`는 **그룹의 어느 하위 주문이든** 된다 — 서버가 `order_group_id`로 그룹 전체를 찾는다. 서명·잔액 검사는 **아직 결제되지 않은 하위 주문의 합계**를 기준으로 한다(이미 `PAID`인 하위 주문은 제외).
- 서버가 `YoYo.balanceOf(관객 지갑)`을 조회해 **잔액 ≥ 미결제 합계이면 즉시 서명 파라미터**(§0.4 `signRequests`: `APPROVE`? + 미결제 하위 주문마다 `PURCHASE`)를 내려주고 각 하위 주문의 `payment`를 `AWAITING_SIGNATURE`로 만든다.
- **잔액이 모자라면 `409 COMMON_CONFLICT`**이며 응답 `msg`에 부족액을 담는다(en: "Insufficient balance · ₩15,000 short"). `payment` 레코드는 만들지 않고 주문은 그대로 둔다. 전용 코드는 §16.1이다.
- `APPROVE`는 현재 allowance가 충분하면 `required: false`로 내려온다(결정 v1 §2.5). 프론트는 그 항목을 건너뛰고 `PURCHASE` 배열만 순서대로 서명한다.
- **[v5] 가스·수수료 관련 필드가 없다.** 수수료는 운영지갑이 전액 대납한다(§0.4).
- `Idempotency-Key`가 필수(그룹 단위)다. 같은 키 재호출은 최초 응답(`payments[]`·`signRequests`)을 재생한다. 다만 `signRequests`의 `nonce`·allowance 조건이 바뀌었으면 서버가 재생성해 담는다.
- **`payment.idempotency_key` 파생 규칙(v6.2)** — `payment.idempotency_key`는 `VARCHAR(255) NOT NULL UNIQUE`(V1)라 하위 주문마다 그대로 저장하면 두 번째 행부터 UNIQUE 위반이 난다. 클라이언트가 보내는 `Idempotency-Key` 헤더값은 **그룹 단위로 하나**이고, 서버는 하위 주문 `payment` 행마다 **`{Idempotency-Key}#{orderId}`**로 파생한 값을 `payment.idempotency_key`에 저장한다. 같은 헤더로 재호출하면 서버가 같은 방식으로 파생한 키로 각 행을 찾아 그대로 재생한다(값 규칙만 바뀌고 **스키마는 그대로**다 — ERD v5 "다른 테이블 무변경"과 모순되지 않는다).
- **[2026-09-24] 결제 전 본인 확인 스위치(§7.W)** — 서버 설정 `b204.webauthn.enabled`(`STEP_UP_ENABLED`, 기본 `false`)가 켜져 있으면 응답에 **`stepUpRequired: true`**가 실린다. 꺼져 있으면 값이 `null`이라 전역 `non_null` 직렬화로 **키 자체가 없다 — 스위치가 꺼진 응답은 이 개정 전과 같다.** 프론트는 이 값 하나로 분기한다(별도 프론트 플래그 없음). `true`면 서명 요청 직전에 기기 생체 인증(API-webauthn-03·04)으로 `stepUpToken`을 받아 API-payment-03 헤더 `X-Step-Up-Token`에 싣는다.
- 관객 화면 문구는 "Pay 50,000 YoYo from balance"이고, 서명 팝업 직전 "Confirm 50,000 YoYo payment" 확인 화면을 띄운다. 블록체인 용어는 "Confirm in your wallet" 한 줄만 허용된다(§0.6). 서명 단계 카운터는 "1/3 → 2/3 → 3/3"처럼 표시한다(화면 v7.5).

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language` · `Idempotency-Key: {UUIDv4}` **필수**

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `orderId` | path | integer(BIGINT) | Y | 주문 PK(**v6.2** 그룹의 어느 하위 주문이든 허용) |

### Body
**[v5] 없음**(빈 객체 `{}` 허용). 알 수 없는 필드가 오면 `COMMON_VALIDATION_FAILED`로 거부한다 — v4의 결제 수단 지정 필드(`mode` 등)를 보내는 구 클라이언트를 조용히 통과시키지 않기 위해서다.

### 시스템 처리
1. 멱등키 확인 → 주문 그룹 조회·소유자·상태(`PENDING_PAYMENT`/`PARTIALLY_PAID`)·만료 확인 → 지갑 `LINKED` 확인 → `YoYo.balanceOf` 조회(캐시 미사용) → `YoYo.allowance(관객, Splitter)` 조회.
2. **(v6.2)** 미결제 하위 주문 합계를 산출한다. 잔액 < 합계이면 여기서 `409`로 종료한다(레코드 생성 없음).
3. 상태 전이: 미결제 하위 주문마다 `payment` 생성(`REQUESTED`) → 곧바로 **`AWAITING_SIGNATURE`**. `payment.amount`·`payer_wallet_id`·`idempotency_key`(**`{Idempotency-Key}#{orderId}`로 파생**, 아래 참고) 기록.
4. 외부 호출: 잔액·allowance 조회뿐. **mint·외부 승인 호출이 없다.** calldata 생성(`approve(splitter, 미결제 합계)`, 미결제 하위 주문마다 `purchase(showId, orderRef, teamIndex, amount, quantity)`) + 결제 감사 로그(SEC-11).

## Response
### 200 OK — 서명 파라미터
```json
{
  "code": "SUCCESS",
  "data": {
    "orderGroupId": 5501,
    "approveJobId": null,
    "payments": [
      { "orderId": 5501, "paymentId": 8801, "paymentStatus": "AWAITING_SIGNATURE", "amount": 25000, "teamName": "새벽세시", "purchaseJobId": null },
      { "orderId": 5502, "paymentId": 8802, "paymentStatus": "AWAITING_SIGNATURE", "amount": 25000, "teamName": "노을과기타", "purchaseJobId": null }
    ],
    "amount": 50000,
    "currency": "KRW",
    "display": { "currency": "USD", "approx": 37.04, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "walletBalance": 85000,
    "signRequests": [
      { "kind": "APPROVE", "required": false, "txType": "FEE_DELEGATED_SMART_CONTRACT_EXECUTION", "to": "0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736", "data": "0x095ea7b3...", "value": "0x0", "chainId": "0x3e9", "gas": "0x11170", "feePayer": "0x9f8e7d6c5b4a39281706f5e4d3c2b1a098765432", "summary": { "title": "Allow ticket payment", "amount": 50000, "currency": "KRW", "spender": "RevenueSplitter", "spenderAddress": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678" } },
      { "kind": "PURCHASE", "required": true, "txType": "FEE_DELEGATED_SMART_CONTRACT_EXECUTION", "to": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678", "data": "0x3d7403a3...", "value": "0x0", "chainId": "0x3e9", "gas": "0x30d40", "feePayer": "0x9f8e7d6c5b4a39281706f5e4d3c2b1a098765432", "summary": { "orderId": 5501, "title": "Confirm 25,000 YoYo payment", "amount": 25000, "currency": "KRW", "performanceId": 12, "orderRef": "0x9a8b7c6d5e4f30211f2e3d4c5b6a798807162534435261708f9e0d1c2b3a4958", "teamIndex": 1, "teamName": "새벽세시" } },
      { "kind": "PURCHASE", "required": true, "txType": "FEE_DELEGATED_SMART_CONTRACT_EXECUTION", "to": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678", "data": "0x4e8514b4...", "value": "0x0", "chainId": "0x3e9", "gas": "0x30d40", "feePayer": "0x9f8e7d6c5b4a39281706f5e4d3c2b1a098765432", "summary": { "orderId": 5502, "title": "Confirm 25,000 YoYo payment", "amount": 25000, "currency": "KRW", "performanceId": 12, "orderRef": "0x1c2b3a4958f6a9d8e7c6b5a49382716f5e4d3c2b1a09887766554433221100f", "teamIndex": 2, "teamName": "노을과기타" } }
    ],
    "expiresAt": "2026-09-10T20:15:00+09:00"
  },
  "msg": ""
}
```

**[2026-09-24]** 스위치가 켜져 있으면 `data`에 `"stepUpRequired": true`가 하나 더 실린다(꺼져 있으면 위 예시 그대로 — 키 없음).

`APPROVE.required: false`는 현재 allowance가 이미 충분하다는 뜻이며 프론트는 그 항목을 건너뛴다. **(v6.2)** `PURCHASE` 각 항목의 `summary.orderId`로 어느 하위 주문의 서명인지 프론트가 구분한다.

### 409 Conflict — 잔액 부족 **[v5]**
```json
{ "code": "COMMON_CONFLICT", "data": null, "msg": "Insufficient balance · ₩15,000 short. (need ₩50,000 · have ₩35,000)" }
```

부족액을 `data`로 내리지 않고 `msg`에만 담는다 — 실패 응답의 `data`는 예외 없이 `null`이라는 §0.1 규약을 지키기 위해서다. 화면이 숫자를 다시 계산해야 하면 API-ticket-01·API-wallet-01의 `shortfall`·`balance`를 쓴다(§16.3 #2). **(v6.2)** 부족액은 미결제 하위 주문 합계 기준이다.

### 4xx/5xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `Idempotency-Key` 없음, **[v5]** 알 수 없는 본문 필드(`mode` 등) 전달 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 주문 또는 타인 주문 |
| 404 | `WALLET_NOT_FOUND` | 지갑 미연결 회원 |
| 409 | `COMMON_CONFLICT` | **[v5] 지갑 YoYo 잔액 < 미결제 하위 주문 합계**, 같은 멱등키에 다른 본문, 주문 만료, 이미 서명 대기 중인 결제 존재 (잔액 부족 전용 코드는 §16.1) |
| 409 | `PAYMENT_ALREADY_PAID` | 그룹 전체가 이미 결제 완료됨(더 결제할 하위 주문이 없음) |
| 409 | `TICKET_SALE_CLOSED` | 결제 시도 시점에 예매 마감 |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | 잔액·allowance 조회 실패(서명 파라미터를 만들 수 없음) |

> **[v5] 삭제된 에러 3개** — `COIN_RESERVE_MISMATCH`(발행 대사 불일치로 mint 중단)는 결제에 mint가 없어 더 이상 이 API의 실패 조건이 아니다. `PAYMENT_REQUEST_FAILED`(502)·`PAYMENT_TIMEOUT`(504)은 외부 승인 호출이 사라져 발생할 수 없다(§16.4 폐기 후보). `WALLET_GAS_INSUFFICIENT`(409)도 대납 채택으로 사라졌다.

---

### API-payment-02 결제 상태 조회 **[v5 변경 — 결제 단계 하나]**
`GET /api/v1/orders/{orderId}/payment` · 권한: AUDIENCE(주문자) · 우선: P0 · 연관 화면: `A-05 결제` · 연관 기능: `F-payment-02 결제 상태 조회`

## 요구사항
- A-05의 처리 중 상태(폴링)에서 쓰는 조회다. **[v5]** 단계가 `paymentStatus` 하나로 단순해졌다 — v4의 수단 준비 단계 상태·객체가 삭제됐고 `CHARGING` 상태도 없다.
- **(v6.2)** 응답은 **그룹 뷰**다 — `orderGroupId`·`groupStatus`(§0 파생 규칙)·`payments[{orderId, paymentId, paymentStatus, amount, teamName, purchaseJobId}]`·`paidCount`/`totalCount`를 담는다. **[v6.2 변경] `purchaseJobId`는 하위 주문마다 다르므로 `payments[].purchaseJobId`로 옮겼다. `approveJobId`는 그룹당 1건(미결제 합계에 대한 승인)이라 최상위에 그대로 둔다.**
- `payments[]` 중 하나라도 `paymentStatus=AWAITING_SIGNATURE`이면 **응답에 미결제분만 다시 담은 `signRequests`를 함께 담는다** — 프론트가 별도 prepare 호출 없이 곧바로 서명을 요청할 수 있게 하기 위해서다(A-05 원스텝 UX).
- 결제가 확정되면 발급된 `ticketIds`를 함께 주어 A-06으로 바로 넘어갈 수 있게 한다.
- **[2026-09-24]** `stepUpRequired`를 API-payment-01과 **같은 규칙**으로 싣는다(스위치 켜짐 `true`, 꺼짐 키 없음). 새로고침 복원 경로는 payment-01을 다시 부르지 않고 이 응답의 `signRequests`로 서명을 이어가므로, 본인 확인 분기 근거도 여기 있어야 한다.
- 관객 화면에는 코인·체인 용어를 노출하지 않는다 — `paymentStatus`는 "지갑에서 확인 / 확인 중 / 완료"로 매핑해 표기한다(§0.6).
- `signRequests`는 매 호출마다 **현재 allowance·잔액을 다시 반영해**(미결제 하위 주문만) 만들어 준다. 잔액이 그 사이 줄었으면 `blockedReason: "INSUFFICIENT_BALANCE"`와 `shortfall`을 담고 `signRequests`를 `null`로 준다(성공 응답이므로 `data`에 담을 수 있다).
- **(v6.2)** 하위 주문 일부만 `PAID`이고 나머지가 `PENDING_PAYMENT`이거나 `CANCELLED`면 `groupStatus = "PARTIALLY_PAID"`다. 만료 전(15분 이내)에는 나머지가 `PENDING_PAYMENT`로 남아 **`API-payment-01` 재호출로 재시도**할 수 있고, 이때 `expiresAt`은 `null`이 아니라 남은 시간을 담는다. 이 경우 이미 발급된 `ticketIds`는 그대로 담아 A-06에서 "2장 중 1장 결제됨" 안내와 함께 보여 준다.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `orderId` | path | integer(BIGINT) | Y | 주문 PK(**v6.2** 그룹의 어느 하위 주문이든 허용) |

### Body
없음.

### 시스템 처리
1. 주문 그룹 조회·소유자 확인.
2. 상태 전이 없음(조회). **[v5]** v4의 "수단 준비 완료 → 서명 대기" 동기화 단계가 사라졌다.
3. 외부 호출: 그룹에 `AWAITING_SIGNATURE`인 하위 주문이 있을 때만 `balanceOf`·`allowance` 조회(미결제분 서명 파라미터 재생성). 그 외 단계는 `payment`·`chain_job` 레코드로 판단한다.
4. 결제·티켓 발급 상태를 하위 주문별로 모아 그룹 뷰로 반환.

## Response
### 200 OK (서명 대기)
```json
{
  "code": "SUCCESS",
  "data": {
    "orderGroupId": 5501,
    "groupStatus": "PENDING_PAYMENT",
    "approveJobId": null,
    "payments": [
      { "orderId": 5501, "paymentId": 8801, "paymentStatus": "AWAITING_SIGNATURE", "amount": 25000, "teamName": "새벽세시", "purchaseJobId": null },
      { "orderId": 5502, "paymentId": 8802, "paymentStatus": "AWAITING_SIGNATURE", "amount": 25000, "teamName": "노을과기타", "purchaseJobId": null }
    ],
    "paidCount": 0,
    "totalCount": 2,
    "amount": 50000,
    "currency": "KRW",
    "display": { "currency": "USD", "approx": 37.04, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "walletBalance": 85000,
    "shortfall": 0,
    "signRequests": [
      { "kind": "APPROVE", "required": true, "txType": "FEE_DELEGATED_SMART_CONTRACT_EXECUTION", "to": "0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736", "data": "0x095ea7b3...", "value": "0x0", "chainId": "0x3e9", "gas": "0x11170", "feePayer": "0x9f8e7d6c5b4a39281706f5e4d3c2b1a098765432", "summary": { "title": "Allow ticket payment", "amount": 50000, "currency": "KRW", "spender": "RevenueSplitter", "spenderAddress": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678" } },
      { "kind": "PURCHASE", "required": true, "txType": "FEE_DELEGATED_SMART_CONTRACT_EXECUTION", "to": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678", "data": "0x3d7403a3...", "value": "0x0", "chainId": "0x3e9", "gas": "0x30d40", "feePayer": "0x9f8e7d6c5b4a39281706f5e4d3c2b1a098765432", "summary": { "orderId": 5501, "title": "Confirm 25,000 YoYo payment", "amount": 25000, "currency": "KRW", "performanceId": 12, "orderRef": "0x9a8b7c6d5e4f30211f2e3d4c5b6a798807162534435261708f9e0d1c2b3a4958", "teamIndex": 1, "teamName": "새벽세시" } },
      { "kind": "PURCHASE", "required": true, "txType": "FEE_DELEGATED_SMART_CONTRACT_EXECUTION", "to": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678", "data": "0x4e8514b4...", "value": "0x0", "chainId": "0x3e9", "gas": "0x30d40", "feePayer": "0x9f8e7d6c5b4a39281706f5e4d3c2b1a098765432", "summary": { "orderId": 5502, "title": "Confirm 25,000 YoYo payment", "amount": 25000, "currency": "KRW", "performanceId": 12, "orderRef": "0x1c2b3a4958f6a9d8e7c6b5a49382716f5e4d3c2b1a09887766554433221100f", "teamIndex": 2, "teamName": "노을과기타" } }
    ],
    "blockedReason": null,
    "ticketIds": [],
    "pollAfterMs": null,
    "expiresAt": "2026-09-10T20:15:00+09:00"
  },
  "msg": ""
}
```

### 200 OK (결제 완료)
```json
{
  "code": "SUCCESS",
  "data": {
    "orderGroupId": 5501,
    "groupStatus": "PAID",
    "approveJobId": "chain_01J9GC5D6E",
    "payments": [
      { "orderId": 5501, "paymentId": 8801, "paymentStatus": "PAID", "amount": 25000, "teamName": "새벽세시", "purchaseJobId": "chain_01J9GC5D6F" },
      { "orderId": 5502, "paymentId": 8802, "paymentStatus": "PAID", "amount": 25000, "teamName": "노을과기타", "purchaseJobId": "chain_01J9GC5D71" }
    ],
    "paidCount": 2,
    "totalCount": 2,
    "amount": 50000,
    "currency": "KRW",
    "signRequests": null,
    "blockedReason": null,
    "feeDelegated": true,
    "ticketIds": [90211, 90212],
    "paidAt": "2026-09-10T20:03:22+09:00",
    "pollAfterMs": null
  },
  "msg": ""
}
```

### 200 OK (잔액 부족으로 서명 불가) **[v5]**
```json
{
  "code": "SUCCESS",
  "data": {
    "orderGroupId": 5501,
    "groupStatus": "PENDING_PAYMENT",
    "approveJobId": null,
    "payments": [
      { "orderId": 5501, "paymentId": 8801, "paymentStatus": "AWAITING_SIGNATURE", "amount": 25000, "teamName": "새벽세시", "purchaseJobId": null },
      { "orderId": 5502, "paymentId": 8802, "paymentStatus": "AWAITING_SIGNATURE", "amount": 25000, "teamName": "노을과기타", "purchaseJobId": null }
    ],
    "paidCount": 0,
    "totalCount": 2,
    "amount": 50000,
    "currency": "KRW",
    "walletBalance": 35000,
    "shortfall": 15000,
    "signRequests": null,
    "blockedReason": "INSUFFICIENT_BALANCE",
    "ticketIds": [],
    "pollAfterMs": 3000,
    "expiresAt": "2026-09-10T20:15:00+09:00"
  },
  "msg": "Insufficient balance · ₩15,000 short."
}
```

### 200 OK (부분 결제, v6.2)
```json
{
  "code": "SUCCESS",
  "data": {
    "orderGroupId": 5501,
    "groupStatus": "PARTIALLY_PAID",
    "approveJobId": "chain_01J9GC5D6E",
    "payments": [
      { "orderId": 5501, "paymentId": 8801, "paymentStatus": "PAID", "amount": 25000, "teamName": "새벽세시", "purchaseJobId": "chain_01J9GC5D6F" },
      { "orderId": 5502, "paymentId": 8802, "paymentStatus": "FAILED", "amount": 25000, "teamName": "노을과기타", "purchaseJobId": "chain_01J9GC5D72" }
    ],
    "paidCount": 1,
    "totalCount": 2,
    "amount": 50000,
    "currency": "KRW",
    "signRequests": null,
    "blockedReason": null,
    "ticketIds": [90211],
    "pollAfterMs": null,
    "expiresAt": "2026-09-10T20:15:00+09:00"
  },
  "msg": "2장 중 1장 결제됨 — 남은 1장은 다시 시도(payment-01 재호출)하거나 15분 뒤 자동 취소됩니다."
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `blockedReason` | string\|null | **[v5]** `INSUFFICIENT_BALANCE` 하나만 쓴다. 화면은 이 값으로 §5.16 안내 컴포넌트를 띄운다 |
| `shortfall` | integer | 부족액(0 이상). 잔액이 충분하면 `0` |
| `groupStatus` | string | **(v6.2)** §0 파생 규칙 — `PENDING_PAYMENT`/`PAID`/`PARTIALLY_PAID`/`CANCELLED`/`REFUNDED`. `AWAITING_SIGNATURE`·`FAILED`는 주문 그룹 상태가 아니라 **`payments[].paymentStatus`로만 노출**한다 |
| `approveJobId` | string\|null | 그룹의 `APPROVE` job id(그룹당 1건, 미결제 합계 대상). 서명 전이면 `null` |
| `payments[].purchaseJobId` | string\|null | **(v6.2)** 그 하위 주문의 `PURCHASE` job id. 하위 주문마다 다르므로 그룹 최상위가 아니라 `payments[]` 항목 안에 둔다. 서명 전이면 `null` |

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 주문, 타인 주문, 결제 시작 이력 없음 |

---

### API-payment-03 결제 tx 해시 보고 **[v6 변경 — 하위 주문 지정]**
`POST /api/v1/orders/{orderId}/payment/signed-tx` · 권한: AUDIENCE(주문자) · 우선: P0 · 연관 화면: `A-05 결제` · 연관 기능: `F-payment-05 결제 서명 tx 보고` · `F-wallet-06 사용자 서명 tx 보고·검증`

## 요구사항
- **[v5]** 관객이 만든 **발신자 서명 RLP**를 보고한다. 서버가 대납 서명(fee payer)을 붙여 전송하고 `202` + `jobId`(`signerType=USER`, `feeDelegated=true`)를 준다. `kind=APPROVE`면 allowance 확인만 하고, `kind=PURCHASE`의 receipt가 확정될 때 **결제가 성립**한다. 이름은 v1 §9 인벤토리 표기를 그대로 유지했다(§16.3 #1).
- **(v6.2)** `kind=PURCHASE`는 본문의 **`orderId`로 어느 하위 주문의 서명인지 지정**한다(필수). 서버는 RLP calldata에서 디코드한 `orderRef`가 그 하위 주문의 `order_ref`와 같은지 대조하고, 다르면 `PAYMENT_AMOUNT_MISMATCH`(409, 전용 코드 `PAYMENT_TX_MISMATCH`, §16.1)로 거부한다. `kind=APPROVE` job은 **미결제 하위 주문 중 `orderId` 오름차순 첫 행**에 귀속한다 — 대표 주문이 이미 `PAID`일 수 있어(재시도 시 `PAYMENT_ALREADY_PAID` 가드에 막힘) 대표 주문에 고정해 묶지 않는다. `orderId` 생략을 허용하며, `orderId`가 **와도 오류가 아니고 서버가 무시한다.**
- 상태 전이: `PURCHASE` 보고 즉시 그 하위 주문의 `payment` `AWAITING_SIGNATURE` → **`PAYING`**. receipt 확정 시 → **`PAID`** + 그 하위 주문 `PENDING_PAYMENT` → `PAID` + **티켓 `ISSUED` 발급**(`qr_secret` 생성) + `ticket.choice_tx_hash`에 purchase 해시 기록. **다른 하위 주문의 상태는 영향받지 않는다**(부분 실패 정책, API-ticket-01).
- 검증 항목(§0.4): RLP 발신자 == 관객 지갑 · receipt `status=1` · `to == splitterAddress` · `from == 관객 지갑` · 로그에 **`Purchased(showId, orderRef, buyer, teamIndex, amount, quantity)`** 존재 · `showId == performanceId` · **`orderRef == 지정한 하위 주문의 order_ref`** · `teamIndex == 저장된 값` · `amount == 그 하위 주문의 amount` · **`quantity == 그 하위 주문의 총 수량`**. 하나라도 어긋나면 티켓을 발급하지 않고 `PAYMENT_AMOUNT_MISMATCH`(409)로 응답한다(전용 코드 `PAYMENT_TX_MISMATCH`는 §16.1).
- **tx가 revert된 경우**(receipt `status=0`)는 재고 소진·판매 잠금·allowance 부족이 원인이다. 그 하위 주문의 `payment`를 `FAILED`로 두되 **주문은 `PENDING_PAYMENT`로 남겨** 사용자가 재시도할 수 있게 한다(15분 만료까지). 코인은 이동하지 않았으므로 잔액 그대로다. **이미 `PAID`가 된 다른 하위 주문은 되돌리지 않는다.**
- **서명 거부**는 이 API를 호출하지 않는 것으로 표현된다. 그 하위 주문의 `payment`는 `AWAITING_SIGNATURE`로 남고 주문 만료 시 `FAILED`, 그 하위 주문은 `CANCELLED`가 되며 **잔액은 그대로 남는다**(결정 v2 §3.3 실패 보상). 명시적으로 알리려면 아래 `abandoned` 플래그를 보낸다 [권].
- **[2026-09-24] 본인 확인 가드(§7.W)** — 스위치가 켜져 있으면 헤더 **`X-Step-Up-Token`**(API-webauthn-04가 준 토큰)이 필수다. 서버는 이 헤더를 Redis에서 소비해(`GETDEL`) 요청 회원과 같은지 확인하고 범위(`PAYMENT`·주문 그룹)에 묶는다 — 같은 그룹의 이어지는 보고(`APPROVE` → `PURCHASE` × N)는 같은 토큰으로 통과한다(§0.12, 120초). 헤더 없음·만료·이미 소비·다른 동작이나 다른 그룹에 발급된 토큰·다른 회원의 토큰은 **403 `WEBAUTHN_STEP_UP_REQUIRED`**. `abandoned: true`(서명 취소 알림)는 코인이 움직이지 않으므로 가드를 적용하지 않는다. **스위치가 꺼져 있으면 헤더를 읽지도 않는다**(보내도 무시).
- **[v5]** 같은 `senderSignedRlp` 재보고는 최초 `jobId`를 재생한다. 티켓 발급은 receipt 확정 직후이며 Kairos 블록 1초라 "Confirming…" 표시는 수 초다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`
- **[2026-09-24]** `X-Step-Up-Token: {stepUpToken}` — 스위치 켜짐이면 필수(`abandoned: true` 제외), 꺼짐이면 무시

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `orderId` | path | integer(BIGINT) | Y | 주문 PK(**v6.2** 그룹의 어느 하위 주문이든 허용 — 실제 대상은 본문 `orderId`) |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `kind` | string | Y | `APPROVE` / `PURCHASE` | 어느 서명의 결과인지 |
| `senderSignedRlp` | string | 조건부 | `0x` + hex, 최대 8KB. `abandoned`가 아니면 필수 | **[v5]** 관객 지갑이 만든 발신자 서명 RLP(`FeeDelegatedSmartContractExecution`) |
| `orderId` | integer | 조건부 | `kind=PURCHASE`면 **Y**, `kind=APPROVE`면 생략 가능 | **(v6.2)** 이 서명이 어느 하위 주문의 `purchase`인지. calldata의 `orderRef`와 대조한다 |
| `abandoned` | boolean | N | 기본 `false` | `true`면 사용자가 서명을 취소했음을 알린다. `payment`는 `AWAITING_SIGNATURE` 유지, 주문은 만료 스케줄대로 처리 |

```json
{ "kind": "PURCHASE", "senderSignedRlp": "0x31f8c2...", "orderId": 5502 }
```

### 시스템 처리
0. **[2026-09-24]** 주문 그룹 소유 확인 직후, 스위치가 켜져 있으면 step-up 토큰 확인(§0.12). 실패 시 403 `WEBAUTHN_STEP_UP_REQUIRED`로 종료하고 아래 단계는 돌지 않는다.
1. 주문 그룹·(v6.2) 지정 하위 주문의 `payment` 상태(`AWAITING_SIGNATURE`·`PAYING`) 확인 → **[v5]** RLP 디코드·발신자 주소 복구·`to`·`data` 대조·중복 보고 확인 → **(v6.2) calldata의 `orderRef`가 지정 `orderId`의 `order_ref`와 같은지 대조**(다르면 `PAYMENT_AMOUNT_MISMATCH`) → 주문 만료 여부 확인.
2. 상태 전이: `chain_job` 생성(`tx_type=APPROVE`|`PURCHASE`, `signer_type=USER`, `fee_delegated=true`, `PENDING`) → **대납 서명·전송** → `tx_hash` 기록·`SUBMITTED` → `PURCHASE`면 그 하위 주문의 `payment` → `PAYING`. receipt 확정 시 그 하위 주문의 `payment` → `PAID`, 그 하위 주문 → `PAID`, `ticket` 발급, `payment.purchase_tx_hash`·`purchase_chain_job_id` 기록 + **[v6] 발신(관객) 지갑의 `wallet:balance` 갱신**(§0.12).
3. 외부 호출(202): 대납 서명 tx 전송 → receipt 폴링(시한 120초 뒤에도 노드가 tx 를 알면 계속, §0.3) → `Purchased` 이벤트 파싱·9개 항목 검증.
4. `chain_job`·`payment`·`ticket_order`·`ticket` 저장 + 결제 감사 로그. 확정 시 관객 알림(예매 완료, 그룹의 다른 하위 주문이 남아 있으면 "N/M 결제 완료"로 표기).

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": {
    "jobId": "chain_01J9GC5D6F",
    "status": "SUBMITTED",
    "signerType": "USER",
    "feeDelegated": true,
    "pollAfterMs": 1200,
    "orderId": 5502,
    "orderGroupId": 5501,
    "paymentId": 8802,
    "kind": "PURCHASE",
    "paymentStatus": "PAYING",
    "txHash": "0x5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f607182934a",
    "explorerUrl": "https://kairos.kaiascan.io/tx/0x5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f607182934a",
    "expectedEvent": "Purchased",
    "pendingOrderIds": [5501]
  },
  "msg": "결제를 확인하고 있습니다."
}
```

`txHash`는 **서버가 대납 서명 후 전송해서 얻은 해시**다. 클라이언트가 보고한 값이 아니다. **(v6.2)** `pendingOrderIds`는 그룹에서 아직 결제가 확정되지 않은 하위 주문 목록이다(빈 배열이면 이 보고로 그룹 전체가 완결).

### 200 OK (`abandoned: true`)
```json
{ "code": "SUCCESS", "data": { "orderId": 5502, "orderGroupId": 5501, "paymentId": 8802, "paymentStatus": "AWAITING_SIGNATURE", "orderStatus": "PENDING_PAYMENT", "balanceKept": true, "expiresAt": "2026-09-10T20:15:00+09:00" }, "msg": "결제가 완료되지 않았습니다. 잔액은 그대로 남아 있습니다." }
```

### 4xx/5xx
```json
{ "code": "PAYMENT_AMOUNT_MISMATCH", "data": null, "msg": "트랜잭션 내용이 주문과 일치하지 않습니다. 처음부터 다시 시도해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | **[v5]** RLP 형식 위반·디코드 실패, 허용되지 않는 `kind`, `abandoned=false`인데 `senderSignedRlp` 누락, **(v6.2) `kind=PURCHASE`인데 `orderId` 누락** |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `WEBAUTHN_STEP_UP_REQUIRED` | **[2026-09-24]** 스위치 켜짐 + `X-Step-Up-Token` 없음·만료·이미 소비·다른 주문 그룹·다른 회원의 토큰 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 주문, 타인 주문, 결제 시작 이력 없음(순서 위반), **(v6.2) `orderId`가 이 그룹의 하위 주문이 아님** |
| 409 | `PAYMENT_ALREADY_PAID` | 이미 `PAID`인 하위 주문 |
| 409 | `COMMON_CONFLICT` | 주문 만료(15분 경과), 같은 RLP가 다른 주문으로 보고됨 (서명 거부 전용 코드 `PAYMENT_SIGNATURE_REJECTED`는 §16.1) |
| 409 | `PAYMENT_AMOUNT_MISMATCH` | **[v5]** RLP 발신자·`to`·`data` 불일치 또는 receipt·`Purchased` 이벤트 검증 실패(9개 항목 중 하나), **(v6.2) calldata `orderRef`가 지정한 `orderId`와 다름**(전용 코드 `PAYMENT_TX_MISMATCH`는 §16.1) |
| 409 | `TICKET_SOLD_OUT` | tx가 재고 부족으로 revert됨(컨트랙트·재고 대사 결과) |
| 409 | `TICKET_SALE_CLOSED` | tx가 판매 잠금(`ON_SALE` 아님)으로 revert됨 |
| 500 | `CHAIN_GAS_INSUFFICIENT` | **[v5]** 운영지갑(fee payer) 잔액 부족으로 대납 전송 불가 — 운영자 알림 대상 |
| 504 | `CHAIN_TX_TIMEOUT` | 확정이 120초를 넘김 — `jobId`로 계속 폴링 |

---

### 7.W webauthn — 결제 전 본인 확인(패스키) **[2026-09-24 신설 · 결정 v2 §14-41]**

**무엇을 하는가.** 관객이 결제 서명 직전에 — **(9/24 오후)** 그리고 공연자가 규칙 동의·보증금 서명, 정산 조기 동의·정산금 지급 직전에 — **기기 생체 인증**(Windows Hello 지문, iPhone Face ID 등 — WebAuthn *platform authenticator*)으로 본인임을 한 번 더 확인한다. 코드는 하나이고 **기기가 수단을 정한다.** 생체 정보는 기기 밖으로 나가지 않으며 서버는 **기기 키의 서명만 검증**한다(공개키만 저장).

**스위치.** 서버 설정 `b204.webauthn.enabled`(환경변수 **`STEP_UP_ENABLED`**, **기본 `false`**) — 보호 동작 5개에 한 번에 걸리는 스위치 하나다. 꺼져 있으면 모든 흐름이 이 개정 전과 **완전히 같다** — 아래 표의 응답들에 `stepUpRequired` 키가 없고, 보호 API는 `X-Step-Up-Token` 헤더를 보지 않는다. 이 절의 4개 API는 스위치와 무관하게 열려 있다(미리 기기를 등록해 둘 수 있게). 로그인을 대체하지 않는다 — 인증은 기존 세션 JWT이고 이것은 **동작 한 건에 대한 추가 확인(step-up)**이다.

| 동작(`action`) | 대상(`targetId`) | `stepUpRequired`를 싣는 응답 | 토큰을 요구하는 API | 가드 위치(먼저 도는 검사) |
|---|---|---|---|---|
| `PAYMENT` | 주문 그룹 id(`orderGroupId`) | API-payment-01 · 02 | API-payment-03(`abandoned` 제외) | 주문 소유 |
| `RULE_AGREE` | 공연 id | API-rule-03 | API-rule-05 | 참여팀 리더 |
| `DEPOSIT` | 공연 id | API-performance-13 | API-performance-14(APPROVE·DEPOSIT 둘 다) | 공연 생성자 |
| `SETTLEMENT_APPROVE` | 공연 id | API-settlement-01 | API-settlement-08 | 동의 게이트(참여팀 리더·상태) |
| `SETTLEMENT_RELEASE` | 공연 id | API-settlement-01 | API-settlement-05(자동 스케줄 제외) | 생성자·ADMIN |

가드는 언제나 **권한·소유 검사 뒤**에 돈다 — 남의 대상 id로 들어온 요청이 토큰을 태우지 못한다.

**RP 설정.** `rpId` = `WEBAUTHN_RP_ID`(기본 `localhost`), RP 이름 `BULLEOYO`, 허용 origin = `WEBAUTHN_ORIGINS`(쉼표 구분, 기본 `http://localhost:5173`). dev는 `j15b204.p.ssafy.io` / `https://j15b204.p.ssafy.io`. **rpId가 페이지 도메인과 다르면 브라우저가 호출 자체를 거부**하고, origin이 목록에 없으면 서버가 `WEBAUTHN_VERIFICATION_FAILED`로 거부한다.

**흐름(스위치 켜짐).** 위 표의 응답에서 `stepUpRequired: true`를 본다 → API-webauthn-03(본문 `{action, targetId}`) → `registered: false`면 API-webauthn-01·02로 기기 등록 후 03을 다시 → 버튼 클릭 안에서 `navigator.credentials.get` → API-webauthn-04 → `stepUpToken` → 보호 API 헤더 `X-Step-Up-Token`.

**토큰 규칙.** `stepUpToken`은 32바이트 난수(base64url), Redis `webauthn:stepup:{token}` → `{memberId}|{action}|{targetId}`, **TTL 120초, 1회용**(보호 API가 `GETDEL`로 소비). **범위는 발급 때 정해진다** — API-webauthn-03이 받은 동작·대상을 챌린지에 붙여 두고, 그 챌린지로 서명된 인증(04)만 그 범위의 토큰을 받는다. 생체 인증이 "무엇에 대한 동의인가"까지 서명하고, 쓰지 않은 토큰이 새어도 다른 동작(예: 보증금 → 정산금 지급)으로 돌려쓸 수 없다. 한 동작이 보고를 여러 번 하면(결제 `APPROVE` 1 + `PURCHASE` × N, 보증금 `APPROVE` → `DEPOSIT`) **첫 보고가 토큰을 소비하며 범위 키에 묶고**(`webauthn:stepup:scope:{memberId}:{action}:{targetId}`, 소비 시점부터 120초) 이어지는 보고는 **같은 토큰**으로 통과한다. 다른 동작·다른 대상·다른 회원·만료·이미 소비된 토큰은 `WEBAUTHN_STEP_UP_REQUIRED`(403)다(§0.12).

**챌린지.** 32바이트 난수, Redis `webauthn:challenge:{memberId}:{purpose}`(`purpose` = `registration`·`authentication`) **TTL 300초**. 검증 직전에 `GETDEL`로 꺼낸다 — 검증이 실패해도 같은 챌린지는 다시 못 쓴다.

모든 바이너리 필드는 **base64url(패딩 없음)** 문자열이다.

---

### API-webauthn-01 기기 등록 옵션 발급
`POST /api/v1/webauthn/registration/options` · 권한: MEMBER · 우선: P1(스위치) · 연관 화면: `A-05 결제`

## 요구사항
- 로그인 회원의 기기 등록(`navigator.credentials.create`)에 넘길 옵션을 준다. **userVerification `required` · attestation `none` · authenticatorAttachment `platform` · residentKey `preferred`**, 알고리즘 ES256(-7)·RS256(-257).
- 이미 등록한 credential은 `excludeCredentials`로 내려 같은 기기의 중복 등록을 막는다.
- `user.id`(user handle)는 memberId를 8바이트 big-endian으로 담은 값이다 — 개인정보가 아니다.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Body
없음(빈 객체 `{}` 허용).

### 시스템 처리
1. 회원 확인 → 챌린지 생성·Redis `webauthn:challenge:{memberId}:registration` 저장(300초, 덮어씀) → 등록 credential 조회.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "challenge": "q3JmYk0tN2hXc1dGb0x6Qk5ZbVJ1dDBhOXZ0Q2R4",
    "rp": { "id": "j15b204.p.ssafy.io", "name": "BULLEOYO" },
    "user": { "id": "AAAAAAAAADk", "name": "audience@example.com", "displayName": "김관객" },
    "pubKeyCredParams": [ { "type": "public-key", "alg": -7 }, { "type": "public-key", "alg": -257 } ],
    "timeout": 60000,
    "attestation": "none",
    "authenticatorSelection": { "authenticatorAttachment": "platform", "residentKey": "preferred", "userVerification": "required" },
    "excludeCredentials": []
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |

---

### API-webauthn-02 기기 등록
`POST /api/v1/webauthn/registration` · 권한: MEMBER · 우선: P1(스위치) · 연관 화면: `A-05 결제`

## 요구사항
- `navigator.credentials.create` 결과를 받아 검증하고 **공개키(COSE)·signCount·transports**만 `webauthn_credential`에 저장한다. 생체 정보·attestation 인증서는 받지도 저장하지도 않는다.
- 검증: 챌린지 일치(1회용) · `type = webauthn.create` · origin ∈ 허용 목록 · rpIdHash · **UP·UV 플래그** · 알고리즘 ∈ {ES256, RS256}.

## Request
### Body
| 필드 | 타입 | 필수 | 설명 |
|------|------|:----:|------|
| `credentialId` | string | Y | base64url. `PublicKeyCredential.rawId` |
| `clientDataJSON` | string | Y | base64url |
| `attestationObject` | string | Y | base64url |
| `transports` | string[] | N | `getTransports()` 결과(`internal`·`hybrid` 등) |

### 시스템 처리
1. 챌린지 `GETDEL` → webauthn4j 검증 → `credentialId` 대조(본문 값 = 인증 데이터 안 값) → 중복 확인 → `webauthn_credential` 저장.

## Response
### 201 Created
```json
{ "code": "SUCCESS", "data": { "credentialId": "Y3JlZC0x", "registered": true, "createdAt": "2026-09-24T14:00:00+09:00" }, "msg": "" }
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 필수 필드 누락, base64url 형식 위반 |
| 400 | `WEBAUTHN_VERIFICATION_FAILED` | 챌린지 없음·만료·재사용, origin·rpId 불일치, UV 없음, 서명·형식 검증 실패 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 409 | `COMMON_CONFLICT` | 이미 등록된 credential |

---

### API-webauthn-03 본인 확인 옵션 발급
`POST /api/v1/webauthn/authentication/options` · 권한: MEMBER · 우선: P1(스위치) · 연관 화면: `A-05 결제`

## 요구사항
- `navigator.credentials.get`에 넘길 옵션을 준다. `allowCredentials` = 그 회원의 credential 전부, userVerification `required`.
- **등록된 기기가 없으면 에러가 아니라 `{ registered: false }`**를 준다(챌린지를 만들지 않는다). 프론트는 이 값으로 등록(API-webauthn-01·02)으로 분기한다.
- 프론트는 이 응답을 **버튼을 보여 주기 전에 미리** 받아 둔다 — `navigator.credentials.get`은 사용자 클릭 직후(사용자 활성화 안)에 불러야 Safari·iOS가 막지 않는다.

## Request
### Body
| 필드 | 타입 | 필수 | 설명 |
|------|------|:----:|------|
| `action` | string | Y | `PAYMENT` · `RULE_AGREE` · `DEPOSIT` · `SETTLEMENT_APPROVE` · `SETTLEMENT_RELEASE` — 무엇을 확인하는가 |
| `targetId` | integer | Y | 대상 id(양수). `PAYMENT`는 주문 그룹 id, 나머지는 공연 id. 여기서는 소유를 검사하지 않는다 — 토큰을 쓰는 API가 권한·소유를 먼저 검사하고 범위가 같은지만 비교한다 |

```json
{ "action": "DEPOSIT", "targetId": 12 }
```

본문이 없거나 `action`이 목록 밖이면 `COMMON_VALIDATION_FAILED`(400).

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "registered": true,
    "challenge": "Zk9xV2JzY2Q0bWhQR1l3dUNrVE5vX0x2cDFXcnk",
    "rpId": "j15b204.p.ssafy.io",
    "allowCredentials": [ { "type": "public-key", "id": "Y3JlZC0x", "transports": ["internal"] } ],
    "timeout": 60000,
    "userVerification": "required"
  },
  "msg": ""
}
```
등록 기기 없음: `{ "code": "SUCCESS", "data": { "registered": false }, "msg": "" }`

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 본문 없음, `action` 목록 밖, `targetId` 누락·0 이하 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |

---

### API-webauthn-04 본인 확인 → step-up 토큰
`POST /api/v1/webauthn/authentication` · 권한: MEMBER · 우선: P1(스위치) · 연관 화면: `A-05 결제`

## 요구사항
- `navigator.credentials.get` 결과(assertion)를 검증하고 **결제 보고용 1회용 토큰**을 준다.
- 검증: 챌린지 일치(1회용) · `type = webauthn.get` · origin · rpIdHash · **UP·UV** · 저장된 공개키로 서명 검증 · credential이 **요청 회원의 것** · **signCount 증가**(저장값·제시값 중 하나라도 0이 아니면 제시값 > 저장값. 동기화 패스키처럼 둘 다 0이면 검사하지 않는다 — WebAuthn §6.1.1).
- 통과하면 `sign_count`·`last_used_at`을 갱신한다.

## Request
### Body
| 필드 | 타입 | 필수 | 설명 |
|------|------|:----:|------|
| `credentialId` | string | Y | base64url |
| `clientDataJSON` | string | Y | base64url |
| `authenticatorData` | string | Y | base64url |
| `signature` | string | Y | base64url |
| `userHandle` | string | N | base64url |

## Response
### 200 OK
```json
{ "code": "SUCCESS", "data": { "stepUpToken": "b3V0LW9mLWJhbmQtdG9rZW4tZXhhbXBsZS0zMmJ5dGVz", "expiresAt": "2026-09-24T14:02:00+09:00" }, "msg": "" }
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 필수 필드 누락, base64url 형식 위반 |
| 400 | `WEBAUTHN_VERIFICATION_FAILED` | 챌린지 없음·만료·재사용, 등록되지 않았거나 남의 credential, origin·rpId 불일치, UV 없음, 서명 불일치, signCount 역행 |
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |

---

### 삭제된 장 — v4 §8 `charge` **[v5 삭제]**

- **API-charge-01~04 (`POST /charges` · `GET /charges/{chargeId}` · `GET /charges/me` · `POST /charges/{chargeId}/simulate-deposit`)** — 법정화폐가 존재하지 않는 세계이므로 코인을 사들이는 입구가 없다(결정 v2 §0 전제 2·§3.1·§3.2). 코인을 얻는 유일한 경로는 **시연용 지급**이며 §8 `coin` 장의 API-member-01(가입 자동)·API-coin-07(관리자)이 담당한다. `coin_charge` 테이블, 규격 신설 제안 `CHARGE_*` 6개, 화면 A-14가 모두 함께 삭제됐다(§16.1·화면 §4).

---
## 8. coin — YoYo (+ chain 공통 폴링)

YoYo는 ERC-20, **`decimals=0`, 1 YoYo = 이 세계의 1원**이며 **이 세계의 원화 그 자체**다(결정 v2 §2.1). 페그·적립 자산·청구권 개념이 없으므로 v4의 1:1 대사 서사는 사라졌다.

**[v5] 코인이 늘어나는 유일한 경로는 시연용 지급(faucet)이다**(결정 v2 §2.2·P-27). ① 가입 시 자동 1회 100,000 YoYo(API-member-01) ② 관리자 수동 지급(API-coin-07, 1회 최대 1,000,000). 줄어드는 경로는 **없다** — 소각 함수가 컨트랙트에서 삭제됐다. 그래서 `totalSupply`는 **단조 증가**한다.

지급 실행은 서비스 코드가 컨트랙트를 직접 부르지 않고 **얇은 `CoinIssuerPort`(`tokenAddress()`·`mint()`·`totalSupply()`)** 를 지난다(구현은 `MockIssuer` 1개, 분기 없음 — P-25). 서버 보관 키는 **OPERATOR(fee payer)·MINTER 2개**이며 권한이 서로 분리돼 있다(SEC-05). **지급 이력 테이블은 없다** — `chain_job WHERE tx_type='MINT'`이 이력이고(결정 v2 §2.2·미결 안건 31) API-coin-08이 그것을 조회한다.

**표시 환율(`exchange_rate`)**(P-17) — 관리자가 `USD_KRW` 등을 등록하고(API-coin-03) 클라이언트가 조회한다(API-coin-02). **환산은 표시에만 쓰이며** 정산·분배·컨트랙트 인자·티켓 가격·**지급 금액**에는 절대 쓰이지 않는다. **체인·컨트랙트 설정 조회(API-coin-04)** 는 프론트 Web3Auth 초기화용이며 P1(환경변수 하드코딩)이다.

API-chain-01은 모든 202 응답(운영자 job + 사용자 서명 job)의 공통 폴링 엔드포인트라 이 절 끝에 둔다.

### API-coin-01 YoYo 발행량·에스크로 공시 **[v5 개편 — 구 유통량 요약 + 구 API-verify-02 통합]**
`GET /api/v1/coin/supply` · 권한: GUEST(인증 불필요) · 우선: P0 · 연관 화면: `V-02 발행량·에스크로 공시` · 연관 기능: `F-coin-02 발행량·에스크로 공시 조회` · `F-verify-02 발행량·에스크로 공시(V-02)`

## 요구사항
- **[v5] v4의 두 API가 하나로 합쳐졌다.** 요약 위젯(구 API-coin-01)과 상세 공시(구 API-verify-02 `/public/reserve-proof`)를 한 응답으로 내려 V-02 화면 전체를 그린다. 공개 경로이며 `Authorization`을 요구하지 않는다.
- **[v5] 공시 대상 4개**(결정 v2 §2.2·P-11) — ① `totalSupply`(총 발행량) ② `escrowTotal`(전 공연 에스크로 합계 + 보증금) ③ `walletTotal`(**등록 지갑** 보유 합계 — 노드에서 직접 읽음. 등록 지갑 밖(미등록·`SUSPENDED`) 주소가 든 코인만큼 발행 − 에스크로보다 **작을 수 있다**, **[2026-09-15 — S15P21B204-88·-90]**) ④ `grantCount`(지급 건수). 갱신 시각(`asOf`)을 함께 담는다.
- **[v5] 불변식 4개 대사 결과**(결정 v2 §3.8)를 `invariants` 배열로 담아 브라우저가 무엇이 확인됐는지 읽을 수 있게 한다.

| # | 불변식 | 검사 방법 |
|---|---|---|
| 1 | `totalSupply` = Σ`Minted` | 인덱싱된 `Minted` 이벤트 합 vs 온체인 `totalSupply`. 소각이 없으므로 **단조 증가** |
| 2 | 공연별 `escrowOf(showId)` = Σpurchase − Σrefund − Σrelease | 공연별 뷰 조회 vs 이벤트 재계산(보증금은 별도 계정) |
| 3 | 공연별 Σ`Released` = 잠긴 규칙 × 카운터 재계산 합 | dust 포함 **1원 오차 0** (상세는 API-verify-01) |
| 4 | `totalSupply` = Σ(전 지갑 잔액) + Σ(전 공연 `escrowOf` + 보증금) | 이 API의 핵심 대사 — v4의 예치 대비 대사를 대체한다 |

- **1분 캐시**한다 [권] P-11 / REL-03. `asOf`·`nextRefreshAt`으로 "언제 기준 값인지"를 표기한다.
- 불변식 1 또는 4가 깨지면 `supplyMatched: false`로 내려주고 서버는 **mint와 release를 중단**한다(`mintHalted`·`releaseHalted`) + 운영자 알림. 조회 자체는 200으로 성공시킨다 [권]. 전용 코드 **`COIN_SUPPLY_MISMATCH`** 는 규격 v5 개명 제안이며(§16.1) 본문·알림 코드는 기존 이름 `COIN_RESERVE_MISMATCH`를 쓴다.
- **발행 주체 라벨** — `issuer.label`(`"Platform (demo grant)"`), `issuer.type`(`MOCK`), `issuer.replaceable: true`. 인가 발행사 코인·CBDC로 바꿀 수 있다는 설명은 §16.4 Q&A 절에만 둔다.
- **[v5] 고지 문구**(`disclosure`)를 `Accept-Language`에 맞춰 내려준다 — "화폐가 코인인 미래를 가정한 테스트넷 시연. 실가상자산·실화폐 없음"(en: "A testnet demo set in a future where money is a coin. No real assets or currency.")(§0.6·CON-03).
- 공연별 에스크로 내역도 함께 줘 합이 발행량 이하인지 브라우저가 확인할 수 있게 한다.

## Request
### Headers
- `Accept: application/json` · `Accept-Language: en` / `ko` · (인증 헤더 불필요)

### Path · Query
없음.

### Body
없음.

### 시스템 처리
1. 캐시(1분) 확인.
2. 상태 전이 없음(조회). 불변식 1·4 불일치 확인 시 mint·release 중단 플래그를 세우고 운영자 알림을 발송한다.
3. 외부 호출: `CoinIssuerPort.totalSupply()` + 공연별 `Splitter.escrowOf(showId)`·보증금 계정 + 인덱싱된 `Minted` 이벤트 합 + ~~**[v6]** Redis `wallet:balance` 합산(`HVALS`, §0.12)~~ **[2026-09-15 — S15P21B204-88·-90]** **등록 지갑별 `YoYo.balanceOf` 순차 조회**(DB `wallet` LINKED 를 PK 순 100개 청크로, 지갑 1개 = `eth_call` 1회 · 상한 약 200~300개/30초 주기). **[v5]** 대사에 필요한 값이 전부 온체인·인덱스에 있다.
4. 캐시 갱신 후 반환. **[2026-09-15 — S15P21B204-88]** `totalSupply`·에스크로 중 하나라도 노드에서 읽지 못하면 `stale: true`. **등록 지갑 잔액을 못 읽은 것은 `stale`로 켜지 않는다** — 켜면 화면이 불변식 ①·②·③ 행까지 판정 불가로 덮어 실제 불일치가 가려진다. 그때 `walletTotal`은 `0`, 불변식 ④는 미평가(`expected`·`actual` null)이고 화면은 지갑 합계·등식을 `—`로 그린다. 체인을 아예 못 읽으면 `totalSupply`는 확정 `MINT` 합계(DB)로 대체된다.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "totalSupply": 5290000,
    "escrowTotal": 1275000,
    "walletTotal": 4015000,
    "grantCount": 53,
    "supplyMatched": true,
    "currency": "KRW",
    "display": { "currency": "USD", "approx": 3918.52, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "issuer": { "type": "MOCK", "label": "Platform (demo grant)", "replaceable": true },
    "mintHalted": false,
    "releaseHalted": false,
    "network": "kaia-kairos",
    "chainId": 1001,
    "tokenAddress": "0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736",
    "tokenSymbol": "YoYo",
    "tokenDecimals": 0,
    "explorerUrl": "https://kairos.kaiascan.io/address/0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736",
    "invariants": [
      { "no": 1, "name": "SUPPLY_EQUALS_MINTED", "expected": 5290000, "actual": 5290000, "matched": true, "note": "totalSupply = Σ Minted — mint 만 있어 발행량은 줄지 않는다" },
      { "no": 2, "name": "ESCROW_PER_SHOW", "checkedShows": 2, "mismatchedShows": 0, "matched": true, "note": "공연별 escrowOf = Σpurchase − Σrefund − Σrelease (보증금 별도)" },
      { "no": 3, "name": "RELEASED_EQUALS_RULE_RECALC", "checkedShows": 1, "maxDiff": 0, "matched": true, "note": "Σ Released = 잠긴 규칙 × 카운터 재계산(dust 포함, 1원 오차 없음); 온체인 choiceCountsOf 카운터로 평가 1건" },
      { "no": 4, "name": "SUPPLY_EQUALS_WALLETS_PLUS_ESCROW", "expected": 5290000, "actual": 5290000, "matched": true, "note": "totalSupply = Σ등록 지갑 잔액 + Σ에스크로·보증금 — 정확히 일치 (등록 지갑 3개 노드 조회)" }
    ],
    "perPerformanceEscrow": [
      { "performanceId": 12, "escrowAmount": 1225000, "depositAmount": 50000 },
      { "performanceId": 14, "escrowAmount": 0, "depositAmount": 0 }
    ],
    "asOf": "2026-09-22T18:12:00+09:00",
    "nextRefreshAt": "2026-09-22T18:13:00+09:00",
    "stale": false,
    "disclosure": "A testnet demo set in a future where money is a coin. No real assets or currency. Coins are granted by the platform for the demo; balance figures are read through the platform server.",
    "grantNotice": "Every coin in circulation came from a demo grant: 100,000 on sign-up, plus manual admin grants."
  },
  "msg": ""
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `totalSupply` | integer | `YoYo.totalSupply()`. 소각이 없어 단조 증가 |
| `escrowTotal` | integer | 전 공연 `escrowOf` 합 + 보증금 합 |
| `walletTotal` | integer | **등록 지갑** 보유 합계 — 노드 `balanceOf` 합(**[2026-09-15 — S15P21B204-88·-90]**). 등록 지갑 밖(미등록·`SUSPENDED`) 주소 보유분만큼 `totalSupply − escrowTotal`보다 **작을 수 있고 그것은 정상**이다(§7.6-4 판정 규칙). 불변식 4가 미평가(지갑 하나라도 못 읽음)면 이 값은 **0으로 오지만 사실이 아니다** — 화면은 `invariants[3]`의 `expected` null 을 보고 타일을 `—` 로 그린다 |
| `grantCount` | integer | **[v5]** 확정된 `MINT` job 건수(= 지급 횟수) |
| `supplyMatched` | boolean | 불변식 1·4 모두 통과 여부. `false`면 `mintHalted`·`releaseHalted`가 `true`가 된다 |
| `invariants[]` | array | **[v5]** 불변식 4개 대사 결과. `matched: false` 항목이 V-02에 붉게 표시된다. **[2026-09-14 — S15P21B204-90]** 못 읽은 값이 있으면 `expected`·`actual`(①④) / `checkedShows`(②) / `maxDiff`(③)가 **`null`이고 `matched`는 `true`로 남는다** — "판정 불가"이며 불일치가 아니다(halt 안 함). 화면은 값 유무로 세 번째 상태("확인 중")를 그린다. `expected`의 뜻은 no별로 고정(①: Σ Minted · ④: Σ지갑+Σ에스크로·보증금), `actual`은 둘 다 `totalSupply` — openapi `CoinSupplyInvariant` description 참조 |
| `disclosure`·`grantNotice` | string | `Accept-Language`에 맞춘 고지·설명 문구. 발표 장표에 그대로 인용한다 |

### 4xx/5xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 429 | `COMMON_TOO_MANY_REQUESTS` | 호출 한도 초과 |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | 체인 조회 실패하고 캐시도 없음 |

---
### API-coin-02 표시 환율 조회 **[v4 신설]**
`GET /api/v1/coin/rates` · 권한: GUEST(인증 불필요) · 우선: P0 · 연관 화면: `공통` · 연관 기능: `F-coin-06 표시 환율 조회`

## 요구사항
- 현재 유효한 표시 환율을 pair별로 준다. **표시 전용**이며 결제·정산·컨트랙트 계산에 쓰이지 않는다(P-17). 응답에 그 사실을 `usageNotice`로 명시한다.
- `1 base = rate KRW` 방향이다(`USD_KRW`의 `rate: 1350.0` = 1 USD가 1,350원). 클라이언트는 원 값 ÷ rate로 환산한다.
- `pair` 쿼리로 하나만 조회할 수 있고, 미지정 시 등록된 전부를 준다. 유효 레코드는 `effective_from ≤ now`인 것 중 가장 최근 1건이다.
- **1분 캐시**한다 [권]. 시연에서는 하루 1회 등록·고정이라 사실상 상수다(미결 안건 2).
- 등록된 환율이 없으면 빈 배열을 준다(404가 아니다). 클라이언트는 그때 원 값만 표시한다 — 환율 미등록은 오류가 아니다.

## Request
### Headers
- `Accept: application/json` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `pair` | query | string | N | `USD_KRW`·`JPY_KRW`·`EUR_KRW` 등. 미지정 시 전체 |

### Body
없음.

### 시스템 처리
1. 캐시(1분) 확인 → `pair` 형식 검증. 2. 상태 전이 없음(조회). 3. 외부 호출 없음(관리자 등록 값이다 — 외부 시세 API는 P1). 4. `exchange_rate`에서 pair별 유효 1건 조회.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "rates": [
      { "pair": "USD_KRW", "base": "USD", "quote": "KRW", "rate": 1350.0, "effectiveFrom": "2026-09-02T09:00:00+09:00", "source": "MANUAL" },
      { "pair": "JPY_KRW", "base": "JPY", "quote": "KRW", "rate": 9.12, "effectiveFrom": "2026-09-02T09:00:00+09:00", "source": "MANUAL" },
      { "pair": "EUR_KRW", "base": "EUR", "quote": "KRW", "rate": 1462.5, "effectiveFrom": "2026-09-02T09:00:00+09:00", "source": "MANUAL" }
    ],
    "usageNotice": "Rates are for display only. All payments, refunds and settlements are calculated in Korean won.",
    "refreshedAt": "2026-09-02T14:00:00+09:00"
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `pair` 형식 위반(`{3자}_{3자}` 아님) |
| 429 | `COMMON_TOO_MANY_REQUESTS` | 호출 한도 초과 |

---

### API-coin-03 표시 환율 등록 **[v4 신설]**
`PUT /api/v1/admin/coin/rates` · 권한: ADMIN · 우선: P0 · 연관 화면: `M-03 표시 환율·코인 지급` · 연관 기능: `F-coin-07 표시 환율 등록`

## 요구사항
- 관리자가 pair별 표시 환율을 등록한다. **하루 1회, 시연 고정**을 전제로 한 최소 기능이다(P-17·미결 안건 2). 외부 시세 API 자동 연동은 P1이다.
- 등록은 **append-only**다 — 기존 레코드를 수정하지 않고 새 `exchange_rate` 행을 만든다(`effective_from`, `published_by`, `source`). 이력이 남아야 과거 영수증의 `display.rate`를 재현할 수 있다.
- `effective_from`은 미래 시각도 허용한다(예약 등록). 과거 시각은 이미 발행된 표시값을 소급 변경하므로 **거부**한다 [권].
- 여러 pair를 한 번에 등록할 수 있다(배열). 부분 실패를 허용하지 않고 전량 롤백한다.
- **이 값이 자금 계산에 쓰이지 않음**을 응답 `usageNotice`로 다시 명시한다. 등록해도 기존 주문·정산 금액은 1원도 바뀌지 않는다.
- 감사 로그 `action_type=RATE_CHANGE`로 남긴다(SEC-11).

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}`

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `rates` | array | Y | 1~10개 | 등록할 환율 목록 |
| `rates[].pair` | string | Y | `{3자}_KRW` | 통화쌍. quote는 `KRW` 고정 |
| `rates[].rate` | number | Y | 0 초과, 소수 6자리까지 | `1 base = rate KRW` |
| `rates[].effectiveFrom` | string(ISO 8601) | N | 현재 이후. 미지정 시 `now` | 적용 시각 |
| `rates[].source` | string | N | 기본 `MANUAL`, 최대 100자 | 출처 표기 |

```json
{
  "rates": [
    { "pair": "USD_KRW", "rate": 1350.0, "source": "MANUAL" },
    { "pair": "JPY_KRW", "rate": 9.12, "source": "MANUAL" }
  ]
}
```

### 시스템 처리
1. ADMIN 권한 확인 → `pair` 형식·quote=`KRW`·`rate` 범위·`effectiveFrom` 미래 여부 검증 → 배열 내 pair 중복 확인.
2. 상태 전이 없음(신규 레코드 append). 기존 행은 수정하지 않는다.
3. 외부 호출 없음.
4. `exchange_rate` insert(`published_by = 관리자 memberId`) + **표시 환율 캐시 무효화**(API-coin-02·목록 캐시) + 감사 로그(`RATE_CHANGE`).

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "registered": [
      { "rateId": 56, "pair": "USD_KRW", "rate": 1350.0, "effectiveFrom": "2026-09-02T09:00:00+09:00", "source": "MANUAL" },
      { "rateId": 57, "pair": "JPY_KRW", "rate": 9.12, "effectiveFrom": "2026-09-02T09:00:00+09:00", "source": "MANUAL" }
    ],
    "publishedBy": 1,
    "cacheInvalidated": true,
    "usageNotice": "표시 환산에만 사용됩니다. 정산·분배·티켓 가격·지급 금액은 YoYo(=₩) 정수로 계산됩니다."
  },
  "msg": "표시 환율이 등록되었습니다."
}
```

### 4xx
```json
{ "code": "COMMON_VALIDATION_FAILED", "data": null, "msg": "적용 시각은 현재 이후여야 합니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `pair` 형식·quote 위반, `rate` ≤ 0, `effectiveFrom` 과거, 배열 내 pair 중복, 배열 크기 위반 |
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 403 | `COMMON_FORBIDDEN` | ADMIN이 아님 |

---

### API-coin-04 체인·컨트랙트 설정 조회 **[v4 신설 · P1 — 9/2 최소화: 프론트 환경변수]**
`GET /api/v1/coin/config` · 권한: GUEST(인증 불필요) · 우선: P1 · 연관 화면: `공통(프론트 초기화)` · 연관 기능: `F-coin-09 체인·컨트랙트 설정 조회`

## 요구사항
- 프론트가 **Web3Auth SDK와 지갑 연결을 초기화**하는 데 필요한 값을 준다 — `chainNamespace`·`chainId`(hex·decimal)·`rpcTarget`·`displayName`·`ticker`·익스플로러·컨트랙트 주소. 하드코딩 대신 이 API로 받는다(미결 안건 17).
- 비인증 공개다. 여기 담기는 값은 모두 **공개 정보**(테스트넷 RPC·배포된 컨트랙트 주소)이며, **[v5] 서버 보관 키 2개(OPERATOR·MINTER)의 주소는 담지 않는다**(§0.7 비노출 규칙). v4의 세 번째 주소(`treasuryAddress`)는 해당 흐름이 삭제돼 응답에서 빠졌고, 노출되는 컨트랙트 주소는 `tokenAddress`·`splitterAddress` 2개다.
- Besu 백업으로 전환하면 같은 응답 구조에서 `network`·`chainId`·`rpcTarget`·익스플로러만 바뀐다. 프론트는 값을 그대로 쓰고 분기하지 않는다(AVAIL — 리허설 전환 절차).
- **5분 캐시**한다 [권]. 컨트랙트 재배포 시 캐시를 즉시 무효화한다.
- `contracts.abiVersion`으로 프론트가 번들한 ABI와 서버가 가리키는 컨트랙트의 세대를 맞출 수 있게 한다 [권]. 불일치면 프론트가 "새로고침" 안내를 띄운다.

## Request
### Headers
- `Accept: application/json`

### Path · Query
없음.

### Body
없음.

### 시스템 처리
1. 캐시(5분) 확인. 2. 상태 전이 없음(조회). 3. 외부 호출 없음(설정값 반환). 4. 설정(`coin.issuer.token-address` 등)과 배포 메타를 조합해 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "network": "kaia-kairos",
    "chainNamespace": "eip155",
    "chainId": 1001,
    "chainIdHex": "0x3e9",
    "displayName": "Kaia Kairos",
    "ticker": "KAIA",
    "tickerName": "Kaia",
    "rpcTarget": "https://public-en-kairos.node.kaia.io",
    "explorerBaseUrl": "https://kairos.kaiascan.io",
    "contracts": {
      "tokenAddress": "0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736",
      "tokenSymbol": "YoYo",
      "tokenDecimals": 0,
      "splitterAddress": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
      "abiVersion": "v5.0.0"
    },
    "web3auth": { "clientIdPublic": "BJ8xk...public", "loginProviders": ["google", "facebook", "kakao"] },
    "feePolicy": { "feeDelegation": true, "feePayerAddress": "0x9f8e7d6c5b4a39281706f5e4d3c2b1a098765432", "userNativeBalanceRequired": false },
    "refreshedAt": "2026-09-02T14:00:00+09:00"
  },
  "msg": ""
}
```

`web3auth.clientIdPublic`은 SDK 초기화에 쓰는 **공개** 클라이언트 ID다. 비밀키·verifier 시크릿은 담지 않는다. **[v5]** `feePolicy.feeDelegation: true`·`userNativeBalanceRequired: false`는 프론트가 `FeeDelegatedSmartContractExecution` 타입으로만 서명하고 사용자 지갑의 네이티브 잔액을 확인하지 않아도 된다는 뜻이다(§0.4).

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 429 | `COMMON_TOO_MANY_REQUESTS` | 호출 한도 초과 |
| 500 | `COMMON_INTERNAL_ERROR` | 컨트랙트 주소 설정 누락(배포 전 상태) — 관리자 알림 대상 |

---

> **API-coin-05 `GET /api/v1/admin/coin/jobs`(온체인 작업 목록)와 API-coin-06 `POST /api/v1/admin/coin/jobs/{jobId}/retry`(작업 재시도)는 [v4 P1]이다.** v3에서 API-coin-02·03이던 번호가 환율·설정 API 신설로 05·06으로 **이동**했고(결정 v2 §9 "번호 이동(P1)"), 우선순위는 P1 그대로다. MVP의 처리 방식은 다음과 같다.
>
> - **자동 재시도** — OPERATOR job은 큐에서 최대 3회 재시도하고, 이후 지수 백오프로 시스템이 연장 재시도한다(REL-09).
> - **USER job은 재시도 대상이 아니다** — 서버가 사용자 키로 tx를 재전송할 수 없다(§0.3). receipt 재조회만 반복하고 최종 실패는 사용자가 다시 서명한다.
> - **결정적 실패** — **[v5]** 발행량 대사 불일치로 인한 mint 차단처럼 재시도해도 결과가 같은 실패는 `FAILED`로 고정하고 운영자 알림을 보낸다. MVP에서는 운영자가 DB·체인을 직접 확인한다.
> - **폴링** — 개별 작업 상태는 API-chain-01로 그대로 확인한다. 이 경로는 P0다.

---

### API-coin-07 시연용 코인 지급 **[v5 신설]**
`PUT /api/v1/admin/coin/grants` · 권한: ADMIN · 우선: P0 · 연관 화면: `M-03 표시 환율·코인 지급` · 연관 기능: `F-coin-10 시연용 코인 지급(관리자)` · `F-coin-01 mint 실행(시연용 지급)` · `F-coin-08 발행 어댑터 바인딩`

## 요구사항
- **[v5]** 관리자가 특정 회원 지갑에 YoYo를 지급한다. 이것이 v4의 유입 도메인 4개 API를 **대체하는 유일한 유입 경로**이며, 관객 화면에는 어떤 진입점도 없다(결정 v2 §3.1·P-27).
- 대상은 **`memberId` 또는 `address` 중 하나**다(둘 다 오면 `COMMON_VALIDATION_FAILED`). `address`는 등록된 `wallet.address`여야 한다 — 미등록 주소로는 지급하지 않는다(대사 불변식 4가 깨지기 때문).
- **지급 한도(P-19)**: 1회 최대 **1,000,000 YoYo**, 최소 1. 회원당 누적 상한은 두지 않는다(시연). 한도 초과는 `COMMON_VALIDATION_FAILED`로 막고, 전용 코드 **`COIN_GRANT_LIMIT_EXCEEDED`** 는 규격 v5 신설 제안이다(§16.1).
- **`Idempotency-Key` 필수**다(§0.8 6개 중 하나). 헤더의 UUID가 `chain_job.idempotency_key`가 되고 그 해시가 온체인 `YoYo.mint(to, amount, bytes32 grantRef)`의 `grantRef`가 된다. 같은 키 재호출은 최초 `jobId`를 재생하며 **두 번 발행하지 않는다**.
- 메서드가 `PUT`인 것은 결정 문서 v2 §9 인벤토리 표기를 글자 단위로 따른 것이다. 멱등키가 필수라 `PUT`의 멱등성 의미와도 어긋나지 않는다(§16.3 #3).
- **발행량 대사가 깨진 상태(`mintHalted`)에서는 지급을 거부한다** — `COIN_RESERVE_MISMATCH`(409). 관리자는 V-02에서 원인을 확인한 뒤 다시 시도한다.
- `202 Accepted` + `jobId`(`tx_type=MINT`, `signer_type=OPERATOR`, MINTER 키 서명)를 준다. 폴링은 API-chain-01이다.
- 관리자당 **30회/분** 호출 제한이다(§0.9). 감사 로그 `action_type=GRANT`에 요청자·대상·금액·메모를 남긴다(SEC-11).

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language` · `Idempotency-Key: {UUIDv4}` **필수**

### Path · Query
없음.

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `memberId` | integer | 조건부 | `address`와 **택일** | 지급 대상 회원 PK |
| `address` | string | 조건부 | `0x` + 40 hex(42자), 등록된 지갑 | 지급 대상 지갑 주소 |
| `amount` | integer | Y | 1 ~ 1,000,000 (YoYo 정수) | 지급 금액 |
| `memo` | string | N | 최대 100자 | 지급 사유. 지갑 이력(API-wallet-02)의 `title`로 노출된다 |

```json
{ "memberId": 1024, "amount": 200000, "memo": "Rehearsal top-up for demo audience" }
```

### 시스템 처리
1. ADMIN 권한 확인 → 멱등키 확인 → `memberId`·`address` 택일 검증 → 대상 `wallet` 존재·`LINKED` 확인 → 금액 범위(1~1,000,000) 확인 → `mintHalted` 확인.
2. 상태 전이: `chain_job` insert(`tx_type=MINT`, `signer_type=OPERATOR`, `issuer_type=MOCK`, `status=PENDING`, `wallet_id`, `amount`, **`requester_member_id`=관리자 회원 PK**, `idempotency_key`=헤더 UUID). 확정 시 **[v6] 수신 지갑의 `wallet:balance` 갱신**(§0.12). **지급 이력 테이블은 만들지 않는다**(미결 안건 31).
3. 외부 호출(202): MINTER 키 nonce 큐에 `CoinIssuerPort.mint(to, amount, grantRef)` 등록 → 전송 → `SUBMITTED` → receipt·`Minted(to, amount, grantRef)` 이벤트 검증 → `CONFIRMED`.
4. `chain_job` 저장 + 감사 로그(`action_type=GRANT`). 확정 시 V-02의 `totalSupply`·`grantCount`가 다음 캐시 갱신(≤ 1분)에 반영된다.

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": {
    "jobId": "chain_01J9H2K3L4",
    "status": "PENDING",
    "signerType": "OPERATOR",
    "pollAfterMs": 1500,
    "memberId": 1024,
    "address": "0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a",
    "amount": 200000,
    "currency": "KRW",
    "display": { "currency": "USD", "approx": 148.15, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "memo": "Rehearsal top-up for demo audience",
    "grantRef": "0x8f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8",
    "balanceBefore": 35000,
    "expectedBalanceAfter": 235000,
    "requestedAt": "2026-09-22T18:20:00+09:00"
  },
  "msg": "지급 트랜잭션을 전송했습니다."
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `grantRef` | string | 온체인 `mint`의 `bytes32` 참조값(= 멱등키 해시). V-02·익스플로러에서 이 지급 건을 특정하는 키다 |
| `balanceBefore`·`expectedBalanceAfter` | integer | 관리자 화면(M-03)이 결과를 즉시 보여주기 위한 값. 확정 전이므로 `expected`다 |

### 4xx/5xx
```json
{ "code": "COMMON_VALIDATION_FAILED", "data": null, "msg": "1회 지급 한도(₩1,000,000)를 초과했습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `memberId`·`address` 둘 다 또는 둘 다 없음, 주소 형식 위반, `amount` 범위 위반(1회 한도 초과 — 전용 코드 `COIN_GRANT_LIMIT_EXCEEDED`는 §16.1), `Idempotency-Key` 없음 |
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 403 | `COMMON_FORBIDDEN` | ADMIN 권한 아님 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 `memberId` |
| 404 | `WALLET_NOT_FOUND` | 대상 회원의 지갑 미연결, 또는 등록되지 않은 `address` |
| 409 | `COMMON_CONFLICT` | 같은 멱등키에 다른 본문, 대상 지갑이 `SUSPENDED` |
| 409 | `COIN_RESERVE_MISMATCH` | **[v5]** 발행량 대사 불일치로 mint 중단 상태(전용 코드 `COIN_SUPPLY_MISMATCH`는 §16.1) |
| 429 | `COMMON_TOO_MANY_REQUESTS` | 관리자당 30회/분 초과 |
| 500 | `COIN_MINT_FAILED` | mint tx 최종 실패 — 운영자 알림, 재시도는 새 멱등키로 |

---

### API-coin-08 시연용 코인 지급 이력 **[v5 신설]**
`GET /api/v1/admin/coin/grants` · 권한: ADMIN · 우선: P0 · 연관 화면: `M-03 표시 환율·코인 지급` · 연관 기능: `F-coin-10 시연용 코인 지급(관리자)`

## 요구사항
- **[v5]** 지급 이력을 최신순으로 준다. **원본은 `chain_job WHERE tx_type='MINT'`** 이며 별도 이력 테이블이 없다(결정 v2 §2.2·§8·미결 안건 31).
- 가입 자동 지급과 관리자 수동 지급이 한 목록에 섞여 나오고, `source`로 구분한다 — `requester_member_id IS NULL`이면 `SIGNUP`, 값이 있으면 `ADMIN`이다.
- 필터: `source`·`status`·`memberId`·`address`·기간(`from`·`to`). 기본 정렬은 `requestedAt,desc`다.
- 합계 요약(`summary`)을 함께 준다 — 건수·금액 합·`SIGNUP`/`ADMIN` 분해. V-02의 `totalSupply`와 이 합계가 일치해야 한다(불변식 1).
- 대상 회원의 지갑 주소는 관리자 화면이므로 노출한다(§0.10 SEC-09의 "다른 회원 주소 비노출"은 일반 회원 목록에 대한 규칙이다).
- 금액은 §0.5 축약형 — 응답 루트에 `rate` 하나, 항목에는 `amount`만.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `source` | query | string | N | `SIGNUP` / `ADMIN`. 미지정 시 전체 |
| `status` | query | string | N | `PENDING`/`SUBMITTED`/`CONFIRMED`/`FAILED` |
| `memberId` | query | integer | N | 특정 회원의 지급만 |
| `address` | query | string | N | `0x` + 40 hex. `memberId`와 함께 오면 AND |
| `from`·`to` | query | string | N | ISO 8601 날짜. `requestedAt` 기준 |
| `page` | query | integer | N | 0-base, 기본 0 |
| `size` | query | integer | N | 기본 20, 최대 100 |
| `sort` | query | string | N | `requestedAt,desc`(기본) / `requestedAt,asc` / `amount,desc` |

### Body
없음.

### 시스템 처리
1. ADMIN 권한 확인 → 필터 화이트리스트 검증.
2. 상태 전이 없음(조회).
3. 외부 호출 없음 — 인덱싱된 `chain_job`만 읽는다.
4. `chain_job`(`tx_type='MINT'`) + `wallet` + `member`(요청자·대상) 조인. `chain_job(tx_type, wallet_id)` 인덱스를 쓴다(ERD v4 §4).

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "rate": { "currency": "USD", "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "summary": {
      "grantCount": 53,
      "grantedTotal": 5290000,
      "signupCount": 48,
      "signupTotal": 4800000,
      "adminCount": 5,
      "adminTotal": 490000,
      "currency": "KRW"
    },
    "items": [
      {
        "jobId": "chain_01J9H2K3L4",
        "source": "ADMIN",
        "status": "CONFIRMED",
        "memberId": 1024,
        "memberName": "Alex Kim",
        "address": "0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a",
        "amount": 200000,
        "memo": "Rehearsal top-up for demo audience",
        "requesterId": 1,
        "requesterName": "admin",
        "grantRef": "0x8f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8",
        "txHash": "0x7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d",
        "explorerUrl": "https://kairos.kaiascan.io/tx/0x7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d",
        "requestedAt": "2026-09-22T18:20:00+09:00",
        "confirmedAt": "2026-09-22T18:20:04+09:00"
      },
      {
        "jobId": "chain_01J9G1A2B3",
        "source": "SIGNUP",
        "status": "CONFIRMED",
        "memberId": 1031,
        "memberName": "Yuki Sato",
        "address": "0x8b7c6d5e4f30211f2e3d4c5b6a7988071625344a",
        "amount": 100000,
        "memo": "Welcome balance",
        "requesterId": null,
        "requesterName": null,
        "grantRef": "0x1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a",
        "txHash": "0x90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f",
        "explorerUrl": "https://kairos.kaiascan.io/tx/0x90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f",
        "requestedAt": "2026-09-22T17:05:00+09:00",
        "confirmedAt": "2026-09-22T17:05:03+09:00"
      }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 53, "hasNext": true }
  },
  "msg": ""
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `source` | string | **[v5]** `SIGNUP`(`requester_member_id IS NULL`, 지갑 등록 시 자동) / `ADMIN`(관리자 수동) |
| `summary.grantedTotal` | integer | 확정된 지급 금액 합. **V-02의 `totalSupply`와 같아야 한다**(불변식 1) |
| `memo` | string | `SIGNUP`은 서버가 `"Welcome balance"`로 채운다 |

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `source`·`status`·`sort`, 주소 형식 위반, `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 403 | `COMMON_FORBIDDEN` | ADMIN 권한 아님 |

---

### API-chain-01 비동기 tx 작업 상태 **[v5 변경 — feeDelegated·MINT 지급 표기]**
`GET /api/v1/chain/jobs/{jobId}` · 권한: 요청자(작업을 만든 회원) 또는 ADMIN · 우선: P0 · 연관 화면: `공통(202 폴링)` · 연관 기능: `F-coin-03 온체인 작업 상태 폴링`

## 요구사항
- **모든 202 응답의 단일 폴링 엔드포인트**다. **[v5]** 운영자 tx(**`MINT`(시연용 지급)**·`CREATE_SHOW`·`START_SALE`·`REFUND`·`LOCK`·`AGGREGATE`·`RELEASE`·`HALT`·`DEPOSIT_RETURN`)와 사용자 서명 tx(`APPROVE`·`PURCHASE`·`DEPOSIT`·`AGREE`)가 전부 이 경로로 상태를 확인한다. `tx_type` 14종은 §0.3에 있다. **[2026-09-09 — S15P21B204-67]**
- 상태값은 `PENDING`/`SUBMITTED`/`CONFIRMED`/`FAILED`다. 확정 시 `txHash`(66자)와 `explorerUrl`, 실패 시 `failureReason`(규격 코드 문자열)과 `retryable`을 채운다.
- **`signerType`·`issuerType`·[v5] `feeDelegated`를 함께 준다.** `signerType=USER`인 job은 `feeDelegated`가 항상 `true`이고 `retryable`은 항상 `false`다 — 서버가 발신자 서명을 다시 만들 수 없고 사용자가 다시 서명해야 한다(§0.3). `issuerType`은 감사용이며 MVP에서는 항상 `MOCK`이다.
- **`verification` 블록**을 담아 사용자 서명 tx의 receipt 검증 결과를 알려준다 — 어느 항목이 어긋났는지(`to`·`from`·`event`·`args`) 프론트가 사용자 문구를 고를 수 있게 한다.
- 작업을 만든 회원 또는 ADMIN만 조회한다. 남의 작업은 존재를 숨겨 `COMMON_NOT_FOUND`로 응답한다 [권].
- 부분 성공이 있는 작업(공연 취소 일괄 환불, release)은 `results` 배열로 건별 상태를 함께 준다(규격 §1 부분 성공).
- 외부 호출 없이 인덱싱된 `chain_job` 레코드를 읽는다(PERF-01).

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `jobId` | path | string | Y | 202 응답에서 받은 작업 식별자(`chain_*`) |

### Body
없음.

### 시스템 처리
1. 작업 존재·요청자 일치(또는 ADMIN) 확인.
2. 상태 전이 없음(조회). 상태 갱신은 tx 리스너·큐가 담당한다.
3. 외부 호출 없음.
4. 상태·`txHash`·`explorerUrl`·`verification`·부분 결과 반환.

## Response
### 200 OK — 사용자 서명 tx 확정
```json
{
  "code": "SUCCESS",
  "data": {
    "jobId": "chain_01J9GC5D6F",
    "txType": "PURCHASE",
    "signerType": "USER",
    "issuerType": "MOCK",
    "feeDelegated": true,
    "feePayerAddress": "0x9f8e7d6c5b4a39281706f5e4d3c2b1a098765432",
    "status": "CONFIRMED",
    "walletAddress": "0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a",
    "performanceId": 12,
    "orderId": 5501,
    "amount": 50000,
    "currency": "KRW",
    "txHash": "0x5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f607182934a",
    "explorerUrl": "https://kairos.kaiascan.io/tx/0x5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f607182934a",
    "blockNumber": 184920311,
    "verification": { "verified": true, "expectedEvent": "Purchased", "checks": { "receiptStatus": true, "to": true, "from": true, "event": true, "args": true }, "mismatchFields": [] },
    "retryCount": 0,
    "failureReason": null,
    "retryable": false,
    "results": null,
    "pollAfterMs": null,
    "submittedAt": "2026-09-10T20:03:04+09:00",
    "confirmedAt": "2026-09-10T20:03:11+09:00"
  },
  "msg": ""
}
```

### 200 OK — 운영자 tx 최종 실패
```json
{
  "code": "SUCCESS",
  "data": {
    "jobId": "chain_01J9GD7E8F",
    "txType": "MINT",
    "grantSource": "ADMIN",
    "signerType": "OPERATOR",
    "issuerType": "MOCK",
    "feeDelegated": false,
    "status": "FAILED",
    "txHash": null,
    "verification": null,
    "retryCount": 3,
    "failureReason": "CHAIN_NONCE_CONFLICT",
    "retryable": true,
    "pollAfterMs": null
  },
  "msg": "처리에 실패했습니다. 확인 후 순차적으로 재처리됩니다."
}
```

### 200 OK — 사용자 서명 tx 검증 실패
```json
{
  "code": "SUCCESS",
  "data": {
    "jobId": "chain_01J9GA1B2C",
    "txType": "DEPOSIT",
    "signerType": "USER",
    "status": "FAILED",
    "txHash": "0x6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5",
    "verification": { "verified": false, "expectedEvent": "DepositPaid", "checks": { "receiptStatus": true, "to": true, "from": true, "event": true, "args": false }, "mismatchFields": ["amount"] },
    "retryCount": 0,
    "failureReason": "PAYMENT_AMOUNT_MISMATCH",
    "retryable": false,
    "pollAfterMs": null
  },
  "msg": "트랜잭션 내용이 요청과 일치하지 않습니다. 처음부터 다시 시도해 주세요."
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `feeDelegated` | boolean | **[v5]** 수수료 대납 여부. `signerType=USER`면 항상 `true` |
| `feePayerAddress` | string\|null | **[v5]** 대납한 운영지갑 주소(`feeDelegated=true`일 때만). 사용자가 익스플로러에서 "수수료를 누가 냈는지"를 확인할 수 있다 |
| `grantSource` | string\|null | **[v5]** `txType=MINT`일 때만 — `SIGNUP`(가입 자동) / `ADMIN`(관리자 지급). API-coin-08의 `source`와 같은 값 |

### 4xx/5xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 `jobId` 또는 타인의 작업 |
| 504 | `CHAIN_TX_TIMEOUT` | 제출은 됐으나 확정이 임계(기본 120초)를 넘김 — 계속 폴링 가능 |

---

## 9. refund — 취소·환불

취소 수수료 [권] P-8: **D-7 이전 전액 / D-3 이전 50% / D-3 00:00 이후 취소 불가**(취소 마감). 구간은 v3와 같다.

**환불은 온체인 1건이다.** **운영자의 `RevenueSplitter.refund(showId, orderRef, to, teamIndex, amount)` 한 tx**가 전부다(결정 v2 §3.4). 컨트랙트가 에스크로 → **관객 지갑**으로 YoYo를 되돌리고 선택 카운터를 −1 한다. **[v5] 환불 코인은 관객 지갑으로 돌아온다**(P-20 — "Refunded to your wallet"). 그 밖의 되돌리기 수단은 존재하지 않는다. 수수료분은 에스크로에 남아 정산 재원에 포함된다. Refund 상태(결정 v2 §7): `PENDING → PROCESSING → COMPLETED` / `FAILED`(`PROCESSING` = `refund` tx 제출, `COMPLETED` = 확정).

**[v5]** 소각 함수 자체가 컨트랙트에서 삭제됐으므로(결정 v2 §2.4) 환불 흐름에 순서 제약이 없다. 되돌릴 대상은 코인 한 종류뿐이다.

### API-refund-01 환불액 미리보기 **[v4 변경 — 잔액 반환]**
`GET /api/v1/tickets/{ticketId}/refund-quote` · 권한: 소유자 · 우선: P0 · 연관 화면: `A-11 취소·환불` · 연관 기능: `F-refund-01 환불액 미리보기`

## 요구사항
- 지금 취소하면 얼마를 돌려받는지 수수료 구간과 함께 보여준다. 계산 기준(구간 경계 시각)을 함께 담아 화면이 "왜 이 금액인지"를 설명할 수 있게 한다 [권] P-8. 조회만 하고 상태를 바꾸지 않는다.
- **[v5] 환불 대상은 관객 지갑이다.** `refundTarget: "WALLET_BALANCE"`와 수신 지갑 주소·환불 후 예상 잔액(`walletBalanceAfter`)을 담고, 문구는 "Refunded to your wallet"이다. 다른 수신 수단을 지정하는 필드는 없다.
- 취소 마감 이후에는 `REFUND_DEADLINE_PASSED`, 정산 잠금(`LOCKED` 이상) 이후에는 `REFUND_AFTER_SETTLEMENT_LOCK`이다 — 온체인 회수가 불가하므로 고객센터 문의로 안내한다.
- 금액에 `display` 환산을 함께 담는다(§0.5).

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `ticketId` | path | integer(BIGINT) | Y | 티켓 PK |

### Body
없음.

### 시스템 처리
1. 티켓 존재·소유자·상태(`ISSUED`) 확인 → 공연 일시로 수수료 구간 판정 → 정산 상태 확인.
2. 상태 전이 없음(조회).
3. 외부 호출: 현재 지갑 잔액 조회(10초 캐시)로 `walletBalanceAfter` 산출. 실패 시 해당 필드만 `null`.
4. 결제 금액·수수료율·환불 예정액 계산 결과 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "ticketId": 90211,
    "paidAmount": 25000,
    "feeRatePercent": 50,
    "feeAmount": 12500,
    "refundAmount": 12500,
    "currency": "KRW",
    "display": { "currency": "USD", "approx": 9.26, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "feeStage": "D-3_BEFORE",
    "fullRefundUntil": "2026-09-12T00:00:00+09:00",
    "cancelDeadlineAt": "2026-09-16T00:00:00+09:00",
    "refundTarget": "WALLET_BALANCE",
    "refundWalletAddress": "0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a",
    "walletBalanceAfter": 12500,
    "refundNotice": "Refunded to your balance in Korean won. You can use it for another show."
  },
  "msg": ""
}
```

### 4xx
```json
{ "code": "REFUND_DEADLINE_PASSED", "data": null, "msg": "취소 가능 기간이 지났습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `TICKET_NOT_OWNED` | 현재 소유자가 아님 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 `ticketId` |
| 409 | `TICKET_ALREADY_USED` | 이미 입장 처리됨 |
| 409 | `TICKET_CANCELED` | 이미 취소된 티켓 |
| 409 | `REFUND_DEADLINE_PASSED` | 취소 마감(D-3 00:00) 경과 |
| 409 | `REFUND_AFTER_SETTLEMENT_LOCK` | 정산이 `LOCKED` 이상 |

---

### API-refund-02 개별 취소·환불 **[v4 변경 — 온체인 refund 1건]**
`POST /api/v1/tickets/{ticketId}/cancel` · 권한: 소유자 · 우선: P0 · 연관 화면: `A-11 취소·환불` · 연관 기능: `F-refund-02 티켓 개별 취소·환불`

## 요구사항
- 티켓 1매를 취소하고 **운영자가 `RevenueSplitter.refund(...)` 한 tx**로 에스크로 → 관객 지갑 YoYo를 되돌린다. 같은 tx에서 선택 카운터가 −1 되므로 v3의 `cancelChoice` 별도 tx는 없다(결정 v2 §3.4).
- `202 Accepted` + `jobId`(`signerType=OPERATOR`)이며 상태는 API-chain-01로 확인한다. `Idempotency-Key`가 필수다 — 같은 키 재호출은 최초 `jobId`를 재생한다.
- 확정 시 `refund` `PROCESSING` → `COMPLETED`, 티켓 `ISSUED` → `CANCELLED`, 주문의 전 티켓이 취소되면 주문 `PAID` → `REFUNDED`(+ `payment` → `REFUNDED`), 재고를 원복한다.
- **`orderRef`당 누적 환불 ≤ 구매액**이 컨트랙트 불변식이다. 초과 요청은 컨트랙트가 revert하고 서버도 사전에 막는다(`COMMON_CONFLICT`).
- 클라이언트는 확인 전 API-refund-01로 금액을 보여준 뒤 `expectedRefundAmount`로 재확인시킨다. 서버 재계산과 다르면 400이다.
- **실패는 티켓을 영구히 잠그지 않는다.** **[2026-09-18 — S15P21B204-147]** `chain_job` 이 `FAILED` 로 닫히면 그 `refund` 도 같은 트랜잭션에서 `FAILED` 가 된다(전송 전 실패 포함). 갈린 행은 1분 주기 스윕이 뒤에서 한 번 더 닫는다. 그래야 `REFUND_ALREADY_REQUESTED` 가 풀려 사용자가 다시 요청할 수 있고, 공연 취소 일괄 환불의 남은 금액 계산과 보증금 반환 시점 판정도 막히지 않는다.
- **실패 보상**: `refund` tx가 실패하면 **아무것도 이동하지 않는다** — 코인은 에스크로에 그대로 있고 티켓 상태만 되돌린다(`refund` → `FAILED`, 티켓 `ISSUED` 복구). **[v5]** 값이 두 곳으로 나뉘어 어긋나는 중간 상태가 원리적으로 없다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language` · `Idempotency-Key: {UUIDv4}` **필수**

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `ticketId` | path | integer(BIGINT) | Y | 티켓 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `expectedRefundAmount` | integer | Y | YoYo 정수 | API-refund-01의 `refundAmount`. 서버 재계산과 다르면 400 |
| `reason` | string | N | 최대 200자 | 취소 사유(통계용) |

```json
{ "expectedRefundAmount": 12500, "reason": "일정 변경" }
```

### 시스템 처리
1. 멱등키 확인 → 소유자·티켓 상태·취소 마감·정산 잠금 확인 → 환불액 재계산 후 `expectedRefundAmount` 대조 → `orderRef` 누적 환불 한도 확인 → 에스크로 잔액 확인.
2. 상태 전이: `refund` 생성(`PENDING`, `receiver_wallet_id` = 관객 지갑) → tx 제출 시 `PROCESSING` → 확정 시 `COMPLETED` + 티켓 `CANCELLED`(+ 주문 전량 취소 시 `REFUNDED`) + **[v6] 수신(관객) 지갑의 `wallet:balance` 갱신**(§0.12).
3. 외부 호출(202): 운영지갑이 `refund(showId, orderRef, 관객 지갑, teamIndex, refundAmount)` 전송(nonce 직렬 큐) → receipt·`Refunded` 이벤트 확인. 실패 3회 재시도 후 연장 재시도. **[v5] 온체인 tx 1건이 전부다.**
4. `refund`(`chain_job_id`·`refund_tx_hash`)·`chain_job` 저장, 재고 원복, 감사 로그.

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": {
    "jobId": "chain_01J9D8H9J0",
    "status": "PENDING",
    "signerType": "OPERATOR",
    "pollAfterMs": 1500,
    "ticketId": 90211,
    "refundId": 6101,
    "refundAmount": 12500,
    "feeAmount": 12500,
    "currency": "KRW",
    "display": { "currency": "USD", "approx": 9.26, "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "refundTarget": "WALLET_BALANCE",
    "refundWalletAddress": "0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a"
  },
  "msg": "취소를 접수했습니다. 환불 금액은 잔액으로 돌아갑니다."
}
```

### 4xx/5xx
```json
{ "code": "REFUND_ALREADY_REQUESTED", "data": null, "msg": "이미 취소 요청이 접수된 티켓입니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `expectedRefundAmount` 불일치, `Idempotency-Key` 헤더 없음 |
| 403 | `TICKET_NOT_OWNED` | 현재 소유자가 아님 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 `ticketId` |
| 404 | `WALLET_NOT_FOUND` | 소유자 지갑이 없음(환불 수신 주소 부재) |
| 409 | `TICKET_ALREADY_USED` | 이미 입장 처리됨 |
| 409 | `TICKET_CANCELED` | 이미 취소됨 |
| 409 | `REFUND_DEADLINE_PASSED` | 취소 마감(D-3 00:00) 경과 |
| 409 | `REFUND_ALREADY_REQUESTED` | 같은 티켓에 `PENDING`·`PROCESSING`·`COMPLETED` 환불이 있음 — **`FAILED` 만 남은 티켓은 다시 요청할 수 있다** **[2026-09-18 — S15P21B204-147]** |
| 409 | `REFUND_AFTER_SETTLEMENT_LOCK` | 정산이 `LOCKED` 이상 |
| 409 | `COMMON_CONFLICT` | 같은 멱등키에 다른 본문, `orderRef` 누적 환불 한도 초과 |
| 409 | `COIN_ESCROW_INSUFFICIENT` | **[v4]** 에스크로 잔액 < 환불액(대사 점검 대상) |
| 500 | `CHAIN_GAS_INSUFFICIENT` | 운영지갑 가스 부족 — 관리자 알림 대상 |
| 502 | `REFUND_TRANSFER_FAILED` | **[v4 재정의]** `refund` tx 최종 실패 — 코인은 이동하지 않았고 재시도 대기 |

---

## 10. entry — 입장

검표 권한은 **공연별 검표 페이지 링크 토큰**이 정한다 [권] P-15 / SEC-03. 검표 담당자는 계정을 만들지 않고 API-performance-10이 발급한 링크로 들어와 그 토큰으로 인증한다. 동적 QR(30초 회전, 유효 60초)을 검증하고 Redis `SETNX` 원타임으로 재사용을 차단한다(SEC-06, REL-07 중복 입장 0). 스캔→판정 표시 p95 ≤ 1초, 스캐너 1대 ≥ 30건/분이 목표다(PERF-03).

**[v4]** 입장은 v3와 완전히 같다 — **온체인·코인과 무관하다.** QR 입장 보안은 서버 서명 QR의 몫이며 블록체인 성과가 아니다. 이 절의 두 API는 결정 문서에서 "유지"로 분류됐고 실질 변경이 없다(문구·`Accept-Language`만 §0.6을 따른다).

### API-entry-01 QR 검증·입장 처리
`POST /api/v1/entries/verify` · 권한: **검표 링크 토큰 보유자**(해당 공연) 또는 참여팀 회원 · 우선: P0 · 연관 화면: `S-02 검표 — QR 스캔` · 연관 기능: `F-entry-01 QR 검증·입장 처리`

## 요구사항
- 스캔한 QR 토큰의 서명·만료를 검증하고 즉시 입장 처리한다. 판정을 1초 안에 색·소리로 표시할 수 있도록 응답을 최소 필드로 유지한다(PERF-03).
- **Redis `SETNX` 원타임**으로 중복 입장을 막는다. 중복은 `ENTRY_ALREADY_ENTERED`이며 `msg`에 최초 입장 시각을 담는다. 만료 QR은 `ENTRY_QR_EXPIRED`(401), 서명 검증 실패는 `ENTRY_QR_SIGNATURE_INVALID`(401)이며 캡처·복제 시도로 보고 검표 이력에 기록한다.
- **인증은 `X-Entry-Token` 헤더**(권장) 또는 `entryToken` 쿼리다. 서버는 토큰 서명·만료와 **토큰의 공연 == body의 `performanceId`**를 검증한다. `Authorization` 헤더는 필요 없다. 참여팀 소속 회원이 `Authorization`으로 호출하는 경로도 허용한다 [권].
- 토큰이 없거나 불일치면 `ENTRY_SCANNER_NOT_AUTHORIZED`(403), 입장 허용 시간대(시작 60분 전 ~ 종료) 밖은 `ENTRY_NOT_IN_TIME_WINDOW`(409)다 [권]. 취소된 티켓은 입장시키지 않는다(REL-08).
- IP당 60회/분 제한 대상이며 링크 토큰 기준으로도 같은 한도를 적용한다(SEC-10).
- **[2026-09-16 — S15P21B204-101] QR 이미지의 페이로드는 `qrToken` 문자열 그대로다**(포장·접두 없음). 검표(S-02)는 읽은 문자열을 API-entry-01의 `qrToken`에 그대로 넣고, `performanceId`는 QR이 아니라 검표 진입 URL `/entry/{performanceId}`에서 가져온다. 검표 링크의 `?token=`(STAFF 기기 인증, API-performance-10이 발급)과는 **다른 토큰**이다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Accept-Language`
- `X-Entry-Token: {entryToken}` — 검표 링크 토큰. **`Authorization`과 둘 중 하나는 필수**
- `Authorization: Bearer {accessToken}` — 참여팀 소속 회원이 호출할 때만

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `entryToken` | query | string | N | 헤더를 못 쓰는 클라이언트용 대체. 헤더가 있으면 헤더 우선 |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `performanceId` | integer | Y | 검표 토큰의 공연과 일치 | 검표 중인 공연 |
| `qrToken` | string | Y | 최대 1024자 | 스캔한 서명 토큰 |
| `scannedAt` | string(ISO 8601) | N | — | 스캐너 단말 시각(로그용, 판정 기준은 서버 시각) |

```json
{ "performanceId": 12, "qrToken": "eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjkwMjExLCJleHAiOjE3ODk...", "scannedAt": "2026-09-19T18:42:03+09:00" }
```

### 시스템 처리
1. 검표 토큰 검증(서명·만료·공연 일치) **또는** 참여팀 소속 확인 → QR에서 `ticketId` 추출 후 `ticket.qr_secret`으로 현재·이전 30초 윈도우 HMAC 재계산·대조 → 티켓의 공연 일치·상태(`ISSUED`) 확인 → 입장 시간대 확인.
2. 상태 전이: Redis `SETNX` 원타임 획득 성공 시 티켓 `ISSUED` → `USED`(`entry_result`·`entered_at` 기록).
3. 외부 호출 없음(온체인과 무관).
4. `ticket` 갱신 + 검표 이력(성공·실패 모두) 기록.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": { "ticketId": 90211, "status": "USED", "ticketTypeName": "일반", "holderNameMasked": "김*객", "enteredAt": "2026-09-19T18:42:03+09:00", "enteredCount": 41, "totalIssuedCount": 64 },
  "msg": "입장 완료"
}
```

### 4xx
```json
{ "code": "ENTRY_ALREADY_ENTERED", "data": null, "msg": "이미 입장 처리된 티켓입니다. (최초 입장 19:12)" }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `qrToken` 누락·형식 위반 |
| 401 | `ENTRY_QR_EXPIRED` | 토큰 유효기간(60초) 경과 |
| 401 | `ENTRY_QR_SIGNATURE_INVALID` | 서명 검증 실패(캡처·복제 QR) |
| 401 | `COMMON_UNAUTHORIZED` | `X-Entry-Token`·`Authorization` 둘 다 없음 |
| 403 | `ENTRY_SCANNER_NOT_AUTHORIZED` | 검표 토큰이 무효·만료·다른 공연의 것이거나 참여팀 소속도 아님 |
| 404 | `COMMON_NOT_FOUND` | 토큰이 가리키는 티켓 없음 |
| 409 | `ENTRY_ALREADY_ENTERED` | Redis 원타임 중복 감지 |
| 409 | `ENTRY_NOT_IN_TIME_WINDOW` | 입장 허용 시간대 밖 |
| 409 | `TICKET_CANCELED` | 취소된 티켓 |
| 429 | `COMMON_TOO_MANY_REQUESTS` | IP당 60회/분 초과 (SEC-10) |

---

### API-entry-02 입장 현황·이력
`GET /api/v1/performances/{performanceId}/entries` · 권한: **검표 링크 토큰 보유자**·PERFORMER(참여팀) · 우선: P0 · 연관 화면: `S-03 입장 현황` · 연관 기능: `F-entry-02 입장 현황 조회`

## 요구사항
- 입장 수/총 발급 수와 최근 검표 이력을 준다. **중복 시도·만료 QR 같은 실패 건도 함께** 보여줘 현장에서 원인을 파악하게 한다. 요약값은 5초 캐시한다 [권](PERF-01).
- 인증은 API-entry-01과 같다 — 검표 링크 토큰 또는 참여팀 소속 회원.
- 관객 개인정보는 담지 않는다. 티켓 식별 정보·시각·마스킹된 이름만 준다.

## Request
### Headers
- `Accept: application/json` · `Accept-Language` · `X-Entry-Token` 또는 `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |
| `entryToken` | query | string | N | 헤더 대체 경로 |
| `result` | query | string | N | `SUCCESS` / `FAILED`. 미지정 시 전체 |
| `page`·`size` | query | — | N | §0.2 |

### Body
없음.

### 시스템 처리
1. 공연 존재 확인 → 검표 토큰 검증 또는 참여팀 소속 확인. 2. 상태 전이 없음(조회). 3. 외부 호출 없음. 4. `ticket`(`entry_result`·`entered_at`) 조회 + 요약 집계(5초 캐시) 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "summary": { "enteredCount": 41, "totalIssuedCount": 64, "duplicateAttemptCount": 3, "expiredQrCount": 5 },
    "items": [
      { "entryLogId": 77012, "ticketId": 90211, "holderNameMasked": "김*객", "result": "SUCCESS", "failureCode": null, "scannedAt": "2026-09-19T18:42:03+09:00", "scannerSource": "ENTRY_LINK" },
      { "entryLogId": 77013, "ticketId": 90211, "holderNameMasked": "김*객", "result": "FAILED", "failureCode": "ENTRY_ALREADY_ENTERED", "scannedAt": "2026-09-19T18:42:31+09:00", "scannerSource": "ENTRY_LINK" }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 49, "hasNext": true }
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `result`, `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | `X-Entry-Token`·`Authorization` 둘 다 없음 |
| 403 | `ENTRY_SCANNER_NOT_AUTHORIZED` | 검표 토큰이 무효·만료·다른 공연의 것이거나 참여팀 소속도 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |

---

> **API-entry-03 `GET /api/v1/performances/staff/me`는 v2에서 삭제됐고 v4에서도 되살리지 않는다.** STAFF 회원 지정(`performance_staff`)이 폐지돼 "내가 검표하는 공연"이라는 개념이 없다. 검표 담당자는 공유받은 링크로 곧바로 `S-02`에 들어가고, 참여팀 공연자는 `P-01`·`P-04`에서 링크(API-performance-10)를 확인한다.

---

## 11. settlement — 정산

정산 시점 규칙 [권] P-9: `취소 마감(D-3) → 공연 종료 → 집계 확정 → 정산 잠금 → 이의제기 48h → release`. Settlement 상태는 `NONE → AGGREGATED → LOCKED → DISPUTE_OPEN → RELEASED` / `HALTED`다(결정 v2 §7).

> **[2026-09-21] 정산 조기 동의(API-settlement-08)로 이의제기 48h를 건너뛸 수 있다.** 참여팀 전원(주최팀 포함)이 `정산 동의`를 누르면 `release`(API-settlement-05)가 이의제기 기간 중이라도 즉시 열린다 — 낼 사람이 전부 동의했으므로 기다릴 이유가 없다는 판단이다. 동의는 되돌릴 수 없고, 열린 이의가 하나라도 있으면 전원 동의해도 release는 여전히 막힌다(§11 -05).

> **[v6] 정산이 멈추는 방식은 두 종류이고, `HALTED`는 그중 하나뿐이다.**
>
> **① 되돌릴 수 있는 정지 — 상태는 그대로 두고 다음 동작만 막는다.** 세 가지가 있다.
> - **집계 확정 게이트** — 온체인 선택 카운터 합과 서버 집계가 어긋나면 `SETTLEMENT_AGGREGATE_MISMATCH`(409)로 **집계 확정만 거부**한다. 정산 상태는 `NONE` 그대로다. 원인을 확인한 뒤 다시 확정하면 그대로 이어진다(API-settlement-02).
> - **이의 접수 중 release 보류** — `OPEN` 이의가 남아 있으면 자동·수동 `release`가 모두 막힌다. 상태는 `DISPUTE_OPEN`을 유지하고, 관리자가 모든 이의를 처리하면 보류가 풀려 `release`로 이어진다(API-settlement-05·API-admin-06).
> - **발행량 대사 차단** — 불변식 1·4가 깨지면 `releaseHalted` 플래그가 서고 `release`만 잠시 막힌다(`mintHalted`와 같은 계열의 운영 플래그이며 정산 상태값이 아니다 — API-coin-01). 대사가 맞으면 플래그가 내려간다.
>
> **② 되돌릴 수 없는 중단 — `HALTED`.** 온체인 `Splitter.halt(showId)`와 한 몸이다. 컨트랙트가 이후 `refund`만 허용하고 `aggregate`·`release`를 **영구히** 차단한다. 진입하면 곧바로 전 티켓 무수수료 일괄 환불이 시작되고, 전 건이 끝나면 보증금이 반환된다. 환불로 에스크로가 비므로 분배할 재원 자체가 남지 않는다. **`HALTED`에서 `RELEASED`로 가는 경로는 존재하지 않는다.**
>
> 진입 경로는 **공연 취소**(API-performance-12)와 **관리자가 이의 처리 중 집계를 되돌릴 수 없다고 판정해 전액 환불을 결정한 경우**(API-admin-06 → 공연 취소 경로) 둘뿐이다. 어느 쪽도 시스템이 불일치를 감지해 자동으로 전이시키지 않는다.

**[v5] `release`가 정산의 종단이다(P-10).** 리더 지갑에 YoYo가 들어오면 **그것이 곧 수령 완료**이고 그 뒤에 아무 단계도 없다 — 코인이 곧 돈이기 때문이다(결정 v2 §3.6·§3.7). v4에서 release 뒤에 붙어 있던 도메인 하나(리더 2차 서명 → 외부 이전 → 소각)가 장째로 삭제됐다(§11 말미).

**release가 실제로 하는 일**: 운영자가 `RevenueSplitter.release(showId)`를 보내면 컨트랙트가 잠긴 규칙·온체인 카운터로 분배액을 산출해 **각 팀 리더 지갑으로 YoYo를 `transfer`(push)** 하고 `Released(showId, teamWallet, amount)` 이벤트를 남긴다. dust는 공연 생성 팀에 귀속된다. **[v5] release 확정 = 수령 완료**이므로 리더에게 "412,300 YoYo received" 알림을 보내고 P-08에 **"Received" 배지**를 띄우면 끝이다. 이어서 **보증금 반환**(`returnDeposit`)도 실행한다(P-21).

집계는 서버 DB값이 아니라 **온체인 선택 카운터**와 대조해 확정하고(REL-06), 불일치면 **[v6] 집계 확정을 거부한다**(`SETTLEMENT_AGGREGATE_MISMATCH`, 409). 정산 상태는 그대로 남고 `HALTED`로 전이하지 않는다 — 원인을 확인한 뒤 다시 확정하면 이어진다.

### API-settlement-01 정산 상태·집계·분배액·tx **[v5 변경 — 수령 이후 단계 삭제]**
`GET /api/v1/performances/{performanceId}/settlement` · 권한: PERFORMER(참여팀) · 우선: P0 · 연관 화면: `P-08 정산 대시보드` · 연관 기능: `F-settlement-01 정산 현황 조회`

## 요구사항
- **[2026-09-24] 본인 확인 스위치(§7.W)** — `STEP_UP_ENABLED`가 켜져 있으면 응답에 **`stepUpRequired: true`**가 실린다(꺼져 있으면 키 없음 — 계약 무변경). 화면은 이 값으로 조기 동의(API-settlement-08)·정산금 지급(API-settlement-05) 직전에 본인 확인 단계를 넣고, 받은 토큰(범위 `SETTLEMENT_APPROVE` / `SETTLEMENT_RELEASE`·공연 id)을 각 API 헤더 `X-Step-Up-Token`에 싣는다.
- 정산 상태 머신의 현재 위치, 총 매출·환불액·분배 대상액, **팀별 분배액과 산출 근거**, 관련 tx 해시·익스플로러 링크를 한 번에 준다. P-08 화면 전체가 이 응답으로 그려진다.
- **[v5]** 팀별 항목에 **`released`(수령 여부)·`releasedAt`·`walletAddress`(수령 주소 스냅샷)** 를 담는다. v4의 네 번째 컬럼(누적 유출액)은 ERD v4에서 삭제됐고(결정 v2 §8 #18) 응답에서도 빠졌다.
- **[v4]** `releaseTxHash`·`escrowBalance`·**보증금 반환 상태**(`deposit.status`·`returnTxHash`)를 담는다.
- **[v5] 내 팀의 다음 행동**은 `myTeam.nextAction`으로 주지만 값이 **`NONE` / `WAIT_RELEASE` 둘뿐**이다. release 이후에 팀이 할 일이 없으므로 v4의 두 값(등록·유출 시작)은 삭제됐다. P-08은 `released: true`면 "Received" 배지만 띄운다.
- 각 단계 액션(집계 확정·잠금·이의제기·release·**[2026-09-21] 동의**)의 실행 가능 여부와 막힌 이유를 `actions`로 담아 버튼 활성 조건을 서버가 정한다 [권]. 이의제기 기간 중이면 `disputeClosesAt`을 준다.
- `actions.*.blockedReason`은 실행 API가 같은 상태에서 던지는 `ErrorCode`와 **같은 문자열**이다(서버가 실행·조회에 같은 게이트를 쓴다). **단 체인 조회가 필요한 검사 2종은 `actions`에 반영되지 않는다** — 집계 대사(`SETTLEMENT_AGGREGATE_MISMATCH`)·release 직전 에스크로(`COIN_ESCROW_INSUFFICIENT`). `available: true`여도 실행이 409로 끝날 수 있으므로 화면은 409 `code` 안내 경로를 둔다(2026-09-09).
- 참여팀 소속만 조회한다(`SETTLEMENT_NOT_PARTICIPANT`). 공개용은 API-verify-01, 밴드 멤버용은 API-settlement-07이다.
- **[2026-09-21]** 팀별 항목에 `approved`(조기 동의 여부)·`approvedAt`을 담는다. 미동의 팀은 `approvedAt` 필드째 빠진다(전역 `non_null`). `myTeam.approved`는 내 팀의 동의 여부이고, 동의 현황 `n/m`은 화면이 `shares.filter(approved).length / shares.length`로 계산한다 — 별도 카운트 필드는 두지 않는다(API-settlement-08).

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
없음.

### 시스템 처리
1. 공연 존재·참여팀 소속 확인.
2. 상태 전이 없음(조회).
3. 외부 호출 없음(온체인 값은 인덱싱 결과 사용, PERF-01).
4. **[v5]** `settlement` + `settlement_share` + `dispute` + `chain_job` + `performance`(보증금) 조합 반환. 수령 이후 단계를 담는 테이블이 없다.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "settlementId": 91,
    "status": "RELEASED",
    "rate": { "currency": "USD", "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "currency": "KRW",
    "grossRevenueAmount": 1600000,
    "refundedAmount": 75000,
    "netRevenueAmount": 1525000,
    "distributableAmount": 1525000,
    "escrowBalanceAmount": 0,
    "fixedRatioBp": 6000,
    "selectionRatioBp": 4000,
    "dustAmount": 4,
    "dustTeamId": 7,
    "rulesHash": "0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f",
    "aggregatedAt": "2026-09-20T10:00:00+09:00",
    "lockedAt": "2026-09-20T18:00:00+09:00",
    "disputeClosesAt": "2026-09-22T18:00:00+09:00",
    "releasedAt": "2026-09-22T18:00:30+09:00",
    "releaseTxHash": "0x9c1a4b7e2d5f8039ab6c4e1d2f3a5b7c9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6",
    "counterMatched": true,
    "deposit": { "status": "RETURNED", "amount": 50000, "returnTxHash": "0x8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7", "returnedAt": "2026-09-22T18:00:45+09:00" },
    "shares": [
      { "teamId": 7, "teamName": "블루노트", "walletAddress": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b", "fixedAmount": 457500, "choiceAmount": 285937, "dustAmount": 4, "totalAmount": 743441, "choiceCount": 30, "released": true, "releasedAt": "2026-09-22T18:00:30+09:00", "approved": true, "approvedAt": "2026-09-21T14:03:11+09:00" },
      { "teamId": 9, "teamName": "새벽세시", "walletAddress": "0x3c8a1f2b4d6e8091a2b3c4d5e6f708192a3b4c5d", "fixedAmount": 274500, "choiceAmount": 200156, "dustAmount": 0, "totalAmount": 474656, "choiceCount": 21, "released": true, "releasedAt": "2026-09-22T18:00:30+09:00", "approved": true, "approvedAt": "2026-09-21T15:40:02+09:00" },
      { "teamId": 11, "teamName": "노이즈캔슬", "walletAddress": "0x9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6f7081920", "fixedAmount": 183000, "choiceAmount": 123903, "dustAmount": 0, "totalAmount": 306903, "choiceCount": 13, "released": true, "releasedAt": "2026-09-22T18:00:30+09:00", "approved": true, "approvedAt": "2026-09-21T16:12:47+09:00" }
    ],
    "myTeam": { "teamId": 11, "totalAmount": 306903, "released": true, "releasedAt": "2026-09-22T18:00:30+09:00", "walletAddress": "0x9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6f7081920", "nextAction": "NONE", "approved": true },
    "disputes": [],
    "transactions": [
      { "type": "START_SALE", "txHash": "0x8f2e1d0c9b8a70695847362514039281a0b1c2d3e4f5061728394a5b6c7d8e9f", "explorerUrl": "https://kairos.kaiascan.io/tx/0x8f2e1d0c9b8a70695847362514039281a0b1c2d3e4f5061728394a5b6c7d8e9f" },
      { "type": "RELEASE", "txHash": "0x9c1a4b7e2d5f8039ab6c4e1d2f3a5b7c9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6", "explorerUrl": "https://kairos.kaiascan.io/tx/0x9c1a4b7e2d5f8039ab6c4e1d2f3a5b7c9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6" }
    ],
    "actions": {
      "aggregate": { "available": false, "blockedReason": "SETTLEMENT_ALREADY_RELEASED" },
      "lock": { "available": false, "blockedReason": "SETTLEMENT_ALREADY_RELEASED" },
      "dispute": { "available": false, "blockedReason": "SETTLEMENT_ALREADY_RELEASED" },
      "release": { "available": false, "blockedReason": "SETTLEMENT_ALREADY_RELEASED" },
      "approve": { "available": false, "blockedReason": "SETTLEMENT_ALREADY_RELEASED" }
    }
  },
  "msg": ""
}
```

`fixedAmount`는 v3의 `equalAmount`를 대체한다 — 2단계 규칙에서 고정 풀은 균등이 아니라 `teamShareBp`로 나뉘기 때문이다(v3 §5 규칙과 일치하도록 필드명을 정정했다, §16.2 #2).

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `SETTLEMENT_NOT_PARTICIPANT` | 참여팀 소속이 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |

---

### API-settlement-02 집계 확정
`POST /api/v1/performances/{performanceId}/settlement/aggregate` · 권한: 생성자·ADMIN · 우선: P0 · 연관 화면: `P-08 정산 대시보드` · 연관 기능: `F-settlement-02 정산 집계 확정`

## 요구사항
- **공연 종료(`ENDED`) 이후** 생성자 또는 관리자가 실행한다 [권] P-9. 공연이 끝나지 않았으면 `PERFORMANCE_INVALID_STATUS`다.
- 서버 집계와 **온체인 선택 카운터의 합**을 대조한다. 불일치면 `SETTLEMENT_AGGREGATE_MISMATCH`(409)로 **[v6] 집계 확정만 거부**하고 관리자 확인으로 넘긴다(REL-06). **정산 상태는 바뀌지 않는다** — `HALTED`로 전이하는 경로가 아니다.
- **[v4]** 결제 서명이 끝나지 않은 주문(`payment` `AWAITING_SIGNATURE`·`PAYING`)이나 확정 대기 mint가 남아 있으면 `COIN_MINT_PENDING`(409)으로 막는다. 온체인 카운터가 아직 움직이는 중이면 집계가 의미 없다.
  - **[v6 개정]** 이 게이트는 결제를 두 묶음으로 센다. **`PAYING`은 주문 상태와 무관하게 센다** — 대납 tx가 이미 체인으로 나가 주문이 만료된 뒤에도 뒤늦게 채굴될 수 있다. **`REQUESTED`·`AWAITING_SIGNATURE`는 살아 있는(`PENDING_PAYMENT`) 주문의 것만 센다** — 체인에 아무것도 나가지 않았으므로 만료·취소된 주문의 것은 카운터를 바꿀 수 없다.
  - 관객이 결제를 시작만 하고 서명하지 않은 건은 주문이 만료돼도 `AWAITING_SIGNATURE`로 남아 그 공연의 집계를 영구히 막았다(D-83). 주문 만료는 그 결제를 `FAILED`로 닫는다(요구사항 §5-1).
- 온체인 조회·기록이 걸리므로 `202 Accepted` + `jobId`다. 확정 시 정산 `NONE` → `AGGREGATED`, 팀별 `settlement_share`가 확정 저장된다. 산출→제출 ≤ 5분이 목표다(PERF-05).

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
없음.

### 시스템 처리
1. 생성자·ADMIN 권한 확인 → 공연 상태(`ENDED`)·정산 상태(`NONE`) 확인 → 미확정 결제·mint 잔여 확인.
2. 상태 전이: `settlement` 생성/갱신, tx 확정 시 `NONE` → `AGGREGATED`.
3. 외부 호출(202): `choiceCountOf`·`escrowOf` 조회 → 서버 집계와 대조 → 분배액 산출(2단계 규칙, dust는 생성 팀) → `aggregate(showId, validTicketCount)` 온체인 기록(OPERATOR). 실패 3회 재시도 후 연장 재시도.
4. `settlement`·`settlement_share`·`chain_job` 저장 + 감사 로그.

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": { "jobId": "chain_01J9E1K2L3", "status": "PENDING", "signerType": "OPERATOR", "pollAfterMs": 2000, "performanceId": 12, "nextStatus": "AGGREGATED", "validTicketCount": 64 },
  "msg": "집계 확정을 접수했습니다."
}
```

### 4xx/5xx
```json
{ "code": "SETTLEMENT_AGGREGATE_MISMATCH", "data": null, "msg": "집계 검증에 실패했습니다. 관리자 확인 후 정산이 진행됩니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자도 ADMIN도 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 409 | `PERFORMANCE_INVALID_STATUS` | 공연이 아직 `ENDED`가 아니거나 `CANCELLED`이거나, 정산이 `HALTED`(공연 취소 또는 관리자 중단 판정) — **[v6]** 게이트는 정산 상태로 판정한다(§16.1 `SETTLEMENT_HALTED`) |
| 409 | `COMMON_CONFLICT` | 이미 `AGGREGATED` 이상이거나 집계 작업 진행 중 |
| 409 | `COIN_MINT_PENDING` | **[v4]** 확정되지 않은 결제 서명·mint 건이 남아 있음 — **[v6]** `PAYING`은 주문 상태와 무관하게, 미서명 결제는 살아 있는(`PENDING_PAYMENT`) 주문의 것만 센다 |
| 409 | `SETTLEMENT_AGGREGATE_MISMATCH` | 온체인 카운터 합 ≠ 서버 집계 |
| 500 | `CHAIN_GAS_INSUFFICIENT` | 운영지갑 가스 부족 |
| 504 | `CHAIN_TX_TIMEOUT` | 온체인 확정 지연 — `jobId`로 계속 폴링 |

---

### API-settlement-03 정산 잠금(이의제기 시작)
`POST /api/v1/performances/{performanceId}/settlement/lock` · 권한: 생성자·ADMIN · 우선: P0 · 연관 화면: `P-08 정산 대시보드` · 연관 기능: `F-settlement-03 정산 잠금·이의제기 기간 시작`

## 요구사항
- `AGGREGATED`에서만 실행한다. 잠금 즉시 팀별 분배액이 고정되고 **48시간 이의제기 기간**이 시작된다 [권] P-9·P-16. 조회 응답에서는 `DISPUTE_OPEN`으로 표시된다.
- 잠금 이후 개별 환불은 앱에서 막힌다(`REFUND_AFTER_SETTLEMENT_LOCK`) — 컨트랙트도 lock 이후 `refund`를 revert한다.
- 온체인 카운터 불일치(`counterMatched: false`)에서는 잠글 수 없다(REL-06).
- `202 Accepted` + `jobId`다. 운영자가 `lock(showId)`를 보낸다.

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
없음.

### 시스템 처리
1. 생성자·ADMIN 권한 확인 → 정산 상태(`AGGREGATED`)·카운터 일치 확인.
2. 상태 전이: tx 확정 시 `AGGREGATED` → `LOCKED`, `disputeClosesAt = now + 48h`.
3. 외부 호출(202): 운영자가 `lock(showId)` 전송. 실패 3회 재시도 후 연장 재시도.
4. `settlement` 갱신 + 참여팀 리더 알림 [권] + 감사 로그.

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": { "jobId": "chain_01J9E4M5N6", "status": "PENDING", "signerType": "OPERATOR", "pollAfterMs": 2000, "performanceId": 12, "nextStatus": "LOCKED", "disputeClosesAt": "2026-09-22T18:00:00+09:00" },
  "msg": "정산을 잠갔습니다. 48시간 동안 이의제기를 받습니다."
}
```

### 4xx/5xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자도 ADMIN도 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 409 | `SETTLEMENT_NOT_LOCKED` | 정산이 아직 `AGGREGATED`가 아님(집계 미확정) |
| 409 | `SETTLEMENT_AGGREGATE_MISMATCH` | 카운터 불일치 상태 |
| 409 | `COMMON_CONFLICT` | 이미 `LOCKED` 이상이거나 잠금 작업 진행 중 |
| 409 | `PERFORMANCE_INVALID_STATUS` | 공연이 `CANCELLED`이거나 정산이 `HALTED`(공연 취소 또는 관리자 중단 판정) — **[v6]** 게이트는 정산 상태로 판정한다(§16.1 `SETTLEMENT_HALTED`) |
| 500 | `CHAIN_GAS_INSUFFICIENT` | 운영지갑 가스 부족 |

---

### API-settlement-04 이의제기
`POST /api/v1/performances/{performanceId}/settlement/disputes` · 권한: 참여팀 리더 · 우선: P0 · 연관 화면: `P-08 정산 대시보드` · 연관 기능: `F-settlement-04 정산 이의제기`

## 요구사항
- 참여팀 리더가 **잠금 후 48시간 안에** 사유를 제출한다 [권] P-16. 접수되면 release 자동 실행이 보류되고 관리자 검토(API-admin-06)로 넘어간다.
- 기간이 끝난 뒤 제출은 막는다. 규격에 전용 코드가 없어 `COMMON_CONFLICT`로 응답하고 `msg`로 사유를 설명한다(전용 코드 `SETTLEMENT_DISPUTE_CLOSED`는 §16.1).
- 팀당 동시에 열린 이의는 1건이다. 중복 제출은 `COMMON_CONFLICT`다.
- 온체인 작업이 아니므로 `201 Created` 동기 응답이다. **[v4]** `dispute`에 `member_id`는 없다 — 팀 단위 이의다(9/1 커밋 `69fa8e9`).

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `teamId` | integer | Y | 요청자가 리더인 참여팀 | 이의를 제기하는 팀 |
| `reason` | string | Y | 10~1000자 | 이의 사유 |
| `expectedAmount` | integer | N | 0 이상, YoYo 정수 | 팀이 주장하는 정산액(참고용) |

```json
{ "teamId": 11, "reason": "관객 선택 집계가 현장 티켓 수와 맞지 않습니다. 재확인 요청합니다.", "expectedAmount": 320000 }
```

### 시스템 처리
1. 리더·참여팀 확인 → 정산 상태(`LOCKED`/`DISPUTE_OPEN`)·기간(48h) 확인 → 중복 이의 확인.
2. 상태 전이: `dispute` 생성(`OPEN`). 정산은 `DISPUTE_OPEN` 유지하고 **release 자동 스케줄을 보류**한다.
3. 외부 호출 없음.
4. `dispute` 저장 + 관리자 알림 + 감사 로그.

## Response
### 201 Created
```json
{ "code": "SUCCESS", "data": { "disputeId": 41, "performanceId": 12, "teamId": 11, "status": "OPEN", "createdAt": "2026-09-21T09:12:00+09:00", "releaseHeld": true }, "msg": "이의제기가 접수되었습니다. 관리자 검토 후 정산이 재개됩니다." }
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 사유 길이 위반 |
| 403 | `COMMON_FORBIDDEN` | 해당 팀 리더가 아님 |
| 403 | `SETTLEMENT_NOT_PARTICIPANT` | 참여팀이 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 409 | `SETTLEMENT_NOT_LOCKED` | 아직 잠금 전이라 이의 대상이 없음 |
| 409 | `SETTLEMENT_ALREADY_RELEASED` | 이미 release 완료 |
| 409 | `COMMON_CONFLICT` | 이의제기 기간 종료, 같은 팀의 열린 이의 존재, **진행 중인 RELEASE job 존재**(`msg`: "정산 실행이 시작되어 이의를 접수할 수 없습니다.") (전용 코드는 §16.1) |

> **[2026-09-21] 진행 중인 지급이 이의 접수를 닫는다.** 조기 동의(API-settlement-08)로 release가 이의제기 기간 **중에도** 성립하면서, 예전에는 시간으로 배타적이던 두 경로가 겹친다. 두 경로는 공연 행 쓰기 락으로 직렬화되며, RELEASE job이 먼저 걸렸으면 그 뒤의 이의는 이 코드로 거절된다 — 돈은 이미 나가는 중이고 되돌릴 수 없다. `actions.dispute.blockedReason`에도 같은 코드로 나타난다.

---

### API-settlement-05 release 실행 **[v5 변경 — release = 수령 완료]**
`POST /api/v1/performances/{performanceId}/settlement/release` · 권한: 생성자·ADMIN(자동 스케줄 병행) · 우선: P0 · 연관 화면: `P-08 정산 대시보드` · 연관 기능: `F-settlement-05 정산 release 실행`

## 요구사항
- **[2026-09-24] 본인 확인 가드(§7.W)** — 스위치가 켜져 있으면 헤더 **`X-Step-Up-Token`**(범위 `SETTLEMENT_RELEASE`·공연 id)이 필수다. 생성자·ADMIN 확인 **뒤에** 검사하므로 권한이 없는 요청은 기존 코드로 막히고 토큰을 태우지 않는다. 없음·만료·이미 소비·다른 동작/대상/회원의 토큰은 403 `WEBAUTHN_STEP_UP_REQUIRED`. 자동 스케줄(사람 없음)은 가드하지 않는다. **꺼져 있으면 헤더를 읽지 않는다.**
- 이의제기 48시간이 지나면 **자동 스케줄이 실행**하고 이 API는 같은 동작의 수동 트리거다 [권] P-9. 기간 중 호출은 `SETTLEMENT_DISPUTE_PERIOD`(`msg`에 종료 시각)다. 열린 이의가 있으면 자동·수동 모두 막힌다 — 관리자가 처리(API-admin-06)해야 재개된다 [권] P-16.
- **[2026-09-21] release 조건이 "이의제기 기간 종료" 또는 "참여팀 전원 동의"로 넓어졌다**(API-settlement-08). 참여팀 전원(주최팀 포함)이 조기 동의하면 이의제기 48시간이 남아 있어도 이 API가 통과한다 — `dispute_deadline_at`이 비어 있는 정산(D-26)도 전원 동의면 통과한다. **순서는 그대로다** — 전원 동의해도 열린 이의가 하나라도 있으면 여전히 `SETTLEMENT_DISPUTE_PERIOD`로 막힌다. 자동 스케줄의 후보 선별도 "마감이 지난 정산"에서 **"잠긴 정산 전부(`LOCKED`·`DISPUTE_OPEN`)"로 넓어져**, 전원 동의 후 최대 60초 안에 자동 실행이 접수된다.
- **[v4]** 운영자가 `release(showId)`를 보내고 컨트랙트가 각 팀 리더 지갑으로 YoYo를 `transfer`(push)한다. 확정 시 정산 → **`RELEASED`(종단)**, `settlement_share.released=true`·`released_at` 기록, `settlement.release_tx_hash` 기록.
- **[v5] release가 마지막 단계다.** 확정되면 리더에게 "412,300 YoYo received" 알림을 보내고 P-08에 "Received" 배지를 띄운다. 그 뒤에 리더가 눌러야 하는 버튼도, 서버가 해야 하는 후속 작업도 없다(P-10·결정 v2 §3.6). 팀 쪽 사전 등록 조건이 없으므로 release를 막는 팀 측 조건도 없다.
- **[v4] release 확정 직후 보증금을 반환**한다 — 같은 job 체인에서 `returnDeposit(showId)`를 보내 생성팀 리더 지갑으로 되돌리고 `deposit_status=RETURNED`로 만든다(P-21).
- 팀별 부분 성공을 허용한다. 실패 건은 `results`에 `retryable`로 표시하고 시스템 자동 재시도 대상이 된다(REL-05).
- `Idempotency-Key`가 필수다 — 이중 release는 정산 정합을 깨뜨린다. **[v5]** 발행량 대사(불변식 1·4)가 깨진 상태에서는 실행하지 않는다(`COIN_RESERVE_MISMATCH`, 전용 코드 `COIN_SUPPLY_MISMATCH`는 §16.1, P-11).
- **불변식**: Σ`Released` = 잠긴 규칙 × 카운터로 재계산한 분배액 합(dust 포함, 1원도 다르지 않아야 한다). 확정 후 검증 페이지(API-verify-01)가 이 값을 대사한다(결정 v2 §3.8 #3).

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Idempotency-Key: {UUIDv4}` **필수**

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `note` | string | N | 최대 200자 | 수동 실행 사유(감사 로그) |

```json
{ "note": "이의 처리 완료 후 수동 실행" }
```

### 시스템 처리
1. 권한·멱등키 확인 → 정산 상태(`LOCKED`/`DISPUTE_OPEN`)·이의제기 기간 종료·열린 이의 없음·에스크로 잔액 ≥ 분배 합계·**[v5] 발행량 대사 상태** 확인.
2. 상태 전이: tx 확정 시 `LOCKED`/`DISPUTE_OPEN` → `RELEASED`(종단), `settlement_share.released`·`wallet_address` 기록, `deposit_status` → `RETURNED` + **[v6] 수신(팀 리더·생성팀) 지갑의 `wallet:balance` 갱신**(§0.12).
3. 외부 호출(202, 전부 OPERATOR): ① `release(showId)` → 팀 리더 지갑들로 YoYo push, `Released` 이벤트 ② `returnDeposit(showId)` → 생성팀 리더 지갑. 실패는 3회 재시도 후 연장 재시도, 결정적 실패만 운영자 알림.
4. `settlement`·`settlement_share`·`performance`·`chain_job` 저장 + **팀 리더 알림(정산금 도착 → "원화로 받기")** + 감사 로그(`action_type=RELEASE`, SEC-11).

## Response
### 202 Accepted
```json
{
  "code": "SUCCESS",
  "data": {
    "jobId": "chain_01J9F7P8Q9",
    "status": "PENDING",
    "signerType": "OPERATOR",
    "pollAfterMs": 2500,
    "performanceId": 12,
    "settlementId": 91,
    "nextStatus": "RELEASED",
    "targetTeamCount": 3,
    "totalAmount": 1525000,
    "currency": "KRW",
    "depositReturnPlanned": true,
    "depositAmount": 50000,
    "payoutNotice": "release가 확정되면 각 팀 리더 지갑에 코인이 도착하고, 그것으로 수령이 끝납니다."
  },
  "msg": "정산 실행을 접수했습니다."
}
```

부분 성공은 API-chain-01 응답의 `results`로 확인한다.

```json
{
  "code": "SUCCESS",
  "data": {
    "settlementId": 91,
    "results": [
      { "teamId": 7, "walletAddress": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b", "amount": 743441, "status": "RELEASED", "txHash": "0x9c1a4b7e2d5f8039ab6c4e1d2f3a5b7c9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6" },
      { "teamId": 9, "walletAddress": "0x3c8a1f2b4d6e8091a2b3c4d5e6f708192a3b4c5d", "amount": 474656, "status": "FAILED", "reason": "CHAIN_NONCE_CONFLICT", "retryable": true }
    ]
  },
  "msg": ""
}
```

### 4xx/5xx
```json
{ "code": "SETTLEMENT_DISPUTE_PERIOD", "data": null, "msg": "이의제기 기간이 끝난 뒤 정산할 수 있습니다. (2026-09-22 18:00 이후)" }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | `Idempotency-Key` 헤더 없음 |
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자도 ADMIN도 아님 |
| 403 | `WEBAUTHN_STEP_UP_REQUIRED` | **[2026-09-24]** 스위치 켜짐 + 토큰 없음·만료·소비·범위(`SETTLEMENT_RELEASE`·공연) 불일치 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 409 | `SETTLEMENT_NOT_LOCKED` | 집계·잠금 전 |
| 409 | `SETTLEMENT_DISPUTE_PERIOD` | 이의제기 48시간 경과 전(**단 참여팀 전원 동의면 통과**, API-settlement-08) 또는 열린 이의 존재(전원 동의여도 막힘) |
| 409 | `SETTLEMENT_ALREADY_RELEASED` | 이미 release 완료 |
| 409 | `PERFORMANCE_INVALID_STATUS` | 공연이 `CANCELLED`이거나 정산이 `HALTED` |
| 409 | `COIN_ESCROW_INSUFFICIENT` | 에스크로 잔액 < 분배 합계(대사 점검 대상) |
| 409 | `COIN_RESERVE_MISMATCH` | **[v5]** 발행량 대사 불일치로 release 중단 상태(전용 코드 `COIN_SUPPLY_MISMATCH`는 §16.1) |
| 409 | `COMMON_CONFLICT` | 같은 멱등키에 다른 본문, release 작업 진행 중 |
| 500 | `CHAIN_GAS_INSUFFICIENT` | 운영지갑 가스 부족 |
| 504 | `CHAIN_TX_TIMEOUT` | 확정 지연 — `jobId`로 계속 폴링 |

> **[v5] 사라진 에러 4개**: 규격 v3의 수령 이후 단계 전용 코드 4개는 v5에서 **쓸 자리가 완전히 없어졌다** — 팀이 수령 뒤에 하는 동작이 존재하지 않기 때문이다. §16.4 폐기 후보로 올렸고, v4의 개명 제안도 함께 철회했다(§16.1).

---

### API-settlement-06 정산 공유 링크 생성
`POST /api/v1/performances/{performanceId}/settlement/share-link` · 권한: 생성자(리더) · 우선: P0 · 연관 화면: `P-08 정산 대시보드` · 연관 기능: `F-settlement-06 정산 공유 링크 생성`

## 요구사항
- 팀 리더가 정산 내역을 밴드 멤버에게 보여줄 공개 링크를 만든다. `settlement.share_token`을 발급해 `/public/settlement/{shareToken}`으로 로그인 없이 조회할 수 있게 한다. **[v4]** 팀원 소속 개념이 없으므로(§2) 이 링크가 밴드 멤버 공유의 유일한 경로다.
- 재발급하면 기존 토큰이 무효화된다. 정산이 `AGGREGATED` 이상이어야 의미 있는 데이터가 있고, `NONE`에서는 `PERFORMANCE_INVALID_STATUS`로 막는다.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
없음.

### 시스템 처리
1. 생성자 권한 확인 → 정산 상태(`AGGREGATED` 이상) 확인. 2. 상태 전이: `settlement.share_token` 발급·갱신(기존 무효화). 3. 외부 호출 없음. 4. `settlement` 갱신 + 감사 로그.

## Response
### 201 Created
```json
{
  "code": "SUCCESS",
  "data": { "performanceId": 12, "shareUrl": "https://b204.ssafy.io/settlement/share/stl_9f2c1a7b4e8d", "shareToken": "stl_9f2c1a7b4e8d", "issuedAt": "2026-09-22T18:30:00+09:00" },
  "msg": "공유 링크가 생성되었습니다. 밴드 멤버에게 전달해 주세요."
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 403 | `PERFORMANCE_NOT_OWNER` | 생성자 팀 리더가 아님 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 409 | `PERFORMANCE_INVALID_STATUS` | 정산이 아직 `NONE` |

---

### API-settlement-07 정산 공유 링크 조회 (공개) **[v5 변경 — 종단 `RELEASED`]**
`GET /api/v1/public/settlement/{shareToken}` · 권한: GUEST(인증 불필요) · 우선: P0 · 연관 화면: `V-03 정산 공유(공개)` · 연관 기능: `F-settlement-07 정산 내역 공개 조회`

## 요구사항
- `share_token`으로 정산 내역(팀별 분배액·선택 수·상태)을 로그인 없이 조회한다. 관객 개인정보는 담지 않고 팀 단위 집계만 준다.
- **[v5]** `settlementStatus`는 `RELEASED`가 종단이며 그 뒤 단계가 없다. 팀별 수령 여부(`released`)까지만 담는다.
- **[v4]** 금액은 YoYo 정수 + 축약 환율이며, "테스트넷 시연 정산" 고지를 `Accept-Language`에 맞춰 담는다.
- 토큰이 무효화됐거나 없으면 `404 COMMON_NOT_FOUND`다.

## Request
### Headers
- `Accept: application/json` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `shareToken` | path | string | Y | 정산 공유 토큰 |

### Body
없음.

### 시스템 처리
1. 토큰 존재·유효성 확인. 2. 상태 전이 없음(조회). 3. 외부 호출 없음. 4. `settlement` + `settlement_share` + `performance` 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "performanceTitle": "합정 3밴드 합동공연",
    "performedAt": "2026-09-19T19:00:00+09:00",
    "settlementStatus": "RELEASED",
    "rate": { "currency": "USD", "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "currency": "KRW",
    "grossRevenueAmount": 1600000,
    "refundedAmount": 75000,
    "netRevenueAmount": 1525000,
    "fixedRatioBp": 6000,
    "selectionRatioBp": 4000,
    "shares": [
      { "teamName": "블루노트", "fixedAmount": 457500, "choiceAmount": 285937, "dustAmount": 4, "totalAmount": 743441, "choiceCount": 30, "released": true },
      { "teamName": "새벽세시", "fixedAmount": 274500, "choiceAmount": 200156, "dustAmount": 0, "totalAmount": 474656, "choiceCount": 21, "released": true },
      { "teamName": "노이즈캔슬", "fixedAmount": 183000, "choiceAmount": 123903, "dustAmount": 0, "totalAmount": 306903, "choiceCount": 13, "released": true }
    ],
    "releaseTxHash": "0x9c1a4b7e2d5f8039ab6c4e1d2f3a5b7c9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6",
    "explorerUrl": "https://kairos.kaiascan.io/tx/0x9c1a4b7e2d5f8039ab6c4e1d2f3a5b7c9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6",
    "simulationNotice": "테스트넷 시연 정산입니다. 실제 자금이 아닙니다."
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 404 | `COMMON_NOT_FOUND` | 존재하지 않거나 무효화된 토큰 |

---

### API-settlement-08 정산 조기 동의 **[2026-09-21 신설]**
`POST /api/v1/performances/{performanceId}/settlement/approvals` · 권한: 참여팀 리더 · 우선: P0 · 연관 화면: `P-08 정산 대시보드` · 연관 기능: `F-settlement-08 정산 조기 동의`

## 요구사항
- **[2026-09-24] 본인 확인 가드(§7.W)** — 스위치가 켜져 있으면 헤더 **`X-Step-Up-Token`**(범위 `SETTLEMENT_APPROVE`·공연 id)이 필수다. 동의 게이트(참여팀 리더·정산 상태) **뒤에** 검사하므로 권한이 없는 요청은 기존 코드로 막히고 토큰을 태우지 않는다. 없음·만료·이미 소비·다른 동작/대상/회원의 토큰은 403 `WEBAUTHN_STEP_UP_REQUIRED`. **꺼져 있으면 헤더를 읽지 않는다.**
- 참여팀 **전원**(주최팀 포함)이 "이 분배안에 동의한다"를 누르면 48시간 이의제기 기간을 건너뛰고 release(API-settlement-05)가 열린다.
- **요청 본문이 없다** — 동의 대상 팀은 요청자가 리더인 참여팀으로 서버가 정한다. 남의 팀을 대신 동의할 수 없다.
- **ADMIN 우회가 없다.** API-settlement-04(이의제기)는 ADMIN이 팀을 대신 접수할 수 있지만(정산을 막는 방향이라 안전), 동의는 반대 방향이라 팀 자신만 할 수 있다.
- 동의는 **되돌릴 수 없다**. 생각이 바뀐 팀은 이의제기(API-settlement-04)로 막는다.
- 온체인 작업이 아니므로 `Idempotency-Key` 없이 `201 Created` 동기 응답이다.
- **이의제기 마감이 지난 뒤의 동의는 막지 않는다** — release가 이미 열려 있어 무의미할 뿐 해롭지 않다.
- 이미 열린 이의가 있는 팀은 동의할 수 없다(`COMMON_CONFLICT`) — 이의와 동의를 동시에 들고 있는 상태를 만들지 않는다.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
없음.

### 시스템 처리
1. 참여팀 리더 확인(ADMIN 우회 없음) → 정산 상태(`LOCKED`/`DISPUTE_OPEN`) 확인 → 요청자 팀의 `settlement_share` 존재 확인 → 이미 동의했는지·열린 이의가 있는지 확인.
2. 상태 전이: `settlement_share.approved_at` 기록(NULL → 시각, 철회 없음).
3. 외부 호출 없음(온체인 작업이 아니다).
4. `settlement_share` 갱신 + 감사 로그. 참여팀 전원이 찬 순간부터 자동 release 스케줄 후보에 들어간다(§11 -05).

## Response
### 201 Created
```json
{
  "code": "SUCCESS",
  "data": { "teamId": 12, "approvedAt": "2026-09-21T14:03:11+09:00", "approvedCount": 2, "requiredCount": 3, "releaseUnlocked": false },
  "msg": "정산에 동의했습니다."
}
```

`approvedCount`는 이번 동의를 포함해 동의한 팀 수, `requiredCount`는 전체 `settlement_share` 행 수(= 참여팀 수)다. `releaseUnlocked`는 **이 동의로** 전원이 찼는가이며, 화면이 "이제 지급할 수 있습니다"를 띄우는 근거다. 단 release의 나머지 게이트(열린 이의·발행량 대사·에스크로·수령 지갑)까지 통과했다는 뜻은 아니다 — 그 답은 `actions.release`다.

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 비로그인 |
| 403 | `SETTLEMENT_NOT_PARTICIPANT` | 참여팀이 아님(참여팀 아닌 ADMIN 포함, **리더가 아닌 팀원 포함**) |
| 403 | `WEBAUTHN_STEP_UP_REQUIRED` | **[2026-09-24]** 스위치 켜짐 + 토큰 없음·만료·소비·범위(`SETTLEMENT_APPROVE`·공연) 불일치 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않는 `performanceId` |
| 409 | `SETTLEMENT_NOT_LOCKED` | 정산이 `NONE`·`AGGREGATED`(`msg`: "정산이 잠긴 뒤에 동의할 수 있습니다.") 또는 요청자 팀의 분배 행이 없음(`msg`: "분배 내역이 없어 동의할 수 없습니다.") |
| 409 | `SETTLEMENT_ALREADY_RELEASED` | 정산이 `RELEASED` |
| 409 | `PERFORMANCE_INVALID_STATUS` | 정산이 `HALTED` |
| 409 | `COMMON_CONFLICT` | 이미 동의한 팀(`msg`: "이미 동의한 팀입니다.") 또는 그 팀에 열린 이의가 있음(`msg`: "이의를 취소한 뒤 동의할 수 있습니다.") |

> **-04와 달리 `COMMON_FORBIDDEN`이 없다.** -04는 요청 본문의 `teamId`로 참여팀을 찾으므로 "그 팀은 있는데 요청자가 리더가 아님"이 구분된다. -08은 **본문이 없어** 대상 팀을 요청자에서 찾고(`participantOf` — 요청자가 리더인 참여팀), 이 도메인에는 팀 소속 테이블이 없어 **참여팀의 리더가 곧 소속**이다. 따라서 "참여팀이지만 리더가 아님"은 존재하지 않는 상태이고 전부 `SETTLEMENT_NOT_PARTICIPANT`로 떨어진다. 프론트는 이 코드로 "리더만 가능" 안내를 분기한다.

---

### 삭제된 장 — v4 §14 `withdraw` **[v5 삭제]**

- **API-withdraw-01~04 (`POST /teams/{teamId}/withdrawals` · `POST …/{withdrawalId}/signed-tx` · `GET /teams/{teamId}/withdrawals` · `POST /admin/withdrawals/{withdrawalId}/retry`)** — **`release`가 리더 지갑에 코인을 넣으면 수령이 끝난다**(P-10·결정 v2 §3.6). 코인이 곧 돈이므로 그 뒤에 리더가 서명하고 서버가 외부로 값을 옮기고 소각하는 3단계가 존재할 이유가 없다. 정산 종단은 `RELEASED`이며 `settlement_share.released`·`released_at`·`wallet_address`로 수령을 확인한다.
- 함께 사라진 것: `coin_withdrawal` 테이블, `settlement_share.withdrawn_amount` 컬럼, 서버 보관 키 1개(v4의 세 번째 키), 화면 P-09, 규격 신설 제안 `WITHDRAW_*` 5개(§16.1 철회), 규격 v3의 수령 이후 단계 코드 4개(§16.4 폐기 후보).
- 리더가 코인을 외부 주소로 옮기는 것은 **지갑 앱에서 사용자 자유**이며 플랫폼 화면·API가 관여하지 않는다(P-20·결정 v2 §3.7).

---
## 12. verify — 공개 검증

**[v5] 이 장에는 API가 하나만 남았다.** 정산 검증 데이터(API-verify-01)는 **참여팀 전용**(로그인 필수)이고, 공개 공시는 **API-coin-01 `GET /coin/supply`로 통합**됐다(결정 v2 §9 — v4의 API-verify-02 삭제, 장 말미). 브라우저가 서버 표시값을 믿지 않고 **독립적으로 재계산**할 수 있도록 원자료를 전부 담는 목적은 v3·v4와 같다(PERF-07 재계산 ≤ 2초).

보장 범위는 정직하게 표기한다 — 잠긴 규칙의 사후 변조 불가·기록의 소급 수정 불가·계산의 결정론적 재현·참여팀의 독립 검증 경로이며, **입력 데이터(선택·매출)의 진실성은 보장하지 않는다.** 탈중앙을 주장하지도 않는다 — 정산 흐름은 운영자가 발의·실행한다.

**검증 대상은 불변식 4개다**(결정 v2 §3.8). **[v5]** 1번과 4번의 정의가 바뀌었고 두 항목의 담기는 곳이 API-coin-01로 옮겨졌다.

| # | 불변식 | 담기는 곳 |
|---|---|---|
| 1 | **[v5]** `token.totalSupply` = Σ`Minted`(시연용 지급의 합, 소각 없음 → 단조 증가) | API-coin-01 `invariants[0]` |
| 2 | `escrowOf(showId)` = Σ(purchase) − Σ(refund) − Σ(release) (+ 보증금 별도) | API-verify-01 `escrowReconciliation` |
| 3 | Σ`Released` = 잠긴 규칙 × 카운터 재계산 합 (dust 포함, 1원도 다르지 않아야 한다) | API-verify-01 `recalculationInput` + `releaseReconciliation` |
| 4 | **[v5]** `totalSupply` = Σ(전 지갑 잔액) + Σ(전 공연 `escrowOf` + 보증금) | API-coin-01 `invariants[3]` |

### API-verify-01 정산 검증 데이터 **[v5 변경 — 수령 이후 요약 삭제]**
`GET /api/v1/performances/{performanceId}/verification` · 권한: **PERFORMER(참여팀, 로그인 필수)** · 우선: P0 · 연관 화면: `V-01 정산 검증` · 연관 기능: `F-verify-01 정산 검증 데이터 조회` · `F-verify-03 정산 재계산 검증`

## 요구사항
- 컨트랙트 주소(`tokenAddress`·`splitterAddress`)·잠긴 규칙(원문 + 해시)·**팀별 리더 지갑 주소**·팀별 동의 tx·온체인 선택 카운터·**[v4] 에스크로 잔액**·팀별 산출액·`Released` 이벤트·release tx와 **재계산에 필요한 원자료**를 한 응답에 담는다.
- 재계산 입력은 `recalculationInput`으로 모아 준다 — 총 매출·환불액·순매출, 2단계 bp(`fixedRatioBp`·`selectionRatioBp`)와 팀별 `teamShareBp`, 팀별 온체인 카운터, 참여팀 수, 버림 규칙, dust 귀속 규칙(공연 생성 팀), `tokenDecimals=0`. **이 값들만으로 `shares`가 재현되어야 한다.**
- **대사 3종을 담는다** — ① `escrowReconciliation`(불변식 2) ② `releaseReconciliation`(불변식 3: `Released` 이벤트 합 vs 재계산 합) ③ `depositReconciliation`(보증금 납부·반환 tx). **[v5]** v4의 네 번째 요약(팀별 수령 이후 누적액)은 그 단계가 사라져 응답에서 삭제됐다 — 대신 `receiptSummary`로 **팀별 수령 여부·수령 시각**만 담는다. `release` 확정이 곧 수령이므로 이 값이 종단 정보다.
- 개인정보는 담지 않는다 — 관객·주문·티켓 식별자와 **관객 지갑 주소**를 노출하지 않고 팀 단위 집계만 준다. 팀 리더 지갑 주소는 정산 수령 주소라 노출한다(§0.7).
- 참여팀 전용이지만 재조회가 잦으므로 **60초 캐시**한다 [권](공연 단위 캐시). `DRAFT`·`PENDING_AGREEMENT`는 검증 대상이 아니다. 노드 장애 시 마지막 인덱싱 값과 `stale: true`.
- `onchainCounters[]` 각 항목에 `purchaseCount`(그 팀을 선택한 결제 건수, 주문 수 — `choiceCount`(티켓 수)와 단위가 다르며 `purchaseCount − refundCount = choiceCount`가 성립하지 않는다)·`refundCount`(환불 이력이 있는 주문 수, 주문 단위 — `COUNT(DISTINCT ticket_order_id)`, refund는 티켓 단위 행이므로 티켓 3장 중 2장 환불도 1)·`refundedAmount`(환불 금액 합)를 추가한다. `refundCount`·`refundedAmount`는 **`refund.status = COMPLETED`인 환불만** 센다(온체인 `escrow -= refundAmount`가 tx 확정분만 반영되므로). `choiceCount`는 온체인 선택 카운터로 티켓 수(Σ quantity)이며 환불 이력 주문의 표는 전량 제외한다. 컨트랙트 인터페이스 v1 §4.1의 `refund` 카운터 차감은 금액과 무관하므로, 특정 팀 주문에 소액 환불을 반복하면 선택 풀이 옮겨간다. `aggregate` 대사는 온체인과 같은 규칙이라 이를 잡지 못하며 **관측이 유일한 방어**다. 환불 건수가 많은데 환불 금액이 작으면 그 자체가 신호다. 값의 출처는 서버가 인덱싱한 `ticket_order`(팀 분해 키 `selected_team_id`)·payment·refund·`chain_job` 장부이며 프론트가 `getLogs`를 직접 호출하지 않는다. **[2026-09-09 추가 — B-5]**

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `performanceId` | path | integer(BIGINT) | Y | 공연 PK |

### Body
없음.

### 시스템 처리
1. 공연 존재·검증 대상 상태(`ON_SALE` 이상) 확인 → **참여팀 소속 확인** → 캐시(60초) 확인.
2. 상태 전이 없음(조회).
3. 외부 호출: 인덱싱된 온체인 이벤트·`escrowOf`·`choiceCountOf`·`rulesHashOf`·`agreedOf` view를 사용하고, 캐시 미스 시에만 노드를 조회한다(PERF-07).
4. 규칙 원문·해시·tx·집계·대사 결과를 합쳐 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "performanceId": 12,
    "performanceTitle": "합정 3밴드 합동공연",
    "performedAt": "2026-09-19T19:00:00+09:00",
    "settlementStatus": "RELEASED",
    "network": "kaia-kairos",
    "chainId": 1001,
    "contracts": {
      "tokenAddress": "0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736",
      "tokenSymbol": "YoYo",
      "tokenDecimals": 0,
      "revenueSplitter": "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
      "explorerBaseUrl": "https://kairos.kaiascan.io"
    },
    "lockedRule": {
      "rulesHash": "0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f",
      "raw": { "performanceId": 12, "fixedRatioBp": 6000, "selectionRatioBp": 4000, "teamShares": [{"teamId":7,"shareBp":5000},{"teamId":9,"shareBp":3000},{"teamId":11,"shareBp":2000}], "hostTeamId": 7 },
      "onchainRulesHash": "0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f",
      "hashMatched": true,
      "lockedAt": "2026-09-03T11:00:00+09:00",
      "startSaleTxHash": "0x8f2e1d0c9b8a70695847362514039281a0b1c2d3e4f5061728394a5b6c7d8e9f"
    },
    "agreements": [
      { "teamId": 7, "teamName": "블루노트", "walletAddress": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b", "onchainAgreed": true, "signerType": "USER", "txHash": "0x1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f901", "agreedAt": "2026-09-03T10:02:00+09:00" },
      { "teamId": 9, "teamName": "새벽세시", "walletAddress": "0x3c8a1f2b4d6e8091a2b3c4d5e6f708192a3b4c5d", "onchainAgreed": true, "signerType": "USER", "txHash": "0x2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90112", "agreedAt": "2026-09-03T10:20:00+09:00" },
      { "teamId": 11, "teamName": "노이즈캔슬", "walletAddress": "0x9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6f7081920", "onchainAgreed": true, "signerType": "USER", "txHash": "0x3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9011223", "agreedAt": "2026-09-03T10:41:00+09:00" }
    ],
    "onchainCounters": [
      { "teamId": 7, "teamIndex": 0, "choiceCount": 30, "purchaseCount": 28, "refundCount": 2, "refundedAmount": 50000 },
      { "teamId": 9, "teamIndex": 1, "choiceCount": 21, "purchaseCount": 20, "refundCount": 1, "refundedAmount": 25000 },
      { "teamId": 11, "teamIndex": 2, "choiceCount": 13, "purchaseCount": 13, "refundCount": 0, "refundedAmount": 0 }
    ],
    "recalculationInput": {
      "grossRevenueAmount": 1600000,
      "refundedAmount": 75000,
      "netRevenueAmount": 1525000,
      "distributableAmount": 1525000,
      "fixedRatioBp": 6000,
      "selectionRatioBp": 4000,
      "teamShares": [{"teamId":7,"shareBp":5000},{"teamId":9,"shareBp":3000},{"teamId":11,"shareBp":2000}],
      "participantCount": 3,
      "totalChoiceCount": 64,
      "roundingRule": "FLOOR_TO_INTEGER_KRW",
      "remainderRule": "ASSIGN_DUST_TO_HOST_TEAM",
      "hostTeamId": 7,
      "dustAmount": 4,
      "tokenDecimals": 0,
      "currency": "KRW"
    },
    "shares": [
      { "teamId": 7, "teamName": "블루노트", "fixedAmount": 457500, "choiceAmount": 285937, "dustAmount": 4, "totalAmount": 743441 },
      { "teamId": 9, "teamName": "새벽세시", "fixedAmount": 274500, "choiceAmount": 200156, "dustAmount": 0, "totalAmount": 474656 },
      { "teamId": 11, "teamName": "노이즈캔슬", "fixedAmount": 183000, "choiceAmount": 123903, "dustAmount": 0, "totalAmount": 306903 }
    ],
    "escrowReconciliation": {
      "purchasedTotal": 1600000,
      "refundedTotal": 75000,
      "releasedTotal": 1525000,
      "escrowBalanceOnchain": 0,
      "expectedEscrowBalance": 0,
      "matched": true,
      "note": "escrowOf(showId) = Σpurchase − Σrefund − Σrelease"
    },
    "releaseReconciliation": {
      "releasedEventTotal": 1525000,
      "recalculatedTotal": 1525000,
      "difference": 0,
      "matched": true,
      "releasedEvents": [
        { "teamWallet": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b", "amount": 743441 },
        { "teamWallet": "0x3c8a1f2b4d6e8091a2b3c4d5e6f708192a3b4c5d", "amount": 474656 },
        { "teamWallet": "0x9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6f7081920", "amount": 306903 }
      ]
    },
    "depositReconciliation": {
      "amount": 50000,
      "status": "RETURNED",
      "paidTxHash": "0x6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5",
      "returnTxHash": "0x8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7",
      "matched": true
    },
    "receiptSummary": [
      { "teamId": 7, "walletAddress": "0x7a3f9c1d2e4b5a6c8d0e1f2a3b4c5d6e7f809a1b", "receivedAmount": 743441, "received": true, "receivedAt": "2026-09-22T18:00:30+09:00" },
      { "teamId": 9, "walletAddress": "0x3c8a1f2b4d6e8091a2b3c4d5e6f708192a3b4c5d", "receivedAmount": 474656, "received": true, "receivedAt": "2026-09-22T18:00:30+09:00" },
      { "teamId": 11, "walletAddress": "0x9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6f7081920", "receivedAmount": 306903, "received": true, "receivedAt": "2026-09-22T18:00:30+09:00" }
    ],
    "releaseTx": {
      "txHash": "0x9c1a4b7e2d5f8039ab6c4e1d2f3a5b7c9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6",
      "explorerUrl": "https://kairos.kaiascan.io/tx/0x9c1a4b7e2d5f8039ab6c4e1d2f3a5b7c9e0d1f2a3b4c5d6e7f8091a2b3c4d5e6",
      "releasedAt": "2026-09-22T18:00:30+09:00"
    },
    "guarantees": {
      "guaranteed": ["잠긴 규칙의 사후 변조 불가", "기록의 소급 수정 불가", "분배 계산의 결정론적 재현", "참여팀의 독립 검증 경로", "결제·환불·분배가 모두 같은 원장(YoYo) 위에 있음"],
      "notGuaranteed": ["입력 데이터(선택·매출)의 진실성", "탈중앙 운영 — 정산 흐름은 운영자가 발의·실행한다"]
    },
    "simulationNotice": "테스트넷에서 플랫폼이 발행한 시연용 가상 원화 코인으로 정산했습니다. 실제 자금이 아닙니다.",
    "refreshedAt": "2026-09-22T18:12:00+09:00",
    "stale": false
  },
  "msg": ""
}
```

### 4xx/5xx
```json
{ "code": "PERFORMANCE_NOT_FOUND", "data": null, "msg": "공연을 찾을 수 없습니다." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 로그인하지 않고 검증 데이터를 조회 |
| 403 | `COMMON_FORBIDDEN` | 참여팀 소속이 아닌 회원의 조회 |
| 404 | `PERFORMANCE_NOT_FOUND` | 존재하지 않거나 아직 검증 대상이 아닌 공연(`DRAFT`·`PENDING_AGREEMENT`) |
| 429 | `COMMON_TOO_MANY_REQUESTS` | 호출 한도 초과 |
| 502 | `COMMON_EXTERNAL_SERVICE_ERROR` | 체인 인덱스·노드 모두 사용 불가 |

---

### 삭제된 API — §12 말미 기록

- **API-verify-02 (`GET /api/v1/public/reserve-proof`)** — **[v5 삭제 → API-coin-01로 통합]** 코인이 화폐 그 자체이므로 무엇에 고정됐는지를 증명하는 공시가 성립하지 않는다(결정 v2 §2.1·P-11). 대신 **발행량·에스크로·지갑 보유 합계와 불변식 4개 대사**를 공개하는 것이 V-02의 새 역할이며, 그 응답은 **`GET /api/v1/coin/supply`(API-coin-01)** 하나로 합쳐졌다. 공개 경로 `/public/reserve-proof`는 더 이상 존재하지 않는다(§0.1 공개 API 목록에서도 삭제).
- 함께 사라진 것: v4 응답의 예치 잔액·차액·1:1 성립 여부·예치 계정 표기 필드 전부, 화면 V-02의 "예치 대비" 위젯(발행량 위젯으로 개편).

---
## 13. admin — 관리자

관리자 기능은 최소화 상태를 유지한다. 실패한 온체인 작업은 관리자 수동 재처리 대신 **시스템 자동 재시도 + 결정적 실패 알림**으로 처리한다(REL-09).

**[v5] 관리자 P0는 4개다** — ① 이의제기 목록(API-admin-09) ② 이의제기 처리(API-admin-06) ③ 표시 환율 등록(API-coin-03) ④ **시연용 코인 지급·이력(API-coin-07·08)**. ③④는 화면 M-03 하나에 함께 놓인다(결정 v2 §10). 발행량 대사 경고 확인도 M-03에서 하지만 데이터는 공개 API(API-coin-01)를 그대로 쓰므로 별도 관리자 경로를 만들지 않았다. `admin` 도메인 전용 에러 코드는 여전히 없고 `COMMON_*`을 쓴다.

**[v5]** 관리자 P0 중 `coin` 접두를 쓰는 3개(API-coin-03·07·08)의 상세는 §8 `coin` 장에 있다 — 경로가 `/admin/*`이지만 도메인 코드는 `coin`이기 때문이다(결정 v2 §5).

| v3·v4 번호 | 경로 | 이름 | v4 처리 |
|---------|------|---------|---------|
| API-admin-01 | `GET /api/v1/admin/dashboard` | 관리자 요약 | §15 P1 — 운영 대시보드 화면(`M-01`) 자체를 P1로 미룸 |
| API-admin-02 | `GET /api/v1/admin/members` | 회원 목록 | §15 P1 |
| API-admin-03 | `PATCH /api/v1/admin/members/{memberId}/status` | 회원 상태 변경 | §15 P1. **[v4]** 정지 시 refresh token 전량 폐기 + `wallet.status=SUSPENDED` 전제만 기록 |
| API-admin-04 | `GET /api/v1/admin/performances` | 공연 목록(관리) | §15 P1 |
| API-admin-05 | `GET /api/v1/admin/settlements` | 정산 목록·실패 건 | §15 P1 — 실패 건은 자동 재시도 + 알림으로 대체 |
| API-admin-07 | `GET /api/v1/admin/operator-wallet` | 운영지갑 상태 | §15 P1. **[v5]** 서버 보관 키가 **2개(OPERATOR = fee payer · MINTER)** 로 줄었고, fee payer의 네이티브 잔액 감시가 새 관심사다(대납 실패 = 결제 중단) |
| API-admin-08 | `GET /api/v1/admin/audit-logs` | 감사 로그 | §15 P1 — **조회 화면만** P1이고 **적재는 MVP에서 그대로 한다**(SEC-11) |
| API-coin-05·06 | `GET/POST /api/v1/admin/coin/jobs…` | 온체인 작업 목록·재시도 | §15 P1 — §8 참고 |

**감사 로그 적재는 P1로 미루지 않는다.** **[v5]** 남기는 `action_type`은 `ADMIN_ACTION` / `OPERATOR_SIGN` / `MINT` / `RELEASE` / **`GRANT`** / `RATE_CHANGE` / `WALLET_LINK` / `STATUS_CHANGE` **8종**이다(결정 v2 §7). v4의 소각·유입·유출 3종은 삭제되고 `GRANT`(시연용 지급)가 신설됐다. `MINT`는 job 실행 기록, `GRANT`는 관리자 지급 요청 기록이다. 사용자 서명 tx는 `chain_job`(`signer_type=USER`)에 남고, 서버 키 서명은 `OPERATOR_SIGN`으로 남는다. 조회는 MVP에서 DB 직접 확인이다.

### API-admin-09 이의제기 목록
`GET /api/v1/admin/disputes` · 권한: ADMIN · 우선: P0 · 연관 화면: `M-02 이의제기 처리` · 연관 기능: `F-admin-09 이의제기 목록 조회`

## 요구사항
- 관리자가 처리 대기 중인 이의를 찾아 들어가는 진입점이다. 기본 정렬은 **미처리 우선, 오래된 순**(`status=OPEN` → `createdAt,asc`)이며 release 보류를 풀어야 하는 건이 위로 온다.
- 이의 본문·제출 팀·대상 공연·정산 상태·이의제기 마감 시각을 담아 목록에서 우선순위를 판단하게 한다. 관객 개인정보는 담지 않는다.
- **[v5]** `settlementStatus`의 종단은 `RELEASED`다. 요약에 `releaseHeldCount`(release가 보류된 정산 수)를 담는다.

## Request
### Headers
- `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `status` | query | string | N | `OPEN` / `RESOLVED` / `REJECTED`. 미지정 시 전체 |
| `performanceId` | query | integer | N | 특정 공연으로 좁히기 |
| `page`·`size`·`sort` | query | — | N | §0.2. `sort`는 `createdAt`/`disputeClosesAt`, 기본 `createdAt,asc`(`OPEN` 우선) |

### Body
없음.

### 시스템 처리
1. ADMIN 권한 확인. 2. 상태 전이 없음(조회). 3. 외부 호출 없음. 4. `dispute` + `settlement` + `performance` + `team` 조인 결과를 `items`/`pageInfo`로 반환.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "summary": { "openCount": 2, "releaseHeldCount": 1 },
    "items": [
      {
        "disputeId": 41,
        "performanceId": 12,
        "performanceTitle": "합정 3밴드 합동공연",
        "teamId": 11,
        "teamName": "노이즈캔슬",
        "status": "OPEN",
        "reason": "관객 선택 집계가 현장 카운트와 다릅니다.",
        "expectedAmount": 320000,
        "currency": "KRW",
        "settlementStatus": "DISPUTE_OPEN",
        "disputeClosesAt": "2026-09-22T18:00:00+09:00",
        "releaseHeld": true,
        "createdAt": "2026-09-21T09:12:00+09:00",
        "resolvedAt": null
      }
    ],
    "pageInfo": { "page": 0, "size": 20, "totalElements": 2, "hasNext": false }
  },
  "msg": ""
}
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `status`·`sort`, `size` 100 초과 |
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 403 | `COMMON_FORBIDDEN` | ADMIN이 아님 |

---

### API-admin-06 이의제기 처리
`PATCH /api/v1/admin/disputes/{disputeId}` · 권한: ADMIN · 우선: P0 · 연관 화면: `M-02 이의제기 처리` · 연관 기능: `F-admin-06 이의제기 처리`

## 요구사항
- 열린 이의를 `RESOLVED` 또는 `REJECTED`로 처리한다 [권] P-16. 처리 결과와 사유는 참여팀에게 공개된다.
- **`REJECTED`이면 release 보류가 풀려** 자동 스케줄이 재개된다. **[v6]** `RESOLVED`(이의 인정)이면 정산 잠금이 이미 온체인에 확정돼 재집계가 불가능하므로, 관리자는 ① 분배 결과를 그대로 두고 `release`를 진행하거나 ② **집계를 되돌릴 수 없다고 판정해 전액 환불을 결정**하고 정산을 `HALTED`로 전이하는(= 공연 취소와 같은 `halt` → 일괄 환불 → 보증금 반환, API-performance-12) 두 가지 중 하나를 택한다. **`AGGREGATED`로 되돌리는 경로는 없다** [권].
- 이미 처리된 이의는 다시 바꿀 수 없다(`COMMON_CONFLICT`). release가 이미 실행된 정산의 이의는 처리 대상이 아니다.
- 관리자 작업 감사 로그(`action_type=ADMIN_ACTION`)를 남긴다(SEC-11).

## Request
### Headers
- `Content-Type: application/json` · `Accept: application/json` · `Authorization: Bearer {accessToken}` · `Accept-Language`

### Path · Query
| 이름 | 위치 | 타입 | 필수 | 설명·제약 |
|------|------|------|:----:|-----------|
| `disputeId` | path | integer(BIGINT) | Y | 이의제기 PK |

### Body
| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|:----:|------|------|
| `status` | string | Y | `RESOLVED` / `REJECTED` | 처리 결과 |
| `adminComment` | string | Y | 10~1000자 | 처리 사유 — 참여팀에 공개 |

```json
{ "status": "REJECTED", "adminComment": "온체인 카운터와 서버 집계가 일치하며 재확인 결과 이상이 없어 기각합니다." }
```

### 시스템 처리
1. ADMIN 권한 확인 → 이의 존재·상태(`OPEN`)·해당 정산 상태 확인.
2. 상태 전이: `dispute` `OPEN` → `RESOLVED`/`REJECTED`. `REJECTED`이고 남은 열린 이의가 없으면 정산의 release 보류 해제.
3. 외부 호출 없음(release 실행은 스케줄러 또는 API-settlement-05).
4. `dispute` 갱신 + 참여팀 알림 + 감사 로그(`ADMIN_ACTION`).

## Response
### 200 OK
```json
{ "code": "SUCCESS", "data": { "disputeId": 41, "performanceId": 12, "teamId": 11, "status": "REJECTED", "releaseHeld": false, "resolvedAt": "2026-09-22T17:40:00+09:00" }, "msg": "이의제기를 처리했습니다." }
```

### 4xx
| status | code | 발생 조건 |
|--------|------|-----------|
| 400 | `COMMON_VALIDATION_FAILED` | 허용되지 않는 `status`, 사유 길이 위반 |
| 403 | `COMMON_FORBIDDEN` | ADMIN이 아님 |
| 404 | `COMMON_NOT_FOUND` | 존재하지 않는 `disputeId` |
| 409 | `COMMON_CONFLICT` | 이미 처리된 이의 |
| 409 | `SETTLEMENT_ALREADY_RELEASED` | 해당 정산이 이미 release 완료 |

---

## 14. recommendation — 추천 **[v7 신설]**

**[v7]** 콜드스타트 장르 매칭으로 로그인 회원 홈에 개인화 추천 섹션을 준다. 결번이던 §14를 이 도메인이 채운다(§0.11). 근거·전체 설계는 `docs/superpowers/specs/2026-09-22-recommendation-design.md`(이하 "추천 설계")이며, 이 절은 그중 1차(SQL 장르 매칭, 이번 주 P0) 범위만 API로 확정한다. 2차 LLM 태깅·3차 CTR 랭커는 같은 엔드포인트의 `basis` 값(`TAGGED`/`RANKED`)으로만 드러나고 별도 API를 추가하지 않는다(추천 설계 §7.2·§7.3).

### API-recommendation-01 맞춤 추천 목록
`GET /api/v1/recommendations/performances` · 권한: 회원 · 우선: P0 · 연관 화면: `A-01 홈·공연 탐색(섹션 ④ 맞춤 추천)` · 연관 기능: `F-recommendation-02 맞춤 추천 조회`

## 요구사항
- 후보는 `ON_SALE` 공연 중 회원이 `PAID` 주문한 공연과 **공연 시작 시각이 지난 공연(`performanceAt > now`가 아닌 공연)을 제외**한 것이다(`RecommendationCandidateRepository.java:37` — 상태 전이 스케줄러가 아직 못 돌린 틈을 보정). 회원의 선호 장르(`member_preferred_genre`)와 공연 장르(생성 팀 + `performance_participant.status=REGISTERED`**이면서 지갑 등록을 수락한**(판정은 `wallet_address` 유무 — `accepted_at` 은 표시용) 참여 팀 장르의 합집합 — 초대만 받고 미수락인 팀은 제외한다(카드의 `teamNames`와 같은 팀 집합을 보이려는 의도, MR !192 리뷰). **[2차]** LLM 태그 장르 `performance.tags.genres`까지 합집합)의 **겹침 수 내림차순 → 공연일 오름차순**으로 정렬해 **최대 6건**을 준다(추천 설계 §7.1).
- 선호 장르가 0개이거나 겹침 결과가 0건이면 **폴백**(곧 시작하는 `ON_SALE` 공연 순)으로 전환하고 `data.basis`를 `FALLBACK`으로 내린다. 겹침 결과가 6건보다 적으면 부족분을 폴백으로 채우되 `basis`는 `GENRE`를 유지하고, 폴백으로 채운 항목은 `matchedGenres`가 **빈 배열**이다(D-R06 — 폴백을 `GENRE`로 위장하지 않는다). **후보가 0건이면 `items: []`·`basis: FALLBACK`을 내리고 노출 로그는 기록하지 않는다**(기록할 카드가 없으므로 `sessionId`는 그대로 발급).
- 팀 장르만으로 겹친 응답은 `basis=GENRE`, 태그 장르 덕에 겹친 항목이 하나라도 있으면 `basis=TAGGED`, CTR 랭커가 재정렬했으면 `basis=RANKED`다(2차·3차, 추천 설계 §7.2·§7.3 — 이번 주 범위 밖이지만 필드는 1차부터 고정한다). `reason`(추천 사유 한 줄)은 2차 전엔 **항상 `null`**이며, 전역 `non_null` 직렬화(§0.1)라 값이 없을 때는 응답에 키 자체가 없을 수 있다.
- **`data.basis`는 응답 단위 표시다.** 노출 로그(`recommendation_log.basis`)는 **카드 단위**로 따로 판정한다 — `matchedGenres`가 빈 카드는 `FALLBACK`(ERD v6 `recommendation_log`). 응답 basis를 로그에 복사하지 않는다(D-R06, MR !186 리뷰).
- 노출된 최대 6건은 응답을 만든 뒤 **비동기로** `recommendation_log`에 기록한다(요청 지연에 영향 없음). 클릭(전환) 수집 API는 따로 두지 않고 `ticket_order` 조인으로 평가한다(D-R07).
- 이 API는 Redis 캐시를 쓰지 않는다(§0.12에 이 도메인의 키가 없다 — D-R13). 조회 API p95 500ms 목표(PERF-01) 대상이며, 예산은 선호 조회 1ms + 후보 조인 5~10ms + 로그 INSERT 비동기 0ms로 합계 약 20ms다(추천 설계 §9).
- `GUEST`는 401이다. Query 파라미터는 없다 — 회원마다 결과가 다르므로 필터·페이지네이션을 두지 않는다 [팀].

## Request
### Headers
- `Accept: application/json`
- `Authorization: Bearer {accessToken}`
- `Accept-Language: en` / `ko`

### Path · Query
없음.

### Body
없음.

### 시스템 처리
1. access token에서 `memberId` 추출 → `member_preferred_genre` 조회.
2. 상태 전이 없음(조회). 요청 1건 = `sessionId`(UUID) 1개 발급.
3. 외부 호출 없음 — **[2차]** `performance.tags`는 `ml_job(TAG)`가 미리 채워둔 값을 읽기만 하며, 이 요청 경로에서 ML 서버를 호출하지 않는다(추천 설계 §8 경계).
4. `ON_SALE` 공연 − 회원 `PAID` 주문 공연 후보에서 겹침 수·공연일로 정렬해 상위 6건 구성 → 6건 미만이면 폴백으로 채움 → 응답 완성 후 `recommendation_log`에 노출 6건을 비동기 기록.

## Response
### 200 OK
```json
{
  "code": "SUCCESS",
  "data": {
    "basis": "GENRE",
    "sessionId": "3f9a2c1e-7b3d-4e2a-9c1a-8d6b5a4f3e2d",
    "rate": { "currency": "USD", "rate": 1350.0, "asOf": "2026-09-02T09:00:00+09:00" },
    "items": [
      {
        "performanceId": 12,
        "title": "합정 3밴드 합동공연",
        "posterImageUrl": "https://cdn.b204.ssafy.io/p/12.png",
        "ticketImageUrl": "https://cdn.b204.ssafy.io/t/12.png",
        "venueName": "합정 언플러그드",
        "startAt": "2026-09-19T19:00:00+09:00",
        "status": "ON_SALE",
        "minPriceAmount": 25000,
        "currency": "KRW",
        "soldOut": false,
        "teamNames": ["블루노트", "새벽세시", "노이즈캔슬"],
        "matchedGenres": ["INDIE"]
      }
    ]
  },
  "msg": ""
}
```

`items[]`는 API-performance-02 목록 항목과 같은 필드에 `matchedGenres`·`reason` 2개를 더한 형태다. 금액은 API-performance-02와 같은 **§0.5 축약형**(`data.rate` + 항목 `minPriceAmount`)이다 — `data.rate`를 이 응답에 직접 담는다. 같은 화면(A-01)의 공연 목록 응답에서 환율을 빌려 쓰면 목록이 실패했을 때 추천 카드만 환산액이 빠진다. `reason`은 2차 전엔 항상 `null`이며 §0.1 `non_null` 직렬화 규칙에 따라 키 자체가 내려가지 않을 수 있다.

### 4xx
```json
{ "code": "AUTH_TOKEN_EXPIRED", "data": null, "msg": "로그인이 만료되었습니다. 다시 로그인해 주세요." }
```

| status | code | 발생 조건 |
|--------|------|-----------|
| 401 | `COMMON_UNAUTHORIZED` | 인증 헤더 없음 |
| 401 | `AUTH_TOKEN_EXPIRED` | access token 만료 → API-member-03으로 재발급 |
| 401 | `AUTH_TOKEN_INVALID` | 서명 불일치·위조 토큰(§0), 또는 토큰은 유효하나 회원 행이 없음(`RecommendationService.java:88`). 즉시 로그아웃 |

---

## 15. P1·P2 예약 경로

MVP 이후 확장이다. **경로·메서드·이름만 예약**하고 상세는 v1.1 이후에 채운다. 결정 문서 v2 §9 말미 "예약 경로" 절과 §11 P1/P2 목록을 그대로 옮겼다.

### 15.1 P1 예약 경로 — 본문 상세 없음 (10개)

| 번호 | 메서드 | 경로 | 이름 | actor | 화면 | v5 비고 |
|------|--------|------|------|-------|------|---------|
| API-coin-05 | GET | `/api/v1/admin/coin/jobs` | 온체인 작업 목록 | ADMIN | `M-02`(P1) | 개별 작업은 API-chain-01로 폴링 |
| API-coin-06 | POST | `/api/v1/admin/coin/jobs/{jobId}/retry` | 작업 재시도 | ADMIN | `M-02`(P1) | 자동 재시도(3회 + 연장)로 대체. **USER job은 재시도 불가** |
| API-admin-01 | GET | `/api/v1/admin/dashboard` | 관리자 요약 | ADMIN | `M-01`(P1) | 운영 대시보드 화면 P1 |
| API-admin-02 | GET | `/api/v1/admin/members` | 회원 목록 | ADMIN | `M-04`(P1) | 회원 관리 화면 P1. **[v5]** 목록에서 지급 대상 회원을 고르는 UX는 M-03이 자체 검색으로 처리한다(API-coin-07은 `memberId`·`address` 직접 입력) |
| API-admin-03 | PATCH | `/api/v1/admin/members/{memberId}/status` | 회원 상태 변경 | ADMIN | `M-04`(P1) | 정지 시 refresh token 전량 폐기 + `wallet.status=SUSPENDED` |
| API-admin-04 | GET | `/api/v1/admin/performances` | 공연 목록(관리) | ADMIN | `M-04`(P1) | 공연 관리 화면 P1 |
| API-admin-05 | GET | `/api/v1/admin/settlements` | 정산 목록·실패 건 | ADMIN | `M-02`(P1) | 실패 건은 자동 재시도 + 알림으로 대체 |
| API-admin-07 | GET | `/api/v1/admin/operator-wallet` | 운영 지갑 상태 | ADMIN | `M-05`(P1) | **[v5]** 감시 대상이 **OPERATOR(fee payer)·MINTER 2개 지갑**으로 줄었다. fee payer의 네이티브 잔액이 마르면 사용자 서명 결제가 전부 멈추므로 P1에서 알림 임계값을 함께 정의한다 |
| API-admin-08 | GET | `/api/v1/admin/audit-logs` | 감사 로그 조회 | ADMIN | `M-05`(P1) | **조회만 P1. 적재는 MVP에서 그대로 한다**(SEC-11) |
| (신설 제안) | POST | `/api/v1/wallets/me/replace` | 지갑 교체(잔액 0 확인 후) | 회원 | `C-05`(P1) | 미결 안건 14 — MVP는 관리자 DB 처리. §16.2 경로 후보. **[v5]** 교체해도 기본 지급을 다시 하지 않는다(멱등키가 회원 단위, §0.8) |

### 15.2 본문 상세는 있으나 우선순위가 P1인 API (3개) **[v6]**

| 번호 | 경로 | 우선 | 근거 |
|------|------|------|------|
| API-member-02 | `POST /api/v1/auth/login` | P1 | Web3Auth 단일 동결(결정 v1 §14-18) |
| API-member-08 | `POST /api/v1/auth/signup` | P1 | 동상 |
| API-coin-04 | `GET /api/v1/coin/config` | P1 | 프론트 환경변수 하드코딩(결정 v1 §14-17) |

> **[2026-09-24]** API-webauthn-01~04(§7.W)도 P1이다 — 스위치 `STEP_UP_ENABLED`가 기본 off라 MVP 결제·정산 경로에 들지 않는다. §17 P0 검수표는 바뀌지 않는다.
>
> **[v6]** API-wallet-03·04는 지갑 등록을 로그인에서 분리하면서 **P0로 승격**돼 이 표에서 빠졌다(결정 v2 §14-35). API-transfer-01~04는 양도 도메인이 삭제돼 경로 자체가 없어졌다(§14-34).

### 15.3 P1 기능 경로 (결정 v2 §11 P1 대기 항목)

| 제안 경로 | 메서드 | 필요한 곳 | 비고 |
|-----------|--------|-----------|------|
| `/api/v1/orders/{orderId}/payment/permit` | POST | **ERC20Permit 1-서명 결제** | `purchaseWithPermit(..., deadline, v, r, s)`용. `approve` 서명을 없애 결제가 1회 서명이 된다(미결 안건 6). 결정 v2 §9 예약 경로. **[v5]** 여유 시간 사용 순서 2순위(결정 v2 §13) |
| `/api/v1/performances/{performanceId}/deposit/forfeit` | POST | **보증금 몰수** | `forfeitDeposit(showId)` 운영자 tx(P-21). MVP는 반환만 |
| `/api/v1/tickets/{ticketId}/exchanges` · `…/{exchangeId}` | POST·GET | 티켓 교환 | v3 §16에서 이월. 코드 `EXCHANGE_*`는 규격 v3 §3.16에 이미 존재 |
| `/api/v1/tickets/{ticketId}/wallet-pass` | POST | 구글 월렛 패스 | v3 §16에서 이월. RotatingBarcode로 동적 QR과 양립 |
| `/api/v1/members/me/attendances` | GET | 관람 기록 | v3 §16에서 이월 |
| `/api/v1/tickets/{ticketId}/photo-ticket` | GET | 포토 티켓 데이터 | v3 §16에서 이월 |
| `/api/v1/performances/{performanceId}/settlement/disputes` | GET | 공연자용 이의제기 목록 | 현재는 API-settlement-01 응답의 `disputes` 배열로 충분하다 |
| `/api/v1/coin/rates/history` | GET | 표시 환율 이력 | M-03 화면의 "환율 이력". 현재는 관리자가 DB로 확인한다(§16.2) |

**[v5] 이 표에서 사라진 2줄** — v4의 관객 잔액 유출 경로 2개(`/withdrawals`·`/withdrawals/me`)와 유입 취소 경로 1개는 **P1에서도 만들지 않는다.** 코인이 곧 돈인 세계에서 플랫폼이 제공할 출구가 없기 때문이다(P-20·결정 v2 §3.7). 외부 주소로 옮기는 것은 사용자가 지갑 앱에서 직접 한다.

### 15.4 P2 — 경로를 만들지 않는다

외국인 자국 코인 교환(`tUSDC`·`YoYoExchange` 컨트랙트, DEX 연동), **`ExternalIssuer`(인가 발행사 코인·CBDC 어댑터)**, 외국인 팀 정산, 외부 지갑 교체 화면, NFT 티켓·유료 재판매·NFC·애플 월렛·AI 기능은 **경로를 예약하지 않는다.** 요구사항 명세서 v5 §10 "확장 범위"에만 나열한다(결정 v2 §11 말미).

`chain_job.issuer_type`의 `EXTERNAL`, `Member.auth_provider`의 `LOCAL`은 **enum 예약값**으로만 두고 API가 받지 않는다(전달 시 `COMMON_VALIDATION_FAILED`). **[v5]** v4에 있던 유입 수단·유출 종류 enum 예약값들은 해당 테이블이 삭제돼 함께 사라졌다.

**[v5] 외국인 관객의 자국 코인 → YoYo 교환은 플랫폼 밖에서 이미 끝났다고 가정한다**(결정 v2 §0·§12.2-1·미결 안건 32). 여행 전 환전과 같은 취급이며, MVP에는 그 화면도 API도 없다.

### 15.5 recommendation 확장 — 이름만 예약 (P2) **[v7]**

| 번호 | 메서드 | 경로(가안) | 이름 | 비고 |
|------|--------|-----------|------|------|
| API-recommendation-02 | GET | `/api/v1/performances/{performanceId}/similar` | 비슷한 공연(임베딩) | `A-02` 하단. 공연 문서 임베딩 코사인 유사도로 분위기·성격이 비슷한 공연을 보여준다. 홈 추천(API-recommendation-01)과는 별개로, 장르 매칭이 아니라 임베딩만 쓴다. 이번 주 범위 밖 — **P2 예약**(추천 설계 §7.2·§11) |

**추천 조회 호출 한도(예약)** — API-recommendation-01은 §0.9 호출 제한 대상이 **아니다**(그래서 §14 오류 표에 429가 없다). 인증 필수라 외부 남용에는 유효한 토큰이 필요하고, 자체 클라이언트의 창 포커스 재조회는 화면 v8 A-01에서 막았다. **노출 로그(`recommendation_log`) 적재량이 문제가 되면 회원당 한도를 §0.9에 추가한다.**

---
## 16. 규격 v5 신설 제안

본문 작성 중 **규격 v3 §3에 없어서(또는 의미가 달라져서) 기존 코드로 대체한 코드**와 **결정 문서 v2 §9에 없어서 예약만 한 경로**, **판단이 필요한 지점**, **v5에서 쓰이지 않게 된 기존 코드**를 모았다. 규격 §2 "문서에 없는 코드는 배포하지 않는다"에 따라 **본문에서는 하나도 쓰지 않았다.** 결정 문서 v2 §15 공통 규칙 ⑧에 따른 목록이며 팀 검토(9/3) 안건이다.

### 16.1 에러 코드 후보 (신설·재정의)

**결정 문서 v2 §15 ⑧·§9가 지목한 3개**

| 제안 코드 | status | 필요한 곳 | 본문 대체 코드 | 사유 |
|-----------|--------|-----------|-----------|------|
| `PAYMENT_INSUFFICIENT_BALANCE` | 409 | API-payment-01·02, API-performance-13 | `COMMON_CONFLICT` | **재정의 제안.** 이름은 규격 v3에 이미 있지만 기본 `msg`가 지갑이 아닌 다른 잔액을 전제한다. v5에서는 **지갑 YoYo 잔액 부족**이고 화면 분기가 "안내만(늘리는 버튼 없음)"이라 문구를 함께 고쳐야 쓸 수 있다. 그래서 본문은 `COMMON_CONFLICT`로 대체했다 |
| `COIN_GRANT_LIMIT_EXCEEDED` | 400 | API-coin-07 | `COMMON_VALIDATION_FAILED` | 1회 최대 1,000,000 YoYo(P-19) 위반은 관리자 화면이 "금액을 조정하세요"로 분기해야 한다. 일반 검증 실패와 문구가 다르다 |
| `COIN_SUPPLY_MISMATCH` | 409 | API-coin-01, API-coin-07, API-settlement-05 | `COIN_RESERVE_MISMATCH` | **개명 제안**(P-11). 대사 대상이 예치 대비에서 **발행량 대비 지갑+에스크로 합계**(불변식 4)로 바뀌었으므로 이름이 실제 검사를 가리키지 않는다. 개명 전까지 본문은 기존 이름을 쓴다 |

**v4에서 승계 — 지갑·인증 (7개)**

| 제안 코드 | status | 필요한 곳 | 본문 대체 코드 | 사유 |
|-----------|--------|-----------|-----------|------|
| `WALLET_CHALLENGE_EXPIRED` | 409 | **[v6]** API-wallet-04 `POST /wallets`(**P0**) | `COMMON_CONFLICT` | 챌린지 5분 만료·재사용은 "다시 시작하세요"로 유도해야 한다. **지갑 등록이 MVP 필수 경로가 되면서 제안 우선순위가 올라갔다** |
| `WALLET_SIGNATURE_INVALID` | 400 | **[v6]** API-wallet-04 `POST /wallets`(**P0**) | `COMMON_VALIDATION_FAILED` | `ecrecover` 복구 주소 불일치는 다른 지갑으로 서명한 경우가 많아 "선택한 계정을 확인하세요" 안내가 필요하다. **MVP 필수 경로로 승격** |
| `WALLET_ALREADY_LINKED` | 409 | **[v6]** API-wallet-04 `POST /wallets`(**P0**) | `COMMON_CONFLICT` | "이미 지갑이 있음"과 "이 주소가 남의 것"을 구분해야 한다. 후자는 보안 로깅 대상. **지갑 등록이 회원당 1회라는 제약을 표현하는 코드이므로 MVP 필수 경로로 승격** |
| `WALLET_NOT_LINKED` | 409 | API-team-01, API-performance-01·07·08, API-ticket-01, **API-coin-07** | `WALLET_NOT_FOUND`(404) | **6개 API가 같은 선행 조건을 검사한다.** 404는 "먼저 연결하세요"라는 흐름 지시를 담지 못한다 |
| `WALLET_BALANCE_INSUFFICIENT` | 409 | API-performance-13 | `COMMON_CONFLICT` | 보증금 잔액 부족과 티켓 결제 잔액 부족의 화면 문구가 다르다(전자는 리더, 후자는 관객). `PAYMENT_*`와 분리하는 안 |
| `AUTH_WEB3AUTH_TOKEN_INVALID` | 401 | API-member-01 | `AUTH_TOKEN_INVALID` | 우리 access token 위조와 **Web3Auth idToken 검증 실패**는 클라이언트 동작이 정반대다 — 후자는 로그아웃이 아니라 "다시 로그인" 재시도다 |
| `AUTH_WEB3AUTH_ADDRESS_MISMATCH` | 409 | API-member-01 | `COMMON_CONFLICT` | 같은 소셜 계정인데 주소가 달라진 경우(verifier 교체). 관리자 확인이 필요한 상황이라 별도 알림 대상 |

**v5 신설 — 수수료 대납·서명 RLP (2개)**

| 제안 코드 | status | 필요한 곳 | 본문 대체 코드 | 사유 |
|-----------|--------|-----------|-----------|------|
| `PAYMENT_SIGNED_TX_INVALID` | 400 | API-payment-03, API-performance-14, API-rule-05 | `COMMON_VALIDATION_FAILED` | **[v5] `senderSignedRlp` 디코드 실패·발신자 복구 실패**는 서명 SDK 버전 문제일 때가 많아 "지갑을 최신으로 갱신하세요"라는 전용 안내가 필요하다. 일반 형식 오류와 원인이 다르다 |
| `CHAIN_FEE_PAYER_INSUFFICIENT` | 500 | API-payment-03, API-performance-14, API-rule-05 | `CHAIN_GAS_INSUFFICIENT` | **[v5] 운영지갑(fee payer) 네이티브 잔액 고갈**은 사용자 서명 tx 전부를 멈추는 단일 장애점이다. 기존 코드는 "운영지갑 가스 부족"이라 의미가 겹치지만, 대납 실패는 **사용자 흐름 중단**이라 알림 경로·임계값을 따로 두는 편이 낫다(API-admin-07 P1과 함께 결정) |

**v4에서 승계 — 결제·보증금 (5개)**

| 제안 코드 | status | 필요한 곳 | 본문 대체 코드 | 사유 |
|-----------|--------|-----------|-----------|------|
| `PAYMENT_TX_MISMATCH` | 409 | API-payment-03, API-performance-14, API-rule-05 | `PAYMENT_AMOUNT_MISMATCH` | **가장 필요한 코드.** receipt·이벤트 검증 실패는 금액 불일치만이 아니라 `to`·`from`·`event`·`orderRef` 불일치를 포함한다. §0.4 검증 항목 전부를 담을 코드가 없어 금액 코드를 빌려 쓰고 있다 |
| `PAYMENT_SIGNATURE_REJECTED` | 409 | API-payment-03, API-performance-14, API-rule-05 | (호출 안 함 / `COMMON_CONFLICT`) | 사용자가 지갑 팝업을 닫은 상황. 지금은 "호출하지 않음"과 `abandoned` 플래그로 표현한다 |
| `PAYMENT_TX_NOT_FOUND` | 404 | API-payment-03, API-performance-14, API-rule-05 | `COMMON_NOT_FOUND` | **[v5]** 대납 전송 후 receipt를 끝까지 찾지 못한 경우(체인 재조직·노드 불일치). "네트워크를 확인하세요" 안내로 분기 |
| `PAYMENT_ALLOWANCE_INSUFFICIENT` | 409 | API-payment-03 | `PAYMENT_AMOUNT_MISMATCH` | `purchase`가 allowance 부족으로 revert된 경우. "승인을 먼저 해 주세요"로 `approve` 단계로 되돌려야 한다 |
| `PERFORMANCE_DEPOSIT_REQUIRED` | 409 | API-rule-01, API-rule-04 | `PERFORMANCE_INVALID_STATUS` | 보증금 미납은 "보증금을 납부하세요"라는 명확한 다음 행동이 있는데 일반 상태 오류로 묻힌다 |
| `PERFORMANCE_DEPOSIT_ALREADY_PAID` | 409 | API-performance-13·14 | `COMMON_CONFLICT` | 보증금 중복 납부 시도(새로고침·이중 서명)를 일반 충돌과 구분 |

**v3에서 이월 (8개)**

| 제안 코드 | status | 필요한 곳 | 본문 대체 | 사유 |
|-----------|--------|-----------|-----------|------|
| `COIN_RATE_NOT_FOUND` | 404 | API-coin-02 | (빈 배열 200) | 지금은 환율 미등록을 오류로 보지 않는다. M-03에서만 "미등록" 경고가 필요하면 이 코드를 쓴다 |
| `COMMON_IDEMPOTENCY_KEY_CONFLICT` | 409 | 멱등키 필수 **6개** API | `COMMON_CONFLICT` | 같은 키·다른 본문은 클라이언트 버그 신호라 분리 로깅·알림이 낫다 |
| `SETTLEMENT_DISPUTE_CLOSED` | 409 | API-settlement-04 | `COMMON_CONFLICT` | `SETTLEMENT_DISPUTE_PERIOD`는 "아직 기간 중"이라 정반대 의미다 |
| `SETTLEMENT_DISPUTE_ALREADY_OPEN` | 409 | API-settlement-04 | `COMMON_CONFLICT` | 팀당 열린 이의 1건 규칙을 코드로 표현할 수단이 없다 |
| `PERFORMANCE_PARTICIPANT_LIMIT_EXCEEDED` | 400 | API-performance-07 | `COMMON_VALIDATION_FAILED` | 참여팀 상한(8팀) 안내 |
| `ENTRY_LINK_EXPIRED` | 403 | API-entry-01·02 | `ENTRY_SCANNER_NOT_AUTHORIZED` | 링크 **만료**와 **애초에 권한 없음**을 구분해야 한다 |

**합계: 신설·재정의 후보 23개** (**[v6]** v5의 25개에서 양도 계열 **2개를 철회**했다. v4 34개 → v5 25개 → v6 23개).

**[v5] 철회한 신설 제안 13개**

| 철회 대상 | 개수 | 사유 |
|---|---:|---|
| `CHARGE_*`(한도·수단·완료·만료·거절·미존재) | 6 | 코인을 사들이는 도메인 자체가 삭제됐다(결정 v2 §5 — "규격 신설 제안 철회") |
| `WITHDRAW_*`(대상 없음·등록 안 됨·이미 요청·전송 실패·최소 금액) | 5 | 수령 이후 단계 도메인이 삭제됐다(결정 v2 §5·미결 안건 13 폐기) |
| `PAYMENT_ACCOUNT_HOLDER_MISMATCH`·`PAYMENT_ACCOUNT_NOT_FOUND` | 2 | 예금주 검증 대상(API-team-07)이 삭제됐다. SEC-13의 해당 항목도 함께 사라진다 |

**[v6] 철회한 신설 제안 2개**

| 철회 대상 | 개수 | 사유 |
|---|---:|---|
| `TICKET_TRANSFER_PENDING` · `TRANSFER_CHOICE_TEAM_REQUIRED` | 2 | 양도 도메인이 v6에서 삭제되어 **발생 경로가 0**이 됐다(결정 v2 §14-34) |

**[v6] 규격 문서에 남아 있으나 v6에서 쓰지 않는 코드** — 규격 `01_API_공통_응답_규격.md` §3.12 `TRANSFER_*` 6코드(`TRANSFER_LINK_NOT_FOUND` · `TRANSFER_LINK_EXPIRED` · `TRANSFER_LINK_ALREADY_USED` · `TRANSFER_SELF_NOT_ALLOWED` · `TRANSFER_NOT_ALLOWED` · `TRANSFER_ALREADY_COMPLETED`)는 **v6에 발생 경로가 없다. 사용하지 않는다.** 규격 원본은 외부에서 받은 기준선이므로 고치지 않고 여기에 기록만 한다(결정 v2 §14-34). 이름이 겹치는 `REFUND_TRANSFER_FAILED`(환불 tx 최종 실패)는 양도와 무관하며 **그대로 쓴다**.

### 16.2 경로 후보

| 제안 경로 | 메서드 | 필요한 곳 | 사유 |
|-----------|--------|-----------|------|
| `/api/v1/wallets/me/replace` | POST | 지갑 교체 | 미결 안건 14 — MVP는 관리자 DB 처리. 잔액 0 확인 → 챌린지 → 교체. §15.1에 P1로 예약 |
| `/api/v1/wallets/me/challenge` | POST | 챌린지 경로 일관성 | 현재 `POST /wallets/challenge`(결정 문서 그대로)인데 조회 지갑 API는 `/wallets/me/*`다. 결정 문서 경로를 **글자 단위로 지켰지만** 규격 v5에서 `/wallets/me/challenge`로 통일하는 안을 올린다. **[v6]** 등록은 `POST /api/v1/wallets`(컬렉션 생성)로 확정됐으므로 `…/verify` 통일안은 함께 철회한다 |
| `/api/v1/orders/{orderId}/payment/prepare` | POST | 결제 서명 파라미터 재발급 | API-payment-01(시작)과 API-payment-02(조회)가 `signRequests`를 겸한다. §0.4의 다른 흐름(보증금·동의)이 모두 `…/prepare`인데 결제만 예외라 패턴이 어긋난다. 결정 문서 v2 §9 인벤토리에 없어 만들지 않았다 |
| `/api/v1/coin/rates/history` | GET | 표시 환율 이력 | M-03 화면의 "환율 이력"에 필요하다. 현재는 관리자가 DB로 확인한다 |
| `/api/v1/admin/coin/supply/recheck` | POST | **[v5]** 발행량 즉시 재대사 | 불일치 알림을 받은 관리자가 mint·release 중단을 풀기 전에 강제 재조회하는 경로. 현재는 1분 캐시 만료를 기다린다. v4의 예치 대비 재대사 경로를 대체하는 이름이다 |
| `/api/v1/admin/coin/grants/{jobId}` | GET | **[v5]** 지급 단건 조회 | API-coin-08은 목록이고 단건은 API-chain-01(`jobId` 폴링)로 본다. M-03이 지급 상세 모달을 만들면 이 경로가 필요하다 |
| `/api/v1/admin/chain/jobs` · `…/{jobId}/retry` | GET·POST | 관리자 체인 작업 | v3 §17.2에서 이월. API-coin-05·06(P1)과 중복이라 v1.1에서 하나로 정리해야 한다 |

### 16.3 판단이 필요한 지점 (팀 검토 안건)

| # | 내용 | 이 문서의 처리 |
|---|------|----------------|
| 1 | **`signed-tx` 3개 API의 이름이 "tx 해시 보고"인데 실제 본문은 `senderSignedRlp`다** — 수수료 대납을 채택해 클라이언트가 tx를 보내지 않으므로 보고 대상이 해시가 아니다(결정 v1 §14-4·v2 §9) | **번호·경로·이름을 결정 문서 인벤토리 그대로 유지**하고 본문에서 `{kind, senderSignedRlp}`로 바로잡았다(API-payment-03, API-performance-14, API-rule-05). 이름은 규격 v5에서 **"서명 tx 보고"** 로 고치는 안을 올린다. 뒤집으면 세 절의 제목과 §17 검수표 3행을 함께 고친다 |
| 2 | **잔액 부족을 4xx로 알릴 때 부족액을 어디에 담을지** — §0.1이 "실패 시 `data`는 예외 없이 `null`"이라 부족액을 구조화해 내릴 자리가 없다 | **`msg` 문장에만 담았다**(API-payment-01). 화면이 숫자를 다시 필요로 하면 API-payment-02(성공 응답의 `shortfall`)나 API-wallet-01을 호출한다. 대안: 규격에 "실패 응답 `data`에 힌트 객체 허용" 예외를 만드는 것 — 규격 §1의 3필드 고정 원칙을 흔들어 채택하지 않았다 |
| 3 | **API-coin-07의 메서드가 `PUT`인데 리소스 생성에 가깝다** — 결정 문서 v2 §9는 `PUT /admin/coin/grants`로 적었다 | **인벤토리 표기를 글자 단위로 따랐다.** 멱등키가 필수라 `PUT`의 멱등성과 어긋나지는 않는다. REST 관례로는 `POST /admin/coin/grants`가 맞고, 규격 v5에서 정정하려면 결정 문서 §9의 한 줄을 함께 고쳐야 한다 |
| 4 | **기본 지급이 실패한 회원의 복구 경로** — `MINT` job이 `FAILED`면 회원은 잔액 0으로 들어온다 | **관리자 지급(API-coin-07)으로 복구**한다고 확정했다. 자동 재시도는 OPERATOR job 규칙대로 3회 + 연장이며, 그마저 실패하면 M-03에서 수동 지급이다. 대안: API-member-01 재호출 시 "미확정·실패 job이 있으면 재발행" — 멱등키가 회원 단위라 같은 `grantRef`로 재시도하게 되므로 job 재생성 로직을 따로 만들어야 해서 채택하지 않았다 |
| 5 | **`display` 객체 필드명** — 결정 문서 §9는 `display: {currency, amount, rate, rateAt}`, 작업 지시는 `{currency, approx, rate, asOf}`다 | v4와 같이 **`approx`·`asOf`를 채택**했다(§0.5). `amount`는 같은 객체의 원본 금액 키와 충돌한다. 뒤집으면 본문의 `display` 예시 전부(약 25곳)를 함께 고친다 |
| 6 | **`settlement_share` 금액 필드명** — v3의 `equalAmount`는 2단계 규칙에서 "균등"이 아니다 | v4에서 **`fixedAmount`로 정정**했고 v5도 그대로다(API-settlement-01·07, API-verify-01). ERD v4의 논리명도 같아야 한다 |
| 7 | **비동기 예시 상태값** — 규격 v3 §1의 비동기 예시가 `"status": "IN_PROGRESS"`인데 실제 enum은 `PENDING`/`SUBMITTED`/`CONFIRMED`/`FAILED`다 | v3·v4에서 이월. v5도 enum을 우선했다. 규격 v5에서 예시를 고쳐야 한다 |
| 8 | **`TICKET_PURCHASE_LIMIT_EXCEEDED` 기본 문구** — 규격 v3는 "1인당 최대 2장"인데 정책은 4매다 | 이월. 본문은 4매 기준이며 규격 v5에서 기본 `msg`를 "최대 4장"으로 고쳐야 한다 |
| 9 | **`ENTRY_SCANNER_NOT_AUTHORIZED` 기본 문구** — "검표 권한이 없습니다"는 회원 권한을 전제한다 | 이월. 코드는 그대로 쓰고 의미를 "검표 링크 토큰이 유효하지 않음"으로 재해석했다 |
| 10 | **`REFUND_TRANSFER_FAILED` 재정의** — v3는 외부 환불 전송 실패였는데 v5의 환불에는 그 단계가 없다 | 본문에서 **"`refund` tx 최종 실패"로 재정의**해 그대로 썼다(API-refund-02). 규격 v5에서 발생 조건 문장을 고쳐야 한다 |
| 11 | **절 번호가 v4·v5와 어긋난다** — v5에서 도메인이 16 → 14개로 줄어 `예약 경로`·`규격 제안`·`검수표`가 §17·§18·§19 → **§15·§16·§17**로 당겨졌고, **[v6]** 양도 장 삭제로 도메인 장이 **§1~§13**이 됐다 | 상단 인용 블록과 §0.11에 매핑을 적었고, 본문의 절 참조는 전부 현재 번호로 바꿨다. **[v6] §14는 결번**이다 — 예약 경로·규격 제안·검수표를 §14·§15·§16으로 다시 당기면 04·05·07·Jira 이슈의 "§16.1 에러 코드"·"§17 검수표" 참조가 한꺼번에 어긋나므로 **§15~§17을 고정**했다. 검토 시 **"예약 경로 = §15, 규격 제안 = §16, 검수표 = §17"** 로 읽는다 |
| 12 | **`WalletTx` 뷰의 원본 테이블** — 지급 이력을 별도 테이블 없이 `chain_job(tx_type='MINT')`로 대체했다(미결 안건 31) | API-wallet-02·API-coin-08이 그 전제로 작성됐다. 뒤집어 `coin_grant` 테이블을 만들면 두 API의 "시스템 처리" 4번과 ERD v4를 함께 고친다 |

### 16.4 v5에서 쓰이지 않게 된 기존 코드 (규격 v5 폐기 후보)

| 코드 | v3·v4에서 쓰인 곳 | v5 처리 |
|------|---------------|---------|
| `WALLET_CREATION_FAILED` (500) | API-team-01(서버가 팀 지갑 생성) | **발생할 수 없다.** 서버가 지갑을 만들지 않는다(P-2). 규격 v5에서 삭제 |
| `WALLET_KEY_DECRYPT_FAILED` (500) | API-rule-03(팀 키 복호화 후 서명) | **발생할 수 없다.** 서버가 보관·복호화하는 사용자 키가 없다. 규격 v5에서 삭제 |
| `WALLET_GAS_INSUFFICIENT` (409) | v4 API-payment-01·rule-03, API-wallet-05 | **[v5] 발생할 수 없다.** 수수료 대납으로 사용자 지갑의 네이티브 잔액을 보지 않는다(§0.4). 규격 v5에서 삭제하거나, 운영지갑 전용 의미로 재정의(`CHAIN_FEE_PAYER_INSUFFICIENT` 제안과 택일) |
| `PAYMENT_INSUFFICIENT_BALANCE` (409) | v4 API-payment-01 | **[v5] 의미와 문구를 고쳐야 쓸 수 있다.** §16.1 재정의 제안 |
| `PAYMENT_REQUEST_FAILED` (502) | v3 결제 전송 실패, v4 유입 수단 실패 | **[v5] 발생할 수 없다.** 결제·유입 어느 쪽에도 외부 승인 호출이 없다. 규격 v5에서 삭제 |
| `PAYMENT_TIMEOUT` (504) | 동상 | **[v5] 발생할 수 없다.** 체인 확정 지연은 `CHAIN_TX_TIMEOUT`이 담당한다. 규격 v5에서 삭제 |
| `COIN_BURN_FAILED` (500) | v3·v4 소각 실패 | **[v5] 발생할 수 없다.** 컨트랙트에서 소각 함수가 삭제됐다(결정 v2 §2.4). 규격 v5에서 삭제 |
| `REDEEM_NOTHING_TO_REDEEM` · `REDEEM_ACCOUNT_NOT_REGISTERED` · `REDEEM_ALREADY_REQUESTED` · `REDEEM_BANK_TRANSFER_FAILED` | v3·v4의 수령 이후 단계 | **[v5] 4개 전부 발생할 수 없다.** `release`가 정산의 종단이다(P-10). 규격 v5에서 삭제하고, v4의 개명 제안도 철회한다(§16.1) |
| `COIN_RESERVE_MISMATCH` (409) | API-coin-01·07, API-settlement-05 | **이름만 어긋난다.** 검사 내용이 발행량 대사로 바뀌었으므로 `COIN_SUPPLY_MISMATCH`로 개명 제안(§16.1). 개명 전까지 본문이 이 코드를 계속 쓴다 |
| `SETTLEMENT_RELEASE_NOT_ACTIVE` (409) | (본문 미사용) | **[v5] 쓸 자리가 없다.** v4에서 후보였던 용도(수령 이후 단계 사전 검사)가 사라졌다. 규격 v5에서 삭제 |
| `RULE_COMMON_COST_EXCEEDS_REVENUE` (409) | (v2에서 사용처 제거) | 공통 비용 항목이 삭제돼 **발생할 수 없다.** 규격 v5에서 삭제 |
| `AUTH_OAUTH_EXCHANGE_FAILED` · `AUTH_OAUTH_PROVIDER_UNSUPPORTED` · `AUTH_TERMS_NOT_AGREED` | (v3 신설 후보, 미배포) | **신설 후보에서 철회 유지.** 자체 OAuth 토큰 교환이 없다(Web3Auth가 처리). 대신 `AUTH_WEB3AUTH_TOKEN_INVALID`가 필요하다(§16.1) |

### 16.5 Q&A 방어 논리 (리스크 절 이관용)

이 문서의 본문은 **"화폐가 코인인 미래를 가정한다. 플랫폼은 시연용 코인을 지급할 뿐 발행·상환·준비금의 주체가 아니며, 모든 가치 이동은 지갑 간 온체인 이체다"** 만 말한다. 아래는 발표 Q&A와 요구사항 명세서 v5 §8 리스크 절로 넘길 논리이며 본문 어디에도 쓰지 않았다(결정 v2 §15 ⑨·§12.3).

| 질문 | 답 | API 근거 |
|---|---|---|
| 현실에는 화폐가 있고, 학생 팀이 화폐를 발행할 수 없지 않나 | **이 시연은 화폐가 코인인 미래를 가정한다.** 가정 세계에서 사람들은 이미 지갑에 돈을 갖고 있고, 우리는 시연을 위해 그 잔액을 지급한다. 현실 매핑은 인가 발행사 코인 또는 CBDC를 `tokenAddress()`에 꽂는 것이고, **정산 컨트랙트는 표준 ERC-20이면 코드 변경이 0이다** | API-coin-01의 `issuer.type`·`issuer.replaceable`·`disclosure`, API-coin-04의 `contracts.tokenAddress`. `RevenueSplitter`는 `tokenAddress()`만 의존한다 |
| 지급한 코인이 무엇으로 뒷받침되는가 | **뒷받침 개념이 없다.** 이 세계의 화폐가 코인이므로 무엇에 고정될 필요가 없다. 대신 **발행량이 어디에 있는지**를 공시한다 — `totalSupply` = Σ지갑 잔액 + Σ(에스크로 + 보증금)이 1원 오차 없이 맞는지를 누구나 확인한다 | API-coin-01의 `invariants[3]`(불변식 4)·`perPerformanceEscrow` |
| 코인이 어디서 나왔는지 추적할 수 있나 | **전부 지급 이력이다.** 모든 mint는 `Minted(to, amount, grantRef)` 이벤트를 남기고, `grantRef`는 그 지급 요청의 멱등키 해시다. 가입 자동 지급과 관리자 지급이 구분돼 기록된다 | API-coin-08(`source`·`grantRef`·`summary`), API-coin-01의 `invariants[0]`·`grantCount` |
| 플랫폼이 사용자 돈을 쥐고 있지 않다는 근거 | 사용자 잔액은 **사용자 지갑**에 있고 서버가 옮길 수 없다. 정산 기간에만 컨트랙트가 맡고, 팀에게 나가는 것도 컨트랙트가 잠긴 규칙대로 push한다. 서버 보관 키는 2개(운영·발행)이며 사용자 코인을 임의로 옮기는 권한이 없다 | API-wallet-01, §0.4, API-settlement-05(운영자는 `release`를 발의만 한다) |
| 수수료를 서비스가 낸다면 그것도 플랫폼이 자금을 대는 것 아닌가 | 수수료는 네트워크 가스이며 **사용자 자산과 분리된 운영 비용**이다. 대납 주소는 서명 화면에 그대로 노출되고, 대납 여부가 tx마다 기록된다 | §0.4의 `feePayer`, API-chain-01의 `feeDelegated`·`feePayerAddress` |
| 탈중앙인가 | **아니다.** 판매 시작·환불·집계·잠금·release·지급은 **운영자가 발의·실행**한다. 보장하는 것은 규칙의 사후 변조 불가와 계산의 재현 가능성이다 | API-verify-01 `guarantees.notGuaranteed` |
| 외국인 관객은 어떻게 YoYo를 갖게 되나 | **여행 전 환전처럼 플랫폼 밖에서 이미 이뤄졌다고 가정한다**(결정 v2 §12.2-1). 자국 코인 ↔ YoYo 교환(DEX·`YoYoExchange`)은 P2이며 MVP에 화면도 API도 없다 | §15.4, API-member-01(가입 시 기본 잔액이 그 가정을 대신한다) |

---
## 17. 검수표 — v7 P0 전수 확인

**기준은 결정 문서 v2 §9 API 인벤토리다.** v5의 83행(P0 59 + P1 상세 5 + P2 상세 4 + P1 예약 10 + 삭제 5) 체제에서 **[v6] 80행(P0 61 + P1 상세 3 + P1 예약 10 + 삭제 6)** 으로 바뀌었다.

| 구분 | v4 | v5 | **v6** | v5 → v6 |
|------|----:|----:|----:|------|
| **P0 상세 작성** | 76 | 59 | **61** | **+2** (wallet-03·04 P1 → P0) |
| P1·P2인데 본문 상세 있음 | (76에 포함) | 9 | **3** | **−6** (transfer-01~04 삭제, wallet-03·04 P0 승격) → member-02·08 · coin-04 |
| P1 예약 경로(상세 없음) | 12 | 10 | **10** | 0 |
| 삭제(어디에도 없음) | 4 | 5 | **6** | **+1** (`transfer` 장 = 4개 경로를 1행으로 적는다) |
| 본문 `### API-*` 절 수 | 76 | 68 | **64** | **−4** (양도 4개) |

> **[v6] "P0 61"의 계산 근거** — v5 검수표는 **양도 4개를 P0 59에 넣지 않고** "P1·P2인데 본문 상세 있음 9"로 분리해 세고 있었다(59 + 9 = 본문 절 68). 따라서 양도 삭제는 P0 수를 줄이지 않고 본문 절 수만 −4로 줄이며, P0는 **wallet-03·04 승격분 +2만 움직여 61**이 된다. 변경계획 §B″-5 표의 "57"은 양도 4개가 P0 59에 포함됐다고 보고 −4를 먼저 적용한 값이라 이 문서의 세는 기준과 다르다. **이 문서는 아래 행 번호(1~61)와 일치하는 61을 쓴다.**

> **v4의 "P0 76"과 v5의 "P0 59"는 세는 기준이 다르다.** v4 검수표는 제목에 `[P1]`·`[P2]`가 붙은 절(member-02·08, wallet-03·04·05, coin-04, transfer-01~04 = 10개)까지 "P0 상세"에 합산했다. v5는 그것을 분리해 **실제 P0만 59**로 세고, 상세가 있는 P1·P2 9개를 따로 적었다. 같은 기준으로 환산하면 v4 66 → v5 59다. 결정 문서 v2 §9의 "약 62"는 v4를 70으로 잡은 계산이라 v4 검수표(76)와 기준이 다르며, **차이 −7의 내역은 아래 증감 내역과 일치한다**(§16.3 #11과 함께 팀 검토).

**v5 증감 내역** — **신설 2개**: coin-07(시연용 코인 지급) · coin-08(지급 이력). **개편 1개**: coin-01(발행량·에스크로 공시 — 구 verify-02 통합). **변경 12개**: member-01(기본 지급 트리거) · team-01·02·03(금전 수단 필드 삭제) · wallet-01(가스 블록 삭제)·02(이력 6종) · ticket-01(`shortfall` 안내용) · payment-01(본문 없음)·02(단계 하나)·03(`senderSignedRlp`) · performance-13(가스 필드 삭제)·14(`senderSignedRlp`) · rule-03·05(동상) · settlement-01(수령 이후 단계 삭제)·05·07 · verify-01(수령 이후 요약 삭제) · chain-01(`feeDelegated`). **삭제 12개**: member-07 · team-07 · wallet-05 · charge-01~04(4) · withdraw-01~04(4) · verify-02. **P1 예약에서도 제외 2개**: 관객 잔액 유출 경로 2개(§15.3).

**[v6] 증감 내역** — **삭제 4개(장 전체)**: transfer-01~04(양도 — §14-34). **승격 2개**: wallet-03(챌린지 발급) · wallet-04(지갑 등록, 경로 `/wallets/verify` → `/wallets`) — P1 → **P0**(§14-35). **변경 4개**: member-01(지갑 등록·기본 지급 분리, `wallet` nullable) · wallet-01(잔액 캐시 Redis) · ticket-04·05·06·refund-01·02·entry-01(양도 상태·`TRANSFER_*` 409 삭제) · settlement-02·03·admin-06(`HALTED` 서술 정정). **신설 절 1개**: §0.12 서버 측 저장소(Redis) 키 규약.

**[v7] 증감 내역** — **신설 1개(장 신설)**: recommendation-01(맞춤 추천 목록 — 결번이던 §14). **변경 4개**: member-05(`preferredGenres` 응답 추가)·member-06(`preferredGenres` 전체 교체) · team-01(`genre` 자유 문자열 → 10종 enum, 필수)·team-04(`genre` 같은 enum, 선택). **P2 이름만 예약 1개**: recommendation-02(비슷한 공연, 임베딩 — §15.5). v6 작성 시점(P0 61) 뒤 2026-09-15 API-performance-15·2026-09-21 API-settlement-08·2026-09-22 API-performance-16·17(미디어)이 더해져 v7 머지 시점 실제 P0는 **65**였고, recommendation-01이 더해 **66**이 된다(§17 도입부 "80행" 집계는 v6 작성 당시 스냅샷이라 이 네 건을 반영하지 않았다 — 아래 번호 1~69와 맞춰 읽는다).

"본문"은 이 문서에 `### {번호}` 절과 `` `메서드 경로` `` 표기가 **글자 단위로 일치**함을 확인한 결과다. 순서는 문서 본문 등장 순서다.

| # | 번호 | 메서드 경로 | 이름 | 본문 | 절 | 비고(v5·**[v6]**) |
|---|------|-------------|------|:----:|----|---------|
| 1 | API-member-01 | `POST /api/v1/auth/web3auth` | Web3Auth 로그인/가입 | ☑ | §1 | **[v6] 변경** — 지갑 등록·기본 지급 분리, `wallet` nullable, `grantJobId`·`signupGrant` 삭제 |
| — | API-member-02 | `POST /api/v1/auth/login` | 자체 이메일 로그인(보조) | ☑ | §1 | **P1** — Web3Auth 단일 동결 |
| 2 | API-member-03 | `POST /api/v1/auth/refresh` | 토큰 재발급 | ☑ | §1 | 유지 |
| 3 | API-member-04 | `POST /api/v1/auth/logout` | 로그아웃 | ☑ | §1 | 유지 |
| 4 | API-member-05 | `GET /api/v1/members/me` | 내 정보 조회 | ☑ | §1 | v5 문구 — 금전 수단 항목 삭제 |
| 5 | API-member-06 | `PATCH /api/v1/members/me` | 내 정보 수정 | ☑ | §1 | 유지 |
| ~~—~~ | ~~API-member-07~~ | ~~`PUT /api/v1/members/me/bank-account`~~ | ~~회원 금전 수단 연결~~ | — | — | **v5 삭제** — §1 말미 사유 |
| — | API-member-08 | `POST /api/v1/auth/signup` | 자체 이메일 가입(보조) | ☑ | §1 | **P1** — 동상 |
| 6 | API-team-01 | `POST /api/v1/teams` | 팀 생성 | ☑ | §2 | **v5 변경** — 금전 수단 필드·가스 job 삭제 |
| 7 | API-team-02 | `GET /api/v1/teams/me` | 내 팀 목록 | ☑ | §2 | **v5 변경** — 수령 가능액·등록 여부 삭제 |
| 8 | API-team-03 | `GET /api/v1/teams/{teamId}` | 팀 상세 | ☑ | §2 | **v5 변경** — 금전 수단 블록 삭제 |
| 9 | API-team-04 | `PATCH /api/v1/teams/{teamId}` | 팀 수정 | ☑ | §2 | 유지 |
| 9-1 | API-team-06 | `GET /api/v1/teams/search` | 팀 검색(초대 자동완성) | ☑ | §2 | **2026-09-26 신설** — 번호는 v3 삭제분 재사용 |
| ~~—~~ | ~~API-team-05·06~~ | ~~`…/invitations`·`…/accept`~~ | ~~팀원 초대·수락~~ | — | — | v3 삭제 유지 — §2 말미 |
| ~~—~~ | ~~API-team-07~~ | ~~`PUT /api/v1/teams/{teamId}/settlement-account`~~ | ~~팀 수령 수단 등록~~ | — | — | **v5 삭제** — §2 말미 사유 |
| 10 | API-wallet-01 | `GET /api/v1/wallets/me` | 내 지갑 조회 | ☑ | §3 | **[v6] 변경** — 잔액 캐시가 Redis `wallet:balance`(§0.12), DB 사본 없음 |
| 11 | API-wallet-02 | `GET /api/v1/wallets/me/transactions` | 내 지갑 거래 이력 | ☑ | §3 | **v5 변경** — `WalletTx.type` 6종, `feeDelegated` |
| 12 | **API-wallet-03** | `POST /api/v1/wallets/challenge` | 외부 지갑 등록 챌린지 발급 | ☑ | §3 | **[v6] P1 → P0** — 자체 챌린지가 MVP 소유 증명 경로 |
| 13 | **API-wallet-04** | `POST /api/v1/wallets` | 지갑 등록(첫 1회 선택) | ☑ | §3 | **[v6] 변경 — 경로·역할 확장(구 `/wallets/verify`), P1 → P0**, 202 + `grantJobId` |
| ~~—~~ | ~~API-wallet-05~~ | ~~`POST /api/v1/wallets/me/gas`~~ | ~~가스 지원 요청~~ | — | — | **v5 삭제** — §3 말미 사유(수수료 대납) |
| 14 | API-performance-01 | `POST /api/v1/performances` | 공연 생성 | ☑ | §4 | 유지(보증금 필드) |
| 15 | API-performance-02 | `GET /api/v1/performances` | 공연 목록(공개) | ☑ | §4 | 유지 |
| 16 | API-performance-03 | `GET /api/v1/performances/{performanceId}` | 공연 상세(공개) | ☑ | §4 | 유지 |
| 17 | API-performance-04 | `PATCH /api/v1/performances/{performanceId}` | 공연 수정(잠금 전) | ☑ | §4 | 유지 |
| 18 | API-performance-05 | `PUT /api/v1/performances/{performanceId}/ticket-types` | 티켓 옵션 설정(잠금 전) | ☑ | §4 | 유지 |
| 65 | **API-performance-15** | `GET /api/v1/performances/{performanceId}/ticket-types` | 티켓 옵션 조회 | ☑ | §4 | **[2026-09-15] 신설** — P-03 수정 화면이 저장(05)과 같은 shape로 다시 읽는다 |
| 67 | **API-performance-16** | `POST /api/v1/performances/{performanceId}/media/{kind}` | 공연 미디어 저장 | ☑ | §4 | **[2026-09-22] 신설** — 포스터·티켓 아트워크 저장 |
| 68 | **API-performance-17** | `GET /api/v1/performances/{performanceId}/media/{kind}` | 공연 미디어 조회 | ☑ | §4 | **[2026-09-22] 신설** — 공개 화면 이미지 응답 |
| 19 | API-performance-06 | `GET /api/v1/performances/me` | 내 팀 참여 공연 목록 | ☑ | §4 | 유지 |
| 20 | API-performance-07 | `POST /api/v1/performances/{performanceId}/participants` | 참여팀 초대 | ☑ | §4 | 유지 |
| 21 | API-performance-08 | `POST /api/v1/performances/{performanceId}/participants/{teamId}/accept` | 참여 수락 | ☑ | §4 | v5 문구 — 등록 안내 삭제 |
| 22 | API-performance-09 | `DELETE /api/v1/performances/{performanceId}/participants/{teamId}` | 참여팀 제외(잠금 전) | ☑ | §4 | 유지 |
| 23 | API-performance-10 | `GET /api/v1/performances/{performanceId}/entry-link` | 검표 페이지 링크 조회 | ☑ | §4 | 유지 |
| 24 | API-performance-11 | `GET /api/v1/performances/{performanceId}/sales` | 판매·선택 현황 | ☑ | §4 | 유지 |
| 25 | API-performance-12 | `POST /api/v1/performances/{performanceId}/cancel` | 공연 취소(일괄 환불) | ☑ | §4 | v5 문구 — 온체인 tx만 |
| 26 | API-performance-13 | `POST /api/v1/performances/{performanceId}/deposit/prepare` | 보증금 서명 파라미터 | ☑ | §4 | **v5 변경** — `gasStatus` 삭제, `txType`·`feePayer` 추가 |
| 27 | API-performance-14 | `POST /api/v1/performances/{performanceId}/deposit/signed-tx` | 보증금 tx 해시 보고 | ☑ | §4 | **v5 변경** — 본문 `{kind, senderSignedRlp}`(이름은 §16.3 #1) |
| 28 | API-rule-01 | `PUT /api/v1/performances/{performanceId}/rules` | 정산 규칙 설정 | ☑ | §5 | **2026-09-09 변경** — 보증금 선행 제거(규칙이 `createShow` 입력) |
| 29 | API-rule-02 | `GET /api/v1/performances/{performanceId}/rules` | 규칙·동의 현황 조회 | ☑ | §5 | 유지 |
| 30 | API-rule-03 | `POST /api/v1/performances/{performanceId}/rules/agreements/prepare` | 규칙 동의 서명 파라미터 | ☑ | §5 | **v5 변경** — 가스 조건·`gasStatus` 삭제 |
| 31 | API-rule-05 | `POST /api/v1/performances/{performanceId}/rules/agreements/signed-tx` | 규칙 동의 tx 해시 보고 | ☑ | §5 | **v5 변경** — 본문 `{teamId, senderSignedRlp}` |
| 32 | API-rule-04 | `POST /api/v1/performances/{performanceId}/sale/start` | 판매 시작(startSale 잠금) | ☑ | §5 | 유지 |
| 33 | API-ticket-01 | `POST /api/v1/orders` | 주문 생성(표별 응원 팀 배분) | ☑ | §6 | **v6.2 변경** — `items[].chosenTeamId`로 표별 배분, 응답 `orderGroupId`·`orders[]`(주문 그룹) |
| 34 | API-ticket-02 | `GET /api/v1/orders/me` | 내 주문 목록 | ☑ | §6 | **v6.2 변경** — 그룹 단위(`orderGroupId`·`groupStatus`·`teamBreakdown[]`) |
| 35 | API-ticket-03 | `GET /api/v1/orders/{orderId}` | 주문 상세 | ☑ | §6 | **v6.2 변경** — 그룹 단위(`orderGroupId`·`orders[]`), `approveTxHash`·`purchaseTxHash`는 유지 |
| 36 | API-ticket-04 | `GET /api/v1/tickets/me` | 내 티켓 목록 | ☑ | §6 | **v6.2 변경** — `chosenTeamName` 추가 |
| 37 | API-ticket-05 | `GET /api/v1/tickets/{ticketId}` | 티켓 상세 | ☑ | §6 | 유지 |
| 38 | API-ticket-06 | `GET /api/v1/tickets/{ticketId}/qr` | 동적 QR 토큰 발급 | ☑ | §6 | 유지 |
| 39 | API-payment-01 | `POST /api/v1/orders/{orderId}/payment` | 결제 시작 | ☑ | §7 | **v6.2 변경** — 주문 그룹 결제, `signRequests` = APPROVE 1 + PURCHASE × 미결제 하위 주문 |
| 40 | API-payment-02 | `GET /api/v1/orders/{orderId}/payment` | 결제 상태 조회 | ☑ | §7 | **v6.2 변경** — 그룹 뷰(`payments[]`·`groupStatus`·`paidCount`/`totalCount`) |
| 41 | API-payment-03 | `POST /api/v1/orders/{orderId}/payment/signed-tx` | 결제 tx 해시 보고 | ☑ | §7 | **v6.2 변경** — 본문에 `orderId`(하위 주문 지정) 추가, 응답에 `orderGroupId`·`pendingOrderIds[]` |
| ~~—~~ | ~~API-charge-01~04~~ | ~~`/charges` 외 3~~ | ~~유입 4개~~ | — | — | **v5 삭제(장 전체)** — §7 말미 사유 |
| 42 | API-coin-01 | `GET /api/v1/coin/supply` | YoYo 발행량·에스크로 공시 | ☑ | §8 | **v5 개편** — 4개 지표 + 불변식 4 대사, 구 verify-02 통합 |
| 43 | API-coin-02 | `GET /api/v1/coin/rates` | 표시 환율 조회 | ☑ | §8 | 유지 |
| 44 | API-coin-03 | `PUT /api/v1/admin/coin/rates` | 표시 환율 등록 | ☑ | §8 | 유지(ADMIN, M-03) |
| — | API-coin-04 | `GET /api/v1/coin/config` | 체인·컨트랙트 설정 조회 | ☑ | §8 | **P1** — v5 문구: 주소 2개, `feePolicy` |
| — | API-coin-05·06 | `/admin/coin/jobs…` | 온체인 작업 목록·재시도 | — | §15 | P1 예약 |
| 45 | **API-coin-07** | `PUT /api/v1/admin/coin/grants` | **시연용 코인 지급** | ☑ | §8 | **v5 신설** — 멱등키 필수, 202 + `MINT` jobId |
| 46 | **API-coin-08** | `GET /api/v1/admin/coin/grants` | **시연용 코인 지급 이력** | ☑ | §8 | **v5 신설** — `chain_job(MINT)` 조회, `source` 구분 |
| 47 | API-chain-01 | `GET /api/v1/chain/jobs/{jobId}` | 비동기 tx 작업 상태 | ☑ | §8 | **v5 변경** — `feeDelegated`·`feePayerAddress`·`grantSource` |
| 48 | API-refund-01 | `GET /api/v1/tickets/{ticketId}/refund-quote` | 환불액 미리보기 | ☑ | §9 | v5 문구 — "Refunded to your wallet" |
| 49 | API-refund-02 | `POST /api/v1/tickets/{ticketId}/cancel` | 개별 취소·환불 | ☑ | §9 | v5 문구 — 온체인 tx 1건 |
| ~~—~~ | ~~API-transfer-01~04~~ | ~~`/tickets/{id}/transfers` 외 3~~ | ~~양도 4개~~ | — | — | **[v6] 삭제(장 전체)** — §0.11 삭제 고지 · `TRANSFER_*` 철회는 §16.1 |
| 50 | API-entry-01 | `POST /api/v1/entries/verify` | QR 검증·입장 처리 | ☑ | §10 | 유지 |
| 51 | API-entry-02 | `GET /api/v1/performances/{performanceId}/entries` | 입장 현황·이력 | ☑ | §10 | 유지 |
| 52 | API-settlement-01 | `GET /api/v1/performances/{performanceId}/settlement` | 정산 상태·집계·분배액·tx | ☑ | §11 | **v5 변경** — 누적 유출액 필드 삭제, `nextAction` 2값 |
| 53 | API-settlement-02 | `POST /api/v1/performances/{performanceId}/settlement/aggregate` | 집계 확정 | ☑ | §11 | 유지 |
| 54 | API-settlement-03 | `POST /api/v1/performances/{performanceId}/settlement/lock` | 정산 잠금(이의제기 시작) | ☑ | §11 | 유지 |
| 55 | API-settlement-04 | `POST /api/v1/performances/{performanceId}/settlement/disputes` | 이의제기 | ☑ | §11 | 유지 |
| 56 | API-settlement-05 | `POST /api/v1/performances/{performanceId}/settlement/release` | release 실행 | ☑ | §11 | **v5 변경** — release = 수령 완료, 팀 측 사전 조건 없음 |
| 57 | API-settlement-06 | `POST /api/v1/performances/{performanceId}/settlement/share-link` | 정산 공유 링크 생성 | ☑ | §11 | 유지 |
| 58 | API-settlement-07 | `GET /api/v1/public/settlement/{shareToken}` | 정산 공유 링크 조회(공개) | ☑ | §11 | **v5 변경** — 종단 `RELEASED` |
| 66 | **API-settlement-08** | `POST /api/v1/performances/{performanceId}/settlement/approvals` | 정산 조기 동의 | ☑ | §11 | **[2026-09-21] 신설** — 참여팀 전원 동의 시 이의제기 48h를 건너뛰고 release가 열린다. `EndpointInventoryTest`가 코드를 먼저 등록해 두었다 |
| ~~—~~ | ~~API-withdraw-01~04~~ | ~~`/teams/{id}/withdrawals` 외 3~~ | ~~수령 이후 단계 4개~~ | — | — | **v5 삭제(장 전체)** — §11 말미 사유 |
| 59 | API-verify-01 | `GET /api/v1/performances/{performanceId}/verification` | 정산 검증 데이터 | ☑ | §12 | **v5 변경** — `receiptSummary`로 교체, 불변식 1·4는 coin-01 |
| ~~—~~ | ~~API-verify-02~~ | ~~`GET /api/v1/public/reserve-proof`~~ | ~~공개 공시~~ | — | — | **v5 삭제 → API-coin-01 통합** — §12 말미 사유 |
| 60 | API-admin-09 | `GET /api/v1/admin/disputes` | 이의제기 목록 | ☑ | §13 | 유지 |
| 61 | API-admin-06 | `PATCH /api/v1/admin/disputes/{disputeId}` | 이의제기 처리 | ☑ | §13 | 유지 |
| 67 | **API-recommendation-01** | `GET /api/v1/recommendations/performances` | 맞춤 추천 목록 | ☑ | §14 | **[2026-09-22 신설]** — 결번이던 §14를 `recommendation` 도메인이 채운다. 콜드스타트 장르 매칭(1차), `basis` 필드로 2차·3차 확장 예정 |

### 추가 확인

| 항목 | 결과 |
|------|------|
| **[v7]** P0 전부 본문에 상세 절 존재 | ☑ (`grep -c "^### API-"` = **69** = P0 66(v6 작성 시점 61 + [2026-09-15] 신설 API-performance-15 + [2026-09-21] 신설 API-settlement-08 + [2026-09-22] 신설 API-performance-16·17 + **[2026-09-22] 신설 API-recommendation-01**) + P1 상세 3, 누락 0) |
| P1 예약 10개 | ☑ §15.1 표에 경로·메서드·이름만. 본문 상세 없음 |
| **[v6]** 삭제 6건(개별 3 + 장 3) | ☑ member-07 §1 말미 · team-07 §2 말미 · wallet-05 §3 말미 · `charge` 장 §7 말미 · `withdraw` 장 §11 말미 · verify-02 §12 말미 · **`transfer` 장 §0.11 삭제 고지** — 각 자리에 사유 한 줄 |
| **[v7]** 도메인 14개 전부 절 존재 | ☑ §1~§14 (결정 v2 §5 순서에서 `transfer`만 빠졌고, `recommendation`은 결정 문서 밖 **[v7] 신설**이다: member·team·wallet·performance·rule·ticket·payment·coin·refund·entry·settlement·verify·admin·recommendation). §14는 더 이상 결번이 아니다. §15~§17은 고정 |
| 본문 에러 코드가 전부 규격 v3 §3에 존재 | ☑ (미등재 코드 0 — **[v6]** 신설·재정의 후보 23개는 §16.1에만. `TRANSFER_*` 계열은 본문 사용 0) |
| 결정 v2 §7 상태 문자열 사용 | ☑ **[v6] Ticket 3값**(`ISSUED`/`USED`/`CANCELLED` — `TRANSFER_PENDING` 삭제) · Wallet(`LINKED`/`SUSPENDED`, `WEB3AUTH`/`EXTERNAL`) · **Payment 6값**(`CHARGING` 없음) · RuleAgreement 3값 · ChainJob(`tx_type` **12값**·`signer_type`·`issuer_type`·`fee_delegated`·`status`) · Settlement 5값 + `HALTED` · `deposit_status` 4값 · Refund 4값 · **WalletTx.type 6값** · Member.auth_provider 3값(`LOCAL` P1 예약) · **AuditLog.action_type 8값**(`GRANT` 포함) |
| 삭제된 상태 enum 미사용 | ☑ `CoinCharge`·`CoinWithdrawal` 전체, `Payment.CHARGING`, `ChainJob.tx_type`의 소각·금고 3종, `WalletTx`의 유입·유출·가스 3종, `AuditLog`의 소각·유입·유출 3종 — 본문 사용 0 |
| 멱등키 필수 API | ☑ **6개** — ticket-01 · payment-01 · refund-02 · performance-12 · settlement-05 · **coin-07** |
| 202 + `jobId`(OPERATOR) API | ☑ **7개** — rule-04 · performance-12 · refund-02 · settlement-02·03·05 · **coin-07** (폴링 대상 API-chain-01) |
| 202 + `jobId`(USER, 서명 tx 보고 + 대납 전송) API | ☑ **3개** — performance-14 · rule-05 · payment-03 (v4의 4번째는 삭제) |
| `…/prepare` 서명 파라미터 API | ☑ performance-13 · rule-03 · payment-01·02(겸용) |
| `signed-tx` 본문 규약 | ☑ 3개 전부 `{kind, senderSignedRlp}`(rule-05는 `{teamId, senderSignedRlp}`). `txHash`를 받는 API 0개 |
| 공개(비인증) 경로 | ☑ `GET /performances` · `GET /performances/{id}` · `GET /coin/supply` · `GET /coin/rates` · `GET /coin/config` · `GET /public/settlement/{shareToken}` · `POST /auth/web3auth` · `POST /auth/login` · `POST /auth/signup` — **`/public/reserve-proof` 삭제됨** |
| 검표 링크 토큰(`X-Entry-Token`) API | ☑ API-entry-01 · API-entry-02 (발급은 API-performance-10) |
| 체인 표기 | ☑ 전부 `kaia-kairos` · `chainId 1001`/`0x3e9` · `https://kairos.kaiascan.io` |
| 노출 컨트랙트 주소 | ☑ `tokenAddress`·`splitterAddress` **2개만**. v4의 3번째 주소 0건 |
| 서버 보관 키 | ☑ 본문 전체에서 **OPERATOR(fee payer)·MINTER 2개**. 3번째 키 0건 |
| 금액 표기 | ☑ 전부 YoYo 정수 + `display` 객체(또는 축약형 `rate`). 소수 금액 0 |
| `Accept-Language` 명시 | ☑ 사용자 문구가 있는 전 API 헤더 절에 표기(en 기본·ko) |
| 결정 v2 §15 ⑨ 문장 | ☑ §0 서두 1회("화폐가 코인인 미래를 가정한다. 플랫폼은 시연용 코인을 지급할 뿐 …") + §16.5 도입부에서 재인용 |
| 결정 v2 §15 ⑩ 문장 | ☑ §0 서두 1회("지갑은 사용자 소유(Web3Auth/Kaia Wallet)이며, 서버는 사용자 키를 보관하지 않는다") + §3 도입부 1회 |
| 결정 v2 §15 ④ 금지 문자열 | ☑ **본문 서술 0건.** 남은 출현은 전부 **삭제 고지·철회 목록·변경 이력** 문맥이다 — §0.11(삭제된 장 3개) · 각 장 말미 "삭제된 API/장" 절 · §16.1 철회 표 · §16.4 폐기 후보 · §17 검수표 취소선 행 · 변경 이력. ⑨ 문장 자체가 세 단어를 포함하므로(결정 v2 §15 ⑨ 원문) 그 인용도 예외다 |
| "인가 발행사 코인·CBDC 교체 가능" 언급 위치 | ☑ §16.4·§16.5(Q&A) 및 `issuer.replaceable` 필드 설명에만. 본문 서사 0 |
| 사용자 키 관련 필드 | ☑ 개인키·니모닉·MPC 샤드를 받거나 반환하는 필드 0개. `senderSignedRlp`는 **서명 결과물**이며 키가 아니다 |
| P2 경로 없음 | ☑ 자국 코인 교환·`ExternalIssuer`·NFT·외국인 팀 경로 0 (§15.4에 "만들지 않는다"만). **[v6]** 양도는 P2가 아니라 **설계에서 삭제**됐다 |
| 화면 ID 참조 | ☑ **[v6] 31개 체계**(33 − 양도 화면 2개, A-09·A-10은 결번) — 삭제된 화면(v4의 A-14·P-09)은 **본문 서술 0건**이고 §11 말미 삭제 고지에만 나온다. V-02는 "발행량·에스크로 공시", M-03은 "표시 환율·코인 지급" |

---

## 변경 이력

| 버전 | 날짜 | 내용 |
|------|------|------|
| v1 | 2026-08-28 | 초안. 계획 §1.7(71행) P0 69개 상세 + P1 2개 + 신설 제안 + 검수표 |
| v2 | 2026-08-31 | 요구사항 v2 반영. P0 61 / P1 10 / 삭제 1로 재편. 정산 공식 2단계, 검표 링크, 판매 마감 서버 계산, 체인 Kaia Kairos 전환 |
| v3 | 2026-08-31 | ERD v2 반영. 팀원 관리 삭제(team-05·06), 정산 공유 링크(settlement-06·07), 2단계 비율 필드, QR TOTP, 23 테이블 |
| v4 | 2026-09-02 | [방향 전환 결정 문서 v1](../planning/06_방향전환_코인전환_v1.md) 반영 — 전부 코인·외국인 관객·비수탁 지갑. P0 76 / P1 12 / 삭제 4. §0.4 사용자 서명 tx 규약·§0.5 `display`·§0.6 `Accept-Language`·§0.7 체인 노출 규칙 신설, `wallet` 도메인 재정의, 유입·유출 도메인 신설, 보증금·동의 서명, 표시 환율, 공개 공시 부활 |
| **v5** | **2026-09-02 오후** | **[방향 전환 결정 문서 v2](../planning/06_방향전환_코인전환_v2.md) 반영 — 화폐가 코인인 세계 · 지갑 간 코인 이동만 · 법정화폐 입출구 전부 삭제. P0 59 / P1 상세 5 / P2 상세 4 / P1 예약 10 / 삭제 5.**<br>① **도메인 16 → 14개** — v4 §8·§14 두 장이 통째로 사라졌고(각 4개 API) member-07·team-07·wallet-05·verify-02도 삭제. 절 번호가 §15·§16·§17로 당겨졌다(§16.3 #11)<br>② **§0 재작성** — ⑨·⑩ 문장 교체, 서버 보관 키 3 → **2개(OPERATOR = fee payer · MINTER)**, `tx_type` 12종, 노출 주소 2개, 멱등키 필수 7 → **6개**(coin-07 추가), 공통 에러에서 외부 연동 계열 제거, 도메인 목차 14개 + 삭제된 장 2개 기록<br>③ **§0.4 수수료 대납 확정** — `signed-tx` 본문이 `{kind, senderSignedRlp}`가 되고 서버가 **대납 서명·전송**한다. `signRequests`에 `txType`(`FEE_DELEGATED_SMART_CONTRACT_EXECUTION`)·`feePayer` 추가, **`gasStatus` 삭제**, 서버 처리 5단계·receipt 검증 5항목 재정리. 자연 멱등키가 `txHash` → **RLP 해시**로 바뀜<br>④ **가입이 곧 기본 지급** — API-member-01이 신규 회원에게 `YoYo.mint(100000, grant:signup:{memberId})` job을 걸고 `grantJobId`·`signupGrant`를 반환. 가스 자동 지원 job은 삭제<br>⑤ **API-coin-07·08 신설** — 관리자 시연용 지급(멱등키 필수, 1회 최대 1,000,000, `grantRef`)과 지급 이력(`chain_job(MINT)` 조회, `source` = `SIGNUP`/`ADMIN`, `summary` 합계). 지급 이력 테이블은 만들지 않는다(미결 안건 31)<br>⑥ **API-coin-01 개편** — 발행량·에스크로 합계·지갑 보유 합계·지급 건수 + **불변식 4개 대사**(`invariants`) + 고지 문구. v4의 API-verify-02(`/public/reserve-proof`)가 여기에 통합되고 공개 경로 목록에서 삭제<br>⑦ **결제 단순화** — API-payment-01의 **본문이 사라졌다**(`mode`·금액·외부 수단 정보 삭제). 잔액 부족은 **409 + `msg` 부족액**(전용 코드는 §16.1). API-payment-02는 단계가 하나가 되고 `blockedReason`·`shortfall` 추가. `Payment.CHARGING` 삭제로 상태 7 → **6값**<br>⑧ **정산 종단 `RELEASED`** — release가 곧 수령 완료. settlement-01에서 누적 유출액 필드와 `nextAction` 2값이 삭제되고, verify-01의 네 번째 요약이 **`receiptSummary`(팀별 수령 여부·시각)** 로 교체<br>⑨ **팀·회원에서 금전 수단 개념 제거** — team-01·02·03 응답에서 등록 여부·수령 가능액·상세 블록 삭제, member-05 문구 정정<br>⑩ **지갑 이력 6종** — `WalletTx.type`이 `GRANT`/`PURCHASE`/`REFUND`/`RELEASE`/`DEPOSIT`/`DEPOSIT_RETURN`. 모든 행이 YoYo 단위이며 `feeDelegated` 추가. wallet-01에서 `gas` 블록 삭제·`pendingGrantJobId` 추가<br>⑪ **chain-01 확장** — `feeDelegated`·`feePayerAddress`·`grantSource`. `MINT` = 시연용 지급 표기<br>⑫ **감사 로그 8종** — `GRANT` 신설, 소각·유입·유출 3종 삭제<br>⑬ **§16 규격 v5 제안 25개**(신설 22 + 재정의·개명 3) — `CHARGE_*` 6·`WITHDRAW_*` 5·예금주 검증 2 = **13개 철회**, `COIN_GRANT_LIMIT_EXCEEDED`·`COIN_SUPPLY_MISMATCH`·`PAYMENT_SIGNED_TX_INVALID`·`CHAIN_FEE_PAYER_INSUFFICIENT` 추가. 폐기 후보 12항목(소각·외부 전송·가스 계열), 판단 지점 13개, Q&A 7문<br>⑭ **§15 예약 경로 재편** — P1 예약 10개, 관객 잔액 유출 경로 2개는 P1에서도 만들지 않는다. 자국 코인 교환은 P2(플랫폼 밖 가정) |
| **v6** | **2026-09-03(목)** | **[v6 변경 계획 v1](./00_v6_변경계획_v1.md) 반영. P0 61 / P1 상세 3 / P1 예약 10 / 삭제 6.**<br>· v6 — 정산 `HALTED` 진입 조건 서술 정정(상태값·API 변경 없음): §11 도입부에 "되돌릴 수 있는 정지 3종 vs 종단 중단" 문단 신설, API-settlement-02의 "자동 정산을 중단한다" → "집계 확정 거부", `SETTLEMENT_HALTED` 게이트 설명 2곳 확장, API-admin-06의 이의 `RESOLVED` 후 재집계 경로 삭제(04 정본)<br>· v6 — **양도(선물) 기능 설계에서 삭제**(결정 v2 §14-34): §10 `transfer` 장 전체 삭제(API-transfer-01~04), 도메인 14 → 13, 도메인 장 §1~§13 재번호(§14 결번), 티켓 상태 3값, `transferable` 필드·`TRANSFER_*` 409 행 삭제, `TRANSFER_*`·`TICKET_TRANSFER_PENDING`·`TRANSFER_CHOICE_TEAM_REQUIRED` 철회 기록(§16.1), 공개 경로에서 `GET /transfers/{token}` 삭제<br>· v6 — **지갑 등록을 로그인에서 분리, 자체 챌린지 MVP 승격**(결정 v2 §14-35): API-member-01 응답에서 `grantJobId`·`signupGrant` 삭제·`wallet` nullable(`isNewMember` 유지), API-wallet-04를 **`POST /api/v1/wallets`**(2 provider 공통 등록, 202 + `grantJobId`)로 확장, API-wallet-03·04 P1 → **P0**, 기본 지급 트리거가 지갑 등록 성공 직후로 이동(멱등키 이름 `grant:signup:{memberId}` 유지)<br>· v6 — **지갑 잔액 캐시를 Redis로 이전**: `wallet:balance` 해시로 교체(§0.12 신설), DB 잔액 사본 없음, payment·refund·release·deposit·grant 확정 절에 `wallet:balance` 갱신 추가<br>· v6 — 수정 범위 내 한정으로 DB 타입·컬럼명 표기를 확정 컬럼명·업무 속성명으로 정리(전면 정리는 이후 버전 — 변경계획 §C-0) |
| — | **2026-09-22** | **표별 응원 팀 배분(주문 그룹) 도입 — 결정 v2 §14-40.** A-04를 "관람 목적 팀 선택(한 팀)"에서 "표별 응원 팀 배분"으로 확장했다. 서버가 배분을 팀별 하위 주문으로 쪼개 주문 그룹(`order_group_id`)으로 묶는다. 컨트랙트는 바뀌지 않는다. API-ticket-01(요청 `items[].chosenTeamId`, 응답 `orderGroupId`·`orders[]`) · API-ticket-02/03/04(그룹 단위 응답) · API-payment-01(그룹 결제, `APPROVE` 1 + `PURCHASE` × 미결제 하위 주문) · API-payment-02(그룹 뷰) · API-payment-03(본문 `orderId` 추가) 개정. 엔드포인트 신설 없음(`EndpointInventoryTest` 카운트 불변). ERD v5 `V{다음 빈 번호}__ticket_order_group.sql` |
| — | **2026-09-24** | **패스키 본인 확인(step-up) — 결정 v2 §14-41.** §7.W `webauthn`(API-webauthn-01~04, P1) 신설. 스위치 `STEP_UP_ENABLED`(기본 off)가 켜지면 결제(payment-03)·규칙 동의(rule-05)·보증금(performance-14)·정산 조기 동의(settlement-08)·정산금 지급(settlement-05)이 `X-Step-Up-Token`(범위 = 회원+동작+대상, 120초·1회용)을 요구하고(없으면 403 `WEBAUTHN_STEP_UP_REQUIRED`), payment-01·02·performance-13·rule-03·settlement-01 응답에 `stepUpRequired`가 실린다. off면 계약 무변경. §0.12 Redis 키 3개 |
| — | **2026-09-24** | **금액 화면 표기 YoYo 전환 — 결정 v2 §14-42.** §0.5에 화면 표기 규칙(`10,000 YoYo`, ₩·KRW·"원" 금지, API 식별자 `KRW`·`USD_KRW` 무변경)을 더하고 화면 문구 예시를 갱신했다. 서버 `msg`·`usageNotice` 예시는 현 구현값이라 그대로 두었다(백엔드 후속). 엔드포인트·필드 무변경 |
| — | **2026-09-26** | **재고 부재·만료 한도 수정(API-ticket-01, 계약 무변경).** ① Redis 재고 필드가 없을 때 선점이 `"0"`을 남겨 영구 매진이 되던 결함 — 선점을 Lua 스크립트 하나로 바꾸고, 필드가 없으면 DB 기준값(`total - sold - 결제 대기`)을 `HSETNX`로 깐 뒤 차감한다 ② 판매 중 공연 재고 대사(기동 30초 뒤·5분 주기, 두 번 관측 + 비교 후 교체) ③ 1인 4매 누적에서 결제 시한이 지난 `PENDING_PAYMENT` 제외 ④ `TICKET_PURCHASE_LIMIT_EXCEEDED` `msg`를 1회 상한·누적으로 구분(코드 무변경). 엔드포인트·필드·openapi 무변경. payment-03 `abandoned`는 그대로(주문 유지) |
