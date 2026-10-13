# blockchain

B204 공연 공동정산의 온체인 부분. **블록체인 적용 영역은 정산 하나**다 — 예매·QR 입장·환불 처리는 평범한 웹 서비스다.

체인이 맡는 일 셋:
1. 정산 규칙을 판매 시작 전에 잠근다
2. 관객이 고른 팀을 결제 트랜잭션 안에서 기록·집계한다
3. 잠긴 규칙 × 집계로 YoYo를 팀 리더 지갑에 분배한다

| 컨트랙트 | 역할 |
|---|---|
| `YoYo` | ERC-20, **`decimals = 0`**(1 YoYo = ₩1). **mint만 있고 burn이 없다.** `mint(to, amount, bytes32 grantRef)` — 시연용 지급 전용, `MINTER_ROLE` |
| `RevenueSplitter` | 공연 생성·팀 동의·규칙 잠금 · `purchase`(결제 + 관람 목적 팀 기록을 1 tx) · 환불 · 집계 확정 · 정산 잠금 · `release`(팀 리더 지갑으로 **push**) · `halt` |

정확한 함수·이벤트·revert 시그니처는 **`docs/design/13_컨트랙트_인터페이스_v1.md`가 정본**이다(9/9 고정, Jira `S15P21B204-25`). 그 문서가 오민근(컨트랙트) ↔ 이강륜(서버 체인 모듈) ↔ 강병구(프론트 서명) 사이의 계약이다.

## 스택

Solidity **0.8.28** · OpenZeppelin **v5** · Hardhat **3** · **Kaia Kairos 단일**(chainId 1001, 백업 체인 없음) · Node 22 LTS · npm(`package-lock.json`)

## 키 모델 — 3개, 세 주소가 전부 달라야 한다

| 키 | 역할 | 어디 있나 |
|---|---|---|
| **admin** | 두 컨트랙트의 **배포자**. `pause`/`unpause` · `rotateMinter` · `rotateOperator` 전용 | **콜드. 서버에 넣지 않는다.** Jenkins Secret text |
| **OPERATOR** | 대납 fee payer, 정산 운영 tx | 서버 런타임 |
| **MINTER** | `YoYo.mint` | 서버 런타임 |

admin이 OPERATOR와 같으면 상시 켜져 있는 키 하나로 `rotateMinter(자기 주소)` → `mint(무제한)`이 열려 발행량 공시가 무의미해진다. `RevenueSplitter` 생성자의 `RoleConflict()`가 이 구성을 **배포 시점에 강제**한다 — OPERATOR 키로 배포하면 그냥 revert한다.

## 실행

```bash
npm ci
npx hardhat build          # 컴파일
npx hardhat test           # 테스트 (인메모리 edr-simulated, 로컬 노드 불필요)
npx hardhat node           # 로컬 노드가 필요할 때만
```

### Kairos 배포

변수 이름은 저장소 루트 `.env.example`이 정본이다. `configVariable()`은 **`.env` 파일을 읽지 않는다** — 환경변수 또는 keystore로 넣는다.

```bash
npx hardhat keystore set KAIA_RPC_URL        # 권장 (암호화 저장, 1회)
npx hardhat keystore set ADMIN_PRIVATE_KEY   # 배포 서명자는 admin 이다

npx hardhat run scripts/deploy.ts --network kairos   # = npm run deploy:kairos
npm run verify:kairos                                # KaiaScan + Sourcify 소스 검증
```

`npm run verify:kairos`(= `scripts/verify.ts`)가 **정규 경로**다. `deployments/kairos.json`에서 주소와 생성자 인자를 읽어 두 컨트랙트를 제출하고, 두 프로바이더가 모두 성공한 컨트랙트만 `verification` 필드를 갱신한다(등급까지 — `sourcifyMatch`). verify는 **주소 단위**이므로 **재배포하면 반드시 다시 돌린다.** 서명은 하지 않으니 콜드 키를 셸에 끌어오지 말고 더미 값으로 돌린다 — `ADMIN_PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000001`(64자리 hex 아무 값), `KAIA_RPC_URL=https://public-en-kairos.node.kaia.io`. 자세한 절차는 문서 13 §2.2-5.

한 건만 다시 할 때는 손으로:

```bash
npx hardhat verify --network kairos <주소> <생성자 인자…>
```

생성자에 OPERATOR·MINTER **주소**가 필요하다(개인키가 아니다). CI는 `.env.example`의 `OPERATOR_ADDRESS`·`MINTER_ADDRESS`를 읽어 넘긴다. 로컬에서 그 값이 없으면 `OPERATOR_PRIVATE_KEY`·`MINTER_PRIVATE_KEY`에서 주소만 유도하는 폴백이 돈다.

PowerShell에서는 `&&`가 파서 에러다. `$env:KAIA_RPC_URL="…"; npx hardhat run …`.

배포 스크립트는 **어서션 4개**를 걸고 하나라도 깨지면 0이 아닌 종료 코드로 끝난다 — `decimals() == 0` · `Splitter.token() == YoYo` · 세 주소 상이 · `deployer == admin`. 특히 두 번째는 형식 검사가 아니다(아래 §주의).

