package com.ssafy.b204.common.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Web3Auth idToken 검증 설정 — API v6 §1 (API-member-01 시스템 처리 1).
 *
 * <p>서버는 idToken을 <b>JWKS 공개키로 직접 검증</b>한다. Web3Auth에 되묻는 introspection 호출이
 * 없고, 외부 호출은 JWKS 조회 하나뿐이다(실패는 {@code COMMON_EXTERNAL_SERVICE_ERROR} 502).
 *
 * <p>{@code clientId}가 비면 {@code aud} 검사를 건너뛴다 — 클라이언트 ID가 없는 팀원도 나머지
 * API를 개발할 수 있어야 하기 때문이다(개발 환경 안내 v1 §3.1). 운영에서는 반드시 채운다.
 *
 * <p>비밀 값이 아니다. {@code clientId}는 프론트 환경변수로도 나가는 공개 값이다(API-coin-04).
 */
@ConfigurationProperties(prefix = "b204.web3auth")
public record Web3AuthProperties(String clientId, String jwksUri, String issuer) {

    public boolean hasClientId() {
        return clientId != null && !clientId.isBlank();
    }

    public boolean hasIssuer() {
        return issuer != null && !issuer.isBlank();
    }

    public boolean isConfigured() {
        return jwksUri != null && !jwksUri.isBlank();
    }
}
