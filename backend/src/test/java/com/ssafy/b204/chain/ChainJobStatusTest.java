package com.ssafy.b204.chain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import com.ssafy.b204.chain.config.ChainWorkerProperties;
import com.ssafy.b204.chain.dto.ChainDtos.JobStatusResponse;
import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.chain.service.ChainJobService;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.ticket.repository.TicketRepository;
import com.ssafy.b204.wallet.entity.Wallet;
import com.ssafy.b204.wallet.repository.WalletRepository;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * API-chain-01 작업 상태 조회 — 202를 내려주는 모든 흐름의 유일한 폴링 경로.
 *
 * <p>확인하는 것 셋.
 *
 * <ol>
 *   <li><b>남의 작업은 존재를 숨긴다</b> — 403이 아니라 {@code COMMON_NOT_FOUND}다. 403이면
 *       "그 jobId는 있다"가 새어 나가 job id를 훑는 것만으로 다른 회원의 활동 유무를 알 수 있다
 *       (명세 API-chain-01 [권]).
 *   <li><b>{@code retryable}은 서명 주체가 결정한다</b> — {@code USER} job은 서버가 발신자 서명을
 *       다시 만들 수 없어 항상 {@code false}(§0.3).
 *   <li><b>외부 호출이 없다</b>(PERF-01). 폴링은 1.5초마다 오므로 여기서 노드를 때리면 공용 RPC
 *       한도를 사용자 수만큼 곱해 소모한다.
 * </ol>
 */
class ChainJobStatusTest {

    private static final long ME = 1024L;
    private static final long SOMEONE_ELSE = 2048L;
    private static final int MAX_RETRY = 3;

    private ChainJobRepository chainJobRepository;
    private WalletRepository walletRepository;
    private TicketRepository ticketRepository;
    private ChainJobService service;

    @BeforeEach
    void setUp() {
        chainJobRepository = mock(ChainJobRepository.class);
        walletRepository = mock(WalletRepository.class);
        ticketRepository = mock(TicketRepository.class);
        ChainProperties properties = new ChainProperties(null, 1001L, null, null, null, null);
        service = new ChainJobService(chainJobRepository, properties,
                new ChainWorkerProperties(true, 1000L, 1500L, 120, MAX_RETRY, 20),
                walletRepository, ticketRepository);
    }

    // ------------------------------------------------------------------ 권한

    @Test
    @DisplayName("요청자 본인은 조회한다 — 필드가 chain_job 컬럼 그대로 매핑된다")
    void ownerReadsOwnJob() {
        ChainJob job = job(77L, ChainJob.TxType.MINT, ChainJob.SignerType.OPERATOR, ME);
        givenWallet(9L, "0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a");
        ReflectionTestUtils.setField(job, "walletId", 9L);
        ReflectionTestUtils.setField(job, "amount", 100_000L);
        ReflectionTestUtils.setField(job, "targetPerformanceId", 12L);
        given(chainJobRepository.findById(77L)).willReturn(Optional.of(job));

        JobStatusResponse response = service.jobStatus(principal(ME, false), "chain_77");

        assertThat(response.jobId()).isEqualTo("chain_77");
        assertThat(response.txType()).isEqualTo("MINT");
        assertThat(response.signerType()).isEqualTo("OPERATOR");
        assertThat(response.issuerType()).isEqualTo("MOCK");
        assertThat(response.status()).isEqualTo("PENDING");
        assertThat(response.walletAddress()).isEqualTo("0x6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a");
        assertThat(response.performanceId()).isEqualTo(12L);
        assertThat(response.amount()).isEqualTo(100_000L);
        assertThat(response.currency()).isEqualTo("KRW");
        assertThat(response.feeDelegated()).isFalse();
        assertThat(response.retryCount()).isZero();
        // 이 API 는 티켓을 가리키지 않는 job 이면 주문을 조회하지 않는다.
        verifyNoInteractions(ticketRepository);
    }

    @Test
    @DisplayName("ADMIN 은 남의 작업도 조회한다")
    void adminReadsAnyJob() {
        ChainJob job = job(77L, ChainJob.TxType.RELEASE, ChainJob.SignerType.OPERATOR, SOMEONE_ELSE);
        given(chainJobRepository.findById(77L)).willReturn(Optional.of(job));

        assertThat(service.jobStatus(principal(ME, true), "chain_77").jobId()).isEqualTo("chain_77");
    }

    @Test
    @DisplayName("타인의 작업은 COMMON_NOT_FOUND — 존재를 숨긴다")
    void otherMemberGetsNotFound() {
        ChainJob job = job(77L, ChainJob.TxType.PURCHASE, ChainJob.SignerType.USER, SOMEONE_ELSE);
        given(chainJobRepository.findById(77L)).willReturn(Optional.of(job));

        assertNotFound(() -> service.jobStatus(principal(ME, false), "chain_77"));
    }

