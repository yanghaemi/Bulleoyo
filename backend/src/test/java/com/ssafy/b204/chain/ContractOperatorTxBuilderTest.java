package com.ssafy.b204.chain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

import com.ssafy.b204.chain.client.KaiaChainClient;
import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.worker.ContractOperatorTxBuilder;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.entity.PerformanceParticipant;
import com.ssafy.b204.performance.repository.PerformanceParticipantRepository;
import com.ssafy.b204.performance.repository.PerformanceRepository;
import com.ssafy.b204.refund.entity.Refund;
import com.ssafy.b204.refund.repository.RefundRepository;
import com.ssafy.b204.rule.entity.SettlementRule;
import com.ssafy.b204.rule.repository.SettlementRuleRepository;
import com.ssafy.b204.settlement.entity.Settlement;
import com.ssafy.b204.settlement.repository.SettlementRepository;
import com.ssafy.b204.team.entity.Team;
import com.ssafy.b204.ticket.entity.TicketOrder;
import com.ssafy.b204.wallet.entity.Wallet;
import com.ssafy.b204.wallet.repository.WalletRepository;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.test.util.ReflectionTestUtils;
import org.web3j.abi.FunctionReturnDecoder;
import org.web3j.abi.TypeReference;
import org.web3j.abi.Utils;
import org.web3j.abi.datatypes.Address;
import org.web3j.abi.datatypes.DynamicArray;
import org.web3j.abi.datatypes.Type;
import org.web3j.abi.datatypes.generated.Bytes32;
import org.web3j.abi.datatypes.generated.Uint16;
import org.web3j.abi.datatypes.generated.Uint256;
import org.web3j.abi.datatypes.generated.Uint8;
import org.web3j.crypto.ECKeyPair;
import org.web3j.crypto.Hash;
import org.web3j.crypto.KaiaCredentials;
import org.web3j.crypto.Keys;
import org.web3j.crypto.SignedRawTransaction;
import org.web3j.crypto.TransactionDecoder;
import org.web3j.utils.Numeric;

/**
 * OPERATOR job → 서명된 raw tx — 문서 13(컨트랙트 인터페이스 v1) §2·§3의 시그니처 대조.
 *
 * <p><b>노드에 붙지 않는다.</b> 여기서 확인하는 것은 "우리가 만든 바이트가 ABI대로인가" 하나이고
 * 그것은 순수 계산이다. 확인 방법은 <b>만든 것을 다시 풀어 보는 것</b>이다 — 인코딩 코드를 테스트에
 * 다시 적으면 같은 실수를 두 번 하고 통과한다. 그래서
 *
 * <ul>
 *   <li>selector는 {@code Hash.sha3String("mint(address,uint256,bytes32)")}로 <b>문서의 문자열에서
 *       직접</b> 계산해 비교한다(래퍼 상수를 믿지 않는다).
 *   <li>인자는 {@link FunctionReturnDecoder}로 디코드해 값을 되읽는다.
 *   <li>서명은 {@link TransactionDecoder}로 풀어 {@code to}·{@code from}(서명 복구)·{@code chainId}를
 *       확인한다 — 이 셋이 맞으면 "누가 어느 컨트랙트에 어느 체인에서 보내는가"가 맞다.
 * </ul>
 *
 * <p>키는 매 실행마다 {@link Keys#createEcKeyPair()}로 새로 만든다. 테스트에 고정 개인키를 적으면
 * 그 파일이 곧 유출 경로가 된다.
 */
class ContractOperatorTxBuilderTest {

    private static final String YOYO_ADDRESS = "0xdf1c0000000000000000000000000000000068fd";
    private static final String SPLITTER_ADDRESS = "0x0cc7000000000000000000000000000000006192";
    private static final long CHAIN_ID = 1001L;

    private static final BigInteger NONCE = BigInteger.valueOf(7);
    private static final BigInteger GAS_PRICE = BigInteger.valueOf(25_000_000_000L);

