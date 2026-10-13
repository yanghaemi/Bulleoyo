package com.ssafy.b204.chain;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import com.ssafy.b204.chain.client.KaiaChainClient;
import com.ssafy.b204.chain.config.ChainWallet;
import com.ssafy.b204.chain.config.ChainWorkerProperties;
import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.metrics.ChainMetrics;
import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.chain.service.ChainJobConfirmationService;
import com.ssafy.b204.chain.service.FeeDelegationService;
import com.ssafy.b204.chain.service.ReceiptEvents;
import com.ssafy.b204.chain.service.ReceiptVerifier;
import com.ssafy.b204.chain.service.TxReceipt;
import com.ssafy.b204.chain.worker.ChainJobStateWriter;
import com.ssafy.b204.chain.worker.ChainJobWorker;
import com.ssafy.b204.chain.worker.ChainOwnership;
import com.ssafy.b204.chain.worker.ChainWalletQueue;
import com.ssafy.b204.chain.worker.OperatorTxBuilder;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.wallet.service.WalletBalanceRefresher;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.math.BigInteger;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.test.util.ReflectionTestUtils;
import org.web3j.crypto.KaiaCredentials;
import org.web3j.protocol.core.methods.response.TransactionReceipt;

/**
 * chain_job 워커 상태 전이 — API v6 §0.3.
 *
 * <p>노드도 DB도 띄우지 않는다. 검증 대상은 <b>"어떤 상황에서 어떤 상태로 보내는가"</b> 하나이며,
 * 그 판단은 리포지토리·RPC의 응답 모양에만 의존하므로 mock으로 전부 재현된다.
 *
 * <p>지갑 큐는 <b>인라인 실행으로 바꿔 끼운다</b>. 실제 큐는 별도 스레드라 검증이 타이밍에 의존하게
 * 되는데, 이 테스트가 확인하려는 것은 스레딩이 아니라 전이 규칙이다(직렬화 자체는
 * {@link ChainWalletQueue}가 지갑당 스레드 1개로 보장한다).
 */
class ChainJobWorkerTest {

    private ChainJobRepository repository;
    private ChainJobStateWriter stateWriter;
    private KaiaChainClient chainClient;
    private FeeDelegationService feeDelegationService;
    private OperatorTxBuilder operatorTxBuilder;
    private ObjectProvider<OperatorTxBuilder> builderProvider;
    private ChainJobConfirmationService confirmations;
    private WalletBalanceRefresher balanceRefresher;
    private com.ssafy.b204.common.alert.OpsAlert opsAlert;
    private ChainJobWorker worker;
    private SimpleMeterRegistry meterRegistry;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        repository = mock(ChainJobRepository.class);
        stateWriter = mock(ChainJobStateWriter.class);
        chainClient = mock(KaiaChainClient.class);
        feeDelegationService = mock(FeeDelegationService.class);
        operatorTxBuilder = mock(OperatorTxBuilder.class);
        builderProvider = mock(ObjectProvider.class);
        confirmations = mock(ChainJobConfirmationService.class);
        balanceRefresher = mock(WalletBalanceRefresher.class);
        opsAlert = mock(com.ssafy.b204.common.alert.OpsAlert.class);
        meterRegistry = new SimpleMeterRegistry();
        // 확정 서비스의 기본 응답은 "성공" 이다 — 이 클래스가 검증하는 것은 전이 규칙이지
        // 도메인 전이가 아니다(그쪽은 PerformancePaymentFlowTest 가 실물로 돌린다).
        given(confirmations.confirm(anyLong(), any()))
                .willReturn(new ChainJobConfirmationService.Result(true, null, List.of()));

