package com.ssafy.b204.chain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

import com.ssafy.b204.chain.client.KaiaChainClient;
import com.ssafy.b204.chain.service.FeeDelegationService;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import java.math.BigInteger;
import java.util.Arrays;
import java.util.Collections;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.web3j.abi.FunctionEncoder;
import org.web3j.abi.datatypes.Address;
import org.web3j.abi.datatypes.Function;
import org.web3j.abi.datatypes.generated.Uint256;
import org.web3j.crypto.KaiaCredentials;
import org.web3j.crypto.KaiaRawTransaction;
import org.web3j.crypto.KaiaTransactionEncoder;
import org.web3j.crypto.transaction.type.TxType;
import org.web3j.crypto.transaction.type.TxTypeFeeDelegatedSmartContractExecution;
import org.web3j.utils.Numeric;

/**
 * PoC 5 대납 흐름의 <b>네트워크 없는</b> 검증 — API v6 §0.4 ①②③④.
 *
 * <p>발신자 서명 RLP를 테스트 안에서 직접 만들어(프론트가 하는 일) 서버가 그것을 열어보고
 * 검증하고 fee payer 서명을 덧붙이는 데까지를 확인한다. 전송(⑤)만 노드가 필요하므로
 * {@code ChainFeeDelegationE2ETest}로 분리했다.
 *
 * <p>키는 <b>공개된 테스트 키</b>다(Hardhat 기본 계정 #0·#1). 실제 자산이 없고 어떤 환경에서도
 * 재현되어야 하므로 랜덤 생성 대신 고정한다 — 운영 키는 코드에 절대 넣지 않는다.
 */
class FeeDelegationServiceTest {

    private static final String SENDER_KEY =
            "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    private static final String FEE_PAYER_KEY =
            "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

    private static final long CHAIN_ID = 1001L;
    private static final String YOYO = "0x5f1e2d3c4b5a69788796a5b4c3d2e1f009182736";
    private static final String SPLITTER = "0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
    private static final String FOREIGN = "0x1111111111111111111111111111111111111111";

    private KaiaCredentials sender;
    private KaiaCredentials feePayer;
    private FeeDelegationService service;
    private KaiaChainClient chainClient;

    @BeforeEach
    void setUp() {
        sender = KaiaCredentials.create(SENDER_KEY);
        feePayer = KaiaCredentials.create(FEE_PAYER_KEY);
        chainClient = mock(KaiaChainClient.class);

        @SuppressWarnings("unchecked")
        ObjectProvider<KaiaCredentials> operatorProvider = mock(ObjectProvider.class);
        given(operatorProvider.getIfAvailable()).willReturn(feePayer);

        ChainProperties properties = new ChainProperties(
                "https://public-en-kairos.node.kaia.io", CHAIN_ID, FEE_PAYER_KEY, FEE_PAYER_KEY, null,
                new ChainProperties.Contract(YOYO, SPLITTER));
        service = new FeeDelegationService(properties, chainClient, operatorProvider);
    }

    /** 프론트가 하는 일 — Kaia {@code FeeDelegatedSmartContractExecution}(0x31) 발신자 서명. */
    private String senderSignedRlp(String to, BigInteger value) {
        Function approve = new Function("approve",
                Arrays.asList(new Address(SPLITTER), new Uint256(BigInteger.valueOf(50_000))),
                Collections.emptyList());
        byte[] payload = Numeric.hexStringToByteArray(FunctionEncoder.encode(approve));
        KaiaRawTransaction raw = KaiaRawTransaction.createTransaction(
                TxType.Type.FEE_DELEGATED_SMART_CONTRACT_EXECUTION,
                BigInteger.valueOf(7),                    // nonce
                BigInteger.valueOf(27_500_000_000L),      // gasPrice(peb) — Kairos 실측값
                BigInteger.valueOf(200_000),              // gasLimit
                to, value, sender.getAddress(), payload);
        return Numeric.toHexString(KaiaTransactionEncoder.signMessage(raw, CHAIN_ID, sender));
    }

    @Test
    @DisplayName("① 발신자 서명 RLP를 열어 to·from·value·nonce·calldata를 그대로 복원한다")
    void decodesSenderSignedRlp() {
        FeeDelegationService.DecodedUserTx decoded = service.decode(senderSignedRlp(YOYO, BigInteger.ZERO));

        assertThat(decoded.txType()).isEqualTo(TxType.Type.FEE_DELEGATED_SMART_CONTRACT_EXECUTION);
        assertThat(decoded.to()).isEqualToIgnoringCase(YOYO);
        assertThat(decoded.from()).isEqualToIgnoringCase(sender.getAddress());
        assertThat(decoded.value()).isEqualTo(BigInteger.ZERO);
        assertThat(decoded.nonce()).isEqualTo(BigInteger.valueOf(7));
        // approve(address,uint256)
        assertThat(decoded.selector()).contains("0x095ea7b3");
    }

