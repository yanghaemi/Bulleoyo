package com.ssafy.b204.verify;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.settlement.FakeSettlementChainReader;
import com.ssafy.b204.settlement.SettlementTestFixture;
import com.ssafy.b204.settlement.entity.Settlement;
import com.ssafy.b204.settlement.repository.SettlementChainJobRepository;
import com.ssafy.b204.settlement.repository.SettlementRepository;
import com.ssafy.b204.settlement.service.SettlementCalculator;
import com.ssafy.b204.settlement.service.SettlementConfirmationService;
import com.ssafy.b204.settlement.service.SettlementService;
import com.ssafy.b204.support.IntegrationTestBase;
import com.ssafy.b204.verify.dto.VerifyDtos.OnchainCounter;
import com.ssafy.b204.verify.dto.VerifyDtos.Share;
import com.ssafy.b204.verify.dto.VerifyDtos.TeamShare;
import com.ssafy.b204.verify.dto.VerifyDtos.VerificationResponse;
import com.ssafy.b204.verify.service.VerifyService;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * API-verify-01 정산 검증 데이터 — Testcontainers(MySQL·Redis) + Fake 체인.
 *
 * <p>검증하는 것은 <b>"이 응답만으로 독립 재계산이 되는가"</b>와 <b>"못 읽었을 때 거짓말하지
 * 않는가"</b> 둘이다. 그래서 정상 응답 하나를 만드는 데 정산 흐름 전체(집계 → 잠금 → release)를
 * 실제로 돌린다 — SQL로 상태만 세워 두면 "설정한 값을 그대로 돌려주는지"만 보게 된다.
 *
 * <p>체인은 {@link FakeVerifyChainReader}로 대체한다. 실체인을 부르는 테스트는 상태를 바꾸므로
 * 금지다(2026-09-08 MINT E2E 사고).
 */
class VerifyServiceTest extends IntegrationTestBase {

    /** 픽스처가 규칙에 넣는 해시. 온체인 값이 이것과 같아야 {@code hashMatched}가 true다. */
    private static final String RULES_HASH = "0x" + "ab".repeat(32);

    @Autowired VerifyService verifyService;
    @Autowired SettlementService settlementService;
    @Autowired SettlementConfirmationService confirmationService;
    @Autowired SettlementRepository settlementRepository;
    @Autowired SettlementChainJobRepository chainJobRepository;
    @Autowired SettlementTestFixture fixture;
    @Autowired FakeSettlementChainReader settlementChain;
    @Autowired FakeVerifyChainReader verifyChain;
    @Autowired MutableClock clock;
    @Autowired JdbcTemplate jdbcTemplate;

    private SettlementTestFixture.World world;
    private MemberPrincipal hostLeader;

    @BeforeEach
    void setUp() {
        settlementChain.reset();
        verifyChain.reset();
        clock.reset();
        verifyService.invalidateAll();
        RequestContextHolder.resetRequestAttributes();
        world = fixture.createWorld(5000, 5000, new int[]{3334, 3333, 3333});
        hostLeader = principal(world.hostLeader());
    }

    // ================================================================ 정상 응답

    @Nested
    @DisplayName("RELEASED 공연 — 응답 하나로 독립 재계산이 되어야 한다")
    class ReleasedPerformance {

