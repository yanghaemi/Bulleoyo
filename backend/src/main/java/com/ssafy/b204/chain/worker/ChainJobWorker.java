package com.ssafy.b204.chain.worker;

import com.ssafy.b204.chain.client.KaiaChainClient;
import com.ssafy.b204.chain.config.ChainClientConfig;
import com.ssafy.b204.chain.config.ChainWallet;
import com.ssafy.b204.chain.config.ChainWorkerProperties;
import com.ssafy.b204.chain.contract.ContractErrors;
import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.metrics.ChainMetrics;
import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.chain.service.ChainFailure;
import com.ssafy.b204.chain.service.ChainJobConfirmationService;
import com.ssafy.b204.chain.service.ChainJobService;
import com.ssafy.b204.chain.service.FeeDelegationService;
import com.ssafy.b204.chain.service.ReceiptEvents;
import com.ssafy.b204.chain.service.ReceiptVerifier;
import com.ssafy.b204.chain.service.TxReceipt;
import com.ssafy.b204.common.alert.OpsAlert;
import com.ssafy.b204.common.config.ChainProperties;
import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.error.ErrorCode;
import com.ssafy.b204.common.support.TimeSupport;
import com.ssafy.b204.wallet.service.WalletBalanceRefresher;
import java.math.BigInteger;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.web3j.crypto.KaiaCredentials;
import org.web3j.protocol.core.methods.response.TransactionReceipt;

/**
 * chain_job 워커 — API v6 §0.3·§0.4.
 *
 * <pre>
 *   PENDING ──(OPERATOR: 지갑 큐에서 서명·전송)──▶ SUBMITTED ──(receipt 확인)──▶ CONFIRMED
 *      │                                              │  ↺ 120초 초과라도 노드가 tx 를 알면 계속 본다
 *      │ USER: 120초 안에 전송 못하면                     │ receipt.status=0, 또는 120초 초과 뒤
 *      │                                              │ 노드가 tx 를 모르는 상태가 다시 120초 이어짐
 *      └──────────────────────────────────────────────┴─────────────────────▶ FAILED
 * </pre>
 *
 * <p><b>지켜야 하는 것 넷.</b>
 *
 * <ol>
 *   <li><b>체인 빈이 없으면 아무것도 하지 않는다.</b> 키 없는 팀원의 로컬에서도 기동은 되고 워커는
 *       매 주기 조용히 돌아 나간다(개발 환경 안내 v1 §3.1).
 *   <li><b>지갑별 단일 nonce 직렬 큐.</b> 전송은 {@link ChainWalletQueue}의 지갑 전용 스레드에서만
 *       한다. 스케줄러 스레드에서 직접 보내면 두 주기가 겹칠 때 nonce가 충돌한다.
 *   <li><b>OPERATOR job만 재시도한다(최대 3회).</b> {@code USER} job은 서버가 발신자 서명을 다시
 *       만들 수 없으므로 receipt 재조회만 한다. 전송 못한 채 120초가 지나면 {@code FAILED}고,
 *       <b>전송한</b> tx 는 노드가 유실했다고 볼 때만 {@code FAILED}다({@link #isDropped}).
 *   <li><b>이미 집어간 job을 다시 집지 않는다.</b> 전송은 비동기라 {@code SUBMITTED} 전이가 다음
 *       주기보다 늦을 수 있다. {@link #inFlight}가 그 창을 막는다 — 없으면 같은 tx를 두 번 보낸다.
 *       <b>{@code inFlight}는 프로세스 안에서만 유효하다.</b> 인스턴스가 둘 이상이면
 *       {@code ChainOwnership.claim}(DB 한 번의 원자적 UPDATE)이 같은 창을 프로세스 밖에서
 *       닫는다(S15P21B204-96).
 * </ol>
 *
 * <p>{@code b204.chain.worker.enabled=false}면 빈 자체가 만들어지지 않는다. 단위 테스트가 도는 중에
 * 스케줄러가 DB를 건드리면 테스트끼리 간섭하므로 {@code application-test.yml}이 그렇게 둔다.
 */
@Component
@ConditionalOnProperty(prefix = "b204.chain.worker", name = "enabled",
        havingValue = "true", matchIfMissing = true)
@Slf4j
public class ChainJobWorker {

