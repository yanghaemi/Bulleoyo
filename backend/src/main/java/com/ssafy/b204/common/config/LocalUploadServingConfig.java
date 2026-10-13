package com.ssafy.b204.common.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * <b>local 프로파일 전용</b> 업로드 이미지 서빙 — Nginx 없이 미리보기를 보기 위한 것이다.
 *
 * <p><b>운영에서는 등록되지 않아야 한다.</b> 운영은 호스트 Nginx가 {@code /uploads/}를 서빙하고,
 * 그 블록이 {@code .html}·{@code .svg}·{@code .js} 같은 실행 가능한 확장자를 404로 끊는다
 * (인프라 계약 · 저장형 XSS 방어). 앱이 같은 경로를 이중으로 열면 요청이 Nginx의 그 방어를
 * <b>우회</b>해 Spring 정적 핸들러로 들어온다. 그래서 {@code WebConfig}에 넣지 않고 프로파일
 * 조건이 붙은 이 파일에 따로 둔다.
 *
 * <p>보안 규칙도 같은 이유로 여기 있다 — {@code SecurityConfig}의 기본 체인은
 * {@code anyRequest().authenticated()}라 {@code /uploads/**}가 401이 된다. 정적 파일 전용 체인을
 * 앞 순서로 하나 더 두어 그 경로만 연다({@code /api/**}는 건드리지 않는다).
 */
@Profile("local")
@Configuration
@RequiredArgsConstructor
public class LocalUploadServingConfig implements WebMvcConfigurer {

    private final UploadProperties uploadProperties;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // 디렉토리가 아직 없어도 등록은 된다 — 첫 업로드 때 만들어진다.
        registry.addResourceHandler("/uploads/**")
                .addResourceLocations(uploadProperties.root().toUri().toString());
    }

    /** {@code @Order}로 기본 체인(LOWEST_PRECEDENCE)보다 먼저 이 경로를 가져간다. */
    @Bean
    @Order(1)
    public SecurityFilterChain localUploadsFilterChain(HttpSecurity http) throws Exception {
        return http
                .securityMatcher("/uploads/**")
                .csrf(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                .build();
    }
}
