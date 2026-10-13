package com.ssafy.b204.chain.support;

import java.util.Optional;

/**
 * {@code chain_job} 식별자 표기 — API v6 §0.3.
 *
 * <blockquote>{@code jobId} — 작업 식별자. {@code chain_*} 하나로 통일한다
 * ({@code chain_job} 단일 테이블).</blockquote>
 *
 * <p>202를 내려주는 모든 API가 이 문자열을 주고, 폴링은 {@code GET /api/v1/chain/jobs/{jobId}}
 * 하나로 모인다. 접두를 붙이는 이유는 클라이언트가 다른 도메인의 숫자 id와 섞지 못하게 하기
 * 위해서다 — 명세 예시({@code chain_01J9G1A2B3})의 뒷자리는 ULID지만 우리 PK는 {@code BIGINT}라
 * 숫자를 그대로 쓴다. 형식은 "문자열"이라는 것만 계약이다.
 *
 * <p>API-wallet-02의 {@code walletTxId}는 {@code job_{id}}다 — {@code WalletTx} 뷰의 행 식별자이지
 * 폴링 대상 {@code jobId}가 아니므로 접두를 구분한다(명세 예시 {@code "job_9901"}).
 */
public final class ChainJobIds {

    /** §0.3 — 폴링 대상 식별자 접두. */
    public static final String JOB_PREFIX = "chain_";

    /** API-wallet-02 {@code walletTxId} 접두. */
    public static final String WALLET_TX_PREFIX = "job_";

    private ChainJobIds() {
    }

    public static String toJobId(Long chainJobId) {
        return chainJobId == null ? null : JOB_PREFIX + chainJobId;
    }

    public static String toWalletTxId(Long chainJobId) {
        return chainJobId == null ? null : WALLET_TX_PREFIX + chainJobId;
    }

    /** 경로 변수의 {@code jobId}를 PK로 되돌린다. 형식이 아니면 비어 있다(404로 이어진다). */
    public static Optional<Long> parseJobId(String jobId) {
        if (jobId == null || !jobId.startsWith(JOB_PREFIX)) {
            return Optional.empty();
        }
        try {
            return Optional.of(Long.parseLong(jobId.substring(JOB_PREFIX.length())));
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }
}
