package com.ssafy.b204.webauthn;

import static com.ssafy.b204.webauthn.WebauthnTestSupport.ORIGIN;
import static com.ssafy.b204.webauthn.WebauthnTestSupport.RP_ID;
import static com.ssafy.b204.webauthn.WebauthnTestSupport.authenticate;
import static com.ssafy.b204.webauthn.WebauthnTestSupport.call;
import static com.ssafy.b204.webauthn.WebauthnTestSupport.newMember;
import static com.ssafy.b204.webauthn.WebauthnTestSupport.postJson;
import static com.ssafy.b204.webauthn.WebauthnTestSupport.registerDevice;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.ssafy.b204.common.security.JwtTokenProvider;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.payment.entity.Payment;
import com.ssafy.b204.settlement.SettlementTestFixture;
import com.ssafy.b204.support.Bearer;
import com.ssafy.b204.support.IntegrationTestBase;
import com.ssafy.b204.ticket.entity.TicketOrder;
import com.ssafy.b204.webauthn.WebauthnTestSupport.Result;
import com.ssafy.b204.webauthn.service.StepUpTokenService;
import com.ssafy.b204.webauthn.service.WebauthnService;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * API-webauthn-01~04 (API v7 §7.W) — <b>스위치 꺼짐(기본값)</b> 컨텍스트.
 *
 * <p>등록·인증 서명 검증은 {@link SoftAuthenticator}가 만든 진짜 ES256 서명으로 돈다(mock 없음).
 * 끝의 두 테스트는 <b>스위치 꺼짐 불변식</b>이다 — 결제 응답에 {@code stepUpRequired} 키가 없고,
 * 결제 보고는 헤더 없이도 가드에 막히지 않는다.
 */
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        // blockchain/deployments/kairos.json 공개 주소 — payment-02 가 signRequests 를 만들 수 있게(PerformancePaymentFlowTest 와 같은 값).
        "b204.chain.contract.yoyo-address=0xA5d7031D70DAab33EACDfC912baC0668D5776e5b",
        "b204.chain.contract.splitter-address=0xa1ca24ECD6adCd29a8998031fd52Cf17F9541738",
        "b204.chain.operator-address=0xfbB324CC674dD2FF21Dff670404391e78F4a199f"
})
class WebauthnApiTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired JwtTokenProvider tokens;
    @Autowired MemberRepository members;
    @Autowired StringRedisTemplate redis;
    @Autowired JdbcTemplate jdbc;
    @Autowired SettlementTestFixture fixture;

    // ================================================================ 옵션·챌린지

    @Test
    @DisplayName("등록 옵션 — platform · UV required · attestation none, 챌린지는 Redis 에 300초 이하로 남는다")
    void registrationOptionsShapeAndChallengeTtl() throws Exception {
        Member member = newMember(members);

        Result r = call(mvc, postJson("/api/v1/webauthn/registration/options", tokens, member, null));

        assertThat(r.status()).isEqualTo(200);
        assertThat(r.data().get("rp").get("id").asText()).isEqualTo(RP_ID);
        assertThat(r.data().get("rp").get("name").asText()).isEqualTo("BULLEOYO");
        assertThat(r.data().get("attestation").asText()).isEqualTo("none");
        assertThat(r.data().get("authenticatorSelection").get("authenticatorAttachment").asText())
                .isEqualTo("platform");
        assertThat(r.data().get("authenticatorSelection").get("userVerification").asText())
                .isEqualTo("required");
        assertThat(r.data().get("authenticatorSelection").get("residentKey").asText())
                .isEqualTo("preferred");
        assertThat(r.data().get("pubKeyCredParams").get(0).get("alg").asInt()).isEqualTo(-7);

        String key = WebauthnService.challengeKey(member.getMemberId(), "registration");
        assertThat(redis.opsForValue().get(key)).isEqualTo(r.data().get("challenge").asText());
        assertThat(redis.getExpire(key)).isBetween(1L, 300L);
    }

    @Test
    @DisplayName("등록 기기 없는 회원의 인증 옵션은 에러가 아니라 registered:false — 챌린지를 만들지 않는다")
    void authenticationOptionsWithoutDevice() throws Exception {
        Member member = newMember(members);

        Result r = call(mvc, postJson("/api/v1/webauthn/authentication/options", tokens, member, WebauthnTestSupport.ANY_SCOPE));

        assertThat(r.status()).isEqualTo(200);
        assertThat(r.code()).isEqualTo("SUCCESS");
        assertThat(r.data().get("registered").asBoolean()).isFalse();
        assertThat(r.data().has("challenge")).isFalse();
        assertThat(redis.hasKey(WebauthnService.challengeKey(member.getMemberId(), "authentication")))
                .isFalse();
    }

    @Test
    @DisplayName("본인 확인 옵션은 동작·대상이 필수다 — 없으면 COMMON_VALIDATION_FAILED")
    void authenticationOptionsRequireScope() throws Exception {
        Member member = newMember(members);

        Result noBody = call(mvc, postJson("/api/v1/webauthn/authentication/options", tokens, member,
                Map.of()));
        Result badAction = call(mvc, postJson("/api/v1/webauthn/authentication/options", tokens, member,
                Map.of("action", "TRANSFER", "targetId", 1)));

        assertThat(noBody.code()).isEqualTo("COMMON_VALIDATION_FAILED");
        assertThat(badAction.code()).isEqualTo("COMMON_VALIDATION_FAILED");
    }

    @Test
    @DisplayName("비로그인은 401")
    void requiresLogin() throws Exception {
        Result r = call(mvc, post("/api/v1/webauthn/registration/options"));
        assertThat(r.status()).isEqualTo(401);
    }

    // ================================================================ 성공 경로

    @Test
    @DisplayName("등록 → 인증 성공 — step-up 토큰이 memberId 로 120초 이하 저장되고 sign_count 가 갱신된다")
    void registerThenAuthenticate() throws Exception {
        Member member = newMember(members);
        SoftAuthenticator device = registerDevice(mvc, tokens, member);

        Result options = call(mvc, postJson("/api/v1/webauthn/authentication/options", tokens, member, WebauthnTestSupport.ANY_SCOPE));
        assertThat(options.data().get("registered").asBoolean()).isTrue();
        assertThat(options.data().get("allowCredentials").get(0).get("id").asText())
                .isEqualTo(device.credentialIdB64());
        assertThat(options.data().get("userVerification").asText()).isEqualTo("required");

        Map<String, Object> body = device.assertion(options.data().get("challenge").asText(), RP_ID,
                ORIGIN, SoftAuthenticator.FLAG_UP | SoftAuthenticator.FLAG_UV, 7);
        Result r = call(mvc, postJson("/api/v1/webauthn/authentication", tokens, member, body));

        assertThat(r.status()).as(r.body().toString()).isEqualTo(200);
        String token = r.data().get("stepUpToken").asText();
        assertThat(r.data().get("expiresAt").asText()).isNotBlank();
        String key = StepUpTokenService.TOKEN_PREFIX + token;
        // 값 = memberId|동작|대상 — 옵션을 받을 때 보낸 범위가 토큰에 그대로 실린다.
        assertThat(redis.opsForValue().get(key)).isEqualTo(member.getMemberId() + "|DEPOSIT|1");
        assertThat(redis.getExpire(key)).isBetween(1L, 120L);
        assertThat(jdbc.queryForObject(
                "select sign_count from webauthn_credential where member_id = ?", Long.class,
                member.getMemberId())).isEqualTo(7L);
    }

    // ================================================================ 실패 경로

    @Test
    @DisplayName("등록 — origin 이 허용 목록 밖이면 WEBAUTHN_VERIFICATION_FAILED, 같은 챌린지는 다시 못 쓴다(1회용)")
    void registrationWrongOriginAndChallengeIsSingleUse() throws Exception {
        Member member = newMember(members);
        Result options = call(mvc, postJson("/api/v1/webauthn/registration/options", tokens, member, null));
        String challenge = options.data().get("challenge").asText();
        SoftAuthenticator device = new SoftAuthenticator();

        Result bad = call(mvc, postJson("/api/v1/webauthn/registration", tokens, member,
                device.register(challenge, RP_ID, "https://evil.example",
                        SoftAuthenticator.FLAG_UP | SoftAuthenticator.FLAG_UV)));
        assertThat(bad.status()).isEqualTo(400);
        assertThat(bad.code()).isEqualTo("WEBAUTHN_VERIFICATION_FAILED");

        // 올바른 응답이어도 이미 소비된 챌린지라 거부된다.
        Result replay = call(mvc, postJson("/api/v1/webauthn/registration", tokens, member,
                device.register(challenge, RP_ID, ORIGIN,
                        SoftAuthenticator.FLAG_UP | SoftAuthenticator.FLAG_UV)));
        assertThat(replay.code()).isEqualTo("WEBAUTHN_VERIFICATION_FAILED");
        assertThat(jdbc.queryForObject("select count(*) from webauthn_credential where member_id = ?",
                Integer.class, member.getMemberId())).isZero();
    }

    @Test
    @DisplayName("등록 — 사용자 확인(UV) 플래그가 없으면 거부한다(userVerification required)")
    void registrationWithoutUserVerification() throws Exception {
        Member member = newMember(members);
        Result options = call(mvc, postJson("/api/v1/webauthn/registration/options", tokens, member, null));

        Result r = call(mvc, postJson("/api/v1/webauthn/registration", tokens, member,
                new SoftAuthenticator().register(options.data().get("challenge").asText(), RP_ID,
                        ORIGIN, SoftAuthenticator.FLAG_UP)));

        assertThat(r.code()).isEqualTo("WEBAUTHN_VERIFICATION_FAILED");
    }

    @Test
    @DisplayName("인증 — 서명을 변조하면 WEBAUTHN_VERIFICATION_FAILED, 토큰을 주지 않는다")
    void tamperedSignatureFails() throws Exception {
        Member member = newMember(members);
        SoftAuthenticator device = registerDevice(mvc, tokens, member);
        Result options = call(mvc, postJson("/api/v1/webauthn/authentication/options", tokens, member, WebauthnTestSupport.ANY_SCOPE));
        Map<String, Object> body = device.assertion(options.data().get("challenge").asText(), RP_ID,
                ORIGIN, SoftAuthenticator.FLAG_UP | SoftAuthenticator.FLAG_UV, 1);
        // 다른 키로 같은 데이터에 서명한 값으로 바꿔 끼운다 — 형식은 맞고 서명만 틀리다.
        Map<String, Object> forged = new SoftAuthenticator().assertion(
                options.data().get("challenge").asText(), RP_ID, ORIGIN,
                SoftAuthenticator.FLAG_UP | SoftAuthenticator.FLAG_UV, 1);
        body.put("signature", forged.get("signature"));

        Result r = call(mvc, postJson("/api/v1/webauthn/authentication", tokens, member, body));

        assertThat(r.status()).isEqualTo(400);
        assertThat(r.code()).isEqualTo("WEBAUTHN_VERIFICATION_FAILED");
        assertThat(redis.keys(StepUpTokenService.TOKEN_PREFIX + "*")).noneMatch(k -> {
            String v = redis.opsForValue().get(k);
            return v != null && v.startsWith(member.getMemberId() + "|");
        });
    }

    @Test
    @DisplayName("인증 — signCount 가 늘지 않으면(복제 인증기 의심) 거부한다")
    void signCountMustIncrease() throws Exception {
        Member member = newMember(members);
        SoftAuthenticator device = registerDevice(mvc, tokens, member);

        assertThat(authenticate(mvc, tokens, member, device, 5).status()).isEqualTo(200);
        Result again = authenticate(mvc, tokens, member, device, 5);

        assertThat(again.code()).isEqualTo("WEBAUTHN_VERIFICATION_FAILED");
    }

    @Test
    @DisplayName("인증 — 다른 회원의 credential 로는 토큰을 받을 수 없다")
    void otherMembersCredential() throws Exception {
        Member owner = newMember(members);
        Member other = newMember(members);
        SoftAuthenticator device = registerDevice(mvc, tokens, owner);
        registerDevice(mvc, tokens, other); // other 도 옵션이 나오도록 기기 하나를 둔다

        Result options = call(mvc, postJson("/api/v1/webauthn/authentication/options", tokens, other, WebauthnTestSupport.ANY_SCOPE));
        Map<String, Object> body = device.assertion(options.data().get("challenge").asText(), RP_ID,
                ORIGIN, SoftAuthenticator.FLAG_UP | SoftAuthenticator.FLAG_UV, 1);
        Result r = call(mvc, postJson("/api/v1/webauthn/authentication", tokens, other, body));

        assertThat(r.code()).isEqualTo("WEBAUTHN_VERIFICATION_FAILED");
    }

    @Test
    @DisplayName("같은 credential 을 두 번 등록하면 COMMON_CONFLICT")
    void duplicateRegistration() throws Exception {
        Member member = newMember(members);
        SoftAuthenticator device = registerDevice(mvc, tokens, member);
        Result options = call(mvc, postJson("/api/v1/webauthn/registration/options", tokens, member, null));

        Result r = call(mvc, postJson("/api/v1/webauthn/registration", tokens, member,
                device.register(options.data().get("challenge").asText(), RP_ID, ORIGIN,
                        SoftAuthenticator.FLAG_UP | SoftAuthenticator.FLAG_UV)));

        assertThat(r.status()).isEqualTo(409);
        assertThat(r.code()).isEqualTo("COMMON_CONFLICT");
    }

    // ================================================================ 스위치 꺼짐 불변식

    @Test
    @DisplayName("스위치 꺼짐 — 결제 상태 응답에 stepUpRequired 키가 없다(이 기능 이전과 같다)")
    void switchOffPaymentStatusHasNoStepUpKey() throws Exception {
        Placed placed = unsignedOrder();
        TicketOrder order = placed.order();

        Result r = call(mvc, get("/api/v1/orders/" + order.getTicketOrderId() + "/payment")
                .with(Bearer.of(tokens, placed.buyer())));

        assertThat(r.status()).as(r.body().toString()).isEqualTo(200);
        assertThat(r.data().has("stepUpRequired")).isFalse();
    }

    @Test
    @DisplayName("스위치 꺼짐 — 결제 보고는 헤더 없이도 가드에 막히지 않는다(403 이 아니라 기존 검사 결과)")
    void switchOffSignedTxIgnoresHeader() throws Exception {
        Placed placed = unsignedOrder();
        TicketOrder order = placed.order();
        String body = WebauthnTestSupport.JSON.writeValueAsString(Map.of(
                "kind", "PURCHASE", "senderSignedRlp", "0x01", "orderId", order.getTicketOrderId()));

        Result noHeader = call(mvc, post("/api/v1/orders/" + order.getTicketOrderId() + "/payment/signed-tx")
                .with(Bearer.of(tokens, placed.buyer()))
                .contentType(MediaType.APPLICATION_JSON).content(body));
        Result junkHeader = call(mvc, post("/api/v1/orders/" + order.getTicketOrderId() + "/payment/signed-tx")
                .with(Bearer.of(tokens, placed.buyer()))
                .header("X-Step-Up-Token", "not-a-token")
                .contentType(MediaType.APPLICATION_JSON).content(body));

        // 픽스처 주문은 결제 시한이 지나 있다 — 기존 흐름대로 COMMON_CONFLICT(만료)다.
        assertThat(noHeader.code()).isEqualTo("COMMON_CONFLICT");
        assertThat(junkHeader.code()).isEqualTo("COMMON_CONFLICT");
    }

    record Placed(Member buyer, TicketOrder order) {}

    private Placed unsignedOrder() {
        SettlementTestFixture.World world = fixture.createWorld(5000, 5000, new int[]{10000});
        Member buyer = fixture.createAudience();
        return new Placed(buyer, fixture.placeUnsignedPayment(world, buyer, world.host(), 15_000L,
                TicketOrder.Status.PENDING_PAYMENT, Payment.Status.AWAITING_SIGNATURE));
    }
}
