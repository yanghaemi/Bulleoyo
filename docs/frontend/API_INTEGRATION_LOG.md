# 프론트 API 연동 로그

**Jira** S15P21B204-51 · **브랜치** `feat/fe/api-layer` · **작성 시작** 2026-09-11

> **기준이 바뀌었다.** 처음엔 `fix/fe/document-shell`(`a9ba728`) 위에서 작업했으나,
> `origin/develop`에 `feat/fe/ux-foundation`이 머지되면서 그쪽이 앞서 갔다.
> 컨벤션 §3.2대로 `origin/develop`(`37253f2`) 위로 리베이스했고 **SHA가 전부 바뀌었다** —
> 아래 표는 리베이스 후 값이다.
>
> 리베이스에서 `fix/fe/document-shell`의 커밋 3건은 **의도적으로 제외**했다. 그쪽은 Codex가
> 진행 중인 Stage Ledger 작업의 설계 문서이고, `router.tsx`가 develop과 충돌한다.
> 그 브랜치는 담당자가 따로 올려야 한다. 다만 `.worktrees/` 무시 규칙 한 줄(`61f98d9`)은
> 빠지면 Codex 워크트리 13만 줄이 실수로 커밋될 수 있어 되살렸다.

정본은 `docs/design/06_API_명세서_v6.md`와 그 기계 판독본 `docs/design/api/openapi.yaml`이다.
이 문서는 **명세를 대체하지 않는다.** 연동하면서 실제로 만난 것 — 커밋 SHA, 계약과 어긋난 지점,
아직 답이 없는 항목 — 만 기록한다. 명세 자체를 고쳐야 하는 건 여기서 고치지 않고 §4에 올린다.

---

## 0. 착수 시점의 사실

**백엔드는 명세 64개 엔드포인트를 전부 구현하고 있다.** `openapi.yaml`의 경로·메서드와
`backend/src/main/java/**/*Controller.java`의 매핑을 전수 비교한 결과 누락 0건, 명세 밖 0건이다.
따라서 이 작업은 백엔드 추가 구현이 아니라 **프론트 데이터 계층 신설**이다.

> ⚠ 경로가 있다는 것이 응답 shape가 명세와 같다는 뜻은 아니다. shape 대조는 §3 경계면 검증에서 한다.

프론트에 이미 있던 것 (다시 만들지 않았다):

| 파일 | 역할 |
|---|---|
| `shared/api/client.ts` | 래퍼 `{code,data,msg}` 해제, `code` 기반 분기, 401 코드별 처리, refresh single-flight, 멱등키, 검표용 `createEntryClient` |
| `shared/api/schema.ts` | 생성 타입 진입점 — `ApiData<'payment_01'>` 등 |
| `shared/api/generated/openapi.ts` | `pnpm gen:api`로 `openapi.yaml`에서 생성. 손으로 고치지 않는다 |
| `app/providers.tsx` | QueryClient 기본값 — `ApiError`면 재시도 안 함, mutation 재시도 없음 |

비어 있던 것: **도메인별 fetch 함수 · TanStack Query 훅 · DTO→뷰모델 매퍼.** 그게 이 작업이다.

---

## 1. 작업 경계 — Codex 워크트리와의 분리

Codex가 `codex/stage-ledger-foundation` 워크트리에서 티켓 결제·발권 연출을 **동시 작업 중**이다
(`a9ba728..codex/stage-ledger-foundation` 기준 실제 변경 143개 파일).

그 브랜치는 `frontend/src/shared/api/`를 **한 건도 건드리지 않는다.** 그래서 데이터 계층을
`features/` 바깥에 두면 `features/ticket/**` 수정 금지 조건을 지키면서도 ticket API를 연동할 수 있다.

```
frontend/src/shared/api/domains/{도메인}.ts   fetch 함수 + 매퍼
frontend/src/shared/queries/{도메인}.ts        Query/Mutation 훅 + 무효화
```

**이 작업이 건드리지 않은 것**: `features/**` 전부, `pages/**`, `app/**`,
`shared/ui/**`·`motion/**`·`charts/**`·`config/**`·`fx/**`, `package.json`, `pnpm-lock.yaml`,
`CLAUDE.md`, `docs/frontend/STAGE_LEDGER*`.

화면을 실제 API에 연결하는 일은 **이 범위 밖**이다. 계층만 세워 두고, 연결은 Codex 작업이
머지된 뒤 별도로 한다.

---

## 2. 커밋

