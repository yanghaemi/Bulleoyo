/**
 * YoYo + RevenueSplitter 배포 스크립트 (Hardhat 3).
 *
 *   cd blockchain
 *   npx hardhat run scripts/deploy.ts --network hardhat     # 인메모리 리허설(키 불필요)
 *   npx hardhat run scripts/deploy.ts --network localhost   # `npx hardhat node` 를 먼저 띄운다
 *   npx hardhat run scripts/deploy.ts --network kairos       # 실배포
 *
 * ⚠ **멱등하지 않다.** 이 스크립트는 "이미 배포됐는지"를 보지 않는다. 다시 돌리면 두
 *   컨트랙트가 **새 주소로 새로 배포**되고 `deployments/kairos.json` 이 덮어써진다.
 *   이전 배포의 잔액·에스크로·공연 상태는 옛 주소에 그대로 남고 접근 경로가 사라진다.
 *   주소가 바뀌면 서버 `CONTRACT_*_ADDRESS`, 프론트 `VITE_CONTRACT_*_ADDRESS`,
 *   KaiaScan 링크, 이강륜의 체인 모듈 테스트가 전부 따라 바뀐다 —
 *   재배포는 인터페이스가 실제로 바뀌었을 때만 한다(contract-dev §6 "재배포 최소화").
 *   덮어쓰기 직전에 기존 파일의 주소를 경고로 찍는다.
 *
 * ── 배포 서명자 = admin(콜드 키) ──
 * 운영 키는 셋이고 세 주소가 전부 다르다(문서 13 §2.2). admin 은 두 컨트랙트의 배포자이자
 * `DEFAULT_ADMIN_ROLE` 보유자이며 서버에 넣지 않는다. OPERATOR 키로 배포하면
 * `RevenueSplitter` 생성자가 `RoleConflict()` 로 revert 한다 — 그 검사가 구성을 강제하는 장치다.
 *
 * ── OPERATOR·MINTER 는 "주소만" 필요하다 (문서 13 §2.2 배포 절차 2) ──
 * 생성자에 넘기는 것은 주소지 개인키가 아니다. Jenkins `Deploy contract` 스테이지는
 * `KAIA_RPC_URL` 과 `ADMIN_PRIVATE_KEY` 만 export 하므로, 두 운영 키의 **주소**를 별도
 * 환경변수로 받는다(아래 ENV 표). 주소는 공개 정보라 로그·아티팩트에 남아도 안전하다.
 * 개인키를 이 셸에 끌어오는 방식은 채택하지 않았다 — 같은 셸에서 `npm ci` 가 돌기 때문에
 * 핫키 두 개를 패키지 라이프사이클 스크립트의 사정거리 안에 두게 된다.
 *
 * 비밀값 취급: 이 스크립트는 주소·tx 해시·블록 번호만 출력한다. 개인키·니모닉은 어떤
 * 경로로도 콘솔에 찍지 않는다(Jenkins 콘솔 로그는 그대로 보존된다).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { artifacts, network } from "hardhat";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

// ---------------------------------------------------------------------------
// 환경변수 이름
//
// `OPERATOR_ADDRESS` · `MINTER_ADDRESS` 는 **이강륜(인프라)과 합의된 확정 이름**이다
// (2026-09-07, A-12). Jenkins `Deploy contract` 스테이지가 `process.env` 로 주입하고,
// 값의 정본은 저장소 루트 `.env.example` 이다. **개인키는 이 셸로 끌어오지 않는다** —
// 필요한 것은 주소뿐이고, 같은 셸에서 `npm ci` 가 돌기 때문이다(`Jenkinsfile` 참조).
//
// `ADMIN_ADDRESS` 는 선택이다. 주면 어서션 ④가 "키를 잘못 꽂았다"를 배포 전에 잡는다.
// ---------------------------------------------------------------------------
const ENV = {
  /** 서버 런타임 OPERATOR 키의 **주소**. 개인키가 아니다. */
  operatorAddress: "OPERATOR_ADDRESS",
  /** 서버 런타임 MINTER 키의 **주소**. 개인키가 아니다. */
  minterAddress: "MINTER_ADDRESS",
  /** (선택) 기대하는 배포자 주소. 주면 어서션 ④가 "키를 잘못 꽂았다"를 잡아낸다. */
  adminAddress: "ADMIN_ADDRESS",
  /** 폴백 — 로컬 배포자가 이미 갖고 있는 `.env.example` 정본 이름. 주소만 유도하고 값은 절대 출력하지 않는다. */
  operatorKey: "OPERATOR_PRIVATE_KEY",
  minterKey: "MINTER_PRIVATE_KEY",
} as const;

