/**
 * Audit.3 — contract-auditor 라운드 4 재현 테스트 (2026-09-07)
 *
 * 대상: **Phase B 덩어리 1(상태 저장)** — `createShow` · `updateRules` · `agreeToRules` ·
 *       `deposit` · `startSale` 다섯 함수의 실구현.
 *
 * Audit.1(스켈레톤 단계에서도 판정 가능한 것) · Audit.2(공연이 실재해야 판정 가능한 것)와
 * 섞지 않고 새 파일로 둔다. 두 파일의 초록/빨강 카운트를 흔들지 않기 위해서다.
 *
 * 이 파일의 규칙 (라운드 4에서 세운 것) —
 *   · 판정이 아직 안 난 발견은 **요구(빨강)가 아니라 관측 고정(pinning)** 으로 쓴다.
 *     `[…·관측]` 이 붙은 케이스가 그것이다. 어느 쪽으로 결론이 나도 초록이거나,
 *     동작이 바뀌는 순간 정확히 그 지점에서 빨개진다.
 *   · 사양이 이미 요구하는데 코드에 없는 것만 **빨강**으로 둔다. `[…·요구]` 표시.
 *
 * 실행: cd blockchain && npx hardhat test test/Audit.3.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { network } from "hardhat";
import { id, Interface } from "ethers";

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
      e?.error?.data ?? e?.info?.error?.data ?? e?.revert?.data;
    if (typeof data === "string" && data.length >= 10) {
      for (const iface of ifaces) {
        try {
          const parsed = iface.parseError(data);
          if (parsed) return parsed.name;
        } catch { /* 다음 iface */ }
      }
      return "unknown(" + data.slice(0, 10) + ")";
    }
    if (e?.revert?.name) return e.revert.name;
    const m = String(e?.shortMessage ?? e?.message ?? e);
    const hit = m.match(/custom error [`'"]?([A-Za-z0-9_]+)/);
    return hit ? hit[1] : m;
  }
}

const RULES = id("rules-json-v1");
const SHOW = 1n;
const DEPOSIT = 50_000n;

async function base() {
  const { ethers } = await network.connect();
  const [admin, operator, minter, host, teamB, teamC, outsider] = await ethers.getSigners();
  const yoyo = await ethers.deployContract("YoYo", [admin.address, minter.address]);
  const splitter = await ethers.deployContract("RevenueSplitter", [
    admin.address, operator.address, await yoyo.getAddress(),
  ]);
  return { ethers, yoyo, splitter, admin, operator, minter, host, teamB, teamC, outsider };
}

const PRICE = 20_000n; // 티켓 1매 20,000 YoYo (요구사항 v6 §7.3 예시)

/** 3팀 공연을 LOCKED_RULES(판매 중)까지 세우고, 관객 지갑에 코인을 심는다. */
async function onSaleShow(findingId: string) {
  const f = await base();
  const S = await f.splitter.getAddress();
  const signers = await f.ethers.getSigners();
  const [alice, bob] = signers.slice(7);
  for (const w of [f.host, alice, bob]) {
    await f.yoyo.connect(f.minter).mint(w.address, 1_000_000n, id("seed3:" + w.address));
  }
  const teams = [f.host.address, f.teamB.address, f.teamC.address];
  const name = await revertName(
    (f.splitter.connect(f.operator) as any).createShow(
      SHOW, teams, 0, RULES, 5000, 5000, [3334, 3333, 3333], DEPOSIT,
    ),
    [f.splitter.interface],
  );
  if (name !== "<no revert>") assert.fail(`[${findingId}] createShow 가 "${name}" 로 끝났다.`);
  for (const t of [f.host, f.teamB, f.teamC]) await (f.splitter.connect(t) as any).agreeToRules(SHOW, RULES);
  await f.yoyo.connect(f.host).approve(S, DEPOSIT);
  await (f.splitter.connect(f.host) as any).deposit(SHOW);
  await (f.splitter.connect(f.operator) as any).startSale(SHOW);
  return { ...f, S, teams, alice, bob };
}

/**
 * 불변식 2·4 — `balanceOf(splitter) == escrowOf + depositOf`.
 * **모든 자금 이동 함수 뒤에 부른다.** 이 한 줄이 덩어리 2·3의 채점표다.
 */
async function assertLedger(ctx: any, where: string) {
  const bal = await ctx.yoyo.balanceOf(ctx.S);
  const escrow = await ctx.splitter.escrowOf(SHOW);
  const deposit = await ctx.splitter.depositOf(SHOW);
  assert.equal(
    bal,
    escrow + deposit,
    `${where}: balanceOf(splitter)=${bal} 가 escrowOf(${escrow}) + depositOf(${deposit}) 와 다르다. ` +
      "장부와 실잔액이 어긋나면 release 가 남기거나 모자라게 보내고, 그 차액은 회수 경로가 없다.",
  );
}

async function buy(ctx: any, who: any, ref: string, teamIndex: number, quantity: number, amount?: bigint) {
  const amt = amount ?? PRICE * BigInt(quantity);
  await ctx.yoyo.connect(who).approve(ctx.S, amt);
  await (ctx.splitter.connect(who) as any).purchase(SHOW, id(ref), teamIndex, amt, quantity);
  return amt;
}

/** 3팀 공연을 CREATED 까지 세운다(동의·보증금·판매 개시는 케이스가 알아서). */
async function createdShow(findingId: string) {
  const f = await base();
  const teams = [f.host.address, f.teamB.address, f.teamC.address];
  const name = await revertName(
    (f.splitter.connect(f.operator) as any).createShow(
      SHOW, teams, 0, RULES, 5000, 5000, [3334, 3333, 3333], DEPOSIT,
    ),
    [f.splitter.interface],
  );
  if (name !== "<no revert>") assert.fail(`[${findingId}] createShow 가 "${name}" 로 끝났다.`);
  return { ...f, teams };
}

// ===========================================================================
// Audit.3-A · [M-08] rulesHash 가 온체인 분배율을 구속하지 않는다
//
// 이 컨트랙트의 존재 이유는 "정산 규칙을 판매 전에 잠근다"(project-truth §1)이고,
// 팀이 서명하는 대상은 `rulesHash` 하나다. 그런데 **실제로 분배를 결정하는 값은
// `fixedRatioBp` · `selectionRatioBp` · `teamShareBp`(온체인)** 이고, 컨트랙트는
// 그 셋과 `rulesHash` 가 대응한다는 것을 어디에서도 검증하지 않는다.
//
// `updateRules(showId, 같은해시, 다른bp)` 가 통과한다. 동의는 리셋되지만, 팀이 다시
// 서명하는 값은 **직전에 이미 승인한 것과 글자 하나 다르지 않은 해시**다. 서버의 해시
// 산출 범위가 잘못되어 bp 를 덮지 않으면(예: 규칙 설명문만 해시), 이 경로가 조용히 열린다.
// 그러면 `startSale` 이 잠그는 규칙은 "팀이 동의한 규칙"이 아니게 된다.
//
// 판정 대기 — 코드로 닫으려면 `agreeToRules` 가 bp 까지 받거나 온체인 다이제스트를
// 새로 노출해야 하는데 둘 다 **9/9 고정 ABI 변경**이다. 서버 규약(rulesHash 는 bp 3종을
// 반드시 포함한다) + 검증 페이지 대조로 닫는 선택지도 있다. 그래서 관측 고정으로 쓴다.
// ===========================================================================
describe("Audit.3-A · [M-08] rulesHash ↔ 온체인 bp 미결속", () => {
  it("[M-08·관측] 같은 rulesHash 로 다른 분배율을 잠글 수 있다 — 그리고 그 어긋남은 반드시 공개 관측 가능해야 한다", async () => {
    const ctx = await createdShow("M-08");
    const { splitter, yoyo, minter, operator, host, teamB, teamC } = ctx;
    const i = [splitter.interface];
    await yoyo.connect(minter).mint(host.address, DEPOSIT, id("seed:m08"));
    await yoyo.connect(host).approve(await splitter.getAddress(), DEPOSIT);

    // 팀 전원이 규칙(RULES · 5000/5000 · 균등)에 동의한 상태를 만든다.
    for (const t of [host, teamB, teamC]) await (splitter.connect(t) as any).agreeToRules(SHOW, RULES);
    const before = await splitter.rulesOf(SHOW);
    assert.equal(Number(before[0]), 5000);

    // **해시는 그대로, 경제는 전부 바꾼다.** host 팀이 고정 풀을 독식하는 규칙.
    const tx = (splitter.connect(operator) as any).updateRules(SHOW, RULES, 9000, 1000, [10000, 0, 0]);
    const name = await revertName(tx, i);

    if (name !== "<no revert>") {
      // 결속이 생겼다(코드로 닫는 쪽으로 판정된 경우). 그 경우에도 실패는 **이름 있는**
      // custom error 여야 서버 매핑 표(§4.6)에 들어간다 — 패닉·무명 revert 면 그 자체가 발견이다.
      assert.ok(
        /^[A-Z][A-Za-z0-9_]*$/.test(name),
        `rulesHash↔bp 결속이 생겼지만 실패가 이름 있는 custom error 가 아니다: ${name}`,
      );
      return;
    }

    // ─ 여기부터가 현재 관측 동작이다 ─
    assert.equal(
      await splitter.rulesHashOf(SHOW), RULES,
      "해시가 바뀌었다면 이 발견은 더 이상 성립하지 않는다 — 케이스를 다시 써라",
    );
    const after = await splitter.rulesOf(SHOW);
    assert.equal(Number(after[0]), 9000, "bp 가 실제로 바뀌지 않았다");
    assert.deepEqual([...after[2]].map(Number), [10000, 0, 0]);

    // 팀은 **직전에 승인한 것과 동일한 해시**로 다시 동의한다. 지갑 팝업에 보이는 값이 같다.
    for (const t of [host, teamB, teamC]) {
      assert.equal(
        await revertName(() => (splitter.connect(t) as any).agreeToRules(SHOW, RULES), i),
        "<no revert>",
        "같은 해시 재동의가 막혔다면 결속 방식이 바뀐 것이다",
      );
    }
    await (splitter.connect(host) as any).deposit(SHOW);
    await (splitter.connect(operator) as any).startSale(SHOW);
    assert.equal(Number(await splitter.stageOf(SHOW)), 2);

    // 잠긴 뒤의 상태: 해시는 팀이 본 그것, 경제는 다른 것.
    assert.equal(await splitter.rulesHashOf(SHOW), RULES);
    assert.equal(Number((await splitter.rulesOf(SHOW))[0]), 9000);

    // ★ 이 발견을 '치명'이 아니라 '중간'에 두는 유일한 근거 — **어긋남이 공개로 관측된다.**
    //   검증 페이지·서버 대사가 `rulesOf` 를 읽고 오프체인 규칙 JSON 과 대조할 수 있어야 한다.
    //   이 성질이 깨지면(예: rulesOf 가 사라지면) 심각도가 올라간다.
    const abi = JSON.parse(
      readFileSync("artifacts/contracts/RevenueSplitter.sol/RevenueSplitter.json", "utf8"),
    ).abi;
    assert.ok(
      abi.some((e: any) => e.type === "function" && e.name === "rulesOf"),
      "rulesOf view 가 없으면 잠긴 bp 를 아무도 확인할 수 없다 — 그러면 이 발견은 '높음'이다",
    );
    const upd = abi.find((e: any) => e.type === "event" && e.name === "RulesUpdated");
    for (const f of ["fixedRatioBp", "selectionRatioBp"]) {
      assert.ok(
        upd.inputs.some((x: any) => x.name === f && !x.indexed),
        `RulesUpdated 가 ${f} 를 싣지 않으면 '해시는 같은데 bp 가 바뀐' 사건을 이벤트로 못 잡는다`,
      );
    }
  });
});

// ===========================================================================
// Audit.3-B · [M-09] OPERATOR 자리에 YoYo MINTER 주소가 들어갈 수 있다
//
// project-truth §2(사용자 확정 9/7 · 감사 C-01)는 이렇게 적었다:
//   "**admin ≠ OPERATOR ≠ MINTER 세 주소가 전부 달라야 한다** — 컨트랙트 생성자가
//    `RoleConflict()`로 강제"
//
// 코드는 그 셋 중 **한 쌍만** 막는다.
//   · `YoYo` 생성자        : admin != minter          ✅
//   · `Splitter` 생성자     : admin != operator        ✅
//   · operator != YoYo.minter                          ❌ 어디에도 없다
//   · `rotateOperator(next)`: next != admin, next != 현재 operator 만 본다 ❌
//
// 그래서 ① `RevenueSplitter(admin, minterAddr, yoyo)` 가 그대로 배포되고
//      ② 배포 후 admin 이 `rotateOperator(YoYo.minter())` 를 부를 수 있다.
// 그 순간 키 하나가 **무한 발행(mint) + 정산 실행(aggregate·lock·release·refund·halt)** 을
// 동시에 갖는다 — C-01 이 '치명'으로 판정했던 바로 그 상태다.
//
// 지금 실질 방어는 `scripts/deploy.ts` 의 `assertRolesDistinct` 하나뿐이고, 그것은
// **배포 경로만** 덮는다. rotate 경로는 아무도 안 본다.
//
// 비용: `_validateTeamWallets` 가 이미 `_yoyoMinter()` 를 부른다(H-01). 같은 staticcall
// 1회를 생성자와 `rotateOperator` 에 붙이면 끝이다. 새 저장소 없음. ABI 변경 없음.
// M-02 와 달리 **영구 봉쇄 부작용도 없다** — `YoYo.rotateMinter` 로 minter 를 옮기면
// 그 지갑은 다시 OPERATOR 후보가 된다.
// ===========================================================================
describe("Audit.3-B · [M-09] OPERATOR ≠ YoYo MINTER 가 온체인에서 강제되지 않는다", () => {
  it("[M-09·요구] Splitter 생성자가 operator == YoYo.minter() 를 거부해야 한다 (project-truth §2)", async () => {
    const { ethers, admin, minter, yoyo } = await base();
    const f = await ethers.getContractFactory("RevenueSplitter");
    assert.equal(
      await revertName(f.deploy(admin.address, minter.address, await yoyo.getAddress()), [f.interface]),
      "RoleConflict",
      "operator 자리에 YoYo 의 MINTER 주소를 넣어도 배포된다. project-truth §2 는 " +
      "'세 주소가 전부 달라야 한다 — 생성자가 RoleConflict() 로 강제'라고 적었는데 " +
      "생성자는 admin != operator 한 쌍만 본다. 그 배포에서는 서버 키 하나가 " +
      "무한 발행 + 정산 실행을 동시에 갖는다(= C-01 이 치명으로 판정한 상태). " +
      "수정안: 생성자에 `if (operator_ == _yoyoMinter()) revert RoleConflict();` 한 줄. " +
      "_validateTeamWallets 가 쓰는 것과 같은 staticcall 이고 새 저장소·ABI 변경이 없다.",
    );
  });

  it("[M-09·요구] rotateOperator 가 YoYo MINTER 주소를 거부해야 한다 (배포 어서션이 못 덮는 경로)", async () => {
    const { splitter, admin, minter } = await base();
    assert.equal(
      await revertName((splitter.connect(admin) as any).rotateOperator(minter.address), [splitter.interface]),
      "RoleConflict",
      "배포 시점에는 scripts/deploy.ts 의 assertRolesDistinct 가 세 키 분리를 강제하지만, " +
      "**rotate 경로는 그 어서션 밖이다.** admin 이 한 번 잘못 부르면 되돌릴 수는 있어도 " +
      "그 사이 mint + release 가 한 키로 가능해진다. " +
      "수정안: rotateOperator 에도 `if (next == _yoyoMinter()) revert RoleConflict();`. " +
      "createShow 의 팀 지갑 검사(H-01)와 같은 '스냅샷' 성격이라 한계도 같다 — " +
      "YoYo 쪽에서 나중에 minter 를 현재 operator 로 옮기는 반대 방향은 여전히 못 막는다(M-02 와 동류).",
    );
  });

  it("[M-09·관측] 반대 짝(팀 지갑 ← MINTER)은 이미 막혀 있다 — 같은 staticcall 이 이미 있다는 증거", async () => {
    // 수정 비용이 낮다는 주장의 근거를 기계로 남긴다: 컨트랙트는 이미 YoYo.minter() 를 읽는다.
    const { splitter, operator, host, minter, teamC } = await base();
    assert.equal(
      await revertName(
        (splitter.connect(operator) as any).createShow(
          SHOW, [host.address, minter.address, teamC.address], 0, RULES, 5000, 5000, [3334, 3333, 3333], DEPOSIT,
        ),
        [splitter.interface],
      ),
      "ReservedAddress",
      "H-01 방어가 사라졌다",
    );
  });
});

// ===========================================================================
// Audit.3-C · [L-09] createShow 는 되돌릴 수 없고 updateRules 가 고칠 수 없는 값이 셋 있다
//
// `updateRules` 가 바꿀 수 있는 것은 `rulesHash` · 두 비율 · `teamShareBp` 뿐이다.
// `teamWallets` · `hostTeamIndex` · `depositAmount` 는 `createShow` 한 번으로 영구 고정되고,
// `createShow` 재호출은 `ShowAlreadyExists` 다. 이것 자체는 의도된 설계다(문서 13 §3.1).
//
// 문제는 **오타의 결과가 자금 경로에 직결되는데 복구 경로가 문서화돼 있지 않다**는 것이다.
// `hostTeamIndex` 를 잘못 넣으면 ① 보증금 50,000 을 낼 수 있는 지갑이 바뀌고(`onlyHostOf`)
// ② `returnDeposit` 수신자가 바뀌고 ③ dust 귀속 팀이 바뀐다. 서버 DB 의 host 와 온체인
// host 가 어긋난 채로 굴러가면 보증금 납부가 `NotHost` 로 계속 실패한다.
//
// 유일한 복구는 `halt` 후 **다른 showId 로 다시 만드는 것**이고, showId = performance_id 이므로
// 서버가 공연 행을 새로 파야 한다. 이 절차가 문서 §4.8 옆에 없다.
// ===========================================================================
describe("Audit.3-C · [L-09] createShow 오입력의 복구 경로", () => {
  it("[L-09·관측] hostTeamIndex 오타는 보증금 납부를 막고, updateRules·재호출 어느 쪽으로도 고칠 수 없다", async () => {
    const f = await base();
    const { splitter, operator, yoyo, minter, host, teamB, teamC } = f;
    const i = [splitter.interface];
    const teams = [host.address, teamB.address, teamC.address];

    // 서버 DB 는 host = index 0 인데 온체인에 1 로 들어갔다(오타 한 글자).
    await (splitter.connect(operator) as any).createShow(
      SHOW, teams, 1, RULES, 5000, 5000, [3334, 3333, 3333], DEPOSIT,
    );
    assert.equal(Number(await splitter.hostTeamIndexOf(SHOW)), 1);

    // ① 진짜 주최 팀은 보증금을 낼 수 없다. 자금 경로가 그 자리에서 막힌다.
    await yoyo.connect(minter).mint(host.address, DEPOSIT, id("seed:l09"));
    await yoyo.connect(host).approve(await splitter.getAddress(), DEPOSIT);
    assert.equal(
      await revertName(() => (splitter.connect(host) as any).deposit(SHOW), i),
      "NotHost",
      "hostTeamIndex 가 자금 경로를 좌우한다는 전제가 바뀌었다",
    );

    // ② updateRules 는 host 를 고칠 수 없다 — 인자에 아예 없다.
    await (splitter.connect(operator) as any).updateRules(SHOW, id("rules-v2"), 6000, 4000, [4000, 3000, 3000]);
    assert.equal(Number(await splitter.hostTeamIndexOf(SHOW)), 1, "updateRules 가 host 를 바꿨다면 설계가 바뀐 것이다");
    assert.deepEqual([...(await splitter.teamWalletsOf(SHOW))], teams, "updateRules 가 팀 배열을 바꿨다");
    assert.equal(await splitter.depositAmountOf(SHOW), DEPOSIT, "updateRules 가 보증금 금액을 바꿨다");

    // ③ 같은 showId 로 다시 만들 수도 없다.
    assert.equal(
      await revertName(
        () => (splitter.connect(operator) as any).createShow(
          SHOW, teams, 0, RULES, 5000, 5000, [3334, 3333, 3333], DEPOSIT,
        ),
        i,
      ),
      "ShowAlreadyExists",
      "createShow 가 덮어쓰기가 되면 그것이 훨씬 큰 발견이다(잠긴 규칙을 지울 수 있다)",
    );

    // ④ 결국 남는 경로는 '잘못 지정된 팀이 대신 낸다' 뿐이다 — 온체인은 그것을 정상으로 본다.
    //    운영 절차가 이 상황을 어떻게 처리하는지 문서에 없으면 시연 당일 여기서 멈춘다.
    await yoyo.connect(minter).mint(teamB.address, DEPOSIT, id("seed:l09b"));
    await yoyo.connect(teamB).approve(await splitter.getAddress(), DEPOSIT);
    await (splitter.connect(teamB) as any).deposit(SHOW);
    assert.equal(await splitter.depositOf(SHOW), DEPOSIT);
  });
});

// ===========================================================================
// Audit.3-D · 덩어리 1 자금·장부 회귀 고정 (구현 확인)
//
// 발견이 아니라 **덩어리 2·3 이 깨뜨리면 안 되는 성질**을 못 박는다.
// balanceOf(this) == escrow + deposit 전수 검사는 Audit.2-F 가 purchase 이후까지 보지만,
// 그것은 덩어리 2 전까지 판정 불가다. 덩어리 1 구간만이라도 지금 초록으로 고정한다.
// ===========================================================================
describe("Audit.3-D · 덩어리 1 자금·장부 회귀 고정", () => {
  it("보증금은 escrow 와 섞이지 않는다 (§7.5) — deposit 전후로 escrowOf 가 0 이다", async () => {
    const ctx = await createdShow("B1");
    const { splitter, yoyo, minter, host, teamB, teamC, operator } = ctx;
    const S = await splitter.getAddress();

    assert.equal(await splitter.escrowOf(SHOW), 0n);
    assert.equal(await splitter.depositOf(SHOW), 0n);
    assert.equal(await yoyo.balanceOf(S), 0n);

    for (const t of [host, teamB, teamC]) await (splitter.connect(t) as any).agreeToRules(SHOW, RULES);
    await yoyo.connect(minter).mint(host.address, DEPOSIT, id("seed:b1"));
    await yoyo.connect(host).approve(S, DEPOSIT);
    await (splitter.connect(host) as any).deposit(SHOW);

    assert.equal(await splitter.depositOf(SHOW), DEPOSIT);
    assert.equal(await splitter.escrowOf(SHOW), 0n, "보증금이 escrow 로 들어갔다 — R 이 50,000 부풀어 전 팀 분배액이 틀어진다");
    assert.equal(await yoyo.balanceOf(S), DEPOSIT, "balanceOf(this) != escrow + deposit");

    await (splitter.connect(operator) as any).startSale(SHOW);
    assert.equal(await splitter.escrowOf(SHOW), 0n);
    assert.equal(await yoyo.balanceOf(S), (await splitter.escrowOf(SHOW)) + (await splitter.depositOf(SHOW)));
  });

  it("deposit 은 정확히 1회다 — 두 번째 호출은 DepositAlreadyPaid, 잔액이 두 번 빠지지 않는다", async () => {
    const ctx = await createdShow("B1");
    const { splitter, yoyo, minter, host } = ctx;
    const S = await splitter.getAddress();
    await yoyo.connect(minter).mint(host.address, DEPOSIT * 3n, id("seed:b1b"));
    await yoyo.connect(host).approve(S, DEPOSIT * 3n);

    await (splitter.connect(host) as any).deposit(SHOW);
    const balAfter = await yoyo.balanceOf(host.address);
    assert.equal(
      await revertName(() => (splitter.connect(host) as any).deposit(SHOW), [splitter.interface]),
      "DepositAlreadyPaid",
    );
    assert.equal(await yoyo.balanceOf(host.address), balAfter, "두 번째 deposit 이 잔액을 건드렸다");
    assert.equal(await yoyo.balanceOf(S), DEPOSIT, "컨트랙트 잔액이 장부보다 크다");
  });

  it("배열 4개의 길이가 createShow 직후부터 같다 (덩어리 2 의 choiceCount[i] 패닉 방지)", async () => {
    const ctx = await createdShow("B1");
    const { splitter } = ctx;
    assert.equal(Number(await splitter.teamCountOf(SHOW)), 3);
    assert.equal([...(await splitter.teamWalletsOf(SHOW))].length, 3);
    assert.equal([...(await splitter.rulesOf(SHOW))[2]].length, 3, "teamShareBp 길이");
    assert.equal([...(await splitter.choiceCountsOf(SHOW))].length, 3, "choiceCount 길이가 0 이면 purchase 가 패닉(0x32)으로 죽는다");
    assert.equal([...(await splitter.payoutsOf(SHOW))].length, 3, "payout 길이가 0 이면 Σpayout == R 검산이 0 == 0 으로 조용히 통과한다");
    for (let i = 0; i < 3; i++) {
      assert.equal(await splitter.choiceCountOf(SHOW, i), 0n);
      assert.equal(await splitter.payoutOf(SHOW, i), 0n);
    }
    assert.equal(await splitter.totalChoicesOf(SHOW), 0n);
    assert.equal(await splitter.validTicketCountOf(SHOW), 0n);
  });

  it("updateRules 는 팀 전원을 리셋한다 — 3팀 전부가 다시 동의해야 startSale 이 열린다", async () => {
    // Audit.2-D 는 1팀만 동의한 상태에서 리셋을 본다. 여기서는 **전원 동의 후** 리셋을 본다 —
    // agreedCount 만 0 이 되고 개별 판정이 남는 '절반 리셋'은 이 배치에서만 드러난다.
    const ctx = await createdShow("M-03");
    const { splitter, yoyo, minter, operator, host, teamB, teamC } = ctx;
    const S = await splitter.getAddress();
    const i = [splitter.interface];

    for (const t of [host, teamB, teamC]) await (splitter.connect(t) as any).agreeToRules(SHOW, RULES);
    assert.equal(Number(await splitter.agreedCountOf(SHOW)), 3);

    const RULES2 = id("rules-json-v2");
    await (splitter.connect(operator) as any).updateRules(SHOW, RULES2, 6000, 4000, [4000, 3000, 3000]);

    assert.equal(Number(await splitter.agreedCountOf(SHOW)), 0);
    for (const t of [host, teamB, teamC]) {
      assert.equal(await splitter.agreedOf(SHOW, t.address), false, `${t.address} 의 동의가 리셋되지 않았다`);
    }
    // 보증금은 리셋되지 않는다(규칙과 무관한 장부다).
    await yoyo.connect(minter).mint(host.address, DEPOSIT, id("seed:m03"));
    await yoyo.connect(host).approve(S, DEPOSIT);
    await (splitter.connect(host) as any).deposit(SHOW);
    assert.equal(
      await revertName(() => (splitter.connect(operator) as any).startSale(SHOW), i),
      "NotAllAgreed",
      "리셋 후에도 startSale 이 열리면 동의 장치가 무의미하다",
    );

    for (const t of [host, teamB, teamC]) {
      assert.equal(
        await revertName(() => (splitter.connect(t) as any).agreeToRules(SHOW, RULES2), i),
        "<no revert>",
        `${t.address} 의 재동의가 막혔다 — 절반 리셋(M-03)이 되살아났다`,
      );
    }
    await (splitter.connect(operator) as any).startSale(SHOW);
    assert.equal(Number(await splitter.stageOf(SHOW)), 2);
  });

  it("agreeToRules 는 지갑당 1회 — 같은 판본에서 두 번 세지 않는다", async () => {
    const ctx = await createdShow("B1");
    const { splitter, host, outsider } = ctx;
    const i = [splitter.interface];
    await (splitter.connect(host) as any).agreeToRules(SHOW, RULES);
    assert.equal(Number(await splitter.agreedCountOf(SHOW)), 1);
    assert.equal(await revertName(() => (splitter.connect(host) as any).agreeToRules(SHOW, RULES), i), "AlreadyAgreed");
    assert.equal(Number(await splitter.agreedCountOf(SHOW)), 1, "agreedCount 가 중복으로 올랐다");
    // 팀이 아닌 지갑은 카운터에 닿을 수 없다.
    assert.equal(await revertName(() => (splitter.connect(outsider) as any).agreeToRules(SHOW, RULES), i), "NotTeam");
    assert.equal(await splitter.agreedOf(SHOW, outsider.address), false);
  });

  it("팀 수 경계 — 1팀·8팀은 만들어지고 9팀은 InvalidTeamCount 다", async () => {
    const { ethers, splitter, operator, admin, minter, yoyo } = await base();
    const i = [splitter.interface];
    const signers = await ethers.getSigners();
    // admin·operator·YoYo minter·토큰·컨트랙트 자신과 겹치지 않는 주소만 쓴다.
    const reserved = new Set([admin.address, await splitter.operator(), minter.address, await yoyo.getAddress()]);
    const pool = signers.map((s: any) => s.address).filter((a: string) => !reserved.has(a));
    assert.ok(pool.length >= 9, `팀 경계 테스트에 서명자 9개가 필요하다 (현재 ${pool.length})`);

    const share = (n: number) => {
      const arr = new Array(n).fill(Math.floor(10000 / n));
      arr[0] += 10000 - arr.reduce((a, b) => a + b, 0);
      return arr;
    };
    // 1팀
    await (splitter.connect(operator) as any).createShow(1n, [pool[0]], 0, RULES, 5000, 5000, share(1), 0n);
    assert.equal(Number(await splitter.teamCountOf(1n)), 1);
    // 8팀 (MAX_TEAMS)
    await (splitter.connect(operator) as any).createShow(2n, pool.slice(0, 8), 7, RULES, 5000, 5000, share(8), 0n);
    assert.equal(Number(await splitter.teamCountOf(2n)), 8);
    assert.equal(Number(await splitter.hostTeamIndexOf(2n)), 7);
    // 9팀
    assert.equal(
      await revertName(
        () => (splitter.connect(operator) as any).createShow(3n, pool.slice(0, 9), 0, RULES, 5000, 5000, share(9), 0n),
        i,
      ),
      "InvalidTeamCount",
      "MAX_TEAMS(8) 상한이 사라졌다 — release 의 팀별 transfer 가 블록 가스 한도에 걸린다",
    );
  });
});

// ===========================================================================
// Audit.3-E · 덩어리 2 자금·장부 회귀 고정 (감사 라운드 5 · purchase · refund)
//
// 덩어리 1의 `Audit.3-D` 와 같은 성격이다 — **지금 옳은 것을 못 박아 두어**
// 덩어리 3(aggregate·lock·release·halt)이 들어올 때 무엇이 깨졌는지 즉시 보이게 한다.
//
// 채점표는 `assertLedger` 한 줄이다: `balanceOf(splitter) == escrowOf + depositOf`.
// 이 불변식이 깨진 채로 `release` 가 들어오면 팀 지갑으로 나가는 금액이 실잔액과 어긋나고,
// 그 차액은 회수 경로가 없다(project-truth §7 불변식 2·4).
// ===========================================================================
describe("Audit.3-E · 덩어리 2 자금·장부 회귀 고정 (purchase · refund)", () => {
  it("불변식 — purchase · refund 매 단계 뒤 balanceOf(splitter) == escrowOf + depositOf", async () => {
    const ctx = await onSaleShow("INV-B2");
    const { splitter, operator, alice, bob } = ctx;
    await assertLedger(ctx, "startSale 직후(보증금만)");
    assert.equal(await splitter.escrowOf(SHOW), 0n, "보증금이 escrow 에 섞였다(§7.5)");

    await buy(ctx, alice, "o1", 1, 2);            // 40,000 → team 1
    await assertLedger(ctx, "purchase #1");
    await buy(ctx, bob, "o2", 2, 1);              // 20,000 → team 2
    await assertLedger(ctx, "purchase #2");
    assert.equal(await splitter.escrowOf(SHOW), 60_000n);
    assert.equal(await splitter.depositOf(SHOW), DEPOSIT, "purchase 가 보증금 계정을 건드렸다");

    // 50% 취소 수수료 환불
    await (splitter.connect(operator) as any).refund(SHOW, id("o1"), 20_000n);
    await assertLedger(ctx, "refund 50%");
    // 전액 환불
    await (splitter.connect(operator) as any).refund(SHOW, id("o2"), 20_000n);
    await assertLedger(ctx, "refund 100%");
    // 잔여 50% 마저 환불
    await (splitter.connect(operator) as any).refund(SHOW, id("o1"), 20_000n);
    await assertLedger(ctx, "refund 잔여 50%");
    assert.equal(await splitter.escrowOf(SHOW), 0n, "전부 환불했는데 escrow 가 남았다");
    assert.equal(await splitter.depositOf(SHOW), DEPOSIT, "환불이 보증금을 갉아먹었다");
  });

  it("[A-2·판정] 표는 첫 환불에서 전량 빠지고, 취소 수수료 잔액은 escrow 에 남아 R 에 들어간다", async () => {
    // project-truth §2 "환불 티켓의 계수·재원" (사용자·팀 확정 2026-09-07).
    // 돈과 표가 서로 다른 규칙으로 움직인다 — 돈은 refundAmount 만, 표는 통째로.
    const ctx = await onSaleShow("A-2");
    const { splitter, operator, alice } = ctx;
    const paid = await buy(ctx, alice, "p1", 1, 3); // 60,000 · 3매 · team 1
    assert.deepEqual([...(await splitter.choiceCountsOf(SHOW))], [0n, 3n, 0n]);
    assert.equal(await splitter.totalChoicesOf(SHOW), 3n);

    // 50% 환불 — 돈은 절반, 표는 전량. **수신자는 언제나 저장된 p.buyer 다.**
    const buyerBefore = await ctx.yoyo.balanceOf(alice.address);
    const opBefore = await ctx.yoyo.balanceOf(operator.address);
    await (splitter.connect(operator) as any).refund(SHOW, id("p1"), paid / 2n);
    assert.equal(
      await ctx.yoyo.balanceOf(alice.address),
      buyerBefore + paid / 2n,
      "환불금이 구매자에게 가지 않았다",
    );
    assert.equal(
      await ctx.yoyo.balanceOf(operator.address),
      opBefore,
      "환불금이 호출자(OPERATOR)에게 갔다 — refund 의 수신자가 저장된 p.buyer 가 아니라 msg.sender 다. " +
        "이 한 줄이 뒤집히면 OPERATOR 키 하나가 에스크로 전액을 자기 지갑으로 빼낼 수 있다(치명).",
    );
    assert.deepEqual(
      [...(await splitter.choiceCountsOf(SHOW))],
      [0n, 0n, 0n],
      "부분 환불인데 표가 남았다 — A-2 는 '표에는 반쪽이 없다'로 확정됐다",
    );
    assert.equal(
      await splitter.escrowOf(SHOW),
      paid / 2n,
      "취소 수수료 잔액이 escrow 에 남지 않았다 — 요구사항 §7.2 는 이 금액이 정산 재원 R 에 " +
        "들어간다고 정한다. 여기서 새면 팀들이 받을 돈이 조용히 줄어든다",
    );
    await assertLedger(ctx, "A-2 50% 환불 후");

    // 2회차 — 표는 두 번 빠지지 않는다(언더플로도 없다)
    await (splitter.connect(operator) as any).refund(SHOW, id("p1"), paid / 2n);
    assert.deepEqual([...(await splitter.choiceCountsOf(SHOW))], [0n, 0n, 0n]);
    assert.equal(await splitter.escrowOf(SHOW), 0n);
    // 3회차는 없다
    assert.equal(
      await revertName(() => (splitter.connect(operator) as any).refund(SHOW, id("p1"), 1n), [splitter.interface]),
      "AlreadyRefunded",
    );
    await assertLedger(ctx, "A-2 전액 환불 후");
  });

  it("[C-6·판정] Refunded.quantity 는 1회차 실매수 · 2회차 0 — 이벤트 합계만으로 온체인 카운터가 복원된다", async () => {
    // 문서 13 §7 C-6. 검증 페이지(V-01)와 서버 대사가 **view 없이 이벤트만으로**
    // choiceCount 를 재현할 수 있어야 한다. 그 재현이 불변식 3(Σ Released == 재계산)의 전제다.
    const ctx = await onSaleShow("C-6");
    const { splitter, operator, alice, bob } = ctx;
    await buy(ctx, alice, "e1", 0, 2);
    await buy(ctx, bob, "e2", 1, 4);
    await buy(ctx, alice, "e3", 1, 1);
    await (splitter.connect(operator) as any).refund(SHOW, id("e2"), 10_000n); // 부분
    await (splitter.connect(operator) as any).refund(SHOW, id("e2"), 10_000n); // 부분 2회차
    await (splitter.connect(operator) as any).refund(SHOW, id("e1"), 40_000n); // 전액

    const teamCount = Number(await splitter.teamCountOf(SHOW));
    const replay: bigint[] = new Array(teamCount).fill(0n);
    const bought = await splitter.queryFilter(splitter.filters.Purchased(SHOW), 0);
    const refunded = await splitter.queryFilter(splitter.filters.Refunded(SHOW), 0);
    for (const ev of bought) replay[Number((ev as any).args.teamIndex)] += BigInt((ev as any).args.quantity);
    for (const ev of refunded) replay[Number((ev as any).args.teamIndex)] -= BigInt((ev as any).args.quantity);

    assert.deepEqual(
      replay,
      [...(await splitter.choiceCountsOf(SHOW))],
      "이벤트 합계가 온체인 카운터를 복원하지 못한다. 2회차 이후 Refunded.quantity 가 0 이 아니면 " +
        "검증 페이지가 표를 두 번 빼고, 서버 대사는 aggregate 를 AggregateMismatch 로 영구히 막는다",
    );
    // 2회차 환불 이벤트의 quantity 가 실제로 0인지 직접도 본다(위 합계는 상쇄로 가려질 수 있다).
    const e2 = refunded.filter((ev: any) => ev.args.orderRef === id("e2"));
    assert.equal(Number((e2[0] as any).args.quantity), 4, "1회차 Refunded.quantity 가 실제 매수(4)가 아니다");
    assert.equal(Number((e2[1] as any).args.quantity), 0, "2회차 Refunded.quantity 가 0 이 아니다 (C-6)");
    await assertLedger(ctx, "C-6 시나리오 종료");
  });

  it("orderRef 는 재사용할 수 없다 — 전액 환불된 뒤에도, 다른 관객이 와도 (대납 재전송 방어)", async () => {
    const ctx = await onSaleShow("REF");
    const { splitter, operator, yoyo, S, alice, bob } = ctx;
    const i = [splitter.interface];
    await buy(ctx, alice, "dup", 0, 1);
    await (splitter.connect(operator) as any).refund(SHOW, id("dup"), 20_000n);

    // 전액 환불 후에도 같은 orderRef 는 죽은 채로 남아야 한다.
    // (여기가 열리면 서버가 취소한 주문번호를 재활용하는 순간 표가 되살아난다.)
    await yoyo.connect(bob).approve(S, 20_000n);
    assert.equal(
      await revertName(
        () => (splitter.connect(bob) as any).purchase(SHOW, id("dup"), 1, 20_000n, 1),
        i,
      ),
      "AlreadyPurchased",
      "환불된 orderRef 로 재구매가 됐다 — purchase 의 재사용 검사가 p.amount 를 보는데 " +
        "refund 가 그 값을 지우면 여기가 열린다",
    );
    // 존재하지 않는 주문 환불
    assert.equal(
      await revertName(() => (splitter.connect(operator) as any).refund(SHOW, id("nope"), 1n), i),
      "PurchaseNotFound",
    );
    await assertLedger(ctx, "orderRef 재사용 방어 후");
  });

  it("부분 환불 누적은 결제액을 넘지 못한다 — 경계 3종", async () => {
    const ctx = await onSaleShow("SUM");
    const { splitter, operator, alice } = ctx;
    const i = [splitter.interface];
    const paid = await buy(ctx, alice, "s1", 2, 2); // 40,000

    assert.equal(
      await revertName(() => (splitter.connect(operator) as any).refund(SHOW, id("s1"), paid + 1n), i),
      "RefundExceedsPurchase",
    );
    assert.equal(
      await revertName(() => (splitter.connect(operator) as any).refund(SHOW, id("s1"), 0n), i),
      "ZeroAmount",
      "0원 환불이 통과하면 표만 지우고 돈은 그대로 두는 tx 가 만들어진다",
    );
    await (splitter.connect(operator) as any).refund(SHOW, id("s1"), paid - 1n);
    assert.equal(
      await revertName(() => (splitter.connect(operator) as any).refund(SHOW, id("s1"), 2n), i),
      "RefundExceedsPurchase",
      "잔액 1원인데 2원이 나갔다 — 누적 상한이 p.amount 가 아니라 회차별로 걸려 있다",
    );
    await (splitter.connect(operator) as any).refund(SHOW, id("s1"), 1n);
    assert.equal(await splitter.escrowOf(SHOW), 0n);
    await assertLedger(ctx, "누적 상한 경계 후");
  });

  it("purchase 입력 경계 — quantity 0·5 · amount 0 · orderRef 0 · teamIndex 범위 밖", async () => {
    const ctx = await onSaleShow("BND");
    const { splitter, yoyo, S, alice } = ctx;
    const i = [splitter.interface];
    await yoyo.connect(alice).approve(S, 1_000_000n);
    const P = (ref: string, team: number, amt: bigint, q: number) =>
      revertName(() => (splitter.connect(alice) as any).purchase(SHOW, ref, team, amt, q), i);

    assert.equal(await P(id("b1"), 0, 20_000n, 0), "ZeroQuantity");
    assert.equal(await P(id("b2"), 0, 20_000n, 5), "QuantityLimitExceeded");
    assert.equal(await P(id("b3"), 0, 0n, 1), "ZeroAmount");
    assert.equal(await P("0x" + "00".repeat(32), 0, 20_000n, 1), "ZeroOrderRef");
    assert.equal(await P(id("b5"), 3, 20_000n, 1), "TeamIndexOutOfRange");
    assert.equal(Number(await splitter.MAX_QUANTITY_PER_ORDER()), 4);
    // 상한값 4는 통과해야 한다(상한이 3으로 좁아지면 요구사항 §7.3 '1인 4매'와 어긋난다).
    assert.equal(await P(id("b6"), 0, 80_000n, 4), "<no revert>");
    await assertLedger(ctx, "입력 경계 후");
  });

  it("transferFrom 이 실패하면 표·escrow 가 남지 않는다 (CEI 의 원자성 — approve 부족)", async () => {
    // 효과를 먼저 쓰고 외부 호출을 마지막에 두는 순서가 **안전한** 이유는
    // 실패하면 tx 전체가 되돌아가기 때문이다. 그 원자성을 기계로 못 박는다.
    // (재진입 자체는 YoYo 에 훅이 없어 여기서 재현할 수 없다 — 보고서 '미검증' 참조.)
    const ctx = await onSaleShow("CEI");
    const { splitter, yoyo, S, alice } = ctx;
    await yoyo.connect(alice).approve(S, 10_000n); // 20,000 이 필요한데 절반만
    await assert.rejects(() => (splitter.connect(alice) as any).purchase(SHOW, id("c1"), 1, 20_000n, 1));
    assert.equal(await splitter.escrowOf(SHOW), 0n, "실패한 purchase 가 escrow 를 남겼다");
    assert.deepEqual([...(await splitter.choiceCountsOf(SHOW))], [0n, 0n, 0n], "실패한 purchase 가 표를 남겼다");
    const pr = await splitter.purchaseOf(SHOW, id("c1"));
    assert.equal(pr[0], "0x0000000000000000000000000000000000000000");
    assert.equal(pr[2], 0n, "실패한 purchase 가 orderRef 를 소진시켰다 — 재시도가 AlreadyPurchased 로 막힌다");
    await assertLedger(ctx, "실패한 purchase 후");
  });

  it("[M-10·관측·신규] 1원 환불이 표를 전량 지운다 — 그 어긋남은 반드시 이벤트로 관측 가능해야 한다", async () => {
    // A-2("표는 첫 환불에서 전량")의 필연적 노출이다. **코드는 사양대로다.**
    // 그러나 OPERATOR 가 주문마다 1원씩 환불하면 돈은 거의 그대로 둔 채 T 를 0 으로 만들 수 있고,
    // 그러면 관객 선택 풀 S 가 `T > 0 ? n_i/T : 1/N` 분기에서 **균등 분배**로 바뀐다.
    // 잠긴 규칙은 그대로인데 결과가 달라지는, 잠금 이후 유일한 경제 변경 경로다.
    //
    // 심각도를 '중간'에 묶어 두는 조건은 **관측 가능성** 하나다 —
    // `Refunded(refundAmount, quantity)` 가 "1원에 표 3장"을 그대로 드러내야 한다.
    // 이 단정이 깨지면(이벤트에서 금액이나 수량이 사라지면) 심각도는 '높음'이 된다.
    const ctx = await onSaleShow("M-10");
    const { splitter, operator, alice, bob } = ctx;
    await buy(ctx, alice, "m1", 1, 3); // 60,000 · team 1
    await buy(ctx, bob, "m2", 2, 2);   // 40,000 · team 2
    assert.equal(await splitter.totalChoicesOf(SHOW), 5n);
    const before = await splitter.escrowOf(SHOW);

    await (splitter.connect(operator) as any).refund(SHOW, id("m1"), 1n);
    await (splitter.connect(operator) as any).refund(SHOW, id("m2"), 1n);

    assert.equal(
      await splitter.totalChoicesOf(SHOW),
      0n,
      "관측이 바뀌었다 — 1원 환불로 표가 지워지지 않는다면 A-2 규칙이 바뀐 것이다. " +
        "그 자체는 좋은 변경일 수 있으니 M-10 판정을 다시 열어라",
    );
    assert.equal(
      await splitter.escrowOf(SHOW),
      before - 2n,
      "돈은 2원만 나갔는데 표 5장이 전부 사라졌다 — 이것이 M-10 의 실체다",
    );

    // 관측 가능성 — 이벤트 하나만 보고 '1원에 표 3장'을 알 수 있어야 한다.
    const evs = await splitter.queryFilter(splitter.filters.Refunded(SHOW), 0);
    const m1: any = evs.find((e: any) => e.args.orderRef === id("m1"));
    assert.equal(m1.args.refundAmount, 1n, "Refunded 가 환불 금액을 드러내지 않는다");
    assert.equal(Number(m1.args.quantity), 3, "Refunded 가 사라진 표 수를 드러내지 않는다");
    const paid: any = (await splitter.queryFilter(splitter.filters.Purchased(SHOW), 0))
      .find((e: any) => e.args.orderRef === id("m1"));
    assert.ok(
      m1.args.refundAmount * 100n < paid.args.amount,
      "이벤트 두 개(Purchased·Refunded)를 나란히 놓으면 '결제액 대비 환불액이 1%도 안 되는데 " +
        "표는 전량 빠졌다'가 보여야 한다. 검증 페이지 V-01 이 이 대조를 표시하지 않으면 " +
        "M-10 은 중간이 아니라 높음이다",
    );
    await assertLedger(ctx, "M-10 시나리오 종료");
  });

  it("[M-09·검사] 생성자 순서 변경이 다른 선행 검사를 약화시키지 않았다", async () => {
    // `_yoyo` 대입을 `_grantRole` 앞으로 옮겼다. 순서가 바뀐 생성자에서
    // ① 0주소 3종 ② admin == operator ③ operator == YoYo.minter 가 전부 살아 있는지,
    // ④ 정상 구성은 여전히 서는지 확인한다.
    const { ethers, yoyo, admin, operator, minter, splitter } = await base();
    const K = await yoyo.getAddress();
    const ZA = "0x0000000000000000000000000000000000000000";
    const i = [splitter.interface];
    const D = (a: string, o: string, k: string) =>
      revertName(ethers.deployContract("RevenueSplitter", [a, o, k]), i);

    assert.equal(await D(ZA, operator.address, K), "ZeroAddress");
    assert.equal(await D(admin.address, ZA, K), "ZeroAddress");
    assert.equal(await D(admin.address, operator.address, ZA), "ZeroAddress");
    assert.equal(await D(admin.address, admin.address, K), "RoleConflict", "admin == operator 검사가 사라졌다");
    assert.equal(
      await D(admin.address, minter.address, K),
      "RoleConflict",
      "[M-09] operator == YoYo.minter 검사가 사라졌다",
    );
    assert.equal(await D(admin.address, operator.address, K), "<no revert>", "정상 3키 구성이 배포되지 않는다");
  });

  it("[L-10·관측·신규] 반대 방향은 열려 있다 — YoYo.rotateMinter(현재 OPERATOR) 를 Splitter 가 막지 못한다", async () => {
    // 엔지니어가 `rotateOperator` 주석에 남긴 한계의 기계 확인.
    // M-09 는 **Splitter 쪽 두 지점**(생성자 · rotateOperator)에서만 스냅샷을 본다.
    // YoYo 는 Splitter 를 모르므로 `rotateMinter(next)` 가 next == Splitter.operator() 인지
    // 확인할 수 없다. 그 결과 키 하나가 무한 발행 + 정산 실행을 동시에 갖는 상태에
    // **사후에** 도달할 수 있다.
    //
    // 심각도를 낮음에 묶어 두는 조건 셋 — 이 단정들이 그것을 고정한다.
    //   ① 진입점이 admin(콜드 키) 전용이다. 상시 hot 인 OPERATOR·MINTER 로는 못 간다.
    //   ② `MinterRotated` 이벤트로 공개 관측된다.
    //   ③ 서버 기동 검증(CLAUDE.local.md §5.1 "MINTER ≠ OPERATOR")이 다음 부팅에서 잡는다.
    // 하나라도 무너지면 등급을 다시 매겨야 한다.
    const { yoyo, splitter, admin, operator, outsider } = await base();
    const i = [yoyo.interface];

    // ① 상시 hot 키로는 못 간다.
    assert.equal(
      await revertName(() => (yoyo.connect(operator) as any).rotateMinter(operator.address), i),
      "AccessControlUnauthorizedAccount",
      "OPERATOR 가 스스로 MINTER 가 될 수 있다면 이것은 낮음이 아니라 치명이다",
    );
    assert.equal(
      await revertName(() => (yoyo.connect(outsider) as any).rotateMinter(outsider.address), i),
      "AccessControlUnauthorizedAccount",
    );

    // ② admin 은 갈 수 있다 — Splitter 는 이 tx 를 보지 못한다. 이것이 한계의 실체다.
    //    이 분기는 **양쪽 결론에서 모두 통과한다**(§6 규칙 3). 반대 방향이 나중에 막히면
    //    그때는 이름 있는 custom error 인지만 확인하고 L-10 을 '해소'로 옮기면 된다.
    const op = await splitter.operator();
    const rotate = await revertName(() => (yoyo.connect(admin) as any).rotateMinter(op), i);
    if (rotate === "<no revert>") {
      assert.equal(
        await splitter.operator(),
        await yoyo.minter(),
        "rotateMinter 가 통과했는데 minter 가 operator 로 바뀌지 않았다 — 관측 자체가 깨졌다",
      );
      // ③ 그러나 공개 관측된다 — 서버 기동 검증(CLAUDE.local.md §5.1 "MINTER ≠ OPERATOR")과
      //    검증 페이지가 이 이벤트로 잡는다. 여기가 사라지면 등급이 낮음에서 올라간다.
      const evs = await yoyo.queryFilter(yoyo.filters.MinterRotated(), 0);
      const last: any = evs[evs.length - 1];
      assert.equal(
        last.args.newMinter,
        op,
        "MinterRotated 가 새 minter 를 드러내지 않으면 유일한 사후 탐지 경로가 사라진다 — " +
          "그러면 L-10 은 낮음이 아니다",
      );
    } else {
      assert.ok(
        /RoleConflict|ReservedAddress/.test(rotate),
        `반대 방향이 막혔다면(L-10 해소) 이름 있는 custom error 여야 한다. 관측: ${rotate}`,
      );
    }

    // ④ 어느 쪽이든 Splitter 쪽 진입점은 닫혀 있다 — 방어가 통째로 없어진 것이 아니다.
    assert.equal(
      await revertName(() => (splitter.connect(admin) as any).rotateOperator(op), [splitter.interface]),
      "RoleConflict",
      "M-09 의 rotateOperator 검사까지 함께 무력화되면 등급이 올라간다",
    );
  });
});