| SHA | 메시지 | 내용 |
|---|---|---|
| `6815313` | feat: 쿼리 키 정본과 tx별 무효화 매핑 추가 | `shared/queries/keys.ts` — `qk.*` 키 팩토리와 `invalidatedBy(txType)` |
| `55fd4de` | docs(fe): API 연동 로그 시작 | 이 문서 |
| `ced3953` | fix: tx_type 12종을 명세대로 14종으로 정정하고 접두 키를 보강 | `types.ts` · `keys.ts` |
| `2732008` | feat: performance·rule·team API 계층 연동 | 23개 오퍼레이션 |
| `543c466` | feat: ticket·order·payment·refund·entry API 계층 연동 | 13개 |
| `a1bf8c3` | feat: member·wallet·chain API 계층 연동 + chain_job 폴링 훅 | 12개 + `useChainJob` |
| `3ca3c88` | feat: settlement·verify·coin·admin API 계층 연동 | 16개 |
| `65f8a0c` | fix: 불변식 번호 필드가 YAML boolean으로 먹히던 것과 낡은 생성 타입 | `openapi.yaml` · 생성물 |
| `06cab1a` | refactor: tx_type 목록을 한 곳으로 모으고 명세 대조를 컴파일 시점으로 | `types.ts` 외 5개 |
| `9387e38` | docs(fe): 연동 로그에 커밋 9건과 팀 확정 대기 8건 기록 | 이 문서 |
| `61f98d9` | chore: 로컬 worktree 경로 제외 | `.gitignore` 한 줄 — 리베이스에서 빠진 것을 되살림 |
| `667cbb9` | docs(fe): 리베이스 후 커밋 SHA 갱신과 기준 변경 경위 기록 | 이 문서 |
| `e3b7fa2` | fix: 판매 시작 폴링이 조용히 꺼지던 경로를 타입으로 갈랐다 | `domains/rule.ts` · `queries/rule.ts` |
| `3561cfe` | fix: 공개 경로에서 강제 로그아웃되던 길을 막는다 | `client.ts` · `domains/settlement.ts` |
| `869b6e9` | fix: 응답 스키마 42개에 required 를 올려 optional 추측을 없앤다 | `openapi.yaml` · 생성물 |
| `7a18587` | fix: 멱등키를 required 로 올리고 검증 예시가 없는 검산식을 유도하던 것을 고친다 | `openapi.yaml` · 생성물 |

합계 **64개 오퍼레이션**, 파일 27개(`domains/` 13 · `queries/` 14).

검증 (리베이스 후 `origin/develop` 위에서 실행):
`tsc -b --force --noEmit` exit 0 · `eslint` exit 0 · `vitest run` **9 파일 71 테스트 통과**.

### `6815313` — 쿼리 키 정본

두 가지를 한 곳으로 모았다.

**키 생성.** 호출부에서 `['tickets', id]`처럼 인라인으로 쓰면 무효화가 조용히 빗나간다.
한 곳이 단수 `['ticket', id]`로 써 두면 그 화면만 옛 데이터를 계속 보여주는데,
화면은 멀쩡하고 숫자만 틀리기 때문에 늦게 발견된다.

**무효화 대상 판단.** 결제가 확정되면 티켓·주문·지갑 잔액·판매현황·정산 집계가 한꺼번에
움직인다. 화면마다 "뭘 다시 불러야 하지"를 각자 판단하면 반드시 빠뜨리고, 특히 **지갑 잔액**은
거의 모든 tx가 바꾸는데 잘 잊힌다. 그래서 판단 주체를 `chain_job.txType` 하나로 옮겼다 —
`invalidatedBy(txType)`가 접두 키 배열을 돌려주고 호출부는 그대로 넘기기만 한다.

환불(`REFUND`)이 결제(`PURCHASE`)와 같은 목록을 무효화하는 것은 의도적이다.
**환불은 금액이 아니라 표 단위**라 1원만 환불해도 그 주문 표가 통째로 빠지고,
그래서 검증 화면의 표 카운터까지 함께 바뀐다.

---

## 3. 경계면 검증

보고서 원본: `_workspace/qa_api-layer_2026-09-11.md`.
백엔드 `record` 199개와 `openapi.yaml` 스키마 150개를 필드집합으로 자동 대조하고,
에러코드 85 ↔ 실제 throw 57 ↔ 프론트 문자열 58을 교차 비교했다.

> ⚠ `./gradlew test`는 **돌리지 못했다.** Docker 미기동이라 `IntegrationTestBase`(Testcontainers
> MySQL) 기반 테스트가 전부 기동 불가다. 아래는 **정적 대조 결과**이며, 실제 응답 캡처로
> 한 번 더 확인해야 확실하다.

