/**
 * Settlement.calc — **정산 재계산 3자 패리티** (contract-dev §5 테스트 축 (e))
 *
 * `test/calcSpec.ts`(bigint 참조 구현)와 온체인 `RevenueSplitter`가 **1원도 다르지 않다**는 것을
 * 벡터 6개로 고정한다. 서버(Java `SettlementCalculator`)와 검증 페이지(브라우저 TS)는 같은
 * `calcSpec.ts`를 이식해 같은 벡터를 통과시킨다 — 그래서 이 파일이 초록이면 셋이 맞는다.
 *
 * 한 벡터마다 확인하는 것 6가지:
 *   ① 시나리오(purchase·refund)가 실제로 그 R·카운터를 만드는가 — 벡터가 종이 위 숫자가 아님
 *   ② 참조 구현 == 손으로 검산한 기대값
 *   ③ 온체인 `payoutsOf` == 참조 구현
 *   ④ `Aggregated`·`PayoutAssigned` 이벤트만으로 같은 값이 복원되는가(검증 페이지의 입력)
 *   ⑤ `release`가 실제로 그 금액을 팀 지갑에 넣는가 + `escrowOf == 0`
 *   ⑥ 전 단계에서 `balanceOf(splitter) == escrowOf + depositOf`
 *
 * 실행: cd blockchain && npx hardhat test test/Settlement.calc.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { id } from "ethers";
import { BP, MAX_TEAMS, VECTORS, computeSettlement, type SettlementVector } from "./calcSpec.js";

const SHOW = 1n;
const DEPOSIT = 50_000n;
const RULES = id("rules-json-v1");

/** 한 벡터의 R·카운터를 실제로 만들어 내는 온체인 시나리오. */
interface Order {
  ref: string;
  buyer: 0 | 1; // buyers 배열 인덱스
  teamIndex: number;
  quantity: number; // 1..4 (MAX_QUANTITY_PER_ORDER)
  amount: bigint;
}
interface Plan {
  orders: Order[];
  refunds: { ref: string; amount: bigint }[];
}

/** `quantity <= 4` 제약 아래서 총 `count` 표를 만드는 주문 목록. */
function ordersFor(teamIndex: number, count: number, unitPrice: bigint, tag: string): Order[] {
  const out: Order[] = [];
  let left = count;
  let k = 0;
  while (left > 0) {
    const q = Math.min(4, left);
    out.push({
      ref: `${tag}-t${teamIndex}-${k}`,
      buyer: (k % 2) as 0 | 1,
      teamIndex,
      quantity: q,
      amount: unitPrice * BigInt(q),
    });
    left -= q;
    k++;
  }
  return out;
}

/**
 * 벡터별 시나리오. **여기 있는 금액의 합이 벡터의 `distributable`과 같아야 한다** —
 * 아래 `it`이 `escrowOf`로 그것을 먼저 확인하고, 어긋나면 계산을 보기 전에 실패한다.
 */
const PLANS: Record<string, Plan> = {
  // 100매 × 20,000 = 2,000,000. 요구사항 §7.3 예시 그대로.
  "V1-요구사항-§7.3-예시": {
    orders: [
      ...ordersFor(0, 50, 20_000n, "v1"),
      ...ordersFor(1, 30, 20_000n, "v1"),
      ...ordersFor(2, 20, 20_000n, "v1"),
    ],
    refunds: [],
  },
  // 7 + 13 + 3 = 23표를 7건으로. 앞 6건 100,000 + 마지막 400,001 = 1,000,001.
  "V2-나누어떨어지지-않음": {
    orders: [
      { ref: "v2-a", buyer: 0, teamIndex: 0, quantity: 4, amount: 100_000n },
      { ref: "v2-b", buyer: 1, teamIndex: 0, quantity: 3, amount: 100_000n },
      { ref: "v2-c", buyer: 0, teamIndex: 1, quantity: 4, amount: 100_000n },
      { ref: "v2-d", buyer: 1, teamIndex: 1, quantity: 4, amount: 100_000n },
      { ref: "v2-e", buyer: 0, teamIndex: 1, quantity: 4, amount: 100_000n },
      { ref: "v2-f", buyer: 1, teamIndex: 1, quantity: 1, amount: 100_000n },
      { ref: "v2-g", buyer: 0, teamIndex: 2, quantity: 3, amount: 400_001n },
    ],
    refunds: [],
  },
  // 300,001 결제 → 150,000 부분 환불 → R 150,001 · 표는 첫 환불에서 전량 빠져 T = 0.
  "V3-T=0-부분환불-후": {
    orders: [
      { ref: "v3-a", buyer: 0, teamIndex: 0, quantity: 2, amount: 200_000n },
      { ref: "v3-b", buyer: 1, teamIndex: 1, quantity: 1, amount: 100_001n },
    ],
    refunds: [
      { ref: "v3-a", amount: 100_000n },
      { ref: "v3-b", amount: 50_000n },
    ],
  },
  "V4-1팀-경계": {
    orders: [{ ref: "v4-a", buyer: 0, teamIndex: 0, quantity: 2, amount: 100_001n }],
    refunds: [],
  },
  "V5-8팀-극단bp": {
    orders: [
      { ref: "v5-a", buyer: 0, teamIndex: 0, quantity: 3, amount: 500_000n },
      { ref: "v5-b", buyer: 1, teamIndex: 7, quantity: 1, amount: 500_001n },
    ],
    refunds: [],
  },
  "V6-R=0-무매출": { orders: [], refunds: [] },
};

