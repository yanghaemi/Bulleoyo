package com.ssafy.b204;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.b204.chain.client.KaiaChainClient;
import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.worker.ContractOperatorTxBuilder;
import com.ssafy.b204.performance.repository.PerformanceParticipantRepository;
import com.ssafy.b204.performance.repository.PerformanceRepository;
import com.ssafy.b204.refund.repository.RefundRepository;
import com.ssafy.b204.rule.repository.SettlementRuleRepository;
import com.ssafy.b204.settlement.repository.SettlementRepository;
import com.ssafy.b204.settlement.service.SettlementCalculator;
import com.ssafy.b204.settlement.FakeSettlementChainReader;
import com.ssafy.b204.settlement.service.SettlementReconciler;
import com.ssafy.b204.wallet.repository.WalletRepository;
import org.web3j.abi.FunctionReturnDecoder;
import org.web3j.abi.TypeReference;
import org.web3j.abi.Utils;
import org.web3j.crypto.Hash;
import org.web3j.crypto.Keys;
import org.web3j.crypto.TransactionDecoder;
import org.web3j.utils.Numeric;
import com.ssafy.b204.chain.worker.ChainOwnership;
import com.ssafy.b204.chain.config.ChainWallet;
import com.ssafy.b204.chain.config.ChainWorkerProperties;
import com.ssafy.b204.chain.contract.RevenueSplitter;
import com.ssafy.b204.chain.metrics.ChainMetrics;
import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.chain.service.FeeDelegationService;
import com.ssafy.b204.chain.service.ReceiptEvents;
import com.ssafy.b204.chain.service.ReceiptVerifier;
import com.ssafy.b204.chain.service.TxReceipt;
import com.ssafy.b204.chain.service.ChainJobConfirmationService;
import com.ssafy.b204.chain.worker.ChainJobStateWriter;
import com.ssafy.b204.chain.worker.ChainJobWorker;
import com.ssafy.b204.chain.worker.ChainWalletQueue;
import com.ssafy.b204.chain.worker.OperatorTxBuilder;
import com.ssafy.b204.settlement.service.SettlementConfirmationService;
import com.ssafy.b204.support.ChainLogs;
import com.ssafy.b204.wallet.service.WalletBalanceRefresher;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.math.BigInteger;
import java.util.Optional;
import org.springframework.beans.factory.ObjectProvider;
import org.web3j.abi.datatypes.Address;
import org.web3j.abi.datatypes.Type;
import org.web3j.abi.datatypes.generated.Bytes32;
import org.web3j.abi.datatypes.generated.Uint16;
import org.web3j.abi.datatypes.generated.Uint256;
import org.web3j.abi.datatypes.generated.Uint8;
import org.web3j.crypto.KaiaCredentials;
import org.web3j.protocol.core.methods.response.Log;
import org.web3j.protocol.core.methods.response.TransactionReceipt;
import com.ssafy.b204.chain.support.ChainJobIds;
import com.ssafy.b204.chain.support.ContractCalls;
import com.ssafy.b204.common.config.RedisConfig;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.refund.service.RefundService;
import com.ssafy.b204.support.IntegrationTestBase;
import com.ssafy.b204.support.KaiaTxBuilder;
import com.ssafy.b204.support.TestWallet;
import com.ssafy.b204.ticket.dto.TicketDtos.CreateOrderRequest;
import com.ssafy.b204.ticket.dto.TicketDtos.OrderItemInput;
import com.ssafy.b204.ticket.service.OrderService;
import com.ssafy.b204.ticket.service.TicketStock;
import com.ssafy.b204.ticket.service.TicketStockReconciler;
import java.time.Duration;
import com.ssafy.b204.ticket.support.QrTokens;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * <b>공연 생성 → 보증금 → 규칙 동의 → 판매 시작 → 주문 → prepare → signed-tx(202) →
 * CONFIRMED 주입 → PAID → 티켓 발급</b> 세로축을 한 편으로 관통한다 (Jira S15P21B204-47 완료 기준).
 *
 * <p>실제로 도는 것들 — Testcontainers MySQL(Flyway V1) · Testcontainers Redis(재고·잔액 캐시·
 * 멱등키) · 로컬 JWKS 스텁. <b>서명 RLP를 문자열로 지어내지 않는다</b> —
 * {@link KaiaTxBuilder}가 Kaia {@code 0x31} tx의 RLP를 <b>진짜 개인키로 서명해</b> 만들고, 서버는
 * {@code FeeDelegationService}(web3j-ext)가 그것을 디코드하고 <b>서명에서 발신자를 복구해</b>
 * {@code from}·{@code to}·{@code data}를 대조한다. 그러지 않으면 §0.4 ③ 검증이 실증되지 않는다.
 *
 * <p><b>체인 전송·receipt 폴링은 체인 워커의 몫이고 여기서는 돌지 않는다</b>
 * ({@code application-test.yml}의 {@code b204.chain.worker.enabled=false}). 이 테스트는 그
 * 경계에서 {@link ChainJobConfirmationService#confirm}에 receipt를 <b>주입</b>해 확정 이후의 상태
 * 전이를 검증한다 — 워커에 이벤트 파싱이 붙으면 같은 자리를 부르게 된다.
 *
 * <p>컨트랙트 주소는 {@code blockchain/deployments/kairos.json}의 실제 배포값이다(공개 정보).
 * {@code application-test.yml}은 체인 변수를 일부러 비워 두므로(ChainConfigurationTest가 그 요구를
 * 고정한다) 이 클래스에서만 덮어쓴다.
 */
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        // deployments/kairos.json — contracts.YoYo.address / contracts.RevenueSplitter.address
        "b204.chain.contract.yoyo-address=0xA5d7031D70DAab33EACDfC912baC0668D5776e5b",
        "b204.chain.contract.splitter-address=0xa1ca24ECD6adCd29a8998031fd52Cf17F9541738",
        // roles.operator — 개인키가 아니라 주소다. §0.4 signRequests[].feePayer 로 나간다.
        "b204.chain.operator-address=0xfbB324CC674dD2FF21Dff670404391e78F4a199f"
})
class PerformancePaymentFlowTest extends IntegrationTestBase {

    private static final String YOYO = "0xA5d7031D70DAab33EACDfC912baC0668D5776e5b";
    private static final String SPLITTER = "0xa1ca24ECD6adCd29a8998031fd52Cf17F9541738";
    private static final String FEE_PAYER = "0xfbB324CC674dD2FF21Dff670404391e78F4a199f";

    private static final long DEPOSIT_AMOUNT = 50_000L;

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private StringRedisTemplate redis;

    @Autowired
    private ChainJobConfirmationService confirmations;

    /** 확정된 정산 job 을 도메인에 반영하는 자리 — 평소에는 스케줄러가 돈다. */
    @Autowired
    private SettlementConfirmationService settlementConfirmations;

    /**
     * 정산 체인 리더 — 공용 Fake 다. 기본은 {@code IntegrationTestBase} 가 되돌린 "체인 미설정"
     * (available=false = 대사 불가)이고, 배분 주문 ↔ 집계 테스트만 온체인 카운터를 말하게 한다
     * (S15P21B204-172).
     */
    @Autowired
    private FakeSettlementChainReader settlementChainReader;

    // ↓ 체인 워커를 테스트 안에서 조립하기 위한 실물 협력자들. 바꿔 끼우는 것은 노드 하나다.
    @Autowired
    private ChainJobRepository chainJobRepository;

    // 테스트 프로파일은 b204.chain.instance-id 를 두지 않으므로 언제나 "맡는다" 다
    // (= 단일 인스턴스와 같은 동작). 이 테스트들이 재는 것이 그 동작이다.
    @Autowired
    private ChainOwnership chainOwnership;

    @Autowired
    private ChainJobStateWriter stateWriter;

    @Autowired
    private ReceiptVerifier receiptVerifier;

    @Autowired
    private ReceiptEvents receiptEvents;

    @Autowired
    private FeeDelegationService feeDelegationService;

    @Autowired
    private WalletBalanceRefresher balanceRefresher;

    /**
     * 공연 일시를 <b>과거로 옮기는 데만</b> 쓴다. 입장 허용 시간대는 시작 60분 전부터라
     * 미래 공연에서는 열리지 않는다 — 결제까지 마친 뒤 공연을 "당일"로 옮겨야 검표를 이어
     * 붙일 수 있다. (판매 마감은 시작 1분 전이라 그 60분 동안 판매와 입장이 겹친다.)
     */
    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private RefundService refundService;

    /** 동시성·보상 시험은 HTTP 경계를 건너뛰고 서비스·재고를 직접 본다. */
    @Autowired
    private OrderService orderService;

    @Autowired
    private TicketStock ticketStock;

    @Autowired
    private TicketStockReconciler stockReconciler;

    /** 롤백을 <b>진짜로</b> 일으키기 위한 프로그래밍 트랜잭션. */
    @Autowired
    private PlatformTransactionManager transactionManager;

    // ================================================================ 세로축

    @Test
    @DisplayName("공연 생성 → 보증금 → 동의 → 판매 시작 → 주문 → 결제 → 티켓 발급이 한 번에 관통한다")
    void fullVerticalSlice() throws Exception {
        Actor host = signUp(200_000L);
        Actor guestTeam = signUp(0L);
        Actor audience = signUp(100_000L);

        // ── ① API-performance-01: 공연 생성. DRAFT · UNPAID · nextAction=PAY_DEPOSIT.
        OffsetDateTime startAt = OffsetDateTime.now(ZoneOffset.ofHours(9)).plusDays(20)
                .withNano(0);
        JsonNode created = data(post("/api/v1/performances").with(bearer(host.accessToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "hostTeamId", host.teamId,
                                "title", "합정 3밴드 합동공연",
                                "description", "인디록 합동 무대",
                                "venueName", "합정 언플러그드",
                                "venueAddress", "서울 마포구 양화로 000",
                                "startAt", startAt.toString(),
                                "endAt", startAt.plusHours(4).toString(),
                                "jointPerformance", true))),
                201);
        long performanceId = created.get("performanceId").asLong();
        assertThat(created.get("status").asText()).isEqualTo("DRAFT");
        assertThat(created.get("nextAction").asText()).isEqualTo("PAY_DEPOSIT");
        assertThat(created.get("deposit").get("status").asText()).isEqualTo("UNPAID");
        assertThat(created.get("deposit").get("amount").asLong()).isEqualTo(DEPOSIT_AMOUNT);
        assertThat(created.get("deposit").get("sufficient").asBoolean()).isTrue();
        // 판매 마감 = 시작 1분 전, 취소 마감 = D-3 00:00 (서버가 계산한다. 요청 필드가 아니다)
        assertThat(OffsetDateTime.parse(created.get("saleCloseAt").asText()))
                .isEqualTo(startAt.minusMinutes(1).withOffsetSameInstant(ZoneOffset.ofHours(9)));
        assertThat(created.get("cancelDeadlineAt").asText()).endsWith("T00:00:00+09:00");
        assertThat(OffsetDateTime.parse(created.get("cancelDeadlineAt").asText()).toLocalDate())
                .isEqualTo(startAt.toLocalDate().minusDays(3));

        // ── ② API-performance-07·08: 참여팀 초대 → 수락. INVITED/ACCEPTED 는 파생값이다.
        JsonNode invited = data(post("/api/v1/performances/" + performanceId + "/participants")
                        .with(bearer(host.accessToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("teamId", guestTeam.teamId))),
                201);
        assertThat(invited.get("participationStatus").asText()).isEqualTo("INVITED");
        assertThat(invited.get("leaderWalletLinked").asBoolean()).isTrue();

        JsonNode accepted = data(post("/api/v1/performances/" + performanceId + "/participants/"
                + guestTeam.teamId + "/accept").with(bearer(guestTeam.accessToken)));
        assertThat(accepted.get("participationStatus").asText()).isEqualTo("ACCEPTED");
        assertThat(accepted.get("walletAddress").asText())
                .isEqualToIgnoringCase(guestTeam.wallet.address());
        assertThat(accepted.get("nextAction").asText()).isEqualTo("AGREE_RULES");

        // ── ③ API-performance-05: 티켓 옵션(전체 교체). Redis 재고가 함께 깔린다.
        JsonNode options = data(put("/api/v1/performances/" + performanceId + "/ticket-types")
                .with(bearer(host.accessToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("ticketTypes", List.of(
                        Map.of("name", "일반", "price", 25000, "totalQuantity", 80),
                        Map.of("name", "응원", "price", 35000, "totalQuantity", 20))))));
        long generalTypeId = options.get("ticketTypes").get(0).get("ticketTypeId").asLong();
        assertThat(options.get("ticketTypes").get(0).get("remainingQuantity").asInt()).isEqualTo(80);
        assertThat(options.get("ticketTypes").get(0).get("currency").asText()).isEqualTo("KRW");

        // ── ④ API-rule-01: 규칙 설정. 보증금보다 먼저다 — createShow 의 입력이다.
        JsonNode rule = data(put("/api/v1/performances/" + performanceId + "/rules")
                .with(bearer(host.accessToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of(
                        "fixedRatioBp", 6000,
                        "selectionRatioBp", 4000,
                        "teamShares", List.of(
                                Map.of("teamId", host.teamId, "shareBp", 6000),
                                Map.of("teamId", guestTeam.teamId, "shareBp", 4000)),
                        "simulationRevenue", 1_000_000))));
        String rulesHash = rule.get("rulesHash").asText();
        assertThat(rulesHash).matches("^0x[0-9a-f]{64}$");
        assertThat(rule.get("status").asText()).isEqualTo("PENDING_AGREEMENT");
        assertThat(rule.get("depositStatus").asText()).isEqualTo("UNPAID");
        assertThat(rule.get("nextAction").asText()).isEqualTo("COLLECT_AGREEMENTS");
        assertThat(rule.get("simulation").get("dustTeamId").asLong()).isEqualTo(host.teamId);

        // ── ⑤ API-performance-13: 보증금 prepare. §0.4 고정값을 그대로 확인한다.
        JsonNode prepare = data(post("/api/v1/performances/" + performanceId + "/deposit/prepare")
                .with(bearer(host.accessToken)));
        assertThat(prepare.get("depositAmount").asLong()).isEqualTo(DEPOSIT_AMOUNT);
        JsonNode signRequests = prepare.get("signRequests");
        assertThat(signRequests).hasSize(2);
        assertThat(signRequests.get(0).get("kind").asText()).isEqualTo("APPROVE");
        assertThat(signRequests.get(1).get("kind").asText()).isEqualTo("DEPOSIT");
        for (JsonNode signRequest : signRequests) {
            assertThat(signRequest.get("txType").asText())
                    .isEqualTo("FEE_DELEGATED_SMART_CONTRACT_EXECUTION");
            assertThat(signRequest.get("chainId").asText()).isEqualTo("0x3e9");
            assertThat(signRequest.get("value").asText()).isEqualTo("0x0");
            assertThat(signRequest.get("feePayer").asText()).isEqualToIgnoringCase(FEE_PAYER);
        }
        assertThat(signRequests.get(0).get("to").asText()).isEqualToIgnoringCase(YOYO);
        assertThat(signRequests.get(1).get("to").asText()).isEqualToIgnoringCase(SPLITTER);
        // deposit(uint256) selector — 계약 문서 §8
        assertThat(signRequests.get(1).get("data").asText()).startsWith("0xb6b55f25");
        assertThat(OffsetDateTime.parse(prepare.get("expiresAt").asText())).isNotNull();
        // 규칙이 저장돼 있으니 createShow job 이 걸리고, 프론트는 그 확정을 기다린 뒤 서명한다.
        assertThat(prepare.get("prerequisiteJobId").asText()).startsWith("chain_");
        confirmCreateShow(performanceId);

        // ── ⑥ API-performance-14: 서명 RLP 보고 → 202 + jobId. 아직 UNPAID 다.
        String depositRlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(0,
                host.wallet, SPLITTER, signRequests.get(1).get("data").asText());
        JsonNode depositJob = data(post("/api/v1/performances/" + performanceId
                        + "/deposit/signed-tx").with(bearer(host.accessToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("kind", "DEPOSIT", "senderSignedRlp", depositRlp))),
                202);
        assertThat(depositJob.get("jobId").asText()).startsWith("chain_");
        assertThat(depositJob.get("signerType").asText()).isEqualTo("USER");
        assertThat(depositJob.get("feeDelegated").asBoolean()).isTrue();
        assertThat(depositJob.get("nextDepositStatus").asText()).isEqualTo("PAID");

        // 같은 RLP 재보고 = 최초 jobId 재생(§0.4 · 명세 183행). 부작용을 다시 실행하지 않는다.
        JsonNode replayed = data(post("/api/v1/performances/" + performanceId
                        + "/deposit/signed-tx").with(bearer(host.accessToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("kind", "DEPOSIT", "senderSignedRlp", depositRlp))),
                202);
        assertThat(replayed.get("jobId").asText()).isEqualTo(depositJob.get("jobId").asText());

        // ── ⑦ 체인 워커가 할 일을 주입한다: DepositPaid receipt → deposit_status=PAID.
        confirm(depositJob.get("jobId").asText(), SPLITTER, host.wallet.address(), "DepositPaid",
                Map.of("showId", performanceId, "from", host.wallet.address(),
                        "amount", DEPOSIT_AMOUNT));

        // ── ⑧ API-rule-02: 동의 현황. 아직 전원 PENDING 이라 판매 시작이 막혀 있다.
        JsonNode ruleStatus = data(get("/api/v1/performances/" + performanceId + "/rules")
                .with(bearer(host.accessToken)));
        assertThat(ruleStatus.get("locked").asBoolean()).isFalse();
        assertThat(ruleStatus.get("agreements")).hasSize(2);
        assertThat(ruleStatus.get("myAgreement").get("nextAction").asText()).isEqualTo("SIGN");
        assertThat(ruleStatus.get("startSaleAvailable").asBoolean()).isFalse();
        assertThat(ruleStatus.get("startSaleBlockedReason").asText())
                .isEqualTo("RULE_NOT_AGREED_BY_ALL");

        // ── ⑨ API-rule-03·05: 두 팀이 각자 서명하고 보고한다. 동의는 사용자 서명 tx 다.
        agree(host, performanceId, rulesHash, 0);
        agree(guestTeam, performanceId, rulesHash, 0);

        JsonNode agreedStatus = data(get("/api/v1/performances/" + performanceId + "/rules")
                .with(bearer(host.accessToken)));
        assertThat(agreedStatus.get("startSaleAvailable").asBoolean()).isTrue();
        // 전역 non_null 이라 막힌 이유가 없으면 필드째 빠진다.
        assertThat(agreedStatus.hasNonNull("startSaleBlockedReason")).isFalse();

        // ── ⑩ API-rule-04: 판매 시작. createShow 는 보증금 보고 전에 이미 확정됐다.
        // teamIndex 는 createShow job 을 만들 때 굳었다(host = 0).
        JsonNode startSale = data(post("/api/v1/performances/" + performanceId + "/sale/start")
                        .with(bearer(host.accessToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("rulesHash", rulesHash))),
                202);
        assertThat(startSale.hasNonNull("prerequisiteJobId")).isFalse();
        assertThat(startSale.get("signerType").asText()).isEqualTo("OPERATOR");
        assertThat(startSale.get("nextStatus").asText()).isEqualTo("ON_SALE");
        assertThat(startSale.get("splitterAddress").asText()).isEqualToIgnoringCase(SPLITTER);
        assertThat(startSale.get("teamWallets")).hasSize(2);
        assertThat(startSale.get("teamWallets").get(0).get("teamId").asLong())
                .isEqualTo(host.teamId);
        assertThat(startSale.get("teamWallets").get(0).get("teamIndex").asInt()).isZero();
        int guestTeamIndex = startSale.get("teamWallets").get(1).get("teamIndex").asInt();

        confirm(startSale.get("jobId").asText(), SPLITTER, FEE_PAYER, "SaleStarted",
                Map.of("showId", performanceId, "rulesHash", rulesHash));

        // 공개 목록·상세에 이제 노출된다(그 전에는 비관계자에게 404였다).
        JsonNode detail = data(get("/api/v1/performances/" + performanceId));
        assertThat(detail.get("status").asText()).isEqualTo("ON_SALE");
        assertThat(detail.get("purchaseLimitPerMember").asInt()).isEqualTo(4);
        assertThat(detail.get("participants")).hasSize(2);
        assertThat(detail.get("verificationUrl").asText()).endsWith("/verify/" + performanceId);
        // V6 end_at — 생성 요청의 endAt 이 저장돼 그대로 돌아온다.
        // **추정 폴백(시작 +3h, b204.entry.default-duration)과 다른 값이어야** 저장을 증명한다.
        assertThat(OffsetDateTime.parse(detail.get("endAt").asText()))
                .isEqualTo(startAt.plusHours(4));