### 3.1 좋은 결과

- **필드명 150개 중 146개 완전 일치.** 어긋난 건 `ChainJob.createdAt`(openapi에만),
  `MemberWalletSummary.walletId`·`explorerUrl`(백엔드에만) 셋뿐이다.
- **`Long` → `number` 정밀도 문제 없음.** 응답 DTO에 `BigInteger`가 0건이고 `YoYo.decimals()==0`이라
  int64가 전부 PK와 원화 정수다. 자바스크립트 안전 정수 범위를 넘을 값이 없다.
- **에러 코드 유령 0건.** 프론트가 분기에 쓰는 code 문자열이 전부 백엔드에 실재한다.

### 3.2 보고가 틀렸던 것 — 기록으로 남긴다

QA가 **최우선 BE 버그**로 올린 "`releaseHalted` 게이트 미결선"은 **사실이 아니다.**
인용된 코드가 실재하지 않았다. 확인한 내용:

| QA 주장 | 실제 |
|---|---|
| `SupplyReconciler`가 `ReleaseHaltGuard`를 구현하지 않는다(grep 0건) | `SupplyReconciler.java:86` — `implements ReleaseHaltGuard`, `@Component` |
| `:77-84`에 `releaseHalted() { return !snapshot().supplyMatched(); }` | 77–84행은 **javadoc**. 그런 메서드는 없다. `mintHalted()`(137행)와 혼동한 것 |
| `releaseHalted`가 불변식 ③을 보지 않는다 | `:246` — `releaseHalted = !supplyMatched \|\| !releaseScan.matched()`. ①·④ **또는** ③ — 명세 그대로 |

줄 번호가 붙은 코드 블록이라 그럴듯했다. **그대로 전달했으면 멀쩡한 백엔드를 고치러
팀원 시간을 태웠을 것이다.** 같은 보고서의 `rule_04` 건은 사실이었으므로 보고서를 통째로
버리는 것도 답이 아니다 — 항목별로 원본을 열어 확인해야 한다.

### 3.3 반영한 것

| 판정 | 항목 | 처리 |
|---|---|---|
| 수정(fe) | `rule_04`의 null `jobId`로 폴링이 조용히 꺼짐 | `e3b7fa2` — `saleStartPolling()`으로 타입 분리 |
| 수정(fe) | 공개 경로에서 `TOKEN_INVALID`가 강제 로그아웃을 태움 | `3561cfe` — `public` 옵션 신설 |
| 수정(명세) | 응답 스키마 `required` 누락 42개 | `869b6e9` — 생성 타입에서 49개 필드 optional 해제 |
| 수정(명세) | 멱등키가 `required: false` | `7a18587` |
| 수정(명세) | `verify_01` 예시가 없는 검산식을 유도 | `7a18587` |
| 팀 결정 | 202 본문 10건 | S15P21B204-92 |
| 팀 결정 | `chain_01` 컬럼 · `settlement_01` 권한 · `coin_01` stale 사유 | S15P21B204-93 |

`member_02`·`member_08`·`coin_04`는 `"미구현: …(P1)"`로 명시된 **의도적 스텁**이라 버그가 아니다.
다만 프론트가 `coin_04`용 `useChainConfig`를 이미 만들어 뒀으니 **화면을 붙이는 순간 500이다** —
P1이 확정되기 전에는 연결하지 않는다.

---

## 4. 고친 것과 올릴 것

### 4.1 고친 것 — 근거가 명확해 바로 정정

**`ChainTxType`이 12종으로 굳어 있었다** (`ced3953`).
§0.3은 **[2026-09-09 — S15P21B204-67]**에서 `CREATE_SHOW`·`START_SALE`을 신설해 14종이 됐고
Flyway도 14종인데, 손으로 쓴 `shared/api/types.ts`만 그 이전 상태였다.

그 변경의 핵심은 **`LOCK`을 정산 잠금 전용으로 분리한 것**이다. 종전엔 판매 시작과 겸용이라
확정 분기가 항상 판매 시작으로 해석돼 정산 잠금 job이 진행되지 않는 버그가 있었다.
프론트만 12종으로 남으면 판매 시작을 `LOCK`으로 되돌려 쓰게 되어 같은 버그가 재발한다.

