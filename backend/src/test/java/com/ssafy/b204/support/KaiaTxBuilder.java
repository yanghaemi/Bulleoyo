package com.ssafy.b204.support;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.util.HexFormat;
import java.util.List;
import org.web3j.crypto.KaiaCredentials;
import org.web3j.crypto.KaiaRawTransaction;
import org.web3j.crypto.KaiaTransactionEncoder;
import org.web3j.crypto.transaction.type.TxType;
import org.web3j.utils.Numeric;

/**
 * 테스트용 Kaia {@code TxTypeFeeDelegatedSmartContractExecution}(0x31) 발신자 서명 RLP 생성기 —
 * <b>프론트(ethers-ext)가 하는 일</b>을 그대로 한다.
 *
 * <p>서버가 {@code signed-tx}에서 하는 대조(§0.4 ③)는 구조를 실제로 디코드하고 <b>서명에서
 * 발신자를 복구</b>해 이뤄진다({@code FeeDelegationService}). 그래서 테스트도 문자열을 지어내지
 * 않고 <b>진짜 개인키로 서명한다</b> — 더미 서명을 넣으면 서버가 {@code PAYMENT_AMOUNT_MISMATCH}로
 * 거부하므로, 서명이 통과한다는 사실 자체가 ecrecover 검증이 실증됐다는 뜻이다.
 *
 * <pre>
 * 0x31 || RLP([nonce, gasPrice, gas, to, value, from, input, txSignatures])
 * </pre>
 *
 * <p>{@link #unsigned}만 손으로 RLP를 쌓는다 — 서명 배열이 <b>빈</b> tx는 인코더가 만들어주지
 * 않기 때문이고, "서명 없는 tx를 서버가 400으로 막는다"를 보려면 그 모양이 필요하다.
 */
public final class KaiaTxBuilder {

    public static final int TX_TYPE = 0x31;

    /** {@code application-test.yml} · Kairos. 서명 해시에 들어가므로 서버 설정과 같아야 한다. */
    public static final long CHAIN_ID = 1001L;

    private static final BigInteger GAS_PRICE = BigInteger.valueOf(25_000_000_000L);
    private static final BigInteger GAS_LIMIT = BigInteger.valueOf(300_000L);

    private KaiaTxBuilder() {
    }

    /** 정상 tx — {@code from}·{@code to}·{@code input}이 서버 기대값과 같고 서명도 진짜다. */
    public static String feeDelegatedSmartContractExecution(long nonce, TestWallet sender, String to,
                                                            String input) {
        return build(nonce, sender, to, input, BigInteger.ZERO);
    }

    /** {@code value != 0}인 tx — YoYo는 ERC-20이라 서버가 거부해야 한다. */
    public static String withValue(long nonce, TestWallet sender, String to, String input,
                                   BigInteger value) {
        return build(nonce, sender, to, input, value);
    }

    /**
     * 발신자 서명이 다른 지갑 것인 tx — {@code from} 필드만 바꿔 치는 위조다.
     *
     * <p>RLP에 적힌 {@code from}과 서명에서 복구한 주소가 갈린다 — 서버는 이것을 거부해야 한다
     * (§0.4 ③ "복구된 발신자 주소"). 서명은 {@code signer}가 하고 {@code from}은
     * {@code claimedFrom}으로 적는다.
     */
    public static String forgedSender(long nonce, TestWallet signer, String claimedFrom, String to,
                                      String input) {
        return sign(nonce, signer, claimedFrom, to, input, BigInteger.ZERO);
    }

    /** 서명 배열이 빈 tx — 발신자가 서명하지 않았다. */
    public static String unsigned(long nonce, String from, String to, String input) {
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        write(body, encodeUint(BigInteger.valueOf(nonce)));
        write(body, encodeUint(GAS_PRICE));
        write(body, encodeUint(GAS_LIMIT));
        write(body, encodeBytes(hex(to)));
        write(body, encodeUint(BigInteger.ZERO));
        write(body, encodeBytes(hex(from)));
        write(body, encodeBytes(hex(input)));
        write(body, encodeList(List.of()));
        return "0x" + HexFormat.of().formatHex(prefixType(encodeList(List.of(body.toByteArray()))));
    }

    private static String build(long nonce, TestWallet sender, String to, String input,
                                BigInteger value) {
        return sign(nonce, sender, sender.address(), to, input, value);
    }

    private static String sign(long nonce, TestWallet signer, String from, String to, String input,
                               BigInteger value) {
        KaiaRawTransaction raw = KaiaRawTransaction.createTransaction(
                TxType.Type.FEE_DELEGATED_SMART_CONTRACT_EXECUTION,
                BigInteger.valueOf(nonce), GAS_PRICE, GAS_LIMIT, to, value, from,
                Numeric.hexStringToByteArray(input));
        return Numeric.toHexString(KaiaTransactionEncoder.signMessage(raw, CHAIN_ID,
                KaiaCredentials.create(signer.privateKeyHex())));
    }

    private static byte[] prefixType(byte[] payload) {
        byte[] out = new byte[payload.length + 1];
        out[0] = (byte) TX_TYPE;
        System.arraycopy(payload, 0, out, 1, payload.length);
        return out;
    }

    // ------------------------------------------------------------------ RLP 인코딩(unsigned 전용)

    private static byte[] encodeUint(BigInteger value) {
        if (value.signum() == 0) {
            return encodeBytes(new byte[0]);
        }
        byte[] raw = value.toByteArray();
        int offset = raw.length > 1 && raw[0] == 0 ? 1 : 0;
        byte[] trimmed = new byte[raw.length - offset];
        System.arraycopy(raw, offset, trimmed, 0, trimmed.length);
        return encodeBytes(trimmed);
    }

    private static byte[] encodeBytes(byte[] value) {
        if (value.length == 1 && (value[0] & 0xFF) < 0x80) {
            return value;
        }
        return withLengthPrefix(value, 0x80, 0xb7);
    }

    private static byte[] encodeList(List<byte[]> items) {
        ByteArrayOutputStream payload = new ByteArrayOutputStream();
        items.forEach(item -> write(payload, item));
        return withLengthPrefix(payload.toByteArray(), 0xc0, 0xf7);
    }

    private static byte[] withLengthPrefix(byte[] payload, int shortBase, int longBase) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        if (payload.length <= 55) {
            out.write(shortBase + payload.length);
        } else {
            byte[] length = BigInteger.valueOf(payload.length).toByteArray();
            int offset = length.length > 1 && length[0] == 0 ? 1 : 0;
            out.write(longBase + (length.length - offset));
            out.write(length, offset, length.length - offset);
        }
        write(out, payload);
        return out.toByteArray();
    }

    private static void write(ByteArrayOutputStream out, byte[] bytes) {
        out.write(bytes, 0, bytes.length);
    }

    private static byte[] hex(String value) {
        String clean = value.startsWith("0x") || value.startsWith("0X") ? value.substring(2) : value;
        return clean.isEmpty() ? new byte[0] : HexFormat.of().parseHex(clean);
    }
}
