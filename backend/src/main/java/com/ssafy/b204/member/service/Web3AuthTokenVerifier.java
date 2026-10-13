package com.ssafy.b204.member.service;

import com.ssafy.b204.common.config.Web3AuthProperties;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.support.EthCrypto;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;

/**
 * Web3Auth idToken 검증 — API v6 §1 API-member-01 시스템 처리 1.
 *
 * <blockquote>Web3Auth JWKS 공개키로 {@code idToken} 서명 검증 → {@code aud}(클라이언트 ID)·
 * {@code iss}·{@code exp}·{@code nonce} 확인 → 토큰의 지갑 클레임과 {@code address} 대조.
 * </blockquote>
 *
 * <p><b>이 검증을 우회할 수 있는 경로를 만들지 않는다.</b> 로그인이 곧 가입이므로 idToken 검증이
 * 뚫리면 임의의 회원을 만들 수 있다.
 *
 * <p><b>실패 코드가 두 갈래다</b>(§0.10 · §16.1).
 *
 * <ul>
 *   <li>서명·{@code aud}·{@code iss}·{@code exp} 불합격 → {@code AUTH_TOKEN_INVALID}(401).
 *       전용 코드 {@code AUTH_WEB3AUTH_TOKEN_INVALID}는 §16.1 <b>신설 제안</b>이며 본문에서
 *       쓰지 않기로 못박혀 있어 여기서도 쓰지 않는다.
 *   <li>JWKS를 못 읽음(네트워크·5xx) → {@code COMMON_EXTERNAL_SERVICE_ERROR}(502). 토큰 잘못이
 *       아니므로 401로 뭉개면 클라이언트가 잘못된 행동(로그아웃)을 한다.
 * </ul>
 *
 * <p><b>디코더는 지연 생성한다.</b> 기동 시 JWKS를 읽으러 나가면 네트워크가 없는 개발 환경에서
 * 애플리케이션이 뜨지 않는다(개발 환경 안내 v1 §3.1). {@link NimbusJwtDecoder}는 첫 검증 때
 * JWKS를 받아 캐시한다.
 *
 * <p><b>{@code nonce}는 검사하지 않는다</b> — API-member-01의 요청 본문에 서버가 대조할 nonce가
 * 없다(명세 §1 Body 표에 항목이 없다). 이 항목은 산출물의 "명세 확인 필요"에 적었다.
 */
@Component
public class Web3AuthTokenVerifier {

    private static final Logger log = LoggerFactory.getLogger(Web3AuthTokenVerifier.class);

    /** Web3Auth idToken의 지갑 클레임. 배열이며 소셜 MPC 지갑은 공개키로, 외부 지갑은 주소로 온다. */
    private static final String CLAIM_WALLETS = "wallets";

    private final Web3AuthProperties properties;
    private volatile JwtDecoder decoder;

    public Web3AuthTokenVerifier(Web3AuthProperties properties) {
        this.properties = properties;
    }

    /**
     * 서명·클레임을 검증하고 회원 조립에 필요한 값만 뽑는다.
     *
     * @throws BusinessException {@code AUTH_TOKEN_INVALID}(401) · {@code COMMON_EXTERNAL_SERVICE_ERROR}(502)
     */
    public VerifiedIdToken verify(String idToken) {
        if (!properties.isConfigured()) {
            // JWKS 주소조차 없으면 검증을 흉내내지 않는다. 통과시키면 인증이 사라진다.
            throw BusinessException.of(ErrorCode.COMMON_EXTERNAL_SERVICE_ERROR);
        }
        Jwt jwt;
        try {
            jwt = decoder().decode(idToken);
        } catch (BadJwtException e) {
            // 서명 불일치·형식 오류·클레임 검증 실패.
            log.debug("Web3Auth idToken 검증 실패", e);
            throw BusinessException.of(ErrorCode.AUTH_TOKEN_INVALID);
        } catch (JwtException e) {
            // JWKS 조회 실패(네트워크·5xx). 토큰 잘못이 아니다.
            log.warn("Web3Auth JWKS 조회 실패", e);
            throw BusinessException.of(ErrorCode.COMMON_EXTERNAL_SERVICE_ERROR);
        }

        return new VerifiedIdToken(
                jwt.getSubject(),
                firstNonBlank(jwt.getClaimAsString("verifierId"), jwt.getSubject()),
                jwt.getClaimAsString("verifier"),
                jwt.getClaimAsString("email"),
                jwt.getClaimAsString("name"),
                walletAddresses(jwt));
    }

