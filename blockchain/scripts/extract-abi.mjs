/**
 * 컴파일 산출물(artifacts/)에서 ABI만 뽑아 deployments/abi/ 에 커밋 가능한 형태로 남긴다.
 *
 *   npx hardhat build && node scripts/extract-abi.mjs
 *
 * 왜 artifacts/ 를 그대로 커밋하지 않는가 — artifacts 에는 bytecode·metadata·소스맵이 함께 들어
 * 있어 파일이 수백 KB이고 컴파일할 때마다 통째로 바뀐다. 서버(web3j generate)와 프론트(ethers
 * Interface)가 필요로 하는 것은 ABI 배열 하나뿐이라, 그것만 떼어 diff 가 읽히는 형태로 둔다.
 *
 * abiHash 는 `integration-qa` 가 "커밋된 ABI == web3j 래퍼를 생성할 때 쓴 ABI" 를 대조하는 데 쓴다.
 * 인터페이스가 안 바뀌면 이 값도 안 바뀐다(로직만 고친 재컴파일은 해시가 그대로다).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT_DIR = resolve(ROOT, "deployments/abi");

// 서버·프론트가 붙는 두 컨트랙트만. 내부 인터페이스(IYoYoRoles)는 뽑지 않는다.
const TARGETS = [
  { name: "YoYo", artifact: "artifacts/contracts/YoYo.sol/YoYo.json" },
  { name: "RevenueSplitter", artifact: "artifacts/contracts/RevenueSplitter.sol/RevenueSplitter.json" },
];

mkdirSync(OUT_DIR, { recursive: true });

const index = [];

for (const t of TARGETS) {
  const artifactPath = resolve(ROOT, t.artifact);
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  } catch (e) {
    console.error(`[실패] ${t.artifact} 를 읽지 못했다 — 먼저 npx hardhat build 를 돌려라.`);
    process.exit(1);
  }
  const abi = artifact.abi;
  if (!Array.isArray(abi) || abi.length === 0) {
    console.error(`[실패] ${t.name} 의 abi 가 비어 있다.`);
    process.exit(1);
  }

  // 키 순서가 컴파일러 버전에 따라 흔들리면 해시가 무의미해진다. 정렬해서 고정한다.
  const canonical = JSON.stringify(abi, Object.keys(abi[0] ?? {}).sort());
  const abiHash = createHash("sha256").update(JSON.stringify(abi)).digest("hex");

  writeFileSync(resolve(OUT_DIR, `${t.name}.json`), JSON.stringify(abi, null, 2) + "\n", "utf8");

  // 누산기를 Object.create(null) 로 만든다. `{}` 로 두면 e.type 이 "constructor" 일 때
  // acc["constructor"] 가 프로토타입의 Object 생성자를 집어 "function Object()…1" 이 된다.
  const counts = abi.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] ?? 0) + 1;
    return acc;
  }, Object.create(null));
  index.push({ name: t.name, abiHash, counts });
  console.log(
    `${t.name.padEnd(16)} function=${counts.function ?? 0} event=${counts.event ?? 0} error=${counts.error ?? 0} sha256=${abiHash.slice(0, 12)}…`,
  );
  void canonical;
}

writeFileSync(
  resolve(OUT_DIR, "index.json"),
  JSON.stringify(
    {
      note: "컴파일 산출물에서 ABI만 추출한 것. 직접 편집하지 말고 scripts/extract-abi.mjs 로 다시 만든다.",
      generatedFrom: "npx hardhat build (solc 0.8.28)",
      contracts: index,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

console.log(`\n${OUT_DIR} 에 기록했다.`);
