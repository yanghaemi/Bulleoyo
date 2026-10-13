package com.ssafy.b204.chain;

import static org.assertj.core.api.Assertions.assertThat;

import com.ssafy.b204.chain.client.KaiaChainClient;
import com.ssafy.b204.chain.service.FeeDelegationService;
import com.ssafy.b204.common.config.ChainProperties;
import java.math.BigInteger;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Collections;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.ObjectProvider;
import org.web3j.abi.FunctionEncoder;
import org.web3j.abi.datatypes.Address;
import org.web3j.abi.datatypes.Function;
import org.web3j.abi.datatypes.generated.Uint256;
import org.web3j.crypto.KaiaCredentials;
import org.web3j.crypto.KaiaRawTransaction;
import org.web3j.crypto.KaiaTransactionEncoder;
import org.web3j.crypto.Keys;
import org.web3j.crypto.transaction.type.TxType;
import org.web3j.protocol.Web3j;
import org.web3j.protocol.core.methods.response.TransactionReceipt;
import org.web3j.protocol.http.HttpService;
import org.web3j.utils.Numeric;

/**
 * Kairos 실전 대납 E2E — API v6 §0.4 전 과정을 <b>진짜 노드</b>로 한 번 돌린다.
 *
 * <p><b>기본은 꺼져 있다.</b> {@code CHAIN_E2E=1}일 때만 실행된다 — 키가 없는 팀원의 로컬과 CI에서
 * 돌면 반드시 실패하고, 성공해도 매번 운영지갑 KAIA를 태운다. 켤 때는 시연 전 손으로 한 번이다.
 *
 * <pre>
 *   CHAIN_E2E=1 \
 *   KAIA_RPC_URL=https://public-en-kairos.node.kaia.io \
 *   OPERATOR_PRIVATE_KEY=0x… \
 *   CONTRACT_YOYO_ADDRESS=0x… \
 *   CONTRACT_SPLITTER_ADDRESS=0x… \
 *   DOCKER_API_VERSION=1.44 bash gradlew test --tests '*ChainFeeDelegationE2ETest' --no-daemon
 * </pre>
 *
 * <p><b>발신자는 매 실행마다 새로 만든 키다.</b> 잔액이 0인 지갑이라는 사실이 이 테스트의 요점이다 —
 * "사용자 지갑의 KAIA 잔액은 항상 0이며 그래도 된다"(§0.4)를 실증한다. 새 지갑이므로 nonce는 0이고
 * 조회할 필요도 없다.
 *
 * <p>보내는 tx는 <b>{@code YoYo.approve(splitter, 1)}</b> 한 건이다. 상태를 거의 바꾸지 않고
 * (allowance 1), 잔액·재고·권한 어느 것도 필요 없어 실패해도 정리할 것이 없다.
 */
@EnabledIfEnvironmentVariable(named = "CHAIN_E2E", matches = "1")
class ChainFeeDelegationE2ETest {

    private static final Duration RECEIPT_TIMEOUT = Duration.ofSeconds(60);