    /**
     * 지갑 클레임에서 주소를 모은다.
     *
     * <p>Web3Auth는 소셜 MPC 지갑을 {@code {type, curve, public_key}}로, 외부 지갑을
     * {@code {type: "ethereum", address}}로 담는다. 전자는 주소가 없으므로
     * keccak-256으로 파생한다({@link EthCrypto#addressFromPublicKey}).
     */
    private static List<String> walletAddresses(Jwt jwt) {
        Object claim = jwt.getClaim(CLAIM_WALLETS);
        List<String> addresses = new ArrayList<>();
        if (!(claim instanceof List<?> wallets)) {
            return addresses;
        }
        for (Object entry : wallets) {
            if (!(entry instanceof Map<?, ?> wallet)) {
                continue;
            }
            Object address = wallet.get("address");
            if (address instanceof String s && EthCrypto.isAddress(s)) {
                addresses.add(EthCrypto.normalizeAddress(s));
                continue;
            }
            Object publicKey = wallet.get("public_key");
            if (publicKey instanceof String s) {
                EthCrypto.addressFromPublicKey(s).ifPresent(addresses::add);
            }
        }
        return addresses;
    }

    private JwtDecoder decoder() {
        JwtDecoder local = decoder;
        if (local == null) {
            synchronized (this) {
                local = decoder;
                if (local == null) {
                    local = build();
                    decoder = local;
                }
            }
        }
        return local;
    }

    private JwtDecoder build() {
        NimbusJwtDecoder jwtDecoder = NimbusJwtDecoder.withJwkSetUri(properties.jwksUri())
                // Web3Auth Sapphire 는 ES256(P-256)으로 서명한다. RS256도 함께 허용해
                // 발급 설정이 바뀌어도 로그인 전체가 멈추지 않게 한다.
                .jwsAlgorithms(algorithms -> {
                    algorithms.add(SignatureAlgorithm.ES256);
                    algorithms.add(SignatureAlgorithm.RS256);
                })
                .build();

        List<OAuth2TokenValidator<Jwt>> validators = new ArrayList<>();
        // exp·nbf. iss 는 아래에서 별도로 건다.
        validators.add(JwtValidators.createDefault());
        if (properties.hasIssuer()) {
            validators.add(new JwtIssuerValidator(properties.issuer()));
        }
        if (properties.hasClientId()) {
            validators.add(new JwtAudienceValidator(properties.clientId()));
        }
        jwtDecoder.setJwtValidator(new org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator<>(validators));
        return jwtDecoder;
    }

    private static String firstNonBlank(String a, String b) {
        return a != null && !a.isBlank() ? a : b;
    }

    /** {@code aud}에 우리 클라이언트 ID가 들어 있는지. Web3Auth는 배열로 담는다. */
    private record JwtAudienceValidator(String clientId) implements OAuth2TokenValidator<Jwt> {

        @Override
        public OAuth2TokenValidatorResult validate(Jwt token) {
            List<String> audience = token.getAudience();
            if (audience != null && audience.contains(clientId)) {
                return OAuth2TokenValidatorResult.success();
            }
            return OAuth2TokenValidatorResult.failure(
                    new org.springframework.security.oauth2.core.OAuth2Error("invalid_token",
                            "aud 가 이 서비스의 Web3Auth 클라이언트 ID가 아니다", null));
        }
    }

    /** {@code iss}가 설정한 발급자와 같은지. */
    private record JwtIssuerValidator(String issuer) implements OAuth2TokenValidator<Jwt> {

        @Override
        public OAuth2TokenValidatorResult validate(Jwt token) {
            String actual = token.getIssuer() == null ? null : token.getIssuer().toString();
            if (issuer.equals(actual)) {
                return OAuth2TokenValidatorResult.success();
            }
            return OAuth2TokenValidatorResult.failure(
                    new org.springframework.security.oauth2.core.OAuth2Error("invalid_token",
                            "iss 가 Web3Auth 발급자가 아니다", null));
        }
    }

    /**
     * 검증을 통과한 idToken에서 뽑은 값.
     *
     * <p><b>개인키·니모닉·MPC 샤드는 담지 않는다.</b> 토큰에도 없고 서버가 가질 이유도 없다.
     *
     * @param walletAddresses 토큰이 <b>주장한</b> 지갑 주소. 등록된 주소가 아니다
     */
    public record VerifiedIdToken(String subject, String verifierId, String verifier, String email,
                                  String name, List<String> walletAddresses) {

        /** 요청 {@code address}가 토큰의 지갑 클레임과 일치하는지(대소문자 무시). */
        public boolean claimsAddress(String address) {
            return walletAddresses.stream().anyMatch(a -> EthCrypto.sameAddress(a, address));
        }

        /** 클레임이 아예 없으면 대조할 대상이 없다 — 그 상태를 성공으로 읽지 않기 위해 구분한다. */
        public boolean hasWalletClaim() {
            return !walletAddresses.isEmpty();
        }

        public Optional<String> firstWalletAddress() {
            return walletAddresses.stream().findFirst();
        }
    }
}
