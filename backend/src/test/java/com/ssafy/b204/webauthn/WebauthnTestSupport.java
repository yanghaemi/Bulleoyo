package com.ssafy.b204.webauthn;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.b204.common.security.JwtTokenProvider;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.support.Bearer;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** webauthn 통합 테스트 공용 — 회원 생성·HTTP 호출·결제 픽스처 배선. */
final class WebauthnTestSupport {

    static final String RP_ID = "localhost";
    static final String ORIGIN = "http://localhost:5173";
    static final ObjectMapper JSON = new ObjectMapper();

    private WebauthnTestSupport() {
    }

    static Member newMember(MemberRepository members) {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        return members.save(Member.builder()
                .email("passkey-" + tag + "@b204.test")
                .name("관객")
                .authProvider(Member.AuthProvider.GOOGLE)
                .countryCode("KR")
                .build());
    }

    record Result(int status, JsonNode body) {
        String code() {
            return body.get("code").asText();
        }

        JsonNode data() {
            return body.get("data");
        }
    }

    static Result call(MockMvc mvc, MockHttpServletRequestBuilder request) throws Exception {
        MvcResult result = mvc.perform(request).andReturn();
        String raw = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        return new Result(result.getResponse().getStatus(), raw.isBlank() ? null : JSON.readTree(raw));
    }

    static MockHttpServletRequestBuilder postJson(String path, JwtTokenProvider tokens, Member member,
                                                  Object body) throws Exception {
        MockHttpServletRequestBuilder builder = post(path).with(Bearer.of(tokens, member))
                .contentType(MediaType.APPLICATION_JSON);
        return body == null ? builder : builder.content(JSON.writeValueAsString(body));
    }

    /** 등록 옵션 → 소프트 인증기로 등록까지. 등록된 인증기를 돌려준다. */
    static SoftAuthenticator registerDevice(MockMvc mvc, JwtTokenProvider tokens, Member member)
            throws Exception {
        Result options = call(mvc, postJson("/api/v1/webauthn/registration/options", tokens, member, null));
        SoftAuthenticator authenticator = new SoftAuthenticator();
        Map<String, Object> body = authenticator.register(options.data().get("challenge").asText(),
                RP_ID, ORIGIN, SoftAuthenticator.FLAG_UP | SoftAuthenticator.FLAG_UV);
        Result registered = call(mvc, postJson("/api/v1/webauthn/registration", tokens, member, body));
        if (registered.status() != 201) {
            throw new AssertionError("등록 실패: " + registered.body());
        }
        return authenticator;
    }

    /** 본인 확인 옵션 본문 — 동작·대상(API v7 §7.W). 테스트 기본값은 아무 공연 1번. */
    static Map<String, Object> scope(String action, long targetId) {
        return Map.of("action", action, "targetId", targetId);
    }

    static final Map<String, Object> ANY_SCOPE = scope("DEPOSIT", 1L);

    /** 인증 옵션 → assertion → step-up 토큰(기본 범위). */
    static Result authenticate(MockMvc mvc, JwtTokenProvider tokens, Member member,
                               SoftAuthenticator authenticator, long signCount) throws Exception {
        return authenticate(mvc, tokens, member, authenticator, signCount, ANY_SCOPE);
    }

    /** 인증 옵션(범위 지정) → assertion → step-up 토큰. */
    static Result authenticate(MockMvc mvc, JwtTokenProvider tokens, Member member,
                               SoftAuthenticator authenticator, long signCount,
                               Map<String, Object> scope) throws Exception {
        Result options = call(mvc, postJson("/api/v1/webauthn/authentication/options", tokens, member, scope));
        Map<String, Object> body = authenticator.assertion(options.data().get("challenge").asText(),
                RP_ID, ORIGIN, SoftAuthenticator.FLAG_UP | SoftAuthenticator.FLAG_UV, signCount);
        return call(mvc, postJson("/api/v1/webauthn/authentication", tokens, member, body));
    }
}
