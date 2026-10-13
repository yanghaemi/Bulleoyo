# B안 검증 결과 — Kaia Kairos fee delegation (가스비 대납)

> **[2026-09-07] 이 폴더에는 이제 검증 기록 문서 2개(`RESULT.md`·`HANDOFF.md`)만 있다.**
> 스파이크 실행 코드 26개 파일(`blockchain/spike/*.js`·`MiniERC20.sol`·`spike-java/`·`spike-web/`)은
> 검증이 끝나 develop에 올리지 않기로 하고 삭제했다. 판정과 tx 해시는 이 문서들에 그대로 남아 있고,
> 결론 요약은 하네스 `project-truth` §8.5에 있다.
>
> **코드가 필요하면** 이 저장소 히스토리에서 그대로 복원된다 — 삭제 직전 커밋 `e78d343`,
> 또는 원본 6커밋 `fac21a5`·`d2a09d3`·`1d089c1`·`d01cf4d`·`ee3f632`·`67e9c4d`.
> (`git show e78d343:blockchain/spike/layer1-fee-delegation.js` 처럼 파일 하나만 꺼낼 수도 있다.)
> 오민근 로컬에는 브랜치 `spike/fee-delegation-backup`에도 있다(원격 미push).


목표: 사용자가 KAIA 없이 트랜잭션 서명, 운영지갑이 가스 대납. 백엔드 web3j로 가능한가.

## 결론

**기술적으로 가능. B안 채택 가능. 3개 Layer 전부 PASS.** Kairos 테스트넷에서
Node·Java 대납 + Web3Auth 로그인 키 호환까지 전부 확인.
단 순수 `web3j`가 아니라 Kaia 공식 확장 **`web3j-ext`** 를 써야 한다.

## Layer별 검증

| Layer | 내용 | 결과 |
|-------|------|:----:|
| 1 | Node.js `@kaiachain/ethers-ext` 로 대납 (메커니즘 자체) | ✅ PASS |
| 3 | Java `io.kaia:web3j-ext` 로 대납 (백엔드 실물 스택) | ✅ PASS |
| 2 | Web3Auth 로그인 키가 대납 트랜잭션과 호환되나 | ✅ PASS |

- 트랜잭션 타입: `FeeDelegatedValueTransfer` (value 0). 사용자 지갑 A 잔액 0인데 전송 성공, 가스는 운영지갑 B에서만 차감 → 대납 확인.
- Layer 1 tx: `0x7a51f566...82d957`
- Layer 3 tx: `0x114c4ccb...3adfe1`
- Layer 2: Web3Auth sender `0x626391...eb806` nonce 1, 잔액 0 유지, 가스는 B에서 0.0008525 KAIA 차감.

## 검증 중 걸린 것 (구현 시 그대로 재현됨)

1. **feeDelegated 타입은 nonce/gasPrice 자동 세팅 안 됨.** 표준 ethers/web3j처럼 populate 안 해주므로 nonce·gasPrice·gasLimit을 직접 넣어야 서명된다. (Node·Java 공통)
2. **web3j-ext 클래스명이 공식 문서와 다르다.** 문서 예제는 구 Klaytn 명칭(`KlayCredentials`·`KlayRawTransaction`·`KlayTransactionEncoder`), 실제 v1.0.0 jar은 리브랜딩된 **`Kaia*`** 명칭. import 그대로 복붙하면 `cannot find symbol`.
3. **Java 버전.** 문서 권장은 11~18이나 **JDK 21에서 정상 동작** 확인.

## 의존성 (Java, 검증된 좌표)

```gradle
implementation 'io.kaia:web3j-ext:v1.0.0'
implementation 'io.kaia:web3rpc-java:v1.0.0'
implementation 'org.web3j:core:4.9.8'
```
- `Web3j` = `org.web3j.protocol.kaia.Web3j` (Kaia 확장)
- 서명 순서: `KaiaTransactionEncoder.signMessage(raw, chainId, sender)` → 같은 raw에 `signMessageAsFeePayer(raw, chainId, feePayer)` → 최종 서명 hex → `ethSendRawTransaction`

## Layer 2 (Web3Auth) 실전 지식

- 개인키 추출 JRPC 메서드명은 `eth_private_key` 가 아니라 **`private_key`** (MetaMask Embedded Wallets = Web3Auth v10). SDK `@web3auth/modal` ^10.
- 대시보드(developer.metamask.io) Project Settings → **Advanced → Enable Key Export** 토글 ON 필요(기본 ON).
- 추출된 키 = 표준 secp256k1 → Layer 1/3의 raw key와 동일. 프론트에서 Kaia feeDelegated 타입 서명 직접 가능 → **비수탁 유지**(키는 클라이언트, feePayer 서명만 백엔드).
- 브라우저(Vite) 폴리필 마찰 — 실배포엔 없지만 로컬 개발 세팅에 필요:
  - `vite-plugin-node-polyfills` (Buffer/global/process)
  - `ox` 패키지 (web3auth v10의 permissionless가 peer로 요구)
  - `process.nextTick` 부재 → `process` 패키지 + alias(`vite-plugin-node-polyfills/shims/process`, `process/` → `process/browser.js`) + index.html inline shim
  - dev server COOP 헤더 `same-origin-allow-popups` (소셜 로그인 팝업 window.closed 감지)
  - hCaptcha "localhost detected"는 경고일 뿐 로그인 통과됨

