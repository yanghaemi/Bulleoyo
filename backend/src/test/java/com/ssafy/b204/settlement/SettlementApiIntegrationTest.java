package com.ssafy.b204.settlement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.worker.ChainOwnership;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.entity.PerformanceParticipant;
import com.ssafy.b204.payment.entity.Payment;
import com.ssafy.b204.refund.entity.Refund;
import com.ssafy.b204.rule.entity.SettlementRule;
import com.ssafy.b204.settlement.dto.SettlementDtos.ActionState;
import com.ssafy.b204.settlement.dto.SettlementDtos.Actions;
import com.ssafy.b204.settlement.dto.SettlementDtos.ApprovalResponse;
import com.ssafy.b204.settlement.dto.SettlementDtos.AggregateResponse;
import com.ssafy.b204.settlement.dto.SettlementDtos.DisputeRequest;
import com.ssafy.b204.settlement.dto.SettlementDtos.DisputeResponse;
import com.ssafy.b204.settlement.dto.SettlementDtos.MyTeam;
import com.ssafy.b204.settlement.dto.SettlementDtos.PublicSettlementResponse;
import com.ssafy.b204.settlement.dto.SettlementDtos.ReleaseResponse;
import com.ssafy.b204.settlement.dto.SettlementDtos.SettlementDetailResponse;
import com.ssafy.b204.settlement.dto.SettlementDtos.ShareItem;
import com.ssafy.b204.settlement.dto.SettlementDtos.ShareLinkResponse;
import com.ssafy.b204.settlement.dto.SettlementDtos.TransactionItem;
import com.ssafy.b204.settlement.entity.Settlement;
import com.ssafy.b204.settlement.repository.SettlementChainJobRepository;
import com.ssafy.b204.settlement.repository.SettlementRepository;
import com.ssafy.b204.settlement.service.SettlementChainReader;
import com.ssafy.b204.settlement.service.SettlementConfirmationService;
import com.ssafy.b204.settlement.service.SettlementGates;
import com.ssafy.b204.settlement.service.SettlementService;
import com.ssafy.b204.support.Bearer;
import com.ssafy.b204.support.IntegrationTestBase;
import com.ssafy.b204.support.LiveApiSpecRecorder;
import com.ssafy.b204.common.security.JwtTokenProvider;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import com.ssafy.b204.team.entity.Team;
import com.ssafy.b204.ticket.entity.TicketOrder;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.mockito.InOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import com.ssafy.b204.settlement.service.SettlementScheduler;
import com.ssafy.b204.settlement.repository.DisputeRepository;

/**
 * settlement 도메인 통합 테스트 — Testcontainers(MySQL·Redis) + Fake 체인.
 *
 * <p>H2를 쓰지 않는다. 스키마 정본이 MySQL {@code ENUM}이고 {@code settlement.status}가 그 위에
 * 올라가 있어, H2에서는 <b>거짓 통과</b>한다({@code IntegrationTestBase} 참조).
 *
 * <p>체인은 {@link FakeSettlementChainReader}로 대체한다. 실체인 값은 테스트가 정할 수 없고,
 * 이 도메인의 게이트는 대부분 "체인이 뭐라고 하는가"에 걸려 있다.
 *
 * <p>커버하는 케이스는 settlement-api §9 목록 그대로다 — 대사 불일치 409 + 상태 유지 · 열린 이의 ·
 * 마감 전 release · {@code releaseHalted} · 멱등키 재호출 · 상태 역행.
 */
@AutoConfigureMockMvc
class SettlementApiIntegrationTest extends IntegrationTestBase {

    @Autowired SettlementService settlementService;
    @Autowired SettlementGates gates;
    @Autowired SettlementConfirmationService confirmationService;
    @Autowired com.ssafy.b204.chain.service.ChainJobConfirmationService chainConfirmations;
    @Autowired SettlementRepository settlementRepository;
    @Autowired SettlementChainJobRepository chainJobRepository;
    @Autowired DisputeRepository disputeRepository;
    @Autowired SettlementTestFixture fixture;
    @Autowired FakeSettlementChainReader chain;
    @Autowired SettlementChainReader injectedReader;

    /** 서비스 트랜잭션에 합류해 같은 영속성 컨텍스트를 본다 — 낡은 인스턴스를 만드는 데 쓴다. */
    @PersistenceContext EntityManager em;

    // spy 는 IntegrationTestBase 에 있다(컨텍스트 공유 — S15P21B204-182). 진짜 빈이 그대로 돈다.
    //  · settlementShareRepository — approvedCount 를 어디서 세는지 고정한다.
    //  · performanceRepository — 공연 로드 직후에 끼어들어 낡은 인스턴스를 만든다.
    //  · balanceRefresher — 수령 지갑 캐시 갱신은 호출 사실만 고정한다(실체인이 없어 결과값을 단정할
    //    수 없다). 예외 주입이 필요한 케이스에서만 doThrow 로 덮는다.
    //  · supplyReconciler — release 게이트의 ReleaseHaltGuard 다. 발행량 대사 판정은 isReleaseHalted()
    //    스텁으로 정한다(기본 false — setUp).
    @Autowired ChainOwnership chainOwnership;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired MockMvc mvc;
    @Autowired JwtTokenProvider tokens;
    @Autowired com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    private SettlementTestFixture.World world;
    private MemberPrincipal hostLeader;

    /** 요구사항 §7.3 예시와 같은 모양 — 3팀 · 5000/5000 · 3334/3333/3333. */
    @BeforeEach
    void setUp() {
        chain.reset();
        doReturn(false).when(supplyReconciler).isReleaseHalted();
        world = fixture.createWorld(5000, 5000, new int[]{3334, 3333, 3333});
        hostLeader = principal(world.hostLeader());
    }

    @AfterEach
    void tearDown() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    @DisplayName("Fake 체인 리더가 실제로 주입된다 — 이 테스트가 무엇을 검증하는지 고정한다")
    void fakeIsWired() {
        assertThat(injectedReader).isSameAs(chain);
    }

    // ================================================================ 대사(API-settlement-02)

    @Nested
    @DisplayName("집계 확정 — 대사가 이 API의 존재 이유다")
    class Aggregate {

