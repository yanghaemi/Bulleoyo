package com.ssafy.b204.common.support;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Locale;
import java.util.Optional;
import org.bouncycastle.asn1.x9.X9ECParameters;
import org.bouncycastle.crypto.digests.KeccakDigest;
import org.bouncycastle.crypto.ec.CustomNamedCurves;
import org.bouncycastle.crypto.params.ECDomainParameters;
import org.bouncycastle.math.ec.ECAlgorithms;
import org.bouncycastle.math.ec.ECPoint;
import org.bouncycastle.math.ec.custom.sec.SecP256K1Curve;

/**
 * 이더리움 계열 주소·서명 원시 연산 — keccak-256과 secp256k1 공개키 복구.
 *
 * <p>쓰는 곳은 둘이다.
 *
 * <ol>
 *   <li><b>API-member-01</b> — Web3Auth idToken의 {@code wallets} 클레임이 주소 대신
 *       {@code public_key}로 올 때(소셜 MPC 지갑) 주소를 파생해 요청 {@code address}와 대조한다.
 *   <li><b>API-wallet-04 {@code provider=EXTERNAL}</b> — 챌린지 메시지에 대한
 *       {@code personal_sign} 서명에서 {@code ecrecover}로 주소를 복원한다.
 * </ol>
 *
 * <p>JDK에는 keccak-256도 secp256k1 복구도 없어 BouncyCastle {@code bcprov}를 쓴다(전이 의존 0).
 * 알고리즘은 EIP-191 / Ethereum Yellow Paper 표준이며 web3j의 {@code Sign.signedPrefixedMessageToKey}
 * 와 같은 절차다 — 나중에 체인 모듈이 web3j를 들여오면 이 클래스를 그쪽 호출로 대체할 수 있다.
 *
 * <p><b>서버는 개인키를 다루지 않는다.</b> 이 클래스에 서명 생성 함수가 없는 것이 그 증거다.
 */
public final class EthCrypto {

    /** EIP-191 {@code personal_sign} 접두. 지갑이 서명 전에 붙이는 그 문자열이다. */
    private static final String PERSONAL_SIGN_PREFIX = "Ethereum Signed Message:\n";

    private static final X9ECParameters SECP256K1 = CustomNamedCurves.getByName("secp256k1");
    private static final ECDomainParameters CURVE = new ECDomainParameters(
            SECP256K1.getCurve(), SECP256K1.getG(), SECP256K1.getN(), SECP256K1.getH());

    private EthCrypto() {
    }

    // ------------------------------------------------------------------ keccak

    public static byte[] keccak256(byte[] input) {
        KeccakDigest digest = new KeccakDigest(256);
        digest.update(input, 0, input.length);
        byte[] out = new byte[digest.getDigestSize()];
        digest.doFinal(out, 0);
        return out;
    }

    // ------------------------------------------------------------------ 주소

    /**
     * 공개키 hex에서 주소를 파생한다. {@code 04} 접두 비압축(130자)·raw(128자)·압축(66자)을 받는다.
     *
     * @return {@code 0x} + 40 hex 소문자. 형식이 아니면 {@link Optional#empty()}
     */
    public static Optional<String> addressFromPublicKey(String publicKeyHex) {
        if (publicKeyHex == null) {
            return Optional.empty();
        }
        String hex = strip0x(publicKeyHex.trim());
        if (!hex.matches("(?i)^[0-9a-f]+$")) {
            return Optional.empty();
        }
        byte[] xy;
        try {
            if (hex.length() == 130 && hex.startsWith("04")) {
                xy = hexToBytes(hex.substring(2));
            } else if (hex.length() == 128) {
                xy = hexToBytes(hex);
            } else if (hex.length() == 66 && (hex.startsWith("02") || hex.startsWith("03"))) {
                ECPoint point = CURVE.getCurve().decodePoint(hexToBytes(hex)).normalize();
                xy = concat(toFixed32(point.getAffineXCoord().toBigInteger()),
                        toFixed32(point.getAffineYCoord().toBigInteger()));
            } else {
                return Optional.empty();
            }
        } catch (RuntimeException e) {
            return Optional.empty();
        }
        return Optional.of(addressFromXy(xy));
    }

    /** 64바이트 {@code X||Y}에서 주소를 만든다 — keccak-256의 마지막 20바이트. */
    private static String addressFromXy(byte[] xy) {
        byte[] hash = keccak256(xy);
        return "0x" + bytesToHex(Arrays.copyOfRange(hash, hash.length - 20, hash.length));
    }

    /** 대소문자·{@code 0x} 표기 차이를 무시한 주소 비교. 체크섬 표기는 값이 아니라 표기다. */
    public static boolean sameAddress(String a, String b) {
        if (a == null || b == null) {
            return false;
        }
        return normalizeAddress(a).equals(normalizeAddress(b));
    }

    /** 비교·저장 기준 표기 — {@code 0x} + 소문자 40 hex. */
    public static String normalizeAddress(String address) {
        return "0x" + strip0x(address.trim()).toLowerCase(Locale.ROOT);
    }

