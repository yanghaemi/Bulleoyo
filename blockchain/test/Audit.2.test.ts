/**
 * Audit.2 — contract-auditor 라운드 1 · **Phase B 재현 테스트** (2026-09-07)
 *
 * 여기 있는 테스트는 **공연이 온체인에 실재해야** 판정할 수 있다.
 * 2026-09-07 현재 `RevenueSplitter.createShow` 는 `revert NotImplemented()` 로 끝나므로
 * 이 파일은 **전부 실패한다.** 그것이 정상이다 — 실패 메시지가 곧 발견 목록이다.
 *
 * Phase B(본문 구현)가 끝나면 이 파일은 초록이어야 한다. 초록이 되지 않으면
 * 그 발견이 아직 살아 있다는 뜻이다. 감사자는 이 파일을 지우지 말라고 요청한다.
 *
 * 실행: cd blockchain && npx hardhat test test/Audit.2.test.ts
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
const PRICE = 20_000n; // 티켓 1매 20,000 YoYo (요구사항 §7.3 예시)

/**
 * 3팀 공연을 판매 개시 상태(LOCKED_RULES)까지 세운다.
 * Phase B 미구현이면 여기서 명시적으로 실패한다 — 어떤 발견 때문에 못 도는지 남긴다.
 */
async function onSaleShow(findingId: string) {
  const { ethers } = await network.connect();
  const [admin, operator, minter, host, teamB, teamC, alice, bob, attacker] =
    await ethers.getSigners();

  const yoyo = await ethers.deployContract("YoYo", [admin.address, minter.address]);
  const splitter = await ethers.deployContract("RevenueSplitter", [
    admin.address, operator.address, await yoyo.getAddress(),
  ]);
  const S = await splitter.getAddress();

  for (const [w, amt] of [[host, 1_000_000n], [alice, 1_000_000n], [bob, 1_000_000n], [attacker, 1_000_000n]] as const) {
    await yoyo.connect(minter).mint(w.address, amt, id("seed:" + w.address));
  }

  const teams = [host.address, teamB.address, teamC.address];
  const create = (splitter.connect(operator) as any).createShow(
    SHOW, teams, 0, RULES, 5000, 5000, [3334, 3333, 3333], DEPOSIT,
  );
  const name = await revertName(create, [splitter.interface]);
  if (name !== "<no revert>") {
    assert.fail(
      `[${findingId}] createShow 가 "${name}" 로 끝나 시나리오를 세울 수 없다. ` +
      "RevenueSplitter 가 스켈레톤인 동안은 이 테스트를 판정할 수 없다 (Phase B 후 재실행).",
    );
  }

  for (const t of [host, teamB, teamC]) await (splitter.connect(t) as any).agreeToRules(SHOW, RULES);
  await yoyo.connect(host).approve(S, DEPOSIT);
  await (splitter.connect(host) as any).deposit(SHOW);
  await (splitter.connect(operator) as any).startSale(SHOW);

  return { ethers, yoyo, splitter, S, admin, operator, minter, host, teamB, teamC, alice, bob, attacker };
}

async function buy(ctx: any, who: any, ref: string, teamIndex: number, quantity: number) {
  const amount = PRICE * BigInt(quantity);
  await ctx.yoyo.connect(who).approve(ctx.S, amount);
  await (ctx.splitter.connect(who) as any).purchase(SHOW, id(ref), teamIndex, amount, quantity);
  return amount;
}

// ===========================================================================
describe("Audit.2-A · [H-02] 부분 환불(취소 수수료) 이력이 있는 주문", () => {
  it("50% 환불 뒤 공연이 취소(halt)되면 나머지 50% 도 환불할 수 있어야 한다", async () => {
    const ctx = await onSaleShow("H-02");
    const { yoyo, splitter, operator, alice } = ctx;
    const ref = id("order-alice-1");

    await buy(ctx, alice, "order-alice-1", 0, 1); // 20,000 결제
    const before = await yoyo.balanceOf(alice.address);

    // D-3 이전 취소 → 50% 환불(취소 수수료 50%)
    await (splitter.connect(operator) as any).refund(SHOW, ref, PRICE / 2n);
    assert.equal(await yoyo.balanceOf(alice.address), before + PRICE / 2n);
    assert.equal(await splitter.escrowOf(SHOW), PRICE / 2n, "취소 수수료 10,000 이 escrow 에 남는다");

    // 이후 공연이 취소된다 → 요구사항 §7.4 "공연 취소는 무수수료 전액 환불"
    await (splitter.connect(operator) as any).halt(SHOW);
    const name = await revertName(
      (splitter.connect(operator) as any).refund(SHOW, ref, PRICE / 2n),
      [splitter.interface],
    );
    assert.equal(
      name, "<no revert>",
      "Purchase 가 bool refunded 만 갖고 있어 첫 환불이 부분이어도 주문 전체가 '환불 완료'로 잠긴다. " +
      "AlreadyRefunded 로 막히면 남은 10,000 은 회수 경로가 전혀 없다 " +
      "(HALTED 에서 release 는 ShowHalted 로 영구 차단) → 자금 영구 잠김. " +
      "수정: Purchase.refunded(bool) → refundedAmount(uint256). purchaseOf 반환 튜플이 바뀌므로 9/9 이전에 결정해야 한다.",
    );
    assert.equal(await splitter.escrowOf(SHOW), 0n, "halt 후 전 건 환불하면 escrow 는 0 이어야 한다");
  });

  it("부분 환불은 카운터를 한 번만 내린다 (2회 환불해도 -quantity 는 1회)", async () => {
    const ctx = await onSaleShow("H-02");
    const { splitter, operator } = ctx;
    const ref = id("order-alice-1");

    await buy(ctx, ctx.alice, "order-alice-1", 0, 2); // 2매 = 2표
    assert.equal(await splitter.choiceCountOf(SHOW, 0), 2n);

    await (splitter.connect(operator) as any).refund(SHOW, ref, PRICE); // 절반 금액
    assert.equal(await splitter.choiceCountOf(SHOW, 0), 0n, "표는 반쪽이 없다 — 전량 차감");

    await (splitter.connect(operator) as any).halt(SHOW);
    await (splitter.connect(operator) as any).refund(SHOW, ref, PRICE); // 나머지
    assert.equal(
      await splitter.choiceCountOf(SHOW, 0), 0n,
      "잔액 환불이 카운터를 또 내리면 underflow 로 revert 하거나 카운터가 오염된다. " +
      "Refunded 이벤트의 quantity 도 2회차에는 0 이어야 서버가 이벤트만으로 카운터를 복원할 수 있다.",
    );
  });
});

