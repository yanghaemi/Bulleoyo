package com.ssafy.b204.webauthn;

import static com.ssafy.b204.webauthn.WebauthnTestSupport.authenticate;
import static com.ssafy.b204.webauthn.WebauthnTestSupport.call;
import static com.ssafy.b204.webauthn.WebauthnTestSupport.registerDevice;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.ssafy.b204.common.security.JwtTokenProvider;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.payment.entity.Payment;
import com.ssafy.b204.settlement.SettlementTestFixture;
import com.ssafy.b204.support.Bearer;
import com.ssafy.b204.support.IntegrationTestBase;
import com.ssafy.b204.ticket.entity.TicketOrder;
import com.ssafy.b204.webauthn.WebauthnTestSupport.Result;
import com.ssafy.b204.webauthn.service.StepUpAction;
import com.ssafy.b204.webauthn.service.StepUpTokenService;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * 결제 보고 가드 — <b>스위치 켜짐</b>(API v7 §7.W · API-payment-03).
 *
 * <p>픽스처 주문은 결제 시한이 이미 지나 있다. 그래서 <b>가드를 통과하면 기존 검사의 결과인
 * {@code COMMON_CONFLICT}(만료)</b>가, 막히면 {@code WEBAUTHN_STEP_UP_REQUIRED}(403)가 나온다 — 두 코드가
 * 갈리는 것으로 "가드가 통과시켰는가"를 판정한다. 체인 전송까지 가는 202 경로는 스위치 꺼짐에서
 * {@code PerformancePaymentFlowTest}가 이미 지킨다(이 가드는 그 앞 한 줄이다).
 */
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "b204.webauthn.enabled=true",
        // blockchain/deployments/kairos.json 공개 주소 — payment-02 가 signRequests 를 만들 수 있게(PerformancePaymentFlowTest 와 같은 값).
        "b204.chain.contract.yoyo-address=0xA5d7031D70DAab33EACDfC912baC0668D5776e5b",
        "b204.chain.contract.splitter-address=0xa1ca24ECD6adCd29a8998031fd52Cf17F9541738",
        "b204.chain.operator-address=0xfbB324CC674dD2FF21Dff670404391e78F4a199f"
})
class PaymentStepUpGuardTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired JwtTokenProvider tokens;
    @Autowired StringRedisTemplate redis;
    @Autowired StepUpTokenService stepUpTokens;
    @Autowired SettlementTestFixture fixture;

    private SettlementTestFixture.World world;
    private Member buyer;
    private TicketOrder order;

    @BeforeEach
    void setUp() {
        world = fixture.createWorld(5000, 5000, new int[]{10000});
        buyer = fixture.createAudience();
        order = placeOrder(buyer);
    }

    @Test
    @DisplayName("켜짐 — 결제 상태 응답에 stepUpRequired: true")
    void statusCarriesStepUpRequired() throws Exception {
        Result r = call(mvc, get("/api/v1/orders/" + order.getTicketOrderId() + "/payment")
                .with(Bearer.of(tokens, buyer)));

        assertThat(r.status()).as(r.body().toString()).isEqualTo(200);
        assertThat(r.data().get("stepUpRequired").asBoolean()).isTrue();
    }

    @Test
    @DisplayName("켜짐 — 헤더가 없으면 403 WEBAUTHN_STEP_UP_REQUIRED")
    void missingHeader() throws Exception {
        Result r = call(mvc, signedTx(order, buyer, null));

        assertThat(r.status()).isEqualTo(403);
        assertThat(r.code()).isEqualTo("WEBAUTHN_STEP_UP_REQUIRED");
        assertThat(r.body().get("data").isNull()).isTrue();
    }

    @Test
    @DisplayName("켜짐 — 유효한 토큰은 통과, 같은 주문 그룹의 이어지는 보고도 같은 토큰으로 통과한다")
    void validTokenPassesAndBindsToGroup() throws Exception {
        String token = paymentToken(buyer, order);

        Result first = call(mvc, signedTx(order, buyer, token));
        Result second = call(mvc, signedTx(order, buyer, token));

        assertThat(first.code()).as("가드 통과 → 기존 만료 검사").isEqualTo("COMMON_CONFLICT");
        assertThat(second.code()).isEqualTo("COMMON_CONFLICT");
        assertThat(redis.hasKey(StepUpTokenService.TOKEN_PREFIX + token)).as("토큰은 소비됐다").isFalse();
        assertThat(redis.opsForValue().get(StepUpTokenService.scopeKey(buyer.getMemberId(), StepUpAction.PAYMENT, order.groupId())))
                .isEqualTo(token);
        assertThat(redis.getExpire(StepUpTokenService.scopeKey(buyer.getMemberId(), StepUpAction.PAYMENT, order.groupId())))
                .isBetween(1L, 120L);
    }

    @Test
    @DisplayName("켜짐 — 이미 쓴 토큰을 다른 주문(그룹)에 재사용하면 403")
    void reuseOnAnotherGroup() throws Exception {
        String token = paymentToken(buyer, order);
        TicketOrder another = placeOrder(buyer);

        assertThat(call(mvc, signedTx(order, buyer, token)).code()).isEqualTo("COMMON_CONFLICT");
        Result reused = call(mvc, signedTx(another, buyer, token));

        assertThat(reused.status()).isEqualTo(403);
        assertThat(reused.code()).isEqualTo("WEBAUTHN_STEP_UP_REQUIRED");
    }

    @Test
    @DisplayName("켜짐 — 만료된 토큰(TTL 경과 = Redis 키 없음)은 403")
    void expiredToken() throws Exception {
        String token = paymentToken(buyer, order);
        redis.delete(StepUpTokenService.TOKEN_PREFIX + token); // TTL 120초 경과와 같은 상태

        assertThat(call(mvc, signedTx(order, buyer, token)).code()).isEqualTo("WEBAUTHN_STEP_UP_REQUIRED");
    }

    @Test
    @DisplayName("켜짐 — 다른 회원의 토큰은 403, 그 토큰은 태워 없앤다")
    void otherMembersToken() throws Exception {
        Member other = fixture.createAudience();
        String othersToken = stepUpTokens.issue(other.getMemberId(), StepUpAction.PAYMENT, order.groupId()).token();

        Result r = call(mvc, signedTx(order, buyer, othersToken));

        assertThat(r.code()).isEqualTo("WEBAUTHN_STEP_UP_REQUIRED");
        assertThat(redis.hasKey(StepUpTokenService.TOKEN_PREFIX + othersToken)).isFalse();
    }

    @Test
    @DisplayName("켜짐 — 서명 취소 알림(abandoned)은 코인이 움직이지 않아 가드 대상이 아니다")
    void abandonIsNotGuarded() throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("kind", "PURCHASE");
        body.put("orderId", order.getTicketOrderId());
        body.put("abandoned", true);

        Result r = call(mvc, post("/api/v1/orders/" + order.getTicketOrderId() + "/payment/signed-tx")
                .with(Bearer.of(tokens, buyer)).contentType(MediaType.APPLICATION_JSON)
                .content(WebauthnTestSupport.JSON.writeValueAsString(body)));

        assertThat(r.code()).as("기존 abandon 가드(만료) 결과").isEqualTo("COMMON_CONFLICT");
    }

    @Test
    @DisplayName("켜짐 — 실제 패스키 등록·인증으로 받은 토큰이 결제 보고 가드를 통과한다(끝에서 끝)")
    void endToEndWithPasskey() throws Exception {
        SoftAuthenticator device = registerDevice(mvc, tokens, buyer);
        Result auth = authenticate(mvc, tokens, buyer, device, 1,
                WebauthnTestSupport.scope("PAYMENT", order.groupId()));
        assertThat(auth.status()).as(auth.body().toString()).isEqualTo(200);

        Result r = call(mvc, signedTx(order, buyer, auth.data().get("stepUpToken").asText()));

        assertThat(r.code()).isEqualTo("COMMON_CONFLICT");
    }

    @Test
    @DisplayName("켜짐 — 다른 동작(보증금)에 발급된 토큰으로는 결제 보고를 통과할 수 없다")
    void tokenForAnotherAction() throws Exception {
        String depositToken = stepUpTokens.issue(buyer.getMemberId(), StepUpAction.DEPOSIT,
                order.groupId()).token();

        assertThat(call(mvc, signedTx(order, buyer, depositToken)).code())
                .isEqualTo("WEBAUTHN_STEP_UP_REQUIRED");
    }

    private String paymentToken(Member member, TicketOrder target) {
        return stepUpTokens.issue(member.getMemberId(), StepUpAction.PAYMENT, target.groupId()).token();
    }

    private TicketOrder placeOrder(Member member) {
        return fixture.placeUnsignedPayment(world, member, world.host(), 15_000L,
                TicketOrder.Status.PENDING_PAYMENT, Payment.Status.AWAITING_SIGNATURE);
    }

    private MockHttpServletRequestBuilder signedTx(TicketOrder target, Member member, String token)
            throws Exception {
        MockHttpServletRequestBuilder builder = post("/api/v1/orders/" + target.getTicketOrderId()
                + "/payment/signed-tx")
                .with(Bearer.of(tokens, member))
                .contentType(MediaType.APPLICATION_JSON)
                .content(WebauthnTestSupport.JSON.writeValueAsString(Map.of(
                        "kind", "PURCHASE", "senderSignedRlp", "0x01",
                        "orderId", target.getTicketOrderId())));
        return token == null ? builder : builder.header("X-Step-Up-Token", token);
    }
}
