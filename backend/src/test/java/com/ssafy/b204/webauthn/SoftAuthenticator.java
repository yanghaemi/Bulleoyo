package com.ssafy.b204.webauthn;

import com.webauthn4j.converter.util.ObjectConverter;
import com.webauthn4j.data.attestation.authenticator.EC2COSEKey;
import com.webauthn4j.data.attestation.statement.COSEAlgorithmIdentifier;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 테스트용 <b>소프트웨어 인증기</b> — 브라우저 + 플랫폼 인증기(Windows Hello·Face ID)가 만드는 것과
 * 같은 바이트를 만든다.
 *
 * <p>고정 벡터(실기기에서 뽑은 응답) 대신 이것을 쓰는 이유: 실기기 응답은 챌린지가 박혀 있어
 * 서버가 매번 새로 만드는 챌린지와 맞출 수 없다. 여기서는 P-256 키를 매번 새로 만들어 서버가 준
 * 챌린지로 진짜 ES256 서명을 한다 — 서버의 서명 검증이 mock 없이 실제로 돈다.
 *
 * <p>바이트 구조(WebAuthn §6.1): authenticatorData = rpIdHash(32) · flags(1) · signCount(4, BE)
 * · [attestedCredentialData = aaguid(16) · credIdLen(2) · credId · COSE_Key]. 서명 대상은
 * {@code authenticatorData || SHA-256(clientDataJSON)}.
 */
public final class SoftAuthenticator {

    public static final int FLAG_UP = 0x01;
    public static final int FLAG_UV = 0x04;
    private static final int FLAG_AT = 0x40;

    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final ObjectConverter CONVERTER = new ObjectConverter();

    private final KeyPair keyPair;
    private final byte[] credentialId;

    public SoftAuthenticator() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
            generator.initialize(new ECGenParameterSpec("secp256r1"));
            this.keyPair = generator.generateKeyPair();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        this.credentialId = new byte[16];
        new SecureRandom().nextBytes(credentialId);
    }

    public String credentialIdB64() {
        return B64.encodeToString(credentialId);
    }

    /** {@code navigator.credentials.create} 결과. 키 이름은 API-webauthn-02 본문과 같다. */
    public Map<String, Object> register(String challenge, String rpId, String origin, int flags) {
        byte[] clientData = clientDataJson("webauthn.create", challenge, origin);
        byte[] coseKey = CONVERTER.getCborConverter().writeValueAsBytes(
                EC2COSEKey.create((ECPublicKey) keyPair.getPublic(), COSEAlgorithmIdentifier.ES256));
        ByteArrayOutputStream authData = new ByteArrayOutputStream();
        authData.writeBytes(sha256(rpId.getBytes(StandardCharsets.UTF_8)));
        authData.write(flags | FLAG_AT);
        authData.writeBytes(ByteBuffer.allocate(4).putInt(0).array());
        authData.writeBytes(new byte[16]); // AAGUID — attestation none 이면 0
        authData.writeBytes(ByteBuffer.allocate(2).putShort((short) credentialId.length).array());
        authData.writeBytes(credentialId);
        authData.writeBytes(coseKey);

        Map<String, Object> attestation = new LinkedHashMap<>();
        attestation.put("fmt", "none");
        attestation.put("attStmt", Map.of());
        attestation.put("authData", authData.toByteArray());
        byte[] attestationObject = CONVERTER.getCborConverter().writeValueAsBytes(attestation);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("credentialId", credentialIdB64());
        body.put("clientDataJSON", B64.encodeToString(clientData));
        body.put("attestationObject", B64.encodeToString(attestationObject));
        body.put("transports", java.util.List.of("internal"));
        return body;
    }

    /** {@code navigator.credentials.get} 결과. 키 이름은 API-webauthn-04 본문과 같다. */
    public Map<String, Object> assertion(String challenge, String rpId, String origin, int flags,
                                         long signCount) {
        byte[] clientData = clientDataJson("webauthn.get", challenge, origin);
        ByteArrayOutputStream authData = new ByteArrayOutputStream();
        authData.writeBytes(sha256(rpId.getBytes(StandardCharsets.UTF_8)));
        authData.write(flags);
        authData.writeBytes(ByteBuffer.allocate(4).putInt((int) signCount).array());
        byte[] authenticatorData = authData.toByteArray();

        byte[] signature = sign(concat(authenticatorData, sha256(clientData)));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("credentialId", credentialIdB64());
        body.put("clientDataJSON", B64.encodeToString(clientData));
        body.put("authenticatorData", B64.encodeToString(authenticatorData));
        body.put("signature", B64.encodeToString(signature));
        return body;
    }

    private static byte[] clientDataJson(String type, String challenge, String origin) {
        return ("{\"type\":\"" + type + "\",\"challenge\":\"" + challenge + "\",\"origin\":\"" + origin
                + "\",\"crossOrigin\":false}").getBytes(StandardCharsets.UTF_8);
    }

    private byte[] sign(byte[] data) {
        try {
            Signature signer = Signature.getInstance("SHA256withECDSA"); // DER — WebAuthn ES256 형식
            signer.initSign(keyPair.getPrivate());
            signer.update(data);
            return signer.sign();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static byte[] sha256(byte[] data) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(data);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static byte[] concat(byte[] a, byte[] b) {
        byte[] out = new byte[a.length + b.length];
        System.arraycopy(a, 0, out, 0, a.length);
        System.arraycopy(b, 0, out, a.length, b.length);
        return out;
    }
}