    private final ChainJobRepository chainJobRepository;
    private final ChainOwnership ownership;
    private final ChainJobStateWriter stateWriter;
    private final ChainWalletQueue walletQueue;
    private final KaiaChainClient chainClient;
    private final FeeDelegationService feeDelegationService;
    private final ReceiptVerifier receiptVerifier;
    private final ReceiptEvents receiptEvents;
    private final ChainJobConfirmationService confirmations;
    private final WalletBalanceRefresher balanceRefresher;
    private final ChainWorkerProperties workerProperties;
    private final ChainMetrics metrics;
    private final ObjectProvider<OperatorTxBuilder> operatorTxBuilders;
    private final ObjectProvider<KaiaCredentials> operatorCredentials;
    private final ObjectProvider<KaiaCredentials> minterCredentials;
    private final OpsAlert opsAlert;
    private final ChainProperties chainProperties;

    /**
     * 서버 결함 revert 를 이미 알린 job — job 당 1회. 같은 receipt 가 두 주기에 걸쳐 처리돼도 두 번 보내지 않는다.
     */
    // 프로세스 메모리, 상한 없음 — 서버 결함 revert 는 드물고 FAILED job 은 다시 폴링되지 않는다
    private final Set<Long> serverFaultAlerted = ConcurrentHashMap.newKeySet();

    /**
     * 같은 selector 서버 결함 알림 사이 최소 간격. 키·주소를 잘못 넣으면 모든 OPERATOR job 이 같은 selector 로
     * revert 돼 job 수만큼 알림이 나간다(!110 리뷰). 쿨다운 중에는 로그만 남기고 다음 알림에 억제 건수를 붙인다.
     *
     * <p>그래서 <b>억제 건수는 다음 알림이 있을 때만 보인다</b> — 폭주가 쿨다운 안에서 끝나 같은 selector 가
     * 다시 나지 않으면 누적은 서버 로그(위 WARN)에만 남는다. 첫 알림이 이미 나간 뒤라 감수한다.
     */
    public static final Duration SERVER_FAULT_COOLDOWN = Duration.ofMinutes(10);
    /** selector → 마지막 전송 시각·그 뒤 억제 건수. {@code synchronized (serverFaultWindows)}. */
    private final Map<String, FaultWindow> serverFaultWindows = new HashMap<>();
    /** 테스트가 시각을 주입한다. */
    private Clock clock = Clock.systemUTC();

    private record FaultWindow(Instant sentAt, int suppressed) {
    }

    /** 큐에 넘겼지만 아직 상태 전이가 끝나지 않은 job. 중복 전송 방지용. */
    private final Set<Long> inFlight = ConcurrentHashMap.newKeySet();

    /**
     * 시한 지난 {@code SUBMITTED} job 을 노드가 <b>모른다고 처음 답한 시각</b>. 노드가 알면 지운다.
     *
     * <p>DB 컬럼이 아니라 메모리인 이유: 기준을 {@code requested_at} 으로 잡으면 큐에 오래 있다
     * 방금 보낸 tx 를 전파 지연 한 번에 닫는다 — 이 카드가 막으려는 사고 그대로다. 프로세스가 바뀌면
     * 비어서 유예가 <b>처음부터 다시</b> 시작될 뿐이라 늦게 닫는 쪽으로만 틀린다.
     */
    private final Map<Long, LocalDateTime> missingSince = new ConcurrentHashMap<>();

    /** ABI 미고정 안내를 매 초 찍지 않기 위한 1회 플래그. */
    private final AtomicBoolean builderMissingLogged = new AtomicBoolean();

    public ChainJobWorker(ChainJobRepository chainJobRepository,
                          ChainOwnership ownership,
                          ChainJobStateWriter stateWriter,
                          ChainWalletQueue walletQueue,
                          KaiaChainClient chainClient,
                          FeeDelegationService feeDelegationService,
                          ReceiptVerifier receiptVerifier,
                          ReceiptEvents receiptEvents,
                          ChainJobConfirmationService confirmations,
                          WalletBalanceRefresher balanceRefresher,
                          ChainWorkerProperties workerProperties,
                          ChainMetrics metrics,
                          ObjectProvider<OperatorTxBuilder> operatorTxBuilders,
                          @Qualifier(ChainClientConfig.OPERATOR_CREDENTIALS)
                          ObjectProvider<KaiaCredentials> operatorCredentials,
                          @Qualifier(ChainClientConfig.MINTER_CREDENTIALS)
                          ObjectProvider<KaiaCredentials> minterCredentials,
                          OpsAlert opsAlert,
                          ChainProperties chainProperties) {
        this.opsAlert = opsAlert;
        this.chainProperties = chainProperties;
        this.chainJobRepository = chainJobRepository;
        this.ownership = ownership;
        this.stateWriter = stateWriter;
        this.walletQueue = walletQueue;
        this.chainClient = chainClient;
        this.feeDelegationService = feeDelegationService;
        this.receiptVerifier = receiptVerifier;
        this.receiptEvents = receiptEvents;
        this.confirmations = confirmations;
        this.balanceRefresher = balanceRefresher;
        this.workerProperties = workerProperties;
        this.metrics = metrics;
        this.operatorTxBuilders = operatorTxBuilders;
        this.operatorCredentials = operatorCredentials;
        this.minterCredentials = minterCredentials;
    }