    private KaiaChainClient chainClient;
    private WalletRepository walletRepository;
    private PerformanceRepository performanceRepository;
    private PerformanceParticipantRepository participantRepository;
    private SettlementRuleRepository settlementRuleRepository;
    private SettlementRepository settlementRepository;
    private RefundRepository refundRepository;
    private KaiaCredentials operator;
    private KaiaCredentials minter;
    private ContractOperatorTxBuilder builder;

    @BeforeEach
    void setUp() throws Exception {
        chainClient = mock(KaiaChainClient.class);
        walletRepository = mock(WalletRepository.class);
        performanceRepository = mock(PerformanceRepository.class);
        participantRepository = mock(PerformanceParticipantRepository.class);
        settlementRuleRepository = mock(SettlementRuleRepository.class);
        settlementRepository = mock(SettlementRepository.class);
        refundRepository = mock(RefundRepository.class);

        operator = KaiaCredentials.create(freshKeyPair());
        minter = KaiaCredentials.create(freshKeyPair());

        given(chainClient.pendingNonce(anyString())).willReturn(NONCE);
        given(chainClient.gasPrice()).willReturn(GAS_PRICE);
        // 기본은 "추정 실패" — 유형별 gas cap 으로 떨어지는 경로가 기본값이다.
        given(chainClient.estimateGas(anyString(), anyString(), anyString()))
                .willReturn(Optional.empty());

        ChainProperties properties = new ChainProperties(
                "https://public-en-kairos.node.kaia.io", CHAIN_ID, null, null, null,
                new ChainProperties.Contract(YOYO_ADDRESS, SPLITTER_ADDRESS));

        builder = new ContractOperatorTxBuilder(chainClient, properties, walletRepository,
                performanceRepository, participantRepository, settlementRuleRepository,
                settlementRepository, refundRepository, provider(operator), provider(minter));
    }

    // ------------------------------------------------------------------ (a) calldata

    @Test
    @DisplayName("MINT calldata 는 mint(address,uint256,bytes32) selector + to·amount·grantRef 다")
    void mintCalldataMatchesAbi() {
        String to = "0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a";
        givenWallet(9L, to);
        ChainJob job = job(ChainJob.TxType.MINT, b -> b.walletId(9L).amount(100_000L)
                .idempotencyKey("grant:signup:1024"));

        String data = dataOf(builder.buildSignedTx(job));

        assertThat(selectorOf(data)).isEqualTo(selector("mint(address,uint256,bytes32)"));
        List<Type> args = decode(data, new TypeReference<Address>() {},
                new TypeReference<Uint256>() {}, new TypeReference<Bytes32>() {});
        assertThat((String) args.get(0).getValue()).isEqualToIgnoringCase(to);
        // YoYo decimals = 0 — 100,000 YoYo 는 정확히 100000 이다(문서 13 §0). 스케일링이 끼면 여기서 깨진다.
        assertThat(args.get(1).getValue()).isEqualTo(BigInteger.valueOf(100_000));
        // grantRef = keccak256(멱등키 원문) — 문서 13 §2.4.
        assertThat(Numeric.toHexString((byte[]) args.get(2).getValue()))
                .isEqualTo(Numeric.toHexString(
                        Hash.sha3("grant:signup:1024".getBytes(StandardCharsets.UTF_8))));
    }

    @Test
    @DisplayName("AGGREGATE 는 settlement.validTicketCount 를, showId 는 performance.onChainId 를 쓴다")
    void aggregateUsesOnChainIdAndValidTicketCount() {
        givenPerformance(12L, 4242L);
        givenSettlement(12L, 317);
        ChainJob job = job(ChainJob.TxType.AGGREGATE, b -> b.targetPerformanceId(12L));

        String data = dataOf(builder.buildSignedTx(job));

        assertThat(selectorOf(data)).isEqualTo(selector("aggregate(uint256,uint256)"));
        List<Type> args = decode(data, new TypeReference<Uint256>() {}, new TypeReference<Uint256>() {});
        // performance_id(12)가 아니라 on_chain_id(4242)여야 한다 — 둘을 헷갈리면 남의 공연을 집계한다.
        assertThat(args.get(0).getValue()).isEqualTo(BigInteger.valueOf(4242));
        assertThat(args.get(1).getValue()).isEqualTo(BigInteger.valueOf(317));
    }

