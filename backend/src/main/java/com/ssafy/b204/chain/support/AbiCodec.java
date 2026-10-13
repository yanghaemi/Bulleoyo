package com.ssafy.b204.chain.support;

import com.ssafy.b204.common.support.EthCrypto;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Locale;

/**
 * 정적 타입 전용 ABI 인코더 — {@code prepare}가 내려줄 {@code data}(calldata)를 만든다.
 *
 * <p>우리가 서명 요청하는 함수는 <b>전부 정적 타입</b>이다({@code uint256}·{@code bytes32}·
 * {@code address}·{@code uint8}·{@code uint16}). 동적 타입(배열·문자열)이 없으므로 오프셋 계산이
 * 필요 없고, 인자를 32바이트 워드로 이어 붙이면 끝난다. 그래서 web3j 없이도 정확하다.
 *
 * <p>selector는 상수로 박지 않고 <b>시그니처에서 keccak-256으로 계산</b>한다 — 계약 문서
 * (13_컨트랙트_인터페이스_v1 §8)의 표를 손으로 옮기면 오타가 조용히 통과한다. 계산값이 문서와
 * 같은지는 {@code ContractCallsTest}가 고정한다.
 */
public final class AbiCodec {

    private AbiCodec() {
    }

    /** {@code keccak256(signature)[0..4]} — calldata 앞 4바이트. */
    public static String selector(String signature) {
        byte[] hash = EthCrypto.keccak256(signature.getBytes(StandardCharsets.US_ASCII));
        return "0x" + hex(Arrays.copyOfRange(hash, 0, 4));
    }

    /** 부호 없는 정수 한 워드. {@code uint8}·{@code uint16}·{@code uint256} 모두 같은 32바이트다. */
    public static String word(long value) {
        return word(BigInteger.valueOf(value));
    }

    public static String word(BigInteger value) {
        if (value == null || value.signum() < 0) {
            throw new IllegalArgumentException("ABI uint 인자는 0 이상이어야 한다");
        }
        return hex(pad32(value.toByteArray()));
    }

    /** 주소 한 워드 — 상위 12바이트는 0이다. */
    public static String addressWord(String address) {
        String clean = strip0x(address).toLowerCase(Locale.ROOT);
        if (clean.length() != 40) {
            throw new IllegalArgumentException("주소는 0x + 40 hex 여야 한다");
        }
        return "0".repeat(24) + clean;
    }

    /** {@code bytes32} 한 워드 — 이미 32바이트인 값을 그대로 쓴다. */
    public static String bytes32Word(String hex32) {
        String clean = strip0x(hex32).toLowerCase(Locale.ROOT);
        if (clean.length() != 64) {
            throw new IllegalArgumentException("bytes32 는 0x + 64 hex 여야 한다");
        }
        return clean;
    }

    /** selector + 워드들을 이어 붙인 calldata. */
    public static String call(String signature, String... words) {
        StringBuilder sb = new StringBuilder(selector(signature));
        for (String w : words) {
            sb.append(w);
        }
        return sb.toString();
    }

    private static byte[] pad32(byte[] raw) {
        byte[] out = new byte[32];
        if (raw.length > 32) {
            System.arraycopy(raw, raw.length - 32, out, 0, 32);
        } else {
            System.arraycopy(raw, 0, out, 32 - raw.length, raw.length);
        }
        return out;
    }

    private static String strip0x(String s) {
        if (s == null) {
            throw new IllegalArgumentException("ABI 인자가 null 이다");
        }
        String t = s.trim();
        return t.startsWith("0x") || t.startsWith("0X") ? t.substring(2) : t;
    }

    static String hex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(Character.forDigit((b >> 4) & 0xF, 16));
            sb.append(Character.forDigit(b & 0xF, 16));
        }
        return sb.toString();
    }
}
