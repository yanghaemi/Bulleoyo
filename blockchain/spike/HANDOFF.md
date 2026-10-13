# 인수인계 — 2026-09-02~03 작업 기록

> **[2026-09-07] 이 폴더에는 이제 검증 기록 문서 2개(`RESULT.md`·`HANDOFF.md`)만 있다.**
> 스파이크 실행 코드 26개 파일(`blockchain/spike/*.js`·`MiniERC20.sol`·`spike-java/`·`spike-web/`)은
> 검증이 끝나 develop에 올리지 않기로 하고 삭제했다. 판정과 tx 해시는 이 문서들에 그대로 남아 있고,
> 결론 요약은 하네스 `project-truth` §8.5에 있다.
>
> **코드가 필요하면** 이 저장소 히스토리에서 그대로 복원된다 — 삭제 직전 커밋 `e78d343`,
> 또는 원본 6커밋 `fac21a5`·`d2a09d3`·`1d089c1`·`d01cf4d`·`ee3f632`·`67e9c4d`.
> (`git show e78d343:blockchain/spike/layer1-fee-delegation.js` 처럼 파일 하나만 꺼낼 수도 있다.)
> 오민근 로컬에는 브랜치 `spike/fee-delegation-backup`에도 있다(원격 미push).


다음 세션이 이걸 읽고 바로 이어서 작업하면 된다.

## 1. 완료: B안(가스비 대납) 기술 검증 — 3 Layer 전부 PASS

사용자가 KAIA 없이 트랜잭션 서명하고 운영지갑이 가스 대납하는 구조를 Kairos 테스트넷에서 실증.
상세는 [RESULT.md](./RESULT.md).

| Layer | 내용 | tx |
|-------|------|-----|
| 1 | Node `@kaiachain/ethers-ext` 대납 | `0x7a51f566...82d957` |
| 3 | Java `io.kaia:web3j-ext` 대납 (백엔드 스택) | `0x114c4ccb...3adfe1` |
| 2 | Web3Auth 로그인 키 × 대납 호환 | sender `0x626391...eb806` |

- 운영지갑(feePayer) `0x21e5fbBb7B81C21aFa0Dc41AacCac83343395D41` — Kaiascan "수수료 위임 TX" 탭에서 3건 확인 가능
- 대납 1건당 실측 가스 **0.0008525 KAIA**

### 남은 갭 — 2026-09-04 갱신
~~검증은 `FeeDelegatedValueTransfer`로 했고 설계가 요구하는 건 `FeeDelegatedSmartContractExecution`~~
→ **닫힘.** MiniERC20을 Kairos에 올려 `approve` 대납을 Node(1b)·Java(3b) 양쪽 PASS. tx·판정은 RESULT.md "추가 검증" 절.

**Kaia Wallet 확장(Layer 2b)도 닫힘 (9/4).** 확장 3.5.0 `klay_signTransaction`으로 0x31 RLP 획득 → B 대납 전송 PASS
(tx `0xdab61ca2…0778`). `kaia_signTransaction`은 미지원. → **§14-27 4항목 전부 PASS, 스택 확정. 방안 C 불필요.**

## 2. 코드 위치 (삭제됨 — 아래는 삭제 당시의 배치다)

> 이 절의 경로는 **더 이상 존재하지 않는다.** 위 안내대로 히스토리에서 복원해 읽어라.

```
blockchain/spike/       Node (Layer 1·1b) — gen-wallets / balance / layer1-fee-delegation
                        + deploy-token(MiniERC20) / layer1b-smart-contract-execution / send-rlp / kaia-wallet-sign.html
blockchain/spike-java/  Java (Layer 3·3b) — Gradle, io.kaia:web3j-ext. SCE는 -PmainClass=spike.Layer3SmartContractExecution
blockchain/spike-web/   Web3Auth (Layer 2) — Vite, @web3auth/modal
```
JDK: `C:/Users/SSAFY/.jdks/temurin-21.0.11` (JAVA_HOME 미설정 — 실행 시 지정). gradle 8.14.3 wrapper dist 사용.
`.env` 3개 모두 gitignore. 지갑 키는 devnet 임시용.

실행법과 브라우저 폴리필 세팅(Buffer/ox/process.nextTick/COOP)은 RESULT.md 참조.

## 3. 브랜치·worktree 상태