// ===========================================================================
describe("Audit.2-B · [H-03] purchase 의 amount ↔ quantity 결속 부재", () => {
  it("1 YoYo 로 65,535 표를 살 수 없어야 한다", async () => {
    const ctx = await onSaleShow("H-03");
    const { yoyo, splitter, S, attacker } = ctx;

    await yoyo.connect(attacker).approve(S, 1n);
    const name = await revertName(
      (splitter.connect(attacker) as any).purchase(SHOW, id("bogus-order"), 1, 1n, 65535),
      [splitter.interface],
    );
    assert.equal(
      name, "QuantityLimitExceeded",
      "purchase 가 amount 와 quantity 의 관계를 보지 않는다. 관객이 자기 KAIA 로 대납 경로를 " +
      "거치지 않고 직접 tx 를 보내면 1 YoYo 로 팀 B 의 choiceCount 를 65,535 올릴 수 있다. " +
      "채택된 수정은 MAX_QUANTITY_PER_ORDER = 4 상한(감사 라운드 1 H-03 → 라운드 2 확인).",
    );
    assert.equal(await splitter.choiceCountOf(SHOW, 1), 0n);
  });

  it("[라운드 2 잔존] 상한 4 는 피해 상한일 뿐 — amount = 1 · quantity = 4 는 여전히 통과한다", async () => {
    const ctx = await onSaleShow("H-03");
    const { yoyo, splitter, S, attacker } = ctx;
    await yoyo.connect(attacker).approve(S, 1n);
    // 이것이 revert 하지 않는 것은 **알려진 한계**다(문서 §4.1 "완전 차단이 아니라 피해 상한").
    // 여기서 고정하는 것은 "왜곡 폭이 4 를 넘지 않는다"는 상한 자체다.
    await (splitter.connect(attacker) as any).purchase(SHOW, id("cheap-4"), 1, 1n, 4);
    assert.equal(await splitter.choiceCountOf(SHOW, 1), 4n, "1 YoYo 로 4 표. 이것이 남는 왜곡 상한이다");
  });

  it("[H-03 잔존] 서버가 모르는 orderRef 로 들어온 결제를 문서 §4.8 절차로 되돌릴 수 있다", async () => {
    // 라운드 2 갱신 — 라운드 1은 "purchase 가 막혀야 한다"를 기대했다. 리더 지시대로 완전 차단은
    // 포기했으므로(문서 §4.1), 이제 검증 대상은 **복구 절차가 실제로 실행되는가**다.
    const ctx = await onSaleShow("H-03");
    const { yoyo, splitter, S, operator, attacker } = ctx;

    const before = await splitter.escrowOf(SHOW);
    await yoyo.connect(attacker).approve(S, 7n);
    await (splitter.connect(attacker) as any).purchase(SHOW, id("not-in-db"), 0, 7n, 1);
    assert.equal(await splitter.escrowOf(SHOW), before + 7n, "서버 DB 에 없는 7 YoYo 가 escrow 에 들어온다");

    // §4.8 3단계 — OPERATOR 가 Purchased 이벤트의 orderRef 로 전액 환불한다.
    const balBefore = await yoyo.balanceOf(attacker.address);
    await (splitter.connect(operator) as any).refund(SHOW, id("not-in-db"), 7n);

    assert.equal(await splitter.escrowOf(SHOW), before, "복구 후 escrow 가 원래대로 돌아오지 않았다");
    assert.equal(await splitter.choiceCountOf(SHOW, 0), 0n, "복구 후 카운터가 원래대로 돌아오지 않았다");
    assert.equal(await yoyo.balanceOf(attacker.address), balBefore + 7n, "환불 수신자는 p.buyer 고정이다");
  });
});