    // ------------------------------------------------------------------ 전송

    /**
     * {@code PENDING} + {@code OPERATOR} job을 지갑 큐로 넘긴다.
     *
     * <p>{@link OperatorTxBuilder} 구현체가 없으면(= 컨트랙트 ABI 고정 전) <b>집어가지 않고 그대로
     * 둔다.</b> 실패로 만들면 ABI가 붙었을 때 되살릴 방법이 없다.
     */
    @Scheduled(fixedDelayString = "${b204.chain.worker.poll-interval-ms:1000}")
    public void dispatchPendingOperatorJobs() {
        // 이 인스턴스가 소유자가 아니면 집지 않는다. 블루/그린은 두 색이 상시 같이 떠 있어서,
        // 이 줄이 없으면 둘이 같은 job 을 집어 **같은 tx 를 두 번 보낸다**(S15P21B204-95).
        if (!ownership.isOwner() || !chainClient.isAvailable()) {
            return;
        }
        OperatorTxBuilder builder = operatorTxBuilders.getIfAvailable();
        List<ChainJob> pending = chainJobRepository.findByStatusAndSignerTypeOrderByChainJobIdAsc(
                ChainJob.Status.PENDING, ChainJob.SignerType.OPERATOR);
        if (pending.isEmpty()) {
            return;
        }
        if (builder == null) {
            if (builderMissingLogged.compareAndSet(false, true)) {
                log.warn("OperatorTxBuilder 구현체가 없어 OPERATOR job {}건을 PENDING으로 둔다. "
                        + "컨트랙트 ABI 고정(Jira -25) 후 구현체를 등록하면 그대로 처리된다.", pending.size());
            }
            return;
        }
        pending.stream().limit(workerProperties.batchSize()).forEach(job -> {
            Long id = job.getChainJobId();
            ChainJob.TxType txType = job.getTxType();
            if (!builder.supports(txType) || !inFlight.add(id)) {
                return;
            }
            // 프로세스 안의 inFlight 로는 **인스턴스가 둘일 때** 부족하다. 여기서 DB 한 번의
            // 원자적 UPDATE 로 다시 집는다 — ChainOwnership 은 Redis 임대라 펜싱이 없어,
            // 소유자가 임대보다 오래 멈췄다 깨어나면 자신을 소유자로 믿는 창이 남는다
            // (S15P21B204-96). 그 창을 닫는 것이 이 한 줄이다.
            boolean claimed;
            try {
                claimed = ownership.claim(id);
            } catch (RuntimeException e) {
                // 여기서 빼지 않으면 inFlight 에 남아 재시작 전까지 이 job 을 다시 안 집는다.
                inFlight.remove(id);
                throw e;
            }
            if (!claimed) {
                inFlight.remove(id);
                return;
            }
            walletQueue.submit(ChainWallet.forTxType(txType), () -> sendOperatorJob(id, txType, builder));
        });
    }

