package com.ssafy.b204.common.config;

import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.response.ApiResponse;
import com.ssafy.b204.common.security.JwtAuthenticationFilter;
import com.ssafy.b204.common.security.JwtTokenProvider;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * 인증·인가 설정.
 *
 * <p>세션을 쓰지 않는다({@code STATELESS}) — 회원 세션은 자체 JWT(access 30분 / refresh 14일)이고
 * 리프레시 토큰만 Redis {@code auth:refresh:{jti}}에 둔다(API v6 §0.1·§0.12).
 *
 * <p><b>공개 API</b>(§0.1) — 아래 경로는 {@code Authorization} 헤더가 필요 없다.
 *
 * <ul>
 *   <li>{@code GET /api/v1/performances}, {@code GET /api/v1/performances/{id}}
 *   <li>{@code GET /api/v1/coin/supply}, {@code /coin/rates}, {@code /coin/config}
 *   <li>{@code GET /api/v1/public/settlement/{shareToken}}
 *   <li>인증 발급 경로 {@code POST /api/v1/auth/**}
 * </ul>
 *
 * <p>입장 API(API-entry-01·02)는 {@code Authorization} 대신 {@code X-Entry-Token} 헤더로도
 * 인증된다. 그 판정은 필터가 아니라 서비스가 하므로 여기서는 인증을 요구하지 않고 통과시킨다 —
 * 검표 링크 토큰 보유자와 참여팀 회원 둘 다 받아야 하기 때문이다.
 *
 * <p>{@code /actuator/**}는 permitAll이다. 외부 접근은 호스트 Nginx가 404로 막고, Prometheus는
 * 서버 안에서 {@code 127.0.0.1:8080}으로 붙는다(개발 환경 안내 v1 §4).
 *
 * <p>{@link JwtAuthenticationFilter}가 {@code Authorization: Bearer}를
 * {@code MemberPrincipal}로 바꾼다. 헤더가 없으면 통과시키고 인가 규칙이 401을 결정한다 —
 * 공개 API는 헤더 없이 200이어야 한다(§0.1).
 */
@Configuration
@EnableMethodSecurity // 컨트롤러의 @PreAuthorize 를 켠다
public class SecurityConfig {

    private static final String[] PUBLIC_GET = {
            "/api/v1/performances",
            "/api/v1/performances/*",
            "/api/v1/performances/*/media/*",
            "/api/v1/coin/supply",
            "/api/v1/coin/rates",
            "/api/v1/coin/config",
            "/api/v1/public/settlement/*"
    };

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, ObjectMapper objectMapper,
                                           JwtTokenProvider tokenProvider) throws Exception {
        http
                // 토큰 기반이고 쿠키 세션을 쓰지 않으므로 CSRF 토큰이 필요 없다.
                .csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // 헬스체크·메트릭 — 외부 노출은 Nginx가 막는다
                        .requestMatchers("/actuator/**").permitAll()
                        // 세션 발급 경로
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/**").permitAll()
                        // 공개 조회
                        .requestMatchers(HttpMethod.GET, PUBLIC_GET).permitAll()
                        // 입장 API — X-Entry-Token 판정을 서비스가 한다
                        .requestMatchers("/api/v1/entries/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/performances/*/entries").permitAll()
                        // 관리자
                        .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                        .anyRequest().authenticated())
                // 인증·인가 실패도 ApiResponse 래퍼로 내린다. 필터 단계라
                // @RestControllerAdvice 가 잡지 못하므로 여기서 직접 쓴다.
                .exceptionHandling(e -> e
                        .authenticationEntryPoint((req, res, ex) ->
                                write(res, objectMapper, ErrorCode.COMMON_UNAUTHORIZED))
                        .accessDeniedHandler((req, res, ex) ->
                                write(res, objectMapper, ErrorCode.COMMON_FORBIDDEN)))
                .addFilterBefore(new JwtAuthenticationFilter(tokenProvider, objectMapper),
                        UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    private static void write(HttpServletResponse res, ObjectMapper mapper, ErrorCode code)
            throws IOException {
        res.setStatus(code.getStatus().value());
        res.setContentType(MediaType.APPLICATION_JSON_VALUE);
        res.setCharacterEncoding("UTF-8");
        mapper.writeValue(res.getWriter(), ApiResponse.error(code));
    }

    /**
     * CORS — 로컬 프론트는 Vite 프록시({@code /api} → {@code localhost:8080})를 쓰므로 동일 출처이고,
     * 운영은 Nginx가 같은 도메인에서 서빙한다. 그래서 실제로 교차 출처 요청이 없어야 정상이다.
     * 프론트가 프록시 없이 직접 붙는 경우만 대비해 로컬 dev 서버만 열어 둔다. Vite를
     * {@code localhost}와 {@code 127.0.0.1} 중 어느 주소로 열어도 Origin 검사를 통과해야 한다.
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(java.util.List.of(
                "http://localhost:5173",
                "http://127.0.0.1:5173"));
        config.setAllowedMethods(java.util.List.of("GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(java.util.List.of("*"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }

    /** 자체 이메일 가입·로그인(API-member-02·08, P1)용. MVP에서는 쓰이지 않는다. */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
