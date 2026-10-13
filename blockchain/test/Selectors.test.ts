/**
 * 컨트랙트 custom error ↔ 서버 ChainFailure selector 표 ↔ 문서 13 §4.6 대조(S15P21B204-91).
 *
 * 왜 테스트로도 두는가 — CI Test 스테이지는 `npx hardhat test` 만 돈다. 스크립트만 두면 사람이
 * 기억해야 하고, 사람은 error 한 글자 바꾼 뒤 그것을 기억하지 못한다. 컨트랙트 error 가 바뀌면
 * 여기서 먼저 깨져, 서버(ChainFailure)와 문서(§4.6)를 같은 MR 에서 고치게 한다.
 *
 * 대조 대상은 커밋된 deployments/abi/*.json 이다(서버·프론트가 쓰는 그 파일). 컴파일 산출물이
 * 아니라서, 컨트랙트를 고치고 extract-abi 를 안 돌리면 이 테스트는 "옛 ABI 기준 일치"로 통과한다 —
 * 그 드리프트는 integration-qa 의 abiHash 대조가 잡는다. 두 검사가 서로의 빈틈을 덮는다.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore — .mjs 모듈, 타입 선언 없음
import { runCheck } from "../scripts/check-selectors.mjs";

describe("Selectors — ABI ↔ ChainFailure ↔ 문서 13 §4.6", () => {
  it("세 정본의 custom error 이름·selector 가 전부 일치한다", () => {
    const { checked, serverEntries, problems } = runCheck();
    assert.ok(checked >= 40, `ABI error 가 너무 적다(${checked}) — deployments/abi 가 비었나`);
    assert.ok(serverEntries >= 40, `ChainFailure 항목이 너무 적다(${serverEntries})`);
    assert.deepEqual(problems, [], `대조 실패 ${problems.length}건:\n  ${problems.join("\n  ")}`);
  });
});
