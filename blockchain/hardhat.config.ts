import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

/**
 * B204 blockchain — Hardhat 3.
 *
 * 검색으로 나오는 예제 대부분은 Hardhat 2다. v3에서 달라진 것:
 *  - 플러그인은 `plugins: [...]` 배열에 명시한다(부수효과 import 아님).
 *  - 인메모리 네트워크 type은 "edr-simulated". 구버전 문서의 "edr"은 로드 단계에서 실패한다.
 *  - 비밀값은 configVariable()로 지연 평가한다. process.env를 배열에 직접 넣으면 로컬 테스트만
 *    돌릴 때도 키가 없다고 죽는다. **configVariable()은 .env 파일을 읽지 않는다** —
 *    환경변수 또는 `npx hardhat keystore set <NAME>`으로 넣는다.
 *
 * 변수 이름은 저장소 루트 `.env.example`이 정본이다(KAIA_RPC_URL · OPERATOR_PRIVATE_KEY · MINTER_PRIVATE_KEY).
 * Jenkins의 `Deploy contract` 스테이지가 Secret file `B204_ENV`에서 같은 이름으로 export하므로
 * 다른 이름(KAIROS_RPC_URL·DEPLOYER_PRIVATE_KEY)을 쓰면 CI 배포가 깨진다.
 *
 * ── 배포 서명자 = ADMIN_PRIVATE_KEY (사용자 확정 2026-09-07 · 감사 라운드 1 C-01 방안 A) ──
 * 운영 키는 **세 개**이고 세 주소가 전부 다르다: admin · OPERATOR · MINTER.
 *  - admin   : `DEFAULT_ADMIN_ROLE` 전용 **콜드 키.** 두 컨트랙트의 배포자이며
 *              `pause`/`unpause`·`rotateMinter`·`rotateOperator`에만 쓴다. **서버에 넣지 않는다.**
 *  - OPERATOR: 서버 런타임 키(대납 fee payer + Splitter 운영 tx).
 *  - MINTER  : 서버 런타임 키(`YoYo.mint`).
 * 이 분리가 필요한 이유 — admin이 OPERATOR와 같은 주소면 상시 hot 상태인 OPERATOR 키 하나로
 * `rotateMinter(자기 주소)` → `mint(무제한)`이 열려 발행량 공시(불변식 1)가 무의미해진다.
 * `RevenueSplitter` 생성자의 `RoleConflict()`가 이 구성을 배포 시점에 강제한다.
 *
 * ⚠ **`ADMIN_PRIVATE_KEY`는 아직 저장소 루트 `.env.example`에 없다.** 이강륜(인프라)에게
 *   ① `.env.example`에 `ADMIN_PRIVATE_KEY`(값 없이 이름만) 추가 ② Jenkins Secret file `B204_ENV`의
 *   `Deploy contract` 스테이지 export 목록에 추가를 요청해야 한다. 그때까지 배포는 로컬에서
 *   `npx hardhat keystore set ADMIN_PRIVATE_KEY` 또는 셸 환경변수로만 한다.
 *
 * Kaia는 가스 가격 모델이 이더리움과 다르다. gasPrice: "auto"로 두고 eth_gasPrice 조회값을 쓴다.
 * 하드코딩하면 트랜잭션이 안 잡히거나 과다 지출한다.
 *
 * 로컬 노드(edr-simulated·localhost)는 Kaia의 수수료 대납 tx 타입을 모른다. 컨트랙트 로직 단위
 * 테스트만 로컬에서 하고, 대납 경로는 Kairos에서 검증한다. 컨트랙트 입장에서 대납 tx의
 * msg.sender는 발신자이므로 로직 테스트는 일반 tx로 충분하다.
 */
export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],

  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          // stack too deep 회피. 프로토타입에서 확인된 설정이다.
          viaIR: true,
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
        },
      },
    },
  },

  // KaiaScan 소스코드 검증. 정규 경로는 `npm run verify:kairos`(= scripts/verify.ts) —
  // 주소·생성자 인자를 `deployments/kairos.json` 에서 읽고 성공 시 `verification` 필드까지 갱신한다.
  // 한 건만 수동으로: npx hardhat verify --network kairos <주소> [생성자인자...]
  // API 키가 필요 없고 "unnecessary" placeholder를 요구한다.
  chainDescriptors: {
    1001: {
      name: "Kaia Kairos",
      blockExplorers: {
        etherscan: {
          name: "KaiaScan",
          url: "https://kairos.kaiascan.io",
          apiUrl: "https://compiler-api-v2.kaiascan.io/kairos/hardhat-verify",
        },
      },
    },
  },

  verify: {
    etherscan: {
      apiKey: "unnecessary",
    },
    // Sourcify 는 hardhat-verify 3.x 가 기본 활성이고 API 키도 필요 없다. 명시해 두는 이유는
    // "KaiaScan 만 검증했다"는 오해를 막기 위해서다 — 검증 페이지가 두 링크를 나란히 보여준다.
    sourcify: {
      enabled: true,
    },
    // Blockscout 은 **끈다.** chainId 1001 에는 Blockscout 인스턴스가 없어 이 단계가
    // `BLOCK_EXPLORER_NOT_CONFIGURED` 로 터지고, `npx hardhat verify`(프로바이더 전체를 도는
    // 상위 태스크)가 KaiaScan·Sourcify 성공에도 불구하고 종료 코드 1을 낸다.
    blockscout: {
      enabled: false,
    },
  },

  networks: {
    // 1) 인메모리 — `hardhat test` 기본값
    hardhat: {
      type: "edr-simulated",
      chainType: "l1",
    },

    // 2) 로컬 node — `npx hardhat node`로 띄운 뒤 붙는다
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
    },

    // 3) Kaia Kairos — 유일한 실네트워크(스택 v3 §1, 백업 체인 없음)
    kairos: {
      type: "http",
      chainType: "l1",
      url: configVariable("KAIA_RPC_URL"),
      chainId: 1001,
      // 배포 서명자는 admin(콜드 키)이다. OPERATOR 키로 배포하면 Splitter 생성자가
      // RoleConflict()로 revert 한다 — 그 검사가 키 3개 구성을 강제하는 장치다.
      accounts: [configVariable("ADMIN_PRIVATE_KEY")],
      gasPrice: "auto",
    },
  },
});
