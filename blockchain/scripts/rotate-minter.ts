/**
 * MINTER 로테이션 — `YoYo.rotateMinter(next)` 를 ADMIN 콜드 키로 실행한다 (Hardhat 3).
 *
 *   cd blockchain && npx hardhat run scripts/rotate-minter.ts --network kairos
 *
 * Jenkins `Rotate minter` 스테이지가 이 형태로 부른다. 절차 전체는 `exec/README.md`
 * "MINTER 로테이션" — 이 스크립트는 그 6단계 중 **3단계 하나**다.
 *
 * ── 입력 (환경변수) ────────────────────────────────────────────────────────
 *   NEW_MINTER_ADDRESS : 새 MINTER 의 **공개 주소**. 개인키가 아니다.
 *   KAIA_RPC_URL · ADMIN_PRIVATE_KEY : kairos 네트워크 설정이 configVariable 로 읽는다.
 *
 * 컨트랙트 주소는 `deployments/kairos.json` 이 정본이다 — Jenkins Build·Deploy 가 같은
 * 파일에서 주소를 읽는다. 명령줄에 주소를 다시 타이핑하면 틀리고, 틀린 주소는 "실패"가
 * 아니라 엉뚱한 컨트랙트를 건드린다.
 *
 * ── 하지 않는 것 ──────────────────────────────────────────────────────────
 * `kairos.json` 의 `roles.minter` 와 `.env.example` 의 `MINTER_ADDRESS` 를 **갱신하지
 * 않는다.** 그 두 줄은 사람이 커밋한다(README 6단계) — Jenkins 작업 공간의 변경은
 * 저장소로 돌아가지 않으므로, 여기서 고쳐 봐야 다음 빌드가 옛 주소로 되돌린다.
 *
 * 비밀값 취급: 주소·tx 해시·블록 번호만 출력한다. 개인키는 어떤 경로로도 찍지 않고,
 * `NEW_MINTER_ADDRESS` 도 주소 형식을 확인하기 전에는 **길이만** 남긴다 — 개인키
 * (0x + 64 hex)를 잘못 붙여 넣었을 때 Jenkins 콘솔 로그에 그대로 보존되지 않게 한다.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { network } from "hardhat";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RECORD_PATH = resolve(ROOT, "deployments/kairos.json");
const KAIROS_CHAIN_ID = 1001n;
const ENV_NEXT = "NEW_MINTER_ADDRESS";

/** 0x + 40 hex. 체크섬은 보지 않는다 — 이건 "개인키를 붙여 넣었나"를 가르는 1차 관문이다. */
const ADDRESS_SHAPE = /^0x[0-9a-fA-F]{40}$/;

function log(msg = ""): void {
  console.log(msg);
}

/** 실패는 이 함수로만 낸다 — 메시지 형식을 하나로 묶고 종료 코드를 1로 만든다(deploy.ts 와 같다). */
class RotateError extends Error {}
function fail(msg: string): never {
  throw new RotateError(msg);
}

/**
 * `NEW_MINTER_ADDRESS` → 체크섬 정규화된 주소.
 *
 * 값이 주소 **형식**이 아니면 값을 출력하지 않고 길이만 남긴다(개인키 오입력 대비).
 * 형식이 맞는데 `getAddress` 가 터지면 그건 체크섬 불일치다 — 이때는 공개 주소가
 * 확실하므로 값을 그대로 보여 준다. 대소문자를 섞어 잘못 적은 주소는 여기서 멈춘다.
 */
function resolveNext(ethersLib: any): string {
  const raw = process.env[ENV_NEXT]?.trim();
  if (!raw) {
    fail(`환경변수 ${ENV_NEXT} 가 비어 있다. 새 MINTER 의 공개 주소(0x + 40 hex)를 넣어라.`);
  }
  if (!ADDRESS_SHAPE.test(raw)) {
    fail(
      `환경변수 ${ENV_NEXT} 가 0x + 40 hex 주소가 아니다(입력 길이 ${raw.length}자). ` +
        "개인키가 아니라 공개 주소를 넣는다. (값은 로그에 남기지 않는다)",
    );
  }
  try {
    return ethersLib.getAddress(raw);
  } catch {
    fail(
      `환경변수 ${ENV_NEXT} 의 체크섬이 틀렸다: ${raw}\n` +
        "           대소문자가 섞인 주소는 EIP-55 체크섬이다 — 한 글자만 어긋나도 다른 주소일 수 있다.\n" +
        "           KaiaScan 에서 주소를 다시 복사하거나, 전부 소문자로 넣어라.",
    );
  }
}