/** edr 인메모리·로컬 노드. 여기서는 테스트 signer 로 역할 주소를 채운다. */
const LOCAL_NETWORKS = new Set(["hardhat", "localhost"]);

const KAIROS_CHAIN_ID = 1001n;
const KAIROS_EXPLORER = "https://kairos.kaiascan.io";

function log(msg = ""): void {
  console.log(msg);
}

/** 실패는 이 함수로만 낸다 — 메시지 형식을 하나로 묶고 종료 코드를 1로 만든다. */
class DeployError extends Error {}
function fail(msg: string): never {
  throw new DeployError(msg);
}

/**
 * 개인키에서 주소만 유도한다. 실패해도 키 값이 메시지에 실리지 않도록 자체 메시지로 바꾼다.
 * (ethers v6 는 `[REDACTED]` 로 가리지만, 우리 쪽에서 한 겹 더 막는다.)
 */
function addressFromPrivateKey(ethersLib: any, key: string, envName: string): string {
  try {
    return ethersLib.getAddress(new ethersLib.Wallet(key.trim()).address);
  } catch {
    fail(`환경변수 ${envName} 가 올바른 개인키가 아니다. (값은 로그에 남기지 않는다)`);
  }
}

function envAddress(ethersLib: any, name: string): string | undefined {
  const raw = process.env[name]?.trim();
  if (raw === undefined || raw === "") return undefined;
  if (!ethersLib.isAddress(raw)) {
    fail(`환경변수 ${name} 의 값이 주소 형식이 아니다: "${raw}"`);
  }
  return ethersLib.getAddress(raw);
}

/**
 * OPERATOR·MINTER 주소 해결. 우선순위:
 *   ① `OPERATOR_ADDRESS` · `MINTER_ADDRESS`            — CI·실배포의 정규 경로(주소만, 안전)
 *   ② `OPERATOR_PRIVATE_KEY` · `MINTER_PRIVATE_KEY`    — 로컬 배포자 폴백(주소만 유도, 값 미출력)
 *   ③ 테스트 signer #1·#2                              — 로컬 네트워크 전용
 * 실네트워크에서 ①②가 모두 없으면 **배포하지 않고 실패**한다. 아무 주소나 채워 넣으면
 * 그 배포는 서버가 쓸 수 없는 컨트랙트가 되고, 역할 봉인 때문에 사후 교정도 `rotate*` 한 번뿐이다.
 */
async function resolveRoles(
  ethersLib: any,
  networkName: string,
  isLocal: boolean,
  deployer: string,
): Promise<{ admin: string; operator: string; minter: string; source: string }> {
  const admin = ethersLib.getAddress(deployer);

  let operator = envAddress(ethersLib, ENV.operatorAddress);
  let minter = envAddress(ethersLib, ENV.minterAddress);
  let source = `환경변수 ${ENV.operatorAddress} · ${ENV.minterAddress}`;

  if (operator === undefined || minter === undefined) {
    const opKey = process.env[ENV.operatorKey]?.trim();
    const mtKey = process.env[ENV.minterKey]?.trim();
    if (opKey && mtKey) {
      operator ??= addressFromPrivateKey(ethersLib, opKey, ENV.operatorKey);
      minter ??= addressFromPrivateKey(ethersLib, mtKey, ENV.minterKey);
      source = `환경변수 ${ENV.operatorKey} · ${ENV.minterKey} 에서 주소 유도(폴백)`;
    }
  }

  if (operator === undefined || minter === undefined) {
    if (!isLocal) {
      fail(
        [
          `네트워크 "${networkName}" 에 배포하려면 OPERATOR·MINTER 주소가 필요한데 없다.`,
          "",
          `  방법 ①(권장): export ${ENV.operatorAddress}=0x…  ${ENV.minterAddress}=0x…`,
          `  방법 ②(폴백): export ${ENV.operatorKey}=0x…  ${ENV.minterKey}=0x…  (주소만 유도한다)`,
          "",
          "생성자에 필요한 것은 주소지 개인키가 아니다(문서 13 §2.2 배포 절차 2).",
          `${ENV.operatorAddress}·${ENV.minterAddress} 는 아직 .env.example 에 없다 —`,
          "이강륜(인프라)과 이름을 합의하고 Jenkins Deploy contract 스테이지에 추가해야 한다.",
        ].join("\n"),
      );
    }
    // 로컬 네트워크: 테스트 signer 로 채운다. #0 = 배포자(admin), #1 = operator, #2 = minter.
    const signers = await ethersLib.getSigners();
    if (signers.length < 3) {
      fail(`로컬 네트워크에 signer 가 ${signers.length} 개뿐이다 — 최소 3개(admin·operator·minter)가 필요하다.`);
    }
    operator ??= ethersLib.getAddress(signers[1].address);
    minter ??= ethersLib.getAddress(signers[2].address);
    source = "로컬 테스트 signer #1(operator) · #2(minter)";
  }

  return { admin, operator, minter, source };
}

