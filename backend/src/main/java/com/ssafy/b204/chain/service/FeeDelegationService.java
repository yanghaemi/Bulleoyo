package com.ssafy.b204.chain.service;

import com.ssafy.b204.chain.client.KaiaChainClient;
import com.ssafy.b204.chain.config.ChainClientConfig;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.common.error.ErrorCode;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.web3j.crypto.KaiaCredentials;
import org.web3j.crypto.KaiaSignatureData;
import org.web3j.crypto.KaiaTransactionEncoder;
import org.web3j.crypto.Keys;
import org.web3j.crypto.Sign;
import org.web3j.crypto.transaction.type.TxType;
import org.web3j.crypto.transaction.type.TxTypeFeeDelegatedSmartContractExecution;
import org.web3j.rlp.RlpEncoder;
import org.web3j.rlp.RlpList;
import org.web3j.rlp.RlpString;
import org.web3j.rlp.RlpType;
import org.web3j.utils.KaiaTransactionUtils;
import org.web3j.utils.Numeric;

/**
 * 대납(fee delegation) 전송 — API v6 §0.4 "prepare → 서명 → signed-tx → 대납 전송 → receipt 검증"
 * 의 3단계(대납 서명·전송) 담당. PoC 5.
 *
 * <p><b>서버는 사용자 키를 갖지 않는다.</b> 프론트가 Kaia
 * {@code TxTypeFeeDelegatedSmartContractExecution}(0x31)로 <b>발신자 서명만</b> 끝낸 RLP를 보내면,
 * 서버는 그것을 열어보고(검증) fee payer 서명을 덧붙여 전송한다. 사용자 지갑의 KAIA 잔액이 0이어도
 * 성공한다 — 가스는 전액 fee payer가 낸다(스파이크 Layer 3b에서 실측 확인).
 *
 * <pre>
 *  프론트                     서버(이 클래스)                         Kairos
 *    │  senderSignedRlp(0x31)  │                                        │
 *    ├────────────────────────▶│ ① decode: 타입·필드 복원               │
 *    │                         │ ② recover: 서명에서 발신자 주소 복구     │
 *    │                         │ ③ verify : to ∈ 우리 컨트랙트,          │
 *    │                         │            from == 등록 지갑            │
 *    │                         │ ④ sign   : OPERATOR 키로 feePayer 서명  │
 *    │                         ├─ eth_sendRawTransaction ──────────────▶│
 *    │◀── txHash(202 + jobId) ─┤                                        │
 *  (receipt 폴링은 ChainJobWorker가 한다 — 이 클래스는 기다리지 않는다)
 * </pre>
 *
 * <p><b>왜 발신자를 "복구"까지 하나.</b> Kaia 타입 tx는 {@code from}을 RLP 필드로 들고 있어서 읽기만
 * 하면 되지만, 그 필드는 서명과 독립적으로 아무 값이나 적을 수 있다. 서명에서 실제로 복구한 주소와
 * 대조해야 "이 tx를 이 사람이 서명했다"가 성립한다(§0.4 ① "복구된 발신자 주소" · 스파이크 SEC-19).
 *
 * <p><b>에러 코드는 규격 v3에 있는 것만 쓴다</b>(API v6 §16.1). 디코드 실패는
 * {@link ErrorCode#COMMON_VALIDATION_FAILED}(400), 값 불일치는
 * {@link ErrorCode#PAYMENT_AMOUNT_MISMATCH}(409)로 대체한다 — {@code PAYMENT_SIGNED_TX_INVALID}·
 * {@code PAYMENT_TX_MISMATCH}는 신설 제안일 뿐 아직 존재하지 않는다.
 */
@Service
@Slf4j
public class FeeDelegationService {

    /** §0.4 — {@code senderSignedRlp}는 {@code 0x} + hex, 최대 8KB. */
    private static final int MAX_RLP_BYTES = 8 * 1024;

    private final ChainProperties chainProperties;
    private final KaiaChainClient chainClient;
    private final ObjectProvider<KaiaCredentials> operatorProvider;