배포 결과 `deployments/kairos.json`을 **커밋해야** CI가 백엔드·프론트 환경변수로 주입한다. Jenkins `DEPLOY_CONTRACT`로 배포하면 결과가 아티팩트로만 남으므로 내려받아 커밋한다. 주소가 바뀌면 KaiaScan 링크·서버 env·프론트 config가 전부 바뀌니 **재배포는 최소화**한다(1차 9/9, 최종 W5). 이 스크립트는 **멱등하지 않다** — 재실행하면 새 주소로 새로 배포된다.

## 디렉터리

| 경로 | 내용 |
|---|---|
| `contracts/` | `YoYo.sol`(완성) · `RevenueSplitter.sol`(Phase B 진행 중) |
| `test/` | `Audit.1.test.ts`(지금 판정 가능) · `Audit.2.test.ts`(Phase B 재현용) — 감사자 소유, 구현자가 고치지 않는다 |
| `scripts/` | `deploy.ts`(배포) · `verify.ts`(KaiaScan+Sourcify 검증 · `verification` 갱신) · `extract-abi.mjs` |
| `deployments/` | `kairos.json`(주소) · `abi/`(web3j·프론트가 읽는 ABI) — 커밋 대상. `localhost/`는 gitignore |
| `spike/` | **9/2~9/4 수수료 대납 검증 기록.** 실행 코드는 검증 후 삭제했고 `RESULT.md`·`HANDOFF.md`만 남았다. 코드가 필요하면 `git show e78d343:blockchain/spike/<파일>` |

ABI는 `npx hardhat build && node scripts/extract-abi.mjs`로 다시 만든다. `index.json`의 `abiHash`로 "커밋된 ABI == 래퍼 생성에 쓴 ABI"를 대조한다.

## 손대기 전에 알아야 할 것

- **`decimals = 0`.** 오버라이드를 빠뜨리면 금액이 1e18배로 어긋난 채 비율만 맞아 테스트가 통과한다. 서버·프론트에서 `parseEther`·`parseUnits(x, 18)`를 절대 쓰지 않는다 — 10,000원은 `10000`이다.
- **burn이 없다.** 법정화폐로 되돌리는 출구가 설계에 없다. `_burn` 호출 경로를 만들지 않는다.
- **`Splitter.token() == YoYo` 어서션은 형식이 아니다.** `createShow`의 팀 지갑 검증에서 YoYo role 조회 두 개가 저수준 `staticcall`이라, 토큰이 YoYo가 아니면 **조용히 꺼진다.** `createShow`는 정상 진행하지만 그 배포에는 "팀 지갑 ≠ 발행 권한" 방어가 존재하지 않는다. 실패가 눈에 보이지 않으므로 이 어서션이 그 검사의 동작을 보장하는 유일한 장치다.
- **OpenZeppelin v5**에서 `PaymentSplitter`·`_beforeTokenTransfer`·`Counters`가 삭제됐다. 검색 결과 상위 대부분이 v4다 — 그대로 복붙하면 컴파일이 안 된다. 분배 로직은 어떤 라이브러리에도 없으므로 직접 쓴다.
- **Hardhat 3**은 v2와 설정 스키마가 다르다. 인메모리 네트워크 type은 `"edr-simulated"`(`"edr"`은 로드 실패), 플러그인은 `plugins:` 배열, 비밀값은 `configVariable()`. 스크립트에서 `network.connect()`는 3.15에서 deprecated — `network.create()`를 쓴다.
- **로컬 노드는 Kaia 수수료 대납 tx 타입을 모른다.** 컨트랙트 로직은 로컬에서, 대납 경로는 Kairos에서 검증한다. 컨트랙트 입장에서 대납 tx의 `msg.sender`는 발신자(관객·팀 리더)이므로 로직 테스트는 일반 tx로 충분하다.
- **`agreeToRules`·`purchase`·`deposit`는 그 사용자의 키로만.** 운영자가 대신 부를 수 있으면 온체인 동의 증거가 무의미해진다.
- **정산 계산은 컨트랙트 안에서** 한다. 서버가 계산해 결과만 올리면 제3자 재현 검증이 불가능해지고 프로젝트의 존재 이유가 사라진다.
- **`package.json`에 `postinstall` 같은 라이프사이클 스크립트를 두지 않는다.** Jenkins `Deploy contract`에서 `npm ci`가 **콜드 키가 export된 셸**에서 돈다.
- **"trustless"·"탈중앙"이라고 쓰지 않는다.** 운영자가 발의·실행한다. 보장하는 것은 잠긴 규칙의 사후 변조 불가 · 기록의 소급 수정 불가 · 분배 계산의 결정론적 재현 · 참여팀의 독립 검증 경로까지다.

## 참고

- 기술 스택 정본: [`docs/design/09_기술_스택_v3.md`](../docs/design/09_기술_스택_v3.md)
- 컨트랙트 인터페이스 계약: [`docs/design/13_컨트랙트_인터페이스_v1.md`](../docs/design/13_컨트랙트_인터페이스_v1.md)
- 로컬 개발 전체 안내: [`docs/planning/11_개발_환경_안내_v1.md`](../docs/planning/11_개발_환경_안내_v1.md)
