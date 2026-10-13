/**
 * 컨트랙트 custom error ↔ 서버 selector 표 ↔ 문서 13 §4.6 대조.
 *
 *   npx hardhat build && node scripts/extract-abi.mjs && node scripts/check-selectors.mjs
 *   (CI 는 test/Selectors.test.ts 가 같은 검사를 돈다 — 컨트랙트 error 가 바뀌면 거기서 깨진다)
 *
 * 왜 필요한가 — Solidity custom error 는 체인에 이름을 남기지 않는다. revert 데이터 앞 4바이트
 * (selector = keccak256(시그니처)[:4])만 남고, 서버 ChainFailure.KNOWN_SELECTORS 가 그 4바이트를
 * 규격 ErrorCode 로 번역한다. error 이름이나 인자 타입이 한 글자만 바뀌어도 selector 가 통째로
 * 달라져 서버는 그 revert 를 COMMON_INTERNAL_ERROR 로 뭉개고, 사용자는 원인과 무관한 안내를
 * 받는다. 2026-09-11 에 손으로 44개를 대조해 전부 일치했지만(D-53), 손 대조는 다음 변경을 잡지
 * 못한다. 저장소 안에서 재실행되는 검사로 굳힌다(S15P21B204-91).
 *
 * 세 정본을 한 번에 본다.
 *   ① deployments/abi/*.json  — 커밋된 ABI(서버 web3j 래퍼·프론트 Interface 가 쓰는 그 파일).
 *      error 항목의 시그니처를 만들어 selector 를 계산한다.
 *   ② backend/.../chain/service/ChainFailure.java — `Map.entry("0x…", ErrorCode.X), // Name(...)`
 *      줄에서 selector 와 error 이름을 읽는다(이름은 뒤 주석에서 — 인자 타입은 축약될 수 있어 쓰지 않음).
 *   ③ docs/design/13_컨트랙트_인터페이스_v1.md §4.6 — error 이름이 매핑 표에 등장하는지.
 *
 * 판정: ①의 error 마다 ②에 같은 이름이 있고 selector 가 같아야 하며 ③에 이름이 있어야 한다.
 *       ②에 있는데 ①에 없는 이름(낡은 항목)도 문제다.
 * 이 스크립트는 ErrorCode 매핑의 **옳고 그름**은 판단하지 않는다 — 그것은 §4.6 표의 정책이고
 * 사람이 정한다. 여기서 보는 것은 "이름·selector 가 세 곳에서 같은가"뿐이다.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { id } from "ethers";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");

const ABI_FILES = ["YoYo", "RevenueSplitter"].map((n) => resolve(REPO, `blockchain/deployments/abi/${n}.json`));
const CHAIN_FAILURE = resolve(REPO, "backend/src/main/java/com/ssafy/b204/chain/service/ChainFailure.java");
const DOC13 = resolve(REPO, "docs/design/13_컨트랙트_인터페이스_v1.md");

/** ABI error 항목 → 정규 시그니처. ABI 의 type 은 이미 정규형(uint256·bytes32·address[] …)이다. */
function signatureOf(entry) {
  return `${entry.name}(${(entry.inputs ?? []).map((i) => i.type).join(",")})`;
}

export function loadAbiErrors(files = ABI_FILES) {
  const bySig = new Map();
  for (const f of files) {
    const abi = JSON.parse(readFileSync(f, "utf8"));
    for (const e of abi) {
      if (e.type !== "error") continue;
      const sig = signatureOf(e);
      bySig.set(sig, { name: e.name, sig, selector: id(sig).slice(0, 10) });
    }
  }
  return [...bySig.values()];
}

