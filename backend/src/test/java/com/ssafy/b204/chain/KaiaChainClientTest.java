package com.ssafy.b204.chain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;

import com.ssafy.b204.chain.client.KaiaChainClient;
import com.ssafy.b204.chain.service.ChainFailure;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import java.math.BigInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.web3j.protocol.ObjectMapperFactory;
import org.web3j.protocol.Web3j;
import org.web3j.protocol.core.Request;
import org.web3j.protocol.core.methods.response.EthCall;
import org.web3j.protocol.core.methods.response.EthTransaction;

/**
 * {@link KaiaChainClient#isTransactionKnown} — 워커가 "유실" 을 판정하는 근거라, 노드 응답의 모양을
 * <b>실제 Kairos 원시 응답</b>으로 고정한다(2026-09-15 public-en-kairos 에서 받은 그대로).
 */
class KaiaChainClientTest {

    private static final String HASH = "0x" + "11".repeat(32);

    @Test
    @DisplayName("result=null(노드가 모르는 해시) → false")
    void unknownHashIsNotKnown() throws Exception {
        assertThat(clientFor("{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":null}").isTransactionKnown(HASH))
                .isFalse();
    }

    @Test
    @DisplayName("tx 객체가 오면 → true")
    void minedOrPooledTxIsKnown() throws Exception {
        assertThat(clientFor("{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"hash\":\"" + HASH + "\"}}")
                .isTransactionKnown(HASH)).isTrue();
    }

    @Test
    @DisplayName("RPC error 응답은 '모름' 으로 접지 않고 던진다 — 노드 장애가 FAILED 로 번지지 않게")
    void rpcErrorThrows() throws Exception {
        KaiaChainClient client = clientFor("{\"jsonrpc\":\"2.0\",\"id\":1,\"error\":{\"code\":-32602,"
                + "\"message\":\"invalid argument 0: hex string has length 4, want 64 for common.Hash\"}}");

        assertThatThrownBy(() -> client.isTransactionKnown(HASH))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COMMON_EXTERNAL_SERVICE_ERROR);
    }

    /**
     * 2026-09-17 dev 공연 6 — {@code failure_reason} 이 {@code COMMON_INTERNAL_ERROR#0x"0x2630f} 로 남았다.
     * web3j 4.9.8 {@code Response.Error.data} 는 {@code KeepAsJsonDeserialzier} 라 JSON 문자열을
     * <b>따옴표째</b> 돌려주고, 그대로 selector 를 자르면 {@code 0x"0x2630f} 가 된다.
     */
    @Test
    @DisplayName("revert 데이터가 error.data 에 JSON 문자열로 와도 selector 가 매핑된다 — ShowNotFound → COMMON_NOT_FOUND")
    void revertDataFromErrorIsUnquoted() throws Exception {
        String revert = "0x2630f88b" + "0".repeat(62) + "06";
        EthCall response = ObjectMapperFactory.getObjectMapper().readValue(
                "{\"jsonrpc\":\"2.0\",\"id\":1,\"error\":{\"code\":-32000,"
                        + "\"message\":\"execution reverted\",\"data\":\"" + revert + "\"}}",
                EthCall.class);
        Request request = request(response);
        KaiaChainClient client = clientWith(web3j -> doReturn(request).when(web3j).ethCall(any(), any()));

        String selector = client.revertData("0x" + "01".repeat(20), "0x" + "02".repeat(20), "0xb6b55f25",
                BigInteger.ONE).flatMap(ChainFailure::extractSelector).orElseThrow();

        assertThat(selector).isEqualTo("0x2630f88b");
        assertThat(ChainFailure.toErrorCode(selector)).isEqualTo(ErrorCode.COMMON_NOT_FOUND);
        assertThat(client.ethCall("0x" + "01".repeat(20), "0x" + "02".repeat(20), "0xb6b55f25").data())
                .isEqualTo(revert);
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private static Request request(EthCall response) throws Exception {
        Request request = mock(Request.class);
        given(request.send()).willReturn(response);
        return request;
    }

    @SuppressWarnings("unchecked")
    private static KaiaChainClient clientWith(java.util.function.Consumer<Web3j> stubbing) {
        Web3j web3j = mock(Web3j.class);
        stubbing.accept(web3j);
        ObjectProvider<Web3j> provider = mock(ObjectProvider.class);
        given(provider.getIfAvailable()).willReturn(web3j);
        return new KaiaChainClient(provider);
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private static KaiaChainClient clientFor(String rawJson) throws Exception {
        // HttpService 와 같은 매퍼로 역직렬화한다 — Optional.empty 판정이 web3j 파싱까지 포함해 맞는지 본다.
        EthTransaction response = ObjectMapperFactory.getObjectMapper().readValue(rawJson, EthTransaction.class);
        Request request = mock(Request.class);
        given(request.send()).willReturn(response);
        Web3j web3j = mock(Web3j.class);
        doReturn(request).when(web3j).ethGetTransactionByHash(HASH);
        ObjectProvider<Web3j> provider = mock(ObjectProvider.class);
        given(provider.getIfAvailable()).willReturn(web3j);
        return new KaiaChainClient(provider);
    }
}