// ===========================================================================
// ---------------------------------------------------------------------------
// 라운드 4 재작성 (2026-09-07 · 감사자) — **테스트가 정본에 졌다.**
//
// 라운드 1~3 의 이 케이스는 `rotateOperator(팀 리더 지갑)` 이 revert 하기를 요구했다.
// 그런데 정본(`docs/design/13_컨트랙트_인터페이스_v1.md` §7)의 M-02 판정은
// **"문서로 규율 · 코드·ABI 무관"** 이다. CLAUDE.local.md §0 의 우선순위에서 문서 13 이
// 감사 테스트보다 위이므로, 요구를 유지하면 이 케이스는 **영구 빨강**이 된다(L-06 과 같은 사고).
//
// 판정을 받아들이는 근거 세 가지 —
//  ① 라운드 1 의 피해 주장이 과장이었다. 팀 리더가 OPERATOR 가 돼도 `startSale` 은 여전히
//     `agreedCount == teamWallets.length` 를 요구한다. **다른 팀의 동의를 위조할 수 없다**
//     (EVM 에 대리 서명이 없고 `onlyTeamOf` 는 msg.sender 만 본다).
//     "전원 동의 후 잠금"이라는 신뢰 장치 자체는 살아 있다.
//  ② 온체인 차단의 대가가 이익보다 크다. 전 공연을 순회할 수 없으므로 전역 매핑
//     (`address => 참여 공연 수`)이 필요하고, `createShow` 에 팀 수만큼 SSTORE 가 붙는다.
//     더 나쁜 것은 **감소 경로가 없어 한 번 팀이었던 지갑이 영원히 OPERATOR 가 될 수 없다**는
//     점이다 — 운영 키 회전은 사고 대응 수단인데 그것을 영구히 막는 쪽이 더 위험하다.
//  ③ 실제 자금 피해가 없다. `refund` 수신자는 `p.buyer` 고정, `release` 는 잠긴 규칙대로,
//     `aggregate` 는 `AggregateMismatch` 로 서버 카운트와 대조된다. 그 팀이 추가로 얻는 것은
//     "정산을 지연·중단(halt)시킬 수 있다"는 가용성 권한뿐이다.
//
// 그래서 **요구를 버리고, 그 판정이 실제로 약속하는 것들을 고정한다.**
// 판정이 뒤집혀 온체인 차단이 들어와도 ①②는 그대로 참이므로 이 케이스는 그때도 초록이다.
// ---------------------------------------------------------------------------
describe("Audit.2-C · [M-02·판정] rotateOperator 역방향 — 문서로 규율한다", () => {
  it("팀 리더가 OPERATOR 가 되어도 다른 팀의 동의를 위조할 수 없다 (신뢰 장치의 실체)", async () => {
    const { ethers } = await network.connect();
    const [admin, operator, minter, host, teamB, teamC] = await ethers.getSigners();
    const yoyo = await ethers.deployContract("YoYo", [admin.address, minter.address]);
    const splitter = await ethers.deployContract("RevenueSplitter", [
      admin.address, operator.address, await yoyo.getAddress(),
    ]);
    const i = [splitter.interface];
    const teams = [host.address, teamB.address, teamC.address];

    const created = await revertName(
      (splitter.connect(operator) as any).createShow(SHOW, teams, 0, RULES, 5000, 5000, [3334, 3333, 3333], DEPOSIT),
      i,
    );
    if (created !== "<no revert>") assert.fail(`[M-02] createShow 가 "${created}" — 재실행 필요.`);

    // ① 문서 판정대로 통과한다. 통과 자체를 고정해 두어야 "언제 막히기 시작했나"를 알 수 있다.
    const rotate = await (splitter.connect(admin) as any).rotateOperator(teamB.address);
    const rc = await rotate.wait();

    // ② 경고 이벤트가 실제로 나간다 — 문서 규율의 유일한 온체인 훅이다.
    //    서버·모니터링이 이걸 못 보면 "문서로 규율"은 규율이 아니라 희망이다.
    const rotated = rc.logs
      .map((l: any) => { try { return splitter.interface.parseLog(l); } catch { return null; } })
      .find((p: any) => p?.name === "OperatorRotated");
    assert.ok(rotated, "OperatorRotated 이벤트가 없다 — 팀 지갑이 OPERATOR 가 된 사건을 감지할 방법이 사라진다");
    assert.equal(rotated.args[0], operator.address, "previousOperator 가 틀리다");
    assert.equal(rotated.args[1], teamB.address, "newOperator 가 틀리다");

    // ③ 권한이 겹치지 않는다 — 이전 OPERATOR 는 즉시 권한을 잃는다(운영자 2명 상태가 없다).
    assert.equal(await splitter.operator(), teamB.address);
    assert.equal(
      await revertName(() => (splitter.connect(operator) as any).startSale(SHOW), i),
      "NotOperator",
      "이전 OPERATOR 가 권한을 유지하면 rotate 가 교체가 아니라 추가가 된다",
    );

    // ④ **핵심** — teamB 는 이제 팀이자 운영자지만, 나머지 두 팀의 동의를 만들어낼 수 없다.
    //    이것이 M-02 를 '문서로 규율'해도 되는 이유다.
    await (splitter.connect(teamB) as any).agreeToRules(SHOW, RULES);
    assert.equal(Number(await splitter.agreedCountOf(SHOW)), 1);
    assert.equal(
      await revertName(() => (splitter.connect(teamB) as any).startSale(SHOW), i),
      "NotAllAgreed",
      "팀 리더 겸 OPERATOR 가 단독으로 판매를 열 수 있다면 그때는 온체인 차단이 필요하다 " +
      "— M-02 판정(문서로 규율)의 전제가 무너진 것이다",
    );
    assert.equal(await splitter.agreedOf(SHOW, host.address), false, "동의가 위조됐다");
    assert.equal(await splitter.agreedOf(SHOW, teamC.address), false, "동의가 위조됐다");

    // ⑤ 반대 방향(현재 OPERATOR 를 팀으로 등록)은 여전히 온체인에서 막힌다.
    //    M-02 가 열려 있어도 이 짝은 닫혀 있다는 것을 같이 고정한다.
    assert.equal(
      await revertName(
        () => (splitter.connect(teamB) as any).createShow(
          2n, [host.address, teamB.address, teamC.address], 0, RULES, 5000, 5000, [3334, 3333, 3333], DEPOSIT,
        ),
        i,
      ),
      "ReservedAddress",
      "createShow 의 _validateTeamWallets 스냅샷 검사가 사라졌다 — M-02 의 정방향까지 열리면 판정 전제가 바뀐다",
    );
  });

  it("[M-02·규율] 문서 13 이 이 위험을 경고하고 있다 (판정의 산출물은 코드가 아니라 문서다)", () => {
    const doc = readFileSync("../docs/design/13_컨트랙트_인터페이스_v1.md", "utf8");
    // 절 번호에 묶지 않는다 — 문서가 재편되면 절 슬라이스는 깨지지만 경고는 남는다.
    const near = doc.split(/\r?\n/).filter((l) => /rotateOperator/.test(l)).join("\n");
    assert.ok(near.length > 0, "문서에 rotateOperator 언급이 아예 없다");
    assert.ok(
      /팀|team/i.test(near),
      "문서 13 이 rotateOperator 를 설명하면서 '팀 리더 지갑을 넣지 말 것'을 어디에도 적지 않았다. " +
      "M-02 판정은 '문서로 규율'이므로 그 문서가 곧 통제 수단이다 — 없으면 판정이 이행되지 않은 것이다.",
    );
  });
});

