# contract 함정

정본: 기술 스택 v2 §1 · 블록체인 기술 설명 v1(docs/planning/08) · 컨트랙트 설계 명세(Jira -25)

## 도구
- Solidity 0.8.x · OpenZeppelin **v5** · Hardhat **3**.
- OZ v4 예제 이식 금지: `_beforeTokenTransfer`, `PaymentSplitter`는 v5에서 삭제됨. `_update` 훅과 자체 Splitter 로직으로.
- 로컬 Hardhat 노드는 컨트랙트 로직 테스트 전용. **수수료 대납(FeeDelegated) 경로는 Kaia 전용 tx 타입이라 로컬에서 검증 불가.** Kairos에서만.

## 컨트랙트
- YoYo: ERC-20, `decimals()=0`, mint만(burn 없음). MINTER 역할.
- RevenueSplitter: 규칙 잠금 → 정산 release → halt → 환불. OPERATOR 역할.
- 커스텀 에러(revert code)를 쓰고 문자열 revert 지양. 서버가 revert 코드로 `chain_job` 실패 사유를 매핑한다.

## 배포 산출물
- `deployments/kairos.json` = `{ chainId, contracts: { YoYo: {address, abi}, RevenueSplitter: {address, abi} } }`. 이 파일만 커밋. CI가 읽어 백엔드·프론트 환경변수로 주입.
- 배포 키는 환경변수(`DEPLOYER_PRIVATE_KEY`). 하드코딩·`.env` 커밋 금지.
- 배포 잡은 수동 트리거. 자동 배포 금지(주소가 바뀌면 서버·프론트 재배포 필요).

## 인터페이스 변경 규칙
함수 시그니처·이벤트·커스텀 에러가 바뀌면 `_workspace/bc_interface.md` 첫 줄에 `INTERFACE CHANGED`를 적는다. be-dev가 이걸 보고 web3j 래퍼를 재생성한다.