    /** 지갑 큐 스레드에서 실행된다 — 같은 지갑의 다른 tx와 겹치지 않는다. */
    private void sendOperatorJob(Long chainJobId, ChainJob.TxType txType, OperatorTxBuilder builder) {
        try {
            ChainJob job = chainJobRepository.findById(chainJobId).orElse(null);
            if (job == null || job.getStatus() != ChainJob.Status.PENDING) {
                return;
            }
            // 디스패치에서 이미 집었지만 **여기서 한 번 더** 집는다. 큐가 밀리거나 이 인스턴스가
            // 낡은 claim 기준(5분)보다 오래 멈추면 다른 인스턴스가 이 job 을 가져가 보내는 중일 수
            // 있고, 위의 PENDING 검사는 상대가 SUBMITTED 를 적기 전까지 통과한다(!98 재리뷰).
            // 재claim 뒤 서명~전송 사이에서 다시 5분 넘게 멈추는 창은 여전히 남는다.
            boolean claimed;
            try {
                claimed = ownership.claim(chainJobId);
            } catch (RuntimeException e) {
                // DB 순단은 전송 실패가 아니다 — 아래 catch 로 흘리면 retryOrFail 이 재시도 횟수를
                // 깎는다. 아무것도 보내지 않았으니 PENDING 그대로 다음 주기에 다시 집힌다.
                log.warn("chain_job {} 전송 직전 claim 실패 — 보내지 않고 다음 주기로 넘긴다", chainJobId, e);
                return;
            }
            if (!claimed) {
                return;
            }
            String signedRawTx = builder.buildSignedTx(job);
            String txHash = chainClient.sendRawTransaction(signedRawTx);
            stateWriter.markSubmitted(chainJobId, txHash);
        } catch (BusinessException e) {
            ErrorCode code = e.getErrorCode();
            metrics.recordFailure(txType, code.name());
            stateWriter.retryOrFail(chainJobId, workerProperties.maxRetry(), code);
        } catch (RuntimeException e) {
            log.error("chain_job {} 전송 중 예상치 못한 오류", chainJobId, e);
            metrics.recordFailure(txType, ErrorCode.COMMON_INTERNAL_ERROR.name());
            stateWriter.retryOrFail(chainJobId, workerProperties.maxRetry(), ErrorCode.COMMON_INTERNAL_ERROR);
        } finally {
            inFlight.remove(chainJobId);
        }
    }

    // ------------------------------------------------------------------ 확정

    /**
     * {@code SUBMITTED} job의 receipt를 확인하고 확정/실패로 보낸다.
     *
     * <p>판정은 두 단계다. {@link ReceiptVerifier}가 §0.4 ④의 1~3({@code status}·{@code to}·
     * {@code from})을 보고, 통과하면 {@link ReceiptEvents}가 로그에서 뽑은 이벤트를 실어
     * {@link ChainJobConfirmationService#confirm}에 넘겨 4·5(기대 이벤트 존재·인자 일치)와
     * 도메인 전이를 맡긴다. <b>{@code status}만 보고 확정하지 않는다</b> — revert되지 않았을 뿐
     * 우리가 기대한 일이 일어나지 않은 tx도 {@code status=1}이다.
     */
    @Scheduled(fixedDelayString = "${b204.chain.worker.receipt-poll-interval-ms:1500}")
    public void pollSubmittedJobs() {
        // 게이트가 둘이고 **순서가 다르다.**
        //
        // ① 체인 설정이 없으면 DB 조차 읽지 않는다. 키 없는 팀원의 로컬에서 조용해야 한다
        //    (doesNothingWithoutChainClient 가 이것을 고정한다 — 이 줄을 위로 올렸다가 깨졌다).
        if (!chainClient.isAvailable()) {
            return;
        }

        // ② 시한 지난 USER job 닫기는 **소유권 밖**이다. tx 를 보내지 않고 우리 DB 만 정리하며,
        //    겹쳐 돌아도 같은 행을 FAILED 로 두 번 쓸 뿐이다. 소유권 안에 두면 Redis 를 못 읽는
        //    동안 사용자가 에러 대신 **무한 대기**를 본다(리뷰 !97 🟡).
        expireStalePendingUserJobs();

        // ③ 확정은 소유자만 한다. 두 인스턴스가 같은 receipt 를 보면 도메인 전이가 두 번 돈다
        //    (S15P21B204-95).
        if (!ownership.isOwner()) {
            return;
        }
        List<ChainJob> submitted = chainJobRepository.findByStatus(ChainJob.Status.SUBMITTED);
        // 다른 경로(다른 인스턴스·확정 서비스)가 끝낸 job 의 유실 기록을 버린다.
        missingSince.keySet().retainAll(submitted.stream().map(ChainJob::getChainJobId).toList());
        for (ChainJob job : submitted) {
            // 루프 도중 소유권이 넘어가도(블루/그린 전환) 남은 job 을 끝까지 돌지 않는다 — 창을
            // 한 건으로 줄인다. 그 한 건의 중복 확정은 확정 서비스의 행 잠금이 막는다(S15P21B204-119).
            if (!ownership.isOwner()) {
                break;
            }
            try {
                pollOne(job);
            } catch (RuntimeException e) {
                log.warn("chain_job {} receipt 확인 실패(다음 주기에 재시도)", job.getChainJobId(), e);
            }
        }
    }