        @Test
        @DisplayName("openapi VerificationData 의 블록이 전부 채워진다")
        void fullShape() {
            release();

            VerificationResponse response = verify();

            assertThat(response.performanceId()).isEqualTo(performanceId());
            assertThat(response.performanceTitle()).isEqualTo(world.performance().getTitle());
            assertThat(response.settlementStatus()).isEqualTo("RELEASED");
            assertThat(response.network()).isEqualTo("kaia-kairos");
            assertThat(response.chainId()).isEqualTo(1001);
            assertThat(response.stale()).isFalse();
            assertThat(response.refreshedAt()).isNotNull();

            assertThat(response.contracts().tokenSymbol()).isEqualTo("YoYo");
            assertThat(response.contracts().tokenDecimals()).isZero();
            assertThat(response.contracts().explorerBaseUrl())
                    .isEqualTo("https://kairos.kaiascan.io");

            // 잠긴 규칙 — 원문과 온체인 해시를 나란히 준다.
            assertThat(response.lockedRule().rulesHash()).isEqualTo(RULES_HASH);
            assertThat(response.lockedRule().onchainRulesHash()).isEqualTo(RULES_HASH);
            assertThat(response.lockedRule().hashMatched()).isTrue();
            assertThat(response.lockedRule().raw().fixedRatioBp()).isEqualTo(5000);
            assertThat(response.lockedRule().raw().selectionRatioBp()).isEqualTo(5000);
            assertThat(response.lockedRule().raw().hostTeamId())
                    .isEqualTo(world.host().getTeamId());
            assertThat(response.lockedRule().raw().teamShares())
                    .extracting(TeamShare::shareBp).containsExactly(3334, 3333, 3333);

            assertThat(response.agreements()).hasSize(3)
                    .allSatisfy(agreement -> {
                        assertThat(agreement.onchainAgreed()).isTrue();
                        assertThat(agreement.walletAddress()).isNotBlank();
                        assertThat(agreement.teamName()).isNotBlank();
                    });

            assertThat(response.onchainCounters())
                    .extracting(OnchainCounter::choiceCount).containsExactly(3L, 2L, 1L);
            assertThat(response.onchainCounters())
                    .extracting(OnchainCounter::teamIndex).containsExactly(0, 1, 2);

            assertThat(response.escrowReconciliation().purchasedTotal()).isEqualTo(60_000L);
            assertThat(response.escrowReconciliation().refundedTotal()).isZero();
            assertThat(response.escrowReconciliation().releasedTotal()).isEqualTo(60_000L);
            assertThat(response.escrowReconciliation().escrowBalanceOnchain()).isZero();
            assertThat(response.escrowReconciliation().expectedEscrowBalance()).isZero();
            assertThat(response.escrowReconciliation().matched()).isTrue();

            assertThat(response.releaseReconciliation().matched()).isTrue();
            assertThat(response.releaseReconciliation().difference()).isZero();
            assertThat(response.releaseReconciliation().releasedEvents()).hasSize(3);

            // 보증금은 release 확정과 함께 반환됐다 — 온체인 잔액 0과 맞아야 한다.
            assertThat(response.depositReconciliation().status()).isEqualTo("RETURNED");
            assertThat(response.depositReconciliation().matched()).isTrue();

            assertThat(response.receiptSummary()).hasSize(3)
                    .allSatisfy(item -> {
                        assertThat(item.received()).isTrue();
                        assertThat(item.receivedAt()).isNotNull();
                        assertThat(item.receivedAmount()).isPositive();
                    });
            assertThat(response.releaseTx().txHash()).isNotBlank();
            assertThat(response.releaseTx().explorerUrl())
                    .startsWith("https://kairos.kaiascan.io/tx/0x");

            assertThat(response.guarantees().guaranteed()).contains("잠긴 규칙의 사후 변조 불가");
            assertThat(response.guarantees().notGuaranteed())
                    .contains("입력 데이터(선택·매출)의 진실성");
            assertThat(response.simulationNotice()).contains("실제 자금이 아닙니다");
        }

