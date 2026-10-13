# SSAFY 프로젝트 현황 시트 — 기입안 (v2)

> 대상: S15P21B204 · 작성 2026-09-04 · 기준: **코인 단일 세계관(방향 전환 v2) + 설계 문서 v6 / ERD v5 + 기술 스택 v2(9/4)**
> 변경 이력: 9/4 오전 초안 → 9/4 오후 §6·§7·§8·§9·§15를 [기술 스택 v2](../design/09_기술_스택_v2.md)로 갱신(GitLab CI 확정·web3j 4.9.8·React 19·Tailwind v4)
> v1(8/28, 금융망·양도 포함)은 보존하고 이 파일로 대체한다. 근거: [방향전환 v2](./06_방향전환_코인전환_v2.md) §14 · [v6 변경계획](../design/00_v6_변경계획_v1.md) · [요구사항 v6](../design/04_요구사항_명세서_v6.md) · [ERD v5](../design/12_ERD_v5.md) · [API v6](../design/06_API_명세서_v6.md) · [화면설계 v6](../design/07_화면설계_v6.md)
>
> 시트 열 순서대로. **바로 붙일 문안**은 인용 블록(`>`)에, 판단·미확정은 본문에. 한 행 통째로는 [`04_SSAFY_프로젝트_현황시트_v2.tsv`](./04_SSAFY_프로젝트_현황시트_v2.tsv) (헤더 1행 + 기입 1행, 19열). 셀 안 줄바꿈은 ` / `와 ①②③으로 대체했다.

## 미확정 3열 (팀이 채울 것)

| 열 | 상태 | 비고 |
|---|---|---|
| 팀장 | **확인 필요** | 역할 분담(§5)은 확정됐으나 팀장은 별도 지정 필요 |
| 팀명 | **확인 필요** | 문서에 없음. 없으면 "B204"로 기입 |
| 서비스명 | **확인 필요** | 문서에 공식 서비스명이 없다. 목업 작업명은 "Indie Stage"(가칭). 발표 전 확정 필요 |

---

## 1. 서비스 설명 / 주요기능

> 여러 밴드가 함께 여는 소규모 합동 공연의 **예매·QR 입장·수익 정산을 하나로 잇는 티켓팅·공동 정산 플랫폼.** "화폐가 코인인 미래"를 가정해 결제·정산·수령을 전부 원 단위 디지털 화폐 **KRWS**(Kaia Kairos 테스트넷)로 처리한다. 관객은 예매할 때 "누구를 보러 왔는지"를 고르고 그 선택이 온체인에 기록되며, 참여팀이 판매 전에 서명해 잠근 정산 규칙에 따라 **스마트 컨트랙트가 팀 리더 지갑으로 수익을 자동 분배**한다. 누구나 공개 검증 페이지에서 결과를 재계산할 수 있다.
>
> **주요 기능**
> ① 소셜 로그인(Web3Auth) → 비수탁 소셜 로그인 지갑 자동 생성 또는 보유 지갑 등록(서명 챌린지) → 시연용 KRWS 지급
> ② 공동 공연 생성 → 참여팀 초대 → 정산 규칙(균등·득표 비례·혼합) 합의 → 팀별 동의 서명 → 컨트랙트 잠금
> ③ 티켓 예매 + 관람 목적 팀 선택 → 관객 지갑 서명 결제(`purchase` 1 tx = 코인 이동 + 선택 기록, 가스비 플랫폼 대납)
> ④ 30초 회전 서명 QR 티켓 · 관계자용 웹 검표(원타임 처리, 중복 입장 차단)
> ⑤ 공연 전 취소·환불(에스크로 코인 반환), 공연 취소 시 전체 환불
> ⑥ 정산: 집계 → 잠금 → 이의제기 48h → 컨트랙트 분배(`release`) → 리더 지갑 수령. 치명 문제는 halt + 전액 환불
> ⑦ 공개 검증 페이지: 잠긴 규칙·온체인 집계·팀별 산출액·tx 링크·브라우저 재계산 + KRWS 발행량·에스크로 공시
> ⑧ 외국인 관객용 영어 기본 UI·USD 표시 환산

## 2. 프로젝트의 특장점 (기능 관점)

