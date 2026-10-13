package com.ssafy.b204.webauthn.config;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 결제 전 패스키 본인 확인 설정 — API v7 §7.W.
 *
 * <p>{@code enabled}가 <b>유일한 스위치</b>다. 꺼져 있으면(기본) 결제 흐름은 이 기능이 없던 때와
 * 같다 — {@code PaymentService}가 이 값을 보고 가드 경로 자체를 건너뛴다. 프론트에는 별도 플래그가
 * 없고 API-payment-01·02 응답의 {@code stepUpRequired}로만 알린다.
 *
 * <p>{@code rpId}는 브라우저 주소창의 도메인(또는 그 상위)이어야 한다 — 다르면 브라우저가
 * {@code navigator.credentials.*} 호출을 거부한다. {@code origins}는 {@code clientDataJSON.origin}과
 * 스킴·포트까지 정확히 비교한다.
 */
@ConfigurationProperties(prefix = "b204.webauthn")
public record WebAuthnProperties(Boolean enabled, String rpId, String rpName, List<String> origins,
                                 Duration challengeTtl, Duration stepUpTtl) {

    private static final Duration DEFAULT_CHALLENGE_TTL = Duration.ofSeconds(300);
    private static final Duration DEFAULT_STEP_UP_TTL = Duration.ofSeconds(120);

    /** 값이 없거나 빈 문자열이면 꺼짐 — 스위치가 모호하면 켜지 않는다. */
    @Override
    public Boolean enabled() {
        return Boolean.TRUE.equals(enabled);
    }

    @Override
    public String rpId() {
        return rpId == null || rpId.isBlank() ? "localhost" : rpId.trim();
    }

    @Override
    public String rpName() {
        return rpName == null || rpName.isBlank() ? "BULLEOYO" : rpName;
    }

    /** 쉼표 구분 환경변수를 Spring 이 목록으로 나눠 준다. 공백·빈 항목은 걸러 낸다. */
    @Override
    public List<String> origins() {
        if (origins == null) {
            return List.of("http://localhost:5173");
        }
        return origins.stream().map(String::trim).filter(o -> !o.isEmpty()).toList();
    }

    @Override
    public Duration challengeTtl() {
        return challengeTtl == null ? DEFAULT_CHALLENGE_TTL : challengeTtl;
    }

    @Override
    public Duration stepUpTtl() {
        return stepUpTtl == null ? DEFAULT_STEP_UP_TTL : stepUpTtl;
    }
}
