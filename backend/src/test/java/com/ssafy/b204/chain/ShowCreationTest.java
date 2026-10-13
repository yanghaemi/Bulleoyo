package com.ssafy.b204.chain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ssafy.b204.chain.client.KaiaChainClient;
import com.ssafy.b204.chain.config.ChainWorkerProperties;
import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.metrics.ChainMetrics;
import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.chain.service.FeeDelegationService;
import com.ssafy.b204.chain.service.ReceiptEvents;
import com.ssafy.b204.chain.service.ReceiptVerifier;
import com.ssafy.b204.chain.worker.ChainJobStateWriter;
import com.ssafy.b204.chain.worker.ChainJobWorker;
import com.ssafy.b204.chain.worker.ChainOwnership;
import com.ssafy.b204.chain.worker.ChainWalletQueue;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.wallet.service.WalletBalanceRefresher;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import com.ssafy.b204.chain.service.ChainJobConfirmationService;
import com.ssafy.b204.chain.service.ShowCreationService;
import com.ssafy.b204.chain.support.ChainJobIds;
import com.ssafy.b204.chain.service.TxReceipt;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.performance.entity.PerformanceParticipant;
import com.ssafy.b204.performance.repository.PerformanceParticipantRepository;
import com.ssafy.b204.performance.repository.PerformanceRepository;
import com.ssafy.b204.performance.repository.TicketTypeRepository;
import com.ssafy.b204.rule.repository.SettlementRuleRepository;
import com.ssafy.b204.settlement.SettlementTestFixture;
import com.ssafy.b204.support.IntegrationTestBase;
import com.ssafy.b204.team.repository.TeamRepository;
import com.ssafy.b204.ticket.repository.TicketOrderRepository;
import com.ssafy.b204.ticket.repository.TicketRepository;
import com.ssafy.b204.wallet.entity.Wallet;
import com.ssafy.b204.wallet.repository.WalletRepository;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * {@code createShow} 선행 job — S15P21B204-67.
 *
 * <p>여기서 보는 것 셋. ① 세 진입점이 같은 job 하나를 쓰는가(멱등) ② 팀 순서·지갑 스냅샷이
 * job 생성 시점에 굳는가 ③ 확정이 <b>보낸 배열과 이벤트를 대조</b>하는가. ③이 없으면 어긋난
 * 배열로 온체인 공연이 만들어져도 서버는 성공으로 적고, 그 뒤의 모든 {@code purchase}가 남의
 * 팀에 기록된다.
 */
class ShowCreationTest extends IntegrationTestBase {

    @Autowired ShowCreationService showCreationService;
    @Autowired ChainJobConfirmationService confirmations;
    @Autowired ChainJobStateWriter stateWriter;
    @Autowired ChainJobRepository chainJobRepository;
    @Autowired PerformanceRepository performanceRepository;
    @Autowired PerformanceParticipantRepository participantRepository;
    @Autowired SettlementRuleRepository settlementRuleRepository;
    @Autowired WalletRepository walletRepository;
    @Autowired MemberRepository memberRepository;
    @Autowired TeamRepository teamRepository;
    @Autowired TicketTypeRepository ticketTypeRepository;
    @Autowired TicketOrderRepository ticketOrderRepository;
    @Autowired TicketRepository ticketRepository;
    @Autowired JdbcTemplate jdbc;

    private SettlementTestFixture.World world;

    /** {@link #linkWallets()}가 만든 리더 지갑 주소 — host 순서 그대로다. */
    private final List<String> linkedAddresses = new java.util.ArrayList<>();

    @BeforeEach
    void setUp() {
        SettlementTestFixture fixture = new SettlementTestFixture(memberRepository, teamRepository,
                performanceRepository, participantRepository, ticketTypeRepository,
                ticketOrderRepository, ticketRepository, settlementRuleRepository, jdbc);
        world = fixture.createWorld(5000, 5000, new int[]{4000, 3000, 3000});
        // 픽스처는 인덱스를 미리 굳혀 둔다. 이 카드가 보는 것은 "굳히는 순간"이라 되돌린다.
        // wallet_address 는 남긴다 - 그 값이 곧 "수락했다"는 표식이라(ERD 2값 ENUM 파생)
        // 지우면 참여팀이 통째로 사라진다.
        jdbc.update("UPDATE performance_participant SET on_chain_index = NULL"
                        + " WHERE performance_id = ?",
                world.performance().getPerformanceId());
    }

