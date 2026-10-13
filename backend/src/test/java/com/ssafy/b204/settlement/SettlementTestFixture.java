package com.ssafy.b204.settlement;

import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.entity.PerformanceParticipant;
import com.ssafy.b204.performance.entity.TicketType;
import com.ssafy.b204.performance.repository.PerformanceParticipantRepository;
import com.ssafy.b204.performance.repository.PerformanceRepository;
import com.ssafy.b204.performance.repository.TicketTypeRepository;
import com.ssafy.b204.payment.entity.Payment;
import com.ssafy.b204.refund.entity.Refund;
import com.ssafy.b204.rule.entity.SettlementRule;
import com.ssafy.b204.rule.repository.SettlementRuleRepository;
import com.ssafy.b204.team.entity.Team;
import com.ssafy.b204.team.repository.TeamRepository;
import com.ssafy.b204.ticket.entity.Ticket;
import com.ssafy.b204.ticket.entity.TicketOrder;
import com.ssafy.b204.ticket.repository.TicketOrderRepository;
import com.ssafy.b204.ticket.repository.TicketRepository;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 정산 테스트가 필요로 하는 최소 세계 — 회원·팀·공연·참여팀·규칙·티켓.
 *
 * <p>정산은 <b>다른 도메인이 만들어 놓은 상태 위에서만</b> 의미가 있어서, 픽스처가 이 정도로 커지는
 * 것을 피할 수 없다. 대신 한곳에 모아 각 테스트가 "무엇을 다르게 했는가"만 읽히게 한다.
 *
 * <p>공연 상태({@code ENDED})·{@code on_chain_id}·보증금 상태는 엔티티에 변경 메서드가 없어
 * ({@code Performance}는 performance 도메인 소유) SQL로 직접 세운다. 테스트가 남의 엔티티에
 * setter를 열게 하지 않기 위한 선택이다.
 */
@RequiredArgsConstructor
public class SettlementTestFixture {

    private final MemberRepository memberRepository;
    private final TeamRepository teamRepository;
    private final PerformanceRepository performanceRepository;
    private final PerformanceParticipantRepository participantRepository;
    private final TicketTypeRepository ticketTypeRepository;
    private final TicketOrderRepository ticketOrderRepository;
    private final TicketRepository ticketRepository;
    private final SettlementRuleRepository settlementRuleRepository;
    private final JdbcTemplate jdbcTemplate;

    /** 한 공연의 전체 배선. {@code teams.get(0)}이 공연 생성 팀(host)이다. */
    public record World(Performance performance, List<Team> teams, List<Member> leaders,
                        TicketType ticketType, Member outsider) {

        public Team host() {
            return teams.get(0);
        }

        public Member hostLeader() {
            return leaders.get(0);
        }
    }

