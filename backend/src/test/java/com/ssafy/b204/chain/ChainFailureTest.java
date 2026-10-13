package com.ssafy.b204.chain;

import static org.assertj.core.api.Assertions.assertThat;

import com.ssafy.b204.chain.contract.ContractErrors;
import com.ssafy.b204.chain.service.ChainFailure;
import com.ssafy.b204.common.error.ErrorCode;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * {@code chain_job.failure_reason} 문자열 규약.
 *
 * <p>핵심은 <b>"API로 나가는 값은 언제나 순수한 규격 코드"</b>다. selector를 함께 저장하되
 * 클라이언트가 보는 문자열은 오염되지 않아야 한다 — 코드 문자열이 분기의 유일한 키다(규격 §2).
 */
class ChainFailureTest {

    @Test
    @DisplayName("selector가 없으면 코드만 저장한다")
    void codeOnly() {
        assertThat(ChainFailure.of(ErrorCode.CHAIN_TX_TIMEOUT)).isEqualTo("CHAIN_TX_TIMEOUT");
        assertThat(ChainFailure.of(ErrorCode.CHAIN_TX_TIMEOUT, null)).isEqualTo("CHAIN_TX_TIMEOUT");
        assertThat(ChainFailure.of(ErrorCode.CHAIN_TX_TIMEOUT, "  ")).isEqualTo("CHAIN_TX_TIMEOUT");
    }

    @Test
    @DisplayName("selector는 접미로 붙지만 응답에 나가는 코드는 그대로다")
    void codeAndSelector() {
        String stored = ChainFailure.of(ErrorCode.COMMON_INTERNAL_ERROR, "0xDEADBEEF");

        assertThat(stored).isEqualTo("COMMON_INTERNAL_ERROR#0xdeadbeef");
        assertThat(ChainFailure.codeOf(stored)).isEqualTo("COMMON_INTERNAL_ERROR");
        assertThat(ChainFailure.selectorOf(stored)).contains("0xdeadbeef");
    }

    @Test
    @DisplayName("revert 데이터에서 앞 4바이트만 selector로 뽑는다")
    void extractsSelector() {
        // Error(string) = 0x08c379a0 + abi(문자열). require 문구도 같은 방식으로 잡힌다.
        String revertData = "0x08c379a0"
                + "0000000000000000000000000000000000000000000000000000000000000020";

        assertThat(ChainFailure.extractSelector(revertData)).contains("0x08c379a0");
        assertThat(ChainFailure.extractSelector("0x")).isEmpty();
        assertThat(ChainFailure.extractSelector(null)).isEmpty();
    }

    @Test
    @DisplayName("표에 없는 revert 는 COMMON_INTERNAL_ERROR 다 — 코드를 새로 만들지 않는다")
    void unmappedSelectorFallsBackToInternalError() {
        assertThat(ChainFailure.toErrorCode("0xdeadbeef")).isEqualTo(ErrorCode.COMMON_INTERNAL_ERROR);
        assertThat(ChainFailure.toErrorCode(null)).isEqualTo(ErrorCode.COMMON_INTERNAL_ERROR);
        // Error(string) = require 문구. custom error 가 아니라 표에 없다.
        assertThat(ChainFailure.toErrorCode("0x08c379a0")).isEqualTo(ErrorCode.COMMON_INTERNAL_ERROR);
    }

