package com.ssafy.b204.verify;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.response.ApiResponse;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.settlement.SettlementTestFixture;
import com.ssafy.b204.common.security.JwtTokenProvider;
import com.ssafy.b204.support.Bearer;
import com.ssafy.b204.support.IntegrationTestBase;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import com.ssafy.b204.team.entity.Team;
import com.ssafy.b204.verify.controller.VerifyController;
import com.ssafy.b204.verify.dto.VerifyDtos.VerificationResponse;
import com.ssafy.b204.verify.service.VerifyService;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * API-verify-01 응답의 <b>JSON 계약</b> — openapi {@code VerificationData}와 필드가 글자 단위로
 * 같은지 지킨다.
 *
 * <p>프론트(V-01)는 이 키 이름으로 타입을 만든다. {@code VerifyServiceTest}가 <b>값</b>을 보고,
 * 이 테스트는 <b>키</b>를 본다 — record 필드를 지우거나 이름을 바꾸면 컴파일은 통과하고 통합
 * 단계에서야 드러나는 사고를 여기서 잡는다.
 *
 * <p>기대 목록은 {@code docs/design/api/openapi.yaml}의 {@code Verification*} 스키마에서 뽑았다.
 * <b>명세가 바뀌면 이 목록을 먼저 고치고</b> DTO를 고친다({@code EndpointInventoryTest}와 같은 규칙).
 *
 * <p><b>모든 필드가 값을 갖도록 세계를 완성해 둔다.</b> {@code default-property-inclusion: non_null}
 * 이라 값이 {@code null}인 필드는 JSON에서 통째로 사라지고, 그러면 키 대조가 헐거워진다. 그래서
 * 규칙 잠금·동의·release·보증금 반환까지 끝난 공연을 만든다.
 */
@AutoConfigureMockMvc
class VerifyApiIntegrationTest extends IntegrationTestBase {

    /** openapi {@code VerificationData}의 프로퍼티 — 순서까지 명세 그대로다. */
    private static final List<String> DATA_FIELDS = List.of(
            "performanceId", "performanceTitle", "performedAt", "settlementStatus", "network",
            "chainId", "contracts", "lockedRule", "agreements", "onchainCounters",
            "recalculationInput", "shares", "escrowReconciliation", "releaseReconciliation",
            "depositReconciliation", "receiptSummary", "releaseTx", "guarantees",
            "simulationNotice", "refreshedAt", "stale");

    private static final String RULES_HASH = "0x" + "ab".repeat(32);
    /** R = 60,000 · 5000/5000 · 3334/3333/3333 · 카운터 3·2·1 의 계산 결과. */
    private static final long[] PAYOUTS = {25_002L, 19_999L, 14_999L};

    @Autowired VerifyController verifyController;
    @Autowired VerifyService verifyService;
    @Autowired SettlementTestFixture fixture;
    @Autowired FakeVerifyChainReader verifyChain;
    @Autowired ObjectMapper objectMapper;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired MockMvc mvc;
    @Autowired JwtTokenProvider tokens;

    private SettlementTestFixture.World world;
    private MemberPrincipal hostLeader;

    @BeforeEach
    void setUp() {
        verifyChain.reset();
        verifyService.invalidateAll();
        world = fixture.createWorld(5000, 5000, new int[]{3334, 3333, 3333});
        hostLeader = MemberPrincipal.of(world.hostLeader().getMemberId(),
                world.hostLeader().getEmail(), false);

        fixture.placeOrder(world, fixture.createAudience(), world.teams().get(0), 3, 10_000L, 0);
        fixture.placeOrder(world, fixture.createAudience(), world.teams().get(1), 2, 10_000L, 0);
        fixture.placeOrder(world, fixture.createAudience(), world.teams().get(2), 1, 10_000L, 0);
        seedLockedRule();
        seedAgreements();
        seedReleasedSettlement();
        seedDepositReturned();

        // release 가 끝난 뒤의 온체인 상태 — 에스크로·보증금은 비었고 확정 몫만 남는다.
        verifyChain.escrow = 0L;
        verifyChain.deposit = 0L;
        verifyChain.counts = new long[]{3, 2, 1};
        verifyChain.payouts = PAYOUTS;
        verifyChain.rulesHash = RULES_HASH;
        verifyChain.hostTeamIndex = 0;
        verifyChain.teamWallets = List.of(walletAddress(0), walletAddress(1), walletAddress(2));
    }

