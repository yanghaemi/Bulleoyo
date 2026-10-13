package com.ssafy.b204.chain.metrics;

import com.ssafy.b204.chain.config.ChainWallet;
import com.ssafy.b204.chain.entity.ChainJob;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.Duration;
import java.util.EnumMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.stereotype.Component;

/**
 * chain 모듈 커스텀 지표 — 이름은 <b>Grafana 패널이 참조하므로 바꾸지 않는다</b>(b204-stack).
 *
 * <table>
 *   <tr><th>이름</th><th>타입</th><th>태그</th></tr>
 *   <tr><td>{@code b204_chain_job_count}</td><td>Gauge</td><td>{@code status}·{@code signer_type}</td></tr>
 *   <tr><td>{@code b204_chain_job_failed_total}</td><td>Counter</td><td>{@code type}·{@code reason}</td></tr>
 *   <tr><td>{@code b204_chain_tx_seconds}</td><td>Timer</td><td>{@code type}</td></tr>
 *   <tr><td>{@code b204_operator_kaia_balance}</td><td>Gauge</td><td>{@code wallet}</td></tr>
 * </table>
 *
 * <p>Gauge는 <b>스크레이프 시점에 DB를 때리지 않는다.</b> 워커가 주기적으로 밀어 넣은
 * {@link AtomicLong}을 읽는다 — Prometheus 스크레이프가 늘어날 때마다 쿼리가 늘어나면 안 된다.
 *
 * <p>{@code b204_operator_kaia_balance}는 <b>KAIA 단위 소수</b>다(peb가 아니다). 파우셋 시점 판단이
 * 목적이라 사람이 읽는 단위여야 하고, peb는 {@code double}로 담을 수 없다.
 */
@Component
public class ChainMetrics {

    private static final BigDecimal PEB = new BigDecimal("1000000000000000000");

    private final MeterRegistry registry;
    private final Map<ChainJob.Status, Map<ChainJob.SignerType, AtomicLong>> jobCounts =
            new EnumMap<>(ChainJob.Status.class);
    private final Map<ChainWallet, AtomicLong> walletBalanceMilliKaia = new EnumMap<>(ChainWallet.class);

    public ChainMetrics(MeterRegistry registry) {
        this.registry = registry;
        // 모든 조합을 미리 등록한다 — 건수가 0 이 된 조합도 시계열이 남아 0 을 보여야 한다.
        for (ChainJob.Status status : ChainJob.Status.values()) {
            Map<ChainJob.SignerType, AtomicLong> bySigner = new EnumMap<>(ChainJob.SignerType.class);
            jobCounts.put(status, bySigner);
            for (ChainJob.SignerType signerType : ChainJob.SignerType.values()) {
                AtomicLong holder = new AtomicLong();
                bySigner.put(signerType, holder);
                Gauge.builder("b204_chain_job_count", holder, AtomicLong::doubleValue)
                        .tag("status", status.name())
                        .tag("signer_type", signerType.name())
                        .description("상태·서명 주체별 chain_job 건수")
                        .register(registry);
            }
        }
        for (ChainWallet wallet : ChainWallet.values()) {
            AtomicLong holder = new AtomicLong();
            walletBalanceMilliKaia.put(wallet, holder);
            // 밀리KAIA로 담고 1000으로 나눠 노출한다 — double 정밀도 손실을 피하면서 소수를 보여준다.
            Gauge.builder("b204_operator_kaia_balance", holder, value -> value.doubleValue() / 1000d)
                    .tag("wallet", wallet.name())
                    .description("운영 지갑 KAIA 잔액")
                    .register(registry);
        }
    }

    public void updateJobCount(ChainJob.Status status, ChainJob.SignerType signerType, long count) {
        jobCounts.get(status).get(signerType).set(count);
    }

    public void updateWalletBalance(ChainWallet wallet, BigInteger peb) {
        walletBalanceMilliKaia.get(wallet).set(
                new BigDecimal(peb).multiply(BigDecimal.valueOf(1000)).divide(PEB, 0, java.math.RoundingMode.DOWN)
                        .longValue());
    }

    /** @param reason 규격 코드 문자열. revert selector 접미는 붙이지 않는다(카디널리티 폭발 방지) */
    public void recordFailure(ChainJob.TxType txType, String reason) {
        registry.counter("b204_chain_job_failed_total",
                "type", txType == null ? "UNKNOWN" : txType.name(),
                "reason", reason).increment();
    }

    /** 전송 → receipt 확정까지 걸린 시간. */
    public void recordTxDuration(ChainJob.TxType txType, Duration duration) {
        Timer.builder("b204_chain_tx_seconds")
                .tag("type", txType == null ? "UNKNOWN" : txType.name())
                .description("전송에서 receipt 확정까지 소요 시간")
                .register(registry)
                .record(duration);
    }
}