    @Test
    @DisplayName("REFUND 는 orderRef(ticket_order)·refundAmount(refund)를 그대로 싣는다")
    void refundCalldataComesFromRefundAndOrder() {
        String orderRef = "0x1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a";
        givenPerformance(12L, 4242L);
        givenRefund(51L, orderRef, 9_500L);
        ChainJob job = job(ChainJob.TxType.REFUND, b -> b.targetPerformanceId(12L), 51L);

        String data = dataOf(builder.buildSignedTx(job));

        assertThat(selectorOf(data)).isEqualTo(selector("refund(uint256,bytes32,uint256)"));
        List<Type> args = decode(data, new TypeReference<Uint256>() {},
                new TypeReference<Bytes32>() {}, new TypeReference<Uint256>() {});
        assertThat(args.get(0).getValue()).isEqualTo(BigInteger.valueOf(4242));
        assertThat(Numeric.toHexString((byte[]) args.get(1).getValue())).isEqualTo(orderRef);
        assertThat(args.get(2).getValue()).isEqualTo(BigInteger.valueOf(9_500));
    }

    @Test
    @DisplayName("CREATE_SHOW calldata 는 래퍼 시그니처 그대로다 — 배열 순서는 on_chain_index 다")
    void createShowCalldataMatchesWrapperSignature() {
        String hostWallet = "0x1111111111111111111111111111111111111111";
        String guestWallet = "0x2222222222222222222222222222222222222222";
        String rulesHash =
                "0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f";
        givenCreateShow(12L, 7L, rulesHash, 6000, 4000,
                participant(1, 9L, guestWallet, 4000), participant(0, 7L, hostWallet, 6000));

        String data = dataOf(builder.buildSignedTx(
                job(ChainJob.TxType.CREATE_SHOW, b -> b.targetPerformanceId(12L))));

        assertThat(selectorOf(data)).isEqualTo(selector(
                "createShow(uint256,address[],uint8,bytes32,uint16,uint16,uint16[],uint256)"));
        List<Type> args = decode(data,
                new TypeReference<Uint256>() {},
                new TypeReference<DynamicArray<Address>>() {},
                new TypeReference<Uint8>() {},
                new TypeReference<Bytes32>() {},
                new TypeReference<Uint16>() {},
                new TypeReference<Uint16>() {},
                new TypeReference<DynamicArray<Uint16>>() {},
                new TypeReference<Uint256>() {});
        assertThat(args.get(0).getValue()).isEqualTo(BigInteger.valueOf(12));
        // 저장 순서(guest 먼저)가 아니라 on_chain_index 순서여야 한다 - 이 순서가 곧 teamIndex 다.
        assertThat(addresses(args.get(1))).containsExactly(hostWallet, guestWallet);
        assertThat(args.get(2).getValue()).isEqualTo(BigInteger.ZERO);
        assertThat(Numeric.toHexString((byte[]) args.get(3).getValue())).isEqualTo(rulesHash);
        assertThat(args.get(4).getValue()).isEqualTo(BigInteger.valueOf(6000));
        assertThat(args.get(5).getValue()).isEqualTo(BigInteger.valueOf(4000));
        assertThat(uint16s(args.get(6))).containsExactly(BigInteger.valueOf(6000),
                BigInteger.valueOf(4000));
        assertThat(args.get(7).getValue()).isEqualTo(BigInteger.valueOf(50_000));
    }