export function loadServerTable(file = CHAIN_FAILURE) {
  const java = readFileSync(file, "utf8");
  // 마지막 항목은 `Map.ofEntries(...)` 를 닫는 `))` 로 끝난다 — 닫는 괄호 수를 고정하지 않는다.
  const re = /Map\.entry\("(0x[0-9a-f]{8})",\s*ErrorCode\.(\w+)\)+;?\s*,?\s*\/\/\s*([A-Za-z0-9_]+)\(/g;
  const byName = new Map();
  for (const m of java.matchAll(re)) {
    byName.set(m[3], { selector: m[1], code: m[2], name: m[3] });
  }
  return byName;
}

export function loadDocSection(file = DOC13) {
  const md = readFileSync(file, "utf8");
  const start = md.indexOf("### 4.6");
  const end = md.indexOf("### 4.7", start);
  if (start < 0 || end < 0) throw new Error("문서 13 §4.6 절을 찾지 못했다");
  return md.slice(start, end);
}

/**
 * §4.6 표 **밖**에 두기로 한 error — OpenZeppelin 이 상속시킨 것 중 정상 경로에서 나올 수 없는 것들.
 * ChainFailure 는 "표에 있는 것만 담는다"(javadoc) 이므로 여기 이름은 서버 항목이 없어도 문제가
 * 아니다. 대신 문서 §4.6 이 이 이름들을 "표 밖 — COMMON_INTERNAL_ERROR 기본값" 행으로 적어야 한다 —
 * 그래야 다음 사람이 "빠졌다"와 "뺐다"를 구분한다. 목록을 늘리려면 문서 행도 같이 늘린다.
 */
export const OUTSIDE_TABLE = new Set([
  "ERC20InvalidApprover", "ERC20InvalidReceiver", "ERC20InvalidSender", "ERC20InvalidSpender",
  "SafeERC20FailedOperation", "ExpectedPause", "AccessControlBadConfirmation",
]);

/** @returns {{ checked: number, serverEntries: number, problems: string[] }} */
export function runCheck() {
  const abiErrors = loadAbiErrors();
  const server = loadServerTable();
  const doc = loadDocSection();
  const problems = [];

  // 같은 이름이 두 컨트랙트에 다른 시그니처로 있으면 이름만으로는 못 가른다 — 그 자체가 문제다.
  const namesSeen = new Map();
  for (const e of abiErrors) {
    if (namesSeen.has(e.name) && namesSeen.get(e.name) !== e.sig) {
      problems.push(`ABI: 같은 이름이 다른 시그니처로 둘 — ${namesSeen.get(e.name)} / ${e.sig}`);
    }
    namesSeen.set(e.name, e.sig);
  }

  for (const e of abiErrors) {
    const s = server.get(e.name);
    if (!s && !OUTSIDE_TABLE.has(e.name)) {
      problems.push(`ChainFailure 에 없음: ${e.sig} (${e.selector})`);
    } else if (s && s.selector !== e.selector) {
      problems.push(`selector 불일치: ${e.sig} — ABI ${e.selector} / ChainFailure ${s.selector}`);
    } else if (s && OUTSIDE_TABLE.has(e.name)) {
      problems.push(`표 밖 목록인데 ChainFailure 에 있음 — 한쪽을 고쳐라: ${e.name}`);
    }
    // 문서는 `Name(` 또는 `Name` 백틱 표기 둘 다 쓴다(OZ error 는 인자 없이 적었다).
    if (!doc.includes(`\`${e.name}(`) && !doc.includes(`\`${e.name}\``)) {
      problems.push(`문서 13 §4.6 에 없음: ${e.name}`);
    }
  }
  for (const s of server.values()) {
    if (!namesSeen.has(s.name)) {
      problems.push(`ChainFailure 에만 있음(낡은 항목?): ${s.name} ${s.selector}`);
    }
  }
  return { checked: abiErrors.length, serverEntries: server.size, problems };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { checked, serverEntries, problems } = runCheck();
  console.log(`ABI error ${checked}개 · ChainFailure 항목 ${serverEntries}개`);
  if (problems.length === 0) {
    console.log("ok: 세 정본의 error 이름·selector 가 전부 일치한다");
  } else {
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error(`문제 ${problems.length}건`);
    process.exit(1);
  }
}
