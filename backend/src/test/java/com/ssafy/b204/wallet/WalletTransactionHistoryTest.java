package com.ssafy.b204.wallet;

import static org.assertj.core.api.Assertions.assertThat;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.settlement.SettlementTestFixture;
import com.ssafy.b204.settlement.entity.Settlement;
import com.ssafy.b204.settlement.entity.SettlementShare;
import com.ssafy.b204.settlement.repository.SettlementRepository;
import com.ssafy.b204.support.IntegrationTestBase;
import com.ssafy.b204.ticket.entity.TicketOrder;
import com.ssafy.b204.wallet.dto.WalletDtos.WalletTxItem;
import com.ssafy.b204.wallet.dto.WalletDtos.WalletTxListResponse;
import com.ssafy.b204.wallet.service.WalletService;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * API-wallet-02 내 지갑 거래 이력의 <b>원본이 둘 이상</b>이라는 것(D-84).
 *
 * <p>정산 수령은 {@code chain_job.wallet_id}로 찾을 수 없다 — {@code RELEASE} job 하나가 팀 리더
 * 지갑 여러 곳으로 보내는 운영자 tx이기 때문이다. {@code wallet_id}만 읽던 동안 A-13 "정산 수령"
 * 탭이 영영 비어 있었다(2026-09-22 dev 재현). 보증금 반환도 같은 이유로 비어 있었다.
 *
 * <p>여기서 고정하는 것은 <b>수령자에게 보이는가</b>와 <b>남에게 보이지 않는가</b> 두 가지,
 * 그리고 두 원본을 합친 뒤에도 페이지 정보가 맞는가다.
 */
class WalletTransactionHistoryTest extends IntegrationTestBase {

    private static final int[] TEAM_SHARE_BP = {6_000, 4_000};
    private static final long HOST_SHARE = 3_000L;
    private static final long GUEST_SHARE = 2_000L;
    private static final long GRANT_AMOUNT = 100_000L;
    private static final long DEPOSIT = 50_000L;
    private static final String RELEASE_TX = "0x" + "1a".repeat(32);
    private static final String DEPOSIT_RETURN_TX = "0x" + "2b".repeat(32);

    @Autowired SettlementTestFixture fixture;
    @Autowired WalletService walletService;
    @Autowired SettlementRepository settlementRepository;
    @Autowired ChainJobRepository chainJobRepository;
    @Autowired JdbcTemplate jdbc;

