package com.ssafy.b204.performance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doAnswer;

import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.performance.dto.PerformanceDtos.CancelPerformanceRequest;
import com.ssafy.b204.performance.dto.PerformanceDtos.DeletePerformanceResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.MyPerformanceItem;
import com.ssafy.b204.performance.dto.PerformanceDtos.MyPerformancesResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.ParticipantRemovedResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.PerformanceDetailResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.SalesStatusResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.SetTicketTypesResponse;
import com.ssafy.b204.performance.dto.PerformanceDtos.TeamChoice;
import com.ssafy.b204.performance.dto.PerformanceDtos.UpdatePerformanceRequest;
import com.ssafy.b204.performance.dto.PerformanceDtos.UpdatePerformanceResponse;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.entity.PerformanceParticipant;
import com.ssafy.b204.performance.repository.PerformanceParticipantRepository;
import com.ssafy.b204.performance.repository.TicketTypeRepository;
import com.ssafy.b204.performance.service.PerformanceService;
import com.ssafy.b204.rule.entity.RuleAgreement;
import com.ssafy.b204.rule.repository.RuleAgreementRepository;
import com.ssafy.b204.rule.repository.SettlementRuleRepository;
import com.ssafy.b204.settlement.FakeSettlementChainReader;
import com.ssafy.b204.settlement.SettlementTestFixture;
import com.ssafy.b204.settlement.service.SettlementChainReader;
import com.ssafy.b204.support.IntegrationTestBase;
import com.ssafy.b204.team.entity.Team;
import com.ssafy.b204.team.repository.TeamRepository;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 스튜디오 화면이 부르는 4개 엔드포인트 — API-performance-04·06·09·11 (S15P21B204-72).
 *
 * <p>이 4개는 develop에 이미 머지된 프론트({@code features/studio/*})가 부르는데 스켈레톤이라
 * 500이 났다. 이 테스트가 <b>openapi shape과 주요 4xx 갈래</b>를 고정한다.
 *
 * <p>세계는 {@link SettlementTestFixture}를 그대로 빌려 쓴다 — 회원·팀·공연·참여팀·규칙·티켓을
 * 두 벌 만들 이유가 없다. 공연 상태는 픽스처가 {@code ENDED}로 세우므로 각 테스트가 필요한
 * 상태로 SQL로 옮긴다(그 컬럼들은 performance 도메인 엔티티에 변경 메서드가 없다).
 *
 * <p>체인은 {@link FakeSettlementChainReader}다. API-performance-11의 핵심이 "체인이 뭐라고
 * 하는가"이고, <b>못 읽었을 때 200 + {@code onchainAvailable=false}</b>가 화면의 요구사항이라
 * 그 답을 테스트가 정할 수 있어야 한다.
 */
@org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
class PerformanceStudioApiTest extends IntegrationTestBase {

    @Autowired PerformanceService performanceService;
    @Autowired SettlementTestFixture fixture;
    @Autowired FakeSettlementChainReader chain;
    @Autowired SettlementChainReader injectedReader;
    @Autowired MemberRepository memberRepository;
    @Autowired TeamRepository teamRepository;
    // 취소가 락 아래에서 공연을 다시 읽는지 보려면 "손에 든 인스턴스가 행보다 낡은" 상태를
    // 만들어야 한다 — 로더를 가로채는 것 말고는 방법이 없다(cancelRereadsPerformanceUnderLock).
    // 그 spy(performanceRepository)는 IntegrationTestBase 에 있다 — 컨텍스트 공유(S15P21B204-182).
    @PersistenceContext EntityManager em;
    @Autowired PerformanceParticipantRepository participantRepository;
    @Autowired RuleAgreementRepository ruleAgreementRepository;
    @Autowired SettlementRuleRepository settlementRuleRepository;
    @Autowired TicketTypeRepository ticketTypeRepository;
    @Autowired ChainJobRepository chainJobRepository;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired org.springframework.test.web.servlet.MockMvc mvc;
    @Autowired com.ssafy.b204.common.security.JwtTokenProvider tokens;

    private SettlementTestFixture.World world;
    private MemberPrincipal hostLeader;

    /** 3팀 · 5000/5000 · 3334/3333/3333 — settlement 테스트와 같은 모양. */
    @BeforeEach
    void setUp() {
        chain.reset();
        world = fixture.createWorld(5000, 5000, new int[]{3334, 3333, 3333});
        hostLeader = principal(world.hostLeader());
    }

    @Test
    @DisplayName("Fake 체인 리더가 실제로 주입된다")
    void fakeIsWired() {
        assertThat(injectedReader).isSameAs(chain);
    }

    // ================================================================ API-performance-04

    @Nested
    @DisplayName("공연 수정 — 잠금 전만, 일시를 바꾸면 동의가 되돌아간다")
    class Update {

        @Test
        @DisplayName("일시를 바꾸면 취소·판매 마감이 재계산되고 동의가 초기화되며 SIGNING job이 닫힌다")
        void rescheduleResetsAgreements() {
            draft(Performance.Status.PENDING_AGREEMENT);
            long jobId = signingChainJob();
            RuleAgreement agreement = agreement(world.host(), jobId);

            OffsetDateTime startAt = OffsetDateTime.now(ZoneOffset.ofHours(9)).plusDays(30)
                    .withNano(0);
            UpdatePerformanceResponse response = performanceService.update(hostLeader,
                    performanceId(), new UpdatePerformanceRequest(null, null, null, null, null,
                            null, startAt, startAt.plusHours(3)));

            assertThat(response.performanceId()).isEqualTo(performanceId());
            assertThat(response.status()).isEqualTo("PENDING_AGREEMENT");
            assertThat(response.startAt()).isEqualTo(startAt);
            // P-9 판매 마감 = 시작 1분 전 · P-8 취소 마감 = 공연일 D-3 00:00
            assertThat(response.saleCloseAt()).isEqualTo(startAt.minusMinutes(1));
            // 취소 마감은 날짜 기준이라 KST 자정이다. 응답 표기는 회원 timezone(픽스처는 UTC)을
            // 따르므로 오프셋이 아니라 시각으로 비교한다.
            assertThat(response.cancelDeadlineAt()).isEqualTo(startAt.toLocalDate().minusDays(3)
                    .atStartOfDay().atOffset(ZoneOffset.ofHours(9)));
            assertThat(response.agreementsReset()).isTrue();
            // 이미 납부된 보증금은 초기화 대상이 아니다.
            assertThat(response.depositStatus()).isEqualTo("PAID");

            assertThat(ruleAgreementRepository.findById(agreement.getRuleAgreementId())
                    .orElseThrow().getStatus()).isEqualTo(RuleAgreement.Status.PENDING);
            assertThat(chainJobRepository.findById(jobId).orElseThrow().getStatus())
                    .isEqualTo(ChainJob.Status.FAILED);
        }

        @Test
        @DisplayName("startAt 을 저장된 endAt 뒤로 밀면 역전으로 막는다 — endAt 미전송도 저장값을 본다")
        void startAtPastStoredEndAtIsRejected() {
            draft(Performance.Status.PENDING_AGREEMENT);
            OffsetDateTime startAt = OffsetDateTime.now(ZoneOffset.ofHours(9)).plusDays(30)
                    .withNano(0);
            performanceService.update(hostLeader, performanceId(), new UpdatePerformanceRequest(
                    null, null, null, null, null, null, startAt, startAt.plusHours(2)));

            // endAt 을 안 보내도 저장값(시작 +2h)이 기준이다. 시작을 그 뒤로 밀면 역전이다.
            assertThatThrownBy(() -> performanceService.update(hostLeader, performanceId(),
                    new UpdatePerformanceRequest(null, null, null, null, null,
                            null, startAt.plusHours(3), null)))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining(ErrorCode.PERFORMANCE_DATE_INVALID.getCode());
        }

        @Test
        @DisplayName("endAt 만 바꿔도 동의가 초기화된다 — 저장되는 일시라 동의 전제가 달라진다")
        void endAtOnlyChangeResetsAgreements() {
            draft(Performance.Status.PENDING_AGREEMENT);
            // 픽스처 공연은 어제라 endAt 만 보내면 과거 startAt 검증에 걸린다 — 먼저 미래로 민다.
            OffsetDateTime startAt = OffsetDateTime.now(ZoneOffset.ofHours(9)).plusDays(30)
                    .withNano(0);
            performanceService.update(hostLeader, performanceId(), new UpdatePerformanceRequest(
                    null, null, null, null, null, null, startAt, startAt.plusHours(3)));
            agreed(world.host(), "0x" + "cd".repeat(32));

            OffsetDateTime endAt = startAt.plusHours(4);
            UpdatePerformanceResponse response = performanceService.update(hostLeader,
                    performanceId(), new UpdatePerformanceRequest(null, null, null, null, null,
                            null, null, endAt));

            assertThat(response.agreementsReset()).isTrue();
            // 취소·판매 마감은 시작 일시에서만 파생한다 — endAt 변경이 건드리지 않는다.
            assertThat(response.startAt()).isEqualTo(startAt);
            assertThat(response.saleCloseAt()).isEqualTo(startAt.minusMinutes(1));
            assertThat(performance().getEndAt()).isEqualTo(endAt.toLocalDateTime());
        }

        @Test
        @DisplayName("비어 있던 행이라도 종료 시각을 진짜로 바꾸면 동의를 초기화한다")
        void realEndAtChangeOnEmptyRowResetsAgreements() {
            draft(Performance.Status.PENDING_AGREEMENT);
            OffsetDateTime startAt = OffsetDateTime.now(ZoneOffset.ofHours(9)).plusDays(30)
                    .withNano(0);
            performanceService.update(hostLeader, performanceId(), new UpdatePerformanceRequest(
                    null, null, null, null, null, null, startAt, null));
            assertThat(performance().getEndAt()).isNull();
            RuleAgreement agreement = agreement(world.host(), null);
            agreement.markAgreed("0x" + "ab".repeat(32));
            ruleAgreementRepository.save(agreement);

            // 추정값(시작 +3h)이 아니라 주최자가 고른 시각이다. end_at 이 비어 있다는 이유로
            // 넘어가면 팀들이 보지 못한 일정으로 규칙이 잠긴 채 온체인에 올라간다.
            OffsetDateTime changed = startAt.plusHours(5);
            UpdatePerformanceResponse response = performanceService.update(hostLeader,
                    performanceId(), new UpdatePerformanceRequest(null, null, null, null, null,
                            null, null, changed));

            assertThat(response.agreementsReset()).isTrue();
            assertThat(ruleAgreementRepository.findById(agreement.getRuleAgreementId())
                    .orElseThrow().getStatus()).isEqualTo(RuleAgreement.Status.PENDING);
            assertThat(performance().getEndAt()).isNotNull();
        }

        @Test
        @DisplayName("화면이 추정값을 그대로 되돌려 주면 저장도 초기화도 하지 않는다")
        void firstEndAtFillKeepsAgreements() {
            draft(Performance.Status.PENDING_AGREEMENT);
            // V6 이전 행과 같은 상태를 만든다 — 시작만 미래로 밀고 endAt 은 비워 둔다.
            OffsetDateTime startAt = OffsetDateTime.now(ZoneOffset.ofHours(9)).plusDays(30)
                    .withNano(0);
            performanceService.update(hostLeader, performanceId(), new UpdatePerformanceRequest(
                    null, null, null, null, null, null, startAt, null));
            assertThat(performance().getEndAt()).isNull();
            // findAll().get(0) 은 픽스처가 만든 다른 팀 행을 집을 수 있다 — id 로 고정한다.
            RuleAgreement agreement = agreement(world.host(), null);
            agreement.markAgreed("0x" + "ef".repeat(32));
            ruleAgreementRepository.save(agreement);

            // P-03 수정 화면이 하는 그대로다 — 조회가 준 **추정값**을 제목과 함께 되돌려 보낸다.
            OffsetDateTime estimated = performanceService.detail(performanceId(), hostLeader)
                    .endAt();
            UpdatePerformanceResponse response = performanceService.update(hostLeader,
                    performanceId(), new UpdatePerformanceRequest("제목만 고친다", null, null, null,
                            null, null, null, estimated));

            // 제목 한 글자에 팀별 재동의(지갑 서명 + 온체인 tx)가 붙으면 안 된다.
            assertThat(response.agreementsReset()).isFalse();
            assertThat(ruleAgreementRepository.findById(agreement.getRuleAgreementId())
                    .orElseThrow().getStatus()).isEqualTo(RuleAgreement.Status.AGREED);
            // **저장하지 않는다.** 추정값을 굳히면 "서버가 추정한 값" 과 "주최자가 입력한 값" 을
            // 구분할 수 없게 되고, entry_end_at 이 채워진 행에서는 입장 종료가 공연 종료로 굳는다.
            assertThat(performance().getEndAt()).isNull();
            assertThat(performanceService.detail(performanceId(), hostLeader).endAt())
                    .isEqualTo(estimated);
        }

        /**
         * 다른 인스턴스의 AGREE 확정이 커밋을 기다리는 사이 일시 변경이 동의를 되돌린다
         * (S15P21B204-119).
         *
         * <p>A 는 확정 서비스가 job 행에 하는 일(잠금 읽기 → {@code CONFIRMED})만 재현하고 커밋 전에
         * 멈춘다. 도메인 대조(RulesAgreed 이벤트)는 이 경합과 무관하다. B 의 첫 읽기는 A 커밋 전이라
         * 스냅숏은 {@code SUBMITTED} 다 — 그 값으로 거르면 B 는 A 커밋 뒤 {@code FAILED} 로 덮는다.
         */
        @Test
        @DisplayName("AGREE 확정 커밋을 기다리던 일시 변경은 CONFIRMED job 을 FAILED 로 덮지 않는다")
        void rescheduleDoesNotOverwriteConcurrentAgreeConfirm() throws Exception {
            draft(Performance.Status.PENDING_AGREEMENT);
            long jobId = signingChainJob();
            RuleAgreement agreement = agreement(world.host(), jobId);
            OffsetDateTime startAt = OffsetDateTime.now(ZoneOffset.ofHours(9)).plusDays(30)
                    .withNano(0);

            CountDownLatch aConfirmed = new CountDownLatch(1);
            CountDownLatch releaseA = new CountDownLatch(1);
            ExecutorService pool = Executors.newFixedThreadPool(2);
            try {
                Future<?> a = pool.submit(() ->
                        new TransactionTemplate(transactionManager)
                                .executeWithoutResult(status -> {
                                    chainJobRepository.findByIdForUpdate(jobId).orElseThrow()
                                            .markConfirmed("0x" + "ef".repeat(32), 1);
                                    chainJobRepository.flush();
                                    aConfirmed.countDown();
                                    try {
                                        releaseA.await(30, TimeUnit.SECONDS);
                                    } catch (InterruptedException e) {
                                        Thread.currentThread().interrupt();
                                    }
                                }));
                assertThat(aConfirmed.await(10, TimeUnit.SECONDS)).isTrue();

                Future<UpdatePerformanceResponse> b = pool.submit(() ->
                        performanceService.update(hostLeader, performanceId(),
                                new UpdatePerformanceRequest(null, null, null, null, null,
                                        null, startAt, startAt.plusHours(3))));
                Thread.sleep(500);
                boolean bFinishedBeforeACommit = b.isDone();
                releaseA.countDown();

                a.get(10, TimeUnit.SECONDS);
                assertThat(b.get(10, TimeUnit.SECONDS).agreementsReset()).isTrue();

                assertThat(jdbc.queryForObject("SELECT status FROM chain_job WHERE chain_job_id = ?",
                        String.class, jobId)).as("AGREE 확정 커밋이 FAILED 로 덮였다").isEqualTo("CONFIRMED");
                // 동의 자체는 되돌린다 — 규칙 해시 입력이 바뀌었으니 확정된 서명도 다시 받아야 한다.
                assertThat(ruleAgreementRepository.findById(agreement.getRuleAgreementId())
                        .orElseThrow().getStatus()).isEqualTo(RuleAgreement.Status.PENDING);
                assertThat(bFinishedBeforeACommit).as("B 가 A 커밋 전에 끝났다 — 행 잠금을 기다리지 않았다")
                        .isFalse();
            } finally {
                releaseA.countDown();
                pool.shutdownNow();
                pool.awaitTermination(10, TimeUnit.SECONDS);
            }
        }

        @Test
        @DisplayName("전 필드 선택이다 — 보낸 필드만 바뀌고 동의는 그대로다")
        void partialUpdate() {
            draft(Performance.Status.DRAFT);
            String title = performance().getTitle();
            agreed(world.host(), "0x" + "cd".repeat(32));

            UpdatePerformanceResponse response = performanceService.update(hostLeader,
                    performanceId(), new UpdatePerformanceRequest(null, null, null, null,
                            "합정 언플러그드 B홀", null, null, null));

            assertThat(response.agreementsReset()).isFalse();
            assertThat(response.depositStatus()).isEqualTo("PAID");
            Performance after = performance();
            assertThat(after.getVenueName()).isEqualTo("합정 언플러그드 B홀");
            assertThat(after.getTitle()).isEqualTo(title);
        }

        @Test
        @DisplayName("과거 일시·일시 역전은 PERFORMANCE_DATE_INVALID(400)")
        void dateInvalid() {
            draft(Performance.Status.DRAFT);
            OffsetDateTime past = OffsetDateTime.now(ZoneOffset.ofHours(9)).minusDays(1);
            OffsetDateTime future = OffsetDateTime.now(ZoneOffset.ofHours(9)).plusDays(10);

            assertError(() -> performanceService.update(hostLeader, performanceId(),
                            new UpdatePerformanceRequest(null, null, null, null, null, null, past, null)),
                    ErrorCode.PERFORMANCE_DATE_INVALID);
            assertError(() -> performanceService.update(hostLeader, performanceId(),
                            new UpdatePerformanceRequest(null, null, null, null, null, null, future,
                                    future.minusHours(1))),
                    ErrorCode.PERFORMANCE_DATE_INVALID);
        }

        @Test
        @DisplayName("생성자 팀 리더가 아니면 PERFORMANCE_NOT_OWNER(403)")
        void notOwner() {
            draft(Performance.Status.DRAFT);
            assertError(() -> performanceService.update(principal(world.leaders().get(1)),
                            performanceId(),
                            new UpdatePerformanceRequest("남의 공연", null, null, null, null, null, null,
                                    null)),
                    ErrorCode.PERFORMANCE_NOT_OWNER);
        }

        @Test
        @DisplayName("판매 중은 ALREADY_ON_SALE · 종단(ENDED·CANCELLED)은 INVALID_STATUS(409)")
        void lockedStatuses() {
            // 명세 -04 409 표의 두 줄을 그대로 고정한다. SALE_CLOSED 가 여전히
            // ALREADY_ON_SALE 이라는 것이 이 갈림의 경계다.
            assertUpdateFails(Performance.Status.ON_SALE, ErrorCode.PERFORMANCE_ALREADY_ON_SALE);
            assertUpdateFails(Performance.Status.SALE_CLOSED,
                    ErrorCode.PERFORMANCE_ALREADY_ON_SALE);
            assertUpdateFails(Performance.Status.ENDED, ErrorCode.PERFORMANCE_INVALID_STATUS);
            assertUpdateFails(Performance.Status.CANCELLED, ErrorCode.PERFORMANCE_INVALID_STATUS);
        }

        private void assertUpdateFails(Performance.Status from, ErrorCode expected) {
            status(from);
            assertError(() -> performanceService.update(hostLeader, performanceId(),
                            new UpdatePerformanceRequest("바뀐 제목", null, null, null, null, null, null,
                                    null)),
                    expected);
        }
    }

    // ================================================================ API-performance-18

    @Nested
    @DisplayName("공연 삭제 — 규칙 동의 전 · 보증금 미납만")
    class Delete {

        @Test
        @DisplayName("DRAFT·PENDING_AGREEMENT 공연은 참여팀·규칙·티켓 옵션과 함께 사라진다")
        void deletesWithChildren() {
            unpaidDraft(Performance.Status.PENDING_AGREEMENT);
            agreement(world.teams().get(0), null);

            DeletePerformanceResponse response =
                    performanceService.delete(hostLeader, performanceId());

            assertThat(response.performanceId()).isEqualTo(performanceId());
            assertThat(performanceRepository.findById(performanceId())).isEmpty();
            // FK 가 RESTRICT 라 자식이 남아 있으면 여기까지 오지 못한다 — 그래도 새는 것이
            // 없는지 본다(참여팀·정산 규칙·티켓 옵션·동의 넷 전부)
            assertThat(participantRepository.findByPerformance_PerformanceId(performanceId()))
                    .isEmpty();
            assertThat(settlementRuleRepository.findByPerformance_PerformanceId(performanceId()))
                    .isEmpty();
            assertThat(ticketTypeRepository.findByPerformance_PerformanceId(performanceId()))
                    .isEmpty();
            assertThat(ruleAgreementRepository.findByPerformance_PerformanceId(performanceId()))
                    .isEmpty();
        }

        @Test
        @DisplayName("보증금을 낸 공연은 INVALID_STATUS(409) — 에스크로를 돌려받을 주인이 사라진다")
        void depositPaidIsRejected() {
            draft(Performance.Status.PENDING_AGREEMENT);
            jdbc.update("UPDATE performance SET deposit_status = 'PAID' WHERE performance_id = ?",
                    performanceId());

            assertError(() -> performanceService.delete(hostLeader, performanceId()),
                    ErrorCode.PERFORMANCE_INVALID_STATUS);
            assertThat(performanceRepository.findById(performanceId())).isPresent();
        }

        @Test
        @DisplayName("진행 중인 온체인 job 이 있으면 INVALID_STATUS(409) — deposit_status 는 아직 UNPAID 다")
        void inFlightChainJobIsRejected() {
            unpaidDraft(Performance.Status.PENDING_AGREEMENT);
            depositChainJob(ChainJob.Status.PENDING);

            assertError(() -> performanceService.delete(hostLeader, performanceId()),
                    ErrorCode.PERFORMANCE_INVALID_STATUS);
            assertThat(performanceRepository.findById(performanceId())).isPresent();
        }

        /**
         * 락 뒤 job 검사가 READ_COMMITTED 로 최신 커밋을 보는지 고정한다(!202 후속). 스레드 경합
         * 없이 결정적으로 만든다 — 로더를 가로채 공연을 읽은(= REPEATABLE READ 라면 스냅숏이 이미
         * 선) 직후 다른 커넥션이 job 을 커밋한다. 격리가 REPEATABLE READ 로 돌아가면 검사가 그 job 을
         * 못 보고 공연을 지운다. 바깥 트랜잭션 없이 불러야 한다 — 합류하면 격리 지정이 무시된다.
         */
        @Test
        @DisplayName("공연을 읽은 뒤 커밋된 진행 중 job 도 락 뒤 검사가 본다 — READ_COMMITTED")
        void jobCommittedAfterReadIsSeen() {
            unpaidDraft(Performance.Status.PENDING_AGREEMENT);
            doAnswer(invocation -> {
                Optional<Performance> loaded = Optional.of(em.find(Performance.class, performanceId()));
                // 다른 스레드라야 다른 커넥션·자동 커밋이다 — 이 스레드의 JdbcTemplate 은 delete 의
                // 트랜잭션 커넥션에 합류한다.
                Thread committer = new Thread(() -> depositChainJob(ChainJob.Status.PENDING));
                committer.start();
                committer.join();
                return loaded;
            }).when(performanceRepository).findById(performanceId());

            assertError(() -> performanceService.delete(hostLeader, performanceId()),
                    ErrorCode.PERFORMANCE_INVALID_STATUS);
            assertThat(jdbc.queryForObject(
                    "SELECT count(*) FROM performance WHERE performance_id = ?",
                    Integer.class, performanceId())).isOne();
        }

        @Test
        @DisplayName("종결된 job(CONFIRMED·FAILED)만 있으면 지운다 — 기록은 SET NULL 로 남는다")
        void settledChainJobsDoNotBlock() {
            unpaidDraft(Performance.Status.PENDING_AGREEMENT);
            depositChainJob(ChainJob.Status.FAILED);
            releaseChainJob(ChainJob.Status.CONFIRMED);

            performanceService.delete(hostLeader, performanceId());

            assertThat(performanceRepository.findById(performanceId())).isEmpty();
        }

        /** 보증금 job 1건. {@code ChainJob} 은 생성 경로가 chain 도메인이라 SQL 로 만든다. */
        private void depositChainJob(ChainJob.Status status) {
            jdbc.update("INSERT INTO chain_job (tx_type, signer_type, fee_delegated, issuer_type,"
                    + " target_performance_id, status, confirmations, retry_count, requested_at)"
                    + " VALUES ('DEPOSIT','USER',1,'MOCK',?,?,0,0,NOW(6))",
                    performanceId(), status.name());
        }

        @Test
        @DisplayName("판매 중은 ALREADY_ON_SALE · 종단은 INVALID_STATUS(409) — 수정(-04)과 같은 게이트다")
        void lockedStatuses() {
            assertDeleteFails(Performance.Status.ON_SALE, ErrorCode.PERFORMANCE_ALREADY_ON_SALE);
            assertDeleteFails(Performance.Status.SALE_CLOSED,
                    ErrorCode.PERFORMANCE_ALREADY_ON_SALE);
            assertDeleteFails(Performance.Status.ENDED, ErrorCode.PERFORMANCE_INVALID_STATUS);
            assertDeleteFails(Performance.Status.CANCELLED, ErrorCode.PERFORMANCE_INVALID_STATUS);
        }

        @Test
        @DisplayName("생성자 팀 리더가 아니면 PERFORMANCE_NOT_OWNER(403)")
        void notOwner() {
            unpaidDraft(Performance.Status.DRAFT);

            assertError(() -> performanceService.delete(principal(world.leaders().get(1)),
                    performanceId()), ErrorCode.PERFORMANCE_NOT_OWNER);
            assertThat(performanceRepository.findById(performanceId())).isPresent();
        }

        /**
         * 위 테스트들은 {@code performanceService} 를 직접 부른다 — 라우팅도 인가도 응답 래퍼도
         * 지나지 않는다. 화면이 실제로 부르는 것은 HTTP 다. 한 번은 그 길로 친다.
         */
        @Test
        @DisplayName("HTTP 로도 한 번 친다 — DELETE 가 라우팅·인가를 지나 200 SUCCESS 로 온다")
        void deleteOverHttp() throws Exception {
            unpaidDraft(Performance.Status.DRAFT);

            mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                            .delete("/api/v1/performances/" + performanceId())
                            .with(com.ssafy.b204.support.Bearer.of(tokens, world.hostLeader())))
                    .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                            .status().isOk())
                    .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                            .jsonPath("$.code").value("SUCCESS"));

            assertThat(performanceRepository.findById(performanceId())).isEmpty();
        }

        /**
         * {@code SecurityConfig.PUBLIC_GET} 에 {@code /api/v1/performances/*} 가 있다. 그것은
         * <b>GET 전용</b>이라 DELETE 는 인증을 요구해야 한다 — 이 경계가 무너지면 남의 공연을
         * 토큰 없이 지울 수 있다. 규칙을 읽어서가 아니라 눌러 봐서 확인한다.
         */
        @Test
        @DisplayName("토큰이 없으면 401 — 공개 GET 규칙에 DELETE 가 딸려 들어가지 않는다")
        void deleteWithoutTokenIsUnauthorized() throws Exception {
            unpaidDraft(Performance.Status.DRAFT);

            mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                            .delete("/api/v1/performances/" + performanceId()))
                    .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                            .status().isUnauthorized());

            assertThat(performanceRepository.findById(performanceId())).isPresent();
        }

        private void assertDeleteFails(Performance.Status from, ErrorCode expected) {
            unpaidDraft(from);
            assertError(() -> performanceService.delete(hostLeader, performanceId()), expected);
            assertThat(performanceRepository.findById(performanceId())).isPresent();
        }

        /** 픽스처는 {@code ENDED} + 보증금 {@code PAID}로 세운다 — 상태 게이트만 보게 둘 다 되돌린다. */
        private void unpaidDraft(Performance.Status target) {
            draft(target);
            jdbc.update("UPDATE performance SET deposit_status = 'UNPAID' WHERE performance_id = ?",
                    performanceId());
        }
    }

    // ================================================================ API-performance-15

    @Nested
    @DisplayName("티켓 옵션 조회 — 저장(05)과 같은 shape, 생성자만")
    class TicketTypes {

        @Test
        @DisplayName("생성자 팀 리더는 저장된 옵션을 그대로 읽는다")
        void readsOptions() {
            draft(Performance.Status.DRAFT);

            SetTicketTypesResponse response =
                    performanceService.ticketTypes(hostLeader, performanceId());

            assertThat(response.performanceId()).isEqualTo(performanceId());
            assertThat(response.ticketTypes()).singleElement().satisfies(t -> {
                assertThat(t.ticketTypeId()).isEqualTo(world.ticketType().getTicketTypeId());
                assertThat(t.name()).isEqualTo("일반");
                assertThat(t.priceAmount()).isEqualTo(10_000L);
                assertThat(t.currency()).isEqualTo("KRW");
                assertThat(t.totalQuantity()).isEqualTo(500);
                assertThat(t.remainingQuantity()).isEqualTo(500);
            });
        }

        @Test
        @DisplayName("생성자 팀 리더가 아니면 PERFORMANCE_NOT_OWNER(403)")
        void notOwner() {
            draft(Performance.Status.DRAFT);

            assertError(() -> performanceService.ticketTypes(principal(world.leaders().get(1)),
                    performanceId()), ErrorCode.PERFORMANCE_NOT_OWNER);
        }
    }

    @Nested
    @DisplayName("공개 상세 — endAt 은 저장값 우선, 없으면 입장 종료 추정값")
    class Detail {

        @Test
        @DisplayName("end_at 이 빈 기존 행도 endAt 이 비지 않는다 — P-03 수정 화면이 폼을 채운다")
        void endAtIsNeverNull() {
            draft(Performance.Status.DRAFT);

            PerformanceDetailResponse response =
                    performanceService.detail(performanceId(), hostLeader);

            assertThat(response.endAt()).isNotNull();
            assertThat(response.endAt()).isAfter(response.startAt());
        }

        @Test
        @DisplayName("저장된 endAt 이 있으면 추정값(시작 +3시간)이 아니라 그 값을 내려준다")
        void storedEndAtWins() {
            draft(Performance.Status.DRAFT);
            OffsetDateTime startAt = OffsetDateTime.now(ZoneOffset.ofHours(9)).plusDays(30)
                    .withNano(0);
            OffsetDateTime endAt = startAt.plusHours(5);
            performanceService.update(hostLeader, performanceId(), new UpdatePerformanceRequest(
                    null, null, null, null, null, null, startAt, endAt));

            assertThat(performanceService.detail(performanceId(), hostLeader).endAt())
                    .isEqualTo(endAt);
        }
    }

    // ================================================================ API-performance-06

    @Nested
    @DisplayName("내 참여 공연 목록 — 리더인 팀 기준, DRAFT~CANCELLED 전부")
    class MyPerformances {

        @Test
        @DisplayName("주최 공연은 host=true · ACCEPTED · settlementStatus=NONE 으로 나온다")
        void hostRow() {
            draft(Performance.Status.PENDING_AGREEMENT);
            agreement(world.host(), null);

            MyPerformanceItem item = onlyItem(performanceService.myPerformances(hostLeader, null,
                    page(20, "startAt,desc")));

            assertThat(item.performanceId()).isEqualTo(performanceId());
            assertThat(item.title()).isEqualTo(performance().getTitle());
            assertThat(item.startAt()).isNotNull();
            assertThat(item.status()).isEqualTo("PENDING_AGREEMENT");
            assertThat(item.settlementStatus()).isEqualTo("NONE");
            assertThat(item.depositStatus()).isEqualTo("PAID");
            assertThat(item.teamId()).isEqualTo(world.host().getTeamId());
            assertThat(item.host()).isTrue();
            assertThat(item.participationStatus()).isEqualTo("ACCEPTED");
            assertThat(item.myTeamAgreementStatus()).isEqualTo("PENDING");
            // 보증금은 이미 PAID 라 남은 일은 동의 서명이다.
            assertThat(item.pendingSignature()).isEqualTo("AGREE");
        }

        @Test
        @DisplayName("보증금 미납 주최 공연은 pendingSignature=DEPOSIT")
        void depositPending() {
            draft(Performance.Status.DRAFT);
            jdbc.update("UPDATE performance SET deposit_status='UNPAID' WHERE performance_id = ?",
                    performanceId());

            assertThat(onlyItem(performanceService.myPerformances(hostLeader, null, page(20, null)))
                    .pendingSignature()).isEqualTo("DEPOSIT");
        }

        @Test
        @DisplayName("초대만 받고 미수락인 공연도 participationStatus=INVITED 로 함께 준다")
        void invitedRow() {
            draft(Performance.Status.DRAFT);
            Member leader = fixture.createAudience();
            Team invited = teamRepository.save(Team.builder()
                    .name("초대팀-" + UUID.randomUUID().toString().substring(0, 8))
                    .leader(leader)
                    .build());
            // wallet_address 가 없으면 INVITED 다 — ERD ENUM 2값에서 파생한다.
            participantRepository.save(PerformanceParticipant.builder()
                    .performance(performance())
                    .team(invited)
                    .teamShareBp(0)
                    .build());

            MyPerformanceItem item = onlyItem(performanceService.myPerformances(principal(leader),
                    null, page(20, null)));

            assertThat(item.host()).isFalse();
            assertThat(item.teamId()).isEqualTo(invited.getTeamId());
            assertThat(item.participationStatus()).isEqualTo("INVITED");
            assertThat(item.myTeamAgreementStatus()).isEqualTo("PENDING");
        }

        @Test
        @DisplayName("status 필터는 6종 전부 · 그 밖의 값과 허용되지 않는 sort·size 는 400")
        void filterAndSort() {
            assertThat(performanceService.myPerformances(hostLeader, "ENDED", page(20, null))
                    .items()).hasSize(1);
            assertThat(performanceService.myPerformances(hostLeader, "ON_SALE", page(20, null))
                    .items()).isEmpty();

            assertError(() -> performanceService.myPerformances(hostLeader, "NOPE", page(20, null)),
                    ErrorCode.COMMON_VALIDATION_FAILED);
            assertError(() -> performanceService.myPerformances(hostLeader, null,
                    page(20, "createdAt,desc")), ErrorCode.COMMON_VALIDATION_FAILED);
            assertError(() -> performanceService.myPerformances(hostLeader, null, page(101, null)),
                    ErrorCode.COMMON_VALIDATION_FAILED);
        }

        @Test
        @DisplayName("리더인 팀이 없는 계정은 COMMON_FORBIDDEN(403)")
        void notPerformer() {
            assertError(() -> performanceService.myPerformances(principal(world.outsider()), null,
                    page(20, null)), ErrorCode.COMMON_FORBIDDEN);
        }

        @Test
        @DisplayName("정산 행이 없으면 myTeamSettlementApproved 는 null(키 생략)")
        void settlementApprovedAbsentWithoutSettlement() {
            assertThat(onlyItem(performanceService.myPerformances(hostLeader, null, page(20, null)))
                    .myTeamSettlementApproved()).isNull();
        }

        @Test
        @DisplayName("정산 행은 있어도 내 팀 몫이 없으면 null")
        void settlementApprovedAbsentWithoutMyShare() {
            long settlementId = settlementRow("AGGREGATED");
            share(settlementId, world.teams().get(1), false);

            assertThat(onlyItem(performanceService.myPerformances(hostLeader, null, page(20, null)))
                    .myTeamSettlementApproved()).isNull();
        }

        @Test
        @DisplayName("LOCKED + 내 팀 미동의면 false, 동의 후 true")
        void settlementApprovedFollowsMyShare() {
            long settlementId = settlementRow("LOCKED");
            for (Team team : world.teams()) {
                share(settlementId, team, false);
            }
            MemberPrincipal participant = principal(world.leaders().get(1));

            MyPerformanceItem before = onlyItem(performanceService.myPerformances(participant, null,
                    page(20, null)));
            assertThat(before.settlementStatus()).isEqualTo("LOCKED");
            assertThat(before.myTeamSettlementApproved()).isFalse();

            jdbc.update("UPDATE settlement_share SET approved_at = NOW(6) "
                    + "WHERE settlement_id = ? AND team_id = ?",
                    settlementId, world.teams().get(1).getTeamId());

            assertThat(onlyItem(performanceService.myPerformances(participant, null, page(20, null)))
                    .myTeamSettlementApproved()).isTrue();
        }

        @Test
        @DisplayName("다른 팀의 동의는 내 값에 영향을 주지 않는다")
        void otherTeamApprovalDoesNotLeak() {
            long settlementId = settlementRow("DISPUTE_OPEN");
            share(settlementId, world.teams().get(0), false);
            share(settlementId, world.teams().get(1), true);
            share(settlementId, world.teams().get(2), true);

            assertThat(onlyItem(performanceService.myPerformances(hostLeader, null, page(20, null)))
                    .myTeamSettlementApproved()).isFalse();
            assertThat(onlyItem(performanceService.myPerformances(principal(world.leaders().get(2)),
                    null, page(20, null))).myTeamSettlementApproved()).isTrue();
        }

        @Test
        @DisplayName("리더 팀 2개 중 하나만 동의하면 배열의 각 팀 값이 따로 나오고 평면 필드는 첫 항목이다")
        void settlementApprovedPerParticipatingTeam() {
            // 주최 팀 리더가 두 번째 참여팀도 이끌게 만든다 — 한 회원 · 두 팀 · 같은 공연.
            jdbc.update("UPDATE team SET leader_member_id = ? WHERE team_id = ?",
                    world.hostLeader().getMemberId(), world.teams().get(1).getTeamId());
            long settlementId = settlementRow("LOCKED");
            share(settlementId, world.teams().get(0), false);
            share(settlementId, world.teams().get(1), true);
            share(settlementId, world.teams().get(2), false);

            MyPerformanceItem item = onlyItem(performanceService.myPerformances(hostLeader, null,
                    page(20, null)));

            assertThat(item.myParticipatingTeams()).hasSize(2);
            assertThat(item.myParticipatingTeams().get(0).teamId())
                    .isEqualTo(world.host().getTeamId());
            assertThat(item.myParticipatingTeams().get(0).settlementApproved()).isFalse();
            assertThat(item.myParticipatingTeams().get(1).teamId())
                    .isEqualTo(world.teams().get(1).getTeamId());
            assertThat(item.myParticipatingTeams().get(1).settlementApproved()).isTrue();
            assertThat(item.myTeamSettlementApproved()).isFalse();
        }

        private long settlementRow(String status) {
            jdbc.update("INSERT INTO settlement (performance_id, status) VALUES (?, ?)",
                    performanceId(), status);
            return jdbc.queryForObject(
                    "SELECT settlement_id FROM settlement WHERE performance_id = ?",
                    Long.class, performanceId());
        }

        private void share(long settlementId, Team team, boolean approved) {
            jdbc.update("INSERT INTO settlement_share (settlement_id, team_id, equal_amount, "
                            + "selection_amount, dust_amount, total_amount, choice_count, approved_at) "
                            + "VALUES (?, ?, 0, 0, 0, 0, 0, " + (approved ? "NOW(6)" : "NULL") + ")",
                    settlementId, team.getTeamId());
        }
    }

    // ================================================================ API-performance-09

    @Nested
    @DisplayName("참여팀 제외 — 잠금 전만, 주최 팀은 제외 불가")
    class RemoveParticipant {

        @Test
        @DisplayName("수락한 팀을 빼면 남은 참여팀 수와 동의 초기화 여부가 내려온다")
        void removeAccepted() {
            draft(Performance.Status.PENDING_AGREEMENT);
            agreed(world.host(), "0x" + "ef".repeat(32));
            Long removedTeamId = world.teams().get(2).getTeamId();

            ParticipantRemovedResponse response =
                    performanceService.removeParticipant(hostLeader, performanceId(), removedTeamId);

            assertThat(response.performanceId()).isEqualTo(performanceId());
            assertThat(response.teamId()).isEqualTo(removedTeamId);
            // 주최 팀 포함 · 수락 완료 팀만 — API-performance-03 participants 와 같은 정의다.
            assertThat(response.remainingParticipantCount()).isEqualTo(2);
            assertThat(response.agreementsReset()).isTrue();
            assertThat(participantRepository
                    .findByPerformance_PerformanceIdAndTeam_TeamId(performanceId(), removedTeamId)
                    .orElseThrow().getStatus())
                    .isEqualTo(PerformanceParticipant.Status.REMOVED);
        }

        @Test
        @DisplayName("2팀 미만이 되어도 제외 자체는 허용한다 — 판매 시작에서 막힌다")
        void allowsBelowMinimum() {
            draft(Performance.Status.DRAFT);
            performanceService.removeParticipant(hostLeader, performanceId(),
                    world.teams().get(2).getTeamId());

            ParticipantRemovedResponse response = performanceService.removeParticipant(hostLeader,
                    performanceId(), world.teams().get(1).getTeamId());

            assertThat(response.remainingParticipantCount()).isEqualTo(1);
            assertThat(response.agreementsReset()).isFalse();
        }

        @Test
        @DisplayName("주최 팀 제외는 COMMON_VALIDATION_FAILED(400)")
        void cannotRemoveHost() {
            draft(Performance.Status.DRAFT);
            assertError(() -> performanceService.removeParticipant(hostLeader, performanceId(),
                    world.host().getTeamId()), ErrorCode.COMMON_VALIDATION_FAILED);
        }

        @Test
        @DisplayName("참여 기록이 없는 teamId 는 TEAM_NOT_FOUND(404)")
        void unknownTeam() {
            draft(Performance.Status.DRAFT);
            Team stranger = teamRepository.save(Team.builder()
                    .name("무관한팀-" + UUID.randomUUID().toString().substring(0, 8))
                    .leader(fixture.createAudience())
                    .build());

            assertError(() -> performanceService.removeParticipant(hostLeader, performanceId(),
                    stranger.getTeamId()), ErrorCode.TEAM_NOT_FOUND);
        }

        @Test
        @DisplayName("ON_SALE 이후는 PERFORMANCE_ALREADY_ON_SALE(409)")
        void afterOnSale() {
            status(Performance.Status.ON_SALE);
            assertError(() -> performanceService.removeParticipant(hostLeader, performanceId(),
                    world.teams().get(1).getTeamId()), ErrorCode.PERFORMANCE_ALREADY_ON_SALE);
        }
    }

    // ================================================================ API-performance-11

    @Nested
    @DisplayName("판매·선택 현황 — DB 집계와 온체인 카운터를 나란히")
    class SalesStatus {

        @Test
        @DisplayName("체인과 일치하면 counterMatched·escrowMatched 가 모두 true")
        void matched() {
            seedSales();
            chain.escrow = 40_000L;
            chain.counts = new long[]{3, 1, 0};

            SalesStatusResponse response =
                    performanceService.salesStatus(hostLeader, performanceId());

            assertThat(response.performanceId()).isEqualTo(performanceId());
            assertThat(response.status()).isEqualTo("ENDED");
            assertThat(response.grossRevenueAmount()).isEqualTo(50_000L);
            assertThat(response.refundedAmount()).isEqualTo(10_000L);
            // 에스크로 = 순매출(gross − refunded). openapi 예시가 1600000−75000 인 그 자리다.
            assertThat(response.escrowBalanceAmount()).isEqualTo(40_000L);
            assertThat(response.currency()).isEqualTo("KRW");
            assertThat(response.paidTicketCount()).isEqualTo(4);
            assertThat(response.cancelledTicketCount()).isEqualTo(1);
            assertThat(response.ticketTypes()).singleElement()
                    .satisfies(t -> {
                        assertThat(t.ticketTypeId()).isEqualTo(world.ticketType().getTicketTypeId());
                        assertThat(t.name()).isEqualTo("일반");
                        assertThat(t.priceAmount()).isEqualTo(10_000L);
                        assertThat(t.soldQuantity()).isEqualTo(5);
                        assertThat(t.remainingQuantity()).isEqualTo(495);
                    });
            assertThat(response.teamChoices()).hasSize(3);
            assertThat(response.teamChoices()).extracting(TeamChoice::teamIndex)
                    .containsExactly(0, 1, 2);
            assertThat(response.teamChoices()).extracting(TeamChoice::dbCount)
                    .containsExactly(3, 1, 0);
            assertThat(response.teamChoices()).extracting(TeamChoice::onchainCount)
                    .containsExactly(3, 1, 0);
            assertThat(response.teamChoices()).allMatch(TeamChoice::matched);
            assertThat(response.counterMatched()).isTrue();
            assertThat(response.escrowMatched()).isTrue();
            assertThat(response.onchainAvailable()).isTrue();
            assertThat(response.refreshedAt()).isNotNull();
        }

        /**
         * 위 테스트는 {@code performanceService} 를 직접 부른다 — 실제 HTTP 응답 JSON 은 본 적이
         * 없다. 한 번은 MockMvc 로 친다(P-07 판매 현황이 통째로 이 응답 하나로 그려진다).
         */
        @Test
        @DisplayName("HTTP 로도 한 번 친다 — 판매 현황 실물 JSON")
        void matchedOverHttp() throws Exception {
            seedSales();
            chain.escrow = 40_000L;
            chain.counts = new long[]{3, 1, 0};

            mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                            .get("/api/v1/performances/" + performanceId() + "/sales")
                            .with(com.ssafy.b204.support.Bearer.of(tokens, world.hostLeader())))
                    .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                            .status().isOk());
        }

        @Test
        @DisplayName("온체인 조회가 실패하면 200 + onchainAvailable=false · 두 matched 는 null")
        void chainUnavailable() {
            seedSales();
            chain.available = false;

            SalesStatusResponse response =
                    performanceService.salesStatus(hostLeader, performanceId());

            assertThat(response.onchainAvailable()).isFalse();
            // false 로 내려주면 화면이 "위조 발각"으로 읽는다 — 모르는 것은 null 이다.
            assertThat(response.counterMatched()).isNull();
            assertThat(response.escrowMatched()).isNull();
            // 화면은 그때 dbCount 만으로 떠야 한다.
            assertThat(response.teamChoices()).extracting(TeamChoice::dbCount)
                    .containsExactly(3, 1, 0);
            assertThat(response.teamChoices()).extracting(TeamChoice::onchainCount)
                    .containsOnlyNulls();
            assertThat(response.teamChoices()).extracting(TeamChoice::matched)
                    .containsOnlyNulls();
            assertThat(response.grossRevenueAmount()).isEqualTo(50_000L);
        }

        @Test
        @DisplayName("표만 어긋나면 counterMatched=false 인데 escrowMatched 는 true 다 — 별개 필드다")
        void counterMismatch() {
            seedSales();
            chain.escrow = 40_000L;
            chain.counts = new long[]{2, 1, 0};

            SalesStatusResponse response =
                    performanceService.salesStatus(hostLeader, performanceId());

            assertThat(response.counterMatched()).isFalse();
            assertThat(response.escrowMatched()).isTrue();
            assertThat(response.onchainAvailable()).isTrue();
            assertThat(response.teamChoices().get(0).matched()).isFalse();
            assertThat(response.teamChoices().get(1).matched()).isTrue();
        }

        @Test
        @DisplayName("참여팀 리더도 볼 수 있고, 관계자가 아니면 SETTLEMENT_NOT_PARTICIPANT(403)")
        void insiderOnly() {
            seedSales();
            chain.escrow = 40_000L;
            chain.counts = new long[]{3, 1, 0};

            assertThat(performanceService.salesStatus(principal(world.leaders().get(1)),
                    performanceId()).performanceId()).isEqualTo(performanceId());

            assertError(() -> performanceService.salesStatus(principal(world.outsider()),
                    performanceId()), ErrorCode.SETTLEMENT_NOT_PARTICIPANT);
        }

        @Test
        @DisplayName("DRAFT·PENDING_AGREEMENT 는 판매 데이터가 없어 PERFORMANCE_INVALID_STATUS(409)")
        void beforeSale() {
            status(Performance.Status.DRAFT);
            assertError(() -> performanceService.salesStatus(hostLeader, performanceId()),
                    ErrorCode.PERFORMANCE_INVALID_STATUS);

            status(Performance.Status.PENDING_AGREEMENT);
            assertError(() -> performanceService.salesStatus(hostLeader, performanceId()),
                    ErrorCode.PERFORMANCE_INVALID_STATUS);
        }
    }

    @Nested
    @DisplayName("공연 취소(API-performance-12) — release 와의 경합")
    class Cancel {

        /**
         * 에스크로 조회({@code requireEscrow})가 공연 행 락 <b>앞</b>으로 나와 있다 — 채워 두지
         * 않으면 아래 판정에 닿기 전에 {@code COIN_ESCROW_INSUFFICIENT}로 떨어진다.
         */
        @BeforeEach
        void escrowFunded() {
            chain.escrow = 1_000_000L;
        }

        @Test
        @DisplayName("release job 이 큐에 있으면 취소를 접수하지 않는다 — halt 를 뒤에 붙여도 늦는다")
        void pendingReleaseBlocksCancel() {
            seedSales();
            releaseChainJob(ChainJob.Status.PENDING);

            assertError(() -> performanceService.cancel(hostLeader, performanceId(),
                    "idem-" + UUID.randomUUID(), null), ErrorCode.COMMON_CONFLICT);
        }

        @Test
        @DisplayName("release 가 확정됐는데 settlement 반영이 아직이면 그 구간도 막는다")
        void confirmedReleaseBlocksCancel() {
            seedSales();
            releaseChainJob(ChainJob.Status.CONFIRMED);

            assertError(() -> performanceService.cancel(hostLeader, performanceId(),
                    "idem-" + UUID.randomUUID(), null), ErrorCode.COMMON_CONFLICT);
        }

        /**
         * 마지막 job 하나만 보면 놓치는 배치. release 확정 뒤 {@code settlement.status} 반영 전에
         * 두 번째 RELEASE job 이 들어와 실패하면(정산 게이트의 in-flight 검사는 {@code PENDING}·
         * {@code SUBMITTED}만 본다) 마지막 = {@code FAILED}가 되어, 이미 에스크로를 비운
         * {@code CONFIRMED} release 가 가려진다.
         */
        @Test
        @DisplayName("CONFIRMED release 뒤에 FAILED 재시도가 붙어도 가려지지 않는다")
        void failedRetryDoesNotHideConfirmedRelease() {
            seedSales();
            releaseChainJob(ChainJob.Status.CONFIRMED);
            releaseChainJob(ChainJob.Status.FAILED);

            assertError(() -> performanceService.cancel(hostLeader, performanceId(),
                    "idem-" + UUID.randomUUID(), null), ErrorCode.COMMON_CONFLICT);
        }

        /**
         * {@code FAILED}를 사유로 가른다. 타임아웃은 {@code ChainJobWorker.pollOne}이
         * {@code SUBMITTED} job 의 receipt 를 못 찾은 채 닫은 것이라 tx 가 이미 나갔고 나중에
         * 블록에 들어가 에스크로를 비울 수 있다 — 결말을 모르니 막는다. 반대로 revert 는
         * 확정적으로 에스크로를 건드리지 않았으므로 같은 {@code FAILED}라도 통과해야 한다.
         */
        @Test
        @DisplayName("타임아웃으로 FAILED 된 release 는 막고, revert 로 FAILED 된 것은 통과시킨다")
        void timedOutReleaseBlocksCancelButRevertDoesNot() {
            seedSales();
            releaseChainJob(ChainJob.Status.FAILED, "CHAIN_TX_TIMEOUT");

            assertError(() -> performanceService.cancel(hostLeader, performanceId(),
                    "idem-" + UUID.randomUUID(), null), ErrorCode.COMMON_CONFLICT);

            // revert 사유만 남기면(§4.6 selector 접미 포함) 같은 FAILED 라도 접수된다.
            jdbc.update("UPDATE chain_job SET failure_reason = 'PERFORMANCE_INVALID_STATUS#0x88e16c77'"
                    + " WHERE tx_type = 'RELEASE' AND target_performance_id = ?", performanceId());

            assertThat(performanceService.cancel(hostLeader, performanceId(),
                    "idem-" + UUID.randomUUID(), null).performanceId())
                    .isEqualTo(performanceId());
        }

        /**
         * 타임아웃만 막던 가드의 구멍(S15P21B204-120). receipt 검증을 통과한 뒤(= 실행돼 에스크로를
         * 비운 뒤) 도메인 확정이 예외로 끝나거나, {@code sendRawTransaction} 뒤 예외로 노드 수락 여부를
         * 모르는 채 닫힌 release 는 selector 없는 {@code COMMON_INTERNAL_ERROR} 로 남는다.
         */
        @Test
        @DisplayName("selector 없는 COMMON_INTERNAL_ERROR 로 FAILED 된 release 는 막는다 — 실행됐을 수 있다")
        void internalErrorReleaseBlocksCancel() {
            seedSales();
            releaseChainJob(ChainJob.Status.FAILED, "COMMON_INTERNAL_ERROR");

            assertError(() -> performanceService.cancel(hostLeader, performanceId(),
                    "idem-" + UUID.randomUUID(), null), ErrorCode.COMMON_CONFLICT);
        }

        @Test
        @DisplayName("failure_reason 이 null 인 FAILED release 는 막는다 — 모르는 쪽으로 센다")
        void nullReasonReleaseBlocksCancel() {
            seedSales();
            releaseChainJob(ChainJob.Status.FAILED, null);

            assertError(() -> performanceService.cancel(hostLeader, performanceId(),
                    "idem-" + UUID.randomUUID(), null), ErrorCode.COMMON_CONFLICT);
        }

        @Test
        @DisplayName("표 밖 selector 가 붙은 revert(COMMON_INTERNAL_ERROR#0x…)는 통과시킨다")
        void unknownSelectorRevertReleaseDoesNotBlockCancel() {
            seedSales();
            releaseChainJob(ChainJob.Status.FAILED, "COMMON_INTERNAL_ERROR#0x12345678");

            assertThat(performanceService.cancel(hostLeader, performanceId(),
                    "idem-" + UUID.randomUUID(), null).performanceId())
                    .isEqualTo(performanceId());
        }

        /**
         * 위 세 판정은 단일 스레드라 격리 수준과 무관하게 통과한다. 실제 경합에서 이 검사가
         * 최신을 보는 것은 {@code READ_COMMITTED} 덕이다 — 기본 REPEATABLE READ 면 read view 가
         * 트랜잭션 첫 읽기에 고정돼 공연 행 락을 기다리는 동안 커밋된 {@code RELEASE} job 이
         * 보이지 않는다. 경합은 결정적으로 재현할 수 없으니({@code schedulerCreatesRelease…}와
         * 같은 이유) 애노테이션 값만 구조로 고정한다.
         */
        @Test
        @DisplayName("cancel 은 READ_COMMITTED 로 돈다 — 락에서 깨어난 뒤 상대의 커밋을 봐야 한다")
        void cancelRunsInReadCommitted() throws NoSuchMethodException {
            Transactional tx = PerformanceService.class.getMethod("cancel", MemberPrincipal.class,
                    Long.class, String.class, CancelPerformanceRequest.class)
                    .getAnnotation(Transactional.class);

            assertThat(tx).isNotNull();
            assertThat(tx.isolation())
                    .as("기본 REPEATABLE READ 로 돌면 진행 중 RELEASE job 검사가 스냅샷을 본다")
                    .isEqualTo(Isolation.READ_COMMITTED);
        }

        /**
         * 멱등키가 다른 두 취소가 나란히 들어오는 갈래. 락 앞 {@code CANCELLED} 검사는 이 트랜잭션이
         * 처음 로드한 인스턴스를 보므로, 먼저 들어온 취소가 커밋해도 뒤엣것은 그대로 통과한다.
         * 락 뒤 판정이 {@code RELEASE} job 검사뿐이면 거기서도 안 걸린다 — 앞선 취소는 {@code HALT}를
         * 만들지 {@code RELEASE}를 만들지 않기 때문이다. 그대로 두면 {@code HALT}와 환불이 한 벌 더
         * 생긴다(멱등 dedupe 가 전부 키 기준이라 키가 다르면 뚫린다).
         *
         * <p>경합은 결정적으로 재현할 수 없으니 {@code releaseRereadsPerformanceUnderLock}과 같은
         * 방법을 쓴다 — 공연을 로드한 직후 행을 {@code CANCELLED}로 바꿔 두면, 락 아래에서 다시
         * 읽지 않는 구현은 그대로 통과해 job 을 만든다.
         */
        @Test
        @DisplayName("취소는 락과 함께 공연 상태를 다시 읽는다 — 키가 다른 두 번째 취소가 환불을 한 벌 더 만든다")
        void cancelRereadsPerformanceUnderLock() {
            seedSales();
            doAnswer(invocation -> {
                Optional<Performance> loaded = Optional.of(em.find(Performance.class, performanceId()));
                jdbc.update("UPDATE performance SET status = 'CANCELLED' WHERE performance_id = ?",
                        performanceId());
                return loaded;
            }).when(performanceRepository).findById(performanceId());

            assertError(() -> performanceService.cancel(hostLeader, performanceId(),
                    "idem-" + UUID.randomUUID(), null), ErrorCode.PERFORMANCE_INVALID_STATUS);
            assertThat(jdbc.queryForObject(
                    "SELECT count(*) FROM chain_job WHERE tx_type = 'HALT' AND target_performance_id = ?",
                    Integer.class, performanceId()))
                    .as("두 번째 취소는 아무것도 쓰지 않고 떨어져야 한다")
                    .isZero();
        }
    }

    // ================================================================ 도우미

    /** 주어진 상태의 정산 실행 job. {@code signingChainJob()}과 같은 이유로 SQL로 만든다. */
    private void releaseChainJob(ChainJob.Status status) {
        releaseChainJob(status, null);
    }

    /** 실패 사유까지 정한다 — {@code FAILED}는 사유로 갈라야 판정이 달라진다. */
    private void releaseChainJob(ChainJob.Status status, String failureReason) {
        jdbc.update("INSERT INTO chain_job (tx_type, signer_type, fee_delegated, issuer_type,"
                + " target_performance_id, status, failure_reason, confirmations, retry_count,"
                + " requested_at)"
                + " VALUES ('RELEASE','OPERATOR',0,'MOCK',?,?,?,0,0,NOW(6))",
                performanceId(), status.name(), failureReason);
    }

    /** 티켓 5매 — 3+1 유효, 1매는 환불 확정(표 전량 제외 · A-2). */
    private void seedSales() {
        fixture.placeOrder(world, fixture.createAudience(), world.teams().get(0), 3, 10_000L, 0);
        fixture.placeOrder(world, fixture.createAudience(), world.teams().get(1), 1, 10_000L, 0);
        fixture.placeOrder(world, fixture.createAudience(), world.teams().get(2), 1, 10_000L,
                10_000L);
        // sold_quantity 는 결제 확정이 올리는 결과 기록이라 픽스처가 채우지 않는다.
        jdbc.update("UPDATE ticket_type SET sold_quantity = 5 WHERE ticket_type_id = ?",
                world.ticketType().getTicketTypeId());
    }

    /** 잠금 전 상태 + 온체인 미등록으로 되돌린다 — 수정·참여팀 변경이 가능한 세계. */
    private void draft(Performance.Status target) {
        jdbc.update("UPDATE performance SET status = ?, on_chain_id = NULL "
                + "WHERE performance_id = ?", target.name(), performanceId());
    }

    private void status(Performance.Status target) {
        jdbc.update("UPDATE performance SET status = ? WHERE performance_id = ?", target.name(),
                performanceId());
    }

    /** {@code chainJobId}가 있으면 {@code SIGNING}, 없으면 {@code PENDING} 동의 1건. */
    private RuleAgreement agreement(Team team, Long chainJobId) {
        RuleAgreement agreement = ruleAgreementRepository.save(RuleAgreement.builder()
                .performance(performance())
                .team(team)
                .requester(world.hostLeader())
                .build());
        if (chainJobId != null) {
            agreement.markSigning(chainJobId, "0x" + "ab".repeat(32));
        }
        return ruleAgreementRepository.save(agreement);
    }

    /** 서명까지 끝난 동의 1건 — 되돌리면 {@code agreementsReset=true}가 나와야 한다. */
    private void agreed(Team team, String txHash) {
        RuleAgreement agreement = agreement(team, null);
        agreement.markAgreed(txHash);
        ruleAgreementRepository.save(agreement);
    }

    /** 진행 중 동의 서명 job. {@code ChainJob}은 생성 경로가 chain 도메인이라 SQL로 만든다. */
    private long signingChainJob() {
        jdbc.update("INSERT INTO chain_job (tx_type, signer_type, fee_delegated, issuer_type,"
                + " target_performance_id, status, confirmations, retry_count, requested_at)"
                + " VALUES ('AGREE','USER',1,'MOCK',?,'SUBMITTED',0,0,NOW(6))", performanceId());
        return jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    }

    private Long performanceId() {
        return world.performance().getPerformanceId();
    }

    private Performance performance() {
        return performanceRepository.findById(performanceId()).orElseThrow();
    }

    private static MyPerformanceItem onlyItem(MyPerformancesResponse response) {
        assertThat(response.pageInfo().page()).isZero();
        List<MyPerformanceItem> items = response.items();
        assertThat(items).hasSize(1);
        return items.get(0);
    }

    private static PageRequest page(int size, String sort) {
        if (sort == null) {
            return PageRequest.of(0, size);
        }
        String[] parts = sort.split(",");
        return PageRequest.of(0, size, Sort.by(Sort.Direction.fromString(parts[1]), parts[0]));
    }

    private static MemberPrincipal principal(Member member) {
        return MemberPrincipal.of(member.getMemberId(), member.getEmail(), member.isAdmin());
    }

    private static void assertError(Runnable call, ErrorCode expected) {
        assertThatThrownBy(call::run)
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(expected);
    }
}