> ① **관객 선택이 정산 근거가 된다** — 예매 시 고른 "관람 목적 팀"이 분배 가중치. 합동 공연 정산에서 팀별 기여도를 데이터로 만든 국내 미확인 사례
> ② **판매 전 규칙 잠금** — 참여팀 전원이 각자 지갑으로 서명한 뒤에만 판매 시작, 이후 플랫폼도 변경 불가. 사후 규칙 변경·불투명 계산 분쟁 원천 차단
> ③ **결제부터 수령까지 한 화폐** — 결제·에스크로·분배·수령이 전부 KRWS라 환전·이체·정산 대사 단계가 없고, 공연 종료 후 분배 tx 1회로 정산 완결
> ④ **누구나 검증하는 공개 페이지** — 로그인 없이 잠긴 규칙 × 온체인 집계를 브라우저에서 재계산해 서버 표시값과 대조. 발행량·에스크로 합계 공시 포함
> ⑤ **블록체인 노출 최소화** — 시드 문구 없는 소셜 로그인 지갑, 가스비 대납으로 관객은 KRWS 잔액만 본다
> ⑥ **되돌릴 수 있는 정산 절차** — 분배 전 잠금·이의제기 창을 두어 온체인 비가역성을 운영 절차로 보완

## 3. 프로젝트의 차별점 / 독창성 (기술 관점)

> ① **온체인 분배가 곧 실제 정산** — KRWS(ERC-20, 원 단위) + RevenueSplitter 컨트랙트 2종. 결제 `purchase` 1 tx에 코인 이동과 팀 선택 기록을 묶어 집계가 "서버 입력값"이 아닌 "체인 이벤트의 합"
> ② **신뢰 장치 3종** — 관객 선택 온체인 기록 · 팀별 `agreeToRules` 동의 서명 · 공개 검증 페이지. "DB로도 되잖아요"에 대한 실체
> ③ **정산 상태 기계를 컨트랙트가 강제** — AGGREGATED → LOCKED → DISPUTE_OPEN → RELEASED / HALTED(종착, 전액 환불). DB·온체인 집계 대사 불일치 시 409로 정지, 사람이 판단
> ④ **비수탁 지갑 + 수수료 대납** — Web3Auth 비수탁 키 분산 지갑(시드 문구 없음)과 Kaia 프로토콜 레벨 fee delegation. 서버는 관객 키를 갖지 않고 OPERATOR·MINTER 2개 키만 보관, 비동기 `chain_job` 큐로 tx 멱등·재시도
> ⑤ **발행 어댑터 분리(CoinIssuerPort)** — 시연은 MockIssuer(자체 mint), 실서비스는 ExternalIssuer(실제 원화 스테이블코인 발행사)로 교체 가능한 구조. 규제·발행 주체 변화에 대비
> ⑥ **서명 동적 QR** — 30초 윈도우 HMAC + Redis `SETNX` 원타임. 캡처·복제 무력화
> ⑦ **Redis 활용** — 리프레시 토큰(TTL 14일), 지갑 잔액 캐시, 지갑 등록 챌린지(TTL 300초), 입장 원타임 락을 DB 대신 Redis로 처리해 스키마 단순화

## 4. 프로젝트에 활용된 AI 기술 (활용팀 작성 필수)

2026-08-27 팀 결정(Jira S15P21B204-6 완료): AI 기능 전부 제외. 컨설턴트·코치 권고("API 호출 수준 AI는 특장점 아님") 반영. 기능 명세 v6에도 AI 항목 없음.

> 해당 없음 (AI 미활용). 블록체인 기반 정산 신뢰 구조에 집중.

AI 활용 4축(데이터 활용·모델 적용·서비스 연계·경량화) 열이 있으면 전부 "해당 없음".

## 5. 역할별 담당자

팀 확정(2026-09-04). 기획·설계 문서는 전원이 분담했고 아래는 구현 단계 역할이다.

| 역할 | 담당 | 범위 |
|---|---|---|
| UI/UX | 신현경 | 화면설계·Figma 31화면·디자인 토큰, 반응형 기준, 월렛 패스(P1) |
| 프론트엔드 | 강병구 | React 19 앱 전체 — 관객·공연자·관리자·검증 화면, Web3Auth·ethers-ext 지갑 연동, i18n |
| 백엔드 | 양해미 | Spring Boot API — 회원·팀·공연·티켓·결제·환불·입장, 정산 규칙·이의제기 |
| 백엔드 · 블록체인 | 오민근 | RevenueSplitter·KRWS 컨트랙트, web3j-ext 체인 연동(chain_job·대납 전송·receipt 검증), 정산·검증 API |
| 인프라 | 이강륜 | GitLab CI·EC2·Docker·Nginx, 시크릿·환경 분리, 컨트랙트 배포 파이프라인, ERD·API 설계 문서 관리 |