async function setup(vector: SettlementVector) {
  const { ethers } = await network.connect();
  const signers = await ethers.getSigners();
  const [admin, operator, minter] = signers;
  const teamSigners = signers.slice(3, 3 + MAX_TEAMS); // 최대 8팀
  const buyers = [signers[11], signers[12]];

  const yoyo = await ethers.deployContract("YoYo", [admin.address, minter.address]);
  const splitter = await ethers.deployContract("RevenueSplitter", [
    admin.address,
    operator.address,
    await yoyo.getAddress(),
  ]);
  const S = await splitter.getAddress();

  const n = vector.input.teamShareBp.length;
  const teams = teamSigners.slice(0, n);
  const host = teams[vector.input.hostTeamIndex];

  // 보증금 + 결제 재원. 넉넉히 준다 — 잔액 부족은 이 테스트가 보려는 성질이 아니다.
  for (const w of [host, ...buyers]) {
    await yoyo.connect(minter).mint(w.address, 100_000_000n, id("seed:" + w.address + ":" + vector.id));
  }

  await (splitter.connect(operator) as any).createShow(
    SHOW,
    teams.map((t) => t.address),
    vector.input.hostTeamIndex,
    RULES,
    vector.input.fixedRatioBp,
    vector.input.selectionRatioBp,
    vector.input.teamShareBp,
    DEPOSIT,
  );
  for (const t of teams) await (splitter.connect(t) as any).agreeToRules(SHOW, RULES);
  await yoyo.connect(host).approve(S, DEPOSIT);
  await (splitter.connect(host) as any).deposit(SHOW);
  await (splitter.connect(operator) as any).startSale(SHOW);

  const assertLedger = async (where: string) => {
    const bal = await yoyo.balanceOf(S);
    const led = (await splitter.escrowOf(SHOW)) + (await splitter.depositOf(SHOW));
    assert.equal(bal, led, `${vector.id} / ${where}: balanceOf(splitter) != escrowOf + depositOf`);
  };

  return { ethers, yoyo, splitter, S, admin, operator, minter, teams, host, buyers, assertLedger };
}

// ===========================================================================
describe("Settlement.calc-A · 참조 구현(calcSpec.ts) 자체 검산", () => {
  it("6개 벡터 전부 손으로 검산한 기대값과 일치하고 Σpay == R 이다", () => {
    for (const v of VECTORS) {
      const r = computeSettlement(v.input);
      assert.deepEqual(
        r.payout,
        v.expectedPayout,
        `[${v.id}] 참조 구현이 기대값과 다르다. 기대값을 고치기 전에 §7.2 나눗셈 순서를 먼저 의심하라.`,
      );
      assert.equal(r.dust, v.expectedDust, `[${v.id}] dust 불일치`);
      assert.equal(
        r.payout.reduce((a, b) => a + b, 0n),
        v.input.distributable,
        `[${v.id}] Σpay != R — 이 불변식이 깨지면 프로젝트가 무의미하다`,
      );
      assert.ok(r.dust >= 0n, `[${v.id}] dust 가 음수다`);
    }
  });

  it("dust 는 host 에게만, 정확히 1회 더해진다", () => {
    for (const v of VECTORS) {
      const r = computeSettlement(v.input);
      for (let i = 0; i < r.payout.length; i++) {
        const expected = i === v.input.hostTeamIndex ? r.base[i] + r.dust : r.base[i];
        assert.equal(r.payout[i], expected, `[${v.id}] 팀 ${i} 의 dust 처리가 틀렸다`);
      }
    }
  });

  it("나눗셈 순서를 뒤집으면 값이 달라진다 — 이 테스트가 공허하지 않다는 증거", () => {
    // "곱셈 먼저, 나눗셈 나중"이 사양인 이유를 기계로 남긴다. 셋 중 하나만 이 실수를 하면
    // 대사가 깨지므로, **관측 가능한 벡터가 실제로 존재한다**는 것을 여기서 고정한다.
    //
    // V5(fixedRatioBp = 1)의 고정 풀은 100원이다. f_i 를 구할 때
    //   올바름:  (100 × 1250) / 10000 = 12
    //   뒤집음:  (100 / 10000) × 1250 = 0 × 1250 = 0
    // 피제수가 분모(10000)보다 작아지는 순간 뒤집힌 순서는 통째로 0이 된다.
    const v = VECTORS.find((x) => x.id === "V5-8팀-극단bp")!;
    const R = v.input.distributable;
    const fixedPool = (R * v.input.fixedRatioBp) / BP;
    const correct = (fixedPool * v.input.teamShareBp[0]) / BP;
    const wrong = (fixedPool / BP) * v.input.teamShareBp[0];
    assert.notEqual(correct, wrong, "이 벡터로는 순서 오류를 관측할 수 없다 — 벡터를 바꿔야 한다");
    assert.equal(correct, 12n);
    assert.equal(wrong, 0n);
  });

  it("BP · MAX_TEAMS 상수가 컨트랙트와 같다", async () => {
    const { ethers } = await network.connect();
    const [admin, operator, minter] = await ethers.getSigners();
    const yoyo = await ethers.deployContract("YoYo", [admin.address, minter.address]);
    const splitter = await ethers.deployContract("RevenueSplitter", [
      admin.address,
      operator.address,
      await yoyo.getAddress(),
    ]);
    assert.equal(BigInt(await splitter.BP()), BP, "calcSpec.BP != RevenueSplitter.BP");
    assert.equal(Number(await splitter.MAX_TEAMS()), MAX_TEAMS, "calcSpec.MAX_TEAMS != RevenueSplitter.MAX_TEAMS");
  });
});

