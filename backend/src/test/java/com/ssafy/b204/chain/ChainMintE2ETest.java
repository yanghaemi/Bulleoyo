package com.ssafy.b204.chain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

import com.ssafy.b204.chain.client.KaiaChainClient;
import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.worker.ContractOperatorTxBuilder;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.performance.repository.PerformanceParticipantRepository;
import com.ssafy.b204.performance.repository.PerformanceRepository;
import com.ssafy.b204.refund.repository.RefundRepository;
import com.ssafy.b204.rule.repository.SettlementRuleRepository;
import com.ssafy.b204.settlement.repository.SettlementRepository;
import com.ssafy.b204.wallet.entity.Wallet;
import com.ssafy.b204.wallet.repository.WalletRepository;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.test.util.ReflectionTestUtils;
import org.web3j.abi.FunctionReturnDecoder;
import org.web3j.abi.TypeReference;
import org.web3j.abi.Utils;
import org.web3j.abi.datatypes.Address;
import org.web3j.abi.datatypes.Type;
import org.web3j.abi.datatypes.generated.Bytes32;
import org.web3j.abi.datatypes.generated.Uint256;
import org.web3j.crypto.Hash;
import org.web3j.crypto.KaiaCredentials;
import org.web3j.crypto.SignedRawTransaction;
import org.web3j.crypto.TransactionDecoder;
import org.web3j.protocol.Web3j;
import org.web3j.protocol.http.HttpService;
import org.web3j.utils.Numeric;

/**
 * Kairos MINT <b>드라이런</b> E2E — {@link ContractOperatorTxBuilder}가 만든 MINT tx를 진짜 노드에
 * 물어보되 <b>보내지는 않는다</b>. {@code eth_call} + {@code eth_estimateGas} 까지다.
 *
 * <p><b>왜 보내지 않는가.</b> 이 테스트가 실 컨트랙트로 mint를 한 번 하면 그 발행은 <b>서버
 * 장부(chain_job) 밖</b>에 남는다. 로컬 테스트가 어느 DB에 쓰든 그 DB는 배포 서버 DB가 아니기
 * 때문이다. 그러면 발행량 불변식 1
 * ({@code totalSupply == Σ chain_job MINT CONFIRMED} · REL-03 {@code SupplyReconciler})이
 * <b>영구히</b> 깨져 {@code /coin/supply.supplyMatched=false}가 되고 지급·정산이
 * {@code COIN_RESERVE_MISMATCH}로 멈춘다. 되돌릴 방법도 없다 — YoYo에는 burn이 없다(문서 13 §2).
 * 2026-09-08에 실제로 이 일이 났고 컨트랙트 재배포로만 복구했다.
 *
 * <p><b>그래서 상태를 바꾸지 않는다.</b> 여기서 확인하는 것은 "우리가 만든 calldata·서명·가스가
 * 실 컨트랙트에서 통하는가"이고, 그건 {@code eth_call}(revert 여부) + {@code eth_estimateGas}
 * (가스 상한 이내)로 전부 답할 수 있다. 수신 주소는 <b>임의 주소여도 무방하다</b> — 상태가
 * 바뀌지 않으므로 등록 지갑일 필요가 없다. {@code CHAIN_E2E_MINT_TO} 플래그도 그래서 없앴다.
 *
 * <p><b>진짜 mint E2E는 배포 서버에서 한다.</b> {@code API-coin-07}(관리자 지급) 호출 →
 * {@code API-chain-01} 폴링으로 {@code CONFIRMED} 확인 →
 * {@code GET /api/v1/coin/supply}의 {@code supplyMatched=true} 확인. 이 경로는 발행이
 * {@code chain_job}에 남으므로 장부와 체인이 함께 움직인다.
 *
 * <pre>
 *   CHAIN_E2E=1 \
 *   KAIA_RPC_URL=https://public-en-kairos.node.kaia.io \
 *   MINTER_PRIVATE_KEY=0x… \
 *   CONTRACT_YOYO_ADDRESS=0x… \
 *   CONTRACT_SPLITTER_ADDRESS=0x… \
 *   DOCKER_API_VERSION=1.44 bash gradlew test --tests '*ChainMintE2ETest' --no-daemon
 * </pre>
 *
 * <p><b>{@code grantRef}는 매 실행 새 UUID다.</b> 고정하면 두 번째 실행이 {@code GrantRefUsed}로
 * revert 하고 그건 이 테스트가 확인하려는 것이 아니다(문서 13 §2.4). 드라이런이라 온체인
 * {@code usedGrantRef}에는 아무것도 기록되지 않는다.
 */
@EnabledIfEnvironmentVariable(named = "CHAIN_E2E", matches = "1")
class ChainMintE2ETest {

    /** {@link ContractOperatorTxBuilder}의 MINT 상한과 같은 값. 초과하면 상한을 다시 봐야 한다. */
    private static final BigInteger MINT_GAS_CAP = BigInteger.valueOf(120_000);

    /** 드라이런이므로 상태가 바뀌지 않는다 — 등록 지갑일 필요가 없다(클래스 주석). */
    private static final String DRY_RUN_RECEIVER = "0x000000000000000000000000000000000000dEaD";