    private void pollOne(ChainJob job) {
        Long id = job.getChainJobId();
        Optional<TransactionReceipt> found = chainClient.receipt(job.getTxHash());
        if (found.isEmpty()) {
            // 시한이 지나도 **바로 닫지 않는다**(S15P21B204-76). 이 tx 는 이미 브로드캐스트됐고,
            // 뒤늦게 채굴되면 온체인은 바뀌는데 FAILED 는 후속 동작(createShow 재전송·규칙 변경·
            // 취소)을 연다. 노드가 tx 를 모르는 상태가 유예 내내 이어졌을 때만 유실로 본다.
            // USER·OPERATOR 같은 규칙이다 — 둘 다 보낸 tx 가 살아 있을 수 있다.
            if (isTimedOut(job) && isDropped(job)) {
                missingSince.remove(id);
                metrics.recordFailure(job.getTxType(), ErrorCode.CHAIN_TX_TIMEOUT.name());
                stateWriter.markFailed(id, ChainFailure.of(ErrorCode.CHAIN_TX_TIMEOUT));
            }
            return;
        }
        missingSince.remove(id);

        TransactionReceipt receipt = found.get();
        // USER job은 발신자 서명 RLP가 남아 있으므로 to·from 기대값을 그것으로 복원한다
        // (chain_job에 to 컬럼이 없다 — ERD v5 확인 완료).
        String expectedTo = null;
        String expectedFrom = null;
        if (job.getSenderSignedRlp() != null && !job.getSenderSignedRlp().isBlank()) {
            try {
                FeeDelegationService.DecodedUserTx decoded =
                        feeDelegationService.decode(job.getSenderSignedRlp());
                expectedTo = decoded.to();
                expectedFrom = decoded.from();
            } catch (RuntimeException e) {
                log.debug("chain_job {} 저장된 RLP 디코드 실패 — to/from 대조를 건너뛴다", id);
            }
        }

        TxReceipt parsed = receiptEvents.parse(receipt);
        var verification = receiptVerifier.verify(job, receipt, expectedTo, expectedFrom, parsed);
        if (verification.verified()) {
            confirmDomain(job, receipt, parsed);
            return;
        }

        String selector = revertSelectorOf(receipt, expectedFrom, expectedTo, job).orElse(null);
        if (syncedGrantAlreadyUsed(job, selector)) {
            return;
        }
        ErrorCode code = ChainFailure.toErrorCode(selector);
        metrics.recordFailure(job.getTxType(), code.name());
        stateWriter.markFailed(id, ChainFailure.of(code, selector));
        log.warn("chain_job {} 검증 실패 mismatch={} selector={}({})", id, verification.mismatchFields(),
                selector, ContractErrors.nameOfSelector(selector).orElse("unknown"));
        if (ChainFailure.isServerFault(selector, job.getSignerType()) && serverFaultAlerted.add(id)) {
            alertServerFault(job, selector);
        }
    }

    /** 서버 결함 revert 를 운영자에게 알린다(S15P21B204-78). {@link OpsAlert}는 던지지 않는다. */
    private void alertServerFault(ChainJob job, String selector) {
        String key = selector.toLowerCase(Locale.ROOT);
        Instant now = clock.instant();
        int suppressedBefore;
        synchronized (serverFaultWindows) {
            FaultWindow window = serverFaultWindows.get(key);
            if (window != null && now.isBefore(window.sentAt().plus(SERVER_FAULT_COOLDOWN))) {
                serverFaultWindows.put(key, new FaultWindow(window.sentAt(), window.suppressed() + 1));
                log.warn("서버 결함 revert 알림 억제(쿨다운) — chain_job {} selector={} 억제 누적 {}건",
                        job.getChainJobId(), selector, window.suppressed() + 1);
                return;
            }
            suppressedBefore = window == null ? 0 : window.suppressed();
            serverFaultWindows.put(key, new FaultWindow(now, 0));
        }
        StringBuilder text = new StringBuilder("서버 결함 revert — ")
                .append(ChainJobService.JOB_ID_PREFIX).append(job.getChainJobId())
                .append(' ').append(job.getTxType()).append(" FAILED")
                .append("\nselector: ").append(selector).append(' ')
                .append(ContractErrors.nameOfSelector(selector).orElse("unknown"));
        if (job.getTargetPerformanceId() != null) {
            text.append("\nperformanceId: ").append(job.getTargetPerformanceId());
        }
        text.append("\ntx: ").append(job.getTxHash())
                .append("\n").append(chainProperties.explorerBaseUrl()).append("/tx/").append(job.getTxHash());
        if (suppressedBefore > 0) {
            text.append("\n직전 ").append(suppressedBefore).append("건 억제(같은 selector, ")
                    .append(SERVER_FAULT_COOLDOWN.toMinutes()).append("분 쿨다운)");
        }
        opsAlert.send(text.toString());
    }