// ===========================================================================
describe("Settlement.calc-B · 온체인 ↔ calcSpec 패리티 (벡터 6개)", () => {
  for (const vector of VECTORS) {
    it(`${vector.id} — ${vector.why.slice(0, 60)}…`, async () => {
      const plan = PLANS[vector.id];
      assert.ok(plan, `${vector.id} 의 온체인 시나리오(PLANS)가 없다`);

      const ctx = await setup(vector);
      const { yoyo, splitter, S, operator, teams, host, buyers, assertLedger } = ctx;
      await assertLedger("startSale 직후");

      // ── ① 시나리오가 벡터의 R·카운터를 실제로 만든다 ──────────────────────
      for (const o of plan.orders) {
        const who = buyers[o.buyer];
        await yoyo.connect(who).approve(S, o.amount);
        await (splitter.connect(who) as any).purchase(SHOW, id(o.ref), o.teamIndex, o.amount, o.quantity);
      }
      await assertLedger("purchase 전량 후");
      for (const r of plan.refunds) {
        await (splitter.connect(operator) as any).refund(SHOW, id(r.ref), r.amount);
      }
      await assertLedger("refund 후");

      const R = await splitter.escrowOf(SHOW);
      assert.equal(
        R,
        vector.input.distributable,
        `[${vector.id}] 시나리오가 만든 escrow 가 벡터의 R 과 다르다 — PLANS 의 금액 합을 고쳐라`,
      );
      const onchainCounts = [...(await splitter.choiceCountsOf(SHOW))];
      assert.deepEqual(
        onchainCounts,
        vector.input.choiceCount,
        `[${vector.id}] 시나리오가 만든 카운터가 벡터와 다르다`,
      );
      const T = await splitter.totalChoicesOf(SHOW);

      // ── ②③ 참조 구현 → 온체인 확정값 ────────────────────────────────────
      const spec = computeSettlement(vector.input);
      assert.deepEqual(spec.payout, vector.expectedPayout, `[${vector.id}] 참조 구현 회귀`);

      const tx = await (splitter.connect(operator) as any).aggregate(SHOW, T);
      const receipt = await tx.wait();
      await assertLedger("aggregate 후");

      const onchainPayouts = [...(await splitter.payoutsOf(SHOW))];
      assert.deepEqual(
        onchainPayouts,
        spec.payout,
        `[${vector.id}] 온체인 payout != calcSpec. 나눗셈 순서·floor 지점을 §7.2와 대조하라 ` +
          `(R=${R}, T=${T}, spec=${spec.payout}, onchain=${onchainPayouts})`,
      );
      assert.equal(
        onchainPayouts.reduce((a, b) => a + b, 0n),
        R,
        `[${vector.id}] Σ payout != R — 1원 오차 금지(불변식 3)`,
      );

      // ── ④ 이벤트만으로 같은 값이 복원되는가 (검증 페이지의 입력) ─────────
      const parsed = receipt.logs
        .filter((l: any) => l.address === S)
        .map((l: any) => splitter.interface.parseLog(l))
        .filter((l: any) => l !== null);

      const agg = parsed.find((l: any) => l.name === "Aggregated");
      assert.ok(agg, `[${vector.id}] Aggregated 이벤트가 없다`);
      assert.equal(agg.args.totalChoices, T, "Aggregated.totalChoices != totalChoicesOf()");
      assert.equal(agg.args.distributable, R, "Aggregated.distributable != escrowOf()");
      assert.equal(agg.args.dust, spec.dust, `[${vector.id}] Aggregated.dust != calcSpec.dust`);
      assert.equal(agg.args.validTicketCount, T, "Aggregated.validTicketCount 스냅샷 불일치");

      const assigned = parsed.filter((l: any) => l.name === "PayoutAssigned");
      assert.equal(assigned.length, teams.length, `[${vector.id}] PayoutAssigned 가 팀 수만큼 나오지 않았다`);
      const sumFromEvents = assigned.reduce((a: bigint, l: any) => a + l.args.total, 0n);
      assert.equal(sumFromEvents, R, `[${vector.id}] Σ PayoutAssigned.total != R (검증 페이지가 이 합으로 검산한다)`);

      for (const l of assigned) {
        const i = Number(l.args.teamIndex);
        assert.equal(l.args.team, teams[i].address, `PayoutAssigned.team[${i}] 주소 불일치`);
        assert.equal(l.args.fixedPart, spec.fixedPart[i], `[${vector.id}] fixedPart[${i}]`);
        assert.equal(l.args.choicePart, spec.choicePart[i], `[${vector.id}] choicePart[${i}]`);
        assert.equal(
          l.args.dustPart,
          i === vector.input.hostTeamIndex ? spec.dust : 0n,
          `[${vector.id}] dustPart[${i}] — dust 는 host 에게만 붙는다`,
        );
        assert.equal(l.args.total, spec.payout[i], `[${vector.id}] PayoutAssigned.total[${i}]`);
        assert.equal(l.args.fixedPart + l.args.choicePart + l.args.dustPart, l.args.total, "이벤트 내부 합이 안 맞는다");
      }
      // host 의 이벤트는 **루프 뒤에** 나온다 — dust 는 팀별 루프가 끝나야 알 수 있기 때문이다(문서 13 §4.7-6).
      assert.equal(
        Number(assigned[assigned.length - 1].args.teamIndex),
        vector.input.hostTeamIndex,
        `[${vector.id}] host 의 PayoutAssigned 가 마지막이 아니다 — dust 반영 전 값이 실렸을 수 있다`,
      );

      // ── ⑤ release 가 실제로 그 금액을 보낸다 ─────────────────────────────
      await (splitter.connect(operator) as any).lock(SHOW);
      await assertLedger("lock 후");

      const before = await Promise.all(teams.map((t: any) => yoyo.balanceOf(t.address)));
      const rTx = await (splitter.connect(operator) as any).release(SHOW);
      const rReceipt = await rTx.wait();
      const after = await Promise.all(teams.map((t: any) => yoyo.balanceOf(t.address)));

      for (let i = 0; i < teams.length; i++) {
        assert.equal(after[i] - before[i], spec.payout[i], `[${vector.id}] 팀 ${i} 수령액 != payout[${i}]`);
      }
      assert.equal(await splitter.escrowOf(SHOW), 0n, `[${vector.id}] release 후 escrow 가 0 이 아니면 잔액이 영구 잠긴다`);
      await assertLedger("release 후");

      const released = rReceipt.logs
        .filter((l: any) => l.address === S)
        .map((l: any) => splitter.interface.parseLog(l))
        .filter((l: any) => l !== null && l.name === "Released");
      // 0원 팀에는 transfer 도 이벤트도 나가지 않는다.
      assert.equal(
        released.length,
        spec.payout.filter((p) => p > 0n).length,
        `[${vector.id}] Released 이벤트 수가 0 이 아닌 payout 수와 다르다`,
      );
      assert.equal(
        released.reduce((a: bigint, l: any) => a + l.args.amount, 0n),
        R,
        `[${vector.id}] Σ Released.amount != R (불변식 3 — 발표 성패)`,
      );

      // ── ⑥ 보증금은 정산 재원에 섞이지 않았다 ─────────────────────────────
      assert.equal(await splitter.depositOf(SHOW), DEPOSIT, `[${vector.id}] 보증금이 정산에 섞였다`);
      const hostBefore = await yoyo.balanceOf(host.address);
      await (splitter.connect(operator) as any).returnDeposit(SHOW);
      assert.equal(await yoyo.balanceOf(host.address), hostBefore + DEPOSIT, "보증금 반환액이 다르다");
      assert.equal(await splitter.depositOf(SHOW), 0n);
      await assertLedger("returnDeposit 후");
      assert.equal(await yoyo.balanceOf(S), 0n, `[${vector.id}] 정산이 끝나면 컨트랙트 잔액은 0 이다`);
    });
  }
});
