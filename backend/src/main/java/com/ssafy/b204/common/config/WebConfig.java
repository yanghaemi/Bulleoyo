package com.ssafy.b204.common.config;

import java.util.List;
import java.util.Locale;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.web.config.EnableSpringDataWebSupport;
import org.springframework.web.servlet.LocaleResolver;
import org.springframework.web.servlet.i18n.AcceptHeaderLocaleResolver;

/**
 * 웹 계층 설정.
 *
 * <p><b>언어</b>(API v6 §0.6) — {@code Accept-Language: en}(기본) / {@code ko}. 그 밖의 값은
 * {@code en}으로 폴백한다. 로그인 회원은 <b>프로필 {@code locale}이 헤더보다 우선</b>하는데
 * (C-04에서 바꾼 값이 곧바로 반영되게), 그 우선순위는 회원을 알아야 결정되므로 인증 필터가 붙은
 * 뒤 별도 {@code LocaleResolver}로 옮긴다. 지금은 헤더만 본다.
 *
 * <p>{@code msg}·{@code signRequests[].summary.title}·{@code simulationNotice} 같은 사용자 문장만
 * 번역 대상이다. {@code code}·상태값·필드명·사용자 입력 데이터(팀·공연 이름)는 번역하지 않는다.
 */
@Configuration
// Page를 응답에 직접 쓰지 않지만(PageResponse를 쓴다), Pageable 파라미터 바인딩은 쓴다.
// VIA_DTO 로 두면 Page 직렬화 경고가 사라지고, 실수로 Page를 반환해도 안정적인 형태로 나간다.
@EnableSpringDataWebSupport(pageSerializationMode = EnableSpringDataWebSupport.PageSerializationMode.VIA_DTO)
public class WebConfig {

    @Bean
    public LocaleResolver localeResolver() {
        AcceptHeaderLocaleResolver resolver = new AcceptHeaderLocaleResolver();
        resolver.setDefaultLocale(Locale.ENGLISH);
        resolver.setSupportedLocales(List.of(Locale.ENGLISH, Locale.KOREAN));
        return resolver;
    }
}
