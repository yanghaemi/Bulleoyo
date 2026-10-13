package com.ssafy.b204.chain.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * chain_job 워커 설정 — API v6 §0.3·§0.4의 수치를 코드가 아니라 설정으로 들고 있는다.
 *
 * <p>{@code b204.chain.worker.*}는 {@link com.ssafy.b204.common.config.ChainProperties}
 * ({@code b204.chain}) 아래에 있지만 그 record에는 없는 키다. {@code @ConfigurationProperties}는
 * 기본이 {@code ignoreUnknownFields=true}라 서로 간섭하지 않는다 — 대신 <b>ChainProperties에
 * {@code ignoreUnknownFields=false}를 붙이면 이 클래스가 기동을 깨뜨린다.</b>
 *
 * <p>기본값의 근거
 *
 * <ul>
 *   <li>{@code enabled} — 테스트에서 끄기 위한 스위치. 단위 테스트가 도는 중에 스케줄러가
 *       DB·노드를 건드리면 테스트가 서로 간섭한다. {@code application-test.yml}이 {@code false}다.
 *   <li>{@code receiptTimeoutSeconds} 120 — §0.3 "USER job은 receipt 재조회만 반복(최대 120초,
 *       이후 FAILED)". <b>SUBMITTED job 에는 두 번 쓰인다</b>(S15P21B204-76): 이 시간이 지나야
 *       노드에 tx 가 살아 있는지 묻기 시작하고, 노드가 tx 를 모르는 상태가 <b>다시 이만큼</b>
 *       이어져야 FAILED 다. 노드에 살아 있으면 시한과 무관하게 SUBMITTED 로 두고 계속 본다.
 *       PENDING USER job(전송 전)은 종전대로 이 시간이 지나면 FAILED 다.
 *   <li>{@code maxRetry} 3 — §0.3 "OPERATOR job은 최대 3회 자동 재시도"(비기능 REL-09).
 *   <li>{@code batchSize} 20 — 한 주기에 집어가는 최대 건수. 지갑당 스레드가 1개라 큐가 길어져도
 *       nonce 순서는 유지되지만, 한 번에 다 읽어 메모리에 얹을 이유는 없다.
 * </ul>
 */
@ConfigurationProperties(prefix = "b204.chain.worker")
public record ChainWorkerProperties(
        Boolean enabled,
        Long pollIntervalMs,
        Long receiptPollIntervalMs,
        Integer receiptTimeoutSeconds,
        Integer maxRetry,
        Integer batchSize
) {

    public ChainWorkerProperties {
        enabled = enabled == null || enabled;
        pollIntervalMs = pollIntervalMs == null ? 1000L : pollIntervalMs;
        receiptPollIntervalMs = receiptPollIntervalMs == null ? 1500L : receiptPollIntervalMs;
        receiptTimeoutSeconds = receiptTimeoutSeconds == null ? 120 : receiptTimeoutSeconds;
        maxRetry = maxRetry == null ? 3 : maxRetry;
        batchSize = batchSize == null ? 20 : batchSize;
    }
}