    @Test
    @DisplayName("② 서명에서 복구한 주소가 RLP의 from과 일치한다 — 위조 판별의 근거")
    void recoversSenderFromSignature() {
        FeeDelegationService.DecodedUserTx decoded = service.decode(senderSignedRlp(YOYO, BigInteger.ZERO));

        assertThat(decoded.recoveredFrom()).isEqualToIgnoringCase(sender.getAddress());
        assertThat(decoded.senderSignatureValid()).isTrue();
    }

    @Test
    @DisplayName("③ 등록 지갑 주소와 우리 컨트랙트면 통과한다")
    void verifyPassesForOwnContractAndRegisteredWallet() {
        FeeDelegationService.DecodedUserTx decoded = service.decode(senderSignedRlp(SPLITTER, BigInteger.ZERO));

        service.verify(decoded, sender.getAddress());
    }

    @Test
    @DisplayName("③ 우리 컨트랙트가 아닌 주소로 가는 tx는 대납하지 않는다")
    void verifyRejectsForeignContract() {
        FeeDelegationService.DecodedUserTx decoded = service.decode(senderSignedRlp(FOREIGN, BigInteger.ZERO));

        assertThatThrownBy(() -> service.verify(decoded, sender.getAddress()))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.PAYMENT_AMOUNT_MISMATCH);
    }

    @Test
    @DisplayName("③ 요청자의 등록 지갑이 아닌 사람이 서명했으면 거절한다")
    void verifyRejectsUnknownSender() {
        FeeDelegationService.DecodedUserTx decoded = service.decode(senderSignedRlp(YOYO, BigInteger.ZERO));

        assertThatThrownBy(() -> service.verify(decoded, FOREIGN))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.PAYMENT_AMOUNT_MISMATCH);
    }

    @Test
    @DisplayName("③ 네이티브 value가 실려 있으면 거절한다 — YoYo는 ERC-20이라 value는 항상 0")
    void verifyRejectsNonZeroValue() {
        FeeDelegationService.DecodedUserTx decoded =
                service.decode(senderSignedRlp(YOYO, BigInteger.valueOf(1_000)));

        assertThatThrownBy(() -> service.verify(decoded, sender.getAddress()))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.PAYMENT_AMOUNT_MISMATCH);
    }

    @Test
    @DisplayName("① 대납 SCE(0x31)가 아닌 값은 디코드 단계에서 400으로 막는다")
    void decodeRejectsNonFeeDelegatedPayload() {
        // 0x08 = FEE_DELEGATED_VALUE_TRANSFER 가 아닌 임의 바이트 나열(형식 자체가 아님)
        assertThatThrownBy(() -> service.decode("0xdeadbeef"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COMMON_VALIDATION_FAILED);
        assertThatThrownBy(() -> service.decode(""))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COMMON_VALIDATION_FAILED);
    }

    @Test
    @DisplayName("④ fee payer 서명을 덧붙여도 발신자 서명은 보존되고 feePayer 주소가 채워진다")
    void signsAsFeePayerWithoutTouchingSenderSignature() {
        String signedByUser = senderSignedRlp(YOYO, BigInteger.ZERO);

        String signedByBoth = service.signAsFeePayer(signedByUser);

        TxTypeFeeDelegatedSmartContractExecution decoded =
                TxTypeFeeDelegatedSmartContractExecution.decodeFromRawTransaction(signedByBoth);
        assertThat(decoded.getFeePayer()).isEqualToIgnoringCase(feePayer.getAddress());
        assertThat(decoded.getFrom()).isEqualToIgnoringCase(sender.getAddress());
        // 최종 RLP도 여전히 0x31 타입이다.
        assertThat(signedByBoth).startsWith("0x31");
        // 발신자 서명이 그대로 살아 있어야 노드가 받아준다.
        assertThat(service.decode(signedByBoth).senderSignatureValid()).isTrue();
    }

    @Test
    @DisplayName("⑤ submit 은 검증을 통과한 tx만 노드로 보낸다")
    void submitSendsSignedTransaction() {
        given(chainClient.sendRawTransaction(org.mockito.ArgumentMatchers.anyString()))
                .willReturn("0x" + "ab".repeat(32));

        String txHash = service.submit(senderSignedRlp(YOYO, BigInteger.ZERO), sender.getAddress());

        assertThat(txHash).hasSize(66);
    }

    @Test
    @DisplayName("발신자 KAIA 잔액과 무관하게 서명·검증이 성립한다 — 가스는 fee payer가 낸다")
    void senderNeedsNoKaia() {
        // 이 테스트는 잔액을 한 번도 조회하지 않는다는 사실 자체가 근거다.
        FeeDelegationService.DecodedUserTx decoded = service.decode(senderSignedRlp(YOYO, BigInteger.ZERO));
        service.verify(decoded, sender.getAddress());

        org.mockito.Mockito.verifyNoInteractions(chainClient);
    }
}