        @Test
        @DisplayName("온체인 카운터와 서버 집계가 어긋나면 409 + 상태는 NONE 그대로")
        void mismatchKeepsStatus() {
            Member audience = fixture.createAudience();
            fixture.placeOrder(world, audience, world.teams().get(0), 5, 10_000L, 0);
            chain.escrow = 50_000L;
            chain.counts = new long[]{4, 0, 0}; // 체인은 4표라고 말한다 — 서버는 5표
            chain.payouts = null;

            assertThatThrownBy(() -> settlementService.aggregate(hostLeader, performanceId()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SETTLEMENT_AGGREGATE_MISMATCH);

            Settlement settlement = settlement();
            assertThat(settlement.getStatus()).isEqualTo(Settlement.Status.NONE);
            // 왜 막혔는지는 남는다 — 별도 트랜잭션으로 커밋했기 때문이다.
            assertThat(settlement.getCounterMatch()).isFalse();
            assertThat(aggregateJobs()).isEmpty();
        }

        @Test
        @DisplayName("에스크로 금액이 어긋나도 409 — 표만 맞으면 통과시키지 않는다")
        void escrowMismatch() {
            Member audience = fixture.createAudience();
            fixture.placeOrder(world, audience, world.teams().get(0), 5, 10_000L, 0);
            chain.escrow = 49_000L;
            chain.counts = new long[]{5, 0, 0};

            assertThatThrownBy(() -> settlementService.aggregate(hostLeader, performanceId()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SETTLEMENT_AGGREGATE_MISMATCH);
        }

        @Test
        @DisplayName("체인을 읽을 수 없으면 통과가 아니라 불일치다")
        void chainUnavailableBlocks() {
            chain.available = false;

            assertThatThrownBy(() -> settlementService.aggregate(hostLeader, performanceId()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SETTLEMENT_AGGREGATE_MISMATCH);
        }

        @Test
        @DisplayName("환불 이력이 있는 주문의 표는 전량 빠진다(A-2) — 그래야 체인과 맞는다")
        void refundedOrderLosesAllVotes() {
            Member a = fixture.createAudience();
            Member b = fixture.createAudience();
            fixture.placeOrder(world, a, world.teams().get(0), 3, 10_000L, 0);
            // 2매 주문을 절반만 환불했는데도 표는 전량 빠지고, 취소 수수료 10,000원은 escrow 에 남는다.
            fixture.placeOrder(world, b, world.teams().get(1), 2, 10_000L, 10_000L);

            chain.escrow = 40_000L; // 30,000(정상) + 10,000(취소 수수료 잔액)
            chain.counts = new long[]{3, 0, 0};
            chain.payouts = expectedPayouts(40_000L, new long[]{3, 0, 0});

            AggregateResponse response = settlementService.aggregate(hostLeader, performanceId());

            assertThat(response.validTicketCount()).isEqualTo(3);
            assertThat(response.status()).isEqualTo("PENDING");
        }

        @Test
        @DisplayName("202 시점에는 상태를 바꾸지 않는다 — tx가 아직 전송조차 안 됐다")
        void acceptedDoesNotTransition() {
            seedSales();
            AggregateResponse response = settlementService.aggregate(hostLeader, performanceId());

            assertThat(response.jobId()).startsWith("chain_");
            assertThat(response.nextStatus()).isEqualTo("AGGREGATED");
            assertThat(response.signerType()).isEqualTo("OPERATOR");
            assertThat(settlement().getStatus()).isEqualTo(Settlement.Status.NONE);
            assertThat(aggregateJobs()).hasSize(1)
                    .allMatch(job -> job.getStatus() == ChainJob.Status.PENDING);
        }

        @Test
        @DisplayName("공연이 ENDED 가 아니면 막는다")
        void notEnded() {
            jdbc().update("UPDATE performance SET status='ON_SALE' WHERE performance_id = ?",
                    performanceId());
            seedSales();

            assertThatThrownBy(() -> settlementService.aggregate(hostLeader, performanceId()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.PERFORMANCE_INVALID_STATUS);
        }

        @Test
        @DisplayName("서명이 끝나지 않은 결제가 남아 있으면 COIN_MINT_PENDING")
        void paymentInFlight() {
            seedSales();
            jdbc().update("INSERT INTO chain_job (tx_type, signer_type, fee_delegated, issuer_type,"
                            + " target_performance_id, status, confirmations, retry_count, requested_at)"
                            + " VALUES ('PURCHASE','USER',1,'MOCK',?,'SUBMITTED',0,0,NOW(6))",
                    performanceId());

            assertThatThrownBy(() -> settlementService.aggregate(hostLeader, performanceId()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.COIN_MINT_PENDING);
        }

        @Test
        @DisplayName("만료돼 취소된 주문의 미서명 결제는 집계를 막지 않는다(D-83)")
        void expiredOrderUnsignedPaymentDoesNotBlock() {
            seedSales();
            // 관객이 결제를 시작만 하고 서명하지 않았다 — 15분 뒤 주문은 CANCELLED 가 됐지만
            // payment 행은 AWAITING_SIGNATURE 로 남아 있다. 온체인에서는 아무 일도 없었다.
            fixture.placeUnsignedPayment(world, fixture.createAudience(), world.teams().get(0),
                    10_000L, TicketOrder.Status.CANCELLED, Payment.Status.AWAITING_SIGNATURE);

            AggregateResponse response = settlementService.aggregate(hostLeader, performanceId());

            assertThat(response.status()).isEqualTo("PENDING");
            assertThat(response.validTicketCount()).isEqualTo(6);
        }

        @Test
        @DisplayName("주문이 취소됐어도 PAYING 결제가 있으면 막는다 — 대납 tx 가 이미 나갔다")
        void cancelledOrderPayingPaymentStillBlocks() {
            seedSales();
            // 대납 전송까지 끝난 tx 는 주문이 만료된 뒤에도 뒤늦게 채굴돼 카운터를 올릴 수 있다.
            // chain_job 이 유실 판정(CHAIN_TX_TIMEOUT)으로 닫히면 in-flight 검사에서도 빠지므로
            // payment 의 PAYING 자체가 마지막 방어선이다.
            fixture.placeUnsignedPayment(world, fixture.createAudience(), world.teams().get(0),
                    10_000L, TicketOrder.Status.CANCELLED, Payment.Status.PAYING);

            assertThatThrownBy(() -> settlementService.aggregate(hostLeader, performanceId()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.COIN_MINT_PENDING);
        }

        @Test
        @DisplayName("아직 살아 있는 주문의 미서명 결제는 여전히 COIN_MINT_PENDING")
        void pendingOrderUnsignedPaymentStillBlocks() {
            seedSales();
            fixture.placeUnsignedPayment(world, fixture.createAudience(), world.teams().get(0),
                    10_000L, TicketOrder.Status.PENDING_PAYMENT, Payment.Status.AWAITING_SIGNATURE);

            assertThatThrownBy(() -> settlementService.aggregate(hostLeader, performanceId()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.COIN_MINT_PENDING);
        }

        @Test
        @DisplayName("생성자도 ADMIN도 아니면 403")
        void notOwner() {
            seedSales();
            assertThatThrownBy(() ->
                    settlementService.aggregate(principal(world.leaders().get(1)), performanceId()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.PERFORMANCE_NOT_OWNER);
        }
    }

    // ================================================================ 확정 반영

    @Nested
    @DisplayName("확정 반영 — 상태 전이는 receipt 확정 뒤에만 일어난다")
    class Confirmation {

        @Test
        @DisplayName("AGGREGATE 확정 → AGGREGATED + 팀별 분배액 저장(계산기와 같은 값)")
        void aggregateConfirmed() {
            seedSales();
            settlementService.aggregate(hostLeader, performanceId());
            confirmJob(ChainJob.TxType.AGGREGATE);

            confirmationService.applyConfirmedJobs();

            Settlement settlement = settlement();
            assertThat(settlement.getStatus()).isEqualTo(Settlement.Status.AGGREGATED);
            assertThat(settlement.getTotalRevenue()).isEqualTo(chain.escrow);
            assertThat(settlement.getCounterMatch()).isTrue();

            long[] expected = expectedPayouts(chain.escrow, chain.counts);
            List<Long> actual = settlementShareRepository
                    .findBySettlement_SettlementId(settlement.getSettlementId()).stream()
                    .map(share -> share.getTotalAmount()).toList();
            assertThat(actual).containsExactlyInAnyOrder(expected[0], expected[1], expected[2]);
            assertThat(actual.stream().mapToLong(Long::longValue).sum()).isEqualTo(chain.escrow);
        }

        @Test
        @DisplayName("서버 재계산 != 온체인 payout 이면 전이하지 않는다(불변식 3)")
        void payoutMismatchBlocksTransition() {
            seedSales();
            settlementService.aggregate(hostLeader, performanceId());
            // 체인이 1원 다른 값을 확정했다고 하자 — 그러면 서버는 넘어가면 안 된다.
            long[] tampered = expectedPayouts(chain.escrow, chain.counts).clone();
            tampered[0] += 1;
            chain.payouts = tampered;
            confirmJob(ChainJob.TxType.AGGREGATE);

            confirmationService.applyConfirmedJobs();

            assertThat(settlement().getStatus()).isEqualTo(Settlement.Status.NONE);
            assertThat(settlementShareRepository
                    .findBySettlement_SettlementId(settlement().getSettlementId())).isEmpty();
        }

        @Test
        @DisplayName("LOCK 확정 → DISPUTE_OPEN + 이의제기 마감 48시간")
        void lockConfirmed() {
            aggregated();
            settlementService.lock(hostLeader, performanceId());
            confirmJob(ChainJob.TxType.LOCK);

            confirmationService.applyConfirmedJobs();

            Settlement settlement = settlement();
            assertThat(settlement.getStatus()).isEqualTo(Settlement.Status.DISPUTE_OPEN);
            assertThat(settlement.getLockedAt()).isNotNull();
            assertThat(settlement.getDisputeDeadlineAt())
                    .isAfter(settlement.getLockedAt().plusHours(47))
                    .isBefore(settlement.getLockedAt().plusHours(49));
        }

        @Test
        @DisplayName("여러 번 훑어도 결과가 같다 — 반영 여부를 상태로 판정하기 때문")
        void sweepIsIdempotent() {
            aggregated();
            settlementService.lock(hostLeader, performanceId());
            confirmJob(ChainJob.TxType.LOCK);

            assertThat(confirmationService.applyConfirmedJobs()).isEqualTo(1);
            assertThat(confirmationService.applyConfirmedJobs()).isZero();
            assertThat(settlement().getStatus()).isEqualTo(Settlement.Status.DISPUTE_OPEN);
        }
    }

    // ================================================================ 상태 기계

    @Nested
    @DisplayName("상태 기계 — 역행·건너뛰기를 코드가 막는다")
    class StateMachine {

        @Test
        @DisplayName("집계 전에 잠글 수 없다")
        void lockBeforeAggregate() {
            seedSales();
            settlementService.aggregate(hostLeader, performanceId()); // 아직 확정 전(NONE)

            assertThatThrownBy(() -> settlementService.lock(hostLeader, performanceId()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SETTLEMENT_NOT_LOCKED);
        }

        @Test
        @DisplayName("이미 집계된 정산을 다시 집계할 수 없다")
        void aggregateTwice() {
            aggregated();

            assertThatThrownBy(() -> settlementService.aggregate(hostLeader, performanceId()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.COMMON_CONFLICT);
        }

        @Test
        @DisplayName("release 된 정산은 모든 진입을 거절한다(종단)")
        void releasedIsTerminal() {
            released();

            assertThatThrownBy(() -> settlementService.aggregate(hostLeader, performanceId()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SETTLEMENT_ALREADY_RELEASED);
            assertThatThrownBy(() -> settlementService.lock(hostLeader, performanceId()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SETTLEMENT_ALREADY_RELEASED);
        }

        @Test
        @DisplayName("HALTED 는 종단 — 읽어서 거절만 하고 이 도메인이 전이시키지 않는다")
        void haltedIsTerminal() {
            aggregated();
            jdbc().update("UPDATE settlement SET status='HALTED' WHERE settlement_id = ?",
                    settlement().getSettlementId());

            assertThatThrownBy(() -> settlementService.lock(hostLeader, performanceId()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.PERFORMANCE_INVALID_STATUS);
        }

        @Test
        @DisplayName("취소된 공연은 잠글 수 없다 — 실행되지 않을 정산에 48시간을 열 이유가 없다")
        void cancelledPerformanceBlocksLock() {
            aggregated();
            // 취소 접수 직후 구간 — halt 확정 전이라 정산은 아직 AGGREGATED 다.
            jdbc().update("UPDATE performance SET status = 'CANCELLED' WHERE performance_id = ?",
                    performanceId());

            assertThatThrownBy(() -> settlementService.lock(hostLeader, performanceId()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.PERFORMANCE_INVALID_STATUS);
        }
    }

    // ================================================================ 이의제기

    @Nested
    @DisplayName("이의제기(API-settlement-04)")
    class Disputes {

        @Test
        @DisplayName("잠기기 전에는 이의를 제기할 수 없다")
        void beforeLock() {
            aggregated();
            assertThatThrownBy(() -> settlementService.dispute(principal(world.leaders().get(1)),
                    performanceId(), disputeRequest(world.teams().get(1))))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SETTLEMENT_NOT_LOCKED);
        }

        @Test
        @DisplayName("팀 리더가 아니면 403, 팀당 열린 이의는 1건")
        void leaderOnlyAndOnePerTeam() {
            locked();
            Team team = world.teams().get(1);

            assertThatThrownBy(() -> settlementService.dispute(principal(world.leaders().get(2)),
                    performanceId(), disputeRequest(team)))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.COMMON_FORBIDDEN);

            assertThat(settlementService.dispute(principal(world.leaders().get(1)),
                    performanceId(), disputeRequest(team)).status()).isEqualTo("OPEN");

            assertThatThrownBy(() -> settlementService.dispute(principal(world.leaders().get(1)),
                    performanceId(), disputeRequest(team)))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.COMMON_CONFLICT);
        }

        @Test
        @DisplayName("접수 응답의 releaseHeld 는 true — 방금 받은 OPEN 이의가 release 를 붙잡는다")
        void releaseHeldOnSubmit() {
            locked();
            DisputeResponse submitted = settlementService.dispute(
                    principal(world.leaders().get(1)), performanceId(),
                    disputeRequest(world.teams().get(1)));

            assertThat(submitted.releaseHeld()).isTrue();
            // 같은 이의를 상세(API-settlement-01)로 읽어도 같은 답이어야 한다.
            assertThat(settlementService.detail(hostLeader, performanceId()).disputes())
                    .filteredOn(d -> d.disputeId().equals(submitted.disputeId()))
                    .allMatch(DisputeResponse::releaseHeld);
        }

        @Test
        @DisplayName("사유가 10자 미만이면 400")
        void reasonTooShort() {
            locked();
            assertThatThrownBy(() -> settlementService.dispute(principal(world.leaders().get(1)),
                    performanceId(), new DisputeRequest(world.teams().get(1).getTeamId(), "짧다", 1L)))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.COMMON_VALIDATION_FAILED);
        }

        @Test
        @DisplayName("마감이 지나면 더 받지 않는다")
        void afterDeadline() {
            locked();
            fixture.expireDisputeDeadline(settlement().getSettlementId());

            assertThatThrownBy(() -> settlementService.dispute(principal(world.leaders().get(1)),
                    performanceId(), disputeRequest(world.teams().get(1))))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.COMMON_CONFLICT);
        }
    }

    // ================================================================ release

    @Nested
    @DisplayName("release(API-settlement-05) — 게이트가 이 API의 전부다")
    class Release {

        @Test
        @DisplayName("Idempotency-Key 가 없으면 400")
        void missingIdempotencyKey() {
            locked();
            fixture.expireDisputeDeadline(settlement().getSettlementId());
            withoutIdempotencyKey();

            assertThatThrownBy(() -> settlementService.release(hostLeader, performanceId(), null))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.COMMON_VALIDATION_FAILED);
        }

        @Test
        @DisplayName("이의제기 기간 중에는 막고, 마감 시각을 문구에 넣는다")
        void duringDisputePeriod() {
            locked();
            withIdempotencyKey();

            assertThatThrownBy(() -> settlementService.release(hostLeader, performanceId(), null))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(e -> {
                        BusinessException be = (BusinessException) e;
                        assertThat(be.getErrorCode()).isEqualTo(ErrorCode.SETTLEMENT_DISPUTE_PERIOD);
                        assertThat(be.getMsg()).isNotEqualTo(
                                ErrorCode.SETTLEMENT_DISPUTE_PERIOD.getDefaultMsg());
                    });
        }

        @Test
        @DisplayName("열린 이의가 있으면 마감이 지나도 막는다")
        void openDisputeBlocks() {
            locked();
            settlementService.dispute(principal(world.leaders().get(1)), performanceId(),
                    disputeRequest(world.teams().get(1)));
            fixture.expireDisputeDeadline(settlement().getSettlementId());
            withIdempotencyKey();

            assertThatThrownBy(() -> settlementService.release(hostLeader, performanceId(), null))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SETTLEMENT_DISPUTE_PERIOD);
        }

        @Test
        @DisplayName("취소된 공연은 막는다 — 에스크로는 관객에게 돌아갈 환불 재원이다")
        void cancelledPerformanceBlocks() {
            locked();
            fixture.expireDisputeDeadline(settlement().getSettlementId());
            // 취소 접수 직후 구간 — halt 확정 전이라 정산은 아직 LOCKED 다.
            jdbc().update("UPDATE performance SET status = 'CANCELLED' WHERE performance_id = ?",
                    performanceId());
            withIdempotencyKey();

            assertThatThrownBy(() -> settlementService.release(hostLeader, performanceId(), null))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.PERFORMANCE_INVALID_STATUS);
        }

        @Test
        @DisplayName("발행량 대사가 깨져 있으면 COIN_RESERVE_MISMATCH")
        void releaseHalted() {
            locked();
            fixture.expireDisputeDeadline(settlement().getSettlementId());
            doReturn(true).when(supplyReconciler).isReleaseHalted();
            withIdempotencyKey();

            assertThatThrownBy(() -> settlementService.release(hostLeader, performanceId(), null))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.COIN_RESERVE_MISMATCH);
        }

        @Test
        @DisplayName("에스크로가 분배 합계보다 적으면 COIN_ESCROW_INSUFFICIENT")
        void escrowInsufficient() {
            locked();
            fixture.expireDisputeDeadline(settlement().getSettlementId());
            chain.escrow = 1L; // release 직전에 에스크로가 비었다면 보내면 안 된다
            withIdempotencyKey();

            assertThatThrownBy(() -> settlementService.release(hostLeader, performanceId(), null))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.COIN_ESCROW_INSUFFICIENT);
        }

        /**
         * 락 앞 선행 게이트가 에스크로 RPC 보다 먼저다(S15P21B204-120) — 스케줄러가 매 분 부르는
         * 막힐 요청이 노드를 치지 않고, 게이트 코드가 {@code COIN_ESCROW_INSUFFICIENT}를 앞선다.
         */
        @Test
        @DisplayName("이의제기 기간 중이면 에스크로를 조회하지 않고 SETTLEMENT_DISPUTE_PERIOD")
        void disputePeriodRejectsBeforeEscrowRead() {
            locked();
            chain.escrow = 1L; // 순서가 뒤집히면 COIN_ESCROW_INSUFFICIENT 가 먼저 난다
            withIdempotencyKey();
            chain.clearCallLog();

            assertThatThrownBy(() -> settlementService.release(hostLeader, performanceId(), null))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SETTLEMENT_DISPUTE_PERIOD);
            assertThat(chain.escrowOfCalls).isZero();
        }

        @Test
        @DisplayName("이미 RELEASED 면 에스크로가 모자라도 SETTLEMENT_ALREADY_RELEASED")
        void releasedWinsOverEscrowInsufficient() {
            released();
            chain.escrow = 1L;
            withIdempotencyKey();

            assertThatThrownBy(() -> settlementService.release(hostLeader, performanceId(), null))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SETTLEMENT_ALREADY_RELEASED);
        }

        @Test
        @DisplayName("수령 지갑이 비어 있는 팀이 있으면 막는다")
        void missingWallet() {
            locked();
            fixture.expireDisputeDeadline(settlement().getSettlementId());
            jdbc().update("UPDATE settlement_share SET wallet_address = NULL "
                    + "WHERE settlement_id = ?", settlement().getSettlementId());
            withIdempotencyKey();

            assertThatThrownBy(() -> settlementService.release(hostLeader, performanceId(), null))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.COMMON_CONFLICT);
        }

        @Test
        @DisplayName("같은 멱등키 재호출은 새 job 을 만들지 않는다")
        void idempotentReplay() {
            locked();
            fixture.expireDisputeDeadline(settlement().getSettlementId());
            String key = withIdempotencyKey();

            ReleaseResponse first = settlementService.release(hostLeader, performanceId(), null);
            ReleaseResponse second = settlementService.release(hostLeader, performanceId(), null);

            assertThat(second.jobId()).isEqualTo(first.jobId());
            assertThat(jobs(ChainJob.TxType.RELEASE)).hasSize(1);
            assertThat(chainJobRepository.findByIdempotencyKey(key)).isPresent();
        }

        @Test
        @DisplayName("release 확정 → RELEASED + 팀별 수령 표시 + 보증금 반환 job 연쇄")
        void releaseConfirmed() {
            released();

            Settlement settlement = settlement();
            assertThat(settlement.getStatus()).isEqualTo(Settlement.Status.RELEASED);
            assertThat(settlementShareRepository
                    .findBySettlement_SettlementId(settlement.getSettlementId()))
                    .allMatch(share -> share.isReleased());
            assertThat(jobs(ChainJob.TxType.DEPOSIT_RETURN)).hasSize(1);
        }

        @Test
        @DisplayName("DEPOSIT_RETURN 확정 → 공연 보증금 상태가 RETURNED")
        void depositReturned() {
            released();
            confirmJob(ChainJob.TxType.DEPOSIT_RETURN);
            confirmationService.applyConfirmedJobs();

            String status = jdbc().queryForObject(
                    "SELECT deposit_status FROM performance WHERE performance_id = ?",
                    String.class, performanceId());
            assertThat(status).isEqualTo("RETURNED");
        }

        @Test
        @DisplayName("자동 스케줄은 수동 API와 같은 게이트를 탄다")
        void automaticReleaseUsesSameGates() {
            locked();
            settlementService.dispute(principal(world.leaders().get(1)), performanceId(),
                    disputeRequest(world.teams().get(1)));
            fixture.expireDisputeDeadline(settlement().getSettlementId());

            assertThatThrownBy(() ->
                    settlementService.releaseAutomatically(settlement().getSettlementId()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SETTLEMENT_DISPUTE_PERIOD);
        }

        /**
         * 2026-09-10 리허설 회귀. 스케줄러 메서드에 {@code @Transactional(readOnly = true)}가 붙어
         * 있어 안에서 부른 {@code releaseAutomatically}({@code REQUIRED})가 읽기 전용 트랜잭션에
         * 합류했고, {@code chain_job} INSERT 가 {@code Connection is read-only}로 60초마다 실패했다.
         * 스케줄러 빈은 test 프로파일에 없어 프록시를 태운 재현은 불가능하다 — 그래서
         * ① 구조로 "트랜잭션 경계가 없다"를 고정하고 ② 메서드 본체가 실제로 job 을 만드는지 본다.
         */
        @Test
        @DisplayName("스케줄러 releaseDueSettlements 는 트랜잭션 경계를 갖지 않고, 마감 뒤 RELEASE job 을 만든다")
        void schedulerCreatesReleaseJobWithoutOwnTransaction() throws NoSuchMethodException {
            assertThat(SettlementScheduler.class.getAnnotation(Transactional.class))
                    .as("스케줄러 클래스에 @Transactional 이 없어야 한다").isNull();
            assertThat(SettlementScheduler.class.getMethod("releaseDueSettlements")
                    .getAnnotation(Transactional.class))
                    .as("releaseDueSettlements 에 @Transactional 이 없어야 한다 — readOnly 트랜잭션에 "
                            + "합류하면 서비스의 chain_job INSERT 가 거부된다").isNull();

            locked();
            fixture.expireDisputeDeadline(settlement().getSettlementId());
            // 소유권은 컨텍스트의 빈을 그대로 쓴다 — 테스트 프로파일은 instance-id 를 두지 않아
            // 언제나 "맡는다" 다(= 단일 인스턴스와 같은 동작).
            SettlementScheduler scheduler = new SettlementScheduler(
                    chainOwnership, confirmationService, chainConfirmations, settlementService,
                    settlementRepository, disputeRepository);

            scheduler.releaseDueSettlements();

            assertThat(jobs(ChainJob.TxType.RELEASE)).hasSize(1);
            ChainJob job = jobs(ChainJob.TxType.RELEASE).get(0);
            assertThat(job.getIdempotencyKey())
                    .isEqualTo("release:auto:" + settlement().getSettlementId());
            assertThat(job.getRequester()).as("자동 경로는 요청자가 없다").isNull();
        }

        /**
         * D-68(리허설 2). 열린 이의가 있으면 스케줄러가 조용히 {@code continue}해서, 대본이 확인
         * 지점으로 삼은 "보류" 줄이 어디에도 없었다. 게이트에 막힌 경우와 같은 {@code info} 한 줄을
         * 남기는지 로그로 확인한다 — 건너뛴다는 사실만 보고 넘어가면 이 결함이 다시 들어온다.
         */
        @Test
        @DisplayName("D-68 — 열린 이의로 자동 release 를 건너뛸 때 보류 로그를 남긴다")
        void schedulerLogsWhenSkippingForOpenDispute() {
            locked();
            settlementService.dispute(principal(world.leaders().get(1)), performanceId(),
                    disputeRequest(world.teams().get(1)));
            Long settlementId = settlement().getSettlementId();
            fixture.expireDisputeDeadline(settlementId);

            Logger schedulerLogger = (Logger) LoggerFactory.getLogger(SettlementScheduler.class);
            ListAppender<ILoggingEvent> appender = new ListAppender<>();
            appender.start();
            schedulerLogger.addAppender(appender);
            try {
                new SettlementScheduler(chainOwnership, confirmationService, chainConfirmations,
                        settlementService,
                        settlementRepository, disputeRepository).releaseDueSettlements();
            } finally {
                schedulerLogger.detachAppender(appender);
                appender.stop();
            }

            assertThat(jobs(ChainJob.TxType.RELEASE)).as("열린 이의면 tx 를 만들지 않는다").isEmpty();
            assertThat(appender.list)
                    .extracting(ILoggingEvent::getFormattedMessage)
                    .as("보류 사유가 로그에 남아야 한다")
                    .anyMatch(message -> message.contains("자동 release 보류")
                            && message.contains("열린 이의 있음")
                            && message.contains(String.valueOf(settlementId)));
        }

        /**
         * 락만으로는 부족했다. release 는 공연을 <b>이미 손에 들고</b> 들어오므로 락 파인더로 다시
         * 조회해도 그 인스턴스는 락 모드만 올라가고 상태가 갱신되지 않는다 — 게이트가 상대가 커밋한
         * {@code CANCELLED}를 못 본다. {@code em.refresh(performance, PESSIMISTIC_WRITE)}가
         * 그 자리를 대신한다. 락 경합 자체는 결정적으로 재현할 수 없지만(플래키) <b>낡은 인스턴스</b>는
         * 만들 수 있다 — 공연을 로드한 직후 행을 {@code CANCELLED}로 바꿔 둔다. 다시 읽지 않는
         * 구현은 그대로 통과해 {@code RELEASE} job 을 만든다.
         */
        @Test
        @DisplayName("release 는 락과 함께 공연 상태를 다시 읽는다 — 손에 든 인스턴스만 보면 취소를 놓친다")
        void releaseRereadsPerformanceUnderLock() {
            locked();
            fixture.expireDisputeDeadline(settlement().getSettlementId());
            withIdempotencyKey();
            // callRealMethod 는 쓸 수 없다(리포지토리는 인터페이스 프록시다). em.find 로 같은
            // 영속성 컨텍스트에 올려 두고 — 프록시가 아니라 즉시 로드된 인스턴스여야 한다 —
            // 그 뒤 행을 바꾼다. 같은 트랜잭션의 UPDATE 라 손에 든 인스턴스는 낡은 채 남는다.
            doAnswer(invocation -> {
                Optional<Performance> loaded = Optional.of(em.find(Performance.class, performanceId()));
                jdbc().update("UPDATE performance SET status = 'CANCELLED' WHERE performance_id = ?",
                        performanceId());
                return loaded;
            }).when(performanceRepository).findById(performanceId());

            assertThatThrownBy(() -> settlementService.release(hostLeader, performanceId(), null))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.PERFORMANCE_INVALID_STATUS);
        }

        /**
         * 스케줄러 선별은 정산 상태만 보고 {@code performance.status}를 전혀 보지 않는다. 게이트가
         * 공유돼 있어도 자동 경로는 {@code me == null}·{@code requirePermission == false}로 들어오니
         * 실제로 막히는지 경로째 확인한다(2026-09-10 회귀도 본체 직접 호출로는 안 잡혔다).
         */
        @Test
        @DisplayName("스케줄러도 취소된 공연의 RELEASE job 을 만들지 않는다")
        void schedulerSkipsCancelledPerformance() {
            locked();
            fixture.expireDisputeDeadline(settlement().getSettlementId());
            jdbc().update("UPDATE performance SET status = 'CANCELLED' WHERE performance_id = ?",
                    performanceId());

            new SettlementScheduler(chainOwnership, confirmationService, chainConfirmations,
                        settlementService,
                    settlementRepository, disputeRepository).releaseDueSettlements();

            assertThat(jobs(ChainJob.TxType.RELEASE)).isEmpty();
        }

        /**
         * 자동 release 교착 회귀(2026-09-16). 자동 경로의 멱등키는
         * {@code release:auto:{settlementId}} 고정인데 {@code releaseInternal}이 status 를 보지 않고
         * 재생해서, 한 번 FAILED 되면 스케줄러가 60초마다 <b>같은 죽은 job</b>을 돌려받고 새 job 을
         * 영영 만들지 못했다. 사람이 수동 API 에 새 UUID 를 줘야만 풀렸다.
         */
        @Test
        @DisplayName("자동 release 가 FAILED 되면 다음 주기에 새 job 을 만든다 — 교착이 풀린다")
        void automaticReleaseRecoversFromFailure() {
            locked();
            fixture.expireDisputeDeadline(settlement().getSettlementId());
            Long settlementId = settlement().getSettlementId();

            settlementService.releaseAutomatically(settlementId);
            ChainJob first = failLatestReleaseJob();

            settlementService.releaseAutomatically(settlementId);

            List<ChainJob> releases = jobs(ChainJob.TxType.RELEASE);
            assertThat(releases).as("새 RELEASE job 이 생겨야 한다").hasSize(2);
            ChainJob second = releases.get(1);
            assertThat(second.getChainJobId()).isNotEqualTo(first.getChainJobId());
            assertThat(second.getStatus()).isEqualTo(ChainJob.Status.PENDING);
            assertThat(second.getIdempotencyKey())
                    .as("새 job 이 정본 키를 쥔다").isEqualTo("release:auto:" + settlementId);
            assertThat(chainJobRepository.findById(first.getChainJobId()).orElseThrow())
                    .as("실패 이력은 지우지 않고 키만 밀어낸다")
                    .satisfies(old -> {
                        assertThat(old.getStatus()).isEqualTo(ChainJob.Status.FAILED);
                        assertThat(old.getIdempotencyKey())
                                .isEqualTo("release:auto:" + settlementId + "#failed:"
                                        + first.getChainJobId());
                    });
        }

        /**
         * 교착을 푸는 것만으로는 안 된다 — 스케줄러가 60초마다 부르므로 상한이 없으면 교착이
         * "60초마다 새 tx 를 보내며 가스를 태우는 무한 루프"가 된다. 자동 경로는 3회까지만 job 을
         * 만들고 그 뒤에는 멈춘다(수동 API 는 그대로 열려 있다).
         */
        @Test
        @DisplayName("자동 release 는 3회까지만 새 job 을 만들고 멈춘다")
        void automaticReleaseStopsAtAttemptCap() {
            locked();
            fixture.expireDisputeDeadline(settlement().getSettlementId());
            Long settlementId = settlement().getSettlementId();

            for (int attempt = 0; attempt < 3; attempt++) {
                settlementService.releaseAutomatically(settlementId);
                failLatestReleaseJob();
            }
            assertThat(jobs(ChainJob.TxType.RELEASE)).hasSize(3);

            assertThatThrownBy(() -> settlementService.releaseAutomatically(settlementId))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.COMMON_CONFLICT);
            assertThat(jobs(ChainJob.TxType.RELEASE))
                    .as("상한 뒤에는 새 job 이 생기지 않는다").hasSize(3);

            // 사람은 여전히 빠져나올 수 있다 — 수동 API 는 상한에 걸리지 않는다.
            withIdempotencyKey();
            settlementService.release(hostLeader, performanceId(), null);
            assertThat(jobs(ChainJob.TxType.RELEASE)).hasSize(4);
        }