## 참고

- gasPrice는 Kairos baseFee 하한 반영해 `ethGasPrice` 반환값 사용(측정 27.5 gkei). 하드코딩 금지.
- devnet은 주기적 key rotation으로 지갑 유실 가능 — 실서비스는 sapphire_mainnet 전환 필요.

## 실행법

```bash
# Node (Layer 1)
cd blockchain/spike
npm install
npm run gen        # 지갑 2개 생성 → .env (A 사용자 / B 운영)
# faucet https://faucet.kaia.io 에서 B 주소로 KAIA 충전
npm run balance    # B 잔액 확인
npm run layer1     # 대납 검증

# Java (Layer 3) - 같은 .env 재사용
cd ../spike-java
gradle run         # A 서명 → B 대납 → Kairos 전송
```

---

## 추가 검증 (2026-09-04) — 실제 설계 tx 타입 `FeeDelegatedSmartContractExecution`

위 3 Layer는 `FeeDelegatedValueTransfer`로 했다. 이 서비스는 그 타입을 안 쓴다(결제 = ERC-20 `approve` + `RevenueSplitter.purchase`).
그래서 최소 ERC-20(`MiniERC20.sol`)을 Kairos에 올리고 **`approve(B, 12345)`를 A(가스 0)가 서명, B가 대납**하는 경로를 Node·Java 양쪽에서 재검증했다.

| Layer | 내용 | 결과 | tx |
|-------|------|:----:|-----|
| 1b | Node `@kaiachain/ethers-ext` — `TxType.FeeDelegatedSmartContractExecution` (0x31), `input` 필드에 calldata | ✅ PASS | `0xb32855e97b8f7e278008090cd6e7dba90eea087fe6e452f3f2f6b789d927d009` |
| 3b | Java `io.kaia:web3j-ext` — `Type.FEE_DELEGATED_SMART_CONTRACT_EXECUTION`, `createTransaction(type, nonce, gasPrice, gas, to, value, from, payload)` | ✅ PASS | `0xef667a0454c84728bc2c3b73534bd65ea2d3a12febc2b52f93b4a0db165d231e` |

- MiniERC20 주소(Kairos): `0x0F33eF0a95A53EE2ccbD9AA3615c5C728E66be1c` (배포 tx `0xb5c4ac44…318b`, 배포자 B)
- 판정 항목 5개 전부 true: `receipt.status = 1` · `Approval(A, B, 12345)` 이벤트 파싱 · `allowance(A,B) == 12345` (eth_call) · A KAIA 잔액 0 불변 · B만 가스 차감
- 실측 가스: Node 56,103 gas / 0.00154 KAIA, Java 36,203 gas / 0.000996 KAIA (두 번째 approve는 storage 갱신이라 저렴)
- 서버 측 검증 흉내(SEC-19): `send-rlp.js`가 RLP를 `parseTransaction`으로 열어 type·from·to·selector(`0x095ea7b3`) 대조 후 대납

### 구현 시 그대로 적용되는 것
- **Node/브라우저**: calldata는 `input` 키(ethers 표준 `data` 아님). `nonce`·`gasPrice`·`gasLimit` 수동 populate는 ValueTransfer와 동일.
- **Java**: `FunctionEncoder.encode(...)` → `Numeric.hexStringToByteArray` → `payload`. 서명 순서 `signMessage` → `signMessageAsFeePayer` 동일.
- 이벤트 검증은 `receipt.getLogs()`에서 `topic0 == keccak("Approval(address,address,uint256)")`, owner/spender는 topic1·2 뒤 40자.

### 남은 것 — Kaia Wallet 확장 (Layer 2b)
Web3Auth 키(Layer 2)는 raw key라 서명이 코드에서 끝났다. **Kaia Wallet 확장**은 사람이 팝업을 눌러야 해서 자동화 불가.
`kaia-wallet-sign.html`(라이브러리 0)로 확장에 `FEE_DELEGATED_SMART_CONTRACT_EXECUTION` 서명을 요청하고, 나온 RLP를 `node send-rlp.js <RLP>`로 B가 대납 전송하면 끝.
실패하면 §14-35 방안 C(외부 지갑 P1, 전원 Web3Auth) 실행.

### 실행법 (추가)
```bash
cd blockchain/spike
npm run deploy-token   # MiniERC20 배포 → .env TOKEN_ADDRESS
npm run layer1b        # Node SCE 대납
npm run serve          # http://localhost:8787/kaia-wallet-sign.html  (Kaia Wallet 확장 테스트)
node send-rlp.js <RLP> # 확장이 만든 발신자 서명 RLP를 B가 대납 전송

cd ../spike-java       # JAVA_HOME=.jdks/temurin-21.0.11
gradle run "-PmainClass=spike.Layer3SmartContractExecution"
```