    @Test
    @DisplayName("두 번 불러도 job 은 하나다 — 세 진입점이 같은 멱등키를 쓴다")
    void isIdempotent() {
        linkWallets();

        ChainJob first = ensureShowCreated().job();
        ChainJob second = ensureShowCreated().job();

        assertThat(first).isNotNull();
        assertThat(second.getChainJobId()).isEqualTo(first.getChainJobId());
        assertThat(first.getTxType()).isEqualTo(ChainJob.TxType.CREATE_SHOW);
        assertThat(first.getSignerType()).isEqualTo(ChainJob.SignerType.OPERATOR);
        assertThat(first.getIdempotencyKey()).isEqualTo("createShow:" + performanceId());
        // 테스트 사이 DB 를 비우지 않으므로 이 공연 것만 센다.
        assertThat(chainJobRepository.findAll().stream()
                .filter(j -> j.getTxType() == ChainJob.TxType.CREATE_SHOW)
                .filter(j -> performanceId().equals(j.getTargetPerformanceId()))).hasSize(1);
    }

    @Test
    @DisplayName("job 을 만들 때 on_chain_index 가 0..n-1 로 굳고 host 가 0 이다")
    void assignsContiguousIndexesWithHostFirst() {
        linkWallets();

        ensureShowCreated();

        List<PerformanceParticipant> ordered = ordered();
        assertThat(ordered).hasSize(3);
        assertThat(ordered.stream().map(PerformanceParticipant::getOnChainIndex))
                .containsExactly(0, 1, 2);
        assertThat(ordered.get(0).getTeam().getTeamId()).isEqualTo(world.host().getTeamId());
        // 지갑 스냅샷도 같이 다시 굳는다 - createShow 의 teamWallets 배열이 이 값이다
        // (미결 안건 20). 픽스처가 넣어 둔 가짜 주소가 아니라 실제 연결 지갑이어야 한다.
        assertThat(ordered.stream().map(PerformanceParticipant::getWalletAddress))
                .containsExactlyElementsOf(linkedAddresses);
    }

    @Test
    @DisplayName("규칙이 아직 없으면 job 을 만들지 않는다 — rulesHash 0 은 컨트랙트가 거절한다")
    void skipsWhenRuleMissing() {
        linkWallets();
        jdbc.update("DELETE FROM settlement_rule WHERE performance_id = ?",
                world.performance().getPerformanceId());

        ShowCreationService.ShowCreation creation = ensureShowCreated();

        assertThat(creation.job()).isNull();
        assertThat(creation.prerequisiteJobId()).isNull();
        assertThat(creation.confirmed()).isFalse();
        // prerequisiteJobId 의 null 만으로는 "이미 확정"과 구분되지 않는다 - 호출부는 이것을 본다.
        assertThat(creation.notCreatable()).isTrue();
    }

