package com.ssafy.b204.support;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.gen.ECKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Web3Auth를 대신하는 <b>진짜 JWKS 서버</b>.
 *
 * <p><b>검증을 mock으로 우회하지 않는다</b>는 것이 이 클래스의 존재 이유다. 서버는 운영과 완전히
 * 같은 경로 — {@code NimbusJwtDecoder.withJwkSetUri(...)}로 HTTP JWKS를 받아 ES256 서명을
 * 검증하고 {@code iss}·{@code aud}·{@code exp}를 확인하는 경로 — 를 탄다. 다른 것은 서명 키의
 * 출처뿐이다. {@code Web3AuthTokenVerifier}를 {@code @MockBean}으로 갈아 끼우면 이 카드의 핵심인
 * JWKS 검증이 한 줄도 실행되지 않는다.
 *
 * <p>JDK 내장 {@link HttpServer}를 쓴다 — 테스트용 HTTP 서버 라이브러리를 새로 들이지 않기 위해서다.
 *
 * <p>토큰의 지갑 클레임은 Web3Auth의 실제 모양({@code wallets: [{type, curve, public_key}]} /
 * {@code [{type, address}]}) 둘 다 만들 수 있게 열어 뒀다 — 서버가 공개키에서 주소를 파생하는
 * 경로까지 검증하기 위해서다.
 */
public final class Web3AuthStubServer {

    public static final String CLIENT_ID = "test-web3auth-client-id";
    public static final String ISSUER = "https://stub.web3auth.local";

    private final HttpServer server;
    private final ECKey signingKey;

    private Web3AuthStubServer() {
        try {
            this.signingKey = new ECKeyGenerator(Curve.P_256)
                    .keyID(UUID.randomUUID().toString())
                    .generate();
            this.server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (JOSEException | IOException e) {
            throw new IllegalStateException("Web3Auth JWKS 스텁 서버를 띄우지 못했다", e);
        }

        byte[] jwks = new JWKSet(signingKey.toPublicJWK()).toString()
                .getBytes(StandardCharsets.UTF_8);
        server.createContext("/jwks", exchange -> {
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, jwks.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(jwks);
            }
        });
        server.setExecutor(null);
        server.start();
    }

    public static Web3AuthStubServer start() {
        return new Web3AuthStubServer();
    }

    public String jwksUri() {
        return "http://127.0.0.1:" + server.getAddress().getPort() + "/jwks";
    }

    /** 정상 idToken — {@code wallets[0].address}로 주소를 담는다. */
    public String idToken(String verifierId, String email, String name, String address) {
        return sign(claims(verifierId, email, name)
                .claim("wallets", List.of(Map.of("type", "ethereum", "address", address)))
                .build());
    }

    /** 소셜 MPC 지갑 모양 — 주소 대신 공개키를 담는다. 서버가 keccak-256으로 파생해야 한다. */
    public String idTokenWithPublicKey(String verifierId, String email, String name,
                                       String uncompressedPublicKeyHex) {
        return sign(claims(verifierId, email, name)
                .claim("wallets", List.of(Map.of("type", "web3auth_app_key", "curve", "secp256k1",
                        "public_key", uncompressedPublicKeyHex)))
                .build());
    }

    /** {@code aud}가 우리 클라이언트 ID가 아닌 토큰 — 401이어야 한다. */
    public String idTokenWithWrongAudience(String verifierId, String email, String address) {
        return sign(new JWTClaimsSet.Builder()
                .subject(verifierId)
                .issuer(ISSUER)
                .audience("someone-elses-client-id")
                .claim("verifierId", verifierId)
                .claim("email", email)
                .issueTime(Date.from(Instant.now()))
                .expirationTime(Date.from(Instant.now().plus(10, ChronoUnit.MINUTES)))
                .claim("wallets", List.of(Map.of("type", "ethereum", "address", address)))
                .build());
    }

    /** 이미 만료된 토큰 — 401이어야 한다. */
    public String expiredIdToken(String verifierId, String email, String address) {
        return sign(new JWTClaimsSet.Builder()
                .subject(verifierId)
                .issuer(ISSUER)
                .audience(CLIENT_ID)
                .claim("verifierId", verifierId)
                .claim("email", email)
                .issueTime(Date.from(Instant.now().minus(2, ChronoUnit.HOURS)))
                .expirationTime(Date.from(Instant.now().minus(1, ChronoUnit.HOURS)))
                .claim("wallets", List.of(Map.of("type", "ethereum", "address", address)))
                .build());
    }

    /**
     * JWKS에 없는 키로 서명한 토큰 — 서명 검증에서 떨어져야 한다. 위조 토큰을 흉내낸다.
     */
    public String forgedIdToken(String verifierId, String email, String address) {
        try {
            ECKey other = new ECKeyGenerator(Curve.P_256).keyID(signingKey.getKeyID()).generate();
            SignedJWT jwt = new SignedJWT(
                    new JWSHeader.Builder(JWSAlgorithm.ES256).keyID(other.getKeyID()).build(),
                    claims(verifierId, email, "Forged")
                            .claim("wallets",
                                    List.of(Map.of("type", "ethereum", "address", address)))
                            .build());
            jwt.sign(new ECDSASigner(other));
            return jwt.serialize();
        } catch (JOSEException e) {
            throw new IllegalStateException(e);
        }
    }

    private JWTClaimsSet.Builder claims(String verifierId, String email, String name) {
        return new JWTClaimsSet.Builder()
                .subject(verifierId)
                .issuer(ISSUER)
                .audience(CLIENT_ID)
                .claim("verifier", "b204-test-verifier")
                .claim("verifierId", verifierId)
                .claim("email", email)
                .claim("name", name)
                .issueTime(Date.from(Instant.now()))
                .expirationTime(Date.from(Instant.now().plus(10, ChronoUnit.MINUTES)));
    }

    private String sign(JWTClaimsSet claims) {
        try {
            SignedJWT jwt = new SignedJWT(
                    new JWSHeader.Builder(JWSAlgorithm.ES256).keyID(signingKey.getKeyID()).build(),
                    claims);
            jwt.sign(new ECDSASigner(signingKey));
            return jwt.serialize();
        } catch (JOSEException e) {
            throw new IllegalStateException(e);
        }
    }
}