- 작업 브랜치 `spike/kaia-fee-delegation` — 커밋 2개, **push 안 함(로컬 전용)**
- `docs/design-specs-w1` — 다른 노트북에서 편집 중. **읽기 전용, 절대 수정 금지**
- worktree `../docs-latest` = 최신 docs 브랜치. 문서 참조용

## 4. 진행 중: ERD v4 ↔ v5 명세 정합성 감사

명세는 v5(04·05·06·07)인데 ERD는 v4가 최신. 교차 검증에서 불일치 8건 발견.

### [높음] 구현 막힘
- **H-1** `chain_job.memo VARCHAR(100)` 없음 — 관리자 지급 사유 저장 불가
  (`05_기능_명세서_v5.md:1122`, `06_API_명세서_v5.md:3772` 요구)
- **H-2** 검표 링크 토큰 상태 저장처 없음 — `rotate=true` 무효화 구현 불가
  (`06_API_명세서_v5.md:1997`). `performance.entry_token_version INT DEFAULT 1` 권고

### [중간]
- **M-1** `ticket.on_chain_ticket_id` 죽은 컬럼 — TicketNFT 없앴는데 잔존, v5 4개 문서에 0회 등장
- **M-2** 지갑 이력 원본이 ERD(`chain_job`만) ≠ API(`chain_job`+`refund`+`settlement_share` 3원본).
  RELEASE는 1 tx로 N팀 분배라 `chain_job.amount` 단일 값으로 표현 불가

### [낮음] 숫자 정정 (v4.1 리프레시 토큰 삭제 미반영)
- `11_ERD_v4.md:51` 삭제 테이블 "3개" → **4개**
- `11_ERD_v4.md:606` FK "49/46" → **47/44**
- `11_ERD_v4_import_mvp.sql:34` "FK 46" → **44**
- `rules_hash`·`agreed_rules_hash` `VARCHAR(66)` → `CHAR(66)` 통일

### 사용자 ERD 작업본에서 발견
`chain_job`에 **`web3auth_verifier_id`가 추가돼 있는데 스펙·v5 어디에도 없음.**
신원 정보는 `member`/`wallet` 소관이고 트랜잭션마다 중복 저장돼 정규화 위반. **삭제 권고.**

정합 확인된 것: 상태 enum 전 도메인, Redis 이관(`refresh_token`·`wallet_challenge` 제거),
대납 3컬럼(`fee_delegated`/`fee_payer_address`/`sender_signed_rlp`), 비수탁 원칙(키·가스 컬럼 없음).

## 5. 재시작하는 이유 — ERD Cloud MCP

`erdcloud` MCP 서버를 등록했다(`claude mcp add`, HTTP transport, `✔ Connected` 확인).
MCP 도구는 세션 시작 시 로드되므로 **새 세션에서만 `mcp__erdcloud__*`를 쓸 수 있다.**

새 세션에서 할 일: 위 H-1·H-2·M-1과 `web3auth_verifier_id` 삭제를 ERD Cloud에 반영.

> 보안: MCP Bearer 토큰이 이전 세션 대화에 평문으로 남았다.
> 그 기록을 공유·캡처할 일이 있으면 ERD Cloud에서 토큰을 재발급할 것.

## 6. 설계 이해 메모 (사용자와 정리한 것)

- **"P2P"는 문서상 재정의된 표현** — "중개자 없는 직거래"가 아니라 **비수탁(플랫폼이 사용자 키를 안 가짐)**.
  실제 자금은 전부 `RevenueSplitter` 컨트랙트 경유(결제·정산·보증금·환불). 지갑→지갑 직접 전송은 0건.
  근거: `06_방향전환_코인전환_v2.md:18`, `:481`
- **Web3Auth 로그인 = 지갑 자동 생성** (소셜 계정에서 키 결정론적 파생, 같은 계정 = 같은 주소)
- **이미 지갑 있는 사용자**는 Web3Auth 모달의 외부 지갑 어댑터로 연결 → `provider=EXTERNAL`, 새로 안 생김.
  단 **대납 서명 지원 지갑만 가능해 MVP는 Kaia Wallet 하나**. MetaMask는 대납 서명 미지원이라 P1.
  회원당 지갑 1개(`wallet.member_id UNIQUE`)
- 04와 05가 외부 지갑 MVP 포함 여부에서 미묘하게 어긋남
  (`04:161` "EXTERNAL은 Kaia Wallet만 MVP" vs `05:177` "Kaia Wallet 연결 경로는 P1") — 팀 확인 필요