// ===========================================================================
describe("Audit.2-D · [M-03] updateRules 의 동의 리셋 (프로토타입 H-01 epoch 문제)", () => {
  it("규칙을 바꾸면 이미 동의한 팀도 다시 동의할 수 있어야 한다", async () => {
    const { ethers } = await network.connect();
    const [admin, operator, minter, host, teamB, teamC] = await ethers.getSigners();
    const yoyo = await ethers.deployContract("YoYo", [admin.address, minter.address]);
    const splitter = await ethers.deployContract("RevenueSplitter", [
      admin.address, operator.address, await yoyo.getAddress(),
    ]);
    const teams = [host.address, teamB.address, teamC.address];

    const created = await revertName(
      (splitter.connect(operator) as any).createShow(SHOW, teams, 0, RULES, 5000, 5000, [3334, 3333, 3333], DEPOSIT),
      [splitter.interface],
    );
    if (created !== "<no revert>") {
      assert.fail(`[M-03] createShow 가 "${created}" — Phase B 후 재실행.`);
    }

    await (splitter.connect(host) as any).agreeToRules(SHOW, RULES);
    assert.equal(Number(await splitter.agreedCountOf(SHOW)), 1);

    const RULES2 = id("rules-json-v2");
    await (splitter.connect(operator) as any).updateRules(SHOW, RULES2, 6000, 4000, [4000, 3000, 3000]);
    assert.equal(Number(await splitter.agreedCountOf(SHOW)), 0, "agreedCount 가 리셋되지 않았다");
    assert.equal(await splitter.agreedOf(SHOW, host.address), false,
      "agreed 매핑이 리셋되지 않았다. agreedCount 만 0 으로 두면 host 가 재동의할 때 " +
      "AlreadyAgreed 로 막혀 agreedCount 가 다시 3 이 될 수 없다 → startSale 영구 불가(공연 완전 잠김). " +
      "수정안: agreed 를 bool 매핑 대신 `mapping(address => uint32) agreedEpoch` + `uint32 rulesEpoch` 로 " +
      "두면 리셋이 rulesEpoch++ 한 줄이고 절반만 지워지는 사고가 없다. agreedOf 시그니처는 그대로 유지된다.",
    );

    // 전원 재동의 → startSale 이 되어야 한다
    for (const t of [host, teamB, teamC]) await (splitter.connect(t) as any).agreeToRules(SHOW, RULES2);
    assert.equal(Number(await splitter.agreedCountOf(SHOW)), 3);

    // 옛 해시로는 동의할 수 없다.
    // 라운드 3 수정 — 라운드 1·2 는 여기서 `AlreadyAgreed` 를 기대했는데 **테스트가 틀렸다.**
    // agreeToRules 의 검사 순서는 RulesLocked → RulesHashMismatch → AlreadyAgreed 이고
    // (RevenueSplitter.sol:483~486), 옛 해시는 두 번째 검사에서 먼저 걸린다.
    // Phase B 에서 이 줄이 거짓 빨강을 만들 뻔했다.
    assert.equal(
      await revertName((splitter.connect(host) as any).agreeToRules(SHOW, RULES), [splitter.interface]),
      "RulesHashMismatch",
    );
  });
});

