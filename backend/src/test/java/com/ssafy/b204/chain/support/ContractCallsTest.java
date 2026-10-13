package com.ssafy.b204.chain.support;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

import com.ssafy.b204.chain.client.KaiaChainClient;
import com.ssafy.b204.chain.service.FeeDelegationService;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.rule.support.RulesHash;
import com.ssafy.b204.support.KaiaTxBuilder;
import com.ssafy.b204.support.TestWallet;
import java.math.BigInteger;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.web3j.crypto.KaiaCredentials;

/**
 * calldata · RLP 디코드 · {@code rulesHash}를 <b>계약 문서의 값으로 고정</b>한다.
 *
 * <p>selector는 코드가 keccak-256으로 계산하고, 이 테스트가 계약 문서
 * (13_컨트랙트_인터페이스_v1 §8)의 표와 대조한다. 시그니처를 한 글자라도 바꾸면 여기서 먼저
 * 깨진다 — 통합 단계에서 revert로 알게 되는 것보다 훨씬 싸다.
 *
 * <p>컨테이너를 쓰지 않는 순수 단위 테스트다.
 */
class ContractCallsTest {

    /** {@code blockchain/deployments/kairos.json} — contracts.YoYo / contracts.RevenueSplitter. */
    private static final String YOYO = "0xA5d7031D70DAab33EACDfC912baC0668D5776e5b";
    private static final String SPLITTER = "0xa1ca24ECD6adCd29a8998031fd52Cf17F9541738";

    private final TestWallet buyer = TestWallet.random();

    /**
     * 디코드는 순수 계산이라 노드가 필요 없다 — {@code KaiaChainClient}는 목이고 호출되지
     * 않는다. 체인 모듈이 붙은 뒤에도 <b>이 테스트는 컬테이너 없이 돌아야 한다.</b>
     */
    private final FeeDelegationService feeDelegation = feeDelegationService();

    private static FeeDelegationService feeDelegationService() {
        @SuppressWarnings("unchecked")
        ObjectProvider<KaiaCredentials> operator = mock(ObjectProvider.class);
        given(operator.getIfAvailable()).willReturn(null);
        return new FeeDelegationService(
                new ChainProperties("", KaiaTxBuilder.CHAIN_ID, "", "", "",
                        new ChainProperties.Contract(YOYO, SPLITTER)),
                mock(KaiaChainClient.class), operator);
    }

    @Test
    @DisplayName("selector 4개가 계약 문서 §8 표와 같다")
    void selectorsMatchContractDoc() {
        assertThat(AbiCodec.selector(ContractCalls.SIG_APPROVE)).isEqualTo("0x095ea7b3");
        assertThat(AbiCodec.selector(ContractCalls.SIG_PURCHASE)).isEqualTo("0xa01208ea");
        assertThat(AbiCodec.selector(ContractCalls.SIG_DEPOSIT)).isEqualTo("0xb6b55f25");
        assertThat(AbiCodec.selector(ContractCalls.SIG_AGREE_TO_RULES)).isEqualTo("0x344c0bbf");
    }

    @Test
    @DisplayName("approve calldata 는 selector + 주소 워드 + 금액 워드다(명세 §0.4 예시와 같은 형태)")
    void encodesApprove() {
        String data = ContractCalls.approve(SPLITTER, 50_000L);
        assertThat(data).startsWith("0x095ea7b3");
        assertThat(data).hasSize(2 + 8 + 64 * 2);
        assertThat(data).endsWith("00000000000000000000000000000000000000000000000000000000000c350"
                .substring(1));
        assertThat(data).contains(SPLITTER.substring(2).toLowerCase());
    }

    @Test
    @DisplayName("purchase calldata 는 인자 5개 = 워드 5개다")
    void encodesPurchase() {
        String orderRef = RulesHash.orderRef(5501L);
        String data = ContractCalls.purchase(12L, orderRef, 1, 50_000L, 2);
        assertThat(data).startsWith("0xa01208ea");
        assertThat(data).hasSize(2 + 8 + 64 * 5);
        assertThat(data).contains(orderRef.substring(2));
    }

    @Test
    @DisplayName("deposit(uint256) 은 워드 1개다")
    void encodesDeposit() {
        assertThat(ContractCalls.deposit(12L))
                .isEqualTo("0xb6b55f25"
                        + "000000000000000000000000000000000000000000000000000000000000000c");
    }