    /**
     * §0.4 ④의 <b>4·5</b>(기대 이벤트 존재·인자 일치)와 ⑤(도메인 전이)를 실행한다.
     *
     * <p>{@code chain_job}만 {@code CONFIRMED}로 바꾸고 끝내면 <b>결제가 영원히 {@code PAID}가
     * 되지 않는다</b> — 티켓 발급·보증금·규칙 동의·판매 개시가 전부
     * {@link ChainJobConfirmationService#confirm}에만 있다. 그래서 상태 전이의 주체가 그쪽이고
     * 워커는 파싱한 receipt를 넘길 뿐이다. 재호출은 그쪽이 막는다(이미 {@code CONFIRMED}면 무시).
     *
     * <p><b>확정 도중 예외</b>가 나면(도메인 가드·DB 오류) 그 job만 재시도 카운트를 올리고 한도를
     * 넘으면 {@code FAILED}로 닫는다. 그냥 삼키면 매 주기 같은 예외를 반복하며 <b>영원히
     * {@code SUBMITTED}로 남고</b>, 로그만 쌓인 채 아무도 알아채지 못한다.
     */
    private void confirmDomain(ChainJob job, TransactionReceipt receipt, TxReceipt parsed) {
        Long id = job.getChainJobId();
        ChainJobConfirmationService.Result result;
        try {
            result = confirmations.confirm(id, parsed);
        } catch (RuntimeException e) {
            log.error("chain_job {} 도메인 확정 중 오류 — 재시도 후 한도를 넘으면 닫는다", id, e);
            metrics.recordFailure(job.getTxType(), ErrorCode.COMMON_INTERNAL_ERROR.name());
            stateWriter.retryOrFail(id, workerProperties.maxRetry(), ErrorCode.COMMON_INTERNAL_ERROR);
            return;
        }
        if (!result.confirmed()) {
            // 이벤트가 없거나 인자가 서버 상태와 다르다. confirm 이 이미 FAILED 로 고정했다 —
            // 여기서 다시 쓰면 그쪽이 고른 사유를 덮는다.
            metrics.recordFailure(job.getTxType(), result.failureReason());
            log.warn("chain_job {} 이벤트 대조 실패 — 도메인 전이 없이 FAILED({})",
                    id, result.failureReason());
            return;
        }
        // confirm 은 확인 블록 수를 모른다(체인을 읽지 않는다). 실제 값으로 덮는다.
        stateWriter.markConfirmed(id, receipt.getTransactionHash(), confirmationsOf(receipt));
        recordDuration(job);
        // §0.12 갱신 시점 ② — 지갑이 관여한 job이 확정됐다. 노드 값으로 캐시를 맞춘다.
        balanceRefresher.refresh(job.getWalletId());
    }

    /**
     * {@code GrantRefUsed(grantRef)} revert는 <b>실패가 아니라 동기화</b>다 — 계약 §4.6
     * "기존 MINT job을 CONFIRMED로 동기화. <b>실패 처리 금지</b>".
     *
     * <p>뜻은 "이미 그 {@code grantRef}로 지급이 나갔다"이다. {@code FAILED}로 적으면 지갑에는
     * 코인이 있는데 장부에는 없는 상태가 되고, 재시도 루프에 들어가면 같은 revert가 무한 반복된다.
     *
     * <p><b>기존 지급 tx 해시는 넘기지 않는다.</b> {@code grantRef}로 되찾으려면 {@code Minted}
     * 로그를 과거 블록에서 훑어야 하는데({@code eth_getLogs}) 조회 구간을 정할 근거가 없다 —
     * {@code chain_job}에 최초 전송 시각이 없다(ERD v5에 {@code submitted_at}이 없다).
     * {@code null}로 부르면 job에 남아 있는 우리 tx 해시가 유지된다.
     *
     * @return 동기화로 처리했으면 {@code true}(실패 기록을 하지 않는다)
     */
    private boolean syncedGrantAlreadyUsed(ChainJob job, String selector) {
        boolean grantRefUsed = ContractErrors.nameOfSelector(selector)
                .filter("GrantRefUsed"::equals).isPresent();
        if (!grantRefUsed || job.getTxType() != ChainJob.TxType.MINT) {
            return false;
        }
        Long id = job.getChainJobId();
        try {
            confirmations.syncGrantAlreadyUsed(id, null);
        } catch (RuntimeException e) {
            log.error("chain_job {} GrantRefUsed 동기화 실패 — 다음 주기에 다시 시도한다", id, e);
            return true;
        }
        stateWriter.markConfirmed(id, job.getTxHash(), 1);
        balanceRefresher.refresh(job.getWalletId());
        log.warn("chain_job {} 는 이미 그 grantRef 로 지급된 건이다 — 실패가 아니라 CONFIRMED 로 "
                + "맞춘다(계약 §4.6)", id);
        return true;
    }