    private final List<Long> chainJobIds = new ArrayList<>();
    private final List<Long> settlementIds = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        for (Long chainJobId : chainJobIds) {
            jdbc.update("DELETE FROM chain_job WHERE chain_job_id = ?", chainJobId);
        }
        for (Long settlementId : settlementIds) {
            jdbc.update("DELETE FROM settlement WHERE settlement_id = ?", settlementId);
        }
        chainJobIds.clear();
        settlementIds.clear();
    }

    /** 리더 지갑 · 공연 · 정산(host 팀만 수령 완료) · 지급 job 하나가 있는 세계. */
    private World world() {
        SettlementTestFixture.World w = fixture.createWorld(5_000, 5_000, TEAM_SHARE_BP);
        List<Long> walletIds = fixture.linkLeaderWallets(w);

        Settlement settlement = Settlement.builder().performance(w.performance()).build();
        settlement.addShare(SettlementShare.builder()
                .team(w.teams().get(0))
                .walletAddress(participantAddress(w, 0))
                .equalAmount(HOST_SHARE)
                .choiceCount(1)
                .build());
        settlement.addShare(SettlementShare.builder()
                .team(w.teams().get(1))
                .walletAddress(participantAddress(w, 1))
                .equalAmount(GUEST_SHARE)
                .choiceCount(1)
                .build());
        settlement.markAggregated(HOST_SHARE + GUEST_SHARE, 5, 5, true, "0x" + "3c".repeat(32));
        settlement.markLocked("0x" + "4d".repeat(32), null);
        // host 팀만 수령 완료다 — 아직 수령하지 않은 분배는 이력에 나오면 안 된다.
        settlement.getShares().get(0).markReleased();
        settlement.markReleased(RELEASE_TX);
        settlementRepository.saveAndFlush(settlement);
        settlementIds.add(settlement.getSettlementId());

        ChainJob grant = chainJobRepository.saveAndFlush(ChainJob.builder()
                .txType(ChainJob.TxType.MINT)
                .signerType(ChainJob.SignerType.OPERATOR)
                .issuerType(ChainJob.IssuerType.MOCK)
                .requester(w.hostLeader())
                .walletId(walletIds.get(0))
                .amount(GRANT_AMOUNT)
                .idempotencyKey("grant:signup:test:" + UUID.randomUUID())
                .build());
        chainJobIds.add(grant.getChainJobId());
        // 지급이 정산보다 먼저 일어난 세계로 만든다 — 최신순 단언이 시계 정밀도에 기대지 않게.
        jdbc.update("UPDATE chain_job SET requested_at = NOW(6) - INTERVAL 2 DAY, "
                        + "confirmed_at = NOW(6) - INTERVAL 2 DAY, status = 'CONFIRMED' "
                        + "WHERE chain_job_id = ?", grant.getChainJobId());

        return new World(w, settlement,
                settlement.getShares().get(0).getSettlementShareId());
    }

    private record World(SettlementTestFixture.World base, Settlement settlement,
                         Long hostShareId) {

        Member hostLeader() {
            return base.hostLeader();
        }

        Member guestLeader() {
            return base.leaders().get(1);
        }

        String title() {
            return base.performance().getTitle();
        }

        Long performanceId() {
            return base.performance().getPerformanceId();
        }
    }

    private String participantAddress(SettlementTestFixture.World w, int index) {
        return jdbc.queryForObject("SELECT wallet_address FROM performance_participant "
                        + "WHERE performance_id = ? AND team_id = ?", String.class,
                w.performance().getPerformanceId(), w.teams().get(index).getTeamId());
    }

    private static MemberPrincipal principal(Member member) {
        return MemberPrincipal.of(member.getMemberId(), member.getEmail(), false);
    }

    private WalletTxListResponse list(Member member, String type, int page, int size) {
        return walletService.myTransactions(principal(member), type, null,
                PageRequest.of(page, size));
    }

    @Test
    @DisplayName("정산 수령이 전체 목록에 공연 제목·금액·release tx 로 최신순 맨 앞에 온다")
    void releaseAppearsInHistory() {
        World w = world();

        WalletTxListResponse response = list(w.hostLeader(), null, 0, 20);

        assertThat(response.items()).hasSize(2);
        WalletTxItem release = response.items().get(0);
        assertThat(release.type()).isEqualTo("RELEASE");
        assertThat(release.walletTxId()).isEqualTo("share_" + w.hostShareId());
        assertThat(release.refType()).isEqualTo("SETTLEMENT_SHARE");
        assertThat(release.refId()).isEqualTo(w.hostShareId());
        assertThat(release.direction()).isEqualTo("IN");
        assertThat(release.status()).isEqualTo("CONFIRMED");
        assertThat(release.amount()).isEqualTo(HOST_SHARE);
        assertThat(release.currency()).isEqualTo("KRW");
        assertThat(release.title()).isEqualTo(w.title());
        assertThat(release.signerType()).isEqualTo("OPERATOR");
        assertThat(release.feeDelegated()).isFalse();
        assertThat(release.txHash()).isEqualTo(RELEASE_TX);
        assertThat(release.explorerUrl()).endsWith("/tx/" + RELEASE_TX);
        assertThat(response.items().get(1).type())
                .as("지급은 이틀 전이라 정산 수령보다 뒤다").isEqualTo("GRANT");
    }

    @Test
    @DisplayName("type=RELEASE 는 정산 수령만 준다")
    void releaseFilterReturnsOnlyShares() {
        World w = world();

        WalletTxListResponse response = list(w.hostLeader(), "RELEASE", 0, 20);

        assertThat(response.items()).extracting(WalletTxItem::type).containsExactly("RELEASE");
        assertThat(response.pageInfo().totalElements()).isEqualTo(1);
        assertThat(response.pageInfo().hasNext()).isFalse();
    }

    @Test
    @DisplayName("수령하지 않은 팀 리더에게는 남의 정산 수령이 보이지 않는다")
    void otherWalletDoesNotSeeTheShare() {
        World w = world();

        WalletTxListResponse response = list(w.guestLeader(), null, 0, 20);

        assertThat(response.items())
                .as("released=false 인 자기 몫도, host 가 받은 몫도 보이면 안 된다").isEmpty();
        assertThat(response.pageInfo().totalElements()).isZero();
    }

    @Test
    @DisplayName("두 원본을 합쳐도 total·hasNext 가 맞는다")
    void pagingCountsBothSources() {
        World w = world();

        WalletTxListResponse first = list(w.hostLeader(), null, 0, 1);
        assertThat(first.items()).extracting(WalletTxItem::type).containsExactly("RELEASE");
        assertThat(first.pageInfo().totalElements()).isEqualTo(2);
        assertThat(first.pageInfo().hasNext()).isTrue();

        WalletTxListResponse second = list(w.hostLeader(), null, 1, 1);
        assertThat(second.items()).extracting(WalletTxItem::type).containsExactly("GRANT");
        assertThat(second.pageInfo().page()).isEqualTo(1);
        assertThat(second.pageInfo().totalElements()).isEqualTo(2);
        assertThat(second.pageInfo().hasNext())
                .as("두 원본을 합친 마지막 페이지다").isFalse();

        WalletTxListResponse beyond = list(w.hostLeader(), null, 2, 1);
        assertThat(beyond.items()).isEmpty();
        assertThat(beyond.pageInfo().hasNext()).isFalse();
    }

    @Test
    @DisplayName("보증금 반환도 주최팀 리더 지갑에 보인다")
    void depositReturnAppearsForHostLeader() {
        World w = world();
        jdbc.update("UPDATE performance SET deposit_status = 'RETURNED', "
                        + "deposit_return_tx_hash = ?, deposit_returned_at = NOW(6) "
                        + "WHERE performance_id = ?", DEPOSIT_RETURN_TX, w.performanceId());

        WalletTxListResponse response = list(w.hostLeader(), "DEPOSIT_RETURN", 0, 20);

        assertThat(response.items()).hasSize(1);
        WalletTxItem item = response.items().get(0);
        assertThat(item.type()).isEqualTo("DEPOSIT_RETURN");
        assertThat(item.walletTxId()).isEqualTo("deposit_return_" + w.performanceId());
        assertThat(item.refType()).isEqualTo("PERFORMANCE");
        assertThat(item.direction()).isEqualTo("IN");
        assertThat(item.amount()).isEqualTo(DEPOSIT);
        assertThat(item.title()).isEqualTo(w.title());
        assertThat(item.txHash()).isEqualTo(DEPOSIT_RETURN_TX);

        assertThat(list(w.guestLeader(), "DEPOSIT_RETURN", 0, 20).items())
                .as("보증금은 공연 생성 팀 리더만 돌려받는다").isEmpty();
    }

    /**
     * 명세 §3 API-wallet-02의 {@code PURCHASE} 예시는 {@code "pay_8801"} · {@code ORDER} ·
     * 주문 {@code refId} · {@code "합정 3밴드 합동공연 · 일반 2매"}다. {@code chain_job}에 주문
     * 컬럼이 없어 결제 역참조를 타지 않으면 {@code job_}·{@code CHAIN_JOB}·제목 없음으로 나갔다.
     */
    @Test
    @DisplayName("결제 행은 주문을 가리키고 제목이 공연 · 등급 매수다")
    void purchasePointsAtOrder() {
        World w = world();
        Member buyer = w.hostLeader();
        Long walletId = jdbc.queryForObject("SELECT wallet_id FROM wallet WHERE member_id = ?",
                Long.class, buyer.getMemberId());
        TicketOrder order = fixture.placeOrder(w.base(), buyer, w.base().teams().get(0), 2,
                10_000L, 0);
        jdbc.update("INSERT INTO order_item (ticket_order_id, ticket_type_id, quantity, "
                        + "unit_price, subtotal) VALUES (?, ?, 2, 10000, 20000)",
                order.getTicketOrderId(), w.base().ticketType().getTicketTypeId());

        ChainJob purchase = chainJobRepository.saveAndFlush(ChainJob.builder()
                .txType(ChainJob.TxType.PURCHASE)
                .signerType(ChainJob.SignerType.USER)
                .issuerType(ChainJob.IssuerType.MOCK)
                .requester(buyer)
                .walletId(walletId)
                .amount(order.getTotalAmount())
                .idempotencyKey("purchase:test:" + UUID.randomUUID())
                .build());
        chainJobIds.add(purchase.getChainJobId());
        jdbc.update("INSERT INTO payment (ticket_order_id, payer_wallet_id, amount, "
                        + "purchase_chain_job_id, status, idempotency_key, requested_at) "
                        + "VALUES (?, ?, ?, ?, 'PAID', ?, NOW(6))",
                order.getTicketOrderId(), walletId, order.getTotalAmount(),
                purchase.getChainJobId(), "pay-" + UUID.randomUUID());
        Long paymentId = jdbc.queryForObject(
                "SELECT payment_id FROM payment WHERE ticket_order_id = ?", Long.class,
                order.getTicketOrderId());

        WalletTxListResponse response = list(buyer, "PURCHASE", 0, 20);

        assertThat(response.items()).hasSize(1);
        WalletTxItem item = response.items().get(0);
        assertThat(item.walletTxId()).isEqualTo("pay_" + paymentId);
        assertThat(item.refType()).isEqualTo("ORDER");
        assertThat(item.refId()).isEqualTo(order.getTicketOrderId());
        assertThat(item.title()).isEqualTo(w.title() + " · 일반 2매");
        assertThat(item.direction()).isEqualTo("OUT");
        assertThat(item.amount()).isEqualTo(20_000L);
        assertThat(item.feeDelegated()).as("USER job 은 언제나 대납이다").isTrue();
    }

    @Test
    @DisplayName("status 필터가 미확정만 요구하면 도메인 원본 행은 빠진다")
    void pendingFilterExcludesDerivedRows() {
        World w = world();

        WalletTxListResponse response = walletService.myTransactions(principal(w.hostLeader()),
                null, "PENDING", PageRequest.of(0, 20));

        assertThat(response.items())
                .as("정산 수령·보증금 반환은 확정된 사실만 기록된다").isEmpty();
    }
}
