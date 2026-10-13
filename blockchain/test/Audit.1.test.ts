/**
 * Audit.1 — contract-auditor 라운드 1 재현 테스트 (2026-09-07)
 *
 * 이 파일은 **감사자가 쓴 회귀 테스트**다. contract-engineer 가 발견을 고치면
 * 여기 있는 테스트가 초록으로 바뀐다. "고쳤다"는 말 대신 이 파일이 증명한다.
 *
 * 실행: cd blockchain && npx hardhat test
 *
 * RevenueSplitter 는 2026-09-07 시점에 스켈레톤이다(본문 `revert NotImplemented()`).
 * 그래서 "공연이 존재해야 하는" 경로는 이 파일에서 검증할 수 없고 Audit.2 로 뺐다.
 * 여기 있는 것은 **지금 실제로 실행되는 코드**(생성자 · 역할 봉인 · createShow 선행검사 ·
 * showExists · YoYo 전체 · ABI/selector 계약)만 다룬다.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { network } from "hardhat";
import { id, Interface } from "ethers";

// ---------------------------------------------------------------------------
// revert 이름을 정확히 뽑는 헬퍼. ethers 는 custom error 를 문자열로만 던지는 경우가
// 있어 이름 비교가 흔들린다 — 가능하면 ABI 로 직접 디코드한다.
// ---------------------------------------------------------------------------
async function revertName(
  p: Promise<unknown> | (() => Promise<unknown>),
  ifaces: Interface[],
): Promise<string> {
  try {
    await (typeof p === "function" ? p() : p);
    return "<no revert>";
  } catch (e: any) {
    const data =
      (typeof e?.data === "string" ? e.data : e?.data?.data) ??
      e?.error?.data ??
      e?.info?.error?.data ??
      e?.revert?.data ??
      undefined;
    if (typeof data === "string" && data.length >= 10) {
      for (const iface of ifaces) {
        try {
          const parsed = iface.parseError(data);
          if (parsed) return parsed.name;
        } catch {
          /* 다음 iface 로 */
        }
      }
      return "unknown(" + data.slice(0, 10) + ")";
    }
    if (e?.revert?.name) return e.revert.name;
    const m = String(e?.shortMessage ?? e?.message ?? e);
    const hit = m.match(/custom error [`'"]?([A-Za-z0-9_]+)/);
    return hit ? hit[1] : m;
  }
}

const ZERO = "0x0000000000000000000000000000000000000000";
const ZERO32 = "0x" + "00".repeat(32);
const RULES = id("rules-json-v1");
const SHOW = 1n;
const NONEXISTENT = 999n;

async function fixture() {
  const { ethers } = await network.connect();
  const [admin, operator, minter, host, teamB, teamC, audience, outsider] =
    await ethers.getSigners();

  const yoyo = await ethers.deployContract("YoYo", [admin.address, minter.address]);
  const splitter = await ethers.deployContract("RevenueSplitter", [
    admin.address,
    operator.address,
    await yoyo.getAddress(),
  ]);
  return {
    ethers, yoyo, splitter,
    admin, operator, minter, host, teamB, teamC, audience, outsider,
  };
}

/** createShow 인자 기본 세트 — 3팀, host=0, 5000/5000, 고정풀 균등, 보증금 50000 */
function showArgs(
  teams: string[],
  over: Partial<{
    showId: bigint; teams: string[]; host: number; rulesHash: string;
    fixedBp: number; selBp: number; shares: number[]; deposit: bigint;
  }> = {},
): any[] {
  return [
    over.showId ?? SHOW,
    over.teams ?? teams,
    over.host ?? 0,
    over.rulesHash ?? RULES,
    over.fixedBp ?? 5000,
    over.selBp ?? 5000,
    over.shares ?? [3334, 3333, 3333],
    over.deposit ?? 50_000n,
  ];
}

/**
 * `createShow` 가 **선행 검사를 전부 통과해 실제로 공연을 만들었는가**를 확인한다.
 *
 * ─ 라운드 4 정정 (2026-09-07 · Phase B 덩어리 1) ────────────────────────────
 * 이전에는 이 성질을 `revertName(...) === "NotImplemented"` 로 관측했다.
 * 스켈레톤에서는 그것이 "선행 검사를 다 지났다"의 유일한 관측 대리값이었지만,
 * **`NotImplemented` 는 구현 단계의 아티팩트지 성질이 아니다.** 본문이 채워지면
 * 같은 성질이 `<no revert>` 로 나타나고, 그 순간 이 단정들은 "옳은 변경"을
 * 빨강으로 만든다(= 테스트 전제가 구현보다 좁다).
 *
 * 그래서 대리값을 버리고 **결과 상태**를 본다. 이 편이 원래 의도보다 강하다 —
 * "검사를 통과했다"가 아니라 "통과하고 끝까지 실행돼 공연이 남았다"까지 본다.
 * 선행 검사가 하나라도 되살아나면 `revertName` 에서, 저장이 빠지면 `stageOf`
 * 이하에서 빨개진다.
 */
async function assertShowCreated(
  tx: Promise<unknown> | (() => Promise<unknown>),
  splitter: any,
  expect: {
    showId?: bigint;
    teams?: string[];
    host?: number;
    deposit?: bigint;
    rulesHash?: string;
  },
  why: string,
): Promise<void> {
  const name = await revertName(tx, [splitter.interface]);
  assert.equal(name, "<no revert>", `${why}\n  → createShow 가 "${name}" 로 막혔다`);

  const showId = expect.showId ?? SHOW;
  assert.equal(
    Number(await splitter.stageOf(showId)),
    1,
    `${why}\n  → revert 는 없었는데 stage 가 CREATED(1) 가 아니다`,
  );
  if (expect.teams !== undefined) {
    assert.deepEqual(
      [...(await splitter.teamWalletsOf(showId))],
      expect.teams,
      `${why}\n  → teamWallets 스냅샷이 인자와 다르다`,
    );
  }
  if (expect.host !== undefined) {
    assert.equal(Number(await splitter.hostTeamIndexOf(showId)), expect.host, why);
  }
  if (expect.deposit !== undefined) {
    assert.equal(await splitter.depositAmountOf(showId), expect.deposit, why);
  }
  if (expect.rulesHash !== undefined) {
    assert.equal(await splitter.rulesHashOf(showId), expect.rulesHash, why);
  }
}

// ===========================================================================
describe("Audit.1-A · YoYo (완성형 — 자금 항목 포함 전수)", () => {
  it("decimals() == 0 (1 YoYo = 1원, 스케일링 금지)", async () => {
    const { yoyo } = await fixture();
    assert.equal(Number(await yoyo.decimals()), 0);
  });

  it("ABI 에 burn 계열 함수가 하나도 없다 (불변식 1 — totalSupply 단조 증가)", () => {
    const abi = JSON.parse(readFileSync("artifacts/contracts/YoYo.sol/YoYo.json", "utf8")).abi;
    const burny = abi.filter((e: any) => e.type === "function" && /burn/i.test(e.name));
    assert.deepEqual(burny, [], "burn 경로가 생겼다");
  });

  it("mint 는 MINTER 만 — admin·outsider 는 거부", async () => {
    const { yoyo, admin, outsider, audience } = await fixture();
    const i = [yoyo.interface];
    assert.equal(
      await revertName(yoyo.connect(admin).mint(audience.address, 100n, id("g1")), i),
      "AccessControlUnauthorizedAccount",
    );
    assert.equal(
      await revertName(yoyo.connect(outsider).mint(audience.address, 100n, id("g2")), i),
      "AccessControlUnauthorizedAccount",
    );
  });

  it("mint 입력 경계 — ZeroAddress · ZeroAmount · ZeroGrantRef", async () => {
    const { yoyo, minter, audience } = await fixture();
    const i = [yoyo.interface];
    assert.equal(await revertName(yoyo.connect(minter).mint(ZERO, 100n, id("g")), i), "ZeroAddress");
    assert.equal(await revertName(yoyo.connect(minter).mint(audience.address, 0n, id("g")), i), "ZeroAmount");
    assert.equal(await revertName(yoyo.connect(minter).mint(audience.address, 100n, ZERO32), i), "ZeroGrantRef");
  });

  it("같은 grantRef 재사용은 온체인에서 막힌다 (서버 멱등이 실패해도)", async () => {
    const { yoyo, minter, audience } = await fixture();
    const ref = id("grant:signup:42");
    await yoyo.connect(minter).mint(audience.address, 100_000n, ref);
    assert.equal(
      await revertName(yoyo.connect(minter).mint(audience.address, 100_000n, ref), [yoyo.interface]),
      "GrantRefUsed",
    );
    assert.equal(await yoyo.totalSupply(), 100_000n);
  });

  it("역할 관리 봉인 — grantRole · revokeRole · renounceRole 전부 revert", async () => {
    const { yoyo, admin, outsider } = await fixture();
    const role = await yoyo.MINTER_ROLE();
    const i = [yoyo.interface];
    assert.equal(await revertName(yoyo.connect(admin).grantRole(role, outsider.address), i), "RoleManagementDisabled");
    assert.equal(await revertName(yoyo.connect(admin).revokeRole(role, outsider.address), i), "RoleManagementDisabled");
    assert.equal(await revertName(yoyo.connect(admin).renounceRole(role, admin.address), i), "RoleManagementDisabled");
  });

  it("생성자가 admin == minter 를 막는다", async () => {
    const { ethers, admin } = await fixture();
    const f = await ethers.getContractFactory("YoYo");
    assert.equal(await revertName(f.deploy(admin.address, admin.address), [f.interface]), "RoleConflict");
  });

  it("rotateMinter — 0주소·admin·현재 minter 를 거부하고 이전 minter 권한을 회수한다", async () => {
    const { yoyo, admin, minter, outsider, audience } = await fixture();
    const i = [yoyo.interface];
    assert.equal(await revertName(yoyo.connect(admin).rotateMinter(ZERO), i), "ZeroAddress");
    assert.equal(await revertName(yoyo.connect(admin).rotateMinter(admin.address), i), "RoleConflict");
    assert.equal(await revertName(yoyo.connect(admin).rotateMinter(minter.address), i), "RoleConflict");
    assert.equal(
      await revertName(yoyo.connect(outsider).rotateMinter(outsider.address), i),
      "AccessControlUnauthorizedAccount",
    );

    await yoyo.connect(admin).rotateMinter(outsider.address);
    assert.equal(await yoyo.minter(), outsider.address);
    assert.equal(
      await revertName(yoyo.connect(minter).mint(audience.address, 1n, id("after-rotate")), i),
      "AccessControlUnauthorizedAccount",
      "이전 minter 권한이 회수되지 않았다 — 동시에 minter 가 2개",
    );
  });

  it("[정보] pause 는 mint 뿐 아니라 지갑 간 transfer 도 멈춘다 (Splitter refund·release 도 함께 멈춤)", async () => {
    const { yoyo, admin, minter, audience, outsider } = await fixture();
    await yoyo.connect(minter).mint(audience.address, 100n, id("p1"));
    await yoyo.connect(admin).pause();
    assert.equal(
      await revertName(yoyo.connect(audience).transfer(outsider.address, 1n), [yoyo.interface]),
      "EnforcedPause",
    );
    await yoyo.connect(admin).unpause();
    await yoyo.connect(audience).transfer(outsider.address, 1n);
  });
});

// ===========================================================================
describe("Audit.1-B · 배포 구성 (3키 — admin · OPERATOR · MINTER)", () => {
  // -------------------------------------------------------------------------
  // 라운드 2 갱신 (2026-09-07) — 이 블록의 기대값이 뒤집혔다.
  //
  // 라운드 1의 [C-01] 케이스는 "문서 §2.2 구성(admin = 배포자 = OPERATOR)으로 두 컨트랙트가
  // 배포돼야 한다"를 기대했다. **사용자 확정(9/7)은 방안 (A) — admin 전용 3번째 콜드 키**이고,
  // 그 구성을 배포 시점에 강제하는 장치가 바로 `RoleConflict()`다. 즉 **revert 하는 것이 정답**이다.
  // 낡은 기대를 그대로 두면 정답을 실패로 판정하고, 다음 사람이 그것을 "고쳐야 할 빨강"으로 읽는다.
  // -------------------------------------------------------------------------
  it("[C-01·해소] admin == operator 로는 Splitter 를 배포할 수 없다 (RoleConflict 가 3키 구성을 강제한다)", async () => {
    const { ethers, operator, yoyo } = await fixture();
    const f = await ethers.getContractFactory("RevenueSplitter");
    assert.equal(
      await revertName(f.deploy(operator.address, operator.address, await yoyo.getAddress()), [f.interface]),
      "RoleConflict",
      "이 검사를 지우면 상시 hot 상태인 OPERATOR 키 하나가 admin 을 겸하게 되고, " +
        "유출 시 rotateMinter(공격자) → mint(무제한) 로 발행량 공시(불변식 1)가 무의미해진다.",
    );
  });

  it("[C-01·해소] 3키 구성(admin·OPERATOR·MINTER 전부 다른 주소)으로 두 컨트랙트가 정상 배포된다", async () => {
    const { ethers, admin, operator, minter } = await fixture();

    // 세 주소가 전부 다르다는 것이 전제다 (문서 §6 배포 어서션 ③).
    assert.equal(new Set([admin.address, operator.address, minter.address]).size, 3);

    const yoyo = await ethers.deployContract("YoYo", [admin.address, minter.address]);
    const splitter = await ethers.deployContract("RevenueSplitter", [
      admin.address, operator.address, await yoyo.getAddress(),
    ]);

    // 배포 스크립트가 어서션해야 할 4개 (문서 §6) 중 컨트랙트로 확인 가능한 것 전부.
    assert.equal(Number(await yoyo.decimals()), 0, "① decimals() != 0");
    assert.equal(await splitter.token(), await yoyo.getAddress(), "② Splitter.token() != YoYo");
    assert.equal(await yoyo.minter(), minter.address);
    assert.equal(await splitter.operator(), operator.address);

    const DEFAULT_ADMIN = ZERO32;
    assert.ok(await yoyo.hasRole(DEFAULT_ADMIN, admin.address), "YoYo admin 이 배포자(admin)가 아니다");
    assert.ok(await splitter.hasRole(DEFAULT_ADMIN, admin.address), "Splitter admin 이 배포자(admin)가 아니다");
    // 서버 런타임 키는 어느 쪽에서도 admin 이 아니다 — 이것이 C-01 의 핵심이다.
    assert.equal(await yoyo.hasRole(DEFAULT_ADMIN, operator.address), false);
    assert.equal(await yoyo.hasRole(DEFAULT_ADMIN, minter.address), false);
    assert.equal(await splitter.hasRole(DEFAULT_ADMIN, operator.address), false);
    assert.equal(await splitter.hasRole(DEFAULT_ADMIN, minter.address), false);
    // MINTER 키는 Splitter 운영 권한이 없고, OPERATOR 키는 발행 권한이 없다.
    assert.equal(await splitter.hasRole(await splitter.OPERATOR_ROLE(), minter.address), false);
    assert.equal(await yoyo.hasRole(await yoyo.MINTER_ROLE(), operator.address), false);
  });

  it("[C-01·해소] hardhat.config.ts 의 kairos 배포 서명자가 ADMIN_PRIVATE_KEY 다", () => {
    const cfg = readFileSync("hardhat.config.ts", "utf8");
    const kairos = cfg.slice(cfg.indexOf("kairos: {"));
    assert.ok(
      /accounts:\s*\[configVariable\("ADMIN_PRIVATE_KEY"\)\]/.test(kairos),
      "배포 서명자가 admin 키가 아니면 Splitter 생성자가 RoleConflict 로 배포를 거부한다",
    );
    assert.ok(
      !/accounts:\s*\[configVariable\("OPERATOR_PRIVATE_KEY"\)\]/.test(kairos),
      "OPERATOR 키로 배포하면 admin == operator 가 된다",
    );
  });

  // -------------------------------------------------------------------------
  // 라운드 3 부록 (2026-09-07) — A-5 의 **전제가 뒤집혔다.**
  //
  // 라운드 1~3 의 이 케이스는 "루트 `.env.example` 에 `ADMIN_PRIVATE_KEY=` 이름 줄이 있어야
  // 한다"를 기대했다. 이강륜(인프라)이 커밋 `a0b5778` 에서 **다른 방식으로** 풀었고, 감사
  // 판정은 **그쪽이 옳다**이다. 낡은 기대를 그대로 두면 정답을 실패로 판정한다.
  //
  // 근거 — `.env.example` 은 이름 목록이 아니라 **소비자가 둘인 템플릿**이다.
  //   ① 이 파일 형식 그대로 Jenkins Secret file `B204_ENV` 가 되고, `deployScript()` 가
  //      그 내용으로 서버 `~/app/.env` 를 만든다(파일 머리말 + Jenkinsfile `:304`).
  //   ② 머리말이 로컬 개발자에게 `cp .env.example .env` 를 지시한다.
  // 그래서 여기에 `ADMIN_PRIVATE_KEY=` 빈 줄을 두는 것은 **서버와 팀원 노트북에 콜드 키를
  // 채워 넣을 자리를 파는 것**이다. project-truth §2 가 이 키에 요구하는 단 하나가
  // "서버에 넣지 않는다" 인데, 이름 계약을 지키자고 그 요구를 정면으로 무너뜨리게 된다.
  // 게다가 Secret file 은 Secret text 와 달리 **로그 마스킹이 없고**(Jenkinsfile 머리말),
  // `configVariable()` 은 `.env` 를 읽지도 않으므로(hardhat.config.ts 주석) 로컬 사본은
  // 위험만 늘고 쓸모가 0 이다.
  //
  // 이름 계약은 깨지지 않았다 — 이름은 `.env.example` 주석에 그대로 있고, 다만 **대입 가능한
  // 슬롯이 아닌 형태**로 있다. 그래서 이 케이스는 단정을 약화시키는 대신 방향을 뒤집어
  // "슬롯이 없다 · 경고가 있다 · 배포 스테이지에만 주입된다 · 조립 경로가 전부 필터를
  // 거친다 · 런타임 허용목록에 없다" 를 회귀로 고정한다.
  //
  // **L-08 해소 (2026-09-07, 라운드 3 부록 정정)** — 라운드 3 이 지적한 한계("(5) 의 필터가
  // 컬럼 0 리터럴 매칭이라 `export ADMIN_PRIVATE_KEY=` · 선행 공백 변형을 못 거른다")를
  // 이강륜(인프라)이 MR !24 · 커밋 `94401a7` 에서 반영했다. 필터는 이제
  // `^[[:space:]]*(export[[:space:]]+)?(…|ADMIN_PRIVATE_KEY)[[:space:]]*=` 다.
  //
  // 그런데 **그 옳은 변경이 이 케이스를 빨갛게 만들었다.** 옛 (5) 는 필터의 *문자열 모양*
  // (`grep -v -E '^(…)='`)을 정규식으로 박아 두었기 때문이다. 같은 유형이 오늘까지 네 번
  // 나왔다(A-6 · L-06 · L-05 · L-08) — **감사 테스트의 전제가 구현보다 좁아서 옳은 변경을
  // 실패로 판정하는 문제**다. 그래서 이 케이스에서 **남의 소유 파일(`Jenkinsfile` ·
  // `.env.example` · `docker-compose.yml`)의 형태를 박아 둔 단정을 전부 의미 검사로 바꿨다**:
  //   (2) 금지 사유 문구 → 어휘 하나가 아니라 "금지" 계열 표현 집합
  //   (3) `string(credentialsId: …)` 리터럴 → "ADMIN 이름이 들어간 바인딩 헬퍼가 전부 string 인가"
  //   (4) `stage('Deploy contract')` 이름 · `if [ -z … ]` 형태 → "바인딩을 감싼 스테이지가
  //       DEPLOY_CONTRACT 로 게이트되는가 · 빈 키를 멈추는 관용구가 하나라도 있는가"
  //   (5) 필터 리터럴 → **패턴을 꺼내 실제 줄에 돌려 본다**(`ADMIN_PRIVATE_KEY=0x…` 는 떨어지고
  //       `JWT_SECRET=…` 은 살아남는가). 필터가 어떤 모양이든 상관없고, 강화 전/후 양쪽에서 초록.
  //   (6) `cat "$ENV_FILE"` 전면 금지 → 같은 줄에서 자격 있는 필터로 파이프되면 허용
  // 규칙은 하나다 — **인프라 소유 파일에 대한 단정은 "이 파일이 이렇게 생겼다"가 아니라
  // "이 파일이 무엇을 보장한다"여야 한다.**
  // -------------------------------------------------------------------------
  it("[C-01·A-5 해소] admin 콜드 키는 Deploy contract 스테이지에만 주입되고 .env 계열 어디에도 자리가 없다", () => {
    const env = readFileSync("../.env.example", "utf8");
    const jenkins = readFileSync("../Jenkinsfile", "utf8");
    const compose = readFileSync("../docker-compose.yml", "utf8");
    const cfg = readFileSync("hardhat.config.ts", "utf8");
    const lines = env.split(/\r?\n/);

    // (1) 대입 슬롯이 없다. 주석 줄은 제외하고 본다 — 주석 안에는 로컬 배포 안내로
    //     `export ADMIN_PRIVATE_KEY=0x...` 가 **일부러** 들어 있다.
    const decls = lines.filter((l) => l.trim() !== "" && !/^\s*#/.test(l));
    assert.deepEqual(
      decls.filter((l) => /^\s*(export\s+)?ADMIN_PRIVATE_KEY\s*=/.test(l)),
      [],
      "`.env.example` 은 B204_ENV 템플릿이자 로컬 `.env` 의 원본이다. 여기 대입 줄을 만들면 " +
        "누군가 콜드 키 값을 채우고 그 파일이 서버 ~/app/.env 와 팀원 노트북으로 그대로 간다. " +
        "이름 계약은 아래 (2) 의 주석이 지킨다 — 슬롯을 되살리지 마라.",
    );

    // (2) 대신 이름과 금지 사유가 주석으로 남아 있어야 한다. 주석이 사라지면 다음 사람이
    //     "환경변수 정본에서 빠졌네" 하고 (1) 을 되돌린다.
    //     문구 자체는 인프라 소유다 — 특정 어휘 하나를 박지 않고 "금지" 계열 표현이 있는지만 본다.
    const comments = lines.filter((l) => /^\s*#/.test(l)).join("\n");
    assert.match(comments, /ADMIN_PRIVATE_KEY/, "이름이 환경변수 정본에서 완전히 사라지면 안 된다");
    assert.match(
      comments,
      /(넣지|두지|저장하지|쓰지|적지)\s*(않|마)|금지|절대\s*안/,
      "왜 슬롯이 없는지(= 이 파일과 서버 .env 에 넣으면 안 된다)가 적혀 있어야 한다",
    );
    assert.match(comments, /Secret\s*text/i, "대신 어디에 넣는지(Jenkins Secret text)가 적혀 있어야 한다");

    // (3) Jenkins 는 Secret **text** 로 바인딩한다. Secret file 은 로그 마스킹이 없다.
    //     인자 순서·따옴표·변수명은 인프라 소유다 — "ADMIN 이름이 들어간 바인딩이 존재하고,
    //     그 바인딩 헬퍼가 전부 string 인가"만 본다.
    const bindings = jenkins.match(/\b[A-Za-z]\w*\s*\(\s*credentialsId:[^)]*\)/g) ?? [];
    const adminBindings = bindings.filter((b) => /credentialsId:\s*['"]ADMIN_PRIVATE_KEY['"]/.test(b));
    assert.ok(
      adminBindings.length >= 1,
      "ADMIN_PRIVATE_KEY 를 Jenkins Credentials 로 바인딩하는 곳이 없다 — 배포 서명자가 어디서 오는지 알 수 없다",
    );
    assert.deepEqual(
      adminBindings.filter((b) => !/^string\s*\(/.test(b)),
      [],
      "ADMIN_PRIVATE_KEY 는 Secret text(string) 로만 바인딩해야 한다. file()·다른 헬퍼로 바꾸면 로그 마스킹이 사라진다(Jenkinsfile 머리말)",
    );

    // (4) 그 바인딩을 감싼 스테이지는 DEPLOY_CONTRACT 게이트 뒤여야 하고, 키가 비면 멈춰야 한다.
    //     스테이지 **이름**을 박지 않는다 — 바인딩 위치에서 역으로 스테이지를 찾는다.
    const stageStarts = [...jenkins.matchAll(/\bstage\s*\(/g)].map((m) => m.index as number);
    const stageOf = (idx: number) => {
      const start = Math.max(...stageStarts.filter((i) => i < idx));
      const end = stageStarts.find((i) => i > idx) ?? jenkins.length;
      return jenkins.slice(start, end);
    };
    //     **바인딩이 여럿이면 전부 본다.** search() 로 첫 자리만 보던 동안은 Deploy contract 만
    //     검사됐고, 뒤에 붙은 Rotate minter 스테이지는 게이트·빈 키 검사가 빠져도 초록이었다
    //     (MR !112 자동 리뷰).
    const bindIdxs = [...jenkins.matchAll(/\bstring\s*\(\s*credentialsId:\s*['"]ADMIN_PRIVATE_KEY['"]/g)]
      .map((m) => m.index as number);
    assert.ok(
      bindIdxs.length >= 1 && bindIdxs.every((i) => stageStarts.some((s) => s < i)),
      "ADMIN_PRIVATE_KEY 바인딩이 어떤 스테이지에도 들어 있지 않다",
    );
    const adminStages = bindIdxs.map(stageOf);
    for (const stage of adminStages) {
      assert.match(
        stage,
        /params\.(DEPLOY_CONTRACT|ROTATE_MINTER)/,
        "콜드 키를 바인딩하는 스테이지는 수동 파라미터로 게이트돼야 한다 — 평상시 배포에서 키가 셸로 들어오면 안 된다",
      );
      assert.match(
        stage,
        /export\s+(-\w+\s+)?"?ADMIN_PRIVATE_KEY/,
        "hardhat configVariable 이 읽으려면 export 되어야 한다",
      );
    }
    //     "키가 비면 멈춘다"를 표현하는 셸 관용구는 여럿이다. 하나라도 있으면 된다.
    const emptyKeyGuards = [
      /-z\s+"?\$\{?ADMIN_PRIVATE_KEY\}?"?[\s\S]{0,240}?exit\s+1/, // if [ -z "$K" ]; then … exit 1
      /-n\s+"?\$\{?ADMIN_PRIVATE_KEY\}?"?[^\n]*\|\|[^\n]*exit\s+\d/, // [ -n "$K" ] || exit 1
      /\$\{ADMIN_PRIVATE_KEY:\?/, // : "${K:?…}"
      /\$\{ADMIN_PRIVATE_KEY\?/,
    ];
    for (const stage of adminStages) {
      assert.ok(
        emptyKeyGuards.some((g) => g.test(stage)),
        "키가 비면 멈춰야 한다. 조용히 진행되면 서명자를 모르는 채 tx 가 나간다",
      );
    }

    //     배포와 로테이션을 같이 켜면 새 컨트랙트를 배포하고 그 컨트랙트의 minter 를 바꾸게 되는데
    //     운영 .env 는 옛 주소라 교체가 반영되지 않는다. 조합 자체를 끊는 자리가 있어야 한다
    //     (MR !112 자동 리뷰).
    assert.match(
      jenkins,
      /params\.DEPLOY_CONTRACT\s*&&\s*params\.ROTATE_MINTER/,
      "DEPLOY_CONTRACT 와 ROTATE_MINTER 를 같이 켠 빌드를 끊는 자리가 없다",
    );

    //     로테이션 스테이지는 새 MINTER 가 OPERATOR 와 같은지도 끊어야 한다. 컨트랙트는
    //     그 충돌을 모르고(YoYo.rotateMinter 는 zero·admin·현 minter 만 거른다) 백엔드
    //     ChainRoleGuard 가 minter == operator 를 기동 실패로 규정하므로, 이 검사가 빠지면
    //     교체 성공 뒤 백엔드가 아예 뜨지 않는다(MR !112 자동 리뷰).
    //     문자열이 어딘가 있는지가 아니라 **비교하고 끊는 모양**을 본다. 스테이지 슬라이스는
    //     마지막 스테이지에서 파일 끝까지 늘어나고 필터도 느슨해, 존재만 보면 다른 스테이지
    //     텍스트로 초록이 된다(MR !112 자동 리뷰).
    assert.match(
      jenkins,
      /NEW_MINTER_ADDRESS[\s\S]{0,200}OPERATOR_ADDRESS[\s\S]{0,200}exit 1/,
      "새 MINTER 주소를 OPERATOR_ADDRESS 와 비교해 끊는 자리가 없다 — operator 주소로 교체하면 백엔드가 기동하지 못한다",
    );
    //     로테이션은 배포 브랜치에서만 켤 수 있어야 한다. 스테이지만 브랜치로 막으면 Verify 는
    //     파라미터만 보고 사라져 아무것도 안 한 빌드가 초록이 된다(MR !112 자동 리뷰).
    assert.match(
      jenkins,
      /ROTATE_MINTER[\s\S]{0,120}BRANCH_NAME[\s\S]{0,400}error\(/,
      "ROTATE_MINTER 를 배포 브랜치 밖에서 켠 빌드를 끊는 자리가 없다",
    );

    assert.match(
      jenkins,
      /eth_getBalance[\s\S]{0,600}exit 1/,
      "새 MINTER 주소의 가스 잔액을 확인해 끊는 자리가 없다 — 빈 주소로 교체하면 MINT 가 전부 FAILED 된다",
    );
    //     위 단정은 "응답 없음" exit 1 에서도 맞아, 0 초과만 보던 옛 게이트로 되돌아가도 초록이다.
    //     최소치(0.01 KAIA = 0x2386f26fc10000 peb)와 비교해 끊는 모양을 따로 본다. bash 산술은
    //     64비트 부호 있는 정수라 9.2 KAIA 를 넘으면 음수가 되므로 잔액에 쓰면 안 된다(MR !212 자동 리뷰).
    assert.match(
      jenkins,
      /MIN_BALANCE_HEX=0x2386f26fc10000\b[\s\S]{0,1200}if\s+!\s+hex_ge\s+"\$BALANCE_HEX"\s+"\$MIN_BALANCE_HEX"[\s\S]{0,400}?exit 1/i,
      "새 MINTER 잔액을 최소치(0.01 KAIA)와 비교해 끊는 자리가 없다 — 1 peb 만 있어도 교체가 통과한다",
    );
    assert.doesNotMatch(
      jenkins,
      /\$\(\(\s*\$?BALANCE_HEX/,
      "잔액을 bash 산술로 변환하면 9.2 KAIA 를 넘는 값이 음수가 된다 — 16진 문자열로 비교한다",
    );
    //     주소 형식은 Rotate minter 의 input 승인 **전에** 끊어야 한다. 셸 검사만 있으면 틀린 값으로
    //     승인 화면까지 간다(MR !112 자동 리뷰). when 조건이 아니라 error() 로 끊는 자리를 본다.
    assert.match(
      jenkins,
      /stage\('Preflight'\)[\s\S]*?if\s*\(\s*params\.ROTATE_MINTER\s*&&\s*!\s*\(\s*\(\s*params\.NEW_MINTER_ADDRESS[^)]*\)\s*==~\s*\/0x\[0-9a-fA-F\]\{40\}\/\s*\)\s*\)\s*\{\s*error\(/,
      "Preflight 가 NEW_MINTER_ADDRESS 형식을 승인 전에 검사해 끊지 않는다",
    );
    //     교체 대상(kairos.json YoYo)과 활성 백엔드가 쓰는 YoYo 가 다르면 서비스가 쓰지 않는
    //     컨트랙트의 minter 를 바꾸게 된다. OPERATOR 단정처럼 **비교하고 끊는 모양**을 본다
    //     (S15P21B204-165).
    assert.match(
      jenkins,
      /jq -r '\.contracts\.YoYo\.address[^\n]*kairos\.json[\s\S]{0,1200}docker exec "\$ACTIVE_BACKEND" printenv CONTRACT_YOYO_ADDRESS[\s\S]{0,400}"\$REPO_YOYO"[^\n]*!=[^\n]*"\$LIVE_YOYO"[\s\S]{0,400}?exit 1/,
      "로테이션 전에 kairos.json YoYo 주소와 활성 백엔드의 CONTRACT_YOYO_ADDRESS 를 비교해 끊는 자리가 없다",
    );

    // (5) 서버 .env 를 조립하는 **모든** 경로가 ADMIN_PRIVATE_KEY 를 걸러내야 한다.
    //     검사하는 불변식은 "필터가 이 문자열이다"가 아니라
    //     **"ENV_FILE 을 .env 로 흘리는 경로마다, ADMIN_PRIVATE_KEY 대입 줄을 실제로
    //     떨어뜨리고 다른 키는 살려 보내는 grep -v 가 하나씩 있다"** 이다.
    //     그래서 패턴을 꺼내 **가짜 .env 줄에 직접 돌려 본다** — 필터의 모양은 인프라 소유고,
    //     인프라가 필터를 강화해도(MR !24) 약화하지 않는 한 이 단정은 초록이어야 한다.
    const envWrites = jenkins.match(/(?:>>?|\btee\b(?:\s+-a)?)\s+"?[^"\s]*\/\.env"?/g) ?? [];
    const posixToJs = (ere: string) =>
      new RegExp(
        ere
          .replace(/\[\[:space:\]\]/g, "\\s")
          .replace(/\[\[:blank:\]\]/g, "[ \\t]")
          .replace(/\[\[:alnum:\]\]/g, "[A-Za-z0-9]")
          .replace(/\[\[:alpha:\]\]/g, "[A-Za-z]")
          .replace(/\[\[:digit:\]\]/g, "[0-9]")
          .replace(/\[\[:upper:\]\]/g, "[A-Z]")
          .replace(/\[\[:lower:\]\]/g, "[a-z]"),
      );
    //     한 줄에서 ADMIN_PRIVATE_KEY 가 들어간 따옴표 토큰 = grep 패턴.
    const patternOf = (l: string) =>
      (l.match(/'[^']*'|"(?:[^"\\]|\\.)*"/g) ?? [])
        .map((q) => q.slice(1, -1))
        .find((p) => p.includes("ADMIN_PRIVATE_KEY"));
    //     ENV_FILE 을 grep -v 로 거르는 줄(-v · -vE · -v -E 전부).
    const envFilterLines = jenkins
      .split(/\r?\n/)
      .filter((l) => /\bgrep\b/.test(l) && /\s-[A-Za-z]*v/.test(l) && /\$\{?ENV_FILE\}?/.test(l));
    //     그중 **실제로 효력이 있는** 것만 센다.
    const effectiveFilters = envFilterLines.filter((l) => {
      const p = patternOf(l);
      if (p === undefined) return false;
      let re: RegExp;
      try {
        re = posixToJs(p);
      } catch {
        return false;
      }
      const drops = ["ADMIN_PRIVATE_KEY=0xdeadbeef", "ADMIN_PRIVATE_KEY=", "  ADMIN_PRIVATE_KEY=0x1"].some((s) => re.test(s));
      const keeps = ["JWT_SECRET=abc", "MYSQL_ROOT_PASSWORD=abc", "DB_URL=jdbc:mysql://db/x"].every((s) => !re.test(s));
      return drops && keeps;
    });
    assert.ok(envWrites.length >= 1, "서버 .env 를 만드는 경로를 하나도 못 찾았다 — 이 검사가 무의미해졌다");
    assert.equal(
      effectiveFilters.length,
      envWrites.length,
      `.env 조립 경로 ${envWrites.length}곳 · ADMIN_PRIVATE_KEY 를 실제로 떨어뜨리는 필터 ${effectiveFilters.length}곳. ` +
        `(ENV_FILE 을 거르는 grep -v 줄 자체는 ${envFilterLines.length}곳) — 한 곳이라도 비면 그게 유출 경로다`,
    );

    // (6) 필터를 우회하는 통째 복사·source 가 없어야 한다.
    //     단, `cat "$ENV_FILE" | grep -v …` 처럼 같은 줄에서 자격 있는 필터로 파이프되는 것은
    //     안전하다 — 형태가 아니라 "필터를 거치지 않고 새는가"를 본다.
    const wholesaleReads = jenkins
      .split(/\r?\n/)
      .filter((l) => /(^|[\s;&|(])(cat|cp|tee|install)\s+"?\$\{?ENV_FILE\}?"?/.test(l))
      .filter((l) => !effectiveFilters.includes(l));
    assert.deepEqual(
      wholesaleReads,
      [],
      "B204_ENV 를 필터 없이 통째로 복사·출력하면 필터를 우회한다(Secret file 은 마스킹도 없다)",
    );
    assert.ok(
      !/(^|[\s;&|])(\.|source)\s+"?\$\{?ENV_FILE\}?"?/m.test(jenkins),
      "통째로 source 하면 ADMIN_PRIVATE_KEY 가 배포 셸 환경으로 들어온다",
    );

    // (7) 마지막 방벽 — compose 의 backend.environment 는 명시 허용목록이다.
    //     여기에 이름이 생기면 서버 .env 에 값이 남았을 때 런타임 프로세스로 그대로 들어간다.
    assert.ok(
      !/ADMIN_PRIVATE_KEY/.test(compose),
      "docker-compose.yml 에 ADMIN_PRIVATE_KEY 가 등장하면 콜드 키가 서버 런타임에 도달한다",
    );

    // (7-1) Redis 는 영속이어야 한다. 무영속이면 재기동에서 chain:owner 가 사라지고, 두 색이
    //       상시 떠 있는 블루/그린에서는 쉬는 옛 색이 setIfAbsent 를 먼저 이길 수 있다 — 옛
    //       이미지가 체인 tx 를 맡아 새 빌드의 job 이 조용히 PENDING 으로 남는다(리뷰 !93).
    //       로그인 세션(auth:refresh, TTL 14일)도 같은 이유로 살아남아야 한다.
    assert.match(
      compose,
      /--appendonly[",\s]+yes/,
      "redis 가 무영속이면 chain:owner·로그인 세션이 재기동에서 사라진다",
    );

    // (7-2) 그래도 임대(chain:owner, 60초)는 재부팅에서 만료된다 — JVM 기동이 60~90초라
    //       그 사이에 빈 키가 생기고, 쉬는 옛 색이 먼저 가져갈 수 있다. 그것을 막는 것이
    //       TTL 없는 chain:active 이고, 배포·롤백 둘 다 전환할 때 써야 한다(리뷰 !93 🔴).
    for (const f of ["../exec/deploy/blue-green.sh", "../exec/deploy/rollback.sh"]) {
      assert.match(
        readFileSync(f, "utf8"),
        /redis-cli SET chain:active "\$1"(?![^\n]*EX)/,
        f + " 가 chain:active 를 TTL 없이 쓰지 않으면 재부팅 뒤 쉬는 색이 체인 작업을 맡는다",
      );
    }

    // (7-3) 전환 확인 실패는 인계 **전**이다 — chain:active·owner 는 아직 이전 색이다. 그 롤백이
    //       인계를 돌면 정상적으로 일하던 색의 체인 작업이 드레인(30초) 동안 멈춘다(S15P21B204-188).
    const bg = readFileSync("../exec/deploy/blue-green.sh", "utf8");
    const rb = readFileSync("../exec/deploy/rollback.sh", "utf8");
    assert.match(
      bg,
      /SKIP_HANDOVER=1 "\$\(dirname "\$0"\)\/rollback\.sh"/,
      "blue-green.sh 의 인계 전 롤백이 SKIP_HANDOVER=1 없이 부르면 멀쩡한 색의 체인 작업이 30초 멈춘다",
    );
    const skipAt = rb.indexOf('if [ "${SKIP_HANDOVER:-0}" = 1 ]');
    const handoverAt = rb.search(/^chain_handover "\$target"$/m);
    assert.ok(
      skipAt >= 0 && handoverAt >= 0 && skipAt < handoverAt,
      "rollback.sh 의 SKIP_HANDOVER 분기가 chain_handover \"$target\" 호출보다 앞에 없으면 건너뛰지 못한다",
    );

    // (8) 그러면서도 배포 서명자로는 실제로 주입된다(상세 검사는 바로 위 케이스).
    assert.match(
      cfg.slice(cfg.indexOf("kairos: {")),
      /accounts:\s*\[configVariable\("ADMIN_PRIVATE_KEY"\)\]/,
      "이름을 .env.example 에서 뺐다고 hardhat 쪽 참조까지 사라지면 배포 자체가 안 된다",
    );
  });

  it("Splitter 생성자는 0주소를 거부한다 (정상 동작 확인)", async () => {
    const { ethers, admin, operator, yoyo } = await fixture();
    const f = await ethers.getContractFactory("RevenueSplitter");
    const i = [f.interface];
    assert.equal(await revertName(f.deploy(ZERO, operator.address, await yoyo.getAddress()), i), "ZeroAddress");
    assert.equal(await revertName(f.deploy(admin.address, ZERO, await yoyo.getAddress()), i), "ZeroAddress");
    assert.equal(await revertName(f.deploy(admin.address, operator.address, ZERO), i), "ZeroAddress");
  });
});

// ===========================================================================
describe("Audit.1-C · createShow 선행 조건 (실제로 실행되는 코드)", () => {
  it("OPERATOR 아닌 호출자는 NotOperator", async () => {
    const { splitter, outsider, host, teamB, teamC } = await fixture();
    const teams = [host.address, teamB.address, teamC.address];
    assert.equal(
      await revertName((splitter.connect(outsider) as any).createShow(...showArgs(teams)), [splitter.interface]),
      "NotOperator",
    );
  });

  it("규칙 형태 검증 — 0주소·중복·팀수 0/9·길이 불일치·bp 합·host 범위·rulesHash 0", async () => {
    const { splitter, operator, host, teamB, teamC } = await fixture();
    const s = splitter.connect(operator) as any;
    const i = [splitter.interface];
    const teams = [host.address, teamB.address, teamC.address];
    const nine = Array.from({ length: 9 }, (_, k) => "0x" + (k + 1).toString(16).padStart(40, "0"));

    assert.equal(await revertName(s.createShow(...showArgs(teams, { teams: [host.address, ZERO, teamC.address] })), i), "ZeroAddress");
    assert.equal(await revertName(s.createShow(...showArgs(teams, { teams: [host.address, teamB.address, host.address] })), i), "DuplicateTeamWallet");
    assert.equal(await revertName(s.createShow(...showArgs(teams, { teams: [], shares: [] })), i), "InvalidTeamCount");
    assert.equal(await revertName(s.createShow(...showArgs(teams, { teams: nine, shares: [1112, 1111, 1111, 1111, 1111, 1111, 1111, 1111, 1111] })), i), "InvalidTeamCount");
    assert.equal(await revertName(s.createShow(...showArgs(teams, { shares: [5000, 5000] })), i), "ArrayLengthMismatch");
    assert.equal(await revertName(s.createShow(...showArgs(teams, { host: 3 })), i), "HostIndexOutOfRange");
    assert.equal(await revertName(s.createShow(...showArgs(teams, { rulesHash: ZERO32 })), i), "ZeroRulesHash");
    assert.equal(await revertName(s.createShow(...showArgs(teams, { fixedBp: 5000, selBp: 4999 })), i), "InvalidBpSum");
    assert.equal(await revertName(s.createShow(...showArgs(teams, { shares: [3334, 3333, 3334] })), i), "InvalidBpSum");
  });

  it("팀 지갑이 OPERATOR·admin·토큰·자기 자신이면 ReservedAddress (정상 동작 확인)", async () => {
    const { splitter, yoyo, operator, admin, host, teamC } = await fixture();
    const s = splitter.connect(operator) as any;
    const i = [splitter.interface];
    const teams = [host.address, teamC.address];
    for (const bad of [operator.address, admin.address, await yoyo.getAddress(), await splitter.getAddress()]) {
      assert.equal(
        await revertName(s.createShow(...showArgs(teams, { teams: [host.address, bad, teamC.address] })), i),
        "ReservedAddress",
        bad + " 가 팀 지갑으로 통과했다",
      );
    }
  });

  it("[H-01] 팀 지갑이 YoYo MINTER 키면 ReservedAddress 여야 한다 (contract-interface §3.2: 팀 주소 != OPERATOR/MINTER)", async () => {
    const { splitter, operator, minter, host, teamC } = await fixture();
    const s = splitter.connect(operator) as any;
    const teams = [host.address, minter.address, teamC.address];
    assert.equal(
      await revertName(s.createShow(...showArgs(teams)), [splitter.interface]),
      "ReservedAddress",
      "_validateTeamWallets 가 Splitter 자신의 role 만 본다. YoYo.minter() 는 보지 않는다 " +
        "→ 서버 MINTER 키가 팀 리더 지갑으로 등록될 수 있다(스스로 발행 + 분배 수령).",
    );
  });

  // -------------------------------------------------------------------------
  // 라운드 2 갱신 (2026-09-07) — 이 케이스의 기대값이 뒤집혔다.
  //
  // 라운드 1은 "depositAmount == 0 을 거부하라"고 적었다. **리더 판정은 0 허용 유지**다 —
  // 요구사항 v6 §9 컷 라인 ①("보증금 → 안내만 P1")이 이 인자를 스위치로 쓴다. 컨트랙트에
  // 50,000 을 하드코딩하면 재배포 없이는 컷 라인을 적용할 수 없다. 0 유입 차단 책임은 서버다.
  //
  // 그래서 검증 대상이 "코드가 막는가"에서 **"그 판정의 근거가 정본 문서에 실제로 적혀 있는가"**
  // 로 바뀐다. 문서에 없으면 다음 사람이 같은 지적을 다시 하고, 서버 담당자는 자기 책임인 줄 모른다.
  // -------------------------------------------------------------------------
  it("[M-01·판정] depositAmount == 0 은 통과한다 — 그리고 그 근거·서버 책임·감지 경로가 문서 §4.1 에 있다", async () => {
    const { splitter, operator, host, teamB, teamC } = await fixture();
    const s = splitter.connect(operator) as any;
    const teams = [host.address, teamB.address, teamC.address];

    // ① 코드: 0 은 형태 검증을 통과하고 **0 그대로 저장된다**(= 의도된 동작).
    //    다른 이유로 막히면 그것도 회귀다.
    //    라운드 4 정정 — 이전에는 `NotImplemented` 를 기대했다. 그것은 스켈레톤의
    //    아티팩트였고, 지금은 "0 이 저장된다"까지 직접 본다.
    await assertShowCreated(
      s.createShow(...showArgs(teams, { deposit: 0n })),
      splitter,
      { teams, host: 0, deposit: 0n, rulesHash: RULES },
      "depositAmount = 0 이 거부됐거나 0 으로 저장되지 않았다 — 컷 라인 ① 스위치가 사라졌다",
    );

    // ①-b 컷 라인 ① 스위치의 **목적**까지 확인한다 — 보증금 0 공연은 보증금 없이 판매가 열려야 한다.
    //     `startSale` 의 `depositAmount != 0 &&` 가드가 이 스위치의 나머지 절반이다.
    //     여기까지 봐야 "0 을 통과시킨다"가 실제로 쓸모 있는 동작임이 증명된다.
    for (const t of [host, teamB, teamC]) {
      await (splitter.connect(t) as any).agreeToRules(SHOW, RULES);
    }
    assert.equal(await splitter.depositOf(SHOW), 0n, "아무도 보증금을 내지 않았다");
    assert.equal(
      await revertName(s.startSale(SHOW), [splitter.interface]),
      "<no revert>",
      "보증금 0 공연인데 startSale 이 DepositRequired 로 막혔다 — 컷 라인 ① 이 반쪽만 남았다",
    );
    assert.equal(Number(await splitter.stageOf(SHOW)), 2, "LOCKED_RULES(2) 여야 한다");

    // ② 문서: 그 결정의 근거가 §4.1 에 명시돼 있어야 한다.
    const doc = readFileSync("../docs/design/13_컨트랙트_인터페이스_v1.md", "utf8");
    const from = doc.indexOf("#### `depositAmount == 0`");
    assert.notEqual(from, -1, "문서 §4.1 에 `depositAmount == 0` 절이 없다");
    const sec = doc.slice(from, doc.indexOf("####", from + 10));
    for (const [needle, why] of [
      ["컷 라인", "요구사항 v6 §9 컷 라인 ① 이 근거라는 사실"],
      ["§9", "근거 조항 번호"],
      ["서버", "0 유입을 막는 책임이 서버에 있다는 사실"],
      ["startSale", "startSale 이 보증금 검사를 건너뛰는 것도 의도라는 사실"],
    ] as const) {
      assert.ok(sec.includes(needle), `문서 §4.1 의 depositAmount 절에 ${why}(${needle})가 없다`);
    }

    // ③ 감지 경로: "보증금 0 공연"을 서버·검증 페이지가 볼 수 있어야 조용히 묻히지 않는다.
    const abi = JSON.parse(readFileSync("artifacts/contracts/RevenueSplitter.sol/RevenueSplitter.json", "utf8")).abi;
    const created = abi.find((e: any) => e.type === "event" && e.name === "ShowCreated");
    assert.ok(
      created.inputs.some((x: any) => x.name === "depositAmount" && !x.indexed),
      "ShowCreated 가 depositAmount 를 싣지 않으면 보증금 0 공연을 이벤트로 감지할 수 없다",
    );
    assert.ok(
      abi.some((e: any) => e.type === "function" && e.name === "depositAmountOf"),
      "depositAmountOf view 가 없으면 대사 배치가 보증금 0 공연을 확인할 수 없다",
    );
  });

  // -------------------------------------------------------------------------
  // 라운드 2 신규 — H-01 수정(YoYo role 조회)의 경계를 고정한다.
  // -------------------------------------------------------------------------
  it("[H-01·해소] 팀 지갑이 **YoYo 전용 admin**(Splitter admin 과 다른 주소)이어도 ReservedAddress", async () => {
    const { ethers, admin, operator, minter, host, teamC, outsider } = await fixture();
    // YoYo 의 admin 만 outsider — Splitter 의 admin 은 그대로 admin 이다.
    // 이렇게 해야 Splitter 자신의 hasRole 이 아니라 **YoYo 쪽 조회**가 걸렸는지 분리해서 볼 수 있다.
    const yoyo2 = await ethers.deployContract("YoYo", [outsider.address, minter.address]);
    const s2 = await ethers.deployContract("RevenueSplitter", [
      admin.address, operator.address, await yoyo2.getAddress(),
    ]);
    assert.equal(
      await revertName(
        (s2.connect(operator) as any).createShow(...showArgs([], { teams: [host.address, outsider.address, teamC.address] })),
        [s2.interface],
      ),
      "ReservedAddress",
      "YoYo admin 지갑이 팀 리더로 등록되면 그 팀은 정산 도중 pause() 로 release 를 멈출 수 있다",
    );
  });

  // 라운드 3 — 제목만 갱신했다(검사하는 성질은 그대로). 구현이 `try/catch` 에서
  // 저수준 `staticcall` + `returndata.length == 32` 로 바뀌었다(A-8 · L-06 권고 ①).
  it("[H-01·범위] YoYo role 조회는 저수준 staticcall 이다 — 역할 개념이 없는 토큰에서는 이 검사가 통째로 꺼진다", async () => {
    const { ethers, admin, operator, minter, host, teamC, yoyo } = await fixture();
    // `minter()` 가 없는 컨트랙트를 토큰 자리에 꽂는다(= 임의 ERC-20 교체 상황의 대역).
    const roleless = await ethers.deployContract("RevenueSplitter", [
      admin.address, operator.address, await yoyo.getAddress(),
    ]);
    const s2 = await ethers.deployContract("RevenueSplitter", [
      admin.address, operator.address, await roleless.getAddress(),
    ]);
    // 라운드 4 정정 — 이전에는 `NotImplemented`(= 검사를 지났다의 대리값)를 기대했다.
    // 지금은 결과를 본다: **YoYo MINTER 지갑이 실제로 팀으로 등록돼 남는다.**
    // 이것이 "검사가 통째로 꺼진다"의 진짜 관측이다(대리값보다 강하다).
    const teams = [host.address, minter.address, teamC.address];
    await assertShowCreated(
      (s2.connect(operator) as any).createShow(...showArgs([], { teams })),
      s2,
      { teams },
      "역할 개념이 없는 토큰에서는 검사를 건너뛰는 것이 의도다(project-truth §10 대사). " +
        "**대신 그 토큰을 쓰는 배포에서는 H-01 방어가 존재하지 않는다는 뜻이다** — 배포 시점에 " +
        "token() == YoYo 를 어서션하는 것(문서 §6 ②)이 이 검사의 실질적 전제조건이다",
    );
    assert.ok(
      [...(await s2.teamWalletsOf(SHOW))].includes(minter.address),
      "MINTER 지갑이 팀 배열에 남지 않았다 — 검사가 부분적으로 살아 있다는 뜻이므로 " +
        "이 케이스의 전제(대체 토큰에서는 H-01 방어가 0)를 다시 확인해야 한다",
    );
    // 같은 조건에서 **정상 YoYo** 를 쓰는 배포는 여전히 막는다(H-01 본체가 살아 있는지).
    const real = await ethers.deployContract("RevenueSplitter", [
      admin.address, operator.address, await yoyo.getAddress(),
    ]);
    assert.equal(
      await revertName(
        (real.connect(operator) as any).createShow(...showArgs([], { teams })),
        [real.interface],
      ),
      "ReservedAddress",
      "토큰이 진짜 YoYo 인 배포에서는 MINTER 팀 등록이 여전히 막혀야 한다(H-01 본체)",
    );
  });

  // 라운드 3 — 제목 갱신. 라운드 2 기준으로는 "이름 없는 revert 로 죽는다"가 관측 동작이었고,
  // A-8(저수준 staticcall) 이후 `NotImplemented` 로 정상 진행한다. 단정은 그대로 두고 제목만 뒤집는다.
  it("[L-06·해소] token 이 컨트랙트가 아니어도(EOA) createShow 가 이름 없는 revert 로 죽지 않는다", async () => {
    const { ethers, admin, operator, host, teamB, teamC, outsider } = await fixture();
    // EOA 를 토큰 자리에 꽂으면 staticcall 은 성공(빈 returndata)하고 **반환값 디코딩에서** 실패한다.
    // Solidity 의 try/catch 는 이 실패를 잡지 못한다 → catch 로 흡수되지 않고 그대로 튄다.
    const s2 = await ethers.deployContract("RevenueSplitter", [admin.address, operator.address, outsider.address]);
    const teams = [host.address, teamB.address, teamC.address];
    // 라운드 4 정정 — `NotImplemented` 대리값을 결과 관측으로 바꿨다.
    await assertShowCreated(
      (s2.connect(operator) as any).createShow(...showArgs(teams)),
      s2,
      { teams, host: 0, deposit: 50_000n },
      "L-06 이 되살아났다. 토큰 자리가 EOA 면 staticcall 은 성공(빈 returndata)하고 " +
        "abi.decode 가 이름 없는 revert(reverted without a reason string)로 튄다 — " +
        "서버 매핑 표(§4.6)에 없어 COMMON_INTERNAL_ERROR 로만 잡힌다. " +
        "저수준 staticcall + returndata.length == 32 확인이 그것을 접어 준다",
    );
  });
});

// ===========================================================================
describe("Audit.1-D · Stage.NONE = 0 일관성", () => {
  it("상태를 바꾸는 모든 함수가 미등록 showId 에서 ShowNotFound 로 막힌다", async () => {
    const { splitter, operator, host } = await fixture();
    const op = splitter.connect(operator) as any;
    const team = splitter.connect(host) as any;
    const i = [splitter.interface];
    const ref = id("order-1");

    // 지연 생성(thunk)이어야 한다 — 배열 리터럴에서 즉시 호출하면 await 전에 거부되어
    // node:test 러너가 unhandled rejection 으로 중단한다.
    const cases: Array<[string, () => Promise<unknown>]> = [
      ["updateRules", () => op.updateRules(NONEXISTENT, RULES, 5000, 5000, [10000])],
      ["agreeToRules", () => team.agreeToRules(NONEXISTENT, RULES)],
      ["deposit", () => team.deposit(NONEXISTENT)],
      ["startSale", () => op.startSale(NONEXISTENT)],
      ["purchase", () => team.purchase(NONEXISTENT, ref, 0, 1000n, 1)],
      ["refund", () => op.refund(NONEXISTENT, ref, 1000n)],
      ["aggregate", () => op.aggregate(NONEXISTENT, 0n)],
      ["lock", () => op.lock(NONEXISTENT)],
      ["release", () => op.release(NONEXISTENT)],
      ["returnDeposit", () => op.returnDeposit(NONEXISTENT)],
      ["halt", () => op.halt(NONEXISTENT)],
      ["forfeitDeposit", () => op.forfeitDeposit(NONEXISTENT)],
    ];
    for (const [name, p] of cases) {
      assert.equal(await revertName(p, i), "ShowNotFound", name + " 이 미등록 공연을 통과시켰다");
    }
  });

  it("view 는 미등록 공연에서 0/빈배열을 돌려준다 — 서버는 stageOf() != 0 을 먼저 봐야 한다", async () => {
    const { splitter } = await fixture();
    assert.equal(Number(await splitter.stageOf(NONEXISTENT)), 0);
    assert.equal(await splitter.escrowOf(NONEXISTENT), 0n);
    assert.equal(await splitter.depositOf(NONEXISTENT), 0n);
    assert.equal(await splitter.depositAmountOf(NONEXISTENT), 0n);
    assert.equal(await splitter.totalChoicesOf(NONEXISTENT), 0n);
    assert.equal(Number(await splitter.teamCountOf(NONEXISTENT)), 0);
    assert.equal(Number(await splitter.agreedCountOf(NONEXISTENT)), 0);
    assert.equal((await splitter.teamWalletsOf(NONEXISTENT)).length, 0);
    assert.equal((await splitter.choiceCountsOf(NONEXISTENT)).length, 0);
    assert.equal((await splitter.payoutsOf(NONEXISTENT)).length, 0);
    // hostTeamIndexOf 는 0 을 돌려주는데 0 은 실재하는 teamIndex 다 — 미등록과 구분되지 않는다.
    assert.equal(Number(await splitter.hostTeamIndexOf(NONEXISTENT)), 0);
  });

  it("[L-01] choiceCountOf · payoutOf 는 미등록 공연에서 ShowNotFound 를 내야 한다", async () => {
    const { splitter } = await fixture();
    const i = [splitter.interface];
    assert.equal(
      await revertName(splitter.choiceCountOf(NONEXISTENT, 0), i),
      "ShowNotFound",
      "TeamIndexOutOfRange 가 나오면 서버가 COMMON_NOT_FOUND 여야 할 상황을 " +
        "COMMON_VALIDATION_FAILED 로 번역한다 (문서 §4.6)",
    );
    assert.equal(await revertName(splitter.payoutOf(NONEXISTENT, 0), i), "ShowNotFound");
  });
});

// ===========================================================================
describe("Audit.1-E · Splitter 역할 봉인", () => {
  it("grantRole · revokeRole · renounceRole 전부 revert", async () => {
    const { splitter, admin, outsider } = await fixture();
    const role = await splitter.OPERATOR_ROLE();
    const i = [splitter.interface];
    assert.equal(await revertName(splitter.connect(admin).grantRole(role, outsider.address), i), "RoleManagementDisabled");
    assert.equal(await revertName(splitter.connect(admin).revokeRole(role, outsider.address), i), "RoleManagementDisabled");
    assert.equal(await revertName(splitter.connect(admin).renounceRole(role, admin.address), i), "RoleManagementDisabled");
  });

  it("rotateOperator 는 0주소·admin·현재 operator 를 거부하고 이전 권한을 회수한다", async () => {
    const { splitter, admin, operator, outsider } = await fixture();
    const i = [splitter.interface];
    assert.equal(await revertName(splitter.connect(admin).rotateOperator(ZERO), i), "ZeroAddress");
    assert.equal(await revertName(splitter.connect(admin).rotateOperator(admin.address), i), "RoleConflict");
    assert.equal(await revertName(splitter.connect(admin).rotateOperator(operator.address), i), "RoleConflict");
    assert.equal(
      await revertName(splitter.connect(operator).rotateOperator(outsider.address), i),
      "AccessControlUnauthorizedAccount",
    );

    await splitter.connect(admin).rotateOperator(outsider.address);
    assert.equal(await splitter.operator(), outsider.address);
    assert.equal(await revertName((splitter.connect(operator) as any).halt(SHOW), i), "NotOperator");
  });
});

// ===========================================================================
describe("Audit.1-F · 서버·프론트 계약 (ABI · selector · topic0) 회귀 고정", () => {
  it("이벤트 인자에 tuple/struct 가 하나도 없고 indexed 는 3개 이하다 (web3j 4.9.8)", () => {
    for (const n of ["YoYo", "RevenueSplitter"]) {
      const abi = JSON.parse(readFileSync("artifacts/contracts/" + n + ".sol/" + n + ".json", "utf8")).abi;
      for (const e of abi.filter((x: any) => x.type === "event")) {
        for (const inp of e.inputs) {
          assert.ok(!/tuple/.test(inp.type), e.name + "." + inp.name + " 이 tuple 이다");
          assert.equal(inp.components, undefined, e.name + "." + inp.name + " 에 components 가 있다");
        }
        assert.ok(e.inputs.filter((x: any) => x.indexed).length <= 3, e.name + " indexed > 3");
      }
    }
  });

  it("문서 §8 의 selector · topic0 이 keccak 및 현재 ABI 와 일치한다", () => {
    const sel = (s: string) => id(s).slice(0, 10);
    const docSelectors: Record<string, string> = {
      "approve(address,uint256)": "0x095ea7b3",
      "mint(address,uint256,bytes32)": "0x1e458bee",
      "purchase(uint256,bytes32,uint8,uint256,uint16)": "0xa01208ea",
      "agreeToRules(uint256,bytes32)": "0x344c0bbf",
      "deposit(uint256)": "0xb6b55f25",
      "createShow(uint256,address[],uint8,bytes32,uint16,uint16,uint16[],uint256)": "0x46d53063",
      "updateRules(uint256,bytes32,uint16,uint16,uint16[])": "0x26a857bc",
      "startSale(uint256)": "0x0e3ab61d",
      "refund(uint256,bytes32,uint256)": "0x2681f24b",
      "aggregate(uint256,uint256)": "0xc5f2be49",
      "lock(uint256)": "0xdd467064",
      "release(uint256)": "0x37bdc99b",
      "returnDeposit(uint256)": "0x18b683fb",
      "halt(uint256)": "0xfb1fad50",
    };
    const docTopics: Record<string, string> = {
      "Minted(address,uint256,bytes32)": "0xc263b302aec62d29105026245f19e16f8e0137066ccd4a8bd941f716bd4096bb",
      "Purchased(uint256,bytes32,address,uint8,uint256,uint16)": "0x0db34556431612c300f1ae6dc52219df91b7ca34a6d4faf1e62923b205845c11",
      "DepositPaid(uint256,address,uint256)": "0x0ab25ea2b2e5b35643aad63eb6201c5da140c2c8152b126272a85b2b9efd6122",
      "RulesAgreed(uint256,address,bytes32,uint8,uint8)": "0x13979df381272271d058dcf0cb231b2060a2c956df2394593711877c74755ac0",
      "Refunded(uint256,bytes32,address,uint8,uint256,uint16)": "0x634418dc6f3eb34c8cc0e5d5a3ba2f541a1004d32055311b77262a926bd2a590",
      "Aggregated(uint256,uint256,uint256,uint256,uint256)": "0x7b03f3f044bc4d02c24d6811806bc42464b2d97d7f22a86940e9849be315839c",
      "PayoutAssigned(uint256,uint8,address,uint256,uint256,uint256,uint256)": "0x8a1d437e8ccc3b7ca80ede25cb28eb147a4453dd2319c86ee3b881344efbb77c",
      "Released(uint256,uint8,address,uint256)": "0xcf4a788b4a1c888def2252950408eafce1fe89d1c99c61361ce3158c886f8946",
      "Halted(uint256)": "0x14a94dbc2f7e9418dbda76b366e946fd5e17923e5cc43d07703095c162035b97",
      "ShowCreated(uint256,address[],uint8,bytes32,uint16,uint16,uint256)": "0x6e7ab43131599d8df827aef7b145fbeaa8bf8cbb7172cfcfa740b896968bc721",
    };

    for (const [sig, want] of Object.entries(docSelectors)) assert.equal(sel(sig), want, "selector " + sig);
    for (const [sig, want] of Object.entries(docTopics)) assert.equal(id(sig), want, "topic0 " + sig);

    const abis = ["YoYo", "RevenueSplitter"].map(
      (n) => JSON.parse(readFileSync("artifacts/contracts/" + n + ".sol/" + n + ".json", "utf8")).abi,
    );
    const sigOf = (e: any) => e.name + "(" + e.inputs.map((x: any) => x.type).join(",") + ")";
    const fnSigs = new Set(abis.flatMap((a) => a.filter((e: any) => e.type === "function").map(sigOf)));
    const evSigs = new Set(abis.flatMap((a) => a.filter((e: any) => e.type === "event").map(sigOf)));
    for (const sig of Object.keys(docSelectors)) assert.ok(fnSigs.has(sig), "ABI 에 함수 " + sig + " 없음");
    for (const sig of Object.keys(docTopics)) assert.ok(evSigs.has(sig), "ABI 에 이벤트 " + sig + " 없음");
  });

  it("문서 §4.5 custom error 목록과 ABI 가 양방향으로 일치한다", () => {
    // -----------------------------------------------------------------------
    // 라운드 2 갱신 (2026-09-07) — **문서를 파싱한다.**
    //
    // 라운드 1은 error 이름 34개를 이 배열에 하드코딩했다. H-03 이 error 하나를 늘리자
    // (`QuantityLimitExceeded`) 문서 §4.5 는 갱신됐는데 테스트만 빨강이 됐다 — 실제 불일치가
    // 아니라 **테스트가 문서를 안 읽어서** 난 실패다. error 가 늘 때마다 같은 실패가 반복된다.
    // 이제 §4.5 코드블록에서 `error X(` 선언을 직접 뽑아 ABI 와 양방향 대조한다.
    // -----------------------------------------------------------------------
    const doc = readFileSync("../docs/design/13_컨트랙트_인터페이스_v1.md", "utf8");
    const from = doc.indexOf("### 4.5");
    const section = doc.slice(from, doc.indexOf("### 4.6", from));
    assert.ok(from !== -1 && section.length > 0, "문서 §4.5 절을 찾지 못했다");

    const documented = new Set<string>(
      [...section.matchAll(/\berror\s+([A-Za-z0-9_]+)\s*\(/g)].map((m) => m[1]),
    );
    assert.ok(documented.size >= 30, "§4.5 파싱 결과가 " + documented.size + "개뿐이다 — 파서가 깨졌다");

    const abi = JSON.parse(
      readFileSync("artifacts/contracts/RevenueSplitter.sol/RevenueSplitter.json", "utf8"),
    ).abi;
    const own: string[] = abi
      .filter((e: any) => e.type === "error")
      .map((e: any) => e.name as string)
      .filter((n: string) => !/^(AccessControl|ERC20|SafeERC20|Address|ReentrancyGuard|Enforced|Expected|FailedCall|InsufficientBalance)/.test(n));
    for (const n of documented) assert.ok(own.includes(n), "ABI 에 error " + n + " 없음");
    for (const n of own) assert.ok(documented.has(n), "문서 §4.5 에 error " + n + " 없음");
  });

  it("[I-01] YoYo 의 ZeroGrantRef 가 문서 §4.6 revert→ErrorCode 매핑 표에 있어야 한다", () => {
    const doc = readFileSync("../docs/design/13_컨트랙트_인터페이스_v1.md", "utf8");
    const table = doc.slice(doc.indexOf("### 4.6"), doc.indexOf("### 4.7"));
    assert.ok(
      table.includes("ZeroGrantRef"),
      "이강륜의 서버가 이 revert 를 어떤 ErrorCode 로 번역할지 정본에 없다",
    );
  });

  // ---------------------------------------------------------------------
  // 라운드 2 신규 — 수정으로 바뀐 ABI 를 회귀로 고정한다.
  // 이 세 가지가 이강륜(web3j 래퍼)·양해미(대사 쿼리)가 실제로 보는 값이다.
  // ---------------------------------------------------------------------
  it("[H-02·해소] purchaseOf 5번째 반환이 uint256 refundedAmount 다 (bool refunded 가 아니다)", () => {
    const abi = JSON.parse(
      readFileSync("artifacts/contracts/RevenueSplitter.sol/RevenueSplitter.json", "utf8"),
    ).abi;
    const fn = abi.find((e: any) => e.type === "function" && e.name === "purchaseOf");
    assert.deepEqual(
      fn.outputs.map((o: any) => o.type + " " + o.name),
      ["address buyer", "uint8 teamIndex", "uint256 amount", "uint16 quantity", "uint256 refundedAmount"],
      "누적 환불액이 없으면 부분 환불 이력 주문의 잔액을 halt 후 환불할 수 없다(H-02)",
    );
  });

  it("[H-03·해소] MAX_QUANTITY_PER_ORDER 상수와 QuantityLimitExceeded error 가 존재한다", async () => {
    const { splitter } = await fixture();
    assert.equal(Number(await splitter.MAX_QUANTITY_PER_ORDER()), 4, "요구사항 v6 §7.3 '1인 4매'");
    const abi = JSON.parse(
      readFileSync("artifacts/contracts/RevenueSplitter.sol/RevenueSplitter.json", "utf8"),
    ).abi;
    const err = abi.find((e: any) => e.type === "error" && e.name === "QuantityLimitExceeded");
    assert.deepEqual(err?.inputs.map((i: any) => i.type), ["uint16", "uint16"]);
  });

  it("[H-03·잔존] 남는 구멍의 복구 절차(§4.8)가 있고 'aggregate 이후엔 되돌릴 수 없다'가 명시돼 있다", () => {
    const doc = readFileSync("../docs/design/13_컨트랙트_인터페이스_v1.md", "utf8");
    const from = doc.indexOf("### 4.8");
    assert.notEqual(from, -1, "문서에 §4.8 복구 절차가 없다");
    const sec = doc.slice(from, doc.indexOf("## 5.", from));
    for (const [needle, why] of [
      ["Purchased", "왜곡된 주문을 찾는 근거(온체인 이벤트)"],
      ["ticket_order", "서버 좌조인 대상"],
      ["refund", "되돌리는 수단"],
      ["aggregate", "되돌릴 수 있는 시한"],
      ["LOCKED_RULES", "refund 가 허용되는 stage"],
      ["p.buyer", "환불 수신자가 고정이라 탈취 경로가 아니라는 근거"],
    ] as const) {
      assert.ok(sec.includes(needle), `§4.8 에 ${why}(${needle})가 없다 — 절차가 실행 가능하지 않다`);
    }
  });

  it("[L-05·신규] 복수형 view(choiceCountsOf·payoutsOf·totalChoicesOf·escrowOf)는 미등록 공연에서 revert 하지 않는다 — 문서 §4.2 가 이를 경고해야 한다", async () => {
    const { splitter } = await fixture();
    // 현재 동작 확인: 단수형은 ShowNotFound(L-01 수정), 복수형은 조용히 빈 값이다.
    //
    // 라운드 3 수정 — `assert.deepEqual(…, [])` 는 **테스트 버그였다.** ethers v6 는 배열을
    // `Result`(Array 서브클래스)로 돌려주고 node:assert/strict 의 deep-equal 은 프로토타입까지
    // 비교하므로 `Result(0) [] !== []` 로 죽는다. 단정이 여기서 죽어 **뒤에 있는 문서 §4.2 검사에
    // 도달조차 못 했다.** 단언을 약화시키지 않고 도달 가능하게만 고친다 —
    // "길이 0 + 원소 없음"은 빈 배열과 같은 성질이고, 값이 하나라도 생기면 그대로 빨강이 된다.
    // 같은 파일 Audit.1-D(:482~483)가 이미 `.length === 0` 으로 비교해 초록이다.
    const empties: Array<[string, bigint[]]> = [
      ["choiceCountsOf", Array.from(await splitter.choiceCountsOf(NONEXISTENT)) as bigint[]],
      ["payoutsOf", Array.from(await splitter.payoutsOf(NONEXISTENT)) as bigint[]],
    ];
    for (const [name, arr] of empties) {
      assert.equal(arr.length, 0, name + " 가 미등록 공연에서 빈 배열이 아니다");
      assert.deepEqual(arr, [], name + " 의 원소가 비어 있지 않다"); // Array.from 후이므로 프로토타입이 일치한다
    }
    assert.equal(await splitter.totalChoicesOf(NONEXISTENT), 0n);
    assert.equal(await splitter.escrowOf(NONEXISTENT), 0n);

    const doc = readFileSync("../docs/design/13_컨트랙트_인터페이스_v1.md", "utf8");
    const table = doc.slice(doc.indexOf("### 4.2"), doc.indexOf("### 4.3"));
    const row = (name: string) => table.split("\n").find((l) => l.includes("`" + name + "(")) ?? "";
    for (const v of ["choiceCountsOf", "payoutsOf", "totalChoicesOf", "escrowOf"]) {
      assert.ok(
        /미등록|stageOf/.test(row(v)),
        "§4.2 의 " + v + " 행에 '미등록 공연에서도 0/빈 배열을 돌려준다 — stageOf != 0 을 먼저 확인' " +
          "경고가 없다. 단수형(choiceCountOf·payoutOf)만 ShowNotFound 로 바뀌었기 때문에(L-01), " +
          "복수형을 쓰는 대사 코드는 DB↔온체인 불일치를 여전히 0 으로 읽고 조용히 넘어간다. " +
          "hostTeamIndexOf 행에는 이미 같은 경고가 있다.",
      );
    }
  });

  it("[M-05·잔존] 문서 §2.6 '대가' 문단에 'paused + admin 키 상실 = 전 자금 영구 동결'이 적혀 있다", () => {
    const doc = readFileSync("../docs/design/13_컨트랙트_인터페이스_v1.md", "utf8");
    const sec = doc.slice(doc.indexOf("### 2.6"), doc.indexOf("## 3."));
    assert.ok(
      /동결|에스크로/.test(sec),
      "§2.6 은 '잃으면 pause·rotateMinter 를 못 쓴다'까지만 적었다. 실제로 더 나쁜 결과가 있다 — " +
        "**이미 paused 인 상태에서 admin 키를 잃으면 unpause 를 부를 사람이 없어 에스크로·보증금·전 지갑 " +
        "잔액이 영구 동결된다.** 3키 구성(C-01 방안 A)에서 admin 은 콜드 키라 이 위험이 라운드 1보다 커졌다.",
    );
  });
});