    @Test
    @DisplayName("참여팀 리더 지갑이 없으면 WALLET_NOT_FOUND — 배열에 넣을 주소가 없다")
    void failsWhenLeaderWalletMissing() {
        assertThatThrownBy(this::ensureShowCreated)
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.WALLET_NOT_FOUND);
    }

    @Test
    @DisplayName("ShowCreated 대조에 성공하면 on_chain_id 가 채워진다")
    void confirmBindsOnChainId() {
        linkWallets();
        jdbc.update("UPDATE performance SET on_chain_id = NULL WHERE performance_id = ?",
                world.performance().getPerformanceId());
        ChainJob job = ensureShowCreated().job();

        ChainJobConfirmationService.Result result =
                confirmations.confirm(job.getChainJobId(), receipt(joinedWallets(), 0L));

        assertThat(result.confirmed()).isTrue();
        assertThat(performanceRepository.findById(world.performance().getPerformanceId())
                .orElseThrow().getOnChainId())
                .isEqualTo(world.performance().getPerformanceId());
        assertThat(chainJobRepository.findById(job.getChainJobId()).orElseThrow().getStatus())
                .isEqualTo(ChainJob.Status.CONFIRMED);
    }

    @Test
    @DisplayName("teamWallets 가 우리가 보낸 것과 다르면 확정하지 않는다 — 그 뒤 tx 가 전부 어긋난다")
    void confirmRejectsMismatchedWallets() {
        linkWallets();
        ChainJob job = ensureShowCreated().job();

        ChainJobConfirmationService.Result result = confirmations.confirm(job.getChainJobId(),
                receipt("0x" + "11".repeat(20) + "," + "0x" + "22".repeat(20), 0L));

        assertThat(result.confirmed()).isFalse();
        assertThat(chainJobRepository.findById(job.getChainJobId()).orElseThrow().getStatus())
                .isEqualTo(ChainJob.Status.FAILED);
    }

    @Test
    @DisplayName("hostTeamIndex 가 다르면 확정하지 않는다 — dust 귀속 주체가 바뀐다")
    void confirmRejectsMismatchedHostIndex() {
        linkWallets();
        ChainJob job = ensureShowCreated().job();

        ChainJobConfirmationService.Result result =
                confirmations.confirm(job.getChainJobId(), receipt(joinedWallets(), 2L));

        assertThat(result.confirmed()).isFalse();
    }

    @Test
    @DisplayName("job 이 PENDING 인 동안 늦게 수락한 팀도 자리를 받는다 — 안 그러면 bp 합이 깨진다")
    void reassignsIndexesWhilePending() {
        linkWallets();
        // 세 번째 팀이 아직 수락 전이다(수락 여부 = wallet_address 유무 · ERD 2값 ENUM 파생).
        PerformanceParticipant late = registered().get(2);
        jdbc.update("UPDATE performance_participant SET wallet_address = NULL"
                + " WHERE performance_participant_id = ?", late.getPerformanceParticipantId());

        ShowCreationService.ShowCreation before = ensureShowCreated();
        assertThat(before.teams()).hasSize(2);

        // 늦게 수락 - 보증금 준비에서 job 이 걸린 뒤 게스트팀이 수락하는 정상 경로다.
        jdbc.update("UPDATE performance_participant SET wallet_address = ?"
                        + " WHERE performance_participant_id = ?",
                linkedAddresses.get(2), late.getPerformanceParticipantId());
        ShowCreationService.ShowCreation after = ensureShowCreated();

        assertThat(after.job().getChainJobId()).isEqualTo(before.job().getChainJobId());
        assertThat(after.teams()).hasSize(3);
        assertThat(after.teams().stream().map(ShowCreationService.TeamSlot::teamIndex))
                .containsExactly(0, 1, 2);
        // 자리를 못 받은 팀이 있으면 그 팀 몫이 teamShareBp 배열에서 빠져 합이 10000 미만이
        // 되고 컨트랙트가 InvalidBpSum 으로 revert 한다.
        assertThat(ordered().stream().mapToInt(PerformanceParticipant::getTeamShareBp).sum())
                .isEqualTo(10_000);
    }

    @Test
    @DisplayName("FAILED job 은 선행 job 으로 돌려주지 않는다 — 죽은 jobId 를 무한 폴링한다")
    void replacesFailedJob() {
        linkWallets();
        ChainJob failed = ensureShowCreated().job();
        confirmations.markFailed(failed.getChainJobId(), ErrorCode.CHAIN_TX_TIMEOUT);

        ShowCreationService.ShowCreation retried = ensureShowCreated();

        assertThat(retried.job().getChainJobId()).isNotEqualTo(failed.getChainJobId());
        assertThat(retried.job().getStatus()).isEqualTo(ChainJob.Status.PENDING);
        assertThat(retried.prerequisiteJobId())
                .isEqualTo(ChainJobIds.toJobId(retried.job().getChainJobId()));
        // 옛 행은 지우지 않는다 - 실패 이력이 끊기면 대사를 못 한다. UNIQUE 키만 푼다.
        assertThat(chainJobRepository.findById(failed.getChainJobId()).orElseThrow()
                .getIdempotencyKey()).isEqualTo("createShow:" + performanceId()
                + "#failed:" + failed.getChainJobId());
    }

    /**
     * (d) S15P21B204-76 — 워커가 시한 지난 {@code createShow} 를 FAILED 로 닫으면 이 서비스가 멱등키를
     * 풀고 <b>같은 tx 를 한 번 더</b> 만들었다. 노드에 tx 가 살아 있는 동안 워커가 SUBMITTED 로 두면
     * 호출부를 고치지 않아도 기존 판정(FAILED 만 연다)이 그대로 막는다 — 그것을 워커와 서비스를 같이
     * 돌려 확인한다.
     */
    @Test
    @DisplayName("(d) 시한 지난 createShow 가 노드에 살아 있으면 새 createShow job 이 생기지 않는다")
    void overdueSubmittedCreateShowBlocksSecondJob() {
        linkWallets();
        ChainJob sent = ensureShowCreated().job();
        jdbc.update("UPDATE chain_job SET status = 'SUBMITTED', tx_hash = ?,"
                        + " requested_at = DATE_SUB(NOW(6), INTERVAL 10 MINUTE) WHERE chain_job_id = ?",
                "0x" + "ab".repeat(32), sent.getChainJobId());

        KaiaChainClient node = org.mockito.Mockito.mock(KaiaChainClient.class);
        org.mockito.BDDMockito.given(node.isAvailable()).willReturn(true);
        org.mockito.BDDMockito.given(node.receipt(org.mockito.ArgumentMatchers.anyString()))
                .willReturn(java.util.Optional.empty());
        org.mockito.BDDMockito.given(node.isTransactionKnown(org.mockito.ArgumentMatchers.anyString()))
                .willReturn(true);
        workerOn(node).pollSubmittedJobs();

        assertThat(chainJobRepository.findById(sent.getChainJobId()).orElseThrow().getStatus())
                .isEqualTo(ChainJob.Status.SUBMITTED);
        assertThat(showCreationService.isRulesFrozen(performanceId())).isTrue();
        ShowCreationService.ShowCreation again = ensureShowCreated();
        assertThat(again.job().getChainJobId()).isEqualTo(sent.getChainJobId());
        assertThat(chainJobRepository.findAll().stream()
                .filter(j -> j.getTxType() == ChainJob.TxType.CREATE_SHOW)
                .filter(j -> performanceId().equals(j.getTargetPerformanceId()))).hasSize(1);
    }

    // ------------------------------------------------------------------ 헬퍼

    /** 실 DB 위의 워커 — 노드만 가짜다. 테스트 프로필은 워커 빈을 끄므로 직접 만든다. */
    @SuppressWarnings("unchecked")
    private ChainJobWorker workerOn(KaiaChainClient node) {
        org.springframework.beans.factory.ObjectProvider<org.web3j.crypto.KaiaCredentials> none =
                org.mockito.Mockito.mock(org.springframework.beans.factory.ObjectProvider.class);
        return new ChainJobWorker(chainJobRepository,
                new ChainOwnership(org.mockito.Mockito.mock(
                        org.springframework.data.redis.core.StringRedisTemplate.class),
                        chainJobRepository, ""),
                stateWriter,
                new ChainWalletQueue(),
                node,
                org.mockito.Mockito.mock(FeeDelegationService.class),
                new ReceiptVerifier(),
                new ReceiptEvents(new ChainProperties(null, 1001L, null, null, null, null)),
                confirmations,
                org.mockito.Mockito.mock(WalletBalanceRefresher.class),
                new ChainWorkerProperties(true, 1000L, 1500L, 120, 3, 20),
                new ChainMetrics(new SimpleMeterRegistry()),
                org.mockito.Mockito.mock(org.springframework.beans.factory.ObjectProvider.class),
                none, none,
                org.mockito.Mockito.mock(com.ssafy.b204.common.alert.OpsAlert.class),
                new ChainProperties(null, 1001L, null, null, null, null));
    }

    private ShowCreationService.ShowCreation ensureShowCreated() {
        return showCreationService.ensureShowCreated(performanceId(),
                world.hostLeader().getMemberId());
    }

    private Long performanceId() {
        return world.performance().getPerformanceId();
    }

    private List<PerformanceParticipant> registered() {
        return participantRepository
                .findByPerformance_PerformanceIdAndStatus(performanceId(),
                        PerformanceParticipant.Status.REGISTERED).stream()
                .sorted(Comparator.comparing(
                        PerformanceParticipant::getPerformanceParticipantId))
                .toList();
    }

    private TxReceipt receipt(String teamWallets, long hostTeamIndex) {
        return new TxReceipt("0x" + UUID.randomUUID().toString().replace("-", "").repeat(2),
                true, null, null, 1L,
                List.of(new TxReceipt.TxEvent("ShowCreated", Map.of(
                        "showId", world.performance().getPerformanceId(),
                        "teamWallets", teamWallets,
                        "hostTeamIndex", hostTeamIndex))));
    }

    private String joinedWallets() {
        return ordered().stream().map(p -> p.getWalletAddress().toLowerCase(Locale.ROOT))
                .reduce((a, b) -> a + "," + b).orElseThrow();
    }

    /** 빌더·확정과 같은 판정을 쓴다 — 테스트가 다른 규칙을 적으면 검사가 헐거워진다. */
    private List<PerformanceParticipant> ordered() {
        return ShowCreationService.onChainOrder(registered());
    }

    /**
     * 참여팀 리더 전원의 지갑을 연결한다. 없으면 {@code teamWallets}를 만들 수 없다.
     * 주소는 매번 새로 만든다 — {@code wallet.address}가 UNIQUE 라 고정값이면 두 번째
     * 테스트에서 깨진다(테스트 사이 DB 를 비우지 않는다).
     */
    private void linkWallets() {
        linkedAddresses.clear();
        for (Member leader : world.leaders()) {
            String address = "0x" + (UUID.randomUUID().toString().replace("-", "")
                    + UUID.randomUUID().toString().replace("-", "")).substring(0, 40);
            linkedAddresses.add(address);
            walletRepository.save(Wallet.builder()
                    .member(leader)
                    .address(address)
                    .provider(Wallet.Provider.WEB3AUTH)
                    .build());
        }
    }
}
