package com.ssafy.b204.chain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

import com.ssafy.b204.chain.client.KaiaChainClient;
import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.worker.ContractOperatorTxBuilder;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.performance.repository.PerformanceParticipantRepository;
import com.ssafy.b204.performance.repository.PerformanceRepository;
import com.ssafy.b204.performance.repository.TicketTypeRepository;
import com.ssafy.b204.refund.entity.Refund;
import com.ssafy.b204.refund.repository.RefundRepository;
import com.ssafy.b204.rule.repository.SettlementRuleRepository;
import com.ssafy.b204.settlement.SettlementTestFixture;
import com.ssafy.b204.settlement.repository.SettlementRepository;
import com.ssafy.b204.support.IntegrationTestBase;
import com.ssafy.b204.team.repository.TeamRepository;
import com.ssafy.b204.ticket.entity.TicketOrder;
import com.ssafy.b204.ticket.repository.TicketOrderRepository;
import com.ssafy.b204.ticket.repository.TicketRepository;
import com.ssafy.b204.wallet.repository.WalletRepository;
import java.math.BigInteger;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.web3j.crypto.KaiaCredentials;
import org.web3j.crypto.Keys;
import org.web3j.crypto.TransactionDecoder;
import org.web3j.utils.Numeric;

/**
 * 워커 스레드처럼 <b>영속성 세션 없이</b> 빌더를 부른다 — 2026-09-17 dev chain_job 73.
 *
 * <p>{@code ChainWalletQueue}의 풀 스레드에는 트랜잭션이 없어 {@code refund.getTicketOrder()}가
 * 초기화되지 않은 프록시로 남았고 {@code LazyInitializationException}으로 REFUND 가 전부 FAILED 됐다.
 * {@link ContractOperatorTxBuilderTest}는 리포지토리를 mock 으로 두어 이 결함을 볼 수 없다. 여기서는
 * 실제 JPA 리포지토리를 쓰고 이 클래스에 {@code @Transactional}을 걸지 않는다. 체인 노드만 스텁한다.
 */
class ContractOperatorTxBuilderSessionTest extends IntegrationTestBase {

    private static final String SPLITTER = "0x5b1f00000000000000000000000000000000c0de";

    @Autowired MemberRepository memberRepository;
    @Autowired TeamRepository teamRepository;
    @Autowired PerformanceRepository performanceRepository;
    @Autowired PerformanceParticipantRepository participantRepository;
    @Autowired TicketTypeRepository ticketTypeRepository;
    @Autowired TicketOrderRepository ticketOrderRepository;
    @Autowired TicketRepository ticketRepository;
    @Autowired SettlementRuleRepository settlementRuleRepository;
    @Autowired SettlementRepository settlementRepository;
    @Autowired RefundRepository refundRepository;
    @Autowired WalletRepository walletRepository;
    @Autowired JdbcTemplate jdbc;

    @Test
    @DisplayName("REFUND 는 트랜잭션 밖에서도 주문의 orderRef 를 읽어 tx 를 만든다")
    void refundBuildsOutsideSession() throws Exception {
        SettlementTestFixture fixture = new SettlementTestFixture(memberRepository, teamRepository,
                performanceRepository, participantRepository, ticketTypeRepository,
                ticketOrderRepository, ticketRepository, settlementRuleRepository, jdbc);
        SettlementTestFixture.World world = fixture.createWorld(3000, 7000, new int[] {10000});
        TicketOrder order = fixture.placeOrder(world, fixture.createAudience(), world.host(),
                1, 10_000L, 9_000L, Refund.Status.PROCESSING);

        String key = "refund-session-" + UUID.randomUUID();
        Long performanceId = world.performance().getPerformanceId();
        jdbc.update("INSERT INTO chain_job (tx_type, target_performance_id, amount, idempotency_key) "
                + "VALUES ('REFUND', ?, 9000, ?)", performanceId, key);
        Long chainJobId = jdbc.queryForObject(
                "SELECT chain_job_id FROM chain_job WHERE idempotency_key = ?", Long.class, key);
        jdbc.update("UPDATE refund SET chain_job_id = ? WHERE ticket_order_id = ?",
                chainJobId, order.getTicketOrderId());

        ChainJob job = ChainJob.builder()
                .txType(ChainJob.TxType.REFUND)
                .signerType(ChainJob.SignerType.OPERATOR)
                .issuerType(ChainJob.IssuerType.MOCK)
                .targetPerformanceId(performanceId)
                .amount(9_000L)
                .idempotencyKey(key)
                .build();
        ReflectionTestUtils.setField(job, "chainJobId", chainJobId);

        String data = Numeric.prependHexPrefix(
                TransactionDecoder.decode(builder().buildSignedTx(job)).getData());

        assertThat(data).containsIgnoringCase(Numeric.cleanHexPrefix(order.getOrderRef()));
    }

    private ContractOperatorTxBuilder builder() throws Exception {
        KaiaChainClient chainClient = mock(KaiaChainClient.class);
        given(chainClient.pendingNonce(anyString())).willReturn(BigInteger.ONE);
        given(chainClient.gasPrice()).willReturn(BigInteger.valueOf(25_000_000_000L));
        given(chainClient.estimateGas(anyString(), anyString(), anyString()))
                .willReturn(Optional.empty());
        ChainProperties properties = new ChainProperties("http://localhost", 1001L, null, null,
                null, new ChainProperties.Contract(SPLITTER, SPLITTER));
        ObjectProvider<KaiaCredentials> signer = provider(KaiaCredentials.create(Keys.createEcKeyPair()));
        return new ContractOperatorTxBuilder(chainClient, properties, walletRepository,
                performanceRepository, participantRepository, settlementRuleRepository,
                settlementRepository, refundRepository, signer, signer);
    }

    @SuppressWarnings("unchecked")
    private static ObjectProvider<KaiaCredentials> provider(KaiaCredentials credentials) {
        ObjectProvider<KaiaCredentials> provider = mock(ObjectProvider.class);
        given(provider.getIfAvailable()).willReturn(credentials);
        return provider;
    }
}
