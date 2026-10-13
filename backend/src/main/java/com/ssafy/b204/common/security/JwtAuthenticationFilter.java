package com.ssafy.b204.common.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.response.ApiResponse;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * {@code Authorization: Bearer {accessToken}}을 {@link MemberPrincipal}로 바꾸는 필터.
 *
 * <p><b>헤더가 없으면 통과시킨다.</b> 인증이 필요한지 아닌지는 {@code SecurityConfig}의 인가
 * 규칙이 정하고(공개 API는 헤더가 없어야 정상이다, §0.1), 여기서 막으면 공개 조회가 401이 된다.
 *
 * <p><b>헤더가 있는데 토큰이 잘못됐으면 여기서 끝낸다.</b> 코드가 두 개로 갈리고 클라이언트
 * 동작이 정반대이기 때문이다(§0.10).
 *
 * <ul>
 *   <li>{@code AUTH_TOKEN_EXPIRED}(401) — <b>이 코드에서만</b> 재발급(API-member-03) 후 재시도
 *   <li>{@code AUTH_TOKEN_INVALID}(401) — 재발급 시도 없이 즉시 로그아웃
 * </ul>
 *
 * <p>필터 단계라 {@code @RestControllerAdvice}가 잡지 못한다. 그래서 응답 래퍼를 직접 쓴다 —
 * 규격 §2의 "컨트롤러에서 실패 응답 조립 금지"는 컨트롤러 이야기이고, 필터·엔트리포인트는
 * 예외적으로 직접 쓴다({@code SecurityConfig}도 같다).
 */
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER = "Bearer ";

    private final JwtTokenProvider tokenProvider;
    private final ObjectMapper objectMapper;

    public JwtAuthenticationFilter(JwtTokenProvider tokenProvider, ObjectMapper objectMapper) {
        this.tokenProvider = tokenProvider;
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header == null || !header.startsWith(BEARER)) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = header.substring(BEARER.length()).trim();
        MemberPrincipal principal;
        try {
            principal = tokenProvider.parse(token, JwtTokenProvider.TYPE_ACCESS).toPrincipal();
        } catch (BusinessException e) {
            write(response, e.getErrorCode());
            return;
        }

        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
        authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
        SecurityContextHolder.getContext().setAuthentication(authentication);

        filterChain.doFilter(request, response);
    }

    private void write(HttpServletResponse response, ErrorCode code) throws IOException {
        SecurityContextHolder.clearContext();
        response.setStatus(code.getStatus().value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        objectMapper.writeValue(response.getWriter(), ApiResponse.error(code));
    }
}
