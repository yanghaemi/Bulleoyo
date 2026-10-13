package com.ssafy.b204.chain;

import static org.assertj.core.api.Assertions.assertThat;

import com.ssafy.b204.chain.contract.ContractErrors;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.web3j.crypto.Hash;
import org.web3j.utils.Numeric;

/**
 * 생성물 {@link ContractErrors}의 <b>표기 오류</b>를 잡는 검사.
 *
 * <p>표 자체는 ABI에서 기계로 뽑았지만, 사람이 붙여 넣는 순간 selector 한 글자가 어긋나도
 * 조용히 "모르는 에러"가 된다. 그래서 selector를 여기서 <b>다시 계산해</b> 대조한다 —
 * 계산식이 같은 keccak이므로 값이 아니라 <b>시그니처 ↔ selector 대응</b>을 검증하는 셈이다.
 */
class ContractErrorsTest {

    /** ABI에서 직접 읽은 시그니처. 값이 바뀌면 표도 바뀌어야 한다. */
    private static final Map<String, String> SAMPLES = Map.of(
            "ERC20InsufficientBalance(address,uint256,uint256)", "ERC20InsufficientBalance",
            "AccessControlUnauthorizedAccount(address,bytes32)", "AccessControlUnauthorizedAccount",
            "ZeroRulesHash()", "ZeroRulesHash",
            "ZeroQuantity()", "ZeroQuantity");

    @Test
    @DisplayName("시그니처를 다시 keccak해 얻은 selector가 표의 이름과 이어진다")
    void selectorsMatchRecomputedKeccak() {
        SAMPLES.forEach((signature, name) -> {
            String selector = Hash.sha3String(signature).substring(0, 10);
            assertThat(ContractErrors.nameOfSelector(selector)).contains(name);
        });
    }

    @Test
    @DisplayName("YoYo 16 + RevenueSplitter 41 중 공통 6건을 뺀 51개가 실린다")
    void tableHasEveryUniqueSelector() {
        assertThat(ContractErrors.BY_SELECTOR).hasSize(51);
        assertThat(ContractErrors.BY_SELECTOR.keySet())
                .allMatch(selector -> selector.matches("0x[0-9a-f]{8}"));
    }

    @Test
    @DisplayName("revert 데이터 앞 4바이트로 이름을 되찾고, 짧거나 모르는 값이면 비어 있다")
    void nameOfReadsRevertData() {
        String selector = Hash.sha3String("ZeroQuantity()").substring(0, 10);
        byte[] revertData = Numeric.hexStringToByteArray(selector + "00".repeat(32));

        assertThat(ContractErrors.nameOf(revertData)).contains("ZeroQuantity");
        assertThat(ContractErrors.nameOf(new byte[] {1, 2, 3})).isEmpty();
        assertThat(ContractErrors.nameOf(null)).isEmpty();
        // Error(string) — 표준 revert는 custom error가 아니라 표에 없다.
        assertThat(ContractErrors.nameOfSelector("0x08c379a0")).isEmpty();
    }
}
