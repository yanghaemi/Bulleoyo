package com.ssafy.b204.chain.worker;

import com.ssafy.b204.chain.config.ChainWallet;
import java.util.EnumMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.stereotype.Component;

/**
 * 지갑별 <b>단일 nonce 직렬 큐</b> — API v6 §0.3.
 *
 * <blockquote>OPERATOR·MINTER 각 지갑의 tx는 지갑별 단일 nonce 직렬 큐로 처리한다.
 * 큐 직렬화 실패는 {@code CHAIN_NONCE_CONFLICT}.</blockquote>
 *
 * <p><b>지갑당 스레드 1개.</b> 같은 지갑의 tx를 병렬로 보내면 두 스레드가 같은 nonce를 읽어 하나가
 * 거절된다. 스레드를 하나로 묶으면 "nonce 조회 → 서명 → 전송"이 통째로 직렬화돼 락이 필요 없다.
 * OPERATOR와 MINTER는 <b>서로 다른 계정</b>이라 nonce 공간이 분리돼 있으므로 병렬로 돌아도 된다.
 *
 * <p>메시지 큐·ShedLock을 쓰지 않는 이유: 인스턴스가 하나다(b204-stack). 인스턴스가 늘어나는 순간
 * 이 클래스로는 부족해지고 그때는 DB 비관적 락이나 리더 선출이 필요하다 — 지금 미리 만들지 않는다.
 *
 * <p>큐 길이를 제한하지 않는다. 작업 소스가 {@code chain_job} 테이블이고 워커가 한 주기에 집어가는
 * 건수({@code batchSize})로 이미 상한이 걸려 있다.
 */
@Component
@Slf4j
public class ChainWalletQueue implements DisposableBean {

    private final Map<ChainWallet, ExecutorService> executors = new EnumMap<>(ChainWallet.class);

    public ChainWalletQueue() {
        for (ChainWallet wallet : ChainWallet.values()) {
            executors.put(wallet, Executors.newSingleThreadExecutor(runnable -> {
                Thread thread = new Thread(runnable, "chain-" + wallet.name().toLowerCase());
                thread.setDaemon(true);
                return thread;
            }));
        }
    }

    /** 해당 지갑의 전용 스레드에서 순서대로 실행한다. 호출은 즉시 반환한다. */
    public void submit(ChainWallet wallet, Runnable task) {
        executors.get(wallet).execute(() -> {
            try {
                task.run();
            } catch (RuntimeException e) {
                // 큐 스레드가 예외로 죽으면 그 지갑의 모든 후속 작업이 멈춘다. 여기서 반드시 삼킨다.
                log.error("{} 큐 작업 실패", wallet, e);
            }
        });
    }

    @Override
    public void destroy() throws InterruptedException {
        for (Map.Entry<ChainWallet, ExecutorService> entry : executors.entrySet()) {
            ExecutorService executor = entry.getValue();
            executor.shutdown();
            // 전송 중인 tx가 있으면 잠깐 기다린다 — 서명까지 끝내고 안 보낸 상태로 죽는 것이 최악이다.
            if (!executor.awaitTermination(5, TimeUnit.SECONDS)) {
                log.warn("{} 큐가 5초 안에 끝나지 않아 강제 종료한다", entry.getKey());
                executor.shutdownNow();
            }
        }
    }
}