    @Test
    @DisplayName("요청자가 없는 시스템 job 은 ADMIN 만 본다")
    void systemJobIsAdminOnly() {
        ChainJob job = job(77L, ChainJob.TxType.LOCK, ChainJob.SignerType.OPERATOR, null);
        given(chainJobRepository.findById(77L)).willReturn(Optional.of(job));

        assertNotFound(() -> service.jobStatus(principal(ME, false), "chain_77"));
        assertThat(service.jobStatus(principal(ME, true), "chain_77").txType()).isEqualTo("LOCK");
    }

    // ------------------------------------------------------------------ jobId 파싱

    @ParameterizedTest
    @ValueSource(strings = {"abc", "chain_x", "77", "chain_", "chain_-1x", "CHAIN_77", ""})
    @DisplayName("chain_{id} 아닌 형식은 전부 COMMON_NOT_FOUND — 파싱 실패를 400 으로 구분하지 않는다")
    void malformedJobIdIsNotFound(String jobId) {
        assertNotFound(() -> service.jobStatus(principal(ME, false), jobId));
    }

    @Test
    @DisplayName("없는 id 도 COMMON_NOT_FOUND")
    void unknownJobIdIsNotFound() {
        given(chainJobRepository.findById(77L)).willReturn(Optional.empty());

        assertNotFound(() -> service.jobStatus(principal(ME, false), "chain_77"));
    }

    @Test
    @DisplayName("인증 정보가 없으면 조회되지 않는다")
    void anonymousGetsNotFound() {
        ChainJob job = job(77L, ChainJob.TxType.MINT, ChainJob.SignerType.OPERATOR, ME);
        given(chainJobRepository.findById(77L)).willReturn(Optional.of(job));

        assertNotFound(() -> service.jobStatus(null, "chain_77"));
    }

    // ------------------------------------------------------------------ pollAfterMs · retryable

    @Test
    @DisplayName("PENDING 이면 pollAfterMs 1500, CONFIRMED 면 null — 종료 상태에서 폴링을 멈춘다")
    void pollAfterMsStopsAtTerminalState() {
        ChainJob job = job(77L, ChainJob.TxType.MINT, ChainJob.SignerType.OPERATOR, ME);
        given(chainJobRepository.findById(77L)).willReturn(Optional.of(job));
        assertThat(service.jobStatus(principal(ME, false), "chain_77").pollAfterMs()).isEqualTo(1500);

        job.markConfirmed("0x" + "1".repeat(64), 3);
        JobStatusResponse confirmed = service.jobStatus(principal(ME, false), "chain_77");
        assertThat(confirmed.pollAfterMs()).isNull();
        assertThat(confirmed.explorerUrl())
                .isEqualTo("https://kairos.kaiascan.io/tx/0x" + "1".repeat(64));
        assertThat(confirmed.confirmedAt()).isNotNull();
    }

    @Test
    @DisplayName("OPERATOR job 이 실패하고 재시도 한도가 남았으면 retryable=true")
    void failedOperatorJobWithRetriesLeftIsRetryable() {
        ChainJob job = job(77L, ChainJob.TxType.RELEASE, ChainJob.SignerType.OPERATOR, ME);
        job.increaseRetry();
        job.markFailed(ErrorCode.CHAIN_NONCE_CONFLICT.name());
        given(chainJobRepository.findById(77L)).willReturn(Optional.of(job));

        JobStatusResponse response = service.jobStatus(principal(ME, false), "chain_77");

        assertThat(response.status()).isEqualTo("FAILED");
        assertThat(response.failureReason()).isEqualTo("CHAIN_NONCE_CONFLICT");
        assertThat(response.retryCount()).isEqualTo(1);
        assertThat(response.retryable()).isTrue();
        assertThat(response.pollAfterMs()).isNull();
    }

    @Test
    @DisplayName("재시도 한도를 다 쓴 OPERATOR job 은 retryable=false — 자동 재시도가 끝났다")
    void exhaustedOperatorJobIsNotRetryable() {
        ChainJob job = job(77L, ChainJob.TxType.RELEASE, ChainJob.SignerType.OPERATOR, ME);
        for (int i = 0; i < MAX_RETRY; i++) {
            job.increaseRetry();
        }
        job.markFailed(ErrorCode.CHAIN_NONCE_CONFLICT.name());
        given(chainJobRepository.findById(77L)).willReturn(Optional.of(job));

        assertThat(service.jobStatus(principal(ME, false), "chain_77").retryable()).isFalse();
    }