**생성 타입이 9/9 판이었다** (`65f8a0c`).
`ChainJob.txType`이 생성물에서 12종이라, 판매 개시가 확정돼도 `START_SALE`이 미지의 값으로
떨어져 **무효화가 통째로 건너뛰어진다.** 공연은 `ON_SALE`인데 화면만 옛 상태로 남고 에러는 없다.
`pnpm gen:api` 재실행으로 해소. 같은 목록이 세 곳에 있던 구조도 배열 하나로 합치고,
생성물과 어긋나면 컴파일이 깨지도록 대조를 걸었다(`06cab1a`) — 값 하나를 빼서 실제로 확인했다.

**`openapi.yaml`의 불변식 번호 필드 이름이 `false`였다** (`65f8a0c`).
`no:`로 쓴 키를 YAML 1.1이 boolean으로 읽어 파일에 `false:`로 굳었고, 생성 타입이
`false?: 1|2|3|4`가 됐다. 백엔드는 `no`를 보낸다(`CoinDtos.Invariant`의 `Integer no`).
`"no":`로 따옴표를 씌워 정정 — 계약 변경이 아니라 원래 의도로 되돌린 것이다.
같은 지뢰(`yes`/`on`/`off`)는 전수 검색했고 이 한 건뿐이었다.

**쿼리 키 접두 무효화가 빗나갔다** (`ced3953`, `06cab1a`).
`list(params)`와 `list()`는 형제지 접두가 아니라, 후자로 전자를 무효화할 수 없다.
`mines()`·`transactionsAll()`·`grantsAll()`·`disputesAll()` 접두 헬퍼를 짝지었다.
`qk.team.me()`는 지웠다 — `/teams/me`(team_02)는 단건이 아니라 **페이지네이션 목록**이라
단건 키에 담으면 페이지가 서로를 덮어쓴다.

### 4.2 올릴 것 — 경계면 검증 후 정리

처음 8건으로 올렸으나 검증에서 **대부분은 질문이 아니라 답이 정해진 작업**으로 드러났다.
아래가 정리 결과다.

**해소됨 (5건)** — 근거가 확정돼 직접 고쳤다.

| 항목 | 처리 |
|---|---|
| 응답 스키마 `required` 누락 | 백엔드 record의 primitive(=null 불가)만 추려 42개 스키마 확정 → `869b6e9` |
| `Idempotency-Key` `required: false` | 참조처가 §0.8의 필수 6개뿐이라 공용 정의를 `true`로 → `7a18587` |
| `verify_01` 예시가 검산식을 유도 | 주문 수 쪽을 어긋나게 조정 → `7a18587` |
| `client.ts` 공개 경로 옵션 | `public` 신설. **`skipAuth`만으로는 안 되는 이유**를 파악했다 — `skipAuth`는 refresh 호출에도 쓰이고 그쪽은 `TOKEN_INVALID`에 로그아웃하는 것이 맞다 → `3561cfe` |
| wallet 409 에러 코드 | **물을 필요가 없었다.** §16.1은 "제안"이고 채택되지 않았다. `ErrorCode.java` §3.3의 `WALLET_*`는 전부 **팀 지갑**용으로 별개다. `COMMON_CONFLICT`가 의도된 현 상태다 |

**팀으로 올림 (4건)**

| 항목 | Jira | 왜 팀 사안인가 |
|---|---|---|
| 202 본문 10건 | S15P21B204-92 | openapi를 백엔드에 맞추는 일인데 10개 op에 걸쳐 BE·FE 계약이 동시에 움직인다. 혼자 고치면 다른 파트가 모르는 채로 명세가 바뀐다 |
| `chain_01`의 `verification`·`results`·`blockNumber` | S15P21B204-93 | ERD v5에 컬럼이 없어 항상 null이다. 컬럼 추가냐 명세 축소냐 — ERD 변경 |
| `settlement_01` ADMIN 권한 | S15P21B204-93 | M-02가 막힌다. 권한 설계 |
| `coin_01` `stale` 사유 미구분 | S15P21B204-93 | Redis 장애가 "체인 조회 지연"으로 공시된다. 응답 필드 추가 |

### 4.3 남은 구조 정리 (급하지 않음)

- `int`/`text`/`nullable*` 매퍼 헬퍼가 도메인 파일마다 중복돼 있다. `domains/_mapper.ts`로 모을 수 있다.
- `shared/api/types.ts`는 여전히 "손으로 쓴 임시" 파일이다. 생성물이 덮는 부분(`Money` 등)은
  `schema.ts` 재export로 옮겨 이중 정의를 없애는 게 맞다 — 지금은 `Money`가 생성본 `number` /
  `types.ts` 객체로 갈려 있고, import 출처에 따라 의미가 뒤집힌다. **현재 활성 사용처는 없다.**