        /**
         * 수동 경로도 FAILED 를 재생하지 않는다. 프론트({@code SettlementPage})는 마운트당 키
         * 하나를 쓰므로 재생하면 화면의 "다시 시도"가 실질적으로 동작하지 않는다 —
         * CREATE_SHOW·START_SALE 이 같은 이유로 이미 같은 예외를 두고 있다. 상한은 없다(사람이
         * 누르는 만큼이 곧 상한이다).
         */
        @Test
        @DisplayName("수동 release 도 같은 키로 FAILED 를 재시도하면 새 job 을 만든다")
        void manualReleaseRetriesWithSameKey() {
            locked();
            fixture.expireDisputeDeadline(settlement().getSettlementId());
            String key = withIdempotencyKey();

            ReleaseResponse first = settlementService.release(hostLeader, performanceId(), null);
            failLatestReleaseJob();
            ReleaseResponse second = settlementService.release(hostLeader, performanceId(), null);

            assertThat(second.jobId()).isNotEqualTo(first.jobId());
            assertThat(second.status()).isEqualTo(ChainJob.Status.PENDING.name());
            assertThat(jobs(ChainJob.TxType.RELEASE)).hasSize(2);
            assertThat(chainJobRepository.findByIdempotencyKey(key).orElseThrow().getStatus())
                    .isEqualTo(ChainJob.Status.PENDING);
        }