// ===========================================================================
describe("Audit.2-E · [M-04] HALTED 에서 환불이 안 끝났는데 보증금이 나간다", () => {
  it("HALTED + escrow > 0 이면 returnDeposit 이 막혀야 한다", async () => {
    const ctx = await onSaleShow("M-04");
    const { splitter, operator } = ctx;
    await buy(ctx, ctx.alice, "order-alice-1", 0, 1);
    await (splitter.connect(operator) as any).halt(SHOW);

    assert.ok((await splitter.escrowOf(SHOW)) > 0n);
    const name = await revertName(
      (splitter.connect(operator) as any).returnDeposit(SHOW),
      [splitter.interface],
    );
    assert.notEqual(
      name, "<no revert>",
      "returnDeposit 은 stage 와 deposit > 0 만 본다. 관객 환불(주문별 N건)이 한 건이라도 남았는데 " +
      "보증금 50,000 이 먼저 host 에게 돌아가면, 미환불 관객에 대한 유일한 담보가 사라진다. " +
      "컨트랙트가 '전 건 환불 완료'를 알 수는 없지만 `escrow == 0` 은 알 수 있다 — " +
      "HALTED 경로에 한해 escrow == 0 을 요구하면 된다(RELEASED 경로는 이미 escrow 0).",
    );
  });
});