    @Test
    @DisplayName("200 응답의 봉투와 data 필드가 openapi 와 같다")
    void responseShapeMatchesSpec() throws Exception {
        ApiResponse<VerificationResponse> response =
                verifyController.verification(hostLeader, performanceId());
        JsonNode json = objectMapper.readTree(objectMapper.writeValueAsString(response));

        assertThat(fieldNames(json)).containsExactly("code", "data", "msg");
        assertThat(json.get("code").asText()).isEqualTo("SUCCESS");

        JsonNode data = json.get("data");
        assertThat(fieldNames(data)).containsExactlyElementsOf(DATA_FIELDS);

        assertThat(fieldNames(data.get("contracts"))).containsExactly(
                "tokenAddress", "tokenSymbol", "tokenDecimals", "revenueSplitter",
                "explorerBaseUrl");
        assertThat(fieldNames(data.get("lockedRule"))).containsExactly(
                "rulesHash", "raw", "onchainRulesHash", "hashMatched", "lockedAt",
                "startSaleTxHash");
        assertThat(fieldNames(data.get("lockedRule").get("raw"))).containsExactly(
                "performanceId", "fixedRatioBp", "selectionRatioBp", "teamShares", "hostTeamId");
        assertThat(fieldNames(data.get("lockedRule").get("raw").get("teamShares").get(0)))
                .containsExactly("teamId", "shareBp");
        assertThat(fieldNames(data.get("agreements").get(0))).containsExactly(
                "teamId", "teamName", "walletAddress", "onchainAgreed", "signerType", "txHash",
                "agreedAt");
        // choiceCount 뒤 세 필드가 B-5 개정으로 들어온 관측값이다.
        assertThat(fieldNames(data.get("onchainCounters").get(0))).containsExactly(
                "teamId", "teamIndex", "choiceCount", "purchaseCount", "refundCount",
                "refundedAmount");
        assertThat(fieldNames(data.get("recalculationInput"))).containsExactly(
                "grossRevenueAmount", "refundedAmount", "netRevenueAmount", "distributableAmount",
                "fixedRatioBp", "selectionRatioBp", "teamShares", "participantCount",
                "totalChoiceCount", "roundingRule", "remainderRule", "hostTeamId", "dustAmount",
                "tokenDecimals", "currency");
        assertThat(fieldNames(data.get("shares").get(0))).containsExactly(
                "teamId", "teamName", "fixedAmount", "choiceAmount", "dustAmount", "totalAmount");
        assertThat(fieldNames(data.get("escrowReconciliation"))).containsExactly(
                "purchasedTotal", "refundedTotal", "releasedTotal", "escrowBalanceOnchain",
                "expectedEscrowBalance", "matched", "note");
        assertThat(fieldNames(data.get("releaseReconciliation"))).containsExactly(
                "releasedEventTotal", "recalculatedTotal", "difference", "matched",
                "releasedEvents");
        assertThat(fieldNames(data.get("releaseReconciliation").get("releasedEvents").get(0)))
                .containsExactly("teamWallet", "amount");
        assertThat(fieldNames(data.get("depositReconciliation"))).containsExactly(
                "amount", "status", "paidTxHash", "returnTxHash", "matched");
        assertThat(fieldNames(data.get("receiptSummary").get(0))).containsExactly(
                "teamId", "walletAddress", "receivedAmount", "received", "receivedAt");
        assertThat(fieldNames(data.get("releaseTx"))).containsExactly(
                "txHash", "explorerUrl", "releasedAt");
        assertThat(fieldNames(data.get("guarantees"))).containsExactly(
                "guaranteed", "notGuaranteed");

        // 대사 3종이 전부 맞는 상태를 만들어 두었다 — 하나라도 false 면 데이터 배선이 틀린 것이다.
        assertThat(data.get("escrowReconciliation").get("matched").asBoolean()).isTrue();
        assertThat(data.get("releaseReconciliation").get("matched").asBoolean()).isTrue();
        assertThat(data.get("depositReconciliation").get("matched").asBoolean()).isTrue();
        assertThat(data.get("lockedRule").get("hashMatched").asBoolean()).isTrue();
        assertThat(data.get("stale").asBoolean()).isFalse();

        // §0.2 — 시각은 오프셋 표기다. Z 나 오프셋 없는 표기는 계약 위반이다.
        assertThat(data.get("refreshedAt").asText()).endsWith("+09:00");
        assertThat(data.get("releaseTx").get("explorerUrl").asText())
                .startsWith("https://kairos.kaiascan.io/tx/0x");

        // 개인정보 금지(§0.7) — 관객·주문·티켓 식별자는 어느 필드에도 없다.
        String raw = json.toString();
        assertThat(raw).doesNotContain("memberId").doesNotContain("orderRef")
                .doesNotContain("ticketId").doesNotContain("buyer");
    }