> UI/UX 신현경 · FE 강병구 · BE 양해미 · BE/블록체인 오민근 · Infra 이강륜

## 6. 프론트/모바일 프레임워크

> React 19 · TypeScript · Vite 7 · React Router 7 · TanStack Query 5 · react-i18next · Tailwind CSS v4 · Node 22 LTS(pnpm) — 반응형 웹(모바일 390px / PC 1440px, 브레이크포인트 768px). 관객 화면은 모바일 우선, 공연자·관리자·검증 화면은 PC 우선. 네이티브 앱 없음. 검표 스캐너도 웹(`getUserMedia` + 브라우저 QR 디코딩). 지갑·서명은 Web3Auth SDK + ethers 6 · `@kaiachain/ethers-ext/v6`.

## 7. 백엔드 프레임워크

> Spring Boot 3.5.x · Java 17 · Spring Data JPA(Hibernate 6.6) · Spring Security + oauth2-jose(Web3Auth idToken JWKS 검증·세션 JWT) · Spring Data Redis(Lettuce) · Flyway 11 + flyway-mysql. Kotlin 미사용.

## 8. DB

> MySQL 8 (utf8mb4, 19 테이블, 상태 컬럼 ENUM, Flyway 마이그레이션 정본·`ddl-auto=none`) · Redis (리프레시 토큰 `auth:refresh:{jti}` TTL 14일, 지갑 잔액 캐시 `wallet:balance`, 지갑 등록 챌린지 TTL 300초, QR 입장 원타임 `SETNX`)

## 9. 주요 기술 스택

> **블록체인**: Solidity · OpenZeppelin v5 · Hardhat 3 · **Kaia Kairos 테스트넷(chainId 1001) 단일** · 컨트랙트 2종 KRWS(ERC-20, decimals 0, mint만) + RevenueSplitter(동의·잠금·purchase 선택 기록·집계·release·halt) · Kaia 수수료 대납(fee delegation)
> **지갑·인증**: Web3Auth Plug-and-Play Modal(소셜 로그인 3종, 비수탁 키 분산 지갑, idToken JWKS 검증) · 외부 지갑(Kaia Wallet) 자체 서명 챌린지 등록
> **체인 연동**: 서버 web3j 4.9.8 + Kaia `web3j-ext` v2.0.7 — fee payer 서명·전송, receipt 검증, 이벤트 조회, `chain_job` 비동기 큐(멱등·재시도·nonce 직렬화) · 프론트 ethers 6 + `@kaiachain/ethers-ext/v6` — 발신자 서명 RLP 생성 · 발행 어댑터 CoinIssuerPort(MockIssuer → ExternalIssuer 교체 가능)
> **프론트**: React 19 · TypeScript · Vite 7 · React Router 7 · TanStack Query 5 · react-i18next(en 기본·USD 환산) · Tailwind CSS v4(@theme 디자인 토큰) · Vitest · Node 22 · pnpm
> **백엔드**: Spring Boot 3.5.x · Java 17 · Gradle · JPA(Hibernate 6.6) · Security + oauth2-jose · MySQL 8 · Redis(Lettuce) · Flyway 11 · Testcontainers
> **인프라**: Docker · docker compose · GitLab CI(EC2 셀프 러너) · AWS EC2 · Nginx + HTTPS
> **설계 도구**: ERD Cloud · Figma · Jira · Notion · 상세 [기술 스택 v2](../design/09_기술_스택_v2.md)

## 10. 요구사항 명세서

> 요구사항 명세서 v6 (2026-09-03) — 도메인 13 · 기능 흐름 62: GitLab `docs/design/04_요구사항_명세서_v6.md` · 기능 명세서 v6 (활성 79건) `docs/design/05_기능_명세서_v6.md` · 비기능 요구사항 `docs/design/03_비기능_요구사항_명세서_v0_계획.md`