// ===========================================================================
// Audit.1-G · [A-8] 저수준 staticcall 경계 — 감사 라운드 3 (2026-09-07)
//
// 라운드 2 후속 A-8 에서 `_yoyoMinter`·`_isYoYoAdmin` 이 `try/catch` → 저수준
// `staticcall` + `returndata.length == 32` 로 바뀌었다. 문서 13 §4.1 의 3행 경계 표가
// "토큰 자리에 무엇이 있으면 무슨 일이 나나"를 주장한다. **그 주장을 실제 EVM 으로 검증한다.**
//
// 여기서는 mock 토큰을 .sol 로 추가하지 않고 **런타임 바이트코드를 직접 배포**한다 —
// `contracts/` 는 contract-engineer 소유이고 감사자는 test/ 만 건드린다.
// ===========================================================================

/** 런타임 바이트코드 `runtime`(0x 없는 hex)를 그대로 배포하는 최소 init code. */
function deployerFor(runtime: string): string {
  const len = runtime.length / 2;
  if (len > 0xff) throw new Error("이 헬퍼는 255바이트 이하 런타임만 만든다");
  const h = (n: number) => n.toString(16).padStart(2, "0");
  // PUSH1 len · PUSH1 0x0c · PUSH1 0x00 · CODECOPY · PUSH1 len · PUSH1 0x00 · RETURN  (= 12바이트)
  return "0x60" + h(len) + "600c" + "600039" + "60" + h(len) + "6000" + "f3" + runtime;
}

