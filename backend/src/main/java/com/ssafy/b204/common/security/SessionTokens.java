package com.ssafy.b204.common.security;

import java.time.Instant;

/**
 * 발급된 회원 세션 한 쌍 — API v6 §0.1 (access 30분 / refresh 14일).
 *
 * <p>API-member-01·02·03의 응답 4필드({@code accessToken}·{@code accessTokenExpiresAt}·
 * {@code refreshToken}·{@code refreshTokenExpiresAt})가 그대로 이 값이다.
 *
 * <p>{@code refreshJti}는 응답에 담지 않는다 — Redis {@code auth:refresh:{jti}} 키를 만들기 위한
 * 서버 내부 값이다.
 */
public record SessionTokens(
        String accessToken,
        Instant accessTokenExpiresAt,
        String refreshToken,
        Instant refreshTokenExpiresAt,
        String refreshJti
) {}