    /**
     * 위 테스트는 컨트롤러를 <b>직접 부르고</b> {@code ObjectMapper} 로 다시 직렬화한다 — 실제 HTTP
     * 응답에서 무엇이 나가는지는 아직 본 적이 없다. 한 번은 MockMvc 로 친다. 대조·덤프는
     * {@code LiveApiSpecRecorder} 가 알아서 한다.
     */
    @Test
    @DisplayName("HTTP 로도 한 번 친다 — V-01 화면이 통째로 이 응답 하나로 그려진다")
    void verificationOverHttp() throws Exception {
        mvc.perform(get("/api/v1/performances/" + performanceId() + "/verification")
                        .with(Bearer.of(tokens, world.hostLeader())))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("참여팀이 아니면 403 — 컨트롤러를 거쳐도 같은 판정이다")
    void outsiderIsForbidden() {
        MemberPrincipal outsider = MemberPrincipal.of(world.outsider().getMemberId(),
                world.outsider().getEmail(), false);

        assertThatThrownBy(() -> verifyController.verification(outsider, performanceId()))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COMMON_FORBIDDEN);
    }

    // ------------------------------------------------------------------ 세계 만들기

    private void seedLockedRule() {
        jdbcTemplate.update("UPDATE settlement_rule SET is_locked = 1, locked_at = NOW(6),"
                        + " lock_tx_hash = ? WHERE performance_id = ?",
                txHash(1), performanceId());
    }

    private void seedAgreements() {
        for (int i = 0; i < world.teams().size(); i++) {
            Team team = world.teams().get(i);
            jdbcTemplate.update("INSERT INTO chain_job (tx_type, signer_type, fee_delegated,"
                            + " issuer_type, target_performance_id, target_team_id, status,"
                            + " tx_hash, confirmations, retry_count, requested_at, confirmed_at)"
                            + " VALUES ('AGREE','USER',1,'MOCK',?,?,'CONFIRMED',?,1,0,NOW(6),NOW(6))",
                    performanceId(), team.getTeamId(), txHash(10 + i));
            jdbcTemplate.update("INSERT INTO rule_agreement (performance_id, team_id, status,"
                            + " agreed_rules_hash, agree_tx_hash, agreed_at, requester_member_id)"
                            + " VALUES (?,?,'AGREED',?,?,NOW(6),?)",
                    performanceId(), team.getTeamId(), RULES_HASH, txHash(10 + i),
                    world.leaders().get(i).getMemberId());
        }
    }

    private void seedReleasedSettlement() {
        jdbcTemplate.update("INSERT INTO settlement (performance_id, status, total_revenue,"
                        + " valid_ticket_count, total_choice_count, counter_match, aggregated_at,"
                        + " locked_at, dispute_deadline_at, released_at, aggregate_tx_hash,"
                        + " lock_tx_hash, release_tx_hash)"
                        + " VALUES (?,'RELEASED',60000,6,6,1,NOW(6),NOW(6),NOW(6),NOW(6),?,?,?)",
                performanceId(), txHash(20), txHash(21), txHash(22));
        Long settlementId = jdbcTemplate.queryForObject(
                "SELECT settlement_id FROM settlement WHERE performance_id = ?", Long.class,
                performanceId());

        long[] fixed = {10_002L, 9_999L, 9_999L};
        long[] selection = {15_000L, 10_000L, 5_000L};
        int[] counts = {3, 2, 1};
        for (int i = 0; i < world.teams().size(); i++) {
            jdbcTemplate.update("INSERT INTO settlement_share (settlement_id, team_id,"
                            + " wallet_address, equal_amount, selection_amount, dust_amount,"
                            + " total_amount, choice_count, released, released_at)"
                            + " VALUES (?,?,?,?,?,0,?,?,1,NOW(6))",
                    settlementId, world.teams().get(i).getTeamId(), walletAddress(i),
                    fixed[i], selection[i], PAYOUTS[i], counts[i]);
        }
        jdbcTemplate.update("INSERT INTO chain_job (tx_type, signer_type, fee_delegated,"
                        + " issuer_type, target_performance_id, status, tx_hash, confirmations,"
                        + " retry_count, requested_at, confirmed_at)"
                        + " VALUES ('RELEASE','OPERATOR',0,'MOCK',?,'CONFIRMED',?,1,0,NOW(6),NOW(6))",
                performanceId(), txHash(22));
    }

    private void seedDepositReturned() {
        jdbcTemplate.update("UPDATE performance SET deposit_status='RETURNED', deposit_tx_hash=?,"
                        + " deposit_return_tx_hash=?, deposit_returned_at=NOW(6)"
                        + " WHERE performance_id = ?",
                txHash(30), txHash(31), performanceId());
    }

    private static String txHash(int seed) {
        return "0x" + String.format("%064d", seed);
    }

    /** {@code SettlementTestFixture}가 참여팀에 넣는 지갑 주소와 같은 규칙. */
    private static String walletAddress(int index) {
        return "0x" + String.format("%040d", index + 1);
    }

    private static List<String> fieldNames(JsonNode node) {
        List<String> names = new ArrayList<>();
        node.fieldNames().forEachRemaining(names::add);
        return names;
    }

    private Long performanceId() {
        return world.performance().getPerformanceId();
    }
}