// ===========================================================================
describe("Audit.2-F · 자금 보존 불변식 (구현 후 반드시 초록이어야 함)", () => {
  it("모든 함수 뒤에 balanceOf(splitter) == escrowOf + depositOf 가 성립한다", async () => {
    const ctx = await onSaleShow("INV");
    const { yoyo, splitter, S, operator, host, teamB, teamC } = ctx;
    const check = async (label: string) => {
      const bal = await yoyo.balanceOf(S);
      const led = (await splitter.escrowOf(SHOW)) + (await splitter.depositOf(SHOW));
      assert.equal(bal, led, label + ": balanceOf(this) != escrow + deposit");
    };
    await check("startSale 직후");
    await buy(ctx, ctx.alice, "o1", 0, 3);
    await check("purchase 후");
    await buy(ctx, ctx.bob, "o2", 2, 1);
    await check("purchase 2 후");
    await (splitter.connect(operator) as any).refund(SHOW, id("o2"), PRICE);
    await check("refund 후");

    await (splitter.connect(operator) as any).aggregate(SHOW, 3n);
    await check("aggregate 후");

    // 불변식 3: Σ payout == R, dust 는 host 에게 정확히 1회
    const R = await splitter.escrowOf(SHOW);
    const payouts: bigint[] = [...(await splitter.payoutsOf(SHOW))];
    assert.equal(payouts.reduce((a, b) => a + b, 0n), R, "Σ payout != R (1원 오차 금지)");

    await (splitter.connect(operator) as any).lock(SHOW);
    await check("lock 후");

    const beforeTeams = await Promise.all([host, teamB, teamC].map((t) => yoyo.balanceOf(t.address)));
    await (splitter.connect(operator) as any).release(SHOW);
    assert.equal(await splitter.escrowOf(SHOW), 0n, "release 후 escrow 가 0 이 아니면 잔액이 영구 잠긴다");
    await check("release 후");
    const afterTeams = await Promise.all([host, teamB, teamC].map((t) => yoyo.balanceOf(t.address)));
    for (let i = 0; i < 3; i++) {
      assert.equal(afterTeams[i] - beforeTeams[i], payouts[i], `팀 ${i} 수령액 != payout[${i}]`);
    }

    await (splitter.connect(operator) as any).returnDeposit(SHOW);
    assert.equal(await splitter.depositOf(SHOW), 0n);
    await check("returnDeposit 후");
    assert.equal(await yoyo.balanceOf(S), 0n, "정산이 끝나면 컨트랙트 잔액은 0 이다");
  });

  it("[H-04·신규] aggregate 는 서버가 넘긴 validTicketCount 와 온체인 T 가 다르면 거부해야 한다", async () => {
    // 라운드 2 신규 H-04. §4.8 복구 절차의 전제("집계 확정 **전에** 대사를 돌린다")에 경주 구간이 있다.
    // 서버가 대사를 끝낸 블록과 aggregate 가 채굴되는 블록 사이에 판매가 계속 열려 있으므로,
    // 그 사이에 들어온 결제 한 건이 카운터를 오염시킨 채 **동결**된다. AGGREGATED 이후에는
    // refund 가 막혀(위 케이스) 되돌릴 수단이 없고, payout 이 틀린 채 lock → release 로 간다.
    // 컨트랙트는 이미 validTicketCount 를 인자로 받고 있으면서 대조에 쓰지 않는다(스냅샷 저장만).
    // 라운드 3 강화 — 라운드 2 는 "무엇이든 revert 하면 통과"였다. 리더 확인 항목이
    // ① error 이름이 AggregateMismatch 인가 ② **실패해도 stage 가 안 바뀌는가**
    // ③ 그래서 문서 §4.8 복구 절차가 실제로 끝까지 도는가 이므로 셋 다 고정한다.
    const ctx = await onSaleShow("H-04");
    const { splitter, operator } = ctx;
    const i = [splitter.interface];
    await buy(ctx, ctx.alice, "o1", 0, 1); // 서버가 대사한 시점: T = 1

    // 대사 이후 aggregate 이전에 들어온 결제 — 서버는 이 건을 모른다.
    await buy(ctx, ctx.attacker, "race", 1, 4);

    // ① 거부되고, error 이름이 서버 매핑 표(§4.6)의 그것이어야 한다.
    assert.equal(
      await revertName((splitter.connect(operator) as any).aggregate(SHOW, 1n), i),
      "AggregateMismatch",
      "aggregate 가 validTicketCount(1) != totalChoicesOf(5) 를 보고도 그대로 확정했다. " +
      "이 시점부터 refund 가 막히므로 오염된 카운터가 영구 고정되고 분배액이 틀린 채 release 된다.",
    );

    // ② stage 가 그대로여야 한다. 이것이 §4.8 이 실행 가능하다는 것의 전부다.
    assert.equal(Number(await splitter.stageOf(SHOW)), 2, "실패한 aggregate 가 stage 를 움직였다 — 복구 불가");
    assert.equal(await splitter.validTicketCountOf(SHOW), 0n, "거부된 호출이 스냅샷을 남겼다");

    // ③ 문서 §4.8 복구 절차를 끝까지 돌린다 — 왜곡 주문을 환불하고 다시 집계한다.
    //    refund 는 LOCKED_RULES 에서 허용되고, 수신자는 p.buyer 로 고정이라 탈취 경로가 아니다.
    const [, , raceAmount] = await splitter.purchaseOf(SHOW, id("race"));
    await (splitter.connect(operator) as any).refund(SHOW, id("race"), raceAmount);
    assert.equal(await splitter.totalChoicesOf(SHOW), 1n, "환불이 표를 전량 되돌리지 않았다");
    assert.equal(
      await revertName((splitter.connect(operator) as any).aggregate(SHOW, 1n), i),
      "<no revert>",
      "복구 후 재집계가 통과하지 않으면 §4.8 은 종이 위 절차일 뿐이다",
    );
    assert.equal(Number(await splitter.stageOf(SHOW)), 3, "AGGREGATED(3) 여야 한다");
  });

  it("[H-04·검사 위치] HALTED·이미 집계된 공연에서는 대사 불일치보다 stage error 가 먼저 나간다", async () => {
    // 엔지니어가 대조를 "본문 맨 앞"이 아니라 showExists·ShowHalted·InvalidStage **뒤**에 뒀다.
    // 근거는 "맨 앞이면 HALTED 공연에서 ShowHalted 대신 AggregateMismatch 가 나가 서버가 오진한다".
    // 그 우선순위를 고정한다 — 카운터가 실제로 어긋난 상태에서 확인해야 의미가 있다.
    const ctx = await onSaleShow("H-04");
    const { splitter, operator } = ctx;
    const i = [splitter.interface];
    await buy(ctx, ctx.alice, "o1", 0, 2); // T = 2

    await (splitter.connect(operator) as any).halt(SHOW);
    assert.equal(
      await revertName((splitter.connect(operator) as any).aggregate(SHOW, 999n), i),
      "ShowHalted",
      "HALTED 공연인데 AggregateMismatch 가 나가면 서버가 '대사만 다시 하면 된다'로 오진한다 — " +
      "실제로는 이 공연의 집계 경로가 영구히 닫혀 있다",
    );
    // 미등록 공연도 마찬가지 — showExists 가 먼저다.
    assert.equal(
      await revertName((splitter.connect(operator) as any).aggregate(12345n, 999n), i),
      "ShowNotFound",
    );
  });

  it("aggregate 이후 purchase·refund 가 카운터를 바꿀 수 없다", async () => {
    const ctx = await onSaleShow("INV");
    const { splitter, operator } = ctx;
    await buy(ctx, ctx.alice, "o1", 0, 1);
    await (splitter.connect(operator) as any).aggregate(SHOW, 1n);
    const i = [splitter.interface];
    assert.equal(await revertName(() => buy(ctx, ctx.bob, "o2", 1, 1), i), "SaleNotStarted");
    assert.equal(
      await revertName((splitter.connect(operator) as any).refund(SHOW, id("o1"), PRICE), i),
      "InvalidStage",
    );
  });

  it("HALTED 는 종단 — aggregate·lock·release·startSale·updateRules 가 전부 막힌다", async () => {
    const ctx = await onSaleShow("INV");
    const { splitter, operator } = ctx;
    await (splitter.connect(operator) as any).halt(SHOW);
    const op = splitter.connect(operator) as any;
    const i = [splitter.interface];
    assert.equal(await revertName(() => op.aggregate(SHOW, 0n), i), "ShowHalted");
    assert.equal(await revertName(() => op.lock(SHOW), i), "ShowHalted");
    assert.equal(await revertName(() => op.release(SHOW), i), "ShowHalted");
    assert.equal(await revertName(() => op.halt(SHOW), i), "ShowHalted");
    assert.equal(await revertName(() => op.startSale(SHOW), i), "InvalidStage");
    assert.equal(await revertName(() => op.updateRules(SHOW, RULES, 5000, 5000, [3334, 3333, 3333]), i), "RulesLocked");
  });

  it("RELEASED 이후에는 halt 할 수 없다", async () => {
    const ctx = await onSaleShow("INV");
    const { splitter, operator } = ctx;
    await buy(ctx, ctx.alice, "o1", 0, 1);
    await (splitter.connect(operator) as any).aggregate(SHOW, 1n);
    await (splitter.connect(operator) as any).lock(SHOW);
    await (splitter.connect(operator) as any).release(SHOW);
    assert.equal(
      await revertName((splitter.connect(operator) as any).halt(SHOW), [splitter.interface]),
      "InvalidStage",
    );
  });

  it("startSale 이후 규칙을 바꾸는 경로가 전부 막힌다 (updateRules·agreeToRules·deposit)", async () => {
    const ctx = await onSaleShow("INV");
    const { splitter, operator, host } = ctx;
    const i = [splitter.interface];
    assert.equal(
      await revertName(() => (splitter.connect(operator) as any).updateRules(SHOW, id("x"), 5000, 5000, [3334, 3333, 3333]), i),
      "RulesLocked",
    );
    assert.equal(await revertName(() => (splitter.connect(host) as any).agreeToRules(SHOW, RULES), i), "RulesLocked");
    assert.equal(await revertName(() => (splitter.connect(host) as any).deposit(SHOW), i), "InvalidStage");
  });

  it("[대납 특수] 같은 결제를 서버가 두 번 전송해도 두 번째는 온체인이 막는다", async () => {
    const ctx = await onSaleShow("INV");
    const { yoyo, splitter, S, alice } = ctx;
    await buy(ctx, alice, "o1", 0, 1);
    await yoyo.connect(alice).approve(S, PRICE);
    assert.equal(
      await revertName(
        (splitter.connect(alice) as any).purchase(SHOW, id("o1"), 0, PRICE, 1),
        [splitter.interface],
      ),
      "AlreadyPurchased",
    );
  });

  it("[대납 특수] OPERATOR 는 관객·팀 대신 서명할 수 없다", async () => {
    const ctx = await onSaleShow("INV");
    const { splitter, operator } = ctx;
    const i = [splitter.interface];
    assert.equal(
      await revertName(() => (splitter.connect(operator) as any).agreeToRules(SHOW, RULES), i),
      "NotTeam",
    );
    assert.equal(await revertName(() => (splitter.connect(operator) as any).deposit(SHOW), i), "NotHost");
  });
});

