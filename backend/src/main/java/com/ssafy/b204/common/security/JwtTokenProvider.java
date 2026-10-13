package com.ssafy.b204.common.security;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.ssafy.b204.common.config.JwtProperties;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import java.nio.charset.StandardCharsets;
import java.text.ParseException;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * 자체 세션 JWT 발급·검증 — API v6 §0.1 (access 30분 / refresh 14일).
 *
 * <p><b>Web3Auth idToken과 다른 토큰이다.</b> idToken은 로그인 1회에만 쓰이고
 * {@code Authorization} 헤더로 절대 쓰지 않는다(§0.1). 이 클래스가 만드는 HS256 토큰만이 세션이다.
 *
 * <p>jjwt를 추가하지 않는다 — JWKS 검증에 이미 들어 있는 nimbus-jose-jwt로 대칭키 서명도 된다
 * (b204-stack backend 편: "spring-security-oauth2-jose ... jjwt 추가 불필요").
 *
 * <p><b>클레임</b>
 *
 * <table border="1">
 *   <caption>세션 JWT 클레임</caption>
 *   <tr><th>키<th>뜻
 *   <tr><td>{@code sub}<td>{@code member_id}
 *   <tr><td>{@code jti}<td>토큰 식별자. refresh는 이 값이 Redis {@code auth:refresh:{jti}} 키가 된다
 *   <tr><td>{@code typ}<td>{@code access} / {@code refresh}. 서로 바꿔 쓰지 못하게 하는 구분자다
 *   <tr><td>{@code email}·{@code adm}<td>{@link MemberPrincipal} 조립용
 *   <tr><td>{@code wca}<td><b>idToken {@code wallets} 클레임의 주소.</b> API-wallet-04의
 *       {@code provider=WEB3AUTH} 경로가 "세션에 보관한 그 클레임"과 요청 {@code address}를
 *       대조해야 하므로 세션이 들고 다닌다(§3 API-wallet-04 요구사항). 회원의 <b>등록된</b> 지갑
 *       주소가 아니라 <b>토큰이 주장한</b> 주소다 — 둘을 섞지 않는다
 * </table>
 *
 * <p>서명 키는 {@code JWT_SECRET} 환경변수에서만 온다. HS256은 32바이트 이상을 요구하므로
 * 짧은 값이면 기동 시점에 실패한다 — 운영에서 조용히 약한 키로 도는 것보다 낫다.
 */
@Component
public class JwtTokenProvider {

    public static final String TYPE_ACCESS = "access";
    public static final String TYPE_REFRESH = "refresh";

    private static final String CLAIM_TYPE = "typ";
    private static final String CLAIM_EMAIL = "email";
    private static final String CLAIM_ADMIN = "adm";
    private static final String CLAIM_WALLET_CLAIM_ADDRESS = "wca";

    private final JwtProperties properties;
    private final MACSigner signer;
    private final MACVerifier verifier;

    public JwtTokenProvider(JwtProperties properties) {
        this.properties = properties;
        byte[] secret = properties.secret().getBytes(StandardCharsets.UTF_8);
        try {
            this.signer = new MACSigner(secret);
            this.verifier = new MACVerifier(secret);
        } catch (JOSEException e) {
            // HS256은 최소 32바이트를 요구한다. 기동을 막는 편이 낫다.
            throw new IllegalStateException("b204.jwt.secret 이 HS256에 쓰기에 너무 짧다(32바이트 이상).", e);
        }
    }

    /** 로그인·재발급이 한 번에 만드는 세션 한 쌍. */
    public SessionTokens issue(Long memberId, String email, boolean admin,
                               String walletClaimAddress) {
        Instant now = Instant.now();
        Instant accessExp = now.plus(ttl(properties.accessTokenTtl(), Duration.ofMinutes(30)));
        Instant refreshExp = now.plus(ttl(properties.refreshTokenTtl(), Duration.ofDays(14)));
        String refreshJti = UUID.randomUUID().toString();

        String access = sign(new JWTClaimsSet.Builder()
                .subject(String.valueOf(memberId))
                .jwtID(UUID.randomUUID().toString())
                .issuer(properties.issuer())
                .issueTime(Date.from(now))
                .expirationTime(Date.from(accessExp))
                .claim(CLAIM_TYPE, TYPE_ACCESS)
                .claim(CLAIM_EMAIL, email)
                .claim(CLAIM_ADMIN, admin)
                .claim(CLAIM_WALLET_CLAIM_ADDRESS, walletClaimAddress)
                .build());

        String refresh = sign(new JWTClaimsSet.Builder()
                .subject(String.valueOf(memberId))
                .jwtID(refreshJti)
                .issuer(properties.issuer())
                .issueTime(Date.from(now))
                .expirationTime(Date.from(refreshExp))
                .claim(CLAIM_TYPE, TYPE_REFRESH)
                .claim(CLAIM_EMAIL, email)
                .claim(CLAIM_ADMIN, admin)
                .claim(CLAIM_WALLET_CLAIM_ADDRESS, walletClaimAddress)
                .build());

        return new SessionTokens(access, accessExp, refresh, refreshExp, refreshJti);
    }

