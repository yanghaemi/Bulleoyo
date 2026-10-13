package com.ssafy.b204;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.b204.common.config.RedisConfig;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.support.IntegrationTestBase;
import com.ssafy.b204.support.TestWallet;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * <b>로그인 → 지갑 등록 → 팀 생성</b> 세로축을 한 편으로 관통한다 (Jira S15P21B204-46 완료 기준).
 *
 * <p>실제로 도는 것들 — Testcontainers MySQL(Flyway V1) · Testcontainers Redis ·
 * {@link com.ssafy.b204.support.Web3AuthStubServer 로컬 JWKS 서버}. <b>Web3Auth idToken 검증을
 * mock으로 우회하지 않는다</b> — 서버는 운영과 같은 {@code NimbusJwtDecoder.withJwkSetUri(...)}
 * 경로로 HTTP JWKS를 받아 ES256 서명·{@code iss}·{@code aud}·{@code exp}를 검증한다.
 *
 * <p>외부 지갑 소유 증명({@code EXTERNAL})도 mock 이 아니다 — {@link TestWallet}이 secp256k1
 * 개인키로 {@code personal_sign}을 만들고 서버가 {@code ecrecover}로 복원해 대조한다.
 *
 * <p>검사 대상은 <b>명세의 응답 shape</b>다. 필드 이름이 하나라도 어긋나면 프론트가 통합
 * 단계에서야 안다.
 */
@AutoConfigureMockMvc
class MemberWalletTeamFlowTest extends IntegrationTestBase {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private StringRedisTemplate redis;

    @Autowired
    private MemberRepository memberRepository;

    private String verifierId;
    private String email;

    @BeforeEach
    void setUp() {
        // 회원은 (auth_provider, provider_user_id) UNIQUE 이고 email 도 UNIQUE 다.
        // 테스트마다 새 신원을 쓴다 — 컨테이너를 클래스 간에 공유하므로 DB를 비우지 않는다.
        String id = UUID.randomUUID().toString().substring(0, 8);
        this.verifierId = "verifier-" + id;
        this.email = id + "@example.com";
    }

    // ================================================================ 세로축

