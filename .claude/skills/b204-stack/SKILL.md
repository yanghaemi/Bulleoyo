---
name: b204-stack
description: B204 프로젝트 기술 스택의 확정값과 함정 모음. Spring Boot 3.5·Java 17·Flyway·web3j-ext, React 19·Vite 7·Tailwind v4·ethers-ext, Solidity·OZ v5·Hardhat 3·Kaia Kairos, Jenkins·compose·Nginx. backend/ frontend/ blockchain/ exec/ 어디든 코드를 쓰기 전, 의존성 추가 전, 빌드·기동 오류(Unsupported Database MySQL, okhttp NoSuchMethod, ethers v5 동작, Flyway ENUM validate 실패)를 만났을 때 반드시 읽을 것. 버전 선택·라이브러리 추가 질문에도 이 스킬.
---

# b204-stack

정본은 `docs/design/09_기술_스택_v2.md`. 이 스킬은 코드 쓰기 직전에 걸리는 함정만 파트별로 뽑아둔 것이다. 해당 파트 파일 하나만 읽는다.

| 작업 위치 | 읽을 파일 |
|---|---|
| `backend/` | `references/backend.md` |
| `frontend/` | `references/frontend.md` |
| `blockchain/` | `references/contract.md` |
| `exec/`, CI, 서버 | `references/infra.md` |

## 모든 파트 공통

- **금지 목록**(스택 v2 §6): Java 21, web3j 5.x, Jenkins, Besu, Polygon, 금융망 API, 커스터디얼 지갑, Kotlin. 이 단어가 코드나 설정에 나오면 잘못된 예제를 가져온 것이다.
- **보류 목록**(필요가 증명되기 전 추가 금지): springdoc, QueryDSL, MapStruct, ShedLock, 메시지 큐, Zustand, MSW, Playwright, PWA. 추가하려면 왜 지금 필요한지 한 줄을 출력에 남긴다.
- 체인은 **Kaia Kairos 단일**, chainId 1001, RPC `https://public-en-kairos.node.kaia.io`.
- 금액은 정수 원 단위(YoYo decimals 0). 소수·DOUBLE 없음.
