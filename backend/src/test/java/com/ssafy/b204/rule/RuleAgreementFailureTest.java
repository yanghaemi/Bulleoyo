package com.ssafy.b204.rule;

import static org.assertj.core.api.Assertions.assertThat;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.chain.service.ChainJobConfirmationService;
import com.ssafy.b204.chain.service.TxReceipt;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.repository.PerformanceRepository;
import com.ssafy.b204.rule.entity.RuleAgreement;
import com.ssafy.b204.rule.repository.RuleAgreementRepository;
import com.ssafy.b204.rule.service.RuleService;
import com.ssafy.b204.settlement.SettlementTestFixture;
import com.ssafy.b204.support.IntegrationTestBase;
import com.ssafy.b204.team.entity.Team;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * AGREE job 이 실패하면 규칙 동의는 {@code SIGNING} 에 남지 않는다 — 장부 D-81.
 *
 * <p>rule_05 명세가 "검증 실패는 {@code PENDING} 으로 되돌리고 {@code chain_job} 을
 * {@code FAILED} 로 고정한다" 인데 코드는 job 만 닫았다. 남은 {@code SIGNING} 은 P-06 의
 * {@code nextAction} 을 {@code WAIT} 로 굳혀 화면이 "서명 확인 중" 에서 멈추고 재서명도 막는다 —
 * 그 팀 하나 때문에 판매 시작({@code RULE_NOT_AGREED_BY_ALL})까지 닫힌다.
 *
 * <p>전송 실패 경로({@code ChainJobStateWriter})는 {@code ChainJobStateWriterTest} 가 본다. 여기는
 * <b>확정 실패 경로와 스윕</b>이다 — 둘 다 실제 DB 행이 있어야 판정이 성립해서 통합 테스트다.
 *
 * <p>세계는 {@link SettlementTestFixture} 를 빌려 쓴다(규칙 해시가 이미 들어 있다). 체인은
 * 부르지 않는다 — {@link TxReceipt} 를 직접 만들어 확정 경로에 넣는다.
 */
class RuleAgreementFailureTest extends IntegrationTestBase {

    /** 픽스처가 심는 {@code settlement_rule.rules_hash}. */
    private static final String RULES_HASH = "0x" + "ab".repeat(32);
    /** 서명 대기 중 규칙이 바뀐 상황 — 이벤트가 나르는 옛 해시다. */
    private static final String STALE_HASH = "0x" + "cd".repeat(32);
    private static final String TX_HASH = "0x" + "ef".repeat(32);

    @Autowired SettlementTestFixture fixture;
    @Autowired RuleService ruleService;
    @Autowired ChainJobConfirmationService confirmations;
    @Autowired RuleAgreementRepository ruleAgreementRepository;
    @Autowired ChainJobRepository chainJobRepository;
    @Autowired PerformanceRepository performanceRepository;
    @Autowired JdbcTemplate jdbc;

    private SettlementTestFixture.World world;

    @BeforeEach
    void setUp() {
        world = fixture.createWorld(5000, 5000, new int[]{5000, 5000});
    }

    // ================================================================ 확정 실패 경로

    @Test
    @DisplayName("rulesHash 가 어긋난 AGREE 확정은 job 을 FAILED 로 닫고 동의를 PENDING 으로 되돌린다")
    void confirmFailureRevertsAgreement() {
        long jobId = agreeJob(world.host());
        RuleAgreement agreement = signingAgreement(world.host(), jobId);

        ChainJobConfirmationService.Result result = confirmations.confirm(jobId,
                rulesAgreed(STALE_HASH));

        assertThat(result.confirmed()).isFalse();
        assertThat(result.failureReason()).isEqualTo(ErrorCode.RULE_HASH_MISMATCH.getCode());
        assertThat(chainJobRepository.findById(jobId).orElseThrow().getStatus())
                .isEqualTo(ChainJob.Status.FAILED);
        // P-06 이 다시 "우리 팀 동의하기" 를 연다(rule_02 nextAction = SIGN).
        assertThat(reload(agreement).getStatus()).isEqualTo(RuleAgreement.Status.PENDING);
        assertThat(reload(agreement).getChainJobId()).isNull();
    }

    @Test
    @DisplayName("기대 이벤트가 없는 AGREE 확정도 동의를 PENDING 으로 되돌린다")
    void confirmWithoutEventRevertsAgreement() {
        long jobId = agreeJob(world.host());
        RuleAgreement agreement = signingAgreement(world.host(), jobId);

        ChainJobConfirmationService.Result result = confirmations.confirm(jobId,
                new TxReceipt(TX_HASH, true, null, null, 1L, List.of()));

        assertThat(result.confirmed()).isFalse();
        assertThat(reload(agreement).getStatus()).isEqualTo(RuleAgreement.Status.PENDING);
    }

    @Test
    @DisplayName("revert 한 AGREE 는 tx_type 분기에 닿지 않는데도 동의가 되돌아온다")
    void revertedTxRevertsAgreement() {
        long jobId = agreeJob(world.host());
        RuleAgreement agreement = signingAgreement(world.host(), jobId);

        // 상위 실패다 — confirmAgree 를 부르지도 않는다(confirm 의 실패 합류점이 잡는다).
        ChainJobConfirmationService.Result result = confirmations.confirm(jobId,
                TxReceipt.reverted(TX_HASH, ErrorCode.RULE_HASH_MISMATCH.name()));

        assertThat(result.confirmed()).isFalse();
        assertThat(reload(agreement).getStatus()).isEqualTo(RuleAgreement.Status.PENDING);
    }