    public static boolean isAddress(String address) {
        return address != null && address.matches("^0x[0-9a-fA-F]{40}$");
    }

    // ------------------------------------------------------------------ ecrecover

    /**
     * EIP-191 {@code personal_sign} 서명에서 서명자 주소를 복원한다.
     *
     * <p>서명은 {@code 0x} + 130 hex(65바이트 {@code r||s||v})다. {@code v}는 지갑에 따라
     * {@code 27/28} 또는 {@code 0/1}로 오므로 둘 다 받는다.
     *
     * @return {@code 0x} + 40 hex 소문자. 복원 불가면 {@link Optional#empty()}
     */
    public static Optional<String> recoverPersonalSign(String message, String signatureHex) {
        if (message == null || signatureHex == null) {
            return Optional.empty();
        }
        String hex = strip0x(signatureHex.trim());
        if (hex.length() != 130 || !hex.matches("(?i)^[0-9a-f]+$")) {
            return Optional.empty();
        }
        byte[] sig;
        try {
            sig = hexToBytes(hex);
        } catch (RuntimeException e) {
            return Optional.empty();
        }

        BigInteger r = new BigInteger(1, Arrays.copyOfRange(sig, 0, 32));
        BigInteger s = new BigInteger(1, Arrays.copyOfRange(sig, 32, 64));
        int v = sig[64] & 0xFF;
        int recId = v >= 27 ? v - 27 : v;
        if (recId < 0 || recId > 3 || r.signum() <= 0 || s.signum() <= 0) {
            return Optional.empty();
        }

        byte[] messageHash = keccak256(prefixed(message));
        return recover(recId, r, s, messageHash).map(EthCrypto::addressFromXy);
    }

    /** {@code "Ethereum Signed Message:\n" + len + message}의 UTF-8 바이트. */
    public static byte[] prefixed(String message) {
        byte[] body = message.getBytes(StandardCharsets.UTF_8);
        byte[] prefix = (PERSONAL_SIGN_PREFIX + body.length).getBytes(StandardCharsets.UTF_8);
        return concat(prefix, body);
    }

    /**
     * SEC 1 §4.1.6 공개키 복구. 표준 절차이며 web3j {@code Sign.recoverFromSignature}와 같다.
     *
     * @return 64바이트 {@code X||Y}
     */
    private static Optional<byte[]> recover(int recId, BigInteger r, BigInteger s,
                                            byte[] messageHash) {
        BigInteger n = CURVE.getN();
        BigInteger i = BigInteger.valueOf((long) recId / 2);
        BigInteger x = r.add(i.multiply(n));

        BigInteger prime = SecP256K1Curve.q;
        if (x.compareTo(prime) >= 0) {
            return Optional.empty();
        }

        ECPoint rPoint = decompressKey(x, (recId & 1) == 1);
        if (!rPoint.multiply(n).isInfinity()) {
            return Optional.empty();
        }

        BigInteger e = new BigInteger(1, messageHash);
        BigInteger eInv = BigInteger.ZERO.subtract(e).mod(n);
        BigInteger rInv = r.modInverse(n);
        BigInteger srInv = rInv.multiply(s).mod(n);
        BigInteger eInvrInv = rInv.multiply(eInv).mod(n);

        ECPoint q = ECAlgorithms.sumOfTwoMultiplies(CURVE.getG(), eInvrInv, rPoint, srInv)
                .normalize();
        if (q.isInfinity()) {
            return Optional.empty();
        }
        byte[] encoded = q.getEncoded(false); // 04 || X || Y
        return Optional.of(Arrays.copyOfRange(encoded, 1, encoded.length));
    }

    private static ECPoint decompressKey(BigInteger xBN, boolean yBit) {
        byte[] compEnc = new byte[33];
        compEnc[0] = (byte) (yBit ? 0x03 : 0x02);
        byte[] xBytes = toFixed32(xBN);
        System.arraycopy(xBytes, 0, compEnc, 1, 32);
        return CURVE.getCurve().decodePoint(compEnc);
    }

    // ------------------------------------------------------------------ hex

    private static String strip0x(String s) {
        return s.startsWith("0x") || s.startsWith("0X") ? s.substring(2) : s;
    }

    private static byte[] hexToBytes(String hex) {
        int len = hex.length();
        byte[] out = new byte[len / 2];
        for (int i = 0; i < out.length; i++) {
            out[i] = (byte) Integer.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
        }
        return out;
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(Character.forDigit((b >> 4) & 0xF, 16));
            sb.append(Character.forDigit(b & 0xF, 16));
        }
        return sb.toString();
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

    private static byte[] concat(byte[] a, byte[] b) {
        byte[] out = new byte[a.length + b.length];
        System.arraycopy(a, 0, out, 0, a.length);
        System.arraycopy(b, 0, out, a.length, b.length);
        return out;
    }
}
