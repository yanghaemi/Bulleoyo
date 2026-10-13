package com.ssafy.b204.support;

import com.ssafy.b204.common.support.EthCrypto;
import java.math.BigInteger;
import java.security.SecureRandom;
import java.util.HexFormat;
import org.bouncycastle.asn1.x9.X9ECParameters;
import org.bouncycastle.crypto.digests.SHA256Digest;
import org.bouncycastle.crypto.ec.CustomNamedCurves;
import org.bouncycastle.crypto.params.ECDomainParameters;
import org.bouncycastle.crypto.params.ECPrivateKeyParameters;
import org.bouncycastle.crypto.signers.ECDSASigner;
import org.bouncycastle.crypto.signers.HMacDSAKCalculator;
import org.bouncycastle.math.ec.ECPoint;

/**
 * 테스트용 <b>외부 지갑</b>(Kaia Wallet 역할). 개인키를 갖고 {@code personal_sign}을 한다.
 *
 * <p>서버에는 이런 것이 없다 — 서버는 개인키를 다루지 않는다({@code EthCrypto}에 서명 함수가
 * 없는 이유). API-wallet-04 {@code EXTERNAL} 경로를 실제로 검증하려면 <b>서명하는 쪽</b>이
 * 필요해서 테스트에만 둔다.
 *
 * <p>서명은 RFC 6979 결정적 ECDSA(secp256k1) + low-s 정규화 + 복구 id 부착이다. 지갑이 하는 것과
 * 같은 절차이고, 검증은 서버의 {@link EthCrypto#recoverPersonalSign}가 독립적으로 한다.
 */
public final class TestWallet {

    private static final X9ECParameters PARAMS = CustomNamedCurves.getByName("secp256k1");
    private static final ECDomainParameters CURVE = new ECDomainParameters(
            PARAMS.getCurve(), PARAMS.getG(), PARAMS.getN(), PARAMS.getH());

    private final BigInteger privateKey;
    private final String address;

    private TestWallet(BigInteger privateKey) {
        this.privateKey = privateKey;
        this.address = EthCrypto.addressFromPublicKey(publicKeyHex())
                .orElseThrow(() -> new IllegalStateException("공개키에서 주소를 못 만들었다"));
    }

    public static TestWallet random() {
        byte[] raw = new byte[32];
        new SecureRandom().nextBytes(raw);
        BigInteger key = new BigInteger(1, raw).mod(CURVE.getN().subtract(BigInteger.ONE))
                .add(BigInteger.ONE);
        return new TestWallet(key);
    }

    public static TestWallet of(BigInteger privateKey) {
        return new TestWallet(privateKey);
    }

    /** {@code 0x} + 40 hex. */
    public String address() {
        return address;
    }

    /**
     * {@code 0x} + 64 hex 개인키. <b>테스트 전용</b>이며 서버는 이 값을 어디서도 받지 않는다.
     *
     * <p>Kaia {@code 0x31} 대납 tx 서명을 web3j-ext {@code KaiaCredentials}로 만들 때 쓴다
     * ({@link KaiaTxBuilder}) — 서버가 {@code ecrecover}로 발신자를 복구하므로 테스트도
     * <b>진짜 서명</b>을 만들어야 한다. 더미 서명은 이제 서버가 거부한다.
     */
    public String privateKeyHex() {
        return "0x" + HexFormat.of().formatHex(toFixed32(privateKey));
    }

    /** {@code 04} 접두 비압축 공개키 hex — Web3Auth의 {@code public_key} 클레임 모양. */
    public String publicKeyHex() {
        ECPoint point = CURVE.getG().multiply(privateKey).normalize();
        return "0x" + HexFormat.of().formatHex(point.getEncoded(false));
    }

    /**
     * EIP-191 {@code personal_sign}. 반환은 {@code 0x} + 130 hex({@code r||s||v}).
     *
     * <p>{@code v}는 27/28로 붙인다 — 복구 결과가 이 지갑 주소가 되는 쪽을 고른다. 지갑 SDK가
     * 하는 일과 같다.
     */
    public String personalSign(String message) {
        byte[] hash = EthCrypto.keccak256(EthCrypto.prefixed(message));

        ECDSASigner signer = new ECDSASigner(new HMacDSAKCalculator(new SHA256Digest()));
        signer.init(true, new ECPrivateKeyParameters(privateKey, CURVE));
        BigInteger[] rs = signer.generateSignature(hash);
        BigInteger r = rs[0];
        BigInteger s = rs[1];
        // low-s 정규화. 이더리움 지갑은 s > n/2 서명을 만들지 않는다.
        BigInteger halfN = CURVE.getN().shiftRight(1);
        if (s.compareTo(halfN) > 0) {
            s = CURVE.getN().subtract(s);
        }

        String rsHex = HexFormat.of().formatHex(toFixed32(r)) + HexFormat.of().formatHex(toFixed32(s));
        for (int v = 27; v <= 28; v++) {
            String candidate = "0x" + rsHex + String.format("%02x", v);
            if (EthCrypto.recoverPersonalSign(message, candidate)
                    .filter(recovered -> EthCrypto.sameAddress(recovered, address))
                    .isPresent()) {
                return candidate;
            }
        }
        throw new IllegalStateException("복구 id를 찾지 못했다 — 서명 절차가 잘못됐다");
    }

    private static byte[] toFixed32(BigInteger value) {
        byte[] raw = value.toByteArray();
        byte[] out = new byte[32];
        if (raw.length > 32) {
            System.arraycopy(raw, raw.length - 32, out, 0, 32);
        } else {
            System.arraycopy(raw, 0, out, 32 - raw.length, raw.length);
        }
        return out;
    }
}