    public FeeDelegationService(ChainProperties chainProperties,
                                KaiaChainClient chainClient,
                                @Qualifier(ChainClientConfig.OPERATOR_CREDENTIALS)
                                ObjectProvider<KaiaCredentials> operatorProvider) {
        this.chainProperties = chainProperties;
        this.chainClient = chainClient;
        this.operatorProvider = operatorProvider;
    }

    /**
     * 발신자 서명 RLP를 열어본 결과. <b>{@code senderSignedRlp} 자체는 담지 않는다</b> —
     * 로그에 찍힐 여지를 줄인다(개인키는 아니지만 서명값이다).
     *
     * @param from          RLP에 적힌 발신자
     * @param recoveredFrom 서명에서 복구한 발신자. {@code from}과 같아야 한다
     * @param data          calldata. 앞 4바이트가 함수 셀렉터다
     */
    public record DecodedUserTx(
            TxType.Type txType,
            String from,
            String recoveredFrom,
            String to,
            BigInteger value,
            BigInteger nonce,
            BigInteger gasPrice,
            BigInteger gasLimit,
            String data
    ) {

        /** calldata 앞 4바이트. prepare가 내려준 함수와 같은지 도메인이 대조할 때 쓴다. */
        public Optional<String> selector() {
            return ChainFailure.extractSelector(data);
        }

        public boolean senderSignatureValid() {
            return recoveredFrom != null && recoveredFrom.equalsIgnoreCase(from);
        }
    }

    /** 대납 전송이 가능한 상태인지 — RPC + 컨트랙트 주소 + OPERATOR 키. */
    public boolean isAvailable() {
        return chainClient.isAvailable()
                && operatorProvider.getIfAvailable() != null
                && chainProperties.contract() != null
                && chainProperties.contract().isConfigured();
    }

    /**
     * §0.4 {@code signRequests[].feePayer}로 내려갈 운영지갑 주소.
     * §0.7 주소 비노출 규칙의 유일한 예외다 — "수수료를 서비스가 낸다"를 서명 화면이 보여야 한다.
     */
    public Optional<String> feePayerAddress() {
        return Optional.ofNullable(operatorProvider.getIfAvailable()).map(KaiaCredentials::getAddress);
    }

    /**
     * ①② RLP 디코드 + 발신자 복구. <b>네트워크를 타지 않는다</b> — 순수 계산이라 노드 없이 테스트된다.
     *
     * @throws com.ssafy.b204.common.error.BusinessException 형식이 아니거나 대납 SCE 타입이 아니면
     *         {@code COMMON_VALIDATION_FAILED}
     */
    public DecodedUserTx decode(String senderSignedRlp) {
        if (senderSignedRlp == null || senderSignedRlp.isBlank()) {
            throw ErrorCode.COMMON_VALIDATION_FAILED.toException("서명 값이 비어 있습니다.");
        }
        byte[] raw;
        try {
            raw = Numeric.hexStringToByteArray(senderSignedRlp.trim());
        } catch (RuntimeException e) {
            throw ErrorCode.COMMON_VALIDATION_FAILED.toException("서명 형식이 올바르지 않습니다.");
        }
        if (raw.length == 0 || raw.length > MAX_RLP_BYTES) {
            throw ErrorCode.COMMON_VALIDATION_FAILED.toException("서명 형식이 올바르지 않습니다.");
        }

        TxType.Type type;
        try {
            type = KaiaTransactionUtils.getType(raw);
        } catch (RuntimeException e) {
            throw ErrorCode.COMMON_VALIDATION_FAILED.toException("서명 형식이 올바르지 않습니다.");
        }
        // 프론트가 만드는 타입은 §0.4에서 FEE_DELEGATED_SMART_CONTRACT_EXECUTION 하나로 고정이다.
        // 다른 타입(값 전송·계정 변경)을 받아 대납해 주면 우리가 남의 tx 가스를 내주는 창구가 된다.
        if (type != TxType.Type.FEE_DELEGATED_SMART_CONTRACT_EXECUTION) {
            throw ErrorCode.COMMON_VALIDATION_FAILED.toException("지원하지 않는 트랜잭션 형식입니다.");
        }

        TxTypeFeeDelegatedSmartContractExecution tx;
        try {
            tx = TxTypeFeeDelegatedSmartContractExecution.decodeFromRawTransaction(raw);
        } catch (RuntimeException e) {
            // web3j-ext는 디코드 실패를 RuntimeException("There is a error in ...")로 던진다.
            log.debug("대납 tx 디코드 실패", e);
            throw ErrorCode.COMMON_VALIDATION_FAILED.toException("서명 형식이 올바르지 않습니다.");
        }

        return new DecodedUserTx(
                type,
                normalizeAddress(tx.getFrom()),
                recoverSender(tx),
                normalizeAddress(tx.getTo()),
                tx.getValue(),
                tx.getNonce(),
                tx.getGasPrice(),
                tx.getGasLimit(),
                Numeric.toHexString(tx.getPayload()));
    }