        /**
         * 결말을 모르는 FAILED — 온체인은 성공했는데 서버가 실패로 적은 경우. 확정이 반영돼
         * {@code settlement.status == RELEASED}가 되면 키를 밀어내기 전에 게이트가 막는다.
         * (온체인만 성공하고 서버가 모르는 구간은 컨트랙트 {@code InvalidStage}가 막는다 —
         * {@code RevenueSplitter.sol:830}.)
         */
        @Test
        @DisplayName("이미 RELEASED 면 FAILED 키를 밀어내지 않고 SETTLEMENT_ALREADY_RELEASED")
        void failedReplayAfterReleasedIsBlocked() {
            locked();
            fixture.expireDisputeDeadline(settlement().getSettlementId());
            Long settlementId = settlement().getSettlementId();
            settlementService.releaseAutomatically(settlementId);
            ChainJob failed = failLatestReleaseJob();

            // 그 사이 사람이 수동으로 성공시켰다 — 정산은 RELEASED 다.
            withIdempotencyKey();
            settlementService.release(hostLeader, performanceId(), null);
            confirmJob(ChainJob.TxType.RELEASE);
            confirmationService.applyConfirmedJobs();
            assertThat(settlement().getStatus()).isEqualTo(Settlement.Status.RELEASED);
            int before = jobs(ChainJob.TxType.RELEASE).size();

            assertThatThrownBy(() -> settlementService.releaseAutomatically(settlementId))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SETTLEMENT_ALREADY_RELEASED);