    /**
     * @param teamShareBp 참여팀 수 = 배열 길이. 합이 10000이어야 규칙이 성립한다
     */
    public World createWorld(int fixedRatioBp, int selectionRatioBp, int[] teamShareBp) {
        String tag = UUID.randomUUID().toString().substring(0, 8);

        List<Member> leaders = new ArrayList<>();
        List<Team> teams = new ArrayList<>();
        for (int i = 0; i < teamShareBp.length; i++) {
            Member leader = memberRepository.save(Member.builder()
                    .email("leader" + i + "-" + tag + "@b204.test")
                    .name("리더" + i)
                    .authProvider(Member.AuthProvider.GOOGLE)
                    .countryCode("KR")
                    .build());
            leaders.add(leader);
            teams.add(teamRepository.save(Team.builder()
                    .name("팀" + i + "-" + tag)
                    .leader(leader)
                    .build()));
        }
        Member outsider = memberRepository.save(Member.builder()
                .email("outsider-" + tag + "@b204.test")
                .name("참여하지 않는 사람")
                .authProvider(Member.AuthProvider.GOOGLE)
                .countryCode("KR")
                .build());

        Performance performance = performanceRepository.save(Performance.builder()
                .title("합정 " + teamShareBp.length + "밴드 합동공연 " + tag)
                .performanceAt(LocalDateTime.now().minusDays(1))
                .creatorTeam(teams.get(0))
                .joint(true)
                .saleCloseAt(LocalDateTime.now().minusDays(1).minusHours(1))
                .cancelDeadlineAt(LocalDateTime.now().minusDays(4))
                .depositAmount(50_000L)
                .build());

        for (int i = 0; i < teams.size(); i++) {
            PerformanceParticipant participant = participantRepository.save(
                    PerformanceParticipant.builder()
                            .performance(performance)
                            .team(teams.get(i))
                            .teamShareBp(teamShareBp[i])
                            .walletAddress(walletAddress(i))
                            .build());
            participant.assignOnChainIndex(i);
            participantRepository.save(participant);
        }

        settlementRuleRepository.save(SettlementRule.builder()
                .performance(performance)
                .fixedRatioBp(fixedRatioBp)
                .selectionRatioBp(selectionRatioBp)
                .rulesHash("0x" + "ab".repeat(32))
                .build());

        TicketType ticketType = ticketTypeRepository.save(TicketType.builder()
                .performance(performance)
                .name("일반")
                .price(10_000L)
                .totalQuantity(500)
                .build());

        // 공연은 이미 끝났다 — 집계 확정의 선행 조건이다.
        jdbcTemplate.update("UPDATE performance SET status = 'ENDED', on_chain_id = ?, "
                        + "deposit_status = 'PAID' WHERE performance_id = ?",
                performance.getPerformanceId(), performance.getPerformanceId());

        return new World(performanceRepository.findById(performance.getPerformanceId()).orElseThrow(),
                teams, leaders, ticketType, outsider);
    }

    /**
     * 결제 완료 주문 1건 + 티켓 {@code quantity}매. 티켓 1매 = 1표(팀 확정 9/7).
     *
     * @param refundedAmount 0보다 크면 환불 이력이 있는 주문이 되어 <b>표가 전량 빠진다</b>(A-2)
     */
    public TicketOrder placeOrder(World world, Member buyer, Team selectedTeam, int quantity,
                                  long unitPrice, long refundedAmount) {
        return placeOrder(world, buyer, selectedTeam, quantity, unitPrice, refundedAmount,
                Refund.Status.COMPLETED);
    }

    /**
     * @param refundStatus {@code FAILED}면 <b>온체인에서 아무 일도 일어나지 않은</b> 환불이다 —
     *                     티켓은 살아 있고 표도 빠지지 않아야 한다
     */
    public TicketOrder placeOrder(World world, Member buyer, Team selectedTeam, int quantity,
                                  long unitPrice, long refundedAmount, Refund.Status refundStatus) {
        TicketOrder order = ticketOrderRepository.save(TicketOrder.builder()
                .performance(world.performance())
                .member(buyer)
                .orderRef("0x" + UUID.randomUUID().toString().replace("-", "")
                        + UUID.randomUUID().toString().replace("-", "").substring(0, 32))
                .totalAmount(unitPrice * quantity)
                .totalQuantity(quantity)
                .selectedTeam(selectedTeam)
                .paymentExpiresAt(LocalDateTime.now().plusMinutes(10))
                .build());
        order.markPaid();
        ticketOrderRepository.save(order);

        for (int i = 0; i < quantity; i++) {
            ticketRepository.save(Ticket.builder()
                    .ticketOrder(order)
                    .ticketType(world.ticketType())
                    .performance(world.performance())
                    .member(buyer)
                    .purchasePrice(unitPrice)
                    .qrSecret(UUID.randomUUID().toString())
                    .build());
        }
        if (refundedAmount > 0) {
            markRefunded(order, buyer, refundedAmount, refundStatus);
        }
        return order;
    }

