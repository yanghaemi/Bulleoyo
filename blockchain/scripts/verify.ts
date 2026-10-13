/**
 * KaiaScan(+Sourcify) 소스 검증 스크립트 (Hardhat 3).
 *
 *   cd blockchain
 *   npm run verify:kairos          # = hardhat run scripts/verify.ts --network kairos
 *
 * 무엇을 하나
 *   `deployments/kairos.json` 을 읽어 **거기 적힌 두 주소**를 KaiaScan(Etherscan 호환 API)과
 *   Sourcify 양쪽에 검증 제출하고, 성공하면 각 컨트랙트의 `verification` 필드를 갱신한다.
 *   생성자 인자는 같은 파일의 `roles` · `contracts` 에서 가져온다(문서 13 §2.2 배포 절차 2):
 *     YoYo(admin, minter) · RevenueSplitter(admin, operator, contracts.YoYo.address)
 *
 * 왜 스크립트인가 (수동 명령 두 줄로 두지 않는 이유)
 *   ① `npx hardhat verify` 는 **활성화된 프로바이더를 전부** 돈다. chainId 1001 에는 Blockscout
 *      인스턴스가 없어 blockscout 단계가 `BLOCK_EXPLORER_NOT_CONFIGURED` 로 터지고, KaiaScan·
 *      Sourcify 가 둘 다 성공해도 태스크 종료 코드는 1이 된다. (그래서 `hardhat.config.ts` 에서
 *      `verify.blockscout.enabled = false` 로 껐다 — 수동 명령도 이제 깨끗하게 끝난다.) **이
 *      스크립트도 그 설정을 그대로 읽는다** — 프로바이더 목록을 여기에 베껴 두지 않는다.
 *   ② 생성자 인자를 사람이 타이핑하면 틀린다. 틀리면 "검증 실패"가 아니라 **다른 컨트랙트로
 *      검증되거나** 조용히 안 맞는다. 주소·인자의 정본은 `kairos.json` 하나다.
 *   ③ verify 뒤에 `verification` 필드를 손으로 고치는 단계가 절차에 있으면 반드시 빠진다.
 *      필드가 옛 주소를 가리키면 "검증됐다"는 표시가 거짓말이 된다.
 *
 * 수동으로 한 건만 다시 할 때 (참고 — 예전 deploy.ts 안내 두 줄)
 *   npx hardhat verify --network kairos <YoYo 주소>     <admin> <minter>
 *   npx hardhat verify --network kairos <Splitter 주소> <admin> <operator> <YoYo 주소>
 *   특정 익스플로러만: `npx hardhat verify etherscan …` / `npx hardhat verify sourcify …`
 *   부분 검증 상태를 강제로 덮어쓸 때만 `--force`. (이 스크립트는 --force 를 쓰지 않는다 —
 *   "이미 검증됨"은 실패가 아니라 정상 종료다.)
 *
 * 재배포하면 반드시 다시 돌린다
 *   verify 는 **주소 단위**다. 재배포로 주소가 바뀌면 새 주소는 미검증 상태이고, KaiaScan 의
 *   이벤트 로그가 이름 없이 `Unknown` 으로 뜬다 — 검증 페이지(V-01·V-02)가 "누구나 직접
 *   확인할 수 있다"고 말하는 근거가 반쪽이 된다. 문서 13 §2.2 배포 절차 5.
 *   ⚠ 9/11 실측: verify 는 **그 이후 tx 부터** 이벤트 이름을 붙인다. verify 전에 찍힌 옛 tx 의
 *   로그는 verify 뒤에도 계속 `Unknown` 으로 남는다(KaiaScan 이 소급 재파싱하지 않는다).
 *   시연에 쓸 tx 는 verify 를 마친 뒤에 만들어야 한다.
 *
 * 비밀값 취급: 이 스크립트는 주소·URL 만 출력한다. 개인키·RPC URL 값은 어떤 경로로도 콘솔에
 *   찍지 않는다(Jenkins 콘솔 로그는 그대로 보존된다). verify 자체는 **서명하지 않는다** —
 *   `networks.kairos.accounts` 가 `configVariable("ADMIN_PRIVATE_KEY")` 라 값은 있어야 하지만
 *   쓰이지 않는다(연결을 열 때 계정 목록을 만들 뿐이다).
 *
 * 구현 메모 — 왜 `hre.tasks.getTask(...).run()` 인가
 *   `@nomicfoundation/hardhat-verify` 는 `verifyContract(args, hre)` 프로그램 API 도 내보내지만,
 *   그 패키지는 `package.json` 에 직접 선언돼 있지 않고 toolbox 의 전이 의존이다. 직접 import
 *   하면 npm 호이스팅에 기대게 된다. 태스크 매니저는 선언된 `hardhat` 패키지만 쓴다.
 *   (대안으로 `child_process` 로 `npx hardhat verify` 를 두 번 띄우는 방법도 있었지만, 종료 코드
 *   판정과 "already verified" 문자열 매칭을 stdout 파싱으로 해야 해서 깨지기 쉽다.)
 */