### Layer 2b — Kaia Wallet 확장 (2026-09-04) ✅ PASS

Kaia Wallet 확장 **v3.5.0**, Kairos(1001) 선택 상태에서 `kaia-wallet-sign.html`로 서명 요청.

| 항목 | 결과 |
|------|------|
| 확장 주입 객체 | `window.klaytn` (localhost http 서빙, 파일 URL 권한 불필요) |
| `kaia_signTransaction` | ❌ `Internal JSON-RPC error` |
| **`klay_signTransaction`** | ✅ 응답 `{ messageHash, v, r, s, rawTransaction }` — `rawTransaction` prefix **`0x31`** |
| 대납 전송 (`send-rlp.js`, B fee payer) | ✅ tx `0xdab61ca2d1e7c186ba97c631060b75634c0de2778d49e04067d9a34857bd0778`, `status 1` |
| 사용자 지갑 `0xbe123d…be18e` KAIA | 0 → 0 (불변). B가 0.00154 KAIA 부담 |
| `allowance(사용자, B)` | 12345 |

**구현 시 그대로 적용** — 확장 3.5.0은 `kaia_*` 미지원, **`klay_signTransaction`** 사용. tx 객체는 `{ type: "FEE_DELEGATED_SMART_CONTRACT_EXECUTION", from, to, value: "0x0", gas, data }`. 반환 `rawTransaction`이 곧 서버로 보낼 `senderSignedRlp`.

## 최종 — 스택 확정 (2026-09-04)

| 조건 (결정 v2 §14-27) | 결과 |
|---|:--:|
| ① Web3Auth 키 → ethers-ext `FeeDelegatedSmartContractExecution` 발신자 서명 | ✅ (Layer 2 키 + Layer 1b 타입) |
| ② Kaia Wallet 확장에서 같은 타입 RLP | ✅ Layer 2b |
| ③ web3j-ext fee payer 서명 → Kairos → receipt | ✅ Layer 3b |
| ④ 발신자 KAIA 0에서 성공 | ✅ 전 Layer |

**방안 C(외부 지갑 P1 하향) 불필요. Web3Auth + Kaia Wallet 둘 다 MVP 유지.**

### 코인 실제 이동 검증 (2026-09-04) ✅ PASS

`approve`는 "사용 승인"이라 코인이 움직이지 않는다. 실제 가치 이동(= 결제·정산과 같은 성질)까지 확인했다.

| 단계 | 동작 | tx |
|------|------|-----|
| 1 | B(운영지갑)가 Kaia Wallet 주소로 **100 SPK 지급** — 설계의 "지갑 등록 직후 기본 잔액 지급"에 해당 | `0x122ed75b57005ce46e3d78452bf92be39a5cdb84270c98c5c2c705018edbf9fb` |
| 2 | Kaia Wallet 확장이 `transfer(A, 3)` 발신자 서명 (KAIA 0) → B 대납 전송 | `0x6ea8bf6f50ba55714042b003b05be9aa5406060145f0fa0c9da91f6d9fec2100` |

- 잔액 변화: Kaia Wallet `0xbe123d…be18e` **100 → 97 SPK**, 수신 `0xc083d9…c5cA` **0 → 3 SPK**
- 양쪽 KAIA 모두 **0 불변**. 수수료 0.0016947975 KAIA는 feePayer B가 전액 부담
- 노드 기록: `typeInt 49`(0x31) · `from` ≠ `feePayer` · `Transfer(from, to, 3)` 이벤트 1건 · `status 0x1` · gasUsed 61,629
- 확인 경로 — KaiaScan 주소 페이지 Token Transfers/Balances 탭, tx 페이지의 **Fee Payer** 필드, 운영지갑의 **수수료 위임 TX** 탭

**의미** — 관객 결제(지갑 → 에스크로)·정산 수령(컨트랙트 → 리더 지갑)이 같은 tx 타입·같은 대납 경로를 쓴다. 받는 쪽이 지갑이냐 컨트랙트냐만 다르다.

### 추가된 스파이크 도구
| 파일 | 용도 |
|---|---|
| `deploy-token.js` | MiniERC20을 Kairos에 배포 → `.env TOKEN_ADDRESS` |
| `grant-token.js` | `node grant-token.js <주소> [수량]` — 시연용 코인 지급(mint 대역) |
| `balances.js` | `node balances.js [주소...]` — SPK·KAIA 잔액 일람 |
| `layer1b-smart-contract-execution.js` | Node에서 SCE 대납 전 과정 |
| `send-rlp.js` | 발신자 서명 RLP를 받아 fee payer 서명·전송 (서버 역할) |
| `kaia-wallet-sign.html` | 확장 서명 요청 UI — `approve` / `transfer` 선택, 수량 지정 |
