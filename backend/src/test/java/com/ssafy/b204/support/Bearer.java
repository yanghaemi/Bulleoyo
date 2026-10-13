package com.ssafy.b204.support;

import com.ssafy.b204.common.security.JwtTokenProvider;
import com.ssafy.b204.member.entity.Member;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * 서비스 레벨 픽스처로 만든 회원을 <b>HTTP 경계 너머</b>에서 그대로 쓰기 위한 토큰 발급기.
 *
 * <p>{@code SecurityContext} 를 직접 주입하지 않는다 — 그러면 {@code JwtAuthenticationFilter} 를
 * 건너뛰어 "운영과 같은 경로" 라는 전제가 깨진다. 진짜 세션 JWT 를 발급해 헤더로 보낸다.
 */
public final class Bearer {

    private Bearer() {}

    public static RequestPostProcessor of(JwtTokenProvider tokens, Member member) {
        return of(tokens, member, member.isAdmin());
    }

    public static RequestPostProcessor of(JwtTokenProvider tokens, Member member, boolean admin) {
        String accessToken = tokens
                .issue(member.getMemberId(), member.getEmail(), admin, null)
                .accessToken();
        return request -> {
            request.addHeader(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken);
            return request;
        };
    }
}