import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import hre from "hardhat";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const RECORD_PATH = resolve(ROOT, "deployments/kairos.json");

const KAIROS_CHAIN_ID = 1001n;
const KAIROS_EXPLORER = "https://kairos.kaiascan.io";
// `sourcify.dev/server/repo-ui/...` 는 302 로 여기로 넘어온다(2026-09-16 실측). 최종 도착지를 직접 적는다.
const SOURCIFY_REPO = "https://repo.sourcify.dev";

// Sourcify v2 조회 API(검증 제출 엔드포인트와 다르다). partial/exact 구분은 여기서만 읽을 수 있다.
const SOURCIFY_API = "https://sourcify.dev/server";
const SOURCIFY_TIMEOUT_MS = 5_000;

/** 사람이 읽는 이름 — 로그에만 쓴다. KaiaScan 은 Etherscan 호환 API 를 노출한다. */
const PROVIDER_LABEL: Record<string, string> = {
  etherscan: "KaiaScan",
  sourcify: "Sourcify",
  blockscout: "Blockscout",
};

const label = (provider: string): string => PROVIDER_LABEL[provider] ?? provider;

/**
 * 어떤 프로바이더에 제출할지는 **`hardhat.config.ts` 의 `verify` 설정 하나**가 정한다.
 * 목록을 여기에 하드코딩하면 config 에서 blockscout 을 켜고 끄는 것과 이 스크립트가 도는 범위가
 * 조용히 어긋난다(!114 리뷰). `enabled: false` 인 것만 뺀다 — `etherscan` 처럼 `enabled` 를 적지
 * 않은 프로바이더는 hardhat-verify 기본값이 활성이다.
 */
function activeProviders(): string[] {
  // `VerificationProvidersConfig` 는 인덱스 시그니처가 없는 인터페이스라 바로 좁히지 못한다.
  // 우리가 보는 것은 `enabled` 하나뿐이므로 그 모양으로만 읽는다.
  const verifyConfig = (hre.config.verify ?? {}) as unknown as Record<string, { enabled?: boolean }>;
  const active = Object.entries(verifyConfig)
    .filter(([, options]) => options?.enabled !== false)
    .map(([name]) => name);
  if (active.length === 0) {
    fail("hardhat.config.ts 의 `verify` 에 활성화된 프로바이더가 하나도 없다. 제출할 곳이 없으면 실행할 이유가 없다.");
  }
  return active;
}

function log(msg = ""): void {
  console.log(msg);
}

class VerifyError extends Error {}
function fail(msg: string): never {
  throw new VerifyError(msg);
}

interface ContractRecord {
  address: string;
  verification?: Record<string, unknown>;
  [k: string]: unknown;
}

interface DeploymentRecord {
  chainId: number;
  contracts: Record<string, ContractRecord>;
  roles: { admin: string; operator: string; minter: string };
  [k: string]: unknown;
}

/** 검증 대상 한 건. `args` 순서는 생성자 순서다 — 틀리면 검증이 실패하거나 엉뚱하게 붙는다. */
interface Target {
  name: string;
  address: string;
  /**
   * `<소스 경로>:<컨트랙트 이름>`. 주면 플러그인이 **이 컨트랙트로 고정**하고, 컴파일 결과와 체인의
   * 배포 바이트코드를 비교해 다르면 `DEPLOYED_BYTECODE_MISMATCH` 로 막는다 — 후보를 자동 탐색하다
   * 엉뚱한 컨트랙트에 붙는 것보다 안전한 쪽이다.
   */
  fqn: string;
  args: string[];
}