            assertThat(jobs(ChainJob.TxType.RELEASE)).hasSize(before);
            assertThat(chainJobRepository.findById(failed.getChainJobId()).orElseThrow()
                    .getIdempotencyKey())
                    .as("게이트에 막히면 키를 밀어낸 것도 함께 롤백된다")
                    .isEqualTo("release:auto:" + settlementId);
        }
    }

    // ================================================================ 조기 동의

    @Nested
    @DisplayName("조기 동의(API-settlement-08) — 전원이 찬성하면 48시간을 건너뛴다")
    class Approvals {

        @Test
        @DisplayName("전원이 동의하면 마감 전에도 release 가 통과한다")
        void allApprovedUnlocksReleaseBeforeDeadline() {
            locked();
            approveAll();
            withIdempotencyKey();

            assertThatCode(() -> settlementService.release(hostLeader, performanceId(), null))
                    .doesNotThrowAnyException();
            assertThat(jobs(ChainJob.TxType.RELEASE)).hasSize(1);
        }

        @Test
        @DisplayName("한 팀이라도 동의하지 않으면 여전히 SETTLEMENT_DISPUTE_PERIOD")
        void partialApprovalStillBlocks() {
            locked();
            settlementService.approve(hostLeader, performanceId());
            settlementService.approve(principal(world.leaders().get(1)), performanceId());
            withIdempotencyKey();

            assertThatThrownBy(() -> settlementService.release(hostLeader, performanceId(), null))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SETTLEMENT_DISPUTE_PERIOD);
        }

        @Test
        @DisplayName("전원 동의 뒤에 이의가 들어오면 다시 막힌다 — 동의가 이의를 덮지 않는다")
        void openDisputeAfterApprovalStillBlocks() {
            locked();
            approveAll();
            settlementService.dispute(principal(world.leaders().get(1)), performanceId(),
                    disputeRequest(world.teams().get(1)));
            withIdempotencyKey();

            assertThatThrownBy(() -> settlementService.release(hostLeader, performanceId(), null))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SETTLEMENT_DISPUTE_PERIOD);
        }

        @Test
        @DisplayName("같은 팀이 두 번 동의하면 409 — 철회가 없으므로 재동의도 없다")
        void doubleApprovalIsConflict() {
            locked();
            settlementService.approve(hostLeader, performanceId());

            assertThatThrownBy(() -> settlementService.approve(hostLeader, performanceId()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.COMMON_CONFLICT);
        }

        @Test
        @DisplayName("열린 이의를 가진 팀은 동의할 수 없다 — 두 상태를 동시에 들지 않는다")
        void teamWithOpenDisputeCannotApprove() {
            locked();
            MemberPrincipal leader = principal(world.leaders().get(1));
            settlementService.dispute(leader, performanceId(),
                    disputeRequest(world.teams().get(1)));

            assertThatThrownBy(() -> settlementService.approve(leader, performanceId()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.COMMON_CONFLICT);
        }

        @Test
        @DisplayName("참여팀이 아니면 403")
        void outsiderIsForbidden() {
            locked();
            MemberPrincipal outsider = MemberPrincipal.of(world.outsider().getMemberId(),
                    world.outsider().getEmail(), false);

            assertThatThrownBy(() -> settlementService.approve(outsider, performanceId()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SETTLEMENT_NOT_PARTICIPANT);
        }

        @Test
        @DisplayName("ADMIN 도 남의 팀을 대신 동의할 수 없다 — dispute 와 다른 점이다")
        void adminHasNoBypass() {
            locked();

            assertThatThrownBy(() -> settlementService.approve(admin(), performanceId()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SETTLEMENT_NOT_PARTICIPANT);
        }

        @Test
        @DisplayName("잠기기 전에는 동의할 수 없다")
        void beforeLock() {
            aggregated();

            assertThatThrownBy(() -> settlementService.approve(hostLeader, performanceId()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SETTLEMENT_NOT_LOCKED);
        }

        @Test
        @DisplayName("응답이 진행도를 알려준다 — 마지막 팀에서만 releaseUnlocked")
        void responseCountsProgress() {
            locked();
            ApprovalResponse first = settlementService.approve(hostLeader, performanceId());
            assertThat(first.approvedCount()).isEqualTo(1);
            assertThat(first.requiredCount()).isEqualTo(3);
            assertThat(first.releaseUnlocked()).isFalse();
            assertThat(first.teamId()).isEqualTo(world.host().getTeamId());
            assertThat(first.approvedAt()).isNotNull();

            settlementService.approve(principal(world.leaders().get(1)), performanceId());
            ApprovalResponse last =
                    settlementService.approve(principal(world.leaders().get(2)), performanceId());
            assertThat(last.approvedCount()).isEqualTo(3);
            assertThat(last.releaseUnlocked()).isTrue();
        }

        @Test
        @DisplayName("조회가 팀별 동의 여부와 내 팀 동의를 보여준다")
        void detailShowsApprovals() {
            locked();
            settlementService.approve(hostLeader, performanceId());

            SettlementDetailResponse body = settlementService.detail(hostLeader, performanceId());
            assertThat(body.myTeam().approved()).isTrue();
            assertThat(body.shares())
                    .filteredOn(share -> share.teamId().equals(world.host().getTeamId()))
                    .singleElement()
                    .satisfies(share -> {
                        assertThat(share.approved()).isTrue();
                        assertThat(share.approvedAt()).isNotNull();
                    });
            assertThat(body.shares()).filteredOn(share -> !share.approved()).hasSize(2);
        }

        @Test
        @DisplayName("actions.approve 도 실행과 같은 판정이다")
        void actionParity() {
            locked();
            assertAvailableAndPasses(actions(hostLeader).approve(),
                    () -> settlementService.approve(hostLeader, performanceId()));
            // 동의한 뒤에는 버튼도 닫히고 실행도 같은 코드로 막힌다.
            assertSameJudgement(actions(hostLeader).approve(),
                    () -> settlementService.approve(hostLeader, performanceId()));
        }

        /**
         * 조기 동의의 함정. 스케줄러는 예전에 {@code dispute_deadline_at < now} 인 정산만 긁어서,
         * 전원이 동의해도 마감 전이면 후보에 들지 못했다 — 주최자가 버튼을 누르지 않으면 48시간이
         * 그대로 흘렀다. 후보 선별이 게이트의 판정과 갈라지지 않는지 스케줄러 본체로 확인한다
         * (스케줄러 빈은 test 프로파일에 없어 직접 만들어 부른다).
         */
        @Test
        @DisplayName("스케줄러가 마감 전에도 전원 동의한 정산을 자동 release 한다")
        void schedulerReleasesEarlyApprovedSettlement() {
            locked();
            approveAll();
            assertThat(settlement().getDisputeDeadlineAt())
                    .as("마감은 아직 미래다").isAfter(LocalDateTime.now());

            new SettlementScheduler(chainOwnership, confirmationService, chainConfirmations,
                    settlementService, settlementRepository, disputeRepository)
                    .releaseDueSettlements();

            assertThat(jobs(ChainJob.TxType.RELEASE)).hasSize(1);
        }

        @Test
        @DisplayName("동의가 덜 찼으면 스케줄러도 job 을 만들지 않는다")
        void schedulerSkipsPartialApproval() {
            locked();
            settlementService.approve(hostLeader, performanceId());

            new SettlementScheduler(chainOwnership, confirmationService, chainConfirmations,
                    settlementService, settlementRepository, disputeRepository)
                    .releaseDueSettlements();

            assertThat(jobs(ChainJob.TxType.RELEASE)).isEmpty();
        }

        private void approveAll() {
            for (Member leader : world.leaders()) {
                settlementService.approve(principal(leader), performanceId());
            }
        }
    }

    // ================================================================ 이의 ↔ release 직렬화

    /**
     * MR !154 회귀. 조기 동의가 들어오기 전에는 이의제기(마감 전)와 release(마감 뒤)가 <b>시간으로</b>
     * 배타적이었다. 전원 동의가 48시간을 건너뛰면서 둘이 같은 시간대에 겹치고, 그 겹침에서
     * 열린 이의가 있는데 되돌릴 수 없는 지급 tx 가 나가는 순서가 생긴다.
     *
     * <p>막는 것은 두 겹이다 — ① 두 경로가 같은 공연 행 쓰기 락으로 줄을 선다
     * ({@code SettlementService.lockPerformanceRow}) ② 줄 뒤에 선 이의는 그 사이에 접수된
     * {@code RELEASE} job 을 보고 거절한다({@code SettlementGates.dispute}). 한쪽만 고치면 반대
     * 순서가 남는다.
     *
     * <p><b>이 파일은 클래스에 {@code @Transactional} 을 두지 않는다.</b> 테스트 트랜잭션 하나에 두
     * 스레드를 넣으면 잠금 경합 자체가 사라져 결함을 가린다({@link SettlementConfirmFencingTest} 선례).
     */
    @Nested
    @DisplayName("이의 ↔ release 직렬화 — 조기 동의로 같은 시간대에 겹치게 된 두 동작")
    class DisputeReleaseSerialization {

        /**
         * <b>진짜 경쟁을 재현한다.</b> release 가 공연 행 락을 잡은 채 커밋하지 않는 동안 다른
         * 스레드에서 이의를 넣고, ① 그 스레드가 <b>기다리는지</b>(락) ② 깨어난 뒤 <b>거절하는지</b>
         * (진행 중 {@code RELEASE} job)를 둘 다 본다.
         *
         * <p>재현한 것은 <b>release 가 먼저 락을 잡은 순서</b> 하나다. 반대 순서(이의가 먼저)를
         * 결정적으로 세우려면 이의 트랜잭션을 붙잡은 채 release 를 들여보내야 하는데, 그 방향의
         * 판정은 release 게이트의 열린 이의 검사라서 순차 테스트
         * ({@code Approvals.openDisputeAfterApprovalStillBlocks})가 이미 같은 결론을 확인한다.
         * 락 자체는 같은 행의 반대편이라 한 방향을 세우면 성립이 같다.
         */
        @Test
        @DisplayName("release 가 공연 행을 잡고 있으면 이의는 기다렸다가 409 로 거절된다")
        void disputeWaitsForReleaseAndIsRejected() throws Exception {
            locked();
            approveAll(); // 마감 전이지만 release 가능 — 두 동작이 겹치는 그 구간이다
            Long settlementId = settlement().getSettlementId();
            Long performanceId = performanceId();
            MemberPrincipal leader = principal(world.leaders().get(1));
            DisputeRequest request = disputeRequest(world.teams().get(1));

            CountDownLatch releaseEnqueued = new CountDownLatch(1);
            CountDownLatch commitRelease = new CountDownLatch(1);
            ExecutorService pool = Executors.newFixedThreadPool(2);
            try {
                Future<?> releasing = pool.submit(() ->
                        new TransactionTemplate(transactionManager).execute(status -> {
                            settlementService.releaseAutomatically(settlementId);
                            releaseEnqueued.countDown();
                            awaitQuietly(commitRelease);
                            return null;
                        }));
                assertThat(releaseEnqueued.await(30, TimeUnit.SECONDS))
                        .as("release 가 job 을 걸기까지 가지 못했다").isTrue();

                Future<DisputeResponse> disputing = pool.submit(
                        () -> settlementService.dispute(leader, performanceId, request));

                assertThatThrownBy(() -> disputing.get(2, TimeUnit.SECONDS))
                        .as("이의가 공연 행 락을 기다리지 않고 지나갔다")
                        .isInstanceOf(TimeoutException.class);

                commitRelease.countDown();
                releasing.get(30, TimeUnit.SECONDS);

                assertThatThrownBy(() -> disputing.get(30, TimeUnit.SECONDS))
                        .as("지급이 시작된 뒤에 깨어난 이의는 거절된다")
                        .cause()
                        .isInstanceOf(BusinessException.class)
                        .extracting(e -> ((BusinessException) e).getErrorCode())
                        .isEqualTo(ErrorCode.COMMON_CONFLICT);
            } finally {
                commitRelease.countDown();
                pool.shutdownNow();
            }

            assertThat(disputeRepository.findBySettlement_SettlementId(settlementId))
                    .as("접수되지 않은 이의는 행으로도 남지 않는다").isEmpty();
            assertThat(jobs(ChainJob.TxType.RELEASE)).hasSize(1);
        }

        @Test
        @DisplayName("진행 중인 RELEASE job 이 있으면 이의 접수가 409 이고 actions.dispute 도 닫힌다")
        void inFlightReleaseJobBlocksDispute() {
            locked();
            approveAll();
            withIdempotencyKey();
            settlementService.release(hostLeader, performanceId(), null);
            assertThat(jobs(ChainJob.TxType.RELEASE)).singleElement()
                    .extracting(ChainJob::getStatus).isEqualTo(ChainJob.Status.PENDING);

            MemberPrincipal leader = principal(world.leaders().get(1));
            // 버튼과 실행이 같은 판정인지까지 본다 — 이 게이트의 성질이다.
            assertSameJudgement(actions(leader).dispute(),
                    () -> settlementService.dispute(leader, performanceId(),
                            disputeRequest(world.teams().get(1))));
            assertThat(actions(leader).dispute().blockedReason())
                    .isEqualTo(ErrorCode.COMMON_CONFLICT.getCode());
        }

        /**
         * 후보 쿼리({@code SettlementRepository.findReleaseCandidates})는 release 게이트의 이의제기
         * 기간 조건을 <b>따라 적은 사본</b>이다. 두 곳이 어긋나면 이 테스트가 깨진다 — 사본을 두기로
         * 한 대가로 남기는 안전장치다.
         */
        @Test
        @DisplayName("타이밍만으로 막힌 정산은 스케줄러 후보가 아니고, 전원 동의하면 마감 전에도 후보다")
        void candidatesFollowTheReleaseGate() {
            locked();
            Long settlementId = settlement().getSettlementId();
            assertThat(settlement().getDisputeDeadlineAt())
                    .as("마감은 아직 미래다").isAfter(TimeSupport.nowStored());

            List<ILoggingEvent> logs = runScheduler();

            assertThat(candidateIds())
                    .as("마감 전 · 동의 미완이면 후보가 아니다").doesNotContain(settlementId);
            assertThat(jobs(ChainJob.TxType.RELEASE)).isEmpty();
            assertThat(logs).extracting(ILoggingEvent::getFormattedMessage)
                    .as("후보가 아니면 보류 로그도 없다 — 48시간 × 1분 = 2,880줄이 D-68 의 "
                            + "\"열린 이의\" 줄을 묻는다")
                    .noneMatch(message -> message.contains(String.valueOf(settlementId)));

            approveAll();

            assertThat(candidateIds())
                    .as("전원 동의하면 마감 전에도 후보다").contains(settlementId);
        }

        /**
         * 마지막 동의의 진행도는 <b>저장 뒤 DB 에서</b> 세야 한다. 게이트 앞에서 읽은 목록을 그대로
         * 세면 남은 두 팀이 나란히 누를 때 둘 다 {@code 2/3 · releaseUnlocked=false} 를 받아 어느
         * 화면도 "이제 지급할 수 있습니다"를 못 띄운다. 그 경쟁 자체는 재현하지 않는다 — 동의는 돈을
         * 움직이지 않아 공연 행 락을 걸지 않기로 했고, 여기서 고정하는 것은 <b>센 값의 출처</b>다.
         */
        @Test
        @DisplayName("마지막 동의는 3/3 · releaseUnlocked 이고, 그 수는 리포지토리가 센다")
        void lastApprovalCountsFromRepository() {
            locked();
            settlementService.approve(hostLeader, performanceId());
            settlementService.approve(principal(world.leaders().get(1)), performanceId());
            Long settlementId = settlement().getSettlementId();
            clearInvocations(settlementShareRepository);

            ApprovalResponse last =
                    settlementService.approve(principal(world.leaders().get(2)), performanceId());

            assertThat(last.approvedCount()).isEqualTo(3);
            assertThat(last.requiredCount()).isEqualTo(3);
            assertThat(last.releaseUnlocked()).isTrue();
            verify(settlementShareRepository)
                    .countBySettlement_SettlementIdAndApprovedAtNotNull(settlementId);
        }

        private List<Long> candidateIds() {
            return settlementRepository.findReleaseCandidates(
                            List.of(Settlement.Status.LOCKED, Settlement.Status.DISPUTE_OPEN),
                            TimeSupport.nowStored()).stream()
                    .map(Settlement::getSettlementId).toList();
        }

        /** 스케줄러 빈은 test 프로파일에 없다 — 본체를 직접 만들어 부르고 로그를 받아 온다. */
        private List<ILoggingEvent> runScheduler() {
            Logger schedulerLogger = (Logger) LoggerFactory.getLogger(SettlementScheduler.class);
            ListAppender<ILoggingEvent> appender = new ListAppender<>();
            appender.start();
            schedulerLogger.addAppender(appender);
            try {
                new SettlementScheduler(chainOwnership, confirmationService, chainConfirmations,
                        settlementService, settlementRepository, disputeRepository)
                        .releaseDueSettlements();
            } finally {
                schedulerLogger.detachAppender(appender);
                appender.stop();
            }
            return List.copyOf(appender.list);
        }

        private void approveAll() {
            for (Member leader : world.leaders()) {
                settlementService.approve(principal(leader), performanceId());
            }
        }

        private void awaitQuietly(CountDownLatch latch) {
            try {
                if (!latch.await(30, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("래치가 30초 안에 열리지 않았다");
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(e);
            }
        }
    }

    // ================================================================ 조회·공유

    @Nested
    @DisplayName("조회(01)·공유 링크(06·07)")
    class Views {

        @Test
        @DisplayName("참여팀이 아니면 403")
        void notParticipant() {
            assertThatThrownBy(() ->
                    settlementService.detail(principal(world.outsider()), performanceId()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SETTLEMENT_NOT_PARTICIPANT);
        }

        @Test
        @DisplayName("집계 전에도 조회는 된다 — 상태 NONE + 매출 집계")
        void beforeAggregate() {
            seedSales();
            SettlementDetailResponse detail = settlementService.detail(hostLeader, performanceId());

            assertThat(detail.status()).isEqualTo("NONE");
            assertThat(detail.grossRevenueAmount()).isEqualTo(60_000L);
            assertThat(detail.netRevenueAmount()).isEqualTo(60_000L);
            assertThat(detail.currency()).isEqualTo("KRW");
            assertThat(detail.shares()).isEmpty();
            assertThat(detail.dustTeamId()).isEqualTo(world.host().getTeamId());
        }

        @Test
        @DisplayName("집계 후 조회는 팀별 분배액과 dust 귀속을 보여준다")
        void afterAggregate() {
            aggregated();
            SettlementDetailResponse detail = settlementService.detail(hostLeader, performanceId());

            assertThat(detail.status()).isEqualTo("AGGREGATED");
            assertThat(detail.counterMatched()).isTrue();
            assertThat(detail.shares()).hasSize(3);
            assertThat(detail.shares().stream().mapToLong(ShareItem::totalAmount).sum())
                    .isEqualTo(chain.escrow);
            assertThat(detail.deposit().status()).isEqualTo("PAID");
            assertThat(detail.rulesHash()).isNotNull();
        }

        @Test
        @DisplayName("공유 링크는 집계 전에는 만들 수 없고, 재발급하면 이전 토큰이 죽는다")
        void shareLink() {
            aggregated();
            ShareLinkResponse first = settlementService.shareLink(hostLeader, performanceId());
            assertThat(first.shareToken()).startsWith("stl_");
            assertThat(first.shareUrl()).endsWith(first.shareToken());

            ShareLinkResponse second = settlementService.shareLink(hostLeader, performanceId());
            assertThat(second.shareToken()).isNotEqualTo(first.shareToken());
            assertThatThrownBy(() -> settlementService.publicSettlement(first.shareToken()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.COMMON_NOT_FOUND);
        }

        @Test
        @DisplayName("공개 조회는 팀 이름과 금액만 준다 — 지갑 주소·팀 id 는 없다")
        void publicView() {
            aggregated();
            String token = settlementService.shareLink(hostLeader, performanceId()).shareToken();

            PublicSettlementResponse response = settlementService.publicSettlement(token);

            assertThat(response.performanceTitle()).isNotBlank();
            assertThat(response.shares()).hasSize(3);
            assertThat(response.shares().get(0).teamName()).isNotBlank();
            assertThat(response.simulationNotice()).contains("실제 자금이 아닙니다");
            // 응답 타입 자체에 지갑 주소·teamId 필드가 없다는 것이 이 API 의 방어선이다.
            assertThat(PublicSettlementResponse.class.getRecordComponents())
                    .noneMatch(c -> c.getName().toLowerCase().contains("wallet"));
        }

        @Test
        @DisplayName("없는 토큰은 404")
        void unknownToken() {
            assertThatThrownBy(() -> settlementService.publicSettlement("stl_" + UUID.randomUUID()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.COMMON_NOT_FOUND);
        }
    }

    // ================================================================ actions ↔ 게이트

    /**
     * 조회 응답의 {@code actions}가 실행 게이트와 <b>같은 판정</b>인가.
     *
     * <p>이 묶음이 {@link SettlementGates} 단일화의 존재 이유다. 규칙이 두 곳에 적히면
     * <b>서버는 409를 내는데 버튼은 활성</b>인 상태가 생기고, 그때 프론트는 사용자를 실패하는
     * tx 요청으로 밀어 넣는다. 그래서 단계마다 두 방향을 함께 고정한다 —
     * {@code available == false}면 실행이 <b>같은 {@code code}로</b> 4xx가 나고,
     * {@code available == true}면 실행이 게이트를 통과한다.
     *
     * <p>{@code blockedReason}이 {@code ErrorCode.getCode()} 문자열과 같은지까지 본다. 코드가
     * 아니라 사람이 읽는 문구가 들어가면 프론트가 분기할 수 없다(규격 v3 §2 — 분기는 {@code code}로).
     */
    @Nested
    @DisplayName("actions — 조회의 버튼 활성 조건이 실행 게이트와 갈라지지 않는다")
    class ActionsParity {

        @Test
        @DisplayName("aggregate: 공연이 ENDED 가 아니면 막힘 이유와 실제 4xx 코드가 같다")
        void aggregateBlocked() {
            seedSales();
            jdbc().update("UPDATE performance SET status='ON_SALE' WHERE performance_id = ?",
                    performanceId());

            assertSameJudgement(actions(hostLeader).aggregate(),
                    () -> settlementService.aggregate(hostLeader, performanceId()));
        }

        @Test
        @DisplayName("aggregate: available 이면 실행이 게이트를 통과한다")
        void aggregateAvailable() {
            seedSales();

            assertAvailableAndPasses(actions(hostLeader).aggregate(),
                    () -> settlementService.aggregate(hostLeader, performanceId()));
        }

        @Test
        @DisplayName("lock: 집계 확정 전에는 막힘 이유와 실제 4xx 코드가 같다")
        void lockBlocked() {
            seedSales();
            settlementService.aggregate(hostLeader, performanceId()); // 아직 CONFIRMED 전 = NONE

            assertSameJudgement(actions(hostLeader).lock(),
                    () -> settlementService.lock(hostLeader, performanceId()));
        }

        @Test
        @DisplayName("lock: available 이면 실행이 게이트를 통과한다")
        void lockAvailable() {
            aggregated();

            assertAvailableAndPasses(actions(hostLeader).lock(),
                    () -> settlementService.lock(hostLeader, performanceId()));
        }

        @Test
        @DisplayName("dispute: 잠기기 전에는 막힘 이유와 실제 4xx 코드가 같다")
        void disputeBlocked() {
            aggregated();
            MemberPrincipal teamLeader = principal(world.leaders().get(1));

            assertSameJudgement(actions(teamLeader).dispute(),
                    () -> settlementService.dispute(teamLeader, performanceId(),
                            disputeRequest(world.teams().get(1))));
        }

        @Test
        @DisplayName("dispute: available 이면 실행이 게이트를 통과한다")
        void disputeAvailable() {
            locked();
            MemberPrincipal teamLeader = principal(world.leaders().get(1));

            assertAvailableAndPasses(actions(teamLeader).dispute(),
                    () -> settlementService.dispute(teamLeader, performanceId(),
                            disputeRequest(world.teams().get(1))));
        }

        @Test
        @DisplayName("release: 이의제기 기간 중에는 막힘 이유와 실제 4xx 코드가 같다")
        void releaseBlockedDuringDisputePeriod() {
            locked();
            withIdempotencyKey();

            assertSameJudgement(actions(hostLeader).release(),
                    () -> settlementService.release(hostLeader, performanceId(), null));
        }

        @Test
        @DisplayName("release: 열린 이의가 남아 있으면 막힘 이유와 실제 4xx 코드가 같다")
        void releaseBlockedByOpenDispute() {
            locked();
            settlementService.dispute(principal(world.leaders().get(1)), performanceId(),
                    disputeRequest(world.teams().get(1)));
            fixture.expireDisputeDeadline(settlement().getSettlementId());
            withIdempotencyKey();

            assertSameJudgement(actions(hostLeader).release(),
                    () -> settlementService.release(hostLeader, performanceId(), null));
        }

        @Test
        @DisplayName("release: 발행량 대사가 깨져 있으면 막힘 이유와 실제 4xx 코드가 같다")
        void releaseBlockedByHalt() {
            locked();
            fixture.expireDisputeDeadline(settlement().getSettlementId());
            doReturn(true).when(supplyReconciler).isReleaseHalted();
            withIdempotencyKey();

            assertSameJudgement(actions(hostLeader).release(),
                    () -> settlementService.release(hostLeader, performanceId(), null));
        }

        @Test
        @DisplayName("release: available 이면 실행이 게이트를 통과한다")
        void releaseAvailable() {
            locked();
            fixture.expireDisputeDeadline(settlement().getSettlementId());
            withIdempotencyKey();

            assertAvailableAndPasses(actions(hostLeader).release(),
                    () -> settlementService.release(hostLeader, performanceId(), null));
        }

        @Test
        @DisplayName("생성자가 아닌 참여팀 리더에게는 운영 액션 셋이 전부 권한으로 막힌다")
        void nonOwnerSeesOwnerActionsBlocked() {
            aggregated();
            MemberPrincipal teamLeader = principal(world.leaders().get(1));
            withIdempotencyKey();

            assertThat(actions(teamLeader).aggregate().blockedReason())
                    .isEqualTo(ErrorCode.PERFORMANCE_NOT_OWNER.getCode());
            assertSameJudgement(actions(teamLeader).lock(),
                    () -> settlementService.lock(teamLeader, performanceId()));
            assertSameJudgement(actions(teamLeader).release(),
                    () -> settlementService.release(teamLeader, performanceId(), null));
        }

        @Test
        @DisplayName("RELEASED(종단)에서는 네 액션이 모두 막히고, 이유도 실행과 같다")
        void releasedBlocksEveryAction() {
            released();
            withIdempotencyKey();

            Actions all = actions(hostLeader);
            assertThat(List.of(all.aggregate().available(), all.lock().available(),
                    all.dispute().available(), all.release().available())).containsOnly(false);

            assertSameJudgement(actions(hostLeader).aggregate(),
                    () -> settlementService.aggregate(hostLeader, performanceId()));
            assertSameJudgement(actions(hostLeader).lock(),
                    () -> settlementService.lock(hostLeader, performanceId()));
            assertSameJudgement(actions(hostLeader).release(),
                    () -> settlementService.release(hostLeader, performanceId(), null));
        }
    }

    // ================================================================ myTeam

    @Nested
    @DisplayName("myTeam — 회원 → 팀 매핑이 서버에만 있으므로 서버가 접어 준다")
    class MyTeamView {

        @Test
        @DisplayName("참여팀 리더는 자기 팀 몫을 보고, release 전에는 WAIT_RELEASE")
        void participantLeaderSeesOwnShare() {
            aggregated();
            long[] expected = expectedPayouts(chain.escrow, chain.counts);

            MyTeam mine = settlementService
                    .detail(principal(world.leaders().get(1)), performanceId()).myTeam();

            assertThat(mine).isNotNull();
            assertThat(mine.teamId()).isEqualTo(world.teams().get(1).getTeamId());
            assertThat(mine.totalAmount()).isEqualTo(expected[1]);
            assertThat(mine.released()).isFalse();
            assertThat(mine.releasedAt()).isNull();
            assertThat(mine.walletAddress()).isNotBlank();
            assertThat(mine.nextAction()).isEqualTo(MyTeam.ACTION_WAIT_RELEASE);
        }

        @Test
        @DisplayName("집계 전에도 내 팀은 보인다 — 금액은 아직 없고 지갑은 참여팀 스냅샷")
        void beforeAggregate() {
            seedSales();

            MyTeam mine = settlementService.detail(hostLeader, performanceId()).myTeam();

            assertThat(mine.teamId()).isEqualTo(world.host().getTeamId());
            assertThat(mine.totalAmount()).isNull();
            assertThat(mine.walletAddress()).isNotBlank();
            assertThat(mine.nextAction()).isEqualTo(MyTeam.ACTION_WAIT_RELEASE);
        }

        @Test
        @DisplayName("release 확정 후에는 released=true 이고 nextAction 이 NONE 이다")
        void afterRelease() {
            released();

            MyTeam mine = settlementService
                    .detail(principal(world.leaders().get(1)), performanceId()).myTeam();

            assertThat(mine.released()).isTrue();
            assertThat(mine.releasedAt()).isNotNull();
            assertThat(mine.nextAction()).isEqualTo(MyTeam.ACTION_NONE);
        }

        @Test
        @DisplayName("참여팀이 아닌 ADMIN 이 조회하면 myTeam 은 null 이다")
        void adminWithoutTeam() {
            aggregated();

            SettlementDetailResponse detail = settlementService.detail(admin(), performanceId());

            assertThat(detail.myTeam()).isNull();
            // 팀이 없어도 조회 자체는 되어야 한다 — 관리자 화면이 같은 API 를 쓴다.
            assertThat(detail.shares()).hasSize(3);
        }
    }

    // ================================================================ disputes

    @Nested
    @DisplayName("disputes — openapi Dispute 스키마와 1:1 (D-17)")
    class DisputesView {

        @Test
        @DisplayName("접수한 이의가 조회에 나타나고, id 축은 공연이다(정산 id 가 아니다)")
        void appearsWithPerformanceId() {
            // performance 행을 둘 더 만들어 performance_id 가 settlement_id 를 확실히 앞지르게 한다.
            // 두 값이 우연히 같으면 "settlementId 를 performanceId 자리에 넣었다"는 회귀를 잡지 못한다.
            fixture.createWorld(5000, 5000, new int[]{5000, 5000});
            fixture.createWorld(5000, 5000, new int[]{5000, 5000});
            world = fixture.createWorld(5000, 5000, new int[]{3334, 3333, 3333});
            hostLeader = principal(world.hostLeader());
            locked();
            settlementService.dispute(principal(world.leaders().get(1)), performanceId(),
                    disputeRequest(world.teams().get(1)));

            List<DisputeResponse> disputes =
                    settlementService.detail(hostLeader, performanceId()).disputes();

            assertThat(disputes).hasSize(1);
            DisputeResponse dispute = disputes.get(0);
            assertThat(performanceId()).isNotEqualTo(settlement().getSettlementId());
            assertThat(dispute.performanceId()).isEqualTo(performanceId());
            assertThat(dispute.teamId()).isEqualTo(world.teams().get(1).getTeamId());
            assertThat(dispute.status()).isEqualTo("OPEN");
            assertThat(dispute.createdAt()).isNotNull();
        }

        @Test
        @DisplayName("열린 이의는 releaseHeld=true, 관리자가 처리하면 false")
        void releaseHeldFollowsOpenState() {
            locked();
            Long disputeId = settlementService.dispute(principal(world.leaders().get(1)),
                    performanceId(), disputeRequest(world.teams().get(1))).disputeId();

            assertThat(firstDispute().releaseHeld()).isTrue();

            // 마감이 지나도 열린 이의는 여전히 release 를 붙잡는다 — 그것이 이 플래그의 뜻이다.
            fixture.expireDisputeDeadline(settlement().getSettlementId());
            assertThat(firstDispute().releaseHeld()).isTrue();

            // 관리자 처리(API-admin-06)가 상태를 옮기면 보류가 풀린다.
            jdbc().update("UPDATE dispute SET status='RESOLVED', resolved_at=NOW(6) "
                    + "WHERE dispute_id = ?", disputeId);

            assertThat(firstDispute().status()).isEqualTo("RESOLVED");
            assertThat(firstDispute().releaseHeld()).isFalse();
        }

        @Test
        @DisplayName("release 가 끝나면 이의 이력은 남지만 releaseHeld 는 false")
        void afterReleaseNothingIsHeld() {
            locked();
            Long disputeId = settlementService.dispute(principal(world.leaders().get(1)),
                    performanceId(), disputeRequest(world.teams().get(1))).disputeId();
            jdbc().update("UPDATE dispute SET status='RESOLVED', resolved_at=NOW(6) "
                    + "WHERE dispute_id = ?", disputeId);
            fixture.expireDisputeDeadline(settlement().getSettlementId());
            withIdempotencyKey();
            settlementService.release(hostLeader, performanceId(), null);
            confirmJob(ChainJob.TxType.RELEASE);
            confirmationService.applyConfirmedJobs();

            assertThat(settlement().getStatus()).isEqualTo(Settlement.Status.RELEASED);
            assertThat(firstDispute().releaseHeld()).isFalse();
        }

        @Test
        @DisplayName("이의가 없으면 빈 목록이다 — null 이 아니다")
        void emptyList() {
            aggregated();

            assertThat(settlementService.detail(hostLeader, performanceId()).disputes()).isEmpty();
        }

        private DisputeResponse firstDispute() {
            return settlementService.detail(hostLeader, performanceId()).disputes().get(0);
        }
    }

    // ================================================================ transactions

    @Nested
    @DisplayName("transactions — 확정된 정산 tx 만, 링크는 절대 URL(§0.7)")
    class TransactionsView {

        @Test
        @DisplayName("PENDING job 은 나오지 않는다 — 확정되지 않은 tx 해시는 없다")
        void onlyConfirmedJobs() {
            aggregated();
            settlementService.lock(hostLeader, performanceId()); // PENDING 으로 남긴다

            List<TransactionItem> transactions =
                    settlementService.detail(hostLeader, performanceId()).transactions();

            assertThat(transactions).hasSize(1);
            assertThat(transactions.get(0).type()).isEqualTo("AGGREGATE");
            assertThat(transactions.get(0).txHash()).hasSize(66).startsWith("0x");
        }

        @Test
        @DisplayName("explorerUrl 은 서버가 완성한 절대 URL이다")
        void explorerUrlIsAbsolute() {
            aggregated();

            TransactionItem tx =
                    settlementService.detail(hostLeader, performanceId()).transactions().get(0);

            assertThat(tx.explorerUrl())
                    .startsWith("https://")
                    .contains("/tx/")
                    .endsWith(tx.txHash());
        }

        @Test
        @DisplayName("집계·잠금·release·보증금 반환이 확정 순서대로 쌓인다")
        void allSettlementTxInOrder() {
            released();
            confirmJob(ChainJob.TxType.DEPOSIT_RETURN);
            confirmationService.applyConfirmedJobs();

            assertThat(settlementService.detail(hostLeader, performanceId()).transactions())
                    .extracting(TransactionItem::type)
                    .containsExactly("AGGREGATE", "LOCK", "RELEASE", "DEPOSIT_RETURN");
        }

        @Test
        @DisplayName("공유 링크도 절대 URL이다 — 배포 도메인은 설정에서 온다")
        void shareUrlIsAbsolute() {
            aggregated();

            assertThat(settlementService.shareLink(hostLeader, performanceId()).shareUrl())
                    .startsWith("https://");
        }
    }

    // ================================================================ 규칙 형태 사전 검사

    /**
     * bp 형태 검사는 <b>tx 를 보내기 전에</b> 끝나야 한다.
     *
     * <p>통과시키면 온체인 {@code aggregate}가 먼저 확정되고, 그 뒤 서버 확정 반영에서
     * {@link com.ssafy.b204.settlement.service.SettlementCalculator}가 예외를 던진다. 그 순간
     * <b>체인 AGGREGATED · 서버 NONE</b>으로 고착되고 주기 반영이 영구히 같은 예외를 반복한다 —
     * 컨트랙트에 되돌리는 경로가 없다. 그래서 모든 케이스가 "4xx" 뿐 아니라
     * "<b>AGGREGATE job 이 생기지 않았다</b>"까지 확인한다.
     */
    @Nested
    @DisplayName("ruleShape — 깨진 규칙으로는 tx 를 만들지 않는다")
    class RuleShape {

        @Test
        @DisplayName("fixedRatioBp + selectionRatioBp != 10000")
        void ratioSumInvalid() {
            seedSales();
            jdbc().update("UPDATE settlement_rule SET selection_ratio_bp = 4999 "
                    + "WHERE performance_id = ?", performanceId());

            assertBlockedBeforeTx(ErrorCode.RULE_RATIO_SUM_INVALID);
        }

        @Test
        @DisplayName("Σ teamShareBp != 10000")
        void teamShareSumInvalid() {
            seedSales();
            jdbc().update("UPDATE performance_participant SET team_share_bp = 3000 "
                            + "WHERE performance_id = ? AND team_id = ?",
                    performanceId(), world.host().getTeamId());

            assertBlockedBeforeTx(ErrorCode.RULE_RATIO_SUM_INVALID);
        }

        @Test
        @DisplayName("teamShareBp 가 음수면 합이 10000이어도 거부한다")
        void negativeTeamShare() {
            seedSales();
            // -1 + 6668 + 3333 = 10000 — 합만 보는 검사는 이걸 통과시킨다.
            jdbc().update("UPDATE performance_participant SET team_share_bp = -1 "
                            + "WHERE performance_id = ? AND team_id = ?",
                    performanceId(), world.host().getTeamId());
            jdbc().update("UPDATE performance_participant SET team_share_bp = 6668 "
                            + "WHERE performance_id = ? AND team_id = ?",
                    performanceId(), world.teams().get(1).getTeamId());

            assertBlockedBeforeTx(ErrorCode.RULE_RATIO_SUM_INVALID);
        }

        @Test
        @DisplayName("teamShareBp 가 null 이면 거부한다 — DB 는 NOT NULL 이라 게이트를 직접 부른다")
        void nullTeamShare() {
            PerformanceParticipant broken = PerformanceParticipant.builder()
                    .performance(world.performance())
                    .team(world.host())
                    .teamShareBp(null)
                    .walletAddress("0x" + "1".repeat(40))
                    .build();
            SettlementRule rule = SettlementRule.builder()
                    .performance(world.performance())
                    .fixedRatioBp(5000)
                    .selectionRatioBp(5000)
                    .build();

            // 요청자는 ADMIN 으로 둔다 — 이 테스트의 대상은 권한이 아니라 규칙 형태이고,
            // 생성자 판정은 lazy 한 creator_team 을 건드려 세션 밖에서는 읽히지 않는다.
            Optional<SettlementGates.Blocked> blocked = gates.aggregate(admin(),
                    world.performance(), null, rule, List.of(broken));

            assertThat(blocked).isPresent();
            assertThat(blocked.get().code()).isEqualTo(ErrorCode.RULE_RATIO_SUM_INVALID);
        }

        @Test
        @DisplayName("참여팀이 상한 8팀을 넘으면 거부한다 — 컨트랙트 MAX_TEAMS 와 같은 값")
        void tooManyTeams() {
            world = fixture.createWorld(5000, 5000,
                    new int[]{1250, 1250, 1250, 1250, 1250, 1250, 1250, 625, 625});
            hostLeader = principal(world.hostLeader());

            assertBlockedBeforeTx(ErrorCode.COMMON_VALIDATION_FAILED);
        }

        @Test
        @DisplayName("정산 규칙이 저장되지 않았으면 거부한다")
        void ruleMissing() {
            seedSales();
            jdbc().update("DELETE FROM settlement_rule WHERE performance_id = ?", performanceId());

            assertBlockedBeforeTx(ErrorCode.COMMON_NOT_FOUND);
        }

        /** 4xx 코드 · {@code actions} 이유 · <b>tx 미생성</b> 셋을 한 번에 확인한다. */
        private void assertBlockedBeforeTx(ErrorCode expected) {
            assertThatThrownBy(() -> settlementService.aggregate(hostLeader, performanceId()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(expected);
            assertThat(actions(hostLeader).aggregate().blockedReason())
                    .isEqualTo(expected.getCode());
            assertThat(aggregateJobs()).isEmpty();
        }
    }

    // ================================================================ 감사 반영 회귀

    @Nested
    @DisplayName("감사 반영 회귀 — 고친 자리가 다시 열리지 않게 한다")
    class AuditRegressions {

        @Test
        @DisplayName("실패한 환불은 표를 빼앗지 않는다 — 온체인에서 아무 일도 없었다")
        void failedRefundKeepsVotes() {
            Member audience = fixture.createAudience();
            fixture.placeOrder(world, audience, world.host(), 2, 10_000L, 10_000L,
                    Refund.Status.FAILED);
            chain.escrow = 20_000L;
            chain.counts = new long[]{2, 0, 0};
            chain.payouts = expectedPayouts(20_000L, chain.counts);

            AggregateResponse response = settlementService.aggregate(hostLeader, performanceId());

            assertThat(response.validTicketCount()).isEqualTo(2);
            assertThat(settlement().getCounterMatch()).isTrue();
        }

        @Test
        @DisplayName("서버 집계값은 enqueue 전에 커밋된다 — 전송 시점에 tx 인자로 읽힌다")
        void serverAggregateRecordedBeforeEnqueue() {
            seedSales();

            settlementService.aggregate(hostLeader, performanceId());

            Settlement settlement = settlement();
            assertThat(settlement.getStatus()).isEqualTo(Settlement.Status.NONE);
            assertThat(settlement.getValidTicketCount()).isEqualTo(6);
            assertThat(settlement.getTotalChoiceCount()).isEqualTo(6);
        }

        @Test
        @DisplayName("payoutsOf 를 읽지 못하면 전이하지 않는다 — 대사 불가는 통과가 아니다")
        void unreadablePayoutBlocksTransition() {
            seedSales();
            settlementService.aggregate(hostLeader, performanceId());
            chain.payouts = null; // eth_call 이 실패했다
            confirmJob(ChainJob.TxType.AGGREGATE);

            assertThat(confirmationService.applyConfirmedJobs()).isZero();
            assertThat(settlement().getStatus()).isEqualTo(Settlement.Status.NONE);
            assertThat(settlementShareRepository
                    .findBySettlement_SettlementId(settlement().getSettlementId())).isEmpty();
        }

        /*
         * D-26 — 이의제기 마감이 비어 있을 때.
         *
         * markLocked 는 상태와 마감을 함께 세우므로 정상 경로에서는 이 상태가 안 생긴다. 만드는 것은
         * 남의 코드다 — 관리자 이의 처리(API-admin-06)가 status 만 손으로 옮기고 마감을 쓰지 않는 경우.
         * 그래서 여기서는 그 손자국을 SQL 로 직접 재현한다(lockedWithoutDeadline).
         *
         * 뒤집기 전에는 isInDisputePeriod 가 false 를 돌려주고 release 게이트가 그것을 "기간 끝남"으로
         * 읽어 48h 대기 없이 tx 를 보냈다. 되돌릴 수 없는 tx 라 막는 쪽으로 실패해야 한다.
         */

        @Test
        @DisplayName("D-26: 마감이 비어 있으면 release 를 막는다 — 48h 가 사라지지 않는다")
        void nullDisputeDeadlineBlocksRelease() {
            lockedWithoutDeadline();
            withIdempotencyKey();

            assertThatThrownBy(() -> settlementService.release(hostLeader, performanceId(), null))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(e -> {
                        BusinessException be = (BusinessException) e;
                        assertThat(be.getErrorCode())
                                .isEqualTo(ErrorCode.SETTLEMENT_DISPUTE_PERIOD);
                        // 마감이 없으면 문구에 넣을 시각도 없다. 시각을 넣는 갈래로 가면
                        // SettlementTime.format(null) 의 "-" 가 사용자에게 나간다.
                        assertThat(be.getMsg()).isNotNull()
                                .contains("마감이 설정되지 않아")
                                .doesNotContain("-");
                    });
            assertThat(jobs(ChainJob.TxType.RELEASE)).isEmpty();
        }

        @Test
        @DisplayName("D-26: actions.release 도 같은 판정 — 버튼과 실행이 갈라지지 않는다")
        void nullDisputeDeadlineBlocksReleaseAction() {
            lockedWithoutDeadline();
            withIdempotencyKey();

            ActionState release = actions(hostLeader).release();
            assertThat(release.available()).isFalse();
            assertThat(release.blockedReason())
                    .isEqualTo(ErrorCode.SETTLEMENT_DISPUTE_PERIOD.getCode());

            // 조회가 게이트를 부르는 자리에서도 NPE 가 아니라 판정이 나온다.
            assertSameJudgement(release,
                    () -> settlementService.release(hostLeader, performanceId(), null));
        }

        @Test
        @DisplayName("D-26: 마감이 비어 있어도 이의는 받는다 — 마감 전으로 다룬다(201)")
        void nullDisputeDeadlineStillAcceptsDispute() {
            lockedWithoutDeadline();
            MemberPrincipal teamLeader = principal(world.leaders().get(1));

            // 접수는 되돌릴 수 있는 기록이라 열어두는 쪽이 안전한 방향이다 — release 와 반대다.
            assertAvailableAndPasses(actions(teamLeader).dispute(),
                    () -> settlementService.dispute(teamLeader, performanceId(),
                            disputeRequest(world.teams().get(1))));

            assertThat(settlementService.detail(teamLeader, performanceId()).disputes())
                    .singleElement()
                    .satisfies(dispute -> {
                        assertThat(dispute.status()).isEqualTo("OPEN");
                        assertThat(dispute.releaseHeld()).isTrue();
                    });
        }

        @Test
        @DisplayName("D-26: 자동 스케줄 경로도 막힌다 — job 을 만들지 않는다")
        void nullDisputeDeadlineBlocksAutomaticRelease() {
            lockedWithoutDeadline();

            assertThatThrownBy(() ->
                    settlementService.releaseAutomatically(settlement().getSettlementId()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SETTLEMENT_DISPUTE_PERIOD);

            assertThat(jobs(ChainJob.TxType.RELEASE)).isEmpty();
        }

        @Test
        @DisplayName("D-26: NONE·AGGREGATED 의 빈 마감은 정상이다 — 상태 검사가 먼저 걸러야 한다")
        void nullDeadlineBeforeLockIsJudgedByStatus() {
            aggregated();
            // 집계만 끝난 정산은 마감이 없는 게 맞다. fail-closed 뒤집기가 이 상태의 판정을
            // SETTLEMENT_DISPUTE_PERIOD 로 바꿔 버리면 사용자는 "잠그세요"를 못 읽는다.
            assertThat(settlement().getDisputeDeadlineAt()).isNull();
            withIdempotencyKey();

            assertThatThrownBy(() -> settlementService.release(hostLeader, performanceId(), null))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SETTLEMENT_NOT_LOCKED);
        }

        /**
         * 관리자가 상태만 {@code LOCKED}로 옮기고 마감을 쓰지 않은 정산을 만든다.
         *
         * <p>{@code locked()}가 만든 {@code DISPUTE_OPEN} + 마감 48h 를 그 손자국으로 덮는다.
         */
        private void lockedWithoutDeadline() {
            locked();
            jdbc().update("UPDATE settlement SET status = 'LOCKED', dispute_deadline_at = NULL "
                    + "WHERE settlement_id = ?", settlement().getSettlementId());
            assertThat(settlement().getStatus()).isEqualTo(Settlement.Status.LOCKED);
            assertThat(settlement().getDisputeDeadlineAt()).isNull();
        }
    }

    // ================================================================ 수령 지갑 잔액 캐시

    /**
     * D-44 — 확정 반영이 <b>수령 지갑</b>의 {@code wallet:balance}를 다시 읽게 한다.
     *
     * <p>2026-09-10 Kairos 리허설: release(50,000)와 보증금 반환(50,000)이 리더 지갑에 들어갔는데
     * 공시 {@code walletTotal}은 200,000(실제 300,000)이었고, 불변식 4가 차액 100,000을
     * "미등록 주소 보유"로 표시했다. 워커의 갱신 시점 ②가 {@code chain_job.wallet_id} 하나만
     * 보는데 운영자 tx인 {@code RELEASE}·{@code DEPOSIT_RETURN}에는 그 값이 없기 때문이다.
     *
     * <p>여기서 고정하는 것은 <b>호출 사실</b>뿐이다. 실제 노드가 없어 갱신 결과값은 단정할 수
     * 없고({@code YoYoBalanceReader.isAvailable() == false}), 단정하면 Fake 체인 값을 다시
     * 검증하는 순환이 된다.
     */
    @Nested
    @DisplayName("수령 지갑 잔액 캐시 — 공시 walletTotal 이 낮게 나오던 자리(D-44)")
    class RecipientBalanceRefresh {

        /**
         * spy 상태를 지정해서 지운다.
         *
         * <p>{@code @MockitoSpyBean}은 원칙상 테스트 메서드마다 자동 reset 되지만,
         * 이 프로젝트 조합에서는 호출 기록이 다음 메서드로 넘어왔다(실재: 3회를
         * 기대한 자리에서 7회, 지갑을 하나도 등록하지 않은 테스트에서 1회). 호출
         * 횜수를 세는 테스트는 그 가정을 남의 동작에 맡길 수 없으니 직접 밀어 둔다 —
         * {@code doThrow} 스텁도 같이 지운다.
         */
        @BeforeEach
        void resetRefresherSpy() {
            reset(balanceRefresher);
        }

        @Test
        @DisplayName("release 확정 반영 뒤 팀 리더 지갑 전부의 캐시를 다시 읽는다")
        void releaseRefreshesEveryShareWallet() {
            List<Long> walletIds = fixture.linkLeaderWallets(world);

            releasedOwn();

            for (Long walletId : walletIds) {
                verify(balanceRefresher).refresh(walletId);
            }
            verify(balanceRefresher, times(walletIds.size())).refresh(any());
        }

        @Test
        @DisplayName("보증금 반환 확정 반영 뒤 공연 생성 팀 리더 지갑의 캐시를 다시 읽는다")
        void depositReturnRefreshesHostWallet() {
            List<Long> walletIds = fixture.linkLeaderWallets(world);
            releasedOwn();
            clearInvocations(balanceRefresher);

            applyOwn(ChainJob.TxType.DEPOSIT_RETURN);

            // returnDeposit 은 transfer(this → host) 한 건이다(문서 13 §4.1 11행).
            verify(balanceRefresher).refresh(walletIds.get(0));
            verify(balanceRefresher, times(1)).refresh(any());
        }

        @Test
        @DisplayName("주소 대소문자가 달라도 같은 지갑으로 찾는다 — 체크섬 표기 vs 소문자")
        void addressComparisonIgnoresCase() {
            String checksum = "0xAbC" + "0".repeat(36) + "1"; // 42자 · 체크섬 표기 흉내
            Long walletId = fixture.linkWallet(world.hostLeader(), checksum.toLowerCase());
            aggregatedOwn();
            jdbc().update("UPDATE settlement_share SET wallet_address = ? "
                            + "WHERE settlement_id = ? AND team_id = ?",
                    checksum, settlement().getSettlementId(), world.host().getTeamId());
            clearInvocations(balanceRefresher);

            lockedOwn();
            releaseOwn();

            verify(balanceRefresher).refresh(walletId);
            // 나머지 두 팀은 등록되지 않은 주소라 건너뛴다.
            verify(balanceRefresher, times(1)).refresh(any());
        }

        @Test
        @DisplayName("등록되지 않은 주소는 조용히 건너뛴다 — 확정 반영은 그대로 끝난다")
        void unregisteredAddressIsSkipped() {
            // 리더 지갑을 wallet 테이블에 넣지 않는다. 온체인 팀 지갑이 우리 회원 지갑이어야 할
            // 이유는 없고, 아니라고 해서 상태 전이를 막을 이유는 더 없다.
            releasedOwn();

            assertThat(settlement().getStatus()).isEqualTo(Settlement.Status.RELEASED);
            verify(balanceRefresher, never()).refresh(any());
        }

        /**
         * {@code settlement_share.wallet_address} 는 NULL 허용이다(`V1__init.sql:373`).
         *
         * <p><b>release 게이트가 이미 막는다</b>({@code SettlementGates:320}) — 요청 시점에 빈
         * 주소가 있으면 job 자체가 안 만들어진다. 그래서 여기서 재현하는 것은 <b>요청과 확정
         * 사이에 그 불변식이 깨진 경우</b>다. 그때 주소를 그대로 담으면 {@code List.copyOf} 가
         * NPE 를 던져 release 반영 전체가 롤백되고 <b>매 주기 재시도</b>한다 — 캐시 갱신 하나
         * 때문에 확정을 잃는다(리뷰 !81 🔴).
         */
        @Test
        @DisplayName("확정 직전에 수령 주소가 비어도 release 는 반영된다 — 갱신 하나에 확정을 걸지 않는다")
        void blankRecipientDoesNotBreakRelease() {
            List<Long> walletIds = fixture.linkLeaderWallets(world);
            aggregatedOwn();
            lockedOwn();
            fixture.expireDisputeDeadline(settlement().getSettlementId());
            withIdempotencyKey();
            settlementService.release(hostLeader, performanceId(), null);
            // 게이트를 지난 뒤 스냅샷이 비었다.
            jdbc().update("UPDATE settlement_share SET wallet_address = NULL "
                            + "WHERE settlement_id = ? AND team_id = ?",
                    settlement().getSettlementId(), world.host().getTeamId());
            clearInvocations(balanceRefresher);

            applyOwn(ChainJob.TxType.RELEASE);

            assertThat(settlement().getStatus()).isEqualTo(Settlement.Status.RELEASED);
            // 주소가 남은 팀은 그대로 갱신된다 - 한 칸이 비었다고 전부를 버리지 않는다.
            verify(balanceRefresher, times(walletIds.size() - 1)).refresh(any());
        }

        /**
         * 두 리스너 모두 {@code AFTER_COMMIT} 이고 실행 순서는 <b>발행 순서</b>다. 대사가 먼저
         * 돌면 갱신 전 Redis 로 {@code walletTotal} 을 계산하고 그 스냅샷을
         * {@code CACHE_TTL}(1분) 동안 굳혀, 이 카드가 없애려던 낡은 공시가 1분간 그대로 남는다
         * (리뷰 !81 🔴).
         */
        @Test
        @DisplayName("캐시 갱신이 대사보다 먼저다 — 대사가 갱신 전 값을 1분간 굳힌다")
        void balanceRefreshIsPublishedBeforeReconcile() {
            fixture.linkLeaderWallets(world);
            InOrder order = inOrder(balanceRefresher, supplyReconciler);

            releasedOwn();

            order.verify(balanceRefresher, atLeastOnce()).refresh(any());
            order.verify(supplyReconciler).onSettlementStateChanged(any());
        }

        @Test
        @DisplayName("갱신이 터져도 RELEASED 는 그대로다 — 캐시는 원장이 아니다")
        void refreshFailureDoesNotUndoRelease() {
            fixture.linkLeaderWallets(world);
            doThrow(new IllegalStateException("노드 연결 끊김"))
                    .when(balanceRefresher).refresh(any());

            releasedOwn();

            assertThat(settlement().getStatus()).isEqualTo(Settlement.Status.RELEASED);
            assertThat(settlementShareRepository
                    .findBySettlement_SettlementId(settlement().getSettlementId()))
                    .allMatch(share -> share.isReleased());
            // 연쇄된 보증금 반환 job 도 살아 있어야 한다 — 커밋이 끝난 뒤의 실패이므로.
            assertThat(jobs(ChainJob.TxType.DEPOSIT_RETURN)).hasSize(1);
        }

        // ---------------------------------------------------------- 이 공연만 반영하는 도우미

        /**
         * {@code aggregated()}·{@code released()}가 쓰는
         * {@link SettlementConfirmationService#applyConfirmedJobs()}는 <b>DB 전체</b>의 확정
         * job을 훑는다(주기 실행이니 그게 맞다). 그런데 Testcontainers 컨테이너는 테스트 클래스
         * 전체가 하나를 공유하므로, 다른 테스트가 남긴 확정 job이 이 훑기에 섞여 들어와
         * <b>갱신 호출 횟수가 늘어난다</b>(실측: 3회를 기대한 자리에서 7회). 호출 횟수를 세는
         * 테스트는 이 공연의 job 하나만 반영해야 한다 — 그래서
         * {@link SettlementConfirmationService#apply(ChainJob)}를 직접 부른다.
         */
        private void applyOwn(ChainJob.TxType txType) {
            confirmJob(txType);
            ChainJob job = jobs(txType).stream()
                    .filter(j -> j.getStatus() == ChainJob.Status.CONFIRMED)
                    .reduce((a, b) -> b)
                    .orElseThrow(() -> new IllegalStateException(txType + " 확정 job 이 없다"));
            confirmationService.apply(job);
        }

        private void aggregatedOwn() {
            seedSales();
            settlementService.aggregate(hostLeader, performanceId());
            applyOwn(ChainJob.TxType.AGGREGATE);
        }

        private void lockedOwn() {
            settlementService.lock(hostLeader, performanceId());
            applyOwn(ChainJob.TxType.LOCK);
        }

        private void releaseOwn() {
            fixture.expireDisputeDeadline(settlement().getSettlementId());
            withIdempotencyKey();
            settlementService.release(hostLeader, performanceId(), null);
            applyOwn(ChainJob.TxType.RELEASE);
        }

        private void releasedOwn() {
            aggregatedOwn();
            lockedOwn();
            releaseOwn();
        }
    }

    // ================================================================ 실물 JSON 관측

    /**
     * 정산 3건의 202 를 <b>HTTP 로 한 번씩 실제로 친다</b>.
     *
     * <p>이 클래스의 나머지 테스트는 {@code settlementService} 를 직접 불러 <b>JSON 직렬화를 한 번도
     * 거치지 않는다</b>. 그래서 "전역 {@code non_null} 이 어떤 키를 지우는가" 가 이 도메인에서는
     * 관측된 적이 없었다 — 명세의 {@code required} 가 맞는지 확인할 근거가 없다는 뜻이다.
     *
     * <p>기능을 다시 검증하지 않는다. 목적은 <b>응답 JSON 을 실물로 한 번 보는 것</b>이고, 대조는
     * {@link LiveApiSpecRecorder} 가 모든 MockMvc 응답에 자동으로 건다. 여기서는 최단 경로만 만든다.
     *
     * <p>체인 워커는 테스트에서 실제 tx 를 보내지 않는다. 202 는 <b>접수 응답</b>이라 온체인 없이도
     * 나오고, 다음 단계로 넘어가는 데 필요한 확정은 {@link #confirmJob}이 대신한다.
     */
    @Nested
    @DisplayName("실물 JSON — 202 세 건을 HTTP 경계 너머에서 관측한다")
    class LiveJson {

        @Test
        @DisplayName("집계 → 잠금 → release 를 HTTP 로 치면 202 본문이 명세와 맞는다")
        void lifecycleOverHttp() throws Exception {
            RequestPostProcessor host = Bearer.of(tokens, world.hostLeader());

            // settlement_01 — 집계 전. dustTeamId·rulesHash 가 아직 없어 키째 빠지는 상태다.
            MvcResult beforeAggregate = mvc.perform(get(settlementPath()).with(host))
                    .andExpect(status().isOk()).andReturn();
            LiveApiSpecRecorder.dumpAs(beforeAggregate, "settlement_01.before-aggregate");

            seedSales();

            // settlement_02
            mvc.perform(post(settlementPath() + "/aggregate").with(host))
                    .andExpect(status().isAccepted());
            confirmJob(ChainJob.TxType.AGGREGATE);
            confirmationService.applyConfirmedJobs();

            // settlement_03
            mvc.perform(post(settlementPath() + "/lock").with(host))
                    .andExpect(status().isAccepted());
            confirmJob(ChainJob.TxType.LOCK);
            confirmationService.applyConfirmedJobs();

            // settlement_05 — Idempotency-Key 필수(§0.8). 여기서는 진짜 헤더로 온다.
            fixture.expireDisputeDeadline(settlement().getSettlementId());
            mvc.perform(post(settlementPath() + "/release").with(host)
                            .header("Idempotency-Key", "idem-" + UUID.randomUUID())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"note\":\"정산 실행\"}"))
                    .andExpect(status().isAccepted());
            confirmJob(ChainJob.TxType.RELEASE);
            confirmationService.applyConfirmedJobs();

            // settlement_01 — release 후. 같은 오퍼레이션이 채우는 키가 달라진다.
            MvcResult afterRelease = mvc.perform(get(settlementPath()).with(host))
                    .andExpect(status().isOk()).andReturn();
            LiveApiSpecRecorder.dumpAs(afterRelease, "settlement_01.after-release");

            // settlement_06 → settlement_07(공개 조회). V-03 화면이 이 응답 하나로 그려진다.
            MvcResult link = mvc.perform(post(settlementPath() + "/share-link").with(host))
                    .andExpect(status().isCreated()).andReturn();
            String shareToken = objectMapper.readTree(link.getResponse().getContentAsString())
                    .path("data").path("shareToken").asText();
            mvc.perform(get("/api/v1/public/settlement/" + shareToken))
                    .andExpect(status().isOk());
        }
    }

    // ================================================================ 도우미

    /** 6매 판매 · 팀0에 3표 · 팀1에 2표 · 팀2에 1표. 체인도 같은 값을 말한다. */
    private void seedSales() {
        fixture.placeOrder(world, fixture.createAudience(), world.teams().get(0), 3, 10_000L, 0);
        fixture.placeOrder(world, fixture.createAudience(), world.teams().get(1), 2, 10_000L, 0);
        fixture.placeOrder(world, fixture.createAudience(), world.teams().get(2), 1, 10_000L, 0);
        chain.escrow = 60_000L;
        chain.counts = new long[]{3, 2, 1};
        chain.payouts = expectedPayouts(60_000L, chain.counts);
    }

    private void aggregated() {
        seedSales();
        settlementService.aggregate(hostLeader, performanceId());
        confirmJob(ChainJob.TxType.AGGREGATE);
        confirmationService.applyConfirmedJobs();
    }

    private void locked() {
        aggregated();
        settlementService.lock(hostLeader, performanceId());
        confirmJob(ChainJob.TxType.LOCK);
        confirmationService.applyConfirmedJobs();
    }

    private void released() {
        locked();
        fixture.expireDisputeDeadline(settlement().getSettlementId());
        withIdempotencyKey();
        settlementService.release(hostLeader, performanceId(), null);
        confirmJob(ChainJob.TxType.RELEASE);
        confirmationService.applyConfirmedJobs();
    }

    /** 워커가 하는 일(전송 → receipt 검증 → CONFIRMED)을 대신한다. */
    private void confirmJob(ChainJob.TxType txType) {
        ChainJob job = jobs(txType).stream()
                .filter(j -> j.getStatus() == ChainJob.Status.PENDING)
                .reduce((a, b) -> b)
                .orElseThrow(() -> new IllegalStateException(txType + " job 이 없다"));
        job.markConfirmed("0x" + UUID.randomUUID().toString().replace("-", "")
                + UUID.randomUUID().toString().replace("-", ""), 1);
        chainJobRepository.save(job);
    }

    /** 워커가 전송·revert 로 실패시킨 것을 대신한다 — 가장 최근 RELEASE job 을 FAILED 로 만든다. */
    private ChainJob failLatestReleaseJob() {
        ChainJob job = jobs(ChainJob.TxType.RELEASE).stream()
                .filter(j -> j.getStatus() == ChainJob.Status.PENDING)
                .reduce((a, b) -> b)
                .orElseThrow(() -> new IllegalStateException("PENDING RELEASE job 이 없다"));
        job.markFailed(ErrorCode.CHAIN_NONCE_CONFLICT.name());
        return chainJobRepository.save(job);
    }

    private long[] expectedPayouts(long r, long[] counts) {
        return new com.ssafy.b204.settlement.service.SettlementCalculator()
                .calculate(r, 5000, 5000, new int[]{3334, 3333, 3333}, counts, 0)
                .shares().stream().mapToLong(s -> s.totalAmount()).toArray();
    }

    private DisputeRequest disputeRequest(Team team) {
        return new DisputeRequest(team.getTeamId(),
                "관객 선택 집계가 현장 티켓 수와 맞지 않습니다. 재확인 요청합니다.", 320_000L);
    }

    private String withIdempotencyKey() {
        String key = "idem-" + UUID.randomUUID();
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Idempotency-Key", key);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        return key;
    }

    private void withoutIdempotencyKey() {
        RequestContextHolder.setRequestAttributes(
                new ServletRequestAttributes(new MockHttpServletRequest()));
    }

    private List<ChainJob> jobs(ChainJob.TxType txType) {
        return chainJobRepository.findAll().stream()
                .filter(job -> job.getTxType() == txType
                        && performanceId().equals(job.getTargetPerformanceId()))
                .toList();
    }

    private List<ChainJob> aggregateJobs() {
        return jobs(ChainJob.TxType.AGGREGATE);
    }

    private String settlementPath() {
        return "/api/v1/performances/" + performanceId() + "/settlement";
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

    /** 참여팀이 아닌 관리자 — {@code myTeam} 이 없는 조회자다. */
    private MemberPrincipal admin() {
        return MemberPrincipal.of(world.outsider().getMemberId(), world.outsider().getEmail(),
                true);
    }

    private Actions actions(MemberPrincipal me) {
        return settlementService.detail(me, performanceId()).actions();
    }

    /**
     * {@code actions.X.available == false}와 실행 4xx가 <b>같은 판정</b>인지.
     *
     * <p>{@code blockedReason}은 {@code ErrorCode.getCode()} 문자열이어야 한다 — 프론트는 사람이
     * 읽는 문구가 아니라 {@code code}로 분기한다(규격 v3 §2).
     */
    private void assertSameJudgement(ActionState state, ThrowingCallable execute) {
        assertThat(state.available()).as("available").isFalse();
        assertThat(state.blockedReason()).as("blockedReason").isNotNull();
        assertThatThrownBy(execute)
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode().getCode())
                .as("실행 4xx 의 code 와 blockedReason 이 같아야 한다")
                .isEqualTo(state.blockedReason());
    }

    /** 반대 방향 — 버튼이 활성이면 실행이 실제로 게이트를 통과해야 한다. */
    private void assertAvailableAndPasses(ActionState state, ThrowingCallable execute) {
        assertThat(state.available()).as("available").isTrue();
        assertThat(state.blockedReason()).as("blockedReason").isNull();
        assertThatCode(execute).doesNotThrowAnyException();
    }

    @Autowired JdbcTemplate jdbcTemplate;

    private JdbcTemplate jdbc() {
        return jdbcTemplate;
    }
}
