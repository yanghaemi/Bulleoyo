package com.ssafy.b204.common.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 자체 세션 JWT 설정 — API v6 §0.1 (access 30분 / refresh 14일).
 *
 * <p>{@code secret}은 {@code JWT_SECRET} 환경변수에서만 온다. 운영 값은 Jenkins Credentials
 * ({@code B204_ENV})에만 있고 코드·yml에 하드코딩하지 않는다.
 */
@ConfigurationProperties(prefix = "b204.jwt")
public record JwtProperties(
        String secret,
        Duration accessTokenTtl,
        Duration refreshTokenTtl,
        String issuer
) {}