function readRecord(): DeploymentRecord {
  let raw: string;
  try {
    raw = readFileSync(RECORD_PATH, "utf8");
  } catch {
    fail(
      `${relative(ROOT, RECORD_PATH).replaceAll("\\", "/")} 가 없다. 먼저 배포해라 — ` +
        "`npm run deploy:kairos` (문서 13 §2.2 배포 절차 1~4).",
    );
  }
  let record: DeploymentRecord;
  try {
    record = JSON.parse(raw);
  } catch (e) {
    fail(`${relative(ROOT, RECORD_PATH).replaceAll("\\", "/")} 을 JSON 으로 읽지 못했다: ${(e as Error).message}`);
  }

  if (record?.contracts === undefined || record?.roles === undefined) {
    fail("kairos.json 에 `contracts` 또는 `roles` 가 없다. 배포 산출물이 아니다(문서 13 §6).");
  }
  // RPC 의 chainId(assertKairos)와 별개로 **파일**도 Kairos 산출물인지 본다 — 다른 네트워크 산출물을
  // 잘못 복사했거나 엉뚱한 파일을 읽었을 때 앞단에서 잡는다(!114 리뷰).
  if (record.chainId !== Number(KAIROS_CHAIN_ID)) {
    fail(`kairos.json 의 chainId 가 ${String(record.chainId)} 다(기대 ${KAIROS_CHAIN_ID}). Kairos 배포 산출물이 아니다.`);
  }
  return record;
}

/** 배포 산출물에서 생성자 인자를 재구성한다. 문서 13 §2.2 배포 절차 2. */
function buildTargets(record: DeploymentRecord): Target[] {
  const { admin, operator, minter } = record.roles;
  for (const [key, value] of Object.entries({ admin, operator, minter })) {
    if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
      fail(`kairos.json 의 roles.${key} 가 주소 형식이 아니다: ${String(value)}`);
    }
  }

  const address = (name: string): string => {
    const addr = record.contracts[name]?.address;
    if (typeof addr !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      fail(`kairos.json 의 contracts.${name}.address 가 주소 형식이 아니다: ${String(addr)}`);
    }
    return addr;
  };

  const yoyo = address("YoYo");
  return [
    {
      name: "YoYo",
      address: yoyo,
      fqn: "contracts/YoYo.sol:YoYo",
      args: [admin, minter],
    },
    {
      name: "RevenueSplitter",
      address: address("RevenueSplitter"),
      fqn: "contracts/RevenueSplitter.sol:RevenueSplitter",
      // 세 번째 인자는 **파일에 적힌 YoYo 주소**다. `invariants.splitterToken` 이 아니라
      // `contracts.YoYo.address` 를 쓴다 — 배포 어서션 ②가 둘이 같음을 이미 보장한다.
      args: [admin, operator, yoyo],
    },
  ];
}

/**
 * 지금 연결된 RPC 가 정말 Kairos 인지 본다.
 * 다른 체인을 가리킨 채 verify 를 돌리면 "그 주소에 코드가 없다"는 엉뚱한 실패가 난다.
 */
async function assertKairos(): Promise<void> {
  const connection = await hre.network.create();
  try {
    const chainIdHex = (await connection.provider.request({ method: "eth_chainId" })) as string;
    const chainId = BigInt(chainIdHex);
    if (chainId !== KAIROS_CHAIN_ID) {
      fail(
        `연결된 네트워크의 chainId 가 ${chainId} 다(기대 ${KAIROS_CHAIN_ID}). ` +
          "`--network kairos` 로 돌렸는지, KAIA_RPC_URL 이 Kairos 를 가리키는지 확인해라. (값은 출력하지 않는다)",
      );
    }
    log(`network      : ${connection.networkName} (chainId ${chainId})`);
  } finally {
    await connection.close();
  }
}

/**
 * 한 컨트랙트를 한 프로바이더에 검증 제출한다.
 * "이미 검증됨"은 플러그인이 예외 없이 정상 반환하므로 여기서 문자열을 매칭할 필요가 없다
 * (`verifyContract` 가 `isVerified()` 를 먼저 보고 true 로 끝낸다).
 */
async function verifyOne(target: Target, provider: string): Promise<void> {
  const task = hre.tasks.getTask(["verify", provider]);
  await task.run({
    address: target.address,
    constructorArgs: target.args,
    contract: target.fqn,
  });
}