    @Test
    @DisplayName("UPDATE_RULES calldata 는 래퍼 시그니처 그대로다 — 팀 구성 없이 비율만 바꾼다")
    void updateRulesCalldataMatchesWrapperSignature() {
        String rulesHash =
                "0x9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b";
        givenCreateShow(12L, 7L, rulesHash, 3000, 7000,
                participant(1, 9L, "0x2222222222222222222222222222222222222222", 4500),
                participant(0, 7L, "0x1111111111111111111111111111111111111111", 5500));

        String data = dataOf(builder.buildSignedTx(
                job(ChainJob.TxType.UPDATE_RULES, b -> b.targetPerformanceId(12L)
                        .idempotencyKey("updateRules:12:" + rulesHash + ":1"))));

        assertThat(selectorOf(data)).isEqualTo(selector(
                "updateRules(uint256,bytes32,uint16,uint16,uint16[])"));
        List<Type> args = decode(data,
                new TypeReference<Uint256>() {},
                new TypeReference<Bytes32>() {},
                new TypeReference<Uint16>() {},
                new TypeReference<Uint16>() {},
                new TypeReference<DynamicArray<Uint16>>() {});
        assertThat(args.get(0).getValue()).isEqualTo(BigInteger.valueOf(12));
        assertThat(Numeric.toHexString((byte[]) args.get(1).getValue())).isEqualTo(rulesHash);
        assertThat(args.get(2).getValue()).isEqualTo(BigInteger.valueOf(3000));
        assertThat(args.get(3).getValue()).isEqualTo(BigInteger.valueOf(7000));
        // 저장 순서(guest 먼저)가 아니라 on_chain_index 순서다 - 컨트랙트는 배열 위치로만 팀을 안다.
        assertThat(uint16s(args.get(4))).containsExactly(BigInteger.valueOf(5500),
                BigInteger.valueOf(4500));
    }

    /**
     * 순서가 {@code createShow} 와 다르면 컨트랙트가 <b>엉뚱한 팀에 비율을 준다</b> — 팀 구성은
     * {@code createShow} 때 굳었고 {@code updateRules} 는 그 배열 위치에 값을 덮어쓸 뿐이다.
     * 그 사고는 정산 때까지 드러나지 않으므로 여기서 두 calldata 를 직접 맞춰 본다.
     */
    @Test
    @DisplayName("UPDATE_RULES 의 teamShareBp 순서는 CREATE_SHOW 와 같다")
    void updateRulesKeepsCreateShowTeamOrder() {
        String rulesHash =
                "0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f";
        givenCreateShow(12L, 7L, rulesHash, 6000, 4000,
                participant(1, 9L, "0x2222222222222222222222222222222222222222", 4000),
                participant(0, 7L, "0x1111111111111111111111111111111111111111", 6000));

        List<BigInteger> createShowShares = uint16s(decode(dataOf(builder.buildSignedTx(
                        job(ChainJob.TxType.CREATE_SHOW, b -> b.targetPerformanceId(12L)))),
                new TypeReference<Uint256>() {},
                new TypeReference<DynamicArray<Address>>() {},
                new TypeReference<Uint8>() {},
                new TypeReference<Bytes32>() {},
                new TypeReference<Uint16>() {},
                new TypeReference<Uint16>() {},
                new TypeReference<DynamicArray<Uint16>>() {},
                new TypeReference<Uint256>() {}).get(6));
        List<BigInteger> updateRulesShares = uint16s(decode(dataOf(builder.buildSignedTx(
                        job(ChainJob.TxType.UPDATE_RULES, b -> b.targetPerformanceId(12L)
                                .idempotencyKey("updateRules:12:" + rulesHash + ":1")))),
                new TypeReference<Uint256>() {},
                new TypeReference<Bytes32>() {},
                new TypeReference<Uint16>() {},
                new TypeReference<Uint16>() {},
                new TypeReference<DynamicArray<Uint16>>() {}).get(4));

        assertThat(updateRulesShares).isEqualTo(createShowShares);
    }