    @Test
    @DisplayName("KAIA 0인 지갑이 서명하고 운영지갑이 대납해 receipt status=1 로 확정된다")
    void feeDelegatedApproveSucceedsOnKairos() throws Exception {
        String rpcUrl = env("KAIA_RPC_URL");
        String operatorKey = env("OPERATOR_PRIVATE_KEY");
        String yoyo = env("CONTRACT_YOYO_ADDRESS");
        String splitter = env("CONTRACT_SPLITTER_ADDRESS");
        long chainId = Long.parseLong(Optional.ofNullable(System.getenv("KAIA_CHAIN_ID")).orElse("1001"));

        // Kaia 확장 클래스 — 0x31 tx 를 kaia_sendRawTransaction 으로 라우팅한다(ChainClientConfig 주석).
        Web3j web3j = org.web3j.protocol.kaia.Web3j.build(new HttpService(rpcUrl));
        try {
            KaiaCredentials operator = KaiaCredentials.create(operatorKey);
            // 발신자 = 이번 실행에서 만든 새 지갑. 잔액 0인 것이 전제다.
            KaiaCredentials sender = KaiaCredentials.create(Keys.createEcKeyPair());
            BigInteger senderKaia = web3j.ethGetBalance(sender.getAddress(),
                    org.web3j.protocol.core.DefaultBlockParameterName.LATEST).send().getBalance();
            assertThat(senderKaia).isEqualTo(BigInteger.ZERO);

            // ① 프론트가 하는 일 — 발신자 서명만 붙인 0x31 RLP
            Function approve = new Function("approve",
                    Arrays.asList(new Address(splitter), new Uint256(BigInteger.ONE)),
                    Collections.emptyList());
            KaiaRawTransaction raw = KaiaRawTransaction.createTransaction(
                    TxType.Type.FEE_DELEGATED_SMART_CONTRACT_EXECUTION,
                    BigInteger.ZERO,                                   // 새 지갑이라 nonce 0
                    web3j.ethGasPrice().send().getGasPrice(),
                    BigInteger.valueOf(200_000),
                    yoyo, BigInteger.ZERO, sender.getAddress(),
                    Numeric.hexStringToByteArray(FunctionEncoder.encode(approve)));
            String senderSignedRlp =
                    Numeric.toHexString(KaiaTransactionEncoder.signMessage(raw, chainId, sender));

            // ②③④⑤ 서버가 하는 일 — 디코드·검증·대납 서명·전송
            @SuppressWarnings("unchecked")
            ObjectProvider<KaiaCredentials> operatorProvider =
                    org.mockito.Mockito.mock(ObjectProvider.class);
            org.mockito.BDDMockito.given(operatorProvider.getIfAvailable()).willReturn(operator);
            ChainProperties properties = new ChainProperties(rpcUrl, chainId, operatorKey, operatorKey, null,
                    new ChainProperties.Contract(yoyo, splitter));
            KaiaChainClient chainClient = new KaiaChainClient(providerOf(web3j));
            FeeDelegationService service =
                    new FeeDelegationService(properties, chainClient, operatorProvider);

            String txHash = service.submit(senderSignedRlp, sender.getAddress());
            assertThat(txHash).hasSize(66);

            TransactionReceipt receipt = awaitReceipt(chainClient, txHash);
            assertThat(receipt.getStatus()).isEqualTo("0x1");
            assertThat(receipt.getFrom()).isEqualToIgnoringCase(sender.getAddress());
            assertThat(receipt.getTo()).isEqualToIgnoringCase(yoyo);
            // 가스는 전액 운영지갑이 냈다 — 발신자 잔액은 여전히 0이다.
            assertThat(web3j.ethGetBalance(sender.getAddress(),
                    org.web3j.protocol.core.DefaultBlockParameterName.LATEST).send().getBalance())
                    .isEqualTo(BigInteger.ZERO);
        } finally {
            web3j.shutdown();
        }
    }

    private static TransactionReceipt awaitReceipt(KaiaChainClient client, String txHash)
            throws InterruptedException {
        Instant deadline = Instant.now().plus(RECEIPT_TIMEOUT);
        while (Instant.now().isBefore(deadline)) {
            Optional<TransactionReceipt> receipt = client.receipt(txHash);
            if (receipt.isPresent()) {
                return receipt.get();
            }
            Thread.sleep(1_000);
        }
        throw new AssertionError("receipt를 " + RECEIPT_TIMEOUT.toSeconds() + "초 안에 받지 못했다: " + txHash);
    }

    /** {@link KaiaChainClient}가 요구하는 것은 "있으면 준다"뿐이라 최소 구현으로 감싼다. */
    @SuppressWarnings("unchecked")
    private static ObjectProvider<Web3j> providerOf(Web3j web3j) {
        ObjectProvider<Web3j> provider = org.mockito.Mockito.mock(ObjectProvider.class);
        org.mockito.BDDMockito.given(provider.getIfAvailable()).willReturn(web3j);
        return provider;
    }

    private static String env(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("환경변수 " + name + " 가 필요하다(값은 로그에 남기지 않는다).");
        }
        return value;
    }
}