        // 소유권 비활성(instance-id 없음) = 단일 인스턴스와 같다. 이 테스트가 재는 것이 그것이다.
        worker = newWorker(alwaysOwner());
    }

    @SuppressWarnings("unchecked")
    private ChainJobWorker newWorker(ChainOwnership ownership) {
        ObjectProvider<KaiaCredentials> noCredentials = mock(ObjectProvider.class);

        ChainWalletQueue inlineQueue = new ChainWalletQueue() {
            @Override
            public void submit(ChainWallet wallet, Runnable task) {
                task.run();
            }
        };

        return new ChainJobWorker(repository, ownership, stateWriter, inlineQueue, chainClient,
                feeDelegationService, new ReceiptVerifier(),
                new ReceiptEvents(new ChainProperties(null, 1001L, null, null, null, null)),
                confirmations, balanceRefresher,
                new ChainWorkerProperties(true, 1000L, 1500L, 120, 3, 20),
                new ChainMetrics(meterRegistry),
                builderProvider, noCredentials, noCredentials, opsAlert,
                new ChainProperties(null, 1001L, null, null, null, null));
    }

    /**
     * claim 이 예외를 던지면(DB 순단) inFlight 에서 빼야 한다 — 안 빼면 재시작 전까지 그 job 을
     * 다시 안 집는다(S15P21B204-96 리뷰).
     */
    @Test
    @DisplayName("claim 이 예외를 던져도 inFlight 에 남지 않는다 — 다음 주기에 다시 집어 보낸다")
    void claimFailureDoesNotLeakInFlight() {
        ChainJob pending = job(ChainJob.TxType.MINT, ChainJob.SignerType.OPERATOR, 7L, LocalDateTime.now());
        ChainOwnership ownership = mock(ChainOwnership.class);
        given(ownership.isOwner()).willReturn(true);
        given(ownership.claim(7L)).willThrow(new IllegalStateException("DB 순단")).willReturn(true);
        ChainJobWorker claimingWorker = newWorker(ownership);
        given(chainClient.isAvailable()).willReturn(true);
        given(builderProvider.getIfAvailable()).willReturn(operatorTxBuilder);
        given(operatorTxBuilder.supports(ChainJob.TxType.MINT)).willReturn(true);
        given(operatorTxBuilder.buildSignedTx(any())).willReturn("0x31aabb");
        given(repository.findByStatusAndSignerTypeOrderByChainJobIdAsc(
                ChainJob.Status.PENDING, ChainJob.SignerType.OPERATOR)).willReturn(List.of(pending));
        given(repository.findById(7L)).willReturn(Optional.of(pending));
        given(chainClient.sendRawTransaction("0x31aabb")).willReturn("0x" + "ab".repeat(32));

        assertThatThrownBy(claimingWorker::dispatchPendingOperatorJobs)
                .isInstanceOf(IllegalStateException.class);
        verify(stateWriter, never()).markSubmitted(anyLong(), anyString());

        claimingWorker.dispatchPendingOperatorJobs();

        verify(stateWriter).markSubmitted(eq(7L), eq("0x" + "ab".repeat(32)));
    }

    /**
     * 디스패치 때 집은 claim 이 전송 시점에는 이미 다른 인스턴스로 넘어갔다 — 큐가 밀리거나 이
     * 인스턴스가 낡은 claim 기준보다 오래 멈춘 경우다. PENDING 검사만으로는 상대가 SUBMITTED 를
     * 적기 전까지 통과하므로, 전송 직전 재claim 이 없으면 같은 tx 가 두 번 나간다(!98 재리뷰).
     */
    @Test
    @DisplayName("전송 직전 claim 을 잃었으면 보내지 않는다 — 큐 대기 중 다른 인스턴스가 가져간 job")
    void skipsSendWhenClaimLostBeforeSend() {
        ChainJob pending = job(ChainJob.TxType.MINT, ChainJob.SignerType.OPERATOR, 7L, LocalDateTime.now());
        ChainOwnership ownership = mock(ChainOwnership.class);
        given(ownership.isOwner()).willReturn(true);
        // 첫 호출(디스패치)은 집고, 두 번째 호출(지갑 큐에서 전송 직전)은 이미 뺏겼다.
        given(ownership.claim(7L)).willReturn(true, false);
        ChainJobWorker claimingWorker = newWorker(ownership);
        given(chainClient.isAvailable()).willReturn(true);
        given(builderProvider.getIfAvailable()).willReturn(operatorTxBuilder);
        given(operatorTxBuilder.supports(ChainJob.TxType.MINT)).willReturn(true);
        given(operatorTxBuilder.buildSignedTx(any())).willReturn("0x31aabb");
        given(repository.findByStatusAndSignerTypeOrderByChainJobIdAsc(
                ChainJob.Status.PENDING, ChainJob.SignerType.OPERATOR)).willReturn(List.of(pending));
        given(repository.findById(7L)).willReturn(Optional.of(pending));
        given(chainClient.sendRawTransaction("0x31aabb")).willReturn("0x" + "ab".repeat(32));

        claimingWorker.dispatchPendingOperatorJobs();

        verify(chainClient, never()).sendRawTransaction(anyString());
        verify(stateWriter, never()).markSubmitted(anyLong(), anyString());
        verify(stateWriter, never()).retryOrFail(anyLong(), anyInt(), any());
    }

    /**
     * 전송 직전 재claim 이 DB 순단으로 던지면 <b>전송 실패가 아니다</b> — 아무것도 보내지 않았으니
     * 재시도 횟수를 깎으면 안 되고, inFlight 에서 빠져 다음 주기에 다시 집혀야 한다(S15P21B204-119).
     */
    @Test
    @DisplayName("전송 직전 재claim 예외는 retryOrFail 을 부르지 않고, 다음 주기에 다시 보낸다")
    void reclaimFailureIsNotCountedAsRetry() {
        ChainJob pending = job(ChainJob.TxType.MINT, ChainJob.SignerType.OPERATOR, 7L, LocalDateTime.now());
        ChainOwnership ownership = mock(ChainOwnership.class);
        given(ownership.isOwner()).willReturn(true);
        // 디스패치 claim 성공 → 전송 직전 claim 순단 → 다음 주기에는 둘 다 성공.
        given(ownership.claim(7L)).willReturn(true)
                .willThrow(new IllegalStateException("DB 순단"))
                .willReturn(true);
        ChainJobWorker claimingWorker = newWorker(ownership);
        given(chainClient.isAvailable()).willReturn(true);
        given(builderProvider.getIfAvailable()).willReturn(operatorTxBuilder);
        given(operatorTxBuilder.supports(ChainJob.TxType.MINT)).willReturn(true);
        given(operatorTxBuilder.buildSignedTx(any())).willReturn("0x31aabb");
        given(repository.findByStatusAndSignerTypeOrderByChainJobIdAsc(
                ChainJob.Status.PENDING, ChainJob.SignerType.OPERATOR)).willReturn(List.of(pending));
        given(repository.findById(7L)).willReturn(Optional.of(pending));
        given(chainClient.sendRawTransaction("0x31aabb")).willReturn("0x" + "ab".repeat(32));

        claimingWorker.dispatchPendingOperatorJobs();

        verify(chainClient, never()).sendRawTransaction(anyString());
        verify(stateWriter, never()).retryOrFail(anyLong(), anyInt(), any());

        claimingWorker.dispatchPendingOperatorJobs();

        verify(stateWriter).markSubmitted(eq(7L), eq("0x" + "ab".repeat(32)));
    }

    /**
     * 루프 시작에만 소유권을 보면 블루/그린 전환 뒤에도 옛 색이 SUBMITTED 전부를 확정한다.
     * job 마다 다시 보고, 잃은 순간 남은 job 은 손대지 않는다(S15P21B204-119).
     */
    @Test
    @DisplayName("receipt 루프 중 소유권을 잃으면 뒤 job 을 확정하지 않는다")
    void stopsConfirmingWhenOwnershipLostMidLoop() {
        ChainJob first = job(ChainJob.TxType.PURCHASE, ChainJob.SignerType.USER, 31L, LocalDateTime.now());
        first.markSubmitted("0x" + "31".repeat(32));
        ChainJob second = job(ChainJob.TxType.PURCHASE, ChainJob.SignerType.USER, 32L, LocalDateTime.now());
        second.markSubmitted("0x" + "32".repeat(32));
        ChainOwnership ownership = mock(ChainOwnership.class);
        // 루프 시작 게이트 → 첫 job 앞 → 둘째 job 앞(이때 넘어갔다).
        given(ownership.isOwner()).willReturn(true, true, false);
        ChainJobWorker pollingWorker = newWorker(ownership);
        given(chainClient.isAvailable()).willReturn(true);
        given(repository.findByStatusAndSignerTypeOrderByChainJobIdAsc(
                ChainJob.Status.PENDING, ChainJob.SignerType.USER)).willReturn(List.of());
        given(repository.findByStatus(ChainJob.Status.SUBMITTED)).willReturn(List.of(first, second));
        given(chainClient.receipt(anyString())).willReturn(Optional.of(receipt("0x1")));
        given(chainClient.blockNumber()).willReturn(BigInteger.valueOf(110));

        pollingWorker.pollSubmittedJobs();

        verify(confirmations).confirm(eq(31L), any(TxReceipt.class));
        verify(confirmations, never()).confirm(eq(32L), any());
        verify(chainClient, never()).receipt("0x" + "32".repeat(32));
        verify(stateWriter, never()).markConfirmed(eq(32L), anyString(), anyInt());
    }

    private ChainJob job(ChainJob.TxType txType, ChainJob.SignerType signerType, long id, LocalDateTime requestedAt) {
        ChainJob job = ChainJob.builder()
                .txType(txType)
                .signerType(signerType)
                .issuerType(ChainJob.IssuerType.MOCK)
                .build();
        // @Id는 DB가, requested_at은 @CreationTimestamp가 채우는 값이라 단위 테스트에서는 직접 넣는다.
        ReflectionTestUtils.setField(job, "chainJobId", id);
        ReflectionTestUtils.setField(job, "requestedAt", requestedAt);
        return job;
    }

    private static TransactionReceipt receipt(String status) {
        TransactionReceipt receipt = new TransactionReceipt();
        receipt.setStatus(status);
        receipt.setTransactionHash("0x" + "cd".repeat(32));
        receipt.setBlockNumber("0x64");
        return receipt;
    }

    /** 소유권 비활성 — 식별자가 비면 Redis 를 보지 않고 언제나 맡는다. */
    private ChainOwnership alwaysOwner() {
        return new ChainOwnership(
                org.mockito.Mockito.mock(
                        org.springframework.data.redis.core.StringRedisTemplate.class),
                repository, "");
    }

    @Test
    @DisplayName("체인 설정이 없으면 워커는 DB조차 읽지 않는다 — 키 없는 팀원의 로컬에서 조용해야 한다")
    void doesNothingWithoutChainClient() {
        given(chainClient.isAvailable()).willReturn(false);

        worker.dispatchPendingOperatorJobs();
        worker.pollSubmittedJobs();

        verifyNoInteractions(repository);
        verifyNoInteractions(stateWriter);
    }

    @Test
    @DisplayName("OperatorTxBuilder 구현체가 없으면 PENDING을 그대로 둔다 — 실패로 만들지 않는다")
    void keepsPendingWhenBuilderMissing() {
        given(chainClient.isAvailable()).willReturn(true);
        given(builderProvider.getIfAvailable()).willReturn(null);
        given(repository.findByStatusAndSignerTypeOrderByChainJobIdAsc(
                ChainJob.Status.PENDING, ChainJob.SignerType.OPERATOR))
                .willReturn(List.of(job(ChainJob.TxType.MINT, ChainJob.SignerType.OPERATOR, 1L, LocalDateTime.now())));

        worker.dispatchPendingOperatorJobs();

        verifyNoInteractions(stateWriter);
    }

    @Test
    @DisplayName("PENDING → SUBMITTED — 빌더가 만든 raw tx를 보내고 txHash를 기록한다")
    void submitsPendingOperatorJob() {
        ChainJob pending = job(ChainJob.TxType.MINT, ChainJob.SignerType.OPERATOR, 7L, LocalDateTime.now());
        given(chainClient.isAvailable()).willReturn(true);
        given(builderProvider.getIfAvailable()).willReturn(operatorTxBuilder);
        given(operatorTxBuilder.supports(ChainJob.TxType.MINT)).willReturn(true);
        given(operatorTxBuilder.buildSignedTx(any())).willReturn("0x31aabb");
        given(repository.findByStatusAndSignerTypeOrderByChainJobIdAsc(
                ChainJob.Status.PENDING, ChainJob.SignerType.OPERATOR)).willReturn(List.of(pending));
        given(repository.findById(7L)).willReturn(Optional.of(pending));
        given(chainClient.sendRawTransaction("0x31aabb")).willReturn("0x" + "ab".repeat(32));

        worker.dispatchPendingOperatorJobs();

        verify(stateWriter).markSubmitted(eq(7L), eq("0x" + "ab".repeat(32)));
    }

    @Test
    @DisplayName("전송 실패는 재시도 대상이다 — 3회까지는 FAILED로 고정하지 않는다(REL-09)")
    void retriesOperatorJobOnSendFailure() {
        ChainJob pending = job(ChainJob.TxType.RELEASE, ChainJob.SignerType.OPERATOR, 9L, LocalDateTime.now());
        given(chainClient.isAvailable()).willReturn(true);
        given(builderProvider.getIfAvailable()).willReturn(operatorTxBuilder);
        given(operatorTxBuilder.supports(ChainJob.TxType.RELEASE)).willReturn(true);
        given(operatorTxBuilder.buildSignedTx(any())).willReturn("0x31ccdd");
        given(repository.findByStatusAndSignerTypeOrderByChainJobIdAsc(
                ChainJob.Status.PENDING, ChainJob.SignerType.OPERATOR)).willReturn(List.of(pending));
        given(repository.findById(9L)).willReturn(Optional.of(pending));
        given(chainClient.sendRawTransaction(anyString()))
                .willThrow(ErrorCode.CHAIN_NONCE_CONFLICT.toException());

        worker.dispatchPendingOperatorJobs();

        verify(stateWriter).retryOrFail(eq(9L), eq(3), eq(ErrorCode.CHAIN_NONCE_CONFLICT));
        verify(stateWriter, never()).markSubmitted(anyLong(), anyString());
    }

    @Test
    @DisplayName("SUBMITTED + receipt.status=1 → CONFIRMED")
    void confirmsOnSuccessfulReceipt() {
        ChainJob submitted = job(ChainJob.TxType.PURCHASE, ChainJob.SignerType.USER, 11L, LocalDateTime.now());
        submitted.markSubmitted("0x" + "ef".repeat(32));
        given(chainClient.isAvailable()).willReturn(true);
        given(repository.findByStatus(ChainJob.Status.SUBMITTED)).willReturn(List.of(submitted));
        given(repository.findByStatusAndSignerTypeOrderByChainJobIdAsc(
                ChainJob.Status.PENDING, ChainJob.SignerType.USER)).willReturn(List.of());
        given(chainClient.receipt(anyString())).willReturn(Optional.of(receipt("0x1")));
        given(chainClient.blockNumber()).willReturn(BigInteger.valueOf(110));

        worker.pollSubmittedJobs();

        verify(stateWriter).markConfirmed(eq(11L), anyString(), anyInt());
    }

    @Test
    @DisplayName("SUBMITTED + receipt.status=0 → FAILED. 새 에러 코드를 만들지 않는다")
    void failsOnRevertedReceipt() {
        ChainJob submitted = job(ChainJob.TxType.PURCHASE, ChainJob.SignerType.USER, 12L, LocalDateTime.now());
        submitted.markSubmitted("0x" + "ef".repeat(32));
        given(chainClient.isAvailable()).willReturn(true);
        given(repository.findByStatus(ChainJob.Status.SUBMITTED)).willReturn(List.of(submitted));
        given(repository.findByStatusAndSignerTypeOrderByChainJobIdAsc(
                ChainJob.Status.PENDING, ChainJob.SignerType.USER)).willReturn(List.of());
        given(chainClient.receipt(anyString())).willReturn(Optional.of(receipt("0x0")));

        worker.pollSubmittedJobs();

        verify(stateWriter).markFailed(12L, "COMMON_INTERNAL_ERROR");
    }

    // ============================================= 시한 지난 SUBMITTED (S15P21B204-76)

    /** 120초가 지난 SUBMITTED job. receipt 는 아직 없다. */
    private ChainJob overdueSubmitted(ChainJob.SignerType signerType, long id) {
        ChainJob stale = job(ChainJob.TxType.CREATE_SHOW, signerType, id,
                LocalDateTime.now().minusSeconds(121));
        stale.markSubmitted("0x" + "ef".repeat(32));
        given(chainClient.isAvailable()).willReturn(true);
        given(repository.findByStatus(ChainJob.Status.SUBMITTED)).willReturn(List.of(stale));
        given(repository.findByStatusAndSignerTypeOrderByChainJobIdAsc(
                ChainJob.Status.PENDING, ChainJob.SignerType.USER)).willReturn(List.of());
        given(chainClient.receipt(anyString())).willReturn(Optional.empty());
        return stale;
    }

    /**
     * (a) 시한이 지나도 노드가 tx 를 알면 닫지 않는다. 종전에는 FAILED 로 닫았고, 뒤늦게 채굴되면
     * 서버가 연 후속 동작(createShow 재전송 등)이 온체인과 부딪혔다.
     */
    @Test
    @DisplayName("(a) 시한 지난 SUBMITTED 라도 노드에 tx 가 살아 있으면 FAILED 가 아니다 — 계속 본다")
    void keepsOverdueJobWhileNodeKnowsTx() {
        overdueSubmitted(ChainJob.SignerType.OPERATOR, 13L);
        given(chainClient.isTransactionKnown(anyString())).willReturn(true);

        worker.pollSubmittedJobs();
        worker.pollSubmittedJobs();

        verify(stateWriter, never()).markFailed(anyLong(), anyString());
        verify(chainClient, org.mockito.Mockito.times(2)).receipt(anyString());
    }

    @Test
    @DisplayName("(b) 오래 기다리던 tx 의 receipt 가 뒤늦게 잡히면 정상 확정 분기로 간다")
    void confirmsLateReceiptAfterTimeout() {
        overdueSubmitted(ChainJob.SignerType.USER, 16L);
        given(chainClient.isTransactionKnown(anyString())).willReturn(true);
        worker.pollSubmittedJobs();

        given(chainClient.receipt(anyString())).willReturn(Optional.of(receipt("0x1")));
        given(chainClient.blockNumber()).willReturn(BigInteger.valueOf(110));
        worker.pollSubmittedJobs();

        verify(confirmations).confirm(eq(16L), any(TxReceipt.class));
        verify(stateWriter).markConfirmed(eq(16L), anyString(), anyInt());
        verify(stateWriter, never()).markFailed(anyLong(), anyString());
    }

    @Test
    @DisplayName("(c) 노드가 tx 를 모르는 상태가 유예(120초) 내내 이어지면 그때 FAILED")
    @SuppressWarnings("unchecked")
    void failsWhenNodeLostTxBeyondGrace() {
        overdueSubmitted(ChainJob.SignerType.USER, 17L);
        given(chainClient.isTransactionKnown(anyString())).willReturn(false);

        // 처음 모른다고 답한 순간부터 유예가 시작된다 — 한 번의 null 로는 닫지 않는다.
        worker.pollSubmittedJobs();
        verify(stateWriter, never()).markFailed(anyLong(), anyString());

        // 유예가 지났다고 친다(시계를 주입하지 않으므로 기록 시각을 당긴다).
        ((java.util.Map<Long, LocalDateTime>) ReflectionTestUtils.getField(worker, "missingSince"))
                .put(17L, LocalDateTime.now().minusSeconds(121));
        worker.pollSubmittedJobs();

        verify(stateWriter).markFailed(17L, "CHAIN_TX_TIMEOUT");
    }

    @Test
    @DisplayName("노드가 잠깐 몰랐다가 다시 알면 유예가 처음부터 다시 시작된다")
    @SuppressWarnings("unchecked")
    void resetsGraceWhenNodeSeesTxAgain() {
        overdueSubmitted(ChainJob.SignerType.OPERATOR, 18L);
        java.util.Map<Long, LocalDateTime> missingSince = (java.util.Map<Long, LocalDateTime>)
                ReflectionTestUtils.getField(worker, "missingSince");
        missingSince.put(18L, LocalDateTime.now().minusSeconds(500));
        given(chainClient.isTransactionKnown(anyString())).willReturn(true, false);

        worker.pollSubmittedJobs(); // 안다 → 기록을 지운다
        worker.pollSubmittedJobs(); // 모른다 → 지금부터 다시 센다

        verify(stateWriter, never()).markFailed(anyLong(), anyString());
    }

    @Test
    @DisplayName("노드에 물어볼 수 없으면(RPC 오류) 닫지 않는다 — 모르는 것을 '없다'로 읽지 않는다")
    void keepsOverdueJobWhenNodeUnreachable() {
        overdueSubmitted(ChainJob.SignerType.OPERATOR, 19L);
        given(chainClient.isTransactionKnown(anyString()))
                .willThrow(ErrorCode.COMMON_EXTERNAL_SERVICE_ERROR.toException());

        worker.pollSubmittedJobs();

        verify(stateWriter, never()).markFailed(anyLong(), anyString());
    }

    /** catch 가 job 단위라 한 job 의 노드 조회 실패가 같은 주기의 다른 job 확정을 밀지 않는다(!105 리뷰). */
    @Test
    @DisplayName("앞 job 의 isTransactionKnown 이 던져도 같은 주기의 뒤 job 은 확정된다")
    void nodeErrorOnOneJobDoesNotDelayOthers() {
        ChainJob stuck = overdueSubmitted(ChainJob.SignerType.OPERATOR, 20L);
        ChainJob ready = job(ChainJob.TxType.PURCHASE, ChainJob.SignerType.USER, 21L, LocalDateTime.now());
        ready.markSubmitted("0x" + "ab".repeat(32));
        given(repository.findByStatus(ChainJob.Status.SUBMITTED)).willReturn(List.of(stuck, ready));
        given(chainClient.receipt(ready.getTxHash())).willReturn(Optional.of(receipt("0x1")));
        given(chainClient.isTransactionKnown(stuck.getTxHash()))
                .willThrow(ErrorCode.COMMON_EXTERNAL_SERVICE_ERROR.toException());
        given(chainClient.blockNumber()).willReturn(BigInteger.valueOf(110));

        worker.pollSubmittedJobs();

        verify(stateWriter).markConfirmed(eq(21L), anyString(), anyInt());
        verify(stateWriter, never()).markFailed(anyLong(), anyString());
    }

    @Test
    @DisplayName("전송조차 못한 PENDING USER job도 120초 뒤 FAILED로 닫는다")
    void expiresStalePendingUserJob() {
        ChainJob stale = job(ChainJob.TxType.DEPOSIT, ChainJob.SignerType.USER, 14L,
                LocalDateTime.now().minusSeconds(200));
        given(chainClient.isAvailable()).willReturn(true);
        given(repository.findByStatus(ChainJob.Status.SUBMITTED)).willReturn(List.of());
        given(repository.findByStatusAndSignerTypeOrderByChainJobIdAsc(
                ChainJob.Status.PENDING, ChainJob.SignerType.USER)).willReturn(List.of(stale));

        worker.pollSubmittedJobs();

        verify(stateWriter).markFailed(14L, "CHAIN_TX_TIMEOUT");
    }

    @Test
    @DisplayName("아직 120초가 안 지난 PENDING USER job은 건드리지 않는다")
    void keepsFreshPendingUserJob() {
        ChainJob fresh = job(ChainJob.TxType.DEPOSIT, ChainJob.SignerType.USER, 15L, LocalDateTime.now());
        given(chainClient.isAvailable()).willReturn(true);
        given(repository.findByStatus(ChainJob.Status.SUBMITTED)).willReturn(List.of());
        given(repository.findByStatusAndSignerTypeOrderByChainJobIdAsc(
                ChainJob.Status.PENDING, ChainJob.SignerType.USER)).willReturn(List.of(fresh));

        worker.pollSubmittedJobs();

        verifyNoInteractions(stateWriter);
    }

    // ================================================================ 확정 배선 (S15P21B204-64)

    /** {@code from}·{@code to}까지 채운 receipt. revert 사유 추적에 둘 다 필요하다. */
    private static TransactionReceipt receipt(String status, String to, String from) {
        TransactionReceipt receipt = receipt(status);
        receipt.setTo(to);
        receipt.setFrom(from);
        return receipt;
    }

    private ChainJob submitted(ChainJob.TxType txType, ChainJob.SignerType signerType, long id) {
        ChainJob job = job(txType, signerType, id, LocalDateTime.now());
        job.markSubmitted("0x" + "ef".repeat(32));
        given(chainClient.isAvailable()).willReturn(true);
        given(repository.findByStatus(ChainJob.Status.SUBMITTED)).willReturn(List.of(job));
        given(repository.findByStatusAndSignerTypeOrderByChainJobIdAsc(
                ChainJob.Status.PENDING, ChainJob.SignerType.USER)).willReturn(List.of());
        return job;
    }

    @Test
    @DisplayName("receipt 검증을 통과하면 도메인 확정을 부른다 — 이게 없으면 결제가 영원히 PAID 가 안 된다")
    void callsDomainConfirmation() {
        submitted(ChainJob.TxType.PURCHASE, ChainJob.SignerType.USER, 21L);
        given(chainClient.receipt(anyString())).willReturn(Optional.of(receipt("0x1")));
        given(chainClient.blockNumber()).willReturn(BigInteger.valueOf(110));

        worker.pollSubmittedJobs();

        verify(confirmations).confirm(eq(21L), any(TxReceipt.class));
        verify(stateWriter).markConfirmed(eq(21L), anyString(), anyInt());
    }

    @Test
    @DisplayName("이벤트 대조가 실패하면 CONFIRMED 로 적지 않는다 — 확정 서비스가 이미 FAILED 로 고정했다")
    void doesNotConfirmWhenEventMismatch() {
        submitted(ChainJob.TxType.PURCHASE, ChainJob.SignerType.USER, 22L);
        given(chainClient.receipt(anyString())).willReturn(Optional.of(receipt("0x1")));
        given(confirmations.confirm(anyLong(), any())).willReturn(
                new ChainJobConfirmationService.Result(false, "PAYMENT_AMOUNT_MISMATCH", List.of()));

        worker.pollSubmittedJobs();

        verify(stateWriter, never()).markConfirmed(anyLong(), anyString(), anyInt());
        verify(stateWriter, never()).markFailed(anyLong(), anyString());
    }

    @Test
    @DisplayName("확정 중 예외가 나도 워커는 죽지 않고 그 job 만 재시도 → 한도 초과 시 닫는다")
    void survivesConfirmationFailure() {
        submitted(ChainJob.TxType.PURCHASE, ChainJob.SignerType.USER, 23L);
        given(chainClient.receipt(anyString())).willReturn(Optional.of(receipt("0x1")));
        given(confirmations.confirm(anyLong(), any()))
                .willThrow(new IllegalStateException("주문 상태 가드"));

        worker.pollSubmittedJobs();

        verify(stateWriter).retryOrFail(eq(23L), eq(3), eq(ErrorCode.COMMON_INTERNAL_ERROR));
        verify(stateWriter, never()).markConfirmed(anyLong(), anyString(), anyInt());
    }

    @Test
    @DisplayName("지갑이 관여한 job 이 확정되면 wallet:balance 를 갱신한다(§0.12 갱신 시점 ②)")
    void refreshesWalletBalanceOnConfirm() {
        ChainJob job = submitted(ChainJob.TxType.PURCHASE, ChainJob.SignerType.USER, 24L);
        ReflectionTestUtils.setField(job, "walletId", 55L);
        given(chainClient.receipt(anyString())).willReturn(Optional.of(receipt("0x1")));

        worker.pollSubmittedJobs();

        verify(balanceRefresher).refresh(55L);
    }

    @Test
    @DisplayName("GrantRefUsed revert 는 실패가 아니라 동기화다 — FAILED 로 적으면 잔액과 장부가 갈린다(계약 §4.6)")
    void syncsGrantRefUsedInsteadOfFailing() {
        ChainJob job = submitted(ChainJob.TxType.MINT, ChainJob.SignerType.OPERATOR, 25L);
        ReflectionTestUtils.setField(job, "walletId", 77L);
        String to = "0xA5d7031D70DAab33EACDfC912baC0668D5776e5b";
        String from = "0xfbB324CC674dD2FF21Dff670404391e78F4a199f";
        given(chainClient.receipt(anyString())).willReturn(Optional.of(receipt("0x0", to, from)));
        // OPERATOR job 은 서명 RLP 가 남아 있지 않다 — calldata 를 노드에서 되찾아야 사유를 안다.
        given(chainClient.transactionInput(anyString())).willReturn(Optional.of("0xdeadbeef"));
        given(chainClient.revertData(eq(from), eq(to), eq("0xdeadbeef"), any()))
                .willReturn(Optional.of("0xce43a105")); // GrantRefUsed(bytes32)

        worker.pollSubmittedJobs();

        verify(confirmations).syncGrantAlreadyUsed(eq(25L), eq(null));
        verify(stateWriter).markConfirmed(eq(25L), anyString(), anyInt());
        verify(stateWriter, never()).markFailed(anyLong(), anyString());
        verify(balanceRefresher).refresh(77L);
    }

    @Test
    @DisplayName("GrantRefUsed 가 아닌 revert 는 그대로 FAILED 다 — 사유 코드에 selector 를 붙여 남긴다")
    void keepsFailingOnOtherReverts() {
        submitted(ChainJob.TxType.MINT, ChainJob.SignerType.OPERATOR, 26L);
        String to = "0xA5d7031D70DAab33EACDfC912baC0668D5776e5b";
        String from = "0xfbB324CC674dD2FF21Dff670404391e78F4a199f";
        given(chainClient.receipt(anyString())).willReturn(Optional.of(receipt("0x0", to, from)));
        given(chainClient.transactionInput(anyString())).willReturn(Optional.of("0xdeadbeef"));
        given(chainClient.revertData(eq(from), eq(to), eq("0xdeadbeef"), any()))
                .willReturn(Optional.of("0xd93c0665")); // EnforcedPause()

        worker.pollSubmittedJobs();

        verify(stateWriter).markFailed(26L, "COMMON_CONFLICT#0xd93c0665");
        verify(confirmations, never()).syncGrantAlreadyUsed(anyLong(), anyString());
    }

    // ================================================================ 운영자 알림 (S15P21B204-78)

    /** OPERATOR job 이 {@code selector} 로 revert 된 상황. */
    private ChainJob revertedWith(long id, String selector) {
        return revertedWith(id, selector, ChainJob.SignerType.OPERATOR);
    }

    private ChainJob revertedWith(long id, String selector, ChainJob.SignerType signerType) {
        ChainJob job = submitted(ChainJob.TxType.CREATE_SHOW, signerType, id);
        String to = "0xa1ca000000000000000000000000000000001738";
        String from = "0xfbB324CC674dD2FF21Dff670404391e78F4a199f";
        given(chainClient.receipt(anyString())).willReturn(Optional.of(receipt("0x0", to, from)));
        given(chainClient.transactionInput(anyString())).willReturn(Optional.of("0xdeadbeef"));
        given(chainClient.revertData(eq(from), eq(to), eq("0xdeadbeef"), any()))
                .willReturn(Optional.of(selector));
        return job;
    }

    @Test
    @DisplayName("서버 결함 revert(NotOperator)로 FAILED 가 되면 운영자에게 1회 알린다 — 같은 job 이 두 번 처리돼도 1회")
    void alertsServerFaultRevertOncePerJob() {
        ChainJob job = revertedWith(31L, "0x7c214f04"); // NotOperator()
        ReflectionTestUtils.setField(job, "targetPerformanceId", 7L);

        worker.pollSubmittedJobs();
        // markFailed 가 mock 이라 job 은 여전히 SUBMITTED 로 다시 잡힌다 = 같은 receipt 를 두 번 처리.
        worker.pollSubmittedJobs();

        verify(stateWriter, org.mockito.Mockito.times(2)).markFailed(31L, "COMMON_FORBIDDEN#0x7c214f04");
        org.mockito.ArgumentCaptor<String> text = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(opsAlert, org.mockito.Mockito.times(1)).send(text.capture());
        org.assertj.core.api.Assertions.assertThat(text.getValue())
                .contains("chain_31", "CREATE_SHOW", "0x7c214f04 NotOperator", "performanceId: 7",
                        "https://kairos.kaiascan.io/tx/0x" + "ef".repeat(32));
    }

    @Test
    @DisplayName("일반 revert(AlreadyPurchased)는 FAILED 여도 운영자 알림을 보내지 않는다")
    void doesNotAlertOrdinaryRevert() {
        revertedWith(32L, "0xd659f4ab"); // AlreadyPurchased(bytes32)

        worker.pollSubmittedJobs();

        verify(stateWriter).markFailed(32L, "COMMON_CONFLICT#0xd659f4ab");
        verifyNoInteractions(opsAlert);
    }

    @Test
    @DisplayName("같은 selector 서버 결함은 10분 쿨다운 — 3 job 연속 1회, 쿨다운 뒤 1회 + 억제 건수, 다른 selector 는 별도")
    void throttlesServerFaultAlertsPerSelector() {
        java.time.Instant t0 = java.time.Instant.parse("2026-09-15T00:00:00Z");
        ReflectionTestUtils.setField(worker, "clock", java.time.Clock.fixed(t0, java.time.ZoneOffset.UTC));
        for (long id = 41L; id <= 43L; id++) {
            revertedWith(id, "0x7c214f04"); // NotOperator()
            worker.pollSubmittedJobs();
        }
        verify(opsAlert, org.mockito.Mockito.times(1)).send(anyString());

        revertedWith(45L, "0x1f2a2005"); // ZeroAmount() — 다른 selector, 쿨다운과 무관
        worker.pollSubmittedJobs();
        verify(opsAlert, org.mockito.Mockito.times(2)).send(anyString());

        ReflectionTestUtils.setField(worker, "clock",
                java.time.Clock.fixed(t0.plus(ChainJobWorker.SERVER_FAULT_COOLDOWN), java.time.ZoneOffset.UTC));
        revertedWith(44L, "0x7c214f04");
        worker.pollSubmittedJobs();
        org.mockito.ArgumentCaptor<String> text = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(opsAlert, org.mockito.Mockito.times(3)).send(text.capture());
        org.assertj.core.api.Assertions.assertThat(text.getAllValues().get(0)).doesNotContain("억제");
        org.assertj.core.api.Assertions.assertThat(text.getAllValues().get(2)).contains("chain_44", "직전 2건 억제");
    }

    @Test
    @DisplayName("NotTeam 은 OPERATOR job 일 때만 알린다 — 사용자 서명(대납) tx 의 onlyTeamOf 에서도 나기 때문")
    void alertsNotTeamOnlyForOperatorJobs() {
        revertedWith(51L, "0xe9f3e974", ChainJob.SignerType.USER); // NotTeam()
        worker.pollSubmittedJobs();
        verify(stateWriter).markFailed(51L, "COMMON_FORBIDDEN#0xe9f3e974");
        verifyNoInteractions(opsAlert);

        revertedWith(52L, "0xe9f3e974", ChainJob.SignerType.OPERATOR);
        worker.pollSubmittedJobs();
        verify(opsAlert, org.mockito.Mockito.times(1)).send(anyString());
    }

    /**
     * {@code ChainJobBacklog} 경보가 {@code signer_type="OPERATOR"} 만 본다(S15P21B204-186). 건수가 0 이 된
     * 조합이 직전 값에 머물면 경보가 풀리지 않는다.
     */
    @Test
    @DisplayName("job 건수 지표는 status·signer_type 으로 갈리고, 행이 사라진 조합은 0 으로 내려간다")
    void refreshMetricsSplitsBySignerTypeAndZeroesMissing() {
        given(repository.countGroupByStatusAndSignerType()).willReturn(List.of(
                jobCount(ChainJob.Status.PENDING, ChainJob.SignerType.OPERATOR, 2),
                jobCount(ChainJob.Status.PENDING, ChainJob.SignerType.USER, 5)));
        worker.refreshMetrics();
        org.assertj.core.api.Assertions.assertThat(jobCountGauge("PENDING", "OPERATOR")).isEqualTo(2d);
        org.assertj.core.api.Assertions.assertThat(jobCountGauge("PENDING", "USER")).isEqualTo(5d);
        org.assertj.core.api.Assertions.assertThat(jobCountGauge("FAILED", "USER")).isZero();

        given(repository.countGroupByStatusAndSignerType()).willReturn(List.of(
                jobCount(ChainJob.Status.PENDING, ChainJob.SignerType.USER, 1)));
        worker.refreshMetrics();
        org.assertj.core.api.Assertions.assertThat(jobCountGauge("PENDING", "OPERATOR")).isZero();
        org.assertj.core.api.Assertions.assertThat(jobCountGauge("PENDING", "USER")).isEqualTo(1d);
    }

    private double jobCountGauge(String status, String signerType) {
        return meterRegistry.get("b204_chain_job_count")
                .tag("status", status).tag("signer_type", signerType).gauge().value();
    }

    private static ChainJobRepository.JobCount jobCount(ChainJob.Status status, ChainJob.SignerType signerType,
                                                        long count) {
        return new ChainJobRepository.JobCount() {
            @Override
            public ChainJob.Status getStatus() {
                return status;
            }

            @Override
            public ChainJob.SignerType getSignerType() {
                return signerType;
            }

            @Override
            public long getCount() {
                return count;
            }
        };
    }

    private static long anyLong() {
        return org.mockito.ArgumentMatchers.anyLong();
    }
}
