package com.ssafy.b204.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ssafy.b204.admin.dto.AdminDtos.DisputeItem;
import com.ssafy.b204.admin.dto.AdminDtos.DisputeListResponse;
import com.ssafy.b204.admin.dto.AdminDtos.ResolveDisputeRequest;
import com.ssafy.b204.admin.dto.AdminDtos.ResolveDisputeResponse;
import com.ssafy.b204.admin.service.AdminDisputeService;
import com.ssafy.b204.audit.entity.AuditLog;
import com.ssafy.b204.audit.repository.AuditLogRepository;
import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.performance.repository.PerformanceRepository;
import com.ssafy.b204.settlement.FakeSettlementChainReader;
import com.ssafy.b204.settlement.SettlementTestFixture;
import com.ssafy.b204.settlement.dto.SettlementDtos.DisputeRequest;
import com.ssafy.b204.settlement.entity.Settlement;
import com.ssafy.b204.settlement.repository.SettlementChainJobRepository;
import com.ssafy.b204.settlement.repository.SettlementRepository;
import com.ssafy.b204.settlement.repository.SettlementShareRepository;
import com.ssafy.b204.settlement.service.SettlementCalculator;
import com.ssafy.b204.settlement.service.SettlementConfirmationService;
import com.ssafy.b204.settlement.service.SettlementGates;
import com.ssafy.b204.settlement.service.SettlementService;
import com.ssafy.b204.common.security.JwtTokenProvider;
import com.ssafy.b204.support.Bearer;
import com.ssafy.b204.support.IntegrationTestBase;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import com.ssafy.b204.team.entity.Team;
import jakarta.validation.Validator;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * admin 이의제기 API 통합 테스트 — API-admin-09·06(S15P21B204-74).
 *
 * <p>고정하는 것은 <b>계약</b>과 <b>판정 일치</b> 둘이다.
 *
 * <ul>
 *   <li>계약 — openapi {@code data}가 {@code summary}·{@code items}·{@code pageInfo} 3키이고
 *       item이 14필드다. 프론트 타입이 openapi에서 생성되므로 필드 하나가 늘거나 줄면 화면이 깨진다.
 *   <li>판정 일치 — 관리자가 이의를 {@code REJECTED}로 처리한 뒤의 {@code releaseHeld}가
 *       {@link SettlementGates#release} 판정과 <b>같은 결론</b>이어야 한다. 갈리면 "관리자 화면에서는
 *       처리 가능인데 release는 막히는" 상태가 난다.
 * </ul>
 */
@AutoConfigureMockMvc
class AdminDisputeApiTest extends IntegrationTestBase {

    @Autowired AdminDisputeService adminDisputeService;
    @Autowired SettlementService settlementService;
    @Autowired SettlementConfirmationService confirmationService;
    @Autowired SettlementGates gates;
    @Autowired SettlementRepository settlementRepository;
    @Autowired SettlementShareRepository settlementShareRepository;
    @Autowired SettlementChainJobRepository chainJobRepository;
    @Autowired PerformanceRepository performanceRepository;
    @Autowired AuditLogRepository auditLogRepository;
    @Autowired SettlementTestFixture fixture;
    @Autowired FakeSettlementChainReader chain;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired Validator validator;
    @Autowired MockMvc mvc;
    @Autowired JwtTokenProvider tokens;

    private SettlementTestFixture.World world;
    private MemberPrincipal hostLeader;
    private MemberPrincipal admin;

    @BeforeEach
    void setUp() {
        chain.reset();
        world = fixture.createWorld(5000, 5000, new int[]{3334, 3333, 3333});
        hostLeader = principal(world.hostLeader());
        admin = new MemberPrincipal(world.outsider().getMemberId(), world.outsider().getEmail(),
                true, null);
    }

    // ================================================================ API-admin-09

    @Test
    @DisplayName("응답이 openapi shape 그대로다 — data 3키 · item 14필드")
    void listShapeMatchesOpenapi() {
        assertThat(DisputeListResponse.class.getRecordComponents()).hasSize(3);
        assertThat(DisputeItem.class.getRecordComponents()).hasSize(14);
        assertThat(ResolveDisputeResponse.class.getRecordComponents()).hasSize(6);
        // haltSettlement 를 지웠다 — 명세에 없고 HALTED 전이는 API-performance-12 의 몫이다.
        assertThat(ResolveDisputeRequest.class.getRecordComponents()).hasSize(2);

        locked();
        fileDispute(1);

        DisputeListResponse response = list(null, performanceId());

        assertThat(response.summary().openCount()).isEqualTo(1);
        assertThat(response.summary().releaseHeldCount()).isEqualTo(1);
        assertThat(response.pageInfo().page()).isZero();
        DisputeItem item = response.items().get(0);
        assertThat(item.disputeId()).isNotNull();
        assertThat(item.performanceId()).isEqualTo(performanceId());
        assertThat(item.performanceTitle()).isEqualTo(world.performance().getTitle());
        assertThat(item.teamId()).isEqualTo(world.teams().get(1).getTeamId());
        assertThat(item.teamName()).isEqualTo(world.teams().get(1).getName());
        assertThat(item.status()).isEqualTo("OPEN");
        assertThat(item.reason()).isNotBlank();
        assertThat(item.currency()).isEqualTo("KRW");
        assertThat(item.settlementStatus()).isEqualTo("DISPUTE_OPEN");
        // 마감 시각의 출처는 markLocked 가 세운 settlement.dispute_deadline_at 하나다.
        assertThat(item.disputeClosesAt()).isNotNull();
        assertThat(item.disputeClosesAt().toLocalDateTime())
                .isEqualTo(settlement().getDisputeDeadlineAt());
        assertThat(item.releaseHeld()).isTrue();
        assertThat(item.createdAt()).isNotNull();
        assertThat(item.resolvedAt()).isNull();
        // expectedAmount 는 ERD 에 저장 컬럼이 없다(D-15) — openapi 가 nullable 이라 null 로 나간다.
        assertThat(item.expectedAmount()).isNull();
    }

    /**
     * 위 테스트는 {@code adminDisputeService} 를 직접 부른다 — 실제 HTTP 응답 JSON 은 본 적이 없다.
     * 한 번은 MockMvc 로 친다(M-02 이의 대기열이 통째로 이 응답 하나로 그려진다). 명세 대조·덤프는
     * {@code LiveApiSpecRecorder} 가 한다.
     */
    @Test
    @DisplayName("HTTP 로도 한 번 친다 — 이의 대기열 실물 JSON")
    void listOverHttp() throws Exception {
        locked();
        fileDispute(1);

        mvc.perform(get("/api/v1/admin/disputes")
                        .with(Bearer.of(tokens, world.outsider(), true))
                        .param("performanceId", String.valueOf(performanceId())))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("기본 정렬은 미처리 우선·오래된 순 — release 보류를 풀어야 하는 건이 위로 온다")
    void defaultSortIsOpenFirstThenOldest() {
        locked();
        Long oldest = fileDispute(0);
        Long middle = fileDispute(1);
        Long newest = fileDispute(2);
        submittedAt(oldest, LocalDateTime.now().minusHours(3));
        submittedAt(middle, LocalDateTime.now().minusHours(2));
        submittedAt(newest, LocalDateTime.now().minusHours(1));
        // 가장 오래된 건을 처리하면 그것이 맨 아래로 내려간다 — 미처리가 먼저다.
        resolve(oldest, "REJECTED");

        List<DisputeItem> items = list(null, performanceId()).items();

        assertThat(items).extracting(DisputeItem::disputeId)
                .containsExactly(middle, newest, oldest);
    }

    @Test
    @DisplayName("status·performanceId 필터")
    void filters() {
        locked();
        Long mine = fileDispute(1);
        resolve(fileDispute(2), "RESOLVED");

        SettlementTestFixture.World other = fixture.createWorld(5000, 5000, new int[]{10000});

        assertThat(list("OPEN", performanceId()).items()).extracting(DisputeItem::disputeId)
                .containsExactly(mine);
        assertThat(list("RESOLVED", performanceId()).items()).hasSize(1);
        assertThat(list("REJECTED", performanceId()).items()).isEmpty();
        assertThat(list(null, performanceId()).items()).hasSize(2);
        // 다른 공연으로 좁히면 이 공연의 이의는 보이지 않는다.
        assertThat(list(null, other.performance().getPerformanceId()).items()).isEmpty();
        // summary 는 status 필터와 무관하게 미처리 기준으로 센다("얼마나 남았는가").
        assertThat(list("RESOLVED", performanceId()).summary().openCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("허용 밖 status·sort, size 100 초과는 COMMON_VALIDATION_FAILED")
    void rejectsBadListParams() {
        assertCode(ErrorCode.COMMON_VALIDATION_FAILED,
                () -> list("CLOSED", null));
        assertCode(ErrorCode.COMMON_VALIDATION_FAILED, () -> adminDisputeService.disputes(
                admin, null, null, PageRequest.of(0, 20, Sort.by("submittedAt"))));
        assertCode(ErrorCode.COMMON_VALIDATION_FAILED, () -> adminDisputeService.disputes(
                admin, null, null, PageRequest.of(0, 101)));
        // 명세의 정렬 필드 이름은 그대로 통과한다.
        adminDisputeService.disputes(admin, null, null,
                PageRequest.of(0, 20, Sort.by("disputeClosesAt")));
        adminDisputeService.disputes(admin, null, null, PageRequest.of(0, 20, Sort.by("createdAt")));
    }

    @Test
    @DisplayName("ADMIN이 아니면 COMMON_FORBIDDEN, 인증이 없으면 COMMON_UNAUTHORIZED")
    void requiresAdmin() {
        assertCode(ErrorCode.COMMON_FORBIDDEN,
                () -> adminDisputeService.disputes(hostLeader, null, null, PageRequest.of(0, 20)));
        assertCode(ErrorCode.COMMON_UNAUTHORIZED,
                () -> adminDisputeService.disputes(null, null, null, PageRequest.of(0, 20)));
        locked();
        Long disputeId = fileDispute(1);
        assertCode(ErrorCode.COMMON_FORBIDDEN, () -> adminDisputeService.resolveDispute(
                hostLeader, disputeId, new ResolveDisputeRequest("REJECTED", comment())));
    }

    // ================================================================ API-admin-06

    @Test
    @DisplayName("REJECTED 처리로 releaseHeld가 풀리고, 그 결론이 release 게이트와 같다")
    void rejectReleasesTheHold() {
        locked();
        Long disputeId = fileDispute(1);
        fixture.expireDisputeDeadline(settlement().getSettlementId());

        // 처리 전 — 화면은 "보류 중"이라 하고 게이트도 실행을 막는다.
        assertThat(firstItem(disputeId).releaseHeld()).isTrue();
        assertThat(releaseGate()).isPresent()
                .get().extracting(SettlementGates.Blocked::code)
                .isEqualTo(ErrorCode.SETTLEMENT_DISPUTE_PERIOD);

        ResolveDisputeResponse response = resolve(disputeId, "REJECTED");

        assertThat(response.disputeId()).isEqualTo(disputeId);
        assertThat(response.performanceId()).isEqualTo(performanceId());
        assertThat(response.teamId()).isEqualTo(world.teams().get(1).getTeamId());
        assertThat(response.status()).isEqualTo("REJECTED");
        assertThat(response.releaseHeld()).isFalse();
        assertThat(response.resolvedAt()).isNotNull();
        assertThat(firstItem(disputeId).releaseHeld()).isFalse();
        assertThat(list(null, performanceId()).summary().releaseHeldCount()).isZero();
        // 이 카드의 완료 기준 — 관리자 화면 판정과 실행 게이트가 갈리지 않는다.
        assertThat(releaseGate()).isEmpty();
        // 상태만 바꿨다. 온체인 tx 도, HALTED 전이도 이 API 가 만들지 않는다.
        assertThat(settlement().getStatus()).isEqualTo(Settlement.Status.DISPUTE_OPEN);
    }

    @Test
    @DisplayName("이의가 여럿이면 하나를 처리해도 보류는 남는다 — 게이트도 같이 막는다")
    void remainingOpenDisputeKeepsTheHold() {
        locked();
        Long first = fileDispute(1);
        fileDispute(2);
        fixture.expireDisputeDeadline(settlement().getSettlementId());

        assertThat(resolve(first, "RESOLVED").releaseHeld()).isTrue();
        assertThat(releaseGate()).isPresent();
    }

    @Test
    @DisplayName("이미 처리된 이의를 다시 처리하면 COMMON_CONFLICT")
    void alreadyResolvedIsConflict() {
        locked();
        Long disputeId = fileDispute(1);
        resolve(disputeId, "RESOLVED");

        assertCode(ErrorCode.COMMON_CONFLICT, () -> resolve(disputeId, "REJECTED"));
    }

    @Test
    @DisplayName("release 완료된 정산의 이의는 SETTLEMENT_ALREADY_RELEASED")
    void releasedSettlementIsConflict() {
        locked();
        Long disputeId = fileDispute(1);
        jdbcTemplate.update("UPDATE settlement SET status='RELEASED', released_at=NOW(6) "
                + "WHERE settlement_id = ?", settlement().getSettlementId());

        assertCode(ErrorCode.SETTLEMENT_ALREADY_RELEASED, () -> resolve(disputeId, "REJECTED"));
    }

    @Test
    @DisplayName("존재하지 않는 disputeId는 COMMON_NOT_FOUND — 전용 코드를 만들지 않는다")
    void unknownDisputeIsNotFound() {
        assertCode(ErrorCode.COMMON_NOT_FOUND, () -> resolve(999_999_999L, "REJECTED"));
    }

    @Test
    @DisplayName("adminComment는 10~1000자 — 9자는 검증에서 걸린다(openapi minLength)")
    void adminCommentLength() {
        assertThat(validator.validate(new ResolveDisputeRequest("REJECTED", "아".repeat(9))))
                .isNotEmpty();
        assertThat(validator.validate(new ResolveDisputeRequest("REJECTED", "아".repeat(10))))
                .isEmpty();
        assertThat(validator.validate(new ResolveDisputeRequest("REJECTED", "아".repeat(1001))))
                .isNotEmpty();
        assertThat(validator.validate(new ResolveDisputeRequest("HALTED", comment()))).isNotEmpty();
    }

    @Test
    @DisplayName("처리 1건당 ADMIN_ACTION 감사 로그 1행 — 분쟁의 근거다")
    void writesAdminActionAuditLog() {
        locked();
        Long disputeId = fileDispute(1);

        resolve(disputeId, "REJECTED");

        List<AuditLog> logs = auditLogRepository
                .findByResourceTypeAndResourceId("dispute", disputeId, PageRequest.of(0, 10))
                .getContent();
        assertThat(logs).hasSize(1);
        assertThat(logs.get(0).getActionType()).isEqualTo(AuditLog.ActionType.ADMIN_ACTION);
        assertThat(logs.get(0).getActor().getMemberId()).isEqualTo(admin.memberId());
        assertThat(logs.get(0).getRequestSummary()).contains("REJECTED");
    }

    // ================================================================ 도우미

    private DisputeListResponse list(String status, Long performanceId) {
        return adminDisputeService.disputes(admin, status, performanceId, PageRequest.of(0, 20));
    }

    private DisputeItem firstItem(Long disputeId) {
        return list(null, performanceId()).items().stream()
                .filter(item -> item.disputeId().equals(disputeId))
                .findFirst().orElseThrow();
    }

    private ResolveDisputeResponse resolve(Long disputeId, String status) {
        return adminDisputeService.resolveDispute(admin, disputeId,
                new ResolveDisputeRequest(status, comment()));
    }

    /**
     * {@code SettlementGates#release} 판정 — 관리자 화면이 같은 결론을 보여야 한다.
     *
     * <p>요청자를 {@code admin}으로 둔다. 트랜잭션 밖에서 게이트를 직접 부르므로
     * {@code performance.creatorTeam} 지연 로딩을 타면 안 되고, 관리자 화면의 실제 시점과도 같다.
     */
    private java.util.Optional<SettlementGates.Blocked> releaseGate() {
        Settlement settlement = settlement();
        return gates.release(admin,
                performanceRepository.findById(performanceId()).orElseThrow(),
                settlement,
                settlementShareRepository.findBySettlement_SettlementId(
                        settlement.getSettlementId()),
                true, LocalDateTime.now());
    }

    private Long fileDispute(int teamIndex) {
        Team team = world.teams().get(teamIndex);
        return settlementService.dispute(principal(world.leaders().get(teamIndex)), performanceId(),
                new DisputeRequest(team.getTeamId(),
                        "관객 선택 집계가 현장 티켓 수와 맞지 않습니다. 재확인 요청합니다.", 320_000L))
                .disputeId();
    }

    private void submittedAt(Long disputeId, LocalDateTime at) {
        jdbcTemplate.update("UPDATE dispute SET submitted_at = ? WHERE dispute_id = ?",
                at, disputeId);
    }

    private static String comment() {
        return "온체인 카운터와 서버 집계가 일치하며 재확인 결과 이상이 없어 기각합니다.";
    }

    private void assertCode(ErrorCode expected, Runnable call) {
        assertThatThrownBy(call::run)
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(expected);
    }

    // 정산을 LOCKED 까지 밀어 올린다 — 이의는 잠긴 뒤에만 접수된다.
    private void locked() {
        fixture.placeOrder(world, fixture.createAudience(), world.teams().get(0), 3, 10_000L, 0);
        fixture.placeOrder(world, fixture.createAudience(), world.teams().get(1), 2, 10_000L, 0);
        fixture.placeOrder(world, fixture.createAudience(), world.teams().get(2), 1, 10_000L, 0);
        chain.escrow = 60_000L;
        chain.counts = new long[]{3, 2, 1};
        // 확정 반영이 서버 분배액과 온체인 payouts 를 대조한다 — 같은 계산식을 태워 준다.
        chain.payouts = new SettlementCalculator()
                .calculate(60_000L, 5000, 5000, new int[]{3334, 3333, 3333}, chain.counts, 0)
                .shares().stream().mapToLong(share -> share.totalAmount()).toArray();

        settlementService.aggregate(hostLeader, performanceId());
        confirmJob(ChainJob.TxType.AGGREGATE);
        confirmationService.applyConfirmedJobs();
        settlementService.lock(hostLeader, performanceId());
        confirmJob(ChainJob.TxType.LOCK);
        confirmationService.applyConfirmedJobs();
    }

    /** 워커가 하는 일(전송 → receipt 검증 → CONFIRMED)을 대신한다. */
    private void confirmJob(ChainJob.TxType txType) {
        ChainJob job = chainJobRepository.findAll().stream()
                .filter(j -> j.getTxType() == txType
                        && performanceId().equals(j.getTargetPerformanceId())
                        && j.getStatus() == ChainJob.Status.PENDING)
                .reduce((a, b) -> b)
                .orElseThrow(() -> new IllegalStateException(txType + " job 이 없다"));
        job.markConfirmed("0x" + UUID.randomUUID().toString().replace("-", "")
                + UUID.randomUUID().toString().replace("-", ""), 1);
        chainJobRepository.save(job);
    }

    private Long performanceId() {
        return world.performance().getPerformanceId();
    }

    private Settlement settlement() {
        return settlementRepository.findByPerformance_PerformanceId(performanceId()).orElseThrow();
    }

    private MemberPrincipal principal(Member member) {
        return MemberPrincipal.of(member.getMemberId(), member.getEmail(), member.isAdmin());
    }
}