// ===========================================================================
// Audit.2-G · [M-06] rulesEpoch 초기화 — 감사 라운드 3 (2026-09-07)
//
// M-03 수정으로 동의 판정이 `agreedEpoch[w] == rulesEpoch` 판본 비교가 됐다.
// 그런데 **`s.rulesEpoch = 1` 초기화는 `createShow` 의 TODO 주석에만 있다**
// (RevenueSplitter.sol:441~442). 실코드가 아니다.
//
// Phase B 에서 이 한 줄을 빠뜨리면 `rulesEpoch == 0` 이고 모든 지갑의
// `agreedEpoch` 기본값도 0 이라 `agreeToRules` 가 **전원에게** `AlreadyAgreed()` 를 던진다.
// → `agreedCount` 가 영원히 0 → `startSale` 영구 불가 → 그 공연은 판매를 열 수 없다.
//
// 더 나쁜 것은 신호가 서로 모순된다는 점이다 — `agreedOf` 에는 `rulesEpoch != 0` 가드가
// 있어서 `false`(미동의)를 돌려주는데 tx 는 `AlreadyAgreed`(이미 동의) 로 죽는다.
// 서버는 `AlreadyAgreed` 를 `COMMON_CONFLICT`(= 이미 처리됨)로 매핑하므로(문서 §4.6)
// **재시도하지 않고 조용히 성공으로 넘어간다.** 사고가 startSale 시점까지 숨는다.
//
// 참고 — 엔지니어의 코드 주석(:442)은 이 상황을 "전원이 동의한 것으로 읽힌다"고 적었다.
// 실제 방향은 반대다(전원이 동의 불가). 어느 쪽이든 고칠 곳은 같지만, 주석을 읽고
// "agreedOf 에 가드가 있으니 괜찮다"고 판단하면 초기화를 빠뜨린다.
// ===========================================================================
describe("Audit.2-G · [M-06] createShow 의 rulesEpoch = 1 초기화 (라운드 3 신규)", () => {
  it("createShow 직후 팀 전원이 동의할 수 있고 startSale 까지 도달한다 (rulesEpoch 가 0 이면 전원 AlreadyAgreed)", async () => {
    const { ethers } = await network.connect();
    const [admin, operator, minter, host, teamB, teamC, outsider] = await ethers.getSigners();
    const yoyo = await ethers.deployContract("YoYo", [admin.address, minter.address]);
    const splitter = await ethers.deployContract("RevenueSplitter", [
      admin.address, operator.address, await yoyo.getAddress(),
    ]);
    const S = await splitter.getAddress();
    const teams = [host.address, teamB.address, teamC.address];

    const created = await revertName(
      (splitter.connect(operator) as any).createShow(SHOW, teams, 0, RULES, 5000, 5000, [3334, 3333, 3333], DEPOSIT),
      [splitter.interface],
    );
    if (created !== "<no revert>") {
      assert.fail(`[M-06] createShow 가 "${created}" — Phase B 후 재실행.`);
    }

    // ① 생성 직후에는 아무도 동의하지 않은 상태여야 한다 (판본 0 이면 이 값이 흔들린다).
    assert.equal(await splitter.agreedOf(SHOW, host.address), false);
    assert.equal(await splitter.agreedOf(SHOW, outsider.address), false, "팀도 아닌 지갑이 동의로 읽힌다");
    assert.equal(Number(await splitter.agreedCountOf(SHOW)), 0);

    // ② 각 팀의 첫 동의가 AlreadyAgreed 로 막히면 안 된다 — 이것이 rulesEpoch = 1 의 존재 이유다.
    for (const t of [host, teamB, teamC]) {
      const n = await revertName((splitter.connect(t) as any).agreeToRules(SHOW, RULES), [splitter.interface]);
      assert.equal(
        n, "<no revert>",
        `${t.address} 의 첫 동의가 "${n}" 로 막혔다. AlreadyAgreed 라면 createShow 가 ` +
        "`s.rulesEpoch = 1` 을 심지 않은 것이다 — agreedEpoch 기본값 0 과 판본 0 이 같아진다. " +
        "이 공연은 agreedCount 가 팀 수에 도달할 수 없어 startSale 을 영구히 못 한다. " +
        "복구 경로가 하나 있긴 하다(updateRules 를 한 번 불러 ++rulesEpoch 로 1 을 만드는 것) — " +
        "그러나 그것은 우연이지 설계가 아니고, 서버는 AlreadyAgreed 를 COMMON_CONFLICT 로 " +
        "삼켜서 사고를 startSale 실패 시점까지 숨긴다.",
      );
    }
    assert.equal(Number(await splitter.agreedCountOf(SHOW)), 3);
    assert.equal(await splitter.agreedOf(SHOW, host.address), true);

    // ③ 실제로 판매가 열려야 한다 (이것이 잠김/안 잠김의 최종 판정).
    await yoyo.connect(minter).mint(host.address, DEPOSIT, id("seed:m06:" + host.address));
    await yoyo.connect(host).approve(S, DEPOSIT);
    await (splitter.connect(host) as any).deposit(SHOW);
    assert.equal(
      await revertName((splitter.connect(operator) as any).startSale(SHOW), [splitter.interface]),
      "<no revert>",
      "전원 동의·보증금 납부에도 startSale 이 열리지 않는다",
    );
    assert.equal(Number(await splitter.stageOf(SHOW)), 2, "LOCKED_RULES(2) 여야 한다");
  });

  it("updateRules 의 ++rulesEpoch 는 checked 산술이어야 한다 (unchecked 로 감싸면 판본 0 으로 되돌아온다)", async () => {
    // uint32 오버플로 자체는 도달 불가에 가깝다 — updateRules 는 CREATED 단계에서만 열리고
    // 42억 회 호출이 필요하다. 위험한 것은 **Phase B 에서 가스를 아끼려고 `unchecked { ++s.rulesEpoch; }`
    // 로 감싸는 것**이다. 그러면 랩어라운드로 판본이 0 이 되어 위 ①②의 잠김이 되살아난다.
    // 소스를 직접 읽어 고정한다 — 런타임으로는 42억 회를 돌 수 없다.
    //
    // 라운드 4 보완 — 이 케이스는 **소스를 문자열로 읽는다.** 그래서 두 번 좁혔다:
    //   ① 주석을 먼저 제거한다. 라운드 3 판본은 주석에 그 키워드가 들어 있다는 이유만으로
    //      빨개졌다(엔지니어 보고서 §3.5 — 로직이 아니라 문구가 테스트를 깼다).
    //   ② 함수 전체가 아니라 **`rulesEpoch` 증가를 감싸는 블록**만 본다. 무관한 최적화
    //      (예: 루프 인덱스 증가)를 막지 않기 위해서다. 검사의 목적은 판본 랩어라운드 하나다.
    const src = readFileSync("contracts/RevenueSplitter.sol", "utf8");
    const from = src.indexOf("function updateRules");
    assert.notEqual(from, -1, "updateRules 를 찾지 못했다");
    const raw = src.slice(from, src.indexOf("function agreeToRules", from));
    const body = raw
      .replace(/\/\*[\s\S]*?\*\//g, " ")   // 블록 주석
      .replace(/\/\/[^\n]*/g, " ");        // 줄 주석
    // `unchecked { … rulesEpoch … }` 형태만 잡는다.
    const bad = /unchecked\s*\{[^}]*rulesEpoch[^}]*\}/.test(body);
    assert.ok(
      !bad,
      "`++s.rulesEpoch` 가 unchecked 블록 안으로 들어갔다. uint32 랩어라운드로 판본이 0 이 되면 " +
      "전원 동의 불가 상태(M-06)가 되살아난다. 가스 절약분(수십 gas)보다 잃는 것이 크다.",
    );
    // 증가 자체가 사라지지 않았는지도 같이 본다 — 위 정규식만 두면 `++s.rulesEpoch` 를
    // 통째로 지운 변경이 조용히 통과한다(Audit.2-D 가 잡지만 여기서도 명시한다).
    assert.ok(/\+\+\s*s\.rulesEpoch|s\.rulesEpoch\s*\+=/.test(body), "updateRules 가 판본을 올리지 않는다");
  });
});