/**
 * 커밋된 ABI(`deployments/abi/*.json`)가 지금 배포한 바이트코드의 ABI 와 같은지 본다.
 * 어긋나면 이강륜의 web3j 래퍼·강병구의 ethers Interface 가 배포된 컨트랙트와 다른 계약을 본다.
 * 배포 자체를 막지는 않는다(문서 13 §6 필수 어서션 4개에 없고, 재생성으로 사후 복구된다).
 */
async function checkCommittedAbi(name: string): Promise<void> {
  const artifact = await artifacts.readArtifact(name);
  const live = createHash("sha256").update(JSON.stringify(artifact.abi)).digest("hex");
  const path = resolve(ROOT, "deployments/abi", `${name}.json`);
  if (!existsSync(path)) {
    log(`  [경고] deployments/abi/${name}.json 이 없다 — \`node scripts/extract-abi.mjs\` 로 만들어 커밋해라.`);
    return;
  }
  const committed = createHash("sha256")
    .update(JSON.stringify(JSON.parse(readFileSync(path, "utf8"))))
    .digest("hex");
  if (committed !== live) {
    log(
      `  [경고] deployments/abi/${name}.json 이 배포된 ABI 와 다르다 ` +
        `(committed ${committed.slice(0, 12)}… vs deployed ${live.slice(0, 12)}…).\n` +
        "         `npx hardhat build && node scripts/extract-abi.mjs` 후 커밋해라.",
    );
  } else {
    log(`  ABI 일치 ${name.padEnd(16)} sha256=${live.slice(0, 12)}…`);
  }
}

