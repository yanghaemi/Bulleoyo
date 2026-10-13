package com.ssafy.b204.chain;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.ssafy.b204.chain.entity.ChainJob;
import com.ssafy.b204.chain.repository.ChainJobRepository;
import com.ssafy.b204.chain.service.ChainJobConfirmationService;
import com.ssafy.b204.chain.service.TxReceipt;
import com.ssafy.b204.chain.worker.ChainJobStateWriter;
import com.ssafy.b204.common.config.RedisConfig;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.support.IntegrationTestBase;
import com.ssafy.b204.wallet.entity.Wallet;
import com.ssafy.b204.wallet.repository.WalletRepository;
import com.ssafy.b204.wallet.service.WalletBalanceCache;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 확정(receipt) 경로 펜싱 — 두 인스턴스가 같은 SUBMITTED job 을 동시에 확정해도 <b>도메인 전이는
 * 한 번</b>이다(S15P21B204-119).
 *
 * <p><b>클래스에 {@code @Transactional} 을 두지 않는다.</b> 테스트 트랜잭션 하나에 두 스레드를 넣으면
 * 잠금 경합 자체가 사라져 운영 결함을 가린다(!98 에서 실제로 그랬다). 실제 빈 · 실제 트랜잭션 경계로
 * 돌고, 커밋된 행은 {@link #cleanUp()} 이 지운다.
 *
 * <p><b>tx_type 은 MINT 다.</b> 도메인 효과가 잔액 캐시(Redis) 조정 한 가지라 관찰이 결정적이고,
 * Redis 쓰기는 트랜잭션 롤백으로도 되돌아가지 않아 "두 번 돌았는가" 가 그대로 남는다. 픽스처도
 * 회원·지갑 두 행이면 된다(PURCHASE 는 공연·주문·결제·재고까지 필요하다).
 */
class ChainJobConfirmFencingTest extends IntegrationTestBase {

    private static final long INITIAL_BALANCE = 1_000L;
    private static final long MINT_AMOUNT = 500L;
    private static final String TX_HASH = "0x" + "ab".repeat(32);

    @Autowired
    private ChainJobRepository chainJobRepository;

    @Autowired
    private ChainJobConfirmationService confirmations;

    @Autowired
    private ChainJobStateWriter stateWriter;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private WalletRepository walletRepository;

    @Autowired
    private WalletBalanceCache balanceCache;

    @Autowired
    private StringRedisTemplate redis;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private PlatformTransactionManager transactionManager;

    private Long memberId;
    private Long walletId;
    private Long jobId;

    @AfterEach
    void cleanUp() {
        if (jobId != null) {
            jdbc.update("DELETE FROM chain_job WHERE chain_job_id = ?", jobId);
        }
        if (walletId != null) {
            redis.opsForHash().delete(RedisConfig.KEY_WALLET_BALANCE, String.valueOf(walletId));
            jdbc.update("DELETE FROM wallet WHERE wallet_id = ?", walletId);
        }
        if (memberId != null) {
            jdbc.update("DELETE FROM member WHERE member_id = ?", memberId);
        }
    }

    /**
     * A 가 job 을 확정하고 <b>커밋하지 않은 채</b> 멈춘 사이 B 가 같은 receipt 로 확정을 시도한다.
     *
     * <p>B 는 A 커밋 <b>전에</b> 같은 행을 일반 읽기로 한 번 본다 — REPEATABLE READ 의 읽기 스냅숏이
     * 그때 만들어져, 이후 일반 읽기는 계속 {@code SUBMITTED} 를 본다. 그래도 확정 서비스의 잠금
     * 읽기는 A 커밋까지 기다렸다가 <b>최신 커밋({@code CONFIRMED})</b>을 읽어야 한다. 잠금 없는
     * {@code findById} 로 되돌리면 B 는 기다리지 않고 스냅숏의 {@code SUBMITTED} 를 보고 잔액을 한 번
     * 더 올린다.
     */
    @Test
    @DisplayName("두 인스턴스가 같은 SUBMITTED job 을 동시에 확정해도 잔액 조정은 한 번만 반영된다")
    void concurrentConfirmAppliesDomainTransitionOnce() throws Exception {
        submittedMintJob();
        TxReceipt receipt = new TxReceipt(TX_HASH, true, null, null, 1L, List.of());

        CountDownLatch aConfirmed = new CountDownLatch(1);
        CountDownLatch releaseA = new CountDownLatch(1);
        CountDownLatch bSnapshotTaken = new CountDownLatch(1);
        AtomicReference<String> bSnapshotStatus = new AtomicReference<>();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<ChainJobConfirmationService.Result> a = pool.submit(() ->
                    new TransactionTemplate(transactionManager).execute(status -> {
                        ChainJobConfirmationService.Result result = confirmations.confirm(jobId, receipt);
                        aConfirmed.countDown();
                        awaitQuietly(releaseA);
                        return result;
                    }));
            assertThat(aConfirmed.await(10, TimeUnit.SECONDS)).as("A 가 확정까지 가지 못했다").isTrue();

            Future<ChainJobConfirmationService.Result> b = pool.submit(() ->
                    new TransactionTemplate(transactionManager).execute(status -> {
                        bSnapshotStatus.set(jdbc.queryForObject(
                                "SELECT status FROM chain_job WHERE chain_job_id = ?", String.class, jobId));
                        bSnapshotTaken.countDown();
                        return confirmations.confirm(jobId, receipt);
                    }));
            assertThat(bSnapshotTaken.await(10, TimeUnit.SECONDS)).isTrue();
            // B 가 잠금 앞에 설 시간을 준다. 잠금이 없으면 B 는 이 사이에 끝난다.
            Thread.sleep(500);
            boolean bFinishedBeforeACommit = b.isDone();
            releaseA.countDown();

            assertThat(a.get(10, TimeUnit.SECONDS).confirmed()).isTrue();
            assertThat(b.get(10, TimeUnit.SECONDS).confirmed()).isTrue();

            assertThat(balanceCache.get(walletId))
                    .as("MINT 도메인 전이(잔액 조정)가 한 번만 반영돼야 한다")
                    .map(WalletBalanceCache.CachedBalance::balance)
                    .contains(INITIAL_BALANCE + MINT_AMOUNT);
            assertThat(jdbc.queryForObject("SELECT status FROM chain_job WHERE chain_job_id = ?",
                    String.class, jobId)).isEqualTo("CONFIRMED");
            // B 의 스냅숏은 A 커밋 전에 만들어졌다 — 그런데도 중복 확정을 안 했다 = 잠금 읽기가 최신을 봤다.
            assertThat(bSnapshotStatus.get()).isEqualTo("SUBMITTED");
            assertThat(bFinishedBeforeACommit).as("B 가 A 커밋 전에 끝났다 — 행 잠금을 기다리지 않았다")
                    .isFalse();
        } finally {
            releaseA.countDown();
            pool.shutdownNow();
            pool.awaitTermination(10, TimeUnit.SECONDS);
        }
    }

    /**
     * 확정 <b>밖</b>의 상태 쓰기(타임아웃·유실·재시도 소진의 {@code markFailed})가 확정 커밋을 덮지
     * 않는다.
     *
     * <p>A 가 확정하고 커밋 대기 중에 B 가 같은 job 을 {@code FAILED} 로 적으려 한다. 잠금 없는
     * {@code findById} 면 B 는 스냅숏의 {@code SUBMITTED} 를 보고 UPDATE 에서 A 커밋을 기다렸다가
     * {@code status=FAILED} 로 덮는다 — 티켓·잔액은 반영됐는데 job 은 실패로 보인다.
     */
    @Test
    @DisplayName("확정 커밋을 기다리던 markFailed 는 CONFIRMED 를 FAILED 로 덮지 않는다")
    void markFailedDoesNotOverwriteConcurrentConfirm() throws Exception {
        submittedMintJob();
        TxReceipt receipt = new TxReceipt(TX_HASH, true, null, null, 1L, List.of());

        CountDownLatch aConfirmed = new CountDownLatch(1);
        CountDownLatch releaseA = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<ChainJobConfirmationService.Result> a = pool.submit(() ->
                    new TransactionTemplate(transactionManager).execute(status -> {
                        ChainJobConfirmationService.Result result = confirmations.confirm(jobId, receipt);
                        aConfirmed.countDown();
                        awaitQuietly(releaseA);
                        return result;
                    }));
            assertThat(aConfirmed.await(10, TimeUnit.SECONDS)).as("A 가 확정까지 가지 못했다").isTrue();

            // 워커 경로 그대로 — 트랜잭션 없는 스레드에서 부르고 writer 가 REQUIRES_NEW 를 연다.
            Future<?> b = pool.submit(() -> stateWriter.markFailed(jobId, "CHAIN_TX_TIMEOUT"));
            Thread.sleep(500);
            boolean bFinishedBeforeACommit = b.isDone();
            releaseA.countDown();

            assertThat(a.get(10, TimeUnit.SECONDS).confirmed()).isTrue();
            b.get(10, TimeUnit.SECONDS);

            assertThat(jdbc.queryForObject("SELECT status FROM chain_job WHERE chain_job_id = ?",
                    String.class, jobId)).as("확정 커밋이 FAILED 로 덮였다").isEqualTo("CONFIRMED");
            assertThat(bFinishedBeforeACommit).as("B 가 A 커밋 전에 끝났다 — 행 잠금을 기다리지 않았다")
                    .isFalse();
        } finally {
            releaseA.countDown();
            pool.shutdownNow();
            pool.awaitTermination(10, TimeUnit.SECONDS);
        }
    }

    /**
     * D-70(리허설 2) — {@code DEPOSIT_RETURN}이 tx_type switch 의 {@code default}로 떨어져 정상 tx
     * 마다 "이 카드가 다루지 않는 tx_type 이다" WARN 이 남았다. 상태 전이
     * ({@code performance.deposit_status PAID → RETURNED})는
     * {@code SettlementConfirmationService.applyDepositReturn}의 몫이므로 여기서는 확정만 하면
     * 되지만, 그 "하지 않음"이 <b>의도</b>인지 <b>누락</b>인지를 로그가 구분하지 못하면 리허설에서
     * 사람이 WARN 을 쫓는다.
     *
     * <p>공연·정산 픽스처 없이 job 하나로 확인한다 — 검사 대상은 switch 분기이고, 도메인 전이는
     * 이 경로에 없는 것이 정답이다.
     */
    @Test
    @DisplayName("DEPOSIT_RETURN 확정은 WARN 없이 확정만 한다 — 상태 전이는 정산 쪽 몫")
    void depositReturnConfirmsWithoutUnknownTxTypeWarning() {
        submittedDepositReturnJob();
        Logger serviceLogger = (Logger) LoggerFactory.getLogger(ChainJobConfirmationService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        serviceLogger.addAppender(appender);
        try {
            ChainJobConfirmationService.Result result = confirmations.confirm(jobId,
                    new TxReceipt(TX_HASH, true, null, null, 1L, List.of()));

            assertThat(result.confirmed()).as("성공 receipt 를 실패로 고정하지 않는다").isTrue();
            assertThat(result.failureReason()).isNull();
            assertThat(result.issuedTicketIds()).isEmpty();
            assertThat(jdbc.queryForObject("SELECT status FROM chain_job WHERE chain_job_id = ?",
                    String.class, jobId)).isEqualTo("CONFIRMED");
            assertThat(appender.list)
                    .as("default 로 떨어지면 정상 tx 마다 WARN 이 남는다")
                    .noneMatch(event -> event.getLevel() == Level.WARN
                            && event.getFormattedMessage().contains("다루지 않는 tx_type"));
        } finally {
            serviceLogger.detachAppender(appender);
            appender.stop();
        }
    }

    /**
     * 보증금 반환은 OPERATOR tx 다 — 발신 지갑 대조가 없어 회원·지갑 픽스처가 필요하지 않다.
     * {@code target_performance_id}는 비워 둔다(V1 에 공연 FK 가 있고, 이 경로는 그 값을 읽지 않는다).
     */
    private void submittedDepositReturnJob() {
        ChainJob job = ChainJob.builder()
                .txType(ChainJob.TxType.DEPOSIT_RETURN)
                .signerType(ChainJob.SignerType.OPERATOR)
                .amount(50_000L)
                .idempotencyKey("fence-test-deposit-return-" + UUID.randomUUID())
                .build();
        job.markSubmitted(TX_HASH);
        jobId = chainJobRepository.save(job).getChainJobId();
    }

    private void submittedMintJob() {
        Member member = memberRepository.save(Member.builder()
                .email("fence-" + UUID.randomUUID() + "@b204.test")
                .name("Alex Kim")
                .authProvider(Member.AuthProvider.GOOGLE)
                .providerUserId(UUID.randomUUID().toString())
                .countryCode("KR")
                .build());
        memberId = member.getMemberId();
        String hex = (UUID.randomUUID().toString() + UUID.randomUUID()).replace("-", "");
        Wallet wallet = walletRepository.save(Wallet.builder()
                .member(member)
                .provider(Wallet.Provider.EXTERNAL)
                .address("0x" + hex.substring(0, 40))
                .build());
        walletId = wallet.getWalletId();

        ChainJob job = ChainJob.builder()
                .txType(ChainJob.TxType.MINT)
                .signerType(ChainJob.SignerType.OPERATOR)
                .walletId(walletId)
                .amount(MINT_AMOUNT)
                .idempotencyKey("fence-test-" + UUID.randomUUID())
                .build();
        job.markSubmitted(TX_HASH);
        jobId = chainJobRepository.save(job).getChainJobId();
        balanceCache.put(walletId, INITIAL_BALANCE);
    }

    private static void awaitQuietly(CountDownLatch latch) {
        try {
            if (!latch.await(30, TimeUnit.SECONDS)) {
                throw new IllegalStateException("A 해제 신호가 오지 않았다");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }
}
