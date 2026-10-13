package com.ssafy.b204;

import static org.assertj.core.api.Assertions.assertThat;

import com.ssafy.b204.support.IntegrationTestBase;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * 등록된 엔드포인트가 API 명세서 v6 §0.11 인벤토리와 <b>글자 단위로</b> 일치하는지 지킨다.
 *
 * <p>명세는 "엔드포인트 번호·메서드·경로·이름은 결정 문서 v2 §9 인벤토리와 글자 단위로 동일하며
 * 이 문서에서 임의로 만들지 않는다"고 못박았다. 프론트가 이 경로로 클라이언트를 만들기 때문에
 * 오타 하나가 통합 단계에서야 드러난다 — 그걸 CI에서 잡는다.
 *
 * <p>기대 목록은 API v7 §1~§14 각 절의 첫 줄(메서드 + 경로)에서 뽑은 것이다. 명세가 바뀌면
 * <b>이 목록을 먼저 고치고</b> 그다음 컨트롤러를 고친다 — 순서가 뒤바뀌면 명세가 코드를 따라가게
 * 된다.
 */
class EndpointInventoryTest extends IntegrationTestBase {

    /**
     * API v6의 P0 63개 + P1 3개(API-member-02·08, API-coin-04) + <b>코드가 먼저 나간 신설 6개</b>
     * + 추천 1개(API-recommendation-01) = 73개 + <b>본인 확인(패스키) 4개</b>(API-webauthn-01~04,
     * API v7 §7.W · 2026-09-24, P1 — 스위치 기본 off) + <b>팀 검색 1개</b>(API-team-06,
     * 2026-09-26) = <b>78개</b>. 신설분은 전부 API v7 개정 대상이다.
     *
     * <p>[2026-09-22] 공연 미디어 2개 — API-performance-16·17
     * ({@code POST}·{@code GET .../media/{kind}}).
     *
     * <p>[2026-09-22] API-team-05(팀 해산) · 참여팀 조회({@code GET .../participants}) ·
     * {@code POST /api/v1/files}(이미지 업로드) 3개.
     *
     * <p>[2026-09-22] API-performance-18(공연 삭제) 1개. 16·17이 미디어에 먼저 나가 18을 받았다.
     *
     * <p>[2026-09-22] API v7 §14 recommendation 신설 — API-recommendation-01 1개.
     *
     * <p>[2026-09-21] P0가 62 → 63이다 — API-settlement-08(정산 조기 동의)을 신설했다.
     *
     * <p>[2026-09-15 · S15P21B204-99] P0가 61 → 62다 — API-performance-15(티켓 옵션 조회)를 신설했다.
     *
     * <p>P1도 경로를 미리 잡아 두었다 — 나중에 켤 때 경로가 바뀌면 프론트 라우팅이 함께 흔들린다.
     */
    private static final List<String> EXPECTED = List.of(
            // §1 member — API-member-01·02·03·04·05·06·08
            "POST /api/v1/auth/web3auth",
            "POST /api/v1/auth/login",
            "POST /api/v1/auth/refresh",
            "POST /api/v1/auth/logout",
            "POST /api/v1/auth/signup",
            "GET /api/v1/members/me",
            "PATCH /api/v1/members/me",
            // §2 team — API-team-01~05
            "POST /api/v1/teams",
            "GET /api/v1/teams/me",
            // API-team-06 팀 검색(2026-09-26 신설) — P-04 초대 자동완성. v3 삭제 번호 재사용.
            "GET /api/v1/teams/search",
            "GET /api/v1/teams/{teamId}",
            "PATCH /api/v1/teams/{teamId}",
            // API-team-05 팀 해산 — 코드가 먼저 나갔다. 문서 개정에서 같은 번호로 합류한다
            // (v6 §2 말미의 API-team-05는 v3에서 삭제된 팀원 초대라 번호가 비어 있다).
            "DELETE /api/v1/teams/{teamId}",
            // §3 wallet — API-wallet-01·02·03·04
            "GET /api/v1/wallets/me",
            "GET /api/v1/wallets/me/transactions",
            "POST /api/v1/wallets/challenge",
            "POST /api/v1/wallets",
            // §4 performance — API-performance-01~15
            "POST /api/v1/performances",
            "GET /api/v1/performances",
            "GET /api/v1/performances/{performanceId}",
            "PATCH /api/v1/performances/{performanceId}",
            "POST /api/v1/performances/{performanceId}/media/{kind}",
            "GET /api/v1/performances/{performanceId}/media/{kind}",
            // API-performance-18 공연 삭제 — 신설. 규칙 동의 전 · 보증금 미납만 지운다.
            "DELETE /api/v1/performances/{performanceId}",
            "PUT /api/v1/performances/{performanceId}/ticket-types",
            "GET /api/v1/performances/{performanceId}/ticket-types",
            "GET /api/v1/performances/me",
            "POST /api/v1/performances/{performanceId}/participants",
            "POST /api/v1/performances/{performanceId}/participants/{teamId}/accept",
            "DELETE /api/v1/performances/{performanceId}/participants/{teamId}",
            // API-performance-19 참여팀 조회 — 신설. INVITED 팀까지 보여 주는 스튜디오용이다.
            "GET /api/v1/performances/{performanceId}/participants",
            "GET /api/v1/performances/{performanceId}/entry-link",
            "GET /api/v1/performances/{performanceId}/sales",
            "POST /api/v1/performances/{performanceId}/cancel",
            "POST /api/v1/performances/{performanceId}/deposit/prepare",
            "POST /api/v1/performances/{performanceId}/deposit/signed-tx",
            // §5 rule — API-rule-01·02·03·05·04
            "PUT /api/v1/performances/{performanceId}/rules",
            "GET /api/v1/performances/{performanceId}/rules",
            "POST /api/v1/performances/{performanceId}/rules/agreements/prepare",
            "POST /api/v1/performances/{performanceId}/rules/agreements/signed-tx",
            "POST /api/v1/performances/{performanceId}/sale/start",
            // §6 ticket — API-ticket-01~06
            "POST /api/v1/orders",
            "GET /api/v1/orders/me",
            "GET /api/v1/orders/{orderId}",
            "GET /api/v1/tickets/me",
            "GET /api/v1/tickets/{ticketId}",
            "GET /api/v1/tickets/{ticketId}/qr",
            // §7 payment — API-payment-01·02·03
            "POST /api/v1/orders/{orderId}/payment",
            "GET /api/v1/orders/{orderId}/payment",
            "POST /api/v1/orders/{orderId}/payment/signed-tx",
            // §7.W webauthn — API-webauthn-01~04 (2026-09-24)
            "POST /api/v1/webauthn/registration/options",
            "POST /api/v1/webauthn/registration",
            "POST /api/v1/webauthn/authentication/options",
            "POST /api/v1/webauthn/authentication",
            // §8 coin + chain — API-coin-01·02·03·04·07·08, API-chain-01
            "GET /api/v1/coin/supply",
            "GET /api/v1/coin/rates",
            "PUT /api/v1/admin/coin/rates",
            "GET /api/v1/coin/config",
            "PUT /api/v1/admin/coin/grants",
            "GET /api/v1/admin/coin/grants",
            "GET /api/v1/chain/jobs/{jobId}",
            // §9 refund — API-refund-01·02
            "GET /api/v1/tickets/{ticketId}/refund-quote",
            "POST /api/v1/tickets/{ticketId}/cancel",
            // §10 entry — API-entry-01·02
            "POST /api/v1/entries/verify",
            "GET /api/v1/performances/{performanceId}/entries",
            // §11 settlement — API-settlement-01~08
            "GET /api/v1/performances/{performanceId}/settlement",
            "POST /api/v1/performances/{performanceId}/settlement/aggregate",
            "POST /api/v1/performances/{performanceId}/settlement/lock",
            "POST /api/v1/performances/{performanceId}/settlement/disputes",
            "POST /api/v1/performances/{performanceId}/settlement/release",
            "POST /api/v1/performances/{performanceId}/settlement/share-link",
            // API-settlement-08 정산 조기 동의 — 코드가 먼저 나갔다. 문서 개정에서 같은 번호로 합류한다.
            "POST /api/v1/performances/{performanceId}/settlement/approvals",
            "GET /api/v1/public/settlement/{shareToken}",
            // §12 verify — API-verify-01
            "GET /api/v1/performances/{performanceId}/verification",
            // §파일(신설) — POST /api/v1/files 이미지 업로드. 도메인 단수형 경로가 아니라
            // 복수형인 것은 §0.1 경로 규칙(리소스 컬렉션)을 따른 것이다.
            "POST /api/v1/files",
            // §13 admin — API-admin-09·06
            "GET /api/v1/admin/disputes",
            "PATCH /api/v1/admin/disputes/{disputeId}",
            // §14 recommendation — API-recommendation-01 [v7]
            "GET /api/v1/recommendations/performances");