        @Test
        @DisplayName("recalculationInput 만으로 shares 가 1원 오차 없이 재현된다")
        void recalculationInputReproducesShares() {
            release();

            VerificationResponse response = verify();
            var input = response.recalculationInput();

            // 응답에 실린 값만 써서 다시 계산한다 — 브라우저가 하는 일과 같다.
            int[] teamShareBp = input.teamShares().stream()
                    .mapToInt(TeamShare::shareBp).toArray();
            long[] counts = response.onchainCounters().stream()
                    .mapToLong(OnchainCounter::choiceCount).toArray();
            int hostIndex = indexOfTeam(response, input.hostTeamId());

            SettlementCalculator.Result recalculated = new SettlementCalculator().calculate(
                    input.distributableAmount(), input.fixedRatioBp(), input.selectionRatioBp(),
                    teamShareBp, counts, hostIndex);

            assertThat(recalculated.shares()).hasSameSizeAs(response.shares());
            for (int i = 0; i < recalculated.shares().size(); i++) {
                Share share = response.shares().get(i);
                SettlementCalculator.Share mine = recalculated.shares().get(i);
                assertThat(share.fixedAmount()).isEqualTo(mine.fixedAmount());
                assertThat(share.choiceAmount()).isEqualTo(mine.choiceAmount());
                assertThat(share.dustAmount()).isEqualTo(mine.dustAmount());
                assertThat(share.totalAmount()).isEqualTo(mine.totalAmount());
            }
            long sharesTotal = response.shares().stream()
                    .mapToLong(Share::totalAmount).sum();
            assertThat(sharesTotal).isEqualTo(input.distributableAmount());
            assertThat(sharesTotal)
                    .isEqualTo(response.releaseReconciliation().recalculatedTotal())
                    .isEqualTo(response.releaseReconciliation().releasedEventTotal());
            assertThat(input.dustAmount()).isNotNull();
            assertThat(input.tokenDecimals()).isZero();
            assertThat(input.currency()).isEqualTo("KRW");
            assertThat(input.roundingRule()).isEqualTo("FLOOR_TO_INTEGER_KRW");
            assertThat(input.remainderRule()).isEqualTo("ASSIGN_DUST_TO_HOST_TEAM");
            assertThat(input.participantCount()).isEqualTo(3);
            assertThat(input.totalChoiceCount()).isEqualTo(6);
        }
    }

    // ================================================================ 노드 장애

    @Nested
    @DisplayName("노드 장애 — 못 읽었으면 못 읽었다고 한다")
    class NodeFailure {

        @Test
        @DisplayName("체인도 못 읽고 캐시도 없으면 502 — DB 값으로 채워 검증됐다고 하지 않는다")
        void noChainNoCacheIs502() {
            seedSales();
            verifyChain.available = false;

            assertThatThrownBy(() -> verify())
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.COMMON_EXTERNAL_SERVICE_ERROR);
        }

        @Test
        @DisplayName("캐시가 있으면 마지막 값 + stale:true")
        void cachedValueIsStale() {
            seedSales();
            VerificationResponse fresh = verify();
            assertThat(fresh.stale()).isFalse();

            clock.advance(Duration.ofSeconds(61));
            verifyChain.available = false;

            VerificationResponse stale = verify();
            assertThat(stale.stale()).isTrue();
            // 값은 마지막으로 읽은 그대로다 — 지어내지 않는다.
            assertThat(stale.escrowReconciliation().escrowBalanceOnchain())
                    .isEqualTo(fresh.escrowReconciliation().escrowBalanceOnchain());
            assertThat(stale.refreshedAt()).isEqualTo(fresh.refreshedAt());
        }

        @Test
        @DisplayName("60초 안에는 캐시가 답한다 — 그 사이 체인 값이 바뀌어도 다시 읽지 않는다")
        void cacheHitsWithinTtl() {
            seedSales();
            VerificationResponse first = verify();

            verifyChain.escrow = 999_999L;
            VerificationResponse second = verify();
            assertThat(second.escrowReconciliation().escrowBalanceOnchain())
                    .isEqualTo(first.escrowReconciliation().escrowBalanceOnchain());

            clock.advance(Duration.ofSeconds(61));
            VerificationResponse third = verify();
            assertThat(third.escrowReconciliation().escrowBalanceOnchain()).isEqualTo(999_999L);
        }

        @Test
        @DisplayName("RELEASED 인데 payoutsOf 를 못 읽으면 두 대사 모두 판정 없음 + stale")
        void releasedButPayoutsUnreadable() {
            release();
            verifyChain.payouts = null;
            verifyService.invalidateAll();

            VerificationResponse response = verify();

            assertThat(response.settlementStatus()).isEqualTo("RELEASED");
            assertThat(response.stale()).isTrue();
            // 나간 금액을 모르면 기대 잔액을 세울 수 없다 — 0으로 놓으면 정상 정산이 불일치가 된다.
            assertThat(response.escrowReconciliation().releasedTotal()).isNull();
            assertThat(response.escrowReconciliation().expectedEscrowBalance()).isNull();
            assertThat(response.escrowReconciliation().matched()).isNull();
            assertThat(response.releaseReconciliation().releasedEventTotal()).isNull();
            assertThat(response.releaseReconciliation().difference()).isNull();
            assertThat(response.releaseReconciliation().matched()).isNull();
            assertThat(response.releaseReconciliation().releasedEvents()).isEmpty();
            // 팀별 수령 금액은 DB settlement_share 로 답한다 — 배열 인덱스를 타지 않는다.
            assertThat(response.receiptSummary()).allSatisfy(
                    item -> assertThat(item.receivedAmount()).isPositive());
        }