/**
 * 방금 검증한 주소의 Sourcify match 등급을 읽는다 — `"exact_match"` | `"match"`(= partial) | `"unknown"`.
 *
 * 왜 따로 조회하나: 플러그인의 `isVerified()` 는 **partial match 도 true** 로 본다. partial 은
 * "런타임 바이트코드는 같지만 메타데이터 해시가 다르다"는 뜻이라 재제출 없이 그냥 통과하고,
 * 기록에는 "검증됨"만 남는다. 그러면 "이 소스가 정확히 이 배포다"라는 검증 페이지의 주장이
 * 반쪽이 된다(!114 리뷰). 실패로 두지는 않는다 — 갱신 조건은 "검증됨/아님" 하나뿐이고 partial 도
 * 소스는 공개돼 있다. 대신 등급을 파일에 남기고 경고를 찍어 사람이 `--force` 재제출을 판단한다.
 */
async function readSourcifyMatch(address: string): Promise<string> {
  const url = `${SOURCIFY_API}/v2/contract/${Number(KAIROS_CHAIN_ID)}/${address}`;
  const controller = new AbortController();
  // 조회가 늦어도 verify 결과 자체는 이미 확정이다. 5초에 끊고 "unknown" 으로 넘어간다.
  const timer = setTimeout(() => controller.abort(), SOURCIFY_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!res.ok) {
      log(`  [주의] Sourcify match 조회 실패 (HTTP ${res.status}) — sourcifyMatch 를 "unknown" 으로 기록한다.`);
      return "unknown";
    }
    const body = (await res.json()) as { match?: string | null };
    if (typeof body.match !== "string") {
      log(`  [주의] Sourcify 응답에 match 가 없다 — sourcifyMatch 를 "unknown" 으로 기록한다.`);
      return "unknown";
    }
    return body.match;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`  [주의] Sourcify match 조회 실패 (${msg}) — sourcifyMatch 를 "unknown" 으로 기록한다.`);
    return "unknown";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 같은 디렉터리의 임시 파일에 쓰고 `rename` 으로 갈아끼운다.
 * 같은 볼륨 안의 rename 은 원자적이라, 쓰는 도중 죽어도 **잘린 JSON 이 배포 주소 정본 자리에
 * 남지 않는다** — 그 파일이 깨지면 Jenkins 가 백엔드·프론트에 넣을 주소를 잃는다(!114 리뷰).
 * 잠금은 걸지 않는다(동시 실행을 전제하지 않는 절차다).
 */