    /**
     * <b>결제를 시작만 하고 서명하지 않은</b> 주문 — D-83 재현용.
     *
     * <p>티켓도 발급되지 않고 온체인 카운터도 움직이지 않는다. 서버에 남는 것은 주문 한 줄과
     * {@code payment} 한 줄뿐이다. {@code orderStatus}로 "만료돼 취소된 주문"과 "아직 살아 있는
     * 주문"을 가른다 — 집계 게이트가 이 둘을 다르게 봐야 한다.
     *
     * <p>{@code payment}는 SQL로 넣는다. 엔티티에는 {@code REQUESTED} → {@code AWAITING_SIGNATURE}
     * 전이가 {@code chain_job} id를 요구하는데(서명 요청을 내려준 뒤라는 뜻), 이 픽스처가 검증하려는
     * 것은 그 배선이 아니라 <b>남겨진 행 하나</b>다.
     */
    public TicketOrder placeUnsignedPayment(World world, Member buyer, Team selectedTeam,
                                            long amount, TicketOrder.Status orderStatus,
                                            Payment.Status paymentStatus) {
        TicketOrder order = ticketOrderRepository.save(TicketOrder.builder()
                .performance(world.performance())
                .member(buyer)
                .orderRef("0x" + UUID.randomUUID().toString().replace("-", "")
                        + UUID.randomUUID().toString().replace("-", "").substring(0, 32))
                .totalAmount(amount)
                .totalQuantity(1)
                .selectedTeam(selectedTeam)
                .paymentExpiresAt(LocalDateTime.now().minusMinutes(1))
                .build());
        if (orderStatus == TicketOrder.Status.CANCELLED) {
            order.cancel();
            ticketOrderRepository.save(order);
        }
        Long walletId = linkWallet(buyer,
                walletAddress(Math.toIntExact(buyer.getMemberId()) + 100_000));
        jdbcTemplate.update("INSERT INTO payment (ticket_order_id, payer_wallet_id, amount, "
                        + "status, idempotency_key, requested_at) VALUES (?, ?, ?, ?, ?, NOW(6))",
                order.getTicketOrderId(), walletId, amount, paymentStatus.name(),
                "pay-" + UUID.randomUUID());
        return order;
    }

    /** 관객 하나를 새로 만든다. 팀 리더가 자기 공연 표를 사는 것도 가능하지만 헷갈려서 나눈다. */
    public Member createAudience() {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        return memberRepository.save(Member.builder()
                .email("audience-" + tag + "@b204.test")
                .name("관객")
                .authProvider(Member.AuthProvider.GOOGLE)
                .countryCode("KR")
                .build());
    }

    /**
     * 환불 이력을 만든다.
     *
     * <p>{@code refund} 엔티티는 {@code payment}·{@code wallet} FK가 필수라 SQL로 최소 배선만 만든다.
     * 정산이 보는 것은 {@code ticket_order_id}·{@code refund_amount}·{@code status}뿐이다.
     */
    private void markRefunded(TicketOrder order, Member buyer, long refundedAmount,
                              Refund.Status refundStatus) {
        // wallet.member_id 가 UNIQUE 라 회원당 한 번만 만든다.
        jdbcTemplate.update("INSERT IGNORE INTO wallet (member_id, provider, address, "
                        + "verified_at, status, created_at) "
                        + "VALUES (?, 'WEB3AUTH', ?, NOW(6), 'LINKED', NOW(6))",
                buyer.getMemberId(),
                walletAddress(Math.toIntExact(buyer.getMemberId()) + 100_000));
        Long walletId = jdbcTemplate.queryForObject(
                "SELECT wallet_id FROM wallet WHERE member_id = ?", Long.class,
                buyer.getMemberId());

        jdbcTemplate.update("INSERT INTO payment (ticket_order_id, payer_wallet_id, amount, "
                        + "status, idempotency_key, requested_at) VALUES (?, ?, ?, 'PAID', ?, NOW(6))",
                order.getTicketOrderId(), walletId, order.getTotalAmount(),
                "pay-" + UUID.randomUUID());
        Long paymentId = jdbcTemplate.queryForObject(
                "SELECT payment_id FROM payment WHERE ticket_order_id = ?", Long.class,
                order.getTicketOrderId());

        List<Long> ticketIds = jdbcTemplate.queryForList(
                "SELECT ticket_id FROM ticket WHERE ticket_order_id = ?", Long.class,
                order.getTicketOrderId());
        for (Long ticketId : ticketIds) {
            jdbcTemplate.update("INSERT INTO refund (ticket_id, ticket_order_id, payment_id, "
                            + "receiver_wallet_id, reason, original_amount, fee, refund_amount, "
                            + "status, retry_count, idempotency_key, requested_at) "
                            + "VALUES (?, ?, ?, ?, 'CUSTOMER_CANCEL', ?, ?, ?, ?, 0, ?, NOW(6))",
                    ticketId, order.getTicketOrderId(), paymentId, walletId,
                    order.getTotalAmount() / ticketIds.size(),
                    (order.getTotalAmount() / ticketIds.size()) - (refundedAmount / ticketIds.size()),
                    refundedAmount / ticketIds.size(), refundStatus.name(), "rf-" + UUID.randomUUID());
            if (refundStatus == Refund.Status.COMPLETED) {
                // 환불이 확정된 티켓만 죽는다. FAILED 는 온체인에서 아무 일도 없었다는 뜻이다.
                jdbcTemplate.update("UPDATE ticket SET status = 'CANCELLED' WHERE ticket_id = ?",
                        ticketId);
            }
        }
    }

