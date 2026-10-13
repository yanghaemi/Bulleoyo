package com.ssafy.b204.webauthn.config;

import com.webauthn4j.WebAuthnManager;
import com.webauthn4j.converter.util.ObjectConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * webauthn4j 빈.
 *
 * <p><b>non-strict 매니저를 쓰는 이유</b> — 등록 옵션이 {@code attestation: "none"}이라 인증기
 * 제조사 인증서 체인을 검증할 것이 없다. strict 매니저는 attestation 신뢰 앵커를 요구해 none
 * 형식을 거부한다. 서명·챌린지·origin·rpIdHash·UV 검증은 non-strict 에서도 전부 돈다.
 *
 * <p>{@link ObjectConverter}를 빈으로 공유하는 이유는 COSE 공개키를 DB에 CBOR 바이트로 넣고
 * 꺼낼 때 매니저와 <b>같은 변환 규칙</b>을 써야 해서다. 앱의 Jackson {@code ObjectMapper}와는
 * 별개 인스턴스라 전역 직렬화 설정({@code non_null}·{@code fail-on-unknown-properties})에 영향이 없다.
 */
@Configuration
public class WebAuthnConfig {

    @Bean
    public ObjectConverter webAuthnObjectConverter() {
        return new ObjectConverter();
    }

    @Bean
    public WebAuthnManager webAuthnManager(ObjectConverter webAuthnObjectConverter) {
        return WebAuthnManager.createNonStrictWebAuthnManager(webAuthnObjectConverter);
    }
}