    /**
     * 빈 이름으로 한정한다 — actuator 의 {@code controllerEndpointHandlerMapping} 도
     * {@link RequestMappingHandlerMapping} 을 상속해 타입만으로는 후보가 둘이다.
     * 우리가 보려는 것은 {@code @RestController} 매핑을 모으는 MVC 기본 빈이다.
     */
    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    private RequestMappingHandlerMapping handlerMapping;

    @Test
    @DisplayName("명세와 코드가 먼저 나간 신설분까지 엔드포인트 78개가 빠짐없이 등록돼 있다")
    void allSpecEndpointsAreRegistered() {
        Set<String> registered = registeredEndpoints();

        assertThat(registered).containsAll(EXPECTED);
    }

    @Test
    @DisplayName("명세에 없는 엔드포인트를 만들지 않았다 — 코드는 명세의 결과물이다")
    void noEndpointsBeyondSpec() {
        Set<String> registered = registeredEndpoints();
        Set<String> unexpected = new TreeSet<>(registered);
        EXPECTED.forEach(unexpected::remove);

        assertThat(unexpected)
                .as("명세 v6에 없는 경로가 등록됐다. 명세를 먼저 고치거나 경로를 지워야 한다.")
                .isEmpty();
    }

    @Test
    @DisplayName("엔드포인트 개수가 정확히 78개다")
    void endpointCountMatches() {
        assertThat(registeredEndpoints()).hasSize(EXPECTED.size());
    }

    @Test
    @DisplayName("모든 경로가 /api/v1 로 시작한다 — 컨트롤러 매핑 규칙(§0.1)")
    void allPathsAreUnderApiV1() {
        for (String endpoint : registeredEndpoints()) {
            assertThat(endpoint).matches("^(GET|POST|PUT|PATCH|DELETE) /api/v1/.*");
        }
    }

    /** {@code "GET /api/v1/..."} 형태로 등록된 매핑을 모은다. actuator·에러 핸들러는 뺀다. */
    private Set<String> registeredEndpoints() {
        Set<String> result = new TreeSet<>();
        handlerMapping.getHandlerMethods().forEach((info, method) -> {
            for (String path : paths(info)) {
                if (!path.startsWith("/api/")) {
                    continue;
                }
                for (var httpMethod : info.getMethodsCondition().getMethods()) {
                    result.add(httpMethod.name() + " " + path);
                }
            }
        });
        return result;
    }

    private static Set<String> paths(RequestMappingInfo info) {
        if (info.getPathPatternsCondition() != null) {
            Set<String> patterns = new TreeSet<>();
            info.getPathPatternsCondition().getPatternValues().forEach(patterns::add);
            return patterns;
        }
        return Set.of();
    }
}