    /**
     * 팀 리더 지갑을 {@code wallet} 테이블에 등록하고 참여팀 주소를 그 주소로 맞춘다.
     *
     * <p><b>주소를 새로 뽑는 이유</b>: {@code createWorld}가 쓰는 {@code walletAddress(i)}는
     * 팀 인덱스만 반영해 <b>모든 world 가 같은 주소</b>를 갖는다(verify 테스트가 그 값을 온체인
     * {@code teamWallets}로 그대로 쓴다). 그런데 {@code wallet.address}는 UNIQUE고 컨테이너는
     * 클래스 전체가 공유하므로, 두 번째 world 가 같은 주소를 등록하려 하면 조용히 무시된다.
     * 회원 PK에서 뽑은 주소로 갈아 두면 world 마다 다르고, 등록하지 않은 world 의 주소가 앞선
     * 테스트의 지갑에 <b>우연히 맞아버리는</b> 일도 없다.
     *
     * <p>{@code createWorld}가 기본으로 하지 않는 이유: 등록되지 않은 수령 주소를 만나도
     * 확정 반영이 조용히 넘어가야 한다는 것 자체가 검증 대상이다.
     *
     * @return 팀 순서(= {@code on_chain_index})대로의 {@code wallet_id}
     */
    public List<Long> linkLeaderWallets(World world) {
        List<Long> walletIds = new ArrayList<>();
        for (int i = 0; i < world.leaders().size(); i++) {
            Member leader = world.leaders().get(i);
            String address = walletAddress(Math.toIntExact(leader.getMemberId()) + 500_000);
            jdbcTemplate.update("UPDATE performance_participant SET wallet_address = ? "
                            + "WHERE performance_id = ? AND team_id = ?",
                    address, world.performance().getPerformanceId(),
                    world.teams().get(i).getTeamId());
            walletIds.add(linkWallet(leader, address));
        }
        return walletIds;
    }

    /** 지갑 하나를 등록한다. {@code wallet.member_id}가 UNIQUE라 회원당 한 번만 만들어진다. */
    public Long linkWallet(Member member, String address) {
        jdbcTemplate.update("INSERT IGNORE INTO wallet (member_id, provider, address, "
                        + "verified_at, status, created_at) "
                        + "VALUES (?, 'WEB3AUTH', ?, NOW(6), 'LINKED', NOW(6))",
                member.getMemberId(), address);
        return jdbcTemplate.queryForObject("SELECT wallet_id FROM wallet WHERE member_id = ?",
                Long.class, member.getMemberId());
    }

    /** 이의제기 마감을 과거로 민다 — 48시간을 실제로 기다릴 수 없다. */
    public void expireDisputeDeadline(Long settlementId) {
        jdbcTemplate.update(
                "UPDATE settlement SET dispute_deadline_at = NOW(6) - INTERVAL 1 MINUTE "
                        + "WHERE settlement_id = ?", settlementId);
    }

    private static String walletAddress(int seed) {
        return "0x" + String.format("%040d", seed + 1);
    }
}