function writeRecordAtomically(record: DeploymentRecord): void {
  const tmpPath = `${RECORD_PATH}.tmp-${process.pid}`;
  try {
    writeFileSync(tmpPath, JSON.stringify(record, null, 2) + "\n", "utf8");
    renameSync(tmpPath, RECORD_PATH);
  } catch (e) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // 임시 파일이 만들어지기 전에 터졌으면 지울 것이 없다.
    }
    fail(`deployments/kairos.json 갱신 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** `hardhat.config.ts` 의 solidity 설정에서 실제로 검증에 쓰인 값을 읽는다(상수로 베끼지 않는다). */
function compilerSettings(): { compiler: string; optimizer: { enabled: boolean; runs: number }; viaIR: boolean } {
  // hardhat-verify 3.1.0 은 `globalOptions.buildProfile` 이 없으면 "production" 프로파일로 검증한다
  // (node_modules/@nomicfoundation/hardhat-verify/dist/src/internal/verification.js:46, 2026-09-16 확인).
  // 여기서도 같은 규칙을 써야 기록값과 실제 제출값이 어긋나지 않는다. 플러그인을 올리면 이 줄을 다시 본다.
  const profileName = (hre.globalOptions as { buildProfile?: string }).buildProfile ?? "production";
  const profile = hre.config.solidity.profiles[profileName];
  const compiler = profile?.compilers?.[0] as
    | { version?: string; settings?: { optimizer?: { enabled?: boolean; runs?: number }; viaIR?: boolean } }
    | undefined;

  if (compiler?.version === undefined) {
    fail(`solidity 프로파일 "${profileName}" 에서 컴파일러 버전을 읽지 못했다. hardhat.config.ts 를 확인해라.`);
  }

  return {
    compiler: compiler.version,
    optimizer: {
      enabled: compiler.settings?.optimizer?.enabled ?? false,
      runs: compiler.settings?.optimizer?.runs ?? 200,
    },
    viaIR: compiler.settings?.viaIR ?? false,
  };
}

async function main(): Promise<void> {
  const record = readRecord();
  const targets = buildTargets(record);
  const providers = activeProviders();

  log("=".repeat(72));
  await assertKairos();
  log(`record       : ${relative(ROOT, RECORD_PATH).replaceAll("\\", "/")}`);
  log(`providers    : ${providers.map(label).join(" · ")}`);
  log("");

  const settings = compilerSettings();
  const failures: string[] = [];
  let updated = 0;

  for (const target of targets) {
    log("-".repeat(72));
    log(`${target.name}`);
    log(`  address    : ${target.address}`);
    log(`  constructor: ${target.args.join(", ")}`);

    const providerFailures: string[] = [];
    for (const provider of providers) {
      try {
        await verifyOne(target, provider);
        log(`  [OK] ${label(provider)}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`  [실패] ${label(provider)} — ${msg}`);
        providerFailures.push(`${target.name}/${label(provider)}`);
      }
    }

    if (providerFailures.length > 0) {
      failures.push(...providerFailures);
      // 한쪽만 성공한 상태에서 `verification` 을 갱신하면 "양쪽 검증됨"이라는 거짓 기록이 남는다.
      log(`  → ${target.name} 의 verification 필드는 갱신하지 않는다(부분 성공).`);
      continue;
    }

    // 제출은 성공했다. 등급(exact/partial)까지 확인해 기록에 남긴다 — 실패로는 두지 않는다.
    let sourcifyMatch: string | undefined;
    if (providers.includes("sourcify")) {
      sourcifyMatch = await readSourcifyMatch(target.address);
      if (sourcifyMatch === "match") {
        log("  [주의] Sourcify 는 partial match 다 — 메타데이터 해시가 다르다. --force 로 재제출을 검토");
      }
    }

    // 기존 필드 모양을 그대로 따른다(9/11 값). 다른 필드는 건드리지 않는다 — 배포 시각·txHash·
    // 주소는 실배포와 일치해야 한다(문서 13 §6).
    record.contracts[target.name].verification = {
      verifiedAt: new Date().toISOString(),
      compiler: settings.compiler,
      optimizer: settings.optimizer,
      viaIR: settings.viaIR,
      kaiascan: `${KAIROS_EXPLORER}/address/${target.address}#code`,
      sourcify: `${SOURCIFY_REPO}/${Number(KAIROS_CHAIN_ID)}/${target.address}`,
      ...(sourcifyMatch === undefined ? {} : { sourcifyMatch }),
    };
    updated += 1;
  }

  log("-".repeat(72));

  // 컨트랙트 하나라도 실패하면 파일을 **쓰지 않는다** — 프로바이더 단위(한쪽만 성공)와 같은 규칙을
  // 컨트랙트 단위에도 적용한다. 부분 갱신된 파일이 아티팩트로 남거나 커밋되면 "한쪽은 검증됐다"는
  // 기록이 실패한 실행의 흔적을 가린다(!114 리뷰). 실패 시 디스크의 파일은 실행 전 그대로다.
  if (failures.length > 0) {
    log("기록 미갱신: 실패한 컨트랙트가 있어 deployments/kairos.json 을 건드리지 않는다.");
    fail(`검증 실패: ${failures.join(", ")}`);
  }

  if (updated > 0) {
    writeRecordAtomically(record);
    log(`기록 갱신: ${relative(ROOT, RECORD_PATH).replaceAll("\\", "/")} — verification ${updated}건`);
    log("        이 파일을 커밋해야 검증 페이지·문서의 '검증됨' 표시가 실제 주소를 가리킨다.");
  }

  log("");
  log("모두 검증됨. KaiaScan 이벤트 이름은 **이 시점 이후 tx** 부터 붙는다(옛 tx 로그는 Unknown 유지).");
  log("=".repeat(72));
}

try {
  await main();
} catch (e) {
  console.error("");
  console.error("verify 실패");
  // 비-VerifyError 예외를 객체째 찍으면 스택에 매달린 값(설정 객체·응답 본문)까지 콘솔에 남는다.
  // Jenkins 콘솔 로그는 보존되므로 메시지만 찍는다(!114 리뷰).
  console.error(e instanceof Error ? e.message : String(e));
  // Jenkins 는 set -e 로 돌린다. 0이 아닌 코드로 끝나야 파이프라인이 멈춘다.
  process.exitCode = 1;
}