노션 미러는 v5까지 존재(요구사항 v5: https://app.notion.com/p/3cf2746d15ab81d3a89ec62fd3bbdc50). **v6 미러 작성 후(Jira S15P21B204-36) 노션 링크로 교체.** 그 전까지는 GitLab 경로를 붙인다.

## 11. 기획 (와이어프레임)

> 화면설계 v6 — 31화면, PC/모바일 반응형, NOL 티켓·티켓링크 레퍼런스: GitLab `docs/design/07_화면설계_v6.md` · Figma 31화면: https://www.figma.com/design/w8PbEAaCD4ImEQUJevp6RJ · 반응형 HTML 목업(공개): https://claude.ai/code/artifact/c3cee6f9-4588-4de5-a30f-8549991628f1

## 12. 설계 (ERD)

> ERD v5 — 19 테이블 · 225 컬럼 · FK 43 · ENUM 23 (2026-09-03): ERD Cloud https://www.erdcloud.com/d/kpxqsmzYGNrskWTMF · GitLab `docs/design/12_ERD_v5.md` + `12_ERD_v5_import.sql`

## 13. 설계 (API)

> API 명세서 v6 — 절 64 · P0 61 (2026-09-03): GitLab `docs/design/06_API_명세서_v6.md` · 공통 응답 규격 `{ code, data, msg }` `docs/design/01_API_공통_응답_규격_v2.md` · Redis 키 규약 §0.12

## 14. 외부 API

> ① **Web3Auth** — 소셜 로그인(Google 등 3종)·비수탁 지갑 생성·idToken 발급(서버는 JWKS로 검증)
> ② **Kaia Kairos JSON-RPC** (`public-en-kairos.node.kaia.io`) — 컨트랙트 배포·수수료 대납 tx 전송·receipt·이벤트 조회
> ③ **Kaiascan (Kairos)** — 검증 페이지·대시보드의 tx·주소 익스플로러 링크
> ④ **Kaia Kairos Faucet** — fee payer 운영 지갑 KAIA 충전
> ⑤ (P1) **Google Wallet API** — 티켓 패스(RotatingBarcode)
>
> 금융망·PG·환율 API 없음 — 코인 단일 세계관으로 법정화폐 입출구를 제거했고, 표시 환율은 관리자 등록값(`exchange_rate`)을 쓴다.

## 15. 배포자동화

> GitLab CI(EC2 셀프 러너, shell executor) → Docker 이미지 빌드·테스트(Testcontainers) → docker compose로 AWS EC2 배포, Nginx 리버스 프록시 + HTTPS. `develop` 머지 시 dev 자동 배포, `master`는 발표 환경. 컨트랙트는 Hardhat 스크립트로 Kairos 배포, 주소·ABI는 환경변수로 주입. MR 1인 승인 필수, 빌드·테스트 실패 시 머지 차단. 시크릿(OPERATOR·MINTER 키, `.env`)은 저장소·이미지 미포함.

상태: GitLab CI 확정(9/4, 러너 등록 가능 확인). 설계 진행 중(Jira S15P21B204-27, 이강륜). 파이프라인 파일이 나오면 경로 병기.

## 16. 테스트계획 / 결과

> **계획**: 핵심 시연 경로 시나리오(로그인·지갑 등록·지급 → 공연 생성·규칙 동의·잠금 → 예매·선택·서명 결제 → QR 입장 → 집계·잠금·이의제기 → release → 검증 페이지) + Hardhat 컨트랙트 단위 테스트(정산 공식·halt·환불) + 비기능 검증(동시 예매·검표 부하, 체인 노드 장애 주입, 리허설 2회, 실기기 매트릭스)
> **결과(W5 기입)**: Hardhat 테스트·커버리지, 부하 테스트 결과, DB·온체인 집계 대사 "불일치 0건", 리허설 기록, 비기능 명세서 검증 결과 열

노션 `테스트 시나리오` DB는 비어 있음. 계획 W3, 결과 W5.

---

## v1 대비 바뀐 것

| 항목 | v1 (8/28) | v2 (9/4) |
|---|---|---|
| 화폐·결제 | 금융망 원화 입금 → KRWS mint, 환급 시 burn → 금융망 이체, 준비금 증명 | 코인 단일. 법정화폐 입출구·준비금 삭제, 시연용 지급 |
| 지갑 | 공연자 팀 커스터디얼(서버 키 보관, envelope encryption) | 전 회원 비수탁 키 분산(Web3Auth) 또는 외부 지갑, 서버 키는 OPERATOR·MINTER 2개 |
| 체인 | Polygon Amoy + Besu 이중 | Kaia Kairos 단일, 수수료 대납 |
| 양도 | 카카오 링크 양도 MVP | 완전 제외 |
| 화면 | 34개, 디자인 제외 | 31개, 반응형, Figma·HTML 목업 완료 |
| ERD | 미작성 | v5 완료, ERD Cloud 동기화 |
| AI | 미결 | 미도입 확정 |