        // ── ⑪ API-ticket-01: 주문 생성. orderRef·teamIndex 가 온체인 인자가 된다.
        JsonNode order = data(post("/api/v1/orders").with(bearer(audience.accessToken))
                        .header("Idempotency-Key", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "performanceId", performanceId,
                                "items", List.of(Map.of("ticketTypeId", generalTypeId,
                                        "quantity", 2, "chosenTeamId", guestTeam.teamId)),
                                "totalAmount", 50000))),
                201);
        // (v6.2) 한 팀에 몰아 배분했으므로 그룹 크기는 1이고 orderId = orderGroupId 다.
        long orderId = order.get("orderGroupId").asLong();
        assertThat(order.get("orderId").asLong()).isEqualTo(orderId);
        assertThat(order.get("status").asText()).isEqualTo("PENDING_PAYMENT");
        assertThat(order.get("orders")).hasSize(1);
        JsonNode subOrder = order.get("orders").get(0);
        assertThat(subOrder.get("orderId").asLong()).isEqualTo(orderId);
        assertThat(subOrder.get("orderRef").asText()).matches("^0x[0-9a-f]{64}$");
        assertThat(subOrder.get("teamIndex").asInt()).isEqualTo(guestTeamIndex);
        assertThat(order.get("totalAmount").asLong()).isEqualTo(50_000L);
        assertThat(order.get("totalQuantity").asInt()).isEqualTo(2);
        assertThat(order.get("walletBalance").asLong()).isEqualTo(100_000L);
        assertThat(order.get("shortfall").asLong()).isZero();
        String orderRef = subOrder.get("orderRef").asText();

        // 재고가 실제로 빠졌다 — Redis 원자 차감이 초과 판매를 막는 근거다.
        JsonNode afterReserve = data(get("/api/v1/performances/" + performanceId));
        assertThat(afterReserve.get("ticketTypes").get(0).get("remainingQuantity").asInt())
                .isEqualTo(78);

        // ── ⑫ API-payment-01: 결제 시작 — 200 + signRequests(APPROVE + PURCHASE).
        JsonNode payment = data(post("/api/v1/orders/" + orderId + "/payment")
                .with(bearer(audience.accessToken))
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON));
        assertThat(payment.get("orderGroupId").asLong()).isEqualTo(orderId);
        assertThat(payment.get("payments")).hasSize(1);
        assertThat(payment.get("payments").get(0).get("paymentStatus").asText())
                .isEqualTo("AWAITING_SIGNATURE");
        assertThat(payment.get("payments").get(0).get("orderId").asLong()).isEqualTo(orderId);
        assertThat(payment.get("amount").asLong()).isEqualTo(50_000L);
        assertThat(payment.get("walletBalance").asLong()).isEqualTo(100_000L);
        JsonNode paySigns = payment.get("signRequests");
        assertThat(paySigns).hasSize(2);
        assertThat(paySigns.get(0).get("kind").asText()).isEqualTo("APPROVE");
        assertThat(paySigns.get(1).get("kind").asText()).isEqualTo("PURCHASE");
        // purchase(uint256,bytes32,uint8,uint256,uint16) selector — 계약 문서 §8
        assertThat(paySigns.get(1).get("data").asText()).startsWith("0xa01208ea");
        assertThat(paySigns.get(1).get("summary").get("orderRef").asText()).isEqualTo(orderRef);
        String purchaseData = paySigns.get(1).get("data").asText();

        // ── ⑬ API-payment-03: 서명 tx 보고 → 202 + jobId. PAYING 으로만 간다.
        String purchaseRlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(1,
                audience.wallet, SPLITTER, purchaseData);
        JsonNode purchaseJob = data(post("/api/v1/orders/" + orderId + "/payment/signed-tx")
                        .with(bearer(audience.accessToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("kind", "PURCHASE",
                                "senderSignedRlp", purchaseRlp, "orderId", orderId))),
                202);
        assertThat(purchaseJob.get("paymentStatus").asText()).isEqualTo("PAYING");
        assertThat(purchaseJob.get("expectedEvent").asText()).isEqualTo("Purchased");
        assertThat(purchaseJob.get("signerType").asText()).isEqualTo("USER");
        assertThat(purchaseJob.get("feeDelegated").asBoolean()).isTrue();

        // ── ⑭ CONFIRMED 주입: Purchased 이벤트 9항목 검증 → PAID + 티켓 발급.
        ChainJobConfirmationService.Result result = confirm(purchaseJob.get("jobId").asText(),
                SPLITTER, audience.wallet.address(), "Purchased",
                purchasedArgs(performanceId, orderRef, audience.wallet.address(), guestTeamIndex,
                        50_000L, 2L));
        assertThat(result.confirmed()).isTrue();
        assertThat(result.issuedTicketIds()).hasSize(2);

        // ── ⑮ API-payment-02: PAID + ticketIds. A-06으로 곧바로 넘어가는 근거다.
        JsonNode paid = data(get("/api/v1/orders/" + orderId + "/payment")
                .with(bearer(audience.accessToken)));
        assertThat(paid.get("payments").get(0).get("paymentStatus").asText()).isEqualTo("PAID");
        assertThat(paid.get("groupStatus").asText()).isEqualTo("PAID");
        assertThat(paid.get("paidCount").asInt()).isEqualTo(1);
        assertThat(paid.get("totalCount").asInt()).isEqualTo(1);
        assertThat(paid.get("ticketIds")).hasSize(2);
        assertThat(paid.get("payments").get(0).get("purchaseJobId").asText()).isNotBlank();
        assertThat(paid.get("feeDelegated").asBoolean()).isTrue();
        // §0.12 갱신 시점 ② — 발신 지갑 잔액 캐시가 결제액만큼 줄었다.
        assertThat(paid.get("walletBalance").asLong()).isEqualTo(50_000L);

        // ── ⑯ API-ticket-04·05·06: 발급된 티켓과 동적 QR.
        long ticketId = paid.get("ticketIds").get(0).asLong();
        JsonNode tickets = data(get("/api/v1/tickets/me").with(bearer(audience.accessToken)));
        assertThat(tickets.get("items")).hasSize(2);
        assertThat(tickets.get("items").get(0).get("status").asText()).isEqualTo("ISSUED");
        assertThat(tickets.get("items").get(0).get("refundTarget").asText())
                .isEqualTo("WALLET_BALANCE");

        JsonNode ticketDetail = data(get("/api/v1/tickets/" + ticketId)
                .with(bearer(audience.accessToken)));
        assertThat(ticketDetail.get("priceAmount").asLong()).isEqualTo(25_000L);
        assertThat(ticketDetail.get("chosenTeamName").asText())
                .isEqualTo(guestTeam.teamName);
        assertThat(ticketDetail.toString()).doesNotContain("0x"); // 관객 화면에 주소·해시 없음

        JsonNode qr = data(get("/api/v1/tickets/" + ticketId + "/qr")
                .with(bearer(audience.accessToken)));
        assertThat(qr.get("rotateAfterMs").asInt()).isEqualTo(30_000);
        assertThat(qr.get("qrToken").asText()).startsWith(ticketId + ".");
        // 30초 윈도우라 같은 윈도우 안에서는 같은 토큰이 나온다(저장하지 않고 계산한다).
        JsonNode qrAgain = data(get("/api/v1/tickets/" + ticketId + "/qr")
                .with(bearer(audience.accessToken)));
        assertThat(qrAgain.get("qrToken").asText()).isEqualTo(qr.get("qrToken").asText());
        assertThat(OffsetDateTime.parse(qr.get("expiresAt").asText()))
                .isEqualTo(OffsetDateTime.parse(qr.get("issuedAt").asText()).plusSeconds(60));

        // ── ⑰ API-ticket-03: 주문 상세에 결제·티켓이 함께 보인다.
        JsonNode orderDetail = data(get("/api/v1/orders/" + orderId)
                .with(bearer(audience.accessToken)));
        assertThat(orderDetail.get("groupStatus").asText()).isEqualTo("PAID");
        assertThat(orderDetail.get("orders")).hasSize(1);
        assertThat(orderDetail.get("orders").get(0).get("payment").get("status").asText())
                .isEqualTo("PAID");
        assertThat(orderDetail.get("orders").get(0).get("tickets")).hasSize(2);

        // ── ⑱ API-performance-10: 검표 링크. 검표 담당자는 회원이 아니다(SEC-03).
        JsonNode link = data(get("/api/v1/performances/" + performanceId + "/entry-link")
                .with(bearer(host.accessToken)));
        String entryToken = link.get("entryToken").asText();
        assertThat(link.get("entryUrl").asText())
                .isEqualTo("https://b204.ssafy.io/entry/" + performanceId + "?token=" + entryToken);
        assertThat(link.get("rotated").asBoolean()).isFalse();
        // 입장 시간대 = 시작 60분 전 ~ 종료(= 시작 + 기본 공연 길이 3시간, ERD 에 end_at 이 없다).
        assertThat(OffsetDateTime.parse(link.get("entryWindow").get("opensAt").asText()))
                .isEqualTo(startAt.minusHours(1).withOffsetSameInstant(ZoneOffset.ofHours(9)));
        assertThat(OffsetDateTime.parse(link.get("entryWindow").get("closesAt").asText()))
                .isEqualTo(startAt.plusHours(3).withOffsetSameInstant(ZoneOffset.ofHours(9)));
        // 토큰 유효기간 = 입장 종료 + 2시간 [권]
        assertThat(OffsetDateTime.parse(link.get("expiresAt").asText()))
                .isEqualTo(startAt.plusHours(5).withOffsetSameInstant(ZoneOffset.ofHours(9)));
        // 같은 버전이면 몇 번을 조회해도 같은 토큰이다(저장하지 않고 서명한다).
        assertThat(data(get("/api/v1/performances/" + performanceId + "/entry-link")
                .with(bearer(host.accessToken))).get("entryToken").asText()).isEqualTo(entryToken);

        // ── ⑲ API-entry-01: 공연 당일로 옮기고 스캔한다. ISSUED → USED.
        openEntryWindow(performanceId);
        JsonNode admitted = scan(entryToken, performanceId, qr.get("qrToken").asText());
        assertThat(admitted.get("ticketId").asLong()).isEqualTo(ticketId);
        assertThat(admitted.get("status").asText()).isEqualTo("USED");
        assertThat(admitted.get("ticketTypeName").asText()).isEqualTo("일반");
        assertThat(admitted.get("holderNameMasked").asText()).startsWith("T").contains("*");
        assertThat(admitted.get("enteredCount").asInt()).isEqualTo(1);
        assertThat(admitted.get("totalIssuedCount").asInt()).isEqualTo(2);
        assertThat(admitted.get("enteredAt").asText()).isNotBlank();

        // ── ⑳ 같은 QR 재스캔 = 거부. 최초 입장 시각이 msg 에 담긴다(§10 4xx 예시).
        mvc.perform(entryRequest(entryToken, performanceId, qr.get("qrToken").asText()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ENTRY_ALREADY_ENTERED"))
                .andExpect(jsonPath("$.data").doesNotExist())
                .andExpect(jsonPath("$.msg").value(org.hamcrest.Matchers.containsString(
                        "최초 입장 " + OffsetDateTime.parse(admitted.get("enteredAt").asText())
                                .format(DateTimeFormatter.ofPattern("HH:mm")))));

        // ── ㉑ API-entry-02: 성공·실패가 한 목록에 보인다. 실패도 남는 것이 이 화면의 요점이다.
        JsonNode status = data(get("/api/v1/performances/" + performanceId + "/entries")
                .with(bearer(host.accessToken)));
        assertThat(status.get("summary").get("enteredCount").asInt()).isEqualTo(1);
        assertThat(status.get("summary").get("totalIssuedCount").asInt()).isEqualTo(2);
        assertThat(status.get("summary").get("duplicateAttemptCount").asInt()).isEqualTo(1);
        assertThat(status.get("summary").get("expiredQrCount").asInt()).isZero();
        assertThat(status.get("items")).hasSize(2);
        // 최신이 앞이다 — 방금 거부된 중복 시도.
        assertThat(status.get("items").get(0).get("result").asText()).isEqualTo("FAILED");
        assertThat(status.get("items").get(0).get("failureCode").asText())
                .isEqualTo("ENTRY_ALREADY_ENTERED");
        assertThat(status.get("items").get(0).get("scannerSource").asText()).isEqualTo("ENTRY_LINK");
        assertThat(status.get("items").get(1).get("result").asText()).isEqualTo("SUCCESS");
        assertThat(status.get("items").get(1).get("failureCode")).isNull();
        assertThat(status.get("items").get(1).get("ticketId").asLong()).isEqualTo(ticketId);
        assertThat(status.get("pageInfo").get("totalElements").asInt()).isEqualTo(2);

        // 실패만 거르기.
        JsonNode failedOnly = data(get("/api/v1/performances/" + performanceId
                + "/entries?result=FAILED").with(bearer(host.accessToken)));
        assertThat(failedOnly.get("items")).hasSize(1);

        // 티켓은 USED 로 남고 QR 재발급이 막힌다(API-ticket-06 409).
        mvc.perform(get("/api/v1/tickets/" + ticketId + "/qr").with(bearer(audience.accessToken)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TICKET_ALREADY_USED"));
    }

    // ================================================================ 경계

    @Nested
    @DisplayName("§0.4 서명 tx 규약")
    class SignedTx {

        @Test
        @DisplayName("발신자가 등록 지갑과 다르면 대납하지 않고 409 PAYMENT_AMOUNT_MISMATCH 다")
        void rejectsForeignSender() throws Exception {
            Fixture fixture = onSalePerformance();
            long orderId = createOrder(fixture, 1);
            String data = purchaseCalldataOf(fixture, orderId);

            String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(0,
                    TestWallet.random(), SPLITTER, data);
            mvc.perform(post("/api/v1/orders/" + orderId + "/payment/signed-tx")
                            .with(bearer(fixture.audience.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("kind", "PURCHASE", "senderSignedRlp", rlp,
                                    "orderId", orderId))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("PAYMENT_AMOUNT_MISMATCH"))
                    .andExpect(jsonPath("$.data").doesNotExist());
        }

        @Test
        @DisplayName("서명은 남의 것이고 from 만 내 지갑으로 적은 tx 는 409 다 — ecrecover 로 걸러난다")
        void rejectsForgedSenderSignature() throws Exception {
            Fixture fixture = onSalePerformance();
            long orderId = createOrder(fixture, 1);
            String data = purchaseCalldataOf(fixture, orderId);

            // RLP 의 from 은 관객 본인이지만 서명은 다른 키가 했다.
            // 서버가 서명에서 주소를 복구하지 않으면 이 tx 는 그대로 통과한다(§0.4 ③).
            String rlp = KaiaTxBuilder.forgedSender(0, TestWallet.random(),
                    fixture.audience.wallet.address(), SPLITTER, data);
            mvc.perform(post("/api/v1/orders/" + orderId + "/payment/signed-tx")
                            .with(bearer(fixture.audience.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("kind", "PURCHASE", "senderSignedRlp", rlp,
                                    "orderId", orderId))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("PAYMENT_AMOUNT_MISMATCH"));
        }

        @Test
        @DisplayName("to 가 다른 컨트랙트면 409 다 — 서명만 받아 아무 데나 보내지 않는다")
        void rejectsWrongContract() throws Exception {
            Fixture fixture = onSalePerformance();
            long orderId = createOrder(fixture, 1);
            String data = purchaseCalldataOf(fixture, orderId);

            String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(0,
                    fixture.audience.wallet, YOYO, data);
            mvc.perform(post("/api/v1/orders/" + orderId + "/payment/signed-tx")
                            .with(bearer(fixture.audience.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("kind", "PURCHASE", "senderSignedRlp", rlp,
                                    "orderId", orderId))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("PAYMENT_AMOUNT_MISMATCH"));
        }

        @Test
        @DisplayName("RLP 가 아니면 400 COMMON_VALIDATION_FAILED 다")
        void rejectsMalformedRlp() throws Exception {
            Fixture fixture = onSalePerformance();
            long orderId = createOrder(fixture, 1);
            startPayment(fixture, orderId);

            mvc.perform(post("/api/v1/orders/" + orderId + "/payment/signed-tx")
                            .with(bearer(fixture.audience.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("kind", "PURCHASE", "orderId", orderId,
                                    "senderSignedRlp", "0xdeadbeef"))))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("COMMON_VALIDATION_FAILED"));
        }

        @Test
        @DisplayName("abandoned=true 는 실패가 아니다 — 200 + 잔액 그대로")
        void abandonKeepsBalance() throws Exception {
            Fixture fixture = onSalePerformance();
            long orderId = createOrder(fixture, 1);
            startPayment(fixture, orderId);

            JsonNode body = data(post("/api/v1/orders/" + orderId + "/payment/signed-tx")
                    .with(bearer(fixture.audience.accessToken))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("kind", "PURCHASE", "abandoned", true))));
            assertThat(body.get("balanceKept").asBoolean()).isTrue();
            assertThat(body.get("paymentStatus").asText()).isEqualTo("AWAITING_SIGNATURE");
            assertThat(body.get("orderStatus").asText()).isEqualTo("PENDING_PAYMENT");
            assertThat(body.get("orderGroupId").asLong()).isEqualTo(orderId);
        }

        @Test
        @DisplayName("이벤트 인자가 어긋나면 티켓을 발급하지 않고 job 을 FAILED 로 고정한다")
        void mismatchedEventDoesNotIssueTickets() throws Exception {
            Fixture fixture = onSalePerformance();
            long orderId = createOrder(fixture, 1);
            JsonNode payment = startPayment(fixture, orderId);
            String purchaseData = payment.get("signRequests").get(1).get("data").asText();
            String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(9,
                    fixture.audience.wallet, SPLITTER, purchaseData);
            JsonNode job = data(post("/api/v1/orders/" + orderId + "/payment/signed-tx")
                            .with(bearer(fixture.audience.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("kind", "PURCHASE", "senderSignedRlp", rlp,
                                    "orderId", orderId))),
                    202);

            JsonNode order = data(get("/api/v1/orders/" + orderId)
                    .with(bearer(fixture.audience.accessToken)));
            // 금액을 1원 틀리게 넣는다 — 온체인 결제액과 주문이 다른 상황이다.
            ChainJobConfirmationService.Result result = confirm(job.get("jobId").asText(),
                    SPLITTER, fixture.audience.wallet.address(), "Purchased",
                    purchasedArgs(fixture.performanceId, order.get("orders").get(0).get("orderRef").asText(),
                            fixture.audience.wallet.address(), 0, 24_999L, 1L));
            assertThat(result.confirmed()).isFalse();
            assertThat(result.failureReason()).isEqualTo("PAYMENT_AMOUNT_MISMATCH");

            JsonNode after = data(get("/api/v1/orders/" + orderId + "/payment")
                    .with(bearer(fixture.audience.accessToken)));
            assertThat(after.get("payments").get(0).get("paymentStatus").asText()).isEqualTo("FAILED");
            assertThat(after.get("ticketIds")).isEmpty();
            // 주문은 PENDING_PAYMENT 로 남아 사용자가 다시 시도할 수 있다.
            assertThat(after.get("groupStatus").asText()).isEqualTo("PENDING_PAYMENT");
        }
    }

    @Nested
    @DisplayName("§10 검표 — QR 윈도우·원타임·권한")
    class Entry {

        @Test
        @DisplayName("직전 30초 윈도우 QR 은 받고, 그 이전 윈도우는 ENTRY_QR_EXPIRED 다")
        void acceptsPreviousWindowOnly() throws Exception {
            EntryContext ctx = entryReady(2);
            settleInWindow();
            long window = QrTokens.windowOf(Instant.now());

            // 화면이 30초 경계에서 토큰을 갱신하는 순간에도 스캔이 살아 있어야 한다(유효 구간 60초).
            JsonNode admitted = scan(ctx.entryToken, ctx.performanceId,
                    QrTokens.issue(ctx.ticketIds.get(0), qrSecretOf(ctx.ticketIds.get(0)),
                            window - 1));
            assertThat(admitted.get("status").asText()).isEqualTo("USED");

            // 그 이전(= 60초 초과)은 죽는다. 캡처한 QR 이 오래 살지 못하는 근거다.
            String stale = QrTokens.issue(ctx.ticketIds.get(1), qrSecretOf(ctx.ticketIds.get(1)),
                    window - 2);
            mvc.perform(entryRequest(ctx.entryToken, ctx.performanceId, stale))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("ENTRY_QR_EXPIRED"));

            // 만료도 이력에 남는다 — 현장에서 "화면을 새로 고치라"고 안내할 근거다.
            JsonNode entryStatus = data(get("/api/v1/performances/" + ctx.performanceId + "/entries")
                    .with(bearer(ctx.host.accessToken)));
            assertThat(entryStatus.get("summary").get("expiredQrCount").asInt()).isEqualTo(1);
        }

        @Test
        @DisplayName("서명을 한 글자 바꾸면 ENTRY_QR_SIGNATURE_INVALID 이고 이력에 남는다")
        void rejectsForgedSignature() throws Exception {
            EntryContext ctx = entryReady(1);
            String token = qrTokenOf(ctx, ctx.ticketIds.get(0));
            String forged = token.substring(0, token.length() - 1)
                    + (token.endsWith("A") ? "B" : "A");

            mvc.perform(entryRequest(ctx.entryToken, ctx.performanceId, forged))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("ENTRY_QR_SIGNATURE_INVALID"));

            JsonNode entryStatus = data(get("/api/v1/performances/" + ctx.performanceId + "/entries")
                    .with(bearer(ctx.host.accessToken)));
            assertThat(entryStatus.get("items")).hasSize(1);
            assertThat(entryStatus.get("items").get(0).get("failureCode").asText())
                    .isEqualTo("ENTRY_QR_SIGNATURE_INVALID");
            // 위조 시도 뒤에도 티켓은 그대로 ISSUED 다.
            assertThat(entryStatus.get("summary").get("enteredCount").asInt()).isZero();
        }

        @Test
        @DisplayName("형식이 깨진 qrToken 은 400, 없는 티켓을 가리키면 404 다")
        void rejectsMalformedAndUnknown() throws Exception {
            EntryContext ctx = entryReady(1);

            mvc.perform(entryRequest(ctx.entryToken, ctx.performanceId, "not-a-qr-token"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("COMMON_VALIDATION_FAILED"));

            // 형식은 맞지만 없는 티켓 — 서명 대조에 qr_secret 이 필요해 티켓 조회가 먼저다.
            mvc.perform(entryRequest(ctx.entryToken, ctx.performanceId,
                            "999999999." + QrTokens.windowOf(Instant.now()) + ".AAAA"))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("COMMON_NOT_FOUND"));
        }

        @Test
        @DisplayName("입장 시간대 밖(시작 60분 전 이전)은 ENTRY_NOT_IN_TIME_WINDOW 다")
        void rejectsOutsideTimeWindow() throws Exception {
            // openEntryWindow 를 부르지 않는다 — 공연은 20일 뒤다.
            EntryContext ctx = entryReady(1, false);
            mvc.perform(entryRequest(ctx.entryToken, ctx.performanceId,
                            qrTokenOf(ctx, ctx.ticketIds.get(0))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("ENTRY_NOT_IN_TIME_WINDOW"));
        }

        @Test
        @DisplayName("취소된 티켓은 입장시키지 않는다 — TICKET_CANCELED(REL-08)")
        void rejectsCancelledTicket() throws Exception {
            EntryContext ctx = entryReady(1);
            String token = qrTokenOf(ctx, ctx.ticketIds.get(0));
            // 환불 API(§9)는 이 카드 범위 밖이라 상태만 직접 만든다.
            jdbc.update("UPDATE ticket SET status = 'CANCELLED' WHERE ticket_id = ?",
                    ctx.ticketIds.get(0));

            mvc.perform(entryRequest(ctx.entryToken, ctx.performanceId, token))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("TICKET_CANCELED"));
        }

        @Test
        @DisplayName("참여팀 회원은 Authorization 만으로 검표하고, 관객은 403 이다")
        void memberPathIsAllowedForParticipantsOnly() throws Exception {
            EntryContext ctx = entryReady(2);

            JsonNode admitted = data(entryRequest(null, ctx.performanceId,
                    qrTokenOf(ctx, ctx.ticketIds.get(0))).with(bearer(ctx.host.accessToken)));
            assertThat(admitted.get("status").asText()).isEqualTo("USED");

            mvc.perform(entryRequest(null, ctx.performanceId,
                            qrTokenOf(ctx, ctx.ticketIds.get(1)))
                            .with(bearer(ctx.audience.accessToken)))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("ENTRY_SCANNER_NOT_AUTHORIZED"));

            // 회원 경로로 들어온 이력은 출처가 다르게 남는다.
            JsonNode entryStatus = data(get("/api/v1/performances/" + ctx.performanceId + "/entries")
                    .with(bearer(ctx.host.accessToken)));
            assertThat(entryStatus.get("items").get(0).get("scannerSource").asText())
                    .isEqualTo("MEMBER");
        }

        @Test
        @DisplayName("토큰도 세션도 없으면 401, 다른 공연의 토큰이면 403 이다")
        void rejectsMissingAndForeignToken() throws Exception {
            EntryContext ctx = entryReady(1);
            EntryContext other = entryReady(1, false);

            mvc.perform(entryRequest(null, ctx.performanceId,
                            qrTokenOf(ctx, ctx.ticketIds.get(0))))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("COMMON_UNAUTHORIZED"));

            mvc.perform(entryRequest(other.entryToken, ctx.performanceId,
                            qrTokenOf(ctx, ctx.ticketIds.get(0))))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("ENTRY_SCANNER_NOT_AUTHORIZED"));
        }

        @Test
        @DisplayName("rotate=true 는 이전 링크를 즉시 죽인다")
        void rotateInvalidatesPreviousLink() throws Exception {
            EntryContext ctx = entryReady(1);

            JsonNode rotated = data(get("/api/v1/performances/" + ctx.performanceId
                    + "/entry-link?rotate=true").with(bearer(ctx.host.accessToken)));
            assertThat(rotated.get("rotated").asBoolean()).isTrue();
            assertThat(rotated.get("entryToken").asText()).isNotEqualTo(ctx.entryToken);

            mvc.perform(entryRequest(ctx.entryToken, ctx.performanceId,
                            qrTokenOf(ctx, ctx.ticketIds.get(0))))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("ENTRY_SCANNER_NOT_AUTHORIZED"));

            assertThat(data(entryRequest(rotated.get("entryToken").asText(), ctx.performanceId,
                    qrTokenOf(ctx, ctx.ticketIds.get(0)))).get("status").asText())
                    .isEqualTo("USED");
        }

        @Test
        @DisplayName("검표 링크는 참여팀만 보고, 회전은 생성자만 한다")
        void entryLinkAccess() throws Exception {
            EntryContext ctx = entryReady(1, false);

            mvc.perform(get("/api/v1/performances/" + ctx.performanceId + "/entry-link")
                            .with(bearer(ctx.audience.accessToken)))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("COMMON_FORBIDDEN"));

            // 참여팀 리더는 조회는 되지만 회전은 못 한다 — 남의 검표 링크를 죽이면 현장이 멈춘다.
            data(get("/api/v1/performances/" + ctx.performanceId + "/entry-link")
                    .with(bearer(ctx.guestTeam.accessToken)));
            mvc.perform(get("/api/v1/performances/" + ctx.performanceId
                            + "/entry-link?rotate=true").with(bearer(ctx.guestTeam.accessToken)))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("PERFORMANCE_NOT_OWNER"));

            mvc.perform(get("/api/v1/performances/999999999/entry-link")
                            .with(bearer(ctx.host.accessToken)))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("PERFORMANCE_NOT_FOUND"));
        }

        @Test
        @DisplayName("입장 현황 — 허용 밖 result 는 400, 없는 공연은 404 다")
        void entryStatusValidation() throws Exception {
            EntryContext ctx = entryReady(1, false);

            mvc.perform(get("/api/v1/performances/" + ctx.performanceId + "/entries?result=BOGUS")
                            .with(bearer(ctx.host.accessToken)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("COMMON_VALIDATION_FAILED"));

            mvc.perform(get("/api/v1/performances/999999999/entries")
                            .with(bearer(ctx.host.accessToken)))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("PERFORMANCE_NOT_FOUND"));
        }

        @Test
        @DisplayName("한 IP 가 분당 60회를 넘기면 429 다(SEC-10)")
        void rateLimitsPerIp() throws Exception {
            EntryContext ctx = entryReady(1, false);
            String ip = "203.0.113." + (int) (Math.random() * 250 + 1);

            // 고정 창이라 경계를 넘으면 카운터가 리셋된다 — 두 창을 채울 만큼 보낸다.
            boolean throttled = false;
            for (int i = 0; i < 130 && !throttled; i++) {
                throttled = mvc.perform(entryRequest(ctx.entryToken, ctx.performanceId, "x")
                                .with(fromIp(ip)))
                        .andReturn().getResponse().getStatus() == 429;
            }
            assertThat(throttled).isTrue();
        }
    }

    @Nested
    @DisplayName("§6 주문 규칙")
    class Orders {

        @Test
        @DisplayName("지갑 미등록 회원은 주문할 수 없다 — 404 WALLET_NOT_FOUND")
        void requiresWallet() throws Exception {
            Fixture fixture = onSalePerformance();
            String token = signInOnly();
            mvc.perform(post("/api/v1/orders").with(bearer(token))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("performanceId", fixture.performanceId,
                                    "items", List.of(Map.of("ticketTypeId", fixture.ticketTypeId,
                                            "quantity", 1,
                                            "chosenTeamId", fixture.guestTeam.teamId)),
                                    "totalAmount", 25000))))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("WALLET_NOT_FOUND"));
        }

        @Test
        @DisplayName("Idempotency-Key 가 없으면 400 이다(§0.8 필수 대상)")
        void requiresIdempotencyKey() throws Exception {
            Fixture fixture = onSalePerformance();
            mvc.perform(post("/api/v1/orders").with(bearer(fixture.audience.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(orderBody(fixture, 1))))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("COMMON_VALIDATION_FAILED"));
        }

        @Test
        @DisplayName("같은 멱등키 재호출은 최초 주문을 재생하고 재고를 두 번 빼지 않는다")
        void replaysSameIdempotencyKey() throws Exception {
            Fixture fixture = onSalePerformance();
            String key = UUID.randomUUID().toString();
            JsonNode first = data(post("/api/v1/orders").with(bearer(fixture.audience.accessToken))
                            .header("Idempotency-Key", key)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(orderBody(fixture, 1))), 201);
            JsonNode second = data(post("/api/v1/orders").with(bearer(fixture.audience.accessToken))
                            .header("Idempotency-Key", key)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(orderBody(fixture, 1))), 201);
            assertThat(second.get("orderId").asLong()).isEqualTo(first.get("orderId").asLong());

            JsonNode detail = data(get("/api/v1/performances/" + fixture.performanceId));
            assertThat(detail.get("ticketTypes").get(0).get("remainingQuantity").asInt())
                    .isEqualTo(79);
        }

        @Test
        @DisplayName("1인 1공연 4매를 넘기면 409 TICKET_PURCHASE_LIMIT_EXCEEDED 다")
        void enforcesPurchaseLimit() throws Exception {
            Fixture fixture = onSalePerformance();
            createOrder(fixture, 4);
            mvc.perform(post("/api/v1/orders").with(bearer(fixture.audience.accessToken))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(orderBody(fixture, 1))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("TICKET_PURCHASE_LIMIT_EXCEEDED"));
        }

        @Test
        @DisplayName("금액이 서버 계산과 다르면 409 PAYMENT_AMOUNT_MISMATCH 다")
        void rejectsTamperedAmount() throws Exception {
            Fixture fixture = onSalePerformance();
            Map<String, Object> body = new LinkedHashMap<>(orderBody(fixture, 1));
            body.put("totalAmount", 1);
            mvc.perform(post("/api/v1/orders").with(bearer(fixture.audience.accessToken))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(body)))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("PAYMENT_AMOUNT_MISMATCH"));
        }

        @Test
        @DisplayName("참여팀이 아닌 팀을 고르면 400 TICKET_TEAM_CHOICE_INVALID 다")
        void rejectsForeignTeamChoice() throws Exception {
            Fixture fixture = onSalePerformance();
            Actor outsider = signUp(0L);
            Map<String, Object> body = new LinkedHashMap<>(orderBody(fixture, 1));
            // (v6.2) 배분은 items 행마다 한다 — 최상위 chosenTeamId 는 사라졌다.
            body.put("items", List.of(Map.of("ticketTypeId", fixture.ticketTypeId,
                    "quantity", 1, "chosenTeamId", outsider.teamId)));
            mvc.perform(post("/api/v1/orders").with(bearer(fixture.audience.accessToken))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(body)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("TICKET_TEAM_CHOICE_INVALID"));
        }

        // -------------------------------------------- (v6.2) 표별 응원 팀 배분 = 주문 그룹

        @Test
        @DisplayName("표를 두 팀에 나눠 배분하면 하위 주문 2개가 한 그룹으로 묶인다")
        void splitsAllocationIntoSubOrders() throws Exception {
            Fixture fixture = onSalePerformance();
            JsonNode order = data(post("/api/v1/orders")
                            .with(bearer(fixture.audience.accessToken))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("performanceId", fixture.performanceId,
                                    "items", List.of(
                                            Map.of("ticketTypeId", fixture.ticketTypeId,
                                                    "quantity", 1,
                                                    "chosenTeamId", fixture.host.teamId),
                                            Map.of("ticketTypeId", fixture.ticketTypeId,
                                                    "quantity", 1,
                                                    "chosenTeamId", fixture.guestTeam.teamId)),
                                    "totalAmount", 50000))),
                    201);

            long groupId = order.get("orderGroupId").asLong();
            assertThat(order.get("orderId").asLong()).isEqualTo(groupId);
            assertThat(order.get("orders")).hasSize(2);
            assertThat(order.get("totalQuantity").asInt()).isEqualTo(2);
            long firstOrderId = order.get("orders").get(0).get("orderId").asLong();
            long secondOrderId = order.get("orders").get(1).get("orderId").asLong();
            assertThat(firstOrderId).as("대표 주문 = 첫 하위 주문").isEqualTo(groupId);
            assertThat(secondOrderId).isNotEqualTo(firstOrderId);
            // orderRef 는 하위 주문마다 다르다 — purchase tx 가 각각 나간다.
            assertThat(order.get("orders").get(0).get("orderRef").asText())
                    .isNotEqualTo(order.get("orders").get(1).get("orderRef").asText());
            // 재고는 그룹 합으로 한 번에 빠진다.
            assertThat(ticketStock.remaining(fixture.performanceId, fixture.ticketTypeId))
                    .contains(78);
            assertThat(jdbc.queryForObject(
                    "SELECT COUNT(*) FROM ticket_order WHERE order_group_id = ?", Integer.class,
                    groupId)).isEqualTo(2);

            // 결제는 어느 하위 주문으로 시작해도 그룹이고 APPROVE 1 + PURCHASE 2 = 3회 서명이다.
            JsonNode payment = startPayment(fixture, secondOrderId);
            assertThat(payment.get("orderGroupId").asLong()).isEqualTo(groupId);
            assertThat(payment.get("amount").asLong()).isEqualTo(50_000L);
            assertThat(payment.get("payments")).hasSize(2);
            JsonNode signs = payment.get("signRequests");
            assertThat(signs).hasSize(3);
            assertThat(signs.get(0).get("kind").asText()).isEqualTo("APPROVE");
            assertThat(signs.get(0).get("summary").get("amount").asLong()).isEqualTo(50_000L);
            assertThat(signs.get(1).get("summary").get("orderId").asLong())
                    .isEqualTo(firstOrderId);
            assertThat(signs.get(2).get("summary").get("orderId").asLong())
                    .isEqualTo(secondOrderId);

            // 상세는 어느 하위 주문으로 열어도 그룹 전체다.
            JsonNode detail = data(get("/api/v1/orders/" + secondOrderId)
                    .with(bearer(fixture.audience.accessToken)));
            assertThat(detail.get("orderGroupId").asLong()).isEqualTo(groupId);
            assertThat(detail.get("groupStatus").asText()).isEqualTo("PENDING_PAYMENT");
            assertThat(detail.get("orders")).hasSize(2);

            // 목록은 그룹 한 줄 + 팀별 배분이다.
            JsonNode item = data(get("/api/v1/orders/me")
                    .with(bearer(fixture.audience.accessToken))).get("items").get(0);
            assertThat(item.get("orderGroupId").asLong()).isEqualTo(groupId);
            assertThat(item.get("teamBreakdown")).hasSize(2);
            assertThat(item.get("ticketCount").asInt()).isEqualTo(2);
            assertThat(item.get("groupStatus").asText()).isEqualTo("PENDING_PAYMENT");

            // kind=PURCHASE 인데 orderId 가 없으면 어느 하위 주문의 서명인지 알 수 없다 — 400.
            String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(1,
                    fixture.audience.wallet, SPLITTER, signs.get(1).get("data").asText());
            mvc.perform(post("/api/v1/orders/" + groupId + "/payment/signed-tx")
                            .with(bearer(fixture.audience.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("kind", "PURCHASE", "senderSignedRlp", rlp))))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("COMMON_VALIDATION_FAILED"));
        }

        @Test
        @DisplayName("하위 주문 하나만 확정되면 PARTIALLY_PAID 이고 나머지는 다시 시도할 수 있다")
        void partialPaymentKeepsConfirmedSubOrder() throws Exception {
            Fixture fixture = onSalePerformance();
            JsonNode order = data(post("/api/v1/orders")
                            .with(bearer(fixture.audience.accessToken))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("performanceId", fixture.performanceId,
                                    "items", List.of(
                                            Map.of("ticketTypeId", fixture.ticketTypeId,
                                                    "quantity", 1,
                                                    "chosenTeamId", fixture.host.teamId),
                                            Map.of("ticketTypeId", fixture.ticketTypeId,
                                                    "quantity", 1,
                                                    "chosenTeamId", fixture.guestTeam.teamId)),
                                    "totalAmount", 50000))),
                    201);
            long groupId = order.get("orderGroupId").asLong();
            JsonNode target = order.get("orders").get(0);
            long targetId = target.get("orderId").asLong();

            JsonNode payment = startPayment(fixture, groupId);
            String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(1,
                    fixture.audience.wallet, SPLITTER,
                    payment.get("signRequests").get(1).get("data").asText());
            JsonNode job = data(post("/api/v1/orders/" + groupId + "/payment/signed-tx")
                            .with(bearer(fixture.audience.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("kind", "PURCHASE", "senderSignedRlp", rlp,
                                    "orderId", targetId))),
                    202);
            assertThat(job.get("orderId").asLong()).isEqualTo(targetId);
            assertThat(job.get("orderGroupId").asLong()).isEqualTo(groupId);
            // 아직 확정되지 않은 나머지 하위 주문이 하나 남았다.
            assertThat(job.get("pendingOrderIds")).hasSize(1);

            ChainJobConfirmationService.Result result = confirm(job.get("jobId").asText(),
                    SPLITTER, fixture.audience.wallet.address(), "Purchased",
                    purchasedArgs(fixture.performanceId, target.get("orderRef").asText(),
                            fixture.audience.wallet.address(), target.get("teamIndex").asInt(),
                            25_000L, 1L));
            assertThat(result.confirmed()).isTrue();
            assertThat(result.issuedTicketIds()).hasSize(1);

            JsonNode status = data(get("/api/v1/orders/" + groupId + "/payment")
                    .with(bearer(fixture.audience.accessToken)));
            assertThat(status.get("groupStatus").asText()).isEqualTo("PARTIALLY_PAID");
            assertThat(status.get("paidCount").asInt()).isEqualTo(1);
            assertThat(status.get("totalCount").asInt()).isEqualTo(2);
            assertThat(status.get("ticketIds")).hasSize(1);
            assertThat(status.get("amount").asLong()).as("그룹 합계").isEqualTo(50_000L);
            // 남은 하위 주문만 다시 서명하면 된다 — APPROVE 1 + PURCHASE 1.
            assertThat(status.get("signRequests")).hasSize(2);
            assertThat(status.get("signRequests").get(0).get("summary").get("amount").asLong())
                    .isEqualTo(25_000L);

            // payment-01 재호출도 미결제분만 본다(대표 주문이 이미 PAID 여도 막히지 않는다).
            JsonNode retried = startPayment(fixture, groupId);
            assertThat(retried.get("amount").asLong()).isEqualTo(25_000L);
            assertThat(retried.get("payments")).hasSize(1);
            assertThat(retried.get("signRequests")).hasSize(2);
        }
    }

    /**
     * (v6.2) 배분 주문 ↔ 정산 집계·환불 (S15P21B204-172).
     *
     * <p>한 결제가 팀별 하위 주문 N건 = purchase tx N건으로 쪼개진다. 집계와 환불은 orderRef 단위라
     * 설계상 호환이지만, 그것을 고정하는 것이 이 묶음이다.
     *
     * <p><b>온체인 카운터는 테스트가 지어내지 않는다.</b> 서버가 내려준 {@code purchase} calldata 를
     * 디코드해 컨트랙트와 같은 규칙으로 더하고({@code choiceCount[teamIndex] += quantity}), 환불은
     * 첫 환불에서 그 주문의 quantity 를 통째로 뺀다(A-2, {@code RevenueSplitter.refund}). 그 값을
     * 정산 체인 리더(spy)가 돌려준다 — 서버 장부와 체인이 같은 값을 말해야 집계가 확정된다.
     */
    @Nested
    @DisplayName("(v6.2) 배분 주문 ↔ 정산 집계·환불 (S15P21B204-172)")
    class SplitOrderSettlement {

        @Autowired
        private SettlementReconciler reconciler;

        @Autowired
        private WalletRepository walletRepository;

        @Autowired
        private PerformanceRepository performanceRepository;

        @Autowired
        private PerformanceParticipantRepository participantRepository;

        @Autowired
        private SettlementRuleRepository settlementRuleRepository;

        @Autowired
        private SettlementRepository settlementRepository;

        @Autowired
        private RefundRepository refundRepository;

        @Test
        @DisplayName("집계 확정 시 팀별 선택 카운터 = 팀별 Σ 하위 주문 quantity = Σ purchase 인자")
        void aggregateCountsEqualSubOrderQuantities() throws Exception {
            Fixture fixture = onSalePerformance();
            long performanceId = fixture.performanceId;
            int hostIndex = teamIndexOf(performanceId, fixture.host.teamId);
            int guestIndex = teamIndexOf(performanceId, fixture.guestTeam.teamId);
            Ledger chain = new Ledger(2);

            // 한 결제로 host 2장 + guest 1장 — 하위 주문 2개, purchase tx 2건.
            JsonNode split = splitOrder(fixture, 2, 1);
            assertThat(split.get("orders")).hasSize(2);
            assertThat(payGroup(fixture.audience, split.get("orderGroupId").asLong(), chain))
                    .isEqualTo(2);

            // 다른 관객의 단일 팀 주문 — guest 2장. 그룹 크기 1, purchase tx 1건.
            Actor other = signUp(100_000L);
            assertThat(payGroup(other, createOrderAs(other, fixture, 2), chain)).isEqualTo(1);

            // 결제를 시작만 하고 서명하지 않은 채 만료된 주문 — 표도 카운터도 없다(D-83).
            Actor idle = signUp(100_000L);
            long idleOrder = createOrderAs(idle, fixture, 1);
            startPaymentAs(idle, idleOrder);
            expire(idleOrder);
            assertThat(orderService.expireOrder(idleOrder)).isTrue();

            // 체인 목: purchase 인자를 컨트랙트처럼 더한 값.
            assertThat(chain.counts[hostIndex]).isEqualTo(2);
            assertThat(chain.counts[guestIndex]).isEqualTo(3);
            assertThat(chain.escrow).isEqualTo(125_000L);
            // 서버 장부: 결제된 하위 주문의 팀별 Σ quantity 와 정산이 세는 팀별 유효 표가 같다.
            Map<Long, Long> expected = Map.of(fixture.host.teamId, 2L,
                    fixture.guestTeam.teamId, 3L);
            assertThat(paidQuantityByTeam(performanceId)).isEqualTo(expected);
            SettlementReconciler.ServerAggregate server = reconciler.serverAggregate(performanceId);
            assertThat(server.countsByTeamId()).isEqualTo(expected);
            assertThat(server.validTicketCount()).isEqualTo(5);
            assertThat(server.netRevenue()).isEqualTo(chain.escrow);

            // 집계 확정 — 대사가 통과하고(202) 확정 반영이 팀별 카운터를 저장한다.
            endPerformance(performanceId);
            stubChain(chain);
            JsonNode aggregated = data(post("/api/v1/performances/" + performanceId
                    + "/settlement/aggregate").with(bearer(fixture.host.accessToken)), 202);
            assertThat(aggregated.get("validTicketCount").asInt()).isEqualTo(5);
            assertThat(jdbc.queryForObject("SELECT counter_match FROM settlement "
                    + "WHERE performance_id = ?", Boolean.class, performanceId)).isTrue();

            markConfirmed(aggregated.get("jobId").asText());
            settlementConfirmations.applyConfirmedJobs();

            assertThat(jdbc.queryForObject("SELECT status FROM settlement WHERE performance_id = ?",
                    String.class, performanceId)).isEqualTo("AGGREGATED");
            assertThat(jdbc.queryForObject("SELECT total_choice_count FROM settlement "
                    + "WHERE performance_id = ?", Integer.class, performanceId)).isEqualTo(5);
            assertThat(shareChoiceCounts(performanceId)).isEqualTo(expected);
        }

        @Test
        @DisplayName("하위 주문 하나에서 1장 환불 → 그 orderRef 로 refund, 그 하위 주문 표만 빠진다(A-2)")
        void partialRefundTouchesOnlyItsSubOrder() throws Exception {
            Fixture fixture = onSalePerformance();
            long performanceId = fixture.performanceId;
            int hostIndex = teamIndexOf(performanceId, fixture.host.teamId);
            int guestIndex = teamIndexOf(performanceId, fixture.guestTeam.teamId);
            Ledger chain = new Ledger(2);

            JsonNode split = splitOrder(fixture, 2, 1);
            payGroup(fixture.audience, split.get("orderGroupId").asLong(), chain);
            JsonNode hostSub = subOrderOf(split, hostIndex);
            JsonNode guestSub = subOrderOf(split, guestIndex);
            long hostSubId = hostSub.get("orderId").asLong();
            long guestSubId = guestSub.get("orderId").asLong();
            String hostRef = hostSub.get("orderRef").asText();
            assertThat(reconciler.serverAggregate(performanceId).countsByTeamId())
                    .isEqualTo(Map.of(fixture.host.teamId, 2L, fixture.guestTeam.teamId, 1L));

            // host 하위 주문의 표 1장을 취소한다.
            List<Long> hostTickets = ticketIdsOf(hostSubId);
            assertThat(hostTickets).hasSize(2);
            JsonNode accepted = data(post("/api/v1/tickets/" + hostTickets.get(0) + "/cancel")
                            .with(bearer(fixture.audience.accessToken))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("expectedRefundAmount", 25_000L,
                                    "reason", "일정 변경"))), 202);
            String refundJobId = accepted.get("jobId").asText();

            // 체인 호출 인자 — 운영자 tx 빌더가 실제로 싣는 refund(showId, orderRef, refundAmount).
            List<Type> call = refundCallOf(refundJobId);
            assertThat(call.get(0).getValue()).isEqualTo(BigInteger.valueOf(performanceId));
            assertThat(Numeric.toHexString((byte[]) call.get(1).getValue())).isEqualTo(hostRef);
            assertThat(call.get(2).getValue()).isEqualTo(BigInteger.valueOf(25_000L));

            // 확정 — 컨트랙트는 첫 환불에서 그 주문의 quantity 를 통째로 뺀다(Refunded.quantity).
            long counterDelta = chain.refund(hostRef, 25_000L);
            assertThat(counterDelta).isEqualTo(2);
            Map<String, Object> refunded = new LinkedHashMap<>();
            refunded.put("showId", performanceId);
            refunded.put("orderRef", hostRef);
            refunded.put("buyer", fixture.audience.wallet.address());
            refunded.put("refundAmount", 25_000L);
            refunded.put("quantity", counterDelta);
            assertThat(confirm(refundJobId, SPLITTER, FEE_PAYER, "Refunded", refunded).confirmed())
                    .isTrue();

            // host: 취소한 표만 CANCELLED, 주문은 PAID 로 남지만 표는 전량 빠진다(A-2).
            assertThat(ticketStatusesOf(hostSubId)).containsExactly("CANCELLED", "ISSUED");
            assertThat(orderStatusOf(hostSubId)).isEqualTo("PAID");
            // guest 하위 주문은 아무것도 바뀌지 않는다 — 환불 행도 없다.
            assertThat(ticketStatusesOf(guestSubId)).containsExactly("ISSUED");
            assertThat(orderStatusOf(guestSubId)).isEqualTo("PAID");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM refund WHERE ticket_order_id = ?",
                    Integer.class, guestSubId)).isZero();

            // 서버 장부와 체인 카운터가 같은 값을 말한다: host 2 → 0, guest 1 그대로.
            assertThat(chain.counts[hostIndex]).isZero();
            assertThat(chain.counts[guestIndex]).isEqualTo(1);
            SettlementReconciler.ServerAggregate server = reconciler.serverAggregate(performanceId);
            assertThat(server.countsByTeamId()).isEqualTo(Map.of(fixture.guestTeam.teamId, 1L));
            assertThat(server.netRevenue()).isEqualTo(chain.escrow).isEqualTo(50_000L);

            // 집계 대사가 그 결과를 그대로 통과시킨다.
            endPerformance(performanceId);
            stubChain(chain);
            JsonNode aggregated = data(post("/api/v1/performances/" + performanceId
                    + "/settlement/aggregate").with(bearer(fixture.host.accessToken)), 202);
            assertThat(aggregated.get("validTicketCount").asInt()).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT counter_match FROM settlement "
                    + "WHERE performance_id = ?", Boolean.class, performanceId)).isTrue();
        }

        // ------------------------------------------------------------ 보조

        /** 컨트랙트 {@code choiceCount}·{@code escrow}·{@code purchases} 를 흉내 내는 장부. */
        private static final class Ledger {
            final long[] counts;
            long escrow;
            private final Map<String, long[]> purchases = new LinkedHashMap<>();

            Ledger(int teams) {
                counts = new long[teams];
            }

            void purchase(String orderRef, int teamIndex, long amount, long quantity) {
                counts[teamIndex] += quantity;
                escrow += amount;
                purchases.put(orderRef, new long[]{teamIndex, quantity, 0});
            }

            /** @return {@code Refunded.quantity} — 첫 환불이면 주문 quantity, 이후는 0 */
            long refund(String orderRef, long amount) {
                long[] p = purchases.get(orderRef);
                long delta = p[2] == 0 ? p[1] : 0;
                p[2] += amount;
                escrow -= amount;
                counts[(int) p[0]] -= delta;
                return delta;
            }
        }

        private JsonNode splitOrder(Fixture fixture, int hostQuantity, int guestQuantity)
                throws Exception {
            return data(post("/api/v1/orders").with(bearer(fixture.audience.accessToken))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("performanceId", fixture.performanceId,
                                    "items", List.of(
                                            Map.of("ticketTypeId", fixture.ticketTypeId,
                                                    "quantity", hostQuantity,
                                                    "chosenTeamId", fixture.host.teamId),
                                            Map.of("ticketTypeId", fixture.ticketTypeId,
                                                    "quantity", guestQuantity,
                                                    "chosenTeamId", fixture.guestTeam.teamId)),
                                    "totalAmount", 25_000L * (hostQuantity + guestQuantity)))),
                    201);
        }

        /**
         * 그룹 결제 → 하위 주문마다 PURCHASE 서명 보고 → {@code Purchased} 확정.
         *
         * <p>이벤트 인자는 서버가 내려준 calldata 를 디코드한 값이다 — 체인이 실제로 받을 인자다.
         *
         * @return 보낸 purchase tx 수
         */
        private int payGroup(Actor actor, long orderId, Ledger chain) throws Exception {
            JsonNode signs = startPaymentAs(actor, orderId).get("signRequests");
            assertThat(signs.get(0).get("kind").asText()).isEqualTo("APPROVE");
            for (int i = 1; i < signs.size(); i++) {
                JsonNode sign = signs.get(i);
                assertThat(sign.get("kind").asText()).isEqualTo("PURCHASE");
                String data = sign.get("data").asText();
                // purchase(uint256 showId, bytes32 orderRef, uint8 teamIndex, uint256 amount, uint16 quantity)
                List<Type> args = FunctionReturnDecoder.decode(data.substring(10),
                        Utils.convert(List.of(new TypeReference<Uint256>() {},
                                new TypeReference<Bytes32>() {}, new TypeReference<Uint8>() {},
                                new TypeReference<Uint256>() {}, new TypeReference<Uint16>() {})));
                long showId = ((BigInteger) args.get(0).getValue()).longValue();
                String orderRef = Numeric.toHexString((byte[]) args.get(1).getValue());
                int teamIndex = ((BigInteger) args.get(2).getValue()).intValue();
                long amount = ((BigInteger) args.get(3).getValue()).longValue();
                long quantity = ((BigInteger) args.get(4).getValue()).longValue();
                long subOrderId = sign.get("summary").get("orderId").asLong();

                String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(i, actor.wallet,
                        SPLITTER, data);
                JsonNode job = data(post("/api/v1/orders/" + orderId + "/payment/signed-tx")
                                .with(bearer(actor.accessToken))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(json(Map.of("kind", "PURCHASE", "senderSignedRlp", rlp,
                                        "orderId", subOrderId))),
                        202);
                ChainJobConfirmationService.Result result = confirm(job.get("jobId").asText(),
                        SPLITTER, actor.wallet.address(), "Purchased",
                        purchasedArgs(showId, orderRef, actor.wallet.address(), teamIndex, amount,
                                quantity));
                assertThat(result.confirmed()).isTrue();
                assertThat(result.issuedTicketIds()).hasSize((int) quantity);
                chain.purchase(orderRef, teamIndex, amount, quantity);
            }
            return signs.size() - 1;
        }

        /** 정산 체인 리더가 장부 값을 말하게 한다. payout 은 컨트랙트와 같은 계산기로 만든다. */
        private void stubChain(Ledger chain) {
            long[] payouts = new SettlementCalculator()
                    .calculate(chain.escrow, 6000, 4000, new int[]{5000, 5000}, chain.counts, 0)
                    .shares().stream().mapToLong(SettlementCalculator.Share::totalAmount)
                    .toArray();
            settlementChainReader.available = true;
            settlementChainReader.counts = chain.counts.clone();
            settlementChainReader.escrow = chain.escrow;
            settlementChainReader.payouts = payouts;
            settlementChainReader.deposit = null;
        }

        /**
         * 워커가 REFUND job 을 보낼 때 만드는 calldata 를 디코드한다. 바꿔 끼운 것은 노드와
         * 운영 키뿐이고 인자는 실제 DB(refund · ticket_order)에서 온다.
         */
        @SuppressWarnings("unchecked")
        private List<Type> refundCallOf(String jobId) throws Exception {
            KaiaChainClient node = mock(KaiaChainClient.class);
            given(node.pendingNonce(anyString())).willReturn(BigInteger.ZERO);
            given(node.gasPrice()).willReturn(BigInteger.valueOf(25_000_000_000L));
            ObjectProvider<KaiaCredentials> operator = mock(ObjectProvider.class);
            given(operator.getIfAvailable())
                    .willReturn(KaiaCredentials.create(Keys.createEcKeyPair()));
            ContractOperatorTxBuilder builder = new ContractOperatorTxBuilder(node,
                    new com.ssafy.b204.common.config.ChainProperties(null, 1001L, null, null,
                            FEE_PAYER,
                            new com.ssafy.b204.common.config.ChainProperties.Contract(YOYO,
                                    SPLITTER)),
                    walletRepository, performanceRepository, participantRepository,
                    settlementRuleRepository, settlementRepository, refundRepository,
                    operator, operator);
            long chainJobId = ChainJobIds.parseJobId(jobId).orElseThrow();
            String signed = new TransactionTemplate(transactionManager).execute(status ->
                    builder.buildSignedTx(chainJobRepository.findById(chainJobId).orElseThrow()));
            String data = Numeric.prependHexPrefix(TransactionDecoder.decode(signed).getData());
            assertThat(data.substring(0, 10))
                    .isEqualTo(Hash.sha3String("refund(uint256,bytes32,uint256)").substring(0, 10));
            return FunctionReturnDecoder.decode(data.substring(10),
                    Utils.convert(List.of(new TypeReference<Uint256>() {},
                            new TypeReference<Bytes32>() {}, new TypeReference<Uint256>() {})));
        }

        private void markConfirmed(String jobId) {
            long chainJobId = ChainJobIds.parseJobId(jobId).orElseThrow();
            ChainJob job = chainJobRepository.findById(chainJobId).orElseThrow();
            job.markConfirmed(fakeTxHash(chainJobId), 1);
            chainJobRepository.save(job);
        }

        private void endPerformance(long performanceId) {
            jdbc.update("UPDATE performance SET status = 'ENDED' WHERE performance_id = ?",
                    performanceId);
        }

        private void expire(long orderId) {
            jdbc.update("UPDATE ticket_order SET payment_expires_at = ? WHERE ticket_order_id = ?",
                    LocalDateTime.now(com.ssafy.b204.common.support.TimeSupport.STORAGE_ZONE)
                            .minusMinutes(1)
                            .format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")),
                    orderId);
        }

        private int teamIndexOf(long performanceId, long teamId) {
            return jdbc.queryForObject("SELECT on_chain_index FROM performance_participant "
                    + "WHERE performance_id = ? AND team_id = ?", Integer.class, performanceId,
                    teamId);
        }

        private JsonNode subOrderOf(JsonNode group, int teamIndex) {
            for (JsonNode sub : group.get("orders")) {
                if (sub.get("teamIndex").asInt() == teamIndex) {
                    return sub;
                }
            }
            throw new IllegalStateException("teamIndex=" + teamIndex + " 하위 주문이 없다");
        }

        private Map<Long, Long> paidQuantityByTeam(long performanceId) {
            Map<Long, Long> result = new LinkedHashMap<>();
            jdbc.query("SELECT selected_team_id, SUM(total_quantity) FROM ticket_order "
                            + "WHERE performance_id = ? AND status = 'PAID' GROUP BY selected_team_id",
                    rs -> {
                        result.put(rs.getLong(1), rs.getLong(2));
                    }, performanceId);
            return result;
        }

        private Map<Long, Long> shareChoiceCounts(long performanceId) {
            Map<Long, Long> result = new LinkedHashMap<>();
            jdbc.query("SELECT ss.team_id, ss.choice_count FROM settlement_share ss "
                            + "JOIN settlement s ON s.settlement_id = ss.settlement_id "
                            + "WHERE s.performance_id = ?",
                    rs -> {
                        result.put(rs.getLong(1), rs.getLong(2));
                    }, performanceId);
            return result;
        }

        private List<Long> ticketIdsOf(long orderId) {
            return jdbc.queryForList("SELECT ticket_id FROM ticket WHERE ticket_order_id = ? "
                    + "ORDER BY ticket_id", Long.class, orderId);
        }

        private List<String> ticketStatusesOf(long orderId) {
            return jdbc.queryForList("SELECT status FROM ticket WHERE ticket_order_id = ? "
                    + "ORDER BY ticket_id", String.class, orderId);
        }

        private String orderStatusOf(long orderId) {
            return jdbc.queryForObject("SELECT status FROM ticket_order WHERE ticket_order_id = ?",
                    String.class, orderId);
        }
    }

    @Nested
    @DisplayName("§7 결제 선행 조건")
    class PaymentGuards {

        @Test
        @DisplayName("잔액이 모자라면 409 COMMON_CONFLICT 이고 부족액은 msg 에만 담긴다")
        void insufficientBalance() throws Exception {
            Fixture fixture = onSalePerformance();
            long orderId = createOrder(fixture, 2);
            // 결제 직전에 잔액이 줄어든 상황을 만든다.
            putBalance(fixture.audience.walletId, 10_000L);

            mvc.perform(post("/api/v1/orders/" + orderId + "/payment")
                            .with(bearer(fixture.audience.accessToken))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("COMMON_CONFLICT"))
                    .andExpect(jsonPath("$.data").doesNotExist())
                    .andExpect(jsonPath("$.msg").value(
                            org.hamcrest.Matchers.containsString("Insufficient balance")));
        }

        @Test
        @DisplayName("남의 주문 결제는 404 다 — 존재 자체를 알리지 않는다")
        void hidesForeignOrder() throws Exception {
            Fixture fixture = onSalePerformance();
            long orderId = createOrder(fixture, 1);
            Actor stranger = signUp(100_000L);
            mvc.perform(post("/api/v1/orders/" + orderId + "/payment")
                            .with(bearer(stranger.accessToken))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("COMMON_NOT_FOUND"));
        }
    }

    @Nested
    @DisplayName("§5 규칙 잠금")
    class Rules {

        /**
         * {@code createShow} 확정 뒤에는 참여팀을 바꿀 수 없다(S15P21B204-67 · MR !71 리뷰).
         *
         * <p>온체인 {@code teamWallets} 배열은 {@code updateRules}로도 고칠 수 없다
         * (문서 13 §4.8). 확정 뒤에 팀이 늘면 그 팀은 {@code teamIndex}를 받을 자리가 없고
         * 규칙만 그 팀에 몫을 배분해 DB 와 체인이 영구히 갈린다.
         */
        @Test
        @DisplayName("createShow 확정 뒤 참여팀 초대·수락은 409 다 — teamWallets 를 고칠 방법이 없다")
        void participantsAreLockedAfterCreateShowConfirmed() throws Exception {
            Actor host = signUp(200_000L);
            Actor guestTeam = signUp(0L);
            Actor lateTeam = signUp(0L);
            long performanceId = createPerformance(host, true);
            data(post("/api/v1/performances/" + performanceId + "/participants")
                    .with(bearer(host.accessToken)).contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("teamId", guestTeam.teamId))), 201);
            data(post("/api/v1/performances/" + performanceId + "/participants/"
                    + guestTeam.teamId + "/accept").with(bearer(guestTeam.accessToken)));
            setTicketTypes(host, performanceId);
            setRules(host, performanceId, List.of(host.teamId, guestTeam.teamId));
            // 보증금 prepare 가 createShow job 을 건다. 확정까지 시키면 구성이 잠긴다.
            data(post("/api/v1/performances/" + performanceId + "/deposit/prepare")
                    .with(bearer(host.accessToken)));
            confirmCreateShow(performanceId);

            mvc.perform(post("/api/v1/performances/" + performanceId + "/participants")
                            .with(bearer(host.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("teamId", lateTeam.teamId))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("PERFORMANCE_INVALID_STATUS"));
        }

        /**
         * 보증금보다 규칙이 먼저다 — 온체인 순서가 그렇게만 성립한다(2026-09-09 · S15P21B204-67).
         *
         * <p>{@code deposit(showId)}은 컨트랙트에 공연이 등록된 뒤에만 동작하고
         * ({@code createShow} 선행), {@code createShow}는 {@code rulesHash == 0}을
         * {@code ZeroRulesHash}로 거절한다. 옛 [v4] 순서(보증금 → 규칙)를 그대로 두면
         * 규칙 ← 보증금 ← createShow ← 규칙의 원이 되어 0층이 통째로 막힌다.
         *
         * <p>"판매 전에 보증금을 받는다"는 의도는 아래 {@link #startSaleStillRequiresDeposit()}이
         * 지킨다 — 옮긴 것은 시점뿐이고 없앤 것이 아니다.
         */
        @Test
        @DisplayName("보증금 미납이어도 규칙은 설정할 수 있다 — 규칙이 createShow 의 입력이다")
        void rulesComeBeforeDeposit() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            setTicketTypes(host, performanceId);

            mvc.perform(put("/api/v1/performances/" + performanceId + "/rules")
                            .with(bearer(host.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("fixedRatioBp", 10000, "selectionRatioBp", 0,
                                    "teamShares", List.of(Map.of("teamId", host.teamId,
                                            "shareBp", 10000))))))
                    .andExpect(status().isOk());
        }

        /**
         * 규칙 없는 보증금 prepare 는 서명을 내주지 않는다(2026-09-17 dev 공연 6 · S15P21B204-89).
         *
         * <p>종전에는 {@code createShow} 를 만들 수 없는데도 {@code prerequisiteJobId=null} 과 서명
         * 2건을 내려, 프론트가 "선행 없음"으로 읽고 서명한 {@code deposit} 이 전부
         * {@code ShowNotFound} 로 revert 했다.
         */
        @Test
        @DisplayName("규칙이 없으면 보증금 prepare 는 409 PERFORMANCE_RULES_REQUIRED 다 — chain_job 을 만들지 않는다")
        void depositPrepareRequiresRules() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            setTicketTypes(host, performanceId);

            mvc.perform(post("/api/v1/performances/" + performanceId + "/deposit/prepare")
                            .with(bearer(host.accessToken)))
                    .andExpect(status().isConflict())
                    // COMMON_CONFLICT 였다면 "이미 낸 보증금"·"잔액 부족"과 구분되지 않는다
                    // (S15P21B204-151). 화면이 규칙 저장으로 보내야 하는 유일한 원인이다.
                    .andExpect(jsonPath("$.code").value("PERFORMANCE_RULES_REQUIRED"))
                    .andExpect(jsonPath("$.data").doesNotExist());

            assertThat(jdbc.queryForObject("SELECT count(*) FROM chain_job WHERE target_performance_id = ?",
                    Integer.class, performanceId)).isZero();
        }

        /**
         * 잔액 부족은 규칙 미저장과 다른 코드다(S15P21B204-151). 둘 다 409 인데 화면이 할 일이
         * 다르다 — 이쪽은 안내만이고 규칙 저장 화면으로 보내면 안 된다. 부족액은 코드로 옮길 수
         * 없어 {@code msg} 에 그대로 남는다.
         */
        @Test
        @DisplayName("잔액이 모자라면 보증금 prepare 는 409 WALLET_BALANCE_INSUFFICIENT 이고 부족액은 msg 에 남는다")
        void depositPrepareRequiresBalance() throws Exception {
            Actor host = signUp(1_000L);
            long performanceId = createPerformance(host, false);
            setTicketTypes(host, performanceId);
            setRules(host, performanceId, List.of(host.teamId), 10000, 0);

            mvc.perform(post("/api/v1/performances/" + performanceId + "/deposit/prepare")
                            .with(bearer(host.accessToken)))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("WALLET_BALANCE_INSUFFICIENT"))
                    .andExpect(jsonPath("$.data").doesNotExist())
                    .andExpect(jsonPath("$.msg").value(
                            org.hamcrest.Matchers.containsString("Insufficient balance")));

            // 잔액 게이트는 createShow 앞이다 - 막혔으면 온체인에 흔적이 없다.
            assertThat(jdbc.queryForObject("SELECT count(*) FROM chain_job WHERE target_performance_id = ?",
                    Integer.class, performanceId)).isZero();
        }

        /**
         * D-63(리허설 2). 공동 공연인데 참여팀이 1팀이면 종전에는 규칙·보증금·동의를 전부 통과하고
         * <b>판매 시작</b>에서야 {@code TEAM_MIN_COUNT_NOT_MET} 이 났다. 그 시점엔 보증금 50,000 이
         * 이미 온체인에 있어 되돌릴 수 없다. 판정을 보증금 prepare 로 당긴다.
         *
         * <p>판정은 {@code PerformanceService.jointTeamCountUnmet} 한 곳이므로 판매 시작과 같은
         * 답이 나온다 — 두 API 가 같은 공연을 다르게 말하지 않는다.
         */
        @Test
        @DisplayName("D-63 — 공동 공연 1팀은 보증금 prepare 에서 막힌다(409, chain_job 없음)")
        void jointPerformanceWithOneTeamBlockedAtDepositPrepare() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, true);
            setTicketTypes(host, performanceId);
            setRules(host, performanceId, List.of(host.teamId), 10000, 0);

            mvc.perform(post("/api/v1/performances/" + performanceId + "/deposit/prepare")
                            .with(bearer(host.accessToken)))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("TEAM_MIN_COUNT_NOT_MET"))
                    .andExpect(jsonPath("$.data").doesNotExist());

            // 보증금 서명을 내주지 않았으면 createShow job 도 걸지 않는다 — 온체인에 흔적이 없다.
            assertThat(jdbc.queryForObject(
                    "SELECT count(*) FROM chain_job WHERE target_performance_id = ?",
                    Integer.class, performanceId)).isZero();
        }

        @Test
        @DisplayName("D-63 — 공동 공연 2팀은 보증금 prepare 가 그대로 통과한다")
        void jointPerformanceWithTwoTeamsPassesDepositPrepare() throws Exception {
            Actor host = signUp(200_000L);
            Actor guestTeam = signUp(0L);
            long performanceId = createPerformance(host, true);
            data(post("/api/v1/performances/" + performanceId + "/participants")
                    .with(bearer(host.accessToken)).contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("teamId", guestTeam.teamId))), 201);
            data(post("/api/v1/performances/" + performanceId + "/participants/"
                    + guestTeam.teamId + "/accept").with(bearer(guestTeam.accessToken)));
            setTicketTypes(host, performanceId);
            setRules(host, performanceId, List.of(host.teamId, guestTeam.teamId));

            JsonNode prepare = data(post("/api/v1/performances/" + performanceId + "/deposit/prepare")
                    .with(bearer(host.accessToken)));

            assertThat(prepare.get("prerequisiteJobId").asText()).startsWith("chain_");
            assertThat(prepare.get("signRequests")).hasSize(2);
        }

        /** 단독 공연은 1팀이 정상이다 — 새 가드가 여기까지 오면 0층이 통째로 막힌다. */
        @Test
        @DisplayName("D-63 — 단독 공연 1팀은 영향 없다")
        void soloPerformanceWithOneTeamPassesDepositPrepare() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            setTicketTypes(host, performanceId);
            setRules(host, performanceId, List.of(host.teamId), 10000, 0);

            JsonNode prepare = data(post("/api/v1/performances/" + performanceId + "/deposit/prepare")
                    .with(bearer(host.accessToken)));

            assertThat(prepare.get("prerequisiteJobId").asText()).startsWith("chain_");
        }

        /**
         * 규칙이 없으면 보증금 tx 보고도 {@code PERFORMANCE_RULES_REQUIRED} 다(S15P21B204-151).
         *
         * <p>이 게이트의 판정은 {@code isCreated}(= {@code createShow} 가 {@code CONFIRMED} 인가)
         * 하나뿐이라, 규칙이 없어 job 이 생길 수조차 없는 경우까지 "등록이 끝난 뒤에"로 답했다.
         * 화면이 할 일이 다르다 — 이쪽만 규칙 저장으로 보내야 한다. {@code prepare} 와 <b>같은
         * 코드</b>여야 프론트 분기가 한 벌로 끝난다.
         *
         * <p>정상 흐름은 {@code prepare} 가 먼저 409 로 막으므로 여기까지 오지 않는다. 방어
         * 게이트이고, 방어선이 틀린 안내를 하면 진단이 어긋나서 고친다. {@code prepare} 를
         * 건너뛴 직접 호출로 그 자리를 재현한다.
         */
        @Test
        @DisplayName("규칙이 없으면 보증금 tx 보고는 409 PERFORMANCE_RULES_REQUIRED 다")
        void depositSignedTxRequiresRules() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            setTicketTypes(host, performanceId);
            // 규칙을 저장하지 않는다 - prepare 도 부르지 않는다(그쪽이 먼저 막는 자리다).
            String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(0, host.wallet, SPLITTER,
                    ContractCalls.deposit(performanceId));

            mvc.perform(post("/api/v1/performances/" + performanceId + "/deposit/signed-tx")
                            .with(bearer(host.accessToken)).contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("kind", "DEPOSIT", "senderSignedRlp", rlp))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("PERFORMANCE_RULES_REQUIRED"));

            assertThat(jdbc.queryForObject("SELECT count(*) FROM chain_job WHERE target_performance_id = ?",
                    Integer.class, performanceId)).isZero();
        }

        /**
         * 규칙은 있는데 {@code prepare} 를 부른 적이 없으면 404 다(명세 2430·2466행).
         *
         * <p>명세가 요구하는 "{@code prepare} 발의 기록 존재 확인"이다. 그 기록은
         * {@code prepare} 가 {@code REQUIRES_NEW} 로 커밋하는 {@code CREATE_SHOW} job 행이고,
         * 그것이 없다는 것은 <b>순서를 건너뛰었다</b>는 뜻이다. 종전에는 아래 409("등록이 끝나지
         * 않았습니다 · 다시 시작해 주세요")가 받았는데, 그 문구는 진행 중이라는 뜻이라 시작한
         * 적조차 없는 이 상황을 잘못 말한다.
         *
         * <p>규칙 저장까지만 하고 {@code prepare} 를 건너뛴다 — 규칙이 없으면 위 테스트의
         * {@code PERFORMANCE_RULES_REQUIRED} 가 <b>먼저</b> 받기 때문이다(그쪽이 더 구체적인
         * 안내다).
         */
        @Test
        @DisplayName("prepare 를 건너뛴 보증금 tx 보고는 404 COMMON_NOT_FOUND 다 — 발의 기록이 없다")
        void depositSignedTxRequiresPrepareRecord() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            setTicketTypes(host, performanceId);
            setRules(host, performanceId, List.of(host.teamId), 10000, 0);
            // prepare 를 부르지 않는다 - 그래서 CREATE_SHOW job 이 없다.
            String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(0, host.wallet, SPLITTER,
                    ContractCalls.deposit(performanceId));

            mvc.perform(post("/api/v1/performances/" + performanceId + "/deposit/signed-tx")
                            .with(bearer(host.accessToken)).contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("kind", "DEPOSIT", "senderSignedRlp", rlp))))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("COMMON_NOT_FOUND"));

            assertThat(jdbc.queryForObject("SELECT count(*) FROM chain_job WHERE target_performance_id = ?",
                    Integer.class, performanceId)).isZero();
        }

        /**
         * 온체인 공연이 없으면 브로드캐스트해도 revert 하고 대납 가스만 탄다 — 받지 않는다.
         *
         * <p>규칙도 있고 {@code prepare} 도 불렀고 {@code createShow} 만 아직 확정 전인 경우다 —
         * 앞 두 게이트(409 {@code PERFORMANCE_RULES_REQUIRED} · 404 {@code COMMON_NOT_FOUND})를
         * 모두 지난 <b>세 번째</b> 자리를 겨냥한다. 그래서 {@code prepare} 호출이 이 테스트의
         * 준비 단계에서 뺄 수 없는 부분이고, {@code prerequisiteJobId} 단언이 발의 기록이
         * 실제로 생겼음을 고정한다. 사용자가 규칙 화면으로 갈 이유가 없어
         * {@code COMMON_CONFLICT} 그대로다.
         */
        @Test
        @DisplayName("createShow 확정 전 보증금 tx 보고는 409 COMMON_CONFLICT 다 — 브로드캐스트하지 않고 job 도 없다")
        void depositSignedTxRequiresShowCreated() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            setTicketTypes(host, performanceId);
            setRules(host, performanceId, List.of(host.teamId), 10000, 0);
            JsonNode prepare = data(post("/api/v1/performances/" + performanceId + "/deposit/prepare")
                    .with(bearer(host.accessToken)));
            assertThat(prepare.get("prerequisiteJobId").asText()).startsWith("chain_");
            String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(0, host.wallet, SPLITTER,
                    prepare.get("signRequests").get(1).get("data").asText());

            mvc.perform(post("/api/v1/performances/" + performanceId + "/deposit/signed-tx")
                            .with(bearer(host.accessToken)).contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("kind", "DEPOSIT", "senderSignedRlp", rlp))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("COMMON_CONFLICT"));

            assertThat(jdbc.queryForObject("SELECT count(*) FROM chain_job WHERE target_performance_id = ?"
                    + " AND tx_type IN ('APPROVE', 'DEPOSIT')", Integer.class, performanceId)).isZero();
        }

        /**
         * <b>기대값이 바뀐 테스트다(S15P21B204-70).</b> 종전에는 {@code createShow} 확정 뒤
         * 규칙 재저장을 409 로 막았다 — DB 해시만 바뀌고 온체인은 옛 해시로 남아 되돌릴 수단이
         * 없었기 때문이다(MR !77). 이제 복구 수단이 생겼다: 저장은 통과시키고
         * {@code updateRules} 를 온체인에 보낸다. <b>막는 것에서 같이 바꾸는 것으로</b> 옮긴
         * 것이지 가드를 걷은 것이 아니다 — 전송 중 구간은 아래 테스트가 그대로 지킨다.
         */
        @Test
        @DisplayName("createShow 확정 뒤 규칙을 바꾸면 UPDATE_RULES 를 온체인에 보낸다 — 200")
        void ruleChangeAfterShowCreatedSendsUpdateRules() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            setTicketTypes(host, performanceId);
            setRules(host, performanceId, List.of(host.teamId), 10000, 0);

            // createShow job 은 보증금 준비에서 걸리고, 확정되면 온체인에 규칙이 박힌다.
            data(post("/api/v1/performances/" + performanceId + "/deposit/prepare")
                    .with(bearer(host.accessToken)));
            confirmCreateShow(performanceId);

            String changed = setRules(host, performanceId, List.of(host.teamId), 6000, 4000);

            assertThat(updateRulesJobCount(performanceId)).isEqualTo(1);
            assertThat(latestUpdateRulesKey(performanceId))
                    .isEqualTo("updateRules:" + performanceId + ":" + changed + ":1");
        }

        @Test
        @DisplayName("같은 규칙을 두 번 저장해도 UPDATE_RULES 는 하나다 — 멱등키에 해시가 들어 있다")
        void sameRuleChangeSavedTwiceSendsOneUpdateRules() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            setTicketTypes(host, performanceId);
            setRules(host, performanceId, List.of(host.teamId), 10000, 0);
            data(post("/api/v1/performances/" + performanceId + "/deposit/prepare")
                    .with(bearer(host.accessToken)));
            confirmCreateShow(performanceId);

            setRules(host, performanceId, List.of(host.teamId), 6000, 4000);
            setRules(host, performanceId, List.of(host.teamId), 6000, 4000);

            assertThat(updateRulesJobCount(performanceId)).isEqualTo(1);
        }

        @Test
        @DisplayName("같은 규칙을 동시에 두 번 저장해도 둘 다 200 이고 UPDATE_RULES 는 하나다 — S15P21B204-77")
        void sameRuleChangeSavedConcurrentlySendsOneUpdateRules() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            setTicketTypes(host, performanceId);
            setRules(host, performanceId, List.of(host.teamId), 10000, 0);
            data(post("/api/v1/performances/" + performanceId + "/deposit/prepare")
                    .with(bearer(host.accessToken)));
            confirmCreateShow(performanceId);

            // 락이 없으면 둘이 같은 latest(null)를 읽어 같은 키 ...:1 을 만들고 뒤엣것이 500 이다.
            CountDownLatch start = new CountDownLatch(1);
            Callable<String> save = () -> {
                start.await();
                return setRules(host, performanceId, List.of(host.teamId), 6000, 4000);
            };
            ExecutorService pool = Executors.newFixedThreadPool(2);
            List<String> hashes;
            try {
                Future<String> a = pool.submit(save);
                Future<String> b = pool.submit(save);
                start.countDown();
                hashes = List.of(a.get(30, TimeUnit.SECONDS), b.get(30, TimeUnit.SECONDS));
            } finally {
                pool.shutdownNow();
            }

            assertThat(hashes.get(0)).isEqualTo(hashes.get(1));
            assertThat(updateRulesJobCount(performanceId)).isEqualTo(1);
            assertThat(latestUpdateRulesKey(performanceId))
                    .isEqualTo("updateRules:" + performanceId + ":" + hashes.get(0) + ":1");
            assertThat(jdbc.queryForObject("SELECT rules_hash FROM settlement_rule"
                    + " WHERE performance_id = ?", String.class, performanceId))
                    .isEqualToIgnoringCase(hashes.get(0));
        }

        @Test
        @DisplayName("다른 규칙으로 또 바꾸면 새 UPDATE_RULES 다 — 전송이 각각 필요하다")
        void anotherRuleChangeSendsAnotherUpdateRules() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            setTicketTypes(host, performanceId);
            setRules(host, performanceId, List.of(host.teamId), 10000, 0);
            data(post("/api/v1/performances/" + performanceId + "/deposit/prepare")
                    .with(bearer(host.accessToken)));
            confirmCreateShow(performanceId);

            setRules(host, performanceId, List.of(host.teamId), 6000, 4000);
            setRules(host, performanceId, List.of(host.teamId), 5000, 5000);

            assertThat(updateRulesJobCount(performanceId)).isEqualTo(2);
        }

        @Test
        @DisplayName("RulesUpdated 의 해시가 서버 해시와 같으면 확정된다")
        void updateRulesConfirmsOnMatchingHash() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            String rulesHash = ruleChangeSent(host, performanceId);

            assertThat(confirmUpdateRules(performanceId, rulesHash).confirmed()).isTrue();
            assertThat(updateRulesJobStatus(performanceId)).isEqualTo("CONFIRMED");
        }

        /**
         * 대조를 건너뛰면 <b>우리가 모르는 규칙</b>이 온체인에 박힌 채 확정된다 — 그 뒤 참여팀의
         * {@code agreeToRules} 는 전부 {@code RulesHashMismatch} 로 revert 한다.
         */
        @Test
        @DisplayName("RulesUpdated 의 해시가 다르면 확정하지 않는다 — RULE_HASH_MISMATCH")
        void updateRulesFailsOnHashMismatch() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            ruleChangeSent(host, performanceId);

            ChainJobConfirmationService.Result result = confirmUpdateRules(performanceId,
                    "0x" + "ab".repeat(32));

            assertThat(result.confirmed()).isFalse();
            assertThat(result.failureReason()).isEqualTo("RULE_HASH_MISMATCH");
            assertThat(updateRulesJobStatus(performanceId)).isEqualTo("FAILED");
        }

        @Test
        @DisplayName("UPDATE_RULES 전송 중에는 규칙 동의를 준비할 수 없다 — 409 RULE_SYNC_IN_PROGRESS")
        void agreePrepareBlockedWhileUpdateRulesInFlight() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            String rulesHash = ruleChangeSent(host, performanceId);

            // 서버 해시는 맞다. 그래도 막는다 - 온체인은 아직 옛 해시라 이 서명은 revert 한다.
            mvc.perform(post("/api/v1/performances/" + performanceId
                            + "/rules/agreements/prepare").with(bearer(host.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("teamId", host.teamId,
                                    "rulesHash", rulesHash))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("RULE_SYNC_IN_PROGRESS"));
        }

        @Test
        @DisplayName("UPDATE_RULES 전송 중에는 판매를 시작할 수 없다 — 409 RULE_SYNC_IN_PROGRESS")
        void startSaleBlockedWhileUpdateRulesInFlight() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            String rulesHash = ruleChangeSent(host, performanceId);

            mvc.perform(post("/api/v1/performances/" + performanceId + "/sale/start")
                            .with(bearer(host.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("rulesHash", rulesHash))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("RULE_SYNC_IN_PROGRESS"));
        }

        /**
         * <b>멱등키의 존재로 판정하면 여기서 무너진다</b>(리뷰 !80 🔴 1). A → B → A → B 에서
         * 마지막 B 는 첫 B 의 키를 만나 "이미 보냈다"로 조기 return 하고, 온체인은 A · DB 는 B 인
         * 채 <b>몇 번을 저장해도 같은 키라 복구가 영영 안 된다</b>. 판정은 "마지막 job 이 무엇을
         * 겨냥했는가"여야 한다.
         */
        @Test
        @DisplayName("A→B→A→B 로 되돌려도 매번 새 UPDATE_RULES 다 — 전송 이력이 아니라 현재 상태로 판정한다")
        void revertingToAnEarlierRuleStillSends() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            setTicketTypes(host, performanceId);
            String ruleA = setRules(host, performanceId, List.of(host.teamId), 10000, 0);
            data(post("/api/v1/performances/" + performanceId + "/deposit/prepare")
                    .with(bearer(host.accessToken)));
            confirmCreateShow(performanceId);

            setRules(host, performanceId, List.of(host.teamId), 6000, 4000);   // A -> B
            String backToA = setRules(host, performanceId, List.of(host.teamId), 10000, 0);
            String backToB = setRules(host, performanceId, List.of(host.teamId), 6000, 4000);
            assertThat(backToA).isEqualTo(ruleA);

            assertThat(updateRulesJobCount(performanceId)).isEqualTo(3);
            // 마지막 job 이 겨냥한 것은 B 다 - 이것이 없으면 온체인은 A 에 머문다.
            assertThat(latestUpdateRulesKey(performanceId)).contains(backToB);
        }

        /**
         * job 이 revert 로 실패하면 DB 는 새 해시 · 온체인은 옛 해시다. 종전 판정
         * ({@code PENDING}·{@code SUBMITTED} 만)은 이 구간을 열어 뒀고, 그 사이 받은 동의는
         * {@code agreeToRules} 에서 전부 {@code RulesHashMismatch} 로 revert 하며 가스만 태운다
         * (리뷰 !80 🔴 2).
         */
        @Test
        @DisplayName("UPDATE_RULES 가 실패한 뒤에도 동의 준비·판매 시작이 막힌다 — 갈린 상태 전체를 막는다")
        void agreeAndStartSaleBlockedWhileUpdateRulesFailed() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            String rulesHash = ruleChangeSent(host, performanceId);
            jdbc.update("UPDATE chain_job SET status = 'FAILED', failure_reason = 'CHAIN_TX_REVERTED'"
                    + " WHERE tx_type = 'UPDATE_RULES' AND target_performance_id = ?", performanceId);

            mvc.perform(post("/api/v1/performances/" + performanceId
                            + "/rules/agreements/prepare").with(bearer(host.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("teamId", host.teamId,
                                    "rulesHash", rulesHash))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("RULE_SYNC_IN_PROGRESS"));
            mvc.perform(post("/api/v1/performances/" + performanceId + "/sale/start")
                            .with(bearer(host.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("rulesHash", rulesHash))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("RULE_SYNC_IN_PROGRESS"));
        }

        @Test
        @DisplayName("실패한 뒤 같은 규칙을 다시 저장하면 새 UPDATE_RULES 를 건다 — 복구 경로가 있다")
        void resavingAfterFailureSendsAgain() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            ruleChangeSent(host, performanceId);
            jdbc.update("UPDATE chain_job SET status = 'FAILED' WHERE tx_type = 'UPDATE_RULES'"
                    + " AND target_performance_id = ?", performanceId);

            setRules(host, performanceId, List.of(host.teamId), 6000, 4000);

            assertThat(updateRulesJobCount(performanceId)).isEqualTo(2);
        }

        /**
         * <b>서버 동의를 되돌렸으면 온체인 {@code rulesEpoch} 도 올려야 한다</b>(2차 리뷰 🔴).
         *
         * <p>전원 동의 뒤 저장 버튼을 한 번 더 누르면 {@code ensureAgreements} 가 서버 동의를
         * 전부 {@code PENDING} 으로 되돌린다. 그때 해시가 같다고 job 을 걸지 않으면 온체인
         * epoch 는 그대로라, 팀들이 다시 동의하려 해도 컨트랙트가 {@code AlreadyAgreed} 로
         * revert 한다({@code RevenueSplitter.sol:560}). DB 는 영영 {@code PENDING} 이고 판매
         * 시작이 {@code RULE_NOT_AGREED_BY_ALL} 로 <b>영구히 막힌다</b> — A→B→A 로 우회하는 것
         * 말고 복구가 없다.
         */
        @Test
        @DisplayName("전원 동의 뒤 같은 규칙을 재저장하면 UPDATE_RULES 를 보낸다 — 서버만 리셋하면 판매가 영구히 막힌다")
        void resavingSameRuleAfterAgreementSendsUpdateRules() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            setTicketTypes(host, performanceId);
            String rulesHash = setRules(host, performanceId, List.of(host.teamId), 10000, 0);
            payDeposit(host, performanceId);
            agree(host, performanceId, rulesHash, 0);

            // 저장 버튼 재클릭 - 내용은 그대로다.
            String same = setRules(host, performanceId, List.of(host.teamId), 10000, 0);
            assertThat(same).isEqualTo(rulesHash);
            assertThat(agreementStatus(performanceId, host.teamId)).isEqualTo("PENDING");

            assertThat(updateRulesJobCount(performanceId)).isEqualTo(1);
            assertThat(confirmUpdateRules(performanceId, same).confirmed()).isTrue();

            // 확정 뒤에는 다시 동의받아 판매를 시작할 수 있다 - epoch 가 올라 AlreadyAgreed 가 아니다.
            agree(host, performanceId, same, 1);
            JsonNode startSale = data(post("/api/v1/performances/" + performanceId + "/sale/start")
                            .with(bearer(host.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("rulesHash", same))),
                    202);
            assertThat(startSale.hasNonNull("jobId")).isTrue();
        }

        /**
         * <b>rule-05 도 rule-03 과 같은 sync 판정을 본다</b>(S15P21B204-94).
         *
         * <p>전원 동의 뒤 같은 규칙을 재저장하면 서버 동의는 {@code PENDING} 이고 해시는 그대로다.
         * {@code UPDATE_RULES} 확정 전에 미리 서명해 둔 RLP 가 들어오면 검증을 통과해 대납 전송되고
         * 온체인에서 {@code AlreadyAgreed} 로 revert 한다 - 가스만 타고 FAILED job 이 남는다.
         */
        @Test
        @DisplayName("UPDATE_RULES 창에 미리 서명한 동의 tx 를 보고하면 409 RULE_SYNC_IN_PROGRESS 다 — job 을 만들지 않는다")
        void agreeSignedTxBlockedWhileUpdateRulesInFlight() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            setTicketTypes(host, performanceId);
            String rulesHash = setRules(host, performanceId, List.of(host.teamId), 10000, 0);
            payDeposit(host, performanceId);
            agree(host, performanceId, rulesHash, 0);
            setRules(host, performanceId, List.of(host.teamId), 10000, 0);
            assertThat(agreementStatus(performanceId, host.teamId)).isEqualTo("PENDING");

            Integer jobsBefore = jdbc.queryForObject("SELECT count(*) FROM chain_job",
                    Integer.class);
            String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(1, host.wallet,
                    SPLITTER, ContractCalls.agreeToRules(performanceId, rulesHash));
            mvc.perform(post("/api/v1/performances/" + performanceId
                            + "/rules/agreements/signed-tx").with(bearer(host.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("teamId", host.teamId,
                                    "senderSignedRlp", rlp))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("RULE_SYNC_IN_PROGRESS"));
            assertThat(jdbc.queryForObject("SELECT count(*) FROM chain_job", Integer.class))
                    .isEqualTo(jobsBefore);
            assertThat(agreementStatus(performanceId, host.teamId)).isEqualTo("PENDING");
        }

        /**
         * 해시가 바뀐 경로. 바뀐 규칙으로 서명한 RLP 는 서버 해시와 맞아 검증을 통과하지만
         * 온체인은 아직 옛 해시라 {@code RulesHashMismatch} 로 revert 한다 - 판정 순서가 바뀌어도
         * 이 케이스가 잡는다.
         */
        @Test
        @DisplayName("규칙 변경의 UPDATE_RULES 확정 전에 새 해시로 서명한 동의 tx 도 409 RULE_SYNC_IN_PROGRESS 다")
        void agreeSignedTxWithChangedHashBlockedWhileUpdateRulesInFlight() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            String changed = ruleChangeSent(host, performanceId);

            Integer jobsBefore = jdbc.queryForObject("SELECT count(*) FROM chain_job",
                    Integer.class);
            String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(0, host.wallet,
                    SPLITTER, ContractCalls.agreeToRules(performanceId, changed));
            mvc.perform(post("/api/v1/performances/" + performanceId
                            + "/rules/agreements/signed-tx").with(bearer(host.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("teamId", host.teamId,
                                    "senderSignedRlp", rlp))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("RULE_SYNC_IN_PROGRESS"));
            assertThat(jdbc.queryForObject("SELECT count(*) FROM chain_job", Integer.class))
                    .isEqualTo(jobsBefore);
        }

        /**
         * <b>{@code startSale} 전송 창에서는 저장 자체를 막는다</b>(3차 리뷰 🔴).
         *
         * <p>job 이 떠 있는 동안 공연은 아직 {@code PENDING_AGREEMENT} 고 규칙도 잠기지 않아,
         * 앞의 가드가 전부 통과한다. 그대로 두면 워커가 옛 해시로 잠그고
         * {@code confirmStartSale} 이 <b>현재 DB 해시</b>와 대조해 성공한 tx 를 {@code FAILED} 로
         * 적는다 — 공연이 영영 {@code ON_SALE} 이 되지 않는다.
         */
        @Test
        @DisplayName("판매 시작이 전송 중이면 규칙 저장을 막는다 — 옛 해시로 잠기면 되돌릴 수 없다")
        void savingRulesWhileStartSaleInFlightIsRejected() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            setTicketTypes(host, performanceId);
            String rulesHash = setRules(host, performanceId, List.of(host.teamId), 10000, 0);
            payDeposit(host, performanceId);
            agree(host, performanceId, rulesHash, 0);
            data(post("/api/v1/performances/" + performanceId + "/sale/start")
                    .with(bearer(host.accessToken)).contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("rulesHash", rulesHash))), 202);

            // 내용을 바꾸는 저장도, 같은 규칙 재저장도 둘 다 막는다 - 재저장은 서버 동의를
            // 되돌리는데 온체인은 전원 동의한 채로 잠긴다.
            for (int[] ratio : List.of(new int[] {5000, 5000}, new int[] {10000, 0})) {
                mvc.perform(put("/api/v1/performances/" + performanceId + "/rules")
                                .with(bearer(host.accessToken))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(json(Map.of("fixedRatioBp", ratio[0],
                                        "selectionRatioBp", ratio[1], "teamShares",
                                        List.of(Map.of("teamId", host.teamId,
                                                "shareBp", 10000))))))
                        .andExpect(status().isConflict())
                        .andExpect(jsonPath("$.code").value("RULE_SYNC_IN_PROGRESS"));
            }
            assertThat(updateRulesJobCount(performanceId)).isZero();
            assertThat(agreementStatus(performanceId, host.teamId)).isEqualTo("AGREED");

            // 실패하면 다시 열린다 - 새 규칙을 저장하고 판매 시작을 재요청할 수 있다.
            jdbc.update("UPDATE chain_job SET status = 'FAILED' WHERE tx_type = 'START_SALE'"
                    + " AND target_performance_id = ?", performanceId);
            String retry = setRules(host, performanceId, List.of(host.teamId), 5000, 5000);
            confirmUpdateRules(performanceId, retry);
            agree(host, performanceId, retry, 1);
            JsonNode again = data(post("/api/v1/performances/" + performanceId + "/sale/start")
                    .with(bearer(host.accessToken)).contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("rulesHash", retry))), 202);
            // 죽은 job 을 돌려주면 프론트가 무한 폴링한다.
            assertThat(jdbc.queryForObject("SELECT status FROM chain_job WHERE chain_job_id = ?",
                    String.class, ChainJobIds.parseJobId(again.get("jobId").asText()).orElseThrow()))
                    .isEqualTo("PENDING");
        }

        @Test
        @DisplayName("아무도 동의하지 않은 상태의 같은 규칙 재저장은 보내지 않는다 — 되돌린 동의가 없다")
        void resavingSameRuleWithoutAgreementsSendsNothing() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            setTicketTypes(host, performanceId);
            setRules(host, performanceId, List.of(host.teamId), 10000, 0);
            payDeposit(host, performanceId);

            setRules(host, performanceId, List.of(host.teamId), 10000, 0);

            assertThat(updateRulesJobCount(performanceId)).isZero();
        }

        /**
         * 확정 대조를 <b>현재 DB 해시</b>로 하면 여기서 성공한 tx 가 {@code FAILED} 로 기록된다 —
         * 체인은 우리가 보낸 그 해시를 박았는데 서버가 나중 해시를 들이대는 것이라, 틀린 쪽은
         * 체인이 아니라 대조다(리뷰 !80 🔴 3). 겨냥한 해시는 멱등키에 실려 있다.
         */
        @Test
        @DisplayName("전송 뒤 규칙이 또 바뀌어도 먼저 보낸 job 은 성공으로 확정된다")
        void earlierJobConfirmsAgainstItsOwnTargetHash() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            String sent = ruleChangeSent(host, performanceId);
            Long firstJobId = jdbc.queryForObject(
                    "SELECT chain_job_id FROM chain_job WHERE tx_type = 'UPDATE_RULES'"
                            + " AND target_performance_id = ?", Long.class, performanceId);

            // 먼저 보낸 tx 가 확정되기 전에 규칙이 또 저장됐다.
            String later = setRules(host, performanceId, List.of(host.teamId), 5000, 5000);
            assertThat(later).isNotEqualTo(sent);

            ChainJobConfirmationService.Result result =
                    confirmations.confirm(firstJobId, updateRulesReceipt(firstJobId, performanceId,
                            sent));

            assertThat(result.confirmed()).isTrue();
            assertThat(jdbc.queryForObject("SELECT status FROM chain_job WHERE chain_job_id = ?",
                    String.class, firstJobId)).isEqualTo("CONFIRMED");
        }

        /** 보증금까지 낸 공연에서 규칙을 한 번 바꿔 {@code UPDATE_RULES} 를 걸어 둔다. */
        private String ruleChangeSent(Actor host, long performanceId) throws Exception {
            setTicketTypes(host, performanceId);
            setRules(host, performanceId, List.of(host.teamId), 10000, 0);
            payDeposit(host, performanceId);
            String changed = setRules(host, performanceId, List.of(host.teamId), 6000, 4000);
            assertThat(updateRulesJobCount(performanceId)).isEqualTo(1);
            return changed;
        }

        /** {@code updateRules} 확정 — 컨트랙트는 두 이벤트를 함께 낸다(판본 증가 = 동의 리셋). */
        private ChainJobConfirmationService.Result confirmUpdateRules(long performanceId,
                                                                      String rulesHash) {
            Long chainJobId = jdbc.queryForObject(
                    "SELECT chain_job_id FROM chain_job WHERE tx_type = 'UPDATE_RULES'"
                            + " AND target_performance_id = ? ORDER BY chain_job_id LIMIT 1",
                    Long.class, performanceId);
            return confirmations.confirm(chainJobId,
                    updateRulesReceipt(chainJobId, performanceId, rulesHash));
        }

        private TxReceipt updateRulesReceipt(long chainJobId, long performanceId,
                                             String rulesHash) {
            return new TxReceipt(fakeTxHash(chainJobId), true, SPLITTER, FEE_PAYER, 1L, List.of(
                    new TxReceipt.TxEvent("RulesUpdated",
                            Map.of("showId", performanceId, "rulesHash", rulesHash,
                                    "fixedRatioBp", 6000L, "selectionRatioBp", 4000L)),
                    new TxReceipt.TxEvent("AgreementsReset", Map.of("showId", performanceId))));
        }

        private String latestUpdateRulesKey(long performanceId) {
            return jdbc.queryForObject(
                    "SELECT idempotency_key FROM chain_job WHERE tx_type = 'UPDATE_RULES'"
                            + " AND target_performance_id = ? ORDER BY chain_job_id DESC LIMIT 1",
                    String.class, performanceId);
        }

        private String agreementStatus(long performanceId, long teamId) {
            return jdbc.queryForObject("SELECT status FROM rule_agreement"
                    + " WHERE performance_id = ? AND team_id = ?", String.class,
                    performanceId, teamId);
        }

        private int updateRulesJobCount(long performanceId) {
            Integer count = jdbc.queryForObject(
                    "SELECT count(*) FROM chain_job WHERE tx_type = 'UPDATE_RULES'"
                            + " AND target_performance_id = ?", Integer.class, performanceId);
            return count == null ? 0 : count;
        }

        private String updateRulesJobStatus(long performanceId) {
            return jdbc.queryForObject(
                    "SELECT status FROM chain_job WHERE tx_type = 'UPDATE_RULES'"
                            + " AND target_performance_id = ? ORDER BY chain_job_id DESC LIMIT 1",
                    String.class, performanceId);
        }

        /**
         * 확정만 보면 <b>전송 중 구간이 열린다</b> — 워커가 tx 를 보낸 뒤 확정 전에 규칙을
         * 바꾸면 온체인엔 옛 해시가 박히고 되돌릴 수 없다(리뷰 지적 2026-09-10, 컨설턴트·오민근).
         *
         * <p><b>{@code updateRules} 가 붙은 뒤에도 이 구간은 그대로 409 다</b>(S15P21B204-70).
         * 아직 온체인에 없는 공연은 {@code updateRules} 로 고칠 수 없고({@code showExists} 로
         * revert 한다), 무엇이 박힐지도 모른다.
         */
        @Test
        @DisplayName("createShow 가 전송 중(SUBMITTED)이어도 규칙을 바꿀 수 없다 — 409")
        void rulesFrozenWhileShowCreationInFlight() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            setTicketTypes(host, performanceId);
            setRules(host, performanceId, List.of(host.teamId), 10000, 0);

            data(post("/api/v1/performances/" + performanceId + "/deposit/prepare")
                    .with(bearer(host.accessToken)));
            // 워커가 보냈지만 아직 확정되지 않은 상태.
            jdbc.update("UPDATE chain_job SET status = 'SUBMITTED' WHERE idempotency_key = ?",
                    "createShow:" + performanceId);

            mvc.perform(put("/api/v1/performances/" + performanceId + "/rules")
                            .with(bearer(host.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("fixedRatioBp", 6000, "selectionRatioBp", 4000,
                                    "teamShares", List.of(Map.of("teamId", host.teamId,
                                            "shareBp", 10000))))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("RULE_SYNC_IN_PROGRESS"));
        }

        @Test
        @DisplayName("createShow 가 실패한 뒤에는 규칙을 다시 바꿀 수 있다 — 재시도가 새 규칙을 읽는다")
        void rulesEditableAfterShowCreationFailed() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            setTicketTypes(host, performanceId);
            setRules(host, performanceId, List.of(host.teamId), 10000, 0);

            data(post("/api/v1/performances/" + performanceId + "/deposit/prepare")
                    .with(bearer(host.accessToken)));
            jdbc.update("UPDATE chain_job SET status = 'FAILED' WHERE idempotency_key = ?",
                    "createShow:" + performanceId);

            mvc.perform(put("/api/v1/performances/" + performanceId + "/rules")
                            .with(bearer(host.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("fixedRatioBp", 6000, "selectionRatioBp", 4000,
                                    "teamShares", List.of(Map.of("teamId", host.teamId,
                                            "shareBp", 10000))))))
                    .andExpect(status().isOk());
        }

        @Test
        @DisplayName("createShow 확정 뒤에도 같은 규칙 재저장은 통과한다 — 온체인과 갈리지 않는다")
        void sameRulesStillAcceptedAfterShowCreated() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            setTicketTypes(host, performanceId);
            setRules(host, performanceId, List.of(host.teamId), 10000, 0);

            data(post("/api/v1/performances/" + performanceId + "/deposit/prepare")
                    .with(bearer(host.accessToken)));
            confirmCreateShow(performanceId);

            mvc.perform(put("/api/v1/performances/" + performanceId + "/rules")
                            .with(bearer(host.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("fixedRatioBp", 10000, "selectionRatioBp", 0,
                                    "teamShares", List.of(Map.of("teamId", host.teamId,
                                            "shareBp", 10000))))))
                    .andExpect(status().isOk());
        }

        @Test
        @DisplayName("보증금 미납이면 판매를 시작할 수 없다 — 409")
        void startSaleStillRequiresDeposit() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            setTicketTypes(host, performanceId);

            JsonNode rule = data(put("/api/v1/performances/" + performanceId + "/rules")
                    .with(bearer(host.accessToken))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("fixedRatioBp", 10000, "selectionRatioBp", 0,
                            "teamShares", List.of(Map.of("teamId", host.teamId,
                                    "shareBp", 10000))))));

            mvc.perform(post("/api/v1/performances/" + performanceId + "/sale/start")
                            .with(bearer(host.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("rulesHash", rule.get("rulesHash").asText()))))
                    .andExpect(status().isConflict());
        }

        @Test
        @DisplayName("bp 합이 10000이 아니면 400 RULE_RATIO_SUM_INVALID 다")
        void rejectsBadRatio() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            setTicketTypes(host, performanceId);

            mvc.perform(put("/api/v1/performances/" + performanceId + "/rules")
                            .with(bearer(host.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("fixedRatioBp", 6000, "selectionRatioBp", 3000,
                                    "teamShares", List.of(Map.of("teamId", host.teamId,
                                            "shareBp", 10000))))))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("RULE_RATIO_SUM_INVALID"));
        }

        @Test
        @DisplayName("전원 동의 전 판매 시작은 409 RULE_NOT_AGREED_BY_ALL 이다")
        void requiresAllAgreements() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            setTicketTypes(host, performanceId);
            String rulesHash = setRules(host, performanceId, List.of(host.teamId));
            payDeposit(host, performanceId);

            mvc.perform(post("/api/v1/performances/" + performanceId + "/sale/start")
                            .with(bearer(host.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("rulesHash", rulesHash))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("RULE_NOT_AGREED_BY_ALL"));
        }

        @Test
        @DisplayName("규칙이 바뀐 뒤의 옛 해시로는 동의할 수 없다 — 409 RULE_HASH_MISMATCH")
        void rejectsStaleRulesHash() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            setTicketTypes(host, performanceId);
            String first = setRules(host, performanceId, List.of(host.teamId));
            // 같은 팀 구성으로 비율만 바꾼다 — 해시가 반드시 달라져야 한다(계약 문서 §4.1 규약).
            String second = setRules(host, performanceId, List.of(host.teamId), 5000, 5000);
            assertThat(second).isNotEqualTo(first);
            // 보증금은 규칙 뒤다(createShow 선행). 마지막 규칙으로 등록돼 온체인과 갈리지 않는다.
            payDeposit(host, performanceId);

            mvc.perform(post("/api/v1/performances/" + performanceId
                            + "/rules/agreements/prepare").with(bearer(host.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("teamId", host.teamId, "rulesHash", first))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("RULE_HASH_MISMATCH"));
        }
    }

    @Nested
    @DisplayName("경계면 QA 재작업 (2026-09-08)")
    class QaFixes {

        // ------------------------------------------------------------ #4 남의 RLP 재보고

        @Test
        @DisplayName("남의 senderSignedRlp 를 자기 주문에 보고하면 409 다 — 타인 jobId 가 재생되지 않는다")
        void rejectsForeignRlpReplay() throws Exception {
            Fixture fixture = onSalePerformance();

            long orderA = createOrder(fixture, 1);
            String purchaseData = startPayment(fixture, orderA)
                    .get("signRequests").get(1).get("data").asText();
            String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(1,
                    fixture.audience.wallet, SPLITTER, purchaseData);
            JsonNode jobA = data(post("/api/v1/orders/" + orderA + "/payment/signed-tx")
                            .with(bearer(fixture.audience.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("kind", "PURCHASE", "senderSignedRlp", rlp,
                                    "orderId", orderA))),
                    202);

            // 같은 공연의 다른 관객 B. A 가 흘린 RLP 를 주워 자기 주문에 보고한다.
            Actor b = signUp(100_000L);
            long orderB = createOrderAs(b, fixture, 1);
            startPaymentAs(b, orderB);

            mvc.perform(post("/api/v1/orders/" + orderB + "/payment/signed-tx")
                            .with(bearer(b.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("kind", "PURCHASE", "senderSignedRlp", rlp,
                                    "orderId", orderB))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("COMMON_CONFLICT"))
                    // A 의 jobId 가 응답으로 새어 나가지 않는다.
                    .andExpect(jsonPath("$.data").doesNotExist());

            // B 의 결제는 전이되지 않았고, A 의 job 도 그대로다.
            JsonNode paymentB = data(get("/api/v1/orders/" + orderB + "/payment")
                    .with(bearer(b.accessToken)));
            assertThat(paymentB.get("payments").get(0).get("paymentStatus").asText()).isEqualTo("AWAITING_SIGNATURE");
            JsonNode paymentA = data(get("/api/v1/orders/" + orderA + "/payment")
                    .with(bearer(fixture.audience.accessToken)));
            assertThat(paymentA.get("payments").get(0).get("purchaseJobId").asText())
                    .isEqualTo(jobA.get("jobId").asText());
        }

        @Test
        @DisplayName("같은 회원이라도 다른 주문에 같은 RLP 를 보고하면 409 다")
        void rejectsSameMemberDifferentOrder() throws Exception {
            Fixture fixture = onSalePerformance();

            long orderA = createOrder(fixture, 1);
            String purchaseData = startPayment(fixture, orderA)
                    .get("signRequests").get(1).get("data").asText();
            String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(1,
                    fixture.audience.wallet, SPLITTER, purchaseData);
            data(post("/api/v1/orders/" + orderA + "/payment/signed-tx")
                            .with(bearer(fixture.audience.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("kind", "PURCHASE", "senderSignedRlp", rlp,
                                    "orderId", orderA))),
                    202);

            long orderB = createOrder(fixture, 1);
            startPayment(fixture, orderB);
            mvc.perform(post("/api/v1/orders/" + orderB + "/payment/signed-tx")
                            .with(bearer(fixture.audience.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("kind", "PURCHASE", "senderSignedRlp", rlp,
                                    "orderId", orderB))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("COMMON_CONFLICT"));
        }

        @Test
        @DisplayName("같은 주문 · 같은 RLP 재보고는 최초 jobId 를 그대로 재생한다(202)")
        void replaysSameJobIdForSameOrder() throws Exception {
            Fixture fixture = onSalePerformance();
            long orderId = createOrder(fixture, 1);
            String purchaseData = startPayment(fixture, orderId)
                    .get("signRequests").get(1).get("data").asText();
            String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(1,
                    fixture.audience.wallet, SPLITTER, purchaseData);

            JsonNode first = data(post("/api/v1/orders/" + orderId + "/payment/signed-tx")
                            .with(bearer(fixture.audience.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("kind", "PURCHASE", "senderSignedRlp", rlp,
                                    "orderId", orderId))),
                    202);
            JsonNode again = data(post("/api/v1/orders/" + orderId + "/payment/signed-tx")
                            .with(bearer(fixture.audience.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("kind", "PURCHASE", "senderSignedRlp", rlp,
                                    "orderId", orderId))),
                    202);
            assertThat(again.get("jobId").asText()).isEqualTo(first.get("jobId").asText());
        }

        // ------------------------------------------------------------ #1 타인 주문 404

        @Test
        @DisplayName("타인 주문 상세는 404 COMMON_NOT_FOUND 다 — 403 이면 존재를 알려 준다")
        void hidesForeignOrder() throws Exception {
            Fixture fixture = onSalePerformance();
            long orderId = createOrder(fixture, 1);
            String other = signInOnly();

            mvc.perform(get("/api/v1/orders/" + orderId).with(bearer(other)))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("COMMON_NOT_FOUND"))
                    .andExpect(jsonPath("$.data").doesNotExist());

            // 같은 주문에 대해 payment 3개 API 와 코드가 같아야 한다(QA A-6-1).
            mvc.perform(get("/api/v1/orders/" + orderId + "/payment").with(bearer(other)))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("COMMON_NOT_FOUND"));
        }

        // ------------------------------------------------------------ #2 approveTxHash

        @Test
        @DisplayName("payment.approveTxHash 는 approve chain_job 의 tx_hash 로 채워진다")
        void fillsApproveTxHashFromChainJob() throws Exception {
            Fixture fixture = onSalePerformance();
            long orderId = createOrder(fixture, 1);
            String approveData = startPayment(fixture, orderId)
                    .get("signRequests").get(0).get("data").asText();
            String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(0,
                    fixture.audience.wallet, YOYO, approveData);
            JsonNode job = data(post("/api/v1/orders/" + orderId + "/payment/signed-tx")
                            .with(bearer(fixture.audience.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("kind", "APPROVE", "senderSignedRlp", rlp))),
                    202);

            // 전송 전이라 tx_hash 가 없다 → 필드도 없다(non_null).
            JsonNode before = data(get("/api/v1/orders/" + orderId)
                    .with(bearer(fixture.audience.accessToken)));
            assertThat(before.get("orders").get(0).get("payment").has("approveTxHash")).isFalse();

            long chainJobId = ChainJobIds.parseJobId(job.get("jobId").asText()).orElseThrow();
            ChainJobConfirmationService.Result result = confirm(job.get("jobId").asText(), YOYO,
                    fixture.audience.wallet.address(), "Approval",
                    approvalArgs(fixture.audience.wallet.address(), SPLITTER, 25_000L));
            assertThat(result.confirmed()).isTrue();

            JsonNode after = data(get("/api/v1/orders/" + orderId)
                    .with(bearer(fixture.audience.accessToken)));
            assertThat(after.get("orders").get(0).get("payment").get("approveTxHash").asText())
                    .isEqualTo(fakeTxHash(chainJobId));
        }

        // ------------------------------------------------------------ #5 Approval spender

        @Test
        @DisplayName("Approval 의 spender 가 Splitter 가 아니면 확정하지 않는다(계약 §4.4)")
        void rejectsApprovalToWrongSpender() throws Exception {
            Fixture fixture = onSalePerformance();
            long orderId = createOrder(fixture, 1);
            String approveData = startPayment(fixture, orderId)
                    .get("signRequests").get(0).get("data").asText();
            String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(0,
                    fixture.audience.wallet, YOYO, approveData);
            JsonNode job = data(post("/api/v1/orders/" + orderId + "/payment/signed-tx")
                            .with(bearer(fixture.audience.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("kind", "APPROVE", "senderSignedRlp", rlp))),
                    202);

            ChainJobConfirmationService.Result result = confirm(job.get("jobId").asText(), YOYO,
                    fixture.audience.wallet.address(), "Approval",
                    approvalArgs(fixture.audience.wallet.address(), TestWallet.random().address(),
                            25_000L));
            assertThat(result.confirmed()).isFalse();
            assertThat(result.failureReason()).isEqualTo("PAYMENT_AMOUNT_MISMATCH");
        }

        // ------------------------------------------------------------ #3 expiresAt

        @Test
        @DisplayName("주문 목록의 expiresAt 은 PENDING_PAYMENT 에만 있다")
        void expiresAtOnlyWhilePending() throws Exception {
            Fixture fixture = onSalePerformance();
            purchaseTickets(fixture, 1);
            long pendingOrderId = createOrder(fixture, 1);

            JsonNode items = data(get("/api/v1/orders/me")
                    .with(bearer(fixture.audience.accessToken))).get("items");
            boolean checkedPaid = false;
            boolean checkedPending = false;
            for (JsonNode item : items) {
                if ("PAID".equals(item.get("groupStatus").asText())) {
                    assertThat(item.has("expiresAt")).isFalse();
                    checkedPaid = true;
                } else if (item.get("orderGroupId").asLong() == pendingOrderId) {
                    assertThat(item.get("expiresAt").asText()).isNotBlank();
                    checkedPending = true;
                }
            }
            assertThat(checkedPaid).isTrue();
            assertThat(checkedPending).isTrue();
        }

        // ------------------------------------------------------------ #6 revert 사유

        @Test
        @DisplayName("revert 사유를 담아 confirm 하면 그 코드로 FAILED 가 된다")
        void carriesRevertReason() throws Exception {
            long chainJobId = reportedPurchaseJobId();
            ChainJobConfirmationService.Result result = confirmations.confirm(chainJobId,
                    TxReceipt.reverted(fakeTxHash(chainJobId), "TICKET_SOLD_OUT"));
            assertThat(result.confirmed()).isFalse();
            assertThat(result.failureReason()).isEqualTo("TICKET_SOLD_OUT");
        }

        @Test
        @DisplayName("사유 없는 revert 는 지금까지처럼 PAYMENT_AMOUNT_MISMATCH 다")
        void revertWithoutReasonKeepsOldBehaviour() throws Exception {
            long chainJobId = reportedPurchaseJobId();
            ChainJobConfirmationService.Result result = confirmations.confirm(chainJobId,
                    TxReceipt.reverted(fakeTxHash(chainJobId)));
            assertThat(result.confirmed()).isFalse();
            assertThat(result.failureReason()).isEqualTo("PAYMENT_AMOUNT_MISMATCH");
        }

        /** 주문 → 결제 시작 → PURCHASE 보고까지. 확정만 남은 chain_job id 를 준다. */
        private long reportedPurchaseJobId() throws Exception {
            Fixture fixture = onSalePerformance();
            long orderId = createOrder(fixture, 1);
            String purchaseData = startPayment(fixture, orderId)
                    .get("signRequests").get(1).get("data").asText();
            String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(1,
                    fixture.audience.wallet, SPLITTER, purchaseData);
            JsonNode job = data(post("/api/v1/orders/" + orderId + "/payment/signed-tx")
                            .with(bearer(fixture.audience.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("kind", "PURCHASE", "senderSignedRlp", rlp,
                                    "orderId", orderId))),
                    202);
            return ChainJobIds.parseJobId(job.get("jobId").asText()).orElseThrow();
        }

        // ------------------------------------------------------------ #10 rate limit

        @Test
        @DisplayName("QR 토큰 발급이 회원 한도를 넘으면 429 + Retry-After 다(§0.9)")
        void qrTokenRateLimited() throws Exception {
            Fixture fixture = onSalePerformance();
            long ticketId = purchaseTickets(fixture, 1).get(0);

            String retryAfter = null;
            for (int i = 0; i < 130 && retryAfter == null; i++) {
                MvcResult result = mvc.perform(get("/api/v1/tickets/" + ticketId + "/qr")
                        .with(bearer(fixture.audience.accessToken))).andReturn();
                if (result.getResponse().getStatus() == 429) {
                    assertThat(objectMapper.readTree(result.getResponse()
                            .getContentAsString()).get("code").asText())
                            .isEqualTo("COMMON_TOO_MANY_REQUESTS");
                    retryAfter = result.getResponse().getHeader(HttpHeaders.RETRY_AFTER);
                }
            }
            assertThat(retryAfter).isNotNull();
            assertThat(Integer.parseInt(retryAfter)).isBetween(1, 60);
        }
    }

    /**
     * 결제 경로의 경합·보상·순서 (2026-09-09).
     *
     * <p>명세 대조로는 잡히지 않는 셋을 <b>실제로 재현해</b> 고정한다 — ① 동시 주문 생성
     * ② DB 롤백·조회 없는 만료 ③ 취소된 주문에 늦게 도착한 receipt.
     */
    @Nested
    @DisplayName("동시성·보상·순서 (2026-09-09)")
    class Concurrency {

        // ------------------------------------------------------------ ① 주문 생성 멱등

        @Test
        @DisplayName("같은 멱등키로 동시에 두 번 들어와도 주문은 1건이고 재고는 한 번만 빠진다")
        void concurrentCreateOrderMakesExactlyOneOrder() throws Exception {
            Fixture fixture = onSalePerformance();
            String key = UUID.randomUUID().toString();
            String body = json(orderBody(fixture, 1));

            CyclicBarrier barrier = new CyclicBarrier(2);
            ExecutorService pool = Executors.newFixedThreadPool(2);
            List<MvcResult> results;
            try {
                List<Future<MvcResult>> futures = pool.invokeAll(List.of(
                        createOrderTask(barrier, fixture.audience.accessToken, key, body),
                        createOrderTask(barrier, fixture.audience.accessToken, key, body)));
                results = List.of(futures.get(0).get(30, TimeUnit.SECONDS),
                        futures.get(1).get(30, TimeUnit.SECONDS));
            } finally {
                pool.shutdownNow();
            }

            // 성공한 응답은 전부 같은 주문을 가리켜야 한다. 진 쪽은 201(재생) 이거나
            // 409 COMMON_CONFLICT(선점 중)다 — 둘 다 "주문을 새로 만들지 않았다"는 뜻이다.
            List<Long> createdIds = new ArrayList<>();
            for (MvcResult result : results) {
                int status = result.getResponse().getStatus();
                JsonNode payload = objectMapper.readTree(result.getResponse()
                        .getContentAsString());
                if (status == 201) {
                    createdIds.add(payload.get("data").get("orderId").asLong());
                } else {
                    assertThat(status).isEqualTo(409);
                    assertThat(payload.get("code").asText()).isEqualTo("COMMON_CONFLICT");
                }
            }
            assertThat(createdIds).isNotEmpty();
            assertThat(createdIds.stream().distinct()).hasSize(1);

            Integer orders = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM ticket_order WHERE member_id = ? AND performance_id = ?",
                    Integer.class, fixture.audience.memberId, fixture.performanceId);
            assertThat(orders).isEqualTo(1);
            assertThat(ticketStock.remaining(fixture.performanceId, fixture.ticketTypeId))
                    .contains(79);
        }

        // ------------------------------------------------------------ ② 재고 보상

        @Test
        @DisplayName("주문 트랜잭션이 롤백되면 재고와 멱등 자리가 모두 돌아온다")
        void rollbackReturnsStockAndIdempotencySlot() throws Exception {
            Fixture fixture = onSalePerformance();
            String key = UUID.randomUUID().toString();
            CreateOrderRequest request = new CreateOrderRequest(fixture.performanceId,
                    List.of(new OrderItemInput(fixture.ticketTypeId, 2,
                            fixture.guestTeam.teamId)), 50_000L);
            MemberPrincipal audience = MemberPrincipal.of(fixture.audience.memberId, null, false);

            // 커밋 직전까지 간 뒤 롤백한다 — 재고는 이미 Redis 에서 빠져 있는 상태다.
            new TransactionTemplate(transactionManager).execute(status -> {
                orderService.createOrder(audience, key, request);
                assertThat(ticketStock.remaining(fixture.performanceId, fixture.ticketTypeId))
                        .contains(78);
                status.setRollbackOnly();
                return null;
            });

            assertThat(ticketStock.remaining(fixture.performanceId, fixture.ticketTypeId))
                    .contains(80);
            Integer orders = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM ticket_order WHERE member_id = ?",
                    Integer.class, fixture.audience.memberId);
            assertThat(orders).isZero();

            // 롤백된 시도가 멱등키를 24시간 잡아 두면 사용자는 다시 주문할 수 없다.
            JsonNode retried = data(post("/api/v1/orders")
                            .with(bearer(fixture.audience.accessToken))
                            .header("Idempotency-Key", key)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(orderBody(fixture, 2))), 201);
            assertThat(retried.get("orderId").asLong()).isPositive();
            assertThat(ticketStock.remaining(fixture.performanceId, fixture.ticketTypeId))
                    .contains(78);
        }

        @Test
        @DisplayName("만료 배치는 아무도 주문을 열지 않아도 재고를 되돌리고, 두 번 되돌리지 않는다")
        void expirySweepReturnsStockWithoutAnyLookup() throws Exception {
            Fixture fixture = onSalePerformance();
            long orderId = createOrder(fixture, 2);
            assertThat(ticketStock.remaining(fixture.performanceId, fixture.ticketTypeId))
                    .contains(78);
            expirePaymentDeadline(orderId);

            assertThat(orderService.findExpiredOrderIds(200)).contains(orderId);

            // 인스턴스 둘이 같은 주문을 동시에 집는 상황. 재고가 두 번 돌아가면 없던 표가 생긴다.
            CyclicBarrier barrier = new CyclicBarrier(2);
            ExecutorService pool = Executors.newFixedThreadPool(2);
            long winners;
            try {
                List<Future<Boolean>> futures = pool.invokeAll(List.of(
                        expireTask(barrier, orderId), expireTask(barrier, orderId)));
                winners = List.of(futures.get(0).get(30, TimeUnit.SECONDS),
                                futures.get(1).get(30, TimeUnit.SECONDS)).stream()
                        .filter(Boolean::booleanValue).count();
            } finally {
                pool.shutdownNow();
            }

            assertThat(winners).isEqualTo(1);
            assertThat(ticketStock.remaining(fixture.performanceId, fixture.ticketTypeId))
                    .contains(80);
            assertThat(orderStatus(orderId)).isEqualTo("CANCELLED");
            assertThat(orderService.findExpiredOrderIds(200)).doesNotContain(orderId);
        }

        // ------------------------------------------------------------ D-83 만료 ↔ 결제

        @Test
        @DisplayName("주문이 만료되면 서명하지 않은 결제도 FAILED 로 닫힌다(D-83)")
        void expiryClosesUnsignedPayment() throws Exception {
            Fixture fixture = onSalePerformance();
            long orderId = createOrder(fixture, 1);
            // 결제를 시작만 하고 서명하지 않는다 — 온체인에서는 아무 일도 일어나지 않았다.
            startPayment(fixture, orderId);
            assertThat(paymentStatus(orderId)).isEqualTo("AWAITING_SIGNATURE");

            expirePaymentDeadline(orderId);
            assertThat(orderService.expireOrder(orderId)).isTrue();

            assertThat(orderStatus(orderId)).isEqualTo("CANCELLED");
            // 남겨 두면 정산 집계 게이트가 "곧 확정될 결제"로 읽어 그 공연을 영구히 막는다.
            assertThat(paymentStatus(orderId)).isEqualTo("FAILED");
            assertThat(paymentFailureCode(orderId))
                    .isEqualTo(ErrorCode.TICKET_CANCELED.getCode());
        }

        @Test
        @DisplayName("만료된 주문에 결제를 다시 시작하면 409 + 만료 처리가 커밋된다")
        void startPaymentOnExpiredOrderCommitsExpiry() throws Exception {
            Fixture fixture = onSalePerformance();
            long orderId = createOrder(fixture, 1);
            startPayment(fixture, orderId);
            expirePaymentDeadline(orderId);

            mvc.perform(post("/api/v1/orders/" + orderId + "/payment")
                            .with(bearer(fixture.audience.accessToken))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("COMMON_CONFLICT"));

            // 409 와 같은 트랜잭션에서 만료를 처리하면 롤백과 함께 사라진다 — 여기 jdbc 조회는
            // 커밋된 값만 본다. 재고 반납도 새 트랜잭션의 커밋 뒤에 돌아야 한다.
            assertThat(orderStatus(orderId)).isEqualTo("CANCELLED");
            assertThat(paymentStatus(orderId)).isEqualTo("FAILED");
            assertThat(paymentFailureCode(orderId))
                    .isEqualTo(ErrorCode.TICKET_CANCELED.getCode());
            assertThat(ticketStock.remaining(fixture.performanceId, fixture.ticketTypeId))
                    .contains(80);
        }

        @Test
        @DisplayName("이미 대납 전송된 PAYING 결제는 만료가 건드리지 않는다 — 결과는 receipt 가 쓴다")
        void expiryKeepsPayingPayment() throws Exception {
            Fixture fixture = onSalePerformance();
            long orderId = createOrder(fixture, 1);
            JsonNode payment = startPayment(fixture, orderId);
            String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(1,
                    fixture.audience.wallet, SPLITTER,
                    payment.get("signRequests").get(1).get("data").asText());
            data(post("/api/v1/orders/" + orderId + "/payment/signed-tx")
                            .with(bearer(fixture.audience.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("kind", "PURCHASE", "senderSignedRlp", rlp,
                                    "orderId", orderId))),
                    202);
            assertThat(paymentStatus(orderId)).isEqualTo("PAYING");

            expirePaymentDeadline(orderId);
            assertThat(orderService.expireOrder(orderId)).isTrue();

            assertThat(orderStatus(orderId)).isEqualTo("CANCELLED");
            assertThat(paymentStatus(orderId)).isEqualTo("PAYING");
            assertThat(paymentFailureCode(orderId)).isNull();
        }

        // ------------------------------------------------------------ ③ 늦은 receipt

        @Test
        @DisplayName("취소된 주문에 결제 receipt 가 늦게 와도 티켓을 발급하지 않고 환불 대상으로 남긴다")
        void lateReceiptDoesNotIssueTickets() throws Exception {
            Fixture fixture = onSalePerformance();
            JsonNode order = data(post("/api/v1/orders")
                            .with(bearer(fixture.audience.accessToken))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(orderBody(fixture, 1))), 201);
            long orderId = order.get("orderId").asLong();

            JsonNode payment = startPayment(fixture, orderId);
            String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(1,
                    fixture.audience.wallet, SPLITTER,
                    payment.get("signRequests").get(1).get("data").asText());
            JsonNode job = data(post("/api/v1/orders/" + orderId + "/payment/signed-tx")
                            .with(bearer(fixture.audience.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("kind", "PURCHASE", "senderSignedRlp", rlp,
                                    "orderId", orderId))),
                    202);

            // 15분이 지나 만료 스윕이 주문을 취소하고 재고를 회수했다.
            expirePaymentDeadline(orderId);
            assertThat(orderService.expireOrder(orderId)).isTrue();
            assertThat(ticketStock.remaining(fixture.performanceId, fixture.ticketTypeId))
                    .contains(80);

            // 그 뒤에 온체인 receipt 가 도착한다 — 이벤트 인자는 전부 맞다.
            ChainJobConfirmationService.Result result = confirm(job.get("jobId").asText(), SPLITTER,
                    fixture.audience.wallet.address(), "Purchased",
                    purchasedArgs(fixture.performanceId, order.get("orders").get(0).get("orderRef").asText(),
                            fixture.audience.wallet.address(), order.get("orders").get(0).get("teamIndex").asInt(),
                            25_000L, 1));

            // 온체인 성공은 사실이다 — job 은 CONFIRMED.
            assertThat(result.confirmed()).isTrue();
            assertThat(result.issuedTicketIds()).isEmpty();
            assertThat(chainJobStatus(job.get("jobId").asText())).isEqualTo("CONFIRMED");
            // 재고가 없으므로 티켓은 발급하지 않는다.
            Integer tickets = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM ticket WHERE ticket_order_id = ?", Integer.class,
                    orderId);
            assertThat(tickets).isZero();
            assertThat(ticketStock.remaining(fixture.performanceId, fixture.ticketTypeId))
                    .contains(80);
            // 돈은 실제로 나갔다 — 장부에서 지우지 않는다.
            assertThat(jdbc.queryForObject(
                    "SELECT status FROM payment WHERE ticket_order_id = ?", String.class, orderId))
                    .isEqualTo("PAID");
            // 주문은 취소로 남고, 돌려줄 책임이 감사 로그에 남는다.
            assertThat(orderStatus(orderId)).isEqualTo("CANCELLED");
            Integer flagged = jdbc.queryForObject("""
                    SELECT COUNT(*) FROM audit_log
                    WHERE resource_type = 'ticket_order' AND resource_id = ?
                      AND result = 'FAILURE' AND request_summary LIKE 'LATE_PURCHASE_RECEIPT%'
                    """, Integer.class, orderId);
            assertThat(flagged).isEqualTo(1);
        }

        // ------------------------------------------------------------ 보조

        private Callable<MvcResult> createOrderTask(CyclicBarrier barrier, String accessToken,
                                                     String idempotencyKey, String body) {
            return () -> {
                barrier.await(20, TimeUnit.SECONDS);
                return mvc.perform(post("/api/v1/orders").with(bearer(accessToken))
                        .header("Idempotency-Key", idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON).content(body)).andReturn();
            };
        }

        private Callable<Boolean> expireTask(CyclicBarrier barrier, long orderId) {
            return () -> {
                barrier.await(20, TimeUnit.SECONDS);
                return orderService.expireOrder(orderId);
            };
        }

        /** 결제 시한을 과거로 밀어 "15분이 지났다"를 만든다. */
        private void expirePaymentDeadline(long orderId) {
            jdbc.update("UPDATE ticket_order SET payment_expires_at = ? WHERE ticket_order_id = ?",
                    LocalDateTime.now(com.ssafy.b204.common.support.TimeSupport.STORAGE_ZONE)
                            .minusMinutes(1)
                            .format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")),
                    orderId);
        }

        private String orderStatus(long orderId) {
            return jdbc.queryForObject("SELECT status FROM ticket_order WHERE ticket_order_id = ?",
                    String.class, orderId);
        }

        private String paymentStatus(long orderId) {
            return jdbc.queryForObject("SELECT status FROM payment WHERE ticket_order_id = ?",
                    String.class, orderId);
        }

        private String paymentFailureCode(long orderId) {
            return jdbc.queryForObject(
                    "SELECT failure_code FROM payment WHERE ticket_order_id = ?",
                    String.class, orderId);
        }

        private String chainJobStatus(String jobId) {
            return jdbc.queryForObject("SELECT status FROM chain_job WHERE chain_job_id = ?",
                    String.class, ChainJobIds.parseJobId(jobId).orElseThrow());
        }
    }

    /**
     * <b>체인 워커가 스스로 receipt 로그를 파싱해 확정까지 완주한다</b> (Jira S15P21B204-64).
     *
     * <p>다른 테스트들은 {@link ChainJobConfirmationService#confirm}에 {@code TxReceipt}를 <b>직접
     * 주입</b>해 확정 이후를 검증한다. 여기서는 그 앞 한 칸을 마저 잇는다 — 워커가 받은 것은
     * <b>web3j {@code TransactionReceipt}와 로그뿐</b>이고, 이벤트 파싱·검증·도메인 전이·잔액
     * 캐시까지 사람 손 없이 간다. 이 경로가 없으면 실서버에서 결제가 영원히 {@code PAID}가 되지
     * 않는다.
     *
     * <p><b>노드만 가짜다.</b> 로그는 {@link ChainLogs}가 ABI 생성물의 {@code Event} 정의로
     * 조립하고 서버도 같은 정의로 읽는다. 실체인(Kairos) 완주는 {@code CHAIN_E2E=1} 전용
     * E2E의 몫이며 이 테스트가 그것을 대신하지 않는다 — <b>여기가 통과했다고 실서버가 된다는
     * 뜻이 아니다.</b>
     */
    @Nested
    @DisplayName("체인 워커 receipt 확정 배선 (S15P21B204-64)")
    class WorkerConfirmation {

        @Test
        @DisplayName("주문 → prepare → signed-tx → 워커가 로그를 파싱해 확정 → PAID + 티켓 ISSUED")
        void workerConfirmsPurchaseEndToEnd() throws Exception {
            Fixture fixture = onSalePerformance();
            JsonNode order = data(post("/api/v1/orders")
                            .with(bearer(fixture.audience.accessToken))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(orderBody(fixture, 1))), 201);
            long orderId = order.get("orderId").asLong();
            String orderRef = order.get("orders").get(0).get("orderRef").asText();
            int teamIndex = order.get("orders").get(0).get("teamIndex").asInt();

            long chainJobId = reportPurchase(fixture, orderId);
            String txHash = submitToChain(chainJobId);

            // 노드가 돌려줄 receipt — Purchased 로그 한 줄이 전부다. 서버는 이것만 보고 판단한다.
            TransactionReceipt receipt = ChainLogs.receipt(txHash, SPLITTER,
                    fixture.audience.wallet.address(),
                    List.of(purchasedLog(fixture.performanceId, orderRef,
                            fixture.audience.wallet.address(), teamIndex, 25_000L, 1L)));

            runWorker(txHash, receipt);

            assertThat(chainJobStatusOf(chainJobId)).isEqualTo("CONFIRMED");
            JsonNode paid = data(get("/api/v1/orders/" + orderId + "/payment")
                    .with(bearer(fixture.audience.accessToken)));
            assertThat(paid.get("payments").get(0).get("paymentStatus").asText()).isEqualTo("PAID");
            assertThat(paid.get("groupStatus").asText()).isEqualTo("PAID");
            assertThat(paid.get("ticketIds")).hasSize(1);
            assertThat(purchaseTxHashOf(orderId)).isEqualTo(txHash);
            // §0.12 갱신 시점 ② — 발신 지갑 캐시가 결제액만큼 줄었다.
            assertThat(paid.get("walletBalance").asLong()).isEqualTo(75_000L);

            JsonNode tickets = data(get("/api/v1/tickets/me")
                    .with(bearer(fixture.audience.accessToken)));
            assertThat(tickets.get("items")).hasSize(1);
            assertThat(tickets.get("items").get(0).get("status").asText()).isEqualTo("ISSUED");
        }

        @Test
        @DisplayName("인자가 다른 Purchased 로그로는 확정되지 않는다 — 티켓도 발급되지 않는다")
        void rejectsMismatchedEventArgs() throws Exception {
            Fixture fixture = onSalePerformance();
            JsonNode order = data(post("/api/v1/orders")
                            .with(bearer(fixture.audience.accessToken))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(orderBody(fixture, 1))), 201);
            long orderId = order.get("orderId").asLong();
            int teamIndex = order.get("orders").get(0).get("teamIndex").asInt();

            long chainJobId = reportPurchase(fixture, orderId);
            String txHash = submitToChain(chainJobId);

            // 금액만 1원 다르다. 서버 상태와 대조되므로 통과하면 안 된다(§0.4 ⑤).
            TransactionReceipt receipt = ChainLogs.receipt(txHash, SPLITTER,
                    fixture.audience.wallet.address(),
                    List.of(purchasedLog(fixture.performanceId, order.get("orders").get(0).get("orderRef").asText(),
                            fixture.audience.wallet.address(), teamIndex, 24_999L, 1L)));

            runWorker(txHash, receipt);

            assertThat(chainJobStatusOf(chainJobId)).isEqualTo("FAILED");
            assertThat(ticketCountOf(orderId)).isZero();
            assertThat(data(get("/api/v1/orders/" + orderId + "/payment")
                    .with(bearer(fixture.audience.accessToken)))
                    .get("groupStatus").asText()).isEqualTo("PENDING_PAYMENT");
        }

        @Test
        @DisplayName("워커가 늦은 receipt 를 물어와도 죽지 않는다 — 티켓 없이 환불 대상으로만 남는다")
        void workerSurvivesLateReceipt() throws Exception {
            Fixture fixture = onSalePerformance();
            JsonNode order = data(post("/api/v1/orders")
                            .with(bearer(fixture.audience.accessToken))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(orderBody(fixture, 1))), 201);
            long orderId = order.get("orderId").asLong();
            int teamIndex = order.get("orders").get(0).get("teamIndex").asInt();

            long chainJobId = reportPurchase(fixture, orderId);
            String txHash = submitToChain(chainJobId);

            // 15분이 지나 만료 스윕이 주문을 취소하고 재고를 회수했다 — 그 뒤에 receipt 가 온다.
            jdbc.update("UPDATE ticket_order SET payment_expires_at = ? WHERE ticket_order_id = ?",
                    LocalDateTime.now(com.ssafy.b204.common.support.TimeSupport.STORAGE_ZONE)
                            .minusMinutes(1)
                            .format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")),
                    orderId);
            assertThat(orderService.expireOrder(orderId)).isTrue();
            assertThat(ticketStock.remaining(fixture.performanceId, fixture.ticketTypeId))
                    .contains(80);

            TransactionReceipt receipt = ChainLogs.receipt(txHash, SPLITTER,
                    fixture.audience.wallet.address(),
                    List.of(purchasedLog(fixture.performanceId, order.get("orders").get(0).get("orderRef").asText(),
                            fixture.audience.wallet.address(), teamIndex, 25_000L, 1L)));

            runWorker(txHash, receipt);

            // 온체인 사실(chain_job·payment)과 서비스 판정(주문·티켓·재고)이 갈려 적힌다.
            assertThat(chainJobStatusOf(chainJobId)).isEqualTo("CONFIRMED");
            assertThat(ticketCountOf(orderId)).isZero();
            assertThat(ticketStock.remaining(fixture.performanceId, fixture.ticketTypeId))
                    .contains(80);
            assertThat(jdbc.queryForObject(
                    "SELECT status FROM ticket_order WHERE ticket_order_id = ?",
                    String.class, orderId)).isEqualTo("CANCELLED");
            assertThat(jdbc.queryForObject("SELECT status FROM payment WHERE ticket_order_id = ?",
                    String.class, orderId)).isEqualTo("PAID");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_log WHERE resource_type = ?"
                            + " AND resource_id = ? AND request_summary LIKE 'LATE_PURCHASE_RECEIPT%'",
                    Integer.class, "ticket_order", orderId)).isEqualTo(1);
        }

        @Test
        @DisplayName("같은 주문에 두 번째 결제 tx 가 확정돼도 티켓은 한 장이다 — 환불 대상으로 남는다")
        void secondPurchaseReceiptBecomesRefundTarget() throws Exception {
            Fixture fixture = onSalePerformance();
            JsonNode order = data(post("/api/v1/orders")
                            .with(bearer(fixture.audience.accessToken))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(orderBody(fixture, 1))), 201);
            long orderId = order.get("orderId").asLong();
            String orderRef = order.get("orders").get(0).get("orderRef").asText();
            int teamIndex = order.get("orders").get(0).get("teamIndex").asInt();

            // ① 서명 → 전송(PAYING). ② 앱을 닫았다 다시 열어 결제 재시작 → AWAITING_SIGNATURE 로
            // 되감기고 signRequests 가 다시 나온다(명세 API-payment-02). ③ 지갑이 nonce 를 올려
            // *다른* purchase tx 를 만든다 → RLP 해시 멱등키가 달라 별개 job 이다.
            long firstJobId = reportPurchase(fixture, orderId, 1);
            long secondJobId = reportPurchase(fixture, orderId, 2);
            assertThat(secondJobId).isNotEqualTo(firstJobId);

            String firstTxHash = submitToChain(firstJobId);
            String secondTxHash = submitToChain(secondJobId);
            Log purchased = purchasedLog(fixture.performanceId, orderRef,
                    fixture.audience.wallet.address(), teamIndex, 25_000L, 1L);

            // 첫 tx 확정 — 정상 결제다. payment 링크는 이미 두 번째 job 을 가리키고 있다.
            runWorker(Map.of(firstTxHash, ChainLogs.receipt(firstTxHash, SPLITTER,
                    fixture.audience.wallet.address(), List.of(purchased))));

            assertThat(chainJobStatusOf(firstJobId)).isEqualTo("CONFIRMED");
            assertThat(ticketCountOf(orderId)).isEqualTo(1);
            assertThat(purchaseTxHashOf(orderId)).isEqualTo(firstTxHash);
            String paidAt = paidAtOf(orderId);
            assertThat(paidAt).isNotNull();

            // 두 번째 tx 도 온체인에서 성공했다 — 돈은 두 번 나갔다.
            runWorker(Map.of(secondTxHash, ChainLogs.receipt(secondTxHash, SPLITTER,
                    fixture.audience.wallet.address(), List.of(purchased))));

            // 워커는 죽지 않고 온체인 사실을 그대로 적는다(재시도 대상이 아니다).
            assertThat(chainJobStatusOf(secondJobId)).isEqualTo("CONFIRMED");
            assertThat(jdbc.queryForObject(
                    "SELECT tx_hash FROM chain_job WHERE chain_job_id = ?", String.class,
                    secondJobId)).isEqualTo(secondTxHash);
            assertThat(jdbc.queryForObject(
                    "SELECT retry_count FROM chain_job WHERE chain_job_id = ?", Integer.class,
                    secondJobId)).isZero();

            // 티켓은 그대로 한 장이고 최초 결제의 tx 해시·시각은 덮이지 않았다.
            assertThat(ticketCountOf(orderId)).isEqualTo(1);
            assertThat(purchaseTxHashOf(orderId)).isEqualTo(firstTxHash);
            assertThat(paidAtOf(orderId)).isEqualTo(paidAt);
            assertThat(jdbc.queryForObject("SELECT status FROM payment WHERE ticket_order_id = ?",
                    String.class, orderId)).isEqualTo("PAID");
            assertThat(jdbc.queryForObject(
                    "SELECT status FROM ticket_order WHERE ticket_order_id = ?",
                    String.class, orderId)).isEqualTo("PAID");

            // 환불 대상으로 식별 가능해야 한다 — 늦은 receipt 와 같은 자리, 구분되는 표식이다.
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_log WHERE resource_type = ?"
                            + " AND resource_id = ? AND request_summary"
                            + " LIKE 'DUPLICATE_PURCHASE_RECEIPT%'",
                    Integer.class, "ticket_order", orderId)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT tx_hash FROM audit_log WHERE resource_type = ?"
                            + " AND resource_id = ? AND request_summary"
                            + " LIKE 'DUPLICATE_PURCHASE_RECEIPT%'",
                    String.class, "ticket_order", orderId)).isEqualTo(secondTxHash);
            // 늦은 receipt 는 사유가 달라 그 표식으로 적히지 않는다.
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_log WHERE resource_id = ?"
                            + " AND request_summary LIKE 'LATE_PURCHASE_RECEIPT%'",
                    Integer.class, orderId)).isZero();

            // API-payment-02 응답도 최초 결제 그대로다(티켓 1장, 첫 tx 해시).
            JsonNode paid = data(get("/api/v1/orders/" + orderId + "/payment")
                    .with(bearer(fixture.audience.accessToken)));
            assertThat(paid.get("ticketIds")).hasSize(1);
            assertThat(purchaseTxHashOf(orderId)).isEqualTo(firstTxHash);
        }

        @Test
        @DisplayName("링크를 잃은 첫 job 이 먼저 확정되면 그것이 정상 결제다 — 돈이 장부 밖으로 새지 않는다")
        void supersededJobStillSettlesThePayment() throws Exception {
            Fixture fixture = onSalePerformance();
            JsonNode order = data(post("/api/v1/orders")
                            .with(bearer(fixture.audience.accessToken))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(orderBody(fixture, 1))), 201);
            long orderId = order.get("orderId").asLong();
            int teamIndex = order.get("orders").get(0).get("teamIndex").asInt();

            long firstJobId = reportPurchase(fixture, orderId, 1);
            // 두 번째 보고가 payment.purchase_chain_job_id 를 덮는다 - 첫 job 은 링크를 잃는다.
            reportPurchase(fixture, orderId, 2);
            String firstTxHash = submitToChain(firstJobId);

            runWorker(Map.of(firstTxHash, ChainLogs.receipt(firstTxHash, SPLITTER,
                    fixture.audience.wallet.address(),
                    List.of(purchasedLog(fixture.performanceId, order.get("orders").get(0).get("orderRef").asText(),
                            fixture.audience.wallet.address(), teamIndex, 25_000L, 1L)))));

            // 예전에는 여기서 COMMON_NOT_FOUND 로 FAILED 가 됐다 — 나간 돈이 어디에도 안 남았다.
            assertThat(chainJobStatusOf(firstJobId)).isEqualTo("CONFIRMED");
            assertThat(ticketCountOf(orderId)).isEqualTo(1);
            assertThat(purchaseTxHashOf(orderId)).isEqualTo(firstTxHash);
        }

        /**
         * S15P21B204-134 — 같은 주문의 {@code PURCHASE} job 두 개를 <b>두 인스턴스가 동시에</b>
         * 확정한다. -119 의 펜싱은 {@code chain_job} 행 단위라 이 둘은 서로를 막지 않는다.
         *
         * <p>B 는 A 커밋 <b>전에</b> {@code payment} 를 일반 읽기로 한 번 본다 — REPEATABLE READ
         * 스냅숏이 그때 만들어져 이후 일반 읽기는 계속 {@code PAYING} 을 본다. 그래도 확정은
         * {@code em.refresh(payment, PESSIMISTIC_WRITE)} 로 A 커밋을 기다렸다가 <b>최신
         * 커밋({@code PAID})</b>을 읽어야 한다. 잠금을 되돌리면 B 는 스냅숏의 미결제 상태를 보고
         * 티켓을 한 벌 더 발급한다 — 되돌릴 방법이 없는 유일한 부작용이다.
         *
         * <p>{@code @Transactional} 없는 클래스에서 실제 트랜잭션 두 개로 돈다 — 테스트 트랜잭션
         * 하나에 두 스레드를 넣으면 잠금 경합 자체가 사라진다.
         */
        @Test
        @DisplayName("같은 주문의 PURCHASE job 두 개를 동시에 확정해도 티켓은 한 장이다")
        void concurrentPurchaseConfirmIssuesTicketsOnce() throws Exception {
            Fixture fixture = onSalePerformance();
            JsonNode order = data(post("/api/v1/orders")
                            .with(bearer(fixture.audience.accessToken))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(orderBody(fixture, 1))), 201);
            long orderId = order.get("orderId").asLong();
            String orderRef = order.get("orders").get(0).get("orderRef").asText();
            int teamIndex = order.get("orders").get(0).get("teamIndex").asInt();

            // 재서명으로 job 이 둘 — 두 번째 보고가 payment 링크를 덮어 첫 job 은 orderRef 로
            // 되짚어 같은 결제에 닿는다(supersededJobStillSettlesThePayment).
            long firstJobId = reportPurchase(fixture, orderId, 1);
            long secondJobId = reportPurchase(fixture, orderId, 2);
            String firstTxHash = submitToChain(firstJobId);
            String secondTxHash = submitToChain(secondJobId);
            TxReceipt firstReceipt = purchaseReceipt(fixture, firstTxHash, orderRef, teamIndex);
            TxReceipt secondReceipt = purchaseReceipt(fixture, secondTxHash, orderRef, teamIndex);

            CountDownLatch aConfirmed = new CountDownLatch(1);
            CountDownLatch releaseA = new CountDownLatch(1);
            CountDownLatch bSnapshotTaken = new CountDownLatch(1);
            AtomicReference<String> bSnapshotStatus = new AtomicReference<>();
            ExecutorService pool = Executors.newFixedThreadPool(2);
            try {
                Future<ChainJobConfirmationService.Result> a = pool.submit(() ->
                        new TransactionTemplate(transactionManager).execute(status -> {
                            ChainJobConfirmationService.Result result =
                                    confirmations.confirm(firstJobId, firstReceipt);
                            aConfirmed.countDown();
                            awaitQuietly(releaseA);
                            return result;
                        }));
                assertThat(aConfirmed.await(10, TimeUnit.SECONDS))
                        .as("A 가 확정까지 가지 못했다").isTrue();

                Future<ChainJobConfirmationService.Result> b = pool.submit(() ->
                        new TransactionTemplate(transactionManager).execute(status -> {
                            bSnapshotStatus.set(jdbc.queryForObject(
                                    "SELECT status FROM payment WHERE ticket_order_id = ?",
                                    String.class, orderId));
                            bSnapshotTaken.countDown();
                            return confirmations.confirm(secondJobId, secondReceipt);
                        }));
                assertThat(bSnapshotTaken.await(10, TimeUnit.SECONDS)).isTrue();
                // B 가 잠금 앞에 설 시간을 준다. 잠금이 없으면 B 는 이 사이에 끝난다.
                Thread.sleep(500);
                boolean bFinishedBeforeACommit = b.isDone();
                releaseA.countDown();

                assertThat(a.get(10, TimeUnit.SECONDS).confirmed()).isTrue();
                assertThat(b.get(10, TimeUnit.SECONDS).confirmed()).isTrue();

                assertThat(ticketCountOf(orderId)).as("티켓이 두 벌 발급됐다").isEqualTo(1);
                assertThat(purchaseTxHashOf(orderId)).isEqualTo(firstTxHash);
                assertThat(jdbc.queryForObject(
                        "SELECT status FROM payment WHERE ticket_order_id = ?",
                        String.class, orderId)).isEqualTo("PAID");
                // 두 번째 tx 는 환불 대상으로만 남는다 — 두 job 모두 온체인 사실대로 확정된다.
                assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_log"
                                + " WHERE resource_type = ? AND resource_id = ?"
                                + " AND request_summary LIKE 'DUPLICATE_PURCHASE_RECEIPT%'",
                        Integer.class, "ticket_order", orderId)).isEqualTo(1);
                // B 의 스냅숏은 A 커밋 전에 만들어졌다 — 그런데도 티켓을 또 발급하지 않았다.
                assertThat(bSnapshotStatus.get()).isEqualTo("PAYING");
                assertThat(bFinishedBeforeACommit)
                        .as("B 가 A 커밋 전에 끝났다 — payment 행 잠금을 기다리지 않았다").isFalse();
            } finally {
                releaseA.countDown();
                pool.shutdownNow();
                pool.awaitTermination(10, TimeUnit.SECONDS);
            }
        }

        /** 워커가 물어올 {@code Purchased} receipt 하나 — 인자는 주문 그대로다. */
        private TxReceipt purchaseReceipt(Fixture fixture, String txHash, String orderRef,
                                          int teamIndex) {
            return new TxReceipt(txHash, true, SPLITTER, fixture.audience.wallet.address(), 1L,
                    List.of(new TxReceipt.TxEvent("Purchased",
                            purchasedArgs(fixture.performanceId, orderRef,
                                    fixture.audience.wallet.address(), teamIndex, 25_000L, 1L))));
        }

        private static void awaitQuietly(CountDownLatch latch) {
            try {
                latch.await(10, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }

        // ------------------------------------------------------------ 보조

        /** 결제 시작 → 진짜 개인키로 서명한 RLP 보고(202). 확정만 남은 chain_job id 를 준다. */
        private long reportPurchase(Fixture fixture, long orderId) throws Exception {
            return reportPurchase(fixture, orderId, 1);
        }

        /**
         * {@code nonce}만 다른 서명은 <b>다른 tx</b>다 — RLP 해시 멱등키가 달라 별개 job 이 된다.
         * 재시작 후 재서명이 실제로 그렇게 동작한다(지갑이 nonce 를 올린다).
         */
        private long reportPurchase(Fixture fixture, long orderId, int nonce) throws Exception {
            String purchaseData = startPayment(fixture, orderId)
                    .get("signRequests").get(1).get("data").asText();
            String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(nonce,
                    fixture.audience.wallet, SPLITTER, purchaseData);
            JsonNode job = data(post("/api/v1/orders/" + orderId + "/payment/signed-tx")
                            .with(bearer(fixture.audience.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("kind", "PURCHASE", "senderSignedRlp", rlp,
                                    "orderId", orderId))),
                    202);
            return ChainJobIds.parseJobId(job.get("jobId").asText()).orElseThrow();
        }

        /**
         * 체인이 있는 환경이라면 {@code FeeDelegationService}가 대납 서명해 보냈을 자리.
         *
         * <p>테스트 환경에는 노드도 운영 키도 없어 그 단계는 실행할 수 없다({@code b204.chain.*}가
         * 비어 있다 — {@code ChainConfigurationTest}가 그 요구를 고정한다). <b>전송 결과만</b>
         * 넣고, 그 뒤 구간(receipt → 확정)을 워커가 실제로 걷게 한다.
         */
        private String submitToChain(long chainJobId) {
            String txHash = fakeTxHash(chainJobId);
            stateWriter.markSubmitted(chainJobId, txHash);
            return txHash;
        }

        /** {@code Purchased(showId, orderRef, buyer, teamIndex, amount, quantity)} 로그 한 줄. */
        @SuppressWarnings("rawtypes")
        private Log purchasedLog(long showId, String orderRef, String buyer, int teamIndex,
                                 long amount, long quantity) {
            return ChainLogs.log(SPLITTER, RevenueSplitter.PURCHASED_EVENT,
                    List.<Type>of(new Uint256(showId), new Bytes32(ChainLogs.bytes32(orderRef)),
                            new Address(buyer)),
                    List.<Type>of(new Uint8(teamIndex), new Uint256(amount), new Uint16(quantity)));
        }

        /**
         * <b>진짜 워커</b>를 한 주기 돌린다. 바꿔 끼운 것은 노드({@link KaiaChainClient}) 하나다 —
         * 파싱·검증·확정·잔액 갱신은 전부 운영과 같은 빈이 한다.
         */
        private void runWorker(String txHash, TransactionReceipt receipt) {
            runWorker(Map.of(txHash, receipt));
        }

        /**
         * 여러 job 이 동시에 {@code SUBMITTED}인 상황용 — 지정하지 않은 해시는 "아직 블록에 안
         * 들어갔다"({@code Optional.empty()})로 답한다. 그래야 확정 순서를 테스트가 정할 수 있다.
         */
        private void runWorker(Map<String, TransactionReceipt> receipts) {
            KaiaChainClient chainClient = mock(KaiaChainClient.class);
            given(chainClient.isAvailable()).willReturn(true);
            given(chainClient.receipt(org.mockito.ArgumentMatchers.anyString()))
                    .willAnswer(invocation -> Optional.ofNullable(
                            receipts.get(invocation.getArgument(0, String.class))));
            given(chainClient.blockNumber()).willReturn(BigInteger.valueOf(101));

            @SuppressWarnings("unchecked")
            ObjectProvider<OperatorTxBuilder> noBuilder = mock(ObjectProvider.class);
            @SuppressWarnings("unchecked")
            ObjectProvider<KaiaCredentials> noCredentials = mock(ObjectProvider.class);

            new ChainJobWorker(chainJobRepository, chainOwnership, stateWriter,
                    new ChainWalletQueue() {
                        @Override
                        public void submit(ChainWallet wallet, Runnable task) {
                            task.run();
                        }
                    },
                    chainClient, feeDelegationService, receiptVerifier, receiptEvents,
                    confirmations, balanceRefresher,
                    new ChainWorkerProperties(true, 1000L, 1500L, 120, 3, 20),
                    new ChainMetrics(new SimpleMeterRegistry()),
                    noBuilder, noCredentials, noCredentials,
                    mock(com.ssafy.b204.common.alert.OpsAlert.class),
                    new com.ssafy.b204.common.config.ChainProperties(null, 1001L, null, null, null, null))
                    .pollSubmittedJobs();
        }

        private String chainJobStatusOf(long chainJobId) {
            return jdbc.queryForObject("SELECT status FROM chain_job WHERE chain_job_id = ?",
                    String.class, chainJobId);
        }

        private Integer ticketCountOf(long orderId) {
            return jdbc.queryForObject("SELECT COUNT(*) FROM ticket WHERE ticket_order_id = ?",
                    Integer.class, orderId);
        }

        /** 최초 결제 tx 해시 — 두 번째 receipt 가 덮지 않아야 하는 값이다. */
        private String purchaseTxHashOf(long orderId) {
            return jdbc.queryForObject(
                    "SELECT purchase_tx_hash FROM payment WHERE ticket_order_id = ?",
                    String.class, orderId);
        }

        private String paidAtOf(long orderId) {
            return jdbc.queryForObject("SELECT paid_at FROM payment WHERE ticket_order_id = ?",
                    String.class, orderId);
        }
    }

    @Nested
    @DisplayName("openapi.yaml 대조 반영 (S15P21B204-65)")
    class OpenApiContract {

        @Test
        @DisplayName("프론트 생성 타입 그대로 kind 를 담아 보내도 동의가 통과한다 — 202")
        void ruleAgreementAcceptsGeneratedTypeBody() throws Exception {
            Agreement pending = pendingAgreement();

            // openapi 의 rule_05 본문은 SignedTxRequest 를 상속해 kind 가 필수로 생성된다
            // (openapi.ts SignedTxRequest & { teamId: number }). md 본문 표에는 kind 가 없다.
            // 전역 fail-on-unknown-properties 때문에 예전에는 이 본문이 400 이었다.
            JsonNode job = data(post("/api/v1/performances/" + pending.performanceId
                            + "/rules/agreements/signed-tx")
                            .with(bearer(pending.host.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("teamId", pending.host.teamId,
                                    "kind", "AGREE", "senderSignedRlp", pending.rlp))),
                    202);
            assertThat(job.get("agreementStatus").asText()).isEqualTo("SIGNING");
        }

        @Test
        @DisplayName("kind 는 없어도 된다 — md 본문 {teamId, senderSignedRlp} 도 그대로 통과한다")
        void ruleAgreementStillAcceptsSpecBody() throws Exception {
            Agreement pending = pendingAgreement();

            JsonNode job = data(post("/api/v1/performances/" + pending.performanceId
                            + "/rules/agreements/signed-tx")
                            .with(bearer(pending.host.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("teamId", pending.host.teamId,
                                    "senderSignedRlp", pending.rlp))),
                    202);
            assertThat(job.get("agreementStatus").asText()).isEqualTo("SIGNING");
        }

        @Test
        @DisplayName("동의가 아닌 kind 는 조용히 무시하지 않고 400 이다")
        void ruleAgreementRejectsForeignKind() throws Exception {
            Agreement pending = pendingAgreement();

            mvc.perform(post("/api/v1/performances/" + pending.performanceId
                            + "/rules/agreements/signed-tx")
                            .with(bearer(pending.host.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("teamId", pending.host.teamId,
                                    "kind", "APPROVE", "senderSignedRlp", pending.rlp))))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("COMMON_VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.data").doesNotExist());
        }

        @Test
        @DisplayName("PAYING 에서 결제를 다시 시작해도 paymentStatus 는 AWAITING_SIGNATURE 다")
        void restartAfterSubmitKeepsResponseEnum() throws Exception {
            Fixture fixture = onSalePerformance();
            long orderId = createOrder(fixture, 1);
            reportPurchase(fixture, orderId);
            assertThat(paymentStatusOf(orderId)).isEqualTo("PAYING");

            // openapi PaymentStartResult.paymentStatus 의 enum 은 AWAITING_SIGNATURE 하나뿐이다.
            // 예전에는 여기서 "PAYING" 이 그대로 나가 생성 타입이 못 받는 값이 됐다.
            JsonNode restarted = startPayment(fixture, orderId);
            assertThat(restarted.get("payments").get(0).get("paymentStatus").asText()).isEqualTo("AWAITING_SIGNATURE");
            assertThat(paymentStatusOf(orderId)).isEqualTo("AWAITING_SIGNATURE");
        }

        @Test
        @DisplayName("서명 대기 중이 아니면 abandoned 를 받지 않는다 — PAYING 은 409")
        void abandonRejectedWhileSubmitted() throws Exception {
            Fixture fixture = onSalePerformance();
            long orderId = createOrder(fixture, 1);
            reportPurchase(fixture, orderId);

            // 이미 전송된 tx 가 있는데 balanceKept:true 를 답하면 거짓말이 된다.
            mvc.perform(post("/api/v1/orders/" + orderId + "/payment/signed-tx")
                            .with(bearer(fixture.audience.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("kind", "PURCHASE", "abandoned", true))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("COMMON_CONFLICT"));
        }

        @Test
        @DisplayName("결제가 끝난 주문의 abandoned 는 PAYMENT_ALREADY_PAID 다")
        void abandonRejectedAfterPaid() throws Exception {
            Fixture fixture = onSalePerformance();
            long orderId = purchasedOrderId(fixture);

            mvc.perform(post("/api/v1/orders/" + orderId + "/payment/signed-tx")
                            .with(bearer(fixture.audience.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("kind", "PURCHASE", "abandoned", true))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("PAYMENT_ALREADY_PAID"))
                    .andExpect(jsonPath("$.data").doesNotExist());
        }

        // ------------------------------------------------------------ 보조

        /** 동의 서명까지 만들어 둔 단독 공연 — 보고 본문만 바꿔 가며 시험한다. */
        private record Agreement(Actor host, long performanceId, String rlp) {}

        private Agreement pendingAgreement() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            setTicketTypes(host, performanceId);
            String rulesHash = setRules(host, performanceId, List.of(host.teamId));
            payDeposit(host, performanceId);

            JsonNode prepare = data(post("/api/v1/performances/" + performanceId
                    + "/rules/agreements/prepare").with(bearer(host.accessToken))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("teamId", host.teamId, "rulesHash", rulesHash))));
            String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(7, host.wallet,
                    SPLITTER, prepare.get("signRequests").get(0).get("data").asText());
            return new Agreement(host, performanceId, rlp);
        }

        /** 결제 시작 → PURCHASE RLP 보고(202)까지. payment 는 PAYING 이 된다. */
        private void reportPurchase(Fixture fixture, long orderId) throws Exception {
            String purchaseData = startPayment(fixture, orderId)
                    .get("signRequests").get(1).get("data").asText();
            String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(1,
                    fixture.audience.wallet, SPLITTER, purchaseData);
            data(post("/api/v1/orders/" + orderId + "/payment/signed-tx")
                            .with(bearer(fixture.audience.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("kind", "PURCHASE", "senderSignedRlp", rlp,
                                    "orderId", orderId))),
                    202);
        }

        /** 결제 확정까지 끝낸 주문. */
        private long purchasedOrderId(Fixture fixture) throws Exception {
            JsonNode order = data(post("/api/v1/orders")
                            .with(bearer(fixture.audience.accessToken))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(orderBody(fixture, 1))), 201);
            long orderId = order.get("orderId").asLong();
            String purchaseData = startPayment(fixture, orderId)
                    .get("signRequests").get(1).get("data").asText();
            String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(1,
                    fixture.audience.wallet, SPLITTER, purchaseData);
            JsonNode job = data(post("/api/v1/orders/" + orderId + "/payment/signed-tx")
                            .with(bearer(fixture.audience.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("kind", "PURCHASE", "senderSignedRlp", rlp,
                                    "orderId", orderId))),
                    202);
            ChainJobConfirmationService.Result result = confirm(job.get("jobId").asText(),
                    SPLITTER, fixture.audience.wallet.address(), "Purchased",
                    purchasedArgs(fixture.performanceId, order.get("orders").get(0).get("orderRef").asText(),
                            fixture.audience.wallet.address(), order.get("orders").get(0).get("teamIndex").asInt(),
                            25_000L, 1L));
            assertThat(result.confirmed()).isTrue();
            return orderId;
        }

        private String paymentStatusOf(long orderId) {
            return jdbc.queryForObject(
                    "SELECT status FROM payment WHERE ticket_order_id = ?", String.class, orderId);
        }
    }

    @Nested
    @DisplayName("§9 취소·환불 + 공연 취소 (S15P21B204-73 · API-performance-12)")
    class RefundAndCancel {

        @Test
        @DisplayName("취소 → 환불액 계산 → REFUND job → 확정 시 티켓 CANCELLED·재고 반환까지 완주한다")
        void cancelTicketRoundTrip() throws Exception {
            Fixture fixture = onSalePerformance();
            List<Long> ticketIds = purchaseTickets(fixture, 2);
            long ticketId = ticketIds.get(0);
            assertThat(ticketStock.remaining(fixture.performanceId, fixture.ticketTypeId))
                    .contains(78);

            JsonNode quote = data(get("/api/v1/tickets/" + ticketId + "/refund-quote")
                    .with(bearer(fixture.audience.accessToken)));
            assertThat(quote.get("paidAmount").asLong()).isEqualTo(25_000L);
            assertThat(quote.get("feeRatePercent").asInt()).isZero();
            assertThat(quote.get("feeAmount").asLong()).isZero();
            assertThat(quote.get("refundAmount").asLong()).isEqualTo(25_000L);
            assertThat(quote.get("feeStage").asText()).isEqualTo("D-7_BEFORE");
            assertThat(quote.get("refundTarget").asText()).isEqualTo("WALLET_BALANCE");
            assertThat(quote.get("currency").asText()).isEqualTo("KRW");
            assertThat(quote.get("refundWalletAddress").asText())
                    .isEqualToIgnoringCase(fixture.audience.wallet.address());
            assertThat(quote.get("cancelDeadlineAt").asText()).isNotBlank();
            assertThat(quote.get("fullRefundUntil").asText()).isNotBlank();

            JsonNode accepted = cancelTicket(fixture, ticketId, 25_000L,
                    UUID.randomUUID().toString());
            assertThat(accepted.get("status").asText()).isEqualTo("PENDING");
            assertThat(accepted.get("signerType").asText()).isEqualTo("OPERATOR");
            assertThat(accepted.get("pollAfterMs").asInt()).isEqualTo(1500);
            assertThat(accepted.get("refundAmount").asLong()).isEqualTo(25_000L);
            assertThat(accepted.get("feeAmount").asLong()).isZero();
            assertThat(accepted.get("refundId").asLong()).isPositive();
            assertThat(accepted.get("refundTarget").asText()).isEqualTo("WALLET_BALANCE");

            // 지갑 거래 목록(API-wallet-02)은 chain_job.wallet_id 로 조회한다 — 수신 지갑을
            // 남기지 않으면 "환불했는데 내역에 없다"가 된다.
            JsonNode txs = data(get("/api/v1/wallets/me/transactions?type=REFUND")
                    .with(bearer(fixture.audience.accessToken)));
            assertThat(txs.get("items")).hasSize(1);
            assertThat(txs.get("items").get(0).get("direction").asText()).isEqualTo("IN");
            assertThat(txs.get("items").get(0).get("amount").asLong()).isEqualTo(25_000L);

            // 접수만으로는 아무것도 죽지 않는다 — 코인이 아직 움직이지 않았다.
            assertThat(ticketStatusOf(ticketId)).isEqualTo("ISSUED");
            assertThat(refundStatusOf(ticketId)).isEqualTo("PROCESSING");
            assertThat(ticketStock.remaining(fixture.performanceId, fixture.ticketTypeId))
                    .contains(78);

            ChainJobConfirmationService.Result result = confirmRefund(fixture,
                    accepted.get("jobId").asText(), orderRefOf(ticketId), 25_000L, 2L);
            assertThat(result.confirmed()).isTrue();

            assertThat(ticketStatusOf(ticketId)).isEqualTo("CANCELLED");
            assertThat(refundStatusOf(ticketId)).isEqualTo("COMPLETED");
            assertThat(soldQuantityOf(fixture.ticketTypeId)).isEqualTo(1);
            assertThat(ticketStock.remaining(fixture.performanceId, fixture.ticketTypeId))
                    .contains(79);
            // 2매 중 1매만 취소했으므로 주문은 아직 PAID 다.
            assertThat(orderStatusOf(ticketIds.get(1))).isEqualTo("PAID");
            assertThat(ticketStatusOf(ticketIds.get(1))).isEqualTo("ISSUED");
        }

        @Test
        @DisplayName("수수료 3구간 — D-7 이전 0% · D-3 이전 50% · 마감 이후 409")
        void feeStages() throws Exception {
            Fixture fixture = onSalePerformance();
            long ticketId = purchaseTickets(fixture, 1).get(0);

            // D-7 은 지났고 D-3 은 남았다 → 50%
            movePerformance(fixture.performanceId, 5);
            JsonNode half = data(get("/api/v1/tickets/" + ticketId + "/refund-quote")
                    .with(bearer(fixture.audience.accessToken)));
            assertThat(half.get("feeRatePercent").asInt()).isEqualTo(50);
            assertThat(half.get("feeAmount").asLong()).isEqualTo(12_500L);
            assertThat(half.get("refundAmount").asLong()).isEqualTo(12_500L);
            assertThat(half.get("feeStage").asText()).isEqualTo("D-3_BEFORE");

            // 취소 마감(D-3 00:00)이 지나면 미리보기도 실행도 막힌다.
            movePerformance(fixture.performanceId, 2);
            mvc.perform(get("/api/v1/tickets/" + ticketId + "/refund-quote")
                            .with(bearer(fixture.audience.accessToken)))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("REFUND_DEADLINE_PASSED"));
            mvc.perform(post("/api/v1/tickets/" + ticketId + "/cancel")
                            .with(bearer(fixture.audience.accessToken))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("expectedRefundAmount", 12_500L))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("REFUND_DEADLINE_PASSED"));
        }

        @Test
        @DisplayName("같은 멱등키 재호출은 최초 jobId 를 재생하고 환불 행을 하나만 만든다")
        void replaysSameKey() throws Exception {
            Fixture fixture = onSalePerformance();
            long ticketId = purchaseTickets(fixture, 1).get(0);
            String key = UUID.randomUUID().toString();

            JsonNode first = cancelTicket(fixture, ticketId, 25_000L, key);
            JsonNode again = cancelTicket(fixture, ticketId, 25_000L, key);

            assertThat(again.get("jobId").asText()).isEqualTo(first.get("jobId").asText());
            assertThat(again.get("refundId").asLong()).isEqualTo(first.get("refundId").asLong());
            assertThat(refundCountOf(ticketId)).isEqualTo(1);
            assertThat(jobCountOf(fixture.performanceId, "REFUND")).isEqualTo(1);
        }

        @Test
        @DisplayName("expectedRefundAmount 가 서버 재계산과 다르면 400 이다(openapi refund_02)")
        void rejectsAmountMismatch() throws Exception {
            Fixture fixture = onSalePerformance();
            long ticketId = purchaseTickets(fixture, 1).get(0);

            mvc.perform(post("/api/v1/tickets/" + ticketId + "/cancel")
                            .with(bearer(fixture.audience.accessToken))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("expectedRefundAmount", 12_500L))))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("COMMON_VALIDATION_FAILED"));
            assertThat(refundCountOf(ticketId)).isZero();
        }

        @Test
        @DisplayName("Idempotency-Key 가 없으면 400 이다(§0.8 필수 대상)")
        void requiresIdempotencyKey() throws Exception {
            Fixture fixture = onSalePerformance();
            long ticketId = purchaseTickets(fixture, 1).get(0);

            mvc.perform(post("/api/v1/tickets/" + ticketId + "/cancel")
                            .with(bearer(fixture.audience.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("expectedRefundAmount", 25_000L))))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("COMMON_VALIDATION_FAILED"));
            mvc.perform(post("/api/v1/performances/" + fixture.performanceId + "/cancel")
                            .with(bearer(fixture.host.accessToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("reason", "사정이 생겼습니다."))))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("COMMON_VALIDATION_FAILED"));
        }

        @Test
        @DisplayName("이미 접수된 티켓의 재요청은 409 REFUND_ALREADY_REQUESTED 다(ticket_id UNIQUE 없음)")
        void rejectsDuplicateRequest() throws Exception {
            Fixture fixture = onSalePerformance();
            long ticketId = purchaseTickets(fixture, 1).get(0);
            cancelTicket(fixture, ticketId, 25_000L, UUID.randomUUID().toString());

            mvc.perform(post("/api/v1/tickets/" + ticketId + "/cancel")
                            .with(bearer(fixture.audience.accessToken))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("expectedRefundAmount", 25_000L))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("REFUND_ALREADY_REQUESTED"));
            assertThat(refundCountOf(ticketId)).isEqualTo(1);
        }

        @Test
        @DisplayName("전송 전에 실패한 환불(FAILED)만 남은 표는 다시 요청할 수 있다")
        void allowsRetryAfterFailedRefund() throws Exception {
            Fixture fixture = onSalePerformance();
            long ticketId = purchaseTickets(fixture, 1).get(0);
            cancelTicket(fixture, ticketId, 25_000L, UUID.randomUUID().toString());
            long jobId = refundChainJobIdOf(ticketId);
            assertThat(refundStatusOf(ticketId)).isEqualTo("PROCESSING");

            // 2026-09-17 리허설과 같은 실패다 — 서명 전에 tx 를 만들지 못해 job 이 닫힌다.
            stateWriter.markFailed(jobId, ErrorCode.COMMON_INTERNAL_ERROR.name());

            // 전이가 같은 트랜잭션에서 돌았으니 스윕을 기다릴 필요가 없다.
            assertThat(refundStatusOf(ticketId)).isEqualTo("FAILED");

            JsonNode retried = cancelTicket(fixture, ticketId, 25_000L, UUID.randomUUID().toString());
            assertThat(retried.get("refundId").asLong()).isPositive();
            assertThat(refundCountOf(ticketId)).isEqualTo(2);
            assertThat(jobCountOf(fixture.performanceId, "REFUND")).isEqualTo(2);
        }

        @Test
        @DisplayName("스윕이 job 은 닫혔는데 PROCESSING 으로 남은 환불을 FAILED 로 닫는다")
        void sweepClosesRefundLeftProcessing() throws Exception {
            Fixture fixture = onSalePerformance();
            long ticketId = purchaseTickets(fixture, 1).get(0);
            cancelTicket(fixture, ticketId, 25_000L, UUID.randomUUID().toString());
            long jobId = refundChainJobIdOf(ticketId);

            // 전이 코드가 없던 시절의 dev 상태를 그대로 만든다 — job 만 FAILED 로 적는다.
            jdbc.update("UPDATE chain_job SET status = 'FAILED', failure_reason = ? "
                    + "WHERE chain_job_id = ?", ErrorCode.COMMON_INTERNAL_ERROR.name(), jobId);
            assertThat(refundStatusOf(ticketId)).isEqualTo("PROCESSING");

            assertThat(refundService.failRefundsWithClosedJobs()).isEqualTo(1);

            assertThat(refundStatusOf(ticketId)).isEqualTo("FAILED");
            // 두 번 돌아도 더 닫을 것이 없다.
            assertThat(refundService.failRefundsWithClosedJobs()).isZero();
        }

        @Test
        @DisplayName("스윕은 job 이 아직 열려 있는 환불을 건드리지 않는다")
        void sweepKeepsRefundWhileJobIsOpen() throws Exception {
            Fixture fixture = onSalePerformance();
            long ticketId = purchaseTickets(fixture, 1).get(0);
            cancelTicket(fixture, ticketId, 25_000L, UUID.randomUUID().toString());

            assertThat(refundService.failRefundsWithClosedJobs()).isZero();
            assertThat(refundStatusOf(ticketId)).isEqualTo("PROCESSING");
        }

        @Test
        @DisplayName("남의 티켓 미리보기·취소는 403 TICKET_NOT_OWNED 다")
        void rejectsOtherOwner() throws Exception {
            Fixture fixture = onSalePerformance();
            long ticketId = purchaseTickets(fixture, 1).get(0);
            String stranger = signInOnly();

            mvc.perform(get("/api/v1/tickets/" + ticketId + "/refund-quote")
                            .with(bearer(stranger)))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("TICKET_NOT_OWNED"));
        }

        @Test
        @DisplayName("공연 취소는 halt job 을 접수하고 판매를 즉시 닫으며 주문마다 refund job 을 만든다")
        void cancelPerformance() throws Exception {
            Fixture fixture = onSalePerformance();
            List<Long> ticketIds = purchaseTickets(fixture, 2);
            String key = UUID.randomUUID().toString();

            JsonNode accepted = cancelPerformance(fixture, key);
            assertThat(accepted.get("status").asText()).isEqualTo("PENDING");
            assertThat(accepted.get("pollAfterMs").asInt()).isEqualTo(2000);
            assertThat(accepted.get("targetTicketCount").asInt()).isEqualTo(2);
            assertThat(accepted.get("totalRefundAmount").asLong()).isEqualTo(50_000L);
            assertThat(accepted.get("currency").asText()).isEqualTo("KRW");
            assertThat(accepted.get("depositReturnPlanned").asBoolean()).isTrue();
            assertThat(accepted.get("depositAmount").asLong()).isEqualTo(DEPOSIT_AMOUNT);
            assertThat(txTypeOf(accepted.get("jobId").asText())).isEqualTo("HALT");

            assertThat(performanceStatusOf(fixture.performanceId)).isEqualTo("CANCELLED");
            // 주문 1건이므로 refund job 도 1건이다 — 온체인 refund 의 단위가 주문이다.
            assertThat(jobCountOf(fixture.performanceId, "REFUND")).isEqualTo(1);
            assertThat(refundStatusOf(ticketIds.get(0))).isEqualTo("PROCESSING");
            // 접수 시점에는 보증금 반환을 보내지 않는다(escrow != 0 이라 revert 한다).
            assertThat(jobCountOf(fixture.performanceId, "DEPOSIT_RETURN")).isZero();

            // 같은 키 재호출은 최초 jobId 재생 — refund job 이 더 생기지 않는다.
            JsonNode again = cancelPerformance(fixture, key);
            assertThat(again.get("jobId").asText()).isEqualTo(accepted.get("jobId").asText());
            assertThat(jobCountOf(fixture.performanceId, "REFUND")).isEqualTo(1);

            // 환불이 확정되면 그 주문의 티켓이 전부 죽고 보증금 반환 job 이 붙는다.
            ChainJobConfirmationService.Result result = confirmRefund(fixture,
                    refundJobIdOf(ticketIds.get(0)), orderRefOf(ticketIds.get(0)), 50_000L, 2L);
            assertThat(result.confirmed()).isTrue();
            assertThat(ticketStatusOf(ticketIds.get(0))).isEqualTo("CANCELLED");
            assertThat(ticketStatusOf(ticketIds.get(1))).isEqualTo("CANCELLED");
            assertThat(orderStatusOf(ticketIds.get(0))).isEqualTo("REFUNDED");
            assertThat(soldQuantityOf(fixture.ticketTypeId)).isZero();

            // 반환은 확정이 아니라 주기 스윕이 건다(확정 트랜잭션에서 체인을 읽지 않으려고).
            // 스윕은 취소된 공연 전부를 훑으므로 건수가 아니라 이 공연의 job 으로 단언한다.
            // halt 가 아직 확정 전이면 온체인 stage 가 SALE 이라 returnDeposit 이 revert 한다.
            confirmations.sweepCancelledDepositReturns();
            assertThat(jobCountOf(fixture.performanceId, "DEPOSIT_RETURN"))
                    .as("halt 확정 전에는 반환을 걸지 않는다").isZero();

            assertThat(confirm(accepted.get("jobId").asText(), SPLITTER, FEE_PAYER, "Halted",
                    Map.of("showId", fixture.performanceId)).confirmed()).isTrue();
            confirmations.sweepCancelledDepositReturns();
            assertThat(jobCountOf(fixture.performanceId, "DEPOSIT_RETURN")).isEqualTo(1);
        }

        @Test
        @DisplayName("halt 확정이 정산을 HALTED(종단)로 보낸다 — 정산 도메인이 -12에 맡긴 전이")
        void haltConfirmationHaltsSettlement() throws Exception {
            Fixture fixture = onSalePerformance();
            purchaseTickets(fixture, 1);
            JsonNode accepted = cancelPerformance(fixture, UUID.randomUUID().toString());
            // 집계 전(settlement 행 없음)에도 취소되므로 행이 없는 상황을 그대로 통과해야 한다.
            assertThat(settlementStatusOf(fixture.performanceId)).isNull();

            ChainJobConfirmationService.Result result = confirm(accepted.get("jobId").asText(),
                    SPLITTER, FEE_PAYER, "Halted", Map.of("showId", fixture.performanceId));

            assertThat(result.confirmed()).isTrue();
            assertThat(settlementStatusOf(fixture.performanceId)).isEqualTo("HALTED");
            // 관객 환불이 아직 PROCESSING 이라 보증금은 나가면 안 된다 — 에스크로가 남아 있어
            // returnDeposit 이 InsufficientEscrow 로 revert 한다. 훅의 PENDING·PROCESSING 검사가
            // 사라지면 이 단언이 깨진다(MR !141 자동 리뷰 🟡).
            assertThat(jobCountOf(fixture.performanceId, "DEPOSIT_RETURN"))
                    .as("환불이 끝나기 전에 보증금 반환이 먼저 걸렸다").isZero();
        }

        @Test
        @DisplayName("halt tx 가 실패하면 HALTED 로 가지 않는다 — 종단은 되돌릴 수 없다")
        void failedHaltDoesNotHaltSettlement() throws Exception {
            Fixture fixture = onSalePerformance();
            purchaseTickets(fixture, 1);
            JsonNode accepted = cancelPerformance(fixture, UUID.randomUUID().toString());
            long chainJobId = ChainJobIds.parseJobId(accepted.get("jobId").asText()).orElseThrow();

            ChainJobConfirmationService.Result result = confirmations.confirm(chainJobId,
                    TxReceipt.reverted(fakeTxHash(chainJobId), "CHAIN_TX_TIMEOUT"));

            assertThat(result.confirmed()).isFalse();
            assertThat(settlementStatusOf(fixture.performanceId)).isNull();
        }

        @Test
        @DisplayName("release 가 끝난 공연은 취소할 수 없다 — 409 SETTLEMENT_ALREADY_RELEASED")
        void rejectsCancelAfterRelease() throws Exception {
            Fixture fixture = onSalePerformance();
            purchaseTickets(fixture, 1);
            jdbc.update("INSERT INTO settlement (performance_id, status) VALUES (?, 'RELEASED')",
                    fixture.performanceId);

            mvc.perform(post("/api/v1/performances/" + fixture.performanceId + "/cancel")
                            .with(bearer(fixture.host.accessToken))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("reason", "사정이 생겼습니다."))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("SETTLEMENT_ALREADY_RELEASED"));
            assertThat(performanceStatusOf(fixture.performanceId)).isEqualTo("ON_SALE");
        }

        @Test
        @DisplayName("정산이 굳은 뒤 개별 취소는 409 REFUND_AFTER_SETTLEMENT_LOCK 이다")
        void rejectsAfterSettlementLock() throws Exception {
            Fixture fixture = onSalePerformance();
            long ticketId = purchaseTickets(fixture, 1).get(0);
            // AGGREGATED 도 막는다 — 컨트랙트가 aggregate 이후 refund 를 막기 때문이다.
            jdbc.update("INSERT INTO settlement (performance_id, status) VALUES (?, 'AGGREGATED')",
                    fixture.performanceId);

            mvc.perform(get("/api/v1/tickets/" + ticketId + "/refund-quote")
                            .with(bearer(fixture.audience.accessToken)))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("REFUND_AFTER_SETTLEMENT_LOCK"));
        }

        @Test
        @DisplayName("보증금을 안 낸 판매 전(DRAFT) 공연 취소는 409 PERFORMANCE_INVALID_STATUS 다")
        void rejectsCancelBeforeSale() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);

            mvc.perform(post("/api/v1/performances/" + performanceId + "/cancel")
                            .with(bearer(host.accessToken))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("reason", "사정이 생겼습니다."))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("PERFORMANCE_INVALID_STATUS"));
        }

        /**
         * S15P21B204-140 — 판매 전에 버려진 공연의 보증금 회수 경로.
         *
         * <p>리허설 2 의 공연 11 이 {@code PENDING_AGREEMENT} · 보증금 {@code PAID} 로 묶여
         * 온체인 에스크로에 50,000 이 남았다. 이 경로가 열려야 회수할 수 있다.
         *
         * <p>재는 것이 셋이다 — ① 판매 전이라도 보증금이 {@code PAID} 면 접수한다 ② 환불이
         * 0건이라 refund 확정이 오지 않으므로 <b>halt 확정</b>이 {@code DEPOSIT_RETURN} job 을
         * 건다 ③ 그 job 확정이 {@code deposit_status} 를 실제로 {@code RETURNED} 로 바꾼다
         * (정산은 이미 {@code HALTED} 라 예전에는 반영이 물러났다 — S15P21B204-154).
         */
        @Test
        @DisplayName("보증금을 낸 판매 전 공연 취소는 halt 확정 뒤 보증금을 반환한다")
        void cancelBeforeSaleReturnsDeposit() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            setTicketTypes(host, performanceId);
            setRules(host, performanceId, List.of(host.teamId));
            payDeposit(host, performanceId);
            assertThat(performanceStatusOf(performanceId)).isEqualTo("PENDING_AGREEMENT");
            assertThat(depositStatusOf(performanceId)).isEqualTo("PAID");

            JsonNode accepted = data(post("/api/v1/performances/" + performanceId + "/cancel")
                    .with(bearer(host.accessToken))
                    .header("Idempotency-Key", UUID.randomUUID().toString())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("reason", "판매 전에 접었습니다."))), 202);
            assertThat(txTypeOf(accepted.get("jobId").asText())).isEqualTo("HALT");
            assertThat(accepted.get("targetTicketCount").asInt()).isZero();
            assertThat(accepted.get("totalRefundAmount").asLong()).isZero();
            assertThat(accepted.get("depositReturnPlanned").asBoolean()).isTrue();
            assertThat(accepted.get("depositAmount").asLong()).isEqualTo(DEPOSIT_AMOUNT);
            assertThat(performanceStatusOf(performanceId)).isEqualTo("CANCELLED");
            // 환불 대상이 0건이라 refund job 이 없다 — 접수 시점에는 반환도 아직이다.
            assertThat(jobCountOf(performanceId, "REFUND")).isZero();
            assertThat(jobCountOf(performanceId, "DEPOSIT_RETURN")).isZero();

            ChainJobConfirmationService.Result halted = confirm(accepted.get("jobId").asText(),
                    SPLITTER, FEE_PAYER, "Halted", Map.of("showId", performanceId));
            assertThat(halted.confirmed()).isTrue();
            assertThat(settlementStatusOf(performanceId)).isEqualTo("HALTED");
            confirmations.sweepCancelledDepositReturns();
            assertThat(jobCountOf(performanceId, "DEPOSIT_RETURN")).isEqualTo(1);

            String returnJobId = ChainJobIds.toJobId(jobIdOf(performanceId, "DEPOSIT_RETURN"));
            assertThat(confirm(returnJobId, SPLITTER, FEE_PAYER, "DepositReturned",
                    Map.of("showId", performanceId, "to", host.wallet.address(),
                            "amount", DEPOSIT_AMOUNT)).confirmed()).isTrue();
            // 확정만으로는 안 바뀐다 — 반영은 정산 도메인의 훑기다(평소엔 스케줄러).
            assertThat(settlementConfirmations.applyConfirmedJobs()).isPositive();
            assertThat(depositStatusOf(performanceId)).isEqualTo("RETURNED");
        }

        /**
         * MR !141 자동 리뷰 🔴 — <b>취소가 startSale 확정에 덮이면 안 된다.</b>
         *
         * <p>판매 전 취소가 열리면서(위 테스트) 새로 생긴 자리다. {@code START_SALE} 은 접수
         * 시점에 status 를 {@code PENDING_AGREEMENT} 로 둔 채 job 만 걸므로, 그 job 이
         * {@code SUBMITTED} 인 동안 취소가 통과한다. 워커는 {@code chain_job_id} 오름차순이라
         * <b>startSale 확정이 halt 보다 먼저</b> 온다.
         *
         * <p>종전에는 {@code confirmStartSale} 이 {@code markOnSale()} 을 무조건 불러
         * {@code CANCELLED} 를 {@code ON_SALE} 로 덮었다. 그러면 뒤이은 halt 확정의
         * {@code returnDepositIfCancelledAndDrained} 가 "취소 아님"으로 물러나 보증금이 다시
         * 묶인다 — 이 MR 이 풀려던 상태 그대로다.
         *
         * <p>온체인은 {@code SALE → HALTED} 로 이어져 판매가 열리지 않는다
         * ({@code RevenueSplitter.sol:894} 의 halt 는 {@code RELEASED}·{@code HALTED} 만 거부).
         * 그래서 막을 자리는 접수가 아니라 <b>DB 를 되살리는 쓰기</b> 한 곳이다.
         */
        @Test
        @DisplayName("취소 뒤 도착한 startSale 확정은 공연을 되살리지 않는다 — 보증금도 돌아온다")
        void startSaleConfirmAfterCancelKeepsCancelled() throws Exception {
            Actor host = signUp(200_000L);
            long performanceId = createPerformance(host, false);
            setTicketTypes(host, performanceId);
            String rulesHash = setRules(host, performanceId, List.of(host.teamId));
            payDeposit(host, performanceId);
            agree(host, performanceId, rulesHash, 7);

            // 판매 시작 접수 — job 만 걸리고 status 는 아직 PENDING_AGREEMENT 다.
            JsonNode startSale = data(post("/api/v1/performances/" + performanceId + "/sale/start")
                    .with(bearer(host.accessToken)).contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("rulesHash", rulesHash))), 202);
            assertThat(performanceStatusOf(performanceId)).isEqualTo("PENDING_AGREEMENT");

            JsonNode cancelled = data(post("/api/v1/performances/" + performanceId + "/cancel")
                    .with(bearer(host.accessToken))
                    .header("Idempotency-Key", UUID.randomUUID().toString())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("reason", "판매 시작 직전에 접었습니다."))), 202);
            assertThat(performanceStatusOf(performanceId)).isEqualTo("CANCELLED");

            // 워커 순서 그대로 — startSale 이 먼저 확정된다.
            assertThat(confirm(startSale.get("jobId").asText(), SPLITTER, FEE_PAYER, "SaleStarted",
                    Map.of("showId", performanceId, "rulesHash", rulesHash)).confirmed()).isTrue();
            assertThat(performanceStatusOf(performanceId))
                    .as("취소된 공연이 startSale 확정으로 되살아났다").isEqualTo("CANCELLED");

            // 그래서 스윕이 이 공연을 반환 대상으로 본다(되살아났다면 CANCELLED 가 아니라 빠진다).
            assertThat(confirm(cancelled.get("jobId").asText(), SPLITTER, FEE_PAYER, "Halted",
                    Map.of("showId", performanceId)).confirmed()).isTrue();
            confirmations.sweepCancelledDepositReturns();
            assertThat(jobCountOf(performanceId, "DEPOSIT_RETURN"))
                    .as("되살아난 상태에서는 반환 job 이 걸리지 않는다").isEqualTo(1);
        }

        /**
         * MR !141 자동 리뷰 🔴(2차) — <b>표 수로 세면 입장한 공연이 묶인다.</b>
         *
         * <p>{@code cancelTickets} 는 {@code ISSUED} 만 {@code CANCELLED} 로 바꾼다. 입장 스캔이
         * 있었던 {@code USED} 표는 전 건 환불이 확정돼 에스크로가 0 이 된 뒤에도 그대로 남으므로,
         * "살아 있는 표가 있으면 미룬다"는 판정이면 보증금이 영영 {@code PAID} 로 묶인다.
         * {@code ENDED} 공연 취소는 명세가 허용하는 정상 경로다.
         *
         * <p>그래서 훅은 표가 아니라 <b>남은 환불 가능액</b>을 본다
         * ({@code RefundService.outstandingRefundAmount}).
         */
        @Test
        @DisplayName("입장한 표가 있어도 환불이 끝나면 보증금이 돌아온다")
        void usedTicketDoesNotBlockDepositReturn() throws Exception {
            Fixture fixture = onSalePerformance();
            List<Long> ticketIds = purchaseTickets(fixture, 2);
            // 검표 흐름은 §10 이 검증한다 — 여기서는 "입장한 표가 남아 있다"는 상태만 만든다.
            jdbc.update("UPDATE ticket SET status = 'USED', entered_at = ? WHERE ticket_id = ?",
                    LocalDateTime.now(), ticketIds.get(0));

            JsonNode accepted = cancelPerformance(fixture, UUID.randomUUID().toString());
            assertThat(confirmRefund(fixture, refundJobIdOf(ticketIds.get(1)),
                    orderRefOf(ticketIds.get(1)), 50_000L, 2L).confirmed()).isTrue();
            assertThat(ticketStatusOf(ticketIds.get(0)))
                    .as("환불 확정은 USED 표를 건드리지 않는다").isEqualTo("USED");

            assertThat(confirm(accepted.get("jobId").asText(), SPLITTER, FEE_PAYER, "Halted",
                    Map.of("showId", fixture.performanceId)).confirmed()).isTrue();
            confirmations.sweepCancelledDepositReturns();
            assertThat(jobCountOf(fixture.performanceId, "DEPOSIT_RETURN"))
                    .as("입장한 표 때문에 보증금 반환이 막혔다").isEqualTo(1);
        }

        /**
         * MR !141 자동 리뷰 🔴 — <b>환불 0건은 "에스크로가 비었다"가 아니다.</b>
         *
         * <p>취소 접수 시 {@code planPerformanceCancel} 은 {@code PAID} 주문만 담는다
         * ({@code RefundService:213}). 그때 {@code PENDING_PAYMENT} 였던 주문의
         * {@code PURCHASE} 가 halt 보다 먼저 확정되면(job id 오름차순) <b>티켓이 발권되고
         * 에스크로가 남는데 환불 행은 0건</b>이다.
         *
         * <p>그 상태로 보증금 반환을 걸면 {@code returnDeposit} 이 {@code InsufficientEscrow} 로
         * revert 하고, 멱등키가 공연당 하나로 고정이라 죽은 job 이 영영 재생된다
         * (S15P21B204-156). 그래서 훅이 <b>살아 있는 표</b>를 직접 센다.
         */
        @Test
        @DisplayName("취소 뒤 확정된 구매가 표를 남기면 보증금 반환을 미룬다")
        void latePurchaseAfterCancelHoldsDepositReturn() throws Exception {
            Fixture fixture = onSalePerformance();

            // 결제 보고까지만 한다 — 취소 접수 시점에 이 주문은 PENDING_PAYMENT 다.
            JsonNode order = data(post("/api/v1/orders").with(bearer(fixture.audience.accessToken))
                    .header("Idempotency-Key", UUID.randomUUID().toString())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json(orderBody(fixture, 1))), 201);
            long orderId = order.get("orderId").asLong();
            String orderRef = order.get("orders").get(0).get("orderRef").asText();
            int teamIndex = order.get("orders").get(0).get("teamIndex").asInt();
            JsonNode payment = startPayment(fixture, orderId);
            String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(1,
                    fixture.audience.wallet, SPLITTER,
                    payment.get("signRequests").get(1).get("data").asText());
            JsonNode purchaseJob = data(post("/api/v1/orders/" + orderId + "/payment/signed-tx")
                    .with(bearer(fixture.audience.accessToken))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("kind", "PURCHASE", "senderSignedRlp", rlp,
                            "orderId", orderId))), 202);

            JsonNode cancelled = cancelPerformance(fixture, UUID.randomUUID().toString());
            assertThat(jobCountOf(fixture.performanceId, "REFUND"))
                    .as("PENDING_PAYMENT 주문은 환불 계획에 들어가지 않는다").isZero();

            // 워커 순서 그대로 — 구매가 먼저 확정돼 표가 발권된다.
            assertThat(confirm(purchaseJob.get("jobId").asText(), SPLITTER,
                    fixture.audience.wallet.address(), "Purchased",
                    purchasedArgs(fixture.performanceId, orderRef,
                            fixture.audience.wallet.address(), teamIndex, 25_000L, 1))
                    .issuedTicketIds()).hasSize(1);

            assertThat(confirm(cancelled.get("jobId").asText(), SPLITTER, FEE_PAYER, "Halted",
                    Map.of("showId", fixture.performanceId)).confirmed()).isTrue();
            confirmations.sweepCancelledDepositReturns();
            assertThat(jobCountOf(fixture.performanceId, "DEPOSIT_RETURN"))
                    .as("에스크로에 결제분이 남아 있는데 보증금 반환이 걸렸다 — revert 뒤 영구 동결이다")
                    .isZero();
        }

        // ------------------------------------------------------------ 보조

        private JsonNode cancelTicket(Fixture fixture, long ticketId, long expected, String key)
                throws Exception {
            return data(post("/api/v1/tickets/" + ticketId + "/cancel")
                    .with(bearer(fixture.audience.accessToken))
                    .header("Idempotency-Key", key)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("expectedRefundAmount", expected,
                            "reason", "일정 변경"))), 202);
        }

        private JsonNode cancelPerformance(Fixture fixture, String key) throws Exception {
            return data(post("/api/v1/performances/" + fixture.performanceId + "/cancel")
                    .with(bearer(fixture.host.accessToken))
                    .header("Idempotency-Key", key)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("reason", "공연장 사정으로 취소되었습니다."))), 202);
        }

        /**
         * 워커가 {@code Refunded} 로그를 파싱해 넘기는 자리를 그대로 부른다.
         *
         * <p>인자는 계약 §4.3 그대로다 — {@code buyer}는 <b>결제한 지갑</b>이고 컨트랙트가
         * {@code p.buyer}로 고정한다(서버가 주소를 넘기지 않는다).
         */
        private ChainJobConfirmationService.Result confirmRefund(Fixture fixture, String jobId,
                                                                  String orderRef, long amount,
                                                                  long quantity) {
            Map<String, Object> args = new LinkedHashMap<>();
            args.put("showId", fixture.performanceId);
            args.put("orderRef", orderRef);
            args.put("buyer", fixture.audience.wallet.address());
            args.put("refundAmount", amount);
            args.put("quantity", quantity);
            return confirm(jobId, SPLITTER, FEE_PAYER, "Refunded", args);
        }

        /** 공연 일시를 옮긴다 — 취소 마감(D-3 00:00)도 함께 다시 계산한다(P-8). */
        private void movePerformance(long performanceId, int daysFromNow) {
            LocalDateTime at = LocalDateTime.now(
                    com.ssafy.b204.common.support.TimeSupport.STORAGE_ZONE).plusDays(daysFromNow);
            DateTimeFormatter format = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
            jdbc.update("UPDATE performance SET performance_at = ?, cancel_deadline_at = ? "
                            + "WHERE performance_id = ?",
                    at.format(format),
                    at.toLocalDate().minusDays(3).atStartOfDay().format(format), performanceId);
        }

        private String ticketStatusOf(long ticketId) {
            return jdbc.queryForObject("SELECT status FROM ticket WHERE ticket_id = ?",
                    String.class, ticketId);
        }

        private String orderStatusOf(long ticketId) {
            return jdbc.queryForObject("SELECT o.status FROM ticket_order o JOIN ticket t "
                            + "ON t.ticket_order_id = o.ticket_order_id WHERE t.ticket_id = ?",
                    String.class, ticketId);
        }

        private String orderRefOf(long ticketId) {
            return jdbc.queryForObject("SELECT o.order_ref FROM ticket_order o JOIN ticket t "
                            + "ON t.ticket_order_id = o.ticket_order_id WHERE t.ticket_id = ?",
                    String.class, ticketId);
        }

        private String refundStatusOf(long ticketId) {
            return jdbc.queryForObject("SELECT r.status FROM refund r JOIN ticket t "
                            + "ON t.ticket_order_id = r.ticket_order_id WHERE t.ticket_id = ? "
                            + "ORDER BY r.refund_id DESC LIMIT 1", String.class, ticketId);
        }

        /** 숫자 {@code chain_job_id} — {@code stateWriter}·직접 UPDATE 가 이 값을 받는다. */
        private long refundChainJobIdOf(long ticketId) {
            Long id = jdbc.queryForObject("SELECT r.chain_job_id FROM refund r "
                            + "JOIN ticket t ON t.ticket_order_id = r.ticket_order_id "
                            + "WHERE t.ticket_id = ? ORDER BY r.refund_id DESC LIMIT 1",
                    Long.class, ticketId);
            return id == null ? 0L : id;
        }

        private String refundJobIdOf(long ticketId) {
            Long chainJobId = jdbc.queryForObject("SELECT r.chain_job_id FROM refund r "
                            + "JOIN ticket t ON t.ticket_order_id = r.ticket_order_id "
                            + "WHERE t.ticket_id = ? ORDER BY r.refund_id DESC LIMIT 1",
                    Long.class, ticketId);
            return ChainJobIds.toJobId(chainJobId);
        }

        private int refundCountOf(long ticketId) {
            Integer count = jdbc.queryForObject(
                    "SELECT count(*) FROM refund WHERE ticket_id = ?", Integer.class, ticketId);
            return count == null ? 0 : count;
        }

        private int soldQuantityOf(long ticketTypeId) {
            Integer sold = jdbc.queryForObject(
                    "SELECT sold_quantity FROM ticket_type WHERE ticket_type_id = ?",
                    Integer.class, ticketTypeId);
            return sold == null ? 0 : sold;
        }

        private int jobCountOf(long performanceId, String txType) {
            Integer count = jdbc.queryForObject("SELECT count(*) FROM chain_job "
                            + "WHERE target_performance_id = ? AND tx_type = ?", Integer.class,
                    performanceId, txType);
            return count == null ? 0 : count;
        }

        private String txTypeOf(String jobId) {
            return jdbc.queryForObject("SELECT tx_type FROM chain_job WHERE chain_job_id = ?",
                    String.class, ChainJobIds.parseJobId(jobId).orElseThrow());
        }

        /** 정산 행이 없으면 {@code null} — -12 는 집계 전에도 가능하다. */
        private String settlementStatusOf(long performanceId) {
            List<String> rows = jdbc.queryForList(
                    "SELECT status FROM settlement WHERE performance_id = ?", String.class,
                    performanceId);
            return rows.isEmpty() ? null : rows.get(0);
        }

        private String performanceStatusOf(long performanceId) {
            return jdbc.queryForObject("SELECT status FROM performance WHERE performance_id = ?",
                    String.class, performanceId);
        }

        private String depositStatusOf(long performanceId) {
            return jdbc.queryForObject(
                    "SELECT deposit_status FROM performance WHERE performance_id = ?",
                    String.class, performanceId);
        }

        private Long jobIdOf(long performanceId, String txType) {
            return jdbc.queryForObject("SELECT chain_job_id FROM chain_job "
                            + "WHERE target_performance_id = ? AND tx_type = ?", Long.class,
                    performanceId, txType);
        }
    }

    // ================================================================ 픽스처

    @Nested
    @DisplayName("API-recommendation-01 시간대 (§0.6)")
    class RecommendationTimezone {

        /**
         * 추천은 회원 전용이라 서버가 그 회원의 시간대를 이미 안다. 알면서 기본 시간대로 내리면
         * 같은 응답의 {@code rate.asOf}와 {@code items[].startAt}이 서로 다른 오프셋이 된다.
         */
        @Test
        @DisplayName("추천 항목의 startAt 은 회원 시간대를 따르고, 공개 목록은 기본 시간대를 쓴다")
        void recommendationUsesMemberTimezone() throws Exception {
            Fixture fixture = onSalePerformance();
            String access = fixture.audience.accessToken;

            data(patch("/api/v1/members/me").with(bearer(access))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("timezone", "America/Los_Angeles"))));

            JsonNode recommended = data(get("/api/v1/recommendations/performances")
                    .with(bearer(access)));
            assertThat(recommended.get("items")).isNotEmpty();
            ZoneOffset expected = ZoneId.of("America/Los_Angeles").getRules()
                    .getOffset(Instant.now());
            assertThat(OffsetDateTime
                    .parse(recommended.get("items").get(0).get("startAt").asText()).getOffset())
                    .isEqualTo(expected);

            // 공개 목록은 GUEST 도 부르므로 회원 시간대를 쓸 수 없다 — 기본 시간대 그대로다.
            JsonNode listed = data(get("/api/v1/performances").with(bearer(access)));
            assertThat(OffsetDateTime
                    .parse(listed.get("items").get(0).get("startAt").asText()).getOffset())
                    .isEqualTo(com.ssafy.b204.common.support.TimeSupport
                            .toOffset(LocalDateTime.now(), null).getOffset())
                    .isNotEqualTo(expected);
        }
    }

    @Nested
    @DisplayName("재고 부재·대사·만료 한도 (2026-09-26)")
    class StockRecovery {

        private String stockKey(Fixture fixture) {
            return TicketStock.KEY_PREFIX + fixture.performanceId;
        }

        private Object rawStock(Fixture fixture) {
            return redis.opsForHash().get(stockKey(fixture), String.valueOf(fixture.ticketTypeId));
        }

        // ------------------------------------------------------------ ① reserve 필드 부재

        @Test
        @DisplayName("재고 필드가 없으면 DB 기대값(total - sold - 결제 대기)으로 깔고 차감한다")
        void missingFieldIsInitializedFromDatabase() throws Exception {
            Fixture fixture = onSalePerformance();
            createOrder(fixture, 2); // 결제 대기 2
            redis.opsForHash().delete(stockKey(fixture), String.valueOf(fixture.ticketTypeId));

            createOrder(fixture, 1);

            // 80 - 0(sold) - 2(대기) = 78 로 깔린 뒤 1을 뺐다. 예전 코드는 여기서 "0"을 남기고 매진이었다.
            assertThat(ticketStock.remaining(fixture.performanceId, fixture.ticketTypeId))
                    .contains(77);
        }

        @Test
        @DisplayName("재고가 모자라면 실패하되 기존 값을 그대로 둔다 — \"0\"으로 굳지 않는다")
        void shortageKeepsExistingValue() throws Exception {
            Fixture fixture = onSalePerformance();
            redis.opsForHash().put(stockKey(fixture), String.valueOf(fixture.ticketTypeId), "1");

            mvc.perform(post("/api/v1/orders").with(bearer(fixture.audience.accessToken))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(orderBody(fixture, 2))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("TICKET_SOLD_OUT"));

            assertThat(rawStock(fixture)).isEqualTo("1");
            // 남은 1매는 여전히 살 수 있다.
            createOrder(fixture, 1);
            assertThat(rawStock(fixture)).isEqualTo("0");
        }

        @Test
        @DisplayName("두 요청이 동시에 부재를 봐도 기준값은 한 번만 깔린다(HSETNX)")
        void concurrentInitializationHappensOnce() throws Exception {
            Fixture fixture = onSalePerformance();
            redis.delete(stockKey(fixture));

            CyclicBarrier barrier = new CyclicBarrier(2);
            ExecutorService pool = Executors.newFixedThreadPool(2);
            List<Boolean> results = new ArrayList<>();
            try {
                Callable<Boolean> task = () -> {
                    barrier.await(20, TimeUnit.SECONDS);
                    return ticketStock.reserve(fixture.performanceId,
                            Map.of(fixture.ticketTypeId, 1));
                };
                for (Future<Boolean> future : pool.invokeAll(List.of(task, task))) {
                    results.add(future.get(30, TimeUnit.SECONDS));
                }
            } finally {
                pool.shutdownNow();
            }

            assertThat(results).containsExactly(true, true);
            // 두 번 깔렸다면 79 다.
            assertThat(ticketStock.remaining(fixture.performanceId, fixture.ticketTypeId))
                    .contains(78);
        }

        // ------------------------------------------------------------ ② 대사

        @Test
        @DisplayName("대사 — Redis \"0\"으로 굳은 재고를 DB 기대값으로 되돌린다")
        void reconcileRepairsStuckZero() throws Exception {
            Fixture fixture = onSalePerformance();
            redis.opsForHash().put(stockKey(fixture), String.valueOf(fixture.ticketTypeId), "0");

            stockReconciler.reconcile(Duration.ZERO);

            assertThat(ticketStock.remaining(fixture.performanceId, fixture.ticketTypeId))
                    .contains(80);
            JsonNode detail = data(get("/api/v1/performances/" + fixture.performanceId));
            assertThat(detail.get("ticketTypes").get(0).get("remainingQuantity").asInt())
                    .isEqualTo(80);
        }

        @Test
        @DisplayName("대사 — 결제 대기 수량을 빼고 맞춘다")
        void reconcileSubtractsPendingOrders() throws Exception {
            Fixture fixture = onSalePerformance();
            createOrder(fixture, 2);
            redis.opsForHash().put(stockKey(fixture), String.valueOf(fixture.ticketTypeId), "0");

            stockReconciler.reconcile(Duration.ZERO);

            assertThat(ticketStock.remaining(fixture.performanceId, fixture.ticketTypeId))
                    .contains(78);
        }

        @Test
        @DisplayName("대사 — 일치하면 건드리지 않는다")
        void reconcileLeavesConsistentStockAlone() throws Exception {
            Fixture fixture = onSalePerformance();
            createOrder(fixture, 3);
            assertThat(rawStock(fixture)).isEqualTo("77");

            stockReconciler.reconcile(Duration.ZERO);

            assertThat(rawStock(fixture)).isEqualTo("77");
        }

        @Test
        @DisplayName("대사 — 관측한 값에서 움직였으면 덮지 않는다(비교 후 교체)")
        void compareAndSetRefusesMovedValue() throws Exception {
            Fixture fixture = onSalePerformance();
            redis.opsForHash().put(stockKey(fixture), String.valueOf(fixture.ticketTypeId), "5");

            assertThat(ticketStock.compareAndSet(fixture.performanceId, fixture.ticketTypeId,
                    4, 80)).isFalse();
            assertThat(rawStock(fixture)).isEqualTo("5");
            assertThat(ticketStock.compareAndSet(fixture.performanceId, fixture.ticketTypeId,
                    5, 80)).isTrue();
            assertThat(rawStock(fixture)).isEqualTo("80");
        }

        // ------------------------------------------------------------ ③ 1인 한도

        @Test
        @DisplayName("결제 시한이 지난 대기 주문은 스윕 전이라도 1인 한도에서 빠진다")
        void expiredPendingOrderDoesNotCountTowardLimit() throws Exception {
            Fixture fixture = onSalePerformance();
            long first = createOrder(fixture, 4);
            jdbc.update("UPDATE ticket_order SET payment_expires_at = ? WHERE ticket_order_id = ?",
                    LocalDateTime.now(com.ssafy.b204.common.support.TimeSupport.STORAGE_ZONE)
                            .minusMinutes(1)
                            .format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")),
                    first);
            // 스윕 전 — 아직 PENDING_PAYMENT 다.
            assertThat(jdbc.queryForObject(
                    "SELECT status FROM ticket_order WHERE ticket_order_id = ?", String.class,
                    first)).isEqualTo("PENDING_PAYMENT");

            long second = createOrder(fixture, 4);
            assertThat(second).isNotEqualTo(first);
        }

        @Test
        @DisplayName("한도 초과 문구는 누적(결제 대기 포함)과 1회 상한을 구분한다 — 코드는 같다")
        void limitMessagesDistinguishReason() throws Exception {
            Fixture fixture = onSalePerformance();
            createOrder(fixture, 3);
            mvc.perform(post("/api/v1/orders").with(bearer(fixture.audience.accessToken))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(orderBody(fixture, 2))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("TICKET_PURCHASE_LIMIT_EXCEEDED"))
                    .andExpect(jsonPath("$.msg").value(org.hamcrest.Matchers.containsString(
                            "결제 대기 3매")));

            Fixture other = onSalePerformance();
            mvc.perform(post("/api/v1/orders").with(bearer(other.audience.accessToken))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("performanceId", other.performanceId,
                                    "items", List.of(
                                            Map.of("ticketTypeId", other.ticketTypeId,
                                                    "quantity", 3,
                                                    "chosenTeamId", other.host.teamId),
                                            Map.of("ticketTypeId", other.ticketTypeId,
                                                    "quantity", 2,
                                                    "chosenTeamId", other.guestTeam.teamId)),
                                    "totalAmount", 125_000))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("TICKET_PURCHASE_LIMIT_EXCEEDED"))
                    .andExpect(jsonPath("$.msg").value(org.hamcrest.Matchers.containsString(
                            "한 번에 최대 4매")));
        }
    }

    private record Actor(long memberId, String accessToken, TestWallet wallet, long walletId,
                         long teamId, String teamName) {}

    private record Fixture(Actor host, Actor guestTeam, Actor audience, long performanceId,
                           long ticketTypeId) {}

    /** {@code ON_SALE} 상태의 공동 공연 하나 + 잔액을 가진 관객 하나. */
    private Fixture onSalePerformance() throws Exception {
        Actor host = signUp(200_000L);
        Actor guestTeam = signUp(0L);
        Actor audience = signUp(100_000L);
        long performanceId = createPerformance(host, true);

        data(post("/api/v1/performances/" + performanceId + "/participants")
                .with(bearer(host.accessToken)).contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("teamId", guestTeam.teamId))), 201);
        data(post("/api/v1/performances/" + performanceId + "/participants/" + guestTeam.teamId
                + "/accept").with(bearer(guestTeam.accessToken)));

        long ticketTypeId = setTicketTypes(host, performanceId);
        String rulesHash = setRules(host, performanceId, List.of(host.teamId, guestTeam.teamId));
        payDeposit(host, performanceId);
        agree(host, performanceId, rulesHash, 5);
        agree(guestTeam, performanceId, rulesHash, 5);

        JsonNode startSale = data(post("/api/v1/performances/" + performanceId + "/sale/start")
                .with(bearer(host.accessToken)).contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("rulesHash", rulesHash))), 202);
        confirm(startSale.get("jobId").asText(), SPLITTER, FEE_PAYER, "SaleStarted",
                Map.of("showId", performanceId, "rulesHash", rulesHash));

        return new Fixture(host, guestTeam, audience, performanceId, ticketTypeId);
    }

    private long createPerformance(Actor host, boolean joint) throws Exception {
        OffsetDateTime startAt = OffsetDateTime.now(ZoneOffset.ofHours(9)).plusDays(20).withNano(0);
        JsonNode created = data(post("/api/v1/performances").with(bearer(host.accessToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "hostTeamId", host.teamId,
                                "title", "테스트 공연 " + UUID.randomUUID(),
                                "venueName", "합정 언플러그드",
                                "venueAddress", "서울 마포구 양화로 000",
                                "startAt", startAt.toString(),
                                "endAt", startAt.plusHours(3).toString(),
                                "jointPerformance", joint))),
                201);
        return created.get("performanceId").asLong();
    }

    private long setTicketTypes(Actor host, long performanceId) throws Exception {
        JsonNode options = data(put("/api/v1/performances/" + performanceId + "/ticket-types")
                .with(bearer(host.accessToken)).contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("ticketTypes", List.of(
                        Map.of("name", "일반", "price", 25000, "totalQuantity", 80))))));
        return options.get("ticketTypes").get(0).get("ticketTypeId").asLong();
    }

    private void payDeposit(Actor host, long performanceId) throws Exception {
        JsonNode prepare = data(post("/api/v1/performances/" + performanceId + "/deposit/prepare")
                .with(bearer(host.accessToken)));
        // 프론트처럼 선행 createShow 확정을 기다린 뒤 서명한다 - 미등록이면 보고가 409 다.
        if (prepare.hasNonNull("prerequisiteJobId")) {
            confirmCreateShow(performanceId);
        }
        String data = prepare.get("signRequests").get(1).get("data").asText();
        String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(0, host.wallet,
                SPLITTER, data);
        JsonNode job = data(post("/api/v1/performances/" + performanceId + "/deposit/signed-tx")
                        .with(bearer(host.accessToken)).contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("kind", "DEPOSIT", "senderSignedRlp", rlp))),
                202);
        confirm(job.get("jobId").asText(), SPLITTER, host.wallet.address(), "DepositPaid",
                Map.of("showId", performanceId, "from", host.wallet.address(),
                        "amount", DEPOSIT_AMOUNT));
    }

    private String setRules(Actor host, long performanceId, List<Long> teamIds) throws Exception {
        return setRules(host, performanceId, teamIds, 6000, 4000);
    }

    private String setRules(Actor host, long performanceId, List<Long> teamIds, int fixedBp,
                            int selectionBp) throws Exception {
        List<Map<String, Object>> shares = new ArrayList<>();
        int each = 10_000 / teamIds.size();
        for (int i = 0; i < teamIds.size(); i++) {
            int shareBp = i == teamIds.size() - 1 ? 10_000 - each * (teamIds.size() - 1) : each;
            shares.add(Map.of("teamId", teamIds.get(i), "shareBp", shareBp));
        }
        JsonNode rule = data(put("/api/v1/performances/" + performanceId + "/rules")
                .with(bearer(host.accessToken)).contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("fixedRatioBp", fixedBp, "selectionRatioBp", selectionBp,
                        "teamShares", shares))));
        return rule.get("rulesHash").asText();
    }

    private void agree(Actor actor, long performanceId, String rulesHash, long nonce)
            throws Exception {
        JsonNode prepare = data(post("/api/v1/performances/" + performanceId
                + "/rules/agreements/prepare").with(bearer(actor.accessToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("teamId", actor.teamId, "rulesHash", rulesHash))));
        JsonNode signRequest = prepare.get("signRequests").get(0);
        assertThat(signRequest.get("kind").asText()).isEqualTo("AGREE");
        // agreeToRules(uint256,bytes32) selector — 계약 문서 §8
        assertThat(signRequest.get("data").asText()).startsWith("0x344c0bbf");

        String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(nonce, actor.wallet,
                SPLITTER, signRequest.get("data").asText());
        JsonNode job = data(post("/api/v1/performances/" + performanceId
                        + "/rules/agreements/signed-tx").with(bearer(actor.accessToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("teamId", actor.teamId, "senderSignedRlp", rlp))),
                202);
        assertThat(job.get("agreementStatus").asText()).isEqualTo("SIGNING");
        confirm(job.get("jobId").asText(), SPLITTER, actor.wallet.address(), "RulesAgreed",
                Map.of("showId", performanceId, "team", actor.wallet.address(),
                        "rulesHash", rulesHash));
    }

    // ================================================================ 검표 준비(§10)

    /** 결제까지 끝난 티켓과 검표 토큰. 입장 시간대는 기본으로 열어 둔다. */
    private record EntryContext(Actor host, Actor guestTeam, Actor audience, long performanceId,
                                List<Long> ticketIds, String entryToken) {}

    private EntryContext entryReady(int quantity) throws Exception {
        return entryReady(quantity, true);
    }

    /**
     * {@code ON_SALE} 공연 → 주문 → 결제 → {@code Purchased} 확정 → 티켓 발급 → 검표 링크 발급.
     *
     * @param openWindow 공연 일시를 "지금부터 10분 뒤"로 옮겨 입장 시간대를 열지 여부
     */
    private EntryContext entryReady(int quantity, boolean openWindow) throws Exception {
        Fixture fixture = onSalePerformance();
        List<Long> ticketIds = purchaseTickets(fixture, quantity);
        String entryToken = data(get("/api/v1/performances/" + fixture.performanceId
                + "/entry-link").with(bearer(fixture.host.accessToken)))
                .get("entryToken").asText();
        if (openWindow) {
            openEntryWindow(fixture.performanceId);
        }
        return new EntryContext(fixture.host, fixture.guestTeam, fixture.audience,
                fixture.performanceId, ticketIds, entryToken);
    }

    /** 주문 → 결제 시작 → 서명 tx 보고 → receipt 확정. 반환은 발급된 티켓 id. */
    private List<Long> purchaseTickets(Fixture fixture, int quantity) throws Exception {
        JsonNode order = data(post("/api/v1/orders").with(bearer(fixture.audience.accessToken))
                        .header("Idempotency-Key", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(orderBody(fixture, quantity))), 201);
        long orderId = order.get("orderId").asLong();
        String orderRef = order.get("orders").get(0).get("orderRef").asText();
        int teamIndex = order.get("orders").get(0).get("teamIndex").asInt();

        JsonNode payment = startPayment(fixture, orderId);
        String purchaseData = payment.get("signRequests").get(1).get("data").asText();
        String rlp = KaiaTxBuilder.feeDelegatedSmartContractExecution(1,
                fixture.audience.wallet, SPLITTER, purchaseData);
        JsonNode job = data(post("/api/v1/orders/" + orderId + "/payment/signed-tx")
                        .with(bearer(fixture.audience.accessToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("kind", "PURCHASE", "senderSignedRlp", rlp,
                                "orderId", orderId))),
                202);
        ChainJobConfirmationService.Result result = confirm(job.get("jobId").asText(), SPLITTER,
                fixture.audience.wallet.address(), "Purchased",
                purchasedArgs(fixture.performanceId, orderRef, fixture.audience.wallet.address(),
                        teamIndex, 25_000L * quantity, quantity));
        assertThat(result.confirmed()).isTrue();
        assertThat(result.issuedTicketIds()).hasSize(quantity);
        return result.issuedTicketIds();
    }

    /**
     * 공연을 "지금부터 10분 뒤"로 옮긴다.
     *
     * <p>판매 마감(시작 −1시간)과 입장 시작(시작 −60분)이 같은 시각이라 <b>판매가 열려 있는 동안은
     * 입장 시간대가 열릴 수 없다.</b> 그래서 결제를 마친 뒤 시간을 옮기는 것이 유일한 방법이다.
     * 문자열로 넘겨 JVM 기본 시각대의 개입을 없앤다 — 저장 기준은 KST다
     * ({@code hibernate.jdbc.time_zone}).
     */
    private void openEntryWindow(long performanceId) {
        String at = LocalDateTime.now(com.ssafy.b204.common.support.TimeSupport.STORAGE_ZONE)
                .plusMinutes(10).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        jdbc.update("UPDATE performance SET performance_at = ? WHERE performance_id = ?", at,
                performanceId);
    }

    /** 발급 시 1회 생성된 HMAC 키. 임의 윈도우의 토큰을 만들어 경계를 시험한다. */
    private String qrSecretOf(long ticketId) {
        return jdbc.queryForObject("SELECT qr_secret FROM ticket WHERE ticket_id = ?", String.class,
                ticketId);
    }

    /** API-ticket-06 으로 받은 현재 윈도우 토큰. */
    private String qrTokenOf(EntryContext ctx, long ticketId) throws Exception {
        return data(get("/api/v1/tickets/" + ticketId + "/qr")
                .with(bearer(ctx.audience.accessToken))).get("qrToken").asText();
    }

    /**
     * 30초 윈도우 경계에서 테스트가 흔들리지 않게 창의 앞부분까지 기다린다 — {@code window - 1}이
     * 검증 시점에 {@code window - 2}가 되면 정상 토큰이 만료로 읽힌다.
     */
    private static void settleInWindow() throws InterruptedException {
        long secondInWindow = Instant.now().getEpochSecond() % QrTokens.WINDOW_SECONDS;
        if (secondInWindow > 20) {
            Thread.sleep((QrTokens.WINDOW_SECONDS - secondInWindow + 1) * 1000);
        }
    }

    private JsonNode scan(String entryToken, long performanceId, String qrToken) throws Exception {
        return data(entryRequest(entryToken, performanceId, qrToken));
    }

    /**
     * API-entry-01 요청. {@code entryToken}이 {@code null}이면 헤더를 붙이지 않는다(회원 경로).
     *
     * <p>호출마다 <b>다른 클라이언트 IP</b>를 쓴다 — 한도(60회/분)가 IP 단위라 테스트끼리
     * 버킷을 공유하면 뒤 테스트가 429로 죽는다. 한도 자체를 검증하는 테스트만 IP를 고정한다.
     */
    private MockHttpServletRequestBuilder entryRequest(String entryToken, long performanceId,
                                                        String qrToken) {
        MockHttpServletRequestBuilder request = post("/api/v1/entries/verify")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("performanceId", performanceId, "qrToken", qrToken)))
                .with(fromIp("198.51.100." + (int) (Math.random() * 250 + 1)));
        return entryToken == null ? request : request.header("X-Entry-Token", entryToken);
    }

    private static RequestPostProcessor fromIp(String ip) {
        return request -> {
            request.setRemoteAddr(ip);
            return request;
        };
    }

    private Map<String, Object> orderBody(Fixture fixture, int quantity) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("performanceId", fixture.performanceId);
        body.put("items", List.of(Map.of("ticketTypeId", fixture.ticketTypeId,
                "quantity", quantity, "chosenTeamId", fixture.guestTeam.teamId)));
        body.put("totalAmount", 25_000L * quantity);
        return body;
    }

    /** {@code fixture.audience} 가 아닌 회원으로 주문한다 — 남의 RLP 재보고 검증용. */
    private long createOrderAs(Actor actor, Fixture fixture, int quantity) throws Exception {
        JsonNode order = data(post("/api/v1/orders").with(bearer(actor.accessToken))
                        .header("Idempotency-Key", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(orderBody(fixture, quantity))), 201);
        return order.get("orderId").asLong();
    }

    private JsonNode startPaymentAs(Actor actor, long orderId) throws Exception {
        return data(post("/api/v1/orders/" + orderId + "/payment")
                .with(bearer(actor.accessToken))
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON));
    }

    /** {@code Approval(owner, spender, value)} — 계약 §4.4 대조 항목 2개가 여기 들어간다. */
    private static Map<String, Object> approvalArgs(String owner, String spender, long value) {
        Map<String, Object> args = new LinkedHashMap<>();
        args.put("owner", owner);
        args.put("spender", spender);
        args.put("value", value);
        return args;
    }

    private long createOrder(Fixture fixture, int quantity) throws Exception {
        JsonNode order = data(post("/api/v1/orders").with(bearer(fixture.audience.accessToken))
                        .header("Idempotency-Key", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(orderBody(fixture, quantity))), 201);
        return order.get("orderId").asLong();
    }

    private JsonNode startPayment(Fixture fixture, long orderId) throws Exception {
        return data(post("/api/v1/orders/" + orderId + "/payment")
                .with(bearer(fixture.audience.accessToken))
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON));
    }

    private String purchaseCalldataOf(Fixture fixture, long orderId) throws Exception {
        return startPayment(fixture, orderId).get("signRequests").get(1).get("data").asText();
    }

    /** {@code Purchased(showId, orderRef, buyer, teamIndex, amount, quantity)} 인자 6개. */
    private static Map<String, Object> purchasedArgs(long showId, String orderRef, String buyer,
                                                     int teamIndex, long amount, long quantity) {
        Map<String, Object> args = new LinkedHashMap<>();
        args.put("showId", showId);
        args.put("orderRef", orderRef);
        args.put("buyer", buyer);
        args.put("teamIndex", (long) teamIndex);
        args.put("amount", amount);
        args.put("quantity", quantity);
        return args;
    }

    /** 체인 워커가 receipt를 받아 하는 일을 그대로 부른다(§0.4 ④⑤). */
    private ChainJobConfirmationService.Result confirm(String jobId, String to, String from,
                                                       String eventName,
                                                       Map<String, Object> args) {
        long chainJobId = ChainJobIds.parseJobId(jobId).orElseThrow();
        TxReceipt receipt = new TxReceipt(fakeTxHash(chainJobId), true, to, from, 1L,
                List.of(new TxReceipt.TxEvent(eventName, args)));
        return confirmations.confirm(chainJobId, receipt);
    }

    /**
     * 체인 워커가 할 일: {@code createShow} 확정 → 온체인 stage {@code CREATED}
     * (S15P21B204-67). job 은 규칙 동의 prepare(API-rule-03)에서 이미 걸려 있다.
     */
    private void confirmCreateShow(long performanceId) {
        Long chainJobId = jdbc.queryForObject(
                "SELECT chain_job_id FROM chain_job WHERE idempotency_key = ?", Long.class,
                "createShow:" + performanceId);
        List<String> wallets = jdbc.queryForList(
                "SELECT wallet_address FROM performance_participant WHERE performance_id = ?"
                        + " AND on_chain_index IS NOT NULL ORDER BY on_chain_index",
                String.class, performanceId);
        confirm(ChainJobIds.toJobId(chainJobId), SPLITTER, FEE_PAYER, "ShowCreated",
                Map.of("showId", performanceId,
                        "teamWallets", String.join(",", wallets).toLowerCase(Locale.ROOT),
                        "hostTeamIndex", 0L));
    }

    private int startSaleJobCount(long performanceId) {
        Integer count = jdbc.queryForObject(
                "SELECT count(*) FROM chain_job WHERE tx_type = 'START_SALE'"
                        + " AND target_performance_id = ?", Integer.class, performanceId);
        return count == null ? 0 : count;
    }

    private static String fakeTxHash(long seed) {
        return "0x" + String.format("%064x", seed);
    }

    // ================================================================ 회원 준비

    /** 로그인 → 지갑 등록 → 팀 생성 + 잔액 캐시 주입(체인 워커가 할 일을 대신한다). */
    private Actor signUp(long balance) throws Exception {
        TestWallet wallet = TestWallet.random();
        String id = UUID.randomUUID().toString().substring(0, 8);
        JsonNode login = data(post("/api/v1/auth/web3auth")
                // §0.9 로그인 한도는 IP당 60회/분이다 — 테스트마다 다른 IP 를 쓴다.
                .with(fromIp("198.51.100." + (int) (Math.random() * 250 + 1)))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of(
                        "idToken", WEB3AUTH.idToken("verifier-" + id, id + "@example.com",
                                "Tester " + id, wallet.address()),
                        "address", wallet.address(),
                        "provider", "GOOGLE",
                        "countryCode", "KR",
                        "locale", "ko",
                        "displayCurrency", "KRW",
                        "timezone", "Asia/Seoul",
                        "termsAgreed", true,
                        "privacyAgreed", true))));
        String accessToken = login.get("accessToken").asText();

        JsonNode registered = data(post("/api/v1/wallets").with(bearer(accessToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("provider", "WEB3AUTH", "address", wallet.address()))),
                202);
        long walletId = registered.get("wallet").get("walletId").asLong();

        String teamName = "팀-" + id;
        JsonNode team = data(post("/api/v1/teams").with(bearer(accessToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("teamName", teamName, "genre", "ETC"))), 201);

        if (balance > 0) {
            putBalance(walletId, balance);
        }
        return new Actor(login.get("memberId").asLong(), accessToken, wallet, walletId,
                team.get("teamId").asLong(), teamName);
    }

    /** 지갑을 등록하지 않은 회원의 access token. */
    private String signInOnly() throws Exception {
        TestWallet wallet = TestWallet.random();
        String id = UUID.randomUUID().toString().substring(0, 8);
        JsonNode login = data(post("/api/v1/auth/web3auth")
                // §0.9 로그인 한도는 IP당 60회/분이다 — 테스트마다 다른 IP 를 쓴다.
                .with(fromIp("198.51.100." + (int) (Math.random() * 250 + 1)))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of(
                        "idToken", WEB3AUTH.idToken("verifier-" + id, id + "@example.com",
                                "Tester " + id, wallet.address()),
                        "address", wallet.address(),
                        "provider", "GOOGLE",
                        "countryCode", "KR",
                        "termsAgreed", true,
                        "privacyAgreed", true))));
        return login.get("accessToken").asText();
    }

    /** §0.12 갱신 시점 ② — 체인 워커가 chain_job 확정 시 하는 일이다. */
    private void putBalance(long walletId, long balance) {
        redis.opsForHash().put(RedisConfig.KEY_WALLET_BALANCE, String.valueOf(walletId),
                balance + "|" + System.currentTimeMillis());
    }

    // ================================================================ MockMvc 보조

    private JsonNode data(MockHttpServletRequestBuilder request) throws Exception {
        return data(request, 200);
    }

    private JsonNode data(MockHttpServletRequestBuilder request, int expectedStatus)
            throws Exception {
        MvcResult result = mvc.perform(request)
                .andExpect(status().is(expectedStatus))
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("data");
    }

    private String json(Map<String, ?> value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static RequestPostProcessor bearer(String accessToken) {
        return request -> {
            request.addHeader(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken);
            return request;
        };
    }
}