    @Test
    @DisplayName("잘못된 길이의 bytes32·주소는 인코딩 단계에서 막는다")
    void rejectsMalformedArguments() {
        assertThatThrownBy(() -> ContractCalls.agreeToRules(1L, "0x1234"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> ContractCalls.approve("0x1234", 1L))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("발신자 서명 RLP 를 디코드해 from·to·input 을 꾼내고 서명까지 복구한다(§0.4 ③)")
    void decodesSenderSignedRlp() {
        String input = ContractCalls.deposit(12L);
        String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(3, buyer, SPLITTER, input);

        FeeDelegationService.DecodedUserTx tx = feeDelegation.decode(rlp);
        assertThat(tx.nonce()).isEqualTo(BigInteger.valueOf(3));
        assertThat(tx.from()).isEqualToIgnoringCase(buyer.address());
        assertThat(tx.to()).isEqualToIgnoringCase(SPLITTER);
        assertThat(tx.data()).isEqualToIgnoringCase(input);
        assertThat(tx.value()).isEqualTo(BigInteger.ZERO);
        // 스텅이 못 하던 것 — 서명에서 복구한 주소가 RLP 의 from 과 같다.
        assertThat(tx.recoveredFrom()).isEqualToIgnoringCase(buyer.address());
        assertThat(tx.senderSignatureValid()).isTrue();
    }

    @Test
    @DisplayName("from 만 바꿔 치면 복구 주소가 갈라 위조가 드러난다")
    void detectsForgedSender() {
        String rlp = KaiaTxBuilder.forgedSender(3, TestWallet.random(), buyer.address(), SPLITTER,
                ContractCalls.deposit(12L));

        FeeDelegationService.DecodedUserTx tx = feeDelegation.decode(rlp);
        assertThat(tx.from()).isEqualToIgnoringCase(buyer.address());
        assertThat(tx.recoveredFrom()).isNotEqualToIgnoringCase(buyer.address());
        assertThat(tx.senderSignatureValid()).isFalse();
    }

    @Test
    @DisplayName("타입 바이트가 0x31 이 아니거나 구조가 어긋나면 400 으로 막힌다")
    void rejectsWrongTxType() {
        String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(0, buyer, SPLITTER, "0x00");
        // 타입 바이트만 0x30 으로 바꿜다.
        assertThatThrownBy(() -> feeDelegation.decode("0x30" + rlp.substring(4)))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> feeDelegation.decode("0xdeadbeef"))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> feeDelegation.decode("not-hex"))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> feeDelegation.decode(null))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("서명 배열이 비면 발신자를 복구할 수 없다 — 호출부가 400 으로 막는다")
    void detectsUnsignedTx() {
        String rlp = KaiaTxBuilder.unsigned(0, buyer.address(), SPLITTER, ContractCalls.deposit(1L));
        try {
            assertThat(feeDelegation.decode(rlp).recoveredFrom()).isNull();
        } catch (BusinessException e) {
            // 디코더가 서명 없는 tx 를 형식 오류로 넘기는 것도 같은 결론(400)이다.
            assertThat(e.getErrorCode().name()).isEqualTo("COMMON_VALIDATION_FAILED");
        }
    }

    @Test
    @DisplayName("rulesHash 는 분배율 3종을 모두 반영한다(계약 문서 §4.1 규약 ①)")
    void rulesHashCoversAllRatios() {
        List<RulesHash.TeamShare> shares = List.of(new RulesHash.TeamShare(7L, 5000),
                new RulesHash.TeamShare(9L, 5000));
        String base = RulesHash.of(12L, 6000, 4000, shares);

        assertThat(base).matches("^0x[0-9a-f]{64}$");
        // fixed/selection 이 바뀌면 해시가 달라져야 한다.
        assertThat(RulesHash.of(12L, 9000, 1000, shares)).isNotEqualTo(base);
        // teamShareBp 만 바뀌어도 달라져야 한다 - 이것이 M-08 사고를 막는 조건이다.
        assertThat(RulesHash.of(12L, 6000, 4000, List.of(new RulesHash.TeamShare(7L, 10000),
                new RulesHash.TeamShare(9L, 0)))).isNotEqualTo(base);
        // 팀 순서를 뒤집어도 정규화(teamId 오름차순) 때문에 같은 해시다.
        assertThat(RulesHash.of(12L, 6000, 4000, List.of(new RulesHash.TeamShare(9L, 5000),
                new RulesHash.TeamShare(7L, 5000)))).isEqualTo(base);
    }

    @Test
    @DisplayName("정규화 JSON 은 공백 없이 키 순서가 고정이다 — 프론트가 재현할 수 있어야 한다")
    void canonicalJsonIsStable() {
        assertThat(RulesHash.canonicalJson(12L, 6000, 4000,
                List.of(new RulesHash.TeamShare(9L, 3000), new RulesHash.TeamShare(7L, 7000))))
                .isEqualTo("{\"performanceId\":12,\"fixedRatioBp\":6000,"
                        + "\"selectionRatioBp\":4000,\"teamShares\":["
                        + "{\"teamId\":7,\"shareBp\":7000},{\"teamId\":9,\"shareBp\":3000}]}");
    }

    @Test
    @DisplayName("orderRef 는 orderId 마다 다르고 0이 아니다(컨트랙트 ZeroOrderRef 방어)")
    void orderRefIsUniqueAndNonZero() {
        String a = RulesHash.orderRef(1L);
        String b = RulesHash.orderRef(2L);
        assertThat(a).matches("^0x[0-9a-f]{64}$").isNotEqualTo(b);
        assertThat(a).isNotEqualTo("0x" + "0".repeat(64));
    }
}