    /**
     * ③ 검증 — §0.4 "③ RLP 검증 실패 → 대납 서명하지 않고 4xx, {@code chain_job}을 만들지 않는다".
     *
     * <p>여기서 보는 것은 <b>대납해도 되는 tx인가</b>뿐이다. 금액·주문 대조처럼 도메인이 아는 것은
     * 호출부(payment·performance·rule)가 {@link DecodedUserTx#data()} 셀렉터·인자로 이어서 한다.
     *
     * @param expectedSender 요청자의 등록 지갑 주소({@code wallet.address}). {@code null}이면 생략
     */
    public void verify(DecodedUserTx tx, String expectedSender) {
        if (!tx.senderSignatureValid()) {
            // from 필드와 서명 복구 주소가 다르다 = 위조 시도. 로그를 남긴다(코드 주석 §3.8).
            log.warn("발신자 서명 불일치 from={} recovered={}", tx.from(), tx.recoveredFrom());
            throw ErrorCode.PAYMENT_AMOUNT_MISMATCH.toException();
        }
        if (expectedSender != null && !normalizeAddress(expectedSender).equalsIgnoreCase(tx.from())) {
            log.warn("등록 지갑과 다른 주소의 서명 expected={} actual={}", expectedSender, tx.from());
            throw ErrorCode.PAYMENT_AMOUNT_MISMATCH.toException();
        }
        if (!isOurContract(tx.to())) {
            // 우리 컨트랙트가 아닌 주소로 가는 tx를 대납하면 운영지갑이 남의 가스 지갑이 된다.
            log.warn("대상 컨트랙트가 아님 to={}", tx.to());
            throw ErrorCode.PAYMENT_AMOUNT_MISMATCH.toException();
        }
        if (tx.value() != null && tx.value().signum() != 0) {
            // YoYo는 ERC-20이라 네이티브 value는 언제나 0이어야 한다(§0.4 표).
            log.warn("대납 tx에 네이티브 value가 실려 있음 value={}", tx.value());
            throw ErrorCode.PAYMENT_AMOUNT_MISMATCH.toException();
        }
    }

    /**
     * ④ fee payer 서명 → 최종 raw tx hex. 발신자 서명은 그대로 두고 서명만 덧붙인다.
     *
     * <p>{@code signMessageAsFeePayer(byte[], long, KaiaCredentials)}는 내부에서 타입별 디코드 후
     * {@code FeePayer.sign()}을 호출한다(jar 실측). 즉 우리가 디코드한 객체를 다시 넘길 필요가 없다.
     */
    public String signAsFeePayer(String senderSignedRlp) {
        KaiaCredentials feePayer = operatorProvider.getIfAvailable();
        if (feePayer == null) {
            // 키 없이 대납 경로에 들어왔다 = 호출부 분기 누락.
            throw ErrorCode.COMMON_INTERNAL_ERROR.toException();
        }
        byte[] signed = KaiaTransactionEncoder.signMessageAsFeePayer(
                Numeric.hexStringToByteArray(senderSignedRlp.trim()),
                chainProperties.chainId(),
                feePayer);
        return Numeric.toHexString(signed);
    }