        @Test
        @DisplayName("부수 조회(payouts·deposit) 하나만 실패해도 문서 전체를 stale 로 낮춘다")
        void partialReadDegrades() {
            seedSales();
            verifyChain.payouts = null;

            VerificationResponse response = verify();

            assertThat(response.stale()).isTrue();
            // 판정 없음이지 불일치가 아니다 — matched 는 null 이고 JSON 에서는 필드가 빠진다.
            assertThat(response.releaseReconciliation().matched()).isNull();
            assertThat(response.releaseReconciliation().releasedEvents()).isEmpty();
        }
    }

    // ================================================================ release 전

    @Nested
    @DisplayName("release 전 — 아직 일어나지 않은 일을 불일치로 표시하지 않는다")
    class BeforeRelease {

        @Test
        @DisplayName("RELEASED 가 아니면 releaseReconciliation 은 판정 없음(null) + 빈 이벤트")
        void notReleasedIsUnjudged() {
            // 온체인에 몫이 확정돼 있어도(payouts) release 전이면 나간 돈이 없다.
            seedSales();

            VerificationResponse response = verify();

            assertThat(response.settlementStatus()).isEqualTo("NONE");
            assertThat(response.releaseReconciliation().matched()).isNull();
            assertThat(response.releaseReconciliation().releasedEventTotal()).isNull();
            assertThat(response.releaseReconciliation().difference()).isNull();
            assertThat(response.releaseReconciliation().releasedEvents()).isEmpty();
            // 지금 계산할 수 있는 값은 그대로 준다.
            assertThat(response.releaseReconciliation().recalculatedTotal()).isEqualTo(60_000L);

            // 에스크로는 아직 그대로 있어야 맞다 — 이쪽은 판정이 선다.
            assertThat(response.escrowReconciliation().releasedTotal()).isZero();
            assertThat(response.escrowReconciliation().matched()).isTrue();
        }

        @Test
        @DisplayName("보증금 잔액을 못 읽으면 depositReconciliation.matched 는 null")
        void depositUnreadableIsUnjudged() {
            seedSales();
            verifyChain.deposit = null;

            VerificationResponse response = verify();

            assertThat(response.depositReconciliation().matched()).isNull();
            assertThat(response.depositReconciliation().status()).isEqualTo("PAID");
            assertThat(response.stale()).isTrue();
        }
    }

    // ================================================================ 팀 순서 교차검증

    @Nested
    @DisplayName("팀 순서 대조 — 금액은 맞는데 팀이 바뀌는 사고는 합계 검산으로 안 잡힌다")
    class TeamOrderCrossCheck {

        @Test
        @DisplayName("온체인 지갑 배열이 서버 순서와 다르면 팀별 온체인 값을 판정하지 않는다")
        void mismatchDropsPerTeamValues() {
            seedSales();
            // on_chain_index 가 비어 서버가 PK 순서로 이었는데, 실제 createShow 는 1↔2 가 반대였다.
            verifyChain.teamWallets = List.of(walletAddress(1), walletAddress(0), walletAddress(2));

            VerificationResponse response = verify();

            assertThat(response.onchainCounters())
                    .allSatisfy(counter -> assertThat(counter.choiceCount()).isNull());
            assertThat(response.agreements())
                    .allSatisfy(agreement -> assertThat(agreement.onchainAgreed()).isNull());
            // 어느 팀에 줄지 모르는 카운터로는 재계산도 못 한다.
            assertThat(response.shares()).isEmpty();
            assertThat(response.recalculationInput().dustAmount()).isNull();
            assertThat(response.releaseReconciliation().matched()).isNull();
            assertThat(response.releaseReconciliation().releasedEvents()).isEmpty();

            // 순서와 무관한 합계는 그대로 준다 — 그리고 note 로 경고한다.
            assertThat(response.recalculationInput().totalChoiceCount()).isEqualTo(6);
            assertThat(response.escrowReconciliation().matched()).isTrue();
            assertThat(response.escrowReconciliation().note())
                    .contains("escrowOf(showId)")
                    .contains("일치하지 않아");
            // 배선이 틀린 것이지 옛 값을 보여주는 것이 아니다 — stale 이 아니다.
            assertThat(response.stale()).isFalse();
            // 팀별 장부(결제·환불)는 팀 id 로 세므로 그대로 남는다.
            assertThat(response.onchainCounters().get(0).purchaseCount()).isEqualTo(1);
        }

        @Test
        @DisplayName("host 팀 인덱스가 다르면 dust 귀속처가 달라진다 — 같은 처리")
        void hostIndexMismatch() {
            seedSales();
            verifyChain.hostTeamIndex = 2;

            VerificationResponse response = verify();

            assertThat(response.shares()).isEmpty();
            assertThat(response.onchainCounters())
                    .allSatisfy(counter -> assertThat(counter.choiceCount()).isNull());
            assertThat(response.stale()).isFalse();
        }

        @Test
        @DisplayName("팀 배열을 읽지 못하면 대조 불가 — 판정 없음 + stale")
        void unreadableTeamWallets() {
            seedSales();
            verifyChain.teamWallets = null;

            VerificationResponse response = verify();

            assertThat(response.shares()).isEmpty();
            assertThat(response.stale()).isTrue();
        }
    }

    // ================================================================ 권한·상태

    @Nested
    @DisplayName("권한·상태 — 검증 데이터는 참여팀 전용이다")
    class Access {

        @Test
        @DisplayName("로그인하지 않으면 401")
        void anonymousIs401() {
            seedSales();
            assertThatThrownBy(() -> verifyService.verification(null, performanceId()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.COMMON_UNAUTHORIZED);
        }

        @Test
        @DisplayName("참여팀이 아니면 403 COMMON_FORBIDDEN")
        void outsiderIs403() {
            seedSales();
            MemberPrincipal outsider = principal(world.outsider());

            assertThatThrownBy(() -> verifyService.verification(outsider, performanceId()))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.COMMON_FORBIDDEN);
        }

        @Test
        @DisplayName("DRAFT·PENDING_AGREEMENT 는 검증 대상이 아니라 404")
        void draftIs404() {
            seedSales();
            jdbcTemplate.update("UPDATE performance SET status='DRAFT' WHERE performance_id = ?",
                    performanceId());

            assertThatThrownBy(() -> verify())
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.PERFORMANCE_NOT_FOUND);

            jdbcTemplate.update(
                    "UPDATE performance SET status='PENDING_AGREEMENT' WHERE performance_id = ?",
                    performanceId());
            assertThatThrownBy(() -> verify())
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.PERFORMANCE_NOT_FOUND);
        }

        @Test
        @DisplayName("없는 공연은 404")
        void unknownPerformanceIs404() {
            assertThatThrownBy(() -> verifyService.verification(hostLeader, 987_654_321L))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.PERFORMANCE_NOT_FOUND);
        }
    }

    // ================================================================ B-5 관측값

    @Nested
    @DisplayName("팀별 결제·환불 관측값(B-5) — 1원 환불 공격이 화면에 드러나야 한다")
    class LedgerCounters {

        @Test
        @DisplayName("환불 이력이 있는 주문은 표에서 빠지고 refundCount 1로 남는다")
        void refundedOrderIsCountedOnce() {
            // 1팀: 정상 3매. 2팀: 2매 주문을 1원만 환불 → 표는 전량 빠지고 금액만 1원 줄었다.
            fixture.placeOrder(world, fixture.createAudience(), world.teams().get(0), 3, 10_000L, 0);
            fixture.placeOrder(world, fixture.createAudience(), world.teams().get(1), 2, 10_000L, 2);
            long escrow = 50_000L - 2;
            settlementChain.escrow = escrow;
            settlementChain.counts = new long[]{3, 0, 0};
            settlementChain.payouts = null;
            verifyChain.escrow = escrow;
            verifyChain.counts = new long[]{3, 0, 0};
            verifyChain.rulesHash = RULES_HASH;
            verifyChain.teamWallets = onchainWallets();

            List<OnchainCounter> counters = verify().onchainCounters();

            assertThat(counters.get(0).purchaseCount()).isEqualTo(1);
            assertThat(counters.get(0).refundCount()).isZero();
            assertThat(counters.get(0).refundedAmount()).isZero();
            assertThat(counters.get(0).choiceCount()).isEqualTo(3);

            // 이것이 감사 M-10의 신호다 — 표는 0인데 환불 금액은 1원뿐이다.
            assertThat(counters.get(1).purchaseCount()).isEqualTo(1);
            assertThat(counters.get(1).refundCount()).isEqualTo(1);
            assertThat(counters.get(1).refundedAmount()).isEqualTo(2);
            assertThat(counters.get(1).choiceCount()).isZero();

            assertThat(counters.get(2).purchaseCount()).isZero();
            assertThat(counters.get(2).refundCount()).isZero();
        }

        @Test
        @DisplayName("확정 전 환불(PENDING)은 세지 않고, 한 주문의 티켓 2장 환불도 refundCount 는 1")
        void pendingRefundIsNotCountedAndOrderIsCountedOnce() {
            // 1팀: 2매 주문 전액 환불(COMPLETED). refund 행은 티켓당 하나씩 2개 생긴다.
            fixture.placeOrder(world, fixture.createAudience(), world.teams().get(0), 2, 10_000L,
                    20_000L);
            // 2팀: 아직 확정되지 않은 환불 — 온체인에 나가지 않았다.
            fixture.placeOrder(world, fixture.createAudience(), world.teams().get(1), 1, 10_000L,
                    10_000L, com.ssafy.b204.refund.entity.Refund.Status.PENDING);
            verifyChain.escrow = 10_000L;
            verifyChain.counts = new long[]{0, 1, 0};
            verifyChain.rulesHash = RULES_HASH;
            verifyChain.teamWallets = onchainWallets();

            List<OnchainCounter> counters = verify().onchainCounters();

            // 티켓 2장이 환불됐어도 표가 빠진 단위는 주문 하나다.
            assertThat(counters.get(0).refundCount()).isEqualTo(1);
            assertThat(counters.get(0).refundedAmount()).isEqualTo(20_000L);
            assertThat(counters.get(1).refundCount()).isZero();
            assertThat(counters.get(1).refundedAmount()).isZero();
            assertThat(counters.get(1).purchaseCount()).isEqualTo(1);
        }

        @Test
        @DisplayName("실패한 환불은 세지 않는다 — 온체인에서 아무 일도 일어나지 않았다")
        void failedRefundIsNotCounted() {
            fixture.placeOrder(world, fixture.createAudience(), world.teams().get(0), 2, 10_000L,
                    10_000L, com.ssafy.b204.refund.entity.Refund.Status.FAILED);
            settlementChain.escrow = 20_000L;
            settlementChain.counts = new long[]{2, 0, 0};
            verifyChain.escrow = 20_000L;
            verifyChain.counts = new long[]{2, 0, 0};
            verifyChain.rulesHash = RULES_HASH;
            verifyChain.teamWallets = onchainWallets();

            List<OnchainCounter> counters = verify().onchainCounters();

            assertThat(counters.get(0).purchaseCount()).isEqualTo(1);
            assertThat(counters.get(0).refundCount()).isZero();
            assertThat(counters.get(0).refundedAmount()).isZero();
        }
    }

    // ================================================================ 헬퍼

    private VerificationResponse verify() {
        return verifyService.verification(hostLeader, performanceId());
    }

    /** 티켓 3·2·1매 = 60,000원. 두 Fake 가 같은 세계를 말하도록 한 곳에서 세운다. */
    private void seedSales() {
        fixture.placeOrder(world, fixture.createAudience(), world.teams().get(0), 3, 10_000L, 0);
        fixture.placeOrder(world, fixture.createAudience(), world.teams().get(1), 2, 10_000L, 0);
        fixture.placeOrder(world, fixture.createAudience(), world.teams().get(2), 1, 10_000L, 0);
        long[] counts = {3, 2, 1};
        long[] payouts = expectedPayouts(60_000L, counts);

        settlementChain.escrow = 60_000L;
        settlementChain.counts = counts;
        settlementChain.payouts = payouts;

        verifyChain.escrow = 60_000L;
        verifyChain.counts = counts;
        verifyChain.payouts = payouts;
        verifyChain.rulesHash = RULES_HASH;
        verifyChain.teamWallets = onchainWallets();
        verifyChain.hostTeamIndex = 0;
    }

    /** {@code createShow}가 잠근 팀 지갑 배열 = 픽스처가 참여팀에 넣은 주소 순서. */
    private List<String> onchainWallets() {
        List<String> wallets = new ArrayList<>();
        for (int i = 0; i < world.teams().size(); i++) {
            wallets.add(walletAddress(i));
        }
        return wallets;
    }

    /** {@code SettlementTestFixture}가 참여팀에 넣는 지갑 주소와 같은 규칙. */
    private static String walletAddress(int index) {
        return "0x" + String.format("%040d", index + 1);
    }

    /** 집계 → 잠금 → release 까지 실제 흐름을 태운다. */
    private void release() {
        seedSales();
        settlementService.aggregate(hostLeader, performanceId());
        confirmJob(ChainJob.TxType.AGGREGATE);
        confirmationService.applyConfirmedJobs();

        settlementService.lock(hostLeader, performanceId());
        confirmJob(ChainJob.TxType.LOCK);
        confirmationService.applyConfirmedJobs();

        fixture.expireDisputeDeadline(settlementId());
        withIdempotencyKey();
        settlementService.release(hostLeader, performanceId(), null);
        confirmJob(ChainJob.TxType.RELEASE);
        confirmationService.applyConfirmedJobs();

        // release 확정이 보증금 반환 job 을 하나 더 만든다(운영자 tx 2건). 그것까지 확정시킨다.
        confirmJob(ChainJob.TxType.DEPOSIT_RETURN);
        confirmationService.applyConfirmedJobs();

        // release 가 끝나면 에스크로도 보증금도 컨트랙트에 남아 있지 않다.
        verifyChain.escrow = 0L;
        verifyChain.deposit = 0L;
        verifyService.invalidateAll();
    }

    private void confirmJob(ChainJob.TxType txType) {
        ChainJob job = chainJobRepository
                .findByTargetPerformanceIdAndTxTypeInAndStatusOrderByChainJobIdAsc(
                        performanceId(), List.of(txType), ChainJob.Status.PENDING)
                .stream().reduce((a, b) -> b)
                .orElseThrow(() -> new IllegalStateException(txType + " job 이 없다"));
        job.markConfirmed("0x" + UUID.randomUUID().toString().replace("-", "")
                + UUID.randomUUID().toString().replace("-", ""), 1);
        chainJobRepository.save(job);
    }

    private long[] expectedPayouts(long r, long[] counts) {
        return new SettlementCalculator()
                .calculate(r, 5000, 5000, new int[]{3334, 3333, 3333}, counts, 0)
                .shares().stream().mapToLong(SettlementCalculator.Share::totalAmount).toArray();
    }

    private static int indexOfTeam(VerificationResponse response, Long teamId) {
        for (int i = 0; i < response.onchainCounters().size(); i++) {
            if (response.onchainCounters().get(i).teamId().equals(teamId)) {
                return i;
            }
        }
        throw new IllegalStateException("teamId=" + teamId + " 가 카운터에 없다");
    }

    private void withIdempotencyKey() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Idempotency-Key", "idem-" + UUID.randomUUID());
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
    }

    private Long performanceId() {
        return world.performance().getPerformanceId();
    }

    private Long settlementId() {
        return settlementRepository.findByPerformance_PerformanceId(performanceId())
                .map(Settlement::getSettlementId).orElseThrow();
    }

    private static MemberPrincipal principal(Member member) {
        return MemberPrincipal.of(member.getMemberId(), member.getEmail(), member.isAdmin());
    }
}