    @Test
    @DisplayName("빌더가 만든 MINT tx 가 Kairos 에서 revert 없이 통과하고 가스가 상한 이내다(전송 없음)")
    void mintCalldataPassesDryRunOnKairos() throws Exception {
        String rpcUrl = env("KAIA_RPC_URL");
        String yoyo = env("CONTRACT_YOYO_ADDRESS");
        String splitter = env("CONTRACT_SPLITTER_ADDRESS");
        KaiaCredentials minter = KaiaCredentials.create(env("MINTER_PRIVATE_KEY").trim());
        long chainId = Long.parseLong(
                Optional.ofNullable(System.getenv("KAIA_CHAIN_ID")).orElse("1001"));

        String idempotencyKey = "e2e:mint:" + UUID.randomUUID();

        Web3j web3j = org.web3j.protocol.kaia.Web3j.build(new HttpService(rpcUrl));
        try {
            KaiaChainClient chainClient = new KaiaChainClient(fixedProvider(web3j));
            ContractOperatorTxBuilder builder = new ContractOperatorTxBuilder(
                    chainClient,
                    new ChainProperties(rpcUrl, chainId, null, null, null,
                            new ChainProperties.Contract(yoyo, splitter)),
                    walletRepositoryReturning(DRY_RUN_RECEIVER),
                    mock(PerformanceRepository.class),
                    mock(PerformanceParticipantRepository.class),
                    mock(SettlementRuleRepository.class),
                    mock(SettlementRepository.class),
                    mock(RefundRepository.class),
                    // OPERATOR 키는 이 경로에 쓰이지 않는다 — 쓰이면 그 자체가 버그다(빈 provider).
                    emptyProvider(),
                    fixedProvider(minter));

            ChainJob job = ChainJob.builder()
                    .txType(ChainJob.TxType.MINT)
                    .signerType(ChainJob.SignerType.OPERATOR)
                    .issuerType(ChainJob.IssuerType.MOCK)
                    .walletId(1L)
                    .amount(1L)
                    .idempotencyKey(idempotencyKey)
                    .build();
            ReflectionTestUtils.setField(job, "chainJobId", 1L);

            // 서명까지는 실제 경로 그대로 만든다. 다만 이 바이트를 노드로 보내지 않는다.
            SignedRawTransaction signed = decodeTx(builder.buildSignedTx(job));
            String from = signed.getFrom();
            String data = signed.getData().startsWith("0x") ? signed.getData() : "0x" + signed.getData();

            // (a) 워커가 실제로 서명할 주체·대상·체인이 맞는가.
            assertThat(from).isEqualToIgnoringCase(minter.getAddress());
            assertThat(signed.getTo()).isEqualToIgnoringCase(yoyo);
            assertThat(signed.getChainId()).isEqualTo(chainId);

            // (b) calldata 가 실 컨트랙트의 mint(address,uint256,bytes32) 인가 — 문서 13 §2.
            assertThat(data).startsWith(selector("mint(address,uint256,bytes32)"));
            List<Type> args = FunctionReturnDecoder.decode(
                    data.substring(10),
                    Utils.convert(List.of(
                            new TypeReference<Address>() {},
                            new TypeReference<Uint256>() {},
                            new TypeReference<Bytes32>() {})));
            assertThat(args.get(0).getValue().toString()).isEqualToIgnoringCase(DRY_RUN_RECEIVER);
            assertThat(args.get(1).getValue()).isEqualTo(BigInteger.ONE);
            assertThat(Numeric.toHexString((byte[]) args.get(2).getValue()))
                    .isEqualTo(Numeric.toHexString(Hash.sha3(idempotencyKey.getBytes(
                            StandardCharsets.UTF_8))));

            // (c) 실 컨트랙트가 이 호출을 받아들이는가 — MINTER 권한·pause·grantRef 중복이 여기서 걸린다.
            //     상태는 바뀌지 않는다(eth_call).
            KaiaChainClient.CallResult call = chainClient.ethCall(from, yoyo, data);
            assertThat(call.succeeded())
                    .as("eth_call 이 revert 했다 — reverted=%s data=%s message=%s",
                            call.reverted(), call.data(), call.errorMessage())
                    .isTrue();

            // (d) 가스 추정이 되고 상한 이내인가. 추정이 비면 revert 이거나 노드 문제다.
            Optional<BigInteger> estimate = chainClient.estimateGas(from, yoyo, data);
            assertThat(estimate).as("eth_estimateGas 가 값을 주지 않았다").isPresent();
            assertThat(estimate.get()).isLessThanOrEqualTo(MINT_GAS_CAP);
            // 워커가 실제로 실을 gasLimit(= estimate × 1.2)도 상한을 넘지 않아야 한다.
            assertThat(signed.getGasLimit()).isLessThanOrEqualTo(MINT_GAS_CAP);
        } finally {
            web3j.shutdown();
        }
    }

    private static String selector(String signature) {
        return Hash.sha3String(signature).substring(0, 10);
    }

    private static SignedRawTransaction decodeTx(String signedTxHex) {
        return (SignedRawTransaction) TransactionDecoder.decode(signedTxHex);
    }

    private WalletRepository walletRepositoryReturning(String address) {
        Wallet wallet = mock(Wallet.class);
        given(wallet.getAddress()).willReturn(address);
        WalletRepository repository = mock(WalletRepository.class);
        given(repository.findById(1L)).willReturn(Optional.of(wallet));
        return repository;
    }

    @SuppressWarnings("unchecked")
    private static <T> ObjectProvider<T> fixedProvider(T value) {
        ObjectProvider<T> provider = mock(ObjectProvider.class);
        given(provider.getIfAvailable()).willReturn(value);
        return provider;
    }

    @SuppressWarnings("unchecked")
    private static <T> ObjectProvider<T> emptyProvider() {
        return mock(ObjectProvider.class);
    }

    private static String env(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(
                    "환경변수 " + name + " 가 필요하다(CHAIN_E2E=1 로 켰다면 4개를 모두 넣어야 한다).");
        }
        return value;
    }
}