    @Test
    @DisplayName("USER job 은 실패해도 retryable=false — 서버가 발신자 서명을 다시 만들 수 없다")
    void failedUserJobIsNeverRetryable() {
        ChainJob job = job(77L, ChainJob.TxType.PURCHASE, ChainJob.SignerType.USER, ME);
        job.markFailed(ErrorCode.CHAIN_TX_TIMEOUT.name());
        given(chainJobRepository.findById(77L)).willReturn(Optional.of(job));

        JobStatusResponse response = service.jobStatus(principal(ME, false), "chain_77");

        assertThat(response.retryable()).isFalse();
        // USER job 은 항상 대납이다(엔티티가 정정한다).
        assertThat(response.feeDelegated()).isTrue();
    }

    @Test
    @DisplayName("성공한 OPERATOR job 은 retryable=false")
    void confirmedJobIsNotRetryable() {
        ChainJob job = job(77L, ChainJob.TxType.MINT, ChainJob.SignerType.OPERATOR, ME);
        job.markConfirmed("0x" + "2".repeat(64), 1);
        given(chainJobRepository.findById(77L)).willReturn(Optional.of(job));

        assertThat(service.jobStatus(principal(ME, false), "chain_77").retryable()).isFalse();
    }

    // ------------------------------------------------------------------ grantSource

    @Test
    @DisplayName("MINT 의 grantSource 는 멱등키 접두로 갈린다 — SIGNUP / ADMIN")
    void grantSourceComesFromIdempotencyKeyPrefix() {
        ChainJob signup = job(77L, ChainJob.TxType.MINT, ChainJob.SignerType.OPERATOR, ME);
        ReflectionTestUtils.setField(signup, "idempotencyKey", "grant:signup:1024");
        given(chainJobRepository.findById(77L)).willReturn(Optional.of(signup));
        assertThat(service.jobStatus(principal(ME, false), "chain_77").grantSource())
                .isEqualTo("SIGNUP");

        ChainJob admin = job(78L, ChainJob.TxType.MINT, ChainJob.SignerType.OPERATOR, ME);
        ReflectionTestUtils.setField(admin, "idempotencyKey",
                "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d");
        given(chainJobRepository.findById(78L)).willReturn(Optional.of(admin));
        assertThat(service.jobStatus(principal(ME, false), "chain_78").grantSource())
                .isEqualTo("ADMIN");
    }

    @Test
    @DisplayName("MINT 가 아니면 grantSource 는 null — 지어내지 않는다")
    void grantSourceIsNullForNonMintJobs() {
        ChainJob job = job(77L, ChainJob.TxType.PURCHASE, ChainJob.SignerType.USER, ME);
        given(chainJobRepository.findById(77L)).willReturn(Optional.of(job));

        assertThat(service.jobStatus(principal(ME, false), "chain_77").grantSource()).isNull();
    }

    // ------------------------------------------------------------------ 저장하지 않는 필드

    @Test
    @DisplayName("chain_job 에 컬럼이 없는 blockNumber·verification·results 는 null 이다")
    void unstoredFieldsAreNull() {
        ChainJob job = job(77L, ChainJob.TxType.MINT, ChainJob.SignerType.OPERATOR, ME);
        given(chainJobRepository.findById(77L)).willReturn(Optional.of(job));

        JobStatusResponse response = service.jobStatus(principal(ME, false), "chain_77");

        assertThat(response.blockNumber()).isNull();
        assertThat(response.verification()).isNull();
        assertThat(response.results()).isNull();
    }

    // ------------------------------------------------------------------ 헬퍼

    private static void assertNotFound(org.assertj.core.api.ThrowableAssert.ThrowingCallable call) {
        assertThatThrownBy(call)
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COMMON_NOT_FOUND);
    }

    private static MemberPrincipal principal(long memberId, boolean admin) {
        return MemberPrincipal.of(memberId, "a@b.c", admin);
    }

    private static ChainJob job(long chainJobId, ChainJob.TxType txType,
                                ChainJob.SignerType signerType, Long requesterId) {
        ChainJob.ChainJobBuilder builder = ChainJob.builder()
                .txType(txType)
                .signerType(signerType)
                .issuerType(ChainJob.IssuerType.MOCK);
        if (requesterId != null) {
            Member requester = mock(Member.class);
            given(requester.getMemberId()).willReturn(requesterId);
            builder.requester(requester);
        }
        ChainJob job = builder.build();
        ReflectionTestUtils.setField(job, "chainJobId", chainJobId);
        return job;
    }

    private void givenWallet(long walletId, String address) {
        Wallet wallet = mock(Wallet.class);
        given(wallet.getAddress()).willReturn(address);
        given(walletRepository.findById(walletId)).willReturn(Optional.of(wallet));
    }
}