    /**
     * revert 원인의 <b>custom error selector 4바이트</b>를 남겨 둔다.
     *
     * <p>사람이 읽는 사유로 바꾸는 매핑표는 컨트랙트 인터페이스 고정 후에 채운다
     * ({@link ChainFailure#KNOWN_SELECTORS}). 그때까지는 selector 자체가 유일한 단서이므로
     * {@code failure_reason}에 접미로 보존한다 — API 응답에는 코드만 나간다.
     */
    private Optional<String> revertSelectorOf(TransactionReceipt receipt, String from, String to, ChainJob job) {
        try {
            String callFrom = from != null ? from : receipt.getFrom();
            String callTo = to != null ? to : receipt.getTo();
            if (callFrom == null || callTo == null) {
                return Optional.empty();
            }
            return calldataOf(job, receipt)
                    .flatMap(data -> chainClient.revertData(callFrom, callTo, data,
                            receipt.getBlockNumber()))
                    .flatMap(ChainFailure::extractSelector);
        } catch (RuntimeException e) {
            log.debug("revert selector 추출 실패 chain_job={}", job.getChainJobId());
            return Optional.empty();
        }
    }

    /**
     * 재생에 쓸 calldata.
     *
     * <p>{@code USER} job은 발신자 서명 RLP가 남아 있어 서버 안에서 복원된다. <b>{@code OPERATOR}
     * job은 남아 있는 것이 없어</b>(서명 raw tx를 저장하지 않는다) 노드에 되묻는다 — 이것이
     * 없으면 운영자 tx의 revert 사유를 하나도 알 수 없고, {@code MINT}의 {@code GrantRefUsed}
     * 동기화(계약 §4.6)가 영원히 동작하지 않는다.
     */
    private Optional<String> calldataOf(ChainJob job, TransactionReceipt receipt) {
        String rlp = job.getSenderSignedRlp();
        if (rlp != null && !rlp.isBlank()) {
            return Optional.ofNullable(feeDelegationService.decode(rlp).data());
        }
        return receipt.getTransactionHash() == null ? Optional.empty()
                : chainClient.transactionInput(receipt.getTransactionHash());
    }

    /**
     * 전송조차 못한 채 남아 있는 {@code USER} job을 정리한다.
     *
     * <p>§0.3 — USER job은 자동 재시도 대상이 아니다. 120초가 지나면 {@code FAILED}로 닫고
     * 사용자가 다시 서명하도록 한다.
     */
    private void expireStalePendingUserJobs() {
        for (ChainJob job : chainJobRepository.findByStatusAndSignerTypeOrderByChainJobIdAsc(
                ChainJob.Status.PENDING, ChainJob.SignerType.USER)) {
            if (isTimedOut(job)) {
                metrics.recordFailure(job.getTxType(), ErrorCode.CHAIN_TX_TIMEOUT.name());
                stateWriter.markFailed(job.getChainJobId(), ChainFailure.of(ErrorCode.CHAIN_TX_TIMEOUT));
            }
        }
    }

