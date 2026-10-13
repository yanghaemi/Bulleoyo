package com.ssafy.b204.refund.service;

import com.ssafy.b204.chain.worker.ChainOwnership;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 환불 도메인의 주기 작업 — 지금은 자가 치유 스윕 하나다.
 *
 * <p><b>이 메서드에 {@code @Transactional} 을 붙이지 않는다.</b> 스케줄러는 주기만 정하고, 쓰기는
 * 서비스가 자기 트랜잭션을 연다. 2026-09-10 리허설에서 {@code SettlementScheduler} 에
 * {@code @Transactional(readOnly = true)} 가 붙어 있어 안에서 부른 쓰기가
 * {@code Connection is read-only} 로 거부됐다 — 같은 실수를 반복하지 않는다.
 *
 * <p>{@code @Profile("!test")} — 테스트는 스윕 메서드를 직접 부른다. 주기 실행이 테스트 트랜잭션과
 * 엉키면 무엇이 무엇을 바꿨는지 읽을 수 없다.
 */
@Slf4j
@Component
@Profile("!test")
@RequiredArgsConstructor
public class RefundScheduler {

    private final ChainOwnership ownership;
    private final RefundService refundService;

    /**
     * {@code chain_job} 은 닫혔는데 {@code refund} 가 {@code PROCESSING} 으로 남은 행을 닫는다.
     *
     * <p>온체인 tx 를 만들지 않으므로 소유권 가드가 정합성에 필요하지는 않다. 두 인스턴스가 같이
     * 돌면 같은 행을 두 번 {@code FAILED} 로 쓸 뿐이다. 그래도 로그가 두 줄씩 쌓이는 것을 막으려고
     * 다른 주기 작업과 같은 가드를 둔다(S15P21B204-95).
     */
    @Scheduled(fixedDelayString = "PT60S")
    public void failRefundsWithClosedJobs() {
        if (!ownership.isOwner()) {
            return;
        }
        try {
            int closed = refundService.failRefundsWithClosedJobs();
            if (closed > 0) {
                log.info("환불 자가 치유 스윕 — {}건을 FAILED 로 닫았다", closed);
            }
        } catch (RuntimeException e) {
            // 여기서 튀어나가면 다음 주기가 아니라 스케줄러 자체가 멈출 수 있다.
            log.error("환불 자가 치유 스윕 실패 — 다음 주기에 다시 돈다: {}", e.toString());
        }
    }
}