    /**
     * job 이 큐에 있는 동안 규칙이 또 저장된 경우다. 해시는 job 에서·비율은 DB 에서 가져오면
     * <b>서로 다른 규칙이 섞인 tx</b>가 되어 온체인 해시와 온체인 비율이 어긋난다 — 팀이 서명한
     * 해시가 실제 분배와 달라지는, 이 프로젝트의 신뢰 장치가 무너지는 자리다.
     */
    @Test
    @DisplayName("겨냥한 해시가 현재 규칙과 다르면 UPDATE_RULES 를 만들지 않는다 — 섞인 tx 를 보내지 않는다")
    void updateRulesRefusesStaleJob() {
        String saved = "0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f";
        givenCreateShow(12L, 7L, saved, 6000, 4000,
                participant(0, 7L, "0x1111111111111111111111111111111111111111", 10000));
        ChainJob stale = job(ChainJob.TxType.UPDATE_RULES, b -> b.targetPerformanceId(12L)
                .idempotencyKey("updateRules:12:0x" + "ab".repeat(32) + ":1"));

        assertThatThrownBy(() -> builder.buildSignedTx(stale))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.RULE_HASH_MISMATCH);
    }

    @Test
    @DisplayName("on_chain_index 가 비어 있으면 createShow 를 만들지 않는다 — 순서가 곧 팀이다")
    void createShowFailsWhenIndexMissing() {
        givenCreateShow(12L, 7L,
                "0x4d1c8f7a2b9e0d3f6a5c8b1e4d7f0a3c6b9e2d5f8a1c4b7e0d3f6a9c2b5e8d1f", 6000, 4000,
                participant(null, 7L, "0x1111111111111111111111111111111111111111", 10000));
        ChainJob job = job(ChainJob.TxType.CREATE_SHOW, b -> b.targetPerformanceId(12L));

        assertThatThrownBy(() -> builder.buildSignedTx(job)).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("START_SALE 은 startSale(uint256), LOCK 은 lock(uint256) 이다 — 뜻이 갈렸다")
    void startSaleAndLockAreDifferentFunctions() {
        givenPerformance(12L, 4242L);

        String startSale = dataOf(builder.buildSignedTx(
                job(ChainJob.TxType.START_SALE, b -> b.targetPerformanceId(12L)
                        .idempotencyKey("startSale:12"))));
        String lock = dataOf(builder.buildSignedTx(
                job(ChainJob.TxType.LOCK, b -> b.targetPerformanceId(12L)
                        .idempotencyKey("settlement:lock:12"))));

        assertThat(selectorOf(startSale)).isEqualTo(selector("startSale(uint256)"));
        assertThat(selectorOf(lock)).isEqualTo(selector("lock(uint256)"));
        assertThat(selectorOf(startSale)).isNotEqualTo(selectorOf(lock));
    }

    // ------------------------------------------------------------------ (b)(c) 서명

    @Test
    @DisplayName("MINT 는 MINTER 키로 서명되고 to=YoYo·chainId=1001 이다")
    void mintIsSignedByMinterToYoYo() throws Exception {
        givenWallet(9L, "0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a");
        ChainJob job = job(ChainJob.TxType.MINT, b -> b.walletId(9L).amount(1L)
                .idempotencyKey("grant:signup:1024"));

        SignedRawTransaction decoded = decodeTx(builder.buildSignedTx(job));

        assertThat(decoded.getTo()).isEqualToIgnoringCase(YOYO_ADDRESS);
        assertThat(decoded.getFrom()).isEqualToIgnoringCase(minter.getAddress());
        // EIP-155. chainId 가 빠진 서명은 다른 Kaia 체인에 그대로 재생될 수 있다.
        assertThat(decoded.getChainId()).isEqualTo(CHAIN_ID);
        assertThat(decoded.getNonce()).isEqualTo(NONCE);
        assertThat(decoded.getGasPrice()).isEqualTo(GAS_PRICE);
        // estimateGas 실패 → MINT 상한 120k.
        assertThat(decoded.getGasLimit()).isEqualTo(BigInteger.valueOf(120_000));
    }

    @Test
    @DisplayName("RELEASE 는 OPERATOR 키로 서명되고 to=Splitter 다 — MINTER 키가 새지 않는다")
    void releaseIsSignedByOperatorToSplitter() throws Exception {
        givenPerformance(12L, 4242L);
        ChainJob job = job(ChainJob.TxType.RELEASE, b -> b.targetPerformanceId(12L));

        String signed = builder.buildSignedTx(job);
        SignedRawTransaction decoded = decodeTx(signed);

        assertThat(dataOf(signed)).startsWith(selector("release(uint256)"));
        assertThat(decoded.getTo()).isEqualToIgnoringCase(SPLITTER_ADDRESS);
        assertThat(decoded.getFrom()).isEqualToIgnoringCase(operator.getAddress());
        assertThat(decoded.getFrom()).isNotEqualToIgnoringCase(minter.getAddress());
        assertThat(decoded.getChainId()).isEqualTo(CHAIN_ID);
        // Splitter 상한 300k. release 는 팀 수만큼 transfer 가 돌아 MINT 보다 크다.
        assertThat(decoded.getGasLimit()).isEqualTo(BigInteger.valueOf(300_000));
    }

    @Test
    @DisplayName("gas 추정이 되면 20% 여유를 붙여 쓴다(상한을 쓰지 않는다)")
    void gasLimitUsesEstimateWithBuffer() throws Exception {
        givenPerformance(12L, 4242L);
        given(chainClient.estimateGas(anyString(), anyString(), anyString()))
                .willReturn(Optional.of(BigInteger.valueOf(100_000)));
        ChainJob job = job(ChainJob.TxType.LOCK, b -> b.targetPerformanceId(12L));

        assertThat(decodeTx(builder.buildSignedTx(job)).getGasLimit())
                .isEqualTo(BigInteger.valueOf(120_000));
    }

    // ------------------------------------------------------------------ (d) supports

    @ParameterizedTest
    @EnumSource(value = ChainJob.TxType.class,
            names = {"MINT", "CREATE_SHOW", "START_SALE", "UPDATE_RULES", "LOCK", "AGGREGATE",
                    "RELEASE", "HALT", "DEPOSIT_RETURN", "REFUND"})
    @DisplayName("운영자 tx 10종은 지원한다 — API-chain-01 요구사항의 OPERATOR 목록 그대로")
    void supportsOperatorTypes(ChainJob.TxType txType) {
        assertThat(builder.supports(txType)).isTrue();
    }

    @ParameterizedTest
    @EnumSource(value = ChainJob.TxType.class,
            names = {"APPROVE", "PURCHASE", "DEPOSIT", "AGREE", "DEPOSIT_FORFEIT"})
    @DisplayName("사용자 서명 4종과 P1 예약값은 지원하지 않는다 — 서버에 서명 근거가 없다")
    void doesNotSupportUserSignedOrReservedTypes(ChainJob.TxType txType) {
        assertThat(builder.supports(txType)).isFalse();
    }

    @Test
    @DisplayName("null 유형도 false — 워커가 그냥 건너뛰게 한다")
    void doesNotSupportNull() {
        assertThat(builder.supports(null)).isFalse();
    }

    // ------------------------------------------------------------------ (e) 인자 부재

    @Test
    @DisplayName("walletId 가 가리키는 지갑이 없으면 BusinessException — 0 주소로 mint 하지 않는다")
    void mintFailsWhenWalletMissing() {
        given(walletRepository.findById(anyLong())).willReturn(Optional.empty());
        ChainJob job = job(ChainJob.TxType.MINT, b -> b.walletId(9L).amount(1L)
                .idempotencyKey("grant:signup:1024"));

        assertThatThrownBy(() -> builder.buildSignedTx(job))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COMMON_INTERNAL_ERROR);
    }

    @Test
    @DisplayName("멱등키가 없으면 MINT 를 만들지 않는다 — grantRef 없는 mint 는 중복 지급을 막지 못한다")
    void mintFailsWithoutIdempotencyKey() {
        givenWallet(9L, "0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a");
        ChainJob job = job(ChainJob.TxType.MINT, b -> b.walletId(9L).amount(1L));

        assertThatThrownBy(() -> builder.buildSignedTx(job)).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("onChainId 가 아직 없어도 showId 는 performance_id 다 — 순환을 만들지 않는다")
    void showIdFallsBackToPerformanceId() {
        // on_chain_id 를 채우는 유일한 자리가 체인 job 확정이다. 그것을 강제하면 판매 시작 job 이
        // 자기 확정 결과를 선행 조건으로 요구해 반드시 실패한다(S15P21B204-67).
        givenPerformance(12L, null);
        ChainJob job = job(ChainJob.TxType.HALT, b -> b.targetPerformanceId(12L));

        String data = dataOf(builder.buildSignedTx(job));

        assertThat(selectorOf(data)).isEqualTo(selector("halt(uint256)"));
        assertThat(decode(data, new TypeReference<Uint256>() {}).get(0).getValue())
                .isEqualTo(BigInteger.valueOf(12));
    }

    @Test
    @DisplayName("지원하지 않는 유형을 강제로 넣으면 만들지 않는다")
    void buildRejectsUnsupportedType() {
        ChainJob job = job(ChainJob.TxType.PURCHASE, b -> b);

        assertThatThrownBy(() -> builder.buildSignedTx(job)).isInstanceOf(BusinessException.class);
    }

    // ------------------------------------------------------------------ 헬퍼

    private static ECKeyPair freshKeyPair() throws Exception {
        return Keys.createEcKeyPair();
    }

    @SuppressWarnings("unchecked")
    private static ObjectProvider<KaiaCredentials> provider(KaiaCredentials credentials) {
        ObjectProvider<KaiaCredentials> provider = mock(ObjectProvider.class);
        given(provider.getIfAvailable()).willReturn(credentials);
        return provider;
    }

    private interface JobTweak {
        ChainJob.ChainJobBuilder apply(ChainJob.ChainJobBuilder builder);
    }

    private static ChainJob job(ChainJob.TxType txType, JobTweak tweak) {
        return job(txType, tweak, 1L);
    }

    private static ChainJob job(ChainJob.TxType txType, JobTweak tweak, long chainJobId) {
        ChainJob job = tweak.apply(ChainJob.builder()
                .txType(txType)
                .signerType(ChainJob.SignerType.OPERATOR)
                .issuerType(ChainJob.IssuerType.MOCK)).build();
        ReflectionTestUtils.setField(job, "chainJobId", chainJobId);
        return job;
    }

    private void givenWallet(long walletId, String address) {
        Wallet wallet = mock(Wallet.class);
        given(wallet.getAddress()).willReturn(address);
        given(walletRepository.findById(walletId)).willReturn(Optional.of(wallet));
    }

    /**
     * <b>mock 이 아니라 진짜 엔티티다.</b> {@code showId} 파생을 엔티티가 가지므로
     * {@code mock(Performance.class)} 을 쓰면 그 메서드가 실행되지 않아 calldata 의 showId 가
     * 조용히 {@code 0} 이 된다(MR !130 에서 실제로 그렇게 됐다). mock 에 규칙을 복제해 세우면
     * 엔티티 쪽이 깨져도 이 테스트는 초록이라 회귀를 못 잡는다.
     */
    private Performance givenPerformance(long performanceId, Long onChainId) {
        Performance performance = Performance.builder().build();
        ReflectionTestUtils.setField(performance, "performanceId", performanceId);
        ReflectionTestUtils.setField(performance, "onChainId", onChainId);
        given(performanceRepository.findById(performanceId)).willReturn(Optional.of(performance));
        return performance;
    }

    /** {@code createShow} 인자 출처 3곳을 한 번에 세운다 — performance · participant · rule. */
    private void givenCreateShow(long performanceId, long hostTeamId, String rulesHash,
                                 int fixedRatioBp, int selectionRatioBp,
                                 PerformanceParticipant... participants) {
        Performance performance = givenPerformance(performanceId, null);
        Team hostTeam = mock(Team.class);
        given(hostTeam.getTeamId()).willReturn(hostTeamId);
        // 진짜 엔티티라 given(...) 을 걸 수 없다 — 필드를 직접 세운다.
        ReflectionTestUtils.setField(performance, "creatorTeam", hostTeam);
        ReflectionTestUtils.setField(performance, "depositAmount", 50_000L);

        given(participantRepository.findByPerformance_PerformanceIdAndStatus(performanceId,
                PerformanceParticipant.Status.REGISTERED)).willReturn(List.of(participants));

        SettlementRule rule = mock(SettlementRule.class);
        given(rule.getRulesHash()).willReturn(rulesHash);
        given(rule.getFixedRatioBp()).willReturn(fixedRatioBp);
        given(rule.getSelectionRatioBp()).willReturn(selectionRatioBp);
        given(settlementRuleRepository.findByPerformance_PerformanceId(performanceId))
                .willReturn(Optional.of(rule));
    }

    private static PerformanceParticipant participant(Integer onChainIndex, long teamId,
                                                      String walletAddress, int teamShareBp) {
        Team team = mock(Team.class);
        given(team.getTeamId()).willReturn(teamId);
        PerformanceParticipant participant = mock(PerformanceParticipant.class);
        // 배열 대상 판정은 ShowCreationService.onChainOrder 하나다 - 수락 + 인덱스 둘 다 본다.
        given(participant.isAccepted()).willReturn(true);
        given(participant.getOnChainIndex()).willReturn(onChainIndex);
        given(participant.getTeam()).willReturn(team);
        given(participant.getWalletAddress()).willReturn(walletAddress);
        given(participant.getTeamShareBp()).willReturn(teamShareBp);
        return participant;
    }

    @SuppressWarnings("unchecked")
    private static List<String> addresses(Type<?> array) {
        return ((List<Address>) array.getValue()).stream().map(Address::getValue).toList();
    }

    @SuppressWarnings("unchecked")
    private static List<BigInteger> uint16s(Type<?> array) {
        return ((List<Uint16>) array.getValue()).stream().map(Uint16::getValue).toList();
    }

    private void givenSettlement(long performanceId, Integer validTicketCount) {
        Settlement settlement = mock(Settlement.class);
        given(settlement.getValidTicketCount()).willReturn(validTicketCount);
        given(settlementRepository.findByPerformance_PerformanceId(performanceId))
                .willReturn(Optional.of(settlement));
    }

    private void givenRefund(long chainJobId, String orderRef, long refundAmount) {
        TicketOrder order = mock(TicketOrder.class);
        given(order.getOrderRef()).willReturn(orderRef);
        Refund refund = mock(Refund.class);
        given(refund.getTicketOrder()).willReturn(order);
        given(refund.getRefundAmount()).willReturn(refundAmount);
        given(refundRepository.findByChainJobId(chainJobId)).willReturn(Optional.of(refund));
    }

    /** 문서 13의 시그니처 문자열 → 4바이트 selector. 래퍼 상수를 거치지 않는다. */
    private static String selector(String signature) {
        return Hash.sha3String(signature).substring(0, 10);
    }

    private static String selectorOf(String data) {
        return data.substring(0, 10);
    }

    /**
     * 서명된 raw tx → calldata hex. {@link TransactionDecoder}는 {@code 0x} 없이 돌려주므로
     * 여기서 붙여 selector 비교·디코드의 오프셋을 한 곳으로 모은다.
     */
    private static String dataOf(String signedRawTx) {
        return Numeric.prependHexPrefix(TransactionDecoder.decode(signedRawTx).getData());
    }

    private static SignedRawTransaction decodeTx(String signedRawTx) {
        return (SignedRawTransaction) TransactionDecoder.decode(signedRawTx);
    }

    private static List<Type> decode(String data, TypeReference<?>... types) {
        return FunctionReturnDecoder.decode(data.substring(10), Utils.convert(List.of(types)));
    }
}