    @Test
    @DisplayName("계약 문서 §4.6 매핑이 selector 로 그대로 연결된다")
    void mapsContractRevertsToSpecCodes() {
        // 이름 → selector 는 ABI 생성물(ContractErrors)이 정본이다.
        assertThat(ChainFailure.toErrorCode(selectorOf("SaleNotStarted")))
                .isEqualTo(ErrorCode.TICKET_SALE_NOT_STARTED);
        assertThat(ChainFailure.toErrorCode(selectorOf("QuantityLimitExceeded")))
                .isEqualTo(ErrorCode.TICKET_PURCHASE_LIMIT_EXCEEDED);
        assertThat(ChainFailure.toErrorCode(selectorOf("RulesLocked")))
                .isEqualTo(ErrorCode.RULE_ALREADY_LOCKED);
        assertThat(ChainFailure.toErrorCode(selectorOf("RulesHashMismatch")))
                .isEqualTo(ErrorCode.RULE_HASH_MISMATCH);
        assertThat(ChainFailure.toErrorCode(selectorOf("NotAllAgreed")))
                .isEqualTo(ErrorCode.RULE_NOT_AGREED_BY_ALL);
        assertThat(ChainFailure.toErrorCode(selectorOf("AggregateMismatch")))
                .isEqualTo(ErrorCode.SETTLEMENT_AGGREGATE_MISMATCH);
        assertThat(ChainFailure.toErrorCode(selectorOf("InsufficientEscrow")))
                .isEqualTo(ErrorCode.COIN_ESCROW_INSUFFICIENT);
        assertThat(ChainFailure.toErrorCode(selectorOf("ERC20InsufficientAllowance")))
                .isEqualTo(ErrorCode.PAYMENT_AMOUNT_MISMATCH);
        assertThat(ChainFailure.toErrorCode(selectorOf("NotOperator")))
                .isEqualTo(ErrorCode.COMMON_FORBIDDEN);
        assertThat(ChainFailure.toErrorCode(selectorOf("ShowNotFound")))
                .isEqualTo(ErrorCode.COMMON_NOT_FOUND);
        assertThat(ChainFailure.toErrorCode(selectorOf("ZeroOrderRef")))
                .isEqualTo(ErrorCode.COMMON_VALIDATION_FAILED);
        // GrantRefUsed 는 원래 실패가 아니라 동기화다(§4.6). 분기를 놓쳤을 때 남는 값만 고정한다.
        assertThat(ChainFailure.toErrorCode(selectorOf("GrantRefUsed")))
                .isEqualTo(ErrorCode.COMMON_CONFLICT);
    }

    @Test
    @DisplayName("서버 결함 selector 집합 — 카드 목록 + RoleConflict·RoleManagementDisabled 는 알림, 일반 revert 는 아니다")
    void serverFaultSelectors() {
        // 아래 루프는 이름 10개가 ABI 에 있는지만 본다 — 집합에 여분이 들어간 것은 크기가 잡는다.
        assertThat(ChainFailure.SERVER_FAULT_SELECTORS).hasSize(10);
        for (String name : java.util.List.of("NotOperator", "NotHost", "NotTeam",
                "AccessControlUnauthorizedAccount", "RoleConflict", "RoleManagementDisabled",
                "ZeroOrderRef", "ZeroGrantRef", "ZeroRulesHash", "ZeroAmount")) {
            // selectorOf 가 ABI 에 없는 이름이면 실패한다 — 집합이 ABI 밖 selector 를 품지 못하게.
            assertThat(ChainFailure.isServerFault(selectorOf(name), OPERATOR)).as(name).isTrue();
            assertThat(ChainFailure.isServerFault(selectorOf(name).toUpperCase().replace("0X", "0x"), OPERATOR))
                    .as(name + " 대문자").isTrue();
        }
        assertThat(ChainFailure.isServerFault(selectorOf("AlreadyPurchased"), OPERATOR)).isFalse();
        assertThat(ChainFailure.isServerFault(selectorOf("GrantRefUsed"), OPERATOR)).isFalse();
        assertThat(ChainFailure.isServerFault(null, OPERATOR)).isFalse();
        // NotTeam·NotHost 는 사용자 서명(대납) tx 의 onlyTeamOf·onlyHostOf 에서도 난다 — USER job 이면 서버 결함이 아니다.
        assertThat(ChainFailure.isServerFault(selectorOf("NotTeam"), USER)).isFalse();
        assertThat(ChainFailure.isServerFault(selectorOf("NotHost"), USER)).isFalse();
        assertThat(ChainFailure.isServerFault(selectorOf("ZeroAmount"), USER)).isTrue();
    }

    private static final com.ssafy.b204.chain.entity.ChainJob.SignerType OPERATOR =
            com.ssafy.b204.chain.entity.ChainJob.SignerType.OPERATOR;
    private static final com.ssafy.b204.chain.entity.ChainJob.SignerType USER =
            com.ssafy.b204.chain.entity.ChainJob.SignerType.USER;

    /** 이름으로 selector 를 찾는다 — 테스트가 4바이트 hex 를 손으로 적지 않게 한다. */
    private static String selectorOf(String errorName) {
        return ContractErrors.BY_SELECTOR.entrySet().stream()
                .filter(e -> e.getValue().equals(errorName))
                .map(Map.Entry::getKey)
                .findFirst()
                .orElseThrow(() -> new AssertionError("ABI 에 없는 error 이름: " + errorName));
    }
}