    @Test
    @DisplayName("로그인 → 지갑 등록(SOCIAL) → 팀 생성이 한 번에 관통한다")
    void signInThenLinkWalletThenCreateTeam() throws Exception {
        TestWallet wallet = TestWallet.random();

        // ── ① API-member-01: 최초 로그인 = 가입. wallet 은 아직 null 이다(v6).
        JsonNode login = data(post("/api/v1/auth/web3auth")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of(
                        "idToken", WEB3AUTH.idToken(verifierId, email, "Alex Kim", wallet.address()),
                        "address", wallet.address(),
                        "provider", "GOOGLE",
                        "countryCode", "US",
                        "locale", "en",
                        "displayCurrency", "USD",
                        "timezone", "America/Los_Angeles",
                        "termsAgreed", true,
                        "privacyAgreed", true))));

        assertThat(login.get("isNewMember").asBoolean()).isTrue();
        assertThat(login.get("email").asText()).isEqualTo(email);
        assertThat(login.get("authProvider").asText()).isEqualTo("GOOGLE");
        assertThat(login.get("roles")).hasSize(1);
        assertThat(login.get("roles").get(0).asText()).isEqualTo("AUDIENCE");
        // [v6] 지갑 등록이 분리돼 로그인 응답의 wallet 은 null 이고 grantJobId·signupGrant 는 없다.
        assertThat(login.hasNonNull("wallet")).isFalse();
        assertThat(login.has("grantJobId")).isFalse();
        assertThat(login.has("signupGrant")).isFalse();
        // §0.1 — 시각은 ISO 8601 오프셋 표기다. 회원 timezone(America/Los_Angeles) 기준이며
        // 오프셋이 없으면 OffsetDateTime.parse 가 실패한다(그것이 검사다).
        assertThat(OffsetDateTime.parse(login.get("accessTokenExpiresAt").asText())
                .getOffset()).isEqualTo(ZoneId.of("America/Los_Angeles").getRules()
                .getOffset(Instant.now()));

        String accessToken = login.get("accessToken").asText();

        // ── ② 지갑 등록 전에는 팀을 만들 수 없다 — WALLET_NOT_FOUND(404).
        //    [v7] genre 가 필수라 본문에 넣는다. 빠뜨리면 필드 검증이 먼저 400 을 내
        //    "지갑이 없어서 막혔다"를 확인하지 못한다.
        mvc.perform(post("/api/v1/teams").with(bearer(accessToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("teamName", "블루노트", "genre", "INDIE"))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("WALLET_NOT_FOUND"))
                .andExpect(jsonPath("$.data").doesNotExist());

        // ── ③ API-wallet-04: 소셜 지갑 등록. 202 + grantJobId.
        MvcResult registered = mvc.perform(post("/api/v1/wallets").with(bearer(accessToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("provider", "WEB3AUTH", "address", wallet.address()))))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andReturn();

        JsonNode walletData = body(registered).get("data");
        assertThat(walletData.get("wallet").get("provider").asText()).isEqualTo("WEB3AUTH");
        assertThat(walletData.get("wallet").get("status").asText()).isEqualTo("LINKED");
        assertThat(walletData.get("wallet").get("address").asText())
                .isEqualToIgnoringCase(wallet.address());
        assertThat(walletData.get("wallet").get("explorerUrl").asText())
                .startsWith("https://kairos.kaiascan.io/address/");
        assertThat(walletData.get("grantJobId").asText()).startsWith("chain_");
        assertThat(walletData.get("signupGrant").get("amount").asLong()).isEqualTo(100_000L);
        assertThat(walletData.get("signupGrant").get("currency").asText()).isEqualTo("KRW");
        assertThat(walletData.get("pollAfterMs").asInt()).isEqualTo(1500);

        long walletId = walletData.get("wallet").get("walletId").asLong();

        // ── ④ 회원당 1회. 두 번째 등록은 409.
        mvc.perform(post("/api/v1/wallets").with(bearer(accessToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("provider", "WEB3AUTH", "address", wallet.address()))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("COMMON_CONFLICT"));

        // ── ⑤ API-team-01: 이제 팀이 만들어진다. 팀 지갑 = 리더 지갑.
        JsonNode team = data(post("/api/v1/teams").with(bearer(accessToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("teamName", "블루노트", "genre", "INDIE",
                        "introduction", "합정 기반 3인조", "contactEmail", "bluenote@ssafy.io"))),
                201);

        assertThat(team.get("teamName").asText()).isEqualTo("블루노트");
        assertThat(team.get("walletAddress").asText()).isEqualToIgnoringCase(wallet.address());
        assertThat(team.get("walletProvider").asText()).isEqualTo("WEB3AUTH");
        assertThat(team.get("explorerUrl").asText()).startsWith("https://kairos.kaiascan.io/address/");
        long teamId = team.get("teamId").asLong();

        // ── ⑥ API-member-05: 지갑·팀·역할이 한 번에 보인다.
        JsonNode me = data(get("/api/v1/members/me").with(bearer(accessToken)));
        assertThat(me.get("walletLinkRequired").asBoolean()).isFalse();
        assertThat(me.get("wallet").get("address").asText()).isEqualToIgnoringCase(wallet.address());
        assertThat(me.get("teams").get(0).get("teamId").asLong()).isEqualTo(teamId);
        assertThat(me.get("teams").get(0).get("leader").asBoolean()).isTrue();
        assertThat(me.get("roles").toString()).contains("PERFORMER");
        // 캐시가 비어 있으면 잔액은 내려가지 않는다 — 노드를 조회하지 않기 때문이다(§0.12).
        assertThat(me.get("wallet").has("balance")).isFalse();

        // ── ⑦ 체인 워커가 확정 시 하는 일을 흉내낸다: wallet:balance 해시 갱신(§0.12 갱신 시점 ②).
        redis.opsForHash().put(RedisConfig.KEY_WALLET_BALANCE, String.valueOf(walletId),
                "100000|" + System.currentTimeMillis());

        JsonNode myWallet = data(get("/api/v1/wallets/me").with(bearer(accessToken)));
        assertThat(myWallet.get("balance").get("amount").asLong()).isEqualTo(100_000L);
        assertThat(myWallet.get("balance").get("currency").asText()).isEqualTo("KRW");
        assertThat(myWallet.get("stale").asBoolean()).isFalse();
        assertThat(myWallet.get("network").asText()).isEqualTo("kaia-kairos");
        assertThat(myWallet.get("chainId").asLong()).isEqualTo(1001L);
        // 지급 job 이 아직 PENDING 이라 pendingGrantJobId 가 채워진다.
        assertThat(myWallet.get("pendingGrantJobId").asText()).startsWith("chain_");

        // ── ⑧ API-team-02: 잔액이 캐시에서 온다(노드 조회 없음).
        JsonNode teams = data(get("/api/v1/teams/me").with(bearer(accessToken)));
        assertThat(teams.get("items").get(0).get("balanceAmount").asLong()).isEqualTo(100_000L);
        assertThat(teams.get("pageInfo").get("page").asInt()).isZero();
        assertThat(teams.get("pageInfo").get("totalElements").asLong()).isEqualTo(1);

        // ── ⑨ API-wallet-02: 이력의 원본은 chain_job 이다. 지급 job 한 건이 GRANT 로 보인다.
        JsonNode txs = data(get("/api/v1/wallets/me/transactions").with(bearer(accessToken)));
        assertThat(txs.get("items")).hasSize(1);
        JsonNode grant = txs.get("items").get(0);
        assertThat(grant.get("type").asText()).isEqualTo("GRANT");
        assertThat(grant.get("direction").asText()).isEqualTo("IN");
        assertThat(grant.get("amount").asLong()).isEqualTo(100_000L);
        assertThat(grant.get("status").asText()).isEqualTo("PENDING");
        assertThat(grant.get("refType").asText()).isEqualTo("CHAIN_JOB");
        assertThat(grant.get("title").asText()).isEqualTo("Welcome balance");
        assertThat(grant.get("signerType").asText()).isEqualTo("OPERATOR");
        assertThat(grant.get("feeDelegated").asBoolean()).isFalse();
        assertThat(grant.get("walletTxId").asText()).startsWith("job_");

        // ── ⑩ API-team-03·04.
        JsonNode detail = data(get("/api/v1/teams/" + teamId).with(bearer(accessToken)));
        assertThat(detail.get("wallet").get("address").asText())
                .isEqualToIgnoringCase(wallet.address());
        assertThat(detail.get("leaderMemberId").asLong())
                .isEqualTo(login.get("memberId").asLong());

        JsonNode updated = data(patch("/api/v1/teams/" + teamId).with(bearer(accessToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("genre", "ROCK"))));
        assertThat(updated.get("genre").asText()).isEqualTo("ROCK");
        assertThat(updated.has("wallet")).isFalse();
    }

    // ================================================================ JWKS 검증

    @Nested
    @DisplayName("API-member-01 Web3Auth idToken 검증")
    class IdTokenVerification {

        @Test
        @DisplayName("JWKS에 없는 키로 서명한 토큰은 AUTH_TOKEN_INVALID(401)")
        void rejectsForgedSignature() throws Exception {
            TestWallet wallet = TestWallet.random();
            mvc.perform(loginRequest(
                            WEB3AUTH.forgedIdToken(verifierId, email, wallet.address()),
                            wallet.address()))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("AUTH_TOKEN_INVALID"))
                    .andExpect(jsonPath("$.data").doesNotExist());
        }

        @Test
        @DisplayName("aud 가 우리 클라이언트 ID가 아니면 AUTH_TOKEN_INVALID(401)")
        void rejectsWrongAudience() throws Exception {
            TestWallet wallet = TestWallet.random();
            mvc.perform(loginRequest(
                            WEB3AUTH.idTokenWithWrongAudience(verifierId, email, wallet.address()),
                            wallet.address()))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("AUTH_TOKEN_INVALID"));
        }

        @Test
        @DisplayName("만료된 idToken 은 AUTH_TOKEN_INVALID(401)")
        void rejectsExpiredToken() throws Exception {
            TestWallet wallet = TestWallet.random();
            mvc.perform(loginRequest(
                            WEB3AUTH.expiredIdToken(verifierId, email, wallet.address()),
                            wallet.address()))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("AUTH_TOKEN_INVALID"));
        }

        @Test
        @DisplayName("토큰의 지갑 클레임과 요청 address 가 다르면 AUTH_TOKEN_INVALID(401)")
        void rejectsAddressMismatch() throws Exception {
            TestWallet claimed = TestWallet.random();
            TestWallet other = TestWallet.random();
            mvc.perform(loginRequest(
                            WEB3AUTH.idToken(verifierId, email, "Alex", claimed.address()),
                            other.address()))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("AUTH_TOKEN_INVALID"));
        }

        @Test
        @DisplayName("지갑 클레임이 public_key 로 와도 keccak-256으로 주소를 파생해 대조한다")
        void derivesAddressFromPublicKeyClaim() throws Exception {
            TestWallet wallet = TestWallet.random();
            JsonNode login = data(loginRequest(
                    WEB3AUTH.idTokenWithPublicKey(verifierId, email, "Alex", wallet.publicKeyHex()),
                    wallet.address()));
            assertThat(login.get("memberId").asLong()).isPositive();
        }

        @Test
        @DisplayName("신규 회원인데 약관 동의가 없으면 COMMON_VALIDATION_FAILED(400)")
        void rejectsMissingTermsForNewMember() throws Exception {
            TestWallet wallet = TestWallet.random();
            mvc.perform(post("/api/v1/auth/web3auth")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of(
                                    "idToken", WEB3AUTH.idToken(verifierId, email, "Alex",
                                            wallet.address()),
                                    "address", wallet.address(),
                                    "provider", "GOOGLE",
                                    "countryCode", "US"))))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("COMMON_VALIDATION_FAILED"));
        }

        @Test
        @DisplayName("신규 신원에 가입 정보가 전혀 없으면 409이고, 이후 가입은 한 번만 된다")
        void requiresSignupPayloadBeforeCreatingMemberOrSession() throws Exception {
            TestWallet wallet = TestWallet.random();
            String token = WEB3AUTH.idToken(verifierId, email, "Alex", wallet.address());
            long membersBefore = memberRepository.count();
            Set<String> refreshKeysBefore = redis.keys(RedisConfig.KEY_AUTH_REFRESH + "*");

            mvc.perform(post("/api/v1/auth/web3auth")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(web3AuthBody(token, wallet.address(), "GOOGLE",
                                    null, null, null)))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("AUTH_SIGNUP_REQUIRED"));

            assertThat(memberRepository.findByAuthProviderAndProviderUserId(
                    Member.AuthProvider.GOOGLE, verifierId)).isEmpty();
            assertThat(memberRepository.count()).isEqualTo(membersBefore);
            assertThat(redis.keys(RedisConfig.KEY_AUTH_REFRESH + "*"))
                    .isEqualTo(refreshKeysBefore);

            JsonNode signup = data(post("/api/v1/auth/web3auth")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(web3AuthBody(token, wallet.address(), "GOOGLE",
                            "US", true, true)));
            JsonNode login = data(post("/api/v1/auth/web3auth")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(web3AuthBody(token, wallet.address(), "GOOGLE",
                            null, null, null)));

            assertThat(signup.get("isNewMember").asBoolean()).isTrue();
            assertThat(login.get("isNewMember").asBoolean()).isFalse();
            assertThat(login.get("memberId").asLong()).isEqualTo(signup.get("memberId").asLong());
            assertThat(memberRepository.count()).isEqualTo(membersBefore + 1);
        }

        @Test
        @DisplayName("신규 회원이 약관에 false로 동의하면 COMMON_VALIDATION_FAILED(400)")
        void rejectsFalseTermsForNewMember() throws Exception {
            TestWallet wallet = TestWallet.random();
            mvc.perform(post("/api/v1/auth/web3auth")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(web3AuthBody(
                                    WEB3AUTH.idToken(verifierId, email, "Alex", wallet.address()),
                                    wallet.address(), "GOOGLE", "US", false, true)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("COMMON_VALIDATION_FAILED"));
        }

        @Test
        @DisplayName("개인키·니모닉류 필드를 보내면 COMMON_VALIDATION_FAILED(400) — 서버는 받지 않는다")
        void rejectsUnknownSecretFields() throws Exception {
            TestWallet wallet = TestWallet.random();
            mvc.perform(post("/api/v1/auth/web3auth")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of(
                                    "idToken", WEB3AUTH.idToken(verifierId, email, "Alex",
                                            wallet.address()),
                                    "address", wallet.address(),
                                    "provider", "GOOGLE",
                                    "countryCode", "US",
                                    "termsAgreed", true,
                                    "privacyAgreed", true,
                                    "privateKey", "0x" + "11".repeat(32)))))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("COMMON_VALIDATION_FAILED"));
        }

        @Test
        @DisplayName("두 번째 로그인은 회원을 새로 만들지 않는다 — isNewMember=false")
        void secondLoginReusesMember() throws Exception {
            TestWallet wallet = TestWallet.random();
            JsonNode first = data(loginRequest(
                    WEB3AUTH.idToken(verifierId, email, "Alex", wallet.address()),
                    wallet.address()));
            JsonNode second = data(post("/api/v1/auth/web3auth")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(web3AuthBody(
                            WEB3AUTH.idToken(verifierId, email, "Alex", wallet.address()),
                            wallet.address(), "GOOGLE", null, null, null)));

            assertThat(first.get("isNewMember").asBoolean()).isTrue();
            assertThat(second.get("isNewMember").asBoolean()).isFalse();
            assertThat(second.get("memberId").asLong()).isEqualTo(first.get("memberId").asLong());
        }

        @Test
        @DisplayName("지갑을 등록한 회원이 다른 주소로 로그인하면 COMMON_CONFLICT(409)")
        void rejectsAddressChangeAfterLink() throws Exception {
            TestWallet wallet = TestWallet.random();
            TestWallet other = TestWallet.random();
            String token = data(loginRequest(
                    WEB3AUTH.idToken(verifierId, email, "Alex", wallet.address()),
                    wallet.address())).get("accessToken").asText();

            mvc.perform(post("/api/v1/wallets").with(bearer(token))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("provider", "WEB3AUTH",
                                    "address", wallet.address()))))
                    .andExpect(status().isAccepted());

            mvc.perform(loginRequest(
                            WEB3AUTH.idToken(verifierId, email, "Alex", other.address()),
                            other.address()))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("COMMON_CONFLICT"));
        }
    }

    // ================================================================ 세션

    @Nested
    @DisplayName("세션 — API-member-03·04")
    class Session {

        @Test
        @DisplayName("refresh 는 회전한다 — 이전 토큰 재사용은 AUTH_TOKEN_INVALID(401)")
        void rotatesRefreshToken() throws Exception {
            JsonNode login = signIn();
            String oldRefresh = login.get("refreshToken").asText();

            JsonNode rotated = data(post("/api/v1/auth/refresh")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("refreshToken", oldRefresh))));
            assertThat(rotated.get("accessToken").asText()).isNotBlank();
            assertThat(rotated.get("refreshToken").asText()).isNotEqualTo(oldRefresh);

            // 재사용 = 탈취 신호. 401 + 그 회원의 refresh 전량 폐기.
            mvc.perform(post("/api/v1/auth/refresh")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("refreshToken", oldRefresh))))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("AUTH_TOKEN_INVALID"));

            // 전량 폐기됐으므로 회전으로 받은 새 토큰도 더는 쓸 수 없다.
            mvc.perform(post("/api/v1/auth/refresh")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("refreshToken",
                                    rotated.get("refreshToken").asText()))))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("access token 을 refresh 자리에 넣으면 AUTH_TOKEN_INVALID(401)")
        void rejectsAccessTokenAsRefresh() throws Exception {
            JsonNode login = signIn();
            mvc.perform(post("/api/v1/auth/refresh")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("refreshToken",
                                    login.get("accessToken").asText()))))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("AUTH_TOKEN_INVALID"));
        }

        @Test
        @DisplayName("로그아웃은 refresh 를 폐기하고, 다시 호출해도 200이다")
        void logoutIsIdempotent() throws Exception {
            JsonNode login = signIn();
            String access = login.get("accessToken").asText();
            String refresh = login.get("refreshToken").asText();

            JsonNode first = data(post("/api/v1/auth/logout").with(bearer(access))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("refreshToken", refresh))));
            assertThat(first.get("loggedOut").asBoolean()).isTrue();
            assertThat(first.get("revokedCount").asInt()).isEqualTo(1);
            assertThat(first.get("clientAction").asText()).isEqualTo("CLEAR_WEB3AUTH_SESSION");

            JsonNode again = data(post("/api/v1/auth/logout").with(bearer(access))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("refreshToken", refresh))));
            assertThat(again.get("revokedCount").asInt()).isZero();
        }

        @Test
        @DisplayName("인증 헤더 없이 보호된 경로를 부르면 COMMON_UNAUTHORIZED(401)")
        void rejectsMissingAuthorization() throws Exception {
            mvc.perform(get("/api/v1/members/me"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("COMMON_UNAUTHORIZED"));
        }

        @Test
        @DisplayName("위조된 access token 은 AUTH_TOKEN_INVALID(401)")
        void rejectsForgedAccessToken() throws Exception {
            JsonNode login = signIn();
            String token = login.get("accessToken").asText();
            // 서명의 **마지막 글자는 건드리지 않는다.** HS256 서명 32바이트 = base64url 43글자인데
            // 43×6 = 258비트라 마지막 글자는 상위 4비트만 의미가 있고 하위 2비트는 패딩이다. 그래서
            // `w`(48)→`x`(49)처럼 패딩 비트만 바뀌면 디코더가 같은 32바이트로 읽어 서명이 통과한다
            // (`w x y z`가 한 묶음 — 2026-09-09 MR-69 #2에서 200). 서명 **안쪽** 글자를 바꾸면
            // 6비트가 전부 의미 비트라 어떤 다른 글자로 바꿔도 반드시 다른 서명이 된다.
            int signatureStart = token.lastIndexOf('.') + 1;
            int i = signatureStart + 5;
            char c = token.charAt(i);
            String tampered = token.substring(0, i) + (c == 'A' ? 'B' : 'A') + token.substring(i + 1);
            mvc.perform(get("/api/v1/members/me").with(bearer(tampered)))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("AUTH_TOKEN_INVALID"));
        }
    }

    // ================================================================ 외부 지갑

    @Nested
    @DisplayName("API-wallet-03·04 외부 지갑 챌린지 서명")
    class ExternalWallet {

        @Test
        @DisplayName("챌린지 발급 → personal_sign → 등록이 통과한다")
        void challengeAndVerify() throws Exception {
            TestWallet social = TestWallet.random();
            TestWallet external = TestWallet.random();
            String access = signIn(social).get("accessToken").asText();

            JsonNode challenge = data(post("/api/v1/wallets/challenge").with(bearer(access))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("address", external.address()))));

            assertThat(challenge.get("signMethod").asText()).isEqualTo("personal_sign");
            assertThat(challenge.get("chainId").asLong()).isEqualTo(1001L);
            assertThat(challenge.get("nonce").asText()).hasSize(16);
            String message = challenge.get("message").asText();
            assertThat(message)
                    .contains("Address: " + external.address())
                    .contains("Nonce: " + challenge.get("nonce").asText())
                    .contains("Domain: b204.ssafy.io")
                    .endsWith("This signature does not authorize any transfer.");

            JsonNode registered = data(post("/api/v1/wallets").with(bearer(access))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of(
                                    "provider", "EXTERNAL",
                                    "address", external.address(),
                                    "nonce", challenge.get("nonce").asText(),
                                    "signature", external.personalSign(message),
                                    "walletLabel", "KAIA_WALLET"))),
                    202);

            assertThat(registered.get("wallet").get("provider").asText()).isEqualTo("EXTERNAL");
            assertThat(registered.get("wallet").get("walletLabel").asText())
                    .isEqualTo("KAIA_WALLET");
            assertThat(registered.get("grantJobId").asText()).startsWith("chain_");
        }

        @Test
        @DisplayName("다른 지갑으로 서명하면 COMMON_VALIDATION_FAILED(400)")
        void rejectsSignatureFromAnotherKey() throws Exception {
            TestWallet social = TestWallet.random();
            TestWallet external = TestWallet.random();
            TestWallet impostor = TestWallet.random();
            String access = signIn(social).get("accessToken").asText();

            JsonNode challenge = data(post("/api/v1/wallets/challenge").with(bearer(access))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("address", external.address()))));

            mvc.perform(post("/api/v1/wallets").with(bearer(access))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of(
                                    "provider", "EXTERNAL",
                                    "address", external.address(),
                                    "nonce", challenge.get("nonce").asText(),
                                    "signature",
                                    impostor.personalSign(challenge.get("message").asText())))))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("COMMON_VALIDATION_FAILED"));
        }

        @Test
        @DisplayName("챌린지는 1회용이다 — 같은 서명을 다시 쓰면 COMMON_CONFLICT(409)")
        void challengeIsSingleUse() throws Exception {
            TestWallet social = TestWallet.random();
            TestWallet external = TestWallet.random();
            TestWallet impostor = TestWallet.random();
            String access = signIn(social).get("accessToken").asText();

            JsonNode challenge = data(post("/api/v1/wallets/challenge").with(bearer(access))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("address", external.address()))));
            String message = challenge.get("message").asText();
            String nonce = challenge.get("nonce").asText();

            // 첫 시도는 실패지만 챌린지는 소모된다(성공·실패 무관하게 즉시 삭제).
            mvc.perform(post("/api/v1/wallets").with(bearer(access))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("provider", "EXTERNAL",
                                    "address", external.address(), "nonce", nonce,
                                    "signature", impostor.personalSign(message)))))
                    .andExpect(status().isBadRequest());

            // 올바른 서명이어도 챌린지가 없으므로 409다.
            mvc.perform(post("/api/v1/wallets").with(bearer(access))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("provider", "EXTERNAL",
                                    "address", external.address(), "nonce", nonce,
                                    "signature", external.personalSign(message)))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("COMMON_CONFLICT"));
        }

        @Test
        @DisplayName("EXTERNAL 인데 nonce·signature 가 없으면 COMMON_VALIDATION_FAILED(400)")
        void rejectsMissingSignature() throws Exception {
            TestWallet social = TestWallet.random();
            TestWallet external = TestWallet.random();
            String access = signIn(social).get("accessToken").asText();

            mvc.perform(post("/api/v1/wallets").with(bearer(access))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("provider", "EXTERNAL",
                                    "address", external.address()))))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("COMMON_VALIDATION_FAILED"));
        }

        @Test
        @DisplayName("지갑이 없으면 GET /wallets/me 는 WALLET_NOT_FOUND(404)")
        void walletNotFoundBeforeLink() throws Exception {
            String access = signIn().get("accessToken").asText();
            mvc.perform(get("/api/v1/wallets/me").with(bearer(access)))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("WALLET_NOT_FOUND"));
        }
    }

    // ================================================================ 프로필

    @Nested
    @DisplayName("API-member-06 내 정보 수정")
    class Profile {

        @Test
        @DisplayName("locale·displayCurrency·timezone 이 즉시 반영되고 미등록 통화는 오류가 아니다")
        void updatesDisplaySettings() throws Exception {
            String access = signIn().get("accessToken").asText();

            JsonNode updated = data(patch("/api/v1/members/me").with(bearer(access))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("locale", "ko", "displayCurrency", "JPY",
                            "timezone", "Asia/Tokyo"))));

            assertThat(updated.get("locale").asText()).isEqualTo("ko");
            assertThat(updated.get("displayCurrency").asText()).isEqualTo("JPY");
            assertThat(updated.get("timezone").asText()).isEqualTo("Asia/Tokyo");
            // 환율 레코드가 없으므로 표시 불가지만 저장은 됐다 — 오류로 막지 않는다(§0.5).
            assertThat(updated.get("displaySupported").asBoolean()).isFalse();
            assertThat(updated.has("appliedRate")).isFalse();

            assertThat(data(get("/api/v1/members/me").with(bearer(access)))
                    .get("timezone").asText()).isEqualTo("Asia/Tokyo");
        }

        @Test
        @DisplayName("지원하지 않는 locale 은 COMMON_VALIDATION_FAILED(400)")
        void rejectsUnsupportedLocale() throws Exception {
            String access = signIn().get("accessToken").asText();
            mvc.perform(patch("/api/v1/members/me").with(bearer(access))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("locale", "fr"))))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("COMMON_VALIDATION_FAILED"));
        }

        @Test
        @DisplayName("소셜 회원의 비밀번호 변경 시도는 COMMON_VALIDATION_FAILED(400)")
        void rejectsPasswordChangeForSocialMember() throws Exception {
            String access = signIn().get("accessToken").asText();
            mvc.perform(patch("/api/v1/members/me").with(bearer(access))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("currentPassword", "old-password-1",
                                    "newPassword", "new-password-1"))))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("COMMON_VALIDATION_FAILED"));
        }

        @Test
        @DisplayName("[v7] preferredGenres 는 전체 교체다 — 미전달은 유지, 빈 배열은 전부 삭제")
        void replacesPreferredGenres() throws Exception {
            String access = signIn().get("accessToken").asText();

            // 선택 전에는 빈 배열이다(키가 빠지지 않는다).
            assertThat(data(get("/api/v1/members/me").with(bearer(access)))
                    .get("preferredGenres")).isEmpty();

            JsonNode saved = data(patch("/api/v1/members/me").with(bearer(access))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("preferredGenres", List.of("ROCK", "INDIE")))));
            assertThat(saved.get("preferredGenres")).extracting(JsonNode::asText)
                    .containsExactly("INDIE", "ROCK");

            // 다른 필드만 보낸 요청은 선호 장르를 건드리지 않는다.
            data(patch("/api/v1/members/me").with(bearer(access))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("locale", "ko"))));
            assertThat(data(get("/api/v1/members/me").with(bearer(access)))
                    .get("preferredGenres")).hasSize(2);

            // 전체 교체 — DELETE 가 INSERT 보다 먼저 나가야 PK 충돌이 없다.
            JsonNode replaced = data(patch("/api/v1/members/me").with(bearer(access))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("preferredGenres", List.of("ROCK", "JAZZ")))));
            assertThat(replaced.get("preferredGenres")).extracting(JsonNode::asText)
                    .containsExactly("JAZZ", "ROCK");

            JsonNode cleared = data(patch("/api/v1/members/me").with(bearer(access))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("preferredGenres", List.of()))));
            assertThat(cleared.get("preferredGenres")).isEmpty();
        }

        @Test
        @DisplayName("[v7] preferredGenres 4개·허용값 밖·중복은 COMMON_VALIDATION_FAILED(400)")
        void rejectsInvalidPreferredGenres() throws Exception {
            String access = signIn().get("accessToken").asText();

            for (List<String> invalid : List.of(
                    List.of("ROCK", "INDIE", "POP", "JAZZ"),
                    List.of("KPOP"),
                    List.of("ROCK", "ROCK"))) {
                mvc.perform(patch("/api/v1/members/me").with(bearer(access))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(json(Map.of("preferredGenres", invalid))))
                        .andExpect(status().isBadRequest())
                        .andExpect(jsonPath("$.code").value("COMMON_VALIDATION_FAILED"));
            }
        }
    }

    @Nested
    @DisplayName("API-recommendation-01 맞춤 추천 목록")
    class Recommendations {

        @Test
        @DisplayName("GUEST 는 401 — 회원마다 결과가 다른 개인화 섹션이다")
        void rejectsGuest() throws Exception {
            mvc.perform(get("/api/v1/recommendations/performances"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("공연이 없으면 basis=FALLBACK + 빈 목록이다(404 가 아니다)")
        void returnsEmptyFallbackWhenNoCandidate() throws Exception {
            String access = signIn().get("accessToken").asText();

            JsonNode data = data(get("/api/v1/recommendations/performances")
                    .with(bearer(access)));

            assertThat(data.get("basis").asText()).isEqualTo("FALLBACK");
            assertThat(data.get("items")).isEmpty();
            assertThat(data.get("sessionId").asText()).isNotBlank();
            // reason 은 2차 전엔 항상 null 이고 전역 non_null 직렬화라 키가 없다.
            assertThat(data.has("reason")).isFalse();
        }
    }

    @Nested
    @DisplayName("경계면 QA 재작업 (2026-09-08)")
    class QaFixes {

        // ------------------------------------------------------------ #8 name 1~40

        @Test
        @DisplayName("이름이 40자를 넘으면 COMMON_VALIDATION_FAILED(400) — Body 표가 1~40 이다")
        void rejectsTooLongName() throws Exception {
            String access = signIn().get("accessToken").asText();

            mvc.perform(patch("/api/v1/members/me").with(bearer(access))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("name", "가".repeat(41)))))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("COMMON_VALIDATION_FAILED"));

            // 40자는 통과한다 — 경계를 함께 고정한다.
            assertThat(data(patch("/api/v1/members/me").with(bearer(access))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("name", "가".repeat(40))))).get("name").asText())
                    .hasSize(40);
        }

        // ------------------------------------------------------------ #9 timezone IANA

        @Test
        @DisplayName("가입 시 timezone 이 IANA 가 아니면 COMMON_VALIDATION_FAILED(400)")
        void rejectsNonIanaTimezoneOnSignUp() throws Exception {
            TestWallet wallet = TestWallet.random();
            String id = UUID.randomUUID().toString().substring(0, 8);
            mvc.perform(post("/api/v1/auth/web3auth")
                            .with(fromIp("198.51.100." + (int) (Math.random() * 250 + 1)))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of(
                                    "idToken", WEB3AUTH.idToken("verifier-" + id,
                                            id + "@example.com", "Alex", wallet.address()),
                                    "address", wallet.address(),
                                    "provider", "GOOGLE",
                                    "countryCode", "KR",
                                    "timezone", "Asia/Nowhere",
                                    "termsAgreed", true,
                                    "privacyAgreed", true))))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("COMMON_VALIDATION_FAILED"));
        }

        @Test
        @DisplayName("member-06 도 같은 검증이다 — 잘못된 timezone 은 400")
        void rejectsNonIanaTimezoneOnUpdate() throws Exception {
            String access = signIn().get("accessToken").asText();
            mvc.perform(patch("/api/v1/members/me").with(bearer(access))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("timezone", "KST"))))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("COMMON_VALIDATION_FAILED"));
        }

        // ------------------------------------------------------------ #10 rate limit

        @Test
        @DisplayName("로그인이 IP당 60회/분을 넘으면 429 + Retry-After 다(§0.9 · SEC-10)")
        void loginRateLimitedPerIp() throws Exception {
            String ip = "203.0.113." + (int) (Math.random() * 250 + 1);
            TestWallet wallet = TestWallet.random();
            String idToken = WEB3AUTH.idToken(verifierId, email, "Alex Kim", wallet.address());

            String retryAfter = null;
            // 고정 창이라 경계를 넘으면 카운터가 리셋된다 — 두 창을 채울 만큼 보낸다.
            for (int i = 0; i < 130 && retryAfter == null; i++) {
                MvcResult result = mvc.perform(loginRequest(idToken, wallet.address())
                        .with(fromIp(ip))).andReturn();
                if (result.getResponse().getStatus() == 429) {
                    assertThat(body(result).get("code").asText())
                            .isEqualTo("COMMON_TOO_MANY_REQUESTS");
                    assertThat(body(result).get("data").isNull()).isTrue();
                    retryAfter = result.getResponse().getHeader(HttpHeaders.RETRY_AFTER);
                }
            }
            assertThat(retryAfter).isNotNull();
            assertThat(Integer.parseInt(retryAfter)).isBetween(1, 60);
        }

        @Test
        @DisplayName("지갑 챌린지는 회원당 10회/분이다 — 11번째가 429")
        void challengeRateLimitedPerMember() throws Exception {
            TestWallet social = TestWallet.random();
            TestWallet external = TestWallet.random();
            String access = signIn(social).get("accessToken").asText();

            String retryAfter = null;
            for (int i = 0; i < 25 && retryAfter == null; i++) {
                MvcResult result = mvc.perform(post("/api/v1/wallets/challenge")
                        .with(bearer(access))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("address", external.address())))).andReturn();
                if (result.getResponse().getStatus() == 429) {
                    assertThat(body(result).get("code").asText())
                            .isEqualTo("COMMON_TOO_MANY_REQUESTS");
                    retryAfter = result.getResponse().getHeader(HttpHeaders.RETRY_AFTER);
                }
            }
            assertThat(retryAfter).isNotNull();
        }
    }

    // ================================================================ 팀 권한

    @Nested
    @DisplayName("API-team-03·04 권한")
    class TeamAccess {

        @Test
        @DisplayName("리더가 아니면 팀 상세를 볼 수 없다 — COMMON_FORBIDDEN(403)")
        void onlyLeaderCanRead() throws Exception {
            TestWallet leaderWallet = TestWallet.random();
            String leader = signIn(leaderWallet).get("accessToken").asText();
            linkWallet(leader, leaderWallet);
            long teamId = data(post("/api/v1/teams").with(bearer(leader))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("teamName", "팀-" + UUID.randomUUID().toString().substring(0, 8),
                                    "genre", "ETC"))), 201)
                    .get("teamId").asLong();

            String outsider = signInAsAnother().get("accessToken").asText();
            mvc.perform(get("/api/v1/teams/" + teamId).with(bearer(outsider)))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("COMMON_FORBIDDEN"));
        }

        @Test
        @DisplayName("없는 팀은 TEAM_NOT_FOUND(404)")
        void missingTeam() throws Exception {
            String access = signIn().get("accessToken").asText();
            mvc.perform(get("/api/v1/teams/99999999").with(bearer(access)))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("TEAM_NOT_FOUND"));
        }

        @Test
        @DisplayName("같은 리더가 같은 이름의 팀을 또 만들면 COMMON_CONFLICT(409)")
        void rejectsDuplicateTeamNameForSameLeader() throws Exception {
            TestWallet wallet = TestWallet.random();
            String access = signIn(wallet).get("accessToken").asText();
            linkWallet(access, wallet);
            String name = "팀-" + UUID.randomUUID().toString().substring(0, 8);

            mvc.perform(post("/api/v1/teams").with(bearer(access))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("teamName", name, "genre", "ETC"))))
                    .andExpect(status().isCreated());
            mvc.perform(post("/api/v1/teams").with(bearer(access))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("teamName", name, "genre", "ETC"))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("COMMON_CONFLICT"));
        }

        @Test
        @DisplayName("팀 이름이 30자를 넘으면 COMMON_VALIDATION_FAILED(400)")
        void rejectsTooLongTeamName() throws Exception {
            TestWallet wallet = TestWallet.random();
            String access = signIn(wallet).get("accessToken").asText();
            linkWallet(access, wallet);

            mvc.perform(post("/api/v1/teams").with(bearer(access))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("teamName", "가".repeat(31)))))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("COMMON_VALIDATION_FAILED"));
        }
    }

    // ================================================================ helpers

    private JsonNode signIn() throws Exception {
        return signIn(TestWallet.random());
    }

    private JsonNode signIn(TestWallet wallet) throws Exception {
        return data(loginRequest(WEB3AUTH.idToken(verifierId, email, "Alex Kim", wallet.address()),
                wallet.address()));
    }

    private JsonNode signInAsAnother() throws Exception {
        String id = UUID.randomUUID().toString().substring(0, 8);
        TestWallet wallet = TestWallet.random();
        return data(loginRequest(
                WEB3AUTH.idToken("verifier-" + id, id + "@example.com", "Other", wallet.address()),
                wallet.address()));
    }

    static RequestPostProcessor fromIp(String ip) {
        return request -> {
            request.setRemoteAddr(ip);
            return request;
        };
    }

    private void linkWallet(String accessToken, TestWallet wallet) throws Exception {
        mvc.perform(post("/api/v1/wallets").with(bearer(accessToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("provider", "WEB3AUTH", "address", wallet.address()))))
                .andExpect(status().isAccepted());
    }

    /**
     * 로그인 요청. <b>호출마다 다른 클라이언트 IP</b>를 쓴다 — §0.9 한도가 IP당 60회/분이라
     * 테스트끼리 버킷을 공유하면 뒤 테스트가 429로 죽는다. 한도를 검증하는 테스트만 고정한다.
     */
    private MockHttpServletRequestBuilder loginRequest(String idToken, String address) {
        return post("/api/v1/auth/web3auth")
                .with(fromIp("198.51.100." + (int) (Math.random() * 250 + 1)))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of(
                        "idToken", idToken,
                        "address", address,
                        "provider", "GOOGLE",
                        "countryCode", "US",
                        "termsAgreed", true,
                        "privacyAgreed", true)));
    }

    private JsonNode data(MockHttpServletRequestBuilder request) throws Exception {
        return data(request, 200);
    }

    private JsonNode data(MockHttpServletRequestBuilder request, int expectedStatus)
            throws Exception {
        MvcResult result = mvc.perform(request)
                .andExpect(status().is(expectedStatus))
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andReturn();
        return body(result).get("data");
    }

    private JsonNode body(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private String json(Map<String, ?> value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private String web3AuthBody(String idToken, String address, String provider,
                                String countryCode, Boolean termsAgreed,
                                Boolean privacyAgreed) {
        var body = objectMapper.createObjectNode()
                .put("idToken", idToken)
                .put("address", address)
                .put("provider", provider);
        if (countryCode != null) {
            body.put("countryCode", countryCode);
        }
        if (termsAgreed != null) {
            body.put("termsAgreed", termsAgreed);
        }
        if (privacyAgreed != null) {
            body.put("privacyAgreed", privacyAgreed);
        }
        return body.toString();
    }

    /** {@code Authorization: Bearer ...}를 붙인다. */
    private static org.springframework.test.web.servlet.request.RequestPostProcessor bearer(
            String accessToken) {
        return request -> {
            request.addHeader(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken);
            return request;
        };
    }
}