async function main(): Promise<void> {
  // Hardhat 3: 전역 `ethers` 는 없다. 연결을 열고 거기서 꺼낸다.
  // 인자 없는 create() 는 `--network` 로 지정한 네트워크(없으면 기본값)를 쓴다.
  // `network.connect()` 는 hardhat 3.15 에서 deprecated 경고를 낸다 — contract-dev §1 표의
  // 예시보다 이쪽이 현행이다. 스크립트는 연결을 하나만 쓰고 끝에 닫으므로 create() 가 맞다
  // (getOrCreate() 는 캐시를 돌려주므로 close() 하면 안 된다).
  const connection = await network.create();
  const { ethers, networkName, networkConfig } = connection as any;

  try {
    const isLocal = LOCAL_NETWORKS.has(networkName) || networkConfig?.type === "edr-simulated";
    const chainId = (await ethers.provider.getNetwork()).chainId as bigint;

    const signers = await ethers.getSigners();
    if (signers.length === 0) {
      fail(
        `네트워크 "${networkName}" 에 signer 가 없다. kairos 라면 ADMIN_PRIVATE_KEY 를 넣어라 — ` +
          "`export ADMIN_PRIVATE_KEY=0x…` 또는 `npx hardhat keystore set ADMIN_PRIVATE_KEY`.",
      );
    }
    const deployer = signers[0];

    log("=".repeat(72));
    log(`network      : ${networkName} (chainId ${chainId})`);
    log(`deployer     : ${deployer.address}   ← admin(DEFAULT_ADMIN_ROLE), 콜드 키`);

    const balance = await ethers.provider.getBalance(deployer.address);
    log(`balance      : ${ethers.formatEther(balance)} KAIA`);
    if (!isLocal && balance === 0n) {
      fail("배포자 잔액이 0이다. https://faucet.kaia.io 에서 KAIA 를 받아라(24h/50 KAIA). 배포 가스는 약 0.11 KAIA.");
    }

    // Kaia 는 가스 가격 모델이 이더리움과 다르다. 하드코딩하지 않고 조회값을 찍어 둔다.
    const fee = await ethers.provider.getFeeData();
    log(
      `feeData      : gasPrice=${fee.gasPrice ?? "-"} maxFeePerGas=${fee.maxFeePerGas ?? "-"} ` +
        `maxPriorityFeePerGas=${fee.maxPriorityFeePerGas ?? "-"}`,
    );

    const { admin, operator, minter, source } = await resolveRoles(ethers, networkName, isLocal, deployer.address);
    log(`roles        : admin=${admin}`);
    log(`               operator=${operator}`);
    log(`               minter=${minter}`);
    log(`               (출처: ${source})`);

    // ── 어서션 ③ (사전) — 세 주소가 전부 달라야 한다 ────────────────────────────
    // 배포 **전에** 본다. 생성자의 RoleConflict() 도 같은 것을 막지만, 그건 YoYo 배포에
    // 가스를 쓴 뒤 Splitter 에서 터진다. 여기서 걸러야 "YoYo 만 배포된 반쪽 상태"가 안 남는다.
    assertRolesDistinct(admin, operator, minter);
    log("  [어서션 ③] admin != operator != minter  OK (배포 전 사전검사)");

    // ── 어서션 ④ (사전) — 배포자 == admin ────────────────────────────────────
    // ADMIN_ADDRESS 를 줬다면 "키를 잘못 꽂았다"를 여기서 잡는다.
    const expectedAdmin = envAddress(ethers, ENV.adminAddress);
    if (expectedAdmin !== undefined && expectedAdmin !== admin) {
      fail(
        `[어서션 ④] 배포 서명자가 ${ENV.adminAddress} 와 다르다.\n` +
          `           기대: ${expectedAdmin}\n` +
          `           실제: ${admin}\n` +
          "           ADMIN_PRIVATE_KEY 에 다른 키(OPERATOR?)를 꽂았을 가능성이 높다.",
      );
    }

    if (networkName === "kairos" && chainId !== KAIROS_CHAIN_ID) {
      fail(`kairos 네트워크인데 chainId 가 ${chainId} 다(기대 ${KAIROS_CHAIN_ID}). RPC URL 을 확인해라.`);
    }

    const outPath =
      networkName === "kairos"
        ? resolve(ROOT, "deployments/kairos.json")
        : resolve(ROOT, "deployments/localhost", `${networkName}.json`);
    warnIfOverwriting(outPath);

    // ── 배포 ────────────────────────────────────────────────────────────────
    log("");
    log("YoYo 배포 …");
    const yoyo = await ethers.deployContract("YoYo", [admin, minter], deployer);
    await yoyo.waitForDeployment();
    const yoyoAddress = ethers.getAddress(await yoyo.getAddress());
    const yoyoRcpt = await yoyo.deploymentTransaction()!.wait();
    log(`  address    : ${yoyoAddress}`);
    log(`  txHash     : ${yoyoRcpt!.hash}`);
    log(`  blockNumber: ${yoyoRcpt!.blockNumber}   gasUsed: ${yoyoRcpt!.gasUsed}`);

    log("RevenueSplitter 배포 …");
    const splitter = await ethers.deployContract("RevenueSplitter", [admin, operator, yoyoAddress], deployer);
    await splitter.waitForDeployment();
    const splitterAddress = ethers.getAddress(await splitter.getAddress());
    const splitterRcpt = await splitter.deploymentTransaction()!.wait();
    log(`  address    : ${splitterAddress}`);
    log(`  txHash     : ${splitterRcpt!.hash}`);
    log(`  blockNumber: ${splitterRcpt!.blockNumber}   gasUsed: ${splitterRcpt!.gasUsed}`);

    // ── 배포 후 어서션 4개 (문서 13 §6) — 전부 온체인 readback ────────────────
    log("");
    log("배포 어서션 (문서 13 §6) — 하나라도 깨지면 배포 실패로 끝낸다");

    // ① decimals == 0. 오버라이드를 빠뜨리면 ERC20 기본 18이 되고, 금액이 1e18배로
    //    어긋난 채 **비율만 맞아** 단위 테스트가 전부 통과한다. 그래서 배포에서 본다.
    const decimals = await yoyo.decimals();
    if (decimals !== 0n) {
      fail(`[어서션 ①] YoYo.decimals() == 0 이어야 하는데 ${decimals} 다. 10,000원은 10000 이지 10000e18 이 아니다.`);
    }
    log("  [①] YoYo.decimals() == 0                       OK");

    // ② Splitter.token() == YoYo 주소.
    //    **형식 검사가 아니다.** `createShow` 의 팀 지갑 검증에서 YoYo role 조회 2개
    //    (`minter()` · `hasRole`)는 저수준 staticcall 이라, 토큰이 YoYo 가 아니면 실패를
    //    revert 하지 않고 안전한 기본값으로 **조용히 접는다**. 그러면 createShow 는 정상
    //    진행하지만 그 배포에는 H-01 방어(팀 지갑 ≠ 발행 권한)가 아예 존재하지 않는다.
    //    실패가 눈에 보이지 않으므로, 이 어서션이 "그 검사가 실제로 동작한다"를 보장하는
    //    유일한 장치다(문서 13 §4.1 · §6, 감사 R2 L-06).
    const token = ethers.getAddress(await splitter.token());
    if (token !== yoyoAddress) {
      fail(
        `[어서션 ②] Splitter.token() 이 YoYo 주소와 다르다.\n` +
          `           token(): ${token}\n` +
          `           YoYo   : ${yoyoAddress}\n` +
          "           이 배포에서는 createShow 의 팀 지갑 YoYo role 검사(H-01 방어)가 조용히 꺼진다.",
      );
    }
    log("  [②] Splitter.token() == YoYo                   OK");

    // ③ 세 주소가 전부 다르다 — 이번엔 온체인에 실제로 심긴 값으로 다시 본다.
    const onchainMinter = ethers.getAddress(await yoyo.minter());
    const onchainOperator = ethers.getAddress(await splitter.operator());
    if (onchainMinter !== minter) fail(`[어서션 ③] YoYo.minter() 가 기대와 다르다: ${onchainMinter} != ${minter}`);
    if (onchainOperator !== operator) {
      fail(`[어서션 ③] Splitter.operator() 가 기대와 다르다: ${onchainOperator} != ${operator}`);
    }
    assertRolesDistinct(admin, onchainOperator, onchainMinter);
    log("  [③] admin != operator != minter (온체인 readback) OK");

    // ④ 배포자 == admin — 온체인 DEFAULT_ADMIN_ROLE 보유로 확인한다.
    //    역할 관리가 봉인돼 있어(grantRole revert) 여기서 admin 이 아니면 되돌릴 방법이
    //    재배포뿐이다. 문자열 비교가 아니라 readback 이어야 하는 이유다.
    const DEFAULT_ADMIN_ROLE = await yoyo.DEFAULT_ADMIN_ROLE();
    const yoyoAdminOk = await yoyo.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
    const splitterAdminOk = await splitter.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
    if (!yoyoAdminOk || !splitterAdminOk) {
      fail(
        `[어서션 ④] 배포자가 DEFAULT_ADMIN_ROLE 을 갖고 있지 않다 ` +
          `(YoYo=${yoyoAdminOk}, Splitter=${splitterAdminOk}). ` +
          "역할 관리가 봉인돼 있어 사후 부여가 불가능하다 — 재배포해야 한다.",
      );
    }
    if (ethers.getAddress(deployer.address) !== admin) {
      fail(`[어서션 ④] deployer(${deployer.address}) != admin(${admin}).`);
    }
    log("  [④] deployer == admin, 두 컨트랙트 DEFAULT_ADMIN_ROLE 보유 OK");

    // 참고 검사(경고만) — 커밋된 ABI 가 배포된 것과 같은가.
    log("");
    log("커밋된 ABI 대조 (참고)");
    await checkCommittedAbi("YoYo");
    await checkCommittedAbi("RevenueSplitter");

    // ── 산출물 ──────────────────────────────────────────────────────────────
    // `.contracts.YoYo.address` · `.contracts.RevenueSplitter.address` 두 경로는 고정이다.
    // Jenkins 가 jq -r 로 읽어 백엔드 CONTRACT_*_ADDRESS · 프론트 VITE_CONTRACT_*_ADDRESS 에 주입한다.
    const explorerBase = chainId === KAIROS_CHAIN_ID ? KAIROS_EXPLORER : null;
    const abiDir = resolve(ROOT, "deployments/abi");
    const abiRef = (name: string) => relative(dirname(outPath), resolve(abiDir, `${name}.json`)).replaceAll("\\", "/");

    const record = {
      network: chainId === KAIROS_CHAIN_ID ? "kaia-kairos" : networkName,
      chainId: Number(chainId),
      deployedAt: new Date().toISOString(),
      deployer: deployer.address,
      contracts: {
        YoYo: {
          address: yoyoAddress,
          txHash: yoyoRcpt!.hash,
          blockNumber: yoyoRcpt!.blockNumber,
          abi: abiRef("YoYo"),
          explorerUrl: explorerBase ? `${explorerBase}/address/${yoyoAddress}` : null,
        },
        RevenueSplitter: {
          address: splitterAddress,
          txHash: splitterRcpt!.hash,
          blockNumber: splitterRcpt!.blockNumber,
          abi: abiRef("RevenueSplitter"),
          explorerUrl: explorerBase ? `${explorerBase}/address/${splitterAddress}` : null,
        },
      },
      roles: { minter, operator, admin },
      invariants: { yoyoDecimals: Number(decimals), splitterToken: token },
    };

    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(record, null, 2) + "\n", "utf8");

    log("");
    log(`기록: ${relative(ROOT, outPath).replaceAll("\\", "/")}`);
    if (networkName === "kairos") {
      log("");
      log("다음 할 일");
      // 주소·생성자 인자는 방금 쓴 kairos.json 에 있다. 명령줄에 다시 타이핑하면 틀리고,
      // 틀린 인자는 "검증 실패"가 아니라 조용히 안 맞는 결과를 낸다. scripts/verify.ts 가
      // 그 파일을 읽어 KaiaScan·Sourcify 양쪽에 제출하고 verification 필드까지 갱신한다.
      // (한 건만 수동으로 다시 할 때의 명령 형태는 scripts/verify.ts 머리 주석에 있다.)
      log("  1) 소스 검증: npm run verify:kairos    ← verify 없이는 KaiaScan 이벤트가 Unknown 으로 뜬다");
      log("  2) deployments/kairos.json 을 커밋한다 — Jenkins 는 아티팩트로만 남기고 커밋하지 않는다.");
      log("     커밋해야 다음 Build 가 CONTRACT_*_ADDRESS 를 주입한다.");
      log("  3) 주소가 바뀌었으면 이강륜(서버 체인 모듈)·강병구(프론트 config)에게 통지한다.");
    }
    log("=".repeat(72));
  } finally {
    await connection.close();
  }
}