/** `deployments/kairos.json` 에서 두 컨트랙트 주소를 읽는다. 주소의 정본은 이 파일 하나다. */
function readAddresses(ethersLib: any): { yoyo: string; splitter: string } {
  let record: any;
  try {
    record = JSON.parse(readFileSync(RECORD_PATH, "utf8"));
  } catch (e) {
    fail(`deployments/kairos.json 을 읽지 못했다: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (record?.chainId !== Number(KAIROS_CHAIN_ID)) {
    fail(
      `kairos.json 의 chainId 가 ${String(record?.chainId)} 다(기대 ${KAIROS_CHAIN_ID}). Kairos 배포 산출물이 아니다.`,
    );
  }
  const pick = (name: string): string => {
    const addr = record?.contracts?.[name]?.address;
    if (typeof addr !== "string" || !ethersLib.isAddress(addr)) {
      fail(`kairos.json 의 contracts.${name}.address 가 주소 형식이 아니다: ${String(addr)}`);
    }
    return ethersLib.getAddress(addr);
  };
  // RevenueSplitter 도 필수다 — operator 를 못 읽으면 아래 [사전 ③]을 확인할 수 없고,
  // 그 검사는 컨트랙트가 대신해 주지 않는다(감사 L-10).
  return { yoyo: pick("YoYo"), splitter: pick("RevenueSplitter") };
}

async function main(): Promise<void> {
  // Hardhat 3: 전역 `ethers` 가 없다. 연결을 열고 거기서 꺼낸다(deploy.ts 와 같은 이유로 create()).
  const connection = await network.create();
  const { ethers, networkName } = connection as any;

  try {
    const chainId = (await ethers.provider.getNetwork()).chainId as bigint;
    if (networkName === "kairos" && chainId !== KAIROS_CHAIN_ID) {
      fail(`kairos 네트워크인데 chainId 가 ${chainId} 다(기대 ${KAIROS_CHAIN_ID}). KAIA_RPC_URL 을 확인해라.`);
    }

    const signers = await ethers.getSigners();
    if (signers.length === 0) {
      fail(
        `네트워크 "${networkName}" 에 signer 가 없다. kairos 라면 ADMIN_PRIVATE_KEY 를 넣어라 — ` +
          "`export ADMIN_PRIVATE_KEY=0x…` 또는 `npx hardhat keystore set ADMIN_PRIVATE_KEY`.",
      );
    }
    const admin = signers[0];

    const next = resolveNext(ethers);
    const { yoyo: yoyoAddress, splitter: splitterAddress } = readAddresses(ethers);

    const yoyo = await ethers.getContractAt("YoYo", yoyoAddress, admin);
    const splitter = await ethers.getContractAt("RevenueSplitter", splitterAddress, admin);

    const previous = ethers.getAddress(await yoyo.minter());
    const operator = ethers.getAddress(await splitter.operator());

    log("=".repeat(72));
    log(`network      : ${networkName} (chainId ${chainId})`);
    log(`signer       : ${admin.address}   ← admin(DEFAULT_ADMIN_ROLE), 콜드 키`);
    log(`YoYo         : ${yoyoAddress}`);
    log(`RevenueSplit : ${splitterAddress}`);
    log(`minter (현재): ${previous}`);
    log(`minter (교체): ${next}`);
    log("");
    log("사전 검사");

    // [사전 ③] 새 MINTER != Splitter.operator().
    //   컨트랙트는 0주소·admin 겸직·현재 minter 와 동일만 막는다(rotateMinter 의 세 revert).
    //   operator 와의 충돌은 **어디서도 막지 않는다**(감사 L-10) — YoYo 는 Splitter 의 operator 를
    //   모르고, Splitter 의 RoleConflict 검사는 생성자에서 한 번 돌 뿐이다. 겸직이 생기면 상시
    //   hot 인 OPERATOR 키 하나가 발행 권한까지 갖는다(문서 13 §2.2 세 키 분리가 무너진다).
    if (next === operator) {
      fail(
        "[사전 ③] 새 MINTER 주소가 RevenueSplitter.operator() 와 같다.\n" +
          `           operator: ${operator}\n` +
          "           컨트랙트는 이 겸직을 막지 않는다(감사 L-10). 교체하면 상시 hot 인 OPERATOR\n" +
          "           키 하나로 발행이 열린다 — 다른 주소로 새 MINTER 키를 만들어라.",
      );
    }
    log("  [③] 새 MINTER != Splitter.operator()            OK");

    // [사전 ④] 새 MINTER 잔액 > 0.
    //   교체 직후부터 MINT tx 가스는 새 MINTER 가 낸다(대납 대상이 아니다). 0이면 워커를 다시
    //   켜는 순간 밀려 있던 MINT job 이 잔액 부족으로 FAILED 되고, MINT 는 retireIdempotencyKey
    //   가 금지라 같은 멱등키가 그 FAILED job 을 그대로 돌려줘 지급을 되살릴 수 없다.
    const balance = await ethers.provider.getBalance(next);
    if (balance === 0n) {
      fail(
        `[사전 ④] 새 MINTER 주소의 KAIA 잔액이 0이다: ${next}\n` +
          "           교체 뒤 MINT 가스는 이 주소가 낸다. 충전하고 다시 실행해라(README 2단계,\n" +
          "           https://faucet.kaia.io — 24h/50 KAIA).",
      );
    }
    log(`  [④] 새 MINTER 잔액 ${ethers.formatEther(balance)} KAIA        OK`);

    // [사전 ⑤] 드라이런. 0주소·admin 겸직·현재 minter 와 동일·admin 권한 없음은 컨트랙트가
    //   막는다 — 같은 조건을 여기에 베껴 쓰지 않고, 보낼 tx 그대로 staticCall 해서 revert 사유를
    //   가스 없이 받는다. 커스텀 에러 이름(ZeroAddress·RoleConflict·
    //   AccessControlUnauthorizedAccount)은 ethers 가 ABI 로 디코드해 준다.
    try {
      await yoyo.rotateMinter.staticCall(next);
    } catch (e: any) {
      // 커스텀 에러 이름이 어디에 실리는지는 노드마다 다르다 — 실 RPC 는 `revert.name` 을 채우지만
      // 로컬 EDR 은 메시지 문자열에만 담는다. 둘을 합쳐 보고 고른다.
      const detail = e?.revert?.name ?? e?.shortMessage ?? e?.message ?? String(e);
      const haystack = `${e?.revert?.name ?? ""} ${e?.shortMessage ?? ""} ${e?.message ?? ""}`;
      const hint = haystack.includes("RoleConflict")
        ? "\n           → 새 주소가 admin 이거나 현재 minter 와 같다."
        : haystack.includes("AccessControlUnauthorizedAccount")
          ? "\n           → 서명자가 DEFAULT_ADMIN_ROLE 이 아니다. ADMIN_PRIVATE_KEY 에 다른 키를 꽂았을 가능성이 높다."
          : "";
      fail(`[사전 ⑤] rotateMinter 드라이런이 revert 했다: ${detail}${hint}`);
    }
    log("  [⑤] rotateMinter 드라이런                       OK");

    // ── 실행 ────────────────────────────────────────────────────────────────
    log("");
    log("rotateMinter 전송 …");
    const tx = await yoyo.rotateMinter(next);
    log(`  txHash     : ${tx.hash}`);
    const rcpt = await tx.wait();
    if (rcpt?.status !== 1) {
      fail(`tx 가 실패 상태로 확정됐다(status=${rcpt?.status}). txHash: ${tx.hash}`);
    }
    log(`  blockNumber: ${rcpt.blockNumber}   gasUsed: ${rcpt.gasUsed}`);

    // ── 사후 검사 — 전부 온체인 readback. 하나라도 어긋나면 실패로 끝낸다 ─────
    log("");
    log("사후 검사");

    const emitted = rcpt.logs
      .map((entry: any) => {
        try {
          return yoyo.interface.parseLog(entry);
        } catch {
          return null;
        }
      })
      .find((parsed: any) => parsed?.name === "MinterRotated");
    if (!emitted) {
      fail("[사후 ①] MinterRotated 이벤트가 없다. 같은 주소의 다른 컨트랙트를 불렀을 수 있다.");
    }
    const emittedPrev = ethers.getAddress(emitted.args.previousMinter);
    const emittedNext = ethers.getAddress(emitted.args.newMinter);
    if (emittedPrev !== previous || emittedNext !== next) {
      fail(
        "[사후 ①] MinterRotated 인자가 기대와 다르다.\n" +
          `           이벤트: previous=${emittedPrev} next=${emittedNext}\n` +
          `           기대  : previous=${previous} next=${next}`,
      );
    }
    log(`  [①] MinterRotated(${emittedPrev}, ${emittedNext})`);

    const onchainMinter = ethers.getAddress(await yoyo.minter());
    if (onchainMinter !== next) {
      fail(`[사후 ②] YoYo.minter() 가 새 주소가 아니다: ${onchainMinter} != ${next}`);
    }
    log("  [②] YoYo.minter() == 새 주소                    OK");

    // 역할 관리가 봉인돼 있어 rotateMinter 말고는 MINTER_ROLE 을 건드릴 수 없다. 그래도 읽어서
    // 확인한다 — "발행 권한을 가진 주소는 언제나 1개"가 이 절차의 전부다.
    const MINTER_ROLE = await yoyo.MINTER_ROLE();
    if (await yoyo.hasRole(MINTER_ROLE, previous)) {
      fail(`[사후 ③] 옛 minter 가 아직 MINTER_ROLE 을 갖고 있다: ${previous}`);
    }
    if (!(await yoyo.hasRole(MINTER_ROLE, next))) {
      fail(`[사후 ③] 새 minter 가 MINTER_ROLE 을 갖고 있지 않다: ${next}`);
    }
    log("  [③] MINTER_ROLE — 옛 주소 회수 · 새 주소 보유    OK");

    log("");
    log(`로테이션 완료. txHash: ${tx.hash}`);
    log("=".repeat(72));
  } finally {
    await connection.close();
  }
}

try {
  await main();
} catch (e) {
  console.error("");
  console.error("MINTER 로테이션 실패");
  console.error(e instanceof RotateError ? e.message : e);
  // Jenkins 는 set -e 로 돌린다. 0이 아닌 코드로 끝나야 파이프라인이 멈춘다.
  process.exitCode = 1;
}