/** 토큰 자리에 꽂을 대역들. 이름 = 문서 §4.1 표의 어느 행에 해당하는가. */
const FAKE_TOKENS: Record<string, string> = {
  // ① 모든 호출에 STOP — success = true, returndata 0바이트 (fallback 만 있는 컨트랙트)
  emptyReturn: "00",
  // ② 모든 호출에 revert — success = false (알 수 없는 selector 에 revert 하는 컨트랙트)
  alwaysRevert: "60006000fd",
  // ③ 모든 호출에 64바이트 반환 — success = true, length != 32
  return64: "60406000f3",
  // ④ 모든 호출에 **32바이트 0xff…ff** 반환 — success = true, length == 32, word != 0
  //    프록시 ERC-20 이 알 수 없는 selector 를 구현체 fallback 으로 넘겨 더러운 워드를
  //    되돌려주는 경우의 대역이다.
  return32Dirty: "7f" + "ff".repeat(32) + "600052" + "6020" + "6000" + "f3",
  // ⑤ 모든 호출이 무한 루프 — 가스를 태운다 (JUMPDEST · PUSH1 0 · JUMP)
  gasBomb: "5b600056",
};

describe("Audit.1-G · [A-8] 저수준 staticcall 경계 (감사 라운드 3)", () => {
  async function splitterWithFakeToken(kind: keyof typeof FAKE_TOKENS) {
    const f = await fixture();
    const code = deployerFor(FAKE_TOKENS[kind]);
    const tx = await f.admin.sendTransaction({ data: code });
    const rc = await tx.wait();
    const tokenAddr = rc!.contractAddress!;
    const s2 = await f.ethers.deployContract("RevenueSplitter", [
      f.admin.address,
      f.operator.address,
      tokenAddr,
    ]);
    return { ...f, tokenAddr, s2 };
  }

  /** 대역 토큰만 배포하고 주소를 돌려준다(Splitter 는 붙이지 않는다). */
  async function fakeTokenAt(f: any, kind: keyof typeof FAKE_TOKENS): Promise<string> {
    const rc = await (await f.admin.sendTransaction({ data: deployerFor(FAKE_TOKENS[kind]) })).wait();
    return rc!.contractAddress!;
  }

  /**
   * 대역 토큰으로 `RevenueSplitter` 배포를 **시도**한다. 죽어도 던지지 않는다.
   *
   * ─ 라운드 5 신설 ─ `splitterWithFakeToken` 은 "적대적 토큰으로도 Splitter 는 배포된다"를
   * 암묵 전제로 갖고 있었다. M-09(생성자가 `YoYo.minter()` 를 조회한다)가 그 전제를 깨자
   * 단정이 아니라 **셋업**이 빨개졌다. 배포 가능 여부 자체가 관측 대상인 케이스는
   * 이 헬퍼를 쓴다 — 실패를 예외가 아니라 **값**으로 받는다.
   */
  async function tryDeploySplitter(f: any, tokenAddr: string, gasLimit?: bigint) {
    try {
      const c = await f.ethers.deployContract(
        "RevenueSplitter",
        [f.admin.address, f.operator.address, tokenAddr],
        gasLimit === undefined ? {} : { gasLimit },
      );
      await c.waitForDeployment();
      const addr = await c.getAddress();
      const gasUsed = (await c.deploymentTransaction()!.wait())!.gasUsed;
      const code = await f.ethers.provider.getCode(addr);
      return { ok: code !== "0x", contract: c as any, addr, gasUsed, reason: "", error: null as unknown };
    } catch (e: any) {
      return {
        ok: false,
        contract: null as any,
        addr: "",
        gasUsed: 0n,
        reason: String(e?.shortMessage ?? e?.message ?? e),
        error: e as unknown,
      };
    }
  }

  it("[A-8·확인] revert · 빈 반환 · 32바이트 초과 반환은 전부 '검사 건너뜀'으로 접힌다", async () => {
    // 라운드 4 정정 — `NotImplemented` 대리값을 결과 관측으로 바꿨다.
    // "정상 진행한다"의 관측은 이제 **공연이 실제로 만들어져 남는 것**이다.
    for (const kind of ["emptyReturn", "alwaysRevert", "return64"] as const) {
      const { s2, operator, host, teamB, teamC } = await splitterWithFakeToken(kind);
      const teams = [host.address, teamB.address, teamC.address];
      await assertShowCreated(
        (s2.connect(operator) as any).createShow(...showArgs(teams)),
        s2,
        { teams, host: 0, deposit: 50_000n },
        kind + " 토큰에서 createShow 가 정상 진행하지 못했다 — " +
          "문서 §4.1 표는 이 세 경우 모두 '검사만 건너뛰고 정상 진행'이라고 주장한다",
      );
    }
  });

  it("[A-8·확인] 실패 시 기본값 address(0) 이 H-01 을 무력화하지 않는다 (팀 지갑 0 은 ZeroAddress 로 먼저 죽는다)", async () => {
    // sentinel(0)과 팀 지갑이 같아지는 경우가 존재하지 않는다는 근거 ①의 기계 확인.
    const { s2, operator, host, teamC } = await splitterWithFakeToken("emptyReturn");
    assert.equal(
      await revertName(
        (s2.connect(operator) as any).createShow(...showArgs([], { teams: [host.address, ZERO, teamC.address] })),
        [s2.interface],
      ),
      "ZeroAddress",
      "yoyoMinter 기본값이 0 인 상태에서 팀 지갑 0 이 `w == yoyoMinter` 비교에 도달하면 안 된다",
    );
  });

  it("[L-07·신규] fallback 이 0 이 아닌 32바이트를 돌려주는 토큰(프록시 ERC-20)은 createShow 를 통째로 막는다", async () => {
    // `_isYoYoAdmin` 은 `ok && word != 0` 이다. 더러운 32바이트 워드는 **모든 주소를**
    // YoYo admin 으로 판정하므로 첫 팀 지갑에서 ReservedAddress 로 죽는다.
    //
    // ① 관측된 현재 동작을 고정한다. 자금 손실은 없다 — 실패 방향은 안전하다(막는 쪽).
    const { s2, operator, host, teamB, teamC } = await splitterWithFakeToken("return32Dirty");
    assert.equal(
      await revertName(
        (s2.connect(operator) as any).createShow(...showArgs([host.address, teamB.address, teamC.address])),
        [s2.interface],
      ),
      "ReservedAddress",
      "이 성질이 바뀌면 A-8 의 접기 규칙이 바뀐 것이다",
    );

    // ② 문서가 이 경우를 덮는가. A-8 은 "프록시·EOA 토큰까지 포함해 createShow 가 막히지 않는다"를
    //    성질로 주장했고 문서 §4.1 표 3행도 "fallback 을 가진 컨트랙트 → 정상 진행한다"라고 적었다.
    //    fallback 이 **정확히 32바이트**를 돌려주면 length 검사를 통과해 그 주장이 성립하지 않는다.
    //    코드는 그대로 두어도 된다(방향이 안전하므로). **정본 문서가 틀린 것이 문제다.**
    const doc = readFileSync("../docs/design/13_컨트랙트_인터페이스_v1.md", "utf8");
    const sec = doc.slice(doc.indexOf("### 4.1"), doc.indexOf("### 4.2"));
    assert.ok(
      /32바이트를 (그대로 )?돌려주|정확히 32바이트|32바이트를 반환/.test(sec),
      "문서 §4.1 의 경계 표가 'fallback 이 정확히 32바이트를 돌려주는 토큰'을 덮지 않는다. " +
        "관측된 동작은 ReservedAddress 이고 그 배포에서는 **모든 공연 생성이 영구히 막힌다.** " +
        "표 3행을 'returndata 가 32바이트가 아니면 건너뛴다'로 좁히고, " +
        "'fallback 이 0 이 아닌 32바이트를 돌려주면 모든 주소가 admin 으로 판정돼 createShow 가 " +
        "ReservedAddress 로 막힌다(자금 손실 없음 · 방향은 안전)' 행을 추가하라. " +
        "마지막 불릿 'P2 에서 다른 토큰을 꽂아도 createShow 는 막히지 않는다'도 같은 이유로 참이 아니다.",
    );
  });

  it("[I-06·판정] 접기는 가스 소진을 덮지 못한다 — 가스를 태우는 토큰은 createShow 이전, 배포 시점에 걸러진다", async () => {
    // ─ 라운드 5 재표현 (2026-09-07 · Phase B 덩어리 2) ──────────────────────
    // 옛 제목: "토큰이 가스를 태우면 **createShow** 가 OOG 로 죽는다".
    // M-09(생성자가 `operator != YoYo.minter()` 를 본다) 이후 그 문장은 **거짓**이다 —
    // 가스 폭탄 토큰으로는 `createShow` 는커녕 **Splitter 배포 자체가 서지 않는다.**
    // 옛 케이스는 `splitterWithFakeToken("gasBomb")` 이 성공한다는 것을 fixture 의
    // **암묵 전제**로 갖고 있었고, 옳은 변경이 그 전제를 깨자 단정이 아니라 셋업이
    // 빨개졌다. 여기서는 배포 가능 여부 자체를 **관측 대상**으로 끌어올린다.
    //
    // 두 층으로 나눠 쓴다 — 태그가 곧 "이 빨강을 어떻게 읽어야 하는가"다.
    //   [·성질] 가스를 태우는 토큰이 물린 구성에서는 **공연이 만들어지지 않는다.**
    //           접기(`_tryReadWord` 의 `(false, 0)`)가 가스 소진을 덮지 않기 때문이다.
    //           이 단정이 빨개지는 길은 저수준 호출에 **가스 상한**이 생기는 것뿐이고,
    //           상한은 H-01 검사를 "토큰이 무거우면 조용히 통과"(fail-open)로 바꾼다.
    //           정상 YoYo 가 프록시 뒤로 들어가 `minter()` 가 무거워지는 날 그 상한이
    //           **실 토큰에서** 검사를 꺼 버린다. 그러므로 빨강은 언제나 나쁜 소식이다.
    //   [·관측] 그 실패가 **어느 단계**에서 나는가. M-09 이후 현재는 **배포**다 —
    //           자금이 들어갈 컨트랙트 인스턴스가 아예 생기지 않는다.
    //           빨개지면 방어가 배포 → createShow 로 밀린 것이다(= M-09 회귀).
    const f = await fixture();
    const teams = [f.host.address, f.teamB.address, f.teamC.address];

    // ① 대조군 — 가스를 태우지 **않는** 대역 토큰으로는 Splitter 가 서고 createShow 까지 통과한다.
    //    이게 없으면 ②의 실패가 "가스 때문"인지 "대역 토큰이면 늘 죽는다"인지 구별할 수 없다.
    const control = await tryDeploySplitter(f, await fakeTokenAt(f, "emptyReturn"));
    assert.ok(
      control.ok,
      "대조군이 무너졌다 — 가스를 태우지 않는 대역 토큰으로도 Splitter 가 배포되지 않는다. " +
        "이 케이스의 ②·③ 관측이 통째로 무의미해지므로 먼저 이것부터 고쳐야 한다. 사유: " +
        control.reason,
    );
    await assertShowCreated(
      (control.contract.connect(f.operator) as any).createShow(...showArgs(teams)),
      control.contract,
      { teams, host: 0, deposit: 50_000n },
      "대조군에서 createShow 가 막혔다 — 아래 gasBomb 관측의 기준선이 서지 않는다",
    );

    // ② 가스 폭탄 토큰으로 배포를 시도한다. **정상 배포 가스의 2배**를 명시한 시도 하나다.
    //    넉넉히 줘도 죽어야 "가스가 모자라서 우연히 실패한 것"과 구별된다 —
    //    staticcall 이 남은 가스의 63/64 를 넘기므로 되돌아오는 1/64 로는 생성자 나머지를 못 끝낸다.
    //
    //    ─ 2026-09-08 예산 축소 (CI exit 137) ─────────────────────────────────────
    //    무한 루프 바이트코드는 **실행한 가스에 비례해** EDR 트레이스 메모리를 먹는다. 종전에는
    //    ① 자동 추정(블록 상한 2^24 = 16.7M gas 실행) ② 정상×5 (13.8M) ③ revertName 용 재배포(또 16.7M)
    //    세 번 태워 node 가 4.7 GB 를 썼고, Jenkins 4g 컨테이너에서 backend·frontend 와 병렬로 돌면
    //    cgroup OOM(`Killed`, exit 137)으로 죽었다(feat/be/settlement #183764). 감사 라운드 5 A안.
    //    지금은 정상×2 한 번만 실행하고 그 에러 객체를 ④·revertName 에 재사용한다. 2배는 이 케이스가
    //    원래 정한 하한이다("2배 미만은 근거가 안 된다"). 자동 추정 경로의 방어는 deploy.ts
    //    어서션 ② token() == YoYo 가 맡는다(문서 13 §6).
    const bomb = await fakeTokenAt(f, "gasBomb");
    const normalGas = control.gasUsed; // 정상 배포 실측(대조군)

    // 체인마다 트랜잭션 가스 상한이 있어(EDR 은 2^24) 그 위로는 tx 자체가 거부된다.
    // 상한에 걸리면 절반씩 줄이되, **정상 배포의 2배 미만으로는 내려가지 않는다** —
    // 그 아래에서 죽는 것은 "여유가 없어서"일 수 있어 근거가 되지 않는다.
    let budget = normalGas * 2n;
    let generous = await tryDeploySplitter(f, bomb, budget);
    while (!generous.ok && /gas cap|exceeds|too high|limit is/i.test(generous.reason) && budget / 2n >= normalGas * 2n) {
      budget /= 2n;
      generous = await tryDeploySplitter(f, bomb, budget);
    }
    assert.ok(
      budget >= normalGas * 2n,
      `이 체인의 tx 가스 상한이 정상 배포 가스(${normalGas})의 2배도 허용하지 않는다 — ` +
        "여유를 준 시도를 만들 수 없어 아래 단정의 근거가 서지 않는다",
    );

    // ③ [·성질] 어느 단계에서 죽든, 가스를 태우는 토큰으로는 **공연이 만들어지지 않는다.**
    //    지금은 ④가 보이듯 인스턴스가 아예 없어 공허하게 참이다. 이 분기는 M-09 가 사라져
    //    배포가 되살아나는 날에도 성질 쪽을 계속 지키기 위해 남긴다.
    for (const r of [generous]) {
      if (!r.ok) continue;
      const name = await revertName(
        (r.contract.connect(f.operator) as any).createShow(...showArgs(teams)),
        [r.contract.interface],
      );
      assert.notEqual(
        name,
        "<no revert>",
        "가스를 태우는 토큰이 물렸는데 createShow 가 통과했다. 저수준 호출에 **가스 상한**이 " +
          "생겼다는 뜻이고, 그 상한은 H-01(팀 지갑 != YoYo MINTER/admin) 검사를 " +
          "'토큰이 무거우면 조용히 건너뜀'으로 바꾼다. 정상 YoYo 가 프록시 뒤로 들어가는 날 " +
          "실 토큰에서 검사가 꺼진다 — 팀 리더 지갑이 발행 권한을 겸해도 아무도 막지 않는다. " +
          "상한 대신 배포 어서션 token() == YoYo(문서 13 §6 ②)로 방어하라.",
      );
    }

    // ④ [·관측] 현재 동작 고정 — 실패 지점은 **배포**다. M-09 staticcall 의 부수 효과이고,
    //    자금이 한 푼도 들어가기 전이라 실패 방향이 더 안전해졌다.
    assert.equal(
      generous.ok,
      false,
      `정상 배포 가스(${normalGas})의 ${budget / normalGas}배(${budget})를 줘도 배포가 서면 안 된다 — ` +
        "여유가 있는데도 죽는다는 것이 63/64 규칙(접기가 가스를 되돌려주지 않는다)의 증거다. " +
        "여기가 초록에서 빨강으로 바뀌었다면 생성자의 `operator != YoYo.minter()` 조회(M-09)가 " +
        "사라졌거나 저수준 호출에 가스 상한이 생긴 것이다. 방어가 배포 → createShow 로 밀리면 " +
        "적대적 토큰이 물린 Splitter 주소가 실재하게 되고, 서버가 그 주소로 approve 를 받는 순간 " +
        "관객 코인이 회수 불가 컨트랙트로 들어간다.",
    );
    assert.equal(
      await f.ethers.provider.getCode(control.addr) !== "0x" && generous.addr === "",
      true,
      "대조군에는 코드가 있고 가스 폭탄 배포에는 주소조차 없다 — 이 비대칭이 관측의 실체다",
    );
    // 죽는 방식도 확인한다. 이름 있는 custom error 로 죽었다면 그것은 가스 소진이 아니라
    // 검증 revert 이고, 이 케이스가 주장하는 성질(접기의 한계)과 다른 이야기다.
    const bombRevert = await revertName(
      Promise.reject(generous.error), // ② 의 실패를 재사용한다 — 가스 폭탄을 다시 실행하지 않는다
      [control.contract.interface],
    );
    assert.ok(
      !/^(RoleConflict|ZeroAddress|ReservedAddress)$/.test(bombRevert),
      `가스 폭탄 배포가 이름 있는 검증 error(${bombRevert})로 죽었다 — ` +
        "이 케이스가 고정하려는 것은 '가스 소진은 접히지 않는다'이지 입력 검증이 아니다. " +
        "관측 대상이 바뀌었으니 케이스를 다시 표현하라.",
    );

    // ⑤ 문서가 이 한계와 **현재의 실패 단계**를 함께 적어 두었는가. 코드는 고치지 않는다 —
    //    `_yoyo` 는 immutable 이고 적대적 토큰은 MVP 위협 모델 밖이다.
    //    배포 어서션 token() == YoYo(§6 ②)가 유일하고 충분한 방어다. **다만 명시돼야 한다.**
    const doc = readFileSync("../docs/design/13_컨트랙트_인터페이스_v1.md", "utf8");
    const sec = doc.slice(doc.indexOf("### 4.1"), doc.indexOf("### 4.2"));
    assert.ok(
      /가스 소진|가스를 태우|63\/64|out of gas/i.test(sec),
      "문서 §4.1 은 '저수준 호출은 revert 와 짧은 반환을 똑같이 실패로 접는다'까지만 적었다. " +
        "**가스 소진은 접지 못한다** — '토큰이 가스를 태우거나 거대한 returndata 를 돌려주면 " +
        "OOG 로 죽는다. 적대적 토큰은 위협 모델 밖이며 배포 어서션 token() == YoYo 가 방어다' 한 줄을 추가하라.",
    );
    assert.ok(
      /배포 자체가 (먼저|우선)|배포가 (먼저|우선)|배포 시점에/.test(sec),
      "문서 §4.1 이 M-09 이후의 **실패 단계**를 적지 않았다. 생성자가 `YoYo.minter()` 를 조회하므로 " +
        "가스를 태우는 토큰에서는 `createShow` 가 아니라 **`RevenueSplitter` 배포 자체가 먼저** OOG 로 " +
        "죽는다. 표 6행에 그 문장을 넣어라 — 운영자가 배포 실패를 보고 무엇을 의심할지가 달라진다.",
    );
  });
});