function assertRolesDistinct(admin: string, operator: string, minter: string): void {
  const dup: string[] = [];
  if (admin === operator) dup.push("admin == operator");
  if (admin === minter) dup.push("admin == minter");
  if (operator === minter) dup.push("operator == minter");
  if (dup.length > 0) {
    fail(
      `[어서션 ③] 운영 키 세 주소가 전부 달라야 한다 — ${dup.join(", ")}.\n` +
        `           admin=${admin}\n           operator=${operator}\n           minter=${minter}\n` +
        "           admin 이 OPERATOR 를 겸하면 유출된 핫키 하나로 rotateMinter → 무한 발행이 열린다(문서 13 §2.2).",
    );
  }
}

function warnIfOverwriting(outPath: string): void {
  if (!existsSync(outPath)) return;
  try {
    const prev = JSON.parse(readFileSync(outPath, "utf8"));
    log("");
    log(`[경고] ${relative(ROOT, outPath).replaceAll("\\", "/")} 이 이미 있다 — 이 실행이 덮어쓴다.`);
    // 개명 전(9/8 이전) 산출물은 코인 키 이름이 달라 여기서 "?" 로 찍힌다. 옛 키 폴백은
    // `Jenkinsfile` 쪽에만 둔다(!49) — 이 로그는 경고일 뿐이고 아래 RevenueSplitter 주소가
    // "이미 배포된 파일을 덮어쓰는 중"이라는 사실을 이미 보여 준다.
    log(`       이전 YoYo           : ${prev?.contracts?.YoYo?.address ?? "?"}`);
    log(`       이전 RevenueSplitter: ${prev?.contracts?.RevenueSplitter?.address ?? "?"}`);
    log("       이 스크립트는 멱등하지 않다. 새 주소로 새로 배포되고 이전 배포의 상태는 옛 주소에 남는다.");
  } catch {
    log(`[경고] ${relative(ROOT, outPath).replaceAll("\\", "/")} 을 읽지 못했다 — 덮어쓴다.`);
  }
}

try {
  await main();
} catch (e) {
  console.error("");
  console.error("배포 실패");
  console.error(e instanceof DeployError ? e.message : e);
  // Jenkins 는 set -e 로 돌린다. 0이 아닌 코드로 끝나야 파이프라인이 멈춘다.
  process.exitCode = 1;
}