    /**
     * 서명·만료·종류를 검증하고 클레임을 돌려준다.
     *
     * @throws BusinessException {@code AUTH_TOKEN_EXPIRED}(만료) ·
     *                           {@code AUTH_TOKEN_INVALID}(서명 불일치·형식 오류·종류 불일치)
     */
    public Claims parse(String token, String expectedType) {
        SignedJWT jwt;
        JWTClaimsSet claims;
        try {
            jwt = SignedJWT.parse(token);
            if (!jwt.verify(verifier)) {
                throw BusinessException.of(ErrorCode.AUTH_TOKEN_INVALID);
            }
            claims = jwt.getJWTClaimsSet();
        } catch (ParseException | JOSEException | IllegalArgumentException e) {
            throw BusinessException.of(ErrorCode.AUTH_TOKEN_INVALID);
        }

        Date exp = claims.getExpirationTime();
        if (exp == null || exp.toInstant().isBefore(Instant.now())) {
            throw BusinessException.of(ErrorCode.AUTH_TOKEN_EXPIRED);
        }
        return toClaims(claims, expectedType);
    }

    /**
     * 만료를 무시하고 클레임만 읽는다 — 로그아웃(API-member-04) 전용.
     *
     * <p>이미 만료·폐기된 토큰으로 호출해도 200이어야 하므로(명세 요구사항) 만료를 이유로 막지
     * 않는다. 서명은 여전히 검증한다 — 남의 세션을 지우지 못하게.
     */
    public Claims parseIgnoringExpiry(String token, String expectedType) {
        try {
            SignedJWT jwt = SignedJWT.parse(token);
            if (!jwt.verify(verifier)) {
                throw BusinessException.of(ErrorCode.AUTH_TOKEN_INVALID);
            }
            return toClaims(jwt.getJWTClaimsSet(), expectedType);
        } catch (ParseException | JOSEException | IllegalArgumentException e) {
            throw BusinessException.of(ErrorCode.AUTH_TOKEN_INVALID);
        }
    }

    private Claims toClaims(JWTClaimsSet claims, String expectedType) {
        Object type = claims.getClaim(CLAIM_TYPE);
        if (!expectedType.equals(type)) {
            // access 를 refresh 자리에 넣는(또는 그 반대) 시도.
            throw BusinessException.of(ErrorCode.AUTH_TOKEN_INVALID);
        }
        try {
            return new Claims(
                    Long.parseLong(claims.getSubject()),
                    claims.getJWTID(),
                    claims.getStringClaim(CLAIM_EMAIL),
                    Boolean.TRUE.equals(claims.getClaim(CLAIM_ADMIN)),
                    claims.getStringClaim(CLAIM_WALLET_CLAIM_ADDRESS),
                    claims.getExpirationTime() == null ? null : claims.getExpirationTime().toInstant());
        } catch (ParseException | NumberFormatException | NullPointerException e) {
            throw BusinessException.of(ErrorCode.AUTH_TOKEN_INVALID);
        }
    }

    private String sign(JWTClaimsSet claims) {
        SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
        try {
            jwt.sign(signer);
        } catch (JOSEException e) {
            throw BusinessException.of(ErrorCode.COMMON_INTERNAL_ERROR, e);
        }
        return jwt.serialize();
    }

    private static Duration ttl(Duration configured, Duration fallback) {
        return configured != null ? configured : fallback;
    }

    /** 세션 토큰에서 뽑은 값. */
    public record Claims(Long memberId, String jti, String email, boolean admin,
                         String walletClaimAddress, Instant expiresAt) {

        public MemberPrincipal toPrincipal() {
            return new MemberPrincipal(memberId, email, admin, walletClaimAddress);
        }
    }
}