    /**
     * 120초 경과 판정.
     *
     * <p><b>기준 시각이 {@code requested_at}이다.</b> ERD v5 {@code chain_job}에 {@code submitted_at}
     * 컬럼이 없어 "전송 시각"을 알 수 없다. 요청 시각은 전송 시각보다 이르므로 이 대용은 <b>더 빨리
     * 만료시키는 쪽</b>이고, 안전한 방향이다(늦게 만료돼 사용자를 기다리게 하는 것보다 낫다).
     */
    private boolean isTimedOut(ChainJob job) {
        LocalDateTime requestedAt = job.getRequestedAt();
        if (requestedAt == null) {
            return false;
        }
        return Duration.between(requestedAt, TimeSupport.nowStored())
                .compareTo(Duration.ofSeconds(workerProperties.receiptTimeoutSeconds())) > 0;
    }

    /**
     * 시한 지난 {@code SUBMITTED} tx 가 <b>정말 유실됐는가</b> — S15P21B204-76.
     *
     * <p>노드가 tx 를 알면(풀에 대기 중이거나 방금 채굴됐다) 살아 있다. 모르면 그 순간부터 유예
     * ({@code receiptTimeoutSeconds})를 재고, 모르는 상태가 유예 내내 이어져야 유실이다 — 노드 한 대의
     * 전파 지연이나 풀 교체로 한 번 {@code null} 이 오는 것만으로 닫지 않는다. 노드에 물어볼 수 없으면
     * {@link KaiaChainClient#isTransactionKnown} 이 던지고 이 job 은 다음 주기로 넘어간다.
     *
     * <p>{@code ponytail:} 시한 지난 job 마다 주기(1.5초)당 RPC 한 번이 더 든다. 오래 걸린 tx 가
     * 쌓여 노드 호출량이 문제가 되면 간격 백오프를 넣는다.
     */
    private boolean isDropped(ChainJob job) {
        Long id = job.getChainJobId();
        if (chainClient.isTransactionKnown(job.getTxHash())) {
            missingSince.remove(id);
            return false;
        }
        LocalDateTime since = missingSince.computeIfAbsent(id, k -> TimeSupport.nowStored());
        return Duration.between(since, TimeSupport.nowStored())
                .compareTo(Duration.ofSeconds(workerProperties.receiptTimeoutSeconds())) > 0;
    }

    private int confirmationsOf(TransactionReceipt receipt) {
        try {
            BigInteger head = chainClient.blockNumber();
            BigInteger confirmations = head.subtract(receipt.getBlockNumber()).add(BigInteger.ONE);
            return confirmations.signum() < 0 ? 0 : confirmations.min(BigInteger.valueOf(Integer.MAX_VALUE)).intValue();
        } catch (RuntimeException e) {
            // 확인 블록 수는 부가 정보다. 못 읽었다고 확정을 미루지 않는다.
            return 1;
        }
    }

    private void recordDuration(ChainJob job) {
        if (job.getRequestedAt() != null) {
            metrics.recordTxDuration(job.getTxType(),
                    Duration.between(job.getRequestedAt(), TimeSupport.nowStored()));
        }
    }

    // ------------------------------------------------------------------ 지표

    /**
     * 상태별 건수와 운영 지갑 KAIA 잔액을 지표에 민다. 1분 주기 — 스크레이프마다 DB·노드를 때리지
     * 않기 위해 워커가 밀어 넣는 방식이다(b204-stack 지표 표).
     */
    @Scheduled(fixedDelayString = "${b204.chain.worker.metrics-interval-ms:60000}")
    public void refreshMetrics() {
        List<ChainJobRepository.JobCount> rows = chainJobRepository.countGroupByStatusAndSignerType();
        // 행이 없는 조합은 0 으로 내린다 — 안 그러면 사라진 조합이 마지막 값에 머문다.
        for (ChainJob.Status status : ChainJob.Status.values()) {
            for (ChainJob.SignerType signerType : ChainJob.SignerType.values()) {
                long count = rows.stream()
                        .filter(row -> row.getStatus() == status && row.getSignerType() == signerType)
                        .mapToLong(ChainJobRepository.JobCount::getCount)
                        .findFirst().orElse(0L);
                metrics.updateJobCount(status, signerType, count);
            }
        }
        if (!chainClient.isAvailable()) {
            return;
        }
        updateBalance(ChainWallet.OPERATOR, operatorCredentials.getIfAvailable());
        updateBalance(ChainWallet.MINTER, minterCredentials.getIfAvailable());
    }

    private void updateBalance(ChainWallet wallet, KaiaCredentials credentials) {
        if (credentials == null) {
            return;
        }
        chainClient.kaiaBalance(credentials.getAddress())
                .ifPresent(balance -> metrics.updateWalletBalance(wallet, balance));
    }
}
