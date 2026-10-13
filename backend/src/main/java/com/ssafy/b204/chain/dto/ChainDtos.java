package com.ssafy.b204.chain.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/**
 * chain 도메인 DTO — API v6 §0.3·§0.4·§8(API-chain-01).
 *
 * <p>여기 있는 타입은 <b>여러 도메인이 함께 쓴다</b> — 202 응답과 서명 요청 규약이 공통이기
 * 때문이다. payment·performance(보증금)·rule(동의)·settlement·coin·refund가 모두 참조한다.
 */
public final class ChainDtos {

    private ChainDtos() {
    }

    /**
     * §0.3 비동기 트랜잭션 규약 — {@code 202 Accepted}의 공통 앞부분.
     *
     * <p>202를 내려주는 모든 API가 이 세 필드로 시작하고, 폴링 대상은
     * <b>{@code GET /api/v1/chain/jobs/{jobId}} 하나</b>다.
     *
     * <p>{@code jobId}는 {@code chain_*} 접두 문자열이다({@code chain_job} 단일 테이블).
     * {@code pollAfterMs} 기본 1500, 혼잡 시 서버가 늘려 내려준다.
     */
    public record JobAccepted(String jobId, String status, Integer pollAfterMs) {}

    /**
     * §0.4 사용자 서명 tx 규약 — {@code prepare} 응답의 서명 요청 1건.
     *
     * <p>프론트는 이 값을 Web3Auth 내장 프로바이더나 Kaia Wallet에 넘겨 <b>Kaia
     * {@code FeeDelegatedSmartContractExecution} 타입의 발신자 서명</b>을 받는다. 사용자가 지갑
     * 앱에서 주소로 직접 송금하는 흐름은 없다.
     *
     * <p>{@code feePayer}는 §0.7 비노출 규칙의 <b>유일한 예외</b>다 — "수수료를 서비스가 낸다"는
     * 사실을 서명 화면에서 확인해야 하므로 운영지갑 주소를 노출한다.
     *
     * <p>{@code required}가 {@code false}면 건너뛸 수 있다(예: allowance가 이미 충분한
     * {@code APPROVE}).
     */
    public record SignRequest(
            String kind,
            boolean required,
            String txType,
            String to,
            String data,
            String value,
            String chainId,
            String gas,
            String feePayer,
            /** 서명 화면에 그대로 띄우는 요약. {@code Accept-Language}에 따라 번역된다(§0.6). */
            Map<String, Object> summary
    ) {}

    /**
     * §0.4 {@code signed-tx} 공통 요청 본문 — {@code {kind, senderSignedRlp}}.
     *
     * <p>서버는 이 RLP를 디코드해 발신자를 복구하고, fee payer 서명을 붙여 전송한다.
     * 디코드·복구 실패는 {@code COMMON_VALIDATION_FAILED}(400)
     * (전용 코드 {@code PAYMENT_SIGNED_TX_INVALID} 제안은 §16.1).
     */
    public record SignedTxRequest(String kind, String senderSignedRlp) {}

    /**
     * {@code GET /api/v1/chain/jobs/{jobId}} — API-chain-01. 202를 받은 모든 흐름의 폴링 대상.
     *
     * <p>{@code verification}이 이 API의 요점이다 — 확정 판정을 {@code receiptStatus}만으로 하지
     * 않고 {@code to}·{@code from}·{@code event}·{@code args}를 모두 대조한 결과를 내려준다.
     * 하나라도 어긋나면 {@code mismatchFields}에 담긴다.
     */
    public record JobStatusResponse(
            String jobId,
            String txType,
            /** {@code MINT} job만 채워진다 — {@code SIGNUP}(가입 기본 지급) 또는 {@code ADMIN}. */
            String grantSource,
            String signerType,
            String issuerType,
            Boolean feeDelegated,
            String feePayerAddress,
            String status,
            String walletAddress,
            Long performanceId,
            Long orderId,
            Long amount,
            String currency,
            String txHash,
            String explorerUrl,
            Long blockNumber,
            Verification verification,
            Integer retryCount,
            /** 규격 §3의 code 문자열. 체인 revert 원문을 넣지 않는다(SEC-09). */
            String failureReason,
            Boolean retryable,
            /** 부분 성공(정산 이체 일부 실패)의 건별 결과. 없으면 {@code null}. */
            List<Map<String, Object>> results,
            Integer pollAfterMs,
            OffsetDateTime submittedAt,
            OffsetDateTime confirmedAt
    ) {}

    /** receipt 검증 결과. {@code status}만 보지 않는다 — 이벤트·인자까지 대조한다. */
    public record Verification(
            boolean verified,
            String expectedEvent,
            Map<String, Boolean> checks,
            List<String> mismatchFields
    ) {}
}