    /**
     * ①~⑤ 전 과정. 성공하면 txHash를 준다 — <b>receipt는 기다리지 않는다</b>(202 + 폴링, §0.3).
     *
     * @param expectedSender 요청자의 등록 지갑 주소. {@code null}이면 발신자 대조를 생략한다
     */
    public String submit(String senderSignedRlp, String expectedSender) {
        DecodedUserTx decoded = decode(senderSignedRlp);
        verify(decoded, expectedSender);
        String txHash = chainClient.sendRawTransaction(signAsFeePayer(senderSignedRlp));
        log.info("대납 전송 완료 to={} from={} txHash={}", decoded.to(), decoded.from(), txHash);
        return txHash;
    }

    /** 우리가 대납해 주는 대상은 YoYo·RevenueSplitter 둘뿐이다. */
    public boolean isOurContract(String address) {
        ChainProperties.Contract contract = chainProperties.contract();
        if (address == null || contract == null || !contract.isConfigured()) {
            return false;
        }
        String target = normalizeAddress(address);
        return target.equalsIgnoreCase(normalizeAddress(contract.yoyoAddress()))
                || target.equalsIgnoreCase(normalizeAddress(contract.splitterAddress()));
    }

    /**
     * 서명에서 발신자 주소를 복구한다.
     *
     * <p>서명 대상 메시지는 web3j-ext가 서명할 때 만드는 것과 같은 구조여야 한다(jar 바이트코드 실측):
     * {@code RLP([ RLP(타입바이트 ‖ rlpValues), chainId, 0, 0 ])}. {@code getEncodedTransactionNoSig()}는
     * chainId를 타지 않으므로 <b>디코드된 tx의 chainId가 0이어도 무방</b>하고, 우리가 설정값(1001)을
     * 넣는다.
     *
     * <p>{@code v}는 EIP-155 규칙({@code recId + chainId*2 + 35})으로 인코딩돼 있다.
     * {@code r}·{@code s}는 RLP에서 앞자리 0이 잘려 오므로 32바이트로 왼쪽 패딩해야
     * {@code Sign.signedMessageToKey}의 사전조건을 통과한다.
     *
     * @return 복구한 주소. 실패하면 {@code null}(호출부가 불일치로 처리한다)
     */
    private String recoverSender(TxTypeFeeDelegatedSmartContractExecution tx) {
        long chainId = chainProperties.chainId();
        List<RlpType> values = new ArrayList<>();
        values.add(RlpString.create(tx.getEncodedTransactionNoSig()));
        values.addAll(KaiaSignatureData.createKaiaSignatureDataFromChainId(chainId).toRlpList().getValues());
        byte[] message = RlpEncoder.encode(new RlpList(values));

        for (KaiaSignatureData signature : tx.getSenderSignatureDataSet()) {
            try {
                long v = Numeric.toBigInt(signature.getV()).longValue();
                long recId = v - chainId * 2 - 35;
                if (recId < 0 || recId > 3) {
                    continue;
                }
                Sign.SignatureData standard = new Sign.SignatureData(
                        (byte) (recId + 27), leftPad32(signature.getR()), leftPad32(signature.getS()));
                BigInteger publicKey = Sign.signedMessageToKey(message, standard);
                return Numeric.prependHexPrefix(Keys.getAddress(publicKey)).toLowerCase(Locale.ROOT);
            } catch (Exception e) {
                log.debug("발신자 복구 실패(다음 서명 시도)", e);
            }
        }
        return null;
    }

    private static byte[] leftPad32(byte[] value) {
        if (value.length == 32) {
            return value;
        }
        byte[] padded = new byte[32];
        int offset = 32 - Math.min(value.length, 32);
        System.arraycopy(value, Math.max(0, value.length - 32), padded, offset, Math.min(value.length, 32));
        return padded;
    }

    private static String normalizeAddress(String address) {
        return address == null ? null : Numeric.prependHexPrefix(address.trim()).toLowerCase(Locale.ROOT);
    }
}