    @Test
    @DisplayName("정상 확정은 그대로 AGREED 다 — 되돌림이 성공 경로를 건드리지 않는다")
    void successStillAgrees() {
        long jobId = agreeJob(world.host());
        RuleAgreement agreement = signingAgreement(world.host(), jobId);

        ChainJobConfirmationService.Result result = confirmations.confirm(jobId,
                rulesAgreed(RULES_HASH));

        assertThat(result.confirmed()).isTrue();
        assertThat(reload(agreement).getStatus()).isEqualTo(RuleAgreement.Status.AGREED);
        assertThat(reload(agreement).getAgreeTxHash()).isEqualTo(TX_HASH);
    }

    // ================================================================ 스윕

    @Test
    @DisplayName("스윕이 job 은 닫혔는데 SIGNING 으로 남은 동의를 PENDING 으로 되돌린다")
    void sweepRevertsSigningWithFailedJob() {
        drainOrphans();
        long jobId = agreeJob(world.host());
        RuleAgreement agreement = signingAgreement(world.host(), jobId);
        // 전이 코드가 없던 시절의 dev 상태를 그대로 만든다 — job 만 FAILED 로 적는다.
        jdbc.update("UPDATE chain_job SET status = 'FAILED', failure_reason = ? "
                + "WHERE chain_job_id = ?", ErrorCode.CHAIN_TX_TIMEOUT.name(), jobId);

        assertThat(ruleService.failSigningsWithClosedJobs()).isEqualTo(1);

        assertThat(reload(agreement).getStatus()).isEqualTo(RuleAgreement.Status.PENDING);
        // 두 번 돌아도 더 되돌릴 것이 없다.
        assertThat(ruleService.failSigningsWithClosedJobs()).isZero();
    }

    @Test
    @DisplayName("스윕은 job 이 아직 열려 있는 동의를 건드리지 않는다")
    void sweepKeepsSigningWhileJobIsOpen() {
        drainOrphans();
        long jobId = agreeJob(world.host());
        RuleAgreement agreement = signingAgreement(world.host(), jobId);
        jdbc.update("UPDATE chain_job SET status = 'PENDING' WHERE chain_job_id = ?", jobId);

        assertThat(ruleService.failSigningsWithClosedJobs()).isZero();
        assertThat(reload(agreement).getStatus()).isEqualTo(RuleAgreement.Status.SIGNING);
    }

    // ================================================================ 도우미

    /**
     * 앞선 테스트 클래스가 컨테이너에 남긴 고아 {@code SIGNING} 을 먼저 비운다.
     *
     * <p>MySQL 컨테이너는 전 클래스가 공유하고 이 테스트들은 롤백하지 않는다. 스윕은 테이블 전체를
     * 훑으므로 "정확히 1건" 을 세려면 출발점이 0 이어야 한다.
     */
    private void drainOrphans() {
        ruleService.failSigningsWithClosedJobs();
    }

    /** {@code RulesAgreed(showId, team, rulesHash, agreedCount, teamCount)} — 계약 §4.3. */
    private TxReceipt rulesAgreed(String rulesHash) {
        Map<String, Object> args = new LinkedHashMap<>();
        args.put("showId", performanceId());
        args.put("team", "0x" + "11".repeat(20));
        args.put("rulesHash", rulesHash);
        args.put("agreedCount", 1L);
        args.put("teamCount", 2L);
        return new TxReceipt(TX_HASH, true, null, null, 1L,
                List.of(new TxReceipt.TxEvent("RulesAgreed", args)));
    }

    /**
     * 진행 중 동의 서명 job. {@code ChainJob} 은 생성 경로가 chain 도메인(서명 RLP 필요)이라 SQL 로
     * 만든다 — {@code PerformanceStudioApiTest.signingChainJob()} 과 같은 이유다.
     */
    private long agreeJob(Team team) {
        jdbc.update("INSERT INTO chain_job (tx_type, signer_type, fee_delegated, issuer_type,"
                + " target_performance_id, target_team_id, status, confirmations, retry_count,"
                + " requested_at)"
                + " VALUES ('AGREE','USER',1,'MOCK',?,?,'SUBMITTED',0,0,NOW(6))",
                performanceId(), team.getTeamId());
        return jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    }

    private RuleAgreement signingAgreement(Team team, long chainJobId) {
        RuleAgreement agreement = ruleAgreementRepository.save(RuleAgreement.builder()
                .performance(performance())
                .team(team)
                .requester(world.hostLeader())
                .build());
        agreement.markSigning(chainJobId, RULES_HASH);
        return ruleAgreementRepository.saveAndFlush(agreement);
    }

    private RuleAgreement reload(RuleAgreement agreement) {
        return ruleAgreementRepository.findById(agreement.getRuleAgreementId()).orElseThrow();
    }

    private Long performanceId() {
        return world.performance().getPerformanceId();
    }

    private Performance performance() {
        return performanceRepository.findById(performanceId()).orElseThrow();
    }
}
